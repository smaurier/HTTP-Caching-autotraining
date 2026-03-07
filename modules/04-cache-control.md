# Module 04 — Cache-Control — Le chef d'orchestre

> **Objectif** : Maitriser completement le header Cache-Control, comprendre le cycle de vie d'une reponse cachee, et savoir choisir la bonne combinaison de directives pour chaque situation.
> **Difficulte** : ⭐⭐ (Intermediaire)

---

## 1. Le cycle de vie d'une reponse cachee

### 1.1 L'analogie du yaourt dans le frigo

Une reponse cachee, c'est comme un yaourt dans ton frigo :

```
ACHAT                PEREMPTION             VERIFICATION
  |                      |                       |
  v                      v                       v
[FRAIS]  ---------->  [PERIME]  ---------->  [ENCORE BON ?]
(fresh)               (stale)                (revalidation)

1. Tu achetes un yaourt (le serveur envoie la reponse)
2. Le yaourt est frais pendant 7 jours (max-age=604800)
3. Apres 7 jours, il est perime (stale)
4. Tu le sens pour verifier s'il est encore bon (revalidation)
   - Encore bon ? Tu le manges (304 Not Modified)
   - Plus bon ? Tu en achetes un nouveau (200 OK + nouveau contenu)
```

### 1.2 Le diagramme complet du cycle de vie

```
                    Le client demande /page.html
                              |
                              v
                   +---------------------+
                   | La ressource est-elle|
                   | dans le cache ?      |
                   +---------------------+
                     |                |
                    NON              OUI
                     |                |
                     v                v
              +----------+   +------------------+
              | Cache    |   | La copie est-elle|
              | MISS     |   | encore fraiche ? |
              +----------+   +------------------+
                     |          |             |
                     |         OUI           NON
                     |          |             |
                     v          v             v
              Requete au   Servir depuis  +------------------+
              serveur      le cache       | REVALIDATION     |
                  |        (pas de        | Envoyer           |
                  |         requete       | If-None-Match     |
                  v         reseau !)     | au serveur        |
              Reponse                     +------------------+
              200 OK                        |             |
                  |                       304 Not       200 OK
                  |                       Modified      (nouvelle version)
                  v                         |             |
              Stocker en                    v             v
              cache                     Utiliser la   Remplacer dans
                                        copie locale  le cache


LEGENDE :
=========
Fresh (frais)  = max-age pas encore expire
Stale (perime) = max-age expire, mais la copie existe encore
Revalidation   = demander au serveur si la copie stale est encore bonne
```

### 1.3 Les trois etats d'une reponse cachee

| Etat        | Condition                        | Action du cache                          |
|-------------|----------------------------------|------------------------------------------|
| **Fresh**   | Age < max-age                    | Servir directement, SANS requete reseau  |
| **Stale**   | Age >= max-age                   | Revalider aupres du serveur              |
| **Absent**  | Pas dans le cache                | Requete complete au serveur              |

```javascript
// Exemple : observer l'age d'une reponse
const http = require('node:http');

const CONTENT = '<html><body><h1>Page cachee</h1></body></html>';
const START = Date.now();

const server = http.createServer((req, res) => {
  const age = Math.floor((Date.now() - START) / 1000);  // Secondes depuis le demarrage

  console.log(`Requete recue a t+${age}s`);

  res.writeHead(200, {
    'Content-Type': 'text/html',
    'Cache-Control': 'max-age=10',    // Frais pendant 10 secondes
    'Date': new Date().toUTCString(), // Horodatage de la reponse
  });
  res.end(CONTENT);
});

server.listen(3000, () => {
  console.log('http://localhost:3000');
  console.log('La reponse est fraiche pendant 10 secondes.');
  console.log('Apres 10s, le navigateur revalidera.');
});
```

---

## 2. Les directives Cache-Control

### 2.1 Vue d'ensemble

Cache-Control est un header qui accepte une ou plusieurs **directives** separees par des virgules :

```
Cache-Control: public, max-age=3600, must-revalidate
               ^^^^^^  ^^^^^^^^^^^   ^^^^^^^^^^^^^^^^^
               Directive 1          Directive 2        Directive 3
```

### 2.2 Tableau complet des directives

**Directives de REPONSE (serveur -> client) :**

| Directive            | Valeur    | Description                                                |
|----------------------|-----------|------------------------------------------------------------|
| `max-age`            | secondes  | Duree de fraicheur (ex: `max-age=3600` = 1 heure)         |
| `s-maxage`           | secondes  | Comme max-age mais UNIQUEMENT pour les caches partages     |
| `no-cache`           | -         | Le cache DOIT revalider a chaque utilisation               |
| `no-store`           | -         | Ne RIEN stocker dans aucun cache                           |
| `public`             | -         | Tout le monde peut cacher (y compris CDN, proxies)         |
| `private`            | -         | Seul le navigateur peut cacher (pas CDN, pas proxy)        |
| `immutable`          | -         | Le contenu ne changera JAMAIS (pas de revalidation)        |
| `must-revalidate`    | -         | Une fois stale, INTERDICTION de servir sans revalider      |
| `proxy-revalidate`   | -         | Comme must-revalidate mais uniquement pour les proxies     |
| `no-transform`       | -         | Interdire aux proxies de modifier le contenu               |
| `stale-while-revalidate` | secondes | Servir stale pendant la revalidation en arriere-plan  |
| `stale-if-error`     | secondes  | Servir stale si le serveur est en panne                    |

