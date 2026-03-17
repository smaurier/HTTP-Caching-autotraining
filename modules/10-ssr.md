# Module 10 — SSR (Server-Side Rendering) et Cache

> **Objectif** : Comprendre le cycle de rendu SSR, le concept d'hydration, le streaming SSR, la gestion du state initial et les stratégies de cache pour le HTML généré cote serveur.
> **Difficulte** : :star::star::star::star:

---

> **SSR cross-cours** : le SSR est aussi couvert dans 03-Vue module 04 (SSR/Hydration, Nuxt 3) et 08-React module 06 (Next.js App Router, Server Components). Ici l'angle est protocole HTTP : cache du HTML généré, streaming, CDN, stratégies de revalidation.

> **⚠️ Les modules 10, 11 et 12 passent en niveau expert.** C'est normal que ça soit plus difficile — SSR, ISR et Edge Rendering sont des sujets avances. Tu as toutes les bases (modules 00-09). Si un module te bloque, note ce que tu ne comprends pas et passe au suivant — ces concepts se clarifient quand tu les vois en pratique dans les cours Vue/React/Angular.

## 1. Pourquoi SSR ?

### 1.1 Le problème du CSR (Client-Side Rendering)

Avec une SPA classique (React, Vue, Angular), le HTML initial est presque vide :

```html
<!-- Ce que le serveur envoie -->
<!DOCTYPE html>
<html>
<head><title>Mon App</title></head>
<body>
  <div id="root"></div>
  <script src="/app.a1b2c3.js"></script>
</body>
</html>
```

```
Timeline CSR :
==============

  |--- HTML vide (1 Ko) ---|--- Telecharge JS (200 Ko) ---|--- Execute JS ---|--- Fetch API ---|--- Affichage ---|
  0                        200ms                          600ms              800ms             1200ms             1500ms

  TTFB: 200ms    FCP: 1200ms (tard !)    TTI: 1500ms

  L'utilisateur voit un ecran blanc pendant 1.2 secondes.
  Google Bot voit un <div> vide (mauvais pour le SEO).
```

### 1.2 La solution SSR

Le serveur exécuté le JavaScript, généré le HTML complet et l'envoie :

```html
<!-- Ce que le serveur envoie avec SSR -->
<!DOCTYPE html>
<html>
<head><title>Mon App</title></head>
<body>
  <div id="root">
    <header><nav>...</nav></header>
    <main>
      <h1>Produit : Clavier mecanique</h1>
      <p>Prix : 89.99 EUR</p>
      <button disabled>Ajouter au panier</button>
    </main>
  </div>
  <script src="/app.a1b2c3.js"></script>
</body>
</html>
```

```
Timeline SSR :
==============

  |--- Serveur genere HTML ---|--- HTML complet (15 Ko) ---|--- Affichage ---|--- JS charge ---|--- Hydration ---|
  0                          150ms                        250ms             300ms             700ms              900ms

  TTFB: 250ms (un peu plus)    FCP: 300ms (tres tot !)    TTI: 900ms

  L'utilisateur voit du contenu apres 300ms.
  Google Bot voit tout le HTML (excellent pour le SEO).
```

### 1.3 Comparaison CSR vs SSR

| Critere | CSR | SSR |
|---------|-----|-----|
| TTFB | Rapide (~100ms) | Plus lent (~250ms) |
| FCP (First Contentful Paint) | Lent (~1200ms) | Rapide (~300ms) |
| TTI (Time to Interactive) | ~1500ms | ~900ms |
| SEO | Mauvais | Excellent |
| Complexite serveur | Faible | Elevee |
| Charge serveur | Faible | Elevee (CPU) |
| Perception utilisateur | Ecran blanc | Contenu immediat |

### 1.4 Les 3 avantages clés du SSR

```
1. SEO : Google Bot recoit du HTML complet, pas un <div> vide
2. TTFB percu : l'utilisateur voit du contenu des le premier octet
3. Performance percue : meme si le TTI est similaire, l'utilisateur
   "voit" quelque chose immediatement --> meilleure UX
```

---

## 2. Cycle SSR : requête -> render -> HTML -> envoi -> hydration

### 2.1 Le cycle complet

```
Client                     Serveur                       Client (apres reception)
------                     -------                       -----------------------

GET /produit/42 --------->
                           1. Recevoir la requete
                           2. Fetch des donnees (DB/API)
                           3. Render composants -> HTML
                           4. Serialiser le state
                           5. Assembler le HTML final
                  <------- 6. Envoyer la reponse

7. Afficher le HTML (statique, non interactif)
8. Telecharger le JS
9. Executer le JS
10. Hydration : attacher les event listeners
11. Page interactive !
```

### 2.2 Implementation SSR avec `node:http`

