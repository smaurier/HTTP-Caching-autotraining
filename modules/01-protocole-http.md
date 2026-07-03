---
titre: Le protocole HTTP
cours: 11-http-caching
notions: [anatomie requête/réponse, start-line et headers et body, méthodes HTTP, safe et idempotent, sémantique REST des méthodes, codes de statut 1xx-5xx, négociation de contenu, HTTP sur TCP/TLS, keep-alive, cookies et sessions]
outcomes: [lire et forger une requête/réponse HTTP brute, choisir la bonne méthode selon safe/idempotent, renvoyer le bon code de statut pour chaque situation]
prerequis: [00-prerequis-et-vue-ensemble]
next: 02-http2-http3
libs: []
tribuzen: inspection des requêtes de l'API TribuZen — méthodes, codes de statut, en-têtes sur invitations et assets
last-reviewed: 2026-07
---

# Le protocole HTTP

> **Outcomes — tu sauras FAIRE :** lire et forger une requête/réponse HTTP brute, choisir la bonne méthode selon safe/idempotent, renvoyer le code de statut correct pour chaque situation.
> **Difficulté :** :star:

## 1. Cas concret d'abord

Tu débogues l'API TribuZen. Un membre se plaint : « quand je clique deux fois sur *Inviter* Bob dans ma famille, parfois ça marche, parfois j'ai une erreur rouge. » Tu ouvres l'onglet **Network** de DevTools et tu captures les deux appels bruts.

```http
POST /api/families/42/invitations HTTP/1.1
Host: api.tribuzen.app
Content-Type: application/json
Authorization: Bearer eyJhbGc...

{"email":"bob@example.com"}
```

Première réponse :

```http
HTTP/1.1 201 Created
Location: /api/families/42/invitations/i-8f3a
Content-Type: application/json

{"id":"i-8f3a","email":"bob@example.com","status":"pending"}
```

Deuxième réponse (même clic, 2 secondes plus tard) :

```http
HTTP/1.1 409 Conflict
Content-Type: application/json

{"error":"invitation_already_exists","email":"bob@example.com"}
```

**Trois questions que ce module va rendre évidentes :**
1. Pourquoi le premier appel renvoie **201** et pas **200** ? (une ressource a été *créée*)
2. Pourquoi le deuxième renvoie **409** et pas **400** ou **500** ? (conflit avec l'état actuel, ce n'est ni la faute du format ni celle du serveur)
3. Est-ce un bug ? Non — c'est le comportement **correct** d'un `POST`, qui n'est **pas idempotent**. Deux `POST` identiques peuvent produire deux effets différents. Comprendre `safe` et `idempotent` t'explique pourquoi le front doit désactiver le bouton après le premier envoi.

Pour lire, forger et diagnostiquer ces échanges, il faut connaître l'anatomie d'une requête, les méthodes et surtout les codes de statut. On y va.

---

## 2. Théorie complète, concise

### 2.1 Anatomie d'une requête

Une requête HTTP est du **texte** structuré en trois parties : une *start-line*, des *headers*, une ligne vide, puis un *body* optionnel.

```http
POST /api/families/42/invitations HTTP/1.1   ← start-line (méthode + cible + version)
Host: api.tribuzen.app                        ← header
Content-Type: application/json                ← header
Content-Length: 27                            ← header
                                              ← ligne vide (CRLF) = fin des headers
{"email":"bob@example.com"}                   ← body (optionnel)
```

- **start-line** = `MÉTHODE cible-de-requête version`. La cible est le plus souvent un chemin d'origine (`/api/...?query`).
- **headers** = paires `Nom: valeur`, insensibles à la casse pour le nom. `Host` est **obligatoire** en HTTP/1.1.
- **body** = données envoyées (JSON, formulaire, fichier). Absent pour un `GET` classique.

### 2.2 Anatomie d'une réponse

Même structure, mais la première ligne est une *status-line*.

```http
HTTP/1.1 201 Created                          ← status-line (version + code + raison)
Date: Thu, 03 Jul 2026 10:30:00 GMT           ← header
Content-Type: application/json                ← header
Location: /api/families/42/invitations/i-8f3a ← header
Content-Length: 58                            ← header
                                              ← ligne vide
{"id":"i-8f3a","email":"bob@example.com","status":"pending"}   ← body
```

