// =============================================================================
// Lab 09 — Multi-Layer Cache
// =============================================================================
// Executer avec : npx tsx exercise.ts
// =============================================================================

import type { IncomingMessage, ServerResponse, IncomingHttpHeaders } from "node:http";
import http from "node:http";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------
const ORIGIN_PORT: number = 4090;
const APP_PORT: number = 4091;
const CDN_PORT: number = 4092;

const BROWSER_TTL: number = 1000; // 1 seconde
const CDN_TTL: number = 2000; // 2 secondes
const APP_TTL: number = 4000; // 4 secondes

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface HttpResult {
  statusCode: number | undefined;
  headers: IncomingHttpHeaders;
  body: string;
}

interface CacheEntry {
  statusCode: number;
  headers: IncomingHttpHeaders;
  body: string;
  timestamp: number;
}

interface BrowserCacheEntry {
  data: unknown;
  statusCode: number | undefined;
  timestamp: number;
}

interface BrowserFetchResult {
  trace: string;
  data: unknown;
  statusCode: number | undefined;
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
        res.on("data", (chunk: Buffer) => (body += chunk));
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
// PARTIE 1 — Serveur d'origine (simule une base de donnees)
// =============================================================================
// Le serveur d'origine simule une base de donnees lente.
// Chaque requete prend 100ms et retourne des donnees avec un compteur.
//
// Routes :
//   GET /api/users → liste d'utilisateurs
//   GET /api/products → liste de produits
// =============================================================================

let dbQueryCount: number = 0;

const originServer = http.createServer((req: IncomingMessage, res: ServerResponse) => {
  dbQueryCount++;
  const queryNum: number = dbQueryCount;

  // TODO: Implementer le serveur d'origine
  // 💡 Simuler une latence de 100ms avec setTimeout
  // 💡 /api/users → { users: [...], queryNumber, servedAt: Date.now() }
  // 💡 /api/products → { products: [...], queryNumber, servedAt: Date.now() }
  // 💡 Ajouter le header X-Origin: true pour tracer
  // 💡 Ajouter Cache-Control: max-age=4 (correspondant a APP_TTL en secondes)

  setTimeout(() => {
    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "TODO: PARTIE 1 non implementee" }));
  }, 100);
});

// =============================================================================
// PARTIE 2 — Cache applicatif (couche intermediaire)
// =============================================================================
// Serveur HTTP qui :
// - Verifie son propre cache (in-memory Map, TTL = APP_TTL)
// - Si HIT → retourne avec X-App-Cache: HIT
// - Si MISS → forward vers l'origine, stocke, retourne avec X-App-Cache: MISS
// =============================================================================

const appCache = new Map<string, CacheEntry>();

function appCacheGet(url: string): CacheEntry | null {
  // TODO: Verifier le cache applicatif
  // 💡 Recuperer l'entree, verifier le TTL avec APP_TTL
  // 💡 Retourner l'entree si fraiche, null sinon
  return null;
}

function appCacheSet(url: string, statusCode: number, headers: IncomingHttpHeaders, body: string): void {
  // TODO: Stocker dans le cache applicatif
  // 💡 Stocker { statusCode, headers, body, timestamp: Date.now() }
}

const appServer = http.createServer((req: IncomingMessage, res: ServerResponse) => {
  // TODO: Implementer le serveur applicatif avec cache
  // 💡 Verifier appCacheGet(req.url)
  // 💡 Si HIT : retourner avec X-App-Cache: HIT
  // 💡 Si MISS : forwarder vers l'origine (ORIGIN_PORT)
  //    - Stocker la reponse dans appCache
  //    - Retourner avec X-App-Cache: MISS

  res.writeHead(501, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ error: "TODO: PARTIE 2 non implementee" }));
});

// =============================================================================
// PARTIE 3 — Simulateur CDN
// =============================================================================
// Proxy HTTP qui :
// - A son propre cache (TTL = CDN_TTL, plus court que APP_TTL)
// - Verifie le cache avant de forwarder vers l'app
// - Ajoute X-CDN-Cache: HIT/MISS
// =============================================================================

const cdnCache = new Map<string, CacheEntry>();

function cdnCacheGet(url: string): CacheEntry | null {
  // TODO: Verifier le cache CDN
  // 💡 Meme logique que appCacheGet mais avec CDN_TTL
  return null;
}

function cdnCacheSet(url: string, statusCode: number, headers: IncomingHttpHeaders, body: string): void {
  // TODO: Stocker dans le cache CDN
}

const cdnServer = http.createServer((req: IncomingMessage, res: ServerResponse) => {
  // TODO: Implementer le CDN avec cache
  // 💡 Verifier cdnCacheGet(req.url)
  // 💡 Si HIT : retourner avec X-CDN-Cache: HIT
  // 💡 Si MISS : forwarder vers l'app (APP_PORT)
  //    - Stocker la reponse dans cdnCache
  //    - Retourner avec X-CDN-Cache: MISS

  res.writeHead(501, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ error: "TODO: PARTIE 3 non implementee" }));
});

// =============================================================================
// PARTIE 4 — Simulateur de browser cache + trace
// =============================================================================
// Creer un "client" qui :
// - A son propre cache (TTL = BROWSER_TTL)
// - Fait des requetes vers le CDN
// - Construit un X-Cache-Trace avec le resultat de chaque couche
// =============================================================================

const browserCache = new Map<string, BrowserCacheEntry>();

