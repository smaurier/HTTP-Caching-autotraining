# Module 17 — Push API et Web Notifications

| Difficulté | Durée estimée |
|------------|---------------|
| 3/5        | 60 min        |

> **Prérequis** : Module 16 (PWA — Service Workers). Le Service Worker est le récepteur des messages push — il doit être en place avant.

## Objectifs

- Comprendre l'architecture Push API (VAPID, subscription, payload chiffré)
- Implémenter l'opt-in notifications avec UX non intrusive
- Envoyer des notifications push depuis NestJS
- Gérer la désabonnement et la rotation des clés VAPID
- Respecter la philosophie "max 3 push/jour" et la rampe progressive

---

## Architecture Push API

```
┌──────────────┐        ┌─────────────────┐       ┌──────────────┐
│   Serveur    │        │   Push Service   │       │  Navigateur  │
│  (NestJS)    │        │(Firebase/Mozilla)│       │ (Service SW) │
│              │        │                  │       │              │
│ 1. Envoyer   │──POST──►   2. Stocker     │──────►│3. Réception  │
│    message   │        │      + router    │       │   + afficher │
└──────────────┘        └─────────────────┘       └──────────────┘
      ▲                                                    │
      │                                                    │
      └──── 0. Subscription (endpoint + keys) ────────────┘
           (créée par le navigateur, stockée sur ton serveur)
```

**VAPID** (Voluntary Application Server Identification) : protocole d'authentification qui prouve que la notification provient bien de ton serveur, et non d'un tiers.

---

## Générer les clés VAPID

```bash
npx web-push generate-vapid-keys
# Output :
# Public Key:  BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSgSnfckjBJuBkr...
# Private Key: UUxI4O8-HoGBRBSBRrpxkFNc0Bx5RIVqE2CKdIFZ8...
```

```bash
# .env
VAPID_PUBLIC_KEY=BEl62iUYgUivxIkv69yViEuiBIa...
VAPID_PRIVATE_KEY=UUxI4O8-HoGBRBSBRrpxkFNc0...
VAPID_EMAIL=mailto:sylvain@tribuzen.fr
```

---

## Abonnement côté client

```typescript
// src/features/notifications/push-subscription.ts

const PUBLIC_VAPID_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!;

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  return Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
}

export async function subscribeToPush(): Promise<PushSubscription | null> {
  const registration = await navigator.serviceWorker.ready;

  // Vérifier si déjà abonné
  const existing = await registration.pushManager.getSubscription();
  if (existing) return existing;

  const subscription = await registration.pushManager.subscribe({
    userVisibleOnly: true, // obligatoire : chaque push doit afficher une notification
    applicationServerKey: urlBase64ToUint8Array(PUBLIC_VAPID_KEY),
  });

  // Envoyer la subscription au serveur pour stockage
  await fetch('/api/notifications/subscribe', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(subscription.toJSON()),
  });

  window.posthog?.capture('notification_permission', {
    granted: true,
    day: getDaysSinceInstall(), // Quel jour de l'onboarding ?
  });

  return subscription;
}

export async function unsubscribeFromPush(): Promise<void> {
  const registration = await navigator.serviceWorker.ready;
  const subscription = await registration.pushManager.getSubscription();

  if (subscription) {
    await subscription.unsubscribe();
    await fetch('/api/notifications/unsubscribe', {
      method: 'POST',
      body: JSON.stringify({ endpoint: subscription.endpoint }),
    });
  }
}
```

### UX : demander la permission au bon moment

```typescript
// src/components/NotificationOptIn.tsx

export function NotificationOptIn() {
  const [permission, setPermission] = useState(Notification.permission);

  // NE PAS demander au premier chargement — attendre que l'utilisateur ait de la valeur
  // Règle TribuZen : proposer après la première routine complétée
  const requestPermission = async () => {
    const result = await Notification.requestPermission();
    setPermission(result);

    if (result === 'granted') {
      await subscribeToPush();
    }

    window.posthog?.capture('notification_permission', { outcome: result });
  };

  if (permission !== 'default') return null; // Déjà décidé

  return (
    <div className="notification-opt-in" role="dialog">
      <p>
        Vous avez complété votre première routine 🌱
        Voulez-vous être rappelé demain à la même heure ?
      </p>
      <button onClick={requestPermission}>Oui, me rappeler</button>
      <button onClick={() => setPermission('denied')}>Plus tard</button>
    </div>
  );
}
```

---

## Envoi depuis NestJS

```bash
npm install web-push
npm install --save-dev @types/web-push
```

```typescript
// src/notifications/notifications.service.ts
import * as webPush from 'web-push';

@Injectable()
export class NotificationsService {
  constructor(private readonly configService: ConfigService) {
    webPush.setVapidDetails(
      this.configService.get('VAPID_EMAIL'),
      this.configService.get('VAPID_PUBLIC_KEY'),
      this.configService.get('VAPID_PRIVATE_KEY'),
    );
  }

  async sendPush(
    subscription: PushSubscriptionEntity,
    payload: NotificationPayload,
  ): Promise<void> {
    try {
      await webPush.sendNotification(
        {
          endpoint: subscription.endpoint,
          keys: {
            auth: subscription.auth,
            p256dh: subscription.p256dh,
          },
        },
        JSON.stringify(payload),
        {
          TTL: 86400, // Notification expire après 24h si l'appareil est hors ligne
          urgency: 'normal', // 'very-low' | 'low' | 'normal' | 'high'
        },
      );
    } catch (error) {
      if (error.statusCode === 410 || error.statusCode === 404) {
        // Subscription expirée ou révoquée → supprimer de la base
        await this.pushSubscriptionRepository.delete(subscription.id);
      }
    }
  }
}

interface NotificationPayload {
  title: string;
  body: string;
  icon?: string;
  badge?: string;
  tag?: string;      // Remplace une notification existante avec le même tag
  data?: Record<string, unknown>;
  actions?: Array<{ action: string; title: string }>;
}
```

