// ── Pipeline Stepper Dashboard ──────────────────────────────────────
// Shows one step at a time, navigated via the stepper nav, Prev/Next
// buttons, or by clicking directly on a step. Full detail opens in a
// Bootstrap modal.

const ICONS = {
  mri: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <rect x="3" y="4" width="18" height="16" rx="2"/>
    <circle cx="12" cy="12" r="4.2"/>
    <circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none"/>
    <path d="M3 9h3M18 9h3M3 15h3M18 15h3"/>
  </svg>`,
  database: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <ellipse cx="12" cy="5" rx="8" ry="3"/>
    <path d="M4 5v6a8 3 0 0 0 16 0V5"/>
    <path d="M4 11v6a8 3 0 0 0 16 0v-6"/>
  </svg>`,
  bbox: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <rect x="3" y="3" width="18" height="18" rx="2"/>
    <rect x="8" y="8" width="8" height="7" stroke-dasharray="3 2"/>
    <path d="M8 6v2M16 6v2M8 16v2M16 16v2"/>
  </svg>`,
  roi: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M6 3v14a2 2 0 0 0 2 2h14"/>
    <path d="M18 21V7a2 2 0 0 0-2-2H4"/>
  </svg>`,
  cnn: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <circle cx="4.5" cy="6" r="1.6"/><circle cx="4.5" cy="12" r="1.6"/><circle cx="4.5" cy="18" r="1.6"/>
    <circle cx="12" cy="4" r="1.6"/><circle cx="12" cy="10" r="1.6"/><circle cx="12" cy="16" r="1.6"/><circle cx="12" cy="21" r="1.2"/>
    <circle cx="19.5" cy="8" r="1.6"/><circle cx="19.5" cy="15" r="1.6"/>
    <path d="M6 6l4.5-2M6 6l4.5 4M6 12l4.5-2M6 12l4.5 4M6 18l4.5-2M6 18l4.5 3"/>
    <path d="M13.5 4.5l4.5 3M13.5 10l4.5-1.5M13.5 10l4.5 5M13.5 16l4.5-1M13.5 16l4.5 0"/>
  </svg>`,
  metrics: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M3 3v18h18"/>
    <rect x="7" y="13" width="3" height="5"/>
    <rect x="12" y="9" width="3" height="9"/>
    <rect x="17" y="6" width="3" height="12"/>
  </svg>`,
};

const STEP_COLORS = ["#2563eb", "#7c3aed", "#ea580c", "#059669", "#4f46e5", "#e11d48"];
const STEP_BG = ["#eef4ff", "#f3f0ff", "#fff7ed", "#eafaf2", "#eef2ff", "#fff1f4"];

