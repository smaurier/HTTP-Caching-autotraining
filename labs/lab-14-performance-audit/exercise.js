// =============================================================================
// Lab 14 — Performance Audit
// =============================================================================
// Executer avec : node exercise.js
// =============================================================================

import http from 'node:http';
import zlib from 'node:zlib';
import crypto from 'node:crypto';

const PORT_SLOW = 3140;
const PORT_FAST = 3141;

// =============================================================================
// PARTIE 1 — Serveur "lent" (pas de cache, pas de compression, latence)
// =============================================================================
// Objectif : Construire un serveur avec toutes les anti-patterns de performance.
//
// TODO: Implementez le serveur lent avec les caracteristiques suivantes :
//   - Latence simulee de 200ms sur chaque requete
//   - Pas de headers Cache-Control
//   - Pas de compression (Content-Encoding)
//   - Connection: close sur chaque reponse
//   - Contenu volumineux (HTML de ~50KB)
//
// 💡 Indice : Generez un gros HTML avec une boucle qui cree beaucoup de <p>

function generateLargeHTML(title) {
  // TODO: Generer un HTML d'environ 50KB avec :
  //   - Un titre <h1>
  //   - Un timestamp de generation
  //   - Au moins 500 paragraphes de texte
  //
  // 💡 Indice : Utilisez une boucle pour generer les paragraphes
  console.log('  TODO: Implementer generateLargeHTML()');
  return '<html><body><h1>TODO</h1></body></html>';
}

const slowServer = http.createServer((req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT_SLOW}`);

  // TODO: Ajouter une latence de 200ms avant de repondre
  // TODO: Envoyer la reponse SANS cache, SANS compression, avec Connection: close
  //
  // 💡 Indice : Utilisez setTimeout pour la latence
  // 💡 Indice : res.setHeader('Connection', 'close')
  console.log('  TODO: Implementer le serveur lent');

  const routes = {
    '/': 'Page d\'accueil',
    '/products': 'Produits',
    '/about': 'A propos',
    '/contact': 'Contact',
  };

  const title = routes[url.pathname];
  if (title) {
    res.writeHead(200, {
      'Content-Type': 'text/html',
      Connection: 'close',
    });
    res.end(generateLargeHTML(title));
  } else {
    res.writeHead(404);
    res.end('Not Found');
  }
});

// =============================================================================
// PARTIE 2 — Mesure de TTFB
// =============================================================================
// Objectif : Mesurer le Time To First Byte pour une requete HTTP.
//
// TODO: Implementez measureTTFB(url) qui retourne :
//   { ttfb, downloadTime, totalTime, bodySize, headers }
//
// 💡 Indice : Mesurez le temps entre l'envoi de la requete et
//             la reception du premier chunk (event 'data').

function measureTTFB(requestPath, port, headers = {}) {
  // TODO: Creer une requete HTTP et mesurer les temps :
  //   - startTime: moment ou la requete est envoyee
  //   - ttfb: temps jusqu'au premier octet de la reponse (event 'response')
  //   - firstByteTime: temps jusqu'au premier chunk de data
  //   - totalTime: temps total (requete envoyee -> reponse complete)
  //   - bodySize: taille totale du body en bytes
  //
  // 💡 Indice : Utilisez process.hrtime.bigint() pour des mesures precises
  // 💡 Indice : L'event 'response' se declenche quand les headers arrivent
  //             L'event 'data' sur la reponse se declenche quand les donnees arrivent
  console.log('  TODO: Implementer measureTTFB()');
  return Promise.resolve({
    ttfb: 0,
    downloadTime: 0,
    totalTime: 0,
    bodySize: 0,
    status: 0,
    headers: {},
  });
}

// =============================================================================
// PARTIE 3 — Visualisation waterfall
// =============================================================================
// Objectif : Construire une visualisation console du timing des requetes.
//
// TODO: Implementez renderWaterfall(measurements) qui affiche :
//   URL          |████████████░░░░░░░░| TTFB: 50ms  Total: 100ms
//
// 💡 Indice : Utilisez des caracteres Unicode pour les barres.
//             Normalisez les temps par rapport au plus long.

function renderWaterfall(measurements) {
  // TODO: Pour chaque mesure :
  //   1. Calculer la proportion TTFB / total par rapport au max
  //   2. Dessiner une barre de 40 caracteres :
  //      - Partie TTFB en \u2588 (bloc plein)
  //      - Partie download en \u2591 (bloc leger)
  //      - Reste en espaces
  //   3. Afficher le path, la barre, et les temps
  //
  // 💡 Indice : maxTime = Math.max(...measurements.map(m => m.totalTime))
  //             ttfbWidth = Math.round((m.ttfb / maxTime) * barWidth)
  console.log('  TODO: Implementer renderWaterfall()');
  console.log('  (Aucune visualisation implementee)');
}

// =============================================================================
// PARTIE 4 — Serveur "rapide" (avec optimisations)
// =============================================================================
// Objectif : Appliquer les optimisations et re-mesurer.
//
// TODO: Implementez le serveur rapide avec :
//   - Cache-Control: public, max-age=3600
//   - ETag basee sur le contenu
//   - Compression gzip (si Accept-Encoding le supporte)
//   - Connection: keep-alive
//
// 💡 Indice : Utilisez zlib.gzipSync() ou createGzip() pour la compression
// 💡 Indice : Utilisez crypto.createHash('md5') pour generer l'ETag

const pageCache = new Map();

const fastServer = http.createServer((req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT_FAST}`);

  const routes = {
    '/': 'Page d\'accueil',
    '/products': 'Produits',
    '/about': 'A propos',
    '/contact': 'Contact',
  };

  const title = routes[url.pathname];
  if (!title) {
    res.writeHead(404);
    res.end('Not Found');
    return;
  }

  // TODO: Generer ou recuperer le HTML depuis le cache
  // TODO: Calculer l'ETag (hash MD5 du contenu)
  // TODO: Verifier If-None-Match pour un 304
  // TODO: Appliquer la compression gzip si le client la supporte
  // TODO: Envoyer avec Cache-Control, ETag, Content-Encoding
  //
  // 💡 Indice : req.headers['if-none-match'] pour la validation conditionnelle
  // 💡 Indice : req.headers['accept-encoding']?.includes('gzip')
  // 💡 Indice : zlib.gzipSync(buffer) pour compresser
  console.log('  TODO: Implementer le serveur rapide');

  res.writeHead(200, { 'Content-Type': 'text/html' });
  res.end(generateLargeHTML(title));
});

