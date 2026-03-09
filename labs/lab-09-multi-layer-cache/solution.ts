// =============================================================================
// Lab 09 — Multi-Layer Cache (Solution)
// =============================================================================
// Executer avec : npx tsx solution.ts
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

let dbQueryCount: number = 0;

const originServer = http.createServer((req: IncomingMessage, res: ServerResponse) => {
  dbQueryCount++;
  const queryNum: number = dbQueryCount;

  setTimeout(() => {
    if (req.url === "/api/users") {
      res.writeHead(200, {
        "Content-Type": "application/json",
        "Cache-Control": `max-age=${APP_TTL / 1000}`,
        "X-Origin": "true",
      });
      res.end(
        JSON.stringify({
          users: [
            { id: 1, name: "Alice" },
            { id: 2, name: "Bob" },
            { id: 3, name: "Charlie" },
          ],
          queryNumber: queryNum,
          servedAt: Date.now(),
        })
      );
      return;
    }

    if (req.url === "/api/products") {
      res.writeHead(200, {
        "Content-Type": "application/json",
        "Cache-Control": `max-age=${APP_TTL / 1000}`,
        "X-Origin": "true",
      });
      res.end(
        JSON.stringify({
          products: [
            { id: 1, name: "Widget", price: 9.99 },
            { id: 2, name: "Gadget", price: 24.99 },
          ],
          queryNumber: queryNum,
          servedAt: Date.now(),
        })
      );
      return;
    }

    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Not found" }));
  }, 100);
});

// =============================================================================
// PARTIE 2 — Cache applicatif
// =============================================================================

const appCache = new Map<string, CacheEntry>();

function appCacheGet(url: string): CacheEntry | null {
  const entry = appCache.get(url);
  if (!entry) return null;

  if (Date.now() - entry.timestamp >= APP_TTL) {
    appCache.delete(url);
    return null;
  }

  return entry;
}

function appCacheSet(url: string, statusCode: number, headers: IncomingHttpHeaders, body: string): void {
  appCache.set(url, { statusCode, headers, body, timestamp: Date.now() });
}

const appServer = http.createServer((req: IncomingMessage, res: ServerResponse) => {
  const cached = appCacheGet(req.url ?? "");

  if (cached) {
    res.writeHead(cached.statusCode, {
      ...cached.headers,
      "x-app-cache": "HIT",
    });
    res.end(cached.body);
    return;
  }

  const proxyReq = http.request(
    {
      hostname: "localhost",
      port: ORIGIN_PORT,
      path: req.url,
      method: "GET",
    },
    (proxyRes) => {
      let body = "";
      proxyRes.on("data", (chunk: Buffer) => (body += chunk));
      proxyRes.on("end", () => {
        if (proxyRes.statusCode === 200) {
          appCacheSet(req.url ?? "", proxyRes.statusCode, proxyRes.headers, body);
        }

        res.writeHead(proxyRes.statusCode ?? 500, {
          ...proxyRes.headers,
          "x-app-cache": "MISS",
        });
        res.end(body);
      });
    }
  );

  proxyReq.on("error", (err: Error) => {
    res.writeHead(502, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Origin unreachable" }));
  });

  proxyReq.end();
});

// =============================================================================
// PARTIE 3 — Simulateur CDN
// =============================================================================

const cdnCache = new Map<string, CacheEntry>();

function cdnCacheGet(url: string): CacheEntry | null {
  const entry = cdnCache.get(url);
  if (!entry) return null;

  if (Date.now() - entry.timestamp >= CDN_TTL) {
    cdnCache.delete(url);
    return null;
  }

  return entry;
}

function cdnCacheSet(url: string, statusCode: number, headers: IncomingHttpHeaders, body: string): void {
  cdnCache.set(url, { statusCode, headers, body, timestamp: Date.now() });
}

const cdnServer = http.createServer((req: IncomingMessage, res: ServerResponse) => {
  const cached = cdnCacheGet(req.url ?? "");

  if (cached) {
    res.writeHead(cached.statusCode, {
      ...cached.headers,
      "x-cdn-cache": "HIT",
    });
    res.end(cached.body);
    return;
  }

  const proxyReq = http.request(
    {
      hostname: "localhost",
      port: APP_PORT,
      path: req.url,
      method: "GET",
    },
    (proxyRes) => {
      let body = "";
      proxyRes.on("data", (chunk: Buffer) => (body += chunk));
      proxyRes.on("end", () => {
        if (proxyRes.statusCode === 200) {
          cdnCacheSet(req.url ?? "", proxyRes.statusCode, proxyRes.headers, body);
        }

        res.writeHead(proxyRes.statusCode ?? 500, {
          ...proxyRes.headers,
          "x-cdn-cache": "MISS",
        });
        res.end(body);
      });
    }
  );

  proxyReq.on("error", (err: Error) => {
    res.writeHead(502, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "App unreachable" }));
  });

  proxyReq.end();
});

// =============================================================================
// PARTIE 4 — Simulateur de browser cache + trace
// =============================================================================

const browserCache = new Map<string, BrowserCacheEntry>();

async function browserFetch(path: string): Promise<BrowserFetchResult> {
  const entry = browserCache.get(path);

  if (entry && Date.now() - entry.timestamp < BROWSER_TTL) {
    return {
      trace: "browser:HIT",
      data: entry.data,
      statusCode: entry.statusCode,
    };
  }

  const response = await httpGet(`http://localhost:${CDN_PORT}${path}`);

  const data = JSON.parse(response.body);
  browserCache.set(path, {
    data,
    statusCode: response.statusCode,
    timestamp: Date.now(),
  });

  const cdnStatus: string = (response.headers["x-cdn-cache"] as string) || "UNKNOWN";
  const appStatus: string | null = (response.headers["x-app-cache"] as string) || null;

  let trace = `browser:MISS, cdn:${cdnStatus}`;

  if (cdnStatus === "MISS" && appStatus) {
    trace += `, app:${appStatus}`;
  }

  return { trace, data, statusCode: response.statusCode };
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

    await new Promise((r) => setTimeout(r, BROWSER_TTL + 200));

    const t3 = await browserFetch("/api/products");
    assert(
      `Trace #3 (browser expire) → "${t3.trace}"`,
      t3.trace === "browser:MISS, cdn:HIT"
    );

    await new Promise((r) => setTimeout(r, CDN_TTL + 200));

    const t4 = await browserFetch("/api/products");
    assert(
      `Trace #4 (cdn expire) → "${t4.trace}"`,
      t4.trace === "browser:MISS, cdn:MISS, app:HIT"
    );

    await new Promise((r) => setTimeout(r, APP_TTL + 200));

    const t5 = await browserFetch("/api/products");
    assert(
      `Trace #5 (tout expire) → "${t5.trace}"`,
      t5.trace === "browser:MISS, cdn:MISS, app:MISS"
    );

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
