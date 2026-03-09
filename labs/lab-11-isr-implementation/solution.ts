// =============================================================================
// Lab 11 — ISR (Incremental Static Regeneration) Implementation — SOLUTION
// =============================================================================
// Executer avec : npx tsx solution.ts
// =============================================================================

import type { IncomingMessage, ServerResponse, IncomingHttpHeaders } from 'node:http';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const PORT = 3011;
const CACHE_DIR = path.join(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1')), '.cache');
const REVALIDATE_SECONDS = 10; // TTL en secondes

// --- Donnees simulees (comme une base de donnees) ---
const database = {
  '/': {
    title: 'Accueil',
    content: 'Bienvenue sur notre site ISR !',
    visits: 0,
  },
  '/about': {
    title: 'A propos',
    content: 'Nous sommes une equipe passionnee.',
    visits: 0,
  },
  '/blog': {
    title: 'Blog',
    content: 'Dernier article : Comprendre ISR',
    visits: 0,
  },
};

// --- Metadonnees de cache (timestamp de generation par page) ---
const cacheMetadata = {};

// =============================================================================
// PARTIE 1 — Pre-rendu au "build time"
// =============================================================================
// POURQUOI : ISR commence par generer des pages statiques au "build time".
// Cela permet de servir du HTML pre-rendu tres rapidement, comme un site statique,
// tout en conservant la possibilite de mettre a jour les pages individuellement.

function renderPage(pagePath, data) {
  // POURQUOI : On genere un HTML complet avec un timestamp de generation.
  // Ce timestamp nous permettra de verifier visuellement que la page a ete regeneree.
  const generatedAt = new Date().toISOString();
  const html = `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <title>${data.title}</title>
</head>
<body>
  <h1>${data.title}</h1>
  <p>${data.content}</p>
  <span>Visites: ${data.visits}</span>
  <footer>
    <p>Page generee le: ${generatedAt}</p>
    <p>Path: ${pagePath}</p>
  </footer>
</body>
</html>`;
  return html;
}

function buildPages() {
  // POURQUOI : On cree le dossier de cache s'il n'existe pas.
  // recursive: true evite une erreur si le dossier existe deja.
  fs.mkdirSync(CACHE_DIR, { recursive: true });

  for (const [pagePath, data] of Object.entries(database)) {
    // POURQUOI : On convertit le path en nom de fichier.
    // '/' -> 'index.html', '/about' -> 'about.html'
    const fileName = pagePath === '/' ? 'index.html' : `${pagePath.slice(1)}.html`;
    const filePath = path.join(CACHE_DIR, fileName);

    const html = renderPage(pagePath, data);
    fs.writeFileSync(filePath, html, 'utf-8');

    // POURQUOI : On stocke le timestamp de generation pour pouvoir
    // determiner plus tard si la page est "stale" ou "fresh".
    cacheMetadata[pagePath] = Date.now();

    console.log(`  [Build] Page ${pagePath} -> ${fileName}`);
  }
}

// =============================================================================
// PARTIE 2 — Servir les pages pre-rendues avec Cache-Control
// =============================================================================
// POURQUOI : On sert les pages pre-rendues avec des headers Cache-Control
// qui indiquent au navigateur (et au CDN) combien de temps garder la page
// et quand revalider.

function serveCachedPage(pagePath, res) {
  // POURQUOI : Conversion du path en nom de fichier, identique a buildPages()
  const fileName = pagePath === '/' ? 'index.html' : `${pagePath.slice(1)}.html`;
  const filePath = path.join(CACHE_DIR, fileName);

  // POURQUOI : On lit le fichier HTML pre-rendu depuis le disque.
  // En production, un CDN servirait ce fichier directement.
  let html;
  try {
    html = fs.readFileSync(filePath, 'utf-8');
  } catch {
    res.writeHead(500, { 'Content-Type': 'text/plain' });
    res.end('Erreur: Page non trouvee dans le cache');
    return;
  }

  // POURQUOI : On calcule l'age de la page pour determiner si elle est
  // "fresh" (< TTL) ou "stale" (> TTL).
  const generatedAt = cacheMetadata[pagePath] || 0;
  const ageSeconds = (Date.now() - generatedAt) / 1000;
  const isFresh = ageSeconds <= REVALIDATE_SECONDS;

  // POURQUOI : Le header Cache-Control utilise stale-while-revalidate
  // pour permettre au navigateur de servir une version stale pendant
  // qu'une revalidation se fait en arriere-plan.
  const cacheControl = `public, max-age=${REVALIDATE_SECONDS}, stale-while-revalidate=${REVALIDATE_SECONDS * 6}`;

  res.writeHead(200, {
    'Content-Type': 'text/html',
    'Cache-Control': cacheControl,
    'X-Generated-At': new Date(generatedAt).toISOString(),
    'X-Cache-Status': isFresh ? 'HIT' : 'STALE',
    'X-Page-Age': `${ageSeconds.toFixed(1)}s`,
  });
  res.end(html);
}

// =============================================================================
// PARTIE 3 — Revalidation en arriere-plan
// =============================================================================
// POURQUOI : C'est le coeur d'ISR. Quand une page est stale, on la sert
// quand meme (l'utilisateur ne doit pas attendre) mais on declenche une
// regeneration en arriere-plan. La prochaine requete recevra la version fraiche.

function revalidateInBackground(pagePath) {
  // POURQUOI : setTimeout simule un delai asynchrone (appel API, requete DB, etc.)
  // En production, ce serait un vrai appel a une source de donnees.
  setTimeout(() => {
    const data = database[pagePath];
    if (!data) return;

    // POURQUOI : On incremente les visites pour simuler une donnee qui change.
    data.visits++;

    const html = renderPage(pagePath, data);
    const fileName = pagePath === '/' ? 'index.html' : `${pagePath.slice(1)}.html`;
    const filePath = path.join(CACHE_DIR, fileName);

    fs.writeFileSync(filePath, html, 'utf-8');
    cacheMetadata[pagePath] = Date.now();

    console.log(`  [ISR] Revalidation background terminee pour ${pagePath} (visites: ${data.visits})`);
  }, 500); // POURQUOI : 500ms simule le temps de regeneration
}

// =============================================================================
// PARTIE 4 — Revalidation a la demande (on-demand)
// =============================================================================
// POURQUOI : Parfois on veut forcer la regeneration immediatement,
// par exemple apres une mise a jour de contenu dans un CMS.
// Next.js expose res.revalidate() pour cela.

function handleOnDemandRevalidation(reqPath, res) {
  // POURQUOI : On parse la query string pour extraire le path a revalider.
  const url = new URL(reqPath, 'http://localhost');
  const targetPath = url.searchParams.get('path');

  if (!targetPath || !database[targetPath]) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      error: 'Invalid path',
      message: `Page "${targetPath}" not found. Available: ${Object.keys(database).join(', ')}`,
    }));
    return;
  }

  // POURQUOI : Contrairement a la revalidation background (Partie 3),
  // ici on regenere immediatement et on attend avant de repondre.
  const data = database[targetPath];
  data.visits++;

  const html = renderPage(targetPath, data);
  const fileName = targetPath === '/' ? 'index.html' : `${targetPath.slice(1)}.html`;
  const filePath = path.join(CACHE_DIR, fileName);

  fs.writeFileSync(filePath, html, 'utf-8');
  cacheMetadata[targetPath] = Date.now();

  console.log(`  [ISR] Revalidation on-demand terminee pour ${targetPath}`);

  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({
    revalidated: true,
    path: targetPath,
    generatedAt: new Date(cacheMetadata[targetPath]).toISOString(),
  }));
}

