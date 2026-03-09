// =============================================================================
// Lab 12 — Edge Middleware
// =============================================================================
// Executer avec : npx tsx exercise.ts
// =============================================================================

import type { IncomingMessage, ServerResponse, IncomingHttpHeaders } from 'node:http';
import http from 'node:http';
import crypto from 'node:crypto';

const ORIGIN_PORT = 3120;
const EDGE_PORT = 3121;

// =============================================================================
// PARTIE 1 — Serveur d'origine
// =============================================================================
// Objectif : Creer un serveur d'origine qui retourne du contenu dynamique.
//            Ce serveur sera contacte par le proxy edge.
//
// TODO: Implementez le serveur d'origine avec les routes suivantes :
//   GET /            -> HTML de la page d'accueil avec timestamp
//   GET /api/data    -> JSON avec des donnees dynamiques
//   GET /api/region  -> JSON avec du contenu adapte a la region (header X-Region)
//
// 💡 Indice : Chaque reponse doit inclure un header Cache-Control
//             pour que le proxy puisse savoir combien de temps cacher.

const originServer = http.createServer((req: IncomingMessage, res: ServerResponse) => {
  const url = new URL(req.url, `http://localhost:${ORIGIN_PORT}`);
  console.log(`  [Origin] ${req.method} ${url.pathname}`);

  if (url.pathname === '/') {
    // TODO: Retourner une page HTML avec :
    //   - Un timestamp de generation
    //   - Cache-Control: public, max-age=5
    //
    // 💡 Indice : Incluez new Date().toISOString() dans le HTML
    console.log('  TODO: Implementer route /');
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end('<html><body><h1>TODO: Origin server</h1></body></html>');
    return;
  }

  if (url.pathname === '/api/data') {
    // TODO: Retourner du JSON avec :
    //   - timestamp, random number, requestId
    //   - Cache-Control: public, max-age=10
    //
    // 💡 Indice : Utilisez crypto.randomUUID() pour le requestId
    console.log('  TODO: Implementer route /api/data');
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ todo: true }));
    return;
  }

  if (url.pathname === '/api/region') {
    // TODO: Lire le header X-Region et retourner du contenu adapte
    //   - "EU" -> { greeting: "Bonjour", currency: "EUR" }
    //   - "US" -> { greeting: "Hello", currency: "USD" }
    //   - default -> { greeting: "Hi", currency: "USD" }
    //   - Cache-Control: public, max-age=60
    //
    // 💡 Indice : req.headers['x-region']
    console.log('  TODO: Implementer route /api/region');
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ todo: true }));
    return;
  }

  res.writeHead(404, { 'Content-Type': 'text/plain' });
  res.end('404 Not Found');
});

// =============================================================================
// PARTIE 2 — Edge middleware (proxy)
// =============================================================================
// Objectif : Construire un proxy qui intercepte les requetes,
//            les transmet a l'origine, et retourne la reponse.
//
// TODO: Implementez la fonction proxyToOrigin(req, res)
//       qui fait une requete HTTP au serveur d'origine.
//
// 💡 Indice : Utilisez http.request() pour contacter l'origine.
//             N'oubliez pas de transmettre les headers pertinents.

function proxyToOrigin(clientReq, clientRes, extraHeaders = {}) {
  // TODO: Creer une requete vers le serveur d'origine
  //   1. Construire les options (hostname, port, path, method, headers)
  //   2. Transmettre les headers du client + extraHeaders
  //   3. Quand la reponse arrive, la renvoyer au client
  //   4. Ajouter un header X-Proxied-By: edge-middleware
  //
  // 💡 Indice : Copiez les headers de la reponse origin vers la reponse client
  // 💡 Indice : Utilisez originRes.pipe(clientRes) pour streamer la reponse
  console.log('  TODO: Implementer proxyToOrigin()');
  clientRes.writeHead(502, { 'Content-Type': 'text/plain' });
  clientRes.end('TODO: Proxy not implemented');
}

// =============================================================================
// PARTIE 3 — Cache au niveau edge
// =============================================================================
// Objectif : Ajouter un cache en memoire au proxy.
//            Respecter les directives Cache-Control de l'origine.
//
// TODO: Implementez le cache edge avec :
//   - Un Map() pour stocker les reponses
//   - La logique pour verifier si une reponse est en cache et valide
//   - La logique pour stocker les nouvelles reponses
//
// 💡 Indice : Parsez le header Cache-Control pour extraire max-age.

const edgeCache = new Map();

function getCacheKey(req) {
  // TODO: Generer une cle de cache unique pour la requete
  // 💡 Indice : Combinez method + pathname. Pour l'A/B testing,
  //             incluez aussi le cookie de groupe.
  return `${req.method}:${new URL(req.url, 'http://localhost').pathname}`;
}

