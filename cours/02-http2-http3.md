# Module 02 — HTTP/2 & HTTP/3

> **Objectif** : Comprendre les evolutions majeures du protocole HTTP, pourquoi HTTP/2 et HTTP/3 existent, et leur impact sur le caching.
> **Difficulte** : ⭐⭐ (Intermédiaire)

---

## 1. Les problèmes de HTTP/1.1

### 1.1 Rappel : pourquoi changer ?

Avant de parler de HTTP/2, il faut bien comprendre **pourquoi HTTP/1.1 ne suffit plus**. Imagine une autoroute :

```
HTTP/1.1 = UNE AUTOROUTE A 1 VOIE PAR CONNEXION
=================================================

Connexion 1 :  [Camion 1 ========>]  [Camion 2 ===>]  [Camion 3 ====>]
Connexion 2 :  [Camion 4 ====>]  [Camion 5 ============>]
Connexion 3 :  [Camion 6 ==>]  [Camion 7 ===>]
Connexion 4 :  [Camion 8 =================>]
Connexion 5 :  [Camion 9 ===>]  [Camion 10 ===>]
Connexion 6 :  [Camion 11 =======>]
--- PLUS DE VOIES DISPONIBLES ---
Camion 12 :    [EN ATTENTE ............]
Camion 13 :    [EN ATTENTE ............]
```

**Problème 1 : Head-of-Line (HoL) Blocking**

Sur chaque connexion, les requêtes doivent etre traitees **dans l'ordre**. Si la requête 1 est lente, toutes les requêtes suivantes sur cette connexion sont bloquees.

```
Connexion 1 :
  Requete A (image de 2 Mo)  : [==========================>]
  Requete B (CSS de 5 Ko)   :                              [=>]  BLOQUEE !
  Requete C (JS de 10 Ko)   :                                 [==>] BLOQUEE !

La petite requete CSS attend que la grosse image soit terminee.
C'est comme etre bloque derriere un tracteur sur une route a une voie.
```

**Problème 2 : Limite de 6 connexions par domaine**

```
Une page web moderne charge typiquement :
  - 1 fichier HTML
  - 5-10 fichiers CSS
  - 10-20 fichiers JavaScript
  - 20-50 images
  - 2-5 polices de caracteres
  = 40-90 ressources !

Avec 6 connexions max, ca fait des dizaines d'allers-retours.
```

**Problème 3 : Headers redondants et non compresses**

```
# Chaque requete renvoie les MEMES headers a chaque fois :

GET /page1.html HTTP/1.1
Host: example.com
User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36...
Accept: text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8
Accept-Language: fr-FR,fr;q=0.9,en;q=0.8
Accept-Encoding: gzip, deflate, br
Cookie: session=abc123; preferences=dark-mode; tracking=xyz789...
Connection: keep-alive

# ~800 octets de headers IDENTIQUES a chaque requete
# Pour 50 requetes : 50 x 800 = 40 Ko de headers redondants !
```

### 1.2 Tableau récapitulatif des limitations

| Limitation                     | Impact                                    | Contournement HTTP/1.1         |
|-------------------------------|-------------------------------------------|--------------------------------|
| HoL blocking                  | Requetes lentes bloquent les rapides      | Ouvrir plus de connexions      |
| 6 connexions max / domaine    | Telechargements sequentiels par lots      | Domain sharding                |
| Headers non compresses        | Gaspillage de bande passante              | Aucun                          |
| Pas de priorites              | Toutes les ressources traitees egalement  | Aucun                          |
| Pas de push serveur           | Le client doit tout demander explicitement| Inlining CSS/JS                |

---

## 2. HTTP/2 : La revolution du multiplexage

### 2.1 L'analogie de l'autoroute multi-voies

```
HTTP/1.1 = Route a 1 voie (par connexion)
==========================================
Connexion 1: [A A A A A A A] [B B] [C C C]
Connexion 2: [D D D D] [E E E E E E]
(Sequentiel sur chaque connexion)


HTTP/2 = Autoroute a voies illimitees (1 seule connexion)
=========================================================
Stream 1:  [A] . [A] . [A] . . [A] . [A] . [A] . [A]
Stream 2:  . [B] . . [B] . . . . . . . . . . . . . .
Stream 3:  . . . [C] . . [C] . [C] . . . . . . . . .
Stream 4:  . . . . . [D] . [D] . [D] . [D] . . . . .
Stream 5:  . . . . . . . . . . [E] . [E] . [E] . [E]

Tous les streams partagent UNE SEULE connexion TCP !
Les morceaux s'entrelacent librement.
```

### 2.2 Concepts fondamentaux de HTTP/2

HTTP/2 introduit trois concepts clés :

```
+-----------------------------------------------------------+
|                   CONNEXION HTTP/2                         |
|                  (1 seule connexion TCP)                   |
|                                                           |
|  +---------------------------------------------------+   |
|  |                    STREAM 1                        |   |
|  |  [Frame HEADERS] [Frame DATA] [Frame DATA]        |   |
|  +---------------------------------------------------+   |
|                                                           |
|  +---------------------------------------------------+   |
|  |                    STREAM 3                        |   |
|  |  [Frame HEADERS] [Frame DATA]                      |   |
|  +---------------------------------------------------+   |
|                                                           |
|  +---------------------------------------------------+   |
|  |                    STREAM 5                        |   |
|  |  [Frame HEADERS] [Frame DATA] [Frame DATA] [DATA] |   |
|  +---------------------------------------------------+   |
|                                                           |
+-----------------------------------------------------------+

Vocabulaire :
- Connexion : 1 lien TCP entre client et serveur
- Stream    : 1 echange requete/reponse (comme un canal virtuel)
- Frame     : L'unite de base (le plus petit morceau de donnees)
```

### 2.3 Les frames HTTP/2

