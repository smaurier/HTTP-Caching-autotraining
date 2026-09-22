// NotificationService.ts — PAGE BLANCHE. L'app existante notifie déjà par email
// (`EmailNotifier.ts`, DONNÉ, ne se modifie pas — vit à la racine du lab, hors de `src/`,
// tu ne peux donc structurellement pas le toucher). Ticket : « ajoute les notifications
// push, EN PLUS de l'email, sans jamais casser le chemin email existant. »
//
// Portée assumée (voir README) : l'envoi push réel (VAPID, chiffrement du payload, un vrai
// service de push navigateur) a besoin d'un navigateur et d'un vrai push service — hors de
// portée d'un oracle vitest+node. Ce lab prouve la LOGIQUE de gestion des abonnements
// (`PushSender` est injecté, FAUX mais fidèle au contrat réel), pas l'infrastructure push
// elle-même.
//
// export interface PushSubscription { endpoint: string; keys: { p256dh: string; auth: string } }
// export interface PushSender { send(sub: PushSubscription, payload: string): Promise<{ statusCode: number }> }
//
// export class NotificationService
//   constructor(email: EmailNotifier, pushSender: PushSender)
//
//   subscribe(userId: string, subscription: PushSubscription): void
//     - Enregistre l'abonnement pour cet utilisateur. Un abonnement avec le MÊME `endpoint`
//       déjà enregistré pour ce user ne doit PAS être dupliqué (un navigateur qui
//       re-souscrit, ex. après un rechargement de page, ne doit pas créer un doublon).
//
//   async notify(userId: string, message: string): Promise<void>
//     - Envoie TOUJOURS l'email (`email.send`) — comportement EXISTANT, à préserver.
//     - Envoie AUSSI le push à CHAQUE abonnement encore enregistré pour cet utilisateur.
//     - Si `pushSender.send` renvoie `statusCode === 410` (Gone — l'abonnement a expiré côté
//       navigateur, cas réel documenté par le module 16) : RETIRE cet abonnement de la
//       liste, pour ne plus jamais retenter dessus aux notifications suivantes.
import type { EmailNotifier } from "../EmailNotifier";

export interface PushSubscription {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

export interface PushSender {
  send(sub: PushSubscription, payload: string): Promise<{ statusCode: number }>;
}

export class NotificationService {
  constructor(
    private readonly email: EmailNotifier,
    private readonly pushSender: PushSender,
  ) {}

  subscribe(_userId: string, _subscription: PushSubscription): void {
    throw new Error("subscribe n'est pas encore implémenté");
  }

  async notify(_userId: string, _message: string): Promise<void> {
    throw new Error("notify n'est pas encore implémenté");
  }
}
