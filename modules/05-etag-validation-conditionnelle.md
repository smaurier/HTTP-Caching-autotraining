# Module 05 — ETag & Validation conditionnelle

> **Objectif** : Comprendre les mecanismes de validation conditionnelle (ETag, Last-Modified), savoir implementer la revalidation dans un serveur Node.js, et maitriser le flow complet requete -> 304 -> cache.
> **Difficulte** : ⭐⭐ (Intermediaire)

---

## 1. Pourquoi la validation conditionnelle ?

### 1.1 Le probleme : re-telecharger pour rien

**Analogie du dictionnaire** : Tu as un dictionnaire de 2000 pages (2 Mo) sur ton bureau. Tous les mois, l'editeur publie une nouvelle edition. La plupart du temps, rien n'a change. Mais sans moyen de verifier, tu dois racheter le dictionnaire entier chaque mois, "au cas ou".

```
SANS VALIDATION CONDITIONNELLE :
==================================

Requete 1 (premier chargement) :
  GET /gros-fichier.js HTTP/1.1
  --> Reponse : 200 OK (1.2 Mo)                 Transfert : 1.2 Mo

Requete 2 (cache expire, meme fichier) :
  GET /gros-fichier.js HTTP/1.1
  --> Reponse : 200 OK (1.2 Mo)                 Transfert : 1.2 Mo
  --> Le fichier n'a PAS change ! 1.2 Mo gaspilles.

Requete 3 (cache expire a nouveau) :
  GET /gros-fichier.js HTTP/1.1
  --> Reponse : 200 OK (1.2 Mo)                 Transfert : 1.2 Mo
  --> ENCORE 1.2 Mo gaspilles.

Total transfere : 3.6 Mo (dont 2.4 Mo inutiles)


AVEC VALIDATION CONDITIONNELLE :
==================================

Requete 1 (premier chargement) :
  GET /gros-fichier.js HTTP/1.1
  --> Reponse : 200 OK (1.2 Mo)
      ETag: "abc123"                             Transfert : 1.2 Mo

Requete 2 (cache expire, on VERIFIE d'abord) :
  GET /gros-fichier.js HTTP/1.1
  If-None-Match: "abc123"                <-- "J'ai la version abc123"
  --> Reponse : 304 Not Modified (~200 octets)   Transfert : 0.0002 Mo
  --> Le fichier n'a pas change, on garde notre copie.

Requete 3 (cache expire a nouveau) :
  GET /gros-fichier.js HTTP/1.1
  If-None-Match: "abc123"
  --> Reponse : 304 Not Modified (~200 octets)   Transfert : 0.0002 Mo

Total transfere : 1.2004 Mo (economie de 2.4 Mo = 66% !)
```

### 1.2 Le concept de validateur

Un **validateur** est une information qui permet de verifier si une ressource a change sans telecharger tout son contenu.

Il existe deux types de validateurs :

```
+--------------------------------------------------+
|              LES DEUX VALIDATEURS HTTP            |
+--------------------------------------------------+
|                                                  |
|  1. ETag (Entity Tag)                            |
|     = Empreinte digitale du contenu              |
|     = "abc123" ou W/"abc123"                     |
|     Precision : EXACTE (octet par octet)         |
|                                                  |
|  2. Last-Modified                                |
|     = Date de derniere modification              |
|     = "Thu, 07 Mar 2026 10:30:00 GMT"            |
|     Precision : A LA SECONDE (moins precis)      |
|                                                  |
+--------------------------------------------------+
```

**Analogie** :
- **ETag** : c'est comme le numero de serie d'un produit. Si le produit est identique, le numero est le meme. Si une seule vis change, le numero est different.
- **Last-Modified** : c'est comme la date imprimee sur l'emballage. Moins precis (deux produits differents fabriques la meme seconde auraient la meme date).

---

## 2. ETag en detail

### 2.1 Qu'est-ce qu'un ETag ?

Un ETag (Entity Tag) est une **chaine opaque** qui identifie une version specifique d'une ressource.

```
ETag: "33a64df551425fcc55e4d42a148795d9f25f89d4"
       ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
       Chaine quelconque (souvent un hash)

ETag: "v2"
       ^^
       Peut etre tres simple

ETag: "article-42-1709808600"
       ^^^^^^^^^^^^^^^^^^^^^
       Peut encoder des infos (mais c'est opaque pour le client)
```

**Regles :**
- L'ETag est **entoure de guillemets** (c'est obligatoire dans la spec HTTP)
- Le client ne doit **pas interpreter** le contenu de l'ETag (c'est opaque)
- Deux ressources identiques octet-par-octet doivent avoir le **meme ETag**
- Si le contenu change d'un seul octet, l'ETag **doit changer**

### 2.2 Strong ETag vs Weak ETag

```
STRONG ETAG :                          WEAK ETAG :
==============                         ============
ETag: "abc123"                         ETag: W/"abc123"
                                             ^^
                                             Prefixe W/ = "weak"

Signification :                        Signification :
Le contenu est identique               Le contenu est "semantiquement
OCTET PAR OCTET.                       equivalent" (pas forcement
                                       identique octet par octet).

Exemple :                              Exemple :
Deux fichiers HTML identiques          Deux fichiers HTML avec le meme
a l'octet pres.                        contenu mais des espaces ou
                                       commentaires differents.

Utilisation :                          Utilisation :
Requetes Range (telechargement         Revalidation de cache (cas general)
partiel), comparaison stricte.
```

**Quand utiliser un weak ETag ?**

Imagine une page web generee dynamiquement qui contient l'heure du serveur dans un commentaire HTML :

```html
<!-- Generated at 2026-03-07T10:30:00Z -->
<html><body><h1>Contenu identique</h1></body></html>

<!-- Generated at 2026-03-07T10:30:01Z -->
<html><body><h1>Contenu identique</h1></body></html>
```

