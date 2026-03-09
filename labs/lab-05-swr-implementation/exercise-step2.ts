// =============================================================================
// Lab 05 — Étape 2 : Stale serving
// =============================================================================
// Exécuter avec : npx tsx exercise-step2.ts
// Objectif : Servir des données stale pendant la revalidation.
// 10 tests à faire passer.
// =============================================================================

console.log("=== Lab 05 — Étape 2 : Stale serving ===\n");

// =============================================================================
// Classe StaleCache (extension du BasicCache)
// =============================================================================

interface StaleCacheEntry {
  value: unknown;
  storedAt: number;
  ttl: number;
  swr: number;
}

interface StaleCacheOptions {
  ttl?: number;
  swr?: number;
}

interface StaleCacheMetrics {
  hits: number;
  misses: number;
  staleServes: number;
}

type StaleCacheState = "fresh" | "stale" | "expired" | "miss";

interface StaleMetaResult {
  value: unknown;
  state: StaleCacheState;
}

class StaleCache {
  constructor() {
    // TODO: Initialiser le store et les métriques
    // 💡 this.store = new Map<string, StaleCacheEntry>();
    // 💡 this.metrics: StaleCacheMetrics = { hits: 0, misses: 0, staleServes: 0 };
  }

  /**
   * Stocke une valeur avec TTL et fenêtre SWR.
   */
  set(key: string, value: unknown, options: StaleCacheOptions = {}): void {
    // TODO: Stocker avec TTL et SWR
  }

  /**
   * Calcule l'état d'une entrée.
   */
  getState(key: string): StaleCacheState {
    // TODO: Calculer l'état de l'entrée
    return "miss";
  }

  /**
   * Récupère une valeur avec son état.
   */
  getWithMeta(key: string): StaleMetaResult | null {
    // TODO: Retourner la valeur + l'état
    return null;
  }

  /**
   * Récupère une valeur simple (null si miss ou expiré).
   */
  get(key: string): unknown | null {
    // TODO: Utiliser getWithMeta et retourner seulement la valeur
    return null;
  }

  /**
   * Vérifie si l'entrée est fraîche.
   */
  isFresh(key: string): boolean {
    // TODO
    return false;
  }

  /**
   * Vérifie si l'entrée est stale (périmée mais dans la fenêtre SWR).
   */
  isStale(key: string): boolean {
    // TODO
    return false;
  }

  /**
   * Vérifie si l'entrée est complètement expirée.
   */
  isExpired(key: string): boolean {
    // TODO
    return false;
  }

  /**
   * Retourne les métriques.
   */
  getMetrics(): StaleCacheMetrics {
    // TODO
    return { hits: 0, misses: 0, staleServes: 0 };
  }
}

// =============================================================================
// Tests (10 tests)
// =============================================================================

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

setTimeout(async () => {
  const cache = new StaleCache();
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

  // ---------------------------------------------------------------------------
  // Tests du cache basique (reprise de l'étape 1)
  // ---------------------------------------------------------------------------
  console.log("--- Cache basique ---\n");

  // Test 1 : set + get
  cache.set("key1", "value1", { ttl: 500, swr: 500 });
  assert(cache.get("key1") === "value1", "set + get fonctionne");

  // Test 2 : miss
  assert(cache.get("nope") === null, "Cache miss retourne null");

  // Test 3 : fresh
  assert(cache.isFresh("key1") === true, "Entrée fraîche → isFresh = true");

  // Test 4 : pas stale quand fresh
  assert(cache.isStale("key1") === false, "Entrée fraîche → isStale = false");

  // ---------------------------------------------------------------------------
  // Tests du stale serving
  // ---------------------------------------------------------------------------
  console.log("\n--- Stale serving ---\n");

  // Test 5 : Après TTL, l'entrée devient stale
  cache.set("key2", "fresh-value", { ttl: 100, swr: 300 });
  await sleep(150); // TTL expiré, mais dans la fenêtre SWR
  assert(cache.isStale("key2") === true, "Après TTL → isStale = true");

  // Test 6 : Une entrée stale retourne encore sa valeur
  assert(cache.get("key2") === "fresh-value", "Entrée stale retourne la valeur");

  // Test 7 : getWithMeta retourne l'état "stale"
  const meta = cache.getWithMeta("key2");
  assert(
    meta !== null && meta.state === "stale",
    'getWithMeta retourne state: "stale"'
  );

  // Test 8 : Après TTL + SWR, l'entrée est expired
  cache.set("key3", "temp-value", { ttl: 50, swr: 50 });
  await sleep(150); // Au-delà de TTL + SWR
  assert(cache.isExpired("key3") === true, "Après TTL + SWR → isExpired = true");

  // Test 9 : Entrée expired retourne null
  assert(cache.get("key3") === null, "Entrée expired → null");

  // Test 10 : Les métriques comptent correctement
  const metrics: StaleCacheMetrics = cache.getMetrics();
  console.log(
    `\n  Métriques : hits=${metrics.hits}, misses=${metrics.misses}, staleServes=${metrics.staleServes}`
  );
  assert(
    metrics.hits > 0 && metrics.staleServes > 0 && metrics.misses > 0,
    "Métriques : hits > 0, staleServes > 0, misses > 0"
  );

  // ---------------------------------------------------------------------------
  // Résultat
  // ---------------------------------------------------------------------------
  console.log(`\n📊 Étape 2 : ${passed}/${total} tests passés`);
  if (passed === total) {
    console.log("✅ Étape 2 complète ! Passez à exercise-step3.ts");
  } else {
    console.log("💡 Corrigez les tests en échec avant de passer à l'étape 3");
  }

  console.log("\n=== Fin de l'étape 2 ===");
}, 0);