En HTTP/1.1, les messages sont du texte brut. En HTTP/2, tout est découper en **frames binaires** :

```
FRAME HTTP/2 (format binaire)
+-------------------------------+
| Length (24 bits)              |  Taille de la payload
+-------------------------------+
| Type (8 bits)                |  Type de frame
+-------------------------------+
| Flags (8 bits)               |  Options
+-------------------------------+
| Stream ID (31 bits)          |  A quel stream appartient cette frame
+-------------------------------+
| Payload (variable)           |  Les donnees
+-------------------------------+
```

**Types de frames principaux :**

| Type          | Code | Description                               |
|---------------|------|-------------------------------------------|
| DATA          | 0x0  | Transporte le body de la requête/réponse  |
| HEADERS       | 0x1  | Transporte les headers (compresses HPACK) |
| PRIORITY      | 0x2  | Indique la priorite d'un stream           |
| RST_STREAM    | 0x3  | Annule un stream spécifique               |
| SETTINGS      | 0x4  | Configuration de la connexion             |
| PUSH_PROMISE  | 0x5  | Annonce un server push                    |
| PING          | 0x6  | Mesure la latence / keepalive             |
| GOAWAY        | 0x7  | Fermeture propre de la connexion          |
| WINDOW_UPDATE | 0x8  | Controle de flux                          |

### 2.4 Multiplexage en detail

Le multiplexage est LA fonctionnalite qui change tout. Voici comment ça fonctionne :

```
CLIENT                                          SERVEUR
  |                                                |
  |  HEADERS frame (Stream 1) : GET /index.html    |
  | ---------------------------------------------> |
  |  HEADERS frame (Stream 3) : GET /style.css     |
  | ---------------------------------------------> |
  |  HEADERS frame (Stream 5) : GET /app.js        |
  | ---------------------------------------------> |
  |                                                |
  |  HEADERS frame (Stream 3) : 200 OK (CSS)       |
  | <--------------------------------------------- |
  |  DATA frame (Stream 3) : body { margin: 0 }    |
  | <--------------------------------------------- |  CSS arrive en premier
  |                                                |     (plus petit)
  |  HEADERS frame (Stream 1) : 200 OK (HTML)      |
  | <--------------------------------------------- |
  |  DATA frame (Stream 1) : <!DOCTYPE html>...    |
  | <--------------------------------------------- |  HTML arrive ensuite
  |  DATA frame (Stream 5) : (partie 1 du JS)      |
  | <--------------------------------------------- |
  |  DATA frame (Stream 1) : ...(suite HTML)...    |
  | <--------------------------------------------- |  Entrelacement !
  |  DATA frame (Stream 5) : (partie 2 du JS)      |
  | <--------------------------------------------- |
  |  DATA frame (Stream 5) : (fin du JS)            |
  | <--------------------------------------------- |
  |                                                |

Les reponses arrivent EN PARALLELE sur la meme connexion !
Plus de HoL blocking au niveau HTTP.
```

**Pourquoi les stream IDs sont impairs (1, 3, 5) ?** Les streams inities par le client utilisent des IDs impairs. Les streams inities par le serveur (server push) utilisent des IDs pairs (2, 4, 6).

### 2.5 HPACK : Compression des headers

HTTP/2 compresse les headers avec HPACK, un algorithme specialise :

```
SANS HPACK (HTTP/1.1) — Chaque requete :
==========================================
GET /page1 HTTP/1.1                          ~15 octets
Host: example.com                            ~20 octets
User-Agent: Mozilla/5.0 (Windows NT...)      ~120 octets
Accept: text/html,application/xhtml+xml...   ~80 octets
Accept-Encoding: gzip, deflate, br           ~30 octets
Cookie: session=abc; pref=dark; track=xyz    ~50 octets
                                       Total: ~315 octets x N requetes


AVEC HPACK (HTTP/2) :
======================
Requete 1 : Tous les headers envoyes normalement
             (mais compresses avec Huffman)        ~200 octets

Requete 2 : "Memes headers que requete 1,
              sauf le chemin qui est /page2"         ~15 octets !

Requete 3 : "Memes headers, chemin = /page3"         ~15 octets !
```

**Comment ça marche ?**

```
TABLE DYNAMIQUE (partagee entre client et serveur)
+-------+------------------------+----------------------------------+
| Index | Nom du header          | Valeur                           |
+-------+------------------------+----------------------------------+
| 62    | host                   | example.com                      |
| 63    | user-agent             | Mozilla/5.0 (Windows NT...)      |
| 64    | accept                 | text/html,application/xhtml+xml..|
| 65    | cookie                 | session=abc; pref=dark...        |
+-------+------------------------+----------------------------------+

Requete suivante : "Index 62, 63, 64, 65, + :path=/page2"
Au lieu de re-envoyer 300 octets de texte, on envoie des INDEX !
```

**Gain typique** : 85-90% de reduction de la taille des headers après la première requête.

### 2.6 Server Push

Le server push permet au serveur d'envoyer des ressources **avant que le client ne les demandé** :

```
SANS SERVER PUSH                        AVEC SERVER PUSH
========================                ========================

Client: GET /index.html                 Client: GET /index.html
Serveur: 200 OK (HTML)                  Serveur: 200 OK (HTML)
                                                  + PUSH style.css
Client parse le HTML...                           + PUSH app.js
Client: GET /style.css
Client: GET /app.js                     Client parse le HTML...
Serveur: 200 OK (CSS)                   style.css et app.js sont
Serveur: 200 OK (JS)                    deja dans le cache !

Temps: 2 allers-retours                 Temps: 1 aller-retour
```

