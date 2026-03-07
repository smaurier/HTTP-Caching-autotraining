// =============================================================================
// Lab 05 — Étape 1 : Cache basique avec TTL
// =============================================================================
// Exécuter avec : node exercise-step1.js
// Objectif : Implémenter un cache simple avec stockage, récupération et TTL.
// 5 tests à faire passer.
// =============================================================================

console.log("=== Lab 05 — Étape 1 : Cache basique ===\n");

// =============================================================================
// Classe BasicCache
// =============================================================================
// Implémentez un cache basique qui :
//   - Stocke des paires clé/valeur avec un TTL
//   - Retourne null pour les clés absentes ou expirées
//   - Stocke des métadonnées (timestamp de stockage, TTL)
//
// 💡 Utilisez une Map pour le stockage interne
// 💡 Chaque entrée : { value, storedAt, ttl }
// 💡 Date.now() retourne le timestamp en millisecondes
// =============================================================================

class BasicCache {
  constructor() {
    // TODO: Initialiser le store
    // 💡 this.store = new Map();
  }

  /**
   * Stocke une valeur dans le cache.
   * @param {string} key - La clé
   * @param {*} value - La valeur à stocker
   * @param {number} ttlMs - Durée de vie en millisecondes (défaut: 5000)
   */
  set(key, value, ttlMs = 5000) {
    // TODO: Stocker la valeur avec les métadonnées
    // 💡 this.store.set(key, {
    // 💡   value,
    // 💡   storedAt: Date.now(),
    // 💡   ttl: ttlMs,
    // 💡 });
  }

  /**
   * Récupère une valeur du cache.
   * Retourne null si la clé n'existe pas ou si le TTL est expiré.
   * @param {string} key - La clé
   * @returns {*|null} La valeur ou null
   */
  get(key) {
    // TODO: Implémenter la récupération avec vérification du TTL
    // 💡 1. Vérifier si la clé existe dans le store
    // 💡 2. Calculer l'âge : Date.now() - entry.storedAt
    // 💡 3. Si l'âge dépasse le TTL → supprimer l'entrée et retourner null
    // 💡 4. Sinon → retourner entry.value
  }

  /**
   * Vérifie si une clé existe et n'est pas expirée.
   * @param {string} key - La clé
   * @returns {boolean}
   */
  has(key) {
    // TODO: Retourner true si get(key) ne retourne pas null
    // 💡 return this.get(key) !== null;
  }

  /**
   * Retourne les métadonnées d'une entrée (sans vérifier le TTL).
   * Utile pour le debugging.
   * @param {string} key - La clé
   * @returns {object|null} Les métadonnées { value, storedAt, ttl } ou null
   */
  getMeta(key) {
    // TODO: Retourner l'entrée brute du store (sans vérifier le TTL)
    // 💡 return this.store.get(key) || null;
  }

  /**
   * Supprime une entrée du cache.
   * @param {string} key - La clé
   */
  delete(key) {
    // TODO: Supprimer l'entrée du store
    // 💡 this.store.delete(key);
  }

  /**
   * Retourne le nombre d'entrées dans le cache.
   * @returns {number}
   */
  get size() {
    // TODO: Retourner la taille du store
    // 💡 return this.store.size;
  }
}

// =============================================================================
// Tests (5 tests)
// =============================================================================

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

setTimeout(async () => {
  const cache = new BasicCache();
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
  // Test 1 : cache.set stocke les données
  // ---------------------------------------------------------------------------
  console.log("Test 1 : set() stocke les données");
  cache.set("user", { name: "Alice" }, 1000);
  assert(cache.size === 1, "Le cache contient 1 entrée");

  // ---------------------------------------------------------------------------
  // Test 2 : cache.get récupère les données
  // ---------------------------------------------------------------------------
  console.log("\nTest 2 : get() récupère les données");
  const user = cache.get("user");
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
    console.log("✅ Étape 1 complète ! Passez à exercise-step2.js");
  } else {
    console.log("💡 Corrigez les tests en échec avant de passer à l'étape 2");
  }

  console.log("\n=== Fin de l'étape 1 ===");
}, 0);
