// =============================================================================
// Lab 02 — HTTP/2 Multiplexing (vrai HTTP/2) — SOLUTION
// =============================================================================
// Exécuter avec : npx tsx solution.ts
// =============================================================================

import type { IncomingMessage, ServerResponse } from "node:http";
import { createServer as createHttpServer, request as httpRequest } from "node:http";
import type { ServerHttp2Stream, IncomingHttpHeaders as H2IncomingHeaders } from "node:http2";
import { createServer as createH2Server, connect as h2Connect, constants } from "node:http2";

console.log("=== Lab 02 : HTTP/2 Multiplexing (vrai HTTP/2) — SOLUTION ===\n");

const HTTP1_PORT: number = 3010;
const H2_PORT: number = 3011;
const RESOURCE_COUNT: number = 10;
const SIMULATED_LATENCY_MS: number = 100;

// =============================================================================
// PARTIE 1 : Créer les serveurs HTTP/1.1 et HTTP/2 servant 10 ressources
// =============================================================================
// POURQUOI deux serveurs ? Pour comparer le vrai comportement de HTTP/1.1
// (une requête à la fois par connexion TCP, head-of-line blocking) avec le
// vrai HTTP/2 (multiplexage de plusieurs streams sur une seule connexion TCP).
//
// POURQUOI http2.createServer() sans TLS ? C'est le mode "h2c" (HTTP/2
// cleartext). En production, HTTP/2 nécessite TLS (h2), mais pour ce lab
// on évite la complexité des certificats. Node.js supporte h2c nativement.
// =============================================================================

/**
 * Gère une requête pour une ressource numérotée.
 * POURQUOI setTimeout ? Pour simuler le temps de traitement réel d'une
 * ressource (lecture disque, requête BDD, etc.). C'est pendant cette
 * attente que la différence HTTP/1.1 vs HTTP/2 se manifeste.
 */
function handleResourceRequest(
  url: string,
  respond: (status: number, headers: Record<string, string>, body: string) => void
): void {
  const match = url.match(/^\/resource\/(\d+)$/);
  if (!match) {
    respond(404, { "content-type": "text/plain; charset=utf-8" }, "Ressource non trouvée");
    return;
  }
  const resourceId: number = parseInt(match[1], 10);
  setTimeout(() => {
    respond(200, {
      "content-type": "text/plain; charset=utf-8",
      "x-resource-id": String(resourceId),
    }, `Contenu de la ressource ${resourceId}`);
  }, SIMULATED_LATENCY_MS);
}

// --- Serveur HTTP/1.1 ---
// POURQUOI un serveur HTTP/1.1 classique ? C'est notre baseline. Chaque
// connexion TCP ne transporte qu'une requête à la fois. Pour le client
// séquentiel, cela signifie : attendre la réponse avant d'envoyer la suivante.
const http1Server = createHttpServer((req: IncomingMessage, res: ServerResponse) => {
  handleResourceRequest(req.url ?? "", (status: number, headers: Record<string, string>, body: string) => {
    res.writeHead(status, headers);
    res.end(body);
  });
});

// --- Serveur HTTP/2 (h2c — cleartext, sans TLS) ---
// POURQUOI onStream et pas onRequest ? En HTTP/2, chaque requête arrive
// comme un "stream" avec un identifiant unique. Le serveur reçoit les
// headers via l'événement 'stream'. Plusieurs streams peuvent être actifs
// simultanément sur la même connexion TCP — c'est le multiplexage.
const h2Server = createH2Server();

h2Server.on("stream", (stream: ServerHttp2Stream, headers: H2IncomingHeaders) => {
  const path: string = (headers[constants.HTTP2_HEADER_PATH] as string) ?? "";
  const streamId: number = stream.id;

  // POURQUOI afficher le stream ID ? Pour prouver que les requêtes arrivent
  // sur des streams différents d'une même connexion. En HTTP/2, les stream
  // IDs sont des entiers impairs croissants (1, 3, 5, 7...) initiés par le client.
  console.log(`  [H2 serveur] Stream #${streamId} → ${path}`);

  handleResourceRequest(path, (status: number, headers: Record<string, string>, body: string) => {
    stream.respond({ ":status": status, ...headers });
    stream.end(body);
  });
});

