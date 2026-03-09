// =============================================================================
// Lab 12 — Edge Middleware — SOLUTION
// =============================================================================
// Executer avec : npx tsx solution.ts
// =============================================================================

import type { IncomingMessage, ServerResponse, IncomingHttpHeaders } from 'node:http';
import http from 'node:http';
import crypto from 'node:crypto';

const ORIGIN_PORT = 3120;
const EDGE_PORT = 3121;

// =============================================================================
// PARTIE 1 — Serveur d'origine
// =============================================================================
// POURQUOI : Le serveur d'origine represente l'application "backend".
// En production, c'est votre serveur applicatif. Le middleware edge
// se place devant lui pour optimiser les performances.

const originServer = http.createServer((req: IncomingMessage, res: ServerResponse) => {
  const url = new URL(req.url, `http://localhost:${ORIGIN_PORT}`);
  console.log(`  [Origin] ${req.method} ${url.pathname}`);

  if (url.pathname === '/') {
    // POURQUOI : On inclut un timestamp pour prouver que la page est
    // dynamique et que le cache edge fonctionne (le timestamp reste
    // le meme tant que le cache est valide).
    const html = `<!DOCTYPE html>
<html>
<head><title>Edge Middleware Demo</title></head>
<body>
  <h1>Page d'accueil</h1>
  <p>Generee le: ${new Date().toISOString()}</p>
  <p>Request ID: ${crypto.randomUUID()}</p>
</body>
</html>`;
    // POURQUOI : max-age=5 signifie que le proxy edge peut garder
    // cette reponse en cache pendant 5 secondes.
    res.writeHead(200, {
      'Content-Type': 'text/html',
      'Cache-Control': 'public, max-age=5',
    });
    res.end(html);
    return;
  }

  if (url.pathname === '/api/data') {
    // POURQUOI : Une API JSON avec des donnees dynamiques.
    // Le requestId change a chaque requete, ce qui permet de
    // verifier si la reponse vient du cache ou de l'origine.
    const data = {
      timestamp: new Date().toISOString(),
      randomValue: Math.random(),
      requestId: crypto.randomUUID(),
    };
    res.writeHead(200, {
      'Content-Type': 'application/json',
      'Cache-Control': 'public, max-age=10',
    });
    res.end(JSON.stringify(data));
    return;
  }

  if (url.pathname === '/api/region') {
    // POURQUOI : Le header X-Region est ajoute par le middleware edge.
    // L'origine adapte son contenu en fonction de la region detectee.
    // C'est un pattern courant dans les CDN modernes.
    const region = req.headers['x-region'] || 'US';
    const regionData = {
      EU: { greeting: 'Bonjour', currency: 'EUR', region: 'EU' },
      US: { greeting: 'Hello', currency: 'USD', region: 'US' },
      JP: { greeting: 'Konnichiwa', currency: 'JPY', region: 'JP' },
    };
    const data = regionData[region] || regionData['US'];
    res.writeHead(200, {
      'Content-Type': 'application/json',
      'Cache-Control': 'public, max-age=60',
    });
    res.end(JSON.stringify(data));
    return;
  }

  res.writeHead(404, { 'Content-Type': 'text/plain' });
  res.end('404 Not Found');
});

// =============================================================================
// PARTIE 2 — Edge middleware (proxy)
// =============================================================================
// POURQUOI : Le proxy edge intercepte toutes les requetes avant qu'elles
// n'atteignent l'origine. Il peut cacher, transformer, et router.

