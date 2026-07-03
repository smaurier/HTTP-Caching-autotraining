# Lab 16 — Push API et Web Notifications

> **Outcome :** à la fin, tu sais abonner un vrai navigateur à la Push API (`Notification.requestPermission` + `pushManager.subscribe` avec clé VAPID), envoyer un push chiffré depuis un mini serveur `web-push`, le recevoir dans un service worker et l'afficher — et le déclencher aussi via DevTools > Application > Push.
> **Vrai outil :** navigateur Chrome/Edge + DevTools (Application > Service Workers / Push Messaging) + un serveur Node minimal (`web-push`, `express`). Aucun harnais de test simulé.
> **Feedback :** le coach valide en session — la notification apparaît (ou non) à l'écran, la colonne DevTools montre l'abonnement. Pas de test-runner auto-correcteur.

---

## Énoncé

Tu ajoutes les **rappels de sorties** à TribuZen. Objectif concret : cliquer un bouton « Activer les rappels », s'abonner, puis recevoir une notification **onglet fermé** déclenchée par un serveur — comme le sera le rappel « Sortie dans 1 h ».

Tu construis quatre pièces qui forment la chaîne complète :

1. Un **service worker** minimal qui écoute `push` et `notificationclick`.
2. Une **page** avec un bouton qui demande la permission et s'abonne.
3. Un **serveur Node** (`web-push`) qui génère les clés VAPID, stocke la subscription reçue, et envoie un push.
4. Une **vérification DevTools** : simuler un push sans passer par le serveur.

> ⚠️ La Push API exige un **contexte sécurisé**. `http://localhost` compte comme sécurisé (pas besoin de HTTPS en local). En déploiement réel, HTTPS obligatoire.

### Pré-requis d'environnement

```bash
mkdir lab-push && cd lab-push
npm init -y
npm install express web-push
# Génère TA paire VAPID (une fois) et garde-la :
npx web-push generate-vapid-keys
# → note Public Key et Private Key
```

### Starter minimal (à compléter — pas de gap-fill, tu écris le corps)

`server.js` :

```js
import express from 'express';
import webpush from 'web-push';

const app = express();
app.use(express.json());
app.use(express.static('public')); // sert index.html + service-worker.js

// TODO 1 : colle tes clés VAPID et appelle webpush.setVapidDetails(...)
// TODO 4 : POST /subscribe  → stocke la subscription reçue (en mémoire, un tableau suffit)
// TODO 5 : POST /send       → envoie un push à toutes les subscriptions stockées

app.listen(3000, () => console.log('http://localhost:3000'));
```

`public/service-worker.js` :

```js
// TODO 2 : addEventListener('push', ...) → showNotification via event.waitUntil
// TODO 3 : addEventListener('notificationclick', ...) → focus/openWindow
```

`public/index.html` :

```html
<!doctype html>
<button id="enable">Activer les rappels</button>
<button id="send">Envoyer un push test</button>
<script>
  const PUBLIC_VAPID_KEY = 'COLLE_TA_CLE_PUBLIQUE_ICI';
  // TODO : enregistrer le SW, brancher les deux boutons
</script>
```

---

## Étapes (en friction)

1. **Enregistre le service worker** dans `index.html` : `navigator.serviceWorker.register('/service-worker.js')`. Vérifie dans DevTools > Application > Service Workers qu'il est **activated and running**.
2. **Écris `push` + `notificationclick`** dans `service-worker.js`. `push` lit `event.data.json()` et appelle `event.waitUntil(self.registration.showNotification(...))`.
3. **Bouton « Activer »** : `Notification.requestPermission()` → si `'granted'`, `registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey })`. Convertis la clé base64url en `Uint8Array`.
4. **POST la subscription** : envoie `subscription.toJSON()` à `/subscribe`, le serveur la stocke.
5. **Bouton « Envoyer »** (ou `curl -X POST localhost:3000/send`) : le serveur appelle `webpush.sendNotification(sub, payload)` pour chaque subscription.
6. **Ferme l'onglet**, redéclenche l'envoi via `curl` → la notification doit apparaître (le SW vit sans la page).
7. **Vérif DevTools** : Application > Service Workers, champ **Push**, saisis `{"title":"Test SW","body":"direct"}`, clique **Push** → la notif s'affiche **sans passer par le serveur**. Ça isole SW+permission du serveur/VAPID.
8. **Casse volontairement** : mets une mauvaise clé publique côté front → observe l'erreur de `subscribe`. Supprime une subscription côté serveur et renvoie → observe la gestion du `410`.