```js
import { createServer } from 'node:http';

// ---- Simuler un "framework" SSR minimal ----

// Nos "composants" (fonctions qui retournent du HTML)
function Header() {
  return `
    <header style="background:#1a1a2e;color:white;padding:1rem;">
      <nav>
        <a href="/" style="color:white;">Accueil</a> |
        <a href="/produits" style="color:white;">Produits</a>
      </nav>
    </header>`;
}

function ProductCard(product) {
  return `
    <article style="border:1px solid #ddd;padding:1rem;margin:1rem;border-radius:8px;">
      <h2>${escapeHtml(product.nom)}</h2>
      <p style="font-size:1.5rem;color:#e94560;">${product.prix.toFixed(2)} EUR</p>
      <p>Stock : ${product.stock} unites</p>
      <button
        data-product-id="${product.id}"
        data-action="add-to-cart"
        style="padding:0.5rem 1rem;background:#0f3460;color:white;border:none;cursor:pointer;">
        Ajouter au panier
      </button>
    </article>`;
}

function Layout(title, content, initialState) {
  return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)}</title>
  <style>
    body { font-family: system-ui, sans-serif; margin: 0; }
    main { max-width: 800px; margin: 0 auto; padding: 1rem; }
  </style>
</head>
<body>
  <div id="root">
    ${Header()}
    <main>${content}</main>
  </div>
  <script>
    // State initial serialise pour l'hydration
    window.__INITIAL_STATE__ = ${JSON.stringify(initialState)};
  </script>
  <script src="/client.js" defer></script>
</body>
</html>`;
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ---- "Base de donnees" ----
const products = [
  { id: 1, nom: 'Clavier mecanique', prix: 89.99, stock: 15 },
  { id: 2, nom: 'Souris ergonomique', prix: 49.99, stock: 23 },
  { id: 3, nom: 'Ecran 4K 27"', prix: 349.99, stock: 7 },
  { id: 4, nom: 'Casque sans fil', prix: 129.99, stock: 42 }
];

async function fetchProduct(id) {
  // Simuler la latence DB
  await new Promise(r => setTimeout(r, 20));
  return products.find(p => p.id === Number(id)) || null;
}

async function fetchAllProducts() {
  await new Promise(r => setTimeout(r, 30));
  return products;
}

// ---- Serveur SSR ----
const server = createServer(async (req, res) => {
  const start = Date.now();

  // ---- Script client (hydration) ----
  if (req.url === '/client.js') {
    res.writeHead(200, {
      'Content-Type': 'application/javascript',
      'Cache-Control': 'max-age=31536000, immutable'
    });
    res.end(`
      // ---- Hydration ----
      console.log('Hydration demarree');
      console.log('State initial:', window.__INITIAL_STATE__);

      // Attacher les event listeners sur les boutons existants
      document.querySelectorAll('[data-action="add-to-cart"]').forEach(button => {
        button.addEventListener('click', (e) => {
          const productId = e.target.dataset.productId;
          alert('Produit ' + productId + ' ajoute au panier !');
          console.log('Ajout au panier:', productId);
        });
        // Le bouton est maintenant interactif
        button.style.opacity = '1';
      });

      console.log('Hydration terminee -- page interactive !');
    `);
    return;
  }

  // ---- Page liste produits (SSR) ----
  if (req.url === '/' || req.url === '/produits') {
    const allProducts = await fetchAllProducts();

    const content = `
      <h1>Nos produits</h1>
      ${allProducts.map(p => ProductCard(p)).join('')}
    `;

    const initialState = {
      products: allProducts,
      page: 'list',
      timestamp: Date.now()
    };

    const html = Layout('Nos produits', content, initialState);
    const elapsed = Date.now() - start;

    res.writeHead(200, {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'public, max-age=30, stale-while-revalidate=60',
      'X-SSR-Time': `${elapsed}ms`,
      'Vary': 'Accept-Encoding'
    });
    res.end(html);
    return;
  }

  // ---- Page produit individuel (SSR) ----
  const match = req.url.match(/^\/produit\/(\d+)$/);
  if (match) {
    const product = await fetchProduct(match[1]);

    if (!product) {
      res.writeHead(404, { 'Content-Type': 'text/html' });
      res.end(Layout('Non trouve', '<h1>Produit non trouve</h1>', { error: 404 }));
      return;
    }

    const content = ProductCard(product);
    const initialState = {
      product,
      page: 'detail',
      timestamp: Date.now()
    };

    const html = Layout(product.nom, content, initialState);
    const elapsed = Date.now() - start;

    res.writeHead(200, {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'public, max-age=30, stale-while-revalidate=60',
      'Surrogate-Key': `product-${product.id} products`,
      'X-SSR-Time': `${elapsed}ms`,
      'Vary': 'Accept-Encoding'
    });
    res.end(html);
    return;
  }

  res.writeHead(404);
  res.end('Not found');
});

server.listen(3000, () => {
  console.log('Serveur SSR sur http://localhost:3000');
  console.log('Pages disponibles :');
  console.log('  http://localhost:3000/          (liste produits)');
  console.log('  http://localhost:3000/produit/1 (detail produit)');
});
```

---

## 3. Hydration : concept, cout, "uncanny valley"

### 3.1 Qu'est-ce que l'hydration ?

L'hydration est le processus par lequel le JavaScript cote client **"prend le controle"** du HTML généré par le serveur :

```
HTML SSR (statique)          +  JavaScript client      =  Page interactive
                             |
<button>Ajouter</button>     |  button.addEventListener  =  <button onclick="...">
(visible mais ne fait rien)  |  ('click', handler)           Ajouter
                             |                               </button>
```

### 3.2 L'analogie du mannequin

Imagine un magasin de vetements :
- **SSR** = mettre des mannequins habilles en vitrine (le client voit immediatement les vetements)
- **Hydration** = remplacer chaque mannequin par un vendeur vivant (qui peut interagir avec le client)

Pendant le remplacement, les mannequins sont la mais ne peuvent pas repondre aux questions -- c'est la "uncanny valley" du SSR.

### 3.3 L'Uncanny Valley du SSR

```
Timeline de l'experience utilisateur :
========================================

  |---- HTML recu ----|---- JS telecharge ----|---- Hydration ----|
  0                  300ms                   700ms               900ms

  [Ecran blanc]  -->  [Contenu visible     ]  -->  [Page interactive]
                      [mais non interactif ]
                      |                     |
                      +-- UNCANNY VALLEY ---+

  L'utilisateur VOIT un bouton "Ajouter au panier".
  Il CLIQUE dessus.
  RIEN ne se passe.
  Il est frustre.

  C'est l'Uncanny Valley : ca RESSEMBLE a une page interactive,
  mais ca ne l'est pas encore.
