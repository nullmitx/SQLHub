// theme.js – wendet Erscheinungsbild-Einstellungen (Akzent, Verlauf, Button-Design, Radius-Slider, Apple Liquid Glass, Karten-Stil, Dichte, Auto-Crop & Schärfe für Hintergrundbilder) an

const root = document.documentElement;
const HEX_RE = /^#[0-9a-fA-F]{6}$/;

export function normalizeHex(value, fallback = '') {
  return typeof value === 'string' && HEX_RE.test(value) ? value.toLowerCase() : fallback;
}

export function hexToRgba(hex, alpha) {
  const h = normalizeHex(hex);
  if (!h) return '';
  const r = parseInt(h.slice(1, 3), 16);
  const g = parseInt(h.slice(3, 5), 16);
  const b = parseInt(h.slice(5, 7), 16);
  const a = Math.max(0, Math.min(1, Number(alpha)));
  return `rgba(${r}, ${g}, ${b}, ${Number(a.toFixed(3))})`;
}

function clamp(value, min, max) {
  const n = Number(value);
  if (Number.isNaN(n)) return min;
  return Math.min(max, Math.max(min, n));
}

function setVar(name, value) {
  if (value === null || value === undefined || value === '') root.style.removeProperty(name);
  else root.style.setProperty(name, value);
}

/** Mappt Preset-Namen auf Standard-Pixelwerte für den Eckenradius. */
export const RADIUS_PRESET_PX = {
  sharp: 1,
  balanced: 6,
  rounded: 10,
  pill: 24
};

const THEME_DEFAULT_SURFACE = {
  dark: { surface: '#151922', surface2: '#1b202c', surface3: '#232a38', input: '#11151d', sidebar: '#0b0d12' },
  midnight: { surface: '#0c0e14', surface2: '#121620', surface3: '#181d2a', input: '#080a0f', sidebar: '#06080c' },
  slate: { surface: '#161f30', surface2: '#1d283e', surface3: '#25334e', input: '#0f1624', sidebar: '#0d1320' },
  light: { surface: '#ffffff', surface2: '#edf1f7', surface3: '#e0e6f0', input: '#f5f7fb', sidebar: '#d5dbe7' }
};

/** Mischt eine Hex-Farbe leicht Richtung Weiß/Schwarz für abgeleitete Ebenen. */
function shiftHex(hex, delta) {
  const h = normalizeHex(hex, '#121622');
  const clampByte = (v) => Math.max(0, Math.min(255, Math.round(v)));
  const r = clampByte(parseInt(h.slice(1, 3), 16) + delta);
  const g = clampByte(parseInt(h.slice(3, 5), 16) + delta);
  const b = clampByte(parseInt(h.slice(5, 7), 16) + delta);
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}

/**
 * Wendet die Erscheinungsbild-Einstellungen auf CSS-Variablen und Data-Attribute an.
 * @param {object} settings
 * @param {string} [backgroundUrl] aufgelöste file://-URL des Hintergrundbilds
 */
