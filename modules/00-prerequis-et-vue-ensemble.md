# Module 00 — Prerequis & Vue d'ensemble

> **Objectif** : Comprendre les fondations du protocole HTTP, savoir pourquoi le caching existe, et preparer son environnement de travail.
> **Difficulte** : ⭐ (Debutant)

---

## 1. Qu'est-ce que HTTP ?

### 1.1 L'analogie du courrier postal

Imaginons que tu veuilles envoyer une lettre a un ami dans une autre ville.

```
TOI (expediteur)                          TON AMI (destinataire)
     |                                           |
     |  1. Tu ecris une lettre                   |
     |  2. Tu mets l'adresse sur l'enveloppe     |
     |  3. Tu la deposes a la poste               |
     |                                           |
     |   -----> [Bureau de poste local] ---->    |
     |          [Centre de tri]                  |
     |          [Bureau de poste distant] ---->  |
     |                                           |
     |  4. Ton ami recoit la lettre              |
     |  5. Il lit le contenu                     |
     |  6. Il ecrit une reponse                  |
     |                                           |
     |   <---- [Chemin inverse] <-----------     |
     |                                           |
     |  7. Tu recois la reponse                  |
```

**HTTP fonctionne exactement comme ca** :

| Courrier postal        | HTTP                              |
|------------------------|-----------------------------------|
| Toi (expediteur)       | Le navigateur (client)            |
| Ton ami (destinataire) | Le serveur web                    |
| L'adresse              | L'URL (`https://example.com`)     |
| Le contenu de la lettre| Le body de la requete/reponse     |
| L'enveloppe            | Les headers HTTP                  |
| La poste               | Internet (routeurs, DNS, etc.)    |
| Le type de lettre      | La methode HTTP (GET, POST, etc.) |

### 1.2 Definition formelle

**HTTP** (HyperText Transfer Protocol) est un protocole de communication **client-serveur** qui fonctionne sur le modele **requete-reponse**.

```
Client (navigateur)              Serveur (ex: nginx, Node.js)
        |                                |
        |  --- Requete HTTP ---------->  |
        |  GET /index.html HTTP/1.1      |
        |  Host: example.com             |
        |                                |
        |  <-- Reponse HTTP -----------  |
        |  HTTP/1.1 200 OK               |
        |  Content-Type: text/html       |
        |  <html>...</html>              |
        |                                |
```

**Pourquoi c'est important ?** Chaque page web, chaque image, chaque fichier CSS que tu consultes passe par HTTP. Comprendre HTTP, c'est comprendre le coeur du web.

### 1.3 Les caracteristiques fondamentales

HTTP possede trois proprietes essentielles :

1. **Sans etat (stateless)** : Chaque requete est independante. Le serveur ne "se souvient" pas des requetes precedentes. C'est comme si a chaque lettre, tu devais re-ecrire ton adresse de retour.

2. **Base sur du texte** : Les messages HTTP sont lisibles par un humain (contrairement a des protocoles binaires). Tu peux lire une requete HTTP comme tu lis une lettre.

3. **Extensible** : On peut ajouter des headers personnalises. C'est comme ajouter des post-it sur l'enveloppe avec des instructions supplementaires.

```
# Exemple d'une requete HTTP brute, lisible par un humain
GET /api/users HTTP/1.1          # Methode + chemin + version
Host: api.example.com            # Adresse du serveur
Accept: application/json         # "Je veux du JSON en reponse"
Authorization: Bearer abc123     # "Voici mon badge d'acces"
```

---

## 2. Pourquoi le caching ?

### 2.1 La latence est l'ennemi numero 1

Imagine que tu demandes un livre a la bibliotheque municipale (le serveur). Le trajet prend 30 minutes aller-retour. Si tu as besoin du meme livre 5 fois dans la journee, tu fais 5 allers-retours de 30 minutes chacun. **2h30 perdues.**

Maintenant, imagine que tu gardes une copie du livre sur ton bureau (le cache). Les 4 prochaines fois, tu prends le livre directement sur ton bureau. **Temps : quasi zero.**

