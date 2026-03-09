// =============================================================================
// Lab 08 — Reverse Proxy Cache (Solution)
// =============================================================================
// Executer avec : npx tsx solution.ts
// =============================================================================

import type { IncomingMessage, ServerResponse, IncomingHttpHeaders } from "node:http";
import http from "node:http";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------
const ORIGIN_PORT: number = 4080;
const PROXY_PORT: number = 4081;

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
// PARTIE 1 — Serveur d'origine avec differents types de contenu
// =============================================================================

let originCount: number = 0;

const originServer = http.createServer((req: IncomingMessage, res: ServerResponse) => {
  originCount++;
  const count: number = originCount;

  if (req.url === "/api/data") {
    // POURQUOI : max-age=10 indique aux caches intermediaires qu'ils peuvent
    // stocker cette reponse pendant 10 secondes sans recontacter l'origine.
    res.writeHead(200, {
      "Content-Type": "application/json",
      "Cache-Control": "max-age=10",
    });
    res.end(
      JSON.stringify({
        message: "Hello",
        servedAt: Date.now(),
        requestId: count,
      })
    );
    return;
  }

  if (req.url === "/api/private") {
    // POURQUOI : private + no-store interdit aux caches partages (proxies, CDN)
    // de stocker cette reponse. Seul le navigateur de l'utilisateur peut la garder.
    // Typique pour les donnees sensibles (tokens, infos perso).
    res.writeHead(200, {
      "Content-Type": "application/json",
      "Cache-Control": "private, no-store",
    });
    res.end(
      JSON.stringify({
        secret: "token-xyz",
        servedAt: Date.now(),
        requestId: count,
      })
    );
    return;
  }

  if (req.url === "/api/varied") {
    // POURQUOI : Vary: Accept-Encoding indique que la reponse depend
    // du header Accept-Encoding de la requete. Le cache doit stocker
    // des variantes separees pour gzip, br, identity, etc.
    const encoding: string = (req.headers["accept-encoding"] as string) || "identity";
    res.writeHead(200, {
      "Content-Type": "application/json",
      "Cache-Control": "max-age=10",
      Vary: "Accept-Encoding",
    });
    res.end(
      JSON.stringify({
        encoding,
        servedAt: Date.now(),
        requestId: count,
      })
    );
    return;
  }

  if (req.url === "/api/no-cache") {
    // POURQUOI : no-cache ne signifie PAS "ne pas cacher". Cela signifie
    // "le cache peut stocker, mais doit revalider aupres de l'origine
    // avant de servir". Pour simplifier, on traite comme non-cacheable.
    res.writeHead(200, {
      "Content-Type": "application/json",
      "Cache-Control": "no-cache",
    });
    res.end(
      JSON.stringify({
        fresh: true,
        servedAt: Date.now(),
        requestId: count,
      })
    );
    return;
  }

  res.writeHead(404, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ error: "Not found" }));
});

// =============================================================================
// PARTIE 2+3 — Cache layer
// =============================================================================

const proxyCache = new Map<string, ProxyCacheEntry>();

function parseCacheControl(headerValue: string | undefined): Record<string, string | boolean> {
  // POURQUOI : on parse le header pour pouvoir prendre des decisions
  // programmatiques. "max-age=10, public" devient un objet exploitable.
  if (!headerValue) return {};

  const directives: Record<string, string | boolean> = {};
  const parts: string[] = headerValue.split(",").map((s) => s.trim());

  for (const part of parts) {
    const [key, value] = part.split("=");
    directives[key.trim()] = value ? value.trim() : true;
  }

  return directives;
}

