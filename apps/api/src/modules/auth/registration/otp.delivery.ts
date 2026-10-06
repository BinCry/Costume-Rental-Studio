import nodemailer from 'nodemailer';

import { AppError } from '../../../common/errors/app-error.js';
import { env } from '../../../config/env.js';

type OtpPurpose = 'registration' | 'password-reset' | 'email-change';

const purposeContent: Record<OtpPurpose, { subject: string; heading: string }> = {
  registration: {
    subject: 'Mã xác thực đăng ký tài khoản',
    heading: 'Xác thực đăng ký tài khoản',
  },
  'password-reset': {
    subject: 'Mã xác thực khôi phục mật khẩu',
    heading: 'Khôi phục mật khẩu',
  },
  'email-change': {
    subject: 'Mã xác thực địa chỉ email mới',
    heading: 'Xác nhận địa chỉ email mới',
  },
};

function unavailable() {
  return new AppError(503, 'OTP_DELIVERY_UNAVAILABLE', 'Email delivery is not configured');
}

function smtpConfiguration() {
  const host = env.SMTP_HOST;
  const port = env.SMTP_PORT;
  const secure = env.SMTP_SECURE;
  const user = env.SMTP_USER;
  const pass = env.SMTP_PASSWORD;
  const fromName = env.MAIL_FROM_NAME;
  const fromAddress = env.MAIL_FROM_ADDRESS;

  if (
    !host ||
    port === undefined ||
    secure === undefined ||
    !user ||
    !pass ||
    !fromName ||
    !fromAddress
  ) {
    throw unavailable();
  }

  return { host, port, secure, user, pass, fromName, fromAddress };
}

let smtpTransporter: ReturnType<typeof nodemailer.createTransport> | undefined;

function transporter() {
  if (smtpTransporter) return smtpTransporter;
  const config = smtpConfiguration();
  smtpTransporter = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: { user: config.user, pass: config.pass },
    requireTLS: !config.secure,
    tls: { minVersion: 'TLSv1.2' },
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 15_000,
  });
  return smtpTransporter;
}

export function assertEmailOtpDeliveryAvailable() {
  if (env.OTP_DELIVERY_MODE === 'smtp') {
    smtpConfiguration();
    return;
  }
  if (env.OTP_DELIVERY_MODE === 'console' && env.NODE_ENV === 'development') return;
  throw unavailable();
}

export async function deliverEmailOtp(email: string, code: string, purpose: OtpPurpose) {
  assertEmailOtpDeliveryAvailable();

  // Explicit local development only; never expose OTP in HTTP responses or production logs.
  if (env.OTP_DELIVERY_MODE === 'console') {
    console.info(`[LOCAL DEVELOPMENT ${purpose.toUpperCase()} OTP] ${email}: ${code}`);
    return;
  }

  const config = smtpConfiguration();
  const content = purposeContent[purpose];
  await transporter().sendMail({
    from: { name: config.fromName, address: config.fromAddress },
    to: email,
    subject: content.subject,
    text: `${content.heading}\n\nMã xác thực của bạn là: ${code}\nMã sẽ hết hạn sau 5 phút.\n\nNếu bạn không yêu cầu thao tác này, hãy bỏ qua email.`,
    html: `
      <div style="font-family: Arial, sans-serif; color: #1f2937; line-height: 1.6">
        <h2>${content.heading}</h2>
        <p>Mã xác thực của bạn là:</p>
        <p style="font-size: 28px; font-weight: 700; letter-spacing: 6px">${code}</p>
        <p>Mã sẽ hết hạn sau 5 phút.</p>
        <p>Nếu bạn không yêu cầu thao tác này, hãy bỏ qua email.</p>
      </div>
    `,
  });
}
