const TYPES = {
  resistor:{ name:'Resistencia', unit:'Ω', valueLabel:'Resistencia', default:100, w:90, h:40 },
  battery:{ name:'Fuente de voltaje', unit:'V', valueLabel:'Voltaje', default:9, w:90, h:40 },
  potentiometer:{ name:'Potenciómetro', unit:'Ω', valueLabel:'Resistencia máxima', default:1000, w:90, h:40 },
  bulb:{ name:'Lámpara', unit:'V', valueLabel:'Voltaje nominal', default:6, defaultResistance:30, w:90, h:40 },
  led:{ name:'LED', unit:'V', valueLabel:'Caída directa Vf', default:2, w:90, h:40 },
  switch:{ name:'Interruptor', unit:'', valueLabel:'Estado', default:1, w:90, h:40 },
  ammeter:{ name:'Amperímetro', unit:'A', valueLabel:null, default:0, w:90, h:40 },
  voltmeter:{ name:'Voltímetro', unit:'V', valueLabel:null, default:0, w:90, h:40 },
  ground:{ name:'Tierra / Nodo', unit:'', valueLabel:null, default:0, w:20, h:20 }
};
const LED_COLORS = { rojo:'#ff3b3b', verde:'#3bff7a', azul:'#3b8bff', amarillo:'#ffd23b', blanco:'#f4f4ff' };
const LED_SERIES_R = 10;        // resistencia interna del LED encendido (Ω)
const LED_MAX_CURRENT = 0.02;   // corriente nominal de un LED común (20 mA)
const AMMETER_R = 0.01, VOLTMETER_R = 1e7;
let liveSimulation = true;
let components = [];
let wires = [];
let idCounter = 1;
let selectedId = null;
let selectedWireId = null;
let connectMode = false;
let pendingTerminal = null;
let activeDrag = null;
let history = [];
let historyIndex = -1;
let toastTimer = null;
let simulation = null;
let viewport = {x:0, y:0, width:1000, height:700};
let spaceKeyDown = false;
let tutorialIndex = 0;

const GRID = 8;
const STORAGE_KEY = 'simulador-circuitos-editor-v2';
const WIRE_COLORS = ['#b53a4b', '#3d8fd1', '#40b78c', '#f0b45a', '#a875db', '#f5f2f3'];
const WIRE_DASHES = { solid:'', dashed:'10 6', dotted:'2 5' };

const svg = document.getElementById('canvas');
const compLayer = document.getElementById('components-layer');
const wireLayer = document.getElementById('wires-layer');
const modeBadge = document.getElementById('mode-badge');

function symbolColor(){ return document.body.dataset.theme === 'light' ? '#201d20' : '#f5f2f3'; }

function normalizeComponent(comp){
  comp.rotation = ((Number(comp.rotation) || 0) % 360 + 360) % 360;
  if(comp.type === 'bulb' && !Number.isFinite(Number(comp.resistance))) comp.resistance = TYPES.bulb.defaultResistance;
  if(comp.type === 'potentiometer' && !Number.isFinite(Number(comp.position))) comp.position = 50;
  if(comp.type === 'led' && !LED_COLORS[comp.color]) comp.color = 'rojo';
  return comp;
}

function setViewBox(){
  svg.setAttribute('viewBox', viewport.x + ' ' + viewport.y + ' ' + viewport.width + ' ' + viewport.height);
}

function fitCanvas(){
  viewport = {x:0, y:0, width:1000, height:700};
  setViewBox();
  updateZoomLabel();
}

function updateZoomLabel(){
  const button = document.getElementById('btn-fit');
  if(button) button.title = 'Ajustar lienzo (F) · ' + Math.round((1000 / viewport.width) * 100) + '%';
}

function zoomAt(point, factor){
  const newWidth = clamp(viewport.width * factor, 300, 1800);
  const newHeight = newWidth * 0.7;
  const ratioX = (point.x - viewport.x) / viewport.width;
  const ratioY = (point.y - viewport.y) / viewport.height;
  viewport.x = point.x - newWidth * ratioX;
  viewport.y = point.y - newHeight * ratioY;
  viewport.width = newWidth;
  viewport.height = newHeight;
  setViewBox();
  updateZoomLabel();
}

function snap(value){ return Math.round(value / GRID) * GRID; }
function clamp(value, min, max){ return Math.max(min, Math.min(max, value)); }
function findComponent(id){ return components.find(function(c){ return c.id === id; }); }
function findWire(id){ return wires.find(function(w){ return w.id === id; }); }

function normalizeWire(wire){
  wire.label = typeof wire.label === 'string' ? wire.label : '';
  wire.routeMode = wire.routeMode || 'auto';
  wire.points = Array.isArray(wire.points) ? wire.points : [];
  wire.color = wire.color || '#b53a4b';
  wire.width = Number(wire.width) || 2.5;
  wire.dash = wire.dash || 'solid';
  return wire;
}

function showToast(message){
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(function(){ toast.classList.remove('show'); }, 2600);
}

function updateHistoryButtons(){
  document.getElementById('btn-undo').disabled = historyIndex <= 0;
  document.getElementById('btn-redo').disabled = historyIndex >= history.length - 1;
}

function persistCircuit(){
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ components:components, wires:wires, idCounter:idCounter }));
  } catch(error) { /* El editor continúa funcionando si el almacenamiento no está disponible. */ }
}

function snapshot(){ return JSON.stringify({ components:components, wires:wires, idCounter:idCounter }); }

function commitHistory(){
  const state = snapshot();
  if(history[historyIndex] === state) return;
  history = history.slice(0, historyIndex + 1);
  history.push(state);
  if(history.length > 60){ history.shift(); }
  historyIndex = history.length - 1;
  refreshSimulation();
  persistCircuit();
  updateHistoryButtons();
  renderSimulation();
}

// Con "simulación en vivo" el circuito se recalcula solo después de cada cambio.
function refreshSimulation(){
  if(liveSimulation && components.length) simulation = analyseCircuit();
  else simulation = null;
}

function restoreHistory(index){
  if(index < 0 || index >= history.length) return;
  const state = JSON.parse(history[index]);
  components = (state.components || []).map(normalizeComponent);
  wires = (state.wires || []).map(normalizeWire);
  idCounter = state.idCounter || 1;
  selectedId = null;
  selectedWireId = null;
  pendingTerminal = null;
  historyIndex = index;
  refreshSimulation();
  persistCircuit();
  updateConnectionUI();
  render();
  renderProps();
  renderSimulation();
}

function loadCircuit(){
  if(loadSharedCircuit()) return;
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if(saved && Array.isArray(saved.components) && Array.isArray(saved.wires)){
      components = saved.components.map(normalizeComponent);
      wires = saved.wires.map(normalizeWire);
      idCounter = saved.idCounter || 1;
    }
  } catch(error) { /* Una sesión antigua o inválida se ignora de forma segura. */ }
  history = [snapshot()];
  historyIndex = 0;
  updateHistoryButtons();
}

function svgPoint(evt){
  const pt = svg.createSVGPoint();
  pt.x = evt.clientX; pt.y = evt.clientY;
  const ctm = svg.getScreenCTM().inverse();
  return pt.matrixTransform(ctm);
}

// ---------- symbol drawing ----------
function symbolInner(type, comp, sim){
  const c = symbolColor();
  switch(type){
    case 'resistor':
      return `<path d="M0 20 H14 L20 6 L28 34 L36 6 L44 34 L52 6 L60 20 H90" stroke="${c}" stroke-width="2.2" fill="none"/>`;
    case 'potentiometer': {
      const knobX = 14 + (clamp(Number(comp.position) || 0, 0, 100) / 100) * 46;
      return `<path d="M0 20 H14 L20 6 L28 34 L36 6 L44 34 L52 6 L60 20 H90" stroke="${c}" stroke-width="2.2" fill="none"/>
              <path d="M18 38 L66 0 M66 0 L57 2 M66 0 L63 9" stroke="#f0b45a" stroke-width="1.8" fill="none"/>
              <circle cx="${knobX}" cy="20" r="3" fill="#f0b45a"/>`;
    }
    case 'led': {
      const color = LED_COLORS[comp.color] || LED_COLORS.rojo;
      const glow = sim && !sim.burned ? clamp(sim.brightness || 0, 0, 1) : 0;
      const body = sim && sim.burned ? '#555' : c;
      return `${glow > 0.02 ? `<circle cx="45" cy="20" r="22" fill="${color}" opacity="${(0.15 + glow * 0.45).toFixed(2)}" filter="url(#glow)"/>` : ''}
              <path d="M0 20 H34 M56 20 H90" stroke="${c}" stroke-width="2.2"/>
              <path d="M34 8 L34 32 L54 20 Z" fill="${glow > 0.02 ? color : 'none'}" stroke="${body}" stroke-width="2"/>
              <path d="M56 8 V32" stroke="${body}" stroke-width="2.4"/>
              <path d="M44 4 L52 -4 M50 6 L58 -2 M52 -4 L48 -3 M52 -4 L51 0 M58 -2 L54 -1 M58 -2 L57 2" stroke="${color}" stroke-width="1.4" fill="none"/>
              ${sim && sim.burned ? `<path d="M36 6 L54 34 M54 6 L36 34" stroke="#d6505f" stroke-width="2.4"/>` : ''}`;
    }
    case 'voltmeter':
      return `<path d="M0 20 H24" stroke="${c}" stroke-width="2.2"/>
              <circle cx="45" cy="20" r="18" stroke="${c}" stroke-width="2.2" fill="none"/>
              <text x="45" y="26" font-size="16" font-weight="700" fill="${c}" font-family="JetBrains Mono, monospace" text-anchor="middle">V</text>
              <text x="14" y="12" font-size="10" fill="#d6505f" font-family="JetBrains Mono, monospace" text-anchor="middle">+</text>
              <path d="M66 20 H90" stroke="${c}" stroke-width="2.2"/>`;
    case 'battery':
      return `<style>style + path + text{fill:#aaa2a6}</style><path d="M0 20 H30 M30 6 V34 M40 14 V26 M40 20 H90" stroke="${c}" stroke-width="2.2" fill="none"/>
              <text x="35" y="46" font-size="9" fill="#8798a8" font-family="JetBrains Mono, monospace" text-anchor="middle">+  −</text>`;
    case 'bulb': {
      const glow = sim && !sim.burned ? clamp(sim.brightness || 0, 0, 1) : 0;
      const cross = sim && sim.burned ? '#d6505f' : c;
      return `${glow > 0.02 ? `<circle cx="45" cy="20" r="${(20 + glow * 10).toFixed(1)}" fill="#ffd36b" opacity="${(0.12 + glow * 0.5).toFixed(2)}" filter="url(#glow)"/>` : ''}
              <path d="M0 20 H24" stroke="${c}" stroke-width="2.2"/>
              <circle cx="45" cy="20" r="18" stroke="${c}" stroke-width="2.2" fill="${glow > 0.02 ? `rgba(255,211,107,${(glow * 0.85).toFixed(2)})` : 'none'}"/>
              ${sim && sim.burned ? `<path d="M33 8 L43 18 M47 22 L57 32 M57 8 L47 18 M43 22 L33 32" stroke="${cross}" stroke-width="1.8"/>` : `<path d="M33 8 L57 32 M57 8 L33 32" stroke="${cross}" stroke-width="1.6"/>`}
              <path d="M66 20 H90" stroke="${c}" stroke-width="2.2"/>`;
    }
    case 'switch':
      return `<path d="M0 20 H18" stroke="${c}" stroke-width="2.2"/>
              <circle cx="20" cy="20" r="3.5" fill="${c}"/>
              <circle cx="70" cy="20" r="3.5" fill="${c}"/>
              <path d="M20 20 L${comp.value ? '68 20' : '62 4'}" stroke="${c}" stroke-width="2.2"/>
              <path d="M72 20 H90" stroke="${c}" stroke-width="2.2"/>`;
    case 'ammeter':
      return `<path d="M0 20 H24" stroke="${c}" stroke-width="2.2"/>
              <circle cx="45" cy="20" r="18" stroke="${c}" stroke-width="2.2" fill="none"/>
              <text x="45" y="26" font-size="16" font-weight="700" fill="${c}" font-family="JetBrains Mono, monospace" text-anchor="middle">A</text>
              <path d="M66 20 H90" stroke="${c}" stroke-width="2.2"/>`;
    case 'ground':
      return `<path d="M10 0 V8 M2 8 H18 M5 12 H15 M8 16 H12" stroke="${c}" stroke-width="2.2"/>`;
    default: return '';
  }
}

function terminals(type){
  if(type === 'ground') return [{x:10,y:0}];
  return [{x:0,y:20},{x:90,y:20}];
}

function valueText(comp){
  const t = TYPES[comp.type];
  const sim = simulation && simulation.components ? simulation.components[comp.id] : null;
  if(comp.type === 'switch') return comp.value ? 'cerrado' : 'abierto';
  if(comp.type === 'ground') return '';
  if(comp.type === 'ammeter') return sim ? formatElectrical(Math.abs(sim.current), 'A') : 'A = ?';
  if(comp.type === 'voltmeter') return sim ? formatElectrical(sim.voltage, 'V') : 'V = ?';
  if(comp.type === 'potentiometer') return formatElectrical(potResistance(comp), 'Ω') + ' (' + Math.round(comp.position) + '%)';
  if(comp.type === 'led') return comp.color + ' · ' + comp.value + ' V';
  if(comp.type === 'bulb') return comp.value + ' V · ' + comp.resistance + ' Ω';
  if(comp.type === 'resistor') return formatElectrical(Number(comp.value), 'Ω');
  if(comp.type === 'battery') return comp.value + ' V';
  return `${comp.value}${t.unit}`;
}

