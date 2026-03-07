// =============================================================================
// Lab 05 — Étape 3 : Full SWR + stale-if-error
// =============================================================================
// Exécuter avec : node exercise-step3.js
// Objectif : Implémentation complète SWR avec background revalidation,
//            stale-if-error, coalescing et métriques.
// 20 tests à faire passer.
// =============================================================================

console.log("=== Lab 05 — Étape 3 : Full SWR ===\n");

// =============================================================================
// Classe FullSWRCache
// =============================================================================
// Implémentation complète incluant :
//   - TTL + stale-while-revalidate + stale-if-error
//   - Background revalidation (ne bloque pas le client)
//   - Request coalescing (une seule revalidation par clé à la fois)
//   - Métriques détaillées
//
// 💡 Le coalescing empêche N requêtes concurrentes de lancer N revalidations
// 💡 stale-if-error : si la revalidation échoue, on garde la valeur stale
// =============================================================================

class FullSWRCache {
  constructor() {
    // TODO: Initialiser
    // 💡 this.store = new Map();
    // 💡 this.pendingRevalidations = new Map();
    // 💡 this.metrics = {
    // 💡   hits: 0, misses: 0, staleServes: 0,
    // 💡   revalidations: 0, revalidationErrors: 0,
    // 💡   coalescedRequests: 0,
    // 💡 };
  }

  /**
   * Stocke une valeur avec TTL, SWR et SIE.
   * @param {string} key
   * @param {*} value
   * @param {object} options - { ttl, swr, sie } en millisecondes
   */
  set(key, value, options = {}) {
    // TODO: Stocker l'entrée
    // 💡 { value, storedAt: Date.now(), ttl: options.ttl || 5000,
    // 💡   swr: options.swr || 0, sie: options.sie || 0 }
  }

  /**
   * Calcule l'état d'une entrée.
   * @returns {"fresh"|"stale"|"stale-error-only"|"expired"|"miss"}
   *
   * 💡 fresh           : age < ttl
   * 💡 stale           : ttl <= age < ttl + swr
   * 💡 stale-error-only: ttl + swr <= age < ttl + swr + sie
   * 💡 expired         : age >= ttl + swr + sie
   */
  getState(key) {
    // TODO: Implémenter avec le nouvel état stale-error-only
  }

  /**
   * Récupère la valeur avec métadonnées.
   */
  getWithMeta(key) {
    // TODO: Retourner { value, state, age } ou null
    // 💡 Comptabiliser dans les métriques selon l'état
  }

  /**
   * Récupère une valeur simple.
   */
  get(key) {
    // TODO
  }

  isFresh(key) {
    // TODO
  }

  isStale(key) {
    // TODO
  }

  /**
   * Lance une revalidation en arrière-plan.
   * Implémente le coalescing : une seule revalidation à la fois par clé.
   *
   * @param {string} key
   * @param {Function} fetchFn - async () => newValue
   * @param {object} options - Options de cache pour le nouveau stockage
   * @returns {Promise<void>}
   */
  async revalidate(key, fetchFn, options = {}) {
    // TODO: Implémenter la revalidation avec coalescing
    //
    // 💡 Coalescing :
    // if (this.pendingRevalidations.has(key)) {
    //   this.metrics.coalescedRequests++;
    //   return this.pendingRevalidations.get(key);
    // }
    //
    // 💡 Créer la promesse de revalidation :
    // const revalidationPromise = (async () => {
    //   try {
    //     this.metrics.revalidations++;
    //     const newValue = await fetchFn();
    //     this.set(key, newValue, options);
    //   } catch (err) {
    //     this.metrics.revalidationErrors++;
    //     // stale-if-error : on garde la valeur existante
    //     const entry = this.store.get(key);
    //     if (entry) {
    //       // Refresh le storedAt pour prolonger la durée de vie stale-if-error
    //       entry.storedAt = Date.now() - entry.ttl; // reste stale
    //     }
    //   } finally {
    //     this.pendingRevalidations.delete(key);
    //   }
    // })();
    //
    // 💡 this.pendingRevalidations.set(key, revalidationPromise);
    // 💡 return revalidationPromise;
  }

