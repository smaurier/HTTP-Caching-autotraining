# Module 13 — HTTP Streaming : envoyer les données au fil de l'eau

> **Objectif** : Maîtriser les mécanismes de streaming HTTP (chunked transfer, HTTP/2 streams, Web Streams API) et comprendre comment le streaming SSR transforme l'expérience utilisateur.
> **Difficulté** : ⭐⭐⭐⭐⭐

---

## 1. Transfer-Encoding: chunked

### 1.1 Le problème : Content-Length obligatoire ?

En HTTP/1.1, quand un serveur envoie une réponse, il devrait indiquer la taille totale via `Content-Length`. Mais que faire quand **on ne connaît pas la taille à l'avance** ? Par exemple, quand on génère du HTML à la volée, ou quand on transmet un fichier gigantesque.

La solution : **Transfer-Encoding: chunked**. Au lieu d'envoyer tout d'un coup, on envoie des **morceaux** (chunks), chacun précédé de sa taille.

**Analogie** : Imagine un serveur au restaurant. Au lieu d'attendre que tout le repas soit prêt pour l'apporter (mode classique), il apporte chaque plat **dès qu'il sort de la cuisine** : l'entrée d'abord, puis le plat, puis le dessert. Le client commence à manger plus tôt.

### 1.2 Le format wire (sur le réseau)

```
HTTP/1.1 200 OK
Transfer-Encoding: chunked
Content-Type: text/html

1a                          ← taille du chunk en hexadécimal (26 octets)
<html><body><h1>Bonjour    ← données du chunk
1c                          ← taille du chunk suivant (28 octets)
</h1><p>Contenu en cours...  ← données
12                          ← 18 octets
</p></body></html>          ← dernier morceau de données
0                           ← chunk de taille 0 = fin de la réponse
                            ← ligne vide finale (CRLF)
```

```
┌─────────────────────────────────────────────────┐
│            Réponse classique (buffered)          │
│                                                   │
│  Serveur : [calcule tout] ──────────────▶ Client │
│            ├── 2 secondes ──┤                     │
│  Client voit : rien... rien... TOUT D'UN COUP    │
└─────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────┐
│            Réponse chunked (streaming)           │
│                                                   │
│  Serveur : [chunk 1]──▶[chunk 2]──▶[chunk 3]──▶ │
│            ├─200ms─┤   ├─200ms─┤   ├─200ms─┤    │
│  Client voit : header... contenu... fin          │
│  (affichage progressif)                           │
└─────────────────────────────────────────────────┘
```

### 1.3 Implémentation avec Node.js

