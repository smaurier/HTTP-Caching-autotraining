# Screencast 04 — Cache-Control : directives et démo DevTools

## Informations
- **Durée estimée** : 14-15 min
- **Module** : `modules/04-cache-control.md`
- **Lab associé** : `labs/lab-04-cache-control-explorer/`
- **Prérequis** : Screencast 03 (En-têtes HTTP, Vary)

## Setup
- [ ] Serveur Express du lab prêt : `labs/lab-04-cache-control-explorer/exercise.js`
- [ ] Chrome DevTools ouverts sur l'onglet Network avec "Disable cache" décoché
- [ ] Terminal avec curl
- [ ] Un chronomètre ou horloge visible pour démontrer max-age

## Script

### [00:00-01:30] Introduction — Cache-Control, le chef d'orchestre

> Salut ! On entre dans le vif du sujet. Cache-Control est l'en-tête HTTP le plus important pour le caching. C'est lui qui dit au navigateur, aux proxies et aux CDN comment cacher — ou ne pas cacher — une réponse. Si vous ne devez retenir qu'un seul en-tête de cette formation, c'est celui-là.

**Action** : Afficher le slide "Module 04 — Cache-Control".

> Cache-Control a été introduit en HTTP/1.1 pour remplacer l'ancien en-tête `Expires`. Il est bien plus flexible et bien plus précis. On va voir chaque directive, ce qu'elle fait, et surtout quand l'utiliser.

### [01:30-04:30] Les directives de base — public, private, no-store

> Commençons par les directives fondamentales. Il y en a trois qui contrôlent ou la réponse peut être cachée.

**Action** : Lancer le serveur du lab et ouvrir le fichier exercice dans l'éditeur.

```bash
cd labs/lab-04-cache-control-explorer
node exercise.js
```

> `public` signifie que la réponse peut être cachée partout : par le navigateur, par un CDN, par un proxy d'entreprise. C'est la directive la plus permissive.

```bash
curl -I http://localhost:3000/public-resource
# Cache-Control: public, max-age=3600
```

> `private` signifie que seul le navigateur de l'utilisateur peut cacher la réponse. Un CDN ou un proxy ne doit pas la stocker. C'est crucial pour les données personnalisées : le profil d'un utilisateur, un panier d'achat, un tableau de bord.

```bash
curl -I http://localhost:3000/private-resource
# Cache-Control: private, max-age=600
```

> Et `no-store`, c'est le nucléaire. Aucun cache, nulle part, jamais. La réponse ne doit même pas être écrite sur disque. C'est pour les données sensibles : transactions bancaires, informations médicales.

```bash
curl -I http://localhost:3000/sensitive-resource
# Cache-Control: no-store
```

**Action** : Ouvrir les DevTools et montrer le comportement de chaque directive en rafraîchissant la page.

> Dans les DevTools, si je navigue vers la ressource publique, puis je rafraîchis : regardez la colonne "Size". Au lieu de la taille du fichier, on voit "(from memory cache)" ou "(from disk cache)". La réponse a été servie depuis le cache du navigateur. Zéro requête réseau.

### [04:30-07:30] max-age et s-maxage — Le temps de vie du cache

> Maintenant, parlons durée. `max-age` indique combien de secondes la réponse reste fraîche dans le cache.

**Action** : Démontrer max-age avec un court délai pour voir l'expiration.

```bash
# max-age de 10 secondes pour la démo
curl -I http://localhost:3000/short-lived
# Cache-Control: public, max-age=10
```

> Ici, j'ai configuré un max-age de 10 secondes. Si je fais la requête dans le navigateur et que je rafraîchis dans les 10 secondes, c'est servi du cache. Après 10 secondes, le cache est périmé et le navigateur refait une requête au serveur.

**Action** : Rafraîchir la page plusieurs fois et observer quand le cache expire dans les DevTools.

> Regardez le status code et la colonne Size. Pendant 10 secondes : cache hit. Après : requête normale au serveur avec un 200.

> `s-maxage` c'est pareil mais spécifiquement pour les caches partagés — CDN, proxies. Le "s" c'est pour "shared". Ça permet d'avoir des durées de cache différentes pour le navigateur et pour le CDN.

```bash
curl -I http://localhost:3000/cdn-optimized
# Cache-Control: public, max-age=60, s-maxage=3600
```

> Ici, le navigateur cache pendant 60 secondes, mais le CDN cache pendant 1 heure. C'est un pattern très courant : on veut que le CDN garde longtemps pour réduire la charge serveur, mais que l'utilisateur reçoive des mises à jour relativement fraîches.

