// summaryCache.ts — SOLUTION DE RÉFÉRENCE (commentée). Ne l'ouvre pas avant ton GREEN.
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
  familyId: string,
  ifNoneMatch: string | undefined,
  cache: SummaryCache,
  now: () => number,
): HttpResponse {
  const entree = cache.get(familyId);

  if (entree && now() < entree.expiresAt) {
    if (ifNoneMatch === entree.etag) {
      return { status: 304, headers: { ETag: entree.etag, "Cache-Control": "max-age=60" } };
    }
    return {
      status: 200,
      headers: { ETag: entree.etag, "Cache-Control": "max-age=60" },
      body: entree.body,
    };
  }

  const body = computeExpensiveSummary(familyId);
  const etag = etagOf(body);
  cache.set(familyId, { etag, body, expiresAt: now() + 60_000 });

  return { status: 200, headers: { ETag: etag, "Cache-Control": "max-age=60" }, body };
}