  /**
   * Point d'entrée principal : get from cache or fetch.
   *
   * @param {string} key
   * @param {Function} fetchFn - async () => value
   * @param {object} options - { ttl, swr, sie }
   * @returns {Promise<*>} La valeur (du cache ou fraîchement fetchée)
   */
  async getOrFetch(key, fetchFn, options = {}) {
    // TODO: Implémenter la logique SWR complète
    //
    // 💡 const state = this.getState(key);
    //
    // 💡 if (state === "fresh") {
    // 💡   this.metrics.hits++;
    // 💡   return this.store.get(key).value;
    // 💡 }
    //
    // 💡 if (state === "stale" || state === "stale-error-only") {
    // 💡   this.metrics.staleServes++;
    // 💡   const staleValue = this.store.get(key).value;
    // 💡   // Lancer la revalidation en arrière-plan (ne pas await !)
    // 💡   this.revalidate(key, fetchFn, options);
    // 💡   return staleValue;
    // 💡 }
    //
    // 💡 // miss ou expired → fetch synchrone
    // 💡 this.metrics.misses++;
    // 💡 const value = await fetchFn();
    // 💡 this.set(key, value, options);
    // 💡 return value;
  }

  /**
   * Retourne les métriques.
   */
  getMetrics() {
    // TODO
    // 💡 return { ...this.metrics };
  }

  /**
   * Vérifie si une revalidation est en cours pour une clé.
   */
  isRevalidating(key) {
    // TODO
    // 💡 return this.pendingRevalidations.has(key);
  }

  /**
   * Attend la fin d'une revalidation en cours.
   * Utile pour les tests.
   */
  async waitForRevalidation(key) {
    // TODO
    // 💡 const pending = this.pendingRevalidations.get(key);
    // 💡 if (pending) await pending;
  }
}

// =============================================================================
// Helpers de test
// =============================================================================

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

let globalFetchCount = 0;

function createFetcher(delay = 50, value = null) {
  return async () => {
    globalFetchCount++;
    const n = globalFetchCount;
    await sleep(delay);
    return value || { data: `fetch-${n}`, fetchNumber: n, timestamp: Date.now() };
  };
}

