# Module 16 — PWA : Service Workers, Workbox, offline-first

| Difficulté | Durée estimée |
|------------|---------------|
| 4/5        | 90 min        |

> **Prérequis** : Modules 00-09 (HTTP et caching fondamentaux). Comprendre le cache navigateur est indispensable avant d'aborder les Service Workers.

## Objectifs

- Comprendre le cycle de vie d'un Service Worker
- Implémenter les stratégies de cache (cache-first, network-first, SWR)
- Utiliser Workbox pour orchestrer le caching
- Construire une architecture offline-first
- Implémenter Background Sync pour les actions en file d'attente
- Intégrer une PWA dans Next.js

---

## Qu'est-ce qu'une PWA ?

Une **Progressive Web App** est une application web qui :
- S'installe sur l'écran d'accueil (sans app store)
- Fonctionne offline
- Reçoit des notifications push
- Se comporte comme une app native

```
App native (React Native)    PWA (Next.js)
├── App Store / Play Store   ├── URL directe, pas d'app store
├── Binaire natif            ├── HTML + CSS + JS
├── Accès APIs natives       ├── Web APIs (caméra, GPS, push, offline)
├── 2-4h de build            ├── 0 build spécifique
└── Apple tax (30%)          └── 0 commission sur les paiements web
```

> **TribuZen** : PWA-first. Apple ne prélève pas 30% sur les abonnements web (modèle Spotify). Si install rate < 40% après 500 utilisateurs → évaluer React Native.

---

## Le Service Worker : un proxy réseau

Un Service Worker est un **script JavaScript** qui s'exécute dans un thread séparé du DOM, entre le navigateur et le réseau. Il intercepte toutes les requêtes HTTP de l'application.

```
┌──────────────────────────────────────────────────────────┐
│  Navigateur                                               │
│                                                           │
│  ┌─────────────┐      ┌─────────────────┐                │
│  │   Page web  │      │  Service Worker  │                │
│  │   (DOM)     │◄────►│  (thread séparé) │◄──► Cache     │
│  └─────────────┘      └────────┬────────┘     Storage    │
│                                │                          │
└────────────────────────────────┼──────────────────────────┘
                                 │
                            Réseau / Serveur
```

**Caractéristiques importantes :**
- S'exécute en dehors de la page → pas accès au DOM
- Persiste même si la page est fermée (pour le push, le background sync)
- Uniquement en HTTPS (ou localhost)
- Un seul SW par origine (domaine + port)

---

## Cycle de vie du Service Worker

```
navigator.serviceWorker.register('/sw.js')
          │
          ▼
    ┌──────────┐
    │ PARSING  │ Le SW est téléchargé et analysé
    └─────┬────┘
          │
          ▼
    ┌──────────┐
    │INSTALLING│ Événement 'install' → mettre en cache les assets statiques
    └─────┬────┘
          │ (attente si un SW actif existe déjà)
          ▼
    ┌──────────┐
    │INSTALLED │ En attente d'activation (Waiting)
    └─────┬────┘
          │ (quand toutes les pages contrôlées sont fermées)
          ▼
    ┌──────────────┐
    │  ACTIVATING  │ Événement 'activate' → nettoyer les anciens caches
    └──────┬───────┘
           │
           ▼
    ┌──────────┐
    │  ACTIVE  │ Contrôle toutes les requêtes via 'fetch'
    └──────────┘
```

### Implémentation minimale

```javascript
// public/sw.js

const CACHE_NAME = 'tribuzen-v1';
const PRECACHE_ASSETS = [
  '/',
  '/offline',
  '/manifest.json',
];

// INSTALL : mettre les assets critiques en cache
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_ASSETS))
  );
  // Forcer l'activation immédiate (sans attendre la fermeture des pages)
  self.skipWaiting();
});

// ACTIVATE : nettoyer les anciens caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) =>
      Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME)
          .map((name) => caches.delete(name))
      )
    )
  );
  // Prendre le contrôle immédiatement de toutes les pages ouvertes
  self.clients.claim();
});

// FETCH : intercepter les requêtes réseau
self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request).then((cached) => cached ?? fetch(event.request))
  );
});
```

