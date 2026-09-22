// strategies.ts — SOLUTION DE RÉFÉRENCE (commentée). Ne l'ouvre pas avant ton GREEN.
export interface FakeCache {
  get(key: string): string | undefined;
  set(key: string, value: string): void;
}

export type FakeFetch = (key: string) => Promise<string>;

export async function cacheFirst(key: string, cache: FakeCache, fetch: FakeFetch): Promise<string> {
  const encache = cache.get(key);
  if (encache !== undefined) return encache;

  const reponse = await fetch(key);
  cache.set(key, reponse);
  return reponse;
}

export async function networkFirst(key: string, cache: FakeCache, fetch: FakeFetch): Promise<string> {
  try {
    const reponse = await fetch(key);
    cache.set(key, reponse);
    return reponse;
  } catch (erreur) {
    const encache = cache.get(key);
    if (encache !== undefined) return encache;
    throw erreur;
  }
}

export async function staleWhileRevalidate(key: string, cache: FakeCache, fetch: FakeFetch): Promise<string> {
  const encache = cache.get(key);
  if (encache !== undefined) {
    // Rafraîchit en arrière-plan, SANS jamais faire échouer l'appel principal — c'est la
    // nature même de "stale-while-revalidate" : on sert le périmé tout de suite, on ne fait
    // JAMAIS attendre l'utilisateur pour une donnée qu'on a déjà.
    fetch(key)
      .then((frais) => cache.set(key, frais))
      .catch(() => {});
    return encache;
  }

  const reponse = await fetch(key);
  cache.set(key, reponse);
  return reponse;
}