```
SANS CACHE (5 requetes identiques)
==================================

Requete 1: Navigateur ---> Serveur ---> Navigateur  (200ms)
Requete 2: Navigateur ---> Serveur ---> Navigateur  (200ms)
Requete 3: Navigateur ---> Serveur ---> Navigateur  (200ms)
Requete 4: Navigateur ---> Serveur ---> Navigateur  (200ms)
Requete 5: Navigateur ---> Serveur ---> Navigateur  (200ms)
                                            Total:  1000ms


AVEC CACHE (5 requetes identiques)
===================================

Requete 1: Navigateur ---> Serveur ---> Navigateur  (200ms)
             |                                |
             +--- Stocke en cache <-----------+
Requete 2: Navigateur ---> Cache local               (1ms)
Requete 3: Navigateur ---> Cache local               (1ms)
Requete 4: Navigateur ---> Cache local               (1ms)
Requete 5: Navigateur ---> Cache local               (1ms)
                                            Total:   204ms

Gain : ~80% plus rapide !
```

### 2.2 Les chiffres qui font mal

Voici les latences typiques pour differentes operations :

| Operation                        | Latence typique |
|----------------------------------|-----------------|
| Lire depuis le cache memoire     | ~1 ms           |
| Lire depuis le cache disque      | ~5 ms           |
| Requete sur le reseau local      | ~10 ms          |
| Requete vers un CDN proche       | ~30 ms          |
| Requete vers un serveur distant  | ~100-300 ms     |
| Requete vers un serveur lent     | ~500-2000 ms    |

**Pourquoi ca compte ?**

- Google a montre qu'un delai de **100ms** supplementaires fait perdre **1% de revenus**.
- Amazon estime que **chaque 100ms** de latence en plus coute **1% de ventes**.
- 53% des utilisateurs mobiles quittent un site qui met plus de **3 secondes** a charger.

### 2.3 Les differents niveaux de cache

Le caching n'existe pas qu'a un seul endroit. Il y a toute une hierarchie :

```
UTILISATEUR
    |
    v
+-------------------+
| Cache navigateur  |  <-- Le plus proche de l'utilisateur
| (memoire/disque)  |      Temps d'acces : ~1ms
+-------------------+
    |
    v
+-------------------+
| Cache proxy local |  <-- Proxy d'entreprise, cache du FAI
| (ex: Squid)       |      Temps d'acces : ~10ms
+-------------------+
    |
    v
+-------------------+
| CDN               |  <-- Reseau mondial de serveurs
| (ex: Cloudflare)  |      Temps d'acces : ~30ms
+-------------------+
    |
    v
+-------------------+
| Cache serveur     |  <-- Redis, Memcached, Varnish
| (reverse proxy)   |      Temps d'acces : ~50ms
+-------------------+
    |
    v
+-------------------+
| Serveur d'origine |  <-- Le "vrai" serveur
| (ex: Node.js)     |      Temps d'acces : ~100-500ms
+-------------------+
    |
    v
+-------------------+
| Base de donnees   |  <-- Source de verite
+-------------------+
```

**Analogie du restaurant** : Le cache navigateur, c'est comme avoir les ingredients deja sur ton plan de travail. Le CDN, c'est comme un entrepot regional. Le serveur d'origine, c'est l'usine de production. Plus c'est proche de toi, plus c'est rapide.

---

## 3. Modele mental : le trajet d'une requete

### 3.1 Le voyage complet d'une requete HTTP

Quand tu tapes `https://www.example.com/page.html` dans ton navigateur, voici ce qui se passe :

```
ETAPE 1 : Resolution DNS
=========================
Navigateur: "Quelle est l'adresse IP de www.example.com ?"

  Navigateur --> Cache DNS local
                   |
                   +--> Pas en cache ? --> Serveur DNS du FAI
                                              |
                                              +--> Pas la ? --> Serveur DNS racine
                                                                    |
                                                                    v
                                                   Reponse: 93.184.216.34


ETAPE 2 : Connexion TCP
========================
Navigateur --> SYN --> Serveur (93.184.216.34:443)
Navigateur <-- SYN-ACK <-- Serveur
Navigateur --> ACK --> Serveur
(3-way handshake : comme se serrer la main avant de parler)


ETAPE 3 : Handshake TLS (pour HTTPS)
=====================================
Navigateur <--> Serveur : Echange de certificats et cles
(Comme verifier la carte d'identite avant d'echanger des secrets)


ETAPE 4 : Envoi de la requete HTTP
====================================
GET /page.html HTTP/1.1
Host: www.example.com
Accept: text/html
Accept-Encoding: gzip, deflate, br
If-None-Match: "abc123"        <-- "J'ai deja la version abc123"


ETAPE 5 : Traitement cote serveur
===================================
Serveur: "Hmm, la version abc123 est toujours valide"
         OU
         "La page a change, voici la nouvelle version"


ETAPE 6 : Reponse HTTP
========================
HTTP/1.1 304 Not Modified       <-- "Ta copie est encore bonne"
ETag: "abc123"
Cache-Control: max-age=3600

OU

HTTP/1.1 200 OK                 <-- "Voici la nouvelle version"
ETag: "def456"
Cache-Control: max-age=3600
Content-Type: text/html
Content-Length: 4521

<!DOCTYPE html>...


ETAPE 7 : Le navigateur affiche la page
=========================================
Et stocke la reponse dans son cache pour la prochaine fois !
```

