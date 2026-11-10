// Tool sections, part 2: Voice, Tasks, Reminders, Study Planner, Expenses, Memory, Toolbox, Settings, Pro.
(() => {
  "use strict";
  const K = window.AiraKit, V = window.AiraViews;
  const { el, call, toast, card, field, input, textarea, select, button, busy, status, say, empty, needLogin, pageHead } = K;
  const todayStr = () => { const d = new Date(); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); };
  const nowLocal = () => { const d = new Date(); return todayStr() + "T" + String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0"); };

  // ====================== Voice Studio (uses the browser's own speech tools) ======================
  V.voice = {
    mount() {},
    show(root) {
      root.replaceChildren();
      pageHead(root, "Voice Studio", "Speak to type, or hear any text read aloud. Voice runs in your browser, so nothing is sent for it.");
      const Rec = window.SpeechRecognition || window.webkitSpeechRecognition;
      const canSpeak = "speechSynthesis" in window;
      const c = card("Your text");
      const text = textarea(7, { maxlength: "5000", placeholder: "Press Start speaking, or type here..." });
      const msg = status();
      let rec = null, listening = false;
      const lang = select([["en-IN", "English (India)"], ["en-US", "English (US)"], ["en-GB", "English (UK)"], ["hi-IN", "Hindi"]]);
      const speak = button("Start speaking", "primary");
      if (!Rec) { speak.disabled = true; say(msg, "Speaking to type is not supported in this browser. Try Chrome or Edge.", true); }
      speak.addEventListener("click", () => {
        if (listening && rec) { rec.stop(); return; }
        rec = new Rec(); rec.lang = lang.value; rec.interimResults = false; rec.continuous = true;
        rec.onresult = (e) => { for (let i = e.resultIndex; i < e.results.length; i++) if (e.results[i].isFinal) text.value = (text.value + " " + e.results[i][0].transcript).trim().slice(0, 5000); };
        rec.onerror = (e) => { say(msg, e.error === "not-allowed" ? "Microphone permission was blocked. Allow the microphone in your browser and try again." : "Voice input stopped (" + e.error + ").", true); };
        rec.onend = () => { listening = false; speak.textContent = "Start speaking"; };
        try { rec.start(); listening = true; speak.textContent = "Stop"; say(msg, "Listening..."); } catch (e) { say(msg, "Could not start the microphone.", true); }
      });
      const voices = select([["", "Default voice"]]), rate = input("range", { min: "0.6", max: "1.5", step: "0.1", value: "1" });
      function loadVoices() { if (!canSpeak) return; const v = speechSynthesis.getVoices(); voices.replaceChildren(); const d = el("option", "", "Default voice"); d.value = ""; voices.appendChild(d); v.forEach((x, i) => { const o = el("option", "", x.name + " (" + x.lang + ")"); o.value = String(i); voices.appendChild(o); }); }
      if (canSpeak) { loadVoices(); speechSynthesis.onvoiceschanged = loadVoices; }
      const read = button("Read aloud", "ghost"), stop = button("Stop reading", "ghost");
      if (!canSpeak) { read.disabled = true; stop.disabled = true; }
      read.addEventListener("click", () => {
        if (!text.value.trim()) { say(msg, "Type or speak some text first.", true); return; }
        speechSynthesis.cancel(); const u = new SpeechSynthesisUtterance(text.value); u.rate = Number(rate.value);
        if (voices.value) u.voice = speechSynthesis.getVoices()[Number(voices.value)];
        u.onerror = () => say(msg, "Reading aloud failed in this browser.", true); speechSynthesis.speak(u); say(msg, "Reading...");
      });
      stop.addEventListener("click", () => { if (canSpeak) speechSynthesis.cancel(); say(msg, ""); });
      const toChat = button("Send to AI Chat", "ghost", () => {
        if (!text.value.trim()) { say(msg, "Type or speak a message first.", true); return; }
        window.AiraApp.newChat(); window.AiraApp.prefillInput(text.value.trim()); location.hash = "#/chat";
      });
      const row1 = el("div", "fieldrow"); row1.append(field("Language for speaking", lang), field("Voice for reading", voices), field("Reading speed", rate));
      const row2 = el("div", "row left"); row2.append(speak, read, stop, button("Copy", "ghost", () => K.copy(text.value)), toChat);
      c.append(text, row1, row2, msg);
      root.appendChild(c);
    },
  };

  // ====================== Tasks and Reminders (same list, two views) ======================
  function taskList(root, kind) {
    const isRem = kind === "reminder";
    pageHead(root, isRem ? "Reminders" : "Tasks", isRem ? "Pick a date and time. Aira shows an alert while this website is open in your browser." : "A simple to-do list. Tasks from your Study Planner show up here too.");
    if (!K.user()) return needLogin(root, "Log in to use " + (isRem ? "Reminders" : "Tasks"));
    const add = card(isRem ? "New reminder" : "New task");
    const title = input("text", { maxlength: "120", placeholder: isRem ? "What should I remind you about?" : "What do you need to do?" });
    const due = input(isRem ? "datetime-local" : "date"); if (isRem) due.value = nowLocal();
    const pr = select([["0", "Low"], ["1", "Normal"], ["2", "High"]], "1");
    const msg = status(), go = button("Add", "primary");
    const row = el("div", "fieldrow"); row.append(field("Title", title), field(isRem ? "When" : "Due date (optional)", due), field("Priority", pr), go);
    add.append(row, msg);
    const listCard = card(), tabs = el("div", "chiprow"), ul = el("ul", "tasks");
    let filter = "open", tasks = [];
    [["open", "To do"], ["done", "Done"], ["all", "All"]].forEach(([k, l]) => { const b = button(l, "tagchip btnchip" + (k === filter ? " on" : ""), () => { filter = k; tabs.querySelectorAll("button").forEach((x) => x.classList.toggle("on", x === b)); draw(); }); tabs.appendChild(b); });
    if (!isRem) tabs.appendChild(button("Clear finished", "ghost small", async () => { if (confirm("Delete all finished tasks?")) { await call("/api/tasks", "DELETE"); load(); } }));
    function draw() {
      ul.replaceChildren();
      const shown = tasks.filter((t) => t.kind === kind && (filter === "all" || (filter === "done") === t.done));
      if (!shown.length) { ul.appendChild(empty(filter === "done" ? "Nothing finished yet." : isRem ? "No reminders. Add one above." : "Nothing to do. Add a task above.")); return; }
      shown.forEach((t) => {
        const li = el("li", "task" + (t.done ? " done" : ""));
        const cb = input("checkbox"); cb.checked = t.done; cb.setAttribute("aria-label", "Mark done");
        cb.addEventListener("change", async () => { const r = await call("/api/tasks/" + t.id, "PATCH", { done: cb.checked }); if (!r.ok) toast(r.data.error || "Could not update.", true); load(); });
        const main = el("div", "task-main"); main.appendChild(el("b", "", t.title));
        const dueText = t.due ? (isRem ? t.due.replace("T", " ") : t.due) : "";
        const overdue = !t.done && t.due && (isRem ? t.due < nowLocal() : t.due < todayStr());
        const meta = [dueText && "Due " + dueText, ["Low", "", "High"][t.priority] && ["Low", "", "High"][t.priority] + " priority", t.tag && "Plan: " + t.tag].filter(Boolean).join(" - ");
        main.appendChild(el("span", "muted small" + (overdue ? " late" : ""), (overdue ? "Overdue. " : "") + meta));
        const edit = button("Edit", "ghost small", () => {
          const i = input("text", { maxlength: "120" }); i.value = t.title; main.replaceChildren(i); i.focus();
          const save = async () => { if (i.value.trim() && i.value.trim() !== t.title) await call("/api/tasks/" + t.id, "PATCH", { title: i.value }); load(); };
          i.addEventListener("blur", save); i.addEventListener("keydown", (e) => { if (e.key === "Enter") i.blur(); if (e.key === "Escape") { i.value = t.title; i.blur(); } });
        });
        li.append(cb, main, edit, button("Delete", "ghost small", async () => { await call("/api/tasks/" + t.id, "DELETE"); load(); }));
        ul.appendChild(li);
      });
    }
    async function load() { const r = await call("/api/tasks"); tasks = r.ok ? r.data.tasks : []; draw(); if (window.AiraReminders) window.AiraReminders.refresh(tasks); }
    go.addEventListener("click", () => busy(go, "Adding...", async () => {
      const r = await call("/api/tasks", "POST", { title: title.value, kind, due: due.value, priority: Number(pr.value) });
      if (!r.ok) { say(msg, r.data.error || "Could not add.", true); return; }
      title.value = ""; say(msg, isRem ? "Reminder added." : "Task added."); if (isRem) { due.value = nowLocal(); try { Notification.requestPermission(); } catch (e) { /* not supported */ } } load();
    }));
    title.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); go.click(); } });
    listCard.append(tabs, ul);
    root.append(add, listCard);
    load();
  }
  V.tasks = { mount() {}, show(root) { root.replaceChildren(); taskList(root, "task"); } };
  V.reminders = { mount() {}, show(root) { root.replaceChildren(); taskList(root, "reminder"); } };

  // Alerts for due reminders while the site is open (a website cannot ring when it is closed).
  const alerted = new Set();
  window.AiraReminders = {
    refresh(tasks) {
      tasks.filter((t) => t.kind === "reminder" && !t.done && t.due && t.due <= nowLocal() && !alerted.has(t.id)).forEach((t) => {
        alerted.add(t.id);
        toast("Reminder: " + t.title);
        try { if (Notification.permission === "granted") new Notification("Aira reminder", { body: t.title }); } catch (e) { /* ignore */ }
      });
    },
  };
  setInterval(async () => { if (K.user() && !document.hidden) { const r = await call("/api/tasks"); if (r.ok) window.AiraReminders.refresh(r.data.tasks); } }, 60000);
  document.addEventListener("aira:update", () => { if (K.user() && !window.AiraReminders.started) { window.AiraReminders.started = true; call("/api/tasks").then((r) => { if (r.ok) window.AiraReminders.refresh(r.data.tasks); }); } else if (!K.user()) window.AiraReminders.started = false; });

  // ====================== Study Planner ======================
  V.planner = {
    mount() {},
    show(root) {
      root.replaceChildren();
      pageHead(root, "Study Planner", "Tell Aira your subjects and exam date. It builds a day-by-day schedule and adds it to your Tasks.");
      if (!K.user()) return needLogin(root, "Log in to use the Study Planner");
      const c = card("Make a plan");
      const name = input("text", { maxlength: "40", placeholder: "Example: Mid-sem exams" });
      const subjects = input("text", { maxlength: "300", placeholder: "Maths, Physics, Programming" });
      const exam = input("date"), tomorrow = new Date(Date.now() + 86400000); exam.min = tomorrow.toISOString().slice(0, 10);
      const hours = input("number", { min: "0.5", max: "12", step: "0.5", value: "3" });
      const msg = status(), out = el("div"), go = button("Create my plan", "primary");
      const row = el("div", "fieldrow"); row.append(field("Plan name", name), field("Subjects (separate with commas)", subjects), field("Exam date", exam), field("Study hours per day", hours));
      go.addEventListener("click", () => busy(go, "Planning...", async () => {
        out.replaceChildren(); say(msg, "");
        const list = subjects.value.split(",").map((s) => s.trim()).filter(Boolean);
        if (!list.length) { say(msg, "Add at least one subject.", true); return; }
        if (!exam.value) { say(msg, "Pick your exam date.", true); return; }
        const r = await call("/api/study-plan", "POST", { name: name.value, subjects: list, exam_date: exam.value, hours: Number(hours.value) });
        if (!r.ok) { say(msg, r.data.error || "Could not make the plan.", true); return; }
        say(msg, r.data.created + " study tasks were added to your Tasks." + (r.data.tips_error ? " " + r.data.tips_error : ""));
        if (r.data.tips) out.appendChild(K.resultBox(r.data.tips, "study-tips"));
        loadPlans();
      }));
      c.append(row, go, msg, out);
      const plans = card("Your plans"), box = el("div");
      plans.appendChild(box);
      async function loadPlans() {
        const r = await call("/api/tasks"); box.replaceChildren();
        const tagged = (r.ok ? r.data.tasks : []).filter((t) => t.tag);
        if (!tagged.length) { box.appendChild(empty("No plans yet.")); return; }
        const byPlan = {}; tagged.forEach((t) => { (byPlan[t.tag] = byPlan[t.tag] || []).push(t); });
        Object.entries(byPlan).forEach(([tag, items]) => {
          const d = items.filter((t) => t.done).length, head = el("div", "plan-head");
          head.appendChild(el("b", "", tag)); head.appendChild(el("span", "muted small", d + " of " + items.length + " done"));
          head.appendChild(button("Delete plan", "ghost small", async () => { if (confirm("Delete the plan \"" + tag + "\" and all its tasks?")) { await call("/api/tasks?tag=" + encodeURIComponent(tag), "DELETE"); loadPlans(); } }));
          const bar = el("div", "bar"); const fill = el("span"); fill.style.width = Math.round((d / items.length) * 100) + "%"; bar.appendChild(fill);
          const ul = el("ul", "tasks");
          items.slice().sort((a, b) => a.due.localeCompare(b.due)).forEach((t) => {
            const li = el("li", "task" + (t.done ? " done" : "")), cb = input("checkbox"); cb.checked = t.done; cb.setAttribute("aria-label", "Mark done");
            cb.addEventListener("change", async () => { await call("/api/tasks/" + t.id, "PATCH", { done: cb.checked }); loadPlans(); });
            const m = el("div", "task-main"); m.appendChild(el("b", "", t.title)); m.appendChild(el("span", "muted small", t.due)); li.append(cb, m); ul.appendChild(li);
          });
          const det = el("details", "faq"); det.appendChild(el("summary", "", "Show the schedule")); det.appendChild(ul);
          box.append(head, bar, det);
        });
      }
      root.append(c, plans);
      loadPlans();
    },
  };

  // ====================== Expenses ======================
  const CATS = ["Food", "Travel", "Study", "Shopping", "Bills", "Fun", "Health", "Other"];
  V.expenses = {
    mount() {},
    show(root) {
      root.replaceChildren();
      pageHead(root, "Expenses", "Write down what you spend and see where your money goes each month.");
      if (!K.user()) return needLogin(root, "Log in to track expenses");
      const add = card("Add an expense");
      const amount = input("number", { min: "0", step: "0.01", placeholder: "Amount" }), cat = select(CATS), day = input("date"), note = input("text", { maxlength: "100", placeholder: "Note (optional)" });
      day.value = todayStr();
      const msg = status(), go = button("Add", "primary");
      const row = el("div", "fieldrow"); row.append(field("Amount", amount), field("Category", cat), field("Date", day), field("Note", note), go);
      add.append(row, msg);
      const sum = card(), monthIn = input("month"); monthIn.value = todayStr().slice(0, 7);
      const total = el("p", "big"), bars = el("div", "cats"), ul = el("ul", "tasks");
      const csv = el("a", "ghost linkbtn", "Download all as CSV"); csv.href = "/api/expenses.csv"; csv.download = "aira-expenses.csv";
      const head = el("div", "fieldrow"); head.append(field("Month", monthIn), csv);
      sum.append(head, total, bars, ul);
      async function load() {
        const r = await call("/api/expenses?month=" + encodeURIComponent(monthIn.value)); ul.replaceChildren(); bars.replaceChildren();
        if (!r.ok) { total.textContent = ""; ul.appendChild(empty(r.data.error || "Could not load.")); return; }
        total.textContent = "Total this month: " + r.data.total.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        const max = Math.max(1, ...Object.values(r.data.by_category));
        Object.entries(r.data.by_category).sort((a, b) => b[1] - a[1]).forEach(([k, v]) => {
          const line = el("div", "catline"); line.appendChild(el("span", "", k));
          const bar = el("div", "bar"), fill = el("span"); fill.style.width = Math.round((v / max) * 100) + "%"; bar.appendChild(fill); line.appendChild(bar);
          line.appendChild(el("b", "", v.toLocaleString())); bars.appendChild(line);
        });
        if (!r.data.expenses.length) { ul.appendChild(empty("No expenses in this month.")); return; }
        r.data.expenses.forEach((x) => {
          const li = el("li", "task"), m = el("div", "task-main");
          m.appendChild(el("b", "", x.amount.toLocaleString(undefined, { minimumFractionDigits: 2 }) + " - " + x.category));
          m.appendChild(el("span", "muted small", x.day + (x.note ? " - " + x.note : "")));
          li.append(m, button("Delete", "ghost small", async () => { await call("/api/expenses/" + x.id, "DELETE"); load(); })); ul.appendChild(li);
        });
      }
      monthIn.addEventListener("change", load);
      go.addEventListener("click", () => busy(go, "Adding...", async () => {
        const r = await call("/api/expenses", "POST", { amount: Number(amount.value), category: cat.value, day: day.value, note: note.value });
        if (!r.ok) { say(msg, r.data.error || "Could not add.", true); return; }
        amount.value = ""; note.value = ""; say(msg, "Added."); monthIn.value = day.value.slice(0, 7) || monthIn.value; load();
      }));
      root.append(add, sum);
      load();
    },
  };

  // ====================== Memory ======================
  V.memory = {
    mount() {},
    async show(root) {
      root.replaceChildren();
      pageHead(root, "Memory", "Tell Aira things to remember about you, like your course or how you like answers. Aira uses them in AI Chat when you are logged in.");
      if (!K.user()) return needLogin(root, "Log in to use Memory");
      const sRes = await call("/api/settings");
      const on = input("checkbox"); on.checked = sRes.ok ? sRes.data.settings.memory_on : true;
      const toggle = el("label", "switch"); toggle.append(on, document.createTextNode(" Let Aira use my memory in chats"));
      on.addEventListener("change", async () => { const r = await call("/api/settings", "PUT", { memory_on: on.checked }); toast(r.ok ? (on.checked ? "Memory is on" : "Memory is off") : "Could not change it", !r.ok); });
      const add = card("Add something to remember"), t = input("text", { maxlength: "200", placeholder: "Example: I like short answers with examples" }), msg = status(), go = button("Remember this", "primary");
      add.append(toggle, field("What should Aira remember?", t), go, msg, el("p", "muted small", "Do not store passwords, bank details or other private secrets here."));
      const list = card("What Aira remembers"), ul = el("ul", "tasks");
      list.appendChild(ul);
      async function load() {
        const r = await call("/api/memories"); ul.replaceChildren();
        if (!r.ok || !r.data.memories.length) { ul.appendChild(empty("Nothing yet.")); return; }
        r.data.memories.forEach((m) => { const li = el("li", "task"); const d = el("div", "task-main"); d.appendChild(el("b", "", m.text)); li.append(d, button("Forget", "ghost small", async () => { await call("/api/memories/" + m.id, "DELETE"); load(); })); ul.appendChild(li); });
      }
      go.addEventListener("click", () => busy(go, "Saving...", async () => {
        const r = await call("/api/memories", "POST", { text: t.value });
        if (!r.ok) { say(msg, r.data.error || "Could not save.", true); return; }
        t.value = ""; say(msg, "Saved."); load();
      }));
      t.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); go.click(); } });
      root.append(add, list);
      load();
    },
  };

  // ====================== Toolbox (all run in your browser) ======================
  V.toolbox = {
    mount() {},
    show(root) {
      root.replaceChildren();
      pageHead(root, "Toolbox", "Small tools for everyday study and work. Everything here runs in your browser.");
      // word counter
      const t1 = card("Word and character counter"), ta = textarea(4, { placeholder: "Paste or type text..." }), r1 = el("p", "big");
      const count = () => { const w = (ta.value.trim().match(/\S+/g) || []).length; r1.textContent = w + " words - " + ta.value.length + " characters - about " + Math.max(w ? 1 : 0, Math.round(w / 200)) + " min to read"; };
      ta.addEventListener("input", count); count(); t1.append(ta, r1);
      // case converter
      const t2 = card("Change text case"), tb = textarea(3, { placeholder: "Text to change..." }), row2 = el("div", "row left");
      const title = (s) => s.toLowerCase().replace(/(^|\s)(\S)/g, (m, a, b) => a + b.toUpperCase());
      [["UPPERCASE", (s) => s.toUpperCase()], ["lowercase", (s) => s.toLowerCase()], ["Title Case", title], ["Sentence case", (s) => s.toLowerCase().replace(/(^\s*|[.!?]\s+)(\S)/g, (m, a, b) => a + b.toUpperCase())]].forEach(([l, f]) => row2.appendChild(button(l, "ghost small", () => { tb.value = f(tb.value); })));
      row2.appendChild(button("Copy", "ghost small", () => K.copy(tb.value))); t2.append(tb, row2);
      // CGPA
      const t3 = card("CGPA to percentage", "Uses the common formula: percentage = CGPA x 9.5 (for a 10-point scale). Your university may use a different one, so check."), cg = input("number", { min: "0", max: "10", step: "0.01", placeholder: "Your CGPA, for example 8.4" }), r3 = el("p", "big");
      cg.addEventListener("input", () => { const v = Number(cg.value); r3.textContent = cg.value !== "" && v >= 0 && v <= 10 ? (v * 9.5).toFixed(2) + " %" : ""; }); t3.append(cg, r3);
      // password
      const t4 = card("Password generator"), len = input("number", { min: "8", max: "64", value: "16" }), out4 = input("text", { readonly: "readonly" }), sym = input("checkbox"); sym.checked = true;
      const gen = () => { const n = Math.min(64, Math.max(8, Number(len.value) || 16)), set = "abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789" + (sym.checked ? "!@#$%&*?" : ""); const a = new Uint32Array(n); crypto.getRandomValues(a); out4.value = Array.from(a, (x) => set[x % set.length]).join(""); };
      const row4 = el("div", "fieldrow"); const sl = el("label", "switch"); sl.append(sym, document.createTextNode(" Symbols"));
      row4.append(field("Length (8-64)", len), sl, button("Generate", "primary", gen), button("Copy", "ghost", () => K.copy(out4.value))); t4.append(row4, out4); gen();
      // JSON
      const t5 = card("JSON checker and formatter"), js = textarea(5, { placeholder: '{"name": "Aira"}' }), m5 = status(), row5 = el("div", "row left");
      row5.append(button("Format", "primary", () => { try { js.value = JSON.stringify(JSON.parse(js.value), null, 2); say(m5, "Valid JSON."); } catch (e) { say(m5, "Not valid JSON: " + e.message, true); } }), button("Minify", "ghost", () => { try { js.value = JSON.stringify(JSON.parse(js.value)); say(m5, "Valid JSON."); } catch (e) { say(m5, "Not valid JSON: " + e.message, true); } }), button("Copy", "ghost", () => K.copy(js.value)));
      t5.append(js, row5, m5);
      // pomodoro
      const t6 = card("Focus timer (Pomodoro)", "Work for 25 minutes, then rest for 5."), clock = el("p", "clock", "25:00"), m6 = status(), row6 = el("div", "row left");
      let left = 25 * 60, work = true, timer = null;
      const show = () => { clock.textContent = String(Math.floor(left / 60)).padStart(2, "0") + ":" + String(left % 60).padStart(2, "0"); };
      const stopT = () => { clearInterval(timer); timer = null; };
      const startT = button("Start", "primary", () => {
        if (timer) { stopT(); startT.textContent = "Start"; return; }
        startT.textContent = "Pause";
        timer = setInterval(() => { left -= 1; show(); if (left <= 0) { work = !work; left = (work ? 25 : 5) * 60; toast(work ? "Break over. Time to focus." : "Great work! Take a 5 minute break."); say(m6, work ? "Focus time" : "Break time"); show(); } }, 1000);
        say(m6, work ? "Focus time" : "Break time");
      });
      row6.append(startT, button("Reset", "ghost", () => { stopT(); work = true; left = 25 * 60; startT.textContent = "Start"; say(m6, ""); show(); })); t6.append(clock, row6, m6);
      const grid = el("div", "grid2"); grid.append(t1, t2); const grid2 = el("div", "grid2"); grid2.append(t3, t4);
      root.append(grid, grid2, t5, t6);
    },
  };

  // ====================== Settings ======================
  V.settings = {
    mount() {},
    async show(root) {
      root.replaceChildren();
      pageHead(root, "Settings", "Your profile, your default mode and your data.");
      if (!K.user()) return needLogin(root, "Log in to open Settings");
      const r = await call("/api/settings"), s = r.ok ? r.data.settings : { name: "", default_mode: "aira", memory_on: true };
      const c = card("Profile and chat");
      const name = input("text", { maxlength: "40", placeholder: "What should Aira call you?" }); name.value = s.name;
      const modes = (K.app().state.modes || []).map((m) => [m.id, m.label]);
      const mode = select(modes.length ? modes : [["aira", "General"]], s.default_mode);
      const mem = input("checkbox"); mem.checked = s.memory_on; const ml = el("label", "switch"); ml.append(mem, document.createTextNode(" Let Aira use my Memory in chats"));
      const msg = status(), save = button("Save settings", "primary");
      save.addEventListener("click", () => busy(save, "Saving...", async () => {
        const res = await call("/api/settings", "PUT", { name: name.value, default_mode: mode.value, memory_on: mem.checked });
        if (!res.ok) { say(msg, res.data.error || "Could not save.", true); return; }
        K.app().setMode(mode.value); say(msg, "Saved.");
      }));
      c.append(el("p", "muted", "Logged in as " + (r.ok ? r.data.email : K.user())), field("Your name", name), field("Mode for new chats", mode), ml, save, msg);
      const d = card("Your data", "Download a copy of everything Aira has saved for you, or remove your local copy.");
      const exp = el("a", "ghost linkbtn", "Download my data (JSON)"); exp.href = "/api/export"; exp.download = "aira-my-data.json";
      const row = el("div", "row left"); row.append(exp, button("Clear the chat saved in this browser", "ghost", () => { K.app().newChat(); toast("Cleared"); }));
      d.appendChild(row);
      const acct = card("Account", "Delete your account and everything in it from the account window.");
      acct.appendChild(button("Open account window", "ghost", () => document.querySelector("#accountBtn").click()));
      root.append(c, d, acct);
    },
  };

  // ====================== Pro / Subscription ======================
  V.pro = {
    mount() {},
    async show(root) {
      root.replaceChildren();
      pageHead(root, "Pro / Subscription", "Aira is free to use. A paid plan is not on sale yet.");
      let cfg = {};
      try { cfg = await (await fetch("/api/config")).json(); } catch (e) { /* show without numbers */ }
      const free = card("Your plan: Free");
      const ul = el("ul", "caps");
      [["Messages per day, guests", cfg.perDay], ["Messages per day, logged in", cfg.userPerDay], ["Projects per account", cfg.maxProjects]].forEach(([l, v]) => {
        const li = el("li", "on"); li.appendChild(el("span", "dot")); li.appendChild(el("span", "", l)); li.appendChild(el("em", "", v === undefined ? "-" : String(v))); ul.appendChild(li);
      });
      free.appendChild(ul);
      const note = card("About Pro", "Higher daily limits are planned for a future paid plan. No payment system is connected, so nothing can be bought or charged on this website right now. If you want Pro when it launches, leave your contact below and the owner can reach out.");
      const contact = input("text", { maxlength: "100", placeholder: "Your email or phone number" }), why = textarea(2, { maxlength: "300", placeholder: "What would you use Pro for? (optional)" }), msg = status(), go = button("Tell me when Pro is ready", "primary");
      go.addEventListener("click", () => busy(go, "Sending...", async () => {
        const r = await call("/api/pro-interest", "POST", { contact: contact.value, note: why.value });
        say(msg, r.ok ? "Thank you! The owner has your request." : (r.data.error || "Could not send."), !r.ok); if (r.ok) { contact.value = ""; why.value = ""; }
      }));
      note.append(field("Contact", contact), field("Note", why), go, msg);
      root.append(free, note);
    },
  };
})();
