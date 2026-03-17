# Module 01 — Le protocole HTTP en profondeur

> **Objectif** : Maîtriser l'anatomie des requêtes et réponses HTTP, connaître les méthodes et status codes, et comprendre les connexions HTTP/1.1.
> **Difficulte** : ⭐ (Débutant)

---

## 1. Anatomie d'une requête HTTP

### 1.1 L'analogie du bon de commande

Une requête HTTP, c'est comme un bon de commande dans un restaurant :

```
+-----------------------------------------------+
|              BON DE COMMANDE                   |
+-----------------------------------------------+
| Action : COMMANDER (GET)                       |  <-- Methode
| Table  : /menu/plat-du-jour                    |  <-- URL / chemin
| Salle  : restaurant-dupont.fr                  |  <-- Host
+-----------------------------------------------+
| Instructions speciales :                       |  <-- Headers
|   - Vegetarien : oui                           |
|   - Allergie : gluten                          |
|   - Langue : francais                          |
+-----------------------------------------------+
| Details supplementaires :                      |  <-- Body
|   { "cuisson": "a point",                      |
|     "accompagnement": "frites" }               |
+-----------------------------------------------+
```

### 1.2 Structure formelle d'une requête

Une requête HTTP se compose de trois parties :

```
POST /api/users HTTP/1.1                    <-- Ligne de requete
Host: api.example.com                       <-- \
Content-Type: application/json              <--  | Headers
Accept: application/json                    <--  |
Authorization: Bearer eyJhbGc...            <--  |
Content-Length: 52                           <-- /
                                            <-- Ligne vide (separateur)
{"name": "Alice", "email": "a@test.com"}   <-- Body (optionnel)
```

**Decomposition de la ligne de requête :**

```
POST          /api/users       HTTP/1.1
^^^^          ^^^^^^^^^^       ^^^^^^^^
Methode       Chemin (URI)     Version du protocole

- Methode   : Quelle action effectuer ?
- Chemin    : Sur quelle ressource ?
- Version   : Quelle version de HTTP ?
```

### 1.3 Voir une requête avec Node.js

```typescript
// inspect-request.ts
// Ce serveur affiche tous les details de chaque requete recue

import http, { type IncomingMessage, type ServerResponse } from 'node:http';

const server = http.createServer((req: IncomingMessage, res: ServerResponse) => {
  // --- LIGNE DE REQUETE ---
  console.log('=== NOUVELLE REQUETE ===');
  console.log(`Methode  : ${req.method}`);       // GET, POST, etc.
  console.log(`URL      : ${req.url}`);           // /api/users?page=1
  console.log(`Version  : HTTP/${req.httpVersion}`); // 1.1

  // --- HEADERS ---
  console.log('\n--- Headers ---');
  for (const [key, value] of Object.entries(req.headers)) {
    console.log(`  ${key}: ${value}`);
  }

  // --- BODY ---
  let body: string = '';
  req.on('data', (chunk: Buffer) => {       // Les donnees arrivent par morceaux
    body += chunk.toString();               // On les concatene
  });
  req.on('end', () => {             // Quand tout est recu
    if (body) {
      console.log(`\n--- Body ---\n  ${body}`);
    } else {
      console.log('\n--- Body ---\n  (vide)');
    }
    console.log('========================\n');

    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('Requete recue ! Regarde la console du serveur.');
  });
});

server.listen(3000, () => {
  console.log('Serveur pret sur http://localhost:3000');
  console.log('Envoie des requetes avec curl pour les inspecter.\n');
});
```

**Tester avec curl :**

```bash
# GET simple
curl http://localhost:3000/api/users

# POST avec un body JSON
curl -X POST \
  -H "Content-Type: application/json" \
  -d '{"name":"Alice","email":"a@test.com"}' \
  http://localhost:3000/api/users

# PUT avec des headers personnalises
curl -X PUT \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer mon-token-secret" \
  -d '{"name":"Alice Updated"}' \
  http://localhost:3000/api/users/42
```

---

## 2. Anatomie d'une réponse HTTP

### 2.1 L'analogie du colis de retour

La réponse HTTP, c'est comme le colis que tu recois après ta commande :

```
+-----------------------------------------------+
|         COLIS DE RETOUR (REPONSE)              |
+-----------------------------------------------+
| Statut : Commande livree (200 OK)              |  <-- Status line
+-----------------------------------------------+
| Etiquettes sur le colis :                      |  <-- Headers
|   - Contenu : Texte HTML                       |
|   - Poids : 4521 octets                        |
|   - Date d'emballage : 7 mars 2026             |
|   - Valable jusqu'au : 14 mars 2026            |
|   - Empreinte unique : "v2-abc123"             |
+-----------------------------------------------+
| Contenu du colis :                             |  <-- Body
|   <!DOCTYPE html>                              |
|   <html>                                       |
|   <head><title>Ma page</title></head>          |
|   <body><h1>Bonjour !</h1></body>              |
|   </html>                                      |
+-----------------------------------------------+
```

