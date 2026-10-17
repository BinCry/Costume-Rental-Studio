import { checkPublicAvailability } from '../api/client';
import type { CatalogItem } from '../fixtures/types';

export type CatalogAvailability = 'loading' | 'available' | 'unavailable' | 'error';

export interface CatalogAvailabilityResult {
  values: Record<string, CatalogAvailability>;
  availableVariants: Record<string, string[]>;
}

export async function checkCatalogAvailability(
  items: CatalogItem[],
  branch: string,
  pickup: string,
  returnAt: string,
  size: string,
  color: string,
): Promise<CatalogAvailabilityResult> {
  const variants = items.flatMap((item) =>
    (item.apiVariants ?? [])
      .filter(
        (variant) =>
          (size === 'Tất cả' || variant.size === size) &&
          (color === 'Tất cả' || variant.color === color),
      )
      .map((variant) => ({
        modelId: item.id,
        variantId: variant.id,
        label: `${variant.size} / ${variant.color}${variant.edition ? ` · ${variant.edition}` : ''}`,
      })),
  );
  const checks: { modelId: string; label: string; available: boolean | null }[] = [];
  let cursor = 0;
  await Promise.all(
    Array.from({ length: Math.min(5, variants.length) }, async () => {
      while (cursor < variants.length) {
        const index = cursor++;
        const variant = variants[index];
        try {
          const result = await checkPublicAvailability(variant.variantId, branch, pickup, returnAt);
          checks[index] = {
            modelId: variant.modelId,
            label: variant.label,
            available: result.available,
          };
        } catch {
          checks[index] = { modelId: variant.modelId, label: variant.label, available: null };
        }
      }
    }),
  );

  const values: Record<string, CatalogAvailability> = {};
  const availableVariants: Record<string, string[]> = {};
  for (const item of items) {
    const itemChecks = checks.filter((entry) => entry?.modelId === item.id);
    const itemValues = itemChecks.map((entry) => entry.available);
    if (!itemValues.length || itemValues.every((value) => value === null)) {
      values[item.id] = 'error';
      continue;
    }
    if (itemValues.some((value) => value === true)) {
      values[item.id] = 'available';
      availableVariants[item.id] = itemChecks
        .filter((entry) => entry.available === true)
        .map((entry) => entry.label);
    } else if (itemValues.every((value) => value === false)) {
      values[item.id] = 'unavailable';
    } else {
      values[item.id] = 'error';
    }
  }
  return { values, availableVariants };
}
