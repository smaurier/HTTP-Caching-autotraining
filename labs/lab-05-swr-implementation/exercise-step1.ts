// =============================================================================
// Lab 05 — Étape 1 : Cache basique avec TTL
// =============================================================================
// Exécuter avec : npx tsx exercise-step1.ts
// Objectif : Implémenter un cache simple avec stockage, récupération et TTL.
// 5 tests à faire passer.
// =============================================================================

console.log("=== Lab 05 — Étape 1 : Cache basique ===\n");

// =============================================================================
// Classe BasicCache
// =============================================================================

interface BasicCacheEntry {
  value: unknown;
  storedAt: number;
  ttl: number;
}

class BasicCache {
  constructor() {
    // TODO: Initialiser le store
    // 💡 this.store = new Map<string, BasicCacheEntry>();
  }

  /**
   * Stocke une valeur dans le cache.
   * @param key - La clé
   * @param value - La valeur à stocker
   * @param ttlMs - Durée de vie en millisecondes (défaut: 5000)
   */
  set(key: string, value: unknown, ttlMs: number = 5000): void {
    // TODO: Stocker la valeur avec les métadonnées
  }

  /**
   * Récupère une valeur du cache.
   * Retourne null si la clé n'existe pas ou si le TTL est expiré.
   * @param key - La clé
   * @returns La valeur ou null
   */
  get(key: string): unknown | null {
    // TODO: Implémenter la récupération avec vérification du TTL
    return null;
  }

  /**
   * Vérifie si une clé existe et n'est pas expirée.
   * @param key - La clé
   */
  has(key: string): boolean {
    // TODO: Retourner true si get(key) ne retourne pas null
    // 💡 return this.get(key) !== null;
    return false;
  }

  /**
   * Retourne les métadonnées d'une entrée (sans vérifier le TTL).
   * Utile pour le debugging.
   * @param key - La clé
   * @returns Les métadonnées { value, storedAt, ttl } ou null
   */
  getMeta(key: string): BasicCacheEntry | null {
    // TODO: Retourner l'entrée brute du store (sans vérifier le TTL)
    return null;
  }

  /**
   * Supprime une entrée du cache.
   * @param key - La clé
   */
  delete(key: string): void {
    // TODO: Supprimer l'entrée du store
  }

  /**
   * Retourne le nombre d'entrées dans le cache.
   */
  get size(): number {
    // TODO: Retourner la taille du store
    return 0;
  }
}

// =============================================================================
// Tests (5 tests)
// =============================================================================

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

setTimeout(async () => {
  const cache = new BasicCache();
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
  // Test 1 : cache.set stocke les données
  // ---------------------------------------------------------------------------
  console.log("Test 1 : set() stocke les données");
  cache.set("user", { name: "Alice" }, 1000);
  assert(cache.size === 1, "Le cache contient 1 entrée");

  // ---------------------------------------------------------------------------
  // Test 2 : cache.get récupère les données
  // ---------------------------------------------------------------------------
  console.log("\nTest 2 : get() récupère les données");
  const user = cache.get("user") as { name: string } | null;
  assert(
    user !== null && user.name === "Alice",
    'get("user") retourne { name: "Alice" }'
  );

  // ---------------------------------------------------------------------------
  // Test 3 : cache miss retourne null
  // ---------------------------------------------------------------------------
  console.log("\nTest 3 : Cache miss retourne null");
  const missing = cache.get("nonexistent");
  assert(missing === null, 'get("nonexistent") retourne null');

  // ---------------------------------------------------------------------------
  // Test 4 : TTL expiration fonctionne
  // ---------------------------------------------------------------------------
  console.log("\nTest 4 : TTL expiration");
  cache.set("temp", "ephemeral", 100); // TTL de 100ms
  assert(cache.get("temp") === "ephemeral", "Avant expiration : valeur présente");

  await sleep(150); // Attendre que le TTL expire

  assert(cache.get("temp") === null, "Après expiration : null");

  // ---------------------------------------------------------------------------
  // Test 5 : Les métadonnées sont stockées
  // ---------------------------------------------------------------------------
  console.log("\nTest 5 : Métadonnées stockées");
  cache.set("meta-test", "value", 3000);
  const meta = cache.getMeta("meta-test");
  assert(
    meta !== null &&
      meta.value === "value" &&
      typeof meta.storedAt === "number" &&
      meta.ttl === 3000,
    "getMeta retourne { value, storedAt, ttl }"
  );

  // ---------------------------------------------------------------------------
  // Résultat
  // ---------------------------------------------------------------------------
  console.log(`\n📊 Étape 1 : ${passed}/${total} tests passés`);
  if (passed === total) {
    console.log("✅ Étape 1 complète ! Passez à exercise-step2.ts");
  } else {
    console.log("💡 Corrigez les tests en échec avant de passer à l'étape 2");
  }

  console.log("\n=== Fin de l'étape 1 ===");
}, 0);