const PIPELINE_STEPS = [
  {
    id: 1,
    icon: "mri",
    title: "Input MRI",
    shortDesc: "Volumes MRI multi-fase, organizados por paciente, fase e slice.",
    fullDesc: "O pipeline começa com volumes de ressonância magnética mamária (DCE-MRI), adquiridos em múltiplas fases (pré e pós-contraste) e divididos em slices. Cada imagem é acompanhada de metadados clínicos e do rótulo do subtipo molecular do paciente.",
    algorithm: "Leitura e normalização de imagem (DICOM/JPG/PNG), organizada por caso.",
    params: ["Nº de fases por caso", "Resolução por slice", "Formato: JPG / PNG / TIFF"],
    input: "Ficheiros de imagem por slice e fase (ex: P-ISPY1-1010-000-1-16.jpg)",
    output: "Volume estruturado por caso: {paciente, estudo, fase, slice, subtipo}",
    image: "/media/bcdataset_subset_20260313_114624/images/P-ISPY1-1010-000-1-16.jpg",
    links: [{ label: "Explorar Casos", href: "/analytics#vista-caso" }],
  },
  {
    id: 2,
    icon: "database",
    title: "Organização dos Dados",
    shortDesc: "Harmonização em CSV: paciente, estudo, fase e subtipo.",
    fullDesc: "Os dados são harmonizados numa estrutura tabular consistente (CSV + imagens), permitindo associar corretamente cada imagem ao paciente, estudo, fase e subtipo molecular antes de qualquer processamento posterior.",
    algorithm: "Validação de schema fixo + indexação estruturada dos ficheiros.",
    params: ["Colunas obrigatórias: Patient_ID, Study_ID, Phase, Slice", "Mol Subtype", "Bounding box (X/Y min/max)"],
    input: "Ficheiro CSV de metadados + pasta de imagens brutas",
    output: "Dataset indexado, pronto para exploração e filtragem",
    links: [
      { label: "Página de Upload", href: "/analytics/upload" },

    ],
  },
  {
    id: 3,
    icon: "bbox",
    title: "Deteção da Lesão",
    shortDesc: "Localização automática da lesão via bounding box.",
    fullDesc: "A lesão mamária é localizada em cada slice através de uma bounding box, permitindo identificar a região mais relevante da imagem para a análise posterior, e comparar a sua posição ao longo de fases e slices.",
    algorithm: "Deteção por coordenadas anotadas (bounding box 2D por slice).",
    params: ["X_min / X_max", "Y_min / Y_max", "Comparação entre fases"],
    input: "Slice MRI (imagem completa)",
    output: "Coordenadas da bounding box da lesão",
    links: [
      { label: "Visualizador de MRI", href: "/analytics#vista-caso" },
      { label: "Evolução Tumoral", href: "/analytics#vista-evolucao" },
    ],
  },
  {
    id: 4,
    icon: "roi",
    title: "Extração da ROI",
    shortDesc: "Recorte e medição da região de interesse (largura, altura, área).",
    fullDesc: "A região de interesse (ROI) é extraída a partir da bounding box detetada, permitindo medir largura, altura e área da lesão, e acompanhar a sua evolução volumétrica ao longo de slices e fases.",
    algorithm: "Recorte da ROI + cálculo geométrico de área por slice.",
    params: ["Largura (px)", "Altura (px)", "Área (px²) por slice/fase"],
    input: "Bounding box + slice correspondente",
    output: "ROI recortada e métricas geométricas derivadas",
    links: [{ label: "Evolução Tumoral", href: "/analytics#vista-evolucao" }],
  },
  {
    id: 5,
    icon: "cnn",
    title: "Classificação 3D CNN",
    shortDesc: "Rede 3D CNN prevê o subtipo molecular a partir do volume da ROI.",
    fullDesc: "O classificador 3D CNN utiliza a informação volumétrica da ROI ao longo das fases para prever o subtipo molecular do tumor: Luminal A, Luminal B, HER2-positivo ou triplo-negativo.",
    algorithm: "3D CNN — convoluções volumétricas + pooling + camadas densas.",
    params: ["Fases de entrada por volume", "Tamanho do volume 3D", "4 classes de saída"],
    input: "Volume 3D da ROI (multi-fase)",
    output: "Subtipo molecular previsto (1 de 4 classes)",
    links: [{ label: "Reconstrução 3D", href: "/analytics#vista-3d" }],
  },
  {
    id: 6,
    icon: "metrics",
    title: "Avaliação",
    shortDesc: "Accuracy, precision, recall, F1 e AUC por subtipo.",
    fullDesc: "A etapa final mede o desempenho do classificador por subtipo molecular, com recurso a métricas como accuracy, precision, recall, F1-score, AUC e à matriz de confusão, permitindo identificar onde o modelo erra mais.",
    algorithm: "Cálculo de métricas a partir da matriz de confusão por classe.",
    params: ["TP / FP / FN / TN por subtipo", "Accuracy, Precision, Recall", "F1-score, AUC"],
    input: "Previsões do modelo + rótulos reais",
    output: "Métricas de desempenho + matriz de confusão",
    links: [{ label: "Avaliação CNN", href: "/analytics#vista-cnn" }],
    showMetrics: true,
  },
];

let currentStep = 1;
let bsModal = null;
let metricsCache = null;

