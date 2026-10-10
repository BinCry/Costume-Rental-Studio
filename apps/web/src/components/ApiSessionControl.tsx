import { useEffect, useState, type FormEvent } from 'react';
import { apiEnabled, googleLoginUrl, login, logout, restoreSession } from '../api/client';

export function ApiSessionControl() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [user, setUser] = useState<{ displayName?: string; email?: string }>();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(() => {
    const callbackStatus = new URLSearchParams(window.location.search).get('status');
    return window.location.pathname === '/auth/google/callback' && callbackStatus === 'error'
      ? 'Đăng nhập Google chưa hoàn tất. Bạn có thể thử lại.'
      : '';
  });

  useEffect(() => {
    if (!apiEnabled) return;
    const callbackStatus = new URLSearchParams(window.location.search).get('status');
    void restoreSession().then((restored) => {
      if (restored) {
        setUser(restored);
        window.dispatchEvent(new Event('api-session-changed'));
      }
      if (callbackStatus === 'success' && restored) {
        window.history.replaceState(null, '', '/');
        window.dispatchEvent(new Event('api-session-changed'));
        window.location.reload();
      }
    }).catch(() => undefined);
  }, []);

  if (!apiEnabled) return null;
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setMessage('');
    try {
      const loggedIn = await login(email.trim(), password);
      setUser(loggedIn);
      setPassword('');
      window.dispatchEvent(new Event('api-session-changed'));
      window.location.reload();
      setMessage('Đã đăng nhập API.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Đăng nhập API thất bại.');
    } finally {
      setBusy(false);
    }
  };
  const signOut = async () => {
    setBusy(true);
    try {
      await logout();
      setUser(undefined);
      window.dispatchEvent(new Event('api-session-changed'));
      window.location.reload();
      setMessage('Đã đăng xuất API.');
    } finally {
      setBusy(false);
    }
  };
  return user ? (
    <div className="api-session-control">
      <span>API: {user.displayName || user.email}</span>
      <button type="button" className="text-button" onClick={() => void signOut()} disabled={busy}>
        Đăng xuất
      </button>
    </div>
  ) : (
    <form className="api-session-control" onSubmit={submit}>
      <label>
        Email API
        <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
      </label>
      <label>
        Mật khẩu
        <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} required />
      </label>
      <button type="submit" className="button button-secondary" disabled={busy}>
        {busy ? 'Đang đăng nhập…' : 'Đăng nhập API'}
      </button>
      <a className="button button-secondary" href={googleLoginUrl()}>
        Tiếp tục với Google
      </a>
      {message && <small role="status">{message}</small>}
    </form>
  );
}
