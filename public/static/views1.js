// Tool sections, part 1: Writing Studio, Research, PDF & Notes, File Creator, Library, Image Studio.
(() => {
  "use strict";
  const K = window.AiraKit, V = window.AiraViews;
  const { el, call, toast, card, field, input, textarea, select, button, busy, status, say, spinner, empty, needLogin, pageHead, resultBox } = K;

  // ====================== Writing Studio ======================
  const WRITE = [
    ["blog", "Blog post", "topic"], ["article", "Article", "topic"], ["email", "Email", "topic"], ["caption", "Social media captions", "topic"],
    ["rewrite", "Rewrite my text", "text"], ["summarize", "Summarize my text", "text"], ["grammar", "Fix grammar", "text"], ["improve", "Improve my text", "text"],
  ];
  V.write = {
    mount() {},
    show(root) {
      root.replaceChildren();
      pageHead(root, "Writing Studio", "Write blogs, emails and captions, or improve text you already have.");
      if (!K.user()) return needLogin(root, "Log in to use the Writing Studio");
      const c = card();
      const task = select(WRITE.map((w) => [w[0], w[1]])), tone = select([["friendly", "Friendly"], ["professional", "Professional"], ["casual", "Casual"], ["formal", "Formal"], ["persuasive", "Persuasive"], ["funny", "Funny"], ["simple", "Simple"]]);
      const length = select([["short", "Short"], ["medium", "Medium"], ["long", "Long"]], "medium");
      const text = textarea(6, { maxlength: "6000" });
      const label = field("Topic", text);
      const sync = () => {
        const isText = WRITE.find((w) => w[0] === task.value)[2] === "text";
        label.firstChild.textContent = isText ? "Paste your text" : "What should it be about?";
        text.placeholder = isText ? "Paste the text here..." : "Example: Why first-year students should learn Python";
        text.maxLength = isText ? 6000 : 600;
      };
      task.addEventListener("change", sync); sync();
      const row = el("div", "fieldrow"); row.append(field("What do you want?", task), field("Tone", tone), field("Length", length));
      const msg = status(), out = el("div"), go = button("Write it", "primary");
      go.addEventListener("click", () => busy(go, "Writing...", async () => {
        out.replaceChildren(); say(msg, "");
        if (text.value.trim().length < 3) { say(msg, "Please fill in the box first.", true); return; }
        out.appendChild(spinner("Aira is writing..."));
        const isText = WRITE.find((w) => w[0] === task.value)[2] === "text";
        const r = await call("/api/write", "POST", { task: task.value, tone: tone.value, length: length.value, [isText ? "text" : "topic"]: text.value });
        out.replaceChildren();
        if (!r.ok) { say(msg, r.data.error || "Something went wrong.", true); return; }
        out.appendChild(resultBox(r.data.text, "aira-" + task.value));
        say(msg, "Saved to your Library.");
      }));
      c.append(row, label, go, msg, out);
      root.appendChild(c);
    },
  };

  // ====================== Research ======================
  function showResearch(box, answer, sources) {
    box.replaceChildren();
    box.appendChild(resultBox(answer, "aira-research"));
    const c = card("Sources", "Open them to check the facts yourself.");
    const ol = el("ol", "sources");
    (sources || []).forEach((s) => {
      const li = el("li"); const a = el("a", "", s.title || s.url);
      a.href = K.safeUrl(s.url); a.target = "_blank"; a.rel = "noopener noreferrer";
      li.appendChild(a); if (s.body) li.appendChild(el("span", "muted small", " - " + s.body));
      ol.appendChild(li);
    });
    c.appendChild(ol); box.appendChild(c);
  }
  V.research = {
    mount() {},
    async show(root) {
      root.replaceChildren();
      pageHead(root, "Research assistant", "Search the web and get a short summary with source links.");
      if (!K.user()) return needLogin(root, "Log in to use Research");
      const c = card();
      const q = input("text", { maxlength: "200", placeholder: "Example: How do solar panels work?" });
      const msg = status(), out = el("div"), go = button("Search and summarise", "primary");
      const run = () => busy(go, "Searching...", async () => {
        out.replaceChildren(); say(msg, "");
        if (q.value.trim().length < 3) { say(msg, "Please type what you want to research.", true); return; }
        out.appendChild(spinner("Searching the web and writing a summary..."));
        const r = await call("/api/research", "POST", { query: q.value });
        out.replaceChildren();
        if (!r.ok) { say(msg, r.data.error || "Search failed.", true); return; }
        showResearch(out, r.data.answer, r.data.sources); loadHistory();
      });
      go.addEventListener("click", run);
      q.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); run(); } });
      c.append(field("Your question", q), go, msg);
      const hist = card("Research history"), list = el("ul", "recent");
      hist.appendChild(list);
      async function loadHistory() {
        const r = await call("/api/items?kind=research");
        list.replaceChildren();
        if (!r.ok || !r.data.items.length) { list.appendChild(empty("Your searches will appear here.")); return; }
        r.data.items.slice(0, 15).forEach((it) => {
          const li = el("li", "projchat"), b = el("button", "recent-item", it.title); b.type = "button";
          b.addEventListener("click", async () => {
            const d = await call("/api/items/" + it.id);
            if (d.ok) { out.replaceChildren(); say(msg, ""); showResearch(out, d.data.item.body, d.data.item.meta.sources); window.scrollTo(0, 0); }
          });
          li.append(b, button("Delete", "ghost small", async () => { await call("/api/items/" + it.id, "DELETE"); loadHistory(); }));
          list.appendChild(li);
        });
      }
      root.append(c, out, hist);
      loadHistory();
    },
  };

  // ====================== PDF & Notes ======================
  V.docs = {
    mount() {},
    async show(root) {
      root.replaceChildren();
      pageHead(root, "PDF & Notes assistant", "Upload a PDF, Word, TXT or MD file (up to 3 MB), then summarise it, make notes, or ask questions.");
      if (!K.user()) return needLogin(root, "Log in to use PDF & Notes");
      const up = card("1. Upload a document");
      const file = input("file", { accept: ".pdf,.docx,.txt,.md" }), upMsg = status(), upBtn = button("Upload", "primary");
      upBtn.addEventListener("click", () => busy(upBtn, "Reading file...", async () => {
        if (!file.files[0]) { say(upMsg, "Choose a file first.", true); return; }
        if (file.files[0].size > 3 * 1024 * 1024) { say(upMsg, "That file is bigger than 3 MB.", true); return; }
        const fd = new FormData(); fd.append("file", file.files[0]);
        try {
          const res = await fetch("/api/docs", { method: "POST", body: fd });
          const d = await res.json().catch(() => ({}));
          if (!res.ok) { say(upMsg, d.error || "Upload failed.", true); return; }
          say(upMsg, d.truncated ? "Uploaded. The document was very long, so only the first part is used." : "Uploaded and read.");
          file.value = ""; selected = d.doc.id; await loadDocs();
        } catch (e) { say(upMsg, "No internet connection.", true); }
      }));
      up.append(file, upBtn, upMsg);
      const mine = card("2. Pick a document"), list = el("ul", "recent");
      mine.appendChild(list);
      const work = card("3. What do you want?");
      const out = el("div"), msg = status();
      let selected = null, docs = [];
      const q = input("text", { maxlength: "500", placeholder: "Type a question about the document" });
      async function act(action, btn) {
        if (!selected) { say(msg, "Pick a document first.", true); return; }
        if (action === "ask" && q.value.trim().length < 3) { say(msg, "Please type your question.", true); return; }
        await busy(btn, "Working...", async () => {
          out.replaceChildren(); say(msg, ""); out.appendChild(spinner("Aira is reading the document..."));
          const r = await call("/api/docs/" + selected + "/ask", "POST", { action, question: q.value });
          out.replaceChildren();
          if (!r.ok) { say(msg, r.data.error || "Something went wrong.", true); return; }
          const name = (docs.find((d) => d.id === selected) || {}).name || "document";
          const box = resultBox(r.data.text, "aira-" + action);
          box.lastChild.appendChild(button("Save as note", "ghost small", async () => {
            const s = await call("/api/items", "POST", { kind: "note", title: (action + ": " + name).slice(0, 100), body: r.data.text });
            toast(s.ok ? "Saved to your Library" : (s.data.error || "Could not save"), !s.ok);
          }));
          out.appendChild(box);
          if (r.data.partial) say(msg, "The document is long, so Aira used the parts that best match" + (action === "ask" ? " your question." : " the start of it."));
        });
      }
      const row = el("div", "row left");
      [["summary", "Summarise"], ["notes", "Make notes"], ["points", "Key points"]].forEach(([a, l]) => { const b = button(l, "ghost"); b.addEventListener("click", () => act(a, b)); row.appendChild(b); });
      const askBtn = button("Ask", "primary"); askBtn.addEventListener("click", () => act("ask", askBtn));
      q.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); askBtn.click(); } });
      const askRow = el("div", "fieldrow"); askRow.append(q, askBtn);
      work.append(row, askRow, msg, out);
      async function loadDocs() {
        const r = await call("/api/docs"); list.replaceChildren();
        docs = r.ok ? r.data.docs : [];
        if (!docs.length) { list.appendChild(empty("No documents yet. Upload one above.")); selected = null; return; }
        if (!docs.some((d) => d.id === selected)) selected = docs[0].id;
        docs.forEach((d) => {
          const li = el("li", "projchat"), b = el("button", "recent-item" + (d.id === selected ? " current" : ""), d.name + " (" + d.pages + (d.pages === 1 ? " page, " : " pages, ") + d.chars + " characters)");
          b.type = "button"; b.addEventListener("click", () => { selected = d.id; loadDocs(); });
          li.append(b, button("Delete", "ghost small", async () => { if (confirm("Delete this document?")) { await call("/api/docs/" + d.id, "DELETE"); loadDocs(); } }));
          list.appendChild(li);
        });
      }
      root.append(up, mine, work);
      loadDocs();
    },
  };

  // ====================== PDF & DOCX Creator ======================
  V.files = {
    mount() {},
    show(root) {
      root.replaceChildren();
      pageHead(root, "PDF & DOCX Creator", "Turn your text into a PDF, Word, TXT or Markdown file you can download.");
      if (!K.user()) return needLogin(root, "Log in to create files");
      const c = card();
      const title = input("text", { maxlength: "100", placeholder: "Document title (optional)" });
      const body = textarea(12, { maxlength: "40000", placeholder: "# Big heading\n## Smaller heading\nA normal paragraph.\n- A bullet point" });
      const fmt = select([["pdf", "PDF (.pdf)"], ["docx", "Word (.docx)"], ["txt", "Plain text (.txt)"], ["md", "Markdown (.md)"]]);
      const msg = status(), go = button("Create and download", "primary");
      go.addEventListener("click", () => busy(go, "Creating...", async () => {
        if (body.value.trim().length < 2) { say(msg, "Please write some text first.", true); return; }
        say(msg, ""); await K.makeFile(fmt.value, title.value, body.value);
      }));
      c.append(field("Title", title), field("Content", body, "Start a line with # for a heading, ## for a smaller heading, or - for a bullet."), field("File type", fmt), go, msg,
        el("p", "muted small", "PDF files support English and Hinglish (Latin letters). Other scripts such as Devanagari may show as ? in the PDF, use Word for those."));
      root.appendChild(c);
    },
  };

  // ====================== Library ======================
  const KINDS = [["", "All"], ["writing", "Writing"], ["research", "Research"], ["image", "Images"], ["note", "Notes"], ["plan", "Study tips"]];
  V.library = {
    mount() {},
    async show(root) {
      root.replaceChildren();
      pageHead(root, "Library", "Everything you made or saved with Aira: writing, research, pictures, notes and study tips.");
      if (!K.user()) return needLogin(root, "Log in to see your Library");
      let kind = "", q = "";
      const bar = card(), chips = el("div", "chiprow");
      const search = input("search", { maxlength: "60", placeholder: "Search your Library" });
      const list = el("div", "libgrid"), detail = el("div");
      KINDS.forEach(([k, l]) => {
        const b = button(l, "tagchip btnchip" + (k === "" ? " on" : ""), () => { kind = k; chips.querySelectorAll("button").forEach((x) => x.classList.toggle("on", x === b)); load(); });
        chips.appendChild(b);
      });
      search.addEventListener("input", () => { q = search.value.trim(); clearTimeout(search._t); search._t = setTimeout(load, 250); });
      // add a note by hand
      const nt = input("text", { maxlength: "120", placeholder: "Note title" }), nb = textarea(3, { maxlength: "50000", placeholder: "Write your note..." }), nm = status();
      const add = button("Save note", "primary", async () => {
        const r = await call("/api/items", "POST", { kind: "note", title: nt.value, body: nb.value });
        if (!r.ok) { say(nm, r.data.error || "Could not save.", true); return; }
        nt.value = ""; nb.value = ""; say(nm, "Note saved."); load();
      });
      const nbox = el("details", "faq"); nbox.appendChild(el("summary", "", "+ Write a new note")); nbox.append(nt, nb, add, nm);
      bar.append(search, chips, nbox);
      async function open(id) {
        const r = await call("/api/items/" + id); detail.replaceChildren();
        if (!r.ok) { toast(r.data.error || "Could not open it.", true); return; }
        const it = r.data.item, c = card(it.title, it.kind + " - " + K.when(it.created));
        if (it.kind === "image") {
          const img = el("img", "genimg"); img.alt = it.meta.prompt || it.title; img.src = "/api/items/" + it.id + "/image"; c.appendChild(img);
          const a = el("a", "primary linkbtn", "Download picture"); a.href = img.src; a.download = "aira-picture.png"; c.appendChild(a);
        } else {
          c.appendChild(resultBox(it.body, "aira-" + it.kind));
          (it.meta.sources || []).forEach((s) => { const a = el("a", "src", s.title); a.href = K.safeUrl(s.url); a.target = "_blank"; a.rel = "noopener noreferrer"; c.appendChild(a); });
        }
        c.appendChild(button("Delete from Library", "ghost danger", async () => { if (confirm("Delete this item?")) { await call("/api/items/" + id, "DELETE"); detail.replaceChildren(); load(); } }));
        detail.appendChild(c); detail.scrollIntoView({ behavior: "smooth", block: "start" });
      }
      async function load() {
        const r = await call("/api/items?kind=" + encodeURIComponent(kind) + "&q=" + encodeURIComponent(q));
        list.replaceChildren();
        if (!r.ok || !r.data.items.length) { list.appendChild(empty(q || kind ? "Nothing matches." : "Your Library is empty. Things you write, research or generate appear here.")); return; }
        r.data.items.forEach((it) => {
          const b = el("button", "libitem"); b.type = "button";
          if (it.kind === "image") { const t = el("img", "thumb"); t.alt = ""; t.loading = "lazy"; t.src = "/api/items/" + it.id + "/image"; b.appendChild(t); }
          b.appendChild(el("b", "", it.title)); b.appendChild(el("span", "tag", it.kind));
          if (it.preview) b.appendChild(el("span", "muted small", it.preview));
          b.addEventListener("click", () => open(it.id)); list.appendChild(b);
        });
      }
      root.append(bar, detail, list);
      load();
    },
  };

  // ====================== Image Studio ======================
  V.image = {
    mount() {},
    async show(root) {
      root.replaceChildren();
      pageHead(root, "Image Studio", "Describe a picture and Aira will generate it.");
      if (!K.user()) return needLogin(root, "Log in to use the Image Studio");
      const c = card();
      if (!K.features().imageGen) {
        c.appendChild(el("p", "status bad", "Image generation is not switched on for this website yet. The owner must connect an image service (see README, section Image Studio). Nothing is faked here: no picture will be shown until it really works."));
      }
      const prompt = textarea(3, { maxlength: "500", placeholder: "Example: A purple robot reading a book in a library, digital art" });
      const msg = status(), out = el("div"), go = button("Generate picture", "primary");
      go.disabled = !K.features().imageGen;
      const hist = card("Your pictures"), grid = el("div", "libgrid");
      hist.appendChild(grid);
      function showPic(src, id, text) {
        out.replaceChildren();
        const box = card(); const img = el("img", "genimg"); img.alt = text; img.src = src; box.appendChild(img);
        const a = el("a", "primary linkbtn", "Download picture"); a.href = src; a.download = "aira-picture.png"; box.appendChild(a);
        if (id) box.appendChild(button("Delete", "ghost danger", async () => { await call("/api/items/" + id, "DELETE"); out.replaceChildren(); loadHistory(); }));
        out.appendChild(box);
      }
      go.addEventListener("click", () => busy(go, "Generating...", async () => {
        out.replaceChildren(); say(msg, "");
        if (prompt.value.trim().length < 3) { say(msg, "Please describe the picture.", true); return; }
        out.appendChild(spinner("Generating your picture. This can take up to a minute..."));
        const r = await call("/api/image", "POST", { prompt: prompt.value });
        out.replaceChildren();
        if (!r.ok) { say(msg, r.data.error || "Could not make the picture.", true); return; }
        showPic(r.data.id ? "/api/items/" + r.data.id + "/image" : r.data.image, r.data.id, r.data.prompt);
        say(msg, "Done. It is saved in your picture history."); loadHistory();
      }));
      async function loadHistory() {
        const r = await call("/api/items?kind=image"); grid.replaceChildren();
        if (!r.ok || !r.data.items.length) { grid.appendChild(empty("No pictures yet.")); return; }
        r.data.items.forEach((it) => {
          const b = el("button", "libitem"); b.type = "button";
          const t = el("img", "thumb"); t.alt = it.title; t.loading = "lazy"; t.src = "/api/items/" + it.id + "/image";
          b.append(t, el("span", "muted small", it.title));
          b.addEventListener("click", () => showPic("/api/items/" + it.id + "/image", it.id, it.title));
          grid.appendChild(b);
        });
      }
      c.append(field("Describe the picture", prompt), go, msg);
      root.append(c, out, hist);
      loadHistory();
    },
  };
})();
