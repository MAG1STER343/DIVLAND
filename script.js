/* eslint-disable no-use-before-define */
(() => {
  let prefersReducedMotion = false;
  try {
    prefersReducedMotion = !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  } catch (_) {
    prefersReducedMotion = false;
  }

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  const app = $("#app");
  const overlay = $("#glitchOverlay");
  const toast = $("#toast");
  const toastText = $("#toastText");
  const clock = $("#clock");

  const views = $$("[data-view]");
  const navBtns = $$("[data-nav]");

  const authCard = $("#authCard");
  const authForms = $$("[data-auth]", authCard);

  // ------- Toast
  let toastTimer = 0;
  function showToast(text) {
    if (!toast || !toastText) return;
    toastText.textContent = text;
    toast.classList.add("is-on");
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => toast.classList.remove("is-on"), 2400);
  }

  // ------- Clock widget
  function pad2(n) {
    return String(n).padStart(2, "0");
  }
  function tickClock() {
    if (!clock) return;
    const d = new Date();
    clock.textContent = `${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`;
  }
  tickClock();
  window.setInterval(tickClock, 1000);

  // ------- Navigation + Glitch transitions
  function setActiveNav(viewName) {
    navBtns.forEach((b) => b.classList.toggle("is-active", b.dataset.nav === viewName));
  }

  let transitioning = false;
  function glitchTransition(cb, { durationMs = 720 } = {}) {
    if (transitioning) return;
    transitioning = true;

    if (overlay) overlay.classList.add("is-on");
    if (background && background.pulseGlitch) background.pulseGlitch(durationMs);

    const mid = Math.min(260, Math.floor(durationMs * 0.38));
    window.setTimeout(() => {
      if (typeof cb === "function") cb();
    }, mid);

    window.setTimeout(() => {
      if (overlay) overlay.classList.remove("is-on");
      transitioning = false;
    }, durationMs);
  }

  function showView(viewName, { withGlitch = true } = {}) {
    const doIt = () => {
      views.forEach((v) => v.classList.toggle("is-active", v.dataset.view === viewName));
      setActiveNav(viewName);
      if (viewName !== "profile" && viewName !== "publicProfile" && viewName !== "dieversi") {
        setMediaBackground({ videoUrl: null, audioUrl: null });
      }
      if (viewName === "dieversi") {
        applyDieversiMediaIfPossible();
      }
    };

    if (!withGlitch) {
      doIt();
      return;
    }

    const durationMs = viewName === "profile" ? 960 : 720;
    glitchTransition(doIt, { durationMs });

    if (viewName === "profile") {
      if (background && background.freezeFor) background.freezeFor(520);
      freezeCardFor(authCard, 520);
    }
  }

  function freezeCardFor(el, ms) {
    if (!el) return;
    el.style.willChange = "transform, filter";
    el.style.filter = "contrast(1.25)";
    const start = performance.now();
    const wobble = () => {
      const t = performance.now() - start;
      if (t > ms) {
        el.style.transform = "";
        el.style.filter = "";
        el.style.willChange = "";
        return;
      }
      const jx = (Math.random() - 0.5) * 3.2;
      const jy = (Math.random() - 0.5) * 2.2;
      el.style.transform = `translate3d(${jx}px, ${jy}px, 0)`;
      requestAnimationFrame(wobble);
    };
    requestAnimationFrame(wobble);
  }

  navBtns.forEach((btn) => {
    btn.addEventListener("click", () => showView(btn.dataset.nav));
  });

  // If user navigates to DIEVERSI, apply DIEVERSI media (first files) in background.
  async function applyDieversiMediaIfPossible() {
    try {
      if (isFileProtocol) return;
      const data = await apiJson("/api/library/first");
      const soundUrl = data.sound && data.sound.url ? String(data.sound.url) : null;
      const videoUrl = data.video && data.video.url ? String(data.video.url) : null;
      setMediaBackground({ videoUrl, audioUrl: soundUrl });
    } catch (_) {
      // ignore
    }
  }

  // ------- Auth mode switching
  function setAuthMode(mode) {
    authForms.forEach((f) => f.classList.toggle("is-active", f.dataset.auth === mode));
  }

  $$("[data-switch-auth]", authCard).forEach((btn) => {
    btn.addEventListener("click", () => {
      const mode = btn.dataset.switchAuth;
      glitchTransition(() => setAuthMode(mode), { durationMs: 620 });
      if (background && background.freezeFor) background.freezeFor(240);
    });
  });

  const isFileProtocol = window.location.protocol === "file:";
  async function apiJson(url, { method = "GET", body, headers } = {}) {
    if (isFileProtocol) {
      throw new Error("Открой сайт через сервер (например: http://localhost:3000), а не file://");
    }
    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json", ...(headers || {}) },
      body: body ? JSON.stringify(body) : undefined,
      credentials: "include",
    });
    const data = await res.json().catch(() => null);
    if (!res.ok || !data || data.ok === false) {
      const msg = (data && data.error) || `HTTP ${res.status}`;
      throw new Error(msg);
    }
    return data;
  }

  async function apiUpload(url, file) {
    if (isFileProtocol) {
      throw new Error("Открой сайт через сервер (например: http://localhost:3000), а не file://");
    }
    const fd = new FormData();
    fd.append("file", file);
    const res = await fetch(url, { method: "POST", body: fd, credentials: "include" });
    const data = await res.json().catch(() => null);
    if (!res.ok || !data || data.ok === false) {
      const msg = (data && data.error) || `HTTP ${res.status}`;
      throw new Error(msg);
    }
    return data;
  }

  // Email confirmation disabled (local auth only)
  let customizationReady = false;

  function setModelsVisible(isVisible) {
    const bg = $("#bg");
    if (!bg) return;
    if (isVisible) bg.classList.remove("is-hidden");
    else bg.classList.add("is-hidden");
  }

  function setMediaBackground({ videoUrl, audioUrl } = {}) {
    const video = $("#profileVideoBg");
    const audio = $("#profileAudioBg");
    const mediaStatus = $("#mediaStatus");

    if (video) {
      if (videoUrl) {
        video.src = videoUrl;
        video.classList.add("is-on");
        video.muted = true;
        video.loop = true;
        video.play().catch(() => {});
        // Video replaces the models background when set.
        setModelsVisible(false);
      } else {
        if (video.pause) video.pause();
        video.removeAttribute("src");
        if (video.load) video.load();
        video.classList.remove("is-on");
        setModelsVisible(true);
      }
    }

    if (audio) {
      if (audioUrl) {
        audio.src = audioUrl;
        audio.loop = true;
        // Try autoplay; if blocked, show manual button (public profile) and unlock on next click.
        let blocked = false;
        try {
          const p = audio.play();
          if (p && p.then) {
            p.then(
              () => {
                if (mediaStatus) mediaStatus.textContent = "Звук включён";
              },
              () => {
                blocked = true;
                if (mediaStatus) mediaStatus.textContent = "Автозвук заблокирован браузером";
              }
            );
          }
        } catch (_) {
          blocked = true;
        }

        if (blocked) {
          const unlock = () => {
            document.removeEventListener("pointerdown", unlock, true);
            try {
              const p2 = audio.play();
              if (p2 && p2.then) {
                p2.then(
                  () => {
                    if (mediaStatus) mediaStatus.textContent = "Звук включён";
                  },
                  () => {}
                );
              }
            } catch (_) {}
          };
          document.addEventListener("pointerdown", unlock, true);
        }
      } else {
        if (audio.pause) audio.pause();
        audio.removeAttribute("src");
        if (audio.load) audio.load();
        mediaStatus && (mediaStatus.textContent = "Медиа не задано");
      }
    }
  }

  // No play buttons: audio will attempt autoplay; if blocked, it unlocks on next click.

  async function loadMeAndShowDock() {
    const dock = $("#customDock");
    const mySlug = $("#mySlug");
    const myLink = $("#myProfileLink");
    const copyBtn = $("#copyProfileLink");

    const data = await apiJson("/api/me");
    const slug = data.user.slug;
    const origin = window.location.origin || "http://localhost:3000";
    const link = `${origin}/u/${slug}`;

    if (mySlug) mySlug.textContent = `u/${slug}`;
    if (myLink) myLink.textContent = link;
    if (copyBtn) {
      copyBtn.onclick = async () => {
        if (navigator.clipboard && navigator.clipboard.writeText) {
          try {
            await navigator.clipboard.writeText(link);
            showToast("Ссылка скопирована.");
            return;
          } catch (_) {
            // fallthrough
          }
        }
        showToast("Скопируй вручную: " + link);
      };
    }
    dock && (dock.hidden = false);
    setMediaBackground({ videoUrl: data.user.videoUrl, audioUrl: data.user.audioUrl });

    if (!customizationReady) {
      customizationReady = true;
      setupCustomization();
    }
  }

  function setupCustomization() {
    const customizeBtn = $("#customizeBtn");
    const customPanel = $("#customPanel");
    const pickAudio = $("#pickAudio");
    const pickVideo = $("#pickVideo");
    const audioInput = $("#audioFile");
    const videoInput = $("#videoFile");
    const audioName = $("#audioName");
    const videoName = $("#videoName");

    if (customizeBtn) {
      customizeBtn.addEventListener("click", () => {
        if (!customPanel) return;
        customPanel.hidden = !customPanel.hidden;
        if (background && background.pulseGlitch) background.pulseGlitch(220);
      });
    }

    if (pickAudio) pickAudio.addEventListener("click", () => audioInput && audioInput.click());
    if (pickVideo) pickVideo.addEventListener("click", () => videoInput && videoInput.click());

    async function uploadAudio(file) {
      if (!file) return;
      if (!file.name.toLowerCase().endsWith(".mp3")) throw new Error("Нужен файл .mp3");
      if (file.size > 40 * 1024 * 1024) throw new Error("MP3 должен весить не больше 40MB");
      showToast("Загрузка MP3…");
      await apiUpload("/api/media/audio", file);
      showToast("Звук сохранён.");
      await loadMeAndShowDock();
    }

    async function uploadVideo(file) {
      if (!file) return;
      if (!file.name.toLowerCase().endsWith(".mp4")) throw new Error("Нужен файл .mp4");
      if (file.size > 50 * 1024 * 1024) throw new Error("MP4 должен весить не больше 50MB");
      showToast("Загрузка MP4… (звук будет удалён)");
      await apiUpload("/api/media/video", file);
      showToast("Видео сохранено (без звука).");
      await loadMeAndShowDock();
    }

    if (audioInput)
      audioInput.addEventListener("change", async () => {
        try {
          const f = audioInput && audioInput.files && audioInput.files[0];
          if (!f) return;
          if (audioName) audioName.textContent = f.name;
          await uploadAudio(f);
        } catch (err) {
          showToast(String((err && err.message) || err));
        } finally {
          audioInput.value = "";
        }
      });

    if (videoInput)
      videoInput.addEventListener("change", async () => {
        try {
          const f = videoInput && videoInput.files && videoInput.files[0];
          if (!f) return;
          if (videoName) videoName.textContent = f.name;
          await uploadVideo(f);
        } catch (err) {
          showToast(String((err && err.message) || err));
        } finally {
          videoInput.value = "";
        }
      });
  }

  async function handleLogin(form) {
    const loginEl = form.querySelector("input[name='login']");
    const passEl = form.querySelector("input[name='password']");
    const login = loginEl ? String(loginEl.value).trim() : "";
    const password = passEl ? String(passEl.value) : "";
    if (!login || !password) {
      showToast("Введи логин и пароль.");
      return;
    }
    await apiJson("/api/auth/login", { method: "POST", body: { login, password } });
    showToast("Вход выполнен.");
    await loadMeAndShowDock();
  }

  async function handleRegister(form) {
    const usernameEl = form.querySelector("input[name='username']");
    const loginEl = form.querySelector("input[name='login']");
    const passEl = form.querySelector("input[name='password']");
    const username = usernameEl ? String(usernameEl.value).trim() : "";
    const login = loginEl ? String(loginEl.value).trim() : "";
    const password = passEl ? String(passEl.value) : "";
    if (!username || !login || !password) {
      showToast("Введи имя пользователя, логин и пароль.");
      return;
    }

    try {
      await apiJson("/api/auth/register", {
        method: "POST",
        body: { username, login, password },
      });
    } catch (e) {
      const msg = String((e && e.message) || e);
      if (msg.indexOf("существует") >= 0 || msg.indexOf("логином") >= 0 || msg.indexOf("409") >= 0) {
        showToast("Логин уже занят. Попробуй другой или нажми «Войти».");
        setAuthMode("login");
        return;
      }
      throw e;
    }
    await apiJson("/api/auth/login", { method: "POST", body: { login, password } });
    showToast("Профиль создан. Вход выполнен.");
    await loadMeAndShowDock();
    setAuthMode("login");
  }

  authForms.forEach((form) => {
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      if (background && background.pulseGlitch) background.pulseGlitch(420);
      try {
        const mode = form.dataset.auth;
        if (mode === "login") await handleLogin(form);
        else if (mode === "register") await handleRegister(form);
      } catch (err) {
        showToast(String((err && err.message) || err));
      }
    });
  });

  // ------- DIEVERSI case: open + typewriter
  const openCaseBtn = $("#openCaseBtn");
  const caseOutput = $("#caseOutput");
  const caseHint = $("#caseHint");
  const caseStatus = $("#caseStatus");

  const caseText = [
    "M\u0336A\u0336G\u0336I\u0336S\u0336T\u0336E\u0336R\u0336 — DIEVERSI",
    "",
    "DIE VERSI — псевдоним был придуман 21 сентября 2025 года;",
    "смысл имени противоречит личности.",
    "",
    "Остальная информация засекречена.",
    "",
    "Ваш профиль может быть оформлен так же!",
  ].join("\n");

  let caseTyping = { running: false, raf: 0, i: 0 };
  function startTypewriter() {
    if (!caseOutput || caseTyping.running) return;
    caseTyping.running = true;
    caseTyping.i = 0;
    caseOutput.textContent = "";
    if (caseHint && caseHint.classList) caseHint.classList.add("muted");
    if (caseStatus) caseStatus.textContent = "CASE: OPEN";

    const start = performance.now();
    const step = () => {
      const elapsed = performance.now() - start;
      // speed: ~24 chars/sec + slight “glitch” bursts
      const base = Math.floor((elapsed / 1000) * 24);
      const burst = Math.random() < 0.08 ? 2 : 1;
      const target = Math.min(caseText.length, Math.max(caseTyping.i, base + burst));

      if (target > caseTyping.i) {
        caseTyping.i = target;
        caseOutput.textContent = caseText.slice(0, caseTyping.i);
        if (background && background.pulseGlitch) background.pulseGlitch(110);
      }

      if (caseTyping.i >= caseText.length) {
        caseTyping.running = false;
        caseHint && (caseHint.textContent = "Доступ предоставлен.");
        return;
      }
      caseTyping.raf = requestAnimationFrame(step);
    };
    caseTyping.raf = requestAnimationFrame(step);
  }

  if (openCaseBtn) {
    openCaseBtn.addEventListener("click", () => {
      if (background && background.pulseGlitch) background.pulseGlitch(520);
      startTypewriter();
    });
  }

  // Default view
  showView("home", { withGlitch: false });

  // ------- Background: dots + lines, hover freeze + glitch
  const background = createNetworkBackground({
    canvas: $("#bg"),
    reducedMotion: prefersReducedMotion,
  });

  // Expose for debugging if needed
  window.__dieversi = { showView };

  // Customization UI is initialized only after successful login (loadMeAndShowDock).

  // ------- DIEVERSI library (first files in sounds/videos)
  (async () => {
    try {
      if (isFileProtocol) return;
      const data = await apiJson("/api/library/first");
      const s = $("#librarySound");
      const v = $("#libraryVideo");

      if (s) s.textContent = data.sound ? String(data.sound.name) : "нет файлов";
      if (v) v.textContent = data.video ? String(data.video.name) : "нет файлов";

      // When entering DIEVERSI, use the first sound/video as DIEVERSI media:
      // video becomes background (replaces models), audio starts automatically (no buttons).
      const soundUrl = data.sound && data.sound.url ? String(data.sound.url) : null;
      const videoUrl = data.video && data.video.url ? String(data.video.url) : null;

      // If DIEVERSI view is currently active, apply immediately.
      const activeDieversi = document.querySelector("[data-view='dieversi'].is-active");
      if (activeDieversi) setMediaBackground({ videoUrl, audioUrl: soundUrl });
    } catch (_) {
      // ignore
    }
  })();

  // ------- Public profile route: /u/:slug
  (async () => {
    // Use RegExp constructor for maximum browser compatibility
    const re = new RegExp("^/u/([a-z0-9_-]{1,60})/?$", "i");
    const m = re.exec(window.location.pathname);
    if (!m) return;
    const slug = m[1].toLowerCase();
    try {
      showView("publicProfile", { withGlitch: false });
      const data = await apiJson(`/api/profile/${encodeURIComponent(slug)}`);
      const p = data.profile;
      const publicSubtitle = $("#publicSubtitle");
      const publicInfo = $("#publicInfo");
      if (publicSubtitle) publicSubtitle.textContent = `Профиль: ${p.username}`;
      if (publicInfo) publicInfo.textContent = `username: ${p.username}\nlogin: ${p.login}\nslug: ${p.slug}\ncreated: ${p.createdAt}`;

      const videoUrl = p.videoUrl || null;
      const audioUrl = p.audioUrl || null;
      const mediaStatus = $("#mediaStatus");
      if (mediaStatus) {
        const parts = [];
        parts.push(videoUrl ? "video: yes" : "video: no");
        parts.push(audioUrl ? "audio: yes" : "audio: no");
        mediaStatus.textContent = parts.join(" | ");
      }
      setMediaBackground({ videoUrl, audioUrl });
    } catch (err) {
      showToast(String((err && err.message) || err));
    }
  })();

  // Keep canvas behind everything
  if (app) {
    app.addEventListener("pointermove", (e) => background && background.setPointer && background.setPointer(e.clientX, e.clientY));
    app.addEventListener("pointerleave", () => background && background.setPointer && background.setPointer(-9999, -9999));
  }

  // Also track globally so hover works even over nav
  window.addEventListener(
    "pointermove",
    (e) => background && background.setPointer && background.setPointer(e.clientX, e.clientY),
    { passive: true }
  );
  window.addEventListener("pointerleave", () => background && background.setPointer && background.setPointer(-9999, -9999));
})();