```

### 3.4 Mesurer le cout de l'hydration

```js
// Dans le script client
const hydrationStart = performance.now();

// ... hydration ...

const hydrationEnd = performance.now();
console.log(`Hydration: ${(hydrationEnd - hydrationStart).toFixed(1)}ms`);

// Reporter comme metrique
if ('PerformanceObserver' in window) {
  performance.measure('hydration', {
    start: hydrationStart,
    end: hydrationEnd
  });
}
```

### 3.5 Solutions pour reduire le cout d'hydration

| Technique | Description | Complexite |
|-----------|-------------|------------|
| Progressive Hydration | Hydrater section par section, en priorite ce qui est visible | Moyenne |
| Partial Hydration | Ne pas hydrater les parties statiques (Astro "islands") | Moyenne |
| Resumability | Pas d'hydration du tout, le framework reprend la ou le serveur s'est arrete (Qwik) | Elevee |
| Selective Hydration | React 18+ : hydrater en priorite les composants avec lesquels l'utilisateur interagit | Faible (React) |

---

## 4. Streaming SSR

### 4.1 Le problème du SSR classique

En SSR classique, le serveur doit attendre que **tout** le HTML soit généré avant de commencer a envoyer :

```
SSR classique (buffered) :
===========================

Serveur : [Fetch donnees (200ms)] [Render HTML (100ms)] [Envoyer tout]
Client  :                                                [----Recevoir---]
                                                         ^
                                                         TTFB = 300ms

Le client attend 300ms avant de recevoir le premier octet.
```

### 4.2 SSR streaming

Avec le streaming, le serveur envoie le HTML par morceaux au fur et à mesure :

```
SSR streaming :
================

Serveur : [Shell HTML] [Fetch donnees...] [Render section 1] [Render section 2]
Client  : [Shell recu] [Affiche shell   ] [Section 1 recu  ] [Section 2 recu  ]
          ^                                ^                   ^
          TTFB = 50ms                      Progressif !        Complet
          (head + shell envoyes immediatement)
```

### 4.3 Implementation : Streaming SSR avec `node:http`

```js
import { createServer } from 'node:http';

// Simuler des sources de donnees avec differentes latences
async function fetchHeroProduct() {
  await new Promise(r => setTimeout(r, 50));
  return { id: 1, nom: 'Clavier mecanique', prix: 89.99 };
}

async function fetchRecommendations() {
  await new Promise(r => setTimeout(r, 300)); // Plus lent !
  return [
    { id: 2, nom: 'Souris ergonomique', prix: 49.99 },
    { id: 3, nom: 'Tapis de souris XL', prix: 24.99 }
  ];
}

async function fetchReviews() {
  await new Promise(r => setTimeout(r, 500)); // Encore plus lent !
  return [
    { auteur: 'Alice', note: 5, texte: 'Excellent clavier !' },
    { auteur: 'Bob', note: 4, texte: 'Bon rapport qualite prix.' }
  ];
}