### 3.2 Ou le cache intervient

A chaque etape, le cache peut court-circuiter le processus :

```
Tu tapes l'URL
     |
     v
[Cache navigateur a une copie fraiche ?]
     |                    |
    OUI                  NON
     |                    |
     v                    v
  Afficher          [Envoyer la requete au serveur]
  directement            |
  (0 requete             v
   reseau !)       [Serveur : la ressource a change ?]
                         |                    |
                        NON                  OUI
                         |                    |
                         v                    v
                   304 Not Modified     200 OK + nouveau contenu
                   (petite reponse)     (grosse reponse)
                         |                    |
                         v                    v
                   Utiliser la           Stocker en cache
                   copie locale          + afficher
```

---

## 4. Glossaire des termes cles

### 4.1 Termes fondamentaux

| Terme              | Definition                                                    | Analogie                              |
|--------------------|---------------------------------------------------------------|---------------------------------------|
| **Client**         | Le logiciel qui envoie la requete (navigateur, curl, etc.)    | Le client au restaurant               |
| **Serveur**        | Le logiciel qui recoit la requete et envoie la reponse        | Le chef cuisinier                     |
| **Requete**        | Le message envoye du client au serveur                        | La commande au restaurant             |
| **Reponse**        | Le message renvoye du serveur au client                       | Le plat servi                         |
| **URL**            | Uniform Resource Locator - l'adresse de la ressource          | L'adresse postale                     |
| **Header**         | Metadonnees accompagnant la requete ou la reponse             | Les notes sur l'enveloppe             |
| **Body**           | Le contenu principal du message                               | Le contenu de la lettre               |
| **Status code**    | Code numerique indiquant le resultat (200, 404, 500...)       | Le tampon "recu" ou "refuse"          |

### 4.2 Termes lies au cache

| Terme                    | Definition                                                          |
|--------------------------|---------------------------------------------------------------------|
| **Cache hit**            | La ressource demandee est trouvee dans le cache                     |
| **Cache miss**           | La ressource n'est pas dans le cache, il faut interroger le serveur |
| **Fresh**                | La copie en cache est encore valide (non expiree)                   |
| **Stale**                | La copie en cache a expire mais existe encore                       |
| **Revalidation**         | Verifier aupres du serveur si la copie stale est encore bonne       |
| **ETag**                 | Identifiant unique d'une version de ressource (empreinte digitale)  |
| **Cache-Control**        | Header principal pour controler le comportement du cache            |
| **CDN**                  | Content Delivery Network - reseau de serveurs de cache distribues   |
| **TTL**                  | Time To Live - duree de vie d'une entree en cache                   |
| **Origin server**        | Le serveur d'origine, source de verite de la ressource              |
| **Reverse proxy**        | Serveur intermediaire entre le client et le serveur d'origine       |
| **Invalidation**         | Supprimer ou marquer comme expire une entree du cache               |

### 4.3 Termes reseau

| Terme              | Definition                                                    |
|--------------------|---------------------------------------------------------------|
| **DNS**            | Domain Name System - traduit les noms de domaine en IP        |
| **TCP**            | Transmission Control Protocol - transport fiable              |
| **TLS/SSL**        | Chiffrement des communications (le "S" de HTTPS)              |
| **RTT**            | Round-Trip Time - temps aller-retour d'un paquet              |
| **Latence**        | Temps entre l'envoi d'une requete et la reception de la reponse |
| **Bande passante** | Debit maximal de donnees par seconde                          |

---

## 5. Les outils

### 5.1 Chrome DevTools — Onglet Network

C'est ton outil numero 1 pour observer le cache HTTP en action.

**Comment l'ouvrir :**

1. Ouvre Chrome
2. Appuie sur `F12` ou `Ctrl+Shift+I` (Windows) / `Cmd+Option+I` (Mac)
3. Clique sur l'onglet **Network**