function iconMarkup(iconKey) {
  return ICONS[iconKey] || "";
}

function goToStep(id) {
  if (id < 1 || id > PIPELINE_STEPS.length || id === currentStep) return;
  currentStep = id;
  renderStepper();
  renderProgress();
  renderPanel(true);
  updateNavButtons();
}

function renderStepper() {
  const nav = document.getElementById("stepperNav");
  nav.innerHTML = "";
  PIPELINE_STEPS.forEach((step) => {
    const item = document.createElement("button");
    item.type = "button";
    let stateClass = "";
    if (step.id === currentStep) stateClass = "active";
    else if (step.id < currentStep) stateClass = "completed";
    item.className = `stepper-item ${stateClass}`;
    item.innerHTML = `
      <span class="stepper-circle">${step.id < currentStep ? "✓" : step.id}</span>
      <span class="stepper-label">${step.title}</span>
    `;
    item.addEventListener("click", () => goToStep(step.id));
    nav.appendChild(item);
  });
}

function renderProgress() {
  const pct = (currentStep / PIPELINE_STEPS.length) * 100;
  document.getElementById("stepperProgressBar").style.width = `${pct}%`;
  document.getElementById("stepperProgressBar").setAttribute("aria-valuenow", String(Math.round(pct)));
  document.getElementById("stepperProgressLabel").textContent = `Etapa ${currentStep} de ${PIPELINE_STEPS.length}`;
}

function renderPanel(animate) {
  const panel = document.getElementById("stepPanel");
  const step = PIPELINE_STEPS.find(s => s.id === currentStep);
  const idx = PIPELINE_STEPS.indexOf(step);
  const color = STEP_COLORS[idx % STEP_COLORS.length];

  const buildContent = () => {
    let illustration = "";
    if (step.image) {
      illustration = `<img src="${step.image}" alt="${step.title}">`;
    } else {
      illustration = `<div style="color:${color}">${iconMarkup(step.icon)}</div>`;
    }

    panel.innerHTML = `
      <div class="step-panel-grid">
        <div class="step-panel-illustration">${illustration}</div>
        <div>
          <div class="step-panel-eyebrow" style="color:${color}">Etapa ${step.id} de ${PIPELINE_STEPS.length}</div>
          <h3 class="step-panel-title">${step.title}</h3>
          <p class="step-panel-desc">${step.shortDesc}</p>
          <div class="step-panel-io">
            <div class="step-io-block in"><span class="io-label">Input</span>${step.input}</div>
            <div class="step-io-block out"><span class="io-label">Output</span>${step.output}</div>
          </div>
          <div class="step-panel-algo"><b>Algoritmo:</b> <span>${step.algorithm}</span></div>
          <div class="step-panel-actions">
            <button class="btn btn-primary btn-sm" id="detailsBtn" type="button">Ver detalhes</button>
          </div>
        </div>
      </div>
    `;
    document.getElementById("detailsBtn").addEventListener("click", () => openDetailsModal(step.id));
  };

  if (!animate) {
    buildContent();
    return;
  }

  panel.classList.add("transitioning");
  setTimeout(() => {
    buildContent();
    panel.classList.remove("transitioning");
  }, 180);
}

function updateNavButtons() {
  document.getElementById("prevBtn").disabled = currentStep === 1;
  document.getElementById("nextBtn").disabled = currentStep === PIPELINE_STEPS.length;
  document.getElementById("nextBtn").textContent = currentStep === PIPELINE_STEPS.length ? "Concluído ✓" : "Próximo →";
}

