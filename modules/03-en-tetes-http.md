# Module 03 — Les en-tetes HTTP

> **Objectif** : Maitriser les en-tetes HTTP essentiels, comprendre la negociation de contenu, les headers CORS, et surtout l'impact critique de `Vary` sur le caching.
> **Difficulte** : ⭐⭐ (Intermediaire)

---

## 1. Introduction aux en-tetes HTTP

### 1.1 L'analogie des etiquettes sur un colis

Les en-tetes HTTP sont comme les **etiquettes collees sur un colis** postal :

```
+--------------------------------------------------+
|  COLIS (Message HTTP)                            |
|                                                  |
|  +--------------------------------------------+  |
|  | ETIQUETTES (Headers)                       |  |
|  |                                            |  |
|  | Destinataire: api.example.com    (Host)    |  |
|  | Type de contenu: JSON           (Content-Type)|
|  | Poids: 2.3 kg                   (Content-Length)|
|  | Fragile !                       (Cache-Control) |
|  | Date d'envoi: 7 mars 2026       (Date)     |  |
|  | Ne pas ouvrir avant le 14 mars  (Expires)  |  |
|  | Empreinte: #ABC123              (ETag)      |  |
|  +--------------------------------------------+  |
|                                                  |
|  +--------------------------------------------+  |
|  | CONTENU (Body)                              |  |
|  | {"name": "Alice", "age": 30}               |  |
|  +--------------------------------------------+  |
|                                                  |
+--------------------------------------------------+
```

### 1.2 Syntaxe d'un header

```
Nom-Du-Header: valeur
```

**Regles :**
- Le nom est **insensible a la casse** (`Content-Type` = `content-type`)
- La valeur peut contenir presque n'importe quoi
- Un header peut apparaitre **plusieurs fois** (les valeurs sont alors concatenees avec des virgules)
- En HTTP/2 et HTTP/3, les noms sont toujours en **minuscules**

```
# Exemples de headers
Content-Type: application/json
Cache-Control: public, max-age=3600
Accept: text/html, application/json
Set-Cookie: session=abc123
Set-Cookie: theme=dark           <-- Meme header, deux fois
```

### 1.3 Categories de headers

Les en-tetes se repartissent en plusieurs categories :

```
+------------------------------------------------------------------+
|                    CATEGORIES DE HEADERS                          |
+------------------------------------------------------------------+
|                                                                  |
|  GENERAUX (les deux sens)          REQUETE (client -> serveur)   |
|  +------------------------+        +---------------------------+ |
|  | Date                   |        | Host                      | |
|  | Connection             |        | User-Agent                | |
|  | Cache-Control          |        | Accept                    | |
|  | Transfer-Encoding      |        | Accept-Encoding           | |
|  +------------------------+        | Accept-Language           | |
|                                    | Authorization             | |
|  REPONSE (serveur -> client)       | If-None-Match             | |
|  +------------------------+        | If-Modified-Since         | |
|  | Server                 |        | Cookie                    | |
|  | Set-Cookie             |        | Origin                    | |
|  | WWW-Authenticate       |        | Referer                   | |
|  | Location               |        +---------------------------+ |
|  | Access-Control-*       |                                      |
|  +------------------------+        ENTITE (decrit le body)       |
|                                    +---------------------------+ |
|  CACHE (controle du cache)         | Content-Type              | |
|  +------------------------+        | Content-Length            | |
|  | Cache-Control          |        | Content-Encoding         | |
|  | ETag                   |        | Content-Language         | |
|  | Expires                |        | Content-Disposition      | |
|  | Last-Modified          |        +---------------------------+ |
|  | Vary                   |                                      |
|  +------------------------+                                      |
+------------------------------------------------------------------+
```

---

## 2. Content-Type, Content-Length, Content-Encoding

### 2.1 Content-Type : "Qu'est-ce qu'il y a dans le colis ?"

Le header `Content-Type` indique le **type MIME** du contenu.

**Analogie** : C'est comme l'etiquette "Fragile - Verre" ou "Denrees perissables" sur un colis. Ca dit au destinataire comment traiter le contenu.

```
Content-Type: type/sous-type; parametre=valeur
```

**Types MIME courants :**

| Content-Type                          | Utilisation                     |
|---------------------------------------|---------------------------------|
| `text/html; charset=utf-8`           | Pages HTML                      |
| `text/css`                            | Feuilles de style               |
| `text/javascript`                     | Code JavaScript                 |
| `application/json`                    | Donnees JSON (API)              |
| `application/xml`                     | Donnees XML                     |
| `application/octet-stream`            | Fichier binaire generique       |
| `image/png`                           | Image PNG                       |
| `image/jpeg`                          | Image JPEG                      |
| `image/webp`                          | Image WebP                      |
| `image/avif`                          | Image AVIF                      |
| `image/svg+xml`                       | Image SVG                       |
| `font/woff2`                          | Police WOFF2                    |
| `application/pdf`                     | Document PDF                    |
| `multipart/form-data`                 | Formulaire avec fichiers        |