function proxyToOrigin(clientReq, clientRes, extraHeaders = {}) {
  // POURQUOI : On reconstruit la requete vers l'origine en copiant
  // le method, le path, et les headers pertinents du client.
  const url = new URL(clientReq.url, `http://localhost:${EDGE_PORT}`);

  const options = {
    hostname: 'localhost',
    port: ORIGIN_PORT,
    path: url.pathname + url.search,
    method: clientReq.method,
    headers: {
      ...clientReq.headers,
      ...extraHeaders,
      host: `localhost:${ORIGIN_PORT}`,
    },
  };

  const proxyReq = http.request(options, (originRes) => {
    // POURQUOI : On collecte le body entier pour pouvoir le cacher.
    // En production avec des reponses tres larges, on utiliserait
    // du streaming, mais ici la simplicite prime.
    let body = '';
    originRes.on('data', (chunk) => (body += chunk));
    originRes.on('end', () => {
      // POURQUOI : On ajoute X-Proxied-By pour que le client sache
      // que la reponse est passee par le middleware edge.
      const headers = { ...originRes.headers, 'X-Proxied-By': 'edge-middleware' };
      clientRes.writeHead(originRes.statusCode, headers);
      clientRes.end(body);
    });
  });

  proxyReq.on('error', (err) => {
    console.error(`  [Edge] Erreur proxy: ${err.message}`);
    clientRes.writeHead(502, { 'Content-Type': 'text/plain' });
    clientRes.end('Bad Gateway');
  });

  // POURQUOI : Si la requete client a un body (POST, PUT), on le transmet.
  clientReq.pipe(proxyReq);
}

// =============================================================================
// PARTIE 3 — Cache au niveau edge
// =============================================================================
// POURQUOI : Le cache edge evite des allers-retours couteux vers l'origine.
// C'est exactement ce que font les CDN comme Cloudflare, Fastly, etc.

const edgeCache = new Map();

function getCacheKey(req) {
  // POURQUOI : La cle de cache combine le method et le pathname.
  // On exclut volontairement les query params pour simplifier.
  // En production, la cle inclurait aussi les Vary headers.
  return `${req.method}:${new URL(req.url, 'http://localhost').pathname}`;
}

function parseMaxAge(cacheControlHeader) {
  // POURQUOI : On parse le header Cache-Control pour extraire max-age.
  // Le format est "public, max-age=10, ..." donc on cherche le pattern.
  if (!cacheControlHeader) return 0;
  const match = cacheControlHeader.match(/max-age=(\d+)/);
  return match ? parseInt(match[1], 10) : 0;
}

function getFromEdgeCache(key) {
  // POURQUOI : On verifie si la reponse est en cache ET si elle n'est pas expiree.
  // Si le TTL est depasse, on considere que c'est un MISS.
  if (!edgeCache.has(key)) return { hit: false };

  const entry = edgeCache.get(key);
  const ageMs = Date.now() - entry.timestamp;
  const maxAgeMs = entry.maxAge * 1000;

  if (ageMs > maxAgeMs) {
    // POURQUOI : Entry expiree, on la supprime du cache.
    edgeCache.delete(key);
    return { hit: false };
  }

  return { hit: true, data: entry };
}

function storeInEdgeCache(key, status, headers, body) {
  // POURQUOI : On ne cache que les reponses qui ont un max-age > 0.
  // Les reponses avec no-cache ou no-store ne devraient pas etre cachees.
  const cacheControl = headers['cache-control'] || '';
  if (cacheControl.includes('no-store') || cacheControl.includes('no-cache')) return;

  const maxAge = parseMaxAge(cacheControl);
  if (maxAge <= 0) return;

  edgeCache.set(key, {
    status,
    headers: { ...headers },
    body,
    timestamp: Date.now(),
    maxAge,
  });
}

// =============================================================================
// PARTIE 4 — Transformation de requetes (geo-routing, A/B testing)
// =============================================================================
// POURQUOI : Les middlewares edge modernes (Cloudflare Workers, Vercel Edge
// Middleware) permettent de transformer les requetes AVANT qu'elles n'atteignent
// l'origine. Cela permet du geo-routing, A/B testing, authentication, etc.

function detectRegion(req) {
  // POURQUOI : En production, le CDN ajoute automatiquement un header
  // de geolocalisation base sur l'IP. Ici on simule avec X-Geo-Region.
  return req.headers['x-geo-region'] || 'US';
}

