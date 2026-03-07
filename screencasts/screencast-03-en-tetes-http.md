# Screencast 03 — En-têtes HTTP, Vary, CORS et négociation de contenu

## Informations
- **Durée estimée** : 14-15 min
- **Module** : `modules/03-en-tetes-http.md`
- **Lab associé** : `labs/lab-03-headers-playground/`
- **Prérequis** : Screencast 01 (Anatomie request/response), Screencast 02 (HTTP/2)

## Setup
- [ ] Serveur Express du lab lancé : `labs/lab-03-headers-playground/exercise.js`
- [ ] Navigateur Chrome avec DevTools ouverts sur l'onglet Network
- [ ] Terminal avec curl
- [ ] Fichier `exercise.js` ouvert dans l'éditeur pour modifier les en-têtes en direct

## Script

### [00:00-01:30] Introduction — Les en-têtes, le langage secret de HTTP

> Salut ! Aujourd'hui, on attaque un sujet fondamental : les en-têtes HTTP. Si HTTP est une conversation, les en-têtes sont les métadonnées de cette conversation. Ils indiquent au serveur et au client comment interpréter et traiter les données échangées. Et pour le cache, ce sont les en-têtes qui dictent absolument tout.

**Action** : Afficher le slide "Module 03 — En-têtes HTTP".

> On va voir les en-têtes les plus importants, avec un focus particulier sur `Vary` et la négociation de contenu, parce que c'est directement lié à la façon dont le cache stocke les réponses. Et on fera un détour par CORS, parce qu'on le croise tout le temps.

### [01:30-04:00] Les en-têtes de requête essentiels

> Commençons par les en-têtes que le client envoie au serveur.

**Action** : Lancer le serveur du lab et faire une requête curl verbose.

```bash
cd labs/lab-03-headers-playground
node exercise.js
```

```bash
curl -v http://localhost:3000/api/articles
```

> Regardez les en-têtes de requête. `Host` : obligatoire, indique le serveur visé. `Accept` : indique les types de contenu que le client accepte. `Accept-Language` : les langues préférées. `Accept-Encoding` : les compressions acceptées, comme gzip ou br (Brotli).

> Ces en-têtes `Accept-*`, c'est ce qu'on appelle la négociation de contenu. Le client dit "je préfère du JSON, en français, compressé en Brotli", et le serveur fait de son mieux pour satisfaire ces préférences.

```bash
# Demander explicitement du JSON
curl -H "Accept: application/json" http://localhost:3000/api/articles

# Demander du XML
curl -H "Accept: application/xml" http://localhost:3000/api/articles

# Demander en anglais
curl -H "Accept-Language: en-US" http://localhost:3000/api/articles
```

**Action** : Montrer les différentes réponses selon les en-têtes Accept.

> Vous voyez ? Le même endpoint renvoie des contenus différents selon les en-têtes de la requête. Et ça, c'est un vrai défi pour le cache. Comment cacher la réponse si elle varie selon la requête ? C'est là qu'intervient l'en-tête `Vary`.

### [04:00-07:30] Vary — L'en-tête qui sauve le cache

> `Vary` est un en-tête de réponse. Il dit au cache : "attention, ma réponse dépend de tel ou tel en-tête de la requête".

**Action** : Ouvrir le fichier `exercise.js` pour montrer comment le serveur configure Vary.

```javascript
// Dans exercise.js
res.setHeader('Vary', 'Accept, Accept-Language');
```

> Ici, le serveur dit : "ma réponse varie selon `Accept` et `Accept-Language`". Ça signifie que le cache doit stocker une version différente de la réponse pour chaque combinaison de ces en-têtes.

```bash
# Requête 1 : JSON en français
curl -H "Accept: application/json" -H "Accept-Language: fr" -I http://localhost:3000/api/articles

# Requête 2 : JSON en anglais
curl -H "Accept: application/json" -H "Accept-Language: en" -I http://localhost:3000/api/articles
```

**Action** : Pointer l'en-tête `Vary` dans la réponse.

> Regardez la réponse : `Vary: Accept, Accept-Language`. Le cache sait maintenant qu'il doit utiliser ces en-têtes comme clé de cache. Une requête JSON/fr et une requête JSON/en sont deux entrées de cache distinctes.

> Attention par contre : `Vary: *` (étoile) signifie que la réponse varie selon tout et n'importe quoi. En pratique, ça rend la réponse non cacheable. A éviter absolument.

**Action** : Démontrer `Vary: Accept-Encoding` qui est très courant.

```bash
# Sans compression
curl -H "Accept-Encoding: identity" -I http://localhost:3000/style.css

# Avec gzip
curl -H "Accept-Encoding: gzip" -I http://localhost:3000/style.css
```