function escapeHtml(str) {
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

const server = createServer(async (req, res) => {
  if (req.url !== '/') {
    res.writeHead(404);
    res.end('Not found');
    return;
  }

  // ---- Streaming SSR ----
  res.writeHead(200, {
    'Content-Type': 'text/html; charset=utf-8',
    'Transfer-Encoding': 'chunked',
    'Cache-Control': 'public, max-age=10, stale-while-revalidate=30',
    'X-SSR-Mode': 'streaming'
  });

  // 1. Envoyer le shell immediatement (TTFB rapide)
  res.write(`<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="utf-8">
  <title>Streaming SSR Demo</title>
  <style>
    body { font-family: system-ui; margin: 0; }
    main { max-width: 800px; margin: 0 auto; padding: 1rem; }
    .skeleton { background: #e0e0e0; border-radius: 4px;
      animation: pulse 1.5s infinite; height: 200px; margin: 1rem 0; }
    @keyframes pulse { 0%,100% { opacity:1; } 50% { opacity:0.5; } }
    .section { border: 1px solid #ddd; padding: 1rem; margin: 1rem 0; border-radius: 8px; }
  </style>
</head>
<body>
  <header style="background:#1a1a2e;color:white;padding:1rem;">
    <h1>Streaming SSR</h1>
  </header>
  <main>
    <div id="hero">
      <div class="skeleton" id="hero-skeleton"></div>
    </div>
    <div id="recommendations">
      <div class="skeleton" id="reco-skeleton"></div>
    </div>
    <div id="reviews">
      <div class="skeleton" id="reviews-skeleton"></div>
    </div>
  </main>
`);

  // 2. Charger le hero product (rapide) et streamer
  const hero = await fetchHeroProduct();
  res.write(`
  <script>
    document.getElementById('hero').innerHTML = \`
      <div class="section">
        <h2>${escapeHtml(hero.nom)}</h2>
        <p style="font-size:2rem;color:#e94560;">${hero.prix.toFixed(2)} EUR</p>
        <button onclick="alert('Ajoute!')">Ajouter au panier</button>
      </div>
    \`;
  </script>
`);

  // 3. Charger les recommandations et streamer
  const recos = await fetchRecommendations();
  res.write(`
  <script>
    document.getElementById('recommendations').innerHTML = \`
      <div class="section">
        <h3>Recommandations</h3>
        ${recos.map(r => `<p>${escapeHtml(r.nom)} -- ${r.prix.toFixed(2)} EUR</p>`).join('')}
      </div>
    \`;
  </script>
`);

  // 4. Charger les avis et streamer (le plus lent)
  const reviews = await fetchReviews();
  res.write(`
  <script>
    document.getElementById('reviews').innerHTML = \`
      <div class="section">
        <h3>Avis clients</h3>
        ${reviews.map(r =>
          `<p><strong>${escapeHtml(r.auteur)}</strong> (${'*'.repeat(r.note)}) : ${escapeHtml(r.texte)}</p>`
        ).join('')}
      </div>
    \`;
    window.__INITIAL_STATE__ = ${JSON.stringify({ hero, recos, reviews })};
  </script>
`);

  // 5. Fermer le document
  res.end(`
  <script src="/client.js" defer></script>
</body>
</html>`);
});

server.listen(3000, () => {
  console.log('Streaming SSR sur http://localhost:3000');
  console.log('Observez le chargement progressif des sections !');
});
```

### 4.4 Avantages du streaming

```
SSR classique :  TTFB = 550ms (attend TOUT : 50 + 300 + 500ms)
SSR streaming :  TTFB = 50ms  (envoie le shell immediatement)

Le hero s'affiche a 50ms  (au lieu de 550ms)
Les recos a 300ms         (au lieu de 550ms)
Les avis a 500ms          (au lieu de 550ms)

Gain : l'utilisateur voit du contenu 500ms plus tot !
```

---

## 5. SSR Tokens : window.__INITIAL_STATE__

### 5.1 Le problème du double-fetch

Sans state initial, le client doit re-fetcher les donnees que le serveur avait déjà :

```
SANS __INITIAL_STATE__ :
  Serveur : fetch donnees -> render HTML -> envoyer
  Client  : recevoir HTML -> afficher -> fetch donnees (ENCORE !) -> re-render

  Les donnees sont fetchees DEUX FOIS. Gaspillage !
```

### 5.2 La solution : serialiser le state

```
AVEC __INITIAL_STATE__ :
  Serveur : fetch donnees -> render HTML + serialiser state -> envoyer
  Client  : recevoir HTML -> afficher -> lire __INITIAL_STATE__ -> hydrater (PAS de re-fetch)

  Les donnees sont fetchees UNE SEULE FOIS. Le client utilise le state embarque.
```

### 5.3 Sécurité de la serialisation

Attention : injecter du JSON dans du HTML peut créer des failles XSS.

```js
// DANGER : serialisation naive
const state = { message: '</script><script>alert("XSS")</script>' };

// Ce HTML est vulnerable :
`<script>window.__INITIAL_STATE__ = ${JSON.stringify(state)};</script>`
// Resultat : </script> ferme le tag et execute le script malveillant !

// SOLUTION : echapper les caracteres dangereux
function safeSerialize(data) {
  return JSON.stringify(data)
    .replace(/</g, '\\u003c')     // Empeche </script>
    .replace(/>/g, '\\u003e')     // Empeche les tags HTML
    .replace(/\//g, '\\u002f')    // Empeche les fermetures de tags
    .replace(/\u2028/g, '\\u2028') // Line separator
    .replace(/\u2029/g, '\\u2029'); // Paragraph separator
}

// Utilisation securisee
`<script>window.__INITIAL_STATE__ = ${safeSerialize(state)};</script>`
```

### 5.4 Implementation complete avec serialisation securisee

```js
import { createServer } from 'node:http';

function safeSerialize(data) {
  return JSON.stringify(data)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/\//g, '\\u002f')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

function escapeHtml(str) {
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// Simuler un store de donnees
async function fetchPageData(url) {
  await new Promise(r => setTimeout(r, 30));

  if (url === '/') {
    return {
      page: 'home',
      title: 'Accueil',
      user: null,
      products: [
        { id: 1, nom: 'Widget A', prix: 19.99 },
        { id: 2, nom: 'Widget B', prix: 29.99 }
      ]
    };
  }

  return null;
}

const server = createServer(async (req, res) => {
  if (req.url === '/client.js') {
    res.writeHead(200, {
      'Content-Type': 'application/javascript',
      'Cache-Control': 'max-age=31536000, immutable'
    });
    res.end(`
      // Le client recupere le state sans re-fetch
      const state = window.__INITIAL_STATE__;
      console.log('State initial recupere:', state);
      console.log('Nombre de produits:', state.products.length);

      // Hydration : attacher les handlers
      document.querySelectorAll('[data-action]').forEach(el => {
        const action = el.dataset.action;
        el.addEventListener('click', () => {
          console.log('Action:', action, 'sur', el.dataset);
        });
      });

      // Navigation SPA apres hydration
      // (les prochaines navigations sont cote client)
      document.querySelectorAll('a[data-spa]').forEach(link => {
        link.addEventListener('click', (e) => {
          e.preventDefault();
          console.log('Navigation SPA vers:', link.href);
          // router.push(link.href) dans un vrai framework
        });
      });

      console.log('Hydration complete !');
    `);
    return;
  }

  const data = await fetchPageData(req.url);

  if (!data) {
    res.writeHead(404, { 'Content-Type': 'text/html' });
    res.end('<h1>404 Not Found</h1>');
    return;
  }

  const html = `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="utf-8">
  <title>${escapeHtml(data.title)}</title>
</head>
<body>
  <div id="root">
    <h1>${escapeHtml(data.title)}</h1>
    <ul>
      ${data.products.map(p => `
        <li>
          ${escapeHtml(p.nom)} - ${p.prix.toFixed(2)} EUR
          <button data-action="add-to-cart" data-product-id="${p.id}">
            Ajouter
          </button>
        </li>
      `).join('')}
    </ul>
  </div>
  <script>window.__INITIAL_STATE__ = ${safeSerialize(data)};</script>
  <script src="/client.js" defer></script>
</body>
</html>`;

  res.writeHead(200, {
    'Content-Type': 'text/html; charset=utf-8',
    'Cache-Control': 'public, max-age=30, stale-while-revalidate=60'
  });
  res.end(html);
});

server.listen(3000, () => {
  console.log('SSR avec __INITIAL_STATE__ sur http://localhost:3000');
});
```

---

## 6. Caching du SSR : quand cacher du HTML, cache-keys, Vary

### 6.1 Quand cacher du HTML SSR ?

```
+------------------------------+----------+---------------------------+
| Type de page                 | Cachable | Strategie                 |
+------------------------------+----------+---------------------------+
| Page statique (About, FAQ)   | Oui +++  | max-age long, CDN         |
| Page produit (public)        | Oui ++   | max-age court + SWR       |
| Page listing (recherche)     | Oui +    | Vary sur query params     |
| Page perso (dashboard)       | Non      | private ou no-store       |
| Page avec panier             | Non*     | Edge-side Includes (ESI)  |
+------------------------------+----------+---------------------------+

* Sauf si on separe la partie publique de la partie personnalisee
```

### 6.2 Le defi : pages mi-publiques mi-personnalisees

```
Page produit typique :
=======================
+----------------------------------+
| Header (nom utilisateur, panier) |  <-- PERSONNALISE (pas cachable)
+----------------------------------+
| Breadcrumb                       |  <-- PUBLIC (cachable)
+----------------------------------+
| Produit : Clavier mecanique      |  <-- PUBLIC (cachable)
| 89.99 EUR                        |
| *** (avis)                       |  <-- PUBLIC (cachable)
+----------------------------------+
| "Bonjour Alice, voici vos recos" |  <-- PERSONNALISE (pas cachable)
+----------------------------------+
| Footer                           |  <-- PUBLIC (cachable)
+----------------------------------+

Solution 1 : ne pas cacher du tout (simple mais sous-optimal)
Solution 2 : cacher le HTML sans les parties perso, les injecter cote client
Solution 3 : Edge-Side Includes (ESI) -- le CDN assemble les morceaux
```

### 6.3 Cache-keys pour le SSR

La cache-key déterminé QUAND deux requêtes sont considerees identiques :

```
Cache-key par defaut : methode + URL + headers Vary
====================================================

GET /produits?page=1&sort=prix
GET /produits?page=1&sort=nom
--> 2 cache-keys differentes (query params differents)

GET /produits?page=1&sort=prix   Accept-Language: fr
GET /produits?page=1&sort=prix   Accept-Language: en
--> 2 cache-keys differentes (si Vary: Accept-Language)
```

### 6.4 Header Vary pour le SSR

```http
HTTP/1.1 200 OK
Content-Type: text/html
Cache-Control: public, max-age=300
Vary: Accept-Language, Accept-Encoding
```

```
Vary: Accept-Language
=====================
GET /produit/42 (Accept-Language: fr) --> Cache-key A : HTML en francais
GET /produit/42 (Accept-Language: en) --> Cache-key B : HTML en anglais

Vary: Accept-Encoding
=====================
GET /style.css (Accept-Encoding: gzip)    --> Cache-key A : compresse
GET /style.css (Accept-Encoding: identity) --> Cache-key B : non compresse
```

**Attention** : ne jamais utiliser `Vary: *` (désactivé le cache) ou `Vary: Cookie` (une cache-key par utilisateur = aucun partage).

### 6.5 Implementation : cache SSR avec cache-keys intelligentes

```js
import { createServer } from 'node:http';
import { createHash } from 'node:crypto';

// ---- Cache SSR ----
class SSRCache {
  #store = new Map();
  #maxEntries;
  #hits = 0;
  #misses = 0;

  constructor(maxEntries = 500) {
    this.#maxEntries = maxEntries;
  }

  // Generer une cache-key a partir de la requete
  buildCacheKey(req) {
    const url = req.url;
    const lang = req.headers['accept-language']?.split(',')[0] || 'fr';
    const isMobile = /Mobile|Android/i.test(req.headers['user-agent'] || '');
    const device = isMobile ? 'mobile' : 'desktop';

    // La cache-key combine URL + langue + type d'appareil
    const raw = `${url}|${lang}|${device}`;
    return createHash('md5').update(raw).digest('hex');
  }

  get(key) {
    const entry = this.#store.get(key);
    if (!entry) {
      this.#misses++;
      return null;
    }
    if (Date.now() > entry.expiresAt) {
      this.#store.delete(key);
      this.#misses++;
      return null;
    }
    this.#hits++;
    return entry;
  }

  set(key, html, metadata, ttlSeconds = 300) {
    // Eviction LRU si plein
    if (this.#store.size >= this.#maxEntries) {
      const firstKey = this.#store.keys().next().value;
      this.#store.delete(firstKey);
    }

    this.#store.set(key, {
      html,
      metadata,
      storedAt: Date.now(),
      expiresAt: Date.now() + ttlSeconds * 1000
    });
  }

  invalidateByTag(tag) {
    let count = 0;
    for (const [key, entry] of this.#store) {
      if (entry.metadata.tags?.includes(tag)) {
        this.#store.delete(key);
        count++;
      }
    }
    return count;
  }

  stats() {
    const total = this.#hits + this.#misses;
    return {
      entries: this.#store.size,
      hits: this.#hits,
      misses: this.#misses,
      hitRatio: total > 0 ? (this.#hits / total * 100).toFixed(1) + '%' : 'N/A'
    };
  }
}

const ssrCache = new SSRCache(1000);

// ---- Fonctions de rendu ----
function escapeHtml(str) {
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

async function renderProductPage(productId, lang) {
  // Simuler le fetch de donnees
  await new Promise(r => setTimeout(r, 100));

  const product = {
    id: productId,
    nom: lang === 'en' ? 'Mechanical Keyboard' : 'Clavier mecanique',
    prix: 89.99,
    description: lang === 'en'
      ? 'A premium mechanical keyboard with Cherry MX switches.'
      : 'Un clavier mecanique premium avec des switches Cherry MX.'
  };

  const html = `<!DOCTYPE html>
<html lang="${lang}">
<head>
  <meta charset="utf-8">
  <title>${escapeHtml(product.nom)}</title>
</head>
<body>
  <h1>${escapeHtml(product.nom)}</h1>
  <p>${product.prix.toFixed(2)} EUR</p>
  <p>${escapeHtml(product.description)}</p>
  <p><small>${lang === 'en' ? 'Rendered at' : 'Genere a'} ${new Date().toISOString()}</small></p>
</body>
</html>`;

  return { html, product };
}

// ---- Serveur ----
const server = createServer(async (req, res) => {
  // Stats endpoint
  if (req.url === '/cache-stats') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(ssrCache.stats(), null, 2));
    return;
  }

  // Purge endpoint
  if (req.url.startsWith('/purge/')) {
    const tag = req.url.replace('/purge/', '');
    const count = ssrCache.invalidateByTag(tag);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ purged: count, tag }));
    return;
  }

  // SSR avec cache
  const match = req.url.match(/^\/produit\/(\d+)$/);
  if (match) {
    const productId = match[1];
    const cacheKey = ssrCache.buildCacheKey(req);
    const lang = (req.headers['accept-language'] || 'fr').split(',')[0].substring(0, 2);

    // Verifier le cache SSR
    const cached = ssrCache.get(cacheKey);
    if (cached) {
      res.writeHead(200, {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'public, max-age=30, stale-while-revalidate=60',
        'X-SSR-Cache': 'HIT',
        'X-Cache-Key': cacheKey.substring(0, 8),
        'Age': String(Math.floor((Date.now() - cached.storedAt) / 1000)),
        'Vary': 'Accept-Language, Accept-Encoding'
      });
      res.end(cached.html);
      return;
    }

    // Cache miss : render SSR
    const start = Date.now();
    const { html, product } = await renderProductPage(productId, lang);
    const renderTime = Date.now() - start;

    // Stocker en cache
    ssrCache.set(cacheKey, html, {
      tags: [`product-${productId}`, 'products'],
      lang,
      url: req.url
    }, 300); // 5 minutes

    res.writeHead(200, {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'public, max-age=30, stale-while-revalidate=60',
      'CDN-Cache-Control': 'max-age=300',
      'Surrogate-Key': `product-${productId} products`,
      'X-SSR-Cache': 'MISS',
      'X-SSR-Render-Time': `${renderTime}ms`,
      'Vary': 'Accept-Language, Accept-Encoding'
    });
    res.end(html);
    return;
  }

  res.writeHead(404);
  res.end('Not found');
});