Ces deux pages sont **semantiquement identiques** (meme contenu visible) mais **differentes octet par octet** (le commentaire change). Un weak ETag dirait "c'est pareil" alors qu'un strong ETag dirait "c'est different".

### 2.3 Generer des ETags avec Node.js

```javascript
// etag-generation.js
// Differentes strategies de generation d'ETag

const http = require('node:http');
const crypto = require('node:crypto');

// === STRATEGIE 1 : Hash du contenu (la plus fiable) ===
function etagFromContent(content) {
  // Calcule un hash SHA-256 du contenu
  // Si le contenu est identique, le hash est identique
  const hash = crypto
    .createHash('sha256')                         // Algorithme SHA-256
    .update(content)                              // Donnees a hasher
    .digest('hex')                                // Resultat en hexadecimal
    .substring(0, 16);                            // Tronquer pour la brievete
  return `"${hash}"`;                             // Guillemets obligatoires
}

// === STRATEGIE 2 : Hash MD5 (plus rapide, moins securise, OK pour ETag) ===
function etagFromContentMD5(content) {
  const hash = crypto
    .createHash('md5')                            // MD5 est plus rapide
    .update(content)
    .digest('base64url');                          // Base64 sans caracteres speciaux
  return `"${hash}"`;
}

// === STRATEGIE 3 : Version numerique (simple mais manuelle) ===
let version = 1;
function etagFromVersion() {
  return `"v${version}"`;
}

// === STRATEGIE 4 : Timestamp (pour Last-Modified converti en ETag) ===
function etagFromTimestamp(lastModified) {
  return `"${lastModified.getTime().toString(36)}"`;   // Base36 pour compacite
}

// === STRATEGIE 5 : Weak ETag (pour du contenu semantiquement equivalent) ===
function weakEtagFromContent(content) {
  // Normaliser : supprimer les espaces multiples, les commentaires, etc.
  const normalized = content.replace(/\s+/g, ' ').replace(/<!--.*?-->/g, '').trim();
  const hash = crypto.createHash('md5').update(normalized).digest('hex').substring(0, 16);
  return `W/"${hash}"`;                           // Prefixe W/ pour weak
}

// === DEMONSTRATION ===
const content1 = '<html><body><h1>Bonjour</h1></body></html>';
const content2 = '<html><body><h1>Bonjour</h1></body></html>';  // Identique
const content3 = '<html><body><h1>Bonsoir</h1></body></html>';  // Different

console.log('=== Demonstration de generation d\'ETag ===\n');

console.log('Contenu 1 :', etagFromContent(content1));
console.log('Contenu 2 :', etagFromContent(content2));  // Doit etre IDENTIQUE a contenu 1
console.log('Contenu 3 :', etagFromContent(content3));  // Doit etre DIFFERENT

console.log('\nMD5 :', etagFromContentMD5(content1));
console.log('Version :', etagFromVersion());
console.log('Timestamp :', etagFromTimestamp(new Date()));
console.log('Weak :', weakEtagFromContent(content1));

// Un contenu avec des espaces differents mais semantiquement identique
const contentA = '<html>  <body>  <h1>Bonjour</h1>  </body>  </html>';
const contentB = '<html><body><h1>Bonjour</h1></body></html>';
console.log('\n=== Weak ETag et espaces ===');
console.log('Strong A :', etagFromContent(contentA));   // Different de B
console.log('Strong B :', etagFromContent(contentB));   // Different de A
console.log('Weak A   :', weakEtagFromContent(contentA));  // IDENTIQUE a B
console.log('Weak B   :', weakEtagFromContent(contentB));  // IDENTIQUE a A
```

**Quelle strategie choisir ?**

| Strategie        | Avantages                          | Inconvenients                      | Quand l'utiliser                |
|------------------|------------------------------------|------------------------------------|---------------------------------|
| Hash du contenu  | Precision parfaite                 | Cout CPU (calcul du hash)          | Fichiers statiques, API         |
| Hash MD5         | Rapide a calculer                  | Collisions theoriques (rare)       | Cas general                     |
| Version manuelle | Zero cout de calcul                | Necessite un suivi des versions    | Base de donnees avec versionning|
| Timestamp        | Simple                             | Precision a la seconde seulement   | Fichiers sur disque             |
| Weak ETag        | Tolere les differences cosmetiques | Moins precis                       | Contenu dynamique genere        |

---

## 3. Last-Modified

### 3.1 Le concept

`Last-Modified` indique la date de derniere modification de la ressource :

```
Last-Modified: Thu, 07 Mar 2026 10:30:00 GMT
```

**Format** : RFC 7231 (toujours en GMT/UTC, format obligatoire)

### 3.2 Last-Modified vs ETag

| Critere              | Last-Modified                     | ETag                              |
|----------------------|-----------------------------------|-----------------------------------|
| Precision            | A la seconde                      | Au bit pres (strong) ou semantique (weak) |
| Format               | Date HTTP                         | Chaine opaque                     |
| Cout serveur         | Faible (lire la date du fichier)  | Variable (calcul de hash)         |
| Fiabilite            | Problemes avec horloges, NFS      | Tres fiable                       |
| Priorite HTTP        | Moins prioritaire                 | Plus prioritaire (RFC 9110)       |

**Problemes de Last-Modified :**

