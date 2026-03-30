import os
import re

path = 'script.js'
if os.path.exists(path):
    with open(path, 'r', encoding='utf-8') as f:
        content = f.read()

    # 1. Provide the definitive components
    correct_loadMe = '''
  async function loadMeAndShowDock() {
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
    } catch(e) { me = null; }
  }
'''

    correct_renderShop = '''
  window.renderShop = async function() {
    const list = $("#shop-list");
    if (!list) return;
    list.innerHTML = "";
    const items = [{ id: "BLACK_HOLE", name: "Black Hole Theme", price: 1500, desc: "A premium singularity background with particle physics." }];
    items.forEach(item => {
      const card = document.createElement("div");
      card.className = "card glass shopItem widget-animated";
      const isOwned = me && me.ownedBackgrounds && me.ownedBackgrounds.includes(item.id);
      card.innerHTML = `
        <div class="cardTitle" style="font-size: 14px;">${item.name}</div>
        <div class="muted mono mb-10" style="font-size: 11px;">${item.desc}</div>
        <div class="row between">
          <span class="mono">${item.price} L</span>
          <button class="btn primary minimal buyBtn" ${isOwned ? 'disabled' : ''}>${isOwned ? 'КУПЛЕНО' : 'КУПИТЬ'}</button>
        </div>`;
      card.onmouseenter = () => { if (background) document.body.setAttribute('data-background', item.id); };
      card.onmouseleave = () => { if (background && me) document.body.setAttribute('data-background', me.activeBackground || 'HOLO'); };
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
'''

    global_ui_logic = '''
  function initGlobalUI() {
    const replenishBtn = $("#replenishBtn");
    if (replenishBtn) replenishBtn.onclick = () => $("#rechargeModal")?.classList.remove("hidden");
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
         if (!me) return;
         const list = $("#ownedBgList");
         if (!list) return;
         list.innerHTML = "";
         const owned = me.ownedBackgrounds || ["HOLO"];
         const bgs = [{id:"HOLO", name:"Holograph"}, {id:"BLACK_HOLE", name:"Black Hole"}];
         bgs.forEach(bg => {
           if (!owned.includes(bg.id)) return;
           const div = document.createElement("div");
           div.className = `bgItem ${ (me.activeBackground || "HOLO") === bg.id ? "active" : "" }`;
           div.textContent = bg.name;
           div.onclick = async () => {
             try {
               await apiJson("/api/background/set", { method: "POST", body: { backgroundId: bg.id } });
               showToast("Фон обновлен");
               $("#bgModal")?.classList.add("hidden");
               location.reload();
             } catch(e) { showToast(e.message); }
           };
           list.appendChild(div);
         });
         $("#bgModal")?.classList.remove("hidden");
       }
    }
  }
'''

    # CLEANUP
    # 1. Remove all loadMeAndShowDock
    content = re.sub(r'async function loadMeAndShowDock\(\) \{.*?\}', '', content, flags=re.DOTALL)
    # 2. Remove all initGlobalUI
    content = re.sub(r'function initGlobalUI\(\) \{.*?\}', '', content, flags=re.DOTALL)
    content = content.replace('initGlobalUI();', '')
    # 3. Remove all renderShop
    content = re.sub(r'window.renderShop = async function\(\) \{.*?\}', '', content, flags=re.DOTALL)
    
    # 4. Remove the mess inside setupCustomization (between initGlobalUI search and Case Modal)
    # We'll just replace the whole setupCustomization if needed, but let's try to be precise.
    content = re.sub(r'// GLOBAL UI LISTENERS.*?// Case Modal', '// Case Modal', content, flags=re.DOTALL)
    
    # 5. Inject back
    # loadMeAndShowDock after let me = null
    content = content.replace('let me = null;', 'let me = null;' + correct_loadMe)
    
    # renderShop and initGlobalUI at the end of IIFE
    injection = correct_renderShop + global_ui_logic + '\\n  initGlobalUI();\\n'
    content = content.replace('})();', injection + '})();')
    
    # Final check: remove any leaked L`; or similar
    content = content.replace('L`;', '').replace(')` : \'none\';', '')

    with open(path, 'w', encoding='utf-8') as f:
        f.write(content)
    print("Script finalized.")
else:
    print("script.js not found.")
