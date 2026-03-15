# Screencast 08 — CDN : architecture et mini-CDN demo

## Informations
- **Durée estimée** : 14-15 min
- **Module** : `modules/08-cdn.md`
- **Lab associé** : `labs/lab-08-mini-cdn/`
- **Prérequis** : Screencast 04 (Cache-Control), Screencast 07 (Cache navigateur)

## Setup
- [ ] Architecture du lab prête : `labs/lab-08-mini-cdn/exercise.js` (serveur origin + proxy cache)
- [ ] Terminal avec curl
- [ ] Chrome DevTools
- [ ] Schéma d'architecture CDN à portée de main

## Script

### [00:00-01:30] Introduction — Qu'est-ce qu'un CDN ?

> Salut ! On a vu le cache navigateur, le cache côté client. Maintenant, on passe de l'autre côté : le cache côté infrastructure. Et le roi de l'infrastructure de cache, c'est le CDN — Content Delivery Network.

**Action** : Afficher le slide "Module 08 — CDN".

> Un CDN, c'est un réseau de serveurs répartis géographiquement qui stockent des copies de vos contenus au plus près des utilisateurs. Au lieu que chaque requête traverse l'Atlantique pour atteindre votre serveur en Virginie, elle est servie par un noeud CDN à Paris, à 10 millisecondes de là. La latence baisse, la performance monte, et votre serveur d'origine souffle.

### [01:30-04:00] Architecture d'un CDN — Comment ça marche

> Voyons comment fonctionne un CDN de l'intérieur.

**Action** : Afficher un schéma d'architecture CDN avec les PoP (Points of Presence).

> Quand un utilisateur à Lyon fait une requête, le DNS résout le domaine vers le PoP CDN le plus proche — disons Marseille. Le PoP vérifie son cache. Si la ressource est en cache et encore valide, il la sert directement. C'est un cache hit. Si elle n'est pas en cache, le PoP fait une requête vers votre serveur d'origine, stocke la réponse dans son cache, et la renvoie à l'utilisateur. C'est un cache miss.

> Les requêtes suivantes des autres utilisateurs de la région seront servies du cache du PoP. Le serveur d'origine ne voit qu'une seule requête pour potentiellement des milliers d'utilisateurs.

> Ce qui est beau, c'est que le CDN utilise les mêmes en-têtes HTTP qu'on a étudiés. `Cache-Control`, `s-maxage`, `Vary`, `ETag` — tout ce qu'on a vu fonctionne directement avec un CDN. C'est la puissance des standards.

### [04:00-08:00] Mini-CDN — Construction d'un proxy cache

> Pour bien comprendre, on va construire un mini-CDN nous-mêmes. Un proxy cache simple qui se comporte comme un noeud CDN.

**Action** : Lancer le lab et ouvrir le code.

```bash
cd labs/lab-08-mini-cdn
node exercise.js
```

> Notre architecture : un serveur d'origine sur le port 4000, et un proxy cache sur le port 3000 qui fait office de CDN. Les clients parlent au proxy, et le proxy gère le cache.

**Action** : Montrer le code du proxy cache dans l'éditeur.

```javascript
// Proxy cache simplifié (extrait de exercise.js)
const cache = new Map();

app.get('*', async (req, res) => {
  const key = req.url;
  const cached = cache.get(key);

  if (cached && !isExpired(cached)) {
    // Cache HIT
    res.set('X-Cache', 'HIT');
    res.set('Age', getAge(cached));
    return res.send(cached.body);
  }

  // Cache MISS - requête à l'origine
  const origin = await fetch(`http://localhost:4000${req.url}`);
  const body = await origin.text();
  const headers = Object.fromEntries(origin.headers);

  // Stocker dans le cache si autorisé
  if (isCacheable(headers)) {
    cache.set(key, { body, headers, timestamp: Date.now() });
  }

  res.set('X-Cache', 'MISS');
  res.send(body);
});
```

> Notre proxy fait exactement ce qu'un CDN fait : il intercepte la requête, vérifie son cache, et soit sert la réponse en cache (HIT), soit la demandé au serveur d'origine (MISS). Et il ajoute un en-tête `X-Cache` pour indiquer si c'est un hit ou un miss.

```bash
# Première requête : cache MISS
curl -I http://localhost:3000/api/articles
# X-Cache: MISS

