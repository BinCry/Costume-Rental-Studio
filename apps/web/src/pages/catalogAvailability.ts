import { checkPublicAvailabilityBatch } from '../api/client';
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
  for (let offset = 0; offset < variants.length; offset += 50) {
    const batch = variants.slice(offset, offset + 50);
    try {
      const results = await checkPublicAvailabilityBatch(
        batch.map((variant) => variant.variantId),
        branch,
        pickup,
        returnAt,
      );
      const availability = new Map(results.map((result) => [result.variantId, result.available]));
      checks.push(
        ...batch.map((variant) => ({
          modelId: variant.modelId,
          label: variant.label,
          available: availability.get(variant.variantId) ?? null,
        })),
      );
    } catch {
      checks.push(
        ...batch.map((variant) => ({
          modelId: variant.modelId,
          label: variant.label,
          available: null,
        })),
      );
    }
  }

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
