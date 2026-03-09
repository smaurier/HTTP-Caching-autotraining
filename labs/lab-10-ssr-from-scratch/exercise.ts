// =============================================================================
// Lab 10 — SSR from Scratch
// =============================================================================
// Executer avec : npx tsx exercise.ts
// =============================================================================

import type { IncomingMessage, ServerResponse, IncomingHttpHeaders } from "node:http";
import http from "node:http";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------
const PORT: number = 4100;

interface HttpGetResult {
  statusCode: number | undefined;
  headers: IncomingHttpHeaders;
  body: string;
  chunkCount: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function httpGet(url: string): Promise<HttpGetResult> {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      const chunks: string[] = [];
      res.on("data", (chunk: Buffer) => chunks.push(chunk.toString()));
      res.on("end", () =>
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          body: chunks.join(""),
          chunkCount: chunks.length,
        })
      );
    }).on("error", reject);
  });
}

// ---------------------------------------------------------------------------
// Donnees simulees (comme si elles venaient d'une API/base de donnees)
// ---------------------------------------------------------------------------

interface UserData {
  user: { id: number; name: string; role: string };
  notifications: number;
}

interface ArticlesData {
  articles: Array<{ id: number; title: string; author: string }>;
}

interface DashboardData {
  stats: { visitors: number; pageViews: number; bounceRate: number };
  recentActivity: Array<{ action: string; user: string; time: string }>;
}

function fetchUserData(): Promise<UserData> {
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve({
        user: { id: 1, name: "Alice", role: "admin" },
        notifications: 3,
      });
    }, 50);
  });
}

function fetchArticles(): Promise<ArticlesData> {
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve({
        articles: [
          { id: 1, title: "Introduction au HTTP Caching", author: "Alice" },
          { id: 2, title: "CDN et Performance", author: "Bob" },
          { id: 3, title: "SSR vs CSR", author: "Charlie" },
        ],
      });
    }, 50);
  });
}

function fetchDashboardData(): Promise<DashboardData> {
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve({
        stats: { visitors: 1234, pageViews: 5678, bounceRate: 0.32 },
        recentActivity: [
          { action: "login", user: "Alice", time: "10:30" },
          { action: "edit", user: "Bob", time: "10:45" },
        ],
      });
    }, 100);
  });
}

// =============================================================================
// PARTIE 1 — SSR basique (template + donnees → HTML complet)
// =============================================================================
// Creer une fonction qui genere du HTML a partir d'un template et de donnees.
//
// Le HTML doit etre un document complet :
// <!DOCTYPE html><html><head>...</head><body>...</body></html>
//
// La page /articles doit afficher la liste des articles en HTML.
// =============================================================================

function renderArticlesPage(data: ArticlesData): string {
  // TODO: Generer le HTML de la page articles
  // 💡 Utiliser un template literal pour construire le HTML
  // 💡 Iterer sur data.articles avec .map() pour generer les <li>
  // 💡 Le HTML doit contenir :
  //    - <!DOCTYPE html> et <html lang="fr">
  //    - <title>Articles</title>
  //    - <h1>Articles</h1>
  //    - <ul> avec un <li> par article contenant le titre et l'auteur
  //    - Un <footer> avec "Rendu cote serveur a [timestamp]"
  return "<!-- TODO: PARTIE 1 non implementee -->";
}

// =============================================================================
// PARTIE 2 — Hydration (window.__INITIAL_STATE__)
// =============================================================================
// Ajouter un script d'hydration qui injecte les donnees dans window.__INITIAL_STATE__.
// Cela permet au JavaScript cote client de reprendre le controle sans re-fetcher.
//
// La page /dashboard doit inclure les donnees dans un <script> tag.
// =============================================================================

function renderDashboardPage(data: DashboardData): string {
  // TODO: Generer le HTML du dashboard AVEC hydration
  // 💡 Inclure un tag <script> qui fait :
  //    window.__INITIAL_STATE__ = { ...les donnees serialisees en JSON... };
  // 💡 ATTENTION : utiliser JSON.stringify pour serialiser
  // 💡 Le HTML doit afficher les stats (visitors, pageViews, bounceRate)
  // 💡 Et la liste des activites recentes
  return "<!-- TODO: PARTIE 2 non implementee -->";
}

