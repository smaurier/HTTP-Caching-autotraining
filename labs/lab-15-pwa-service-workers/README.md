# Lab 15 — PWA : Service Worker et cache offline

> **Outcome :** à la fin, tu sais enregistrer un vrai Service Worker, l'observer dans DevTools, implémenter les 3 stratégies de cache (cache-first / network-first / stale-while-revalidate) et une page de repli offline, puis valider le tout en mode **Offline**.
> **Vrai outil :** un mini-serveur statique (`npx serve` ou `python -m http.server`) + Chrome DevTools > **Application** (Service Workers, Cache Storage) et **Network** (case **Offline**). Aucun harnais de test — tu observes le comportement réel dans le navigateur.
> **Feedback :** le coach valide en session, DevTools ouvert (pas de test-runner auto-correcteur).

---

## Énoncé

Tu construis la couche offline d'une mini-TribuZen. L'objectif : après un premier chargement en ligne, l'app doit **fonctionner hors ligne** — shell affiché, dernières données servies, page de repli propre si rien n'est disponible.

Tu pars de 4 fichiers statiques. Le seul fichier à écrire vraiment, c'est `sw.js`.

### Contrainte de servir en HTTP local

Un Service Worker ne s'enregistre qu'en **HTTPS** ou sur **`localhost`**. Ouvrir les fichiers en `file://` ne marchera pas. Sers le dossier :

```bash
# au choix, depuis le dossier du lab
npx serve .            # -> http://localhost:3000
# ou
python -m http.server  # -> http://localhost:8000
```

### Starter (à créer dans le dossier du lab)

`index.html` :

```html
<!doctype html>
<html lang="fr">
  <head>
    <meta charset="utf-8" />
    <title>TribuZen — mini offline</title>
    <link rel="manifest" href="/manifest.webmanifest" />
    <link rel="stylesheet" href="/app.css" />
  </head>
  <body>
    <h1>Dashboard famille</h1>
    <ul id="tasks"></ul>
    <script src="/app.js"></script>
  </body>
</html>
```

`app.css` :

```css
body { font-family: system-ui, sans-serif; margin: 2rem; background: #F8F5F0; color: #333; }
h1 { color: #6B7E6B; }
```

`app.js` — enregistre le SW et charge les tâches depuis une "API" (un fichier JSON local qui simule `/api/family/today`) :

```js
// Enregistrement du Service Worker après le chargement de la page
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/sw.js')
      .then((reg) => console.log('SW enregistré, scope:', reg.scope))
      .catch((err) => console.error('Échec SW:', err));
  });
}

// Charge les tâches du jour (network-first côté SW)
fetch('/api/family/today')
  .then((res) => res.json())
  .then((data) => {
    document.getElementById('tasks').innerHTML = data.tasks
      .map((t) => `<li>${t}</li>`)
      .join('');
  })
  .catch(() => {
    document.getElementById('tasks').innerHTML = '<li>(hors ligne, pas de données)</li>';
  });
```

`api/family/today` — crée un fichier `api/family/today` (sans extension) contenant du JSON, pour que `fetch('/api/family/today')` réponde :

```json
{ "tasks": ["Préparer le repas", "Devoirs de Léa", "Rappel dentiste"] }
```

`offline.html` :

```html
<!doctype html>
<html lang="fr">
  <head><meta charset="utf-8" /><title>Hors ligne</title></head>
  <body style="font-family: system-ui; margin: 2rem; background: #F8F5F0;">
    <h1 style="color:#6B7E6B;">Pas de connexion</h1>
    <p>Tes données se resynchroniseront automatiquement au retour du réseau.</p>
  </body>
</html>
```

`manifest.webmanifest` :

```json
{
  "name": "TribuZen",
  "short_name": "TribuZen",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#F8F5F0",
  "theme_color": "#6B7E6B",
  "icons": [
    { "src": "/icons/icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "/icons/icon-512.png", "sizes": "512x512", "type": "image/png", "purpose": "any maskable" }
  ]
}
```

