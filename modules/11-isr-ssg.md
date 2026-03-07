# Module 11 — ISR & SSG : Rendu statique intelligent

> **Objectif** : Comprendre les stratégies de rendu statique (SSG) et de regénération incrémentale (ISR), et savoir quand les utiliser pour maximiser les performances et la fraîcheur du contenu.
> **Difficulté** : ⭐⭐⭐⭐

---

## 1. SSG — Static Site Generation

### 1.1 Le principe fondamental

Le SSG (Static Site Generation) consiste à **générer toutes les pages HTML au moment du build**, avant même qu'un utilisateur ne visite le site. Le serveur ne fait que servir des fichiers statiques — exactement comme un serveur de fichiers classique.

**Analogie** : Imagine une imprimerie. Au lieu d'écrire chaque lettre à la main quand quelqu'un la demande (SSR), tu imprimes **toutes les lettres d'avance** et tu les ranges dans des casiers. Quand quelqu'un en veut une, tu la sors du casier instantanément.

```
┌─────────────────────────────────────────────────────┐
│                    PHASE DE BUILD                     │
│                                                       │
│   Données (API, DB, CMS)                             │
│         │                                             │
│         ▼                                             │
│   ┌───────────┐    ┌──────────┐    ┌──────────────┐ │
│   │ Templates  │───▶│  Build   │───▶│ Fichiers     │ │
│   │ (JSX, etc) │    │ Process  │    │ HTML statiques│ │
│   └───────────┘    └──────────┘    └──────────────┘ │
│                                           │           │
└───────────────────────────────────────────┼───────────┘
                                            │
                                            ▼
                                    ┌──────────────┐
                                    │     CDN      │
                                    │  (distribué) │
                                    └──────────────┘
                                            │
                              ┌─────────────┼─────────────┐
                              ▼             ▼             ▼
                          Utilisateur   Utilisateur   Utilisateur
                          (Paris)       (Tokyo)       (New York)
```

### 1.2 Simuler un SSG avec Node.js

Voici comment construire un mini-système SSG avec `node:http` et `node:fs` :

```js
// ssg-builder.mjs — Phase de build : génère les pages statiques
import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

// Simule un CMS ou une API qui fournit les données
const articles = [
  { slug: 'introduction-http', title: 'Introduction au HTTP', body: '<p>Le protocole HTTP...</p>', date: '2025-01-15' },
  { slug: 'cache-headers',     title: 'Les en-têtes de cache', body: '<p>Cache-Control...</p>',    date: '2025-02-20' },
  { slug: 'cdn-architecture',  title: 'Architecture CDN',      body: '<p>Un CDN distribue...</p>', date: '2025-03-10' },
];

const outputDir = './dist';

function buildPage(article) {
  return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <title>${article.title}</title>
</head>
<body>
  <header><h1>${article.title}</h1></header>
  <time datetime="${article.date}">${article.date}</time>
  <main>${article.body}</main>
  <footer><p>Généré statiquement au build</p></footer>
</body>
</html>`;
}

function buildIndex(articles) {
  const links = articles
    .map(a => `<li><a href="/articles/${a.slug}.html">${a.title}</a></li>`)
    .join('\n    ');
  return `<!DOCTYPE html>
<html lang="fr">
<head><meta charset="UTF-8"><title>Blog SSG</title></head>
<body>
  <h1>Articles</h1>
  <ul>${links}</ul>
</body>
</html>`;
}

// --- Build ---
console.time('Build SSG');

if (!existsSync(outputDir)) mkdirSync(outputDir, { recursive: true });
if (!existsSync(join(outputDir, 'articles'))) mkdirSync(join(outputDir, 'articles'));

// Générer chaque page d'article
for (const article of articles) {
  const html = buildPage(article);
  writeFileSync(join(outputDir, 'articles', `${article.slug}.html`), html);
  console.log(`  ✔ Généré : /articles/${article.slug}.html`);
}

// Générer la page d'index
writeFileSync(join(outputDir, 'index.html'), buildIndex(articles));
console.log('  ✔ Généré : /index.html');

console.timeEnd('Build SSG');
console.log(`\nTotal : ${articles.length + 1} pages générées.`);
```

### 1.3 Servir les fichiers statiques

```js
// ssg-server.mjs — Serveur statique ultra-simple
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { join, extname } from 'node:path';

const DIST = './dist';
const MIME = { '.html': 'text/html', '.css': 'text/css', '.js': 'application/javascript' };

