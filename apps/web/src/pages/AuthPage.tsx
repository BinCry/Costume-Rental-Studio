import { useEffect, useRef, useState, type FormEvent } from 'react';
import {
  ApiClientError,
  apiEnabled,
  googleLoginUrl,
  login,
  registerCustomer,
  requestPasswordResetOtp,
  requestRegistrationOtp,
  resetPassword,
  verifyPasswordResetOtp,
} from '../api/client';
import { Button, Field } from '../components/ui';
import { pathFor, type Navigate } from '../app/routes';

type AuthMode = 'login' | 'register' | 'forgotPassword';
const googleNextKey = 'costume-rental.auth-next';
interface ApiIdentity {
  displayName: string;
  email: string;
  roles: { actorGroup: string }[];
}

const authErrorMessage = (error: unknown) => {
  if (!(error instanceof ApiClientError))
    return 'Đã xảy ra lỗi kết nối. Vui lòng kiểm tra mạng và thử lại.';
  const messages: Record<string, string> = {
    API_NOT_CONFIGURED: 'Trang xác thực chưa được kết nối với máy chủ.',
    INVALID_CREDENTIALS: 'Email hoặc mật khẩu chưa chính xác. Hãy kiểm tra lại thông tin.',
    OTP_COOLDOWN: 'Bạn vừa yêu cầu mã. Vui lòng đợi trước khi gửi mã mới.',
    INVALID_OTP: 'Mã không đúng hoặc đã hết hạn. Hãy kiểm tra email và thử lại.',
    OTP_DELIVERY_UNAVAILABLE: 'Chưa thể gửi email xác thực lúc này. Vui lòng thử lại sau.',
    AUTH_NOT_CONFIGURED: 'Dịch vụ xác thực chưa được cấu hình. Vui lòng liên hệ studio.',
    ACCOUNT_NOT_ELIGIBLE: 'Email này đã có tài khoản. Hãy đăng nhập hoặc khôi phục mật khẩu.',
    ACCOUNT_CONFLICT: 'Thông tin tài khoản vừa thay đổi. Hãy yêu cầu mã mới rồi thử lại.',
    AUTH_RATE_LIMITED: 'Bạn đã thử quá nhiều lần. Vui lòng đợi một lúc rồi thử lại.',
    INVALID_PASSWORD_RESET: 'Yêu cầu khôi phục đã hết hạn. Hãy bắt đầu lại.',
    UNTRUSTED_ORIGIN: 'Yêu cầu chưa được chấp nhận từ địa chỉ trang hiện tại.',
  };
  return messages[error.code] ?? 'Không thể hoàn tất yêu cầu. Vui lòng thử lại sau.';
};

