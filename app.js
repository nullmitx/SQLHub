// app.js – Interaktives 3D-Fenstermodell, Kamera-Orbits, Pixel-Sternenhimmel & Scroll-Animationen

(() => {
  const model = document.getElementById('model-3d');
  const viewport = document.getElementById('viewport-3d');
  const telemetry = document.getElementById('telemetry-readout');
  const orbitBtn = document.getElementById('btn-toggle-orbit');

  let rotX = 8;
  let rotY = -12;
  let rotZ = 0;
  let autoOrbit = true;
  let orbitAngle = 0;
  let isHovering = false;

  function applyTransform() {
    if (!model) return;
    model.style.transform = `rotateX(${rotX.toFixed(2)}deg) rotateY(${rotY.toFixed(2)}deg) rotateZ(${rotZ.toFixed(2)}deg)`;
    if (telemetry) {
      const exploded = model.classList.contains('is-exploded') ? 'EXPLODED 3D' : 'AKTIV';
      telemetry.textContent = `PITCH: ${Math.round(rotX)}° · YAW: ${Math.round(rotY)}° · LAYER-DEPTH: ${exploded}`;
    }
  }

  // Kamera-Presets
  document.querySelectorAll('[data-cam-preset]').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('[data-cam-preset]').forEach((b) => b.classList.remove('is-active'));
      btn.classList.add('is-active');
      const preset = btn.getAttribute('data-cam-preset');

      autoOrbit = false;
      if (orbitBtn) orbitBtn.textContent = '↻ Auto-Orbit: AUS';

      if (preset === 'perspective') {
        model.classList.remove('is-exploded');
        rotX = 9;
        rotY = -14;
        rotZ = 0;
      } else if (preset === 'isometric') {
        model.classList.remove('is-exploded');
        rotX = 22;
        rotY = -26;
        rotZ = 4;
      } else if (preset === 'exploded') {
        model.classList.add('is-exploded');
        rotX = 16;
        rotY = -22;
        rotZ = 2;
      } else if (preset === 'front') {
        model.classList.remove('is-exploded');
        rotX = 0;
        rotY = 0;
        rotZ = 0;
      }
      applyTransform();
    });
  });

  if (orbitBtn) {
    orbitBtn.addEventListener('click', () => {
      autoOrbit = !autoOrbit;
      orbitBtn.textContent = autoOrbit ? '↻ Auto-Orbit: EIN' : '↻ Auto-Orbit: AUS';
      orbitBtn.classList.toggle('is-active', autoOrbit);
    });
  }

  // Interaktives Maus-Tracking über dem 3D-Viewport
  if (viewport) {
    viewport.addEventListener('mouseenter', () => {
      isHovering = true;
    });
    viewport.addEventListener('mouseleave', () => {
      isHovering = false;
    });
    viewport.addEventListener('mousemove', (e) => {
      const rect = viewport.getBoundingClientRect();
      const nx = ((e.clientX - rect.left) / rect.width) * 2 - 1; // -1 .. 1
      const ny = ((e.clientY - rect.top) / rect.height) * 2 - 1; // -1 .. 1
      rotY = nx * 18;
      rotX = -ny * 12 + 4;
      applyTransform();
    });
  }

  // Sanfte Auto-Orbit-Animation
  function animateOrbit() {
    if (autoOrbit && !isHovering) {
      orbitAngle += 0.015;
      rotY = Math.sin(orbitAngle) * 14;
      rotX = 7 + Math.cos(orbitAngle * 0.8) * 4;
      applyTransform();
    }
    requestAnimationFrame(animateOrbit);
  }
  requestAnimationFrame(animateOrbit);

  // Interaktiver Seiten-Wechsel direkt im 3D-Modell (Start / Instanzen / SFTP / Musik / Addons)
  const viewMap = {
    start: { id: 'lw-view-start', crumb: '▣ DASHBOARD / Übersicht & Status' },
    instances: { id: 'lw-view-instances', crumb: '🗄 INSTANZEN / Gespeicherte Datenbankprofile' },
    sftp: { id: 'lw-view-sftp', crumb: '>_ SFTP-CLIENT / Dual-Pane Datei-Transfer' },
    music: { id: 'lw-view-music', crumb: '♫ MUSIK & STREAM PLAYER / YouTube, Spotify & Radio' },
    addons: { id: 'lw-view-addons', crumb: '⊞ ADDONS & BAUKASTEN / Erweiterungen & Themes' }
  };

  document.querySelectorAll('[data-3d-view]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const targetKey = btn.getAttribute('data-3d-view');
      const target = viewMap[targetKey];
      if (!target) return;

      document.querySelectorAll('[data-3d-view]').forEach((b) => b.classList.remove('is-active'));
      btn.classList.add('is-active');

      Object.values(viewMap).forEach((v) => {
        const el = document.getElementById(v.id);
        if (el) el.hidden = v.id !== target.id;
      });

      const crumbEl = document.getElementById('lw-crumb-text');
      if (crumbEl) crumbEl.textContent = target.crumb;
    });
  });

  // Interaktiver Instanz-Wechsel im 3D-Startfenster (SCHNELL STARTEN & ⇄ Button)
  const chips = Array.from(document.querySelectorAll('.lw-chip[data-inst-name]'));
  let activeChipIdx = 0;

  function select3DInstance(idx) {
    if (!chips.length) return;
    activeChipIdx = (idx + chips.length) % chips.length;
    chips.forEach((c, i) => c.classList.toggle('is-selected', i === activeChipIdx));
    const chip = chips[activeChipIdx];
    const name = chip.getAttribute('data-inst-name') || 's1321_veyrixmain';
    const host = chip.getAttribute('data-inst-host') || '';
    const cat = chip.getAttribute('data-inst-cat') || '';
    const color = chip.getAttribute('data-inst-color') || '#e53935';
    const glyph = chip.getAttribute('data-inst-icon') || '🗄';

    const nameplate = document.getElementById('lw-3d-nameplate');
    const emblem = document.getElementById('lw-3d-emblem');
    const glyphEl = document.getElementById('lw-3d-glyph');
    const tag = document.getElementById('lw-3d-tag');
    const btnTitle = document.getElementById('lw-3d-btn-title');
    const btnSub = document.getElementById('lw-3d-btn-sub');

    if (nameplate) nameplate.textContent = name.toUpperCase();
    if (emblem) emblem.style.borderColor = color;
    if (glyphEl) glyphEl.textContent = glyph;
    if (tag) tag.textContent = '● ' + cat;
    if (btnTitle) btnTitle.textContent = 'Starte ' + name;
    if (btnSub) btnSub.textContent = host;
  }

  chips.forEach((chip, idx) => {
    chip.addEventListener('click', (e) => {
      e.stopPropagation();
      select3DInstance(idx);
    });
  });

  document.getElementById('lw-3d-cycle-btn')?.addEventListener('click', (e) => {
    e.stopPropagation();
    select3DInstance(activeChipIdx + 1);
  });

  // Scroll-Reveal Observer
  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add('is-visible');
      }
    });
  }, { threshold: 0.12 });

  document.querySelectorAll('.reveal').forEach((el) => observer.observe(el));

  // Pixel-Sternenhimmel Canvas im Hintergrund
  const canvas = document.getElementById('pixel-sky-canvas');
  if (canvas) {
    const ctx = canvas.getContext('2d');
    let stars = [];

    function resize() {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
      stars = Array.from({ length: 65 }, () => ({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        size: Math.random() > 0.75 ? 3 : 2,
        speed: 0.15 + Math.random() * 0.35,
        alpha: 0.25 + Math.random() * 0.6,
        crimson: Math.random() > 0.86
      }));
    }

    window.addEventListener('resize', resize);
    resize();

    function drawSky() {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      for (const s of stars) {
        s.y -= s.speed;
        if (s.y < 0) {
          s.y = canvas.height;
          s.x = Math.random() * canvas.width;
        }
        ctx.fillStyle = s.crimson
          ? `rgba(229, 57, 53, ${s.alpha})`
          : `rgba(226, 232, 240, ${s.alpha})`;
        ctx.fillRect(Math.round(s.x), Math.round(s.y), s.size, s.size);
      }
      requestAnimationFrame(drawSky);
    }
    requestAnimationFrame(drawSky);
  }
})();
