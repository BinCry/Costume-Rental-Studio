import { Icon } from './ui';

export function BranchAddressNote({
  branchName,
  address,
}: {
  branchName: string;
  address?: string;
}) {
  const location = address?.trim();
  if (!location) return null;

  const mapUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(location)}`;

  return (
    <div className="branch-location-note">
      <Icon name="pin" size={17} />
      <address>{location}</address>
      <a
        href={mapUrl}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={`Mở vị trí ${branchName} trên bản đồ`}
      >
        Bản đồ ↗
      </a>
    </div>
  );
}
