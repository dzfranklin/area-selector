import L from "leaflet";
import { MaptilerLayer, MaptilerStyle } from "@maptiler/leaflet-maptilersdk";
import osmtogeojson from "osmtogeojson";
import simplify from "@turf/simplify";
import * as wkt from "wkt";
import "leaflet-draw";

import "./style.css";
import "leaflet/dist/leaflet.css";
import "leaflet-draw/dist/leaflet.draw.css";

console.log(import.meta.env);

const defaultOverpassApiEndpoint = "https://overpass-api.de/api";
const MAPTILER_API_KEY = import.meta.env.VITE_MAPTILER_API_KEY;

if (MAPTILER_API_KEY === undefined) {
  document.body.innerHTML = "MAPTILER_API_KEY is not set";
  throw new Error("MAPTILER_API_KEY is not set");
}

const osmIdInput = $<HTMLInputElement>("#osm-id-input");
const osmTypeSelect = $<HTMLSelectElement>("#osm-type-select");
const fetchFromOSMBtn = $<HTMLButtonElement>("#fetch-from-osm");
const overpassApiEndpointInput = $<HTMLInputElement>("#overpass-api-endpoint");
const applyConfigBtn = $<HTMLButtonElement>("#apply-config");
const simplificationLevelInput = $<HTMLInputElement>("#simplification-level");
const resetSimplificationBtn = $<HTMLButtonElement>("#reset-simplification");
const valuesSection = $<HTMLDivElement>(".values");
const bboxValue = $<HTMLDivElement>("#bbox-value");
const geojsonValue = $<HTMLDivElement>("#geojson-value");
const wktValue = $<HTMLDivElement>("#wkt-value");

osmIdInput.value = "";
overpassApiEndpointInput.value = "";
simplificationLevelInput.value = "0";

const map = L.map("map", {
  center: L.latLng(0, 0),
  zoom: 6,
});

new MaptilerLayer({
  style: MaptilerStyle.OPENSTREETMAP,
  geolocate: true,
  apiKey: MAPTILER_API_KEY,
}).addTo(map);

overpassApiEndpointInput.placeholder = defaultOverpassApiEndpoint;
const savedOverpassApiEndpoint = localStorage.getItem("overpassApiEndpoint");
if (savedOverpassApiEndpoint) {
  overpassApiEndpointInput.value = savedOverpassApiEndpoint;
} else {
  overpassApiEndpointInput.value = defaultOverpassApiEndpoint;
}
const overpassApiEndpoint = overpassApiEndpointInput.value;

applyConfigBtn.onclick = () => {
  localStorage.setItem("overpassApiEndpoint", overpassApiEndpointInput.value);
  location.reload();
};

let selectionLayer: L.GeoJSON<any> | null = null;
let selection:
  | ReturnType<osmtogeojson.OsmToGeoJsonStatic>["features"][0]
  | null = null;
let simplifiedSelection: typeof selection | null = null;

let inDraw = false;
const drawControl = new (L.Control as any).Draw({
  draw: {
    // we only want areas
    polyline: false,
    marker: false,
    circlemarker: false,
    // these are buggy
    circle: false,
    rectangle: false,
  },
});
map.addControl(drawControl);
map.on("draw:created", (e) => {
  updateSelection(e.layer.toGeoJSON());
});
map.on("draw:drawstart", () => {
  inDraw = true;
});
map.on("draw:drawstop", () => {
  inDraw = false;
});

simplificationLevelInput.onchange = () => {
  updateSimplificationLevel(simplificationLevelInput.valueAsNumber);
};
resetSimplificationBtn.onclick = () => {
  simplificationLevelInput.value = "0";
  updateSimplificationLevel(0);
};

function updateSelection(f: any) {
  selection = f;
  if (selectionLayer) {
    map.removeLayer(selectionLayer);
  }

  selectionLayer = L.geoJSON(f);
  selectionLayer.addTo(map);
  map.fitBounds(selectionLayer.getBounds());

  simplificationLevelInput.value = "0";

  updateValues();
}

function updateSimplificationLevel(level: number) {
  if (!selectionLayer) return;

  if (level === 0) {
    simplifiedSelection = null;
    updateSelection(selection);
    return;
  }

  simplifiedSelection = simplify(selection, {
    tolerance: level,
    highQuality: true,
  });

  if (selectionLayer) {
    map.removeLayer(selectionLayer);
  }

  selectionLayer = L.geoJSON(simplifiedSelection);
  selectionLayer.addTo(map);

  updateValues();
}

valuesSection.addEventListener("click", (e) => {
  let target = e.target;
  while (target instanceof HTMLElement) {
    if (target.classList.contains(".value")) {
      return;
    }
    if (target.nodeName === "PRE" || target.nodeName === "CODE") {
      const range = document.createRange();
      range.selectNodeContents(target);
      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);
      return;
    }
    target = target.parentElement;
  }
});

function updateValues() {
  document
    .querySelectorAll(".values .value")
    .forEach((el) => (el.innerHTML = ""));

  let f = simplifiedSelection || selection;
  if (!f) {
    valuesSection.style.display = "none";
    return;
  }

  valuesSection.style.display = "block";

  // bbox

  const bbox = L.geoJSON(f).getBounds();
  bboxValue.innerHTML =
    "<pre><code>" +
    [bbox.getSouth(), bbox.getWest(), bbox.getNorth(), bbox.getEast()].join(
      ", "
    ) +
    "</pre></code>";

  // geojson

  appendValue(
    geojsonValue,
    "application/json",
    JSON.stringify({ ...f, properties: {} }, null, 2)
  );

  // wkt

  appendValue(wktValue, "text/plain", wkt.stringify(f.geometry));
}