```typescript
// server-content-types.ts
// Serveur qui repond avec differents Content-Types

import http, { type IncomingMessage, type ServerResponse } from 'node:http';

const server = http.createServer((req: IncomingMessage, res: ServerResponse) => {

  if (req.url === '/html') {
    // --- Reponse HTML ---
    res.writeHead(200, {
      'Content-Type': 'text/html; charset=utf-8',  // charset important !
    });
    res.end('<h1>Bonjour le monde !</h1>');
  }
  else if (req.url === '/json') {
    // --- Reponse JSON ---
    const data: { message: string; items: number[] } = { message: 'Bonjour', items: [1, 2, 3] };
    const body: string = JSON.stringify(data);
    res.writeHead(200, {
      'Content-Type': 'application/json',   // Le navigateur sait que c'est du JSON
      'Content-Length': Buffer.byteLength(body),  // Taille exacte en octets
    });
    res.end(body);
  }
  else if (req.url === '/css') {
    // --- Reponse CSS ---
    const css: string = 'body { background: #f0f0f0; font-family: sans-serif; }';
    res.writeHead(200, {
      'Content-Type': 'text/css; charset=utf-8',
    });
    res.end(css);
  }
  else if (req.url === '/svg') {
    // --- Reponse SVG ---
    const svg: string = '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100">' +
                '<circle cx="50" cy="50" r="40" fill="blue"/></svg>';
    res.writeHead(200, {
      'Content-Type': 'image/svg+xml',
    });
    res.end(svg);
  }
  else {
    res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Essaie /html, /json, /css ou /svg');
  }
});

server.listen(3000, () => console.log('http://localhost:3000'));
```

**Pourquoi Content-Type est crucial ?** Si tu envoies du HTML avec `Content-Type: text/plain`, le navigateur affichera le code source au lieu de rendre la page. Un mauvais Content-Type peut aussi causer des failles de securite (MIME sniffing).

### 2.2 Content-Length : "Combien pese le colis ?"

```
Content-Length: 4521
```

- Indique la taille **exacte** du body en octets
- Permet au client de savoir quand il a tout recu
- **Important pour le cache** : permet de verifier l'integrite du telechargement

```typescript
// Attention : Content-Length doit etre en OCTETS, pas en caracteres
const body: string = 'Cafe avec des accents : eee';
console.log(body.length);                    // 27 caracteres
console.log(Buffer.byteLength(body, 'utf8')); // 27 octets (ici pareil)

const bodyAccents: string = 'Cafe avec des accents : \u00e9\u00e8\u00ea';
console.log(bodyAccents.length);                    // 28 caracteres
console.log(Buffer.byteLength(bodyAccents, 'utf8')); // 31 octets (3 accents = 2 octets chacun)
```

### 2.3 Content-Encoding : "Comment le colis est emballe ?"

La compression HTTP reduit la taille des donnees transferees :

```
SANS COMPRESSION :
==================
Serveur --> [100 Ko de HTML brut] --> Client
Temps de transfert : ~50ms


AVEC COMPRESSION gzip :
========================
Serveur --> [Compression gzip] --> [25 Ko de HTML compresse] --> Client
                                                                   |
                                                          [Decompression]
                                                                   |
                                                          [100 Ko de HTML]
Temps de transfert : ~12ms
Gain : 75% de bande passante !
```

**Les algorithmes de compression :**

| Algorithme | Header                          | Ratio typique | Support  |
|------------|---------------------------------|---------------|----------|
| gzip       | `Content-Encoding: gzip`        | 70-80%        | Universel|
| deflate    | `Content-Encoding: deflate`     | 70-80%        | Ancien   |
| Brotli     | `Content-Encoding: br`          | 80-90%        | Moderne  |
| zstd       | `Content-Encoding: zstd`        | 85-92%        | Emergent |

**Brotli (br) est generalement meilleur que gzip** pour le texte web (HTML, CSS, JS, JSON).

