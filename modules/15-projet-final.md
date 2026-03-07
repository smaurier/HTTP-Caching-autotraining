# Module 15 — Projet final : architecture cache complète

> **Objectif** : Mettre en pratique **tous les concepts du cours** en concevant, implémentant et testant une architecture cache multi-couches complète, du navigateur jusqu'à l'origine, en passant par le CDN et le edge.
> **Difficulté** : ⭐⭐⭐⭐⭐

---

## 1. Audit de performance d'une application complète

### 1.1 Méthodologie d'audit

Avant d'optimiser, il faut **mesurer**. Voici la méthodologie complète d'audit de performance :

```
┌─────────────────────────────────────────────────────────────┐
│              Méthodologie d'audit en 6 étapes                │
│                                                               │
│  1. MESURER    → Lighthouse, WebPageTest, Server-Timing      │
│  2. IDENTIFIER → Waterfall, bottlenecks, cache misses        │
│  3. PRIORISER  → Impact × Facilité (matrice effort/impact)   │
│  4. IMPLÉMENTER → Cache-Control, CDN, ISR, edge              │
│  5. VALIDER    → Re-mesurer, comparer avant/après            │
│  6. SURVEILLER → Budgets, alertes, dashboards                │
│                                                               │
│       ┌──▶ 1. Mesurer                                        │
│       │       │                                               │
│       │       ▼                                               │
│       │   2. Identifier                                       │
│       │       │                                               │
│       │       ▼                                               │
│       │   3. Prioriser                                        │
│       │       │                                               │
│       │       ▼                                               │
│       │   4. Implémenter                                      │
│       │       │                                               │
│       │       ▼                                               │
│       │   5. Valider ──── OK ? ──▶ 6. Surveiller             │
│       │       │                                               │
│       │      NON                                              │
│       └───────┘                                               │
└─────────────────────────────────────────────────────────────┘
```

### 1.2 Application complète à auditer

Voici l'application que nous allons auditer, optimiser, et monitorer. C'est un site e-commerce simplifié avec :

- Une page d'accueil (SSG)
- Des pages produits (ISR)
- Une API de recherche (SSR + cache)
- Des assets statiques (CSS, JS, images)
- Un dashboard utilisateur (SSR dynamique)