const server = createServer(async (req, res) => {
  const url = req.url === '/' ? '/index.html' : req.url;
  const filePath = join(DIST, url);
  const ext = extname(filePath);

  try {
    const content = await readFile(filePath);

    // Le fichier est statique → on peut le cacher agressivement
    res.writeHead(200, {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Cache-Control': 'public, max-age=31536000, immutable',
      'X-Served-By': 'SSG-static',
    });
    res.end(content);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/html' });
    res.end('<h1>404 — Page non trouvée</h1>');
  }
});

server.listen(3000, () => console.log('SSG server → http://localhost:3000'));
```

### 1.4 Avantages et limites du SSG

| Avantage | Détail |
|----------|--------|
| **Performance maximale** | Fichiers pré-générés, TTFB proche de zéro via CDN |
| **Sécurité** | Pas de serveur dynamique exposé, pas de base de données en production |
| **Coût réduit** | Hébergement sur un CDN statique (S3, Cloudflare Pages, Netlify) |
| **SEO parfait** | HTML complet disponible immédiatement pour les crawlers |
| **Scalabilité infinie** | Un CDN peut servir des millions de requêtes sans effort |

| Limite | Détail |
|--------|--------|
| **Temps de build** | 10 000 pages = potentiellement 10-30 min de build |
| **Contenu figé** | Les données sont celles du moment du build |
| **Personnalisation** | Impossible de personnaliser le HTML par utilisateur (sans JS client) |
| **Rebuild total** | Un changement = rebuilder toutes les pages (en SSG pur) |

---

## 2. ISR — Incremental Static Regeneration

### 2.1 Le concept : le meilleur des deux mondes

L'ISR combine les avantages du SSG (pages statiques rapides) avec la fraîcheur du SSR (contenu à jour). Le principe :

1. Au build, on génère les pages statiques (comme en SSG)
2. En production, quand une page est demandée **après expiration**, on sert la version en cache **ET** on régénère la page en arrière-plan
3. La prochaine requête reçoit la **version fraîche**

**Analogie** : Imagine un restaurant avec un buffet. Les plats sont préparés d'avance (SSG). Mais le chef surveille : quand un plat commence à refroidir (TTL expiré), il en prépare un nouveau **en cuisine** (background revalidation) pendant que les clients se servent de l'ancien. Quand le nouveau plat est prêt, il remplace l'ancien sur le buffet.

```
Requête #1 (page fraîche, TTL non expiré)
─────────────────────────────────────────
Client ──GET /article/xyz──▶ CDN/Serveur
                              │
                              ├─ Cache HIT (TTL valide)
                              │
Client ◀── 200 + HTML ───────┘
           (rapide, depuis le cache)


Requête #2 (page périmée, TTL expiré — Stale-While-Revalidate)
──────────────────────────────────────────────────────────────
Client ──GET /article/xyz──▶ CDN/Serveur
                              │
                              ├─ Cache STALE (TTL expiré)
                              │
                              ├─ Sert la version stale immédiatement
                              │      Client ◀── 200 + HTML (ancien)
                              │
                              └─ EN ARRIÈRE-PLAN :
                                   │
                                   ├─ Fetch les données fraîches
                                   ├─ Regénère le HTML
                                   └─ Met à jour le cache
                                        │
                                        ▼
                                   Nouvelle version prête
                                   pour la requête suivante


Requête #3 (après régénération)
────────────────────────────────
Client ──GET /article/xyz──▶ CDN/Serveur
                              │
                              ├─ Cache HIT (nouvelle version)
                              │
Client ◀── 200 + HTML ───────┘
           (rapide, contenu à jour)
```

### 2.2 Implémentation ISR avec Node.js

```js
// isr-server.mjs — Serveur ISR complet
import { createServer } from 'node:http';

// --- Stockage en mémoire (simule un cache CDN) ---
const pageCache = new Map();  // slug → { html, generatedAt, revalidating }

// --- Configuration ---
const REVALIDATE_SECONDS = 60; // Regénérer toutes les 60 secondes

// --- Simule un CMS / une API distante ---
async function fetchArticleFromCMS(slug) {
  // Simule un délai réseau de 500ms
  await new Promise(resolve => setTimeout(resolve, 500));

  const now = new Date().toISOString();
  return {
    slug,
    title: `Article : ${slug}`,
    body: `<p>Contenu récupéré depuis le CMS à ${now}</p>
           <p>Ceci simule des données fraîches qui changent à chaque fetch.</p>`,
    fetchedAt: now,
  };
}