```typescript
// server-compression.ts
// Serveur avec compression gzip et Brotli

import http, { type IncomingMessage, type ServerResponse } from 'node:http';
import zlib from 'node:zlib';    // Module de compression natif

const LARGE_HTML: string = `
<!DOCTYPE html>
<html>
<head><title>Page avec beaucoup de contenu</title></head>
<body>
${'<p>Lorem ipsum dolor sit amet, consectetur adipiscing elit.</p>\n'.repeat(100)}
</body>
</html>
`;

const server = http.createServer((req: IncomingMessage, res: ServerResponse) => {
  // Lire le header Accept-Encoding du client
  const acceptEncoding: string = (req.headers['accept-encoding'] as string) || '';

  console.log(`Accept-Encoding: ${acceptEncoding}`);
  console.log(`Taille originale: ${Buffer.byteLength(LARGE_HTML)} octets`);

  if (acceptEncoding.includes('br')) {
    // Le client accepte Brotli (meilleure compression)
    const compressed: Buffer = zlib.brotliCompressSync(Buffer.from(LARGE_HTML));
    console.log(`Taille Brotli: ${compressed.length} octets`);

    res.writeHead(200, {
      'Content-Type': 'text/html; charset=utf-8',
      'Content-Encoding': 'br',                    // Indique la compression
      'Content-Length': compressed.length,          // Taille COMPRESSEE
      'Cache-Control': 'max-age=60',
      'Vary': 'Accept-Encoding',                   // CRITIQUE ! (voir section 6)
    });
    res.end(compressed);
  }
  else if (acceptEncoding.includes('gzip')) {
    // Le client accepte gzip
    const compressed: Buffer = zlib.gzipSync(Buffer.from(LARGE_HTML));
    console.log(`Taille gzip: ${compressed.length} octets`);

    res.writeHead(200, {
      'Content-Type': 'text/html; charset=utf-8',
      'Content-Encoding': 'gzip',
      'Content-Length': compressed.length,
      'Cache-Control': 'max-age=60',
      'Vary': 'Accept-Encoding',
    });
    res.end(compressed);
  }
  else {
    // Pas de compression
    console.log('Pas de compression');
    res.writeHead(200, {
      'Content-Type': 'text/html; charset=utf-8',
      'Content-Length': Buffer.byteLength(LARGE_HTML),
      'Cache-Control': 'max-age=60',
      'Vary': 'Accept-Encoding',
    });
    res.end(LARGE_HTML);
  }
});

server.listen(3000, () => console.log('http://localhost:3000'));
```

**Tester :**

```bash
# Sans compression
curl -s -o /dev/null -w "Taille: %{size_download} octets\n" http://localhost:3000

# Avec gzip
curl -s -o /dev/null -w "Taille: %{size_download} octets\n" \
  -H "Accept-Encoding: gzip" http://localhost:3000

# Avec Brotli
curl -s -o /dev/null -w "Taille: %{size_download} octets\n" \
  -H "Accept-Encoding: br" http://localhost:3000
```

---

## 3. Negociation de contenu (Content Negotiation)

### 3.1 Le principe

La negociation de contenu permet au client de dire au serveur **sous quelle forme** il souhaite la reponse. C'est comme commander un cafe : "Un cafe, s'il vous plait. De preference un expresso, sinon un allonge ira aussi."

```
CLIENT                                          SERVEUR
  |                                                |
  |  GET /article/42                               |
  |  Accept: application/json, text/html;q=0.9     |
  |  Accept-Encoding: br, gzip                     |
  |  Accept-Language: fr-FR, fr;q=0.9, en;q=0.5    |
  |  ------------------------------------------->  |
  |                                                |
  |  Le serveur choisit la meilleure combinaison : |
  |  - Format: JSON (preference 1.0)               |
  |  - Compression: Brotli (br)                    |
  |  - Langue: Francais (fr-FR)                    |
  |                                                |
  |  HTTP/1.1 200 OK                               |
  |  Content-Type: application/json                 |
  |  Content-Encoding: br                           |
  |  Content-Language: fr-FR                        |
  |  Vary: Accept, Accept-Encoding, Accept-Language |
  |  <-------------------------------------------  |
```

### 3.2 Accept : "Quel format de reponse ?"

```
Accept: application/json                          # Je veux du JSON
Accept: text/html                                 # Je veux du HTML
Accept: text/html, application/json;q=0.9         # HTML de preference, JSON sinon
Accept: image/webp, image/png;q=0.8, image/*;q=0.5  # WebP > PNG > n'importe quelle image
Accept: */*                                       # N'importe quoi
```

**Le parametre `q` (quality)** indique la preference de 0 a 1 :

```
Accept: text/html;q=1.0, application/json;q=0.9, text/plain;q=0.5, */*;q=0.1
         ^^^^^^^^^^^^      ^^^^^^^^^^^^^^^^^^^^^^   ^^^^^^^^^^^^^^^  ^^^^^^^^
         Priorite 1 (100%) Priorite 2 (90%)        Priorite 3 (50%) Dernier recours (10%)
```

### 3.3 Accept-Encoding : "Quelle compression ?"

```
Accept-Encoding: br, gzip, deflate
                 ^^  ^^^^  ^^^^^^^
                 Brotli (prefere)
                      gzip (classique)
                             deflate (ancien)
```

