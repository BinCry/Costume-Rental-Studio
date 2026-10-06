import { afterEach, describe, expect, it, vi } from 'vitest';

process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = 'postgresql://postgres:postgres@localhost:5432/test';

interface MailMessage {
  from: { name: string; address: string };
  to: string;
  subject: string;
  text: string;
  html: string;
}

const mailMocks = vi.hoisted(() => ({
  createTransport: vi.fn(),
  sendMail: vi.fn<(message: MailMessage) => Promise<{ messageId: string }>>(),
}));

vi.mock('nodemailer', () => ({
  default: {
    createTransport: mailMocks.createTransport,
  },
}));

const { env } = await import('../src/config/env.js');
const { assertEmailOtpDeliveryAvailable, deliverEmailOtp } =
  await import('../src/modules/auth/registration/otp.delivery.js');

const original = {
  mode: env.OTP_DELIVERY_MODE,
  nodeEnvironment: env.NODE_ENV,
  host: env.SMTP_HOST,
  port: env.SMTP_PORT,
  secure: env.SMTP_SECURE,
  user: env.SMTP_USER,
  password: env.SMTP_PASSWORD,
  fromName: env.MAIL_FROM_NAME,
  fromAddress: env.MAIL_FROM_ADDRESS,
};

afterEach(() => {
  env.OTP_DELIVERY_MODE = original.mode;
  env.NODE_ENV = original.nodeEnvironment;
  env.SMTP_HOST = original.host;
  env.SMTP_PORT = original.port;
  env.SMTP_SECURE = original.secure;
  env.SMTP_USER = original.user;
  env.SMTP_PASSWORD = original.password;
  env.MAIL_FROM_NAME = original.fromName;
  env.MAIL_FROM_ADDRESS = original.fromAddress;
  vi.restoreAllMocks();
});

describe('email OTP delivery safety', () => {
  it('refuses console delivery outside local development without logging code', async () => {
    env.NODE_ENV = 'production';
    env.OTP_DELIVERY_MODE = 'console';
    const log = vi.spyOn(console, 'info').mockImplementation(() => undefined);

    await expect(deliverEmailOtp('customer@example.com', '123456', 'registration')).rejects.toThrow(
      'Email delivery is not configured',
    );
    expect(log).not.toHaveBeenCalled();
  });

  it('refuses disabled delivery', () => {
    env.NODE_ENV = 'development';
    env.OTP_DELIVERY_MODE = 'disabled';
    expect(assertEmailOtpDeliveryAvailable).toThrow('Email delivery is not configured');
  });

  it('allows explicitly enabled local development delivery and includes purpose', async () => {
    env.NODE_ENV = 'development';
    env.OTP_DELIVERY_MODE = 'console';
    const log = vi.spyOn(console, 'info').mockImplementation(() => undefined);

    await deliverEmailOtp('customer@example.com', '123456', 'password-reset');

    expect(log).toHaveBeenCalledWith(
      '[LOCAL DEVELOPMENT PASSWORD-RESET OTP] customer@example.com: 123456',
    );
  });

  it('sends an OTP through the configured SMTP transporter', async () => {
    env.OTP_DELIVERY_MODE = 'smtp';
    env.SMTP_HOST = 'smtp.example.com';
    env.SMTP_PORT = 465;
    env.SMTP_SECURE = true;
    env.SMTP_USER = 'mailer@example.com';
    env.SMTP_PASSWORD = 'smtp-secret';
    env.MAIL_FROM_NAME = 'Costume Rental Studio';
    env.MAIL_FROM_ADDRESS = 'no-reply@example.com';
    mailMocks.createTransport.mockReturnValue({ sendMail: mailMocks.sendMail });
    mailMocks.sendMail.mockResolvedValue({ messageId: 'message-id' });

    await deliverEmailOtp('customer@example.com', '123456', 'email-change');

    expect(mailMocks.createTransport).toHaveBeenCalledWith(
      expect.objectContaining({
        host: 'smtp.example.com',
        port: 465,
        secure: true,
        auth: { user: 'mailer@example.com', pass: 'smtp-secret' },
      }),
    );
    const message = mailMocks.sendMail.mock.calls[0]?.[0];
    expect(message).toMatchObject({
      from: { name: 'Costume Rental Studio', address: 'no-reply@example.com' },
      to: 'customer@example.com',
      subject: 'Mã xác thực địa chỉ email mới',
    });
    expect(message?.text).toContain('123456');
    expect(message?.html).toContain('123456');
  });
});