**Directives de REQUETE (client -> serveur) :**

| Directive            | Valeur    | Description                                                |
|----------------------|-----------|------------------------------------------------------------|
| `max-age`            | secondes  | "Je n'accepte pas de reponse plus vieille que X secondes"  |
| `max-stale`          | secondes  | "J'accepte une reponse perimee depuis au plus X secondes"  |
| `min-fresh`          | secondes  | "Je veux une reponse fraiche pendant encore au moins X s"  |
| `no-cache`           | -         | "Ne me sers pas du cache sans revalider"                   |
| `no-store`           | -         | "Ne stocke rien"                                           |
| `no-transform`       | -         | "Ne modifie pas le contenu"                                |
| `only-if-cached`     | -         | "Ne me reponds QUE si tu as une copie en cache"            |

---

## 3. Les directives en detail

### 3.1 max-age — La date de peremption

```
Cache-Control: max-age=3600
```

Signifie : "Cette reponse est fraiche pendant **3600 secondes** (1 heure) a partir de maintenant."

```
Temps:   0s         1800s        3600s        5400s
         |           |            |            |
         v           v            v            v
       [FRAIS]---->[FRAIS]---->[STALE]---->[STALE]
       Reponse     30 min plus  1h plus     1h30 plus
       recue       tard:        tard:       tard:
                   toujours     doit        servira
                   du cache     revalider   stale si
                                            autorise
```

**Valeurs courantes :**

| Scenario                     | max-age       | Duree        |
|------------------------------|---------------|--------------|
| Donnees temps-reel (bourse)  | `max-age=0`   | 0 seconde    |
| Page d'accueil dynamique     | `max-age=60`  | 1 minute     |
| Page de blog                 | `max-age=3600`| 1 heure      |
| Image de profil              | `max-age=86400`| 1 jour      |
| Feuille de style avec hash   | `max-age=31536000` | 1 an   |
| Fichier JS avec hash         | `max-age=31536000` | 1 an   |

### 3.2 s-maxage — Pour les caches partages uniquement

```
Cache-Control: public, max-age=60, s-maxage=3600
```

Signifie :
- Le **navigateur** cache pendant 60 secondes (max-age)
- Le **CDN/proxy** cache pendant 3600 secondes (s-maxage)

```
NAVIGATEUR                CDN                    SERVEUR
    |                      |                        |
    | GET /page.html       |                        |
    | -------------------> |                        |
    |                      | Cache MISS             |
    |                      | GET /page.html         |
    |                      | ---------------------->|
    |                      |                        |
    |                      | <-- 200 OK             |
    |                      | Cache-Control:         |
    |                      | max-age=60,            |
    |                      | s-maxage=3600          |
    |                      |                        |
    | <-- 200 OK           | Stocke pour 3600s     |
    | Cache pour 60s       |                        |
    |                      |                        |
    |                      |                        |
    | (apres 60s, le navigateur revalide)            |
    | GET /page.html       |                        |
    | -------------------> |                        |
    |                      | Cache HIT (s-maxage    |
    |                      | pas encore expire)     |
    | <-- 200 OK (du CDN)  |                        |
    |                      | (pas de requete au     |
    |                      |  serveur d'origine !)  |
```

**Pourquoi ?** Tu veux que les utilisateurs voient des donnees recentes (max-age court) mais tu ne veux pas que le CDN bombarder ton serveur (s-maxage long).

### 3.3 no-cache vs no-store — LA confusion la plus courante

C'est **LE** piege numero 1 de Cache-Control. Les noms sont trompeurs.

```
+------------------------------------------------------------------+
|                                                                  |
|  no-cache =/= "ne pas cacher" !!!                                |
|                                                                  |
|  no-cache = "Tu PEUX stocker, mais tu DOIS REVALIDER             |
|              aupres du serveur AVANT chaque utilisation."         |
|                                                                  |
|  no-store = "Ne RIEN stocker. Jamais. Nulle part."               |
|                                                                  |
+------------------------------------------------------------------+
```

**Analogie** :
- `no-cache` : Tu gardes la photocopie dans ton tiroir, mais avant de l'utiliser, tu appelles l'auteur pour confirmer qu'elle est encore a jour.
- `no-store` : Tu ne fais meme pas de photocopie. Chaque fois que tu en as besoin, tu vas chercher l'original.