function wireRoute(wire){
  const a = terminalWorldPos(wire.a);
  const b = terminalWorldPos(wire.b);
  if(!a || !b) return [];
  let points;
  if(wire.routeMode === 'manual'){
    points = [a].concat(wire.points || []).concat([b]);
  } else {
    const middleX = snap((a.x + b.x) / 2);
    points = [a, {x:middleX, y:a.y}, {x:middleX, y:b.y}, b];
  }
  return points.filter(function(point, index, list){
    return index === 0 || point.x !== list[index - 1].x || point.y !== list[index - 1].y;
  });
}

function pathFromPoints(points){
  return points.map(function(point, index){
    return (index === 0 ? 'M' : 'L') + point.x + ' ' + point.y;
  }).join(' ');
}

function routeMidpoint(points){
  let total = 0;
  for(let index = 0; index < points.length - 1; index++) total += Math.hypot(points[index + 1].x - points[index].x, points[index + 1].y - points[index].y);
  let target = total / 2;
  for(let index = 0; index < points.length - 1; index++){
    const a = points[index], b = points[index + 1];
    const length = Math.hypot(b.x - a.x, b.y - a.y);
    if(target <= length || index === points.length - 2){
      const ratio = length ? target / length : 0;
      return {x:a.x + (b.x - a.x) * ratio, y:a.y + (b.y - a.y) * ratio};
    }
    target -= length;
  }
  return points[0];
}

function makeWireManual(wire){
  if(wire.routeMode === 'manual') return;
  const route = wireRoute(wire);
  wire.routeMode = 'manual';
  wire.points = route.slice(1, -1).map(function(point){ return {x:point.x, y:point.y}; });
}

function nearestSegmentIndex(points, point){
  let nearest = 0;
  let distance = Infinity;
  for(let index = 0; index < points.length - 1; index++){
    const a = points[index], b = points[index + 1];
    const dx = b.x - a.x, dy = b.y - a.y;
    const lengthSquared = dx * dx + dy * dy || 1;
    const factor = clamp(((point.x - a.x) * dx + (point.y - a.y) * dy) / lengthSquared, 0, 1);
    const px = a.x + factor * dx, py = a.y + factor * dy;
    const currentDistance = (point.x - px) * (point.x - px) + (point.y - py) * (point.y - py);
    if(currentDistance < distance){ distance = currentDistance; nearest = index; }
  }
  return nearest;
}

function addRoutePoint(wire, point){
  makeWireManual(wire);
  const route = wireRoute(wire);
  const insertion = nearestSegmentIndex(route, point);
  wire.points.splice(insertion, 0, {x:snap(point.x), y:snap(point.y)});
}

function addMidpoint(wire){
  makeWireManual(wire);
  const route = wireRoute(wire);
  let longest = 0, maxLength = -1;
  for(let index = 0; index < route.length - 1; index++){
    const dx = route[index + 1].x - route[index].x;
    const dy = route[index + 1].y - route[index].y;
    const length = dx * dx + dy * dy;
    if(length > maxLength){ maxLength = length; longest = index; }
  }
  const a = route[longest], b = route[longest + 1];
  wire.points.splice(longest, 0, {x:snap((a.x + b.x) / 2), y:snap((a.y + b.y) / 2)});
}

// ---------- rendering ----------
function render(){
  compLayer.innerHTML = '';
  wireLayer.innerHTML = '';

  wires.forEach(w=>{
    normalizeWire(w);
    const route = wireRoute(w);
    if(route.length < 2) return;
    const hitArea = document.createElementNS('http://www.w3.org/2000/svg','path');
    hitArea.setAttribute('d', pathFromPoints(route));
    hitArea.setAttribute('stroke', 'transparent');
    hitArea.setAttribute('stroke-width', Math.max(14, w.width + 10));
    hitArea.setAttribute('fill', 'none');
    hitArea.setAttribute('data-wire', w.id);
    hitArea.classList.add('wire-hit');
    wireLayer.appendChild(hitArea);
    const line = document.createElementNS('http://www.w3.org/2000/svg','path');
    line.setAttribute('d', pathFromPoints(route));
    line.setAttribute('stroke', w.color);
    line.setAttribute('stroke-width', w.width);
    line.setAttribute('fill', 'none');
    line.setAttribute('stroke-linecap','round');
    line.setAttribute('stroke-linejoin','round');
    line.setAttribute('stroke-dasharray', WIRE_DASHES[w.dash] || '');
    line.setAttribute('data-wire', w.id);
    line.classList.add('wire-path');
    if(w.id === selectedWireId) line.classList.add('selected');
    wireLayer.appendChild(line);

    // Animación de la corriente convencional (del + al −) según el sentido y el valor calculado.
    const flow = wireCurrent(w);
    if(flow && Math.abs(flow) > 1e-6){
      const flowPath = document.createElementNS('http://www.w3.org/2000/svg','path');
      flowPath.setAttribute('d', pathFromPoints(route));
      flowPath.setAttribute('stroke-width', Math.max(2.5, w.width + 1.5));
      flowPath.classList.add('flow-path');
      flowPath.style.animationDuration = flowDuration(Math.abs(flow)) + 's';
      if(flow < 0) flowPath.style.animationDirection = 'reverse';
      wireLayer.appendChild(flowPath);
    }

    if(w.label.trim()){
      const labelPosition = routeMidpoint(route);
      const label = document.createElementNS('http://www.w3.org/2000/svg','text');
      label.setAttribute('x', labelPosition.x);
      label.setAttribute('y', labelPosition.y - 8);
      label.setAttribute('text-anchor', 'middle');
      label.setAttribute('font-size', '10');
      label.setAttribute('font-family', 'JetBrains Mono, monospace');
      label.setAttribute('fill', symbolColor());
      label.setAttribute('stroke', document.body.dataset.theme === 'light' ? '#f7f5f6' : '#0a090a');
      label.setAttribute('stroke-width', '3');
      label.setAttribute('paint-order', 'stroke');
      label.classList.add('wire-label');
      label.textContent = w.label;
      wireLayer.appendChild(label);
    }

    if(w.id === selectedWireId && w.routeMode === 'manual'){
      w.points.forEach(function(point, pointIndex){
        const handle = document.createElementNS('http://www.w3.org/2000/svg','circle');
        handle.setAttribute('cx', point.x);
        handle.setAttribute('cy', point.y);
        handle.setAttribute('r', 6);
        handle.setAttribute('data-route-point', pointIndex);
        handle.setAttribute('data-wire', w.id);
        handle.setAttribute('fill', '#f5f2f3');
        handle.setAttribute('stroke', w.color);
        handle.setAttribute('stroke-width', '2.5');
        handle.classList.add('route-handle');
        wireLayer.appendChild(handle);
      });
    }
  });

  components.forEach(comp=>{
    normalizeComponent(comp);
    const g = document.createElementNS('http://www.w3.org/2000/svg','g');
    const type = TYPES[comp.type];
    g.setAttribute('transform', `translate(${comp.x},${comp.y}) rotate(${comp.rotation},${type.w / 2},${type.h / 2})`);
    g.setAttribute('data-id', comp.id);
    g.classList.add('component');
    g.style.cursor = 'grab';
    const simResult = simulation && simulation.components ? simulation.components[comp.id] : null;
    if(simResult && simResult.warning) g.classList.add('sim-warning');
    if(simResult && simResult.error) g.classList.add('sim-error');
    if(simResult && simResult.power > 0.01) g.classList.add('sim-active');
    if(simResult && (simResult.warning || simResult.error)){
      const statusOutline = document.createElementNS('http://www.w3.org/2000/svg','rect');
      statusOutline.setAttribute('x', -10); statusOutline.setAttribute('y', -16);
      statusOutline.setAttribute('width', type.w + 20); statusOutline.setAttribute('height', type.h + 20);
      statusOutline.setAttribute('rx', 9); statusOutline.setAttribute('fill', 'none');
      statusOutline.setAttribute('stroke', simResult.error ? '#d6505f' : '#f0b45a');
      statusOutline.setAttribute('stroke-width', '2'); statusOutline.setAttribute('stroke-dasharray', '5 3');
      g.appendChild(statusOutline);
    }
    if(comp.id === selectedId){
      const hw = type.w, hh = type.h;
      const hl = document.createElementNS('http://www.w3.org/2000/svg','rect');
      hl.setAttribute('x', -8); hl.setAttribute('y', -14);
      hl.setAttribute('width', hw+16); hl.setAttribute('height', hh+16);
      hl.setAttribute('rx', 8);
      hl.setAttribute('fill','none'); hl.setAttribute('stroke','#7a1725');
      hl.setAttribute('stroke-width','1.5'); hl.setAttribute('stroke-dasharray','4 3');
      hl.classList.add('selection-outline');
      g.appendChild(hl);
    }
    g.innerHTML += symbolInner(comp.type, comp, simResult);
    if(comp.type !== 'ground'){
      const label = document.createElementNS('http://www.w3.org/2000/svg','text');
      label.setAttribute('x', 45); label.setAttribute('y', -8);
      label.setAttribute('text-anchor','middle');
      label.setAttribute('font-size','11');
      label.setAttribute('font-family',"'JetBrains Mono', monospace");
      label.setAttribute('fill', symbolColor());
      label.textContent = comp.label;
      g.appendChild(label);

      const valTxt = document.createElementNS('http://www.w3.org/2000/svg','text');
      valTxt.setAttribute('x', 45); valTxt.setAttribute('y', 55);
      valTxt.setAttribute('text-anchor','middle');
      valTxt.setAttribute('font-size','10.5');
      valTxt.setAttribute('font-family',"'JetBrains Mono', monospace");
      const isMeter = comp.type === 'ammeter' || comp.type === 'voltmeter';
      valTxt.setAttribute('fill', isMeter && simResult ? '#40b78c' : '#b53a4b');
      if(isMeter) valTxt.setAttribute('font-weight', '700');
      valTxt.textContent = valueText(comp);
      g.appendChild(valTxt);
      if(simResult && Number.isFinite(simResult.current) && !isMeter){
        const simTxt = document.createElementNS('http://www.w3.org/2000/svg','text');
        simTxt.setAttribute('x', 45); simTxt.setAttribute('y', 68);
        simTxt.setAttribute('text-anchor','middle'); simTxt.setAttribute('font-size','9');
        simTxt.setAttribute('font-family', 'JetBrains Mono, monospace');
        simTxt.setAttribute('fill', simResult.error ? '#d6505f' : '#40b78c');
        simTxt.textContent = simResult.burned ? '¡QUEMADO!' : 'I ' + formatElectrical(Math.abs(simResult.current), 'A') + ' · P ' + formatElectrical(simResult.power, 'W');
        g.appendChild(simTxt);
      }
    }

    terminals(comp.type).forEach((t,i)=>{
      const isPending = pendingTerminal && pendingTerminal.compId === comp.id && pendingTerminal.tIdx === i;
      const dot = document.createElementNS('http://www.w3.org/2000/svg','circle');
      dot.setAttribute('cx', t.x); dot.setAttribute('cy', t.y);
      dot.setAttribute('r', connectMode ? 6 : 4);
      dot.setAttribute('fill', isPending ? '#b53a4b' : (connectMode ? '#9d2737' : (document.body.dataset.theme === 'light' ? '#5d5659' : '#aaa2a6')));
      dot.setAttribute('data-terminal', i);
      dot.style.cursor = connectMode ? 'pointer' : 'default';
      g.appendChild(dot);
    });

    compLayer.appendChild(g);
  });
}

function terminalWorldPos(ref){
  const comp = components.find(c=>c.id === ref.compId);
  if(!comp) return null;
  const t = terminals(comp.type)[ref.tIdx];
  if(!t) return null;
  const type = TYPES[comp.type];
  const radians = (Number(comp.rotation) || 0) * Math.PI / 180;
  const centerX = type.w / 2, centerY = type.h / 2;
  const localX = t.x - centerX, localY = t.y - centerY;
  return {
    x: comp.x + centerX + localX * Math.cos(radians) - localY * Math.sin(radians),
    y: comp.y + centerY + localX * Math.sin(radians) + localY * Math.cos(radians)
  };
}

// ---------- DC simulation ----------
function formatElectrical(value, unit){
  if(!Number.isFinite(value)) return '—';
  const absolute = Math.abs(value);
  if(absolute < 1e-9) return '0 ' + unit;
  const prefixes = absolute >= 1000000 ? [1000000, 'M'] : absolute >= 1000 ? [1000, 'k'] : absolute < 0.001 ? [0.000001, 'µ'] : absolute < 1 ? [0.001, 'm'] : [1, ''];
  const scaled = value / prefixes[0];
  return scaled.toLocaleString('es-AR', {maximumFractionDigits:3}) + ' ' + prefixes[1] + unit;
}

