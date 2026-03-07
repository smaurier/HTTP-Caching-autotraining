// =============================================================================
// Lab 13 — Streaming HTTP Responses — SOLUTION
// =============================================================================
// Executer avec : node solution.js
// =============================================================================

import http from 'node:http';
import crypto from 'node:crypto';
import { Readable, Transform } from 'node:stream';

const PORT = 3013;

// --- Suivi de progression (partage entre routes) ---
const downloads = new Map();

// =============================================================================
// PARTIE 1 — Chunked Transfer Encoding manuel
// =============================================================================
// POURQUOI : Le Transfer-Encoding chunked permet d'envoyer des donnees
// progressivement sans connaitre la taille totale a l'avance. C'est
// fondamental pour le streaming HTTP. Node.js l'active automatiquement
// quand on appelle res.write() avant res.end().

function handleChunkedResponse(req, res) {
  // POURQUOI : On envoie les headers d'abord. A partir de ce moment,
  // Node.js sait qu'il devra utiliser chunked encoding car on ne
  // specifie pas Content-Length.
  res.writeHead(200, { 'Content-Type': 'text/plain' });

  const chunks = [
    '=== Debut du streaming ===\n',
    'Donnees partie 1...\n',
    'Donnees partie 2...\n',
    'Donnees partie 3...\n',
    '=== Fin du streaming ===\n',
  ];

  let index = 0;

  // POURQUOI : On envoie un chunk toutes les 500ms pour simuler
  // une source de donnees lente (API, base de donnees, etc.)
  function sendNextChunk() {
    if (index < chunks.length) {
      res.write(chunks[index]);
      index++;
      setTimeout(sendNextChunk, 500);
    } else {
      // POURQUOI : res.end() envoie le marqueur de fin de transfert chunked
      // (un chunk de taille 0) et ferme la connexion.
      res.end();
    }
  }

  sendNextChunk();
}

// =============================================================================
// PARTIE 2 — Pipeline de ReadableStream
// =============================================================================
// POURQUOI : Les streams Node.js permettent de traiter des donnees
// en pipeline sans tout charger en memoire. C'est essentiel pour
// les reponses volumineuses.

function createDataSource(count) {
  let index = 0;

  // POURQUOI : On cree un Readable stream qui emet des objets JSON
  // un par un avec un delai entre chaque. Cela simule une source
  // de donnees progressive (ex: lignes d'une base de donnees).
  const stream = new Readable({
    read() {
      if (index >= count) {
        // POURQUOI : push(null) signale la fin du stream.
        this.push(null);
        return;
      }
      const current = index++;
      // POURQUOI : Le delai simule le temps de traitement entre chaque element.
      setTimeout(() => {
        const data = JSON.stringify({
          id: current + 1,
          value: Math.random().toFixed(4),
          timestamp: new Date().toISOString(),
        }) + '\n';
        this.push(data);
      }, 200);
    },
  });

  return stream;
}

function createUpperCaseTransform() {
  // POURQUOI : Un Transform stream modifie les donnees au passage.
  // Ici on convertit en majuscules, mais en production ce pourrait etre
  // de la compression, du chiffrement, du formatage, etc.
  return new Transform({
    transform(chunk, encoding, callback) {
      callback(null, chunk.toString().toUpperCase());
    },
  });
}

function handlePipelineResponse(req, res) {
  // POURQUOI : On envoie les headers avant de commencer le pipe.
  // Le pipe s'occupe d'appeler res.end() automatiquement quand
  // le source stream est termine.
  res.writeHead(200, { 'Content-Type': 'text/plain' });

  const source = createDataSource(5);
  const transform = createUpperCaseTransform();

  // POURQUOI : pipe() connecte les streams entre eux automatiquement.
  // La pression (backpressure) est geree automatiquement :
  // si le client est lent, la source ralentit.
  source.pipe(transform).pipe(res);
}

// =============================================================================
// PARTIE 3 — Streaming SSR
// =============================================================================
// POURQUOI : Le streaming SSR permet au navigateur de commencer a afficher
// le contenu (et charger CSS/JS dans le head) pendant que le serveur
// continue a generer le body. Cela ameliore significativement le FCP
// (First Contentful Paint).

async function fetchData(section) {
  // POURQUOI : Simule un appel API avec latence variable.
  // En production, chaque section pourrait dependre d'un microservice different.
  return new Promise((resolve) => {
    const delay = 100 + Math.random() * 400;
    setTimeout(() => {
      resolve({
        section,
        content: `Contenu de la section "${section}" charge en ${delay.toFixed(0)}ms`,
        timestamp: new Date().toISOString(),
      });
    }, delay);
  });
}

