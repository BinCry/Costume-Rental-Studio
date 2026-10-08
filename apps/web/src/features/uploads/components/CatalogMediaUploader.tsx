import { useEffect, useId, useState } from 'react';

import { Button, Feedback, Field } from '../../../components/ui';
import {
  uploadCatalogMedia,
  type CatalogMediaOwner,
  type CatalogMediaUploadResult,
} from '../api/catalogMedia';

const acceptedContentTypes = ['image/jpeg', 'image/png', 'image/webp'];

type CatalogMediaUploaderProps = CatalogMediaOwner & {
  accessToken: string;
  apiBaseUrl?: string;
  maxBytes?: number;
  sortOrder?: number;
  onUploaded: (media: CatalogMediaUploadResult) => void;
};

export function CatalogMediaUploader({
  ownerType,
  ownerId,
  accessToken,
  apiBaseUrl,
  maxBytes = 10 * 1024 * 1024,
  sortOrder = 0,
  onUploaded,
}: CatalogMediaUploaderProps) {
  const inputId = useId();
  const [file, setFile] = useState<File>();
  const [altText, setAltText] = useState('');
  const [previewUrl, setPreviewUrl] = useState<string>();
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState('');
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  const chooseFile = (nextFile: File | undefined) => {
    setError('');
    setProgress(0);
    if (!nextFile) return;
    if (!acceptedContentTypes.includes(nextFile.type)) {
      setFile(undefined);
      setPreviewUrl(undefined);
      setError('Chỉ nhận ảnh JPG, PNG hoặc WebP.');
      return;
    }
    if (nextFile.size > maxBytes) {
      setFile(undefined);
      setPreviewUrl(undefined);
      setError(`Ảnh phải nhỏ hơn hoặc bằng ${Math.floor(maxBytes / 1024 / 1024)} MB.`);
      return;
    }
    setPreviewUrl(URL.createObjectURL(nextFile));
    setFile(nextFile);
  };

  const upload = async () => {
    if (!file) {
      setError('Chọn một ảnh trước khi tải lên.');
      return;
    }
    setUploading(true);
    setError('');
    try {
      const media = await uploadCatalogMedia({
        ownerType,
        ownerId,
        accessToken,
        file,
        altText: altText.trim() || undefined,
        sortOrder,
        apiBaseUrl,
        onProgress: setProgress,
      });
      onUploaded(media);
      setFile(undefined);
      setAltText('');
      setPreviewUrl(undefined);
      setProgress(0);
    } catch (caught: unknown) {
      setError(caught instanceof Error ? caught.message : 'Không thể tải ảnh lên.');
    } finally {
      setUploading(false);
    }
  };

  return (
    <section className="stack-form" aria-label="Tải ảnh danh mục">
      <div>
        <label htmlFor={inputId}>Ảnh JPG, PNG hoặc WebP</label>
        <input
          id={inputId}
          type="file"
          accept={acceptedContentTypes.join(',')}
          disabled={uploading}
          onChange={(event) => chooseFile(event.currentTarget.files?.[0])}
        />
      </div>
      <Field
        label="Mô tả ảnh"
        value={altText}
        disabled={uploading}
        onChange={(event) => setAltText(event.target.value)}
        hint="Dùng cho người đọc màn hình và khi ảnh không tải được."
      />
      {previewUrl && (
        <img src={previewUrl} alt="Xem trước ảnh sắp tải lên" style={{ maxWidth: 240 }} />
      )}
      {uploading && <Feedback tone="info" title={`Đang tải ảnh: ${progress}%`} />}
      {error && (
        <Feedback tone="danger" title="Không thể tải ảnh">
          {error}
        </Feedback>
      )}
      <Button type="button" loading={uploading} disabled={!file} onClick={() => void upload()}>
        Tải ảnh lên
      </Button>
    </section>
  );
}
