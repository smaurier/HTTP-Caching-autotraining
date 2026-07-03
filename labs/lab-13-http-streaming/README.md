# Lab 13 — HTTP streaming (chunked + Streams API)

> **Outcome :** à la fin, tu sais **streamer** une page HTML côté serveur (le shell dans le premier octet, un fragment lent derrière) via `Transfer-Encoding: chunked`, **observer** les chunks arriver en temps réel avec `curl --no-buffer`, et exposer une route `ReadableStream` NDJSON **lue au fil de l'eau** côté `fetch`.
> **Vrai outil :** serveur **Node.js natif** (`node:http`, `node:stream`, `ReadableStream`) lancé avec `node` + `curl --no-buffer`/`curl -w`/`curl -I` + Chrome DevTools (Network > Timing). Aucun harnais simulé, aucune assertion automatique.
> **Feedback :** le coach valide en session à partir de ce que tu **observes** (shell affiché tôt, chunk lent qui arrive derrière, TTFB, en-têtes bruts) — pas de test-runner auto-correcteur.

---

## Énoncé

Tu reprends la page publique de **sortie TribuZen** (`/sorties/pique-nique-juin`) du module 10, mais elle doit maintenant afficher la **liste des participants**, qui vient d'un service **lent (900 ms)**. En SSR bufferisé, l'utilisateur verrait ~900 ms de blanc. Tu vas la **streamer**.

Cahier des charges **exact** :

1. `GET /sorties/pique-nique-juin` **streame** le HTML :
   - le **shell** (`<head>`, `<title>`, `<h1>` titre, date + lieu, un placeholder `Chargement des participants…`) part **dans le premier octet** (fetch sortie ≈ 5 ms) ;
   - la **liste des participants** (`fetchParticipants` ≈ 900 ms) arrive dans un **chunk suivant**, sur la **même** réponse HTTP.