```typescript
// Exemple conceptuel de server push avec Node.js (HTTP/2)
import http2, { type ServerHttp2Stream, type IncomingHttpHeaders } from 'node:http2';
import fs from 'node:fs';

const server = http2.createSecureServer({
  key: fs.readFileSync('server.key'),
  cert: fs.readFileSync('server.cert'),
});

server.on('stream', (stream: ServerHttp2Stream, headers: IncomingHttpHeaders) => {
  const path: string | undefined = headers[':path'] as string | undefined;

  if (path === '/index.html') {
    // --- Pousser le CSS avant que le client ne le demande ---
    stream.pushStream({ ':path': '/style.css' }, (err: Error | null, pushStream: ServerHttp2Stream) => {
      if (err) return;
      pushStream.respond({
        ':status': 200,
        'content-type': 'text/css',
        'cache-control': 'max-age=86400',  // Cacher 24h
      });
      pushStream.end('body { margin: 0; font-family: sans-serif; }');
    });

    // --- Repondre avec le HTML ---
    stream.respond({
      ':status': 200,
      'content-type': 'text/html',
    });
    stream.end('<html><head><link rel="stylesheet" href="/style.css"></head>...</html>');
  }
});

server.listen(8443);
```

**Attention** : Le server push a ete abandonne par Chrome en 2022 (Chrome 106). La raison ? Il est très difficile a configurer correctement et les CDN ne le supportent pas bien. L'alternative recommandee est `103 Early Hints`.

### 2.7 Impact de HTTP/2 sur le caching

HTTP/2 ne change **pas** les mécanismes de cache (Cache-Control, ETag, etc.) mais il change la façon dont on optimise :

| Pratique HTTP/1.1                | Avec HTTP/2                        |
|----------------------------------|------------------------------------|
| Domain sharding (3-4 domaines)   | **Inutile** (1 connexion suffit)   |
| Concatenation CSS/JS (bundles)   | **Moins nécessaire** (multiplexage)|
| Sprites d'images                 | **Moins nécessaire**               |
| Inlining CSS dans le HTML        | **Moins nécessaire**               |

**Pourquoi ?** Avec le multiplexage, telecharger 50 petits fichiers est aussi rapide que 1 gros fichier. Plus besoin de "tricher" en regroupant les ressources.

**Impact sur le cache :** Des fichiers plus petits et plus granulaires signifient un cache plus efficace. Si tu changes 1 ligne de CSS, tu invalides seulement le petit fichier CSS concerne au lieu de tout le bundle.

---

## 3. HTTP/3 : QUIC et l'ere de l'UDP

### 3.1 Le problème restant de HTTP/2

HTTP/2 resout le HoL blocking au niveau **HTTP**, mais il reste un problème au niveau **TCP** :

```
HTTP/2 SUR TCP : HoL BLOCKING NIVEAU TRANSPORT
================================================

Rappel : HTTP/2 utilise UNE SEULE connexion TCP.
TCP garantit la livraison dans l'ordre.

Stream 1: [Paquet 1] [Paquet 2] [Paquet 3]
Stream 2: [Paquet 4] [Paquet 5]
Stream 3: [Paquet 6] [Paquet 7] [Paquet 8]

Les paquets sont melanges sur la connexion TCP :
TCP: [P1] [P4] [P6] [P2] [P5] [P7] [P3] [P8]

Si le paquet P4 est PERDU sur le reseau :
TCP: [P1] [X ] [P6] [P2] [P5] [P7] [P3] [P8]
              ^
              PERDU !

TCP doit retransmettre P4 et TOUT est bloque :
- Stream 2 est bloque (normal, c'est son paquet)
- Stream 1 est AUSSI bloque (pas normal !)
- Stream 3 est AUSSI bloque (pas normal !)

TCP ne sait pas que les paquets appartiennent
a des streams differents. Pour TCP, c'est juste
un flux d'octets continu.
```

**Analogie** : Imagine un tuyau unique (TCP). Si un caillou (paquet perdu) bloque le tuyau, TOUT l'eau (tous les streams) est bloquee, même si le caillou ne concerne qu'un seul stream.

### 3.2 QUIC : la solution

QUIC (Quick UDP Internet Connections) est un nouveau protocole de transport qui resout ce problème :

```
HTTP/3 SUR QUIC (UDP) : PAS DE HoL BLOCKING
=============================================

QUIC sait que les paquets appartiennent a des streams differents.

Stream 1: [Paquet 1] [Paquet 2] [Paquet 3]     --> OK, continue
Stream 2: [Paquet 4] [X PERDU ] [Paquet 5]     --> Bloque (retransmission)
Stream 3: [Paquet 6] [Paquet 7] [Paquet 8]     --> OK, continue !

Seul le Stream 2 est bloque.
Les Streams 1 et 3 continuent normalement !
```

```
ARCHITECTURE DES PROTOCOLES
=============================

HTTP/1.1 & HTTP/2          HTTP/3
+------------------+       +------------------+
|   HTTP/1.1 ou    |       |     HTTP/3       |
|   HTTP/2         |       +------------------+
+------------------+       |      QUIC        |
|       TLS        |       |  (inclut TLS 1.3)|
+------------------+       +------------------+
|       TCP        |       |       UDP        |
+------------------+       +------------------+
|       IP         |       |       IP         |
+------------------+       +------------------+
```

### 3.3 Les avantages de QUIC

**Avantage 1 : 0-RTT Connection**

