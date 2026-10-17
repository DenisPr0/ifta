// Construiește granițele statelor SUA pentru calculul IFTA, din datele publice US Census (TIGER).
// Ieșire: out/us-states.json — un GeoJSON simplificat, mic, cu codul fiecărui stat (TX, OK, …)
// și poligoanele lui. Simplificarea păstrează precizia la ~300 m, suficientă pentru IFTA la mile.
// Rulare: node scripts/build-states.mjs out
import { mkdirSync, writeFileSync } from 'node:fs';

const OUT = process.argv[2] || 'out';
// US Census cartographic boundary, 1:5,000,000 (cel mai mic util), GeoJSON deja proiectat în lat/lon.
const SRC = 'https://raw.githubusercontent.com/PublicaMundi/MappingAPI/master/data/geojson/us-states.json';
// Rezervă (acoperă toate cele 50 de state + DC), tot GeoJSON public.
const SRC_FALLBACK = 'https://raw.githubusercontent.com/python-visualization/folium/main/examples/data/us-states.json';

// Nume stat → cod de 2 litere (IFTA jurisdiction code pentru SUA)
const NAME_TO_CODE = {
  'Alabama':'AL','Alaska':'AK','Arizona':'AZ','Arkansas':'AR','California':'CA','Colorado':'CO',
  'Connecticut':'CT','Delaware':'DE','District of Columbia':'DC','Florida':'FL','Georgia':'GA',
  'Hawaii':'HI','Idaho':'ID','Illinois':'IL','Indiana':'IN','Iowa':'IA','Kansas':'KS','Kentucky':'KY',
  'Louisiana':'LA','Maine':'ME','Maryland':'MD','Massachusetts':'MA','Michigan':'MI','Minnesota':'MN',
  'Mississippi':'MS','Missouri':'MO','Montana':'MT','Nebraska':'NE','Nevada':'NV','New Hampshire':'NH',
  'New Jersey':'NJ','New Mexico':'NM','New York':'NY','North Carolina':'NC','North Dakota':'ND',
  'Ohio':'OH','Oklahoma':'OK','Oregon':'OR','Pennsylvania':'PA','Rhode Island':'RI','South Carolina':'SC',
  'South Dakota':'SD','Tennessee':'TN','Texas':'TX','Utah':'UT','Vermont':'VT','Virginia':'VA',
  'Washington':'WA','West Virginia':'WV','Wisconsin':'WI','Wyoming':'WY','Puerto Rico':'PR'
};

async function getJSON(url) {
  const r = await fetch(url, { signal: AbortSignal.timeout(60000) });
  if (!r.ok) throw new Error('HTTP ' + r.status + ' ' + url);
  return r.json();
}

// Douglas–Peucker pe un inel de coordonate [lng,lat], toleranță în GRADE.
function simplifyRing(ring, tol) {
  const n = ring.length;
  if (n < 5) return ring;
  const keep = new Uint8Array(n); keep[0] = 1; keep[n - 1] = 1;
  const stack = [[0, n - 1]];
  const segDist = (p, a, b) => {
    const ax = a[0], ay = a[1], bx = b[0], by = b[1];
    const dx = bx - ax, dy = by - ay; const L2 = dx * dx + dy * dy;
    let t = L2 > 0 ? ((p[0] - ax) * dx + (p[1] - ay) * dy) / L2 : 0;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const qx = ax + t * dx, qy = ay + t * dy;
    return Math.hypot(p[0] - qx, p[1] - qy);
  };
  while (stack.length) {
    const [s, e] = stack.pop();
    let maxD = -1, idx = -1;
    for (let i = s + 1; i < e; i++) { const d = segDist(ring[i], ring[s], ring[e]); if (d > maxD) { maxD = d; idx = i; } }
    if (maxD > tol) { keep[idx] = 1; stack.push([s, idx], [idx, e]); }
  }
  const out = [];
  for (let i = 0; i < n; i++) if (keep[i]) out.push([+ring[i][0].toFixed(4), +ring[i][1].toFixed(4)]);
  if (out.length < 4) return ring.map((c) => [+c[0].toFixed(4), +c[1].toFixed(4)]);
  return out;
}

function simplifyGeom(geom, tol) {
  if (geom.type === 'Polygon') return { type: 'Polygon', coordinates: geom.coordinates.map((r) => simplifyRing(r, tol)) };
  if (geom.type === 'MultiPolygon') return { type: 'MultiPolygon', coordinates: geom.coordinates.map((poly) => poly.map((r) => simplifyRing(r, tol))) };
  return geom;
}

function bbox(geom) {
  let s = 90, w = 180, n = -90, e = -180;
  const scan = (ring) => { for (const [lng, lat] of ring) { if (lat < s) s = lat; if (lat > n) n = lat; if (lng < w) w = lng; if (lng > e) e = lng; } };
  if (geom.type === 'Polygon') geom.coordinates.forEach(scan);
  else if (geom.type === 'MultiPolygon') geom.coordinates.forEach((p) => p.forEach(scan));
  return [+s.toFixed(4), +w.toFixed(4), +n.toFixed(4), +e.toFixed(4)];
}

async function main() {
  let src;
  try { src = await getJSON(SRC); } catch (e) { console.warn('sursa 1 a esuat (' + e.message + '), incerc rezerva'); src = await getJSON(SRC_FALLBACK); }
  if (!src || !Array.isArray(src.features)) throw new Error('GeoJSON invalid');

  const TOL = 0.003; // ~300 m
  const features = [];
  for (const f of src.features) {
    const p = f.properties || {};
    const name = p.name || p.NAME || p.STATE_NAME || '';
    const code = NAME_TO_CODE[name];
    if (!code) { console.warn('stat necunoscut, sarit:', name); continue; }
    const geom = simplifyGeom(f.geometry, TOL);
    features.push({ type: 'Feature', properties: { code, name, bbox: bbox(geom) }, geometry: geom });
  }
  features.sort((a, b) => a.properties.code.localeCompare(b.properties.code));
  if (features.length < 48) throw new Error('prea putine state: ' + features.length);

  const fc = { type: 'FeatureCollection', generated: new Date().toISOString(), count: features.length, features };
  const json = JSON.stringify(fc);
  mkdirSync(OUT, { recursive: true });
  writeFileSync(`${OUT}/us-states.json`, json);
  writeFileSync(`${OUT}/meta.json`, JSON.stringify({ updated: fc.generated, states: features.length, bytes: json.length, codes: features.map((f) => f.properties.code) }, null, 2) + '\n');
  console.log(`Scris ${OUT}/us-states.json — ${features.length} state, ${(json.length / 1024).toFixed(0)} KB`);
}
main().catch((e) => { console.error(e.message || e); process.exit(1); });
