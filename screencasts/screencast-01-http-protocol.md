# Screencast 01 — Anatomie request/response, curl demo, status codes

## Informations
- **Durée estimée** : 14-15 min
- **Module** : `modules/01-protocole-http.md`
- **Lab associé** : `labs/lab-01-http-inspector/`
- **Prérequis** : Screencast 00 (Introduction HTTP, DevTools)

## Setup
- [ ] Serveur Node.js du lab prêt : `labs/lab-01-http-inspector/exercise.js`
- [ ] Terminal avec `curl` disponible
- [ ] Chrome DevTools ouvert sur l'onglet Network
- [ ] Fichier de référence des status codes à portée de main

## Script

### [00:00-01:30] Introduction — Le protocole dans le détail

> Salut ! Dans le screencast précédent, on a vu HTTP de loin. Aujourd'hui, on va disséquer le protocole morceau par morceau. On va comprendre exactement ce que contient une requête, ce que contient une réponse, et surtout ce que signifient les fameux codes de statut.

**Action** : Afficher le slide de titre "Module 01 — Le protocole HTTP".

> Pour ça, on va utiliser notre lab HTTP Inspector. C'est un petit serveur qui nous permet de voir en temps réel tout ce que le navigateur envoie et ce que le serveur renvoie.

**Action** : Ouvrir le fichier `labs/lab-01-http-inspector/exercise.js` dans l'éditeur.

```bash
cd labs/lab-01-http-inspector
node exercise.js
```

> Notre serveur écoute sur le port 3000. Il va nous afficher dans la console chaque requête reçue avec tous ses détails.

### [01:30-04:30] Anatomie d'une requête HTTP

> Commençons par la requête. Une requête HTTP, c'est composé de trois parties : la ligne de requête, les en-têtes, et optionnellement un corps.

**Action** : Basculer sur le terminal et exécuter un `curl` verbose.

```bash
curl -v http://localhost:3000/api/data
```

> Regardez ce que `curl` envoie. La première ligne : `GET /api/data HTTP/1.1`. C'est la ligne de requête. Elle contient la méthode (GET), le chemin (/api/data), et la version du protocole (HTTP/1.1).

> Ensuite, on a les en-têtes. `Host: localhost:3000` — c'est obligatoire en HTTP/1.1. `User-Agent` — c'est curl qui s'identifie. `Accept: */*` — curl accepte n'importe quel type de contenu.

**Action** : Montrer les différentes méthodes HTTP avec des exemples curl.

```bash
# GET - Récupérer une ressource
curl -v http://localhost:3000/api/data

# POST - Créer une ressource
curl -v -X POST -H "Content-Type: application/json" -d '{"name":"test"}' http://localhost:3000/api/data

# PUT - Remplacer une ressource
curl -v -X PUT -H "Content-Type: application/json" -d '{"name":"updated"}' http://localhost:3000/api/data/1

# DELETE - Supprimer une ressource
curl -v -X DELETE http://localhost:3000/api/data/1
```

> Chaque méthode à une sémantique particulière. GET pour lire, POST pour créer, PUT pour remplacer, DELETE pour supprimer. Et ce qui est important pour le cache : par défaut, seules les réponses GET sont mises en cache. On en reparlera.

### [04:30-07:30] Anatomie d'une réponse HTTP

> Maintenant, regardons la réponse. Même structure : une ligne de statut, des en-têtes, et un corps.

**Action** : Pointer la réponse dans la sortie verbose de curl.

> La ligne de statut : `HTTP/1.1 200 OK`. Version du protocole, code de statut numérique, et le texte associé. Le code 200, ça veut dire que tout s'est bien passé.

> Ensuite les en-têtes de réponse. On va s'y attarder.

```bash
curl -I http://localhost:3000/api/data
```

> Avec `-I`, je ne récupère que les en-têtes. Regardez : `Content-Type: application/json` — le type du contenu. `Content-Length: 245` — la taille en octets. `Date` — l'horodatage de la réponse. Et potentiellement des en-têtes de cache, qu'on étudiera en détail plus tard.

**Action** : Ouvrir les DevTools et faire la même requête dans le navigateur pour comparer.

> Dans les DevTools, si je clique sur la requête, j'ai la même information mais présentée de manière plus lisible. Les en-têtes de requête d'un côté, les en-têtes de réponse de l'autre. Et en bas, le corps de la réponse, avec même un formatteur JSON intégré.

### [07:30-11:00] Les codes de statut — Le langage du serveur

