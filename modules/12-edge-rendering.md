# Module 12 — Edge Rendering : le calcul au plus près de l'utilisateur

> **Objectif** : Comprendre ce qu'est le "edge", comment y exécuter du code, et maîtriser les patterns de rendu et de cache au edge pour réduire la latence au minimum.
> **Difficulté** : ⭐⭐⭐⭐

---

## 1. Qu'est-ce que le Edge ?

### 1.1 Définition

Le **edge** (littéralement "bord") désigne les serveurs situés **au plus près géographiquement de l'utilisateur final**, par opposition au serveur d'origine (origin) qui peut être dans un seul datacenter.

**Analogie** : Imagine une chaîne de pizzerias. Le **serveur d'origine**, c'est la cuisine centrale qui prépare les recettes. Les **edge servers**, ce sont les points de vente dans chaque quartier. Au lieu de faire traverser la ville à chaque pizza (latence), on prépare directement dans le quartier.

```
                        Serveur d'Origine
                         (us-east-1)
                              │
                    ┌─────────┼─────────┐
                    │         │         │
                    ▼         ▼         ▼
              ┌──────────┐ ┌──────────┐ ┌──────────┐
              │  Edge    │ │  Edge    │ │  Edge    │
              │  Paris   │ │  Tokyo   │ │  São     │
              │  (CDN)   │ │  (CDN)   │ │  Paulo   │
              └────┬─────┘ └────┬─────┘ └────┬─────┘
                   │            │            │
              ┌────┴────┐ ┌────┴────┐ ┌────┴────┐
              │Utilisat.│ │Utilisat.│ │Utilisat.│
              │ France  │ │ Japon   │ │ Brésil  │
              └─────────┘ └─────────┘ └─────────┘

              ~5ms RTT      ~5ms RTT    ~5ms RTT
              (vs ~120ms    (vs ~200ms  (vs ~180ms
               vers origin)  vers origin) vers origin)
```

### 1.2 Du cache statique au calcul au edge

L'évolution du edge en trois étapes :

| Génération | Capacité | Exemple |
|-----------|----------|---------|
| **Edge 1.0** — CDN classique | Servir des fichiers statiques en cache | Cloudflare, Akamai, Fastly |
| **Edge 2.0** — Edge compute | Exécuter du code (JS/WASM) au edge | Cloudflare Workers, Deno Deploy |
| **Edge 3.0** — Edge SSR | Faire du rendu serveur complet au edge | Vercel Edge Functions, Cloudflare Pages Functions |

---

## 2. Edge Functions : exécuter du code au edge

### 2.1 Le modèle d'exécution

Les edge functions ne tournent **pas** dans un conteneur Node.js classique. Elles utilisent un runtime léger basé sur les **Web APIs** (comme un Service Worker).

```
┌───────────────────────────────────────────────────┐
│              Runtime Edge (V8 Isolate)             │
│                                                     │
│  ✅ fetch(), Request, Response                      │
│  ✅ crypto, TextEncoder/Decoder                     │
│  ✅ URL, URLSearchParams, Headers                   │
│  ✅ setTimeout (limité)                             │
│  ✅ ReadableStream, WritableStream                  │
│  ✅ Caches API (cache au edge)                      │
│                                                     │
│  ❌ fs (pas de système de fichiers)                 │
│  ❌ child_process (pas de processus)                │
│  ❌ net, dgram (pas de sockets bruts)               │
│  ❌ Modules npm lourds (sharp, puppeteer...)        │
│  ❌ Temps d'exécution illimité (timeout ~30s)       │
└───────────────────────────────────────────────────┘
```

### 2.2 Simuler le edge avec Node.js

Même si le vrai edge utilise un runtime différent, on peut simuler les concepts avec `node:http` pour comprendre les patterns :

```js
// edge-simulator.mjs — Simule un edge server avec cache local
import { createServer } from 'node:http';

// --- Configuration ---
const EDGE_LOCATION = 'Paris-CDG';
const ORIGIN_URL = 'http://localhost:4000'; // Serveur d'origine simulé

// --- Cache local au edge (simule le cache CDN) ---
const edgeCache = new Map();

// --- Mesure de latence simulée ---
function simulateNetworkLatency(destination) {
  const latencies = {
    origin: 120,     // 120ms vers le serveur d'origine
    edge_cache: 2,   // 2ms pour le cache local
  };
  return new Promise(resolve => setTimeout(resolve, latencies[destination] || 50));
}

// --- Edge Function : logique exécutée au edge ---
async function edgeFunction(req) {
  const url = new URL(req.url, 'http://localhost');
  const cacheKey = `${req.method}:${url.pathname}`;

  // 1. Vérifier le cache edge
  const cached = edgeCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < 60_000) {
    await simulateNetworkLatency('edge_cache');
    return {
      status: 200,
      headers: {
        'Content-Type': 'text/html',
        'X-Edge-Location': EDGE_LOCATION,
        'X-Cache': 'HIT',
        'X-Cache-Age': String(Math.floor((Date.now() - cached.timestamp) / 1000)),
      },
      body: cached.body,
    };
  }

  // 2. Cache miss → aller chercher à l'origine
  console.log(`[${EDGE_LOCATION}] Cache MISS pour ${url.pathname} → fetch origin`);
  await simulateNetworkLatency('origin');

  // Simuler la réponse de l'origine
  const body = `<!DOCTYPE html>
