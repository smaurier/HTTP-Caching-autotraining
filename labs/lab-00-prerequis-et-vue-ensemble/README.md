# Lab 00 — Prérequis et vue d'ensemble : observer le cache HTTP

> **Outcome :** à la fin, tu sais lire les en-têtes de cache d'une vraie réponse HTTP avec `curl -I`, distinguer un cache hit / un miss / une revalidation `304` dans DevTools > Network, et déclencher toi-même un `304 Not Modified` avec `If-None-Match` sur un mini-serveur que tu lances.
> **Vrai outil :** `curl` (déjà présent sur Windows/macOS/Linux) + Chrome DevTools onglet Network + un serveur Node minimal (module `http` natif, zéro `npm install`).
> **Feedback :** le coach valide en session tes observations et ton interprétation des en-têtes — pas de test-runner auto-correcteur.

---

## Énoncé

Tu es dans la peau de la personne qui va optimiser TribuZen. Avant de toucher au moindre en-tête, tu dois **savoir observer** ce que le cache fait déjà. Ce lab n'écrit aucune stratégie de cache : il te fait lire la réalité brute avec les deux outils du cours.

Le lab a trois parties, en friction croissante :

- **Partie A — lire des en-têtes réels avec `curl`** sur des ressources publiques, et les classer (cacheable ? privé/partagé ? durée ?).
- **Partie B — voir hit / miss / `304` dans DevTools** sur une vraie navigation.
- **Partie C — provoquer un `304`** toi-même, avec un mini-serveur Node que tu lances et que tu interroges via `curl -H 'If-None-Match: ...'`.

Aucun gap-fill : tu tapes les commandes, tu lis les sorties, tu écris ton interprétation.

### Pré-requis machine

```bash
curl --version     # doit répondre (toute version récente convient)
node --version     # >= 18 pour la partie C
```

Si `curl` n'est pas trouvé sur Windows, utilise `curl.exe` (livré avec Windows 10/11) plutôt que l'alias PowerShell `curl` qui pointe vers `Invoke-WebRequest`.

---

## Étapes (en friction)

### Partie A — lire des en-têtes réels

1. **Inspecte les en-têtes de réponse** d'une ressource statique servie par un CDN :

   ```bash
   curl -I https://developer.mozilla.org/favicon.ico
   ```

   Repère dans la sortie : `cache-control`, `age`, `etag` (ou `last-modified`). Note la valeur de `max-age`.

2. **Réponds par écrit, avant de lire le corrigé :**
   - Cette ressource est-elle stockable en cache ? Pendant combien de temps reste-t-elle *fresh* ?
   - Le `Cache-Control` la range-t-il en cache *privé* ou *partagé* ?
   - Y a-t-il un validateur (`etag`/`last-modified`) pour une revalidation future ?

3. **Mesure le trajet réseau** d'une même requête, pour ancrer les ordres de grandeur du §2.3 du module :

   ```bash
   curl -w "DNS:%{time_namelookup}s TLS:%{time_appconnect}s Total:%{time_total}s\n" -o NUL -s https://developer.mozilla.org/favicon.ico
   ```

   > Sur Windows PowerShell, remplace `-o NUL` par `-o $null` **non** — `curl.exe` attend un vrai chemin : garde `-o NUL` (le null device Windows). Sur macOS/Linux, utilise `-o /dev/null`.

### Partie B — hit / miss / 304 dans DevTools

4. Ouvre Chrome, `F12` → onglet **Network**, coche **Preserve log**, décoche **Disable cache**.
5. Charge une page riche en assets (par ex. `https://developer.mozilla.org`). Regarde la colonne **Size** : certaines lignes affichent `(memory cache)` ou `(disk cache)`, d'autres une taille en octets.
6. **Recharge** la page (`F5`, pas `Ctrl+F5`). Observe combien de ressources passent en `304` ou en `(disk cache)`. Classe **trois** ressources dans le tableau : miss / hit / revalidée.
7. Coche **Disable cache**, recharge : tout repart en `200` avec taille en octets. Tu viens de forcer un état « tout froid ».

