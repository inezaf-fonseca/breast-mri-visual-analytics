Chart.defaults.font.family = "Arial, sans-serif";
Chart.defaults.color = "#526277";

let allRows = [];
let filteredRows = [];
let currentPhaseRows = [];
let currentSliceIndex = 0;
let currentPhase = null;
let selectedSlice = null;
// Caso apresentado na Vista 1, independente da ausência de filtros globais.
let activeCaseKey = null;
let activeCaseChosenAutomatically = true;

let slicesByPhaseChart;
let roiAreaByPhaseChart;
let roiAreaChart;
let roiIntensityChart;
// Intervalo de cortes selecionado para análise exploratória da Vista 2.
let roiRangeSelection = { key: null, start: 0, end: 0 };
// Brushing & linking: seleção múltipla própria, sem alterar Focus+Context.
let roiBrush = { enabled: false, key: null, slices: new Set(), drag: null };
function roiBrushScope() {
  return `${activeCaseKey ?? ""}|${currentPhase ?? ""}`;
}
function roiBrushSyncScope() {
  const key = roiBrushScope();
  if (roiBrush.key !== key) {
    roiBrush.key = key;
    roiBrush.slices.clear();
    roiBrush.drag = null;
  }
}
function roiBrushSelected(slice) {
  return roiBrush.slices.has(Number(slice));
}
function roiBrushRefreshLinked() {
  renderROIAreaChart();
  renderROIIntensityChart();
  renderROIHeatmap(filteredRows);
}
function roiBrushControls() {
  const toggle = document.getElementById("roiBrushToggle");
  const clear = document.getElementById("roiBrushClear");
  const status = document.getElementById("roiBrushStatus");
  if (toggle) {
    toggle.textContent = roiBrush.enabled ? "Desativar seleção múltipla" : "Ativar seleção múltipla";
    toggle.setAttribute("aria-pressed", String(roiBrush.enabled));
    toggle.onclick = () => {
      roiBrush.enabled = !roiBrush.enabled;
      roiBrush.drag = null;
      roiBrushRefreshLinked();
    };
  }
  if (clear) {
    clear.disabled = roiBrush.slices.size === 0;
    clear.onclick = () => {
      roiBrush.slices.clear();
      roiBrushRefreshLinked();
    };
  }
  if (status) {
    const count = roiBrush.slices.size;
    status.textContent = count
      ? `${count} corte${count === 1 ? "" : "s"} selecionado${count === 1 ? "" : "s"}: ${[...roiBrush.slices].sort((a,b)=>a-b).join(", ")}. Destaque coordenado nas representações.`
      : roiBrush.enabled
        ? "Arrasta horizontalmente sobre o gráfico da área para selecionar cortes."
        : "Seleção múltipla desativada. O clique individual continua disponível.";
  }
}

let intensityByPhaseChart;
let modelMetricsChart;
let caseComparisonChart;

const roiSelectedRangeBackgroundPlugin = {
  id: "roiSelectedRangeBackground",
  beforeDatasetsDraw(chart, args, pluginOptions) {
    if (!pluginOptions || pluginOptions.startIndex == null || pluginOptions.endIndex == null) return;
    const { ctx, chartArea, scales } = chart;
    const x = scales.x;
    if (!x || !chartArea) return;
    const points = chart.data.datasets[0]?.data || [];
    const maxIndex = points.length - 1;
    if (maxIndex < 0) return;
    const startIndex = Math.max(0, Math.min(pluginOptions.startIndex, maxIndex));
    const endIndex = Math.max(startIndex, Math.min(pluginOptions.endIndex, maxIndex));
    const at = index => x.getPixelForValue(typeof points[index] === "object" ? points[index].x : index);
    const startPx = at(startIndex);
    const endPx = at(endIndex);
    const leftPad = startIndex > 0 ? (startPx - at(startIndex - 1)) / 2 : 0;
    const rightPad = endIndex < maxIndex ? (at(endIndex + 1) - endPx) / 2 : 0;
    const left = Math.max(chartArea.left, startPx - leftPad);
    const right = Math.min(chartArea.right, endPx + rightPad);
    ctx.save();
    ctx.fillStyle = pluginOptions.color || 'rgba(8, 145, 178, 0.08)';
    ctx.fillRect(left, chartArea.top, right - left, chartArea.bottom - chartArea.top);
    // No gráfico bifocal, assinalar discretamente os limites da zona ampliada.
    // As linhas são desenhadas sobre os limites do sombreado; os dados não mudam.
    if (pluginOptions.showBoundaries && startIndex < endIndex &&
        (startIndex > 0 || endIndex < maxIndex)) {
      ctx.strokeStyle = pluginOptions.boundaryColor || "rgba(8, 116, 142, 0.68)";
      ctx.lineWidth = 1.5;
      ctx.setLineDash([5, 4]);
      [left, right].forEach(boundaryX => {
        ctx.beginPath();
        ctx.moveTo(boundaryX, chartArea.top);
        ctx.lineTo(boundaryX, chartArea.bottom);
        ctx.stroke();
      });
      ctx.setLineDash([]);
    }
    ctx.restore();
  }
};

Chart.register(roiSelectedRangeBackgroundPlugin);
// Desenha apenas o intervalo provisório durante o arrastamento no modo brushing.
Chart.register({
  id: "roiBrushDragOverlay",
  afterDatasetsDraw(chart) {
    if (chart.canvas?.id !== "roiAreaChart" || !roiBrush.enabled || !roiBrush.drag) return;
    const { chartArea, ctx } = chart;
    if (!chartArea) return;
    const x1 = Math.max(chartArea.left, Math.min(chartArea.right, roiBrush.drag.startX));
    const x2 = Math.max(chartArea.left, Math.min(chartArea.right, roiBrush.drag.endX));
    ctx.save();
    ctx.fillStyle = "rgba(124, 58, 237, 0.12)";
    ctx.strokeStyle = "#7c3aed";
    ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 3]);
    ctx.fillRect(Math.min(x1, x2), chartArea.top, Math.abs(x2 - x1), chartArea.bottom - chartArea.top);
    ctx.strokeRect(Math.min(x1, x2), chartArea.top, Math.abs(x2 - x1), chartArea.bottom - chartArea.top);
    ctx.restore();
  }
});


let subtypeMetrics = {};
let showAllTableRows = false;

let tumor3DScene = null;
let tumor3DCamera = null;
let tumor3DRenderer = null;
let tumor3DControls = null;
let tumor3DGroup = null;
let tumor3DAnimationId = null;
let tumor3DMode = "solid";

const FALLBACK_DATASETS = [
  {
    csv: "/media/bcdataset_subset_20260313_114624/metadata.csv",
    imageBase: "/media/bcdataset_subset_20260313_114624/images/",
    type: "old"
  },
  {
    csv: "/media/bcdataset_subset_20260428_132406/slices_info.csv",
    imageBase: "/media/bcdataset_subset_20260428_132406/output_JPG/",
    type: "new"
  },
  {
    csv: "/media/bcdataset_subset_20260428_133158/slices_info.csv",
    imageBase: "/media/bcdataset_subset_20260428_133158/output_JPG/",
    type: "new"
  },
  {
    csv: "/media/bcdataset_subset_20260428_133535/slices_info.csv",
    imageBase: "/media/bcdataset_subset_20260428_133535/output_JPG/",
    type: "new"
  }
];

let DATASETS = [...FALLBACK_DATASETS];

async function loadDatasetList() {
  try {
    const res = await fetch("/api/datasets");
    if (!res.ok) throw new Error("Falha ao obter lista de datasets");
    const data = await res.json();
    if (Array.isArray(data) && data.length) {
      DATASETS = data;
    }
  } catch (err) {
    console.warn("Nao foi possivel obter /api/datasets, a usar lista local:", err);
    DATASETS = [...FALLBACK_DATASETS];
  }
}

const tableBody = document.getElementById("casesTableBody");

const datasetFilter = document.getElementById("datasetFilter");
const patientFilter = document.getElementById("patientFilter");
const phaseFilter = document.getElementById("phaseFilter");
const subtypeFilter = document.getElementById("subtypeFilter");
const filterResultsCount = document.getElementById("filterResultsCount");

const tablePatientFilter = document.getElementById("tablePatientFilter");
const tableSubtypeFilter = document.getElementById("tableSubtypeFilter");
const tablePhaseFilter = document.getElementById("tablePhaseFilter");
const tableSearchInput = document.getElementById("tableSearchInput");
const clearTableFiltersBtn = document.getElementById("clearTableFiltersBtn");

const caseASelect = document.getElementById("caseASelect");
const caseBSelect = document.getElementById("caseBSelect");
const caseComparePhaseSelect = document.getElementById("caseComparePhaseSelect");
const caseCompareSliceSlider = document.getElementById("caseCompareSliceSlider");
const caseCompareSliceValue = document.getElementById("caseCompareSliceValue");

async function loadModelMetrics() {
  const response = await fetch("/api/model-metrics");

  if (!response.ok) {
    throw new Error("Nao foi possivel carregar as metricas do modelo.");
  }

  const data = await response.json();
  subtypeMetrics = data.subtypes || {};
}

async function initAnalytics() {
  try {
    try {
      await loadModelMetrics();
    } catch (metricsError) {
      console.warn("As métricas do modelo não foram carregadas:", metricsError);
      subtypeMetrics = {};
    }

    allRows = await (async () => {
      await loadDatasetList();
      return loadAllDatasets();
    })();

    console.log("Linhas carregadas:", allRows.length);
    console.log("Primeiras linhas:", allRows.slice(0, 5));

    if (!allRows.length) {
      throw new Error("Nao foram encontradas linhas validas nos datasets.");
    }

    populateFilters(allRows);
    populateTableFilters(allRows);
    populateCaseComparisonSelects(allRows);

    filteredRows = [...allRows];
    updateFilterResultsCount();

    updatePhaseSelectFromFiltered();
    syncPhaseAndSliceWithCurrentData();

    renderTable(filteredRows);
    renderCurrentSlice();
    renderPhaseComparison();
    renderROIAreaChart();
    renderROIIntensityChart();
    renderTumor3D();
    renderROIHeatmap(filteredRows);
    renderSlicesByPhaseChart(filteredRows);
    renderROIAreaByPhaseChart(filteredRows);
  renderIntensityByPhaseChart(filteredRows);
    renderModelMetricsChart("accuracy");
    renderModelInsights();
    renderConfusionCards();
    renderKeyInsights();
    updateCaseComparisonPhaseOptions();
    renderCaseComparison();

    bindEvents();
  } catch (error) {
    console.error("Erro ao iniciar analytics:", error);
  }
}

async function loadAllDatasets() {
  let loadedRows = [];

  for (const dataset of DATASETS) {
    try {
      const response = await fetch(dataset.csv, { cache: "no-store" });

      if (!response.ok) {
        console.error("Nao foi possivel carregar:", dataset.csv);
        continue;
      }

      const csvText = await response.text();
      const rows = parseCSV(csvText);

      const normalizedRows = rows
        .map(row => normalizeRow(row, dataset))
        .filter(row => row.Basename && row.Dataset && row.Patient_ID);

      loadedRows = loadedRows.concat(normalizedRows);
    } catch (error) {
      console.error("Erro ao carregar dataset:", dataset.csv, error);
    }
  }

  return loadedRows;
}

function parseCSV(csvText) {
  const cleanText = csvText.replace(/^\uFEFF/, "").trim();
  const lines = cleanText.split(/\r?\n/);

  if (!lines.length) return [];

  const headers = lines[0].split(",").map(h => h.trim());
  const rows = [];

  for (let i = 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue;

    const values = splitCSVLine(lines[i]);
    const row = {};

    headers.forEach((header, index) => {
      row[header] = values[index] ?? "";
    });

    rows.push(row);
  }

  return rows;
}

function splitCSVLine(line) {
  const result = [];
  let current = "";
  let insideQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];

    if (char === '"') {
      insideQuotes = !insideQuotes;
    } else if (char === "," && !insideQuotes) {
      result.push(current.trim().replace(/^"|"$/g, ""));
      current = "";
    } else {
      current += char;
    }
  }

  result.push(current.trim().replace(/^"|"$/g, ""));
  return result;
}

function normalizeRow(row, dataset) {
  const basename = row.Basename || row.basename || row.filename || row.image || "";

  const imageFilename = basename.endsWith(".jpg")
    ? basename
    : `${basename}.jpg`;

  const phase = Number(row.Phase ?? row.phase ?? row.fase ?? 0);
  const slice = Number(row.Slice ?? row.slice_index ?? row.slice ?? 0);

  const xMin = Number(row.X_min ?? row.bbox_xmin ?? row.x_min ?? row.xmin ?? 0);
  const xMax = Number(row.X_max ?? row.bbox_xmax ?? row.x_max ?? row.xmax ?? 0);
  const yMin = Number(row.Y_min ?? row.bbox_ymin ?? row.y_min ?? row.ymin ?? 0);
  const yMax = Number(row.Y_max ?? row.bbox_ymax ?? row.y_max ?? row.ymax ?? 0);

  const normalized = {
    Basename: imageFilename,
    Dataset: row.Dataset || row.dataset || "-",
    Patient_ID: row.Patient_ID || row.patient_id || row.patient || "-",
    Study_ID: row.Study_ID || row.study_id || row.study || "-",
    Phase: phase,
    Slice: slice,
    "Mol Subtype": row["Mol Subtype"] || row.mol_subtype || row.subtype || row.Subtype || "-",

    X_min: xMin,
    X_max: xMax,
    Y_min: yMin,
    Y_max: yMax,

    imageBase: dataset.imageBase,
    imagePath: `${dataset.imageBase}${imageFilename}`
  };

  normalized.roiWidth = Math.max(0, normalized.X_max - normalized.X_min);
  normalized.roiHeight = Math.max(0, normalized.Y_max - normalized.Y_min);
  normalized.roiArea = normalized.roiWidth * normalized.roiHeight;

  // Intensidade média de sinal dentro da bounding box (0-255), pré-calculada
  // offline a partir das imagens originais. Nem todos os datasets têm esta
  // coluna; nesse caso o valor fica "null" e as vistas que a usam assinalam
  // a ausência de dados em vez de apresentar um valor inventado.
  const rawIntensity = row.MeanIntensity ?? row.mean_intensity ?? row.meanintensity;
  normalized.meanIntensity = (rawIntensity !== undefined && rawIntensity !== "" && !isNaN(Number(rawIntensity)))
    ? Number(rawIntensity)
    : null;

  return normalized;
}

function getCaseKey(row) {
  return `${row.Dataset}||${row.Patient_ID}||${row.Study_ID}`;
}

function getCaseRows(caseKey) {
  return allRows.filter(row => getCaseKey(row) === caseKey);
}

// Mantém a Vista 1 associada a um único Dataset + Paciente + Estudo.
// Os filtros globais continuam a definir filteredRows para as outras vistas.
function getActiveCaseFilteredRows() {
  if (!filteredRows.length) {
    activeCaseKey = null;
    return [];
  }

  if (!activeCaseKey || !filteredRows.some(row => getCaseKey(row) === activeCaseKey)) {
    activeCaseKey = getCaseKey(filteredRows[0]);
    activeCaseChosenAutomatically = true;
  }

  return filteredRows.filter(row => getCaseKey(row) === activeCaseKey);
}

function updateActiveCaseLabel(rows) {
  const label = document.getElementById("activeCaseLabel");
  if (!label) return;
  if (!rows.length) {
    label.textContent = "Nenhum caso disponível para os filtros selecionados";
    return;
  }

  const row = rows[0];
  const prefix = activeCaseChosenAutomatically ? "Caso em análise (seleção automática)" : "Caso em análise";
  label.textContent = `${prefix}: ${row.Patient_ID} | ${row.Dataset} | Estudo ${row.Study_ID}`;
}

function getCaseLabelFromRows(rows) {
  if (!rows.length) return "-";

  const first = rows[0];
  return `${first.Patient_ID} | ${first.Dataset} | ${first["Mol Subtype"]}`;
}

function populateTopMetadata(rows) {
  updateActiveCaseLabel(rows);
  if (!rows.length) {
    setText("metaDataset", "-");
    setText("metaPatient", "-");
    setText("metaStudy", "-");
    setText("metaSubtype", "-");
    setText("metaPhases", "-");
    setText("metaSlices", "-");
    return;
  }

  const first = rows[0];

  // Contar todas as fases do paciente e estudo,
  // independentemente da fase selecionada.
  const caseRows = getCaseRows(getCaseKey(first));
  const phases = [...new Set(caseRows.map(r => r.Phase))];

  // Manter a contagem de slices da fase atual.
  const slices = [...new Set(rows.map(r => r.Slice))];

  setText("metaDataset", first.Dataset || "-");
  setText("metaPatient", first.Patient_ID || "-");
  setText("metaStudy", first.Study_ID || "-");
  setText("metaSubtype", first["Mol Subtype"] || "-");
  setText("metaPhases", phases.length);
  setText("metaSlices", slices.length);
}

function populateFilters(rows) {
  // On first load, only populate Dataset — the rest cascade after selection
  populateSelect(datasetFilter, [...new Set(rows.map(r => r.Dataset))], "Dataset");
  populateSelect(patientFilter, [], "Paciente");
  populateSelect(phaseFilter,   [], "Fase");
  populateSelect(subtypeFilter, [], "Subtipo molecular");
}

// Called after every filter change to rebuild downstream options
function updateCascadeFilters() {
  const dsVal  = datasetFilter?.value  || "";
  const patVal = patientFilter?.value  || "";
  const phVal  = phaseFilter?.value    || "";

  // Rows matching filters already set
  const afterDataset  = dsVal  ? allRows.filter(r => r.Dataset       === dsVal)                : allRows;
  const afterPatient  = patVal ? afterDataset.filter(r => r.Patient_ID === patVal)              : afterDataset;
  const afterPhase    = phVal  ? afterPatient.filter(r => r.Phase      === Number(phVal))       : afterPatient;

  // Rebuild each filter with options valid given earlier selections,
  // preserving the current selection if it's still valid
  const savedPat  = patientFilter?.value;
  const savedPh   = phaseFilter?.value;
  const savedSub  = subtypeFilter?.value;

  populateSelect(patientFilter,  [...new Set(afterDataset.map(r => r.Patient_ID))],    "Paciente");
  populateSelect(phaseFilter,    [...new Set(afterPatient.map(r => r.Phase))],          "Fase");
  populateSelect(subtypeFilter,  [...new Set(afterPhase.map(r => r["Mol Subtype"]))],  "Subtipo molecular");

  // Restore saved values if still valid
  if (savedPat && patientFilter) patientFilter.value  = savedPat;
  if (savedPh  && phaseFilter)   phaseFilter.value    = savedPh;
  if (savedSub && subtypeFilter) subtypeFilter.value  = savedSub;
}