### 2.2 Structure formelle d'une réponse

```
HTTP/1.1 200 OK                             <-- Ligne de statut
Date: Sat, 07 Mar 2026 10:30:00 GMT         <-- \
Content-Type: text/html; charset=utf-8      <--  |
Content-Length: 4521                         <--  | Headers
Cache-Control: max-age=3600                 <--  |
ETag: "v2-abc123"                           <--  |
Server: nginx/1.24.0                        <-- /
                                            <-- Ligne vide
<!DOCTYPE html>                             <-- \
<html>                                      <--  | Body
<head><title>Ma page</title></head>         <--  |
<body><h1>Bonjour !</h1></body>             <--  |
</html>                                     <-- /
```

**Decomposition de la ligne de statut :**

```
HTTP/1.1      200        OK
^^^^^^^^      ^^^        ^^
Version       Code       Phrase descriptive
              numerique  (pour les humains)
```

### 2.3 Construire une réponse avec Node.js

```typescript
// response-builder.ts
// Differentes facons de construire une reponse HTTP

import http, { type IncomingMessage, type ServerResponse } from 'node:http';

const server = http.createServer((req: IncomingMessage, res: ServerResponse) => {

  if (req.url === '/html') {
    // --- Reponse HTML ---
    res.writeHead(200, {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'max-age=60',
    });
    res.end('<h1>Page HTML</h1><p>Ceci est du HTML.</p>');

  } else if (req.url === '/json') {
    // --- Reponse JSON ---
    const data: { message: string; timestamp: number } = { message: 'Bonjour', timestamp: Date.now() };
    const json: string = JSON.stringify(data);
    res.writeHead(200, {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(json),    // Taille en octets
      'Cache-Control': 'no-store',                  // Ne PAS cacher
    });
    res.end(json);

  } else if (req.url === '/redirect') {
    // --- Redirection ---
    res.writeHead(301, {
      'Location': '/html',    // Ou aller
    });
    res.end();                // Pas de body necessaire

  } else if (req.url === '/not-found') {
    // --- Erreur 404 ---
    res.writeHead(404, {
      'Content-Type': 'text/plain',
    });
    res.end('Ressource introuvable');

  } else {
    // --- Page d'accueil ---
    res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Essaie /html, /json, /redirect ou /not-found');
  }
});

server.listen(3000, () => console.log('http://localhost:3000'));
```

---

## 3. Les méthodes HTTP

### 3.1 Vue d'ensemble

Les méthodes HTTP definissent **l'action** a effectuer sur la ressource. C'est comme les différents types de demandes que tu peux faire au guichet de la poste.

| Méthode     | Action                   | Analogie postale                     | Body requête | Body réponse | Idempotent | Safe |
|-------------|--------------------------|--------------------------------------|:------------:|:------------:|:----------:|:----:|
| **GET**     | Lire une ressource       | Demander un document                 | Non          | Oui          | Oui        | Oui  |
| **POST**    | Créer une ressource      | Envoyer un nouveau colis             | Oui          | Oui          | Non        | Non  |
| **PUT**     | Remplacer une ressource  | Remplacer le contenu d'une boite     | Oui          | Optionnel    | Oui        | Non  |
| **PATCH**   | Modifier partiellement   | Corriger une adresse sur un colis    | Oui          | Oui          | Non        | Non  |
| **DELETE**  | Supprimer une ressource  | Demander la destruction d'un courrier| Optionnel    | Optionnel    | Oui        | Non  |
| **HEAD**    | Lire les headers seuls   | Demander le poids du colis sans l'ouvrir | Non      | Non          | Oui        | Oui  |
| **OPTIONS** | Connaître les possibilites| Demander la liste des services dispo | Non          | Oui          | Oui        | Oui  |

**Deux propriétés importantes :**

- **Idempotent** : Faire la même requête 1 fois ou 10 fois produit le même résultat. `DELETE /user/42` supprime l'utilisateur 42. L'appeler 10 fois ne supprime toujours que l'utilisateur 42.
- **Safe (sure)** : La requête ne modifie rien sur le serveur. `GET` ne fait que lire.

**Pourquoi c'est important pour le cache ?** Seules les méthodes **safe** (GET, HEAD) sont généralement cachees. On ne met jamais en cache un POST car il créé quelque chose de nouveau à chaque appel.

### 3.2 GET — La méthode la plus courante

```
GET /api/articles/42 HTTP/1.1
Host: blog.example.com
Accept: application/json
```

- Recupere une ressource sans la modifier
- Pas de body dans la requête
- C'est la méthode par defaut du navigateur quand tu tapes une URL
- **C'est la principale méthode concernee par le cache HTTP**

