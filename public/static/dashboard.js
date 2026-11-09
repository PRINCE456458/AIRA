(() => {
  "use strict";
  const $ = (s) => document.querySelector(s);
  const VIEWS = { home: "Home", chat: "AI Chat", projects: "Projects", help: "Help & Support" };
  const COLLAPSE_KEY = "aira_side_collapsed";

  // Sections that are planned but NOT built yet. They are shown honestly as "Soon" and cannot be clicked.
  const SOON = [
    ["Library", "i-folder"], ["Image Studio", "i-image"], ["Voice Studio", "i-mic"],
    ["Tasks", "i-check"], ["Reminders", "i-bell"], ["Study Planner", "i-book"], ["PDF & DOCX Creator", "i-doc"],
    ["Expenses", "i-wallet"], ["Memory", "i-brain"], ["Plugins & Toolbox", "i-plug"], ["Settings", "i-cog"],
    ["Pro / Subscription", "i-star"],
  ];

  const MODE_INFO = {
    aira: ["General help", "Ask anything. Short, friendly answers."],
    study: ["Study helper", "Step-by-step explanations with a quick check question."],
    coder: ["Coder", "Beginner-friendly code with simple explanations."],
    friend: ["Friend", "A warm, casual chat when you just want to talk."],
    builder: ["Website builder", "Describe a site, then preview or download it."],
  };

  const el = (tag, cls, text) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined) n.textContent = text;
    return n;
  };
  const icon = (id) => {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("class", "ic");
    const use = document.createElementNS("http://www.w3.org/2000/svg", "use");
    use.setAttribute("href", "#" + id);
    svg.appendChild(use);
    return svg;
  };
  const state = () => (window.AiraApp ? window.AiraApp.state : null);

  // ---------- sidebar ----------
  const shell = $("#shell"), sideScrim = $("#sideScrim");
  const isMobile = () => window.matchMedia("(max-width: 899px)").matches;
  function openSide() { shell.classList.add("side-open"); sideScrim.hidden = false; }
  function closeSide() { shell.classList.remove("side-open"); sideScrim.hidden = true; }
  $("#sideBtn").addEventListener("click", () => (shell.classList.contains("side-open") ? closeSide() : openSide()));
  sideScrim.addEventListener("click", closeSide);
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeSide(); });
  window.addEventListener("resize", () => { if (!isMobile()) closeSide(); });
  try { if (localStorage.getItem(COLLAPSE_KEY) === "1") shell.classList.add("collapsed"); } catch (e) { /* ignore */ }
  $("#collapseBtn").addEventListener("click", () => {
    shell.classList.toggle("collapsed");
    try { localStorage.setItem(COLLAPSE_KEY, shell.classList.contains("collapsed") ? "1" : "0"); } catch (e) { /* ignore */ }
  });

  const soonNav = $("#soonNav");
  SOON.forEach(([name, ic]) => {
    const row = el("div", "nav-item soon");
    row.setAttribute("aria-disabled", "true");
    row.title = name + " is coming soon";
    row.appendChild(icon(ic));
    row.appendChild(el("span", "side-text", name));
    row.appendChild(el("span", "pill side-text", "Soon"));
    soonNav.appendChild(row);
  });
  const soonList = $("#soonList");
  SOON.forEach(([name]) => soonList.appendChild(el("span", "tagchip", name)));

  // ---------- routing (#/home, #/chat, #/help) ----------
  let current = "";
  function route() {
    const m = location.hash.match(/^#\/(\w+)(?:\/([a-f0-9]{16}))?/) || [];
    const name = m[1];
    const view = VIEWS[name] ? name : "home";
    current = view;
    Object.keys(VIEWS).forEach((v) => { $("#view-" + v).hidden = v !== view; });
    document.querySelectorAll(".nav-item[data-view]").forEach((a) => {
      const on = a.dataset.view === view;
      a.classList.toggle("active", on);
      if (on) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current");
    });
    $("#viewTitle").textContent = VIEWS[view];
    document.title = VIEWS[view] + " - Aira AI";
    closeSide();
    if (view === "chat" && window.AiraApp) window.AiraApp.showChat();
    if (view === "home") refreshUsage();
    render();
    document.dispatchEvent(new CustomEvent("aira:route", { detail: { view, arg: view === "projects" ? m[2] || "" : "" } }));
  }
  window.addEventListener("hashchange", route);

  // ---------- Home ----------
  let usage = null;
  async function refreshUsage() {
    try {
      const r = await fetch("/api/usage");
      usage = r.ok ? await r.json() : null;
    } catch (e) { usage = null; }
    renderUsage();
  }
  function renderUsage() {
    const text = $("#usageText"), note = $("#usageNote"), bar = $("#usageBar");
    if (!usage) {
      text.textContent = "Not available right now";
      note.textContent = "Usage could not be loaded. Chat still works.";
      bar.style.width = "0%";
      return;
    }
    text.textContent = usage.left + " of " + usage.limit + " messages left";
    const pct = Math.min(100, Math.round((usage.used / Math.max(usage.limit, 1)) * 100));
    bar.style.width = pct + "%";
    $("#usageBarWrap").setAttribute("aria-valuenow", String(pct));
    note.textContent = usage.loggedIn ? "Logged-in accounts get a higher daily limit. It resets every day." : "Log in for a higher daily limit. It resets every day.";
  }

  function renderModes(s) {
    const box = $("#modeCards");
    box.replaceChildren();
    s.modes.forEach((m) => {
      const info = MODE_INFO[m.id] || [m.label, "Start a chat in this mode."];
      const card = el("button", "mode-card");
      card.type = "button";
      card.appendChild(el("b", "", info[0]));
      card.appendChild(el("span", "", info[1]));
      card.addEventListener("click", () => { window.AiraApp.startChat(m.id); location.hash = "#/chat"; });
      box.appendChild(card);
    });
  }

  function renderRecent(s) {
    const list = $("#recentList"), empty = $("#recentEmpty"), login = $("#homeLogin");
    list.replaceChildren();
    login.hidden = !!s.user;
    if (s.user) {
      if (!s.savedChats.length) { empty.textContent = "No saved chats yet. Start one and it will appear here."; return; }
      empty.textContent = "";
      s.savedChats.slice(0, 5).forEach((c) => {
        const li = el("li");
        const b = el("button", "recent-item", c.title);
        b.type = "button";
        b.addEventListener("click", async () => { await window.AiraApp.openSaved(c.id); location.hash = "#/chat"; });
        li.appendChild(b);
        list.appendChild(li);
      });
    } else if (s.hasMessages) {
      empty.textContent = "You have a chat in progress in this browser.";
      const li = el("li"); const b = el("a", "recent-item", "Continue your chat"); b.href = "#/chat"; li.appendChild(b); list.appendChild(li);
    } else {
      empty.textContent = "Chats are kept only in this browser until you log in.";
    }
  }

  function renderCaps(s) {
    const caps = $("#capList");
    caps.replaceChildren();
    const rows = [
      ["AI chat with 5 modes", true],
      ["Website builder with preview", true],
      ["Saved chats (needs an account)", true],
      ["Projects with custom instructions (needs an account)", true],
      ["Web search with sources", !!s.features.search],
      ["Photo understanding", !!s.features.image],
    ];
    rows.forEach(([name, on]) => {
      const li = el("li", on ? "on" : "off");
      li.appendChild(el("span", "dot"));
      li.appendChild(el("span", "", name));
      li.appendChild(el("em", "", on ? "On" : "Off"));
      caps.appendChild(li);
    });
  }

  function renderHello(s) {
    const name = s.user ? s.user.split("@")[0] : "";
    $("#homeHello").textContent = name ? "Welcome back, " + name : "Welcome to Aira";
  }

  // ---------- Help ----------
  async function setupHelp() {
    $("#helpFeedback").addEventListener("click", () => $("#openFeedback").click());
    try {
      const cfg = await (await fetch("/api/config")).json();
      if (cfg.whatsapp && /^https:\/\/wa\.me\//.test(cfg.whatsapp)) { const a = $("#helpWhatsapp"); a.href = cfg.whatsapp; a.hidden = false; }
      if (cfg.instagram && /^https:\/\//.test(cfg.instagram)) { const a = $("#helpInsta"); a.href = cfg.instagram; a.hidden = false; }
    } catch (e) { /* help still works without these */ }
  }

  $("#homeLogin").addEventListener("click", () => $("#accountBtn").click());

  function render() {
    const s = state();
    if (!s) return;
    renderHello(s);
    renderModes(s);
    renderRecent(s);
    renderCaps(s);
  }
  document.addEventListener("aira:update", () => { render(); if (current === "home") refreshUsage(); });

  setupHelp();
  route();
})();
