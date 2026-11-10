(() => {
  "use strict";
  const $ = (s) => document.querySelector(s);
  const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text !== undefined) n.textContent = text; return n; };
  const app = () => window.AiraApp;

  let projects = [], max = 10, loadedFor = null, view = null, detail = null, editing = null;

  async function call(path, method, body) {
    try {
      const res = await fetch(path, { method: method || "GET", headers: body ? { "Content-Type": "application/json" } : {}, body: body ? JSON.stringify(body) : undefined });
      return { ok: res.ok, status: res.status, data: await res.json().catch(() => ({})) };
    } catch (e) { return { ok: false, status: 0, data: { error: "No internet connection." } }; }
  }

  async function loadProjects(force) {
    const u = app() ? app().state.user : null;
    if (!force && u === loadedFor) return false;
    loadedFor = u;
    if (!u) { projects = []; } else {
      const r = await call("/api/projects");
      if (r.ok) { projects = r.data.projects; max = r.data.max || max; } else projects = [];
    }
    drawSelector();
    return true;
  }
  async function refresh() {            // reload the list, then redraw the page if we are on it
    await loadProjects(true);
    if (view && view.view === "projects") await show(view.arg);
  }

  // ---------- chat-bar selector ----------
  const sel = $("#projectSel"), pick = $("#projPick");
  function drawSelector() {
    const s = app() ? app().state : { user: null, project: null };
    pick.hidden = !s.user || !projects.length;
    sel.replaceChildren();
    const none = el("option", "", "No project"); none.value = ""; sel.appendChild(none);
    projects.forEach((p) => { const o = el("option", "", p.name); o.value = p.id; sel.appendChild(o); });
    sel.value = s.project && projects.some((p) => p.id === s.project) ? s.project : "";
  }
  sel.addEventListener("change", () => app().setProject(sel.value || null));

  // ---------- projects page ----------
  async function show(arg) {
    const s = app() ? app().state : { user: null };
    $("#projList").hidden = !!arg; $("#projDetail").hidden = !arg;
    if (arg) return showDetail(arg);
    $("#projGuest").hidden = !!s.user;
    $("#projNew").hidden = !s.user;
    $("#projEmpty").hidden = !s.user || projects.length > 0;
    $("#projLimit").textContent = s.user ? projects.length + " of " + max + " projects used." : "";
    const box = $("#projCards"); box.replaceChildren();
    projects.forEach((p) => {
      const card = el("a", "mode-card"); card.href = "#/projects/" + p.id;
      card.appendChild(el("b", "", p.name));
      card.appendChild(el("span", "", p.chats + (p.chats === 1 ? " chat" : " chats") + (p.instructions ? " · has instructions" : "")));
      box.appendChild(card);
    });
  }

  async function showDetail(id) {
    const r = await call("/api/projects/" + id);
    if (!r.ok) { location.hash = "#/projects"; return; }
    detail = r.data.project;
    $("#pdName").textContent = detail.name;
    $("#pdInstr").textContent = detail.instructions || "No instructions. Press Edit to add some.";
    const list = $("#pdChats"); list.replaceChildren();
    $("#pdEmpty").hidden = r.data.chats.length > 0;
    r.data.chats.forEach((c) => {
      const li = el("li", "projchat");
      const open = el("button", "recent-item", c.title); open.type = "button";
      open.addEventListener("click", async () => { await app().openSaved(c.id); location.hash = "#/chat"; });
      const out = el("button", "ghost small", "Remove from project"); out.type = "button";
      out.addEventListener("click", async () => {
        const m = await call("/api/chats/" + c.id, "PATCH", { project_id: null });
        if (m.ok) { await refresh(); } else alert(m.data.error || "Could not remove it.");
      });
      li.append(open, out); list.appendChild(li);
    });
  }

  // ---------- create / edit dialog ----------
  const dlg = $("#projectDialog"), status = $("#projStatus");
  function openDialog(p) {
    editing = p || null;
    $("#projectTitle").textContent = p ? "Edit project" : "New project";
    $("#projName").value = p ? p.name : ""; $("#projInstr").value = p ? p.instructions : "";
    status.textContent = ""; status.classList.remove("bad");
    if (typeof dlg.showModal === "function") dlg.showModal(); else dlg.setAttribute("open", "");
    $("#projName").focus();
  }
  $("#projNew").addEventListener("click", () => openDialog(null));
  $("#pdEdit").addEventListener("click", () => detail && openDialog(detail));
  $("#projCancel").addEventListener("click", () => dlg.close());
  $("#projectForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const body = { name: $("#projName").value, instructions: $("#projInstr").value };
    const r = editing ? await call("/api/projects/" + editing.id, "PATCH", body) : await call("/api/projects", "POST", body);
    if (!r.ok) { status.textContent = r.data.error || "Could not save."; status.classList.add("bad"); return; }
    dlg.close();
    await refresh();
    if (!editing) location.hash = "#/projects/" + r.data.project.id;
  });
  $("#pdDelete").addEventListener("click", async () => {
    if (!detail || !confirm("Delete the project \"" + detail.name + "\"? Its chats are kept, they just leave the project.")) return;
    const r = await call("/api/projects/" + detail.id, "DELETE");
    if (!r.ok) { alert(r.data.error || "Could not delete it."); return; }
    if (app().state.project === detail.id) await app().setProject(null);
    detail = null; location.hash = "#/projects"; await refresh();
  });
  $("#pdChat").addEventListener("click", () => { if (detail) { app().startChat(undefined, detail.id); location.hash = "#/chat"; } });

  document.addEventListener("aira:route", (e) => {
    view = e.detail;
    // opening the projects list always reloads it, so chat counts are never out of date
    const go = view.view === "projects" && !view.arg ? loadProjects(true) : loadProjects(false);
    go.then(() => { if (view.view === "projects") show(view.arg); });
  });
  document.addEventListener("aira:update", async () => {
    const changed = await loadProjects(false);
    drawSelector();
    if (view && view.view === "projects" && (changed || !view.arg)) show(view.arg);
  });
  { // dashboard.js already routed before this file loaded, so read the address once ourselves
    const m = location.hash.match(/^#\/projects(?:\/([a-f0-9]{16}))?/);
    if (m) view = { view: "projects", arg: m[1] || "" };
  }
  if (app()) loadProjects(false);
})();
