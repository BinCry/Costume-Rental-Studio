interface BrandLogoMarkProps {
  className: string;
}

export function BrandLogoMark({ className }: BrandLogoMarkProps) {
  return <img className={className} src="/brand-mark.png" alt="" aria-hidden="true" />;
}
