// =============================================================================
// Lab 13 — Streaming HTTP Responses
// =============================================================================
// Executer avec : npx tsx exercise.ts
// =============================================================================

import type { IncomingMessage, ServerResponse, IncomingHttpHeaders } from 'node:http';
import http from 'node:http';
import crypto from 'node:crypto';
import { Readable, Transform } from 'node:stream';

const PORT = 3013;

// --- Suivi de progression (partage entre routes) ---
const downloads = new Map();

// =============================================================================
// PARTIE 1 — Chunked Transfer Encoding manuel
// =============================================================================
// Objectif : Envoyer une reponse en plusieurs chunks avec des delais.
//            Le client recoit les donnees progressivement.
//
// TODO: Implementez la fonction handleChunkedResponse(req, res)
//       qui envoie 5 chunks avec un delai de 500ms entre chaque.
//
// 💡 Indice : Utilisez res.write() pour chaque chunk et res.end()
//             pour terminer. Node.js ajoute Transfer-Encoding: chunked
//             automatiquement.

function handleChunkedResponse(req, res) {
  // TODO: Envoyer les headers (200, Content-Type: text/plain)
  // TODO: Envoyer 5 chunks avec un delai entre chaque :
  //   - Chunk 1: "=== Debut du streaming ===\n"
  //   - Chunk 2: "Donnees partie 1...\n"
  //   - Chunk 3: "Donnees partie 2...\n"
  //   - Chunk 4: "Donnees partie 3...\n"
  //   - Chunk 5: "=== Fin du streaming ===\n"
  // TODO: Appeler res.end() apres le dernier chunk
  //
  // 💡 Indice : Utilisez une boucle avec setTimeout ou une fonction recursive
  // 💡 Indice : res.write(chunk) envoie un chunk sans fermer la connexion
  console.log('  TODO: Implementer handleChunkedResponse()');
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('TODO: Chunked response');
}

// =============================================================================
// PARTIE 2 — Pipeline de ReadableStream
// =============================================================================
// Objectif : Construire un pipeline source -> transform -> response.
//
// TODO: Implementez :
//   1. createDataSource() - un Readable stream qui genere des donnees
//   2. createTransform() - un Transform stream qui modifie les donnees
//   3. handlePipelineResponse() - qui connecte le pipeline a res
//
// 💡 Indice : Utilisez new Readable({ read() {...} }) et
//             new Transform({ transform(chunk, enc, cb) {...} })

function createDataSource(count) {
  // TODO: Creer un Readable stream qui emet `count` objets JSON
  //       (un par un avec un delai de 200ms entre chaque)
  //       Format: { id: N, value: random, timestamp: ISO }
  //       Puis push(null) pour signaler la fin.
  //
  // 💡 Indice : Utilisez new Readable({ objectMode: false, read() {} })
  //             et setTimeout pour les delais
  console.log('  TODO: Implementer createDataSource()');
  const stream = new Readable({
    read() {
      this.push(null);
    },
  });
  return stream;
}

function createUpperCaseTransform() {
  // TODO: Creer un Transform stream qui convertit chaque chunk en majuscules
  //
  // 💡 Indice : chunk.toString().toUpperCase()
  console.log('  TODO: Implementer createUpperCaseTransform()');
  const transform = new Transform({
    transform(chunk, encoding, callback) {
      callback(null, chunk);
    },
  });
  return transform;
}

function handlePipelineResponse(req, res) {
  // TODO: Connecter le pipeline : source -> transform -> res
  //   1. Creer la source de donnees (5 elements)
  //   2. Creer le transform (uppercase)
  //   3. Pipe: source.pipe(transform).pipe(res)
  //   4. Envoyer les headers avant le pipe
  //
  // 💡 Indice : N'oubliez pas d'envoyer res.writeHead() AVANT de pipe
  console.log('  TODO: Implementer handlePipelineResponse()');
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('TODO: Pipeline response');
}