2. La réponse **n'a pas de `Content-Length`** → Node encode en `Transfer-Encoding: chunked`. Tu le **vérifies** avec `curl -I`.
3. En-têtes attendus : `Content-Type: text/html; charset=utf-8`, `Cache-Control: no-store`, `X-Accel-Buffering: no`.
4. Une seconde route `GET /api/participants` **streame** les participants **un par un** (300 ms d'écart) en **NDJSON**, produite avec un **`ReadableStream`** (Streams API), ponté vers la réponse via `Readable.fromWeb(...).pipe(res)`.
5. Une page `GET /` **consomme** `/api/participants` avec `response.body.getReader()` + `reader.read()` et ajoute chaque `<li>` **dès l'arrivée du chunk**.
6. Tu décides le **statut avant** de streamer : un slug inconnu renvoie `404` **avant** tout `write()` (piège #5 du module).

**Contraintes :**
- Tu écris le serveur **complet** depuis le starter — pas de gap-fill.
- Portée **streaming HTTP + streaming SSR uniquement.** Pas de multiplexage HTTP/2 à réimplémenter (module 02), pas de WebSocket, pas d'ISR/edge.
- Tu dois **justifier oralement** : pourquoi **pas** de `Content-Length`, pourquoi `no-store` sur une page streamée, et pourquoi on ne peut plus renvoyer 404 après le premier octet.

### Starter minimal

```bash
mkdir tribuzen-stream-lab && cd tribuzen-stream-lab
# aucune dépendance : tout est natif Node (node:http, node:stream, ReadableStream global)
# Node 18+ requis (ReadableStream global + Readable.fromWeb)
```

```js
// server.mjs — STARTER (à compléter)
import { createServer } from 'node:http';
import { Readable } from 'node:stream';

// TODO 1 : fetchSortie()      -> ~5 ms  -> { titre, date, lieu }
// TODO 2 : fetchParticipants() -> ~900 ms -> ['Alice','Bob','Cara','David']
// TODO 3 : escapeHtml(s)
// TODO 4 : GET /sorties/pique-nique-juin -> streame shell (chunk 1) puis participants (chunk 2)
//          - PAS de Content-Length, Cache-Control: no-store, X-Accel-Buffering: no
//          - slug inconnu -> 404 AVANT tout write()
// TODO 5 : GET /api/participants -> ReadableStream NDJSON (300 ms d'écart), pipe vers res
// TODO 6 : GET / -> page qui lit /api/participants avec response.body.getReader()

const server = createServer(async (req, res) => {
  // ...
});

server.listen(3000, () => console.log('http://localhost:3000/sorties/pique-nique-juin'));
```

Lance `node server.mjs`, puis observe avec `curl --no-buffer`, `curl -I` et DevTools > Network.

---

## Étapes (en friction)

1. **Écris `fetchSortie` et `fetchParticipants`** — deux `await new Promise(r => setTimeout(r, ms))` (5 ms et 900 ms) qui renvoient respectivement l'objet sortie et le tableau de prénoms.
2. **Écris la route `/sorties/...`** — `res.writeHead(200, {...})` **sans** `Content-Length`. Écris le shell avec un premier `res.write(...)` : titre, date, lieu, `<section id="participants">Chargement…</section>`.
3. **Vérifie le premier octet tôt** — `curl --no-buffer http://localhost:3000/sorties/pique-nique-juin` : le shell doit s'afficher **immédiatement**, puis (~900 ms plus tard) le second chunk.
4. **Streame la liste** — après `await fetchParticipants()`, `res.write(...)` un `<script>` qui remplace le placeholder par `<ul>` des participants ; `res.end(...)` ferme le HTML (chunk de taille 0).
5. **Confirme le chunked** — `curl -I` : tu dois voir `Transfer-Encoding: chunked` et **aucun** `Content-Length`.
6. **Gère le 404 avant le stream** — pour un slug ≠ `pique-nique-juin`, `res.writeHead(404)` + `res.end()` **avant** tout `write()` de shell.
7. **Écris `/api/participants`** — un `ReadableStream` dont le `start(controller)` boucle sur les prénoms avec 300 ms d'écart, `controller.enqueue(new TextEncoder().encode(JSON.stringify({nom}) + '\n'))`, puis `controller.close()`. Ponte avec `Readable.fromWeb(stream).pipe(res)` et `Content-Type: application/x-ndjson`.
8. **Écris la page `/`** — `fetch('/api/participants')`, `response.body.getReader()`, boucle `reader.read()`, `TextDecoder`, split sur `\n`, `appendChild` d'un `<li>` par ligne complète. Observe les `<li>` apparaître **un par un**.
9. **Mesure le TTFB** — `curl -o NUL -s -w "TTFB=%{time_starttransfer}s total=%{time_total}s\n" http://localhost:3000/sorties/pique-nique-juin` : le TTFB est **court** (~5 ms, le shell), `total` est **long** (~900 ms, le second chunk). C'est toute la démonstration.

---

## Corrigé complet commenté

```js
// server.mjs — CORRIGÉ
import { createServer } from 'node:http';
import { Readable } from 'node:stream';

// ── Fetch RAPIDE : infos de la sortie (~5 ms) — peut entrer dans le shell ──
async function fetchSortie(slug) {
  await new Promise((r) => setTimeout(r, 5));
  const db = {
    'pique-nique-juin': {
      titre: 'Pique-nique de juin',
      date: '2026-06-21',
      lieu: 'Parc de la Tête d\'Or',
    },
  };
  return db[slug] ?? null;
}

// ── Fetch LENT : liste des participants (~900 ms) — le fragment qui plombait le TTFB ──
async function fetchParticipants() {
  await new Promise((r) => setTimeout(r, 900));
  return ['Alice', 'Bob', 'Cara', 'David'];
}

// Générateur async : un participant toutes les 300 ms (pour /api/participants)
async function* participantsSource() {
  for (const nom of ['Alice', 'Bob', 'Cara', 'David']) {
    await new Promise((r) => setTimeout(r, 300));
    yield JSON.stringify({ nom, at: Date.now() }) + '\n'; // NDJSON : un objet par ligne
  }
}

function escapeHtml(s) {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

const server = createServer(async (req, res) => {
  // ─────────────────────────────────────────────────────────────────
  // ROUTE 1 : streaming SSR de la page de sortie
  // ─────────────────────────────────────────────────────────────────
  if (req.url.startsWith('/sorties/')) {
    const slug = req.url.slice('/sorties/'.length);

    // Le STATUT se décide AVANT de streamer : une fois le shell parti,
    // les en-têtes sont envoyés et on ne peut plus renvoyer 404 (piège #5).
    const sortie = await fetchSortie(slug);
    if (!sortie) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' });
      return res.end('Sortie introuvable');
    }

    // PAS de Content-Length -> Node bascule en Transfer-Encoding: chunked
    // dès le premier res.write(). no-store : réponse à contenu progressif,
    // pas de cache partagé. X-Accel-Buffering: no -> nginx ne bufferise pas.
    res.writeHead(200, {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Accel-Buffering': 'no',
    });

    // ── CHUNK 1 : le SHELL, envoyé tout de suite (TTFB ≈ 5 ms) ──
    res.write(`<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="utf-8">
  <title>${escapeHtml(sortie.titre)} — TribuZen</title>
</head>
<body>
  <main>
    <h1>${escapeHtml(sortie.titre)}</h1>
    <p>Le ${escapeHtml(sortie.date)} — ${escapeHtml(sortie.lieu)}</p>
    <section id="participants"><p>Chargement des participants…</p></section>
`);
    // Ici, le navigateur a DÉJÀ reçu le titre et peut le peindre.

    // ── CHUNK 2 : la liste, streamée dès que le fetch lent répond (~905 ms) ──
    const participants = await fetchParticipants();
    const items = participants.map((p) => `<li>${escapeHtml(p)}</li>`).join('');
    res.write(`  <script>
    document.getElementById('participants').innerHTML =
      '<h2>Participants</h2><ul>${items}</ul>';
  </script>
`);

    // ── CHUNK final : res.end() envoie le chunk de taille 0 (fin de réponse) ──
    res.end(`  </main>
</body>
</html>`);

    req.on('close', () => { /* en réel : annuler timers/fetch si client parti */ });
    return;
  }

  // ─────────────────────────────────────────────────────────────────
  // ROUTE 2 : /api/participants -> ReadableStream NDJSON
  // ─────────────────────────────────────────────────────────────────
  if (req.url === '/api/participants') {
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        for await (const line of participantsSource()) {
          controller.enqueue(encoder.encode(line)); // pousser un chunk (Uint8Array)
        }
        controller.close();                          // plus de chunks
      },
    });

    res.writeHead(200, {
      'Content-Type': 'application/x-ndjson',
      'Cache-Control': 'no-store',
    });
    // Pont Web ReadableStream -> flux Node -> réponse HTTP (chunked auto)
    Readable.fromWeb(stream).pipe(res);
    return;
  }

  // ─────────────────────────────────────────────────────────────────
  // ROUTE 3 : / -> page qui CONSOMME le flux au fil de l'eau
  // ─────────────────────────────────────────────────────────────────
  if (req.url === '/') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(`<!DOCTYPE html>
<html lang="fr"><head><meta charset="utf-8"><title>Stream fetch</title></head>
<body>
  <h1>Participants (streamés un par un)</h1>
  <ul id="list"></ul>
  <script>
    (async () => {
      const response = await fetch('/api/participants');
      const reader = response.body.getReader();  // response.body EST un ReadableStream
      const decoder = new TextDecoder();
      let buffer = '';
      while (true) {
        const { done, value } = await reader.read(); // value = Uint8Array
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\\n');
        buffer = lines.pop();                        // garde la ligne partielle éventuelle
        for (const line of lines) {
          if (!line) continue;
          const p = JSON.parse(line);
          const li = document.createElement('li');
          li.textContent = p.nom;
          document.getElementById('list').appendChild(li); // affiché DÈS l'arrivée du chunk
        }
      }
    })();
  </script>
</body></html>`);
    return;
  }

  res.writeHead(404, { 'Content-Type': 'text/plain' });
  res.end('Not found');
});

server.listen(3000, () =>
  console.log('http://localhost:3000/sorties/pique-nique-juin  |  http://localhost:3000/'),
);
```

**Pourquoi ce corrigé est correct :**
- Aucun `Content-Length` sur `/sorties/...` → Node encode en `Transfer-Encoding: chunked` dès le premier `res.write()`. Le shell part **avant** `fetchParticipants()` : TTFB ≈ 5 ms au lieu de ~905 ms.
- Le statut est décidé **avant** le premier `write()` : un slug inconnu renvoie un vrai `404`. Après le shell, un `writeHead()` échouerait (en-têtes déjà partis) — c'est le piège #5 du module.
- `/api/participants` produit un vrai `ReadableStream` (`controller.enqueue`/`controller.close`), ponté avec `Readable.fromWeb(...).pipe(res)`. Le client le lit avec `getReader()`/`read()` et affiche chaque `<li>` **dès l'arrivée** — sans jamais bufferiser toute la réponse.
- `Cache-Control: no-store` : réponses à contenu progressif, hors cache partagé (§2.9 du module). `X-Accel-Buffering: no` évite qu'un proxy annule le streaming.

**Vérification attendue avec `curl -I` (les en-têtes bruts) :**
```
$ curl -I http://localhost:3000/sorties/pique-nique-juin
HTTP/1.1 200 OK
Content-Type: text/html; charset=utf-8
Cache-Control: no-store
X-Accel-Buffering: no
Transfer-Encoding: chunked          # <- présent, et AUCUN Content-Length

$ curl -I http://localhost:3000/sorties/inconnue
HTTP/1.1 404 Not Found
Cache-Control: no-store
```

**Vérification du streaming (chunks en temps réel) :**
```
$ curl --no-buffer http://localhost:3000/sorties/pique-nique-juin
# Le shell (<h1>, date, lieu, "Chargement…") s'affiche IMMÉDIATEMENT,
# puis ~900 ms plus tard le <script> des participants apparaît dans le MÊME flux.
```

**Vérification du TTFB vs total (`curl -w`) :**
```
$ curl -o NUL -s -w "TTFB=%{time_starttransfer}s  total=%{time_total}s\n" http://localhost:3000/sorties/pique-nique-juin
TTFB=0.00x s  total=0.90x s
# TTFB court (shell) MAIS total long (2e chunk) : le premier octet ne dépend plus du fetch lent.
```
(sur macOS/Linux, remplace `NUL` par `/dev/null`.)

**Vérification en DevTools :** ouvre `http://localhost:3000/`, onglet **Network** > `participants` > **Timing** : « Waiting for server response » (TTFB) court, la réponse continue d'arriver ensuite. Les `<li>` apparaissent un par un dans la page pendant que le flux coule.

---

## Variante J+30 (fading)

**Même objectif, contraintes ajoutées — à reproduire de mémoire, sans rouvrir ce corrigé, en 30 minutes :**

1. Sur `/sorties/...`, ajoute un **second fragment lent** : une **météo du lieu** (`fetchMeteo()` ≈ 1500 ms). Streame-le dans un **troisième chunk**, indépendant des participants. Les deux fetch lents doivent être **lancés en parallèle** (`Promise` démarrées avant les `await`), pas en série — vérifie que le `total` reste ~1500 ms, pas ~2400 ms.
2. Sur `/api/participants`, gère la **déconnexion client** : si `req.on('close')` se déclenche pendant le stream, **arrête** le générateur (un flag booléen suffit) et **log** l'abandon. Teste en coupant `curl` (Ctrl-C) au milieu.
3. Ajoute un **heartbeat** de type commentaire toutes les 200 ms sur `/api/participants` (une ligne vide `\n` ou un chunk ignoré) pour garder le flux vivant si les données tardent.
4. **Sans regarder** le module 13 ni ce corrigé.

**Critères de réussite :**
- Les trois chunks (shell, participants, météo) arrivent **progressivement** en `curl --no-buffer` ; `total` ≈ 1500 ms (parallèle réussi).
- Couper `curl` au milieu **arrête** le générateur côté serveur (log visible), pas de fuite de timer.
- `curl -I` montre toujours `Transfer-Encoding: chunked` sans `Content-Length`.

---

## Application TribuZen

Dans le repo `smaurier/tribuzen`, ce streaming vit ici :

```
tribuzen/
  ssr/src/routes/sortie-stream.ts     # streaming SSR : shell puis participants (Route 1)
  ssr/src/render/shell.ts             # assemblage du shell (chunk 1)
  ssr/src/api/participants.ts         # ReadableStream NDJSON (Route 2)
  infra/cdn.rules                     # /sorties/*/stream en pass-through (no buffering)
```

**Différences par rapport au lab :**
- En production, le **CDN doit passer le flux** (pass-through) sur la route streamée ; sinon il bufferise et annule le gain (piège #2 du module). Le lab le simule avec `X-Accel-Buffering: no`.
- La page de sortie **choisit** par cas : la variante **cachable** (HTML fini, cache de rendu du module 10) pour le trafic public froid, la variante **streamée** (`no-store`) quand un fragment lent domine le TTFB. On ne fait pas les deux sur la même réponse.
- Si le front public migre vers **Next.js 15+**, la liste des participants passe dans un `<Suspense fallback={<ParticipantsSkeleton/>}>` et un `loading.tsx` fournit l'état de chargement du segment ; le `404` d'un slug inconnu est décidé **avant** le stream.

**Commit cible :**
```
feat(ssr): streaming de la page de sortie — shell d'abord, participants en chunk (Transfer-Encoding: chunked)
```