```
no-cache : STOCKE + REVALIDE TOUJOURS
=======================================

Requete 1:
  Client --> Serveur: GET /data
  Serveur --> Client: 200 OK, Cache-Control: no-cache, ETag: "v1"
  Client stocke en cache avec ETag "v1"

Requete 2:
  Client --> Serveur: GET /data, If-None-Match: "v1"
  Serveur verifie... "v1" est toujours valide !
  Serveur --> Client: 304 Not Modified  (petite reponse, ~200 octets)
  Client utilise sa copie locale

Requete 3:
  Client --> Serveur: GET /data, If-None-Match: "v1"
  Serveur verifie... la donnee a change ! C'est maintenant "v2".
  Serveur --> Client: 200 OK, ETag: "v2"  (nouvelle donnee complete)
  Client met a jour son cache


no-store : RIEN N'EST STOCKE
==============================

Requete 1:
  Client --> Serveur: GET /data
  Serveur --> Client: 200 OK, Cache-Control: no-store
  Client affiche les donnees mais NE STOCKE RIEN

Requete 2:
  Client --> Serveur: GET /data  (PAS de If-None-Match, rien en cache)
  Serveur --> Client: 200 OK  (reponse complete CHAQUE FOIS)

Requete 3:
  Client --> Serveur: GET /data  (toujours la reponse complete)
  Serveur --> Client: 200 OK
```

```javascript
// Comparaison no-cache vs no-store en Node.js
const http = require('node:http');
const crypto = require('node:crypto');

let data = { value: 'initial', version: 1 };

const server = http.createServer((req, res) => {
  const etag = `"v${data.version}"`;

  if (req.url === '/no-cache') {
    // --- no-cache : stocke mais revalide toujours ---
    const clientETag = req.headers['if-none-match'];
    if (clientETag === etag) {
      console.log('/no-cache : 304 (revalidation reussie, pas de body)');
      res.writeHead(304, { 'ETag': etag, 'Cache-Control': 'no-cache' });
      return res.end();
    }
    console.log('/no-cache : 200 (envoi du body complet)');
    res.writeHead(200, {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-cache',       // STOCKE mais REVALIDE
      'ETag': etag,
    });
    res.end(JSON.stringify(data));
  }
  else if (req.url === '/no-store') {
    // --- no-store : rien n'est stocke ---
    console.log('/no-store : 200 (envoi TOUJOURS le body complet)');
    res.writeHead(200, {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',        // RIEN n'est stocke
      // Pas de ETag : inutile car le client ne stocke rien
    });
    res.end(JSON.stringify(data));
  }
  else if (req.url === '/update') {
    // --- Met a jour les donnees (pour tester) ---
    data.version++;
    data.value = `updated-${data.version}`;
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end(`Donnees mises a jour : version ${data.version}`);
  }
  else {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('Essaie /no-cache, /no-store ou /update');
  }
});

server.listen(3000, () => {
  console.log('http://localhost:3000');
  console.log('Compare le comportement de /no-cache et /no-store');
});
```

### 3.4 public vs private

```
Cache-Control: public       # Tout le monde peut cacher (CDN, proxy, navigateur)
Cache-Control: private      # SEUL le navigateur peut cacher
```

```
PUBLIC :
========
          Navigateur         CDN/Proxy          Serveur
              |                  |                  |
  Cache OUI  [X]    Cache OUI  [X]                 |
              |                  |                  |

La meme reponse peut etre partagee entre TOUS les utilisateurs.
Ideal pour : images, CSS, JS, pages publiques.


PRIVATE :
=========
          Navigateur         CDN/Proxy          Serveur
              |                  |                  |
  Cache OUI  [X]    Cache NON  [ ]                 |
              |                  |                  |

La reponse est specifique a UN utilisateur.
Ideal pour : tableaux de bord, profils, paniers d'achat.
```

**Pourquoi c'est important ?** Si ta page contient des infos personnelles (nom, email, solde bancaire) et que tu mets `public`, un CDN pourrait la cacher et la servir a un AUTRE utilisateur. `private` empeche ca.

### 3.5 immutable — "Ca ne changera JAMAIS"

```
Cache-Control: public, max-age=31536000, immutable
```

Signifie : "Ce fichier ne sera JAMAIS modifie. Meme si l'utilisateur recharge la page, n'envoie PAS de requete de revalidation."

```
SANS immutable :
=================
L'utilisateur appuie sur F5 (rechargement)
Le navigateur envoie une requete conditionnelle meme si max-age n'a pas expire :
  GET /app.abc123.js
  If-None-Match: "v1"
  --> Le serveur repond 304 Not Modified
  --> Requete inutile ! (mais elle a quand meme coute 1 RTT)

AVEC immutable :
=================
L'utilisateur appuie sur F5
Le navigateur NE FAIT PAS de requete. Le fichier est immutable.
  --> 0 requete reseau. Instantane.
```