function createUnionFind(size){
  const parent = Array.from({length:size}, function(_, index){ return index; });
  function find(value){
    let node = value;
    while(parent[node] !== node){ parent[node] = parent[parent[node]]; node = parent[node]; }
    return node;
  }
  return { find:find, union:function(a, b){ const rootA = find(a), rootB = find(b); if(rootA !== rootB) parent[rootB] = rootA; } };
}

function solveLinearSystem(matrix, vector){
  const size = vector.length;
  const augmented = matrix.map(function(row, index){ return row.slice().concat(vector[index]); });
  for(let column = 0; column < size; column++){
    let pivot = column;
    for(let row = column + 1; row < size; row++) if(Math.abs(augmented[row][column]) > Math.abs(augmented[pivot][column])) pivot = row;
    if(Math.abs(augmented[pivot][column]) < 1e-10) return null;
    if(pivot !== column){ const temporary = augmented[column]; augmented[column] = augmented[pivot]; augmented[pivot] = temporary; }
    const divisor = augmented[column][column];
    for(let cursor = column; cursor <= size; cursor++) augmented[column][cursor] /= divisor;
    for(let row = 0; row < size; row++){
      if(row === column) continue;
      const multiplier = augmented[row][column];
      if(Math.abs(multiplier) < 1e-12) continue;
      for(let cursor = column; cursor <= size; cursor++) augmented[row][cursor] -= multiplier * augmented[column][cursor];
    }
  }
  return augmented.map(function(row){ return row[size]; });
}

function potResistance(comp){
  return Math.max((Number(comp.value) || 0) * clamp(Number(comp.position) || 0, 0, 100) / 100, 0.5);
}

// Resistencia que ve el simulador. null = el componente no conduce (abierto).
function componentResistance(comp, state){
  if(state && state.burned.has(comp.id)) return null;
  if(comp.type === 'resistor') return Math.max(Number(comp.value) || 0.001, 0.001);
  if(comp.type === 'potentiometer') return potResistance(comp);
  if(comp.type === 'bulb') return Math.max(Number(comp.resistance) || TYPES.bulb.defaultResistance, 0.001);
  if(comp.type === 'switch') return comp.value ? 0.01 : null;
  if(comp.type === 'ammeter') return AMMETER_R;
  if(comp.type === 'voltmeter') return VOLTMETER_R;
  return null;
}

function createSimulationModel(){
  const terminalIds = new Map();
  let terminalCount = 0;
  components.forEach(function(comp){ terminals(comp.type).forEach(function(_, index){ terminalIds.set(comp.id + ':' + index, terminalCount++); }); });
  const union = createUnionFind(terminalCount);
  wires.forEach(function(wire){
    const a = terminalIds.get(wire.a.compId + ':' + wire.a.tIdx);
    const b = terminalIds.get(wire.b.compId + ':' + wire.b.tIdx);
    if(a !== undefined && b !== undefined) union.union(a, b);
  });
  const roots = new Map();
  terminalIds.forEach(function(id){ const root = union.find(id); if(!roots.has(root)) roots.set(root, roots.size); });
  const nodeForTerminal = function(compId, index){ return roots.get(union.find(terminalIds.get(compId + ':' + index))); };
  const componentNodes = new Map();
  components.forEach(function(comp){ componentNodes.set(comp.id, terminals(comp.type).map(function(_, index){ return nodeForTerminal(comp.id, index); })); });
  return {componentNodes:componentNodes, nodeCount:roots.size};
}

// Resuelve la red una vez (análisis nodal modificado) para un estado dado de LEDs y componentes quemados.
function solveNetwork(model, primary, primaryNodes, state){
  const adjacency = Array.from({length:model.nodeCount}, function(){ return []; });
  const activeComponents = [];
  function link(a, b, comp, kind){
    if(a === b) return;
    adjacency[a].push({node:b, comp:comp, kind:kind});
    adjacency[b].push({node:a, comp:comp, kind:kind});
  }
  components.forEach(function(comp){
    const nodes = model.componentNodes.get(comp.id);
    if(!nodes || nodes.length < 2) return;
    if(comp.type === 'battery'){ link(nodes[0], nodes[1], comp, 'source'); activeComponents.push(comp); }
    else if(comp.type === 'led'){ if(!state.burned.has(comp.id)){ link(nodes[0], nodes[1], comp, 'load'); activeComponents.push(comp); } }
    else if(componentResistance(comp, state) !== null){ link(nodes[0], nodes[1], comp, comp.type === 'voltmeter' ? 'meter' : 'load'); activeComponents.push(comp); }
  });

  const includedNodes = new Set([primaryNodes[0]]);
  const queue = [primaryNodes[0]];
  while(queue.length){
    const node = queue.shift();
    adjacency[node].forEach(function(edge){ if(!includedNodes.has(edge.node)){ includedNodes.add(edge.node); queue.push(edge.node); } });
  }
  const includedComponents = activeComponents.filter(function(comp){
    const nodes = model.componentNodes.get(comp.id);
    return nodes && includedNodes.has(nodes[0]) && includedNodes.has(nodes[1]);
  });
  const ground = components.find(function(comp){ const nodes = model.componentNodes.get(comp.id); return comp.type === 'ground' && nodes && includedNodes.has(nodes[0]); });
  const referenceNode = ground ? model.componentNodes.get(ground.id)[0] : primaryNodes[1];
  const nodeIndexes = new Map();
  includedNodes.forEach(function(node){ if(node !== referenceNode) nodeIndexes.set(node, nodeIndexes.size); });
  const sourceComponents = includedComponents.filter(function(comp){ return comp.type === 'battery'; });
  const voltageCount = nodeIndexes.size;
  const matrixSize = voltageCount + sourceComponents.length;
  if(!matrixSize) return {error:'No se pudo formar una red eléctrica válida.'};
  const matrix = Array.from({length:matrixSize}, function(){ return Array(matrixSize).fill(0); });
  const vector = Array(matrixSize).fill(0);
  const nodeIndex = function(node){ return node === referenceNode ? -1 : nodeIndexes.get(node); };
  const addMatrix = function(row, column, value){ if(row >= 0 && column >= 0) matrix[row][column] += value; };
  const addVector = function(row, value){ if(row >= 0) vector[row] += value; };
  function stampConductance(a, b, conductance){
    const ia = nodeIndex(a), ib = nodeIndex(b);
    addMatrix(ia, ia, conductance); addMatrix(ib, ib, conductance);
    addMatrix(ia, ib, -conductance); addMatrix(ib, ia, -conductance);
  }
  includedComponents.forEach(function(comp){
    const nodes = model.componentNodes.get(comp.id);
    if(comp.type === 'led'){
      // Modelo por tramos: encendido = fuente Vf + resistencia interna; apagado = casi abierto.
      if(state.ledOn.get(comp.id)){
        const g = 1 / LED_SERIES_R, vf = Number(comp.value) || 2;
        stampConductance(nodes[0], nodes[1], g);
        addVector(nodeIndex(nodes[0]), g * vf); addVector(nodeIndex(nodes[1]), -g * vf);
      } else stampConductance(nodes[0], nodes[1], 1e-9);
      return;
    }
    const resistance = componentResistance(comp, state);
    if(resistance !== null) stampConductance(nodes[0], nodes[1], 1 / resistance);
  });
  // Conductancia mínima a referencia para nodos flotantes (evita matrices singulares).
  nodeIndexes.forEach(function(index){ matrix[index][index] += 1e-12; });
  sourceComponents.forEach(function(comp, sourceIndex){
    const nodes = model.componentNodes.get(comp.id), ia = nodeIndex(nodes[0]), ib = nodeIndex(nodes[1]), row = voltageCount + sourceIndex;
    addMatrix(ia, row, 1); addMatrix(ib, row, -1);
    addMatrix(row, ia, 1); addMatrix(row, ib, -1);
    vector[row] = Number(comp.value) || 0;
  });
  const solution = solveLinearSystem(matrix, vector);
  if(!solution) return {error:'La red no tiene una solución DC estable. Revisá fuentes contrapuestas o conexiones incompletas.'};
  const voltageAt = function(node){ const index = nodeIndex(node); return index === undefined || index < 0 ? 0 : solution[index]; };
  const values = {};
  includedComponents.forEach(function(comp){
    const nodes = model.componentNodes.get(comp.id), voltage = voltageAt(nodes[0]) - voltageAt(nodes[1]);
    let current = 0;
    if(comp.type === 'battery') current = solution[voltageCount + sourceComponents.indexOf(comp)] || 0;
    else if(comp.type === 'led') current = state.ledOn.get(comp.id) ? (voltage - (Number(comp.value) || 2)) / LED_SERIES_R : voltage * 1e-9;
    else current = voltage / componentResistance(comp, state);
    values[comp.id] = {voltage:voltage, current:current};
  });
  return {adjacency:adjacency, includedComponents:includedComponents, ground:ground, voltageAt:voltageAt, values:values, model:model};
}

function analyseCircuit(){
  const batteries = components.filter(function(comp){ return comp.type === 'battery'; });
  if(!batteries.length) return {ok:false, components:{}, messages:[{type:'error', text:'Agregá y conectá una fuente de voltaje para iniciar la simulación.'}]};
  const model = createSimulationModel();
  const primary = batteries[0];
  const primaryNodes = model.componentNodes.get(primary.id);
  if(!primaryNodes || primaryNodes[0] === primaryNodes[1]){
    const results = {}; results[primary.id] = {error:true};
    return {ok:false, components:results, messages:[{type:'error', text:'Cortocircuito: ambos terminales de la fuente están unidos por cables.'}]};
  }

  const state = {burned:new Set(), ledOn:new Map()};
  components.forEach(function(comp){ if(comp.type === 'led') state.ledOn.set(comp.id, true); });
  const burnNotes = [];
  let net = null;
  for(let iteration = 0; iteration < 40; iteration++){
    net = solveNetwork(model, primary, primaryNodes, state);
    if(net.error) return {ok:false, components:{}, messages:[{type:'error', text:net.error}]};
    // 1) Ajustar el estado de cada LED (conduce sólo en directa y por encima de Vf).
    let changed = false;
    net.includedComponents.forEach(function(comp){
      if(comp.type !== 'led') return;
      const value = net.values[comp.id], on = state.ledOn.get(comp.id), vf = Number(comp.value) || 2;
      if(on && value.current < 0){ state.ledOn.set(comp.id, false); changed = true; }
      else if(!on && value.voltage > vf + 1e-6){ state.ledOn.set(comp.id, true); changed = true; }
    });
    if(changed) continue;
    // 2) Quemar lámparas con sobretensión y LEDs con sobrecorriente: se abren y se recalcula.
    let burnedNow = false;
    net.includedComponents.forEach(function(comp){
      const value = net.values[comp.id];
      if(comp.type === 'bulb' && Math.abs(value.voltage) > (Number(comp.value) || 1) * 1.5){
        state.burned.add(comp.id); burnedNow = true;
        burnNotes.push('La lámpara “' + comp.label + '” se quemó: recibió ' + formatElectrical(Math.abs(value.voltage), 'V') + ' y su voltaje nominal es ' + comp.value + ' V. El filamento se cortó y esa rama quedó abierta.');
      }
      if(comp.type === 'led' && value.current > LED_MAX_CURRENT * 2.5){
        state.burned.add(comp.id); burnedNow = true;
        const vf = Number(comp.value) || 2, source = Math.abs(Number(primary.value) || 0);
        const suggested = source > vf ? Math.ceil((source - vf) / LED_MAX_CURRENT) : 0;
        burnNotes.push('El LED “' + comp.label + '” se quemó: le pasaban ' + formatElectrical(value.current, 'A') + ' (máximo ~20 mA).' + (suggested ? ' Poné una resistencia en serie de al menos R = (' + source + ' V − ' + vf + ' V) ÷ 0,02 A ≈ ' + suggested + ' Ω.' : ''));
      }
    });
    if(burnedNow) continue;
    break;
  }

  const results = {};
  net.includedComponents.forEach(function(comp){
    const value = net.values[comp.id];
    const result = {voltage:value.voltage, current:value.current, power:Math.abs(value.voltage * value.current)};
    if(comp.type === 'bulb'){
      const nominal = Number(comp.value) || 1;
      result.brightness = clamp(Math.abs(value.voltage) / nominal, 0, 1.5);
    }
    if(comp.type === 'led'){
      result.on = state.ledOn.get(comp.id);
      result.brightness = result.on ? clamp(value.current / LED_MAX_CURRENT, 0, 1.5) : 0;
      result.power = Math.abs(value.voltage * value.current);
    }
    results[comp.id] = result;
  });
  state.burned.forEach(function(id){
    const comp = findComponent(id), nodes = model.componentNodes.get(id);
    const voltage = nodes ? net.voltageAt(nodes[0]) - net.voltageAt(nodes[1]) : 0;
    results[id] = {voltage:voltage, current:0, power:0, burned:true, error:true, brightness:0};
    if(comp && comp.type === 'led') results[id].on = false;
  });

  const messages = burnNotes.map(function(text){ return {type:'error', text:text}; });
  if(!net.ground) messages.push({type:'info', text:'Sin tierra: se tomó el terminal negativo de la primera fuente como referencia de 0 V.'});
  const returnQueue = [primaryNodes[0]], visited = new Set([primaryNodes[0]]);
  while(returnQueue.length){
    const node = returnQueue.shift();
    net.adjacency[node].forEach(function(edge){
      if(edge.kind === 'source' || edge.kind === 'meter' || visited.has(edge.node)) return;
      visited.add(edge.node); returnQueue.push(edge.node);
    });
  }
  const openCircuit = !visited.has(primaryNodes[1]);
  if(openCircuit){
    results[primary.id].warning = true;
    messages.push({type:'warning', text:'Circuito abierto: la fuente no tiene un camino de retorno a través de una carga. No circula corriente.'});
  }
  const primaryResult = results[primary.id];
  if(primaryResult && Math.abs(primaryResult.current) > 10){
    primaryResult.error = true;
    messages.push({type:'error', text:'Corriente muy alta: posible cortocircuito o resistencia demasiado baja (' + formatElectrical(Math.abs(primaryResult.current), 'A') + ').'});
    net.includedComponents.forEach(function(comp){ if(comp.type === 'switch' || comp.type === 'ammeter') results[comp.id].warning = true; });
  }
  net.includedComponents.forEach(function(comp){
    const result = results[comp.id];
    if(comp.type === 'ammeter' && Math.abs(result.current) > 2 && Math.abs(result.voltage) > 0.5) messages.push({type:'warning', text:'El amperímetro “' + comp.label + '” parece estar en paralelo: tiene resistencia casi nula y provoca un corto. Conectalo en serie.'});
    if(comp.type === 'led' && !result.on && result.voltage < -0.1) messages.push({type:'info', text:'El LED “' + comp.label + '” está en inversa: no conduce. Dalo vuelta (rotalo 180°) para que encienda.'});
    if(comp.type === 'bulb' && result.brightness > 0.02 && result.brightness < 0.4) messages.push({type:'info', text:'La lámpara “' + comp.label + '” brilla poco: recibe ' + formatElectrical(Math.abs(result.voltage), 'V') + ' de sus ' + comp.value + ' V nominales.'});
  });
  const loads = net.includedComponents.filter(function(comp){ return ['resistor','bulb','potentiometer','led'].includes(comp.type); });
  if(!loads.length && !state.burned.size) messages.push({type:'warning', text:'No hay una carga en el circuito. Agregá una resistencia, lámpara o LED para limitar la corriente.'});
  const totalCurrent = Math.abs(primaryResult.current);
  const equivalent = batteries.length === 1 && totalCurrent > 1e-9 ? Math.abs(Number(primary.value)) / totalCurrent : null;
  return {ok:true, components:results, messages:messages, source:primary, totalCurrent:totalCurrent, totalPower:Math.abs(primaryResult.power), loadedComponents:loads.length, equivalentResistance:equivalent, burned:Array.from(state.burned)};
}

