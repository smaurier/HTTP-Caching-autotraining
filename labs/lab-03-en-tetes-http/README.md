# Lab 03 — Les en-têtes HTTP

> **Outcome :** à la fin, tu sais catégoriser les en-têtes d'une vraie réponse HTTP, manipuler les en-têtes de représentation/négociation d'un serveur Node, et **démontrer l'effet de `Vary` sur le cache** (bug puis correctif).
> **Vrai outil :** Node.js (`node:http` + `node:zlib`), `curl` pour inspecter les en-têtes, un mini-cache maison pour observer la clé de cache. Aucun harnais simulé.
> **Feedback :** le coach valide en session à partir de tes sorties `curl` — pas de test-runner auto-correcteur.

---

## Énoncé

Tu reproduis, en local, le bug du cas concret TribuZen (CDN qui sert la mauvaise version), puis tu le corriges avec `Vary`.

Le lab a **deux parties** :

- **Partie A — Catégoriser** : à partir d'une réponse réelle, ranger chaque en-tête dans sa catégorie et repérer les incohérences liées au cache.
- **Partie B — Manipuler + observer `Vary`** : écrire un serveur qui négocie langue + compression, le placer derrière un **mini-cache** maison, montrer la corruption **sans** `Vary`, puis prouver la correction **avec** `Vary`.

### Starter minimal

Crée un dossier `lab-03/`. Tu écris **toi-même** les deux fichiers ci-dessous (pas de gap-fill) :

```
lab-03/
  origin.ts    ← le serveur d'origine qui négocie (à écrire)
  cache.ts     ← un mini-cache/proxy devant l'origine (à écrire)
```

Lancer : `npx tsx origin.ts` dans un terminal, `npx tsx cache.ts` dans un second. Interroger **le cache** (port 4000), pas l'origine (port 3000), avec `curl -D -` pour voir les en-têtes.

---

## Étapes (en friction)

1. **Partie A — capture réelle.** Récupère les en-têtes d'une vraie API publique et catégorise-les à la main :
   ```bash
   curl -s -D - -o /dev/null https://api.github.com/repos/nodejs/node \
     -H "Accept-Encoding: gzip"
   ```
   Pour **chaque** en-tête de la réponse, écris sa catégorie (représentation / négociation / cache / CORS / sécurité / conditionnel-Range / cookie). Repère : y a-t-il un `Vary` ? un `Content-Encoding` ? sont-ils cohérents ?

2. **Écris `origin.ts`** — serveur sur le port 3000 qui, sur `GET /members` :
   - négocie la langue via `Accept-Language` (`fr` sinon `en`) ;
   - négocie la compression via `Accept-Encoding` (`br`, sinon `gzip`, sinon rien) ;
   - renvoie `Content-Type`, `Content-Language`, `Content-Length` (en **octets**), `Content-Encoding` si compressé ;
   - **commence SANS poser `Vary`** (on veut voir le bug).

3. **Écris `cache.ts`** — mini-cache sur le port 4000 qui proxifie vers l'origine :
   - **clé de cache initiale = URL seule** (le bug), avec un `Map` en mémoire ;
   - au hit, renvoie la réponse stockée + un en-tête `x-cache: HIT` ; au miss, appelle l'origine, stocke, renvoie `x-cache: MISS`.

4. **Reproduis la corruption.** Vide le cache (redémarre `cache.ts`), puis :
   ```bash
   # 1er client : fr + brotli → remplit le cache
   curl -s -D - -o /dev/null http://localhost:4000/members -H "Accept-Language: fr" -H "Accept-Encoding: br"
   # 2e client : en + gzip → devrait recevoir en/gzip...
   curl -s -D - -o /dev/null http://localhost:4000/members -H "Accept-Language: en" -H "Accept-Encoding: gzip"
   ```
   Constate : le 2e appel renvoie `x-cache: HIT` avec `content-encoding: br` et `content-language: fr`. **Version corrompue.**

5. **Corrige côté origine + côté cache.**
   - Dans `origin.ts`, ajoute `Vary: Accept-Encoding, Accept-Language`.
   - Dans `cache.ts`, construis la clé de cache en tenant compte de `Vary` : clé = URL + valeurs des en-têtes listés dans le `Vary` de la réponse.
   - Rejoue l'étape 4 : le 2e client doit obtenir `content-encoding: gzip`, `content-language: en` (un `MISS` distinct, puis des `HIT` par combinaison).

6. **Explore une variante de `Vary`.** Remplace le `Vary` par `Vary: *` puis par `Vary: User-Agent` et observe le comportement du cache (jamais de HIT partageable / explosion des clés). Note ce que ça implique pour un CDN.

---

