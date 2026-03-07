// =============================================================================
// Lab 07 — Mini CDN
// =============================================================================
// Executer avec : node exercise.js
// =============================================================================

import http from "node:http";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------
const ORIGIN_PORT = 4070;
const EDGE_PORT = 4071;
const CACHE_TTL = 2000; // 2 secondes

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Effectue une requete HTTP et retourne { statusCode, headers, body } */
function httpRequest(options) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let body = "";
      res.on("data", (chunk) => (body += chunk));
      res.on("end", () =>
        resolve({ statusCode: res.statusCode, headers: res.headers, body })
      );
    });
    req.on("error", reject);
    req.end();
  });
}

/** Effectue un GET sur une URL et retourne { statusCode, headers, body } */
function httpGet(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let body = "";
      res.on("data", (chunk) => (body += chunk));
      res.on("end", () =>
        resolve({ statusCode: res.statusCode, headers: res.headers, body })
      );
    }).on("error", reject);
  });
}

// =============================================================================
// PARTIE 1 — Serveur d'origine
// =============================================================================
// Creer un serveur HTTP qui :
// - GET /api/articles → retourne une liste d'articles en JSON
// - GET /api/config   → retourne un objet de configuration en JSON
// - Autres routes     → retourne 404
//
// Chaque reponse doit contenir un timestamp pour prouver qu'elle est fraiche.
// Simuler une latence de 50ms pour rendre le cache plus visible.
// =============================================================================

let originRequestCount = 0;

const originServer = http.createServer((req, res) => {
  originRequestCount++;

  // TODO: Implementer le serveur d'origine
  // 💡 Utiliser setTimeout pour simuler une latence de 50ms
  // 💡 Pour /api/articles : retourner un JSON avec { articles: [...], servedAt, requestNumber }
  // 💡 Pour /api/config : retourner un JSON avec { theme: "dark", lang: "fr", servedAt, requestNumber }
  // 💡 Pour les autres routes : retourner 404 avec { error: "Not found" }
  // 💡 Toujours inclure Content-Type: application/json

  setTimeout(() => {
    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "TODO: PARTIE 1 non implementee" }));
  }, 50);
});

// =============================================================================
// PARTIE 2 — Noeud Edge (proxy cache)
// =============================================================================
// Creer un proxy HTTP qui :
// - Intercepte les requetes GET
// - Verifie son cache local
// - Si HIT (cache frais) → sert depuis le cache avec X-Cache: HIT
// - Si MISS → forward vers l'origine, stocke la reponse, retourne avec X-Cache: MISS
// - POST /purge?url=... → supprime l'entree du cache
// =============================================================================

const edgeCache = new Map();

// =============================================================================
// PARTIE 3 — Logique cache hit/miss/stale
// =============================================================================
// Implementer les fonctions suivantes pour gerer le cache de l'edge :
// - edgeCacheGet(url) : retourne l'entree si elle existe et est fraiche
// - edgeCacheSet(url, data) : stocke une entree avec un timestamp
// - isEdgeFresh(entry) : verifie si l'entree n'a pas depasse le TTL
// =============================================================================

function edgeCacheGet(url) {
  // TODO: Implementer la lecture du cache
  // 💡 Recuperer l'entree depuis edgeCache.get(url)
  // 💡 Si pas d'entree → retourner null
  // 💡 Si l'entree existe mais est stale → retourner null (et optionnellement supprimer)
  // 💡 Si l'entree existe et est fraiche → retourner l'entree
  return null;
}

function edgeCacheSet(url, statusCode, headers, body) {
  // TODO: Stocker la reponse dans le cache
  // 💡 Stocker { statusCode, headers, body, timestamp: Date.now() }
}

function isEdgeFresh(entry) {
  // TODO: Verifier la fraicheur de l'entree
  // 💡 Comparer Date.now() - entry.timestamp avec CACHE_TTL
  return false;
}

// =============================================================================
// PARTIE 4 — Proxy Edge avec purge
// =============================================================================

const edgeServer = http.createServer((req, res) => {
  // TODO: Implementer le noeud edge
  //
  // 💡 Si POST /purge?url=... :
  //    - Extraire l'URL du parametre query
  //    - Supprimer du cache avec edgeCache.delete(url)
  //    - Retourner 200 avec { purged: true, url }
  //
  // 💡 Si GET :
  //    - Verifier le cache avec edgeCacheGet(req.url)
  //    - Si HIT : retourner la reponse cachee avec le header X-Cache: HIT
  //    - Si MISS : forwarder vers l'origine avec http.request()
  //      - Stocker la reponse avec edgeCacheSet
  //      - Retourner la reponse avec le header X-Cache: MISS

  res.writeHead(501, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ error: "TODO: PARTIE 2/4 non implementee" }));
});