function createNetworkBackground({ canvas, reducedMotion }) {
  if (!canvas) return null;

  const ctx = canvas.getContext("2d", { alpha: true });
  if (!ctx) return null;

  const state = {
    w: 1,
    h: 1,
    dpr: 1,
    pointerX: -9999,
    pointerY: -9999,
    slowUntil: 0,
    glitchUntil: 0,
    particles: [],
    hoveredIndex: -1,
    lastNow: performance.now(),
  };

  const cfg = {
    maxParticles: reducedMotion ? 46 : 120,
    linkDist: reducedMotion ? 140 : 190,
    hoverDist: 18,
    fieldRadius: reducedMotion ? 210 : 320,
    repelStrength: reducedMotion ? 0.18 : 0.55, // быстрый отклик
    baseLineWidth: reducedMotion ? 1.25 : 1.9,
    pointR: reducedMotion ? 2.2 : 2.9,
    maxSpeed: reducedMotion ? 0.9 : 3.6,
    friction: reducedMotion ? 0.985 : 0.988,
    wander: reducedMotion ? 0.005 : 0.008,
  };

  function resize() {
    state.dpr = Math.min(2, window.devicePixelRatio || 1);
    state.w = Math.max(1, Math.floor(window.innerWidth));
    state.h = Math.max(1, Math.floor(window.innerHeight));
    canvas.width = Math.floor(state.w * state.dpr);
    canvas.height = Math.floor(state.h * state.dpr);
    canvas.style.width = `${state.w}px`;
    canvas.style.height = `${state.h}px`;
    ctx.setTransform(state.dpr, 0, 0, state.dpr, 0, 0);

    const area = state.w * state.h;
    const target = Math.max(30, Math.min(cfg.maxParticles, Math.floor(area / (reducedMotion ? 26000 : 15000))));
    while (state.particles.length < target) state.particles.push(makeParticle(state.w, state.h));
    while (state.particles.length > target) state.particles.pop();
  }

  function setPointer(x, y) {
    state.pointerX = x;
    state.pointerY = y;
  }

  function freezeFor(ms) {
    // мягкое замедление (не “стоп”)
    state.slowUntil = Math.max(state.slowUntil, performance.now() + ms);
  }

  function pulseGlitch(ms) {
    state.glitchUntil = Math.max(state.glitchUntil, performance.now() + ms);
  }

  function clamp(v, a, b) {
    return Math.max(a, Math.min(b, v));
  }

  function clampSpeed(p) {
    const sp = Math.hypot(p.vx, p.vy);
    if (sp <= cfg.maxSpeed || sp <= 0.0001) return;
    const k = cfg.maxSpeed / sp;
    p.vx *= k;
    p.vy *= k;
  }

  function makeParticle(w, h) {
    const seed = (Math.random() * 1e9) | 0;
    const rnd = mulberry32(seed);
    const z = rnd(); // 0..1
    const scale = 0.75 + z * 0.85;
    const speed = (reducedMotion ? 0.22 : 0.45) * scale;
    const kind = rnd() < 0.45 ? "cube" : rnd() < 0.72 ? "tri" : "diamond";

    return {
      x: rnd() * w,
      y: rnd() * h,
      z,
      vx: (rnd() - 0.5) * speed,
      vy: (rnd() - 0.5) * speed,
      phase: rnd() * Math.PI * 2,
      blink: 0.7 + rnd() * 1.6,
      alpha: 0.5 + z * 0.45,
      kind,
      lag: 0, // 0..1 — заметный “лаг” при отталкивании
      trail: new Array(6).fill(null).map(() => ({ x: 0, y: 0, a: 0 })),
      trailIdx: 0,
    };
  }

  function mulberry32(a) {
    return function rand() {
      let t = (a += 0x6d2b79f5);
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function project(p) {
    const cx = state.w * 0.5;
    const cy = state.h * 0.5;
    const s = 0.72 + p.z * 0.9; // перспектива
    return {
      x: cx + (p.x - cx) * s,
      y: cy + (p.y - cy) * s,
      s,
    };
  }

  function findHovered() {
    const px = state.pointerX;
    const py = state.pointerY;
    if (px < -1000 || py < -1000) return -1;

    let best = -1;
    let bestD2 = cfg.hoverDist * cfg.hoverDist;
    for (let i = 0; i < state.particles.length; i++) {
      const pp = project(state.particles[i]);
      const dx = pp.x - px;
      const dy = pp.y - py;
      const d2 = dx * dx + dy * dy;
      if (d2 <= bestD2) {
        bestD2 = d2;
        best = i;
      }
    }
    return best;
  }

  function pushTrail(p, x, y, a) {
    const t = p.trail[p.trailIdx];
    t.x = x;
    t.y = y;
    t.a = a;
    p.trailIdx = (p.trailIdx + 1) % p.trail.length;
  }

  function drawShape(p, pp, { glitching }) {
    const blinkA = 0.5 + 0.5 * Math.sin(p.phase);
    const baseA = clamp(p.alpha * (0.5 + 0.5 * blinkA), 0, 1);
    const lagA = clamp(p.lag, 0, 1);

    const jitter = glitching || lagA > 0.12 ? 1 : 0;
    const jx = jitter ? (Math.random() - 0.5) * (1.2 + 2.6 * lagA) : 0;
    const jy = jitter ? (Math.random() - 0.5) * (0.9 + 2.1 * lagA) : 0;

    const x = pp.x + jx;
    const y = pp.y + jy;
    const size = (reducedMotion ? 6.6 : 8.8) * pp.s;
    const depth = (reducedMotion ? 4.2 : 6.0) * pp.s;

    // trail for “lag” visibility (when being repelled)
    if (lagA > 0.08 && !reducedMotion) {
      ctx.lineWidth = 1.2;
      for (let k = 0; k < p.trail.length; k++) {
        const idx = (p.trailIdx - 1 - k + p.trail.length) % p.trail.length;
        const tr = p.trail[idx];
        if (tr.a <= 0) continue;
        const a = tr.a * 0.12;
        ctx.strokeStyle = `rgba(255,255,255,${a})`;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(tr.x, tr.y);
        ctx.stroke();
      }
    }

    // central dot
    ctx.fillStyle = `rgba(255,255,255,${clamp(baseA * 0.95, 0, 1)})`;
    ctx.beginPath();
    ctx.arc(x, y, cfg.pointR * (0.85 + 0.35 * p.z), 0, Math.PI * 2);
    ctx.fill();

    // pseudo 3D shapes (wireframe)
    const strokeA = clamp(baseA * (0.28 + 0.35 * p.z) * (glitching ? 1.1 : 1), 0, 0.9);
    ctx.strokeStyle = `rgba(255,255,255,${strokeA})`;
    ctx.lineWidth = 1.35 * (0.9 + 0.35 * p.z);

    if (p.kind === "cube") {
      const o = depth;
      // front square
      const x0 = x - size;
      const y0 = y - size;
      const x1 = x + size;
      const y1 = y + size;
      // back square offset
      const bx0 = x0 - o;
      const by0 = y0 - o;
      const bx1 = x1 - o;
      const by1 = y1 - o;

      ctx.beginPath();
      rectPath(ctx, x0, y0, x1, y1);
      rectPath(ctx, bx0, by0, bx1, by1);
      // connectors
      ctx.moveTo(x0, y0);
      ctx.lineTo(bx0, by0);
      ctx.moveTo(x1, y0);
      ctx.lineTo(bx1, by0);
      ctx.moveTo(x1, y1);
      ctx.lineTo(bx1, by1);
      ctx.moveTo(x0, y1);
      ctx.lineTo(bx0, by1);
      ctx.stroke();
    } else if (p.kind === "tri") {
      const a = size * 1.05;
      ctx.beginPath();
      ctx.moveTo(x, y - a);
      ctx.lineTo(x + a, y + a * 0.85);
      ctx.lineTo(x - a, y + a * 0.85);
      ctx.closePath();
      ctx.stroke();

      // inner “depth” triangle
      ctx.strokeStyle = `rgba(255,255,255,${strokeA * 0.55})`;
      ctx.beginPath();
      ctx.moveTo(x - depth * 0.35, y - a + depth * 0.55);
      ctx.lineTo(x + a - depth * 0.55, y + a * 0.85 - depth * 0.35);
      ctx.lineTo(x - a + depth * 0.55, y + a * 0.85 - depth * 0.35);
      ctx.closePath();
      ctx.stroke();
    } else {
      // diamond with subtle fill
      const a = size * 1.15;
      const b = size * 0.85;
      const fillA = clamp(baseA * 0.08, 0, 0.12);
      ctx.fillStyle = `rgba(255,255,255,${fillA})`;
      ctx.beginPath();
      ctx.moveTo(x, y - a);
      ctx.lineTo(x + b, y);
      ctx.lineTo(x, y + a);
      ctx.lineTo(x - b, y);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = `rgba(255,255,255,${strokeA})`;
      ctx.stroke();

      // “highlight” edge
      ctx.strokeStyle = `rgba(255,255,255,${strokeA * 0.6})`;
      ctx.beginPath();
      ctx.moveTo(x, y - a);
      ctx.lineTo(x + b, y);
      ctx.stroke();
    }
  }

  function rectPath(c, x0, y0, x1, y1) {
    c.moveTo(x0, y0);
    c.lineTo(x1, y0);
    c.lineTo(x1, y1);
    c.lineTo(x0, y1);
    c.closePath();
  }

  function draw(now) {
    const glitching = now < state.glitchUntil;
    const slow = now < state.slowUntil;

    const dt = clamp((now - state.lastNow) / 16.6667, 0.5, 2.0);
    state.lastNow = now;

    ctx.clearRect(0, 0, state.w, state.h);

    // vignette
    const grad = ctx.createRadialGradient(
      state.w * 0.5,
      state.h * 0.5,
      0,
      state.w * 0.5,
      state.h * 0.5,
      Math.max(state.w, state.h) * 0.75
    );
    grad.addColorStop(0, "rgba(255,255,255,0.03)");
    grad.addColorStop(1, "rgba(0,0,0,0.0)");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, state.w, state.h);

    state.hoveredIndex = findHovered();

    const px = state.pointerX;
    const py = state.pointerY;

    // physics
    for (let i = 0; i < state.particles.length; i++) {
      const p = state.particles[i];

      // subtle wander
      const w = cfg.wander * (0.7 + 0.6 * p.z) * dt;
      p.vx += (Math.random() - 0.5) * w;
      p.vy += (Math.random() - 0.5) * w;

      // fast repel field with visible lag
      p.lag *= 0.92;
      if (px > -1000) {
        const pp = project(p);
        const dx = pp.x - px;
        const dy = pp.y - py;
        const dist = Math.hypot(dx, dy);
        if (dist > 0.001 && dist < cfg.fieldRadius) {
          const t = 1 - dist / cfg.fieldRadius;
          const f = cfg.repelStrength * (t * t) * (0.7 + 0.6 * p.z);
          // direction away from cursor, but apply into velocity in particle space approximately
          const inv = 1 / dist;
          p.vx += (dx * inv) * f * dt;
          p.vy += (dy * inv) * f * dt;

          // visible lag: “ступенька” + усиление trail
          p.lag = Math.max(p.lag, t);
        }
      }

      // slow-mode for glitch transitions (never full stop)
      const slowK = slow ? 0.55 : 1;
      p.vx *= cfg.friction;
      p.vy *= cfg.friction;
      clampSpeed(p);

      p.x += p.vx * dt * slowK;
      p.y += p.vy * dt * slowK;

      // wrap
      if (p.x < -60) p.x = state.w + 60;
      if (p.x > state.w + 60) p.x = -60;
      if (p.y < -60) p.y = state.h + 60;
      if (p.y > state.h + 60) p.y = -60;

      p.phase += (reducedMotion ? 0.01 : 0.02) * p.blink * dt;
    }

    // links (use projected positions for depth feel)
    const proj = state.particles.map((p) => project(p));
    for (let i = 0; i < state.particles.length; i++) {
      const p = state.particles[i];
      const a = proj[i];
      for (let j = i + 1; j < state.particles.length; j++) {
        const q = state.particles[j];
        const b = proj[j];
        const dx = a.x - b.x;
        const dy = a.y - b.y;
        const dist = Math.hypot(dx, dy);
        if (dist > cfg.linkDist) continue;

        const t = 1 - dist / cfg.linkDist;
        const depth = 0.55 + 0.45 * ((p.z + q.z) * 0.5);
        const alpha = clamp(t * 0.34 * depth, 0, 0.45) * (glitching ? 1.15 : 1);

        ctx.strokeStyle = `rgba(255,255,255,${alpha})`;
        ctx.lineWidth = cfg.baseLineWidth * (0.85 + 0.55 * depth);
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
      }
    }

    // draw shapes + trails (after links for clearer silhouettes)
    for (let i = 0; i < state.particles.length; i++) {
      const p = state.particles[i];
      const pp = proj[i];

      // push trail using “step” when lagging to make it obvious
      const step = p.lag > 0.12 ? (reducedMotion ? 1 : 3) : 1;
      const sx = Math.round(pp.x / step) * step;
      const sy = Math.round(pp.y / step) * step;
      pushTrail(p, sx, sy, p.lag);

      drawShape(p, { x: sx, y: sy, s: pp.s }, { glitching: glitching || i === state.hoveredIndex });
    }

    // cursor field ring
    if (!reducedMotion && state.pointerX > -1000) {
      ctx.strokeStyle = "rgba(255,255,255,0.08)";
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.arc(state.pointerX, state.pointerY, cfg.fieldRadius * 0.34, 0, Math.PI * 2);
      ctx.stroke();
    }

    requestAnimationFrame(draw);
  }

  resize();
  window.addEventListener("resize", resize, { passive: true });
  requestAnimationFrame(draw);

  return { setPointer, freezeFor, pulseGlitch };
}
