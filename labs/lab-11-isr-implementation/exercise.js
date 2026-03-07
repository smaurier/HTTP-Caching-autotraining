// =============================================================================
// Lab 11 — ISR (Incremental Static Regeneration) Implementation
// =============================================================================
// Executer avec : node exercise.js
// =============================================================================

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
// Objectif : Generer des fichiers HTML a partir d'un template et des donnees.
//            Sauvegarder les fichiers dans CACHE_DIR.
//
// TODO: Implementez la fonction renderPage(pagePath, data)
//       qui retourne une string HTML.
//
// 💡 Indice : Creez un template HTML simple avec le titre, le contenu,
//             et un timestamp de generation (new Date().toISOString()).

function renderPage(pagePath, data) {
  // TODO: Retournez une string HTML contenant :
  // - Le titre de la page dans <h1>
  // - Le contenu dans <p>
  // - Le timestamp de generation dans un <footer>
  // - Le nombre de visites dans un <span>
  //
  // 💡 Indice : Utilisez des template literals (backticks)
  console.log('  TODO: Implementer renderPage()');
  return '<html><body><h1>TODO</h1></body></html>';
}

// TODO: Implementez la fonction buildPages()
//       qui genere les fichiers HTML pour toutes les pages.
//
// 💡 Indice : Parcourez les cles de `database`, appelez renderPage(),
//             ecrivez le resultat dans CACHE_DIR, et stockez le timestamp
//             dans cacheMetadata.

function buildPages() {
  // TODO: Creer le dossier CACHE_DIR s'il n'existe pas
  // TODO: Pour chaque page dans database :
  //   1. Appeler renderPage()
  //   2. Ecrire le HTML dans un fichier (ex: .cache/index.html, .cache/about.html)
  //   3. Stocker le timestamp dans cacheMetadata[pagePath]
  //
  // 💡 Indice : Utilisez fs.mkdirSync(CACHE_DIR, { recursive: true })
  // 💡 Indice : Pour '/', utilisez 'index.html', pour '/about' utilisez 'about.html'
  console.log('  TODO: Implementer buildPages()');
}

// =============================================================================
// PARTIE 2 — Servir les pages pre-rendues avec Cache-Control
// =============================================================================
// Objectif : Servir les fichiers HTML pre-rendus avec les bons headers.
//
// TODO: Implementez la fonction serveCachedPage(pagePath, res)
//       qui lit le fichier HTML et l'envoie avec Cache-Control.
//
// 💡 Indice : Le header Cache-Control doit inclure max-age ET
//             stale-while-revalidate pour permettre la revalidation en arriere-plan.

function serveCachedPage(pagePath, res) {
  // TODO: Determiner le nom de fichier a partir de pagePath
  // TODO: Lire le fichier HTML depuis CACHE_DIR
  // TODO: Ajouter les headers :
  //   - Content-Type: text/html
  //   - Cache-Control: public, max-age=REVALIDATE_SECONDS, stale-while-revalidate=...
  //   - X-Generated-At: timestamp de generation
  //   - X-Cache-Status: HIT ou STALE
  // TODO: Envoyer le contenu HTML
  //
  // 💡 Indice : Comparez Date.now() avec cacheMetadata[pagePath] + TTL
  //             pour savoir si la page est "fresh" ou "stale"
  console.log('  TODO: Implementer serveCachedPage()');
  res.writeHead(200, { 'Content-Type': 'text/html' });
  res.end('<html><body><h1>TODO: Servir la page en cache</h1></body></html>');
}

// =============================================================================
// PARTIE 3 — Revalidation en arriere-plan
// =============================================================================
// Objectif : Quand une page est stale, la servir quand meme mais
//            declencher une re-generation en arriere-plan.
//
// TODO: Implementez la fonction revalidateInBackground(pagePath)
//       qui regenere la page de maniere asynchrone.
//
// 💡 Indice : Utilisez setTimeout ou une Promise pour simuler
//             un delai de regeneration (comme un appel API/DB).

function revalidateInBackground(pagePath) {
  // TODO: Simuler un delai (ex: 500ms) pour la regeneration
  // TODO: Incrementer les visites dans database
  // TODO: Appeler renderPage() avec les nouvelles donnees
  // TODO: Ecrire le nouveau HTML dans CACHE_DIR
  // TODO: Mettre a jour cacheMetadata[pagePath]
  // TODO: Logger que la revalidation est terminee
  //
  // 💡 Indice : La fonction ne doit PAS etre await-ee par le serveur.
  //             Le client recoit la version stale immediatement.
  console.log('  TODO: Implementer revalidateInBackground()');
}

// =============================================================================
// PARTIE 4 — Revalidation a la demande (on-demand)
// =============================================================================
// Objectif : Permettre de forcer la revalidation via un endpoint API.
//
// TODO: Implementez la fonction handleOnDemandRevalidation(reqPath, res)
//       qui regenere immediatement la page demandee.
//
// 💡 Indice : Contrairement a la Partie 3, ici on ATTEND la regeneration
//             avant de repondre au client.

function handleOnDemandRevalidation(reqPath, res) {
  // TODO: Extraire le path de la query string (ex: ?path=/about)
  // TODO: Verifier que la page existe dans database
  // TODO: Regenerer la page immediatement (pas en arriere-plan)
  // TODO: Repondre avec un JSON { revalidated: true, path: '...' }
  //
  // 💡 Indice : Utilisez new URL(reqPath, 'http://localhost').searchParams
  //             pour parser la query string
  console.log('  TODO: Implementer handleOnDemandRevalidation()');
  res.writeHead(501, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Not implemented' }));
}

// =============================================================================
// Serveur principal
// =============================================================================

const server = http.createServer((req, res) => {
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
      if (cacheMetadata['/']) {
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
      } else {
        console.log('  \u274C Test 8: cacheMetadata non rempli (Partie 1 non implementee)');
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
