/* Navegação isolada das subabas de Monitoramento. Não ativa coleta nem integrações. */
(() => {
  'use strict';
  const init = () => {
    const root = document.getElementById('monitorPage');
    if (!root) return;
    const tabs = Array.from(root.querySelectorAll('[data-monitor-area]'));
    const panels = {
      telegram: document.getElementById('monitorTelegramPanel'),
      rede: document.getElementById('monitorRedePanel')
    };
    if (tabs.length !== 2 || !panels.telegram || !panels.rede) return;

    function select(area, focus = false) {
      if (!Object.hasOwn(panels, area)) return;
      tabs.forEach(tab => {
        const active = tab.dataset.monitorArea === area;
        tab.classList.toggle('is-active', active);
        tab.setAttribute('aria-selected', String(active));
        tab.tabIndex = active ? 0 : -1;
        if (active && focus) tab.focus();
      });
      Object.entries(panels).forEach(([key, panel]) => {
        panel.hidden = key !== area;
      });
    }

    tabs.forEach((tab, index) => {
      tab.addEventListener('click', () => select(tab.dataset.monitorArea));
      tab.addEventListener('keydown', event => {
        const key = event.key;
        if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(key)) return;
        event.preventDefault();
        const next = key === 'Home' ? 0 : key === 'End' ? tabs.length - 1
          : (index + (key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
        select(tabs[next].dataset.monitorArea, true);
      });
    });
    select('telegram');
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();
