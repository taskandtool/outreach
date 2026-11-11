// Areas: Overture's division polygons as a hierarchy, each company placed by a
// point-in-polygon check, and what a site says it serves matched to them.
import { readFileSync, existsSync } from "node:fs";
import { at, slugify } from "./lib.mjs";

const RANK = { region: 0, county: 1, locality: 2, neighborhood: 3 };

function bboxOf(geometry) {
  let [w, s, e, n] = [Infinity, Infinity, -Infinity, -Infinity];
  const polygons = geometry.type === "Polygon" ? [geometry.coordinates] : geometry.coordinates;
  for (const poly of polygons)
    for (const [x, y] of poly[0]) {
      if (x < w) w = x;
      if (x > e) e = x;
      if (y < s) s = y;
      if (y > n) n = y;
    }
  return [w, s, e, n];
}

function inRing(x, y, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function inGeometry(lng, lat, geometry) {
  const polygons = geometry.type === "Polygon" ? [geometry.coordinates] : geometry.coordinates;
  return polygons.some(([outer, ...holes]) => inRing(lng, lat, outer) && !holes.some((h) => inRing(lng, lat, h)));
}

/** Overture's divisions in the US as areas; one with no boundary here is simply absent. */
export function loadAreas() {
  const file = at("raw", "overture", "division_area.geojson");
  if (!existsSync(file)) return [];
  const byKey = new Map();
  for (const f of JSON.parse(readFileSync(file, "utf8")).features) {
    const p = f.properties;
    const name = p.names?.primary;
    const rank = RANK[p.subtype];
    if (!name || rank == null || !["Polygon", "MultiPolygon"].includes(f.geometry?.type)) continue;
    if (p.class === "maritime") continue;
    const state = (p.region ?? "").split("-")[1]?.toLowerCase() ?? "";
    const key = `${p.subtype}:${state}:${name}`;
    if (byKey.has(key)) continue;
    byKey.set(key, { name, kind: p.subtype, rank, state, slug: rank === 0 ? state : slugify(name), path: rank === 0 ? `/areas/${state}` : `/areas/${state}/${slugify(name)}`, geometry: f.geometry, bbox: bboxOf(f.geometry) });
  }
  // A city and a neighborhood can share a name, and an address: the larger keeps it.
  const paths = new Set();
  return [...byKey.values()]
    .filter((x) => x.state)
    .sort((x, y) => x.rank - y.rank || x.name.localeCompare(y.name))
    .filter((x) => !paths.has(x.path) && paths.add(x.path));
}

/** The areas a point falls in, largest first. */
export function areasAt(areas, lat, lng) {
  if (lat == null || lng == null) return [];
  return areas.filter((x) => lng >= x.bbox[0] && lng <= x.bbox[2] && lat >= x.bbox[1] && lat <= x.bbox[3] && inGeometry(lng, lat, x.geometry));
}

/** "Round Rock" or "Williamson County" to an area, or null: a name we hold no boundary for stays plain text. */
export function areaNamed(areas, name) {
  const key = slugify(name.replace(/,.*$/, "").replace(/\s+[A-Z]{2}$/, ""));
  return areas.find((x) => x.rank >= 1 && (x.slug === key || x.slug === `${key}-county`)) ?? null;
}