La **raison textuelle** (`Created`, `Not Found`) est purement humaine : le client se fie au **code numérique**, jamais au texte.

### 2.3 Les méthodes HTTP

La méthode décrit l'**intention** sur la ressource. Deux propriétés les classent :

- **Safe (sûre)** : n'entraîne aucune modification côté serveur. Purement de la lecture.
- **Idempotent** : appeler N fois produit le **même état final** qu'un seul appel. (L'idempotence porte sur l'*état du serveur*, pas sur le corps renvoyé.)

| Méthode  | Rôle                        | Safe | Idempotent | Body requête |
|----------|-----------------------------|:----:|:----------:|:------------:|
| GET      | Lire une ressource          | oui  | oui        | non          |
| HEAD     | Lire les headers seuls      | oui  | oui        | non          |
| OPTIONS  | Lister les capacités        | oui  | oui        | non          |
| POST     | Créer / action non répétable| non  | **non**    | oui          |
| PUT      | Remplacer intégralement     | non  | **oui**    | oui          |
| PATCH    | Modifier partiellement      | non  | **non**    | oui          |
| DELETE   | Supprimer                   | non  | **oui**    | optionnel    |

**Toute méthode safe est idempotente** (lire ne change rien, donc lire N fois non plus). L'inverse est faux : `DELETE` et `PUT` sont idempotents mais pas safe.

Le point qui piège le plus :
- `PUT /invitations/i-8f3a` avec le même corps → appelé 10 fois, la ressource finit dans le même état. **Idempotent.**
- `POST /invitations` → appelé 10 fois, crée potentiellement 10 invitations (ou 1 + neuf 409). **Non idempotent.**
- `PATCH` est **non idempotent** dans le cas général : un patch de type `{"score": "+1"}` (incrément relatif) donne un résultat différent à chaque appel. Un patch de champs absolus peut l'être en pratique, mais la spec ne le garantit pas.

Pourquoi ça compte concrètement : un client (ou un proxy) a le droit de **rejouer** automatiquement une requête idempotente après un timeout réseau. Rejouer un `POST` créerait un doublon — c'est exactement le bug du cas concret.

### 2.4 Sémantique REST des méthodes

Sur une ressource collection `/api/families/42/members` et une ressource unitaire `/api/families/42/members/7` :

```http
GET    /members        → 200 + liste
POST   /members        → 201 + Location du nouveau membre (créer)
GET    /members/7      → 200 + le membre 7
PUT    /members/7      → 200/204 remplace TOUT le membre 7
PATCH  /members/7      → 200 modifie CERTAINS champs du membre 7
DELETE /members/7      → 204 supprime le membre 7
```

Règle mnémotechnique : `POST` sur la **collection** pour créer, `PUT`/`PATCH`/`DELETE` sur l'**élément** pour agir dessus.

### 2.5 Les codes de statut

Cinq classes, reconnaissables au premier chiffre :

| Classe | Sens              | Analogie                     |
|--------|-------------------|------------------------------|
| 1xx    | Information        | « je traite, attends »       |
| 2xx    | Succès             | « c'est fait »               |
| 3xx    | Redirection        | « va voir ailleurs »         |
| 4xx    | Erreur **client**  | « ta requête est fautive »   |
| 5xx    | Erreur **serveur** | « ma faute, réessaie »       |

Les incontournables à connaître par cœur :