// =============================================================================
// Serveur principal
// =============================================================================

const server = http.createServer((req: IncomingMessage, res: ServerResponse) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);

  // POST /revalidate?path=/...
  if (req.method === 'POST' && url.pathname === '/revalidate') {
    handleOnDemandRevalidation(req.url, res);
    return;
  }

  // GET pages
  const pagePath = url.pathname;
  if (database[pagePath]) {
    // Incrementer les visites
    database[pagePath].visits++;
    serveCachedPage(pagePath, res);

    // Verifier si stale et revalider en arriere-plan
    const generatedAt = cacheMetadata[pagePath] || 0;
    const age = (Date.now() - generatedAt) / 1000;
    if (age > REVALIDATE_SECONDS) {
      console.log(`  [ISR] Page ${pagePath} est stale (age: ${age.toFixed(1)}s), revalidation en arriere-plan...`);
      revalidateInBackground(pagePath);
    }
    return;
  }

  res.writeHead(404, { 'Content-Type': 'text/plain' });
  res.end('404 Not Found');
});

// =============================================================================
// Tests automatises
// =============================================================================

async function runTests() {
  console.log('\n=== Lab 11 — ISR Implementation ===\n');

  // Build initial
  console.log('[Build] Generation des pages au "build time"...');
  buildPages();

  return new Promise((resolve) => {
    server.listen(PORT, async () => {
      console.log(`\n[Serveur] Demarre sur http://localhost:${PORT}\n`);

      const makeRequest = (method, path) => {
        return new Promise((resolve, reject) => {
          const req = http.request(
            { hostname: 'localhost', port: PORT, path, method },
            (res) => {
              let body = '';
              res.on('data', (chunk) => (body += chunk));
              res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body }));
            }
          );
          req.on('error', reject);
          req.end();
        });
      };

      let passed = 0;
      let failed = 0;

      // Test 1: Pages pre-rendues existent
      const cacheExists = fs.existsSync(CACHE_DIR);
      if (cacheExists) {
        const files = fs.readdirSync(CACHE_DIR);
        if (files.length >= 3) {
          console.log('  \u2705 Test 1: Pages pre-rendues generees dans .cache/');
          passed++;
        } else {
          console.log(`  \u274C Test 1: Seulement ${files.length} fichier(s) dans .cache/ (attendu: 3+)`);
          failed++;
        }
      } else {
        console.log('  \u274C Test 1: Dossier .cache/ non cree');
        failed++;
      }

      // Test 2: Servir une page avec Cache-Control
      const res1 = await makeRequest('GET', '/');
      if (res1.headers['cache-control'] && res1.headers['cache-control'].includes('max-age')) {
        console.log(`  \u2705 Test 2: Cache-Control present (${res1.headers['cache-control']})`);
        passed++;
      } else {
        console.log(`  \u274C Test 2: Cache-Control manquant ou incorrect (${res1.headers['cache-control'] || 'absent'})`);
        failed++;
      }

      // Test 3: Page contient le titre
      if (res1.body.includes('Accueil')) {
        console.log('  \u2705 Test 3: Page "/" contient le titre "Accueil"');
        passed++;
      } else {
        console.log('  \u274C Test 3: Page "/" ne contient pas le titre "Accueil"');
        failed++;
      }

      // Test 4: X-Cache-Status header
      if (res1.headers['x-cache-status']) {
        console.log(`  \u2705 Test 4: X-Cache-Status present (${res1.headers['x-cache-status']})`);
        passed++;
      } else {
        console.log('  \u274C Test 4: Header X-Cache-Status manquant');
        failed++;
      }

      // Test 5: Page /about
      const res2 = await makeRequest('GET', '/about');
      if (res2.body.includes('propos')) {
        console.log('  \u2705 Test 5: Page "/about" contient le bon contenu');
        passed++;
      } else {
        console.log('  \u274C Test 5: Page "/about" ne contient pas le bon contenu');
        failed++;
      }

      // Test 6: 404 pour page inconnue
      const res3 = await makeRequest('GET', '/unknown');
      if (res3.status === 404) {
        console.log('  \u2705 Test 6: 404 pour page inconnue');
        passed++;
      } else {
        console.log(`  \u274C Test 6: Status ${res3.status} au lieu de 404`);
        failed++;
      }

      // Test 7: Revalidation a la demande
      const res4 = await makeRequest('POST', '/revalidate?path=/blog');
      if (res4.status === 200) {
        try {
          const json = JSON.parse(res4.body);
          if (json.revalidated === true) {
            console.log('  \u2705 Test 7: Revalidation a la demande fonctionne');
            passed++;
          } else {
            console.log(`  \u274C Test 7: Reponse JSON inattendue: ${res4.body}`);
            failed++;
          }
        } catch {
          console.log(`  \u274C Test 7: Reponse non-JSON: ${res4.body}`);
          failed++;
        }
      } else {
        console.log(`  \u274C Test 7: Status ${res4.status} au lieu de 200`);
        failed++;
      }

      // Test 8: Stale page servie puis revalidee
      // Forcer une page a etre stale
      cacheMetadata['/'] = Date.now() - (REVALIDATE_SECONDS + 5) * 1000;
      const res5 = await makeRequest('GET', '/');
      // Attendre la revalidation background
      await new Promise((r) => setTimeout(r, 1000));
      const res6 = await makeRequest('GET', '/');
      if (res5.headers['x-cache-status'] === 'STALE' || res6.headers['x-generated-at'] !== res5.headers['x-generated-at']) {
        console.log('  \u2705 Test 8: Page stale servie, puis revalidee en arriere-plan');
        passed++;
      } else {
        console.log('  \u274C Test 8: Revalidation en arriere-plan non detectee');
        failed++;
      }

      console.log(`\n  Resultats: ${passed}/${passed + failed} tests passes\n`);

      // Nettoyage
      server.close();
      if (fs.existsSync(CACHE_DIR)) {
        fs.rmSync(CACHE_DIR, { recursive: true });
      }
      resolve();
    });
  });
}

setTimeout(runTests, 0);
