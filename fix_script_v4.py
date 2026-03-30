import os

def find_matching_brace(text, start_index):
    count = 0
    for i in range(start_index, len(text)):
        if text[i] == '{':
            count += 1
        elif text[i] == '}':
            count -= 1
            if count == 0:
                return i
    return -1

path = 'script.js'
if os.path.exists(path):
    with open(path, 'r', encoding='utf-8') as f:
        content = f.read()

    # 1. Remove all instances of loadMeAndShowDock
    while True:
        idx = content.find('async function loadMeAndShowDock()')
        if idx == -1: break
        brace_idx = content.find('{', idx)
        if brace_idx == -1: break
        end_idx = find_matching_brace(content, brace_idx)
        if end_idx == -1: 
            # If not found, just remove till next major block or end
            next_func = content.find('function', brace_idx)
            content = content[:idx] + (content[next_func:] if next_func != -1 else '')
        else:
            content = content[:idx] + content[end_idx+1:]

    # 2. Remove all instances of initGlobalUI
    while True:
        idx = content.find('function initGlobalUI()')
        if idx == -1: break
        brace_idx = content.find('{', idx)
        if brace_idx == -1: break
        end_idx = find_matching_brace(content, brace_idx)
        if end_idx == -1: break
        content = content[:idx] + content[end_idx+1:]
        
    # 3. Remove all instances of renderShop (both window. and function)
    patterns = ['window.renderShop = async function', 'async function renderShop']
    for p in patterns:
        while True:
            idx = content.find(p)
            if idx == -1: break
            brace_idx = content.find('{', idx)
            if brace_idx == -1: break
            end_idx = find_matching_brace(content, brace_idx)
            if end_idx == -1: break
            content = content[:idx] + content[end_idx+1:]

    # 4. Final Cleanup of stray residues
    content = content.replace('initGlobalUI();', '')
    content = content.replace('L`;', '').replace(')` : \'none\';', '')
    # Remove any stray 'window.renderShop = async function' or similar that might have survived without braces
    content = content.replace('window.renderShop = async function', '')

    # 5. Definitions to Inject
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

    # Re-inject cleanly
    content = content.replace('let me = null;', 'let me = null;' + correct_loadMe)
    injection = correct_renderShop + global_ui_logic + '\\n  initGlobalUI();\\n'
    content = content.replace('})();', injection + '})();')

    with open(path, 'w', encoding='utf-8') as f:
        f.write(content)
    print("Script repaired correctly with brace matching.")
else:
    print("script.js not found.")
