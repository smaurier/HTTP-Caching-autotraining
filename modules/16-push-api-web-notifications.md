---
titre: Push API et Web Notifications
cours: 11-http-caching
notions: ["Push API (serveur, push service, navigateur)", "clés VAPID", "PushManager.subscribe (userVisibleOnly, applicationServerKey)", "PushSubscription (endpoint, keys p256dh auth)", "Notification.requestPermission", "Notification.permission", "push event (event.data.json)", "showNotification (ServiceWorkerRegistration)", "notificationclick", "payload chiffré (aes128gcm)", "pushsubscriptionchange", "getSubscription et unsubscribe"]
outcomes:
  - sait décrire l'architecture Push API (serveur, push service, navigateur) et le rôle des clés VAPID
  - sait abonner un navigateur via pushManager.subscribe avec userVisibleOnly et applicationServerKey
  - sait demander la permission Notifications au bon moment et lire Notification.permission
  - sait recevoir un push dans le service worker et afficher une notification via showNotification
  - sait gérer l'expiration d'une subscription (410/404) et le ré-abonnement via pushsubscriptionchange
prerequis: [00-prerequis-et-vue-ensemble, 01-protocole-http, 02-http2-http3, 03-en-tetes-http, 04-cache-control, 05-etag-validation-conditionnelle, 06-stale-while-revalidate, 07-cache-navigateur, 08-cdn, 09-cache-multi-couches, 10-ssr, 11-isr-ssg, 12-edge-rendering, 13-http-streaming, 14-performance-web, 15-pwa-service-workers]
next: 17-projet-final
libs: []
tribuzen: notifications push de TribuZen — rappels de sorties famille, opt-in après valeur perçue, réception dans le service worker et clic qui ouvre la bonne page
last-reviewed: 2026-07
---

# Push API et Web Notifications

> **Outcomes — tu sauras FAIRE :** décrire l'architecture Push API et le rôle de VAPID, abonner un navigateur via `pushManager.subscribe`, demander la permission Notifications au bon moment, recevoir un push dans le service worker et afficher une notification, gérer l'expiration et le ré-abonnement.
> **Difficulté :** :star::star::star:
>
> **Portée :** ce module couvre **la Push API et les Web Notifications** uniquement. Le **service worker** — enregistrement, cycle de vie (`install`/`activate`), Cache API, stratégies offline — est le sujet du **module 15 (PWA / Service Workers)** et est ici un **prérequis acquis** : on s'appuie sur un SW déjà enregistré et actif, on ne réexplique pas son cycle de vie. On reste sur : demander la permission, s'abonner, recevoir un push, afficher/cliquer une notification, gérer l'expiration.

## 1. Cas concret d'abord

TribuZen organise des sorties famille (« Balade au parc dimanche 10h », « Ciné mercredi »). Le besoin produit : **rappeler** la sortie 1 h avant, même quand l'onglet TribuZen est fermé et l'appareil en veille. Un simple `setTimeout` dans la page ne marche pas : dès que l'onglet est fermé, le JS de la page est mort. Il faut que **le serveur** puisse « réveiller » l'appareil.

C'est exactement le rôle de la Push API. Mais on ne peut pas pousser vers un navigateur arbitrairement : il faut d'abord que l'utilisateur **s'abonne**. Voici le squelette laissé par un collègue, qui « ne marche pas » :

```js
// ❌ Tentative naïve — plusieurs erreurs
async function enablePush() {
  const reg = await navigator.serviceWorker.ready;
  // 1. On s'abonne sans demander la permission ni passer de clé serveur
  const sub = await reg.pushManager.subscribe();
  // 2. On envoie 'sub' brut au serveur (comment le sérialiser ?)
  await fetch('/api/push/subscribe', { method: 'POST', body: sub });
}
```

**Trois questions que ce module tranche :**
1. Pourquoi `subscribe()` sans options est rejeté par Chrome/Edge, et que valent `userVisibleOnly` et `applicationServerKey` ?
2. D'où vient la clé serveur (`applicationServerKey`) — c'est quoi VAPID, et pourquoi le serveur en a besoin ?
3. Comment le serveur envoie réellement le rappel, et comment le service worker l'affiche même onglet fermé — sans jamais voir le contenu en clair transiter par un tiers ?

