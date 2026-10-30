const studioApiBaseUrl = (
  (import.meta.env.VITE_API_URL as string | undefined) ??
  (import.meta.env.VITE_API_BASE_URL as string | undefined) ??
  ''
).replace(/\/$/, '');

const accessTokenKey = 'costume-rental.access-token';
let restoringStudioSession: Promise<boolean> | undefined;

export function hasStudioSession() {
  try {
    return Boolean(window.sessionStorage.getItem(accessTokenKey));
  } catch {
    return false;
  }
}

export function restoreStudioSession() {
  if (hasStudioSession()) return Promise.resolve(true);
  restoringStudioSession ??= (async () => {
    try {
      const response = await fetch(`${studioApiBaseUrl}/api/v1/auth/refresh`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
      });
      if (!response.ok) return false;
      const body = (await response.json()) as {
        success?: boolean;
        data?: { accessToken?: string };
      };
      const accessToken = body.success ? body.data?.accessToken : undefined;
      if (!accessToken) return false;
      window.sessionStorage.setItem(accessTokenKey, accessToken);
      window.dispatchEvent(new Event('api-session-changed'));
      return true;
    } catch {
      return false;
    }
  })().finally(() => {
    restoringStudioSession = undefined;
  });
  return restoringStudioSession;
}

export async function logoutStudioSession() {
  const headers = new Headers({ Accept: 'application/json' });
  try {
    const accessToken = window.sessionStorage.getItem(accessTokenKey);
    if (accessToken) headers.set('Authorization', `Bearer ${accessToken}`);
  } catch {
    // The refresh cookie can still revoke the session when sessionStorage is unavailable.
  }

  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 5000);
  try {
    await fetch(`${studioApiBaseUrl}/api/v1/auth/logout`, {
      method: 'POST',
      credentials: 'include',
      headers,
      signal: controller.signal,
    });
  } finally {
    window.clearTimeout(timeout);
    try {
      window.sessionStorage.removeItem(accessTokenKey);
    } finally {
      window.dispatchEvent(new Event('api-session-changed'));
    }
  }
}
