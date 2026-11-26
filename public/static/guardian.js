(() => {
  "use strict";
  const V = window.AiraViews = window.AiraViews || {};
  const make = (tag, cls, value) => {
    const node = document.createElement(tag);
    if (cls) node.className = cls;
    if (value !== undefined) node.textContent = value;
    return node;
  };
  async function permission(name) {
    try {
      if (!navigator.permissions || !navigator.permissions.query) return "Not exposed by browser";
      const result = await navigator.permissions.query({ name });
      return result.state;
    } catch (_) { return "Not exposed by browser"; }
  }
  V.guardian = {
    mount() {},
    async show(root) {
      root.replaceChildren();
      root.className = "view page-wrap guardian-page";
      const head = make("div","guardian-head");
      const eyebrow = make("span","cc-eyebrow","AIRA SECURITY SYSTEM");
      const title = make("h2","","Aira Guardian");
      const intro = make("p","","A privacy snapshot for this browser session. Guardian checks browser signals only; it does not scan your device or network.");
      head.append(eyebrow,title,intro);
      const summary = make("section","guardian-summary");
      const score = make("div","guardian-score");
      const scoreNum = make("strong","","--");
      const scoreLabel = make("span","","CHECKS PASSED");
      score.append(scoreNum,scoreLabel);
      const summaryText = make("div","guardian-summary-copy");
      summaryText.append(make("b","","Session security overview"),make("p","","Checking secure context, browser capabilities and permission states."));
      summary.append(score,summaryText);
      const grid = make("div","guardian-grid");
      const note = make("p","guardian-note","Permission checks never request access. You control camera and microphone permissions in your browser settings.");
      const refresh = make("button","primary guardian-refresh","↻  Run checks again");
      refresh.type = "button";
      const checks = [
        ["Secure connection","HTTPS / secure context",async()=>window.isSecureContext ? "Secure" : "Not secure"],
        ["Camera permission","Browser permission state",()=>permission("camera")],
        ["Microphone permission","Browser permission state",()=>permission("microphone")],
        ["Notifications","Browser permission state",async()=>("Notification" in window ? Notification.permission : "Not supported")],
        ["Local storage","AIRA browser storage availability",async()=>{try{localStorage.setItem("__aira_guardian_check","1");localStorage.removeItem("__aira_guardian_check");return "Available";}catch(_){return "Blocked";}}],
        ["Browser platform","Browser-reported platform",async()=>navigator.userAgentData?.platform || navigator.platform || "Not available"]
      ];
      const run = async () => {
        refresh.disabled = true; refresh.textContent = "Checking…";
        grid.replaceChildren();
        let passed = 0;
        for (const [name,desc,fn] of checks) {
          const card = make("article","guardian-check");
          card.append(make("span","guardian-check-icon","◇"),make("b","",name),make("small","",desc));
          const value = make("strong","guardian-value","Checking…");
          card.append(value); grid.append(card);
          try {
            const result = await fn();
            value.textContent = result;
            const good = ["Secure","granted","Available","default","prompt"].includes(String(result));
            value.classList.add(good ? "good" : "neutral");
            if (good) passed++;
          } catch (_) { value.textContent = "Unavailable"; value.classList.add("neutral"); }
        }
        scoreNum.textContent = passed + "/" + checks.length;
        summaryText.querySelector("p").textContent = "Checks are informational browser signals, not a full security audit.";
        refresh.disabled = false; refresh.textContent = "↻  Run checks again";
      };
      refresh.addEventListener("click",run);
      root.append(head,summary,grid,note,refresh);
      await run();
    }
  };
})();