function populateTableFilters(rows) {
  populateSelect(tablePatientFilter, [...new Set(rows.map(r => r.Patient_ID))], "Todos");
  populateSelect(tableSubtypeFilter, [...new Set(rows.map(r => r["Mol Subtype"]))], "Todos");
  populateSelect(tablePhaseFilter, [...new Set(rows.map(r => r.Phase))], "Todas");
}

function populateSelect(selectEl, values, placeholder) {
  if (!selectEl) return;

  selectEl.innerHTML = `<option value="">${placeholder}</option>`;

  values
    .filter(v => v !== undefined && v !== null && v !== "")
    .sort((a, b) => {
      if (!Number.isNaN(Number(a)) && !Number.isNaN(Number(b))) {
        return Number(a) - Number(b);
      }

      return String(a).localeCompare(String(b));
    })
    .forEach(value => {
      const option = document.createElement("option");
      option.value = value;
      option.textContent = typeof value === "number" ? value : String(value);
      selectEl.appendChild(option);
    });
}

function populateCaseComparisonSelects(rows) {
  if (!caseASelect || !caseBSelect) return;

  const caseMap = new Map();

  rows.forEach(row => {
    const key = getCaseKey(row);

    if (!caseMap.has(key)) {
      caseMap.set(key, []);
    }

    caseMap.get(key).push(row);
  });

  const cases = [...caseMap.entries()]
    .map(([key, caseRows]) => ({
      key,
      label: getCaseLabelFromRows(caseRows)
    }))
    .sort((a, b) => a.label.localeCompare(b.label));

  caseASelect.innerHTML = "";
  caseBSelect.innerHTML = "";

  cases.forEach((caseItem) => {
    const optionA = document.createElement("option");
    optionA.value = caseItem.key;
    optionA.textContent = caseItem.label;
    caseASelect.appendChild(optionA);

    const optionB = document.createElement("option");
    optionB.value = caseItem.key;
    optionB.textContent = caseItem.label;
    caseBSelect.appendChild(optionB);
  });

  if (cases.length > 0) {
    caseASelect.value = cases[0].key;
  }

  if (cases.length > 1) {
    caseBSelect.value = cases[1].key;
  } else if (cases.length === 1) {
    caseBSelect.value = cases[0].key;
  }
}

function bindEvents() {
  // Pill label sync helper
  function syncPillLabel(selectEl, labelId, defaultText) {
    const label = document.getElementById(labelId);
    if (!label || !selectEl) return;
    selectEl.addEventListener("change", () => {
      const val = selectEl.options[selectEl.selectedIndex];
      label.textContent = (val && val.value !== "") ? val.text : defaultText;
    });
  }
  syncPillLabel(datasetFilter,  "datasetFilterLabel",  "Dataset");
  syncPillLabel(patientFilter,  "patientFilterLabel",  "Paciente");
  syncPillLabel(phaseFilter,    "phaseFilterLabel",    "Fase");
  syncPillLabel(subtypeFilter,  "subtypeFilterLabel",  "Subtipo molecular");

  if (datasetFilter) datasetFilter.addEventListener("change", applyFilters);
  if (patientFilter) patientFilter.addEventListener("change", applyFilters);
  if (phaseFilter) phaseFilter.addEventListener("change", applyFilters);
  if (subtypeFilter) subtypeFilter.addEventListener("change", applyFilters);

  const resetFiltersBtn = document.getElementById("resetFiltersBtn");

  if (resetFiltersBtn) {
    resetFiltersBtn.addEventListener("click", () => {
      if (datasetFilter) datasetFilter.value = "";
      if (patientFilter) patientFilter.value = "";
      if (phaseFilter) phaseFilter.value = "";
      if (subtypeFilter) subtypeFilter.value = "";
      // Reset pill labels
      const lbls = [
        ["datasetFilterLabel",  "Dataset"],
        ["patientFilterLabel",  "Paciente"],
        ["phaseFilterLabel",    "Fase"],
        ["subtypeFilterLabel",  "Subtipo molecular"],
      ];
      lbls.forEach(([id, text]) => {
        const el = document.getElementById(id);
        if (el) el.textContent = text;
      });

      // Rebuild cascade from scratch and rerender
      populateFilters(allRows);
      filteredRows = [...allRows];
      showAllTableRows = false;
      applyFilters();
    });
  }

  bindExportEvents();

  // Table drawer
  const tableDrawerBtn     = document.getElementById("tableDrawerBtn");
  const tableDrawerClose   = document.getElementById("tableDrawerClose");
  const tableDrawer        = document.getElementById("tableDrawer");
  const tableDrawerOverlay = document.getElementById("tableDrawerOverlay");

  function openDrawer() {
    tableDrawer?.classList.add("open");
    tableDrawerOverlay?.classList.add("open");
    tableDrawerBtn?.classList.add("active");
    document.body.style.overflow = "hidden";
  }

  function closeDrawer() {
    tableDrawer?.classList.remove("open");
    tableDrawerOverlay?.classList.remove("open");
    tableDrawerBtn?.classList.remove("active");
    document.body.style.overflow = "";
  }

  tableDrawerBtn?.addEventListener("click", () => {
    tableDrawer?.classList.contains("open") ? closeDrawer() : openDrawer();
  });
  tableDrawerClose?.addEventListener("click", closeDrawer);
  tableDrawerOverlay?.addEventListener("click", closeDrawer);
  document.addEventListener("keydown", e => { if (e.key === "Escape") closeDrawer(); });

  const phaseSelect = document.getElementById("phaseSelect");

  if (phaseSelect) {
    phaseSelect.addEventListener("change", (e) => {
      currentPhase = Number(e.target.value);
      currentSliceIndex = 0;

      syncPhaseAndSliceWithCurrentData();
      renderCurrentSlice();
      renderTable(filteredRows);
      renderPhaseComparison();
      renderROIAreaChart();
    renderROIIntensityChart();
      renderTumor3D();
      renderROIHeatmap(filteredRows);
      renderKeyInsights();
    });
  }

  const sliceSlider = document.getElementById("sliceSlider");

  if (sliceSlider) {
    sliceSlider.addEventListener("input", (e) => {
      currentSliceIndex = Number(e.target.value);

      if (currentPhaseRows[currentSliceIndex]) {
        selectedSlice = currentPhaseRows[currentSliceIndex].Slice;
      }

      renderCurrentSlice();
      renderTable(filteredRows);
      renderPhaseComparison();
      renderROIAreaChart();
    renderROIIntensityChart();
      renderTumor3D();
      renderROIHeatmap(filteredRows);
      renderKeyInsights();
    });
  }

  const prevSliceBtn = document.getElementById("prevSliceBtn");

  if (prevSliceBtn) {
    prevSliceBtn.addEventListener("click", () => {
      if (currentSliceIndex > 0) {
        currentSliceIndex--;

        if (currentPhaseRows[currentSliceIndex]) {
          selectedSlice = currentPhaseRows[currentSliceIndex].Slice;
        }

        const slider = document.getElementById("sliceSlider");
        if (slider) slider.value = currentSliceIndex;

        renderCurrentSlice();
        renderTable(filteredRows);
        renderPhaseComparison();
        renderROIAreaChart();
    renderROIIntensityChart();
        renderTumor3D();
        renderROIHeatmap(filteredRows);
        renderKeyInsights();
      }
    });
  }

  const nextSliceBtn = document.getElementById("nextSliceBtn");

  if (nextSliceBtn) {
    nextSliceBtn.addEventListener("click", () => {
      if (currentSliceIndex < currentPhaseRows.length - 1) {
        currentSliceIndex++;

        if (currentPhaseRows[currentSliceIndex]) {
          selectedSlice = currentPhaseRows[currentSliceIndex].Slice;
        }

        const slider = document.getElementById("sliceSlider");
        if (slider) slider.value = currentSliceIndex;

        renderCurrentSlice();
        renderTable(filteredRows);
        renderPhaseComparison();
        renderROIAreaChart();
    renderROIIntensityChart();
        renderTumor3D();
        renderROIHeatmap(filteredRows);
        renderKeyInsights();
      }
    });
  }

  const metricSelect = document.getElementById("metricSelect");

  if (metricSelect) {
    metricSelect.addEventListener("change", (e) => {
      renderModelMetricsChart(e.target.value);
    });
  }

  if (tablePatientFilter) {
    tablePatientFilter.addEventListener("change", () => {
      renderTable(filteredRows);
    });
  }

  if (tableSubtypeFilter) {
    tableSubtypeFilter.addEventListener("change", () => {
      renderTable(filteredRows);
    });
  }

  if (tablePhaseFilter) {
    tablePhaseFilter.addEventListener("change", () => {
      renderTable(filteredRows);
    });
  }

  if (tableSearchInput) {
    tableSearchInput.addEventListener("input", () => {
      renderTable(filteredRows);
    });
  }

  if (clearTableFiltersBtn) {
    clearTableFiltersBtn.addEventListener("click", () => {
      if (tablePatientFilter) tablePatientFilter.value = "";
      if (tableSubtypeFilter) tableSubtypeFilter.value = "";
      if (tablePhaseFilter) tablePhaseFilter.value = "";
      if (tableSearchInput) tableSearchInput.value = "";
      renderTable(filteredRows);
    });
  }

  if (caseASelect) {
    caseASelect.addEventListener("change", () => {
      updateCaseComparisonPhaseOptions();
      renderCaseComparison();
    });
  }

  if (caseBSelect) {
    caseBSelect.addEventListener("change", () => {
      updateCaseComparisonPhaseOptions();
      renderCaseComparison();
    });
  }

  if (caseComparePhaseSelect) {
    caseComparePhaseSelect.addEventListener("change", () => {
      renderCaseComparison();
    });
  }

  if (caseCompareSliceSlider) {
    caseCompareSliceSlider.addEventListener("input", () => {
      renderCaseComparison();
    });
  }

  const wireframeBtn = document.getElementById("tumor3DWireframeBtn");
  const solidBtn = document.getElementById("tumor3DSolidBtn");
  const reset3DBtn = document.getElementById("tumor3DResetBtn");
  const zoomInBtn  = document.getElementById("tumor3DZoomInBtn");
  const zoomOutBtn = document.getElementById("tumor3DZoomOutBtn");

  if (wireframeBtn) {
    wireframeBtn.addEventListener("click", () => {
      tumor3DMode = "wireframe";
      setTumor3DMode("wireframe");
    });
  }

  if (solidBtn) {
    solidBtn.addEventListener("click", () => {
      tumor3DMode = "solid";
      setTumor3DMode("solid");
    });
  }

  if (reset3DBtn) {
    reset3DBtn.addEventListener("click", () => {
      resetTumor3DView();
    });
  }

  function tumor3DZoom(factor) {
    if (!tumor3DCamera || !tumor3DControls) return;
    // Move camera closer/further along its current direction
    tumor3DCamera.position.multiplyScalar(factor);
    tumor3DControls.update();
  }

  if (zoomInBtn)  zoomInBtn.addEventListener("click",  () => tumor3DZoom(0.8));
  if (zoomOutBtn) zoomOutBtn.addEventListener("click", () => tumor3DZoom(1.25));

  window.addEventListener("resize", () => {
    resizeTumor3D();

    if (caseComparisonChart) {
      caseComparisonChart.resize();
    }
  });
}

function applyFilters() {
  // Rebuild downstream filter options based on current selections
  updateCascadeFilters();

  filteredRows = allRows.filter(row => {
    const datasetMatch  = !datasetFilter?.value  || row.Dataset         === datasetFilter.value;
    const patientMatch  = !patientFilter?.value  || row.Patient_ID      === patientFilter.value;
    const phaseMatch    = !phaseFilter?.value    || row.Phase           === Number(phaseFilter.value);
    const subtypeMatch  = !subtypeFilter?.value  || row["Mol Subtype"]  === subtypeFilter.value;
    return datasetMatch && patientMatch && phaseMatch && subtypeMatch;
  });

  updateFilterResultsCount();

  currentSliceIndex = 0;

  updatePhaseSelectFromFiltered();
  syncPhaseAndSliceWithCurrentData();

  renderTable(filteredRows);
  renderSlicesByPhaseChart(filteredRows);
  renderROIAreaByPhaseChart(filteredRows);
  renderIntensityByPhaseChart(filteredRows);
  renderROIHeatmap(filteredRows);
  renderCurrentSlice();
  renderPhaseComparison();
  renderROIAreaChart();
    renderROIIntensityChart();
  renderTumor3D();
  renderKeyInsights();
}

function updateFilterResultsCount() {
  if (!filterResultsCount) return;
  const total = allRows.length;
  const shown = filteredRows.length;
  filterResultsCount.textContent = shown === total
    ? `${total} resultados`
    : `${shown} de ${total} resultados`;
}

function showEmptyState() {
  const ids = ["volumeImage", "volumeBbox", "volumeImageWrapper"];
  ids.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = "none";
  });

  const wrapper = document.getElementById("volumeImageWrapper");
  if (wrapper && !document.getElementById("emptyStateMsg")) {
    const msg = document.createElement("div");
    msg.id = "emptyStateMsg";
    msg.style.cssText = "padding:60px 20px;text-align:center;color:#94a3b8;font-size:0.95rem;";
    msg.textContent = "Seleciona um paciente nos filtros para explorar os dados.";
    wrapper.parentNode.insertBefore(msg, wrapper);
  }
}

function hideEmptyState() {
  const msg = document.getElementById("emptyStateMsg");
  if (msg) msg.remove();

  const ids = ["volumeImage", "volumeBbox", "volumeImageWrapper"];
  ids.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = "";
  });
}

function updatePhaseSelectFromFiltered() {
  const phaseSelect = document.getElementById("phaseSelect");
  if (!phaseSelect) return;

  const caseRows = getActiveCaseFilteredRows();
  const phases = [...new Set(caseRows.map(r => r.Phase))].sort((a, b) => a - b);

  phaseSelect.innerHTML = "";

  phases.forEach(phase => {
    const option = document.createElement("option");
    option.value = phase;
    option.textContent = `Fase ${phase}`;
    phaseSelect.appendChild(option);
  });

  if (phases.length) {
    if (!phases.includes(currentPhase)) {
      currentPhase = phases[0];
    }

    phaseSelect.value = currentPhase;
  } else {
    currentPhase = null;
  }
}

function syncPhaseAndSliceWithCurrentData() {
  const caseRows = getActiveCaseFilteredRows();
  currentPhaseRows = caseRows
    .filter(row => row.Phase === currentPhase)
    .sort((a, b) => a.Slice - b.Slice);

  const slider = document.getElementById("sliceSlider");

  if (!currentPhaseRows.length) {
    currentSliceIndex = 0;
    selectedSlice = null;

    if (slider) {
      slider.min = 0;
      slider.max = 0;
      slider.value = 0;
    }

    clearDetails();
    populateTopMetadata([]);
    return;
  }

  if (currentSliceIndex > currentPhaseRows.length - 1) {
    currentSliceIndex = 0;
  }

  if (slider) {
    slider.min = 0;
    slider.max = currentPhaseRows.length - 1;
    slider.value = currentSliceIndex;
  }

  selectedSlice = currentPhaseRows[currentSliceIndex].Slice;
  populateTopMetadata(currentPhaseRows);
}

function getTableFilteredRows(rows) {
  const patientValue = tablePatientFilter?.value || "";
  const subtypeValue = tableSubtypeFilter?.value || "";
  const phaseValue = tablePhaseFilter?.value || "";
  const searchValue = tableSearchInput?.value?.toLowerCase().trim() || "";

  return rows.filter(row => {
    const patientMatch = !patientValue || row.Patient_ID === patientValue;
    const subtypeMatch = !subtypeValue || row["Mol Subtype"] === subtypeValue;
    const phaseMatch = !phaseValue || row.Phase === Number(phaseValue);

    const searchMatch =
      !searchValue ||
      String(row.Basename).toLowerCase().includes(searchValue) ||
      String(row.Patient_ID).toLowerCase().includes(searchValue) ||
      String(row.Dataset).toLowerCase().includes(searchValue) ||
      String(row["Mol Subtype"]).toLowerCase().includes(searchValue);

    return patientMatch && subtypeMatch && phaseMatch && searchMatch;
  });
}

function renderTable(rows) {
  if (!tableBody) return;

  tableBody.innerHTML = "";

  const tableRows = getTableFilteredRows(rows);

  const sortedRows = tableRows
    .slice()
    .sort((a, b) =>
      String(a.Patient_ID).localeCompare(String(b.Patient_ID)) ||
      a.Phase - b.Phase ||
      a.Slice - b.Slice
    );

  const rowsToShow = sortedRows;

  rowsToShow.forEach((row) => {
    const tr = document.createElement("tr");
    tr.style.cursor = "pointer";

    tr.innerHTML = `
      <td>${row.Basename}</td>
      <td>${row.Dataset}</td>
      <td>${row.Phase}</td>
      <td>${row.Slice}</td>
      <td>${row["Mol Subtype"]}</td>
      <td>${row.roiWidth}</td>
      <td>${row.roiHeight}</td>
      <td>${row.roiArea}</td>
    `;

    tr.addEventListener("click", () => {
      activeCaseKey = getCaseKey(row);
      activeCaseChosenAutomatically = false;
      currentPhase = row.Phase;
      selectedSlice = row.Slice;

      updatePhaseSelectFromFiltered();

      currentPhaseRows = filteredRows
        .filter(r =>
          r.Phase === currentPhase &&
          r.Patient_ID === row.Patient_ID &&
          r.Study_ID === row.Study_ID &&
          r.Dataset === row.Dataset
        )
        .sort((a, b) => a.Slice - b.Slice);

      currentSliceIndex = currentPhaseRows.findIndex(r => r.Slice === row.Slice);

      if (currentSliceIndex < 0) {
        currentSliceIndex = 0;
      }

      const slider = document.getElementById("sliceSlider");

      if (slider) {
        slider.min = 0;
        slider.max = Math.max(0, currentPhaseRows.length - 1);
        slider.value = currentSliceIndex;
      }

      populateTopMetadata(currentPhaseRows);
      renderCurrentSlice();
      renderTable(filteredRows);
      renderPhaseComparison();
      renderROIAreaChart();
    renderROIIntensityChart();
      renderTumor3D();
      renderROIHeatmap(filteredRows);
      renderKeyInsights();
      highlightSelectedRow(row.Basename);
    });

    tableBody.appendChild(tr);
  });

  if (currentPhaseRows.length) {
    highlightSelectedRow(currentPhaseRows[currentSliceIndex]?.Basename);
  }
}

