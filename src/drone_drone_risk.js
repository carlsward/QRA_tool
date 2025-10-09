// MVP för Drone–Drone risk: Poisson-yttäthet λ (UAV/km²) + NMAC-korridor.
// Kalibreras senare mot er metod; funkar som "beta".

export function droneRiskConstantDensity(routeLine, nmacM, otherUavDensityPerKm2, uavSpeedKmh, relSpeedFactor = 1.2) {
  const corridor = turf.buffer(routeLine, nmacM, { units: 'meters' });
  const areaCorrKm2 = turf.area(corridor) / 1e6;

  const lambda = Math.max(0, Number(otherUavDensityPerKm2) || 0); // UAV/km²
  const Vrel = (uavSpeedKmh / 3.6) * relSpeedFactor;              // m/s
  const R = Math.max(1, Number(nmacM) || 1);                      // m

  // Enkel dimensionsrimlig rate (kan bytas ut när PDF:en kommer):
  const encountersPerSec = lambda * areaCorrKm2 * (Vrel / (2 * R));
  const nmacPerHour = encountersPerSec * 3600;

  const routeM = turf.length(routeLine, { units: 'kilometers' }) * 1000;
  const missionHours = routeM > 0 ? (routeM / (uavSpeedKmh * 1000 / 3600)) : 0;

  return {
    corridor,
    nmacPerHour,
    nmacPer1MHours: nmacPerHour * 1e6,
    nmacMission: nmacPerHour * missionHours
  };
}