```
CONNEXION TCP + TLS 1.3 (HTTP/2)
==================================
Client                  Serveur
  |  TCP SYN ---------->  |     }
  |  <-------- SYN-ACK    |     } 1 RTT pour TCP
  |  TCP ACK ---------->  |     }
  |  TLS ClientHello -->  |     }
  |  <-- TLS ServerHello  |     } 1 RTT pour TLS
  |  TLS Finished ----->  |     }
  |  GET /page ---------->|     } Enfin la requete !
  |  <-------- 200 OK     |
                    Total: 2-3 RTT avant la premiere requete


CONNEXION QUIC (HTTP/3) — Premiere visite
==========================================
Client                  Serveur
  |  QUIC Initial ------>  |     } TLS integre dans QUIC
  |  <----- QUIC Response  |     } 1 RTT
  |  GET /page ----------> |     } Requete envoyee immediatement
  |  <-------- 200 OK      |
                    Total: 1 RTT


RECONNEXION QUIC (HTTP/3) — Visite suivante (0-RTT)
====================================================
Client                  Serveur
  |  QUIC 0-RTT + GET --> |     } Requete envoyee DES LE PREMIER PAQUET !
  |  <-------- 200 OK     |
                    Total: 0 RTT !
```

**Pourquoi 0-RTT est genial pour le cache ?** Si le cache est expire et qu'il faut revalider aupres du serveur, la revalidation 0-RTT est quasi-instantanee.

**Avantage 2 : Migration de connexion**

```
PROBLEME AVEC TCP :
====================
Tu es sur ton telephone, connecte en WiFi.
Tu sors de chez toi, le WiFi se deconnecte, 4G prend le relais.

TCP: Connexion identifiee par (IP source, Port source, IP dest, Port dest)
     Ton IP change (WiFi -> 4G) = connexion TCP cassee !
     Toutes les requetes en cours sont perdues.
     Le navigateur doit recommencer de zero.

SOLUTION AVEC QUIC :
=====================
QUIC: Connexion identifiee par un Connection ID (independant de l'IP)
      Ton IP change (WiFi -> 4G) = QUIC continue normalement !
      Aucune requete perdue.
      L'utilisateur ne remarque rien.
```

**Analogie** : TCP c'est comme un numéro de telephone fixe (lie à un endroit). QUIC c'est comme un numéro de portable (tu peux bouger, le numéro reste le même).

**Avantage 3 : Pas de HoL blocking au niveau transport**

Comme explique plus haut, la perte d'un paquet sur un stream ne bloque pas les autres streams.

### 3.4 Comparaison detaillee

| Caracteristique          | HTTP/1.1           | HTTP/2              | HTTP/3              |
|--------------------------|--------------------|--------------------|---------------------|
| Transport                | TCP                | TCP                | QUIC (UDP)          |
| Multiplexage             | Non                | Oui                | Oui                 |
| HoL blocking HTTP        | Oui                | Non                | Non                 |
| HoL blocking transport   | Oui                | Oui (TCP)          | Non (QUIC)          |
| Compression headers      | Non                | HPACK              | QPACK               |
| Server push              | Non                | Oui (abandonne)    | Oui (rarement utilise)|
| Chiffrement              | Optionnel (TLS)    | Quasi-obligatoire  | Toujours (intégré)  |
| 0-RTT                    | Non                | Non (sauf TLS 1.3) | Oui                 |
| Migration connexion      | Non                | Non                | Oui                 |
| RTT connexion initiale   | 2-3 RTT            | 2-3 RTT            | 1 RTT (0 en 0-RTT) |
| Adoption (mars 2026)     | En declin          | Dominant (~60%)    | En croissance (~30%)|

### 3.5 QPACK vs HPACK

HTTP/3 utilise QPACK au lieu de HPACK pour la compression des headers :

```
HPACK (HTTP/2) :
================
Requiert un ORDRE STRICT des headers.
Si un paquet de headers est perdu, les suivants
ne peuvent pas etre decompresses (HoL blocking !).


QPACK (HTTP/3) :
=================
Utilise deux flux unidirectionnels :
1. Flux d'encodeur : envoie les mises a jour de la table
2. Flux de decodeur : confirme les mises a jour recues

Les headers peuvent etre decompresses dans n'importe quel ordre.
Pas de HoL blocking pour les headers !
```

---

## 4. Comparaison pratique

### 4.1 Voir la version HTTP dans Chrome DevTools

```
Chrome DevTools > Network > Clic droit sur l'en-tete des colonnes
> Cocher "Protocol"

+------------------------------------------------------------------+
| Name         | Status | Protocol | Size    | Time               |
+------------------------------------------------------------------+
| page.html    | 200    | h2       | 4.5 KB  | 45ms               |
| style.css    | 200    | h2       | 12 KB   | 12ms               |
| api/data     | 200    | h3       | 2.3 KB  | 28ms               |
| image.jpg    | 200    | h2       | 450 KB  | 89ms               |
+------------------------------------------------------------------+

h2 = HTTP/2    h3 = HTTP/3    http/1.1 = HTTP/1.1
```

### 4.2 Vérifier avec curl

```bash
# Voir quelle version HTTP est utilisee
curl -I --http2 https://www.google.com 2>&1 | head -1
# HTTP/2 200

curl -I --http3 https://www.cloudflare.com 2>&1 | head -1
# HTTP/3 200

# Voir les details de la negociation
curl -v --http2 https://example.com 2>&1 | grep "< HTTP"
# < HTTP/2 200

# Timing detaille pour comparer HTTP/1.1 vs HTTP/2
curl -w "DNS: %{time_namelookup}s\nTCP: %{time_connect}s\nTLS: %{time_appconnect}s\nPremier octet: %{time_starttransfer}s\nTotal: %{time_total}s\n" \
     -o /dev/null -s --http2 https://example.com
```

### 4.3 Créer un serveur HTTP/2 avec Node.js

