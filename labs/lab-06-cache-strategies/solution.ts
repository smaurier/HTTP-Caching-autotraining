// =============================================================================
// Lab 06 — Strategies de cache (Solution)
// =============================================================================
// Executer avec : npx tsx solution.ts
// =============================================================================

import type { IncomingMessage, ServerResponse } from "node:http";
import http from "node:http";

// ---------------------------------------------------------------------------
// Serveur d'origine simulant une API lente
// ---------------------------------------------------------------------------
let requestCount: number = 0;

const origin = http.createServer((req: IncomingMessage, res: ServerResponse) => {
  requestCount++;
  const count: number = requestCount;

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
// Cache en memoire
// ---------------------------------------------------------------------------
const cache = new Map<string, CacheEntry>();

const CACHE_TTL: number = 2000;

function cacheGet(key: string): CacheEntry | null {
  const entry = cache.get(key);
  if (!entry) return null;
  return entry;
}

function cacheSet(key: string, data: unknown): void {
  cache.set(key, { data, timestamp: Date.now() });
}

function isFresh(entry: CacheEntry): boolean {
  return Date.now() - entry.timestamp < CACHE_TTL;
}

// =============================================================================
// PARTIE 1 — Strategie Cache-First
// =============================================================================

async function cacheFirst(url: string): Promise<StrategyResult> {
  const entry = cacheGet(url);

  if (entry && isFresh(entry)) {
    return { source: "cache", data: entry.data as Record<string, unknown> };
  }

  const data = await fetchJSON(url);
  cacheSet(url, data);
  return { source: "network", data };
}

// =============================================================================
// PARTIE 2 — Strategie Network-First
// =============================================================================

async function networkFirst(url: string): Promise<StrategyResult> {
  try {
    const data = await fetchJSON(url);
    cacheSet(url, data);
    return { source: "network", data };
  } catch (err) {
    const entry = cacheGet(url);
    if (entry) {
      return { source: "cache_fallback", data: entry.data as Record<string, unknown> };
    }
    throw err;
  }
}

// =============================================================================
// PARTIE 3 — Pattern Stale-While-Revalidate (SWR)
// =============================================================================

async function staleWhileRevalidate(url: string): Promise<StrategyResult> {
  const entry = cacheGet(url);

  if (entry) {
    const fresh: boolean = isFresh(entry);

    if (!fresh) {
      fetchJSON(url)
        .then((data) => cacheSet(url, data))
        .catch(() => {
          /* silently ignore revalidation errors */
        });
    }

    return {
      source: fresh ? "cache_fresh" : "cache_stale",
      data: entry.data as Record<string, unknown>,
    };
  }

  const data = await fetchJSON(url);
  cacheSet(url, data);
  return { source: "network", data };
}

// =============================================================================
// PARTIE 4 — Predire l'ordre d'execution
// =============================================================================

interface Prediction {
  source: string;
  hit: boolean;
}

function predictResults(): Prediction[] {
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

async function runTests(): Promise<void> {
  const PORT: number = 3066;
  const BASE: string = `http://localhost:${PORT}`;

  await new Promise<void>((resolve) => origin.listen(PORT, resolve));
  console.log(`\n🔬 Serveur d'origine demarre sur le port ${PORT}\n`);

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
    console.log("--- PARTIE 1 : Cache-First ---");
    cache.clear();

    const cf1 = await cacheFirst(`${BASE}/api/data`);
    assert("Cache-First #1 → source = network (MISS)", cf1.source === "network");

    const cf2 = await cacheFirst(`${BASE}/api/data`);
    assert("Cache-First #2 → source = cache (HIT)", cf2.source === "cache");
    assert("Cache-First #2 → meme data que #1", cf2.data.data === cf1.data.data);

    await new Promise((r) => setTimeout(r, CACHE_TTL + 500));

    const cf3 = await cacheFirst(`${BASE}/api/data`);
    assert("Cache-First #3 apres TTL → source = network (MISS)", cf3.source === "network");
    assert("Cache-First #3 → data differente (nouvelle requete)", cf3.data.data !== cf1.data.data);

    console.log("\n--- PARTIE 2 : Network-First ---");
    cache.clear();

    const nf1 = await networkFirst(`${BASE}/api/data`);
    assert("Network-First #1 → source = network", nf1.source === "network");

    cacheSet(`${BASE}/fail`, { cached: true });

    const nf2 = await networkFirst(`${BASE}/fail`);
    assert("Network-First /fail → source = cache_fallback", nf2.source === "cache_fallback");
    assert("Network-First /fail → data du cache", (nf2.data as Record<string, unknown>).cached === true);

    console.log("\n--- PARTIE 3 : Stale-While-Revalidate ---");
    cache.clear();

    const swr1 = await staleWhileRevalidate(`${BASE}/api/swr`);
    assert("SWR #1 (pas de cache) → source = network", swr1.source === "network");

    const swr2 = await staleWhileRevalidate(`${BASE}/api/swr`);
    assert("SWR #2 (cache fresh) → source = cache_fresh", swr2.source === "cache_fresh");

    await new Promise((r) => setTimeout(r, CACHE_TTL + 500));

    const swr3 = await staleWhileRevalidate(`${BASE}/api/swr`);
    assert("SWR #3 (cache stale) → source = cache_stale", swr3.source === "cache_stale");

    await new Promise((r) => setTimeout(r, 300));

    const swr4 = await staleWhileRevalidate(`${BASE}/api/swr`);
    assert("SWR #4 (apres revalidation) → source = cache_fresh", swr4.source === "cache_fresh");
    assert("SWR #4 → data mise a jour par la revalidation", swr4.data.data !== swr3.data.data);

    console.log("\n--- PARTIE 4 : Predictions ---");
    const predictions = predictResults();
    const expected: Prediction[] = [
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
        const p = predictions[i] || {} as Prediction;
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
    console.error("Erreur:", (err as Error).message);
  } finally {
    origin.close();
  }
}

setTimeout(runTests, 0);