server.listen(3000, () => {
  console.log('SSR cache sur http://localhost:3000');
  console.log('');
  console.log('Tester :');
  console.log('  curl -H "Accept-Language: fr" http://localhost:3000/produit/1');
  console.log('  curl -H "Accept-Language: en" http://localhost:3000/produit/1');
  console.log('  curl http://localhost:3000/cache-stats');
  console.log('  curl http://localhost:3000/purge/product-1');
});
```

### 6.6 Stratégies de cache SSR par framework

| Framework | Cache SSR natif | Stratégie recommandee |
|-----------|----------------|----------------------|
| Next.js | ISR (Incremental Static Regeneration) | `revalidate: 60` dans `getStaticProps` |
| Nuxt 3 | `routeRules` + Nitro cache | `swr: 3600` dans `nuxt.config` |
| Remix | Loaders + headers | `Cache-Control` dans le loader |
| Astro | Build-time par defaut | Pages hybrides pour le dynamique |
| SvelteKit | `+page.server.js` | `setHeaders` dans le `load` |

### 6.7 Quand NE PAS cacher le SSR

```
NE PAS cacher quand :
=====================
1. La page contient des donnees personnalisees (panier, dashboard)
   --> Cache-Control: private, no-store

2. La page depend d'un cookie de session
   --> Vary: Cookie = une entree par utilisateur = cache inutile

