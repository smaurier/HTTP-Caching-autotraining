// =============================================================================
// Lab 08 — Reverse Proxy Cache
// =============================================================================
// Executer avec : npx tsx exercise.ts
// =============================================================================

import type { IncomingMessage, ServerResponse, IncomingHttpHeaders } from "node:http";
import http from "node:http";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------
const ORIGIN_PORT = 4080;
const PROXY_PORT = 4081;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface HttpResult {
  statusCode: number | undefined;
  headers: IncomingHttpHeaders;
  body: string;
}

interface ProxyCacheEntry {
  statusCode: number;
  headers: IncomingHttpHeaders;
  body: string;
  expires: number;
  varyHeader: string | null;
}

function httpGet(url: string, headers: Record<string, string> = {}): Promise<HttpResult> {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const req = http.request(
      {
        hostname: parsed.hostname,
        port: parsed.port,
        path: parsed.pathname + parsed.search,
        method: "GET",
        headers,
      },
      (res) => {
        let body = "";
        res.on("data", (chunk) => (body += chunk));
        res.on("end", () =>
          resolve({ statusCode: res.statusCode, headers: res.headers, body })
        );
      }
    );
    req.on("error", reject);
    req.end();
  });
}

// =============================================================================
// PARTIE 1 — Serveur d'origine avec differents types de contenu
// =============================================================================
// Creer un serveur avec les routes suivantes :
//
// GET /api/data
//   → Cache-Control: max-age=10
//   → Content-Type: application/json
//   → Body: { message: "Hello", servedAt: Date.now(), requestId: count }
//
// GET /api/private
//   → Cache-Control: private, no-store
//   → Content-Type: application/json
//   → Body: { secret: "token-xyz", servedAt: Date.now(), requestId: count }
//
// GET /api/varied
//   → Cache-Control: max-age=10
//   → Vary: Accept-Encoding
//   → Content-Type: application/json
//   → Body: { encoding: req.headers["accept-encoding"] || "identity", ... }
//
// GET /api/no-cache
//   → Cache-Control: no-cache
//   → Body: { ... }
// =============================================================================

let originCount: number = 0;

const originServer = http.createServer((req: IncomingMessage, res: ServerResponse) => {
  originCount++;
  const count = originCount;

  // TODO: Implementer les routes du serveur d'origine
  // 💡 Verifier req.url pour chaque route
  // 💡 /api/data → Cache-Control: max-age=10 (cacheable)
  // 💡 /api/private → Cache-Control: private, no-store (non cacheable par un proxy)
  // 💡 /api/varied → Cache-Control: max-age=10, Vary: Accept-Encoding
  // 💡 /api/no-cache → Cache-Control: no-cache (doit revalider)
  // 💡 Inclure requestId: count dans chaque reponse pour tracer les requetes

  res.writeHead(404, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ error: "TODO: PARTIE 1 non implementee" }));
});

// =============================================================================
// PARTIE 2 — Reverse Proxy (forward sans cache)
// =============================================================================
// Construire un proxy qui forward toutes les requetes vers l'origine.
// Pour l'instant, PAS de cache — juste du forwarding.
// =============================================================================

// =============================================================================
// PARTIE 3 — Couche de cache
// =============================================================================
// Ajouter le cache au proxy :
// - Avant de forwarder, verifier le cache
// - Apres avoir recu la reponse de l'origine :
//   - Parser Cache-Control
//   - Si no-store → ne pas cacher
//   - Si max-age=N → cacher avec TTL de N secondes
//   - Si no-cache → ne pas servir depuis le cache sans revalidation
// =============================================================================

const proxyCache = new Map<string, ProxyCacheEntry>();

function parseCacheControl(headerValue: string | undefined): Record<string, string | boolean> {
  // TODO: Parser le header Cache-Control et retourner un objet
  // 💡 Exemple: "max-age=10, public" → { "max-age": "10", "public": true }
  // 💡 Splitter par ", " puis par "="
  // 💡 Si pas de "=", la valeur est true (flag)
  return {};
}

function getCacheKey(url: string, reqHeaders: IncomingHttpHeaders, varyHeader: string | null): string | null {
  // TODO: Construire une cle de cache qui tient compte du Vary
  // 💡 Si pas de Vary → la cle est juste l'URL
  // 💡 Si Vary: Accept-Encoding → la cle inclut la valeur de Accept-Encoding
  // 💡 Format: url + "|" + headerName + "=" + headerValue
  // 💡 Si Vary: * → retourner null (ne jamais cacher)
  return url;
}

function shouldCache(cacheControl: Record<string, string | boolean>): boolean {
  // TODO: Determiner si la reponse doit etre cachee
  // 💡 no-store → false
  // 💡 private → false (un proxy partage ne doit pas cacher)
  // 💡 no-cache → false (simplification: on ne cache pas)
  // 💡 Sinon → true
  return false;
}

function getMaxAge(cacheControl: Record<string, string | boolean>): number {
  // TODO: Extraire max-age en millisecondes
  // 💡 Si max-age present → parseInt * 1000
  // 💡 Sinon → 0
  return 0;
}

// =============================================================================
// PARTIE 4 — Proxy avec cache Vary-aware
// =============================================================================

