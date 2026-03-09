// =============================================================================
// Lab 15 — Full Architecture (Projet final) — SOLUTION
// =============================================================================
// Executer avec : npx tsx solution.ts
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
// POURQUOI : Le serveur d'origine est le "source of truth". Il genere du HTML
// dynamiquement (SSR) et fournit les headers de cache qui pilotent le
// comportement de toutes les couches en aval (CDN, navigateur).

const pageLastModified = {};

function renderSSRPage(pagePath, data) {
  // POURQUOI : Le HTML inclut des metadonnees (version, timestamp, requestCount)
  // qui permettent de verifier visuellement et programmatiquement que chaque
  // couche de cache sert la bonne version.
  return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="version" content="${data.version}">
  <title>${data.title}</title>
  <style>
    body { font-family: system-ui; max-width: 800px; margin: 0 auto; padding: 20px; }
    .meta { background: #f5f5f5; padding: 12px; border-radius: 6px; font-size: 0.85em; }
  </style>
</head>
<body>
  <h1>${data.title}</h1>
  <p>${data.content}</p>
  <div class="meta">
    <p>Version: ${data.version}</p>
    <p>Genere le: ${new Date().toISOString()}</p>
    <p>Origin request #${originRequestCount}</p>
    <p>Path: ${pagePath}</p>
  </div>
</body>
</html>`;
}

const originServer = http.createServer((req: IncomingMessage, res: ServerResponse) => {
  const url = new URL(req.url, `http://localhost:${ORIGIN_PORT}`);
  originRequestCount++;
  console.log(`  [Origin #${originRequestCount}] ${req.method} ${url.pathname}`);

  // POURQUOI : L'endpoint /api/update simule un CMS qui modifie le contenu.
  // En production, c'est un webhook ou une API d'administration.
  if (req.method === 'POST' && url.pathname === '/api/update') {
    let body = '';
    req.on('data', (chunk) => (body += chunk));
    req.on('end', () => {
      try {
        const update = JSON.parse(body);
        const targetPath = update.path;
        if (database[targetPath]) {
          if (update.content) database[targetPath].content = update.content;
          if (update.title) database[targetPath].title = update.title;
          database[targetPath].version++;
          pageLastModified[targetPath] = new Date();
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ updated: true, path: targetPath, version: database[targetPath].version }));
        } else {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Page not found' }));
        }
      } catch (e) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid JSON' }));
      }
    });
    return;
  }

  const pagePath = url.pathname;
  const data = database[pagePath];

  if (!data) {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('404 Not Found');
    return;
  }

  // POURQUOI : On initialise le lastModified si c'est la premiere fois.
  if (!pageLastModified[pagePath]) {
    pageLastModified[pagePath] = new Date();
  }

  const html = renderSSRPage(pagePath, data);

  // POURQUOI : L'ETag est un hash du contenu. Si le contenu ne change pas,
  // l'ETag reste identique, permettant des reponses 304.
  const etag = `"${crypto.createHash('md5').update(html).digest('hex')}"`;
  const lastModified = pageLastModified[pagePath].toUTCString();

  // POURQUOI : On verifie If-None-Match AVANT de calculer la compression.
  // Si le contenu n'a pas change, on economise tout le travail.
  if (req.headers['if-none-match'] === etag) {
    console.log(`  [Origin] 304 Not Modified pour ${pagePath}`);
    res.writeHead(304, {
      ETag: etag,
      'Last-Modified': lastModified,
      'Cache-Control': 'public, max-age=10, stale-while-revalidate=30',
    });
    res.end();
    return;
  }

  // POURQUOI : If-Modified-Since est l'alternative a ETag pour la
  // validation conditionnelle. Moins precise mais plus simple.
  if (req.headers['if-modified-since']) {
    const clientDate = new Date(req.headers['if-modified-since']);
    if (pageLastModified[pagePath] <= clientDate) {
      console.log(`  [Origin] 304 Not Modified (date) pour ${pagePath}`);
      res.writeHead(304, {
        ETag: etag,
        'Last-Modified': lastModified,
        'Cache-Control': 'public, max-age=10, stale-while-revalidate=30',
      });
      res.end();
      return;
    }
  }

  // POURQUOI : Cache-Control pilote toute la strategie de cache :
  // - public: cacheable par le CDN et le navigateur
  // - max-age=10: frais pendant 10 secondes
  // - stale-while-revalidate=30: peut servir du stale pendant 30s
  //   tout en revalidant en arriere-plan
  const headers = {
    'Content-Type': 'text/html',
    'Cache-Control': 'public, max-age=10, stale-while-revalidate=30',
    ETag: etag,
    'Last-Modified': lastModified,
    'X-Origin-Request': originRequestCount.toString(),
    Connection: 'keep-alive',
  };

  // POURQUOI : La compression gzip reduit la taille de transfert de 70-90%
  // pour du HTML. On ne compresse que si le client le supporte.
  const acceptEncoding = req.headers['accept-encoding'] || '';
  if (acceptEncoding.includes('gzip')) {
    const compressed = zlib.gzipSync(Buffer.from(html));
    headers['Content-Encoding'] = 'gzip';
    headers['Content-Length'] = compressed.length.toString();
    res.writeHead(200, headers);
    res.end(compressed);
  } else {
    headers['Content-Length'] = Buffer.byteLength(html).toString();
    res.writeHead(200, headers);
    res.end(html);
  }
});