// --- Génère le HTML d'une page ---
function renderPage(article) {
  return `<!DOCTYPE html>
<html lang="fr">
<head><meta charset="UTF-8"><title>${article.title}</title></head>
<body>
  <h1>${article.title}</h1>
  <main>${article.body}</main>
  <footer>
    <small>Données récupérées à : ${article.fetchedAt}</small><br>
    <small>Page générée à : ${new Date().toISOString()}</small>
  </footer>
</body>
</html>`;
}

// --- Logique ISR ---
async function handleISR(slug) {
  const cached = pageCache.get(slug);
  const now = Date.now();

  // Cas 1 : page dans le cache et TTL valide → servir depuis le cache
  if (cached && (now - cached.generatedAt) < REVALIDATE_SECONDS * 1000) {
    return { html: cached.html, status: 'HIT', age: Math.floor((now - cached.generatedAt) / 1000) };
  }

  // Cas 2 : page dans le cache mais TTL expiré → servir stale + revalider en arrière-plan
  if (cached) {
    // Lancer la revalidation en arrière-plan (fire-and-forget)
    if (!cached.revalidating) {
      cached.revalidating = true;
      console.log(`[ISR] Revalidation en arrière-plan pour : ${slug}`);

      // Ne pas attendre (await) — c'est le principe du background revalidation
      fetchArticleFromCMS(slug)
        .then(article => {
          const html = renderPage(article);
          pageCache.set(slug, { html, generatedAt: Date.now(), revalidating: false });
          console.log(`[ISR] Revalidation terminée pour : ${slug}`);
        })
        .catch(err => {
          console.error(`[ISR] Erreur de revalidation pour ${slug}:`, err);
          cached.revalidating = false; // Permettre un nouveau essai
        });
    }

    // Servir la version stale immédiatement
    const age = Math.floor((now - cached.generatedAt) / 1000);
    return { html: cached.html, status: 'STALE', age };
  }

  // Cas 3 : page jamais générée → générer pour la première fois (blocking)
  console.log(`[ISR] Première génération (bloquante) pour : ${slug}`);
  const article = await fetchArticleFromCMS(slug);
  const html = renderPage(article);
  pageCache.set(slug, { html, generatedAt: Date.now(), revalidating: false });
  return { html, status: 'MISS', age: 0 };
}

// --- Serveur HTTP ---
const server = createServer(async (req, res) => {
  const match = req.url.match(/^\/articles\/([a-z0-9-]+)$/);

  if (!match) {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(`<h1>ISR Demo</h1>
      <p>Essaye : <a href="/articles/http-caching">/articles/http-caching</a></p>
      <p>Recharge la page après ${REVALIDATE_SECONDS}s pour voir la revalidation.</p>`);
    return;
  }

  const slug = match[1];
  const start = Date.now();

  try {
    const { html, status, age } = await handleISR(slug);
    const duration = Date.now() - start;

    res.writeHead(200, {
      'Content-Type': 'text/html; charset=utf-8',
      'X-Cache-Status': status,       // HIT, STALE, ou MISS
      'X-Cache-Age': String(age),
      'X-Response-Time': `${duration}ms`,
      // En-tête stale-while-revalidate pour les CDN qui le supportent
      'Cache-Control': `public, s-maxage=${REVALIDATE_SECONDS}, stale-while-revalidate=${REVALIDATE_SECONDS * 10}`,
    });
    res.end(html);

    console.log(`[${status}] ${slug} — age=${age}s — ${duration}ms`);
  } catch (err) {
    res.writeHead(500, { 'Content-Type': 'text/plain' });
    res.end('Erreur serveur');
    console.error(err);
  }
});

server.listen(3000, () => {
  console.log('Serveur ISR → http://localhost:3000');
  console.log(`TTL de revalidation : ${REVALIDATE_SECONDS}s`);
});
```

### 2.3 On-Demand Revalidation

Parfois, tu ne veux pas attendre l'expiration du TTL. Par exemple, quand un éditeur publie un article dans le CMS, tu veux que la page soit régénérée **immédiatement**. C'est la **revalidation à la demande** (on-demand revalidation).

```js
// on-demand-revalidation.mjs — Webhook de revalidation
import { createServer } from 'node:http';

const pageCache = new Map();
const REVALIDATE_SECRET = 'mon-secret-webhook-2025';

async function fetchFromCMS(slug) {
  await new Promise(r => setTimeout(r, 300));
  return {
    slug,
    title: `Article : ${slug}`,
    body: `<p>Mis à jour à ${new Date().toISOString()}</p>`,
  };
}

