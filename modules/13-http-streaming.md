---
titre: HTTP streaming — envoyer la réponse au fil de l'eau
cours: 11-http-caching
notions: ["Transfer-Encoding: chunked", "format wire chunked (taille hex + CRLF)", "Content-Length vs chunked (exclusifs)", "chunked interdit en HTTP/2 (DATA frames)", "Streams API (ReadableStream)", "controller.enqueue/close/error", "response.body.getReader()", "reader.read() -> {done, value}", "TextEncoder/TextDecoder", "streaming SSR (shell d'abord)", "React Suspense / loading.js (en survol)", "progressive rendering", "TTFB vs contenu progressif", "Server-Sent Events (en survol)", "text/event-stream", "streaming et cache partagé (no-store)"]
outcomes:
  - sait envoyer une réponse HTTP en chunked (Transfer-Encoding) depuis un serveur Node et l'observer avec curl --no-buffer
  - sait produire et consommer un ReadableStream (Streams API) côté serveur et côté fetch
  - sait expliquer ce que le streaming SSR change au TTFB et au rendu progressif face au SSR bufferisé (module 10)
  - sait situer React Suspense / loading.js et Server-Sent Events par rapport au streaming HTTP brut (survol)
prerequis: [00-prerequis-et-vue-ensemble, 01-protocole-http, 02-http2-http3, 03-en-tetes-http, 04-cache-control, 05-etag-validation-conditionnelle, 06-stale-while-revalidate, 07-cache-navigateur, 08-cdn, 09-cache-multi-couches, 10-ssr, 11-isr-ssg, 12-edge-rendering]
next: 14-performance-web
libs: []
tribuzen: page publique d'une sortie TribuZen rendue en streaming SSR — le shell (titre, layout) part dans le premier octet, la liste des participants (fetch lent) arrive en chunks derrière
last-reviewed: 2026-07
---

# HTTP streaming — envoyer la réponse au fil de l'eau

> **Outcomes — tu sauras FAIRE :** envoyer une réponse HTTP en `chunked` et l'observer avec `curl --no-buffer`, produire/consommer un `ReadableStream`, expliquer ce que le streaming SSR change au TTFB et au rendu progressif, situer React Suspense et SSE par rapport au streaming brut.
> **Difficulté :** :star::star::star::star:
>
> **Portée :** ce module couvre **uniquement** le **streaming d'une réponse HTTP** (envoi progressif du corps) et son application au **streaming SSR** (le HTML part par morceaux). Il **s'appuie sur le SSR du module 10** (rendu à la requête) : ici on ne discute plus *quand* on rend, mais *comment on envoie* le rendu. Le **multiplexage HTTP/2** est vu au **module 02** ; on ne le ré-explique pas. React Suspense / `loading.js` et **Server-Sent Events** sont traités **en survol** — leur mécanique profonde relève des cours de framework et du temps réel. WebSocket n'est **pas** dans la portée.

## 1. Cas concret d'abord

Reprends la page publique de sortie TribuZen du **module 10** : `/sorties/pique-nique-juin`, rendue **côté serveur**. Le corps de la page est simple (titre, date, lieu) et rend en ~5 ms. Mais on veut maintenant afficher **la liste des participants**, qui vient d'un service lent : `fetchParticipants()` met **900 ms**.

En SSR **bufferisé** (module 10), le serveur assemble **toute** la page avant d'envoyer le premier octet :

```
[render shell 5ms] ─ [fetch participants 900ms] ─ [assemble] ─ [envoie TOUT] ──▶ navigateur
                                                                 ↑
                              premier octet à ~905ms : écran blanc pendant ~900ms
```

Le TTFB est plombé par le fetch le plus lent. L'utilisateur voit **du blanc pendant ~900 ms**, alors que le titre et la mise en page étaient prêts en 5 ms.

**Le problème :** on tient en otage une page prête à 95 % à cause d'un seul fragment lent.

La réponse est le **streaming** : on envoie le **shell** (`<head>`, titre, layout) **immédiatement**, dans le premier octet ; puis, dès que `fetchParticipants()` répond, on envoie la liste **dans un chunk suivant** — sur la même réponse HTTP.