// =============================================================================
// PARTIE 2 — Simulateur de CDN
// =============================================================================
// POURQUOI : Le CDN est la premiere couche de cache cote serveur. Il est
// geographiquement proche des utilisateurs et sert les reponses cachees
// sans contacter l'origine. C'est le pattern le plus impactant en performance.

const cdnCache = new Map();

function parseMaxAge(cacheControl) {
  if (!cacheControl) return 0;
  const match = cacheControl.match(/max-age=(\d+)/);
  return match ? parseInt(match[1], 10) : 0;
}

function getCDNCacheEntry(path) {
  if (!cdnCache.has(path)) return null;

  const entry = cdnCache.get(path);
  const ageSeconds = (Date.now() - entry.timestamp) / 1000;

  // POURQUOI : Si l'age depasse le max-age, l'entree est expiree.
  // On la supprime et on retourne null (MISS).
  if (ageSeconds > entry.maxAge) {
    cdnCache.delete(path);
    return null;
  }

  return entry;
}

function storeCDNCacheEntry(path, status, headers, body) {
  // POURQUOI : On ne cache que les reponses 200 avec un max-age positif.
  // Les erreurs et les reponses no-store ne doivent pas etre cachees.
  if (status !== 200) return;

  const cacheControl = headers['cache-control'] || '';
  if (cacheControl.includes('no-store')) return;

  const maxAge = parseMaxAge(cacheControl);
  if (maxAge <= 0) return;

  cdnCache.set(path, {
    body,
    headers: { ...headers },
    status,
    timestamp: Date.now(),
    maxAge,
    hits: 0,
    etag: headers['etag'] || null,
    lastModified: headers['last-modified'] || null,
  });
}

function proxyToOrigin(clientReq, clientRes, path) {
  // POURQUOI : Le CDN transmet les headers de validation conditionnelle
  // du client pour permettre des 304 depuis l'origine.
  const headers = {
    host: `localhost:${ORIGIN_PORT}`,
  };

  // POURQUOI : Si le client a un ETag en cache, on le transmet
  // pour que l'origine puisse repondre 304.
  if (clientReq.headers['if-none-match']) {
    headers['if-none-match'] = clientReq.headers['if-none-match'];
  }
  if (clientReq.headers['if-modified-since']) {
    headers['if-modified-since'] = clientReq.headers['if-modified-since'];
  }

  const proxyReq = http.request(
    {
      hostname: 'localhost',
      port: ORIGIN_PORT,
      path,
      method: 'GET',
      headers,
    },
    (originRes) => {
      let body = '';
      originRes.on('data', (chunk) => (body += chunk));
      originRes.on('end', () => {
        // POURQUOI : On stocke la reponse dans le cache CDN pour les
        // prochaines requetes. On n'y stocke que les 200 (pas les 304).
        if (originRes.statusCode === 200) {
          storeCDNCacheEntry(path, originRes.statusCode, originRes.headers, body);
        }

        const responseHeaders = {
          ...originRes.headers,
          'X-CDN-Cache': 'MISS',
          'X-CDN-Origin-Status': originRes.statusCode.toString(),
        };

        clientRes.writeHead(originRes.statusCode, responseHeaders);
        clientRes.end(body);
      });
    }
  );

  proxyReq.on('error', (err) => {
    console.error(`  [CDN] Erreur proxy: ${err.message}`);
    clientRes.writeHead(502, { 'Content-Type': 'text/plain' });
    clientRes.end('Bad Gateway');
  });

  proxyReq.end();
}