```typescript
// server-http2.ts
// Serveur HTTP/2 avec Node.js

import http2, { type ServerHttp2Stream, type IncomingHttpHeaders } from 'node:http2';
import fs from 'node:fs';
import path from 'node:path';

// HTTP/2 NECESSITE TLS (HTTPS) dans les navigateurs
// Generer un certificat auto-signe pour les tests :
// openssl req -x509 -newkey rsa:2048 -keyout server.key -out server.cert \
//   -days 365 -nodes -subj '/CN=localhost'

const server = http2.createSecureServer({
  key: fs.readFileSync('server.key'),     // Cle privee
  cert: fs.readFileSync('server.cert'),   // Certificat
});

server.on('stream', (stream: ServerHttp2Stream, headers: IncomingHttpHeaders) => {
  // En HTTP/2, les headers utilisent des pseudo-headers prefixes par ':'
  const method: string | undefined = headers[':method'] as string | undefined;
  const reqPath: string | undefined = headers[':path'] as string | undefined;

  console.log(`${method} ${reqPath} (Stream ID: ${stream.id})`);

  if (reqPath === '/') {
    stream.respond({
      ':status': 200,
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'max-age=60',
    });
    stream.end(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>HTTP/2 Demo</title>
        <link rel="stylesheet" href="/style.css">
      </head>
      <body>
        <h1>Serveur HTTP/2 avec Node.js</h1>
        <p>Stream ID: ${stream.id}</p>
        <script src="/app.js"></script>
      </body>
      </html>
    `);
  } else if (reqPath === '/style.css') {
    stream.respond({
      ':status': 200,
      'content-type': 'text/css',
      'cache-control': 'max-age=86400',       // 24h pour les assets
    });
    stream.end('body { font-family: system-ui; margin: 2rem; }');
  } else if (reqPath === '/app.js') {
    stream.respond({
      ':status': 200,
      'content-type': 'application/javascript',
      'cache-control': 'max-age=86400',
    });
    stream.end('console.log("HTTP/2 fonctionne !");');
  } else {
    stream.respond({ ':status': 404 });
    stream.end('Not found');
  }
});

server.listen(8443, () => {
  console.log('Serveur HTTP/2 sur https://localhost:8443');
  console.log('Note: Accepte le certificat auto-signe dans le navigateur');
});
```

### 4.4 Waterfall : la différence visuelle

```
HTTP/1.1 WATERFALL (Chrome DevTools)
=====================================

index.html   [========]
style.css              [=====]
app.js                 [=======]
image1.png             [============]
image2.png             [=========]
image3.png             [===========]
image4.png                          [========]      <-- En attente !
image5.png                          [==========]    <-- En attente !
font.woff                           [======]        <-- En attente !

                                    ^
                            Limite de 6 connexions atteinte
                            Les requetes suivantes attendent


HTTP/2 WATERFALL (Chrome DevTools)
===================================

index.html   [========]
style.css              [=====]
app.js                 [=======]
image1.png             [============]
image2.png             [=========]
image3.png             [===========]
image4.png             [========]        <-- Pas d'attente !
image5.png             [==========]      <-- Pas d'attente !
font.woff              [======]          <-- Pas d'attente !

Tout demarre en meme temps grace au multiplexage !
```

---

## 5. Negociation de protocole

### 5.1 Comment le client et le serveur choisissent le protocole

```
NEGOCIATION HTTP/2 (ALPN — Application-Layer Protocol Negotiation)
===================================================================

1. Le client se connecte en TLS
2. Dans le ClientHello TLS, il propose :
   "Je parle : h2, http/1.1"

3. Le serveur choisit :
   "OK, on utilise h2"

4. La connexion continue en HTTP/2

+--------------------------------------------------+
| ClientHello TLS                                  |
| ALPN: h2, http/1.1                               |
+--------------------------------------------------+
                      |
                      v
+--------------------------------------------------+
| ServerHello TLS                                  |
| ALPN: h2                                         |
+--------------------------------------------------+


NEGOCIATION HTTP/3 (Alt-Svc)
==============================

1. Le client se connecte d'abord en HTTP/2 (sur TCP)
2. Le serveur repond avec un header special :
   Alt-Svc: h3=":443"; ma=86400
   ("Je supporte aussi HTTP/3 sur le port 443, pendant 24h")
3. Le client tente une connexion QUIC en arriere-plan
4. Si ca marche, les requetes suivantes utilisent HTTP/3

HTTP/2 reponse:
  Alt-Svc: h3=":443"; ma=86400       <-- "Essaie HTTP/3 !"

Le navigateur retient cette info et la prochaine visite
se fera directement en HTTP/3.
```

### 5.2 Compatibilite et fallback

```
STRATEGIE DE FALLBACK DU NAVIGATEUR
=====================================

1. Essayer HTTP/3 (QUIC/UDP)
   |
   +-- Succes ? --> Utiliser HTTP/3
   |
   +-- Echec (pare-feu bloque UDP, timeout) ?
       |
       v
2. Fallback vers HTTP/2 (TCP)
   |
   +-- Succes ? --> Utiliser HTTP/2
   |
   +-- Echec (serveur trop vieux) ?
       |
       v
3. Fallback vers HTTP/1.1 (TCP)
   |
   +-- Utiliser HTTP/1.1
```

**Pourquoi le fallback est nécessaire ?** Certains réseaux d'entreprise bloquent UDP (nécessaire pour QUIC/HTTP3). Le navigateur doit pouvoir revenir a HTTP/2 ou même HTTP/1.1.

---

## 6. HTTP/3 en profondeur : QUIC, migration et 0-RTT

### 6.1 QUIC : le protocole de transport reinvente

QUIC n'est pas juste "TCP sur UDP". C'est un protocole de transport **complet** qui réinvente la couche transport avec les leçons apprises de 30 ans de TCP :

```
TCP : concu en 1981                     QUIC : concu en 2012-2021
================================        ================================

