import os
import re

path = 'script.js'
if os.path.exists(path):
    with open(path, 'r', encoding='utf-8') as f:
        lines = f.readlines()

    new_lines = []
    skip_until = None
    load_me_added = False
    
    # Correct version to inject
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

    global_ui_logic = '''
    function initGlobalUI() {
      const replenishBtn = $("#replenishBtn");
      if (replenishBtn) replenishBtn.onclick = () => $("#rechargeModal")?.classList.remove("hidden");
      $("#rechargeCloseX")?.onclick = () => $("#rechargeModal")?.classList.add("hidden");
      $("#bgCloseX")?.onclick = () => $("#bgModal")?.classList.add("hidden");
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

    i = 0
    while i < len(lines):
        line = lines[i]
        
        # Detect broken clones or any loadMeAndShowDock
        if 'async function loadMeAndShowDock()' in line or ' L`;' in line or ' )` : \'none\';' in line:
            # Skip until we find the end of this mess or next function
            while i < len(lines) and 'let customEmojisHtml' not in lines[i] and 'window.renderShop = async function' not in lines[i] and 'function updateProfileAvatarView' not in lines[i]:
                i += 1
            if not load_me_added:
                new_lines.append(correct_loadMe + '\\n')
                load_me_added = True
            continue
            
        if 'let me = null;' in line:
            new_lines.append(line)
            if not load_me_added:
                new_lines.append(correct_loadMe + '\\n')
                load_me_added = True
            i += 1
            continue

        if '// --- EXTRA SYSTEMS ---' in line:
            new_lines.append(global_ui_logic + '\\n')
            i += 1
            continue

        new_lines.append(line)
        i += 1

    # Final cleanup of duplicated extra systems
    final_content = "".join(new_lines)
    # Remove any stray duplicated initGlobalUI
    parts = final_content.split('function initGlobalUI()')
    if len(parts) > 2:
        final_content = parts[0] + 'function initGlobalUI()' + parts[1] + "".join(parts[2:])

    with open(path, 'w', encoding='utf-8') as f:
        f.write(final_content)
    print("Script repaired aggressively.")
else:
    print("script.js not found.")