// =============================================================================
// PARTIE 2 : Client HTTP/1.1 — Chargement séquentiel
// =============================================================================
// POURQUOI séquentiel ? Pour reproduire le comportement réel de HTTP/1.1 avec
// une seule connexion TCP. Chaque requête doit attendre la fin de la précédente
// (head-of-line blocking). Le temps total = N × latence_par_requête.
// =============================================================================

/**
 * Fait une requête HTTP/1.1 GET et retourne le corps de la réponse.
 * POURQUOI encapsuler dans une Promise ? L'API http.request de Node.js est
 * callback-based. La Promise nous permet d'utiliser async/await.
 */
function http1Fetch(path: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const req = httpRequest(
      { hostname: "localhost", port: HTTP1_PORT, path, method: "GET" },
      (res) => {
        let body = "";
        res.on("data", (chunk: Buffer) => { body += chunk; });
        res.on("end", () => resolve(body));
      }
    );
    req.on("error", reject);
    req.end();
  });
}

/**
 * Charge les 10 ressources séquentiellement via HTTP/1.1.
 * POURQUOI for avec await ? Chaque requête doit se terminer avant que
 * la suivante ne commence. C'est exactement le comportement de HTTP/1.1
 * sur une seule connexion TCP (head-of-line blocking).
 */
async function loadHttp1Sequential(): Promise<number> {
  console.log("📦 Chargement SÉQUENTIEL via HTTP/1.1...\n");
  const start: number = performance.now();

  for (let i = 0; i < RESOURCE_COUNT; i++) {
    const reqStart: number = performance.now();
    const content: string = await http1Fetch(`/resource/${i}`);
    const reqTime: number = performance.now() - reqStart;
    console.log(`  ✅ Resource ${i} : ${reqTime.toFixed(0)}ms — "${content}"`);
  }

  const totalTime: number = performance.now() - start;
  console.log(`\n⏱️  Temps total HTTP/1.1 séquentiel : ${totalTime.toFixed(0)}ms\n`);
  return totalTime;
}

// =============================================================================
// PARTIE 3 : Client HTTP/2 — Chargement multiplexé (vrai multiplexage)
// =============================================================================
// POURQUOI http2.connect() ? Cette API crée UNE SEULE connexion TCP vers le
// serveur HTTP/2, puis permet d'ouvrir plusieurs streams en parallèle sur
// cette même connexion. C'est le vrai multiplexage HTTP/2.
//
// POURQUOI c'est différent de Promise.all avec HTTP/1.1 ?
// - HTTP/1.1 + Promise.all = Node ouvre PLUSIEURS connexions TCP (une par requête).
//   C'est du parallélisme de connexions, pas du multiplexage.
// - HTTP/2 + streams = UNE SEULE connexion TCP, plusieurs flux logiques dessus.
//   C'est le vrai multiplexage, plus efficace car il évite le coût d'établissement
//   de multiples connexions TCP (et TLS en production).
// =============================================================================

/**
 * Fait une requête HTTP/2 sur une session existante.
 * POURQUOI réutiliser la session ? C'est justement le point clé du multiplexage.
 * Toutes les requêtes passent par la même connexion TCP. Chaque appel à
 * session.request() crée un nouveau stream avec son propre ID.
 */
function h2Fetch(session: import("node:http2").ClientHttp2Session, path: string): Promise<{ body: string; streamId: number }> {
  return new Promise((resolve, reject) => {
    // POURQUOI session.request() ? Cela crée un nouveau stream HTTP/2 sur
    // la connexion existante. Le stream est identifié par un ID unique
    // (entiers impairs : 1, 3, 5, ...). Le serveur traite les streams
    // en parallèle — aucun ne bloque les autres.
    const stream = session.request({ [constants.HTTP2_HEADER_PATH]: path });
    const streamId: number = stream.id;

    let body = "";
    stream.setEncoding("utf8");
    stream.on("data", (chunk: string) => { body += chunk; });
    stream.on("end", () => resolve({ body, streamId }));
    stream.on("error", reject);
    stream.end();
  });
}

/**
 * Charge les 10 ressources via HTTP/2 multiplexé sur UNE SEULE connexion.
 * POURQUOI une seule session ? C'est la force de HTTP/2 : une seule connexion
 * TCP suffit. Les 10 requêtes sont envoyées quasi simultanément comme des
 * streams indépendants. Le serveur les traite en parallèle et renvoie les
 * réponses dès qu'elles sont prêtes, sur la même connexion.
 */
