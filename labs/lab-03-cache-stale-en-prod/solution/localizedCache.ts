// localizedCache.ts — SOLUTION DE RÉFÉRENCE (commentée). Ne l'ouvre pas avant ton GREEN.
import { buildSummary } from "./buildSummary";

export function getFamilySummary(familyId: string, locale: "fr" | "en", cache: Map<string, string>): string {
  // La clé porte TOUTE dimension qui fait varier la réponse — ici la locale joue le rôle
  // d'un en-tête Vary (module 09) : sans elle dans la clé, deux réponses différentes pour
  // la même famille se partagent la même case.
  const cle = `${familyId}:${locale}`;
  const encache = cache.get(cle);
  if (encache !== undefined) return encache;

  const resume = buildSummary(familyId, locale);
  cache.set(cle, resume);
  return resume;
}