async function handleStreamingSSR(req, res) {
  res.writeHead(200, { 'Content-Type': 'text/html' });

  // POURQUOI : On envoie immediatement le head HTML. Le navigateur peut
  // commencer a parser les balises <link> et <script> et lancer les
  // telechargements PENDANT que le body se charge encore.
  res.write(`<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <title>Streaming SSR</title>
  <style>
    body { font-family: system-ui; max-width: 800px; margin: 0 auto; padding: 20px; }
    .section { border: 1px solid #ddd; padding: 16px; margin: 12px 0; border-radius: 8px; }
    .section h2 { margin-top: 0; }
    .meta { color: #666; font-size: 0.85em; }
  </style>
</head>
<body>
  <h1>Page en streaming SSR</h1>
  <p class="meta">Debut du streaming: ${new Date().toISOString()}</p>
`);

  // POURQUOI : Chaque section est chargee et envoyee individuellement.
  // Le navigateur affiche chaque section des qu'il la recoit.
  const sections = ['hero', 'products', 'reviews', 'footer'];

  for (const section of sections) {
    const data = await fetchData(section);
    // POURQUOI : res.write() envoie un chunk HTML. Le navigateur
    // l'ajoute au DOM immediatement (progressive rendering).
    res.write(`
  <div class="section" id="${section}">
    <h2>${data.section.charAt(0).toUpperCase() + data.section.slice(1)}</h2>
    <p>${data.content}</p>
    <p class="meta">Genere le: ${data.timestamp}</p>
  </div>
`);
  }

  // POURQUOI : On ferme le HTML et la connexion. Le navigateur sait
  // maintenant que la page est complete.
  res.write(`
  <p class="meta">Fin du streaming: ${new Date().toISOString()}</p>
</body>
</html>`);
  res.end();
}

// =============================================================================
// PARTIE 4 — Suivi de progression
// =============================================================================
// POURQUOI : Pour les telechargements volumineux, il est utile de pouvoir
// suivre la progression. On utilise un Map partage pour stocker l'etat
// de chaque telechargement.

function handleLargeDownload(req, res) {
  const downloadId = crypto.randomUUID();
  const totalBytes = 1048576; // 1 MB
  const chunkSize = 65536; // 64 KB
  const totalChunks = Math.ceil(totalBytes / chunkSize);

  // POURQUOI : On enregistre la progression dans un Map partage.
  // L'endpoint /progress peut lire ces donnees a tout moment.
  downloads.set(downloadId, {
    totalBytes,
    sentBytes: 0,
    startTime: Date.now(),
    status: 'in-progress',
  });

  // POURQUOI : On specifie Content-Length car on connait la taille totale.
  // Cela permet au client d'afficher une barre de progression.
  res.writeHead(200, {
    'Content-Type': 'application/octet-stream',
    'Content-Disposition': `attachment; filename="data-${downloadId}.bin"`,
    'Content-Length': totalBytes.toString(),
    'X-Download-Id': downloadId,
  });

  let chunksSent = 0;

  function sendNextChunk() {
    if (chunksSent >= totalChunks) {
      // POURQUOI : Telechargement termine, on met a jour le status.
      const info = downloads.get(downloadId);
      info.status = 'complete';
      info.sentBytes = totalBytes;
      res.end();
      return;
    }

    // POURQUOI : On genere des donnees aleatoires pour simuler un fichier.
    // En production, on lirait depuis le disque ou un object store.
    const remaining = totalBytes - chunksSent * chunkSize;
    const currentChunkSize = Math.min(chunkSize, remaining);
    const chunk = crypto.randomBytes(currentChunkSize);

    res.write(chunk);
    chunksSent++;

    // POURQUOI : On met a jour la progression apres chaque chunk.
    const info = downloads.get(downloadId);
    info.sentBytes = chunksSent * chunkSize;

    // POURQUOI : Le delai simule une source lente (disque, reseau, etc.)
    setTimeout(sendNextChunk, 100);
  }

  sendNextChunk();
}

function handleProgress(req, res) {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const downloadId = url.searchParams.get('id');

  // POURQUOI : Si aucun ID specifique, on retourne la liste de tous les downloads.
  if (!downloadId || !downloads.has(downloadId)) {
    const allDownloads = Object.fromEntries(
      [...downloads.entries()].map(([id, info]) => [
        id,
        {
          ...info,
          percentage: ((info.sentBytes / info.totalBytes) * 100).toFixed(1),
          elapsedMs: Date.now() - info.startTime,
        },
      ])
    );
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ downloads: allDownloads }));
    return;
  }

  const info = downloads.get(downloadId);
  const percentage = ((info.sentBytes / info.totalBytes) * 100).toFixed(1);
  const elapsedMs = Date.now() - info.startTime;

  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(
    JSON.stringify({
      id: downloadId,
      totalBytes: info.totalBytes,
      sentBytes: info.sentBytes,
      percentage,
      status: info.status,
      elapsedMs,
    })
  );
}

