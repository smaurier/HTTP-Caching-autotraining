// =============================================================================
// Lab 04 — ETag & Requêtes Conditionnelles — WALKTHROUGH
// =============================================================================
// Ce fichier est un walkthrough pas à pas de l'implémentation complète.
// Exécuter avec : npx tsx walkthrough.ts
// Chaque étape est isolée et testée indépendamment.
// =============================================================================

import type { IncomingMessage, ServerResponse } from "node:http";
import { createServer, request as httpRequest } from "node:http";
import { createHash } from "node:crypto";

console.log("=== Lab 04 : Walkthrough pas à pas ===\n");

// =============================================================================
// ÉTAPE 1 : Comprendre le hachage cryptographique
// =============================================================================
// Un hash transforme un contenu de taille variable en une empreinte de taille
// fixe. C'est la base des ETags : si le contenu change, le hash change.

console.log("--- Étape 1 : Hachage SHA-256 ---\n");

// Démonstration : même entrée = même sortie (déterministe)
const hash1: string = createHash("sha256").update("Hello").digest("hex");
const hash2: string = createHash("sha256").update("Hello").digest("hex");
const hash3: string = createHash("sha256").update("Hello!").digest("hex");

console.log(`"Hello"  → ${hash1}`);
console.log(`"Hello"  → ${hash2}`);
console.log(`"Hello!" → ${hash3}`);
console.log(`\nMême entrée, même hash ? ${hash1 === hash2 ? "✅ Oui" : "❌ Non"}`);
console.log(`Entrée différente, hash différent ? ${hash1 !== hash3 ? "✅ Oui" : "❌ Non"}`);

// Point clé : le hash SHA-256 fait 64 caractères hexadécimaux (256 bits).
// Pour un ETag, on tronque à 16 caractères (64 bits) pour la lisibilité.
console.log(`\nHash complet (64 chars) : ${hash1}`);
console.log(`Hash tronqué (16 chars): ${hash1.slice(0, 16)}`);

// =============================================================================
// ÉTAPE 2 : Construire une fonction ETag
// =============================================================================
// Un ETag HTTP DOIT être entre guillemets (RFC 7232).
// Format ETag fort  : "abcdef1234567890"
// Format ETag faible: W/"abcdef1234567890"

console.log("\n--- Étape 2 : Fonction generateETag ---\n");

function generateETag(content: string): string {
  // Étape 2a : Calculer le hash du contenu
  const hash: string = createHash("sha256").update(content).digest("hex").slice(0, 16);

  // Étape 2b : Entourer de guillemets (obligatoire selon la RFC)
  return `"${hash}"`;
}

function generateWeakETag(content: string): string {
  // Même hash, mais préfixé par W/ pour indiquer un ETag faible
  const hash: string = createHash("sha256").update(content).digest("hex").slice(0, 16);
  return `W/"${hash}"`;
}

const etag: string = generateETag("Mon contenu");
const weakEtag: string = generateWeakETag("Mon contenu");
console.log(`ETag fort   : ${etag}`);
console.log(`ETag faible : ${weakEtag}`);
console.log(`\nDifférence :`);
console.log(`  Fort  → Comparaison octet par octet (pour HTTP Range requests)`);
console.log(`  Faible → Comparaison sémantique (suffisant pour le cache)\n`);

// =============================================================================
// ÉTAPE 3 : Le flux de requête conditionnelle
// =============================================================================
// Voici comment fonctionne le flux complet :
//
// PREMIÈRE REQUÊTE (pas d'ETag côté client) :
//   Client → GET /resource
//   Serveur → 200 OK + ETag: "abc123" + Body
//   Le client stocke l'ETag.
//
// REQUÊTES SUIVANTES (le client a un ETag) :
//   Client → GET /resource + If-None-Match: "abc123"
//   Serveur compare "abc123" avec l'ETag actuel du contenu.
//     Si identique → 304 Not Modified (pas de body !)
//     Si différent → 200 OK + nouveau ETag + Body

console.log("--- Étape 3 : Flux de requête conditionnelle ---\n");
console.log("Première requête :");
console.log("  Client  → GET /resource");
console.log("  Serveur → 200 OK, ETag: \"abc123\", Body: ...\n");
console.log("Deuxième requête :");
console.log('  Client  → GET /resource, If-None-Match: "abc123"');
console.log("  Serveur → 304 Not Modified (pas de body !)\n");
console.log("Après modification du contenu :");
console.log('  Client  → GET /resource, If-None-Match: "abc123"');
console.log("  Serveur → 200 OK, ETag: \"def456\", Body: nouveau contenu\n");

// =============================================================================
// ÉTAPE 4 : Implémentation du serveur
// =============================================================================

console.log("--- Étape 4 : Serveur avec ETag et Last-Modified ---\n");

let serverContent: string = "Contenu initial de la ressource.";
let serverLastModified: Date = new Date("2025-01-15T10:00:00Z");

const PORT: number = 3099;

