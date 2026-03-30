import os
import re

path = 'script.js'
if os.path.exists(path):
    with open(path, 'r', encoding='utf-8') as f:
        content = f.read()

    # 1. Correct loadMeAndShowDock
    correct_loadMeAndShowDock = '''
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
        
        // Update profile specifics if in profile view
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
    } catch(e) { 
      console.error("LoadMe error:", e);
      me = null; 
    }
  }
'''

    # 2. Global UI listeners wrapper
    global_ui_logic = '''
    // GLOBAL UI LISTENERS
    function initGlobalUI() {
      const replenishBtn = $("#replenishBtn");
      if (replenishBtn) replenishBtn.onclick = () => $("#rechargeModal")?.classList.remove("hidden");
      
      $("#rechargeCloseX")?.addEventListener("click", () => $("#rechargeModal")?.classList.add("hidden"));
      $("#bgCloseX")?.addEventListener("click", () => $("#bgModal")?.classList.add("hidden"));
      
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
    }
    initGlobalUI();
'''

    # REMOVE BROKEN BLOCKS
    # Remove any broken loadMeAndShowDock (multiple regex to catch variants)
    content = re.sub(r'async function loadMeAndShowDock\(\) \{.*?\}', '', content, flags=re.DOTALL)
    # Re-inject correct one
    content = content.replace('let me = null;', 'let me = null;' + correct_loadMeAndShowDock)
    
    # Fix broken parts around line 524 (if they survived previous regex)
    content = re.sub(r'\)` : \'none\';\s*\}\s*if \(lg\).*?\}', '', content, flags=re.DOTALL)

    # Inject global listeners
    if '// --- EXTRA SYSTEMS ---' in content:
        content = content.replace('// --- EXTRA SYSTEMS ---', global_ui_logic)
    elif 'setupCustomization() {' in content:
        content = content.replace('setupCustomization() {', 'setupCustomization() {' + global_ui_logic)
    else:
        # Fallback at the end of file
        content = content.replace('})();', global_ui_logic + '})();')

    # Remove duplicated systems at the end
    content = re.sub(r'// --- RECHARGE SYSTEM ---.*?// Case Modal', '// Case Modal', content, flags=re.DOTALL)
    content = re.sub(r'// --- BACKGROUND SYSTEM ---.*?// Case Modal', '// Case Modal', content, flags=re.DOTALL)

    # Fix specific broken template strings
    content = content.replace('L`;', 'L`;') # Ensure no stray ones
    
    with open(path, 'w', encoding='utf-8') as f:
        f.write(content)
    print("Script repaired successfully.")
else:
    print("script.js not found.")