function getCacheKey(url: string, reqHeaders: IncomingHttpHeaders, varyHeader: string | null): string | null {
  // POURQUOI : sans Vary, l'URL suffit comme cle.
  // Avec Vary, on doit inclure les valeurs des headers mentionnes
  // pour distinguer les variantes (ex: gzip vs br).
  if (!varyHeader) return url;

  // POURQUOI : Vary: * signifie que chaque requete est unique.
  // En pratique, cela desactive le cache pour cette ressource.
  if (varyHeader.trim() === "*") return null;

  const varyParts: string[] = varyHeader.split(",").map((s) => s.trim().toLowerCase());
  const varyValues: string = varyParts
    .map((h) => `${h}=${reqHeaders[h] || ""}`)
    .join("|");

  return `${url}|${varyValues}`;
}

function shouldCache(cacheControl: Record<string, string | boolean>): boolean {
  // POURQUOI : un proxy partage ne doit jamais stocker les reponses
  // marquees private (destinees au navigateur seul) ou no-store (jamais).
  if (cacheControl["no-store"]) return false;
  if (cacheControl["private"]) return false;
  if (cacheControl["no-cache"]) return false;
  return true;
}

function getMaxAge(cacheControl: Record<string, string | boolean>): number {
  // POURQUOI : max-age donne le TTL en secondes. On convertit en ms
  // pour comparer avec Date.now().
  if (cacheControl["max-age"]) {
    return parseInt(cacheControl["max-age"] as string, 10) * 1000;
  }
  return 0;
}

// =============================================================================
// PARTIE 4 — Proxy avec cache Vary-aware
// =============================================================================

const proxyServer = http.createServer((req: IncomingMessage, res: ServerResponse) => {
  // POURQUOI : on tente d'abord le cache avec l'URL comme cle initiale.
  // Si le cache a une entree avec un Vary, on recalculera la cle.
  // Pour les MISS initiaux, on ne connait pas encore le Vary.

  // Essayer toutes les cles possibles dans le cache
  // On cherche d'abord une entree exacte, puis on itere si necessaire
  for (const [key, entry] of proxyCache) {
    if (!key.startsWith(req.url ?? "")) continue;

    // Verifier si la cle correspond a cette requete
    if (entry.varyHeader) {
      const computedKey: string | null = getCacheKey(req.url ?? "", req.headers, entry.varyHeader);
      if (computedKey !== key) continue;
    } else if (key !== req.url) {
      continue;
    }

    // Verifier expiration
    if (Date.now() < entry.expires) {
      // POURQUOI : X-Cache: HIT informe le client que la reponse
      // vient du cache du proxy, pas de l'origine.
      res.writeHead(entry.statusCode, {
        ...entry.headers,
        "x-cache": "HIT",
      });
      res.end(entry.body);
      return;
    } else {
      // POURQUOI : entree expiree, on la supprime et on continue vers l'origine.
      proxyCache.delete(key);
    }
  }

  // POURQUOI : cache MISS — on forward la requete vers le serveur d'origine.
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
      proxyRes.on("data", (chunk: Buffer) => (body += chunk));
      proxyRes.on("end", () => {
        const cc: Record<string, string | boolean> = parseCacheControl(proxyRes.headers["cache-control"]);
        const varyHeader: string | null = (proxyRes.headers["vary"] as string) || null;

        if (shouldCache(cc) && proxyRes.statusCode === 200) {
          const maxAge: number = getMaxAge(cc);
          if (maxAge > 0) {
            // POURQUOI : on utilise getCacheKey pour generer une cle
            // qui tient compte du Vary. Ainsi, gzip et br auront
            // des entrees separees dans le cache.
            const cacheKey: string | null = getCacheKey(req.url ?? "", req.headers, varyHeader);

            if (cacheKey !== null) {
              proxyCache.set(cacheKey, {
                statusCode: proxyRes.statusCode,
                headers: proxyRes.headers,
                body,
                expires: Date.now() + maxAge,
                varyHeader,
              });
            }
          }
        }

        res.writeHead(proxyRes.statusCode ?? 500, {
          ...proxyRes.headers,
          "x-cache": "MISS",
        });
        res.end(body);
      });
    }
  );

  proxyReq.on("error", (err: Error) => {
    res.writeHead(502, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Bad Gateway", details: err.message }));
  });

  proxyReq.end();
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