async function loadHttp2Multiplexed(): Promise<number> {
  console.log("🚀 Chargement MULTIPLEXÉ via HTTP/2 (une seule connexion TCP)...\n");

  // POURQUOI h2Connect retourne une session ? La session représente UNE
  // connexion TCP persistante vers le serveur. Tous les streams (requêtes)
  // passent par cette connexion unique.
  const session = h2Connect(`http://localhost:${H2_PORT}`);

  // Attendre que la session soit connectée
  await new Promise<void>((resolve, reject) => {
    session.on("connect", resolve);
    session.on("error", reject);
  });

  const start: number = performance.now();

  // POURQUOI Promise.all ici ? On lance les 10 requêtes simultanément.
  // Contrairement à HTTP/1.1 où Promise.all ouvrirait 10 connexions TCP,
  // ici les 10 requêtes passent par la MÊME connexion TCP en tant que
  // streams HTTP/2 distincts. C'est le vrai multiplexage.
  const promises = Array.from({ length: RESOURCE_COUNT }, (_, i) => {
    const reqStart: number = performance.now();
    return h2Fetch(session, `/resource/${i}`).then(({ body, streamId }) => {
      const reqTime: number = performance.now() - reqStart;
      console.log(`  ✅ Resource ${i} (stream #${streamId}) : ${reqTime.toFixed(0)}ms — "${body}"`);
      return body;
    });
  });

  await Promise.all(promises);

  const totalTime: number = performance.now() - start;
  console.log(`\n⏱️  Temps total HTTP/2 multiplexé : ${totalTime.toFixed(0)}ms\n`);

  // POURQUOI fermer la session ? Pour libérer la connexion TCP proprement.
  // En production, on garderait la session ouverte pour réutilisation.
  session.close();
  return totalTime;
}

// =============================================================================
// Exécution des tests
// =============================================================================

// POURQUOI démarrer les deux serveurs avant les tests ? On a besoin que les
// deux serveurs écoutent pour pouvoir comparer les performances.
http1Server.listen(HTTP1_PORT, () => {
  console.log(`✅ Serveur HTTP/1.1 démarré sur http://localhost:${HTTP1_PORT}`);

  h2Server.listen(H2_PORT, async () => {
    console.log(`✅ Serveur HTTP/2 (h2c) démarré sur http://localhost:${H2_PORT}\n`);

    try {
      const seqTime: number = await loadHttp1Sequential();
      const h2Time: number = await loadHttp2Multiplexed();

      // POURQUOI comparer ? Pour rendre tangible le gain du multiplexage.
      // En théorie : HTTP/1.1 séquentiel = 10 × 100ms = ~1000ms,
      // HTTP/2 multiplexé = ~100ms (toutes les requêtes en parallèle).
      console.log("=== Comparaison ===");
      console.log(`HTTP/1.1 séquentiel : ${seqTime.toFixed(0)}ms`);
      console.log(`HTTP/2 multiplexé   : ${h2Time.toFixed(0)}ms`);
      console.log(`Gain                : ${((1 - h2Time / seqTime) * 100).toFixed(0)}%`);
      console.log(`Facteur             : ${(seqTime / h2Time).toFixed(1)}x plus rapide\n`);

      if (h2Time < seqTime / 2) {
        console.log("✅ Le multiplexage HTTP/2 est significativement plus rapide !");
        console.log("   Toutes les requêtes ont été envoyées sur UNE SEULE connexion TCP.");
      } else {
        console.log("❌ Le gain n'est pas assez significatif, vérifiez l'implémentation.");
      }

      // POURQUOI cette note pédagogique ? Pour souligner la différence
      // fondamentale entre le vrai multiplexage HTTP/2 et le contournement
      // classique de HTTP/1.1 (ouvrir plusieurs connexions TCP).
      console.log("\n📝 Observations clés :");
      console.log("   1. HTTP/2 utilise UNE SEULE connexion TCP (pas 10 !)");
      console.log("   2. Chaque requête a son propre stream ID (1, 3, 5, 7...)");
      console.log("   3. Les streams sont traités en parallèle sans head-of-line blocking");
      console.log("   4. En HTTP/1.1, le navigateur contourne cela en ouvrant ~6 connexions TCP");
      console.log("   5. HTTP/2 élimine ce besoin grâce au multiplexage natif");
    } finally {
      http1Server.close();
      h2Server.close();
      console.log("\n🛑 Serveurs arrêtés.");
    }

    console.log("\n=== Fin du Lab 02 ===");
  });
});