<html><body>
  <h1>Page servie depuis le edge</h1>
  <p>Edge location : ${EDGE_LOCATION}</p>
  <p>Généré à : ${new Date().toISOString()}</p>
  <p>Path : ${url.pathname}</p>
</body></html>`;

  // 3. Stocker dans le cache edge
  edgeCache.set(cacheKey, { body, timestamp: Date.now() });

  return {
    status: 200,
    headers: {
      'Content-Type': 'text/html',
      'X-Edge-Location': EDGE_LOCATION,
      'X-Cache': 'MISS',
      'X-Origin-Latency': '120ms',
    },
    body,
  };
}

// --- Serveur HTTP (simule le edge node) ---
const server = createServer(async (req, res) => {
  const start = Date.now();
  const result = await edgeFunction(req);
  const duration = Date.now() - start;

  res.writeHead(result.status, {
    ...result.headers,
    'X-Response-Time': `${duration}ms`,
    'Server': `Edge/${EDGE_LOCATION}`,
  });
  res.end(result.body);

  console.log(`[${EDGE_LOCATION}] ${req.method} ${req.url} → ${result.headers['X-Cache']} (${duration}ms)`);
});

server.listen(3000, () => {
  console.log(`Edge server (${EDGE_LOCATION}) → http://localhost:3000`);
  console.log('Première requête : ~120ms (origin fetch)');
  console.log('Requêtes suivantes : ~2ms (edge cache)');
});
```

### 2.3 Plateformes Edge majeures

| Plateforme | Runtime | Limites | Cache intégré |
|-----------|---------|---------|---------------|
| **Cloudflare Workers** | V8 Isolate | 10ms CPU (gratuit), 30s (payant) | Workers KV, Cache API |
| **Vercel Edge Functions** | V8 (Edge Runtime) | 25s timeout | Vercel Edge Cache |
| **Deno Deploy** | Deno (V8) | 50ms CPU, 512MB RAM | Pas de cache intégré |
| **AWS Lambda@Edge** | Node.js | 5s (viewer), 30s (origin) | CloudFront cache |
| **Fastly Compute** | WASM | 50ms CPU par défaut | Intégré à Varnish |

---

## 3. Edge SSR : le rendu serveur au edge

### 3.1 Pourquoi faire du SSR au edge ?

Le SSR classique se fait dans un serveur centralisé. Si ton serveur est à Paris et ton utilisateur à Tokyo, il faut **~200ms** juste pour le round-trip réseau. Avec le edge SSR, le rendu se fait **dans le datacenter le plus proche** de l'utilisateur.

```
SSR classique :
  Tokyo ──(200ms)──▶ Paris (serveur) ──(rendu 50ms)──(200ms)──▶ Tokyo
  Total TTFB : ~450ms

Edge SSR :
  Tokyo ──(5ms)──▶ Tokyo edge (rendu 50ms) ──(5ms)──▶ Tokyo
  Total TTFB : ~60ms

  Gain : ~390ms (87% de réduction !)
```

### 3.2 Implémentation Edge SSR simulée

```js
// edge-ssr.mjs — SSR au edge avec cache intelligent
import { createServer } from 'node:http';

// --- Simule différentes localisations edge ---
const EDGE_LOCATIONS = {
  'fr': { name: 'Paris-CDG', lang: 'fr', currency: 'EUR' },
  'jp': { name: 'Tokyo-NRT', lang: 'ja', currency: 'JPY' },
  'us': { name: 'New-York-JFK', lang: 'en', currency: 'USD' },
  'br': { name: 'São-Paulo-GRU', lang: 'pt', currency: 'BRL' },
};

// --- Cache par edge location ---
const caches = new Map(); // location:path → { html, timestamp }

function getCacheForLocation(location) {
  return {
    get(key) {
      const fullKey = `${location}:${key}`;
      const entry = caches.get(fullKey);
      if (!entry) return null;
      if (Date.now() - entry.timestamp > 30_000) {
        caches.delete(fullKey);
        return null;
      }
      return entry.html;
    },
    set(key, html) {
      caches.set(`${location}:${key}`, { html, timestamp: Date.now() });
    },
  };
}

// --- Simule un fetch vers l'API de données ---
async function fetchProductData(productId) {
  await new Promise(r => setTimeout(r, 100)); // Simule latence DB
  return {
    id: productId,
    name: `Produit ${productId}`,
    prices: { EUR: 49.99, USD: 54.99, JPY: 7500, BRL: 279.90 },
    stock: Math.floor(Math.random() * 100),
  };
}