function renderHTML(article) {
  return `<!DOCTYPE html>
<html><head><title>${article.title}</title></head>
<body><h1>${article.title}</h1><main>${article.body}</main></body></html>`;
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');

  // ─── Endpoint de revalidation (appelé par le webhook du CMS) ───
  if (req.method === 'POST' && url.pathname === '/api/revalidate') {
    let body = '';
    for await (const chunk of req) body += chunk;

    let payload;
    try {
      payload = JSON.parse(body);
    } catch {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'JSON invalide' }));
      return;
    }

    // Vérifier le secret (sécurité)
    if (payload.secret !== REVALIDATE_SECRET) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Secret invalide' }));
      return;
    }

    const { slug } = payload;
    if (!slug) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'slug manquant' }));
      return;
    }

    console.log(`[REVALIDATE] Revalidation on-demand déclenchée pour : ${slug}`);

    // Regénérer la page immédiatement
    const article = await fetchFromCMS(slug);
    const html = renderHTML(article);
    pageCache.set(slug, { html, generatedAt: Date.now() });

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ revalidated: true, slug, at: new Date().toISOString() }));
    return;
  }

  // ─── Servir les pages statiques ───
  const match = url.pathname.match(/^\/articles\/([a-z0-9-]+)$/);
  if (match) {
    const slug = match[1];
    const cached = pageCache.get(slug);

    if (cached) {
      res.writeHead(200, {
        'Content-Type': 'text/html',
        'X-Cache': 'HIT',
      });
      res.end(cached.html);
    } else {
      // Première génération
      const article = await fetchFromCMS(slug);
      const html = renderHTML(article);
      pageCache.set(slug, { html, generatedAt: Date.now() });
      res.writeHead(200, { 'Content-Type': 'text/html', 'X-Cache': 'MISS' });
      res.end(html);
    }
    return;
  }

  res.writeHead(404);
  res.end('Not Found');
});

server.listen(3000, () => {
  console.log('Serveur avec on-demand revalidation → http://localhost:3000');
  console.log('\nPour revalider manuellement :');
  console.log(`curl -X POST http://localhost:3000/api/revalidate \\`);
  console.log(`  -H "Content-Type: application/json" \\`);
  console.log(`  -d '{"secret":"${REVALIDATE_SECRET}","slug":"http-caching"}'`);
});
```

**Flow de la revalidation on-demand :**

```
┌──────────┐    Webhook     ┌──────────────┐    Revalidate    ┌──────────┐
│   CMS    │───────────────▶│  /api/       │────────────────▶│  Cache   │
│ (éditeur │   POST + slug  │  revalidate  │   fetch + render │  (Map)   │
│  publie) │                └──────────────┘                  └──────────┘
└──────────┘                                                       │
                                                                   ▼
                                                          Page mise à jour
                                                          immédiatement
```

---

## 3. Comparaison SSR vs SSG vs ISR

### 3.1 Tableau comparatif

| Critère | SSR | SSG | ISR |
|---------|-----|-----|-----|
| **Quand le HTML est généré** | À chaque requête | Au build uniquement | Au build + regénération |
| **TTFB** | Lent (100-500ms) | Ultra-rapide (<50ms) | Ultra-rapide (cache) |
| **Fraîcheur des données** | Temps réel | Figé au build | Configurable (TTL) |
| **Charge serveur** | Élevée | Nulle | Minimale |
| **Personnalisation** | Complète | Aucune (sans JS) | Aucune (sans JS) |
| **SEO** | Excellent | Excellent | Excellent |
| **Temps de build** | N/A | Long si beaucoup de pages | Court (incrémental) |
| **Coût d'hébergement** | Élevé (serveurs) | Très bas (CDN statique) | Modéré |
| **Invalidation** | Automatique | Rebuild complet | TTL ou on-demand |

### 3.2 Matrice de décision

```
                    Données changent souvent ?
                    │
            ┌───────┴───────┐
            │               │
           OUI             NON
            │               │
     Personnalisation    ┌──┴──┐
     par utilisateur ?   │     │
            │            SSG   ISR
     ┌──────┴──────┐     (blog  (si tu veux
     │             │     docs)   quand même
    OUI           NON            rafraîchir)
     │             │
    SSR           ISR
  (dashboard,   (e-commerce,
   profil)       actualités)
