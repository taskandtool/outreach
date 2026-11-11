// Guarantees as a reader meets them. A record keeps every sentence with its evidence; a page shows one per kind.
import type { Evidence } from "./data";

const title = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** One card per kind of guarantee: a company's several sentences about labor are one labor guarantee with lines. */
export type GuaranteeGroup = { kind: string; name: string; length: string | null; lines: string[]; terms: Evidence | null };
export function mergeGuarantees<T extends { kind: string; promise?: string | null; length: string | null; covers: string | null; conditions: string | null } & Evidence>(list: T[]): GuaranteeGroup[] {
  const groups = new Map<string, T[]>();
  for (const g of list) {
    const key = g.kind === "other" ? `other:${g.promise ?? g.covers}` : g.kind;
    groups.set(key, [...(groups.get(key) ?? []), g]);
  }
  return [...groups.values()].map((items) => {
    const short = (g: T) => (g.length && g.length.length <= 24 ? g.length : null);
    const lone = items.length === 1;
    // A promise is written to be read; `covers` is a note about the evidence, used only where there is no promise.
    const lines = items.map((g) => title(g.promise ?? (lone ? (g.covers ?? "") : [short(g), g.covers].filter(Boolean).join(": ")))).filter(Boolean);
    const kind = items[0].kind;
    return {
      kind,
      name: kind === "other" ? title(items[0].promise ?? items[0].covers ?? "Their promise") : `${title(kind)} guarantee`,
      length: lone && !items[0].promise ? short(items[0]) : null,
      lines: kind === "other" && lone ? [] : [...new Set(lines)],
      terms: items.find((g) => g.conditions) ?? null,
    };
  });
}
