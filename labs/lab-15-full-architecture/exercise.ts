// =============================================================================
// Lab 15 — Full Architecture (Projet final)
// =============================================================================
// Executer avec : npx tsx exercise.ts
// =============================================================================

import type { IncomingMessage, ServerResponse, IncomingHttpHeaders } from 'node:http';
import http from 'node:http';
import crypto from 'node:crypto';
import zlib from 'node:zlib';

const ORIGIN_PORT = 3150;
const CDN_PORT = 3151;

// =============================================================================
// Donnees simulees (base de donnees)
// =============================================================================

const database = {
  '/': {
    title: 'Accueil',
    content: 'Bienvenue sur notre plateforme !',
    version: 1,
  },
  '/products': {
    title: 'Produits',
    content: 'Decouvrez nos produits de qualite.',
    version: 1,
  },
  '/blog': {
    title: 'Blog',
    content: 'Les dernieres actualites de notre equipe.',
    version: 1,
  },
};

let originRequestCount = 0;

// =============================================================================
// PARTIE 1 — Serveur d'origine avec SSR
// =============================================================================
// Objectif : Construire un serveur qui genere du HTML dynamiquement
//            avec des headers de cache complets.
//
// TODO: Implementez le serveur d'origine avec :
//   - SSR : generation de HTML a partir des donnees
//   - Cache-Control: public, max-age=10, stale-while-revalidate=30
//   - ETag basee sur le contenu (hash)
//   - Last-Modified basee sur la date de derniere modification
//   - Support de If-None-Match (304)
//   - Support de If-Modified-Since (304)
//   - Compression gzip si supportee
//
// 💡 Indice : Generez le HTML, calculez son ETag, puis verifiez
//             les conditions avant d'envoyer la reponse.

const pageLastModified = {};

function renderSSRPage(pagePath, data) {
  // TODO: Generer un HTML complet avec :
  //   - Le titre dans <h1>
  //   - Le contenu dans <p>
  //   - Le numero de version
  //   - Le timestamp de generation
  //   - Le nombre de requetes a l'origine (originRequestCount)
  //
  // 💡 Indice : Incluez les metadonnees dans des balises <meta> ou
  //             des data-attributes pour faciliter le parsing dans les tests
  console.log('  TODO: Implementer renderSSRPage()');
  return '<html><body><h1>TODO</h1></body></html>';
}

