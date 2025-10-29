// src/drone_map_worker.js
// Bygg drone map m(g) enligt Section 2: för par av rutor,
// konvexhölje(hörnen) -> alla rutor vars cellpolygon skär höljet ackumulerar pop_i*pop_j.

importScripts('https://unpkg.com/@turf/turf@6/turf.min.js');

self.onmessage = function (e) {
    const {
  cells, idByRC, lats, lons, polys,
  mode = "sample",
  samplePairs = 20000,
  allowedIds = null,        // lista över mål-celler som får ackumuleras
  restrictTargets = false   // om true: ackumulera ENDAST på allowedIds
} = e.data;



  // Bygg sampelpool – prioritera rutor med befolkning
const pool = cells.filter(c => c.pop > 0);
const sample = pool.length ? pool : cells;

const nEff = sample.length;
const m = new Float64Array(polys.length); // m(g)
  const allowedSet = allowedIds ? new Set(allowedIds) : null;
  const targetAllowed = restrictTargets && allowedSet;



  // Cachea cellpolygoner som Turf-Features för snabb bool-intersect
  const polyCache = new Array(polys.length);
  for (let i = 0; i < polys.length; i++) {
    const g = polys[i];
    if (!g) continue;
    if (g.type === 'Polygon') {
      polyCache[i] = turf.polygon(g.coordinates);
    } else if (g.type === 'MultiPolygon') {
      polyCache[i] = turf.multiPolygon(g.coordinates);
    }
  }

  // --- LiU-meta för normalisering: ΣD i fönstret och l (m) ---
let sumDWindow = 0;
for (const c of cells) sumDWindow += (c.pop || 0);

let lMeters = 100; // fallback ≈ 100 m
try {
  // Ta första cell-id som har en polygon i cache
  const first = cells.find(c => polyCache[c.id]);
  if (first) {
    const a = turf.area(polyCache[first.id]); // m^2
    if (a > 0) lMeters = Math.sqrt(a);       // ~sidelängd
  }
} catch (_) {}


  // Hjälp: extrahera samtliga hörn (points) från en cellpolygon
  function cornersOf(geom) {
    const pts = [];
    if (!geom) return pts;
    if (geom.type === 'Polygon') {
      for (const ring of geom.coordinates) {
        for (const [lon, lat] of ring) pts.push(turf.point([lon, lat]));
      }
    } else if (geom.type === 'MultiPolygon') {
      for (const poly of geom.coordinates) {
        for (const ring of poly) {
          for (const [lon, lat] of ring) pts.push(turf.point([lon, lat]));
        }
      }
    }
    return pts;
  }

  // Snabb indexering: hitta rad/kolumn-intervall som täcker en bbox
  // lats/lons är sorterade; vi räknar med att cellcentra ligger på dessa värden.
  function idxRange(sortedArr, minVal, maxVal) {
    // enkel linjär sökning är ok (gridar <~ tiotusental); byt till binär vid behov
    let lo = 0, hi = sortedArr.length - 1;
    while (lo <= hi && sortedArr[lo] < minVal) lo++;
    while (hi >= lo && sortedArr[hi] > maxVal) hi--;
    if (lo > hi) return null;
    return [lo, hi];
  }

    // --- Bresenham på grid (r,c) -> lista av pixlar på linjen ---
  function bresenham(r0, c0, r1, c1) {
    const pts = [];
    let x0 = c0, y0 = r0, x1 = c1, y1 = r1;
    const dx = Math.abs(x1 - x0), dy = Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1;
    const sy = y0 < y1 ? 1 : -1;
    let err = dx - dy;

    while (true) {
      pts.push([y0, x0]); // [r,c]
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * err;
      if (e2 > -dy) { err -= dy; x0 += sx; }
      if (e2 <  dx) { err += dx; y0 += sy; }
    }
    return pts;
  }


  // --- 20x20 coarse grid binning över finrutorna ---
function buildCoarseBins(cells, polys, lats, lons, R = 20, C = 20) {
  const binsN = R * C;
  const members = Array.from({ length: binsN }, () => []);
  const popSum  = new Float64Array(binsN);
  const hulls   = new Array(binsN).fill(null);

  const rows = lats.length;
  const cols = lons.length;

  function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }

  // 1) mappa finrutor → grovbin, summera population
  for (const cell of cells) {
    const br = clamp(Math.floor((cell.r * R) / rows), 0, R - 1);
    const bc = clamp(Math.floor((cell.c * C) / cols), 0, C - 1);
    const idx = br * C + bc;
    members[idx].push(cell.id);
    popSum[idx] += (cell.pop || 0);
  }

  // 2) bygg ett hull per grovbin via hörnpunkter för medlemmarnas polygoner
  for (let idx = 0; idx < binsN; idx++) {
    if (!members[idx].length) continue;
    const pts = [];
    for (const id of members[idx]) pts.push(...cornersOf(polys[id]));
    if (pts.length < 3) continue;
    const hull = turf.convex(turf.featureCollection(pts));
    if (hull) hulls[idx] = hull;
  }

  // 3) endast bins med >0 population och giltigt hull deltar
  const valid = [];
  for (let i = 0; i < binsN; i++) {
    if (popSum[i] > 0 && hulls[i]) valid.push(i);
  }

  return { R, C, members, popSum, hulls, valid };
}


  function addPair(a, b) {
  const w = a.pop * b.pop;
  if (w === 0) return;

  // Konvexhölje av hörnpunkter från de två cellerna
  const pts = cornersOf(polys[a.id]).concat(cornersOf(polys[b.id]));
  if (pts.length < 3) return;
  const hull = turf.convex(turf.featureCollection(pts));
  if (!hull) return; // om punkterna redan ligger i en linje etc.

  // Begränsa kandidater med hullens bbox → (r,c)-intervall
  const [minX, minY, maxX, maxY] = turf.bbox(hull); // [minLon, minLat, maxLon, maxLat]
  const rRange = idxRange(lats, minY, maxY);
  const cRange = idxRange(lons, minX, maxX);
  if (!rRange || !cRange) return;

  const [r0, r1] = rRange;
  const [c0, c1] = cRange;

  // Guard: undvik patologiskt stora kandidatfönster (snabbare test)
  const candidateCells = (r1 - r0 + 1) * (c1 - c0 + 1);
  if (!isFinite(candidateCells) || candidateCells <= 0) return;
  if (candidateCells > 50000) return;

  // Testa endast celler i bboxen; ackumulera om skärning
  for (let r = r0; r <= r1; r++) {
    for (let c = c0; c <= c1; c++) {
      const id = idByRC[r + '|' + c];
      if (id === undefined) continue;
      const cellPoly = polyCache[id];
      if (!cellPoly) continue;

      const cellBbox = turf.bbox(cellPoly);
      const bboxHit = !(cellBbox[0] > maxX || cellBbox[2] < minX || cellBbox[1] > maxY || cellBbox[3] < minY);
      if (!bboxHit) continue;

      if (turf.booleanIntersects(hull, cellPoly)) {
                  if (targetAllowed && !allowedSet.has(id)) continue;

        m[id] += w;
      }
    }
  }
}
if (mode === "liu-window") {
  // Fönstergränser (valfritt – endast logg)
  const win = e.data.windowRC || null;
  let r0, r1, c0, c1;
  if (win) { ({ r0, r1, c0, c1 } = win); }

  const n = cells.length;
  const totalPairs = n * (n - 1) / 2;
  let done = 0;
  const logEvery = Math.max(1, Math.floor(totalPairs / 100));

  // Viktigt: addPair() använder convex hull och respekterar targetAllowed/allowedSet.
  for (let ai = 0; ai < n; ai++) {
    const a = cells[ai];
    for (let bi = ai + 1; bi < n; bi++) {
      const b = cells[bi];
      addPair(a, b);
      done++;
      if (done % logEvery === 0) {
        self.postMessage({ type: "progress", done, total: totalPairs, pct: Math.round((done / totalPairs) * 100) });
      }
    }
  }

  self.postMessage({ type: "progress", done: totalPairs, total: totalPairs, pct: 100 });
  self.postMessage({
    type: "result",
    mValues: Array.from(m),
    meta: { sumDWindow, lMeters }
  });
}
 else if (mode && mode.startsWith("coarse")) {

  // Ex: "coarse50" -> 50×50, fallback 20
  const n = Math.max(2, parseInt(mode.slice(6), 10) || 20);

  const bins = buildCoarseBins(cells, polys, lats, lons, n, n);
  const K = bins.valid.length;
  const totalPairs = (K * (K - 1)) / 2;
  let done = 0;

  // logga ungefär varje procent
  const logEvery = Math.max(1, Math.floor(totalPairs / 100));

  for (let ai = 0; ai < K; ai++) {
    const i = bins.valid[ai];
    const hullI = bins.hulls[i];
    if (!hullI) continue;

    for (let bj = ai + 1; bj < K; bj++) {
      const j = bins.valid[bj];
      const hullJ = bins.hulls[j];
      if (!hullJ) { done++; continue; }

      // konvexhölje av de två grovbinen
      const pts = cornersOf(hullI.geometry).concat(cornersOf(hullJ.geometry));
      if (pts.length < 3) { done++; continue; }
      const hull = turf.convex(turf.featureCollection(pts));
      if (!hull) { done++; continue; }

      const [minX, minY, maxX, maxY] = turf.bbox(hull);
      const rRange = idxRange(lats, minY, maxY);
      const cRange = idxRange(lons, minX, maxX);
      if (!rRange || !cRange) { done++; continue; }
      const [r0, r1] = rRange;
      const [c0, c1] = cRange;

      const w = bins.popSum[i] * bins.popSum[j];
      if (!(w > 0)) { done++; continue; }

      for (let r = r0; r <= r1; r++) {
        for (let c = c0; c <= c1; c++) {
          const id = idByRC[r + '|' + c];
          if (id === undefined) continue;
          const cellPoly = polyCache[id];
          if (!cellPoly) continue;

          const cellBbox = turf.bbox(cellPoly);
          const bboxHit = !(cellBbox[0] > maxX || cellBbox[2] < minX || cellBbox[1] > maxY || cellBbox[3] < minY);
          if (!bboxHit) continue;

          if (turf.booleanIntersects(hull, cellPoly)) {
                      if (targetAllowed && !allowedSet.has(id)) continue;

            m[id] += w;
          }
        }
      }

      done++;
      if (done % logEvery === 0) {
        self.postMessage({ type: "progress", done, total: totalPairs, pct: Math.round((done / totalPairs) * 100) });
      }
    }
  }

  // sista progress + resultat
  self.postMessage({ type: "progress", done: totalPairs, total: totalPairs, pct: 100 });
self.postMessage({
  type: "result",
  mValues: Array.from(m),
  meta: { sumDWindow, lMeters }
});


} else if (mode === "sample") {
  // (din befintliga sampling-loop – behåll oförändrad)
  for (let s = 0; s < samplePairs; s++) {
    if (s % 25 === 0) self.postMessage({ type: "progress", done: s, total: samplePairs });
    const i = (Math.random() * nEff) | 0;
    let j = (Math.random() * nEff) | 0;
    if (j === i) j = (j + 1) % nEff;
    const a = sample[i], b = sample[j];
    addPair(a, b);
  }
 
self.postMessage({
  type: "result",
  mValues: Array.from(m),
  meta: { sumDWindow, lMeters }
});

} else {
  // FULL: alla par inom filtret
  const totalPairs = (nEff * (nEff - 1)) / 2;
  let done = 0;
  const every = Math.max(1, Math.floor(totalPairs / 100));

  for (let i = 0; i < nEff; i++) {
    const a = sample[i];
    for (let j = i + 1; j < nEff; j++) {
      addPair(a, sample[j]);
      done++;
      if (done % every === 0) {
        self.postMessage({ type: "progress", done, total: totalPairs, pct: Math.round((done/totalPairs)*100) });
      }
    }
  }
  self.postMessage({ type: "progress", done: totalPairs, total: totalPairs, pct: 100 });
self.postMessage({
  type: "result",
  mValues: Array.from(m),
  meta: { sumDWindow, lMeters }
});
}





};