// --- Rendu SSR localisé au edge ---
function renderProduct(product, edgeInfo) {
  const price = product.prices[edgeInfo.currency] || product.prices.EUR;
  const currencySymbol = { EUR: '€', USD: '$', JPY: '¥', BRL: 'R$' }[edgeInfo.currency];

  return `<!DOCTYPE html>
<html lang="${edgeInfo.lang}">
<head>
  <meta charset="UTF-8">
  <title>${product.name}</title>
</head>
<body>
  <header>
    <small>Edge: ${edgeInfo.name} | Devise: ${edgeInfo.currency}</small>
  </header>
  <main>
    <h1>${product.name}</h1>
    <p class="price">${currencySymbol}${price}</p>
    <p>Stock : ${product.stock} unités</p>
    <p><em>Rendu au edge à ${new Date().toISOString()}</em></p>
  </main>
</body>
</html>`;
}

// --- Serveur Edge ---
const server = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');

  // Détecter la localisation (via query param pour la démo)
  const geo = url.searchParams.get('geo') || 'fr';
  const edgeInfo = EDGE_LOCATIONS[geo] || EDGE_LOCATIONS['fr'];
  const cache = getCacheForLocation(edgeInfo.name);

  // Route produit
  const match = url.pathname.match(/^\/product\/(\w+)$/);
  if (!match) {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(`<h1>Edge SSR Demo</h1>
      <p>Essaye : <a href="/product/abc123?geo=fr">/product/abc123?geo=fr</a></p>
      <p>Geos disponibles : fr, jp, us, br</p>`);
    return;
  }

  const productId = match[1];
  const start = Date.now();

  // Vérifier le cache edge
  const cached = cache.get(`/product/${productId}`);
  if (cached) {
    const duration = Date.now() - start;
    res.writeHead(200, {
      'Content-Type': 'text/html',
      'X-Edge': edgeInfo.name,
      'X-Cache': 'HIT',
      'X-Response-Time': `${duration}ms`,
      'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=300',
    });
    res.end(cached);
    console.log(`[${edgeInfo.name}] HIT /product/${productId} (${duration}ms)`);
    return;
  }

  // Cache miss → fetch data + SSR au edge
  const product = await fetchProductData(productId);
  const html = renderProduct(product, edgeInfo);
  cache.set(`/product/${productId}`, html);

  const duration = Date.now() - start;
  res.writeHead(200, {
    'Content-Type': 'text/html',
    'X-Edge': edgeInfo.name,
    'X-Cache': 'MISS',
    'X-Response-Time': `${duration}ms`,
    'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=300',
  });
  res.end(html);
  console.log(`[${edgeInfo.name}] MISS /product/${productId} (${duration}ms)`);
});

server.listen(3000, () => {
  console.log('Edge SSR → http://localhost:3000/product/abc123?geo=jp');
});
```

---

## 4. Edge Caching : cache-keys intelligentes

### 4.1 Le problème des cache-keys classiques

Par défaut, un CDN utilise l'URL comme clé de cache. Mais au edge, on veut souvent cacher **différentes versions** de la même URL selon le contexte.

```
Même URL, mais contenu différent selon :
  - La géolocalisation (pays, ville)
  - Le type d'appareil (mobile, desktop)
  - La langue (Accept-Language)
  - Les cookies (A/B test, feature flags)
  - Le protocole (HTTP/2, HTTP/3)
```

### 4.2 Construction de cache-keys au edge

```js
// edge-cache-keys.mjs — Cache-keys intelligentes
import { createServer } from 'node:http';

const cache = new Map();

// --- Construire une cache-key intelligente ---
function buildCacheKey(req) {
  const url = new URL(req.url, 'http://localhost');

  // Facteurs qui influencent le contenu
  const geo = req.headers['x-geo-country'] || url.searchParams.get('country') || 'FR';
  const device = detectDevice(req.headers['user-agent'] || '');
  const lang = parseAcceptLanguage(req.headers['accept-language'] || 'fr');
  const abGroup = getABGroup(req.headers['cookie'] || '');

  // Construire la clé composite
  const key = [
    url.pathname,           // /product/123
    `geo:${geo}`,           // geo:FR
    `device:${device}`,     // device:mobile
    `lang:${lang}`,         // lang:fr
    `ab:${abGroup}`,        // ab:A
  ].join('|');

  return { key, factors: { geo, device, lang, abGroup } };
}

function detectDevice(ua) {
  if (/mobile|android|iphone/i.test(ua)) return 'mobile';
  if (/tablet|ipad/i.test(ua)) return 'tablet';
  return 'desktop';
}

function parseAcceptLanguage(header) {
  const match = header.match(/^([a-z]{2})/i);
  return match ? match[1].toLowerCase() : 'en';
}

function getABGroup(cookie) {
  const match = cookie.match(/ab_group=([AB])/);
  return match ? match[1] : Math.random() > 0.5 ? 'A' : 'B';
}