---

## Stratégies de cache avec Workbox

Workbox est la bibliothèque de référence pour les Service Workers. Elle implémente les stratégies de cache reconnues.

```bash
npm install workbox-strategies workbox-routing workbox-precaching workbox-background-sync
```

### Stratégie 1 — Cache First (assets statiques)

```javascript
// sw.js
import { registerRoute } from 'workbox-routing';
import { CacheFirst } from 'workbox-strategies';
import { CacheableResponsePlugin } from 'workbox-cacheable-response';
import { ExpirationPlugin } from 'workbox-expiration';

// Assets statiques : images, fonts → cache d'abord, réseau en fallback
registerRoute(
  ({ request }) => request.destination === 'image' || request.destination === 'font',
  new CacheFirst({
    cacheName: 'static-assets',
    plugins: [
      new CacheableResponsePlugin({ statuses: [0, 200] }),
      new ExpirationPlugin({ maxAgeSeconds: 30 * 24 * 60 * 60 }), // 30 jours
    ],
  })
);
```

### Stratégie 2 — Network First (données dynamiques)

```javascript
import { NetworkFirst } from 'workbox-strategies';

// API TribuZen : réseau d'abord, cache en fallback si offline
registerRoute(
  ({ url }) => url.pathname.startsWith('/api/'),
  new NetworkFirst({
    cacheName: 'api-cache',
    networkTimeoutSeconds: 3, // 3s timeout → fallback cache
    plugins: [
      new CacheableResponsePlugin({ statuses: [0, 200] }),
      new ExpirationPlugin({
        maxEntries: 100,
        maxAgeSeconds: 7 * 24 * 60 * 60, // 7 jours
      }),
    ],
  })
);
```

### Stratégie 3 — Stale While Revalidate (contenu semi-statique)

```javascript
import { StaleWhileRevalidate } from 'workbox-strategies';

// Pages HTML, dashboard → retourne le cache immédiatement + met à jour en arrière-plan
registerRoute(
  ({ request }) => request.mode === 'navigate',
  new StaleWhileRevalidate({
    cacheName: 'pages-cache',
    plugins: [
      new CacheableResponsePlugin({ statuses: [0, 200] }),
    ],
  })
);
```

---

## Architecture offline TribuZen

```
TribuZen offline strategy :

READ (toujours disponible offline) :
  ├── Dashboard famille        → StaleWhileRevalidate
  ├── Routines du jour         → NetworkFirst + cache 24h
  ├── Journal 7 derniers jours → NetworkFirst + cache 7j
  └── Meal planner semaine     → StaleWhileRevalidate

WRITE (action queuée si offline) :
  ├── Compléter une routine    → Background Sync
  ├── Ajouter une note journal → Background Sync
  └── Modifier une tâche       → Background Sync

JAMAIS offline (données fraîches obligatoires) :
  ├── Paiement / abonnement
  └── Invitation co-référent
```

---

## Background Sync : actions offline en file d'attente

```javascript
// sw.js
import { BackgroundSyncPlugin } from 'workbox-background-sync';
import { NetworkOnly } from 'workbox-strategies';

const bgSyncPlugin = new BackgroundSyncPlugin('tribuzen-sync-queue', {
  maxRetentionTime: 24 * 60, // Garder les requêtes 24h maximum
  onSync: async ({ queue }) => {
    let entry;
    while ((entry = await queue.shiftRequest())) {
      try {
        await fetch(entry.request);
        console.log('Sync réussi:', entry.request.url);
      } catch (error) {
        console.error('Sync échoué, retry plus tard');
        await queue.unshiftRequest(entry);
        throw error;
      }
    }
  },
});

// Requêtes PATCH/POST vers l'API → queue si offline
registerRoute(
  ({ url, request }) =>
    url.pathname.startsWith('/api/') &&
    (request.method === 'POST' || request.method === 'PATCH'),
  new NetworkOnly({ plugins: [bgSyncPlugin] }),
  'POST'
);
```