```js
// projet-final-app.mjs — Application e-commerce complète
import { createServer } from 'node:http';
import { createHash } from 'node:crypto';

// ═══════════════════════════════════════════════════════════
// BASE DE DONNÉES SIMULÉE
// ═══════════════════════════════════════════════════════════

const products = [
  { id: 'cdn-pro',        name: 'CDN Pro',         price: 99.99,  category: 'infra',  stock: 42  },
  { id: 'cache-expert',   name: 'Cache Expert',    price: 49.99,  category: 'tools',  stock: 128 },
  { id: 'edge-starter',   name: 'Edge Starter',    price: 19.99,  category: 'infra',  stock: 256 },
  { id: 'ssl-shield',     name: 'SSL Shield',      price: 29.99,  category: 'security', stock: 87 },
  { id: 'monitor-plus',   name: 'Monitor Plus',    price: 39.99,  category: 'tools',  stock: 63  },
  { id: 'waf-defender',   name: 'WAF Defender',    price: 79.99,  category: 'security', stock: 31 },
  { id: 'dns-turbo',      name: 'DNS Turbo',       price: 14.99,  category: 'infra',  stock: 512 },
  { id: 'log-analyzer',   name: 'Log Analyzer',    price: 59.99,  category: 'tools',  stock: 75  },
];

async function simulateDBQuery(data, delayMs = 50) {
  await new Promise(r => setTimeout(r, delayMs));
  return data;
}

// ═══════════════════════════════════════════════════════════
// COUCHE 1 : CACHE MÉMOIRE (application-level cache)
// ═══════════════════════════════════════════════════════════

class AppCache {
  constructor() {
    this.store = new Map();
    this.stats = { hit: 0, miss: 0, evictions: 0 };
    this.maxSize = 100;
  }

  get(key) {
    const entry = this.store.get(key);
    if (!entry) {
      this.stats.miss++;
      return null;
    }
    if (entry.expiresAt && Date.now() > entry.expiresAt) {
      this.store.delete(key);
      this.stats.miss++;
      return null;
    }
    this.stats.hit++;
    entry.lastAccess = Date.now();
    return entry.value;
  }

  set(key, value, ttlSeconds = 60) {
    // Éviction LRU si le cache est plein
    if (this.store.size >= this.maxSize) {
      let oldestKey = null;
      let oldestAccess = Infinity;
      for (const [k, v] of this.store) {
        if (v.lastAccess < oldestAccess) {
          oldestAccess = v.lastAccess;
          oldestKey = k;
        }
      }
      if (oldestKey) {
        this.store.delete(oldestKey);
        this.stats.evictions++;
      }
    }

    this.store.set(key, {
      value,
      createdAt: Date.now(),
      expiresAt: Date.now() + ttlSeconds * 1000,
      lastAccess: Date.now(),
    });
  }

  invalidate(pattern) {
    let count = 0;
    for (const key of this.store.keys()) {
      if (key.includes(pattern)) {
        this.store.delete(key);
        count++;
      }
    }
    return count;
  }

  getStats() {
    const total = this.stats.hit + this.stats.miss;
    return {
      ...this.stats,
      total,
      hitRate: total > 0 ? (this.stats.hit / total * 100).toFixed(1) + '%' : 'N/A',
      size: this.store.size,
      maxSize: this.maxSize,
    };
  }
}

const appCache = new AppCache();

// ═══════════════════════════════════════════════════════════
// COUCHE 2 : CACHE CDN SIMULÉ
// ═══════════════════════════════════════════════════════════

class CDNCache {
  constructor(location) {
    this.location = location;
    this.store = new Map();
    this.stats = { hit: 0, miss: 0, stale: 0 };
  }

  get(key, headers = {}) {
    const entry = this.store.get(key);
    if (!entry) {
      this.stats.miss++;
      return null;
    }

    const age = Math.floor((Date.now() - entry.createdAt) / 1000);
    const maxAge = entry.sMaxAge || entry.maxAge || 0;

    if (age <= maxAge) {
      this.stats.hit++;
      return { body: entry.body, headers: entry.headers, age, status: 'HIT' };
    }

    // Stale-while-revalidate ?
    const swr = entry.staleWhileRevalidate || 0;
    if (age <= maxAge + swr) {
      this.stats.stale++;
      return { body: entry.body, headers: entry.headers, age, status: 'STALE' };
    }

    this.stats.miss++;
    this.store.delete(key);
    return null;
  }

  set(key, body, cacheControl) {
    const parsed = this.parseCacheControl(cacheControl);
    if (parsed.noStore || parsed.private) return; // Ne pas cacher

    this.store.set(key, {
      body,
      headers: { 'Cache-Control': cacheControl },
      createdAt: Date.now(),
      sMaxAge: parsed.sMaxAge,
      maxAge: parsed.maxAge,
      staleWhileRevalidate: parsed.staleWhileRevalidate,
    });
  }

  parseCacheControl(header) {
    const result = { maxAge: 0, sMaxAge: 0, staleWhileRevalidate: 0, noStore: false, private: false };
    if (!header) return result;
    const match = (regex) => { const m = header.match(regex); return m ? parseInt(m[1], 10) : 0; };
    result.maxAge = match(/max-age=(\d+)/);
    result.sMaxAge = match(/s-maxage=(\d+)/);
    result.staleWhileRevalidate = match(/stale-while-revalidate=(\d+)/);
    result.noStore = header.includes('no-store');
    result.private = header.includes('private');
    return result;
  }

  getStats() {
    const total = this.stats.hit + this.stats.miss + this.stats.stale;
    return {
      location: this.location,
      ...this.stats,
      total,
      hitRate: total > 0 ? (this.stats.hit / total * 100).toFixed(1) + '%' : 'N/A',
      entries: this.store.size,
    };
  }
}

const cdnCache = new CDNCache('Paris-CDG');

// ═══════════════════════════════════════════════════════════
// COUCHE 3 : GÉNÉRATEUR ETAG
// ═══════════════════════════════════════════════════════════

function generateETag(content) {
  return '"' + createHash('md5').update(content).digest('hex').slice(0, 16) + '"';
}

function isNotModified(req, etag) {
  const ifNoneMatch = req.headers['if-none-match'];
  return ifNoneMatch && ifNoneMatch === etag;
}

// ═══════════════════════════════════════════════════════════
// MÉTRIQUES DE PERFORMANCE
// ═══════════════════════════════════════════════════════════

const perfMetrics = {
  requests: [],
  maxEntries: 500,

  add(entry) {
    this.requests.push(entry);
    if (this.requests.length > this.maxEntries) this.requests.shift();
  },

  getReport() {
    const recent = this.requests.slice(-100);
    if (recent.length === 0) return { message: 'Pas de données' };

    const ttfbs = recent.map(r => r.ttfb);
    const avgTtfb = ttfbs.reduce((a, b) => a + b, 0) / ttfbs.length;
    const p95Ttfb = ttfbs.sort((a, b) => a - b)[Math.floor(ttfbs.length * 0.95)];

    const byType = {};
    for (const r of recent) {
      if (!byType[r.type]) byType[r.type] = { count: 0, avgTtfb: 0, sum: 0, hits: 0 };
      byType[r.type].count++;
      byType[r.type].sum += r.ttfb;
      if (r.cacheStatus === 'HIT') byType[r.type].hits++;
    }
    for (const t of Object.keys(byType)) {
      byType[t].avgTtfb = (byType[t].sum / byType[t].count).toFixed(1) + 'ms';
      byType[t].hitRate = (byType[t].hits / byType[t].count * 100).toFixed(1) + '%';
      delete byType[t].sum;
    }

    // Violations budgets
    const violations = [];
    if (avgTtfb > 200) violations.push(`TTFB moyen ${avgTtfb.toFixed(0)}ms > budget 200ms`);
    const globalHitRate = recent.filter(r => r.cacheStatus === 'HIT').length / recent.length * 100;
    if (globalHitRate < 70) violations.push(`Cache hit rate ${globalHitRate.toFixed(0)}% < budget 70%`);

    return {
      totalRequests: recent.length,
      ttfb: { avg: avgTtfb.toFixed(1) + 'ms', p95: p95Ttfb?.toFixed(1) + 'ms' },
      byType,
      violations,
    };
  },
};

// ═══════════════════════════════════════════════════════════
// PAGES ET RENDU
// ═══════════════════════════════════════════════════════════

function renderShell(title, body) {
  return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title} — HTTP Cache Store</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: system-ui, sans-serif; line-height: 1.6; color: #1a1a2e; }
    header { background: #16213e; color: white; padding: 15px 20px; }
    header a { color: #a5b4fc; text-decoration: none; margin-right: 15px; }
    main { max-width: 1000px; margin: 20px auto; padding: 0 20px; }
    .product-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(250px, 1fr)); gap: 20px; }
    .product-card { border: 1px solid #e5e7eb; border-radius: 8px; padding: 20px;
      transition: box-shadow 0.2s; }
    .product-card:hover { box-shadow: 0 4px 12px rgba(0,0,0,0.1); }
    .price { font-size: 1.5em; font-weight: bold; color: #2563eb; }
    .stock { color: #6b7280; font-size: 0.9em; }
    table { border-collapse: collapse; width: 100%; margin: 15px 0; }
    td, th { border: 1px solid #e5e7eb; padding: 10px; text-align: left; }
    th { background: #f9fafb; }
    .good { color: #065f46; background: #ecfdf5; }
    .warn { color: #92400e; background: #fffbeb; }
    .bad { color: #991b1b; background: #fef2f2; }
    .meta { color: #6b7280; font-size: 0.85em; margin-top: 20px; padding-top: 10px;
      border-top: 1px solid #e5e7eb; }
    nav { margin: 20px 0; }
    nav a { display: inline-block; padding: 8px 16px; margin-right: 8px;
      background: #eff6ff; color: #2563eb; border-radius: 4px; text-decoration: none; }
    h1, h2 { margin: 20px 0 10px; }
    .search { padding: 10px; width: 100%; max-width: 400px; border: 1px solid #e5e7eb;
      border-radius: 4px; font-size: 1em; }
  </style>
</head>
<body>
  <header>
    <a href="/"><strong>HTTP Cache Store</strong></a>
    <a href="/products">Produits</a>
    <a href="/search?q=">Recherche</a>
    <a href="/dashboard">Dashboard</a>
    <a href="/perf">Performance</a>
    <a href="/cache-status">Cache Status</a>
  </header>
  <main>
    ${body}
  </main>
</body>
</html>`;
}

// ═══════════════════════════════════════════════════════════
// ROUTES
// ═══════════════════════════════════════════════════════════

