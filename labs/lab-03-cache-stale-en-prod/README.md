# Lab 03 — Intervention : cache stale en prod, diagnostiquer et corriger

> **Outcome :** à la fin, tu sais reconnaître le symptôme d'une clé de cache incomplète —
> une dimension qui fait varier la réponse (ici la locale) mais qui n'est PAS dans la clé,
> le rôle exact d'un en-tête `Vary` — et pourquoi ce genre de bug est invisible en dev mais
> garanti en prod.
> **Vrai outil :** aucune dépendance — la preuve tient dans une `Map` partagée et deux
> locales, exactement le scénario qui déclenche l'incident réel.
> **Feedback :** `npm run lab:03` — les usages simples (une seule locale) sont déjà verts,
> l'incident reproduit est rouge. `npm run solution:03` prouve l'oracle. `AUDIT.md` se
> remplit AVANT tout code.

## Prérequis technique

`npm install` depuis `11-http-caching/labs`.

## Lire avant (une lecture bornée)

- Module [`09-cache-multi-couches.md`](../../modules/09-cache-multi-couches.md) — clé de
  cache par couche (méthode + URL + `Vary`), pourquoi une dimension absente de la clé fait
  fuiter une réponse vers le mauvais contexte.

## Énoncé

`getFamilySummary` (`src/localizedCache.ts`) est **en production**. Incident : *« un
utilisateur avec le navigateur en anglais voit parfois le résumé de sa famille en français
— imprévisible, pas à chaque fois. »*

**0. `AUDIT.md`, avant toute ligne de code.**

**1. Corrige** la clé de cache pour qu'elle porte la locale en plus de l'id de famille.

**Le piège à éviter — et pourquoi l'incident a mis du temps à être détecté.** En dev, avec
un seul développeur qui teste toujours dans la même langue, ce bug ne se déclenche JAMAIS :
le cache ne contient qu'une seule entrée par famille, toujours dans la même langue, donc
toujours "correcte" par accident. Il ne se révèle qu'avec deux locales réellement
concurrentes sur la même famille — exactement ce que ce lab reproduit.

## Étapes (en friction)

1. Remplis `AUDIT.md`.
2. `npm run lab:03` : les usages simples passent déjà, l'incident reproduit est rouge.
3. Change la clé de cache : `${familyId}:${locale}` au lieu de `familyId` seul.
4. Relance : les 5 tests doivent passer.

## Vérifier

```bash
cd 11-http-caching/labs
npm install
npm run lab:03
npm run solution:03
```

**Ce que l'oracle vérifie**

Usages simples (déjà verts) : une seule locale demandée renvoie toujours le bon résumé.
Incident reproduit : FR puis EN sur la même famille ne fait pas fuiter le français vers le
client anglophone (et inversement, EN puis FR) ; les deux locales restent correctement
servies depuis le cache aux appels suivants, indépendamment l'une de l'autre.

## Variante J+30 (fading)

Le produit ajoute un troisième axe de variation : le thème (`light`/`dark`) change aussi le
contenu du résumé (icônes différentes). Le même bug peut-il se reproduire sur CET axe si on
"corrige" seulement la locale ? Comment généraliser la clé de cache à N dimensions sans la
complexifier à chaque nouvel axe ?

## Application TribuZen

Même diagnostic sur le cache applicatif réel de `tribuzen-api`, avec un vrai en-tête HTTP
`Vary: Accept-Language` posé côté CDN pour que la couche navigateur/CDN respecte la même
règle que le cache applicatif (cohérence de bout en bout, module 09). Commit :
`fix(cache): la clé porte la locale — fuite de contenu entre langues corrigée`.