Le navigateur moderne envoie typiquement : `Accept-Encoding: gzip, deflate, br`

### 3.4 Accept-Language : "Quelle langue ?"

```
Accept-Language: fr-FR, fr;q=0.9, en-US;q=0.8, en;q=0.7
                 ^^^^^  ^^^^^^^^^  ^^^^^^^^^^^^  ^^^^^^^^
                 Francais de France (preference max)
                         Francais generique (90%)
                                    Anglais US (80%)
                                                 Anglais generique (70%)
```

```typescript
// server-content-negotiation.ts
// Serveur avec negociation de contenu complete

import http, { type IncomingMessage, type ServerResponse } from 'node:http';

interface ArticleTranslation {
  [key: string]: string;
}

interface ArticlesByLang {
  fr: ArticleTranslation;
  en: ArticleTranslation;
}

const articles: Record<number, ArticlesByLang> = {
  42: {
    fr: { titre: 'Mon article en francais', contenu: 'Contenu francais...' },
    en: { title: 'My article in English', content: 'English content...' },
  }
};

const server = http.createServer((req: IncomingMessage, res: ServerResponse) => {
  if (req.url !== '/article/42') {
    res.writeHead(404);
    return res.end('Not found');
  }

  // --- Negocier la langue ---
  const acceptLang: string = (req.headers['accept-language'] as string) || 'en';
  const lang: 'fr' | 'en' = acceptLang.includes('fr') ? 'fr' : 'en';
  const article: ArticleTranslation = articles[42][lang];

  // --- Negocier le format ---
  const accept: string = (req.headers['accept'] as string) || 'text/html';

  if (accept.includes('application/json')) {
    // Reponse JSON
    const body: string = JSON.stringify(article);
    res.writeHead(200, {
      'Content-Type': 'application/json',
      'Content-Language': lang,
      'Cache-Control': 'max-age=300',
      'Vary': 'Accept, Accept-Language',    // CRUCIAL pour le cache
    });
    res.end(body);
  } else {
    // Reponse HTML
    const key: string = lang === 'fr' ? 'titre' : 'title';
    const contentKey: string = lang === 'fr' ? 'contenu' : 'content';
    res.writeHead(200, {
      'Content-Type': 'text/html; charset=utf-8',
      'Content-Language': lang,
      'Cache-Control': 'max-age=300',
      'Vary': 'Accept, Accept-Language',
    });
    res.end(`<html><body><h1>${article[key]}</h1><p>${article[contentKey]}</p></body></html>`);
  }
});

server.listen(3000, () => console.log('http://localhost:3000'));
```

**Tester :**

```bash
# JSON en francais
curl -H "Accept: application/json" -H "Accept-Language: fr" http://localhost:3000/article/42

# HTML en anglais
curl -H "Accept: text/html" -H "Accept-Language: en" http://localhost:3000/article/42

# JSON en anglais
curl -H "Accept: application/json" -H "Accept-Language: en" http://localhost:3000/article/42
```

---

## 4. Les headers CORS

### 4.1 Le probleme des origines croisees

**Analogie** : Imagine un immeuble securise. Chaque appartement (origine) a sa propre serrure. Tu ne peux pas entrer dans l'appartement du voisin (autre origine) sans sa permission explicite.

```
MEME ORIGINE (Same-Origin) :
  https://example.com/page1 --> https://example.com/api/data   OK !
  (meme protocole + meme domaine + meme port)

ORIGINES DIFFERENTES (Cross-Origin) :
  https://mon-site.com --> https://api.autre-site.com/data    BLOQUE !
  (domaines differents)

  http://example.com --> https://example.com/data              BLOQUE !
  (protocoles differents)

  https://example.com --> https://example.com:8080/data        BLOQUE !
  (ports differents)
```

### 4.2 Les headers CORS essentiels

```
REQUETE PREFLIGHT (OPTIONS)                 REPONSE DU SERVEUR
================================            ================================

OPTIONS /api/data HTTP/1.1                  HTTP/1.1 204 No Content
Host: api.example.com                       Access-Control-Allow-Origin: https://mon-site.com
Origin: https://mon-site.com                Access-Control-Allow-Methods: GET, POST, PUT
Access-Control-Request-Method: POST         Access-Control-Allow-Headers: Content-Type, Authorization
Access-Control-Request-Headers:             Access-Control-Max-Age: 86400
  Content-Type, Authorization
```