async function handleRequest(req, res) {
  const start = process.hrtime.bigint();
  const url = new URL(req.url, 'http://localhost');
  let cacheStatus = 'MISS';
  let resourceType = 'html';

  // ─── CDN Cache Check ───
  const cdnResult = cdnCache.get(url.pathname);
  if (cdnResult) {
    const ttfb = Number(process.hrtime.bigint() - start) / 1_000_000;
    perfMetrics.add({ path: url.pathname, ttfb, cacheStatus: cdnResult.status, type: 'cdn', timestamp: Date.now() });

    res.writeHead(200, {
      'Content-Type': 'text/html; charset=utf-8',
      'X-Cache': `CDN-${cdnResult.status}`,
      'X-CDN-Location': cdnCache.location,
      'Age': String(cdnResult.age),
      'Server-Timing': `ttfb;dur=${ttfb.toFixed(2)};desc="CDN ${cdnResult.status}"`,
    });
    res.end(cdnResult.body);
    return;
  }

  // ─── PAGE D'ACCUEIL (SSG simulé) ───
  if (url.pathname === '/' || url.pathname === '/index.html') {
    const cacheKey = 'page:home';
    let html = appCache.get(cacheKey);

    if (!html) {
      const featuredProducts = await simulateDBQuery(products.slice(0, 4), 30);
      const productCards = featuredProducts.map(p => `
        <div class="product-card">
          <h3><a href="/product/${p.id}">${p.name}</a></h3>
          <p class="price">${p.price.toFixed(2)} EUR</p>
          <p class="stock">${p.stock} en stock</p>
        </div>`).join('');

      html = renderShell('Accueil', `
        <h1>Bienvenue sur HTTP Cache Store</h1>
        <p>La boutique qui met en cache ses connaissances.</p>
        <h2>Produits vedettes</h2>
        <div class="product-grid">${productCards}</div>
      `);

      appCache.set(cacheKey, html, 300); // Cache 5 min (SSG)
      cacheStatus = 'MISS';
    } else {
      cacheStatus = 'HIT';
    }

    const etag = generateETag(html);
    if (isNotModified(req, etag)) {
      const ttfb = Number(process.hrtime.bigint() - start) / 1_000_000;
      perfMetrics.add({ path: url.pathname, ttfb, cacheStatus: '304', type: 'html', timestamp: Date.now() });
      res.writeHead(304, { 'ETag': etag });
      res.end();
      return;
    }

    const cc = 'public, max-age=0, s-maxage=300, stale-while-revalidate=3600';
    cdnCache.set(url.pathname, html, cc);

    const ttfb = Number(process.hrtime.bigint() - start) / 1_000_000;
    perfMetrics.add({ path: url.pathname, ttfb, cacheStatus, type: 'html', timestamp: Date.now() });

    res.writeHead(200, {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': cc,
      'ETag': etag,
      'X-Cache': `APP-${cacheStatus}`,
      'X-Render-Strategy': 'SSG',
      'Server-Timing': `ttfb;dur=${ttfb.toFixed(2)};desc="origin ${cacheStatus}"`,
    });
    res.end(html);
    return;
  }

  // ─── PAGE PRODUIT (ISR simulé) ───
  if (url.pathname.startsWith('/product/')) {
    resourceType = 'html';
    const productId = url.pathname.split('/')[2];
    const cacheKey = `page:product:${productId}`;
    let html = appCache.get(cacheKey);

    if (!html) {
      const product = await simulateDBQuery(products.find(p => p.id === productId), 80);

      if (!product) {
        res.writeHead(404, { 'Content-Type': 'text/html' });
        res.end(renderShell('404', '<h1>Produit non trouvé</h1>'));
        return;
      }

      html = renderShell(product.name, `
        <nav><a href="/">Accueil</a> <a href="/products">Produits</a></nav>
        <h1>${product.name}</h1>
        <p class="price">${product.price.toFixed(2)} EUR</p>
        <p class="stock">${product.stock} en stock</p>
        <p>Catégorie : ${product.category}</p>
        <div class="meta">
          <p>Stratégie : ISR (revalidation toutes les 60s)</p>
          <p>Généré à : ${new Date().toISOString()}</p>
        </div>
      `);

      appCache.set(cacheKey, html, 60); // ISR : 60s
      cacheStatus = 'MISS';
    } else {
      cacheStatus = 'HIT';
    }

    const cc = 'public, max-age=0, s-maxage=60, stale-while-revalidate=600';
    cdnCache.set(url.pathname, html, cc);

    const ttfb = Number(process.hrtime.bigint() - start) / 1_000_000;
    perfMetrics.add({ path: url.pathname, ttfb, cacheStatus, type: resourceType, timestamp: Date.now() });

    res.writeHead(200, {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': cc,
      'ETag': generateETag(html),
      'X-Cache': `APP-${cacheStatus}`,
      'X-Render-Strategy': 'ISR-60s',
      'Server-Timing': `ttfb;dur=${ttfb.toFixed(2)}`,
    });
    res.end(html);
    return;
  }

  // ─── LISTE DE PRODUITS ───
  if (url.pathname === '/products') {
    const category = url.searchParams.get('cat');
    const cacheKey = `page:products:${category || 'all'}`;
    let html = appCache.get(cacheKey);

    if (!html) {
      let filtered = products;
      if (category) {
        filtered = await simulateDBQuery(products.filter(p => p.category === category), 40);
      } else {
        filtered = await simulateDBQuery(products, 30);
      }

      const categories = [...new Set(products.map(p => p.category))];
      const catLinks = categories.map(c =>
        `<a href="/products?cat=${c}" ${c === category ? 'style="font-weight:bold"' : ''}>${c}</a>`
      ).join(' ');

      const productCards = filtered.map(p => `
        <div class="product-card">
          <h3><a href="/product/${p.id}">${p.name}</a></h3>
          <p class="price">${p.price.toFixed(2)} EUR</p>
          <p class="stock">${p.stock} en stock</p>
          <p style="color:#6b7280; font-size:0.85em;">${p.category}</p>
        </div>`).join('');

      html = renderShell('Produits', `
        <h1>Tous les produits ${category ? `(${category})` : ''}</h1>
        <nav><a href="/products">Tous</a> ${catLinks}</nav>
        <div class="product-grid">${productCards}</div>
        <p class="meta">${filtered.length} produit(s)</p>
      `);

      appCache.set(cacheKey, html, 120);
      cacheStatus = 'MISS';
    } else {
      cacheStatus = 'HIT';
    }

    const ttfb = Number(process.hrtime.bigint() - start) / 1_000_000;
    perfMetrics.add({ path: url.pathname, ttfb, cacheStatus, type: 'html', timestamp: Date.now() });

    res.writeHead(200, {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'public, max-age=0, s-maxage=120, stale-while-revalidate=600',
      'X-Cache': `APP-${cacheStatus}`,
      'Server-Timing': `ttfb;dur=${ttfb.toFixed(2)}`,
    });
    res.end(html);
    return;
  }

  // ─── API RECHERCHE (SSR + cache court) ───
  if (url.pathname === '/search') {
    const query = (url.searchParams.get('q') || '').toLowerCase();
    resourceType = 'api';

    if (req.headers.accept?.includes('application/json')) {
      const cacheKey = `api:search:${query}`;
      let results = appCache.get(cacheKey);

      if (!results) {
        results = await simulateDBQuery(
          products.filter(p =>
            p.name.toLowerCase().includes(query) || p.category.includes(query)
          ),
          60
        );
        appCache.set(cacheKey, results, 30); // Cache API : 30s
        cacheStatus = 'MISS';
      } else {
        cacheStatus = 'HIT';
      }

      const ttfb = Number(process.hrtime.bigint() - start) / 1_000_000;
      perfMetrics.add({ path: url.pathname, ttfb, cacheStatus, type: resourceType, timestamp: Date.now() });

      const body = JSON.stringify({ query, results, count: results.length });

      res.writeHead(200, {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=0, s-maxage=30, stale-while-revalidate=300',
        'X-Cache': cacheStatus,
        'Server-Timing': `ttfb;dur=${ttfb.toFixed(2)}`,
      });
      res.end(body);
      return;
    }

    // Page HTML de recherche
    const html = renderShell('Recherche', `
      <h1>Recherche</h1>
      <input class="search" type="text" id="q" value="${query}" placeholder="Chercher un produit...">
      <div id="results"></div>
      <script>
        const q = document.getElementById('q');
        const results = document.getElementById('results');
        let timeout;
        async function search() {
          const resp = await fetch('/search?q=' + encodeURIComponent(q.value), {
            headers: { 'Accept': 'application/json' }
          });
          const data = await resp.json();
          const cache = resp.headers.get('x-cache');
          results.innerHTML = '<p>' + data.count + ' résultat(s) [Cache: ' + cache + ']</p>' +
            data.results.map(p =>
              '<div class="product-card"><h3><a href="/product/' + p.id + '">' +
              p.name + '</a></h3><p class="price">' + p.price.toFixed(2) + ' EUR</p></div>'
            ).join('');
        }
        q.addEventListener('input', () => { clearTimeout(timeout); timeout = setTimeout(search, 300); });
        if (q.value) search();
      </script>
    `);

    res.writeHead(200, {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-cache',
    });
    res.end(html);
    return;
  }

  // ─── DASHBOARD UTILISATEUR (SSR dynamique, pas de cache CDN) ───
  if (url.pathname === '/dashboard') {
    // Simuler des données utilisateur
    await simulateDBQuery(null, 100);

    const html = renderShell('Dashboard', `
      <h1>Dashboard utilisateur</h1>
      <p><em>Stratégie : SSR dynamique (private, no-store)</em></p>
      <p>Cette page est générée à chaque requête et ne doit JAMAIS être cachée
         sur un CDN car elle contient des données personnalisées.</p>
      <table>
        <tr><th>Donnée</th><th>Valeur</th></tr>
        <tr><td>Session ID</td><td>${Math.random().toString(36).slice(2, 10)}</td></tr>
        <tr><td>Dernière connexion</td><td>${new Date().toISOString()}</td></tr>
        <tr><td>Panier</td><td>${Math.floor(Math.random() * 5)} articles</td></tr>
      </table>
    `);

    const ttfb = Number(process.hrtime.bigint() - start) / 1_000_000;
    perfMetrics.add({ path: url.pathname, ttfb, cacheStatus: 'BYPASS', type: 'html', timestamp: Date.now() });

    res.writeHead(200, {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'private, no-store, no-cache, must-revalidate',
      'Vary': 'Cookie, Authorization',
      'X-Cache': 'BYPASS',
      'X-Render-Strategy': 'SSR-dynamic',
      'Server-Timing': `ttfb;dur=${ttfb.toFixed(2)};desc="SSR dynamic"`,
    });
    res.end(html);
    return;
  }

  // ─── PERFORMANCE REPORT ───
  if (url.pathname === '/perf') {
    const report = perfMetrics.getReport();
    const appStats = appCache.getStats();
    const cdnStats = cdnCache.getStats();

    const html = renderShell('Performance', `
      <h1>Rapport de Performance</h1>

      <h2>Métriques TTFB</h2>
      <table>
        <tr><th>Métrique</th><th>Valeur</th></tr>
        <tr><td>TTFB moyen</td><td><strong>${report.ttfb?.avg || 'N/A'}</strong></td></tr>
        <tr><td>TTFB P95</td><td>${report.ttfb?.p95 || 'N/A'}</td></tr>
        <tr><td>Requêtes mesurées</td><td>${report.totalRequests || 0}</td></tr>
      </table>

      <h2>Par type de ressource</h2>
      <table>
        <tr><th>Type</th><th>Requêtes</th><th>TTFB moyen</th><th>Hit Rate</th></tr>
        ${Object.entries(report.byType || {}).map(([type, data]) =>
          `<tr><td>${type}</td><td>${data.count}</td><td>${data.avgTtfb}</td><td>${data.hitRate}</td></tr>`
        ).join('')}
      </table>

      <h2>Cache applicatif (mémoire)</h2>
      <table>
        <tr><th>Métrique</th><th>Valeur</th></tr>
        <tr><td>Hit Rate</td><td><strong>${appStats.hitRate}</strong></td></tr>
        <tr><td>Hits / Misses</td><td>${appStats.hit} / ${appStats.miss}</td></tr>
        <tr><td>Entrées en cache</td><td>${appStats.size} / ${appStats.maxSize}</td></tr>
        <tr><td>Évictions LRU</td><td>${appStats.evictions}</td></tr>
      </table>

      <h2>Cache CDN (${cdnStats.location})</h2>
      <table>
        <tr><th>Métrique</th><th>Valeur</th></tr>
        <tr><td>Hit Rate</td><td><strong>${cdnStats.hitRate}</strong></td></tr>
        <tr><td>HIT / STALE / MISS</td><td>${cdnStats.hit} / ${cdnStats.stale} / ${cdnStats.miss}</td></tr>
        <tr><td>Entrées</td><td>${cdnStats.entries}</td></tr>
      </table>

      <h2>Violations de budgets</h2>
      ${(report.violations?.length || 0) === 0
        ? '<p class="good" style="padding:10px;">Aucune violation</p>'
        : report.violations.map(v => `<p class="bad" style="padding:10px;">${v}</p>`).join('')}

      <h2>Récapitulatif des stratégies de cache</h2>
      <table>
        <tr><th>Page</th><th>Stratégie</th><th>Cache-Control</th></tr>
        <tr><td>/ (accueil)</td><td>SSG</td><td>s-maxage=300, swr=3600</td></tr>
        <tr><td>/product/:id</td><td>ISR (60s)</td><td>s-maxage=60, swr=600</td></tr>
        <tr><td>/products</td><td>ISR (120s)</td><td>s-maxage=120, swr=600</td></tr>
        <tr><td>/search (API)</td><td>SSR + cache</td><td>s-maxage=30, swr=300</td></tr>
        <tr><td>/dashboard</td><td>SSR dynamique</td><td>private, no-store</td></tr>
        <tr><td>/perf</td><td>SSR dynamique</td><td>no-cache</td></tr>
      </table>

      <p class="meta">Rapport généré à ${new Date().toISOString()}</p>
      <p><a href="/perf/json">Voir en JSON</a> | <a href="/perf/prometheus">Format Prometheus</a></p>
    `);

    res.writeHead(200, {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-cache',
    });
    res.end(html);
    return;
  }

  // ─── PERF JSON ───
  if (url.pathname === '/perf/json') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      performance: perfMetrics.getReport(),
      appCache: appCache.getStats(),
      cdnCache: cdnCache.getStats(),
    }, null, 2));
    return;
  }

  // ─── PERF PROMETHEUS ───
  if (url.pathname === '/perf/prometheus') {
    const app = appCache.getStats();
    const cdn = cdnCache.getStats();
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end(`# HELP app_cache_hits_total Application cache hits
# TYPE app_cache_hits_total counter
app_cache_hits_total ${app.hit}

# HELP app_cache_misses_total Application cache misses
# TYPE app_cache_misses_total counter
app_cache_misses_total ${app.miss}

# HELP cdn_cache_hits_total CDN cache hits
# TYPE cdn_cache_hits_total counter
cdn_cache_hits_total ${cdn.hit}

# HELP cdn_cache_stale_total CDN stale responses
# TYPE cdn_cache_stale_total counter
cdn_cache_stale_total ${cdn.stale}

# HELP cdn_cache_misses_total CDN cache misses
# TYPE cdn_cache_misses_total counter
cdn_cache_misses_total ${cdn.miss}

# HELP app_cache_entries Current app cache entries
# TYPE app_cache_entries gauge
app_cache_entries ${app.size}
`);
    return;
  }

  // ─── CACHE STATUS (inspection du cache) ───
  if (url.pathname === '/cache-status') {
    const entries = [];
    for (const [key, entry] of appCache.store) {
      const age = Math.floor((Date.now() - entry.createdAt) / 1000);
      const ttl = Math.floor((entry.expiresAt - Date.now()) / 1000);
      entries.push({ key, age: `${age}s`, ttl: `${Math.max(0, ttl)}s`, size: `${(entry.value?.length || 0)} chars` });
    }

    const html = renderShell('Cache Status', `
      <h1>Inspection du Cache</h1>
      <h2>Cache applicatif (${appCache.store.size} entrées)</h2>
      <table>
        <tr><th>Clé</th><th>Age</th><th>TTL restant</th><th>Taille</th></tr>
        ${entries.map(e => `<tr><td><code>${e.key}</code></td><td>${e.age}</td><td>${e.ttl}</td><td>${e.size}</td></tr>`).join('')}
        ${entries.length === 0 ? '<tr><td colspan="4">Cache vide</td></tr>' : ''}
      </table>

      <h2>Actions</h2>
      <p>
        <button onclick="fetch('/api/purge?pattern=product', {method:'POST'}).then(r=>r.json()).then(d=>{alert('Purgé: '+d.purged);location.reload()})">
          Purger les produits
        </button>
        <button onclick="fetch('/api/purge?pattern=', {method:'POST'}).then(r=>r.json()).then(d=>{alert('Purgé: '+d.purged);location.reload()})">
          Purger tout
        </button>
      </p>
    `);

    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(html);
    return;
  }

  // ─── API PURGE ───
  if (req.method === 'POST' && url.pathname === '/api/purge') {
    const pattern = url.searchParams.get('pattern') || '';
    const purged = appCache.invalidate(pattern);
    // Aussi purger le CDN cache
    for (const key of cdnCache.store.keys()) {
      if (key.includes(pattern)) cdnCache.store.delete(key);
    }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ purged, pattern }));
    return;
  }

  // ─── 404 ───
  res.writeHead(404, { 'Content-Type': 'text/html' });
  res.end(renderShell('404', '<h1>404 — Page non trouvée</h1><p><a href="/">Retour à l\'accueil</a></p>'));
}