```text
2xx  200 OK              réussi, voici le corps
     201 Created         créé — accompagne d'un header Location
     204 No Content      réussi, aucun corps (typique DELETE, PUT)

3xx  301 Moved Permanently  déplacé pour toujours (méthode peut passer à GET)
     302 Found              déplacé temporairement (méthode peut passer à GET)
     304 Not Modified       ta copie en cache est encore bonne (LE code du cache)
     307 Temporary Redirect temporaire, méthode + body CONSERVÉS
     308 Permanent Redirect permanent, méthode + body CONSERVÉS

4xx  400 Bad Request        syntaxe / format invalide
     401 Unauthorized       non authentifié (« qui es-tu ? »)
     403 Forbidden          authentifié mais pas le droit (« je sais qui tu es, non »)
     404 Not Found          ressource inexistante
     405 Method Not Allowed méthode connue mais interdite ici — accompagne d'un header Allow
     409 Conflict           conflit avec l'état actuel (doublon, version périmée)
     410 Gone               a existé, supprimé définitivement
     422 Unprocessable      syntaxe OK mais sémantique invalide (validation métier)
     429 Too Many Requests  rate limiting — voir header Retry-After

5xx  500 Internal Server Error  bug non géré côté serveur
     502 Bad Gateway           un proxy a reçu une réponse invalide en amont
     503 Service Unavailable   serveur temporairement down (maintenance, surcharge)
```

Discriminations qui font la différence en entretien :
- **301 vs 308** : les deux sont permanents, mais `301` autorise le client à retomber en `GET`, `308` **préserve** la méthode et le corps (un `POST` reste un `POST`).
- **400 vs 422** : `400` = *je ne comprends pas* le format (JSON cassé). `422` = *je comprends mais je refuse* (email valide syntaxiquement mais déjà pris → souvent `409`/`422`).
- **401 vs 403** : `401` = authentification manquante/invalide. `403` = authentifié, mais droits insuffisants.
- **404 vs 410** : `404` = « pas trouvé, peut-être plus tard ». `410` = « supprimé, ne redemande pas ».

### 2.6 Négociation de contenu

Le client dit ce qu'il **accepte**, le serveur annonce ce qu'il **envoie**.

```http
GET /api/families/42 HTTP/1.1
Accept: application/json              ← je veux du JSON
Accept-Language: fr-FR, fr;q=0.9      ← de préférence en français (q = pondération)
Accept-Encoding: gzip, br             ← compression acceptée
```

```http
HTTP/1.1 200 OK
Content-Type: application/json; charset=utf-8   ← voici du JSON UTF-8
Content-Language: fr-FR
Content-Encoding: br                            ← compressé en Brotli
Vary: Accept-Encoding                           ← le cache doit varier selon cet en-tête
```

`Content-Type` sur la **requête** décrit le body envoyé ; `Accept` décrit ce qu'on veut en retour. Deux en-têtes différents qu'on confond souvent.

### 2.7 HTTP sur TCP/TLS et connexions (survol)

HTTP est un protocole **applicatif** qui circule au-dessus de **TCP** (fiabilité, ordre). En HTTPS, une couche **TLS** s'intercale pour chiffrer : `HTTP → TLS → TCP → IP`.

- **HTTP/1.0** : une connexion TCP par requête → un handshake (≈ 1 aller-retour) gaspillé à chaque fichier.
- **HTTP/1.1** : connexions **persistantes** (`keep-alive`) par défaut — on réutilise la même connexion TCP pour plusieurs échanges séquentiels.

```http
Connection: keep-alive    ← implicite en HTTP/1.1, réutilise la connexion
Connection: close         ← ferme après cette réponse
```

Limites de HTTP/1.1 (head-of-line blocking, plafond de ~6 connexions par domaine) et leurs solutions → **module 02** (HTTP/2 & HTTP/3).

### 2.8 Cookies et sessions (survol)

HTTP est **sans état** : chaque requête est indépendante. Les cookies rétablissent une continuité. Le serveur pose un cookie, le navigateur le renvoie automatiquement.

```http
HTTP/1.1 200 OK
Set-Cookie: sid=abc123; HttpOnly; Secure; SameSite=Lax; Max-Age=3600
```

```http
GET /api/families/42 HTTP/1.1
Cookie: sid=abc123        ← renvoyé automatiquement par le navigateur
```

- `HttpOnly` : inaccessible en JS (anti-XSS). `Secure` : HTTPS uniquement. `SameSite` : anti-CSRF.
- Le `sid` référence une **session** côté serveur. L'authentification par en-tête `Authorization: Bearer <token>` (JWT) est l'alternative sans cookie, courante pour les API. Détails d'auth → cours dédié.

---

## 3. Worked examples

### Exemple 1 — Diagnostiquer le 409 sur l'invitation en double (TribuZen)

