# Screencast 05 — ETag : implémentation et flux 304

## Informations
- **Durée estimée** : 13-15 min
- **Module** : `modules/05-etag-validation.md`
- **Lab associé** : `labs/lab-05-etag-flow/`
- **Prérequis** : Screencast 04 (Cache-Control directives)

## Setup
- [ ] Serveur Express du lab prêt : `labs/lab-05-etag-flow/exercise.js`
- [ ] Chrome DevTools ouverts sur l'onglet Network (cocher "Preserve log")
- [ ] Terminal avec curl
- [ ] Un fichier texte modifiable sur le serveur pour démontrer le changement d'ETag

## Script

### [00:00-01:30] Introduction — Pourquoi les ETags ?

> Salut ! On a vu Cache-Control et max-age dans le screencast précédent. C'est super pour dire "cache cette réponse pendant X secondes". Mais que se passe-t-il quand le cache expire ? Le navigateur doit-il tout retélécharger ? Pas forcément. C'est là que les ETags entrent en jeu.

**Action** : Afficher le slide "Module 05 — ETag et validation".

> L'ETag, c'est une empreinte de la ressource. Une sorte de fingerprint. Si la ressource n'a pas changé, l'empreinte est la même, et le serveur peut répondre "rien n'a changé, utilise ta copie" avec un simple code 304. Économie de bande passante garantie.

### [01:30-04:30] Le flux complet — Première requête et revalidation

> Voyons le flux complet étape par étape.

**Action** : Lancer le serveur du lab.

```bash
cd labs/lab-05-etag-flow
node exercise.js
```

> Première requête : le client demande la ressource pour la première fois.

```bash
curl -v http://localhost:3000/article/1
```

**Action** : Pointer les en-têtes de la réponse.

> Le serveur répond avec un 200 OK, le corps de la réponse, et un en-tête `ETag`. Regardez : `ETag: "a1b2c3d4"`. C'est l'empreinte de cette version de l'article. Le serveur envoie aussi `Cache-Control: no-cache` pour forcer la revalidation à chaque requête.

> Maintenant, deuxième requête. Le navigateur a la réponse en cache avec son ETag. Il envoie une requête conditionnelle.

```bash
curl -v -H 'If-None-Match: "a1b2c3d4"' http://localhost:3000/article/1
```

> Regardez la requête : elle contient l'en-tête `If-None-Match` avec la valeur de l'ETag précédent. Le client dit au serveur : "j'ai cette version, est-ce qu'elle est encore bonne ?"

**Action** : Montrer la réponse 304.

> Et le serveur répond 304 Not Modified ! Pas de corps dans la réponse. Le serveur dit simplement "oui, ta version est toujours bonne". Le navigateur utilise sa copie en cache. On a économisé tout le transfert du corps de la réponse.

### [04:30-07:30] ETag en pratique — Démo dans les DevTools

> Voyons ça dans les DevTools pour que ce soit plus concret.

**Action** : Ouvrir Chrome et naviguer vers `http://localhost:3000/article/1` avec les DevTools ouverts.

> Première visite. Le navigateur fait un GET, reçoit un 200, et stocke la réponse avec l'ETag. Regardez dans les Response Headers : `ETag: "a1b2c3d4"`.

**Action** : Cliquer sur la requête et montrer l'ETag dans les Response Headers.

> Maintenant, je rafraîchis la page.

**Action** : Rafraîchir avec F5 et observer la nouvelle requête.

> Regardez ! Le status code est 304, pas 200. Et la taille transférée est minuscule — juste les en-têtes, pas de corps. Mais le navigateur affiche quand même la page complète, parce qu'il utilise sa copie en cache.

> Si je regarde les Request Headers, je vois `If-None-Match: "a1b2c3d4"`. C'est le navigateur qui envoie automatiquement l'ETag stocké pour revalider.

**Action** : Maintenant, modifier la ressource côté serveur.

```bash
# Dans un autre terminal, modifier le contenu de l'article
curl -X PUT -H "Content-Type: application/json" \
  -d '{"title":"Article modifié","content":"Nouveau contenu"}' \
  http://localhost:3000/article/1
```

> J'ai modifié l'article. L'ETag a changé côté serveur. Maintenant, quand je rafraîchis...

**Action** : Rafraîchir la page dans Chrome.

> Boum ! Code 200, pas 304. Le serveur a détecté que l'ETag envoyé par le client ne correspond plus, donc il renvoie la nouvelle version complète avec un nouvel ETag. Le navigateur met à jour son cache.

### [07:30-10:00] Implémentation côté serveur — Comment générer un ETag

