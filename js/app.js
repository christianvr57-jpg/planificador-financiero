/* =============================================================================
   app.js · Arranque, ciclo de render, barra lateral, cabecera, barra ¿Y si…?
   y atajos de teclado.
   -----------------------------------------------------------------------------
   Cada cambio del estado (PFStore.update) programa un render. El render calcula
   una sola vez la simulación del escenario activo (y la de la base en modo
   ¿Y si…?) y la pasa como contexto a la sección visible.
   ============================================================================= */
var PFApp = (function () {
  'use strict';
  var C = PFCalc, F = PFFmt, h = PFFmt.html, U = PFUI;

  var SECCIONES = [
    { id: 'resumen', nombre: 'Resumen', tecla: '1' },
    { id: 'presupuesto', nombre: 'Presupuesto 12 meses', tecla: '2' },
    { id: 'whatif', nombre: '¿Y si…?', tecla: '3', modo: true },
    { id: 'inversiones', nombre: 'Inversiones', tecla: '4' },
    { id: 'deudas', nombre: 'Deudas', tecla: '5' },
    { id: 'huchas', nombre: 'Huchas y objetivos', tecla: '6' },
    { id: 'patrimonio', nombre: 'Patrimonio y largo plazo', tecla: '7' },
    { id: 'escenarios', nombre: 'Escenarios', tecla: '8' },
    { id: 'ajustes', nombre: 'Ajustes', tecla: '9' }
  ];
  var pendiente = false, cache = null, revCache = -1, seccionPrevia = null;

  // -------------------------------------------------------------- Contexto ---
  function ctx() {
    var s = PFStore.get(), e = PFStore.esc();
    if (cache && revCache === PFStore.info.revision) { cache.ui = PFStore.getUI(); return cache; }
    var sim = C.simular(e);
    var k = C.kpis(e, sim);
    var w = null;
    if (PFWhatIf.activo()) {
      var b = s.whatif.base, simB = C.simular(b);
      w = { base: b, simBase: simB, kBase: C.kpis(b, simB), diff: C.diferencias(simB, sim), cambios: PFWhatIf.cambios(b, e) };
    }
    cache = { s: s, esc: e, hip: C.hipotesis(e.hipotesis), sim: sim, k: k, w: w, ui: PFStore.getUI(), escala: s.ajustes.escalaAhorro };
    revCache = PFStore.info.revision;
    return cache;
  }
  function invalidar() { revCache = -1; }

  // ---------------------------------------------------------------- Render ---
  function render() {
    if (pendiente) return;
    pendiente = true;
    requestAnimationFrame(function () { pendiente = false; renderAhora(); });
  }
  function renderAhora() {
    var c = ctx();
    aplicarTema(c.s.ajustes.tema);
    U.morph(document.getElementById('sidebar'), htmlSidebar(c));
    U.morph(document.getElementById('topbar'), htmlTopbar(c));
    U.morph(document.getElementById('whatif-bar'), htmlWhatIf(c));
    U.morph(document.getElementById('banners'), htmlAvisosGlobales(c));
    var id = PFUI.secciones[c.ui.seccion] ? c.ui.seccion : 'presupuesto';
    var sec = PFUI.secciones[id];
    var vista = document.getElementById('vista');
    if (seccionPrevia !== id) { PFCharts.limpiar(true); vista.innerHTML = ''; vista.scrollTop = 0; seccionPrevia = id; }
    vista.setAttribute('data-sec', id);
    try {
      U.morph(vista, sec.html(c));
      if (sec.despues) sec.despues(c, vista);
    } catch (err) {
      console.error(err);
      vista.innerHTML = '<div class="vacio"><h2>Algo ha fallado al dibujar esta sección</h2><p>' + h(err.message) + '</p><p>Tus datos siguen guardados. Prueba a deshacer (Ctrl+Z) el último cambio.</p></div>';
    }
    if (window.PFEditor) PFEditor.render(c);
    PFCharts.limpiar();
  }

  var temaAplicado = null;
  function aplicarTema(t) {
    var v = t === 'claro' ? 'light' : t === 'oscuro' ? 'dark' : null;
    if (v === temaAplicado) return;
    temaAplicado = v;
    if (v) document.documentElement.setAttribute('data-theme', v); else document.documentElement.removeAttribute('data-theme');
    PFCharts.limpiar(true);
  }
  function temaEfectivo() {
    var t = PFStore.get().ajustes.tema;
    if (t === 'claro') return 'claro';
    if (t === 'oscuro') return 'oscuro';
    return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'oscuro' : 'claro';
  }

  // ------------------------------------------------------- Barra lateral ---
  function htmlSidebar(c) {
    var wOn = !!c.w;
    var nav = SECCIONES.map(function (s) {
      if (s.modo) {
        return '<button type="button" class="nav-i modo' + (wOn ? ' on' : '') + '" data-act="whatif" aria-pressed="' + wOn + '" data-tip="Activa/desactiva el modo ¿Y si…? (W o 3)">' +
          '<span class="nav-k">' + s.tecla + '</span><span class="nav-n">' + h(s.nombre) + '</span>' + (wOn ? '<span class="pill">activo</span>' : '') + '</button>';
      }
      var on = c.ui.seccion === s.id;
      return '<button type="button" class="nav-i' + (on ? ' on' : '') + '" data-act="nav" data-sec="' + s.id + '"' + (on ? ' aria-current="page"' : '') + '>' +
        '<span class="nav-k">' + s.tecla + '</span><span class="nav-n">' + h(s.nombre) + '</span></button>';
    }).join('');
    var esc = c.s.orden.map(function (id) { return { id: id, nombre: c.s.escenarios[id].nombre }; });
    var info = PFStore.info;
    var dias = PFStore.diasSinCopia();
    var copia = c.s.meta.ultimaCopia ? 'Última copia: ' + (dias < 1 ? 'hoy' : 'hace ' + Math.floor(dias) + (Math.floor(dias) === 1 ? ' día' : ' días')) : 'Aún no has guardado ninguna copia';
    var est = info.error ? '<span class="neg">' + U.icono('alerta') + ' Sin guardar</span>'
      : '<span class="ok">' + U.icono('ok') + ' Guardado automático' + (info.guardado ? ' · ' + info.guardado.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }) : '') + '</span>';
    var oscuro = temaEfectivo() === 'oscuro';
    return '<div class="sb-marca"><span class="logo" aria-hidden="true">€</span><div><b>Planificador</b><small>financiero personal</small></div></div>' +
      '<nav class="sb-nav" aria-label="Secciones">' + nav + '</nav>' +
      '<div class="sb-bloque" data-form="app">' +
      '<label class="sb-l" for="sel-esc">Escenario</label>' +
      '<select id="sel-esc" class="in" data-f="escenario" data-t="sel" data-value="' + h(c.s.escenarioActivo) + '">' + U.opcionesSelect(esc, c.s.escenarioActivo) + '</select>' +
      '</div>' +
      '<div class="sb-bloque sb-estado">' + est + htmlNube() + '<span class="' + (dias > 7 ? 'warn' : '') + '">' + h(copia) + '</span>' +
      (PFStore.nombreArchivoActual() ? '<span class="muted">Archivo: ' + h(PFStore.nombreArchivoActual()) + '</span>' : '') + '</div>' +
      '<div class="sb-acc">' +
      '<button type="button" class="btn sm" data-act="guardar-archivo" data-tip="Guardar en archivo (Ctrl+S)">' + U.icono('guardar') + 'Guardar</button>' +
      '<button type="button" class="btn sm" data-act="abrir-archivo" data-tip="Abrir archivo (Ctrl+O)">' + U.icono('abrir') + 'Abrir</button>' +
      '</div>' +
      '<div class="sb-pie">' +
      '<button type="button" class="btn ghost sm" data-act="tema" data-tip="Cambiar a tema ' + (oscuro ? 'claro' : 'oscuro') + '">' + U.icono(oscuro ? 'sol' : 'luna') + (oscuro ? 'Tema claro' : 'Tema oscuro') + '</button>' +
      '<button type="button" class="btn ghost sm" data-act="atajos" data-tip="Atajos de teclado (?)">?</button>' +
      '<p class="sb-priv">' + U.icono('candado') + (window.PFNube && PFNube.estado().conectado ? 'Sincronizado con GitHub.' : 'Sin token: lo que cambies se queda en este PC.') + '</p></div>';
  }

  /** Estado de la sincronización con la nube para la barra lateral. */
  function htmlNube() {
    if (!window.PFNube) return '';
    var n = PFNube.estado(), hora = n.ultima ? new Date(n.ultima).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }) : '';
    var txt, cls = 'muted', ico = 'info';
    switch (n.fase) {
      case 'ok': txt = 'Nube: sincronizado' + (hora ? ' · ' + hora : ''); cls = 'ok'; ico = 'ok'; break;
      case 'sync': case 'pendiente': txt = 'Nube: ' + (n.msg || 'guardando…').replace(/^\w/, function (x) { return x.toLowerCase(); }); break;
      case 'lectura': txt = n.pendiente ? 'Nube: cambios solo en este PC (falta el token)' : 'Nube: solo lectura (falta el token)'; cls = 'warn'; ico = 'alerta'; break;
      case 'vacio': txt = 'Nube: vacía (añade el token para subir)'; cls = 'warn'; ico = 'alerta'; break;
      case 'error': case 'conflicto': txt = 'Nube: ' + n.msg; cls = 'neg'; ico = 'alerta'; break;
      default: txt = 'Nube: conectando…';
    }
    return '<button type="button" class="sb-nube ' + cls + '" data-act="nav" data-sec="ajustes" data-tip="Configurar la nube en Ajustes">' + U.icono(ico) + h(txt) + '</button>';
  }

  // ------------------------------------------------------------ Cabecera ---
  var SUBTITULOS = {
    resumen: 'Tu situación de un vistazo: indicadores, gráficos y avisos.',
    presupuesto: 'Doble clic, Enter o empieza a escribir para editar un mes. Puedes sumar varios gastos: 40+25,50.',
    inversiones: 'Proyección por activo y total con tres escenarios. Estimaciones, no garantías.',
    deudas: 'Cuadro de amortización, amortización anticipada y estrategias.',
    huchas: 'Ahorro finalista para gastos anuales y objetivos con fecha.',
    patrimonio: 'Patrimonio neto proyectado hasta 40 años y seguimiento real frente al plan.',
    escenarios: 'Guarda versiones completas de tu plan y compáralas.',
    ajustes: 'Hipótesis por defecto, impuestos, apariencia y copias de seguridad.'
  };
  function htmlTopbar(c) {
    var s = SECCIONES.filter(function (x) { return x.id === c.ui.seccion; })[0] || SECCIONES[1];
    return '<div class="tb-t"><h1>' + h(s.nombre) + '</h1><p class="tb-sub">' + h(SUBTITULOS[s.id] || '') + '</p></div>' +
      '<div class="tb-acc">' +
      '<button type="button" class="btn ico-b" data-act="undo"' + (PFStore.puedeDeshacer() ? '' : ' disabled') + ' data-tip="Deshacer (Ctrl+Z)" aria-label="Deshacer">' + U.icono('deshacer') + '</button>' +
      '<button type="button" class="btn ico-b" data-act="redo"' + (PFStore.puedeRehacer() ? '' : ' disabled') + ' data-tip="Rehacer (Ctrl+Y)" aria-label="Rehacer">' + U.icono('rehacer') + '</button>' +
      '<button type="button" class="btn wi-btn' + (c.w ? ' on' : '') + '" data-act="whatif" aria-pressed="' + !!c.w + '">' +
      (c.w ? 'Salir de ¿Y si…?' : '¿Y si…?') + ' <kbd>W</kbd></button>' +
      '</div>';
  }

  // ---------------------------------------------------------- Barra ¿Y si? ---
  function htmlWhatIf(c) {
    if (!c.w) return '';
    var d = c.w.diff, cam = c.w.cambios;
    var desde = c.s.whatif.desde ? new Date(c.s.whatif.desde).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }) : '';
    function k(etq, v, tip, dec) { return '<div class="wi-k" data-tip="' + h(tip) + '"><span>' + etq + '</span>' + U.delta(v, { dec: dec || 0 }) + '</div>'; }
    var expl = 'Comparando con tu situación de partida' + (desde ? ' (congelada a las ' + desde + ')' : '') + '. Nada es definitivo hasta que pulses Aplicar.' +
      (cam.eliminadas.length ? '\nEliminadas: ' + cam.eliminadas.join(', ') : '') + (cam.otros.length ? '\nTambién cambian: ' + cam.otros.join(', ') : '');
    return '<div class="wi" role="region" aria-label="Modo ¿Y si…?">' +
      '<div class="wi-t" data-tip="' + h(expl) + '"><span class="wi-badge">¿Y si…?</span><span>' + (cam.n ? cam.n + (cam.n === 1 ? ' cambio' : ' cambios') : 'sin cambios aún') + '</span></div>' +
      '<div class="wi-ks">' +
      k('Ahorro anual', d.ahorroAnual, 'Diferencia de ahorro en los primeros 12 meses del plan', 2) +
      k('Saldo a fin de año', d.saldoFin, 'Diferencia del saldo en cuenta al cabo de 12 meses', 2) +
      k('Patrimonio a 10 años', d.pat10, 'Diferencia de patrimonio neto nominal a 10 años (en euros de hoy: ' + F.eur0(d.pat10Real, { signo: true }) + ')') +
      k('Patrimonio a 20 años', d.pat20, 'Diferencia de patrimonio neto nominal a 20 años (en euros de hoy: ' + F.eur0(d.pat20Real, { signo: true }) + ')') +
      '</div>' +
      '<div class="wi-acc">' +
      '<button type="button" class="btn sm" data-act="wi-prescindibles" data-tip="Desactiva todos los gastos marcados como prescindibles para ver el ahorro máximo posible">Quitar lo prescindible</button>' +
      '<button type="button" class="btn sm" data-act="wi-descartar">Descartar</button>' +
      '<button type="button" class="btn sm" data-act="wi-guardar">Guardar como escenario…</button>' +
      '<button type="button" class="btn sm prim" data-act="wi-aplicar">Aplicar</button>' +
      '</div></div>';
  }

  // ------------------------------------------------- Avisos globales -------
  function htmlAvisosGlobales(c) {
    var out = '', info = PFStore.info, ui = c.ui;
    if (info.error) out += '<div class="banner error">' + U.icono('alerta') + '<span>' + h(info.error) + '</span><button type="button" class="btn sm" data-act="exportar">Exportar copia</button></div>';
    var dias = PFStore.diasSinCopia();
    var pospuesto = ui.recordatorioHasta && Date.now() < ui.recordatorioHasta;
    if (dias > 7 && !pospuesto) {
      out += '<div class="banner warn">' + U.icono('guardar') + '<span>' + (c.s.meta.ultimaCopia ? 'Llevas ' + Math.floor(dias) + ' días sin guardar una copia de seguridad.' : 'Aún no has guardado ninguna copia de seguridad.') +
        ' Los datos viven en este navegador: si borras su historial, se pierden.</span>' +
        '<button type="button" class="btn sm prim" data-act="guardar-archivo">Guardar copia</button><button type="button" class="btn sm ghost" data-act="posponer-copia">Mañana</button></div>';
    }
    return out;
  }

  // ------------------------------------------------------------ Acciones ---
  function irA(sec) {
    PFStore.setUI({ seccion: sec });
  }
  function toggleWhatIf() {
    if (PFWhatIf.activo()) salirWhatIf();
    else { PFWhatIf.activar(); U.toast('Modo ¿Y si…? activado: tu situación actual queda congelada como referencia.'); }
  }
  function salirWhatIf() {
    var c = ctx();
    if (!c.w || !c.w.cambios.n) { PFWhatIf.descartar(); return; }
    U.modal('<h2>Salir del modo ¿Y si…?</h2><p>Tienes ' + c.w.cambios.n + (c.w.cambios.n === 1 ? ' cambio' : ' cambios') + ' respecto a tu situación de partida. ¿Qué quieres hacer con ' + (c.w.cambios.n === 1 ? 'él' : 'ellos') + '?</p>' +
      '<div class="modal-acc"><button type="button" class="btn" data-res="no">Seguir probando</button>' +
      '<button type="button" class="btn" data-res="descartar">Descartar</button><button type="button" class="btn prim" data-res="aplicar">Aplicar</button></div>')
      .then(function (r) {
        if (r === 'descartar') { PFWhatIf.descartar(); U.toast('Cambios descartados.'); }
        else if (r === 'aplicar') { PFWhatIf.aplicar(); U.toast('Cambios aplicados.'); }
      });
  }
  function enlazarAcciones() {
    U.accion('nav', function (el) { irA(el.getAttribute('data-sec')); });
    U.accion('whatif', toggleWhatIf);
    U.accion('wi-descartar', function () { PFWhatIf.descartar(); U.toast('Cambios descartados: vuelves a tu situación de partida.'); });
    U.accion('wi-aplicar', function () { PFWhatIf.aplicar(); U.toast('Cambios aplicados a «' + PFStore.esc().nombre + '».'); });
    U.accion('wi-prescindibles', function () {
      var n = PFWhatIf.quitarPrescindibles();
      U.toast(n ? n + ' gastos prescindibles desactivados.' : 'No quedan gastos prescindibles activos.');
    });
    U.accion('wi-guardar', function () {
      U.pedirTexto({ titulo: 'Guardar como escenario', texto: 'Se crea un escenario nuevo con estos cambios y «' + PFStore.esc().nombre + '» vuelve a su situación de partida.', valor: PFStore.esc().nombre + ' (variante)', ok: 'Guardar' })
        .then(function (nombre) {
          if (!nombre) return;
          var id = PFWhatIf.guardarComo(nombre);
          U.toast('Escenario «' + nombre + '» guardado.', { accion: 'Abrirlo', fn: function () { PFStore.update(function (s) { s.escenarioActivo = id; }, { etiqueta: 'cambiar escenario' }); } });
        });
    });
    U.accion('undo', function () { var e = PFStore.undo(); if (e) U.toast('Deshecho: ' + e); });
    U.accion('redo', function () { var e = PFStore.redo(); if (e) U.toast('Rehecho: ' + e); });
    U.accion('tema', function () {
      var nuevo = temaEfectivo() === 'oscuro' ? 'claro' : 'oscuro';
      PFStore.update(function (s) { s.ajustes.tema = nuevo; }, { etiqueta: 'tema' });
    });
    U.accion('guardar-archivo', guardarArchivo);
    U.accion('abrir-archivo', abrirArchivo);
    U.accion('exportar', function () { PFStore.exportar(); U.toast('Copia descargada.'); });
    U.accion('posponer-copia', function () { PFStore.setUI({ recordatorioHasta: Date.now() + 864e5 }); });
    U.accion('atajos', mostrarAtajos);
    U.formulario('app', function (id, campo, v) {
      if (campo === 'escenario') {
        if (PFWhatIf.activo()) { U.toast('Termina el modo ¿Y si…? (Aplicar o Descartar) antes de cambiar de escenario.', { tipo: 'error' }); render(); return; }
        PFStore.update(function (s) { s.escenarioActivo = v; }, { etiqueta: 'cambiar escenario' });
      }
    });
  }
  function guardarArchivo() {
    PFStore.guardarArchivo().then(function (r) {
      if (!r || r.cancelado) return;
      U.toast(r.modo === 'archivo' ? 'Guardado en «' + r.nombre + '».' : 'Copia descargada como «' + r.nombre + '» (en tu carpeta de descargas).');
    });
  }
  function abrirArchivo() {
    PFStore.abrirArchivo().then(function (r) {
      if (!r) return;
      var n = Object.keys(r.estado.escenarios).length;
      return U.confirmar({ titulo: 'Abrir «' + r.nombre + '»', texto: 'Contiene ' + n + (n === 1 ? ' escenario' : ' escenarios') + '. Sustituirá los datos actuales (podrás deshacerlo con Ctrl+Z).', ok: 'Abrir y sustituir' })
        .then(function (sí) { if (sí) { PFStore.reemplazar(r.estado, 'abrir archivo'); U.toast('Datos cargados de «' + r.nombre + '».'); } });
    }).catch(function (e) { U.toast(e.message || 'No se pudo abrir el archivo.', { tipo: 'error', ms: 6000 }); });
  }
  function mostrarAtajos() {
    var filas = [
      ['1 – 9', 'Ir a cada sección (3 activa ¿Y si…?)'], ['W', 'Activar / salir del modo ¿Y si…?'], ['N', 'Nueva partida'],
      ['Ctrl + Z / Ctrl + Y', 'Deshacer / rehacer'], ['Ctrl + S', 'Guardar en archivo'], ['Ctrl + O', 'Abrir archivo'],
      ['Flechas', 'Moverse por la tabla del presupuesto'], ['Enter / F2 / escribir', 'Editar la celda'], ['Enter', 'Confirmar y bajar'],
      ['Tab / Mayús + Tab', 'Confirmar y moverse a la derecha / izquierda'], ['Mayús + Enter', 'Usar el importe como regla para todos los meses'],
      ['Supr', 'Quitar el ajuste de la celda (vuelve a la regla)'], ['Esc', 'Cancelar edición / cerrar panel'], ['?', 'Esta ayuda']
    ];
    U.info('Atajos de teclado', '<table class="tabla-simple">' + filas.map(function (f) { return '<tr><td><kbd>' + h(f[0]) + '</kbd></td><td>' + h(f[1]) + '</td></tr>'; }).join('') + '</table>');
  }

  // ------------------------------------------------------------- Teclado ---
  function enlazarTeclado() {
    document.addEventListener('keydown', function (e) {
      var ctrl = e.ctrlKey || e.metaKey, k = e.key;
      var escribe = U.escribiendo(document.activeElement);
      if (document.querySelector('dialog[open]')) return;
      if (k === 'Escape' && window.PFEditor && PFEditor.abierto() && !(e.target.closest && e.target.closest('.bt'))) {
        // Confirma el campo que se estaba editando (change al perder el foco) y cierra el panel
        if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
        PFEditor.cerrar(); e.preventDefault(); return;
      }
      if (ctrl && !e.altKey) {
        var kl = k.toLowerCase();
        if (kl === 's') { e.preventDefault(); guardarArchivo(); return; }
        if (kl === 'o') { e.preventDefault(); abrirArchivo(); return; }
        if (escribe) return; // en un campo, deshacer nativo del texto
        if (kl === 'z' && !e.shiftKey) { e.preventDefault(); U.acciones.undo(); return; }
        if (kl === 'y' || (kl === 'z' && e.shiftKey)) { e.preventDefault(); U.acciones.redo(); return; }
        return;
      }
      if (escribe || e.altKey) return;
      if (k === 'Escape') { if (window.PFEditor && PFEditor.abierto()) { PFEditor.cerrar(); e.preventDefault(); } return; }
      // En la tabla, los números y la navegación los gestiona la propia tabla
      if (e.target.closest && e.target.closest('.bt td[data-k]') && !/^[wWnN?]$/.test(k)) return;
      if (k === '?') { mostrarAtajos(); e.preventDefault(); return; }
      if (k === 'w' || k === 'W') { toggleWhatIf(); e.preventDefault(); return; }
      if (k === 'n' || k === 'N') { e.preventDefault(); if (window.PFPresupuesto) PFPresupuesto.nuevaPartida('variables'); return; }
      var s = SECCIONES.filter(function (x) { return x.tecla === k; })[0];
      if (s) { e.preventDefault(); if (s.modo) toggleWhatIf(); else irA(s.id); }
    });
  }

  // ---------------------------------------------------------------- Inicio ---
  function iniciar() {
    PFStore.iniciar();
    U.enlazar();
    enlazarAcciones();
    enlazarTeclado();
    PFStore.on(function (o) {
      if (o.silencioso) { U.morph(document.getElementById('sidebar'), htmlSidebar(ctx())); return; }
      // Todo cambio del plan (no de interfaz ni el que llega de la nube) se sube a la nube
      if (!o.ui && !o.nube && !o.copia && window.PFNube) PFNube.alCambiar();
      render();
    });
    if (window.matchMedia) window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', function () { temaAplicado = undefined; render(); });
    window.addEventListener('resize', function () { render(); });
    if (PFStore.info.error) U.toast(PFStore.info.error, { tipo: 'error', ms: 8000 });
    renderAhora();
    if (window.PFNube) PFNube.iniciar();
  }

  return { iniciar: iniciar, render: render, renderAhora: renderAhora, ctx: ctx, invalidar: invalidar, irA: irA, SECCIONES: SECCIONES, temaEfectivo: temaEfectivo };
})();