| Header CORS                          | Direction         | Description                                    |
|--------------------------------------|-------------------|------------------------------------------------|
| `Origin`                             | Requete           | L'origine de la page qui fait la requete       |
| `Access-Control-Allow-Origin`        | Reponse           | Origines autorisees (`*` ou une URL specifique)|
| `Access-Control-Allow-Methods`       | Reponse           | Methodes HTTP autorisees                       |
| `Access-Control-Allow-Headers`       | Reponse           | Headers personnalises autorises                |
| `Access-Control-Max-Age`             | Reponse           | Duree de cache du preflight (en secondes)      |
| `Access-Control-Allow-Credentials`   | Reponse           | Autoriser les cookies cross-origin             |
| `Access-Control-Expose-Headers`      | Reponse           | Headers visibles par le JavaScript client      |

### 4.3 Impact de CORS sur le cache

**`Access-Control-Max-Age`** est un header de cache specifique aux preflight :

```
Access-Control-Max-Age: 86400    # Cacher le preflight pendant 24h

SANS max-age :
  Requete 1: OPTIONS (preflight) --> POST (requete reelle)
  Requete 2: OPTIONS (preflight) --> POST (requete reelle)  <-- Preflight refait !
  Requete 3: OPTIONS (preflight) --> POST (requete reelle)  <-- Encore !

AVEC max-age: 86400 :
  Requete 1: OPTIONS (preflight) --> POST (requete reelle)
  Requete 2: POST (requete reelle)    <-- Pas de preflight !
  Requete 3: POST (requete reelle)    <-- Pas de preflight !
  ...pendant 24h...
```

```typescript
// server-cors.ts
// Serveur avec CORS configure correctement

import http, { type IncomingMessage, type ServerResponse } from 'node:http';

const ALLOWED_ORIGINS: string[] = ['http://localhost:5173', 'https://mon-site.com'];

const server = http.createServer((req: IncomingMessage, res: ServerResponse) => {
  const origin: string | undefined = req.headers['origin'];

  // Verifier si l'origine est autorisee
  if (origin && ALLOWED_ORIGINS.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    // IMPORTANT : Vary: Origin si la reponse depend de l'origine
    res.setHeader('Vary', 'Origin');
  }

  // --- Requete preflight ---
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader('Access-Control-Max-Age', '86400');  // Cache 24h
    res.writeHead(204);
    return res.end();
  }

  // --- Requete normale ---
  if (req.url === '/api/data') {
    res.writeHead(200, {
      'Content-Type': 'application/json',
      'Cache-Control': 'max-age=60',
    });
    res.end(JSON.stringify({ data: 'Donnees de API' }));
  } else {
    res.writeHead(404);
    res.end('Not found');
  }
});

server.listen(3000, () => console.log('API CORS sur http://localhost:3000'));
```

---

## 5. Transfer-Encoding: chunked

### 5.1 Le probleme : reponses de taille inconnue

Parfois, le serveur ne connait pas a l'avance la taille de la reponse. Par exemple, quand il genere du contenu dynamiquement ou streame des donnees.

**Analogie** : Au lieu d'envoyer un gros colis, tu envoies une serie de petits paquets numerotes. Le destinataire sait que c'est fini quand il recoit un paquet vide.

```
REPONSE CLASSIQUE (Content-Length connu)
=========================================
HTTP/1.1 200 OK
Content-Length: 4521        <-- "Le colis fait 4521 octets"

[4521 octets de donnees]


REPONSE CHUNKED (taille inconnue)
===================================
HTTP/1.1 200 OK
Transfer-Encoding: chunked  <-- "Je t'envoie par morceaux"

1a                          <-- Taille du morceau en hexadecimal (26 octets)
Voici le premier morceau
15                          <-- 21 octets
Et voici le deuxieme
12                          <-- 18 octets
Et le dernier ...
0                           <-- Morceau de taille 0 = FIN
                            <-- Ligne vide finale
```

### 5.2 Chunked en pratique avec Node.js

```typescript
// server-chunked.ts
// Serveur qui envoie une reponse en morceaux (streaming)

import http, { type IncomingMessage, type ServerResponse } from 'node:http';

const server = http.createServer((req: IncomingMessage, res: ServerResponse) => {

  if (req.url === '/stream') {
    // --- Reponse streamee ---
    res.writeHead(200, {
      'Content-Type': 'text/plain; charset=utf-8',
      'Transfer-Encoding': 'chunked',    // Node.js l'ajoute automatiquement
      // PAS de Content-Length ! (incompatible avec chunked)
      'Cache-Control': 'no-store',       // On ne cache pas les streams
    });

    let count: number = 0;
    const interval: ReturnType<typeof setInterval> = setInterval(() => {
      count++;
      res.write(`Morceau ${count} envoye a ${new Date().toISOString()}\n`);

      if (count >= 5) {
        clearInterval(interval);
        res.end('--- FIN DU STREAM ---\n');  // Dernier morceau + fin
      }
    }, 1000);  // Un morceau par seconde

  } else if (req.url === '/sse') {
    // --- Server-Sent Events (SSE) ---
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',   // Type MIME special pour SSE
      'Cache-Control': 'no-cache',           // Pas de cache pour les evenements
      'Connection': 'keep-alive',
    });

    let eventId: number = 0;
    const interval: ReturnType<typeof setInterval> = setInterval(() => {
      eventId++;
      // Format SSE : "data: <contenu>\n\n"
      res.write(`id: ${eventId}\ndata: {"time": "${new Date().toISOString()}", "count": ${eventId}}\n\n`);

      if (eventId >= 10) {
        clearInterval(interval);
        res.end();
      }
    }, 2000);

    // Si le client se deconnecte
    req.on('close', () => {
      clearInterval(interval);
      console.log('Client deconnecte du SSE');
    });

  } else {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('Essaie /stream ou /sse');
  }
});

server.listen(3000, () => console.log('http://localhost:3000'));
```