```
PROBLEME 1 : Precision limitee a la seconde
=============================================
Fichier modifie a 10:30:00.100
Fichier modifie a 10:30:00.900
Last-Modified: Thu, 07 Mar 2026 10:30:00 GMT  <-- MEME date pour les deux !

Le cache croit que c'est la meme version alors que le contenu a change.


PROBLEME 2 : Touch sans modification
======================================
$ touch fichier.html    # Change la date mais PAS le contenu
Last-Modified: change alors que le contenu est identique
Le cache croit que c'est une nouvelle version alors que rien n'a change.


PROBLEME 3 : Horloges desynchronisees
=======================================
Serveur A : horloge a 10:30:00
Serveur B : horloge a 10:29:55 (5 secondes de retard)

Un load balancer qui envoie les requetes alternativement a A et B
va produire des Last-Modified incoherents.
```

**Regle** : Si tu peux utiliser ETag, utilise ETag. Last-Modified est un **fallback** utile mais moins precis.

### 3.3 Utiliser les deux ensemble

La spec HTTP recommande d'envoyer **les deux** quand c'est possible :

```
HTTP/1.1 200 OK
ETag: "a1b2c3d4e5f6"
Last-Modified: Thu, 07 Mar 2026 10:30:00 GMT
Cache-Control: max-age=3600
Content-Type: text/html

<html>...</html>
```

Le client utilisera ETag en priorite (via `If-None-Match`), mais `Last-Modified` sert de fallback pour les clients qui ne supportent pas ETag.

---

## 4. Les requetes conditionnelles

### 4.1 If-None-Match (avec ETag)

```
FLOW COMPLET AVEC If-None-Match
=================================

ETAPE 1 : Premier chargement
------------------------------
Client:
  GET /article/42 HTTP/1.1
  Host: api.example.com

Serveur:
  HTTP/1.1 200 OK
  ETag: "article-42-v3"              <-- Le serveur envoie l'ETag
  Cache-Control: max-age=300
  Content-Type: application/json
  Content-Length: 2048

  {"id": 42, "title": "Mon article", ...}

Le client stocke : URL=/article/42, ETag="article-42-v3", contenu=...


ETAPE 2 : Cache expire (apres 300 secondes), le client REVALIDE
-----------------------------------------------------------------
Client:
  GET /article/42 HTTP/1.1
  Host: api.example.com
  If-None-Match: "article-42-v3"     <-- "J'ai la version v3, elle est encore bonne ?"

Serveur verifie : ETag actuel = "article-42-v3" ? OUI, rien n'a change.

Serveur:
  HTTP/1.1 304 Not Modified          <-- PAS de body ! Enorme economie.
  ETag: "article-42-v3"
  Cache-Control: max-age=300          <-- Reset du timer de fraicheur

Le client reutilise sa copie locale.


ETAPE 3 : Cache expire a nouveau, MAIS le contenu a change
------------------------------------------------------------
Client:
  GET /article/42 HTTP/1.1
  Host: api.example.com
  If-None-Match: "article-42-v3"

Serveur verifie : ETag actuel = "article-42-v4" != "article-42-v3". Ca a change !

Serveur:
  HTTP/1.1 200 OK                    <-- Nouveau contenu
  ETag: "article-42-v4"              <-- Nouvel ETag
  Cache-Control: max-age=300
  Content-Type: application/json
  Content-Length: 2100

  {"id": 42, "title": "Mon article modifie", ...}

Le client remplace sa copie en cache.
```

### 4.2 If-Modified-Since (avec Last-Modified)

```
FLOW COMPLET AVEC If-Modified-Since
=====================================

ETAPE 1 : Premier chargement
------------------------------
Client:
  GET /image.jpg HTTP/1.1

Serveur:
  HTTP/1.1 200 OK
  Last-Modified: Mon, 01 Jan 2026 00:00:00 GMT  <-- Date de modification
  Cache-Control: max-age=86400
  Content-Type: image/jpeg
  Content-Length: 524288

  [524 Ko de donnees image]


ETAPE 2 : Cache expire, le client revalide avec la date
---------------------------------------------------------
Client:
  GET /image.jpg HTTP/1.1
  If-Modified-Since: Mon, 01 Jan 2026 00:00:00 GMT  <-- "Modifie depuis cette date ?"

Serveur verifie : derniere modification = 1er janvier 2026. Pas de changement.

Serveur:
  HTTP/1.1 304 Not Modified
  Last-Modified: Mon, 01 Jan 2026 00:00:00 GMT
  Cache-Control: max-age=86400

  (Pas de body ! On economise 524 Ko.)
```

### 4.3 Quand les deux sont presents

Si le client envoie **les deux** headers conditionnels, le serveur doit verifier **les deux** :

```
Client:
  GET /page.html HTTP/1.1
  If-None-Match: "abc123"
  If-Modified-Since: Mon, 01 Jan 2026 00:00:00 GMT

Serveur :
  1. Verifier If-None-Match d'abord (prioritaire)
  2. Si l'ETag correspond, verifier aussi If-Modified-Since
  3. Les DEUX doivent valider pour renvoyer 304

  Si ETag correspond ET date est ancienne --> 304
  Si ETag ne correspond pas              --> 200 (nouveau contenu)
```

### 4.4 Diagramme recapitulatif

```
Client envoie une requete GET
           |
           v
+------------------------+
| Cache local existe ?   |
+------------------------+
  |                  |
  NON               OUI
  |                  |
  v                  v
GET simple        Le cache est-il frais ?
(pas de           (age < max-age)
headers              |           |
conditionnels)      OUI         NON
  |                  |           |
  v                  v           v
200 OK          Servir du     Envoyer des headers
(complet)       cache local   conditionnels :
                (0 requete    If-None-Match: <ETag>
                 reseau)      If-Modified-Since: <date>
                                     |
                                     v
                            +------------------+
                            | Serveur verifie  |
                            +------------------+
                              |              |
                           Change ?       Pas change ?
                              |              |
                              v              v
                           200 OK        304 Not Modified
                           (complet)     (pas de body)
                              |              |
                              v              v
                           Remplacer     Reutiliser
                           le cache      le cache local
                           local         + reset timer
```

