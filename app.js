const typeConfig = {
  official: { label: "Official update", color: "var(--official)" },
  monitoring: { label: "Monitoring", color: "var(--monitoring)" },
  news: { label: "News citation", color: "var(--news)" },
  guidance: { label: "Guidance", color: "var(--guidance)" },
};

const state = {
  activeTypes: new Set(Object.keys(typeConfig)),
  officialOnly: false,
  search: "",
  selectedId: "",
  popupOpen: false,
  records: [],
  sources: [],
  metadata: {},
};

const elements = {
  countryCount: document.querySelector("#country-count"),
  lastUpdated: document.querySelector("#last-updated"),
  map: document.querySelector("#map"),
  officialCount: document.querySelector("#official-count"),
  officialOnly: document.querySelector("#official-only"),
  recordList: document.querySelector("#record-list"),
  resetFilters: document.querySelector("#reset-filters"),
  searchInput: document.querySelector("#search-input"),
  selectedCard: document.querySelector("#selected-card"),
  sourceList: document.querySelector("#source-list"),
  typeFilters: document.querySelector("#type-filters"),
  visibleCount: document.querySelector("#visible-count"),
};

const mapState = {
  map: null,
  markers: null,
  markerById: new Map(),
};

function normalize(value) {
  return String(value || "").toLowerCase().trim();
}

function formatDate(value) {
  if (!value) return "--";
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(value));
}

function getFilteredRecords() {
  const query = normalize(state.search);
  return state.records.filter((record) => {
    const haystack = normalize(
      `${record.title} ${record.location.name} ${record.summary} ${record.sources.map((source) => source.name).join(" ")}`,
    );
    return (
      state.activeTypes.has(record.type) &&
      (!state.officialOnly || record.confidence === "official") &&
      (!query || haystack.includes(query))
    );
  });
}

function getMarkerSize(record) {
  return Math.round(30 + Math.min(record.metrics.totalPeople || 1, 12) * 1.6);
}

function createPopupContent(record) {
  const config = typeConfig[record.type];
  return `
    <article class="leaflet-report-popup">
      <div class="popup-meta">
        <span><span class="swatch ${record.type}"></span>${config.label}</span>
        <time>${formatDate(record.updatedAt)}</time>
      </div>
      <h2>${record.title}</h2>
      <p class="popup-location">${record.location.name} · ${record.location.precision} precision</p>
      <p>${record.summary}</p>
      <div class="popup-prevention">
        <strong>Source status.</strong> ${record.confidenceLabel}
      </div>
      <div class="popup-news">
        <div class="section-label">Citations</div>
        ${record.sources
          .map(
            (source) => `
              <a href="${source.url}" target="_blank" rel="noreferrer">
                ${source.name}: ${source.title} <span aria-hidden="true">↗</span>
              </a>
            `,
          )
          .join("")}
      </div>
    </article>
  `;
}

function initMap() {
  if (mapState.map || !window.L) return;

  mapState.map = window.L.map(elements.map, {
    worldCopyJump: true,
    minZoom: 2,
    maxZoom: 8,
  }).setView([18, -25], 2);

  window.L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  }).addTo(mapState.map);

  mapState.markers = window.L.layerGroup().addTo(mapState.map);
  window.setTimeout(() => mapState.map.invalidateSize(), 0);
}

function renderFilters() {
  elements.typeFilters.innerHTML = Object.entries(typeConfig)
    .map(([type, config]) => {
      const count = state.records.filter((record) => record.type === type).length;
      return `
        <button class="filter-chip" type="button" data-type="${type}" aria-pressed="${state.activeTypes.has(type)}">
          <span class="swatch ${type}"></span>
          <span>${config.label}</span>
          <strong>${count}</strong>
        </button>
      `;
    })
    .join("");
}

function renderRecordList(records) {
  if (!records.length) {
    elements.recordList.innerHTML = '<div class="empty-state">No records match these filters.</div>';
    return;
  }

  elements.recordList.innerHTML = records
    .map(
      (record) => `
        <button class="record-card ${record.id === state.selectedId ? "active" : ""}" type="button" data-record-id="${record.id}">
          <span class="record-title">${record.title}</span>
          <span>${record.location.name} · ${formatDate(record.updatedAt)}</span>
          <span>${record.confidenceLabel}</span>
        </button>
      `,
    )
    .join("");
}