```typescript
// Cote serveur Node.js
if (req.method === 'GET' && req.url === '/api/articles/42') {
  const article: { id: number; title: string; content: string } = { id: 42, title: 'Mon article', content: '...' };
  res.writeHead(200, {
    'Content-Type': 'application/json',
    'Cache-Control': 'max-age=300',   // Cacher 5 minutes
    'ETag': '"article-42-v3"',        // Version 3 de l'article
  });
  res.end(JSON.stringify(article));
}
```

### 3.3 POST — Créer quelque chose

```
POST /api/articles HTTP/1.1
Host: blog.example.com
Content-Type: application/json
Content-Length: 45

{"title": "Nouvel article", "content": "..."}
```

- Cree une nouvelle ressource
- Le body contient les donnees a créer
- **Non idempotent** : deux POST identiques creent deux articles différents
- **Jamais mis en cache** par defaut

### 3.4 PUT vs PATCH

```
# PUT : remplace TOUTE la ressource
PUT /api/articles/42 HTTP/1.1
Content-Type: application/json

{"title": "Titre modifie", "content": "Nouveau contenu complet", "author": "Alice"}

# PATCH : modifie PARTIELLEMENT la ressource
PATCH /api/articles/42 HTTP/1.1
Content-Type: application/json

{"title": "Juste le titre modifie"}
```

**Analogie** : PUT, c'est comme remplacer tout le contenu d'une boite aux lettres par un nouveau contenu. PATCH, c'est comme corriger juste l'adresse sur l'enveloppe.

### 3.5 HEAD — Utile pour le cache

```bash
# HEAD renvoie les memes headers que GET, mais SANS le body
curl -I https://example.com/gros-fichier.zip

# Resultat :
# HTTP/2 200
# content-length: 524288000     <-- 500 Mo !
# last-modified: Mon, 01 Jan 2026 00:00:00 GMT
# etag: "abc123"
```

**Pourquoi HEAD est utile ?** Avant de telecharger un fichier de 500 Mo, tu peux vérifier avec HEAD si ta copie en cache est encore valide. Si le ETag n'a pas change, inutile de re-telecharger.

### 3.6 OPTIONS — Utilise pour CORS

```
OPTIONS /api/data HTTP/1.1
Host: api.example.com
Origin: https://mon-site.com
Access-Control-Request-Method: POST

---

HTTP/1.1 204 No Content
Access-Control-Allow-Origin: https://mon-site.com
Access-Control-Allow-Methods: GET, POST, PUT, DELETE
Access-Control-Max-Age: 86400      <-- Cacher cette reponse 24h
```

**Pourquoi ?** Avant d'envoyer une requête cross-origin "complexe", le navigateur envoie automatiquement un OPTIONS (appele "preflight") pour vérifier les permissions. Le header `Access-Control-Max-Age` permet de **cacher** cette réponse pour éviter de refaire le preflight.

---

## 4. Les status codes

### 4.1 L'analogie du feu tricolore

Les status codes sont comme des feux de signalisation :

```
1xx (Informatif)    : Feu ORANGE clignotant  - "Attends, je traite..."
2xx (Succes)        : Feu VERT              - "Tout va bien !"
3xx (Redirection)   : PANNEAU DEVIATION     - "Va voir ailleurs"
4xx (Erreur client) : Feu ROUGE             - "C'est ta faute"
5xx (Erreur serveur): PANNE DE FEU          - "C'est ma faute"
```

### 4.2 Les 1xx — Informatifs

| Code | Nom                  | Usage                                        |
|------|----------------------|----------------------------------------------|
| 100  | Continue             | "Continue a envoyer le body"                 |
| 101  | Switching Protocols  | "On passe en WebSocket"                      |
| 103  | Early Hints          | "Voici des headers en avance (preload)"      |

Les 1xx sont rares mais `103 Early Hints` est interessant pour la performance :

```
HTTP/1.1 103 Early Hints
Link: </style.css>; rel=preload; as=style
Link: </app.js>; rel=preload; as=script

--- (le serveur continue a traiter) ---

HTTP/1.1 200 OK
Content-Type: text/html
...
```

### 4.3 Les 2xx — Succes

| Code | Nom                  | Usage                                        |
|------|----------------------|----------------------------------------------|
| 200  | OK                   | Requête reussie, voici la réponse            |
| 201  | Created              | Ressource créée avec succes (POST)           |
| 204  | No Content           | Reussi, mais pas de body a renvoyer          |