# Deuxième requête : cache HIT
curl -I http://localhost:3000/api/articles
# X-Cache: HIT
# Age: 2
```

**Action** : Montrer le header X-Cache et Age dans les réponses.

> Regardez : la première requête est un MISS, le proxy a dû aller chercher la ressource. La deuxième est un HIT, servie depuis le cache du proxy. Et l'en-tête `Age` indique depuis combien de secondes la réponse est dans le cache. C'est un en-tête standard que tous les CDN envoient.

### [08:00-10:30] CDN en production — Cloudflare, Fastly, CloudFront

> En production, on utilise des CDN professionnels. Les plus courants : Cloudflare, Fastly (Varnish-based), AWS CloudFront, et Vercel Edge Network.

**Action** : Afficher les en-têtes d'un vrai CDN.

```bash
# Observer les en-têtes d'un vrai CDN (Cloudflare)
curl -I https://www.cloudflare.com/
```

> Regardez les en-têtes spécifiques au CDN. `CF-Cache-Status: HIT` — Cloudflare indique un cache hit. `CF-Ray` — l'identifiant de la requête, utile pour le debug. `Age: 1234` — la réponse est dans le cache depuis 1234 secondes.

> Chaque CDN a ses propres en-têtes de debug, mais le principe est le même. Et ils respectent tous les directives Cache-Control standard.

> L'en-tête clé pour le CDN, c'est `s-maxage`. Rappelons-nous : `s-maxage` remplace `max-age` pour les caches partagés.

```bash
# Le navigateur cache 60s, le CDN cache 1 heure
# Cache-Control: public, max-age=60, s-maxage=3600
```

> Avec cette configuration, le CDN garde la ressource 1 heure, mais l'utilisateur revalide toutes les 60 secondes. Le CDN absorbe 99% du trafic, et le serveur d'origine est tranquille.

### [10:30-12:30] Invalidation CDN — Le problème le plus dur

> Le plus grand défi avec un CDN, c'est l'invalidation. Comment dire au CDN de supprimer une réponse en cache quand le contenu change ?

**Action** : Afficher les méthodes d'invalidation.

> Méthode 1 : attendre l'expiration. Si votre s-maxage est de 5 minutes, au pire la réponse périmée sera servie 5 minutes. Simple mais pas toujours acceptable.

> Méthode 2 : purge explicite. Tous les CDN offrent une API de purge.

```bash
# Purge Cloudflare (exemple)
curl -X POST "https://api.cloudflare.com/client/v4/zones/{zone_id}/purge_cache" \
  -H "Authorization: Bearer {token}" \
  -d '{"files":["https://example.com/api/articles"]}'

# Purge Fastly (exemple)
curl -X PURGE https://example.com/api/articles -H "Fastly-Key: {token}"
```

> Méthode 3 : cache busting par le nom de fichier. C'est ce qu'on fait avec les assets : `style.a1b2c3.css`. Quand le contenu change, le hash change, l'URL change, et le CDN sert automatiquement la nouvelle version. Pas besoin de purge.

> Méthode 4 : les cache tags (où surrogate keys). C'est une feature avancée de Fastly et Cloudflare. Vous taguez vos réponses, et vous pouvez purger par tag.

```bash
# Réponse avec un tag
# Surrogate-Key: articles article-42

# Purge tous les articles
curl -X POST "https://api.fastly.com/service/{id}/purge/articles"
```

### [12:30-14:00] Bonnes pratiques CDN

> Quelques bonnes pratiques pour bien utiliser un CDN.

**Action** : Afficher la checklist des bonnes pratiques.

> Un : ne cachez jamais de contenu personnalisé sur le CDN. Utilisez `private` pour les données utilisateur. La dernière chose que vous voulez, c'est que l'utilisateur A voie le profil de l'utilisateur B.

> Deux : utilisez toujours `Vary` correctement. On en a parlé : `Vary: Accept-Encoding` au minimum, et `Vary: Origin` si vous avez du CORS.

> Trois : mettez en place un monitoring des hit ratios. Un bon CDN devrait avoir un hit ratio de 80% ou plus. Si c'est en dessous, vos en-têtes de cache sont probablement mal configurés.

> Quatre : testez vos en-têtes avant de mettre en production. Un s-maxage trop long sur du contenu dynamique, c'est un bug en production garanti.

### [14:00-14:30] Récap — CDN, le cache distribué

> Résumons. Un CDN est un réseau de caches distribués géographiquement. Il utilise les mêmes en-têtes HTTP qu'on a étudiés. `s-maxage` contrôle la durée de cache CDN. L'invalidation est le défi principal, avec plusieurs stratégies possibles. Et `X-Cache` / `Age` sont vos meilleurs amis pour le debug.

**Action** : Mentionner le quiz et le lab.

> Le lab `labs/lab-08-mini-cdn/` vous fait construire votre propre mini-CDN et observer le comportement cache hit/miss. Prochain screencast : le cache multi-couches, quand navigateur, CDN et serveur travaillent ensemble. A bientôt !

## Points d'attention pour l'enregistrement
- Le mini-CDN doit être bien fonctionnel avant d'enregistrer, tester les scénarios HIT/MISS
- Utiliser des vrais sites publics pour montrer les en-têtes CDN (Cloudflare, etc.)
- Bien expliquer la différence entre max-age et s-maxage
- Le scénario de contenu personnalisé servi par le CDN est un excellent contre-exemple à mentionner