**Ce que tu peux observer :**

```
+------------------------------------------------------------------+
| Network                                                          |
+------------------------------------------------------------------+
| Name         | Status | Type     | Size       | Time    | Cache  |
+------------------------------------------------------------------+
| page.html    | 200    | document | 4.5 KB     | 230ms   |        |
| style.css    | 304    | style    | (cached)   | 45ms    | memory |
| logo.png     | 200    | image    | (cached)   | 0ms     | disk   |
| app.js       | 200    | script   | 125 KB     | 180ms   |        |
| api/data     | 200    | xhr      | 2.3 KB     | 340ms   |        |
+------------------------------------------------------------------+
```

**Colonnes importantes :**

- **Status** : `200` = reponse normale, `304` = pas modifie (cache valide)
- **Size** : `(from memory cache)` ou `(from disk cache)` = servi depuis le cache
- **Time** : `0ms` indique un cache hit parfait

**Astuce** : Coche "Disable cache" en haut pour forcer le rechargement complet.

### 5.2 curl — L'outil en ligne de commande

`curl` est un outil en ligne de commande pour envoyer des requetes HTTP. Il est parfait pour voir les headers bruts.

```bash
# Requete GET simple avec les headers de reponse
curl -v https://www.example.com

# Afficher UNIQUEMENT les headers de reponse
curl -I https://www.example.com

# Exemple de sortie :
# HTTP/2 200
# content-type: text/html; charset=UTF-8
# cache-control: max-age=604800        <-- Cache pendant 7 jours
# etag: "3147526947+gzip"              <-- Empreinte de la ressource
# expires: Thu, 14 Mar 2026 12:00:00 GMT
# last-modified: Thu, 17 Oct 2019 07:18:26 GMT

# Envoyer une requete conditionnelle (If-None-Match)
curl -H "If-None-Match: \"3147526947+gzip\"" -I https://www.example.com
# Reponse attendue : HTTP/2 304 (Not Modified)

# Voir le temps de chaque phase
curl -w "\nDNS: %{time_namelookup}s\nConnect: %{time_connect}s\nTLS: %{time_appconnect}s\nTotal: %{time_total}s\n" -o /dev/null -s https://www.example.com
```

### 5.3 Node.js — Pour creer nos propres serveurs

Tout au long de ce cours, nous utiliserons Node.js pour creer des serveurs HTTP et experimenter avec le cache.

```javascript
// server-basic.js
// Un serveur HTTP minimal en Node.js

const http = require('node:http');  // Module HTTP natif de Node.js

const server = http.createServer((req, res) => {
  // req = la requete recue (ce que le client envoie)
  // res = la reponse a envoyer (ce que le serveur repond)

  console.log(`${req.method} ${req.url}`);  // Affiche la methode et l'URL

  // Definir les headers de reponse
  res.writeHead(200, {
    'Content-Type': 'text/html',          // Le contenu est du HTML
    'Cache-Control': 'max-age=60',        // Cacher pendant 60 secondes
  });

  // Envoyer le body
  res.end('<h1>Bonjour, HTTP !</h1>');
});

// Demarrer le serveur sur le port 3000
server.listen(3000, () => {
  console.log('Serveur demarre sur http://localhost:3000');
});
```

**Pour lancer le serveur :**

```bash
node server-basic.js
# Serveur demarre sur http://localhost:3000

# Dans un autre terminal :
curl -v http://localhost:3000
```

### 5.4 Verification de l'environnement

Avant de continuer, verifie que tout est installe :

```bash
# Verifier Node.js (version 18+ recommandee)
node --version
# v20.11.0

# Verifier npm
npm --version
# 10.2.4

# Verifier curl
curl --version
# curl 8.4.0 ...

# Verifier Chrome
# Ouvre Chrome et tape chrome://version dans la barre d'adresse
```

---

## 6. Premiere observation : le cache en action

### 6.1 Creer un serveur d'observation

Cree ce fichier et lance-le :