```js
// chunked-basic.mjs — Transfer-Encoding: chunked en action
import { createServer } from 'node:http';

const server = createServer((req, res) => {
  // Node.js active automatiquement Transfer-Encoding: chunked
  // quand on ne spécifie pas Content-Length et qu'on appelle write() plusieurs fois
  res.writeHead(200, {
    'Content-Type': 'text/html; charset=utf-8',
    // PAS de Content-Length → Node.js utilise chunked automatiquement
  });

  // Chunk 1 : le header HTML (envoyé immédiatement)
  res.write(`<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <title>Streaming Demo</title>
  <style>
    body { font-family: sans-serif; padding: 20px; }
    .chunk { padding: 10px; margin: 5px 0; border-left: 3px solid #2563eb; }
  </style>
</head>
<body>
  <h1>Réponse en streaming (chunked)</h1>
`);

  // Chunks suivants : envoyés progressivement
  let chunkNumber = 1;
  const interval = setInterval(() => {
    const timestamp = new Date().toISOString();
    res.write(`  <div class="chunk">
    Chunk #${chunkNumber} — reçu à ${timestamp}
  </div>\n`);

    chunkNumber++;
    if (chunkNumber > 5) {
      clearInterval(interval);
      res.write(`  <p><strong>Streaming terminé !</strong></p>
</body>
</html>`);
      res.end(); // Envoie le chunk final (taille 0)
    }
  }, 500); // Un chunk toutes les 500ms

  // Gestion de la déconnexion client
  req.on('close', () => {
    clearInterval(interval);
    console.log('Client déconnecté, streaming arrêté.');
  });
});

server.listen(3000, () => {
  console.log('Chunked streaming → http://localhost:3000');
  console.log('Observe dans le navigateur : le contenu apparaît progressivement.');
});
```

### 1.4 Observer le chunked encoding avec curl

```bash
# Voir les chunks en temps réel
curl -v --no-buffer http://localhost:3000

# Observer les en-têtes
curl -I http://localhost:3000
# → Transfer-Encoding: chunked (pas de Content-Length)
```

---

## 2. HTTP/2 Streams : multiplexage sur une seule connexion

### 2.1 Le problème de HTTP/1.1

En HTTP/1.1, chaque requête/réponse est **séquentielle** sur une connexion TCP. Le navigateur ouvre 6 connexions en parallèle pour contourner cette limite, mais c'est du gaspillage.

```
HTTP/1.1 — Séquentiel (head-of-line blocking)
═══════════════════════════════════════════════
Connexion 1: [──Req A──][──Resp A──][──Req C──][──Resp C──]
Connexion 2: [──Req B──][──Resp B──][──Req D──][──Resp D──]
Connexion 3: [──Req E──][──Resp E──]
             └── 6 connexions TCP ouvertes ──┘

HTTP/2 — Multiplexé (streams parallèles)
═══════════════════════════════════════════════
Connexion unique:
  Stream 1: [─frame─]    [─frame─]      [─frame─]
  Stream 3:    [─frame─]    [─frame─]
  Stream 5:       [─frame─]    [─frame─]   [─frame─]
  Stream 7:          [─frame─]
             └── 1 seule connexion TCP ──┘
```

### 2.2 Les frames HTTP/2

En HTTP/2, tout est découpé en **frames** (trames). Chaque frame appartient à un **stream** identifié par un numéro impair (streams client).

```
┌───────────────────────────────────────────┐
│              Frame HTTP/2                  │
├───────────────────────────────────────────┤
│  Length (24 bits)  │  Type (8 bits)       │
│  Flags (8 bits)   │  Stream ID (31 bits) │
├───────────────────────────────────────────┤
│  Payload (données)                        │
└───────────────────────────────────────────┘

Types de frames :
  DATA (0x0)      → Corps de la réponse
  HEADERS (0x1)   → En-têtes HTTP
  PRIORITY (0x2)  → Priorité du stream
  RST_STREAM (0x3) → Annuler un stream
  SETTINGS (0x4)  → Configuration connexion
  PUSH_PROMISE (0x5) → Server Push
  PING (0x6)      → Keepalive
  GOAWAY (0x7)    → Fermeture gracieuse
  WINDOW_UPDATE (0x8) → Flow control
```

### 2.3 Simuler le multiplexage HTTP/2

```js
// http2-multiplex-sim.mjs — Simuler le multiplexage HTTP/2
import { createServer } from 'node:http';

// Simule plusieurs "streams" multiplexés sur une seule réponse
// (En vrai HTTP/2, c'est géré nativement par le protocole)

const server = createServer(async (req, res) => {
  if (req.url !== '/multiplex-demo') {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(`<h1>HTTP/2 Multiplex Simulation</h1>
      <a href="/multiplex-demo">Voir la démo</a>`);
    return;
  }

  res.writeHead(200, {
    'Content-Type': 'text/html; charset=utf-8',
  });

  res.write(`<!DOCTYPE html><html><body>
    <h1>Simulation de multiplexage HTTP/2</h1>
    <pre id="log">\n`);

  // Simuler 4 "streams" concurrents avec des durées différentes
  const streams = [
    { id: 1, name: 'CSS principal',     size: '45KB',  duration: 200 },
    { id: 3, name: 'JavaScript app.js', size: '120KB', duration: 600 },
    { id: 5, name: 'Image hero.webp',   size: '350KB', duration: 400 },
    { id: 7, name: 'API /user/profile', size: '2KB',   duration: 150 },
  ];

  // Lancer tous les "streams" en parallèle
  const promises = streams.map(stream => {
    return new Promise(resolve => {
      const chunks = 4;
      const chunkDelay = stream.duration / chunks;
      let sent = 0;

      const interval = setInterval(() => {
        sent++;
        const progress = Math.round((sent / chunks) * 100);
        res.write(`Stream #${stream.id} [${stream.name}] — ${progress}% (${stream.size})\n`);

        if (sent >= chunks) {
          clearInterval(interval);
          res.write(`Stream #${stream.id} [${stream.name}] — TERMINÉ ✓\n`);
          resolve();
        }
      }, chunkDelay);
    });
  });

  await Promise.all(promises);

  res.write(`\n--- Tous les streams terminés ---\n`);
  res.end(`</pre>
    <p><strong>En HTTP/1.1, ces 4 ressources auraient été chargées séquentiellement.
    En HTTP/2, elles sont chargées en parallèle sur la même connexion.</strong></p>
  </body></html>`);
});

server.listen(3000, () => {
  console.log('HTTP/2 Multiplex Sim → http://localhost:3000/multiplex-demo');
});
```

### 2.4 HTTP/2 natif avec Node.js

```js
// http2-server.mjs — Vrai serveur HTTP/2 avec Node.js
import { createSecureServer } from 'node:http2';
import { readFileSync, existsSync } from 'node:fs';

// Note : HTTP/2 nécessite TLS en pratique (les navigateurs l'exigent)
// Pour la démo, on utilise un certificat auto-signé
// Générer avec : openssl req -x509 -newkey rsa:2048 -keyout key.pem -out cert.pem -days 365 -nodes

const certExists = existsSync('./cert.pem') && existsSync('./key.pem');

if (!certExists) {
  console.log('Certificats manquants. Génère-les avec :');
  console.log('openssl req -x509 -newkey rsa:2048 -keyout key.pem -out cert.pem -days 365 -nodes -subj "/CN=localhost"');
  console.log('\nOn utilise le mode HTTP/2 en clair (h2c) à la place.');
}

// Alternative : HTTP/2 en clair (h2c) — ne fonctionne pas avec les navigateurs
// mais utile pour les tests avec curl
import { createServer as createH2Server } from 'node:http2';

const server = createH2Server();

server.on('stream', (stream, headers) => {
  const path = headers[':path'] || '/';
  const method = headers[':method'] || 'GET';

  console.log(`[HTTP/2] ${method} ${path} — Stream #${stream.id}`);

  stream.respond({
    ':status': 200,
    'content-type': 'text/html; charset=utf-8',
    'x-stream-id': String(stream.id),
  });

  stream.write(`<!DOCTYPE html>
<html><body>
  <h1>HTTP/2 Server</h1>
  <p>Stream ID: ${stream.id}</p>
  <p>Path: ${path}</p>
  <p>Multiplexage actif : plusieurs requêtes sur la même connexion TCP.</p>
</body></html>`);
  stream.end();
});

