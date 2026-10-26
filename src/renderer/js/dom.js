// dom.js – kleine, wiederverwendbare DOM-/Formatierungs-Helfer

import { icon } from './icons.js';

/** Ersetzt alle Elemente mit [data-icon] durch das jeweilige Lucide-SVG. */
export function hydrateIcons(root = document) {
  root.querySelectorAll('[data-icon]').forEach((el) => {
    const name = el.getAttribute('data-icon');
    const size = Number(el.getAttribute('data-icon-size')) || 18;
    el.innerHTML = icon(name, size);
    el.removeAttribute('data-icon');
  });
}

export function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

export function hexToRgba(hex, alpha) {
  if (!/^#[0-9a-fA-F]{6}$/.test(hex)) return `rgba(124,92,255,${alpha})`;
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

export function safeHost(url) {
  try {
    const u = new URL(url);
    return u.host + (u.pathname && u.pathname !== '/' ? u.pathname : '');
  } catch {
    return url || '';
  }
}

export function toFileUrl(p) {
  if (!p) return null;
  if (/^file:\/\//i.test(p)) return p;
  let normalized = String(p).replace(/\\/g, '/');
  if (!normalized.startsWith('/')) normalized = '/' + normalized;
  return 'file://' + normalized;
}

export function cssEscape(value) {
  if (window.CSS && typeof window.CSS.escape === 'function') return window.CSS.escape(value);
  return String(value).replace(/["\\]/g, '\\$&');
}

/**
 * Erzeugt ein kleines Info-Badge („i") mit schwebendem Studio-Tooltip.
 */
export function infoTip(text) {
  const safe = escapeHtml(text);
  return `<span class="info-tip" tabindex="0" role="note" aria-label="${safe}">${icon('info', 13)}<span class="info-tip__bubble">${safe}</span></span>`;
}

/**
 * Ersetzt ein natives <select>-Element optisch durch ein handgefertigtes Studio-Dropdown-Menü,
 * während das originale <select> für Events und Werte-Synchronisation erhalten bleibt.
 */
export function enhanceSelect(selectEl) {
  if (!selectEl) return;
  const wrap = selectEl.closest('.select-wrap') || selectEl.parentElement;
  if (!wrap) return;

  // Falls bereits initialisiert: nur Anzeige synchronisieren
  const existing = wrap.querySelector('.studio-select');
  if (existing) {
    existing.remove();
  }

  wrap.classList.add('select-wrap--enhanced');
  selectEl.classList.add('sr-select');

  const container = document.createElement('div');
  container.className = 'studio-select';

  const trigger = document.createElement('button');
  trigger.type = 'button';
  trigger.className = 'studio-select__trigger';
  trigger.setAttribute('aria-haspopup', 'listbox');
  trigger.setAttribute('aria-expanded', 'false');

  const menu = document.createElement('div');
  menu.className = 'studio-select__menu';
  menu.setAttribute('role', 'listbox');
  menu.hidden = true;

  function syncUI() {
    const opts = Array.from(selectEl.options);
    const current = opts.find((o) => o.value === selectEl.value) || opts[0];
    trigger.innerHTML = `
      <span class="studio-select__label">${escapeHtml(current ? current.textContent : '')}</span>
      <span class="studio-select__chev">${icon('chevron-down', 15)}</span>
    `;
    menu.innerHTML = '';
    opts.forEach((opt) => {
      const item = document.createElement('button');
      item.type = 'button';
      const active = opt.value === selectEl.value;
      item.className = 'studio-select__option' + (active ? ' is-selected' : '');
      item.setAttribute('role', 'option');
      item.setAttribute('aria-selected', active ? 'true' : 'false');
      item.innerHTML = `
        <span class="studio-select__opt-text">${escapeHtml(opt.textContent)}</span>
        <span class="studio-select__opt-check">${active ? icon('check', 14) : ''}</span>
      `;
      item.addEventListener('click', (e) => {
        e.stopPropagation();
        if (selectEl.value !== opt.value) {
          selectEl.value = opt.value;
          selectEl.dispatchEvent(new Event('change', { bubbles: true }));
        }
        syncUI();
        closeMenu();
      });
      menu.appendChild(item);
    });
  }

  function openMenu() {
    document.querySelectorAll('.studio-select.is-open').forEach((el) => {
      if (el !== container) {
        el.classList.remove('is-open');
        const m = el.querySelector('.studio-select__menu');
        if (m) m.hidden = true;
      }
    });
    container.classList.add('is-open');
    trigger.setAttribute('aria-expanded', 'true');
    menu.hidden = false;
  }

  function closeMenu() {
    container.classList.remove('is-open');
    trigger.setAttribute('aria-expanded', 'false');
    menu.hidden = true;
  }

  trigger.addEventListener('click', (e) => {
    e.stopPropagation();
    if (container.classList.contains('is-open')) closeMenu();
    else openMenu();
  });

  document.addEventListener('click', (e) => {
    if (!container.contains(e.target)) closeMenu();
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && container.classList.contains('is-open')) {
      closeMenu();
    }
  });

  selectEl.addEventListener('change', syncUI);

  syncUI();
  container.append(trigger, menu);
  wrap.appendChild(container);
}