// Corriente que circula por un cable (positivo = de a → b). Se toma el extremo que tiene un solo cable conectado.
function wireCurrent(wire){
  if(!simulation || !simulation.ok) return 0;
  function degree(ref){ return wires.filter(function(w){ return refsMatch(w.a, ref) || refsMatch(w.b, ref); }).length; }
  function inflow(ref){
    const comp = findComponent(ref.compId), result = simulation.components[ref.compId];
    if(!comp || !result || comp.type === 'ground' || !Number.isFinite(result.current)) return null;
    return ref.tIdx === 0 ? result.current : -result.current;
  }
  if(degree(wire.b) === 1){ const value = inflow(wire.b); if(value !== null) return value; }
  if(degree(wire.a) === 1){ const value = inflow(wire.a); if(value !== null) return -value; }
  return 0;
}

function flowDuration(current){
  const milliamps = current * 1000;
  return clamp(1.4 / (0.6 + Math.log10(1 + milliamps)), 0.18, 3).toFixed(2);
}

function renderSimulation(){
  const panel = document.getElementById('simulation-panel');
  const header = `<h2>Simulación DC <label class="live-toggle" title="Recalcular automáticamente con cada cambio"><input type="checkbox" id="live-sim" ${liveSimulation ? 'checked' : ''}> En vivo</label></h2>`;
  const bind = function(){
    document.getElementById('live-sim').addEventListener('change', function(e){
      liveSimulation = e.target.checked;
      try { localStorage.setItem(STORAGE_KEY + '-live', liveSimulation ? '1' : '0'); } catch(error) {}
      refreshSimulation(); render(); renderProps(); renderSimulation();
      showToast(liveSimulation ? 'Simulación en vivo activada: el circuito se recalcula solo.' : 'Simulación en vivo desactivada. Usá el botón Simular.');
    });
  };
  if(!simulation){
    panel.innerHTML = header + `<div class="sim-empty">Armá un circuito con una fuente${liveSimulation ? '; los resultados aparecen solos' : ' y presioná <strong>Simular</strong>'}. Se calculan tensiones, corriente y potencia.</div>`;
    bind();
    return;
  }
  const messages = simulation.messages.map(function(message){ return `<div class="sim-message ${message.type}">${message.text}</div>`; }).join('');
  if(!simulation.ok){
    panel.innerHTML = header + `${messages}<div class="sim-empty">Corregí la conexión indicada y probá nuevamente.</div>`;
    bind();
    return;
  }
  const rows = Object.keys(simulation.components).map(function(id){
    const comp = findComponent(Number(id)), result = simulation.components[id];
    if(!comp || !['resistor','potentiometer','bulb','led','ammeter','voltmeter'].includes(comp.type)) return '';
    const shownVoltage = comp.type === 'voltmeter' || comp.type === 'led' ? result.voltage : Math.abs(result.voltage);
    return `<div class="sim-row${result.burned ? ' burned' : ''}"><span>${escapeHTML(comp.label)}</span><b>${formatElectrical(shownVoltage, 'V')}</b><b>${result.burned ? 'quemado' : formatElectrical(Math.abs(result.current), 'A')}</b></div>`;
  }).join('');
  const equivalent = simulation.equivalentResistance !== null && Number.isFinite(simulation.equivalentResistance) ? `<div class="sim-equivalent"><span>Resistencia equivalente</span><b>R<sub>eq</sub> = ${formatElectrical(Math.abs(Number(simulation.source.value)), 'V')} ÷ ${formatElectrical(simulation.totalCurrent, 'A')} = ${formatElectrical(simulation.equivalentResistance, 'Ω')}</b></div>` : '';
  panel.innerHTML = header + `<div class="sim-summary"><div><span>Fuente</span><b>${formatElectrical(Number(simulation.source.value), 'V')}</b></div><div><span>Corriente</span><b>${formatElectrical(simulation.totalCurrent, 'A')}</b></div><div><span>Potencia</span><b>${formatElectrical(simulation.totalPower, 'W')}</b></div></div>${equivalent}${messages}${rows ? `<div class="sim-table-label">Componentes: tensión · corriente</div><div class="sim-results">${rows}</div>` : ''}<div class="sim-tip">Tocá un componente para ver <strong>cómo se calculó</strong> su valor.</div>`;
  bind();
}

function runSimulation(){
  simulation = components.length ? analyseCircuit() : null;
  render();
  renderProps();
  renderSimulation();
  if(!simulation) showToast('Agregá componentes para simular.');
  else showToast(simulation.ok ? 'Simulación actualizada.' : 'La simulación encontró una conexión a revisar.');
}

// ---------- interaction ----------
function refsMatch(a, b){ return a.compId === b.compId && a.tIdx === b.tIdx; }
function wireExists(a, b){ return wires.some(function(w){ return (refsMatch(w.a, a) && refsMatch(w.b, b)) || (refsMatch(w.a, b) && refsMatch(w.b, a)); }); }

function updateConnectionUI(){
  const button = document.getElementById('btn-connect');
  button.classList.toggle('toggled', connectMode);
  button.textContent = connectMode ? 'Terminar conexión' : 'Conectar cables';
  modeBadge.classList.toggle('show', connectMode);
  modeBadge.textContent = pendingTerminal ? 'TERMINAL ELEGIDO — tocá el segundo terminal' : 'MODO CONEXIÓN — tocá dos terminales';
}

function setConnectMode(active){
  connectMode = active;
  pendingTerminal = null;
  updateConnectionUI();
  render();
}

function selectComponent(id){
  selectedId = id;
  selectedWireId = null;
  render();
  renderProps();
}

function selectWire(id){
  selectedWireId = id;
  selectedId = null;
  render();
  renderProps();
}

function clearSelection(){
  selectedId = null;
  selectedWireId = null;
  render();
  renderProps();
}

function deleteComponent(comp){
  const affectedWires = wires.filter(function(w){ return w.a.compId === comp.id || w.b.compId === comp.id; }).length;
  components = components.filter(function(c){ return c.id !== comp.id; });
  wires = wires.filter(function(w){ return w.a.compId !== comp.id && w.b.compId !== comp.id; });
  selectedId = null;
  commitHistory();
  render();
  renderProps();
  showToast(affectedWires ? 'Componente y ' + affectedWires + ' cable(s) eliminados.' : 'Componente eliminado.');
}

function deleteWire(wire){
  wires = wires.filter(function(w){ return w.id !== wire.id; });
  selectedWireId = null;
  commitHistory();
  render();
  renderProps();
  showToast('Cable eliminado.');
}

function deleteSelection(){
  const comp = findComponent(selectedId);
  const wire = findWire(selectedWireId);
  if(comp) deleteComponent(comp);
  else if(wire) deleteWire(wire);
}

function beginPan(e){
  activeDrag = {kind:'pan', startX:e.clientX, startY:e.clientY, viewX:viewport.x, viewY:viewport.y, width:viewport.width, height:viewport.height, moved:false};
}

function connectTerminal(comp, terminalIndex){
  const ref = {compId:comp.id, tIdx:terminalIndex};
  if(!connectMode){ selectComponent(comp.id); return; }
  if(!pendingTerminal){
    pendingTerminal = ref;
    updateConnectionUI();
    render();
    return;
  }
  if(refsMatch(pendingTerminal, ref)){
    pendingTerminal = null;
    updateConnectionUI();
    render();
    return;
  }
  if(wireExists(pendingTerminal, ref)){
    showToast('Esos terminales ya están conectados.');
  } else {
    const wire = normalizeWire({ id:idCounter++, a:pendingTerminal, b:ref });
    wires.push(wire);
    selectedWireId = wire.id;
    selectedId = null;
    commitHistory();
    showToast('Cable creado. Seleccionalo para cambiar su ruta o estilo.');
  }
  pendingTerminal = null;
  updateConnectionUI();
  render();
  renderProps();
}

compLayer.addEventListener('pointerdown', function(e){
  if(spaceKeyDown || e.button === 1){ beginPan(e); e.stopPropagation(); e.preventDefault(); return; }
  if(e.button !== 0) return;
  const terminal = e.target.closest('[data-terminal]');
  const group = e.target.closest('g[data-id]');
  if(!group) return;
  const comp = findComponent(Number(group.getAttribute('data-id')));
  if(!comp) return;
  e.stopPropagation();
  if(terminal){
    connectTerminal(comp, Number(terminal.getAttribute('data-terminal')));
    return;
  }
  const point = svgPoint(e);
  activeDrag = {kind:'component', comp:comp, offsetX:point.x - comp.x, offsetY:point.y - comp.y, moved:false};
  e.preventDefault();
});

wireLayer.addEventListener('pointerdown', function(e){
  if(spaceKeyDown || e.button === 1){ beginPan(e); e.stopPropagation(); e.preventDefault(); return; }
  if(e.button !== 0) return;
  const handle = e.target.closest('[data-route-point]');
  if(handle){
    const wire = findWire(Number(handle.getAttribute('data-wire')));
    if(!wire) return;
    activeDrag = {kind:'route-point', wire:wire, pointIndex:Number(handle.getAttribute('data-route-point')), moved:false};
    e.stopPropagation();
    e.preventDefault();
    return;
  }
  const path = e.target.closest('path[data-wire]');
  if(path){
    selectWire(Number(path.getAttribute('data-wire')));
    e.stopPropagation();
  }
});

wireLayer.addEventListener('dblclick', function(e){
  const handle = e.target.closest('[data-route-point]');
  if(handle){
    const wire = findWire(Number(handle.getAttribute('data-wire')));
    if(wire){
      wire.points.splice(Number(handle.getAttribute('data-route-point')), 1);
      commitHistory(); render(); renderProps(); showToast('Punto de ruta eliminado.');
    }
    e.stopPropagation();
    return;
  }
  const path = e.target.closest('path[data-wire]');
  if(path){
    const wire = findWire(Number(path.getAttribute('data-wire')));
    if(wire){
      addRoutePoint(wire, svgPoint(e));
      selectWire(wire.id);
      commitHistory(); render(); renderProps(); showToast('Punto de ruta agregado. Arrastralo para ajustar el cable.');
    }
    e.stopPropagation();
  }
});