server.listen(3000, () => {
  console.log('HTTP/2 (h2c) → http://localhost:3000');
  console.log('Teste avec : curl --http2-prior-knowledge http://localhost:3000');
});
```

---

## 3. Web Streams API

### 3.1 Les trois types de streams

La Web Streams API définit trois types fondamentaux :

```
┌───────────────────┐     ┌───────────────────┐     ┌───────────────────┐
│  ReadableStream   │────▶│ TransformStream   │────▶│  WritableStream   │
│                   │     │                   │     │                   │
│  Source de données│     │  Transformation   │     │  Destination      │
│  (producteur)     │     │  (pipe)           │     │  (consommateur)   │
│                   │     │                   │     │                   │
│  Exemples :       │     │  Exemples :       │     │  Exemples :       │
│  - fetch body     │     │  - TextDecoder    │     │  - Fichier        │
│  - Fichier        │     │  - Compression    │     │  - Réponse HTTP   │
│  - Timer          │     │  - Parsing        │     │  - Console        │
└───────────────────┘     └───────────────────┘     └───────────────────┘
```

### 3.2 ReadableStream : créer un flux de données

```js
// readable-stream.mjs — Créer et consommer un ReadableStream
import { createServer } from 'node:http';
import { Readable } from 'node:stream';

const server = createServer(async (req, res) => {
  if (req.url !== '/stream') {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end('<h1>Web Streams</h1><a href="/stream">Voir le stream</a>');
    return;
  }

  // Créer un ReadableStream (Web API)
  const readableStream = new ReadableStream({
    start(controller) {
      // Envoyer le début du HTML immédiatement
      controller.enqueue(new TextEncoder().encode(
        '<!DOCTYPE html><html><body><h1>ReadableStream Demo</h1><ul>\n'
      ));
    },
    async pull(controller) {
      // Appelé quand le consommateur est prêt pour plus de données
      for (let i = 1; i <= 10; i++) {
        await new Promise(r => setTimeout(r, 300));
        const chunk = `<li>Élément ${i} — ${new Date().toISOString()}</li>\n`;
        controller.enqueue(new TextEncoder().encode(chunk));
      }
      controller.enqueue(new TextEncoder().encode('</ul></body></html>'));
      controller.close();
    },
  });

  // Convertir le Web ReadableStream en Node.js Readable
  const nodeReadable = Readable.fromWeb(readableStream);

  res.writeHead(200, {
    'Content-Type': 'text/html; charset=utf-8',
    'X-Stream-Type': 'ReadableStream',
  });

  // Pipe le stream vers la réponse HTTP
  nodeReadable.pipe(res);
});

server.listen(3000, () => {
  console.log('ReadableStream → http://localhost:3000/stream');
});
```

### 3.3 TransformStream : transformer les données au vol

```js
// transform-stream.mjs — TransformStream pour modifier les données en transit
import { createServer } from 'node:http';
import { Readable, Transform } from 'node:stream';

// --- TransformStream qui ajoute des timestamps à chaque chunk HTML ---
function createTimestampTransform() {
  return new Transform({
    transform(chunk, encoding, callback) {
      const text = chunk.toString();
      // Ajouter un commentaire HTML avec le timestamp à chaque chunk
      const timestamped = text.replace(
        /<li>/g,
        `<li data-streamed-at="${new Date().toISOString()}">`
      );
      callback(null, timestamped);
    },
  });
}

// --- TransformStream qui compresse (simule gzip) ---
function createCompressionSimTransform() {
  let totalBytes = 0;
  return new Transform({
    transform(chunk, encoding, callback) {
      totalBytes += chunk.length;
      // En vrai, on utiliserait zlib.createGzip()
      // Ici on passe les données tel quel mais on log la taille
      console.log(`  [Transform] Chunk: ${chunk.length} bytes (total: ${totalBytes})`);
      callback(null, chunk);
    },
    flush(callback) {
      console.log(`  [Transform] Total traité : ${totalBytes} bytes`);
      callback();
    },
  });
}

const server = createServer(async (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/html; charset=utf-8',
  });

  // Créer le flux source
  const source = new Readable({
    read() {},
  });

  // Chaîner : source → timestamp → compression sim → réponse HTTP
  source
    .pipe(createTimestampTransform())
    .pipe(createCompressionSimTransform())
    .pipe(res);

  // Envoyer les données progressivement
  source.push('<!DOCTYPE html><html><body><h1>TransformStream Demo</h1><ul>\n');

  for (let i = 1; i <= 8; i++) {
    await new Promise(r => setTimeout(r, 400));
    source.push(`<li>Item ${i} transformé au vol</li>\n`);
  }

  source.push('</ul></body></html>');
  source.push(null); // Fin du stream
});

server.listen(3000, () => {
  console.log('TransformStream → http://localhost:3000');
});
```

### 3.4 Pipeline complet : source → transform → destination

```js
// pipeline-streams.mjs — Pipeline complet avec gestion d'erreurs
import { createServer } from 'node:http';
import { pipeline, Readable, Transform } from 'node:stream';

// Simuler un flux de données (ex. requête vers une API backend)
function createDataSource(count) {
  let i = 0;
  return new Readable({
    objectMode: true,
    read() {
      if (i >= count) {
        this.push(null);
        return;
      }
      // Simuler un délai (comme un fetch vers une DB)
      setTimeout(() => {
        i++;
        this.push({
          id: i,
          name: `Produit ${i}`,
          price: Math.round(Math.random() * 10000) / 100,
          timestamp: Date.now(),
        });
      }, 200);
    },
  });
}