3. La page change a chaque seconde (cours de bourse)
   --> Pas de cache, ou max-age=1

4. La page contient des tokens CSRF
   --> Le token serait partage entre utilisateurs = faille de securite !

CACHER quand :
==============
1. Page produit publique (meme contenu pour tous)
2. Page d'accueil (meme layout pour tous)
3. Pages SEO (blog, documentation)
4. Resultats de recherche (meme query = meme resultat)
```

---

## 7. Récapitulatif : architecture SSR + cache optimale

```
Architecture recommandee :
===========================

                         Cache-Control: max-age=30, swr=60
  Browser ------> CDN -------> SSR Cache (in-memory LRU)
                   |                |
                   |           [Cache MISS]
                   |                |
                   |           SSR Render
                   |                |
                   |           App Cache (Redis)
                   |                |
                   |           [Cache MISS]
                   |                |
                   |           Database
                   |
              CDN-Cache-Control: max-age=300
              Surrogate-Key: product-42

Invalidation :
  DB change --> Redis DEL --> SSR cache invalidate --> CDN purge by tag
  Browser : attend max-age=30 (maximum 30s de stale)
```

---

## Points clés

1. Le **SSR** généré le HTML cote serveur, offrant un meilleur SEO et un FCP plus rapide que le CSR.
2. Le cycle SSR est : requête -> fetch donnees -> render HTML -> envoyer -> **hydration** cote client.
3. L'**hydration** est le processus par lequel le JS "prend le controle" du HTML statique -- pendant ce temps, la page est visible mais non interactive ("uncanny valley").
4. Le **streaming SSR** envoie le HTML par morceaux, reduisant drastiquement le TTFB (le shell est envoye immediatement).
5. `window.__INITIAL_STATE__` permet au client de récupérer les donnees sans re-fetch -- attention à la **serialisation securisee** (XSS).
6. Le cache SSR utilise des **cache-keys** combinees (URL + langue + device) et le header **Vary** pour differencier les variantes.
7. Ne jamais cacher du HTML contenant des donnees **personnalisees** (panier, CSRF, dashboard) dans un cache partage.
8. La stratégie optimale combine un **TTL court cote browser** (30s) avec un **TTL plus long cote CDN** (5min) et des **Surrogate Keys** pour la purge instantanee.

---

## Lab associe

> Lab 10 — Construire un serveur SSR complet avec streaming, hydration, `__INITIAL_STATE__`, cache LRU et invalidation par tag

---

## Pour aller plus loin

- [web.dev - Rendering on the Web](https://web.dev/rendering-on-the-web/)
- [React 18 - Streaming SSR](https://react.dev/reference/react-dom/server/renderToPipeableStream)
- [Dan Abramov - The WET Codebase](https://overreacted.io/)
- [Patterns.dev - Rendering Patterns](https://www.patterns.dev/posts/rendering-patterns/)
- [Next.js - Caching](https://nextjs.org/docs/app/building-your-application/caching)
- [MDN - Vary header](https://developer.mozilla.org/fr/docs/Web/HTTP/Headers/Vary)

---

## Si tu es perdu

Imagine un restaurant :

- **CSR** (Client-Side Rendering) = on te donne les ingredients et la recette, tu cuisines toi-même à la maison. C'est long avant de manger, mais après c'est flexible.
- **SSR** (Server-Side Rendering) = le chef prepare le plat en cuisine et te l'apporte tout pret. Tu manges plus vite, mais le chef est occupe.
- **Hydration** = après que le plat est servi (HTML affiche), le serveur t'apporte les couverts (event listeners). Pendant un instant, tu as le plat devant toi mais tu ne peux pas encore le manger -- c'est la "uncanny valley".
- **Streaming SSR** = le chef envoie l'entree des qu'elle est prete, sans attendre le plat et le dessert.
- **`__INITIAL_STATE__`** = le chef inscrit la recette sur un petit papier dans l'assiette, pour que tu puisses refaire le plat plus tard sans redemander.
- **Cache SSR** = preparer 10 portions d'avance pour les plats populaires.

---

## En pratique — Configuration Next.js

Next.js (App Router) offre un controle granulaire sur le SSR et le cache. Voici les configurations les plus courantes.

### Forcer le SSR dynamique (pas de cache)

```typescript
// app/products/[id]/page.tsx — SSR dynamique (force-dynamic)
export const dynamic = 'force-dynamic'; // Force le SSR a chaque requete
export const revalidate = 0;            // Pas de cache

