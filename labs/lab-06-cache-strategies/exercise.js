// =============================================================================
// Lab 06 — Strategies de cache
// =============================================================================
// Executer avec : node exercise.js
// =============================================================================

import http from "node:http";

// ---------------------------------------------------------------------------
// Serveur d'origine simulant une API lente
// ---------------------------------------------------------------------------
let requestCount = 0;

const origin = http.createServer((req, res) => {
  requestCount++;
  const count = requestCount;

  // Simuler une latence reseau
  setTimeout(() => {
    if (req.url === "/fail") {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Server error" }));
      return;
    }

    res.writeHead(200, {
      "Content-Type": "application/json",
      "X-Request-Count": String(count),
    });
    res.end(
      JSON.stringify({
        url: req.url,
        data: `Response #${count}`,
        timestamp: Date.now(),
      })
    );
  }, 100);
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Effectue une requete HTTP GET et retourne le body parse en JSON */
function fetchJSON(url) {
  return new Promise((resolve, reject) => {
    const req = http.get(url, (res) => {
      let body = "";
      res.on("data", (chunk) => (body += chunk));
      res.on("end", () => {
        if (res.statusCode >= 400) {
          reject(new Error(`HTTP ${res.statusCode}: ${body}`));
          return;
        }
        try {
          resolve(JSON.parse(body));
        } catch {
          reject(new Error("Invalid JSON"));
        }
      });
    });
    req.on("error", reject);
  });
}

// ---------------------------------------------------------------------------
// Cache en memoire
// ---------------------------------------------------------------------------
const cache = new Map();

const CACHE_TTL = 2000; // 2 secondes

function cacheGet(key) {
  const entry = cache.get(key);
  if (!entry) return null;
  return entry;
}

function cacheSet(key, data) {
  cache.set(key, { data, timestamp: Date.now() });
}

function isFresh(entry) {
  return Date.now() - entry.timestamp < CACHE_TTL;
}

// =============================================================================
// PARTIE 1 — Strategie Cache-First
// =============================================================================
// La strategie Cache-First :
// 1. Verifier le cache
// 2. Si l'entree existe ET est fraiche → retourner depuis le cache (HIT)
// 3. Sinon → requete reseau → stocker dans le cache → retourner (MISS)
// =============================================================================

async function cacheFirst(url) {
  // TODO: Implementer la strategie Cache-First
  // 💡 Utiliser cacheGet(url) pour verifier le cache
  // 💡 Utiliser isFresh(entry) pour verifier la fraicheur
  // 💡 Utiliser fetchJSON(url) pour faire la requete reseau
  // 💡 Utiliser cacheSet(url, data) pour stocker dans le cache
  // 💡 Retourner { source: 'cache' | 'network', data }
  throw new Error("PARTIE 1 non implementee");
}

// =============================================================================
// PARTIE 2 — Strategie Network-First
// =============================================================================
// La strategie Network-First :
// 1. Tenter la requete reseau
// 2. Si succes → stocker dans le cache → retourner (NETWORK)
// 3. Si echec → verifier le cache (meme stale) → retourner (CACHE_FALLBACK)
// 4. Si rien → propager l'erreur
// =============================================================================

async function networkFirst(url) {
  // TODO: Implementer la strategie Network-First
  // 💡 Utiliser try/catch autour de fetchJSON(url)
  // 💡 En cas de succes : cacheSet puis retourner { source: 'network', data }
  // 💡 En cas d'echec : cacheGet (meme si stale) puis retourner { source: 'cache_fallback', data: entry.data }
  // 💡 Si pas de cache non plus : throw l'erreur
  throw new Error("PARTIE 2 non implementee");
}

// =============================================================================
// PARTIE 3 — Pattern Stale-While-Revalidate (SWR)
// =============================================================================
// Le pattern SWR :
// 1. Verifier le cache
// 2. Si l'entree existe (meme stale) → retourner immediatement (STALE ou FRESH)
// 3. Si stale → lancer la revalidation en arriere-plan (sans attendre)
// 4. Si aucun cache → requete reseau → stocker → retourner (NETWORK)
// =============================================================================

async function staleWhileRevalidate(url) {
  // TODO: Implementer le pattern SWR
  // 💡 Verifier le cache avec cacheGet(url)
  // 💡 Si l'entree existe :
  //    - Determiner si fresh ou stale avec isFresh(entry)
  //    - Si stale : lancer fetchJSON(url).then(data => cacheSet(url, data)) SANS await
  //    - Retourner { source: 'cache_fresh' | 'cache_stale', data: entry.data }
  // 💡 Si pas de cache :
  //    - fetchJSON(url), cacheSet, retourner { source: 'network', data }
  throw new Error("PARTIE 3 non implementee");
}

// =============================================================================
// PARTIE 4 — Predire l'ordre d'execution
// =============================================================================
// Etant donne la sequence suivante de requetes, predire pour chacune :
// - La source (cache, network, cache_fallback, cache_stale, cache_fresh)
// - Si c'est un HIT ou MISS
//
// Sequence :
// 1. cacheFirst("/api/data")       → ???
// 2. cacheFirst("/api/data")       → ???
// 3. attendre 3 secondes (TTL expire)
// 4. cacheFirst("/api/data")       → ???
// 5. networkFirst("/api/data")     → ???
// 6. networkFirst("/fail")         → ???
// =============================================================================

function predictResults() {
  // TODO: Remplir les predictions pour chaque requete
  // 💡 Requete 1 : le cache est vide, donc...
  // 💡 Requete 2 : le cache contient maintenant la reponse de 1, et TTL = 2s...
  // 💡 Requete 3 : on attend 3s, donc le TTL expire...
  // 💡 Requete 4 : apres expiration, cacheFirst va...
  // 💡 Requete 5 : networkFirst essaie le reseau d'abord...
  // 💡 Requete 6 : /fail retourne 500, donc networkFirst va...
  return [
    // { source: "???", hit: ??? },  // Requete 1
    // { source: "???", hit: ??? },  // Requete 2
    // { source: "???", hit: ??? },  // Requete 4 (apres attente)
    // { source: "???", hit: ??? },  // Requete 5
    // { source: "???", hit: ??? },  // Requete 6
  ];
}

// =============================================================================
// Tests
// =============================================================================

async function runTests() {
  const PORT = 3066;
  const BASE = `http://localhost:${PORT}`;

  await new Promise((resolve) => origin.listen(PORT, resolve));
  console.log(`\n🔬 Serveur d'origine demarre sur le port ${PORT}\n`);

  let passed = 0;
  let failed = 0;

  function assert(label, condition) {
    if (condition) {
      console.log(`  ✅ ${label}`);
      passed++;
    } else {
      console.log(`  ❌ ${label}`);
      failed++;
    }
  }

  try {
    // ----- PARTIE 1 : Cache-First -----
    console.log("--- PARTIE 1 : Cache-First ---");
    cache.clear();

    const cf1 = await cacheFirst(`${BASE}/api/data`);
    assert(
      "Cache-First #1 → source = network (MISS)",
      cf1.source === "network"
    );

    const cf2 = await cacheFirst(`${BASE}/api/data`);
    assert("Cache-First #2 → source = cache (HIT)", cf2.source === "cache");
    assert(
      "Cache-First #2 → meme data que #1",
      cf2.data.data === cf1.data.data
    );

    // Attendre expiration du TTL
    await new Promise((r) => setTimeout(r, CACHE_TTL + 500));

    const cf3 = await cacheFirst(`${BASE}/api/data`);
    assert(
      "Cache-First #3 apres TTL → source = network (MISS)",
      cf3.source === "network"
    );
    assert(
      "Cache-First #3 → data differente (nouvelle requete)",
      cf3.data.data !== cf1.data.data
    );

    // ----- PARTIE 2 : Network-First -----
    console.log("\n--- PARTIE 2 : Network-First ---");
    cache.clear();

    const nf1 = await networkFirst(`${BASE}/api/data`);
    assert("Network-First #1 → source = network", nf1.source === "network");

    // Requete sur endpoint qui echoue, mais le cache contient /api/data
    // On doit d'abord mettre quelque chose dans le cache pour /fail
    cacheSet(`${BASE}/fail`, { cached: true });

    const nf2 = await networkFirst(`${BASE}/fail`);
    assert(
      "Network-First /fail → source = cache_fallback",
      nf2.source === "cache_fallback"
    );
    assert(
      "Network-First /fail → data du cache",
      nf2.data.cached === true
    );

    // ----- PARTIE 3 : SWR -----
    console.log("\n--- PARTIE 3 : Stale-While-Revalidate ---");
    cache.clear();

    const swr1 = await staleWhileRevalidate(`${BASE}/api/swr`);
    assert("SWR #1 (pas de cache) → source = network", swr1.source === "network");

    const swr2 = await staleWhileRevalidate(`${BASE}/api/swr`);
    assert(
      "SWR #2 (cache fresh) → source = cache_fresh",
      swr2.source === "cache_fresh"
    );

    // Attendre expiration
    await new Promise((r) => setTimeout(r, CACHE_TTL + 500));

    const swr3 = await staleWhileRevalidate(`${BASE}/api/swr`);
    assert(
      "SWR #3 (cache stale) → source = cache_stale",
      swr3.source === "cache_stale"
    );

    // Attendre que la revalidation en arriere-plan se termine
    await new Promise((r) => setTimeout(r, 300));

    const swr4 = await staleWhileRevalidate(`${BASE}/api/swr`);
    assert(
      "SWR #4 (apres revalidation) → source = cache_fresh",
      swr4.source === "cache_fresh"
    );
    assert(
      "SWR #4 → data mise a jour par la revalidation",
      swr4.data.data !== swr3.data.data
    );

    // ----- PARTIE 4 : Predictions -----
    console.log("\n--- PARTIE 4 : Predictions ---");
    const predictions = predictResults();
    const expected = [
      { source: "network", hit: false },
      { source: "cache", hit: true },
      { source: "network", hit: false },
      { source: "network", hit: false },
      { source: "cache_fallback", hit: true },
    ];

    if (predictions.length === 0) {
      console.log("  ❌ Predictions non remplies (tableau vide)");
      failed++;
    } else {
      for (let i = 0; i < expected.length; i++) {
        const p = predictions[i] || {};
        assert(
          `Prediction ${i + 1} → source="${expected[i].source}", hit=${expected[i].hit}`,
          p.source === expected[i].source && p.hit === expected[i].hit
        );
      }
    }

    // ----- Resultat -----
    console.log(`\n========================================`);
    console.log(`  ${passed} passed, ${failed} failed`);
    console.log(`========================================\n`);
  } catch (err) {
    console.error("Erreur:", err.message);
  } finally {
    origin.close();
  }
}

setTimeout(runTests, 0);
