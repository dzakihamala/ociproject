import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchCached, getCache } from '../lib/dataCache';

export function useCachedQuery<T>(key: string, fetcher: () => Promise<T>, enabled = true) {
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  const initialCache = enabled ? getCache<T>(key) : undefined;
  const [data, setData] = useState<T | undefined>(initialCache);
  const [loading, setLoading] = useState(enabled && initialCache === undefined);
  const [error, setError] = useState<Error | null>(null);

  const refresh = useCallback(
    async (force = false) => {
      if (!enabled) return;
      const hadCache = !!getCache<T>(key);
      if (!hadCache || force) setLoading(true);
      setError(null);
      try {
        const result = await fetchCached(key, () => fetcherRef.current(), { force });
        setData(result);
      } catch (e) {
        const err = e instanceof Error ? e : new Error('Gagal memuat');
        setError(err);
        throw e;
      } finally {
        setLoading(false);
      }
    },
    [key, enabled],
  );

  useEffect(() => {
    if (!enabled) {
      setData(undefined);
      setLoading(false);
      setError(null);
      return;
    }
    const cached = getCache<T>(key);
    setData(cached);
    setLoading(cached === undefined);
    setError(null);
    void refresh(false);
  }, [key, enabled, refresh]);

  const isInitialLoad = loading && data === undefined;

  return { data, loading: isInitialLoad, error, refresh, setData };
}