---

## Corrigé complet commenté

`server.js` :

```js
import express from 'express';
import webpush from 'web-push';

const app = express();
app.use(express.json());
app.use(express.static('public'));

// TODO 1 — clés VAPID (générées via `npx web-push generate-vapid-keys`).
// La publique doit être IDENTIQUE à celle du front (index.html).
const VAPID_PUBLIC  = 'BEl62iUYgUiv...';
const VAPID_PRIVATE = 'UUxI4O8-HoGB...';
webpush.setVapidDetails('mailto:contact@tribuzen.app', VAPID_PUBLIC, VAPID_PRIVATE);

// Stockage minimal : en mémoire. En vrai → base de données par userId.
const subscriptions = [];

// TODO 4 — réception et stockage de la subscription
app.post('/subscribe', (req, res) => {
  // req.body = { endpoint, expirationTime, keys: { p256dh, auth } }
  const exists = subscriptions.find((s) => s.endpoint === req.body.endpoint);
  if (!exists) subscriptions.push(req.body);
  res.status(201).json({ ok: true });
});

// TODO 5 — envoi d'un push à tous les abonnés
app.post('/send', async (req, res) => {
  const payload = JSON.stringify({
    title: 'Sortie dans 1 h',
    body: 'Balade au parc à 10h',
    data: { url: '/sorties/42' }, // route ciblée au clic
  });

  for (const sub of [...subscriptions]) {
    try {
      // sendNotification chiffre le payload (aes128gcm) + signe le JWT VAPID + POST endpoint
      await webpush.sendNotification(sub, payload);
    } catch (err) {
      // 410 Gone / 404 → subscription morte : on la purge
      if (err.statusCode === 410 || err.statusCode === 404) {
        const i = subscriptions.findIndex((s) => s.endpoint === sub.endpoint);
        if (i !== -1) subscriptions.splice(i, 1);
      } else {
        console.error('push error', err.statusCode, err.body);
      }
    }
  }
  res.json({ sent: subscriptions.length });
});

app.listen(3000, () => console.log('http://localhost:3000'));
```

`public/service-worker.js` :

```js
// TODO 2 — réception du push
self.addEventListener('push', (event) => {
  // event.data peut être null (push sans payload) → garde-fou
  const p = event.data ? event.data.json() : {};

  // waitUntil OBLIGATOIRE : showNotification est async ; sans lui le navigateur
  // peut tuer le service worker avant l'affichage → notif perdue.
  event.waitUntil(
    self.registration.showNotification(p.title ?? 'TribuZen', {
      body: p.body,
      icon: '/icon-192.png',   // optionnel : mets une vraie image ou retire la ligne
      tag: p.tag,              // remplace une notif de même tag au lieu d'empiler
      data: p.data,            // transporté jusqu'au notificationclick
    }),
  );
});

// TODO 3 — clic sur la notification
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url ?? '/';

  event.waitUntil(
    self.clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((clients) => {
        const open = clients.find((c) => c.url.endsWith(url));
        return open ? open.focus() : self.clients.openWindow(url); // focus ou ouvre
      }),
  );
});
```

`public/index.html` :

