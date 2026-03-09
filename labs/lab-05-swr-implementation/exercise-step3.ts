// =============================================================================
// Lab 05 — Étape 3 : Full SWR + stale-if-error
// =============================================================================
// Exécuter avec : npx tsx exercise-step3.ts
// Objectif : Implémentation complète SWR avec background revalidation,
//            stale-if-error, coalescing et métriques.
// 20 tests à faire passer.
// =============================================================================

console.log("=== Lab 05 — Étape 3 : Full SWR ===\n");

// =============================================================================
// Classe FullSWRCache
// =============================================================================

interface CacheEntry {
  value: unknown;
  storedAt: number;
  ttl: number;
  swr: number;
  sie: number;
}

interface CacheOptions {
  ttl?: number;
  swr?: number;
  sie?: number;
}

interface CacheMetrics {
  hits: number;
  misses: number;
  staleServes: number;
  revalidations: number;
  revalidationErrors: number;
  coalescedRequests: number;
}

type CacheState = "fresh" | "stale" | "stale-error-only" | "expired" | "miss";

interface CacheMetaResult {
  value: unknown;
  state: CacheState;
  age: number;
}

class FullSWRCache {
  constructor() {
    // TODO: Initialiser
    // 💡 this.store = new Map<string, CacheEntry>();
    // 💡 this.pendingRevalidations = new Map<string, Promise<void>>();
    // 💡 this.metrics: CacheMetrics = {
    // 💡   hits: 0, misses: 0, staleServes: 0,
    // 💡   revalidations: 0, revalidationErrors: 0,
    // 💡   coalescedRequests: 0,
    // 💡 };
  }

  /**
   * Stocke une valeur avec TTL, SWR et SIE.
   */
  set(key: string, value: unknown, options: CacheOptions = {}): void {
    // TODO: Stocker l'entrée
  }

  /**
   * Calcule l'état d'une entrée.
   */
  getState(key: string): CacheState {
    // TODO: Implémenter avec le nouvel état stale-error-only
    return "miss";
  }

  /**
   * Récupère la valeur avec métadonnées.
   */
  getWithMeta(key: string): CacheMetaResult | null {
    // TODO: Retourner { value, state, age } ou null
    return null;
  }

  /**
   * Récupère une valeur simple.
   */
  get(key: string): unknown | null {
    // TODO
    return null;
  }

  isFresh(key: string): boolean {
    // TODO
    return false;
  }

  isStale(key: string): boolean {
    // TODO
    return false;
  }

  /**
   * Lance une revalidation en arrière-plan.
   * Implémente le coalescing : une seule revalidation à la fois par clé.
   */
  async revalidate(key: string, fetchFn: () => Promise<unknown>, options: CacheOptions = {}): Promise<void> {
    // TODO: Implémenter la revalidation avec coalescing
  }

  /**
   * Point d'entrée principal : get from cache or fetch.
   */
  async getOrFetch(key: string, fetchFn: () => Promise<unknown>, options: CacheOptions = {}): Promise<unknown> {
    // TODO: Implémenter la logique SWR complète
    return null;
  }

  /**
   * Retourne les métriques.
   */
  getMetrics(): CacheMetrics {
    // TODO
    return { hits: 0, misses: 0, staleServes: 0, revalidations: 0, revalidationErrors: 0, coalescedRequests: 0 };
  }

  /**
   * Vérifie si une revalidation est en cours pour une clé.
   */
  isRevalidating(key: string): boolean {
    // TODO
    return false;
  }

  /**
   * Attend la fin d'une revalidation en cours.
   * Utile pour les tests.
   */
  async waitForRevalidation(key: string): Promise<void> {
    // TODO
  }
}

// =============================================================================
// Helpers de test
// =============================================================================

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

let globalFetchCount: number = 0;

interface FetchResult {
  data: string;
  fetchNumber: number;
  timestamp: number;
}

function createFetcher(delay: number = 50, value: FetchResult | null = null): () => Promise<FetchResult> {
  return async () => {
    globalFetchCount++;
    const n: number = globalFetchCount;
    await sleep(delay);
    return value || { data: `fetch-${n}`, fetchNumber: n, timestamp: Date.now() };
  };
}

function createFailingFetcher(delay: number = 50): () => Promise<never> {
  return async () => {
    globalFetchCount++;
    await sleep(delay);
    throw new Error("Source de données indisponible");
  };
}

// =============================================================================
// Tests (20 tests)
// =============================================================================

