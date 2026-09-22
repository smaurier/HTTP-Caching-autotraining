// summaryCache.ts — PAGE BLANCHE. Une stratégie de cache HTTP complète pour l'endpoint
// "résumé de famille" de TribuZen : Cache-Control (fraîcheur), ETag (revalidation),
// If-None-Match (requête conditionnelle), et un store partagé (en vrai : Redis et/ou un
// edge CDN — ici une Map en mémoire, le CONTRAT HTTP est identique quel que soit l'endroit
// où le store vit réellement). Mesuré avant/après : le nombre d'appels au calcul coûteux
// prouve que le cache sert vraiment, pas juste que les en-têtes sont "jolis".
//
// export interface CacheEntry { etag: string; body: string; expiresAt: number }
//
// export class SummaryCache
//   get(key: string): CacheEntry | undefined
//   set(key: string, entry: CacheEntry): void
//
// export interface HttpResponse { status: number; headers: Record<string, string>; body?: string }
//
// export function handleGetFamilySummary(
//   familyId: string,
//   ifNoneMatch: string | undefined,
//   cache: SummaryCache,
//   now: () => number,
// ): HttpResponse
//
//   Règles (dans cet ordre) :
//   1. Si une entrée FRAÎCHE existe dans le cache (`now() < entry.expiresAt`) :
//      a. Si `ifNoneMatch === entry.etag` : renvoie `{ status: 304, headers: { ETag,
//         "Cache-Control": "max-age=60" }, }` — PAS de `body` (une 304 n'en a jamais).
//      b. Sinon : renvoie `{ status: 200, headers: { ETag, "Cache-Control": "max-age=60" },
//         body: entry.body }` — servi depuis le cache, SANS recalculer.
//   2. Sinon (rien en cache, ou périmé) : appelle `computeExpensiveSummary(familyId)` (donné
//      ci-dessous, incrémente un compteur — c'est ce que l'oracle observe), calcule un ETag
//      fort (hash du contenu, `node:crypto`), stocke l'entrée avec `expiresAt = now() +
//      60_000`, et renvoie `{ status: 200, headers: {...}, body }`.
import { createHash } from "node:crypto";

export interface CacheEntry {
  etag: string;
  body: string;
  expiresAt: number;
}

export interface HttpResponse {
  status: number;
  headers: Record<string, string>;
  body?: string;
}

export class SummaryCache {
  private readonly store = new Map<string, CacheEntry>();

  get(key: string): CacheEntry | undefined {
    return this.store.get(key);
  }

  set(key: string, entry: CacheEntry): void {
    this.store.set(key, entry);
  }
}

let expensiveCallCount = 0;
export function resetExpensiveCallCount(): void {
  expensiveCallCount = 0;
}
export function getExpensiveCallCount(): number {
  return expensiveCallCount;
}

export function computeExpensiveSummary(familyId: string): string {
  expensiveCallCount++;
  return JSON.stringify({ familyId, memberCount: 4 });
}

export function etagOf(body: string): string {
  return `"${createHash("sha256").update(body).digest("hex").slice(0, 16)}"`;
}

export function handleGetFamilySummary(
  _familyId: string,
  _ifNoneMatch: string | undefined,
  _cache: SummaryCache,
  _now: () => number,
): HttpResponse {
  throw new Error("handleGetFamilySummary n'est pas encore implémenté");
}
