(() => {
  "use strict";

  const DEFAULT_POSITION = { lat: -23.55052, lon: -46.633308, isDemo: true };
  const FULL_THRESHOLD = 85;
  const OVERPASS_RADIUS_METERS = 12000;

  const shifts = [
    {
      id: "plantao-01",
      unit: "UPA Central",
      area: "Enfermagem",
      filter: "enfermagem",
      time: "Hoje · 19h às 07h",
      distance: "1,2 km",
      note: "Cobertura emergencial para o turno noturno.",
      urgency: "Urgente",
    },
    {
      id: "plantao-02",
      unit: "Hospital Municipal",
      area: "Clínica médica",
      filter: "medicina",
      time: "Amanhã · 07h às 19h",
      distance: "3,8 km",
      note: "Reforço da equipe de pronto atendimento.",
      urgency: "Nova vaga",
    },
    {
      id: "plantao-03",
      unit: "UBS Zona Norte",
      area: "Enfermagem",
      filter: "enfermagem",
      time: "Sábado · 08h às 17h",
      distance: "5,1 km",
      note: "Apoio em vacinação e atendimento básico.",
      urgency: "Fim de semana",
    },
  ];

  const medicines = [
    {
      id: "dipirona-500",
      name: "Dipirona 500 mg",
      form: "20 comprimidos",
      place: "Farmácia Vida",
      network: "parceira",
      distance: "850 m",
      stock: "8 unidades",
      price: "R$ 6,90",
      detail: "menor preço demo",
      prescription: false,
    },
    {
      id: "losartana-50",
      name: "Losartana 50 mg",
      form: "30 comprimidos",
      place: "Farmácia Popular",
      network: "publica",
      distance: "1,6 km",
      stock: "15 unidades",
      price: "Retirada pública",
      detail: "conforme disponibilidade",
      prescription: true,
    },
    {
      id: "amoxicilina-500",
      name: "Amoxicilina 500 mg",
      form: "21 cápsulas",
      place: "Drogaria Central",
      network: "parceira",
      distance: "2,1 km",
      stock: "5 unidades",
      price: "R$ 24,80",
      detail: "preço de demonstração",
      prescription: true,
    },
    {
      id: "insulina-nph",
      name: "Insulina NPH",
      form: "Frasco 10 ml",
      place: "Unidade Pública Centro",
      network: "publica",
      distance: "2,7 km",
      stock: "Em estoque",
      price: "Retirada pública",
      detail: "conforme regras da unidade",
      prescription: true,
    },
  ];

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));

  const storage = {
    get(key) {
      try {
        const value = JSON.parse(window.localStorage.getItem(key) || "[]");
        return Array.isArray(value) ? value : [];
      } catch {
        return [];
      }
    },
    set(key, value) {
      try {
        window.localStorage.setItem(key, JSON.stringify(value));
      } catch {
        // O protótipo continua sem armazenamento local.
      }
    },
  };

  const state = {
    activeTab: "mapa",
    shiftFilter: "todos",
    medicineFilter: "todos",
    medicineQuery: "",
    applications: new Set(storage.get("osistec_applications")),
    reservations: new Set(storage.get("osistec_reservations")),
    checkins: new Set(storage.get("osistec_checkins")),
    map: null,
    markerLayer: null,
    routeLayer: null,
    userMarker: null,
    accuracyCircle: null,
    userPosition: null,
    units: [],
    selectedUnit: null,
    pendingQuery: "",
    recognition: null,
    listening: false,
  };

  function normalizeText(value) {
    return String(value || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .trim();
  }

  function escapeHtml(value) {
    return String(value || "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function icon(id, className = "") {
    return `<svg${className ? ` class="${className}"` : ""} aria-hidden="true"><use href="#${id}"></use></svg>`;
  }

  function showToast(message) {
    const toast = $("#toast");
    $("#toast-message").textContent = message;
    toast.classList.add("is-visible");
    window.clearTimeout(showToast.timer);
    showToast.timer = window.setTimeout(() => toast.classList.remove("is-visible"), 3500);
  }

  function showMapLoading(title, detail) {
    const loading = $("#map-loading");
    const strong = $("strong", loading);
    const small = $("small", loading);
    strong.textContent = title;
    small.textContent = detail;
    loading.hidden = false;
  }

  function hideMapLoading() {
    $("#map-loading").hidden = true;
  }

  function setActiveTab(tabName, focusTab = false) {
    const nextTab = ["plantoes", "mapa", "farmacia"].includes(tabName) ? tabName : "mapa";
    state.activeTab = nextTab;

    $$(".bottom-tabs [role='tab']").forEach((tab) => {
      const selected = tab.dataset.tab === nextTab;
      tab.classList.toggle("is-active", selected);
      tab.setAttribute("aria-selected", String(selected));
      tab.tabIndex = selected ? 0 : -1;
      if (selected && focusTab) tab.focus();
    });

    $$(".app-panel").forEach((panel) => {
      const selected = panel.id === `panel-${nextTab}`;
      panel.hidden = !selected;
      panel.classList.toggle("is-active", selected);
    });

    if (nextTab === "mapa" && state.map) {
      window.setTimeout(() => state.map.invalidateSize(), 30);
    } else {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }

  function haversineKm(first, second) {
    const toRad = (degrees) => (degrees * Math.PI) / 180;
    const earthRadiusKm = 6371;
    const dLat = toRad(second.lat - first.lat);
    const dLon = toRad(second.lon - first.lon);
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(toRad(first.lat)) * Math.cos(toRad(second.lat)) * Math.sin(dLon / 2) ** 2;
    return earthRadiusKm * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  function formatDistance(kilometers) {
    if (!Number.isFinite(kilometers)) return "—";
    if (kilometers < 1) return `${Math.max(50, Math.round((kilometers * 1000) / 10) * 10)} m`;
    return `${kilometers.toFixed(kilometers < 10 ? 1 : 0).replace(".", ",")} km`;
  }

  function stringHash(value) {
    let hash = 0;
    for (const character of String(value)) {
      hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
    }
    return hash;
  }

  function occupancyFor(value) {
    return 18 + (stringHash(value) % 79);
  }

  function occupancyStatus(occupancy) {
    if (occupancy >= FULL_THRESHOLD) return "full";
    if (occupancy >= 55) return "medium";
    return "low";
  }

  function occupancyLabel(occupancy) {
    const status = occupancyStatus(occupancy);
    if (status === "full") return "Lotada";
    if (status === "medium") return "Moderada";
    return "Livre";
  }

  function unitType(tags, name) {
    const searchable = normalizeText(`${name} ${tags.amenity || ""} ${tags.healthcare || ""}`);
    if (/upa|pronto atendimento|emergencia|emergency/.test(searchable)) return "Pronto atendimento";
    if (/hospital/.test(searchable)) return "Hospital";
    if (/ubs|unidade basica|posto de saude/.test(searchable)) return "Unidade básica de saúde";
    if (/doctors|consultorio/.test(searchable)) return "Consultório ou centro médico";
    return "Clínica de saúde";
  }

  function unitServices(tags, name, type) {
    const searchable = normalizeText(
      `${name} ${type} ${tags["healthcare:speciality"] || ""} ${tags.speciality || ""} ${tags.emergency || ""}`,
    );
    const categories = new Set(["geral"]);

    if (/upa|pronto|hospital|emergencia|emergency/.test(searchable)) categories.add("urgencia");
    if (/pediatr|crianca|infantil/.test(searchable)) categories.add("pediatria");
    if (/ortoped|trauma/.test(searchable)) categories.add("ortopedia");
    if (/cardi|coracao/.test(searchable)) categories.add("cardiologia");
    if (/vacina|vacinacao|imuniza/.test(searchable) || /ubs|unidade basica|posto/.test(searchable)) categories.add("vacina");
    if (/laborat|exame|diagnost/.test(searchable) || /ubs|unidade basica/.test(searchable)) categories.add("exames");

    return Array.from(categories);
  }

  function demoUnits(origin) {
    const entries = [
      {
        id: "demo-upa-central",
        name: "UPA Central (demo)",
        type: "Pronto atendimento 24h",
        latOffset: 0.009,
        lonOffset: 0.006,
        occupancy: 34,
        categories: ["geral", "urgencia", "pediatria"],
      },
      {
        id: "demo-ubs-jardim",
        name: "UBS Jardim Azul (demo)",
        type: "Unidade básica de saúde",
        latOffset: -0.012,
        lonOffset: 0.012,
        occupancy: 25,
        categories: ["geral", "vacina", "exames", "pediatria"],
      },
      {
        id: "demo-hospital-municipal",
        name: "Hospital Municipal (demo)",
        type: "Hospital geral",
        latOffset: 0.018,
        lonOffset: -0.01,
        occupancy: 68,
        categories: ["geral", "urgencia", "ortopedia", "cardiologia", "pediatria"],
      },
      {
        id: "demo-pronto-socorro",
        name: "Pronto-Socorro Norte (demo)",
        type: "Emergência hospitalar",
        latOffset: -0.02,
        lonOffset: -0.017,
        occupancy: 93,
        categories: ["geral", "urgencia", "ortopedia"],
      },
    ];

    return entries.map((entry) => {
      const unit = {
        id: entry.id,
        name: entry.name,
        type: entry.type,
        lat: origin.lat + entry.latOffset,
        lon: origin.lon + entry.lonOffset,
        occupancy: entry.occupancy,
        categories: entry.categories,
        source: "demo",
      };
      unit.distanceKm = haversineKm(origin, unit);
      return unit;
    });
  }

  function parseOverpassUnits(payload, origin) {
    const seen = new Set();
    const units = [];

    for (const element of payload.elements || []) {
      const lat = Number(element.lat ?? element.center?.lat);
      const lon = Number(element.lon ?? element.center?.lon);
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;

      const tags = element.tags || {};
      const name = tags.name || tags["official_name"] || tags["short_name"] || "Unidade de saúde";
      const key = `${name}-${lat.toFixed(5)}-${lon.toFixed(5)}`;
      if (seen.has(key)) continue;
      seen.add(key);

      const type = unitType(tags, name);
      const occupancy = occupancyFor(`${element.type}-${element.id}-${name}`);
      const unit = {
        id: `osm-${element.type}-${element.id}`,
        name,
        type,
        lat,
        lon,
        occupancy,
        categories: unitServices(tags, name, type),
        source: "openstreetmap",
      };
      unit.distanceKm = haversineKm(origin, unit);
      units.push(unit);
    }

    units.sort((first, second) => first.distanceKm - second.distanceKm);
    const nearby = units.slice(0, 14);
    if (nearby.length && nearby.every((unit) => unit.occupancy >= FULL_THRESHOLD)) {
      nearby[0].occupancy = 52;
    }
    return nearby;
  }

  function facilityIcon(unit, selected = false) {
    const status = occupancyStatus(unit.occupancy);
    return window.L.divIcon({
      className: "",
      html: `<span class="facility-pin facility-pin--${status}${selected ? " facility-pin--selected" : ""}">${icon("icon-hospital")}</span>`,
      iconSize: [38, 38],
      iconAnchor: [19, 34],
      tooltipAnchor: [0, -27],
    });
  }

  function renderUnitMarkers() {
    if (!state.map || !state.markerLayer) return;
    state.markerLayer.clearLayers();

    state.units.forEach((unit) => {
      const selected = state.selectedUnit?.id === unit.id;
      const marker = window.L.marker([unit.lat, unit.lon], {
        icon: facilityIcon(unit, selected),
        title: `${unit.name}: lotação demonstrativa ${occupancyLabel(unit.occupancy).toLowerCase()}`,
        alt: unit.name,
        keyboard: true,
      });
      marker.bindTooltip(escapeHtml(unit.name), {
        direction: "top",
        offset: [0, -6],
        className: "unit-tooltip",
      });
      marker.on("click", () => selectUnit(unit, { recommended: false }));
      marker.addTo(state.markerLayer);
    });
  }

  function addUserPositionToMap(position, accuracy = 120) {
    if (!state.map) return;

    if (state.userMarker) state.userMarker.remove();
    if (state.accuracyCircle) state.accuracyCircle.remove();

    const markerIcon = window.L.divIcon({
      className: "",
      html: '<span class="user-location-marker" aria-hidden="true"></span>',
      iconSize: [20, 20],
      iconAnchor: [10, 10],
    });
    state.userMarker = window.L.marker([position.lat, position.lon], {
      icon: markerIcon,
      title: position.isDemo ? "Localização de demonstração" : "Sua localização",
      alt: position.isDemo ? "Localização de demonstração" : "Sua localização",
      zIndexOffset: 1000,
    }).addTo(state.map);

    if (!position.isDemo && Number.isFinite(accuracy)) {
      state.accuracyCircle = window.L.circle([position.lat, position.lon], {
        radius: Math.min(accuracy, 1000),
        color: "#277fd2",
        fillColor: "#277fd2",
        fillOpacity: 0.09,
        weight: 1,
        interactive: false,
      }).addTo(state.map);
    }
  }

  async function fetchNearbyUnits(origin) {
    const query = `[out:json][timeout:15];(
      nwr["amenity"~"hospital|clinic|doctors"](around:${OVERPASS_RADIUS_METERS},${origin.lat},${origin.lon});
      nwr["healthcare"~"hospital|clinic|doctor"](around:${OVERPASS_RADIUS_METERS},${origin.lat},${origin.lon});
    );out center tags;`;
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 14000);

    try {
      const response = await fetch(`https://overpass-api.de/api/interpreter?data=${encodeURIComponent(query)}`, {
        headers: { Accept: "application/json" },
        signal: controller.signal,
      });
      if (!response.ok) throw new Error(`Overpass ${response.status}`);
      const payload = await response.json();
      return parseOverpassUnits(payload, origin);
    } finally {
      window.clearTimeout(timeout);
    }
  }

  async function loadUnitsAround(position) {
    showMapLoading("Procurando unidades próximas", "Consultando hospitais, UPAs e unidades de saúde no mapa.");
    let units = [];

    if (!position.isDemo) {
      try {
        units = await fetchNearbyUnits(position);
      } catch {
        showToast("Não foi possível consultar o mapa agora. Exibindo unidades demonstrativas.");
      }
    }

    if (!units.length) units = demoUnits(position);
    state.units = units;
    renderUnitMarkers();
    hideMapLoading();

    if (units.length) {
      const bounds = window.L.latLngBounds([
        [position.lat, position.lon],
        ...units.slice(0, 8).map((unit) => [unit.lat, unit.lon]),
      ]);
      state.map.fitBounds(bounds, { padding: [46, 46], maxZoom: 14 });
    }

    if (state.pendingQuery) {
      const query = state.pendingQuery;
      state.pendingQuery = "";
      findBestUnit(query);
    }
  }

  function usePosition(position, accuracy) {
    state.userPosition = position;
    addUserPositionToMap(position, accuracy);
    state.map.setView([position.lat, position.lon], 14, { animate: true });
    loadUnitsAround(position);
  }

  function requestUserLocation({ recenterOnly = false } = {}) {
    if (!state.map) return;

    if (!navigator.geolocation) {
      if (!state.userPosition) {
        showToast("Este navegador não oferece localização. Usando o mapa demonstrativo de São Paulo.");
        usePosition(DEFAULT_POSITION, 0);
      }
      return;
    }

    showMapLoading("Buscando sua localização", "Permita o acesso para encontrar unidades próximas.");
    navigator.geolocation.getCurrentPosition(
      (result) => {
        const position = {
          lat: result.coords.latitude,
          lon: result.coords.longitude,
          isDemo: false,
        };
        if (recenterOnly && state.userPosition && !state.userPosition.isDemo) {
          state.userPosition = position;
          addUserPositionToMap(position, result.coords.accuracy);
          state.map.setView([position.lat, position.lon], Math.max(state.map.getZoom(), 15), { animate: true });
          hideMapLoading();
          return;
        }
        usePosition(position, result.coords.accuracy);
      },
      () => {
        hideMapLoading();
        if (!state.userPosition) {
          showToast("Localização não autorizada. Usando uma demonstração em São Paulo; você pode tentar novamente.");
          usePosition(DEFAULT_POSITION, 0);
        } else {
          showToast("Não foi possível atualizar sua localização.");
        }
      },
      { enableHighAccuracy: true, timeout: 9000, maximumAge: 60000 },
    );
  }

  function initMap() {
    if (!window.L) {
      showMapLoading("Mapa indisponível", "Verifique sua internet e recarregue a página.");
      return;
    }

    state.map = window.L.map("health-map", {
      zoomControl: true,
      attributionControl: true,
      minZoom: 3,
    }).setView([-15.78, -47.93], 4);

    window.L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }).addTo(state.map);

    state.markerLayer = window.L.layerGroup().addTo(state.map);
    requestUserLocation();
  }

  function classifySymptoms(input) {
    const query = normalizeText(input);
    const includesAny = (words) => words.some((word) => query.includes(word));

    if (
      includesAny([
        "dor no peito",
        "falta de ar",
        "nao consigo respirar",
        "desmaio",
        "sangramento intenso",
        "convulsao",
        "avc",
        "paralisia",
        "acidente grave",
      ])
    ) {
      return { category: "urgencia", label: "possível urgência", urgent: true };
    }
    if (includesAny(["bebe", "crianca", "filho", "filha", "pediatr"])) {
      return { category: "pediatria", label: "atendimento infantil", urgent: false };
    }
    if (includesAny(["fratura", "osso", "torcao", "torci", "queda", "ortoped", "machuquei o braco", "machuquei a perna"])) {
      return { category: "ortopedia", label: "avaliação ortopédica", urgent: false };
    }
    if (includesAny(["coracao", "palpitacao", "cardio", "pressao muito alta"])) {
      return { category: "cardiologia", label: "avaliação cardiovascular", urgent: false };
    }
    if (includesAny(["vacina", "vacinacao", "imuniza"])) {
      return { category: "vacina", label: "vacinação", urgent: false };
    }
    if (includesAny(["exame", "laboratorio", "coleta", "sangue"])) {
      return { category: "exames", label: "exames", urgent: false };
    }
    return { category: "geral", label: "atendimento geral", urgent: false };
  }

  function findBestUnit(input) {
    const query = String(input || "").trim();
    if (!query) {
      showToast("Fale ou digite o que você está sentindo.");
      return;
    }

    $("#voice-transcript").textContent = `Você informou: “${query}”.`;

    if (!state.userPosition || !state.units.length) {
      state.pendingQuery = query;
      showToast("Aguarde: ainda estamos procurando unidades próximas.");
      return;
    }

    const need = classifySymptoms(query);
    const available = state.units.filter((unit) => unit.occupancy < FULL_THRESHOLD);
    if (!available.length) {
      showToast("Nenhuma unidade não lotada aparece neste protótipo. Em uma urgência, procure atendimento imediato.");
      return;
    }

    const compatible = available.filter((unit) => unit.categories.includes(need.category));
    const pool = compatible.length ? compatible : available.filter((unit) => unit.categories.includes("geral"));
    const candidates = pool.length ? pool : available;
    candidates.sort((first, second) => first.distanceKm - second.distanceKm || first.occupancy - second.occupancy);

    selectUnit(candidates[0], {
      recommended: true,
      query,
      need,
      exactMatch: compatible.length > 0,
    });
  }

  function resetRouteMetrics(unit) {
    $("#route-distance").textContent = formatDistance(unit.distanceKm);
    $("#route-duration").textContent = "calculando";
    $("#route-wait").textContent = `${Math.max(7, Math.round(unit.occupancy * 0.38))} min`;
  }

  function showRecommendation(unit, context) {
    const card = $("#recommendation-card");
    const status = occupancyStatus(unit.occupancy);
    const badge = $("#recommendation-occupancy");
    const need = context.need || { label: "atendimento geral", urgent: false };
    const compatibleText = context.exactMatch === false ? "atendimento geral disponível" : need.label;

    $("#recommendation-label").textContent = context.recommended ? "Melhor opção encontrada" : "Unidade selecionada";
    $("#recommendation-name").textContent = unit.name;
    $("#recommendation-type").textContent = unit.type;
    badge.className = `occupancy-badge ${status}`;
    badge.textContent = `${occupancyLabel(unit.occupancy)} · ${unit.occupancy}% demo`;
    $("#recommendation-reason").textContent = context.recommended
      ? `É a unidade mais próxima entre as opções compatíveis com ${compatibleText} e abaixo do limite de lotação demonstrativo.`
      : `Toque em “Abrir no GPS” para continuar a rota. A lotação exibida é apenas uma simulação.`;
    $("#urgent-warning").hidden = !need.urgent;

    const checkinButton = $("#checkin-button");
    const checked = state.checkins.has(unit.id);
    checkinButton.classList.toggle("is-complete", checked);
    checkinButton.textContent = checked ? "Check-in confirmado" : "Fazer check-in";
    checkinButton.dataset.unitId = unit.id;

    $("#gps-button").href = `https://www.google.com/maps/dir/?api=1&destination=${unit.lat},${unit.lon}`;
    resetRouteMetrics(unit);
    card.hidden = false;
  }

  function routeFallback(unit) {
    if (!state.map || !state.userPosition) return;
    const points = [
      [state.userPosition.lat, state.userPosition.lon],
      [unit.lat, unit.lon],
    ];
    state.routeLayer = window.L.polyline(points, {
      color: "#087e73",
      weight: 5,
      opacity: 0.8,
      dashArray: "9 9",
    }).addTo(state.map);
    const distanceKm = haversineKm(state.userPosition, unit);
    $("#route-distance").textContent = formatDistance(distanceKm);
    $("#route-duration").textContent = `~${Math.max(3, Math.round((distanceKm / 25) * 60))} min`;
    state.map.fitBounds(window.L.latLngBounds(points), { padding: [54, 54], maxZoom: 14 });
  }

  async function drawRoute(unit) {
    if (!state.map || !state.userPosition) return;
    if (state.routeLayer) {
      state.routeLayer.remove();
      state.routeLayer = null;
    }

    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 10000);
    const coordinates = `${state.userPosition.lon},${state.userPosition.lat};${unit.lon},${unit.lat}`;
    const url = `https://router.project-osrm.org/route/v1/driving/${coordinates}?overview=full&geometries=geojson&steps=false`;

    try {
      const response = await fetch(url, { signal: controller.signal });
      if (!response.ok) throw new Error(`OSRM ${response.status}`);
      const payload = await response.json();
      const route = payload.routes?.[0];
      if (!route?.geometry?.coordinates?.length) throw new Error("Rota ausente");

      const points = route.geometry.coordinates.map(([lon, lat]) => [lat, lon]);
      state.routeLayer = window.L.polyline(points, {
        color: "#087e73",
        weight: 6,
        opacity: 0.9,
      }).addTo(state.map);
      $("#route-distance").textContent = formatDistance(route.distance / 1000);
      $("#route-duration").textContent = `${Math.max(1, Math.round(route.duration / 60))} min`;
      state.map.fitBounds(state.routeLayer.getBounds(), { padding: [54, 54], maxZoom: 14 });
    } catch {
      routeFallback(unit);
    } finally {
      window.clearTimeout(timeout);
    }
  }

  function selectUnit(unit, context = {}) {
    state.selectedUnit = unit;
    renderUnitMarkers();
    showRecommendation(unit, context);
    drawRoute(unit);
  }

  function setListening(active) {
    state.listening = active;
    const button = $("#voice-button");
    button.classList.toggle("is-listening", active);
    button.setAttribute("aria-pressed", String(active));
    button.setAttribute("aria-label", active ? "Parar busca por voz" : "Começar busca por voz");
    $("#voice-listening").hidden = !active;
  }

  function openTextSearch() {
    const form = $("#text-search-form");
    const toggle = $("#show-text-search");
    form.hidden = false;
    toggle.setAttribute("aria-expanded", "true");
    $("#symptom-search").focus();
  }

  function initSpeechRecognition() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      $("#voice-button").title = "Busca por voz indisponível neste navegador; toque para digitar";
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = "pt-BR";
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    recognition.onstart = () => setListening(true);
    recognition.onend = () => setListening(false);
    recognition.onresult = (event) => {
      const transcript = event.results?.[0]?.[0]?.transcript || "";
      if (transcript) findBestUnit(transcript);
    };
    recognition.onerror = (event) => {
      if (event.error === "aborted") return;
      const message = event.error === "not-allowed"
        ? "O microfone não foi autorizado. Use a opção de digitar."
        : "Não consegui entender a fala. Tente novamente ou digite.";
      showToast(message);
      if (event.error === "not-allowed") openTextSearch();
    };
    state.recognition = recognition;
  }

  function shiftCard(shift) {
    const applied = state.applications.has(shift.id);
    return `
      <article class="shift-card">
        <div class="shift-card__top">
          <div class="card-identity">
            <span class="card-symbol">${icon("icon-briefcase")}</span>
            <div><strong>${shift.unit}</strong><small>${shift.area}</small></div>
          </div>
          <span class="status-badge ${shift.urgency === "Urgente" ? "status-badge--urgent" : "status-badge--available"}">${shift.urgency}</span>
        </div>
        <div class="card-meta">
          <span>${icon("icon-clock")}${shift.time}</span>
          <span>${icon("icon-map")}${shift.distance}</span>
        </div>
        <p class="card-note">${shift.note}</p>
        <div class="card-actions">
          <button class="button-primary${applied ? " is-complete" : ""}" type="button" data-apply-shift="${shift.id}">
            ${applied ? "Candidatura registrada" : "Tenho interesse"}
          </button>
          <button class="button-secondary" type="button" data-open-map aria-label="Abrir o mapa">${icon("icon-map")}</button>
        </div>
      </article>`;
  }

  function renderShifts() {
    const filtered = shifts.filter((shift) => state.shiftFilter === "todos" || shift.filter === state.shiftFilter);
    $("#shift-count").textContent = `${filtered.length} ${filtered.length === 1 ? "vaga" : "vagas"}`;
    $("#shift-list").innerHTML = filtered.map(shiftCard).join("");
  }

  function medicineCard(medicine) {
    const reserved = state.reservations.has(medicine.id);
    const networkLabel = medicine.network === "publica" ? "Rede pública" : "Farmácia parceira";
    return `
      <article class="medicine-card">
        <div class="medicine-card__top">
          <div class="card-identity">
            <span class="card-symbol">${icon("icon-pill")}</span>
            <div><strong>${medicine.name}</strong><small>${medicine.form}</small></div>
          </div>
          <span class="status-badge status-badge--available">${medicine.stock}</span>
        </div>
        <div class="card-meta">
          <span>${icon("icon-hospital")}${medicine.place}</span>
          <span>${icon("icon-map")}${medicine.distance}</span>
        </div>
        <div class="medicine-price"><strong>${medicine.price}</strong><span>${networkLabel} · ${medicine.detail}</span></div>
        <p class="card-note">${medicine.prescription ? "Receita e validação podem ser exigidas na retirada." : "Consulte as orientações de uso com um profissional."}</p>
        <div class="card-actions">
          <button class="button-primary${reserved ? " is-complete" : ""}" type="button" data-reserve-medicine="${medicine.id}">
            ${reserved ? "Reserva salva" : "Reservar (demo)"}
          </button>
          <button class="button-secondary" type="button" data-open-map aria-label="Ver locais no mapa">${icon("icon-map")}</button>
        </div>
      </article>`;
  }

  function renderMedicines() {
    const normalizedQuery = normalizeText(state.medicineQuery);
    const filtered = medicines.filter((medicine) => {
      const networkMatch = state.medicineFilter === "todos" || medicine.network === state.medicineFilter;
      const queryMatch = !normalizedQuery || normalizeText(`${medicine.name} ${medicine.form} ${medicine.place}`).includes(normalizedQuery);
      return networkMatch && queryMatch;
    });

    $("#medicine-count").textContent = `${filtered.length} ${filtered.length === 1 ? "resultado" : "resultados"}`;
    $("#medicine-list").innerHTML = filtered.length
      ? filtered.map(medicineCard).join("")
      : `<div class="empty-state">${icon("icon-search")}<strong>Nenhum medicamento encontrado</strong><span>Tente outro nome ou remova um filtro.</span></div>`;
  }

  function openReserveDialog(medicineId) {
    const medicine = medicines.find((item) => item.id === medicineId);
    if (!medicine) return;
    $("#reserve-medicine-id").value = medicine.id;
    $("#reserve-summary").innerHTML = `<strong>${medicine.name}</strong><br>${medicine.form}<br>${medicine.place} · ${medicine.distance}`;
    const dialog = $("#reserve-dialog");
    if (typeof dialog.showModal === "function") dialog.showModal();
    else dialog.setAttribute("open", "");
  }

  function bindEvents() {
    $$(".bottom-tabs [role='tab']").forEach((tab) => {
      tab.addEventListener("click", () => setActiveTab(tab.dataset.tab));
      tab.addEventListener("keydown", (event) => {
        if (!["ArrowLeft", "ArrowRight"].includes(event.key)) return;
        event.preventDefault();
        const tabs = $$(".bottom-tabs [role='tab']");
        const direction = event.key === "ArrowRight" ? 1 : -1;
        const nextIndex = (tabs.indexOf(tab) + direction + tabs.length) % tabs.length;
        setActiveTab(tabs[nextIndex].dataset.tab, true);
      });
    });

    $("#voice-button").addEventListener("click", () => {
      if (!state.recognition) {
        showToast("A busca por voz não está disponível aqui. Digite o que está sentindo.");
        openTextSearch();
        return;
      }
      try {
        if (state.listening) state.recognition.stop();
        else state.recognition.start();
      } catch {
        showToast("Aguarde um instante e tente o microfone novamente.");
      }
    });

    $("#show-text-search").addEventListener("click", () => {
      const form = $("#text-search-form");
      const willOpen = form.hidden;
      form.hidden = !willOpen;
      $("#show-text-search").setAttribute("aria-expanded", String(willOpen));
      if (willOpen) $("#symptom-search").focus();
    });

    $("#text-search-form").addEventListener("submit", (event) => {
      event.preventDefault();
      findBestUnit($("#symptom-search").value);
    });

    $("#locate-button").addEventListener("click", () => requestUserLocation({ recenterOnly: true }));

    $("#checkin-button").addEventListener("click", (event) => {
      const unitId = event.currentTarget.dataset.unitId;
      if (!unitId || state.checkins.has(unitId)) return;
      state.checkins.add(unitId);
      storage.set("osistec_checkins", Array.from(state.checkins));
      event.currentTarget.classList.add("is-complete");
      event.currentTarget.textContent = "Check-in confirmado";
      showToast("Check-in demonstrativo salvo neste aparelho.");
    });

    $("#notification-button").addEventListener("click", () => showToast("Você não tem novas notificações."));

    $("#shift-filter-button").addEventListener("click", () => {
      $(".filter-row", $("#panel-plantoes")).scrollIntoView({ behavior: "smooth", block: "center" });
    });

    $$("[data-shift-filter]").forEach((button) => {
      button.addEventListener("click", () => {
        state.shiftFilter = button.dataset.shiftFilter;
        $$("[data-shift-filter]").forEach((item) => item.classList.toggle("is-active", item === button));
        renderShifts();
      });
    });

    $$("[data-medicine-filter]").forEach((button) => {
      button.addEventListener("click", () => {
        state.medicineFilter = button.dataset.medicineFilter;
        $$("[data-medicine-filter]").forEach((item) => item.classList.toggle("is-active", item === button));
        renderMedicines();
      });
    });

    $("#medicine-search-form").addEventListener("submit", (event) => {
      event.preventDefault();
      state.medicineQuery = $("#medicine-search").value;
      renderMedicines();
    });

    $("#medicine-search").addEventListener("input", (event) => {
      state.medicineQuery = event.currentTarget.value;
      renderMedicines();
    });

    $("#shift-list").addEventListener("click", (event) => {
      const applyButton = event.target.closest("[data-apply-shift]");
      const mapButton = event.target.closest("[data-open-map]");
      if (mapButton) setActiveTab("mapa");
      if (!applyButton) return;
      const id = applyButton.dataset.applyShift;
      if (state.applications.has(id)) return;
      state.applications.add(id);
      storage.set("osistec_applications", Array.from(state.applications));
      renderShifts();
      showToast("Interesse demonstrativo registrado neste aparelho.");
    });

    $("#medicine-list").addEventListener("click", (event) => {
      const reserveButton = event.target.closest("[data-reserve-medicine]");
      const mapButton = event.target.closest("[data-open-map]");
      if (mapButton) setActiveTab("mapa");
      if (reserveButton) openReserveDialog(reserveButton.dataset.reserveMedicine);
    });

    $("#reserve-form").addEventListener("submit", (event) => {
      event.preventDefault();
      const id = $("#reserve-medicine-id").value;
      if (id) {
        state.reservations.add(id);
        storage.set("osistec_reservations", Array.from(state.reservations));
      }
      $("#reserve-dialog").close();
      renderMedicines();
      showToast("Reserva demonstrativa salva por 20 minutos.");
    });

    $("[data-close-dialog]").addEventListener("click", () => $("#reserve-dialog").close());
  }

  function registerServiceWorker() {
    if ("serviceWorker" in navigator && window.location.protocol !== "file:") {
      window.addEventListener("load", () => navigator.serviceWorker.register("./sw.js").catch(() => {}));
    }
  }

  function init() {
    renderShifts();
    renderMedicines();
    bindEvents();
    initSpeechRecognition();
    initMap();
    registerServiceWorker();
  }

  init();
})();
