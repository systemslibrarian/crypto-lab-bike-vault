/**
 * ui.ts — Panel controller, theme toggle, keyboard navigation
 */

/** Initialize tab panel navigation */
export function initPanels(): void {
  const tabs = document.querySelectorAll<HTMLButtonElement>('.panel-tab');
  const panels = document.querySelectorAll<HTMLElement>('.panel');

  function switchToPanel(panelId: string): void {
    tabs.forEach(t => {
      const isActive = t.dataset.panel === panelId;
      t.classList.toggle('active', isActive);
      t.setAttribute('aria-selected', String(isActive));
      t.setAttribute('tabindex', isActive ? '0' : '-1');
    });
    panels.forEach(p => {
      const isActive = p.id === panelId;
      p.classList.toggle('active', isActive);
      p.hidden = !isActive;
    });
    // Scroll to top of panel
    const activePanel = document.getElementById(panelId);
    if (activePanel) {
      activePanel.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

  // Tab click
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      const panelId = tab.dataset.panel;
      if (panelId) switchToPanel(panelId);
    });
  });

  // Arrow key navigation between tabs
  const tabList = Array.from(tabs);
  tabs.forEach((tab, idx) => {
    tab.addEventListener('keydown', (e: KeyboardEvent) => {
      let newIdx = idx;
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
        e.preventDefault();
        newIdx = (idx + 1) % tabList.length;
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
        e.preventDefault();
        newIdx = (idx - 1 + tabList.length) % tabList.length;
      } else if (e.key === 'Home') {
        e.preventDefault();
        newIdx = 0;
      } else if (e.key === 'End') {
        e.preventDefault();
        newIdx = tabList.length - 1;
      }
      if (newIdx !== idx) {
        tabList[newIdx].focus();
        const panelId = tabList[newIdx].dataset.panel;
        if (panelId) switchToPanel(panelId);
      }
    });
  });

  // "Next panel" buttons and link buttons
  document.querySelectorAll<HTMLButtonElement>('.next-panel-btn, .link-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const next = btn.dataset.next;
      if (next) switchToPanel(next);
    });
  });

  // Set initial tab indices
  tabs.forEach((tab, idx) => {
    tab.setAttribute('tabindex', idx === 0 ? '0' : '-1');
  });
}

/** Initialize dark/light theme toggle */
export function initTheme(): void {
  const toggle = document.getElementById('theme-toggle') as HTMLButtonElement;
  const icon = toggle.querySelector('.theme-icon') as HTMLSpanElement;
  const html = document.documentElement;

  // Load saved preference or detect OS preference
  const saved = localStorage.getItem('theme');
  if (saved === 'light' || (!saved && window.matchMedia('(prefers-color-scheme: light)').matches)) {
    html.dataset.theme = 'light';
    toggle.setAttribute('aria-label', 'Switch to dark mode');
    icon.textContent = '☀️';
  } else if (saved === 'dark') {
    html.dataset.theme = 'dark';
  }

  toggle.addEventListener('click', () => {
    const isLight = html.dataset.theme === 'light';
    html.dataset.theme = isLight ? 'dark' : 'light';
    toggle.setAttribute('aria-label', isLight ? 'Switch to light mode' : 'Switch to dark mode');
    icon.textContent = isLight ? '🌙' : '☀️';
    localStorage.setItem('theme', html.dataset.theme);
  });
}