## Corrigé complet commenté

### Partie A — catégorisation type (réponse GitHub)

```
HTTP/2 200
content-type: application/json; charset=utf-8   # représentation (format + charset)
content-encoding: gzip                          # représentation (compression)
content-length: 1234                            # représentation (octets, ici compressés)
vary: Accept, Accept-Encoding, ...              # NÉGOCIATION → clé de cache (présent = bien)
cache-control: public, max-age=60               # cache (module 04)
etag: W/"abc..."                                # cache (revalidation, module 05)
access-control-allow-origin: *                  # CORS
access-control-expose-headers: ETag, ...        # CORS (en-têtes lisibles par le JS)
strict-transport-security: max-age=31536000     # sécurité (HSTS)
x-content-type-options: nosniff                 # sécurité (anti MIME sniffing)
x-frame-options: deny                           # sécurité (anti-clickjacking)
referrer-policy: origin-when-cross-origin       # sécurité (fuite via Referer)
```

Points à relever : `content-encoding: gzip` **est** couvert par le `vary: Accept-Encoding` → cohérent, pas de corruption possible sur un cache partagé. `access-control-allow-origin: *` (origine fixe) → pas besoin de `Vary: Origin`.

### Partie B — `origin.ts` (version corrigée, avec `Vary`)

```typescript
// origin.ts — serveur d'origine : négocie langue + compression, déclare Vary
import http from 'node:http';
import zlib from 'node:zlib';

const MEMBERS = {
  fr: JSON.stringify({ famille: 'Les Dupont', membres: ['Alice', 'Bob'] }),
  en: JSON.stringify({ family: 'The Duponts', members: ['Alice', 'Bob'] }),
};

http.createServer((req, res) => {
  if (req.url !== '/members') { res.writeHead(404).end('Not found'); return; }

  // 1. Négociation langue
  const acceptLang = String(req.headers['accept-language'] ?? 'en');
  const lang: 'fr' | 'en' = acceptLang.includes('fr') ? 'fr' : 'en';
  const json = MEMBERS[lang];

  // 2. Négociation compression (brotli préféré, gzip en secours)
  const acceptEnc = String(req.headers['accept-encoding'] ?? '');
  let body: Buffer;
  let encoding: string | null = null;
  if (acceptEnc.includes('br')) { body = zlib.brotliCompressSync(Buffer.from(json)); encoding = 'br'; }
  else if (acceptEnc.includes('gzip')) { body = zlib.gzipSync(Buffer.from(json)); encoding = 'gzip'; }
  else { body = Buffer.from(json); }

  // 3. En-têtes de représentation + Vary (clé de cache)
  const headers: Record<string, string | number> = {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Language': lang,
    'Content-Length': body.length,          // octets (Buffer.length), body compressé
    'Cache-Control': 'public, max-age=300',
    // >>> La ligne qui corrige tout : on déclare de quoi dépend la réponse.
    'Vary': 'Accept-Encoding, Accept-Language',
  };
  if (encoding) headers['Content-Encoding'] = encoding;

  res.writeHead(200, headers);
  res.end(body);
}).listen(3000, () => console.log('origin  → http://localhost:3000'));
```

### Partie B — `cache.ts` (mini-cache qui respecte `Vary`)

```typescript
// cache.ts — proxy/cache devant l'origine, clé de cache dérivée de Vary
import http from 'node:http';

const ORIGIN = { host: 'localhost', port: 3000 };
// store : clé → { status, headers, body }
const store = new Map<string, { status: number; headers: http.IncomingHttpHeaders; body: Buffer }>();

// Construit la clé de cache à partir de l'URL + des en-têtes listés dans Vary.
// Sans Vary connu, on part de l'URL seule (le bug initial).
function cacheKey(url: string, vary: string | undefined, reqHeaders: http.IncomingHttpHeaders): string {
  if (!vary || vary === '*') return url; // '*' : on gérera "non cachable" plus bas
  const parts = vary.split(',').map(h => h.trim().toLowerCase());
  const varied = parts.map(h => `${h}=${reqHeaders[h] ?? ''}`).join('|');
  return `${url}::${varied}`;
}

http.createServer((clientReq, clientRes) => {
  const url = clientReq.url ?? '/';

  // 1. Tentative de HIT : on ne connaît le Vary qu'après une 1re réponse.
  //    On indexe les Vary observés par URL pour reconstruire la clé.
  const knownVary = observedVary.get(url);
  const key = cacheKey(url, knownVary, clientReq.headers);
  if (knownVary !== '*' && store.has(key)) {
    const hit = store.get(key)!;
    clientRes.writeHead(hit.status, { ...hit.headers, 'x-cache': 'HIT' });
    clientRes.end(hit.body);
    return;
  }

  // 2. MISS : on va chercher à l'origine
  const proxyReq = http.request(
    { ...ORIGIN, path: url, method: clientReq.method, headers: clientReq.headers },
    (originRes) => {
      const chunks: Buffer[] = [];
      originRes.on('data', c => chunks.push(c));
      originRes.on('end', () => {
        const body = Buffer.concat(chunks);
        const vary = originRes.headers['vary'] as string | undefined;
        observedVary.set(url, vary ?? '');           // mémorise le Vary pour les prochains hits
        const storeKey = cacheKey(url, vary, clientReq.headers);

        // Vary: * → non cachable : on relaie sans stocker
        if (vary !== '*') {
          store.set(storeKey, { status: originRes.statusCode ?? 200, headers: originRes.headers, body });
        }
        clientRes.writeHead(originRes.statusCode ?? 200, { ...originRes.headers, 'x-cache': 'MISS' });
        clientRes.end(body);
      });
    },
  );
  clientReq.pipe(proxyReq);
}).listen(4000, () => console.log('cache   → http://localhost:4000'));

// map auxiliaire : URL → dernier Vary observé (pour reconstruire la clé au HIT)
const observedVary = new Map<string, string>();
```

