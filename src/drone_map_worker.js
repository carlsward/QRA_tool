// src/drone_map_worker.js
// Bygg drone map m(g) enligt Section 2: för par av rutor,
// konvexhölje(hörnen) -> alla rutor vars cellpolygon skär höljet ackumulerar pop_i*pop_j.

importScripts('https://unpkg.com/@turf/turf@6/turf.min.js');

self.onmessage = function (e) {
  const {
    cells,         // [{ id, r, c, pop }]
    idByRC,        // { "r|c": id }
    lats, lons,    // sorterade unika lat/lon-index för gridrader/kolumner
    polys,         // Array där polys[id] = GeoJSON Polygon/MultiPolygon (samma ordning som population.features)
    mode = "sample",
    samplePairs = 20000
  } = e.data;

  // Bygg sampelpool – prioritera rutor med befolkning
const pool = cells.filter(c => c.pop > 0);
const sample = pool.length ? pool : cells;

const nEff = sample.length;
const m = new Float64Array(polys.length); // m(g)


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
        m[id] += w;
      }
    }
  }
}


  if (mode === "sample") {
  for (let s = 0; s < samplePairs; s++) {
    // Rapportera progress INNAN den tunga addPair, så man ser att loopen lever
    if (s % 25 === 0) self.postMessage({ type: "progress", done: s, total: samplePairs });

 const i = (Math.random() * nEff) | 0;
let j = (Math.random() * nEff) | 0;
if (j === i) j = (j + 1) % nEff;
const a = sample[i], b = sample[j];

    addPair(a, b);
  }
} else {
  const totalPairs = (nEff * (nEff - 1)) / 2;
let done = 0;
for (let i = 0; i < nEff; i++) {
  const a = sample[i];
  for (let j = i + 1; j < nEff; j++) {
    addPair(a, sample[j]);
  }
  done += (nEff - i - 1);
  if ((i & 0x1f) === 0) self.postMessage({ type: "progress", done, total: totalPairs });
}

}


  self.postMessage({ type: "result", mValues: Array.from(m) });
};
