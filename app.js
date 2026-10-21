(() => {
  "use strict";

  const MOGI_GUACU_POSITION = {
    lat: -22.367928,
    lon: -46.943198,
    isDemo: false,
    fixedCity: true,
  };
  const FULL_THRESHOLD = 85;
  const ROUTE_SOURCE_ID = "osistec-route-source";
  const ROUTE_LAYER_ID = "osistec-route-line";
  const FACILITIES_SOURCE_ID = "osistec-facilities-source";
  const FACILITIES_HALO_LAYER_ID = "osistec-facilities-halo";
  const FACILITIES_LAYER_ID = "osistec-facilities";
  const FACILITIES_ICON_LAYER_ID = "osistec-facilities-icon";
  const USER_POSITION_SOURCE_ID = "osistec-user-position-source";
  const USER_POSITION_LAYER_ID = "osistec-user-position";

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

  const shifts = [
    {
      id: "upa-central-noite",
      title: "Clínica médica — noite",
      unit: "UPA Central de Mogi Guaçu",
      address: "Região central · Mogi Guaçu",
      time: "19h às 7h",
      duration: "12 horas",
      compensation: "R$ 1.450 demo",
      dayOffset: 0,
      urgent: true,
    },
    {
      id: "hospital-municipal-dia",
      title: "Clínica médica — diurno",
      unit: "Hospital Municipal (demo)",
      address: "Jardim Novo · Mogi Guaçu",
      time: "7h às 19h",
      duration: "12 horas",
      compensation: "R$ 1.300 demo",
      dayOffset: 1,
      urgent: false,
    },
    {
      id: "upa-pediatria",
      title: "Apoio em pediatria",
      unit: "UPA Norte (demo)",
      address: "Zona Norte · Mogi Guaçu",
      time: "13h às 19h",
      duration: "6 horas",
      compensation: "R$ 820 demo",
      dayOffset: 2,
      urgent: false,
    },
    {
      id: "ubs-fim-semana",
      title: "Atendimento ambulatorial",
      unit: "UBS Jardim Guaçu (demo)",
      address: "Jardim Guaçu · Mogi Guaçu",
      time: "8h às 16h",
      duration: "8 horas",
      compensation: "R$ 900 demo",
      dayOffset: 4,
      urgent: false,
    },
  ];

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));

  function loadMapLibrary() {
    if (!window.OSISTECRuntime?.maplibre) throw new Error("Biblioteca do mapa ausente. Extraia toda a pasta do ZIP.");
    return window.OSISTECRuntime.maplibre;
  }

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
    user: null,
    activeTab: "mapa",
    shiftFilter: "todos",
    medicineFilter: "todos",
    medicineQuery: "",
    applications: new Set(),
    reservations: new Set(),
    checkins: new Set(),
    readNotifications: new Set(),
    map: null,
    maplibre: null,
    mapReady: false,
    mapStarting: false,
    offlineBundle: null,
    offlineRouter: null,
    routeRequestId: 0,
    routeLayer: null,
    userPosition: null,
    units: [],
    unitsRequestId: 0,
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
    const allowedTabs = state.user?.role === "doctor" ? ["plantoes", "mapa", "farmacia", "registros"] : ["mapa", "farmacia", "registros"];
    const nextTab = allowedTabs.includes(tabName) ? tabName : "mapa";
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

    if (nextTab === "mapa" && state.mapReady) {
      window.setTimeout(() => state.map.resize(), 30);
    } else if (nextTab === "registros") {
      renderRecords();
      window.scrollTo({ top: 0, behavior: "smooth" });
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

  function knownUnits(origin) {
    return state.offlineBundle.units.map((entry) => ({
      ...entry,
      type: unitType(entry.tags, entry.name),
      categories: unitServices(entry.tags, entry.name, unitType(entry.tags, entry.name)),
      occupancy: occupancyFor(entry.id),
      distanceKm: haversineKm(origin, entry),
    })).sort((first, second) => first.distanceKm - second.distanceKm);
  }

  function facilitiesGeoJson() {
    return {
      type: "FeatureCollection",
      features: state.units.map((unit) => ({
        type: "Feature",
        id: unit.id,
        properties: {
          id: unit.id,
          status: occupancyStatus(unit.occupancy),
          selected: state.selectedUnit?.id === unit.id ? 1 : 0,
        },
        geometry: {
          type: "Point",
          coordinates: [unit.lon, unit.lat],
        },
      })),
    };
  }

  function ensureFacilityLayers() {
    if (state.map.getSource(FACILITIES_SOURCE_ID)) return;

    state.map.addSource(FACILITIES_SOURCE_ID, {
      type: "geojson",
      data: facilitiesGeoJson(),
    });
    state.map.addLayer({
      id: FACILITIES_HALO_LAYER_ID,
      type: "circle",
      source: FACILITIES_SOURCE_ID,
      paint: {
        "circle-radius": ["case", ["==", ["get", "selected"], 1], 23, 0],
        "circle-color": "#27c8b6",
        "circle-opacity": 0.28,
      },
    });
    state.map.addLayer({
      id: FACILITIES_LAYER_ID,
      type: "circle",
      source: FACILITIES_SOURCE_ID,
      paint: {
        "circle-radius": 15,
        "circle-color": [
          "match",
          ["get", "status"],
          "low", "#15966f",
          "medium", "#ce8121",
          "full", "#c84848",
          "#278fbc",
        ],
        "circle-stroke-color": "#ffffff",
        "circle-stroke-width": 3,
      },
    });
    state.map.addLayer({
      id: FACILITIES_ICON_LAYER_ID,
      type: "symbol",
      source: FACILITIES_SOURCE_ID,
      layout: {
        "text-field": "+",
        "text-font": ["Noto Sans Regular"],
        "text-size": 18,
        "text-allow-overlap": true,
        "text-ignore-placement": true,
      },
      paint: { "text-color": "#ffffff" },
    });

    state.map.on("click", FACILITIES_LAYER_ID, (event) => {
      const id = String(event.features?.[0]?.properties?.id || "");
      const unit = state.units.find((item) => item.id === id);
      if (unit) selectUnit(unit, { recommended: false });
    });
    state.map.on("mouseenter", FACILITIES_LAYER_ID, () => {
      state.map.getCanvas().style.cursor = "pointer";
    });
    state.map.on("mouseleave", FACILITIES_LAYER_ID, () => {
      state.map.getCanvas().style.cursor = "";
    });
  }

  function renderUnitMarkers() {
    if (!state.mapReady || !state.map) return;
    ensureFacilityLayers();
    state.map.getSource(FACILITIES_SOURCE_ID).setData(facilitiesGeoJson());
    const picker = $("#unit-picker");
    const selected = state.selectedUnit?.id || "";
    picker.innerHTML = '<option value="">Escolher uma unidade de saúde</option>'
      + state.units.map((unit) => `<option value="${escapeHtml(unit.id)}">${escapeHtml(unit.name)}</option>`).join("");
    picker.value = selected;
  }

  function ensureUserPositionLayer() {
    if (state.map.getSource(USER_POSITION_SOURCE_ID)) return;
    state.map.addSource(USER_POSITION_SOURCE_ID, {
      type: "geojson",
      data: { type: "FeatureCollection", features: [] },
    });
    state.map.addLayer({
      id: USER_POSITION_LAYER_ID,
      type: "circle",
      source: USER_POSITION_SOURCE_ID,
      paint: {
        "circle-radius": 9,
        "circle-color": "#277fd2",
        "circle-stroke-color": "#ffffff",
        "circle-stroke-width": 3,
      },
    });
  }

  function addUserPositionToMap(position) {
    if (!state.mapReady || !state.map) return;
    ensureUserPositionLayer();
    state.map.getSource(USER_POSITION_SOURCE_ID).setData({
      type: "FeatureCollection",
      features: [{
        type: "Feature",
        properties: {
          title: position.fixedCity ? "Centro de Mogi Guaçu" : "Sua localização",
        },
        geometry: {
          type: "Point",
          coordinates: [position.lon, position.lat],
        },
      }],
    });
  }

  function fitUnitsOnMap(position, units) {
    if (!state.mapReady || !units.length) return;
    const coordinates = [[position.lon, position.lat], ...units.slice(0, 8).map((unit) => [unit.lon, unit.lat])];
    const longitudes = coordinates.map(([lon]) => lon);
    const latitudes = coordinates.map(([, lat]) => lat);
    state.map.fitBounds(
      [
        [Math.min(...longitudes), Math.min(...latitudes)],
        [Math.max(...longitudes), Math.max(...latitudes)],
      ],
      {
        padding: { top: 166, right: 46, bottom: 92, left: 46 },
        maxZoom: 14,
        duration: 0,
      },
    );
  }

  function fitRouteOnMap(points) {
    if (!state.mapReady || !points.length) return;
    const coordinates = points.map(([lat, lon]) => [lon, lat]);
    const longitudes = coordinates.map(([lon]) => lon);
    const latitudes = coordinates.map(([, lat]) => lat);
    state.map.fitBounds(
      [
        [Math.min(...longitudes), Math.min(...latitudes)],
        [Math.max(...longitudes), Math.max(...latitudes)],
      ],
      { padding: { top: 166, right: 46, bottom: 240, left: 46 }, maxZoom: 14, duration: 450 },
    );
  }

  async function loadUnitsAround(position) {
    showMapLoading("Preparando o mapa", "Exibindo unidades de saúde em Mogi Guaçu.");

    // O mapa precisa continuar útil mesmo sem acesso ao serviço de dados.
    const fallbackUnits = knownUnits(position);
    state.units = fallbackUnits;
    renderUnitMarkers();
    fitUnitsOnMap(position, fallbackUnits);
    hideMapLoading();

    if (state.pendingQuery) {
      const query = state.pendingQuery;
      state.pendingQuery = "";
      findBestUnit(query);
    }

  }

  function centerOnMogiGuacu({ reloadUnits = false } = {}) {
    if (!state.mapReady) return;
    const position = { ...MOGI_GUACU_POSITION };
    state.userPosition = position;
    addUserPositionToMap(position);
    state.map.flyTo({
      center: [position.lon, position.lat],
      zoom: 13.4,
      essential: true,
      duration: 550,
    });

    if (reloadUnits || !state.units.length) loadUnitsAround(position);
    else showToast("Mapa centralizado em Mogi Guaçu.");
  }

  async function initMap() {
    if (state.map || state.mapStarting) return;
    state.mapStarting = true;
    showMapLoading("Carregando mapa", "Preparando o mapa interativo de Mogi Guaçu.");

    try {
      const maplibre = loadMapLibrary();
      const offlineModule = window.OSISTECRuntime;
      state.offlineBundle = await offlineModule.loadOfflineBundle();
      state.offlineRouter = offlineModule.createRouter(state.offlineBundle.roads);
      if (!state.user) {
        state.mapStarting = false;
        return;
      }

      state.maplibre = maplibre;
      state.map = new maplibre.Map({
        container: "health-map",
        style: state.offlineBundle.style,
        center: [MOGI_GUACU_POSITION.lon, MOGI_GUACU_POSITION.lat],
        zoom: 13.4,
        minZoom: 11,
        maxZoom: 18,
        maxBounds: [[-47.01, -22.42], [-46.88, -22.30]],
        attributionControl: true,
      });
      state.map.addControl(new maplibre.NavigationControl({ showCompass: false }), "top-left");

      state.map.on("load", () => {
        state.mapReady = true;
        state.mapStarting = false;
        centerOnMogiGuacu({ reloadUnits: true });
      });
      const observer = new ResizeObserver(() => state.map?.resize());
      observer.observe($("#health-map"));
      state.map.on("error", () => {
        if (!state.mapReady) {
          showMapLoading("Mapa indisponível", "Não foi possível carregar a base do mapa. Tente recarregar a página.");
        }
      });
    } catch (error) {
      state.mapStarting = false;
      showMapLoading("Não foi possível abrir o mapa", error.message || "Confira se o ZIP foi extraído por completo e abra o index.html novamente.");
    }
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

  function clearRoute() {
    if (!state.mapReady) {
      state.routeLayer = null;
      return;
    }
    if (state.map.getLayer(ROUTE_LAYER_ID)) state.map.removeLayer(ROUTE_LAYER_ID);
    if (state.map.getSource(ROUTE_SOURCE_ID)) state.map.removeSource(ROUTE_SOURCE_ID);
    state.routeLayer = null;
  }

  function renderRoute(points, dashed = false) {
    if (!state.mapReady) return;
    clearRoute();
    state.map.addSource(ROUTE_SOURCE_ID, {
      type: "geojson",
      data: {
        type: "Feature",
        properties: {},
        geometry: {
          type: "LineString",
          coordinates: points.map(([lat, lon]) => [lon, lat]),
        },
      },
    });
    state.map.addLayer({
      id: ROUTE_LAYER_ID,
      type: "line",
      source: ROUTE_SOURCE_ID,
      layout: {
        "line-cap": "round",
        "line-join": "round",
      },
      paint: {
        ...(dashed ? { "line-dasharray": [2, 2] } : {}),
        "line-color": "#087e73",
        "line-width": dashed ? 4 : 5,
        "line-opacity": 0.9,
      },
    }, state.map.getLayer(USER_POSITION_LAYER_ID) ? USER_POSITION_LAYER_ID : undefined);
    state.routeLayer = true;
    fitRouteOnMap(points);
  }

  function routeFallback(unit) {
    if (!state.mapReady || !state.userPosition) return;
    const points = [
      [state.userPosition.lat, state.userPosition.lon],
      [unit.lat, unit.lon],
    ];
    renderRoute(points, true);
    const distanceKm = haversineKm(state.userPosition, unit);
    $("#route-distance").textContent = formatDistance(distanceKm);
    $("#route-duration").textContent = "Indisponível";
    $("#route-note").textContent = "Traçado pontilhado: distância em linha reta. Não foi encontrada uma rota por ruas até este ponto.";
  }

  async function drawRoute(unit) {
    if (!state.mapReady || !state.userPosition) return;
    const requestId = ++state.routeRequestId;
    clearRoute();
    try {
      const route = state.offlineRouter?.(
        [state.userPosition.lon, state.userPosition.lat], [unit.lon, unit.lat],
      );
      if (requestId !== state.routeRequestId) return;
      if (!route?.coordinates?.length) throw new Error("Rota local ausente");
      const points = route.coordinates.map(([lon, lat]) => [lat, lon]);
      renderRoute(points);
      $("#route-distance").textContent = formatDistance(route.distance / 1000);
      $("#route-duration").textContent = `~${Math.max(1, Math.round(route.duration / 60))} min`;
      $("#route-note").textContent = "Rota pelas ruas salvas de Mogi Guaçu. Tempo estimado, sem trânsito ou interdições em tempo real.";
    } catch {
      if (requestId === state.routeRequestId) routeFallback(unit);
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
      $("#voice-button").title = "Busca por voz indisponível; toque para digitar";
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

  function shiftDate(dayOffset) {
    const date = new Date();
    date.setHours(12, 0, 0, 0);
    date.setDate(date.getDate() + dayOffset);
    return date;
  }

  function shiftDateLabel(dayOffset) {
    const prefix = dayOffset === 0 ? "Hoje" : dayOffset === 1 ? "Amanhã" : "";
    const date = shiftDate(dayOffset).toLocaleDateString("pt-BR", {
      weekday: "short",
      day: "2-digit",
      month: "short",
    });
    return prefix ? `${prefix} · ${date}` : date;
  }

  function shiftCard(shift) {
    const applied = state.applications.has(shift.id);
    return `
      <article class="shift-card">
        <div class="shift-card__top">
          <span class="shift-date">${escapeHtml(shiftDateLabel(shift.dayOffset))}</span>
          ${shift.urgent ? '<span class="urgent-shift">Cobertura prioritária</span>' : '<span class="status-badge status-badge--available">Disponível</span>'}
        </div>
        <h3>${escapeHtml(shift.title)}</h3>
        <p class="shift-unit">${icon("icon-hospital")}${escapeHtml(shift.unit)}</p>
        <p class="shift-address">${icon("icon-map")}${escapeHtml(shift.address)}</p>
        <div class="shift-facts">
          <span><small>Horário</small><strong>${escapeHtml(shift.time)}</strong></span>
          <span><small>Duração</small><strong>${escapeHtml(shift.duration)}</strong></span>
          <span><small>Valor</small><strong>${escapeHtml(shift.compensation)}</strong></span>
        </div>
        <button class="shift-apply-button${applied ? " is-applied" : ""}" type="button" data-shift-apply="${escapeHtml(shift.id)}">
          ${applied ? `${icon("icon-check")} Candidatura enviada — cancelar` : "Tenho interesse"}
        </button>
      </article>`;
  }

  function renderShifts() {
    if (state.user?.role !== "doctor") return;
    const filtered = shifts.filter((shift) => {
      if (state.shiftFilter === "hoje") return shift.dayOffset === 0;
      if (state.shiftFilter === "proximos") return shift.dayOffset > 0;
      if (state.shiftFilter === "candidatados") return state.applications.has(shift.id);
      return true;
    });
    $("#shift-count").textContent = `${filtered.length} ${filtered.length === 1 ? "plantão" : "plantões"}`;
    $("#shift-list").innerHTML = filtered.length
      ? filtered.map(shiftCard).join("")
      : `<div class="empty-state">${icon("icon-briefcase")}<strong>Nenhum plantão neste filtro</strong><span>Escolha outro filtro para ver as oportunidades.</span></div>`;
  }

  function recordMedicineCard(medicine) {
    const networkLabel = medicine.network === "publica" ? "Rede pública" : "Farmácia parceira";
    return `
      <article class="record-card">
        <div class="record-card__top">
          <span class="record-card__icon">${icon("icon-pill")}</span>
          <div><strong>${escapeHtml(medicine.name)}</strong><small>${escapeHtml(medicine.form)}</small></div>
          <span class="record-status">Reservado</span>
        </div>
        <div class="record-card__details">
          <span>${icon("icon-hospital")}<strong>${escapeHtml(medicine.place)}</strong></span>
          <span>${icon("icon-map")}<strong>${escapeHtml(medicine.distance)}</strong></span>
          <span>${icon("icon-check")}<strong>${escapeHtml(networkLabel)}</strong></span>
        </div>
        <button class="record-remove-button" type="button" data-cancel-reservation="${escapeHtml(medicine.id)}">Cancelar reserva</button>
      </article>`;
  }

  function recordShiftCard(shift) {
    return `
      <article class="record-card">
        <div class="record-card__top">
          <span class="record-card__icon record-card__icon--blue">${icon("icon-briefcase")}</span>
          <div><strong>${escapeHtml(shift.title)}</strong><small>${escapeHtml(shiftDateLabel(shift.dayOffset))}</small></div>
          <span class="record-status">Registrado</span>
        </div>
        <div class="record-card__details">
          <span>${icon("icon-hospital")}<strong>${escapeHtml(shift.unit)}</strong></span>
          <span>${icon("icon-clock")}<strong>${escapeHtml(shift.time)}</strong></span>
          <span>${icon("icon-map")}<strong>${escapeHtml(shift.address)}</strong></span>
        </div>
        <button class="record-remove-button" type="button" data-cancel-application="${escapeHtml(shift.id)}">Cancelar candidatura</button>
      </article>`;
  }

  function renderRecords() {
    if (!state.user) return;
    const reservedMedicines = medicines.filter((medicine) => state.reservations.has(medicine.id));
    const selectedShifts = shifts.filter((shift) => state.applications.has(shift.id));
    const isDoctor = state.user.role === "doctor";

    $("#records-summary").classList.toggle("is-patient", !isDoctor);
    $("#records-medicine-total").textContent = String(reservedMedicines.length);
    $("#records-medicine-count").textContent = `${reservedMedicines.length} ${reservedMedicines.length === 1 ? "reserva" : "reservas"}`;
    $("#records-medicine-list").innerHTML = reservedMedicines.length
      ? reservedMedicines.map(recordMedicineCard).join("")
      : `<div class="empty-state empty-state--compact">${icon("icon-pill")}<strong>Nenhum medicamento reservado</strong><span>Escolha um item na Farmácia para ele aparecer aqui.</span><button type="button" data-open-tab="farmacia">Ir para Farmácia</button></div>`;

    if (isDoctor) {
      $("#records-shift-total").textContent = String(selectedShifts.length);
      $("#records-shift-count").textContent = `${selectedShifts.length} ${selectedShifts.length === 1 ? "candidatura" : "candidaturas"}`;
      $("#records-shift-list").innerHTML = selectedShifts.length
        ? selectedShifts.map(recordShiftCard).join("")
        : `<div class="empty-state empty-state--compact">${icon("icon-briefcase")}<strong>Nenhum plantão escolhido</strong><span>Demonstre interesse em um plantão para registrá-lo aqui.</span><button type="button" data-open-tab="plantoes">Ver Plantões</button></div>`;
    }
  }

  function notificationItems() {
    if (!state.user) return [];
    const items = [];

    state.reservations.forEach((medicineId) => {
      const medicine = medicines.find((item) => item.id === medicineId);
      if (!medicine) return;
      items.push({
        id: `medicine-${medicine.id}`,
        iconId: "icon-pill",
        title: "Medicamento reservado",
        detail: `${medicine.name} em ${medicine.place}.`,
        tab: "registros",
      });
    });

    if (state.user.role === "doctor") {
      state.applications.forEach((shiftId) => {
        const shift = shifts.find((item) => item.id === shiftId);
        if (!shift) return;
        items.push({
          id: `shift-${shift.id}`,
          iconId: "icon-briefcase",
          title: "Plantão registrado",
          detail: `${shift.title} · ${shiftDateLabel(shift.dayOffset)}.`,
          tab: "registros",
        });
      });
      items.push({
        id: "available-shifts",
        iconId: "icon-clock",
        title: "Plantões disponíveis",
        detail: `${shifts.length} oportunidades estão abertas em Mogi Guaçu.`,
        tab: "plantoes",
      });
    }

    if (state.checkins.size) {
      items.push({
        id: `checkins-${Array.from(state.checkins).sort().join("-")}`,
        iconId: "icon-hospital",
        title: "Check-in confirmado",
        detail: `${state.checkins.size} ${state.checkins.size === 1 ? "check-in confirmado" : "check-ins confirmados"}.`,
        tab: "mapa",
      });
    }

    items.push({
      id: "account-ready",
      iconId: "icon-shield",
      title: "Conta pronta para uso",
      detail: "Suas escolhas e atualizações ficam organizadas em Meus registros.",
      tab: "registros",
    });
    return items;
  }

  function notificationCard(item) {
    const isRead = state.readNotifications.has(item.id);
    return `
      <button class="notification-item${isRead ? " is-read" : ""}" type="button" data-notification-id="${escapeHtml(item.id)}" data-notification-tab="${escapeHtml(item.tab)}">
        <span class="notification-item__icon">${icon(item.iconId)}</span>
        <span><strong>${escapeHtml(item.title)}</strong><small>${escapeHtml(item.detail)}</small></span>
        <i aria-label="${isRead ? "Lida" : "Não lida"}"></i>
      </button>`;
  }

  function renderNotifications() {
    if (!state.user) return;
    const items = notificationItems();
    const unreadCount = items.filter((item) => !state.readNotifications.has(item.id)).length;
    const badge = $("#notification-count");
    badge.textContent = unreadCount > 9 ? "9+" : String(unreadCount);
    badge.hidden = unreadCount === 0;
    $("#notification-button").setAttribute("aria-label", unreadCount
      ? `Ver notificações: ${unreadCount} ${unreadCount === 1 ? "não lida" : "não lidas"}`
      : "Ver notificações");
    $("#notification-summary").textContent = unreadCount
      ? `Você tem ${unreadCount} ${unreadCount === 1 ? "atualização não lida" : "atualizações não lidas"}.`
      : "Todas as atualizações foram lidas.";
    $("#notification-list").innerHTML = items.map(notificationCard).join("");
    $("#notification-read-button").disabled = unreadCount === 0;
  }

  function openNotifications() {
    renderNotifications();
    const dialog = $("#notification-dialog");
    if (typeof dialog.showModal === "function") dialog.showModal();
    else dialog.setAttribute("open", "");
  }

  function closeNotifications() {
    const dialog = $("#notification-dialog");
    if (typeof dialog.close === "function" && dialog.open) dialog.close();
    else dialog.removeAttribute("open");
  }

  function perUserKey(type) {
    return `osistec_${type}_${state.user?.id || "sem-conta"}`;
  }

  function resetPrivateScreen() {
    state.pendingQuery = "";
    state.selectedUnit = null;
    $("#symptom-search").value = "";
    $("#voice-transcript").textContent = "Toque no microfone e fale, por exemplo: “estou com febre”.";
    $("#recommendation-card").hidden = true;
    clearRoute();
  }

  function applyAuthenticatedUser(user) {
    state.user = user;
    if (!user) {
      resetPrivateScreen();
      return;
    }

    const isDoctor = user.role === "doctor";
    $$("[data-role-only='doctor']").forEach((element) => {
      element.hidden = !isDoctor;
    });
    $("#bottom-tabs").classList.toggle("has-doctor", isDoctor);

    state.applications = new Set(storage.get(perUserKey("applications")));
    state.reservations = new Set(storage.get(perUserKey("reservations")));
    state.checkins = new Set(storage.get(perUserKey("checkins")));
    state.readNotifications = new Set(storage.get(perUserKey("notifications_read")));
    resetPrivateScreen();
    renderMedicines();

    if (isDoctor) {
      const initial = String(user.name || "M").trim().charAt(0).toUpperCase() || "M";
      $("#doctor-summary-initial").textContent = initial;
      $("#doctor-summary-name").textContent = user.name || "Médico";
      $("#doctor-summary-credential").textContent = `CRM ${user.crm || "—"}/${user.crmState || "—"}`;
      $("#doctor-summary-specialty").textContent = user.specialty || "Especialidade não informada";
      renderShifts();
    }

    renderRecords();
    renderNotifications();

    setActiveTab("mapa");
    if (!state.map) initMap();
    else if (state.mapReady) window.setTimeout(() => state.map.resize(), 50);
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
        const tabs = $$(".bottom-tabs [role='tab']:not([hidden])");
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

    $("#locate-button").addEventListener("click", () => centerOnMogiGuacu());
    $("#unit-picker").addEventListener("change", (event) => {
      const unit = state.units.find((item) => item.id === event.target.value);
      if (unit) selectUnit(unit, { recommended: false });
    });

    $("#checkin-button").addEventListener("click", (event) => {
      const unitId = event.currentTarget.dataset.unitId;
      if (!unitId || state.checkins.has(unitId)) return;
      state.checkins.add(unitId);
      storage.set(perUserKey("checkins"), Array.from(state.checkins));
      event.currentTarget.classList.add("is-complete");
      event.currentTarget.textContent = "Check-in confirmado";
      showToast("Check-in demonstrativo confirmado.");
      renderNotifications();
    });

    $("#notification-button").addEventListener("click", openNotifications);
    $("[data-close-notifications]").addEventListener("click", closeNotifications);
    $("#notification-read-button").addEventListener("click", () => {
      state.readNotifications = new Set(notificationItems().map((item) => item.id));
      storage.set(perUserKey("notifications_read"), Array.from(state.readNotifications));
      renderNotifications();
      showToast("Notificações marcadas como lidas.");
    });
    $("#notification-list").addEventListener("click", (event) => {
      const item = event.target.closest("[data-notification-id]");
      if (!item) return;
      state.readNotifications.add(item.dataset.notificationId);
      storage.set(perUserKey("notifications_read"), Array.from(state.readNotifications));
      const targetTab = item.dataset.notificationTab;
      renderNotifications();
      if (targetTab) {
        closeNotifications();
        setActiveTab(targetTab);
      }
    });

    $$("[data-shift-filter]").forEach((button) => {
      button.addEventListener("click", () => {
        if (state.user?.role !== "doctor") return;
        state.shiftFilter = button.dataset.shiftFilter;
        $$("[data-shift-filter]").forEach((item) => item.classList.toggle("is-active", item === button));
        renderShifts();
      });
    });

    $("#shift-list").addEventListener("click", (event) => {
      const button = event.target.closest("[data-shift-apply]");
      if (!button || state.user?.role !== "doctor") return;
      const shiftId = button.dataset.shiftApply;
      if (state.applications.has(shiftId)) {
        state.applications.delete(shiftId);
        showToast("Candidatura demonstrativa cancelada.");
      } else {
        state.applications.add(shiftId);
        showToast("Interesse registrado com sucesso.");
      }
      storage.set(perUserKey("applications"), Array.from(state.applications));
      renderShifts();
      renderRecords();
      renderNotifications();
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
        storage.set(perUserKey("reservations"), Array.from(state.reservations));
      }
      $("#reserve-dialog").close();
      renderMedicines();
      renderRecords();
      renderNotifications();
      showToast("Reserva demonstrativa salva por 20 minutos.");
    });

    $("[data-close-dialog]").addEventListener("click", () => $("#reserve-dialog").close());

    $("#panel-registros").addEventListener("click", (event) => {
      const openTabButton = event.target.closest("[data-open-tab]");
      const reservationButton = event.target.closest("[data-cancel-reservation]");
      const applicationButton = event.target.closest("[data-cancel-application]");

      if (openTabButton) {
        setActiveTab(openTabButton.dataset.openTab);
        return;
      }

      if (reservationButton) {
        state.reservations.delete(reservationButton.dataset.cancelReservation);
        storage.set(perUserKey("reservations"), Array.from(state.reservations));
        renderMedicines();
        renderRecords();
        renderNotifications();
        showToast("Reserva demonstrativa cancelada.");
        return;
      }

      if (applicationButton && state.user?.role === "doctor") {
        state.applications.delete(applicationButton.dataset.cancelApplication);
        storage.set(perUserKey("applications"), Array.from(state.applications));
        renderShifts();
        renderRecords();
        renderNotifications();
        showToast("Candidatura demonstrativa cancelada.");
      }
    });
  }

  function registerServiceWorker() {
    if (window.location.protocol !== "file:") {
      const manifest = document.createElement("link");
      manifest.rel = "manifest";
      manifest.href = "manifest.webmanifest?v=16";
      document.head.appendChild(manifest);
    }
    if ("serviceWorker" in navigator && window.location.protocol !== "file:") {
      window.addEventListener("load", async () => {
        try {
          const registration = await navigator.serviceWorker.register("./sw.js", { updateViaCache: "none" });
          await registration.update();
        } catch {
          // O aplicativo continua funcional quando o modo offline não está disponível.
        }
      });
    }
  }

  function init() {
    bindEvents();
    initSpeechRecognition();
    window.addEventListener("osistec:authchange", (event) => applyAuthenticatedUser(event.detail.user));
    window.OSISTECAuth?.init();
    registerServiceWorker();
  }

  init();
})();
