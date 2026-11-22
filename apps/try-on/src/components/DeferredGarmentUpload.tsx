import { lazy, Suspense, useState } from 'react';
import type { PipelineResult } from '@practics/tryon-core';
import type { StoredUserGarment } from '../garments/userGarmentStore';

const GarmentUpload = lazy(() =>
  import('./GarmentUpload').then((module) => ({ default: module.GarmentUpload })),
);

interface Props {
  onGarmentAdded: (garment: StoredUserGarment) => Promise<unknown>;
  previewImage: ImageBitmap | null;
  previewResult: PipelineResult | null;
}

export function DeferredGarmentUpload({ onGarmentAdded, previewImage, previewResult }: Props) {
  const [isOpen, setIsOpen] = useState(false);

  if (isOpen) {
    return (
      <Suspense
        fallback={
          <div className="garment-upload-trigger-wrap">
            <button type="button" className="garment-upload-trigger-btn" disabled aria-busy="true">
              Đang chuẩn bị tải lên…
            </button>
          </div>
        }
      >
        <GarmentUpload
          onGarmentAdded={onGarmentAdded}
          previewImage={previewImage}
          previewResult={previewResult}
          initiallyOpen
          onClose={() => setIsOpen(false)}
        />
      </Suspense>
    );
  }

  return (
    <div className="garment-upload-trigger-wrap">
      <button type="button" className="garment-upload-trigger-btn" onClick={() => setIsOpen(true)}>
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
          <polyline points="17 8 12 3 7 8" />
          <line x1="12" y1="3" x2="12" y2="15" />
        </svg>
        <span>Tải lên trang phục của bạn</span>
      </button>
    </div>
  );
}
