# Screencast 12 — Edge rendering : middleware et routing

## Informations
- **Durée estimée** : 13-15 min
- **Module** : `modules/12-edge-rendering.md`
- **Lab associé** : `labs/lab-12-edge-middleware/`
- **Prérequis** : Screencast 08 (CDN), Screencast 11 (ISR/SSG)

## Setup
- [ ] Projet Next.js avec middleware edge : `labs/lab-12-edge-middleware/`
- [ ] Terminal pour lancer le serveur de développement
- [ ] Chrome DevTools ouverts
- [ ] Schéma d'architecture edge computing

## Script

### [00:00-01:30] Introduction — Le rendu à la périphérie

> Salut ! On a vu le SSR qui tourne sur un serveur central, et le CDN qui distribue du contenu statique. Et si on combinait les deux ? Et si on pouvait exécuter du code directement sur les noeuds CDN, au plus près de l'utilisateur ? C'est l'edge rendering, ou edge computing.

**Action** : Afficher le slide "Module 12 — Edge Rendering".

> L'idée est simple : au lieu d'envoyer la requête jusqu'à un serveur à 200ms de latence, on exécute la logique sur un noeud edge à 10ms de l'utilisateur. Le résultat : des temps de réponse drastiquement réduits pour du contenu dynamique. C'est la promesse des plateformes comme Cloudflare Workers, Vercel Edge Functions, ou Deno Deploy.

### [01:30-04:00] Comment fonctionne l'edge

> Pour comprendre l'edge, comparons-le au modèle classique.

**Action** : Afficher un schéma comparant le flow classique vs edge.

> Modèle classique : l'utilisateur à Tokyo envoie une requête. Le CDN à Tokyo n'a pas la réponse en cache. La requête traverse le Pacifique jusqu'au serveur à San Francisco. Le serveur génère le HTML. La réponse fait le chemin inverse. Temps total : 300ms de latence réseau + temps de génération.

> Modèle edge : l'utilisateur à Tokyo envoie une requête. Le noeud edge à Tokyo exécute le code directement. HTML généré et renvoyé. Temps total : 10ms de latence réseau + temps de génération. La latence réseau a presque disparu.

> Mais attention, l'edge a des contraintes. Le runtime est limité : pas d'accès fichier, pas de Node.js complet, des bibliothèques réduites, et un temps d'exécution max (souvent 30 secondes pour les Workers, encore moins pour le middleware). Il faut penser léger.

### [04:00-08:00] Edge Middleware — Le cas concret Next.js

> L'utilisation la plus courante de l'edge, c'est le middleware. Voyons ça avec Next.js.

**Action** : Ouvrir le lab et montrer le fichier middleware.

```bash
cd labs/lab-12-edge-middleware
npm run dev
```

```javascript
// middleware.js (à la racine du projet)
import { NextResponse } from 'next/server';

export function middleware(request) {
  const { pathname, searchParams } = request.nextUrl;

  // 1. Géolocalisation : rediriger vers la bonne langue
  const country = request.geo?.country || 'FR';
  if (pathname === '/' && country === 'DE') {
    return NextResponse.redirect(new URL('/de', request.url));
  }

  // 2. A/B testing : répartir les utilisateurs
  const bucket = request.cookies.get('ab-bucket');
  if (!bucket) {
    const newBucket = Math.random() > 0.5 ? 'A' : 'B';
    const response = NextResponse.next();
    response.cookies.set('ab-bucket', newBucket, { maxAge: 86400 });
    return response;
  }

  // 3. Authentication : protéger des routes
  if (pathname.startsWith('/dashboard')) {
    const token = request.cookies.get('auth-token');
    if (!token) {
      return NextResponse.redirect(new URL('/login', request.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/', '/dashboard/:path*', '/api/:path*']
};
```

> Ce middleware s'exécute sur l'edge, avant même que la page soit générée. Il fait trois choses : géolocalisation pour la langue, A/B testing avec des cookies, et vérification d'authentification. Tout ça en quelques millisecondes, au plus près de l'utilisateur.

**Action** : Montrer dans les DevTools que le middleware ajoute des en-têtes et des cookies.

> Regardez les en-têtes de réponse. Le middleware a ajouté un cookie `ab-bucket`. Et si je change la géolocalisation dans les DevTools (via les sensors), je suis redirigé vers une autre page. Tout ça sans atteindre le serveur d'origine.

### [08:00-10:30] Edge et cache — La synergie

> Le vrai pouvoir de l'edge, c'est sa synergie avec le cache.

**Action** : Afficher un schéma du flux edge + cache.

