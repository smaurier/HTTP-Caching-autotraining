// =============================================================================
// Lab 06 — Strategies de cache (Solution)
// =============================================================================
// Executer avec : node solution.js
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

const CACHE_TTL = 2000;

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

async function cacheFirst(url) {
  // POURQUOI : on regarde le cache d'abord pour eviter les requetes reseau inutiles.
  // C'est la strategie la plus performante quand les donnees changent rarement.
  const entry = cacheGet(url);

  // POURQUOI : on verifie la fraicheur pour ne pas servir des donnees perimees.
  // Si l'entree existe et est fraiche, on la retourne directement (HIT).
  if (entry && isFresh(entry)) {
    return { source: "cache", data: entry.data };
  }

  // POURQUOI : si le cache est vide ou stale, on fait la requete reseau (MISS).
  // On stocke ensuite la reponse pour les prochaines requetes.
  const data = await fetchJSON(url);
  cacheSet(url, data);
  return { source: "network", data };
}

// =============================================================================
// PARTIE 2 — Strategie Network-First
// =============================================================================

async function networkFirst(url) {
  // POURQUOI : on essaie d'abord le reseau pour avoir les donnees les plus fraiches.
  // Cette strategie est ideale quand la fraicheur des donnees est prioritaire.
  try {
    const data = await fetchJSON(url);

    // POURQUOI : on stocke dans le cache pour avoir un fallback en cas de panne.
    cacheSet(url, data);
    return { source: "network", data };
  } catch (err) {
    // POURQUOI : en cas d'echec reseau, on tente le cache comme filet de securite.
    // On accepte meme les entrees stale — mieux vaut des donnees anciennes que rien.
    const entry = cacheGet(url);
    if (entry) {
      return { source: "cache_fallback", data: entry.data };
    }

    // POURQUOI : si ni le reseau ni le cache ne fonctionnent, on propage l'erreur.
    throw err;
  }
}

// =============================================================================
// PARTIE 3 — Pattern Stale-While-Revalidate (SWR)
// =============================================================================

async function staleWhileRevalidate(url) {
  const entry = cacheGet(url);

  if (entry) {
    const fresh = isFresh(entry);

    if (!fresh) {
      // POURQUOI : on lance la revalidation en arriere-plan SANS await.
      // L'utilisateur recoit immediatement la reponse stale pendant que
      // le cache se met a jour. C'est le meilleur compromis entre
      // performance (reponse instantanee) et fraicheur (mise a jour asynchrone).
      fetchJSON(url)
        .then((data) => cacheSet(url, data))
        .catch(() => {
          /* silently ignore revalidation errors */
        });
    }

    // POURQUOI : on retourne immediatement l'entree du cache.
    // La source indique si c'est fresh ou stale pour que l'appelant
    // puisse adapter son comportement (ex: afficher un indicateur "mise a jour...").
    return {
      source: fresh ? "cache_fresh" : "cache_stale",
      data: entry.data,
    };
  }

  // POURQUOI : si le cache est completement vide, on n'a pas le choix :
  // on doit attendre la requete reseau. C'est le seul cas ou SWR est "lent".
  const data = await fetchJSON(url);
  cacheSet(url, data);
  return { source: "network", data };
}

// =============================================================================
// PARTIE 4 — Predire l'ordre d'execution
// =============================================================================

function predictResults() {
  // POURQUOI : comprendre l'ordre d'execution aide a choisir la bonne strategie.
  //
  // Requete 1 : cacheFirst("/api/data") → cache vide → MISS → reseau
  // Requete 2 : cacheFirst("/api/data") → cache fresh → HIT → cache
  // (attente 3s — TTL de 2s expire)
  // Requete 3 : cacheFirst("/api/data") → cache stale → MISS → reseau
  // Requete 4 : networkFirst("/api/data") → reseau OK → NETWORK (pas un HIT cache)
  // Requete 5 : networkFirst("/fail") → 500 → fallback cache → HIT cache
  return [
    { source: "network", hit: false },
    { source: "cache", hit: true },
    { source: "network", hit: false },
    { source: "network", hit: false },
    { source: "cache_fallback", hit: true },
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

    await new Promise((r) => setTimeout(r, CACHE_TTL + 500));

    const swr3 = await staleWhileRevalidate(`${BASE}/api/swr`);
    assert(
      "SWR #3 (cache stale) → source = cache_stale",
      swr3.source === "cache_stale"
    );

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
