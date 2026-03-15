# Screencast 11 — ISR et SSG : génération statique et revalidation à la demandé

## Informations
- **Durée estimée** : 13-15 min
- **Module** : `modules/11-isr-ssg.md`
- **Lab associé** : `labs/lab-11-isr-revalidation/`
- **Prérequis** : Screencast 10 (SSR from scratch)

## Setup
- [ ] Projet Next.js du lab prêt : `labs/lab-11-isr-revalidation/`
- [ ] Terminal pour lancer le build et le serveur
- [ ] Chrome DevTools ouverts
- [ ] Editeur pour montrer les fichiers de configuration Next.js

## Script

### [00:00-01:30] Introduction — Le meilleur du statique et du dynamique

> Salut ! Dans le screencast précédent, on a construit du SSR from scratch. Le SSR, c'est génial pour le premier affichage, mais ça à un coût : chaque requête génère le HTML sur le serveur. Et si on pouvait pré-générer les pages à l'avance, comme un site statique, mais garder la capacité de les mettre à jour ? C'est exactement ce que font SSG et ISR.

**Action** : Afficher le slide "Module 11 — ISR et SSG".

> SSG, Static Site Génération, c'est la génération des pages au moment du build. Elles deviennent des fichiers HTML statiques, servis ultra-rapidement par n'importe quel CDN. ISR, Incremental Static Regeneration, c'est l'évolution : les pages sont regénérées à la demandé, sans rebuild complet. C'est le pattern popularisé par Next.js, et on va le voir en action.

### [01:30-04:00] SSG — La génération au build time

> Commençons par le SSG classique.

**Action** : Ouvrir le projet lab et montrer la structure.

```bash
cd labs/lab-11-isr-revalidation
ls -la pages/
```

**Action** : Montrer un composant page avec `getStaticProps`.

```javascript
// pages/articles/[id].js
export async function getStaticProps({ params }) {
  const article = await fetchArticle(params.id);
  return {
    props: { article }
  };
}

export async function getStaticPaths() {
  const articles = await fetchAllArticles();
  return {
    paths: articles.map(a => ({ params: { id: a.id.toString() } })),
    fallback: false
  };
}

export default function ArticlePage({ article }) {
  return (
    <article>
      <h1>{article.title}</h1>
      <p>{article.content}</p>
    </article>
  );
}
```

> `getStaticProps` récupère les données au moment du build. `getStaticPaths` indique quelles pages générer. Au build, Next.js appelle ces fonctions et crée un fichier HTML pour chaque article. C'est du HTML statique, point final.

```bash
npm run build
```

**Action** : Montrer les fichiers générés dans le dossier `.next/server/pages/`.

> Regardez le résultat du build. Pour chaque article, un fichier `.html` et un fichier `.json` (les données). Ces fichiers sont servis directement, sans aucun calcul côté serveur. Le CDN n'a qu'à les distribuer.

> Le problème ? Si un article est modifié, il faut relancer le build. Pour un blog de 10 articles, ça va. Pour un e-commerce avec 100 000 produits, c'est impraticable.

### [04:00-07:30] ISR — La revalidation incrémentale

> C'est là qu'ISR entre en jeu. Avec ISR, on ajoute une propriété `revalidate` qui indique après combien de secondes la page doit être regénérée.

**Action** : Modifier le code pour ajouter ISR.

```javascript
// pages/articles/[id].js
export async function getStaticProps({ params }) {
  const article = await fetchArticle(params.id);
  return {
    props: { article },
    revalidate: 60 // Regénérer au max toutes les 60 secondes
  };
}
```

> `revalidate: 60` signifie : cette page est valide 60 secondes. Après 60 secondes, si quelqu'un la demandé, la page actuelle est servie (stale), et en arrière-plan, Next.js la regénère avec les données fraîches. La prochaine requête reçoit la version à jour.

**Action** : Lancer le serveur en mode production et démontrer ISR.

```bash
npm run build && npm start
```

> Ça vous rappelle quelque chose ? C'est exactement le pattern stale-while-revalidate ! Sauf qu'ici, au lieu de revalider une réponse HTTP, on régénère une page entière. Le principe est le même : servir instantanément, mettre à jour en arrière-plan.

**Action** : Naviguer vers un article, attendre 60 secondes, modifier les données, puis rafraîchir.

```bash
# Modifier un article dans la "base de données"
curl -X PUT -H "Content-Type: application/json" \
  -d '{"title":"Titre modifié"}' \
  http://localhost:3000/api/articles/1

# Attendre le revalidate et rafraîchir la page
```

> Je modifie l'article. Si je rafraîchis immédiatement, je vois encore l'ancienne version — c'est la version stale. Mais Next.js régénère la page en arrière-plan. Au prochain rafraîchissement, la nouvelle version apparaît. Latence zéro pour l'utilisateur.