> Cas 1 : le middleware edge décide quelle version cacher servir. Par exemple, l'A/B test. L'utilisateur bucket A reçoit la version A de la page depuis le cache edge. L'utilisateur bucket B reçoit la version B. Le middleware route vers la bonne version, et le cache edge sert le contenu.

```javascript
// Middleware qui route vers différentes versions cachées
export function middleware(request) {
  const bucket = request.cookies.get('ab-bucket')?.value || 'A';
  const url = request.nextUrl.clone();

  // Réécrire l'URL pour pointer vers la bonne variante
  url.pathname = `/_variants/${bucket}${url.pathname}`;

  const response = NextResponse.rewrite(url);
  // Indiquer au cache que la réponse varie selon le cookie
  response.headers.set('Vary', 'Cookie');
  return response;
}
```

> Cas 2 : l'edge personnalise le contenu en combinant du cache et du dynamique. Le squelette HTML est en cache, mais le middleware injecte le nom de l'utilisateur, la langue, ou le thème. C'est l'Edge Side Includes (ESI) moderne.

> Cas 3 : l'edge gère l'invalidation. Le middleware peut vérifier un flag dans un KV store (comme Cloudflare KV) et décider de servir le cache ou de régénérer.

```javascript
export async function middleware(request) {
  // Vérifier si le contenu est encore valide via un KV store
  const version = await CACHE_KV.get('content-version');
  const cachedVersion = request.headers.get('X-Content-Version');

  if (version !== cachedVersion) {
    // Forcer la régénération
    const response = NextResponse.next();
    response.headers.set('X-Content-Version', version);
    response.headers.set('Cache-Control', 'no-cache');
    return response;
  }
}
```

### [10:30-12:30] Edge Functions — Au-delà du middleware

> Le middleware, c'est du routing et de la logique légère. Mais on peut aussi faire du rendu complet à l'edge.

**Action** : Montrer une edge function qui génère du HTML.

```javascript
// app/api/edge-render/route.js
export const runtime = 'edge';

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const city = searchParams.get('city') || 'Paris';

  // Appel à une API de météo (rapide car proche de l'edge)
  const weather = await fetch(`https://api.weather.com/${city}`);
  const data = await weather.json();

  const html = `<div>
    <h2>Météo à ${city}</h2>
    <p>${data.temperature}°C - ${data.condition}</p>
  </div>`;

  return new Response(html, {
    headers: {
      'Content-Type': 'text/html',
      'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600'
    }
  });
}
```

> Cette edge function génère du HTML dynamique. Le `runtime = 'edge'` indique à Next.js d'exécuter cette route sur les noeuds edge. Et la réponse est cachée pendant 5 minutes avec SWR. La première requête depuis Tokyo est rapide (edge local), et les suivantes sont instantanées (cache edge).

> Les limitations : pas d'accès à la base de données directement (sauf via des solutions comme PlanetScale ou Turso qui ont des réplicas edge), pas de filesystem, et un subset limité de Node.js APIs.

### [12:30-14:00] Quand utiliser l'edge — Les bons cas d'usage

> L'edge n'est pas la solution à tout. Voici les bons cas d'usage.

**Action** : Afficher une checklist des cas d'usage.

> Oui à l'edge : routing et redirections, A/B testing, géolocalisation, authentication/authorization, personnalisation légère, et API routes simples.

> Non à l'edge : requêtes lourdes à la base de données, traitements CPU intensifs, opérations nécessitant le filesystem, et code avec beaucoup de dépendances Node.js.

> La règle d'or : si votre logique prend moins de 50ms et n'a pas besoin d'un serveur complet, mettez-la à l'edge. Sinon, gardez-la sur un serveur classique avec du cache CDN devant.

### [14:00-14:30] Récap — L'edge, le cache intelligent

> Résumons. L'edge exécute du code au plus près de l'utilisateur. Le middleware edge gère le routing, l'auth et la personnalisation. La combinaison edge + cache est redoutablement efficace. Et l'edge a des contraintes de runtime à respecter.

**Action** : Mentionner le quiz et le lab.

> Le lab `labs/lab-12-edge-middleware/` vous fait implémenter un middleware edge complet avec géolocalisation, A/B testing, et cache routing. Prochain screencast : le streaming HTTP, quand on n'attend plus la fin pour commencer à afficher. A plus !

## Points d'attention pour l'enregistrement
- Les fonctionnalités de géolocalisation ne sont pas disponibles en local, simuler avec des headers
- Bien expliquer que le middleware s'exécute AVANT la page, pas après
- Montrer le schéma d'architecture pour que le concept soit clair
- Les edge functions ont des limitations de runtime, les mentionner clairement