// ═══════════════════════════════════════════════════════════
// SERVEUR
// ═══════════════════════════════════════════════════════════

const server = createServer(handleRequest);

server.listen(3000, () => {
  console.log('='.repeat(60));
  console.log('  PROJET FINAL — HTTP Cache Store');
  console.log('='.repeat(60));
  console.log('');
  console.log('  Application    → http://localhost:3000');
  console.log('  Produits       → http://localhost:3000/products');
  console.log('  Recherche      → http://localhost:3000/search');
  console.log('  Dashboard      → http://localhost:3000/dashboard');
  console.log('  Performance    → http://localhost:3000/perf');
  console.log('  Cache Status   → http://localhost:3000/cache-status');
  console.log('  JSON metrics   → http://localhost:3000/perf/json');
  console.log('  Prometheus     → http://localhost:3000/perf/prometheus');
  console.log('');
  console.log('  Stratégies :');
  console.log('  - Accueil      : SSG (s-maxage=300)');
  console.log('  - Produit      : ISR (s-maxage=60)');
  console.log('  - Recherche    : SSR + cache API (s-maxage=30)');
  console.log('  - Dashboard    : SSR dynamique (private, no-store)');
  console.log('='.repeat(60));
});
```

---

## 2. Design d'architecture cache multi-couches

### 2.1 Diagramme complet de l'architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                 Architecture Cache Multi-Couches                     │
│                                                                       │
│  ┌──────────────┐                                                    │
│  │  Navigateur   │  Couche 1 : Cache HTTP navigateur                 │
│  │  (Cache-Ctrl) │  • Cache-Control: max-age, immutable             │
│  │  + Service    │  • ETag / If-None-Match → 304                    │
│  │    Worker     │  • Service Worker pour offline                    │
│  └──────┬───────┘                                                    │
│         │                                                             │
│         ▼                                                             │
│  ┌──────────────┐                                                    │
│  │   CDN Edge    │  Couche 2 : Cache CDN/Edge                       │
│  │  (Cloudflare/ │  • s-maxage, CDN-Cache-Control                   │
│  │   Fastly)     │  • stale-while-revalidate                        │
│  │              │  • Cache tags pour purge ciblée                    │
│  │  + Edge      │  • Edge functions (A/B, geo, auth)                │
│  │    Functions  │                                                    │
│  └──────┬───────┘                                                    │
│         │                                                             │
│         ▼                                                             │
│  ┌──────────────┐                                                    │
│  │  Reverse     │  Couche 3 : Reverse proxy / Load balancer         │
│  │  Proxy       │  • Varnish, nginx, HAProxy                        │
│  │  (Varnish)   │  • Cache applicatif (ESI, fragments)              │
│  └──────┬───────┘                                                    │
│         │                                                             │
│         ▼                                                             │
│  ┌──────────────┐                                                    │
│  │  Application  │  Couche 4 : Cache applicatif                     │
│  │  Server       │  • In-memory (Map, LRU)                          │
│  │  (Node.js)    │  • Redis / Memcached                             │
│  │              │  • ISR (regénération incrémentale)                 │
│  └──────┬───────┘                                                    │
│         │                                                             │
│         ▼                                                             │
│  ┌──────────────┐                                                    │
│  │  Base de     │  Couche 5 : Cache base de données                 │
│  │  données     │  • Query cache                                     │
│  │  (PostgreSQL)│  • Materialized views                              │
│  │              │  • Connection pooling                              │
│  └──────────────┘                                                    │
│                                                                       │
│  Chaque couche a sa propre stratégie de TTL et d'invalidation.       │
└─────────────────────────────────────────────────────────────────────┘
```

