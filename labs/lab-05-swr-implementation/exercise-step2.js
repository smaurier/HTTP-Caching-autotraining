// =============================================================================
// Lab 05 — Étape 2 : Stale serving
// =============================================================================
// Exécuter avec : node exercise-step2.js
// Objectif : Servir des données stale pendant la revalidation.
// 10 tests à faire passer.
// =============================================================================

console.log("=== Lab 05 — Étape 2 : Stale serving ===\n");

// =============================================================================
// Classe StaleCache (extension du BasicCache)
// =============================================================================
// Ajoutez la notion de "stale-while-revalidate" :
//   - Chaque entrée a un TTL (fraîcheur) et une fenêtre SWR
//   - Une entrée est "fresh" si age < TTL
//   - Une entrée est "stale" si TTL <= age < TTL + SWR
//   - Une entrée est "expired" si age >= TTL + SWR
//
// Quand une entrée est "stale", on la sert immédiatement ET on déclenche
// une revalidation en arrière-plan.
//
// 💡 Ajoutez un champ swr (stale-while-revalidate) en ms dans les options
// 💡 getWithMeta() retourne { value, state: "fresh"|"stale"|"expired" }
// =============================================================================

class StaleCache {
  constructor() {
    // TODO: Initialiser le store et les métriques
    // 💡 this.store = new Map();
    // 💡 this.metrics = { hits: 0, misses: 0, staleServes: 0 };
  }

  /**
   * Stocke une valeur avec TTL et fenêtre SWR.
   * @param {string} key
   * @param {*} value
   * @param {object} options - { ttl: number(ms), swr: number(ms) }
   */
  set(key, value, options = {}) {
    // TODO: Stocker avec TTL et SWR
    // 💡 this.store.set(key, {
    // 💡   value,
    // 💡   storedAt: Date.now(),
    // 💡   ttl: options.ttl || 5000,
    // 💡   swr: options.swr || 0,
    // 💡 });
  }

  /**
   * Calcule l'état d'une entrée.
   * @param {string} key
   * @returns {"fresh"|"stale"|"expired"|"miss"}
   */
  getState(key) {
    // TODO: Calculer l'état de l'entrée
    // 💡 const entry = this.store.get(key);
    // 💡 if (!entry) return "miss";
    // 💡 const age = Date.now() - entry.storedAt;
    // 💡 if (age < entry.ttl) return "fresh";
    // 💡 if (age < entry.ttl + entry.swr) return "stale";
    // 💡 return "expired";
  }

  /**
   * Récupère une valeur avec son état.
   * @param {string} key
   * @returns {{ value: *, state: string }|null}
   */
  getWithMeta(key) {
    // TODO: Retourner la valeur + l'état
    // 💡 const state = this.getState(key);
    // 💡 if (state === "miss" || state === "expired") {
    // 💡   this.metrics.misses++;
    // 💡   return null;
    // 💡 }
    // 💡 const entry = this.store.get(key);
    // 💡 if (state === "stale") this.metrics.staleServes++;
    // 💡 else this.metrics.hits++;
    // 💡 return { value: entry.value, state };
  }

  /**
   * Récupère une valeur simple (null si miss ou expiré).
   * @param {string} key
   * @returns {*|null}
   */
  get(key) {
    // TODO: Utiliser getWithMeta et retourner seulement la valeur
    // 💡 const result = this.getWithMeta(key);
    // 💡 return result ? result.value : null;
  }

  /**
   * Vérifie si l'entrée est fraîche.
   */
  isFresh(key) {
    // TODO
    // 💡 return this.getState(key) === "fresh";
  }

  /**
   * Vérifie si l'entrée est stale (périmée mais dans la fenêtre SWR).
   */
  isStale(key) {
    // TODO
    // 💡 return this.getState(key) === "stale";
  }

  /**
   * Vérifie si l'entrée est complètement expirée.
   */
  isExpired(key) {
    // TODO
    // 💡 const state = this.getState(key);
    // 💡 return state === "expired" || state === "miss";
  }

  /**
   * Retourne les métriques.
   */
  getMetrics() {
    // TODO
    // 💡 return { ...this.metrics };
  }
}

// =============================================================================
// Tests (10 tests)
// =============================================================================

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

setTimeout(async () => {
  const cache = new StaleCache();
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
  const metrics = cache.getMetrics();
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
    console.log("✅ Étape 2 complète ! Passez à exercise-step3.js");
  } else {
    console.log("💡 Corrigez les tests en échec avant de passer à l'étape 3");
  }

  console.log("\n=== Fin de l'étape 2 ===");
}, 0);