**Pourquoi ce corrigé est correct :**
- **Sans `Vary`** dans `origin.ts`, `cacheKey` retombe sur l'URL seule → une seule entrée → le 2e client reçoit la version du 1er (`x-cache: HIT`, mauvaise langue/encodage). C'est le bug reproduit.
- **Avec `Vary: Accept-Encoding, Accept-Language`**, la clé devient `url::accept-encoding=...|accept-language=...` → une entrée **par combinaison** → chaque client reçoit sa version, les `HIT` ne se produisent qu'entre clients identiques.
- **`Content-Length`** vaut `body.length` (octets du `Buffer`), pas la longueur de la chaîne source — correct même avec accents ou compression.
- **`Vary: *`** est traité comme non cachable : jamais stocké, toujours relayé → aucun HIT partageable, ce qui illustre pourquoi c'est à éviter.

> Note : ce mini-cache mémorise le `Vary` après une première réponse (`observedVary`), simplification pédagogique d'un vrai CDN. Un CDN réel stocke le `Vary` avec l'entrée et réconcilie la clé au vol.

---

## Variante J+30 (fading)

**Même objectif, reproduire de mémoire en ~30 min, avec une contrainte ajoutée :**

1. Sans rouvrir ce corrigé, réécris `origin.ts` + `cache.ts`.
2. **Contrainte nouvelle :** ajoute la dimension **CORS**. L'origine reflète l'`Origin` reçu dans `Access-Control-Allow-Origin` et ajoute `Origin` à son `Vary` (donc `Vary: Accept-Encoding, Accept-Language, Origin`).
3. Démontre au `curl` que deux origines différentes (`-H "Origin: https://a.tribuzen.app"` vs `https://b.tribuzen.app`) produisent deux entrées de cache distinctes.
4. **Bonus :** ajoute `Access-Control-Max-Age: 86400` sur une réponse au préflight `OPTIONS` et explique en une phrase l'effet sur le nombre de requêtes.

**Critère de réussite :** le cache ne mélange jamais deux origines, et tu peux nommer, pour chaque en-tête de ta réponse finale, sa catégorie.

---

## Application TribuZen

Dans le repo `smaurier/tribuzen`, ces réglages vivent dans la configuration de l'API (NestJS) et du CDN :

```
tribuzen-api/src/
  main.ts                     ← compression (brotli + gzip) + CORS global
  common/
    interceptors/
      vary.interceptor.ts     ← ajoute Vary: Accept-Encoding, Accept-Language[, Origin]
    guards/
      ...
```

**Différences par rapport au lab :**
- La compression n'est pas écrite à la main : elle passe par le middleware de compression du framework (`@fastify/compress` ou équivalent), mais la **règle `Vary`** reste ta responsabilité et est exactement celle du lab.
- Le « mini-cache » du lab est remplacé en prod par le vrai CDN (Cloudflare / Fastly) — c'est lui qui lit le `Vary` pour bâtir sa clé. Le lab existe pour que tu **voies** cette mécanique que le CDN cache d'habitude.
- Les routes d'auth ajoutent `Set-Cookie` + `Cache-Control: private` (jamais mises en cache CDN) — à intégrer dans l'interceptor comme exception.

**Commit cible :**
```
feat(api): négociation contenu (brotli/gzip, fr/en) + Vary correct
fix(cdn): Vary: Accept-Encoding, Accept-Language, Origin — évite les versions croisées
```
