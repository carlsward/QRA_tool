/**
Copyright (C) 2023 hahas94

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU General Public License as published by
the Free Software Foundation, either version 3 of the License, or
(at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
GNU General Public License for more details.

You should have received a copy of the GNU General Public License
along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/

/**
* File contains classes related to visualizations on the screen.
*/

let polyclip = window['polyclip-ts'];

import * as Objects from './objects.js';
import * as Helpers from './helpers.js';

let dataUrls = {
    "nk_area": "./data/population_nk_fixed3.geojson",
    "stockholm_area": "./data/population_stockholm.geojson",
    "ockero_area": "./data/population_ockero.geojson",
    "vastervik_area": "./data/population_vastervik.geojson"
}

let dataViews = {
    "nk_area": [58.5877, 16.1924],
    "stockholm_area": [59.3118, 18.0663],
    "ockero_area": [57.71, 11.65],
    "vastervik_area": [57.75, 16.63],
}

let dataZoomLevels = {
    "nk_area": 12,
    "stockholm_area": 11,
    "ockero_area": 12,
    "vastervik_area": 12,
}

let workersUrl = './src/workers.js';
let droneMapWorkerUrl = './src/drone_map_worker.js';


// Names of the map layers
const Layers = {
    Ground: "Ground risk",
    Air: "Air risk",
    Drone: "Drone (beta)" // NEW
}

/**
* Class Visualization
*   It is responsible for creating and updating a map,
*   implements methods for interacting with the map, adding
*   objects to it and updates statistics shown on the webpage.
*/

class Visualization {
     /*-------Instance variables-------*/

    #rectangleWidth;
    #nodesList;
    #edgesList;
    #nodesGeoJsonLayersList;
    #edgesGeoJsonLayersList;
    #map;
    #groundBuffersUnion;
    #groundBuffersUnionGeoJSON;
    #groundBuffersUnionGeoJsonLayers;
    #airBuffersUnion;
    #airBuffersUnionGeoJSON;
    #airBuffersUnionGeoJsonLayers;
    #totalNMAC_rate;
    #totalExpectedNMAC;
    #totalMissionDuration;
    #NMAC_radius;
    #segmentExtensionLength;
    #v_UA;
    #sumDTotal;
    #lMeters;
    #lambdaBarValues; 
    #sumDWindow;
     // Float64 per ruta (λ̄(g))  ← NYTT



    #populationElement;
    #lengthElement;
    #areaElement;
    #exposedDensityElement;
    #exposedLengthWeight;
    #NMAC_rateElement;
    #totalsTableElement;
    #segmentsTableElement;
    #segmentsExtensionCheckbox;
    #spinnerContainer;
    #NMAC_Slider;
    #speedSlider;
    #extensionSlider;
    #globalAltitudeSlider;
    #Nslider; // N (operations during T)
    #paxSlider;
    #paxCount;
    #droneMapValues;          // Float64 per ruta (m(g))
    #droneMapGeoJSONLayer;    // Leaflet-lager för att visa m(g)
    #droneMapMean;



    #population;
    #timeoutId;
    #ongoingComputation;
    #useRTree;
    #rtreeData;

    #selectedArea;
    #dataUrl;

    // NEW: current mode (false = vanlig Air-risk mot GA, true = Drone–Drone)
    #droneMode;
   


    constructor(selected_area) {
        this.#selectedArea = selected_area;
        this.#dataUrl = dataUrls[selected_area] ?? dataUrls["nk_area"];
        console.log(this.#dataUrl);

        this.#rectangleWidth = 200;
        this.#nodesList = [];
        this.#edgesList = [];
        this.#nodesGeoJsonLayersList = L.layerGroup([]);
        this.#edgesGeoJsonLayersList = L.layerGroup([]);
        this.#groundBuffersUnion = null;
        this.#groundBuffersUnionGeoJSON = null;
        this.#groundBuffersUnionGeoJsonLayers = L.layerGroup([]);
        this.#airBuffersUnion = null;
        this.#airBuffersUnionGeoJSON = null;
        this.#airBuffersUnionGeoJsonLayers = L.layerGroup([]);
        this.#totalNMAC_rate = 0;
        this.#totalExpectedNMAC = 0;
        this.#totalMissionDuration = 0;
        this.#NMAC_radius = 300;
        this.#segmentExtensionLength = 100;
        this.#v_UA = 8.34;  // m/s
        this.#droneMode = false; // default = Air risk

        this.#paxCount = 1; // default: 1 passagerare (exponerar parametern utan antaganden)

        
        this.#populationElement = document.getElementById("population");
        this.#lengthElement = document.getElementById("length");
        this.#areaElement = document.getElementById("area");
        this.#exposedDensityElement = document.getElementById("exposed-density");
        this.#exposedLengthWeight = document.getElementById("exposed-length-weight");
        this.#NMAC_rateElement = document.getElementById("nmac-rate");
        this.#totalsTableElement = document.getElementById("totals-table");
        this.#segmentsTableElement = document.getElementById("segments-table");
        this.#segmentsExtensionCheckbox = document.getElementById("segment-extension");
        this.#spinnerContainer = document.getElementById('spinner-container');

        this.#population = null;  // population data in geojson format.
        this.#timeoutId = null;  // used for debouncing method call
        this.#ongoingComputation = 0;
        this.#useRTree = true;
        this.#rtreeData = null;

        // setting current year at footer
        document.getElementById("currentYear").textContent = new Date().getFullYear();

        // running initialization methods
        this.#initializeData();
        this.#initializeMap();
        this.#initTooltips();
        this.#initializeNMAC_slider();
        this.#initializeEdgeExtensionSlider();
        this.#initializeUavSpeedSlider();
        this.#initializeGlobalAltitudeSlider();
        this.#initializeNSlider(); // NEW: N (operations during T)
        this.#initializeSegmentExtensionCheckbox();
        this.#computeTotalStatistics();
        this.#initializePaxSlider();


    }

    /* ---------- Methods - private ---------- */

    #getDataUrlByAreaName(area_name) {}

    async #initializeData() {
        let promise = new Promise((resolve, reject) => {
           $.getJSON(this.#dataUrl, function(data, status) {
                if (status === 'success') {
                    resolve(data);
                } else {
                    reject(new Error('Failed to load population data'));
                }
           })
        });

        try {
          this.#population = await promise; 
        } catch (error) {
          console.error('Error fetching data:', error);
        }