### 2.2 Matrice de décision par type de contenu

| Contenu | Navigateur | CDN Edge | App Cache | Stratégie |
|---------|-----------|----------|-----------|-----------|
| Assets hashés (CSS, JS) | `immutable, 1 an` | `1 an` | N/A | Cache permanent, invalidation par changement d'URL |
| Images produit | `max-age=1j` | `s-maxage=7j` | N/A | Cache long, purge on-demand |
| Page produit (ISR) | `no-cache` | `s-maxage=60, swr=600` | `TTL=60s` | ISR avec stale-while-revalidate |
| API recherche | `no-cache` | `s-maxage=30, swr=300` | `TTL=30s` | Cache court, forte variation |
| Dashboard utilisateur | `private, no-store` | PAS DE CACHE | N/A | SSR dynamique, jamais caché |
| Page d'accueil (SSG) | `no-cache + ETag` | `s-maxage=300, swr=3600` | `TTL=300s` | SSG avec revalidation longue |

---

## 3. Tests de la chaîne complète

### 3.1 Script de test automatisé

```js
// test-cache-chain.mjs — Tests de la chaîne de cache complète
import { request } from 'node:http';

const BASE = 'http://localhost:3000';

// --- Utilitaire de requête HTTP ---
function httpGet(path, headers = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE);
    const req = request(url, { method: 'GET', headers }, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => resolve({
        status: res.statusCode,
        headers: res.headers,
        body,
      }));
    });
    req.on('error', reject);
    req.end();
  });
}

function httpPost(path) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE);
    const req = request(url, { method: 'POST' }, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => resolve({ status: res.statusCode, body }));
    });
    req.on('error', reject);
    req.end();
  });
}

// --- Tests ---
let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`  ✅ ${message}`);
    passed++;
  } else {
    console.log(`  ❌ ${message}`);
    failed++;
  }
}

async function runTests() {
  console.log('\n═══════════════════════════════════════════');
  console.log('  Tests de la chaîne de cache complète');
  console.log('═══════════════════════════════════════════\n');

  // --- Test 1 : Page d'accueil (SSG) ---
  console.log('📋 Test 1 : Page d\'accueil (SSG)');
  const home1 = await httpGet('/');
  assert(home1.status === 200, 'Status 200');
  assert(home1.headers['cache-control']?.includes('s-maxage=300'), 'Cache-Control contient s-maxage=300');
  assert(home1.headers['x-cache'] === 'APP-MISS', 'Premier accès = MISS');
  assert(home1.headers['etag'] !== undefined, 'ETag présent');
  assert(home1.headers['x-render-strategy'] === 'SSG', 'Stratégie = SSG');

  const home2 = await httpGet('/');
  assert(home2.headers['x-cache']?.includes('HIT'), 'Deuxième accès = HIT (app ou CDN)');

  // Test 304 Not Modified
  const etag = home1.headers['etag'];
  const home3 = await httpGet('/', { 'If-None-Match': etag });
  assert(home3.status === 304, 'ETag valide → 304 Not Modified');

  // --- Test 2 : Page produit (ISR) ---
  console.log('\n📋 Test 2 : Page produit (ISR)');
  const prod1 = await httpGet('/product/cdn-pro');
  assert(prod1.status === 200, 'Status 200');
  assert(prod1.headers['cache-control']?.includes('s-maxage=60'), 'ISR : s-maxage=60');
  assert(prod1.headers['x-render-strategy'] === 'ISR-60s', 'Stratégie = ISR-60s');

  const prod2 = await httpGet('/product/cdn-pro');
  assert(prod2.headers['x-cache']?.includes('HIT'), 'ISR cache HIT au 2e accès');

  // --- Test 3 : Produit inexistant ---
  console.log('\n📋 Test 3 : Produit inexistant');
  const prod404 = await httpGet('/product/inexistant');
  assert(prod404.status === 404, 'Produit inexistant → 404');

  // --- Test 4 : API Recherche (cache court) ---
  console.log('\n📋 Test 4 : API Recherche');
  const search1 = await httpGet('/search?q=cdn', { 'Accept': 'application/json' });
  assert(search1.status === 200, 'Status 200');
  assert(search1.headers['content-type']?.includes('application/json'), 'Content-Type JSON');
  assert(search1.headers['cache-control']?.includes('s-maxage=30'), 'API : s-maxage=30');

  const searchData = JSON.parse(search1.body);
  assert(searchData.results.length > 0, 'Résultats trouvés pour "cdn"');

  const search2 = await httpGet('/search?q=cdn', { 'Accept': 'application/json' });
  assert(search2.headers['x-cache'] === 'HIT', 'Recherche en cache au 2e appel');

  // --- Test 5 : Dashboard (SSR dynamique, pas de cache) ---
  console.log('\n📋 Test 5 : Dashboard (SSR dynamique)');
  const dash1 = await httpGet('/dashboard');
  assert(dash1.status === 200, 'Status 200');
  assert(dash1.headers['cache-control']?.includes('private'), 'Cache-Control = private');
  assert(dash1.headers['cache-control']?.includes('no-store'), 'Cache-Control inclut no-store');
  assert(dash1.headers['x-cache'] === 'BYPASS', 'Dashboard = BYPASS (pas de cache)');
  assert(dash1.headers['vary']?.includes('Cookie'), 'Vary inclut Cookie');

  const dash2 = await httpGet('/dashboard');
  assert(dash2.headers['x-cache'] === 'BYPASS', 'Dashboard reste BYPASS au 2e accès');

  // --- Test 6 : Purge ---
  console.log('\n📋 Test 6 : Purge du cache');
  // Populer le cache
  await httpGet('/product/cache-expert');
  const beforePurge = await httpGet('/product/cache-expert');
  assert(beforePurge.headers['x-cache']?.includes('HIT'), 'Produit en cache avant purge');

  // Purger
  const purge = await httpPost('/api/purge?pattern=product');
  const purgeData = JSON.parse(purge.body);
  assert(purgeData.purged > 0, `Purge effectuée (${purgeData.purged} entrées)`);

  const afterPurge = await httpGet('/product/cache-expert');
  assert(afterPurge.headers['x-cache'] === 'APP-MISS', 'Après purge = MISS');

  // --- Test 7 : Performance endpoint ---
  console.log('\n📋 Test 7 : Endpoints de monitoring');
  const perf = await httpGet('/perf/json');
  assert(perf.status === 200, '/perf/json accessible');
  const perfData = JSON.parse(perf.body);
  assert(perfData.appCache !== undefined, 'App cache stats présentes');
  assert(perfData.cdnCache !== undefined, 'CDN cache stats présentes');

  const prom = await httpGet('/perf/prometheus');
  assert(prom.status === 200, '/perf/prometheus accessible');
  assert(prom.body.includes('app_cache_hits_total'), 'Métriques Prometheus présentes');

  // --- Test 8 : Server-Timing ---
  console.log('\n📋 Test 8 : Server-Timing headers');
  const timing = await httpGet('/product/edge-starter');
  assert(timing.headers['server-timing'] !== undefined, 'Server-Timing header présent');
  assert(timing.headers['server-timing'].includes('ttfb'), 'Server-Timing contient ttfb');

  // --- Résumé ---
  console.log('\n═══════════════════════════════════════════');
  console.log(`  Résultats : ${passed} passés, ${failed} échoués`);
  console.log(`  Total : ${passed + failed} tests`);
  console.log('═══════════════════════════════════════════\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch(err => {
  console.error('Erreur durant les tests:', err);
  process.exit(1);
});
```