```

### 3.3 Quand utiliser quoi — exemples concrets

| Type de site | Stratégie | Pourquoi |
|-------------|-----------|----------|
| Documentation technique | **SSG** | Contenu stable, build rapide |
| Blog personnel | **SSG** | Peu de pages, contenu rarement mis à jour |
| Site e-commerce (fiches produit) | **ISR** (60s) | Milliers de pages, prix changent |
| Dashboard utilisateur | **SSR** | Données personnalisées en temps réel |
| Site d'actualités | **ISR** (10-30s) | Fraîcheur importante, beaucoup de pages |
| Landing page marketing | **SSG** | Contenu figé, performance maximale |
| Réseau social (feed) | **SSR** | Contenu personnalisé en temps réel |

---

## 4. Le rôle du cache HTTP dans le SSG et l'ISR

### 4.1 En-têtes optimaux par stratégie

```js
// headers-par-strategie.mjs — Démonstration des en-têtes recommandés
import { createServer } from 'node:http';

function getOptimalHeaders(strategy) {
  switch (strategy) {
    case 'ssg':
      return {
        // Page SSG : ne change jamais entre deux builds
        // → cache agressif avec immutable
        'Cache-Control': 'public, max-age=31536000, immutable',
        'CDN-Cache-Control': 'public, max-age=31536000',
      };

    case 'ssg-with-etag':
      return {
        // SSG mais on veut pouvoir invalider au prochain build
        // → max-age court + ETag pour revalidation
        'Cache-Control': 'public, max-age=3600, must-revalidate',
        'ETag': `"build-${Date.now()}"`,
      };

    case 'isr':
      return {
        // ISR : fraîcheur configurée par le TTL
        // → s-maxage pour le CDN + stale-while-revalidate
        'Cache-Control': 'public, max-age=0, s-maxage=60, stale-while-revalidate=600',
        'CDN-Cache-Control': 'public, max-age=60, stale-while-revalidate=600',
      };

    case 'ssr':
      return {
        // SSR dynamique : ne pas cacher (ou très peu)
        'Cache-Control': 'private, no-cache, no-store, must-revalidate',
        'Vary': 'Cookie, Authorization',
      };

    default:
      return { 'Cache-Control': 'no-store' };
  }
}

const server = createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const strategy = url.searchParams.get('strategy') || 'ssg';

  const headers = getOptimalHeaders(strategy);

  res.writeHead(200, {
    'Content-Type': 'text/html; charset=utf-8',
    ...headers,
    'X-Rendering-Strategy': strategy.toUpperCase(),
  });

  const headersList = Object.entries(headers)
    .map(([k, v]) => `<tr><td><code>${k}</code></td><td><code>${v}</code></td></tr>`)
    .join('');

  res.end(`<!DOCTYPE html>
<html lang="fr">
<head><meta charset="UTF-8"><title>En-têtes ${strategy}</title></head>
<body>
  <h1>Stratégie : ${strategy.toUpperCase()}</h1>
  <table border="1" cellpadding="8">
    <tr><th>En-tête</th><th>Valeur</th></tr>
    ${headersList}
  </table>
  <p>Essaye : ?strategy=ssg | ssg-with-etag | isr | ssr</p>
</body>
</html>`);
});

server.listen(3000, () => console.log('Headers demo → http://localhost:3000?strategy=isr'));
```

### 4.2 Interaction CDN et ISR

```
Requête utilisateur
       │
       ▼
┌──────────────┐   Cache HIT    ┌──────────────┐
│   CDN Edge   │◀──────────────▶│  Cache CDN   │
│   (Paris)    │                │  s-maxage=60  │
└──────┬───────┘                └──────────────┘
       │
       │ Cache MISS ou STALE
       │
       ▼
┌──────────────┐   Regénère     ┌──────────────┐
│  Serveur     │──────────────▶│  CMS / API   │
│  Origine     │  (background)  │  (données)   │
└──────────────┘                └──────────────┘
       │
       │ Nouvelle page HTML
       │
       ▼
  Met à jour le cache CDN
  pour les prochaines requêtes
```

---

## 5. Patterns avancés

### 5.1 Fallback : blocking vs non-blocking

Quand une page n'a **jamais été générée** (ex. un nouvel article), deux stratégies sont possibles :

```js
// fallback-strategies.mjs
import { createServer } from 'node:http';

const cache = new Map();