async function browserFetch(path: string): Promise<BrowserFetchResult> {
  // TODO: Implementer le simulateur de browser cache
  //
  // 💡 Etape 1 : Verifier le browser cache
  //    - Recuperer l'entree pour `path`
  //    - Si fraiche (BROWSER_TTL) → retourner { trace: "browser:HIT", ... }
  //
  // 💡 Etape 2 : Si MISS browser → requete vers le CDN
  //    - httpGet(`http://localhost:${CDN_PORT}${path}`)
  //
  // 💡 Etape 3 : Stocker dans le browser cache
  //
  // 💡 Etape 4 : Construire le trace
  //    - Lire les headers X-CDN-Cache et X-App-Cache de la reponse
  //    - Construire: "browser:MISS, cdn:HIT/MISS, app:HIT/MISS"
  //    - Si browser HIT, le trace est juste "browser:HIT"
  //
  // 💡 Retourner { trace, data, statusCode }

  return {
    trace: "TODO: non implemente",
    data: null,
    statusCode: 0,
  };
}

// =============================================================================
// Tests
// =============================================================================

async function runTests(): Promise<void> {
  await new Promise<void>((resolve) => originServer.listen(ORIGIN_PORT, resolve));
  await new Promise<void>((resolve) => appServer.listen(APP_PORT, resolve));
  await new Promise<void>((resolve) => cdnServer.listen(CDN_PORT, resolve));

  console.log(
    `\n🔬 Origin :${ORIGIN_PORT} | App :${APP_PORT} | CDN :${CDN_PORT}\n`
  );
  console.log(
    `   TTL → Browser: ${BROWSER_TTL}ms | CDN: ${CDN_TTL}ms | App: ${APP_TTL}ms\n`
  );

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
    // ----- PARTIE 1 : Origine -----
    console.log("--- PARTIE 1 : Serveur d'origine ---");

    const o1 = await httpGet(`http://localhost:${ORIGIN_PORT}/api/users`);
    assert("Origine /api/users → 200", o1.statusCode === 200);
    const users = JSON.parse(o1.body);
    assert("Origine → contient users", Array.isArray(users.users));
    assert("Origine → contient queryNumber", typeof users.queryNumber === "number");

    // ----- PARTIE 2 : App cache -----
    console.log("\n--- PARTIE 2 : App cache ---");
    appCache.clear();

    const a1 = await httpGet(`http://localhost:${APP_PORT}/api/users`);
    assert("App #1 → X-App-Cache: MISS", a1.headers["x-app-cache"] === "MISS");

    const a2 = await httpGet(`http://localhost:${APP_PORT}/api/users`);
    assert("App #2 → X-App-Cache: HIT", a2.headers["x-app-cache"] === "HIT");

    const ab1 = JSON.parse(a1.body);
    const ab2 = JSON.parse(a2.body);
    assert("App #2 → meme queryNumber", ab1.queryNumber === ab2.queryNumber);

    // ----- PARTIE 3 : CDN -----
    console.log("\n--- PARTIE 3 : CDN cache ---");
    cdnCache.clear();
    appCache.clear();

    const c1 = await httpGet(`http://localhost:${CDN_PORT}/api/users`);
    assert("CDN #1 → X-CDN-Cache: MISS", c1.headers["x-cdn-cache"] === "MISS");

    const c2 = await httpGet(`http://localhost:${CDN_PORT}/api/users`);
    assert("CDN #2 → X-CDN-Cache: HIT", c2.headers["x-cdn-cache"] === "HIT");

    // Attendre que le CDN TTL expire mais pas le App TTL
    await new Promise((r) => setTimeout(r, CDN_TTL + 500));

    const c3 = await httpGet(`http://localhost:${CDN_PORT}/api/users`);
    assert("CDN #3 apres CDN TTL → X-CDN-Cache: MISS", c3.headers["x-cdn-cache"] === "MISS");
    assert(
      "CDN #3 → X-App-Cache: HIT (app cache encore frais)",
      c3.headers["x-app-cache"] === "HIT"
    );

    // ----- PARTIE 4 : Trace complet -----
    console.log("\n--- PARTIE 4 : Trace multi-couche ---");
    browserCache.clear();
    cdnCache.clear();
    appCache.clear();

    const t1 = await browserFetch("/api/products");
    assert(
      `Trace #1 → "${t1.trace}"`,
      t1.trace === "browser:MISS, cdn:MISS, app:MISS"
    );

    const t2 = await browserFetch("/api/products");
    assert(
      `Trace #2 → "${t2.trace}"`,
      t2.trace === "browser:HIT"
    );

    // Attendre expiration browser cache
    await new Promise((r) => setTimeout(r, BROWSER_TTL + 200));

    const t3 = await browserFetch("/api/products");
    assert(
      `Trace #3 (browser expire) → "${t3.trace}"`,
      t3.trace === "browser:MISS, cdn:HIT"
    );

    // Attendre expiration CDN cache
    await new Promise((r) => setTimeout(r, CDN_TTL + 200));

    const t4 = await browserFetch("/api/products");
    assert(
      `Trace #4 (cdn expire) → "${t4.trace}"`,
      t4.trace === "browser:MISS, cdn:MISS, app:HIT"
    );

    // Attendre expiration app cache
    await new Promise((r) => setTimeout(r, APP_TTL + 200));

    const t5 = await browserFetch("/api/products");
    assert(
      `Trace #5 (tout expire) → "${t5.trace}"`,
      t5.trace === "browser:MISS, cdn:MISS, app:MISS"
    );

    // ----- Resultat -----
    console.log(`\n========================================`);
    console.log(`  ${passed} passed, ${failed} failed`);
    console.log(`========================================\n`);
  } catch (err) {
    console.error("Erreur:", (err as Error).message);
  } finally {
    originServer.close();
    appServer.close();
    cdnServer.close();
  }
}

setTimeout(runTests, 0);