// --- Serveur ---
const server = createServer((req, res) => {
  const { key, factors } = buildCacheKey(req);

  // Chercher dans le cache
  if (cache.has(key)) {
    const entry = cache.get(key);
    res.writeHead(200, {
      'Content-Type': 'text/html',
      'X-Cache': 'HIT',
      'X-Cache-Key': key,
      'Vary': 'Accept-Language, User-Agent, Cookie',
    });
    res.end(entry);
    return;
  }

  // Générer la réponse personnalisée
  const html = `<!DOCTYPE html>
<html lang="${factors.lang}">
<body>
  <h1>Edge Cache-Key Demo</h1>
  <table border="1" cellpadding="8">
    <tr><th>Facteur</th><th>Valeur</th></tr>
    <tr><td>Pays</td><td>${factors.geo}</td></tr>
    <tr><td>Appareil</td><td>${factors.device}</td></tr>
    <tr><td>Langue</td><td>${factors.lang}</td></tr>
    <tr><td>Groupe A/B</td><td>${factors.abGroup}</td></tr>
  </table>
  <p><strong>Cache-Key :</strong> <code>${key}</code></p>
  <p>Généré à ${new Date().toISOString()}</p>
</body>
</html>`;

  cache.set(key, html);

  res.writeHead(200, {
    'Content-Type': 'text/html',
    'X-Cache': 'MISS',
    'X-Cache-Key': key,
    'Vary': 'Accept-Language, User-Agent, Cookie',
  });
  res.end(html);
});

server.listen(3000, () => {
  console.log('Edge Cache-Keys → http://localhost:3000/product/123');
  console.log('\nEssaye avec différents headers :');
  console.log('curl -H "Accept-Language: ja" http://localhost:3000/product/123');
  console.log('curl -H "User-Agent: iPhone" http://localhost:3000/product/123');
  console.log('curl -H "Cookie: ab_group=B" http://localhost:3000/product/123');
});
```

---

## 5. Limites du Edge

### 5.1 Ce que tu ne peux PAS faire au edge

| Limitation | Pourquoi | Contournement |
|-----------|---------|---------------|
| **Pas de filesystem** | Les edge functions tournent dans des V8 isolates, pas des conteneurs | Utiliser KV, R2, ou des API distantes |
| **API restreinte** | Pas de Node.js complet (pas de `fs`, `child_process`, `net`) | S'en tenir aux Web APIs (fetch, crypto, streams) |
| **Temps d'exécution limité** | Facturation au temps CPU, timeout court (~30s max) | Déléguer le travail lourd à une queue/worker |
| **Mémoire limitée** | 128-512MB selon la plateforme | Pas de traitement d'images/vidéos lourd |
| **Cold starts** | Premier appel plus lent (~5-50ms) | Utiliser le mode "keep-alive" des plateformes |
| **Pas de connexions persistantes** | Pas de WebSocket longue durée (sur certaines plateformes) | Utiliser Durable Objects (Cloudflare) |
| **Débugage limité** | Pas de debugger Node.js classique | Logs + Tail workers |

### 5.2 Quand NE PAS utiliser le edge

```
┌─────────────────────────────────────────────────────┐
│  NE PAS utiliser le edge si :                        │
│                                                       │
│  ❌ Tu as besoin d'accéder au filesystem              │
│  ❌ Tu fais du traitement CPU intensif (ML, images)  │
│  ❌ Tu as besoin de bibliothèques Node.js lourdes    │
│  ❌ Tu as besoin de connexions DB persistantes       │
│  ❌ Le temps de calcul dépasse 30 secondes           │
│  ❌ Ta base de données est dans une seule région     │
│     (la latence edge → DB annule le gain)            │
└─────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────┐
│  UTILISER le edge si :                               │
│                                                       │
│  ✅ Tu sers du contenu statique/semi-statique        │
│  ✅ Tu fais du routing/redirect léger                │
│  ✅ Tu personnalises des pages (geo, device, A/B)    │
│  ✅ Tu fais de l'authentification légère (JWT)       │
│  ✅ Tu transformes des réponses (HTML rewriting)     │
│  ✅ Ta source de données est distribuée (KV, API)    │
└─────────────────────────────────────────────────────┘
```

---

## 6. Patterns courants au Edge

### 6.1 A/B Testing au edge

```js
// edge-ab-testing.mjs — A/B testing sans JavaScript côté client
import { createServer } from 'node:http';

const VARIANTS = {
  A: {
    headline: 'Découvrez notre nouveau produit',
    cta: 'Essayer gratuitement',
    color: '#2563eb',
  },
  B: {
    headline: 'Le produit qui va tout changer',
    cta: 'Commencer maintenant',
    color: '#dc2626',
  },
};

function getVariant(req) {
  // 1. Vérifier si un cookie existe déjà
  const cookies = req.headers.cookie || '';
  const match = cookies.match(/ab_variant=([AB])/);
  if (match) return { variant: match[1], isNew: false };

  // 2. Sinon, assigner aléatoirement (50/50)
  const variant = Math.random() < 0.5 ? 'A' : 'B';
  return { variant, isNew: true };
}