// Transformer les objets en lignes de tableau HTML
function createHTMLTableTransform() {
  let isFirst = true;
  return new Transform({
    objectMode: true,
    transform(product, encoding, callback) {
      if (isFirst) {
        isFirst = false;
        this.push(`<!DOCTYPE html>
<html><head><meta charset="UTF-8"><title>Pipeline</title>
<style>
  table { border-collapse: collapse; }
  td, th { border: 1px solid #ccc; padding: 8px; }
  tr:nth-child(even) { background: #f9f9f9; }
</style>
</head><body>
<h1>Pipeline Streams — Données en temps réel</h1>
<table>
  <tr><th>ID</th><th>Nom</th><th>Prix</th><th>Reçu à</th></tr>\n`);
      }

      const time = new Date(product.timestamp).toLocaleTimeString('fr-FR');
      this.push(`  <tr>
    <td>${product.id}</td>
    <td>${product.name}</td>
    <td>${product.price.toFixed(2)} €</td>
    <td>${time}</td>
  </tr>\n`);
      callback();
    },
    flush(callback) {
      this.push('</table><p><em>Stream terminé</em></p></body></html>');
      callback();
    },
  });
}

const server = createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const count = parseInt(url.searchParams.get('count') || '10', 10);

  res.writeHead(200, {
    'Content-Type': 'text/html; charset=utf-8',
    'X-Stream-Items': String(count),
  });

  // pipeline() gère les erreurs et le backpressure automatiquement
  pipeline(
    createDataSource(count),
    createHTMLTableTransform(),
    res,
    (err) => {
      if (err) {
        console.error('Pipeline error:', err);
        // Si les headers n'ont pas encore été envoyés
        if (!res.headersSent) {
          res.writeHead(500);
          res.end('Erreur de streaming');
        }
      } else {
        console.log(`Pipeline terminé : ${count} items streamés.`);
      }
    },
  );
});

server.listen(3000, () => {
  console.log('Pipeline Streams → http://localhost:3000?count=15');
});
```

---

## 4. Streaming SSR

### 4.1 Le problème du SSR classique (buffered)

En SSR classique, le serveur **attend que tout le HTML soit généré** avant de l'envoyer. Si une partie de la page dépend d'une API lente, toute la page est retardée.

```
SSR classique (buffered) :
═══════════════════════════
Serveur : [fetch API 1]─┐
                         ├─[fetch API 2 (lente)]──[render tout]──[envoyer]──▶ Client
                         │      800ms              200ms           50ms
                         └─ Total : ~1050ms avant le premier octet

SSR streaming :
═══════════════
Serveur : [render shell]──[envoyer shell]─────────────────────▶ Client
          50ms             ↓ immédiat                           (voit le layout)
                          [fetch API 1]──[envoyer chunk 1]────▶ Client
                           200ms          ↓                     (voit le contenu 1)
                          [fetch API 2]──[envoyer chunk 2]────▶ Client
                           800ms          ↓                     (voit le contenu 2)
          Total premier octet : ~50ms (vs 1050ms)
```

### 4.2 Streaming SSR avec Node.js

```js
// streaming-ssr.mjs — SSR en streaming avec Suspense simulé
import { createServer } from 'node:http';

// --- APIs simulées avec des latences différentes ---
async function fetchNavigation() {
  await new Promise(r => setTimeout(r, 50));
  return ['Accueil', 'Produits', 'Blog', 'Contact'];
}

async function fetchHeroContent() {
  await new Promise(r => setTimeout(r, 200));
  return {
    title: 'Bienvenue sur notre site',
    subtitle: 'Le meilleur du HTTP Caching',
  };
}

async function fetchProducts() {
  await new Promise(r => setTimeout(r, 800)); // API lente !
  return [
    { name: 'CDN Pro', price: '99€/mois' },
    { name: 'Cache Expert', price: '49€/mois' },
    { name: 'Edge Starter', price: '19€/mois' },
  ];
}

async function fetchRecommendations() {
  await new Promise(r => setTimeout(r, 1200)); // API très lente !
  return ['Article A', 'Article B', 'Article C'];
}