function parseCookies(cookieHeader) {
  // POURQUOI : Les cookies HTTP sont envoyes dans un seul header
  // au format "name1=value1; name2=value2". On doit les parser.
  if (!cookieHeader) return {};
  return Object.fromEntries(
    cookieHeader.split(';').map((c) => {
      const [key, ...rest] = c.trim().split('=');
      return [key, rest.join('=')];
    })
  );
}

function assignABGroup(req) {
  // POURQUOI : L'A/B testing assigne un groupe persistant via cookie.
  // Si le cookie existe deja, on respecte le groupe. Sinon, on en assigne un.
  const cookies = parseCookies(req.headers['cookie']);
  if (cookies['ab-group'] && (cookies['ab-group'] === 'A' || cookies['ab-group'] === 'B')) {
    return { group: cookies['ab-group'], isNew: false };
  }
  // POURQUOI : Attribution aleatoire 50/50 pour les nouveaux visiteurs.
  const group = Math.random() < 0.5 ? 'A' : 'B';
  return { group, isNew: true };
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

  // POURQUOI : Le cookie A/B est gere directement dans les headers de writeHead
  // (voir les chemins HIT et MISS ci-dessous) pour eviter que writeHead(status, headers)
  // n'ecrase le setHeader dans certaines versions de Node.js.
  const abCookie = abResult.isNew ? `ab-group=${abResult.group}; Path=/; Max-Age=86400` : null;

  // --- Verifier le cache edge ---
  const cacheKey = getCacheKey(req);
  const cached = getFromEdgeCache(cacheKey);

  if (cached.hit) {
    console.log(`  [Edge] Cache HIT pour ${cacheKey}`);
    // POURQUOI : On sert directement depuis le cache edge sans
    // contacter l'origine. C'est la principale optimisation.
    const headers = { ...cached.data.headers, 'X-Edge-Cache': 'HIT', 'X-AB-Group': abResult.group };
    if (abCookie) headers['Set-Cookie'] = abCookie;
    res.writeHead(cached.data.status, headers);
    res.end(cached.data.body);
    return;
  }

  console.log(`  [Edge] Cache MISS pour ${cacheKey}`);

  // --- Proxy vers l'origine avec headers supplementaires ---
  // POURQUOI : On ajoute les headers de transformation (region, A/B group)
  // pour que l'origine puisse adapter son contenu.
  const extraHeaders = {
    'X-Region': region,
    'X-AB-Group': abResult.group,
  };

  // POURQUOI : On intercepte writeHead et end pour pouvoir cacher la reponse.
  // C'est un pattern "middleware" classique en Node.js.
  const originalWriteHead = res.writeHead.bind(res);
  const originalEnd = res.end.bind(res);
  let responseStatus = 200;
  let responseHeaders = {};

  res.writeHead = (status, headers) => {
    responseStatus = status;
    responseHeaders = { ...headers };
    const mergedHeaders = { ...headers, 'X-Edge-Cache': 'MISS', 'X-AB-Group': abResult.group };
    if (abCookie) mergedHeaders['Set-Cookie'] = abCookie;
    return originalWriteHead(status, mergedHeaders);
  };

  res.end = (body) => {
    // POURQUOI : On stocke dans le cache APRES avoir envoye au client.
    storeInEdgeCache(cacheKey, responseStatus, responseHeaders, body);
    return originalEnd(body);
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
        // POURQUOI : En Node.js, set-cookie est TOUJOURS retourne comme un Array.
        // On doit donc verifier avec .some() au lieu de .includes() sur le string.
        const cookies = res1.headers['set-cookie'];
        const hasAbCookie = Array.isArray(cookies)
          ? cookies.some((c) => c.includes('ab-group='))
          : typeof cookies === 'string' && cookies.includes('ab-group=');
        if (hasAbCookie) {
          console.log('  \u2705 Test 6: Cookie A/B testing assigne');
          passed++;
        } else {
          console.log(`  \u274C Test 6: Cookie ab-group non assigne (set-cookie: ${JSON.stringify(cookies)})`);
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