const proxyServer = http.createServer((req: IncomingMessage, res: ServerResponse) => {
  // TODO: Implementer le reverse proxy avec cache
  //
  // 💡 Etape 1 : Construire la cle de cache (pour l'instant juste l'URL)
  // 💡 Etape 2 : Verifier le cache
  //   - Si HIT et pas expire → servir avec X-Cache: HIT
  // 💡 Etape 3 : MISS → forwarder vers l'origine
  // 💡 Etape 4 : A la reception de la reponse :
  //   - Parser Cache-Control
  //   - Si Vary present, recalculer la cle avec getCacheKey
  //   - Si shouldCache() → stocker avec TTL de getMaxAge()
  //   - Retourner avec X-Cache: MISS
  //
  // 💡 Pour le cache : stocker { statusCode, headers, body, expires }
  // 💡 expires = Date.now() + maxAge

  res.writeHead(501, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ error: "TODO: PARTIE 2/3/4 non implementee" }));
});

// =============================================================================
// Tests
// =============================================================================

async function runTests(): Promise<void> {
  await new Promise<void>((resolve) => originServer.listen(ORIGIN_PORT, resolve));
  await new Promise<void>((resolve) => proxyServer.listen(PROXY_PORT, resolve));

  console.log(`\n🔬 Origine sur :${ORIGIN_PORT}, Proxy sur :${PROXY_PORT}\n`);

  let passed: number = 0;
  let failed: number = 0;

  function assert(label: string, condition: boolean | undefined): void {
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

    const o1 = await httpGet(`http://localhost:${ORIGIN_PORT}/api/data`);
    assert("Origine /api/data → 200", o1.statusCode === 200);
    assert(
      "Origine /api/data → Cache-Control: max-age=10",
      o1.headers["cache-control"]?.includes("max-age=10")
    );

    const o2 = await httpGet(`http://localhost:${ORIGIN_PORT}/api/private`);
    assert("Origine /api/private → 200", o2.statusCode === 200);
    assert(
      "Origine /api/private → Cache-Control contient no-store",
      o2.headers["cache-control"]?.includes("no-store")
    );

    const o3 = await httpGet(`http://localhost:${ORIGIN_PORT}/api/varied`);
    assert("Origine /api/varied → 200", o3.statusCode === 200);
    assert(
      "Origine /api/varied → Vary: Accept-Encoding",
      o3.headers["vary"]?.includes("Accept-Encoding")
    );

    // ----- PARTIE 2+3 : Proxy cache -----
    console.log("\n--- PARTIE 2+3 : Proxy cache ---");
    proxyCache.clear();

    const p1 = await httpGet(`http://localhost:${PROXY_PORT}/api/data`);
    assert("Proxy /api/data #1 → 200", p1.statusCode === 200);
    assert("Proxy /api/data #1 → X-Cache: MISS", p1.headers["x-cache"] === "MISS");

    const p2 = await httpGet(`http://localhost:${PROXY_PORT}/api/data`);
    assert("Proxy /api/data #2 → X-Cache: HIT", p2.headers["x-cache"] === "HIT");

    const b1 = JSON.parse(p1.body);
    const b2 = JSON.parse(p2.body);
    assert(
      "Proxy /api/data #2 → meme requestId (cache)",
      b1.requestId === b2.requestId
    );

    // no-store ne doit PAS etre cache
    const p3 = await httpGet(`http://localhost:${PROXY_PORT}/api/private`);
    assert("Proxy /api/private #1 → X-Cache: MISS", p3.headers["x-cache"] === "MISS");

    const p4 = await httpGet(`http://localhost:${PROXY_PORT}/api/private`);
    assert(
      "Proxy /api/private #2 → X-Cache: MISS (no-store)",
      p4.headers["x-cache"] === "MISS"
    );

    const b3 = JSON.parse(p3.body);
    const b4 = JSON.parse(p4.body);
    assert(
      "Proxy /api/private → requestId different (pas cache)",
      b3.requestId !== b4.requestId
    );

    // ----- PARTIE 4 : Vary-aware -----
    console.log("\n--- PARTIE 4 : Vary-aware cache ---");
    proxyCache.clear();

    const v1 = await httpGet(`http://localhost:${PROXY_PORT}/api/varied`, {
      "Accept-Encoding": "gzip",
    });
    assert("Vary gzip #1 → MISS", v1.headers["x-cache"] === "MISS");

    const v2 = await httpGet(`http://localhost:${PROXY_PORT}/api/varied`, {
      "Accept-Encoding": "gzip",
    });
    assert("Vary gzip #2 → HIT", v2.headers["x-cache"] === "HIT");

    const v3 = await httpGet(`http://localhost:${PROXY_PORT}/api/varied`, {
      "Accept-Encoding": "br",
    });
    assert(
      "Vary br #1 → MISS (cle differente)",
      v3.headers["x-cache"] === "MISS"
    );

    const v4 = await httpGet(`http://localhost:${PROXY_PORT}/api/varied`, {
      "Accept-Encoding": "br",
    });
    assert("Vary br #2 → HIT", v4.headers["x-cache"] === "HIT");

    const bv1 = JSON.parse(v1.body);
    const bv3 = JSON.parse(v3.body);
    assert(
      "Vary → gzip et br ont des requestId differents",
      bv1.requestId !== bv3.requestId
    );

    // ----- Resultat -----
    console.log(`\n========================================`);
    console.log(`  ${passed} passed, ${failed} failed`);
    console.log(`========================================\n`);
  } catch (err) {
    console.error("Erreur:", (err as Error).message);
  } finally {
    originServer.close();
    proxyServer.close();
  }
}

setTimeout(runTests, 0);
