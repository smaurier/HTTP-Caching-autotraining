// =============================================================================
// Lab 07 — Mini CDN
// =============================================================================
// Executer avec : npx tsx exercise.ts
// =============================================================================

import type { IncomingMessage, ServerResponse, RequestOptions, IncomingHttpHeaders } from "node:http";
import http from "node:http";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------
const ORIGIN_PORT: number = 4070;
const EDGE_PORT: number = 4071;
const CACHE_TTL: number = 2000; // 2 secondes

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface HttpResult {
  statusCode: number | undefined;
  headers: IncomingHttpHeaders;
  body: string;
}

/** Effectue une requete HTTP et retourne { statusCode, headers, body } */
function httpRequest(options: RequestOptions): Promise<HttpResult> {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let body = "";
      res.on("data", (chunk: Buffer) => (body += chunk));
      res.on("end", () =>
        resolve({ statusCode: res.statusCode, headers: res.headers, body })
      );
    });
    req.on("error", reject);
    req.end();
  });
}

/** Effectue un GET sur une URL et retourne { statusCode, headers, body } */
function httpGet(url: string): Promise<HttpResult> {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let body = "";
      res.on("data", (chunk: Buffer) => (body += chunk));
      res.on("end", () =>
        resolve({ statusCode: res.statusCode, headers: res.headers, body })
      );
    }).on("error", reject);
  });
}

// =============================================================================
// PARTIE 1 — Serveur d'origine
// =============================================================================

let originRequestCount: number = 0;

interface EdgeCacheEntry {
  statusCode: number;
  headers: IncomingHttpHeaders;
  body: string;
  timestamp: number;
}

const originServer = http.createServer((req: IncomingMessage, res: ServerResponse) => {
  originRequestCount++;

  // TODO: Implementer le serveur d'origine
  setTimeout(() => {
    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "TODO: PARTIE 1 non implementee" }));
  }, 50);
});

// =============================================================================
// PARTIE 2 — Noeud Edge (proxy cache)
// =============================================================================

const edgeCache = new Map<string, EdgeCacheEntry>();

// =============================================================================
// PARTIE 3 — Logique cache hit/miss/stale
// =============================================================================

function edgeCacheGet(url: string): EdgeCacheEntry | null {
  // TODO: Implementer la lecture du cache
  return null;
}

function edgeCacheSet(url: string, statusCode: number, headers: IncomingHttpHeaders, body: string): void {
  // TODO: Stocker la reponse dans le cache
}

function isEdgeFresh(entry: EdgeCacheEntry): boolean {
  // TODO: Verifier la fraicheur de l'entree
  return false;
}

// =============================================================================
// PARTIE 4 — Proxy Edge avec purge
// =============================================================================

const edgeServer = http.createServer((req: IncomingMessage, res: ServerResponse) => {
  // TODO: Implementer le noeud edge
  res.writeHead(501, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ error: "TODO: PARTIE 2/4 non implementee" }));
});

// =============================================================================
// Tests
// =============================================================================

async function runTests(): Promise<void> {
  await new Promise<void>((resolve) => originServer.listen(ORIGIN_PORT, resolve));
  await new Promise<void>((resolve) => edgeServer.listen(EDGE_PORT, resolve));

  console.log(`\n🔬 Origine sur :${ORIGIN_PORT}, Edge sur :${EDGE_PORT}\n`);

  let passed: number = 0;
  let failed: number = 0;

  function assert(label: string, condition: boolean): void {
    if (condition) {
      console.log(`  ✅ ${label}`);
      passed++;
    } else {
      console.log(`  ❌ ${label}`);
      failed++;
    }
  }

  try {
    console.log("--- PARTIE 1 : Serveur d'origine ---");

    const o1 = await httpGet(`http://localhost:${ORIGIN_PORT}/api/articles`);
    assert("Origine /api/articles → 200", o1.statusCode === 200);
    const articles = JSON.parse(o1.body);
    assert("Origine /api/articles → contient articles", Array.isArray(articles.articles));
    assert("Origine /api/articles → contient servedAt", typeof articles.servedAt === "number");

    const o2 = await httpGet(`http://localhost:${ORIGIN_PORT}/api/config`);
    assert("Origine /api/config → 200", o2.statusCode === 200);
    const config = JSON.parse(o2.body);
    assert("Origine /api/config → contient theme", config.theme === "dark");

    const o3 = await httpGet(`http://localhost:${ORIGIN_PORT}/unknown`);
    assert("Origine /unknown → 404", o3.statusCode === 404);

    console.log("\n--- PARTIE 2+3 : Edge cache hit/miss ---");
    edgeCache.clear();

    const e1 = await httpGet(`http://localhost:${EDGE_PORT}/api/articles`);
    assert("Edge #1 /api/articles → 200", e1.statusCode === 200);
    assert("Edge #1 → X-Cache: MISS", e1.headers["x-cache"] === "MISS");

    const e2 = await httpGet(`http://localhost:${EDGE_PORT}/api/articles`);
    assert("Edge #2 /api/articles → 200", e2.statusCode === 200);
    assert("Edge #2 → X-Cache: HIT", e2.headers["x-cache"] === "HIT");

    const body1 = JSON.parse(e1.body);
    const body2 = JSON.parse(e2.body);
    assert("Edge #2 → meme contenu que #1 (cache)", body1.requestNumber === body2.requestNumber);

    await new Promise((r) => setTimeout(r, CACHE_TTL + 500));

    const e3 = await httpGet(`http://localhost:${EDGE_PORT}/api/articles`);
    assert("Edge #3 apres TTL → X-Cache: MISS", e3.headers["x-cache"] === "MISS");
    const body3 = JSON.parse(e3.body);
    assert("Edge #3 → nouveau contenu (requete fraiche)", body3.requestNumber !== body1.requestNumber);

    console.log("\n--- PARTIE 4 : Purge API ---");
    edgeCache.clear();

    await httpGet(`http://localhost:${EDGE_PORT}/api/config`);
    const beforePurge = await httpGet(`http://localhost:${EDGE_PORT}/api/config`);
    assert("Avant purge → X-Cache: HIT", beforePurge.headers["x-cache"] === "HIT");

    const purgeRes = await httpRequest({
      hostname: "localhost",
      port: EDGE_PORT,
      path: "/purge?url=/api/config",
      method: "POST",
    });
    assert("POST /purge → 200", purgeRes.statusCode === 200);
    const purgeBody = JSON.parse(purgeRes.body);
    assert("POST /purge → purged: true", purgeBody.purged === true);

    const afterPurge = await httpGet(`http://localhost:${EDGE_PORT}/api/config`);
    assert("Apres purge → X-Cache: MISS", afterPurge.headers["x-cache"] === "MISS");

    console.log(`\n========================================`);
    console.log(`  ${passed} passed, ${failed} failed`);
    console.log(`========================================\n`);
  } catch (err) {
    console.error("Erreur:", (err as Error).message);
  } finally {
    originServer.close();
    edgeServer.close();
  }
}

setTimeout(runTests, 0);