window.addEventListener('pointermove', function(e){
  if(!activeDrag) return;
  if(activeDrag.kind === 'pan'){
    const width = svg.clientWidth || 1, height = svg.clientHeight || 1;
    viewport.x = activeDrag.viewX - (e.clientX - activeDrag.startX) * (activeDrag.width / width);
    viewport.y = activeDrag.viewY - (e.clientY - activeDrag.startY) * (activeDrag.height / height);
    setViewBox();
    activeDrag.moved = true;
    return;
  }
  const point = svgPoint(e);
  if(activeDrag.kind === 'component'){
    const comp = activeDrag.comp, type = TYPES[comp.type];
    comp.x = clamp(snap(point.x - activeDrag.offsetX), 8, 1000 - type.w - 8);
    comp.y = clamp(snap(point.y - activeDrag.offsetY), 12, 700 - type.h - 12);
  } else if(activeDrag.kind === 'route-point'){
    const routePoint = activeDrag.wire.points[activeDrag.pointIndex];
    if(routePoint){ routePoint.x = clamp(snap(point.x), 0, 1000); routePoint.y = clamp(snap(point.y), 0, 700); }
  }
  activeDrag.moved = true;
  render();
});

window.addEventListener('pointerup', function(){
  if(!activeDrag) return;
  const drag = activeDrag;
  activeDrag = null;
  if(drag.kind === 'pan') return;
  if(drag.moved){
    commitHistory();
    if(drag.kind === 'component') selectComponent(drag.comp.id);
    else selectWire(drag.wire.id);
  } else if(drag.kind === 'component'){
    selectComponent(drag.comp.id);
  }
});

svg.addEventListener('pointerdown', function(e){
  if(spaceKeyDown || e.button === 1){ beginPan(e); e.preventDefault(); return; }
  if(e.target === svg || e.target.id === 'grid-bg') clearSelection();
});

svg.addEventListener('wheel', function(e){
  e.preventDefault();
  zoomAt(svgPoint(e), e.deltaY > 0 ? 1.14 : 0.86);
}, {passive:false});

function escapeHTML(value){
  return String(value).replace(/[&<>'"]/g, function(character){ return {'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[character]; });
}

function renderProps(){
  const panel = document.getElementById('props-panel');
  const comp = findComponent(selectedId);
  const wire = findWire(selectedWireId);
  if(!comp && !wire){
    panel.innerHTML = `<h2>Propiedades</h2><div class="empty-hint">Seleccioná un componente para editar sus valores o un cable para cambiar color, grosor y recorrido.</div><div class="workflow-hint"><strong>Rutas de cables</strong><br>Hacé doble clic sobre un cable para crear puntos de ruta. Arrastrá los puntos para ordenar el trazado; doble clic en un punto para quitarlo.</div>`;
    return;
  }
  if(wire){
    normalizeWire(wire);
    const swatches = WIRE_COLORS.map(function(color){ return `<button class="color-swatch ${wire.color === color ? 'active' : ''}" data-wire-color="${color}" style="--swatch:${color}" title="Usar ${color}" aria-label="Usar color ${color}"></button>`; }).join('');
    panel.innerHTML = `
      <div class="comp-title">Cable <span class="tag">#${wire.id}</span></div>
      <div class="field"><label>Etiqueta de red</label><input type="text" id="p-wire-label" maxlength="32" placeholder="Ej. VCC, salida, nodo A" value="${escapeHTML(wire.label)}"></div>
      <div class="field"><label>Color</label><div class="color-controls">${swatches}<input id="p-wire-color" type="color" value="${wire.color}" aria-label="Color personalizado"></div></div>
      <div class="field"><label>Grosor <output id="p-wire-width-value">${wire.width.toFixed(1)} px</output></label><input type="range" id="p-wire-width" min="1" max="8" step="0.5" value="${wire.width}"></div>
      <div class="field"><label>Estilo</label><select id="p-wire-dash"><option value="solid" ${wire.dash === 'solid' ? 'selected' : ''}>Continuo</option><option value="dashed" ${wire.dash === 'dashed' ? 'selected' : ''}>Guiones</option><option value="dotted" ${wire.dash === 'dotted' ? 'selected' : ''}>Punteado</option></select></div>
      <div class="field"><label>Ruta</label><select id="p-wire-route"><option value="auto" ${wire.routeMode === 'auto' ? 'selected' : ''}>Automática (ortogonal)</option><option value="manual" ${wire.routeMode === 'manual' ? 'selected' : ''}>Manual (puntos editables)</option></select><div class="route-note">${wire.routeMode === 'manual' ? 'Arrastrá los puntos blancos del lienzo. Doble clic en un punto lo elimina.' : 'La ruta se reajusta al mover sus componentes.'}</div></div>
      <div class="row-buttons"><button id="p-add-route-point">Añadir punto</button><button id="p-reset-route">Restablecer</button></div>
      <div class="row-buttons"><button class="danger" id="p-delete-wire">Eliminar cable</button><button id="p-deselect">Cerrar</button></div>`;
    const wireLabelInput = document.getElementById('p-wire-label');
    wireLabelInput.addEventListener('input', function(e){ wire.label = e.target.value; render(); });
    wireLabelInput.addEventListener('change', commitHistory);
    document.querySelectorAll('[data-wire-color]').forEach(function(button){ button.addEventListener('click', function(){ wire.color = button.getAttribute('data-wire-color'); commitHistory(); render(); renderProps(); }); });
    const colorInput = document.getElementById('p-wire-color');
    colorInput.addEventListener('input', function(e){ wire.color = e.target.value; render(); });
    colorInput.addEventListener('change', commitHistory);
    const widthInput = document.getElementById('p-wire-width');
    widthInput.addEventListener('input', function(e){ wire.width = Number(e.target.value); document.getElementById('p-wire-width-value').textContent = wire.width.toFixed(1) + ' px'; render(); });
    widthInput.addEventListener('change', commitHistory);
    document.getElementById('p-wire-dash').addEventListener('change', function(e){ wire.dash = e.target.value; commitHistory(); render(); });
    document.getElementById('p-wire-route').addEventListener('change', function(e){ if(e.target.value === 'manual') makeWireManual(wire); else { wire.routeMode = 'auto'; wire.points = []; } commitHistory(); render(); renderProps(); });
    document.getElementById('p-add-route-point').addEventListener('click', function(){ addMidpoint(wire); commitHistory(); render(); renderProps(); });
    document.getElementById('p-reset-route').addEventListener('click', function(){ wire.routeMode = 'auto'; wire.points = []; commitHistory(); render(); renderProps(); showToast('Ruta automática restablecida.'); });
    document.getElementById('p-delete-wire').addEventListener('click', function(){ deleteWire(wire); });
    document.getElementById('p-deselect').addEventListener('click', clearSelection);
    return;
  }
  normalizeComponent(comp);
  const type = TYPES[comp.type];
  let extra = '';
  if(comp.type === 'switch'){
    extra = `<div class="field"><label>Estado</label><select id="p-value"><option value="1" ${comp.value ? 'selected' : ''}>Cerrado (conduce)</option><option value="0" ${!comp.value ? 'selected' : ''}>Abierto (no conduce)</option></select></div>`;
  } else if(type.valueLabel){
    extra = `<div class="field"><label>${type.valueLabel} (${type.unit})</label><input type="number" id="p-value" step="any" min="0" value="${comp.value}"></div>`;
  }
  if(comp.type === 'potentiometer') extra += `<div class="field"><label>Posición del cursor <output id="p-pot-out">${Math.round(comp.position)}% · ${formatElectrical(potResistance(comp), 'Ω')}</output></label><input type="range" id="p-pot" min="0" max="100" step="1" value="${comp.position}"></div>`;
  if(comp.type === 'bulb') extra += `<div class="field"><label>Resistencia del filamento (Ω)</label><input type="number" id="p-bulb-resistance" min="0.001" step="any" value="${comp.resistance}"></div><div class="field-note">Se quema si recibe más de 1,5 × su voltaje nominal.</div>`;
  if(comp.type === 'led') extra += `<div class="field"><label>Color</label><select id="p-led-color">${Object.keys(LED_COLORS).map(function(name){ return `<option value="${name}" ${comp.color === name ? 'selected' : ''}>${name}</option>`; }).join('')}</select></div><div class="field-note">Terminal izquierdo = ánodo (+). Conduce sólo en un sentido y se quema con más de ~50 mA.</div>`;
  if(comp.type === 'ammeter') extra += `<div class="field-note">La lectura se calcula sola al simular. Se conecta <strong>en serie</strong> (resistencia casi nula: ${AMMETER_R} Ω).</div>`;
  if(comp.type === 'voltmeter') extra += `<div class="field-note">La lectura se calcula sola al simular. Se conecta <strong>en paralelo</strong> (resistencia muy alta: 10 MΩ). El terminal izquierdo es el +.</div>`;
  if(comp.type === 'resistor') extra += `<div id="p-color-code">${colorCodeHTML(Number(comp.value))}</div>`;
  panel.innerHTML = `<div class="comp-title">${type.name} <span class="tag">#${comp.id}</span></div>${comp.type !== 'ground' ? `<div class="field"><label>Etiqueta</label><input type="text" id="p-label" value="${escapeHTML(comp.label)}"></div>` : ''}${extra}<div id="p-sim-area">${simulationExplainHTML(comp)}</div><div class="position-readout">Posición: ${comp.x}, ${comp.y} · Rotación: ${comp.rotation}°</div><div class="row-buttons"><button id="p-rotate-left" title="Rotar 90° a la izquierda">↺ Rotar</button><button id="p-rotate-right" title="Rotar 90° a la derecha (R)">Rotar ↻</button></div><div class="row-buttons"><button id="p-duplicate" title="Duplicar (Ctrl + D)">Duplicar</button><button class="danger" id="p-delete">Eliminar</button><button id="p-deselect">Cerrar</button></div>`;
  // Actualiza lienzo y resultados sin reconstruir el panel (así el campo no pierde el foco).
  const liveUpdate = function(){
    if(liveSimulation) simulation = analyseCircuit();
    render(); renderSimulation();
    const area = document.getElementById('p-sim-area');
    if(area){ area.innerHTML = simulationExplainHTML(comp); bindExplainButtons(comp); }
  };
  const labelInput = document.getElementById('p-label');
  if(labelInput){ labelInput.addEventListener('input', function(e){ comp.label = e.target.value; render(); }); labelInput.addEventListener('change', commitHistory); }
  const valueInput = document.getElementById('p-value');
  if(valueInput){
    valueInput.addEventListener('input', function(e){
      const value = Number(e.target.value);
      if(e.target.value === '' || Number.isNaN(value)) return;
      comp.value = comp.type === 'switch' ? value : Math.max(0, value);
      if(comp.type === 'resistor'){ const code = document.getElementById('p-color-code'); if(code) code.innerHTML = colorCodeHTML(comp.value); }
      if(comp.type === 'potentiometer'){ document.getElementById('p-pot-out').textContent = Math.round(comp.position) + '% · ' + formatElectrical(potResistance(comp), 'Ω'); }
      liveUpdate();
    });
    valueInput.addEventListener('change', commitHistory);
  }
  const potInput = document.getElementById('p-pot');
  if(potInput){
    potInput.addEventListener('input', function(e){
      comp.position = Number(e.target.value);
      document.getElementById('p-pot-out').textContent = Math.round(comp.position) + '% · ' + formatElectrical(potResistance(comp), 'Ω');
      liveUpdate();
    });
    potInput.addEventListener('change', commitHistory);
  }
  const ledColor = document.getElementById('p-led-color');
  if(ledColor) ledColor.addEventListener('change', function(e){ comp.color = e.target.value; commitHistory(); render(); });
  const resistanceInput = document.getElementById('p-bulb-resistance');
  if(resistanceInput){
    resistanceInput.addEventListener('input', function(e){ const resistance = Number(e.target.value); if(resistance > 0){ comp.resistance = resistance; liveUpdate(); } });
    resistanceInput.addEventListener('change', function(){ commitHistory(); render(); renderProps(); });
  }
  bindExplainButtons(comp);
  document.getElementById('p-rotate-left').addEventListener('click', function(){ comp.rotation = (comp.rotation + 270) % 360; commitHistory(); render(); renderProps(); });
  document.getElementById('p-rotate-right').addEventListener('click', function(){ comp.rotation = (comp.rotation + 90) % 360; commitHistory(); render(); renderProps(); });
  document.getElementById('p-duplicate').addEventListener('click', function(){ duplicateComponent(comp); });
  document.getElementById('p-delete').addEventListener('click', function(){ deleteComponent(comp); });
  document.getElementById('p-deselect').addEventListener('click', clearSelection);
}

function bindExplainButtons(comp){
  const button = document.getElementById('p-to-triangle');
  if(!button) return;
  button.addEventListener('click', function(){
    const result = simulation.components[comp.id];
    const resistance = comp.type === 'potentiometer' ? potResistance(comp) : comp.type === 'bulb' ? Number(comp.resistance) : Number(comp.value);
    selectTriangleVar('I');
    document.getElementById('tri-input-1').value = Number(Math.abs(result.voltage).toPrecision(4));
    document.getElementById('tri-input-2').value = Number(resistance.toPrecision(4));
    document.getElementById('tri-calc-btn').click();
    document.getElementById('tri-calc').scrollIntoView({behavior:'smooth', block:'center'});
  });
}

