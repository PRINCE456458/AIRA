// AIRA 3D Human Hologram — self-contained WebGL renderer (no external libraries).
(() => {
  "use strict";

  const V = window.AiraViews = window.AiraViews || {};
  let activeCleanup = null;

  const vertexSource = `
    attribute vec2 a_position;
    void main() { gl_Position = vec4(a_position, 0.0, 1.0); }
  `;

  const fragmentSource = `
    precision highp float;
    uniform vec2 u_resolution;
    uniform float u_time;
    uniform vec2 u_pointer;
    uniform float u_mode;

    mat3 rotY(float a) {
      float c = cos(a), s = sin(a);
      return mat3(c,0.0,-s, 0.0,1.0,0.0, s,0.0,c);
    }
    mat3 rotX(float a) {
      float c = cos(a), s = sin(a);
      return mat3(1.0,0.0,0.0, 0.0,c,s, 0.0,-s,c);
    }
    float ellipsoid(vec3 p, vec3 r) {
      float k0 = length(p / r);
      float k1 = length(p / (r * r));
      return k0 * (k0 - 1.0) / max(k1, 0.0001);
    }
    float scene(vec3 world, out vec3 local) {
      float sway = sin(u_time * 0.7) * 0.025;
      local = rotX(-u_pointer.y * 0.22) * rotY(-u_pointer.x * 0.48) * world;
      vec3 p = local;
      p.y -= sway;
      float head = ellipsoid(p - vec3(0.0, 0.48, 0.0), vec3(0.59, 0.78, 0.47));
      float hair = ellipsoid(p - vec3(0.0, 0.91, -0.035), vec3(0.615, 0.40, 0.49));
      float neck = ellipsoid(p - vec3(0.0, -0.43, -0.015), vec3(0.235, 0.43, 0.245));
      float shoulders = ellipsoid(p - vec3(0.0, -1.02, -0.06), vec3(0.94, 0.48, 0.43));
      float earL = ellipsoid(p - vec3(-0.575, 0.36, 0.0), vec3(0.13, 0.22, 0.16));
      float earR = ellipsoid(p - vec3(0.575, 0.36, 0.0), vec3(0.13, 0.22, 0.16));
      return min(min(min(head, hair), neck), min(shoulders, min(earL, earR)));
    }
    vec3 normalAt(vec3 p) {
      vec3 q;
      float e = 0.002;
      return normalize(vec3(
        scene(p + vec3(e,0.0,0.0), q) - scene(p - vec3(e,0.0,0.0), q),
        scene(p + vec3(0.0,e,0.0), q) - scene(p - vec3(0.0,e,0.0), q),
        scene(p + vec3(0.0,0.0,e), q) - scene(p - vec3(0.0,0.0,e), q)
      ));
    }
    float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }

    void main() {
      vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / min(u_resolution.x, u_resolution.y);
      vec3 bg = vec3(0.012,0.008,0.035);
      float vignette = smoothstep(1.25,0.12,length(uv));
      bg += vec3(0.035,0.012,0.09) * vignette;
      float grid = max(abs(fract(uv.x * 8.0)-0.5), abs(fract(uv.y * 8.0)-0.5));
      bg += vec3(0.025,0.035,0.11) * (1.0-smoothstep(0.475,0.5,grid)) * 0.25;
      float stars = step(0.997, hash(floor((uv + 1.0) * 150.0)));
      bg += vec3(0.35,0.65,1.0) * stars * (0.4 + 0.4*sin(u_time*1.8));

      vec3 ro = vec3(0.0, 0.0, 4.15);
      vec3 rd = normalize(vec3(uv.x * 1.08, uv.y * 1.08, -1.85));
      float t = 0.0;
      float d = 0.0;
      vec3 local = vec3(0.0);
      bool hit = false;
      for (int i=0; i<88; i++) {
        vec3 pos = ro + rd*t;
        d = scene(pos, local);
        if (d < 0.0025) { hit = true; break; }
        t += d * 0.78;
        if (t > 8.0) break;
      }

      vec3 color = bg;
      if (hit) {
        vec3 pos = ro + rd*t;
        vec3 n = normalAt(pos);
        vec3 q;
        scene(pos, q);
        vec3 lightDir = normalize(vec3(-0.55,0.8,1.0));
        float diffuse = max(dot(n,lightDir),0.0);
        float rim = pow(1.0-max(dot(n,-rd),0.0),2.3);
        float bands = 0.72 + 0.28*sin(q.y*125.0 + u_time*2.4);
        float scan = 0.78 + 0.22*sin(gl_FragCoord.y*0.72 + u_time*3.0);
        vec3 base = mix(vec3(0.13,0.28,0.72),vec3(0.54,0.18,0.95),0.5+0.5*sin(q.y*2.0));
        if (u_mode > 0.5 && u_mode < 1.5) base = mix(base,vec3(0.08,0.85,1.0),0.42);
        if (u_mode > 1.5 && u_mode < 2.5) base = mix(base,vec3(0.72,0.28,1.0),0.48);
        if (u_mode > 2.5) base = mix(base,vec3(0.12,0.95,0.88),0.42);
        float faceFront = smoothstep(0.18,0.43,q.z);
        float eyeGlow = exp(-abs(q.y-0.54)*85.0) * exp(-abs(abs(q.x)-0.225)*23.0) * faceFront;
        float noseGlow = exp(-abs(q.x)*22.0) * exp(-abs(q.y-0.29)*28.0) * faceFront;
        float mouthMove = u_mode > 2.5 ? 0.025*sin(u_time*12.0) : 0.0;
        float mouthGlow = exp(-abs(q.y-(0.075+mouthMove))*95.0) * exp(-abs(q.x)*13.0) * faceFront;
        float hairEdge = smoothstep(0.2,0.9,q.y) * 0.12;
        color = base * (0.22 + diffuse*0.62) * bands * scan;
        color += vec3(0.15,0.65,1.0) * rim * 1.15;
        color += vec3(0.22,0.9,1.0) * eyeGlow * 1.7;
        color += vec3(0.48,0.65,1.0) * noseGlow * 0.34;
        color += vec3(0.35,0.9,1.0) * mouthGlow * (0.7 + 0.4*sin(u_time*8.0));
        color += vec3(0.5,0.22,1.0) * hairEdge;
        color += vec3(0.04,0.3,0.75) * (0.4 + 0.3*sin(q.y*38.0+u_time*2.0));
        color *= 1.0 + 0.08*sin(u_time*2.2);
      }

      float halo = exp(-abs(length(uv*vec2(1.0,0.8))-0.62)*34.0);
      color += vec3(0.12,0.25,0.9) * halo * 0.18;
      color = pow(max(color,0.0),vec3(0.88));
      gl_FragColor = vec4(color, 1.0);
    }
  `;

  function compile(gl, type, source) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      const message = gl.getShaderInfoLog(shader) || "Shader compilation failed";
      gl.deleteShader(shader);
      throw new Error(message);
    }
    return shader;
  }

  function createRenderer(canvas, status) {
    const gl = canvas.getContext("webgl", { alpha: false, antialias: true, powerPreference: "high-performance" });
    if (!gl) throw new Error("WebGL is not available in this browser.");
    const vs = compile(gl, gl.VERTEX_SHADER, vertexSource);
    const fs = compile(gl, gl.FRAGMENT_SHADER, fragmentSource);
    const program = gl.createProgram();
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program) || "Could not link hologram renderer.");
    gl.useProgram(program);

    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 1,-1, -1,1, -1,1, 1,-1, 1,1]), gl.STATIC_DRAW);
    const position = gl.getAttribLocation(program, "a_position");
    gl.enableVertexAttribArray(position);
    gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);

    const resolution = gl.getUniformLocation(program, "u_resolution");
    const time = gl.getUniformLocation(program, "u_time");
    const pointer = gl.getUniformLocation(program, "u_pointer");
    const mode = gl.getUniformLocation(program, "u_mode");
    let raf = 0, started = performance.now(), modeValue = 0, pointerX = 0, pointerY = 0;
    let width = 0, height = 0, alive = true;

    function resize() {
      const rect = canvas.getBoundingClientRect();
      const ratio = Math.min(window.devicePixelRatio || 1, 1.7);
      width = Math.max(1, Math.round(rect.width * ratio));
      height = Math.max(1, Math.round(rect.height * ratio));
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width; canvas.height = height;
        gl.viewport(0, 0, width, height);
      }
    }
    function frame(now) {
      if (!alive) return;
      resize();
      gl.uniform2f(resolution, width, height);
      gl.uniform1f(time, (now-started)/1000);
      gl.uniform2f(pointer, pointerX, pointerY);
      gl.uniform1f(mode, modeValue);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
      raf = requestAnimationFrame(frame);
    }
    function setMode(value) { modeValue = value; }
    function setPointer(x,y) { pointerX = x; pointerY = y; }
    function stop() { alive = false; cancelAnimationFrame(raf); }
    frame(performance.now());
    status.textContent = "3D RENDERER ONLINE";
    return { setMode, setPointer, stop };
  }

  V.hologram = {
    mount() {},
    show(root) {
      if (activeCleanup) activeCleanup();
      root.replaceChildren();

      const page = document.createElement("div");
      page.className = "aira-holo-page";
      page.innerHTML = `
        <div class="aira-holo-top">
          <a class="aira-holo-brand" href="#/home" aria-label="Back to AIRA dashboard"><span class="aira-holo-brand-mark">A</span><span><b>AIRA</b><small>HOLOGRAPHIC INTERFACE</small></span></a>
          <div class="aira-holo-live"><i></i><span id="holoConnection">INITIALIZING</span></div>
          <button class="aira-holo-exit" type="button" aria-label="Exit hologram">× <span>EXIT</span></button>
        </div>
        <div class="aira-holo-main">
          <div class="aira-holo-scene">
            <div class="aira-holo-orbit aira-holo-orbit-a"></div>
            <div class="aira-holo-orbit aira-holo-orbit-b"></div>
            <canvas class="aira-holo-canvas" aria-label="Interactive 3D holographic human avatar"></canvas>
            <div class="aira-holo-fallback" aria-hidden="true"><div class="aira-holo-fallback-head"></div><div class="aira-holo-fallback-neck"></div><div class="aira-holo-fallback-shoulders"></div><div class="aira-holo-fallback-eyes"></div></div>
            <div class="aira-holo-scan"></div>
            <div class="aira-holo-name"><b>AIRA</b><span>PERSONAL AI AVATAR</span></div>
            <div class="aira-holo-hint">DRAG TO ROTATE · TOUCH TO INTERACT</div>
          </div>
          <aside class="aira-holo-panel">
            <div class="aira-holo-panel-kicker">NEURAL INTERFACE <span>V 1.0</span></div>
            <h1>Meet <em>AIRA</em></h1>
            <p class="aira-holo-copy">Your personal AI, brought into a holographic space.</p>
            <div class="aira-holo-state"><span class="aira-holo-state-dot"></span><div><small>AVATAR STATUS</small><b id="holoState">Idle</b></div><span class="aira-holo-state-code" id="holoCode">SYS-01</span></div>
            <div class="aira-holo-controls-label">INTERACTION MODE</div>
            <div class="aira-holo-modes">
              <button type="button" class="active" data-mode="0"><span>◌</span>Idle</button>
              <button type="button" data-mode="1"><span>◎</span>Listening</button>
              <button type="button" data-mode="2"><span>✧</span>Thinking</button>
              <button type="button" data-mode="3"><span>⌁</span>Speaking</button>
            </div>
            <p class="aira-holo-note" id="holoNote">AIRA is standing by. Choose a mode to animate the avatar.</p>
            <div class="aira-holo-footer"><span>LOCAL WEBGL RENDER</span><span>NO CAMERA REQUIRED</span></div>
          </aside>
        </div>
        <div class="aira-holo-bottom"><span>● SYSTEM NOMINAL</span><span>INTERACTIVE 3D HUMAN HOLOGRAM</span><span>© AIRA AI</span></div>
      `;
      root.appendChild(page);

      const canvas = page.querySelector(".aira-holo-canvas");
      const fallback = page.querySelector(".aira-holo-fallback");
      const connection = page.querySelector("#holoConnection");
      const stateLabel = page.querySelector("#holoState");
      const note = page.querySelector("#holoNote");
      const code = page.querySelector("#holoCode");
      let renderer = null, dragging = false, lastX = 0, lastY = 0, yaw = 0, pitch = 0;
      let resizeObserver = null, disposed = false;

      try {
        renderer = createRenderer(canvas, connection);
        fallback.hidden = true;
        canvas.classList.add("is-ready");
      } catch (error) {
        connection.textContent = "2D FALLBACK MODE";
        note.textContent = "WebGL could not start: " + error.message + ". Showing the hologram fallback.";
        console.warn("AIRA Hologram renderer:", error);
      }

      const modeNotes = [
        ["Idle", "SYS-01", "AIRA is standing by. Choose a mode to animate the avatar."],
        ["Listening", "AUD-02", "Listening mode active. Voice integration can be connected separately."],
        ["Thinking", "COG-03", "Thinking mode active. The hologram is visualizing an AI processing state."],
        ["Speaking", "VOC-04", "Speaking mode active. Voice-synchronized animation can be connected to AIRA voice output."]
      ];
      page.querySelectorAll("[data-mode]").forEach(button => {
        button.addEventListener("click", () => {
          const value = Number(button.dataset.mode);
          page.querySelectorAll("[data-mode]").forEach(item => item.classList.toggle("active", item === button));
          stateLabel.textContent = modeNotes[value][0];
          code.textContent = modeNotes[value][1];
          note.textContent = modeNotes[value][2];
          if (renderer) renderer.setMode(value);
          page.dataset.mode = String(value);
        });
      });

      canvas.addEventListener("pointerdown", event => {
        dragging = true; lastX = event.clientX; lastY = event.clientY;
        canvas.setPointerCapture(event.pointerId);
      });
      canvas.addEventListener("pointermove", event => {
        if (!dragging) return;
        yaw = Math.max(-1.1, Math.min(1.1, yaw + (event.clientX-lastX)*0.008));
        pitch = Math.max(-0.65, Math.min(0.65, pitch + (event.clientY-lastY)*0.006));
        lastX = event.clientX; lastY = event.clientY;
        if (renderer) renderer.setPointer(yaw,pitch);
      });
      const endDrag = () => { dragging = false; };
      canvas.addEventListener("pointerup", endDrag);
      canvas.addEventListener("pointercancel", endDrag);
      page.querySelector(".aira-holo-exit").addEventListener("click", () => { location.hash = "#/home"; });

      if ("ResizeObserver" in window) {
        resizeObserver = new ResizeObserver(() => { if (renderer) renderer.setPointer(yaw,pitch); });
        resizeObserver.observe(canvas);
      }

      const onRoute = event => {
        if (event.detail && event.detail.view !== "hologram") cleanup();
      };
      function cleanup() {
        if (disposed) return;
        disposed = true;
        if (renderer) renderer.stop();
        if (resizeObserver) resizeObserver.disconnect();
        document.removeEventListener("aira:route", onRoute);
        window.removeEventListener("pagehide", cleanup);
      }
      document.addEventListener("aira:route", onRoute);
      window.addEventListener("pagehide", cleanup);
      activeCleanup = cleanup;
    }
  };
})();
