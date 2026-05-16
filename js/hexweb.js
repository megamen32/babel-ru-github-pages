(() => {
  'use strict';
  const app = window.BabelApp;
  const THREE = window.THREE;

  if (!THREE) { app.hexweb = null; return; }

  /* ═══════════════════════════════════════════════════════════
     HexWeb — 3D Hexagonal Spider-Web Visualization
     ═══════════════════════════════════════════════════════════
     A cosmic honeycomb web of glowing hexagonal rooms.
     Each room = one hex node. Lines = web threads.
     Orbit camera. Click adjacent hex to navigate. */

  const HEX_R = 1.5;
  const HEX_GAP = 0.12;
  const VIEW_RADIUS = 12;
  const SQRT3 = Math.sqrt(3);

  // --- State ---
  let renderer, scene, camera;
  let hexLines, connLines, beaconParts = [];
  let starField, glowPlane;
  let container = null;
  let animFrame = null;
  let clock = new THREE.Clock();

  // Camera orbit
  let azimuth = Math.PI * 0.25;
  let elevation = Math.PI * 0.28;
  let dist = 28;
  let tAzimuth = azimuth, tElevation = elevation, tDist = dist;
  let isDragging = false, didDrag = false;
  let lastMouse = { x: 0, y: 0 };

  let onHexClick = null;
  let currentQ = 0, currentR = 0;

  // --- Hex Math (flat-top, axial coords) ---
  function hexToPixel(q, r) {
    return {
      x: HEX_R * 1.5 * q,
      z: HEX_R * SQRT3 * (r + q * 0.5)
    };
  }

  function pixelToHex(px, pz) {
    const q = (2 / 3 * px) / HEX_R;
    const r = (-1 / 3 * px + SQRT3 / 3 * pz) / HEX_R;
    const s = -q - r;
    let rq = Math.round(q), rr = Math.round(r), rs = Math.round(s);
    const dq = Math.abs(rq - q), dr = Math.abs(rr - r), ds = Math.abs(rs - s);
    if (dq > dr && dq > ds) rq = -rr - rs;
    else if (dr > ds) rr = -rq - rs;
    return { q: rq, r: rr };
  }

  function hexDist(q1, r1, q2, r2) {
    return (Math.abs(q1 - q2) + Math.abs(q1 + r1 - q2 - r2) + Math.abs(r1 - r2)) / 2;
  }

  function hexHue(q, r) {
    return ((q * 73 + r * 137) % 360 + 360) % 360;
  }

  function hexCorner(i, radius) {
    const a = Math.PI / 3 * i;
    return { x: radius * Math.cos(a), z: radius * Math.sin(a) };
  }

  // --- Scene ---
  function buildScene() {
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x03000a);
    scene.fog = new THREE.FogExp2(0x03000a, 0.011);

    scene.add(new THREE.AmbientLight(0x5a189a, 0.35));
    const d = new THREE.DirectionalLight(0xb026ff, 0.2);
    d.position.set(20, 30, 10);
    scene.add(d);
  }

  function buildStars() {
    const n = 3000;
    const pos = new Float32Array(n * 3);
    const col = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 400;
      pos[i * 3 + 1] = Math.random() * 100 + 5;
      pos[i * 3 + 2] = (Math.random() - 0.5) * 400;
      const c = new THREE.Color().setHSL(Math.random(), 0.3 + Math.random() * 0.5, 0.4 + Math.random() * 0.4);
      col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    starField = new THREE.Points(geo, new THREE.PointsMaterial({
      size: 0.12, vertexColors: true, transparent: true, opacity: 0.55, sizeAttenuation: true,
    }));
    scene.add(starField);
  }

  // --- Glow plane under the web ---
  function buildGlowPlane() {
    const geo = new THREE.PlaneGeometry(80, 80);
    const mat = new THREE.MeshBasicMaterial({
      color: 0x1a0033, transparent: true, opacity: 0.25, side: THREE.DoubleSide,
    });
    glowPlane = new THREE.Mesh(geo, mat);
    glowPlane.rotation.x = -Math.PI / 2;
    glowPlane.position.y = -0.05;
    scene.add(glowPlane);
  }

  // --- Web Builder ---
  function disposeObj(obj) {
    if (!obj) return;
    scene.remove(obj);
    if (obj.geometry) obj.geometry.dispose();
    if (obj.material) {
      if (Array.isArray(obj.material)) obj.material.forEach(m => m.dispose());
      else obj.material.dispose();
    }
  }

  function buildWeb(cq, cr) {
    currentQ = cq; currentR = cr;

    disposeObj(hexLines); hexLines = null;
    disposeObj(connLines); connLines = null;
    beaconParts.forEach(disposeObj); beaconParts = [];

    // Collect visible hexes
    const hexes = [];
    for (let dq = -VIEW_RADIUS; dq <= VIEW_RADIUS; dq++) {
      for (let dr = -VIEW_RADIUS; dr <= VIEW_RADIUS; dr++) {
        if (hexDist(0, 0, dq, dr) > VIEW_RADIUS) continue;
        hexes.push({ q: cq + dq, r: cr + dr });
      }
    }

    // --- Hex outlines ---
    const hp = [], hc = [];
    const innerR = HEX_R - HEX_GAP;
    for (const hex of hexes) {
      const c = hexToPixel(hex.q, hex.r);
      const h = hexHue(hex.q, hex.r);
      const isCur = hex.q === cq && hex.r === cr;
      const d = hexDist(hex.q, hex.r, cq, cr);
      const l = isCur ? 0.65 : Math.max(0.12, 0.45 - d * 0.025);
      const s = isCur ? 1.0 : 0.55;
      const col = new THREE.Color().setHSL(h / 360, s, l);

      for (let i = 0; i < 6; i++) {
        const a = hexCorner(i, innerR), b = hexCorner((i + 1) % 6, innerR);
        hp.push(c.x + a.x, 0.01, c.z + a.z, c.x + b.x, 0.01, c.z + b.z);
        hc.push(col.r, col.g, col.b, col.r, col.g, col.b);
      }

      // Add second ring (outer glow) for current + immediate neighbors
      if (d <= 2) {
        const outerR = HEX_R + 0.05;
        const glowL = isCur ? 0.35 : Math.max(0.05, 0.18 - d * 0.05);
        const glowCol = new THREE.Color().setHSL(h / 360, s * 0.8, glowL);
        for (let i = 0; i < 6; i++) {
          const a = hexCorner(i, outerR), b = hexCorner((i + 1) % 6, outerR);
          hp.push(c.x + a.x, 0.005, c.z + a.z, c.x + b.x, 0.005, c.z + b.z);
          hc.push(glowCol.r, glowCol.g, glowCol.b, glowCol.r, glowCol.g, glowCol.b);
        }
      }
    }
    const hGeo = new THREE.BufferGeometry();
    hGeo.setAttribute('position', new THREE.Float32BufferAttribute(hp, 3));
    hGeo.setAttribute('color', new THREE.Float32BufferAttribute(hc, 3));
    hexLines = new THREE.LineSegments(hGeo, new THREE.LineBasicMaterial({
      vertexColors: true, transparent: true, opacity: 0.9,
    }));
    scene.add(hexLines);

    // --- Connections (web threads) ---
    const cp = [], cc = [];
    const hexSet = new Set(hexes.map(h => `${h.q},${h.r}`));
    const nbrs = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, -1], [-1, 1]];

    for (const hex of hexes) {
      const c = hexToPixel(hex.q, hex.r);
      const d = hexDist(hex.q, hex.r, cq, cr);
      const h = hexHue(hex.q, hex.r);
      const l = Math.max(0.04, 0.18 - d * 0.01);
      const col = new THREE.Color().setHSL(h / 360, 0.35, l);

      for (const [dq, dr] of nbrs) {
        const nq = hex.q + dq, nr = hex.r + dr;
        if (nq > hex.q || (nq === hex.q && nr > hex.r)) {
          if (!hexSet.has(`${nq},${nr}`)) continue;
          const nc = hexToPixel(nq, nr);
          cp.push(c.x, 0.003, c.z, nc.x, 0.003, nc.z);
          cc.push(col.r, col.g, col.b, col.r, col.g, col.b);
        }
      }
    }
    const cGeo = new THREE.BufferGeometry();
    cGeo.setAttribute('position', new THREE.Float32BufferAttribute(cp, 3));
    cGeo.setAttribute('color', new THREE.Float32BufferAttribute(cc, 3));
    connLines = new THREE.LineSegments(cGeo, new THREE.LineBasicMaterial({
      vertexColors: true, transparent: true, opacity: 0.45,
    }));
    scene.add(connLines);

    // --- Beacon (current room) ---
    const bc = hexToPixel(cq, cr);
    const bHue = hexHue(cq, cr);

    // Filled hex disc
    const dv = [0, 0.015, 0];
    for (let i = 0; i < 6; i++) { const c = hexCorner(i, innerR); dv.push(c.x, 0.015, c.z); }
    const di = [];
    for (let i = 1; i <= 6; i++) di.push(0, i, i % 6 + 1);
    const dGeo = new THREE.BufferGeometry();
    dGeo.setAttribute('position', new THREE.Float32BufferAttribute(dv, 3));
    dGeo.setIndex(di);
    dGeo.computeVertexNormals();
    const disc = new THREE.Mesh(dGeo, new THREE.MeshBasicMaterial({
      color: new THREE.Color().setHSL(bHue / 360, 0.9, 0.5), transparent: true, opacity: 0.35, side: THREE.DoubleSide,
    }));
    disc.position.set(bc.x, 0, bc.z);
    scene.add(disc);
    beaconParts.push(disc);

    // Light beam
    const beam = new THREE.Mesh(
      new THREE.CylinderGeometry(0.06, 0.28, 12, 6),
      new THREE.MeshBasicMaterial({
        color: new THREE.Color().setHSL(bHue / 360, 1, 0.65), transparent: true, opacity: 0.12,
      })
    );
    beam.position.set(bc.x, 6, bc.z);
    scene.add(beam);
    beaconParts.push(beam);

    // Point light
    const pl = new THREE.PointLight(
      new THREE.Color().setHSL(bHue / 360, 1, 0.6).getHex(), 2.5, 25
    );
    pl.position.set(bc.x, 4, bc.z);
    scene.add(pl);
    beaconParts.push(pl);

    // Adjacent hex markers — small pulsing dots
    const adjHexes = nbrs.map(([dq, dr]) => ({ q: cq + dq, r: cr + dr }));
    for (const ah of adjHexes) {
      const ac = hexToPixel(ah.q, ah.r);
      const dot = new THREE.Mesh(
        new THREE.SphereGeometry(0.08, 8, 8),
        new THREE.MeshBasicMaterial({
          color: new THREE.Color().setHSL(hexHue(ah.q, ah.r) / 360, 0.8, 0.6),
          transparent: true, opacity: 0.7,
        })
      );
      dot.position.set(ac.x, 0.15, ac.z);
      scene.add(dot);
      beaconParts.push(dot);
    }
  }

  // --- Camera ---
  function setupCamera() {
    camera = new THREE.PerspectiveCamera(55, container.clientWidth / container.clientHeight, 0.1, 500);
    updateCamera();
  }

  function updateCamera() {
    const x = dist * Math.sin(elevation) * Math.cos(azimuth);
    const y = dist * Math.cos(elevation);
    const z = dist * Math.sin(elevation) * Math.sin(azimuth);
    camera.position.set(x, Math.max(2, y), z);
    camera.lookAt(0, 0, 0);
  }

  function setupControls() {
    const canvas = renderer.domElement;

    canvas.addEventListener('pointerdown', e => {
      isDragging = true; didDrag = false;
      lastMouse = { x: e.clientX, y: e.clientY };
    });

    const onMove = e => {
      if (!isDragging) return;
      const dx = e.clientX - lastMouse.x, dy = e.clientY - lastMouse.y;
      if (Math.abs(dx) > 2 || Math.abs(dy) > 2) didDrag = true;
      tAzimuth -= dx * 0.006;
      tElevation = Math.max(0.12, Math.min(1.4, tElevation + dy * 0.006));
      lastMouse = { x: e.clientX, y: e.clientY };
    };
    canvas.addEventListener('pointermove', onMove);
    window.addEventListener('pointermove', onMove);

    const onUp = () => { isDragging = false; };
    canvas.addEventListener('pointerup', onUp);
    window.addEventListener('pointerup', onUp);

    canvas.addEventListener('wheel', e => {
      e.preventDefault();
      tDist = Math.max(6, Math.min(70, tDist + e.deltaY * 0.025));
    }, { passive: false });

    // Touch zoom
    let touchDist0 = 0;
    canvas.addEventListener('touchstart', e => {
      if (e.touches.length === 2) {
        const dx = e.touches[0].clientX - e.touches[1].clientX;
        const dy = e.touches[0].clientY - e.touches[1].clientY;
        touchDist0 = Math.sqrt(dx * dx + dy * dy);
      }
    }, { passive: true });
    canvas.addEventListener('touchmove', e => {
      if (e.touches.length === 2) {
        e.preventDefault();
        const dx = e.touches[0].clientX - e.touches[1].clientX;
        const dy = e.touches[0].clientY - e.touches[1].clientY;
        const d = Math.sqrt(dx * dx + dy * dy);
        tDist = Math.max(6, Math.min(70, tDist + (touchDist0 - d) * 0.05));
        touchDist0 = d;
      }
    }, { passive: false });

    // Click to navigate
    canvas.addEventListener('click', e => {
      if (didDrag) return;
      const rect = canvas.getBoundingClientRect();
      const mouse = new THREE.Vector2(
        ((e.clientX - rect.left) / rect.width) * 2 - 1,
        -((e.clientY - rect.top) / rect.height) * 2 + 1
      );
      const rc = new THREE.Raycaster();
      rc.setFromCamera(mouse, camera);
      const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
      const hit = new THREE.Vector3();
      if (rc.ray.intersectPlane(plane, hit)) {
        const hex = pixelToHex(hit.x, hit.z);
        const d = hexDist(hex.q, hex.r, currentQ, currentR);
        if (d >= 1 && d <= 2 && onHexClick) {
          onHexClick(hex.q - currentQ, hex.r - currentR);
        }
      }
    });
  }

  // --- Animation ---
  function animate() {
    animFrame = requestAnimationFrame(animate);
    const t = clock.getElapsedTime();

    azimuth += (tAzimuth - azimuth) * 0.07;
    elevation += (tElevation - elevation) * 0.07;
    dist += (tDist - dist) * 0.07;
    updateCamera();

    // Pulse beacon
    if (beaconParts[0]) beaconParts[0].material.opacity = 0.3 + Math.sin(t * 3) * 0.08;
    if (beaconParts[1]) {
      beaconParts[1].material.opacity = 0.1 + Math.sin(t * 2) * 0.05;
      beaconParts[1].rotation.y = t * 0.3;
    }
    // Pulse adjacent dots
    for (let i = 3; i < beaconParts.length; i++) {
      beaconParts[i].material.opacity = 0.5 + Math.sin(t * 2.5 + i) * 0.3;
    }

    // Slow star rotation
    if (starField) starField.rotation.y = t * 0.003;

    renderer.render(scene, camera);
  }

  // --- Public API ---
  app.hexweb = {
    init(containerEl, options) {
      container = containerEl;
      onHexClick = options.onHexClick || null;

      renderer = new THREE.WebGLRenderer({ antialias: true });
      renderer.setSize(container.clientWidth, container.clientHeight);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      renderer.setClearColor(0x03000a);
      container.appendChild(renderer.domElement);

      buildScene();
      buildStars();
      buildGlowPlane();
      setupCamera();
      setupControls();

      window.addEventListener('resize', () => {
        if (!container || !renderer) return;
        camera.aspect = container.clientWidth / container.clientHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(container.clientWidth, container.clientHeight);
      });

      animate();
    },

    navigateTo(q, r) { buildWeb(q, r); },

    destroy() {
      if (animFrame) cancelAnimationFrame(animFrame);
      animFrame = null;
      if (renderer) {
        renderer.dispose();
        if (renderer.domElement.parentNode) renderer.domElement.parentNode.removeChild(renderer.domElement);
        renderer = null;
      }
      if (scene) {
        scene.traverse(obj => {
          if (obj.geometry) obj.geometry.dispose();
          if (obj.material) {
            if (Array.isArray(obj.material)) obj.material.forEach(m => m.dispose());
            else obj.material.dispose();
          }
        });
        scene = null;
      }
      container = null;
    },
  };
})();
