# Module 14 — Performance Web : mesurer, optimiser, surveiller

> **Objectif** : Maîtriser les Core Web Vitals, comprendre le critical rendering path, mettre en place des performance budgets, et mesurer l'impact direct du caching HTTP sur chaque métrique de performance.
> **Difficulté** : ⭐⭐⭐⭐⭐

---

## 1. Core Web Vitals

### 1.1 Les métriques qui comptent

Google utilise les **Core Web Vitals** comme signal de classement SEO. Ce sont les métriques qui mesurent l'expérience utilisateur réelle :

```
┌─────────────────────────────────────────────────────────────────┐
│                    Core Web Vitals (2024+)                       │
│                                                                   │
│  ┌─────────┐    ┌─────────┐    ┌─────────┐    ┌─────────┐      │
│  │  TTFB   │    │   LCP   │    │   INP   │    │   CLS   │      │
│  │         │    │         │    │         │    │         │      │
│  │ Time to │    │ Largest │    │Interact.│    │Cumulat. │      │
│  │ First   │    │Content. │    │ to Next │    │ Layout  │      │
│  │  Byte   │    │  Paint  │    │  Paint  │    │  Shift  │      │
│  │         │    │         │    │         │    │         │      │
│  │ ✅ <800 │    │ ✅ <2.5s│    │ ✅ <200 │    │ ✅ <0.1 │      │
│  │ ⚠️ <1.8s│    │ ⚠️ <4.0s│    │ ⚠️ <500 │    │ ⚠️ <0.25│      │
│  │ ❌ >1.8s│    │ ❌ >4.0s│    │ ❌ >500 │    │ ❌ >0.25│      │
│  └─────────┘    └─────────┘    └─────────┘    └─────────┘      │
│                                                                   │
│  TTFB = réactivité serveur                                       │
│  LCP  = vitesse de chargement perçue                             │
│  INP  = réactivité aux interactions                              │
│  CLS  = stabilité visuelle                                       │
└─────────────────────────────────────────────────────────────────┘
```

**Analogie** : Imagine que tu entres dans un restaurant :
- **TTFB** = le temps avant qu'un serveur vienne te voir (« Bonjour, je vous installe ! »)
- **LCP** = le temps avant que le plat principal arrive sur ta table
- **INP** = le temps de réponse quand tu appelles le serveur (« Un verre d'eau s'il vous plaît ! »)
- **CLS** = si ta table bouge pendant le repas (instabilité visuelle)

### 1.2 TTFB — Time to First Byte

Le TTFB mesure le temps entre l'envoi de la requête HTTP et la réception du **premier octet** de la réponse. C'est la métrique la plus directement impactée par le caching.

```
┌────────┐   DNS    ┌────────┐   TCP    ┌────────┐   TLS    ┌────────┐
│ Client ├─────────▶│  DNS   ├────────▶│  TCP   ├────────▶│  TLS   │
│        │  ~50ms   │Resolver│  ~30ms   │Connect │  ~30ms   │Handshk │
└────────┘          └────────┘          └────────┘          └───┬────┘
                                                                │
          ┌─────────────────────────────────────────────────────┘
          │   HTTP Request
          ▼
    ┌──────────┐  Processing  ┌──────────┐  First Byte  ┌──────────┐
    │  Server  ├─────────────▶│ Response ├──────────────▶│  Client  │
    │ receives │   ~200ms     │ starts   │   ~30ms       │ receives │
    │ request  │              │ sending  │               │ 1st byte │
    └──────────┘              └──────────┘               └──────────┘

    TTFB = DNS + TCP + TLS + Server Processing + Network
    Exemple sans cache : 50 + 30 + 30 + 200 + 30 = ~340ms
    Exemple avec cache CDN : 50 + 30 + 30 + 5 + 5 = ~120ms
```

```js
// ttfb-measurement.mjs — Mesurer et afficher le TTFB
import { createServer } from 'node:http';

// Cache simple pour démontrer l'impact sur le TTFB
const cache = new Map();

// Simule un rendu lent (SSR)
async function slowRender(path) {
  await new Promise(r => setTimeout(r, 300)); // Simule 300ms de rendu
  return `<html><body><h1>Page : ${path}</h1>
    <p>Rendue à ${new Date().toISOString()}</p></body></html>`;
}

const server = createServer(async (req, res) => {
  const start = process.hrtime.bigint();
  const url = new URL(req.url, 'http://localhost');
  const noCache = url.searchParams.has('nocache');

  let html;
  let cacheStatus;

  if (!noCache && cache.has(url.pathname)) {
    html = cache.get(url.pathname);
    cacheStatus = 'HIT';
  } else {
    html = await slowRender(url.pathname);
    cache.set(url.pathname, html);
    cacheStatus = 'MISS';
  }

  const ttfbNs = process.hrtime.bigint() - start;
  const ttfbMs = Number(ttfbNs) / 1_000_000;

  // En-tête Server-Timing (visible dans les DevTools)
  const serverTiming = `ttfb;dur=${ttfbMs.toFixed(2)};desc="Time to First Byte"`;

  res.writeHead(200, {
    'Content-Type': 'text/html; charset=utf-8',
    'X-Cache': cacheStatus,
    'X-TTFB': `${ttfbMs.toFixed(2)}ms`,
    'Server-Timing': serverTiming,
    // Cache-Control selon le statut
    'Cache-Control': noCache ? 'no-store' : 'public, max-age=60',
  });

  res.end(html + `
    <hr>
    <h2>Métriques serveur</h2>
    <table border="1" cellpadding="8">
      <tr><td>TTFB (serveur)</td><td><strong>${ttfbMs.toFixed(2)}ms</strong></td></tr>
      <tr><td>Cache</td><td>${cacheStatus}</td></tr>
      <tr><td>Conseil</td><td>${cacheStatus === 'HIT'
        ? 'Excellent ! Le cache a réduit le TTFB.'
        : 'Premier accès (MISS). Recharge pour voir le HIT.'}</td></tr>
    </table>
    <p>Compare : <a href="${url.pathname}">Avec cache</a> vs <a href="${url.pathname}?nocache">Sans cache</a></p>
  `);

  console.log(`[${cacheStatus}] ${url.pathname} — TTFB: ${ttfbMs.toFixed(2)}ms`);
});

server.listen(3000, () => {
  console.log('TTFB Measurement → http://localhost:3000/page');
});
```