// =============================================================================
// PARTIE 3 — Streaming SSR
// =============================================================================
// Objectif : Envoyer le <head> HTML immediatement, puis le <body>
//            en chunks au fur et a mesure que les donnees sont pretes.
//
// TODO: Implementez handleStreamingSSR(req, res)
//       qui envoie le HTML progressivement.
//
// 💡 Indice : Envoyez d'abord <!DOCTYPE html><html><head>...</head><body>,
//             puis chaque section du body dans des res.write() separes,
//             puis </body></html> a la fin.

async function fetchData(section) {
  // Simule un appel API lent (100-500ms par section)
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

function handleStreamingSSR(req, res) {
  // TODO: Envoyer les headers (200, Content-Type: text/html)
  //
  // TODO: Envoyer immediatement le head HTML :
  //   res.write('<!DOCTYPE html><html><head><title>Streaming SSR</title>...')
  //   res.write('<body><h1>Page en streaming</h1>')
  //
  // TODO: Pour chaque section ['hero', 'products', 'reviews', 'footer'] :
  //   1. Appeler fetchData(section) pour obtenir les donnees
  //   2. Generer le HTML de la section
  //   3. Envoyer avec res.write()
  //
  // TODO: Terminer avec res.write('</body></html>') et res.end()
  //
  // 💡 Indice : Utilisez une boucle for...of avec await pour traiter
  //             les sections sequentiellement
  // 💡 Indice : Le navigateur peut commencer a afficher le head pendant
  //             que le body se charge encore
  console.log('  TODO: Implementer handleStreamingSSR()');
  res.writeHead(200, { 'Content-Type': 'text/html' });
  res.end('<html><body><h1>TODO: Streaming SSR</h1></body></html>');
}

// =============================================================================
// PARTIE 4 — Suivi de progression
// =============================================================================
// Objectif : Streamer une reponse volumineuse et tracker la progression.
//
// TODO: Implementez handleLargeDownload(req, res) et handleProgress(req, res)
//
// 💡 Indice : Generez des donnees aleatoires en chunks et stockez
//             la progression dans le Map `downloads`.

function handleLargeDownload(req, res) {
  // TODO: Generer un downloadId unique
  // TODO: Initialiser la progression dans `downloads` Map :
  //       { totalBytes: 1048576 (1MB), sentBytes: 0, startTime, status: 'in-progress' }
  // TODO: Envoyer les headers avec Content-Length et X-Download-Id
  // TODO: Envoyer des chunks de 64KB avec un delai de 100ms entre chaque
  // TODO: Mettre a jour sentBytes a chaque chunk
  // TODO: Quand termine, mettre status: 'complete'
  //
  // 💡 Indice : Utilisez crypto.randomBytes(chunkSize) pour generer des donnees
  // 💡 Indice : Retournez le downloadId dans un header X-Download-Id
  console.log('  TODO: Implementer handleLargeDownload()');
  res.writeHead(200, { 'Content-Type': 'application/octet-stream' });
  res.end('TODO');
}

function handleProgress(req, res) {
  // TODO: Lire le downloadId depuis la query string (?id=...)
  // TODO: Retourner la progression en JSON :
  //       { id, totalBytes, sentBytes, percentage, status, elapsedMs }
  //
  // 💡 Indice : percentage = (sentBytes / totalBytes * 100).toFixed(1)
  console.log('  TODO: Implementer handleProgress()');
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Not implemented' }));
}

// =============================================================================
// Serveur principal
// =============================================================================

const server = http.createServer((req: IncomingMessage, res: ServerResponse) => {
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
      // Lancer le download et verifier la progression
      const downloadPromise = makeRequest('/download');
      await new Promise((r) => setTimeout(r, 200)); // Attendre que le download commence
      const progressRes = await makeRequest('/progress?id=test');
      const downloadRes = await downloadPromise;

      if (downloadRes.headers['x-download-id'] || downloadRes.body.length > 100) {
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