**À toi d'écrire `sw.js`** pour que :
1. Le **shell** (`/`, `/index.html`, `/app.css`, `/app.js`, `/offline.html`) soit précaché à l'`install`.
2. Les **navigations** (documents HTML) tombent sur `/offline.html` quand le réseau échoue.
3. L'**API** `/api/family/today` soit en **network-first** (fraîche en ligne, dernière version connue offline).
4. Les autres assets soient en **cache-first**.
5. Les **anciens caches** soient purgés à l'`activate` (versionnage du nom).

> Ne mets **pas** d'icônes réelles dans le manifest si tu n'en as pas : l'app restera fonctionnelle offline, seul l'audit "installable" de Lighthouse s'en plaindra. Le cœur du lab est le SW.

---

## Étapes (en friction)

1. **Sers le dossier** en `localhost`, ouvre l'app, vérifie dans DevTools > Application > **Service Workers** que le SW est `activated and running`.
2. **Écris l'`install`** — `caches.open(nom versionné)` + `cache.addAll(shell)`, dans un `event.waitUntil`. Ajoute `self.skipWaiting()`.
3. **Écris l'`activate`** — `caches.keys()`, filtre les caches qui ne sont pas la version courante, `caches.delete()` sur chacun. Ajoute `self.clients.claim()`.
4. **Écris le `fetch`** — branche 1 : navigation (`request.mode === 'navigate'`) réseau puis repli `/offline.html`. Branche 2 : `/api/` network-first avec mise en cache. Branche 3 (défaut) : cache-first.
5. **Observe** dans DevTools > Application > **Cache Storage** : tes caches et leur contenu doivent apparaître.
6. **Bascule Offline** (Network > case Offline **ou** Application > Service Workers > Offline), recharge : le shell s'affiche, l'API sert la dernière version, une URL inconnue tombe sur `/offline.html`.
7. **Vérifie la purge** : change le numéro de version dans `sw.js` (`v1` → `v2`), recharge deux fois, confirme dans Cache Storage que l'ancien cache `...-v1` a disparu.
8. **Cas limite** : vide la Cache API (Application > Clear storage) **et** Unregister le SW, recharge — tu repars propre. Note qu'un simple `Cache-Control` ne l'aurait pas vidé.

---

## Corrigé complet commenté

```js
// sw.js — corrigé
// Change VERSION à chaque déploiement : déclenche la purge des anciens caches.
const VERSION = 'v1';
const SHELL_CACHE = `tz-shell-${VERSION}`;
const DATA_CACHE = `tz-data-${VERSION}`;

// Tout ce qui doit exister offline dès la première visite.
// addAll est ATOMIQUE : une seule URL en 404 fait échouer tout l'install.
const SHELL = ['/', '/index.html', '/app.css', '/app.js', '/offline.html'];

// ── INSTALL : précacher le shell ──────────────────────────────────────
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE).then((cache) => cache.addAll(SHELL))
  );
  // Active la nouvelle version sans attendre la fermeture des onglets.
  self.skipWaiting();
});

// ── ACTIVATE : purger les caches des versions précédentes ─────────────
self.addEventListener('activate', (event) => {
  const current = [SHELL_CACHE, DATA_CACHE];
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        // tout cache dont le nom n'est pas dans la version courante -> supprimé
        keys.filter((k) => !current.includes(k)).map((k) => caches.delete(k))
      )
    )
  );
  // Prend le contrôle des pages déjà ouvertes, sans rechargement manuel.
  self.clients.claim();
});

// ── FETCH : stratégie choisie selon la requête ────────────────────────
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // 1) Navigation (page HTML) : réseau d'abord, page de repli si offline.
  //    request.mode === 'navigate' isole les requêtes de document.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(() => caches.match('/offline.html'))
    );
    return;
  }

  // 2) API : network-first. On tente le réseau (données fraîches) et on
  //    met à jour le cache au passage ; offline, on sert la dernière copie.
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(
      fetch(request)
        .then((res) => {
          // clone() : le body ne se lit qu'une fois -> une copie pour le cache.
          const copy = res.clone();
          caches.open(DATA_CACHE).then((cache) => cache.put(request, copy));
          return res;
        })
        .catch(() => caches.match(request)) // offline -> dernière réponse connue
    );
    return;
  }

  // 3) Défaut (assets) : cache-first. Instantané ; réseau seulement si absent.
  event.respondWith(
    caches.match(request).then((cached) => cached || fetch(request))
  );
});
```