---

## 4. Puzzles d'ordonnancement

### 4.1 Puzzle 1 : Dans quel ordre les caches répondent-ils ?

```
Scénario : Un utilisateur à Tokyo accède à /product/cdn-pro
Le cache CDN à Tokyo est VIDE.
Le cache applicatif a la page (TTL non expiré).

Question : décris le chemin complet de la requête.

Réponse attendue :
1. Navigateur → vérifie son cache local → MISS (première visite)
2. → Requête vers CDN Edge (Tokyo) → MISS (cache vide)
3. → Requête vers le serveur d'origine
4. → Serveur vérifie le cache applicatif → HIT
5. → Répond avec Cache-Control: s-maxage=60, stale-while-revalidate=600
6. → CDN Edge (Tokyo) stocke la réponse dans son cache
7. → Navigateur reçoit la réponse, stocke selon max-age
8. Prochaine requête du même utilisateur → Cache navigateur HIT
9. Prochaine requête d'un AUTRE utilisateur à Tokyo → CDN Edge HIT
```

### 4.2 Puzzle 2 : Invalidation en cascade

```
Scénario : Un produit est mis à jour dans le CMS.
Il faut invalider le cache à TOUS les niveaux.

Question : dans quel ordre invalider ?

Réponse attendue (du plus éloigné au plus proche de l'utilisateur) :
1. Base de données → mise à jour des données
2. Cache applicatif → purge la clé "page:product:xxx"
3. Cache CDN → purge par cache tag ("product:xxx")
4. Navigateur → NE PEUT PAS être invalidé directement
   → Solution : le prochain accès fera un revalidate (max-age=0, ETag)
   → Ou utiliser une URL versionnée (/product/xxx?v=2)

Piège : si tu invalides le CDN AVANT le cache applicatif,
le CDN va re-fetcher la version CACHÉE (ancienne) du cache applicatif !
Toujours invalider de l'intérieur vers l'extérieur.
```

### 4.3 Puzzle 3 : Le problème du cache stampede

```
Scénario : Un article viral reçoit 10 000 requêtes/seconde.
Le cache ISR expire à t=60s.

Question : que se passe-t-il à t=61s ?

Réponse SANS protection :
- 10 000 requêtes arrivent simultanément
- Toutes voient un cache expiré → MISS
- 10 000 requêtes sont envoyées au serveur d'origine
- Le serveur s'écroule sous la charge → "cache stampede" / "thundering herd"

Réponse AVEC protection (stale-while-revalidate) :
- 10 000 requêtes arrivent à t=61s
- Toutes reçoivent la version STALE (ancienne mais rapide)
- UNE SEULE requête de revalidation est envoyée à l'origine
- À t=62s, le cache est mis à jour
- Les requêtes suivantes reçoivent la nouvelle version
```

