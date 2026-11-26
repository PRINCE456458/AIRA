
// AIRA Vision AI — Local Face Analysis
(() => {
  "use strict";

  const V = window.AiraViews = window.AiraViews || {};

  const CDN_LIST = [
  "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision"
];

  const MODEL =
    "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task";

  const el = (tag, cls, text) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined) n.textContent = text;
    return n;
  };

  async function loadVision() {
  const cdn = CDN_LIST[0];

  try {
    const vision = await import(
      cdn + "/vision_bundle.mjs"
    );

    const files = await vision.FilesetResolver.forVisionTasks(
      cdn + "/wasm"
    );

    return { vision, files };

  } catch (error) {
    console.error("MediaPipe loading failed:", error);

    throw new Error(
      "MediaPipe module failed: " +
      (error.message || "Check browser console and network.")
    );
  }
}

  async function createLandmarker(vision, files, delegate) {
    return vision.FaceLandmarker.createFromOptions(files, {
      baseOptions: {
        modelAssetPath: MODEL,
        delegate
      },
      runningMode: "VIDEO",
      numFaces: 1,
      outputFaceBlendshapes: false,
      outputFacialTransformationMatrixes: false
    });
  }

  V.vision = {
    mount() {},

    show(root) {
      root.replaceChildren();

      const head = el("div", "page-head");
      head.append(
        el("h2", "", "AIRA Vision AI"),
        el("p", "muted", "Live facial landmarks, face mesh and movement analysis.")
      );

      const shell = el("div", "vision-shell");
      const stage = el("div", "vision-stage");

      const video = el("video", "vision-video");
      video.autoplay = true;
      video.muted = true;
      video.playsInline = true;

      const canvas = el("canvas", "vision-canvas");
      const ctx = canvas.getContext("2d");

      const placeholder = el(
        "div",
        "vision-placeholder",
        "Camera is off. Press Start Camera."
      );

      stage.append(video, canvas, placeholder);

      const controls = el("div", "vision-controls");

      const start = el("button", "primary", "Start Camera");
      const stop = el("button", "ghost", "Stop Camera");

      start.type = stop.type = "button";
      stop.disabled = true;

      const meshLabel = el("label", "vision-toggle");
      const mesh = el("input");
      mesh.type = "checkbox";
      mesh.checked = true;

      meshLabel.append(mesh, document.createTextNode(" Show Face Mesh"));

      controls.append(start, stop, meshLabel);

      const status = el(
        "p",
        "vision-status",
        "Ready. Camera permission will be requested after clicking Start."
      );

      status.setAttribute("role", "status");

      const metrics = el("div", "vision-metrics");

      const metric = (name, value) => {
        const c = el("div", "vision-metric");
        c.append(el("span", "muted", name), el("strong", "", value));
        metrics.append(c);
        return c.querySelector("strong");
      };

      const face = metric("Face Detection", "Not detected");
      const yaw = metric("Head Direction", "—");
      const roll = metric("Head Tilt", "—");
      const eyes = metric("Eye Position", "—");

      const note = el(
        "p",
        "muted vision-note",
        "Face landmarks and movement are processed locally. No face images are uploaded or stored."
      );

      shell.append(stage, controls, status, metrics, note);
      root.append(head, shell);

      let stream = null;
      let landmarker = null;
      let raf = 0;
      let lastVideoTime = -1;
      let active = false;
      let cleaned = false;

      const setStatus = (message, error = false) => {
        status.textContent = message;
        status.classList.toggle("error", error);
      };

      function stopCamera(showMessage = true) {
        active = false;

        if (raf) cancelAnimationFrame(raf);
        raf = 0;

        if (stream) {
          stream.getTracks().forEach(track => track.stop());
        }

        stream = null;
        video.srcObject = null;

        ctx.clearRect(0, 0, canvas.width, canvas.height);

        placeholder.hidden = false;
        stop.disabled = true;
        start.disabled = false;

        face.textContent = "Not detected";
        yaw.textContent = "—";
        roll.textContent = "—";
        eyes.textContent = "—";

        if (showMessage) setStatus("Camera stopped.");
      }

      function draw(landmarks) {
        const w = video.videoWidth;
        const h = video.videoHeight;

        if (!w || !h) return;

        if (canvas.width !== w || canvas.height !== h) {
          canvas.width = w;
          canvas.height = h;
        }

        ctx.clearRect(0, 0, w, h);

        if (!landmarks || !mesh.checked) return;

        ctx.strokeStyle = "rgba(184,116,255,.75)";
        ctx.lineWidth = Math.max(0.7, w / 1000);

        const groups = [[
          10,338,297,332,284,251,389,356,454,
          323,361,288,397,365,379,378,400,377,
          152,148,176,149,150,136,172,58,132,
          93,234,127,162,21,54,103,67,109
        ]];

        for (const group of groups) {
          ctx.beginPath();

          group.forEach((index, j) => {
            const p = landmarks[index];
            if (!p) return;

            const x = p.x * w;
            const y = p.y * h;

            if (j === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
          });

          ctx.closePath();
          ctx.stroke();
        }

        ctx.fillStyle = "rgba(103,220,255,.9)";

        landmarks.forEach((p, i) => {
          if (i % 3 === 0) {
            ctx.beginPath();
            ctx.arc(
              p.x * w,
              p.y * h,
              Math.max(1, w / 650),
              0,
              Math.PI * 2
            );
            ctx.fill();
          }
        });
      }

      function analyze(lm) {
        if (!lm) {
          face.textContent = "Not detected";
          yaw.textContent = "—";
          roll.textContent = "—";
          eyes.textContent = "—";
          return;
        }

        face.textContent = "1 face detected";

        const p = i => lm[i];

        const left = p(33);
        const right = p(263);
        const nose = p(1);

        if (!left || !right || !nose) return;

        const mid = (left.x + right.x) / 2;
        const width = Math.max(0.001, Math.abs(right.x - left.x));
        const offset = (nose.x - mid) / width;

        yaw.textContent =
          Math.abs(offset) < 0.08
            ? "Forward"
            : offset < 0
              ? "Turned left"
              : "Turned right";

        roll.textContent = (
          Math.atan2(
            right.y - left.y,
            right.x - left.x
          ) * 180 / Math.PI
        ).toFixed(1) + "°";

        if (lm[468] && lm[473] && p(133) && p(362)) {
          const leftRatio =
            (lm[468].x - p(33).x) /
            Math.max(0.001, p(133).x - p(33).x);

          const rightRatio =
            (lm[473].x - p(362).x) /
            Math.max(0.001, p(263).x - p(362).x);

          const gaze = (leftRatio + rightRatio) / 2;

          eyes.textContent =
            gaze < 0.38
              ? "Looking left"
              : gaze > 0.62
                ? "Looking right"
                : "Near center";
        } else {
          eyes.textContent = "Landmarks available";
        }
      }

      function loop() {
        if (!active) return;

        if (
          video.currentTime !== lastVideoTime &&
          landmarker
        ) {
          lastVideoTime = video.currentTime;

          try {
            const result = landmarker.detectForVideo(
              video,
              performance.now()
            );

            const landmarks =
              result.faceLandmarks?.[0] || null;

            draw(landmarks);
            analyze(landmarks);

          } catch (error) {
            setStatus("Analysis error: " + error.message, true);
          }
        }

        raf = requestAnimationFrame(loop);
      }

      start.addEventListener("click", async () => {
        start.disabled = true;
        setStatus("Loading AI face analysis model...");

        try {
          if (
            !navigator.mediaDevices ||
            !navigator.mediaDevices.getUserMedia
          ) {
            throw new Error("Camera requires HTTPS or localhost.");
          }

          setStatus("Connecting to MediaPipe...");

          const { vision, files } = await loadVision();

          setStatus("Loading face analysis model...");

          try {
            landmarker = await createLandmarker(
              vision,
              files,
              "GPU"
            );
          } catch (gpuError) {
            console.warn("GPU unavailable, trying CPU:", gpuError);

            landmarker = await createLandmarker(
              vision,
              files,
              "CPU"
            );
          }

          setStatus("Requesting camera permission...");

          stream = await navigator.mediaDevices.getUserMedia({
            video: {
              facingMode: "user",
              width: { ideal: 1280 },
              height: { ideal: 720 }
            },
            audio: false
          });

          video.srcObject = stream;
          await video.play();

          placeholder.hidden = true;
          active = true;
          lastVideoTime = -1;

          stop.disabled = false;

          setStatus("AIRA Vision AI is active.");
          loop();

        } catch (error) {
          console.error("AIRA Vision error:", error);

          if (stream) {
            stream.getTracks().forEach(t => t.stop());
          }

          stream = null;
          video.srcObject = null;

          if (landmarker) {
            landmarker.close();
            landmarker = null;
          }

          start.disabled = false;

          setStatus(
            error.name === "NotAllowedError"
              ? "Camera permission denied. Allow camera access and retry."
              : "Error: " + (error.message || "Could not start Vision AI."),
            true
          );
        }
      });

      stop.addEventListener("click", () => {
        stopCamera();
      });

      mesh.addEventListener("change", () => {
        if (!mesh.checked) {
          ctx.clearRect(0, 0, canvas.width, canvas.height);
        }
      });

      const cleanup = () => {
        if (cleaned) return;
        cleaned = true;

        stopCamera(false);

        if (landmarker) {
          landmarker.close();
          landmarker = null;
        }

        document.removeEventListener("aira:route", onHide);
        window.removeEventListener("pagehide", cleanup);
      };

      const onHide = () => {
        if (document.getElementById("view-vision")?.hidden) {
          cleanup();
        }
      };

      document.addEventListener("aira:route", onHide);
      window.addEventListener("pagehide", cleanup);
    }
  };
})();