### Feedback utilisateur sur l'état offline

```typescript
// src/hooks/useOfflineStatus.ts
import { useState, useEffect } from 'react';

export function useOfflineStatus() {
  const [isOffline, setIsOffline] = useState(!navigator.onLine);

  useEffect(() => {
    const handleOnline = () => setIsOffline(false);
    const handleOffline = () => setIsOffline(true);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  return isOffline;
}

// Usage dans un composant
function OfflineBanner() {
  const isOffline = useOfflineStatus();

  if (!isOffline) return null;

  return (
    <div className="offline-banner" role="status" aria-live="polite">
      {/* Pas de rouge — terracotta neutre */}
      <span>Mode hors ligne — vos actions sont sauvegardées</span>
    </div>
  );
}
```

---

## Intégration Next.js avec next-pwa

```bash
npm install next-pwa
```

```javascript
// next.config.js
const withPWA = require('next-pwa')({
  dest: 'public',
  disable: process.env.NODE_ENV === 'development',
  register: true,
  skipWaiting: true,
  runtimeCaching: [
    {
      urlPattern: /^https:\/\/api\.tribuzen\.fr\/routines/,
      handler: 'NetworkFirst',
      options: {
        cacheName: 'routines-cache',
        expiration: { maxAgeSeconds: 86400 }, // 24h
        networkTimeoutSeconds: 3,
      },
    },
    {
      urlPattern: /\.(png|jpg|jpeg|svg|gif|webp)$/,
      handler: 'CacheFirst',
      options: {
        cacheName: 'image-cache',
        expiration: { maxAgeSeconds: 30 * 86400 },
      },
    },
  ],
});

module.exports = withPWA({ /* config Next.js normale */ });
```

### Web App Manifest

```json
// public/manifest.json
{
  "name": "TribuZen",
  "short_name": "TribuZen",
  "description": "Réduire la charge mentale parentale",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#F8F5F0",
  "theme_color": "#6B7E6B",
  "orientation": "portrait-primary",
  "icons": [
    { "src": "/icons/icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "/icons/icon-512.png", "sizes": "512x512", "type": "image/png", "purpose": "any maskable" }
  ],
  "categories": ["lifestyle", "family"],
  "lang": "fr"
}
```

---

## Prompt d'installation PWA

```typescript
// src/hooks/usePWAInstall.ts

export function usePWAInstall() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState(false);

  useEffect(() => {
    const handler = (e: BeforeInstallPromptEvent) => {
      e.preventDefault(); // Empêcher le prompt automatique du navigateur
      setDeferredPrompt(e);
      // Analytics : montrer que le prompt est disponible
      window.posthog?.capture('pwa_install_prompt_shown');
    };

    window.addEventListener('beforeinstallprompt', handler as any);

    window.addEventListener('appinstalled', () => {
      setIsInstalled(true);
      window.posthog?.capture('pwa_installed');
    });

    return () => window.removeEventListener('beforeinstallprompt', handler as any);
  }, []);

  const promptInstall = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    window.posthog?.capture('pwa_install_choice', { outcome });
    setDeferredPrompt(null);
  };

  return { canInstall: !!deferredPrompt, promptInstall, isInstalled };
}
```

---

## Checklist

- [ ] Je comprends le cycle de vie d'un SW (install → activate → fetch)
- [ ] Je sais implémenter les 3 stratégies : CacheFirst, NetworkFirst, StaleWhileRevalidate
- [ ] J'ai mis en place un Background Sync pour les actions offline
- [ ] L'utilisateur voit un état "hors ligne" non anxiogène (pas d'écran rouge)
- [ ] Le manifest.json est configuré avec les bonnes couleurs TribuZen
- [ ] L'install prompt est contrôlé programmatiquement (pas le prompt navigateur par défaut)
- [ ] Les événements PWA sont trackés dans PostHog
