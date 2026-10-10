import { useEffect, useState } from 'react';
import { apiEnabled, hasAccessToken, listBranches } from '../api/client';
import { branches as fixtureBranches } from '../fixtures/adapter';

/**
 * Customer-facing branch choices come from the public API when configured.
 * The fixture list remains the local development fallback.
 */
export function useBranchOptions() {
  const useApi = apiEnabled && (hasAccessToken() || !import.meta.env.DEV);
  const [revision, setRevision] = useState(0);
  const requestKey = `${useApi ? 'api' : 'fixture'}:${revision}`;
  const [result, setResult] = useState<{
    key: string;
    options: string[];
    error: boolean;
  }>();

  useEffect(() => {
    if (!useApi) return;
    let cancelled = false;
    void listBranches()
      .then((items) => {
        if (!cancelled) setResult({ key: requestKey, options: items.map((item) => item.name), error: false });
      })
      .catch(() => {
        if (!cancelled) setResult({ key: requestKey, options: [], error: true });
      });
    return () => {
      cancelled = true;
    };
  }, [requestKey, useApi]);

  const resolved = useApi && result?.key === requestKey ? result : undefined;
  return {
    options: useApi ? resolved?.options ?? [] : fixtureBranches,
    ready: !useApi || !!resolved,
    error: !!resolved?.error,
    retry: () => setRevision((value) => value + 1),
  };
}
