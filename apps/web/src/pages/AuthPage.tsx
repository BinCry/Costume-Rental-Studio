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
const pendingRegistrationKey = 'costume-rental.pending-registration';
interface PendingRegistration {
  challengeId: string;
  email: string;
  displayName: string;
  phone: string;
  expiresAt: number;
  retryAt: number;
}
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
    OTP_DELIVERY_UNAVAILABLE:
      'Studio chưa gửi được email xác thực. Bạn có thể thử đăng ký bằng Google hoặc liên hệ studio.',
    AUTH_NOT_CONFIGURED: 'Dịch vụ xác thực chưa được cấu hình. Vui lòng liên hệ studio.',
    ACCOUNT_NOT_ELIGIBLE: 'Email này đã có tài khoản. Hãy đăng nhập hoặc khôi phục mật khẩu.',
    ACCOUNT_CONFLICT:
      'Email hoặc số điện thoại vừa được dùng cho tài khoản khác. Hãy kiểm tra thông tin rồi thử lại.',
    CONTACT_CONFLICT: 'Email hoặc số điện thoại này đã được dùng cho tài khoản khác.',
    REGISTRATION_UNAVAILABLE: 'Studio chưa thể tạo tài khoản lúc này. Vui lòng thử lại sau.',
    GOOGLE_REGISTRATION_UNAVAILABLE: 'Đăng ký bằng Google đang tạm thời gián đoạn.',
    GOOGLE_AUTH_NOT_CONFIGURED: 'Đăng nhập Google chưa được cấu hình. Hãy thử bằng email.',
    GOOGLE_AUTH_CANCELLED: 'Bạn đã hủy đăng nhập Google. Hãy thử lại hoặc đăng nhập bằng email.',
    GOOGLE_AUTH_FAILED: 'Google chưa xác nhận được tài khoản. Hãy thử lại hoặc dùng email.',
    INVALID_GOOGLE_OAUTH_FLOW:
      'Phiên đăng nhập Google đã hết hạn. Hãy bắt đầu lại từ trang đăng nhập.',
    INVALID_GOOGLE_OAUTH_CALLBACK: 'Google chưa hoàn tất đăng nhập. Hãy thử lại hoặc dùng email.',
    ACCOUNT_UNAVAILABLE:
      'Tài khoản này chưa thể liên kết với Google. Hãy đăng nhập bằng phương thức đã dùng trước đó.',
    AUTH_RATE_LIMITED: 'Bạn đã thử quá nhiều lần. Vui lòng đợi một lúc rồi thử lại.',
    INVALID_PASSWORD_RESET: 'Yêu cầu khôi phục đã hết hạn. Hãy bắt đầu lại.',
    UNTRUSTED_ORIGIN: 'Yêu cầu chưa được chấp nhận từ địa chỉ trang hiện tại.',
  };
  if (error.code === 'VALIDATION_ERROR') {
    const fields = error.details?.fields;
    if (Array.isArray(fields)) {
      const firstField = fields.find(
        (entry): entry is { field: string } =>
          typeof entry === 'object' && entry !== null && 'field' in entry,
      )?.field;
      if (firstField === 'displayName') return 'Hãy nhập họ và tên hợp lệ.';
      if (firstField === 'phone') return 'Số điện thoại chưa đúng định dạng.';
      if (firstField === 'email') return 'Email chưa đúng định dạng.';
      if (firstField === 'password') return 'Mật khẩu cần có từ 12 đến 128 ký tự.';
    }
  }
  return messages[error.code] ?? 'Không thể hoàn tất yêu cầu. Vui lòng thử lại sau.';
};

