// Oracle du lab 02 (HTTP caching / PWA). Ne pas modifier. Les trois stratégies du module 15,
// prouvées par le comportement RÉEL face à un réseau qui réussit, qui échoue, ou qui traîne
// — pas par lecture du code.
import { describe, expect, it, vi } from "vitest";
import { cacheFirst, type FakeCache, networkFirst, staleWhileRevalidate } from "@lab/strategies";

function memCache(initial: Record<string, string> = {}): FakeCache {
  const store = new Map(Object.entries(initial));
  return {
    get: (k) => store.get(k),
    set: (k, v) => {
      store.set(k, v);
    },
  };
}

describe("cacheFirst", () => {
  it("sert le cache SANS jamais appeler le réseau si l'entrée existe", async () => {
    const cache = memCache({ "/dashboard": "contenu-en-cache" });
    const fetch = vi.fn();
    const resultat = await cacheFirst("/dashboard", cache, fetch);

    expect(resultat).toBe("contenu-en-cache");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("va chercher le réseau et remplit le cache si rien n'est encore là", async () => {
    const cache = memCache();
    const fetch = vi.fn(async (k: string) => `frais:${k}`);
    const resultat = await cacheFirst("/dashboard", cache, fetch);

    expect(resultat).toBe("frais:/dashboard");
    expect(cache.get("/dashboard")).toBe("frais:/dashboard");
  });
});

describe("networkFirst", () => {
  it("sert et met à jour le cache depuis le réseau quand il répond", async () => {
    const cache = memCache({ "/dashboard": "vieux-contenu" });
    const fetch = vi.fn(async () => "contenu-a-jour");
    const resultat = await networkFirst("/dashboard", cache, fetch);

    expect(resultat).toBe("contenu-a-jour");
    expect(cache.get("/dashboard")).toBe("contenu-a-jour");
  });

  it("bascule sur le cache si le réseau échoue (hors ligne)", async () => {
    const cache = memCache({ "/dashboard": "dernier-connu" });
    const fetch = vi.fn(async () => {
      throw new Error("hors ligne");
    });
    const resultat = await networkFirst("/dashboard", cache, fetch);

    expect(resultat).toBe("dernier-connu");
  });

  it("relance l'erreur si le réseau échoue ET qu'il n'y a rien en cache", async () => {
    const cache = memCache();
    const fetch = vi.fn(async () => {
      throw new Error("hors ligne");
    });
    await expect(networkFirst("/dashboard", cache, fetch)).rejects.toThrow("hors ligne");
  });
});

describe("staleWhileRevalidate", () => {
  it("sert le cache IMMÉDIATEMENT sans attendre le réseau, si une entrée existe", async () => {
    const cache = memCache({ "/dashboard": "perime-mais-la" });
    let debloquerReseau!: (v: string) => void;
    const reseauLent = new Promise<string>((resolve) => {
      debloquerReseau = resolve;
    });
    const fetch = vi.fn(() => reseauLent);

    const resultat = await staleWhileRevalidate("/dashboard", cache, fetch);

    expect(resultat).toBe("perime-mais-la"); // renvoyé SANS attendre reseauLent
    debloquerReseau("frais"); // libère la promesse pour ne pas laisser le test en suspens
  });

  it("rafraîchit le cache en arrière-plan après avoir servi le contenu périmé", async () => {
    const cache = memCache({ "/dashboard": "perime" });
    const fetch = vi.fn(async () => "frais-en-fond");

    await staleWhileRevalidate("/dashboard", cache, fetch);
    await new Promise((r) => setImmediate(r)); // laisse le fetch d'arrière-plan se résoudre

    expect(cache.get("/dashboard")).toBe("frais-en-fond");
  });

  it("une erreur du fetch d'arrière-plan ne fait JAMAIS échouer l'appel principal", async () => {
    const cache = memCache({ "/dashboard": "perime" });
    const fetch = vi.fn(async () => {
      throw new Error("réseau capricieux");
    });

    await expect(staleWhileRevalidate("/dashboard", cache, fetch)).resolves.toBe("perime");
  });

  it("sans rien en cache, attend le réseau comme cache-first", async () => {
    const cache = memCache();
    const fetch = vi.fn(async () => "premiere-visite");
    const resultat = await staleWhileRevalidate("/dashboard", cache, fetch);

    expect(resultat).toBe("premiere-visite");
    expect(cache.get("/dashboard")).toBe("premiere-visite");
  });
});