// ---------- explicación paso a paso ----------
function simulationExplainHTML(comp){
  const result = simulation && simulation.ok && simulation.components ? simulation.components[comp.id] : null;
  if(!result || !Number.isFinite(result.current)){
    if(comp.type === 'ground') return '';
    return simulation ? `<div class="explain muted">Este componente no forma parte del circuito simulado (revisá sus conexiones).</div>` : '';
  }
  const fV = function(v){ return formatElectrical(v, 'V'); }, fI = function(i){ return formatElectrical(i, 'A'); }, fR = function(r){ return formatElectrical(r, 'Ω'); }, fP = function(p){ return formatElectrical(p, 'W'); };
  const V = Math.abs(result.voltage), I = Math.abs(result.current);
  const head = `<div class="simulation-readout"><span>Simulación</span><b>${fV(result.voltage)} · ${fI(I)} · ${fP(result.power)}</b></div>`;
  let steps = '';
  let triangle = false;
  if(result.burned){
    steps = `<p><b>Está quemado.</b> Ya no conduce: es como un cable cortado, por eso esa rama quedó abierta.</p><p>Bajá la tensión o agregá una resistencia en serie y volvé a simular.</p>`;
  } else if(comp.type === 'resistor' || comp.type === 'potentiometer' || comp.type === 'bulb'){
    const R = comp.type === 'potentiometer' ? potResistance(comp) : comp.type === 'bulb' ? Number(comp.resistance) : Number(comp.value);
    steps = `<p>1. Tensión entre sus terminales: <code>V = ${fV(V)}</code></p>
             <p>2. Ley de Ohm: <code>I = V ÷ R = ${fV(V)} ÷ ${fR(R)} = ${fI(I)}</code></p>
             <p>3. Potencia: <code>P = V × I = ${fV(V)} × ${fI(I)} = ${fP(result.power)}</code></p>`;
    if(comp.type === 'bulb') steps += `<p>Brillo: recibe ${Math.round(V / (Number(comp.value) || 1) * 100)}% de su voltaje nominal (${comp.value} V).</p>`;
    if(comp.type === 'potentiometer') steps += `<p>Con el cursor al ${Math.round(comp.position)}%, usa ${fR(R)} de sus ${fR(Number(comp.value))}. Mové el deslizador y mirá cómo cambia I.</p>`;
    triangle = true;
  } else if(comp.type === 'led'){
    const vf = Number(comp.value) || 2;
    steps = result.on
      ? `<p>1. Un LED encendido mantiene una caída casi fija: <code>Vf ≈ ${fV(vf)}</code> (medido: ${fV(V)}).</p>
         <p>2. La corriente la limita el resto del circuito. Circulan <code>${fI(I)}</code> (${Math.round(I / LED_MAX_CURRENT * 100)}% de los 20 mA nominales).</p>
         <p>3. Para elegir su resistencia: <code>R = (V<sub>fuente</sub> − Vf) ÷ I</code></p>`
      : `<p>El LED está <b>apagado</b>: recibe ${fV(result.voltage)} y necesita al menos ${fV(vf)} en directa (ánodo + a la izquierda).</p>`;
  } else if(comp.type === 'ammeter'){
    steps = `<p>Mide la corriente que pasa a través de él: <code>I = ${fI(I)}</code>.</p><p>Va <b>en serie</b>: tiene casi 0 Ω (${AMMETER_R} Ω), así no cambia el circuito. Su caída es mínima: ${fV(V)}.</p>`;
  } else if(comp.type === 'voltmeter'){
    steps = `<p>Mide la diferencia de potencial entre sus terminales: <code>V = V(+) − V(−) = ${fV(result.voltage)}</code>.</p><p>Va <b>en paralelo</b>: tiene 10 MΩ, por eso casi no toma corriente (${fI(I)}).</p>`;
  } else if(comp.type === 'battery'){
    const req = simulation.equivalentResistance;
    steps = `<p>Entrega <code>I = ${fI(I)}</code> con <code>${fV(Number(comp.value))}</code>.</p>${req ? `<p>Todo el circuito equivale a una sola resistencia: <code>R<sub>eq</sub> = V ÷ I = ${fR(req)}</code></p>` : ''}<p>Potencia entregada: <code>P = V × I = ${fP(result.power)}</code></p>`;
  } else if(comp.type === 'switch'){
    steps = comp.value ? `<p>Cerrado: se comporta como un cable (0,01 Ω). Pasan ${fI(I)}.</p>` : `<p>Abierto: corta el camino, no pasa corriente.</p>`;
  }
  return head + `<details class="explain" open><summary>¿Cómo se calculó?</summary>${steps}${triangle ? '<button class="small" id="p-to-triangle">Probar en el triángulo de Ohm</button>' : ''}</details>`;
}

// ---------- código de colores de resistencias ----------
const BAND_COLORS = [['negro','#111'],['marrón','#7b4a1e'],['rojo','#d22'],['naranja','#f07a12'],['amarillo','#f5d518'],['verde','#2a9d3a'],['azul','#2a5bd7'],['violeta','#8a3fc4'],['gris','#888'],['blanco','#f2f2f2']];
const MULTIPLIER_EXTRA = {'-1':['dorado','#c9a227'], '-2':['plateado','#c0c0c0']};
function colorBands(resistance){
  if(!(resistance > 0)) return null;
  let exponent = Math.floor(Math.log10(resistance)) - 1;
  let digits = Math.round(resistance / Math.pow(10, exponent));
  if(digits >= 100){ digits = Math.round(digits / 10); exponent++; }
  if(exponent < -2 || exponent > 9) return null;
  const multiplier = exponent >= 0 ? BAND_COLORS[exponent] : MULTIPLIER_EXTRA[String(exponent)];
  const bands = [BAND_COLORS[Math.floor(digits / 10)], BAND_COLORS[digits % 10], multiplier, ['dorado (±5%)','#c9a227']];
  return {bands:bands, value:digits * Math.pow(10, exponent)};
}
function colorCodeHTML(resistance){
  const code = colorBands(resistance);
  if(!code) return '';
  const xs = [30, 42, 54, 74];
  const rects = code.bands.map(function(band, index){ return `<rect x="${xs[index]}" y="5" width="6" height="22" fill="${band[1]}"/>`; }).join('');
  const rounded = Math.abs(code.value - resistance) / resistance > 0.001 ? ` <span class="muted">(≈ ${formatElectrical(code.value, 'Ω')})</span>` : '';
  return `<div class="color-code"><svg width="110" height="32" viewBox="0 0 110 32"><path d="M0 16 H22 M88 16 H110" stroke="#aaa" stroke-width="2"/><rect x="22" y="5" width="66" height="22" rx="9" fill="#d9c49a"/>${rects}</svg><div><span>Código de colores</span>${code.bands.map(function(band){ return band[0]; }).join(' · ')}${rounded}</div></div>`;
}

function duplicateComponent(comp){
  const copy = JSON.parse(JSON.stringify(comp));
  copy.id = idCounter++;
  const type = TYPES[comp.type];
  copy.x = clamp(comp.x + 24, 8, 1000 - type.w - 8);
  copy.y = clamp(comp.y + 48, 12, 700 - type.h - 12);
  copy.label = comp.label + ' (copia)';
  components.push(copy);
  selectedId = copy.id; selectedWireId = null;
  commitHistory(); render(); renderProps();
  showToast('Componente duplicado.');
}

// ---------- drag from palette ----------
let lastPaletteDrag = 0;
const LABEL_PREFIX = {resistor:'R', potentiometer:'P', battery:'V', bulb:'L', led:'LED', switch:'S', ammeter:'A', voltmeter:'VM', ground:'GND'};
function autoLabel(type){
  const prefix = LABEL_PREFIX[type] || 'X';
  let number = 1;
  const used = new Set(components.map(function(comp){ return comp.label; }));
  while(used.has(prefix + number)) number++;
  return prefix + number;
}

function addComponentToCanvas(type, point){
  const definition = TYPES[type];
  if(!definition) return;
  const comp = {
    id: idCounter++,
    type:type,
    x: clamp(snap(point.x - definition.w / 2), 8, 1000 - definition.w - 8),
    y: clamp(snap(point.y - definition.h / 2), 12, 700 - definition.h - 12),
    value: definition.default,
    label: autoLabel(type),
    resistance: definition.defaultResistance,
    rotation: 0
  };
  normalizeComponent(comp);
  components.push(comp);
  selectedId = comp.id;
  selectedWireId = null;
  commitHistory();
  render();
  renderProps();
  showToast(definition.name + ' agregado al circuito.');
}

function projectData(){ return {version:2, components:components, wires:wires, idCounter:idCounter}; }

function applyProject(data){
  if(!data || !Array.isArray(data.components) || !Array.isArray(data.wires)) throw new Error('El archivo no tiene un formato de proyecto válido.');
  const validTypes = new Set(Object.keys(TYPES));
  if(data.components.some(function(comp){ return !comp || !validTypes.has(comp.type) || !Number.isFinite(Number(comp.id)); })) throw new Error('El proyecto contiene componentes no compatibles.');
  components = data.components.map(normalizeComponent);
  wires = data.wires.filter(function(wire){ return wire && wire.a && wire.b; }).map(normalizeWire);
  const largestId = components.concat(wires).reduce(function(maximum, item){ return Math.max(maximum, Number(item.id) || 0); }, 0);
  idCounter = Math.max(Number(data.idCounter) || 1, largestId + 1);
  selectedId = null; selectedWireId = null; pendingTerminal = null;
  refreshSimulation();
  history = [snapshot()]; historyIndex = 0;
  persistCircuit(); updateHistoryButtons(); fitCanvas(); updateConnectionUI(); render(); renderProps(); renderSimulation();
}

function encodeProject(data){ return btoa(unescape(encodeURIComponent(JSON.stringify(data)))); }
function decodeProject(value){ return JSON.parse(decodeURIComponent(escape(atob(value)))); }

function loadSharedCircuit(){
  if(typeof location === 'undefined' || !location.hash.startsWith('#circuit=')) return false;
  try { applyProject(decodeProject(decodeURIComponent(location.hash.slice(9)))); return true; }
  catch(error){ showToast('El enlace compartido no es válido o está incompleto.'); return false; }
}

const TEMPLATES = {
  'serie-led': {
    components:[
      {id:1,type:'battery',x:130,y:320,value:9,label:'Fuente 9 V',rotation:0},
      {id:2,type:'resistor',x:395,y:320,value:390,label:'R1',rotation:0},
      {id:3,type:'led',x:665,y:320,value:2,label:'LED1',color:'rojo',rotation:0}
    ],
    wires:[{id:4,a:{compId:1,tIdx:0},b:{compId:2,tIdx:0}},{id:5,a:{compId:2,tIdx:1},b:{compId:3,tIdx:0}},{id:6,a:{compId:3,tIdx:1},b:{compId:1,tIdx:1}}]
  },
  paralelo: {
    components:[
      {id:1,type:'battery',x:120,y:330,value:9,label:'Fuente 9 V',rotation:0},
      {id:2,type:'resistor',x:455,y:180,value:220,label:'R1',rotation:0},
      {id:3,type:'bulb',x:455,y:470,value:9,label:'L1',resistance:30,rotation:0}
    ],
    wires:[{id:4,a:{compId:1,tIdx:0},b:{compId:2,tIdx:0}},{id:5,a:{compId:1,tIdx:0},b:{compId:3,tIdx:0}},{id:6,a:{compId:2,tIdx:1},b:{compId:1,tIdx:1}},{id:7,a:{compId:3,tIdx:1},b:{compId:1,tIdx:1}}]
  },
  divisor: {
    components:[
      {id:1,type:'battery',x:120,y:330,value:12,label:'Fuente 12 V',rotation:0},
      {id:2,type:'resistor',x:405,y:210,value:1000,label:'R1',rotation:0},
      {id:3,type:'resistor',x:405,y:470,value:1000,label:'R2',rotation:0},
      {id:4,type:'ground',x:720,y:520,value:0,label:'Tierra',rotation:0}
    ],
    wires:[{id:5,a:{compId:1,tIdx:0},b:{compId:2,tIdx:0}},{id:6,a:{compId:2,tIdx:1},b:{compId:3,tIdx:0},label:'Vout'},{id:7,a:{compId:3,tIdx:1},b:{compId:1,tIdx:1}},{id:8,a:{compId:3,tIdx:1},b:{compId:4,tIdx:0}}]
  },
  medicion: {
    components:[
      {id:1,type:'battery',x:96,y:320,value:9,label:'Fuente 9 V',rotation:0},
      {id:2,type:'ammeter',x:330,y:176,value:0,label:'A1',rotation:0},
      {id:3,type:'resistor',x:600,y:176,value:470,label:'R1',rotation:0},
      {id:4,type:'voltmeter',x:600,y:400,value:0,label:'VM1',rotation:0},
      {id:5,type:'switch',x:330,y:520,value:1,label:'S1',rotation:0}
    ],
    wires:[{id:6,a:{compId:1,tIdx:0},b:{compId:2,tIdx:0}},{id:7,a:{compId:2,tIdx:1},b:{compId:3,tIdx:0}},{id:8,a:{compId:3,tIdx:0},b:{compId:4,tIdx:0}},{id:9,a:{compId:3,tIdx:1},b:{compId:4,tIdx:1}},{id:10,a:{compId:3,tIdx:1},b:{compId:5,tIdx:1}},{id:11,a:{compId:5,tIdx:0},b:{compId:1,tIdx:1}}]
  },
  dimmer: {
    components:[
      {id:1,type:'battery',x:110,y:320,value:9,label:'Fuente 9 V',rotation:0},
      {id:2,type:'potentiometer',x:380,y:200,value:1000,position:40,label:'P1',rotation:0},
      {id:3,type:'resistor',x:380,y:460,value:220,label:'R1',rotation:0},
      {id:4,type:'led',x:660,y:320,value:2,label:'LED1',color:'verde',rotation:0}
    ],
    wires:[{id:5,a:{compId:1,tIdx:0},b:{compId:2,tIdx:0}},{id:6,a:{compId:2,tIdx:1},b:{compId:4,tIdx:0}},{id:7,a:{compId:4,tIdx:1},b:{compId:3,tIdx:1}},{id:8,a:{compId:3,tIdx:0},b:{compId:1,tIdx:1}}]
  }
};