Fiabilité : oui                         Fiabilité : oui
Ordre : global (tout le flux)           Ordre : par stream (independant)
Chiffrement : non (ajouté via TLS)      Chiffrement : integre (TLS 1.3)
Contrôle de flux : fenetre globale      Contrôle de flux : par stream + global
Congestion : algorithmes anciens        Congestion : pluggable (Cubic, BBR)
Handshake : 1-3 RTT                     Handshake : 1 RTT (0 en reconnexion)
Identifiant : (IP, port) tuple          Identifiant : Connection ID (64 bits)
Implemente dans : le kernel OS          Implemente dans : l'application (userspace)
Evolution : quasi impossible            Evolution : rapide (pas besoin de MAJ kernel)
```

**Pourquoi UDP ?** QUIC utilise UDP comme couche de transport **minimale** pour pouvoir traverser les routeurs et pare-feux existants. Toute la logique de fiabilite, d'ordre et de controle de flux est reimplementee dans QUIC lui-meme, au-dessus d'UDP.

```
Un paquet QUIC sur le reseau :
+------------------+
| UDP Header (8 B) |  ← Juste pour traverser les routeurs
+------------------+
| QUIC Header      |  ← Connection ID, packet number
+------------------+
| QUIC Frames      |  ← STREAM, ACK, CRYPTO, etc.
| (chiffrees TLS)  |  ← Tout est chiffre sauf le header court
+------------------+

Contrairement a TCP+TLS, meme les NUMEROS DE PAQUET sont chiffres.
Un observateur sur le reseau ne peut pas voir :
- Combien de streams sont ouverts
- Quelles donnees sont retransmises
- L'etat de la connexion
```

### 6.2 Le 0-RTT en detail

Le 0-RTT est la fonctionnalite "magique" de QUIC : envoyer des donnees **des le premier paquet** lors d'une reconnexion :

```
PREMIERE CONNEXION (1-RTT)
============================
Client                              Serveur
  |                                    |
  |  Initial [CRYPTO: ClientHello]  →  |   Le client envoie ses parametres TLS
  |                                    |
  |  ← Initial [CRYPTO: ServerHello]   |   Le serveur repond avec ses parametres
  |    + Handshake [certificat, fin]   |   + son certificat + cle de session
  |                                    |
  |  Handshake [fin] + 1-RTT [GET] →   |   Le client confirme + envoie sa requete
  |                                    |
  |  ← 1-RTT [200 OK + donnees]       |   Le serveur repond
  |                                    |
  Total : 1 RTT avant la premiere requete
  Le serveur donne au client un "ticket de session" a reutiliser.


RECONNEXION (0-RTT)
=====================
Client                              Serveur
  |                                    |
  |  Initial [CRYPTO: ClientHello     |
  |    + ticket de session]           |   Le client presente son ancien ticket
  |  + 0-RTT [GET /page.html]     →  |   + envoie sa requete immediatement !
  |                                    |
  |  ← Initial [ServerHello]          |   Le serveur valide le ticket
  |  ← 1-RTT [200 OK + donnees]      |   et repond directement
  |                                    |
  Total : 0 RTT ! La requete part avec le premier paquet.
```

> **Attention securite** : les donnees 0-RTT ne sont pas protegees contre le **replay attack**. Un attaquant pourrait capturer le paquet 0-RTT et le renvoyer. C'est pourquoi le 0-RTT ne doit etre utilise que pour des requetes **idempotentes** (GET, pas POST).

### 6.3 Migration de connexion : le changement de reseau transparent

C'est l'un des avantages les plus concrets de QUIC pour les utilisateurs mobiles :

```
SCENARIO : Tu regardes une video YouTube sur ton telephone

AVEC TCP (HTTP/2) :
====================
1. Tu es en WiFi a la maison
   → Connexion TCP : (192.168.1.42:54321 → 142.250.x.x:443)

2. Tu sors de chez toi, le WiFi se deconnecte
   → L'IP change : 192.168.1.42 → 10.0.0.1 (4G)
   → TCP : "cette connexion n'existe plus !" (IP source differente)
   → Le navigateur doit :
     a. Detecter la deconnexion (timeout ~30s)
     b. Ouvrir une NOUVELLE connexion TCP (1 RTT)
     c. Negocier TLS (1 RTT supplementaire)
     d. Re-demander la ressource
   → Resultat : interruption de 2-5 secondes, buffering video

AVEC QUIC (HTTP/3) :
=====================
1. Tu es en WiFi a la maison
   → Connexion QUIC : Connection ID = 0xABCD1234

2. Tu sors de chez toi, le WiFi se deconnecte
   → L'IP change : 192.168.1.42 → 10.0.0.1 (4G)
   → QUIC : "meme Connection ID 0xABCD1234, je continue !"
   → Le serveur reconnaît la connexion par son ID, pas par l'IP
   → Resultat : transition transparente, pas de buffering
```

```
Pourquoi ca marche ?

TCP identifie une connexion par :
  (IP source, Port source, IP destination, Port destination)
  → Si l'IP change, la connexion est PERDUE

QUIC identifie une connexion par :
  Connection ID (nombre aleatoire de 64 bits)
  → L'IP peut changer, le Connection ID reste le meme
  → Le serveur sait que c'est le meme client
```

### 6.4 Multiplexage sans Head-of-Line blocking : pourquoi c'est si important

HTTP/2 a resolu le HoL blocking au niveau HTTP, mais TCP ramene le probleme au niveau transport. Voici une comparaison concrete avec des chiffres :

```
Scenario : 3 streams, taux de perte de paquet = 2%

HTTP/2 sur TCP :
================
Perte d'1 paquet sur le stream 2
→ TCP bloque TOUT pendant la retransmission (~1 RTT = 50ms)
→ Streams 1 et 3 sont bloques pour RIEN
→ Impact : +50ms de latence sur TOUTES les ressources

Impact reel mesure (Google, 2017) :
  - Reseau Wi-Fi (0.1% perte) : HTTP/2 ≈ HTTP/3
  - Reseau 4G (1-2% perte) : HTTP/3 est 5-15% plus rapide
  - Reseau mauvais (5% perte) : HTTP/3 est 20-40% plus rapide
  - Reseau tres mauvais (10% perte) : HTTP/2 devient PLUS LENT que HTTP/1.1 !
    (car HTTP/1.1 ouvre 6 connexions TCP independantes)