**Quand utiliser immutable ?** Uniquement pour les fichiers dont le nom contient un hash de contenu :

```
/assets/app.a1b2c3d4.js     <-- Le hash change si le contenu change
/assets/style.x9y8z7w6.css  <-- Meme chose
/images/logo.v2.png          <-- Version dans le nom

Ces fichiers sont des candidats PARFAITS pour immutable car :
- Si le contenu change, l'URL change (nouveau hash)
- Donc l'ancienne URL ne sera jamais re-demandee
- Le cache de l'ancienne URL expirera naturellement
```

### 3.6 must-revalidate et proxy-revalidate

```
Cache-Control: max-age=3600, must-revalidate
```

Signifie : "Frais pendant 1 heure. Apres ca, tu DOIS revalider. Si tu ne peux pas joindre le serveur, renvoie une erreur 504, mais ne sers PAS la copie perimee."

```
SANS must-revalidate :
=======================
La reponse a expire (stale).
Le serveur est injoignable.
Le cache PEUT servir la copie stale.
Utilisateur recoit : vieilles donnees (mais quelque chose)

AVEC must-revalidate :
=======================
La reponse a expire (stale).
Le serveur est injoignable.
Le cache REFUSE de servir la copie stale.
Utilisateur recoit : Erreur 504 Gateway Timeout
```

**Pourquoi ?** Pour les donnees sensibles ou reglementaires (donnees bancaires, medicales), il vaut mieux afficher une erreur que des donnees potentiellement obsoletes.

`proxy-revalidate` est identique mais ne s'applique qu'aux caches partages (CDN, proxies), pas au navigateur.

### 3.7 stale-while-revalidate et stale-if-error

```
Cache-Control: max-age=60, stale-while-revalidate=30, stale-if-error=86400
```

**stale-while-revalidate** : "Apres expiration, sers la copie stale immediatement ET revalide en arriere-plan."

```
SANS stale-while-revalidate :
==============================
t=0s    : Reponse stockee, max-age=60
t=61s   : Cache stale. Client attend la revalidation...
           [Client] --> [Serveur] : If-None-Match...
           [Client] <-- [Serveur] : 304 (apres 100ms)
           Client recoit la reponse apres 100ms d'attente.

AVEC stale-while-revalidate=30 :
==================================
t=0s    : Reponse stockee, max-age=60
t=61s   : Cache stale MAIS dans la fenetre stale-while-revalidate (61 < 60+30)
           Client recoit IMMEDIATEMENT la copie stale.
           EN MEME TEMPS, le cache revalide en arriere-plan.
t=61.1s : Le cache a recu la nouvelle version du serveur.
t=62s   : Le prochain client recoit la version fraiche.
t=91s   : Au-dela de 60+30=90s, meme stale-while-revalidate refuse.
           Il faut attendre la revalidation.
```

**stale-if-error** : "Si le serveur est en panne, sers la copie stale pendant X secondes."

```
Cache-Control: max-age=60, stale-if-error=86400

t=0s     : Reponse stockee, max-age=60
t=120s   : Cache stale. Le cache essaie de revalider...
           Le serveur repond 500 Internal Server Error !
           stale-if-error=86400 : on peut servir la copie stale
           pendant 24h en cas d'erreur.
           --> L'utilisateur recoit la derniere version connue.
           --> BEAUCOUP mieux qu'une page d'erreur.
```

---

## 4. Combinaisons courantes

### 4.1 Arbre de decision

```
Quel Cache-Control utiliser ?
==============================

La ressource contient des donnees personnelles ?
  |
  +-- OUI --> private
  |            |
  |            +-- Donnees sensibles (bancaire, medical) ?
  |                 |
  |                 +-- OUI --> private, no-store
  |                 |
  |                 +-- NON --> private, max-age=0, must-revalidate
  |
  +-- NON --> public (ou pas de directive, defaut)
               |
               +-- Le contenu change-t-il ?
                    |
                    +-- JAMAIS (fichier avec hash) --> public, max-age=31536000, immutable
                    |
                    +-- RAREMENT (quelques heures/jours) --> public, max-age=3600
                    |
                    +-- SOUVENT (toutes les minutes) --> public, max-age=60, stale-while-revalidate=30
                    |
                    +-- EN TEMPS REEL --> public, no-cache (ou max-age=0, must-revalidate)
```

### 4.2 Recettes pour chaque type de ressource