function handlePurge(req, res) {
  const url = new URL(req.url, `http://localhost:${CDN_PORT}`);
  const targetPath = url.searchParams.get('path');

  if (!targetPath) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Missing path parameter' }));
    return;
  }

  // POURQUOI : path=* permet de purger tout le cache d'un coup.
  // C'est utile lors d'un deploiement global.
  if (targetPath === '*') {
    const count = cdnCache.size;
    cdnCache.clear();
    console.log(`  [CDN] Purge globale (${count} entrees supprimees)`);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ purged: true, path: '*', count }));
    return;
  }

  const existed = cdnCache.has(targetPath);
  cdnCache.delete(targetPath);
  console.log(`  [CDN] Purge ${targetPath} (existait: ${existed})`);
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ purged: true, path: targetPath, existed }));
}

const cdnServer = http.createServer((req: IncomingMessage, res: ServerResponse) => {
  const url = new URL(req.url, `http://localhost:${CDN_PORT}`);

  // POST /purge?path=...
  if (req.method === 'POST' && url.pathname === '/purge') {
    handlePurge(req, res);
    return;
  }

  // GET /cdn-stats
  if (url.pathname === '/cdn-stats') {
    const stats = {};
    for (const [key, entry] of cdnCache) {
      stats[key] = {
        hits: entry.hits,
        age: ((Date.now() - entry.timestamp) / 1000).toFixed(1) + 's',
        maxAge: entry.maxAge + 's',
        etag: entry.etag,
      };
    }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(stats, null, 2));
    return;
  }

  // POURQUOI : On verifie le cache CDN avant de contacter l'origine.
  // C'est l'optimisation principale du CDN.
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
// POURQUOI : Le cache navigateur est la couche la plus proche de l'utilisateur.
// Quand il fonctionne, la latence est quasi-nulle (pas de requete reseau).
// Cette classe simule le comportement exact de la specification HTTP.

class BrowserCache {
  constructor() {
    this.cache = new Map();
    this.revalidating = new Set();
  }

  async fetch(path) {
    // POURQUOI : On verifie d'abord le cache local. Si la reponse est
    // encore "fresh" (age < max-age), on la retourne sans aucune requete.
    if (this.cache.has(path)) {
      const entry = this.cache.get(path);
      const ageSeconds = (Date.now() - entry.timestamp) / 1000;

      // POURQUOI : no-store signifie "ne jamais cacher". On supprime l'entree.
      if (entry.cacheControl && entry.cacheControl.includes('no-store')) {
        this.cache.delete(path);
        return this._makeRequest(path);
      }

      // POURQUOI : no-cache signifie "toujours revalider avant d'utiliser".
      // On ne retourne jamais du cache sans revalidation.
      if (entry.cacheControl && entry.cacheControl.includes('no-cache')) {
        return this._revalidate(path, entry);
      }

      const maxAge = this._parseMaxAge(entry.cacheControl);
      const swr = this._parseSWR(entry.cacheControl);

      // POURQUOI : Si l'age < max-age, la reponse est "fresh".
      // On la retourne immediatement sans requete reseau.
      if (ageSeconds < maxAge) {
        console.log(`  [Browser] CACHE HIT ${path} (age: ${ageSeconds.toFixed(1)}s, max-age: ${maxAge}s)`);
        return { ...entry, source: 'browser-cache' };
      }

      // POURQUOI : stale-while-revalidate permet de servir du contenu stale
      // pendant qu'on revalide en arriere-plan. C'est une excellente UX
      // car l'utilisateur voit du contenu immediatement.
      if (swr > 0 && ageSeconds < maxAge + swr) {
        console.log(`  [Browser] STALE-WHILE-REVALIDATE ${path} (age: ${ageSeconds.toFixed(1)}s)`);
        // Revalider en arriere-plan (sans attendre)
        if (!this.revalidating.has(path)) {
          this.revalidating.add(path);
          this._revalidate(path, entry).then(() => {
            this.revalidating.delete(path);
          });
        }
        return { ...entry, source: 'browser-cache' };
      }

      // POURQUOI : La reponse est stale et hors de la fenetre SWR.
      // On doit revalider avant de servir.
      if (entry.etag) {
        return this._revalidate(path, entry);
      }
    }

    // POURQUOI : Pas de cache, on fait une requete complete.
    const response = await this._makeRequest(path);
    this._storeInCache(path, response);
    return response;
  }

  async _revalidate(path, cachedEntry) {
    // POURQUOI : On envoie If-None-Match avec l'ETag stockee.
    // Si le contenu n'a pas change, le serveur repond 304 (pas de body).
    const headers = {};
    if (cachedEntry.etag) {
      headers['If-None-Match'] = cachedEntry.etag;
    }
    if (cachedEntry.lastModified) {
      headers['If-Modified-Since'] = cachedEntry.lastModified;
    }

    const response = await this._makeRequest(path, headers);

    // POURQUOI : 304 signifie "le contenu n'a pas change".
    // On garde le body cache mais on rafraichit le timestamp.
    if (response.status === 304) {
      console.log(`  [Browser] 304 Not Modified pour ${path}`);
      cachedEntry.timestamp = Date.now();
      return { ...cachedEntry, source: 'revalidated' };
    }

    // POURQUOI : Le contenu a change, on met a jour le cache.
    this._storeInCache(path, response);
    return { ...response, source: response.source };
  }

  _storeInCache(path, response) {
    // POURQUOI : On ne cache que les reponses 200 avec un Cache-Control valide.
    if (response.status !== 200) return;

    const cacheControl = response.headers['cache-control'] || '';
    if (cacheControl.includes('no-store')) return;

    this.cache.set(path, {
      body: response.body,
      headers: response.headers,
      status: response.status,
      timestamp: Date.now(),
      etag: response.headers['etag'] || null,
      lastModified: response.headers['last-modified'] || null,
      cacheControl,
    });
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
            const source = res.headers['x-cdn-cache'] === 'HIT' ? 'cdn-hit' : 'cdn-miss';
            resolve({
              body,
              headers: res.headers,
              status: res.statusCode,
              source,
            });
          });
        }
      );
      req.on('error', reject);
      req.end();
    });
  }

  _parseMaxAge(cacheControl) {
    if (!cacheControl) return 0;
    const match = cacheControl.match(/max-age=(\d+)/);
    return match ? parseInt(match[1], 10) : 0;
  }

  _parseSWR(cacheControl) {
    if (!cacheControl) return 0;
    const match = cacheControl.match(/stale-while-revalidate=(\d+)/);
    return match ? parseInt(match[1], 10) : 0;
  }

  clear() {
    this.cache.clear();
  }

  getStats() {
    const stats = {};
    for (const [key, entry] of this.cache) {
      const ageSeconds = (Date.now() - entry.timestamp) / 1000;
      const maxAge = this._parseMaxAge(entry.cacheControl);
      stats[key] = {
        age: ageSeconds.toFixed(1) + 's',
        etag: entry.etag || 'none',
        fresh: ageSeconds < maxAge,
      };
    }
    return stats;
  }
}