const server = createServer((req, res) => {
  const { variant, isNew } = getVariant(req);
  const v = VARIANTS[variant];

  const headers = {
    'Content-Type': 'text/html; charset=utf-8',
    'X-AB-Variant': variant,
    // Cache différent par variant pour que le CDN ne mélange pas
    'Vary': 'Cookie',
    'Cache-Control': 'public, s-maxage=3600',
  };

  // Persister le variant dans un cookie
  if (isNew) {
    headers['Set-Cookie'] = `ab_variant=${variant}; Path=/; Max-Age=2592000; SameSite=Lax`;
  }

  res.writeHead(200, headers);
  res.end(`<!DOCTYPE html>
<html>
<body style="font-family: sans-serif; text-align: center; padding: 50px;">
  <h1 style="color: ${v.color};">${v.headline}</h1>
  <button style="background: ${v.color}; color: white; padding: 15px 30px;
    border: none; border-radius: 8px; font-size: 18px; cursor: pointer;">
    ${v.cta}
  </button>
  <p style="margin-top: 30px; color: #666;">
    Variant <strong>${variant}</strong> —
    ${isNew ? 'Nouveau visiteur (cookie créé)' : 'Visiteur existant (cookie lu)'}
  </p>
</body>
</html>`);
});

server.listen(3000, () => {
  console.log('A/B Testing Edge → http://localhost:3000');
  console.log('Ouvre en navigation privée pour voir un variant aléatoire.');
});
```

### 6.2 Geo-routing au edge

```js
// edge-geo-routing.mjs — Routage géographique au edge
import { createServer } from 'node:http';

// Table de routage par pays
const GEO_ROUTES = {
  FR: { origin: 'https://api-eu.example.com', lang: 'fr', region: 'EU' },
  DE: { origin: 'https://api-eu.example.com', lang: 'de', region: 'EU' },
  US: { origin: 'https://api-us.example.com', lang: 'en', region: 'US' },
  JP: { origin: 'https://api-ap.example.com', lang: 'ja', region: 'AP' },
  BR: { origin: 'https://api-sa.example.com', lang: 'pt', region: 'SA' },
};

const DEFAULT_ROUTE = { origin: 'https://api-eu.example.com', lang: 'en', region: 'DEFAULT' };

// Pages bloquées par région (compliance GDPR, etc.)
const BLOCKED = {
  '/gambling': ['FR', 'DE'],        // Gambling interdit en France/Allemagne
  '/crypto-trading': ['US'],         // Restrictions US
};

function detectCountry(req) {
  // En production, le CDN injecte des headers comme :
  // Cloudflare: cf-ipcountry
  // AWS CloudFront: CloudFront-Viewer-Country
  // Fastly: Fastly-Geo-Country
  return req.headers['x-country']
    || req.headers['cf-ipcountry']
    || new URL(req.url, 'http://localhost').searchParams.get('country')
    || 'FR';
}

const server = createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const country = detectCountry(req);
  const route = GEO_ROUTES[country] || DEFAULT_ROUTE;

  // Vérifier les restrictions géographiques
  const blocked = BLOCKED[url.pathname];
  if (blocked && blocked.includes(country)) {
    res.writeHead(451, {
      'Content-Type': 'text/html',
      'X-Geo-Country': country,
      'X-Blocked-Reason': 'geo-restriction',
    });
    res.end(`<h1>451 — Contenu non disponible dans votre région</h1>
      <p>Ce contenu n'est pas disponible dans le pays : ${country}</p>`);
    return;
  }

  // Routage normal
  res.writeHead(200, {
    'Content-Type': 'text/html; charset=utf-8',
    'X-Geo-Country': country,
    'X-Geo-Region': route.region,
    'X-Origin': route.origin,
    'Content-Language': route.lang,
    // Cache par pays
    'Cache-Control': 'public, s-maxage=300',
    'Vary': 'X-Country',
  });

  res.end(`<!DOCTYPE html>
<html lang="${route.lang}">
<body>
  <h1>Geo-Routing Edge Demo</h1>
  <table border="1" cellpadding="8">
    <tr><td>Pays détecté</td><td><strong>${country}</strong></td></tr>
    <tr><td>Région</td><td>${route.region}</td></tr>
    <tr><td>Langue</td><td>${route.lang}</td></tr>
    <tr><td>API Origin</td><td>${route.origin}</td></tr>
    <tr><td>Path</td><td>${url.pathname}</td></tr>
  </table>
  <p>Essaye : ?country=JP ou ?country=US</p>
  <p>Page bloquée : <a href="/gambling?country=FR">/gambling?country=FR</a></p>
</body>
</html>`);
});

server.listen(3000, () => {
  console.log('Geo-Routing Edge → http://localhost:3000?country=JP');
});
```

### 6.3 Authentification légère au edge

```js
// edge-auth.mjs — Vérification JWT au edge (sans accès DB)
import { createServer } from 'node:http';
import { createHmac, timingSafeEqual } from 'node:crypto';

const JWT_SECRET = 'super-secret-key-2025';

// --- JWT minimaliste (simulation edge-compatible) ---
function base64UrlEncode(str) {
  return Buffer.from(str).toString('base64url');
}

function base64UrlDecode(str) {
  return Buffer.from(str, 'base64url').toString();
}

