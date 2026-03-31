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
    "/shop": "shop",
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
  const navIndicator = $("#navIndicator");

  const avatarInput = $("#avatarFile");
  const audioInput = $("#audioFile");

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

    // Automatically sync indicator whenever the nav bar changes size (hover expansion/shrink)
    const navObserver = new ResizeObserver(() => {
      setActiveNav(currentViewName);
    });
    navObserver.observe(mainNav);
  }

  // ------- Navigation + Glitch transitions
  function setActiveNav(viewName) {
    const activeBtn = navBtns.find((b) => b.dataset.nav === viewName);
    navBtns.forEach((b) => b.classList.toggle("is-active", b === activeBtn));
    
    if (activeBtn && navIndicator) {
      const rect = activeBtn.getBoundingClientRect();
      const parentRect = mainNav.getBoundingClientRect();
      if (rect.width > 0) {
        navIndicator.style.width = `${rect.width}px`;
        navIndicator.style.height = `${rect.height}px`;
        navIndicator.style.left = `${rect.left - parentRect.left}px`;
        navIndicator.style.top = `${rect.top - parentRect.top}px`;
        navIndicator.classList.add("is-visible");
      }
    }

    if (burgerBtn && mainNav) {
      burgerBtn.classList.remove("is-open");
      mainNav.classList.remove("is-open");
    }
  }

  let transitioning = false;
  let me = null;
  async function loadMeAndShowDock() {
    console.log("loadMeAndShowDock called");
    try {
      const resp = await fetch("/api/me");
      if (!resp.ok) throw new Error();
      const data = await resp.json();
      me = data.user;
      
      if (me) {
        document.body.setAttribute('data-background', me.activeBackground || 'HOLO');
        if (background && background.setThemeColor) background.setThemeColor(me.bgColor || 'default');
        
        const headerUser = $("#headerUser");
        if (headerUser) {
          headerUser.classList.remove("hidden");
          const av = headerUser.querySelector(".headerAvatar");
          if (av) {
            const avPath = me.avatarUrl || me.avatar_path;
            av.style.backgroundImage = avPath ? `url(${avPath})` : 'none';
          }
          const lg = headerUser.querySelector("#headerLogin");
          if (lg) lg.textContent = me.login;
          const bal = headerUser.querySelector("#balanceValue");
          if (bal) bal.textContent = `${me.balance_l || 0} L`;
        }
        
        $("#shopBtn")?.classList.remove("hidden");
        if (currentViewName === 'shop') renderShop();
        
        if (currentViewName === 'profile' || currentViewName === 'home') {
          updateProfileAvatarView(me.avatarUrl || me.avatar_path);
          updateProfileCase(me.caseText);
          const myLink = $("#profileLinkBox");
          if (myLink) myLink.textContent = `u/${me.slug}`;
          const myUsername = $("#profileUsername");
          if (myUsername && myUsername.querySelector(".glitchTitle__base")) {
            myUsername.dataset.text = me.username;
            myUsername.querySelector(".glitchTitle__base").textContent = me.username;
          }
          document.body.classList.add("is-owner");
          const authCard = $("#authCard") || document.querySelector(".authStage");
          if (authCard) authCard.classList.add("hidden");
          const profileStage = $("#profileStage");
          if (profileStage) profileStage.classList.remove("hidden");
          
          updateMediaResetButtons(me, true);
          if (!customizationReady) {
            customizationReady = true;
            setupCustomization();
          }
        }
      } else {
        $("#headerUser")?.classList.add("hidden");
        $("#shopBtn")?.classList.add("hidden");
      }
    } catch(e) { console.error("loadMe error:", e); me = null; }
  }

  window.renderShop = async function() {
    const list = $("#shop-list");
    if (!list) return;
    list.innerHTML = "";
    const items = [{ id: "BLACK_HOLE", name: "Black Hole Theme", price: 1500, desc: "A premium singularity background with particle physics." }];
    items.forEach(item => {
      const card = document.createElement("div");
      card.className = "card glass shopItem widget-animated shop-card";
      const isOwned = me && me.ownedBackgrounds && me.ownedBackgrounds.includes(item.id);
      card.innerHTML = `
        <div class="cardTitle" style="font-size: 14px;">${item.name}</div>
        <div class="muted mono mb-10" style="font-size: 11px;">${item.desc}</div>
        <div class="row between">
          <span class="mono">${item.price} L</span>
          <button class="btn primary minimal buyBtn" ${isOwned ? 'disabled' : ''}>${isOwned ? 'КУПЛЕНО' : 'КУПИТЬ'}</button>
        </div>`;
      
      card.onmouseenter = () => { if (background) document.body.setAttribute('data-background', item.id); };
      card.onmouseleave = () => { if (background) document.body.setAttribute('data-background', me ? (me.activeBackground || 'HOLO') : 'HOLO'); };
      
      const btn = card.querySelector(".buyBtn");
      if (btn && !isOwned) {
        btn.onclick = async () => {
          try {
            await apiJson("/api/shop/buy", { method: "POST", body: { itemId: item.id } });
            showToast("Приобретено!");
            await loadMeAndShowDock();
            renderShop();
          } catch(e) { showToast(e.message); }
        };
      }
      list.appendChild(card);
      requestAnimationFrame(() => card.classList.add("is-visible"));
    });
  };

  function initGlobalUI() {
    const replenishBtn = $("#replenishBtn");
    if (replenishBtn) {
      replenishBtn.onclick = () => {
        const modal = $("#rechargeModal");
        if (modal) modal.classList.remove("hidden");
      };
    }
    const rechargeCloseX = $("#rechargeCloseX");
    if (rechargeCloseX) rechargeCloseX.onclick = () => $("#rechargeModal")?.classList.add("hidden");
    const bgCloseX = $("#bgCloseX");
    if (bgCloseX) bgCloseX.onclick = () => $("#bgModal")?.classList.add("hidden");
    
    const redeemBtn = $("#redeemCodeBtn");
    if (redeemBtn) {
      redeemBtn.onclick = async () => {
        const lCodeInput = $("#lCodeInput");
        const code = lCodeInput?.value.trim();
        if (!code) return showToast("Введите код");
        try {
          const res = await apiJson("/api/currency/redeem", { method: "POST", body: { code } });
          showToast(res.message);
          $("#rechargeModal")?.classList.add("hidden");
          if(lCodeInput) lCodeInput.value = "";
          await loadMeAndShowDock();
        } catch (e) { showToast(e.message); }
      };
    }
    
    const bgSettingsBtn = $("#bgSettingsBtn");
    if (bgSettingsBtn) {
       bgSettingsBtn.onclick = () => {
         if (!me) {
           showToast("Войдите в профиль");
           return;
         }
         const modal = $("#bgModal");
         const list = $("#ownedBgList");
         if (!modal || !list) return;
         
         list.innerHTML = "";
         const owned = me.ownedBackgrounds || ["HOLO"];
         const allBgs = [
           { id: "HOLO", name: "Голограф (HOLO)", desc: "Стандартный фон с летающими фигурами" },
           { id: "BLACK_HOLE", name: "Черная Дыра (BLACK HOLE)", desc: "Цифровая сингулярность, втягивающая материю" }
         ];

         allBgs.forEach(bg => {
           if (!owned.includes(bg.id)) return;
           
           const item = document.createElement("div");
           item.className = "bgListItem " + (me.activeBackground === bg.id ? "is-active" : "");
           item.innerHTML = `
             <div class="bgInfo">
               <div class="bgName mono">${bg.name}</div>
               <div class="bgDesc muted">${bg.desc}</div>
             </div>
             <button class="btn primary minimal selectBgBtn">${me.activeBackground === bg.id ? 'ВЫБРАНО' : 'ВЫБРАТЬ'}</button>
           `;
           
           const btn = item.querySelector(".selectBgBtn");
           if (btn && me.activeBackground !== bg.id) {
             btn.onclick = async () => {
               try {
                 await apiJson("/api/background/set", { method: "POST", body: { backgroundId: bg.id } });
                 showToast("Фон обновлен");
                 me.activeBackground = bg.id;
                 document.body.setAttribute('data-background', bg.id);
                 modal.classList.add("hidden");
                 // Refresh UI if needed or just let the background script react to data-background
               } catch(e) { showToast(e.message); }
             };
           }
           list.appendChild(item);
         });
         modal.classList.remove("hidden");
       };
    }
  }
  initGlobalUI();

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

  function showView(viewName, { withGlitch = true, originEl = null } = {}) {
    const doIt = () => {
      let rect = null;
      if (originEl) {
        rect = originEl.getBoundingClientRect();
      }

      views.forEach((v) => {
        const isActive = v.dataset.view === viewName;
        v.classList.toggle("is-active", isActive);
        
        if (isActive) {
          if (rect) {
            const x = rect.left + rect.width / 2;
            const y = rect.top + rect.height / 2;
            v.style.setProperty("--reveal-x", x + "px");
            v.style.setProperty("--reveal-y", y + "px");

            // --- Widget Stagger Animation ---
            let widgets = Array.from(v.querySelectorAll(".card, .glitchCard, .glass-card, .discord-card, .user-item, .profileWidget, .customDock__card, .customPanel, .dieversiInfo, .id-card, .authCard, .participant-grid"));
            
            // Initial setup and calculate origin distances
            widgets.forEach((w) => {
              w.classList.add("widget-animated");
              w.classList.remove("is-visible");
              
              const wRect = w.getBoundingClientRect();
              
              // Delta to ensure they start perfectly at the button's position
              // We calculate difference between widget center and button center
              const dx = (rect.left + rect.width / 2) - (wRect.left + wRect.width / 2);
              const dy = (rect.top + rect.height / 2) - (wRect.top + wRect.height / 2);
              
              w.style.setProperty("--dx", `${dx}px`);
              w.style.setProperty("--dy", `${dy}px`);
              w.dataset.topPos = wRect.top; // Save for sorting
            });

            // Sort top-to-bottom to create a vertical waterfall effect
            widgets.sort((a, b) => parseFloat(a.dataset.topPos) - parseFloat(b.dataset.topPos));

            // Trigger stagger in next frames
            requestAnimationFrame(() => {
              widgets.forEach((w, i) => {
                setTimeout(() => {
                  w.classList.add("is-visible");
                }, i * 150); // Slower stagger for deliberate top-to-bottom effect
              });
            });

          } else {
            v.style.setProperty("--reveal-x", "50%");
            v.style.setProperty("--reveal-y", "0%");
            
            // Simple show if no origin provided
            const widgets = v.querySelectorAll(".card, .glitchCard, .glass-card, .discord-card, .user-item, .profileWidget, .customDock__card, .customPanel, .dieversiInfo, .id-card, .authCard, .participant-grid");
            widgets.forEach(w => {
              w.classList.remove("widget-animated");
              w.classList.add("is-visible");
            });
          }
        }
      });
      setActiveNav(viewName);
      currentViewName = viewName;

      // Update URL
      const routeMap = {
        home: "/",
        participants: "/participants",
        profile: "/profile",
        shop: "/shop",
        dieversi: "/dieversi",
        discord: "/discord"
      };
      
      const path = routeMap[viewName];
      if (path && window.location.pathname !== path) {
        // Drop the slug and navigate to base /profile if user actively clicked the nav button.
        // During initial page load (originEl is null), keep the slug in URL.
        if (!(viewName === "profile" && !originEl && window.location.pathname.startsWith("/profile/"))) {
          window.history.pushState({ view: viewName }, "", path);
        }
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

      // Reset theme to user's personal theme when NOT viewing a public profile
      if (viewName !== "profile") {
        applyThemeFromUser(me);
      }

      // Show correct stage when entering profile tab
      if (viewName === "profile") {
        const authCard_ = $("#authCard");
        const profileStage_ = $("#profileStage");
        
        let targetSlug = null;
        const m = profileRe.exec(window.location.pathname);
        if (m) targetSlug = m[1];

        // If we are logged in and no slug is provided, or the slug is our own:
        if (me && (!targetSlug || targetSlug === me.slug)) {
          authCard_.classList.add("hidden");
          profileStage_.classList.remove("hidden");
          document.body.classList.add("is-owner");
          
          updateProfileAvatarView(me.avatarUrl || me.avatar_path);
          updateProfileCase(me.caseText);
          applyThemeFromUser(me);
          
          const myLink = $("#profileLinkBox");
          if (myLink) myLink.textContent = `u/${me.slug}`;
          const myUsername = $("#profileUsername");
          if (myUsername && myUsername.querySelector(".glitchTitle__base")) {
            myUsername.dataset.text = me.username;
            myUsername.querySelector(".glitchTitle__base").textContent = me.username;
          }

          // --- Media Reset Buttons (Owner only) ---
          updateMediaResetButtons(me, true);
        } else if (targetSlug) {
          // Public profile view
          authCard_.classList.add("hidden");
          profileStage_.classList.remove("hidden");
          document.body.classList.remove("is-owner");
          fetchPublicProfile(targetSlug);
        } else {
          // Not logged in and no slug
          authCard_.classList.remove("hidden");
          profileStage_.classList.add("hidden");
          document.body.classList.remove("is-owner");
        }
      }

      if (viewName === "participants") {
        loadParticipants();
      }

      if (viewName === "dieversi") {
        applyDieversiMediaIfPossible();
      }

      if (viewName === "shop") {
        renderShop();
      }

      // Shop tab reveal logic
      const shopBtn = $("#shopBtn");
      if (shopBtn) {
        if (me && (viewName === "profile" || viewName === "shop")) {
          shopBtn.classList.remove("hidden");
          requestAnimationFrame(() => shopBtn.classList.add("is-revealed"));
        } else {
          shopBtn.classList.remove("is-revealed");
          setTimeout(() => {
            if (!shopBtn.classList.contains("is-revealed")) shopBtn.classList.add("hidden");
          }, 500);
        }
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
    btn.addEventListener("click", (e) => showView(btn.dataset.nav, { originEl: e.currentTarget }));
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
      throw new Error("Откройте сайт через сервер (например: http://localhost:3000), а не file://");
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

  async function apiUpload(url, file, fieldName = "file") {
    if (isFileProtocol) {
      throw new Error("Откройте сайт через сервер (например: http://localhost:3000), а не file://");
    }
    const fd = new FormData();
    fd.append(fieldName, file);
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
  function setMediaBackground({ audioUrl } = {}) {
    const audio = $("#profileAudioBg");

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

  function updateMediaResetButtons(u, isOwner) {
    const infoBox = $(".profileInfoWrap");
    if (!infoBox) return;

    // Clear existing special reset buttons first
    const existingAv = $("#resetAvatarBtn");
    if (existingAv) existingAv.remove();
    const existingMus = $("#resetMusicBtn");
    if (existingMus) existingMus.remove();

    if (!isOwner) return;

    // Reset Avatar Button
    if (u.avatar_path || u.avatarUrl) {
      const btn = document.createElement("button");
      btn.id = "resetAvatarBtn";
      btn.className = "reset-av-btn";
      btn.textContent = "Сбросить аватар";
      btn.onclick = async () => {
        if (!confirm("Удалить аватар?")) return;
        try {
          await apiJson("/api/media/avatar", { method: "DELETE" });
          u.avatar_path = null; u.avatarUrl = null;
          updateProfileAvatarView(null);
          updateMediaResetButtons(u, true);
          showToast("Аватар сброшен");
        } catch(e) { showToast("Ошибка"); }
      };
      infoBox.appendChild(btn);
    }

    // Reset Music Button
    if (u.audio_path || u.audioUrl) {
      const btn = document.createElement("button");
      btn.id = "resetMusicBtn";
      btn.className = "reset-music-btn";
      btn.textContent = "Сбросить музыку";
      btn.onclick = async () => {
        if (!confirm("Удалить музыку?")) return;
        try {
          await apiJson("/api/media/audio", { method: "DELETE" });
          u.audio_path = null; u.audioUrl = null;
          setMediaBackground({ audioUrl: null });
          updateMediaResetButtons(u, true);
          showToast("Музыка удалена");
        } catch(e) { showToast("Ошибка"); }
      };
      infoBox.appendChild(btn);
    }
  }

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
    const bg = u.activeBackground || 'HOLO';
    document.body.setAttribute('data-theme', theme);
    document.body.setAttribute('data-background', bg);
    if (background && background.setThemeColor) background.setThemeColor(theme);
    // persist to localStorage so it survives page reload
    try { 
      if (theme !== 'default') localStorage.setItem('dv_theme', theme); 
    } catch(_){}
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
    const av = $("#headerUser")?.querySelector(".headerAvatar");
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

  async function fetchPublicProfile(slug) {
    try {
      const data = await apiJson(`/api/profile/${slug}`);
      const u = data.profile;
      if (!u) throw new Error("Пользователь не найден");

      const profileUsername = $("#profileUsername");
      if (profileUsername) {
        profileUsername.dataset.text = u.username;
        const base = profileUsername.querySelector(".glitchTitle__base");
        if (base) base.textContent = u.username;
      }
      const profileLinkBox = $("#profileLinkBox");
      if (profileLinkBox) profileLinkBox.textContent = `u/${u.slug}`;

      // Remove reset button from public profile (just in case)
      const oldBtn = $("#resetAvatarBtn");
      if (oldBtn) oldBtn.remove();

      updateProfileAvatarView(u.avatarUrl || u.avatar_path);
      updateProfileCase(u.caseText);
      renderIntegrations(u);
      applyThemeFromUser(u);
      setMediaBackground({ audioUrl: u.audioUrl || u.audio_path });
      updateMediaResetButtons(u, false); // No resets on public view
    } catch (err) {
      showToast("Ошибка загрузки профиля");
      console.error(err);
    }
  }

  const integrationIcons = {
    discord: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.196.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.06.06 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.419 0 1.334-.947 2.419-2.157 2.419zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.419 0 1.334-.946 2.419-2.157 2.419z"/></svg>',
    telegram: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.894 8.221l-1.97 9.28c-.145.658-.537.818-1.084.508l-3-2.21-1.446 1.394c-.14.14-.24.24-.44.24l.197-2.97 5.46-4.937c.23-.204-.05-.316-.35-.115l-6.75 4.25-2.88-.9c-.626-.196-.64-.627.13-.927l11.272-4.346c.52-.196.974.116.821.821z"/></svg>',
    steam: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 0C5.373 0 0 5.373 0 12c0 1.25.19 2.45.54 3.58l6.43 2.65c.54-.37 1.2-.59 1.91-.59.06 0 .12 0 .18.01L11.93 13.5v-.01c0-2.495 2.028-4.524 4.524-4.524 2.494 0 4.524 2.031 4.524 4.527s-2.03 4.525-4.524 4.525h-.105l-4.076 2.911c0 .052.004.105.004.159 0 1.875-1.515 3.396-3.39 3.396-1.635 0-3.016-1.173-3.331-2.727L.436 15.27C1.862 20.307 6.486 24 11.979 24c6.627 0 11.999-5.373 11.999-12S18.605 0 11.979 0zM7.54 18.21l-1.473-.61c.262.543.714.999 1.314 1.25 1.297.539 2.793-.076 3.332-1.375.263-.63.264-1.319.005-1.949s-.75-1.121-1.377-1.383c-.624-.26-1.29-.249-1.878-.03l1.523.63c.956.4 1.409 1.5 1.009 2.455-.397.957-1.497 1.41-2.454 1.012H7.54zm11.415-9.303c0-1.662-1.353-3.015-3.015-3.015-1.665 0-3.015 1.353-3.015 3.015 0 1.665 1.35 3.015 3.015 3.015 1.663 0 3.015-1.35 3.015-3.015zm-5.273-.005c0-1.252 1.013-2.266 2.265-2.265 1.249 0 2.266 1.014 2.266 2.266 0 1.251-1.017 2.265-2.266 2.265-1.252 0-2.265-1.014-2.265-2.265z"/></svg>',
    faceit: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M22.091 4.704l-3.076-.118c-.066-.002-.132.046-.145.111L18.01 8.892c-.013.065.035.127.1.128l3.077.01c.065.001.125-.046.13-.111l.93-4.104c.015-.065-.034-.124-.13-.11l.001-.001zm-4.316 14.152l-3.077-.118c-.066-.002-.132.046-.145.11l-.887 4.196c-.013.065.035.127.1.128l3.077.01c.065.001.125-.046.13-.11l.93-4.103c.015-.066-.034-.124-.129-.111l-.001-.002zM15.357 9.796l-3.076-.118c-.066-.002-.132.046-.145.111l-.887 4.195c-.013.065.035.127.1.128l3.077.01c.065.001.126-.046.131-.111l.923-4.076c.015-.065-.034-.124-.129-.11l.006-.029z"/></svg>',
    instagram: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 0C8.74 0 8.333.015 7.053.072 5.775.132 4.905.333 4.14.63c-.789.306-1.459.717-2.126 1.384S.935 3.35.63 4.14C.333 4.905.131 5.775.072 7.053.012 8.333 0 8.74 0 12s.012 3.667.072 4.947c.06 1.277.261 2.148.558 2.913.306.788.717 1.459 1.384 2.126.667.666 1.336 1.079 2.126 1.384.766.296 1.636.499 2.913.558C8.333 23.988 8.74 24 12 24s3.667-.012 4.947-.072c1.277-.06 2.148-.262 2.913-.558.788-.306 1.459-.718 2.126-1.384.666-.667 1.079-1.335 1.384-2.126.296-.765.499-1.636.558-2.913.06-1.28.072-1.687.072-4.947s-.015-3.333-.072-4.613c-.06-1.277-.262-2.147-.558-2.913-.306-.789-.718-1.459-1.384-2.126C21.334.935 20.665.522 19.875.217c-.765-.306-1.636-.499-2.913-.558C15.667.012 15.26 0 12 0zm0 2.16c3.203 0 3.584.016 4.85.071 1.17.055 1.805.249 2.227.415.562.217.96.477 1.382.896.419.42.679.819.896 1.381.164.422.36 1.057.413 2.227.057 1.266.07 1.646.07 4.85s-.015 3.584-.071 4.85c-.055 1.17-.249 1.805-.415 2.227-.217.562-.477.96-.896 1.382-.419.419-.818.679-1.381.896-.422.164-1.056.36-2.227.413-1.266.057-1.646.07-4.85.07s-3.584-.015-4.85-.071c-1.17-.055-1.805-.249-2.227-.415-.562-.217-.96-.477-1.382-.896-.419-.419-.679-.818-.896-1.381-.164-.422-.36-1.056-.413-2.227-.057-1.266-.07-1.646-.07-4.85s.015-3.584.071-4.85c.055-1.17.249-1.805.415-2.227.217-.562.477-.96.896-1.382.419-.419.818-.679 1.381-.896.422-.164 1.056-.36 2.227-.413 1.266-.057 1.646-.07 4.85-.07zM12 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z"/></svg>',
    twitch: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M11.571 4.714h1.715v5.143H11.57zm4.715 0H18v5.143h-1.714zM6 0L1.714 4.286v15.428h5.143V24l4.286-4.286h3.428L22.286 12V0zm14.571 11.143l-3.428 3.428h-3.429l-3 3v-3H6.857V1.714h13.714Z"/></svg>'
  };

  function renderIntegrations(u) {
    const box = $("#profileIntegrations");
    if (!box) return;
    box.innerHTML = "";

    const services = [
      { id: "discordUser", name: "discord", format: (v) => v },
      { id: "telegramUser", name: "telegram", format: (v) => v },
      { id: "steamUrl", name: "steam", link: true },
      { id: "faceitUrl", name: "faceit", link: true },
      { id: "instagramUrl", name: "instagram", link: true },
      { id: "twitchUrl", name: "twitch", link: true }
    ];

    services.forEach(s => {
      const val = u[s.id];
      if (!val) return;

      const link = document.createElement("a");
      link.className = `integrationLink ${s.name}`;
      if (s.link) {
        link.href = val.startsWith("http") ? val : `https://${val}`;
        link.target = "_blank";
      } else {
        link.href = "javascript:void(0)";
      }

      const icon = document.createElement("div");
      icon.className = `integrationIcon ${s.name}`;
      icon.innerHTML = integrationIcons[s.name];
      link.appendChild(icon);

      if (s.format) {
        const text = document.createElement("span");
        text.textContent = s.format(val);
        link.appendChild(text);
      }

      box.appendChild(link);
    });
  }

  function setupCustomization() {
    const pickAvatar = $("#profileAvatarBtn");
    const pickAudio = $("#pickAudioBtn");

    if (pickAvatar && avatarInput && !pickAvatar.dataset.initialized) {
      pickAvatar.dataset.initialized = "true";
      pickAvatar.addEventListener("click", (e) => {
        // Prevent click if clicking the delete button specifically
        if (e.target.closest("#removeAvatarBtn")) return;
        avatarInput.click();
      });
    }

    if (avatarInput && !avatarInput.dataset.initialized) {
      avatarInput.dataset.initialized = "true";
      avatarInput.addEventListener("change", async () => {
        try {
          if (!avatarInput.files[0]) return;
          showToast("Загрузка аватара...");
          const data = await apiUpload("/api/media/avatar", avatarInput.files[0], "avatar");
          showToast("Аватар сохранен!");
          if (me) {
            me.avatar_path = data.avatar_url;
            updateProfileAvatarView(me.avatar_url);
            updateMediaResetButtons(me, true);
          }
        } catch (err) {
          showToast(String(err.message || err));
        } finally { avatarInput.value = ""; }
      });
    }

    if (pickAudio && audioInput && !pickAudio.dataset.initialized) {
      pickAudio.dataset.initialized = "true";
      pickAudio.addEventListener("click", () => audioInput.click());
    }

    const openInt = $("#openIntegrationsBtn");
    const closeInt = $("#closeIntegrationsBtn");
    const modalInt = $("#integrationsModal");
    const saveInt = $("#saveIntegrationsBtn");

    if (openInt && modalInt && !openInt.dataset.initialized) {
       openInt.dataset.initialized = "true";
       openInt.onclick = () => {
         // Populate inputs
         if (me) {
           $("#input_discord_user").value = me.discordUser || "";
           $("#input_telegram_user").value = me.telegramUser || "";
           $("#input_steam_url").value = me.steamUrl || "";
           $("#input_faceit_url").value = me.faceitUrl || "";
           $("#input_instagram_url").value = me.instagramUrl || "";
           $("#input_twitch_url").value = me.twitchUrl || "";
         }
         modalInt.classList.remove("hidden");
       };
    }

    if (closeInt && modalInt && !closeInt.dataset.initialized) {
       closeInt.dataset.initialized = "true";
       closeInt.onclick = () => modalInt.classList.add("hidden");
    }

    if (saveInt && !saveInt.dataset.initialized) {
       saveInt.dataset.initialized = "true";
       saveInt.onclick = async () => {
         const discord = $("#input_discord_user").value.toLowerCase().trim();
         const telegram = $("#input_telegram_user").value.toLowerCase().trim();
         
         const regex = /^[a-z0-9_.]*$/;
         if (!regex.test(discord) || !regex.test(telegram)) {
           showToast("Логин Discord/Telegram только на англ. (без капса)");
           return;
         }

         try {
           showToast("Сохранение...");
           const updateData = {
              discordUser: discord || null,
              telegramUser: telegram || null,
              steamUrl: $("#input_steam_url").value.trim() || null,
              faceitUrl: $("#input_faceit_url").value.trim() || null,
              instagramUrl: $("#input_instagram_url").value.trim() || null,
              twitchUrl: $("#input_twitch_url").value.trim() || null
           };
           await apiJson("/api/profile/update", { method: "POST", body: updateData });
           
           if (me) {
             Object.assign(me, updateData);
             renderIntegrations(me);
           }
           showToast("Интеграции сохранены!");
           modalInt.classList.add("hidden");
         } catch(e) { showToast("Ошибка сохранения"); }
       };
    }

    if (audioInput && !audioInput.dataset.initialized) {
      audioInput.dataset.initialized = "true";
      audioInput.addEventListener("change", async () => {
        try {
          if (!audioInput.files[0]) return;
          showToast("Загрузка музыки...");
          const data = await apiUpload("/api/media/audio", audioInput.files[0], "audio");
          showToast("Звук сохранен.");
          if (me) {
            me.audio_path = data.audio_url;
            setMediaBackground({ audioUrl: me.audio_path });
            updateMediaResetButtons(me, true);
          }
        } catch (err) {
          showToast(String(err.message || err));
        } finally { audioInput.value = ""; }
      });
    }

    // --- Removal Logic moved to updateMediaResetButtons helper ---


    
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
        showToast("Статус обновлен");
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
             const data = await apiUpload("/api/media/avatar", blob, "avatar");
             me.avatar_path = data.avatarUrl;
             updateProfileAvatarView(data.avatarUrl);
             updateMediaResetButtons(me, true);
             showToast("Аватар сохранен!");
             cropModal.classList.add("hidden");
          } catch(e) {
             showToast("Ошибка загрузки");
          }
        }, "image/jpeg", 0.9);
    });

    // Color Theme Picker Logic
    const colorPicker = $("#colorPicker");
    if (colorPicker && !colorPicker.dataset.initialized) {
      colorPicker.dataset.initialized = "true";
      const buttons = $$(".colorBtn", colorPicker);
      buttons.forEach(btn => {
        btn.onclick = async () => {
          const color = btn.dataset.color;
          if (!color) return;
          
          try {
            // Update UI immediately
            document.body.setAttribute('data-theme', color);
            buttons.forEach(b => b.classList.toggle("active", b === btn));
            if (background && background.setThemeColor) background.setThemeColor(color);
            
            // Save to DB
            await apiJson("/api/profile/update", { method: "POST", body: { bgColor: color } });
            if (me) me.bgColor = color;
            showToast("Цвет обновлен");
          } catch(e) {
            showToast("Ошибка сохранения");
          }
        };
      });
    }
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
      grid.className = "participant-grid widget-animated";
      
      paginated.forEach(u => {
        const item = document.createElement("div");
        item.className = "participantCard";
        
        let avatarHtml = `<div class="user-avatar">${u.username.slice(0,1).toUpperCase()}</div>`;
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
      
      // Trigger animation for the newly added grid
      requestAnimationFrame(() => {
        grid.classList.add("is-visible");
      });
      
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
      showToast("Введите логин и пароль.");
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
      showToast("Введите имя пользователя, логин и пароль.");
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
    "MAGISTER — DIEVERSI",
    "",
    "DIE VERSI — псевдоним был придуман 21 сентября 2025 года.",
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
    if (caseStatus) caseStatus.textContent = "ОБО МНЕ: ОТКРЫТО";

    const start = performance.now();
    const step = () => {
      const elapsed = performance.now() - start;
      // speed: ~24 chars/sec + slight glitch bursts
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
        caseHint && (caseHint.textContent = "Поиск приостановлен.");
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

  // Applied theme is handled inside showView and the startup block

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
    const view = (e.state && e.state.view) || viewMap[window.location.pathname] || (window.location.pathname === "/shop" ? "shop" : "home");
    showView(view, { withGlitch: true });
  });

  // Dynamic Messages
  const dynamicText = $("#dynamicText");
  const messages = ["Принять ?", "Чего еще ждешь ?"];
  let msgIdx = 0;
  window.setInterval(() => {
    if (!dynamicText) return;
    msgIdx = (msgIdx + 1) % messages.length;
    dynamicText.style.filter = "blur(10px) contrast(3)";
    setTimeout(() => {
      dynamicText.textContent = messages[msgIdx];
      dynamicText.style.filter = "";
      if (background && background.pulseGlitch) background.pulseGlitch(250);
    }, 200);
  }, 5000);

  // Initial load
  (async () => {
    try {
      await loadMeAndShowDock().catch(() => { me = null; });
      const path = window.location.pathname;
      const m = profileRe.exec(path);
      if (m) {
        showView("profile", { withGlitch: false });
      } else {
        const viewName = viewMap[path] || "home";
        showView(viewName, { withGlitch: false });
      }
    } catch (err) {
      console.error("Startup error:", err);
    }
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
    themeRGB: "255, 255, 255",
    bhAlpha: 0,
    targetBhAlpha: 0
  };

  const cfg = {
    numParticles: reducedMotion ? 35 : 70,
    linkDist: 180,
    wander: 0.006,
    friction: 0.97,
    maxSpeed: 0.25,
    fieldRadius: 280,
    blackHoleCenter: { x: 0, y: 0 },
    isBlackHole: false,
    bhRadius: 90,
    bhRotation: 0,
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
  function setZoom(zoomed) { state.targetZoom = zoomed ? 2.2 : 1.0; }
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
      hover: 0,
      isGlitchy: Math.random() < 0.1
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
    const isHover = p.hover > 0.1;
    const alpha = (0.2 + (p.z + 600) / 1200 * 0.6) * (isHover ? 1 : 0.8);
    
    let stroke = isHover ? `rgba(${state.themeRGB},${0.4 + p.hover * 0.6})` : `rgba(${state.themeRGB},${alpha})`;
    if (p.isGlitchy) {
      const flicker = Math.random() > 0.5 ? 1 : 0.2;
      stroke = `rgba(255, 255, 255, ${flicker * 0.8})`;
    }

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

    ctx.strokeStyle = stroke;
    ctx.lineWidth = (isHover ? 2 : 1) * pr.s;

    // Apply shrinking effect from Black Hole sucking (p.hover < 0)
    let finalS = pr.s;
    if (p.hover < 0) {
       finalS *= (1 + p.hover); // p.hover is -1 to 0
       ctx.globalAlpha = Math.max(0, 1 + p.hover);
    }
    const finalSize = p.size * finalS;

    if (isHover || p.isGlitchy) {
      ctx.shadowBlur = (isHover ? 15 * p.hover : 8);
      ctx.shadowColor = "white";
    }

    m.e.forEach(e => {
      ctx.beginPath();
      const p1raw = m.v[e[0]], p2raw = m.v[e[1]];
      const transform = (v) => {
        let x = v[0], y = v[1], z = v[2];
        const rx = p.rotX, ry = p.rotY, rz = p.rotZ;
        let t = y * Math.cos(rx) - z * Math.sin(rx);
        z = y * Math.sin(rx) + z * Math.cos(rx); y = t;
        t = x * Math.cos(ry) + z * Math.sin(ry);
        z = -x * Math.sin(ry) + z * Math.cos(ry); x = t;
        t = x * Math.cos(rz) - y * Math.sin(rz);
        y = x * Math.sin(rz) + y * Math.cos(rz); x = t;
        return { x: pr.x + x * finalSize, y: pr.y + y * finalSize };
      };
      let p1 = transform(p1raw), p2 = transform(p2raw);
      if (p.isGlitchy && Math.random() < 0.15) {
        const jitter = (Math.random() - 0.5) * 15;
        p1 = { x: p1.x + jitter, y: p1.y + jitter };
      }
      ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y);
      ctx.stroke();
    });
    ctx.globalAlpha = 1;
    ctx.shadowBlur = 0;
  }

  function draw() {
    const now = performance.now();
    const dt = (now - state.lastNow) / 16.66;
    state.lastNow = now;

    const isSlow = now < state.slowUntil;
    const speedK = isSlow ? 0.4 : 1.0;

    // Target Alpha for Black Hole (smooth transition)
    const activeBg = document.body.getAttribute('data-background');
    state.targetBhAlpha = (activeBg === 'BLACK_HOLE') ? 1 : 0;
    state.zoom += (state.targetZoom - state.zoom) * 0.08 * dt; // Faster snap
    state.bhAlpha += (state.targetBhAlpha - state.bhAlpha) * 0.08 * dt;

    // Position of the Black Hole - Left side (30% width)
    cfg.blackHoleCenter.x = state.w * 0.28;
    cfg.blackHoleCenter.y = state.h * 0.45;
    
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
    const speedK_bh = state.bhAlpha > 0.1 ? 0.002 : 1.0; // Near-Frozen (0.2x of previous)
    const projected = state.particles.map(p => {
      // Black hole attraction (only if bhAlpha > 0)
      if (state.bhAlpha > 0.01) {
        const dx = cfg.blackHoleCenter.x - (state.w/2 + p.x);
        const dy = cfg.blackHoleCenter.y - (state.h/2 + p.y);
        const dist = Math.sqrt(dx*dx + dy*dy);
        
        // GLOBAL GRAVITY (Extreme Clumping - Flattening + Radial)
        const globalForce = 0.00015 * state.bhAlpha;
        p.vx += dx * globalForce;
        
        // Horizontal Compression (Extremely thin disk)
        const targetY = cfg.blackHoleCenter.y - state.h/2;
        p.vy += (targetY - p.y) * 0.08 * state.bhAlpha;

        if (dist < 1200) {
           // Radial Force (Stable at ~210px - Tighter Clumping)
           const stableRadius = 210;
           const force = state.bhAlpha * (stableRadius - dist) / 4000;
           
           // Tangential Force (Orbital spin)
           const orbitSpeed = 0.003 * state.bhAlpha;
           const orbitX = -dy * orbitSpeed;
           const orbitY = dx * orbitSpeed;
           
           p.vx += (dx * force + orbitX);
           p.vy += (dy * force + orbitY);
           
           // "Sucking in" effect (Inward spiral - ONLY if very close)
           const horizon = cfg.bhRadius;
           if (dist < 280) {
              const suckFactor = Math.max(0, (dist - horizon) / 240);
              p.hover = - (1 - suckFactor);
              if (dist < horizon + 10) {
                // RESPAWN AT EDGES - Very Tight Y
                const side = Math.random();
                if (side < 0.25) { p.x = -1000; p.y = targetY + (Math.random()-0.5)*150; }
                else if (side < 0.5) { p.x = 1000; p.y = targetY + (Math.random()-0.5)*150; }
                else if (side < 0.75) { p.y = -1000; p.x = (Math.random()-0.5)*2000; }
                else { p.y = 1000; p.x = (Math.random()-0.5)*2000; }
                
                p.vx *= 0.1; p.vy *= 0.1;
                p.hover = 0;
              }
           } else { p.hover = Math.max(0, p.hover); }
        }
        
        // EXIT DAMPENING: If un-hovering, kill velocity to prevent 'explosion'
        if (state.targetBhAlpha === 0) {
          p.vx *= 0.85; p.vy *= 0.85; p.vz *= 0.85;
        }
      } else { p.hover = Math.max(0, p.hover); }
      
      p.x += p.vx * dt * speedK * speedK_bh;
      p.y += p.vy * dt * speedK * speedK_bh;
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

    // DRAW BLACK HOLE (PURIFIED)
    if (state.bhAlpha > 0.01) {
      cfg.bhRotation += 0.0035 * dt; 
      ctx.save();
      ctx.translate(cfg.blackHoleCenter.x, cfg.blackHoleCenter.y);
      ctx.globalAlpha = state.bhAlpha;

      const glitch = Math.random() < 0.04 ? 1 : 0;
      const flicker = Math.random() < 0.08 ? 30 : 15;

      // Vortex Lines REMOVED for clean minimal Look

      // Gravitational lensing circles (faint)
      ctx.lineWidth = 0.5;
      for (let r = 1; r <= 5; r++) {
         ctx.beginPath();
         ctx.arc(0, 0, cfg.bhRadius * (1 + r * 0.35 + Math.sin(cfg.bhRotation + r) * 0.02), 0, Math.PI * 2);
         ctx.strokeStyle = `rgba(${state.themeRGB}, 0.08)`;
         ctx.stroke();
      }

      // THE SINGULARITY (Black Void)
      ctx.beginPath();
      ctx.arc(0, 0, cfg.bhRadius, 0, Math.PI * 2);
      ctx.fillStyle = "#000";
      ctx.fill();
      
      // Central Glow Shadow (Pulsing)
      const pulse = 1 + Math.sin(cfg.bhRotation * 5) * 0.1;
      const coreGrd = ctx.createRadialGradient(0, 0, cfg.bhRadius * 0.7 * pulse, 0, 0, cfg.bhRadius * 1.2);
      coreGrd.addColorStop(0, 'black');
      coreGrd.addColorStop(1, `rgba(${state.themeRGB}, ${0.4 + (glitch ? 0.4 : 0)})`);
      ctx.strokeStyle = coreGrd;
      ctx.lineWidth = 6 + (glitch ? 4 : 0);
      ctx.stroke();

      ctx.restore();
      ctx.globalAlpha = 1;
    }

    requestAnimationFrame(draw);
  }

  resize();
  window.addEventListener("resize", resize);
  draw();

  return { setPointer, freezeFor, pulseGlitch, setZoom, setThemeColor };
}
})();