function highlightSelectedRow(selectedBasename) {
  if (!tableBody) return;

  const rows = tableBody.querySelectorAll("tr");

  rows.forEach((row) => {
    const rowId = row.children[0].textContent;

    if (rowId === selectedBasename) {
      row.style.backgroundColor = "#eef4ff";
      row.style.fontWeight = "600";
    } else {
      row.style.backgroundColor = "";
      row.style.fontWeight = "400";
    }
  });
}

function clearDetails() {
  [
    "detailId",
    "detailDataset",
    "vePatient",
    "veStudy",
    "veSubtype",
    "currentPhase",
    "currentSlice",
    "roiWidth",
    "roiHeight",
    "roiArea",
    "sliceValue",
    "maxSliceLabel",
    "maxSliceArea",
    "slicePositionInfo",
    "insightMaxRoiSlice",
    "insightBestPhase",
    "insightCurrentVsMax",
    "insightBestAuc",
    "insightMostFp"
  ].forEach(id => {
    setText(id, "-");
  });

  const volumeImage = document.getElementById("volumeImage");
  const volumeBbox = document.getElementById("volumeBbox");

  if (volumeImage) volumeImage.src = "";
  if (volumeBbox) volumeBbox.style.display = "none";

  const phaseCompareGrid = document.getElementById("phaseCompareGrid");

  if (phaseCompareGrid) {
    phaseCompareGrid.innerHTML = "";
  }

  const overviewBars = document.getElementById("caseRoiOverviewBars");
  if (overviewBars) overviewBars.replaceChildren();
  setText("caseRoiOverviewStatus", "Sem cortes disponíveis.");
  setText("caseRoiOverviewCount", "");
  disposeTumor3D();
}

// Overview+Detail: perfil compacto da area das caixas em toda a fase;
// a selecao abre o mesmo corte e a mesma bounding box do visualizador.
function renderCaseRoiOverview() {
  const container = document.getElementById("caseRoiOverviewBars");
  if (!container) return;
  const status = document.getElementById("caseRoiOverviewStatus");
  const count = document.getElementById("caseRoiOverviewCount");
  const rows = currentPhaseRows;
  if (count) count.textContent = `${rows.length} cortes · fase ${currentPhase ?? "–"}`;
  // Reutilizar os botoes existentes entre mudancas de corte: evita reconstruir
  // todo o grafico a cada clique e preserva o foco de teclado.
  const key = rows.map(r => `${r.Dataset}/${r.Patient_ID}/${r.Study_ID}/${r.Phase}/${r.Slice}/${r.roiArea}`).join("|");
  if (container.dataset.rowsKey !== key || container.children.length !== rows.length) {
    container.replaceChildren();
    container.dataset.rowsKey = key;
    const areas = rows.map(r => Number(r.roiArea));
    const max = Math.max(1, ...areas.filter(v => Number.isFinite(v) && v >= 0));
    rows.forEach((row, idx) => {
      const area = areas[idx];
      const value = Number.isFinite(area) && area >= 0 ? area : 0;
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "roi-overview-bar";
      btn.title = `Corte ${row.Slice} · área da ROI: ${Number.isFinite(area) ? area + " px²" : "indisponível"}`;
      btn.setAttribute("aria-label", btn.title);
      btn.dataset.index = String(idx);
      const bar = document.createElement("span");
      bar.className = "roi-overview-bar-fill";
      bar.style.height = `${Math.max(2, value/max*100)}%`;
      btn.appendChild(bar);
      btn.addEventListener("click", () => {
        const slider = document.getElementById("sliceSlider");
        if (!slider) return;
        slider.value = String(idx);
        slider.dispatchEvent(new Event("input", { bubbles: true }));
      });
      container.appendChild(btn);
    });
  }
  [...container.children].forEach((button, idx) => {
    const active = idx === currentSliceIndex;
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", String(active));
  });
  const row = rows[currentSliceIndex];
  if (status) status.textContent = row ? `Corte ${row.Slice} selecionado · área ${row.roiArea} px². As barras representam a área da bounding box, não o contorno tumoral.` : "Sem cortes disponíveis.";
}

function renderCurrentSlice() {
  if (!currentPhaseRows.length) {
    clearDetails();
    return;
  }

  const row = currentPhaseRows[currentSliceIndex];
  selectedSlice = row.Slice;

  const imagePath = row.imagePath;

  const img = document.getElementById("volumeImage");
  const bbox = document.getElementById("volumeBbox");
  const wrapper = document.getElementById("volumeImageWrapper");

  if (img) {
    img.onerror = () => {
      console.error("Erro ao carregar imagem:", imagePath);

      if (bbox) bbox.style.display = "none";
    };

    img.onload = () => {
      if (bbox && wrapper) setBBoxForImage(img, wrapper, bbox, row);
    };

    img.src = imagePath;
  }

  setText("detailId", row.Basename);
  setText("detailDataset", row.Dataset);
  setText("vePatient", row.Patient_ID);
  setText("veStudy", row.Study_ID);
  setText("veSubtype", row["Mol Subtype"]);
  setText("currentPhase", row.Phase);
  setText("currentSlice", row.Slice);
  setText("roiWidth", row.roiWidth);
  setText("roiHeight", row.roiHeight);
  setText("roiArea", row.roiArea);
  setText("sliceValue", row.Slice);

  const maxRow = currentPhaseRows.reduce((max, current) =>
    current.roiArea > max.roiArea ? current : max
  , currentPhaseRows[0]);

  setText("maxSliceLabel", maxRow.Slice);
  setText("maxSliceArea", maxRow.roiArea);
  setText("slicePositionInfo", `${currentSliceIndex + 1} / ${currentPhaseRows.length}`);

  populateTopMetadata(currentPhaseRows);
  highlightSelectedRow(row.Basename);
  renderCaseRoiOverview();
}

function setBBoxForImage(img, wrapper, bbox, row) {
  const displayedWidth = img.clientWidth;
  const displayedHeight = img.clientHeight;
  const naturalWidth = img.naturalWidth;
  const naturalHeight = img.naturalHeight;

  if (!naturalWidth || !naturalHeight || !displayedWidth || !displayedHeight) {
    bbox.style.display = "none";
    return;
  }

  const scaleX = displayedWidth / naturalWidth;
  const scaleY = displayedHeight / naturalHeight;

  const bboxLeft = row.X_min * scaleX;
  const bboxTop = row.Y_min * scaleY;
  const bboxWidth = (row.X_max - row.X_min) * scaleX;
  const bboxHeight = (row.Y_max - row.Y_min) * scaleY;

  const offsetX = (wrapper.clientWidth - displayedWidth) / 2;
  const offsetY = (wrapper.clientHeight - displayedHeight) / 2;

  bbox.style.left = `${offsetX + bboxLeft}px`;
  bbox.style.top = `${offsetY + bboxTop}px`;
  bbox.style.width = `${bboxWidth}px`;
  bbox.style.height = `${bboxHeight}px`;
  bbox.style.display = "block";
}

function renderPhaseComparison() {
  const grid = document.getElementById("phaseCompareGrid");

  if (!grid) return;

  grid.innerHTML = "";

  if (!currentPhaseRows.length) return;

  const currentRow = currentPhaseRows[currentSliceIndex];
  const targetSlice = currentRow.Slice;

  const phases = [...new Set(
    allRows
      .filter(row =>
        row.Patient_ID === currentRow.Patient_ID &&
        row.Study_ID === currentRow.Study_ID &&
        row.Dataset === currentRow.Dataset
      )
      .map(row => row.Phase)
  )].sort((a, b) => a - b);

  phases.forEach((phase) => {
    const phaseRows = allRows
      .filter(row =>
        row.Patient_ID === currentRow.Patient_ID &&
        row.Study_ID === currentRow.Study_ID &&
        row.Dataset === currentRow.Dataset &&
        row.Phase === phase
      )
      .sort((a, b) => a.Slice - b.Slice);

    if (!phaseRows.length) return;

    let phaseRow = phaseRows.find(row => row.Slice === targetSlice);

    if (!phaseRow) {
      phaseRow = phaseRows.reduce((closest, row) =>
        Math.abs(row.Slice - targetSlice) < Math.abs(closest.Slice - targetSlice)
          ? row
          : closest
      , phaseRows[0]);
    }

    const card = document.createElement("div");
    card.className = "phase-card";

    card.innerHTML = `
      <h4>Fase ${phase}</h4>

      <div class="phase-image-wrapper" id="phase${phase}Wrapper">
        <img id="phase${phase}Image" src="" alt="Fase ${phase}">
        <div class="phase-bbox" id="phase${phase}Bbox"></div>
      </div>

      <div class="compact-phase-metrics">
        <span>S: <span id="phase${phase}Slice">-</span></span>
        <span>A: <span id="phase${phase}Area">-</span></span>
        <span>L: <span id="phase${phase}Width">-</span></span>
        <span>H: <span id="phase${phase}Height">-</span></span>
      </div>
    `;

    grid.appendChild(card);

    const img = document.getElementById(`phase${phase}Image`);
    const bbox = document.getElementById(`phase${phase}Bbox`);
    const wrapper = document.getElementById(`phase${phase}Wrapper`);

    const sliceEl = document.getElementById(`phase${phase}Slice`);
    const areaEl = document.getElementById(`phase${phase}Area`);
    const widthEl = document.getElementById(`phase${phase}Width`);
    const heightEl = document.getElementById(`phase${phase}Height`);

    if (!img || !bbox || !wrapper) return;

    img.onerror = () => {
      console.error(`Erro ao carregar imagem da fase ${phase}:`, phaseRow.imagePath);
      bbox.style.display = "none";
    };

    img.onload = () => {
      setBBoxForImage(img, wrapper, bbox, phaseRow);
    };

    img.src = phaseRow.imagePath;

    if (sliceEl) sliceEl.textContent = phaseRow.Slice;
    if (areaEl) areaEl.textContent = phaseRow.roiArea;
    if (widthEl) widthEl.textContent = phaseRow.roiWidth;
    if (heightEl) heightEl.textContent = phaseRow.roiHeight;
  });
}

// Determina a maior diferenca absoluta entre areas de cortes adjacentes
// disponíveis do mesmo caso e da mesma fase. Nao e uma medida temporal.
function getMaxAdjacentROIAreaVariation(entries) {
  let biggest = null;
  for (let i = 1; i < entries.length; i++) {
    const previous = entries[i - 1].row;
    const current = entries[i].row;
    const previousArea = Number(previous.roiArea);
    const currentArea = Number(current.roiArea);
    const previousSlice = Number(previous.Slice);
    const currentSlice = Number(current.Slice);

    if (!Number.isFinite(previousArea) || !Number.isFinite(currentArea) ||
        previousArea < 0 || currentArea < 0 ||
        !Number.isFinite(previousSlice) || !Number.isFinite(currentSlice) ||
        previousSlice === currentSlice) continue;

    const signedDifference = currentArea - previousArea;
    const magnitude = Math.abs(signedDifference);
    if (biggest === null || magnitude > biggest.magnitude) {
      biggest = {
        firstIndex: i - 1,
        secondIndex: i,
        firstSlice: previousSlice,
        secondSlice: currentSlice,
        firstArea: previousArea,
        secondArea: currentArea,
        signedDifference,
        magnitude
      };
    }
  }
  return biggest;
}

// Análise descritiva condicionada pela seleção do utilizador (não executa a CNN).
function renderROIRangeAnalysis(pts) {
  const startSelect = document.getElementById("roiRangeStart");
  const endSelect = document.getElementById("roiRangeEnd");
  const summary = document.getElementById("roiRangeResults");
  const controls = document.getElementById("roiRangeControls");
  if (!startSelect || !endSelect || !summary || !controls) return;

  if (!pts.length) {
    controls.hidden = true;
    summary.textContent = "Não existem cortes disponíveis para o caso e a fase selecionados.";
    roiRangeSelection.key = null;
    return;
  }
  controls.hidden = false;
  const caseKey = getCaseKey(pts[0].row) + "||" + String(currentPhase);
  if (roiRangeSelection.key !== caseKey) {
    roiRangeSelection = { key: caseKey, start: 0, end: pts.length - 1 };
  }
  roiRangeSelection.start = Math.min(roiRangeSelection.start, pts.length - 1);
  roiRangeSelection.end = Math.min(roiRangeSelection.end, pts.length - 1);

  [startSelect, endSelect].forEach((select, which) => {
    const current = which === 0 ? roiRangeSelection.start : roiRangeSelection.end;
    select.replaceChildren();
    pts.forEach((entry, index) => {
      const option = document.createElement("option");
      option.value = String(index);
      option.textContent = `Corte ${entry.row.Slice}`;
      select.appendChild(option);
    });
    select.value = String(current);
    select.onchange = () => {
      const index = Number(select.value);
      if (which === 0) {
        roiRangeSelection.start = Math.min(index, roiRangeSelection.end);
      } else {
        roiRangeSelection.end = Math.max(index, roiRangeSelection.start);
      }
      renderROIAreaChart();
    };
  });
  const focusVariationBtn = document.getElementById("roiFocusVariationBtn");
  if (focusVariationBtn) {
    focusVariationBtn.disabled = pts.length < 2;
    focusVariationBtn.onclick = () => {
      const biggestInPhase = getMaxAdjacentROIAreaVariation(pts);
      if (!biggestInPhase) return;
      const middle = Math.floor((biggestInPhase.firstIndex + biggestInPhase.secondIndex) / 2);
      const width = Math.min(5, pts.length);
      const start = Math.max(0, Math.min(middle - 2, pts.length - width));
      roiRangeSelection.start = start;
      roiRangeSelection.end = start + width - 1;
      renderROIAreaChart();
      const chart = document.getElementById("roiAreaChart");
      if (chart) chart.scrollIntoView({ behavior: "smooth", block: "nearest" });
    };
  }
  const selected = pts.slice(roiRangeSelection.start, roiRangeSelection.end + 1);
  const areas = selected.map(e => ({ slice: e.row.Slice, value: Number(e.row.roiArea), index: e.phaseIdx }))
    .filter(e => Number.isFinite(e.value) && e.value >= 0);
  const intensities = selected.map(e => Number(e.row.meanIntensity))
    .filter((v, i) => selected[i].row.meanIntensity !== null && Number.isFinite(v));
  const fmt = value => value.toLocaleString("pt-PT", { maximumFractionDigits: 2 });
  const mean = values => values.reduce((acc, value) => acc + value, 0) / values.length;
  const rangeAreaEntries = selected.map((e, i) => ({ phaseIdx: e.phaseIdx, row: e.row }));
  const areaChange = getMaxAdjacentROIAreaVariation(rangeAreaEntries);
  const statGrid = document.createElement("div");
  statGrid.className = "roi-range-stats";

  function addStat(label, value) {
    const item = document.createElement("div");
    item.className = "roi-range-stat";
    item.innerHTML = `<span class="roi-range-stat-label">${label}</span><strong class="roi-range-stat-value">${value}</strong>`;
    statGrid.appendChild(item);
  }

  addStat("Cortes analisados", `${selected.length} (${selected[0].row.Slice}–${selected[selected.length-1].row.Slice})`);
  addStat("Área média", areas.length ? `${fmt(mean(areas.map(e => e.value)))} px²` : "Indisponível");
  addStat("Intensidade média", intensities.length ? `${fmt(mean(intensities))}/255` : "Indisponível");

  const detail = document.createElement("p");
  detail.className = "roi-range-detail";
  detail.textContent = areaChange
    ? `Maior variação absoluta de área no intervalo: ${fmt(areaChange.magnitude)} px² entre os cortes ${areaChange.firstSlice} e ${areaChange.secondSlice}.`
    : "Não existem dois cortes consecutivos disponíveis com áreas válidas para calcular a variação neste intervalo.";

  summary.replaceChildren(statGrid, detail);

  if (areaChange) {
    const actions = document.createElement("div");
    actions.className = "roi-range-actions";

    function addJumpButton(label, phaseIndex) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "roi-range-jump";
      button.textContent = label;
      button.onclick = () => {
        const slider = document.getElementById("sliceSlider");
        if (!slider) return;
        slider.value = String(phaseIndex);
        slider.dispatchEvent(new Event("input"));
        slider.scrollIntoView({ behavior: "smooth", block: "center" });
      };
      actions.appendChild(button);
    }

    addJumpButton(`Ver corte ${areaChange.firstSlice}`, rangeAreaEntries[areaChange.firstIndex].phaseIdx);
    addJumpButton(`Ver corte ${areaChange.secondSlice}`, rangeAreaEntries[areaChange.secondIndex].phaseIdx);
    summary.appendChild(actions);
  }
}

// Distribuicao bifocal no mesmo grafico: os cortes escolhidos ganham
// mais largura no eixo X; os restantes continuam visiveis como contexto.
// Os valores de area (eixo Y) nao sao transformados.
function buildROIBifocalPositions(count, startIndex, endIndex) {
  if (count <= 1) return [0];
  const focusedGaps = Math.max(0, endIndex - startIndex);
  const contextGaps = count - 1 - focusedGaps;
  // Sem intervalo util ou sem contexto, a escala permanece uniforme.
  if (!focusedGaps || !contextGaps) {
    return Array.from({ length: count }, (_, i) => 100 * i / (count - 1));
  }
  // Aproximadamente 65% da largura para o foco, 35% para o contexto.
  // Limitar a distorcao evita espacamentos extremos em intervalos curtos.
  const relativeFocusWeight = Math.min(18, Math.max(1, (0.65 / focusedGaps) / (0.35 / contextGaps)));
  const weights = Array.from({ length: count - 1 }, (_, i) =>
    i >= startIndex && i < endIndex ? relativeFocusWeight : 1
  );
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  const positions = [0];
  let cumulative = 0;
  weights.forEach(weight => {
    cumulative += weight;
    positions.push(100 * cumulative / total);
  });
  return positions;
}

// Marcas do eixo X com os numeros reais dos cortes, sem sugerir
// que o espacamento horizontal corresponde a distancias uniformes.
function getROIBifocalTickIndices(count, startIndex, endIndex) {
  const indices = new Set([0, count - 1, startIndex, endIndex]);
  const addSamples = (first, last, maxTicks) => {
    const span = last - first;
    if (span <= 0) return;
    for (let i = 1; i < maxTicks - 1; i++) {
      indices.add(first + Math.round(span * i / (maxTicks - 1)));
    }
  };
  addSamples(startIndex, endIndex, 7);
  if (startIndex > 0) addSamples(0, startIndex, 4);
  if (endIndex < count - 1) addSamples(endIndex, count - 1, 4);
  return [...indices].filter(i => i >= 0 && i < count).sort((a,b) => a-b);
}

