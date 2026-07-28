import type { Pt } from '../data/types';

export const shoelaceArea = (poly: Pt[]) => {
  let a = 0;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    a += poly[j].x * poly[i].y - poly[i].x * poly[j].y;
  }
  return Math.abs(a) / 2;
};

export const polygonCentroid = (poly: Pt[]): Pt => {
  let cx = 0;
  let cy = 0;
  let a = 0;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const f = poly[j].x * poly[i].y - poly[i].x * poly[j].y;
    a += f;
    cx += (poly[j].x + poly[i].x) * f;
    cy += (poly[j].y + poly[i].y) * f;
  }
  a *= 0.5;
  if (Math.abs(a) < 1e-9) return { x: poly[0].x, y: poly[0].y };
  return { x: cx / (6 * a), y: cy / (6 * a) };
};

export const pointInPolygon = (p: Pt, poly: Pt[]) => {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i].x;
    const yi = poly[i].y;
    const xj = poly[j].x;
    const yj = poly[j].y;
    const hit = yi > p.y !== yj > p.y && p.x < ((xj - xi) * (p.y - yi)) / (yj - yi) + xi;
    if (hit) inside = !inside;
  }
  return inside;
};

export const dist = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y);

export const polygonPath = (poly: Pt[], project: (p: Pt) => Pt) =>
  poly
    .map((p, i) => {
      const q = project(p);
      return `${i === 0 ? 'M' : 'L'}${q.x.toFixed(1)} ${q.y.toFixed(1)}`;
    })
    .join(' ') + ' Z';

/** Metres -> WGS84, good enough at ranch scale for a readable coordinate readout. */
export const toLatLon = (
  p: Pt,
  origin: { lat: number; lon: number },
  mPerDegLat: number,
  mPerDegLon: number,
) => ({
  lat: origin.lat + (p.y === 0 ? 0 : -p.y / mPerDegLat),
  lon: origin.lon + p.x / mPerDegLon,
});

/** The inverse, so a coordinate typed into the spreadsheet lands back on the map. */
export const fromLatLon = (
  ll: { lat: number; lon: number },
  origin: { lat: number; lon: number },
  mPerDegLat: number,
  mPerDegLon: number,
): Pt => ({
  x: (ll.lon - origin.lon) * mPerDegLon,
  y: -(ll.lat - origin.lat) * mPerDegLat,
});

export const formatLatLon = (ll: { lat: number; lon: number }) =>
  `${ll.lat.toFixed(4)}°N  ${ll.lon.toFixed(4)}°E`;