---

## 5. Implementation complete en Node.js

### 5.1 Serveur avec ETag et validation conditionnelle

```javascript
// server-etag-complete.js
// Serveur HTTP avec gestion complete de ETag et validation conditionnelle

const http = require('node:http');
const crypto = require('node:crypto');

// --- Simuler une base de donnees ---
const database = {
  articles: {
    1: { id: 1, title: 'Introduction au caching HTTP', content: 'Le cache HTTP est...', updatedAt: new Date('2026-01-15') },
    2: { id: 2, title: 'Les headers essentiels', content: 'Cache-Control est...', updatedAt: new Date('2026-02-20') },
    3: { id: 3, title: 'ETag en pratique', content: 'Un ETag identifie...', updatedAt: new Date('2026-03-01') },
  }
};

// --- Fonction pour generer un ETag a partir du contenu ---
function generateETag(data) {
  const json = JSON.stringify(data);
  const hash = crypto
    .createHash('md5')          // Hash MD5 (suffisant pour un ETag)
    .update(json)               // Hasher le contenu JSON
    .digest('hex')              // Resultat en hexadecimal
    .substring(0, 16);          // Tronquer a 16 caracteres
  return `"${hash}"`;           // Entourer de guillemets (obligatoire)
}

// --- Fonction pour formater une date HTTP ---
function formatHttpDate(date) {
  return date.toUTCString();    // "Thu, 07 Mar 2026 10:30:00 GMT"
}

const server = http.createServer((req, res) => {
  const { method, url } = req;

  // --- Router ---
  const match = url.match(/^\/api\/articles\/(\d+)$/);

  if (method === 'GET' && match) {
    const id = parseInt(match[1]);
    const article = database.articles[id];

    // 404 si l'article n'existe pas
    if (!article) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: 'Article non trouve' }));
    }

    // --- Generer les validateurs ---
    const etag = generateETag(article);
    const lastModified = formatHttpDate(article.updatedAt);

    // --- Verification conditionnelle : If-None-Match (ETag) ---
    const ifNoneMatch = req.headers['if-none-match'];
    if (ifNoneMatch) {
      // Le client peut envoyer plusieurs ETags : "v1", "v2", "v3"
      const clientETags = ifNoneMatch.split(',').map(e => e.trim());

      if (clientETags.includes(etag)) {
        // L'ETag correspond ! Le contenu n'a pas change.
        console.log(`[304] Article ${id} - ETag match (${etag})`);
        res.writeHead(304, {
          'ETag': etag,
          'Last-Modified': lastModified,
          'Cache-Control': 'public, max-age=60',
        });
        return res.end();  // PAS de body !
      }
    }

    // --- Verification conditionnelle : If-Modified-Since (date) ---
    const ifModifiedSince = req.headers['if-modified-since'];
    if (ifModifiedSince && !ifNoneMatch) {
      // On ne verifie If-Modified-Since que si If-None-Match est absent
      // (ETag est prioritaire selon la spec)
      const clientDate = new Date(ifModifiedSince);
      if (article.updatedAt <= clientDate) {
        // Pas modifie depuis la date du client
        console.log(`[304] Article ${id} - Not modified since ${ifModifiedSince}`);
        res.writeHead(304, {
          'ETag': etag,
          'Last-Modified': lastModified,
          'Cache-Control': 'public, max-age=60',
        });
        return res.end();
      }
    }

    // --- Reponse complete (200 OK) ---
    const body = JSON.stringify(article);
    console.log(`[200] Article ${id} - Envoi complet (${Buffer.byteLength(body)} octets)`);

    res.writeHead(200, {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(body),
      'ETag': etag,                             // Validateur ETag
      'Last-Modified': lastModified,            // Validateur Last-Modified
      'Cache-Control': 'public, max-age=60',    // Frais pendant 60 secondes
      'Vary': 'Accept-Encoding',                // Important si compression activee
    });
    res.end(body);
  }

  // --- Liste des articles ---
  else if (method === 'GET' && url === '/api/articles') {
    const articles = Object.values(database.articles);
    const body = JSON.stringify(articles);
    const etag = generateETag(articles);

    const ifNoneMatch = req.headers['if-none-match'];
    if (ifNoneMatch && ifNoneMatch.includes(etag)) {
      res.writeHead(304, { 'ETag': etag, 'Cache-Control': 'public, max-age=30' });
      return res.end();
    }

    res.writeHead(200, {
      'Content-Type': 'application/json',
      'ETag': etag,
      'Cache-Control': 'public, max-age=30',
    });
    res.end(body);
  }

  // --- Mettre a jour un article (pour tester que l'ETag change) ---
  else if (method === 'PUT' && match) {
    const id = parseInt(match[1]);
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const updates = JSON.parse(body);
        if (database.articles[id]) {
          database.articles[id] = {
            ...database.articles[id],
            ...updates,
            updatedAt: new Date(),   // Met a jour la date de modification
          };
          const newEtag = generateETag(database.articles[id]);
          console.log(`[200] Article ${id} mis a jour - Nouvel ETag: ${newEtag}`);
          res.writeHead(200, {
            'Content-Type': 'application/json',
            'ETag': newEtag,
          });
          res.end(JSON.stringify(database.articles[id]));
        } else {
          res.writeHead(404);
          res.end(JSON.stringify({ error: 'Article non trouve' }));
        }
      } catch (e) {
        res.writeHead(400);
        res.end(JSON.stringify({ error: 'JSON invalide' }));
      }
    });
  }

  else {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('API ETag Demo\nRoutes: GET /api/articles, GET /api/articles/:id, PUT /api/articles/:id');
  }
});

server.listen(3000, () => {
  console.log('=== Serveur ETag Demo ===');
  console.log('http://localhost:3000');
  console.log('');
  console.log('Tester :');
  console.log('  curl -v http://localhost:3000/api/articles/1');
  console.log('  curl -v -H \'If-None-Match: "<copier l-etag-ici>"\' http://localhost:3000/api/articles/1');
  console.log('  curl -X PUT -H "Content-Type: application/json" -d \'{"title":"Nouveau titre"}\' http://localhost:3000/api/articles/1');
  console.log('');
});
```