### [07:30-10:00] no-cache et must-revalidate — La validation obligatoire

> Attention, `no-cache` est probablement la directive la plus mal comprise. `no-cache` ne signifie PAS "ne pas cacher". Ça signifie "tu peux cacher, mais tu dois revalider avec le serveur avant chaque utilisation".

**Action** : Afficher un schéma montrant le flux no-cache vs no-store.

```bash
curl -I http://localhost:3000/must-check
# Cache-Control: no-cache
```

> Avec `no-cache`, le navigateur stocke la réponse, mais avant de l'utiliser, il envoie une requête conditionnelle au serveur. Si rien n'a changé, le serveur répond 304 et le navigateur utilise sa copie. Si ça a changé, le serveur envoie la nouvelle version.

> `must-revalidate` est similaire mais agit différemment : la réponse peut être utilisée depuis le cache tant qu'elle est fraîche (selon max-age), mais une fois expirée, il FAUT revalider. Pas de réponse périmée en cas de problème réseau.

```bash
curl -I http://localhost:3000/validated-resource
# Cache-Control: public, max-age=300, must-revalidate
```

**Action** : Montrer dans les DevTools la différence entre un cache hit (max-age non expiré) et une revalidation (304).

> Le pattern le plus courant pour les APIs : `Cache-Control: no-cache`. Le navigateur vérifie toujours, et si rien n'a changé, il récupère le 304 en quelques millisecondes au lieu de retélécharger tout le payload.

### [10:00-12:00] immutable et stale-while-revalidate — Les directives modernes

> Parlons de deux directives plus récentes mais très utiles.

> `immutable` dit au navigateur : "cette ressource ne changera jamais". Même si l'utilisateur fait un hard refresh, pas besoin de revalider. C'est parfait pour les assets avec un hash dans le nom de fichier : `style.a1b2c3.css`.

```bash
curl -I http://localhost:3000/assets/style.abc123.css
# Cache-Control: public, max-age=31536000, immutable
```

> 31536000 secondes, c'est un an. Combiné avec `immutable`, c'est le cache ultime. Si le fichier change, on change le nom du fichier (le hash), et le navigateur télécharge la nouvelle version.

> Et `stale-while-revalidate` — on en reparlera en détail dans le screencast dédié — permet au cache de servir une réponse périmée pendant qu'il revalide en arrière-plan.

```bash
curl -I http://localhost:3000/articles
# Cache-Control: public, max-age=60, stale-while-revalidate=300
```

> "Sers la version en cache même si elle est périmée depuis max 300 secondes, mais lance une revalidation en background." L'utilisateur à une réponse instantanée, et le cache se met à jour silencieusement.

### [12:00-13:00] Combinaisons courantes — Les recettes du quotidien

> En pratique, voici les combinaisons que vous utiliserez le plus souvent.

**Action** : Afficher un tableau des recettes courantes.

> Pour les assets statiques avec hash : `public, max-age=31536000, immutable`. Pour les pages HTML : `no-cache` ou `public, max-age=0, must-revalidate`. Pour les API publiques : `public, max-age=60, stale-while-revalidate=300`. Pour les données privées : `private, max-age=300`. Et pour les données sensibles : `no-store`.

> L'erreur classique, c'est de mettre `max-age=31536000` sur un fichier HTML. Si vous faites ça, vos utilisateurs verront l'ancienne version pendant un an. Les assets avec hash, oui. Les pages HTML, jamais.

### [13:00-14:30] Récap — Maîtriser Cache-Control

> Résumons. `public` vs `private` contrôle ou le cache est autorisé. `max-age` et `s-maxage` contrôlent la durée. `no-cache` force la revalidation. `no-store` interdit tout cache. `immutable` évite les revalidations inutiles. Et `stale-while-revalidate` offre le meilleur des deux mondes.

**Action** : Mentionner le quiz et le lab associé.

> Le lab `labs/lab-04-cache-control-explorer/` vous fait configurer les bonnes directives Cache-Control pour différents types de ressources. C'est le lab le plus important de la formation — prenez le temps de bien le faire. Prochain screencast : les ETags, pour la validation fine du cache. A plus !

## Points d'attention pour l'enregistrement
- Bien distinguer no-cache et no-store, c'est la confusion la plus fréquente
- Utiliser un max-age court (10s) pour la démo afin de montrer l'expiration en temps réel
- Vérifier que "Disable cache" est bien décoché dans les DevTools
- Montrer la différence visuelle dans la colonne Size entre "(from cache)" et une requête réseau