Reprise du cas concret, résolu de bout en bout côté serveur.

```ts
// invitations.route.ts — un handler minimal Node.js illustrant les BONS codes
import http from 'node:http';

interface Invitation { id: string; email: string; status: 'pending' | 'accepted'; }

// « Base » en mémoire : email déjà invité pour la famille 42
const invitations: Invitation[] = [];

const server = http.createServer((req, res) => {
  const json = (code: number, body: unknown, headers: Record<string, string> = {}) => {
    res.writeHead(code, { 'Content-Type': 'application/json', ...headers });
    res.end(JSON.stringify(body));
  };

  if (req.method === 'POST' && req.url === '/api/families/42/invitations') {
    let raw = '';
    req.on('data', (c) => (raw += c));
    req.on('end', () => {
      // 1. Le corps est-il un JSON lisible ? Sinon 400 (format).
      let payload: { email?: string };
      try { payload = JSON.parse(raw); }
      catch { return json(400, { error: 'invalid_json' }); }

      // 2. Le champ métier est-il présent/valide ? Sinon 422 (sémantique).
      if (!payload.email || !payload.email.includes('@')) {
        return json(422, { error: 'email_invalid' });
      }

      // 3. Existe-t-il déjà ? Alors 409 : conflit avec l'état actuel.
      //    Ni 400 (le format est bon), ni 500 (le serveur va très bien).
      if (invitations.some((i) => i.email === payload.email)) {
        return json(409, { error: 'invitation_already_exists', email: payload.email });
      }

      // 4. Création réussie → 201 + Location de la nouvelle ressource.
      const inv: Invitation = { id: 'i-8f3a', email: payload.email!, status: 'pending' };
      invitations.push(inv);
      return json(201, inv, { Location: `/api/families/42/invitations/${inv.id}` });
    });
    return;
  }

  // Méthode non prévue sur cette route connue → 405 + Allow.
  if (req.url === '/api/families/42/invitations') {
    return json(405, { error: 'method_not_allowed' }, { Allow: 'POST' });
  }

  return json(404, { error: 'not_found' }); // route inconnue
});

server.listen(3000);
```

Le raisonnement à retenir : **on choisit le code le plus précis**. Le premier `POST` → `201`. Le second `POST` identique → `409`, car `POST` n'est pas idempotent et le serveur détecte le doublon. Un `400` serait faux (le JSON est valide), un `500` serait faux (aucun bug serveur).

Côté front, la conséquence directe : puisque le rejeu d'un `POST` crée un doublon, on **désactive le bouton** après le premier clic (ou on passe par un `PUT` idempotent avec une clé d'idempotence si l'API le supporte).

### Exemple 2 — Forger et lire des requêtes avec curl

Objectif : produire chaque méthode à la main et lire la status-line.

```bash
# GET — lecture, safe. -i affiche les headers de réponse.
curl -i https://api.tribuzen.app/api/families/42

# HEAD — mêmes headers que GET, AUCUN body. Idéal pour tester l'existence/la taille.
curl -I https://api.tribuzen.app/api/families/42

# POST — création. -d implique Content-Type: application/x-www-form-urlencoded,
# donc on force le JSON explicitement.
curl -i -X POST https://api.tribuzen.app/api/families/42/invitations \
  -H "Content-Type: application/json" \
  -d '{"email":"bob@example.com"}'

# PUT — remplacement idempotent : relancer cette commande 10x donne le même état.
curl -i -X PUT https://api.tribuzen.app/api/families/42/members/7 \
  -H "Content-Type: application/json" \
  -d '{"name":"Bob","role":"member"}'

# DELETE — attend typiquement un 204 (pas de body).
curl -i -X DELETE https://api.tribuzen.app/api/families/42/members/7

# -v montre TOUT l'échange : lignes préfixées > (envoyé) et < (reçu).
curl -v https://api.tribuzen.app/api/families/42
```

Lecture d'une sortie `-v` typique :

```text
> GET /api/families/42 HTTP/2       ← ce que curl ENVOIE (start-line + headers)
> host: api.tribuzen.app
> accept: */*
>
< HTTP/2 200                        ← ce que le serveur RENVOIE (status-line)
< content-type: application/json
< cache-control: max-age=60
< etag: "fam-42-v3"
<
{"id":42,"name":"Les Dupont"}       ← body
```