### 5.2 Tester le serveur etape par etape

```bash
# ETAPE 1 : Premier chargement (200 OK avec ETag)
curl -v http://localhost:3000/api/articles/1
# < HTTP/1.1 200 OK
# < ETag: "a1b2c3d4e5f6g7h8"
# < Cache-Control: public, max-age=60
# < Content-Type: application/json
# {"id":1,"title":"Introduction au caching HTTP",...}

# ETAPE 2 : Revalidation avec If-None-Match (304)
curl -v -H 'If-None-Match: "a1b2c3d4e5f6g7h8"' \
  http://localhost:3000/api/articles/1
# < HTTP/1.1 304 Not Modified
# < ETag: "a1b2c3d4e5f6g7h8"
# (PAS DE BODY !)

# ETAPE 3 : Modifier l'article (l'ETag va changer)
curl -X PUT -H "Content-Type: application/json" \
  -d '{"title":"Titre modifie"}' \
  http://localhost:3000/api/articles/1
# < HTTP/1.1 200 OK
# < ETag: "x9y8z7w6v5u4t3s2"    <-- NOUVEL ETag

# ETAPE 4 : Revalidation avec l'ANCIEN ETag (200 car change)
curl -v -H 'If-None-Match: "a1b2c3d4e5f6g7h8"' \
  http://localhost:3000/api/articles/1
# < HTTP/1.1 200 OK              <-- 200 car l'ETag ne correspond plus
# < ETag: "x9y8z7w6v5u4t3s2"    <-- Nouvel ETag
# {"id":1,"title":"Titre modifie",...}
```

---

## 6. Performance : les chiffres

### 6.1 Comparaison des tailles de reponse

```
+---------------------------------------------------+
|        TAILLE DES REPONSES : 200 vs 304            |
+---------------------------------------------------+
|                                                   |
| Ressource        | 200 OK    | 304 Not Modified  |
|                  | (complet)  | (headers seuls)    |
|------------------|-----------|-------------------|
| Page HTML        | ~50 Ko    | ~200 octets       |
| Fichier JS       | ~300 Ko   | ~200 octets       |
| Image JPEG       | ~500 Ko   | ~200 octets       |
| Reponse API JSON | ~10 Ko    | ~200 octets       |
| Gros fichier     | ~5 Mo     | ~200 octets       |
|                                                   |
| Economie typique :  95% - 99.99%                  |
+---------------------------------------------------+
```

### 6.2 Impact sur le temps de chargement

```
SCENARIO : Page avec 50 ressources, connexion 4G (50 Mbps, 50ms latence)

SANS VALIDATION CONDITIONNELLE (tout en 200) :
  50 ressources x 100 Ko en moyenne = 5 Mo a telecharger
  Temps de transfert : 5 Mo / 50 Mbps = ~800ms
  Temps total avec latence : ~800ms + 50ms = ~850ms

AVEC VALIDATION CONDITIONNELLE (45 en 304, 5 en 200) :
  5 ressources changees x 100 Ko = 500 Ko a telecharger
  45 reponses 304 x 200 octets = ~9 Ko
  Temps de transfert : 509 Ko / 50 Mbps = ~80ms
  Temps total avec latence : ~80ms + 50ms = ~130ms

AMELIORATION : 85% plus rapide !
```

### 6.3 Comparaison des couts serveur

```
REQUETE AVEC 200 OK (contenu complet) :
=========================================
1. Lire l'article de la base de donnees
2. Serialiser en JSON
3. Calculer les headers
4. Envoyer le body complet sur le reseau
CPU: ****     I/O reseau: *********
Temps total: ~10ms


REQUETE AVEC 304 NOT MODIFIED :
================================
1. Lire l'ETag de la base (ou du cache serveur)
2. Comparer avec le If-None-Match du client
3. Envoyer 304 (pas de body)
CPU: **       I/O reseau: *
Temps total: ~2ms

Economie serveur: ~80% de CPU et I/O en moins !
```

---

## 7. ETag pour les fichiers statiques

### 7.1 Serveur de fichiers avec ETag automatique