**Pourquoi ce corrigé est correct :**
- `waitUntil` garantit que le shell est complètement précaché avant que l'`install` soit considéré fini — pas de SW « à moitié installé ».
- `activate` purge par différence de nom : passer `VERSION` de `v1` à `v2` renomme les caches, les anciens tombent dans le filtre et sont supprimés. Zéro cache orphelin.
- La branche navigation utilise `request.mode === 'navigate'` (et non l'extension `.html`) : c'est le signal fiable d'une requête de document.
- La branche API met à jour le cache **à chaque** succès réseau (`cache.put` avec `clone`), donc la copie offline est toujours la plus récente vue en ligne.
- Le `clone()` évite l'erreur « body already used » : le flux de la réponse est consommé une fois pour le cache, une fois pour la page.

**Vérification attendue (DevTools) :**
- Application > Service Workers : statut `activated and running`.
- Application > Cache Storage : `tz-shell-v1` (shell) et `tz-data-v1` (après un chargement de `/api/family/today`).
- Network en **Offline** + reload : `index.html`, `app.css`, `app.js` en `(ServiceWorker)` ; les tâches s'affichent depuis le cache de données ; naviguer vers une URL jamais visitée affiche `/offline.html`.

---

## Variante J+30 (fading)

**Même objectif, contraintes ajoutées, sans rouvrir ce corrigé ni le module 15 :**

1. Réécris `sw.js` **de mémoire, en 30 minutes**.
2. Ajoute une **4e branche** pour `/avatars/` en **stale-while-revalidate** : sert le cache immédiatement s'il existe, lance en parallèle un `fetch` qui met à jour le cache pour la prochaine fois (`cache.put(request, res.clone())`).
3. Ajoute une **expiration maison** sur le cache de données : à l'`activate`, si le cache `tz-data` contient plus de N entrées, supprime les plus anciennes (via `cache.keys()` + `cache.delete(request)`).

**Critère de réussite :** en Offline, le dashboard s'affiche avec la dernière donnée connue, un avatar déjà vu apparaît instantanément, et la navigation vers l'inconnu tombe sur `/offline.html`. Tu sais expliquer, DevTools à l'appui, pourquoi chaque requête a été servie par le cache, le réseau, ou le repli.

---

## Application TribuZen

Dans le repo `smaurier/tribuzen`, cette couche vit ici :

```
tribuzen/
  public/
    sw.js                    # install/activate/fetch — stratégies par requête
    offline.html             # page de repli hors ligne (ton anti-dinosaure)
    manifest.webmanifest     # installabilité (icons 192/512, display standalone)
  src/
    main.ts                  # navigator.serviceWorker.register('/sw.js') après load
  server/headers.ts          # sw.js servi en Cache-Control: no-cache (détection des maj)
```

**Différences par rapport au lab :**
- En prod, TribuZen utilisera **Workbox** (`registerRoute` + stratégies) au lieu des handlers manuels — mais ce lab en vanilla est ce qui te permet de débugger ce que Workbox génère.
- L'API sera une vraie route réseau (`/api/family/today`), pas un fichier statique.
- Les **écritures offline** (compléter une routine hors ligne) via Background Sync et les **notifications push** de rappel s'ajouteront au **module 16** — ce lab couvre la lecture offline et l'installabilité.

**Commit cible :**
```
feat(pwa): service worker offline — précache shell, network-first API, repli offline
```