const server = createServer((req: IncomingMessage, res: ServerResponse) => {
  // Étape 4a : Calculer l'ETag du contenu actuel
  const currentEtag: string = generateETag(serverContent);
  const lastModified: string = serverLastModified.toUTCString();

  console.log(`  📨 ${req.method} ${req.url}`);

  // Étape 4b : Vérifier If-None-Match (ETag)
  // PRIORITAIRE sur If-Modified-Since selon la RFC
  const clientEtag: string | undefined = req.headers["if-none-match"];
  if (clientEtag) {
    // Le client peut envoyer plusieurs ETags : "abc", "def"
    const etags: string[] = clientEtag.split(",").map((e) => e.trim());
    if (etags.includes(currentEtag) || etags.includes("*")) {
      console.log(`  → 304 (ETag match: ${currentEtag})`);
      res.writeHead(304, { ETag: currentEtag, "Last-Modified": lastModified });
      res.end();
      return;
    }
  }

  // Étape 4c : Vérifier If-Modified-Since (date)
  // Seulement si If-None-Match n'était PAS présent
  const ifModifiedSince: string | undefined = req.headers["if-modified-since"];
  if (!clientEtag && ifModifiedSince) {
    const clientTime: number = new Date(ifModifiedSince).getTime();
    const serverTime: number = serverLastModified.getTime();
    if (serverTime <= clientTime) {
      console.log(`  → 304 (Last-Modified match)`);
      res.writeHead(304, { ETag: currentEtag, "Last-Modified": lastModified });
      res.end();
      return;
    }
  }

  // Étape 4d : Réponse complète 200
  console.log(`  → 200 (ETag: ${currentEtag})`);
  res.writeHead(200, {
    "Content-Type": "text/plain; charset=utf-8",
    "Cache-Control": "no-cache",
    ETag: currentEtag,
    "Last-Modified": lastModified,
  });
  res.end(serverContent);
});

// =============================================================================
// ÉTAPE 5 : Tests automatisés du serveur
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
        res.on("end", () =>
          resolve({ status: res.statusCode, headers: res.headers, body })
        );
      }
    );
    req.on("error", reject);
    req.end();
  });
}

server.listen(PORT, async () => {
  console.log(`Serveur de test sur le port ${PORT}\n`);
  console.log("--- Étape 5 : Tests automatisés ---\n");

  let passed: number = 0;
  let total: number = 0;

  // Test A : Première requête → 200 avec ETag
  total++;
  console.log("Test A : Première requête (aucun header conditionnel)");
  const resA = await makeRequest("/data");
  console.log(`  Résultat: ${resA.status}, ETag: ${resA.headers.etag}`);
  if (resA.status === 200 && resA.headers.etag) {
    console.log("  ✅ 200 + ETag reçu");
    passed++;
  } else {
    console.log("  ❌ Échec");
  }

  // Test B : Requête conditionnelle avec bon ETag → 304
  total++;
  console.log("\nTest B : If-None-Match avec le bon ETag");
  const resB = await makeRequest("/data", {
    "If-None-Match": resA.headers.etag as string,
  });
  console.log(`  Résultat: ${resB.status}, Body: "${resB.body}"`);
  if (resB.status === 304 && resB.body === "") {
    console.log("  ✅ 304 sans body");
    passed++;
  } else {
    console.log("  ❌ Échec");
  }

  // Test C : Modification du contenu → nouvel ETag → 200
  total++;
  console.log("\nTest C : Contenu modifié, ancien ETag → 200");
  const oldEtag: string | undefined = resA.headers.etag;
  serverContent = "Contenu MODIFIÉ de la ressource !";
  serverLastModified = new Date();
  const resC = await makeRequest("/data", { "If-None-Match": oldEtag as string });
  console.log(`  Résultat: ${resC.status}, Nouveau ETag: ${resC.headers.etag}`);
  if (resC.status === 200 && resC.headers.etag !== oldEtag) {
    console.log("  ✅ 200 avec nouvel ETag");
    passed++;
  } else {
    console.log("  ❌ Échec");
  }

  // Test D : If-Modified-Since avec date future → 304
  total++;
  console.log("\nTest D : If-Modified-Since avec date future");
  const resD = await makeRequest("/data", {
    "If-Modified-Since": new Date("2099-01-01").toUTCString(),
  });
  console.log(`  Résultat: ${resD.status}`);
  if (resD.status === 304) {
    console.log("  ✅ 304 (pas modifié depuis cette date)");
    passed++;
  } else {
    console.log("  ❌ Échec");
  }

  // Test E : If-Modified-Since avec date passée → 200
  total++;
  console.log("\nTest E : If-Modified-Since avec date passée");
  const resE = await makeRequest("/data", {
    "If-Modified-Since": new Date("2000-01-01").toUTCString(),
  });
  console.log(`  Résultat: ${resE.status}`);
  if (resE.status === 200) {
    console.log("  ✅ 200 (modifié depuis cette date)");
    passed++;
  } else {
    console.log("  ❌ Échec");
  }

  console.log(`\n📊 Résultat : ${passed}/${total} tests passés`);
  if (passed === total) {
    console.log("✅ Walkthrough complet — tous les tests passent !");
  }

  server.close();
  console.log("\n🛑 Serveur arrêté.");
  console.log("\n=== Fin du Walkthrough Lab 04 ===");
});