```javascript
// server-static-etag.js
// Serveur de fichiers statiques avec ETag et Last-Modified

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const STATIC_DIR = path.join(__dirname, 'public');

// Types MIME courants
const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

function getContentType(filePath) {
  const ext = path.extname(filePath);
  return MIME_TYPES[ext] || 'application/octet-stream';
}

const server = http.createServer((req, res) => {
  // Securite : empecher les traversals de repertoire
  const safePath = path.normalize(req.url).replace(/^(\.\.[\/\\])+/, '');
  const filePath = path.join(STATIC_DIR, safePath === '/' ? 'index.html' : safePath);

  // Verifier que le fichier existe
  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      return res.end('Fichier non trouve');
    }

    // --- Generer les validateurs ---
    // ETag base sur la taille + date de modification (methode rapide)
    const etag = `"${stats.size.toString(16)}-${stats.mtimeMs.toString(16)}"`;
    const lastModified = stats.mtime.toUTCString();

    // --- Determiner la strategie de cache selon le type de fichier ---
    const ext = path.extname(filePath);
    let cacheControl;

    if (req.url.match(/\.[a-f0-9]{8,}\./)) {
      // Fichier avec hash dans le nom (ex: app.a1b2c3d4.js)
      cacheControl = 'public, max-age=31536000, immutable';
    } else if (['.html'].includes(ext)) {
      // Fichiers HTML : toujours revalider
      cacheControl = 'public, no-cache';
    } else if (['.css', '.js'].includes(ext)) {
      // CSS/JS sans hash : cache court
      cacheControl = 'public, max-age=3600';
    } else if (['.png', '.jpg', '.gif', '.webp', '.svg'].includes(ext)) {
      // Images : cache moyen
      cacheControl = 'public, max-age=86400';
    } else {
      cacheControl = 'public, max-age=3600';
    }

    // --- Verification conditionnelle ---
    const ifNoneMatch = req.headers['if-none-match'];
    const ifModifiedSince = req.headers['if-modified-since'];

    // Priorite 1 : If-None-Match (ETag)
    if (ifNoneMatch && ifNoneMatch === etag) {
      console.log(`[304] ${req.url} (ETag match)`);
      res.writeHead(304, {
        'ETag': etag,
        'Last-Modified': lastModified,
        'Cache-Control': cacheControl,
      });
      return res.end();
    }

    // Priorite 2 : If-Modified-Since
    if (ifModifiedSince && !ifNoneMatch) {
      const clientDate = new Date(ifModifiedSince);
      if (stats.mtime <= clientDate) {
        console.log(`[304] ${req.url} (Not modified since)`);
        res.writeHead(304, {
          'ETag': etag,
          'Last-Modified': lastModified,
          'Cache-Control': cacheControl,
        });
        return res.end();
      }
    }

    // --- Reponse complete ---
    console.log(`[200] ${req.url} (${stats.size} octets)`);
    res.writeHead(200, {
      'Content-Type': getContentType(filePath),
      'Content-Length': stats.size,
      'ETag': etag,
      'Last-Modified': lastModified,
      'Cache-Control': cacheControl,
      'Vary': 'Accept-Encoding',
    });

    // Streamer le fichier (efficace pour les gros fichiers)
    const readStream = fs.createReadStream(filePath);
    readStream.pipe(res);
  });
});

server.listen(3000, () => {
  console.log('Serveur de fichiers statiques sur http://localhost:3000');
  console.log(`Repertoire: ${STATIC_DIR}`);
});
```

---

## 8. ETag et les outils de build

### 8.1 La strategie "hash dans le nom" vs ETag

```
DEUX STRATEGIES COMPLEMENTAIRES
=================================

STRATEGIE 1 : Hash dans le nom de fichier (cache-busting)
-----------------------------------------------------------
/assets/app.a1b2c3d4.js
                ^^^^^^^^
                Hash du contenu

- Le contenu change ? Le hash change. L'URL change.
- L'ancienne URL n'est plus referencee (mort naturelle du cache).
- Pas besoin de ETag car l'URL EST l'identifiant de version.
- Cache-Control: max-age=31536000, immutable

STRATEGIE 2 : ETag (revalidation)
-----------------------------------
/index.html
ETag: "abc123"

- L'URL ne change PAS quand le contenu change.
- ETag permet de verifier si le contenu a change.
- Cache-Control: no-cache (ou max-age court + must-revalidate)


EN PRATIQUE, ON UTILISE LES DEUX :
====================================

index.html (ETag + no-cache)
  |
  +-- <link href="/assets/style.a1b2c3.css">  (hash + immutable)
  +-- <script src="/assets/app.d4e5f6.js">    (hash + immutable)
  +-- <img src="/images/logo.png">             (ETag + max-age moyen)

Le HTML est toujours revalide (pour decouvrir les nouveaux hashes).
Les assets avec hash sont caches pour toujours.
Les images sans hash utilisent ETag pour revalidation.
```

### 8.2 Flow complet d'un deploiement

```
AVANT LE DEPLOIEMENT :
========================
index.html --> <script src="/app.a1b2c3.js">
/app.a1b2c3.js  (Cache-Control: immutable, max-age=31536000)

En cache chez les utilisateurs :
  index.html (ETag: "html-v1")
  app.a1b2c3.js (cache pour 1 an)


DEPLOIEMENT : le code JS a change
====================================
Outil de build genere : /app.d4e5f6.js (nouveau hash)
index.html est modifie : <script src="/app.d4e5f6.js">


APRES LE DEPLOIEMENT :
========================
Utilisateur revient sur le site.

1. Navigateur : "J'ai index.html en cache avec no-cache"
   --> Revalide : If-None-Match: "html-v1"
   --> Serveur : "Le HTML a change !" --> 200 OK, ETag: "html-v2"
   --> Nouveau HTML reference /app.d4e5f6.js

2. Navigateur : "J'ai besoin de /app.d4e5f6.js"
   --> Pas en cache (nouvelle URL) --> 200 OK
   --> Cache pour 1 an

3. L'ancien /app.a1b2c3.js reste en cache mais
   n'est plus jamais reference. Il expirera naturellement.

RESULTAT : L'utilisateur a la nouvelle version en 1 revalidation
du HTML + 1 telechargement du nouveau JS.
```

---

## Points cles

1. **La validation conditionnelle** evite de re-telecharger des ressources inchangees, economisant bande passante et temps.
2. **ETag** est une empreinte du contenu. Strong ETag (`"abc"`) = identique octet par octet. Weak ETag (`W/"abc"`) = semantiquement equivalent.
3. **Last-Modified** est un validateur base sur la date, moins precis que ETag (precision a la seconde seulement).
4. **If-None-Match** + ETag = couple de revalidation principal. **If-Modified-Since** + Last-Modified = fallback.
5. **304 Not Modified** economise 95-99% de la bande passante car il n'y a pas de body dans la reponse.
6. **Combiner hash-dans-le-nom (immutable) et ETag (revalidation)** est la strategie optimale pour un site web moderne.