function parseMaxAge(cacheControlHeader) {
  // TODO: Extraire la valeur max-age du header Cache-Control
  // 💡 Indice : Utilisez une regex ou split pour trouver "max-age=XX"
  console.log('  TODO: Implementer parseMaxAge()');
  return 0;
}

function getFromEdgeCache(key) {
  // TODO: Verifier si la cle est dans le cache ET si elle n'est pas expiree
  // Retourner { hit: true, data: ... } ou { hit: false }
  //
  // 💡 Indice : Stockez { body, headers, status, timestamp, maxAge }
  //             et comparez Date.now() avec timestamp + maxAge*1000
  console.log('  TODO: Implementer getFromEdgeCache()');
  return { hit: false };
}

function storeInEdgeCache(key, status, headers, body) {
  // TODO: Stocker la reponse dans le cache avec son timestamp
  // TODO: Ne cacher que si Cache-Control contient un max-age > 0
  //
  // 💡 Indice : Parsez le max-age du header Cache-Control
  console.log('  TODO: Implementer storeInEdgeCache()');
}

// =============================================================================
// PARTIE 4 — Transformation de requetes (geo-routing, A/B testing)
// =============================================================================
// Objectif : Ajouter des fonctionnalites "edge" au middleware.
//
// TODO: Implementez les fonctions de transformation :
//   - detectRegion(req) : simule la detection de region
//   - assignABGroup(req, res) : assigne un groupe A/B via cookie
//
// 💡 Indice : Le geo-routing ajoute un header X-Region a la requete upstream.
//             L'A/B testing lit/ecrit un cookie "ab-group".

function detectRegion(req) {
  // TODO: Lire le header X-Geo-Region du client
  // Retourner la region ou "US" par defaut
  //
  // 💡 Indice : Les CDN reels ajoutent ce header automatiquement
  //             en fonction de l'IP du client.
  console.log('  TODO: Implementer detectRegion()');
  return 'US';
}

function parseCookies(cookieHeader) {
  // TODO: Parser le header Cookie en un objet { name: value }
  // 💡 Indice : Le format est "name1=value1; name2=value2"
  console.log('  TODO: Implementer parseCookies()');
  return {};
}

function assignABGroup(req) {
  // TODO: Lire le cookie "ab-group" s'il existe
  // Si absent, assigner aleatoirement "A" ou "B"
  // Retourner { group, isNew } ou isNew indique si le cookie vient d'etre cree
  //
  // 💡 Indice : Math.random() < 0.5 ? 'A' : 'B'
  console.log('  TODO: Implementer assignABGroup()');
  return { group: 'A', isNew: true };
}

// =============================================================================
// Serveur Edge (proxy)
// =============================================================================

const edgeServer = http.createServer((req: IncomingMessage, res: ServerResponse) => {
  const url = new URL(req.url, `http://localhost:${EDGE_PORT}`);
  console.log(`  [Edge] ${req.method} ${url.pathname}`);

  // --- Edge transformations ---
  const region = detectRegion(req);
  const abResult = assignABGroup(req);

  // Set A/B cookie si nouveau
  if (abResult.isNew) {
    res.setHeader('Set-Cookie', `ab-group=${abResult.group}; Path=/; Max-Age=86400`);
  }

  // --- Verifier le cache edge ---
  const cacheKey = getCacheKey(req);
  const cached = getFromEdgeCache(cacheKey);

  if (cached.hit) {
    console.log(`  [Edge] Cache HIT pour ${cacheKey}`);
    const headers = { ...cached.data.headers, 'X-Edge-Cache': 'HIT', 'X-AB-Group': abResult.group };
    res.writeHead(cached.data.status, headers);
    res.end(cached.data.body);
    return;
  }

  console.log(`  [Edge] Cache MISS pour ${cacheKey}`);

  // --- Proxy vers l'origine avec headers supplementaires ---
  const extraHeaders = {
    'X-Region': region,
    'X-AB-Group': abResult.group,
  };

  // Collecter la reponse pour la cacher
  const originalEnd = res.end.bind(res);
  const originalWriteHead = res.writeHead.bind(res);
  let responseStatus = 200;
  let responseHeaders = {};
  let responseBody = '';

  res.writeHead = (status, headers) => {
    responseStatus = status;
    responseHeaders = { ...headers };
    return originalWriteHead(status, { ...headers, 'X-Edge-Cache': 'MISS', 'X-AB-Group': abResult.group });
  };

  const origResEnd = res.end.bind(res);
  res.end = (body) => {
    responseBody = body;
    storeInEdgeCache(cacheKey, responseStatus, responseHeaders, body);
    return origResEnd(body);
  };

  proxyToOrigin(req, res, extraHeaders);
});