export function applyAppearance(settings, backgroundUrl) {
  const s = settings || {};
  const themeKey = ['light', 'midnight', 'slate'].includes(s.theme) ? s.theme : 'dark';
  const isLight = themeKey === 'light';

  // 1. Akzentfarbe
  const accent = normalizeHex(s.accentColor, '');
  if (accent) {
    setVar('--primary', accent);
    setVar('--primary-hover', accent);
    setVar('--primary-soft', hexToRgba(accent, isLight ? 0.12 : 0.18));
    setVar('--accent', accent);
    setVar('--accent-soft', hexToRgba(accent, isLight ? 0.12 : 0.16));
  } else {
    ['--primary', '--primary-hover', '--primary-soft', '--accent', '--accent-soft']
      .forEach((v) => setVar(v, ''));
  }

  // 2. Akzent-Farbverlauf
  if (s.accentGradient) {
    const from = normalizeHex(s.accentGradientFrom, accent || '#e53935');
    const to = normalizeHex(s.accentGradientTo, accent || '#c62828');
    setVar('--gradient', `linear-gradient(180deg, ${from} 0%, ${to} 100%)`);
  } else if (accent) {
    setVar('--gradient', `linear-gradient(180deg, ${accent} 0%, ${accent}dd 100%)`);
  } else {
    setVar('--gradient', '');
  }

  // 3. Eigene Button-Farbe
  const btnColor = normalizeHex(s.buttonColor, '');
  if (btnColor) {
    setVar('--btn-accent', btnColor);
    setVar('--btn-accent-soft', hexToRgba(btnColor, isLight ? 0.14 : 0.22));
    setVar('--btn-accent-border', hexToRgba(btnColor, 0.48));
    setVar('--btn-gradient', `linear-gradient(180deg, ${btnColor} 0%, ${btnColor}d8 100%)`);
  } else {
    ['--btn-accent', '--btn-accent-soft', '--btn-accent-border', '--btn-gradient']
      .forEach((v) => setVar(v, ''));
  }

  // 4. Button- & Eingabe-Eckenradius: fest auf 1px–2px (eckig im Launcher-Look)
  root.dataset.btnRadius = 'sharp';
  setVar('--btn-radius', '1px');
  setVar('--radius-sm', '1px');
  setVar('--radius', '2px');
  setVar('--radius-lg', '3px');

  // 5. Button-Stil (gradient | solid | soft | outline)
  const btnStyle = ['gradient', 'solid', 'soft', 'outline'].includes(s.buttonStyle)
    ? s.buttonStyle
    : 'gradient';
  root.dataset.btnStyle = btnStyle;

  // 6. Karten-Stil (glass | flat | bordered)
  const cardStyle = ['glass', 'flat', 'bordered'].includes(s.cardStyle)
    ? s.cardStyle
    : 'glass';
  root.dataset.cardStyle = cardStyle;

  // 7. Oberflächen-Dichte (compact | normal | comfortable)
  const density = ['compact', 'normal', 'comfortable'].includes(s.uiDensity)
    ? s.uiDensity
    : 'normal';
  root.dataset.density = density;

  // 8. Animationen & Effekte
  root.dataset.animations = s.animationsEnabled === false ? 'off' : 'on';

  // 9. Apple "Liquid Glass" Design & Panel-Farbe/Transparenz
  const customPanelHex = normalizeHex(s.panelColor, '');
  const panelOpacityPct = typeof s.panelOpacity === 'number' ? clamp(s.panelOpacity, 0, 100) : 100;
  const panelBlurPx = typeof s.panelBlur === 'number' ? clamp(s.panelBlur, 0, 40) : 20;
  const themeDefaults = THEME_DEFAULT_SURFACE[themeKey] || THEME_DEFAULT_SURFACE.dark;

  const isLiquidGlass = panelOpacityPct < 100;
  root.dataset.glass = isLiquidGlass ? 'liquid' : 'solid';

  const hasCustomSurface = Boolean(customPanelHex) || isLiquidGlass;
  if (hasCustomSurface) {
    const baseHex = customPanelHex || themeDefaults.surface;
    const base2Hex = customPanelHex ? shiftHex(customPanelHex, isLight ? -10 : 12) : themeDefaults.surface2;
    const base3Hex = customPanelHex ? shiftHex(customPanelHex, isLight ? -20 : 22) : themeDefaults.surface3;
    const inputHex = customPanelHex ? shiftHex(customPanelHex, isLight ? -6 : -8) : themeDefaults.input;
    const sidebarHex = customPanelHex ? shiftHex(customPanelHex, isLight ? -4 : -4) : themeDefaults.sidebar;

    const rawAlpha = panelOpacityPct / 100;

    if (isLiquidGlass) {
      // Apple Liquid Glass: Selbst bei 0% Regler bleibt eine feine refraktive Rauchglas-Tönung erhalten,
      // damit Text und Bedienelemente auf hellen Wallpapern (z. B. Sonnenuntergang/Strand) gestochen scharf lesbar bleiben.
      const effectiveBlur = Math.max(14, panelBlurPx);
      const minTint = isLight ? 0.34 : 0.28;
      const glassAlpha = minTint + rawAlpha * (1 - minTint);
      const glassAlpha2 = Math.min(0.95, glassAlpha + 0.09);
      const glassAlpha3 = Math.min(0.98, glassAlpha + 0.16);
      const inputAlpha = Math.min(0.92, Math.max(0.42, glassAlpha + 0.10));
      const sidebarAlpha = Math.min(0.94, Math.max(0.36, glassAlpha + 0.06));

      setVar('--surface', hexToRgba(baseHex, glassAlpha));
      setVar('--surface-2', hexToRgba(base2Hex, glassAlpha2));
      setVar('--surface-3', hexToRgba(base3Hex, glassAlpha3));
      setVar('--surface-glass', hexToRgba(baseHex, Math.min(0.88, glassAlpha + 0.05)));
      setVar('--bg-input', hexToRgba(inputHex, inputAlpha));
      setVar('--sidebar', hexToRgba(sidebarHex, sidebarAlpha));
      setVar('--panel-backdrop', `blur(${effectiveBlur}px) saturate(185%) contrast(106%)`);
    } else {
      setVar('--surface', hexToRgba(baseHex, 1));
      setVar('--surface-2', hexToRgba(base2Hex, 1));
      setVar('--surface-3', hexToRgba(base3Hex, 1));
      setVar('--surface-glass', hexToRgba(baseHex, 0.92));
      setVar('--bg-input', hexToRgba(inputHex, 1));
      setVar('--sidebar', hexToRgba(sidebarHex, 1));
      setVar('--panel-backdrop', 'none');
    }
  } else {
    ['--surface', '--surface-2', '--surface-3', '--surface-glass', '--bg-input', '--sidebar', '--panel-backdrop']
      .forEach((v) => setVar(v, ''));
  }

  // 10. Hintergrund des Arbeitsbereichs (inkl. Auto-Crop & HD-Bildschärfe per GPU-Lanczos-3 <img>)
  const style = ['solid', 'gradient', 'image'].includes(s.backgroundStyle)
    ? s.backgroundStyle
    : 'default';
  root.dataset.bgStyle = style;

  const bgMediaEl = document.getElementById('app-bg-media');

  if (style === 'default') {
    if (bgMediaEl) {
      bgMediaEl.hidden = true;
      bgMediaEl.removeAttribute('src');
    }
    [
      '--bg',
      '--bg-app',
      '--app-bg-image',
      '--app-bg-size',
      '--app-bg-opacity',
      '--app-bg-blur',
      '--app-bg-filter',
      '--app-bg-scale'
    ].forEach((v) => setVar(v, ''));
    return;
  }

  const translucentApp = isLiquidGlass
    ? (isLight ? 'rgba(255, 255, 255, 0.14)' : 'rgba(6, 9, 18, 0.22)')
    : (isLight ? 'rgba(255, 255, 255, 0.55)' : 'rgba(10, 10, 16, 0.45)');

  if (style === 'solid') {
    if (bgMediaEl) {
      bgMediaEl.hidden = true;
      bgMediaEl.removeAttribute('src');
    }
    setVar('--bg', normalizeHex(s.backgroundSolid, isLight ? '#eef0f7' : '#0f0f18'));
    setVar('--app-bg-image', 'none');
    setVar('--app-bg-filter', 'none');
    setVar('--app-bg-scale', '1');
  } else if (style === 'gradient') {
    if (bgMediaEl) {
      bgMediaEl.hidden = true;
      bgMediaEl.removeAttribute('src');
    }
    const from = normalizeHex(s.backgroundGradientFrom, isLight ? '#dfe4ff' : '#161630');
    const to = normalizeHex(s.backgroundGradientTo, isLight ? '#f4f4fb' : '#0a0a0f');
    setVar('--bg', `linear-gradient(135deg, ${from} 0%, ${to} 100%)`);
    setVar('--app-bg-image', 'none');
    setVar('--app-bg-filter', 'none');
    setVar('--app-bg-scale', '1');
  } else {
    const bgBlur = clamp(s.backgroundImageBlur, 0, 40);
    const sharpenOn = s.backgroundImageSharpen !== false;
    const opacityStr = String(clamp(s.backgroundImageOpacity, 0, 100) / 100);
    setVar('--bg', isLight ? '#eef0f7' : '#0b0e17');
    setVar('--app-bg-image', 'none');
    setVar('--app-bg-size', 'cover');
    setVar('--app-bg-opacity', opacityStr);
    setVar('--app-bg-blur', `${bgBlur}px`);
    setVar('--app-bg-scale', bgBlur > 0 ? '1.04' : '1');

    const filterParts = [];
    if (bgBlur > 0) {
      filterParts.push(`blur(${bgBlur}px)`);
    }
    if (sharpenOn) {
      filterParts.push('contrast(1.06) saturate(1.08) brightness(1.01)');
    }
    const filterCss = filterParts.length > 0 ? filterParts.join(' ') : 'none';
    setVar('--app-bg-filter', filterCss);

    if (bgMediaEl) {
      if (backgroundUrl) {
        if (bgMediaEl.getAttribute('src') !== backgroundUrl) {
          bgMediaEl.setAttribute('src', backgroundUrl);
        }
        bgMediaEl.hidden = false;
      } else {
        bgMediaEl.hidden = true;
        bgMediaEl.removeAttribute('src');
      }
    }
  }

  if (!hasCustomSurface) {
    const translucentSidebar = isLight ? 'rgba(255, 255, 255, 0.80)' : 'rgba(13, 15, 24, 0.76)';
    setVar('--sidebar', translucentSidebar);
  }
  setVar('--bg-app', translucentApp);
}