const googleCallbackMessage = (code: string | null) => {
  const messages: Record<string, string> = {
    GOOGLE_AUTH_CANCELLED: 'Bạn đã hủy đăng nhập Google. Hãy thử lại hoặc đăng nhập bằng email.',
    GOOGLE_AUTH_NOT_CONFIGURED: 'Đăng nhập Google chưa được cấu hình. Hãy thử bằng email.',
    GOOGLE_AUTH_FAILED: 'Google chưa xác nhận được tài khoản. Hãy thử lại hoặc dùng email.',
    INVALID_GOOGLE_OAUTH_FLOW: 'Phiên Google đã hết hạn. Hãy bắt đầu lại từ trang đăng nhập.',
    INVALID_GOOGLE_OAUTH_CALLBACK: 'Google chưa hoàn tất đăng nhập. Hãy thử lại hoặc dùng email.',
    ACCOUNT_UNAVAILABLE:
      'Tài khoản này chưa thể liên kết với Google. Hãy dùng phương thức đăng nhập trước đó.',
    GOOGLE_REGISTRATION_UNAVAILABLE: 'Đăng ký bằng Google đang tạm thời gián đoạn.',
  };
  return messages[code ?? ''] ?? 'Phiên xác thực đã bị hủy hoặc hết hạn. Hãy thử lại bằng email.';
};

function readPendingRegistration(): PendingRegistration | undefined {
  try {
    const raw = window.sessionStorage.getItem(pendingRegistrationKey);
    if (!raw) return undefined;
    const value = JSON.parse(raw) as Partial<PendingRegistration>;
    if (
      typeof value.challengeId !== 'string' ||
      typeof value.email !== 'string' ||
      typeof value.displayName !== 'string' ||
      typeof value.phone !== 'string' ||
      typeof value.expiresAt !== 'number' ||
      typeof value.retryAt !== 'number'
    ) {
      window.sessionStorage.removeItem(pendingRegistrationKey);
      return undefined;
    }
    return value as PendingRegistration;
  } catch {
    return undefined;
  }
}

function savePendingRegistration(value: PendingRegistration) {
  try {
    window.sessionStorage.setItem(pendingRegistrationKey, JSON.stringify(value));
  } catch {
    // Registration remains usable when browser storage is unavailable.
  }
}

function clearPendingRegistration() {
  try {
    window.sessionStorage.removeItem(pendingRegistrationKey);
  } catch {
    // Nothing else is required to complete the current registration session.
  }
}

