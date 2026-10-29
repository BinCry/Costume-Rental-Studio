export const STUDIO_TRY_ON_STORAGE_PREFIX = 'studio-virtual-try-on:';

export type StudioUploadCategory = 'kurti' | 'dress' | 'top' | 'shirt' | 'tshirt' | 'saree';

export interface StudioTryOnContext {
  productId: string;
  name: string;
  category: StudioUploadCategory;
  imageUrl: string | null;
  imageAlt?: string;
}

const uploadCategories: readonly StudioUploadCategory[] = [
  'kurti',
  'dress',
  'top',
  'shirt',
  'tshirt',
  'saree',
];

export function takeStudioTryOnContext(contextId: string | null): StudioTryOnContext | null {
  if (!contextId || !/^[0-9a-f-]{36}$/i.test(contextId)) return null;
  try {
    const key = `${STUDIO_TRY_ON_STORAGE_PREFIX}${contextId}`;
    const raw = window.sessionStorage.getItem(key);
    window.sessionStorage.removeItem(key);
    if (!raw || raw.length > 16_384) return null;
    const value: unknown = JSON.parse(raw);
    if (typeof value !== 'object' || value === null) return null;
    const context = value as Record<string, unknown>;
    if (
      typeof context.productId !== 'string' ||
      typeof context.name !== 'string' ||
      typeof context.category !== 'string' ||
      !uploadCategories.includes(context.category as StudioUploadCategory) ||
      (context.imageUrl !== null && typeof context.imageUrl !== 'string') ||
      (context.imageAlt !== undefined && typeof context.imageAlt !== 'string')
    )
      return null;
    return {
      productId: context.productId,
      name: context.name,
      category: context.category as StudioUploadCategory,
      imageUrl: context.imageUrl as string | null,
      ...(typeof context.imageAlt === 'string' ? { imageAlt: context.imageAlt } : {}),
    };
  } catch {
    return null;
  }
}
