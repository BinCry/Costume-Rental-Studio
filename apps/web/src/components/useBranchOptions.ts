import { useEffect, useState } from 'react';
import { apiEnabled, listBranches } from '../api/client';
import { branches as fixtureBranches } from '../fixtures/adapter';

/**
 * Customer-facing branch choices come from the public API when configured.
 * The fixture list remains the local development fallback.
 */
export function useBranchOptions() {
  const [options, setOptions] = useState<string[]>(fixtureBranches);
  const [ready, setReady] = useState(!apiEnabled);

  useEffect(() => {
    if (!apiEnabled) return;
    let cancelled = false;
    void listBranches()
      .then((items) => {
        if (!cancelled && items.length) setOptions(items.map((item) => item.name));
      })
      .catch(() => {
        // The page keeps the fixture choices and displays its normal API error state.
      })
      .finally(() => {
        if (!cancelled) setReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return { options, ready };
}