export default async function ProductPage({ params }) {
  const res = await fetch(`https://api.example.com/products/${params.id}`, {
    cache: 'no-store', // Pas de cache sur ce fetch
  });
  const product = await res.json();

  return (
    <main>
      <h1>{product.name}</h1>
      <p>{product.price} EUR</p>
    </main>
  );
}
```

### SSR avec cache (revalidation temporelle)

```typescript
// app/products/[id]/page.tsx — SSR avec revalidation
export const revalidate = 60; // Revalider toutes les 60 secondes

export default async function ProductPage({ params }) {
  // Cache au niveau du fetch individuel
  const product = await fetch(`https://api.example.com/products/${params.id}`, {
    next: { revalidate: 60 }, // Cache ce fetch pendant 60s
  });

  // Ce fetch a son propre TTL
  const reviews = await fetch(`https://api.example.com/products/${params.id}/reviews`, {
    next: { revalidate: 300 }, // Les avis changent moins souvent : 5 min
  });

  // ...
}
```

### Routes dynamiques automatiques : `headers()` et `cookies()`

L'utilisation de `headers()` ou `cookies()` rend automatiquement la route **dynamique** (SSR à chaque requête, pas de cache) :

```typescript
// app/dashboard/page.tsx — Route automatiquement dynamique
import { headers, cookies } from 'next/headers';

export default async function Dashboard() {
  // Appeler headers() ou cookies() = route dynamique, jamais cachee
  const headersList = headers();
  const theme = cookies().get('theme')?.value || 'light';
  const authToken = headersList.get('authorization');

  // Cette page est regeneree a CHAQUE requete (comme force-dynamic)
  const userData = await fetch('https://api.example.com/me', {
    headers: { Authorization: authToken },
    cache: 'no-store',
  });

  // ...
}
```

### `unstable_cache` : cache cote serveur pour les fonctions

```typescript
// app/products/[id]/page.tsx — Cache de fonctions cote serveur
import { unstable_cache } from 'next/cache';

// Encapsuler un appel DB dans un cache serveur
const getCachedProduct = unstable_cache(
  async (id: string) => {
    // Cet appel DB est cache cote serveur
    const product = await db.products.findUnique({ where: { id } });
    return product;
  },
  ['product-detail'],     // Cle de cache
  {
    revalidate: 120,       // TTL de 2 minutes
    tags: ['products'],    // Tags pour invalidation ciblee
  }
);