La Push API n'est pas magique : c'est une chaîne à **trois acteurs** avec un abonnement chiffré et une authentification serveur (VAPID). On la démonte pièce par pièce.

---

## 2. Théorie complète, concise

### 2.1 Trois acteurs : serveur, push service, navigateur

Un push ne va **jamais** directement de ton serveur au navigateur. Il passe par un **push service** — une infrastructure opérée par le fabricant du navigateur (FCM pour Chrome, Mozilla autopush pour Firefox, APNs — Apple Push Notification service — pour Safari). Tu ne choisis pas ce service : il est imposé par le navigateur de l'utilisateur.

```
  Ton serveur              Push service               Navigateur
  (TribuZen)               (FCM / Mozilla / …)        (+ service worker)
      │                          │                          │
      │  0. l'utilisateur s'abonne : le navigateur crée une  │
      │◄───── subscription (endpoint + clés) ────────────────┤
      │                          │                          │
      │  1. POST message chiffré │                          │
      │─── vers l'endpoint ─────►│                          │
      │    (+ en-tête VAPID)     │  2. route + stocke       │
      │                          │──── 3. livre ───────────►│
      │                          │                          │ 4. push event
      │                          │                          │    → showNotification
```

- **L'endpoint** est une URL unique fournie par le push service à l'abonnement. Poster dessus = demander la livraison à **ce** navigateur précis.
- Le message est **chiffré de bout en bout** : le push service route un blob opaque, il ne lit pas le contenu (voir 2.6).
- **VAPID** authentifie *ton serveur* auprès du push service (voir 2.3).

### 2.2 La permission Notifications — porte d'entrée

Avant tout push, il faut la permission d'**afficher des notifications**. C'est l'API `Notification`, indépendante de la Push API mais requise (un push doit produire une notification visible — voir `userVisibleOnly`).

```js
// Notification.permission : état courant, SANS prompt
// -> 'granted' | 'denied' | 'default'
console.log(Notification.permission);

// Notification.requestPermission() : demande, retourne une Promise<permission>
// DOIT être appelée en réponse à un geste utilisateur (clic)
button.addEventListener('click', async () => {
  const result = await Notification.requestPermission();
  // result: 'granted' | 'denied' | 'default'
  if (result === 'granted') {
    await subscribeToPush();
  }
});
```

Trois états, une règle d'or :

| `Notification.permission` | Sens | Peut-on redemander ? |
|---|---|---|
| `'default'` | jamais décidé | oui, une seule fois utile |
| `'granted'` | autorisé | inutile de redemander |
| `'denied'` | refusé | **non** — le prompt est bloqué, définitif |

**`'denied'` est un cul-de-sac** : une fois refusé, `requestPermission()` résout immédiatement `'denied'` sans re-prompter. D'où la règle UX : ne demande **jamais** au premier chargement — demande après une **valeur perçue** (l'utilisateur vient de créer une sortie), sur un clic explicite. Un refus brûle la permission pour de bon.

### 2.3 VAPID — authentifier ton serveur

**VAPID** (Voluntary Application Server Identification for Web Push) répond à : « comment le push service sait que le message vient bien de TribuZen et pas d'un tiers ? ». C'est une **paire de clés ECDSA P-256** :

- la **clé publique** est passée au navigateur lors de l'abonnement (`applicationServerKey`) ;
- la **clé privée** reste sur ton serveur ; elle signe un JWT joint à chaque envoi.

Le push service vérifie la signature avec la clé publique liée à la subscription. Une paire générée **une fois**, stockée, réutilisée pour tous les envois.

```bash
# Générer la paire (lib web-push). publicKey/privateKey = base64url.
npx web-push generate-vapid-keys
# Public Key:  BEl62iUYgUiv...       (→ front, applicationServerKey)
# Private Key: UUxI4O8-HoGB...       (→ serveur, secret)
```

> ⚠️ La clé VAPID (ECDSA P-256, authentification serveur) **n'est pas** la clé ECDH utilisée pour chiffrer le payload (2.6). Deux paires de clés différentes, deux rôles.

### 2.4 S'abonner : `pushManager.subscribe`

Sur un `ServiceWorkerRegistration` **actif**, `pushManager.subscribe(options)` crée la subscription. Deux options :

