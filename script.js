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
      mainNav.classList.toggle("is-mobile-active");
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
      mainNav.classList.remove("is-mobile-active");
    }
  }

  let transitioning = false;
  let me = null;
  async function loadMeAndShowDock() {
    console.log("loadMeAndShowDock called");
    try {
      const resp = await fetch("/api/me");
      if (resp.status === 401) {
        me = null;
      } else if (!resp.ok) {
        throw new Error(`HTTP ${resp.status}`);
      } else {
        const data = await resp.json();
        me = data.user;
      }
      
      if (me) {
        // ... (existing authenticated logic)
        document.body.setAttribute('data-background', me.activeBackground || 'HOLO');
        if (background && background.setThemeColor) background.setThemeColor(me.bgColor || 'default');
        if (background && background.reposition) background.reposition(900);
        
        const headerUser = $("#headerUser");
        if (headerUser) {
          headerUser.classList.remove("hidden");
          const av = headerUser.querySelector(".headerAvatar");
          if (av) {
            const avPath = me.avatarUrl;
            av.style.backgroundImage = avPath ? `url(${avPath})` : 'none';
          }
          const lg = headerUser.querySelector("#headerLogin");
          if (lg) lg.textContent = me.login;
          const bal = headerUser.querySelector("#balanceValue");
          if (bal) bal.textContent = `${me.balance_l || 0} L`;
        }
        


        
        if (currentViewName === 'profile' || currentViewName === 'home') {
          updateProfileAvatarView(me.avatarUrl);
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
        // Guest mode - hide owner-only features
        $("#headerUser")?.classList.add("hidden");
        document.body.classList.remove("is-owner");
        $("#profileStage")?.classList.add("hidden");
        $("#authCard")?.classList.remove("hidden");
      }
    } catch(e) { 
      console.warn("loadMe (non-critical):", e); 
      me = null; 
    }
    // Crucial: always run setActiveNav so the dock works
    setActiveNav(currentViewName);
  }

  window.renderShop = async function() {
    const list = $("#shop-list");
    if (!list) return;
    list.innerHTML = "";
    const items = [
      { id: "BLACK_HOLE", name: "Black Hole Theme", price: 1500, desc: "A premium singularity background with particle physics." },
      { id: "FLOWERS", name: "Flowers Theme", price: 5000, desc: "Digital garden in the horizon with vertical falling petals." },
      { id: "NEXUS", name: "Nexus Theme", price: 2500, desc: "Vertical streams of digital data rain." },
      { id: "NEBULA", name: "Nebula Theme", price: 4000, desc: "Fluid plasma clouds reacting to your presence." },
      { id: "CONSTELLATION", name: "Constellation Theme", price: 6500, desc: "A hidden star network revealed by your touch." },
      { id: "PULSE", name: "Pulse Theme", price: 8000, desc: "Rhythmic geometric shockwaves radiating outwards." },
      { id: "CHAINS", name: "Chains Theme", price: 3000, desc: "Moving linked steel following the rhythmic tide." }
    ];
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
            if (background && background.pulseGlitch) background.pulseGlitch(600);
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
    // Close buttons handled via onclick in HTML
    
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
           { id: "BLACK_HOLE", name: "Черная Дыра (BLACK HOLE)", desc: "Цифровая сингулярность, втягивающая материю" },
           { id: "FLOWERS", name: "Цветы (FLOWERS)", desc: "Цифровой сад с вертикальным падением частиц" },
           { id: "NEXUS", name: "Нексус (NEXUS)", desc: "Потоки цифровых данных" },
           { id: "NEBULA", name: "Туманность (NEBULA)", desc: "Плазменные облака" },
           { id: "CONSTELLATION", name: "Созвездие (CONSTELLATION)", desc: "Скрытая сеть связей" },
           { id: "PULSE", name: "Пульс (PULSE)", desc: "Ритмичные шоковые волны" }
         ];

         allBgs.forEach((bg, idx) => {
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
                 if (background && background.reposition) background.reposition(1000);
                 modal.classList.add("hidden");
               } catch(e) { showToast(e.message); }
             };
           }
           list.appendChild(item);
           
           // Trigger 3D flip animation with stagger
           setTimeout(() => {
             item.classList.add("is-revealed");
           }, idx * 80);
         });
         modal.classList.remove("hidden");
       };
    }
  }
  initGlobalUI();

  // --- Header Dropdown: Shop + HUD ---
  const headerShopBtn = $("#headerShopBtn");
  if (headerShopBtn) {
    headerShopBtn.onclick = () => {
      if (!me) { showToast("Войдите в профиль"); return; }
      showView("shop", { withGlitch: true });
    };
  }

  const headerHudBtn = $("#headerHudBtn");
  const hudFreeze = $("#hudFreeze");
  const hudAchievement = $("#hudAchievement");
  const hudFingerprints = $("#hudFingerprints");
  const hudCodes = $("#hudCodes");
  let hudActive = false;

  // Camera flash sound (quiet)
  const cameraFlash = new Audio("/sounds/camera-flash.mp3");
  cameraFlash.volume = 0.15;

  // Generate random L-code (10000 L, one-time)
  function generateLCode() {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    let code = "L-";
    for (let i = 0; i < 4; i++) code += chars[Math.floor(Math.random() * chars.length)];
    code += "-";
    for (let i = 0; i < 4; i++) code += chars[Math.floor(Math.random() * chars.length)];
    return code;
  }

  // Render fingerprints
  function renderFingerprints() {
    if (!hudFingerprints) return;
    let html = "";
    for (let i = 0; i < 5; i++) {
      const x = 15 + Math.random() * 70;
      const y = 10 + Math.random() * 75;
      const rot = -30 + Math.random() * 60;
      const size = 60 + Math.random() * 80;
      const delay = Math.random() * 0.3;
      html += `<div class="hud-fingerprint" style="left:${x}%;top:${y}%;transform:rotate(${rot}deg);width:${size}px;height:${size * 1.3}px;animation-delay:${delay}s;"></div>`;
    }
    hudFingerprints.innerHTML = html;
  }

  // Render codes (server-generated or fallback)
  async function renderHudCodes() {
    if (!hudCodes) return;
    let codes = [];

    // Try to get codes from server
    try {
      const data = await apiJson("/api/hud/generate-codes", { method: "POST" });
      if (data.ok && data.codes) codes = data.codes;
    } catch(_) {}

    // Fallback: client-side generated codes (won't redeem but look good)
    if (codes.length === 0) {
      for (let i = 0; i < 3; i++) codes.push(generateLCode());
    }

    let html = `<div class="hud-codes-title mono">ОДНОРАЗОВЫЕ КОДЫ</div>`;
    html += `<div class="hud-codes-sub">Каждый код = <span class="hud-code-val">10 000 L</span></div>`;
    codes.forEach(c => {
      html += `<div class="hud-code-item mono" data-code="${c}">${c}</div>`;
    });
    html += `<div class="hud-codes-hint">Нажмите на код чтобы активировать</div>`;
    hudCodes.innerHTML = html;

    // Click to redeem (only first click works, rest disabled)
    let codeRedeemed = false;
    hudCodes.querySelectorAll(".hud-code-item").forEach(el => {
      el.onclick = async () => {
        if (el.classList.contains("is-used") || codeRedeemed) return;
        codeRedeemed = true;

        // Mark this one as used, disable all others
        hudCodes.querySelectorAll(".hud-code-item").forEach(c => {
          if (c !== el) c.classList.add("is-disabled");
        });

        try {
          const res = await apiJson("/api/hud/redeem", { method: "POST", body: { code: el.dataset.code } });
          el.classList.add("is-used");
          el.textContent = "✓ " + el.textContent;
          showToast(res.message);
          await loadMeAndShowDock();
        } catch (e) {
          showToast(e.message);
          codeRedeemed = false;
          hudCodes.querySelectorAll(".hud-code-item").forEach(c => c.classList.remove("is-disabled"));
        }
      };
    });
  }

  if (headerHudBtn) {
    headerHudBtn.onclick = () => {
      if (hudActive) return;
      hudActive = true;

      // Play camera flash sound
      cameraFlash.currentTime = 0;
      cameraFlash.play().catch(() => {});

      // 1. Freeze/glitch overlay
      if (hudFreeze) {
        hudFreeze.classList.remove("hidden");
        hudFreeze.classList.add("is-on");
        if (background && background.pulseGlitch) background.pulseGlitch(500);
      }

      // 2. Add HUD mode class after short delay (terminal boot)
      setTimeout(() => {
        document.body.classList.add("hud-mode");
        if (background && background.setThemeColor) background.setThemeColor("green");

        // 3. Show fingerprints
        renderFingerprints();
        if (hudFingerprints) hudFingerprints.classList.remove("hidden");

        // 4. Show achievement only on FIRST press
        const firstHud = localStorage.getItem("dv_hud_first");
        if (!firstHud && hudAchievement) {
          localStorage.setItem("dv_hud_first", "1");
          hudAchievement.classList.remove("hidden", "is-leaving");
          // Hide achievement after 3s
          setTimeout(() => {
            hudAchievement.classList.add("is-leaving");
            setTimeout(() => {
              hudAchievement.classList.add("hidden");
              hudAchievement.classList.remove("is-leaving");
            }, 400);
          }, 3000);
        }

        // 5. Show codes
        renderHudCodes();
        if (hudCodes) hudCodes.classList.remove("hidden");

        // 6. After 5 seconds — remove everything
        setTimeout(() => {
          if (hudCodes) hudCodes.classList.add("is-leaving");
          if (hudFingerprints) hudFingerprints.classList.add("is-leaving");

          setTimeout(() => {
            document.body.classList.remove("hud-mode");
            if (me && background && background.setThemeColor) background.setThemeColor(me.bgColor || "default");
            if (hudFreeze) { hudFreeze.classList.add("hidden"); hudFreeze.classList.remove("is-on"); }
            if (hudFingerprints) { hudFingerprints.classList.add("hidden"); hudFingerprints.classList.remove("is-leaving"); }
            if (hudCodes) { hudCodes.classList.add("hidden"); hudCodes.classList.remove("is-leaving"); }
            if (hudAchievement) { hudAchievement.classList.add("hidden"); hudAchievement.classList.remove("is-leaving"); }
            hudActive = false;
          }, 400);
        }, 5000);
      }, 150);
    };
  }

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

  function hideModal(modalId) {
    const modal = $(`#${modalId}`);
    if (!modal) return;
    modal.classList.add("is-closing");
    setTimeout(() => {
       modal.classList.add("hidden");
       modal.classList.remove("is-closing");
    }, 350); 
  }
  window.hideModal = hideModal;

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
          
          updateProfileAvatarView(me.avatarUrl);
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
      

      // Reposition particles to match new view/theme
      if (background && background.reposition) background.reposition(700);

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
  let cropImg = null, sx = 0, sy = 0, scale = 1, isDragging = false, startX, startY;
  
  function drawCrop() {
    const cropCanvas = $("#cropCanvas");
    if(!cropImg || !cropCanvas) return;
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
    if (u.avatarUrl) {
      const btn = document.createElement("button");
      btn.id = "resetAvatarBtn";
      btn.className = "reset-av-btn";
      btn.textContent = "Сбросить аватар";
      btn.onclick = async () => {
        if (!confirm("Удалить аватар?")) return;
        try {
          await apiJson("/api/media/avatar", { method: "DELETE" });
          u.avatarUrl = null; u.avatarUrl = null;
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
    if (background && background.reposition) background.reposition(800);
    // persist to localStorage so it survives page reload
    try { 
      if (theme !== 'default') localStorage.setItem('dv_theme', theme); 
    } catch(_){}
  }

  function updateProfileAvatarView(path) {
    const img = $("#profileAvatarImg");
    const empty = $(".profileAvatarEmpty");
    if (!img || !empty) return;

    if (path) {
      img.src = path;
      img.hidden = false;
      empty.hidden = true;
    } else {
      img.hidden = true;
      empty.hidden = false;
      // Note: CSS handles the pencil vs question mark toggle via .owner-only / .guest-only
    }
    
    // update header
    const av = $("#headerUser")?.querySelector(".headerAvatar");
    if (av) av.style.backgroundImage = path ? `url(${path})` : 'none';
  }

  function renderEmojisInText(text) {
    if (!text) return "";
    let html = text.replace(/</g, "&lt;").replace(/>/g, "&gt;");
    // [EMOJI_X] to SVG mapping
    html = html.replace(/\[EMOJI_(\d+)\]/g, (match, n) => {
      const i = parseInt(n, 10);
      if (customEmojisHtml[i]) {
        return customEmojisHtml[i].replace('class="emojiSVG', 'class="inline-emoji"');
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

      updateProfileAvatarView(u.avatarUrl);
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
    steam: '<img src="https://community.akamai.steamstatic.com/public/shared/images/responsive/header_logo.png" style="width:100%; height:100%; object-fit:contain;">',
    faceit: '<img src="https://corporate.faceit.com/wp-content/uploads/icon-faceit-orange.png" style="width:100%; height:100%; object-fit:contain;">',
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

    // Consolidated Avatar Click - merged with cropping logic
    const avBtn = $("#profileAvatarBtn");
    if (avBtn && !avBtn.dataset.clickInit) {
      avBtn.dataset.clickInit = "true";
      avBtn.onclick = () => {
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
              const cropModal = $("#cropModal");
              const cropCanvas = $("#cropCanvas");
              if (!cropModal || !cropCanvas) return;
              cropModal.classList.remove('hidden');
              // Init canvas
              cropCanvas.width = 400; 
              cropCanvas.height = 400;
              sx = 200;
              sy = 200;
              scale = Math.max(400 / cropImg.width, 400 / cropImg.height);
              drawCrop();
            };
            cropImg.src = re.target.result;
          };
          reader.readAsDataURL(f);
        };
        fileInp.click();
      };
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
            me.avatarUrl = data.avatarUrl;
            updateProfileAvatarView(me.avatarUrl);
            const rmb = $("#removeAvatarBtn");
            if (rmb) rmb.hidden = false;
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
    
    $("#caseCancelBtn")?.addEventListener("click", () => hideModal("caseModal"));
    $("#caseDoneBtn")?.addEventListener("click", async () => {
      try {
        await apiJson("/api/profile/update", { method: "POST", body: { caseText: caseInp.value } });
        me.caseText = caseInp.value;
        updateProfileCase(me.caseText);
        hideModal("caseModal");
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
            const emojiTag = `[EMOJI_${i}]`;
            caseInp.value = text.substring(0, start) + emojiTag + text.substring(end);
            
            // Set cursor position after inserted emoji
            caseInp.selectionStart = caseInp.selectionEnd = start + emojiTag.length;
            
            caseInp.dispatchEvent(new Event("input"));
            caseInp.focus();
          }
          hideModal("emojiModal");
        };
        eg.appendChild(div);
      });
    }
    
    $("#emojiBtn")?.addEventListener("click", () => emojiM.classList.remove("hidden"));
    // Close buttons handled via onclick in HTML

    // Avatar Crop logic
    const cropModal = $("#cropModal");
    const cropArea = $(".cropArea");
    const cropCanvas = $("#cropCanvas");
    
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
  let participantSearchTerm = "";

  const bgNameMap = {
    HOLO: "Голограф", BLACK_HOLE: "Чёрная Дыра", FLOWERS: "Цветы",
    NEXUS: "Нексус", NEBULA: "Туманность", CONSTELLATION: "Созвездие",
    PULSE: "Пульс", CHAINS: "Цепи"
  };

  const integrationIconsSmall = {
    discord: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.196.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.06.06 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.419 0 1.334-.947 2.419-2.157 2.419zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.419 0 1.334-.946 2.419-2.157 2.419z"/></svg>',
    telegram: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.894 8.221l-1.97 9.28c-.145.658-.537.818-1.084.508l-3-2.21-1.446 1.394c-.14.14-.24.24-.44.24l.197-2.97 5.46-4.937c.23-.204-.05-.316-.35-.115l-6.75 4.25-2.88-.9c-.626-.196-.64-.627.13-.927l11.272-4.346c.52-.196.974.116.821.821z"/></svg>',
    steam: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 0C5.373 0 0 5.373 0 12c0 1.25.19 2.45.54 3.58l6.43 2.65c.54-.37 1.2-.59 1.91-.59.06 0 .12 0 .18.01L11.93 13.5v-.01c0-2.495 2.028-4.524 4.524-4.524 2.494 0 4.524 2.031 4.524 4.527s-2.03 4.525-4.524 4.525h-.105l-4.076 2.911c0 .052.004.105.004.159 0 1.875-1.515 3.396-3.39 3.396-1.635 0-3.016-1.173-3.331-2.727L.436 15.27C1.862 20.307 6.486 24 11.979 24c6.627 0 11.999-5.373 11.999-12S18.605 0 11.979 0z"/></svg>',
    faceit: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M22.091 4.704l-3.076-.118c-.066-.002-.132.046-.145.111L18.01 8.892c-.013.065.035.127.1.128l3.077.01c.065.001.125-.046.13-.111l.93-4.104c.015-.065-.034-.124-.13-.11l.001-.001zm-4.316 14.152l-3.077-.118c-.066-.002-.132.046-.145.11l-.887 4.196c-.013.065.035.127.1.128l3.077.01c.065.001.125-.046.13-.11l.93-4.103c.015-.066-.034-.124-.129-.111l-.001-.002zM15.357 9.796l-3.076-.118c-.066-.002-.132.046-.145.111l-.887 4.195c-.013.065.035.127.1.128l3.077.01c.065.001.126-.046.131-.111l.923-4.076c.015-.065-.034-.124-.129-.11l.006-.029z"/></svg>',
    instagram: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 0C8.74 0 8.333.015 7.053.072 5.775.132 4.905.333 4.14.63c-.789.306-1.459.717-2.126 1.384S.935 3.35.63 4.14C.333 4.905.131 5.775.072 7.053.012 8.333 0 8.74 0 12s.012 3.667.072 4.947c.06 1.277.261 2.148.558 2.913.306.788.717 1.459 1.384 2.126.667.666 1.336 1.079 2.126 1.384.766.296 1.636.499 2.913.558C8.333 23.988 8.74 24 12 24s3.667-.012 4.947-.072c1.277-.06 2.148-.262 2.913-.558.788-.306 1.459-.718 2.126-1.384.666-.667 1.079-1.335 1.384-2.126.296-.765.499-1.636.558-2.913.06-1.28.072-1.687.072-4.947s-.015-3.333-.072-4.613c-.06-1.277-.262-2.147-.558-2.913-.306-.789-.718-1.459-1.384-2.126C21.334.935 20.665.522 19.875.217c-.765-.306-1.636-.499-2.913-.558C15.667.012 15.26 0 12 0z"/></svg>',
    twitch: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M11.571 4.714h1.715v5.143H11.57zm4.715 0H18v5.143h-1.714zM6 0L1.714 4.286v15.428h5.143V24l4.286-4.286h3.428L22.286 12V0zm14.571 11.143l-3.428 3.428h-3.429l-3 3v-3H6.857V1.714h13.714Z"/></svg>'
  };

  function buildIntegrationIconsHtml(u) {
    const svcs = [
      { key: "discord_user", name: "discord" },
      { key: "telegram_user", name: "telegram" },
      { key: "steam_url", name: "steam" },
      { key: "faceit_url", name: "faceit" },
      { key: "instagram_url", name: "instagram" },
      { key: "twitch_url", name: "twitch" }
    ];
    let html = "";
    svcs.forEach(s => {
      if (u[s.key]) {
        html += `<div class="pint-icon ${s.name}" title="${s.name}">${integrationIconsSmall[s.name]}</div>`;
      }
    });
    return html;
  }

  function filterParticipants(list) {
    if (!participantSearchTerm) return list;
    const q = participantSearchTerm.toLowerCase();
    return list.filter(u =>
      u.username.toLowerCase().includes(q) ||
      u.login.toLowerCase().includes(q) ||
      u.slug.toLowerCase().includes(q)
    );
  }

  async function loadParticipants() {
    const list = $("#participants-list");
    if (!list) return;
    try {
      if (currentParticipants.length === 0) {
        list.innerHTML = '<div class="loading muted">Загрузка данных...</div>';
        const data = await apiJson("/api/users");
        currentParticipants = data.users || [];
      }

      const filtered = filterParticipants(currentParticipants);
      list.innerHTML = "";
      if (filtered.length === 0) {
        list.innerHTML = '<div class="muted" style="padding:40px;text-align:center;">Участников пока нет.</div>';
        return;
      }

      const startIdx = (participantsPage - 1) * PARTICIPANTS_PER_PAGE;
      const endIdx = startIdx + PARTICIPANTS_PER_PAGE;
      const paginated = filtered.slice(startIdx, endIdx);

      const grid = document.createElement("div");
      grid.className = "participant-grid widget-animated";

      paginated.forEach(u => {
        const item = document.createElement("div");
        item.className = "participantCard";

        let avatarHtml = `<div class="user-avatar">${u.username.slice(0,1).toUpperCase()}</div>`;
        if (u.avatar_path) {
          avatarHtml = `<img src="${u.avatar_path}" class="avatar-img" alt="${u.username}">`;
        }

        const bgLabel = bgNameMap[u.active_background] || u.active_background || "Голограф";
        const intIcons = buildIntegrationIconsHtml(u);

        item.innerHTML = `
          <div class="pint-avatar-wrap">
            <div class="pint-avatar">${avatarHtml}</div>
            <div class="pint-bg-badge">${bgLabel}</div>
          </div>
          <div class="pint-info">
            <div class="pint-name">${u.username}</div>
            <div class="pint-slug mono">u/${u.slug}</div>
            <div class="pint-integrations">${intIcons || '<span class="pint-no-int muted" style="font-size:10px;">Нет интеграций</span>'}</div>
          </div>
          <div class="pint-actions">
            <button class="btn ghost minimal view-profile-btn" data-slug="${u.slug}">ПРОФИЛЬ</button>
          </div>
        `;

        item.addEventListener("mousemove", (e) => {
          const rect = item.getBoundingClientRect();
          const cx = rect.left + rect.width / 2;
          const cy = rect.top + rect.height / 2;
          const dx = (e.clientX - cx) / (rect.width / 2);
          const dy = (e.clientY - cy) / (rect.height / 2);
          item.style.transform = `translateY(-14px) rotateY(${dx * 6}deg) rotateX(${-dy * 4}deg) translateZ(50px) scale(1.08)`;
        });

        item.addEventListener("mouseleave", () => {
          item.style.transform = "";
        });

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

      requestAnimationFrame(() => {
        grid.classList.add("is-visible");
      });

      // Pagination
      const totalPages = Math.ceil(filtered.length / PARTICIPANTS_PER_PAGE);
      if (totalPages > 1) {
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

  const pSearchInput = $("#participantsSearch");
  if (pSearchInput) {
    pSearchInput.addEventListener("input", () => {
      participantSearchTerm = pSearchInput.value.trim();
      participantsPage = 1;
      loadParticipants();
    });
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

  // --- Dynamic Promo System (Golden Code)
  async function initPromoSystem() {
    const container = $("#promoWidgetContainer");
    if (!container) return;

    let currentFullCode = "";
    let timerId = null;

    const fetchAndRender = async () => {
      try {
        const data = await apiJson("/api/promo/current");
        if (!data.ok) return;

        container.innerHTML = `
          <div class="card glass promo-card widget-animated">
            <div class="promo-label">Золотой код (5 мин)</div>
            <div class="promo-code" id="promoCodeVal">---- ----</div>
            <div class="promo-timer" id="promoTimerVal">--:--</div>
          </div>
        `;
        
        const card = container.querySelector(".promo-card");
        const codeEl = $("#promoCodeVal", card);
        const timerEl = $("#promoTimerVal", card);
        
        requestAnimationFrame(() => card.classList.add("is-visible"));

        // Assembling Animation
        const target = data.code;
        const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
        let iterations = 0;
        const maxIter = 15;
        
        const assemble = () => {
          if (iterations >= maxIter) {
            codeEl.textContent = target;
            return;
          }
          let randomStr = "";
          for (let i = 0; i < target.length; i++) {
            if (target[i] === " " || target[i] === "-") randomStr += target[i];
            else randomStr += chars[Math.floor(Math.random() * chars.length)];
          }
          codeEl.textContent = randomStr;
          iterations++;
          setTimeout(assemble, 60);
        };
        assemble();

        // Timer Logic
        let remaining = Math.floor(data.endsInMs / 1000);
        
        if (timerId) clearInterval(timerId);
        timerId = setInterval(() => {
          remaining--;
          if (remaining <= 0) {
            clearInterval(timerId);
            fetchAndRender();
            return;
          }
          
          const m = Math.floor(remaining / 60);
          const s = remaining % 60;
          timerEl.textContent = `${pad2(m)}:${pad2(s)}`;

          // Glitch triggers 10s before
          if (remaining <= 10) {
            card.classList.add("is-glitching");
            if (remaining % 2 === 0 && background && background.pulseGlitch) {
              background.pulseGlitch(150);
            }
          } else {
            card.classList.remove("is-glitching");
          }
        }, 1000);

      } catch (e) {
        console.error("Promo fetch error", e);
      }
    };

    fetchAndRender();
  }
  initPromoSystem();

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
    targetBhAlpha: 0,
    flowerAlpha: 0,
    targetFlowerAlpha: 0,
    nexusAlpha: 0,
    targetNexusAlpha: 0,
    nebulaAlpha: 0,
    targetNebulaAlpha: 0,
    constAlpha: 0,
    targetConstAlpha: 0,
    pulseAlpha: 0,
    targetPulseAlpha: 0,
    chainsAlpha: 0,
    targetChainsAlpha: 0,
    flowers: [],
    nexusStreams: [],
    nebulaClouds: [],
    pulses: [],
    chains: []
  };

  // Generate CHAINS data
  function initChains() {
    state.chains = [];
    const count = 12;
    for (let i = 0; i < count; i++) {
        const speed = 0.5 + Math.random() * 2;
        const z = Math.random(); // 0 is back, 1 is front
        state.chains.push({
            y: (i / count) * window.innerHeight + (Math.random() - 0.5) * 50,
            speed: speed * (z + 0.4),
            z: z,
            offset: Math.random() * 2000,
            linkW: 40 + z * 30,
            linkH: 20 + z * 15,
            gap: 15 + z * 10
        });
    }
  }
  initChains();

  // Generate NEXUS data (3 layers for depth)
  function initNexus() {
    state.nexusStreams = [];
    // Layer 0: background (far, slow)
    for (let i = 0; i < 15; i++) {
      state.nexusStreams.push({
        x: Math.random() * window.innerWidth,
        y: Math.random() * window.innerHeight,
        len: 3 + Math.floor(Math.random() * 8),
        speed: 1 + Math.random() * 3,
        _layer: 0
      });
    }
    // Layer 1: main (mid)
    for (let i = 0; i < 30; i++) {
      state.nexusStreams.push({
        x: Math.random() * window.innerWidth,
        y: Math.random() * window.innerHeight,
        len: 5 + Math.floor(Math.random() * 15),
        speed: 2 + Math.random() * 8,
        _layer: 1
      });
    }
    // Layer 2: foreground (near, fast, sparse)
    for (let i = 0; i < 8; i++) {
      state.nexusStreams.push({
        x: Math.random() * window.innerWidth,
        y: Math.random() * window.innerHeight,
        len: 2 + Math.floor(Math.random() * 5),
        speed: 6 + Math.random() * 12,
        _layer: 2
      });
    }
  }
  initNexus();

  // Generate NEBULA data
  function initNebula() {
    state.nebulaClouds = [];
    for (let i = 0; i < 8; i++) {
        state.nebulaClouds.push({
            x: Math.random() * window.innerWidth,
            y: Math.random() * window.innerHeight,
            size: 400 + Math.random() * 600,
            vx: (Math.random()-0.5) * 0.5,
            vy: (Math.random()-0.5) * 0.5
        });
    }
  }
  initNebula();

  // Generate Digital Garden structures once
  function generateFlowers() {
    state.flowers = [];
    const numFlowers = 6;
    for (let i = 0; i < numFlowers; i++) {
        // Position in bottom-right zone
        const baseX = 800 + Math.random() * 600;
        const baseY = 800 + Math.random() * 400;
        const height = 150 + Math.random() * 200;
        
        const vertices = [];
        const edges = [];
        
        // Stem
        vertices.push({ x: baseX, y: baseY, z: 0 }); // Bottom
        vertices.push({ x: baseX + (Math.random()-0.5)*100, y: baseY - height, z: (Math.random()-0.5)*100 }); // Top
        edges.push([0, 1]);
        
        // Petal/Head nodes
        const center = vertices[1];
        const numNodes = 5 + Math.floor(Math.random()*4);
        for (let j = 0; j < numNodes; j++) {
            const angle = (j / numNodes) * Math.PI * 2;
            const r = 40 + Math.random() * 40;
            vertices.push({
                x: center.x + Math.cos(angle) * r,
                y: center.y + Math.sin(angle) * r,
                z: center.z + (Math.random()-0.5) * 40
            });
            edges.push([1, vertices.length - 1]);
            if (j > 0) edges.push([vertices.length - 2, vertices.length - 1]);
            if (j === numNodes - 1) edges.push([vertices.length - 1, 2]);
        }
        
        state.flowers.push({ vertices, edges, phase: Math.random() * Math.PI * 2 });
    }
  }
  generateFlowers();

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
      // Enhanced ambient glows — varied sizes for depth
      const glowConfigs = [
        { size: 500, opacity: 0.05 },
        { size: 350, opacity: 0.04 },
        { size: 600, opacity: 0.03 },
        { size: 280, opacity: 0.06 },
        { size: 450, opacity: 0.035 },
        { size: 300, opacity: 0.045 },
      ];
      for (let i = 0; i < glowConfigs.length; i++) {
        const gc = glowConfigs[i];
        state.glows.push({
          x: Math.random() * state.w,
          y: Math.random() * state.h,
          vx: (Math.random() - 0.5) * 0.15,
          vy: (Math.random() - 0.5) * 0.15,
          size: gc.size,
          opacity: gc.opacity
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
      vx: (Math.random() - 0.5) * 1.2,
      vy: (Math.random() - 0.5) * 1.2,
      vz: (Math.random() - 0.5) * 0.8,
      rotX: Math.random() * Math.PI,
      rotY: Math.random() * Math.PI,
      rotZ: Math.random() * Math.PI,
      vRotX: (Math.random() - 0.5) * 0.025,
      vRotY: (Math.random() - 0.5) * 0.025,
      vRotZ: (Math.random() - 0.5) * 0.015,
      kind: ["cube", "pyramid", "octa"][Math.floor(Math.random() * 3)],
      size: 14 + Math.random() * 18,
      hover: 0,
      isGlitchy: Math.random() < 0.12,
      drift: (Math.random() - 0.5) * 0.003
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
    const alpha = (0.25 + (p.z + 600) / 1200 * 0.65) * (isHover ? 1 : 0.85);
    
    let stroke = isHover ? `rgba(${state.themeRGB},${0.5 + p.hover * 0.5})` : `rgba(${state.themeRGB},${alpha})`;
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
      ctx.shadowBlur = (isHover ? 20 * p.hover : 10);
      ctx.shadowColor = `rgba(${state.themeRGB}, 0.8)`;
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

    // Target Alphas (smooth transitions)
    const activeBg = document.body.getAttribute('data-background');
    state.targetBhAlpha = (activeBg === 'BLACK_HOLE') ? 1 : 0;
    state.targetFlowerAlpha = (activeBg === 'FLOWERS') ? 1 : 0;
    state.targetNexusAlpha = (activeBg === 'NEXUS') ? 1 : 0;
    state.targetNebulaAlpha = (activeBg === 'NEBULA') ? 1 : 0;
    state.targetConstAlpha = (activeBg === 'CONSTELLATION') ? 1 : 0;
    state.targetPulseAlpha = (activeBg === 'PULSE') ? 1 : 0;
    
    state.zoom += (state.targetZoom - state.zoom) * 0.08 * dt;
    state.bhAlpha += (state.targetBhAlpha - state.bhAlpha) * 0.08 * dt;
    state.flowerAlpha += (state.targetFlowerAlpha - state.flowerAlpha) * 0.08 * dt;
    state.nexusAlpha += (state.targetNexusAlpha - state.nexusAlpha) * 0.08 * dt;
    state.nebulaAlpha += (state.targetNebulaAlpha - state.nebulaAlpha) * 0.08 * dt;
    state.constAlpha += (state.targetConstAlpha - state.constAlpha) * 0.08 * dt;
    state.pulseAlpha += (state.targetPulseAlpha - state.pulseAlpha) * 0.08 * dt;
    state.chainsAlpha += (state.targetChainsAlpha - state.chainsAlpha) * 0.08 * dt;

    // Target Alphas for mobile/active sync
    state.targetChainsAlpha = (activeBg === 'CHAINS') ? 1 : 0;

    // Position of the Black Hole - Left side (30% width)
    cfg.blackHoleCenter.x = state.w * 0.28;
    cfg.blackHoleCenter.y = state.h * 0.45;
    
    ctx.clearRect(0, 0, state.w, state.h);

    // AMBIENT LIGHTING — soft top-left spotlight
    const ambientPulse = 1 + Math.sin(now / 4000) * 0.15;
    const ambGrd = ctx.createRadialGradient(
      state.w * 0.2, state.h * 0.15, 0,
      state.w * 0.2, state.h * 0.15, state.w * 0.55
    );
    ambGrd.addColorStop(0, `rgba(${state.themeRGB}, ${0.035 * ambientPulse})`);
    ambGrd.addColorStop(0.5, `rgba(${state.themeRGB}, ${0.012 * ambientPulse})`);
    ambGrd.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = ambGrd;
    ctx.fillRect(0, 0, state.w, state.h);

    // Secondary ambient — bottom-right warm glow
    const ambGrd2 = ctx.createRadialGradient(
      state.w * 0.8, state.h * 0.85, 0,
      state.w * 0.8, state.h * 0.85, state.w * 0.4
    );
    ambGrd2.addColorStop(0, `rgba(${state.themeRGB}, ${0.02 * ambientPulse})`);
    ambGrd2.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = ambGrd2;
    ctx.fillRect(0, 0, state.w, state.h);

    // DRAW WHITE GLOW CLUMPS (enhanced)
    state.glows.forEach(g => {
      g.x += g.vx * dt; g.y += g.vy * dt;
      if (g.x < -g.size) g.x = state.w + g.size;
      if (g.x > state.w + g.size) g.x = -g.size;
      if (g.y < -g.size) g.y = state.h + g.size;
      if (g.y > state.h + g.size) g.y = -g.size;

      const pulse = 1 + Math.sin(now / 3000 + g.x * 0.01) * 0.2;
      const grd = ctx.createRadialGradient(g.x, g.y, 0, g.x, g.y, g.size * pulse);
      grd.addColorStop(0, `rgba(${state.themeRGB},${g.opacity * 1.3})`);
      grd.addColorStop(0.4, `rgba(${state.themeRGB},${g.opacity * 0.5})`);
      grd.addColorStop(1, `rgba(${state.themeRGB},0)`);
      ctx.fillStyle = grd;
      ctx.fillRect(0, 0, state.w, state.h);
    });

    // Physics & Projection
    const speedK_bh = state.bhAlpha > 0.1 ? 0.0006 : 1.0;
    repositionStep(now, dt);
    const projected = state.particles.map(p => {
      // Black hole attraction (only if bhAlpha > 0)
      if (state.bhAlpha > 0.01) {
        const bhX = cfg.blackHoleCenter.x - state.w/2;
        const bhY = cfg.blackHoleCenter.y - state.h/2;
        const dx = bhX - p.x;
        const dy = bhY - p.y;
        const dist = Math.sqrt(dx*dx + dy*dy);
        
        // GLOBAL GRAVITY — slow inward pull
        const globalForce = 0.00003 * state.bhAlpha;
        p.vx += dx * globalForce;
        p.vy += dy * globalForce;

        if (dist < 1400) {
           // Orbital mechanics: radial + tangential
           const orbitRadius = 250;
           const radialForce = state.bhAlpha * (orbitRadius - dist) / 8000;
           
           // Stronger orbital spin
           const orbitSpeed = 0.0018 * state.bhAlpha;
           const orbitX = -dy * orbitSpeed;
           const orbitY = dx * orbitSpeed;
           
           p.vx += dx * radialForce + orbitX;
           p.vy += dy * radialForce + orbitY;

           // Slow down particles that are orbiting (smooth deceleration toward orbit)
           if (dist < orbitRadius + 100 && dist > cfg.bhRadius + 30) {
              p.vx *= 0.998;
              p.vy *= 0.998;
              p.vz *= 0.998;
           }
           
           // Sucking in effect near horizon
           const horizon = cfg.bhRadius;
           if (dist < 300) {
              const suckFactor = Math.max(0, (dist - horizon) / 260);
              p.hover = -(1 - suckFactor);
              
              // Extra rotation speed near the horizon
              const closeOrbit = 0.004 * state.bhAlpha * (1 - suckFactor);
              p.vx += -dy * closeOrbit;
              p.vy += dx * closeOrbit;
              
              if (dist < horizon + 8) {
                // RESPAWN far away for continuous loop
                const angle = Math.random() * Math.PI * 2;
                const spawnDist = 600 + Math.random() * 400;
                p.x = bhX + Math.cos(angle) * spawnDist;
                p.y = bhY + Math.sin(angle) * spawnDist;
                p.vx = Math.sin(angle) * 0.5;
                p.vy = -Math.cos(angle) * 0.5;
                p.vz = (Math.random() - 0.5) * 0.3;
                p.hover = 0;
              }
           } else { p.hover = Math.max(0, p.hover); }
        }
        
        // EXIT DAMPENING
        if (state.targetBhAlpha === 0) {
          p.vx *= 0.85; p.vy *= 0.85; p.vz *= 0.85;
        }
      } else { p.hover = Math.max(0, p.hover); }
      
      p.x += p.vx * dt * speedK * speedK_bh;
      if (state.flowerAlpha > 0.01) {
          p.y += (1.5 + Math.random() * 0.5) * dt * state.flowerAlpha;
          p.vx *= 0.95;
      } else if (state.bhAlpha < 0.01) {
          // HOLO: gentle drift + slow orbital drift
          p.x += Math.sin(now * 0.0003 + p.rotX * 10) * 0.15 * dt;
          p.y += Math.cos(now * 0.00025 + p.rotY * 10) * 0.12 * dt;
          p.y += p.vy * dt * speedK * speedK_bh;
      } else {
          p.y += p.vy * dt * speedK * speedK_bh;
      }
      p.z += p.vz * dt * speedK;
      if (p.x < -1200) p.x = 1200; if (p.x > 1200) p.x = -1200;
      if (p.y < -1200) p.y = 1200; if (p.y > 1200) p.y = -1200;
      if (p.z < -600) p.z = 600; if (p.z > 600) p.z = -600;

      p.rotX += p.vRotX * dt * speedK;
      p.rotY += p.vRotY * dt * speedK;
      p.rotZ += p.vRotZ * dt * speedK;

      const pr = project(p);
      const dxh = state.mx - pr.x;
      const dyh = state.my - pr.y;
      if (Math.hypot(dxh, dyh) < 100) p.hover += (1 - p.hover) * 0.1;
      else p.hover *= 0.94;

      return pr;
    });

    // Draw lines (with subtle glow)
    ctx.lineWidth = 0.5;
    for (let i = 0; i < state.particles.length; i++) {
       for (let j = i + 1; j < state.particles.length; j++) {
          const p1 = state.particles[i], p2 = state.particles[j];
          const d = Math.hypot(p1.x-p2.x, p1.y-p2.y, p1.z-p2.z);
          if (d < cfg.linkDist) {
            let lineAlpha = (1 - d/cfg.linkDist) * 0.2;
            
            // CONSTELLATION MODE: Lines only near cursor
            if (activeBg === 'CONSTELLATION') {
               const midX = (projected[i].x + projected[j].x) / 2;
               const midY = (projected[i].y + projected[j].y) / 2;
               const distToMouse = Math.hypot(midX - state.mx, midY - state.my);
               const radius = 250;
               if (distToMouse < radius) lineAlpha *= (1 - distToMouse/radius);
               else lineAlpha = 0;
            }

            if (lineAlpha > 0.005) {
              ctx.strokeStyle = `rgba(${state.themeRGB},${lineAlpha})`;
              ctx.beginPath();
              ctx.moveTo(projected[i].x, projected[i].y);
              ctx.lineTo(projected[j].x, projected[j].y);
              ctx.stroke();

              // Subtle line glow for close connections
              if (d < cfg.linkDist * 0.5) {
                ctx.strokeStyle = `rgba(${state.themeRGB},${lineAlpha * 0.3})`;
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.moveTo(projected[i].x, projected[i].y);
                ctx.lineTo(projected[j].x, projected[j].y);
                ctx.stroke();
                ctx.lineWidth = 0.5;
              }
            }
          }
       }
    }

    // Draw shapes
    state.particles.forEach((p, i) => drawShape(p, projected[i]));

    // DRAW CONSTELLATION (3D STAR FIELD — depth layers)
    if (state.constAlpha > 0.01) {
        ctx.save();
        ctx.globalAlpha = state.constAlpha;
        
        if (!state._constStars) {
            state._constStars = [];
            for (let k = 0; k < 100; k++) {
                state._constStars.push({
                    x: Math.random() * 2000 - 500,
                    y: Math.random() * 2000 - 500,
                    z: Math.random() * 1000 - 200,
                    phase: Math.random() * Math.PI * 2,
                    brightness: 0.3 + Math.random() * 0.5
                });
            }
        }
        
        state._constStars.forEach(st => {
            st.x += Math.sin(now / 12000 + st.phase) * 0.1;
            st.y += Math.cos(now / 10000 + st.phase) * 0.08;
            if (st.x < -300) st.x = state.w + 300; if (st.x > state.w + 300) st.x = -300;
            if (st.y < -300) st.y = state.h + 300; if (st.y > state.h + 300) st.y = -300;
            
            const pr = project({ x: st.x - state.w/2, y: st.y - state.h/2, z: st.z });
            const twinkle = st.brightness * (0.7 + Math.sin(now / 2000 + st.phase) * 0.3);
            const distToMouse = Math.hypot(pr.x - state.mx, pr.y - state.my);
            const mouseBoost = distToMouse < 250 ? (1 - distToMouse / 250) * 0.6 : 0;
            const finalAlpha = twinkle * 0.3 + mouseBoost;
            
            if (finalAlpha > 0.02) {
                const starGrd = ctx.createRadialGradient(pr.x, pr.y, 0, pr.x, pr.y, 6 * pr.s);
                starGrd.addColorStop(0, `rgba(255, 255, 255, ${finalAlpha})`);
                starGrd.addColorStop(0.4, `rgba(${state.themeRGB}, ${finalAlpha * 0.3})`);
                starGrd.addColorStop(1, `rgba(${state.themeRGB}, 0)`);
                ctx.fillStyle = starGrd;
                ctx.fillRect(pr.x - 15, pr.y - 15, 30, 30);
                
                ctx.fillStyle = `rgba(255, 255, 255, ${finalAlpha * 0.8})`;
                ctx.beginPath();
                ctx.arc(pr.x, pr.y, 1 * pr.s, 0, Math.PI * 2);
                ctx.fill();
            }
        });
        
        ctx.restore();
    }

    // DRAW BLACK HOLE (3D — digital ring + orbital figures)
    if (state.bhAlpha > 0.01) {
      cfg.bhRotation += 0.004 * dt; 
      ctx.save();
      ctx.translate(cfg.blackHoleCenter.x, cfg.blackHoleCenter.y);
      ctx.globalAlpha = state.bhAlpha;

      const glitch = Math.random() < 0.04 ? 1 : 0;
      const pulse = 1 + Math.sin(cfg.bhRotation * 5) * 0.1;

      // --- ORBIT TRAILS (particles leaving faint trails near BH) ---
      state.particles.forEach(p => {
        if (state.bhAlpha < 0.3) return;
        const bhX = cfg.blackHoleCenter.x - state.w/2;
        const bhY = cfg.blackHoleCenter.y - state.h/2;
        const dist = Math.sqrt((p.x - bhX) ** 2 + (p.y - bhY) ** 2);
        if (dist < 350 && dist > cfg.bhRadius + 15) {
          const trailAlpha = Math.max(0, (1 - dist / 350)) * 0.12 * state.bhAlpha;
          const pr = project(p);
          const trailGrd = ctx.createRadialGradient(pr.x, pr.y, 0, pr.x, pr.y, 15 * pr.s);
          trailGrd.addColorStop(0, `rgba(${state.themeRGB}, ${trailAlpha})`);
          trailGrd.addColorStop(1, `rgba(${state.themeRGB}, 0)`);
          ctx.fillStyle = trailGrd;
          ctx.beginPath();
          ctx.arc(pr.x, pr.y, 15 * pr.s, 0, Math.PI * 2);
          ctx.fill();
        }
      });

      // --- GLOWING DIGITAL CIRCLE (sci-fi HUD ring) ---
      const digitalR = cfg.bhRadius * 2.2;
      const segments = 24;
      const segLen = (Math.PI * 2) / segments;
      
      // Outer glow aura
      const auraGrd = ctx.createRadialGradient(0, 0, digitalR * 0.8, 0, 0, digitalR * 1.3);
      auraGrd.addColorStop(0, `rgba(${state.themeRGB}, ${0.02 * pulse})`);
      auraGrd.addColorStop(0.5, `rgba(${state.themeRGB}, ${0.04 * pulse})`);
      auraGrd.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = auraGrd;
      ctx.beginPath();
      ctx.arc(0, 0, digitalR * 1.3, 0, Math.PI * 2);
      ctx.fill();

      // Rotating digital segments
      for (let s = 0; s < segments; s++) {
        const startAngle = cfg.bhRotation + s * segLen;
        const gap = segLen * 0.3;
        const segAlpha = (0.15 + Math.sin(cfg.bhRotation * 3 + s * 0.7) * 0.1) * pulse;
        const isActive = (s % 3 !== 0) || (Math.sin(cfg.bhRotation * 2 + s) > 0.3);
        
        if (isActive) {
          ctx.beginPath();
          ctx.arc(0, 0, digitalR, startAngle + gap, startAngle + segLen - gap);
          ctx.strokeStyle = `rgba(${state.themeRGB}, ${segAlpha})`;
          ctx.lineWidth = 1.5 + Math.sin(cfg.bhRotation * 4 + s) * 0.5;
          ctx.stroke();
        }
      }

      // Inner rotating ring (counter-rotate)
      const innerR = cfg.bhRadius * 1.6;
      const innerSegs = 16;
      for (let s = 0; s < innerSegs; s++) {
        const startAngle = -cfg.bhRotation * 1.5 + s * (Math.PI * 2 / innerSegs);
        const gap = (Math.PI * 2 / innerSegs) * 0.35;
        const segAlpha = (0.1 + Math.sin(cfg.bhRotation * 2 + s * 1.2) * 0.06) * pulse;
        
        ctx.beginPath();
        ctx.arc(0, 0, innerR, startAngle + gap, startAngle + (Math.PI * 2 / innerSegs) - gap);
        ctx.strokeStyle = `rgba(${state.themeRGB}, ${segAlpha})`;
        ctx.lineWidth = 1;
        ctx.stroke();
      }

      // Pulsing center dot
      const dotR = 3 + Math.sin(cfg.bhRotation * 6) * 1.5;
      const dotGrd = ctx.createRadialGradient(0, 0, 0, 0, 0, dotR * 5);
      dotGrd.addColorStop(0, `rgba(255, 255, 255, ${0.4 * pulse})`);
      dotGrd.addColorStop(0.3, `rgba(${state.themeRGB}, ${0.15 * pulse})`);
      dotGrd.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = dotGrd;
      ctx.beginPath();
      ctx.arc(0, 0, dotR * 5, 0, Math.PI * 2);
      ctx.fill();

      // Small tick marks on digital ring
      for (let t = 0; t < 48; t++) {
        const angle = cfg.bhRotation * 0.7 + t * (Math.PI * 2 / 48);
        const tickLen = (t % 4 === 0) ? 8 : 4;
        const x1 = Math.cos(angle) * (digitalR - tickLen);
        const y1 = Math.sin(angle) * (digitalR - tickLen);
        const x2 = Math.cos(angle) * digitalR;
        const y2 = Math.sin(angle) * digitalR;
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.strokeStyle = `rgba(${state.themeRGB}, ${0.08 + (t % 4 === 0 ? 0.06 : 0)})`;
        ctx.lineWidth = (t % 4 === 0) ? 1.5 : 0.8;
        ctx.stroke();
      }

      // --- ACCRETION DISK (3D ellipse) ---
      ctx.save();
      ctx.rotate(cfg.bhRotation * 0.3);
      for (let ring = 0; ring < 4; ring++) {
          const ringR = cfg.bhRadius * (1.8 + ring * 0.5);
          const ringAlpha = (0.07 - ring * 0.012) * pulse;
          ctx.beginPath();
          ctx.ellipse(0, 0, ringR, ringR * 0.3, 0, 0, Math.PI * 2);
          ctx.strokeStyle = `rgba(${state.themeRGB}, ${ringAlpha})`;
          ctx.lineWidth = 2 - ring * 0.3;
          ctx.stroke();
      }
      ctx.restore();

      // --- GRAVITATIONAL LENSING circles ---
      ctx.lineWidth = 0.5;
      for (let r = 1; r <= 5; r++) {
         const lensR = cfg.bhRadius * (1 + r * 0.35 + Math.sin(cfg.bhRotation + r) * 0.03);
         ctx.beginPath();
         ctx.arc(0, 0, lensR, 0, Math.PI * 2);
         ctx.strokeStyle = `rgba(${state.themeRGB}, ${0.05 + Math.sin(now / 2000 + r) * 0.02})`;
         ctx.stroke();
      }

      // --- THE SINGULARITY (Black Void) ---
      ctx.beginPath();
      ctx.arc(0, 0, cfg.bhRadius, 0, Math.PI * 2);
      ctx.fillStyle = "#000";
      ctx.fill();
      
      // Outer glow ring
      const glowGrd = ctx.createRadialGradient(0, 0, cfg.bhRadius * 0.8, 0, 0, cfg.bhRadius * 1.5);
      glowGrd.addColorStop(0, 'transparent');
      glowGrd.addColorStop(0.5, `rgba(${state.themeRGB}, ${0.06 + (glitch ? 0.15 : 0)})`);
      glowGrd.addColorStop(1, 'transparent');
      ctx.strokeStyle = glowGrd;
      ctx.lineWidth = 8 + (glitch ? 6 : 0);
      ctx.beginPath();
      ctx.arc(0, 0, cfg.bhRadius * 1.15, 0, Math.PI * 2);
      ctx.stroke();

      // Central Glow Shadow (Pulsing)
      const coreGrd = ctx.createRadialGradient(0, 0, cfg.bhRadius * 0.7 * pulse, 0, 0, cfg.bhRadius * 1.2);
      coreGrd.addColorStop(0, 'black');
      coreGrd.addColorStop(1, `rgba(${state.themeRGB}, ${0.4 + (glitch ? 0.4 : 0)})`);
      ctx.strokeStyle = coreGrd;
      ctx.lineWidth = 6 + (glitch ? 4 : 0);
      ctx.stroke();

      ctx.restore();
      ctx.globalAlpha = 1;
    }

    // DRAW FLOWERS (3D DIGITAL GARDEN — volumetric)
    if (state.flowerAlpha > 0.01) {
        ctx.save();
        ctx.globalAlpha = state.flowerAlpha;
        
        // Falling petal particles for depth
        if (!state._petalParticles) {
            state._petalParticles = [];
            for (let i = 0; i < 30; i++) {
                state._petalParticles.push({
                    x: Math.random() * 2000 - 500,
                    y: Math.random() * 2000 - 500,
                    z: Math.random() * 800 - 200,
                    size: 2 + Math.random() * 4,
                    speed: 0.3 + Math.random() * 0.8,
                    wobble: Math.random() * Math.PI * 2,
                    wobbleSpeed: 0.01 + Math.random() * 0.02
                });
            }
        }

        // Draw falling petals (depth layer)
        state._petalParticles.forEach(pt => {
            pt.y += pt.speed * dt * 60;
            pt.x += Math.sin(pt.wobble) * 0.3;
            pt.wobble += pt.wobbleSpeed * dt * 60;
            if (pt.y > state.h + 50) { pt.y = -50; pt.x = Math.random() * state.w; pt.z = Math.random() * 800 - 200; }
            
            const pr = project({ x: pt.x - state.w/2, y: pt.y - state.h/2, z: pt.z });
            const a = 0.15 + (pt.z + 400) / 800 * 0.3;
            ctx.fillStyle = `rgba(${state.themeRGB}, ${a})`;
            ctx.beginPath();
            ctx.ellipse(pr.x, pr.y, pt.size * pr.s, pt.size * pr.s * 0.6, pt.wobble * 0.5, 0, Math.PI * 2);
            ctx.fill();
        });

        const sway = Math.sin(now / 1500) * 15;
        
        state.flowers.forEach(f => {
            const swayX = Math.sin(now / 2000 + f.phase) * 10;
            const swayZ = Math.cos(now / 2500 + f.phase) * 20;
            
            // Draw edges with depth-based opacity
            f.edges.forEach(e => {
                const v1 = f.vertices[e[0]];
                const v2 = f.vertices[e[1]];
                
                const pr1 = project({ 
                    x: v1.x + (e[0] > 0 ? swayX : 0), 
                    y: v1.y, 
                    z: v1.z + (e[0] > 0 ? swayZ : 0)
                });
                const pr2 = project({ 
                    x: v2.x + (e[1] > 0 ? swayX : 0), 
                    y: v2.y, 
                    z: v2.z + (e[1] > 0 ? swayZ : 0)
                });
                
                const depthAlpha = 0.15 + ((v1.z + 50) / 100) * 0.2;
                ctx.strokeStyle = `rgba(${state.themeRGB}, ${depthAlpha})`;
                ctx.lineWidth = 0.8 + pr1.s * 0.5;
                ctx.beginPath();
                ctx.moveTo(pr1.x, pr1.y);
                ctx.lineTo(pr2.x, pr2.y);
                ctx.stroke();
            });
            
            // Draw vertices as glowing dots
            f.vertices.forEach((v, idx) => {
                const pr = project({ 
                    x: v.x + (idx > 0 ? swayX : 0), 
                    y: v.y, 
                    z: v.z + (idx > 0 ? swayZ : 0)
                });
                const dotSize = (2 + (idx === 1 ? 2 : 0)) * pr.s;
                
                // Glow
                const glowGrd = ctx.createRadialGradient(pr.x, pr.y, 0, pr.x, pr.y, dotSize * 4);
                glowGrd.addColorStop(0, `rgba(${state.themeRGB}, 0.3)`);
                glowGrd.addColorStop(1, `rgba(${state.themeRGB}, 0)`);
                ctx.fillStyle = glowGrd;
                ctx.fillRect(pr.x - dotSize * 4, pr.y - dotSize * 4, dotSize * 8, dotSize * 8);
                
                // Core dot
                ctx.fillStyle = `rgba(${state.themeRGB}, ${0.5 + Math.sin(now / 1000 + idx) * 0.2})`;
                ctx.beginPath();
                ctx.arc(pr.x, pr.y, dotSize, 0, Math.PI * 2);
                ctx.fill();
            });
        });
        ctx.restore();
    }

    // DRAW NEXUS (3D DIGITAL RAIN — layered depth)
    if (state.nexusAlpha > 0.01) {
        ctx.save();
        ctx.globalAlpha = state.nexusAlpha;
        
        // Background layer (far, dim)
        ctx.font = "11px monospace";
        state.nexusStreams.forEach(s => {
          if (s._layer !== 0) return;
          s.y += s.speed * 0.4 * dt;
          if (s.y > state.h) { s.y = -200; s.x = Math.random() * state.w; }
          for (let i = 0; i < Math.floor(s.len * 0.6); i++) {
            const ch = Math.random() > 0.3 ? (Math.random() > 0.5 ? "1" : "0") : "0123456789ABCDEF".charAt(Math.floor(Math.random() * 16));
            ctx.fillStyle = `rgba(${state.themeRGB}, ${0.04 + Math.sin(now / 2000 + i) * 0.02})`;
            ctx.fillText(ch, s.x, s.y - i * 16);
          }
        });
        
        // Main layer
        ctx.font = "14px monospace";
        state.nexusStreams.forEach(s => {
          if (s._layer !== 1) return;
          s.y += s.speed * dt;
          if (s.y > state.h) { s.y = -200; s.x = Math.random() * state.w; }
          const dist = Math.hypot(s.x - state.mx, s.y - state.my);
          const isGlitch = dist < 140;
          
          for (let i = 0; i < s.len; i++) {
            const progress = i / s.len;
            const char = (isGlitch || Math.random() < 0.05) ? "0123456789ABCDEF".charAt(Math.floor(Math.random() * 16)) : (Math.random() > 0.5 ? "1" : "0");
            const alpha = (1 - progress) * 0.5 + (isGlitch ? 0.3 : 0);
            
            // Head glow
            if (i === 0) {
              ctx.shadowBlur = 12;
              ctx.shadowColor = `rgba(${state.themeRGB}, 0.6)`;
              ctx.fillStyle = `rgba(${state.themeRGB}, ${Math.min(1, alpha + 0.3)})`;
            } else {
              ctx.shadowBlur = 0;
              ctx.fillStyle = `rgba(${state.themeRGB}, ${alpha})`;
            }
            ctx.fillText(char, s.x, s.y - i * 18);
          }
          ctx.shadowBlur = 0;
        });
        
        // Foreground layer (near, bright, large)
        ctx.font = "18px monospace";
        state.nexusStreams.forEach(s => {
          if (s._layer !== 2) return;
          s.y += s.speed * 1.6 * dt;
          if (s.y > state.h) { s.y = -300; s.x = Math.random() * state.w; }
          for (let i = 0; i < Math.floor(s.len * 0.4); i++) {
            const ch = "0123456789ABCDEF".charAt(Math.floor(Math.random() * 16));
            ctx.fillStyle = `rgba(${state.themeRGB}, ${(1 - i / (s.len * 0.4)) * 0.12})`;
            ctx.fillText(ch, s.x, s.y - i * 24);
          }
        });
        
        ctx.restore();
    }

    // DRAW NEBULA (3D VOLUMETRIC PLASMA — layered depth)
    if (state.nebulaAlpha > 0.01) {
        ctx.save();
        ctx.globalAlpha = state.nebulaAlpha;
        
        // Deep background clouds (large, slow, dim)
        state.nebulaClouds.forEach((c, ci) => {
            c.x += c.vx * dt * 0.5; c.y += c.vy * dt * 0.5;
            if (c.x < -c.size * 2) c.x = state.w + c.size; if (c.x > state.w + c.size) c.x = -c.size;
            if (c.y < -c.size * 2) c.y = state.h + c.size; if (c.y > state.h + c.size) c.y = -c.size;
            
            const dx = state.mx - c.x; const dy = state.my - c.y;
            const d = Math.hypot(dx, dy);
            if (d < 350) { c.vx += dx * 0.00008; c.vy += dy * 0.00008; }
            
            // Multi-layer radial gradient for volume
            const pulse = 1 + Math.sin(now / 5000 + ci * 1.5) * 0.2;
            const sz = c.size * pulse;
            
            const grd = ctx.createRadialGradient(c.x, c.y, 0, c.x, c.y, sz);
            grd.addColorStop(0, `rgba(${state.themeRGB}, ${0.06 + Math.sin(now / 3000 + ci) * 0.02})`);
            grd.addColorStop(0.3, `rgba(${state.themeRGB}, 0.035)`);
            grd.addColorStop(0.7, `rgba(${state.themeRGB}, 0.01)`);
            grd.addColorStop(1, `rgba(${state.themeRGB}, 0)`);
            ctx.fillStyle = grd;
            ctx.fillRect(0, 0, state.w, state.h);
            
            // Inner bright core
            const coreGrd = ctx.createRadialGradient(c.x, c.y, 0, c.x, c.y, sz * 0.3);
            coreGrd.addColorStop(0, `rgba(${state.themeRGB}, ${0.04 * pulse})`);
            coreGrd.addColorStop(1, `rgba(${state.themeRGB}, 0)`);
            ctx.fillStyle = coreGrd;
            ctx.fillRect(0, 0, state.w, state.h);
        });
        
        // Floating bright particles within nebula
        if (!state._nebulaParticles) {
            state._nebulaParticles = [];
            for (let i = 0; i < 20; i++) {
                state._nebulaParticles.push({
                    x: Math.random() * 2000 - 500,
                    y: Math.random() * 2000 - 500,
                    z: Math.random() * 600 - 100,
                    phase: Math.random() * Math.PI * 2
                });
            }
        }
        state._nebulaParticles.forEach(np => {
            np.x += Math.sin(now / 8000 + np.phase) * 0.2;
            np.y += Math.cos(now / 6000 + np.phase) * 0.15;
            if (np.x < -200) np.x = state.w + 200; if (np.x > state.w + 200) np.x = -200;
            if (np.y < -200) np.y = state.h + 200; if (np.y > state.h + 200) np.y = -200;
            
            const pr = project({ x: np.x - state.w/2, y: np.y - state.h/2, z: np.z });
            const flicker = 0.15 + Math.sin(now / 1500 + np.phase) * 0.1;
            
            const starGrd = ctx.createRadialGradient(pr.x, pr.y, 0, pr.x, pr.y, 8 * pr.s);
            starGrd.addColorStop(0, `rgba(255, 255, 255, ${flicker})`);
            starGrd.addColorStop(0.5, `rgba(${state.themeRGB}, ${flicker * 0.4})`);
            starGrd.addColorStop(1, `rgba(${state.themeRGB}, 0)`);
            ctx.fillStyle = starGrd;
            ctx.fillRect(pr.x - 20, pr.y - 20, 40, 40);
        });
        
        ctx.restore();
    }

    // DRAW PULSE (3D SHOCKWAVES — perspective rings)
    if (state.pulseAlpha > 0.01) {
        if (Math.random() < 0.025 * dt) {
            state.pulses.push({
                x: Math.random() * state.w, y: Math.random() * state.h,
                z: Math.random() * 400 - 100,
                r: 0, max: 200 + Math.random() * 400,
                phase: Math.random() * Math.PI * 2
            });
        }
        ctx.save();
        ctx.globalAlpha = state.pulseAlpha;
        state.pulses.forEach((p, i) => {
            p.r += 3.5 * dt;
            const alpha = 1 - (p.r / p.max);
            if (alpha <= 0) { state.pulses.splice(i, 1); return; }
            
            const pr = project({ x: p.x - state.w/2, y: p.y - state.h/2, z: p.z });
            const perspectiveR = p.r * pr.s;
            
            // Outer ring glow
            ctx.strokeStyle = `rgba(${state.themeRGB}, ${alpha * 0.15})`;
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.ellipse(pr.x, pr.y, perspectiveR, perspectiveR * 0.6, 0, 0, Math.PI * 2);
            ctx.stroke();
            
            // Inner ring
            ctx.strokeStyle = `rgba(${state.themeRGB}, ${alpha * 0.25})`;
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.ellipse(pr.x, pr.y, perspectiveR * 0.7, perspectiveR * 0.42, 0, 0, Math.PI * 2);
            ctx.stroke();
            
            // Center square (3D tilted)
            const sq = perspectiveR * 0.3;
            ctx.strokeStyle = `rgba(${state.themeRGB}, ${alpha * 0.2})`;
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.ellipse(pr.x, pr.y, sq, sq * 0.5, p.phase, 0, Math.PI * 2);
            ctx.stroke();
            
            // Center dot
            const coreGrd = ctx.createRadialGradient(pr.x, pr.y, 0, pr.x, pr.y, 10);
            coreGrd.addColorStop(0, `rgba(255, 255, 255, ${alpha * 0.3})`);
            coreGrd.addColorStop(1, `rgba(${state.themeRGB}, 0)`);
            ctx.fillStyle = coreGrd;
            ctx.fillRect(pr.x - 10, pr.y - 10, 20, 20);
        });
        ctx.restore();
    }

    // DRAW CHAINS (3D MOVING LINKS — perspective depth)
    if (state.chainsAlpha > 0.01) {
        ctx.save();
        ctx.globalAlpha = state.chainsAlpha;
        state.chains.forEach(c => {
            c.offset += c.speed * dt;
            const linkW = c.linkW;
            const linkH = c.linkH;
            const fullLink = linkW + c.gap;
            const scroll = c.offset % fullLink;
            
            // 3D perspective: chains closer to center are brighter/larger
            const distFromCenter = Math.abs(c.y - state.h / 2) / (state.h / 2);
            const depthAlpha = (1 - distFromCenter * 0.4) * (0.15 + c.z * 0.2);
            const depthScale = 1 + c.z * 0.5;
            
            ctx.strokeStyle = `rgba(${state.themeRGB}, ${depthAlpha})`;
            ctx.lineWidth = (1 + c.z * 2) * depthScale;
            
            // Subtle glow for front chains
            if (c.z > 0.6) {
                ctx.shadowBlur = 8;
                ctx.shadowColor = `rgba(${state.themeRGB}, 0.15)`;
            }
            
            for (let x = -fullLink; x < state.w + fullLink; x += fullLink) {
                const finalX = x + scroll;
                const r = 8;
                
                // Rounded rectangle link
                ctx.beginPath();
                ctx.moveTo(finalX + r, c.y);
                ctx.lineTo(finalX + linkW - r, c.y);
                ctx.quadraticCurveTo(finalX + linkW, c.y, finalX + linkW, c.y + r);
                ctx.lineTo(finalX + linkW, c.y + linkH - r);
                ctx.quadraticCurveTo(finalX + linkW, c.y + linkH, finalX + linkW - r, c.y + linkH);
                ctx.lineTo(finalX + r, c.y + linkH);
                ctx.quadraticCurveTo(finalX, c.y + linkH, finalX, c.y + linkH - r);
                ctx.lineTo(finalX, c.y + r);
                ctx.quadraticCurveTo(finalX, c.y, finalX + r, c.y);
                ctx.stroke();
                
                // Inner glow line
                if (c.z > 0.4) {
                    ctx.strokeStyle = `rgba(${state.themeRGB}, ${depthAlpha * 0.4})`;
                    ctx.lineWidth = 0.5;
                    ctx.beginPath();
                    ctx.moveTo(finalX + r + 2, c.y + 2);
                    ctx.lineTo(finalX + linkW - r - 2, c.y + 2);
                    ctx.stroke();
                    ctx.strokeStyle = `rgba(${state.themeRGB}, ${depthAlpha})`;
                    ctx.lineWidth = (1 + c.z * 2) * depthScale;
                }
            }
            ctx.shadowBlur = 0;
        });
        ctx.restore();
    }

    requestAnimationFrame(draw);
  }

  // --- REPOSITION: smoothly snap particles to target layout for current theme ---
  let repositionUntil = 0;
  function reposition(durationMs) {
    repositionUntil = performance.now() + (durationMs || 800);
  }

  function repositionStep(now, dt) {
    if (now > repositionUntil) return;
    const t = Math.min(1, (repositionUntil - now) / 400);
    const ease = t * t * (3 - 2 * t);
    const activeBg = document.body.getAttribute('data-background');
    const bhX = cfg.blackHoleCenter.x - state.w / 2;
    const bhY = cfg.blackHoleCenter.y - state.h / 2;

    state.particles.forEach((p, i) => {
      let tx, ty, tz;
      if (activeBg === 'BLACK_HOLE') {
        const angle = (i / state.particles.length) * Math.PI * 2;
        const r = 180 + (i % 5) * 30;
        const layerZ = (i % 7 - 3) * 80;
        tx = bhX + Math.cos(angle) * r;
        ty = bhY + Math.sin(angle) * r;
        tz = layerZ;
      } else if (activeBg === 'FLOWERS') {
        const col = i % 6;
        const row = Math.floor(i / 6);
        tx = -300 + col * 120 + (Math.random() - 0.5) * 40;
        ty = 200 + row * 80 - (i % 3) * 60;
        tz = (i % 5 - 2) * 50;
      } else if (activeBg === 'NEXUS') {
        const col = i % 8;
        tx = -400 + col * 110;
        ty = (Math.random() - 0.5) * 800;
        tz = (i % 4 - 2) * 100;
      } else if (activeBg === 'NEBULA') {
        const angle = (i / state.particles.length) * Math.PI * 2;
        const r = 200 + (i % 4) * 100;
        tx = Math.cos(angle + i * 0.3) * r;
        ty = Math.sin(angle + i * 0.5) * r;
        tz = (i % 6 - 3) * 70;
      } else if (activeBg === 'CONSTELLATION') {
        const phi = Math.acos(1 - 2 * (i + 0.5) / state.particles.length);
        const theta = Math.PI * (1 + Math.sqrt(5)) * i;
        const r = 500;
        tx = r * Math.sin(phi) * Math.cos(theta);
        ty = r * Math.sin(phi) * Math.sin(theta);
        tz = r * Math.cos(phi) * 0.5;
      } else if (activeBg === 'PULSE') {
        const ring = i % 4;
        const angle = (i / state.particles.length) * Math.PI * 2 + ring * 0.5;
        const r = 150 + ring * 100;
        tx = Math.cos(angle) * r;
        ty = Math.sin(angle) * r;
        tz = (ring - 2) * 60;
      } else if (activeBg === 'CHAINS') {
        tx = (Math.random() - 0.5) * 1200;
        ty = (i / state.particles.length) * 1200 - 600;
        tz = (i % 5 - 2) * 80;
      } else {
        // HOLO default: spread in 3D space
        tx = (Math.random() - 0.5) * 1400;
        ty = (Math.random() - 0.5) * 1400;
        tz = (Math.random() - 0.5) * 1000;
      }

      p.x += (tx - p.x) * ease * 0.08;
      p.y += (ty - p.y) * ease * 0.08;
      p.z += (tz - p.z) * ease * 0.08;
      p.vx *= 0.9;
      p.vy *= 0.9;
      p.vz *= 0.9;
    });
  }

  resize();
  window.addEventListener("resize", resize);
  draw();

  return { setPointer, freezeFor, pulseGlitch, setZoom, setThemeColor, reposition };
}
})();
