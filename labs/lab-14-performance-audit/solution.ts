// =============================================================================
// Lab 14 — Performance Audit — SOLUTION
// =============================================================================
// Executer avec : npx tsx solution.ts
// =============================================================================

import type { IncomingMessage, ServerResponse, IncomingHttpHeaders } from 'node:http';
import http from 'node:http';
import zlib from 'node:zlib';
import crypto from 'node:crypto';

const PORT_SLOW = 3140;
const PORT_FAST = 3141;

// =============================================================================
// PARTIE 1 — Serveur "lent" (pas de cache, pas de compression, latence)
// =============================================================================
// POURQUOI : Ce serveur represente le "pire cas" en termes de performance.
// En le mesurant, on etablit une baseline pour comparer avec les optimisations.

function generateLargeHTML(title) {
  // POURQUOI : On genere un HTML volumineux (~50KB) pour que la compression
  // et le caching aient un impact mesurable. En production, les pages
  // peuvent facilement atteindre cette taille.
  let html = `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <title>${title}</title>
  <style>
    body { font-family: system-ui; max-width: 1200px; margin: 0 auto; padding: 20px; }
    .item { border: 1px solid #eee; padding: 12px; margin: 8px 0; }
  </style>
</head>
<body>
  <h1>${title}</h1>
  <p>Generee le: ${new Date().toISOString()}</p>
`;

  // POURQUOI : 500 paragraphes pour atteindre ~50KB de contenu.
  for (let i = 0; i < 500; i++) {
    html += `  <div class="item">
    <h3>Element ${i + 1}</h3>
    <p>Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris.</p>
    <p>Prix: ${(Math.random() * 100).toFixed(2)} EUR | Stock: ${Math.floor(Math.random() * 1000)}</p>
  </div>\n`;
  }

  html += '</body>\n</html>';
  return html;
}