### Types de notifications TribuZen

```typescript
// src/notifications/notification-templates.ts

export const NotificationTemplates = {
  routineReminder: (routineName: string, time: string): NotificationPayload => ({
    title: 'TribuZen',
    body: `${routineName} dans 15 minutes (${time})`,
    icon: '/icons/icon-192.png',
    badge: '/icons/badge-96.png',
    tag: 'routine-reminder', // une seule notif routine à la fois
    data: { type: 'routine_reminder' },
    actions: [
      { action: 'done', title: '✓ Terminé' },
      { action: 'snooze', title: 'Dans 30 min' },
    ],
  }),

  gazetteReady: (): NotificationPayload => ({
    title: 'Votre gazette de la semaine est prête',
    body: 'Découvrez les moments forts de votre famille',
    icon: '/icons/icon-192.png',
    tag: 'gazette-weekly',
    data: { type: 'gazette', url: '/gazette' },
  }),

  onThisDay: (year: number, memory: string): NotificationPayload => ({
    title: `Il y a ${new Date().getFullYear() - year} an${new Date().getFullYear() - year > 1 ? 's' : ''}`,
    body: memory,
    icon: '/icons/icon-192.png',
    tag: 'on-this-day',
    data: { type: 'on_this_day' },
  }),
};
```

---

## Réception dans le Service Worker

```javascript
// public/sw.js

self.addEventListener('push', (event) => {
  if (!event.data) return;

  const payload = event.data.json();

  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      icon: payload.icon ?? '/icons/icon-192.png',
      badge: payload.badge ?? '/icons/badge-96.png',
      tag: payload.tag,
      data: payload.data,
      actions: payload.actions ?? [],
      // Vibration : court, non intrusif
      vibrate: [100, 50, 100],
    })
  );
});

// Clic sur la notification
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const { action, notification } = event;
  const data = notification.data ?? {};

  if (action === 'done') {
    // Marquer la routine comme terminée directement depuis la notification
    event.waitUntil(
      fetch('/api/routines/complete', {
        method: 'POST',
        body: JSON.stringify({ routineId: data.routineId }),
        headers: { 'Content-Type': 'application/json' },
      })
    );
    return;
  }

  // Ouvrir l'app sur la bonne URL
  const urlToOpen = data.url ?? '/';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      const existing = clients.find((c) => c.url === urlToOpen);
      if (existing) return existing.focus();
      return self.clients.openWindow(urlToOpen);
    })
  );
});
```

---

## Rampe progressive TribuZen (philosophie)

```
Fondement scientifique :
  Zhang et al. (2021) — > 3 notifications/jour = risque désinstallation
  Lee, Kim & Sundar (2015) — contrôle perçu = satisfaction utilisateur
  Fogg (2009) — trigger raté (mauvais moment) détruit le habit loop

Règles d'implémentation :
  J1-J7   : max 1 notification/jour
             → Construire la confiance avant de solliciter
  J8-J30  : max 2/jour
             → L'utilisateur commence à avoir des routines ancrées
  J30+    : max 3/jour
             → Habit formé, solicitation normale acceptable

  Toujours :
  ├── Plage horaire : 7h00 → 21h00 uniquement
  ├── Heure choisie par l'utilisateur (pas par nous)
  ├── Bouton "Pas ce soir" visible → 1 clic = silence 24h
  └── Désabonnement total = 2 clics max (RGPD)
```

```typescript
// src/notifications/rate-limiter.service.ts

@Injectable()
export class NotificationRateLimiter {
  private getMaxPerDay(userCreatedAt: Date): number {
    const daysSinceJoin = Math.floor(
      (Date.now() - userCreatedAt.getTime()) / (1000 * 60 * 60 * 24)
    );

    if (daysSinceJoin <= 7) return 1;
    if (daysSinceJoin <= 30) return 2;
    return 3;
  }

  async canSend(userId: string, userCreatedAt: Date): Promise<boolean> {
    const todayCount = await this.redis.get(`notif_count_${userId}_${today()}`);
    const max = this.getMaxPerDay(userCreatedAt);
    return (Number(todayCount) || 0) < max;
  }

  async recordSent(userId: string): Promise<void> {
    const key = `notif_count_${userId}_${today()}`;
    await this.redis.incr(key);
    await this.redis.expire(key, 86400); // Expire à minuit+
  }
}
```

---

## Checklist

- [ ] Les clés VAPID sont générées et stockées en variables d'environnement
- [ ] L'opt-in est demandé au bon moment (après valeur perçue, pas à l'arrivée)
- [ ] La subscription est stockée en base avec endpoint + auth + p256dh
- [ ] Les subscriptions expirées (410/404) sont supprimées automatiquement
- [ ] Le clic sur la notification ouvre la bonne URL ou déclenche une action directe
- [ ] La rampe progressive est implémentée (J1-7: max 1, J8-30: max 2, J30+: max 3)
- [ ] Aucune notification avant 7h ou après 21h
- [ ] Le bouton "Pas ce soir" est visible et fonctionnel (1 clic = silence 24h)