```javascript
// server-cache-strategies.js
// Serveur demonstrant les strategies de cache courantes

const http = require('node:http');
const crypto = require('node:crypto');

const server = http.createServer((req, res) => {
  const url = req.url;

  // === 1. ASSETS STATIQUES AVEC HASH ===
  // Fichiers JS/CSS avec un hash dans le nom
  // Strategie : cacher "pour toujours"
  if (url.match(/\.(js|css)\?v=[a-f0-9]+/)) {
    res.writeHead(200, {
      'Content-Type': url.includes('.js') ? 'application/javascript' : 'text/css',
      'Cache-Control': 'public, max-age=31536000, immutable',
      //                 ^^^^^^  ^^^^^^^^^^^^^^^^^  ^^^^^^^^^
      //                 Tout le monde  1 an         Ne jamais revalider
    });
    return res.end('/* contenu du fichier */');
  }

  // === 2. PAGE HTML DYNAMIQUE ===
  // Change souvent, mais on peut tolerer 1 minute de retard
  if (url === '/' || url === '/index.html') {
    const html = `<html><body><h1>Page dynamique</h1><p>${new Date().toISOString()}</p></body></html>`;
    const etag = `"${crypto.createHash('md5').update(html).digest('hex')}"`;

    // Revalidation conditionnelle
    if (req.headers['if-none-match'] === etag) {
      res.writeHead(304, {
        'ETag': etag,
        'Cache-Control': 'public, max-age=60, must-revalidate',
      });
      return res.end();
    }

    res.writeHead(200, {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'public, max-age=60, must-revalidate',
      //                 ^^^^^^  ^^^^^^^^^^  ^^^^^^^^^^^^^^^^
      //                 CDN OK  1 minute    Apres 1 min, DOIT revalider
      'ETag': etag,
    });
    return res.end(html);
  }

  // === 3. API PUBLIQUE ===
  // Donnees qui changent, mais on peut servir du stale
  if (url === '/api/articles') {
    res.writeHead(200, {
      'Content-Type': 'application/json',
      'Cache-Control': 'public, max-age=30, stale-while-revalidate=60, stale-if-error=86400',
      //                                    ^^^^^^^^^^^^^^^^^^^^^^^^^^^  ^^^^^^^^^^^^^^^^^^^
      //                                    Sers stale pendant 60s      Sers stale si erreur
      //                                    en revalidant en fond       pendant 24h
    });
    return res.end(JSON.stringify([{ id: 1, title: 'Article' }]));
  }

  // === 4. API PRIVEE (donnees utilisateur) ===
  // Specifique a l'utilisateur, jamais cache sur CDN
  if (url === '/api/profile') {
    res.writeHead(200, {
      'Content-Type': 'application/json',
      'Cache-Control': 'private, max-age=0, must-revalidate',
      //                 ^^^^^^^  ^^^^^^^^^  ^^^^^^^^^^^^^^^^
      //                 Navigateur   Toujours    Obliger la
      //                 seulement    stale       revalidation
    });
    return res.end(JSON.stringify({ name: 'Alice', email: 'a@test.com' }));
  }

  // === 5. DONNEES SENSIBLES ===
  // Ne JAMAIS cacher (donnees bancaires, mots de passe)
  if (url === '/api/bank/balance') {
    res.writeHead(200, {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
      //                 ^^^^^^^^
      //                 RIEN n'est stocke. Jamais. Nulle part.
      'Pragma': 'no-cache',           // Compatibilite HTTP/1.0
    });
    return res.end(JSON.stringify({ balance: 1234.56 }));
  }

  // === 6. IMAGE PUBLIQUE (change rarement) ===
  if (url.match(/\.(png|jpg|webp)$/)) {
    res.writeHead(200, {
      'Content-Type': 'image/png',
      'Cache-Control': 'public, max-age=86400',
      //                 ^^^^^^  ^^^^^^^^^^^^^
      //                 CDN OK  1 jour
    });
    return res.end('(donnees image)');
  }

  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('Serveur de demonstration Cache-Control');
});

server.listen(3000, () => console.log('http://localhost:3000'));
```

### 4.3 Tableau des combinaisons courantes

| Scenario                          | Cache-Control                                                     |
|-----------------------------------|-------------------------------------------------------------------|
| Asset avec hash (JS, CSS)         | `public, max-age=31536000, immutable`                             |
| Police de caracteres              | `public, max-age=31536000, immutable`                             |
| Image publique                    | `public, max-age=86400`                                           |
| Page HTML publique                | `public, max-age=60, must-revalidate`                             |
| API publique                      | `public, max-age=30, stale-while-revalidate=60`                   |
| API privee (profil)               | `private, max-age=0, must-revalidate`                             |
| Dashboard utilisateur             | `private, no-cache`                                               |
| Donnees sensibles                 | `no-store`                                                        |
| Page derriere CDN + navigateur    | `public, max-age=60, s-maxage=3600`                               |
| Reponse API temps-reel            | `no-cache` (ou `max-age=0, must-revalidate`)                      |

---

## 5. Diagrammes de flux

### 5.1 public, max-age=3600