```js
async function subscribeToPush() {
  const registration = await navigator.serviceWorker.ready;

  // Réutiliser une subscription existante si présente
  const existing = await registration.pushManager.getSubscription();
  if (existing) return existing;

  const subscription = await registration.pushManager.subscribe({
    // userVisibleOnly: chaque push DOIT afficher une notif visible.
    // Chrome/Edge REJETTENT la Promise si absent/false.
    userVisibleOnly: true,
    // applicationServerKey: la clé publique VAPID.
    // Accepte un BufferSource (Uint8Array) OU, sur navigateurs récents,
    // directement la string base64url.
    applicationServerKey: urlBase64ToUint8Array(PUBLIC_VAPID_KEY),
  });

  return subscription; // → PushSubscription
}
```

- **`userVisibleOnly: true`** : promesse au navigateur que tout push produira une notification visible (pas de push silencieux/traçage). Obligatoire en pratique.
- **`applicationServerKey`** : la clé **publique** VAPID. Historiquement un `Uint8Array` (d'où la conversion ci-dessous, universellement compatible) ; MDN indique que les navigateurs récents acceptent aussi la string base64url.

```js
// Conversion base64url → Uint8Array (compat maximale)
function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}
```

### 2.5 La `PushSubscription` — ce qu'on stocke côté serveur

`subscribe()` résout une `PushSubscription`. Ses membres utiles :

| Membre | Type | Rôle |
|---|---|---|
| `endpoint` | string | URL du push service pour CE navigateur — la cible d'envoi |
| `expirationTime` | timestamp \| null | expiration éventuelle (souvent `null`) |
| `getKey(name)` | ArrayBuffer | clés publiques client (`'p256dh'`, `'auth'`) pour le chiffrement |
| `toJSON()` | objet | sérialisation prête à envoyer/stocker |
| `unsubscribe()` | Promise&lt;boolean&gt; | résilie la subscription |

`toJSON()` produit exactement la forme à persister :

```js
const json = subscription.toJSON();
// {
//   endpoint: "https://fcm.googleapis.com/fcm/send/abc...",
//   expirationTime: null,
//   keys: { p256dh: "BN...", auth: "k9..." }
// }
await fetch('/api/push/subscribe', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(json),   // ← objet sérialisé, pas la subscription brute
});
```

`endpoint` + `keys.p256dh` + `keys.auth` sont **les trois données** dont le serveur a besoin pour envoyer un push chiffré à cet abonné.

### 2.6 Le payload est chiffré de bout en bout

Le push service **ne voit pas** le contenu. Le serveur chiffre le payload avec les clés client (`p256dh` = clé publique ECDH du client, `auth` = secret partagé), schéma **`aes128gcm`** (RFC 8291 / Message Encryption for Web Push). Seul le navigateur destinataire peut déchiffrer.

En pratique, une lib (`web-push` côté Node) fait le chiffrement pour toi :

```js
// Côté serveur (Node) — la lib chiffre le payload automatiquement
import webpush from 'web-push';

webpush.setVapidDetails('mailto:contact@tribuzen.app', VAPID_PUBLIC, VAPID_PRIVATE);

await webpush.sendNotification(
  subscription,                                   // { endpoint, keys: { p256dh, auth } }
  JSON.stringify({ title: 'Sortie dans 1h', body: 'Balade au parc à 10h' }),
);
// La lib : chiffre (aes128gcm) + signe le JWT VAPID + POST vers l'endpoint.
```

À retenir : **tu ne postes jamais du JSON en clair** au push service. Le chiffrement est intrinsèque au protocole Web Push.

### 2.7 Recevoir : le `push` event dans le service worker

Quand le message arrive, le push service **réveille le service worker** et déclenche un `push` event. `event.data` (`PushMessageData`) donne le payload déchiffré via `.json()` ou `.text()`.

```js
// service-worker.js
self.addEventListener('push', (event) => {
  const payload = event.data ? event.data.json() : {};

  // waitUntil : garde le SW vivant tant que la notif n'est pas affichée
  event.waitUntil(
    self.registration.showNotification(payload.title ?? 'TribuZen', {
      body: payload.body,
      icon: '/icons/icon-192.png',
      badge: '/icons/badge-96.png',
      tag: payload.tag,        // remplace une notif de même tag au lieu d'empiler
      data: payload.data,      // transporté jusqu'au notificationclick
    }),
  );
});
```

`showNotification(title, options)` est sur le **`ServiceWorkerRegistration`** (pas le constructeur `new Notification()`), car c'est le SW qui affiche même onglet fermé. Options clés : `body`, `icon`, `badge`, `tag`, `data`, `actions` (boutons — **seulement** via SW), `requireInteraction`, `silent`. Elle retourne une `Promise<undefined>`.

> **`event.waitUntil()` est obligatoire** : sans lui, le navigateur peut tuer le SW avant que `showNotification` (asynchrone) n'aboutisse → notif jamais affichée. Et avec `userVisibleOnly: true`, un push qui n'affiche **rien** peut faire retirer ton abonnement par le navigateur.

### 2.8 Cliquer : `notificationclick`

Le clic déclenche `notificationclick` dans le SW. On ferme la notif, on route via `event.notification.data`, et on ouvre/focus une fenêtre.

```js
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url ?? '/';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then((clients) => {
        const open = clients.find((c) => c.url === url);
        if (open) return open.focus();       // onglet déjà ouvert → focus
        return self.clients.openWindow(url);  // sinon → nouvelle fenêtre
      }),
  );
});
```

Les boutons `actions` déclenchent le même event avec `event.action` = l'`action` cliquée (`''` si clic sur le corps).

### 2.9 Cycle de vie d'une subscription : expiration et `pushsubscriptionchange`

Une subscription **n'est pas éternelle** : le push service ou le navigateur peut l'invalider (rotation, désinstallation, purge). Deux mécanismes à gérer :

**Côté serveur** — l'envoi renvoie un code HTTP. `410 Gone` ou `404` = subscription morte → **supprime-la** de ta base.

```js
try {
  await webpush.sendNotification(sub, payload);
} catch (err) {
  if (err.statusCode === 410 || err.statusCode === 404) {
    await removeSubscription(sub.endpoint); // ne plus jamais l'utiliser
  }
}
```

**Côté navigateur** — l'event `pushsubscriptionchange` se déclenche dans le SW quand la subscription change **hors du contrôle de l'app** (rafraîchie/révoquée). On se ré-abonne et on notifie le serveur.

```js
self.addEventListener('pushsubscriptionchange', (event) => {
  event.waitUntil(
    self.registration.pushManager
      .subscribe(event.oldSubscription.options) // réutilise les options d'origine
      .then((newSub) =>
        fetch('/api/push/resubscribe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            old: event.oldSubscription?.endpoint,
            new: newSub.toJSON(),
          }),
        }),
      ),
  );
});
```

Enfin, `subscription.unsubscribe()` (Promise&lt;boolean&gt;) résilie proprement — à appeler quand l'utilisateur désactive les notifs, en supprimant aussi la subscription côté serveur.

---

## 3. Worked examples

### Exemple 1 — Le flux complet TribuZen : opt-in → abonnement → rappel de sortie

On corrige le squelette du cas concret, de bout en bout.

**a) Front — opt-in après valeur perçue.** L'utilisateur vient de créer la sortie « Balade au parc ». On propose alors les rappels, sur un clic.

