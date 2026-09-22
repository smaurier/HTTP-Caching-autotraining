// NotificationService.ts — SOLUTION DE RÉFÉRENCE (commentée). Ne l'ouvre pas avant ton GREEN.
import type { EmailNotifier } from "../EmailNotifier";

export interface PushSubscription {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

export interface PushSender {
  send(sub: PushSubscription, payload: string): Promise<{ statusCode: number }>;
}

export class NotificationService {
  private readonly subscriptions = new Map<string, PushSubscription[]>();

  constructor(
    private readonly email: EmailNotifier,
    private readonly pushSender: PushSender,
  ) {}

  subscribe(userId: string, subscription: PushSubscription): void {
    const existantes = this.subscriptions.get(userId) ?? [];
    const dejaLa = existantes.some((s) => s.endpoint === subscription.endpoint);
    if (!dejaLa) existantes.push(subscription);
    this.subscriptions.set(userId, existantes);
  }

  async notify(userId: string, message: string): Promise<void> {
    // Chemin existant, préservé tel quel — c'est la preuve de non-régression du lab.
    this.email.send(userId, message);

    const abonnements = this.subscriptions.get(userId) ?? [];
    const restantes: PushSubscription[] = [];

    for (const sub of abonnements) {
      const { statusCode } = await this.pushSender.send(sub, message);
      // 410 Gone : l'abonnement a expiré côté navigateur (module 16) — on ne le garde pas,
      // sinon chaque notification future retente sur un endpoint mort pour rien.
      if (statusCode !== 410) restantes.push(sub);
    }

    this.subscriptions.set(userId, restantes);
  }
}