```typescript
// Exemples de reponses 2xx en Node.js

// 200 OK — Reponse standard
if (req.method === 'GET') {
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ data: 'voici les donnees' }));
}

// 201 Created — Apres creation d'une ressource
if (req.method === 'POST') {
  const newUser: { id: number; name: string } = { id: 99, name: 'Alice' };
  res.writeHead(201, {
    'Content-Type': 'application/json',
    'Location': '/api/users/99',     // URL de la nouvelle ressource
  });
  res.end(JSON.stringify(newUser));
}

// 204 No Content — Suppression reussie
if (req.method === 'DELETE') {
  res.writeHead(204);
  res.end();    // Pas de body
}
```

### 4.4 Les 3xx — Redirections (très importants pour le cache)

| Code | Nom                  | Permanente ? | Méthode conservee ? | Cachable ?       |
|------|----------------------|:------------:|:-------------------:|:----------------:|
| 301  | Moved Permanently    | Oui          | Peut changer (-> GET)| Oui par defaut  |
| 302  | Found                | Non          | Peut changer (-> GET)| Non par defaut  |
| 304  | Not Modified         | -            | -                    | Special (cache) |
| 307  | Temporary Redirect   | Non          | Oui, conservee       | Non par defaut  |
| 308  | Permanent Redirect   | Oui          | Oui, conservee       | Oui par defaut  |

**Le 304 Not Modified est LE status code du cache :**

```
CLIENT                                    SERVEUR
  |                                          |
  |  GET /page.html                          |
  |  If-None-Match: "v5"                     |
  |  ---------------------------------------->
  |                                          |
  |  Le serveur verifie :                    |
  |  ETag actuel = "v5" ?                    |
  |  OUI -> rien n'a change !                |
  |                                          |
  |  HTTP/1.1 304 Not Modified               |
  |  ETag: "v5"                              |
  |  Cache-Control: max-age=3600             |
  |  (PAS DE BODY ! Economie de bande passante)
  |  <----------------------------------------
  |                                          |
  |  Le navigateur utilise sa copie locale   |
```

**Pourquoi 304 est genial ?** La réponse fait typiquement **~200 octets** au lieu de potentiellement **des megaoctets**. On economise de la bande passante ET du temps.

```typescript
// Serveur qui repond 304 quand rien n'a change
import http, { type IncomingMessage, type ServerResponse } from 'node:http';

const CURRENT_ETAG: string = '"page-v5"';
const PAGE_CONTENT: string = '<html><body><h1>Contenu de la page</h1></body></html>';

const server = http.createServer((req: IncomingMessage, res: ServerResponse) => {
  // Verifier si le client a deja la bonne version
  const clientETag: string | undefined = req.headers['if-none-match'];

  if (clientETag === CURRENT_ETAG) {
    // Le client a deja la bonne version !
    console.log('304 - Le client a deja la derniere version');
    res.writeHead(304, {
      'ETag': CURRENT_ETAG,
      'Cache-Control': 'max-age=60',
    });
    res.end();   // Pas de body ! Enormes economies.
    return;
  }

  // Premiere visite ou version obsolete
  console.log('200 - Envoi du contenu complet');
  res.writeHead(200, {
    'Content-Type': 'text/html',
    'ETag': CURRENT_ETAG,
    'Cache-Control': 'max-age=60',
  });
  res.end(PAGE_CONTENT);
});

server.listen(3000);
```

### 4.5 Les 4xx — Erreurs client

| Code | Nom                  | Signification                                |
|------|----------------------|----------------------------------------------|
| 400  | Bad Request          | Requête mal formee                           |
| 401  | Unauthorized         | Authentification requise                     |
| 403  | Forbidden            | Authentifie mais pas autorise                |
| 404  | Not Found            | Ressource introuvable                        |
| 405  | Method Not Allowed   | Méthode HTTP non permise                     |
| 409  | Conflict             | Conflit avec l'état actuel                   |
| 429  | Too Many Requests    | Rate limiting                                |

**Pourquoi ?** La distinction entre 401 et 403 est importante : 401 signifie "qui es-tu ?", 403 signifie "je sais qui tu es, mais tu n'as pas le droit".

**Les erreurs 4xx et le cache :** Les réponses 404 peuvent etre cachees ! Si un fichier n'existe pas, le cache peut retenir cette information pour éviter de redemander.

### 4.6 Les 5xx — Erreurs serveur

| Code | Nom                   | Signification                               |
|------|-----------------------|---------------------------------------------|
| 500  | Internal Server Error | Erreur non prevue sur le serveur            |
| 502  | Bad Gateway           | Le proxy a recu une réponse invalide        |
| 503  | Service Unavailable   | Serveur temporairement indisponible         |
| 504  | Gateway Timeout       | Le proxy n'a pas recu de réponse a temps    |

**Et le cache ?** En cas de 5xx, un cache intelligent peut servir une copie **stale** (perimee) plutot qu'afficher l'erreur. C'est la directive `stale-while-error` de Cache-Control (on le verra au Module 04).

---

## 5. Les connexions HTTP/1.1