// Evita sobreposicao dos rotulos no eixo X de espacamento nao uniforme.
// Mantem prioritariamente os limites do foco e os extremos da sequencia;
// apenas oculta rotulos, nunca pontos nem dados.
function getReadableROIBifocalTicks(indices, positions, labels, startIndex, endIndex, widthPx) {
  const width = Math.max(320, Number(widthPx) || 900);
  const priorities = [...new Set([startIndex, endIndex, 0, positions.length - 1])]
    .filter(i => i >= 0 && i < positions.length && indices.includes(i));
  const ordered = [...priorities, ...indices.filter(i => !priorities.includes(i))];
  const kept = [];
  for (const i of ordered) {
    const center = positions[i] * width / 103;
    // Margem pequena entre as etiquetas, adaptada ao numero de digitos.
    const halfWidth = Math.max(12, String(labels[i]).length * 4 + 6);
    const overlaps = kept.some(j => {
      const otherCenter = positions[j] * width / 103;
      const otherHalf = Math.max(12, String(labels[j]).length * 4 + 6);
      return Math.abs(center - otherCenter) < halfWidth + otherHalf + 5;
    });
    if (!overlaps) kept.push(i);
  }
  return kept.sort((a, b) => a - b);
}

// Escala adaptativa apenas para graficos de linhas, com limites legiveis.
// Preserva a escala real dos dados e os limites fisicos quando existem.
function roiLineScale(values, lowerBound = 0, upperBound = null) {
  const numbers = values.flat().map(Number).filter(Number.isFinite);
  if (!numbers.length) return { beginAtZero: true };
  const lo = Math.min(...numbers), hi = Math.max(...numbers);
  const range = hi - lo;
  const padding = range ? range * 0.08 : Math.max(Math.abs(hi) * 0.04, 1);
  const rawMin = Math.max(lowerBound, lo - padding);
  const rawMax = upperBound === null ? hi + padding : Math.min(upperBound, hi + padding);
  const desiredTick = Math.max((rawMax - rawMin) / 5, 1e-10);
  const power = Math.pow(10, Math.floor(Math.log10(desiredTick)));
  const unit = [1, 2, 5, 10].map(n => n * power).find(n => n >= desiredTick) || 10 * power;
  let min = Math.max(lowerBound, Math.floor(rawMin / unit) * unit);
  let max = Math.ceil(rawMax / unit) * unit;
  if (upperBound !== null) max = Math.min(upperBound, max);
  if (max <= min) max = upperBound !== null ? upperBound : min + unit;
  return { beginAtZero: false, min, max };
}

function renderROIAreaChart() {
  const canvas = document.getElementById("roiAreaChart");
  if (!canvas) return;

  const container = canvas.parentElement;
  if (container && !container.style.height) {
    container.style.height = "360px";
  }

  if (!currentPhaseRows.length) {
    if (roiAreaChart) {
      roiAreaChart.destroy();
      roiAreaChart = null;
    }
    renderROIRangeAnalysis([]);
    canvas.onclick = null;
    return;
  }

  // Reutiliza exatamente o mesmo conjunto de cortes do visualizador da Vista 1.
  const cur = currentPhaseRows[currentSliceIndex];
  const entries = [];
  currentPhaseRows.forEach((r, i) => {
    if (cur && r.Patient_ID === cur.Patient_ID && r.Study_ID === cur.Study_ID) {
      entries.push({ phaseIdx: i, row: r });
    }
  });
  const pts = entries.length ? entries : currentPhaseRows.map((r, i) => ({ phaseIdx: i, row: r }));

  renderROIRangeAnalysis(pts);
  roiBrushSyncScope();
  roiBrushControls();
  const labels = pts.map(e => String(e.row.Slice));
  const data = pts.map(e => Number(e.row.roiArea));
  const positions = buildROIBifocalPositions(pts.length, roiRangeSelection.start, roiRangeSelection.end);
  const mappedPoints = data.map((y, i) => ({ x: positions[i], y }));
  const candidateTickIndices = getROIBifocalTickIndices(pts.length, roiRangeSelection.start, roiRangeSelection.end);
  const tickIndices = getReadableROIBifocalTicks(candidateTickIndices, positions, labels,
    roiRangeSelection.start, roiRangeSelection.end, canvas.parentElement?.clientWidth || canvas.clientWidth);
  const focusActive = roiRangeSelection.end > roiRangeSelection.start &&
    (roiRangeSelection.start > 0 || roiRangeSelection.end < pts.length - 1);
  const caption = document.getElementById("roiBifocalNote");
  if (caption) {
    caption.textContent = focusActive
      ? `Foco ampliado: cortes ${labels[roiRangeSelection.start]}–${labels[roiRangeSelection.end]}. O eixo horizontal utiliza espaçamento não uniforme; os valores de área não são alterados.`
      : "Seleciona um subconjunto de pelo menos dois cortes para ampliar o foco no próprio gráfico, mantendo o contexto visível.";
  }
  const selPos = pts.findIndex(e => e.phaseIdx === currentSliceIndex);
  // Destaque calculado APENAS para o intervalo escolhido pelo utilizador.
  // Os índices do resultado são relativos ao intervalo, pelo que é
  // necessário convertê-los para os índices do gráfico completo.
  const selectedEntries = pts.slice(roiRangeSelection.start, roiRangeSelection.end + 1);
  const biggest = getMaxAdjacentROIAreaVariation(selectedEntries);
  const highlighted = new Set(biggest ? [
    roiRangeSelection.start + biggest.firstIndex,
    roiRangeSelection.start + biggest.secondIndex
  ] : []);

  if (roiAreaChart) roiAreaChart.destroy();

  roiAreaChart = new Chart(canvas, {
    type: "scatter",
    data: {
      datasets: [
        {
          label: "Área da ROI ao Longo das Slices",
          data: mappedPoints,
          showLine: true,
          borderColor: "#2563eb",
          backgroundColor: "rgba(37, 99, 235, 0.08)",
          borderWidth: 3,
          tension: 0,
          pointRadius: data.map((_, i) => i === selPos || highlighted.has(i) || roiBrushSelected(pts[i].row.Slice) ? 8 : 4),
          pointBackgroundColor: data.map((_, i) => i === selPos ? "#e11d48" :
                                                   highlighted.has(i) ? "#f59e0b" :
                                                   roiBrushSelected(pts[i].row.Slice) ? "#7c3aed" : "#2563eb"),
          pointBorderColor: "#fff",
          pointBorderWidth: 2,
          clip: false,
          fill: false
        },
        {
          label: "Maior variação entre cortes adjacentes",
          data: mappedPoints.map((v, i) => highlighted.has(i) ? v : { x: v.x, y: null }),
          borderColor: "#f59e0b",
          backgroundColor: "#f59e0b",
          borderWidth: 2,
          tension: 0,
          pointRadius: data.map((_, i) => highlighted.has(i) && i !== selPos ? 6 : 0),
          pointHoverRadius: data.map((_, i) => highlighted.has(i) && i !== selPos ? 8 : 0),
          pointBackgroundColor: data.map((_, i) => highlighted.has(i) ? "#f59e0b" : "transparent"),
          pointBorderColor: "#fff",
          pointBorderWidth: 2,
          spanGaps: false,
          showLine: false,
          clip: false,
          fill: false
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      // Margens e pontos sem recorte: os marcadores dos cortes extremos
      // (incluindo area 0) ficam totalmente visiveis.
      layout: { padding: { left: 12, right: 12, bottom: 10 } },
      interaction: { mode: "nearest", intersect: false },
      plugins: {
        legend: { display: false },
        roiSelectedRangeBackground: {
          startIndex: roiRangeSelection.start,
          endIndex: roiRangeSelection.end,
          color: "rgba(8, 145, 178, 0.10)",
          showBoundaries: focusActive
        },
        tooltip: {
          callbacks: {
            title: ctx => `Corte ${labels[ctx[0].dataIndex]}`,
            label: ctx => `${ctx.dataset.label}: ${ctx.parsed.y} px²`
          }
        }
      },
      scales: {
        x: {
          type: "linear", min: -1.5, max: 101.5,
          title: { display: true, text: "Corte (espaçamento horizontal variável no foco)" },
          afterBuildTicks: scale => {
            scale.ticks = tickIndices.map(i => ({ value: positions[i] }));
          },
          ticks: {
            autoSkip: false, maxRotation: 0,
            callback: value => {
              const i = tickIndices.find(idx => Math.abs(positions[idx] - Number(value)) < 0.00001);
              return i === undefined ? "" : labels[i];
            }
          }
        },
        y: {
          ...roiLineScale(data),
          title: { display: true, text: "Área da ROI (px²)" }
        }
      }
    }
  });

  // Seleção por arrastamento só no modo explícito; nunca altera o intervalo Focus+Context.
  canvas.style.cursor = roiBrush.enabled ? "crosshair" : "pointer";
  canvas.onpointerdown = null;
  canvas.onpointermove = null;
  canvas.onclick = function(evt) {
    if (roiBrush.enabled) return;
    const elements = roiAreaChart.getElementsAtEventForMode(evt, "nearest", { intersect: false }, false);
    if (!elements.length) return;
    const phaseIdx = pts[elements[0].index]?.phaseIdx;
    if (phaseIdx === undefined) return;
    const slider = document.getElementById("sliceSlider");
    if (!slider) return;
    slider.value = phaseIdx;
    slider.dispatchEvent(new Event("input"));
  };
  if (roiBrush.enabled) {
    canvas.onpointerdown = evt => {
      if (evt.button !== 0 || !roiAreaChart?.chartArea) return;
      const rect = canvas.getBoundingClientRect();
      const x = (evt.clientX - rect.left) * roiAreaChart.width / rect.width;
      const area = roiAreaChart.chartArea;
      if (x < area.left || x > area.right) return;
      roiBrush.drag = { startX: x, endX: x };
      canvas.setPointerCapture(evt.pointerId);
      evt.preventDefault();
    };
    canvas.onpointermove = evt => {
      if (!roiBrush.drag || !roiAreaChart) return;
      const rect = canvas.getBoundingClientRect();
      roiBrush.drag.endX = (evt.clientX - rect.left) * roiAreaChart.width / rect.width;
      roiAreaChart.draw();
    };
    canvas.onpointerup = evt => {
      if (!roiBrush.drag || !roiAreaChart) return;
      const rect = canvas.getBoundingClientRect();
      roiBrush.drag.endX = (evt.clientX - rect.left) * roiAreaChart.width / rect.width;
      const { startX, endX } = roiBrush.drag;
      roiBrush.drag = null;
      if (canvas.hasPointerCapture(evt.pointerId)) canvas.releasePointerCapture(evt.pointerId);
      // Corresponde ao intervalo do eixo X bifocal, não a posições igualmente espaçadas.
      const lo = Math.min(startX, endX), hi = Math.max(startX, endX);
      const scale = roiAreaChart.scales.x;
      const leftValue = scale.getValueForPixel(lo), rightValue = scale.getValueForPixel(hi);
      const picked = pts.filter((entry, i) => positions[i] >= leftValue && positions[i] <= rightValue)
        .map(entry => Number(entry.row.Slice));
      // Um arrastamento muito curto seleciona o corte mais próximo.
      if (!picked.length && Math.abs(endX - startX) < 8) {
        const nearest = pts.reduce((best, _, i) =>
          Math.abs(scale.getPixelForValue(positions[i]) - startX) <
          Math.abs(scale.getPixelForValue(positions[best]) - startX) ? i : best, 0);
        if (pts[nearest]) picked.push(Number(pts[nearest].row.Slice));
      }
      roiBrush.slices = new Set(picked);
      roiBrushRefreshLinked();
    };
    canvas.onpointercancel = evt => {
      roiBrush.drag = null;
      if (canvas.hasPointerCapture(evt.pointerId)) canvas.releasePointerCapture(evt.pointerId);
      roiAreaChart?.draw();
    };
  }
}

function toggleIntensityEmptyState(canvas, emptyId, showEmpty) {
  if (!canvas) return;
  const message = document.getElementById(emptyId);
  canvas.hidden = showEmpty;
  if (message) message.hidden = !showEmpty;
}

function renderROIIntensityChart() {
  const canvas = document.getElementById("roiIntensityChart");
  if (!canvas) return;

  const container = canvas.parentElement;
  if (container && !container.style.height) {
    container.style.height = "360px";
  }

  if (!currentPhaseRows.length) {
    if (roiIntensityChart) { roiIntensityChart.destroy(); roiIntensityChart = null; }
    toggleIntensityEmptyState(canvas, "roiIntensityEmpty", true);
    return;
  }

  const cur = currentPhaseRows[currentSliceIndex];
  const entries = [];
  currentPhaseRows.forEach((r, i) => {
    if (cur && r.Patient_ID === cur.Patient_ID && r.Study_ID === cur.Study_ID) {
      entries.push({ phaseIdx: i, row: r });
    }
  });
  const pts = entries.length ? entries : currentPhaseRows.map((r, i) => ({ phaseIdx: i, row: r }));

  // Se nenhuma linha tiver intensidade pré-calculada (dataset sem esta
  // informação), a vista assinala a ausência de dados em vez de desenhar
  // um gráfico vazio ou com zeros.
  const hasIntensity = pts.some(e => e.row.meanIntensity !== null);
  if (roiIntensityChart) { roiIntensityChart.destroy(); roiIntensityChart = null; }
  toggleIntensityEmptyState(canvas, "roiIntensityEmpty", !hasIntensity);
  if (!hasIntensity) return;

  const labels = pts.map(e => String(e.row.Slice));
  const data   = pts.map(e => e.row.meanIntensity);
  const selPos = pts.findIndex(e => e.phaseIdx === currentSliceIndex);
  roiBrushSyncScope();

  roiIntensityChart = new Chart(canvas, {
    type: "line",
    data: {
      labels,
      datasets: [
        {
          label: "Intensidade Média dos Píxeis na ROI",
          data,
          borderColor: "#d97706",
          backgroundColor: "rgba(217, 119, 6, 0.08)",
          borderWidth: 3,
          tension: 0.15,
          pointRadius: data.map((_, i) => i === selPos || roiBrushSelected(pts[i].row.Slice) ? 8 : 4),
          pointBackgroundColor: data.map((_, i) => i === selPos ? "#e11d48" :
            roiBrushSelected(pts[i].row.Slice) ? "#7c3aed" : "#d97706"),
          pointBorderColor: "#fff",
          pointBorderWidth: 2,
          fill: false
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      interaction: { mode: "index", intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            title: ctx => `Slice ${labels[ctx[0].dataIndex]}`,
            label: ctx => `Intensidade média: ${ctx.raw}`
          }
        }
      },
      scales: {
        x: {
          title: { display: true, text: "Slice" },
          ticks: { autoSkip: true, maxTicksLimit: 18, maxRotation: 0 }
        },
        y: {
          ...roiLineScale(data, 0, 255),
          title: { display: true, text: "Intensidade média (0–255)" }
        }
      }
    }
  });

  canvas.onclick = function(evt) {
    const elements = roiIntensityChart.getElementsAtEventForMode(evt, "nearest", { intersect: false }, false);
    if (!elements.length) return;

    const pos      = elements[0].index;
    const phaseIdx = pts[pos]?.phaseIdx;
    if (phaseIdx === undefined) return;

    const slider = document.getElementById("sliceSlider");
    if (!slider) return;

    slider.value = phaseIdx;
    slider.dispatchEvent(new Event("input"));
  };
}

/* =========================
   3D TUMOR VOLUME - STACK
========================= */

function disposeTumor3D() {
  if (tumor3DAnimationId) {
    cancelAnimationFrame(tumor3DAnimationId);
    tumor3DAnimationId = null;
  }
  if (tumor3DRenderer) {
    tumor3DRenderer.dispose();
    const container = document.getElementById("tumor3DViewer");
    if (container && tumor3DRenderer.domElement && container.contains(tumor3DRenderer.domElement)) {
      container.removeChild(tumor3DRenderer.domElement);
    }
  }
  tumor3DScene = null;
  tumor3DCamera = null;
  tumor3DRenderer = null;
  tumor3DControls = null;
  tumor3DGroup = null;
}

// px -> world-unit scale and slab geometry constants
var T3D_SCALE       = 2.5;
var T3D_SLAB_HEIGHT = 8;
var T3D_GAP         = 2;

// Instrumentacao opcional para o teste de desempenho da Vista 3.
// Mede desde o pedido de reconstrucao ate ao fim da primeira chamada render() do Three.js.
// Nao mede o tempo total de apresentacao no ecra nem o carregamento da pagina.
var va3dBenchmarkCallback = null;
var va3dRenderStart = null;

function renderTumor3D() {
  va3dRenderStart = performance.now();
  var container = document.getElementById("tumor3DViewer");
  if (!container) return;
  // Atualizar apenas a descricao da escala, sem substituir o HTML existente.
  var subtitle = document.querySelector("#tumor-3d-section .section-subtitle");
  if (subtitle && subtitle.textContent.includes("entre tons de azul e vermelho")) {
    subtitle.textContent = "Reconstrução volumétrica aproximada do caso selecionado através do empilhamento das slices 2D. A escala sequencial de azul-claro a azul-escuro representa a área da ROI ao longo do volume; o corte selecionado é destacado a vermelho.";
  }

  if (typeof THREE === "undefined") {
    container.innerHTML = "<div style=\"height:420px;display:flex;align-items:center;justify-content:center;color:#526277;\">Three.js nao carregado.</div>";
    return;
  }

  // Defer so the browser has time to lay out the container at its full CSS height
  // before we read clientWidth/clientHeight.
  requestAnimationFrame(function() {
    _renderTumor3DInternal();
  });
}

function _renderTumor3DInternal() {
  var container = document.getElementById("tumor3DViewer");
  if (!container) return;

  disposeTumor3D();
  container.innerHTML = "";

  if (!currentPhaseRows.length) return;

  var currentRow = currentPhaseRows[currentSliceIndex];
  if (!currentRow) return;

  var caseRows = allRows
    .filter(function(r) {
      return r.Patient_ID === currentRow.Patient_ID &&
             r.Study_ID   === currentRow.Study_ID   &&
             r.Dataset    === currentRow.Dataset    &&
             r.Phase      === currentPhase          &&
             r.roiArea    >  0;
    })
    .sort(function(a, b) { return a.Slice - b.Slice; });

  if (!caseRows.length) return;

  var allXmin = caseRows.map(function(r){ return r.X_min; });
  var allXmax = caseRows.map(function(r){ return r.X_max; });
  var allYmin = caseRows.map(function(r){ return r.Y_min; });
  var allYmax = caseRows.map(function(r){ return r.Y_max; });

  var globalXcenter = (Math.min.apply(null,allXmin) + Math.max.apply(null,allXmax)) / 2;
  var globalZcenter = (Math.min.apply(null,allYmin) + Math.max.apply(null,allYmax)) / 2;

  var maxArea  = Math.max.apply(null, caseRows.map(function(r){ return r.roiArea; }).concat([1]));
  var n        = caseRows.length;
  var totalH   = n * (T3D_SLAB_HEIGHT + T3D_GAP) - T3D_GAP;
  var yBottom  = -totalH / 2;

  var W = container.clientWidth  || 900;
  var H = container.clientHeight || 680;

  tumor3DScene = new THREE.Scene();
  tumor3DScene.background = new THREE.Color(0x0d1117);

  tumor3DCamera = new THREE.PerspectiveCamera(42, W / H, 1, 8000);

  var maxExtentX = (Math.max.apply(null,allXmax) - Math.min.apply(null,allXmin)) * T3D_SCALE;
  var maxExtentZ = (Math.max.apply(null,allYmax) - Math.min.apply(null,allYmin)) * T3D_SCALE;
  var maxExtent  = Math.max(maxExtentX, maxExtentZ, totalH, 80);
  var camDist    = maxExtent * 2.8;

  tumor3DCamera.position.set(camDist * 0.72, camDist * 0.55, camDist * 0.72);
  tumor3DCamera.lookAt(0, 0, 0);

  tumor3DRenderer = new THREE.WebGLRenderer({ antialias: true });
  tumor3DRenderer.setSize(W, H);
  tumor3DRenderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  container.appendChild(tumor3DRenderer.domElement);

  if (THREE.OrbitControls) {
    tumor3DControls = new THREE.OrbitControls(tumor3DCamera, tumor3DRenderer.domElement);
    tumor3DControls.enableDamping = true;
    tumor3DControls.dampingFactor = 0.07;
    tumor3DControls.target.set(0, 0, 0);
    tumor3DControls.update();
  }

  tumor3DScene.add(new THREE.AmbientLight(0xffffff, 0.65));
  var sun = new THREE.DirectionalLight(0xffffff, 1.2);
  sun.position.set(200, 300, 200);
  tumor3DScene.add(sun);
  var fill = new THREE.DirectionalLight(0x8fb4ff, 0.5);
  fill.position.set(-150, -100, -150);
  tumor3DScene.add(fill);

  tumor3DGroup = new THREE.Group();
  tumor3DScene.add(tumor3DGroup);

  // Escala sequencial azul: a area determina uma unica progressao de cor.
  // O corte ativo continua a ser destacado a vermelho pela logica existente.
  function slabColour(normArea) {
    var t = Math.max(0, Math.min(1, Number(normArea) || 0));
    var low = new THREE.Color(0xb9ddf2);
    var high = new THREE.Color(0x2252b5);
    return low.lerp(high, t);
  }

  caseRows.forEach(function(row, i) {
    var slabW = Math.max(4, (row.X_max - row.X_min)) * T3D_SCALE;
    var slabD = Math.max(4, (row.Y_max - row.Y_min)) * T3D_SCALE;
    var cx    = (row.X_min + row.X_max) / 2;
    var cz    = (row.Y_min + row.Y_max) / 2;
    var wx    = (cx - globalXcenter) * T3D_SCALE;
    var wz    = (cz - globalZcenter) * T3D_SCALE;
    var wy    = yBottom + i * (T3D_SLAB_HEIGHT + T3D_GAP) + T3D_SLAB_HEIGHT / 2;

    var normArea   = row.roiArea / maxArea;
    var colour     = slabColour(normArea);
    var isSelected = row.Slice === selectedSlice;

    if (tumor3DMode === "wireframe") {
      var geo  = new THREE.BoxGeometry(slabW, T3D_SLAB_HEIGHT, slabD);
      var edge = new THREE.EdgesGeometry(geo);
      var mat  = new THREE.LineBasicMaterial({
        color: isSelected ? 0xff2d55 : colour,
        transparent: true,
        opacity: isSelected ? 1.0 : 0.75
      });
      var lines = new THREE.LineSegments(edge, mat);
      lines.position.set(wx, wy, wz);
      lines.userData.type = "tumourSlab";
      tumor3DGroup.add(lines);
    } else {
      var geo = new THREE.BoxGeometry(slabW, T3D_SLAB_HEIGHT, slabD);
      var mat = new THREE.MeshPhongMaterial({
        color: isSelected ? new THREE.Color(1, 0.18, 0.34) : colour,
        transparent: true,
        opacity: isSelected ? 1.0 : 0.85,
        shininess: 55,
        specular: new THREE.Color(0.25, 0.25, 0.25)
      });
      var mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(wx, wy, wz);
      mesh.userData.type = "tumourSlab";
      tumor3DGroup.add(mesh);

      if (isSelected) {
        var eMat  = new THREE.LineBasicMaterial({ color: 0xff2d55 });
        var eGeo  = new THREE.EdgesGeometry(geo);
        var eLine = new THREE.LineSegments(eGeo, eMat);
        eLine.position.copy(mesh.position);
        eLine.userData.type = "tumourSlab";
        tumor3DGroup.add(eLine);
      }
    }
  });

  // Vertical corner outlines bounding the whole volume
  var minXw = (Math.min.apply(null,allXmin) - globalXcenter) * T3D_SCALE;
  var maxXw = (Math.max.apply(null,allXmax) - globalXcenter) * T3D_SCALE;
  var minZw = (Math.min.apply(null,allYmin) - globalZcenter) * T3D_SCALE;
  var maxZw = (Math.max.apply(null,allYmax) - globalZcenter) * T3D_SCALE;
  var yTop  = yBottom + totalH;

  var corners = [[minXw,minZw],[maxXw,minZw],[maxXw,maxZw],[minXw,maxZw]];
  var outMat  = new THREE.LineBasicMaterial({ color: 0x2a3d55, transparent: true, opacity: 0.45 });
  corners.forEach(function(c) {
    var pts = [new THREE.Vector3(c[0], yBottom - 2, c[1]),
               new THREE.Vector3(c[0], yTop    + 2, c[1])];
    tumor3DGroup.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), outMat));
  });

  // Floor grid
  var gridSize = Math.max(200, maxExtent * 2.2);
  var grid = new THREE.GridHelper(gridSize, 28, 0x1a2535, 0x1a2535);
  grid.position.y = yBottom - 18;
  tumor3DScene.add(grid);

  function animate() {
    tumor3DAnimationId = requestAnimationFrame(animate);
    if (tumor3DControls) tumor3DControls.update();
    if (tumor3DRenderer && tumor3DScene && tumor3DCamera) {
      tumor3DRenderer.render(tumor3DScene, tumor3DCamera);
      if (va3dBenchmarkCallback) {
        var callback = va3dBenchmarkCallback;
        va3dBenchmarkCallback = null;
        callback(performance.now() - va3dRenderStart);
      }
    }
  }
  animate();

}