export function AuthPage({
  mode,
  params,
  apiIdentity,
  go,
  onAuthenticated,
}: {
  mode: AuthMode;
  params: URLSearchParams;
  apiIdentity?: ApiIdentity;
  go: Navigate;
  onAuthenticated: (next?: string) => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [issue, setIssue] = useState('');
  const [notice, setNotice] = useState('');
  const callbackHandled = useRef(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [phone, setPhone] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [registrationStep, setRegistrationStep] = useState<'email' | 'details'>('email');
  const [registrationChallenge, setRegistrationChallenge] = useState('');
  const [registrationOtp, setRegistrationOtp] = useState('');
  const [resendSeconds, setResendSeconds] = useState(0);
  const [resetStep, setResetStep] = useState<'email' | 'otp' | 'password' | 'complete'>('email');
  const [resetChallenge, setResetChallenge] = useState('');
  const [resetOtp, setResetOtp] = useState('');
  const [resetToken, setResetToken] = useState('');
  const authNextParams = params.get('next') ? { next: params.get('next')! } : undefined;
  const goAuth = (screen: 'login' | 'register' | 'forgotPassword') => go(screen, authNextParams);
  const authHref = (screen: 'login' | 'register' | 'forgotPassword') =>
    pathFor(screen, authNextParams);
  const rememberGoogleNext = () => {
    const next = params.get('next');
    if (next) window.sessionStorage.setItem(googleNextKey, next);
    else window.sessionStorage.removeItem(googleNextKey);
  };

  useEffect(() => {
    if (resendSeconds <= 0) return;
    const timer = window.setTimeout(
      () => setResendSeconds((seconds) => Math.max(0, seconds - 1)),
      1000,
    );
    return () => window.clearTimeout(timer);
  }, [resendSeconds]);

  useEffect(() => {
    if (
      mode === 'login' &&
      params.get('status') === 'success' &&
      apiIdentity &&
      !callbackHandled.current
    ) {
      callbackHandled.current = true;
      const next = params.get('next') ?? window.sessionStorage.getItem(googleNextKey) ?? undefined;
      window.sessionStorage.removeItem(googleNextKey);
      void onAuthenticated(next).catch((error: unknown) => setIssue(authErrorMessage(error)));
    }
  }, [apiIdentity, mode, onAuthenticated, params]);

  const submitLogin = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setIssue('');
    setNotice('');
    try {
      await login(email.trim(), password);
      window.dispatchEvent(new Event('api-session-changed'));
      await onAuthenticated(params.get('next') ?? undefined);
    } catch (error) {
      setIssue(authErrorMessage(error));
    } finally {
      setBusy(false);
    }
  };

  const sendRegistrationCode = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setIssue('');
    setNotice('');
    try {
      const result = await requestRegistrationOtp(email.trim());
      setRegistrationChallenge(result.challengeId);
      setResendSeconds(result.retryAfter);
      setRegistrationStep('details');
      setNotice('Mã xác nhận có hiệu lực trong 5 phút. Hãy kiểm tra hộp thư đến và thư rác.');
    } catch (error) {
      setIssue(authErrorMessage(error));
    } finally {
      setBusy(false);
    }
  };

  const resendRegistrationCode = async () => {
    setBusy(true);
    setIssue('');
    setNotice('');
    try {
      const result = await requestRegistrationOtp(email.trim());
      setRegistrationChallenge(result.challengeId);
      setRegistrationOtp('');
      setResendSeconds(result.retryAfter);
      setNotice('Mã mới đã được gửi. Mã trước đó không còn dùng được.');
    } catch (error) {
      setIssue(authErrorMessage(error));
    } finally {
      setBusy(false);
    }
  };

  const finishRegistration = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIssue('');
    const compactPhone = phone.trim().replace(/[\s()-]/g, '');
    if (
      compactPhone &&
      !(
        /^0\d{9}$/.test(compactPhone) ||
        /^84\d{9}$/.test(compactPhone) ||
        /^\+[1-9]\d{7,14}$/.test(compactPhone)
      )
    ) {
      setIssue(
        'Số điện thoại chưa đúng. Dùng số Việt Nam 10 chữ số hoặc số quốc tế có mã quốc gia.',
      );
      return;
    }
    if (password !== confirmPassword) {
      setIssue('Mật khẩu xác nhận chưa khớp.');
      return;
    }
    setBusy(true);
    try {
      await registerCustomer({
        email: email.trim(),
        phone: phone.trim() || undefined,
        challengeId: registrationChallenge,
        otp: registrationOtp.trim(),
        displayName: displayName.trim(),
        password,
      });
      window.dispatchEvent(new Event('api-session-changed'));
      await onAuthenticated(params.get('next') ?? undefined);
    } catch (error) {
      setIssue(authErrorMessage(error));
    } finally {
      setBusy(false);
    }
  };

  const requestResetCode = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setIssue('');
    setNotice('');
    try {
      const result = await requestPasswordResetOtp(email.trim());
      setResetChallenge(result.challengeId);
      setResendSeconds(result.retryAfter);
      setResetStep('otp');
      setNotice('Nếu email đủ điều kiện khôi phục, mã xác nhận sẽ được gửi đến hộp thư của bạn.');
    } catch (error) {
      setIssue(authErrorMessage(error));
    } finally {
      setBusy(false);
    }
  };

  const resendResetCode = async () => {
    setBusy(true);
    setIssue('');
    setNotice('');
    try {
      const result = await requestPasswordResetOtp(email.trim());
      setResetChallenge(result.challengeId);
      setResetOtp('');
      setResendSeconds(result.retryAfter);
      setNotice('Nếu email đủ điều kiện khôi phục, mã xác nhận mới sẽ được gửi.');
    } catch (error) {
      setIssue(authErrorMessage(error));
    } finally {
      setBusy(false);
    }
  };

  const verifyResetCode = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setIssue('');
    try {
      const result = await verifyPasswordResetOtp(resetChallenge, resetOtp.trim());
      setResetToken(result.resetToken);
      setResetStep('password');
      setNotice('Mã đã được xác nhận. Hãy tạo mật khẩu mới trong vòng 10 phút.');
    } catch (error) {
      setIssue(authErrorMessage(error));
    } finally {
      setBusy(false);
    }
  };

  const finishReset = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIssue('');
    if (password !== confirmPassword) {
      setIssue('Mật khẩu xác nhận chưa khớp.');
      return;
    }
    setBusy(true);
    try {
      await resetPassword(resetToken, password);
      setResetStep('complete');
      setPassword('');
      setConfirmPassword('');
      setNotice('Mật khẩu đã được đổi. Bạn có thể đăng nhập bằng mật khẩu mới.');
    } catch (error) {
      setIssue(authErrorMessage(error));
    } finally {
      setBusy(false);
    }
  };

  const pageTitle =
    mode === 'login'
      ? 'Đăng nhập'
      : mode === 'register'
        ? 'Tạo tài khoản khách'
        : 'Khôi phục mật khẩu';
  const registerMode = mode === 'register';
  const recoveryMode = mode === 'forgotPassword';
  const disabled = !apiEnabled;

  return (
    <section className="auth-page" aria-labelledby="auth-title">
      <div className="auth-shell">
        <aside className="auth-visual" aria-label="Bộ sưu tập trang phục của studio">
          <img src="/images/lookbook-minh-hoa.png" alt="" />
          <div className="auth-visual-shade" />
          <div className="auth-visual-copy">
            <span className="auth-kicker">STUDIO TRANG PHỤC</span>
            <h2>Một bộ đồ đẹp. Một khoảnh khắc đáng nhớ.</h2>
            <p>Chọn trang phục bạn yêu thích, studio sẽ xác nhận lịch thuê cùng bạn.</p>
            <span className="auth-visual-caption">THUÊ TRANG PHỤC · ĐƠN GIẢN HƠN</span>
          </div>
        </aside>

        <div className="auth-content">
          <div className="auth-heading">
            <p className="eyebrow">TÀI KHOẢN STUDIO</p>
            <h1 id="auth-title">{pageTitle}</h1>
            <p>
              {mode === 'login'
                ? 'Theo dõi đơn thuê và tiếp tục hành trình chọn trang phục của bạn.'
                : registerMode
                  ? 'Tạo tài khoản để quản lý thông tin và các đơn thuê của bạn.'
                  : 'Xác minh email để đặt lại mật khẩu tài khoản.'}
            </p>
          </div>

          {!apiEnabled && (
            <div className="feedback feedback-warning auth-config-message" role="status">
              <div>
                <strong>Chưa kết nối dịch vụ tài khoản</strong>
                <p>Đăng nhập và đăng ký sẽ hoạt động khi website được nối với API.</p>
              </div>
            </div>
          )}

          {issue && (
            <div className="feedback feedback-danger auth-feedback" role="alert">
              {issue}
            </div>
          )}
          {notice && (
            <div className="feedback feedback-info auth-feedback" role="status">
              {notice}
            </div>
          )}

          {mode === 'login' && (
            <>
              {params.get('status') === 'error' && !issue && (
                <div className="feedback feedback-warning auth-feedback" role="status">
                  <div>
                    <strong>Chưa đăng nhập được bằng Google</strong>
                    <p>Phiên xác thực đã bị hủy hoặc hết hạn. Bạn có thể thử lại bằng email.</p>
                  </div>
                </div>
              )}
              <form className="auth-form" onSubmit={(event) => void submitLogin(event)}>
                <Field
                  label="Email"
                  type="email"
                  autoComplete="username"
                  inputMode="email"
                  placeholder="ten@email.com"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  required
                  disabled={disabled || busy}
                />
                <Field
                  label="Mật khẩu"
                  type="password"
                  autoComplete="current-password"
                  placeholder="Nhập mật khẩu"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  required
                  disabled={disabled || busy}
                />
                <div className="auth-form-meta">
                  <a
                    href={authHref('forgotPassword')}
                    onClick={(event) => {
                      event.preventDefault();
                      goAuth('forgotPassword');
                    }}
                  >
                    Quên mật khẩu?
                  </a>
                </div>
                <Button type="submit" loading={busy} disabled={disabled} className="auth-submit">
                  Đăng nhập
                </Button>
              </form>
              {apiEnabled && (
                <>
                  <div className="auth-divider">
                    <span>hoặc tiếp tục với</span>
                  </div>
                  <a
                    className="button button-secondary auth-google"
                    href={googleLoginUrl()}
                    onClick={rememberGoogleNext}
                  >
                    <span className="google-mark" aria-hidden="true">
                      G
                    </span>
                    Google
                  </a>
                </>
              )}
              <p className="auth-switch-copy">
                Chưa có tài khoản?{' '}
                <a
                  href={authHref('register')}
                  onClick={(event) => {
                    event.preventDefault();
                    goAuth('register');
                  }}
                >
                  Tạo tài khoản
                </a>
              </p>
            </>
          )}

          {registerMode && registrationStep === 'email' && (
            <>
              <form className="auth-form" onSubmit={(event) => void sendRegistrationCode(event)}>
                <Field
                  label="Email"
                  type="email"
                  autoComplete="email"
                  inputMode="email"
                  placeholder="ten@email.com"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  required
                  disabled={disabled || busy}
                />
                <p className="auth-help-copy">
                  Studio sẽ gửi mã 6 số đến email để xác nhận tài khoản.
                </p>
                <Button type="submit" loading={busy} disabled={disabled} className="auth-submit">
                  Gửi mã xác nhận
                </Button>
              </form>
              {apiEnabled && (
                <>
                  <div className="auth-divider">
                    <span>hoặc tiếp tục với</span>
                  </div>
                  <a
                    className="button button-secondary auth-google"
                    href={googleLoginUrl()}
                    onClick={rememberGoogleNext}
                  >
                    <span className="google-mark" aria-hidden="true">
                      G
                    </span>
                    Google
                  </a>
                </>
              )}
              <p className="auth-switch-copy">
                Đã có tài khoản?{' '}
                <a
                  href={authHref('login')}
                  onClick={(event) => {
                    event.preventDefault();
                    goAuth('login');
                  }}
                >
                  Đăng nhập
                </a>
              </p>
            </>
          )}

          {registerMode && registrationStep === 'details' && (
            <form className="auth-form" onSubmit={(event) => void finishRegistration(event)}>
              <div className="auth-verified-email">
                <span>Email nhận mã</span>
                <strong>{email}</strong>
                <button
                  type="button"
                  className="text-button"
                  onClick={() => {
                    setRegistrationStep('email');
                    setNotice('');
                    setIssue('');
                  }}
                >
                  Đổi email
                </button>
              </div>
              <Field
                label="Mã xác nhận"
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="[0-9]{6}"
                maxLength={6}
                placeholder="6 chữ số"
                value={registrationOtp}
                onChange={(event) =>
                  setRegistrationOtp(event.target.value.replace(/\D/g, '').slice(0, 6))
                }
                required
                disabled={busy}
              />
              <button
                type="button"
                className="text-button auth-resend"
                onClick={() => void resendRegistrationCode()}
                disabled={busy || resendSeconds > 0}
              >
                {resendSeconds > 0 ? `Gửi lại mã sau ${resendSeconds} giây` : 'Gửi lại mã'}
              </button>
              <Field
                label="Họ và tên"
                autoComplete="name"
                placeholder="Nguyễn Minh Anh"
                value={displayName}
                onChange={(event) => setDisplayName(event.target.value)}
                required
                disabled={busy}
              />
              <Field
                label="Số điện thoại (không bắt buộc)"
                type="tel"
                autoComplete="tel"
                placeholder="09xx xxx xxx"
                hint="Số Việt Nam 10 chữ số hoặc số quốc tế có mã quốc gia."
                value={phone}
                onChange={(event) => setPhone(event.target.value)}
                disabled={busy}
              />
              <Field
                label="Mật khẩu"
                type="password"
                autoComplete="new-password"
                minLength={12}
                maxLength={128}
                hint="Tối thiểu 12 ký tự."
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
                disabled={busy}
              />
              <Field
                label="Nhập lại mật khẩu"
                type="password"
                autoComplete="new-password"
                minLength={12}
                maxLength={128}
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                required
                disabled={busy}
              />
              <Button type="submit" loading={busy} disabled={busy} className="auth-submit">
                Tạo tài khoản
              </Button>
            </form>
          )}

          {recoveryMode && resetStep === 'email' && (
            <form className="auth-form" onSubmit={(event) => void requestResetCode(event)}>
              <Field
                label="Email tài khoản"
                type="email"
                autoComplete="username"
                inputMode="email"
                placeholder="ten@email.com"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
                disabled={disabled || busy}
              />
              <Button type="submit" loading={busy} disabled={disabled} className="auth-submit">
                Gửi mã khôi phục
              </Button>
            </form>
          )}

          {recoveryMode && resetStep === 'otp' && (
            <form className="auth-form" onSubmit={(event) => void verifyResetCode(event)}>
              <Field
                label="Mã xác nhận"
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="[0-9]{6}"
                maxLength={6}
                placeholder="6 chữ số"
                value={resetOtp}
                onChange={(event) => setResetOtp(event.target.value.replace(/\D/g, '').slice(0, 6))}
                required
                disabled={busy}
              />
              <button
                type="button"
                className="text-button auth-resend"
                onClick={() => void resendResetCode()}
                disabled={busy || resendSeconds > 0}
              >
                {resendSeconds > 0 ? `Gửi lại mã sau ${resendSeconds} giây` : 'Gửi lại mã'}
              </button>
              <Button type="submit" loading={busy} disabled={busy} className="auth-submit">
                Xác nhận mã
              </Button>
            </form>
          )}

          {recoveryMode && resetStep === 'password' && (
            <form className="auth-form" onSubmit={(event) => void finishReset(event)}>
              <Field
                label="Mật khẩu mới"
                type="password"
                autoComplete="new-password"
                minLength={12}
                maxLength={128}
                hint="Tối thiểu 12 ký tự."
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
                disabled={busy}
              />
              <Field
                label="Nhập lại mật khẩu mới"
                type="password"
                autoComplete="new-password"
                minLength={12}
                maxLength={128}
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                required
                disabled={busy}
              />
              <Button type="submit" loading={busy} disabled={busy} className="auth-submit">
                Lưu mật khẩu mới
              </Button>
            </form>
          )}

          {recoveryMode && resetStep === 'complete' && (
            <div className="auth-complete">
              <div className="auth-success-mark" aria-hidden="true">
                ✓
              </div>
              <h2>Đã cập nhật mật khẩu</h2>
              <p>Hãy đăng nhập lại bằng mật khẩu mới của bạn.</p>
              <Button onClick={() => goAuth('login')} className="auth-submit">
                Đến trang đăng nhập
              </Button>
            </div>
          )}

          {recoveryMode && resetStep !== 'complete' && (
            <p className="auth-switch-copy">
              Nhớ lại mật khẩu?{' '}
              <a
                href={authHref('login')}
                onClick={(event) => {
                  event.preventDefault();
                  goAuth('login');
                }}
              >
                Quay lại đăng nhập
              </a>
            </p>
          )}
          {registerMode && registrationStep === 'details' && (
            <p className="auth-switch-copy">
              Đã có tài khoản?{' '}
              <a
                href={authHref('login')}
                onClick={(event) => {
                  event.preventDefault();
                  goAuth('login');
                }}
              >
                Đăng nhập
              </a>
            </p>
          )}
        </div>
      </div>
      <p className="auth-footer-note">
        Thông tin tài khoản được bảo vệ và xác minh bởi Studio Trang Phục.
      </p>
    </section>
  );
}