**Tester :**

```bash
# Voir les morceaux arriver un par un
curl -N http://localhost:3000/stream

# Voir les events SSE
curl -N http://localhost:3000/sse
```

**Pourquoi Transfer-Encoding est important pour le cache ?** Une reponse chunked **sans Content-Length** est plus difficile a cacher car le cache ne sait pas quelle taille allouer. De plus, les reponses streamees (SSE) ne sont generalement **jamais cachees**.

---

## 6. Vary — L'en-tete le plus important pour le cache

### 6.1 Le probleme sans Vary

**Analogie** : Imagine un bureau de poste qui garde une copie de chaque lettre qu'il distribue. Un client francophone demande la lettre #42 et recoit la version francaise. Le bureau garde cette copie. Ensuite, un client anglophone demande aussi la lettre #42. Le bureau lui donne... la version francaise ! C'est un bug.

```
PROBLEME SANS VARY :
=====================

Requete 1 (navigateur Chrome, avec gzip) :
  GET /page.html
  Accept-Encoding: gzip

  Reponse : Content-Encoding: gzip + [donnees compressees gzip]
  --> Le cache stocke : /page.html = [donnees gzip]

Requete 2 (vieux navigateur, sans compression) :
  GET /page.html
  Accept-Encoding: (absent)

  Le cache dit : "J'ai /page.html en cache !"
  --> Il renvoie les donnees gzip au client qui ne les comprend PAS
  --> PAGE CASSEE !
```

### 6.2 La solution : Vary

Le header `Vary` dit au cache : **"Cette reponse depend de tel(s) header(s) de la requete. Stocke une version differente pour chaque combinaison."**

```
AVEC VARY: Accept-Encoding
============================

Le cache stocke maintenant :

CLE DE CACHE                              VALEUR EN CACHE
/page.html + Accept-Encoding: gzip   --> [reponse gzip]
/page.html + Accept-Encoding: br     --> [reponse Brotli]
/page.html + Accept-Encoding: (vide) --> [reponse non compressee]

Requete avec gzip    -> cache sert la version gzip
Requete avec br      -> cache sert la version Brotli
Requete sans encoding -> cache sert la version non compressee
```

```
Vary: Accept-Encoding
Vary: Accept-Encoding, Accept-Language
Vary: Accept-Encoding, Accept-Language, Origin
Vary: *                                           # NE JAMAIS CACHER (chaque requete est unique)
```

### 6.3 Vary en detail

```
+---------------------------------------------------------------------+
|                    IMPACT DE VARY SUR LE CACHE                       |
+---------------------------------------------------------------------+
|                                                                     |
| Sans Vary :                                                         |
|   Cle de cache = URL                                                |
|   /page.html --> 1 seule version en cache                           |
|                                                                     |
| Vary: Accept-Encoding :                                             |
|   Cle de cache = URL + Accept-Encoding                              |
|   /page.html + gzip    --> version gzip                             |
|   /page.html + br      --> version Brotli                           |
|   /page.html + identity --> version non compressee                  |
|                                                                     |
| Vary: Accept-Encoding, Accept-Language :                            |
|   Cle de cache = URL + Accept-Encoding + Accept-Language            |
|   /page.html + gzip + fr --> version gzip francaise                 |
|   /page.html + gzip + en --> version gzip anglaise                  |
|   /page.html + br   + fr --> version Brotli francaise               |
|   /page.html + br   + en --> version Brotli anglaise                |
|   = 4 versions en cache ! (2 encodages x 2 langues)                |
|                                                                     |
| Vary: * :                                                           |
|   Cle de cache = ??? (impossible a determiner)                      |
|   = Ressource non cachable !                                        |
|                                                                     |
+---------------------------------------------------------------------+
```

**Pourquoi Vary est CRITIQUE ?**

