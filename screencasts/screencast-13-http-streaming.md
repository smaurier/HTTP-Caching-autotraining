# Screencast 13 — HTTP Streaming : chunked transfer et streaming SSR

## Informations
- **Durée estimée** : 13-15 min
- **Module** : `modules/13-http-streaming.md`
- **Lab associé** : `labs/lab-13-streaming-ssr/`
- **Prérequis** : Screencast 10 (SSR), Screencast 01 (Protocole HTTP)

## Setup
- [ ] Serveur de démo streaming : `labs/lab-13-streaming-ssr/exercise.js`
- [ ] Chrome DevTools ouverts (onglets Network et Performance)
- [ ] Terminal avec curl pour observer le chunked transfer en temps réel
- [ ] Deux versions de la même page : SSR classique et SSR streaming

## Script

### [00:00-01:30] Introduction — Pourquoi le streaming ?

> Salut ! Jusqu'ici, quand on faisait du SSR, on attendait que toute la page soit générée avant de l'envoyer. Si une partie de la page met 2 secondes à se générer (par exemple un appel à une API lente), l'utilisateur attend 2 secondes avant de voir quoi que ce soit. Le streaming résout ce problème.

**Action** : Afficher le slide "Module 13 — HTTP Streaming".

> Avec le streaming, on envoie la page morceau par morceau. L'en-tête et la navigation arrivent en 50ms. Le contenu principal arrive en 200ms. Et le widget lent arrive quand il est prêt, 2 secondes plus tard. L'utilisateur voit quelque chose immédiatement, et la page se remplit progressivement. C'est une bien meilleure expérience.

### [01:30-04:00] Chunked Transfer Encoding — Les bases

> Le streaming HTTP repose sur le Transfer-Encoding chunked. C'est un mécanisme de HTTP/1.1 qui permet d'envoyer une réponse en morceaux (chunks) sans connaître la taille totale à l'avance.

**Action** : Lancer le serveur et démontrer avec curl.

```bash
cd labs/lab-13-streaming-ssr
node exercise.js
```

```bash
# Observer le chunked transfer en temps réel
curl -N http://localhost:3000/stream-demo
```

> Regardez : les données arrivent par morceaux. `curl` affiche chaque chunk dès qu'il arrive, sans attendre la fin. Le serveur envoie un morceau, pause, un autre morceau, pause. C'est le streaming en action.

**Action** : Montrer les en-têtes de la réponse.

```bash
curl -I http://localhost:3000/stream-demo
# Transfer-Encoding: chunked
# Content-Type: text/html
```

> L'en-tête clé : `Transfer-Encoding: chunked`. Pas de `Content-Length` — c'est logique, le serveur ne connaît pas la taille totale à l'avance.

> En HTTP/2 et HTTP/3, le chunked encoding n'existe plus en tant que tel. Le protocole gère nativement le streaming via les frames DATA. Mais le principe reste le même : les données sont envoyées progressivement.

### [04:00-07:30] Streaming SSR — React et renderToPipeableStream

> Voyons maintenant le streaming SSR avec React. Depuis React 18, on a `renderToPipeableStream` qui remplace `renderToString` pour le streaming.

**Action** : Ouvrir le code du serveur SSR streaming dans l'éditeur.

```javascript
// exercise.js - SSR streaming avec React 18
const { renderToPipeableStream } = require('react-dom/server');

app.get('/streaming', (req, res) => {
  const { pipe } = renderToPipeableStream(
    React.createElement(App),
    {
      bootstrapScripts: ['/bundle.js'],
      onShellReady() {
        // Le shell (layout) est prêt, on commence à streamer
        res.setHeader('Content-Type', 'text/html');
        res.setHeader('Transfer-Encoding', 'chunked');
        pipe(res);
      },
      onError(error) {
        console.error(error);
        res.statusCode = 500;
      }
    }
  );
});
```

> La clé, c'est `onShellReady`. Le "shell", c'est le squelette de la page : le layout, la navigation, tout ce qui ne dépend pas de données asynchrones. Dès que le shell est prêt, on commence à envoyer du HTML au navigateur. Les parties qui dépendent de données asynchrones arrivent après.

**Action** : Montrer le composant React avec Suspense.

```javascript
function App() {
  return (
    <html>
      <body>
        <header><h1>Mon Application</h1></header>
        <nav>Navigation...</nav>

        <main>
          {/* Le contenu principal - arrive rapidement */}
          <Suspense fallback={<p>Chargement des articles...</p>}>
            <ArticleList />
          </Suspense>

          {/* Le widget lent - arrive quand il est prêt */}
          <Suspense fallback={<p>Chargement des recommandations...</p>}>
            <SlowRecommendations />
          </Suspense>
        </main>

        <footer>Footer...</footer>
      </body>
    </html>
  );
}
```

> `Suspense` est la clé du streaming. Chaque `Suspense` délimite une zone qui peut être streamée indépendamment. Le fallback est affiché pendant que les données chargent, et quand elles sont prêtes, le vrai contenu remplace le fallback.

