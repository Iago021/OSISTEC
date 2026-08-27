(() => {
  "use strict";

  const careUnits = [
    {
      id: "upa-central",
      name: "UPA Central",
      type: "Pronto atendimento 24h",
      distance: "1,2 km",
      wait: "12 min",
      demand: "Demanda baixa",
      status: "low",
      services: "Clínica geral · Pediatria",
      keywords: "febre dor cabeça tosse mal estar pediatria urgencia emergência clinica geral",
    },
    {
      id: "ubs-jardim-azul",
      name: "UBS Jardim Azul",
      type: "Unidade básica de saúde",
      distance: "2,4 km",
      wait: "8 min",
      demand: "Demanda baixa",
      status: "low",
      services: "Vacinação · Exames · Consultas",
      keywords: "vacina vacinação exame exames consulta clinica geral rotina pressão",
    },
    {
      id: "hospital-municipal",
      name: "Hospital Municipal",
      type: "Hospital geral",
      distance: "3,8 km",
      wait: "35 min",
      demand: "Demanda moderada",
      status: "medium",
      services: "Emergência · Ortopedia · Cardiologia",
      keywords: "emergencia emergência ortopedia cardiologia dor peito fratura acidente hospital",
    },
  ];

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
        // O protótipo continua funcionando mesmo sem armazenamento local.
      }
    },
  };

  const state = {
    activeTab: "buscar",
    shiftFilter: "todos",
    medicineFilter: "todos",
    medicineQuery: "",
    checkins: new Set(storage.get("osistec_checkins")),
    applications: new Set(storage.get("osistec_applications")),
    reservations: new Set(storage.get("osistec_reservations")),
  };

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));

  function normalizeText(value) {
    return String(value || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .trim();
  }

  function icon(id, className = "") {
    return `<svg${className ? ` class="${className}"` : ""} aria-hidden="true"><use href="#${id}"></use></svg>`;
  }

  function showToast(message) {
    const toast = $("#toast");
    $("#toast-message").textContent = message;
    toast.classList.add("is-visible");
    window.clearTimeout(showToast.timer);
    showToast.timer = window.setTimeout(() => toast.classList.remove("is-visible"), 3200);
  }

  function setActiveTab(tabName, focusTab = false) {
    const nextTab = ["plantoes", "buscar", "farmacia"].includes(tabName) ? tabName : "buscar";
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

    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function careCard(unit) {
    const checked = state.checkins.has(unit.id);
    return `
      <article class="care-card">
        <div class="care-card__top">
          <div class="card-identity">
            <span class="card-symbol">${icon("icon-hospital")}</span>
            <div><strong>${unit.name}</strong><small>${unit.type}</small></div>
          </div>
          <span class="status-badge status-badge--${unit.status}">${unit.demand}</span>
        </div>
        <div class="card-meta">
          <span>${icon("icon-map")}${unit.distance}</span>
          <span>${icon("icon-clock")}Espera estimada: ${unit.wait}</span>
        </div>
        <p style="margin:12px 0 0;color:#647b8b;font-size:.69rem;line-height:1.5">${unit.services}</p>
        <div class="card-actions">
          <button class="button-primary${checked ? " is-complete" : ""}" type="button" data-checkin-unit="${unit.id}">
            ${checked ? "Check-in confirmado" : "Fazer check-in"}
          </button>
          <button class="button-secondary" type="button" data-route-unit="${unit.id}" aria-label="Ver rota para ${unit.name}">${icon("icon-map")}</button>
        </div>
      </article>`;
  }

  function renderCareUnits(units = careUnits, query = "") {
    const list = $("#care-results");
    const title = $("#care-results-title");
    title.textContent = query ? `Resultados para “${query}”` : "Unidades próximas";
    $("#care-results-count").textContent = `${units.length} ${units.length === 1 ? "opção" : "opções"}`;

    if (!units.length) {
      list.innerHTML = `<div class="empty-state">${icon("icon-search")}<strong>Nenhuma opção encontrada</strong><span>Tente buscar por sintomas, vacina, exame ou especialidade.</span></div>`;
      return;
    }

    list.innerHTML = units.map(careCard).join("");
  }

  function filterCare(query) {
    const normalized = normalizeText(query);
    if (!normalized) {
      renderCareUnits(careUnits);
      return;
    }

    const words = normalized.split(/\s+/).filter(Boolean);
    const results = careUnits.filter((unit) => {
      const searchable = normalizeText(`${unit.name} ${unit.type} ${unit.services} ${unit.keywords}`);
      return words.some((word) => searchable.includes(word));
    });
    renderCareUnits(results, query.trim());
    $("#care-results-title").scrollIntoView({ behavior: "smooth", block: "start" });
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
        <div class="shift-card__body">
          <p>${shift.note}</p>
          <button class="${applied ? "is-complete" : ""}" type="button" data-apply-shift="${shift.id}">${applied ? "Interesse enviado" : "Tenho interesse"}</button>
        </div>
      </article>`;
  }

  function renderShifts() {
    const filtered = state.shiftFilter === "todos"
      ? shifts
      : shifts.filter((shift) => shift.filter === state.shiftFilter);
    $("#shift-count").textContent = `${filtered.length} ${filtered.length === 1 ? "vaga" : "vagas"}`;
    $("#shift-list").innerHTML = filtered.map(shiftCard).join("");
  }

  function medicineCard(medicine) {
    const reserved = state.reservations.has(medicine.id);
    return `
      <article class="medicine-card">
        <div class="medicine-card__top">
          <div class="card-identity">
            <span class="card-symbol card-symbol--mint">${icon("icon-pill")}</span>
            <div>
              <strong>${medicine.name}</strong>
              <small>${medicine.form} · ${medicine.place}</small>
              ${medicine.prescription ? '<span class="prescription-badge">Receita necessária</span>' : ""}
            </div>
          </div>
          <span class="status-badge status-badge--available">${medicine.stock}</span>
        </div>
        <div class="card-meta">
          <span>${icon("icon-map")}${medicine.distance}</span>
          <span>${medicine.network === "publica" ? "Rede pública" : "Farmácia parceira"}</span>
        </div>
        <div class="medicine-card__details">
          <div class="medicine-price"><span>Opção encontrada</span><strong>${medicine.price}</strong><small>${medicine.detail}</small></div>
          <button class="reserve-button${reserved ? " is-complete" : ""}" type="button" data-reserve-medicine="${medicine.id}" ${reserved ? "disabled" : ""}>${reserved ? "Reservado" : "Reservar"}</button>
        </div>
      </article>`;
  }

  function renderMedicines() {
    const query = normalizeText(state.medicineQuery);
    const filtered = medicines.filter((medicine) => {
      const matchesNetwork = state.medicineFilter === "todos" || medicine.network === state.medicineFilter;
      const matchesQuery = !query || normalizeText(`${medicine.name} ${medicine.form} ${medicine.place}`).includes(query);
      return matchesNetwork && matchesQuery;
    });

    $("#medicine-count").textContent = `${filtered.length} ${filtered.length === 1 ? "resultado" : "resultados"}`;
    $("#medicine-list").innerHTML = filtered.length
      ? filtered.map(medicineCard).join("")
      : `<div class="empty-state">${icon("icon-pill")}<strong>Medicamento não encontrado</strong><span>Tente outro nome ou altere o filtro da rede.</span></div>`;
  }

  function openDialog(dialog) {
    if (typeof dialog.showModal === "function") dialog.showModal();
    else dialog.setAttribute("open", "");
  }

  function closeDialog(dialog) {
    if (typeof dialog.close === "function") dialog.close();
    else dialog.removeAttribute("open");
  }

  $$(".bottom-tabs [role='tab']").forEach((tab, index, tabs) => {
    tab.addEventListener("click", () => setActiveTab(tab.dataset.tab));
    tab.addEventListener("keydown", (event) => {
      if (!["ArrowLeft", "ArrowRight"].includes(event.key)) return;
      event.preventDefault();
      const direction = event.key === "ArrowRight" ? 1 : -1;
      const next = tabs[(index + direction + tabs.length) % tabs.length];
      setActiveTab(next.dataset.tab, true);
    });
  });

  $("#care-search-form").addEventListener("submit", (event) => {
    event.preventDefault();
    filterCare($("#care-search").value);
  });

  $$("[data-care-query]").forEach((button) => {
    button.addEventListener("click", () => {
      $("#care-search").value = button.dataset.careQuery;
      filterCare(button.dataset.careQuery);
    });
  });

  $("#care-results").addEventListener("click", (event) => {
    const checkinButton = event.target.closest("[data-checkin-unit]");
    if (checkinButton) {
      const id = checkinButton.dataset.checkinUnit;
      if (state.checkins.has(id)) {
        showToast("Este check-in demonstrativo já foi confirmado.");
      } else {
        state.checkins.add(id);
        storage.set("osistec_checkins", [...state.checkins]);
        renderCareUnits(careUnits);
        showToast("Check-in demonstrativo confirmado neste aparelho.");
      }
      return;
    }

    const routeButton = event.target.closest("[data-route-unit]");
    if (routeButton) {
      const unit = careUnits.find((item) => item.id === routeButton.dataset.routeUnit);
      showToast(`Rota simulada preparada para ${unit.name}.`);
    }
  });

  $$("[data-shift-filter]").forEach((button) => {
    button.addEventListener("click", () => {
      state.shiftFilter = button.dataset.shiftFilter;
      $$("[data-shift-filter]").forEach((item) => item.classList.toggle("is-active", item === button));
      renderShifts();
    });
  });

  $("#shift-list").addEventListener("click", (event) => {
    const button = event.target.closest("[data-apply-shift]");
    if (!button) return;
    const id = button.dataset.applyShift;
    if (!state.applications.has(id)) {
      state.applications.add(id);
      storage.set("osistec_applications", [...state.applications]);
      renderShifts();
    }
    showToast("Interesse registrado apenas nesta demonstração.");
  });

  $("[aria-label='Filtros de plantão']").addEventListener("click", () => {
    $("[data-shift-filter='todos']").focus();
    showToast("Escolha uma área para filtrar os plantões.");
  });

  $("#medicine-search-form").addEventListener("submit", (event) => {
    event.preventDefault();
    state.medicineQuery = $("#medicine-search").value;
    renderMedicines();
  });

  $("#medicine-search").addEventListener("input", (event) => {
    state.medicineQuery = event.target.value;
    renderMedicines();
  });

  $$("[data-medicine-filter]").forEach((button) => {
    button.addEventListener("click", () => {
      state.medicineFilter = button.dataset.medicineFilter;
      $$("[data-medicine-filter]").forEach((item) => item.classList.toggle("is-active", item === button));
      renderMedicines();
    });
  });

  const triageDialog = $("#triage-dialog");
  const reserveDialog = $("#reserve-dialog");

  $("#open-triage").addEventListener("click", () => openDialog(triageDialog));

  $("#triage-form").addEventListener("submit", (event) => {
    event.preventDefault();
    const description = $("#symptom-description").value.trim();
    if (!description || !$("input[name='intensity']:checked")) return;
    closeDialog(triageDialog);
    renderCareUnits(careUnits);
    $("#care-results-title").textContent = "Opções para avaliação presencial";
    $("#care-results-title").scrollIntoView({ behavior: "smooth", block: "start" });
    showToast("Pré-triagem demonstrativa concluída. Confirme com um profissional.");
    event.currentTarget.reset();
  });

  $("#medicine-list").addEventListener("click", (event) => {
    const button = event.target.closest("[data-reserve-medicine]");
    if (!button || button.disabled) return;
    const medicine = medicines.find((item) => item.id === button.dataset.reserveMedicine);
    $("#reserve-medicine-id").value = medicine.id;
    $("#reserve-summary").innerHTML = `<strong>${medicine.name}</strong><span>${medicine.place} · ${medicine.distance}</span><span>${medicine.price}</span>`;
    openDialog(reserveDialog);
  });

  $("#reserve-form").addEventListener("submit", (event) => {
    event.preventDefault();
    const id = $("#reserve-medicine-id").value;
    const medicine = medicines.find((item) => item.id === id);
    state.reservations.add(id);
    storage.set("osistec_reservations", [...state.reservations]);
    closeDialog(reserveDialog);
    renderMedicines();
    showToast(`${medicine.name} reservado por 20 minutos nesta demonstração.`);
  });

  $$("[data-close-dialog]").forEach((button) => {
    button.addEventListener("click", () => closeDialog(button.closest("dialog")));
  });

  [triageDialog, reserveDialog].forEach((dialog) => {
    dialog.addEventListener("click", (event) => {
      if (event.target === dialog) closeDialog(dialog);
    });
  });

  $("#notification-button").addEventListener("click", () => {
    showToast("Há novas vagas de plantão e atualizações de estoque na demonstração.");
  });

  renderCareUnits();
  renderShifts();
  renderMedicines();
  setActiveTab("buscar");

  if ("serviceWorker" in navigator && window.location.protocol.startsWith("http")) {
    window.addEventListener("load", () => navigator.serviceWorker.register("sw.js").catch(() => {}));
  }
})();