HTTP/3 sur QUIC :
=================
Perte d'1 paquet sur le stream 2
→ QUIC retransmet UNIQUEMENT pour le stream 2
→ Streams 1 et 3 continuent sans interruption
→ Impact : +50ms sur le stream 2 seulement
```

### 6.5 Etat du deploiement HTTP/3 (2026)

```
ADOPTION HTTP/3 PAR LES SERVICES :
====================================
Cloudflare  : ✅ Active par defaut depuis 2022
Google      : ✅ YouTube, Search, Gmail, Maps
Facebook    : ✅ Toutes les apps
Shopify     : ✅ Toutes les boutiques
Fastly      : ✅ Support CDN
Akamai      : ✅ Support CDN
AWS (ALB)   : ✅ Depuis 2024
Nginx       : ⚠️  Support experimental (via quiche ou ngtcp2)
Apache      : ❌ Pas de support natif
Caddy       : ✅ Support natif

SUPPORT NAVIGATEURS :
=======================
Chrome      : ✅ Depuis Chrome 87 (2020)
Firefox     : ✅ Depuis Firefox 88 (2021)
Safari      : ✅ Depuis Safari 16 (2022)
Edge        : ✅ (base Chromium)
curl        : ✅ Depuis 7.66 (avec --http3)
```

---

## 7. Compression HTTP : zstd, Brotli et gzip

### 7.1 Pourquoi la compression compte pour le caching

La compression reduit la taille des reponses HTTP, ce qui impacte directement :
- **Le temps de transfert** : moins d'octets = plus rapide
- **La taille du cache** : reponses plus petites = plus de ressources en cache
- **La bande passante** : economies significatives sur mobile et connexions lentes

### 7.2 Les trois algorithmes

```
GZIP (1992)                    BROTLI (2015)                 ZSTD (2015)
============                   ==============                ============
Le veteran.                    Le champion du web.           Le nouveau challenger.
Supporte partout.              Meilleur ratio que gzip.      Ultra-rapide en
                               Optimise pour le web          compression ET
                               (dictionnaire HTML/CSS/JS).   decompression.

Ratio moyen : ~70%            Ratio moyen : ~75-80%         Ratio moyen : ~75-80%
Vitesse comp : rapide         Vitesse comp : lente a moyenne Vitesse comp : TRES rapide
Vitesse decomp : rapide       Vitesse decomp : rapide       Vitesse decomp : TRES rapide
```

### 7.3 Comparaison detaillee

| Critère | gzip | Brotli | zstd |
|---------|------|--------|------|
| **Ratio de compression** | ~70% | ~75-80% | ~75-80% |
| **Vitesse compression** | Rapide | Lente (niveaux hauts) | Très rapide |
| **Vitesse décompression** | Rapide | Rapide | Très rapide |
| **Niveaux** | 1-9 | 1-11 | 1-22 |
| **Header HTTP** | `Content-Encoding: gzip` | `Content-Encoding: br` | `Content-Encoding: zstd` |
| **Accept-Encoding** | `gzip` | `br` | `zstd` |
| **Support Chrome** | Depuis toujours | Depuis Chrome 49 (2016) | Depuis Chrome 123 (2024) |
| **Support Firefox** | Depuis toujours | Depuis Firefox 44 (2016) | Depuis Firefox 126 (2024) |
| **Support Safari** | Depuis toujours | Depuis Safari 11 (2017) | Depuis Safari 18 (2024) |
| **Support Node.js** | `zlib` natif | `zlib.brotli*` natif | Via packages tiers |
| **Cas d'usage ideal** | Compatibilité maximale | Assets statiques (CDN) | Streaming, logs, temps réel |

### 7.4 Negociation de la compression

```
CLIENT → SERVEUR
=================
GET /app.js HTTP/2
Accept-Encoding: zstd, br, gzip
                  ^     ^   ^
                  |     |   └─ Fallback : gzip (toujours supporte)
                  |     └───── Prefere : brotli (meilleur ratio)
                  └─────────── Meilleur : zstd (si disponible)

Le serveur choisit le MEILLEUR algorithme supporte :
1. Si le serveur supporte zstd → Content-Encoding: zstd
2. Sinon si brotli → Content-Encoding: br
3. Sinon → Content-Encoding: gzip

SERVEUR → CLIENT
=================
HTTP/2 200 OK
Content-Encoding: zstd
Content-Type: application/javascript
Vary: Accept-Encoding       ← IMPORTANT pour le cache !

[donnees compressees en zstd]
```

> **Le header Vary** : `Vary: Accept-Encoding` indique aux caches intermediaires (CDN, proxy) qu'ils doivent stocker une version par algorithme de compression. Sans ce header, un CDN pourrait servir la version gzip a un client qui supporte brotli.

### 7.5 Quand utiliser quel algorithme ?

```
Assets statiques (CSS, JS, HTML) servis par un CDN :
→ BROTLI (niveau 11) — compresse une fois, sert des millions de fois
  Le temps de compression ne compte pas, seul le ratio compte.

Reponses API dynamiques (JSON) :
→ ZSTD (niveau 3-5) — compression rapide, bon ratio
  ou GZIP (niveau 6) si compatibilite maximale requise.

Streaming de donnees (SSE, WebSocket, logs) :
→ ZSTD (niveau 1-3) — le plus rapide en compression et decompression
  Ideal pour les flux temps reel ou la latence est critique.

Transferts entre services (microservices) :
→ ZSTD (niveau 3) — meilleur compromis vitesse/ratio
  Les navigateurs ne sont pas impliques, pas de souci de compatibilite.