// =============================================================================
// Tests
// =============================================================================

async function runTests() {
  await new Promise((resolve) => originServer.listen(ORIGIN_PORT, resolve));
  await new Promise((resolve) => edgeServer.listen(EDGE_PORT, resolve));

  console.log(`\n🔬 Origine sur :${ORIGIN_PORT}, Edge sur :${EDGE_PORT}\n`);

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
    // ----- PARTIE 1 : Origine -----
    console.log("--- PARTIE 1 : Serveur d'origine ---");

    const o1 = await httpGet(`http://localhost:${ORIGIN_PORT}/api/articles`);
    assert("Origine /api/articles → 200", o1.statusCode === 200);
    const articles = JSON.parse(o1.body);
    assert(
      "Origine /api/articles → contient articles",
      Array.isArray(articles.articles)
    );
    assert(
      "Origine /api/articles → contient servedAt",
      typeof articles.servedAt === "number"
    );

    const o2 = await httpGet(`http://localhost:${ORIGIN_PORT}/api/config`);
    assert("Origine /api/config → 200", o2.statusCode === 200);
    const config = JSON.parse(o2.body);
    assert("Origine /api/config → contient theme", config.theme === "dark");

    const o3 = await httpGet(`http://localhost:${ORIGIN_PORT}/unknown`);
    assert("Origine /unknown → 404", o3.statusCode === 404);

    // ----- PARTIE 2+3 : Edge cache hit/miss -----
    console.log("\n--- PARTIE 2+3 : Edge cache hit/miss ---");
    edgeCache.clear();

    const e1 = await httpGet(`http://localhost:${EDGE_PORT}/api/articles`);
    assert("Edge #1 /api/articles → 200", e1.statusCode === 200);
    assert(
      "Edge #1 → X-Cache: MISS",
      e1.headers["x-cache"] === "MISS"
    );

    const e2 = await httpGet(`http://localhost:${EDGE_PORT}/api/articles`);
    assert("Edge #2 /api/articles → 200", e2.statusCode === 200);
    assert(
      "Edge #2 → X-Cache: HIT",
      e2.headers["x-cache"] === "HIT"
    );

    const body1 = JSON.parse(e1.body);
    const body2 = JSON.parse(e2.body);
    assert(
      "Edge #2 → meme contenu que #1 (cache)",
      body1.requestNumber === body2.requestNumber
    );

    // Attendre expiration TTL
    await new Promise((r) => setTimeout(r, CACHE_TTL + 500));

    const e3 = await httpGet(`http://localhost:${EDGE_PORT}/api/articles`);
    assert(
      "Edge #3 apres TTL → X-Cache: MISS",
      e3.headers["x-cache"] === "MISS"
    );
    const body3 = JSON.parse(e3.body);
    assert(
      "Edge #3 → nouveau contenu (requete fraiche)",
      body3.requestNumber !== body1.requestNumber
    );

    // ----- PARTIE 4 : Purge -----
    console.log("\n--- PARTIE 4 : Purge API ---");
    edgeCache.clear();

    // Remplir le cache
    await httpGet(`http://localhost:${EDGE_PORT}/api/config`);
    const beforePurge = await httpGet(
      `http://localhost:${EDGE_PORT}/api/config`
    );
    assert(
      "Avant purge → X-Cache: HIT",
      beforePurge.headers["x-cache"] === "HIT"
    );

    // Purger
    const purgeRes = await httpRequest({
      hostname: "localhost",
      port: EDGE_PORT,
      path: "/purge?url=/api/config",
      method: "POST",
    });
    assert("POST /purge → 200", purgeRes.statusCode === 200);
    const purgeBody = JSON.parse(purgeRes.body);
    assert("POST /purge → purged: true", purgeBody.purged === true);

    // Verifier que le cache est vide
    const afterPurge = await httpGet(
      `http://localhost:${EDGE_PORT}/api/config`
    );
    assert(
      "Apres purge → X-Cache: MISS",
      afterPurge.headers["x-cache"] === "MISS"
    );

    // ----- Resultat -----
    console.log(`\n========================================`);
    console.log(`  ${passed} passed, ${failed} failed`);
    console.log(`========================================\n`);
  } catch (err) {
    console.error("Erreur:", err.message);
  } finally {
    originServer.close();
    edgeServer.close();
  }
}

setTimeout(runTests, 0);