// Executar no Console do Chrome: medirReconstrucao3D(5)
// Mantem o caso e fase atuais; cada repeticao recria e renderiza o volume.
window.medirReconstrucao3D = async function(repeticoes) {
  repeticoes = repeticoes === undefined ? 5 : Number(repeticoes);
  if (!Number.isInteger(repeticoes) || repeticoes < 1 || repeticoes > 30) {
    console.error("Escolhe um numero inteiro de repeticoes entre 1 e 30.");
    return;
  }
  if (typeof THREE === "undefined" || !currentPhaseRows.length) {
    console.error("A reconstrucao ainda nao esta pronta. Seleciona um caso valido e tenta novamente.");
    return;
  }
  if (va3dBenchmarkCallback) {
    console.error("Ja existe uma medicao em curso.");
    return;
  }
  var tempos = [];
  for (var i = 0; i < repeticoes; i++) {
    try {
      var duracao = await new Promise(function(resolve, reject) {
        var timeout = setTimeout(function() {
          va3dBenchmarkCallback = null;
          reject(new Error("Tempo limite excedido ao criar a reconstrucao."));
        }, 8000);
        va3dBenchmarkCallback = function(ms) {
          clearTimeout(timeout);
          resolve(ms);
        };
        renderTumor3D();
      });
      tempos.push(Number(duracao.toFixed(2)));
      // Permite que o navegador conclua mais um ciclo de apresentacao.
      await new Promise(function(resolve) { requestAnimationFrame(resolve); });
    } catch (erro) {
      console.error("Falha na medicao " + (i + 1) + ":", erro);
      return;
    }
  }
  var ordenados = tempos.slice().sort(function(a, b) { return a - b; });
  var meio = Math.floor(ordenados.length / 2);
  var mediana = ordenados.length % 2 ? ordenados[meio] : (ordenados[meio - 1] + ordenados[meio]) / 2;
  console.table(tempos.map(function(ms, i) { return { medicao: i + 1, tempo_ms: ms }; }));
  console.log("Reconstrucao 3D (inicio do pedido ate primeira renderizacao Three.js): " +
    "mediana=" + mediana.toFixed(2) + " ms; minimo=" + ordenados[0].toFixed(2) +
    " ms; maximo=" + ordenados[ordenados.length - 1].toFixed(2) + " ms.");
  console.log("Tempos para copiar: " + tempos.map(function(ms) { return ms.toFixed(2); }).join("; ") + " ms");
  return tempos;
};

function setTumor3DMode(mode) {
  tumor3DMode = mode;
  renderTumor3D();
}

function resetTumor3DView() {
  if (!tumor3DCamera || !tumor3DGroup) return;
  var box    = new THREE.Box3().setFromObject(tumor3DGroup);
  var size   = box.getSize(new THREE.Vector3());
  var centre = box.getCenter(new THREE.Vector3());
  var maxExt = Math.max(size.x, size.y, size.z, 80);
  var dist   = maxExt * 2.8;
  tumor3DCamera.position.set(
    centre.x + dist * 0.72,
    centre.y + dist * 0.55,
    centre.z + dist * 0.72
  );
  tumor3DCamera.lookAt(centre);
  if (tumor3DControls) {
    tumor3DControls.target.copy(centre);
    tumor3DControls.update();
  }
}

function resizeTumor3D() {
  var container = document.getElementById("tumor3DViewer");
  if (!container || !tumor3DRenderer || !tumor3DCamera) return;
  var W = container.clientWidth  || 900;
  var H = container.clientHeight || 680;
  tumor3DCamera.aspect = W / H;
  tumor3DCamera.updateProjectionMatrix();
  tumor3DRenderer.setSize(W, H);
}

// A mesma escala sequencial usada na legenda do mapa de calor.
function roiHeatmapColor(relativeArea) {
  const t = Math.max(0, Math.min(1, Number(relativeArea) || 0));
  const from = [239, 246, 255], to = [30, 64, 175];
  return `rgb(${from.map((v, i) => Math.round(v + (to[i] - v) * t)).join(", ")})`;
}

function renderROIHeatmap(rows) {
  const container = document.getElementById("roiHeatmap");

  if (!container) return;

  container.innerHTML = "";

  if (!rows.length) return;

  const phases = [...new Set(rows.map(r => r.Phase))].sort((a, b) => a - b);
  const slices = [...new Set(rows.map(r => r.Slice))].sort((a, b) => a - b);
  const maxArea = Math.max(...rows.map(r => r.roiArea), 1);

  container.style.gridTemplateColumns = `90px repeat(${slices.length}, minmax(24px, 1fr))`;

  const corner = document.createElement("div");
  corner.className = "heatmap-corner";
  container.appendChild(corner);

  slices.forEach(slice => {
    const header = document.createElement("div");
    header.className = "heatmap-header";
    header.textContent = slice;
    container.appendChild(header);
  });

  phases.forEach(phase => {
    const rowLabel = document.createElement("div");
    rowLabel.className = "heatmap-row-label";
    rowLabel.textContent = `Fase ${phase}`;
    container.appendChild(rowLabel);

    slices.forEach(slice => {
      const match = rows.find(r => r.Phase === phase && r.Slice === slice);
      const cell = document.createElement("div");

      cell.className = "heatmap-cell";
      roiBrushSyncScope();
      if (roiBrushSelected(slice) && match && getCaseKey(match) === activeCaseKey) {
        cell.classList.add("roi-brush-linked");
      }

      if (match) {
        const intensity = match.roiArea / maxArea;

        cell.style.backgroundColor = roiHeatmapColor(intensity);
        cell.title = `Fase ${phase} | Slice ${slice} | Área ROI: ${match.roiArea}`;

        if (phase === currentPhase && slice === selectedSlice) {
          cell.classList.add("active");
        }

        cell.addEventListener("click", () => {
          activeCaseKey = getCaseKey(match);
          activeCaseChosenAutomatically = false;
          currentPhase = phase;
          selectedSlice = slice;

          updatePhaseSelectFromFiltered();

          currentPhaseRows = filteredRows
            .filter(r =>
              r.Phase === currentPhase &&
              r.Patient_ID === match.Patient_ID &&
              r.Study_ID === match.Study_ID &&
              r.Dataset === match.Dataset
            )
            .sort((a, b) => a.Slice - b.Slice);

          currentSliceIndex = currentPhaseRows.findIndex(r => r.Slice === slice);

          if (currentSliceIndex < 0) {
            currentSliceIndex = 0;
          }

          const slider = document.getElementById("sliceSlider");

          if (slider) {
            slider.min = 0;
            slider.max = Math.max(0, currentPhaseRows.length - 1);
            slider.value = currentSliceIndex;
          }

          populateTopMetadata(currentPhaseRows);
          renderCurrentSlice();
          renderTable(filteredRows);
          renderPhaseComparison();
          renderROIAreaChart();
    renderROIIntensityChart();
          renderTumor3D();
          renderROIHeatmap(filteredRows);
          renderKeyInsights();
        });
      } else {
        cell.classList.add("empty");
        cell.title = `Fase ${phase} | Slice ${slice} | sem dados`;
      }

      container.appendChild(cell);
    });
  });
}


function analyticsChartOptions(yOptions = {}) {
  return {
    responsive: true,
    maintainAspectRatio: false,
    interaction: {
      mode: "nearest",
      intersect: true
    },
    plugins: {
      legend: { display: false },
      tooltip: {
        enabled: true,
        intersect: true,
        displayColors: false,
        padding: 10
      }
    },
    onClick: (event, elements, chart) => {
      if (!elements.length) return;
      const element = elements[0];
      chart.setActiveElements([element]);
      chart.tooltip.setActiveElements([element], {
        x: event.x,
        y: event.y
      });
      chart.update();
    },
    scales: yOptions
  };
}

function renderSlicesByPhaseChart(rows) {
  const canvas = document.getElementById("subtypePerformanceChart");

  if (!canvas) return;

  const phases = [...new Set(rows.map(r => r.Phase))].sort((a, b) => a - b);
  const counts = phases.map(phase => rows.filter(r => r.Phase === phase).length);

  if (slicesByPhaseChart) { slicesByPhaseChart.destroy(); slicesByPhaseChart = null; }
  const redundant = counts.length > 1 && counts.every(value => value === counts[0]);
  let note = document.getElementById("slicesByPhaseEqualNotice");
  if (redundant && !note) {
    note = document.createElement("p");
    note.id = "slicesByPhaseEqualNotice";
    note.style.cssText = "margin:24px 12px;text-align:center;color:#475569;font-weight:600;line-height:1.5";
    canvas.insertAdjacentElement("afterend", note);
  }
  if (note) {
    note.hidden = !redundant;
    if (redundant) note.textContent = `${counts[0]} cortes em cada uma das ${phases.length} fases.`;
  }
  canvas.style.display = redundant ? "none" : "";
  if (redundant) return;

  slicesByPhaseChart = new Chart(canvas, {
    type: "bar",
    data: {
      labels: phases.map(p => `Fase ${p}`),
      datasets: [{
        data: counts,
        backgroundColor: ["#60a5fa", "#a78bfa", "#34d399", "#f472b6", "#fb923c", "#38bdf8"]
      }]
    },
    options: analyticsChartOptions({
      y: { beginAtZero: true }
    })
  });
}

function renderROIAreaByPhaseChart(rows) {
  const canvas = document.getElementById("datasetPerformanceChart");

  if (!canvas) return;

  const phases = [...new Set(rows.map(r => r.Phase))].sort((a, b) => a - b);

  const averages = phases.map(phase => {
    const phaseRows = rows.filter(r => r.Phase === phase);

    if (!phaseRows.length) return 0;

    return phaseRows.reduce((sum, r) => sum + r.roiArea, 0) / phaseRows.length;
  });

  if (roiAreaByPhaseChart) roiAreaByPhaseChart.destroy();

  roiAreaByPhaseChart = new Chart(canvas, {
    type: "bar",
    data: {
      labels: phases.map(p => `Fase ${p}`),
      datasets: [{
        data: averages,
        backgroundColor: ["#60a5fa", "#a78bfa", "#34d399", "#f472b6", "#fb923c", "#38bdf8"]
      }]
    },
    options: analyticsChartOptions({
      y: { beginAtZero: true }
    })
  });
}

function renderIntensityByPhaseChart(rows) {
  const canvas = document.getElementById("intensityByPhaseChart");
  if (!canvas) return;

  const phases = [...new Set(rows.map(r => r.Phase))].sort((a, b) => a - b);

  const averages = phases.map(phase => {
    const phaseRows = rows.filter(r => r.Phase === phase && r.meanIntensity !== null);
    if (!phaseRows.length) return null;
    return phaseRows.reduce((sum, r) => sum + r.meanIntensity, 0) / phaseRows.length;
  });

  if (intensityByPhaseChart) { intensityByPhaseChart.destroy(); intensityByPhaseChart = null; }

  // A falta de valores é explicitamente indicada, sem fabricar medições.
  const noIntensity = averages.every(a => a === null);
  toggleIntensityEmptyState(canvas, "intensityByPhaseEmpty", noIntensity);
  if (noIntensity) return;

  intensityByPhaseChart = new Chart(canvas, {
    type: "bar",
    data: {
      labels: phases.map(p => `Fase ${p}`),
      datasets: [{
        data: averages.map(a => a === null ? null : Math.round(a * 100) / 100),
        backgroundColor: ["#fbbf24", "#f472b6", "#38bdf8", "#a78bfa", "#34d399", "#fb923c"]
      }]
    },
    options: analyticsChartOptions({
      y: {
        beginAtZero: false,
        suggestedMin: 0,
        suggestedMax: 255,
        ticks: { stepSize: 25 },
        title: { display: true, text: "Intensidade média (0–255)" }
      }
    })
  });
}

const METRIC_LABELS_PT = {
  accuracy: "Exatidão (accuracy)",
  precision: "Precisão (precision)",
  recall: "Sensibilidade (recall)",
  f1: "Pontuação F1",
  auc: "AUC",
  specificity: "Especificidade",
  balanced_accuracy: "Balanced accuracy",
  mcc: "Coeficiente de correlação de Matthews (MCC)"
};

const SUBTYPE_DISPLAY_LABELS = {
  "Luminal A": "Luminal A",
  "Luminal B": "Luminal B",
  "HER2-enriched": "HER2-positivo",
  "Triple Negative": "Triplo-negativo"
};

