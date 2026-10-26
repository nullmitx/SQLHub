// toast.js – Studio-Benachrichtigungen mit Countdown-Fortschrittsbalken, Farbtypen & Schließen-Button

import { icon } from './icons.js';
import { state } from './state.js';

const root = document.getElementById('toast-root');

const ICONS = {
  info: 'info',
  success: 'circle-check',
  error: 'circle-alert',
  warning: 'triangle-alert'
};

const DEFAULT_TITLES = {
  info: 'Information',
  success: 'Erfolgreich',
  warning: 'Wichtiger Hinweis',
  error: 'Fehler'
};

/**
 * Ermittelt die konfigurierte Standard-Anzeigedauer in Millisekunden.
 */
export function getConfiguredToastMs() {
  const sec = Number(state.settings && state.settings.toastDurationSeconds);
  if (!Number.isNaN(sec) && sec >= 1 && sec <= 60) {
    return Math.round(sec * 1000);
  }
  return 5000;
}

/**
 * @param {{
 *   title?: string,
 *   message: string,
 *   type?: 'info'|'success'|'error'|'warning',
 *   timeout?: number,
 *   actions?: { label: string, onClick: () => void, primary?: boolean }[]
 * }} options
 */
export function showToast(options = {}) {
  const {
    title = '',
    message = '',
    type = 'info',
    timeout,
    actions = []
  } = options;

  const validType = ICONS[type] ? type : 'info';
  const durationMs = timeout !== undefined ? Number(timeout) : getConfiguredToastMs();

  const el = document.createElement('div');
  el.className = `toast toast--${validType}`;
  el.setAttribute('role', validType === 'error' ? 'alert' : 'status');

  const iconEl = document.createElement('div');
  iconEl.className = 'toast__icon';
  iconEl.innerHTML = icon(ICONS[validType], 17);

  const content = document.createElement('div');
  content.className = 'toast__content';

  const displayTitle = title || DEFAULT_TITLES[validType];
  if (displayTitle) {
    const t = document.createElement('div');
    t.className = 'toast__title';
    t.textContent = displayTitle;
    content.appendChild(t);
  }

  const msg = document.createElement('div');
  msg.className = 'toast__message';
  msg.textContent = message;
  content.appendChild(msg);

  if (actions.length > 0) {
    const actionsEl = document.createElement('div');
    actionsEl.className = 'toast__actions';
    for (const action of actions) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = action.primary ? 'btn btn--primary btn--sm' : 'btn btn--ghost btn--sm';
      btn.textContent = action.label;
      btn.addEventListener('click', () => {
        try {
          action.onClick();
        } finally {
          remove();
        }
      });
      actionsEl.appendChild(btn);
    }
    content.appendChild(actionsEl);
  }

  const close = document.createElement('button');
  close.type = 'button';
  close.className = 'toast__close';
  close.innerHTML = icon('x', 15);
  close.title = 'Meldung schließen';
  close.setAttribute('aria-label', 'Schließen');
  close.addEventListener('click', () => remove());

  el.append(iconEl, content, close);

  // Ablaufbalken am unteren Rand (zeigt visuell, wann die Meldung verschwindet)
  let progressBar = null;
  if (durationMs > 0) {
    const progressTrack = document.createElement('div');
    progressTrack.className = 'toast__progress';
    progressBar = document.createElement('div');
    progressBar.className = 'toast__progress-bar';
    progressBar.style.animationDuration = `${durationMs}ms`;
    progressTrack.appendChild(progressBar);
    el.appendChild(progressTrack);
  }

  root.appendChild(el);

  let timer = null;
  let remainingMs = durationMs;
  let startedAt = Date.now();
  let removed = false;

  function remove() {
    if (removed) return;
    removed = true;
    if (timer) clearTimeout(timer);
    el.classList.add('is-leaving');
    setTimeout(() => el.remove(), 200);
  }

  function startTimer() {
    if (durationMs <= 0 || removed) return;
    startedAt = Date.now();
    if (progressBar) {
      progressBar.style.animationPlayState = 'running';
    }
    timer = setTimeout(remove, remainingMs);
  }

  function pauseTimer() {
    if (durationMs <= 0 || removed) return;
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    const elapsed = Date.now() - startedAt;
    remainingMs = Math.max(250, remainingMs - elapsed);
    if (progressBar) {
      progressBar.style.animationPlayState = 'paused';
    }
  }

  if (durationMs > 0) {
    el.addEventListener('mouseenter', pauseTimer);
    el.addEventListener('mouseleave', startTimer);
    startTimer();
  }

  return { remove };
}