Le `<` te donne immédiatement le code (`200`) et les en-têtes de cache (`etag`, `cache-control`) qu'on exploitera dès le module 05.

---

## 4. Pièges & misconceptions

### PIÈGE #1 — Croire que `200` convient partout

`200 OK` est un réflexe paresseux. Une création réussie mérite `201` (+ `Location`), une suppression sans corps mérite `204`. Renvoyer `200` sur un `POST` de création prive le client du `Location` de la nouvelle ressource et brouille la sémantique. **Le code de statut fait partie du contrat de l'API.**

### PIÈGE #2 — Confondre « idempotent » et « safe »

```text
❌ « DELETE est safe puisqu'on peut le rappeler sans risque »
✅ DELETE est IDEMPOTENT (l'état final est le même), mais PAS safe (il MODIFIE).
```

Safe = *ne change rien* (GET, HEAD, OPTIONS). Idempotent = *le rejouer ne change pas l'état final au-delà du premier appel* (GET, HEAD, OPTIONS, **PUT, DELETE**). `POST` et `PATCH` ne sont ni l'un garanti : un rejeu réseau peut créer un doublon.

### PIÈGE #3 — Mettre un `200` avec `{"error": ...}` dans le body

```text
❌ HTTP/1.1 200 OK
   {"success": false, "error": "not_found"}
✅ HTTP/1.1 404 Not Found
   {"error": "not_found"}
```

Renvoyer `200` sur une erreur casse tout : les caches, les clients HTTP, le monitoring et les retries se fient au **code**, pas au JSON. Une erreur = un code 4xx/5xx.

### PIÈGE #4 — Confondre `Content-Type` (requête) et `Accept`

`Content-Type` décrit le **body que tu envoies**. `Accept` décrit le format que tu **veux recevoir**. Mettre `Accept: application/json` sur un `POST` ne dit rien sur le corps envoyé — il faut `Content-Type: application/json` pour ça. Symétriquement, un serveur qui lit `Accept` pour parser le body se trompe d'en-tête.

### PIÈGE #5 — Croire que `304 Not Modified` est une erreur

`304` est dans la classe 3xx mais c'est un **succès de cache** : « ta copie locale est bonne, je ne renvoie pas le corps ». Le navigateur affiche alors sa version en cache. C'est une optimisation, pas un échec — approfondi au module 05.

### PIÈGE #6 — Oublier le header `Host`

En HTTP/1.1, `Host` est **obligatoire** : un même serveur (une même IP) héberge souvent plusieurs domaines (virtual hosting). Sans `Host`, le serveur ne sait pas quel site tu veux → `400 Bad Request`.

---

## 5. Ancrage TribuZen

L'API TribuZen est une API REST/JSON classique. Ce module est le **socle** : tout le cours HTTP & Caching s'appuie sur ces échanges bruts.

**Invitations (`POST /api/families/:id/invitations`)** — le cas concret. Première invitation → `201 Created` + `Location`. Doublon → `409 Conflict`. Email malformé → `422`. Ces codes sont ce que le front lit pour afficher le bon message et désactiver le bouton (rejeu interdit car `POST` non idempotent).

**Assets statiques (`GET /assets/logo-v3.png`)** — les images et bundles du front TribuZen. Au deuxième chargement, le navigateur envoie `If-None-Match: "logo-v3"` et reçoit `304 Not Modified` sans body : la bande passante est économisée. C'est le pont direct vers le module 05 (ETag & validation conditionnelle).

**Mise à jour de profil (`PUT /api/members/:id`)** — remplacement **idempotent** : un double-clic ou un rejeu réseau n'a aucune conséquence, l'état final est identique. À opposer au `POST` d'invitation.

**Suppression (`DELETE /api/families/:id/members/:mid`)** — répond `204 No Content`. Rappeler le `DELETE` sur un membre déjà retiré peut répondre `404` ou `204` selon la convention — dans les deux cas l'état final est stable (idempotent).

