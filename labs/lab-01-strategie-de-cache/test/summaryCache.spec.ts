// Oracle du lab 01 (HTTP caching). Ne pas modifier. La preuve n'est pas "les en-têtes sont
// là" — c'est le compteur d'appels au calcul coûteux, mesuré AVANT/APRÈS chaque scénario :
// un cache qui ne sert à rien laisse ce compteur grimper à chaque requête.
import { beforeEach, describe, expect, it } from "vitest";
import {
  computeExpensiveSummary,
  etagOf,
  getExpensiveCallCount,
  handleGetFamilySummary,
  resetExpensiveCallCount,
  SummaryCache,
} from "@lab/summaryCache";

beforeEach(() => resetExpensiveCallCount());

function horlogeFixe(t: number) {
  return () => t;
}

describe("handleGetFamilySummary — premier appel (rien en cache)", () => {
  it("calcule, pose ETag et Cache-Control, incrémente le compteur coûteux", () => {
    const cache = new SummaryCache();
    const res = handleGetFamilySummary("fam-1", undefined, cache, horlogeFixe(0));

    expect(res.status).toBe(200);
    expect(res.headers.ETag).toBeDefined();
    expect(res.headers["Cache-Control"]).toBe("max-age=60");
    expect(res.body).toBeDefined();
    expect(getExpensiveCallCount()).toBe(1);
  });
});

describe("handleGetFamilySummary — revalidation conditionnelle (If-None-Match)", () => {
  it("renvoie 304 SANS body ET SANS recalcul quand l'ETag correspond", () => {
    const cache = new SummaryCache();
    const premier = handleGetFamilySummary("fam-1", undefined, cache, horlogeFixe(0));
    expect(getExpensiveCallCount()).toBe(1);

    const deuxieme = handleGetFamilySummary("fam-1", premier.headers.ETag, cache, horlogeFixe(1000));

    expect(deuxieme.status).toBe(304);
    expect(deuxieme.body).toBeUndefined();
    expect(getExpensiveCallCount()).toBe(1); // PAS de second calcul
  });
});

describe("handleGetFamilySummary — servi depuis le cache (pas de If-None-Match, mais frais)", () => {
  it("renvoie le même contenu SANS recalcul tant que le cache est frais", () => {
    const cache = new SummaryCache();
    const premier = handleGetFamilySummary("fam-1", undefined, cache, horlogeFixe(0));
    const deuxieme = handleGetFamilySummary("fam-1", undefined, cache, horlogeFixe(5_000));

    expect(deuxieme.status).toBe(200);
    expect(deuxieme.body).toBe(premier.body);
    expect(deuxieme.headers.ETag).toBe(premier.headers.ETag);
    expect(getExpensiveCallCount()).toBe(1); // toujours un seul calcul
  });
});

describe("handleGetFamilySummary — expiration (au-delà de max-age)", () => {
  it("recalcule après expiration du cache", () => {
    const cache = new SummaryCache();
    handleGetFamilySummary("fam-1", undefined, cache, horlogeFixe(0));
    expect(getExpensiveCallCount()).toBe(1);

    handleGetFamilySummary("fam-1", undefined, cache, horlogeFixe(61_000)); // > 60s
    expect(getExpensiveCallCount()).toBe(2);
  });
});

describe("handleGetFamilySummary — clé de cache par famille", () => {
  it("deux familles différentes ont chacune leur propre entrée de cache", () => {
    const cache = new SummaryCache();
    handleGetFamilySummary("fam-1", undefined, cache, horlogeFixe(0));
    handleGetFamilySummary("fam-2", undefined, cache, horlogeFixe(0));
    expect(getExpensiveCallCount()).toBe(2);

    // Les deux re-servies depuis le cache, sans recalcul.
    handleGetFamilySummary("fam-1", undefined, cache, horlogeFixe(100));
    handleGetFamilySummary("fam-2", undefined, cache, horlogeFixe(100));
    expect(getExpensiveCallCount()).toBe(2);
  });
});

describe("etagOf / computeExpensiveSummary — utilitaires donnés, sanity check", () => {
  it("le même contenu produit toujours le même ETag (hash déterministe)", () => {
    expect(etagOf("x")).toBe(etagOf("x"));
    expect(etagOf("x")).not.toBe(etagOf("y"));
  });

  it("computeExpensiveSummary incrémente bien le compteur observable", () => {
    computeExpensiveSummary("fam-1");
    expect(getExpensiveCallCount()).toBe(1);
  });
});