### 5.1 Le problème des connexions courtes (HTTP/1.0)

En HTTP/1.0, chaque requête ouvrait une nouvelle connexion TCP :

```
HTTP/1.0 — UNE CONNEXION PAR REQUETE
======================================

Requete 1 (page.html) :
  [TCP handshake] --> [Requete] --> [Reponse] --> [Fermeture TCP]

Requete 2 (style.css) :
  [TCP handshake] --> [Requete] --> [Reponse] --> [Fermeture TCP]

Requete 3 (script.js) :
  [TCP handshake] --> [Requete] --> [Reponse] --> [Fermeture TCP]

Requete 4 (image.png) :
  [TCP handshake] --> [Requete] --> [Reponse] --> [Fermeture TCP]

Chaque handshake TCP prend ~1 RTT (aller-retour).
4 requetes = 4 handshakes = 4 RTT gaspilles !
```

**Analogie** : C'est comme raccrocher le telephone après chaque phrase et devoir rappeler pour dire la phrase suivante.

### 5.2 Keep-Alive (HTTP/1.1)

HTTP/1.1 introduit les connexions persistantes par defaut :

```
HTTP/1.1 — CONNEXION PERSISTANTE (Keep-Alive)
===============================================

[TCP handshake] --> [Requete 1] --> [Reponse 1]
                    [Requete 2] --> [Reponse 2]
                    [Requete 3] --> [Reponse 3]
                    [Requete 4] --> [Reponse 4]
                --> [Fermeture TCP]

1 seul handshake pour 4 requetes = 3 RTT economises !
```

```
# Le header Connection: keep-alive est IMPLICITE en HTTP/1.1
# Pour fermer explicitement :
Connection: close
```

### 5.3 Pipelining HTTP/1.1

Le pipelining permet d'envoyer plusieurs requêtes **sans attendre** les réponses :

```
SANS PIPELINING (sequentiel)          AVEC PIPELINING
================================      ================================

Client    Serveur                     Client    Serveur
  |  Req 1  ->  |                       |  Req 1  ->  |
  |  <- Resp 1  |                       |  Req 2  ->  |
  |  Req 2  ->  |                       |  Req 3  ->  |
  |  <- Resp 2  |                       |  <- Resp 1  |
  |  Req 3  ->  |                       |  <- Resp 2  |
  |  <- Resp 3  |                       |  <- Resp 3  |
  |             |                       |             |

Temps: 6 etapes                       Temps: 4 etapes (mais...)
```

**Le problème du Head-of-Line (HoL) blocking :**

```
PIPELINING AVEC HOL BLOCKING
==============================

Client envoie : Req1 (petite), Req2 (petite), Req3 (petite)

Serveur traite :
  Req1 : [==========]  (LENT ! 2 secondes)
  Req2 :              [=]  (rapide, 50ms)
  Req3 :                [=]  (rapide, 50ms)

Les reponses DOIVENT revenir dans L'ORDRE.
Req2 et Req3 sont bloquees par Req1, meme si elles sont pretes !

C'est comme une file d'attente au supermarche : si le premier
client met 10 minutes, tout le monde attend.
```

**Pourquoi c'est un problème ?** En pratique, le pipelining HTTP/1.1 est désactivé dans la plupart des navigateurs a cause du HoL blocking. La solution viendra avec HTTP/2 (Module 02).

### 5.4 La limite des 6 connexions

Les navigateurs limitent le nombre de connexions simultanees par domaine :

```
NAVIGATEUR                              SERVEUR (example.com)
                                        Port 443
  Connexion 1 : [==================]
  Connexion 2 : [==================]
  Connexion 3 : [==================]
  Connexion 4 : [==================]
  Connexion 5 : [==================]
  Connexion 6 : [==================]
  ------------ MAXIMUM ATTEINT ---------
  Requete 7   : [EN ATTENTE........]   <-- Bloquee !
  Requete 8   : [EN ATTENTE........]   <-- Bloquee !
```

**Pourquoi cette limite ?** Pour ne pas surcharger le serveur. Mais ça créé un goulot d'etranglement : une page avec 50 ressources doit les telecharger par lots de 6.

**L'astuce historique du "domain sharding" :**

```
<!-- Repartir les ressources sur plusieurs domaines -->
<img src="https://img1.example.com/photo1.jpg">
<img src="https://img2.example.com/photo2.jpg">
<img src="https://img3.example.com/photo3.jpg">

<!-- 6 connexions par domaine x 3 domaines = 18 connexions ! -->
```

**Note** : Cette astuce est obsolete avec HTTP/2. Ne l'utilisez plus.

### 5.5 Résumé des limitations HTTP/1.1