function getSubtypeDisplayLabel(label) {
  return SUBTYPE_DISPLAY_LABELS[label] || label;
}

// Intervalos binomiais exatos (Clopper-Pearson, 95%) para proporções
// calculadas a partir das matrizes de confusão one-vs-all.
function binomialCdfAtMost(k, n, p) {
  if (k < 0) return 0;
  if (k >= n) return 1;
  if (p <= 0) return 1;
  if (p >= 1) return 0;
  let sum = 0;
  let coefficient = 1;
  for (let i = 0; i <= k; i++) {
    if (i > 0) coefficient *= (n - i + 1) / i;
    sum += coefficient * Math.pow(p, i) * Math.pow(1 - p, n - i);
  }
  return Math.max(0, Math.min(1, sum));
}

function exactBinomialConfidenceInterval(successes, trials, alpha = 0.05) {
  if (!Number.isInteger(successes) || !Number.isInteger(trials) ||
      trials <= 0 || successes < 0 || successes > trials) return null;
  let lower = 0;
  let upper = 1;
  if (successes > 0) {
    // Limite inferior: P(X >= successes | p = lower) = alpha / 2.
    let a = 0, b = 1;
    for (let i = 0; i < 55; i++) {
      const mid = (a + b) / 2;
      const survival = 1 - binomialCdfAtMost(successes - 1, trials, mid);
      if (survival < alpha / 2) a = mid;
      else b = mid;
    }
    lower = (a + b) / 2;
  }
  if (successes < trials) {
    // Limite superior: P(X <= successes | p = upper) = alpha / 2.
    let a = 0, b = 1;
    for (let i = 0; i < 55; i++) {
      const mid = (a + b) / 2;
      if (binomialCdfAtMost(successes, trials, mid) > alpha / 2) a = mid;
      else b = mid;
    }
    upper = (a + b) / 2;
  }
  return { lower, upper, estimate: successes / trials, successes, trials };
}

function renderMetricConfidenceIntervals(metricKey) {
  const panel = document.getElementById("metricConfidencePanel");
  const content = document.getElementById("metricConfidenceContent");
  const heading = document.getElementById("metricConfidenceTitle");
  if (!panel || !content || !heading) return;

  if (metricKey !== "recall" && metricKey !== "precision") {
    panel.hidden = true;
    content.replaceChildren();
    return;
  }
  panel.hidden = false;
  heading.textContent = `Intervalos de confiança de 95% — ${metricKey === "recall" ? "sensibilidade (recall)" : "precisão (precision)"}`;
  content.replaceChildren();
  const numberPt = value => (value * 100).toLocaleString("pt-PT", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  for (const [name, metrics] of Object.entries(subtypeMetrics)) {
    const tp = Number(metrics.tp), fn = Number(metrics.fn), fp = Number(metrics.fp);
    const n = metricKey === "recall" ? tp + fn : tp + fp;
    const interval = exactBinomialConfidenceInterval(tp, n);
    const item = document.createElement("div");
    item.className = "metric-ci-row";
    const title = document.createElement("strong");
    title.className = "metric-ci-subtype";
    title.textContent = getSubtypeDisplayLabel(name);
    item.appendChild(title);
    if (!interval) {
      const unavailable = document.createElement("span");
      unavailable.textContent = "Indisponível";
      item.appendChild(unavailable);
    } else {
      const track = document.createElement("div");
      track.className = "metric-ci-track";
      track.setAttribute("role", "img");
      track.setAttribute("aria-label", `${numberPt(interval.estimate)}%, intervalo de confiança de ${numberPt(interval.lower)}% a ${numberPt(interval.upper)}%`);
      const range = document.createElement("span");
      range.className = "metric-ci-range";
      range.style.left = `${interval.lower * 100}%`;
      range.style.width = `${Math.max(0, (interval.upper - interval.lower) * 100)}%`;
      const marker = document.createElement("span");
      marker.className = "metric-ci-marker";
      marker.style.left = `${interval.estimate * 100}%`;
      track.append(range, marker);
      const figures = document.createElement("span");
      figures.className = "metric-ci-figures";
      figures.textContent = `${numberPt(interval.estimate)}%  [${numberPt(interval.lower)}%; ${numberPt(interval.upper)}%]`;
      const count = document.createElement("span");
      count.className = "metric-ci-count";
      count.textContent = `${interval.successes}/${interval.trials} casos`;
      item.append(title, track, figures, count);
    }
    content.appendChild(item);
  }
}

function renderModelMetricsChart(metricKey = "accuracy") {
  const canvas = document.getElementById("modelMetricsChart");

  if (!canvas) return;
  if (!Object.keys(subtypeMetrics).length) return;

  const labels = Object.keys(subtypeMetrics);
  const displayLabels = labels.map(label => getSubtypeDisplayLabel(label));
  // Métricas adicionais calculadas a partir das matrizes binárias existentes.
  // Não requerem previsões ou pontuações por paciente.
  function getMetric(metrics, key) {
    if (key !== "specificity" && key !== "balanced_accuracy" && key !== "mcc") {
      return metrics[key] ?? null;
    }
    const tp = Number(metrics.tp), tn = Number(metrics.tn);
    const fp = Number(metrics.fp), fn = Number(metrics.fn);
    if (![tp, tn, fp, fn].every(Number.isFinite)) return null;
    const sensitivity = tp + fn > 0 ? tp / (tp + fn) : null;
    const specificity = tn + fp > 0 ? tn / (tn + fp) : null;
    if (key === "specificity") return specificity;
    if (key === "balanced_accuracy") {
      return sensitivity !== null && specificity !== null
        ? (sensitivity + specificity) / 2 : null;
    }
    const denominator = Math.sqrt((tp+fp)*(tp+fn)*(tn+fp)*(tn+fn));
    return denominator > 0 ? (tp*tn - fp*fn) / denominator : null;
  }
  const values = labels.map(label => getMetric(subtypeMetrics[label], metricKey));
  const metricLabelPt = METRIC_LABELS_PT[metricKey] || metricKey;
  renderMetricConfidenceIntervals(metricKey);

  if (modelMetricsChart) modelMetricsChart.destroy();

  modelMetricsChart = new Chart(canvas, {
    type: "bar",
    data: {
      labels: displayLabels,
      datasets: [{
        label: metricLabelPt,
        data: values,
        backgroundColor: ["#60a5fa", "#a78bfa", "#34d399", "#f472b6"]
      }]
    },
    options: {
      responsive: true,
      // Permite consultar o valor mesmo junto às margens de cada barra.
      // Evita falhas intermitentes do tooltip por deteção estrita de interseção.
      interaction: {
        mode: "index",
        intersect: false,
        axis: "x"
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: function(context) {
              return context.raw === null ? `${metricLabelPt}: indisponível` : `${metricLabelPt}: ${Number(context.raw).toFixed(4)}`;
            }
          }
        }
      },
      scales: {
        y: {
          beginAtZero: metricKey !== "mcc",
          min: metricKey === "mcc" ? -1 : 0,
          max: 1
        }
      }
    }
  });
}

function renderModelInsights() {
  if (!Object.keys(subtypeMetrics).length) return;

  const labels = Object.keys(subtypeMetrics);

  const bestAuc = labels.reduce((best, current) =>
    subtypeMetrics[current].auc > subtypeMetrics[best].auc ? current : best
  );

  const bestRecall = labels.reduce((best, current) =>
    subtypeMetrics[current].recall > subtypeMetrics[best].recall ? current : best
  );

  const mostFp = labels.reduce((worst, current) =>
    subtypeMetrics[current].fp > subtypeMetrics[worst].fp ? current : worst
  );

  const mostFn = labels.reduce((worst, current) =>
    subtypeMetrics[current].fn > subtypeMetrics[worst].fn ? current : worst
  );

  setText("bestAucSubtype", getSubtypeDisplayLabel(bestAuc));
  setText("bestRecallSubtype", getSubtypeDisplayLabel(bestRecall));
  setText("mostFpSubtype", getSubtypeDisplayLabel(mostFp));
  setText("mostFnSubtype", getSubtypeDisplayLabel(mostFn));
}

const CM_FULL_LABELS = {
  tp: "Verdadeiro Positivo",
  fn: "Falso Negativo",
  fp: "Falso Positivo",
  tn: "Verdadeiro Negativo"
};

function renderConfusionCards() {
  if (!Object.keys(subtypeMetrics).length) return;

  Object.entries(subtypeMetrics).forEach(([subtype, metrics]) => {
    const tp = metrics.tp ?? 0;
    const fn = metrics.fn ?? 0;
    const fp = metrics.fp ?? 0;
    const tn = metrics.tn ?? 0;

    const realPositiveTotal = tp + fn; // linha "Real: Sim"
    const realNegativeTotal = fp + tn; // linha "Real: Não"

    const cells = [
      { key: "tp", value: tp, rowTotal: realPositiveTotal },
      { key: "fn", value: fn, rowTotal: realPositiveTotal },
      { key: "fp", value: fp, rowTotal: realNegativeTotal },
      { key: "tn", value: tn, rowTotal: realNegativeTotal }
    ];

    cells.forEach(({ key, value, rowTotal }) => {
      const valueEl = document.getElementById(`${subtype}-${key}`);
      if (valueEl) valueEl.textContent = value ?? "-";

      const cellEl = document.getElementById(`${subtype}-${key}-cell`);
      if (cellEl) {
        const pct = rowTotal ? Math.round((value / rowTotal) * 100) : 0;
        const pctText = rowTotal ? ` — ${pct}% da linha` : "";
        cellEl.setAttribute("data-tooltip", `${CM_FULL_LABELS[key]} (${key.toUpperCase()})${pctText}`);
      }
    });
  });
}


function renderKeyInsights() {
  if (!filteredRows.length || !currentPhaseRows.length) {
    setText("insightMaxRoiSlice", "-");
    setText("insightBestPhase", "-");
    setText("insightCurrentVsMax", "-");
    return;
  }

  // Identificar a maior ROI na fase selecionada
  const maxRow = currentPhaseRows.reduce(
    (best, row) => row.roiArea > best.roiArea ? row : best,
    currentPhaseRows[0]
  );

  // Calcular a área média das ROI na fase selecionada
  const avgArea = currentPhaseRows.reduce(
    (sum, row) => sum + row.roiArea, 0
  ) / currentPhaseRows.length;

  // Obter a slice atualmente selecionada
  const currentRow = currentPhaseRows[currentSliceIndex];

  // Atualizar os indicadores do painel
  setText(
    "insightMaxRoiSlice",
    `Slice ${maxRow.Slice} (${maxRow.roiArea} px²)`
  );

  setText(
    "insightBestPhase",
    `${Math.round(avgArea)} px²`
  );

  setText(
    "insightCurrentVsMax",
    `${currentRow.roiArea} / ${maxRow.roiArea} px²`
  );
}



function getCommonCasePhases() {
  if (!caseASelect || !caseBSelect) return [];

  const caseARows = getCaseRows(caseASelect.value);
  const caseBRows = getCaseRows(caseBSelect.value);

  const phasesA = new Set(caseARows.map(row => row.Phase));
  const phasesB = new Set(caseBRows.map(row => row.Phase));

  const commonPhases = [...phasesA]
    .filter(phase => phasesB.has(phase))
    .sort((a, b) => a - b);

  if (commonPhases.length) return commonPhases;

  return [...new Set([...caseARows, ...caseBRows].map(row => row.Phase))]
    .sort((a, b) => a - b);
}

function updateCaseComparisonPhaseOptions() {
  if (!caseComparePhaseSelect) return;

  const previousValue = caseComparePhaseSelect.value;
  const phases = getCommonCasePhases();

  caseComparePhaseSelect.innerHTML = "";

  phases.forEach(phase => {
    const option = document.createElement("option");
    option.value = phase;
    option.textContent = `Fase ${phase}`;
    caseComparePhaseSelect.appendChild(option);
  });

  if (phases.includes(Number(previousValue))) {
    caseComparePhaseSelect.value = previousValue;
  } else if (phases.length) {
    caseComparePhaseSelect.value = phases[0];
  }
}

function getBestROIRow(rows) {
  if (!rows.length) return null;

  return rows.reduce((best, row) =>
    row.roiArea > best.roiArea ? row : best
  , rows[0]);
}

function getSelectedRowByRelativePosition(rows, relativePercent) {
  if (!rows.length) return null;

  const sortedRows = rows.slice().sort((a, b) => a.Slice - b.Slice);

  if (sortedRows.length === 1) return sortedRows[0];

  const index = Math.round((relativePercent / 100) * (sortedRows.length - 1));
  return sortedRows[Math.min(sortedRows.length - 1, Math.max(0, index))];
}

function getCaseStats(caseRows, selectedPhase, relativePercent) {
  const first = caseRows[0];

  if (!first) {
    return {
      first: null,
      allRows: [],
      phaseRows: [],
      selectedRow: null,
      bestRow: null,
      meanROI: 0,
      phases: [],
      slices: []
    };
  }

  const phases = [...new Set(caseRows.map(row => row.Phase))].sort((a, b) => a - b);
  const slices = [...new Set(caseRows.map(row => row.Slice))].sort((a, b) => a - b);

  let phaseRows = caseRows
    .filter(row => row.Phase === Number(selectedPhase))
    .sort((a, b) => a.Slice - b.Slice);

  if (!phaseRows.length) {
    phaseRows = caseRows
      .filter(row => row.Phase === phases[0])
      .sort((a, b) => a.Slice - b.Slice);
  }

  const selectedRow = getSelectedRowByRelativePosition(phaseRows, relativePercent);
  const bestRow = getBestROIRow(caseRows);

  const meanROI = caseRows.length
    ? caseRows.reduce((sum, row) => sum + row.roiArea, 0) / caseRows.length
    : 0;

  return {
    first,
    allRows: caseRows,
    phaseRows,
    selectedRow,
    bestRow,
    meanROI,
    phases,
    slices
  };
}

function renderCasePanel(prefix, caseKey, selectedPhase, relativePercent) {
  const caseRows = getCaseRows(caseKey);
  const stats = getCaseStats(caseRows, selectedPhase, relativePercent);

  const titleEl = document.getElementById(`${prefix}Title`);
  const img = document.getElementById(`${prefix}Image`);
  const bbox = document.getElementById(`${prefix}Bbox`);
  const wrapper = document.getElementById(`${prefix}ImageWrapper`);

  if (!stats.first || !stats.selectedRow) {
    if (titleEl) titleEl.textContent = prefix === "caseA" ? "Caso A" : "Caso B";
    if (img) img.src = "";
    if (bbox) bbox.style.display = "none";

    setText(`${prefix}Dataset`, "-");
    setText(`${prefix}Subtype`, "-");
    setText(`${prefix}Phases`, "-");
    setText(`${prefix}Slices`, "-");
    setText(`${prefix}SelectedSlice`, "-");
    setText(`${prefix}SelectedROI`, "-");
    setText(`${prefix}MaxROI`, "-");
    setText(`${prefix}MeanROI`, "-");
    setText(`${prefix}BestSlice`, "-");

    return stats;
  }

  const row = stats.selectedRow;

  if (titleEl) titleEl.textContent = stats.first.Patient_ID;

  if (img) {
    img.onerror = () => {
      console.error("Erro ao carregar imagem da comparação:", row.imagePath);

      if (bbox) bbox.style.display = "none";
    };

    img.onload = () => {
      if (bbox && wrapper) {
        setBBoxForImage(img, wrapper, bbox, row);
      }
    };

    img.src = row.imagePath;
  }

  setText(`${prefix}Dataset`, stats.first.Dataset);
  setText(`${prefix}Subtype`, stats.first["Mol Subtype"]);
  setText(`${prefix}Phases`, stats.phases.length);
  setText(`${prefix}Slices`, stats.slices.length);
  setText(`${prefix}SelectedSlice`, `Fase ${row.Phase}, Slice ${row.Slice}`);
  setText(`${prefix}SelectedROI`, row.roiArea);
  setText(`${prefix}MaxROI`, stats.bestRow ? stats.bestRow.roiArea : "-");
  setText(`${prefix}MeanROI`, stats.meanROI.toFixed(1));
  setText(
    `${prefix}BestSlice`,
    stats.bestRow ? `Fase ${stats.bestRow.Phase}, Slice ${stats.bestRow.Slice}` : "-"
  );

  return stats;
}

function getPeakPositionPercent(phaseRows) {
  if (!phaseRows.length) return null;

  const sortedRows = phaseRows.slice().sort((a, b) => a.Slice - b.Slice);
  const peakRow = getBestROIRow(sortedRows);
  const peakIndex = sortedRows.findIndex(row => row.Basename === peakRow.Basename);

  if (sortedRows.length === 1) return 0;

  return Math.round((peakIndex / (sortedRows.length - 1)) * 100);
}

function renderComparativeInsights(caseAData, caseBData, relativePercent) {
  if (!caseAData.selectedRow || !caseBData.selectedRow) {
    setText("compareInsightMaxROI", "-");
    setText("compareInsightMeanROI", "-");
    setText("compareInsightSelectedROI", "-");
    setText("compareInsightPeakTiming", "-");
    return;
  }

  const maxA = caseAData.bestRow?.roiArea ?? 0;
  const maxB = caseBData.bestRow?.roiArea ?? 0;

  const meanA = caseAData.meanROI ?? 0;
  const meanB = caseBData.meanROI ?? 0;

  const selectedA = caseAData.selectedRow.roiArea;
  const selectedB = caseBData.selectedRow.roiArea;

  const maxWinner = maxA === maxB
    ? "Os dois casos têm a mesma ROI máxima."
    : maxA > maxB
      ? `O Caso A apresenta a maior ROI máxima (${maxA} face a ${maxB}).`
      : `O Caso B apresenta a maior ROI máxima (${maxB} face a ${maxA}).`;

  const meanWinner = Math.abs(meanA - meanB) < 0.1
    ? "Os dois casos têm uma área média da ROI muito semelhante."
    : meanA > meanB
      ? `O Caso A tem uma área média da ROI superior (${meanA.toFixed(1)} face a ${meanB.toFixed(1)}).`
      : `O Caso B tem uma área média da ROI superior (${meanB.toFixed(1)} face a ${meanA.toFixed(1)}).`;

  const selectedWinner = selectedA === selectedB
    ? `Na posição relativa ${relativePercent}%, os dois casos têm a mesma área da ROI.`
    : selectedA > selectedB
      ? `Na posição relativa ${relativePercent}%, o Caso A tem uma ROI superior (${selectedA} face a ${selectedB}).`
      : `Na posição relativa ${relativePercent}%, o Caso B tem uma ROI superior (${selectedB} face a ${selectedA}).`;

  const peakA = getPeakPositionPercent(caseAData.phaseRows);
  const peakB = getPeakPositionPercent(caseBData.phaseRows);

  let peakText = "-";

  if (peakA !== null && peakB !== null) {
    if (peakA === peakB) {
      peakText = `O pico da ROI ocorre na mesma posição relativa da fase (${peakA}%).`;
    } else if (peakA < peakB) {
      peakText = `O pico da ROI ocorre mais cedo no Caso A (${peakA}%) do que no Caso B (${peakB}%).`;
    } else {
      peakText = `O pico da ROI ocorre mais cedo no Caso B (${peakB}%) do que no Caso A (${peakA}%).`;
    }
  }

  setText("compareInsightMaxROI", maxWinner);
  setText("compareInsightMeanROI", meanWinner);
  setText("compareInsightSelectedROI", selectedWinner);
  setText("compareInsightPeakTiming", peakText);
}