```

### 7.6 Configuration serveur

```typescript
// Exemple avec un middleware Express pour gzip + brotli
import compression from 'compression';
import express from 'express';

const app = express();

// compression() gere automatiquement gzip et deflate
// Pour brotli, utiliser shrink-ray-current ou iltorb
app.use(compression({
  level: 6,                          // Niveau gzip (1-9)
  threshold: 1024,                   // Ne pas compresser < 1 Ko
  filter: (req, res) => {
    // Ne pas compresser les images (deja compressees)
    if (res.getHeader('Content-Type')?.toString().startsWith('image/')) {
      return false;
    }
    return compression.filter(req, res);
  },
}));
```

```nginx
# Configuration Nginx pour gzip + brotli + zstd
# gzip
gzip on;
gzip_comp_level 6;
gzip_types text/plain text/css application/json application/javascript;
gzip_min_length 1024;

# brotli (module ngx_brotli)
brotli on;
brotli_comp_level 6;
brotli_types text/plain text/css application/json application/javascript;
brotli_min_length 1024;

# zstd (module ngx_zstd — experimental en 2026)
# zstd on;
# zstd_comp_level 3;
# zstd_types text/plain text/css application/json application/javascript;
```

---

## Points clés

1. **HTTP/1.1** souffre du Head-of-Line blocking, de la limite de 6 connexions et des headers non compresses.
2. **HTTP/2** resout ces problèmes avec le multiplexage (streams sur 1 connexion), HPACK (compression headers) et les priorites.
3. **HTTP/2 ne change pas les mécanismes de cache** (Cache-Control, ETag fonctionnent identiquement) mais rend obsoletes certaines optimisations (domain sharding, sprites, concatenation).
4. **HTTP/3 utilise QUIC (UDP)** pour eliminer le HoL blocking au niveau transport, et offre le 0-RTT et la migration de connexion.
5. **La negociation de protocole est automatique** : le navigateur essaie le meilleur protocole disponible et fait du fallback si nécessaire.

---

## Lab associe

-> `labs/02-comparer-http1-http2.md` — Mesurer la différence de performance entre HTTP/1.1 et HTTP/2

---

## Pour aller plus loin

- [HTTP/2 Explained — Daniel Stenberg](https://http2-explained.haxx.se/fr)
- [HTTP/3 Explained — Daniel Stenberg](https://http3-explained.haxx.se/)
- [Can I Use — HTTP/2](https://caniuse.com/http2)
- [Can I Use — HTTP/3](https://caniuse.com/http3)
- [Cloudflare — HTTP/3: the past, the present, and the future](https://blog.cloudflare.com/http3-the-past-present-and-future/)
- [web.dev — Introduction to HTTP/2](https://web.dev/articles/performance-http2)

---

## Si tu es perdu

**Retiens juste ceci :**

- **HTTP/1.1** : une file d'attente par connexion, maximum 6 connexions. Comme 6 caisses de supermarche avec des files separees.
- **HTTP/2** : une seule connexion avec des "voies" virtuelles (streams). Comme un guichet unique ultra-rapide qui géré tout le monde en parallele.
- **HTTP/3** : pareil que HTTP/2 mais sur un meilleur "tuyau" (QUIC au lieu de TCP) qui ne bloque pas tout quand un paquet est perdu.

Pour le cache, les trois versions utilisent **exactement les memes headers** (Cache-Control, ETag, etc.). La différence est juste dans la vitesse de transport.

---

## Defi

### Analyse comparative dans DevTools

**Objectif** : Observer les différences entre HTTP/1.1 et HTTP/2 dans Chrome DevTools.

**Etapes :**

1. Ouvre Chrome DevTools (F12) > Network
2. Active la colonne "Protocol" (clic droit sur l'en-tete des colonnes)
3. Visite les sites suivants et note le protocole utilise :
   - `https://www.google.com` (probablement h3)
   - `https://www.wikipedia.org` (probablement h2)
   - `http://httpbin.org` (probablement http/1.1)

4. Pour chaque site, reponds a :
   - Quel protocole est utilise ?
   - Combien de connexions TCP sont ouvertes ? (onglet "Connection ID")
   - Y a-t-il un header `Alt-Svc` dans les réponses ?
   - Quel est le waterfall ? Les requêtes demarrent-elles en parallele ?

<details>
<summary>Ce que tu devrais observer</summary>

- **google.com** : Utilise HTTP/3 (h3). Tu devrais voir `alt-svc: h3=":443"` dans les headers de réponse. Toutes les requêtes partagent une seule connexion. Le waterfall montre des requêtes en parallele.

- **wikipedia.org** : Utilise HTTP/2 (h2). Une seule connexion TCP pour toutes les requêtes. Le multiplexage est visible dans le waterfall.

- **httpbin.org** : Peut utiliser HTTP/1.1. Tu verras potentiellement plusieurs connexions TCP, et les requêtes sont plus sequentielles.

La différence la plus visible est dans le **waterfall** : avec HTTP/2 et HTTP/3, les requêtes demarrent presque toutes en même temps, alors qu'en HTTP/1.1 elles sont echelonnees par lots de 6.

</details>

---

## Navigation

| Précédent | Suivant |
|:---------:|:-------:|
| [Module 01 — Le protocole HTTP en profondeur](./01-protocole-http.md) | [Module 03 — Les en-tetes HTTP](./03-en-tetes-http.md) |

---

<!-- parcours-recommande -->

::: tip Parcours recommandé
1. **Screencast** : [screencast 02 http2 http3](../screencasts/screencast-02-http2-http3.md)
2. **Lab** : [lab-02-http2-multiplexing](../labs/lab-02-http2-multiplexing/README)
3. **Quiz** : [quiz 02 http2 http3](../quizzes/quiz-02-http2-http3.html)
:::