// --- Rendu en streaming ---
const server = createServer(async (req, res) => {
  const start = Date.now();

  res.writeHead(200, {
    'Content-Type': 'text/html; charset=utf-8',
    'X-Render-Mode': 'streaming-ssr',
  });

  // CHUNK 1 : Shell HTML (instantané, ~0ms)
  res.write(`<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <title>Streaming SSR</title>
  <style>
    body { font-family: system-ui; max-width: 800px; margin: 0 auto; padding: 20px; }
    .skeleton { background: #e5e7eb; border-radius: 4px; animation: pulse 1.5s infinite; }
    @keyframes pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.5; } }
    .section { margin: 20px 0; padding: 15px; border: 1px solid #e5e7eb; border-radius: 8px; }
    .timing { color: #6b7280; font-size: 0.85em; }
  </style>
</head>
<body>
  <h1>Streaming SSR Demo</h1>
  <p class="timing">Shell envoyé à +${Date.now() - start}ms</p>
`);

  // CHUNK 2 : Navigation (rapide, ~50ms)
  const nav = await fetchNavigation();
  res.write(`
  <nav class="section">
    <strong>Navigation</strong> (${Date.now() - start}ms)
    <ul>${nav.map(n => `<li>${n}</li>`).join('')}</ul>
  </nav>
`);

  // CHUNK 3 : Hero (moyen, ~200ms)
  const hero = await fetchHeroContent();
  res.write(`
  <section class="section">
    <h2>${hero.title}</h2>
    <p>${hero.subtitle}</p>
    <p class="timing">Hero chargé à +${Date.now() - start}ms</p>
  </section>
`);

  // CHUNK 4 : Produits (lent, ~800ms)
  // On envoie un placeholder d'abord, puis le contenu réel
  const productsPromise = fetchProducts();
  const recoPromise = fetchRecommendations();

  // Attendre les produits
  const products = await productsPromise;
  res.write(`
  <section class="section">
    <h2>Nos produits</h2>
    <table border="1" cellpadding="8">
      <tr><th>Produit</th><th>Prix</th></tr>
      ${products.map(p => `<tr><td>${p.name}</td><td>${p.price}</td></tr>`).join('')}
    </table>
    <p class="timing">Produits chargés à +${Date.now() - start}ms</p>
  </section>
`);

  // CHUNK 5 : Recommandations (très lent, ~1200ms)
  const reco = await recoPromise;
  res.write(`
  <section class="section">
    <h2>Recommandations</h2>
    <ul>${reco.map(r => `<li>${r}</li>`).join('')}</ul>
    <p class="timing">Recommandations chargées à +${Date.now() - start}ms</p>
  </section>
`);

  // Fermer le HTML
  const total = Date.now() - start;
  res.end(`
  <footer>
    <p class="timing"><strong>Rendu total : ${total}ms</strong></p>
    <p class="timing">Sans streaming, le TTFB aurait été ~${total}ms.
    Avec streaming, le premier octet est arrivé en ~0ms.</p>
  </footer>
</body>
</html>`);

  console.log(`[SSR Streaming] Rendu complet en ${total}ms`);
});

server.listen(3000, () => {
  console.log('Streaming SSR → http://localhost:3000');
  console.log('Observe le chargement progressif dans le navigateur.');
});
```

### 4.3 Streaming SSR avec Suspense (Out-of-Order Streaming)

```js
// streaming-suspense.mjs — Out-of-order streaming comme React Suspense
import { createServer } from 'node:http';

// Le concept : envoyer des placeholders, puis injecter le contenu réel
// via des <script> qui remplacent les placeholders — dans n'importe quel ordre

async function fetchSlowData(id, delay) {
  await new Promise(r => setTimeout(r, delay));
  return `Contenu du bloc ${id} (chargé en ${delay}ms)`;
}

const server = createServer(async (req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });

  // 1. Envoyer le shell avec des placeholders
  res.write(`<!DOCTYPE html>
<html>
<head>
  <style>
    .placeholder { background: #f3f4f6; padding: 20px; margin: 10px 0; border-radius: 8px; }
    .loaded { background: #ecfdf5; border: 2px solid #10b981; padding: 20px; margin: 10px 0; border-radius: 8px; }
  </style>
  <script>
    // Fonction qui remplace un placeholder par le contenu réel
    function $RC(id, content) {
      const el = document.getElementById('suspense-' + id);
      if (el) {
        el.outerHTML = '<div class="loaded">' + content + '</div>';
        console.log('Suspense boundary ' + id + ' resolved');
      }
    }
  </script>
</head>
<body>
  <h1>Out-of-Order Streaming (Suspense)</h1>

  <!-- Placeholder pour le bloc A (sera résolu en 1500ms) -->
  <div id="suspense-A" class="placeholder">Chargement bloc A...</div>

  <!-- Placeholder pour le bloc B (sera résolu en 500ms) -->
  <div id="suspense-B" class="placeholder">Chargement bloc B...</div>

  <!-- Placeholder pour le bloc C (sera résolu en 1000ms) -->
  <div id="suspense-C" class="placeholder">Chargement bloc C...</div>
`);

  // 2. Lancer les trois fetch en parallèle
  const tasks = [
    { id: 'A', delay: 1500 },
    { id: 'B', delay: 500 },
    { id: 'C', delay: 1000 },
  ];

  const promises = tasks.map(async (task) => {
    const content = await fetchSlowData(task.id, task.delay);
    // Envoyer un <script> qui remplace le placeholder
    // Le contenu arrive OUT-OF-ORDER : B (500ms) → C (1000ms) → A (1500ms)
    res.write(`
  <script>$RC("${task.id}", "${content}")</script>
`);
    console.log(`[Suspense] Bloc ${task.id} résolu (${task.delay}ms)`);
  });

  // 3. Attendre que tous les blocs soient résolus
  await Promise.all(promises);

  // 4. Fermer le HTML
  res.end(`
  <p><em>Tous les blocs chargés ! Ordre d'arrivée : B → C → A</em></p>
</body>
</html>`);
});