export default async function ProductPage({ params }) {
  const product = await getCachedProduct(params.id);
  // ...
}
```

### En-tetes `Cache-Control` envoyes par Next.js

```
Comportement par defaut de Next.js App Router :
=================================================

Page statique (SSG/ISR) :
  Cache-Control: s-maxage=<revalidate>, stale-while-revalidate
  → Le CDN cache la page, le navigateur revalide a chaque fois.

Page dynamique (SSR, force-dynamic) :
  Cache-Control: private, no-cache, no-store, max-age=0, must-revalidate
  → Rien n'est cache. Chaque requete declenche un rendu serveur.

Assets statiques (_next/static/) :
  Cache-Control: public, max-age=31536000, immutable
  → Cache agressif car les noms de fichiers contiennent un hash.
```

### `generateStaticParams` : pre-rendre des pages SSR au build

```typescript
// app/products/[id]/page.tsx — Pre-rendu statique de certaines pages
export async function generateStaticParams() {
  // Ces pages seront generees au build (comme du SSG)
  const products = await fetch('https://api.example.com/products/popular');
  const data = await products.json();

  return data.map((product) => ({
    id: String(product.id),
  }));
  // Les pages /products/1, /products/2, etc. sont pre-rendues
  // Les autres pages sont generees a la demande (SSR) puis cachees (ISR)
}

export const revalidate = 3600; // Revalider toutes les heures

export default async function ProductPage({ params }) {
  const product = await fetch(`https://api.example.com/products/${params.id}`, {
    next: { revalidate: 3600 },
  });
  // ...
}
```

### Récapitulatif Next.js SSR

| Configuration | Comportement | Cache-Control |
|--------------|-------------|---------------|
| `dynamic = 'force-dynamic'` | SSR à chaque requête | `private, no-cache, no-store` |
| `revalidate = 0` | SSR à chaque requête | `private, no-cache, no-store` |
| `revalidate = 60` | ISR : cache 60s puis revalide | `s-maxage=60, stale-while-revalidate` |
| `cache: 'no-store'` (fetch) | Ce fetch spécifique n'est jamais cache | — |
| `next: { revalidate: N }` (fetch) | Ce fetch est cache N secondes | — |
| `headers()` / `cookies()` | Route automatiquement dynamique | `private, no-cache, no-store` |
| `unstable_cache()` | Cache serveur avec TTL et tags | — (cache interne) |
| `generateStaticParams()` | Pre-rendu au build (SSG) | `s-maxage=<revalidate>` |

---

## Defi

### Enonce

Tu as un site e-commerce avec SSR. La page `/produit/42` est vue 100 000 fois par jour. Le rendu SSR prend 150ms. Le site supporte le français et l'anglais, desktop et mobile.

1. Combien de variantes de cache faut-il pour cette page ?
2. Quel `Vary` header utiliser ?
3. Calcule le temps CPU economise par jour si le cache SSR à un hit ratio de 95% avec un TTL de 5 minutes.
4. Ecris les headers `Cache-Control` optimaux pour le browser ET le CDN.
5. La page affiche "Bonjour Alice" dans le header. Peut-on quand même la cacher ? Comment ?

### Reponse

```
1. Variantes de cache :
   - 2 langues (fr, en) x 2 devices (desktop, mobile) = 4 variantes
   - Soit 4 entrees de cache pour /produit/42

2. Header Vary :
   Vary: Accept-Language, Accept-Encoding
   (Note : pas Vary: User-Agent car trop de variantes.
    Utiliser une logique de cache-key qui normalise en "mobile"/"desktop")

3. Temps CPU economise :
   - 100 000 requetes/jour
   - 95% en cache = 95 000 HIT (0ms SSR) + 5 000 MISS (150ms SSR)
   - SANS cache : 100 000 x 150ms = 15 000 000 ms = 4.17 heures CPU/jour
   - AVEC cache : 5 000 x 150ms = 750 000 ms = 12.5 minutes CPU/jour
   - Economie : ~4 heures de CPU par jour pour UNE page !

4. Headers optimaux :
   Cache-Control: public, max-age=30, stale-while-revalidate=60
   CDN-Cache-Control: max-age=300
   Surrogate-Key: product-42 products

5. Personnalisation "Bonjour Alice" :
   - Option A : ne PAS inclure le nom dans le HTML SSR.
     Le charger cote client via JS apres hydration.
     Le HTML cache est generique ("Bonjour" sans nom).

   - Option B : Edge-Side Includes (ESI).
     Le CDN assemble : <esi:include src="/fragment/user-greeting"/>
     Le fragment /fragment/user-greeting est private, no-cache.
     Le reste de la page est cachable.

   - Option C : cacher le "shell" public et injecter
     les parties privees via un appel API cote client.
     Cache-Control: public pour le HTML,
     Cache-Control: private pour /api/user/greeting.
```

---

## Navigation

| Précédent | Suivant |
|:---------:|:-------:|
| [Module 09 — Cache multi-couches](./09-cache-multi-couches.md) | [Module 11 — ISR & SSG](./11-isr-ssg.md) |

---

<!-- parcours-recommande -->

::: tip Parcours recommandé
1. **Screencast** : [screencast 10 ssr](../screencasts/screencast-10-ssr.md)
2. **Lab** : [lab-10-ssr-from-scratch](../labs/lab-10-ssr-from-scratch/README)
3. **Visualisation** : [SSR & Hydration](../visualizations/ssr-hydration.html)
4. **Quiz** : [quiz 10 ssr](../quizzes/quiz-10-ssr.html)
:::