setTimeout(async () => {
  let passed: number = 0;
  let total: number = 0;

  function assert(condition: boolean, message: string): void {
    total++;
    if (condition) {
      console.log(`  ✅ ${message}`);
      passed++;
    } else {
      console.log(`  ❌ ${message}`);
    }
  }

  // ===========================================================================
  // Groupe 1 : Cache basique (tests 1-5)
  // ===========================================================================
  console.log("--- Groupe 1 : Cache basique ---\n");

  const cache1 = new FullSWRCache();

  cache1.set("k1", "v1", { ttl: 500 });
  assert(cache1.get("k1") === "v1", "T01: set + get fonctionne");
  assert(cache1.get("unknown") === null, "T02: Cache miss → null");
  assert(cache1.isFresh("k1") === true, "T03: Entrée fraîche → isFresh");
  assert(cache1.isStale("k1") === false, "T04: Entrée fraîche → pas stale");

  cache1.set("k2", "v2", { ttl: 50 });
  await sleep(80);
  assert(cache1.isFresh("k2") === false, "T05: Après TTL → pas fresh");

  // ===========================================================================
  // Groupe 2 : États stale (tests 6-10)
  // ===========================================================================
  console.log("\n--- Groupe 2 : États stale ---\n");

  const cache2 = new FullSWRCache();

  cache2.set("s1", "stale-value", { ttl: 50, swr: 200 });
  await sleep(80);
  assert(cache2.isStale("s1") === true, "T06: TTL expiré dans fenêtre SWR → stale");
  assert(cache2.get("s1") === "stale-value", "T07: Entrée stale retourne la valeur");

  const meta = cache2.getWithMeta("s1");
  assert(meta !== null && meta.state === "stale", 'T08: getWithMeta.state === "stale"');

  cache2.set("s2", "temp", { ttl: 30, swr: 30 });
  await sleep(100);
  assert(cache2.get("s2") === null, "T09: Après TTL + SWR → null");

  cache2.set("s3", "sie-value", { ttl: 30, swr: 30, sie: 200 });
  await sleep(80);
  const state10: CacheState = cache2.getState("s3");
  assert(state10 === "stale-error-only", 'T10: Après TTL + SWR, dans SIE → "stale-error-only"');

  // ===========================================================================
  // Groupe 3 : getOrFetch (tests 11-15)
  // ===========================================================================
  console.log("\n--- Groupe 3 : getOrFetch ---\n");

  const cache3 = new FullSWRCache();
  globalFetchCount = 0;

  const val11 = (await cache3.getOrFetch("f1", createFetcher(30), { ttl: 200, swr: 200 })) as FetchResult;
  assert(val11 !== null && val11.fetchNumber === 1, "T11: Premier getOrFetch → fetch #1");

  const val12 = (await cache3.getOrFetch("f1", createFetcher(30), { ttl: 200, swr: 200 })) as FetchResult;
  assert(val12.fetchNumber === 1, "T12: Deuxième getOrFetch (fresh) → cache hit, même fetchNumber");

  const metrics13: CacheMetrics = cache3.getMetrics();
  assert(metrics13.hits >= 1, "T13: Au moins 1 hit dans les métriques");

  await sleep(250);
  const val14 = (await cache3.getOrFetch("f1", createFetcher(30), { ttl: 200, swr: 200 })) as FetchResult;
  assert(val14.fetchNumber === 1, "T14: getOrFetch stale → retourne l'ancienne valeur immédiatement");

  await cache3.waitForRevalidation("f1");
  const val15 = cache3.get("f1") as FetchResult | null;
  assert(val15 !== null && val15.fetchNumber > 1, "T15: Après revalidation → nouvelle valeur en cache");

  // ===========================================================================
  // Groupe 4 : Revalidation & coalescing (tests 16-18)
  // ===========================================================================
  console.log("\n--- Groupe 4 : Revalidation & coalescing ---\n");

  const cache4 = new FullSWRCache();
  globalFetchCount = 0;

  cache4.set("c1", "original", { ttl: 30, swr: 500 });
  await sleep(50);

  const fetcherC = createFetcher(80);
  cache4.revalidate("c1", fetcherC, { ttl: 300, swr: 500 });
  assert(cache4.isRevalidating("c1") === true, "T16: Revalidation en cours");

  const beforeCoalesce: number = globalFetchCount;
  cache4.revalidate("c1", fetcherC, { ttl: 300, swr: 500 });
  assert(globalFetchCount === beforeCoalesce, "T17: Coalescing — pas de deuxième fetch");

  await cache4.waitForRevalidation("c1");
  const val18 = cache4.get("c1") as FetchResult | null;
  assert(val18 !== null && typeof val18 === "object" && val18.fetchNumber === 1, "T18: Après revalidation → nouvelle valeur");

  // ===========================================================================
  // Groupe 5 : stale-if-error (tests 19-20)
  // ===========================================================================
  console.log("\n--- Groupe 5 : stale-if-error ---\n");

  const cache5 = new FullSWRCache();

  cache5.set("e1", "fallback-value", { ttl: 30, swr: 50, sie: 500 });
  await sleep(100);

  const val19 = await cache5.getOrFetch("e1", createFailingFetcher(30), { ttl: 30, swr: 50, sie: 500 });
  await cache5.waitForRevalidation("e1");
  assert(val19 === "fallback-value", "T19: stale-if-error → retourne la valeur stale");

  const metrics20: CacheMetrics = cache5.getMetrics();
  assert(metrics20.revalidationErrors >= 1, "T20: revalidationErrors >= 1 dans les métriques");

  // ===========================================================================
  // Résultat final
  // ===========================================================================
  console.log(`\n📊 Étape 3 : ${passed}/${total} tests passés`);
  if (passed === total) {
    console.log("✅ Félicitations ! Implémentation SWR complète !");
    console.log("   Vous maîtrisez stale-while-revalidate, stale-if-error et le coalescing.");
  } else {
    console.log("💡 Continuez à travailler sur les tests en échec.");
    console.log("   Relisez les indices (💡) dans le code.");
  }

  console.log("\n--- Métriques finales ---");
  console.log("Cache 3:", cache3.getMetrics());
  console.log("Cache 4:", cache4.getMetrics());
  console.log("Cache 5:", cache5.getMetrics());

  console.log("\n=== Fin de l'étape 3 ===");
}, 0);