function createJWT(payload) {
  const header = base64UrlEncode(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const body = base64UrlEncode(JSON.stringify({ ...payload, iat: Math.floor(Date.now() / 1000) }));
  const signature = createHmac('sha256', JWT_SECRET).update(`${header}.${body}`).digest('base64url');
  return `${header}.${body}.${signature}`;
}

function verifyJWT(token) {
  const parts = token.split('.');
  if (parts.length !== 3) return null;

  const [header, body, signature] = parts;
  const expectedSig = createHmac('sha256', JWT_SECRET).update(`${header}.${body}`).digest('base64url');

  // Comparaison timing-safe (protection contre les timing attacks)
  const sigBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expectedSig);

  if (sigBuffer.length !== expectedBuffer.length) return null;
  if (!timingSafeEqual(sigBuffer, expectedBuffer)) return null;

  try {
    const payload = JSON.parse(base64UrlDecode(body));
    // Vérifier l'expiration
    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}

const server = createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');

  // Route de login (génère un JWT)
  if (url.pathname === '/login') {
    const user = url.searchParams.get('user') || 'demo';
    const token = createJWT({
      sub: user,
      role: 'user',
      exp: Math.floor(Date.now() / 1000) + 3600, // 1h
    });

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      token,
      usage: `curl -H "Authorization: Bearer ${token}" http://localhost:3000/protected`,
    }));
    return;
  }

  // Route protégée
  if (url.pathname === '/protected') {
    const authHeader = req.headers.authorization || '';
    const token = authHeader.replace('Bearer ', '');

    if (!token) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Token manquant', login: '/login?user=monnom' }));
      return;
    }

    const payload = verifyJWT(token);
    if (!payload) {
      res.writeHead(403, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Token invalide ou expiré' }));
      return;
    }

    // Token valide → servir la page protégée
    res.writeHead(200, {
      'Content-Type': 'text/html',
      'X-Edge-Auth': 'verified',
      'X-User': payload.sub,
      // NE PAS cacher les pages authentifiées sur le CDN
      'Cache-Control': 'private, no-store',
    });
    res.end(`<h1>Page protégée</h1>
      <p>Bienvenue, <strong>${payload.sub}</strong> (rôle: ${payload.role})</p>
      <p>Authentification vérifiée au edge — aucun accès DB nécessaire.</p>`);
    return;
  }

  res.writeHead(200, { 'Content-Type': 'text/html' });
  res.end(`<h1>Edge Auth Demo</h1>
    <p>1. <a href="/login?user=alice">/login?user=alice</a> pour obtenir un token</p>
    <p>2. Utilise le token avec : curl -H "Authorization: Bearer TOKEN" /protected</p>`);
});

server.listen(3000, () => {
  console.log('Edge Auth → http://localhost:3000');
});
```

---

## 7. Edge Caching et Cache-Control

### 7.1 Les en-têtes spécifiques au edge

```
┌────────────────────────────────────────────────────────┐
│          Hiérarchie des en-têtes de cache               │
│                                                          │
│  CDN-Cache-Control    →  Uniquement pour le CDN/Edge    │
│  Surrogate-Control    →  Standard Akamai/Fastly         │
│  s-maxage             →  Caches partagés (CDN inclus)   │
│  max-age              →  Navigateur + caches partagés   │
│                                                          │
│  Priorité : CDN-Cache-Control > Surrogate-Control       │
│             > s-maxage > max-age                         │
└────────────────────────────────────────────────────────┘
```

```js
// edge-headers.mjs — Démonstration des en-têtes edge
import { createServer } from 'node:http';

const pages = {
  '/static': {
    desc: 'Asset statique (CSS, JS, images)',
    headers: {
      'Cache-Control': 'public, max-age=31536000, immutable',
    },
  },
  '/page': {
    desc: 'Page HTML semi-dynamique',
    headers: {
      // max-age=0 pour le navigateur (toujours revalider)
      // s-maxage=60 pour le CDN (cacher 60s)
      'Cache-Control': 'public, max-age=0, s-maxage=60, stale-while-revalidate=600',
      'Surrogate-Control': 'max-age=120',  // Akamai/Fastly: 120s
      'CDN-Cache-Control': 'max-age=60',   // Cloudflare: 60s
    },
  },
  '/api': {
    desc: 'API JSON dynamique',
    headers: {
      'Cache-Control': 'public, max-age=0, s-maxage=5',
      'CDN-Cache-Control': 'max-age=5, stale-while-revalidate=30',
    },
  },
  '/private': {
    desc: 'Page utilisateur authentifié',
    headers: {
      'Cache-Control': 'private, no-store, no-cache',
      // Pas de CDN-Cache-Control = le CDN ne cache pas
    },
  },
};

const server = createServer((req, res) => {
  const page = pages[req.url];

  if (!page) {
    const links = Object.keys(pages).map(p => `<li><a href="${p}">${p}</a></li>`).join('');
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(`<h1>Edge Headers Demo</h1><ul>${links}</ul>`);
    return;
  }

  const headersTable = Object.entries(page.headers)
    .map(([k, v]) => `<tr><td><code>${k}</code></td><td><code>${v}</code></td></tr>`)
    .join('');

  res.writeHead(200, {
    'Content-Type': 'text/html; charset=utf-8',
    ...page.headers,
  });

  res.end(`<html><body>
    <h1>${req.url}</h1>
    <p><em>${page.desc}</em></p>
    <table border="1" cellpadding="8">
      <tr><th>En-tête</th><th>Valeur</th></tr>
      ${headersTable}
    </table>
  </body></html>`);
});