// =============================================================================
// Tests automatises
// =============================================================================

async function runTests() {
  console.log('\n=== Lab 14 — Performance Audit ===\n');

  return new Promise((resolve) => {
    slowServer.listen(PORT_SLOW, () => {
      console.log(`[Slow] Serveur lent sur http://localhost:${PORT_SLOW}`);

      fastServer.listen(PORT_FAST, async () => {
        console.log(`[Fast] Serveur rapide sur http://localhost:${PORT_FAST}\n`);

        let passed = 0;
        let failed = 0;

        // Test 1: Serveur lent genere du contenu volumineux
        const slowMeasure = await measureTTFB('/', PORT_SLOW);
        if (slowMeasure.bodySize > 10000) {
          console.log(`  \u2705 Test 1: Serveur lent genere du contenu volumineux (${slowMeasure.bodySize} bytes)`);
          passed++;
        } else {
          console.log(`  \u274C Test 1: Contenu trop petit (${slowMeasure.bodySize} bytes, attendu > 10000)`);
          failed++;
        }

        // Test 2: TTFB mesurable
        if (slowMeasure.ttfb > 0) {
          console.log(`  \u2705 Test 2: TTFB mesure (${slowMeasure.ttfb.toFixed(1)}ms)`);
          passed++;
        } else {
          console.log(`  \u274C Test 2: TTFB non mesure (${slowMeasure.ttfb})`);
          failed++;
        }

        // Test 3: Serveur rapide repond aussi
        const fastMeasure = await measureTTFB('/', PORT_FAST);
        if (fastMeasure.bodySize > 0 && fastMeasure.status === 200) {
          console.log(`  \u2705 Test 3: Serveur rapide fonctionne (${fastMeasure.bodySize} bytes)`);
          passed++;
        } else {
          console.log(`  \u274C Test 3: Serveur rapide ne fonctionne pas`);
          failed++;
        }

        // Test 4: Serveur rapide a un Cache-Control
        if (fastMeasure.headers['cache-control'] && fastMeasure.headers['cache-control'].includes('max-age')) {
          console.log(`  \u2705 Test 4: Cache-Control present (${fastMeasure.headers['cache-control']})`);
          passed++;
        } else {
          console.log(`  \u274C Test 4: Cache-Control manquant`);
          failed++;
        }

        // Test 5: Serveur rapide a un ETag
        if (fastMeasure.headers['etag']) {
          console.log(`  \u2705 Test 5: ETag present (${fastMeasure.headers['etag']})`);
          passed++;
        } else {
          console.log(`  \u274C Test 5: ETag manquant`);
          failed++;
        }

        // Test 6: Compression gzip
        const gzipMeasure = await measureTTFB('/', PORT_FAST, { 'Accept-Encoding': 'gzip' });
        if (gzipMeasure.headers['content-encoding'] === 'gzip') {
          const ratio = ((1 - gzipMeasure.bodySize / slowMeasure.bodySize) * 100).toFixed(1);
          console.log(`  \u2705 Test 6: Compression gzip active (reduction: ${ratio}%)`);
          passed++;
        } else {
          console.log(`  \u274C Test 6: Compression gzip non active`);
          failed++;
        }

        // Test 7: 304 Not Modified avec ETag
        if (fastMeasure.headers['etag']) {
          const conditionalMeasure = await measureTTFB('/', PORT_FAST, {
            'If-None-Match': fastMeasure.headers['etag'],
          });
          if (conditionalMeasure.status === 304) {
            console.log('  \u2705 Test 7: 304 Not Modified fonctionne');
            passed++;
          } else {
            console.log(`  \u274C Test 7: Status ${conditionalMeasure.status} au lieu de 304`);
            failed++;
          }
        } else {
          console.log('  \u274C Test 7: Pas d\'ETag, impossible de tester 304');
          failed++;
        }

        // Test 8: Waterfall - mesurer plusieurs pages
        console.log('\n  --- Waterfall ---');
        const paths = ['/', '/products', '/about', '/contact'];
        const measurements = [];
        for (const p of paths) {
          const m = await measureTTFB(p, PORT_SLOW);
          measurements.push({ path: p, ...m });
        }
        renderWaterfall(measurements);

        // Verifier que le waterfall a affiche quelque chose
        if (measurements.every((m) => m.totalTime > 0)) {
          console.log('  \u2705 Test 8: Waterfall mesure pour toutes les pages');
          passed++;
        } else {
          console.log('  \u274C Test 8: Waterfall incomplet');
          failed++;
        }

        console.log(`\n  Resultats: ${passed}/${passed + failed} tests passes\n`);

        slowServer.close();
        fastServer.close();
        resolve();
      });
    });
  });
}

setTimeout(runTests, 0);