async function generatePage(slug) {
  await new Promise(r => setTimeout(r, 800)); // Simule le rendu
  return `<html><body><h1>${slug}</h1><p>Généré à ${new Date().toISOString()}</p></body></html>`;
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const slug = url.pathname.slice(1) || 'index';
  const mode = url.searchParams.get('fallback') || 'blocking';

  if (cache.has(slug)) {
    res.writeHead(200, { 'Content-Type': 'text/html', 'X-Fallback': 'none (cached)' });
    res.end(cache.get(slug));
    return;
  }

  if (mode === 'blocking') {
    // BLOCKING : l'utilisateur attend que la page soit générée
    // + Avantage : le HTML est complet au premier rendu
    // - Inconvénient : TTFB élevé pour la première requête
    const html = await generatePage(slug);
    cache.set(slug, html);
    res.writeHead(200, { 'Content-Type': 'text/html', 'X-Fallback': 'blocking' });
    res.end(html);
  } else {
    // NON-BLOCKING : on sert un squelette immédiatement
    // + Avantage : TTFB rapide
    // - Inconvénient : le contenu apparaît après un chargement côté client
    res.writeHead(200, { 'Content-Type': 'text/html', 'X-Fallback': 'skeleton' });
    res.end(`<html><body>
      <h1>Chargement...</h1>
      <script>
        // En vrai, on ferait un fetch API ici pour charger le contenu
        setTimeout(() => {
          document.querySelector('h1').textContent = '${slug}';
          document.body.innerHTML += '<p>Contenu chargé côté client</p>';
        }, 1000);
      </script>
    </body></html>`);

    // Générer en arrière-plan pour les prochaines requêtes
    generatePage(slug).then(html => cache.set(slug, html));
  }
});

server.listen(3000, () => console.log('Fallback demo → http://localhost:3000/mon-article?fallback=blocking'));
```

### 5.2 Cache tags pour invalidation ciblée

```js
// cache-tags.mjs — Invalidation par tags (comme Fastly, Cloudflare)
import { createServer } from 'node:http';

// Cache avec support de tags
const cache = new Map();      // url → { html, tags, generatedAt }
const tagIndex = new Map();   // tag → Set<url>

function cacheSet(url, html, tags) {
  cache.set(url, { html, tags, generatedAt: Date.now() });
  for (const tag of tags) {
    if (!tagIndex.has(tag)) tagIndex.set(tag, new Set());
    tagIndex.get(tag).add(url);
  }
}

function purgeByTag(tag) {
  const urls = tagIndex.get(tag);
  if (!urls) return 0;
  let count = 0;
  for (const url of urls) {
    cache.delete(url);
    count++;
  }
  tagIndex.delete(tag);
  return count;
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');

  // Endpoint de purge par tag
  if (req.method === 'PURGE') {
    const tag = url.searchParams.get('tag');
    const purged = purgeByTag(tag);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ purged, tag }));
    return;
  }

  // Servir depuis le cache ou générer
  const cached = cache.get(url.pathname);
  if (cached) {
    res.writeHead(200, {
      'Content-Type': 'text/html',
      'X-Cache': 'HIT',
      'X-Cache-Tags': cached.tags.join(', '),
    });
    res.end(cached.html);
    return;
  }

  // Simuler une page produit avec des tags
  const html = `<html><body><h1>Produit ${url.pathname}</h1>
    <p>Généré à ${new Date().toISOString()}</p></body></html>`;
  const tags = ['products', `product:${url.pathname}`, 'catalog'];

  cacheSet(url.pathname, html, tags);

  res.writeHead(200, {
    'Content-Type': 'text/html',
    'X-Cache': 'MISS',
    'X-Cache-Tags': tags.join(', '),
    'Cache-Tag': tags.join(', '),  // En-tête standard Cloudflare/Fastly
  });
  res.end(html);
});