### Partie C — provoquer un 304 toi-même

8. Crée le fichier `server.js` (corrigé fourni plus bas), lance-le : `node server.js`.
9. **Premier appel** — tu dois recevoir un `200` avec un `ETag` :

   ```bash
   curl -I http://localhost:3000/api/families
   ```

10. **Revalidation** — recopie la valeur d'`ETag` reçue et renvoie-la dans `If-None-Match`. Tu dois obtenir un `304 Not Modified` :

    ```bash
    curl -I -H 'If-None-Match: "v3-families"' http://localhost:3000/api/families
    ```

11. **Écris ton interprétation :** pourquoi le `304` est-il « moins cher » qu'un `200` ici ? Quel gain à l'échelle du pic du soir de TribuZen ?

---

## Corrigé complet commenté

### Partie A — lecture des en-têtes

Sortie typique (les valeurs exactes changent selon le CDN et la date) :

```http
HTTP/2 200
content-type: image/vnd.microsoft.icon
cache-control: public, max-age=604800
age: 132904
etag: "abc123def456"
```

Interprétation ligne par ligne :

- `cache-control: public, max-age=604800` → **stockable**, *fresh* pendant `604800 s` = **7 jours**. `public` = autorisée dans un cache **partagé** (CDN, proxy), pas seulement le navigateur.
- `age: 132904` → la copie servie a déjà `132904 s` (~1,5 jour) de vie côté CDN. Elle est encore *fresh* car `age < max-age`. Le jour où `age > max-age`, elle devient *stale* et sera revalidée.
- `etag: "..."` → un **validateur** est présent : à l'expiration, le client pourra envoyer `If-None-Match` et espérer un `304` plutôt qu'un re-téléchargement complet.

> Vérifié sur MDN : « If the age of the response is less than one week, the response is fresh. If the age of the response is more than one week, the response is stale. » (max-age) et « A private cache is a cache tied to a specific client […] can store a personalized response. The shared cache […] can store responses that can be shared among users. » (private/public).

Mesure du trajet — exemple de sortie :

```
DNS:0.012s TLS:0.078s Total:0.121s
```

Ces ~120 ms sont **exactement** ce qu'un cache hit fait disparaître (le §2.3 du module donne ~1 ms pour un hit RAM). D'où la règle : « ne pas faire la requête » bat toute optimisation de code.

### Partie B — le tableau de classement

| Ressource observée | Colonne Size | Status | Verdict |
|---|---|---|---|
| document HTML principal | 24,1 kB | `200` | **miss** — téléchargé depuis l'origine |
| `main.css` | `(disk cache)` | `200` | **hit frais** — servi localement, 0 réseau |
| `logo.svg` | 210 B | `304` | **revalidé** — petit aller-retour, corps réutilisé |