function buildRelativeSeries(phaseRows) {
  const sortedRows = phaseRows.slice().sort((a, b) => a.Slice - b.Slice);

  if (!sortedRows.length) return [];

  if (sortedRows.length === 1) {
    return [{
      percent: 0,
      area: sortedRows[0].roiArea,
      slice: sortedRows[0].Slice
    }];
  }

  return sortedRows.map((row, index) => ({
    percent: Math.round((index / (sortedRows.length - 1)) * 100),
    area: row.roiArea,
    slice: row.Slice
  }));
}

function renderCaseComparisonChart(caseAData, caseBData) {
  const canvas = document.getElementById("caseComparisonChart");

  if (!canvas) return;

  const seriesA = buildRelativeSeries(caseAData.phaseRows || []);
  const seriesB = buildRelativeSeries(caseBData.phaseRows || []);

  const maxLength = Math.max(seriesA.length, seriesB.length);

  const labels = Array.from({ length: maxLength }, (_, index) => {
    if (maxLength === 1) return "0%";
    return `${Math.round((index / (maxLength - 1)) * 100)}%`;
  });

  const dataA = labels.map((_, index) => {
    if (!seriesA.length) return null;
    const sourceIndex = Math.round((index / Math.max(1, maxLength - 1)) * (seriesA.length - 1));
    return seriesA[sourceIndex]?.area ?? null;
  });

  const dataB = labels.map((_, index) => {
    if (!seriesB.length) return null;
    const sourceIndex = Math.round((index / Math.max(1, maxLength - 1)) * (seriesB.length - 1));
    return seriesB[sourceIndex]?.area ?? null;
  });

  if (caseComparisonChart) {
    caseComparisonChart.destroy();
  }

  caseComparisonChart = new Chart(canvas, {
    type: "line",
    data: {
      labels,
      datasets: [
        {
          label: "Caso A - ROI ao longo da fase",
          data: dataA,
          borderColor: "#2563eb",
          backgroundColor: "rgba(37, 99, 235, 0.08)",
          borderWidth: 3,
          tension: 0.15,
          pointRadius: 4,
          fill: false
        },
        {
          label: "Caso B - ROI ao longo da fase",
          data: dataB,
          borderColor: "#10b981",
          backgroundColor: "rgba(16, 185, 129, 0.08)",
          borderWidth: 3,
          tension: 0.15,
          pointRadius: 4,
          fill: false
        }
      ]
    },
    options: {
      responsive: true,
      animation: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: function(context) {
              return `${context.dataset.label}: ${context.raw}`;
            }
          }
        }
      },
      scales: {
        x: {
          title: {
            display: true,
            text: "Posição relativa na fase"
          }
        },
        y: {
          ...roiLineScale([dataA, dataB]),
          title: {
            display: true,
            text: "Área da ROI"
          }
        }
      }
    }
  });
}

function renderCaseComparison() {
  if (!caseASelect || !caseBSelect) return;

  if (!caseComparePhaseSelect || !caseComparePhaseSelect.options.length) {
    updateCaseComparisonPhaseOptions();
  }

  const phase = caseComparePhaseSelect?.value || getCommonCasePhases()[0];
  const relativePercent = Number(caseCompareSliceSlider?.value || 50);

  if (caseCompareSliceValue) {
    caseCompareSliceValue.textContent = `${relativePercent}%`;
  }

  const caseAData = renderCasePanel("caseA", caseASelect.value, phase, relativePercent);
  const caseBData = renderCasePanel("caseB", caseBSelect.value, phase, relativePercent);

  renderCaseComparisonChart(caseAData, caseBData);
  renderComparativeInsights(caseAData, caseBData, relativePercent);
}

function setText(id, value) {
  const el = document.getElementById(id);

  if (el) {
    el.textContent = value;
  }
}

// ═══════════════════════════════════════════════════════════════
// EXPORT: CSV / Imagens / Relatório PDF
// ═══════════════════════════════════════════════════════════════

function rowsToCSV(rows) {
  const headers = ["Dataset", "Patient_ID", "Study_ID", "Phase", "Slice", "Mol Subtype", "X_min", "X_max", "Y_min", "Y_max", "roiWidth", "roiHeight", "roiArea", "meanIntensity", "Basename"];
  const lines = [headers.join(",")];

  rows.forEach(r => {
    const line = headers.map(h => {
      const val = r[h] ?? "";
      const str = String(val).replace(/"/g, '""');
      return /[,"\n]/.test(str) ? `"${str}"` : str;
    }).join(",");
    lines.push(line);
  });

  return lines.join("\n");
}

function showToast(message, type = "error", duration = 4000) {
  const container = document.getElementById("toastContainer");
  if (!container) { console.warn("Toast:", message); return; }

  const toast = document.createElement("div");
  toast.className = `toast toast-${type}`;
  toast.textContent = message;
  container.appendChild(toast);

  // Force reflow so the transition triggers
  requestAnimationFrame(() => toast.classList.add("show"));

  setTimeout(() => {
    toast.classList.remove("show");
    setTimeout(() => toast.remove(), 250);
  }, duration);
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function exportFilteredCSV(scope, selectedPatients) {
  const currentRow = currentPhaseRows[currentSliceIndex];
  let rows, namePart;

  if (scope === "patient" && currentRow) {
    rows = filteredRows.filter(r =>
      r.Patient_ID === currentRow.Patient_ID &&
      r.Study_ID   === currentRow.Study_ID   &&
      r.Dataset    === currentRow.Dataset
    );
    const pid = String(currentRow.Patient_ID).replace(/[^a-zA-Z0-9_-]/g, "_");
    const ds  = String(currentRow.Dataset).replace(/[^a-zA-Z0-9_-]/g, "_");
    namePart = `${ds}_${pid}`;

  } else if (scope === "select" && selectedPatients?.length) {
    const keySet = new Set(selectedPatients); // "Dataset||Patient_ID"
    rows = filteredRows.filter(r => keySet.has(`${r.Dataset}||${r.Patient_ID}`));
    // Build a compact name from selected patients
    const ids = [...new Set(selectedPatients.map(k => k.split("||")[1]))];
    namePart = ids.length <= 3
      ? ids.join("_")
      : `${ids.length}_pacientes`;
    namePart = namePart.replace(/[^a-zA-Z0-9_-]/g, "_");

  } else {
    rows = filteredRows;
    const ds  = datasetFilter?.value  || "todos";
    const pat = patientFilter?.value  || "todos";
    namePart = `${ds}_${pat}`.replace(/[^a-zA-Z0-9_-]/g, "_");
  }

  if (!rows.length) return;

  const date    = new Date().toISOString().slice(0, 10);
  const csvText = rowsToCSV(rows);
  const blob    = new Blob([csvText], { type: "text/csv;charset=utf-8;" });
  downloadBlob(blob, `dados_${namePart}_${date}.csv`);
}

// ── Metadados (JSON de proveniência/filtros/modelo) ─────────
const CSV_COLUMN_SCHEMA = {
  Dataset:      "Origem do caso (ex: ISPY1, ISPY2, DUKE, NACT).",
  Patient_ID:   "Identificador do paciente.",
  Study_ID:     "Identificador do estudo/exame.",
  Phase:        "Fase de aquisição DCE-MRI (pré/pós-contraste).",
  Slice:        "Índice do corte (slice) dentro do volume.",
  "Mol Subtype": "Subtipo molecular do tumor (rótulo): Luminal A, Luminal B, HER2-positivo ou triplo-negativo.",
  X_min:        "Coordenada X mínima da bounding box da lesão (px).",
  X_max:        "Coordenada X máxima da bounding box da lesão (px).",
  Y_min:        "Coordenada Y mínima da bounding box da lesão (px).",
  Y_max:        "Coordenada Y máxima da bounding box da lesão (px).",
  roiWidth:     "Largura da ROI derivada da bounding box (px).",
  roiHeight:    "Altura da ROI derivada da bounding box (px).",
  roiArea:      "Área da ROI (px²), calculada a partir de roiWidth × roiHeight.",
  meanIntensity: "Intensidade média dos píxeis (0–255) dentro da bounding box, calculada a partir da imagem JPEG processada. Não corresponde ao sinal DICOM nem apenas à lesão.",
  Basename:     "Nome do ficheiro de imagem correspondente ao slice.",
};

function exportMetadataJSON() {
  const now = new Date();

  const filtrosAtivos = {
    dataset: datasetFilter?.value || "todos",
    paciente: patientFilter?.value || "todos",
    fase: phaseFilter?.value || "todas",
    subtipo: subtypeFilter?.value || "todos",
  };

  const datasetsUsados = [...new Set(filteredRows.map(r => r.Dataset))];
  const pacientesUnicos = new Set(filteredRows.map(r => `${r.Dataset}||${r.Patient_ID}`));
  const subtiposPresentes = [...new Set(filteredRows.map(r => r["Mol Subtype"]).filter(Boolean))];

  const accuracies = Object.values(subtypeMetrics)
    .map(m => m.accuracy)
    .filter(v => typeof v === "number");
  const accuracyGlobal = accuracies.length
    ? accuracies.reduce((a, b) => a + b, 0) / accuracies.length
    : null;

  const metadata = {
    geradoEm: now.toISOString(),
    geradoEmLegivel: now.toLocaleString("pt-PT"),
    plataforma: "Plataforma de Visual Analytics — Pipeline de Classificação de Subtipos do Cancro da Mama",
    export: {
      filtrosAtivos,
      totalRegistosNoDatasetCompleto: allRows.length,
      totalRegistosExportados: filteredRows.length,
      pacientesUnicos: pacientesUnicos.size,
      datasetsIncluidos: datasetsUsados,
      subtiposPresentes,
    },
    modelo: {
      algoritmo: "3D CNN (convoluções volumétricas + pooling + camadas densas)",
      accuracyGlobal: accuracyGlobal !== null ? Number((accuracyGlobal * 100).toFixed(1)) : null,
      metricasPorSubtipo: subtypeMetrics,
    },
    schemaColunasCSV: CSV_COLUMN_SCHEMA,
  };

  const jsonText = JSON.stringify(metadata, null, 2);
  const blob = new Blob([jsonText], { type: "application/json;charset=utf-8;" });
  const date = now.toISOString().slice(0, 10);
  downloadBlob(blob, `metadados_export_${date}.json`);
}

async function exportImageElement(imgEl, filename) {
  if (!imgEl || !imgEl.src) return;
  try {
    const response = await fetch(imgEl.src);
    const blob = await response.blob();
    downloadBlob(blob, filename);
  } catch (err) {
    console.error("Erro ao exportar imagem:", err);
  }
}

function bindExportEvents() {
  const exportCsvBtn = document.getElementById("exportCsvBtn");
  if (exportCsvBtn) {
    exportCsvBtn.addEventListener("click", openCsvModal);
  }

  // CSV modal bindings
  const csvModal      = document.getElementById("csvModal");
  const csvModalClose = document.getElementById("csvModalClose");
  const csvConfirmBtn = document.getElementById("csvConfirmBtn");

  function openCsvModal() {
    const currentRow  = currentPhaseRows[currentSliceIndex];
    const patDesc     = document.getElementById("csvScopePatientDesc");
    const allDesc     = document.getElementById("csvScopeAllDesc");
    const cbContainer = document.getElementById("csvPatientCheckboxes");

    // Update "paciente actual" description
    if (patDesc && currentRow) {
      const n = filteredRows.filter(r =>
        r.Patient_ID === currentRow.Patient_ID &&
        r.Study_ID   === currentRow.Study_ID   &&
        r.Dataset    === currentRow.Dataset
      ).length;
      patDesc.textContent = `${currentRow.Dataset} — Paciente ${currentRow.Patient_ID} (${n} slices)`;
    }

    // Update "todos" description
    if (allDesc) {
      allDesc.textContent = `${filteredRows.length} slices com os filtros activos`;
    }

    // Build patient checkboxes from filteredRows
    if (cbContainer) {
      cbContainer.innerHTML = "";
      // Group by Dataset + Patient_ID
      const seen = new Map();
      filteredRows.forEach(r => {
        const key = `${r.Dataset}||${r.Patient_ID}`;
        if (!seen.has(key)) {
          seen.set(key, { dataset: r.Dataset, patientId: r.Patient_ID, count: 0 });
        }
        seen.get(key).count++;
      });

      seen.forEach(({ dataset, patientId, count }) => {
        const label = document.createElement("label");
        label.className = "csv-patient-cb";
        label.innerHTML = `
          <input type="checkbox" name="csvPatient" value="${dataset}||${patientId}">
          <span>${dataset} — ${patientId}</span>
          <span class="cb-meta">${count} slices</span>
        `;
        cbContainer.appendChild(label);
      });
    }

    // Show/hide patient list based on selected radio
    csvModal?.querySelectorAll("input[name='csvScope']").forEach(radio => {
      radio.addEventListener("change", () => {
        if (cbContainer) {
          cbContainer.style.display = radio.value === "select" ? "flex" : "none";
        }
      });
    });

    csvModal?.classList.add("open");
    csvModal?.setAttribute("aria-hidden", "false");
  }

  function closeCsvModal() {
    csvModal?.classList.remove("open");
    csvModal?.setAttribute("aria-hidden", "true");
  }

  csvModalClose?.addEventListener("click", closeCsvModal);
  csvModal?.addEventListener("click", e => { if (e.target === csvModal) closeCsvModal(); });

  csvConfirmBtn?.addEventListener("click", () => {
    const scope = csvModal?.querySelector("input[name='csvScope']:checked")?.value || "all";

    if (scope === "select") {
      const selected = [...csvModal.querySelectorAll("input[name='csvPatient']:checked")]
        .map(cb => cb.value);
      if (!selected.length) {
        showToast("Seleciona pelo menos um paciente.", "error");
        return;
      }
      closeCsvModal();
      exportFilteredCSV("select", selected);
    } else {
      closeCsvModal();
      exportFilteredCSV(scope);
    }
  });

  const exportMetaBtn = document.getElementById("exportMetaBtn");
  if (exportMetaBtn) {
    exportMetaBtn.addEventListener("click", exportMetadataJSON);
  }

  const exportReportBtn = document.getElementById("exportReportBtn");
  if (exportReportBtn) {
    exportReportBtn.addEventListener("click", openPdfModal);
  }

  // Modal bindings
  const pdfModal        = document.getElementById("pdfModal");
  const pdfModalClose   = document.getElementById("pdfModalClose");
  const pdfConfirmBtn   = document.getElementById("pdfConfirmBtn");
  const pdfSelectAll    = document.getElementById("pdfSelectAll");
  const pdfDeselectAll  = document.getElementById("pdfDeselectAll");

  function openPdfModal() {
    pdfModal?.classList.add("open");
    pdfModal?.setAttribute("aria-hidden", "false");
  }

  function closePdfModal() {
    pdfModal?.classList.remove("open");
    pdfModal?.setAttribute("aria-hidden", "true");
  }

  pdfModalClose?.addEventListener("click", closePdfModal);
  pdfModal?.addEventListener("click", e => { if (e.target === pdfModal) closePdfModal(); });
  document.addEventListener("keydown", e => { if (e.key === "Escape") closePdfModal(); });

  pdfSelectAll?.addEventListener("click", () => {
    pdfModal?.querySelectorAll("input[name='pdfVista']").forEach(cb => cb.checked = true);
  });

  pdfDeselectAll?.addEventListener("click", () => {
    pdfModal?.querySelectorAll("input[name='pdfVista']").forEach(cb => cb.checked = false);
  });

  pdfConfirmBtn?.addEventListener("click", () => {
    const selected = [...pdfModal.querySelectorAll("input[name='pdfVista']:checked")]
      .map(cb => cb.value);
    if (!selected.length) {
      showToast("Seleciona pelo menos uma vista para gerar o relatório.", "error");
      return;
    }
    closePdfModal();
    generatePDFReport(selected);
  });

  // Per-image quick-export: current MRI slice
  const volumeImage = document.getElementById("volumeImage");
  if (volumeImage) {
    volumeImage.addEventListener("dblclick", () => {
      const currentRow = currentPhaseRows[currentSliceIndex];
      const name = currentRow ? currentRow.Basename : "slice.jpg";
      exportImageElement(volumeImage, name);
    });
  }

  // Slice export scope modal (este slice / uma ou mais fases / caso completo / vários casos)
  const sliceExportModal        = document.getElementById("sliceExportModal");
  const sliceExportModalClose   = document.getElementById("sliceExportModalClose");
  const sliceExportConfirmBtn   = document.getElementById("sliceExportConfirmBtn");
  const sliceExportPhaseCbList  = document.getElementById("sliceExportPhaseCheckboxes");
  const sliceExportMultiWrap        = document.getElementById("sliceExportMultiWrap");
  const sliceExportCaseCbList       = document.getElementById("sliceExportCaseCheckboxes");
  const sliceExportMultiPhaseCbList = document.getElementById("sliceExportMultiPhaseCheckboxes");
  const sliceExportProgressWrap  = document.getElementById("sliceExportProgressWrap");
  const sliceExportProgressBar   = document.getElementById("sliceExportProgressBar");
  const sliceExportProgressLabel = document.getElementById("sliceExportProgressLabel");
  const sliceExportCancelBtn     = document.getElementById("sliceExportCancelBtn");
  const sliceExportSizeEstimate  = document.getElementById("sliceExportSizeEstimate");

  const sliceExportCaseScopeToggle  = document.getElementById("sliceExportCaseScopeToggle");
  let sliceExportCaseScopeMode = "filtered"; // "filtered" | "all"

  function caseKey(row) {
    return `${row.Dataset}||${row.Patient_ID}||${row.Study_ID}`;
  }

  function getCaseRows(row) {
    if (!row) return [];
    return filteredRows.filter(r => caseKey(r) === caseKey(row));
  }

  function buildMultiCaseCheckboxes(currentRow) {
    const sourceRows = sliceExportCaseScopeMode === "all" ? allRows : filteredRows;

    // Preserve already-checked cases when just toggling the source
    const previouslyChecked = new Set(
      [...(sliceExportCaseCbList?.querySelectorAll("input[name='sliceExportCase']:checked") || [])]
        .map(cb => cb.value)
    );

    if (sliceExportCaseCbList) {
      sliceExportCaseCbList.innerHTML = "";
      const seen = new Map();
      sourceRows.forEach(r => {
        const key = caseKey(r);
        if (!seen.has(key)) {
          seen.set(key, { dataset: r.Dataset, patientId: r.Patient_ID, studyId: r.Study_ID, count: 0 });
        }
        seen.get(key).count++;
      });

      seen.forEach(({ dataset, patientId, studyId, count }, key) => {
        const shouldCheck = previouslyChecked.size
          ? previouslyChecked.has(key)
          : key === caseKey(currentRow);
        const label = document.createElement("label");
        label.className = "csv-patient-cb";
        label.innerHTML = `
          <input type="checkbox" name="sliceExportCase" value="${key}" ${shouldCheck ? "checked" : ""}>
          <span>${dataset} — ${patientId}</span>
          <span class="cb-meta">${count} slices</span>
        `;
        sliceExportCaseCbList.appendChild(label);
      });
    }

    // Phase checkboxes reflect the union of phases across the same source rows
    if (sliceExportMultiPhaseCbList) {
      sliceExportMultiPhaseCbList.innerHTML = "";
      const allPhases = [...new Set(sourceRows.map(r => r.Phase))].sort((a, b) => a - b);
      allPhases.forEach(phase => {
        const label = document.createElement("label");
        label.className = "csv-patient-cb";
        label.innerHTML = `
          <input type="checkbox" name="sliceExportMultiPhase" value="${phase}" checked>
          <span>Fase ${phase}</span>
        `;
        sliceExportMultiPhaseCbList.appendChild(label);
      });
    }
  }

  sliceExportCaseScopeToggle?.querySelectorAll(".slice-export-toggle-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      sliceExportCaseScopeMode = btn.dataset.caseScope;
      sliceExportCaseScopeToggle.querySelectorAll(".slice-export-toggle-btn").forEach(b => {
        b.classList.toggle("active", b === btn);
      });
      const currentRow = currentPhaseRows[currentSliceIndex];
      buildMultiCaseCheckboxes(currentRow);
    });
  });

  function openSliceExportModal() {
    const currentRow = currentPhaseRows[currentSliceIndex];
    if (!currentRow) return;

    const caseRows = getCaseRows(currentRow);
    const phases = [...new Set(caseRows.map(r => r.Phase))].sort((a, b) => a - b);

    const currentDesc = document.getElementById("sliceScopeCurrentDesc");
    if (currentDesc) currentDesc.textContent = currentRow.Basename;

    const caseDesc = document.getElementById("sliceScopeCaseDesc");
    if (caseDesc) caseDesc.textContent = `Todas as fases deste caso — ${caseRows.length} slices no total`;

    // Build single-case phase checkboxes
    if (sliceExportPhaseCbList) {
      sliceExportPhaseCbList.innerHTML = "";
      phases.forEach(phase => {
        const count = caseRows.filter(r => r.Phase === phase).length;
        const label = document.createElement("label");
        label.className = "csv-patient-cb";
        label.innerHTML = `
          <input type="checkbox" name="sliceExportPhase" value="${phase}" ${phase === currentRow.Phase ? "checked" : ""}>
          <span>Fase ${phase}</span>
          <span class="cb-meta">${count} slices</span>
        `;
        sliceExportPhaseCbList.appendChild(label);
      });
    }

    // "Uma ou mais fases" só faz sentido se o caso tiver mais do que 1 fase
    const phaseOption = document.getElementById("sliceScopePhaseOption");
    if (phaseOption) {
      phaseOption.style.display = phases.length > 1 ? "" : "none";
    }

    // Reset the "vários casos" scope toggle back to "filtrados" each time the modal opens
    sliceExportCaseScopeMode = "filtered";
    sliceExportCaseScopeToggle?.querySelectorAll(".slice-export-toggle-btn").forEach(b => {
      b.classList.toggle("active", b.dataset.caseScope === "filtered");
    });
    buildMultiCaseCheckboxes(currentRow);

    // Reset UI: scope back to "current" and hide progress/phase lists
    sliceExportModal?.querySelectorAll("input[name='sliceScope']").forEach(radio => {
      radio.checked = radio.value === "current";
    });
    if (sliceExportPhaseCbList) sliceExportPhaseCbList.style.display = "none";
    if (sliceExportMultiWrap) sliceExportMultiWrap.style.display = "none";
    if (sliceExportProgressWrap) sliceExportProgressWrap.style.display = "none";
    if (sliceExportConfirmBtn) sliceExportConfirmBtn.disabled = false;

    sliceExportModal?.classList.add("open");
    sliceExportModal?.setAttribute("aria-hidden", "false");
  }

  function closeSliceExportModal() {
    sliceExportModal?.classList.remove("open");
    sliceExportModal?.setAttribute("aria-hidden", "true");
  }

  sliceExportModal?.querySelectorAll("input[name='sliceScope']").forEach(radio => {
    radio.addEventListener("change", () => {
      if (sliceExportPhaseCbList) {
        sliceExportPhaseCbList.style.display = radio.value === "phase" ? "flex" : "none";
      }
      if (sliceExportMultiWrap) {
        sliceExportMultiWrap.style.display = radio.value === "multi" ? "block" : "none";
      }
    });
  });

  sliceExportModalClose?.addEventListener("click", closeSliceExportModal);
  sliceExportModal?.addEventListener("click", e => { if (e.target === sliceExportModal) closeSliceExportModal(); });

  sliceExportConfirmBtn?.addEventListener("click", async () => {
    const scope = sliceExportModal?.querySelector("input[name='sliceScope']:checked")?.value || "current";
    const currentRow = currentPhaseRows[currentSliceIndex];
    if (!currentRow) { closeSliceExportModal(); return; }

    if (scope === "current") {
      closeSliceExportModal();
      exportImageElement(volumeImage, currentRow.Basename);
      return;
    }

    let rowsToExport = [];
    let zipName = "";
    let groupByCase = false;

    if (scope === "case") {
      rowsToExport = getCaseRows(currentRow);
      zipName = `${currentRow.Dataset}_${currentRow.Patient_ID}_caso_completo.zip`;

    } else if (scope === "phase") {
      const selectedPhases = [...sliceExportModal.querySelectorAll("input[name='sliceExportPhase']:checked")]
        .map(cb => Number(cb.value));

      if (!selectedPhases.length) {
        showToast("Seleciona pelo menos uma fase.", "error");
        return;
      }

      const caseRows = getCaseRows(currentRow);
      rowsToExport = caseRows.filter(r => selectedPhases.includes(r.Phase));
      const phaseLabel = selectedPhases.sort((a, b) => a - b).join("-");
      zipName = `${currentRow.Dataset}_${currentRow.Patient_ID}_fase${phaseLabel}.zip`;

    } else if (scope === "multi") {
      const selectedCaseKeys = [...sliceExportModal.querySelectorAll("input[name='sliceExportCase']:checked")]
        .map(cb => cb.value);
      const selectedPhases = [...sliceExportModal.querySelectorAll("input[name='sliceExportMultiPhase']:checked")]
        .map(cb => Number(cb.value));

      if (!selectedCaseKeys.length) {
        showToast("Seleciona pelo menos um caso.", "error");
        return;
      }
      if (!selectedPhases.length) {
        showToast("Seleciona pelo menos uma fase.", "error");
        return;
      }

      const sourceRows = sliceExportCaseScopeMode === "all" ? allRows : filteredRows;
      rowsToExport = sourceRows.filter(r =>
        selectedCaseKeys.includes(caseKey(r)) && selectedPhases.includes(r.Phase)
      );
      groupByCase = true;
      const phaseLabel = selectedPhases.sort((a, b) => a - b).join("-");
      zipName = `varios_casos_fase${phaseLabel}.zip`;
    }

    await exportSlicesAsZip(rowsToExport, zipName, {
      wrap: sliceExportProgressWrap,
      bar: sliceExportProgressBar,
      label: sliceExportProgressLabel,
      confirmBtn: sliceExportConfirmBtn,
      cancelBtn: sliceExportCancelBtn,
      sizeEl: sliceExportSizeEstimate,
      groupByCase,
      onDone: closeSliceExportModal
    });
  });

  const exportSliceBtn = document.getElementById("exportSliceBtn");
  if (exportSliceBtn) {
    exportSliceBtn.addEventListener("click", openSliceExportModal);
  }
}