        if (this.#useRTree) {
            try {
              this.#rtreeData = Helpers.createRTree(this.#population['features']);
            } catch (error) {
              console.error('Error creating R-Tree of the data:', error);
            }
        }
                // Global summa av D (B) över hela domänen L – används för LiU-normalisering
        try {
            this.#sumDTotal = (this.#population?.features || [])
                .reduce((acc, f) => acc + (f.properties?.B || 0), 0);
        } catch (e) {
            this.#sumDTotal = 0;
            console.warn('Failed to compute sumDTotal:', e);
        }

    }


    #prepareGridIndexFromPopulation() {
  const feats = this.#population.features;

  // 1) Centroid för varje ruta
  const cents = feats.map((f, idx) => {
    const c = turf.centroid(f).geometry.coordinates; // [lon, lat]
    return { idx, lon: c[0], lat: c[1], pop: f.properties.B || 0 };
  });

  // 2) Diskretisera till rader/kolumner via unika lat/lon
  const round = (x) => +x.toFixed(6);
  const uniq = (arr) => Array.from(new Set(arr.map(round))).sort((a,b)=>a-b);

  const lons = uniq(cents.map(o => o.lon));
  const lats = uniq(cents.map(o => o.lat));
  const lon2c = new Map(lons.map((x,i)=>[x,i]));
  const lat2r = new Map(lats.map((x,i)=>[x,i]));

  // 3) Cell-objekt + lookup tabell
  const cells = cents.map(o => {
    const r = lat2r.get(round(o.lat));
    const c = lon2c.get(round(o.lon));
    return { id: o.idx, r, c, pop: o.pop };
  });

  const idByRC = {};
  for (const cell of cells) idByRC[`${cell.r}|${cell.c}`] = cell.id;

  // 4) Geometrier i samma indexordning som features
  const polys = feats.map(f => f.geometry);
// DEBUG: hur ser "griden" ut?
window.__gridInfo = { 
  nFeatures: feats.length, 
  nRows: lats.length, 
  nCols: lons.length 
};
console.log('[Grid]', 'features=', feats.length, 'rows=', lats.length, 'cols=', lons.length);

  return { cells, idByRC, lats, lons, polys };

  
}

#windowIdsByRadiusKm(km = 3) {
  // Hämta centrum och skapa en cirkel (WGS84)
  const ctr = this.#map.getCenter(); // {lat, lng}
  const circle = turf.circle([ctr.lng, ctr.lat], km, { units: 'kilometers', steps: 64 });

  const ids = [];
  // Gå igenom alla features och ta med de vars centroid hamnar i cirkeln
  for (let i = 0; i < this.#population.features.length; i++) {
    const feat = this.#population.features[i];
    const c = turf.centroid(feat).geometry.coordinates; // [lon, lat]
    const inside = turf.booleanPointInPolygon(turf.point(c), circle);
    if (inside) ids.push(i);
  }

  // Debug så vi ser att urvalet inte är tomt
  console.log('[DroneMap][demo] radius km =', km, 'picked ids =', ids.length);
  return ids;
}


#windowIdsAroundCenter(lats, lons, idByRC, H = 10, W = 10) {
  const ctr = this.#map.getCenter(); // {lat, lng}

  // hitta närmaste rad/kolumn till centrum
  let rC = 0, cC = 0, dR = Infinity, dC = Infinity;
  for (let r = 0; r < lats.length; r++) {
    const d = Math.abs(lats[r] - ctr.lat);
    if (d < dR) { dR = d; rC = r; }
  }
  for (let c = 0; c < lons.length; c++) {
    const d = Math.abs(lons[c] - ctr.lng);
    if (d < dC) { dC = d; cC = c; }
  }

  // bygg fönstrets rader/kolumner (klamra inom grid)
  const rHalf = Math.floor(H/2), cHalf = Math.floor(W/2);
  const r0 = Math.max(0, rC - rHalf), r1 = Math.min(lats.length - 1, rC + rHalf);
  const c0 = Math.max(0, cC - cHalf), c1 = Math.min(lons.length - 1, cC + cHalf);

  const ids = [];
  for (let r = r0; r <= r1; r++) {
    for (let c = c0; c <= c1; c++) {
      const id = idByRC[r + '|' + c];
      if (id !== undefined) ids.push(id);
    }
  }
  return ids; // lista av cell-id:n i fönstret
}


#demoBBoxKm(km = 6) {
  if (!this.#map) return null;
  const c = this.#map.getCenter(); // {lat, lng}
  const circle = turf.circle([c.lng, c.lat], km, { units: 'kilometers', steps: 64 });
  return turf.bbox(circle); // [minX, minY, maxX, maxY]
}

#nearestIndex(sorted, value) {
  // sorted stigande, returnera index för närmast värde
  let bestI = 0, bestD = Infinity;
  for (let i = 0; i < sorted.length; i++) {
    const d = Math.abs(sorted[i] - value);
    if (d < bestD) { bestD = d; bestI = i; }
  }
  return bestI;
}