server.listen(3000, () => {
  console.log('Out-of-Order Streaming → http://localhost:3000');
  console.log('Observe : le bloc B apparaît en premier (500ms), puis C, puis A.');
});
```

---

## 5. SSE vs WebSocket vs Streaming HTTP

### 5.1 Tableau comparatif

| Critère | SSE (Server-Sent Events) | WebSocket | Streaming HTTP |
|---------|--------------------------|-----------|----------------|
| **Direction** | Serveur → Client uniquement | Bidirectionnel | Serveur → Client |
| **Protocole** | HTTP/1.1 ou HTTP/2 | ws:// ou wss:// | HTTP/1.1 ou HTTP/2 |
| **Reconnexion auto** | Oui (intégrée) | Non (à implémenter) | Non |
| **Format** | Texte (event stream) | Texte ou binaire | Quelconque |
| **Caching/proxy** | Compatible CDN | Problématique avec proxy | Compatible CDN |
| **Cas d'usage** | Notifications, feeds, live updates | Chat, gaming, trading | SSR, downloads |
| **Complexité** | Faible | Moyenne | Faible |

### 5.2 Implémentation des trois approches

```js
// sse-vs-ws-vs-stream.mjs — Les trois approches côte à côte
import { createServer } from 'node:http';

const server = createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');

  // ─── 1. Server-Sent Events (SSE) ───
  if (url.pathname === '/sse') {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no', // Désactive le buffering nginx
    });

    // Format SSE : chaque message commence par "data: "
    let id = 0;
    const interval = setInterval(() => {
      id++;
      const event = {
        type: 'update',
        data: { message: `Mise à jour #${id}`, timestamp: Date.now() },
      };

      // Format : id, event type, data (JSON), puis ligne vide
      res.write(`id: ${id}\n`);
      res.write(`event: update\n`);
      res.write(`data: ${JSON.stringify(event.data)}\n\n`);

      if (id >= 10) {
        clearInterval(interval);
        res.write(`event: close\n`);
        res.write(`data: {"message": "Stream terminé"}\n\n`);
        res.end();
      }
    }, 1000);

    req.on('close', () => clearInterval(interval));
    return;
  }

  // ─── 2. Streaming HTTP (chunked) ───
  if (url.pathname === '/stream') {
    res.writeHead(200, {
      'Content-Type': 'application/x-ndjson', // Newline-delimited JSON
      'Transfer-Encoding': 'chunked',
    });

    let count = 0;
    const interval = setInterval(() => {
      count++;
      const line = JSON.stringify({
        seq: count,
        data: `Chunk #${count}`,
        timestamp: Date.now(),
      });
      res.write(line + '\n');

      if (count >= 10) {
        clearInterval(interval);
        res.end();
      }
    }, 500);

    req.on('close', () => clearInterval(interval));
    return;
  }

  // ─── 3. Page de démo (avec client SSE) ───
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(`<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><title>SSE vs Stream</title></head>
<body>
  <h1>SSE vs WebSocket vs Streaming HTTP</h1>

  <h2>1. Server-Sent Events</h2>
  <div id="sse-log" style="background:#f0fdf4; padding:10px; min-height:100px;"></div>
  <button onclick="startSSE()">Démarrer SSE</button>

  <h2>2. Streaming HTTP (fetch + ReadableStream)</h2>
  <div id="stream-log" style="background:#eff6ff; padding:10px; min-height:100px;"></div>
  <button onclick="startStream()">Démarrer Stream</button>

  <script>
    function startSSE() {
      const log = document.getElementById('sse-log');
      log.innerHTML = '';
      const source = new EventSource('/sse');

      source.addEventListener('update', (e) => {
        const data = JSON.parse(e.data);
        log.innerHTML += '<div>[SSE #' + e.lastEventId + '] ' + data.message + '</div>';
      });

      source.addEventListener('close', () => {
        log.innerHTML += '<div><strong>SSE terminé</strong></div>';
        source.close();
      });

      source.onerror = () => {
        log.innerHTML += '<div style="color:red;">Erreur SSE (reconnexion auto...)</div>';
      };
    }

    async function startStream() {
      const log = document.getElementById('stream-log');
      log.innerHTML = '';

      const response = await fetch('/stream');
      const reader = response.body.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const text = decoder.decode(value, { stream: true });
        const lines = text.trim().split('\\n');
        for (const line of lines) {
          try {
            const obj = JSON.parse(line);
            log.innerHTML += '<div>[Stream #' + obj.seq + '] ' + obj.data + '</div>';
          } catch {}
        }
      }
      log.innerHTML += '<div><strong>Stream terminé</strong></div>';
    }
  </script>
</body>
</html>`);
});

server.listen(3000, () => {
  console.log('SSE vs Stream Demo → http://localhost:3000');
});
```

### 5.3 Quand utiliser quoi ?

```
┌─────────────────────────────────────────────────────────┐
│                    Arbre de décision                      │
│                                                           │
│  Communication bidirectionnelle nécessaire ?              │
│           │                                               │
│      ┌────┴────┐                                         │
│     OUI       NON                                        │
│      │         │                                          │
│  WebSocket    Flux continu de données ?                   │
│  (chat, jeux,     │                                       │
│   trading)   ┌────┴────┐                                 │
│             OUI       NON                                │
│              │         │                                  │
│         Navigateur ?  Requête-réponse classique           │
│              │        (HTTP normal)                       │
│         ┌────┴────┐                                      │
│        OUI       NON                                     │
│         │         │                                       │
│        SSE    Streaming HTTP                              │
│   (notifications,  (API backend,                         │
│    live feed)       SSR streaming)                        │
└─────────────────────────────────────────────────────────┘
```

---

## 6. Streaming et caching : les défis

### 6.1 Peut-on cacher un stream ?

C'est la grande question. Un stream est par nature **progressif** — comment le stocker dans un cache ?

```js
// stream-caching.mjs — Cacher le résultat d'un stream
import { createServer } from 'node:http';

const streamCache = new Map();

