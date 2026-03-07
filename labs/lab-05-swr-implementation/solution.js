// =============================================================================
// Lab 05 — Stale-While-Revalidate — SOLUTION COMPLÈTE
// =============================================================================
// Exécuter avec : node solution.js
// =============================================================================

console.log("=== Lab 05 : Stale-While-Revalidate — SOLUTION ===\n");

// =============================================================================
// Classe FullSWRCache — Implémentation complète
// =============================================================================
// POURQUOI cette architecture ?
// stale-while-revalidate (SWR) est une stratégie de cache qui optimise la
// performance perçue par l'utilisateur :
// 1. Pendant le TTL → données fraîches, servies instantanément (HIT)
// 2. Après le TTL, dans la fenêtre SWR → données stale servies instantanément,
//    ET revalidation en arrière-plan (STALE SERVE)
// 3. Après TTL + SWR → les données sont trop vieilles, on doit refetch (MISS)
// 4. stale-if-error → si la revalidation échoue, on garde les données stale
//    plutôt que d'afficher une erreur
// =============================================================================

class FullSWRCache {
  constructor() {
    // POURQUOI une Map ? Performance O(1) pour get/set/has/delete.
    this.store = new Map();

    // POURQUOI tracker les revalidations en cours ?
    // Pour le "request coalescing" : si 10 requêtes arrivent en même temps
    // pour la même clé stale, on ne lance qu'UNE SEULE revalidation.
    this.pendingRevalidations = new Map();

    // POURQUOI des métriques ? Pour monitorer l'efficacité du cache en
    // production. Un bon cache a un ratio hits/misses élevé.
    this.metrics = {
      hits: 0,
      misses: 0,
      staleServes: 0,
      revalidations: 0,
      revalidationErrors: 0,
      coalescedRequests: 0,
    };
  }

  // ===========================================================================
  // set(key, value, options)
  // ===========================================================================
  // POURQUOI stocker storedAt ? Pour calculer l'âge de l'entrée dynamiquement.
  // On ne stocke pas de "expiresAt" car on a besoin de l'âge pour déterminer
  // dans quelle fenêtre on se trouve (fresh, stale, stale-error-only, expired).
  // ===========================================================================

  set(key, value, options = {}) {
    this.store.set(key, {
      value,
      storedAt: Date.now(),
      ttl: options.ttl || 5000,
      swr: options.swr || 0,
      sie: options.sie || 0,
    });
  }

  // ===========================================================================
  // getState(key)
  // ===========================================================================
  // POURQUOI 4 états distincts ?
  // - "fresh"           : age < ttl → servir tel quel
  // - "stale"           : ttl <= age < ttl + swr → servir + revalider
  // - "stale-error-only": ttl + swr <= age < ttl + swr + sie → servir SEULEMENT
  //                       si la revalidation échoue (fallback)
  // - "expired"         : age >= ttl + swr + sie → ne plus servir du tout
  // - "miss"            : clé absente
  //
  // La timeline :
  //   |------- fresh -------|-- stale (SWR) --|-- stale-if-error --|-- expired --→
  //   0                    ttl            ttl+swr            ttl+swr+sie
  // ===========================================================================

  getState(key) {
    const entry = this.store.get(key);
    if (!entry) return "miss";

    const age = Date.now() - entry.storedAt;

    if (age < entry.ttl) return "fresh";
    if (age < entry.ttl + entry.swr) return "stale";
    if (entry.sie > 0 && age < entry.ttl + entry.swr + entry.sie)
      return "stale-error-only";
    return "expired";
  }

  // ===========================================================================
  // getWithMeta(key)
  // ===========================================================================
  // POURQUOI retourner les métadonnées ? Pour permettre au consommateur de
  // savoir s'il reçoit des données fraîches ou stale, et d'agir en conséquence
  // (ex: afficher un indicateur "données en cours de mise à jour").
  // ===========================================================================

  getWithMeta(key) {
    const state = this.getState(key);

    if (state === "miss" || state === "expired") {
      this.metrics.misses++;
      return null;
    }

    const entry = this.store.get(key);
    const age = Date.now() - entry.storedAt;

    if (state === "stale" || state === "stale-error-only") {
      this.metrics.staleServes++;
    } else {
      this.metrics.hits++;
    }

    return { value: entry.value, state, age };
  }

  // ===========================================================================
  // get(key)
  // ===========================================================================
  // POURQUOI un get simplifié ? La plupart des consommateurs ne veulent que
  // la valeur, pas les métadonnées.
  // ===========================================================================

  get(key) {
    const result = this.getWithMeta(key);
    return result ? result.value : null;
  }

  isFresh(key) {
    return this.getState(key) === "fresh";
  }

  isStale(key) {
    return this.getState(key) === "stale";
  }

  isExpired(key) {
    const state = this.getState(key);
    return state === "expired" || state === "miss";
  }

  // ===========================================================================
  // revalidate(key, fetchFn, options)
  // ===========================================================================
  // POURQUOI le coalescing ? Imaginez une page avec 50 composants qui demandent
  // la même donnée en même temps. Sans coalescing, on lancerait 50 requêtes
  // réseau identiques. Avec le coalescing, on en lance une seule et les 49
  // autres attendent le même résultat.
  //
  // POURQUOI stale-if-error ? En production, les sources de données tombent
  // parfois en panne. Plutôt que d'afficher une erreur, on préfère montrer
  // des données un peu vieilles. C'est le principe du "graceful degradation".
  // ===========================================================================

