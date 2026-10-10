/* =============================================================================
   store.js · Estado único, deshacer/rehacer, autoguardado y copias de seguridad
   -----------------------------------------------------------------------------
   · Todo cambio pasa por PFStore.update(fn, {etiqueta, agrupar}).
   · Deshacer/rehacer con instantáneas JSON (máx. 200). Los cambios con la
     misma clave `agrupar` en menos de 1,5 s forman un único paso (deslizadores).
   · Autoguardado en localStorage (300 ms). Estado de interfaz aparte (no se deshace).
   · Copias: exportar/importar JSON y guardar/abrir archivo (File System Access
     API si existe; si no, descarga clásica y selector de archivo).
   ============================================================================= */
var PFStore = (function () {
  'use strict';
  var CLAVE = 'planificador-financiero/estado';
  var CLAVE_UI = 'planificador-financiero/ui';
  var MAX_HIST = 200;

  var estado = null, ui = null;
  var deshacer = [], rehacer = [];
  var ultimaAgrupacion = null, ultimaVez = 0;
  var oyentes = [];
  var temporizador = null;
  var archivo = null; // FileSystemFileHandle
  var info = { guardado: null, error: null, almacenamiento: true, revision: 0 };

  // ------------------------------------------------------------- Arranque ---
  function iniciar() {
    var crudo = null;
    try { crudo = localStorage.getItem(CLAVE); } catch (e) { info.almacenamiento = false; }
    if (crudo) {
      try { estado = PFSchema.migrar(JSON.parse(crudo)); }
      catch (e) {
        // Datos dañados: se conservan aparte para no perderlos y se empieza de nuevo
        try { localStorage.setItem(CLAVE + '/danado-' + Date.now(), crudo); } catch (e2) { /* nada */ }
        info.error = 'No se pudieron leer los datos guardados (' + e.message + '). Se guardó una copia aparte.';
        estado = PFSchema.estadoInicial();
      }
    } else {
      estado = PFSchema.estadoInicial();
      guardarAhora();
    }
    try { ui = JSON.parse(localStorage.getItem(CLAVE_UI) || 'null'); } catch (e) { ui = null; }
    ui = Object.assign({ seccion: 'presupuesto' }, ui || {});
  }

  // --------------------------------------------------------------- Lectura ---
  function get() { return estado; }
  function esc() { return estado.escenarios[estado.escenarioActivo]; }
  function getUI() { return ui; }
  function setUI(parche, silencioso) {
    Object.assign(ui, parche);
    try { localStorage.setItem(CLAVE_UI, JSON.stringify(ui)); } catch (e) { /* nada */ }
    if (!silencioso) emitir({ ui: true });
  }

  // ------------------------------------------------------------- Escritura ---
  /**
   * Aplica un cambio. fn(estado, escenarioActivo) muta el estado.
   * opt: { etiqueta, agrupar: 'clave' }  → mismo paso de deshacer si se repite seguido.
   */
  function update(fn, opt) {
    opt = opt || {};
    var ahora = Date.now();
    var agrupa = opt.agrupar && opt.agrupar === ultimaAgrupacion && (ahora - ultimaVez) < 1500;
    var antes = JSON.stringify(estado);
    fn(estado, esc());
    if (JSON.stringify(estado) === antes) return false; // sin cambios reales
    if (!agrupa) {
      deshacer.push({ json: antes, etiqueta: opt.etiqueta || 'cambio' });
      if (deshacer.length > MAX_HIST) deshacer.shift();
      rehacer = [];
    }
    ultimaAgrupacion = opt.agrupar || null; ultimaVez = ahora;
    estado.meta.modificado = new Date().toISOString();
    info.revision++;
    programarGuardado();
    emitir(opt);
    return true;
  }
  function puedeDeshacer() { return deshacer.length > 0; }
  function puedeRehacer() { return rehacer.length > 0; }
  function undo() {
    if (!deshacer.length) return null;
    var paso = deshacer.pop();
    rehacer.push({ json: JSON.stringify(estado), etiqueta: paso.etiqueta });
    estado = JSON.parse(paso.json);
    ultimaAgrupacion = null; info.revision++;
    programarGuardado(); emitir({ deshacer: true });
    return paso.etiqueta;
  }
  function redo() {
    if (!rehacer.length) return null;
    var paso = rehacer.pop();
    deshacer.push({ json: JSON.stringify(estado), etiqueta: paso.etiqueta });
    estado = JSON.parse(paso.json);
    ultimaAgrupacion = null; info.revision++;
    programarGuardado(); emitir({ rehacer: true });
    return paso.etiqueta;
  }
  /** Reemplaza todo el estado (importar). Se puede deshacer. */
  function reemplazar(nuevo, etiqueta) {
    deshacer.push({ json: JSON.stringify(estado), etiqueta: etiqueta || 'importar' });
    rehacer = [];
    estado = nuevo; info.revision++;
    programarGuardado(); emitir({ reemplazo: true });
  }

  // ------------------------------------------------------------ Guardado ---
  function programarGuardado() {
    clearTimeout(temporizador);
    temporizador = setTimeout(guardarAhora, 300);
  }
  function guardarAhora() {
    try {
      localStorage.setItem(CLAVE, JSON.stringify(estado));
      info.guardado = new Date(); info.error = null; info.almacenamiento = true;
    } catch (e) {
      info.almacenamiento = false;
      info.error = 'El navegador no deja guardar (' + (e.name || e.message) + '). Exporta una copia para no perder cambios.';
    }
    emitir({ guardado: true, silencioso: true });
  }
  function on(fn) { oyentes.push(fn); }
  function emitir(opt) { oyentes.forEach(function (f) { try { f(opt || {}); } catch (e) { console.error(e); } }); }

  // ------------------------------------------------------ Copias de datos ---
  function nombreArchivo() {
    var d = new Date(), z = function (n) { return (n < 10 ? '0' : '') + n; };
    return 'planificador-' + d.getFullYear() + '-' + z(d.getMonth() + 1) + '-' + z(d.getDate()) + '.json';
  }
  function json() { return JSON.stringify(estado, null, 2); }
  function marcarCopia() {
    estado.meta.ultimaCopia = new Date().toISOString();
    programarGuardado();
  }
  function diasSinCopia() {
    var ref = estado.meta.ultimaCopia || estado.meta.creado;
    return (Date.now() - new Date(ref).getTime()) / 864e5;
  }
  function descargar(texto, nombre) {
    var blob = new Blob([texto], { type: 'application/json' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url; a.download = nombre; a.style.display = 'none';
    document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(url); a.remove(); }, 1000);
  }
  /** Exportar JSON: siempre descarga un archivo nuevo con la fecha. */
  function exportar() {
    descargar(json(), nombreArchivo());
    marcarCopia(); emitir({ copia: true });
    return { ok: true, modo: 'descarga', nombre: nombreArchivo() };
  }
  var hayFSA = typeof window !== 'undefined' && typeof window.showSaveFilePicker === 'function';
  /** Guardar en archivo: reescribe el mismo archivo si ya se eligió uno (Ctrl+S). */
  function guardarArchivo(comoNuevo) {
    if (!hayFSA) return Promise.resolve(exportar());
    var paso = (!archivo || comoNuevo)
      ? window.showSaveFilePicker({ suggestedName: archivo ? archivo.name : nombreArchivo(),
          types: [{ description: 'Planificador financiero (JSON)', accept: { 'application/json': ['.json'] } }] })
      : Promise.resolve(archivo);
    return paso.then(function (h) {
      archivo = h;
      return h.createWritable();
    }).then(function (w) {
      return w.write(json()).then(function () { return w.close(); });
    }).then(function () {
      marcarCopia(); emitir({ copia: true });
      return { ok: true, modo: 'archivo', nombre: archivo.name };
    }).catch(function (e) {
      if (e && e.name === 'AbortError') return { ok: false, cancelado: true };
      // Sin permiso o API bloqueada (p. ej. algunos navegadores en file://): descarga clásica
      hayFSA = false;
      return exportar();
    });
  }
  function leerTexto(texto) {
    var datos;
    try { datos = JSON.parse(texto); } catch (e) { throw new Error('El archivo no es un JSON válido.'); }
    return PFSchema.migrar(datos);
  }
  /** Abrir archivo: devuelve el estado leído (sin aplicarlo) para confirmar antes. */
  function abrirArchivo() {
    if (typeof window.showOpenFilePicker === 'function') {
      return window.showOpenFilePicker({ types: [{ description: 'Planificador financiero (JSON)', accept: { 'application/json': ['.json'] } }] })
        .then(function (hs) { archivo = hs[0]; return hs[0].getFile(); })
        .then(function (f) { return f.text().then(function (t) { return { estado: leerTexto(t), nombre: f.name }; }); })
        .catch(function (e) {
          if (e && e.name === 'AbortError') return null;
          if (e && /JSON|planificador|versión|escenarios|datos/.test(e.message)) throw e;
          return abrirClasico();
        });
    }
    return abrirClasico();
  }
  function abrirClasico() {
    return new Promise(function (ok, ko) {
      var inp = document.createElement('input');
      inp.type = 'file'; inp.accept = '.json,application/json';
      inp.onchange = function () {
        var f = inp.files && inp.files[0];
        if (!f) return ok(null);
        var r = new FileReader();
        r.onload = function () { try { ok({ estado: leerTexto(r.result), nombre: f.name }); } catch (e) { ko(e); } };
        r.onerror = function () { ko(new Error('No se pudo leer el archivo.')); };
        r.readAsText(f);
      };
      inp.click();
    });
  }
  function nombreArchivoActual() { return archivo ? archivo.name : null; }

  return {
    iniciar: iniciar, get: get, esc: esc, getUI: getUI, setUI: setUI, update: update, on: on,
    undo: undo, redo: redo, puedeDeshacer: puedeDeshacer, puedeRehacer: puedeRehacer, reemplazar: reemplazar,
    guardarAhora: guardarAhora, info: info, exportar: exportar, guardarArchivo: guardarArchivo, abrirArchivo: abrirArchivo,
    importar: abrirClasico, diasSinCopia: diasSinCopia, nombreArchivoActual: nombreArchivoActual, json: json
  };
})();