function openDetailsModal(stepId) {
  const step = PIPELINE_STEPS.find(s => s.id === stepId);
  if (!step) return;
  const idx = PIPELINE_STEPS.indexOf(step);
  const color = STEP_COLORS[idx % STEP_COLORS.length];
  const bg = STEP_BG[idx % STEP_BG.length];

  const iconEl = document.getElementById("modalIcon");
  iconEl.innerHTML = iconMarkup(step.icon);
  iconEl.style.background = bg;
  iconEl.style.color = color;
  document.getElementById("modalEyebrow").textContent = `Etapa ${step.id} de ${PIPELINE_STEPS.length}`;
  document.getElementById("modalTitle").textContent = step.title;

  let illustrationHtml;
  if (step.image) {
    illustrationHtml = `<div class="step-modal-illustration"><img src="${step.image}" alt="${step.title}"></div>`;
  } else {
    illustrationHtml = `<div class="step-modal-illustration"><div style="color:${color}">${iconMarkup(step.icon)}</div></div>`;
  }

  const paramsHtml = step.params.map(p => `<div class="step-param-chip">${p}</div>`).join("");
  const linksHtml = step.links.map(l => `<a class="step-modal-link" href="${l.href}">${l.label} ↗</a>`).join("");

  let metricsHtml = "";
  if (step.showMetrics) {
    metricsHtml = `
      <div class="step-modal-section">
        <h4>Accuracy por Subtipo</h4>
        <div class="step-mini-metric-row" id="modalMetrics">
          <p style="color:#94a3b8; font-size:0.82rem;">A carregar métricas…</p>
        </div>
      </div>`;
  }

  document.getElementById("modalBody").innerHTML = `
    ${illustrationHtml}
    <div class="step-modal-section">
      <h4>Explicação</h4>
      <p>${step.fullDesc}</p>
    </div>
    <div class="step-modal-section">
      <h4>Algoritmo Utilizado</h4>
      <p>${step.algorithm}</p>
    </div>
    <div class="step-modal-section">
      <h4>Principais Parâmetros</h4>
      <div class="step-modal-params">${paramsHtml}</div>
    </div>
    <div class="step-modal-section">
      <h4>Exemplo de Entrada / Saída</h4>
      <div class="step-io-examples">
        <div class="io-example-box in"><span class="io-label">Input</span>${step.input}</div>
        <div class="io-example-box out"><span class="io-label">Output</span>${step.output}</div>
      </div>
    </div>
    ${metricsHtml}
    <div class="step-modal-section">
      <h4>Ligações</h4>
      <div class="step-modal-links">${linksHtml}</div>
    </div>
  `;

  if (!bsModal) {
    bsModal = new bootstrap.Modal(document.getElementById("stepDetailModal"));
  }
  bsModal.show();

  if (step.showMetrics) loadMetrics();
}

async function loadMetrics() {
  const container = document.getElementById("modalMetrics");
  if (!container) return;
  try {
    if (!metricsCache) {
      const res = await fetch("/api/model-metrics");
      metricsCache = await res.json();
    }
    const subtypes = metricsCache.subtypes || {};
    container.innerHTML = Object.entries(subtypes).map(([name, m]) => {
      const pct = Math.round(m.accuracy * 100);
      return `
        <div class="step-mini-metric">
          <span class="mm-label">${name}</span>
          <span class="mm-bar-track"><span class="mm-bar-fill" style="width:${pct}%"></span></span>
          <span class="mm-value">${pct}%</span>
        </div>`;
    }).join("");
  } catch (e) {
    container.innerHTML = `<p style="color:#94a3b8; font-size:0.82rem;">Métricas indisponíveis.</p>`;
  }
}

document.addEventListener("DOMContentLoaded", () => {
  renderStepper();
  renderProgress();
  renderPanel(false);
  updateNavButtons();

  document.getElementById("prevBtn").addEventListener("click", () => goToStep(currentStep - 1));
  document.getElementById("nextBtn").addEventListener("click", () => {
    if (currentStep === PIPELINE_STEPS.length) return;
    goToStep(currentStep + 1);
  });

  document.addEventListener("keydown", (e) => {
    const modalEl = document.getElementById("stepDetailModal");
    if (modalEl.classList.contains("show")) return;
    if (e.key === "ArrowRight") goToStep(currentStep + 1);
    if (e.key === "ArrowLeft") goToStep(currentStep - 1);
  });
});