1. **Sans Vary** sur un serveur qui fait de la negociation de contenu, les clients recevront potentiellement la **mauvaise version** depuis le cache.
2. **Trop de Vary** (ex: `Vary: User-Agent`) explose le nombre de versions en cache, rendant le cache inefficace.
3. **Vary: Cookie** est particulierement problematique car chaque utilisateur a des cookies differents, ce qui rend le cache pratiquement inutile pour les caches partages (CDN, proxy).

### 6.4 Les pieges de Vary

```
PIEGE 1 : Vary: User-Agent
============================
Il existe des MILLIERS de User-Agents differents.
Chaque combinaison URL + User-Agent = une entree de cache differente.
Le cache devient ENORME et le taux de hit CHUTE.

Mauvais  : Vary: User-Agent
Meilleur : Utiliser Client Hints (Sec-CH-UA) qui ont moins de variantes


PIEGE 2 : Vary: Cookie
========================
Chaque utilisateur a des cookies differents.
Un cache CDN avec Vary: Cookie ne sert pratiquement JAMAIS de cache hit.

Mauvais  : Vary: Cookie
Meilleur : Utiliser Cache-Control: private (cache navigateur seulement)


PIEGE 3 : Oublier Vary quand c'est necessaire
================================================
Si le serveur repond differemment selon Accept-Encoding
mais OUBLIE Vary: Accept-Encoding, le cache peut servir
une version gzip a un client qui ne comprend pas gzip.
```

### 6.5 Serveur complet avec Vary

```typescript
// server-vary.ts
// Demonstration de l'impact de Vary sur le cache

import http, { type IncomingMessage, type ServerResponse } from 'node:http';
import zlib from 'node:zlib';

const CONTENT: Record<string, string> = {
  fr: '<html><body><h1>Bonjour le monde !</h1></body></html>',
  en: '<html><body><h1>Hello World!</h1></body></html>',
};

const server = http.createServer((req: IncomingMessage, res: ServerResponse) => {
  // --- Determiner la langue ---
  const acceptLang: string = (req.headers['accept-language'] as string) || 'en';
  const lang: string = acceptLang.includes('fr') ? 'fr' : 'en';
  const html: string = CONTENT[lang];

  // --- Determiner la compression ---
  const acceptEnc: string = (req.headers['accept-encoding'] as string) || '';
  let body: Buffer;
  let encoding: string | null = null;

  if (acceptEnc.includes('br')) {
    body = zlib.brotliCompressSync(Buffer.from(html));
    encoding = 'br';
  } else if (acceptEnc.includes('gzip')) {
    body = zlib.gzipSync(Buffer.from(html));
    encoding = 'gzip';
  } else {
    body = Buffer.from(html);
  }

  // --- Construire les headers de reponse ---
  const headers: Record<string, string | number> = {
    'Content-Type': 'text/html; charset=utf-8',
    'Content-Language': lang,
    'Content-Length': body.length,
    'Cache-Control': 'public, max-age=3600',

    // VARY est CRITIQUE ici !
    // La reponse depend de Accept-Encoding ET Accept-Language.
    // Sans ce header, un cache intermediaire (CDN, proxy)
    // pourrait servir la version francaise gzip a un client
    // anglophone sans compression.
    'Vary': 'Accept-Encoding, Accept-Language',
  };

  if (encoding) {
    headers['Content-Encoding'] = encoding;
  }

  res.writeHead(200, headers);
  res.end(body);

  console.log(`Reponse: lang=${lang}, encoding=${encoding || 'none'}, size=${body.length}`);
});

server.listen(3000, () => {
  console.log('http://localhost:3000');
  console.log('');
  console.log('Teste avec :');
  console.log('  curl -H "Accept-Language: fr" -H "Accept-Encoding: gzip" http://localhost:3000');
  console.log('  curl -H "Accept-Language: en" -H "Accept-Encoding: br" http://localhost:3000');
  console.log('  curl -H "Accept-Language: fr" http://localhost:3000');
});
```

---

## 7. Tableau recapitulatif des headers essentiels

