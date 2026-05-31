type CacheEntry<T> = { data: T; at: number };

const store = new Map<string, CacheEntry<unknown>>();
const inflight = new Map<string, Promise<unknown>>();

export function getCache<T>(key: string): T | undefined {
  return store.get(key)?.data as T | undefined;
}

export function setCache<T>(key: string, data: T) {
  store.set(key, { data, at: Date.now() });
}

export function invalidateCache(key: string | RegExp) {
  if (typeof key === 'string') {
    store.delete(key);
    inflight.delete(key);
    return;
  }
  for (const k of [...store.keys(), ...inflight.keys()]) {
    if (key.test(k)) {
      store.delete(k);
      inflight.delete(k);
    }
  }
}

export function clearDataCache() {
  store.clear();
  inflight.clear();
}

/** Return cached data immediately; refresh in background when stale exists. */
export async function fetchCached<T>(
  key: string,
  fetcher: () => Promise<T>,
  options?: { force?: boolean },
): Promise<T> {
  const cached = getCache<T>(key);
  if (cached && !options?.force) {
    void dedupeFetch(key, fetcher).catch(() => {});
    return cached;
  }
  return dedupeFetch(key, fetcher);
}

function dedupeFetch<T>(key: string, fetcher: () => Promise<T>): Promise<T> {
  const pending = inflight.get(key) as Promise<T> | undefined;
  if (pending) return pending;

  const promise = fetcher()
    .then((data) => {
      setCache(key, data);
      return data;
    })
    .finally(() => {
      inflight.delete(key);
    });

  inflight.set(key, promise);
  return promise;
}

export function prefetch<T>(key: string, fetcher: () => Promise<T>) {
  if (getCache(key) || inflight.has(key)) return;
  void dedupeFetch(key, fetcher).catch(() => {});
}

const AUTH_KEY = 'tugas_auth_ok';

let authMemory: boolean | null = null;

export function setAuthCached(ok: boolean) {
  authMemory = ok;
  if (ok) sessionStorage.setItem(AUTH_KEY, '1');
  else sessionStorage.removeItem(AUTH_KEY);
}

export function isAuthCached(): boolean {
  return authMemory === true || sessionStorage.getItem(AUTH_KEY) === '1';
}

export function clearAuthCache() {
  authMemory = null;
  sessionStorage.removeItem(AUTH_KEY);
}