function formatBytes(bytes) {
  if (!bytes || bytes <= 0) return null;
  const mb = bytes / (1024 * 1024);
  if (mb < 1) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${mb.toFixed(1)} MB`;
}

async function estimateZipSize(rows) {
  const sampleSize = Math.min(6, rows.length);
  const step = Math.max(1, Math.floor(rows.length / sampleSize));
  const sampleRows = [];
  for (let i = 0; i < rows.length && sampleRows.length < sampleSize; i += step) {
    sampleRows.push(rows[i]);
  }

  let totalBytes = 0;
  let counted = 0;

  await Promise.all(sampleRows.map(async (row) => {
    try {
      const res = await fetch(row.imagePath, { method: "HEAD" });
      const len = res.headers.get("content-length");
      if (len) {
        totalBytes += Number(len);
        counted++;
      }
    } catch (err) {
      // ignora falhas de estimativa, não é crítico
    }
  }));

  if (!counted) return null;
  const avgBytes = totalBytes / counted;
  return avgBytes * rows.length;
}

async function exportSlicesAsZip(rows, zipName, ui = {}) {
  if (!rows || !rows.length) return;

  const { wrap, bar, label, confirmBtn, cancelBtn, sizeEl, groupByCase, onDone } = ui;
  const state = { cancelled: false };
  const controller = typeof AbortController !== "undefined" ? new AbortController() : null;

  function handleCancelClick() {
    state.cancelled = true;
    controller?.abort();
  }
  cancelBtn?.addEventListener("click", handleCancelClick);

  if (confirmBtn) confirmBtn.disabled = true;
  if (wrap) wrap.style.display = "block";
  if (sizeEl) sizeEl.textContent = "";

  function setProgress(done, total, phaseText) {
    const pct = total ? Math.round((done / total) * 100) : 0;
    if (bar) bar.style.width = `${pct}%`;
    if (label) label.textContent = `${phaseText} — ${done}/${total} imagens`;
  }

  try {
    if (sizeEl) sizeEl.textContent = "A estimar tamanho...";
    const estimatedBytes = await estimateZipSize(rows);
    if (state.cancelled) throw new Error("cancelled");

    if (sizeEl) {
      const estimateText = formatBytes(estimatedBytes);
      sizeEl.textContent = estimateText
        ? `Tamanho estimado: ~${estimateText} (${rows.length} imagens)`
        : `${rows.length} imagens a exportar`;
    }

    setProgress(0, rows.length, "A carregar JSZip");

    if (typeof window.JSZip === "undefined") {
      await loadScript("https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js");
    }
    if (state.cancelled) throw new Error("cancelled");

    const zip = new window.JSZip();
    let fetched = 0;
    setProgress(0, rows.length, "A obter imagens");

    // Fetch with limited concurrency so the progress bar updates smoothly
    const concurrency = 6;
    let cursor = 0;

    async function worker() {
      while (cursor < rows.length && !state.cancelled) {
        const row = rows[cursor++];
        try {
          const response = await fetch(row.imagePath, { signal: controller?.signal });
          const blob = await response.blob();
          const filePath = groupByCase
            ? `${row.Dataset}_${row.Patient_ID}/${row.Basename}`
            : row.Basename;
          zip.file(filePath, blob);
        } catch (err) {
          if (state.cancelled) return;
          console.error("Erro ao obter imagem para o zip:", row.imagePath, err);
        }
        fetched++;
        setProgress(fetched, rows.length, "A obter imagens");
      }
    }

    await Promise.all(Array.from({ length: Math.min(concurrency, rows.length) }, worker));
    if (state.cancelled) throw new Error("cancelled");

    setProgress(rows.length, rows.length, "A compactar ficheiro");

    const zipBlob = await zip.generateAsync({ type: "blob" }, (metadata) => {
      if (label) label.textContent = `A compactar ficheiro — ${Math.round(metadata.percent)}%`;
      if (bar) bar.style.width = `${Math.round(metadata.percent)}%`;
    });
    if (state.cancelled) throw new Error("cancelled");

    downloadBlob(zipBlob, zipName);
    showToast(`Exportação concluída: ${zipName}`, "success");
  } catch (err) {
    if (state.cancelled) {
      showToast("Exportação cancelada.", "info");
    } else {
      console.error("Erro ao criar o ficheiro zip:", err);
      showToast("Não foi possível gerar o ficheiro de exportação.", "error");
    }
  } finally {
    cancelBtn?.removeEventListener("click", handleCancelClick);
    if (confirmBtn) confirmBtn.disabled = false;
    if (wrap) wrap.style.display = "none";
    if (onDone) onDone();
  }
}

// ── Relatório PDF ────────────────────────────────────────────
async function generatePDFReport(selectedVistas) {
  const btn = document.getElementById("exportReportBtn");
  if (btn) { btn.disabled = true; btn.textContent = "A gerar..."; }

  // Default to all vistas if called without argument
  if (!selectedVistas || !selectedVistas.length) {
    selectedVistas = ["vista-caso", "vista-evolucao", "vista-3d", "vista-comparacao", "vista-cnn"];
  }

  try {
    if (typeof window.jspdf === "undefined") {
      await loadScript("https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js");
    }
    if (typeof window.html2canvas === "undefined") {
      await loadScript("https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js");
    }

    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF({ orientation: "p", unit: "pt", format: "a4" });
    const pageW = pdf.internal.pageSize.getWidth();
    const pageH = pdf.internal.pageSize.getHeight();
    const margin = 32;

    // ── Cover ─────────────────────────────────────────────────
    pdf.setFontSize(20);
    pdf.setTextColor(15, 23, 42);
    pdf.text("Relatório de Análise — Visual Analytics", margin, 70);

    pdf.setFontSize(11);
    pdf.setTextColor(100, 116, 139);
    pdf.text("Pipeline de Classificação de Subtipos do Cancro da Mama", margin, 90);

    const currentRow = currentPhaseRows[currentSliceIndex];
    const dateStr = new Date().toLocaleString("pt-PT");
    pdf.setFontSize(9);
    pdf.text(`Gerado em: ${dateStr}`, margin, 108);

    if (currentRow) {
      pdf.setFontSize(11);
      pdf.setTextColor(30, 41, 59);
      const info = [
        `Dataset: ${currentRow.Dataset}`,
        `Paciente: ${currentRow.Patient_ID}`,
        `Study: ${currentRow.Study_ID}`,
        `Subtipo: ${currentRow["Mol Subtype"]}`,
      ];
      pdf.text(info, margin, 132);
    }

    // Vistas index for titles
    const allSections = [
      { id: "vista-caso",        title: "Vista 1 · Exploração do Caso" },
      { id: "vista-evolucao",    title: "Vista 2 · Evolução Tumoral" },
      { id: "vista-3d",          title: "Vista 3 · Reconstrução 3D" },
      { id: "vista-comparacao",  title: "Vista 4 · Comparação de Casos" },
      { id: "vista-cnn",         title: "Vista 5 · Avaliação CNN" },
    ];

    // Filter to only selected vistas, preserving order
    const sections = allSections.filter(s => selectedVistas.includes(s.id));

    for (const section of sections) {
      const el = document.getElementById(section.id);
      if (!el) continue;

      pdf.addPage();
      pdf.setFontSize(15);
      pdf.setTextColor(37, 99, 235);
      pdf.text(section.title, margin, 50);

      const canvas = await window.html2canvas(el, {
        scale: 1.4,
        backgroundColor: "#ffffff",
        useCORS: true,
        logging: false
      });

      const imgW = pageW - margin * 2;
      const imgH = (canvas.height * imgW) / canvas.width;

      let renderY = 70;
      let remainingH = imgH;
      let sourceY = 0;

      while (remainingH > 0) {
        const availableH = pageH - renderY - margin;
        const drawH = Math.min(availableH, remainingH);
        const sliceCanvasH = (drawH / imgH) * canvas.height;

        const sliceCanvas = document.createElement("canvas");
        sliceCanvas.width = canvas.width;
        sliceCanvas.height = sliceCanvasH;
        const ctx = sliceCanvas.getContext("2d");
        ctx.drawImage(canvas, 0, sourceY, canvas.width, sliceCanvasH, 0, 0, canvas.width, sliceCanvasH);

        const sliceData = sliceCanvas.toDataURL("image/jpeg", 0.85);
        pdf.addImage(sliceData, "JPEG", margin, renderY, imgW, drawH);

        sourceY    += sliceCanvasH;
        remainingH -= drawH;

        if (remainingH > 0) {
          pdf.addPage();
          renderY = margin;
        }
      }
    }

    const now = new Date();
    const date = now.toISOString().slice(0, 10);
    const patientId = currentRow ? String(currentRow.Patient_ID).replace(/[^a-zA-Z0-9_-]/g, "_") : "sem_paciente";
    const dataset   = currentRow ? String(currentRow.Dataset).replace(/[^a-zA-Z0-9_-]/g, "_")    : "sem_dataset";
    pdf.save(`relatorio_${dataset}_${patientId}_${date}.pdf`);

  } catch (err) {
    console.error("Erro ao gerar relatório PDF:", err);
    showToast("Não foi possível gerar o relatório PDF. Verifica a ligação à internet.", "error");
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = "Relatório PDF"; }
  }
}

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src="${src}"]`);
    if (existing) { resolve(); return; }
    const s = document.createElement("script");
    s.src = src;
    s.onload = resolve;
    s.onerror = () => reject(new Error(`Falha ao carregar script: ${src}`));
    document.head.appendChild(s);
  });
}

initAnalytics();
// ── Vista scroll spy ──────────────────────────────────────────
(function () {
  var sections = ["vista-tabela","vista-caso","vista-evolucao","vista-3d","vista-comparacao","vista-cnn"];
  var navItems = document.querySelectorAll(".vista-nav-item");

  function onScroll() {
    var scrollY = window.scrollY + 160; // offset for sticky bar (filters + vista nav)
    var current = sections[0];

    sections.forEach(function(id) {
      var el = document.getElementById(id);
      if (el && el.offsetTop <= scrollY) current = id;
    });

    navItems.forEach(function(a) {
      var href = a.getAttribute("href").replace("#","");
      a.classList.toggle("active", href === current);
    });
  }

  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();
})();