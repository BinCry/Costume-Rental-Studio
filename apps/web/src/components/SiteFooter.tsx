export interface SiteBranchContact {
  name: string;
  address: string;
  phone?: string | null;
}

interface SiteFooterProps {
  branchContacts: SiteBranchContact[];
  compact?: boolean;
}

type SocialNetwork = 'Facebook' | 'Instagram' | 'TikTok' | 'Zalo';

const socialNetworks: { name: SocialNetwork; url?: string }[] = [
  { name: 'Facebook', url: import.meta.env.VITE_SOCIAL_FACEBOOK_URL as string | undefined },
  { name: 'Instagram', url: import.meta.env.VITE_SOCIAL_INSTAGRAM_URL as string | undefined },
  { name: 'TikTok', url: import.meta.env.VITE_SOCIAL_TIKTOK_URL as string | undefined },
  { name: 'Zalo', url: import.meta.env.VITE_SOCIAL_ZALO_URL as string | undefined },
];

function safeSocialUrl(name: SocialNetwork, value?: string) {
  if (!value?.trim()) return undefined;
  try {
    const url = new URL(value.trim());
    const allowedHosts: Record<SocialNetwork, string[]> = {
      Facebook: ['facebook.com'],
      Instagram: ['instagram.com'],
      TikTok: ['tiktok.com'],
      Zalo: ['zalo.me'],
    };
    return url.protocol === 'https:' &&
      allowedHosts[name].some((host) => url.hostname === host || url.hostname.endsWith(`.${host}`))
      ? url.toString()
      : undefined;
  } catch {
    return undefined;
  }
}

function formatPhone(value: string) {
  const normalized = value.replace(/[\s()-]/g, '');
  if (/^\+?84\d{9,10}$/.test(normalized)) {
    const digits = normalized.replace(/^\+?84/, '');
    return `+84 ${digits.slice(0, 2)} ${digits.slice(2, 6)} ${digits.slice(6)}`;
  }
  return value;
}

function SocialIcon({ network }: { network: SocialNetwork }) {
  if (network === 'Facebook') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M13.7 21v-8.2h2.8l.4-3.2h-3.2V7.5c0-.9.3-1.6 1.6-1.6H17V3.1c-.3 0-1.4-.1-2.7-.1-2.7 0-4.6 1.7-4.6 4.8v1.8H7v3.2h2.7V21h4Z" />
      </svg>
    );
  }

  if (network === 'Instagram') {
    return (
      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <rect x="3.5" y="3.5" width="17" height="17" rx="5" />
        <circle cx="12" cy="12" r="4" />
        <circle cx="17.7" cy="6.5" r=".9" fill="currentColor" stroke="none" />
      </svg>
    );
  }

  if (network === 'TikTok') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M15.2 3h-3.4v11.4a2.5 2.5 0 1 1-2.5-2.5c.3 0 .6 0 .9.1V8.6a6.4 6.4 0 1 0 5 6.2V9.1a8.2 8.2 0 0 0 4.6 1.4V7.1A4.8 4.8 0 0 1 15.2 3Z" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M20 4H4a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h2l-1 3 5-3h10a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2Z" />
      <path d="M7.5 8h9l-7 5h7" />
    </svg>
  );
}

export function SiteFooter({ branchContacts, compact = false }: SiteFooterProps) {
  if (compact) {
    return (
      <footer className="site-footer site-footer-compact">
        <span>Studio Trang Phục</span>
        <span>Quản lý theo chi nhánh</span>
      </footer>
    );
  }

  return (
    <footer className="site-footer site-footer-public" aria-label="Thông tin Studio">
      <div className="site-footer-main">
        <div className="site-footer-brand">
          <a className="site-footer-logo" href="/" aria-label="Studio Trang Phục, về trang chủ">
            <span className="site-footer-logo-mark" aria-hidden="true">
              S
            </span>
            <span>
              <strong>STUDIO.</strong>
              <small>TRANG PHỤC</small>
            </span>
          </a>
          <p>Trang phục cho những khoảnh khắc đáng nhớ.</p>
        </div>

        <section className="site-footer-contact" aria-labelledby="site-footer-contact-title">
          <h2 id="site-footer-contact-title">Liên hệ chi nhánh</h2>
          {branchContacts.length ? (
            <ul>
              {branchContacts.map((branch) => (
                <li key={branch.name}>
                  <strong>{branch.name}</strong>
                  {branch.address && <address>{branch.address}</address>}
                  {branch.phone && (
                    <a href={`tel:${branch.phone.replace(/[^+\d]/g, '')}`}>
                      {formatPhone(branch.phone)}
                    </a>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p>Thông tin liên hệ chi nhánh hiện chưa khả dụng.</p>
          )}
        </section>

        <section className="site-footer-social" aria-labelledby="site-footer-social-title">
          <h2 id="site-footer-social-title">Kết nối với Studio</h2>
          <ul>
            {socialNetworks.map(({ name, url }) => {
              const safeUrl = safeSocialUrl(name, url);
              return (
                <li key={name}>
                  {safeUrl ? (
                    <a
                      className={`site-footer-social-link site-footer-social-link-${name.toLowerCase()}`}
                      href={safeUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <span className="site-footer-social-icon" aria-hidden="true">
                        <SocialIcon network={name} />
                      </span>
                      {name}
                    </a>
                  ) : (
                    <a
                      className={`site-footer-social-link site-footer-social-link-${name.toLowerCase()} site-footer-social-pending`}
                      aria-disabled="true"
                      tabIndex={-1}
                    >
                      <span className="site-footer-social-icon" aria-hidden="true">
                        <SocialIcon network={name} />
                      </span>
                      {name}
                    </a>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      </div>
      <div className="site-footer-bottom">
        <span>© {new Date().getFullYear()} Studio Trang Phục</span>
        <span>Thuê trang phục tại TP. Hồ Chí Minh</span>
      </div>
    </footer>
  );
}