async function generateStreamedContent(id) {
  const chunks = [];
  for (let i = 1; i <= 5; i++) {
    await new Promise(r => setTimeout(r, 200));
    chunks.push(`<p>Section ${i} du contenu ${id}</p>\n`);
  }
  return chunks;
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const id = url.searchParams.get('id') || 'default';

  // Vérifier le cache
  const cached = streamCache.get(id);
  if (cached && Date.now() - cached.timestamp < 30_000) {
    // Servir depuis le cache — on peut streamer le cache aussi !
    res.writeHead(200, {
      'Content-Type': 'text/html; charset=utf-8',
      'X-Cache': 'HIT',
      'X-Cache-Chunks': String(cached.chunks.length),
    });

    // Même depuis le cache, on peut streamer pour un affichage progressif
    res.write('<!DOCTYPE html><html><body><h1>Depuis le cache (streamé)</h1>\n');
    for (const chunk of cached.chunks) {
      res.write(chunk);
      // Petit délai optionnel pour montrer le streaming même depuis le cache
      await new Promise(r => setTimeout(r, 50));
    }
    res.end('</body></html>');
    return;
  }

  // Cache miss : générer en streaming ET cacher le résultat
  res.writeHead(200, {
    'Content-Type': 'text/html; charset=utf-8',
    'X-Cache': 'MISS',
  });

  res.write('<!DOCTYPE html><html><body><h1>Génération en streaming (MISS)</h1>\n');

  const chunks = [];
  for (let i = 1; i <= 5; i++) {
    await new Promise(r => setTimeout(r, 300));
    const chunk = `<p>Section ${i} — ${new Date().toISOString()}</p>\n`;
    chunks.push(chunk);
    res.write(chunk); // Envoyer au client en temps réel
  }

  // Stocker le résultat complet dans le cache
  streamCache.set(id, { chunks, timestamp: Date.now() });

  res.end('</body></html>');
});

server.listen(3000, () => {
  console.log('Stream Caching → http://localhost:3000?id=test');
  console.log('Première requête : MISS (lent), suivantes : HIT (rapide)');
});
```

---

## Points clés

1. **Transfer-Encoding: chunked** permet d'envoyer une réponse HTTP en morceaux, sans connaître la taille totale à l'avance.
2. **HTTP/2** multiplexe plusieurs requêtes/réponses sur une seule connexion TCP via des streams numérotés et des frames.
3. La **Web Streams API** (ReadableStream, WritableStream, TransformStream) offre un modèle unifié pour manipuler les flux de données.
4. Le **streaming SSR** envoie le shell HTML immédiatement, puis chaque section dès qu'elle est prête — réduisant le TTFB de manière drastique.
5. L'**out-of-order streaming** (Suspense) envoie des placeholders puis injecte le contenu réel via des scripts, dans n'importe quel ordre.
6. **SSE** est idéal pour les flux serveur→client avec reconnexion automatique ; **WebSocket** pour le bidirectionnel ; **streaming HTTP** pour le SSR et les downloads.
7. On peut cacher le résultat d'un stream en accumulant les chunks, puis servir le cache en streaming ou d'un seul coup.
8. `pipeline()` de Node.js gère le **backpressure** automatiquement, évitant de surcharger la mémoire quand le consommateur est plus lent que le producteur.

---

---

## Pour aller plus loin

- [MDN — Transfer-Encoding](https://developer.mozilla.org/fr/docs/Web/HTTP/Headers/Transfer-Encoding)
- [MDN — Streams API](https://developer.mozilla.org/fr/docs/Web/API/Streams_API)
- [HTTP/2 Explained](https://http2-explained.haxx.se/)
- [React — renderToPipeableStream](https://react.dev/reference/react-dom/server/renderToPipeableStream)
- [Node.js Streams documentation](https://nodejs.org/api/stream.html)

---

## Si tu es perdu

Pense à **regarder une série en streaming** :

- **Sans streaming** (buffered) : tu dois attendre que **tout l'épisode** soit téléchargé avant de commencer à regarder. Si l'épisode fait 1 Go, tu attends 10 minutes.
- **Avec streaming** : tu commences à regarder **dès les premières secondes téléchargées**. Le reste arrive pendant que tu regardes. Tu ne vois aucune différence avec le mode buffered, mais tu as commencé 10 minutes plus tôt.

Le **Transfer-Encoding: chunked**, c'est exactement ça pour le HTML : le navigateur commence à afficher la page **dès les premiers octets**, sans attendre que le serveur ait fini de tout calculer.

Le **out-of-order streaming** (Suspense), c'est comme Netflix qui télécharge la **prochaine scène d'action en priorité** parce qu'elle est plus demandée, même si chronologiquement elle arrive plus tard dans l'épisode.

---

## Défi

### Construis un dashboard en streaming avec SSE

Crée un serveur Node.js qui :

1. Sert une page HTML qui affiche un dashboard de monitoring
2. Le dashboard se connecte via **SSE** pour recevoir des métriques en temps réel
3. Le serveur envoie des métriques toutes les 2 secondes : CPU usage, mémoire, requêtes/s (valeurs simulées)
4. Implémente un endpoint **streaming HTTP** (`/api/logs`) qui envoie des logs NDJSON
5. Le client peut basculer entre l'affichage SSE et l'affichage streaming
6. **Bonus** : ajoute un mécanisme de reconnexion SSE avec `Last-Event-ID`

<details>
<summary>Voir la solution</summary>

```js
// defi-13-dashboard.mjs
import { createServer } from 'node:http';