```js
// src/push/enablePush.js
const PUBLIC_VAPID_KEY = 'BEl62iUYgUiv...'; // clé PUBLIQUE VAPID (front)

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  return Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
}

// Appelée par le bouton "Me rappeler cette sortie"
export async function enablePush() {
  // 1. Permission — sur geste utilisateur, jamais au chargement
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return { ok: false, reason: permission };

  // 2. SW déjà enregistré (module 15) → on récupère le registration actif
  const registration = await navigator.serviceWorker.ready;

  // 3. Abonnement (réutilise l'existant si présent)
  const existing = await registration.pushManager.getSubscription();
  const subscription = existing ?? await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(PUBLIC_VAPID_KEY),
  });

  // 4. Persistance serveur : toJSON() = endpoint + keys(p256dh, auth)
  await fetch('/api/push/subscribe', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(subscription.toJSON()),
  });

  return { ok: true };
}
```

**b) Serveur — envoyer le rappel 1 h avant (cron).**

```js
// server/sendReminder.js
import webpush from 'web-push';
webpush.setVapidDetails('mailto:contact@tribuzen.app', VAPID_PUBLIC, VAPID_PRIVATE);

export async function sendOutingReminder(sub, outing) {
  const payload = JSON.stringify({
    title: 'Sortie dans 1 h',
    body: `${outing.name} — ${outing.time}`,
    tag: `outing-${outing.id}`,          // une seule notif par sortie
    data: { url: `/sorties/${outing.id}` },
  });
  try {
    await webpush.sendNotification(sub, payload); // chiffre + signe + POST endpoint
  } catch (err) {
    if (err.statusCode === 410 || err.statusCode === 404) {
      await removeSubscription(sub.endpoint);     // subscription morte → purge
    } else {
      throw err;
    }
  }
}
```

