export type CatalogMediaOwner =
  { ownerType: 'model'; ownerId: string } | { ownerType: 'variant'; ownerId: string };

export type CatalogMediaUploadOptions = CatalogMediaOwner & {
  accessToken: string;
  file: File;
  altText?: string;
  sortOrder?: number;
  apiBaseUrl?: string;
  onProgress?: (percentage: number) => void;
};

export interface CatalogMediaUploadResult {
  id: string;
  objectKey: string;
  sortOrder: number;
  altText: string | null;
  mediaUrl?: string;
}

interface ApiEnvelope<T> {
  success: boolean;
  data?: T;
  error?: { message?: string };
}

interface PresignedUpload {
  objectKey: string;
  uploadUrl: string;
  method: 'POST';
  fields: Record<string, string>;
}

function endpoint(path: string, apiBaseUrl: string) {
  return `${apiBaseUrl.replace(/\/$/, '')}${path}`;
}

async function apiJson<T>(input: RequestInfo | URL, init: RequestInit): Promise<T> {
  const response = await fetch(input, init);
  const body = (await response.json().catch(() => undefined)) as ApiEnvelope<T> | undefined;
  if (!response.ok || !body?.success || !body.data)
    throw new Error(body?.error?.message ?? 'Không thể hoàn tất tải ảnh.');
  return body.data;
}

function postFile(
  url: string,
  file: File,
  fields: Record<string, string>,
  onProgress?: (percentage: number) => void,
) {
  return new Promise<void>((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open('POST', url);
    request.upload.addEventListener('progress', (event) => {
      if (event.lengthComputable) onProgress?.(Math.round((event.loaded / event.total) * 100));
    });
    request.addEventListener('load', () => {
      if (request.status >= 200 && request.status < 300) resolve();
      else reject(new Error('SeaweedFS không nhận được tệp ảnh.'));
    });
    request.addEventListener('error', () =>
      reject(new Error('Không thể kết nối tới máy chủ lưu ảnh.')),
    );
    const form = new FormData();
    Object.entries(fields).forEach(([name, value]) => form.append(name, value));
    form.append('file', file);
    request.send(form);
  });
}

export async function uploadCatalogMedia({
  ownerType,
  ownerId,
  accessToken,
  file,
  altText,
  sortOrder = 0,
  apiBaseUrl = '/api/v1',
  onProgress,
}: CatalogMediaUploadOptions): Promise<CatalogMediaUploadResult> {
  const authorization = { Authorization: `Bearer ${accessToken}` };
  const presigned = await apiJson<PresignedUpload>(endpoint('/uploads/presign', apiBaseUrl), {
    method: 'POST',
    headers: { ...authorization, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      purpose: 'catalog-media',
      ownerType,
      ownerId,
      contentType: file.type,
      size: file.size,
    }),
  });

  await postFile(presigned.uploadUrl, file, presigned.fields, onProgress);
  const mediaPath =
    ownerType === 'model'
      ? `/catalog/models/${ownerId}/media`
      : `/catalog/variants/${ownerId}/media`;
  return apiJson<CatalogMediaUploadResult>(endpoint(mediaPath, apiBaseUrl), {
    method: 'POST',
    headers: { ...authorization, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      uploadKey: presigned.objectKey,
      sortOrder,
      ...(altText ? { altText } : {}),
    }),
  });
}