const originServer = http.createServer((req: IncomingMessage, res: ServerResponse) => {
  const url = new URL(req.url, `http://localhost:${ORIGIN_PORT}`);
  originRequestCount++;
  console.log(`  [Origin #${originRequestCount}] ${req.method} ${url.pathname}`);

  // Route: GET /api/update — modifier les donnees (simule un CMS)
  if (req.method === 'POST' && url.pathname === '/api/update') {
    // TODO: Lire le body JSON, mettre a jour database[path]
    // TODO: Incrementer la version
    // TODO: Mettre a jour pageLastModified[path]
    //
    // 💡 Indice : Collectez le body avec req.on('data') / req.on('end')
    console.log('  TODO: Implementer /api/update');
    res.writeHead(501, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not implemented' }));
    return;
  }

  const pagePath = url.pathname;
  const data = database[pagePath];

  if (!data) {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('404 Not Found');
    return;
  }

  // TODO: Generer le HTML via SSR
  // TODO: Calculer l'ETag (hash MD5 du HTML)
  // TODO: Verifier If-None-Match pour 304
  // TODO: Verifier If-Modified-Since pour 304
  // TODO: Compresser en gzip si Accept-Encoding le supporte
  // TODO: Envoyer avec Cache-Control, ETag, Last-Modified
  //
  // 💡 Indice : L'ETag doit etre entre guillemets : '"abc123"'
  // 💡 Indice : Last-Modified utilise le format HTTP date : new Date().toUTCString()
  console.log('  TODO: Implementer la reponse SSR avec headers');

  res.writeHead(200, { 'Content-Type': 'text/html' });
  res.end(renderSSRPage(pagePath, data));
});

// =============================================================================
// PARTIE 2 — Simulateur de CDN
// =============================================================================
// Objectif : Construire un proxy CDN qui :
//   - Cache les reponses en memoire avec respect du TTL
//   - Expose un endpoint de purge
//   - Ajoute des headers diagnostiques
//
// TODO: Implementez le CDN avec les fonctionnalites suivantes :
//   - Cache en memoire (Map)
//   - Verification de la fraicheur (max-age)
//   - Proxy vers l'origine en cas de MISS
//   - Endpoint POST /purge?path=...
//   - Headers: X-CDN-Cache (HIT/MISS), Age, X-Cache-Hits
//
// 💡 Indice : Chaque entree de cache doit stocker :
//             { body, headers, status, timestamp, maxAge, hits }

const cdnCache = new Map();

function getCDNCacheEntry(path) {
  // TODO: Verifier si le path est en cache et n'est pas expire
  // Retourner l'entree ou null
  //
  // 💡 Indice : age = (Date.now() - entry.timestamp) / 1000
  //             si age > entry.maxAge, l'entree est expiree
  console.log('  TODO: Implementer getCDNCacheEntry()');
  return null;
}

function storeCDNCacheEntry(path, status, headers, body) {
  // TODO: Parser le max-age du Cache-Control
  // TODO: Stocker { body, headers, status, timestamp, maxAge, hits: 0 }
  //
  // 💡 Indice : Ne cachez pas les reponses 404 ou sans Cache-Control
  console.log('  TODO: Implementer storeCDNCacheEntry()');
}

function proxyToOrigin(clientReq, clientRes, path) {
  // TODO: Faire une requete HTTP vers le serveur d'origine
  // TODO: Collecter la reponse (status, headers, body)
  // TODO: Stocker dans le cache CDN
  // TODO: Renvoyer au client avec X-CDN-Cache: MISS
  //
  // 💡 Indice : Transmettez les headers If-None-Match et If-Modified-Since
  //             du client vers l'origine
  console.log('  TODO: Implementer proxyToOrigin()');
  clientRes.writeHead(502, { 'Content-Type': 'text/plain' });
  clientRes.end('TODO: CDN proxy not implemented');
}

function handlePurge(req, res) {
  // TODO: Extraire le path de la query string
  // TODO: Supprimer l'entree du cache CDN
  // TODO: Repondre avec { purged: true, path }
  //
  // 💡 Indice : Si path === '*', purger tout le cache
  console.log('  TODO: Implementer handlePurge()');
  res.writeHead(501, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Not implemented' }));
}

const cdnServer = http.createServer((req: IncomingMessage, res: ServerResponse) => {
  const url = new URL(req.url, `http://localhost:${CDN_PORT}`);

  // POST /purge?path=...
  if (req.method === 'POST' && url.pathname === '/purge') {
    handlePurge(req, res);
    return;
  }

  // GET /cdn-stats — statistiques du cache
  if (url.pathname === '/cdn-stats') {
    const stats = {};
    for (const [key, entry] of cdnCache) {
      stats[key] = {
        hits: entry.hits,
        age: ((Date.now() - entry.timestamp) / 1000).toFixed(1) + 's',
        maxAge: entry.maxAge + 's',
      };
    }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(stats, null, 2));
    return;
  }

  // Verifier le cache CDN
  const cached = getCDNCacheEntry(url.pathname);
  if (cached) {
    cached.hits++;
    const age = Math.floor((Date.now() - cached.timestamp) / 1000);
    console.log(`  [CDN] HIT ${url.pathname} (age: ${age}s, hits: ${cached.hits})`);
    const headers = {
      ...cached.headers,
      'X-CDN-Cache': 'HIT',
      Age: age.toString(),
      'X-Cache-Hits': cached.hits.toString(),
    };
    res.writeHead(cached.status, headers);
    res.end(cached.body);
    return;
  }

  console.log(`  [CDN] MISS ${url.pathname}`);
  proxyToOrigin(req, res, url.pathname);
});

// =============================================================================
// PARTIE 3 — Simulateur de cache navigateur
// =============================================================================
// Objectif : Simuler le comportement du cache du navigateur.
//
// TODO: Implementez la classe BrowserCache avec :
//   - fetch(url) : fait une requete ou retourne du cache
//   - Respect de Cache-Control (max-age, no-cache, no-store)
//   - Envoi de If-None-Match pour la revalidation
//   - Support de stale-while-revalidate
//
// 💡 Indice : C'est une classe qui simule ce que fait un vrai navigateur.
//             Elle contacte le CDN (pas l'origine directement).

class BrowserCache {
  constructor() {
    this.cache = new Map();
    this.revalidating = new Set();
  }

  // TODO: Implementez fetch(path) qui :
  //   1. Verifie si la reponse est dans le cache local
  //   2. Si oui et fresh -> retourne du cache (BROWSER_HIT)
  //   3. Si oui et stale avec SWR -> retourne du cache et revalide en background
  //   4. Si oui et stale sans SWR -> revalide (envoie If-None-Match)
  //   5. Si non -> fait une requete au CDN
  //
  // 💡 Indice : Retournez un objet { body, headers, status, source }
  //             ou source = 'browser-cache' | 'cdn-hit' | 'cdn-miss' | 'revalidated'

  async fetch(path) {
    // TODO: Implementer la logique de cache navigateur
    //
    // 💡 Indice : Pour la revalidation, ajoutez le header If-None-Match
    //             avec l'ETag stockee dans le cache
    // 💡 Indice : Si la reponse est 304, gardez le body cache
    console.log('  TODO: Implementer BrowserCache.fetch()');
    return this._makeRequest(path);
  }

  _makeRequest(path, extraHeaders = {}) {
    return new Promise((resolve, reject) => {
      const req = http.request(
        {
          hostname: 'localhost',
          port: CDN_PORT,
          path,
          method: 'GET',
          headers: extraHeaders,
        },
        (res) => {
          let body = '';
          res.on('data', (chunk) => (body += chunk));
          res.on('end', () => {
            resolve({
              body,
              headers: res.headers,
              status: res.statusCode,
              source: res.headers['x-cdn-cache'] === 'HIT' ? 'cdn-hit' : 'cdn-miss',
            });
          });
        }
      );
      req.on('error', reject);
      req.end();
    });
  }

  // TODO: Implementez _parseMaxAge(cacheControl) et _parseSWR(cacheControl)
  _parseMaxAge(cacheControl) {
    console.log('  TODO: Implementer _parseMaxAge()');
    return 0;
  }

  _parseSWR(cacheControl) {
    console.log('  TODO: Implementer _parseSWR()');
    return 0;
  }

  clear() {
    this.cache.clear();
  }

  getStats() {
    const stats = {};
    for (const [key, entry] of this.cache) {
      stats[key] = {
        age: ((Date.now() - entry.timestamp) / 1000).toFixed(1) + 's',
        etag: entry.etag || 'none',
        fresh: (Date.now() - entry.timestamp) / 1000 < (entry.maxAge || 0),
      };
    }
    return stats;
  }
}

// =============================================================================
// PARTIE 4 — Tests d'integration complets
// =============================================================================

async function runTests() {
  console.log('\n=== Lab 15 — Full Architecture (Projet final) ===\n');

  const browser = new BrowserCache();

  return new Promise((resolve) => {
    originServer.listen(ORIGIN_PORT, () => {
      console.log(`[Origin] Serveur d'origine sur http://localhost:${ORIGIN_PORT}`);

      cdnServer.listen(CDN_PORT, async () => {
        console.log(`[CDN] Simulateur CDN sur http://localhost:${CDN_PORT}`);
        console.log(`[Browser] Simulateur cache navigateur pret\n`);

        let passed = 0;
        let failed = 0;

        const postRequest = (port, path, body) => {
          return new Promise((resolve, reject) => {
            const data = JSON.stringify(body);
            const req = http.request(
              {
                hostname: 'localhost',
                port,
                path,
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) },
              },
              (res) => {
                let responseBody = '';
                res.on('data', (chunk) => (responseBody += chunk));
                res.on('end', () => resolve({ status: res.statusCode, body: responseBody, headers: res.headers }));
              }
            );
            req.on('error', reject);
            req.write(data);
            req.end();
          });
        };

        // =====================================================================
        // Test 1: Requete initiale — MISS a toutes les couches
        // =====================================================================
        console.log('--- Test 1: Requete initiale (cold start) ---');
        const originCountBefore = originRequestCount;
        const res1 = await browser.fetch('/');

        if (res1.status === 200 && res1.body.includes('Accueil')) {
          console.log(`  \u2705 Test 1a: Reponse 200 avec contenu correct`);
          passed++;
        } else {
          console.log(`  \u274C Test 1a: Reponse incorrecte (status: ${res1.status})`);
          failed++;
        }

        if (originRequestCount > originCountBefore) {
          console.log(`  \u2705 Test 1b: Requete arrivee a l'origine (#${originRequestCount})`);
          passed++;
        } else {
          console.log(`  \u274C Test 1b: Requete n'a pas atteint l'origine`);
          failed++;
        }

        // =====================================================================
        // Test 2: Requete repetee — HIT au cache navigateur
        // =====================================================================
        console.log('\n--- Test 2: Requete repetee (browser cache) ---');
        const originCountBefore2 = originRequestCount;
        const res2 = await browser.fetch('/');

        if (res2.source === 'browser-cache') {
          console.log(`  \u2705 Test 2: Servi depuis le cache navigateur`);
          passed++;
        } else {
          console.log(`  \u274C Test 2: Source = "${res2.source}" (attendu: browser-cache)`);
          failed++;
        }

        if (originRequestCount === originCountBefore2) {
          console.log(`  \u2705 Test 2b: Aucune requete a l'origine`);
          passed++;
        } else {
          console.log(`  \u274C Test 2b: Requete inattendue a l'origine`);
          failed++;
        }

        // =====================================================================
        // Test 3: Expiration navigateur, HIT CDN
        // =====================================================================
        console.log('\n--- Test 3: Expiration navigateur, HIT CDN ---');
        // Forcer l'expiration du cache navigateur
        if (browser.cache.has('/')) {
          const entry = browser.cache.get('/');
          entry.timestamp = Date.now() - 20000; // 20s = expire si max-age=10
        }
        const originCountBefore3 = originRequestCount;
        const res3 = await browser.fetch('/');

        if (res3.source === 'cdn-hit' || res3.headers['x-cdn-cache'] === 'HIT') {
          console.log(`  \u2705 Test 3: Servi depuis le cache CDN`);
          passed++;
        } else {
          console.log(`  \u274C Test 3: Source = "${res3.source}" (attendu: cdn-hit)`);
          failed++;
        }

        // =====================================================================
        // Test 4: Purge du CDN
        // =====================================================================
        console.log('\n--- Test 4: Purge du CDN ---');
        const purgeRes = await postRequest(CDN_PORT, '/purge?path=/', {});

        if (purgeRes.status === 200) {
          try {
            const json = JSON.parse(purgeRes.body);
            if (json.purged === true) {
              console.log(`  \u2705 Test 4a: Purge CDN reussie`);
              passed++;
            } else {
              console.log(`  \u274C Test 4a: Purge reponse inattendue: ${purgeRes.body}`);
              failed++;
            }
          } catch {
            console.log(`  \u274C Test 4a: Reponse non-JSON: ${purgeRes.body}`);
            failed++;
          }
        } else {
          console.log(`  \u274C Test 4a: Purge status ${purgeRes.status}`);
          failed++;
        }

        // Apres purge, forcer aussi l'expiration navigateur
        if (browser.cache.has('/')) {
          const entry = browser.cache.get('/');
          entry.timestamp = Date.now() - 20000;
        }
        const originCountBefore4 = originRequestCount;
        const res4 = await browser.fetch('/');

        if (originRequestCount > originCountBefore4) {
          console.log(`  \u2705 Test 4b: Apres purge, requete va a l'origine`);
          passed++;
        } else {
          console.log(`  \u274C Test 4b: Apres purge, requete n'a pas atteint l'origine`);
          failed++;
        }

        // =====================================================================
        // Test 5: Revalidation conditionnelle (304 Not Modified)
        // =====================================================================
        console.log('\n--- Test 5: Revalidation conditionnelle ---');
        // Forcer expiration navigateur mais garder l'ETag
        if (browser.cache.has('/')) {
          const entry = browser.cache.get('/');
          entry.timestamp = Date.now() - 20000;
        }
        // Forcer aussi expiration CDN
        if (cdnCache.has('/')) {
          const entry = cdnCache.get('/');
          entry.timestamp = Date.now() - 20000;
        }
        const res5 = await browser.fetch('/');

        if (res5.source === 'revalidated' || res5.status === 200) {
          console.log(`  \u2705 Test 5: Revalidation effectuee (source: ${res5.source})`);
          passed++;
        } else {
          console.log(`  \u274C Test 5: Revalidation echouee`);
          failed++;
        }

        // =====================================================================
        // Test 6: Changement de donnees a l'origine
        // =====================================================================
        console.log('\n--- Test 6: Changement de donnees ---');
        // Modifier les donnees
        database['/'].content = 'Contenu mis a jour !';
        database['/'].version = 2;
        pageLastModified['/'] = new Date();

        // Purger le CDN
        await postRequest(CDN_PORT, '/purge?path=/', {});
        // Forcer expiration navigateur
        if (browser.cache.has('/')) {
          const entry = browser.cache.get('/');
          entry.timestamp = Date.now() - 20000;
          entry.etag = null; // Forcer une requete complete
        }
        browser.cache.delete('/'); // Clear pour etre sur

        const res6 = await browser.fetch('/');
        if (res6.body.includes('mis a jour') || res6.body.includes('version') && res6.body.includes('2')) {
          console.log(`  \u2705 Test 6: Nouveau contenu servi apres mise a jour`);
          passed++;
        } else {
          console.log(`  \u274C Test 6: Ancien contenu servi`);
          failed++;
        }

        // =====================================================================
        // Test 7: Plusieurs pages independantes
        // =====================================================================
        console.log('\n--- Test 7: Pages multiples ---');
        browser.clear();
        // Purger tout le CDN
        await postRequest(CDN_PORT, '/purge?path=*', {});

        const pages = ['/', '/products', '/blog'];
        let allOk = true;
        for (const p of pages) {
          const r = await browser.fetch(p);
          if (r.status !== 200) {
            allOk = false;
            console.log(`  \u274C Page ${p}: status ${r.status}`);
          }
        }
        if (allOk) {
          console.log(`  \u2705 Test 7: Toutes les pages (${pages.join(', ')}) servies correctement`);
          passed++;
        } else {
          failed++;
        }

        // =====================================================================
        // Test 8: Resume — tableau recapitulatif
        // =====================================================================
        console.log('\n--- Resume de l\'architecture ---');
        console.log(`  Requetes totales a l'origine : ${originRequestCount}`);
        console.log(`  Entrees dans le cache CDN    : ${cdnCache.size}`);
        console.log(`  Entrees dans le cache browser : ${browser.cache.size}`);

        const browserStats = browser.getStats();
        for (const [path, stats] of Object.entries(browserStats)) {
          console.log(`    ${path}: age=${stats.age}, etag=${stats.etag}, fresh=${stats.fresh}`);
        }

        console.log(`\n  \u2705 Tests passes: ${passed}`);
        console.log(`  \u274C Tests echoues: ${failed}`);
        console.log(`\n  Resultats: ${passed}/${passed + failed} tests passes\n`);

        originServer.close();
        cdnServer.close();
        resolve();
      });
    });
  });
}

setTimeout(runTests, 0);
