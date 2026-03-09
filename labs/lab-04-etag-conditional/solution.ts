// =============================================================================
// Lab 04 — ETag & Requêtes Conditionnelles — SOLUTION
// =============================================================================
// Exécuter avec : npx tsx solution.ts
// =============================================================================

import type { IncomingMessage, ServerResponse } from "node:http";
import { createServer, request as httpRequest } from "node:http";
import { createHash } from "node:crypto";

console.log("=== Lab 04 : ETag & Requêtes Conditionnelles — SOLUTION ===\n");

const PORT: number = 3003;

// =============================================================================
// Données simulées
// =============================================================================
let currentContent: string = "Bonjour, ceci est le contenu de la ressource v1.";
let lastModifiedDate: Date = new Date("2025-01-15T10:30:00Z");

// =============================================================================
// PARTIE 1 : Générer des ETags avec crypto
// =============================================================================
// POURQUOI SHA-256 ? C'est un algorithme de hachage cryptographique rapide et
// résistant aux collisions. Même une modification d'un seul octet dans le contenu
// produit un hash complètement différent.
// POURQUOI tronquer à 16 caractères ? Un hash SHA-256 fait 64 caractères hex.
// 16 caractères (64 bits) offrent suffisamment d'unicité pour un ETag tout en
// restant lisible dans les logs et headers.
// POURQUOI les guillemets ? La RFC 7232 exige que les ETags soient entre
// guillemets. "abc123" est un ETag valide, abc123 ne l'est pas.
// =============================================================================

function generateETag(content: string): string {
  const hash: string = createHash("sha256").update(content).digest("hex").slice(0, 16);
  return `"${hash}"`;
}

// =============================================================================
// PARTIE 4 : ETags faibles
// =============================================================================
// POURQUOI W/ ? Un ETag faible (W/"...") signifie que deux représentations sont
// "sémantiquement équivalentes" sans être identiques octet par octet.
// Exemple : une page HTML peut avoir un timestamp différent mais le même contenu.
// POURQUOI distinguer fort/faible ? L'ETag fort est utilisé pour les requêtes
// de type "range" (téléchargement partiel) — chaque octet compte.
// L'ETag faible est suffisant pour la validation de cache simple.
// =============================================================================

function generateWeakETag(content: string): string {
  const hash: string = createHash("sha256").update(content).digest("hex").slice(0, 16);
  return `W/"${hash}"`;
}

// Tests de la Partie 1 et 4
setTimeout(() => {
  console.log("--- Partie 1 : Génération d'ETags ---\n");

  const content1 = "Hello World";
  const content2 = "Hello World";
  const content3 = "Goodbye World";

  const etag1: string = generateETag(content1);
  const etag2: string = generateETag(content2);
  const etag3: string = generateETag(content3);

  console.log(`Contenu 1: "${content1}" → ETag: ${etag1}`);
  console.log(`Contenu 2: "${content2}" → ETag: ${etag2}`);
  console.log(`Contenu 3: "${content3}" → ETag: ${etag3}`);

  console.log(`\n${etag1 === etag2 ? "✅" : "❌"} Même contenu → même ETag`);
  console.log(`${etag1 !== etag3 ? "✅" : "❌"} Contenu différent → ETag différent`);
  console.log(`${etag1.startsWith('"') && etag1.endsWith('"') ? "✅" : "❌"} ETag est entre guillemets`);

  console.log("\n--- Partie 4 : ETags forts vs faibles ---\n");

  const content = "Mon contenu de test";
  const strong: string = generateETag(content);
  const weak: string = generateWeakETag(content);

  console.log(`ETag fort   : ${strong}`);
  console.log(`ETag faible : ${weak}`);
  console.log(`\n${weak.startsWith('W/"') ? "✅" : "❌"} ETag faible commence par W/"`);
  console.log(`${weak.includes(strong.replace(/"/g, "")) ? "✅" : "❌"} ETag faible contient le même hash`);
}, 0);

// =============================================================================
// PARTIE 2 & 3 : Serveur avec ETag + Last-Modified
// =============================================================================
// POURQUOI vérifier ETag AVANT Last-Modified ?
// La RFC 7232 section 6 définit l'ordre de priorité :
// 1. Si If-None-Match est présent → utiliser ETag pour la comparaison
// 2. Sinon, si If-Modified-Since est présent → utiliser la date
// ETag est plus précis (hash du contenu) que Last-Modified (précision seconde).
// =============================================================================