> Comment on génère un ETag côté serveur ? Il y a plusieurs stratégies.

**Action** : Ouvrir le fichier `exercise.js` dans l'éditeur pour montrer le code.

> La plus simple : un hash du contenu. On prend le corps de la réponse, on calcule un hash MD5 ou SHA-256, et c'est notre ETag.

```javascript
const crypto = require('crypto');

function generateETag(content) {
  return '"' + crypto.createHash('md5').update(content).digest('hex') + '"';
}
```

> L'avantage : c'est déterministe. Le même contenu produit toujours le même ETag, même si le serveur a redémarré. L'inconvénient : il faut générer la réponse complète avant de pouvoir calculer le hash.

> Une autre approche : utiliser la date de dernière modification et la taille du fichier.

```javascript
function generateWeakETag(stat) {
  return 'W/"' + stat.mtime.getTime().toString(16) + '-' + stat.size.toString(16) + '"';
}
```

> Notez le `W/` devant : c'est un "weak ETag". Un ETag faible signifie que la ressource est sémantiquement équivalente, pas nécessairement identique au bit près. C'est suffisant dans la plupart des cas.

> Express et la plupart des frameworks génèrent les ETags automatiquement. Mais c'est important de comprendre le mécanisme pour pouvoir le personnaliser quand nécessaire.

### [10:00-12:00] Last-Modified — L'alternative aux ETags

> Les ETags ne sont pas le seul mécanisme de validation. Il y a aussi `Last-Modified`.

```bash
curl -I http://localhost:3000/static/style.css
# Last-Modified: Mon, 15 Jan 2024 10:30:00 GMT
# ETag: "abc123"
```

> `Last-Modified` indique quand la ressource a été modifiée pour la dernière fois. Pour revalider, le client envoie `If-Modified-Since`.

```bash
curl -v -H "If-Modified-Since: Mon, 15 Jan 2024 10:30:00 GMT" http://localhost:3000/static/style.css
```

> Si la ressource n'a pas été modifiée depuis cette date, le serveur renvoie 304. C'est le même principe que les ETags, mais avec une granularité à la seconde.

**Action** : Afficher un tableau comparatif ETag vs Last-Modified.

> Les ETags sont plus précis : ils détectent un changement même si la date de modification n'a pas changé. Et ils fonctionnent même quand le fichier n'a pas de date de modification (contenu généré dynamiquement). En pratique, utilisez les ETags. `Last-Modified` est un bonus, pas un remplacement.

> Le meilleur pattern : envoyer les deux. ETag ET Last-Modified. Les caches utilisent d'abord l'ETag (plus fiable), et `Last-Modified` en fallback.

### [12:00-13:30] Pièges courants — Ce qu'il faut éviter

> Quelques pièges à connaître avec les ETags.

**Action** : Afficher la liste des pièges.

> Piège numéro un : les ETags derrière un load balancer. Si vous avez deux serveurs qui génèrent des ETags différents pour le même contenu, le cache va constamment recharger la ressource en pensant qu'elle a changé. Assurez-vous que vos ETags sont déterministes.

> Piège numéro deux : Apache et nginx ajoutent par défaut un inode dans le calcul de l'ETag. Si vous redéployez sur un nouveau serveur, les inodes changent, et tous les caches sont invalidés. Configurez vos serveurs pour utiliser uniquement la taille et la date de modification.

> Piège numéro trois : oublier de désactiver les ETags sur les ressources avec `no-store`. Si vous servez des données sensibles, pas besoin d'ETag — il n'y a rien à revalider.

### [13:30-14:30] Récap — ETags, la validation intelligente

> Résumons. Les ETags sont des empreintes de ressources qui permettent la validation conditionnelle. Le flux : stockage de l'ETag, envoi avec If-None-Match, réponse 304 si inchangé. Côté serveur, le hash du contenu est la méthode la plus fiable. Et les ETags sont plus précis que Last-Modified.

**Action** : Mentionner le quiz et le lab.

> Direction le lab `labs/lab-05-etag-flow/` ! Vous allez implémenter un système d'ETags complet, observer le flux 304 dans les DevTools, et mesurer l'économie de bande passante. Prochain screencast : le pattern stale-while-revalidate. A bientôt !

## Points d'attention pour l'enregistrement
- Bien montrer la différence de taille transférée entre un 200 et un 304 dans les DevTools
- Activer "Preserve log" dans les DevTools pour garder l'historique des requêtes
- Prendre le temps de bien expliquer le flux aller-retour If-None-Match / 304
- Vérifier que le serveur du lab génère bien des ETags différents quand le contenu change
