# Screencast 10 — SSR from scratch : hydration et streaming

## Informations
- **Durée estimée** : 14-15 min
- **Module** : `modules/10-ssr.md`
- **Lab associé** : `labs/lab-10-ssr-from-scratch/`
- **Prérequis** : Screencast 09 (Cache multi-couches), connaissances de base en React

## Setup
- [ ] Lab SSR prêt : `labs/lab-10-ssr-from-scratch/exercise.js`
- [ ] Deux versions de la même page : CSR (client-side) et SSR (server-side)
- [ ] Chrome DevTools (onglets Network et Performance)
- [ ] Vue source de la page (Ctrl+U) pour montrer le HTML généré côté serveur

## Script

### [00:00-01:30] Introduction — Pourquoi le SSR ?

> Salut ! On change un peu de registre. Jusqu'ici, on a parlé du cache HTTP dans le contexte classique. Maintenant, on va voir comment le rendu côté serveur — le SSR — transforme la problématique du cache. Parce que cacher une API JSON et cacher une page HTML générée par le serveur, ce n'est pas du tout la même chose.

**Action** : Afficher le slide "Module 10 — Server-Side Rendering".

> Le SSR, c'est quand le serveur génère le HTML complet de la page avant de l'envoyer au navigateur. Contrairement au CSR (Client-Side Rendering) ou le navigateur reçoit un squelette HTML vide et construit la page en JavaScript. L'avantage du SSR : un premier affichage plus rapide et un meilleur SEO. L'inconvénient : plus de travail pour le serveur. Et c'est là que le cache entre en jeu.

### [01:30-04:30] CSR vs SSR — La différence en pratique

> Voyons la différence concrètement.

**Action** : Lancer le lab et ouvrir les deux versions.

```bash
cd labs/lab-10-ssr-from-scratch
node exercise.js
```

> J'ai deux pages. `http://localhost:3000/csr` — c'est le rendu côté client. `http://localhost:3000/ssr` — c'est le rendu côté serveur. Même contenu, même design, méthode de rendu différente.

**Action** : Ouvrir la page CSR et afficher le code source (Ctrl+U).

> Regardez le code source de la page CSR. Qu'est-ce qu'on voit ? Un `<div id="root"></div>` vide et des balises `<script>`. C'est tout. Le contenu réel est généré par JavaScript dans le navigateur. Si vous désactivez JavaScript, la page est blanche.

**Action** : Ouvrir la page SSR et afficher le code source.

> Maintenant, le code source de la page SSR. Là, on voit tout le HTML : les titres, les paragraphes, les données. Le serveur a fait tout le travail. Le navigateur n'a plus qu'à afficher. Même sans JavaScript, le contenu est visible.

**Action** : Comparer les waterfalls dans les DevTools entre CSR et SSR.

> Dans les DevTools, comparons les timelines. La page CSR : d'abord le HTML vide (rapide), puis le JavaScript (lourd), puis les appels API, et enfin l'affichage. La page SSR : le HTML arrive déjà complet, l'affichage est immédiat. Le First Contentful Paint est bien meilleur.

### [04:30-08:00] Construire du SSR from scratch

> Pour comprendre le SSR, construisons-le ensemble. Pas de framework, juste Node.js et React.

**Action** : Ouvrir le fichier `exercise.js` dans l'éditeur.

```javascript
// SSR basique avec React
const React = require('react');
const { renderToString } = require('react-dom/server');
const express = require('express');

const app = express();

// Composant React
function App({ articles }) {
  return React.createElement('div', null,
    React.createElement('h1', null, 'Articles'),
    articles.map(a =>
      React.createElement('article', { key: a.id },
        React.createElement('h2', null, a.title),
        React.createElement('p', null, a.excerpt)
      )
    )
  );
}

app.get('/ssr', async (req, res) => {
  // 1. Récupérer les données
  const articles = await fetchArticles();

  // 2. Rendre le composant en HTML
  const html = renderToString(React.createElement(App, { articles }));

  // 3. Injecter dans le template
  const page = `<!DOCTYPE html>
    <html>
      <head><title>SSR Demo</title></head>
      <body>
        <div id="root">${html}</div>
        <script>window.__DATA__ = ${JSON.stringify(articles)}</script>
        <script src="/bundle.js"></script>
      </body>
    </html>`;

  // 4. En-têtes de cache
  res.set('Cache-Control', 'public, max-age=60, s-maxage=300');
  res.send(page);
});
```

> Quatre étapes. On récupère les données. On rend le composant React en chaîne HTML avec `renderToString`. On injecte ce HTML dans le template avec les données sérialisées. Et on envoie le tout avec les bons en-têtes de cache.

> Notez la ligne `window.__DATA__`. C'est crucial pour l'hydratation. Le client a besoin des mêmes données que le serveur a utilisées pour rendre le HTML.

