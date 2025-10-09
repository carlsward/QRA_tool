// Area-baserad ground risk via korridor (buffer) + RBush-index.
// Använder globalt 'turf' och 'RBush' (laddas via CDN i index.html).

export function buildPopulationIndex(populationFc) {
  const tree = new RBush();
  const items = populationFc.features.map((f, i) => {
    const bb = turf.bbox(f);
    const Ai = turf.area(f);
    return { minX: bb[0], minY: bb[1], maxX: bb[2], maxY: bb[3], f, Ai, i };
  });
  tree.load(items);
  return { tree, items };
}

export function groundFromCorridor(routeLine, altitudeM, popIndex) {
  const corridor = turf.buffer(routeLine, altitudeM, { units: 'meters' });
  const bbox = turf.bbox(corridor);
  const cand = popIndex.tree.search({ minX: bbox[0], minY: bbox[1], maxX: bbox[2], maxY: bbox[3] });

  let exposed = 0, affectedArea = 0, maxDensity = 0;

  for (const it of cand) {
    const cell = it.f;
    if (!turf.booleanIntersects(cell, corridor)) continue;
    const isec = turf.intersect(cell, corridor);
    if (!isec) continue;

    const ai = turf.area(isec); // m²
    if (ai <= 0) continue;

    const Bi = Number(cell.properties?.B || 0);
    const Ei = Bi * (ai / it.Ai); // persons exposed in this cell

    exposed += Ei;
    affectedArea += ai;
    maxDensity = Math.max(maxDensity, Ei / ai); // ppl/m²
  }

  const L = turf.length(routeLine, { units: 'kilometers' }) * 1000; // m
  const linearDensity = L ? exposed / L : 0;
  const avgDensity = affectedArea ? exposed / affectedArea : 0;

  return { corridor, exposed, affectedArea, linearDensity, avgDensity, maxDensity };
}