**Action** : Comparer les deux pages côte à côte dans le navigateur.

> A gauche, le SSR classique (renderToString). La page est blanche pendant 2 secondes, puis tout apparaît d'un coup. A droite, le SSR streaming. Le header et la navigation apparaissent en 50ms. Les articles en 200ms. Et les recommandations lentes arrivent à 2 secondes. L'expérience est radicalement différente.

### [07:30-10:00] Streaming et cache — Le défi

> Voici la grande question : comment cacher une réponse streamée ?

**Action** : Afficher un schéma du problème cache + streaming.

> Le problème : un CDN classique attend la réponse complète avant de la mettre en cache. Avec le streaming, il faudrait soit attendre la fin (ce qui annule l'avantage du streaming), soit streamer ET cacher en parallèle.

> En pratique, voici les approches.

> Approche 1 : ne pas cacher le HTML streamé sur le CDN, mais cacher les données en amont. Le SSR streaming régénère le HTML à chaque requête, mais les appels API sous-jacents sont cachés. Le HTML est léger à générer si les données sont déjà en cache.

```javascript
// Les données sont cachées, le SSR streaming est rapide
app.get('/streaming', (req, res) => {
  res.setHeader('Cache-Control', 'private, no-cache');
  // Le SSR streaming ne prend que 50ms si les API
  // sous-jacentes sont en cache
});
```

> Approche 2 : cacher le HTML complet une fois la réponse terminée. Le premier utilisateur reçoit le streaming. Le CDN stocke la réponse complète. Les utilisateurs suivants reçoivent la page complète depuis le cache (pas de streaming, mais un cache hit instantané).

```bash
# Premier utilisateur : streaming
# Suivants : cache hit avec la page complète
curl -I http://localhost:3000/streaming
# Cache-Control: public, s-maxage=60
```

> Approche 3 : utiliser les Suspense boundaries comme points de cache. Le shell est caché, et les parties dynamiques sont injectées côté client. C'est le pattern "partial prerendering" qui arrive dans Next.js.

### [10:00-12:30] Cas d'usage concrets — Quand streamer ?

> Le streaming n'est pas toujours la bonne solution. Voyons quand l'utiliser.

**Action** : Afficher un tableau des cas d'usage.

> Cas idéal : pages avec des parties rapides et des parties lentes. Le dashboard avec un graphique complexe : le layout est rapide, le graphique est lent. La page produit avec des recommandations : le produit est rapide, les recos sont lentes.

```bash
# Comparer les métriques
# SSR classique : TTFB = 2000ms, FCP = 2000ms
# SSR streaming : TTFB = 50ms, FCP = 50ms, Full page = 2000ms
```

> Le TTFB (Time To First Byte) passe de 2 secondes à 50 millisecondes. Le FCP (First Contentful Paint) aussi. L'utilisateur voit quelque chose 40 fois plus vite.

> Cas moins pertinent : pages rapides où tout est disponible en même temps. Si votre page SSR se génère en 50ms au total, le streaming n'apporte pas grand-chose en termes d'UX. Il ajoute juste de la complexité.

**Action** : Montrer les métriques dans l'onglet Performance des DevTools.

> Dans l'onglet Performance des DevTools, on voit clairement la différence. Le SSR classique a un long Time To First Byte. Le streaming a un TTFB très court et un chargement progressif.

### [12:30-14:00] Le futur — Partial Prerendering

> Un mot sur le futur. Next.js travaille sur le "Partial Prerendering" (PPR). L'idée : le shell de la page est pré-rendu statiquement (comme du SSG), et les parties dynamiques sont streamées au runtime.

> Concrètement : le CDN a le shell HTML en cache. Quand l'utilisateur arrive, le shell est servi instantanément. Puis les parties dynamiques sont streamées depuis l'edge ou le serveur. On combine les avantages du SSG (cache CDN, latence zéro) et du streaming SSR (contenu dynamique, personnalisation).

> C'est la convergence de tout ce qu'on a étudié dans cette formation : cache CDN, SSR, streaming, edge. Tous ces concepts travaillent ensemble.

### [14:00-14:30] Récap — Le streaming, l'expérience progressive

> Résumons. Le streaming HTTP envoie la réponse par morceaux. React 18 et `renderToPipeableStream` permettent le SSR streaming avec Suspense. Le cache et le streaming sont un défi à combiner, avec plusieurs approches possibles. Et le streaming brille quand la page a des parties rapides et des parties lentes.

**Action** : Mentionner le quiz et le lab.

> Le lab `labs/lab-13-streaming-ssr/` vous fait implémenter du streaming SSR avec Suspense et comparer les métriques avec un SSR classique. Prochain screencast : la performance web et les Core Web Vitals. On approche de la fin ! A bientôt !

## Points d'attention pour l'enregistrement
- La démo curl avec -N est très visuelle pour montrer le streaming en temps réel
- La comparaison côte à côte SSR classique vs streaming est le moment clé du screencast
- Bien montrer les métriques TTFB et FCP dans les DevTools Performance
- Le concept de Partial Prerendering est avancé, rester simple dans l'explication