```
[render shell 5ms] ─ envoie shell ──▶ navigateur peint le titre à ~5ms
                     [fetch 900ms] ─ envoie chunk participants ──▶ liste apparaît à ~905ms
```

Le TTFB s'effondre (~5 ms), l'utilisateur voit le contenu **progressivement**, et le temps total ne change pas. Ce module te donne le mécanisme HTTP qui rend ça possible (`Transfer-Encoding: chunked`, Streams API) et son application au streaming SSR.

---

## 2. Théorie complète, concise

### 2.1 Le corps HTTP n'est pas obligatoirement envoyé d'un bloc

Une réponse HTTP se lit en deux temps : les **en-têtes**, puis le **corps**. Rien dans le protocole n'oblige à produire tout le corps avant de commencer à l'envoyer. Le serveur peut écrire le premier octet des en-têtes, puis alimenter le corps **au fil de l'eau**. Le navigateur, lui, peut commencer à parser et peindre le HTML **dès les premiers octets** reçus.

Deux conditions pour streamer un corps :

1. Le client doit savoir **où finit la réponse** sans connaître sa taille à l'avance.
2. Aucun intermédiaire (proxy, CDN) ne doit **bufferiser** toute la réponse avant de la relayer.

La première condition est résolue par `Transfer-Encoding: chunked`.

### 2.2 `Transfer-Encoding: chunked` — la taille au fur et à mesure

En temps normal, une réponse annonce sa taille avec `Content-Length: 1234`. Impossible si on ne connaît pas encore la taille finale (contenu généré à la volée). La directive **`chunked`** résout ça : le corps est découpé en **morceaux** (chunks), chacun **préfixé de sa propre taille en hexadécimal**, et un **chunk de taille 0** signale la fin.

Format wire exact (vérifié MDN) :

```http
HTTP/1.1 200 OK
Content-Type: text/plain
Transfer-Encoding: chunked

7\r\n
Welcome\r\n
1c\r\n
to Mozilla Developer Network\r\n
0\r\n
\r\n
```

- `7` = la taille du chunk suivant en hexadécimal (7 octets : `Welcome`), suivie de `\r\n`.
- Les données du chunk, puis `\r\n`.
- `1c` = 28 octets pour le chunk suivant.
- `0\r\n\r\n` = chunk terminal de taille 0 → fin de la réponse.

Deux faits à retenir (vérifiés MDN) :

- **`Content-Length` doit être omis** avec `chunked` : les deux sont **mutuellement exclusifs**. Le client déduit la fin du chunk de taille 0, pas d'un compteur d'octets.
- `Transfer-Encoding` est un en-tête **hop-by-hop** (de nœud à nœud, pas attaché à la ressource). Chaque segment de la connexion peut le réencoder.

En Node.js, tu **n'écris pas** ce format à la main : dès que tu appelles `res.write()` sans avoir posé de `Content-Length`, Node passe **automatiquement** en `Transfer-Encoding: chunked`. Chaque `res.write()` peut devenir un chunk sur le réseau.

### 2.3 `chunked` n'existe pas en HTTP/2

**Fait vérifié MDN :** HTTP/2 **interdit tout usage** de `Transfer-Encoding`. Utiliser cet en-tête en HTTP/2 déclenche typiquement une `protocol error`. HTTP/2 n'en a pas besoin : le corps y est **déjà** une suite de **DATA frames** (module 02), le streaming est natif au protocole. Le chunk de taille 0 est remplacé par la frame de fin de stream (flag `END_STREAM`).

Conséquence pratique : le mécanisme `chunked` est **spécifique à HTTP/1.1**. Ton code applicatif (`res.write()`, ReadableStream) reste identique ; c'est la **couche transport** qui choisit `chunked` (HTTP/1.1) ou DATA frames (HTTP/2). Tu streames pareil, l'encodage sur le fil diffère.

### 2.4 La Streams API — `ReadableStream`

La plateforme web modélise un flux de données lu morceau par morceau avec **`ReadableStream`**. Sa forme minimale (vérifiée MDN) :

