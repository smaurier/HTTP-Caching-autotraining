// =============================================================================
// Lab 05 — Stale-While-Revalidate — Exercice complet
// =============================================================================
// Exécuter avec : npx tsx exercise.ts
// =============================================================================

console.log("=== Lab 05 : Stale-While-Revalidate ===\n");

// =============================================================================
// PARTIE 1 : Classe SWRCache
// =============================================================================
// Implémentez une classe SWRCache qui gère :
//   - Stockage avec TTL (Time To Live)
//   - Fenêtre stale-while-revalidate
//   - Fenêtre stale-if-error
//   - Revalidation en arrière-plan
//   - Métriques (hits, misses, stale serves, revalidations)
//
// 💡 Le cache utilise une Map interne pour stocker les entrées
// 💡 Chaque entrée contient : { value, storedAt, ttl, swr, sie }
// 💡 swr = stale-while-revalidate duration (ms)
// 💡 sie = stale-if-error duration (ms)
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
}

class SWRCache {
  constructor() {
    // TODO: Initialiser le store (Map) et les métriques
    // 💡 this.store = new Map<string, CacheEntry>();
    // 💡 this.metrics: CacheMetrics = { hits: 0, misses: 0, staleServes: 0, revalidations: 0 };
    // 💡 this.pendingRevalidations = new Map<string, Promise<void>>(); // pour le coalescing
  }

  // ===========================================================================
  // set(key, value, options)
  // ===========================================================================
  // Stocke une valeur avec ses options de cache.
  // options: { ttl: number(ms), swr: number(ms), sie: number(ms) }
  // 💡 Stockez aussi le timestamp (Date.now()) pour calculer la fraîcheur
  // ===========================================================================
  set(key: string, value: unknown, options: CacheOptions = {}): void {
    // TODO: Stocker l'entrée dans this.store
    // 💡 { value, storedAt: Date.now(), ttl: options.ttl || 5000, swr: ..., sie: ... }
  }

  // ===========================================================================
  // get(key)
  // ===========================================================================
  // Récupère une valeur du cache.
  // Retourne null si absente ou totalement expirée (au-delà de TTL + SWR).
  // 💡 Si fresh → return value (hit)
  // 💡 Si stale (dans fenêtre SWR) → return value + déclencher revalidation
  // 💡 Si expiré → return null (miss)
  // ===========================================================================
  get(key: string): unknown | null {
    // TODO: Implémenter la logique get avec SWR
    return null;
  }

  // ===========================================================================
  // isFresh(key) / isStale(key) / isExpired(key)
  // ===========================================================================
  // Helpers pour déterminer l'état d'une entrée.
  // 💡 fresh  : Date.now() - storedAt < ttl
  // 💡 stale  : ttl <= age < ttl + swr
  // 💡 expired: age >= ttl + swr
  // ===========================================================================
  isFresh(key: string): boolean {
    // TODO
    return false;
  }

  isStale(key: string): boolean {
    // TODO
    return false;
  }

  isExpired(key: string): boolean {
    // TODO
    return false;
  }

  // ===========================================================================
  // revalidate(key, fetchFn)
  // ===========================================================================
  // Lance une revalidation en arrière-plan.
  // fetchFn est une fonction async qui retourne la nouvelle valeur.
  // 💡 Utilisez le coalescing : si une revalidation est déjà en cours
  //    pour cette clé, ne pas en lancer une deuxième.
  // 💡 En cas d'erreur et si stale-if-error est configuré, garder la valeur stale
  // ===========================================================================
  async revalidate(key: string, fetchFn: () => Promise<unknown>): Promise<void> {
    // TODO: Implémenter la revalidation avec coalescing
    // 💡 if (this.pendingRevalidations.has(key)) return;
    // 💡 try { const newValue = await fetchFn(); this.set(key, newValue, ...); }
    // 💡 catch (err) { /* stale-if-error logic */ }
    // 💡 finally { this.pendingRevalidations.delete(key); }
  }

  // ===========================================================================
  // getOrFetch(key, fetchFn, options)
  // ===========================================================================
  // Méthode principale : récupère du cache ou fetch si nécessaire.
  // C'est le point d'entrée pour les consommateurs du cache.
  // 💡 Si fresh → retourner immédiatement
  // 💡 Si stale → retourner stale + revalidate en background
  // 💡 Si miss  → await fetchFn(), stocker, retourner
  // ===========================================================================
  async getOrFetch(key: string, fetchFn: () => Promise<unknown>, options: CacheOptions = {}): Promise<unknown> {
    // TODO: Implémenter la logique principale SWR
    return null;
  }

  // ===========================================================================
  // getMetrics()
  // ===========================================================================
  getMetrics(): CacheMetrics {
    // TODO: Retourner les métriques
    // return { ...this.metrics };
    return { hits: 0, misses: 0, staleServes: 0, revalidations: 0 };
  }
}

// =============================================================================
// PARTIE 2 : Simulateur de source de données lente
// =============================================================================
// Simule un appel réseau qui prend du temps.
// 💡 Utilisez pour tester le cache.
// =============================================================================

let fetchCount: number = 0;

async function slowDataSource(shouldFail: boolean = false): Promise<{ data: string; fetchNumber: number; timestamp: number }> {
  fetchCount++;
  const callNumber: number = fetchCount;

  // TODO: Simuler un délai de 200ms
  // 💡 await new Promise(resolve => setTimeout(resolve, 200));

  // TODO: Simuler une erreur si shouldFail est true
  // 💡 if (shouldFail) throw new Error("Source de données indisponible");

  // TODO: Retourner des données avec le numéro d'appel
  // 💡 return { data: "valeur", fetchNumber: callNumber, timestamp: Date.now() };
  return { data: "valeur", fetchNumber: callNumber, timestamp: Date.now() };
}

// =============================================================================
// PARTIE 3 : Tests
// =============================================================================

async function runTests(): Promise<void> {
  const cache = new SWRCache();
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

  // --- Test Group 1: Cache basique ---
  console.log("\n--- Cache basique ---\n");

  // TODO: Écrire les tests
  // 💡 Test: set + get retourne la valeur
  // 💡 Test: get sur clé inexistante retourne null
  // 💡 Test: isFresh retourne true pour une entrée fraîche
  // 💡 Test: Après expiration TTL, isFresh retourne false

  // --- Test Group 2: SWR ---
  console.log("\n--- Stale-While-Revalidate ---\n");

  // TODO: Écrire les tests SWR
  // 💡 Test: Entrée stale est servie
  // 💡 Test: Revalidation est déclenchée en arrière-plan
  // 💡 Test: Après revalidation, la valeur est mise à jour

  // --- Test Group 3: getOrFetch ---
  console.log("\n--- getOrFetch ---\n");

  // TODO: Écrire les tests getOrFetch
  // 💡 Test: Premier appel fait un fetch
  // 💡 Test: Deuxième appel utilise le cache
  // 💡 Test: Après TTL, stale + revalidation

  // --- Résultat ---
  console.log(`\n📊 Résultat : ${passed}/${total} tests passés`);
  if (passed === total) {
    console.log("✅ Tous les tests passent !");
  }
}

// =============================================================================
// Exécution
// =============================================================================

setTimeout(async () => {
  try {
    await runTests();
  } catch (err) {
    console.error("❌ Erreur lors des tests :", (err as Error).message);
  }
  console.log("\n=== Fin du Lab 05 ===");
}, 0);