function handleRequest(req: IncomingMessage, res: ServerResponse): void {
  const etag: string = generateETag(currentContent);
  const lastModified: string = lastModifiedDate.toUTCString();

  console.log(`\n📨 ${req.method} ${req.url}`);
  console.log(`  ETag serveur : ${etag}`);
  console.log(`  Last-Modified: ${lastModified}`);

  // POURQUOI vérifier If-None-Match en premier ?
  // Si le client envoie les deux headers (If-None-Match ET If-Modified-Since),
  // la RFC dit de ne regarder que If-None-Match et d'ignorer If-Modified-Since.
  const clientEtag: string | undefined = req.headers["if-none-match"];
  if (clientEtag) {
    console.log(`  If-None-Match: ${clientEtag}`);

    // POURQUOI supporter plusieurs ETags ? Le client peut envoyer plusieurs
    // ETags séparés par des virgules : If-None-Match: "abc", "def", "ghi"
    // Si l'un d'entre eux correspond → 304.
    const clientEtags: string[] = clientEtag.split(",").map((e) => e.trim());
    if (clientEtags.includes(etag) || clientEtags.includes("*")) {
      console.log("  → 304 Not Modified (ETag match)");
      res.writeHead(304, {
        ETag: etag,
        "Last-Modified": lastModified,
        "Cache-Control": "no-cache",
      });
      res.end();
      return;
    }
  }

  // POURQUOI vérifier If-Modified-Since seulement si pas d'ETag ?
  // Si If-None-Match était présent mais ne correspondait pas, on ne vérifie
  // PAS If-Modified-Since — on envoie directement un 200.
  const ifModifiedSince: string | undefined = req.headers["if-modified-since"];
  if (!clientEtag && ifModifiedSince) {
    console.log(`  If-Modified-Since: ${ifModifiedSince}`);

    const clientDate: number = new Date(ifModifiedSince).getTime();
    const serverDate: number = lastModifiedDate.getTime();

    // POURQUOI <= et pas < ? Si les dates sont identiques, la ressource
    // n'a pas changé. On arrondit à la seconde car HTTP dates n'ont pas
    // de millisecondes.
    if (serverDate <= clientDate) {
      console.log("  → 304 Not Modified (Last-Modified match)");
      res.writeHead(304, {
        ETag: etag,
        "Last-Modified": lastModified,
        "Cache-Control": "no-cache",
      });
      res.end();
      return;
    }
  }

  // POURQUOI envoyer ETag ET Last-Modified dans le 200 ?
  // Pour que le client puisse utiliser l'un ou l'autre lors de la prochaine
  // requête. Les vieux clients/proxies peuvent ne supporter que Last-Modified.
  console.log("  → 200 OK (contenu complet envoyé)");
  res.writeHead(200, {
    "Content-Type": "text/plain; charset=utf-8",
    ETag: etag,
    "Last-Modified": lastModified,
    "Cache-Control": "no-cache",
  });
  res.end(currentContent);
}

// =============================================================================
// Client de test
// =============================================================================

interface HttpTestResponse {
  status: number | undefined;
  headers: import("node:http").IncomingHttpHeaders;
  body: string;
}

function makeRequest(path: string, headers: Record<string, string> = {}): Promise<HttpTestResponse> {
  return new Promise((resolve, reject) => {
    const req = httpRequest(
      { hostname: "localhost", port: PORT, path, method: "GET", headers },
      (res) => {
        let body = "";
        res.on("data", (chunk: Buffer) => (body += chunk));
        res.on("end", () => {
          resolve({
            status: res.statusCode,
            headers: res.headers,
            body,
          });
        });
      }
    );
    req.on("error", reject);
    req.end();
  });
}

// =============================================================================
// Tests d'intégration
// =============================================================================

const server = createServer(handleRequest);

server.listen(PORT, async () => {
  console.log(`\n✅ Serveur démarré sur le port ${PORT}\n`);
  console.log("--- Tests d'intégration ---\n");

  let passed: number = 0;
  let total: number = 0;

  try {
    // Test 1 : Première requête → 200
    total++;
    console.log("Test 1 : Première requête (pas d'ETag client)");
    const res1 = await makeRequest("/resource");
    console.log(`  Status: ${res1.status} — ETag: ${res1.headers.etag}`);
    if (res1.status === 200) {
      console.log("  ✅ Première requête → 200");
      passed++;
    } else {
      console.log("  ❌ Attendu 200");
    }

    // Test 2 : Requête avec bon ETag → 304
    total++;
    console.log("\nTest 2 : Requête avec If-None-Match (même ETag)");
    const res2 = await makeRequest("/resource", {
      "If-None-Match": res1.headers.etag as string,
    });
    console.log(`  Status: ${res2.status} — Body length: ${res2.body.length}`);
    if (res2.status === 304) {
      console.log("  ✅ ETag match → 304");
      passed++;
    } else {
      console.log("  ❌ Attendu 304");
    }

    // Test 3 : 304 n'a pas de corps
    total++;
    if (res2.body.length === 0) {
      console.log("  ✅ Pas de corps dans le 304");
      passed++;
    } else {
      console.log("  ❌ Le 304 ne devrait pas avoir de corps");
    }

    // Test 4 : Requête avec mauvais ETag → 200
    total++;
    console.log("\nTest 3 : Requête avec mauvais ETag");
    const res3 = await makeRequest("/resource", {
      "If-None-Match": '"mauvais-etag"',
    });
    console.log(`  Status: ${res3.status}`);
    if (res3.status === 200) {
      console.log("  ✅ Mauvais ETag → 200");
      passed++;
    } else {
      console.log("  ❌ Attendu 200");
    }

    // Test 5 : If-Modified-Since avec date future → 304
    total++;
    console.log("\nTest 4 : Requête avec If-Modified-Since (date future)");
    const res4 = await makeRequest("/resource", {
      "If-Modified-Since": new Date("2025-12-01T00:00:00Z").toUTCString(),
    });
    console.log(`  Status: ${res4.status}`);
    if (res4.status === 304) {
      console.log("  ✅ Pas modifié depuis → 304");
      passed++;
    } else {
      console.log("  ❌ Attendu 304");
    }

    // Test 6 : If-Modified-Since avec date passée → 200
    total++;
    console.log("\nTest 5 : Requête avec If-Modified-Since (date passée)");
    const res5 = await makeRequest("/resource", {
      "If-Modified-Since": new Date("2020-01-01T00:00:00Z").toUTCString(),
    });
    console.log(`  Status: ${res5.status}`);
    if (res5.status === 200) {
      console.log("  ✅ Modifié depuis → 200");
      passed++;
    } else {
      console.log("  ❌ Attendu 200");
    }

    console.log(`\n📊 Résultat : ${passed}/${total} tests passés`);
    if (passed === total) {
      console.log("✅ Tous les tests passent !");
    }
  } finally {
    server.close();
    console.log("\n🛑 Serveur arrêté.");
  }

  console.log("\n=== Fin du Lab 04 ===");
});