**c) Service worker — recevoir + afficher + router au clic.**

```js
// service-worker.js  (le reste du SW — Cache API, offline — vu au module 15)
self.addEventListener('push', (event) => {
  const p = event.data ? event.data.json() : {};
  event.waitUntil(
    self.registration.showNotification(p.title ?? 'TribuZen', {
      body: p.body,
      icon: '/icons/icon-192.png',
      badge: '/icons/badge-96.png',
      tag: p.tag,
      data: p.data,
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url ?? '/';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((cl) => {
      const open = cl.find((c) => c.url.endsWith(url));
      return open ? open.focus() : self.clients.openWindow(url);
    }),
  );
});
```

**Pourquoi ce flux est correct :** permission demandée sur geste après valeur perçue ; `userVisibleOnly` + clé VAPID publique passés ; subscription sérialisée via `toJSON()` ; serveur chiffre via la lib ; `waitUntil` garde le SW vivant ; le `tag` évite l'empilement ; `data.url` route le clic vers la bonne sortie ; les subscriptions mortes (410) sont purgées.

### Exemple 2 — Diagnostiquer « je ne reçois rien » avec DevTools

Un testeur dit ne rien recevoir. Protocole dans **DevTools > Application > Push Messaging** (et le panneau **Service Workers**) :

1. **Vérifie la permission** : console → `Notification.permission`. Si `'denied'`, tout est bloqué en amont — il faut ré-autoriser dans les réglages du site (le prompt ne reviendra pas).
2. **Vérifie l'abonnement** : `await navigator.serviceWorker.ready.then(r => r.pushManager.getSubscription())`. `null` = pas abonné → rejoue l'opt-in.
3. **Simule un push** : DevTools > Application > Service Workers > champ **Push** → saisis un JSON (`{"title":"Test","body":"ok"}`) → **Push**. Ça déclenche le `push` event **sans passer par ton serveur**. Si la notif s'affiche → le SW et la permission sont bons, le problème est **côté serveur/VAPID**.
4. **Si le simulateur marche mais pas le vrai envoi** : compare la clé publique VAPID du front avec la privée du serveur (paire cohérente ?), et lis le `statusCode` renvoyé par `sendNotification` (401/403 = VAPID invalide, 410 = subscription morte).

**Résultat :** on isole en 4 étapes si la panne est permission, abonnement, service worker, ou VAPID/serveur — sans deviner.

---

## 4. Pièges & misconceptions

### PIÈGE #1 — `subscribe()` sans `userVisibleOnly` ni clé

```js
// ❌ Rejeté par Chrome/Edge (NotAllowedError)
await reg.pushManager.subscribe();
```

Chrome et Edge **exigent** `userVisibleOnly: true` (interdiction des push silencieux). Et sans `applicationServerKey`, le push service ne peut pas authentifier ton serveur → tu ne pourras rien envoyer. Toujours passer **les deux** options.

### PIÈGE #2 — Demander la permission au chargement de la page

```js
// ❌ Anti-pattern : prompt agressif dès l'arrivée
window.addEventListener('load', () => Notification.requestPermission());
```

Un refus met `Notification.permission` à `'denied'` **définitivement** : le prompt ne reviendra jamais, `requestPermission()` résoudra `'denied'` sans rien afficher. Demande sur un **geste** utilisateur, après une valeur perçue (sortie créée, routine complétée). Un `'denied'` prématuré tue le canal push pour de bon.

