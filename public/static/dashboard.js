(() => {
  "use strict";
  const $ = (s) => document.querySelector(s);
  const NAV = [
    [null, [["home", "Home", "i-home"], ["chat", "AI Chat", "i-chat"], ["projects", "Projects", "i-folder"]]],
    ["Create", [["write", "Writing Studio", "i-pen"], ["image", "Image Studio", "i-image"], ["voice", "Voice Studio", "i-mic"], ["files", "PDF & DOCX Creator", "i-doc"]]],
    ["Learn", [["research", "Research", "i-search"], ["docs", "PDF & Notes", "i-doc"], ["planner", "Study Planner", "i-book"]]],
    ["Organise", [["tasks", "Tasks", "i-check"], ["reminders", "Reminders", "i-bell"], ["expenses", "Expenses", "i-wallet"], ["library", "Library", "i-folder"], ["memory", "Memory", "i-brain"]]],
    ["More", [["toolbox", "Toolbox", "i-plug"], ["settings", "Settings", "i-cog"], ["pro", "Pro / Subscription", "i-star"], ["help", "Help & Support", "i-help"]]],
  ];
  const VIEWS = {};
  NAV.forEach(([, items]) => items.forEach(([id, name]) => { VIEWS[id] = name; }));
  const TOOL_INFO = {
    write: "Blogs, emails, captions, rewriting and grammar fixes.",
    image: "Turn a description into a picture.",
    voice: "Speak to type, or hear text read aloud.",
    files: "Make a PDF, Word or text file from your text.",
    research: "Search the web and get a summary with sources.",
    docs: "Upload a PDF, then summarise it or ask questions.",
    planner: "Turn an exam date into a day-by-day plan.",
    tasks: "A simple to-do list with due dates.",
    reminders: "Get a reminder at a set date and time.",
    expenses: "Track spending by category and month.",
    library: "Everything you saved, in one place.",
    memory: "Tell Aira things to remember about you.",
    toolbox: "Word counter, CGPA calculator, timer and more.",
    settings: "Your name, default mode and your data.",
    projects: "Group chats and give Aira standing instructions.",
    pro: "See your plan and limits.",
  };
  const COLLAPSE_KEY = "aira_side_collapsed";

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

  // ---------- side menu (built from NAV above) ----------
  const sideNav = $("#sideNav");
  NAV.forEach(([label, items]) => {
    if (label) sideNav.appendChild(el("p", "side-label side-text", label));
    items.forEach(([id, name, ic]) => {
      const a = el("a", "nav-item");
      a.href = "#/" + id; a.dataset.view = id; a.title = name;
      a.appendChild(icon(ic));
      a.appendChild(el("span", "side-text", name));
      sideNav.appendChild(a);
    });
  });

  // ---------- routing (#/home, #/chat, #/projects, #/write ...) ----------
  let current = "";
  function ensureSection(name) {
    let sec = $("#view-" + name);
    if (!sec) {
      sec = el("section", "view page-wrap"); sec.id = "view-" + name; sec.hidden = true;
      sec.setAttribute("aria-label", VIEWS[name]);
      $(".main").appendChild(sec);
    }
    return sec;
  }
  function showModule(name, arg) {
    const sec = ensureSection(name), mod = window.AiraViews[name];
    const who = (state() && state().user) || "";
    if (!sec.dataset.mounted) { mod.mount(sec); sec.dataset.mounted = "1"; }
    sec.dataset.user = who;
    mod.show(sec, arg);
  }
  function route() {
    const m = location.hash.match(/^#\/(\w+)(?:\/([a-f0-9]{16}))?/) || [];
    const name = m[1];
    const view = VIEWS[name] ? name : "home";
    current = view;
    const mod = (window.AiraViews || {})[view];
    if (mod) ensureSection(view);
    document.querySelectorAll(".main > .view").forEach((sec) => { sec.hidden = sec.id !== "view-" + view; });
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
    if (mod) showModule(view, m[2] || "");
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
      ["Writing Studio, PDF & Notes, Tasks, Expenses, Memory", true],
      ["Web search and Research assistant", !!s.features.search],
      ["Photo understanding", !!s.features.image],
      ["Image Studio (picture generation)", !!s.features.imageGen],
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
    renderTools();
  }
  function renderTools() {
    const box = $("#toolCards");
    if (box.dataset.done) return;
    box.dataset.done = "1";
    NAV.forEach(([, items]) => items.forEach(([id, name]) => {
      if (!TOOL_INFO[id]) return;
      const card = el("a", "mode-card"); card.href = "#/" + id;
      card.appendChild(el("b", "", name)); card.appendChild(el("span", "", TOOL_INFO[id]));
      box.appendChild(card);
    }));
  }
  document.addEventListener("aira:update", () => {
    render(); if (current === "home") refreshUsage();
    // a section built by views1/views2 is redrawn when the person logs in or out
    const sec = window.AiraViews && window.AiraViews[current] ? $("#view-" + current) : null;
    if (sec && sec.dataset.mounted && sec.dataset.user !== ((state() && state().user) || "")) showModule(current, "");
  });

  setupHelp();
  route();
})();