// ---------- desafíos ----------
function meterOf(type){ return components.find(function(comp){ return comp.type === type; }); }
function simOf(comp){ return comp && simulation && simulation.components ? simulation.components[comp.id] : null; }
function hasErrors(){ return !simulation || !simulation.ok || simulation.messages.some(function(message){ return message.type === 'error'; }); }
const CHALLENGES = [
  {
    title:'Corriente de 20 mA',
    text:'Con la fuente de 9 V, cambiá el valor de R1 para que el amperímetro marque 20 mA (±5%).',
    hint:'Despejá R de la Ley de Ohm: R = V ÷ I = 9 V ÷ 0,02 A.',
    template:{components:[{id:1,type:'battery',x:130,y:320,value:9,label:'Fuente 9 V',rotation:0},{id:2,type:'resistor',x:395,y:200,value:100,label:'R1',rotation:0},{id:3,type:'ammeter',x:665,y:320,value:0,label:'A1',rotation:0}],wires:[{id:4,a:{compId:1,tIdx:0},b:{compId:2,tIdx:0}},{id:5,a:{compId:2,tIdx:1},b:{compId:3,tIdx:0}},{id:6,a:{compId:3,tIdx:1},b:{compId:1,tIdx:1}}]},
    check:function(){ const r = simOf(meterOf('ammeter')); return !hasErrors() && r && Math.abs(Math.abs(r.current) - 0.02) <= 0.001; }
  },
  {
    title:'Encendé el LED sin quemarlo',
    text:'Este LED se quema porque R1 es muy chica. Elegí R1 para que circulen entre 10 y 25 mA.',
    hint:'R = (V fuente − Vf) ÷ I = (9 V − 2 V) ÷ 0,015 A ≈ 470 Ω.',
    template:{components:[{id:1,type:'battery',x:130,y:320,value:9,label:'Fuente 9 V',rotation:0},{id:2,type:'resistor',x:395,y:320,value:47,label:'R1',rotation:0},{id:3,type:'led',x:665,y:320,value:2,label:'LED1',color:'azul',rotation:0}],wires:[{id:4,a:{compId:1,tIdx:0},b:{compId:2,tIdx:0}},{id:5,a:{compId:2,tIdx:1},b:{compId:3,tIdx:0}},{id:6,a:{compId:3,tIdx:1},b:{compId:1,tIdx:1}}]},
    check:function(){ const r = simOf(meterOf('led')); return !hasErrors() && r && r.on && !r.burned && r.current >= 0.01 && r.current <= 0.025; }
  },
  {
    title:'Divisor de 3 V',
    text:'Cambiá R1 y/o R2 para que el voltímetro (sobre R2) marque 3 V (±0,1 V) con la fuente de 12 V.',
    hint:'En serie la tensión se reparte en proporción a las resistencias: V2 = 12 V × R2 ÷ (R1 + R2). Probá R1 = 3 × R2.',
    template:{components:[{id:1,type:'battery',x:110,y:330,value:12,label:'Fuente 12 V',rotation:0},{id:2,type:'resistor',x:405,y:200,value:1000,label:'R1',rotation:0},{id:3,type:'resistor',x:405,y:470,value:1000,label:'R2',rotation:0},{id:4,type:'voltmeter',x:720,y:470,value:0,label:'VM1',rotation:0}],wires:[{id:5,a:{compId:1,tIdx:0},b:{compId:2,tIdx:0}},{id:6,a:{compId:2,tIdx:1},b:{compId:3,tIdx:0}},{id:7,a:{compId:3,tIdx:1},b:{compId:1,tIdx:1}},{id:8,a:{compId:3,tIdx:0},b:{compId:4,tIdx:0}},{id:9,a:{compId:3,tIdx:1},b:{compId:4,tIdx:1}}]},
    check:function(){ const r = simOf(meterOf('voltmeter')); return !hasErrors() && r && Math.abs(Math.abs(r.voltage) - 3) <= 0.1; }
  },
  {
    title:'Paralelo de 100 Ω',
    text:'Elegí R1 y R2 (en paralelo) para que la resistencia equivalente sea 100 Ω: la fuente de 10 V debe entregar 100 mA (±3%).',
    hint:'Dos resistencias iguales en paralelo valen la mitad: R1 = R2 = 200 Ω. Fórmula: Req = R1·R2 ÷ (R1 + R2).',
    template:{components:[{id:1,type:'battery',x:120,y:330,value:10,label:'Fuente 10 V',rotation:0},{id:2,type:'resistor',x:455,y:180,value:1000,label:'R1',rotation:0},{id:3,type:'resistor',x:455,y:470,value:1000,label:'R2',rotation:0}],wires:[{id:4,a:{compId:1,tIdx:0},b:{compId:2,tIdx:0}},{id:5,a:{compId:1,tIdx:0},b:{compId:3,tIdx:0}},{id:6,a:{compId:2,tIdx:1},b:{compId:1,tIdx:1}},{id:7,a:{compId:3,tIdx:1},b:{compId:1,tIdx:1}}]},
    check:function(){ const resistors = components.filter(function(c){ return c.type === 'resistor'; }); return !hasErrors() && resistors.length >= 2 && Math.abs(simulation.totalCurrent - 0.1) <= 0.003; }
  },
  {
    title:'Medí sin romper nada',
    text:'El amperímetro está mal conectado (en paralelo con R1) y provoca un corto. Reconectalo en serie para medir la corriente de R1.',
    hint:'Borrá los cables del amperímetro y armá: + fuente → amperímetro → R1 → − fuente. Todo en una sola “fila”.',
    template:{components:[{id:1,type:'battery',x:130,y:320,value:9,label:'Fuente 9 V',rotation:0},{id:2,type:'resistor',x:450,y:200,value:1000,label:'R1',rotation:0},{id:3,type:'ammeter',x:450,y:440,value:0,label:'A1',rotation:0}],wires:[{id:4,a:{compId:1,tIdx:0},b:{compId:2,tIdx:0}},{id:5,a:{compId:2,tIdx:1},b:{compId:1,tIdx:1}},{id:6,a:{compId:2,tIdx:0},b:{compId:3,tIdx:0}},{id:7,a:{compId:2,tIdx:1},b:{compId:3,tIdx:1}}]},
    check:function(){ const a = simOf(meterOf('ammeter')), r = simOf(components.find(function(c){ return c.type === 'resistor'; })); return !hasErrors() && a && r && Math.abs(a.current) > 0.001 && Math.abs(Math.abs(a.current) - Math.abs(r.current)) / Math.abs(r.current) < 0.01; }
  }
];
let challengeIndex = 0;
function challengeDone(){ try { return JSON.parse(localStorage.getItem(STORAGE_KEY + '-challenges')) || []; } catch(error){ return []; } }
function renderChallenge(feedback){
  const box = document.getElementById('challenge-panel');
  if(!box) return;
  const challenge = CHALLENGES[challengeIndex], done = challengeDone();
  box.innerHTML = `<h2>Desafíos <span class="challenge-count">${done.length}/${CHALLENGES.length}</span></h2>
    <div class="challenge-nav"><button class="small" id="ch-prev" ${challengeIndex === 0 ? 'disabled' : ''}>‹</button><b>${challengeIndex + 1}. ${challenge.title}${done.includes(challengeIndex) ? ' ✓' : ''}</b><button class="small" id="ch-next" ${challengeIndex === CHALLENGES.length - 1 ? 'disabled' : ''}>›</button></div>
    <p class="challenge-text">${challenge.text}</p>
    <div class="row-buttons"><button class="small" id="ch-load">Cargar circuito</button><button class="small primary" id="ch-check">Comprobar</button><button class="small" id="ch-hint">Pista</button></div>
    ${feedback ? `<div class="challenge-feedback ${feedback.ok ? 'ok' : 'bad'}">${feedback.text}</div>` : ''}`;
  document.getElementById('ch-prev').addEventListener('click', function(){ challengeIndex--; renderChallenge(); });
  document.getElementById('ch-next').addEventListener('click', function(){ challengeIndex++; renderChallenge(); });
  document.getElementById('ch-load').addEventListener('click', function(){
    if((components.length || wires.length) && !confirm('¿Reemplazar el circuito actual por el del desafío?')) return;
    applyProject(JSON.parse(JSON.stringify(challenge.template)));
    renderChallenge({ok:false, text:'Circuito cargado. Modificalo y tocá “Comprobar”.'});
  });
  document.getElementById('ch-hint').addEventListener('click', function(){ renderChallenge({ok:false, text:'Pista: ' + challenge.hint}); });
  document.getElementById('ch-check').addEventListener('click', function(){
    simulation = components.length ? analyseCircuit() : null;
    render(); renderProps(); renderSimulation();
    if(challenge.check()){
      const list = challengeDone(); if(!list.includes(challengeIndex)) list.push(challengeIndex);
      try { localStorage.setItem(STORAGE_KEY + '-challenges', JSON.stringify(list)); } catch(error) {}
      renderChallenge({ok:true, text:'¡Correcto! ' + (challengeIndex < CHALLENGES.length - 1 ? 'Pasá al siguiente desafío.' : 'Completaste todos los desafíos.')});
    } else renderChallenge({ok:false, text:'Todavía no. Revisá los valores en el panel de simulación' + (simulation && simulation.messages.some(function(m){ return m.type === 'error'; }) ? ' (hay un error marcado en rojo).' : '.')});
  });
}

const TUTORIAL = [
  {title:'Armá el circuito', copy:'Arrastrá un componente desde la izquierda, o tocá uno en celular. La grilla alinea cada pieza automáticamente.'},
  {title:'Conectá y ordená', copy:'Activá “Conectar cables” y elegí dos terminales. Podés mover componentes, cambiar el estilo de cada cable y dibujar rutas manuales.'},
  {title:'Simulá y aprendé', copy:'Con “En vivo” activado el circuito se recalcula solo: vas a ver la corriente moverse por los cables y las lámparas brillar. Tocá un componente para ver cómo se calculó su valor.'},
  {title:'Miralo en 3D y practicá', copy:'Con “Vista 3D” ves tu circuito como si estuviera armado sobre la mesa (podés girarlo y tocar los interruptores). En “Aprendé” está la teoría con ejemplos y en “Desafíos” ejercicios para practicar. Recordá: es una simulación, nunca experimentes con los 220 V de los enchufes.'}
];

function renderTutorial(){
  const step = TUTORIAL[tutorialIndex];
  document.getElementById('tutorial-step').textContent = 'GUÍA ' + (tutorialIndex + 1) + ' DE ' + TUTORIAL.length;
  document.getElementById('tutorial-title').textContent = step.title;
  document.getElementById('tutorial-copy').textContent = step.copy;
  document.getElementById('tutorial-dots').innerHTML = TUTORIAL.map(function(_, index){ return '<i class="' + (index === tutorialIndex ? 'active' : '') + '"></i>'; }).join('');
  document.getElementById('tutorial-back').disabled = tutorialIndex === 0;
  document.getElementById('tutorial-next').textContent = tutorialIndex === TUTORIAL.length - 1 ? 'Empezar' : 'Siguiente';
}

function openTutorial(){ tutorialIndex = 0; document.getElementById('onboarding').hidden = false; renderTutorial(); }
function closeTutorial(){ document.getElementById('onboarding').hidden = true; try { localStorage.setItem(STORAGE_KEY + '-tutorial', 'seen'); } catch(error) {} }

function setTheme(theme){
  document.body.dataset.theme = theme;
  try { localStorage.setItem(STORAGE_KEY + '-theme', theme); } catch(error) {}
  render(); renderProps();
}

document.querySelectorAll('.palette-item').forEach(item=>{
  item.addEventListener('dragstart', (e)=>{
    e.dataTransfer.setData('type', item.getAttribute('data-type'));
  });
  item.addEventListener('dragend', ()=>{ lastPaletteDrag = Date.now(); });
  item.addEventListener('click', ()=>{
    if(Date.now() - lastPaletteDrag < 500) return;
    const position = 500 + ((components.length % 3) - 1) * 40;
    addComponentToCanvas(item.getAttribute('data-type'), {x:position, y:350 + ((components.length % 2) * 48)});
  });
  item.setAttribute('tabindex', '0');
  item.setAttribute('role', 'button');
  item.addEventListener('keydown', function(e){ if(e.key === 'Enter' || e.key === ' '){ e.preventDefault(); item.click(); } });
});
svg.addEventListener('dragover', (e)=>e.preventDefault());
svg.addEventListener('drop', (e)=>{
  e.preventDefault();
  const type = e.dataTransfer.getData('type');
  if(!type) return;
  const p = svgPoint(e);
  addComponentToCanvas(type, p);
});