server.listen(3000, () => {
  console.log('Cache Tags demo → http://localhost:3000/chaussures-running');
  console.log('\nPurger tous les produits :');
  console.log('curl -X PURGE "http://localhost:3000?tag=products"');
});
```

---

## Points clés

1. **SSG** génère toutes les pages au build — performance maximale mais contenu figé.
2. **ISR** combine SSG + revalidation en arrière-plan — pages statiques avec fraîcheur configurable.
3. Le flow ISR : servir la page en cache → si périmée, déclencher une régénération background → la prochaine requête reçoit la version fraîche.
4. La **revalidation on-demand** permet de régénérer une page immédiatement via un webhook (publication CMS, etc.).
5. L'en-tête `stale-while-revalidate` est le mécanisme HTTP natif qui correspond au comportement ISR.
6. Le choix SSR/SSG/ISR dépend de deux axes : la **fréquence de changement** des données et le **besoin de personnalisation**.
7. Les **cache tags** permettent une invalidation ciblée : purger toutes les pages d'une catégorie sans tout reconstruire.
8. En SSG pur, on peut utiliser `Cache-Control: immutable` car les fichiers ne changent jamais entre deux builds.

---

## Lab associé

→ `labs/11-isr-ssg/` — Construire un mini-framework ISR avec cache en mémoire, TTL configurable, endpoint de revalidation on-demand, et observer les en-têtes X-Cache-Status.

---

## Pour aller plus loin

- [RFC 5861 — stale-while-revalidate](https://httpwg.org/specs/rfc5861.html)
- [Patterns ISR dans Next.js](https://nextjs.org/docs/basic-features/data-fetching/incremental-static-regeneration)
- [Cloudflare Cache Tags](https://developers.cloudflare.com/cache/how-to/purge-cache/purge-by-tags/)
- [Vercel ISR documentation](https://vercel.com/docs/concepts/incremental-static-regeneration)

---

## Si tu es perdu

Pense à un **journal quotidien** :

- **SSG** = tu imprimes le journal **une fois le matin** et tu distribues les mêmes exemplaires toute la journée. Rapide, pas cher, mais les nouvelles de l'après-midi ne sont pas dedans.
- **SSR** = tu **réécris le journal à chaque fois** que quelqu'un le demande. Toujours à jour, mais ça coûte cher et c'est lent.
- **ISR** = tu imprimes le journal le matin, mais **toutes les heures**, un journaliste vérifie s'il y a des changements importants. Si oui, il imprime une **édition mise à jour**. Les gens qui arrivent entre deux éditions reçoivent la dernière version imprimée — pas parfaitement à jour, mais bien assez.

La **revalidation on-demand**, c'est quand le rédacteur en chef appelle directement l'imprimerie pour dire : « Imprime une édition spéciale MAINTENANT, il y a un scoop ! »

---

## Défi

### Construis un serveur ISR avec statistiques

Crée un serveur Node.js qui :

1. Sert des pages avec un cache ISR (TTL configurable via query string `?ttl=30`)
2. Compte les HIT, MISS et STALE pour chaque page
3. Expose un endpoint `/stats` qui affiche les statistiques en JSON
4. Expose un endpoint `POST /purge/:slug` pour la revalidation on-demand
5. Ajoute un en-tête `X-Cache-Generation` qui s'incrémente à chaque régénération

**Bonus** : Ajoute un endpoint `/dashboard` qui affiche les statistiques sous forme de tableau HTML.

<details>
<summary>Voir la solution</summary>

```js
// defi-11-isr-stats.mjs
import { createServer } from 'node:http';

const cache = new Map();   // slug → { html, generatedAt, generation }
const stats = new Map();   // slug → { hit: 0, miss: 0, stale: 0 }

async function fetchData(slug) {
  await new Promise(r => setTimeout(r, 200));
  return { slug, title: slug, content: `Données à ${new Date().toISOString()}` };
}

function render(data, generation) {
  return `<html><body>
    <h1>${data.title}</h1>
    <p>${data.content}</p>
    <small>Génération #${generation}</small>
  </body></html>`;
}

function incrStat(slug, type) {
  if (!stats.has(slug)) stats.set(slug, { hit: 0, miss: 0, stale: 0 });
  stats.get(slug)[type]++;
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');

  // Dashboard HTML
  if (url.pathname === '/dashboard') {
    const rows = [...stats.entries()]
      .map(([slug, s]) => `<tr><td>${slug}</td><td>${s.hit}</td><td>${s.miss}</td><td>${s.stale}</td></tr>`)
      .join('');
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(`<html><body><h1>Dashboard ISR</h1>
      <table border="1" cellpadding="4">
        <tr><th>Slug</th><th>HIT</th><th>MISS</th><th>STALE</th></tr>
        ${rows || '<tr><td colspan="4">Aucune donnée</td></tr>'}
      </table></body></html>`);
    return;
  }

  // Stats JSON
  if (url.pathname === '/stats') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(Object.fromEntries(stats), null, 2));
    return;
  }

  // Purge on-demand
  if (req.method === 'POST' && url.pathname.startsWith('/purge/')) {
    const slug = url.pathname.slice(7);
    cache.delete(slug);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ purged: slug }));
    return;
  }

  // ISR page
  const slug = url.pathname.slice(1) || 'index';
  const ttl = parseInt(url.searchParams.get('ttl') || '60', 10) * 1000;
  const now = Date.now();
  const cached = cache.get(slug);

  if (cached && (now - cached.generatedAt) < ttl) {
    incrStat(slug, 'hit');
    res.writeHead(200, {
      'Content-Type': 'text/html',
      'X-Cache': 'HIT',
      'X-Cache-Generation': String(cached.generation),
    });
    res.end(cached.html);
    return;
  }

  if (cached) {
    incrStat(slug, 'stale');
    // Background revalidation
    if (!cached.revalidating) {
      cached.revalidating = true;
      fetchData(slug).then(data => {
        const gen = cached.generation + 1;
        cache.set(slug, {
          html: render(data, gen),
          generatedAt: Date.now(),
          generation: gen,
          revalidating: false,
        });
      });
    }
    res.writeHead(200, {
      'Content-Type': 'text/html',
      'X-Cache': 'STALE',
      'X-Cache-Generation': String(cached.generation),
    });
    res.end(cached.html);
    return;
  }

  // MISS — première génération
  incrStat(slug, 'miss');
  const data = await fetchData(slug);
  const generation = 1;
  const html = render(data, generation);
  cache.set(slug, { html, generatedAt: now, generation, revalidating: false });
  res.writeHead(200, {
    'Content-Type': 'text/html',
    'X-Cache': 'MISS',
    'X-Cache-Generation': '1',
  });
  res.end(html);
});