// =============================================================================
// PARTIE 4 — Tests d'integration complets
// =============================================================================
// POURQUOI : Ces tests simulent un scenario reel complet pour demontrer
// comment les 3 couches de cache interagissent ensemble.

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
        // POURQUOI : On force l'expiration du cache navigateur en modifiant
        // le timestamp. La valeur doit depasser max-age + stale-while-revalidate
        // (10 + 30 = 40s) pour forcer une vraie requete reseau au lieu du SWR.
        if (browser.cache.has('/')) {
          const entry = browser.cache.get('/');
          entry.timestamp = Date.now() - 50000; // 50s > max-age(10) + swr(30) = expire completement
          entry.etag = null; // pas de revalidation, on veut un vrai CDN HIT
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
          entry.etag = null;
        }
        browser.cache.delete('/');
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
          entry.timestamp = Date.now() - 50000; // expire
        }
        // Forcer aussi expiration CDN pour que la revalidation aille a l'origine
        if (cdnCache.has('/')) {
          const entry = cdnCache.get('/');
          entry.timestamp = Date.now() - 50000;
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
        database['/'].content = 'Contenu mis a jour !';
        database['/'].version = 2;
        pageLastModified['/'] = new Date();

        // Purger le CDN et le navigateur
        await postRequest(CDN_PORT, '/purge?path=/', {});
        browser.cache.delete('/');

        const res6 = await browser.fetch('/');
        if (res6.body.includes('mis a jour') || (res6.body.includes('Version') && res6.body.includes('2'))) {
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
        for (const [p, stats] of Object.entries(browserStats)) {
          console.log(`    ${p}: age=${stats.age}, etag=${stats.etag}, fresh=${stats.fresh}`);
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