Rappel de discrimination (piège #2 du module) :
- `200` + taille en octets = téléchargé (miss).
- `200` + `(from disk/memory cache)` = hit, aucun réseau.
- `304 Not Modified` = revalidation réussie, la copie locale est réutilisée (ce **n'est pas** un hit direct).

### Partie C — le mini-serveur qui répond 304

`server.js` — serveur Node natif, aucune dépendance :

```js
// server.js — mini-serveur d'observation du cache. Node >= 18, aucune install.
// Il sert GET /api/families avec un ETag fixe et gère la revalidation conditionnelle.
const http = require('node:http')

// Un corps de réponse stable + son empreinte (ETag). En vrai, l'ETag serait
// dérivé du contenu (hash) ; ici on le fige pour rendre le 304 reproductible.
const body = JSON.stringify([
  { id: 1, name: 'Martin' },
  { id: 2, name: 'Nguyen' },
])
const etag = '"v3-families"' // les guillemets font partie de la syntaxe ETag

const server = http.createServer((req, res) => {
  if (req.method !== 'GET' || req.url !== '/api/families') {
    res.writeHead(404).end()
    return
  }

  // Coeur de la revalidation conditionnelle :
  // si le client renvoie l'ETag qu'il possède déjà et qu'il correspond,
  // on répond 304 SANS le corps -> quelques octets au lieu des 18 kB.
  if (req.headers['if-none-match'] === etag) {
    // 304 : pas de Content-Length, pas de corps. La copie locale est réutilisée.
    res.writeHead(304, {
      ETag: etag,
      'Cache-Control': 'max-age=60',
    })
    res.end()
    return
  }

  // Sinon : réponse complète 200, avec l'ETag et une fenêtre de fraîcheur de 60 s.
  res.writeHead(200, {
    'Content-Type': 'application/json',
    ETag: etag,
    'Cache-Control': 'max-age=60',
  })
  res.end(body)
})

server.listen(3000, () => console.log('http://localhost:3000/api/families'))
```

Séquence attendue :

```http
# 1) Premier appel : curl -I http://localhost:3000/api/families
HTTP/1.1 200 OK
Content-Type: application/json
ETag: "v3-families"
Cache-Control: max-age=60

# 2) Revalidation : curl -I -H 'If-None-Match: "v3-families"' ...
HTTP/1.1 304 Not Modified
ETag: "v3-families"
Cache-Control: max-age=60
```

**Pourquoi ce corrigé est correct :**
- Le `200` transporte **le corps + l'ETag** : c'est le coût plein (ici ~18 octets, en vrai 18 kB pour la liste des familles).
- Le `304` ne transporte **aucun corps** : le serveur confirme juste « ta copie `"v3-families"` est toujours bonne ». On économise la bande passante ET la sérialisation côté serveur.
- À l'échelle du pic du soir de TribuZen : si des centaines de navigateurs détiennent déjà `"v3-families"`, ils reçoivent tous un `304` minuscule au lieu de re-télécharger la liste — et si un cache partagé (CDN) est devant, l'origine ne voit même pas ces requêtes. C'est le mécanisme visé par tout le cours.

> Vérifié sur MDN (304) : « The server will return 304 Not Modified if the value of the ETag header it determines for the requested resource is the same as the If-None-Match value in the request. »

---

## Variante J+30 (fading)

**Même objectif, sans relire ce corrigé ni le module, en 20 minutes :**

1. Reprends `server.js` et **remplace l'ETag fixe par un ETag dérivé du contenu** : calcule-le avec `require('node:crypto').createHash('sha1').update(body).digest('hex')`, entouré de guillemets. Le `304` doit toujours fonctionner quand le client renvoie le bon hash.
2. Ajoute un **second endpoint** `GET /api/me` qui renvoie `Cache-Control: private, max-age=0` (contenu personnalisé) — et explique par écrit pourquoi il ne doit **jamais** finir dans un cache partagé.
3. Prouve le comportement avec `curl -I` sur les deux endpoints et compare les en-têtes.

**Critère de réussite :** tu déclenches un `304` sur `/api/families` avec l'ETag calculé, et tu articules la différence privé/partagé sur `/api/me` sans regarder tes notes.

---

## Application TribuZen

Dans le repo `smaurier/tribuzen`, ce lab est le point de départ de l'audit de cache. Aucun code produit n'est modifié ici : tu produis un **document d'observation** qui servira de base aux modules suivants.

```
tribuzen/
  docs/
    perf/
      cache-audit-00-baseline.md   <- ton relevé initial
```

**Ce que tu y consignes :**
- Le relevé `curl -I` des endpoints réels de l'API TribuZen (`/api/families`, `/api/me`, assets CDN) : leur `Cache-Control` actuel, présence ou non d'un `ETag`.
- La classification DevTools (hit / miss / 304) de la page admin au chargement — la baseline avant optimisation.
- L'endpoint témoin du cours, à suivre jusqu'à la fin :

```
GET /api/families  -> baseline observée : 200, ~870 ms, aucun Cache-Control
                   -> objectif fin de cours : ~30 ms (CDN), 304 en revalidation
```

**Commit cible :**
```
docs(perf): audit cache baseline — relevé curl + DevTools des endpoints TribuZen
```