```html
<!doctype html>
<html lang="fr">
<head><meta charset="utf-8" /><title>Lab Push TribuZen</title></head>
<body>
  <button id="enable">Activer les rappels</button>
  <button id="send">Envoyer un push test</button>

  <script>
    // DOIT être identique à VAPID_PUBLIC côté serveur
    const PUBLIC_VAPID_KEY = 'BEl62iUYgUiv...';

    // base64url → Uint8Array (compat maximale pour applicationServerKey)
    function urlBase64ToUint8Array(base64String) {
      const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
      const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
      return Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
    }

    async function main() {
      // 1. Enregistre le service worker (module 15 : cycle de vie du SW)
      await navigator.serviceWorker.register('/service-worker.js');

      // 3. Opt-in sur clic — jamais au chargement (un 'denied' est définitif)
      document.querySelector('#enable').addEventListener('click', async () => {
        const permission = await Notification.requestPermission();
        if (permission !== 'granted') {
          alert('Permission : ' + permission);
          return;
        }

        const registration = await navigator.serviceWorker.ready;

        // Réutilise une subscription existante si présente
        const existing = await registration.pushManager.getSubscription();
        const subscription = existing ?? await registration.pushManager.subscribe({
          userVisibleOnly: true, // requis par Chrome/Edge : tout push est visible
          applicationServerKey: urlBase64ToUint8Array(PUBLIC_VAPID_KEY),
        });

        // 4. Persistance serveur : toJSON() = endpoint + keys(p256dh, auth)
        await fetch('/subscribe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(subscription.toJSON()),
        });

        alert('Abonné ! Ferme l’onglet puis lance /send.');
      });

      // 5. Déclenche l'envoi côté serveur
      document.querySelector('#send').addEventListener('click', () => {
        fetch('/send', { method: 'POST' });
      });
    }

    main();
  </script>
</body>
</html>
```

**Pourquoi ce corrigé est correct :**
- **Permission sur geste, jamais au `load`** : un `'denied'` prématuré est irréversible et brûle le canal push.
- **`userVisibleOnly: true` + `applicationServerKey`** : les deux options sans lesquelles Chrome/Edge rejettent `subscribe()`.
- **`toJSON()`** fournit exactement `endpoint` + `keys.p256dh` + `keys.auth`, les trois données que le serveur stocke et réutilise.
- **`event.waitUntil()`** garde le service worker vivant le temps de l'affichage async — indispensable onglet fermé.
- **Le serveur chiffre pour toi** : `webpush.sendNotification` gère `aes128gcm` + JWT VAPID ; tu ne postes jamais de JSON en clair au push service.
- **`410`/`404` → purge** : on ne laisse pas s'accumuler des endpoints morts.
- **Le simulateur DevTools (étape 7)** prouve que SW + permission fonctionnent indépendamment du serveur — l'outil de diagnostic n°1.

---

## Variante J+30 (fading)

**Même chaîne, contraintes ajoutées, de mémoire, en 30 minutes, sans rouvrir ce corrigé ni le module 16 :**

1. Ajoute **deux boutons d'action** à la notification (`actions: [{ action: 'ok', title: 'J’y serai' }, { action: 'later', title: 'Plus tard' }]`) et gère `event.action` dans `notificationclick` (un `fetch` POST différent selon l'action, sans ouvrir de fenêtre pour `'ok'`).
2. Ajoute un bouton **« Désactiver les rappels »** : `subscription.unsubscribe()` **et** un POST `/unsubscribe` qui retire l'endpoint côté serveur.
3. Ajoute l'event **`pushsubscriptionchange`** dans le service worker : ré-abonne avec `event.oldSubscription.options` et re-poste la nouvelle subscription.

**Critère de réussite :** les boutons d'action déclenchent des appels distincts, le désabonnement vide bien les deux côtés (front + serveur), et un envoi après désabonnement ne réaffiche plus rien.

---

## Application TribuZen

Dans `smaurier/tribuzen`, cette chaîne devient les rappels de sorties :

```
tribuzen/
  src/push/enablePush.js          # requestPermission + subscribe + POST /api/push/subscribe
  public/service-worker.js        # push + notificationclick + pushsubscriptionchange
  server/push/sendReminder.js     # web-push sendNotification + purge 410/404
  server/push/subscriptions.repo  # endpoint + keys(p256dh, auth) par userId
```

**Différences avec le lab :**
- Le bouton d'opt-in n'apparaît **qu'après la création d'une sortie** (valeur perçue), pas en évidence permanente.
- Les subscriptions sont persistées en **base** liées au `userId` et à l'appareil — pas un tableau en mémoire.
- L'envoi est **planifié** (job 1 h avant la sortie), pas un bouton manuel.
- Le `tag` `outing-:id` et `data.url = /sorties/:id` routent chaque rappel vers la bonne sortie.
- Les clés VAPID vivent en variables d'environnement (`VAPID_PUBLIC` / `VAPID_PRIVATE`), jamais en dur dans le code.

**Commit cible :**
```
feat(push): rappels de sorties — subscribe VAPID + web-push + service worker push/click
```