```js
const stream = new ReadableStream({
  start(controller) {
    // appelé une fois, à la construction
    controller.enqueue(chunk);   // pousser un morceau dans le flux
  },
  pull(controller) {
    // appelé quand le consommateur veut plus de données
  },
  cancel() {
    // appelé si le consommateur abandonne
  },
});
```

Le `controller` (`ReadableStreamDefaultController`) expose trois méthodes :

- `controller.enqueue(value)` — ajoute un chunk au flux ;
- `controller.close()` — clôt le flux (plus de chunks) ;
- `controller.error(err)` — met le flux en erreur.

Les chunks d'un flux HTTP sont des **`Uint8Array`**, pas des strings. On convertit avec :

```js
const bytes = new TextEncoder().encode('<li>Alice</li>'); // string -> Uint8Array
const text  = new TextDecoder().decode(bytes);            // Uint8Array -> string
```

### 2.5 Consommer un flux — `response.body.getReader()`

Côté client (ou côté serveur qui appelle une API), **`fetch()` expose le corps comme un `ReadableStream`** via `response.body`. On le lit avec un **reader** :

```js
const response = await fetch('/api/logs');
const reader = response.body.getReader();
const decoder = new TextDecoder();

while (true) {
  const { done, value } = await reader.read(); // value = Uint8Array
  if (done) break;                             // flux terminé, value = undefined
  const text = decoder.decode(value, { stream: true });
  // traiter `text` au fur et à mesure — sans attendre la fin de la réponse
}
```

`reader.read()` renvoie une **`Promise<{ done, value }>`** : `done` passe à `true` quand le flux est fini. Alternative moderne (vérifiée MDN) : `for await (const chunk of response.body)`.

Le point clé : ce code traite **chaque chunk dès son arrivée**, sans jamais bufferiser toute la réponse en mémoire. C'est la lecture progressive côté consommateur.

### 2.6 Streaming SSR — envoyer le shell, puis le contenu

Le streaming SSR **applique** tout ce qui précède au HTML rendu à la requête (module 10). Au lieu d'attendre que **tout** le HTML soit assemblé (SSR bufferisé), le serveur :

1. envoie **immédiatement** le shell : `<!DOCTYPE html>`, `<head>`, le layout, les zones prêtes → premier octet à ~0 ms ;
2. lance les fetch lents ;
3. envoie **chaque section dès qu'elle est prête**, dans un chunk suivant.

```
SSR bufferisé (module 10) :   [render + fetch 900ms] ─── envoie TOUT ──▶  1er octet à ~905ms
SSR streaming (ce module) :   envoie shell ──▶ 1er octet ~5ms
                              [fetch 900ms] ─── envoie chunk ──▶  contenu à ~905ms
```

Le bénéfice est double : **TTFB effondré** (le premier octet ne dépend plus du fetch le plus lent) et **rendu progressif** (le navigateur peint le shell tout de suite). Le temps **total** est inchangé — on n'accélère pas les fetch, on **cesse de tenir le shell en otage**.

### 2.7 React Suspense et `loading.js` — en survol

Écrire le streaming SSR à la main (section 3) éclaire le mécanisme ; en pratique, un framework l'orchestre. Dans **Next.js App Router** (vérifié doc officielle), deux outils :

- **`<Suspense fallback={...}>`** enveloppe un composant qui fait un `await` lent. Next envoie **immédiatement** le `fallback` (un squelette) dans le shell, puis **streame** le composant réel dès que son `await` se résout, et le **remplace en place** :

  ```tsx
  // app/dashboard/page.tsx
  import { Suspense } from 'react'

  export default function Page() {
    return (
      <section>
        <h1>Sortie</h1>                             {/* shell, envoyé tout de suite */}
        <Suspense fallback={<p>Chargement…</p>}>
          <ParticipantsList />                       {/* fetch lent, streamé derrière */}
        </Suspense>
      </section>
    )
  }
  ```

- **`loading.js`** (fichier spécial) : Next l'enveloppe **automatiquement** dans un `<Suspense>` autour de `page.js`. Il donne un **état de chargement instantané** pendant que le contenu du segment **streame**, puis échange le contenu final une fois prêt.

