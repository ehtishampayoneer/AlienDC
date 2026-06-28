"use client";
// app/page.js
import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { ALIENS, getAlien } from "../lib/aliens";

const SCAN_LINES = [
  "CALIBRATING SUBSPACE ARRAY",
  "SWEEPING DEEP FIELD",
  "FILTERING COSMIC NOISE",
  "CARRIER WAVE DETECTED",
  "RESOLVING SOURCES",
  "CONTACT ESTABLISHED",
];

export default function Page() {
  const [stage, setStage] = useState("intro");
  const [alienId, setAlienId] = useState(null);
  const [scanIdx, setScanIdx] = useState(0);

  if (stage === "intro") {
    return (
      <div id="app" className="scanlines fade">
        <div className="screen bg-void">
          <div className="stars" />
          <div className="eyebrow">Deep Field Contact Array</div>
          <h1 className="title">
            ESTABLISH
            <br />
            <em>CONTACT</em>
          </h1>
          <p className="sub">
            Open a live channel into the dark between stars. Something out there
            is listening. When contact lands, it arrives in the room around you.
          </p>
          <button className="btn" onClick={() => setStage("scan")}>
            Begin Scan
          </button>
          <div className="footnote">SECURE LINK · DEEP FIELD v1.0</div>
        </div>
      </div>
    );
  }

  if (stage === "scan") {
    return (
      <ScanScreen
        scanIdx={scanIdx}
        setScanIdx={setScanIdx}
        onDone={() => setStage("select")}
      />
    );
  }

  if (stage === "select") {
    return (
      <div id="app" className="scanlines fade">
        <div className="screen bg-void">
          <div className="stars" />
          <div className="eyebrow">{ALIENS.length} Signals Acquired</div>
          <h1 className="title" style={{ fontSize: "clamp(28px,8vw,44px)" }}>
            CHOOSE A<br />
            <em>SIGNAL</em>
          </h1>
          <div className="signals">
            {ALIENS.map((a) => (
              <div
                key={a.id}
                className="signal-card"
                style={{ "--c": a.color }}
                onClick={() => {
                  setAlienId(a.id);
                  setStage("ar");
                }}
              >
                <div className="desig">{a.designation}</div>
                <div className="nm">{a.name}</div>
                <div className="org">transmitting from {a.origin}</div>
              </div>
            ))}
          </div>
          <button className="btn ghost" onClick={() => setStage("scan")}>
            Re-scan
          </button>
        </div>
      </div>
    );
  }

  return <ARScene alienId={alienId} onExit={() => setStage("select")} />;
}

/* ============================================================= */
function ScanScreen({ scanIdx, setScanIdx, onDone }) {
  useEffect(() => {
    if (scanIdx >= SCAN_LINES.length - 1) {
      const t = setTimeout(onDone, 1000);
      return () => clearTimeout(t);
    }
    const t = setTimeout(() => setScanIdx((i) => i + 1), 780);
    return () => clearTimeout(t);
  }, [scanIdx, setScanIdx, onDone]);

  const showBlips = scanIdx >= 3;
  return (
    <div id="app" className="scanlines fade">
      <div className="screen bg-void">
        <div className="stars" />
        <div className="eyebrow">Scanning</div>
        <div className="radar-wrap">
          <div className="radar">
            <div className="ring r1" />
            <div className="ring r2" />
            <div className="ring r3" />
            <div className="cross-h" />
            <div className="cross-v" />
            <div className="sweep" />
            {showBlips && (
              <>
                <span className="blip" style={{ left: "32%", top: "40%" }} />
                <span className="blip" style={{ left: "66%", top: "58%", animationDelay: "0.6s" }} />
                <span className="blip" style={{ left: "54%", top: "30%", animationDelay: "1.1s" }} />
              </>
            )}
          </div>
        </div>
        <div className="status">{SCAN_LINES[scanIdx]}</div>
      </div>
    </div>
  );
}