---

## Lab associe

-> `labs/05-etag-et-revalidation.md` — Implementer un serveur avec ETag et observer les 304

---

## Pour aller plus loin

- [MDN — ETag](https://developer.mozilla.org/fr/docs/Web/HTTP/Headers/ETag)
- [MDN — If-None-Match](https://developer.mozilla.org/fr/docs/Web/HTTP/Headers/If-None-Match)
- [MDN — Requetes conditionnelles](https://developer.mozilla.org/fr/docs/Web/HTTP/Conditional_requests)
- [RFC 9110, Section 8.8 — Validators](https://www.rfc-editor.org/rfc/rfc9110#section-8.8)
- [RFC 9110, Section 13 — Conditional Requests](https://www.rfc-editor.org/rfc/rfc9110#section-13)

---

## Si tu es perdu

**Retiens juste ceci :**

1. Le serveur envoie un **ETag** (empreinte) avec la reponse : `ETag: "v1"`
2. La prochaine fois, le client dit : `If-None-Match: "v1"` ("j'ai la version v1, c'est encore bon ?")
3. Si rien n'a change, le serveur repond **304** (sans body = tres rapide)
4. Si ca a change, le serveur repond **200** avec le nouveau contenu et un nouvel ETag

C'est comme montrer ta photocopie au bureau d'information et demander "c'est encore a jour ?". S'ils disent oui, tu repars avec ta photocopie. S'ils disent non, ils t'en donnent une nouvelle.

---

## Exercice pratique — Chrome DevTools

### Objectif

Observer le mecanisme complet de validation conditionnelle dans Chrome DevTools : voir le ETag dans la reponse, le If-None-Match dans la requete suivante, et le status 304 Not Modified. Mesurer les economies de bande passante.

### Etapes

1. **Lancer le serveur lab-04**
   - Ouvre un terminal et lance le serveur de demonstration :
   ```bash
   node labs/lab-04-etag-conditional/solution.js
   ```
   - Le serveur demarre sur `http://localhost:3000`

2. **Premier chargement — Observer le 200 et le ETag**
   - Ouvre Chrome et va sur `http://localhost:3000/api/articles/1`
   - Ouvre DevTools (`F12`) > onglet **Network**
   - Recharge la page (`F5`) pour capturer la requete
   - Clique sur la requete dans la liste
   - Dans **Response Headers**, repere :
     - `ETag: "..."` — c'est l'empreinte du contenu que le serveur envoie
     - `Cache-Control: public, max-age=60` — la reponse est fraiche pendant 60 secondes
     - `Last-Modified: ...` — la date de derniere modification
   - Note la valeur du ETag (par exemple `"a1b2c3d4e5f6g7h8"`)
   - Observe le **Status Code** : `200 OK`
   - Observe la colonne **Size** : une taille en octets (ex: `256 B`) — le body complet a ete transfere

3. **Attendre l'expiration et recharger — Observer le 304 et le If-None-Match**
   - Attends que le `max-age` expire (60 secondes) ou, pour aller plus vite, coche **Disable cache** puis decoche-la (cela vide le cache temporairement)
   - Sinon, pour forcer la revalidation sans attendre : ferme l'onglet, rouvre-le, et recharge
   - Recharge la page (`F5`)
   - Clique sur la nouvelle requete
   - Dans **Request Headers**, repere :
     - `If-None-Match: "a1b2c3d4e5f6g7h8"` — le navigateur envoie le ETag qu'il avait stocke
   - Dans la ligne de statut, observe : `304 Not Modified`
   - Observe la colonne **Size** : la taille est tres petite (seulement les headers, pas de body)

4. **Comparer les economies de bande passante**
   - Dans la colonne **Size**, compare :
     - Premier chargement (200) : taille complete du body (ex: `256 B`)
     - Revalidation (304) : taille tres reduite (ex: `120 B` — seulement les headers)
   - Pour voir la taille exacte transferee, clique sur la requete 304 et regarde l'onglet **Headers** :
     - Il n'y a **pas de section "Response" dans l'onglet Preview/Response** car le body est vide
   - Observe aussi la colonne **Time** : la reponse 304 est plus rapide car le serveur n'a pas eu a serialiser et envoyer le contenu

5. **Modifier la ressource et observer le changement de ETag**
   - Dans un autre onglet ou avec curl, modifie la ressource :
   ```bash
   curl -X PUT -H "Content-Type: application/json" \
     -d '{"title":"Titre modifie"}' \
     http://localhost:3000/api/articles/1
   ```
   - Retourne dans l'onglet Chrome et recharge (`F5`)
   - Observe :
     - Le navigateur envoie toujours `If-None-Match` avec l'ancien ETag
     - Mais cette fois, le serveur repond `200 OK` avec un **nouveau ETag** (car le contenu a change)
     - La colonne **Size** affiche la taille complete du nouveau contenu
   - Verifie que le nouvel ETag dans **Response Headers** est different de l'ancien

6. **Verifier avec la console du serveur**
   - Regarde le terminal ou le serveur tourne
   - Tu devrais voir les logs :
   ```
   [200] Article 1 - Envoi complet (256 octets)    <-- Premier chargement
   [304] Article 1 - ETag match ("a1b2c3d4...")     <-- Revalidation reussie
   [200] Article 1 - Envoi complet (280 octets)    <-- Apres modification
   ```
   - Les lignes 304 confirment que le serveur n'a pas eu besoin d'envoyer le body

### Ce que tu devrais observer

```
Requete 1 (premier chargement) :
  Status: 200 OK
  Response Headers: ETag: "a1b2c3d4e5f6g7h8"
  Size: 256 B (body complet transfere)
  Time: 15ms

Requete 2 (revalidation, contenu inchange) :
  Request Headers: If-None-Match: "a1b2c3d4e5f6g7h8"
  Status: 304 Not Modified
  Size: ~120 B (headers seulement, PAS de body)
  Time: 8ms

Requete 3 (apres modification du contenu) :
  Request Headers: If-None-Match: "a1b2c3d4e5f6g7h8" (ancien ETag)
  Status: 200 OK
  Response Headers: ETag: "x9y8z7w6v5u4t3s2" (NOUVEAU ETag)
  Size: 280 B (nouveau body complet)
  Time: 12ms
```

### Questions de reflexion

- Pourquoi le navigateur envoie-t-il automatiquement le header `If-None-Match` lors du deuxieme chargement ?
- Quelle est l'economie de bande passante entre une reponse 200 et une reponse 304 pour cette ressource ?
- Que se passerait-il si le serveur ne supportait pas les ETags ? (Indice : chaque requete serait un 200 complet)
- Dans quel onglet de DevTools peux-tu confirmer que la reponse 304 n'a **pas de body** ?

---

## Defi

### Implementer un cache intelligent

**Objectif** : Creer un serveur Node.js qui gere correctement les ETags pour une API de taches (todo list).

**Cahier des charges :**

1. `GET /api/todos` retourne la liste des taches avec un ETag
2. `GET /api/todos/:id` retourne une tache specifique avec un ETag
3. `POST /api/todos` cree une tache (l'ETag de la liste change)
4. `PUT /api/todos/:id` modifie une tache (l'ETag de cette tache ET de la liste changent)
5. `DELETE /api/todos/:id` supprime une tache
6. Toutes les requetes GET supportent `If-None-Match` pour la revalidation
7. Le serveur log "304" ou "200" pour chaque requete GET

**Test :**

```bash
# 1. Charger la liste (200)
curl -v http://localhost:3000/api/todos
# Noter le ETag

# 2. Recharger avec le ETag (devrait etre 304)
curl -v -H 'If-None-Match: "<etag>"' http://localhost:3000/api/todos

# 3. Ajouter une tache
curl -X POST -H "Content-Type: application/json" \
  -d '{"title":"Apprendre les ETags"}' \
  http://localhost:3000/api/todos

# 4. Recharger avec l'ancien ETag (devrait etre 200 car la liste a change)
curl -v -H 'If-None-Match: "<ancien-etag>"' http://localhost:3000/api/todos
```

<details>
<summary>Solution</summary>

```javascript
const http = require('node:http');
const crypto = require('node:crypto');

const todos = [
  { id: 1, title: 'Lire le Module 05', done: false },
  { id: 2, title: 'Comprendre les ETags', done: false },
];
let nextId = 3;

function etag(data) {
  const hash = crypto.createHash('md5').update(JSON.stringify(data)).digest('hex').substring(0, 16);
  return `"${hash}"`;
}

function checkETag(req, res, data, cacheControl) {
  const tag = etag(data);
  const ifNoneMatch = req.headers['if-none-match'];
  if (ifNoneMatch && ifNoneMatch === tag) {
    console.log(`[304] ${req.url}`);
    res.writeHead(304, { 'ETag': tag, 'Cache-Control': cacheControl });
    res.end();
    return true;
  }
  return false;
}

const server = http.createServer((req, res) => {
  const { method, url } = req;
  const match = url.match(/^\/api\/todos\/(\d+)$/);
  const json = { 'Content-Type': 'application/json' };

  if (method === 'GET' && url === '/api/todos') {
    if (checkETag(req, res, todos, 'public, max-age=10')) return;
    console.log(`[200] ${url}`);
    const body = JSON.stringify(todos);
    res.writeHead(200, { ...json, 'ETag': etag(todos), 'Cache-Control': 'public, max-age=10' });
    res.end(body);
  }
  else if (method === 'GET' && match) {
    const todo = todos.find(t => t.id === parseInt(match[1]));
    if (!todo) { res.writeHead(404, json); return res.end('{"error":"Not found"}'); }
    if (checkETag(req, res, todo, 'public, max-age=30')) return;
    console.log(`[200] ${url}`);
    res.writeHead(200, { ...json, 'ETag': etag(todo), 'Cache-Control': 'public, max-age=30' });
    res.end(JSON.stringify(todo));
  }
  else if (method === 'POST' && url === '/api/todos') {
    let body = '';
    req.on('data', c => body += c);
    req.on('end', () => {
      const data = JSON.parse(body);
      const todo = { id: nextId++, title: data.title, done: false };
      todos.push(todo);
      res.writeHead(201, { ...json, 'Location': `/api/todos/${todo.id}` });
      res.end(JSON.stringify(todo));
    });
  }
  else if (method === 'PUT' && match) {
    let body = '';
    req.on('data', c => body += c);
    req.on('end', () => {
      const idx = todos.findIndex(t => t.id === parseInt(match[1]));
      if (idx === -1) { res.writeHead(404, json); return res.end('{"error":"Not found"}'); }
      const data = JSON.parse(body);
      todos[idx] = { ...todos[idx], ...data };
      res.writeHead(200, { ...json, 'ETag': etag(todos[idx]) });
      res.end(JSON.stringify(todos[idx]));
    });
  }
  else if (method === 'DELETE' && match) {
    const idx = todos.findIndex(t => t.id === parseInt(match[1]));
    if (idx === -1) { res.writeHead(404, json); return res.end('{"error":"Not found"}'); }
    todos.splice(idx, 1);
    res.writeHead(204);
    res.end();
  }
  else {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('API Todos - Routes: GET/POST /api/todos, GET/PUT/DELETE /api/todos/:id');
  }
});

server.listen(3000, () => console.log('http://localhost:3000'));
```

</details>