### 1.3 LCP — Largest Contentful Paint

Le LCP mesure quand le **plus grand élément visible** du viewport est rendu. En général, c'est une image hero, un titre h1, ou un bloc de texte.

```
Timeline de rendu :
═══════════════════════════════════════════════════
  0ms     200ms    500ms    1000ms   1500ms   2500ms
  │        │        │        │        │        │
  ├─TTFB──▶│        │        │        │        │
  │        ├─FCP───▶│        │        │        │
  │        │   (First Contentful Paint : premier texte/image)
  │        │        │        ├─LCP───▶│        │
  │        │        │        │   (Largest Contentful Paint : hero image)
  │        │        │        │        │        │
  ▼        ▼        ▼        ▼        ▼        ▼

Éléments candidats au LCP :
  - <img> (y compris dans <picture>)
  - <video> (poster image)
  - Éléments avec background-image (via CSS)
  - Blocs de texte de niveau bloc (<h1>, <p>, etc.)
```

### 1.4 INP — Interaction to Next Paint

L'INP remplace le FID (First Input Delay) depuis mars 2024. Il mesure la latence de **toutes les interactions** de l'utilisateur (clic, tap, touche clavier), pas seulement la première.

```
Interaction utilisateur :
═══════════════════════════════════════
  Clic ──▶ Event Handler ──▶ Layout/Paint ──▶ Affichage
  │         │                 │                │
  ├─Input──▶├─Processing─────▶├─Presentation──▶│
  │ Delay   │ Time            │ Delay          │
  │         │                 │                │
  └─────────────── INP ──────────────────────┘

  INP = Input Delay + Processing Time + Presentation Delay

  Causes de mauvais INP :
  ❌ JavaScript bloquant le main thread
  ❌ Event handlers lourds (re-render React massif)
  ❌ Layout shifts pendant l'interaction
  ❌ Trop de DOM nodes (> 1500)
```

### 1.5 CLS — Cumulative Layout Shift

Le CLS mesure la **stabilité visuelle** : combien le contenu bouge pendant le chargement.

```
Bon CLS (score < 0.1) :
┌────────────────────┐    ┌────────────────────┐
│ [Header]           │    │ [Header]           │
│                    │    │                    │
│ [Texte]            │ →  │ [Texte]            │
│                    │    │ [Image chargée]    │
│ [Espace réservé]   │    │                    │
│                    │    │ [Footer]           │
└────────────────────┘    └────────────────────┘
  (espace prévu pour         (l'image remplit
   l'image)                   l'espace réservé)

Mauvais CLS (score > 0.25) :
┌────────────────────┐    ┌────────────────────┐
│ [Header]           │    │ [Header]           │
│                    │    │ [PUB INJECTÉE]     │  ← shift !
│ [Texte] ← ici     │ →  │ [Texte] ← décalé  │
│                    │    │                    │
│ [Footer]           │    │ [Image tardive]    │  ← shift !
│                    │    │ [Footer] ← décalé  │
└────────────────────┘    └────────────────────┘
  Tout le contenu se décale vers le bas
```

---

## 2. Le Waterfall : lire et optimiser

### 2.1 Comprendre le waterfall

Le waterfall (cascade) montre l'ordre et la durée de chaque requête réseau. C'est **l'outil principal** pour diagnostiquer les problèmes de performance.

```
Waterfall typique d'une page web :
═══════════════════════════════════════════════════════════
Ressource            0ms   200   400   600   800  1000  1200
──────────────────────────────────────────────────────────
index.html           [████]
                     TTFB=180ms
                          ↓ parse HTML
styles.css                [██████]
                          render-blocking !
                                ↓ CSSOM prêt
app.js                    [████████████]
                          parser-blocking !
                                       ↓ JS exécuté
hero.webp                      [████████████]
                               LCP candidate
font.woff2                [████████]
                          render-blocking
api/data.json                            [██████]
                                         fetch() en JS
analytics.js                                  [████]
                                              lazy-loaded
──────────────────────────────────────────────────────────
                                    ↑
                                   LCP ~800ms
```

### 2.2 Simuler un waterfall avec Node.js

```js
// waterfall-server.mjs — Serveur qui simule des ressources avec différentes latences
import { createServer } from 'node:http';

// Ressources avec leurs caractéristiques
const resources = {
  '/': {
    type: 'text/html',
    delay: 150,   // TTFB du HTML
    cache: 'no-cache',
    body: () => `<!DOCTYPE html>
<html>
<head>
  <link rel="stylesheet" href="/styles.css">
  <link rel="preload" href="/hero.webp" as="image">
  <script src="/app.js" defer></script>
</head>
<body>
  <h1>Waterfall Demo</h1>
  <img src="/hero.webp" alt="Hero" width="800" height="400">
  <div id="data">Chargement...</div>
  <script>
    // Ce fetch ne démarre qu'après le JS → mauvais waterfall
    fetch('/api/data').then(r => r.json()).then(d => {
      document.getElementById('data').textContent = d.message;
    });
  </script>
