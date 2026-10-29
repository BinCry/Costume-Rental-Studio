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
                    <a href={safeUrl} target="_blank" rel="noopener noreferrer">
                      {name}
                    </a>
                  ) : (
                    <a className="site-footer-social-pending" aria-disabled="true" tabIndex={-1}>
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
