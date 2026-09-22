# Lab 04 — Intervention : ajouter le push à une appli existante, sans casser l'email

> **Outcome :** à la fin, tu as ajouté un nouveau canal de notification (push) à un service
> qui en avait déjà un (email), sans toucher au chemin existant — et tu sais gérer le cas
> réel documenté par le module 16 : un abonnement push qui a expiré (410 Gone) doit être
> retiré, pas retenté indéfiniment.
> **Vrai outil :** `EmailNotifier` (donné) est le VRAI consommateur existant, à la racine du
> lab, hors de `src/` — structurellement intouchable, exactement comme dans les labs
> "sans rien casser" précédents de ce curriculum.
> **Feedback :** `npm run lab:04` — RED tant que `NotificationService` ne satisfait pas
> l'oracle. `npm run solution:04` prouve l'oracle.

## Portée de ce lab (honnêteté)

L'envoi push RÉEL (clés VAPID, chiffrement du payload `aes128gcm`, un vrai service de push
navigateur) a besoin d'un navigateur et d'un vrai push service — hors de portée d'un oracle
vitest+node, même limite que le lab 02 (Service Worker) de ce cours. `PushSender` est donc
injecté et FAUX dans ce lab, mais fidèle au contrat réel (`send(subscription, payload) →
{ statusCode }`) — ce que tu écris ici (gestion des abonnements, nettoyage des abonnements
expirés) se branche tel quel sur un vrai envoi `web-push` en production.

## Prérequis technique

`npm install` depuis `11-http-caching/labs`.

## Lire avant (une lecture bornée)

- Module [`16-push-api-web-notifications.md`](../../modules/16-push-api-web-notifications.md)
  — architecture Push API, `PushSubscription`, gestion de l'expiration (410/404).

## Énoncé

`EmailNotifier` (donné, à la racine du lab) est le canal EXISTANT. Lis les commentaires en
tête de `src/NotificationService.ts` pour le contrat exact de `subscribe` et `notify`.

**Le piège à éviter.** Un abonnement qui renvoie 410 Gone une fois n'est pas un accident
passager — le navigateur a définitivement invalidé cet abonnement (l'utilisateur a
désinstallé l'app, changé de navigateur, etc.). Continuer à l'appeler à chaque notification
future gaspille des appels réseau pour rien, indéfiniment. Il faut le retirer dès le premier
410, pas "après plusieurs échecs" (contrairement à un simple timeout réseau, qui pourrait
justifier une retentative).

## Étapes (en friction)

1. `npm run lab:04` : RED partout.
2. Implémente `subscribe` (dédoublonnage par `endpoint`).
3. Implémente `notify` : email d'abord (chemin existant), puis push à chaque abonnement.
4. Ajoute le nettoyage des abonnements en 410.
5. Relance : les 5 tests doivent passer.

## Vérifier

```bash
cd 11-http-caching/labs
npm install
npm run lab:04
npm run solution:04
```

**Ce que l'oracle vérifie**

Non-régression : l'email part toujours, même sans abonnement push. Ajout du push : chaque
abonnement de l'utilisateur reçoit le push, EN PLUS de l'email ; re-souscrire avec le même
endpoint ne duplique pas ; un abonnement en 410 est retiré et n'est plus jamais retenté aux
notifications suivantes (compteur d'appels vérifié précisément) ; un utilisateur sans
abonnement ne déclenche aucun envoi push mais reçoit quand même son email.

## Variante J+30 (fading)

Le produit veut permettre à un utilisateur de choisir SES canaux (email seul, push seul, ou
les deux). Comment ferais-tu évoluer `notify` sans casser les appelants existants qui
attendent "email + tous les push" par défaut ?

## Application TribuZen

Même ajout sur `tribuzen-api`, avec un vrai `web-push` (VAPID) et un Service Worker
(cours 11, lab 02) qui affiche la notification côté client. Commit :
`feat(notifications): canal push ajouté, abonnements expirés nettoyés au premier 410`.