> `Vary: Accept-Encoding` est partout. Ça signifie que le cache stocke une version gzip et une version non compressée séparément. C'est le cas le plus fréquent que vous verrez.

### [07:30-10:30] CORS — Les en-têtes cross-origin

> Changeons de sujet un instant pour parler de CORS. Ce n'est pas directement lié au cache, mais vous le croisez tellement souvent que ça vaut le coup d'en parler, et il y a des interactions subtiles avec le cache.

**Action** : Ouvrir une page web qui fait un fetch vers un autre domaine.

> CORS, c'est Cross-Origin Resource Sharing. Quand votre page sur `app.example.com` fait un fetch vers `api.example.com`, le navigateur bloque la requête par défaut. C'est une protection de sécurité. Pour autoriser l'accès, le serveur API doit envoyer les bons en-têtes CORS.

```bash
# Simuler une requête preflight CORS
curl -v -X OPTIONS \
  -H "Origin: http://app.example.com" \
  -H "Access-Control-Request-Method: POST" \
  -H "Access-Control-Request-Headers: Content-Type" \
  http://localhost:3000/api/articles
```

**Action** : Montrer les en-têtes CORS dans la réponse.

> Le serveur répond avec `Access-Control-Allow-Origin`, `Access-Control-Allow-Methods`, et `Access-Control-Allow-Headers`. C'est le feu vert pour le navigateur.

> Et voici le lien avec le cache : si votre API est appelée depuis plusieurs origines, la réponse dépend de l'en-tête `Origin`. Donc le serveur devrait envoyer `Vary: Origin` pour que le cache stocke des réponses différentes par origine.

```bash
# Requête avec Origin différent
curl -H "Origin: http://app1.example.com" -I http://localhost:3000/api/articles
curl -H "Origin: http://app2.example.com" -I http://localhost:3000/api/articles
```

> Sans `Vary: Origin`, un CDN pourrait cacher la réponse avec `Access-Control-Allow-Origin: http://app1.example.com` et la servir à `app2.example.com`. Et là, CORS bloque. Un bug classique et frustrant.

### [10:30-12:30] Content Negotiation en pratique

> Revenons à la négociation de contenu pour voir un cas pratique complet.

**Action** : Modifier `exercise.js` en direct pour ajouter une négociation de contenu.

```bash
# Négocier le format de la réponse
curl -H "Accept: text/html" http://localhost:3000/api/articles
curl -H "Accept: application/json" http://localhost:3000/api/articles

# Le serveur renvoie Content-Type correspondant et Vary: Accept
```

> Le serveur inspecte l'en-tête `Accept`, choisit le format approprié, renvoie la réponse avec le bon `Content-Type` et ajoute `Vary: Accept`. C'est propre, c'est standard, et ça fonctionne avec tous les caches.

**Action** : Montrer dans les DevTools les différentes réponses cachées.

> Dans les DevTools, si je fais deux requêtes avec des en-têtes Accept différents, je vois bien deux réponses distinctes. Et si le serveur a mis un `Cache-Control: max-age=300`, chaque variante est cachée séparément pendant 5 minutes.

> Le pattern à retenir : si votre réponse dépend d'un en-tête de requête, mettez cet en-tête dans `Vary`. Sinon, votre cache va servir la mauvaise version au mauvais client.

### [12:30-14:30] Récap — En-têtes essentiels pour le cache

> Récapitulons. Les en-têtes de requête `Accept-*` permettent la négociation de contenu. L'en-tête de réponse `Vary` indique au cache quels en-têtes de requête font varier la réponse. Les en-têtes CORS doivent être combinés avec `Vary: Origin` quand la réponse dépend de l'origine. Et `Vary: *` tue le cache — à proscrire.

**Action** : Mentionner le quiz et le lab.

> Le lab `labs/lab-03-headers-playground/` vous fait manipuler tous ces en-têtes. Vous allez configurer un serveur qui fait de la négociation de contenu, mettre en place les bons `Vary`, et observer le comportement du cache. C'est un exercice très formateur.

> Et dans le prochain screencast, on entre dans le coeur du sujet : Cache-Control, l'en-tête roi du caching HTTP. A très vite !

## Points d'attention pour l'enregistrement
- Bien distinguer en-têtes de requête et en-têtes de réponse visuellement
- Prendre le temps sur `Vary` car c'est souvent mal compris et source de bugs de cache
- Le bug CORS lié au cache manquant `Vary: Origin` est un excellent exemple concret
- Vérifier que le serveur du lab gère bien la négociation de contenu avant d'enregistrer
