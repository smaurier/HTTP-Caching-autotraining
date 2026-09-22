// Oracle du lab 04 (HTTP caching). Ne pas modifier. `EmailNotifier` est le VRAI consommateur
// existant (à la racine du lab, hors de src/) — la preuve de non-régression passe par lui,
// pas par une supposition.
import { describe, expect, it, vi } from "vitest";
import { EmailNotifier } from "../EmailNotifier";
import { NotificationService, type PushSender, type PushSubscription } from "@lab/NotificationService";

function sub(endpoint: string): PushSubscription {
  return { endpoint, keys: { p256dh: "clé-p256dh", auth: "clé-auth" } };
}

describe("NotificationService — non-régression : l'email continue de fonctionner", () => {
  it("notify envoie TOUJOURS l'email, même sans abonnement push", async () => {
    const email = new EmailNotifier();
    const pushSender: PushSender = { send: vi.fn() };
    const service = new NotificationService(email, pushSender);

    await service.notify("u1", "Sortie prévue samedi");

    expect(email.sent).toEqual([{ userId: "u1", message: "Sortie prévue samedi" }]);
  });
});

describe("NotificationService — ajout du push, sans casser l'email", () => {
  it("notify envoie le push à CHAQUE abonnement de l'utilisateur, ET l'email", async () => {
    const email = new EmailNotifier();
    const envois: PushSubscription[] = [];
    const pushSender: PushSender = {
      send: vi.fn(async (s) => {
        envois.push(s);
        return { statusCode: 201 };
      }),
    };
    const service = new NotificationService(email, pushSender);
    service.subscribe("u1", sub("https://push.exemple/a"));
    service.subscribe("u1", sub("https://push.exemple/b"));

    await service.notify("u1", "Sortie prévue samedi");

    expect(email.sent).toHaveLength(1); // toujours envoyé
    expect(envois.map((s) => s.endpoint)).toEqual(["https://push.exemple/a", "https://push.exemple/b"]);
  });

  it("re-souscrire avec le même endpoint ne duplique pas l'abonnement", async () => {
    const email = new EmailNotifier();
    const pushSender: PushSender = { send: vi.fn(async () => ({ statusCode: 201 })) };
    const service = new NotificationService(email, pushSender);

    service.subscribe("u1", sub("https://push.exemple/a"));
    service.subscribe("u1", sub("https://push.exemple/a")); // re-souscription (ex. reload)
    await service.notify("u1", "x");

    expect(pushSender.send).toHaveBeenCalledTimes(1);
  });

  it("un abonnement expiré (410 Gone) est retiré et n'est plus jamais retenté", async () => {
    const email = new EmailNotifier();
    const statuts: Record<string, number> = {
      "https://push.exemple/a": 410,
      "https://push.exemple/b": 201,
    };
    const pushSender: PushSender = {
      send: vi.fn(async (s) => ({ statusCode: statuts[s.endpoint] })),
    };
    const service = new NotificationService(email, pushSender);
    service.subscribe("u1", sub("https://push.exemple/a"));
    service.subscribe("u1", sub("https://push.exemple/b"));

    await service.notify("u1", "premier envoi");
    expect(pushSender.send).toHaveBeenCalledTimes(2);

    await service.notify("u1", "second envoi");
    // Seul l'abonnement encore valide (b) est retenté — a (410) a été retiré.
    expect(pushSender.send).toHaveBeenCalledTimes(3);
  });

  it("un utilisateur sans abonnement ne déclenche aucun envoi push (mais l'email part)", async () => {
    const email = new EmailNotifier();
    const pushSender: PushSender = { send: vi.fn() };
    const service = new NotificationService(email, pushSender);

    await service.notify("u-sans-push", "x");

    expect(pushSender.send).not.toHaveBeenCalled();
    expect(email.sent).toHaveLength(1);
  });
});