</body>
</html>`,
  },
  '/styles.css': {
    type: 'text/css',
    delay: 80,
    cache: 'public, max-age=31536000, immutable',
    body: () => 'body { font-family: system-ui; max-width: 800px; margin: 0 auto; }',
  },
  '/app.js': {
    type: 'application/javascript',
    delay: 120,
    cache: 'public, max-age=31536000, immutable',
    body: () => 'console.log("App loaded at", Date.now());',
  },
  '/hero.webp': {
    type: 'image/webp',
    delay: 200,
    cache: 'public, max-age=86400',
    body: () => '<fake-image-data>', // Données fictives
  },
  '/api/data': {
    type: 'application/json',
    delay: 300,
    cache: 'public, max-age=60, stale-while-revalidate=600',
    body: () => JSON.stringify({ message: 'Données chargées !', timestamp: Date.now() }),
  },
};

const server = createServer(async (req, res) => {
  const resource = resources[req.url];
  if (!resource) {
    res.writeHead(404);
    res.end('Not Found');
    return;
  }

  const start = process.hrtime.bigint();

  // Simuler le délai de réponse
  await new Promise(r => setTimeout(r, resource.delay));

  const ttfb = Number(process.hrtime.bigint() - start) / 1_000_000;

  res.writeHead(200, {
    'Content-Type': resource.type,
    'Cache-Control': resource.cache,
    'Server-Timing': `ttfb;dur=${ttfb.toFixed(1)}`,
    'X-Resource-Delay': `${resource.delay}ms`,
  });

  res.end(resource.body());
  console.log(`${req.url.padEnd(20)} ${ttfb.toFixed(0).padStart(4)}ms  Cache: ${resource.cache}`);
});

server.listen(3000, () => {
  console.log('Waterfall Demo → http://localhost:3000');
  console.log('Ouvre les DevTools (F12) → Network → Recharge pour voir le waterfall.');
});
```

### 2.3 Optimiser le waterfall

```
AVANT optimisation :
═══════════════════════
HTML      [████]
  CSS          [██████]          ← bloquant le rendu
    JS              [████████]   ← bloquant le parser
      Image              [████████████]  ← LCP tard
        API                         [██████]  ← trop tard

APRÈS optimisation :
═══════════════════════
HTML      [████]
  CSS     [██████]               ← preload
  JS      [████████]             ← defer (non bloquant)
  Image   [████████████]         ← preload (LCP)
  API     [██████]               ← fetchpriority="high" ou SSR
                  ↑
                 LCP avancé de ~400ms !

Techniques :
  1. <link rel="preload"> pour les ressources critiques
  2. <script defer> au lieu de <script> bloquant
  3. <link rel="preconnect"> pour les domaines tiers
  4. Inline le CSS critique
  5. Server Push (HTTP/2) ou Early Hints (103)
```

---

## 3. Critical Rendering Path

### 3.1 Le chemin critique : HTML → CSS → JS → Paint

```
┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐
│  Réseau  │───▶│  HTML    │───▶│  CSS     │───▶│   JS     │───▶│  Paint   │
│  (fetch) │    │  Parse   │    │  Parse   │    │ Execute  │    │ (render) │
└──────────┘    └──────────┘    └──────────┘    └──────────┘    └──────────┘
                     │               │               │               │
                     ▼               ▼               ▼               ▼
                   DOM            CSSOM          DOM modifié     Render Tree
                                                               → Layout
                                                               → Paint
                                                               → Composite

  ⚡ Le rendu est BLOQUÉ tant que :
     1. Le CSS n'est pas entièrement parsé (CSSOM)
     2. Le JS synchrone n'est pas exécuté
     → C'est le "critical rendering path"
```

### 3.2 Mesurer le critical path

```js
// critical-path.mjs — Serveur qui mesure et expose le critical rendering path
import { createServer } from 'node:http';

// Simule différentes stratégies de chargement
function generatePage(strategy) {
  switch (strategy) {
    case 'blocking':
      // MAUVAIS : CSS et JS bloquent le rendu
      return `<!DOCTYPE html>
<html>
<head>
  <!-- CSS bloquant : le navigateur attend que tout le CSS soit chargé -->
  <link rel="stylesheet" href="/heavy-styles.css">
  <!-- JS bloquant : arrête le parsing HTML -->
  <script src="/heavy-app.js"></script>
</head>
<body>
  <h1>Strategy: BLOCKING</h1>
  <p>Le rendu est bloqué par CSS + JS synchrones.</p>
  <img src="/hero.webp" width="800" height="400">
</body>
</html>`;

    case 'optimized':
      // BON : CSS critique inliné, JS différé, preloads
      return `<!DOCTYPE html>