// =============================================================================
// Serveur principal
// =============================================================================

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);

  switch (url.pathname) {
    case '/chunked':
      return handleChunkedResponse(req, res);
    case '/pipeline':
      return handlePipelineResponse(req, res);
    case '/ssr':
      return handleStreamingSSR(req, res);
    case '/download':
      return handleLargeDownload(req, res);
    case '/progress':
      return handleProgress(req, res);
    default:
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(`<html><body>
        <h1>Lab 13 — Streaming</h1>
        <ul>
          <li><a href="/chunked">Chunked response</a></li>
          <li><a href="/pipeline">Pipeline</a></li>
          <li><a href="/ssr">Streaming SSR</a></li>
          <li><a href="/download">Large download</a></li>
        </ul>
      </body></html>`);
  }
});

// =============================================================================
// Tests automatises
// =============================================================================

async function runTests() {
  console.log('\n=== Lab 13 — Streaming HTTP Responses ===\n');

  return new Promise((resolve) => {
    server.listen(PORT, async () => {
      console.log(`[Serveur] Demarre sur http://localhost:${PORT}\n`);

      const makeRequest = (path) => {
        return new Promise((resolve, reject) => {
          const chunks = [];
          let firstChunkTime = 0;
          const startTime = Date.now();

          const req = http.request(
            { hostname: 'localhost', port: PORT, path, method: 'GET' },
            (res) => {
              res.on('data', (chunk) => {
                if (chunks.length === 0) firstChunkTime = Date.now() - startTime;
                chunks.push(chunk);
              });
              res.on('end', () => {
                const totalTime = Date.now() - startTime;
                const body = Buffer.concat(chunks).toString();
                resolve({
                  status: res.statusCode,
                  headers: res.headers,
                  body,
                  chunkCount: chunks.length,
                  firstChunkTime,
                  totalTime,
                });
              });
            }
          );
          req.on('error', reject);
          req.end();
        });
      };

      let passed = 0;
      let failed = 0;

      // Test 1: Chunked response - multiple chunks
      const res1 = await makeRequest('/chunked');
      if (res1.chunkCount > 1) {
        console.log(`  \u2705 Test 1: Reponse chunked (${res1.chunkCount} chunks recus)`);
        passed++;
      } else {
        console.log(`  \u274C Test 1: Un seul chunk recu (attendu: plusieurs)`);
        failed++;
      }

      // Test 2: Chunked response - Transfer-Encoding
      if (res1.headers['transfer-encoding'] === 'chunked') {
        console.log('  \u2705 Test 2: Transfer-Encoding: chunked present');
        passed++;
      } else {
        console.log(`  \u274C Test 2: Transfer-Encoding manquant (${res1.headers['transfer-encoding'] || 'absent'})`);
        failed++;
      }

      // Test 3: Chunked response - contenu complet
      if (res1.body.includes('Debut') && res1.body.includes('Fin')) {
        console.log('  \u2705 Test 3: Contenu chunked complet (debut et fin)');
        passed++;
      } else {
        console.log('  \u274C Test 3: Contenu chunked incomplet');
        failed++;
      }

      // Test 4: Pipeline response - uppercase transform
      const res2 = await makeRequest('/pipeline');
      if (res2.body === res2.body.toUpperCase() && res2.body.length > 10) {
        console.log('  \u2705 Test 4: Pipeline transform (uppercase) fonctionne');
        passed++;
      } else {
        console.log(`  \u274C Test 4: Pipeline transform ne fonctionne pas`);
        failed++;
      }

      // Test 5: Streaming SSR - contient head et body
      const res3 = await makeRequest('/ssr');
      if (res3.body.includes('<head>') || res3.body.includes('<title>')) {
        console.log('  \u2705 Test 5: Streaming SSR contient le head HTML');
        passed++;
      } else {
        console.log('  \u274C Test 5: Streaming SSR ne contient pas de head');
        failed++;
      }

      // Test 6: Streaming SSR - contient les sections
      const hasSections = ['hero', 'products', 'reviews', 'footer'].some(
        (s) => res3.body.toLowerCase().includes(s)
      );
      if (hasSections) {
        console.log('  \u2705 Test 6: Streaming SSR contient les sections');
        passed++;
      } else {
        console.log('  \u274C Test 6: Streaming SSR ne contient pas les sections');
        failed++;
      }

      // Test 7: Streaming SSR - multiple chunks
      if (res3.chunkCount > 1) {
        console.log(`  \u2705 Test 7: Streaming SSR en ${res3.chunkCount} chunks`);
        passed++;
      } else {
        console.log('  \u274C Test 7: Streaming SSR en un seul chunk');
        failed++;
      }

      // Test 8: Large download - progress tracking
      const downloadPromise = makeRequest('/download');
      await new Promise((r) => setTimeout(r, 200));
      const downloadRes = await downloadPromise;

      if (downloadRes.headers['x-download-id'] && downloadRes.body.length > 100) {
        console.log(`  \u2705 Test 8: Large download fonctionne (${downloadRes.body.length} bytes)`);
        passed++;
      } else {
        console.log(`  \u274C Test 8: Large download ne fonctionne pas`);
        failed++;
      }

      console.log(`\n  Resultats: ${passed}/${passed + failed} tests passes\n`);

      server.close();
      resolve();
    });
  });
}

setTimeout(runTests, 0);
