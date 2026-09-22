// buildSummary.ts — DONNÉ, ne se modifie pas. Simule le calcul du résumé localisé (en vrai :
// un template ou une lib i18n). Le sujet du lab n'est pas ICI.
export function buildSummary(familyId: string, locale: "fr" | "en"): string {
  return locale === "fr" ? `Famille ${familyId} : 4 membres` : `Family ${familyId}: 4 members`;
}
