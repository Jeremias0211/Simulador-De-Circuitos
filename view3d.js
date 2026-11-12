// Vista 3D del circuito — usa Three.js (lib/three-bundle.min.js) y los datos de script.js (window.CircuitApp).
(function(){
  'use strict';
  if(!window.THREE){ console.warn('Three.js no está disponible: la vista 3D queda desactivada.'); return; }
  const T = window.THREE;
  const S = 1 / 50;                      // 50 px del editor = 1 unidad 3D
  const WIRE_Y = 0.06, WIRE_R = 0.035;

  let renderer = null, scene = null, camera = null, controls = null;
  let circuitGroup = null, frameId = null, isOpen = false;
  let particles = [], glowLights = [], clock = null;
  let pointerStart = null, selectedId = null;
  const stage = document.getElementById('view3d-stage');
  const overlay = document.getElementById('view3d');
  const info = document.getElementById('view3d-info');

  function to3D(x, y){ return new T.Vector3((x - 500) * S, 0, (y - 350) * S); }
  function mat(color, opts){ return new T.MeshStandardMaterial(Object.assign({color:color, roughness:0.55, metalness:0.1}, opts || {})); }
  const METAL = function(){ return mat('#c9c9cf', {metalness:0.85, roughness:0.3}); };

  function cylinderX(radius, length, material){
    const mesh = new T.Mesh(new T.CylinderGeometry(radius, radius, length, 24), material);
    mesh.rotation.z = Math.PI / 2;
    return mesh;
  }

  // Patita metálica: tramo horizontal a la altura h y bajada hasta la placa en el terminal.
  function leads(group, inner, height, material){
    [-1, 1].forEach(function(side){
      const m = material || METAL();
      const horizontal = cylinderX(0.022, 0.9 - inner, m);
      horizontal.position.set(side * (inner + (0.9 - inner) / 2), height, 0);
      group.add(horizontal);
      if(height > 0.03){
        const vertical = new T.Mesh(new T.CylinderGeometry(0.022, 0.022, height, 10), m);
        vertical.position.set(side * 0.9, height / 2, 0);
        group.add(vertical);
      }
    });
  }

  function haloTexture(){
    if(haloTexture.cache) return haloTexture.cache;
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = 128;
    const ctx = canvas.getContext('2d');
    const gradient = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
    gradient.addColorStop(0, 'rgba(255,255,255,1)'); gradient.addColorStop(0.25, 'rgba(255,255,255,.55)'); gradient.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = gradient; ctx.fillRect(0, 0, 128, 128);
    haloTexture.cache = new T.CanvasTexture(canvas);
    return haloTexture.cache;
  }
  function addGlow(group, color, brightness, y, size){
    if(brightness <= 0.02) return;
    const sprite = new T.Sprite(new T.SpriteMaterial({map:haloTexture(), color:color, transparent:true, opacity:Math.min(1, 0.25 + brightness * 0.6), blending:T.AdditiveBlending, depthWrite:false}));
    sprite.position.y = y; sprite.scale.setScalar(size * (0.6 + brightness * 0.8));
    sprite.userData.noShadow = true;
    group.add(sprite);
    const light = new T.PointLight(color, brightness * 2.2, 4.5, 1.6);
    light.position.y = y;
    group.add(light);
    glowLights.push(light);
  }

  function textCanvas(lines, options){
    const opts = Object.assign({width:512, height:128, background:null, color:'#f5f2f3'}, options || {});
    const canvas = document.createElement('canvas'); canvas.width = opts.width; canvas.height = opts.height;
    const ctx = canvas.getContext('2d');
    if(opts.background){ ctx.fillStyle = opts.background; roundRect(ctx, 0, 0, opts.width, opts.height, 22); ctx.fill(); }
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const step = opts.height / (lines.length + 0.2);
    lines.forEach(function(line, index){
      ctx.font = (line.weight || '600') + ' ' + (line.size || 40) + 'px "JetBrains Mono", monospace';
      ctx.fillStyle = line.color || opts.color;
      ctx.fillText(line.text, opts.width / 2, step * (index + 0.6));
    });
    const texture = new T.CanvasTexture(canvas);
    texture.colorSpace = T.SRGBColorSpace;
    texture.anisotropy = 4;
    return texture;
  }
  function roundRect(ctx, x, y, w, h, r){ ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }

  function labelSprite(comp, sim){
    const app = window.CircuitApp;
    const lines = [{text:comp.label || '', size:42, weight:'700'}];
    const value = app.valueText(comp);
    if(value) lines.push({text:value, size:32, color:'#e8a0aa'});
    if(sim && sim.burned) lines.push({text:'¡QUEMADO!', size:32, color:'#ff6070'});
    else if(sim && Number.isFinite(sim.current) && comp.type !== 'ammeter' && comp.type !== 'voltmeter' && comp.type !== 'ground')
      lines.push({text:app.formatElectrical(Math.abs(sim.voltage), 'V') + ' · ' + app.formatElectrical(Math.abs(sim.current), 'A'), size:30, color:'#6fe0b4'});
    const sprite = new T.Sprite(new T.SpriteMaterial({map:textCanvas(lines, {height:44 * lines.length + 20, background:'rgba(16,14,16,.82)'}), transparent:true, depthWrite:false}));
    sprite.scale.set(2.3, 2.3 * (44 * lines.length + 20) / 512, 1);
    sprite.position.y = 1.15;
    sprite.userData.isLabel = true;
    sprite.renderOrder = 10;
    return sprite;
  }

  // ---------- modelos de cada componente ----------
  function buildResistor(group, comp){
    const body = cylinderX(0.16, 0.74, mat('#d9c49a', {roughness:0.7}));
    body.position.y = 0.32; group.add(body);
    [-0.37, 0.37].forEach(function(x){ const cap = new T.Mesh(new T.SphereGeometry(0.175, 20, 12), mat('#d9c49a', {roughness:0.7})); cap.scale.set(0.45, 1, 1); cap.position.set(x, 0.32, 0); group.add(cap); });
    const code = window.CircuitApp.colorBands(Number(comp.value));
    if(code){
      [-0.24, -0.12, 0, 0.22].forEach(function(x, index){
        const band = cylinderX(0.168, 0.055, mat(code.bands[index][1], {roughness:0.4, metalness:index === 3 ? 0.7 : 0.1}));
        band.position.set(x, 0.32, 0); group.add(band);
      });
    }
    leads(group, 0.42, 0.32);
  }

  function buildPotentiometer(group, comp){
    const base = new T.Mesh(new T.BoxGeometry(0.9, 0.26, 0.72), mat('#2c5fae', {roughness:0.5}));
    base.position.y = 0.13; group.add(base);
    const ring = new T.Mesh(new T.CylinderGeometry(0.26, 0.26, 0.06, 32), METAL());
    ring.position.y = 0.29; group.add(ring);
    const knob = new T.Group();
    const knobBody = new T.Mesh(new T.CylinderGeometry(0.2, 0.22, 0.28, 32), mat('#1d1b1d', {roughness:0.35}));
    knobBody.position.y = 0.14; knob.add(knobBody);
    const marker = new T.Mesh(new T.BoxGeometry(0.04, 0.02, 0.16), mat('#ffffff', {emissive:'#ffffff', emissiveIntensity:0.4}));
    marker.position.set(0, 0.285, -0.1); knob.add(marker);
    knob.position.y = 0.32;
    const angle = (-135 + 270 * (Number(comp.position) || 0) / 100) * Math.PI / 180;
    knob.rotation.y = -angle;
    group.add(knob);
    leads(group, 0.45, 0.1);
  }

  function buildBattery(group, comp){
    const body = cylinderX(0.33, 1.12, mat('#1d1d20', {roughness:0.4, metalness:0.3}));
    body.position.y = 0.36; group.add(body);
    const band = cylinderX(0.335, 0.42, mat('#b87333', {metalness:0.8, roughness:0.3}));
    band.position.set(-0.32, 0.36, 0); group.add(band);           // terminal izquierdo = +
    const plus = cylinderX(0.11, 0.08, METAL());
    plus.position.set(-0.6, 0.36, 0); group.add(plus);
    const minus = cylinderX(0.25, 0.03, METAL());
    minus.position.set(0.57, 0.36, 0); group.add(minus);
    const tag = new T.Mesh(new T.PlaneGeometry(0.62, 0.3), new T.MeshBasicMaterial({map:textCanvas([{text:'+  ' + comp.value + ' V  −', size:56, weight:'700', color:'#ffffff'}], {width:512, height:160}), transparent:true}));
    tag.rotation.x = -Math.PI / 2; tag.position.set(0.12, 0.695, 0); group.add(tag);
    const cradle = new T.Mesh(new T.BoxGeometry(1.3, 0.1, 0.5), mat('#2a2a2e'));
    cradle.position.y = 0.05; group.add(cradle);
    leads(group, 0.65, 0.36, mat('#c9c9cf', {metalness:0.85, roughness:0.3}));
  }

  function buildBulb(group, comp, sim){
    const brightness = sim && !sim.burned ? Math.min(1.3, sim.brightness || 0) : 0;
    const socket = new T.Mesh(new T.CylinderGeometry(0.2, 0.22, 0.16, 24), mat('#3a3a3e'));
    socket.position.y = 0.08; group.add(socket);
    const screw = new T.Mesh(new T.CylinderGeometry(0.15, 0.15, 0.2, 24), METAL());
    screw.position.y = 0.26; group.add(screw);
    for(let i = 0; i < 3; i++){ const thread = new T.Mesh(new T.TorusGeometry(0.15, 0.015, 8, 24), METAL()); thread.rotation.x = Math.PI / 2; thread.position.y = 0.19 + i * 0.06; group.add(thread); }
    const burned = sim && sim.burned;
    const glass = new T.Mesh(new T.SphereGeometry(0.34, 32, 24), new T.MeshPhysicalMaterial({
      color: burned ? '#5a5458' : '#fff8e8', transparent:true, opacity: burned ? 0.75 : 0.32 + brightness * 0.35,
      roughness:0.08, metalness:0, emissive:'#ffc35a', emissiveIntensity: brightness * 1.4, depthWrite:false
    }));
    glass.position.y = 0.62; glass.userData.noShadow = true; group.add(glass);
    const filament = new T.Mesh(new T.TorusGeometry(0.08, 0.012, 8, 20, Math.PI * 1.5), mat(burned ? '#222' : '#ffb347', {emissive:'#ffb347', emissiveIntensity: brightness * 3}));
    filament.position.y = 0.6; group.add(filament);
    addGlow(group, '#ffc35a', brightness, 0.62, 2.4);
    leads(group, 0.2, 0.05);
  }

  function buildLed(group, comp, sim){
    const color = window.CircuitApp.LED_COLORS[comp.color] || '#ff3b3b';
    const burned = sim && sim.burned;
    const brightness = sim && !burned && sim.on ? Math.min(1.3, sim.brightness || 0) : 0;
    const material = new T.MeshPhysicalMaterial({color: burned ? '#3a3236' : color, transparent:true, opacity:0.88, roughness:0.2, emissive:color, emissiveIntensity: 0.15 + brightness * 0.9});
    const rim = new T.Mesh(new T.CylinderGeometry(0.19, 0.19, 0.05, 28), material); rim.position.y = 0.3; group.add(rim);
    const body = new T.Mesh(new T.CylinderGeometry(0.16, 0.16, 0.26, 28), material); body.position.y = 0.45; group.add(body);
    const dome = new T.Mesh(new T.SphereGeometry(0.16, 28, 14, 0, Math.PI * 2, 0, Math.PI / 2), material); dome.position.y = 0.58; group.add(dome);
    [-0.08, 0.08].forEach(function(x, index){
      const leg = new T.Mesh(new T.CylinderGeometry(0.018, 0.018, index === 0 ? 0.3 : 0.26, 8), METAL());
      leg.position.set(x, index === 0 ? 0.15 : 0.17, 0); group.add(leg);
    });
    const anode = cylinderX(0.02, 0.82, METAL()); anode.position.set(-0.49, 0.02, 0); group.add(anode);
    const cathode = cylinderX(0.02, 0.82, METAL()); cathode.position.set(0.49, 0.02, 0); group.add(cathode);
    const plusTag = new T.Mesh(new T.PlaneGeometry(0.22, 0.22), new T.MeshBasicMaterial({map:textCanvas([{text:'+', size:110, weight:'700', color:'#ff7080'}], {width:128, height:128}), transparent:true}));
    plusTag.rotation.x = -Math.PI / 2; plusTag.position.set(-0.6, 0.012, 0.18); group.add(plusTag);
    addGlow(group, color, brightness * 0.8, 0.5, 2.0);
  }

  function buildSwitch(group, comp){
    const base = new T.Mesh(new T.BoxGeometry(1.15, 0.12, 0.42), mat('#2e2b2f'));
    base.position.y = 0.06; group.add(base);
    [-0.45, 0.45].forEach(function(x){
      const post = new T.Mesh(new T.CylinderGeometry(0.05, 0.06, 0.2, 14), METAL());
      post.position.set(x, 0.22, 0); group.add(post);
    });
    const pivot = new T.Group(); pivot.position.set(-0.45, 0.32, 0);
    const lever = new T.Mesh(new T.BoxGeometry(0.95, 0.05, 0.1), mat('#d4d4da', {metalness:0.8, roughness:0.25}));
    lever.position.x = 0.475; pivot.add(lever);
    const handle = new T.Mesh(new T.SphereGeometry(0.075, 16, 12), mat(comp.value ? '#40b78c' : '#d6505f'));
    handle.position.set(0.95, 0.03, 0); pivot.add(handle);
    pivot.rotation.z = comp.value ? -0.02 : 0.55;
    group.add(pivot);
    leads(group, 0.57, 0.06);
  }

  function buildMeter(group, comp, sim){
    const isAmmeter = comp.type === 'ammeter';
    const casing = new T.Mesh(new T.BoxGeometry(1.0, 0.3, 0.8), mat(isAmmeter ? '#e9b949' : '#e3743f', {roughness:0.6}));
    casing.position.y = 0.15; group.add(casing);
    const app = window.CircuitApp;
    const reading = sim ? (isAmmeter ? app.formatElectrical(Math.abs(sim.current), 'A') : app.formatElectrical(sim.voltage, 'V')) : '- - -';
    const screen = new T.Mesh(new T.PlaneGeometry(0.78, 0.36), new T.MeshBasicMaterial({map:textCanvas([{text:reading, size:68, weight:'700', color:'#1d2a1f'}], {width:512, height:236, background:'#b8d8a8'})}));
    screen.rotation.x = -Math.PI / 2; screen.position.set(0, 0.302, -0.13); group.add(screen);
    const letter = new T.Mesh(new T.PlaneGeometry(0.3, 0.2), new T.MeshBasicMaterial({map:textCanvas([{text:isAmmeter ? 'A' : 'V', size:120, weight:'700', color:'#1d1b1d'}], {width:256, height:170}), transparent:true}));
    letter.rotation.x = -Math.PI / 2; letter.position.set(0, 0.302, 0.22); group.add(letter);
    [-1, 1].forEach(function(side){
      const jack = new T.Mesh(new T.CylinderGeometry(0.06, 0.06, 0.04, 16), mat(side < 0 ? '#d63a3a' : '#222'));
      jack.position.set(side * 0.38, 0.31, 0.22); group.add(jack);
    });
    leads(group, 0.5, 0.08, mat('#d63a3a'));
    // Cable negro del lado −
    const black = cylinderX(0.024, 0.4, mat('#202020')); black.position.set(0.7, 0.081, 0); group.add(black);
  }

  function buildGround(group){
    const post = new T.Mesh(new T.CylinderGeometry(0.025, 0.025, 0.3, 10), METAL());
    post.position.set(0, 0.15, -0.2); group.add(post);
    [0.46, 0.32, 0.16].forEach(function(width, index){
      const bar = new T.Mesh(new T.BoxGeometry(width, 0.04, 0.05), mat('#40b78c', {metalness:0.4}));
      bar.position.set(0, 0.3 - index * 0.09, -0.2 + index * 0.0); group.add(bar);
    });
  }

  const BUILDERS = {resistor:buildResistor, potentiometer:buildPotentiometer, battery:buildBattery, bulb:buildBulb, led:buildLed, switch:buildSwitch, ammeter:buildMeter, voltmeter:buildMeter, ground:buildGround};

  // ---------- placa y cables ----------
  function boardTexture(width, depth){
    const canvas = document.createElement('canvas');
    const scale = 48;
    canvas.width = Math.min(2048, Math.round(width * scale)); canvas.height = Math.min(2048, Math.round(depth * scale));
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#16402c'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    const step = canvas.width / width * 0.48;
    ctx.fillStyle = 'rgba(0,0,0,.35)';
    for(let x = step / 2; x < canvas.width; x += step) for(let y = step / 2; y < canvas.height; y += step){ ctx.beginPath(); ctx.arc(x, y, 1.6, 0, Math.PI * 2); ctx.fill(); }
    ctx.strokeStyle = 'rgba(255,255,255,.08)'; ctx.lineWidth = 3; ctx.strokeRect(10, 10, canvas.width - 20, canvas.height - 20);
    const texture = new T.CanvasTexture(canvas); texture.colorSpace = T.SRGBColorSpace; texture.anisotropy = 4;
    return texture;
  }

  function polylineInfo(points){
    const cumulative = [0];
    for(let i = 1; i < points.length; i++) cumulative.push(cumulative[i - 1] + points[i].distanceTo(points[i - 1]));
    return {points:points, cumulative:cumulative, total:cumulative[cumulative.length - 1]};
  }
  function pointAt(line, distance, target){
    let d = ((distance % line.total) + line.total) % line.total;
    let i = 1;
    while(i < line.cumulative.length - 1 && line.cumulative[i] < d) i++;
    const segment = line.cumulative[i] - line.cumulative[i - 1] || 1;
    return target.copy(line.points[i - 1]).lerp(line.points[i], (d - line.cumulative[i - 1]) / segment);
  }

  function buildWire(wire, sharedParticle, flowEnabled){
    const app = window.CircuitApp;
    const route = app.wireRoute(wire);
    if(route.length < 2) return null;
    const points = route.map(function(p){ const v = to3D(p.x, p.y); v.y = WIRE_Y; return v; });
    const group = new T.Group();
    const material = mat(wire.color || '#b53a4b', {roughness:0.45});
    const path = new T.CurvePath();
    for(let i = 1; i < points.length; i++) path.add(new T.LineCurve3(points[i - 1], points[i]));
    const tube = new T.Mesh(new T.TubeGeometry(path, Math.max(8, points.length * (liteMode() ? 4 : 10)), WIRE_R * (wire.width || 2.5) / 2.5, liteMode() ? 6 : 10, false), material);
    group.add(tube);
    points.forEach(function(point){ const joint = new T.Mesh(new T.SphereGeometry(WIRE_R * (wire.width || 2.5) / 2.5 * 1.05, 12, 8), material); joint.position.copy(point); group.add(joint); });
    const current = app.wireCurrent(wire);
    if(flowEnabled && Math.abs(current) > 1e-6){
      const line = polylineInfo(points);
      const count = Math.max(2, Math.round(line.total / (liteMode() ? 0.8 : 0.42)));
      const milliamps = Math.abs(current) * 1000;
      const speed = Math.min(3.2, Math.max(0.25, 0.35 + 0.75 * Math.log10(1 + milliamps)));
      const meshes = [];
      for(let i = 0; i < count; i++){
        const dot = new T.Mesh(sharedParticle.geometry, sharedParticle.material);
        dot.userData.noShadow = true;
        group.add(dot); meshes.push(dot);
      }
      particles.push({line:line, meshes:meshes, speed:speed * Math.sign(current), offset:0, spacing:line.total / count});
    }
    return group;
  }

  function disposeTree(object){
    object.traverse(function(node){
      if(node.geometry && !node.geometry.userData.shared) node.geometry.dispose();
      if(node.material){
        (Array.isArray(node.material) ? node.material : [node.material]).forEach(function(m){ if(m.map && m.map !== haloTexture.cache && !m.userData.shared) m.map.dispose(); if(!m.userData.shared) m.dispose(); });
      }
    });
  }

  function buildCircuit(){
    const app = window.CircuitApp;
    if(circuitGroup){ scene.remove(circuitGroup); disposeTree(circuitGroup); }
    particles = []; glowLights = [];
    circuitGroup = new T.Group();
    const simulation = app.simulation;
    const showLabels = document.getElementById('v3d-labels').checked;
    const showFlow = document.getElementById('v3d-flow').checked;

    // Límites del circuito para dimensionar la placa
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    app.components.forEach(function(comp){ const type = app.TYPES[comp.type]; minX = Math.min(minX, comp.x); minY = Math.min(minY, comp.y); maxX = Math.max(maxX, comp.x + type.w); maxY = Math.max(maxY, comp.y + type.h); });
    app.wires.forEach(function(wire){ app.wireRoute(wire).forEach(function(p){ minX = Math.min(minX, p.x); minY = Math.min(minY, p.y); maxX = Math.max(maxX, p.x); maxY = Math.max(maxY, p.y); }); });
    const margin = 70;
    const a = to3D(minX - margin, minY - margin), b = to3D(maxX + margin, maxY + margin);
    const width = b.x - a.x, depth = b.z - a.z, center = new T.Vector3((a.x + b.x) / 2, 0, (a.z + b.z) / 2);

    const board = new T.Mesh(new T.BoxGeometry(width, 0.16, depth), [mat('#0f2e1f'), mat('#0f2e1f'), mat('#ffffff', {map:boardTexture(width, depth), roughness:0.8}), mat('#0f2e1f'), mat('#0f2e1f'), mat('#0f2e1f')]);
    board.position.set(center.x, -0.08, center.z);
    board.receiveShadow = true; board.userData.isBoard = true;
    circuitGroup.add(board);

    if(!buildCircuit.shared){
      const particleGeometry = new T.SphereGeometry(0.06, 12, 8); particleGeometry.userData.shared = true;
      const particleMaterial = new T.MeshBasicMaterial({color:'#ffd36b'}); particleMaterial.userData.shared = true;
      buildCircuit.shared = {geometry:particleGeometry, material:particleMaterial};
    }
    const shared = buildCircuit.shared;

    app.wires.forEach(function(wire){
      const wireGroup = buildWire(wire, shared, showFlow && simulation && simulation.ok);
      if(wireGroup) circuitGroup.add(wireGroup);
    });

    app.components.forEach(function(comp){
      const type = app.TYPES[comp.type];
      const sim = simulation && simulation.components ? simulation.components[comp.id] : null;
      const group = new T.Group();
      const centerPoint = to3D(comp.x + type.w / 2, comp.y + type.h / 2);
      group.position.copy(centerPoint);
      group.rotation.y = -(Number(comp.rotation) || 0) * Math.PI / 180;
      const builder = BUILDERS[comp.type];
      if(builder) builder(group, comp, sim);
      // Pads de soldadura en cada terminal
      app.terminals(comp.type).forEach(function(t){
        const pad = new T.Mesh(new T.CylinderGeometry(0.075, 0.075, 0.02, 16), mat('#c0c4c8', {metalness:0.9, roughness:0.35}));
        pad.position.set((t.x - type.w / 2) * S, 0.01, (t.y - type.h / 2) * S);
        group.add(pad);
      });
      if(sim && (sim.error || sim.warning)){
        const ring = new T.Mesh(new T.RingGeometry(1.05, 1.13, 48), new T.MeshBasicMaterial({color:sim.error ? '#ff5060' : '#f0b45a', transparent:true, opacity:0.8, side:T.DoubleSide}));
        ring.rotation.x = -Math.PI / 2; ring.position.y = 0.015; ring.scale.set(1, comp.type === 'ground' ? 0.4 : 0.55, 1);
        ring.userData.noShadow = true;
        group.add(ring);
      }
      if(comp.id === selectedId){
        const outline = new T.Mesh(new T.RingGeometry(1.0, 1.04, 48), new T.MeshBasicMaterial({color:'#ffffff', transparent:true, opacity:0.7, side:T.DoubleSide}));
        outline.rotation.x = -Math.PI / 2; outline.position.y = 0.02; outline.scale.set(1, 0.5, 1); outline.userData.noShadow = true;
        group.add(outline);
      }
      if(showLabels){
        const label = labelSprite(comp, sim);
        group.add(label);
      }
      group.traverse(function(node){ node.userData.compId = comp.id; if(node.isMesh && !node.userData.noShadow){ node.castShadow = true; node.receiveShadow = true; } });
      circuitGroup.add(group);
    });
    scene.add(circuitGroup);
    return {center:center, width:width, depth:depth};
  }

  // ---------- escena ----------
  function initRenderer(){
    renderer = new T.WebGLRenderer({antialias:true});
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.shadowMap.enabled = !liteMode();
    renderer.shadowMap.type = T.PCFSoftShadowMap;
    renderer.outputColorSpace = T.SRGBColorSpace;
    renderer.toneMapping = T.ACESFilmicToneMapping;
    stage.appendChild(renderer.domElement);
    scene = new T.Scene();
    scene.background = new T.Color('#121014');
    scene.fog = new T.Fog('#121014', 30, 70);
    camera = new T.PerspectiveCamera(45, 1, 0.1, 200);
    controls = new T.OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.maxPolarAngle = Math.PI / 2 - 0.05;
    controls.minDistance = 2; controls.maxDistance = 50;
    controls.autoRotateSpeed = 1.2;

    scene.add(new T.HemisphereLight('#fff4ea', '#2a2024', 0.9));
    const sun = new T.DirectionalLight('#ffffff', 2.1);
    sun.position.set(-8, 16, 10);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.left = -16; sun.shadow.camera.right = 16; sun.shadow.camera.top = 16; sun.shadow.camera.bottom = -16;
    sun.shadow.bias = -0.0005; sun.shadow.normalBias = 0.02;
    scene.add(sun);
    const fill = new T.DirectionalLight('#9fb8ff', 0.5); fill.position.set(10, 6, -8); scene.add(fill);

    const table = new T.Mesh(new T.PlaneGeometry(200, 200), mat('#2a2326', {roughness:0.95}));
    table.rotation.x = -Math.PI / 2; table.position.y = -0.17; table.receiveShadow = true;
    scene.add(table);

    clock = new T.Clock();
    new ResizeObserver(resize).observe(stage);
    renderer.domElement.addEventListener('pointerdown', function(e){ pointerStart = {x:e.clientX, y:e.clientY}; });
    renderer.domElement.addEventListener('pointerup', onPointerUp);
  }

  function resize(){
    if(!renderer) return;
    const width = stage.clientWidth || 1, height = stage.clientHeight || 1;
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  }

  function frameCamera(bounds){
    const aspect = camera.aspect || 1.6;
    controls.target.copy(bounds.center);
    if(aspect < 0.95){
      // Pantalla vertical (celular): se mira la placa de costado para aprovechar el alto.
      const size = Math.max(bounds.depth / aspect * 1.1, bounds.width);
      camera.position.set(bounds.center.x + size * 0.62 + 1, size * 0.75 + 1.2, bounds.center.z + size * 0.08);
    } else {
      const size = Math.max(bounds.width / Math.max(0.6, aspect) * 1.25, bounds.depth);
      controls.target.add(new T.Vector3(0, 0, 0.3));
      camera.position.set(bounds.center.x - size * 0.1, size * 0.8 + 1.5, bounds.center.z + size * 0.82 + 1.5);
    }
    controls.update();
  }

  function loop(){
    if(!isOpen) return;
    frameId = requestAnimationFrame(loop);
    const delta = Math.min(clock.getDelta(), 0.05);
    const tmp = new T.Vector3();
    particles.forEach(function(p){
      p.offset += p.speed * delta;
      p.meshes.forEach(function(mesh, index){ pointAt(p.line, p.offset + index * p.spacing, tmp); mesh.position.copy(tmp); });
    });
    const t = performance.now() / 1000;
    glowLights.forEach(function(light, index){ light.intensity *= 0.995 + 0.01 * Math.sin(t * 9 + index); });
    controls.update();
    renderer.render(scene, camera);
  }

  // ---------- interacción ----------
  function onPointerUp(e){
    if(!pointerStart || Math.hypot(e.clientX - pointerStart.x, e.clientY - pointerStart.y) > 5) return;
    const rect = renderer.domElement.getBoundingClientRect();
    const pointer = new T.Vector2(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
    const raycaster = new T.Raycaster();
    raycaster.setFromCamera(pointer, camera);
    const hit = raycaster.intersectObjects(circuitGroup.children, true).find(function(h){ return h.object.userData.compId !== undefined && !h.object.userData.isLabel; });
    if(!hit){ selectedId = null; info.hidden = true; rebuild(); return; }
    const comp = window.CircuitApp.components.find(function(c){ return c.id === hit.object.userData.compId; });
    if(!comp) return;
    if(comp.type === 'switch'){
      window.CircuitApp.toggleSwitch(comp.id);
      selectedId = comp.id;
      rebuild(); showInfo(comp);
      return;
    }
    selectedId = comp.id;
    rebuild(); showInfo(comp);
  }

  function showInfo(comp){
    const app = window.CircuitApp;
    const type = app.TYPES[comp.type];
    let html = `<h3><span>${escapeText(comp.label)} · ${type.name}</span><button class="small ghost" id="v3d-info-close">×</button></h3>`;
    if(comp.type === 'potentiometer') html += `<div class="field"><label>Girá la perilla <output id="v3d-pot-out">${Math.round(comp.position)}%</output></label><input type="range" id="v3d-pot" min="0" max="100" value="${comp.position}"></div>`;
    if(comp.type === 'switch') html += `<p class="muted">Tocá el interruptor para ${comp.value ? 'abrirlo' : 'cerrarlo'}.</p>`;
    html += app.explain(comp).replace(/<button[^>]*id="p-to-triangle"[^>]*>.*?<\/button>/, '');
    info.innerHTML = html; info.hidden = false;
    document.getElementById('v3d-info-close').addEventListener('click', function(){ info.hidden = true; selectedId = null; rebuild(); });
    const pot = document.getElementById('v3d-pot');
    if(pot){
      pot.addEventListener('input', function(e){ app.setPot(comp.id, Number(e.target.value), false); document.getElementById('v3d-pot-out').textContent = e.target.value + '%'; rebuild(); refreshInfoBody(comp); });
      pot.addEventListener('change', function(e){ app.setPot(comp.id, Number(e.target.value), true); });
    }
  }
  function refreshInfoBody(comp){
    const details = info.querySelector('.simulation-readout');
    const explain = info.querySelector('.explain');
    const fresh = document.createElement('div');
    fresh.innerHTML = window.CircuitApp.explain(comp).replace(/<button[^>]*id="p-to-triangle"[^>]*>.*?<\/button>/, '');
    if(details && fresh.querySelector('.simulation-readout')) details.replaceWith(fresh.querySelector('.simulation-readout'));
    if(explain && fresh.querySelector('.explain')) explain.replaceWith(fresh.querySelector('.explain'));
  }
  function escapeText(value){ const span = document.createElement('span'); span.textContent = value; return span.innerHTML; }

  function rebuild(){ if(scene) buildCircuit(); }

  function liteMode(){ return document.getElementById('v3d-lite').checked; }
  function applyQuality(){
    if(!renderer) return;
    const lite = liteMode();
    renderer.setPixelRatio(lite ? 1 : Math.min(window.devicePixelRatio || 1, 2));
    renderer.shadowMap.enabled = !lite;
    scene.traverse(function(node){ if(node.material){ (Array.isArray(node.material) ? node.material : [node.material]).forEach(function(m){ m.needsUpdate = true; }); } });
    resize();
  }

  function open(){
    overlay.hidden = false;
    if(!renderer){
      try { initRenderer(); }
      catch(error){
        console.error(error);
        renderer = null;
        overlay.hidden = true;
        if(window.SiteContent) window.SiteContent.openModal('Vista 3D no disponible', '<p>No se pudo iniciar el modo 3D en esta computadora (WebGL no respondió). Probá actualizar el navegador o activar la aceleración por hardware. El resto del simulador funciona igual.</p>');
        return;
      }
    }
    applyQuality();
    resize();
    selectedId = null; info.hidden = true;
    const bounds = buildCircuit();
    frameCamera(bounds);
    isOpen = true;
    clock.getDelta();
    loop();
  }
  function close(){
    isOpen = false;
    if(frameId) cancelAnimationFrame(frameId);
    overlay.hidden = true;
  }

  document.getElementById('v3d-close').addEventListener('click', close);
  document.getElementById('v3d-reset').addEventListener('click', function(){ frameCamera(buildCircuit()); });
  document.getElementById('v3d-labels').addEventListener('change', rebuild);
  document.getElementById('v3d-flow').addEventListener('change', rebuild);
  // Modo liviano: se recuerda y se activa solo en equipos con pocos recursos.
  const liteBox = document.getElementById('v3d-lite');
  try {
    const saved = localStorage.getItem('simulador-circuitos-editor-v2-lite3d');
    liteBox.checked = saved !== null ? saved === '1' : ((navigator.hardwareConcurrency || 8) <= 4 || (navigator.deviceMemory || 8) <= 4);
  } catch(error) { liteBox.checked = (navigator.hardwareConcurrency || 8) <= 4; }
  liteBox.addEventListener('change', function(){
    try { localStorage.setItem('simulador-circuitos-editor-v2-lite3d', liteBox.checked ? '1' : '0'); } catch(error) {}
    applyQuality(); rebuild();
  });
  document.getElementById('v3d-spin').addEventListener('change', function(e){ if(controls) controls.autoRotate = e.target.checked; });
  document.addEventListener('keydown', function(e){ if(isOpen && e.key === 'Escape'){ e.stopPropagation(); close(); } }, true);

  window.View3D = {open:open, close:close, rebuild:rebuild};
})();