<html>
<head>
  <!-- CSS critique inliné (pas de requête réseau) -->
  <style>
    body { font-family: system-ui; margin: 0; }
    h1 { padding: 20px; background: #2563eb; color: white; }
    .hero { width: 100%; height: 400px; object-fit: cover; }
  </style>
  <!-- Précharger les ressources critiques -->
  <link rel="preload" href="/hero.webp" as="image" fetchpriority="high">
  <link rel="preload" href="/heavy-styles.css" as="style">
  <!-- CSS non-critique chargé de manière asynchrone -->
  <link rel="stylesheet" href="/heavy-styles.css" media="print" onload="this.media='all'">
  <!-- JS différé (ne bloque pas le parsing) -->
  <script src="/heavy-app.js" defer></script>
</head>
<body>
  <h1>Strategy: OPTIMIZED</h1>
  <p>CSS critique inliné, JS en defer, preloads actifs.</p>
  <img class="hero" src="/hero.webp" width="800" height="400" fetchpriority="high">
</body>
</html>`;

    default:
      return '<html><body><h1>?strategy=blocking ou optimized</h1></body></html>';
  }
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');

  // Simuler les ressources avec des délais réalistes
  if (url.pathname === '/heavy-styles.css') {
    await new Promise(r => setTimeout(r, 200));
    res.writeHead(200, {
      'Content-Type': 'text/css',
      'Cache-Control': 'public, max-age=31536000, immutable',
    });
    res.end('/* Heavy CSS - 200ms */ body { line-height: 1.6; }');
    return;
  }

  if (url.pathname === '/heavy-app.js') {
    await new Promise(r => setTimeout(r, 300));
    res.writeHead(200, {
      'Content-Type': 'application/javascript',
      'Cache-Control': 'public, max-age=31536000, immutable',
    });
    res.end('/* Heavy JS - 300ms */ console.log("App ready");');
    return;
  }

  if (url.pathname === '/hero.webp') {
    await new Promise(r => setTimeout(r, 250));
    res.writeHead(200, {
      'Content-Type': 'image/webp',
      'Cache-Control': 'public, max-age=86400',
    });
    res.end('fake-image-data');
    return;
  }

  // Page HTML
  const strategy = url.searchParams.get('strategy') || '';
  const html = generatePage(strategy);

  res.writeHead(200, {
    'Content-Type': 'text/html; charset=utf-8',
    'Cache-Control': 'no-cache',
    'Link': [
      '</heavy-styles.css>; rel=preload; as=style',
      '</hero.webp>; rel=preload; as=image',
    ].join(', '),
  });

  res.end(html);
});

server.listen(3000, () => {
  console.log('Critical Path → http://localhost:3000?strategy=blocking');
  console.log('Compare     → http://localhost:3000?strategy=optimized');
});
```

---

## 4. Performance Budgets

### 4.1 Définir des limites

Un **performance budget** est un ensemble de limites chiffrées qu'une équipe s'engage à ne pas dépasser. Si une métrique dépasse le budget, c'est un signal d'alarme.

| Métrique | Budget (bon) | Alerte (attention) | Critique |
|---------|-------------|-------------------|----------|
| **TTFB** | < 200ms | 200-600ms | > 600ms |
| **LCP** | < 2.5s | 2.5-4.0s | > 4.0s |
| **INP** | < 200ms | 200-500ms | > 500ms |
| **CLS** | < 0.1 | 0.1-0.25 | > 0.25 |
| **Total JS** | < 300KB | 300-500KB | > 500KB |
| **Total CSS** | < 100KB | 100-200KB | > 200KB |
| **Total images** | < 500KB | 500KB-1MB | > 1MB |
| **Nombre de requêtes** | < 30 | 30-60 | > 60 |

### 4.2 Mesurer les budgets côté serveur

```js
// performance-budget.mjs — Monitorer les performance budgets
import { createServer } from 'node:http';

// --- Définition des budgets ---
const BUDGETS = {
  ttfb: { good: 200, warn: 600, unit: 'ms' },
  responseSize: { good: 100_000, warn: 500_000, unit: 'bytes' },
  serverProcessing: { good: 100, warn: 300, unit: 'ms' },
  cacheHitRate: { good: 80, warn: 50, unit: '%' },
};

// --- Collecteur de métriques ---
const metrics = {
  requests: 0,
  cacheHits: 0,
  cacheMisses: 0,
  ttfbSum: 0,
  ttfbMax: 0,
  violations: [],
};

function checkBudget(name, value) {
  const budget = BUDGETS[name];
  if (!budget) return 'unknown';

  if (name === 'cacheHitRate') {
    // Pour le cache hit rate, plus c'est haut, mieux c'est
    if (value >= budget.good) return 'good';
    if (value >= budget.warn) return 'warn';
    return 'critical';
  }

  if (value <= budget.good) return 'good';
  if (value <= budget.warn) return 'warn';

  // Violation !
  metrics.violations.push({
    metric: name,
    value,
    budget: budget.warn,
    timestamp: Date.now(),
  });
  return 'critical';
}

// --- Cache simple ---
const cache = new Map();

const server = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const start = process.hrtime.bigint();

  // Endpoint de métriques
  if (url.pathname === '/metrics') {
    const cacheHitRate = metrics.requests > 0
      ? (metrics.cacheHits / metrics.requests * 100).toFixed(1)
      : 0;
    const avgTtfb = metrics.requests > 0
      ? (metrics.ttfbSum / metrics.requests).toFixed(1)
      : 0;

    const report = {
      requests: metrics.requests,
      cache: {
        hits: metrics.cacheHits,
        misses: metrics.cacheMisses,
        hitRate: `${cacheHitRate}%`,
        hitRateStatus: checkBudget('cacheHitRate', parseFloat(cacheHitRate)),
      },
      ttfb: {
        average: `${avgTtfb}ms`,
        max: `${metrics.ttfbMax.toFixed(1)}ms`,
        status: checkBudget('ttfb', parseFloat(avgTtfb)),
      },
      violations: metrics.violations.slice(-10), // Dernières 10 violations
      budgets: BUDGETS,
    };

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(report, null, 2));
    return;
  }

  // Dashboard HTML
  if (url.pathname === '/dashboard') {
    const cacheHitRate = metrics.requests > 0
      ? (metrics.cacheHits / metrics.requests * 100) : 0;
    const avgTtfb = metrics.requests > 0
      ? (metrics.ttfbSum / metrics.requests) : 0;

    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(`<!DOCTYPE html>
<html><head><meta charset="UTF-8"><title>Performance Budget Dashboard</title>
<style>
  body { font-family: system-ui; padding: 20px; }
  table { border-collapse: collapse; width: 100%; }
  td, th { border: 1px solid #ddd; padding: 10px; text-align: left; }
  .good { background: #ecfdf5; color: #065f46; }
  .warn { background: #fffbeb; color: #92400e; }
  .critical { background: #fef2f2; color: #991b1b; }
</style></head>
<body>
  <h1>Performance Budget Dashboard</h1>
  <table>
    <tr><th>Métrique</th><th>Valeur</th><th>Budget</th><th>Status</th></tr>
    <tr class="${checkBudget('ttfb', avgTtfb)}">
      <td>TTFB moyen</td><td>${avgTtfb.toFixed(1)}ms</td>
      <td>&lt; ${BUDGETS.ttfb.good}ms</td>
      <td>${checkBudget('ttfb', avgTtfb).toUpperCase()}</td></tr>
    <tr class="${checkBudget('cacheHitRate', cacheHitRate)}">
      <td>Cache Hit Rate</td><td>${cacheHitRate.toFixed(1)}%</td>
      <td>&gt; ${BUDGETS.cacheHitRate.good}%</td>
      <td>${checkBudget('cacheHitRate', cacheHitRate).toUpperCase()}</td></tr>
    <tr><td>Requêtes totales</td><td>${metrics.requests}</td><td>—</td><td>—</td></tr>
    <tr><td>Violations</td><td>${metrics.violations.length}</td><td>0</td>
      <td class="${metrics.violations.length > 0 ? 'critical' : 'good'}">
        ${metrics.violations.length > 0 ? 'VIOLATIONS' : 'OK'}</td></tr>
  </table>
  <p>Données JSON : <a href="/metrics">/metrics</a></p>
  <p>Générer du trafic : <a href="/page/test">/page/test</a></p>
</body></html>`);
    return;
  }

  // Pages normales (avec cache et mesure TTFB)
  metrics.requests++;

  if (cache.has(url.pathname)) {
    metrics.cacheHits++;
    const ttfb = Number(process.hrtime.bigint() - start) / 1_000_000;
    metrics.ttfbSum += ttfb;
    if (ttfb > metrics.ttfbMax) metrics.ttfbMax = ttfb;
    checkBudget('ttfb', ttfb);

    res.writeHead(200, {
      'Content-Type': 'text/html',
      'X-Cache': 'HIT',
      'Server-Timing': `ttfb;dur=${ttfb.toFixed(2)}`,
    });
    res.end(cache.get(url.pathname));
    return;
  }

  metrics.cacheMisses++;

  // Simuler un rendu lent
  await new Promise(r => setTimeout(r, 150 + Math.random() * 200));

  const html = `<html><body><h1>${url.pathname}</h1>
    <p>Généré à ${new Date().toISOString()}</p>
    <p><a href="/dashboard">Dashboard</a></p></body></html>`;
  cache.set(url.pathname, html);

  const ttfb = Number(process.hrtime.bigint() - start) / 1_000_000;
  metrics.ttfbSum += ttfb;
  if (ttfb > metrics.ttfbMax) metrics.ttfbMax = ttfb;
  checkBudget('ttfb', ttfb);

  const responseSize = Buffer.byteLength(html);
  checkBudget('responseSize', responseSize);

  res.writeHead(200, {
    'Content-Type': 'text/html',
    'X-Cache': 'MISS',
    'Server-Timing': `ttfb;dur=${ttfb.toFixed(2)}`,
  });
  res.end(html);
});

server.listen(3000, () => {
  console.log('Performance Budget → http://localhost:3000/dashboard');
});
```

---

## 5. Lighthouse : métriques, audits, opportunités

### 5.1 Comprendre le score Lighthouse

```
Score Lighthouse (0-100) :
═══════════════════════════
  0-49   : Rouge   → Problèmes critiques
  50-89  : Orange  → Des améliorations possibles
  90-100 : Vert    → Excellent

Répartition du score Performance :
┌──────────────────────────────────────────────┐
│  FCP (First Contentful Paint)    10%          │
│  Speed Index                     10%          │
│  LCP (Largest Contentful Paint)  25%  ←      │
│  TBT (Total Blocking Time)      30%  ← gros │
│  CLS (Cumulative Layout Shift)  25%  ← poids │
└──────────────────────────────────────────────┘
```

### 5.2 Simuler un audit Lighthouse côté serveur

```js
// lighthouse-sim.mjs — Simulateur d'audit simplifié
import { createServer } from 'node:http';

// Audits simplifiés que Lighthouse vérifie
function auditPage(html, headers) {
  const audits = [];

  // 1. Cache-Control présent ?
  const cc = headers['cache-control'] || '';
  if (!cc) {
    audits.push({
      id: 'uses-cache',
      title: 'Servir les ressources statiques avec une politique de cache efficace',
      score: 0,
      description: 'Aucun en-tête Cache-Control détecté.',
    });
  } else if (cc.includes('no-store') || cc.includes('no-cache')) {
    audits.push({
      id: 'uses-cache',
      title: 'Cache-Control trop restrictif',
      score: 0.5,
      description: `Cache-Control: ${cc} — les ressources statiques devraient avoir un max-age élevé.`,
    });
  } else {
    audits.push({
      id: 'uses-cache',
      title: 'Politique de cache efficace',
      score: 1,
      description: `Cache-Control: ${cc} — OK.`,
    });
  }

  // 2. Compression (Content-Encoding) ?
  if (!headers['content-encoding']) {
    audits.push({
      id: 'uses-compression',
      title: 'Activer la compression texte',
      score: 0,
      description: 'Pas de Content-Encoding détecté. Utiliser gzip ou brotli.',
    });
  }

  // 3. Taille de la réponse
  const size = Buffer.byteLength(html);
  if (size > 100_000) {
    audits.push({
      id: 'response-size',
      title: 'Réduire la taille de la réponse',
      score: 0.3,
      description: `Réponse de ${(size / 1024).toFixed(1)}KB — envisager la minification.`,
    });
  }

  // 4. render-blocking resources
  const hasBlockingCSS = /<link[^>]+stylesheet[^>]+>/.test(html) && !/<link[^>]+media=/.test(html);
  const hasBlockingJS = /<script(?!.*defer|.*async)[^>]*src=/.test(html);

  if (hasBlockingCSS) {
    audits.push({
      id: 'render-blocking-css',
      title: 'Éliminer les ressources CSS bloquantes',
      score: 0,
      description: 'Utiliser <link media="print" onload="this.media=all"> ou inliner le CSS critique.',
    });
  }

  if (hasBlockingJS) {
    audits.push({
      id: 'render-blocking-js',
      title: 'Éliminer les scripts bloquants',
      score: 0,
      description: 'Utiliser defer ou async sur les balises <script>.',
    });
  }

  // 5. Images sans dimensions
  const imgWithoutSize = /<img(?![^>]*width)[^>]*>/.test(html);
  if (imgWithoutSize) {
    audits.push({
      id: 'image-size',
      title: 'Les images doivent avoir des attributs width et height',
      score: 0,
      description: 'Les images sans dimensions causent du CLS.',
    });
  }

  return audits;
}

const server = createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');

  if (url.pathname === '/audit') {
    const targetUrl = url.searchParams.get('url') || '/';

    // Simuler un fetch de la page cible
    const sampleHTML = `<!DOCTYPE html>
<html>
<head>
  <link rel="stylesheet" href="/styles.css">
  <script src="/app.js"></script>
</head>
<body>
  <h1>Page test</h1>
  <img src="/hero.jpg">
</body>
</html>`;

    const sampleHeaders = { 'content-type': 'text/html' };
    const audits = auditPage(sampleHTML, sampleHeaders);

    const overallScore = audits.reduce((sum, a) => sum + a.score, 0) / audits.length;

    const auditRows = audits.map(a => {
      const color = a.score >= 0.9 ? '#065f46' : a.score >= 0.5 ? '#92400e' : '#991b1b';
      const bg = a.score >= 0.9 ? '#ecfdf5' : a.score >= 0.5 ? '#fffbeb' : '#fef2f2';
      return `<tr style="background:${bg}; color:${color};">
        <td>${a.title}</td>
        <td>${(a.score * 100).toFixed(0)}%</td>
        <td>${a.description}</td>
      </tr>`;
    }).join('');

    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(`<!DOCTYPE html>
<html><head><meta charset="UTF-8"><title>Audit simplifié</title>
<style>
  body { font-family: system-ui; padding: 20px; }
  table { border-collapse: collapse; width: 100%; }
  td, th { border: 1px solid #ddd; padding: 10px; }
  .score { font-size: 3em; text-align: center; padding: 20px; border-radius: 50%;
    width: 100px; height: 100px; display: flex; align-items: center;
    justify-content: center; margin: 0 auto; }
</style></head>
<body>
  <h1>Audit Performance (simplifié)</h1>
  <div class="score" style="background: ${overallScore >= 0.9 ? '#ecfdf5' : overallScore >= 0.5 ? '#fffbeb' : '#fef2f2'}; color: ${overallScore >= 0.9 ? '#065f46' : overallScore >= 0.5 ? '#92400e' : '#991b1b'};">
    ${(overallScore * 100).toFixed(0)}
  </div>
  <h2>Audits</h2>
  <table>
    <tr><th>Audit</th><th>Score</th><th>Détail</th></tr>
    ${auditRows}
  </table>
</body></html>`);
    return;
  }

  res.writeHead(200, { 'Content-Type': 'text/html' });
  res.end(`<h1>Lighthouse Simulator</h1>
    <a href="/audit?url=/">Lancer l'audit</a>`);
});

server.listen(3000, () => {
  console.log('Lighthouse Simulator → http://localhost:3000/audit');
});
```

---

## 6. L'impact du caching sur chaque métrique

### 6.1 Matrice caching × métriques

| Métrique | Sans cache | Cache navigateur | Cache CDN | Cache + Preload |
|---------|-----------|-----------------|-----------|-----------------|
| **TTFB** | 300-500ms | 0ms (304 ou cache) | 20-50ms | 20-50ms |
| **LCP** | 1.5-3.0s | 0.5-1.0s | 0.8-1.5s | 0.3-0.8s |
| **INP** | Pas d'impact direct | JS en cache = parse + exec plus rapide | Pas d'impact | Pas d'impact |
| **CLS** | Variable | Polices en cache = pas de FOUT | Pas d'impact direct | Preload fonts = 0 CLS |

### 6.2 Démonstration de l'impact du cache

```js
// cache-impact.mjs — Mesurer l'impact du cache sur les métriques
import { createServer } from 'node:http';

const cache = new Map();
const metricsLog = [];

function simulateRender() {
  // Simule un rendu SSR qui prend du temps
  const start = Date.now();
  // Boucle CPU simulée (en vrai, ce serait du rendering React/Vue)
  let result = 0;
  for (let i = 0; i < 1_000_000; i++) result += Math.random();
  return Date.now() - start;
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const start = process.hrtime.bigint();

  // Endpoint de comparaison
  if (url.pathname === '/compare') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(`<!DOCTYPE html>
<html><head><meta charset="UTF-8"><title>Cache Impact</title>
<style>
  body { font-family: system-ui; padding: 20px; }
  .card { display: inline-block; vertical-align: top; width: 45%; margin: 1%;
    padding: 15px; border: 1px solid #ddd; border-radius: 8px; }
  .metric { font-size: 2em; font-weight: bold; }
  .good { color: #065f46; } .bad { color: #991b1b; }
</style></head>
<body>
  <h1>Impact du Cache sur les Métriques</h1>
  <div class="card">
    <h2>Sans cache</h2>
    <div id="no-cache">Chargement...</div>
  </div>
  <div class="card">
    <h2>Avec cache</h2>
    <div id="with-cache">Chargement...</div>
  </div>
  <script>
    async function measure(url) {
      const start = performance.now();
      const resp = await fetch(url);
      const ttfb = performance.now() - start;
      const text = await resp.text();
      const total = performance.now() - start;
      return {
        ttfb: ttfb.toFixed(1),
        total: total.toFixed(1),
        cache: resp.headers.get('x-cache'),
        size: resp.headers.get('content-length') || text.length,
      };
    }

    async function run() {
      // Sans cache
      const nc = await measure('/page?nocache=1&t=' + Date.now());
      document.getElementById('no-cache').innerHTML =
        '<p>TTFB: <span class="metric bad">' + nc.ttfb + 'ms</span></p>' +
        '<p>Total: ' + nc.total + 'ms</p>' +
        '<p>Cache: ' + nc.cache + '</p>';

      // Avec cache (2e requête)
      await fetch('/page'); // Populer le cache
      const wc = await measure('/page');
      document.getElementById('with-cache').innerHTML =
        '<p>TTFB: <span class="metric good">' + wc.ttfb + 'ms</span></p>' +
        '<p>Total: ' + wc.total + 'ms</p>' +
        '<p>Cache: ' + wc.cache + '</p>' +
        '<p>Gain TTFB: <strong>' + ((1 - wc.ttfb / nc.ttfb) * 100).toFixed(0) + '%</strong></p>';
    }
    run();
  </script>
</body></html>`);
    return;
  }

  // --- Page avec/sans cache ---
  const noCache = url.searchParams.has('nocache');
  let html;
  let cacheStatus;
  let renderTime = 0;

  if (!noCache && cache.has(url.pathname)) {
    html = cache.get(url.pathname);
    cacheStatus = 'HIT';
  } else {
    renderTime = simulateRender();
    await new Promise(r => setTimeout(r, 100)); // Simule I/O
    html = `<html><body><h1>Page</h1><p>Rendu en ${renderTime}ms à ${new Date().toISOString()}</p></body></html>`;
    if (!noCache) cache.set(url.pathname, html);
    cacheStatus = noCache ? 'BYPASS' : 'MISS';
  }

  const ttfb = Number(process.hrtime.bigint() - start) / 1_000_000;

  metricsLog.push({ path: url.pathname, ttfb, cacheStatus, renderTime, timestamp: Date.now() });

  res.writeHead(200, {
    'Content-Type': 'text/html',
    'Content-Length': String(Buffer.byteLength(html)),
    'X-Cache': cacheStatus,
    'X-TTFB': `${ttfb.toFixed(2)}ms`,
    'X-Render-Time': `${renderTime}ms`,
    'Server-Timing': `ttfb;dur=${ttfb.toFixed(2)}, render;dur=${renderTime}`,
    'Cache-Control': noCache ? 'no-store' : 'public, max-age=60',
  });

  res.end(html);
});

server.listen(3000, () => {
  console.log('Cache Impact → http://localhost:3000/compare');
});
```

### 6.3 Stratégies de cache par type de ressource

```
┌─────────────────────────────────────────────────────────────────┐
│          Stratégie de cache optimale par ressource               │
│                                                                   │
│  HTML (document)                                                 │
│  └─ Cache-Control: no-cache (ou s-maxage=60 sur CDN)            │
│  └─ Impact : TTFB ↓                                             │
│                                                                   │
│  CSS/JS (avec hash dans le nom)                                  │
│  └─ Cache-Control: public, max-age=31536000, immutable          │
│  └─ Impact : LCP ↓, INP ↓ (JS en cache = exec plus rapide)     │
│                                                                   │
│  Images (hero, above-the-fold)                                   │
│  └─ Cache-Control: public, max-age=86400                        │
│  └─ + <link rel="preload" as="image" fetchpriority="high">     │
│  └─ Impact : LCP ↓↓↓                                            │
│                                                                   │
│  Polices (fonts)                                                 │
│  └─ Cache-Control: public, max-age=31536000, immutable          │
│  └─ + <link rel="preload" as="font" crossorigin>               │
│  └─ Impact : CLS ↓ (élimine le FOUT)                            │
│                                                                   │
│  API JSON                                                        │
│  └─ Cache-Control: public, max-age=0, s-maxage=30,             │
│     stale-while-revalidate=300                                   │
│  └─ Impact : TTFB ↓ (données cachées sur CDN)                   │
└─────────────────────────────────────────────────────────────────┘
```

---

## Points clés

1. Les **Core Web Vitals** (TTFB, LCP, INP, CLS) sont les métriques de performance qui comptent pour Google et pour l'expérience utilisateur.
2. Le **TTFB** est la métrique la plus directement impactée par le caching HTTP — un cache HIT réduit le TTFB de 80-99%.
3. Le **waterfall** est l'outil de diagnostic principal : il révèle les requêtes séquentielles, les ressources bloquantes et les opportunités de parallélisation.
4. Le **critical rendering path** (HTML → CSS → JS → Paint) détermine quand le navigateur peut commencer à afficher du contenu — minimiser les ressources bloquantes est essentiel.
5. Les **performance budgets** définissent des limites chiffrées (TTFB < 200ms, JS < 300KB) et déclenchent des alertes quand elles sont dépassées.
6. **Lighthouse** combine métriques de performance, audits de bonnes pratiques et opportunités d'amélioration en un score unique.
7. Le caching impacte **chaque métrique différemment** : TTFB directement, LCP via les images et CSS en cache, CLS via les polices préchargées.
8. La stratégie de cache optimale dépend du **type de ressource** : immutable pour les assets hashés, stale-while-revalidate pour les API, no-cache pour le HTML document.

---

---

## Pour aller plus loin

- [web.dev — Core Web Vitals](https://web.dev/vitals/)
- [web.dev — Optimize LCP](https://web.dev/optimize-lcp/)
- [web.dev — Optimize INP](https://web.dev/optimize-inp/)
- [MDN — Server-Timing](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Server-Timing)
- [Chrome DevTools — Performance panel](https://developer.chrome.com/docs/devtools/performance/)

---

## Si tu es perdu

Pense à **commander un repas dans un restaurant** :

- **TTFB** = combien de temps avant que le serveur arrive à ta table. Avec le cache, c'est comme s'il y avait un serveur **déjà à côté de toi** (CDN edge) au lieu d'un serveur qui doit traverser tout le restaurant (origin server).

- **LCP** = combien de temps avant que le plat principal arrive. Si le plat est **déjà préparé** (en cache), il arrive instantanément. Si le chef doit le cuisiner (SSR sans cache), ça prend du temps.

- **INP** = quand tu appelles le serveur, combien de temps il met à réagir. Le caching n'aide pas directement ici — c'est la charge de travail du navigateur (JavaScript) qui compte.

- **CLS** = imagine que tu commences à manger et que quelqu'un **pousse ta table** au milieu du repas. C'est ce qui arrive quand une pub se charge et décale tout le contenu. Les polices en cache évitent le "flash" du changement de police.

Le **waterfall**, c'est comme voir la **timeline de préparation en cuisine** : quel plat a été commandé quand, lequel bloque les autres, et ou on peut gagner du temps.

---

## Défi

### Construis un outil de mesure de performance complet

Crée un serveur Node.js qui :

1. Sert une page HTML avec plusieurs ressources (CSS, JS, images, API)
2. Mesure le **Server-Timing** pour chaque composant (rendu, fetch API, lecture cache)
3. Expose un endpoint `/perf-report` qui affiche :
   - TTFB moyen des 100 dernières requêtes
   - Distribution des TTFB (histogramme : 0-50ms, 50-100ms, 100-200ms, 200ms+)
   - Cache hit rate par type de ressource (HTML, CSS, JS, API)
   - Violations de performance budget
4. Implémente un middleware qui ajoute automatiquement les en-têtes `Server-Timing` à chaque réponse
5. **Bonus** : expose les métriques au format Prometheus (`/metrics/prometheus`)

<details>
<summary>Voir la solution</summary>

```js
// defi-14-perf-tool.mjs
import { createServer } from 'node:http';

const cache = new Map();
const perfLog = [];     // { path, ttfb, cacheStatus, type, timestamp }
const MAX_LOG = 1000;

const BUDGETS = { ttfb: 200, cacheHitRate: 80 };

function getResourceType(path) {
  if (path.endsWith('.css')) return 'css';
  if (path.endsWith('.js')) return 'js';
  if (path.startsWith('/api/')) return 'api';
  if (/\.(webp|jpg|png|gif)$/.test(path)) return 'image';
  return 'html';
}

function addPerfEntry(entry) {
  perfLog.push(entry);
  if (perfLog.length > MAX_LOG) perfLog.shift();
}

const resources = {
  '/styles.css': { type: 'text/css', delay: 50, body: 'body{margin:0}', cc: 'public, max-age=31536000, immutable' },
  '/app.js': { type: 'application/javascript', delay: 80, body: 'console.log("ok")', cc: 'public, max-age=31536000, immutable' },
  '/api/data': { type: 'application/json', delay: 200, body: '{"ok":true}', cc: 'public, s-maxage=30, stale-while-revalidate=300' },
};

const server = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const start = process.hrtime.bigint();

  // Performance report
  if (url.pathname === '/perf-report') {
    const recent = perfLog.slice(-100);
    const ttfbs = recent.map(e => e.ttfb);
    const avgTtfb = ttfbs.length ? ttfbs.reduce((a, b) => a + b, 0) / ttfbs.length : 0;

    // Histogramme
    const histogram = { '0-50ms': 0, '50-100ms': 0, '100-200ms': 0, '200ms+': 0 };
    for (const t of ttfbs) {
      if (t < 50) histogram['0-50ms']++;
      else if (t < 100) histogram['50-100ms']++;
      else if (t < 200) histogram['100-200ms']++;
      else histogram['200ms+']++;
    }

    // Hit rate par type
    const byType = {};
    for (const e of recent) {
      if (!byType[e.type]) byType[e.type] = { hit: 0, miss: 0 };
      if (e.cacheStatus === 'HIT') byType[e.type].hit++;
      else byType[e.type].miss++;
    }
    for (const t of Object.keys(byType)) {
      const total = byType[t].hit + byType[t].miss;
      byType[t].rate = total ? (byType[t].hit / total * 100).toFixed(1) + '%' : 'N/A';
    }

    // Violations
    const violations = [];
    if (avgTtfb > BUDGETS.ttfb) violations.push(`TTFB moyen (${avgTtfb.toFixed(1)}ms) > budget (${BUDGETS.ttfb}ms)`);
    const totalHits = recent.filter(e => e.cacheStatus === 'HIT').length;
    const hitRate = recent.length ? totalHits / recent.length * 100 : 0;
    if (hitRate < BUDGETS.cacheHitRate) violations.push(`Cache hit rate (${hitRate.toFixed(1)}%) < budget (${BUDGETS.cacheHitRate}%)`);

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ avgTtfb: avgTtfb.toFixed(1) + 'ms', histogram, byType, violations, totalEntries: recent.length }, null, 2));
    return;
  }

  // Prometheus metrics
  if (url.pathname === '/metrics/prometheus') {
    const recent = perfLog.slice(-100);
    const avgTtfb = recent.length ? recent.reduce((s, e) => s + e.ttfb, 0) / recent.length : 0;
    const hits = recent.filter(e => e.cacheStatus === 'HIT').length;
    const misses = recent.filter(e => e.cacheStatus === 'MISS').length;

    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end(`# HELP http_ttfb_avg Average TTFB in ms
# TYPE http_ttfb_avg gauge
http_ttfb_avg ${avgTtfb.toFixed(2)}

# HELP http_cache_hits_total Total cache hits
# TYPE http_cache_hits_total counter
http_cache_hits_total ${hits}

# HELP http_cache_misses_total Total cache misses
# TYPE http_cache_misses_total counter
http_cache_misses_total ${misses}
`);
    return;
  }

  // Servir les ressources
  const resType = getResourceType(url.pathname);
  const resource = resources[url.pathname];
  let cacheStatus = 'MISS';

  if (resource) {
    if (cache.has(url.pathname)) {
      cacheStatus = 'HIT';
    } else {
      await new Promise(r => setTimeout(r, resource.delay));
      cache.set(url.pathname, resource.body);
    }
    const ttfb = Number(process.hrtime.bigint() - start) / 1_000_000;
    addPerfEntry({ path: url.pathname, ttfb, cacheStatus, type: resType, timestamp: Date.now() });

    res.writeHead(200, {
      'Content-Type': resource.type,
      'Cache-Control': resource.cc,
      'X-Cache': cacheStatus,
      'Server-Timing': `ttfb;dur=${ttfb.toFixed(2)};desc="${cacheStatus}"`,
    });
    res.end(cache.get(url.pathname));
    return;
  }

  // Page HTML
  await new Promise(r => setTimeout(r, 100));
  const html = `<html><body><h1>Perf Tool</h1>
    <p><a href="/perf-report">Rapport JSON</a> | <a href="/metrics/prometheus">Prometheus</a></p>
    </body></html>`;
  const ttfb = Number(process.hrtime.bigint() - start) / 1_000_000;
  addPerfEntry({ path: url.pathname, ttfb, cacheStatus: 'MISS', type: 'html', timestamp: Date.now() });

  res.writeHead(200, {
    'Content-Type': 'text/html',
    'Server-Timing': `ttfb;dur=${ttfb.toFixed(2)}`,
  });
  res.end(html);
});

server.listen(3000, () => {
  console.log('Perf Tool → http://localhost:3000');
  console.log('Report   → http://localhost:3000/perf-report');
  console.log('Prom     → http://localhost:3000/metrics/prometheus');
});
```

</details>

---

<!-- parcours-recommande -->

::: tip Parcours recommandé
1. **Screencast** : [screencast 14 performance web](../screencasts/screencast-14-performance-web.md)
2. **Lab** : [lab-14-performance-audit](../labs/lab-14-performance-audit/README)
3. **Quiz** : [quiz 14 performance](../quizzes/quiz-14-performance.html)
:::