  async revalidate(key, fetchFn, options = {}) {
    // POURQUOI vérifier pendingRevalidations ?
    // C'est le coeur du coalescing. Si une revalidation est déjà en cours
    // pour cette clé, on retourne la même promesse sans en lancer une nouvelle.
    if (this.pendingRevalidations.has(key)) {
      this.metrics.coalescedRequests++;
      return this.pendingRevalidations.get(key);
    }

    const revalidationPromise = (async () => {
      try {
        this.metrics.revalidations++;
        const newValue = await fetchFn();

        // POURQUOI réutiliser les options ? Pour que la nouvelle entrée ait
        // les mêmes paramètres de cache (TTL, SWR, SIE) que l'originale.
        this.set(key, newValue, options);
      } catch (err) {
        this.metrics.revalidationErrors++;

        // POURQUOI garder la valeur existante en cas d'erreur ?
        // C'est stale-if-error : mieux vaut des données vieilles que pas
        // de données du tout. On "rafraîchit" le timestamp pour prolonger
        // la fenêtre stale-if-error.
        const entry = this.store.get(key);
        if (entry) {
          // On place le storedAt pour que l'entrée soit au début de la
          // fenêtre "stale" — elle sera servie lors du prochain get.
          entry.storedAt = Date.now() - entry.ttl;
        }
      } finally {
        this.pendingRevalidations.delete(key);
      }
    })();

    this.pendingRevalidations.set(key, revalidationPromise);
    return revalidationPromise;
  }

  // ===========================================================================
  // getOrFetch(key, fetchFn, options)
  // ===========================================================================
  // POURQUOI c'est le point d'entrée principal ?
  // Cette méthode encapsule toute la logique SWR :
  // - fresh  → retour immédiat (pas de réseau)
  // - stale  → retour immédiat + revalidation en background
  // - miss   → fetch synchrone (le client attend)
  //
  // POURQUOI ne PAS await la revalidation en mode stale ?
  // Parce que le but de SWR est que le client ne soit JAMAIS bloqué.
  // Il reçoit les données stale instantanément. La revalidation met à jour
  // le cache en arrière-plan pour les PROCHAINES requêtes.
  // ===========================================================================

  async getOrFetch(key, fetchFn, options = {}) {
    const state = this.getState(key);

    if (state === "fresh") {
      this.metrics.hits++;
      return this.store.get(key).value;
    }

    if (state === "stale" || state === "stale-error-only") {
      this.metrics.staleServes++;
      const staleValue = this.store.get(key).value;

      // POURQUOI pas de await ? C'est le coeur de SWR.
      // La revalidation se fait en arrière-plan, le client n'attend pas.
      this.revalidate(key, fetchFn, options);

      return staleValue;
    }

    // miss ou expired → le client doit attendre
    this.metrics.misses++;
    const value = await fetchFn();
    this.set(key, value, options);
    return value;
  }

  getMetrics() {
    return { ...this.metrics };
  }

  isRevalidating(key) {
    return this.pendingRevalidations.has(key);
  }

  async waitForRevalidation(key) {
    const pending = this.pendingRevalidations.get(key);
    if (pending) await pending;
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
// Tests complets (20 tests)
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

  // Test 14 : SWR — retourne la valeur stale immédiatement
  await sleep(250);
  const val14 = await cache3.getOrFetch("f1", createFetcher(30), {
    ttl: 200,
    swr: 200,
  });
  assert(
    val14.fetchNumber === 1,
    "T14: getOrFetch stale → retourne l'ancienne valeur immédiatement"
  );

  // Test 15 : Après revalidation, nouvelle valeur en cache
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

  cache4.set("c1", "original", { ttl: 30, swr: 500 });
  await sleep(50);

  // Test 16
  const fetcherC = createFetcher(80);
  cache4.revalidate("c1", fetcherC, { ttl: 300, swr: 500 });
  assert(cache4.isRevalidating("c1") === true, "T16: Revalidation en cours");

  // Test 17
  const beforeCoalesce = globalFetchCount;
  cache4.revalidate("c1", fetcherC, { ttl: 300, swr: 500 });
  assert(
    globalFetchCount === beforeCoalesce,
    "T17: Coalescing — pas de deuxième fetch"
  );

  // Test 18
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

  cache5.set("e1", "fallback-value", { ttl: 30, swr: 50, sie: 500 });
  await sleep(100);

  // Test 19
  const val19 = await cache5.getOrFetch("e1", createFailingFetcher(30), {
    ttl: 30,
    swr: 50,
    sie: 500,
  });
  await cache5.waitForRevalidation("e1");
  assert(
    val19 === "fallback-value",
    "T19: stale-if-error → retourne la valeur stale"
  );

  // Test 20
  const metrics20 = cache5.getMetrics();
  assert(
    metrics20.revalidationErrors >= 1,
    "T20: revalidationErrors >= 1 dans les métriques"
  );

  // ===========================================================================
  // Résultat final
  // ===========================================================================
  console.log(`\n📊 Résultat : ${passed}/${total} tests passés`);
  if (passed === total) {
    console.log("✅ Tous les tests passent ! Implémentation SWR complète.");
  } else {
    console.log("❌ Certains tests échouent.");
  }

  console.log("\n--- Métriques finales ---");
  console.log("Cache 1:", cache1.getMetrics());
  console.log("Cache 2:", cache2.getMetrics());
  console.log("Cache 3:", cache3.getMetrics());
  console.log("Cache 4:", cache4.getMetrics());
  console.log("Cache 5:", cache5.getMetrics());

  console.log("\n=== Fin du Lab 05 ===");
}, 0);