#buildDroneMap(mode = "sample") {
  if (!this.#population) { console.warn('Population not loaded yet'); return; }

  const { cells, idByRC, lats, lons, polys } = this.#prepareGridIndexFromPopulation();

  const opts = arguments[1] || {};
  const size = (mode === "liu-window") ? (opts.size || 10) : null;

  function countCellsInWindow(cells, r0, r1, c0, c1) {
    let k = 0;
    for (const c of cells) if (c.r >= r0 && c.r <= r1 && c.c >= c0 && c.c <= c1) k++;
    return k;
  }
  function pickDensestAround(cells, lats, lons, size, rRef, cRef, radius = 80) {
    const half = Math.floor(size / 2);
    let best = null, bestCnt = -1;
    for (let dr = -radius; dr <= radius; dr++) {
      for (let dc = -radius; dc <= radius; dc++) {
        const rC = Math.max(0, Math.min(lats.length - 1, rRef + dr));
        const cC = Math.max(0, Math.min(lons.length - 1, cRef + dc));
        let r0 = Math.max(0, rC - half), r1 = Math.min(lats.length - 1, rC + half);
        let c0 = Math.max(0, cC - half), c1 = Math.min(lons.length - 1, cC + half);
        const cnt = countCellsInWindow(cells, r0, r1, c0, c1);
        if (cnt > bestCnt) { bestCnt = cnt; best = { r0, r1, c0, c1, cnt }; }
      }
    }
    return best;
  }

// --- Bygg LiU-fönster (K närmaste celler kring centrum) ---
let filteredCells = cells;

if (mode === "liu-window") {
  const want = (opts.size || 10) * (opts.size || 10); // t.ex. 10x10 = 100
  const center = this.#map.getCenter(); // { lat, lng }

  // Avstånd i lat/lon-rum (räcker för urvalet); mappa cell -> (d², pop)
  const ranked = cells.map(c => {
    const lat = lats[c.r], lon = lons[c.c];
    const d2 = (lat - center.lat) * (lat - center.lat) + (lon - center.lng) * (lon - center.lng);
    return { cell: c, d2, pop: c.pop || 0 };
  });

  // Prioritera befolkade celler runt centrum
  ranked.sort((a, b) => {
    if ((b.pop > 0) !== (a.pop > 0)) return (b.pop > 0) ? 1 : -1; // pop>0 först
    return a.d2 - b.d2;
  });

  filteredCells = ranked.slice(0, want).map(x => x.cell);

  console.log('[DroneMap] liu-window (convex hull, nearest K)', {
    size: opts.size || 10,
    cellsInWindow: filteredCells.length
  });
}


  if (this.#ongoingComputation < 1) this.#showSpinner();
  this.#ongoingComputation++;

  // mål-pixlar (g) som får ackumuleras
  let allowedIds = null;
if (mode === "liu-window") {
  allowedIds = filteredCells.map(c => c.id);
}


  const worker = new Worker(droneMapWorkerUrl);
  worker.postMessage({
    cells: filteredCells,
    idByRC, lats, lons, polys,
    mode: "liu-window",
windowRC: null,                 // ej rektangel – vi skickar bara K celler
restrictTargets: true,          // ackumulera endast på våra valda celler
allowedIds,

    samplePairs: 0
  });
  console.log('[DroneMap] posting to worker:', mode, filteredCells.length, 'cells');

  worker.onmessage = (ev) => {
    const msg = ev.data;
    if (msg.type === 'progress') {
      const pct = (typeof msg.pct === 'number') ? msg.pct : Math.round((msg.done / (msg.total || 1)) * 100);
      console.log(`Drone map: ${msg.done}/${msg.total} (${pct}%)`);
      return;
    }
    if (msg.type === 'result') {
      this.#droneMapValues = msg.mValues;
      

      const meta = msg.meta || {};
      this.#lMeters = meta.lMeters || this.#lMeters || 100;
      this.#sumDWindow  = meta.sumDWindow || this.#sumDWindow || 1;  // ← NY


      const N = this.getN();
      const v = this.#v_UA;
      const l = meta.lMeters || 100;
      const T = 12 * 3600;
      const sumD = meta.sumDWindow || 1;
      const factor = (l / v) / (T * sumD * sumD);
      const lambdaBar = this.#droneMapValues.map(m_i => N * m_i * factor);
      this.#lambdaBarValues = lambdaBar;   // ← spara λ̄(g) för risk-beräkningen


      const styled = JSON.parse(JSON.stringify(this.#population));
      for (let i = 0; i < styled.features.length; i++) {
        styled.features[i].properties.m_raw  = this.#droneMapValues[i] || 0;
        styled.features[i].properties.lambda = lambdaBar[i] || 0;
      }

      const vals = lambdaBar.filter(v => v > 0).sort((a,b) => a - b);
      const mean = vals.length ? vals.reduce((a,c)=>a+c,0)/vals.length : 0;
      const p95  = vals.length ? vals[Math.floor(vals.length*0.95)] : 0;
      this.#droneMapMean = mean;

      function heatColor(t) {
        const h = 15 + 45 * t;
        const lgt = 40 + 20 * t;
        return `hsl(${h}, 100%, ${lgt}%)`;
      }
      if (this.#droneMapGeoJSONLayer) this.#droneMapGeoJSONLayer.remove();
      this.#droneMapGeoJSONLayer = L.geoJSON(styled, {
        interactive: false,
        style: (f) => {
          const v = f.properties.lambda || 0;
          const denom = p95 > 0 ? p95 : (mean > 0 ? mean : 1);
          const norm = Math.min(1, v / denom);
          const alpha = norm > 0 ? (0.15 + 0.6 * Math.sqrt(norm)) : 0;
          return { fillColor: heatColor(norm), fillOpacity: alpha, stroke: false };
        }
      });
      if (this.#droneMode) this.#droneMapGeoJSONLayer.addTo(this.#map);

      console.log('[DroneMap][Etapp2]', { sumD, l, factor, cellsPos: vals.length, mean, p95 });

      if (this.#droneMode) this.#computeDroneRisk();
      this.#offerDroneMapDownload(styled);

      this.#ongoingComputation--;
      this.#computeTotalStatistics();
      this.#hideSpinner();
      worker.terminate();
    }
  };
  worker.onerror = (err) => { console.error('DroneMap worker error:', err.message || err); this.#ongoingComputation = 0; this.#hideSpinner(); worker.terminate(); };
  worker.onmessageerror = (err) => { console.error('DroneMap worker message error:', err); this.#ongoingComputation = 0; this.#hideSpinner(); worker.terminate(); };
}




#offerDroneMapDownload(geojson) {
  const a = document.getElementById('download-drone-map-link');
  if (!a) return;
  const blob = new Blob([JSON.stringify(geojson)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  a.href = url;
  a.download = 'drone_map.geojson';
  a.style.display = 'inline';
}




    /**
    * initializeMap method:
    *   Creates a Leaflet map with data from OpenStreetMap.
    *   Requires an html element with id `map` to exist.
    */
    async #initializeMap() {
        await this.#initializeData();

        let groundLayer = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
            maxZoom: 20,
            attribution: '&copy <a href="http://openstreetmap.org">OpenStreetMap</a> &copy; <a href="https://www.lantmateriet.se/en/">Lantmäteriet</a>'
        });

        let airLayer = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
            maxZoom: 20,
            attribution: '&copy <a href="http://openstreetmap.org">OpenStreetMap</a> &copy; <a href="https://www.lantmateriet.se/en/">Lantmäteriet</a>'
        });

        // NEW: Drone layer shares samma bakgrund som air/ground
        let droneLayer = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
            maxZoom: 20,
            attribution: '&copy <a href="http://openstreetmap.org">OpenStreetMap</a> &copy; <a href="https://www.lantmateriet.se/en/">Lantmäteriet</a>'
        });

        this.#map = L.map('map', {
            doubleClickZoom: false,
            preferCanvas: true,
            layers: [groundLayer]
        }).setView(dataViews[this.#selectedArea], dataZoomLevels[this.#selectedArea]);

        let layerControl = L.control.layers(
            { [Layers.Ground]: groundLayer, [Layers.Air]: airLayer, [Layers.Drone]: droneLayer },
            null,
            { collapsed: false }
        ).addTo(this.#map);

        let groundGeoJSONLayer = L.geoJSON(this.#population, {
  style: Helpers.groundStyling,
  interactive: false          // <— släpp igenom dubbelklick
}).addTo(this.#map);

let airGeoJSONLayer = L.geoJSON(this.#population, {
  style: Helpers.airStyling,
  interactive: false          // <— släpp igenom dubbelklick
});


        this.#groundBuffersUnionGeoJsonLayers.addTo(this.#map);
        this.#nodesGeoJsonLayersList.addTo(this.#map);
        this.#edgesGeoJsonLayersList.addTo(this.#map);
        
        // Add a listener to the 'baselayerchange' event
        this.#map.on('baselayerchange', function (e) {
  if (e.name === Layers.Ground) {
    this.#droneMode = false;
    if (this.#droneMapGeoJSONLayer) this.#droneMapGeoJSONLayer.remove();

    airGeoJSONLayer.remove();
    this.#airBuffersUnionGeoJsonLayers.remove();

    groundGeoJSONLayer.addTo(this.#map);
    this.#groundBuffersUnionGeoJsonLayers.addTo(this.#map);

  } else if (e.name === Layers.Air) {
    this.#droneMode = false;
    if (this.#droneMapGeoJSONLayer) this.#droneMapGeoJSONLayer.remove();

    groundGeoJSONLayer.remove();
    this.#groundBuffersUnionGeoJsonLayers.remove();

    airGeoJSONLayer.addTo(this.#map);
    this.#airBuffersUnionGeoJsonLayers.addTo(this.#map);

    this.#recomputeEdgesDebounced(this.#edgesList);

  } else if (e.name === Layers.Drone) {
  this.#droneMode = true;

  // Dölj båda choropleths
  groundGeoJSONLayer.remove();
  this.#groundBuffersUnionGeoJsonLayers.remove();
  airGeoJSONLayer.remove(); // <— viktigt: ta bort Air-choropleth

  // Visa gärna air-bufferkonturer (NMAC-korridorer)
  this.#airBuffersUnionGeoJsonLayers.addTo(this.#map);

  // Visa drone-map-overlay om den finns
  if (this.#droneMapGeoJSONLayer) this.#droneMapGeoJSONLayer.addTo(this.#map);

  this.#recomputeEdgesDebounced(this.#edgesList);
}

}.bind(this));


// DEMO: LiU-exakt 10×10 fönster (Bresenham, ordnade OD-par)
this.#buildDroneMap("liu-window", { size: 10 });
console.log('[DroneMap] requested mode = liu-window (10x10 demo)');





        this.#map.on('dblclick', this.#onMapDoubleClick.bind(this));
    }

    /**
    * deinitializeMap public method:
    *   Destroys the map so that the widget can be reinitialized.
    */
    deinitializeMap() {
        if(this.#map != undefined) {
            this.#map.remove();
        }
    }

    /**
    * initTooltips method:
    *   Initialize all tooltips so that they can be rendered on hover.
    */
    #initTooltips() {
        let tooltipTriggerList = [].slice.call(document.querySelectorAll('[data-bs-toggle="tooltip"]'))
        let tooltipList = tooltipTriggerList.map(function (tooltipTriggerEl) {
          return new bootstrap.Tooltip(tooltipTriggerEl)
        })
    }


    #initializeDroneMapControls() {
        // Kräver <button id="build-drone-map-btn"> i index.html
        const btn = document.getElementById('build-drone-map-btn');
        if (!btn) return;
        btn.addEventListener('click', () => this.#buildDroneMap());
    }

    
    /**
    * onMapDoubleClick method:
    *   A double click on the map calls this function, which creates
    *   a node on the clicked location, and an edge between the last
    *   two nodes if at least two nodes exist.
    */
    #onMapDoubleClick(event) {
        let altitude = this.#nodesList.length > 0 ? this.#nodesList[this.#nodesList.length-1].altitude : this.#rectangleWidth;
        let latlng = Object.values(event.latlng);

        const node = new Objects.Node(latlng, altitude, this.#nodesList.length);
        this.#nodesGeoJsonLayersList.addLayer(node.marker);
        this.#nodeOnEvent(node);

        if (this.#nodesList.length > 0) {
            this.#nodesList[this.#nodesList.length-1].nextCicle = node;
        }

        this.#nodesList.push(node);

        // if there are two or more nodes, add an edge between last two nodes
        if (this.#nodesList.length > 1) {
            let [source, destination] = this.#nodesList.slice(this.#nodesList.length-2, this.#nodesList.length);
            let edge = new Objects.Edge(source, destination, source.altitude, this.#NMAC_radius, this.#edgesList.length);
            if (this.#segmentsExtensionCheckbox.checked) {
                edge.extraLength = this.#segmentExtensionLength;
                edge.update();
            }
            this.#edgesGeoJsonLayersList.addLayer(edge.polyline);
this.#edgesList.push(edge);

// NEW: visa raden direkt (med 0:or tills beräkningen uppdaterar värdena)
this.#addSegmentRow(edge);

this.#updateBuffersUnion("ground");
this.#updateBuffersUnion("air");
this.#recomputeEdges([edge]); // beräkningen uppdaterar sedan raden

        }
    }

    /**
    * nodeOnEvent method:
    *   Events related to a node are registered in this method.
    */
    #nodeOnEvent(node) {
        node.smoothCheckboxElement.addEventListener('change', (event) => {
            if (node.hasEdge()) {
                this.#updateBuffersUnion("ground");
                this.#recomputeEdges([node.edge]);
            }
        })

        node.sliderElement.noUiSlider.on('change', (handles, value) => {
            this.#updateBuffersUnion("ground");

            // if the node has an incoming edge that is smooth, and an outgoing edge, update population of both
            if (node.hasEdge() && node.edgesList.length === 2 && node.edgesList[0].nodesList[0].isSmooth) {
                this.#recomputeEdges(node.edgesList);
            // last node without own edge, but incoming edge is smooth
            } else if (!node.hasEdge() && node.edgesList.length === 1 && node.edgesList[0].nodesList[0].isSmooth) {
                this.#recomputeEdges(node.edgesList);
            } else if (node.hasEdge()) {
                this.#recomputeEdges([node.edge]);
            }
        })

        node.splitButtonElement.addEventListener('click', () => {this.#splitEdge(node)});

        node.removeButtonElement.addEventListener('click', () => {this.#removeNode(node)});

        node.marker.on('moveend', (event) => {
                this.#updateBuffersUnion("ground");
                this.#updateBuffersUnion("air");
                this.#recomputeEdges(node.edgesList);
                })
    }

    /**
    * splitEdge method:
    *   When a node's edge is split into two edges, a new node is added in the middle
    *   of that edge...
    */
    #splitEdge(node) {
        if (node.hasEdge()) {
            let latlng = Object.values(node.edge.polyline.getCenter());
            let newNode = new Objects.Node(latlng, node.altitude, node.positionInList+1)
            let newEdge = null;
            let orgDestination = node.edge.nodesList[1];

            this.#nodesGeoJsonLayersList.addLayer(newNode.marker);
            this.#nodeOnEvent(newNode);

            node.nextCicle = newNode;
            newNode.nextCicle = orgDestination;
            this.#nodesList.splice(node.positionInList+1 ,0, newNode);

            node.edge.nodesList[1] = newNode;
            newNode.edgesList[0] = node.edge;
            node.edge.update();

            if (orgDestination.edgesList.length === 1) {
                orgDestination.edgesList.pop()
                newEdge = new Objects.Edge(newNode, orgDestination, newNode.altitude, this.#NMAC_radius, node.edge.positionInList+1)
            } else if (orgDestination.edgesList.length === 2) {
                newEdge = new Objects.Edge(newNode, orgDestination, newNode.altitude, this.#NMAC_radius, node.edge.positionInList+1)
                orgDestination.edgesList.reverse();
                orgDestination.edgesList.pop();
            }

            this.#edgesGeoJsonLayersList.addLayer(newEdge.polyline);

            this.#edgesList.splice(node.edge.positionInList+1, 0, newEdge);
            this.#updateBuffersUnion("ground");
            this.#updateBuffersUnion("air");
            this.#recomputeEdges([node.edge, newEdge]);

            this.#nodesList.slice(node.positionInList+2, this.#nodesList.length).map((node) => {node.positionInList += 1});
            this.#edgesList.slice(node.edge.positionInList+2, this.#edgesList.length).map((edge) => {edge.positionInList += 1})
            this.#edgesList.slice(node.edge.positionInList, this.#edgesList.length).map((edge) => {this.#addSegmentRow(edge)})

        }
    }

    /**
    * removeNode method:
    */
    #removeNode(node) {
        if (node.hasEdge() && node.edgesList.length === 1) {
            this.#nodesList.splice(0, 1);
            this.#nodesGeoJsonLayersList.removeLayer(node.marker);
            this.#edgesList.splice(0, 1);
            this.#edgesGeoJsonLayersList.removeLayer(node.edge.polyline);
            this.#nodesList[0].edgesList.splice(0, 1);

            this.#nodesList.map((node) => {node.positionInList -= 1});
            this.#edgesList.map((edge) => {edge.positionInList -= 1})

            this.#segmentsTableElement.querySelector('tbody').deleteRow(0);
            this.#updateBuffersUnion("ground");
            this.#updateBuffersUnion("air");
            this.#recomputeEdgesDebounced([]);
            this.#edgesList.map((edge) => {this.#addSegmentRow(edge)});

        } else if (!node.hasEdge() && node.edgesList.length === 1) {
            this.#nodesList.splice(this.#nodesList.length-1, 1);
            this.#nodesGeoJsonLayersList.removeLayer(node.marker);
            this.#edgesList.splice(this.#edgesList.length-1, 1);
            let source = node.edgesList[0].nodesList[0];
            source.edge.polyline.remove();
            source.edgesList.pop();
            source.edge = null;
            source.nextCycle = null;

            this.#segmentsTableElement.querySelector('tbody').deleteRow(this.#edgesList.length);
            this.#updateBuffersUnion("ground");
            this.#updateBuffersUnion("air");
            this.#recomputeEdgesDebounced([]);

        } else if (node.edgesList.length === 2){
            this.#nodesList.splice(node.positionInList, 1);
            this.#nodesGeoJsonLayersList.removeLayer(node.marker);
            this.#edgesList.splice(node.edge.positionInList, 1);
            this.#edgesGeoJsonLayersList.removeLayer(node.edge.polyline);
            this.#segmentsTableElement.querySelector('tbody').deleteRow(node.edge.positionInList);

            let source = node.edgesList[0].nodesList[0];
            let destination = node.edge.nodesList[1];
            source.nextCycle = destination;
            source.edge.nodesList[1] = destination;
            destination.edgesList[0] = source.edge;
            source.edge.update();

            this.#nodesList.slice(node.positionInList, this.#nodesList.length).map((node) => {node.positionInList -= 1});
            this.#edgesList.slice(node.edge.positionInList, this.#edgesList.length).map((edge) => {edge.positionInList -= 1})

            this.#updateBuffersUnion("ground");
            this.#updateBuffersUnion("air");
            this.#recomputeEdges([source.edge]);
            this.#edgesList.slice(node.edge.positionInList, this.#edgesList.length).map((edge) => {this.#addSegmentRow(edge)});
        }
    }

    /**
    * updateBuffersUnion method:
    *   Method that receives a location, either `ground` or `air`,
    *   removes the old overlay layer (if exists), recomputes the union of
    *   the buffers for that location and adds a new layer to the map.
    */
    #updateBuffersUnion(location) {
        if (location === "ground" && this.#groundBuffersUnionGeoJSON != null) {
            this.#groundBuffersUnionGeoJsonLayers.removeLayer(this.#groundBuffersUnionGeoJSON);
        } else if (location === "air" && this.#airBuffersUnionGeoJSON != null) {
            this.#airBuffersUnionGeoJsonLayers.removeLayer(this.#airBuffersUnionGeoJSON);
        }

        let buffersList = this.#edgesList.map((edge) => {return location === "ground" ? edge.groundBuffer : edge.airBuffer})
        let buffersUnion = this.#unionOfBuffers(buffersList);

        if (location === "ground") {
            this.#groundBuffersUnion = buffersUnion;
            this.#groundBuffersUnionGeoJSON = L.geoJSON(buffersUnion, {
  style: Helpers.groundBuffersStyle,
  interactive: false
});
            this.#groundBuffersUnionGeoJsonLayers.addLayer(this.#groundBuffersUnionGeoJSON);
        } else if (location === "air") {
            this.#airBuffersUnion = buffersUnion;
            this.#airBuffersUnionGeoJSON = L.geoJSON(buffersUnion, {
  style: Helpers.airBuffersStyle,
  interactive: false
});
            this.#airBuffersUnionGeoJsonLayers.addLayer(this.#airBuffersUnionGeoJSON);
        }
    }

    /**
    * unionOfBuffers method:
    */
    #unionOfBuffers(buffersList) {
  if (!buffersList || buffersList.length === 0) return null;
  if (buffersList.length === 1) return buffersList[0]; // viktiga raden

  const union = polyclip.union(...buffersList.map(b => b.geometry.coordinates));
  return turf.buffer(turf.multiPolygon(union), 0.0001, { units: 'meters' });
}


    /**
    * computeRisksDebounced method:
    */
    #computeRisksDebounced(edges) {
        clearTimeout(this.#timeoutId);
        this.#timeoutId = setTimeout(() => { this.#computeRisks(edges); }, 1000);
    }

    /**
    * Helper: central dispatch – kör rätt beräkning beroende på läge
    */
    #recomputeEdges(edges) {
  if (this.#droneMode) {
    // Drone-risk (NMAC UAV–UAV)
    this.#computeDroneRisk();
    // Ground/GEA-beräkning (uppdaterar population/area m.m., rör inte Drone-NMAC)
    this.#computeRisks(edges);
  } else {
    this.#computeRisks(edges);
  }
}

    #recomputeEdgesDebounced(edges) {
  clearTimeout(this.#timeoutId);
  if (this.#droneMode) {
    this.#timeoutId = setTimeout(() => {
      this.#computeDroneRisk();
      this.#computeRisks(edges);
    }, 500);
  } else {
    this.#timeoutId = setTimeout(() => { this.#computeRisks(edges); }, 1000);
  }
}


    /**
    * computeRisks method (befintlig Air risk mot GA):
    */
    async #computeRisks(edges) {
        await this.#initializeData();

        if (this.#groundBuffersUnion) {
            if (this.#ongoingComputation < 1) {
                this.#showSpinner();
            }
            this.#ongoingComputation++;

            if (!this.#droneMode) this.#totalNMAC_rate = 0;

            edges.map((edge) => {edge.population = 0;})

            let blocks = null;

            if (this.#useRTree) {
                let groundIDs = Helpers.treeBboxIntersect(edges.map(edge => edge.groundBuffer), this.#rtreeData);
                let airIDs = Helpers.treeBboxIntersect(edges.map(edge => edge.airBuffer), this.#rtreeData);
                let ids = Array.from(new Set(groundIDs.concat(airIDs)));
                blocks = ids.map(id => this.#population.features[id])
            } else {
                blocks = this.#population.features
            }

            // performing multithreading to handle the large population dataset
            let numWorkers = blocks.length > 1000 ? 4 : 1;
            let chunkSize = Math.ceil(blocks.length / numWorkers);
            let workers = [];
            let edgesSubsetPopulations = [];
            let edgesCirclePopulations = [];
            let edgesSubsetTimes = []
            let edgesSubsetAverageSpeeds = []
            let maxPopulations = [];
            let tileArea = 10_000; // 100x100
            let aborted = false;

            for (let i = 0; i < numWorkers; i++) {
                let start = i*chunkSize;
                let end = start + chunkSize;
                let subset = blocks.slice(start, end);

                let worker = new Worker(workersUrl);
                let groundBuffers = edges.map((edge) => {return edge.groundBuffer});
                let airBuffers = edges.map((edge) => {return edge.airBuffer});
                let circles = edges.map((edge) => {
                    let [src, dest] = edge.nodesList;
                    [src.circleCoveredPopulation, dest.circleCoveredPopulation] = [0, 0];
                    return [src.circle, dest.circle];
                });
                worker.postMessage([subset, groundBuffers, airBuffers, circles, tileArea]);

                worker.onmessage = function(event) {
                    if (aborted) {
  try { workers.forEach(w => w.terminate()); } catch (_) {}
  this.#ongoingComputation = Math.max(0, this.#ongoingComputation - 1);
  this.#hideSpinner();
  return;
}

                    let [edgesIntersectedPopulation, circlesPopulations, edgesTimes,
                         edgesAverageSpeeds, edgesMaxPopulations] = event.data;

                    edgesSubsetPopulations.push(edgesIntersectedPopulation);
                    edgesCirclePopulations.push(circlesPopulations);
                    edgesSubsetTimes.push(edgesTimes);
                    edgesSubsetAverageSpeeds.push(edgesAverageSpeeds);
                    maxPopulations.push(edgesMaxPopulations);

                    if (edgesSubsetPopulations.length === numWorkers) {
                        for (let j = 0; j < edges.length; j++) {
                            let edge = edges[j];

                            edge.population = (edgesSubsetPopulations.map((lst) => {return lst[j]})).reduce((a, c) => a + c, 0);
                            edge.maxSquarePopulationDensity = Math.max(...(maxPopulations.map((lst) => {return lst[j]}))) / tileArea;
                            let edgeCirclesPopulations = edgesCirclePopulations.map((worker) => worker[j]);
                            let circlesPopulation = edgeCirclesPopulations.reduce((a, c) => a.map((el, index) => el + c[index]));
                            let [src, dest] = edge.nodesList;
                            src.circleCoveredPopulation = circlesPopulation[0];
                            dest.circleCoveredPopulation = circlesPopulation[1];

                            let T_sum = (edgesSubsetTimes.map((lst) => {return lst[j]})).reduce((a, c) => a + c, 0);
edge.NMAC_time = T_sum;

let edgeAverageSpeeds = edgesSubsetAverageSpeeds.map((lst) => {return lst[j]});
edgeAverageSpeeds = edgeAverageSpeeds.flat().filter(v => v > 0);

// Spara hastighetslistan alltid (ofarligt), men räkna GA-NMAC bara om vi INTE är i Drone-läge
edge.NMAC_avg_speeds = edgeAverageSpeeds;

if (!this.#droneMode) {
  let v_GA_mean = edgeAverageSpeeds.reduce((a, c) => a + c, 0) / edgeAverageSpeeds.length || 0;
  let prob = this.#population.features[0].properties.p;
  edge.computeNMAC_rate(T_sum, v_GA_mean, prob);
}

                        }

                        // Totals – uppdatera GA-NMAC bara om vi INTE är i Drone-läge
let totalLength = this.#edgesList.reduce((a, edge) => a + edge.length, 0);
this.#totalMissionDuration = totalLength / this.#v_UA; // tid kan vi alltid uppdatera

if (!this.#droneMode) {
  let totalAverageGASpeeds = this.#edgesList.reduce(function (flattenedArray, element) {
    return flattenedArray.concat(element.NMAC_avg_speeds);
  }, []);
  let v = totalAverageGASpeeds.flat();
  let v_mean = v.length > 0 ? v.reduce((a, c) => a + c, 0) / v.length : 0;
  let airG = this.#edgesList.reduce((a, c) => a + c.airBufferArea, 0);
  let totalTime = this.#edgesList.reduce((a, c) => a + c.NMAC_time, 0);
  let total_p_HC = (2 * this.#NMAC_radius**2 * totalTime * Math.sqrt(this.#v_UA**2 + v_mean**2)) /
                   (this.#NMAC_radius * airG);
  let rate = total_p_HC * this.#population.features[0].properties.p;

  this.#totalExpectedNMAC = (totalLength / this.#v_UA) * rate;
  this.#totalNMAC_rate    = Math.ceil(rate * 3600 * 1e6);
}


                        this.#ongoingComputation--;
                        this.#computeTotalStatistics()
                        edges.map((edge) => {this.#addSegmentRow(edge)});

                        workers.forEach(function(worker) {
                            worker.terminate();
                        });
                    }
                }.bind(this);

                // Lägg detta direkt under worker.onmessage
worker.onerror = (e) => {
  console.error('workers.js error:', e.message || e);
  this.#ongoingComputation = Math.max(0, this.#ongoingComputation - 1);
  this.#hideSpinner();
  worker.terminate();
};

worker.onmessageerror = (e) => {
  console.error('workers.js message error:', e);
  this.#ongoingComputation = Math.max(0, this.#ongoingComputation - 1);
  this.#hideSpinner();
  worker.terminate();
};

// enkel timeout så vi aldrig fastnar om en worker dör tyst
const expected = numWorkers;
let replied = 0;
const doneOnce = () => {
  replied += 1;
  if (replied >= expected) clearTimeout(watchdog);
};
const origOnMessage = worker.onmessage;
worker.onmessage = (ev) => { origOnMessage(ev); doneOnce(); };
const watchdog = setTimeout(() => {
  if (replied < expected) {
    console.warn('workers.js timeout – avbryter beräkning');
    this.#ongoingComputation = 0;
    this.#hideSpinner();
    workers.forEach(w => w.terminate());
  }
}, 15000); // 15 s räcker för felsökning


                workers.push(worker);
            }
        }
    }

    /**
    * NEW: Drone–Drone risk (konstant UAV-täthet från slidern)
    *  - använder varje segments NMAC-korridorarea (airBufferArea)
    *  - relativhastighet ~ 1.2 * egenhastighet (enkelt antagande)
    *  - uppdaterar segmentens två blå kolumner och totals
    */


#computeDroneRisk() {
  console.log('[N] computeDroneRisk N =', this.getN());

  if (this.#ongoingComputation < 1) this.#showSpinner();
  this.#ongoingComputation++;

  try {
    // Måste ha λ̄(g) för alla celler
    const haveLambda =
      Array.isArray(this.#lambdaBarValues) &&
      this.#lambdaBarValues.length === this.#population.features.length;

    if (!haveLambda) {
      // Nollställ snyggt tills λ̄(g) finns
      let totalTime = 0;
      for (let edge of this.#edgesList) {
        const segTime = edge.length / this.#v_UA;
        totalTime += segTime;
        edge.NMAC_rate = 0;
        edge.expectedNMAC = 0;
        this.#addSegmentRow(edge);
      }
      this.#totalNMAC_rate = 0;
      this.#totalExpectedNMAC = 0;
      this.#totalMissionDuration = totalTime;
      return;
    }

    const R    = Math.max(1, this.#NMAC_radius); // m
    const Vrel = this.#v_UA * 1.273;   // båda drönarna flyger med samma fart och slumpade riktningar, relativ hastigeht

    let totalMissionNmac = 0;
    let totalTime = 0;

    for (let edge of this.#edgesList) {
      const airG_m2 = Math.max(1, edge.airBufferArea);
      const segTime = edge.length / this.#v_UA;

      // Area-vägd Λ_edge (UAV/km²) från λ̄(g)
      let num = 0, den = 0;
      try {
        const ids = Helpers.treeBboxIntersect([edge.airBuffer], this.#rtreeData) || [];
        for (const id of ids) {
          const cell = this.#population.features[id];
          const inter = turf.intersect(edge.airBuffer, cell);
          if (!inter) continue;

          const a_m2 = turf.area(inter);
          if (!(a_m2 > 0)) continue;

          const Ai_m2   = turf.area(cell); // cellens area (m²)
          if (!(Ai_m2 > 0)) continue;

          const m_i = this.#droneMapValues[id] || 0;
if (!(m_i > 0)) continue;

const l     = this.#lMeters || 100;
const T     = 12 * 3600;
const sumD  = this.#sumDWindow || 1;
const scale = (l / this.#v_UA) / (T * sumD * sumD);

// λ̄_i med aktuellt N
const lambda_i = this.getN() * m_i * scale;   // UAV per cell under T
const Lambda_i = lambda_i / (Ai_m2 / 1e6);    // UAV/km²


          num += Lambda_i * a_m2;
          den += a_m2;
        }
      } catch (e) {
        console.warn('Drone risk (LiU): corridor aggregation failed, using zero for this edge', e);
      }

      const lambdaEdge = den > 0 ? (num / den) : 0; // UAV/km² (area-vägd)
      const areaKm2    = airG_m2 / 1e6;

      // Hazard per sekund
      const ratePerSec = lambdaEdge * areaKm2 * (Vrel / (2 * R));

      edge.NMAC_rate    = Math.ceil(ratePerSec * 3600 * 1e6); // per 10^6 flygtimmar
      edge.expectedNMAC = ratePerSec * segTime;

      totalMissionNmac += edge.expectedNMAC;
      totalTime        += segTime;

      this.#addSegmentRow(edge);
    }

    const nmacPerHour = totalTime > 0 ? (totalMissionNmac * 3600 / totalTime) : 0;
    this.#totalNMAC_rate       = Math.ceil(nmacPerHour * 1e6);
    this.#totalExpectedNMAC    = totalMissionNmac;
    this.#totalMissionDuration = totalTime;

  } catch (err) {
    console.error('computeDroneRisk (LiU) failed:', err);
  } finally {
    this.#ongoingComputation = Math.max(0, this.#ongoingComputation - 1);
    this.#computeTotalStatistics();
  }
}



    /**
    * showSpinner method:
    */
    #showSpinner() {
        this.#spinnerContainer.style.display = 'block';
        let cells = this.#totalsTableElement.querySelector('tbody').querySelector('tr').querySelectorAll('td');

        for (let cell of cells) {
            cell.innerHTML = '<div class="spinner-grow spinner-grow-sm text-primary" role="status"></div>';
        }
    }

    /**
    * hideSpinner method:
    */
    #hideSpinner() {
      this.#spinnerContainer.style.display = 'none';
    }

    /**
    * doubleComputations method:
    */
    #doubleComputations() {
        let doubleComputedPopulation = 0;
        let doubleComputedArea = 0;

        for (let x = 0; x < this.#edgesList.length-1; x++) {
            let e1 = this.#edgesList[x];
            let e2 = this.#edgesList[x+1];
            doubleComputedPopulation += Math.min(e1.nodesList[1].circleCoveredPopulation, e2.nodesList[0].circleCoveredPopulation);
            doubleComputedArea += Math.min(e1.nodesList[1].circleArea, e2.nodesList[0].circleArea);
        }

        return [doubleComputedPopulation, doubleComputedArea];
    }

    /**
    * computeTotalStatistics method:
    */
    #computeTotalStatistics() {
        let totalPopulationAtRisk = this.#edgesList.reduce((a, edge) => a + edge.population, 0);
        let totalLength = this.#edgesList.reduce((a, edge) => a + edge.length, 0);
        let totalArea = this.#edgesList.reduce((a, edge) => a + edge.groundArea, 0);
        let [doubleComputedPopulation, doubleComputedArea] = this.#doubleComputations();
        totalPopulationAtRisk -= doubleComputedPopulation;
        totalArea -= doubleComputedArea;

        let linearDensity = totalLength ? (totalPopulationAtRisk / totalLength).toExponential(2) : 0;
        let exposedDensity = totalArea ? (totalPopulationAtRisk / totalArea).toExponential(2) : 0;
        let maxExposedDensity = this.#edgesList.reduce((a, edge) => Math.max(a, edge.maxSquarePopulationDensity), 0);
        let expectedNMAC = this.#edgesList.length ? (this.#totalExpectedNMAC).toExponential(2) : 0;

        let totalTime = this.#totalMissionDuration;

        let cells = this.#totalsTableElement.querySelector('tbody').querySelector('tr').querySelectorAll('td');

        let data = [Math.ceil(totalLength), Math.ceil(totalTime/60), Math.ceil(totalPopulationAtRisk),
                    Math.ceil(totalArea), linearDensity, exposedDensity, maxExposedDensity, this.#totalNMAC_rate,
                    expectedNMAC];

        // Skriv alltid ut totals – spinner styrs separat
for (let i = 0; i < cells.length; i++) {
  cells[i].textContent = data[i];
}
if (this.#ongoingComputation < 1) this.#hideSpinner();

    }

    /**
    * addSegmentRow method:
    */
    #addSegmentRow(edge) {
        let tableBody = this.#segmentsTableElement.querySelector('tbody')
        let rows = tableBody.querySelectorAll('tr');
        
        let generalData = [edge.positionInList+1, edge.altitude, Math.ceil(edge.length),
                           Math.ceil((edge.length/this.#v_UA)/60)];
        let groundRiskData = [Math.ceil(edge.population), Math.ceil(edge.groundArea),
                              (edge.population/edge.length).toExponential(2),
                              (edge.population/edge.groundArea).toExponential(2),
                              (edge.maxSquarePopulationDensity).toExponential(2)];
        let airRiskData = [Math.ceil(edge.NMAC_rate), (edge.expectedNMAC).toExponential(2)];

        let data = generalData.concat(groundRiskData, airRiskData);

        if (this.#edgesList.length === rows.length) {
            // edge already exist
            let row = rows[edge.positionInList]
            let cells = row.querySelectorAll('td');

            for (let i = 0; i < data.length; i++) {
                cells[i+1].textContent = data[i];
            }
            cells[0].style.background = edge.polylineColor;
        } else {
            let newRow = document.createElement('tr');

            let colorColumn = document.createElement('td');
            colorColumn.classList.add('color-column');
            colorColumn.style.background = edge.polylineColor;
            newRow.appendChild(colorColumn);

            this.#addDataBlockToRow(newRow, generalData, 'table-light');
            this.#addDataBlockToRow(newRow, groundRiskData, 'table-warning');
            this.#addDataBlockToRow(newRow, airRiskData, 'table-primary');
            
            tableBody.appendChild(newRow);
        }
    }

    #addDataBlockToRow(row, data, tableClass) {
        for (let i = 0; i < data.length; i++) {
            const cell = document.createElement('td');
            cell.classList.add(tableClass)
            cell.textContent = data[i];
            row.appendChild(cell);
        }
    }

    /**
    * initializeNMAC_slider method:
    */
    #initializeNMAC_slider() {
        this.#NMAC_Slider = document.getElementById('nmac-slider');
        
        if (!this.#NMAC_Slider.noUiSlider) {
            noUiSlider.create(this.#NMAC_Slider, {
                start: [this.#NMAC_radius],
                step: 1,
                connect: 'lower',
                tooltips: {
                    to: (value) => Math.round(value),
                },
                range: {
                'min': [10],
                'max': [1200]
                },
            });
        }
        this.#NMAC_Slider.noUiSlider.on('change', this.#onNMAC_sliderChange.bind(this));
        // valfritt – kör samma logik när man släpper handtaget (ger snabbare feedback)
this.#NMAC_Slider.noUiSlider.on('update', (v, h) => {
  // Kör bara i Drone-läget för att undvika tunga turf-uppdateringar för ofta i GA-läget
  if (!this.#droneMode) return;
  this.#onNMAC_sliderChange(v, h);
});

    }

    #initializePaxSlider() {
        this.#paxSlider = document.getElementById('pax-slider');
        if (!this.#paxSlider) return;

        if (!this.#paxSlider.noUiSlider) {
            noUiSlider.create(this.#paxSlider, {
            start: [this.#paxCount],
            step: 1,
            connect: 'lower',
            tooltips: {
                to: (value) => Math.round(value),
            },
            range: { 'min': [1], 'max': [50] }
            });
        }
        this.#paxSlider.noUiSlider.on('change', (values, handle) => {
            this.#paxCount = Math.floor(values[handle]);
    // Ingen återberäkning nu — parametern exponeras bara enligt Val.
  });
}



    /**
    * onNMAC_sliderChange method:
    */
    #onNMAC_sliderChange(values, handle) {
        this.#NMAC_radius = Math.floor(values[handle]);

        for (let edge of this.#edgesList) {
            edge.NMAC_radius = this.#NMAC_radius;
            edge.update()
        }

        this.#updateBuffersUnion("air");
        this.#recomputeEdgesDebounced(this.#edgesList);
    }

    /**
    * initializeEdgeExtensionSlider method:
    */
    #initializeEdgeExtensionSlider() {
        this.#extensionSlider = document.getElementById('extension-slider');
        if (!this.#extensionSlider.noUiSlider) {
            noUiSlider.create(this.#extensionSlider, {
                start: [this.#segmentExtensionLength],
                step: 1,
                tooltips: {
                    to: (value) => Math.round(value),
                },
                connect: 'lower',
                range: {
                'min': [0],
                'max': [1200]
                },
            });
        }
        this.#extensionSlider.noUiSlider.on('change', this.#onEdgeExtensionSliderChange.bind(this));
        this.#extensionSlider.noUiSlider.disable();
    }

    /**
    * onEdgeExtensionSliderChange method:
    */
    #onEdgeExtensionSliderChange(values, handle) {
        this.#segmentExtensionLength = Math.floor(values[handle]);
        this.#segmentsExtensionCheckbox.checked ? this.#onSegmentExtensionCheckboxChange() : {};
    }

    /**
    * initializeUavSpeedSlider method:
    */
    #initializeUavSpeedSlider() {
        this.#speedSlider = document.getElementById('uav-speed-slider');
        if (!this.#speedSlider.noUiSlider) {
            noUiSlider.create(this.#speedSlider, {
                start: [this.#v_UA],
                step: 0.1,
                tooltips: {
                    to: (value) => Math.round(Helpers.convertSpeed(value)),
                },
                connect: 'lower',
                range: {
                'min': [1],
                'max': [50]
                },
            });
        }
        this.#speedSlider.noUiSlider.on('change', this.#onUavSpeedSliderChange.bind(this));
    }

    /**
    * onUavSpeedSliderChange method:
    */
    #onUavSpeedSliderChange(values, handle) {
        this.#v_UA = parseFloat(values[handle]);          // säkerställ nummer
