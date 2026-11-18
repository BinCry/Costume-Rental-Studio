import { readFile } from 'node:fs/promises';

const config = Object.fromEntries(
  (await readFile(new URL('./.env', import.meta.url), 'utf8'))
    .split(/\r?\n/)
    .filter((line) => line && !line.startsWith('#'))
    .map((line) => {
      const separator = line.indexOf('=');
      return [line.slice(0, separator), line.slice(separator + 1)];
    }),
);
const apiUrl = `http://localhost:${config.LOCAL_TEST_API_PORT ?? '4180'}`;
const webUrl = `http://localhost:${config.LOCAL_TEST_WEB_PORT ?? '5180'}`;
let token;
let mediaId;

async function api(path, options = {}) {
  const response = await fetch(`${apiUrl}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Origin: webUrl,
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });
  if (response.status === 204) return null;
  const body = await response.json();
  if (!response.ok || !body.success) {
    throw new Error(`${path}: HTTP ${response.status} ${body.error?.code ?? 'UNKNOWN'}`);
  }
  return body.data;
}

try {
  const login = await api('/api/v1/auth/login', {
    method: 'POST',
    body: JSON.stringify({
      email: 'admin@costume.local',
      password: config.LOCAL_TEST_ACCOUNT_PASSWORD,
    }),
  });
  token = login.accessToken;
  const catalog = await api('/api/v1/public/catalog/variants');
  const modelId = catalog.items[0]?.modelId;
  if (!modelId) throw new Error('Demo catalog has no model');
  const bytes = await readFile(new URL('../apps/web/public/brand-mark.png', import.meta.url));
  const signed = await api('/api/v1/uploads/presign', {
    method: 'POST',
    body: JSON.stringify({
      purpose: 'catalog-media',
      ownerType: 'model',
      ownerId: modelId,
      contentType: 'image/png',
      size: bytes.length,
    }),
  });
  if (new URL(signed.uploadUrl).hostname !== 'localhost') {
    throw new Error('Refusing to upload outside local S3');
  }
  const form = new FormData();
  for (const [key, value] of Object.entries(signed.fields)) form.append(key, value);
  form.append('file', new Blob([bytes], { type: 'image/png' }), 'smoke.png');
  const upload = await fetch(signed.uploadUrl, {
    method: 'POST',
    body: form,
    headers: { Origin: webUrl },
  });
  if (!upload.ok) throw new Error(`S3 presigned POST: HTTP ${upload.status}`);
  const media = await api(`/api/v1/catalog/models/${modelId}/media`, {
    method: 'POST',
    body: JSON.stringify({ uploadKey: signed.objectKey, altText: 'Local upload smoke test' }),
  });
  mediaId = media.id;
  const image = await fetch(media.mediaUrl);
  if (!image.ok || image.headers.get('content-type') !== 'image/png') {
    throw new Error(`Public catalog image: HTTP ${image.status}`);
  }
  console.info('Local catalog upload, normalization and public image read: OK');
} finally {
  if (mediaId) await api(`/api/v1/catalog/media/${mediaId}`, { method: 'DELETE' });
}