server.listen(3000, () => {
  console.log('ISR Stats → http://localhost:3000/mon-article?ttl=10');
  console.log('Dashboard → http://localhost:3000/dashboard');
  console.log('Stats    → http://localhost:3000/stats');
});
```

</details>

---

## En pratique — Configuration Next.js

Next.js (App Router) implémente nativement SSG et ISR. Voici les configurations les plus courantes.

### SSG — Génération statique au build

```typescript
// app/blog/[slug]/page.tsx — SSG pur
// POURQUOI : generateStaticParams dit à Next.js de pré-rendre ces pages au build.
// Elles seront servies comme des fichiers statiques (TTFB minimal).

export async function generateStaticParams() {
  const posts = await fetch('https://api.example.com/posts').then(r => r.json());
  return posts.map((post) => ({ slug: post.slug }));
}

// dynamicParams = false → retourne 404 pour les slugs non pré-rendus
export const dynamicParams = false;

export default async function BlogPost({ params }) {
  const post = await fetch(`https://api.example.com/posts/${params.slug}`);
  return <article>{/* ... */}</article>;
}
```

### ISR — Régénération incrémentale

```typescript
// app/products/[id]/page.tsx — ISR
// POURQUOI : revalidate = 3600 signifie que la page est re-générée en background
// toutes les heures maximum. L'utilisateur reçoit toujours la version cachée
// instantanément, comme du SSG.

export const revalidate = 3600; // ISR : revalider toutes les heures

export default async function ProductPage({ params }) {
  // Ce fetch hérite du revalidate de la page
  const product = await fetch(`https://api.example.com/products/${params.id}`);
  return <div>{/* ... */}</div>;
}
```

### On-demand revalidation — Webhook

```typescript
// app/api/revalidate/route.ts — Revalidation à la demande
// POURQUOI : Quand le CMS publie un nouveau contenu, il appelle ce webhook
// pour forcer la re-génération immédiate des pages concernées.

import { revalidatePath, revalidateTag } from 'next/cache';

export async function POST(request) {
  const { path, tag, secret } = await request.json();

  // Vérifier le secret pour éviter les appels non autorisés
  if (secret !== process.env.REVALIDATION_SECRET) {
    return Response.json({ error: 'Invalid secret' }, { status: 401 });
  }

  // Revalider par chemin OU par tag
  if (path) revalidatePath(path);       // Ex: revalidatePath('/blog/mon-article')
  if (tag) revalidateTag(tag);           // Ex: revalidateTag('blog-posts')

  return Response.json({ revalidated: true, now: Date.now() });
}
```

### Cache tags avec fetch

```typescript
// Taguer les requêtes fetch pour la revalidation ciblée
const posts = await fetch('https://api.example.com/posts', {
  next: { tags: ['blog-posts'] }  // Ce fetch sera invalidé par revalidateTag('blog-posts')
});

const product = await fetch(`https://api.example.com/products/${id}`, {
  next: {
    revalidate: 60,               // ISR au niveau fetch (60s)
    tags: [`product-${id}`]       // Tag pour invalidation ciblée
  }
});
```

### Comparaison des options Next.js

| Configuration | Comportement | Équivalent |
|--------------|-------------|------------|
| `revalidate = 0` ou `dynamic = 'force-dynamic'` | SSR pur (pas de cache) | `Cache-Control: no-store` |
| `revalidate = false` (défaut) | SSG pur (build-time) | `Cache-Control: immutable` |
| `revalidate = 3600` | ISR (re-générer toutes les heures) | `Cache-Control: s-maxage=3600, stale-while-revalidate` |
| `revalidatePath('/blog')` | On-demand revalidation | Purge CDN par URL |
| `revalidateTag('posts')` | Revalidation par tag | Purge CDN par surrogate key |