this.#edgesList.forEach(edge => { edge.v_UA = this.#v_UA; });

// Snabb respons: kör rätt beräkning direkt
if (this.#droneMode) {
  this.#computeDroneRisk();
} else {
  this.#recomputeEdgesDebounced(this.#edgesList);
}

    }

    /**
    * initializeGlobalAltitudeSlider method:
    */
    #initializeGlobalAltitudeSlider() {
        this.#globalAltitudeSlider = document.getElementById('global-altitude-slider');

        if (!this.#globalAltitudeSlider.noUiSlider) {
            noUiSlider.create(this.#globalAltitudeSlider, {
                start: [this.#rectangleWidth],
                step: 1,
                tooltips: {
                    to: (value) => Math.round(value),
                },
                connect: 'lower',
                range: {
                'min': [10],
                'max': [1200]
                },
            });
        }
        this.#globalAltitudeSlider.noUiSlider.on('change', this.#onGlobalAltitudeSliderChange.bind(this));
    }

    /**
    * onGlobalAltitudeSliderChange method:
    */
    #onGlobalAltitudeSliderChange(values, handle) {
  let newAltitude = Math.floor(values[handle]);
  if (this.#edgesList.length === 0) {
    this.#rectangleWidth = newAltitude;
    return;
  }

  let affectedEdges = [];
  for (let edge of this.#edgesList) {
    if (!edge.altitudeManuallyChanged) {
      edge.altitude = newAltitude;
      edge.nodesList[0].altitudeUpdatedGlobally(newAltitude);
      affectedEdges.push(edge);
    }
  }
  affectedEdges.map((edge) => edge.update());

  const lastSegment = this.#edgesList[this.#edgesList.length - 1];
  if (lastSegment && !lastSegment.altitudeManuallyChanged) {
    lastSegment.nodesList[1].altitudeUpdatedGlobally(newAltitude);
    lastSegment.update();
  }

  this.#updateBuffersUnion("ground");
  this.#recomputeEdgesDebounced(affectedEdges);
}




    /**
    * Getter för densitetsvärdet (UAV/km²).
    */
    #initializeNSlider() {
  this.#Nslider = document.getElementById('uav-N-slider');
  if (!this.#Nslider) return;

  if (!this.#Nslider.noUiSlider) {
    noUiSlider.create(this.#Nslider, {
      start: [100],            // valfritt startvärde
      step: 10,
      connect: 'lower',
      tooltips: { to: (v) => Math.round(v) },
      range: { 'min': [0], 'max': [100000] }
    });
  }
  const recompute = () => { if (this.#droneMode) this.#computeDroneRisk(); };
this.#Nslider.noUiSlider.on('change', recompute);
this.#Nslider.noUiSlider.on('update', recompute);


}

getN() {
  if (!this.#Nslider || !this.#Nslider.noUiSlider) return 0;
  return Math.max(0, Math.floor(this.#Nslider.noUiSlider.get()));
}


    #initializeSegmentExtensionCheckbox() {
        this.#segmentsExtensionCheckbox.addEventListener('change', this.#onSegmentExtensionCheckboxChange.bind(this));
    }

    /**
    * onSegmentExtensionCheckboxChange method:
    */
    #onSegmentExtensionCheckboxChange(event) {
        let extraLength = 0;
        if (this.#segmentsExtensionCheckbox.checked) {
            extraLength = this.#segmentExtensionLength;
            this.#extensionSlider.noUiSlider.enable();
        } else {
            this.#extensionSlider.noUiSlider.disable();
        }

        this.#edgesList.map((edge) => {edge.extraLength = extraLength});
        this.#edgesList.map((edge) => edge.update());

        this.#updateBuffersUnion("ground");
        this.#updateBuffersUnion("air");
        this.#recomputeEdgesDebounced(this.#edgesList);
    }
}

export { Visualization };

// ======================================= END OF FILE =======================================
