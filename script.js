/* eslint-disable no-use-before-define */
(() => {
  let prefersReducedMotion = false;
  try {
    prefersReducedMotion = !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  } catch (_) {
    prefersReducedMotion = false;
  }

  const viewMap = {
    "/main": "home",
    "/participants": "participants",
    "/profile": "profile",
    "/diversi": "dieversi",
    "/discord": "discord",
  };
  const profileRe = new RegExp("^/profile/([a-z0-9_-]{1,60})/?$", "i");

  function $(s, c = document) { return c.querySelector(s); }
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  const app = $("#app");
  const overlay = $("#glitchOverlay");
  const toast = $("#toast");
  const toastText = $("#toastText");
  const clock = $("#clock");
  let currentViewName = "home";

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

  const burgerBtn = $("#burgerBtn");
  const mainNav = $("#mainNav");

  if (burgerBtn && mainNav) {
    burgerBtn.onclick = () => {
      burgerBtn.classList.toggle("is-open");
      mainNav.classList.toggle("is-open");
    };
  }

  // ------- Navigation + Glitch transitions
  function setActiveNav(viewName) {
    navBtns.forEach((b) => b.classList.toggle("is-active", b.dataset.nav === viewName));
    if (burgerBtn && mainNav) {
      burgerBtn.classList.remove("is-open");
      mainNav.classList.remove("is-open");
    }
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
      currentViewName = viewName;

      // Update URL
      const routeMap = {
        home: "/main",
        participants: "/participants",
        profile: "/profile",
        dieversi: "/diversi",
        discord: "/discord"
      };
      // ONLY push state for main tabs. Public profiles handle their own URL via the IIFE or manual navigation.
      const path = routeMap[viewName];
      if (path && window.location.pathname !== path) {
        window.history.pushState({ view: viewName }, "", path);
      }

      // Background zoom
      if (background && background.setZoom) {
        background.setZoom(viewName !== "home");
      }

      if (viewName !== "profile" && viewName !== "publicProfile" && viewName !== "dieversi") {
        setMediaBackground({ videoUrl: null, audioUrl: null });
      }

      // Stop DIEVERSI typing sound when leaving that section
      if (viewName !== "dieversi") {
        try {
          const dia = document.querySelector ? window._diversipapa : null;
          if (dia && !dia.paused) { dia.pause(); dia.currentTime = 0; }
        } catch(_) {}
      }

      // Show correct stage when entering profile tab
      if (viewName === "profile") {
        const authCard_ = document.querySelector("#authCard");
        const profileStage_ = document.querySelector("#profileStage");
        if (me) {
          // Logged in — show profile widget, hide auth form
          if (authCard_) authCard_.classList.add("hidden");
          if (profileStage_) profileStage_.classList.remove("hidden");
          // Re-apply avatar + case in case they changed
          updateProfileAvatarView(me.avatarUrl || me.avatar_path);
          updateProfileCase(me.caseText);
          applyThemeFromUser(me);
        } else {
          // Not logged in — show auth form
          if (authCard_) authCard_.classList.remove("hidden");
          if (profileStage_) profileStage_.classList.add("hidden");
        }
      }

      if (viewName === "participants") {
        loadParticipants();
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
    // Videos/Sounds folders were removed by user, skipping media fetch.
    return;
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
  function setMediaBackground({ audioUrl, videoUrl } = {}) {
    const video = $("#profileVideoBg");
    const audio = $("#profileAudioBg");

    if (video) {
      if (videoUrl) {
        video.src = videoUrl;
        video.muted = true;
        video.loop = true;
        video.play().catch(() => {});
        video.classList.add("is-visible");
        setModelsVisible(false);
      } else {
        video.pause();
        video.src = "";
        video.classList.remove("is-visible");
        setModelsVisible(true);
      }
    }

    if (audio) {
      if (audioUrl) {
        audio.src = audioUrl;
        audio.loop = true;
        audio.volume = 0.1; // 10% volume as requested
        audio.play().catch(() => {});
      } else {
        audio.pause();
        audio.src = "";
      }
    }
  }

  // No play buttons: audio will attempt autoplay; if blocked, it unlocks on next click.

  let me = null;
  let customEmojisHtml = `
    <svg class="emojiSVG anim-spin" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><path d="M12 2v4M12 18v4M2 12h4M18 12h4"/></svg>
    <svg class="emojiSVG anim-jitter" viewBox="0 0 24 24"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
    <svg class="emojiSVG anim-glitchDash" viewBox="0 0 24 24"><path d="M4 4l16 16M4 20L20 4"/></svg>
    <svg class="emojiSVG anim-heartbeat" viewBox="0 0 24 24"><path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z"/></svg>
    <svg class="emojiSVG" viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><line x1="9" y1="9" x2="15" y2="15"/><line x1="15" y1="9" x2="9" y2="15"/></svg>
    <svg class="emojiSVG" viewBox="0 0 24 24"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/></svg>
  `.trim().split('</svg>').map(s=>s.trim()).filter(Boolean).map(s=>s+'</svg>');

  // Apply theme from a user object (owner or public profile)
  function applyThemeFromUser(u) {
    if (!u) return;
    const theme = u.bgColor || 'default';
    document.body.setAttribute('data-theme', theme);
    if (background && background.setThemeColor) background.setThemeColor(theme);
    // persist to localStorage so it survives page reload
    try { localStorage.setItem('dv_theme', theme); } catch(_){}
  }

  async function loadMeAndShowDock() {
    try {
      const data = await apiJson("/api/me");
      me = data.user;
      
      const headerUser = $("#headerUser");
      if (headerUser) {
        headerUser.classList.remove("hidden");
        const av = headerUser.querySelector(".headerAvatar");
        const lg = headerUser.querySelector(".headerLogin");
        if (av) {
          av.style.backgroundImage = (me.avatarUrl || me.avatar_path) ? `url(${me.avatarUrl || me.avatar_path})` : 'none';
        }
        if (lg) lg.textContent = me.login;
      }
      
      setMediaBackground({ videoUrl: me.videoUrl, audioUrl: me.audioUrl });

      // Apply saved theme for the logged‑in user
      applyThemeFromUser(me);

      const myLink = $("#profileLinkBox");
      if (myLink) myLink.textContent = `u/${me.slug}`;
      const myUsername = $("#profileUsername");
      if (myUsername && myUsername.querySelector(".glitchTitle__base")) {
        myUsername.dataset.text = me.username;
        myUsername.querySelector(".glitchTitle__base").textContent = me.username;
      }

      document.body.classList.add("is-owner");
      updateProfileAvatarView(me.avatarUrl || me.avatarPath);
      updateProfileCase(me.caseText);
        
      const authStage = document.querySelector(".authStage") || document.querySelector("#authCard");
      if (authStage) authStage.classList.add("hidden");
      const profileStage = $("#profileStage");
      if (profileStage) profileStage.classList.remove("hidden");
        
      // Ensure color picker is initialized visually
      document.querySelectorAll('.colorBtn').forEach(b => {
        let currentC = me.bgColor;
        b.classList.toggle('active', b.dataset.color === currentC || (b.dataset.color === 'default' && !currentC));
      });

      if (!customizationReady) {
        customizationReady = true;
        setupCustomization();
      }
    } catch(e) {
      me = null;
      throw e;
    }
  }

  function updateProfileAvatarView(path) {
    const empty = $(".profileAvatarEmpty");
    const img = $("#profileAvatarImg");
    if (!empty || !img) return;
    if (path) {
      img.src = path;
      img.hidden = false;
      empty.hidden = true;
    } else {
      img.hidden = true;
      empty.hidden = false;
    }
    
    // update header
    const av = $("#headerUser").querySelector(".headerAvatar");
    if (av) av.style.backgroundImage = path ? `url(${path})` : 'none';
  }

  function renderEmojisInText(text) {
    if (!text) return "";
    let html = text.replace(/</g, "&lt;").replace(/>/g, "&gt;");
    // [EMOJI_X] to SVG mapping
    html = html.replace(/[EMOJI_(d+)]/g, (match, n) => {
      const i = parseInt(n, 10);
      if (customEmojisHtml[i]) {
        return customEmojisHtml[i].replace('class="emojiSVG', 'class="inline-emoji');
      }
      return match;
    });
    return html;
  }

  function updateProfileCase(text) {
    const disp = $("#caseDisplay");
    if (!disp) return;
    if (!text || text.trim() === "") {
      disp.hidden = true;
      return;
    }
    disp.hidden = false;
    disp.innerHTML = renderEmojisInText(text);
  }

  function setupCustomization() {
    const pickAudio = $("#pickAudioBtn");
    const pickVideo = $("#pickVideoBtn");
    const audioInput = $("#audioFile");
    const videoInput = $("#videoFile");

    if (pickAudio) pickAudio.addEventListener("click", () => audioInput && audioInput.click());
    if (pickVideo) pickVideo.addEventListener("click", () => videoInput && videoInput.click());

    if (audioInput) audioInput.addEventListener("change", async () => {
      try {
        if (!audioInput.files[0]) return;
        await apiUpload("/api/media/audio", audioInput.files[0]);
        showToast("Звук сохранён.");
        await loadMeAndShowDock();
      } catch (err) {
        showToast(String(err.message || err));
      } finally { audioInput.value = ""; }
    });

    if (videoInput) videoInput.addEventListener("change", async () => {
      try {
        if (!videoInput.files[0]) return;
        await apiUpload("/api/media/video", videoInput.files[0]);
        showToast("Видео сохранено.");
        await loadMeAndShowDock();
      } catch (err) {
        showToast(String(err.message || err));
      } finally { videoInput.value = ""; }
    });

    // Theme Config
    document.querySelectorAll('.colorBtn').forEach(btn => {
      btn.addEventListener('mouseenter', () => {
        document.body.setAttribute('data-theme', btn.dataset.color);
        if (background && background.setThemeColor) background.setThemeColor(btn.dataset.color);
      });
      btn.addEventListener('mouseleave', () => {
        const resetC = (me && me.bgColor) ? me.bgColor : 'default';
        document.body.setAttribute('data-theme', resetC);
        if (background && background.setThemeColor) background.setThemeColor(resetC);
      });
      btn.addEventListener('click', async () => {
        const c = btn.dataset.color;
        document.querySelectorAll('.colorBtn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        
        try {
          await apiJson("/api/profile/update", { method: "POST", body: { bgColor: c } });
          me.bgColor = c;
          applyThemeFromUser(me);
          showToast("Тема обновлена!");
        } catch(e) {
          showToast("Ошибка смены темы");
        }
      });
    });

    // Case Modal
    const caseBtn = $("#createCaseBtn");
    const caseModal = $("#caseModal");
    const caseInp = $("#caseInput");
    const casePrev = $("#casePreview");
    
    if (caseBtn) caseBtn.onclick = () => {
      if(me) caseInp.value = me.caseText || "";
      casePrev.innerHTML = renderEmojisInText(caseInp.value);
      caseModal.classList.remove("hidden");
    };
    
    if (caseInp) caseInp.addEventListener("input", () => {
      casePrev.innerHTML = renderEmojisInText(caseInp.value);
    });
    
    $("#caseCancelBtn")?.addEventListener("click", () => caseModal.classList.add("hidden"));
    $("#caseDoneBtn")?.addEventListener("click", async () => {
      try {
        await apiJson("/api/profile/update", { method: "POST", body: { caseText: caseInp.value } });
        me.caseText = caseInp.value;
        updateProfileCase(me.caseText);
        caseModal.classList.add("hidden");
        showToast("Дело обновлено");
      } catch(e){
        showToast("Ошибка");
      }
    });

    // Emojis
    const emojiM = $("#emojiModal");
    const eg = $("#emojiGrid");
    if (eg && customEmojisHtml) {
      eg.innerHTML = "";
      customEmojisHtml.forEach((svg, i) => {
        const div = document.createElement("div");
        div.className = "emojiItem";
        div.innerHTML = svg;
        div.onclick = () => {
          if (caseInp) {
            const start = caseInp.selectionStart;
            const end = caseInp.selectionEnd;
            const text = caseInp.value;
            caseInp.value = text.substring(0, start) + `[EMOJI_${i}]` + text.substring(end);
            caseInp.dispatchEvent(new Event("input"));
            caseInp.focus();
          }
          emojiM.classList.add("hidden");
        };
        eg.appendChild(div);
      });
    }
    
    $("#emojiBtn")?.addEventListener("click", () => emojiM.classList.remove("hidden"));
    $("#emojiCloseBtn")?.addEventListener("click", () => emojiM.classList.add("hidden"));

    // Avatar Crop logic
    const avBtn = $("#profileAvatarBtn");
    const cropModal = $("#cropModal");
    const cropArea = $(".cropArea");
    const cropCanvas = $("#cropCanvas");
    
    let cropImg = null, sx = 0, sy = 0, scale = 1, isDragging = false, startX, startY;
    
    if (avBtn) avBtn.onclick = () => {
      if (!document.body.classList.contains('is-owner')) return;
      
      const fileInp = document.createElement("input");
      fileInp.type = "file";
      fileInp.accept = "image/*";
      fileInp.onchange = (e) => {
        const f = e.target.files[0];
        if(!f) return;
        const reader = new FileReader();
        reader.onload = (re) => {
          cropImg = new Image();
          cropImg.onload = () => {
            cropModal.classList.remove('hidden');
            // Init canvas
            cropCanvas.width = cropArea.clientWidth;
            cropCanvas.height = cropArea.clientHeight;
            sx = cropCanvas.width / 2;
            sy = cropCanvas.height / 2;
            scale = Math.max(cropCanvas.width / cropImg.width, cropCanvas.height / cropImg.height);
            drawCrop();
          };
          cropImg.src = re.target.result;
        };
        reader.readAsDataURL(f);
      };
      fileInp.click();
    };

    function drawCrop() {
      if(!cropImg) return;
      const ctx = cropCanvas.getContext("2d");
      ctx.clearRect(0,0,cropCanvas.width, cropCanvas.height);
      const w = cropImg.width * scale;
      const h = cropImg.height * scale;
      ctx.drawImage(cropImg, sx - w/2, sy - h/2, w, h);
      
      // dark overlay except center circle
      ctx.fillStyle = "rgba(0,0,0,0.6)";
      ctx.fillRect(0,0,cropCanvas.width, cropCanvas.height);
      ctx.globalCompositeOperation = 'destination-out';
      ctx.beginPath();
      // Circle crop guide
      ctx.arc(cropCanvas.width/2, cropCanvas.height/2, Math.min(cropCanvas.width, cropCanvas.height)/2.2, 0, Math.PI*2);
      ctx.fill();
      ctx.globalCompositeOperation = 'source-over';
    }

    if(cropCanvas) {
      cropCanvas.onmousedown = (e) => { isDragging = true; startX = e.clientX; startY = e.clientY; };
      window.onmouseup = () => { isDragging = false; };
      window.onmousemove = (e) => {
        if(!isDragging || !cropImg) return;
        sx += e.clientX - startX;
        sy += e.clientY - startY;
        startX = e.clientX;
        startY = e.clientY;
        drawCrop();
      };
      cropCanvas.onwheel = (e) => {
        e.preventDefault();
        scale += e.deltaY * -0.001;
        scale = Math.max(0.1, Math.min(scale, 5));
        drawCrop();
      };
    }

    $("#cropResetBtn")?.addEventListener("click", () => {
      cropModal.classList.add("hidden");
      cropImg = null;
    });

    $("#cropDoneBtn")?.addEventListener("click", () => {
        if(!cropImg) return;
        // create final canvas for upload
        const finalCanvas = document.createElement("canvas");
        const cropSize = Math.min(cropCanvas.width, cropCanvas.height);
        finalCanvas.width = 512;
        finalCanvas.height = 512;
        const ctx = finalCanvas.getContext("2d");
        
        const finalScale = 512 / cropSize;
        ctx.fillStyle = "white";
        ctx.fillRect(0,0,512,512);

        // Map sx, sy back to image coordinate offset relative to center
        const imgW = cropImg.width * scale * finalScale;
        const imgH = cropImg.height * scale * finalScale;
        const finalSX = (sx - cropCanvas.width/2) * finalScale + 256;
        const finalSY = (sy - cropCanvas.height/2) * finalScale + 256;
        
        ctx.drawImage(cropImg, finalSX - imgW/2, finalSY - imgH/2, imgW, imgH);
        
        finalCanvas.toBlob(async (blob) => {
          if(!blob) return;
          try {
             const data = await apiUpload("/api/media/avatar", blob);
             me.avatar_path = data.url;
             updateProfileAvatarView(data.url);
             showToast("Аватар сохранен!");
             cropModal.classList.add("hidden");
          } catch(e) {
             showToast("Ошибка загрузки");
          }
        }, "image/jpeg", 0.9);
    });
  }

  let currentParticipants = [];
  let participantsPage = 1;
  const PARTICIPANTS_PER_PAGE = 20;

  async function loadParticipants() {
    const list = $("#participants-list");
    if (!list) return;
    try {
      if (currentParticipants.length === 0) {
        list.innerHTML = '<div class="loading muted">Загрузка данных...</div>';
        const data = await apiJson("/api/users");
        currentParticipants = data.users || [];
      }
      
      list.innerHTML = "";
      if (currentParticipants.length === 0) {
        list.innerHTML = '<div class="muted">Участников пока нет.</div>';
        return;
      }
      
      const startIdx = (participantsPage - 1) * PARTICIPANTS_PER_PAGE;
      const endIdx = startIdx + PARTICIPANTS_PER_PAGE;
      const paginated = currentParticipants.slice(startIdx, endIdx);
      
      const grid = document.createElement("div");
      grid.className = "participant-grid";
      
      paginated.forEach(u => {
        const item = document.createElement("div");
        item.className = "participantCard";
        
        let avatarHtml = `<div class="user-avatar">${u.username.slice(0,1)}</div>`;
        if (u.avatar_path) {
          avatarHtml = `<img src="${u.avatar_path}" class="avatar-img" alt="${u.username}">`;
        }
        
        item.innerHTML = `
          <div class="profileAvatarWrap" style="width: 64px; height: 64px; border-radius: 50%;">
            ${avatarHtml}
          </div>
          <div class="user-name" style="text-align: center;">${u.username}</div>
          <div class="muted mono" style="font-size: 11px;">u/${u.slug}</div>
          <button class="btn ghost minimal view-profile-btn" data-slug="${u.slug}" style="margin-top: auto;">ПРОФИЛЬ</button>
        `;
        
        item.onclick = (e) => {
          if (e.target.tagName !== 'BUTTON') {
            window.history.pushState({}, "", `/profile/${u.slug}`);
            window.location.reload(); 
          }
        };
        
        const btn = item.querySelector(".view-profile-btn");
        if (btn) {
          btn.onclick = (e) => {
            e.stopPropagation();
            window.history.pushState({}, "", `/profile/${btn.dataset.slug}`);
            window.location.reload(); 
          };
        }
        
        grid.appendChild(item);
      });
      
      list.appendChild(grid);
      
      // Pagination controls
      if (currentParticipants.length > PARTICIPANTS_PER_PAGE) {
        const totalPages = Math.ceil(currentParticipants.length / PARTICIPANTS_PER_PAGE);
        const pagWrapper = document.createElement("div");
        pagWrapper.className = "pagination";
        
        if (participantsPage > 1) {
          const prev = document.createElement("button");
          prev.className = "btn ghost minimal";
          prev.textContent = "Назад";
          prev.onclick = () => { participantsPage--; loadParticipants(); };
          pagWrapper.appendChild(prev);
        }
        
        const pageInfo = document.createElement("span");
        pageInfo.className = "muted mono";
        pageInfo.style.alignSelf = "center";
        pageInfo.textContent = `${participantsPage} / ${totalPages}`;
        pagWrapper.appendChild(pageInfo);
        
        if (participantsPage < totalPages) {
          const next = document.createElement("button");
          next.className = "btn ghost minimal";
          next.textContent = "Далее";
          next.onclick = () => { participantsPage++; loadParticipants(); };
          pagWrapper.appendChild(next);
        }
        
        list.appendChild(pagWrapper);
      }
    } catch (err) {
      const msg = err.message === "Database initialization failed" 
        ? "Ошибка: База данных Postgres не подключена в Vercel."
        : `Ошибка: ${err.message}`;
      list.innerHTML = `<div class="error" style="color: #ff3232; padding: 20px; border: 1px solid #ff3232; border-radius: 8px; text-align: center;">${msg}</div>`;
    }
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
      showToast("Профиль создан. Выполняем вход...");
      window.location.reload();
    } catch (e) {
      const msg = String((e && e.message) || e);
      if (msg.indexOf("существует") >= 0 || msg.indexOf("логином") >= 0 || msg.indexOf("409") >= 0) {
        showToast("Логин уже занят. Попробуй другой или нажми «Войти».");
        setAuthMode("login");
        return;
      }
      throw e;
    }
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
  const diversipapa = new Audio("./sounds/diversipapa.mp3");
  diversipapa.volume = 0.2;
  window._diversipapa = diversipapa;

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
        // Play sound effect
        if (diversipapa.paused || diversipapa.currentTime > 0.1) {
          diversipapa.currentTime = 0;
          diversipapa.play().catch(() => {});
        }
        
        // Render text with blinking cursor and holographic jitter
        const currentText = caseText.slice(0, caseTyping.i);
        const cursor = (Math.floor(elapsed / 400) % 2 === 0) ? "|" : " ";
        caseOutput.textContent = currentText + cursor;
        
        // Holographic flicker/lag effect
        if (Math.random() < 0.15) {
          caseOutput.style.opacity = 0.7 + Math.random() * 0.3;
          caseOutput.style.transform = `translate(${(Math.random()-0.5)*2}px, ${(Math.random()-0.5)*2}px)`;
        } else {
          caseOutput.style.opacity = 1;
          caseOutput.style.transform = "";
        }

        if (background && background.pulseGlitch) background.pulseGlitch(110);
      } else {
        // Still blink cursor even if not typing
        const cursor = (Math.floor(elapsed / 400) % 2 === 0) ? "|" : " ";
        caseOutput.textContent = caseText.slice(0, caseTyping.i) + cursor;
      }

      if (caseTyping.i >= caseText.length) {
        caseTyping.running = false;
        caseHint && (caseHint.textContent = "Доступ предоставлен.");
        // Keep cursor blinking for a while
        const finalBlink = () => {
          if (caseTyping.running) return;
          const t = performance.now();
          const cursor = (Math.floor(t / 400) % 2 === 0) ? "|" : " ";
          caseOutput.textContent = caseText + cursor;
          requestAnimationFrame(finalBlink);
        };
        requestAnimationFrame(finalBlink);
        return;
      }
      caseTyping.raf = requestAnimationFrame(step);
    };
    caseTyping.raf = requestAnimationFrame(step);
  }

  if (openCaseBtn) {
    openCaseBtn.addEventListener("click", () => {
      if (background && background.pulseGlitch) background.pulseGlitch(520);
      openCaseBtn.classList.add("is-broken");
      startTypewriter();
    });
  }

    // Apply theme when switching tabs (if user is logged in)
    const originalShowView = showView;
    showView = function(viewName, opts = {}) {
      originalShowView(viewName, opts);
      if (me) applyThemeFromUser(me);
    };

    // ------- Background: dots + lines, hover freeze + glitch
  const background = createNetworkBackground({
    canvas: $("#bg"),
    reducedMotion: prefersReducedMotion,
  });

  // Apply saved theme immediately from localStorage (before API responds)
  try {
    const savedTheme = localStorage.getItem('dv_theme');
    if (savedTheme && savedTheme !== 'default') {
      document.body.setAttribute('data-theme', savedTheme);
      if (background && background.setThemeColor) background.setThemeColor(savedTheme);
    }
  } catch(_) {}

  // ------- Startup
  (async () => {
    try {
      await loadMeAndShowDock();
    } catch (_) {
      // Not logged in
    }
    const curPath = window.location.pathname;
    const view = viewMap[curPath];
    if (view) {
      showView(view, { withGlitch: false });
    } else {
      const pm = profileRe.exec(curPath);
      if (pm) {
        showView("publicProfile", { withGlitch: false });
      } else {
        showView("home", { withGlitch: false });
      }
    }
  })();

  const logoutBtn = $("#headerLogout") || $("#logoutBtn");
  if (logoutBtn) {
    logoutBtn.addEventListener("click", async () => {
      try {
        await apiJson("/api/auth/logout", { method: "POST" });
        try { localStorage.removeItem('dv_theme'); } catch(_) {}
        window.location.reload();
      } catch (err) {
        showToast(err.message);
      }
    });
  }



  // Expose for debugging if needed
  window.__dieversi = { showView };

  // Customization UI is initialized only after successful login (loadMeAndShowDock).

  // ------- DIEVERSI library (removed by user)
  (async () => {
    // Removed
  })();

  // ------- Public profile route: /profile/:slug
  (async () => {
    const m = profileRe.exec(window.location.pathname);
    if (!m) return;
    const slug = m[1].toLowerCase();
    try {
      showView("profile", { withGlitch: false });
      
      const data = await apiJson(`/api/profile/${encodeURIComponent(slug)}`);
      const p = data.profile;
      
      const myLink = $("#profileLinkBox");
      if (myLink) myLink.textContent = `u/${p.slug}`;
      const myUsername = $("#profileUsername");
      // Apply theme for public profile view
      applyThemeFromUser(p);

      if (myUsername && myUsername.querySelector(".glitchTitle__base")) {
        myUsername.dataset.text = p.username;
        myUsername.querySelector(".glitchTitle__base").textContent = p.username;
      }

      setMediaBackground({ videoUrl: p.videoUrl, audioUrl: p.audioUrl });

      if (p.bg_color) {
        document.body.setAttribute('data-theme', p.bg_color);
        if (background && background.setThemeColor) background.setThemeColor(p.bg_color);
      } else {
        document.body.setAttribute('data-theme', 'default');
        if (background && background.setThemeColor) background.setThemeColor('default');
      }

      if (typeof updateProfileAvatarView === 'function') {
        updateProfileAvatarView(p.avatarUrl || p.avatar_path);
      }
      if (typeof updateProfileCase === 'function') {
        updateProfileCase(p.caseText || p.case_text);
      }

      // Check if it's the current user viewing their own profile
      if (me && me.slug === slug) {
        document.body.classList.add("is-owner");
      } else {
        document.body.classList.remove("is-owner");
      }

      const authStage = document.querySelector(".authStage") || document.querySelector("#authCard");
      if (authStage) authStage.classList.add("hidden");
      const profileStage = $("#profileStage");
      if (profileStage) profileStage.classList.remove("hidden");

    } catch (err) {
      showToast(String((err && err.message) || err));
      showView("home", { withGlitch: false });
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

  window.addEventListener("popstate", (e) => {
    const view = (e.state && e.state.view) || viewMap[window.location.pathname] || "home";
    showView(view, { withGlitch: true });
  });

  // Initial routing
  const curPath = window.location.pathname;
  if (viewMap[curPath]) {
    showView(viewMap[curPath], { withGlitch: false });
  }

  // Dynamic Messages
  const dynamicText = $("#dynamicText");
  const messages = ["Привет ?", "Чего еще ждешь ?"];
  let msgIdx = 0;
  window.setInterval(() => {
    if (!dynamicText) return;
    msgIdx = (msgIdx + 1) % messages.length;
    // Glitch effect on update
    dynamicText.style.filter = "blur(10px) contrast(3)";
    setTimeout(() => {
      dynamicText.textContent = messages[msgIdx];
      dynamicText.style.filter = "";
      if (background && background.pulseGlitch) background.pulseGlitch(250);
    }, 200);
  }, 5000);
})();

function createNetworkBackground({ canvas, reducedMotion }) {
  if (!canvas) return null;
  const ctx = canvas.getContext("2d", { alpha: true });
  if (!ctx) return null;

  const themeMap = {
     pink: "255, 120, 150",
     green: "0, 240, 150",
     red: "255, 80, 80",
     purple: "140, 80, 255",
     blue: "80, 180, 255",
     default: "255, 255, 255"
  };

  const state = {
    w: 1, h: 1, dpr: 1,
    mx: -9999, my: -9999,
    slowUntil: 0, glitchUntil: 0,
    particles: [], glows: [],
    lastNow: performance.now(),
    zoom: 1.0,
    targetZoom: 1.0,
    themeRGB: "255, 255, 255"
  };

  const cfg = {
    numParticles: reducedMotion ? 35 : 70,
    linkDist: 180,
    wander: 0.006,
    friction: 0.97,
    maxSpeed: 0.25,
    fieldRadius: 280,
  };

  function resize() {
    state.dpr = Math.min(2, window.devicePixelRatio || 1);
    state.w = window.innerWidth;
    state.h = window.innerHeight;
    canvas.width = Math.floor(state.w * state.dpr);
    canvas.height = Math.floor(state.h * state.dpr);
    ctx.setTransform(state.dpr, 0, 0, state.dpr, 0, 0);

    // Initial particles if empty
    if (state.particles.length === 0) {
      for (let i = 0; i < cfg.numParticles; i++) {
        state.particles.push(makeParticle());
      }
      // Clumped white glows
      for (let i = 0; i < 5; i++) {
        state.glows.push({
          x: Math.random() * state.w,
          y: Math.random() * state.h,
          vx: (Math.random() - 0.5) * 0.2,
          vy: (Math.random() - 0.5) * 0.2,
          size: 400 + Math.random() * 400,
          opacity: 0.04 + Math.random() * 0.04
        });
      }
    }
  }

  function setPointer(x, y) { state.mx = x; state.my = y; }
  function freezeFor(ms) { state.slowUntil = performance.now() + ms; }
  function pulseGlitch(ms) { state.glitchUntil = performance.now() + ms; }
  function setZoom(zoomed) { state.targetZoom = zoomed ? 1.8 : 1.0; }
  function setThemeColor(c) { state.themeRGB = themeMap[c] || "255, 255, 255"; }

  function makeParticle() {
    return {
      x: (Math.random() - 0.5) * 1600,
      y: (Math.random() - 0.5) * 1600,
      z: (Math.random() - 0.5) * 1200,
      vx: (Math.random() - 0.5) * 1.5,
      vy: (Math.random() - 0.5) * 1.5,
      vz: (Math.random() - 0.5) * 1.2,
      rotX: Math.random() * Math.PI,
      rotY: Math.random() * Math.PI,
      rotZ: Math.random() * Math.PI,
      vRotX: (Math.random() - 0.5) * 0.02,
      vRotY: (Math.random() - 0.5) * 0.02,
      vRotZ: (Math.random() - 0.5) * 0.02,
      kind: ["cube", "pyramid", "octa"][Math.floor(Math.random() * 3)],
      size: 15 + Math.random() * 15,
      hover: 0
    };
  }

  function project(p) {
    const fov = 600;
    const z = p.z + 1200;
    const s = (fov * state.zoom) / z;
    return {
      x: state.w / 2 + p.x * s,
      y: state.h / 2 + p.y * s,
      s
    };
  }

  function drawShape(p, pr) {
    const size = p.size * pr.s;
    const isHover = p.hover > 0.1;
    const alpha = (0.2 + (p.z + 600) / 1200 * 0.6) * (isHover ? 1 : 0.8);

    const models = {
      cube: {
        v: [[-1,-1,-1],[1,-1,-1],[1,1,-1],[-1,1,-1],[-1,-1,1],[1,-1,1],[1,1,1],[-1,1,1]],
        e: [[0,1],[1,2],[2,3],[3,0],[4,5],[5,6],[6,7],[7,4],[0,4],[1,5],[2,6],[3,7]]
      },
      pyramid: {
        v: [[0,-1,0],[-1,1,-1],[1,1,-1],[0,1,1]],
        e: [[0,1],[0,2],[0,3],[1,2],[2,3],[3,1]]
      },
      octa: {
        v: [[0,1,0],[0,-1,0],[1,0,0],[-1,0,0],[0,0,1],[0,0,-1]],
        e: [[0,2],[0,3],[0,4],[0,5],[1,2],[1,3],[1,4],[1,5],[2,4],[4,3],[3,5],[5,2]]
      }
    };

    const m = models[p.kind];
    const pts = m.v.map(v => {
      let x = v[0], y = v[1], z = v[2];
      const rx = p.rotX, ry = p.rotY, rz = p.rotZ;
      // Rot X
      let t = y * Math.cos(rx) - z * Math.sin(rx);
      z = y * Math.sin(rx) + z * Math.cos(rx); y = t;
      // Rot Y
      t = x * Math.cos(ry) + z * Math.sin(ry);
      z = -x * Math.sin(ry) + z * Math.cos(ry); x = t;
      // Rot Z
      t = x * Math.cos(rz) - y * Math.sin(rz);
      y = x * Math.sin(rz) + y * Math.cos(rz); x = t;

      return { x: pr.x + x * size, y: pr.y + y * size };
    });

    ctx.strokeStyle = isHover ? `rgba(${state.themeRGB},${0.4 + p.hover * 0.6})` : `rgba(${state.themeRGB},${alpha})`;
    ctx.lineWidth = (isHover ? 2 : 1) * pr.s;
    if (isHover) {
      ctx.shadowBlur = 15 * p.hover;
      ctx.shadowColor = "white";
    }

    m.e.forEach(e => {
      ctx.beginPath();
      ctx.moveTo(pts[e[0]].x, pts[e[0]].y);
      ctx.lineTo(pts[e[1]].x, pts[e[1]].y);
      ctx.stroke();
    });
    ctx.shadowBlur = 0;
  }

  function draw() {
    const now = performance.now();
    const dt = (now - state.lastNow) / 16.66;
    state.lastNow = now;

    const isSlow = now < state.slowUntil;
    const speedK = isSlow ? 0.4 : 1.0;

    // Zoom interpolation
    state.zoom += (state.targetZoom - state.zoom) * 0.05 * dt;

    ctx.clearRect(0, 0, state.w, state.h);

    // DRAW WHITE GLOW CLUMPS
    state.glows.forEach(g => {
      g.x += g.vx * dt; g.y += g.vy * dt;
      if (g.x < -g.size) g.x = state.w + g.size;
      if (g.x > state.w + g.size) g.x = -g.size;
      if (g.y < -g.size) g.y = state.h + g.size;
      if (g.y > state.h + g.size) g.y = -g.size;

      const grd = ctx.createRadialGradient(g.x, g.y, 0, g.x, g.y, g.size);
      grd.addColorStop(0, `rgba(${state.themeRGB},${g.opacity})`);
      grd.addColorStop(1, `rgba(${state.themeRGB},0)`);
      ctx.fillStyle = grd;
      ctx.fillRect(0, 0, state.w, state.h);
    });

    // Physics & Projection
    const projected = state.particles.map(p => {
      p.x += p.vx * dt * speedK;
      p.y += p.vy * dt * speedK;
      p.z += p.vz * dt * speedK;
      if (p.x < -1000) p.x = 1000; if (p.x > 1000) p.x = -1000;
      if (p.y < -1000) p.y = 1000; if (p.y > 1000) p.y = -1000;
      if (p.z < -600) p.z = 600; if (p.z > 600) p.z = -600;

      p.rotX += p.vRotX * dt * speedK;
      p.rotY += p.vRotY * dt * speedK;
      p.rotZ += p.vRotZ * dt * speedK;

      const pr = project(p);
      const dx = state.mx - pr.x;
      const dy = state.my - pr.y;
      if (Math.hypot(dx, dy) < 100) p.hover += (1 - p.hover) * 0.1;
      else p.hover *= 0.94;

      return pr;
    });

    // Draw lines
    ctx.lineWidth = 0.5;
    for (let i = 0; i < state.particles.length; i++) {
       for (let j = i + 1; j < state.particles.length; j++) {
         const p1 = state.particles[i], p2 = state.particles[j];
         const d = Math.hypot(p1.x-p2.x, p1.y-p2.y, p1.z-p2.z);
         if (d < cfg.linkDist) {
           ctx.strokeStyle = `rgba(${state.themeRGB},${(1 - d/cfg.linkDist) * 0.15})`;
           ctx.beginPath();
           ctx.moveTo(projected[i].x, projected[i].y);
           ctx.lineTo(projected[j].x, projected[j].y);
           ctx.stroke();
         }
       }
    }

    // Draw shapes
    state.particles.forEach((p, i) => drawShape(p, projected[i]));

    requestAnimationFrame(draw);
  }

  resize();
  window.addEventListener("resize", resize);
  draw();

  return { setPointer, freezeFor, pulseGlitch, setZoom, setThemeColor };
}
