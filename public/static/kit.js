// Shared helpers for the tool sections (views1.js, views2.js). No inline styles, no innerHTML with user text.
(() => {
  "use strict";
  window.AiraViews = window.AiraViews || {};

  const el = (tag, cls, text) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined) n.textContent = text;
    return n;
  };
  const app = () => window.AiraApp;
  const user = () => (app() && app().state ? app().state.user : null);
  const features = () => (app() && app().state ? app().state.features : {}) || {};

  async function call(path, method, body) {
    try {
      const res = await fetch(path, {
        method: method || "GET",
        headers: body !== undefined ? { "Content-Type": "application/json" } : {},
        body: body !== undefined ? JSON.stringify(body) : undefined,
      });
      return { ok: res.ok, status: res.status, data: await res.json().catch(() => ({})) };
    } catch (e) { return { ok: false, status: 0, data: { error: "No internet connection. Please try again." } }; }
  }

  // ---------- toast messages ----------
  let toastBox = null;
  function toast(message, bad) {
    if (!toastBox) { toastBox = el("div", "toasts"); toastBox.setAttribute("role", "status"); toastBox.setAttribute("aria-live", "polite"); document.body.appendChild(toastBox); }
    const t = el("div", "toast" + (bad ? " bad" : ""), message);
    toastBox.appendChild(t);
    setTimeout(() => t.remove(), bad ? 6000 : 3000);
  }

  async function copy(text, label) {
    try { await navigator.clipboard.writeText(text); toast(label || "Copied"); } catch (e) { toast("Could not copy. Select the text and copy it yourself.", true); }
  }

  function download(name, content, type) {
    const blob = content instanceof Blob ? content : new Blob([content], { type: type || "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = el("a"); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }

  // ---------- building blocks ----------
  function card(title, sub) {
    const c = el("div", "card");
    if (title) c.appendChild(el("h3", "", title));
    if (sub) c.appendChild(el("p", "muted small", sub));
    return c;
  }
  function field(label, control, hint) {
    const w = el("label", "field");
    w.appendChild(el("span", "", label));
    w.appendChild(control);
    if (hint) w.appendChild(el("small", "muted", hint));
    return w;
  }
  function input(type, attrs) {
    const i = el("input"); i.type = type || "text";
    Object.entries(attrs || {}).forEach(([k, v]) => i.setAttribute(k, v));
    return i;
  }
  function textarea(rows, attrs) {
    const t = el("textarea"); t.rows = rows || 4;
    Object.entries(attrs || {}).forEach(([k, v]) => t.setAttribute(k, v));
    return t;
  }
  function select(options, value) {
    const s = el("select");
    options.forEach((o) => { const [v, label] = Array.isArray(o) ? o : [o, o]; const op = el("option", "", label); op.value = v; s.appendChild(op); });
    if (value !== undefined) s.value = value;
    return s;
  }
  function button(label, cls, onClick) {
    const b = el("button", cls || "ghost", label); b.type = "button";
    if (onClick) b.addEventListener("click", onClick);
    return b;
  }
  // Disable a button while an async job runs, so it cannot be pressed twice.
  async function busy(btn, working, job) {
    const old = btn.textContent;
    btn.disabled = true; btn.textContent = working;
    try { return await job(); } finally { btn.disabled = false; btn.textContent = old; }
  }
  function status() { const p = el("p", "status"); p.setAttribute("role", "status"); return p; }
  function say(p, message, bad) { p.textContent = message || ""; p.classList.toggle("bad", !!bad); }
  function spinner(text) { const s = el("p", "muted working"); s.appendChild(el("span", "spin")); s.appendChild(document.createTextNode(" " + text)); return s; }
  function empty(text) { return el("p", "muted empty", text); }
  function safeUrl(u) { return typeof u === "string" && /^https?:\/\//i.test(u) ? u : "#"; }
  function when(ts) {
    try { return new Date(ts * 1000).toLocaleString(undefined, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }); } catch (e) { return ""; }
  }

  // Shows "log in first" and returns false when the person is a guest.
  function needLogin(root, what) {
    root.replaceChildren();
    const c = card(what, "You need a free account for this. Your work is saved to your account, so only you can see it.");
    c.appendChild(button("Log in or sign up", "primary", () => document.querySelector("#accountBtn").click()));
    root.appendChild(c);
    return false;
  }
  function pageHead(root, title, sub) {
    const c = el("div", "card head");
    const d = el("div"); d.appendChild(el("h3", "", title)); if (sub) d.appendChild(el("p", "muted small", sub));
    c.appendChild(d); root.appendChild(c);
    return c;
  }
  // A result box with copy / download buttons.
  function resultBox(text, name) {
    const box = el("div", "out");
    box.appendChild(el("div", "out-text", text));
    const row = el("div", "row left");
    row.appendChild(button("Copy", "ghost small", () => copy(text)));
    row.appendChild(button("Download .txt", "ghost small", () => download((name || "aira-result") + ".txt", text)));
    row.appendChild(button("Make PDF", "ghost small", () => makeFile("pdf", name || "Aira result", text)));
    row.appendChild(button("Make Word file", "ghost small", () => makeFile("docx", name || "Aira result", text)));
    box.appendChild(row);
    return box;
  }
  async function makeFile(format, title, content) {
    try {
      const res = await fetch("/api/make-file", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ format, title, content }) });
      if (!res.ok) { const d = await res.json().catch(() => ({})); toast(d.error || "Could not make the file.", true); return; }
      const disp = res.headers.get("Content-Disposition") || "";
      const m = disp.match(/filename="([^"]+)"/);
      download(m ? m[1] : "aira-document." + format, await res.blob());
      toast("File ready");
    } catch (e) { toast("No internet connection.", true); }
  }

  window.AiraKit = { el, app, user, features, call, toast, copy, download, card, field, input, textarea, select, button, busy, status, say, spinner, empty, safeUrl, when, needLogin, pageHead, resultBox, makeFile };
})();