```
t=0s : Le serveur envoie la reponse
       Cache-Control: public, max-age=3600

NAVIGATEUR                CDN                    SERVEUR
  [Cache: frais]          [Cache: frais]
  Expire dans 3600s       Expire dans 3600s

t=100s : Utilisateur 1 demande la page
  Navigateur: "Mon cache est frais (100 < 3600)" --> Sert du cache
  CDN: pas solicite
  Serveur: pas solicite
  --> 0 requete reseau !

t=100s : Utilisateur 2 (nouveau visiteur) demande la page
  Son navigateur n'a pas de cache
  Navigateur --> CDN: "Mon cache est frais" --> Sert du CDN
  Serveur: pas solicite
  --> 1 requete, mais geree par le CDN

t=4000s : Cache expire partout
  Navigateur --> CDN --> Serveur
  --> Revalidation ou nouvelle reponse
```

### 5.2 private, no-cache

```
t=0s : Le serveur envoie la reponse
       Cache-Control: private, no-cache
       ETag: "user-42-v1"

NAVIGATEUR                CDN                    SERVEUR
  [Cache: stocke]         [INTERDIT]
  Doit revalider          (private = pas de
  a chaque fois           cache partage)

t=10s : L'utilisateur revient sur la page
  Navigateur: "J'ai une copie mais no-cache = je DOIS revalider"
  Navigateur --> Serveur: If-None-Match: "user-42-v1"
  Serveur: "v1 est encore bon"
  Serveur --> Navigateur: 304 Not Modified
  --> 1 requete, mais petite reponse (~200 octets au lieu de ~50 Ko)

t=20s : Les donnees ont change sur le serveur
  Navigateur --> Serveur: If-None-Match: "user-42-v1"
  Serveur: "v1 est obsolete, voici v2"
  Serveur --> Navigateur: 200 OK, ETag: "user-42-v2", (nouveau contenu)
  --> 1 requete avec le contenu complet
```

### 5.3 no-store

```
t=0s : Le serveur envoie la reponse
       Cache-Control: no-store

NAVIGATEUR                CDN                    SERVEUR
  [RIEN]                  [RIEN]

t=10s : L'utilisateur revient sur la page
  Navigateur: "Je n'ai rien en cache"
  Navigateur --> Serveur: GET /api/bank/balance (requete complete)
  Serveur --> Navigateur: 200 OK (reponse complete)
  --> Requete complete a chaque fois. Pas d'optimisation possible.
```

---

## 6. Anti-patterns et erreurs courantes

### 6.1 Anti-pattern #1 : Confondre no-cache et no-store

```
MAUVAIS :
  Cache-Control: no-cache
  "Je ne veux pas que ce soit cache !"
  --> ERREUR : no-cache stocke ET revalide. La donnee est en cache.

BON :
  Cache-Control: no-store
  "Je ne veux vraiment pas que ce soit stocke."
  --> CORRECT : rien n'est stocke.
```

### 6.2 Anti-pattern #2 : max-age sur des assets sans hash

```
MAUVAIS :
  /style.css --> Cache-Control: max-age=31536000

  Probleme : tu modifies style.css mais l'URL ne change pas.
  Les utilisateurs verront l'ancienne version pendant 1 AN.
  Tu ne peux pas "forcer" l'expiration du cache.

BON :
  /style.a1b2c3.css --> Cache-Control: max-age=31536000, immutable

  Si tu modifies le CSS, le hash change et l'URL aussi :
  /style.d4e5f6.css --> Nouvelle URL = pas de cache hit = nouvelle version
```

### 6.3 Anti-pattern #3 : Oublier Vary avec public

```
MAUVAIS :
  Cache-Control: public, max-age=3600
  (sans Vary: Accept-Encoding)

  Le CDN cache la version gzip.
  Un vieux client sans gzip recoit... du gzip qu'il ne comprend pas.

BON :
  Cache-Control: public, max-age=3600
  Vary: Accept-Encoding
```

### 6.4 Anti-pattern #4 : private + s-maxage

```
MAUVAIS :
  Cache-Control: private, s-maxage=3600

  Contradiction ! private dit "pas de cache partage"
  mais s-maxage est POUR les caches partages.
  s-maxage sera ignore.

BON :
  Cache-Control: private, max-age=3600
  OU
  Cache-Control: public, s-maxage=3600, max-age=60
```

### 6.5 Anti-pattern #5 : Le "ceinture ET bretelles" inutile

```
EXCESSIF :
  Cache-Control: no-store, no-cache, max-age=0, must-revalidate, private
  Expires: 0
  Pragma: no-cache

  no-store rend tout le reste inutile.
  C'est du code defensif qui revele une incomprehension.

SUFFISANT :
  Cache-Control: no-store

  C'est tout. no-store signifie "ne stocke rien", point.
  (Ajouter Pragma: no-cache pour la compatibilite HTTP/1.0 est acceptable)
```

---

## 7. Le header Expires (legacy)

### 7.1 Pourquoi Expires est desuet