```javascript
// observe-cache.js
const http = require('node:http');

let requestCount = 0;  // Compteur de requetes

const server = http.createServer((req, res) => {
  requestCount++;
  const now = new Date().toISOString();

  console.log(`[${now}] Requete #${requestCount}: ${req.method} ${req.url}`);

  // Afficher les headers importants de la requete
  console.log('  Headers de cache recus:');
  console.log(`    If-None-Match: ${req.headers['if-none-match'] || '(absent)'}`);
  console.log(`    If-Modified-Since: ${req.headers['if-modified-since'] || '(absent)'}`);
  console.log(`    Cache-Control: ${req.headers['cache-control'] || '(absent)'}`);
  console.log('');

  // Repondre avec des headers de cache
  res.writeHead(200, {
    'Content-Type': 'text/html; charset=utf-8',
    'Cache-Control': 'max-age=10',      // Cacher pendant 10 secondes
    'ETag': '"version-1"',              // Identifiant de version
    'X-Request-Count': requestCount.toString(),
  });

  res.end(`
    <!DOCTYPE html>
    <html>
    <body>
      <h1>Observation du cache</h1>
      <p>Requete numero: ${requestCount}</p>
      <p>Heure serveur: ${now}</p>
      <p>Recharge cette page et observe !</p>
      <p><strong>Astuce :</strong> Ouvre DevTools (F12) > Network</p>
    </body>
    </html>
  `);
});

server.listen(3000, () => {
  console.log('=== Serveur d\'observation du cache ===');
  console.log('URL: http://localhost:3000');
  console.log('');
  console.log('Instructions :');
  console.log('1. Ouvre http://localhost:3000 dans Chrome');
  console.log('2. Ouvre DevTools (F12) > Onglet Network');
  console.log('3. Recharge la page (F5) plusieurs fois');
  console.log('4. Observe les requetes dans la console ET dans DevTools');
  console.log('5. Attends 10 secondes et recharge a nouveau');
  console.log('');
});
```

### 6.2 Exercice guide

1. Lance le serveur : `node observe-cache.js`
2. Ouvre `http://localhost:3000` dans Chrome
3. Ouvre DevTools (F12) > Network
4. Recharge la page (F5) — observe :
   - Le numero de requete augmente-t-il dans la console du serveur ?
   - Que dit la colonne "Size" dans DevTools ?
5. Attends 10 secondes et recharge
6. Force un rechargement complet avec `Ctrl+Shift+R`

**Ce que tu devrais observer :**

```
Premier chargement :
  Console serveur : Requete #1
  DevTools : Status 200, Size: xxx bytes

Rechargement dans les 10 secondes :
  Console serveur : (rien ! le cache repond directement)
  DevTools : Status 200, Size: (from disk cache)

Apres 10 secondes :
  Console serveur : Requete #2
  DevTools : Status 200 ou 304

Ctrl+Shift+R (force reload) :
  Console serveur : Requete #3
  DevTools : Status 200 (force un telechargement complet)
```

---

## Points cles

1. **HTTP est un protocole requete-reponse** : le client demande, le serveur repond.
2. **Le caching evite des allers-retours couteux** : la latence reseau est l'ennemi principal de la performance web.
3. **Il existe plusieurs niveaux de cache** : navigateur, proxy, CDN, serveur — chacun avec ses avantages.
4. **Le cache peut repondre a la place du serveur** : si la copie est "fraiche", le serveur n'est meme pas contacte.
5. **Les outils (DevTools, curl) sont indispensables** pour observer et comprendre le cache en action.

---

## Lab associe

-> `labs/00-observer-le-cache.md` — Observer le cache avec Chrome DevTools et curl

---

## Pour aller plus loin

