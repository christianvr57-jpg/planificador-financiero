/* =============================================================================
   perfiles.js · Perfiles con contraseña (Christian y Maribel)
   -----------------------------------------------------------------------------
   · Antes de entrar se elige perfil y se escribe su contraseña.
   · Los datos de cada perfil se guardan CIFRADOS (AES-GCM, clave derivada de la
     contraseña con PBKDF2-SHA256, 250.000 iteraciones), tanto en este navegador
     como en la nube: sin la contraseña no se pueden leer, ni siquiera mirando
     el repositorio público. Si se olvida la contraseña, no hay forma de
     recuperar esos datos (salvo una copia exportada en archivo).
   · Los «Gastos en pareja» (Tricount) son un libro común a los dos perfiles:
     se guardan aparte, sin cifrar, y cada perfil lo ve desde su punto de vista.
   · La sesión dura mientras la pestaña esté abierta (se recuerda la clave en
     sessionStorage); «Cambiar de perfil» la cierra.
   · Migración: la primera vez, el perfil de Christian se crea con los datos
     que ya había (en este navegador o en la nube, los más recientes).
   ============================================================================= */
var PFPerfiles = (function () {
  'use strict';
  var PERFILES = [
    { id: 'christian', nombre: 'Christian', persona: 'yo', color: 'var(--s1)' },
    { id: 'maribel', nombre: 'Maribel', persona: 'pareja', color: 'var(--s5)' }
  ];
  var K_PERFIL = 'pf/perfil/', K_COMP = 'pf/compartido', K_SESION = 'pf/sesion', K_BORRAR_LEGADO = 'pf/borrar-legado';
  var LEGADO = 'planificador-financiero/estado';
  var ITER = 250000;
  var activo = null; // { def, clave (CryptoKey), sal, iter }
  var h = function (s) { return PFFmt.html(s); };

  // ------------------------------------------------------------ Bytes ---
  function aB64(buf) {
    var u = new Uint8Array(buf), s = '';
    for (var i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000));
    return btoa(s);
  }
  function deB64(b) { var s = atob(b), u = new Uint8Array(s.length); for (var i = 0; i < s.length; i++) u[i] = s.charCodeAt(i); return u; }
  function azar(n) { var u = new Uint8Array(n); crypto.getRandomValues(u); return u; }

  // ----------------------------------------------------------- Cifrado ---
  function derivar(pass, sal, iter) {
    var enc = new TextEncoder();
    return crypto.subtle.importKey('raw', enc.encode(pass), 'PBKDF2', false, ['deriveKey']).then(function (base) {
      return crypto.subtle.deriveKey({ name: 'PBKDF2', salt: deB64(sal), iterations: iter, hash: 'SHA-256' }, base,
        { name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
    });
  }
  function cifrar(clave, texto) {
    var iv = azar(12);
    return crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv }, clave, new TextEncoder().encode(texto))
      .then(function (ct) { return { iv: aB64(iv), datos: aB64(ct) }; });
  }
  function descifrar(clave, paq) {
    return crypto.subtle.decrypt({ name: 'AES-GCM', iv: deB64(paq.iv) }, clave, deB64(paq.datos))
      .then(function (pt) { return new TextDecoder().decode(pt); });
  }

  // ---------------------------------------------- Separar y unir estado ---
  /** Parte privada del perfil (sin el libro común) y libro común (sin el punto de vista). */
  function separar(estado) {
    var p = JSON.parse(JSON.stringify(estado));
    p.compartidoYo = estado.compartido ? estado.compartido.yo : null;
    delete p.compartido;
    var c = JSON.parse(JSON.stringify(estado.compartido || PFSchema.compartido({})));
    delete c.yo;
    return { perfil: p, compartido: c };
  }
  function unir(perfilObj, compObj, def) {
    var yo = perfilObj.compartidoYo;
    var st = PFSchema.migrar(perfilObj);
    var c = PFSchema.compartido(compObj || {});
    var ids = c.personas.map(function (p) { return p.id; });
    c.yo = ids.indexOf(yo) >= 0 ? yo : ids.indexOf(def.persona) >= 0 ? def.persona : ids[0];
    st.compartido = c;
    return st;
  }
  function textoPerfil(estado) { return JSON.stringify(separar(estado).perfil); }
  function textoCompartido(estado) { return JSON.stringify(separar(estado).compartido); }
  /** Paquete cifrado del perfil activo (lo que se guarda en el navegador y en la nube). */
  function paquete(estado) {
    return cifrar(activo.clave, textoPerfil(estado)).then(function (c) {
      return JSON.stringify({ app: PFSchema.APP, formato: 'perfil-cifrado', v: 1, perfil: activo.def.id, sal: activo.sal, iter: activo.iter,
                              iv: c.iv, datos: c.datos, modificado: estado.meta.modificado });
    });
  }
  /** Descifra un paquete del perfil activo. Si se cambió la contraseña en otro PC, la pide. */
  function abrirPaquete(texto) {
    var paq = JSON.parse(texto);
    if (paq.perfil !== activo.def.id) return Promise.reject(new Error('El archivo es de otro perfil.'));
    var claveP = paq.sal === activo.sal ? Promise.resolve(activo.clave) : pedirClaveNueva(paq);
    return claveP.then(function (clave) {
      if (!clave) return null;
      return descifrar(clave, paq).then(function (t) { return JSON.parse(t); });
    });
  }
  function pedirClaveNueva(paq) {
    return PFUI.modal('<h2>La contraseña cambió en otro PC</h2><p>Escribe la contraseña nueva de ' + h(activo.def.nombre) + ' para cargar los últimos cambios.</p>' +
      '<input class="in ancho" type="password" id="pf-nueva" autocomplete="current-password">' +
      '<div class="modal-acc"><button type="button" class="btn" data-res="no">Ahora no</button><button type="button" class="btn prim" data-res="ok">Usar</button></div>',
      { foco: '#pf-nueva', valor: function (d) { return d.querySelector('#pf-nueva').value; } })
      .then(function (pass) {
        if (!pass) return null;
        return derivar(pass, paq.sal, paq.iter).then(function (clave) {
          return descifrar(clave, paq).then(function () {
            activo = { def: activo.def, clave: clave, sal: paq.sal, iter: paq.iter };
            return guardarSesion().then(function () { return clave; });
          });
        }).catch(function () { PFUI.toast('Contraseña incorrecta.', { tipo: 'error' }); return null; });
      });
  }

  // ------------------------------------------------------------ Guardado ---
  function guardarLocal(estado) {
    if (!activo) return Promise.resolve();
    var partes = separar(estado);
    try { localStorage.setItem(K_COMP, JSON.stringify(partes.compartido)); } catch (e) { return Promise.reject(e); }
    return paquete(estado).then(function (p) { localStorage.setItem(K_PERFIL + activo.def.id, p); });
  }
  function guardarSesion() {
    return crypto.subtle.exportKey('raw', activo.clave).then(function (raw) {
      try { sessionStorage.setItem(K_SESION, JSON.stringify({ id: activo.def.id, k: aB64(raw), sal: activo.sal, iter: activo.iter })); } catch (e) { /* nada */ }
    });
  }
  function cerrarSesion() {
    try { sessionStorage.removeItem(K_SESION); } catch (e) { /* nada */ }
    location.reload();
  }
  function cambiarPassword(actual, nueva) {
    var paq = JSON.parse(localStorage.getItem(K_PERFIL + activo.def.id) || 'null');
    if (!paq) return Promise.reject(new Error('No hay datos guardados de este perfil.'));
    return derivar(actual, paq.sal, paq.iter).then(function (k) { return descifrar(k, paq); })
      .catch(function () { throw new Error('La contraseña actual no es correcta.'); })
      .then(function () {
        var sal = aB64(azar(16));
        return derivar(nueva, sal, ITER).then(function (clave) {
          activo = { def: activo.def, clave: clave, sal: sal, iter: ITER };
          return guardarSesion().then(function () { return guardarLocal(PFStore.get()); });
        });
      });
  }

  // --------------------------------------------------- Datos de partida ---
  function leerJSON(clave) { try { return JSON.parse(localStorage.getItem(clave) || 'null'); } catch (e) { return null; } }
  function nubeTexto(ruta) {
    if (!window.PFNube) return Promise.resolve(null);
    return PFNube.leerArchivo(ruta).catch(function () { return null; });
  }
  /** Datos con los que se crea el perfil la primera vez. */
  function datosNuevos(def) {
    if (def.id !== 'christian') return Promise.resolve({ estado: PFSchema.estadoInicial(true, def.id), legado: false });
    var local = null;
    try { var crudo = leerJSON(LEGADO); if (crudo) local = PFSchema.migrar(crudo); } catch (e) { local = null; }
    return nubeTexto('plan.json').then(function (r) {
      var nube = null;
      try { if (r) nube = PFSchema.migrar(JSON.parse(r.texto)); } catch (e) { nube = null; }
      var elegido = local && nube ? (nube.meta.modificado > local.meta.modificado ? nube : local) : (local || nube);
      if (!elegido) return { estado: PFSchema.estadoInicial(true, 'christian'), legado: false };
      return { estado: elegido, legado: true, legadoNube: !!r };
    });
  }
  /** Libro común: el del navegador, si no el de la nube, si no el que traían los datos antiguos. */
  function compartidoInicial(viejo) {
    var local = leerJSON(K_COMP);
    if (local) return Promise.resolve({ c: local });
    return nubeTexto('compartido.json').then(function (r) {
      if (r) { try { return { c: JSON.parse(r.texto), sha: r.sha }; } catch (e) { /* sigue */ } }
      var c = viejo ? JSON.parse(JSON.stringify(viejo)) : PFSchema.compartido({});
      // Los nombres por defecto pasan a ser los de los perfiles
      c.personas = (c.personas || []).map(function (p) {
        if (p.id === 'yo' && /^(yo)$/i.test(p.nombre)) p.nombre = 'Christian';
        if (p.id === 'pareja' && /^(mi pareja)$/i.test(p.nombre)) p.nombre = 'Maribel';
        return p;
      });
      if (!c.personas.length) c = PFSchema.compartido({ personas: [{ id: 'yo', nombre: 'Christian' }, { id: 'pareja', nombre: 'Maribel' }] });
      delete c.yo;
      return { c: c };
    });
  }

  // ----------------------------------------------------- Pantalla de acceso ---
  var raiz = null, paso = null;
  function pantalla(html) {
    if (!raiz) {
      raiz = document.createElement('div');
      raiz.className = 'acceso';
      raiz.setAttribute('role', 'dialog'); raiz.setAttribute('aria-modal', 'true'); raiz.setAttribute('aria-labelledby', 'lock-t');
      document.body.appendChild(raiz);
    }
    raiz.innerHTML = '<div class="lock-card"><div class="lock-marca"><span class="logo" aria-hidden="true">€</span><b>Planificador financiero</b></div>' + html + '</div>';
  }
  function avatar(def, grande) { return '<span class="lock-av' + (grande ? ' gr' : '') + '" style="background:' + def.color + '" aria-hidden="true">' + h(def.nombre.charAt(0)) + '</span>'; }
  function pintarElegir() {
    paso = { tipo: 'elegir' };
    pantalla('<h1 id="lock-t">¿Quién eres?</h1><div class="lock-perfiles">' + PERFILES.map(function (d) {
      var tiene = !!localStorage.getItem(K_PERFIL + d.id);
      return '<button type="button" class="lock-p" data-perfil="' + d.id + '">' + avatar(d) + '<span><b>' + h(d.nombre) + '</b><small>' + (tiene ? 'Entrar con contraseña' : 'Entrar') + '</small></span></button>';
    }).join('') + '</div><p class="lock-nota">Cada perfil tiene su contraseña y sus datos cifrados. Los gastos en pareja son comunes a los dos.</p>');
    var b = raiz.querySelector('.lock-p'); if (b) b.focus();
  }
  function pintarClave(def, modo, error) {
    paso = { tipo: modo, def: def };
    var crear = modo === 'crear';
    pantalla('<button type="button" class="btn ghost sm lock-volver" data-volver>‹ Volver</button>' +
      '<div class="lock-quien">' + avatar(def, true) + '<h1 id="lock-t">' + h(def.nombre) + '</h1></div>' +
      '<form class="lock-form" autocomplete="off">' +
      (crear ? '<p class="lock-nota">Primera vez en este perfil: <b>crea tu contraseña</b>. Mínimo 4 caracteres (vale un PIN).</p>' : '') +
      '<label class="fld"><span class="fld-l">' + (crear ? 'Nueva contraseña' : 'Contraseña') + '</span><input class="in" type="password" id="lock-pass" autocomplete="' + (crear ? 'new-password' : 'current-password') + '" required></label>' +
      (crear ? '<label class="fld"><span class="fld-l">Repite la contraseña</span><input class="in" type="password" id="lock-pass2" autocomplete="new-password" required></label>' : '') +
      '<p class="lock-error" role="alert">' + (error ? h(error) : '') + '</p>' +
      '<button type="submit" class="btn prim lock-entrar">' + (crear ? 'Crear y entrar' : 'Entrar') + '</button>' +
      (crear ? '<p class="lock-nota">Tus datos se cifran con esta contraseña. <b>Si la olvidas no se pueden recuperar</b>: guarda de vez en cuando una copia en archivo (Ctrl+S).</p>' : '') +
      '</form>');
    raiz.querySelector('#lock-pass').focus();
  }
  function pintarEspera(texto) {
    pantalla('<div class="lock-espera"><span class="lock-spin" aria-hidden="true"></span><p>' + h(texto) + '</p></div>');
  }

  /** Muestra la pantalla de acceso y resuelve con { estado, perfil } al entrar. */
  function entrar() {
    if (!window.crypto || !crypto.subtle) {
      pantalla('<h1 id="lock-t">Navegador no compatible</h1><p class="lock-nota">Este navegador no permite cifrar los datos. Abre la web en Chrome o Edge (por https o con doble clic en index.html).</p>');
      return new Promise(function () {});
    }
    return reanudar().then(function (r) {
      if (r) return r;
      return new Promise(function (resolver) {
        pintarElegir();
        var fuente = null; // paquete encontrado para el perfil elegido
        raiz.addEventListener('click', function (e) {
          if (e.target.closest('[data-volver]')) { pintarElegir(); return; }
          var b = e.target.closest('[data-perfil]');
          if (!b || paso.tipo !== 'elegir') return;
          var def = PERFILES.filter(function (d) { return d.id === b.getAttribute('data-perfil'); })[0];
          var local = localStorage.getItem(K_PERFIL + def.id);
          if (local) { fuente = { texto: local }; pintarClave(def, 'abrir'); return; }
          pintarEspera('Buscando el perfil de ' + def.nombre + '…');
          nubeTexto('perfiles/' + def.id + '.json').then(function (r) {
            fuente = r; pintarClave(def, r ? 'abrir' : 'crear');
          });
        });
        raiz.addEventListener('submit', function (e) {
          e.preventDefault();
          var def = paso.def, pass = raiz.querySelector('#lock-pass').value;
          if (paso.tipo === 'crear') {
            var pass2 = raiz.querySelector('#lock-pass2').value;
            if (pass.length < 4) { pintarClave(def, 'crear', 'Usa al menos 4 caracteres.'); return; }
            if (pass !== pass2) { pintarClave(def, 'crear', 'Las dos contraseñas no coinciden.'); return; }
            pintarEspera('Preparando el perfil…');
            crear(def, pass).then(resolver).catch(function (err) { pintarClave(def, 'crear', err.message); });
          } else {
            pintarEspera('Comprobando…');
            abrir(def, pass, fuente).then(resolver).catch(function (err) { pintarClave(def, 'abrir', err.message); });
          }
        });
      });
    }).then(function (r) {
      if (raiz) { raiz.remove(); raiz = null; }
      return r;
    });
  }
  function abrir(def, pass, fuente) {
    var paq;
    try { paq = JSON.parse(fuente.texto); } catch (e) { return Promise.reject(new Error('Los datos guardados están dañados.')); }
    return derivar(pass, paq.sal, paq.iter).then(function (clave) {
      return descifrar(clave, paq).catch(function () { throw new Error('Contraseña incorrecta.'); }).then(function (texto) {
        activo = { def: def, clave: clave, sal: paq.sal, iter: paq.iter };
        return montar(JSON.parse(texto), null, fuente.sha ? { ruta: 'perfiles/' + def.id + '.json', sha: fuente.sha } : null);
      });
    });
  }
  function crear(def, pass) {
    var sal = aB64(azar(16));
    return Promise.all([derivar(pass, sal, ITER), datosNuevos(def)]).then(function (r) {
      activo = { def: def, clave: r[0], sal: sal, iter: ITER };
      var nuevo = r[1], perfilObj = separar(nuevo.estado).perfil;
      perfilObj.compartidoYo = def.persona;
      if (nuevo.legadoNube) try { localStorage.setItem(K_BORRAR_LEGADO, '1'); } catch (e) { /* nada */ }
      return montar(perfilObj, nuevo.legado ? nuevo.estado.compartido : null, null).then(function (res) {
        if (nuevo.legado) try { localStorage.removeItem(LEGADO); } catch (e) { /* nada */ }
        res.nuevo = true; res.legado = nuevo.legado;
        return res;
      });
    });
  }
  function montar(perfilObj, compViejo, sincronizado) {
    return compartidoInicial(compViejo).then(function (ci) {
      var estado = unir(perfilObj, ci.c, activo.def);
      return guardarSesion().then(function () { return guardarLocal(estado); }).then(function () {
        if (window.PFNube) {
          if (sincronizado) PFNube.marcar(sincronizado.ruta, sincronizado.sha, textoPerfil(estado) + '|' + activo.sal);
          if (ci.sha) PFNube.marcar('compartido.json', ci.sha, textoCompartido(estado));
        }
        return { estado: estado, perfil: activo.def };
      });
    });
  }
  /** Si la pestaña ya tenía la sesión abierta, entra sin pedir contraseña. */
  function reanudar() {
    var s = null;
    try { s = JSON.parse(sessionStorage.getItem(K_SESION) || 'null'); } catch (e) { s = null; }
    var def = s && PERFILES.filter(function (d) { return d.id === s.id; })[0];
    var local = def && localStorage.getItem(K_PERFIL + def.id);
    if (!def || !local) return Promise.resolve(null);
    var paq = JSON.parse(local);
    if (paq.sal !== s.sal) return Promise.resolve(null);
    return crypto.subtle.importKey('raw', deB64(s.k), { name: 'AES-GCM' }, true, ['encrypt', 'decrypt']).then(function (clave) {
      return descifrar(clave, paq).then(function (texto) {
        activo = { def: def, clave: clave, sal: s.sal, iter: s.iter };
        return montar(JSON.parse(texto), null, null);
      });
    }).catch(function () { return null; });
  }

  function borrarLegadoPendiente() { try { return localStorage.getItem(K_BORRAR_LEGADO) === '1'; } catch (e) { return false; } }
  function legadoBorrado() { try { localStorage.removeItem(K_BORRAR_LEGADO); } catch (e) { /* nada */ } }

  return {
    PERFILES: PERFILES, entrar: entrar, activo: function () { return activo ? activo.def : null; }, sal: function () { return activo ? activo.sal : ''; },
    separar: separar, unir: unir, textoPerfil: textoPerfil, textoCompartido: textoCompartido, paquete: paquete, abrirPaquete: abrirPaquete,
    guardarLocal: guardarLocal, cerrarSesion: cerrarSesion, cambiarPassword: cambiarPassword,
    borrarLegadoPendiente: borrarLegadoPendiente, legadoBorrado: legadoBorrado,
    _cripto: { derivar: derivar, cifrar: cifrar, descifrar: descifrar, aB64: aB64 }
  };
})();