```
# Expires utilise une date absolue :
Expires: Thu, 14 Mar 2026 12:00:00 GMT

# Cache-Control utilise une duree relative :
Cache-Control: max-age=604800

Probleme d'Expires :
- Si l'horloge du client est decalee, le calcul est faux
- Le format de date est strict et facile a mal ecrire
- max-age est PRIORITAIRE sur Expires (si les deux sont presents)
```

**Regle simple** : Utilise toujours `Cache-Control: max-age` a la place de `Expires`. Si tu vois encore `Expires`, c'est pour la compatibilite avec de tres vieux clients HTTP/1.0.

---

## Points cles

1. **Le cycle de vie** : Fresh (frais) -> Stale (perime) -> Revalidation (verification).
2. **max-age** definit la duree de fraicheur en secondes. **s-maxage** est pour les caches partages (CDN).
3. **no-cache** = stocke mais revalide toujours. **no-store** = ne stocke rien. C'est la confusion la plus frequente.
4. **public** = tout le monde peut cacher. **private** = navigateur seulement. Important pour les donnees utilisateur.
5. **immutable** = jamais de revalidation. Uniquement pour les fichiers avec un hash dans le nom.
6. **stale-while-revalidate** et **stale-if-error** ameliorent la performance et la resilience.
7. **Expires** est obsolete. Preferer **max-age**.

---

## Lab associe

-> `labs/04-strategies-cache-control.md` — Configurer Cache-Control pour differents types de ressources

---

## Pour aller plus loin

