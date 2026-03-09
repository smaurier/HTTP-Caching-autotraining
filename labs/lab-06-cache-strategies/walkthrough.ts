// =============================================================================
// Lab 06 — Strategies de cache (Walkthrough pas-a-pas)
// =============================================================================
// Executer avec : npx tsx walkthrough.ts
// =============================================================================

import type { IncomingMessage, ServerResponse } from "node:http";
import http from "node:http";

// ---------------------------------------------------------------------------
// Serveur d'origine avec logging detaille
// ---------------------------------------------------------------------------
let requestCount: number = 0;

const origin = http.createServer((req: IncomingMessage, res: ServerResponse) => {
  requestCount++;
  const count: number = requestCount;
  console.log(`    [ORIGIN] Requete recue: ${req.url} (requete #${count})`);

  setTimeout(() => {
    if (req.url === "/fail") {
      console.log(`    [ORIGIN] Reponse 500 pour ${req.url}`);
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Server error" }));
      return;
    }

    console.log(`    [ORIGIN] Reponse 200 pour ${req.url} → "Response #${count}"`);
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

interface CacheEntry {
  data: unknown;
  timestamp: number;
}

interface StrategyResult {
  source: string;
  data: Record<string, unknown>;
}

function fetchJSON(url: string): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const req = http.get(url, (res) => {
      let body = "";
      res.on("data", (chunk: Buffer) => (body += chunk));
      res.on("end", () => {
        if ((res.statusCode ?? 0) >= 400) {
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
// Cache avec logging
// ---------------------------------------------------------------------------
const cache = new Map<string, CacheEntry>();
const CACHE_TTL: number = 2000;

function cacheGet(key: string): CacheEntry | null {
  const entry = cache.get(key);
  if (!entry) {
    console.log(`    [CACHE] GET "${key}" → MISS (pas d'entree)`);
    return null;
  }
  const age: number = Date.now() - entry.timestamp;
  const fresh: boolean = age < CACHE_TTL;
  console.log(
    `    [CACHE] GET "${key}" → FOUND (age: ${age}ms, ${fresh ? "FRESH" : "STALE"})`
  );
  return entry;
}

function cacheSet(key: string, data: unknown): void {
  console.log(`    [CACHE] SET "${key}" → stocke a ${Date.now()}`);
  cache.set(key, { data, timestamp: Date.now() });
}

function isFresh(entry: CacheEntry): boolean {
  return Date.now() - entry.timestamp < CACHE_TTL;
}

// =============================================================================
// Etape 1 : Comprendre Cache-First
// =============================================================================

async function cacheFirst(url: string): Promise<StrategyResult> {
  console.log(`  [CACHE-FIRST] Debut pour ${url}`);

  const entry = cacheGet(url);

  if (entry && isFresh(entry)) {
    console.log(`  [CACHE-FIRST] → Retourne depuis le cache (HIT)`);
    return { source: "cache", data: entry.data as Record<string, unknown> };
  }

  console.log(`  [CACHE-FIRST] → Cache miss, requete reseau...`);
  const data = await fetchJSON(url);
  cacheSet(url, data);
  console.log(`  [CACHE-FIRST] → Retourne depuis le reseau (MISS)`);
  return { source: "network", data };
}

// =============================================================================
// Etape 2 : Comprendre Network-First
// =============================================================================

async function networkFirst(url: string): Promise<StrategyResult> {
  console.log(`  [NETWORK-FIRST] Debut pour ${url}`);

  try {
    console.log(`  [NETWORK-FIRST] → Tentative reseau...`);
    const data = await fetchJSON(url);
    cacheSet(url, data);
    console.log(`  [NETWORK-FIRST] → Succes reseau, retourne`);
    return { source: "network", data };
  } catch (err) {
    console.log(`  [NETWORK-FIRST] → Echec reseau: ${(err as Error).message}`);
    const entry = cacheGet(url);
    if (entry) {
      console.log(`  [NETWORK-FIRST] → Fallback cache`);
      return { source: "cache_fallback", data: entry.data as Record<string, unknown> };
    }
    console.log(`  [NETWORK-FIRST] → Pas de fallback, erreur propagee`);
    throw err;
  }
}

// =============================================================================
// Etape 3 : Comprendre Stale-While-Revalidate
// =============================================================================

async function staleWhileRevalidate(url: string): Promise<StrategyResult> {
  console.log(`  [SWR] Debut pour ${url}`);

  const entry = cacheGet(url);

  if (entry) {
    const fresh: boolean = isFresh(entry);

    if (!fresh) {
      console.log(`  [SWR] → Entree stale, lance revalidation en arriere-plan`);
      fetchJSON(url)
        .then((data) => {
          console.log(`    [SWR-BACKGROUND] Revalidation terminee, cache mis a jour`);
          cacheSet(url, data);
        })
        .catch((err: unknown) => {
          console.log(`    [SWR-BACKGROUND] Revalidation echouee: ${(err as Error).message}`);
        });
    }

    const source: string = fresh ? "cache_fresh" : "cache_stale";
    console.log(`  [SWR] → Retourne immediatement (${source})`);
    return { source, data: entry.data as Record<string, unknown> };
  }

  console.log(`  [SWR] → Pas de cache, requete reseau...`);
  const data = await fetchJSON(url);
  cacheSet(url, data);
  console.log(`  [SWR] → Retourne depuis le reseau`);
  return { source: "network", data };
}

// =============================================================================
// Demo interactive
// =============================================================================

async function runDemo(): Promise<void> {
  const PORT: number = 3066;
  const BASE: string = `http://localhost:${PORT}`;

  await new Promise<void>((resolve) => origin.listen(PORT, resolve));

  console.log("╔══════════════════════════════════════════════════════════════╗");
  console.log("║        Lab 06 — Walkthrough des strategies de cache        ║");
  console.log("╚══════════════════════════════════════════════════════════════╝");

  try {
    console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("  DEMO 1 : Cache-First");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

    cache.clear();

    console.log("[Requete 1] cacheFirst('/api/data')");
    const r1 = await cacheFirst(`${BASE}/api/data`);
    console.log(`  Resultat: source=${r1.source}, data="${r1.data.data}"\n`);

    console.log("[Requete 2] cacheFirst('/api/data') — immediatement apres");
    const r2 = await cacheFirst(`${BASE}/api/data`);
    console.log(`  Resultat: source=${r2.source}, data="${r2.data.data}"\n`);

    console.log("[Attente 2.5 secondes pour que le TTL expire...]\n");
    await new Promise((r) => setTimeout(r, 2500));

    console.log("[Requete 3] cacheFirst('/api/data') — apres expiration TTL");
    const r3 = await cacheFirst(`${BASE}/api/data`);
    console.log(`  Resultat: source=${r3.source}, data="${r3.data.data}"\n`);

    console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("  DEMO 2 : Network-First");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

    cache.clear();

    console.log("[Requete 1] networkFirst('/api/info')");
    const n1 = await networkFirst(`${BASE}/api/info`);
    console.log(`  Resultat: source=${n1.source}, data="${n1.data.data}"\n`);

    console.log("[Pre-remplissage du cache pour /fail]\n");
    cacheSet(`${BASE}/fail`, { cached: true, data: "Cached fallback data" });

    console.log("[Requete 2] networkFirst('/fail') — le serveur retourne 500");
    const n2 = await networkFirst(`${BASE}/fail`);
    console.log(`  Resultat: source=${n2.source}, data=${JSON.stringify(n2.data)}\n`);

    console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("  DEMO 3 : Stale-While-Revalidate");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

    cache.clear();

    console.log("[Requete 1] SWR '/api/swr' — cache vide");
    const s1 = await staleWhileRevalidate(`${BASE}/api/swr`);
    console.log(`  Resultat: source=${s1.source}, data="${s1.data.data}"\n`);

    console.log("[Requete 2] SWR '/api/swr' — cache fresh");
    const s2 = await staleWhileRevalidate(`${BASE}/api/swr`);
    console.log(`  Resultat: source=${s2.source}, data="${s2.data.data}"\n`);

    console.log("[Attente 2.5 secondes pour que le TTL expire...]\n");
    await new Promise((r) => setTimeout(r, 2500));

    console.log("[Requete 3] SWR '/api/swr' — cache stale, revalidation lancee");
    const s3 = await staleWhileRevalidate(`${BASE}/api/swr`);
    console.log(`  Resultat: source=${s3.source}, data="${s3.data.data}"\n`);

    console.log("[Attente 300ms pour la revalidation en arriere-plan...]\n");
    await new Promise((r) => setTimeout(r, 300));

    console.log("[Requete 4] SWR '/api/swr' — cache mis a jour par la revalidation");
    const s4 = await staleWhileRevalidate(`${BASE}/api/swr`);
    console.log(`  Resultat: source=${s4.source}, data="${s4.data.data}"\n`);

    console.log("╔══════════════════════════════════════════════════════════════╗");
    console.log("║                    Recapitulatif                            ║");
    console.log("╠══════════════════════════════════════════════════════════════╣");
    console.log("║  Cache-First    : Rapide, mais peut etre stale             ║");
    console.log("║  Network-First  : Frais, mais plus lent                    ║");
    console.log("║  SWR            : Rapide + se rafraichit en arriere-plan   ║");
    console.log("╚══════════════════════════════════════════════════════════════╝\n");
  } catch (err) {
    console.error("Erreur:", (err as Error).message);
  } finally {
    origin.close();
  }
}

setTimeout(runDemo, 0);