// =============================================================================
// PARTIE 3 — Streaming SSR
// =============================================================================
// Implementer le streaming SSR : envoyer le HTML en morceaux.
//
// Sequence :
// 1. Envoyer le <head> et le debut du <body> immediatement
// 2. Attendre les donnees
// 3. Envoyer le contenu principal
// 4. Envoyer le </body></html>
//
// Cela permet au navigateur de commencer a parser le HTML avant
// que toutes les donnees soient pretes.
// =============================================================================

async function streamArticlesPage(res: ServerResponse & { _cacheHeaders?: Record<string, string> }): Promise<void> {
  // TODO: Implementer le streaming SSR
  // 💡 Etape 1 : res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" })
  // 💡 Etape 2 : res.write() pour envoyer le <head> et le debut du <body>
  //    Inclure : <!DOCTYPE html>, <html>, <head>, <title>, </head>, <body>, <h1>
  // 💡 Etape 3 : Attendre fetchArticles() avec await
  // 💡 Etape 4 : res.write() pour envoyer le <ul> avec les articles
  // 💡 Etape 5 : res.write() pour envoyer le </body></html>
  // 💡 Etape 6 : res.end()

  res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
  res.end("<!-- TODO: PARTIE 3 non implementee -->");
}

// =============================================================================
// PARTIE 4 — Cache headers pour SSR
// =============================================================================
// Ajouter les headers Cache-Control adaptes a chaque type de page :
//
// /articles (public)     → "public, max-age=60, s-maxage=300"
// /dashboard (prive)     → "private, no-store"
// /stream (SWR)          → "public, max-age=10, stale-while-revalidate=50"
// =============================================================================

function getCacheHeaders(pageType: string): Record<string, string> {
  // TODO: Retourner les headers Cache-Control pour chaque type de page
  // 💡 "public" → pages visibles par tous (articles, blog)
  // 💡 "private" → pages avec donnees personnelles (dashboard)
  // 💡 "swr" → pages qu'on peut servir stale pendant la revalidation
  return {};
}

// =============================================================================
// Serveur SSR
// =============================================================================

const server = http.createServer(async (req: IncomingMessage, res: ServerResponse & { _cacheHeaders?: Record<string, string> }) => {
  try {
    if (req.url === "/articles") {
      const data = await fetchArticles();
      const html = renderArticlesPage(data);
      const cacheHeaders = getCacheHeaders("public");

      res.writeHead(200, {
        "Content-Type": "text/html; charset=utf-8",
        ...cacheHeaders,
      });
      res.end(html);
      return;
    }

    if (req.url === "/dashboard") {
      const data = await fetchDashboardData();
      const html = renderDashboardPage(data);
      const cacheHeaders = getCacheHeaders("private");

      res.writeHead(200, {
        "Content-Type": "text/html; charset=utf-8",
        ...cacheHeaders,
      });
      res.end(html);
      return;
    }

    if (req.url === "/stream") {
      const cacheHeaders = getCacheHeaders("swr");
      res._cacheHeaders = cacheHeaders;
      await streamArticlesPage(res);
      return;
    }

    res.writeHead(404, { "Content-Type": "text/html" });
    res.end("<h1>404 Not Found</h1>");
  } catch (err) {
    res.writeHead(500, { "Content-Type": "text/html" });
    res.end(`<h1>500 Internal Server Error</h1><pre>${(err as Error).message}</pre>`);
  }
});

// =============================================================================
// Tests
// =============================================================================