- [MDN — Cache-Control](https://developer.mozilla.org/fr/docs/Web/HTTP/Headers/Cache-Control)
- [web.dev — HTTP Cache](https://web.dev/articles/http-cache)
- [RFC 9111 — HTTP Caching](https://www.rfc-editor.org/rfc/rfc9111)
- [Jake Archibald — Caching best practices](https://jakearchibald.com/2016/caching-best-practices/)
- [Cloudflare — Cache-Control](https://developers.cloudflare.com/cache/concepts/cache-control/)

---

## Si tu es perdu

**Retiens juste quatre combinaisons :**

1. **Fichier statique avec hash** (app.abc123.js) : `public, max-age=31536000, immutable` --> Cache 1 an, ne change jamais.
2. **Page HTML dynamique** : `public, no-cache` --> Toujours revalider avant d'afficher.
3. **Donnees privees** (profil utilisateur) : `private, no-cache` --> Seulement dans le navigateur, toujours revalider.
4. **Donnees sensibles** (bancaire) : `no-store` --> Ne jamais stocker nulle part.

Avec ces 4 recettes, tu couvres 90% des cas.

---

## Exercice pratique — Chrome DevTools

### Objectif

Observer le comportement de Cache-Control dans Chrome DevTools en utilisant le serveur du lab-03. Comprendre la difference entre hard refresh et refresh normal, le role de "Disable cache", et la distinction entre memory cache et disk cache.

### Etapes

1. **Lancer le serveur lab-03**
   - Ouvre un terminal et lance le serveur de demonstration :
   ```bash
   node labs/lab-03-cache-control-lab/solution.js
   ```
   - Le serveur demarre sur `http://localhost:3000`

2. **Premier chargement — Observer les headers Cache-Control**
   - Ouvre Chrome et va sur `http://localhost:3000`
   - Ouvre DevTools (`F12`) > onglet **Network**
   - Recharge la page (`F5`)
   - Clique sur chaque requete et examine les **Response Headers** :
     - Repere le header `Cache-Control` sur chaque ressource
     - Note les differentes valeurs : `max-age=...`, `no-cache`, `no-store`, `public`, `private`, `immutable`
   - Observe la colonne **Size** : toutes les ressources affichent une taille en octets (premier chargement, pas de cache)

3. **Refresh normal (F5) — Observer le cache en action**
   - Appuie sur `F5` pour recharger normalement
   - Observe la colonne **Size** dans la liste des requetes :
     - Les ressources avec `max-age` eleve apparaissent comme `(from memory cache)` ou `(from disk cache)`
     - Les ressources avec `no-cache` montrent un status `304 Not Modified` (si ETag present)
     - Les ressources avec `no-store` sont toujours telechargees depuis le reseau
   - Observe la colonne **Time** : les ressources en cache affichent `0 ms` ou quelques millisecondes

4. **Hard refresh (Ctrl+Shift+R) — Contourner le cache**
   - Appuie sur `Ctrl+Shift+R` (Windows/Linux) ou `Cmd+Shift+R` (Mac)
   - Observe que **toutes** les ressources sont telechargees depuis le reseau
   - Le navigateur envoie un header de requete `Cache-Control: no-cache` qui force le serveur a renvoyer le contenu complet
   - Compare les temps de chargement : le hard refresh est plus lent que le refresh normal

5. **"Disable cache" — Le mode sans cache de DevTools**
   - Coche la case **Disable cache** en haut de l'onglet Network
   - Recharge la page avec `F5`
   - Observe que meme les ressources avec `max-age=31536000` sont re-telechargees
   - **Important** : "Disable cache" ne fonctionne que quand DevTools est ouvert. Decoche-la quand tu as fini de debugger.
   - Decoche **Disable cache** pour les etapes suivantes

6. **Observer memory cache vs disk cache**
   - Ferme l'onglet de la page (mais garde DevTools ouvert dans un autre onglet)
   - Rouvre `http://localhost:3000` dans un nouvel onglet
   - Observe la colonne **Size** :
     - `(from disk cache)` — la ressource etait sur le disque dur (persiste entre les onglets/sessions)
   - Sans fermer l'onglet, recharge avec `F5` :
     - Certaines ressources passent de `(from disk cache)` a `(from memory cache)` — elles sont maintenant en RAM, encore plus rapide
   - Regle a retenir :
     - **memory cache** : lie a l'onglet ouvert, ultra-rapide (~0 ms), disparait quand l'onglet est ferme
     - **disk cache** : persiste sur le disque, rapide (~5 ms), survit a la fermeture du navigateur

7. **Observer le decompte du max-age**
   - Clique sur une ressource avec `max-age=60` (par exemple)
   - Dans les **Response Headers**, note la valeur du header `Date` (date de la reponse originale)
   - Recharge apres quelques secondes : si le `max-age` n'est pas expire, la ressource est servie depuis le cache
   - Attends que le `max-age` expire, puis recharge : le navigateur envoie une nouvelle requete au serveur
   - Tu peux voir le header de requete `If-None-Match` apparaitre quand le cache est expire (revalidation)

### Ce que tu devrais observer

```
Premier chargement :
  style.css      200    15.2 kB      120ms    (telechargement reseau)
  app.js         200    45.0 kB      150ms    (telechargement reseau)

Refresh normal (F5) — dans les 60 secondes :
  style.css      200    (disk cache)  0ms     Cache HIT
  app.js         200    (memory cache) 0ms    Cache HIT (RAM)

Hard refresh (Ctrl+Shift+R) :
  style.css      200    15.2 kB      110ms    (force le re-telechargement)
  app.js         200    45.0 kB      140ms    (force le re-telechargement)

Apres expiration du max-age :
  style.css      304    (taille headers)  45ms  Revalidation reussie
```

### Questions de reflexion

- Pourquoi les ressources avec `no-store` sont-elles toujours telechargees, meme lors d'un refresh normal ?
- Quelle est la difference pratique entre `(from memory cache)` et `(from disk cache)` pour l'utilisateur ?
- Pourquoi "Disable cache" est-il utile pendant le developpement, mais dangereux a laisser active en production-test ?
- Apres expiration du `max-age`, pourquoi le navigateur envoie-t-il un `304` plutot qu'un `200` complet ?

---

## Defi

### Le jeu des combinaisons

**Objectif** : Pour chaque scenario ci-dessous, trouve la combinaison Cache-Control optimale.

**Scenarios :**

1. Un fichier JavaScript `vendor.8f3a2b.js` (librairies tierces, hash dans le nom)
2. La page d'accueil `index.html` d'un site d'actualites (change toutes les 5 minutes)
3. L'endpoint `/api/me` qui renvoie le profil de l'utilisateur connecte
4. Un fichier PDF de facture accessible uniquement par l'utilisateur concerne
5. L'endpoint `/api/stock-price` qui renvoie le prix d'une action en temps reel
6. Une image de fond `/bg-pattern.png` utilisee sur toutes les pages (change rarement)
7. L'endpoint `/api/feed` d'un reseau social, qui doit rester disponible meme si le serveur tombe

<details>
<summary>Reponses</summary>

1. **vendor.8f3a2b.js** : `public, max-age=31536000, immutable`
   Le hash change si le contenu change, donc on peut cacher agressivement.

2. **index.html** : `public, max-age=300, must-revalidate` ou `public, s-maxage=300, max-age=60`
   5 minutes de fraicheur, revalidation obligatoire apres.

3. **/api/me** : `private, no-cache`
   Donnees specifiques a l'utilisateur, toujours revalider.

4. **Facture PDF** : `private, no-store` ou `private, max-age=0, must-revalidate`
   Donnees confidentielles, soit ne pas stocker, soit revalider strictement.

5. **/api/stock-price** : `no-store` ou `max-age=0, must-revalidate`
   Donnees temps-reel, toute version en cache est potentiellement trompeuse.

6. **bg-pattern.png** : `public, max-age=86400` (1 jour)
   Change rarement, mais comme il n'y a pas de hash dans le nom, on ne peut pas mettre 1 an.

7. **/api/feed** : `public, max-age=60, stale-while-revalidate=30, stale-if-error=86400`
   Frais 1 minute, peut servir stale pendant revalidation, et si le serveur tombe, servir stale pendant 24h.

</details>