---

## 5. Debugging de performance end-to-end

### 5.1 Checklist de debugging

```
┌─────────────────────────────────────────────────────────────┐
│           Checklist de debugging performance                  │
│                                                               │
│  □ TTFB élevé ?                                              │
│    ├─ Vérifier X-Cache header (HIT/MISS/STALE)              │
│    ├─ Vérifier Server-Timing pour le détail                  │
│    ├─ Cache-Control correctement configuré ?                 │
│    └─ CDN activé et configuré ?                              │
│                                                               │
│  □ LCP lent ?                                                │
│    ├─ Image hero préchargée ? (<link rel="preload">)         │
│    ├─ Image au bon format ? (WebP, AVIF)                    │
│    ├─ Image en cache ? (Cache-Control: max-age)             │
│    └─ fetchpriority="high" sur l'image LCP ?                │
│                                                               │
│  □ CLS élevé ?                                               │
│    ├─ Images avec width/height explicites ?                  │
│    ├─ Polices préchargées ? (font-display: swap)            │
│    └─ Pas de contenu injecté dynamiquement au-dessus ?      │
│                                                               │
│  □ INP mauvais ?                                             │
│    ├─ JavaScript trop lourd ? (bundle < 300KB)              │
│    ├─ Event handlers efficaces ?                             │
│    └─ Long tasks sur le main thread ?                        │
│                                                               │
│  □ Cache hit rate faible ?                                   │
│    ├─ Vary trop large ? (Vary: * = pas de cache)            │
│    ├─ TTL trop court ?                                       │
│    ├─ Query strings aléatoires ? (?t=timestamp)             │
│    └─ Cookies qui varient le cache ?                         │
└─────────────────────────────────────────────────────────────┘
```

### 5.2 Outil de diagnostic automatique

```js
// diagnostic.mjs — Outil de diagnostic de cache
import { request } from 'node:http';

const url = process.argv[2] || 'http://localhost:3000/';

function httpGet(targetUrl, headers = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(targetUrl);
    const req = request(u, { headers }, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body, size: body.length }));
    });
    req.on('error', reject);
    req.end();
  });
}

async function diagnose() {
  console.log(`\nDiagnostic de : ${url}\n${'─'.repeat(60)}`);

  // Requête 1 : cold cache
  const start1 = Date.now();
  const r1 = await httpGet(url);
  const ttfb1 = Date.now() - start1;

  // Requête 2 : warm cache
  const start2 = Date.now();
  const r2 = await httpGet(url);
  const ttfb2 = Date.now() - start2;

  // Requête 3 : avec ETag (conditional)
  const etag = r1.headers['etag'];
  let r3 = null;
  if (etag) {
    const start3 = Date.now();
    r3 = await httpGet(url, { 'If-None-Match': etag });
  }

  // Analyse
  console.log('\n📊 Résultats :');
  console.log(`  Status         : ${r1.status}`);
  console.log(`  Taille         : ${(r1.size / 1024).toFixed(1)} KB`);
  console.log(`  TTFB (cold)    : ${ttfb1}ms`);
  console.log(`  TTFB (warm)    : ${ttfb2}ms`);
  console.log(`  Gain cache     : ${((1 - ttfb2 / ttfb1) * 100).toFixed(0)}%`);

  console.log('\n📋 En-têtes de cache :');
  const cc = r1.headers['cache-control'] || '(absent)';
  console.log(`  Cache-Control  : ${cc}`);
  console.log(`  ETag           : ${etag || '(absent)'}`);
  console.log(`  X-Cache        : ${r1.headers['x-cache'] || '(absent)'}`);
  console.log(`  Age            : ${r1.headers['age'] || '(absent)'}`);
  console.log(`  Vary           : ${r1.headers['vary'] || '(absent)'}`);
  console.log(`  Server-Timing  : ${r1.headers['server-timing'] || '(absent)'}`);

  if (r3) {
    console.log(`\n📋 Revalidation conditionnelle :`);
    console.log(`  ETag envoyé    : ${etag}`);
    console.log(`  Réponse        : ${r3.status} ${r3.status === 304 ? '(Not Modified - OK)' : '(Full response)'}`);
  }

  // Recommandations
  console.log('\n💡 Recommandations :');

  if (!r1.headers['cache-control']) {
    console.log('  ⚠️  Ajouter un en-tête Cache-Control');
  }
  if (!etag && !r1.headers['last-modified']) {
    console.log('  ⚠️  Ajouter un ETag ou Last-Modified pour la revalidation');
  }
  if (cc.includes('no-store') && !cc.includes('private')) {
    console.log('  ℹ️  no-store sans private : vérifier si c\'est intentionnel');
  }
  if (ttfb1 > 500) {
    console.log('  ⚠️  TTFB > 500ms : envisager un cache plus agressif ou un CDN');
  }
  if (ttfb2 >= ttfb1 * 0.9) {
    console.log('  ⚠️  Pas d\'amélioration au 2e appel : le cache ne fonctionne pas');
  }
  if (r1.size > 100_000) {
    console.log('  ⚠️  Réponse > 100KB : envisager la compression (gzip/brotli)');
  }
  if (!r1.headers['vary'] && cc.includes('public')) {
    console.log('  ℹ️  Pas de Vary sur une ressource publique : vérifier si nécessaire');
  }

  console.log('\n' + '─'.repeat(60));
}

diagnose().catch(console.error);
```

---

## 6. Récapitulatif complet du cours

### 6.1 Les concepts clés par module

| Module | Concept clé | En-tête principal |
|--------|------------|-------------------|
| 1. Fondamentaux HTTP | Requête/Réponse, méthodes, status codes | Tous |
| 2. Cache-Control | Directives de cache | `Cache-Control` |
| 3. ETag & Validation | Revalidation conditionnelle | `ETag`, `If-None-Match` |
| 4. Vary & Négociation | Contenu qui varie par header | `Vary` |
| 5. stale-while-revalidate | Servir le cache périmé pendant la revalidation | `stale-while-revalidate` |
| 6. Cache CDN | Caches partagés distribués | `s-maxage`, `Surrogate-Control` |
| 7. Service Workers | Cache côté client programmable | Cache API |
| 8. Cache invalidation | Purge, tags, versioning | `Cache-Tag`, `Surrogate-Key` |
| 9. Architecture cache | Design patterns multi-couches | Tous combinés |
| 10. Debugging | Outils et techniques de diagnostic | `Server-Timing`, `X-Cache` |
| 11. ISR & SSG | Rendu statique avec regénération | `stale-while-revalidate` |
| 12. Edge Rendering | Compute et cache au edge | `CDN-Cache-Control` |
| 13. HTTP Streaming | Chunked, HTTP/2, Web Streams | `Transfer-Encoding` |
| 14. Performance Web | Core Web Vitals, waterfall | `Server-Timing` |
| 15. Projet Final | Tout ensemble | Tous |

### 6.2 Les 10 règles d'or du caching HTTP