function appendValue(parent: HTMLDivElement, contentType: string, v: string) {
  const headerEl = document.createElement("div");
  headerEl.className = "details";
  parent.append(headerEl);

  const url = URL.createObjectURL(new Blob([v], { type: contentType }));
  const downloadEl = document.createElement("a");
  downloadEl.href = url;
  downloadEl.download = "bounds_geojson.json";
  downloadEl.innerText = "Download";
  headerEl.append(downloadEl);

  const sizeEl = document.createElement("span");
  sizeEl.className = "size";
  sizeEl.innerText = bytesSI(new TextEncoder().encode(v).length);
  headerEl.append(sizeEl);

  if (v.length < 5000) {
    const codeEl = document.createElement("code");
    codeEl.innerText = v;
    const preEl = document.createElement("pre");
    preEl.append(codeEl);
    parent.append(preEl);
  }
}

map.addEventListener("click", async (e) => {
  if (inDraw) return;
  const { lng, lat } = e.latlng;

  const popupEl = document.createElement("div");
  popupEl.className = "popup";
  const popupHeader = document.createElement("div");
  const popupBody = document.createElement("div");
  popupEl.append(popupHeader, popupBody);

  popupHeader.innerHTML = `
    <h4>Longitude: ${lng.toFixed(6)}, Latitude: ${lat.toFixed(6)}</h4>`;

  const searchBtn = document.createElement("button");
  searchBtn.innerText = "Search for areas";
  popupBody.append(searchBtn);

  L.popup().setLatLng(e.latlng).setContent(popupEl).openOn(map);

  searchBtn.addEventListener("click", async () => {
    disableBtnWith(searchBtn, "Searching...");
    let resp: any;
    try {
      const response = await fetch(`${overpassApiEndpoint}/interpreter`, {
        method: "POST",
        body: `
          [out:json];
          is_in(${lat}, ${lng});
          wr(pivot)[name];
          out tags;
        `,
      });
      resp = await response.json();
    } catch (e) {
      console.error(e);
      alert("Failed to fetch data from OSM");
      enableBtn(searchBtn);
      return;
    }
    enableBtn(searchBtn);

    if (resp.elements.length === 0) {
      popupBody.innerHTML = "<p>No areas found</p>";
      return;
    }

    popupBody.innerHTML = "";
    const listEl = document.createElement("ul");
    popupBody.append(listEl);
    resp.elements.forEach((el: any) => {
      const areaName = el.tags?.name;
      if (!areaName) return;
      const areaId = el.id;
      const areaType = el.type;

      const rowEl = document.createElement("li");
      listEl.append(rowEl);
      const areaBtn = document.createElement("button");
      rowEl.append(areaBtn);

      areaBtn.innerText = areaName;
      areaBtn.onclick = async () => {
        disableBtnWith(areaBtn, "Fetching...");
        await fetchAndSelectOSM(areaType, areaId);
        enableBtn(areaBtn);
      };
    });
  });
});

fetchFromOSMBtn.onclick = async () => {
  const osmId = osmIdInput.value;
  const osmType = osmTypeSelect.value;
  if (!osmId) {
    alert("OSM ID is required");
    return;
  }

  disableBtnWith(fetchFromOSMBtn, "Fetching...");
  await fetchAndSelectOSM(osmType, osmId);
  enableBtn(fetchFromOSMBtn);
};

async function fetchAndSelectOSM(osmType: string, osmId: string) {
  let resp: any;
  try {
    const response = await fetch(`${overpassApiEndpoint}/interpreter`, {
      method: "POST",
      body: `
        [out:json];
        ${osmType}(id:${osmId});
        out tags;
        (._;>;);
        out skel;
      `,
    });
    resp = await response.json();
  } catch (e) {
    console.error(e);
    alert("Failed to fetch data from OSM");
    return;
  }

  if (resp.elements.length === 0) {
    alert("Not found");
    return;
  }

  const geoJSON = osmtogeojson(resp, {}).features[0]!;

  updateSelection(geoJSON);
}

function disableBtnWith(btn: HTMLButtonElement, text: string) {
  btn.disabled = true;
  btn.dataset.preDisabledText = btn.innerText;
  btn.innerText = text;
}

function enableBtn(btn: HTMLButtonElement) {
  btn.disabled = false;
  btn.innerText = btn.dataset.preDisabledText || btn.innerText;
}

function $<T>(selector: string): T {
  const elem = document.querySelector(selector);
  if (elem === null) {
    throw new Error(`Element not found: ${selector}`);
  }
  return elem as unknown as T;
}

function bytesSI(v: number, decimals = 2) {
  if (v < 1000) return v + " bytes";
  const vs = String(v),
    digits = vs.length,
    prefix_group = Math.floor((digits - 1) / 3),
    dot = ((digits - 1) % 3) + 1;
  return `${vs.slice(0, dot)}.${vs.slice(dot, dot + decimals)} ${
    " kMGTPEZY"[prefix_group]
  }B`;
}