### PIÈGE #3 — Confondre `new Notification()` et `showNotification()`

```js
// ❌ Dans un contexte push / mobile : ne marche pas de façon fiable
new Notification('Titre');

// ✅ Depuis un service worker (et pour les actions/boutons)
self.registration.showNotification('Titre', { body: '…' });
```

Le constructeur `new Notification()` est une API page (onglet ouvert, desktop). Pour un push — onglet fermé, mobile, boutons `actions` — il faut `ServiceWorkerRegistration.showNotification()`. Sur Android, `new Notification()` lève carrément une erreur.

### PIÈGE #4 — Oublier `event.waitUntil()`

```js
self.addEventListener('push', (event) => {
  // ❌ le SW peut être tué avant que la notif async s'affiche
  self.registration.showNotification('Titre');
});
```

Le service worker est **éphémère** : sans `event.waitUntil(promise)`, le navigateur peut l'arrêter avant la fin de l'affichage → notif perdue. Pire, un push qui n'affiche rien viole `userVisibleOnly` et peut faire **révoquer ta subscription**. Toujours envelopper l'async dans `waitUntil`.

### PIÈGE #5 — Confondre clé VAPID et clés de chiffrement

`applicationServerKey` (VAPID, ECDSA P-256) **authentifie ton serveur**. Les clés `p256dh` / `auth` de la subscription (ECDH) servent à **chiffrer le payload**. Ce sont deux paires distinctes. Passer l'une pour l'autre → abonnement ou envoi cassé. La lib `web-push` gère le chiffrement à partir des clés de la subscription ; toi tu ne fournis que le couple VAPID.

### PIÈGE #6 — Ne pas purger les subscriptions mortes

Ignorer les `410 Gone` / `404` à l'envoi laisse s'accumuler des endpoints morts : envois inutiles, latence, quotas du push service gaspillés. À chaque erreur `410`/`404`, **supprime** la subscription. Et gère `pushsubscriptionchange` côté SW pour ré-abonner quand le navigateur fait tourner la clé — sinon l'utilisateur cesse silencieusement de recevoir.

---

## 5. Ancrage TribuZen

Les rappels de sorties famille sont le premier usage push de TribuZen. La chaîne concrète :

**Opt-in contextuel.** Aucune demande de permission à l'ouverture de l'app. Le bouton « Me rappeler cette sortie » n'apparaît qu'**après** la création d'une sortie — valeur perçue d'abord, permission ensuite, sur clic. C'est ce qui protège le taux de `granted` (un `denied` précoce est irréversible).

**Abonnement et stockage.** `pushManager.subscribe({ userVisibleOnly: true, applicationServerKey })` avec la clé publique VAPID de TribuZen. On persiste `subscription.toJSON()` (`endpoint`, `keys.p256dh`, `keys.auth`) lié au `userId` et à l'appareil.

**Envoi programmé.** Un job planifié (1 h avant la sortie) appelle `web-push` : chiffrement `aes128gcm` + JWT VAPID + POST vers l'`endpoint`. Réponse `410`/`404` → suppression de la subscription (l'utilisateur a désinstallé la PWA ou changé d'appareil).