### [07:30-10:00] On-Demand Revalidation — La purge manuelle

> ISR avec un timer, c'est bien. Mais parfois, on veut mettre à jour immédiatement. C'est la revalidation à la demandé.

**Action** : Montrer l'API route de revalidation.

```javascript
// pages/api/revalidate.js
export default async function handler(req, res) {
  const { secret, path } = req.query;

  if (secret !== process.env.REVALIDATION_SECRET) {
    return res.status(401).json({ message: 'Invalid token' });
  }

  try {
    await res.revalidate(path);
    return res.json({ revalidated: true });
  } catch (err) {
    return res.status(500).json({ message: 'Error revalidating' });
  }
}
```

> J'ai une API route protégée par un secret. Quand je l'appelle avec un chemin, elle force la regénération de cette page immédiatement. Plus besoin d'attendre le timer.

```bash
# Modifier les données
curl -X PUT -H "Content-Type: application/json" \
  -d '{"title":"Mise à jour urgente"}' \
  http://localhost:3000/api/articles/1

# Déclencher la revalidation immédiate
curl "http://localhost:3000/api/revalidate?secret=mon-secret&path=/articles/1"
# {"revalidated":true}
```

**Action** : Rafraîchir la page et montrer que la mise à jour est immédiate.

> Et voilà : la page est immédiatement à jour. En production, vous brancheriez ça sur un webhook de votre CMS ou de votre back-office. A chaque modification de contenu, le CMS appelle l'API de revalidation, et la page est regénérée en quelques secondes.

### [10:00-12:30] Fallback et pages à la demandé

> Un autre aspect puissant d'ISR : le fallback. Que se passe-t-il quand quelqu'un demandé une page qui n'a pas été générée au build ?

```javascript
export async function getStaticPaths() {
  // Ne pré-générer que les 100 articles les plus populaires
  const topArticles = await fetchTopArticles(100);
  return {
    paths: topArticles.map(a => ({ params: { id: a.id.toString() } })),
    fallback: 'blocking' // Générer à la demande pour les autres
  };
}
```

> Avec `fallback: 'blocking'`, quand quelqu'un demandé un article qui n'est pas pré-généré, Next.js le génère à la volée côté serveur, le met en cache, et le sert. Les requêtes suivantes sont servies depuis le cache. C'est de la génération incrémentale au sens propre.

**Action** : Accéder à un article non pré-généré et montrer la génération à la demandé.

> Ça permet de gérer des sites avec des millions de pages. On pré-génère les 1000 pages les plus populaires, et le reste est généré à la demandé. Le CDN absorbe les requêtes suivantes. C'est le meilleur des deux mondes.

> En termes de cache HTTP, les pages ISR sont typiquement servies avec :

```bash
curl -I http://localhost:3000/articles/1
# Cache-Control: s-maxage=60, stale-while-revalidate=31536000
```

> `s-maxage=60` pour le CDN, et un SWR très long. Next.js gère l'invalidation en interne, le CDN sert toujours la dernière version regénérée.

### [12:30-14:00] SSG vs ISR vs SSR — Quand utiliser quoi ?

> Récapitulons les trois approches.

**Action** : Afficher un tableau comparatif.

> SSG : parfait pour du contenu qui change rarement (documentation, landing pages). Build complet à chaque modification. Performance maximale.

> ISR : parfait pour du contenu qui change régulièrement mais pas en temps réel (blog, e-commerce, médias). Mise à jour incrémentale. Excellent compromis performance/fraîcheur.

> SSR : nécessaire pour du contenu en temps réel ou très personnalisé (dashboards, profils). Chaque requête génère le HTML. Performance dépendante du cache en amont.

> Mon conseil : commencez toujours par vous demander si SSG ou ISR suffit. Le SSR à chaque requête devrait être le dernier recours, pas le choix par défaut.

### [14:00-14:30] Récap — ISR, le cache du futur

> Résumons. SSG génère tout au build, ISR régénère à la demandé. ISR utilise le même pattern que stale-while-revalidate. La revalidation on-demand permet des mises à jour immédiates. Et le fallback permet de gérer des sites à millions de pages.

**Action** : Mentionner le quiz et le lab.

> Le lab `labs/lab-11-isr-revalidation/` vous fait configurer ISR avec différentes durées de revalidation et mettre en place la revalidation on-demand avec un webhook. Prochain screencast : l'edge rendering, quand le rendu se fait au plus près de l'utilisateur. A bientôt !

## Points d'attention pour l'enregistrement
- Le build Next.js peut prendre quelques secondes, anticiper le temps d'attente
- Bien montrer les fichiers générés dans .next pour illustrer le caractère statique
- La démo ISR nécessite d'attendre le timer de revalidation, utiliser une valeur courte (10-15s)
- L'API de revalidation on-demand doit être bien sécurisée avec un secret, le montrer