server.listen(3000, () => console.log('Edge Headers → http://localhost:3000'));
```

---

## Points clés

1. Le **edge** désigne les serveurs géographiquement proches de l'utilisateur — réduisant la latence réseau de manière drastique.
2. Les **edge functions** exécutent du code dans des V8 isolates légers, avec un sous-ensemble des APIs Node.js (Web APIs).
3. L'**edge SSR** permet de faire du rendu serveur au plus près de l'utilisateur, réduisant le TTFB de 80-90%.
4. Les **cache-keys intelligentes** permettent de cacher différentes versions d'une même URL selon le pays, l'appareil, la langue ou le groupe A/B.
5. Les **limites du edge** sont réelles : pas de filesystem, pas de modules npm lourds, temps d'exécution limité.
6. Les en-têtes `CDN-Cache-Control` et `Surrogate-Control` permettent de configurer le cache edge indépendamment du navigateur.
7. L'**A/B testing au edge** est instantané (pas de flash of content) car la décision est prise avant que le HTML n'arrive au client.
8. La **vérification JWT au edge** permet de protéger des routes sans accès à la base de données — idéal pour les tokens stateless.

---

## Lab associé

→ `labs/12-edge-rendering/` — Construire un simulateur multi-edge avec geo-routing, cache-keys composites, A/B testing persistant, et mesurer la différence de TTFB entre edge cache HIT et origin fetch.

---

## Pour aller plus loin

- [Cloudflare Workers documentation](https://developers.cloudflare.com/workers/)
- [Vercel Edge Functions](https://vercel.com/docs/functions/edge-functions)
- [CDN-Cache-Control header](https://developers.cloudflare.com/cache/concepts/cdn-cache-control/)
- [Deno Deploy](https://deno.com/deploy)
- [AWS Lambda@Edge](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/lambda-at-the-edge.html)

---

## Si tu es perdu

Pense à un **réseau de bibliothèques municipales** :

- La **bibliothèque centrale** (origin server) a tous les livres. Mais elle est loin — il faut traverser la ville pour y aller.
- Les **bibliothèques de quartier** (edge servers) sont à 5 minutes de chez toi. Elles ont les livres les plus demandés (cache).
- Avant, les bibliothèques de quartier ne pouvaient que **prêter des livres déjà imprimés** (cache statique CDN).
- Maintenant, elles ont une **petite imprimante** (edge compute) qui peut fabriquer certains livres sur place — pas les gros romans (Node.js complet), mais les brochures et les fiches (pages web légères).
- Le **catalogue de chaque bibliothèque** est différent selon le quartier (cache-keys par géolocalisation) : la bibliothèque du quartier japonais a plus de mangas, celle du quartier des affaires a plus de revues financières.

---

## Défi

### Construis un edge router complet

Crée un serveur Node.js qui simule un edge router avec :

1. **Geo-routing** : redirige vers différents backends selon le pays (header `X-Country`)
2. **A/B testing** : assigne un variant via cookie, cache chaque variant séparément
3. **Rate limiting au edge** : max 10 requêtes par IP par minute (retourne 429)
4. **Cache intelligent** : cache-key = `path + country + variant`, TTL de 30s
5. Un endpoint `/edge-status` qui affiche le nombre d'entrées en cache, les stats de hit/miss par pays

<details>
<summary>Voir la solution</summary>

```js
// defi-12-edge-router.mjs
import { createServer } from 'node:http';

const cache = new Map();
const rateLimits = new Map(); // ip → { count, resetAt }
const stats = { hit: 0, miss: 0, rateLimit: 0, byCountry: {} };

function getCountry(req) {
  return req.headers['x-country'] || new URL(req.url, 'http://localhost').searchParams.get('country') || 'FR';
}

function getVariant(req) {
  const cookies = req.headers.cookie || '';
  const match = cookies.match(/variant=([AB])/);
  if (match) return { variant: match[1], isNew: false };
  return { variant: Math.random() < 0.5 ? 'A' : 'B', isNew: true };
}

function checkRateLimit(ip) {
  const now = Date.now();
  const entry = rateLimits.get(ip);
  if (!entry || now > entry.resetAt) {
    rateLimits.set(ip, { count: 1, resetAt: now + 60_000 });
    return true;
  }
  entry.count++;
  return entry.count <= 10;
}

function buildCacheKey(path, country, variant) {
  return `${path}|${country}|${variant}`;
}