function renderMarkers(records) {
  initMap();
  if (!mapState.map || !mapState.markers) {
    elements.map.innerHTML =
      '<div class="map-unavailable">Map resources could not load. Check network access and refresh.</div>';
    return;
  }

  mapState.map.invalidateSize();
  mapState.markers.clearLayers();
  mapState.markerById.clear();

  records.forEach((record) => {
    const size = getMarkerSize(record);
    const isSelected = record.id === state.selectedId;
    const marker = window.L.marker([record.location.lat, record.location.lng], {
      title: record.title,
      alt: record.title,
      keyboard: true,
      icon: window.L.divIcon({
        className: `case-marker ${record.type} ${isSelected ? "active" : ""}`,
        html: `<button type="button" data-marker-id="${record.id}" aria-label="${record.title}">${record.metrics.totalPeople}</button>`,
        iconSize: [size, size],
        iconAnchor: [size / 2, size / 2],
        popupAnchor: [0, -8],
      }),
    }).bindPopup(createPopupContent(record), {
      className: "report-popup-shell",
      maxWidth: 430,
      minWidth: 330,
      autoPanPadding: [24, 24],
      keepInView: true,
    });

    marker.on("click", () => selectRecord(record.id, { openPopup: true }));
    marker.on("popupclose", () => {
      if (state.selectedId === record.id) state.popupOpen = false;
    });

    marker.addTo(mapState.markers);
    mapState.markerById.set(record.id, marker);
  });

  const selected = records.find((record) => record.id === state.selectedId);
  if (state.popupOpen && selected) {
    mapState.map.setView([selected.location.lat, selected.location.lng], Math.max(mapState.map.getZoom(), 3));
  } else if (records.length) {
    const bounds = window.L.latLngBounds(records.map((record) => [record.location.lat, record.location.lng]));
    mapState.map.fitBounds(bounds, { padding: [34, 34], maxZoom: 3 });
  }

  if (state.popupOpen) {
    const marker = mapState.markerById.get(state.selectedId);
    if (marker) window.setTimeout(() => marker.openPopup(), 0);
  }
}

function renderSelected(records) {
  const selected = records.find((record) => record.id === state.selectedId) || records[0] || state.records[0];
  if (!selected) return;
  state.selectedId = selected.id;
  const config = typeConfig[selected.type];

  elements.selectedCard.innerHTML = `
    <div>
      <h2>${selected.title}</h2>
      <p>${selected.location.name} · ${selected.location.precision} precision · ${formatDate(selected.updatedAt)}</p>
      <p class="selected-summary">${selected.summary}</p>
      <div class="citation-row">
        ${selected.sources
          .slice(0, 3)
          .map((source) => `<a href="${source.url}" target="_blank" rel="noreferrer">${source.name}</a>`)
          .join("")}
      </div>
    </div>
    <span class="badge ${selected.type}">${config.label}</span>
  `;
}

function renderStats(records) {
  elements.visibleCount.textContent = String(records.length);
  elements.countryCount.textContent = String(new Set(records.map((record) => record.location.name)).size);
  elements.officialCount.textContent = String(records.filter((record) => record.confidence === "official").length);
  elements.lastUpdated.textContent = formatDate(state.metadata.lastUpdated);
}

function renderSources() {
  elements.sourceList.innerHTML = state.sources
    .map(
      (source) => `
        <a href="${source.url}" target="_blank" rel="noreferrer">
          <strong>${source.name}</strong>
          <span>${source.role} · ${source.refreshCadence}</span>
        </a>
      `,
    )
    .join("");
}

function render() {
  const records = getFilteredRecords();
  renderFilters();
  renderRecordList(records);
  renderMarkers(records);
  renderSelected(records);
  renderStats(records);
  renderSources();
}

function selectRecord(id, { openPopup = false } = {}) {
  state.selectedId = id;
  state.popupOpen = openPopup;
  render();
}

async function loadData() {
  const [eventsResponse, sourcesResponse] = await Promise.all([
    fetch("./data/events.json"),
    fetch("./data/sources.json"),
  ]);
  const events = await eventsResponse.json();
  const sources = await sourcesResponse.json();

  state.records = events.records;
  state.sources = sources.sources;
  state.metadata = events.metadata;
  state.selectedId = state.records[0]?.id || "";
  render();
}

elements.searchInput.addEventListener("input", (event) => {
  state.search = event.target.value;
  render();
});

elements.officialOnly.addEventListener("change", (event) => {
  state.officialOnly = event.target.checked;
  render();
});

elements.resetFilters.addEventListener("click", () => {
  state.activeTypes = new Set(Object.keys(typeConfig));
  state.officialOnly = false;
  state.search = "";
  elements.officialOnly.checked = false;
  elements.searchInput.value = "";
  render();
});

elements.typeFilters.addEventListener("click", (event) => {
  const button = event.target.closest("[data-type]");
  if (!button) return;
  const type = button.dataset.type;
  if (state.activeTypes.has(type)) state.activeTypes.delete(type);
  else state.activeTypes.add(type);
  render();
});

elements.recordList.addEventListener("click", (event) => {
  const card = event.target.closest("[data-record-id]");
  if (card) selectRecord(card.dataset.recordId);
});

elements.map.addEventListener("click", (event) => {
  const markerButton = event.target.closest("[data-marker-id]");
  if (!markerButton) return;
  selectRecord(markerButton.dataset.markerId, { openPopup: true });
});

document.addEventListener("keydown", (event) => {
  if (event.key !== "Escape" || !state.popupOpen) return;
  state.popupOpen = false;
  mapState.map?.closePopup();
});

loadData().catch((error) => {
  console.error(error);
  elements.selectedCard.innerHTML =
    '<div class="empty-state">Unable to load source-backed records. Please refresh or check the data feed.</div>';
});