### [08:00-10:30] L'hydratation — Rendre le HTML interactif

> Le HTML SSR est statique. Il s'affiche, mais les boutons ne fonctionnent pas, les formulaires ne réagissent pas. Pour rendre la page interactive, il faut l'hydrater.

**Action** : Montrer le fichier client qui fait l'hydratation.

```javascript
// bundle.js (côté client)
const React = require('react');
const { hydrateRoot } = require('react-dom/client');

// Les mêmes données que le serveur a utilisées
const data = window.__DATA__;

// Hydratation : React "attache" les événements au HTML existant
hydrateRoot(
  document.getElementById('root'),
  React.createElement(App, { articles: data })
);
```

> `hydrateRoot` c'est la clé. Au lieu de recréer le DOM from scratch comme `createRoot`, `hydrateRoot` prend le HTML existant et y attache les event listeners. Le HTML ne change pas visuellement, il devient juste interactif.

**Action** : Ouvrir la page SSR, montrer qu'elle s'affiche immédiatement, puis que l'interactivité arrive quand le JS se charge.

> Regardez la timeline. Le HTML s'affiche instantanément — c'est le FCP, First Contentful Paint. Puis le JavaScript se charge et s'exécute — c'est le TTI, Time To Interactive. Entre les deux, la page est visible mais pas interactive. C'est le "uncanny valley" du SSR.

> Pour le cache, ça signifie que le HTML SSR est la ressource la plus importante à cacher. Si le CDN a le HTML en cache, le FCP est quasi instantané. Le JavaScript, lui, est caché séparément avec un hash dans le nom de fichier et un max-age d'un an.

### [10:30-12:30] Cache et SSR — Les stratégies

> Comment cacher efficacement du contenu SSR ?

**Action** : Afficher les différentes stratégies de cache SSR.

> Stratégie 1 : full page cache. Toute la page HTML est cachée telle quelle. Simple mais ne fonctionne que si la page est la même pour tous les utilisateurs. Parfait pour un blog, un catalogue produits.

```bash
# Page publique, même contenu pour tous
curl -I http://localhost:3000/ssr/articles
# Cache-Control: public, s-maxage=300, stale-while-revalidate=600
```

> Stratégie 2 : cache avec fragmentation. Les parties statiques sont cachées, les parties dynamiques (nom de l'utilisateur, panier) sont injectées côté client. C'est le pattern "app shell + client rendering".

> Stratégie 3 : pas de cache sur le HTML, mais cache sur les données. Le SSR est régénéré à chaque requête, mais les appels API sous-jacents sont cachés. Moins performant mais plus flexible.

```bash
# HTML non caché, mais les APIs en amont le sont
curl -I http://localhost:3000/ssr/dashboard
# Cache-Control: private, no-cache
```

> Le choix dépend de la nature de la page. Contenu public et partagé ? Full page cache sur le CDN. Contenu personnalisé ? Cache des données en amont avec HTML regénéré.

### [12:30-14:00] Pièges du SSR et cache

> Quelques pièges classiques.

**Action** : Afficher la liste des pièges.

> Piège 1 : cacher du contenu personnalisé sur le CDN. Un utilisateur A se connecte, le CDN cache la page avec son nom et son panier. L'utilisateur B reçoit la page de A. Catastrophe. Utilisez toujours `private` pour le contenu personnalisé.

> Piège 2 : l'hydratation mismatch. Si le HTML serveur et le rendu client ne correspondent pas, React affiche un avertissement et peut recréer tout le DOM. Ça ruine l'avantage du SSR.

> Piège 3 : le temps de génération. Si votre page SSR met 2 secondes à se générer, c'est pire que du CSR. Le cache résout ce problème en absorbant la majorité des requêtes, mais la première requête (cache miss) sera lente.

### [14:00-14:30] Récap — SSR et cache, le duo performant

> Résumons. Le SSR génère le HTML côté serveur pour un premier affichage rapide. L'hydratation rend la page interactive côté client. Le cache du HTML SSR est crucial pour la performance. Et il faut bien distinguer contenu public (cacheable) et contenu personnalisé (private).

**Action** : Mentionner le quiz et le lab.

> Le lab `labs/lab-10-ssr-from-scratch/` vous fait construire un serveur SSR avec hydratation et mettre en place les bonnes stratégies de cache. Prochain screencast : ISR et SSG, quand le SSR rencontre le build time. A plus !

## Points d'attention pour l'enregistrement
- La comparaison visuelle CSR vs SSR est très parlante, prendre le temps de bien la montrer
- Afficher le code source (Ctrl+U) est indispensable pour voir la différence
- Bien expliquer l'hydratation car c'est un concept souvent mal compris
- Le piège du contenu personnalisé dans le cache CDN est critique, insister dessus
