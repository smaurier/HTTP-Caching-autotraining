// =============================================================================
// Lab 07 — Mini CDN (Solution)
// =============================================================================
// Executer avec : node solution.js
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

let originRequestCount = 0;

const originServer = http.createServer((req, res) => {
  originRequestCount++;
  const count = originRequestCount;

  // POURQUOI : on simule une latence pour rendre le benefice du cache observable.
  // En production, cette latence vient du reseau, de la base de donnees, etc.
  setTimeout(() => {
    if (req.url === "/api/articles") {
      // POURQUOI : on inclut requestNumber et servedAt pour pouvoir verifier
      // si la reponse vient du cache ou de l'origine.
      const data = {
        articles: [
          { id: 1, title: "Introduction au HTTP Caching" },
          { id: 2, title: "CDN et Edge Computing" },
          { id: 3, title: "Cache Invalidation Strategies" },
        ],
        servedAt: Date.now(),
        requestNumber: count,
      };
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(data));
      return;
    }

    if (req.url === "/api/config") {
      const data = {
        theme: "dark",
        lang: "fr",
        servedAt: Date.now(),
        requestNumber: count,
      };
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(data));
      return;
    }

    // POURQUOI : toute route inconnue retourne 404 — le CDN ne doit pas
    // cacher les 404 de la meme maniere que les 200.
    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Not found" }));
  }, 50);
});

// =============================================================================
// PARTIE 2+3 — Noeud Edge avec cache
// =============================================================================

const edgeCache = new Map();

function edgeCacheGet(url) {
  const entry = edgeCache.get(url);
  if (!entry) return null;

  // POURQUOI : on ne sert pas les entrees stale comme des HIT.
  // Un CDN doit revalider aupres de l'origine quand le TTL expire.
  if (!isEdgeFresh(entry)) {
    return null;
  }

  return entry;
}

function edgeCacheSet(url, statusCode, headers, body) {
  // POURQUOI : on stocke tout ce qui est necessaire pour reconstituer
  // la reponse HTTP complete sans contacter l'origine.
  edgeCache.set(url, {
    statusCode,
    headers,
    body,
    timestamp: Date.now(),
  });
}

function isEdgeFresh(entry) {
  // POURQUOI : le TTL determine combien de temps une reponse cachee
  // est consideree valide. Passe ce delai, le CDN doit re-fetcher.
  return Date.now() - entry.timestamp < CACHE_TTL;
}

// =============================================================================
// PARTIE 4 — Proxy Edge avec purge
// =============================================================================

const edgeServer = http.createServer((req, res) => {
  // POURQUOI : l'API de purge permet d'invalider le cache manuellement.
  // C'est indispensable quand le contenu change avant l'expiration du TTL
  // (ex: correction d'une erreur, mise a jour urgente).
  if (req.method === "POST" && req.url.startsWith("/purge")) {
    const urlObj = new URL(req.url, `http://localhost:${EDGE_PORT}`);
    const urlToPurge = urlObj.searchParams.get("url");

    if (urlToPurge) {
      edgeCache.delete(urlToPurge);
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ purged: true, url: urlToPurge }));
    } else {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Missing url parameter" }));
    }
    return;
  }

  // POURQUOI : on verifie le cache avant de contacter l'origine.
  // C'est le principe fondamental d'un CDN : servir depuis l'edge
  // pour reduire la latence et la charge sur l'origine.
  const cached = edgeCacheGet(req.url);

  if (cached) {
    // POURQUOI : le header X-Cache permet au client (et aux devtools)
    // de savoir si la reponse vient du cache ou de l'origine.
    res.writeHead(cached.statusCode, {
      ...cached.headers,
      "x-cache": "HIT",
      "x-cache-age": String(Date.now() - cached.timestamp),
    });
    res.end(cached.body);
    return;
  }

  // POURQUOI : en cas de MISS, on forward la requete vers l'origine.
  // Le CDN agit comme un proxy transparent.
  const proxyReq = http.request(
    {
      hostname: "localhost",
      port: ORIGIN_PORT,
      path: req.url,
      method: req.method,
      headers: req.headers,
    },
    (proxyRes) => {
      let body = "";
      proxyRes.on("data", (chunk) => (body += chunk));
      proxyRes.on("end", () => {
        // POURQUOI : on ne cache que les reponses 200. Les erreurs (404, 500)
        // ne doivent pas etre cachees pour eviter de servir des erreurs persistantes.
        if (proxyRes.statusCode === 200) {
          edgeCacheSet(req.url, proxyRes.statusCode, proxyRes.headers, body);
        }

        res.writeHead(proxyRes.statusCode, {
          ...proxyRes.headers,
          "x-cache": "MISS",
        });
        res.end(body);
      });
    }
  );

  proxyReq.on("error", (err) => {
    res.writeHead(502, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Bad Gateway", details: err.message }));
  });

  proxyReq.end();
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

    await httpGet(`http://localhost:${EDGE_PORT}/api/config`);
    const beforePurge = await httpGet(
      `http://localhost:${EDGE_PORT}/api/config`
    );
    assert(
      "Avant purge → X-Cache: HIT",
      beforePurge.headers["x-cache"] === "HIT"
    );

    const purgeRes = await httpRequest({
      hostname: "localhost",
      port: EDGE_PORT,
      path: "/purge?url=/api/config",
      method: "POST",
    });
    assert("POST /purge → 200", purgeRes.statusCode === 200);
    const purgeBody = JSON.parse(purgeRes.body);
    assert("POST /purge → purged: true", purgeBody.purged === true);

    const afterPurge = await httpGet(
      `http://localhost:${EDGE_PORT}/api/config`
    );
    assert(
      "Apres purge → X-Cache: MISS",
      afterPurge.headers["x-cache"] === "MISS"
    );

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
