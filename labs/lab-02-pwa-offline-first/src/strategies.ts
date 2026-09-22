// strategies.ts — PAGE BLANCHE. Les TROIS stratégies de cache d'un Service Worker
// (module 15) — le cœur logique du handler `fetch`, extrait pour être testable sans
// navigateur : `navigator.serviceWorker`/`self.addEventListener("fetch", ...)`/la vraie
// Cache API n'existent que dans un vrai navigateur (jsdom ne les implémente pas), donc CE
// lab prouve la LOGIQUE des stratégies (ce qui compte vraiment) avec un Cache et un fetch
// FAUX mais fidèles à l'interface réelle — le code que tu écris ici se branche tel quel dans
// un vrai `sw.js`.
//
// export interface FakeCache { get(key: string): string | undefined; set(key: string, value: string): void }
// export type FakeFetch = (key: string) => Promise<string>; // rejette si "hors ligne"/échec réseau
//
// export async function cacheFirst(key: string, cache: FakeCache, fetch: FakeFetch): Promise<string>
//   - Cache d'abord : si `cache.get(key)` existe, le renvoie SANS jamais appeler `fetch`.
//   - Sinon, appelle `fetch(key)`, stocke le résultat dans le cache, le renvoie.
//
// export async function networkFirst(key: string, cache: FakeCache, fetch: FakeFetch): Promise<string>
//   - Réseau d'abord : tente `fetch(key)`. En cas de SUCCÈS, stocke dans le cache et renvoie.
//   - En cas d'ÉCHEC (fetch qui rejette — "hors ligne") : renvoie `cache.get(key)` si présent,
//     sinon relance l'erreur d'origine (rien à servir).
//
// export async function staleWhileRevalidate(key: string, cache: FakeCache, fetch: FakeFetch): Promise<string>
//   - Si le cache a une entrée : la renvoie IMMÉDIATEMENT (sans attendre le réseau), ET
//     déclenche `fetch(key)` en arrière-plan pour rafraîchir le cache pour la prochaine fois
//     (fire-and-forget — les erreurs de ce fetch d'arrière-plan sont avalées, elles ne
//     doivent JAMAIS faire échouer l'appel principal).
//   - Si le cache est vide : attend le réseau (comme cache-first quand il n'y a rien à
//     servir), stocke, renvoie.
export interface FakeCache {
  get(key: string): string | undefined;
  set(key: string, value: string): void;
}

export type FakeFetch = (key: string) => Promise<string>;

export async function cacheFirst(_key: string, _cache: FakeCache, _fetch: FakeFetch): Promise<string> {
  throw new Error("cacheFirst n'est pas encore implémenté");
}

export async function networkFirst(_key: string, _cache: FakeCache, _fetch: FakeFetch): Promise<string> {
  throw new Error("networkFirst n'est pas encore implémenté");
}

export async function staleWhileRevalidate(_key: string, _cache: FakeCache, _fetch: FakeFetch): Promise<string> {
  throw new Error("staleWhileRevalidate n'est pas encore implémenté");
}