```
┌─────────────────────────────────────────────────────────────┐
│              Les 10 règles d'or du caching HTTP               │
│                                                               │
│  1. TOUJOURS mettre un Cache-Control sur chaque réponse.     │
│     Pas de Cache-Control = comportement imprévisible.        │
│                                                               │
│  2. Utiliser immutable pour les assets avec hash dans l'URL. │
│     /app.a1b2c3.js → Cache-Control: immutable, max-age=1y   │
│                                                               │
│  3. Séparer le cache navigateur du cache CDN.                │
│     max-age pour le navigateur, s-maxage pour le CDN.        │
│                                                               │
│  4. Utiliser stale-while-revalidate partout où c'est         │
│     possible. Ça élimine les cache stampedes.                │
│                                                               │
│  5. Toujours ajouter un ETag ou Last-Modified.               │
│     La revalidation conditionnelle économise de la bande     │
│     passante.                                                 │
│                                                               │
│  6. Utiliser Vary avec parcimonie. Vary: * = pas de cache.   │
│     Vary: Cookie est souvent une mauvaise idée.              │
│                                                               │
│  7. Les données personnalisées sont TOUJOURS                 │
│     Cache-Control: private, no-store.                        │
│     JAMAIS sur un CDN.                                       │
│                                                               │
│  8. Invalider de l'intérieur vers l'extérieur.               │
│     DB → App cache → CDN → (navigateur se revalide seul).   │
│                                                               │
│  9. Mesurer. Toujours. Server-Timing, X-Cache, hit rate.     │
│     Ce qui ne se mesure pas ne s'optimise pas.               │
│                                                               │
│  10. Le meilleur cache est celui qui n'a jamais besoin       │
│      d'être invalidé. Préférer les URLs versionnées.        │
└─────────────────────────────────────────────────────────────┘
```

---

## Points clés

1. Un **audit de performance** suit une méthodologie structurée : mesurer, identifier, prioriser, implémenter, valider, surveiller.
2. L'architecture cache **multi-couches** (navigateur → CDN → reverse proxy → app cache → DB) offre la meilleure combinaison de performance et de fraîcheur.
3. Chaque couche a sa propre **stratégie de TTL et d'invalidation** — il faut les coordonner.
4. Les **tests automatisés** de la chaîne de cache sont essentiels : vérifier les headers, les statuts HIT/MISS, les 304, la purge.
5. Le **cache stampede** (thundering herd) est le pire ennemi d'un cache mal configuré — `stale-while-revalidate` le résout.
6. L'**invalidation doit se faire de l'intérieur vers l'extérieur** : DB → app → CDN → (navigateur se revalide seul).
7. Le **Server-Timing** header est l'outil le plus sous-estimé pour le debugging de performance côté serveur.
8. Les **10 règles d'or** du caching HTTP résument tout le cours : toujours un Cache-Control, immutable pour les assets hashés, séparer navigateur et CDN, mesurer.

---

## Lab associé

→ `labs/15-projet-final/` — Déployer l'application complète, lancer les tests automatisés, optimiser jusqu'à obtenir un cache hit rate > 80% et un TTFB moyen < 100ms, puis démontrer une purge on-demand sans interruption de service.

---

## Pour aller plus loin

- [HTTP Caching - MDN](https://developer.mozilla.org/fr/docs/Web/HTTP/Caching)
- [RFC 9111 — HTTP Caching](https://httpwg.org/specs/rfc9111.html)
- [web.dev — HTTP cache](https://web.dev/http-cache/)
- [Cloudflare Cache documentation](https://developers.cloudflare.com/cache/)
- [Fastly VCL reference](https://developer.fastly.com/reference/vcl/)
- [Varnish Cache documentation](https://varnish-cache.org/docs/)

---

## Si tu es perdu

Pense à **l'ensemble du cours comme une recette de cuisine** :

- Les **modules 1-5** t'ont appris les **ingrédients** : les en-têtes HTTP (Cache-Control, ETag, Vary, stale-while-revalidate). Sans les ingrédients, tu ne peux rien cuisiner.

- Les **modules 6-10** t'ont appris les **techniques de cuisine** : CDN, Service Workers, invalidation, architecture, debugging. Tu sais maintenant utiliser chaque outil.

- Les **modules 11-14** t'ont appris les **recettes avancées** : ISR, edge rendering, streaming, performance Web. Tu sais combiner les techniques pour des plats complexes.

- Ce **module 15** est le **grand banquet final** : tu utilises tous les ingrédients, toutes les techniques, et toutes les recettes pour préparer un repas complet. Et tu as des dégustateurs (les tests) qui vérifient que tout est bon.

Le secret d'un bon chef : **goûter en permanence** (mesurer les métriques).

---

## Défi

### Le grand défi final

En utilisant l'application fournie dans ce module (`projet-final-app.mjs`), réalise les tâches suivantes :

1. **Lance l'application** et exécute les tests (`test-cache-chain.mjs`). Tous les tests doivent passer.

2. **Ajoute un endpoint `/api/products/:id/stock`** qui :
   - Retourne le stock d'un produit en JSON
   - Cache la réponse 10 secondes sur le CDN (s-maxage=10)
   - Utilise stale-while-revalidate=60
   - Supporte le 304 avec ETag

3. **Ajoute le streaming SSR** sur la page d'accueil :
   - Envoie d'abord le shell HTML (header + navigation)
   - Puis les produits vedettes (après le fetch "DB")
   - Mesure le TTFB du premier octet vs le rendu complet

4. **Implémente un endpoint `/api/warmup`** qui :
   - Pré-remplit le cache pour toutes les pages produits
   - Retourne le nombre de pages réchauffées et le temps total

5. **Obtiens un cache hit rate > 85%** sur 100 requêtes consécutives (vérifie via `/perf/json`)

<details>
<summary>Indices</summary>

- Pour le stock API : utilise `generateETag(JSON.stringify(stockData))` et vérifie `If-None-Match`.
- Pour le streaming : utilise `res.write()` pour envoyer le shell immédiatement, puis `await` le fetch avant d'envoyer le reste.
- Pour le warmup : boucle sur tous les produits et appelle `handleRequest` ou accède directement au cache applicatif.
- Pour le hit rate : assure-toi que les pages les plus demandées ont un TTL assez long et que tu ne purges pas trop souvent.

</details>

<details>
<summary>Voir la solution (stock API)</summary>

```js
// Ajouter dans handleRequest, avant le 404 :

if (url.pathname.match(/^\/api\/products\/[\w-]+\/stock$/)) {
  const productId = url.pathname.split('/')[3];
  const product = products.find(p => p.id === productId);

  if (!product) {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Produit non trouvé' }));
    return;
  }

  const stockData = { id: product.id, stock: product.stock, updatedAt: new Date().toISOString() };
  const body = JSON.stringify(stockData);
  const etag = generateETag(body);

  if (isNotModified(req, etag)) {
    res.writeHead(304, { 'ETag': etag });
    res.end();
    return;
  }

  res.writeHead(200, {
    'Content-Type': 'application/json',
    'Cache-Control': 'public, max-age=0, s-maxage=10, stale-while-revalidate=60',
    'ETag': etag,
    'X-Cache': 'DYNAMIC',
  });
  res.end(body);
  return;
}
```

</details>

<details>
<summary>Voir la solution (warmup)</summary>

```js
// Ajouter dans handleRequest :

if (url.pathname === '/api/warmup' && req.method === 'POST') {
  const start = Date.now();
  let warmed = 0;

  for (const product of products) {
    const cacheKey = `page:product:${product.id}`;
    if (!appCache.get(cacheKey)) {
      const html = renderShell(product.name, `
        <h1>${product.name}</h1>
        <p class="price">${product.price.toFixed(2)} EUR</p>
        <p>Stock : ${product.stock}</p>
      `);
      appCache.set(cacheKey, html, 60);
      warmed++;
    }
  }

  const duration = Date.now() - start;
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ warmed, total: products.length, duration: `${duration}ms` }));
  return;
}
```

</details>