| Header                         | Direction | Lien avec le cache                                    |
|--------------------------------|-----------|-------------------------------------------------------|
| `Cache-Control`                | Les deux  | Controle principal du cache (Module 04)               |
| `ETag`                         | Reponse   | Identifiant de version pour revalidation (Module 05)  |
| `Last-Modified`                | Reponse   | Date de derniere modification (Module 05)             |
| `If-None-Match`                | Requete   | Revalidation avec ETag (Module 05)                    |
| `If-Modified-Since`            | Requete   | Revalidation avec date (Module 05)                    |
| `Expires`                      | Reponse   | Date d'expiration (ancien, preferer Cache-Control)    |
| `Vary`                         | Reponse   | Definit la cle de cache (CRITIQUE)                    |
| `Content-Encoding`             | Reponse   | Compression (impacte Vary)                            |
| `Accept-Encoding`              | Requete   | Compression souhaitee (impacte Vary)                  |
| `Content-Type`                 | Les deux  | Type de contenu (le cache doit le preserver)          |
| `Content-Length`               | Les deux  | Taille du body (verification d'integrite)             |
| `Transfer-Encoding`            | Reponse   | Chunked = difficile a cacher                          |
| `Access-Control-Max-Age`       | Reponse   | Cache du preflight CORS                               |
| `Age`                          | Reponse   | Temps passe dans un cache intermediaire (en secondes) |
| `Date`                         | Reponse   | Horodatage de la reponse originale                    |

---

## Points cles

1. **Content-Type** identifie le format du contenu. Un mauvais Content-Type casse l'affichage.
2. **Content-Encoding** (gzip, br) compresse le contenu. Brotli est generalement 15-20% meilleur que gzip.
3. **La negociation de contenu** (Accept, Accept-Encoding, Accept-Language) permet au serveur d'adapter la reponse au client.
4. **CORS** (Access-Control-*) controle les requetes cross-origin. `Access-Control-Max-Age` cache les preflights.
5. **Vary est CRITIQUE** : il dit au cache de stocker des versions differentes selon les headers de la requete. Sans lui, le cache peut servir la mauvaise version.
6. **`Vary: *`** rend une ressource non cachable. **`Vary: Cookie`** ou **`Vary: User-Agent`** rend le cache tres inefficace.

---

## Lab associe

-> `labs/03-negociation-et-vary.md` — Experimenter avec la negociation de contenu et observer l'impact de Vary

---

## Pour aller plus loin

- [MDN — HTTP Headers](https://developer.mozilla.org/fr/docs/Web/HTTP/Headers)
- [MDN — Content Negotiation](https://developer.mozilla.org/fr/docs/Web/HTTP/Content_negotiation)
- [MDN — CORS](https://developer.mozilla.org/fr/docs/Web/HTTP/CORS)
- [MDN — Vary](https://developer.mozilla.org/fr/docs/Web/HTTP/Headers/Vary)
- [Fastly — Best practices for using the Vary header](https://www.fastly.com/blog/best-practices-using-vary-header)

---

## Si tu es perdu

**Retiens juste trois choses :**

1. **Content-Type** dit "c'est du JSON" ou "c'est du HTML". Content-Encoding dit "c'est compresse avec gzip".
2. **Accept / Accept-Encoding / Accept-Language** : le client dit ce qu'il prefere, le serveur choisit la meilleure option.
3. **Vary** : quand le serveur repond differemment selon un header de la requete (ex: langue ou compression), il DOIT ajouter `Vary: <ce-header>` sinon le cache risque de servir la mauvaise version a certains clients.

---

## Defi

### Le cache corrompu

**Scenario** : Tu as un serveur qui repond en francais ou en anglais selon `Accept-Language`, et qui compresse en gzip ou Brotli selon `Accept-Encoding`. Un CDN (cache partage) est place devant le serveur.

**Probleme** : Un utilisateur francophone avec gzip fait la premiere requete. Le CDN cache la reponse. Ensuite, un utilisateur anglophone avec Brotli fait la meme requete. Que recoit-il ?

**Questions :**

1. Si le serveur n'a PAS de header Vary, que se passe-t-il ?
2. Si le serveur a `Vary: Accept-Language` (mais pas Accept-Encoding), que se passe-t-il ?
3. Quel header Vary faut-il pour que tout fonctionne correctement ?
4. Combien de versions differentes le CDN stockera-t-il au maximum ?

<details>
<summary>Reponses</summary>

1. **Sans Vary** : L'utilisateur anglophone recoit la version **francaise compressees en gzip** (la version cachee). C'est la mauvaise langue ET potentiellement le mauvais encodage.

2. **Avec `Vary: Accept-Language` seulement** : Le CDN stocke une version par langue. L'utilisateur anglophone recoit bien la version anglaise, MAIS elle est compresseee en gzip meme si son navigateur preferait Brotli. Pire : si le premier visiteur anglophone n'avait PAS de compression, tous les anglophones recevront la version non compressee.

3. **Il faut `Vary: Accept-Encoding, Accept-Language`** pour que le CDN distingue toutes les combinaisons.

4. **Au maximum : 2 langues x 3 encodages (br, gzip, aucun) = 6 versions** differentes de la meme URL dans le cache du CDN. C'est gerable. Mais si tu ajoutais `Vary: User-Agent`, ce serait des milliers de versions (un par navigateur x langue x encodage).

</details>