const slowServer = http.createServer((req: IncomingMessage, res: ServerResponse) => {
  const url = new URL(req.url, `http://localhost:${PORT_SLOW}`);

  const routes = {
    '/': "Page d'accueil",
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

  // POURQUOI : La latence de 200ms simule un serveur distant ou une base
  // de donnees lente. C'est ce genre de latence qu'on veut eliminer
  // grace au cache.
  setTimeout(() => {
    // POURQUOI : Connection: close force une nouvelle connexion TCP pour
    // chaque requete. Sans keep-alive, chaque requete paye le cout du
    // handshake TCP (et TLS en HTTPS).
    res.writeHead(200, {
      'Content-Type': 'text/html',
      Connection: 'close',
      // POURQUOI : Pas de Cache-Control, pas d'ETag = pas de cache possible.
      // Chaque requete regenere le contenu a zero.
    });
    res.end(generateLargeHTML(title));
  }, 200);
});

// =============================================================================
// PARTIE 2 — Mesure de TTFB
// =============================================================================
// POURQUOI : Le TTFB (Time To First Byte) est la metrique la plus importante
// pour la performance perdue. Il mesure le temps entre l'envoi de la requete
// et la reception du premier octet de la reponse.

function measureTTFB(requestPath, port, headers = {}) {
  return new Promise((resolve, reject) => {
    // POURQUOI : process.hrtime.bigint() donne une precision en nanosecondes,
    // beaucoup plus precis que Date.now() qui est en millisecondes.
    const startTime = process.hrtime.bigint();
    let ttfbTime = 0n;
    let firstDataTime = 0n;
    const chunks = [];

    const req = http.request(
      {
        hostname: 'localhost',
        port,
        path: requestPath,
        method: 'GET',
        headers: { ...headers },
      },
      (res) => {
        // POURQUOI : L'event callback de http.request se declenche quand
        // les headers de reponse sont recus. C'est le TTFB.
        ttfbTime = process.hrtime.bigint();

        res.on('data', (chunk) => {
          if (firstDataTime === 0n) {
            firstDataTime = process.hrtime.bigint();
          }
          chunks.push(chunk);
        });

        res.on('end', () => {
          const endTime = process.hrtime.bigint();
          const body = Buffer.concat(chunks);

          // POURQUOI : On convertit les nanosecondes en millisecondes
          // pour un affichage plus lisible.
          resolve({
            ttfb: Number(ttfbTime - startTime) / 1e6,
            firstByteTime: firstDataTime > 0n ? Number(firstDataTime - startTime) / 1e6 : 0,
            downloadTime: Number(endTime - ttfbTime) / 1e6,
            totalTime: Number(endTime - startTime) / 1e6,
            bodySize: body.length,
            status: res.statusCode,
            headers: res.headers,
          });
        });
      }
    );

    req.on('error', reject);
    req.end();
  });
}

// =============================================================================
// PARTIE 3 — Visualisation waterfall
// =============================================================================
// POURQUOI : Une visualisation waterfall permet de comprendre visuellement
// ou le temps est depense dans chaque requete. C'est l'equivalent
// de l'onglet Network dans les DevTools.

function renderWaterfall(measurements) {
  const barWidth = 40;
  const maxTime = Math.max(...measurements.map((m) => m.totalTime));

  // POURQUOI : On normalise toutes les mesures par rapport au temps le plus long
  // pour que la barre la plus longue fasse exactement barWidth caracteres.
  console.log('');
  console.log('  ' + '-'.repeat(70));
  console.log(`  ${'Path'.padEnd(12)} | ${'Waterfall'.padEnd(barWidth)} | TTFB     | Total`);
  console.log('  ' + '-'.repeat(70));

  for (const m of measurements) {
    // POURQUOI : La partie TTFB est en bloc plein (attente serveur),
    // la partie download est en bloc leger (reception donnees).
    const ttfbWidth = Math.max(1, Math.round((m.ttfb / maxTime) * barWidth));
    const downloadWidth = Math.max(0, Math.round((m.downloadTime / maxTime) * barWidth));
    const emptyWidth = Math.max(0, barWidth - ttfbWidth - downloadWidth);

    const bar =
      '\u2588'.repeat(ttfbWidth) +
      '\u2591'.repeat(downloadWidth) +
      ' '.repeat(emptyWidth);

    const path = m.path.padEnd(12);
    const ttfbStr = `${m.ttfb.toFixed(0)}ms`.padEnd(8);
    const totalStr = `${m.totalTime.toFixed(0)}ms`;

    console.log(`  ${path} | ${bar} | ${ttfbStr} | ${totalStr}`);
  }

  console.log('  ' + '-'.repeat(70));
  console.log(`  Legende: ${'[\u2588 TTFB]'.padEnd(15)} ${'[\u2591 Download]'.padEnd(15)}`);
  console.log('');
}

// =============================================================================
// PARTIE 4 — Serveur "rapide" (avec optimisations)
// =============================================================================
// POURQUOI : On applique toutes les optimisations vues dans le cours :
// cache, ETag, compression, keep-alive. L'objectif est de mesurer
// l'amelioration par rapport au serveur lent.

const pageCache = new Map();

const fastServer = http.createServer((req: IncomingMessage, res: ServerResponse) => {
  const url = new URL(req.url, `http://localhost:${PORT_FAST}`);

  const routes = {
    '/': "Page d'accueil",
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

  // POURQUOI : On met le HTML en cache memoire pour eviter de le regenerer.
  // En production, on utiliserait Redis ou un cache CDN.
  let html;
  let etag;

  if (pageCache.has(url.pathname)) {
    const cached = pageCache.get(url.pathname);
    html = cached.html;
    etag = cached.etag;
  } else {
    html = generateLargeHTML(title);
    // POURQUOI : L'ETag est un hash du contenu. Si le contenu ne change pas,
    // l'ETag reste le meme, permettant des reponses 304 Not Modified.
    etag = `"${crypto.createHash('md5').update(html).digest('hex')}"`;
    pageCache.set(url.pathname, { html, etag });
  }

  // POURQUOI : Si le client envoie If-None-Match avec l'ETag,
  // on retourne 304 sans body. C'est l'optimisation la plus efficace
  // car elle economise a la fois le CPU et la bande passante.
  if (req.headers['if-none-match'] === etag) {
    res.writeHead(304, {
      ETag: etag,
      'Cache-Control': 'public, max-age=3600',
    });
    res.end();
    return;
  }

  const headers = {
    'Content-Type': 'text/html',
    // POURQUOI : max-age=3600 signifie que le navigateur peut garder la page
    // en cache pendant 1 heure sans meme contacter le serveur.
    'Cache-Control': 'public, max-age=3600',
    ETag: etag,
    // POURQUOI : keep-alive reutilise la connexion TCP existante
    // au lieu d'en creer une nouvelle a chaque requete.
    Connection: 'keep-alive',
  };

  // POURQUOI : La compression gzip reduit typiquement le HTML de 70-90%.
  // On ne compresse que si le client le supporte (Accept-Encoding: gzip).
  const acceptEncoding = req.headers['accept-encoding'] || '';
  if (acceptEncoding.includes('gzip')) {
    const compressed = zlib.gzipSync(Buffer.from(html));
    headers['Content-Encoding'] = 'gzip';
    headers['Content-Length'] = compressed.length.toString();
    res.writeHead(200, headers);
    res.end(compressed);
  } else {
    headers['Content-Length'] = Buffer.byteLength(html).toString();
    res.writeHead(200, headers);
    res.end(html);
  }
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

        // Test 8: Waterfall
        console.log('\n  --- Waterfall (serveur lent) ---');
        const paths = ['/', '/products', '/about', '/contact'];
        const slowMeasurements = [];
        for (const p of paths) {
          const m = await measureTTFB(p, PORT_SLOW);
          slowMeasurements.push({ path: p, ...m });
        }
        renderWaterfall(slowMeasurements);

        console.log('  --- Waterfall (serveur rapide) ---');
        const fastMeasurements = [];
        for (const p of paths) {
          const m = await measureTTFB(p, PORT_FAST);
          fastMeasurements.push({ path: p, ...m });
        }
        renderWaterfall(fastMeasurements);

        // Comparer les moyennes
        const avgSlowTTFB =
          slowMeasurements.reduce((s, m) => s + m.ttfb, 0) / slowMeasurements.length;
        const avgFastTTFB =
          fastMeasurements.reduce((s, m) => s + m.ttfb, 0) / fastMeasurements.length;
        const improvement = ((1 - avgFastTTFB / avgSlowTTFB) * 100).toFixed(1);

        console.log(`  Amelioration TTFB: ${improvement}% (${avgSlowTTFB.toFixed(0)}ms -> ${avgFastTTFB.toFixed(0)}ms)`);

        if (slowMeasurements.every((m) => m.totalTime > 0)) {
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