function createFailingFetcher(delay = 50) {
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
  let passed = 0;
  let total = 0;

  function assert(condition, message) {
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

  // Test 1
  cache1.set("k1", "v1", { ttl: 500 });
  assert(cache1.get("k1") === "v1", "T01: set + get fonctionne");

  // Test 2
  assert(cache1.get("unknown") === null, "T02: Cache miss → null");

  // Test 3
  assert(cache1.isFresh("k1") === true, "T03: Entrée fraîche → isFresh");

  // Test 4
  assert(cache1.isStale("k1") === false, "T04: Entrée fraîche → pas stale");

  // Test 5
  cache1.set("k2", "v2", { ttl: 50 });
  await sleep(80);
  assert(cache1.isFresh("k2") === false, "T05: Après TTL → pas fresh");

  // ===========================================================================
  // Groupe 2 : États stale (tests 6-10)
  // ===========================================================================
  console.log("\n--- Groupe 2 : États stale ---\n");

  const cache2 = new FullSWRCache();

  // Test 6
  cache2.set("s1", "stale-value", { ttl: 50, swr: 200 });
  await sleep(80);
  assert(cache2.isStale("s1") === true, "T06: TTL expiré dans fenêtre SWR → stale");

  // Test 7
  assert(cache2.get("s1") === "stale-value", "T07: Entrée stale retourne la valeur");

  // Test 8
  const meta = cache2.getWithMeta("s1");
  assert(
    meta !== null && meta.state === "stale",
    'T08: getWithMeta.state === "stale"'
  );

  // Test 9
  cache2.set("s2", "temp", { ttl: 30, swr: 30 });
  await sleep(100);
  assert(cache2.get("s2") === null, "T09: Après TTL + SWR → null");

  // Test 10
  cache2.set("s3", "sie-value", { ttl: 30, swr: 30, sie: 200 });
  await sleep(80);
  const state10 = cache2.getState("s3");
  assert(
    state10 === "stale-error-only",
    'T10: Après TTL + SWR, dans SIE → "stale-error-only"'
  );

  // ===========================================================================
  // Groupe 3 : getOrFetch (tests 11-15)
  // ===========================================================================
  console.log("\n--- Groupe 3 : getOrFetch ---\n");

  const cache3 = new FullSWRCache();
  globalFetchCount = 0;

  // Test 11
  const val11 = await cache3.getOrFetch("f1", createFetcher(30), {
    ttl: 200,
    swr: 200,
  });
  assert(
    val11 !== null && val11.fetchNumber === 1,
    "T11: Premier getOrFetch → fetch #1"
  );

  // Test 12
  const val12 = await cache3.getOrFetch("f1", createFetcher(30), {
    ttl: 200,
    swr: 200,
  });
  assert(
    val12.fetchNumber === 1,
    "T12: Deuxième getOrFetch (fresh) → cache hit, même fetchNumber"
  );

  // Test 13
  const metrics13 = cache3.getMetrics();
  assert(metrics13.hits >= 1, "T13: Au moins 1 hit dans les métriques");

  // Test 14
  await sleep(250); // TTL expiré, dans fenêtre SWR
  const val14 = await cache3.getOrFetch("f1", createFetcher(30), {
    ttl: 200,
    swr: 200,
  });
  assert(
    val14.fetchNumber === 1,
    "T14: getOrFetch stale → retourne l'ancienne valeur immédiatement"
  );

  // Test 15
  await cache3.waitForRevalidation("f1");
  const val15 = cache3.get("f1");
  assert(
    val15 !== null && val15.fetchNumber > 1,
    "T15: Après revalidation → nouvelle valeur en cache"
  );

  // ===========================================================================
  // Groupe 4 : Revalidation & coalescing (tests 16-18)
  // ===========================================================================
  console.log("\n--- Groupe 4 : Revalidation & coalescing ---\n");

  const cache4 = new FullSWRCache();
  globalFetchCount = 0;

  // Setup : valeur stale
  cache4.set("c1", "original", { ttl: 30, swr: 500 });
  await sleep(50);

  // Test 16 : Revalidation lancée
  const fetcherC = createFetcher(80);
  cache4.revalidate("c1", fetcherC, { ttl: 300, swr: 500 });
  assert(cache4.isRevalidating("c1") === true, "T16: Revalidation en cours");

  // Test 17 : Coalescing — deuxième revalidation ne lance pas un deuxième fetch
  const beforeCoalesce = globalFetchCount;
  cache4.revalidate("c1", fetcherC, { ttl: 300, swr: 500 });
  assert(
    globalFetchCount === beforeCoalesce,
    "T17: Coalescing — pas de deuxième fetch"
  );

  // Test 18 : Après revalidation, la valeur est à jour
  await cache4.waitForRevalidation("c1");
  const val18 = cache4.get("c1");
  assert(
    val18 !== null && typeof val18 === "object" && val18.fetchNumber === 1,
    "T18: Après revalidation → nouvelle valeur"
  );

  // ===========================================================================
  // Groupe 5 : stale-if-error (tests 19-20)
  // ===========================================================================
  console.log("\n--- Groupe 5 : stale-if-error ---\n");

  const cache5 = new FullSWRCache();

  // Setup : valeur stale avec sie
  cache5.set("e1", "fallback-value", { ttl: 30, swr: 50, sie: 500 });
  await sleep(100); // Au-delà de TTL + SWR, mais dans SIE

  // Test 19 : stale-if-error retourne la valeur stale quand le fetch échoue
  const val19 = await cache5.getOrFetch("e1", createFailingFetcher(30), {
    ttl: 30,
    swr: 50,
    sie: 500,
  });
  await cache5.waitForRevalidation("e1");
  // Après l'erreur de revalidation, la valeur stale devrait être préservée
  assert(
    val19 === "fallback-value",
    "T19: stale-if-error → retourne la valeur stale"
  );

  // Test 20 : Les métriques comptent les erreurs de revalidation
  const metrics20 = cache5.getMetrics();
  assert(
    metrics20.revalidationErrors >= 1,
    "T20: revalidationErrors >= 1 dans les métriques"
  );

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

  // Afficher les métriques finales de chaque cache
  console.log("\n--- Métriques finales ---");
  console.log("Cache 3:", cache3.getMetrics());
  console.log("Cache 4:", cache4.getMetrics());
  console.log("Cache 5:", cache5.getMetrics());

  console.log("\n=== Fin de l'étape 3 ===");
}, 0);
