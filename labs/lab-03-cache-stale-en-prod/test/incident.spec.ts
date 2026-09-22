// Oracle du lab 03 (HTTP caching). Ne pas modifier. Le premier bloc reproduit EXACTEMENT le
// scénario simple qui ne révèle jamais le bug (une seule locale) — il passe déjà sur
// l'existant. Le second reproduit l'incident réel rapporté en prod (deux locales, même
// famille, cache partagé).
import { describe, expect, it } from "vitest";
import { getFamilySummary } from "@lab/localizedCache";

describe("getFamilySummary — usage simple (une seule locale), déjà vert", () => {
  it("renvoie le résumé en français", () => {
    const cache = new Map<string, string>();
    expect(getFamilySummary("f1", "fr", cache)).toBe("Famille f1 : 4 membres");
  });

  it("renvoie le résumé en anglais quand seul l'anglais est demandé", () => {
    const cache = new Map<string, string>();
    expect(getFamilySummary("f1", "en", cache)).toBe("Family f1: 4 members");
  });
});

describe("getFamilySummary — l'INCIDENT réel : deux locales, même famille, cache partagé", () => {
  it("un utilisateur anglophone ne doit JAMAIS voir le résumé en français (et inversement)", () => {
    const cache = new Map<string, string>();

    const premier = getFamilySummary("f1", "fr", cache); // un utilisateur FR consulte d'abord
    const second = getFamilySummary("f1", "en", cache); // puis un utilisateur EN, même famille

    expect(premier).toBe("Famille f1 : 4 membres");
    expect(second).toBe("Family f1: 4 members"); // PAS le résumé français mis en cache avant
  });

  it("l'ordre inverse (EN puis FR) ne fuit pas non plus", () => {
    const cache = new Map<string, string>();

    getFamilySummary("f1", "en", cache);
    const enFrancais = getFamilySummary("f1", "fr", cache);

    expect(enFrancais).toBe("Famille f1 : 4 membres");
  });

  it("les deux locales restent correctement servies depuis le cache aux appels suivants", () => {
    const cache = new Map<string, string>();
    getFamilySummary("f1", "fr", cache);
    getFamilySummary("f1", "en", cache);

    expect(getFamilySummary("f1", "fr", cache)).toBe("Famille f1 : 4 membres");
    expect(getFamilySummary("f1", "en", cache)).toBe("Family f1: 4 members");
  });
});
