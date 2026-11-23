/* Leitura somente autorizada do JFS Connect; sem comandos, descoberta ou mudanças de rede. */
(() => {
  "use strict";
  const STORAGE = "jfs-network-endpoint-v1";
  const RATE_MS = 15_000;
  const id = key => document.getElementById(key);
  let endpoint = "";
  let inFlight = false;
  let controller = null;
  const make = (tag, cls, text) => {
    const el = document.createElement(tag);
    if (cls) el.className = cls;
    if (text !== undefined) el.textContent = String(text);
    return el;
  };
  function validAddress(value) {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash ||
        url.port || url.pathname !== "/v1/monitor" || !/^jfs-network-telemetry\.[a-z0-9-]+\.workers\.dev$/i.test(url.hostname))
      throw new Error("Informe o endereço HTTPS original do Worker jfs-network-telemetry em workers.dev.");
    return url.href;
  }
  function state(message, severity = "") {
    const view = id("nrLiveStatus");
    view.textContent = message;
    view.dataset.state = severity;
  }
  function clearData() {
    id("nrTelemetrySummary").hidden = true;
    id("nrDevices").hidden = true;
    id("nrDevices").replaceChildren();
    id("monitorRedePanel").querySelector(".nr-empty").hidden = false;
  }
  function render(payload) {
    const summary = id("nrTelemetrySummary");
    const area = id("nrDevices");
    clearData();
    const monitors = Array.isArray(payload.monitors) ? payload.monitors : [];
    const fresh = payload.fresh === true;
    if (!payload.receivedAt) {
      state("Aguardando primeiro relatório do Windows", "pending");
      return;
    }
    const when = new Date(payload.receivedAt);
    const readable = Number.isFinite(when.getTime()) ? when.toLocaleString("pt-BR") : "não informada";
    const active = monitors.filter(m => m.online === true).length;
    const printers = monitors.reduce((count, m) => count + (Array.isArray(m.printers) ? m.printers.length : 0), 0);
    summary.textContent = monitors.length + " computador(es) · " + active + " conectado(s) · " +
      printers + " impressora(s) informada(s) · Último relatório: " + readable;
    summary.hidden = false;
    state(fresh ? "Dados atualizados" : "Dados antigos — sem conexão recente", fresh ? "ok" : "pending");
    id("monitorRedePanel").querySelector(".nr-empty").hidden = true;
    if (monitors.length === 0) {
      area.appendChild(make("p", "nr-no-devices", "Nenhum Monitor foi informado pela central até agora."));
    }
    for (const monitor of monitors.slice(0, 32)) {
      if (!monitor || typeof monitor.name !== "string") continue;
      const card = make("article", "nr-device");
      const head = make("div", "nr-device-head");
      const nameWrap = make("div", "nr-device-name");
      nameWrap.appendChild(make("span", "nr-device-icon", "▣"));
      nameWrap.appendChild(make("h3", "", monitor.name));
      head.appendChild(nameWrap);
      const online = fresh && monitor.online === true;
      head.appendChild(make("span", "nr-device-badge " + (online ? "is-online" : "is-offline"),
        online ? "Conectado" : "Sem relatório recente"));
      card.appendChild(head);
      const list = make("div", "nr-printer-list");
      const rows = Array.isArray(monitor.printers) ? monitor.printers.slice(0, 32) : [];
      if (rows.length === 0) list.appendChild(make("p", "nr-printer-empty", "Nenhuma impressora informada neste computador."));
      for (const printer of rows) {
        const p = make("div", "nr-printer");
        const info = make("div", "nr-printer-info");
        info.appendChild(make("strong", "", printer.name || "Impressora sem nome"));
        info.appendChild(make("small", "", "Porta: " + (printer.port || "não informada") +
          " · Fila: " + (Number.isInteger(printer.jobs) ? printer.jobs : 0) + " trabalho(s)"));
        p.appendChild(make("span", "nr-printer-icon", "▤"));
        p.appendChild(info);
        p.appendChild(make("span", "nr-printer-state", printer.presence || printer.status || "Estado desconhecido"));
        list.appendChild(p);
      }
      card.appendChild(list);
      if (monitor.warning) card.appendChild(make("p", "nr-printer-warning", monitor.warning));
      area.appendChild(card);
    }
    area.hidden = false;
  }
  async function refresh(force = false) {
    const visible = !id("monitorPage").hidden && !id("monitorRedePanel").hidden;
    if (!endpoint || inFlight || (!force && (!visible || document.hidden))) return;
    inFlight = true;
    controller = new AbortController();
    const abort = controller;
    const timeout = setTimeout(() => abort.abort(), 12_000);
    try {
      if (!window.JFSNetworkAuth) throw new Error("A autenticação do site ainda não está disponível.");
      state("Consultando central…");
      const token = await window.JFSNetworkAuth.getIdToken();
      const response = await fetch(endpoint, {
        method: "GET",
        headers: { Authorization: "Bearer " + token },
        cache: "no-store",
        signal: abort.signal
      });
      if (!response.ok) throw new Error(response.status === 403
        ? "Conta sem autorização para consultar o Monitoramento de Rede (403)."
        : response.status === 503 ? "Serviço da Cloudflare ainda não configurado (503)."
        : "Falha de consulta: HTTP " + response.status);
      const data = await response.json();
      if (!data || data.version !== 1 || !Array.isArray(data.monitors)) throw new Error("Resposta de inventário inválida.");
      render(data);
    } catch (error) {
      clearData();
      state(error?.name === "AbortError" ? "Tempo de resposta excedido" : "Sem dados: " +
        (error?.message || "não foi possível consultar o serviço"), "error");
    } finally {
      clearTimeout(timeout);
      if (controller === abort) controller = null;
      inFlight = false;
    }
  }
  function publicShareLink() {
    const site = new URL("./", window.location.href);
    site.search = "";
    site.hash = "";
    if (endpoint) site.searchParams.set("jfsEndpoint", endpoint);
    return site.href;
  }
  async function sharePanel() {
    const url = publicShareLink();
    try {
      if (navigator.share) {
        await navigator.share({
          title: "JFS Connect — Monitoramento de Rede",
          text: "Acesso ao painel JFS Connect (requer conta Google autorizada).",
          url
        });
        return;
      }
      if (!navigator.clipboard?.writeText) throw new Error("Área de transferência indisponível.");
      await navigator.clipboard.writeText(url);
      state("Link copiado — login Google necessário", "ok");
    } catch (error) {
      if (error?.name !== "AbortError") state(
        "Não foi possível compartilhar. Copie o endereço do navegador.", "error");
    }
  }

  function receiveSharedEndpoint() {
    const current = new URL(window.location.href);
    const shared = current.searchParams.get("jfsEndpoint");
    if (shared === null) return false;
    // Nunca mantenha parâmetros de configuração na barra de endereços.
    current.searchParams.delete("jfsEndpoint");
    history.replaceState(history.state, "", current.pathname + current.search + current.hash);
    try {
      endpoint = validAddress(shared);
      localStorage.setItem(STORAGE, endpoint);
      id("nrEndpoint").value = endpoint;
      state("Endereço recebido pelo link. Entre com Google para consultar.", "pending");
      return true;
    } catch {
      state("O link recebido contém um endereço inválido.", "error");
      return false;
    }
  }

  function init() {
    const form = id("nrEndpointForm");
    if (!form) return;
    try {
      const saved = localStorage.getItem(STORAGE);
      if (saved) {
        endpoint = validAddress(saved);
        id("nrEndpoint").value = endpoint;
        state("Aguardando consulta", "pending");
      }
    } catch {
      endpoint = "";
      state("Sem serviço configurado");
    }
    const cameFromLink = receiveSharedEndpoint();
    if (cameFromLink) {
      // Seleciona a página real do sistema, sem criar uma rota paralela.
      document.querySelector('[data-page="monitor"]')?.click();
      document.querySelector('[data-monitor-area="rede"]')?.click();
    }
    form.addEventListener("submit", event => {
      event.preventDefault();
      try {
        endpoint = validAddress(id("nrEndpoint").value.trim());
        localStorage.setItem(STORAGE, endpoint);
        state("Serviço configurado. Consultando…");
        refresh(true);
      } catch (error) {
        state(error?.message || "Endereço inválido", "error");
      }
    });
    id("nrRefresh").addEventListener("click", () => refresh(true));
    id("nrShareLink").addEventListener("click", sharePanel);
    id("nrDisconnect").addEventListener("click", () => {
      controller?.abort();
      endpoint = "";
      localStorage.removeItem(STORAGE);
      id("nrEndpoint").value = "";
      clearData();
      state("Sem serviço configurado");
    });
    document.addEventListener("visibilitychange", () => { if (!document.hidden) refresh(); });
    document.querySelector('[data-monitor-area="rede"]')?.addEventListener("click", () => {
      requestAnimationFrame(() => refresh());
    });
    setInterval(refresh, RATE_MS);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init, { once: true });
  else init();
})();