> Passons aux codes de statut. C'est le moyen qu'a le serveur de vous dire comment s'est passée votre requête. Il y a cinq familles.

**Action** : Afficher un tableau des familles de codes de statut.

> La famille 1xx : informationnel. C'est rare, mais on les croisera avec HTTP/2 et le push serveur. La famille 2xx : succès. 200 OK, tout va bien. 201 Created, la ressource a été créée. 204 No Content, c'est OK mais il n'y a rien à renvoyer.

> La famille 3xx : redirections. 301 Moved Permanently, la ressource a déménagé définitivement. 302 Found, redirection temporaire. Et le plus important pour nous : 304 Not Modified.

**Action** : Mettre en surbrillance le code 304 dans le tableau.

> Le 304, c'est LA star du caching HTTP. Ça veut dire : "hey, la ressource n'a pas changé depuis la dernière fois que tu l'as demandée, tu peux utiliser ta copie en cache". On verra ça en détail dans le screencast sur les ETags.

```bash
# Simuler une requête conditionnelle
curl -v -H "If-None-Match: \"abc123\"" http://localhost:3000/api/data
```

> La famille 4xx : erreurs client. 400 Bad Request, vous avez mal formulé votre requête. 401 Unauthorized, vous n'êtes pas authentifié. 403 Forbidden, vous n'avez pas les droits. Et bien sûr 404 Not Found, la ressource n'existe pas.

> La famille 5xx : erreurs serveur. 500 Internal Server Error, le serveur a planté. 502 Bad Gateway, un proxy n'arrive pas à joindre le serveur en amont. 503 Service Unavailable, le serveur est surchargé ou en maintenance.

**Action** : Démontrer quelques codes de statut avec le serveur du lab.

```bash
# 200 OK
curl -I http://localhost:3000/api/data

# 404 Not Found
curl -I http://localhost:3000/api/inexistant

# 500 Internal Server Error
curl -I http://localhost:3000/api/error
```

> Ce qui est crucial pour le cache, c'est que le comportement de mise en cache varie selon le code de statut. Un 200, on peut le cacher. Un 301, on peut le cacher aussi — c'est une redirection permanente. Mais un 500 ? Non, on ne cache jamais une erreur serveur.

### [11:00-13:00] La connexion sous-jacente — TCP et DNS

> Un dernier point avant de conclure. Quand vous tapez une URL, il se passe plusieurs choses avant même que la requête HTTP soit envoyée.

**Action** : Afficher un diagramme de séquence : DNS -> TCP -> TLS -> HTTP.

> D'abord, la résolution DNS : transformer le nom de domaine en adresse IP. Ensuite, l'établissement de la connexion TCP : le fameux three-way handshake. Si c'est du HTTPS, il y a en plus la négociation TLS. Et seulement après tout ça, votre requête HTTP est envoyée.

```bash
# Voir toutes les étapes de connexion
curl -v -w "\nDNS: %{time_namelookup}s\nTCP: %{time_connect}s\nTLS: %{time_appconnect}s\nTotal: %{time_total}s\n" https://example.com
```

> Regardez les temps : DNS, TCP, TLS, et le temps total. Chaque étape ajoute de la latence. Et c'est précisément ce que le cache va nous permettre d'économiser. Si la réponse est déjà dans le cache du navigateur, aucune de ces étapes n'est nécessaire. Zéro latence réseau.

### [13:00-14:30] Récap — Les fondamentaux du protocole

> Résumons ce qu'on a vu. Une requête HTTP, c'est une méthode, un chemin, des en-têtes et un corps. Une réponse, c'est un code de statut, des en-têtes et un corps. Les codes de statut nous indiquent ce qui s'est passé, et le 304 sera notre meilleur ami pour le cache.

**Action** : Mentionner le quiz et le lab associé.

> Maintenant, je vous invite à faire le lab HTTP Inspector. Vous allez manipuler les requêtes avec curl, observer les en-têtes, et expérimenter les différents codes de statut par vous-mêmes. Le fichier de départ est dans `labs/lab-01-http-inspector/exercise.js`. Et n'oubliez pas le quiz ! Dans le prochain screencast, on passe à HTTP/2 et HTTP/3. A plus !

## Points d'attention pour l'enregistrement
- Bien montrer la correspondance entre la sortie `curl -v` et ce qu'affichent les DevTools
- Prendre le temps sur le code 304 car il sera central dans la formation
- S'assurer que le serveur du lab renvoie les bons codes de statut pour chaque route
- La commande `curl -w` avec les timings peut varier selon l'OS, tester avant l'enregistrement
