// EmailNotifier.ts — CONSOMMATEUR EXISTANT, DONNÉ. Ne se modifie pas. Le canal de
// notification déjà en production — ton travail est d'AJOUTER le push À CÔTÉ, jamais de
// remplacer ce chemin.
export class EmailNotifier {
  public readonly sent: Array<{ userId: string; message: string }> = [];

  send(userId: string, message: string): void {
    this.sent.push({ userId, message });
  }
}
