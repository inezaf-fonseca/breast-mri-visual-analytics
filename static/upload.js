// ═══════════════════════════════════════════════════════════════
// Página dedicada: Adicionar Novo Caso
// ═══════════════════════════════════════════════════════════════

function bindUploadEvents() {
  const csvDropzone = document.getElementById("csvDropzone");
  const imagesDropzone = document.getElementById("imagesDropzone");
  const csvInput = document.getElementById("uploadCsvInput");
  const imagesInput = document.getElementById("uploadImagesInput");
  const csvFileName = document.getElementById("csvFileName");
  const imagesFileCount = document.getElementById("imagesFileCount");
  const submitBtn = document.getElementById("uploadSubmitBtn");
  const statusEl = document.getElementById("uploadStatus");
  const form = document.getElementById("uploadCaseForm");

  if (!form || !csvDropzone || !imagesDropzone) return;

  let selectedCsv = null;
  let selectedImages = [];

  function refreshSubmitState() {
    submitBtn.disabled = !(selectedCsv && selectedImages.length);
  }

  function setupDropzone(zone, input, onFiles) {
    zone.addEventListener("click", () => input.click());

    zone.addEventListener("dragover", (e) => {
      e.preventDefault();
      zone.classList.add("drag-over");
    });
    zone.addEventListener("dragleave", () => zone.classList.remove("drag-over"));
    zone.addEventListener("drop", (e) => {
      e.preventDefault();
      zone.classList.remove("drag-over");
      onFiles(e.dataTransfer.files);
    });

    input.addEventListener("change", () => onFiles(input.files));
  }

  setupDropzone(csvDropzone, csvInput, (files) => {
    if (!files || !files.length) return;
    selectedCsv = files[0];
    csvFileName.textContent = selectedCsv.name;
    refreshSubmitState();
  });

  setupDropzone(imagesDropzone, imagesInput, (files) => {
    if (!files || !files.length) return;
    selectedImages = Array.from(files);
    imagesFileCount.textContent = `${selectedImages.length} imagem(ns) selecionada(s)`;
    refreshSubmitState();
  });

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!selectedCsv || !selectedImages.length) return;

    submitBtn.disabled = true;
    statusEl.textContent = "A carregar...";
    statusEl.className = "upload-status";

    const formData = new FormData();
    formData.append("csv", selectedCsv);
    selectedImages.forEach(img => formData.append("images", img));

    try {
      const res = await fetch("/api/upload-case", { method: "POST", body: formData });
      const data = await res.json();

      if (!res.ok || !data.ok) {
        throw new Error(data.error || "Erro desconhecido ao carregar o caso.");
      }

      statusEl.textContent = `Caso carregado com sucesso: ${data.rows} linhas, ${data.images} imagens. Já está disponível na Analytics.`;
      statusEl.className = "upload-status success";

      // Reset form
      selectedCsv = null;
      selectedImages = [];
      csvFileName.textContent = "";
      imagesFileCount.textContent = "";
      form.reset();

      // Refresh the list of uploaded cases below
      loadUploadedCasesList();
    } catch (err) {
      console.error("Erro no upload:", err);
      statusEl.textContent = err.message || "Erro ao carregar o caso.";
      statusEl.className = "upload-status error";
    } finally {
      refreshSubmitState();
    }
  });
}

async function loadUploadedCasesList() {
  const listEl = document.getElementById("uploadedCasesList");
  if (!listEl) return;

  listEl.innerHTML = `<p class="uploaded-cases-empty">A carregar...</p>`;

  try {
    const res = await fetch("/api/uploaded-cases");
    if (!res.ok) throw new Error("Falha ao obter casos carregados.");
    const cases = await res.json();

    if (!cases.length) {
      listEl.innerHTML = `<p class="uploaded-cases-empty">Ainda não carregaste nenhum caso manualmente.</p>`;
      return;
    }

    listEl.innerHTML = cases.map(c => `
      <div class="uploaded-case-row">
        <div class="uploaded-case-main">
          <span class="uploaded-case-id">${c.caseId}</span>
          <span class="uploaded-case-patients">${c.patients.join(", ")}</span>
        </div>
        <div class="uploaded-case-stats">
          <span>${c.rows} linhas</span>
          <span>${c.images} imagens</span>
        </div>
      </div>
    `).join("");
  } catch (err) {
    console.error("Erro ao listar casos carregados:", err);
    listEl.innerHTML = `<p class="uploaded-cases-empty">Não foi possível carregar a lista de casos.</p>`;
  }
}

bindUploadEvents();
loadUploadedCasesList();