let eventId = 0;

function randomMetric(min, max) {
  return Math.round((Math.random() * (max - min) + min) * 100) / 100;
}

const server = createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');

  // --- SSE endpoint ---
  if (url.pathname === '/sse/metrics') {
    const lastId = parseInt(req.headers['last-event-id'] || '0', 10);
    if (lastId > 0) console.log(`[SSE] Client reconnecté depuis l'événement #${lastId}`);

    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    });

    const interval = setInterval(() => {
      eventId++;
      const metrics = {
        cpu: randomMetric(10, 95),
        memory: randomMetric(40, 85),
        rps: randomMetric(100, 5000),
        latency: randomMetric(5, 200),
        timestamp: Date.now(),
      };
      res.write(`id: ${eventId}\nevent: metrics\ndata: ${JSON.stringify(metrics)}\n\n`);
    }, 2000);

    // Heartbeat pour garder la connexion vivante
    const heartbeat = setInterval(() => res.write(': heartbeat\n\n'), 15000);

    req.on('close', () => {
      clearInterval(interval);
      clearInterval(heartbeat);
    });
    return;
  }

  // --- Streaming logs endpoint ---
  if (url.pathname === '/api/logs') {
    res.writeHead(200, {
      'Content-Type': 'application/x-ndjson',
      'Transfer-Encoding': 'chunked',
    });

    let logCount = 0;
    const interval = setInterval(() => {
      logCount++;
      const levels = ['INFO', 'WARN', 'ERROR', 'DEBUG'];
      const log = {
        seq: logCount,
        level: levels[Math.floor(Math.random() * levels.length)],
        message: `Event ${logCount}: ${Math.random().toString(36).slice(2, 10)}`,
        timestamp: new Date().toISOString(),
      };
      res.write(JSON.stringify(log) + '\n');
      if (logCount >= 50) { clearInterval(interval); res.end(); }
    }, 500);

    req.on('close', () => clearInterval(interval));
    return;
  }

  // --- Dashboard HTML ---
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(`<!DOCTYPE html>
<html><head><meta charset="UTF-8"><title>Dashboard Streaming</title>
<style>
  body { font-family: system-ui; padding: 20px; background: #1a1a2e; color: #e0e0e0; }
  .metric { display: inline-block; margin: 10px; padding: 20px; background: #16213e;
    border-radius: 8px; min-width: 150px; text-align: center; }
  .metric .value { font-size: 2em; font-weight: bold; color: #0f3460; }
  .metric .label { color: #999; }
  #logs { background: #0d1117; padding: 10px; max-height: 300px; overflow-y: auto;
    font-family: monospace; font-size: 0.85em; border-radius: 4px; }
  .log-ERROR { color: #f85149; } .log-WARN { color: #d29922; }
  .log-INFO { color: #58a6ff; } .log-DEBUG { color: #8b949e; }
  button { padding: 8px 16px; margin: 5px; cursor: pointer; }
</style></head>
<body>
  <h1>Dashboard Monitoring (Streaming)</h1>
  <div id="metrics">
    <div class="metric"><div class="label">CPU</div><div class="value" id="cpu">--</div></div>
    <div class="metric"><div class="label">Mémoire</div><div class="value" id="memory">--</div></div>
    <div class="metric"><div class="label">Req/s</div><div class="value" id="rps">--</div></div>
    <div class="metric"><div class="label">Latence</div><div class="value" id="latency">--</div></div>
  </div>
  <button onclick="startSSE()">Démarrer SSE</button>
  <button onclick="startLogs()">Démarrer Logs (stream)</button>
  <h2>Logs en temps réel</h2>
  <div id="logs"></div>
  <script>
    let sseSource;
    function startSSE() {
      if (sseSource) sseSource.close();
      sseSource = new EventSource('/sse/metrics');
      sseSource.addEventListener('metrics', (e) => {
        const m = JSON.parse(e.data);
        document.getElementById('cpu').textContent = m.cpu + '%';
        document.getElementById('memory').textContent = m.memory + '%';
        document.getElementById('rps').textContent = Math.round(m.rps);
        document.getElementById('latency').textContent = m.latency + 'ms';
      });
    }
    async function startLogs() {
      const log = document.getElementById('logs');
      log.innerHTML = '';
      const resp = await fetch('/api/logs');
      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const lines = decoder.decode(value, { stream: true }).trim().split('\\n');
        for (const line of lines) {
          try {
            const obj = JSON.parse(line);
            log.innerHTML += '<div class="log-' + obj.level + '">[' + obj.level + '] ' + obj.message + '</div>';
            log.scrollTop = log.scrollHeight;
          } catch {}
        }
      }
    }
    startSSE(); // Auto-start
  </script>
</body></html>`);
});

server.listen(3000, () => {
  console.log('Dashboard Streaming → http://localhost:3000');
});
```

</details>

---

## Navigation

| Précédent | Suivant |
|:---------:|:-------:|
| [Module 12 — Edge Rendering](./12-edge-rendering.md) | [Module 14 — Performance Web](./14-performance-web.md) |

---

<!-- parcours-recommande -->

::: tip Parcours recommandé
1. **Screencast** : [screencast 13 http streaming](../screencasts/screencast-13-http-streaming.md)
2. **Lab** : [lab-13-streaming-responses](../labs/lab-13-streaming-responses/README)
3. **Quiz** : [quiz 13 streaming](../quizzes/quiz-13-streaming.html)
:::