/* ============================================================= */
/* AR SCENE — barge-in capable, streaming, hands-free            */
/* ============================================================= */
function ARScene({ alienId, onExit }) {
  const alien = getAlien(alienId);
  const camRef = useRef(null);
  const threeRef = useRef(null);

  const [phase, setPhase] = useState("armed"); // armed|listening|thinking|speaking|paused
  const [caption, setCaption] = useState("");
  const [captionWho, setCaptionWho] = useState("");
  const [err, setErr] = useState("");
  const [ready, setReady] = useState(false);
  const [typed, setTyped] = useState("");
  const [pausedView, setPausedView] = useState(false);

  const phaseRef = useRef("armed");
  const setPhaseSafe = (p) => {
    phaseRef.current = p;
    setPhase(p);
  };
  const pausedRef = useRef(false);
  const disposedRef = useRef(false);
  const speakingRef = useRef(false);

  const recogRef = useRef(null);
  const messagesRef = useRef([]);
  const greetRef = useRef("");
  const memKey = `fc_mem_${alien.id}`;

  // conversation engine state (refs so callbacks always read latest)
  const spokenTextRef = useRef(""); // what alien is currently saying (echo filter)
  const speakQueueRef = useRef(0);
  const streamDoneRef = useRef(false);
  const controllerRef = useRef(null);
  const apiRef = useRef({});

  /* ---- helpers ---- */
  const isEcho = (heard, spoken) => {
    if (!spoken) return false;
    const norm = (s) =>
      s.toLowerCase().replace(/[^a-z0-9\s]/g, "").split(/\s+/).filter(Boolean);
    const h = norm(heard);
    if (!h.length) return true;
    const set = new Set(norm(spoken));
    const overlap = h.filter((w) => set.has(w)).length / h.length;
    return overlap > 0.55;
  };

  const speakOne = (text) => {
    if (typeof window === "undefined" || !window.speechSynthesis) return;
    const u = new SpeechSynthesisUtterance(text);
    u.pitch = alien.voicePitch;
    u.rate = alien.voiceRate;
    const voices = window.speechSynthesis.getVoices();
    const pref =
      voices.find((v) => /Google UK English Male|Daniel|Arthur|Fred/i.test(v.name)) ||
      voices.find((v) => /en[-_]/i.test(v.lang)) ||
      voices[0];
    if (pref) u.voice = pref;
    speakQueueRef.current++;
    speakingRef.current = true;
    setPhaseSafe("speaking");
    const finish = () => {
      speakQueueRef.current = Math.max(0, speakQueueRef.current - 1);
      if (speakQueueRef.current === 0 && streamDoneRef.current && !pausedRef.current) {
        speakingRef.current = false;
        spokenTextRef.current = "";
        if (!disposedRef.current) setPhaseSafe("listening");
      }
    };
    u.onend = finish;
    u.onerror = finish;
    window.speechSynthesis.speak(u);
  };

  const enqueueSpeak = (text) => {
    if (!text) return;
    spokenTextRef.current += " " + text;
    speakOne(text);
  };

  const bargeIn = () => {
    try {
      controllerRef.current && controllerRef.current.abort();
    } catch (e) {}
    try {
      window.speechSynthesis && window.speechSynthesis.cancel();
    } catch (e) {}
    speakQueueRef.current = 0;
    speakingRef.current = false;
    spokenTextRef.current = "";
    streamDoneRef.current = true;
    setPhaseSafe("listening");
  };

  const send = async (text) => {
    const clean = (text || "").trim();
    if (!clean) return;
    try {
      controllerRef.current && controllerRef.current.abort();
    } catch (e) {}
    try {
      window.speechSynthesis && window.speechSynthesis.cancel();
    } catch (e) {}
    setErr("");
    speakQueueRef.current = 0;
    speakingRef.current = false;
    spokenTextRef.current = "";
    streamDoneRef.current = false;

    const next = [...messagesRef.current, { role: "user", text: clean }];
    messagesRef.current = next;
    setCaptionWho("YOU");
    setCaption(clean);
    setPhaseSafe("thinking");

    let memory = "";
    try {
      memory = localStorage.getItem(`${memKey}_summary`) || "";
    } catch (e) {}

    const ctrl = new AbortController();
    controllerRef.current = ctrl;

    try {
      const r = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          alienId: alien.id,
          history: next.slice(0, -1),
          message: clean,
          memory,
        }),
        signal: ctrl.signal,
      });

      if (!r.ok || !r.body) {
        let msg = "Link failed. Re-opening channel.";
        try {
          const d = await r.json();
          msg = d.error || msg;
        } catch (e) {}
        setErr(msg);
        if (!disposedRef.current && !pausedRef.current) setPhaseSafe("listening");
        return;
      }

      const reader = r.body.getReader();
      const dec = new TextDecoder();
      let full = "";
      let spokenLen = 0;
      setCaptionWho(alien.name.toUpperCase());
      setCaption("");

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        full += dec.decode(value, { stream: true });
        setCaption(full);
        const pending = full.slice(spokenLen);
        const sentences = pending.match(/[^.!?…]+[.!?…]+/g);
        if (sentences) {
          for (const s of sentences) {
            enqueueSpeak(s.trim());
            spokenLen += s.length;
          }
        }
      }
      const tail = full.slice(spokenLen).trim();
      if (tail) enqueueSpeak(tail);

      const reply = full.trim() || "...the signal broke up. Say that again.";
      const withReply = [...messagesRef.current, { role: "alien", text: reply }];
      messagesRef.current = withReply;
      apiRef.current.persist(withReply);

      streamDoneRef.current = true;
      if (speakQueueRef.current === 0 && !pausedRef.current && !disposedRef.current) {
        speakingRef.current = false;
        spokenTextRef.current = "";
        setPhaseSafe("listening");
      }
    } catch (e) {
      if (ctrl.signal.aborted) return; // superseded by barge-in / new send
      setErr("Transmission lost. Re-opening channel.");
      if (!disposedRef.current && !pausedRef.current) setPhaseSafe("listening");
    }
  };

  const startRecognizer = () => {
    const SR =
      typeof window !== "undefined" &&
      (window.SpeechRecognition || window.webkitSpeechRecognition);
    if (!SR) {
      setErr("This browser can't auto-listen — type to the alien below.");
      return;
    }
    try {
      recogRef.current && recogRef.current.stop();
    } catch (e) {}

    const rec = new SR();
    rec.lang = "en-US";
    rec.interimResults = true;
    rec.continuous = true;
    rec.maxAlternatives = 1;

    rec.onresult = (ev) => {
      if (pausedRef.current || disposedRef.current) return;
      let txt = "";
      let isFinal = false;
      for (let i = ev.resultIndex; i < ev.results.length; i++) {
        txt += ev.results[i][0].transcript;
        if (ev.results[i].isFinal) isFinal = true;
      }
      const heard = txt.trim();
      if (!heard) return;
      const ph = phaseRef.current;

      if (ph === "speaking" || ph === "thinking") {
        if (isEcho(heard, spokenTextRef.current)) return; // alien hearing itself
        const words = heard.split(/\s+/).filter(Boolean);
        if (words.length < 2 && !isFinal) return; // ignore tiny noise
        apiRef.current.bargeIn();
        setCaptionWho("YOU");
        setCaption(heard);
        if (isFinal) apiRef.current.send(heard);
        return;
      }
      if (ph === "listening") {
        setCaptionWho("YOU");
        setCaption(heard);
        if (isFinal) apiRef.current.send(heard);
      }
    };

    rec.onerror = (e) => {
      if (e.error === "not-allowed" || e.error === "service-not-allowed") {
        setErr("Microphone blocked. Allow mic access, or type below.");
        pausedRef.current = true;
        setPausedView(true);
        setPhaseSafe("paused");
      }
    };

    rec.onend = () => {
      // continuous recognizers stop periodically; keep it alive
      if (!disposedRef.current && !pausedRef.current) {
        setTimeout(() => {
          try {
            apiRef.current.startRecognizer();
          } catch (e) {}
        }, 250);
      }
    };

    recogRef.current = rec;
    try {
      rec.start();
    } catch (e) {}
  };

  const persist = (msgs) => {
    try {
      const capped = msgs.slice(-24);
      localStorage.setItem(memKey, JSON.stringify(capped));
      const summary = capped
        .slice(-8)
        .map((m) => `${m.role === "alien" ? alien.name : "Human"}: ${m.text}`)
        .join("\n");
      localStorage.setItem(`${memKey}_summary`, summary);
    } catch (e) {}
  };

  const openChannel = () => {
    if (phaseRef.current !== "armed" || !ready) return;
    pausedRef.current = false;
    streamDoneRef.current = true;
    startRecognizer();
    enqueueSpeak(greetRef.current);
  };

  const togglePause = () => {
    if (pausedRef.current) {
      pausedRef.current = false;
      setPausedView(false);
      try {
        startRecognizer();
      } catch (e) {}
      setPhaseSafe("listening");
    } else {
      pausedRef.current = true;
      setPausedView(true);
      try {
        recogRef.current && recogRef.current.stop();
      } catch (e) {}
      try {
        window.speechSynthesis && window.speechSynthesis.cancel();
      } catch (e) {}
      speakingRef.current = false;
      setPhaseSafe("paused");
    }
  };

  // keep apiRef pointing at the latest closures
  apiRef.current = {
    send,
    bargeIn,
    enqueueSpeak,
    startRecognizer,
    persist,
  };

  /* ---- boot: camera + three + memory ---- */
  useEffect(() => {
    disposedRef.current = false;
    let stream = null;
    let raf = 0;
    let renderer, scene, camera, group, core, innerWire, aura, particles, eyeL, eyeR, beam;
    const orient = { x: 0, y: 0 };

    async function boot() {
      try {
        if (
          typeof DeviceOrientationEvent !== "undefined" &&
          typeof DeviceOrientationEvent.requestPermission === "function"
        ) {
          await DeviceOrientationEvent.requestPermission();
        }
      } catch (e) {}
      try {
        window.speechSynthesis && window.speechSynthesis.getVoices();
      } catch (e) {}
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" } },
          audio: false,
        });
        if (camRef.current) {
          camRef.current.srcObject = stream;
          await camRef.current.play().catch(() => {});
        }
      } catch (e) {
        setErr("Camera unavailable — the entity will appear over a void.");
      }
      if (disposedRef.current) return;
      buildThree();
      restoreMemory();
      setReady(true);
    }

    function floorTexture(hex) {
      const c = document.createElement("canvas");
      c.width = c.height = 256;
      const g = c.getContext("2d");
      const grd = g.createRadialGradient(128, 128, 10, 128, 128, 128);
      grd.addColorStop(0, hex);
      grd.addColorStop(0.4, "rgba(255,255,255,0.05)");
      grd.addColorStop(1, "rgba(0,0,0,0)");
      g.fillStyle = grd;
      g.fillRect(0, 0, 256, 256);
      g.strokeStyle = hex;
      g.globalAlpha = 0.5;
      for (let r = 30; r < 128; r += 26) {
        g.beginPath();
        g.arc(128, 128, r, 0, Math.PI * 2);
        g.stroke();
      }
      const tex = new THREE.CanvasTexture(c);
      return tex;
    }

    function buildThree() {
      const el = threeRef.current;
      if (!el) return;
      const w = el.clientWidth;
      const h = el.clientHeight;
      renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      renderer.setSize(w, h);
      el.appendChild(renderer.domElement);

      scene = new THREE.Scene();
      camera = new THREE.PerspectiveCamera(55, w / h, 0.1, 100);
      camera.position.set(0, 0.3, 6);

      const col = new THREE.Color(alien.color);
      group = new THREE.Group();

      // core
      core = new THREE.Mesh(
        new THREE.IcosahedronGeometry(1.05, 1),
        new THREE.MeshStandardMaterial({
          color: col,
          emissive: col,
          emissiveIntensity: 0.65,
          flatShading: true,
          roughness: 0.35,
          metalness: 0.25,
          transparent: true,
          opacity: 0.95,
        })
      );
      group.add(core);

      // inner counter-rotating wireframe
      innerWire = new THREE.Mesh(
        new THREE.IcosahedronGeometry(0.7, 1),
        new THREE.MeshBasicMaterial({
          color: 0xffffff,
          wireframe: true,
          transparent: true,
          opacity: 0.25,
          blending: THREE.AdditiveBlending,
        })
      );
      group.add(innerWire);

      // aura halo (fake bloom)
      aura = new THREE.Mesh(
        new THREE.SphereGeometry(1.7, 32, 32),
        new THREE.MeshBasicMaterial({
          color: col,
          transparent: true,
          opacity: 0.16,
          side: THREE.BackSide,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        })
      );
      group.add(aura);

      // eyes
      const eyeGeo = new THREE.SphereGeometry(0.14, 16, 16);
      const eyeMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
      eyeL = new THREE.Mesh(eyeGeo, eyeMat.clone());
      eyeR = new THREE.Mesh(eyeGeo, eyeMat.clone());
      eyeL.position.set(-0.32, 0.18, 0.92);
      eyeR.position.set(0.32, 0.18, 0.92);
      group.add(eyeL, eyeR);

      // orbiting particles
      const N = 260;
      const pos = new Float32Array(N * 3);
      for (let i = 0; i < N; i++) {
        const r = 1.6 + Math.random() * 1.4;
        const th = Math.random() * Math.PI * 2;
        const ph = Math.acos(2 * Math.random() - 1);
        pos[i * 3] = r * Math.sin(ph) * Math.cos(th);
        pos[i * 3 + 1] = r * Math.cos(ph);
        pos[i * 3 + 2] = r * Math.sin(ph) * Math.sin(th);
      }
      const pg = new THREE.BufferGeometry();
      pg.setAttribute("position", new THREE.BufferAttribute(pos, 3));
      particles = new THREE.Points(
        pg,
        new THREE.PointsMaterial({
          color: col,
          size: 0.05,
          transparent: true,
          opacity: 0.85,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        })
      );
      group.add(particles);

      // floor containment projection
      const floor = new THREE.Mesh(
        new THREE.CircleGeometry(2.4, 48),
        new THREE.MeshBasicMaterial({
          map: floorTexture(alien.color),
          transparent: true,
          opacity: 0.7,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        })
      );
      floor.rotation.x = -Math.PI / 2;
      floor.position.y = -1.9;
      group.add(floor);

      // light beam
      beam = new THREE.Mesh(
        new THREE.CylinderGeometry(0.1, 0.9, 1.9, 24, 1, true),
        new THREE.MeshBasicMaterial({
          color: col,
          transparent: true,
          opacity: 0.1,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
          side: THREE.DoubleSide,
        })
      );
      beam.position.y = -0.95;
      group.add(beam);

      scene.add(group);
      scene.add(new THREE.AmbientLight(0xffffff, 0.55));
      const pt = new THREE.PointLight(col, 2.4, 24);
      pt.position.set(2, 3, 4);
      scene.add(pt);

      let t = 0;
      const animate = () => {
        raf = requestAnimationFrame(animate);
        t += 0.016;
        const sp = speakingRef.current;

        group.position.y = Math.sin(t * 1.1) * 0.12;
        group.rotation.y = Math.sin(t * 0.25) * 0.32 + orient.x * 0.0008;
        group.rotation.x = orient.y * 0.0006;

        core.rotation.y += 0.004;
        innerWire.rotation.y -= 0.012;
        innerWire.rotation.x += 0.006;
        particles.rotation.y += sp ? 0.012 : 0.0035;

        const pulse = sp ? 1 + Math.abs(Math.sin(t * 13)) * 0.18 : 1;
        core.scale.setScalar(pulse);
        aura.material.opacity += ((sp ? 0.34 : 0.16) - aura.material.opacity) * 0.15;
        core.material.emissiveIntensity = sp ? 0.95 : 0.6 + Math.sin(t * 2) * 0.1;
        const glow = sp ? 1.25 : 0.85 + Math.sin(t * 2.2) * 0.15;
        eyeL.scale.setScalar(glow);
        eyeR.scale.setScalar(glow);

        renderer.render(scene, camera);
      };
      animate();
    }

    function onOrient(e) {
      orient.x = e.gamma || 0;
      orient.y = e.beta || 0;
    }
    window.addEventListener("deviceorientation", onOrient, true);

    function onResize() {
      if (!renderer || !camera || !threeRef.current) return;
      const w = threeRef.current.clientWidth;
      const h = threeRef.current.clientHeight;
      renderer.setSize(w, h);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    }
    window.addEventListener("resize", onResize);

    function restoreMemory() {
      let prior = [];
      try {
        prior = JSON.parse(localStorage.getItem(memKey) || "[]");
      } catch (e) {}
      if (prior.length) {
        messagesRef.current = prior;
        greetRef.current =
          "Reconnection confirmed. We have spoken before — I remember. Go on.";
      } else {
        greetRef.current = alien.greeting;
        messagesRef.current = [{ role: "alien", text: alien.greeting }];
      }
      setCaption("Channel armed");
      setCaptionWho(alien.name.toUpperCase());
    }

    boot();

    return () => {
      disposedRef.current = true;
      pausedRef.current = true;
      cancelAnimationFrame(raf);
      window.removeEventListener("deviceorientation", onOrient, true);
      window.removeEventListener("resize", onResize);
      try {
        controllerRef.current && controllerRef.current.abort();
      } catch (e) {}
      try {
        recogRef.current && recogRef.current.stop();
      } catch (e) {}
      try {
        window.speechSynthesis && window.speechSynthesis.cancel();
      } catch (e) {}
      if (stream) stream.getTracks().forEach((tr) => tr.stop());
      if (renderer) {
        renderer.dispose();
        if (renderer.domElement && renderer.domElement.parentNode)
          renderer.domElement.parentNode.removeChild(renderer.domElement);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [alien.id]);

  const statusLabel =
    phase === "armed"
      ? "CHANNEL ARMED"
      : phase === "listening"
      ? "LISTENING"
      : phase === "thinking"
      ? "RECEIVING"
      : phase === "speaking"
      ? "TRANSMITTING"
      : "PAUSED";

  return (
    <div id="app" className="fade">
      <video id="cam" ref={camRef} playsInline muted autoPlay />
      <div id="three" ref={threeRef} />
      <div className="ar-veil" />
      <div className="grain" />

      <div className="hud-top">
        <div>
          <div className="hud-name" style={{ color: alien.color }}>
            {alien.name}
          </div>
          <div className="hud-status">{statusLabel} · {alien.origin.toUpperCase()}</div>
        </div>
        <div
          className="hud-x"
          onClick={() => {
            disposedRef.current = true;
            pausedRef.current = true;
            try {
              controllerRef.current && controllerRef.current.abort();
            } catch (e) {}
            try {
              window.speechSynthesis && window.speechSynthesis.cancel();
            } catch (e) {}
            onExit();
          }}
        >
          END LINK
        </div>
      </div>

      <div className="caption">
        <span className="who">{captionWho}</span>
        {caption}
      </div>

      {err && <div className="err">{err}</div>}

      {phase === "armed" && (
        <div className="open-overlay" onClick={openChannel}>
          <div className="open-ring" style={{ color: alien.color, borderColor: alien.color }} />
          <div className="open-label">{ready ? "TAP TO OPEN CHANNEL" : "MATERIALIZING"}</div>
          <div className="open-hint">Best with earbuds · then just talk</div>
        </div>
      )}

      {phase !== "armed" && (
        <div className="dock">
          <div className="live-row">
            <span
              className={`live-dot ${phase === "listening" ? "on" : ""}`}
              style={{ background: alien.color }}
            />
            <span className="live-text">{statusLabel}</span>
            <button className="pause-btn" onClick={togglePause}>
              {pausedView ? "RESUME" : "PAUSE"}
            </button>
          </div>
          <div className="type-row">
            <input
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  apiRef.current.send(typed);
                  setTyped("");
                }
              }}
              placeholder="...or type instead"
            />
            <button
              onClick={() => {
                apiRef.current.send(typed);
                setTyped("");
              }}
            >
              SEND
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
