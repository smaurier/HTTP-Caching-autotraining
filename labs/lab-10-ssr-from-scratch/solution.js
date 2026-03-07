// =============================================================================
// Lab 10 — SSR from Scratch (Solution)
// =============================================================================
// Executer avec : node solution.js
// =============================================================================

import http from "node:http";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------
const PORT = 4100;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function httpGet(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      const chunks = [];
      res.on("data", (chunk) => chunks.push(chunk.toString()));
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
// Donnees simulees
// ---------------------------------------------------------------------------

function fetchUserData() {
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve({
        user: { id: 1, name: "Alice", role: "admin" },
        notifications: 3,
      });
    }, 50);
  });
}

function fetchArticles() {
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

function fetchDashboardData() {
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
// PARTIE 1 — SSR basique
// =============================================================================

function renderArticlesPage(data) {
  // POURQUOI : le SSR genere le HTML complet cote serveur. Le navigateur
  // recoit une page directement affichable, sans attendre le JavaScript.
  // C'est crucial pour le SEO et le First Contentful Paint.
  const articlesList = data.articles
    .map(
      (a) => `        <li><strong>${a.title}</strong> — par ${a.author}</li>`
    )
    .join("\n");

  return `<!DOCTYPE html>
<html lang="fr">
  <head>
    <meta charset="utf-8">
    <title>Articles</title>
    <style>
      body { font-family: system-ui, sans-serif; max-width: 800px; margin: 0 auto; padding: 2rem; }
      li { margin: 0.5rem 0; }
      footer { margin-top: 2rem; color: #666; font-size: 0.9rem; }
    </style>
  </head>
  <body>
    <h1>Articles</h1>
    <ul>
${articlesList}
    </ul>
    <footer>Rendu cote serveur a ${Date.now()}</footer>
  </body>
</html>`;
}

// =============================================================================
// PARTIE 2 — Hydration
// =============================================================================

function renderDashboardPage(data) {
  // POURQUOI : l'hydration est le pont entre le SSR et l'interactivite.
  // window.__INITIAL_STATE__ permet au JavaScript cote client de reprendre
  // exactement la ou le serveur s'est arrete, sans re-fetcher les donnees.
  // C'est le meme principe utilise par Next.js, Nuxt, etc.
  const initialState = JSON.stringify(data);

  const activityRows = data.recentActivity
    .map(
      (a) =>
        `        <tr><td>${a.action}</td><td>${a.user}</td><td>${a.time}</td></tr>`
    )
    .join("\n");

  return `<!DOCTYPE html>
<html lang="fr">
  <head>
    <meta charset="utf-8">
    <title>Dashboard</title>
    <style>
      body { font-family: system-ui, sans-serif; max-width: 800px; margin: 0 auto; padding: 2rem; }
      .stats { display: flex; gap: 2rem; margin: 1rem 0; }
      .stat { background: #f0f0f0; padding: 1rem; border-radius: 8px; }
      .stat-value { font-size: 2rem; font-weight: bold; }
      table { border-collapse: collapse; width: 100%; }
      td, th { border: 1px solid #ddd; padding: 0.5rem; text-align: left; }
    </style>
  </head>
  <body>
    <h1>Dashboard</h1>

    <div class="stats">
      <div class="stat">
        <div class="stat-value">${data.stats.visitors}</div>
        <div>Visiteurs</div>
      </div>
      <div class="stat">
        <div class="stat-value">${data.stats.pageViews}</div>
        <div>Pages vues</div>
      </div>
      <div class="stat">
        <div class="stat-value">${(data.stats.bounceRate * 100).toFixed(0)}%</div>
        <div>Taux de rebond</div>
      </div>
    </div>

    <h2>Activite recente</h2>
    <table>
      <thead>
        <tr><th>Action</th><th>Utilisateur</th><th>Heure</th></tr>
      </thead>
      <tbody>
${activityRows}
      </tbody>
    </table>

    <script>
      // POURQUOI : on injecte les donnees dans une variable globale pour
      // que le framework cote client puisse hydrater sans re-fetcher.
      // En production, on echapperait le JSON pour eviter les injections XSS.
      window.__INITIAL_STATE__ = ${initialState};
      console.log("Hydration: state loaded", window.__INITIAL_STATE__);
    </script>
  </body>
</html>`;
}

// =============================================================================
// PARTIE 3 — Streaming SSR
// =============================================================================

async function streamArticlesPage(res) {
  // POURQUOI : le streaming permet au navigateur de commencer a afficher
  // la page avant que toutes les donnees soient pretes. C'est crucial
  // pour les pages avec des donnees lentes (API, DB complexes).
  //
  // Timeline :
  // t=0ms   → le navigateur recoit le <head> et commence a charger les CSS
  // t=50ms  → les donnees arrivent, le navigateur affiche le contenu
  // t=50ms  → le HTML est complet
  //
  // Sans streaming, le navigateur attendrait 50ms avant de recevoir quoi que ce soit.

  const cacheHeaders = res._cacheHeaders || {};

  res.writeHead(200, {
    "Content-Type": "text/html; charset=utf-8",
    ...cacheHeaders,
  });

  // POURQUOI : on envoie le shell HTML immediatement.
  // Le navigateur peut deja parser le <head>, charger les CSS/JS,
  // et afficher le squelette de la page.
  res.write(`<!DOCTYPE html>
<html lang="fr">
  <head>
    <meta charset="utf-8">
    <title>Articles (Streaming)</title>
    <style>
      body { font-family: system-ui, sans-serif; max-width: 800px; margin: 0 auto; padding: 2rem; }
      li { margin: 0.5rem 0; }
      .loading { color: #999; }
    </style>
  </head>
  <body>
    <h1>Articles</h1>
    <p class="loading">Chargement...</p>
`);

  // POURQUOI : on attend les donnees. Pendant ce temps, le navigateur
  // affiche deja le squelette de la page.
  const data = await fetchArticles();

  // POURQUOI : on envoie le contenu principal. Le navigateur le recoit
  // et met a jour l'affichage en temps reel.
  const articlesList = data.articles
    .map(
      (a) => `      <li><strong>${a.title}</strong> — par ${a.author}</li>`
    )
    .join("\n");

  res.write(`    <ul>
${articlesList}
    </ul>
    <footer>Rendu cote serveur (streaming) a ${Date.now()}</footer>
`);

  // POURQUOI : on ferme le document HTML. Le navigateur sait
  // que la page est complete.
  res.write(`  </body>
</html>`);

  res.end();
}

// =============================================================================
// PARTIE 4 — Cache headers pour SSR
// =============================================================================

function getCacheHeaders(pageType) {
  switch (pageType) {
    case "public":
      // POURQUOI : les pages publiques (articles, blog) peuvent etre cachees
      // par tout le monde. max-age=60 pour le navigateur, s-maxage=300 pour
      // les CDN. Le CDN garde plus longtemps car il sert plusieurs utilisateurs.
      return {
        "Cache-Control": "public, max-age=60, s-maxage=300",
      };

    case "private":
      // POURQUOI : les pages avec donnees personnelles (dashboard) ne doivent
      // JAMAIS etre stockees par un cache partage (CDN, proxy). no-store
      // empeche tout stockage, private limite au navigateur de l'utilisateur.
      return {
        "Cache-Control": "private, no-store",
      };

    case "swr":
      // POURQUOI : stale-while-revalidate permet au CDN de servir une version
      // stale pendant qu'il revalide en arriere-plan. Parfait pour les pages
      // qui changent regulierement mais ou la fraicheur absolue n'est pas critique.
      // max-age=10 : frais pendant 10s
      // stale-while-revalidate=50 : peut servir stale pendant 50s de plus
      return {
        "Cache-Control": "public, max-age=10, stale-while-revalidate=50",
      };

    default:
      return {};
  }
}

// =============================================================================
// Serveur SSR
// =============================================================================

const server = http.createServer(async (req, res) => {
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
    res.end(`<h1>500 Internal Server Error</h1><pre>${err.message}</pre>`);
  }
});

// =============================================================================
// Tests
// =============================================================================

async function runTests() {
  await new Promise((resolve) => server.listen(PORT, resolve));
  console.log(`\n🔬 Serveur SSR sur le port ${PORT}\n`);

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

    console.log(`\n========================================`);
    console.log(`  ${passed} passed, ${failed} failed`);
    console.log(`========================================\n`);
  } catch (err) {
    console.error("Erreur:", err.message);
  } finally {
    server.close();
  }
}

setTimeout(runTests, 0);