// =============================================================================
// Tests automatises
// =============================================================================

async function runTests() {
  console.log('\n=== Lab 12 — Edge Middleware ===\n');

  return new Promise((resolve) => {
    originServer.listen(ORIGIN_PORT, () => {
      console.log(`[Origin] Serveur d'origine sur http://localhost:${ORIGIN_PORT}`);

      edgeServer.listen(EDGE_PORT, async () => {
        console.log(`[Edge] Middleware edge sur http://localhost:${EDGE_PORT}\n`);

        const makeRequest = (path, headers = {}) => {
          return new Promise((resolve, reject) => {
            const req = http.request(
              { hostname: 'localhost', port: EDGE_PORT, path, method: 'GET', headers },
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

        // Test 1: Proxy fonctionne
        const res1 = await makeRequest('/');
        if (res1.status === 200 && res1.body.includes('<')) {
          console.log('  \u2705 Test 1: Proxy transmet la requete a l\'origine');
          passed++;
        } else {
          console.log(`  \u274C Test 1: Proxy ne fonctionne pas (status: ${res1.status})`);
          failed++;
        }

        // Test 2: Header X-Edge-Cache MISS
        if (res1.headers['x-edge-cache'] === 'MISS') {
          console.log('  \u2705 Test 2: Premier acces = cache MISS');
          passed++;
        } else {
          console.log(`  \u274C Test 2: X-Edge-Cache devrait etre MISS (${res1.headers['x-edge-cache'] || 'absent'})`);
          failed++;
        }

        // Test 3: Deuxieme requete = cache HIT
        const res2 = await makeRequest('/');
        if (res2.headers['x-edge-cache'] === 'HIT') {
          console.log('  \u2705 Test 3: Deuxieme acces = cache HIT');
          passed++;
        } else {
          console.log(`  \u274C Test 3: X-Edge-Cache devrait etre HIT (${res2.headers['x-edge-cache'] || 'absent'})`);
          failed++;
        }

        // Test 4: API /api/data retourne du JSON
        const res3 = await makeRequest('/api/data');
        try {
          const data = JSON.parse(res3.body);
          if (data.timestamp || data.requestId) {
            console.log('  \u2705 Test 4: /api/data retourne du JSON valide');
            passed++;
          } else {
            console.log('  \u274C Test 4: /api/data JSON incomplet');
            failed++;
          }
        } catch {
          console.log(`  \u274C Test 4: /api/data ne retourne pas du JSON (${res3.body.substring(0, 50)})`);
          failed++;
        }

        // Test 5: Geo-routing avec X-Geo-Region
        const res4 = await makeRequest('/api/region', { 'X-Geo-Region': 'EU' });
        try {
          const data = JSON.parse(res4.body);
          if (data.greeting === 'Bonjour' || data.currency === 'EUR') {
            console.log('  \u2705 Test 5: Geo-routing fonctionne (EU -> Bonjour/EUR)');
            passed++;
          } else {
            console.log(`  \u274C Test 5: Geo-routing incorrect (${JSON.stringify(data)})`);
            failed++;
          }
        } catch {
          console.log(`  \u274C Test 5: Reponse geo-routing invalide`);
          failed++;
        }

        // Test 6: A/B testing - cookie assigne
        if (res1.headers['set-cookie'] && res1.headers['set-cookie'].includes('ab-group=')) {
          console.log('  \u2705 Test 6: Cookie A/B testing assigne');
          passed++;
        } else {
          console.log(`  \u274C Test 6: Cookie ab-group non assigne`);
          failed++;
        }

        // Test 7: A/B testing - cookie respecte
        const res5 = await makeRequest('/', { Cookie: 'ab-group=B' });
        if (res5.headers['x-ab-group'] === 'B') {
          console.log('  \u2705 Test 7: Cookie A/B testing respecte (groupe B)');
          passed++;
        } else {
          console.log(`  \u274C Test 7: Groupe A/B non respecte (${res5.headers['x-ab-group'] || 'absent'})`);
          failed++;
        }

        // Test 8: 404 pour route inconnue
        const res6 = await makeRequest('/nonexistent');
        if (res6.status === 404) {
          console.log('  \u2705 Test 8: 404 pour route inconnue');
          passed++;
        } else {
          console.log(`  \u274C Test 8: Status ${res6.status} au lieu de 404`);
          failed++;
        }

        console.log(`\n  Resultats: ${passed}/${passed + failed} tests passes\n`);

        edgeServer.close();
        originServer.close();
        resolve();
      });
    });
  });
}

setTimeout(runTests, 0);