// ---------- toolbar ----------
document.getElementById('btn-undo').addEventListener('click', ()=>{
  restoreHistory(historyIndex - 1);
  showToast('Se deshizo la última acción.');
});
document.getElementById('btn-redo').addEventListener('click', ()=>{
  restoreHistory(historyIndex + 1);
  showToast('Se rehízo la acción.');
});
document.getElementById('btn-connect').addEventListener('click', ()=>{
  setConnectMode(!connectMode);
});
document.getElementById('btn-zoom-in').addEventListener('click', ()=>zoomAt({x:viewport.x + viewport.width / 2, y:viewport.y + viewport.height / 2}, 0.82));
document.getElementById('btn-zoom-out').addEventListener('click', ()=>zoomAt({x:viewport.x + viewport.width / 2, y:viewport.y + viewport.height / 2}, 1.22));
document.getElementById('btn-fit').addEventListener('click', fitCanvas);
document.getElementById('btn-simulate').addEventListener('click', runSimulation);
document.getElementById('btn-save-project').addEventListener('click', ()=>{
  download('circuito.ohm.json', JSON.stringify(projectData(), null, 2), 'application/json');
  showToast('Proyecto guardado como JSON.');
});
document.getElementById('btn-open-project').addEventListener('click', ()=>document.getElementById('project-input').click());
document.getElementById('project-input').addEventListener('change', function(e){
  const file = e.target.files && e.target.files[0];
  if(!file) return;
  const reader = new FileReader();
  reader.onload = function(){
    try { applyProject(JSON.parse(reader.result)); showToast('Proyecto abierto correctamente.'); }
    catch(error) { showToast(error.message || 'No se pudo abrir el proyecto.'); }
    e.target.value = '';
  };
  reader.onerror = function(){ showToast('No se pudo leer el archivo seleccionado.'); e.target.value = ''; };
  reader.readAsText(file);
});
document.getElementById('btn-share').addEventListener('click', async ()=>{
  if(location.protocol === 'file:'){
    showToast('Para compartir por enlace, publicá la página en un sitio web. Mientras tanto podés guardar el JSON.');
    return;
  }
  const url = location.origin + location.pathname + '#circuit=' + encodeURIComponent(encodeProject(projectData()));
  try { await navigator.clipboard.writeText(url); showToast('Enlace del circuito copiado al portapapeles.'); }
  catch(error) { window.prompt('Copiá el enlace del circuito:', url); }
});
document.querySelectorAll('.menu-list button').forEach(function(button){ button.addEventListener('click', function(){ const menu = button.closest('details'); if(menu) menu.open = false; }); });
document.addEventListener('click', function(e){ document.querySelectorAll('details.menu[open]').forEach(function(menu){ if(!menu.contains(e.target)) menu.open = false; }); });
function webglAvailable(){
  try { const canvas = document.createElement('canvas'); return !!(window.WebGLRenderingContext && (canvas.getContext('webgl2') || canvas.getContext('webgl'))); }
  catch(error){ return false; }
}
document.getElementById('btn-3d').addEventListener('click', function(){
  if(!components.length){ showToast('Agregá componentes o cargá una plantilla para verlos en 3D.'); return; }
  if(!window.THREE || !window.View3D){ showToast('No se pudo cargar el motor 3D (falta lib/three-bundle.min.js).'); return; }
  if(!webglAvailable()){
    if(window.SiteContent) window.SiteContent.openModal('Vista 3D no disponible', '<p>Esta computadora o navegador no tiene activado <b>WebGL</b>, la tecnología que se usa para dibujar en 3D.</p><ul><li>Probá con una versión actualizada de Chrome, Edge o Firefox.</li><li>En Chrome, revisá que esté activada la opción <i>Configuración → Sistema → Usar aceleración por hardware</i>.</li></ul><p>Todo lo demás del simulador funciona igual.</p>');
    else showToast('Este navegador no permite gráficos 3D (WebGL).');
    return;
  }
  if(!simulation) simulation = analyseCircuit();
  render(); renderSimulation();
  window.View3D.open();
});
document.getElementById('btn-theme').addEventListener('click', ()=>setTheme(document.body.dataset.theme === 'light' ? 'dark' : 'light'));
document.getElementById('btn-help').addEventListener('click', openTutorial);
document.getElementById('btn-clear').addEventListener('click', ()=>{
  if(components.length===0 && wires.length===0) return;
  if(!confirm('¿Borrar todo el circuito?')) return;
  components = []; wires = []; selectedId = null; selectedWireId = null; pendingTerminal = null;
  commitHistory();
  updateConnectionUI();
  render(); renderProps();
  showToast('El lienzo quedó limpio.');
});

document.querySelectorAll('[data-template]').forEach(function(button){
  button.addEventListener('click', function(){
    const template = TEMPLATES[button.getAttribute('data-template')];
    if(!template) return;
    if((components.length || wires.length) && !confirm('¿Reemplazar el circuito actual por esta plantilla?')) return;
    applyProject(template);
    showToast('Plantilla cargada. Podés modificarla y simularla.');
  });
});
document.getElementById('tutorial-back').addEventListener('click', ()=>{ tutorialIndex = Math.max(0, tutorialIndex - 1); renderTutorial(); });
document.getElementById('tutorial-next').addEventListener('click', ()=>{ if(tutorialIndex === TUTORIAL.length - 1) closeTutorial(); else { tutorialIndex++; renderTutorial(); } });
document.getElementById('tutorial-skip').addEventListener('click', closeTutorial);

document.addEventListener('keydown', function(e){
  const view3d = document.getElementById('view3d'), modal = document.getElementById('modal');
  if((view3d && !view3d.hidden) || (modal && !modal.hidden)) return;
  if(document.body.classList.contains('printing-report')) return;
  const typing = /INPUT|SELECT|TEXTAREA/.test(document.activeElement.tagName);
  if(!typing && e.key === ' '){ spaceKeyDown = true; e.preventDefault(); return; }
  if((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z'){
    e.preventDefault();
    restoreHistory(e.shiftKey ? historyIndex + 1 : historyIndex - 1);
    return;
  }
  if((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'd' && !typing){
    e.preventDefault(); const comp = findComponent(selectedId); if(comp) duplicateComponent(comp); return;
  }
  if((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y'){
    e.preventDefault(); restoreHistory(historyIndex + 1); return;
  }
  if(typing) return;
  if(e.key === 'Delete' || e.key === 'Backspace'){ e.preventDefault(); deleteSelection(); }
  if(e.key.toLowerCase() === 'r'){
    const comp = findComponent(selectedId);
    if(comp){ comp.rotation = (comp.rotation + 90) % 360; commitHistory(); render(); renderProps(); }
  }
  if(e.key.toLowerCase() === 'f'){ e.preventDefault(); fitCanvas(); }
  if(e.key === '+' || e.key === '='){ e.preventDefault(); zoomAt({x:viewport.x + viewport.width / 2, y:viewport.y + viewport.height / 2}, 0.82); }
  if(e.key === '-'){ e.preventDefault(); zoomAt({x:viewport.x + viewport.width / 2, y:viewport.y + viewport.height / 2}, 1.22); }
  if(e.key === 'Escape'){
    if(pendingTerminal){ pendingTerminal = null; updateConnectionUI(); render(); }
    else if(selectedId || selectedWireId) clearSelection();
    else if(connectMode) setConnectMode(false);
  }
});
document.addEventListener('keyup', function(e){ if(e.key === ' ') spaceKeyDown = false; });

// ---------- export ----------
function serializeSVG(){
  const clone = svg.cloneNode(true);
  clone.querySelectorAll('.selection-outline, .route-handle, .wire-hit, .flow-path').forEach(function(node){ node.remove(); });
  clone.querySelectorAll('.selected').forEach(function(node){ node.classList.remove('selected'); });
  clone.setAttribute('xmlns','http://www.w3.org/2000/svg');
  clone.setAttribute('width', '1000');
  clone.setAttribute('height', '700');
  const bg = clone.querySelector('#grid-bg');
  const bgFull = document.createElementNS('http://www.w3.org/2000/svg','rect');
  bgFull.setAttribute('x','0'); bgFull.setAttribute('y','0');
  bgFull.setAttribute('width','1000'); bgFull.setAttribute('height','700');
  bgFull.setAttribute('fill','#0a090a');
  clone.insertBefore(bgFull, clone.firstChild);
  return new XMLSerializer().serializeToString(clone);
}
function download(filename, content, mime){
  const blob = new Blob([content], {type:mime});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
document.getElementById('btn-svg').addEventListener('click', ()=>{
  download('circuito.svg', serializeSVG(), 'image/svg+xml');
});
document.getElementById('btn-png').addEventListener('click', ()=>{
  const svgStr = serializeSVG();
  const img = new Image();
  const svg64 = btoa(unescape(encodeURIComponent(svgStr)));
  img.onload = function(){
    const scale = 2;
    const canvas = document.createElement('canvas');
    canvas.width = 1000*scale; canvas.height = 700*scale;
    const ctx = canvas.getContext('2d');
    ctx.scale(scale, scale);
    ctx.drawImage(img, 0, 0, 1000, 700);
    canvas.toBlob((blob)=>{
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = 'circuito.png';
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 'image/png');
  };
  img.src = 'data:image/svg+xml;base64,' + svg64;
});

// ---------- ohm's law triangle ----------
const FORMULAS = {
  V: { formula:'V = I × R', sub:'Voltaje = Intensidad × Resistencia', vars:[['I','Intensidad','A'],['R','Resistencia','Ω']], calc:(a,b)=>a*b },
  R: { formula:'R = V ÷ I', sub:'Resistencia = Voltaje ÷ Intensidad', vars:[['V','Voltaje','V'],['I','Intensidad','A']], calc:(a,b)=>a/b },
  I: { formula:'I = V ÷ R', sub:'Intensidad = Voltaje ÷ Resistencia', vars:[['V','Voltaje','V'],['R','Resistencia','Ω']], calc:(a,b)=>a/b }
};
let activeVar = null;
function selectTriangleVar(variable){
    activeVar = variable;
    document.querySelectorAll('.seg').forEach(function(seg){ seg.classList.toggle('active', seg.getAttribute('data-var') === variable); });
    const f = FORMULAS[activeVar];
    document.getElementById('tri-formula').textContent = f.formula;
    document.getElementById('tri-sub').textContent = f.sub;
    document.getElementById('tri-label-1').textContent = `${f.vars[0][1]} (${f.vars[0][2]})`;
    document.getElementById('tri-label-2').textContent = `${f.vars[1][1]} (${f.vars[1][2]})`;
    document.getElementById('tri-input-1').value = '';
    document.getElementById('tri-input-2').value = '';
    document.getElementById('tri-result').classList.remove('show');
    document.getElementById('tri-calc').classList.add('show');
}
document.querySelectorAll('.seg').forEach(seg=>{
  seg.addEventListener('click', ()=>selectTriangleVar(seg.getAttribute('data-var')));
});
document.getElementById('tri-calc-btn').addEventListener('click', ()=>{
  const f = FORMULAS[activeVar];
  const a = parseFloat(document.getElementById('tri-input-1').value);
  const b = parseFloat(document.getElementById('tri-input-2').value);
  const resultEl = document.getElementById('tri-result');
  if(isNaN(a) || isNaN(b)){
    resultEl.textContent = 'Completá los dos valores.';
    resultEl.classList.add('show');
    return;
  }
  const result = f.calc(a,b);
  const unit = activeVar==='V' ? 'V' : activeVar==='R' ? 'Ω' : 'A';
  resultEl.textContent = Number.isFinite(result) ? `${activeVar} = ${formatElectrical(result, unit)}` : 'No se puede dividir por cero.';
  resultEl.classList.add('show');
});

try { document.body.dataset.theme = localStorage.getItem(STORAGE_KEY + '-theme') || 'dark'; } catch(error) { document.body.dataset.theme = 'dark'; }
try { liveSimulation = localStorage.getItem(STORAGE_KEY + '-live') !== '0'; } catch(error) {}
loadCircuit();
refreshSimulation();
renderChallenge();
fitCanvas();
updateConnectionUI();
render();
renderProps();
renderSimulation();
try { if(!localStorage.getItem(STORAGE_KEY + '-tutorial')) openTutorial(); } catch(error) { /* La guía sigue disponible en el botón de ayuda. */ }
// ---------- API para la vista 3D (view3d.js) ----------
window.CircuitApp = {
  get components(){ return components; },
  get wires(){ return wires; },
  get simulation(){ return simulation; },
  TYPES:TYPES, LED_COLORS:LED_COLORS,
  terminals:terminals, terminalWorldPos:terminalWorldPos, wireRoute:wireRoute, wireCurrent:wireCurrent,
  formatElectrical:formatElectrical, colorBands:colorBands, potResistance:potResistance, valueText:valueText,
  explain:simulationExplainHTML,
  toggleSwitch:function(id){
    const comp = findComponent(id); if(!comp || comp.type !== 'switch') return;
    comp.value = comp.value ? 0 : 1;
    commitHistory();
    if(!simulation) simulation = analyseCircuit();
    render(); renderProps(); renderSimulation();
  },
  setPot:function(id, position, commit){
    const comp = findComponent(id); if(!comp) return;
    comp.position = clamp(position, 0, 100);
    if(commit) commitHistory();
    simulation = analyseCircuit();
    render(); renderSimulation();
  }
};