```
+--------------------------------------------------+
|           LIMITATIONS DE HTTP/1.1                 |
+--------------------------------------------------+
| 1. Head-of-Line blocking (pipelining inutilisable)|
| 2. Maximum 6 connexions par domaine               |
| 3. Headers textuels redondants a chaque requete   |
| 4. Pas de prioritisation des requetes              |
| 5. Le serveur ne peut pas "pousser" du contenu    |
+--------------------------------------------------+
|                                                    |
|  --> HTTP/2 et HTTP/3 resolvent ces problemes      |
|      (voir Module 02)                              |
+--------------------------------------------------+
```

---

## 6. HTTP en pratique : un serveur complet

### 6.1 Mini-API avec routing et status codes

```typescript
// mini-api.ts
// Une API HTTP complete avec gestion des methodes et status codes

import http, { type IncomingMessage, type ServerResponse } from 'node:http';

interface Article {
  id: number;
  title: string;
  content: string;
}

// Base de donnees en memoire
const articles: Article[] = [
  { id: 1, title: 'Premier article', content: 'Contenu du premier article' },
  { id: 2, title: 'Deuxieme article', content: 'Contenu du deuxieme article' },
];
let nextId: number = 3;

const server = http.createServer((req: IncomingMessage, res: ServerResponse) => {
  const { method, url } = req;

  // --- Parser l'URL ---
  const urlParts: string[] = (url ?? '').split('/').filter(Boolean);  // ['api', 'articles', '42']
  const isArticlesRoute: boolean = urlParts[0] === 'api' && urlParts[1] === 'articles';
  const articleId: number | null = urlParts[2] ? parseInt(urlParts[2]) : null;

  // Header commun pour JSON
  const jsonHeaders = { 'Content-Type': 'application/json; charset=utf-8' };

  // --- GET /api/articles ---
  if (method === 'GET' && isArticlesRoute && !articleId) {
    res.writeHead(200, {
      ...jsonHeaders,
      'Cache-Control': 'max-age=10',         // Cacher la liste 10s
    });
    res.end(JSON.stringify(articles));
    return;
  }

  // --- GET /api/articles/:id ---
  if (method === 'GET' && isArticlesRoute && articleId) {
    const article: Article | undefined = articles.find(a => a.id === articleId);
    if (!article) {
      res.writeHead(404, jsonHeaders);        // 404 : pas trouve
      res.end(JSON.stringify({ error: 'Article introuvable' }));
      return;
    }
    res.writeHead(200, {
      ...jsonHeaders,
      'Cache-Control': 'max-age=60',         // Cacher l'article 60s
      'ETag': `"article-${article.id}-v1"`,  // Empreinte de version
    });
    res.end(JSON.stringify(article));
    return;
  }

  // --- POST /api/articles ---
  if (method === 'POST' && isArticlesRoute) {
    let body: string = '';
    req.on('data', (chunk: Buffer) => body += chunk);
    req.on('end', () => {
      try {
        const data: { title?: string; content?: string } = JSON.parse(body);
        if (!data.title) {
          res.writeHead(400, jsonHeaders);    // 400 : requete invalide
          res.end(JSON.stringify({ error: 'Le titre est requis' }));
          return;
        }
        const newArticle: Article = { id: nextId++, title: data.title, content: data.content || '' };
        articles.push(newArticle);
        res.writeHead(201, {                  // 201 : cree avec succes
          ...jsonHeaders,
          'Location': `/api/articles/${newArticle.id}`,
        });
        res.end(JSON.stringify(newArticle));
      } catch (e) {
        res.writeHead(400, jsonHeaders);
        res.end(JSON.stringify({ error: 'JSON invalide' }));
      }
    });
    return;
  }

  // --- DELETE /api/articles/:id ---
  if (method === 'DELETE' && isArticlesRoute && articleId) {
    const index: number = articles.findIndex(a => a.id === articleId);
    if (index === -1) {
      res.writeHead(404, jsonHeaders);
      res.end(JSON.stringify({ error: 'Article introuvable' }));
      return;
    }
    articles.splice(index, 1);
    res.writeHead(204);                       // 204 : supprime, pas de body
    res.end();
    return;
  }

  // --- Methode non autorisee ---
  if (isArticlesRoute) {
    res.writeHead(405, {                      // 405 : methode non permise
      ...jsonHeaders,
      'Allow': 'GET, POST, DELETE',           // Methodes autorisees
    });
    res.end(JSON.stringify({ error: 'Methode non autorisee' }));
    return;
  }

  // --- Route inconnue ---
  res.writeHead(404, jsonHeaders);
  res.end(JSON.stringify({ error: 'Route inconnue' }));
});

server.listen(3000, () => {
  console.log('Mini API sur http://localhost:3000');
  console.log('Essaie :');
  console.log('  curl http://localhost:3000/api/articles');
  console.log('  curl http://localhost:3000/api/articles/1');
  console.log('  curl -X POST -H "Content-Type: application/json" -d \'{"title":"Nouveau"}\' http://localhost:3000/api/articles');
  console.log('  curl -X DELETE http://localhost:3000/api/articles/1');
});
```

