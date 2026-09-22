// localizedCache.ts — L'EXISTANT, EN PRODUCTION. Incident rapporté : « un utilisateur avec
// le navigateur en anglais voit parfois le résumé de sa famille EN FRANÇAIS — ça arrive de
// façon imprévisible, pas à chaque fois. » Ce fichier COMPILE et MARCHE : en dev, avec un
// seul développeur qui teste toujours dans la même langue, le bug n'apparaît JAMAIS — il
// ne se déclenche que quand DEUX utilisateurs de langues différentes consultent la MÊME
// famille à peu près en même temps.
//
// AVANT de corriger : ouvre CE fichier et remplis `AUDIT.md`.
//
// Contrat à respecter (signature inchangée) :
//   getFamilySummary(familyId: string, locale: "fr" | "en", cache: Map<string, string>): string
//     - Renvoie le résumé de la famille dans LA BONNE langue, en s'appuyant sur `cache`
//       comme couche applicative (module 09 — clé de cache par couche : méthode + URL +
//       VARY, ici la locale JOUE LE RÔLE d'un en-tête Vary).
import { buildSummary } from "./buildSummary";

export function getFamilySummary(familyId: string, locale: "fr" | "en", cache: Map<string, string>): string {
  const cle = familyId;
  const encache = cache.get(cle);
  if (encache !== undefined) return encache;

  const resume = buildSummary(familyId, locale);
  cache.set(cle, resume);
  return resume;
}