Deux bénéfices annoncés par la doc : **Streaming Server Rendering** (HTML progressif) et **Selective Hydration** (React hydrate en priorité ce avec quoi l'utilisateur interagit). Détail hors portée — retiens : **Suspense = frontière de streaming**, le `fallback` part dans le shell, le vrai contenu suit.

> **Note statut HTTP (doc Next) :** quand une réponse streame, Next renvoie **`200`** dès l'envoi du shell. Le code statut **ne peut plus changer** après le début du streaming (les en-têtes sont déjà partis). Pour un vrai `404`, il faut vérifier l'existence de la ressource **avant** de commencer à streamer.

### 2.8 Server-Sent Events — en survol

**Server-Sent Events (SSE)** est un cas particulier de streaming HTTP : un flux **serveur → client** à sens unique, tenu ouvert, où le serveur pousse des messages texte. Il se distingue du streaming SSR (qui streame **une** réponse HTML qui se termine) par sa vocation **temps réel continu**.

Faits vérifiés MDN :

- Content-Type **`text/event-stream`** ;
- côté client, l'API **`EventSource`** : `const es = new EventSource('/flux')` ;
- format d'un message : des champs `data:`, `event:`, `id:`, `retry:`, un message **terminé par une double ligne vide** ; une ligne commençant par `:` est un commentaire ;
- **reconnexion automatique** intégrée : si la connexion tombe, `EventSource` se reconnecte et renvoie le dernier `id` reçu (en-tête `Last-Event-ID`) ;
- **unidirectionnel** : le client ne peut pas émettre vers le serveur par ce canal (c'est le rôle de WebSocket, hors portée).

```
event: metric\n
data: {"cpu": 42}\n
\n                     ← double newline = fin du message
```

Retiens le positionnement : **streaming SSR** = une page HTML envoyée progressivement puis close ; **SSE** = un canal ouvert de mises à jour continues (notifications, feed live) ; **WebSocket** = bidirectionnel (chat, jeu), autre protocole, autre cours.

### 2.9 Streaming et cache : ce qui change

Une réponse **chunked** reste cachable comme une autre : le CDN peut stocker le corps complet une fois reçu et le resservir. Mais deux réflexes s'imposent :

- **Un flux personnalisé ou temps réel ne se cache pas en partagé.** Un flux SSE, ou un HTML streamé contenant du perso, porte les mêmes règles que le module 10 : `Cache-Control: private, no-store`. Pour SSE, on ajoute typiquement `Cache-Control: no-cache` (les événements ne doivent pas être resservis d'un cache).
- **Le buffering des intermédiaires tue le streaming.** Un proxy (nginx par défaut, certains CDN) qui **bufferise** la réponse annule le bénéfice : le client reçoit tout d'un coup. On le désactive côté origine (ex. en-tête `X-Accel-Buffering: no` pour nginx) ou en configurant le CDN pour **passer le flux** (pass-through). Le streaming SSR d'une page **publique cachable** est donc un compromis : soit on cache le HTML fini (pas de streaming au hit), soit on streame et on renonce au cache partagé de cette réponse-là.

---

## 3. Worked examples

### Exemple 1 — Streaming SSR de la page de sortie (Node HTTP + chunked)

On résout le cas concret du §1 : le shell part tout de suite, la liste des participants (fetch lent) arrive derrière, sur la même réponse HTTP. Vrai outil du lab.

```js
// stream-ssr.mjs — streaming SSR avec Transfer-Encoding: chunked (Node natif)
import { createServer } from 'node:http';

// Fetch rapide : les infos de la sortie (~5 ms)
async function fetchSortie() {
  await new Promise((r) => setTimeout(r, 5));
  return { titre: 'Pique-nique de juin', date: '2026-06-21', lieu: 'Parc de la Tête d\'Or' };
}

// Fetch LENT : la liste des participants (~900 ms) — le fragment qui plombait le TTFB
async function fetchParticipants() {
  await new Promise((r) => setTimeout(r, 900));
  return ['Alice', 'Bob', 'Cara', 'David'];
}

function escapeHtml(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

const server = createServer(async (req, res) => {
  if (req.url !== '/sorties/pique-nique-juin') {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    return res.end('Not found');
  }

  const sortie = await fetchSortie(); // rapide : on peut l'inclure dans le shell

  // On NE pose PAS de Content-Length (taille finale inconnue).
  // Dès le premier res.write(), Node bascule en Transfer-Encoding: chunked.
  res.writeHead(200, {
    'Content-Type': 'text/html; charset=utf-8',
    'Cache-Control': 'no-store',      // page streamée avec du contenu à venir : pas de cache partagé ici
    'X-Accel-Buffering': 'no',        // demande à nginx de NE PAS bufferiser (sinon streaming annulé)
  });

  // ── CHUNK 1 : le SHELL, envoyé immédiatement (premier octet à ~5 ms) ──
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
  // À cet instant, le navigateur a DÉJÀ le titre et peut le peindre. TTFB ≈ 5 ms.

  // ── CHUNK 2 : la liste, envoyée dès que le fetch lent répond (~905 ms) ──
  const participants = await fetchParticipants();
  const items = participants.map((p) => `<li>${escapeHtml(p)}</li>`).join('');
  res.write(`  <script>
    // remplace le placeholder par le contenu réel, une fois streamé
    document.getElementById('participants').innerHTML =
      '<h2>Participants</h2><ul>${items}</ul>';
  </script>
`);

  // ── CHUNK final : fermeture — res.end() envoie le chunk de taille 0 ──
  res.end(`  </main>
</body>
</html>`);

  // Si le client se déconnecte pendant le fetch lent, on nettoie
  req.on('close', () => { /* annuler des timers/fetch réels ici */ });
});

server.listen(3000, () => {
  console.log('Streaming SSR → http://localhost:3000/sorties/pique-nique-juin');
});
```

**Pourquoi c'est correct :**
- Aucun `Content-Length` posé → Node encode en `chunked` automatiquement. Chaque `res.write()` peut partir sur le fil sans attendre la suite.
- Le shell (titre, layout) part **avant** `fetchParticipants()` → TTFB ≈ 5 ms au lieu de ~905 ms. C'est exactement le gain du §1.
- `res.end()` envoie le **chunk de taille 0** qui clôt la réponse.
- `Cache-Control: no-store` : cette réponse mêle du contenu progressif, on ne la met pas en cache partagé (§2.9). `X-Accel-Buffering: no` empêche un proxy de tout bufferiser et d'annuler le streaming.

Observe avec `curl --no-buffer http://localhost:3000/sorties/pique-nique-juin` : le shell s'affiche **tout de suite**, puis la ligne `<script>` apparaît **~900 ms plus tard**, dans le même flux.

### Exemple 2 — Produire et consommer un `ReadableStream` (API + fetch)

Même principe, mais avec la **Streams API** explicite : une route `/api/participants` qui **streame** les participants un par un en NDJSON, et un client `fetch` qui les **lit au fil de l'eau**.

```js
// stream-api.mjs — ReadableStream côté serveur + getReader() côté client
import { createServer } from 'node:http';
import { Readable } from 'node:stream';

async function* participantsSource() {
  const noms = ['Alice', 'Bob', 'Cara', 'David'];
  for (const nom of noms) {
    await new Promise((r) => setTimeout(r, 300)); // chaque participant arrive avec 300 ms d'écart
    yield JSON.stringify({ nom, at: Date.now() }) + '\n'; // NDJSON : un objet JSON par ligne
  }
}

const server = createServer(async (req, res) => {
  if (req.url === '/api/participants') {
    // ── ReadableStream (Web API) : source de données poussée au consommateur ──
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
    // Pont Web ReadableStream -> flux Node, puis vers la réponse HTTP (chunked auto)
    Readable.fromWeb(stream).pipe(res);
    return;
  }

  // ── Page de démo qui CONSOMME le flux avec response.body.getReader() ──
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(`<!DOCTYPE html>
<html lang="fr"><head><meta charset="utf-8"><title>Stream fetch</title></head>
<body>
  <h1>Participants (streamés)</h1>
  <ul id="list"></ul>
  <script>
    (async () => {
      const response = await fetch('/api/participants');
      const reader = response.body.getReader();   // response.body est un ReadableStream
      const decoder = new TextDecoder();
      let buffer = '';
      while (true) {
        const { done, value } = await reader.read(); // value = Uint8Array
        if (done) break;                             // flux fini
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\\n');
        buffer = lines.pop();                        // garde la ligne partielle
        for (const line of lines) {
          if (!line) continue;
          const p = JSON.parse(line);
          const li = document.createElement('li');
          li.textContent = p.nom;
          document.getElementById('list').appendChild(li); // affiche CHAQUE participant dès son arrivée
        }
      }
    })();
  </script>
</body></html>`);
});

server.listen(3000, () => {
  console.log('ReadableStream demo → http://localhost:3000');
});
```

**Ce que ça montre :**
- Côté serveur : un `ReadableStream` alimenté par `controller.enqueue()`/`controller.close()`, ponté vers la réponse HTTP avec `Readable.fromWeb(...).pipe(res)` → encodage `chunked` géré par Node.
- Côté client : `response.body.getReader()` + `reader.read()` en boucle. Chaque `<li>` s'ajoute **dès que le chunk arrive** (toutes les 300 ms), sans attendre la fin de la réponse.
- Le `buffer`/`split('\n')` gère le fait qu'un chunk réseau peut couper une ligne JSON en deux : on ne parse que les lignes **complètes**.

---

## 4. Pièges & misconceptions

### PIÈGE #1 — Poser `Content-Length` et croire qu'on streame quand même

```js
❌ res.writeHead(200, { 'Content-Length': 5000 });
   res.write(shell);            // le client attend 5000 octets pile
   res.write(reste);
```

Avec un `Content-Length` fixe, le client sait exactement combien d'octets attendre. Si tu écris en plusieurs `write()`, ce n'est pas du vrai streaming progressif côté sémantique, et si le total ne fait pas 5000 octets la réponse est corrompue. **`Content-Length` et `chunked` sont mutuellement exclusifs** (MDN).

```js
✅ res.writeHead(200, { 'Content-Type': 'text/html' }); // PAS de Content-Length
   res.write(shell);   // Node passe en Transfer-Encoding: chunked
   res.write(reste);
   res.end();          // chunk de taille 0
```

**Règle :** pour streamer, **n'annonce pas** de `Content-Length` — laisse `chunked` (ou les DATA frames HTTP/2) faire la fin de réponse.

### PIÈGE #2 — Un proxy/CDN qui bufferise annule tout

```
❌ Serveur streame par chunks ─▶ nginx bufferise TOUTE la réponse ─▶ client reçoit d'un bloc
```

Le code serveur streame correctement, mais un intermédiaire accumule la réponse entière avant de la relayer. Le client voit le TTFB de bout en bout : le gain a disparu, invisible en local mais bien réel en prod.

```
✅ X-Accel-Buffering: no (nginx) + CDN configuré en pass-through pour cette route
```

**Règle :** le streaming se teste **à travers l'infra réelle** (proxy, CDN), pas seulement sur `localhost`. Un chunk émis n'est utile que s'il n'est pas ré-agrégé en chemin.

### PIÈGE #3 — Croire que `Transfer-Encoding: chunked` s'applique en HTTP/2

```http
❌ HTTP/2 200
   transfer-encoding: chunked      # protocol error probable
```

**HTTP/2 interdit `Transfer-Encoding`** (MDN). Le corps y est déjà une suite de DATA frames ; poser cet en-tête peut déclencher une erreur de protocole. C'est purement HTTP/1.1.

```
✅ Ton code (res.write / ReadableStream) reste identique.
   HTTP/1.1 -> chunked ;  HTTP/2 -> DATA frames + END_STREAM.  La couche transport décide.
```

**Règle :** tu streames de la même façon ; l'encodage sur le fil dépend de la version HTTP négociée, pas de ton code applicatif.

### PIÈGE #4 — Confondre streaming SSR et Server-Sent Events

```
❌ "Le streaming SSR et SSE, c'est pareil, ça envoie des morceaux."
```

Le **streaming SSR** envoie **une** réponse HTML qui **se termine** (chunk 0) : c'est le chargement progressif d'**une page**. **SSE** tient un canal **ouvert en permanence** (`text/event-stream`, `EventSource`, reconnexion auto) pour pousser des **mises à jour continues**. L'un finit, l'autre dure.

```
✅ Streaming SSR : une page HTML, envoyée en chunks, qui se close (chargement progressif).
   SSE : flux temps réel serveur→client, ouvert, reconnexion auto (notifications, feed live).
```

**Règle :** streaming SSR = *afficher une page plus tôt* ; SSE = *rester connecté pour des updates*. Ce ne sont pas les mêmes besoins.

### PIÈGE #5 — Oublier qu'on ne peut plus changer le statut après le premier octet

```js
❌ res.write(shell);                 // 200 déjà envoyé avec les en-têtes
   const data = await fetchLent();
   if (!data) res.writeHead(404);    // trop tard : en-têtes déjà partis -> erreur / ignoré
```

Dès que le shell est streamé, le **code statut et les en-têtes sont partis**. Impossible de basculer en 404 ensuite (fait confirmé par la doc Next : une réponse streamée renvoie `200`, le statut ne change plus). Un `res.writeHead()` après un `write()` lève une erreur en Node.

```js
✅ const data = await fetchCritique();       // vérifie AVANT de streamer
   if (!data) { res.writeHead(404); return res.end('Introuvable'); }
   res.write(shell);                          // le statut est acté, on peut streamer
```

**Règle :** tout ce qui décide du **statut** (404, redirection, auth) doit être résolu **avant** le premier `write()`. Après, on ne fait plus qu'ajouter du corps.

---

## 5. Ancrage TribuZen

La page publique d'une sortie TribuZen (déjà SSR au module 10) devient **streamée** dès qu'un fragment dépend d'un fetch lent.

| Élément de la page sortie | Vitesse | Traitement streaming |
|---|---|---|
| Shell : `<head>`, titre, date, lieu, layout | ~5 ms | envoyé dans le **premier octet** (chunk 1) |
| Liste des participants (`fetchParticipants`) | ~900 ms | streamée en **chunk suivant** dès résolution |
| Carte / météo du lieu (API tierce lente) | variable | frontière `<Suspense>` séparée si migration Next |
| Bandeau « Bonjour Alice » (perso) | — | **hors HTML streamé** : fragment client `private` (module 10) |

Décisions d'architecture :

- **Le shell ne dépend d'aucun fetch lent.** Titre/date/lieu viennent d'un fetch rapide (ou du cache module 10) → premier octet quasi immédiat, TTFB découplé du fragment participants.
- **Le fragment lent est streamé, pas attendu.** `fetchParticipants()` ne bloque plus le premier octet : la liste arrive derrière, la page se remplit progressivement.
- **Cette réponse streamée n'est pas cachée en partagé** (`no-store`, §2.9). Le cache de rendu du module 10 reste pertinent pour la **variante bufferisée** de la page ; on choisit page par page entre « cacher le HTML fini » et « streamer sans cache ».
- **Si le front public migre vers Next.js 15+ :** la liste des participants passe dans un `<Suspense fallback={<ParticipantsSkeleton/>}>`, et un `loading.tsx` fournit l'état de chargement instantané du segment. Le `404` d'un slug inconnu est décidé **avant** le stream (piège #5).

Fichiers cibles dans `smaurier/tribuzen` :
```
tribuzen/
  ssr/src/routes/sortie-stream.ts     # streaming SSR : shell puis participants (Exemple 1)
  ssr/src/render/shell.ts             # assemblage du shell (envoyé en chunk 1)
  ssr/src/api/participants.ts         # ReadableStream NDJSON (Exemple 2)
  infra/cdn.rules                     # /sorties/*/stream en pass-through (no buffering)
```

---

## 6. Points clés

1. Le corps HTTP peut être envoyé **au fil de l'eau** : le serveur écrit les en-têtes, puis alimente le corps progressivement, et le navigateur peint dès les premiers octets.
2. **`Transfer-Encoding: chunked`** découpe le corps en chunks préfixés de leur taille hexadécimale, terminés par un chunk de taille 0 ; `Content-Length` doit alors être **omis** (exclusifs).
3. **HTTP/2 interdit `chunked`** : le streaming y est natif via les **DATA frames** ; ton code applicatif ne change pas, seule la couche transport diffère.
4. La **Streams API** (`ReadableStream`, `controller.enqueue/close/error`) produit un flux ; on le consomme via `response.body.getReader()` + `reader.read()` → `{ done, value }` (chunks en `Uint8Array`, `TextEncoder`/`TextDecoder`).
5. Le **streaming SSR** envoie le **shell d'abord** (TTFB effondré) puis chaque section dès qu'elle est prête (**rendu progressif**) — le temps total est inchangé, on cesse de tenir le shell en otage.
6. **React Suspense / `loading.js`** (survol) sont des **frontières de streaming** : le `fallback` part dans le shell, le vrai contenu suit ; **SSE** (survol) est un flux temps réel **serveur→client** ouvert (`text/event-stream`, `EventSource`), à ne pas confondre avec le streaming d'une page qui se termine.
7. Une réponse streamée **personnalisée ou temps réel** ne se cache pas en partagé (`no-store`) ; un intermédiaire qui **bufferise** annule le streaming (`X-Accel-Buffering: no`, CDN pass-through).
8. Après le premier octet, **statut et en-têtes sont partis** : toute décision de statut (404, redirection) doit précéder le premier `write()`.

---

## 7. Seeds Anki

```
Pourquoi Transfer-Encoding: chunked interdit-il Content-Length ?|Ils sont mutuellement exclusifs. En chunked, le client déduit la fin de la réponse du chunk de taille 0, pas d'un compteur d'octets. Poser les deux est contradictoire (MDN).
Quel est le format wire d'un chunk en Transfer-Encoding: chunked ?|Taille du chunk en hexadécimal + \r\n, puis les données + \r\n. La réponse se termine par un chunk de taille 0 (0\r\n\r\n).
Le Transfer-Encoding: chunked existe-t-il en HTTP/2 ?|Non. HTTP/2 interdit tout Transfer-Encoding (protocol error probable). Le corps y est déjà une suite de DATA frames ; le streaming est natif, la fin est signalée par END_STREAM.
Comment produire un flux avec la Streams API côté serveur ?|new ReadableStream({ start(controller){ controller.enqueue(uint8array); controller.close(); } }). enqueue pousse un chunk, close termine, error met en erreur. Les chunks sont des Uint8Array (TextEncoder pour convertir une string).
Comment consommer un flux fetch au fil de l'eau ?|response.body est un ReadableStream. On fait reader = response.body.getReader() puis en boucle const {done, value} = await reader.read() : value est un Uint8Array, done passe à true à la fin. TextDecoder pour retrouver le texte.
Qu'est-ce que le streaming SSR change au TTFB par rapport au SSR bufferisé ?|Le SSR bufferisé attend tout le HTML (fetch le plus lent inclus) avant le 1er octet. Le streaming SSR envoie le shell immédiatement (TTFB effondré) puis chaque section en chunk dès qu'elle est prête. Le temps total est identique, mais l'affichage est progressif.
À quoi sert un <Suspense> ou loading.js en streaming SSR (Next) ?|C'est une frontière de streaming : le fallback (squelette) part dans le shell immédiatement, le composant réel est streamé dès que son await se résout et remplace le fallback. loading.js enveloppe automatiquement page.js dans un <Suspense>.
Streaming SSR vs Server-Sent Events : quelle différence ?|Streaming SSR = UNE réponse HTML envoyée en chunks qui se termine (chargement progressif d'une page). SSE = un canal ouvert en permanence (text/event-stream, EventSource, reconnexion auto) qui pousse des mises à jour continues serveur→client. L'un finit, l'autre dure.
Pourquoi ne peut-on plus renvoyer un 404 après avoir commencé à streamer ?|Dès le premier write(), le code statut et les en-têtes sont déjà envoyés au client. On ne peut plus les changer. Toute décision de statut (404, redirection) doit être prise AVANT le premier octet du corps.
```

---

## Pont vers le lab

> Lab associé : `11-http-caching/labs/lab-13-http-streaming/README.md`. Construire un serveur Node natif qui streame la page de sortie TribuZen (shell d'abord, participants derrière) via `Transfer-Encoding: chunked`, observer les chunks arriver en temps réel avec `curl --no-buffer`, puis exposer une route `ReadableStream` NDJSON lue au fil de l'eau côté fetch — mesures TTFB et DevTools Network à l'appui.