---

## Points clés

1. **Une requête HTTP** a trois parties : ligne de requête (méthode + URL + version), headers, et body optionnel.
2. **Une réponse HTTP** a trois parties : ligne de statut (version + code + phrase), headers, et body.
3. **Les méthodes** definissent l'action : GET (lire), POST (créer), PUT (remplacer), PATCH (modifier), DELETE (supprimer).
4. **Les status codes** communiquent le résultat : 2xx (succes), 3xx (redirection), 4xx (erreur client), 5xx (erreur serveur).
5. **304 Not Modified** est le status code clé du caching : il permet au serveur de dire "ta copie est encore bonne" sans renvoyer le contenu.
6. **HTTP/1.1** utilise keep-alive par defaut mais souffre du Head-of-Line blocking et de la limite de 6 connexions par domaine.

---

## Lab associe

-> `labs/01-construire-une-api-http.md` — Créer une API REST complete avec Node.js et observer les headers

---

## Pour aller plus loin

- [MDN — Méthodes HTTP](https://developer.mozilla.org/fr/docs/Web/HTTP/Methods)
- [MDN — Codes de réponse HTTP](https://developer.mozilla.org/fr/docs/Web/HTTP/Status)
- [RFC 9110 — HTTP Semantics](https://www.rfc-editor.org/rfc/rfc9110)
- [HTTP Status Dogs](https://httpstatusdogs.com/) — Pour retenir les codes avec humour

---

## Si tu es perdu

**Retiens juste trois choses :**

1. Le client envoie une **requête** avec une méthode (GET = "donne-moi", POST = "créé ça") vers une URL.
2. Le serveur renvoie une **réponse** avec un code (200 = "OK", 404 = "pas trouve", 304 = "rien n'a change").
3. HTTP/1.1 reutilise les connexions (keep-alive) mais ne peut envoyer qu'une requête à la fois par connexion.

Le reste, ce sont des details qu'on approfondira au fil des modules.

---

## Exercice pratique — Chrome DevTools

### Objectif

Inspecter les headers de requête et de réponse HTTP dans Chrome DevTools, identifier les status codes, et observer le comportement de keep-alive.

### Etapes

1. **Lancer le serveur de demonstration**
   - Ouvre un terminal et lance le serveur `response-builder.js` (section 2.3 de ce module) :
   ```bash
   node response-builder.js
   ```
   - Le serveur ecoute sur `http://localhost:3000`

2. **Ouvrir DevTools et naviguer**
   - Ouvre Chrome et va sur `http://localhost:3000/html`
   - Ouvre DevTools (`F12`) > onglet **Network**
   - Recharge la page (`F5`) pour capturer la requête

3. **Inspecter les headers de requête**
   - Clique sur la requête `html` dans la liste
   - Dans le panneau **Headers**, repere la section **Request Headers** :
     - `Host: localhost:3000` — adresse du serveur
     - `Accept: text/html,...` — types de contenu acceptes par le navigateur
     - `Connection: keep-alive` — le navigateur demandé une connexion persistante
     - `User-Agent: ...` — identification du navigateur

4. **Inspecter les headers de réponse**
   - Toujours dans le panneau **Headers**, repere la section **Response Headers** :
     - `Content-Type: text/html; charset=utf-8` — type de la réponse
     - `Cache-Control: max-age=60` — directive de cache
     - `Connection: keep-alive` — le serveur confirme la connexion persistante
   - Observe le **Status Code** affiche en haut : `200 OK`

5. **Observer différents status codes**
   - Dans la barre d'adresse, navigue vers les différentes routes et observe le status code dans DevTools :
     - `http://localhost:3000/html` --> `200 OK`
     - `http://localhost:3000/json` --> `200 OK` (observe le header `Cache-Control: no-store`)
     - `http://localhost:3000/redirect` --> `301 Moved Permanently` (observe le header `Location: /html`)
     - `http://localhost:3000/not-found` --> `404 Not Found`
   - Pour voir la redirection 301 clairement, coche **Preserve log** dans DevTools avant de naviguer vers `/redirect`

6. **Observer le keep-alive**
   - Navigue vers `http://localhost:3000/html` puis immediatement vers `http://localhost:3000/json`
   - Dans l'onglet Network, clique sur une requête et ouvre l'onglet **Timing**
   - Observe le champ **Connection Start** :
     - Pour la première requête : tu verras le temps de connexion TCP (quelques ms)
     - Pour les requêtes suivantes : le temps de connexion sera `0 ms` car la connexion TCP est **reutilisee** (keep-alive)

7. **Utiliser le filtre par status code**
   - Dans le champ de filtre en haut de l'onglet Network, tape `status-code:301` pour ne voir que les redirections
   - Essaie `status-code:200` pour ne voir que les succes
   - Essaie `status-code:404` pour ne voir que les erreurs 404

### Ce que tu devrais observer

```
/html      : Status 200 | Cache-Control: max-age=60   | Connection: keep-alive
/json      : Status 200 | Cache-Control: no-store      | Content-Type: application/json
/redirect  : Status 301 | Location: /html              | (pas de body)
/not-found : Status 404 | Content-Type: text/plain      | "Ressource introuvable"

Onglet Timing (2eme requete) :
  Connection Start : 0 ms  --> keep-alive reutilise la connexion existante
```

### Questions de reflexion

- Quelle est la différence entre les headers `Cache-Control: max-age=60` et `Cache-Control: no-store` que tu as observes ?
- Pourquoi la requête vers `/redirect` est-elle suivie automatiquement d'une requête vers `/html` ?
- Comment le keep-alive ameliore-t-il les performances quand tu navigues entre plusieurs pages du même serveur ?

---

## Defi

### Construis un serveur qui renvoie le bon status code

**Objectif** : Créer un serveur Node.js qui repond avec le status code correct selon la situation.

**Cahier des charges :**

1. `GET /` -> `200 OK` avec un message de bienvenue
2. `GET /secret` sans header `Authorization` -> `401 Unauthorized`
3. `GET /secret` avec `Authorization: Bearer admin` -> `200 OK` avec le contenu secret
4. `GET /secret` avec un autre token -> `403 Forbidden`
5. `POST /data` avec un body JSON valide -> `201 Created`
6. `POST /data` sans body ou JSON invalide -> `400 Bad Request`
7. `GET /old-page` -> `301 Moved Permanently` vers `/new-page`
8. `GET /new-page` -> `200 OK` avec le nouveau contenu
9. Toute autre URL -> `404 Not Found`

**Teste avec curl :**

```bash
curl -v http://localhost:3000/
curl -v http://localhost:3000/secret
curl -v -H "Authorization: Bearer admin" http://localhost:3000/secret
curl -v -H "Authorization: Bearer wrong" http://localhost:3000/secret
curl -v -X POST -H "Content-Type: application/json" -d '{"key":"value"}' http://localhost:3000/data
curl -v -X POST http://localhost:3000/data
curl -v -L http://localhost:3000/old-page
curl -v http://localhost:3000/nexiste-pas
```

<details>
<summary>Solution</summary>

```typescript
import http, { type IncomingMessage, type ServerResponse } from 'node:http';

const server = http.createServer((req: IncomingMessage, res: ServerResponse) => {
  const { method, url } = req;

  if (method === 'GET' && url === '/') {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('Bienvenue sur le serveur !');
  }
  else if (method === 'GET' && url === '/secret') {
    const auth: string | undefined = req.headers['authorization'];
    if (!auth) {
      res.writeHead(401, { 'WWW-Authenticate': 'Bearer' });
      res.end('Authentification requise');
    } else if (auth === 'Bearer admin') {
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      res.end('Voici le contenu secret !');
    } else {
      res.writeHead(403);
      res.end('Acces refuse');
    }
  }
  else if (method === 'POST' && url === '/data') {
    let body: string = '';
    req.on('data', (c: Buffer) => body += c);
    req.on('end', () => {
      try {
        if (!body) throw new Error('Body vide');
        JSON.parse(body);
        res.writeHead(201, { 'Content-Type': 'text/plain' });
        res.end('Donnees creees');
      } catch {
        res.writeHead(400, { 'Content-Type': 'text/plain' });
        res.end('Requete invalide');
      }
    });
  }
  else if (method === 'GET' && url === '/old-page') {
    res.writeHead(301, { 'Location': '/new-page' });
    res.end();
  }
  else if (method === 'GET' && url === '/new-page') {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('Bienvenue sur la nouvelle page !');
  }
  else {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Page introuvable');
  }
});

server.listen(3000, () => console.log('http://localhost:3000'));
```

</details>

---

## Navigation

| Précédent | Suivant |
|:---------:|:-------:|
| [Module 00 — Prérequis & Vue d'ensemble](./00-prerequis-et-vue-ensemble.md) | [Module 02 — HTTP/2 & HTTP/3](./02-http2-http3.md) |

---

<!-- parcours-recommande -->

::: tip Parcours recommandé
1. **Screencast** : [screencast 01 http protocol](../screencasts/screencast-01-http-protocol.md)
2. **Lab** : [lab-01-http-inspector](../labs/lab-01-http-inspector/README)
3. **Visualisation** : [HTTP Lifecycle](../visualizations/http-lifecycle.html)
4. **Quiz** : [quiz 01 http protocol](../quizzes/quiz-01-http-protocol.html)
:::