Quand tu inspecteras ces requêtes dans DevTools Network (lab), tu retrouveras exactement la structure start-line / headers / body de la section 2, et tu sauras nommer chaque code.

---

## 6. Points clés

1. Une requête = start-line (`MÉTHODE cible version`) + headers + ligne vide + body optionnel ; une réponse = status-line (`version code raison`) + headers + body.
2. **Safe** = ne modifie rien (GET, HEAD, OPTIONS). **Idempotent** = rejouer ne change pas l'état final (GET, HEAD, OPTIONS, PUT, DELETE). `POST` et `PATCH` ne sont pas idempotents.
3. Toute méthode safe est idempotente ; l'inverse est faux (PUT/DELETE sont idempotents mais pas safe).
4. Le code de statut fait partie du contrat : `201`+`Location` pour créer, `204` pour supprimer sans corps, jamais `200` avec un body d'erreur.
5. Les codes à maîtriser : 200/201/204 · 301/302/304/307/308 · 400/401/403/404/405/409/410/422/429 · 500/502/503.
6. Discriminer : 301 vs 308 (méthode conservée ?), 400 vs 422 (format vs sémantique), 401 vs 403 (authentifié ?), 404 vs 410 (peut-être vs jamais).
7. `Content-Type` décrit le body envoyé ; `Accept` décrit le format voulu en retour (négociation de contenu).
8. HTTP circule sur TCP (+ TLS en HTTPS) ; HTTP/1.1 réutilise la connexion via `keep-alive`. Cookies (`Set-Cookie`/`Cookie`) rétablissent l'état sur un protocole sans état.

---

## 7. Seeds Anki

```
Quelles sont les trois parties d'une requête HTTP ?|La start-line (méthode + cible + version), les headers (paires Nom: valeur), et un body optionnel séparé des headers par une ligne vide.
Différence entre une méthode safe et une méthode idempotente ?|Safe = ne modifie rien côté serveur (GET, HEAD, OPTIONS). Idempotent = rejouer N fois donne le même état final qu'un seul appel (GET, HEAD, OPTIONS, PUT, DELETE). Toute méthode safe est idempotente ; l'inverse est faux.
POST et PATCH sont-ils idempotents ?|Non. Deux POST identiques peuvent créer deux ressources ; un PATCH relatif (ex: +1) change l'état à chaque appel. Conséquence : un client/proxy ne doit pas rejouer automatiquement un POST après un timeout.
Quel code renvoyer après une création réussie, et quel header l'accompagne ?|201 Created, accompagné d'un header Location pointant vers l'URL de la ressource créée.
Quel code pour une invitation en double dans TribuZen, et pourquoi pas 400 ni 500 ?|409 Conflict : conflit avec l'état actuel. Pas 400 (le format JSON est valide), pas 500 (aucun bug serveur).
Différence entre 401 et 403 ?|401 Unauthorized = non authentifié (« qui es-tu ? »). 403 Forbidden = authentifié mais droits insuffisants (« je sais qui tu es, tu n'as pas le droit »).
Différence entre 301 et 308 ?|Les deux sont des redirections permanentes. 301 autorise le client à repasser en GET ; 308 conserve la méthode et le corps d'origine (un POST reste un POST).
Différence entre les en-têtes Content-Type et Accept ?|Content-Type décrit le format du body envoyé dans le message courant ; Accept (requête) indique le format que le client souhaite recevoir en réponse (négociation de contenu).
Que signifie 304 Not Modified et pourquoi ce n'est pas une erreur ?|C'est un succès de cache : la copie locale du client est encore valide, le serveur ne renvoie pas le body. Le navigateur affiche sa version en cache — économie de bande passante.
Pourquoi le header Host est-il obligatoire en HTTP/1.1 ?|Une même IP héberge souvent plusieurs domaines (virtual hosting). Host indique quel site est visé ; sans lui le serveur répond 400 Bad Request.
```

---

## Pont vers le lab

> Lab associé : `11-http-caching/labs/lab-01-protocole-http/README.md`. Inspecter des requêtes réelles avec `curl -v` et DevTools Network, forger chaque méthode, lire les codes de statut et diagnostiquer un `409` et un `304` sur l'API TribuZen.
