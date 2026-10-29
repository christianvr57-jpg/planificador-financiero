/* =============================================================================
   cloud.js · Sincronización con la nube (GitHub)
   -----------------------------------------------------------------------------
   En la rama «datos» del repositorio se guardan dos documentos:
     · perfiles/<perfil>.json  datos del perfil, CIFRADOS con su contraseña.
     · compartido.json         gastos en pareja (común a los dos perfiles).
   Cada guardado es un commit, así que el historial de la rama guarda versiones.
   · Leer no necesita token (repositorio público); escribir necesita un token
     con permiso «Contents: Read and write». El token vive solo en el navegador.
   · Al entrar, al volver a la pestaña y cada 30 s se miran los cambios hechos
     en otro PC. Perfil: si hay cambios en los dos lados, se pregunta. Libro
     común: se fusiona solo (gana la edición más reciente de cada movimiento).
   ============================================================================= */
var PFNube = (function () {
  'use strict';
  var CLAVE = 'planificador-financiero/nube';
  var DEF = { owner: 'christianvr57-jpg', repo: 'planificador-financiero', rama: 'datos', token: '', docs: {}, ultima: null };
  var cfg = null, est = { fase: 'inicio', msg: '' };
  var temporizador = null, ocupado = false, repetir = false, conflictoAbierto = false, ramaCreada = false, iniciado = false;

  function cargar() {
    try { cfg = Object.assign({}, DEF, JSON.parse(localStorage.getItem(CLAVE) || '{}')); }
    catch (e) { cfg = Object.assign({}, DEF); }
    if (!cfg.docs || typeof cfg.docs !== 'object') cfg.docs = {};
    delete cfg.sha; delete cfg.pendiente; delete cfg.ruta; // formato anterior (un solo plan.json)
  }
  function guardar() { try { localStorage.setItem(CLAVE, JSON.stringify(cfg)); } catch (e) { /* nada */ } }
  function fase(f, msg) { est = { fase: f, msg: msg || '' }; if (window.PFApp && iniciado) PFApp.render(); }

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
  function rutaApi(ruta) { return repo() + '/contents/' + ruta.split('/').map(encodeURIComponent).join('/'); }

  /** Lee un archivo de la rama de datos: { sha, texto } o null si no existe. */
  function leerArchivo(ruta) {
    return api('GET', rutaApi(ruta) + '?ref=' + encodeURIComponent(cfg.rama))
      .then(function (j) { return { sha: j.sha, texto: desB64(j.content) }; })
      .catch(function (e) { if (e.status === 404) return null; throw e; });
  }
  function crearRama() {
    return api('GET', repo()).then(function (r) {
      return api('GET', repo() + '/git/ref/heads/' + encodeURIComponent(r.default_branch));
    }).then(function (ref) { return api('POST', repo() + '/git/refs', { ref: 'refs/heads/' + cfg.rama, sha: ref.object.sha }); });
  }
  function escribirArchivo(ruta, texto, sha, mensaje) {
    var cuerpo = { message: mensaje + ' · ' + new Date().toLocaleString('es-ES'), content: b64(texto), branch: cfg.rama };
    if (sha) cuerpo.sha = sha;
    return api('PUT', rutaApi(ruta), cuerpo).then(function (j) { return j.content.sha; })
      .catch(function (e) {
        if (e.status === 404 && /branch/i.test(e.message) && !ramaCreada) { ramaCreada = true; return crearRama().then(function () { return escribirArchivo(ruta, texto, sha, mensaje); }); }
        throw e;
      });
  }
  function borrarArchivo(ruta, sha, mensaje) {
    return api('DELETE', rutaApi(ruta), { message: mensaje, sha: sha, branch: cfg.rama });
  }

  // ------------------------------------------------------------ Documentos ---
  function st(ruta) { return cfg.docs[ruta] || (cfg.docs[ruta] = { sha: null, plano: null, pendiente: false }); }
  /** Marca un documento como ya sincronizado (al entrar con datos leídos de la nube). */
  function marcar(ruta, sha, plano) { var d = st(ruta); d.sha = sha; d.plano = plano; d.pendiente = false; guardar(); }
  function rutaPerfil() { return 'perfiles/' + PFPerfiles.activo().id + '.json'; }

  var DOCS = {
    perfil: {
      ruta: rutaPerfil,
      plano: function () { return PFPerfiles.textoPerfil(PFStore.get()) + '|' + PFPerfiles.sal(); },
      contenido: function () { return PFPerfiles.paquete(PFStore.get()); },
      mensaje: function () { return 'Perfil ' + PFPerfiles.activo().nombre; },
      recibir: recibirPerfil
    },
    compartido: {
      ruta: function () { return 'compartido.json'; },
      plano: function () { return PFPerfiles.textoCompartido(PFStore.get()); },
      contenido: function () { return Promise.resolve(PFPerfiles.textoCompartido(PFStore.get())); },
      mensaje: function () { return 'Gastos en pareja (' + PFPerfiles.activo().nombre + ')'; },
      recibir: recibirCompartido
    }
  };

  function recibirPerfil(r, d) {
    var plano = DOCS.perfil.plano();
    return PFPerfiles.abrirPaquete(r.texto).then(function (obj) {
      if (!obj) { fase('conflicto', 'Hay cambios en la nube sin cargar (falta la contraseña nueva).'); return; }
      var nuevo = PFPerfiles.unir(obj, PFStore.get().compartido, PFPerfiles.activo());
      var planoRemoto = PFPerfiles.textoPerfil(nuevo) + '|' + PFPerfiles.sal();
      if (planoRemoto === plano) { marcar(d.ruta(), r.sha, plano); return; }
      if (st(d.ruta()).pendiente) return conflicto(r, nuevo, d);
      var habia = !!st(d.ruta()).sha;
      PFStore.reemplazar(nuevo, 'datos de la nube', { nube: true });
      marcar(d.ruta(), r.sha, planoRemoto);
      if (habia) PFUI.toast('Cargados los cambios guardados desde otro PC.', { accion: 'Deshacer', fn: function () { PFStore.undo(); } });
    });
  }
  function recibirCompartido(r, d) {
    var remoto;
    try { remoto = PFSchema.compartido(JSON.parse(r.texto)); } catch (e) { return Promise.resolve(); }
    var local = PFStore.get().compartido;
    var fusion = PFSchema.compartido(PFTricount.fusionar(local, remoto));
    fusion.yo = local.yo;
    var sinYo = function (c) { var o = JSON.parse(JSON.stringify(c)); delete o.yo; return JSON.stringify(o); };
    if (sinYo(fusion) !== sinYo(local)) {
      PFStore.update(function (s) { s.compartido = fusion; }, { etiqueta: 'gastos en pareja de la nube', nube: true });
    }
    var remotoTxt = sinYo(remoto);
    marcar(d.ruta(), r.sha, remotoTxt);
    if (sinYo(fusion) !== remotoTxt) st(d.ruta()).pendiente = true; // hay algo nuestro que subir
    return Promise.resolve();
  }
  function conflicto(r, nuevo, d) {
    if (conflictoAbierto) return Promise.resolve();
    conflictoAbierto = true;
    var h = PFFmt.html, F = PFFmt;
    return PFUI.modal('<h2>Hay cambios en la nube y en este PC</h2>' +
      '<p>Tu perfil se guardó en la nube el <b>' + h(F.fechaHora(nuevo.meta.modificado)) + '</b> (posiblemente desde otro PC). ' +
      'En este navegador hay cambios del <b>' + h(F.fechaHora(PFStore.get().meta.modificado)) + '</b> que no están en la nube.</p>' +
      '<p>¿Con cuál te quedas? La otra no se pierde del todo: el historial de la nube guarda todas las versiones y aquí puedes deshacer con Ctrl+Z.</p>' +
      '<div class="modal-acc"><button type="button" class="btn" data-res="local">Mantener la de este PC</button>' +
      '<button type="button" class="btn prim" data-res="nube">Usar la de la nube</button></div>')
      .then(function (res) {
        conflictoAbierto = false;
        if (res === 'nube') {
          PFStore.reemplazar(nuevo, 'datos de la nube', { nube: true });
          marcar(d.ruta(), r.sha, PFPerfiles.textoPerfil(nuevo) + '|' + PFPerfiles.sal());
          PFUI.toast('Cargada la versión de la nube.');
        } else if (res === 'local') {
          var s = st(d.ruta()); s.sha = r.sha; s.plano = null; s.pendiente = true; guardar();
          programar(10);
        } else fase('conflicto', 'Hay cambios en la nube sin aplicar.');
      });
  }

  function bajarDoc(d) {
    return leerArchivo(d.ruta()).then(function (r) {
      var s = st(d.ruta());
      if (!r) { if (cfg.token) s.pendiente = true; return; }
      if (r.sha === s.sha) return;
      return d.recibir(r, d);
    });
  }
  function subirDoc(d, intento) {
    var s = st(d.ruta()), plano = d.plano();
    if (s.sha && s.plano === plano) { s.pendiente = false; return Promise.resolve(); }
    return d.contenido().then(function (contenido) {
      return escribirArchivo(d.ruta(), contenido, s.sha, d.mensaje());
    }).then(function (sha) {
      s.sha = sha; s.plano = plano; s.pendiente = false; cfg.ultima = new Date().toISOString(); guardar();
    }).catch(function (e) {
      if ((e.status === 409 || e.status === 422) && (intento || 0) < 3) {
        // Alguien guardó antes: leemos, fusionamos o preguntamos, y reintentamos
        return leerArchivo(d.ruta()).then(function (r) {
          if (!r) { s.sha = null; return subirDoc(d, (intento || 0) + 1); }
          return d.recibir(r, d).then(function () { if (st(d.ruta()).pendiente && !conflictoAbierto) return subirDoc(d, (intento || 0) + 1); });
        });
      }
      throw e;
    });
  }

  // ----------------------------------------------------------- Sincronizar ---
  function errorTexto(e) {
    if (e.status === 401) return 'El token no es válido o ha caducado. Revísalo en Ajustes › Nube.';
    if (e.status === 403 || e.status === 404) return 'El token no tiene permiso para escribir en el repositorio (Contents: Read and write).';
    return navigator.onLine === false ? 'Sin conexión: se guardará en la nube al volver.' : 'Error con la nube: ' + e.message;
  }
  /** Ciclo completo: baja lo nuevo de la nube y sube lo pendiente de este PC. */
  function sincronizar(silencioso) {
    if (!PFPerfiles.activo()) return Promise.resolve();
    if (ocupado) { repetir = true; return Promise.resolve(); }
    if (conflictoAbierto) return Promise.resolve();
    ocupado = true; clearTimeout(temporizador);
    if (!silencioso) fase('sync', 'Comprobando la nube…');
    var docs = [DOCS.perfil, DOCS.compartido];
    var cadena = Promise.resolve();
    docs.forEach(function (d) { cadena = cadena.then(function () { return bajarDoc(d); }); });
    cadena = cadena.then(function () {
      if (!cfg.token) return;
      var sub = Promise.resolve();
      docs.forEach(function (d) { sub = sub.then(function () { if (st(d.ruta()).pendiente && !conflictoAbierto) { fase('sync', 'Guardando en la nube…'); return subirDoc(d); } }); });
      return sub.then(borrarLegado);
    });
    return cadena.then(function () {
      guardar();
      if (conflictoAbierto) return;
      var pend = docs.some(function (d) { return st(d.ruta()).pendiente; });
      fase(cfg.token ? (pend ? 'pendiente' : 'ok') : 'lectura', pend ? 'Cambios pendientes de subir…' : '');
    }).catch(function (e) {
      fase('error', errorTexto(e));
    }).then(function () {
      ocupado = false;
      if (repetir) { repetir = false; programar(500); }
    });
  }
  function programar(ms) { clearTimeout(temporizador); temporizador = setTimeout(function () { sincronizar(true); }, ms == null ? 2000 : ms); }
  /** Llamado en cada cambio local (no en los que llegan de la nube). */
  function alCambiar() {
    if (!PFPerfiles.activo()) return;
    st(DOCS.perfil.ruta()).pendiente = true; st('compartido.json').pendiente = true; guardar();
    if (cfg.token) { fase('pendiente', 'Cambios pendientes de subir…'); programar(); }
    else if (est.fase !== 'error') fase('lectura');
  }
  /** Tras migrar, el antiguo plan.json (sin cifrar) se borra de la nube. */
  function borrarLegado() {
    if (!PFPerfiles.borrarLegadoPendiente() || !cfg.token) return Promise.resolve();
    return leerArchivo('plan.json').then(function (r) {
      if (!r) { PFPerfiles.legadoBorrado(); return; }
      return borrarArchivo('plan.json', r.sha, 'Datos migrados a perfiles cifrados').then(function () { PFPerfiles.legadoBorrado(); });
    }).catch(function () { /* se reintentará */ });
  }

  // --------------------------------------------------------------- Ajustes ---
  function conectar(token) {
    cfg.token = String(token || '').trim(); guardar();
    if (!cfg.token) { fase('lectura'); return Promise.resolve(false); }
    fase('sync', 'Comprobando el token…');
    return api('GET', repo()).then(function (r) {
      if (r.permissions && r.permissions.push === false) throw Object.assign(new Error('sin permiso'), { status: 403 });
      alCambiar();
      return sincronizar().then(function () { return true; });
    }).catch(function (e) {
      fase('error', e.status === 401 ? 'El token no es válido.' : e.status === 403 || e.status === 404 ? 'El token no tiene acceso de escritura a ' + cfg.owner + '/' + cfg.repo + '.' : 'No se pudo comprobar el token: ' + e.message);
      return false;
    });
  }
  function desconectar() { cfg.token = ''; guardar(); fase('lectura'); }
  function pendiente() { return Object.keys(cfg.docs).some(function (k) { return cfg.docs[k].pendiente; }); }
  function estado() {
    return { fase: est.fase, msg: est.msg, conectado: !!cfg.token, ultima: cfg.ultima, pendiente: pendiente(),
             owner: cfg.owner, repo: cfg.repo, rama: cfg.rama,
             historial: 'https://github.com/' + cfg.owner + '/' + cfg.repo + '/commits/' + cfg.rama };
  }

  function iniciar() {
    iniciado = true;
    document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'visible') sincronizar(true); });
    window.addEventListener('online', function () { sincronizar(true); });
    window.addEventListener('beforeunload', function (e) {
      if (cfg.token && pendiente()) { sincronizar(true); e.preventDefault(); e.returnValue = ''; }
    });
    // Cada 30 s con token; sin token, cada 3 min (la API sin autenticar admite 60 consultas por hora y se leen 2 archivos)
    var tic = 0;
    setInterval(function () { tic++; if (document.visibilityState === 'visible' && (cfg.token || tic % 6 === 0)) sincronizar(true); }, 30000);
    return sincronizar();
  }

  cargar();
  return { iniciar: iniciar, alCambiar: alCambiar, sincronizar: sincronizar, subir: function () { return sincronizar(true); }, bajar: sincronizar,
           conectar: conectar, desconectar: desconectar, estado: estado, leerArchivo: leerArchivo, marcar: marcar };
})();