async function runTests(): Promise<void> {
  await new Promise<void>((resolve) => server.listen(PORT, resolve));
  console.log(`\n🔬 Serveur SSR sur le port ${PORT}\n`);

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
    // ----- PARTIE 1 : SSR basique -----
    console.log("--- PARTIE 1 : SSR basique ---");

    const r1 = await httpGet(`http://localhost:${PORT}/articles`);
    assert("GET /articles → 200", r1.statusCode === 200);
    assert(
      "/articles → contient <!DOCTYPE html>",
      r1.body.includes("<!DOCTYPE html>")
    );
    assert(
      "/articles → contient <h1>Articles</h1>",
      r1.body.includes("<h1>Articles</h1>")
    );
    assert(
      "/articles → contient les titres d'articles",
      r1.body.includes("Introduction au HTTP Caching") &&
        r1.body.includes("CDN et Performance")
    );
    assert(
      "/articles → contient les auteurs",
      r1.body.includes("Alice") && r1.body.includes("Bob")
    );
    assert(
      "/articles → contient le footer SSR",
      r1.body.includes("Rendu cote serveur")
    );

    // ----- PARTIE 2 : Hydration -----
    console.log("\n--- PARTIE 2 : Hydration ---");

    const r2 = await httpGet(`http://localhost:${PORT}/dashboard`);
    assert("GET /dashboard → 200", r2.statusCode === 200);
    assert(
      "/dashboard → contient window.__INITIAL_STATE__",
      r2.body.includes("window.__INITIAL_STATE__")
    );
    assert(
      "/dashboard → contient les stats",
      r2.body.includes("1234") && r2.body.includes("5678")
    );
    assert(
      "/dashboard → __INITIAL_STATE__ contient les donnees JSON",
      r2.body.includes('"visitors"') && r2.body.includes('"pageViews"')
    );

    // Verifier que le JSON est valide en l'extrayant
    const stateMatch = r2.body.match(
      /window\.__INITIAL_STATE__\s*=\s*(\{[\s\S]*?\});/
    );
    assert(
      "/dashboard → JSON valide dans __INITIAL_STATE__",
      stateMatch !== null && (() => {
        try {
          JSON.parse(stateMatch[1]);
          return true;
        } catch {
          return false;
        }
      })()
    );

    // ----- PARTIE 3 : Streaming -----
    console.log("\n--- PARTIE 3 : Streaming SSR ---");

    const r3 = await httpGet(`http://localhost:${PORT}/stream`);
    assert("GET /stream → 200", r3.statusCode === 200);
    assert(
      "/stream → contient <!DOCTYPE html>",
      r3.body.includes("<!DOCTYPE html>")
    );
    assert(
      "/stream → contient les articles",
      r3.body.includes("Introduction au HTTP Caching")
    );
    assert(
      "/stream → recu en plusieurs chunks",
      r3.chunkCount >= 2
    );
    assert(
      "/stream → transfer-encoding chunked",
      r3.headers["transfer-encoding"] === "chunked"
    );

    // ----- PARTIE 4 : Cache headers -----
    console.log("\n--- PARTIE 4 : Cache headers ---");

    const r4a = await httpGet(`http://localhost:${PORT}/articles`);
    assert(
      "/articles → Cache-Control contient public",
      r4a.headers["cache-control"]?.includes("public")
    );
    assert(
      "/articles → Cache-Control contient max-age=60",
      r4a.headers["cache-control"]?.includes("max-age=60")
    );
    assert(
      "/articles → Cache-Control contient s-maxage=300",
      r4a.headers["cache-control"]?.includes("s-maxage=300")
    );

    const r4b = await httpGet(`http://localhost:${PORT}/dashboard`);
    assert(
      "/dashboard → Cache-Control contient private",
      r4b.headers["cache-control"]?.includes("private")
    );
    assert(
      "/dashboard → Cache-Control contient no-store",
      r4b.headers["cache-control"]?.includes("no-store")
    );

    const r4c = await httpGet(`http://localhost:${PORT}/stream`);
    assert(
      "/stream → Cache-Control contient stale-while-revalidate",
      r4c.headers["cache-control"]?.includes("stale-while-revalidate=50")
    );

    // ----- Resultat -----
    console.log(`\n========================================`);
    console.log(`  ${passed} passed, ${failed} failed`);
    console.log(`========================================\n`);
  } catch (err) {
    console.error("Erreur:", (err as Error).message);
  } finally {
    server.close();
  }
}

setTimeout(runTests, 0);