- [MDN — HTTP Overview](https://developer.mozilla.org/fr/docs/Web/HTTP/Overview)
- [MDN — HTTP Caching](https://developer.mozilla.org/fr/docs/Web/HTTP/Caching)
- [web.dev — HTTP Cache](https://web.dev/articles/http-cache)
- [High Performance Browser Networking — Ilya Grigorik](https://hpbn.co/)

---

## Si tu es perdu

**Retiens juste ceci :**

HTTP, c'est comme le courrier postal. Tu envoies une lettre (requete) a une adresse (URL), et tu recois une reponse. Le cache, c'est comme garder une photocopie de la reponse dans un tiroir. La prochaine fois que tu as besoin de la meme info, tu regardes dans le tiroir au lieu de re-envoyer une lettre. C'est beaucoup plus rapide.

Tout le reste du cours va detailler **comment** le navigateur decide quoi mettre dans le tiroir, combien de temps le garder, et quand verifier si la photocopie est encore a jour.

---

## Exercice pratique — Chrome DevTools

### Objectif

Ouvrir Chrome DevTools, effectuer une requete vers un site reel, et identifier les headers de cache dans la reponse.

### Etapes

1. **Ouvrir Chrome DevTools**
   - Ouvre Google Chrome
   - Appuie sur `F12` ou `Ctrl+Shift+I` (Windows/Linux) / `Cmd+Option+I` (Mac)
   - Clique sur l'onglet **Network**

2. **Preparer l'observation**
   - Coche la case **Preserve log** (pour garder les requetes meme apres une navigation)
   - Assure-toi que le filtre est sur **All** (pas uniquement JS ou CSS)
   - Verifie que la case **Disable cache** est **decochee** (on veut observer le cache normal)

3. **Effectuer une premiere requete**
   - Dans la barre d'adresse de Chrome, va sur `https://www.example.com`
   - Observe la liste de requetes qui apparait dans l'onglet Network
   - Clique sur la premiere requete (`www.example.com`)

4. **Inspecter les headers de reponse**
   - Dans le panneau de droite, clique sur l'onglet **Headers**
   - Sous **Response Headers**, cherche les headers suivants :
     - `Cache-Control` — indique la politique de cache (ex: `max-age=604800`)
     - `ETag` — empreinte de la ressource (ex: `"3147526947+gzip"`)
     - `Expires` — date d'expiration absolue
     - `Last-Modified` — date de derniere modification
   - Note les valeurs que tu trouves

5. **Observer l'effet du cache au rechargement**
   - Appuie sur `F5` pour recharger la page
   - Observe la colonne **Size** dans la liste des requetes :
     - Si tu vois `(from disk cache)` ou `(from memory cache)`, la ressource a ete servie depuis le cache du navigateur
     - Si tu vois une taille en octets (ex: `1.2 kB`), la ressource a ete telechargee depuis le reseau
   - Observe la colonne **Time** : les ressources en cache affichent un temps proche de `0 ms`

6. **Comparer avec un hard refresh**
   - Appuie sur `Ctrl+Shift+R` (Windows/Linux) ou `Cmd+Shift+R` (Mac) pour forcer un rechargement complet
   - Observe que toutes les ressources sont maintenant telechargees depuis le reseau (pas de `(from cache)`)
   - Compare les temps de chargement avec le rechargement normal

### Ce que tu devrais observer

```
Rechargement normal (F5) :
  Size: (from disk cache)     Time: 0 ms     --> Cache HIT
  Size: (from memory cache)   Time: 0 ms     --> Cache HIT (RAM)

Hard refresh (Ctrl+Shift+R) :
  Size: 1.2 kB                Time: 120 ms   --> Telechargement complet
```

### Questions de reflexion

- Quels headers lies au cache as-tu trouves dans la reponse de `example.com` ?
- Quelle est la difference de temps de chargement entre un rechargement normal et un hard refresh ?
- Pourquoi certaines ressources apparaissent en `(from memory cache)` et d'autres en `(from disk cache)` ?

---

## Defi

### Observe et analyse une requete reelle

**Objectif** : Observer une requete HTTP complete dans Chrome DevTools et identifier les headers de cache.

**Etapes :**

1. Ouvre Chrome et va sur `https://www.wikipedia.org`
2. Ouvre DevTools (F12) > Network
3. Recharge la page (F5)
4. Clique sur la premiere requete (`www.wikipedia.org`)
5. Dans l'onglet "Headers", reponds a ces questions :

**Questions :**

- Quel est le status code de la reponse ?
- Quels headers lies au cache peux-tu trouver ? (`Cache-Control`, `ETag`, `Expires`, `Last-Modified`)
- Y a-t-il un header `Vary` ? Si oui, quelle est sa valeur ?
- Quelle est la taille de la reponse ?
- Recharge la page une deuxieme fois : le status code a-t-il change ?

<details>
<summary>Reponse attendue</summary>

Tu devrais observer quelque chose comme :

- **Status** : `200 OK` au premier chargement, potentiellement `304 Not Modified` ou `(from cache)` ensuite
- **Cache-Control** : Probablement `private, s-maxage=0, max-age=0, must-revalidate` (Wikipedia est dynamique)
- **ETag** : Present, quelque chose comme `W/"..."` (weak ETag)
- **Last-Modified** : Une date de derniere modification
- **Vary** : Probablement `Accept-Encoding, Cookie` (la reponse depend de l'encodage et des cookies)
- Au deuxieme chargement, certaines ressources statiques (images, CSS, JS) seront servies depuis le cache

L'important est de **voir** ces headers, pas de les comprendre a 100% pour l'instant. On les etudiera en detail dans les modules suivants.

</details>
