(() => {
  "use strict";
  const $ = (selector) => document.querySelector(selector);
  const STORE = "aira_chat_v2";
  const PREFS = "aira_prefs_v1";
  const KEEP = 40;

  const chat = $("#chat"), welcome = $("#welcome"), form = $("#form"), input = $("#input");
  const sendBtn = $("#send"), stopBtn = $("#stop"), leftEl = $("#left");
  const modeSel = $("#mode"), searchOn = $("#searchOn"), searchWrap = $("#searchWrap");
  const attachBtn = $("#attachBtn"), fileInput = $("#fileInput"), thumbWrap = $("#thumbWrap"), thumb = $("#thumb");

  let messages = [];
  let chatId = newId();
  let busy = false, controller = null, pinned = true;
  let user = null;            // email when logged in
  let attached = null;        // data URL of the photo waiting to be sent
  let features = { search: false, image: false };
  let perDay = 40, userPerDay = 80;

  function newId() {
    const a = new Uint8Array(8);
    crypto.getRandomValues(a);
    return Array.from(a, (b) => b.toString(16).padStart(2, "0")).join("");
  }

  // ---------- small helpers ----------
  async function api(path, method, body) {
    try {
      const res = await fetch(path, {
        method: method || "GET",
        headers: body ? { "Content-Type": "application/json" } : {},
        body: body ? JSON.stringify(body) : undefined,
      });
      const data = await res.json().catch(() => ({}));
      return { ok: res.ok, status: res.status, data };
    } catch (e) {
      return { ok: false, status: 0, data: { error: "Could not reach the server. Check your internet." } };
    }
  }
  function readPrefs() { try { return JSON.parse(localStorage.getItem(PREFS) || "{}") || {}; } catch (e) { return {}; } }
  function writePrefs(p) { try { localStorage.setItem(PREFS, JSON.stringify(p)); } catch (e) { /* ignore */ } }

  // ---------- local copy of the current chat ----------
  function loadLocal() {
    try {
      const d = JSON.parse(localStorage.getItem(STORE) || "null");
      if (d && Array.isArray(d.messages)) {
        const ok = d.messages.filter((m) => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string");
        return { id: /^[a-f0-9]{8,32}$/.test(d.id || "") ? d.id : newId(), mode: d.mode, messages: ok };
      }
    } catch (e) { /* storage may be blocked */ }
    return null;
  }
  function saveLocal() {
    try { localStorage.setItem(STORE, JSON.stringify({ id: chatId, mode: modeSel.value, messages: messages.slice(-KEEP) })); } catch (e) { /* ignore */ }
  }

  // ---------- safe text formatting ----------
  const escapeHtml = (t) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");

  function inline(raw) {
    let html = escapeHtml(raw);
    html = html.replace(/`([^`\n]+)`/g, "<code>$1</code>");
    html = html.replace(/\*\*([^*\n]+)\*\*/g, "<strong>$1</strong>");
    html = html.replace(/(^|[\s(])(https?:\/\/[^\s<]+[^\s<.,;:!?)])/g,
      '$1<a href="$2" target="_blank" rel="noopener noreferrer">$2</a>');
    return html;
  }

  function format(text) {
    const parts = text.split("```");
    let html = "";
    parts.forEach((part, index) => {
      if (index % 2 === 0) { html += inline(part); return; }
      const m = part.match(/^([a-zA-Z0-9+#_-]*)\n/);
      const lang = m ? m[1].toLowerCase() : "";
      const body = (m ? part.slice(m[0].length) : part).replace(/\n$/, "");
      const isHtml = lang === "html" || lang === "htm" || /^\s*<!doctype html|^\s*<html/i.test(body);
      html += '<div class="codeblock"><div class="cbtn"><button class="copy" type="button">Copy</button>' +
        (isHtml ? '<button class="prev" type="button">Preview</button><button class="dl" type="button">Download</button>' : "") +
        "</div><pre><code>" + escapeHtml(body) + "</code></pre></div>";
    });
    return html;
  }

  // ---------- drawing ----------
  function scrollDown(force) { if (force || pinned) chat.scrollTop = chat.scrollHeight; }
  chat.addEventListener("scroll", () => { pinned = chat.scrollHeight - chat.scrollTop - chat.clientHeight < 80; });

  function addMessage(role, text, extra, pic) {
    welcome.hidden = true;
    const row = document.createElement("div");
    row.className = "msg " + (role === "user" ? "user" : "bot") + (extra ? " " + extra : "");
    const bubble = document.createElement("div");
    bubble.className = "bubble";
    if (role === "user") {
      if (pic) { const img = document.createElement("img"); img.className = "pic"; img.alt = "Your photo"; img.src = pic; bubble.appendChild(img); }
      bubble.appendChild(document.createTextNode(text));
    } else { bubble.innerHTML = format(text); }
    row.appendChild(bubble);
    chat.appendChild(row);
    scrollDown(true);
    return bubble;
  }

  function showAll() {
    chat.querySelectorAll(".msg").forEach((el) => el.remove());
    welcome.hidden = messages.length > 0;
    messages.forEach((m) => addMessage(m.role, m.content));
    if (messages.length) scrollDown(true); else chat.scrollTop = 0;
    markCurrent();
  }

  // copy / preview / download buttons inside code blocks
  const previewDialog = $("#previewDialog"), pvHolder = $("#pvHolder");
  chat.addEventListener("click", async (event) => {
    const button = event.target.closest(".cbtn button");
    if (!button) return;
    const code = button.closest(".codeblock").querySelector("code").textContent;
    if (button.classList.contains("copy")) {
      const done = () => { button.textContent = "Copied"; setTimeout(() => { button.textContent = "Copy"; }, 1500); };
      if (navigator.clipboard) navigator.clipboard.writeText(code).then(done, () => {}); else done();
    } else if (button.classList.contains("dl")) {
      const url = URL.createObjectURL(new Blob([code], { type: "text/html" }));
      const a = document.createElement("a");
      a.href = url; a.download = "aira-website.html";
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
    } else if (button.classList.contains("prev")) {
      button.disabled = true;
      const r = await api("/api/preview", "POST", { html: code });
      button.disabled = false;
      if (!r.ok) { alert(r.data.error || "Could not make a preview."); return; }
      pvHolder.replaceChildren();
      const frame = document.createElement("iframe");
      frame.setAttribute("sandbox", "allow-scripts allow-modals");
      frame.title = "Website preview";
      frame.src = r.data.url;
      pvHolder.appendChild(frame);
      if (typeof previewDialog.showModal === "function") previewDialog.showModal(); else previewDialog.setAttribute("open", "");
    }
  });
  $("#pvClose").addEventListener("click", () => previewDialog.close());
  previewDialog.addEventListener("close", () => pvHolder.replaceChildren());

  function setBusy(flag) { busy = flag; sendBtn.hidden = flag; stopBtn.hidden = !flag; }
  function autosize() { input.style.height = "auto"; input.style.height = Math.min(input.scrollHeight, 160) + "px"; }
  input.addEventListener("input", autosize);
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey && !e.isComposing) { e.preventDefault(); form.requestSubmit(); }
  });

  function leftText(n) { leftEl.textContent = n + " messages left today."; }

  // ---------- modes, search toggle ----------
  function updatePlaceholder() {
    input.placeholder = modeSel.value === "builder" ? "Describe the website you want..." : "Message Aira...";
  }
  modeSel.addEventListener("change", () => {
    const p = readPrefs(); p.mode = modeSel.value; writePrefs(p);
    updatePlaceholder(); saveLocal();
  });
  searchOn.addEventListener("change", () => { const p = readPrefs(); p.search = searchOn.checked; writePrefs(p); });

  // ---------- photo attach ----------
  attachBtn.addEventListener("click", () => fileInput.click());
  function clearPhoto() { attached = null; thumbWrap.hidden = true; thumb.removeAttribute("src"); fileInput.value = ""; }
  $("#thumbX").addEventListener("click", clearPhoto);
  fileInput.addEventListener("change", () => {
    const file = fileInput.files && fileInput.files[0];
    if (!file) return;
    if (!file.type.startsWith("image/") || file.size > 20 * 1024 * 1024) { alert("Please choose a photo under 20 MB."); clearPhoto(); return; }
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, 1024 / Math.max(img.width, img.height));
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(img.width * scale));
        canvas.height = Math.max(1, Math.round(img.height * scale));
        const g = canvas.getContext("2d");
        g.fillStyle = "#fff"; g.fillRect(0, 0, canvas.width, canvas.height);
        g.drawImage(img, 0, 0, canvas.width, canvas.height);
        let q = 0.82, url = canvas.toDataURL("image/jpeg", q);
        while (url.length > 1900000 && q > 0.3) { q -= 0.12; url = canvas.toDataURL("image/jpeg", q); }
        attached = url; thumb.src = url; thumbWrap.hidden = false;
      };
      img.onerror = () => { alert("That picture could not be opened."); clearPhoto(); };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });

  // ---------- sending ----------
  async function ask(text) {
    if (busy) return;
    text = text.trim();
    const photo = attached;
    if (!text && !photo) return;
    const shown = (photo ? "(photo) " : "") + (text || "Describe this photo.");
    messages.push({ role: "user", content: shown });
    const sendList = messages.slice(-12).map((m) => ({ role: m.role, content: m.content }));
    sendList[sendList.length - 1].content = text;   // the server gets the real text; the photo goes separately
    addMessage("user", text || "Describe this photo.", null, photo);
    input.value = ""; autosize(); clearPhoto(); pinned = true;

    const bubble = addMessage("assistant", "");
    bubble.innerHTML = '<span class="dots"><span></span><span></span><span></span></span>';
    setBusy(true);
    controller = new AbortController();
    let answer = "";
    try {
      const res = await fetch("/api/chat", {
        method: "POST", headers: { "Content-Type": "application/json" }, signal: controller.signal,
        body: JSON.stringify({ messages: sendList, mode: modeSel.value, search: searchOn.checked && features.search, image: photo || undefined }),
      });
      const left = res.headers.get("X-Messages-Left");
      if (left !== null) leftText(left);
      if (!res.ok) {
        let reason = "Something went wrong. Please try again.";
        try { reason = (await res.json()).error || reason; } catch (e) { /* not JSON */ }
        bubble.parentElement.classList.add("error");
        bubble.textContent = reason;
        messages.pop();
        return;
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder("utf-8");
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        answer += decoder.decode(value, { stream: true });
        bubble.innerHTML = format(answer);
        scrollDown(false);
      }
      answer += decoder.decode();
      bubble.innerHTML = format(answer);
      if (answer.startsWith("⚠")) { bubble.parentElement.classList.add("error"); messages.pop(); }
      else messages.push({ role: "assistant", content: answer });
    } catch (error) {
      if (error.name === "AbortError") {
        if (answer) { answer += " (stopped)"; bubble.innerHTML = format(answer); messages.push({ role: "assistant", content: answer }); }
        else { bubble.parentElement.remove(); messages.pop(); }
      } else {
        bubble.parentElement.classList.add("error");
        bubble.textContent = "Could not reach Aira. Check your internet and try again.";
        messages.pop();
      }
    } finally {
      setBusy(false); controller = null; saveLocal(); saveRemote(); input.focus();
    }
  }
  form.addEventListener("submit", (e) => { e.preventDefault(); ask(input.value); });
  stopBtn.addEventListener("click", () => { if (controller) controller.abort(); });
  $("#chips").addEventListener("click", (e) => { const c = e.target.closest(".chip"); if (c) ask(c.textContent); });

  function newChat() {
    if (busy && controller) controller.abort();
    chatId = newId(); messages = []; clearPhoto(); saveLocal(); showAll(); closeDrawer(); input.focus();
  }
  $("#newChat").addEventListener("click", newChat);
  $("#drawerNew").addEventListener("click", newChat);

  // ---------- saved chats (logged-in only) ----------
  const drawer = $("#drawer"), scrim = $("#scrim"), chatList = $("#chatList"), drawerGuest = $("#drawerGuest");
  let savedChats = [];
  function openDrawer() { drawer.hidden = false; scrim.hidden = false; }
  function closeDrawer() { drawer.hidden = true; scrim.hidden = true; }
  $("#menuBtn").addEventListener("click", openDrawer);
  $("#drawerClose").addEventListener("click", closeDrawer);
  scrim.addEventListener("click", closeDrawer);
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeDrawer(); });

  function markCurrent() {
    chatList.querySelectorAll(".open").forEach((b) => b.classList.toggle("current", b.dataset.id === chatId));
  }
  function drawList() {
    chatList.replaceChildren();
    drawerGuest.hidden = !!user;
    savedChats.forEach((c) => {
      const li = document.createElement("li");
      const open = document.createElement("button");
      open.className = "open"; open.type = "button"; open.dataset.id = c.id; open.textContent = c.title;
      open.addEventListener("click", () => openSaved(c.id));
      const del = document.createElement("button");
      del.className = "del"; del.type = "button"; del.textContent = "×"; del.setAttribute("aria-label", "Delete chat");
      del.addEventListener("click", () => removeSaved(c.id));
      li.append(open, del); chatList.appendChild(li);
    });
    markCurrent();
  }
  async function loadList() {
    if (!user) { savedChats = []; drawList(); return; }
    const r = await api("/api/chats");
    savedChats = r.ok ? r.data.chats : [];
    drawList();
  }
  async function saveRemote() {
    if (!user || !messages.length) return;
    const first = messages.find((m) => m.role === "user");
    const title = (first ? first.content : "New chat").slice(0, 40);
    const r = await api("/api/chats/" + chatId, "PUT", { title, mode: modeSel.value, messages });
    if (r.ok) loadList();
  }
  async function openSaved(id) {
    if (busy && controller) controller.abort();
    const r = await api("/api/chats/" + id);
    if (!r.ok) { alert(r.data.error || "Could not open that chat."); return; }
    chatId = id; messages = r.data.messages;
    if ([...modeSel.options].some((o) => o.value === r.data.mode)) modeSel.value = r.data.mode;
    updatePlaceholder(); saveLocal(); showAll(); closeDrawer();
  }
  async function removeSaved(id) {
    if (!confirm("Delete this chat?")) return;
    await api("/api/chats/" + id, "DELETE");
    if (id === chatId) newChat();
    loadList();
  }

  // ---------- login / account ----------
  const authDialog = $("#authDialog"), authStatus = $("#authStatus"), accountDialog = $("#accountDialog");
  let signupMode = false;
  function setAuthMode(signup) {
    signupMode = signup;
    $("#authTitle").textContent = signup ? "Create account" : "Log in";
    $("#authGo").textContent = signup ? "Sign up" : "Log in";
    $("#authSwitch").textContent = signup ? "I have an account" : "Create account";
    $("#authPass").autocomplete = signup ? "new-password" : "current-password";
    authStatus.textContent = ""; authStatus.classList.remove("bad");
  }
  function openDialog(d) { if (typeof d.showModal === "function") d.showModal(); else d.setAttribute("open", ""); }
  function setUser(email) {
    user = email;
    $("#accountBtn").textContent = email ? "Account" : "Log in";
    if (leftEl.textContent) leftText(email ? userPerDay : perDay);
  }
  $("#accountBtn").addEventListener("click", () => {
    if (user) { $("#accountEmail").textContent = "Logged in as " + user; $("#accountStatus").textContent = ""; $("#delPass").value = ""; openDialog(accountDialog); }
    else { setAuthMode(false); openDialog(authDialog); }
  });
  $("#authSwitch").addEventListener("click", () => setAuthMode(!signupMode));
  $("#authCancel").addEventListener("click", () => authDialog.close());
  $("#accountClose").addEventListener("click", () => accountDialog.close());
  $("#authForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const go = $("#authGo"); go.disabled = true;
    authStatus.classList.remove("bad"); authStatus.textContent = "Please wait...";
    const r = await api(signupMode ? "/api/signup" : "/api/login", "POST", { email: $("#authEmail").value, password: $("#authPass").value });
    go.disabled = false;
    if (!r.ok) { authStatus.textContent = r.data.error || "Something went wrong."; authStatus.classList.add("bad"); return; }
    $("#authPass").value = "";
    authDialog.close();
    setUser(r.data.email);
    await saveRemote();       // keep the chat you were just having
    loadList();
  });
  $("#logoutBtn").addEventListener("click", async () => {
    await api("/api/logout", "POST", {});
    accountDialog.close(); setUser(null); savedChats = []; drawList(); newChat();
  });
  $("#deleteBtn").addEventListener("click", async () => {
    const st = $("#accountStatus"); st.classList.remove("bad");
    if (!$("#delPass").value) { st.textContent = "Type your password first."; st.classList.add("bad"); return; }
    if (!confirm("Delete your account and all saved chats? This cannot be undone.")) return;
    const r = await api("/api/delete-account", "POST", { password: $("#delPass").value });
    if (!r.ok) { st.textContent = r.data.error || "Could not delete."; st.classList.add("bad"); return; }
    accountDialog.close(); setUser(null); savedChats = []; drawList(); newChat();
  });

  // ---------- feedback ----------
  const dialog = $("#feedbackDialog"), fbStatus = $("#fbStatus"), fbSend = $("#fbSend");
  let rating = 0;
  const starButtons = Array.from(document.querySelectorAll("#stars button"));
  function paintStars() {
    starButtons.forEach((b) => { const on = Number(b.dataset.v) <= rating; b.classList.toggle("on", on); b.textContent = on ? "★" : "☆"; });
  }
  starButtons.forEach((b) => b.addEventListener("click", () => { rating = rating === Number(b.dataset.v) ? 0 : Number(b.dataset.v); paintStars(); }));
  function say(text, bad) { fbStatus.textContent = text; fbStatus.classList.toggle("bad", !!bad); }
  $("#openFeedback").addEventListener("click", () => { say(""); openDialog(dialog); });
  $("#fbCancel").addEventListener("click", () => dialog.close());
  $("#feedbackForm").addEventListener("submit", async (e) => {
    e.preventDefault(); fbSend.disabled = true; say("Sending...");
    const r = await api("/api/feedback", "POST", { type: $("#fbType").value, rating, text: $("#fbText").value, contact: $("#fbContact").value });
    fbSend.disabled = false;
    if (r.ok) {
      say("Thank you! Your feedback was sent.");
      $("#fbText").value = ""; rating = 0; paintStars();
      setTimeout(() => { if (dialog.open) dialog.close(); }, 1400);
    } else say(r.data.error || "Could not send. Please try again.", true);
  });

  // ---------- start ----------
  async function start() {
    const prefs = readPrefs();
    const local = loadLocal();
    const [cfgRes, meRes] = await Promise.all([api("/api/config"), api("/api/me")]);
    if (cfgRes.ok) {
      const cfg = cfgRes.data;
      perDay = cfg.perDay || perDay; userPerDay = cfg.userPerDay || userPerDay;
      features = cfg.features || features;
      (cfg.modes || []).forEach((m) => { const o = document.createElement("option"); o.value = m.id; o.textContent = m.label; modeSel.appendChild(o); });
      if (cfg.name) document.title = cfg.name + " - your free AI assistant";
      if (cfg.instagram && /^https:\/\//.test(cfg.instagram)) { const l = $("#instaLink"); l.href = cfg.instagram; l.hidden = false; }
    }
    if (!modeSel.options.length) { const o = document.createElement("option"); o.value = "aira"; o.textContent = "Aira (general)"; modeSel.appendChild(o); }
    const wanted = (local && local.mode) || prefs.mode;
    if ([...modeSel.options].some((o) => o.value === wanted)) modeSel.value = wanted;
    document.querySelectorAll(".feature[data-feature]").forEach((el) => { el.hidden = !features[el.dataset.feature]; });
    searchWrap.hidden = !features.search; searchOn.checked = !!prefs.search && features.search;
    attachBtn.hidden = !features.image;
    if (local) { chatId = local.id; messages = local.messages; }
    setUser(meRes.ok ? meRes.data.email : null);
    updatePlaceholder(); showAll(); paintStars();
    if (user) loadList(); else drawList();
    input.focus();
  }
  if (location.protocol === "file:") $("#nofile").style.display = "block";
  start();
})();