function validPhone(value: string) {
  const compact = value.trim().replace(/[\s()-]/g, '');
  return (
    !compact ||
    /^0\d{9}$/.test(compact) ||
    /^84\d{9}$/.test(compact) ||
    /^\+[1-9]\d{7,14}$/.test(compact)
  );
}

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
  const [savedRegistration] = useState(() =>
    mode === 'register' ? readPendingRegistration() : undefined,
  );
  const [busy, setBusy] = useState(false);
  const [issue, setIssue] = useState('');
  const [notice, setNotice] = useState('');
  const callbackHandled = useRef(false);
  const [email, setEmail] = useState(savedRegistration?.email ?? '');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState(savedRegistration?.displayName ?? '');
  const [phone, setPhone] = useState(savedRegistration?.phone ?? '');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [registrationStep, setRegistrationStep] = useState<'details' | 'verify'>(
    savedRegistration ? 'verify' : 'details',
  );
  const [registrationChallenge, setRegistrationChallenge] = useState(
    savedRegistration?.challengeId ?? '',
  );
  const [registrationChallengeEmail, setRegistrationChallengeEmail] = useState(
    savedRegistration?.email ?? '',
  );
  const [registrationExpiresAt, setRegistrationExpiresAt] = useState(
    savedRegistration?.expiresAt ?? 0,
  );
  const [passwordRequiredAtVerify, setPasswordRequiredAtVerify] = useState(
    Boolean(savedRegistration),
  );
  const [registrationRetryAt, setRegistrationRetryAt] = useState(savedRegistration?.retryAt ?? 0);
  const [registrationOtp, setRegistrationOtp] = useState('');
  const [registrationResendSeconds, setRegistrationResendSeconds] = useState(0);
  const [resetResendSeconds, setResetResendSeconds] = useState(0);
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
    if (!registrationRetryAt) return;
    const updateCountdown = (timerId: number) => {
      const remaining = Math.max(0, Math.ceil((registrationRetryAt - Date.now()) / 1000));
      setRegistrationResendSeconds(remaining);
      if (remaining === 0) window.clearInterval(timerId);
    };
    const interval = window.setInterval(() => updateCountdown(interval), 1000);
    const initialTick = window.setTimeout(() => updateCountdown(interval), 0);
    return () => {
      window.clearTimeout(initialTick);
      window.clearInterval(interval);
    };
  }, [registrationRetryAt]);

  useEffect(() => {
    if (resetResendSeconds <= 0) return;
    const timer = window.setTimeout(
      () => setResetResendSeconds((seconds) => Math.max(0, seconds - 1)),
      1000,
    );
    return () => window.clearTimeout(timer);
  }, [resetResendSeconds]);

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
    setIssue('');
    setNotice('');
    const normalizedEmail = email.trim().toLowerCase();
    if (!displayName.trim()) {
      setIssue('Hãy nhập họ và tên của bạn.');
      return;
    }
    if (!validPhone(phone)) {
      setIssue(
        'Số điện thoại chưa đúng. Dùng số Việt Nam 10 chữ số hoặc số quốc tế có mã quốc gia.',
      );
      return;
    }
    if (password.length < 12 || password.length > 128) {
      setIssue('Mật khẩu cần có từ 12 đến 128 ký tự.');
      return;
    }
    if (password !== confirmPassword) {
      setIssue('Mật khẩu xác nhận chưa khớp.');
      return;
    }
    if (
      registrationChallenge &&
      registrationChallengeEmail === normalizedEmail &&
      registrationExpiresAt > Date.now()
    ) {
      const retryAt = Date.now() + registrationResendSeconds * 1000;
      savePendingRegistration({
        challengeId: registrationChallenge,
        email: normalizedEmail,
        displayName: displayName.trim(),
        phone: phone.trim(),
        expiresAt: registrationExpiresAt,
        retryAt,
      });
      setRegistrationRetryAt(retryAt);
      setRegistrationStep('verify');
      setPasswordRequiredAtVerify(false);
      setNotice('Dùng mã đã gửi đến email để hoàn tất đăng ký.');
      return;
    }
    setBusy(true);
    try {
      const result = await requestRegistrationOtp(normalizedEmail);
      const expiresAt = Date.now() + result.expiresIn * 1000;
      setRegistrationChallenge(result.challengeId);
      setRegistrationChallengeEmail(normalizedEmail);
      setRegistrationExpiresAt(expiresAt);
      setRegistrationResendSeconds(result.retryAfter);
      const retryAt = Date.now() + result.retryAfter * 1000;
      setRegistrationRetryAt(retryAt);
      setRegistrationStep('verify');
      setPasswordRequiredAtVerify(false);
      setRegistrationOtp('');
      savePendingRegistration({
        challengeId: result.challengeId,
        email: normalizedEmail,
        displayName: displayName.trim(),
        phone: phone.trim(),
        expiresAt,
        retryAt,
      });
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
      const result = await requestRegistrationOtp(registrationChallengeEmail || email.trim());
      const expiresAt = Date.now() + result.expiresIn * 1000;
      setRegistrationChallenge(result.challengeId);
      setRegistrationChallengeEmail(registrationChallengeEmail || email.trim().toLowerCase());
      setRegistrationExpiresAt(expiresAt);
      setRegistrationOtp('');
      setRegistrationResendSeconds(result.retryAfter);
      const retryAt = Date.now() + result.retryAfter * 1000;
      setRegistrationRetryAt(retryAt);
      savePendingRegistration({
        challengeId: result.challengeId,
        email: registrationChallengeEmail || email.trim().toLowerCase(),
        displayName: displayName.trim(),
        phone: phone.trim(),
        expiresAt,
        retryAt,
      });
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
    if (!validPhone(phone)) {
      setIssue(
        'Số điện thoại chưa đúng. Dùng số Việt Nam 10 chữ số hoặc số quốc tế có mã quốc gia.',
      );
      return;
    }
    if (password.length < 12 || password.length > 128) {
      setIssue('Mật khẩu cần có từ 12 đến 128 ký tự.');
      return;
    }
    if (password !== confirmPassword) {
      setIssue('Mật khẩu xác nhận chưa khớp.');
      return;
    }
    setBusy(true);
    try {
      await registerCustomer({
        email: registrationChallengeEmail || email.trim().toLowerCase(),
        phone: phone.trim() || undefined,
        challengeId: registrationChallenge,
        otp: registrationOtp.trim(),
        displayName: displayName.trim(),
        password,
      });
      clearPendingRegistration();
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
      setResetResendSeconds(result.retryAfter);
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
      setResetResendSeconds(result.retryAfter);
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
          <img src="/images/lookbook-minh-hoa.webp" alt="" />
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
                    <p>{googleCallbackMessage(params.get('error'))}</p>
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

          {registerMode && registrationStep === 'details' && (
            <>
              <form className="auth-form" onSubmit={(event) => void sendRegistrationCode(event)}>
                <Field
                  label="Họ và tên"
                  autoComplete="name"
                  placeholder="Nguyễn Minh Anh"
                  maxLength={255}
                  value={displayName}
                  onChange={(event) => setDisplayName(event.target.value)}
                  required
                  disabled={disabled || busy}
                />
                <Field
                  label="Email"
                  type="email"
                  autoComplete="email"
                  inputMode="email"
                  placeholder="ten@email.com"
                  maxLength={255}
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  required
                  disabled={disabled || busy}
                />
                <Field
                  label="Số điện thoại (có thể bổ sung sau)"
                  type="tel"
                  autoComplete="tel"
                  inputMode="tel"
                  placeholder="09xx xxx xxx"
                  hint="Studio dùng số này để liên hệ xác nhận đơn thuê."
                  value={phone}
                  onChange={(event) => setPhone(event.target.value)}
                  disabled={disabled || busy}
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
                  disabled={disabled || busy}
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
                  disabled={disabled || busy}
                />
                <p className="auth-help-copy">
                  Nhập thông tin trước. Studio sẽ gửi mã 6 số để xác minh email và hoàn tất tài
                  khoản.
                </p>
                <Button type="submit" loading={busy} disabled={disabled} className="auth-submit">
                  {registrationChallenge &&
                  registrationChallengeEmail === email.trim().toLowerCase()
                    ? 'Tiếp tục xác minh'
                    : 'Gửi mã xác nhận'}
                </Button>
              </form>
              {apiEnabled && (
                <>
                  <div className="auth-divider">
                    <span>hoặc đăng ký bằng</span>
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
            </>
          )}

          {registerMode && registrationStep === 'verify' && (
            <form className="auth-form" onSubmit={(event) => void finishRegistration(event)}>
              <div className="auth-verified-email">
                <span>Mã xác nhận đã gửi đến</span>
                <strong>{registrationChallengeEmail || email}</strong>
                <button
                  type="button"
                  className="text-button"
                  onClick={() => {
                    setRegistrationStep('details');
                    setNotice('');
                    setIssue('');
                  }}
                  disabled={busy}
                >
                  Sửa thông tin
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
                disabled={busy || registrationResendSeconds > 0}
              >
                {registrationResendSeconds > 0
                  ? `Gửi lại mã sau ${registrationResendSeconds} giây`
                  : 'Gửi lại mã'}
              </button>
              {passwordRequiredAtVerify && (
                <>
                  <p className="auth-help-copy">
                    Vì lý do bảo mật, hãy nhập lại mật khẩu để tiếp tục sau khi tải lại trang.
                  </p>
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
                </>
              )}
              <Button type="submit" loading={busy} disabled={busy} className="auth-submit">
                Xác nhận mã và tạo tài khoản
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
                disabled={busy || resetResendSeconds > 0}
              >
                {resetResendSeconds > 0
                  ? `Gửi lại mã sau ${resetResendSeconds} giây`
                  : 'Gửi lại mã'}
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
          {registerMode && (
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
