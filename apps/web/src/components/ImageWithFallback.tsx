import { useState } from 'react';
import { Icon } from './ui';

interface ImageWithFallbackProps {
  src?: string | null;
  alt: string;
  loading?: 'eager' | 'lazy';
  missingText?: string;
  failedText?: string;
  compact?: boolean;
}

export function ImageWithFallback({
  src,
  alt,
  loading = 'lazy',
  missingText = 'Chưa có ảnh',
  failedText = 'Ảnh đang được cập nhật',
  compact = false,
}: ImageWithFallbackProps) {
  const [failedSource, setFailedSource] = useState<string>();
  const source = src?.trim();
  const failed = source !== undefined && failedSource === source;

  if (!source || failed) {
    const fallbackText = failed ? failedText : missingText;
    return (
      <span
        className={`product-image-fallback${compact ? ' is-compact' : ''}`}
        role={alt ? 'img' : undefined}
        aria-label={alt ? `${alt}. ${fallbackText}` : undefined}
        aria-hidden={alt ? undefined : true}
      >
        <Icon name="spark" size={compact ? 17 : 25} />
        <span>{fallbackText}</span>
      </span>
    );
  }

  return (
    <img
      className="product-image"
      src={source}
      alt={alt}
      loading={loading}
      decoding="async"
      onError={() => setFailedSource(source)}
    />
  );
}
