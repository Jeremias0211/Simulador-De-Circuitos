// Contenido del sitio: sección "Aprendé", reporte para el docente, créditos, privacidad y licencias.
// ============================================================================================
//  DATOS DEL PROYECTO — completá estos campos antes de publicar (los vacíos no se muestran).
// ============================================================================================
const SITE_INFO = {
  titulo: 'Simulador de Circuitos — Ley de Ohm',
  autores: ['Jeremias'],            // Ej.: ['Jeremias Torres', 'Nombre Apellido']
  escuela: '',                      // Ej.: 'E.E.S.T. N.º 1'
  materia: '',                      // Ej.: 'Electrotecnia'
  curso: '',                        // Ej.: '4.º 2.ª'
  docente: '',                      // Ej.: 'Prof. Nombre Apellido'
  anio: 2026,
  repositorio: 'https://github.com/Jeremias0211/Simulador-De-Circuitos',
  sitio: 'https://jeremias0211.github.io/Simulador-De-Circuitos/'
};

(function(){
  'use strict';
  const modal = document.getElementById('modal');
  const modalTitle = document.getElementById('modal-title');
  const modalBody = document.getElementById('modal-body');
  let lastFocus = null;

  function openModal(title, html, wide){
    lastFocus = document.activeElement;
    modalTitle.textContent = title;
    modalBody.innerHTML = html;
    modal.classList.toggle('wide', !!wide);
    modal.hidden = false;
    document.getElementById('modal-close').focus();
  }
  function closeModal(){
    modal.hidden = true;
    if(lastFocus && lastFocus.focus) lastFocus.focus();
  }
  document.getElementById('modal-close').addEventListener('click', closeModal);
  modal.addEventListener('click', function(e){ if(e.target === modal) closeModal(); });
  document.addEventListener('keydown', function(e){ if(!modal.hidden && e.key === 'Escape'){ e.stopPropagation(); closeModal(); } }, true);

  function loadExample(project){
    if((components.length || wires.length) && !confirm('¿Reemplazar el circuito actual por el ejemplo?')) return;
    applyProject(JSON.parse(JSON.stringify(project)));
    closeModal();
    showToast('Ejemplo cargado. Tocá los componentes para ver los cálculos.');
  }
  function goToChallenge(index){
    challengeIndex = index; renderChallenge(); closeModal();
    const panel = document.getElementById('challenge-panel');
    panel.scrollIntoView({behavior:'smooth', block:'center'});
    panel.classList.add('flash'); setTimeout(function(){ panel.classList.remove('flash'); }, 1400);
  }

  // ---------------------------------------------------------------- Aprendé
  const LESSONS = [
    {
      title:'1. Tensión, corriente y resistencia',
      html:`<p>Para que funcione un circuito hacen falta tres cosas:</p>
        <ul>
          <li><b>Tensión (V)</b>, se mide en <b>voltios (V)</b>. Es el “empuje” que da la fuente a las cargas eléctricas. Una pila común tiene 1,5 V; la de la placa del ejemplo, 9 V.</li>
          <li><b>Corriente (I)</b>, se mide en <b>amperes (A)</b>. Es la cantidad de carga que pasa por un punto cada segundo. 1 mA = 0,001 A.</li>
          <li><b>Resistencia (R)</b>, se mide en <b>ohms (Ω)</b>. Es cuánto se opone un material al paso de la corriente. 1 kΩ = 1000 Ω.</li>
        </ul>
        <p class="analogy"><b>Comparación con el agua:</b> la tensión es la presión del tanque, la corriente es el caudal que pasa por el caño y la resistencia es un caño finito que frena el paso.</p>
        <p>Para que circule corriente el circuito tiene que estar <b>cerrado</b>: un camino completo que sale del + de la fuente y vuelve al −.</p>`,
      example:'serie-led'
    },
    {
      title:'2. La Ley de Ohm',
      html:`<p>Georg Ohm descubrió que, en una resistencia, la corriente es proporcional a la tensión:</p>
        <div class="formula">V = I × R</div>
        <p>Despejando se obtienen las otras dos:</p>
        <div class="formula">I = V ÷ R &nbsp;&nbsp;&nbsp; R = V ÷ I</div>
        <p><b>Ejemplo:</b> con una fuente de 9 V y una resistencia de 450 Ω circula I = 9 V ÷ 450 Ω = 0,02 A = <b>20 mA</b>.</p>
        <p>Si duplicás la tensión, se duplica la corriente. Si duplicás la resistencia, la corriente baja a la mitad.</p>
        <p class="tip">Usá el triángulo de la derecha: tapá la letra que buscás y queda la fórmula.</p>`,
      challenge:0
    },
    {
      title:'3. Potencia eléctrica',
      html:`<p>La <b>potencia (P)</b> es la energía que consume un componente por segundo. Se mide en <b>watts (W)</b>.</p>
        <div class="formula">P = V × I</div>
        <p>Combinándola con la Ley de Ohm también vale <b>P = I² × R</b> y <b>P = V² ÷ R</b>.</p>
        <p><b>Ejemplo:</b> una lámpara con 9 V a la que le pasan 0,3 A consume P = 9 V × 0,3 A = <b>2,7 W</b>.</p>
        <p>Toda esa energía se transforma en luz y calor. Por eso, si un componente recibe más potencia de la que soporta, <b>se quema</b>: probá subirle la tensión a la lámpara del ejemplo.</p>`,
      example:'paralelo'
    },
    {
      title:'4. Circuito en serie',
      html:`<p>Los componentes están <b>uno detrás del otro</b>, en un único camino.</p>
        <ul>
          <li>Por todos pasa <b>la misma corriente</b>.</li>
          <li>La tensión de la fuente <b>se reparte</b>: V = V1 + V2 + …</li>
          <li>Las resistencias <b>se suman</b>: R<sub>eq</sub> = R1 + R2 + …</li>
        </ul>
        <p><b>Divisor de tensión:</b> con dos resistencias iguales cada una recibe la mitad de la tensión. En general, V2 = V × R2 ÷ (R1 + R2).</p>
        <p class="tip">Si se corta un componente en serie (por ejemplo, se quema una lámpara), se abre el circuito y se apaga todo.</p>`,
      example:'divisor', challenge:2
    },
    {
      title:'5. Circuito en paralelo',
      html:`<p>Los componentes están conectados <b>a los mismos dos puntos</b>, formando varios caminos.</p>
        <ul>
          <li>Todos reciben <b>la misma tensión</b>.</li>
          <li>La corriente total <b>se reparte</b> entre las ramas: I = I1 + I2 + …</li>
          <li>La resistencia equivalente es <b>menor que la más chica</b>: 1 ÷ R<sub>eq</sub> = 1 ÷ R1 + 1 ÷ R2 + …</li>
        </ul>
        <p>Para dos resistencias: R<sub>eq</sub> = (R1 × R2) ÷ (R1 + R2). Dos de 200 Ω en paralelo equivalen a 100 Ω.</p>
        <p class="tip">Así están conectados los enchufes de una casa: si se quema una lámpara, las demás siguen andando.</p>`,
      example:'paralelo', challenge:3
    },
    {
      title:'6. Cómo medir: amperímetro y voltímetro',
      html:`<ul>
          <li>El <b>amperímetro</b> mide corriente. Se conecta <b>en serie</b>: hay que “abrir” el circuito y hacer pasar la corriente a través de él. Tiene resistencia casi nula.</li>
          <li>El <b>voltímetro</b> mide tensión. Se conecta <b>en paralelo</b>, con una punta a cada lado del componente. Tiene una resistencia muy alta.</li>
        </ul>
        <p class="warn"><b>Error común:</b> poner el amperímetro en paralelo. Como casi no tiene resistencia, provoca un cortocircuito (y en la vida real puede quemar el fusible del tester).</p>`,
      example:'medicion', challenge:4
    },
    {
      title:'7. El LED',
      html:`<p>Un LED es un diodo que emite luz. Tiene dos diferencias con una lámpara:</p>
        <ul>
          <li>Tiene <b>polaridad</b>: sólo conduce si el <b>ánodo (+, pata larga)</b> va hacia el + de la fuente.</li>
          <li>Mantiene una caída casi fija, la <b>tensión directa Vf</b> (≈ 2 V los rojos; ≈ 3 V los azules y blancos).</li>
        </ul>
        <p>Siempre necesita una <b>resistencia en serie</b> que limite la corriente (un LED común soporta unos 20 mA):</p>
        <div class="formula">R = (V<sub>fuente</sub> − Vf) ÷ I</div>
        <p><b>Ejemplo:</b> con 9 V, R = (9 V − 2 V) ÷ 0,02 A = 350 Ω → se usa el valor comercial siguiente: 390 Ω.</p>`,
      example:'serie-led', challenge:1
    },
    {
      title:'8. Potenciómetro',
      html:`<p>Es una <b>resistencia variable</b>: girando la perilla cambia su valor entre 0 Ω y su máximo.</p>
        <p>Se usa para regular el volumen de un parlante o el brillo de una luz (<b>dimmer</b>). Al aumentar su resistencia, por la Ley de Ohm, <b>baja la corriente</b> y la luz brilla menos.</p>
        <p class="tip">En el ejemplo, seleccioná el potenciómetro y mové el deslizador: vas a ver cambiar la corriente en vivo. También funciona en la vista 3D.</p>`,
      example:'dimmer'
    },
    {
      title:'9. Seguridad eléctrica',
      html:`<p class="warn"><b>La electricidad de los enchufes (220 V) puede matar.</b> Nunca abras aparatos enchufados ni metas objetos en los tomacorrientes.</p>
        <ul>
          <li>Para practicar de verdad usá <b>pilas o baterías de baja tensión</b> (1,5 V a 12 V) y siempre con la supervisión de un docente.</li>
          <li><b>No hagas cortocircuitos con pilas o baterías</b>: se calientan mucho, pueden derramar químicos y las de litio pueden incendiarse.</li>
          <li>Trabajá con las manos secas, sobre una superficie que no conduzca, y desconectá la fuente antes de cambiar conexiones.</li>
          <li>Si algo se calienta, huele a quemado o hace humo: desconectalo y avisá a un adulto.</li>
        </ul>
        <p>Este simulador sirve para equivocarse sin riesgo: acá podés quemar todos los LED que quieras.</p>`
    }
  ];

  function openLessons(index){
    index = index || 0;
    const nav = LESSONS.map(function(lesson, i){ return `<button class="lesson-link ${i === index ? 'active' : ''}" data-lesson="${i}">${lesson.title}</button>`; }).join('');
    const lesson = LESSONS[index];
    const actions = [];
    if(lesson.example) actions.push(`<button class="primary" id="lesson-example">Probalo en el simulador</button>`);
    if(lesson.challenge !== undefined) actions.push(`<button id="lesson-challenge">Ir al desafío ${lesson.challenge + 1}</button>`);
    openModal('Aprendé', `<div class="lessons"><nav class="lesson-nav" aria-label="Temas">${nav}</nav><article class="lesson"><h3>${lesson.title}</h3>${lesson.html}<div class="lesson-actions">${actions.join('')}</div><div class="lesson-pager">${index > 0 ? `<button class="ghost" data-lesson="${index - 1}">‹ Anterior</button>` : '<span></span>'}${index < LESSONS.length - 1 ? `<button class="ghost" data-lesson="${index + 1}">Siguiente ›</button>` : ''}</div></article></div>`, true);
    modalBody.querySelectorAll('[data-lesson]').forEach(function(button){ button.addEventListener('click', function(){ openLessons(Number(button.getAttribute('data-lesson'))); modalBody.scrollTop = 0; }); });
    const example = document.getElementById('lesson-example');
    if(example) example.addEventListener('click', function(){ loadExample(TEMPLATES[lesson.example]); });
    const challenge = document.getElementById('lesson-challenge');
    if(challenge) challenge.addEventListener('click', function(){ goToChallenge(lesson.challenge); });
  }

  // ---------------------------------------------------------------- Créditos, privacidad y licencias
  function aboutHTML(){
    const rows = [
      ['Autor' + (SITE_INFO.autores.length > 1 ? 'es' : ''), SITE_INFO.autores.join(', ')],
      ['Escuela', SITE_INFO.escuela], ['Materia', SITE_INFO.materia], ['Curso', SITE_INFO.curso], ['Docente', SITE_INFO.docente], ['Año', SITE_INFO.anio]
    ].filter(function(row){ return row[1]; }).map(function(row){ return `<div><dt>${row[0]}</dt><dd>${escapeHTML(row[1])}</dd></div>`; }).join('');
    return `<p>Simulador educativo de circuitos de corriente continua, hecho como proyecto escolar para aprender la Ley de Ohm armando, midiendo y viendo circuitos en 3D.</p>
      <dl class="about-list">${rows}</dl>
      <h3>¿Cómo calcula?</h3>
      <p>Resuelve el circuito con <b>análisis nodal</b> (las leyes de Kirchhoff escritas como un sistema de ecuaciones). Las lámparas y resistencias se modelan con la Ley de Ohm, el LED como un diodo con tensión directa fija y los instrumentos con su resistencia interna. Es un modelo simplificado pensado para aprender: los componentes reales tienen más detalles.</p>
      <p class="safety-inline">⚠ Es una simulación: nunca experimentes con la electricidad de los enchufes (220 V).</p>
      <p>Código fuente: <a href="${SITE_INFO.repositorio}" target="_blank" rel="noopener">${SITE_INFO.repositorio.replace('https://', '')}</a></p>`;
  }
  function privacyHTML(){
    return `<p><b>Este sitio no recolecta ningún dato personal.</b></p>
      <ul>
        <li>No hay registro, cuentas, publicidad, cookies ni estadísticas de visitas.</li>
        <li>No se conecta a otros servidores: todos los archivos (fuentes, motor 3D) están dentro del sitio.</li>
        <li>Tu circuito, el tema elegido y los desafíos resueltos se guardan <b>sólo en este navegador</b> (almacenamiento local) para que no pierdas tu trabajo. Nadie más puede verlos.</li>
        <li>El nombre que escribas en el reporte para el docente <b>no se guarda</b>: sólo aparece en la hoja que imprimís.</li>
        <li>El botón “Copiar enlace” guarda el circuito dentro del propio enlace; sólo lo ve quien lo reciba.</li>
      </ul>
      <p>El sitio está alojado en GitHub Pages, que como cualquier servidor web puede registrar datos técnicos de las visitas (como la dirección IP) según su propia política de privacidad.</p>
      <div class="row-buttons"><button class="danger" id="clear-local">Borrar mis datos guardados en este navegador</button></div>`;
  }
  function licensesHTML(){
    return `<ul class="license-list">
        <li><b>Three.js</b> — motor 3D. © 2010-2024 three.js authors. Licencia MIT. <a href="lib/LICENSE-three.txt" target="_blank">Ver licencia</a></li>
        <li><b>Inter</b> — tipografía de Rasmus Andersson y colaboradores. SIL Open Font License 1.1. <a href="fonts/LICENSE-Inter.txt" target="_blank">Ver licencia</a></li>
        <li><b>JetBrains Mono</b> — tipografía de JetBrains. SIL Open Font License 1.1. <a href="fonts/LICENSE-JetBrainsMono.txt" target="_blank">Ver licencia</a></li>
      </ul>
      <p>El resto del código y los contenidos son obra de ${escapeHTML(SITE_INFO.autores.join(', '))}${SITE_INFO.escuela ? ' (' + escapeHTML(SITE_INFO.escuela) + ')' : ''}.</p>`;
  }
  function openInfo(tab){
    const tabs = {about:['Acerca de', aboutHTML], privacy:['Privacidad', privacyHTML], licenses:['Licencias', licensesHTML]};
    const nav = Object.keys(tabs).map(function(key){ return `<button class="tab ${key === tab ? 'active' : ''}" data-tab="${key}">${tabs[key][0]}</button>`; }).join('');
    openModal(SITE_INFO.titulo, `<div class="tabs" role="tablist">${nav}</div>${tabs[tab][1]()}`);
    modalBody.querySelectorAll('[data-tab]').forEach(function(button){ button.addEventListener('click', function(){ openInfo(button.getAttribute('data-tab')); }); });
    const clear = document.getElementById('clear-local');
    if(clear) clear.addEventListener('click', function(){
      if(!confirm('Se borrarán el circuito guardado, el tema y los desafíos resueltos de este navegador. ¿Continuar?')) return;
      try { Object.keys(localStorage).filter(function(key){ return key.indexOf(STORAGE_KEY) === 0; }).forEach(function(key){ localStorage.removeItem(key); }); } catch(error) {}
      location.hash = ''; location.reload();
    });
  }

  // ---------------------------------------------------------------- Reporte para el docente
  function circuitImageForPrint(){
    const previous = document.body.dataset.theme;
    document.body.dataset.theme = 'light';
    render();
    let markup = serializeSVG().replace('fill="#0a090a"', 'fill="#ffffff"');
    document.body.dataset.theme = previous;
    render();
    // Recorta la imagen al tamaño del circuito.
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    components.forEach(function(comp){ const t = TYPES[comp.type]; minX = Math.min(minX, comp.x); minY = Math.min(minY, comp.y); maxX = Math.max(maxX, comp.x + t.w); maxY = Math.max(maxY, comp.y + t.h); });
    wires.forEach(function(wire){ wireRoute(wire).forEach(function(point){ minX = Math.min(minX, point.x); minY = Math.min(minY, point.y); maxX = Math.max(maxX, point.x); maxY = Math.max(maxY, point.y); }); });
    if(Number.isFinite(minX)){
      const doc = new DOMParser().parseFromString(markup, 'image/svg+xml');
      const root = doc.documentElement;
      root.setAttribute('viewBox', (minX - 40) + ' ' + (minY - 40) + ' ' + (maxX - minX + 80) + ' ' + (maxY - minY + 110));
      root.removeAttribute('width'); root.removeAttribute('height');
      markup = new XMLSerializer().serializeToString(root);
    }
    return markup;
  }
  function openReport(){
    openModal('Reporte para el docente', `<p>Completá tus datos y generá una hoja con los desafíos resueltos y tu circuito actual. Podés imprimirla o guardarla como PDF para entregarla en el aula virtual.</p>
      <div class="report-form">
        <div class="field"><label for="r-name">Nombre y apellido</label><input type="text" id="r-name" maxlength="60" autocomplete="off"></div>
        <div class="field"><label for="r-course">Curso / división</label><input type="text" id="r-course" maxlength="30" autocomplete="off" value="${escapeHTML(SITE_INFO.curso)}"></div>
        <div class="field"><label for="r-notes">Comentario (opcional)</label><input type="text" id="r-notes" maxlength="160" autocomplete="off" placeholder="Ej.: armé un divisor de tensión de 3 V"></div>
      </div>
      <p class="muted small">Estos datos no se guardan: sólo aparecen en la hoja impresa.</p>
      <div class="row-buttons"><button class="primary" id="r-print">Imprimir / guardar PDF</button></div>`);
    document.getElementById('r-name').focus();
    document.getElementById('r-print').addEventListener('click', function(){
      const name = document.getElementById('r-name').value.trim();
      if(!name){ document.getElementById('r-name').focus(); showToast('Escribí tu nombre para el reporte.'); return; }
      buildReport(name, document.getElementById('r-course').value.trim(), document.getElementById('r-notes').value.trim());
      closeModal();
      document.body.classList.add('printing-report');
      setTimeout(function(){ window.print(); }, 60);
    });
  }
  window.addEventListener('afterprint', function(){ document.body.classList.remove('printing-report'); });

  function buildReport(name, course, notes){
    if(components.length && !simulation) simulation = analyseCircuit();
    const done = challengeDone();
    const today = new Date().toLocaleDateString('es-AR', {day:'2-digit', month:'long', year:'numeric'});
    const challengeRows = CHALLENGES.map(function(challenge, index){ return `<tr><td>${index + 1}. ${challenge.title}</td><td class="center">${done.includes(index) ? '✔ Resuelto' : '—'}</td></tr>`; }).join('');
    let resultRows = '';
    if(simulation && simulation.ok){
      resultRows = components.filter(function(comp){ return simulation.components[comp.id] && comp.type !== 'ground'; }).map(function(comp){
        const r = simulation.components[comp.id];
        return `<tr><td>${escapeHTML(comp.label)}</td><td>${TYPES[comp.type].name}</td><td>${formatElectrical(Math.abs(r.voltage), 'V')}</td><td>${r.burned ? 'quemado' : formatElectrical(Math.abs(r.current), 'A')}</td><td>${formatElectrical(r.power, 'W')}</td></tr>`;
      }).join('');
    }
    const meta = [SITE_INFO.escuela, SITE_INFO.materia, SITE_INFO.docente].filter(Boolean).map(escapeHTML).join(' · ');
    document.getElementById('print-report').innerHTML = `
      <header><h1>Reporte de actividad — Ley de Ohm</h1>${meta ? `<p>${meta}</p>` : ''}</header>
      <table class="report-head"><tr><td><b>Alumno/a:</b> ${escapeHTML(name)}</td><td><b>Curso:</b> ${escapeHTML(course) || '__________'}</td><td><b>Fecha:</b> ${today}</td></tr></table>
      <h2>Desafíos (${done.length} de ${CHALLENGES.length} resueltos)</h2>
      <table><thead><tr><th>Desafío</th><th>Estado</th></tr></thead><tbody>${challengeRows}</tbody></table>
      ${components.length ? `<h2>Circuito actual</h2><div class="report-circuit">${circuitImageForPrint()}</div>` : ''}
      ${resultRows ? `<h2>Resultados de la simulación</h2>${simulation.equivalentResistance ? `<p>Fuente: ${formatElectrical(Number(simulation.source.value), 'V')} · Corriente total: ${formatElectrical(simulation.totalCurrent, 'A')} · R<sub>eq</sub> = ${formatElectrical(simulation.equivalentResistance, 'Ω')}</p>` : ''}<table><thead><tr><th>Componente</th><th>Tipo</th><th>Tensión</th><th>Corriente</th><th>Potencia</th></tr></thead><tbody>${resultRows}</tbody></table>` : ''}
      ${notes ? `<h2>Comentario del alumno/a</h2><p>${escapeHTML(notes)}</p>` : ''}
      <h2>Observaciones del docente</h2><div class="report-lines"></div>
      <footer>Generado con ${escapeHTML(SITE_INFO.titulo)} — ${SITE_INFO.sitio}</footer>`;
  }

  // ---------------------------------------------------------------- botones
  document.getElementById('btn-learn').addEventListener('click', function(){ openLessons(0); });
  document.getElementById('btn-report').addEventListener('click', openReport);
  document.getElementById('btn-about').addEventListener('click', function(){ openInfo('about'); });
  document.querySelectorAll('[data-open]').forEach(function(button){ button.addEventListener('click', function(){ openInfo(button.getAttribute('data-open')); }); });

  window.SiteContent = {openLessons:openLessons, openInfo:openInfo, openReport:openReport, openModal:openModal, closeModal:closeModal};
})();