const server = createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const ip = req.socket.remoteAddress || '127.0.0.1';

  // Edge status
  if (url.pathname === '/edge-status') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ cacheEntries: cache.size, ...stats }, null, 2));
    return;
  }

  // Rate limiting
  if (!checkRateLimit(ip)) {
    stats.rateLimit++;
    res.writeHead(429, {
      'Content-Type': 'text/plain',
      'Retry-After': '60',
    });
    res.end('429 Too Many Requests — Max 10 req/min');
    return;
  }

  const country = getCountry(req);
  const { variant, isNew } = getVariant(req);
  const cacheKey = buildCacheKey(url.pathname, country, variant);

  // Init stats par pays
  if (!stats.byCountry[country]) stats.byCountry[country] = { hit: 0, miss: 0 };

  // Chercher dans le cache
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.ts < 30_000) {
    stats.hit++;
    stats.byCountry[country].hit++;
    const headers = { 'Content-Type': 'text/html', 'X-Cache': 'HIT', 'X-Cache-Key': cacheKey };
    if (isNew) headers['Set-Cookie'] = `variant=${variant}; Path=/; Max-Age=86400`;
    res.writeHead(200, headers);
    res.end(cached.html);
    return;
  }

  // Cache miss
  stats.miss++;
  stats.byCountry[country].miss++;
  const backends = { FR: 'eu-west', US: 'us-east', JP: 'ap-northeast' };
  const backend = backends[country] || 'eu-west';

  const html = `<html><body>
    <h1>Edge Router</h1>
    <p>Country: ${country} | Backend: ${backend} | Variant: ${variant}</p>
    <p>Cache-Key: <code>${cacheKey}</code></p>
    <p>Generated: ${new Date().toISOString()}</p>
    <p><a href="/edge-status">Edge Status</a></p>
  </body></html>`;

  cache.set(cacheKey, { html, ts: Date.now() });

  const headers = { 'Content-Type': 'text/html', 'X-Cache': 'MISS', 'X-Cache-Key': cacheKey };
  if (isNew) headers['Set-Cookie'] = `variant=${variant}; Path=/; Max-Age=86400`;
  res.writeHead(200, headers);
  res.end(html);
});

server.listen(3000, () => {
  console.log('Edge Router → http://localhost:3000/page?country=JP');
  console.log('Status    → http://localhost:3000/edge-status');
});
```

</details>

---

## En pratique — Configuration Next.js

Next.js supporte le edge rendering nativement via le Edge Runtime.

### Edge Route Handler

```typescript
// app/api/geo/route.ts — API au edge
// POURQUOI : runtime = 'edge' exécute cette route sur les edge servers
// (Vercel Edge Network, Cloudflare, etc.) pour un TTFB minimal.

export const runtime = 'edge';

export function GET(request) {
  // request.geo est fourni automatiquement par le CDN
  const country = request.geo?.country || 'US';
  const city = request.geo?.city || 'Unknown';

  return Response.json(
    { country, city, timestamp: Date.now() },
    {
      headers: {
        // Cache au edge pendant 60s, navigateur pendant 10s
        'Cache-Control': 'public, max-age=10, s-maxage=60',
        'CDN-Cache-Control': 'max-age=300', // CDN : 5 min
      },
    }
  );
}
```

### Edge Middleware (A/B testing, geo-routing)

```typescript
// middleware.ts — S'exécute au edge AVANT chaque requête
// POURQUOI : Le middleware edge est le premier code exécuté. Il peut
// rediriger, réécrire l'URL, ou modifier la requête/réponse sans
// round-trip au serveur d'origine.

import { NextResponse } from 'next/server';

export function middleware(request) {
  // --- A/B Testing ---
  const bucket = request.cookies.get('ab-bucket')?.value
    || (Math.random() > 0.5 ? 'A' : 'B');

  // Réécrire l'URL vers la variante appropriée
  const url = request.nextUrl.clone();
  if (url.pathname === '/landing') {
    url.pathname = `/landing/${bucket.toLowerCase()}`;
  }

  const response = NextResponse.rewrite(url);

  // Persister le bucket dans un cookie
  if (!request.cookies.get('ab-bucket')) {
    response.cookies.set('ab-bucket', bucket, { maxAge: 86400 });
  }

  return response;
}

// Ne matcher que certaines routes
export const config = {
  matcher: ['/landing', '/api/:path*'],
};
```

### Edge SSR — Page au edge

```typescript
// app/dashboard/page.tsx — SSR au edge
// POURQUOI : Le dashboard est rendu au edge pour un TTFB minimal.
// Attention : le Edge Runtime n'a pas accès à Node.js natif (fs, crypto, etc.)

export const runtime = 'edge';

export default async function Dashboard() {
  // fetch fonctionne au edge (Web APIs)
  const data = await fetch('https://api.example.com/dashboard', {
    next: { revalidate: 30 }
  }).then(r => r.json());

  return (
    <main>
      <h1>Dashboard</h1>
      {/* Rendu au edge, pas au serveur d'origine */}
    </main>
  );
}
```

### Comparaison Node.js Runtime vs Edge Runtime

| Aspect | Node.js Runtime | Edge Runtime |
|--------|----------------|-------------|
| **Démarrage** | ~250ms (cold start) | ~1ms (V8 isolate) |
| **APIs** | Node.js complet (fs, crypto, streams) | Web APIs uniquement (fetch, crypto.subtle) |
| **Taille max** | Illimitée | ~4 MB (Vercel), ~1 MB (Cloudflare) |
| **Base de données** | Toutes (SQL, NoSQL, ORM) | HTTP-only (REST, GraphQL, edge-compatible DBs) |
| **Cas d'usage** | API complexes, rendering lourd | Routing, auth, A/B testing, personnalisation |