**Réception et clic.** Le service worker TribuZen (déjà en place, module 15) écoute `push` → `showNotification('Sortie dans 1 h', …)`, et `notificationclick` → ouvre `/sorties/:id` (focus si l'app est déjà ouverte). Le `tag` `outing-:id` garantit un seul rappel par sortie.

**Discipline d'envoi.** Cadence sobre (les rappels ne doivent pas devenir du spam), plage horaire raisonnable, et désabonnement en 1 clic (`unsubscribe()` + purge serveur). Le paramétrage fin de la fréquence relève du produit, pas de ce module.

Fichiers cibles dans `smaurier/tribuzen` :
```
tribuzen/
  src/push/enablePush.js          # requestPermission + subscribe + POST /api/push/subscribe
  public/service-worker.js        # push + notificationclick + pushsubscriptionchange
  server/push/sendReminder.js     # web-push sendNotification + purge 410/404
  server/push/subscriptions.repo  # endpoint + keys(p256dh, auth) par userId
```

---

## 6. Points clés

1. Un push transite par **trois acteurs** : ton serveur → push service (imposé par le navigateur) → navigateur/service worker. Jamais en direct.
2. **VAPID** (paire ECDSA P-256) authentifie ton serveur : clé publique au navigateur (`applicationServerKey`), clé privée signe le JWT côté serveur.
3. La **permission Notifications** précède tout : `Notification.requestPermission()` sur geste utilisateur ; `'denied'` est **définitif**.
4. `pushManager.subscribe({ userVisibleOnly: true, applicationServerKey })` — les deux options sont requises en pratique.
5. La `PushSubscription` se stocke via `toJSON()` : `endpoint` + `keys.p256dh` + `keys.auth`. Ces trois valeurs suffisent au serveur pour envoyer.
6. Le **payload est chiffré de bout en bout** (`aes128gcm`) : le push service route un blob opaque. La lib `web-push` chiffre pour toi.
7. Réception : `push` event dans le SW → `event.waitUntil(registration.showNotification(...))` (obligatoire pour ne pas tuer le SW).
8. `notificationclick` → route via `event.notification.data` (focus fenêtre existante ou `openWindow`).
9. Cycle de vie : `410`/`404` à l'envoi → purger la subscription ; `pushsubscriptionchange` côté SW → se ré-abonner ; `unsubscribe()` pour résilier.

---

## 7. Seeds Anki

```
Par quels acteurs passe un message push et dans quel ordre ?|Ton serveur → un push service (FCM/Mozilla/APNs, imposé par le navigateur) → le navigateur/service worker. Jamais du serveur directement au navigateur : on POST vers l'endpoint fourni à l'abonnement.
À quoi sert VAPID et quelle clé va où ?|VAPID (paire ECDSA P-256) authentifie ton serveur auprès du push service. La clé publique est passée au navigateur via applicationServerKey ; la clé privée reste au serveur et signe un JWT joint à chaque envoi.
Quelles deux options faut-il passer à pushManager.subscribe() et pourquoi ?|userVisibleOnly: true (Chrome/Edge rejettent sinon ; interdit les push silencieux) et applicationServerKey (clé publique VAPID, sinon pas d'auth serveur possible).
Que renvoie Notification.requestPermission() et pourquoi ne pas la demander au chargement ?|Une Promise résolue en 'granted' | 'denied' | 'default', à appeler sur geste utilisateur. 'denied' est définitif : le prompt ne revient plus. On demande donc après une valeur perçue, sur clic.
Quelles données de la PushSubscription stocke-t-on côté serveur ?|subscription.toJSON() : endpoint (URL de livraison) + keys.p256dh + keys.auth. Ces trois valeurs suffisent au serveur pour chiffrer et livrer le push à cet abonné.
Pourquoi le push service ne voit-il pas le contenu du message ?|Le payload est chiffré de bout en bout (aes128gcm, RFC 8291) avec les clés client p256dh/auth. Le push service route un blob opaque ; seul le navigateur destinataire déchiffre. La lib web-push chiffre pour toi.
Comment reçoit-on et affiche-t-on un push dans le service worker ?|Écouter l'event 'push' ; lire event.data.json() ; appeler event.waitUntil(self.registration.showNotification(title, options)). waitUntil est obligatoire sinon le SW peut être tué avant l'affichage.
Différence entre new Notification() et registration.showNotification() ?|new Notification() est une API page (onglet ouvert, desktop) et échoue sur Android. showNotification() est sur le ServiceWorkerRegistration : affiche même onglet fermé et permet les boutons actions. Pour le push, toujours showNotification().
Comment gérer l'expiration d'une subscription ?|Côté serveur : un envoi renvoyant 410 Gone ou 404 = subscription morte → la supprimer. Côté navigateur : l'event pushsubscriptionchange dans le SW → se ré-abonner (subscribe(oldSubscription.options)) et notifier le serveur.
```

---

## Pont vers le lab

> Lab associé : `11-http-caching/labs/lab-16-push-api-web-notifications/README.md`. Abonner un vrai navigateur (`pushManager.subscribe` + `Notification.requestPermission`), envoyer un push depuis un mini serveur `web-push`, le recevoir dans le service worker et le déclencher aussi via DevTools > Application > Push — corrigé inline, variante J+30, portage TribuZen.
