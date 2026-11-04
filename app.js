"use strict";
(function () {
  const STORAGE_KEY = "controle-pdc-v1";
  const CATEGORY_NAMES = { increase: "Aumento", decrease: "Redução", new: "Produto novo", promo: "Promoção", other: "Outros" };
  const CATEGORY_KEYS = Object.keys(CATEGORY_NAMES);
  const $ = id => document.getElementById(id);
  const today = () => dateKey(new Date());
  let db = loadData();
  let selectedDay = today();
  let calendarMonth = selectedDay.slice(0, 7);
  let preview = [];
  let previewRaw = "";
  let ignoredLines = [];
  let selectedIds = new Set();
  let expandedIds = new Set();
  let undoStack = [];
  let editingId = null;
  let toastTimer = null;

  function dateKey(input) {
    const d = input instanceof Date ? input : new Date(input);
    if (Number.isNaN(d.getTime())) return "";
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  }
  function dayDate(key) { return new Date(key + "T12:00:00"); }
  function formatDay(key, opts) { return dayDate(key).toLocaleDateString("pt-BR", opts || { day: "2-digit", month: "long", year: "numeric" }); }
  function escapeHtml(value) {
    return String(value == null ? "" : value).replace(/[&<>"']/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));
  }
  function normalized(value) {
    return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().trim();
  }
  function uniqueId() {
    if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
    return String(Date.now()) + "-" + Math.random().toString(36).slice(2);
  }
  function emptyData() { return { version: 1, items: [], batches: [], events: [], nextOrder: 0 }; }
  function loadData() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return emptyData();
      const obj = JSON.parse(raw);
      if (!obj || !Array.isArray(obj.items) || !Array.isArray(obj.events) || !Array.isArray(obj.batches)) return emptyData();
      return { version: 1, items: obj.items, batches: obj.batches, events: obj.events, nextOrder: Number(obj.nextOrder) || obj.items.length };
    } catch (err) { return emptyData(); }
  }
  function persist() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
      $("storageStatus").textContent = "Salvo neste navegador";
      return true;
    } catch (err) {
      $("storageStatus").textContent = "Erro ao salvar: faça um backup";
      toast("Não foi possível salvar. Verifique o espaço do navegador.", true);
      return false;
    }
  }
  function toast(message, error) {
    const el = $("toast");
    el.textContent = message;
    el.style.background = error ? "#a84849" : "#284e40";
    el.hidden = false;
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.hidden = true; }, 3900);
  }
  function snapshot(label) {
    undoStack.push({ label, data: JSON.stringify(db) });
    if (undoStack.length > 12) undoStack.shift();
  }
  function commitChange(label, change) {
    snapshot(label);
    change();
    persist();
    selectedIds.clear();
    render();
  }
  function moneyValue(raw) {
    let text = String(raw || "").trim().replace(/^R\$\s*/i, "").replace(/\s/g, "");
    if (!text) return "";
    if (text.includes(",") && text.includes(".")) text = text.replace(/\./g, "").replace(",", ".");
    else if (text.includes(",")) text = text.replace(",", ".");
    const num = Number(text);
    return Number.isFinite(num) && num >= 0 ? num.toFixed(2) : "";
  }
  function displayMoney(value) {
    const num = Number(value);
    return value !== "" && value != null && Number.isFinite(num) ? num.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "—";
  }
  function parseValidity(input) {
    const txt = String(input || "").trim();
    if (!txt) return "";
    let d, m, y;
    if (/^\d{8}$/.test(txt)) { d = txt.slice(0, 2); m = txt.slice(2, 4); y = txt.slice(4); }
    else {
      const parts = txt.split(/[\/.\-]/);
      if (parts.length !== 3) return "";
      [d, m, y] = parts;
    }
    if (String(y).length === 2) y = "20" + y;
    d = Number(d); m = Number(m); y = Number(y);
    const check = new Date(y, m - 1, d);
    if (check.getFullYear() !== y || check.getMonth() !== m - 1 || check.getDate() !== d) return "";
    return String(d).padStart(2, "0") + "/" + String(m).padStart(2, "0") + "/" + y;
  }
  function validityFromLine(line) {
    const m = String(line).match(/(?:VALIDADE|VALID[OA]|VENC(?:IMENTO)?|ATE)\s*[:\-]?\s*(\d{8}|\d{1,2}[\/.\-]\d{1,2}[\/.\-]\d{2,4})/i);
    return m ? parseValidity(m[1]) : "";
  }
  function categoryFromLine(line) {
    const t = normalized(line);
    if (/\b(PROMOCAO|PROMOCIONAL|OFERTA|ENTRADA DE PROMOCAO)\b/.test(t)) return "promo";
    if (/\b(PRODUTO[S]? NOVO[S]?|NOVO CADASTRO|CADASTRO DE PRODUTO[S]?|CHEGOU|CHEGARAM)\b/.test(t)) return "new";
    if (/\b(AUMENTOU|AUMENTO|SUBIU|ALTA DE PRECO|REAJUSTE PARA CIMA|MAJOROU)\b/.test(t)) return "increase";
    if (/\b(BAIXOU|BAIXA DE PRECO|REDUCAO|REDUZIU|DIMINUIU|CAIU|QUEDA DE PRECO)\b/.test(t)) return "decrease";
    return "";
  }
  function isCategoryHeader(line) {
    const t = normalized(line).replace(/[:!.\s]+$/g, "");
    return /^(AUMENTOU|AUMENTO|SUBIU|ALTA DE PRECO|REAJUSTE PARA CIMA|BAIXOU|REDUCAO|DIMINUIU|CAIU|PRODUTO[S]? NOVO[S]?|NOVO CADASTRO|CADASTRO|CADASTRO DE PRODUTO[S]?|PROMOCAO|OFERTA)(?:\s+(?:VALIDADE|VALIDO ATE|ATE)\s*[:\-]?\s*\d{1,2}[\/.\-]\d{1,2}[\/.\-]\d{2,4})?$/.test(t);
  }
  function extractCI(line) {
    const explicit = line.match(/\bCI\s*[:#-]?\s*(\d{2,14})\b/i);
    if (explicit) return explicit[1];
    const leading = line.match(/^\s*(\d{2,14})\s*(?:[-–—:]|\s)\s*/);
    return leading ? leading[1] : "";
  }
  function extractCB(line) {
    const match = line.match(/\bCB\s*[:#-]?\s*(\d{8,14})\b/i);
    return match ? match[1] : "";
  }
  function pricesFromLine(line) {
    const rgx = /(?:R\$\s*)?(\d{1,3}(?:\.\d{3})+,\d{2}|\d+[,.]\d{2})/g;
    const withoutDates = String(line).replace(/\b\d{1,2}[\/.\-]\d{1,2}[\/.\-]\d{2,4}\b/g, " ");
    const list = Array.from(withoutDates.matchAll(rgx)).map(x => moneyValue(x[1]));
    return list.filter(Boolean);
  }
  function nameFromLine(line, ci) {
    let text = String(line);
    if (ci) {
      text = text.replace(new RegExp("^\\s*(?:CI\\s*[:#-]?\\s*)?" + ci + "\\s*[-–—:]?\\s*", "i"), "");
      text = text.replace(new RegExp("\\bCI\\s*[:#-]?\\s*" + ci + "\\b", "i"), "");
    }
    text = text.replace(/\bCB\s*[:#-]?\s*\d{8,14}\b/ig, "");
    text = text.replace(/(?:VALIDADE|VÁLID[OA]|VENC(?:IMENTO)?|ATÉ)\s*[:\-]?\s*(?:\d{8}|\d{1,2}[\/.\-]\d{1,2}[\/.\-]\d{2,4})/ig, "");
    text = text.replace(/(?:R\$\s*)?(?:\d{1,3}(?:\.\d{3})+,\d{2}|\d+[,.]\d{2})/g, "");
    text = text.replace(/\b(?:AUMENTOU|AUMENTO|SUBIU|ALTA|BAIXOU|REDUÇÃO|REDUCAO|DIMINUIU|CAIU|PRODUTO NOVO|PROMOÇÃO|PROMOCAO|OFERTA|NOVO CADASTRO)\b/ig, "");
    text = text.replace(/^\s*PARA\s*[-–—:]?\s*/i, "");
    return text.replace(/^[-–—:.\s]+|[-–—:.\s]+$/g, "").replace(/\s{2,}/g, " ").trim();
  }
  function parseMessage(raw) {
    let family = "", category = "other", validity = "", segment = 0;
    const products = [], ignored = [];
    const lines = raw.replace(/\r/g, "").split("\n");
    lines.forEach((line, lineIndex) => {
      const clean = line.trim();
      if (!clean) return;
      if (/^(BOM DIA|BOA TARDE|BOA NOITE|OL[AÁ]|PESSOAL[!,]?)/i.test(normalized(clean))) return;
      const ci = extractCI(clean), cb = extractCB(clean), lineCategory = categoryFromLine(clean);
      const lineValidity = validityFromLine(clean);
      if (!ci) {
        if (isCategoryHeader(clean)) {
          category = lineCategory || "other";
          validity = category === "promo" ? (lineValidity || "") : "";
          return;
        }
        if (lineValidity && /(?:VALIDADE|VÁLID[OA]|VENC|ATÉ|ATE)/i.test(clean)) { validity = lineValidity; return; }
        if (/^[\p{L}\d\s&'().\/:-]{2,64}$/u.test(clean) && !/\b(?:R\$|VALOR|PRECO|PREÇO)\b/i.test(clean)) {
          family = clean.replace(/:$/, "");
          segment += 1;
          return;
        }
        ignored.push({ line: lineIndex + 1, text: clean });
        return;
      }
      const prices = pricesFromLine(clean);
      const item = {
        tempId: uniqueId(), ci, cb, family, groupIndex: segment,
        name: nameFromLine(clean, ci), category: lineCategory || category,
        price: prices.length ? prices[prices.length - 1] : "",
        previousPrice: prices.length > 1 ? prices[0] : "",
        validity: lineValidity || (lineCategory && lineCategory !== "promo" ? "" : validity),
        sourceLine: clean, originalLineNumber: lineIndex + 1, include: true
      };
      products.push(item);
    });
    return { products, ignored };
  }

  function openPreview() {
    const raw = $("pasteInput").value.trim();
    if (!raw) return toast("Cole uma mensagem antes de analisar.", true);
    const result = parseMessage(raw);
    preview = result.products;
    ignoredLines = result.ignored;
    previewRaw = raw;
    if (!preview.length) {
      toast("Nenhum CI identificado. Confira o formato das linhas.", true);
      return;
    }
    renderPreview();
    $("previewPanel").classList.remove("hidden");
    $("previewPanel").scrollIntoView({ behavior: "smooth", block: "start" });
  }
  function duplicateDetail(item) {
    const records = db.items.filter(x => x.ci === String(item.ci).trim());
    const prior = preview.filter(x => x !== item && x.originalLineNumber < item.originalLineNumber && x.ci === item.ci);
    if (!records.length && !prior.length) return "";
    const diff = records.some(x => x.price !== item.price) || prior.some(x => x.price !== item.price);
    return diff ? "CI já registrado com outro valor" : "CI já aparece em outro registro";
  }
  function optionsForCategory(value) {
    return CATEGORY_KEYS.map(key => '<option value="' + key + '"' + (key === value ? ' selected' : '') + '>' + CATEGORY_NAMES[key] + '</option>').join("");
  }
  function renderPreview() {
    $("previewSummary").textContent = preview.length + " item(ns) identificado(s) · corrija os campos antes de salvar.";
    $("previewRows").innerHTML = preview.map((item, i) => {
      const duplicate = duplicateDetail(item);
      return '<tr class="' + (duplicate ? 'duplicate' : '') + '">' +
        '<td><input aria-label="Incluir item ' + (i + 1) + '" type="checkbox" data-preview-index="' + i + '" data-preview-field="include"' + (item.include ? ' checked' : '') + '></td>' +
        '<td><input aria-label="CI" data-preview-index="' + i + '" data-preview-field="ci" value="' + escapeHtml(item.ci) + '">' + (duplicate ? '<small class="duplicate-note">⚑ ' + escapeHtml(duplicate) + '</small>' : '') + '</td>' +
        '<td><input aria-label="Família" data-preview-index="' + i + '" data-preview-field="family" value="' + escapeHtml(item.family) + '"></td>' +
        '<td><input aria-label="Nome" data-preview-index="' + i + '" data-preview-field="name" value="' + escapeHtml(item.name) + '"></td>' +
        '<td><select aria-label="Categoria" data-preview-index="' + i + '" data-preview-field="category">' + optionsForCategory(item.category) + '</select></td>' +
        '<td><input aria-label="Valor" data-preview-index="' + i + '" data-preview-field="price" value="' + escapeHtml(displayMoney(item.price) === "—" ? "" : displayMoney(item.price)) + '"></td>' +
        '<td><input aria-label="Validade" data-preview-index="' + i + '" data-preview-field="validity" value="' + escapeHtml(item.validity) + '" placeholder="dd/mm/aaaa"></td></tr>';
    }).join("");
    if (ignoredLines.length) {
      $("unrecognizedBox").classList.remove("hidden");
      $("unrecognizedBox").textContent = ignoredLines.length + " linha(s) não interpretada(s), preservadas no texto original:\n" +
        ignoredLines.map(x => "Linha " + x.line + ": " + x.text).join("\n");
    } else $("unrecognizedBox").classList.add("hidden");
  }
  function savePreview() {
    const chosen = preview.filter(x => x.include);
    if (!chosen.length) return toast("Selecione pelo menos um item.", true);
    for (const item of chosen) {
      if (!/^\d{2,14}$/.test(String(item.ci).trim())) return toast("Confira os CIs: precisam conter de 2 a 14 dígitos.", true);
      if (item.price !== "" && !moneyValue(item.price)) return toast("Há um valor inválido. Corrija antes de salvar.", true);
      if (item.validity && !parseValidity(item.validity)) return toast("Há uma data de validade inválida.", true);
    }
    const batchId = uniqueId(), createdAt = new Date().toISOString();
    commitChange("Cadastro de " + chosen.length + " item(ns)", () => {
      db.batches.push({ id: batchId, createdAt, raw: previewRaw });
      chosen.forEach(item => {
        db.nextOrder += 1;
        db.items.push({
          id: uniqueId(), batchId, groupId: batchId + ":" + item.groupIndex + ":" + normalized(item.family),
          order: db.nextOrder, ci: String(item.ci).trim(), cb: String(item.cb || "").trim(),
          family: String(item.family || "").trim(), name: String(item.name || "").trim(),
          category: CATEGORY_KEYS.includes(item.category) ? item.category : "other",
          price: item.price === "" ? "" : moneyValue(item.price),
          previousPrice: item.previousPrice || "", validity: item.validity ? parseValidity(item.validity) : "",
          note: "", stage: "pending", createdAt, sourceLine: item.sourceLine, originalLineNumber: item.originalLineNumber
        });
      });
    });
    $("pasteInput").value = "";
    closePreview();
    selectedDay = today();
    $("dayPicker").value = selectedDay;
    render();
    toast(chosen.length + " produto(s) adicionados. Ordem preservada.");
    $("entryBody").classList.add("hidden");
    $("entryToggle").setAttribute("aria-expanded", "false");
  }
  function closePreview() { $("previewPanel").classList.add("hidden"); preview = []; previewRaw = ""; ignoredLines = []; }
  function stageAt(item, day) {
    let stage = "pending";
    for (const event of db.events) {
      if (event.itemId === item.id && dateKey(event.at) <= day && event.type === "stage") stage = event.to;
    }
    return stage;
  }
  function printedOn(item, day) {
    return db.events.some(e => e.itemId === item.id && e.type === "stage" && e.to === "printed" && dateKey(e.at) === day);
  }
  function viewItems() {
    const query = normalized($("searchInput").value);
    const cat = $("categoryFilter").value;
    const scope = $("searchScope").value;
    const oldOnly = $("overdueOnly").checked, hidePrinted = $("hidePrinted").checked;
    return db.items.filter(item => {
      if (dateKey(item.createdAt) > selectedDay) return false;
      const stage = stageAt(item, selectedDay);
      if (stage === "printed" && !printedOn(item, selectedDay)) return false;
      if (hidePrinted && stage === "printed") return false;
      const overdue = dateKey(item.createdAt) < selectedDay && stage !== "printed";
      if (oldOnly && !overdue) return false;
      if (cat !== "all" && item.category !== cat) return false;
      if (query) {
        const headerMatch = normalized([item.family, CATEGORY_NAMES[item.category] || ""].join(" ")).includes(query);
        const itemMatch = normalized([item.ci, item.cb, item.name, item.note, item.sourceLine].join(" ")).includes(query);
        if (!(scope === "header" ? headerMatch : scope === "item" ? itemMatch : headerMatch || itemMatch)) return false;
      }
      return true;
    }).sort((a, b) => a.order - b.order);
  }
  function rowHtml(item, stage) {
    const overdue = dateKey(item.createdAt) < selectedDay && stage !== "printed";
    const isExpanded = expandedIds.has(item.id);
    const canEdit = selectedDay === today();
    const cat = CATEGORY_KEYS.includes(item.category) ? item.category : "other";
    const title = CATEGORY_NAMES[cat];
    let action = stage === "pending" ? "→" : (stage === "sent" ? "✓" : "↶");
    let actionTitle = stage === "pending" ? "Marcar Carga Enviada" : (stage === "sent" ? "Confirmar impressão" : "Desmarcar impressão");
    const name = item.name || "";
    return '<div class="item-row ' + (overdue ? 'is-overdue ' : '') + (stage === "printed" ? "is-printed" : "") + '" data-row-id="' + escapeHtml(item.id) + '">' +
      '<input class="row-select" type="checkbox" aria-label="Selecionar CI ' + escapeHtml(item.ci) + '" data-id="' + escapeHtml(item.id) + '"' + (selectedIds.has(item.id) ? " checked" : "") + (canEdit && stage !== "printed" ? "" : " disabled") + ">" +
      '<i class="category-stripe ' + cat + '" title="' + escapeHtml(title) + '" aria-label="' + escapeHtml(title) + '"></i>' +
      '<div class="item-main"><div class="item-top"><span class="item-code">' + escapeHtml(item.ci) + '</span>' +
      (name ? '<span class="item-name" title="' + escapeHtml(name) + '">' + escapeHtml(name) + '</span>' : "") +
      '</div><span class="item-meta">' + (item.validity ? "Val. " + escapeHtml(item.validity) : (item.note ? "▣ Observação" : escapeHtml(title))) + '</span></div>' +
      (overdue ? '<span class="overdue-flag" title="Pendente desde ' + escapeHtml(formatDay(dateKey(item.createdAt))) + '">⚑</span>' : "") +
      '<span class="item-price" title="Preço informado">R$ ' + escapeHtml(displayMoney(item.price)) + '</span>' +
      '<div class="row-actions">' +
      '<button class="mini-action" title="' + (isExpanded ? "Ver menos" : "Ver mais") + '" aria-label="' + (isExpanded ? "Ver menos" : "Ver mais") + ' do CI ' + escapeHtml(item.ci) + '" data-action="expand" data-id="' + escapeHtml(item.id) + '">' + (isExpanded ? "⌃" : "⌄") + '</button>' +
      '<button class="mini-action ' + (stage === "printed" ? "done" : "") + '" title="' + actionTitle + '" aria-label="' + actionTitle + ' para CI ' + escapeHtml(item.ci) + '" data-action="advance" data-id="' + escapeHtml(item.id) + '"' + (canEdit ? "" : " disabled") + ">" + action + "</button>" +
      '<button class="mini-action details" title="Detalhes e edição" aria-label="Detalhes do CI ' + escapeHtml(item.ci) + '" data-action="details" data-id="' + escapeHtml(item.id) + '">⋯</button></div></div>' +
      (isExpanded ? '<div class="item-expanded"><strong>' + escapeHtml(name || "Sem nome informado") + '</strong>' +
      (item.family ? '<p>Família: ' + escapeHtml(item.family) + '</p>' : "") +
      (item.note ? '<p>Observação: ' + escapeHtml(item.note) + '</p>' : "") +
      '<p>Categoria: ' + escapeHtml(title) + (item.validity ? " · Validade: " + escapeHtml(item.validity) : "") + '</p>' +
      '<button data-action="details" data-id="' + escapeHtml(item.id) + '">Abrir detalhes completos</button></div>' : "");
  }
  function groupKey(item) {
    return item.groupId || item.batchId || item.id;
  }
  function eligibleFamilyItems(group, lane) {
    if (selectedDay !== today()) return [];
    return viewItems().filter(item => groupKey(item) === group && stageAt(item, selectedDay) === (lane === "pending" ? "pending" : "sent"));
  }
  function laneHtml(items, lane) {
    if (!items.length) return '<div class="empty-lane"><span>☷</span>Nenhum item nesta ala.</div>';
    let out = "", lastGroup = null;
    for (const item of items) {
      const group = groupKey(item);
      if (group !== lastGroup) {
        if (item.family) {
          const groupCount = items.filter(x => groupKey(x) === group).length;
          const eligible = eligibleFamilyItems(group, lane);
          const checkedCount = eligible.filter(x => selectedIds.has(x.id)).length;
          out += '<div class="family-header"><label class="family-select">' +
            '<input type="checkbox" class="group-select" data-group-id="' + escapeHtml(group) + '" data-lane="' + lane +
            '" aria-label="Selecionar itens da família ' + escapeHtml(item.family) + '"' +
            (checkedCount && checkedCount === eligible.length ? ' checked' : '') +
            (!eligible.length ? ' disabled' : '') +
            (checkedCount && checkedCount < eligible.length ? ' data-partial="true"' : '') +
            '><span>▦ ' + escapeHtml(item.family) + '</span></label>' +
            '<span class="group-total">' + groupCount + ' item(ns)</span></div>';
        }
        lastGroup = group;
      }
      out += rowHtml(item, stageAt(item, selectedDay));
    }
    return out;
  }
  function render() {
    const history = selectedDay !== today();
    $("longDate").textContent = selectedDay === today() ? "Hoje · " + formatDay(selectedDay, { day: "2-digit", month: "long" }) : formatDay(selectedDay);
    $("dayCaption").textContent = history ? "Histórico em modo consulta" : "Histórico e pendências";
    $("dayPicker").value = selectedDay; $("dayPicker").max = today();
    $("nextDay").disabled = selectedDay >= today();
    $("boardHeading").textContent = history ? "Histórico do dia" : "Painel do dia";
    $("boardDescription").textContent = history ? "Situação registrada até o fim da data selecionada. Volte a Hoje para editar." : "Ordem de recebimento preservada · pendências anteriores seguem sinalizadas.";
    const shown = viewItems();
    const pending = shown.filter(item => stageAt(item, selectedDay) === "pending");
    const sent = shown.filter(item => stageAt(item, selectedDay) !== "pending");
    $("pendingCount").textContent = String(pending.length);
    $("sentCount").textContent = String(sent.length);
    $("pendingList").innerHTML = laneHtml(pending, "pending");
    $("sentList").innerHTML = laneHtml(sent, "sent");
    document.querySelectorAll('.group-select[data-partial="true"]').forEach(control => { control.indeterminate = true; });
    const pendingIds = pending.filter(item => stageAt(item, selectedDay) === "pending").map(x => x.id);
    const readyIds = sent.filter(item => stageAt(item, selectedDay) === "sent").map(x => x.id);
    $("sendBatchButton").disabled = history || !pendingIds.some(id => selectedIds.has(id));
    $("printBatchButton").disabled = history || !readyIds.some(id => selectedIds.has(id));
    $("selectAllPending").disabled = history || !pendingIds.length;
    $("selectAllSent").disabled = history || !readyIds.length;
    $("selectAllPending").checked = pendingIds.length > 0 && pendingIds.every(id => selectedIds.has(id));
    $("selectAllSent").checked = readyIds.length > 0 && readyIds.every(id => selectedIds.has(id));
    $("undoButton").disabled = !undoStack.length || history;
    const selectedVisible = visibleSelectedItems();
    $("batchSelectionCount").textContent = selectedVisible.length + " selecionado(s)";
    const queryActive = Boolean($("searchInput").value.trim());
    const searchCandidates = viewItems().filter(item => stageAt(item, selectedDay) !== "printed");
    $("selectSearchResults").disabled = history || !queryActive || !searchCandidates.some(item => !selectedIds.has(item.id));
    $("selectSearchResults").textContent = queryActive ? "Selecionar resultados (" + searchCandidates.length + ")" : "Selecionar resultados";
    $("bulkCategory").disabled = history || !selectedVisible.length;
    $("applyCategoryButton").disabled = history || !selectedVisible.length || !CATEGORY_KEYS.includes($("bulkCategory").value);
    renderCalendar();
  }
  function setDay(key) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(key) || key > today()) return;
    selectedDay = key; calendarMonth = key.slice(0, 7); selectedIds.clear(); expandedIds.clear(); render();
  }
  function renderCalendar() {
    const [year, month] = calendarMonth.split("-").map(Number);
    const first = new Date(year, month - 1, 1);
    const offset = first.getDay();
    $("monthTitle").textContent = first.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
    let html = "";
    for (let i = 0; i < 42; i++) {
      const d = new Date(year, month - 1, 1 - offset + i);
      const key = dateKey(d), active = key === selectedDay, isCurrent = key === today();
      const outside = d.getMonth() !== month - 1;
      const has = db.items.some(item => dateKey(item.createdAt) === key) || db.events.some(e => dateKey(e.at) === key);
      html += '<button class="calendar-day ' + (outside ? "outside " : "") + (active ? "selected " : "") + (isCurrent ? "current " : "") + (has ? "has-record" : "") + '" data-calendar-day="' + key + '"' + (key > today() ? " disabled" : "") + ' aria-label="' + escapeHtml(formatDay(key)) + '">' + d.getDate() + '</button>';
    }
    $("calendarGrid").innerHTML = html;
  }
  function moveItems(ids, target) {
    const valid = ids.filter(id => {
      const item = db.items.find(x => x.id === id);
      return item && ((target === "sent" && item.stage === "pending") || (target === "printed" && item.stage === "sent") || (target === "sent" && item.stage === "printed"));
    });
    if (!valid.length) return;
    const now = new Date().toISOString();
    commitChange(target === "printed" ? "Confirmar impressão" : "Alterar situação da carga", () => {
      valid.forEach(id => {
        const item = db.items.find(x => x.id === id);
        const from = item.stage;
        item.stage = target;
        db.events.push({ id: uniqueId(), type: "stage", itemId: id, from, to: target, at: now });
      });
    });
    toast(valid.length + " produto(s) atualizado(s).");
  }
  function openDetails(id) {
    const item = db.items.find(x => x.id === id); if (!item) return;
    editingId = id;
    const form = $("detailForm");
    for (const key of ["ci", "price", "family", "name", "category", "validity", "cb", "note"]) {
      const val = key === "price" ? displayMoney(item.price).replace("—", "") : item[key];
      form.elements.namedItem(key).value = val == null ? "" : val;
    }
    $("detailHeading").textContent = "CI " + item.ci;
    $("originalLine").textContent = item.sourceLine || "—";
    $("recordDate").textContent = "Registrado em " + new Date(item.createdAt).toLocaleString("pt-BR") + (selectedDay !== today() ? " · consulta histórica" : "");
    const readonly = selectedDay !== today();
    Array.from(form.querySelectorAll("input,select,textarea")).forEach(control => { control.disabled = readonly; });
    form.querySelector('button[type="submit"]').disabled = readonly;
    $("deleteItem").disabled = readonly;
    $("itemDialog").showModal();
  }
  function saveDetails(event) {
    event.preventDefault();
    if (!editingId || selectedDay !== today()) return;
    const form = $("detailForm"), item = db.items.find(x => x.id === editingId);
    if (!item) return;
    const ci = form.elements.namedItem("ci").value.trim();
    if (!/^\d{2,14}$/.test(ci)) return toast("CI inválido.", true);
    const rawPrice = form.elements.namedItem("price").value.trim();
    const price = rawPrice ? moneyValue(rawPrice) : "";
    if (rawPrice && !price) return toast("Valor inválido.", true);
    const rawVal = form.elements.namedItem("validity").value.trim();
    const validity = rawVal ? parseValidity(rawVal) : "";
    if (rawVal && !validity) return toast("Validade inválida.", true);
    commitChange("Editar item", () => {
      Object.assign(item, {
        ci, price, validity, family: form.elements.namedItem("family").value.trim(),
        name: form.elements.namedItem("name").value.trim(), category: form.elements.namedItem("category").value,
        cb: form.elements.namedItem("cb").value.trim(), note: form.elements.namedItem("note").value.trim()
      });
    });
    $("itemDialog").close(); toast("Alterações salvas.");
  }
  function undoLast() {
    if (!undoStack.length || selectedDay !== today()) return;
    const last = undoStack.pop();
    db = JSON.parse(last.data); persist(); selectedIds.clear(); render();
    toast("Desfeito: " + last.label);
  }
  function exportBackup() {
    const blob = new Blob([JSON.stringify({ ...db, exportedAt: new Date().toISOString() }, null, 2)], { type: "application/json" });
    const link = document.createElement("a"), url = URL.createObjectURL(blob);
    link.href = url; link.download = "ControlePDC_backup_" + today() + ".json";
    document.body.appendChild(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    toast("Backup exportado.");
  }
  function importBackup(file) {
    if (!file) return;
    if (file.size > 8 * 1024 * 1024) return toast("Arquivo de backup muito grande.", true);
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const candidate = JSON.parse(String(reader.result));
        if (!candidate || !Array.isArray(candidate.items) || !Array.isArray(candidate.events) || !Array.isArray(candidate.batches)) throw Error("Formato inválido");
        if (candidate.items.some(x => !x.id || !x.ci || !CATEGORY_KEYS.includes(x.category))) throw Error("Itens inválidos");
        if (!confirm("Restaurar este backup? Os dados atuais serão substituídos. Exporte um backup antes se quiser guardá-los.")) return;
        snapshot("Restaurar backup");
        db = { version: 1, items: candidate.items, events: candidate.events, batches: candidate.batches, nextOrder: Number(candidate.nextOrder) || candidate.items.length };
        persist(); selectedIds.clear(); setDay(today()); toast("Backup restaurado com sucesso.");
      } catch (err) { toast("Não foi possível importar: arquivo inválido.", true); }
    };
    reader.onerror = () => toast("Não foi possível ler o arquivo.", true);
    reader.readAsText(file);
  }
  function handleLaneClick(event) {
    const target = event.target.closest("[data-action]");
    if (!target) return;
    const id = target.dataset.id;
    if (target.dataset.action === "expand") {
      expandedIds.has(id) ? expandedIds.delete(id) : expandedIds.add(id);
      render();
    } else if (target.dataset.action === "details") openDetails(id);
    else if (target.dataset.action === "advance") {
      if (selectedDay !== today()) return;
      const item = db.items.find(x => x.id === id);
      if (!item) return;
      moveItems([id], item.stage === "pending" ? "sent" : item.stage === "sent" ? "printed" : "sent");
    }
  }
  function visibleSelectedItems() {
    if (selectedDay !== today()) return [];
    return viewItems().filter(item => selectedIds.has(item.id) && stageAt(item, selectedDay) !== "printed");
  }
  function selectFamily(group, lane, checked) {
    const items = eligibleFamilyItems(group, lane);
    items.forEach(item => checked ? selectedIds.add(item.id) : selectedIds.delete(item.id));
    render();
  }
  function applyBulkCategory() {
    if (selectedDay !== today()) return;
    const category = $("bulkCategory").value;
    if (!CATEGORY_KEYS.includes(category)) return toast("Escolha uma categoria.", true);
    const items = visibleSelectedItems().filter(item => item.category !== category);
    if (!items.length) return toast("Os itens selecionados já estão nessa categoria.");
    commitChange("Alterar categoria em lote", () => {
      items.forEach(item => { item.category = category; });
    });
    $("bulkCategory").value = "";
    render();
    toast(items.length + " item(ns) alterado(s) para " + CATEGORY_NAMES[category] + ".");
  }
  function selectSearchResults() {
    if (selectedDay !== today() || !$("searchInput").value.trim()) return;
    const candidates = viewItems().filter(item => stageAt(item, selectedDay) !== "printed");
    const newlySelected = candidates.filter(item => !selectedIds.has(item.id));
    newlySelected.forEach(item => selectedIds.add(item.id));
    render();
    if (newlySelected.length) toast(newlySelected.length + " item(ns) encontrado(s) selecionado(s).");
  }
  function selectVisible(lane, checked) {
    const valid = viewItems().filter(item => {
      const stage = stageAt(item, selectedDay);
      return lane === "pending" ? stage === "pending" : stage === "sent";
    });
    valid.forEach(item => checked ? selectedIds.add(item.id) : selectedIds.delete(item.id));
    render();
  }
  function bind() {
    $("entryToggle").addEventListener("click", () => {
      const expanded = $("entryToggle").getAttribute("aria-expanded") === "true";
      $("entryToggle").setAttribute("aria-expanded", String(!expanded));
      $("entryBody").classList.toggle("hidden", expanded);
      $("entryChevron").textContent = expanded ? "⌄" : "⌃";
    });
    $("exampleButton").addEventListener("click", () => {
      $("pasteInput").value = "AUMENTOU\n1234 - 2.50\n5678 - 5.90\n\nKit\n2908 - aumentou 12.30\n1203 - baixou 22.10\n\nPRODUTO NOVO\n9012 - Tubo de cola quente transparente - 19.90\n\nPROMOÇÃO\nVALIDADE: 15112026\n3456 - 7,99";
      toast("Exemplo inserido. Clique em Analisar mensagem.");
    });
    $("analyzeButton").addEventListener("click", openPreview);
    $("previewRows").addEventListener("input", event => {
      const t = event.target, i = Number(t.dataset.previewIndex), field = t.dataset.previewField;
      if (!preview[i] || !field || field === "include") return;
      preview[i][field] = t.value;
    });
    $("previewRows").addEventListener("change", event => {
      const t = event.target, i = Number(t.dataset.previewIndex), field = t.dataset.previewField;
      if (!preview[i] || !field) return;
      if (field === "include") preview[i].include = t.checked;
      else preview[i][field] = t.value;
    });
    $("savePreview").addEventListener("click", savePreview);
    $("closePreview").addEventListener("click", closePreview);
    $("cancelPreview").addEventListener("click", closePreview);
    $("prevDay").addEventListener("click", () => { const d = dayDate(selectedDay); d.setDate(d.getDate() - 1); setDay(dateKey(d)); });
    $("nextDay").addEventListener("click", () => { const d = dayDate(selectedDay); d.setDate(d.getDate() + 1); setDay(dateKey(d)); });
    $("todayButton").addEventListener("click", () => setDay(today()));
    $("dayPicker").addEventListener("change", e => setDay(e.target.value));
    $("calendarButton").addEventListener("click", () => {
      const opened = !$("calendarPanel").classList.toggle("hidden");
      $("calendarButton").setAttribute("aria-expanded", String(opened));
      renderCalendar();
    });
    $("prevMonth").addEventListener("click", () => {
      const [y, m] = calendarMonth.split("-").map(Number);
      const d = new Date(y, m - 2, 1); calendarMonth = dateKey(d).slice(0, 7); renderCalendar();
    });
    $("nextMonth").addEventListener("click", () => {
      const [y, m] = calendarMonth.split("-").map(Number);
      const d = new Date(y, m, 1); if (dateKey(d).slice(0, 7) > today().slice(0, 7)) return;
      calendarMonth = dateKey(d).slice(0, 7); renderCalendar();
    });
    $("calendarGrid").addEventListener("click", e => { const el = e.target.closest("[data-calendar-day]"); if (el) setDay(el.dataset.calendarDay); });
    for (const id of ["searchInput", "searchScope", "categoryFilter", "overdueOnly", "hidePrinted"]) {
      $(id).addEventListener(id === "searchInput" ? "input" : "change", () => { selectedIds.clear(); render(); });
    }
    $("selectSearchResults").addEventListener("click", selectSearchResults);
    $("clearFilters").addEventListener("click", () => {
      $("searchInput").value = ""; $("searchScope").value = "all"; $("categoryFilter").value = "all";
      $("overdueOnly").checked = false; $("hidePrinted").checked = false; selectedIds.clear(); render();
    });
    $("pendingList").addEventListener("click", handleLaneClick);
    $("sentList").addEventListener("click", handleLaneClick);
    for (const id of ["pendingList", "sentList"]) {
      $(id).addEventListener("change", event => {
        if (event.target.classList.contains("group-select")) {
          selectFamily(event.target.dataset.groupId, event.target.dataset.lane, event.target.checked);
          return;
        }
        if (!event.target.classList.contains("row-select")) return;
        const key = event.target.dataset.id;
        event.target.checked ? selectedIds.add(key) : selectedIds.delete(key);
        render();
      });
    }
    $("selectAllPending").addEventListener("change", e => selectVisible("pending", e.target.checked));
    $("selectAllSent").addEventListener("change", e => selectVisible("sent", e.target.checked));
    $("sendBatchButton").addEventListener("click", () => moveItems(Array.from(selectedIds), "sent"));
    $("printBatchButton").addEventListener("click", () => moveItems(Array.from(selectedIds), "printed"));
    $("undoButton").addEventListener("click", undoLast);
    $("bulkCategory").addEventListener("change", render);
    $("applyCategoryButton").addEventListener("click", applyBulkCategory);
    $("detailForm").addEventListener("submit", saveDetails);
    $("closeDialog").addEventListener("click", () => $("itemDialog").close());
    $("deleteItem").addEventListener("click", () => {
      if (selectedDay !== today() || !editingId) return;
      if (!confirm("Excluir este produto do controle? Você poderá desfazer em seguida.")) return;
      const id = editingId;
      commitChange("Excluir produto", () => { db.items = db.items.filter(x => x.id !== id); });
      $("itemDialog").close(); toast("Produto excluído. Use Desfazer se necessário.");
    });
    $("exportButton").addEventListener("click", exportBackup);
    $("importButton").addEventListener("click", () => $("importFile").click());
    $("importFile").addEventListener("change", e => { importBackup(e.target.files[0]); e.target.value = ""; });
    window.addEventListener("storage", event => {
      if (event.key !== STORAGE_KEY) return;
      db = loadData(); undoStack = []; selectedIds.clear(); render(); toast("Dados atualizados de outra aba.");
    });
  }
  bind();
  render();
})();