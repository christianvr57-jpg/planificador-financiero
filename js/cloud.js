/* =============================================================================
   cloud.js · Sincronización con la nube (GitHub)
   -----------------------------------------------------------------------------
   Guarda el estado completo en un archivo JSON (plan.json) de una rama del
   propio repositorio (por defecto «datos») mediante la API de contenidos de
   GitHub. Cada guardado es un commit, así que el historial de la rama sirve de
   copia de versiones.
   · Leer no necesita token (repositorio público); escribir necesita un token
     de acceso con permiso «Contents: Read and write» sobre el repositorio.
     El token se guarda solo en este navegador y nunca se exporta.
   · Al abrir la página, al volver a la pestaña y cada 30 s se comprueba si
     otro PC ha guardado cambios. Si hay cambios en ambos lados, se pregunta
     qué versión conservar.
   ============================================================================= */
var PFNube = (function () {
  'use strict';
  var CLAVE = 'planificador-financiero/nube';
  var DEF = { owner: 'christianvr57-jpg', repo: 'planificador-financiero', rama: 'datos', ruta: 'plan.json',
              token: '', sha: null, pendiente: false, ultima: null };
  var cfg = null, est = { fase: 'inicio', msg: '' };
  var temporizador = null, subiendo = false, repetir = false, conflictoAbierto = false, ramaCreada = false;

  function cargar() {
    try { cfg = Object.assign({}, DEF, JSON.parse(localStorage.getItem(CLAVE) || '{}')); }
    catch (e) { cfg = Object.assign({}, DEF); }
  }
  function guardar() { try { localStorage.setItem(CLAVE, JSON.stringify(cfg)); } catch (e) { /* nada */ } }
  function fase(f, msg) { est = { fase: f, msg: msg || '' }; if (window.PFApp) PFApp.render(); }

  // UTF-8 ↔ base64 (la API de contenidos trabaja en base64)
  function b64(str) {
    var u = new TextEncoder().encode(str), s = '';
    for (var i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000));
    return btoa(s);
  }
  function desB64(b) {
    var s = atob(String(b).replace(/\s/g, '')), u = new Uint8Array(s.length);
    for (var i = 0; i < s.length; i++) u[i] = s.charCodeAt(i);
    return new TextDecoder().decode(u);
  }

  function api(metodo, ruta, cuerpo) {
    var hd = { Accept: 'application/vnd.github+json' };
    if (cfg.token) hd.Authorization = 'Bearer ' + cfg.token;
    if (cuerpo) hd['Content-Type'] = 'application/json';
    return fetch('https://api.github.com' + ruta, { method: metodo, headers: hd, body: cuerpo ? JSON.stringify(cuerpo) : undefined, cache: 'no-store' })
      .then(function (r) {
        return r.text().then(function (t) {
          var j = null;
          try { j = t ? JSON.parse(t) : null; } catch (e) { /* nada */ }
          if (!r.ok) { var err = new Error((j && j.message) || ('HTTP ' + r.status)); err.status = r.status; throw err; }
          return j;
        });
      });
  }
  function repo() { return '/repos/' + encodeURIComponent(cfg.owner) + '/' + encodeURIComponent(cfg.repo); }
  function rutaArchivo() { return repo() + '/contents/' + cfg.ruta.split('/').map(encodeURIComponent).join('/'); }

  /** Lee el archivo de la nube. Devuelve null si aún no existe. */
  function leer() {
    return api('GET', rutaArchivo() + '?ref=' + encodeURIComponent(cfg.rama))
      .then(function (j) { return { sha: j.sha, estado: PFSchema.migrar(JSON.parse(desB64(j.content))) }; })
      .catch(function (e) { if (e.status === 404) return null; throw e; });
  }
  function crearRama() {
    return api('GET', repo()).then(function (r) {
      return api('GET', repo() + '/git/ref/heads/' + encodeURIComponent(r.default_branch));
    }).then(function (ref) {
      return api('POST', repo() + '/git/refs', { ref: 'refs/heads/' + cfg.rama, sha: ref.object.sha });
    });
  }
  function escribir() {
    var cuerpo = { message: 'Datos del planificador · ' + new Date().toLocaleString('es-ES'), content: b64(PFStore.json()), branch: cfg.rama };
    if (cfg.sha) cuerpo.sha = cfg.sha;
    return api('PUT', rutaArchivo(), cuerpo).then(function (j) { return j.content.sha; })
      .catch(function (e) {
        if (e.status === 404 && /branch/i.test(e.message) && !ramaCreada) { ramaCreada = true; return crearRama().then(escribir); }
        throw e;
      });
  }

  // --------------------------------------------------------- Sincronizar ---
  function subir() {
    if (!cfg.token) return Promise.resolve();
    if (subiendo) { repetir = true; return Promise.resolve(); }
    subiendo = true; clearTimeout(temporizador);
    fase('sync', 'Guardando en la nube…');
    return escribir().then(function (sha) {
      cfg.sha = sha; cfg.pendiente = false; cfg.ultima = new Date().toISOString(); guardar();
      fase('ok');
    }).catch(function (e) {
      if (e.status === 409 || e.status === 422) return leer().then(function (r) { if (r) conflicto(r); else { cfg.sha = null; repetir = true; } });
      if (e.status === 401) { fase('error', 'El token no es válido o ha caducado. Revísalo en Ajustes › Nube.'); return; }
      if (e.status === 403 || e.status === 404) { fase('error', 'El token no tiene permiso para escribir en el repositorio (Contents: Read and write).'); return; }
      fase('error', navigator.onLine === false ? 'Sin conexión: se guardará en la nube al volver.' : 'No se pudo guardar en la nube: ' + e.message);
    }).then(function () {
      subiendo = false;
      if (repetir) { repetir = false; programar(); }
    });
  }
  function programar() { clearTimeout(temporizador); temporizador = setTimeout(subir, 2000); }

  /** Llamado en cada cambio del plan (no en los cambios que vienen de la nube). */
  function alCambiar() {
    cfg.pendiente = true; guardar();
    if (cfg.token) { fase('pendiente', 'Cambios pendientes de subir…'); programar(); }
    else if (est.fase !== 'error') fase('lectura');
  }
  function editadoAqui() {
    if (cfg.pendiente) return true;
    if (cfg.sha) return false;
    var m = PFStore.get().meta;
    return Date.parse(m.modificado) - Date.parse(m.creado) > 2000;
  }
  function aplicar(r, avisar) {
    PFStore.reemplazar(r.estado, 'datos de la nube', { nube: true });
    cfg.sha = r.sha; cfg.pendiente = false; cfg.ultima = new Date().toISOString(); guardar();
    if (avisar) PFUI.toast('Cargados los cambios guardados desde otro PC.', { accion: 'Deshacer', fn: function () { PFStore.undo(); } });
  }
  /** Comprueba la nube y aplica, sube o pregunta según quién tenga cambios. */
  function bajar(silencioso) {
    if (subiendo || conflictoAbierto) return Promise.resolve();
    if (!silencioso) fase('sync', 'Comprobando la nube…');
    return leer().then(function (r) {
      if (!r) {
        if (cfg.token) return subir();
        fase('vacio'); return;
      }
      if (r.sha === cfg.sha) {
        if (cfg.pendiente && cfg.token) return subir();
        fase(cfg.token ? 'ok' : 'lectura'); return;
      }
      var primera = !cfg.sha;
      if (!editadoAqui()) { aplicar(r, !primera); fase(cfg.token ? 'ok' : 'lectura'); return; }
      conflicto(r);
    }).catch(function (e) {
      if (!silencioso || est.fase !== 'error') fase('error', navigator.onLine === false ? 'Sin conexión con la nube.' : 'No se pudo leer la nube: ' + e.message);
    });
  }
  function conflicto(r) {
    if (conflictoAbierto) return;
    conflictoAbierto = true;
    var h = PFFmt.html, F = PFFmt;
    PFUI.modal('<h2>Hay cambios en la nube y en este PC</h2>' +
      '<p>La versión de la nube se guardó el <b>' + h(F.fechaHora(r.estado.meta.modificado)) + '</b> (posiblemente desde otro PC). ' +
      'En este navegador hay cambios del <b>' + h(F.fechaHora(PFStore.get().meta.modificado)) + '</b> que no están en la nube.</p>' +
      '<p>¿Con cuál te quedas? La otra no se pierde del todo: el historial de la nube guarda todas las versiones y aquí puedes deshacer con Ctrl+Z.</p>' +
      '<div class="modal-acc"><button type="button" class="btn" data-res="local">Mantener la de este PC</button>' +
      '<button type="button" class="btn prim" data-res="nube">Usar la de la nube</button></div>')
      .then(function (res) {
        conflictoAbierto = false;
        if (res === 'nube') { aplicar(r); fase(cfg.token ? 'ok' : 'lectura'); PFUI.toast('Cargada la versión de la nube.'); }
        else if (res === 'local') {
          cfg.sha = r.sha; cfg.pendiente = true; guardar();
          if (cfg.token) subir(); else fase('lectura');
        } else fase('conflicto', 'Hay cambios en la nube sin aplicar.');
      });
  }

  // ------------------------------------------------------------- Ajustes ---
  function conectar(token, owner, repoNombre) {
    cfg.token = String(token || '').trim();
    if (owner) cfg.owner = owner.trim();
    if (repoNombre) cfg.repo = repoNombre.trim();
    guardar();
    if (!cfg.token) { fase('lectura'); return Promise.resolve(false); }
    fase('sync', 'Comprobando el token…');
    return api('GET', repo()).then(function (r) {
      if (r.permissions && r.permissions.push === false) throw Object.assign(new Error('sin permiso'), { status: 403 });
      return bajar().then(function () { return true; });
    }).catch(function (e) {
      fase('error', e.status === 401 ? 'El token no es válido.' : e.status === 403 || e.status === 404 ? 'El token no tiene acceso de escritura a ' + cfg.owner + '/' + cfg.repo + '.' : 'No se pudo comprobar el token: ' + e.message);
      return false;
    });
  }
  function desconectar() { cfg.token = ''; guardar(); fase('lectura'); }
  function estado() {
    return { fase: est.fase, msg: est.msg, conectado: !!cfg.token, ultima: cfg.ultima, pendiente: cfg.pendiente,
             owner: cfg.owner, repo: cfg.repo, rama: cfg.rama, ruta: cfg.ruta,
             historial: 'https://github.com/' + cfg.owner + '/' + cfg.repo + '/commits/' + cfg.rama };
  }

  function iniciar() {
    document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'visible') bajar(true); });
    window.addEventListener('online', function () { if (cfg.pendiente && cfg.token) subir(); else bajar(true); });
    window.addEventListener('beforeunload', function (e) {
      if (cfg.token && cfg.pendiente) { subir(); e.preventDefault(); e.returnValue = ''; }
    });
    // Cada 30 s con token; sin token, cada 90 s (la API sin autenticar admite 60 consultas por hora)
    var tic = 0;
    setInterval(function () { tic++; if (document.visibilityState === 'visible' && (cfg.token || tic % 3 === 0)) bajar(true); }, 30000);
    return bajar();
  }

  cargar();
  return { iniciar: iniciar, alCambiar: alCambiar, subir: subir, bajar: bajar, conectar: conectar, desconectar: desconectar, estado: estado };
})();
