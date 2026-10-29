/* =============================================================================
   ui-settings.js · Ajustes
   -----------------------------------------------------------------------------
   Mes de inicio, hipótesis, rentabilidades por clase de activo, escala del
   ahorro (IRPF), tema, copias de seguridad y privacidad.
   ============================================================================= */
var PFAjustes = (function () {
  'use strict';
  var C = PFCalc, F = PFFmt, h = PFFmt.html, U = PFUI, S = PFSchema;

  function html(c) {
    var s = c.s, e = c.esc, hp = c.hip;
    var tema = s.ajustes.tema;
    var cent = (c.ui.presupuesto || {}).centimos;

    var plan = '<div class="card" data-form="aj-plan"><div class="card-h"><h3>Plan «' + h(e.nombre) + '»</h3></div><div class="form-grid">' +
      '<div class="fld"><span class="fld-l">Mes de inicio</span><input class="in" type="month" data-f="inicio" data-t="mes" value="' + h(e.inicio) + '"><span class="fld-a">Primer mes del presupuesto y de las proyecciones. El saldo inicial es el de tus cuentas a principio de ese mes.</span></div>' +
      '<div class="fld"><span class="fld-l">Saldo inicial (cuentas)</span><b style="font-size:16px">' + F.eur(c.sim.caja0) + '</b><span class="fld-a"><button type="button" class="btn-link" data-act="nav" data-sec="patrimonio">Editar cuentas</button></span></div>' +
      '</div></div>';

    var hip = '<div class="card" data-form="hipotesis"><div class="card-h"><h3>Hipótesis</h3><span class="sub">Del escenario activo</span></div><div class="form-grid">' +
      campoPct('Inflación', 'inflacion', hp.inflacion, 'Sube los gastos cada 12 meses y descuenta a euros de hoy.') +
      campoPct('Subida salarial', 'subidaSalarial', hp.subidaSalarial, 'Prudente: algo por debajo de la inflación.') +
      campoPct('Rentabilidad por defecto', 'rentDefecto', hp.rentDefecto, 'Para el coste de oportunidad de cada gasto.') +
      '<div class="fld"><span class="fld-l">Escenario para proyectar</span>' + U.seg([{ id: 'pes', nombre: 'Pesimista' }, { id: 'base', nombre: 'Base' }, { id: 'opt', nombre: 'Optimista' }], hp.escenarioRent, { 'data-f': 'escenarioRent' }, 'mini') + '</div>' +
      '</div></div>';

    var clases = S.CLASES.map(function (k) {
      var r = s.ajustes.rentPorClase[k.id];
      return '<tr data-form="aj-rent" data-id="' + k.id + '"><td class="izq">' + h(k.nombre) + '</td>' +
        ['pes', 'base', 'opt'].map(function (q) { return '<td><div class="fila-ctl" style="justify-content:flex-end">' + U.campoPct(q, r[q], 1, ' style="width:70px" aria-label="' + h(k.nombre + ' ' + q) + '"') + '<span class="muted">%</span></div></td>'; }).join('') + '</tr>';
    }).join('');
    var rent = '<div class="card"><div class="card-h"><h3>Rentabilidades por defecto</h3><span class="sub">Anuales, antes de comisiones</span>' +
      '<button type="button" class="btn sm" data-act="aj-rent-aplicar">Aplicar a mis inversiones</button></div>' +
      '<table class="tabla tabla-form"><thead><tr><th>Clase de activo</th><th>Pesimista</th><th>Base</th><th>Optimista</th></tr></thead><tbody>' + clases + '</tbody></table>' +
      '<p class="nota" style="margin-top:6px">Se usan al crear una inversión o cambiar su clase. La cripto lleva un rango más amplio porque su comportamiento es mucho más incierto.</p></div>';

    var tramos = s.ajustes.escalaAhorro.map(function (t, i) {
      var desde = i ? s.ajustes.escalaAhorro[i - 1].hasta : 0;
      return '<tr data-form="aj-irpf" data-id="' + i + '"><td class="izq">' + F.eur0(desde) + '</td><td>' + (t.hasta == null ? '<span class="muted">en adelante</span>' : U.campoEur('hasta', t.hasta, ' style="width:120px" aria-label="Hasta"')) + '</td>' +
        '<td><div class="fila-ctl" style="justify-content:flex-end">' + U.campoPct('tipo', t.tipo, 1, ' style="width:64px" aria-label="Tipo"') + '<span class="muted">%</span></div></td>' +
        '<td>' + (s.ajustes.escalaAhorro.length > 1 ? '<button type="button" class="btn ico-b sm ghost" data-act="aj-irpf-quitar" data-i="' + i + '" aria-label="Quitar tramo">' + U.icono('x') + '</button>' : '') + '</td></tr>';
    }).join('');
    var irpf = '<div class="card"><div class="card-h"><h3>Escala del ahorro (IRPF)</h3><span class="sub">Impuesto si vendes con ganancia</span>' +
      '<button type="button" class="btn sm ghost" data-act="aj-irpf-add">' + U.icono('mas') + 'Tramo</button><button type="button" class="btn sm ghost" data-act="aj-irpf-reset">Restaurar 2026</button></div>' +
      '<table class="tabla tabla-form"><thead><tr><th>Desde</th><th>Hasta</th><th>Tipo</th><th></th></tr></thead><tbody>' + tramos + '</tbody></table>' +
      '<p class="nota" style="margin-top:6px">Ejemplo: una ganancia de 10.000 € paga ' + F.eur(C.impuestoAhorro(1000000, s.ajustes.escalaAhorro)) + '.</p></div>';

    var apariencia = '<div class="card" data-form="aj-ui"><div class="card-h"><h3>Apariencia</h3></div><div class="form-grid">' +
      '<div class="fld"><span class="fld-l">Tema</span>' + U.seg([{ id: 'claro', nombre: 'Claro' }, { id: 'oscuro', nombre: 'Oscuro' }, { id: 'sistema', nombre: 'Como el sistema' }], tema, { 'data-f': 'tema' }, 'mini') + '</div>' +
      '<div class="fld"><span class="fld-l">Céntimos en el presupuesto</span>' + U.seg([{ id: 'auto', nombre: 'Automático' }, { id: 'si', nombre: 'Siempre' }, { id: 'no', nombre: 'Nunca' }], cent == null ? 'auto' : cent ? 'si' : 'no', { 'data-f': 'centimos' }, 'mini') +
      '<span class="fld-a">Automático: con pantallas de 1.680 px o más.</span></div></div></div>';

    var copias = perfil() + nube(c) + '<div class="card"><div class="card-h"><h3>Datos y copias de seguridad</h3></div>' +
      '<p class="nota" style="margin-bottom:10px">Además de la nube, se guarda en este navegador. Última copia en archivo: <b>' + h(c.s.meta.ultimaCopia ? F.fechaHora(c.s.meta.ultimaCopia) : 'nunca') + '</b>. Te avisaré si pasan más de 7 días sin copia.</p>' +
      '<div class="fila-ctl">' +
      '<button type="button" class="btn sm prim" data-act="guardar-archivo">' + U.icono('guardar') + 'Guardar en archivo (Ctrl+S)</button>' +
      '<button type="button" class="btn sm" data-act="abrir-archivo">' + U.icono('abrir') + 'Abrir archivo</button>' +
      '<button type="button" class="btn sm" data-act="exportar">Exportar JSON</button>' +
      '<button type="button" class="btn sm" data-act="aj-importar">Importar JSON</button></div>' +
      '<p class="fld-a" style="margin-top:6px">«Guardar en archivo» reescribe el mismo archivo cada vez (Chrome y Edge). «Exportar» descarga una copia nueva con la fecha.</p>' +
      '<div class="fila-ctl" style="margin-top:14px;padding-top:12px;border-top:1px solid var(--line)">' +
      '<button type="button" class="btn sm peligro" data-act="aj-cero">Empezar de cero</button>' +
      '<button type="button" class="btn sm ghost" data-act="aj-iniciales">Restaurar datos iniciales</button></div>' +
      '<p class="fld-a" style="margin-top:6px">«Empezar de cero» deja un plan vacío; «Restaurar datos iniciales» vuelve a los datos con los que se creó el planificador.</p></div>';

    var priv = '<div class="card"><div class="card-h"><h3>Privacidad</h3></div><p class="nota">Sin analítica, ni fuentes ni librerías externas (Chart.js ' + (window.Chart ? h(Chart.version) : '') + ' va incluido en la carpeta <code>lib</code>). ' +
      'La única conexión permitida (política CSP) es la API de GitHub para la nube. El repositorio es público: cualquiera puede ver los datos guardados en la nube.</p>' +
      '<p class="nota" style="margin-top:8px">Datos: versión de esquema ' + s.version + ' · ' + s.orden.length + ' escenarios · ' + s.seguimiento.length + ' meses de seguimiento. <button type="button" class="btn-link" data-act="atajos">Atajos de teclado</button></p></div>';

    return '<div class="rejilla r2">' + '<div>' + plan + hip + rent + '</div><div>' + copias + irpf + apariencia + priv + '</div></div>';
  }
  function perfil() {
    var p = PFPerfiles.activo();
    return '<div class="card"><div class="card-h"><h3>Perfil de ' + h(p.nombre) + '</h3><button type="button" class="btn sm" data-act="perfil-salir">' + U.icono('candado') + 'Cambiar de perfil</button></div>' +
      '<p class="nota" style="margin-bottom:10px">Tus datos se guardan cifrados con tu contraseña, en este navegador y en la nube. Los gastos en pareja son comunes a los dos perfiles.</p>' +
      '<div class="fila-ctl"><input class="in" type="password" id="pf-actual" placeholder="Contraseña actual" autocomplete="current-password" style="width:170px" aria-label="Contraseña actual">' +
      '<input class="in" type="password" id="pf-nueva1" placeholder="Nueva" autocomplete="new-password" style="width:140px" aria-label="Contraseña nueva">' +
      '<input class="in" type="password" id="pf-nueva2" placeholder="Repite la nueva" autocomplete="new-password" style="width:140px" aria-label="Repite la contraseña nueva">' +
      '<button type="button" class="btn sm" data-act="pf-cambiar">Cambiar contraseña</button></div>' +
      '<p class="fld-a" style="margin-top:6px">Si olvidas la contraseña no se pueden recuperar los datos cifrados: guarda de vez en cuando una copia en archivo (Ctrl+S).</p></div>';
  }
  function nube(c) {
    var n = PFNube.estado(), F2 = F;
    var estadoTxt = { ok: 'Sincronizado', sync: n.msg, pendiente: n.msg, lectura: 'Solo lectura: falta el token', vacio: 'La nube está vacía', error: n.msg, conflicto: n.msg }[n.fase] || 'Conectando…';
    return '<div class="card" data-form="nube"><div class="card-h"><h3>Nube (GitHub)</h3><span class="sub">' + h(n.owner + '/' + n.repo) + ' · rama «' + h(n.rama) + '»</span></div>' +
      '<p class="nota" style="margin-bottom:10px">Estado: <b class="' + (n.fase === 'ok' ? 'pos' : n.fase === 'error' || n.fase === 'conflicto' ? 'neg' : '') + '">' + h(estadoTxt) + '</b>' +
      (n.ultima ? ' · última sincronización ' + h(F2.fechaHora(n.ultima)) : '') + '. Cada cambio se guarda en la nube a los 2 segundos; al abrir la página o volver a la pestaña se cargan los cambios hechos en otro PC.</p>' +
      (n.conectado
        ? '<div class="fila-ctl"><span class="ok">' + U.icono('ok') + ' Token guardado en este navegador</span><span class="sp"></span>' +
          '<button type="button" class="btn sm" data-act="nube-sync">Sincronizar ahora</button>' +
          '<button type="button" class="btn sm ghost peligro" data-act="nube-salir">Quitar token</button></div>'
        : '<div class="fila-ctl"><input class="in" type="password" id="nube-token" placeholder="Pega aquí tu token (github_pat_…)" autocomplete="off" style="flex:1;min-width:220px" aria-label="Token de GitHub">' +
          '<button type="button" class="btn sm prim" data-act="nube-conectar">Conectar</button></div>' +
          '<ol class="nota pasos"><li>Abre <a href="https://github.com/settings/personal-access-tokens/new" target="_blank" rel="noopener">GitHub › Fine-grained token</a> (con tu sesión iniciada).</li>' +
          '<li>Nombre: «planificador»; caducidad: la que quieras. <b>Repository access</b>: «Only select repositories» › <b>' + h(n.repo) + '</b>.</li>' +
          '<li><b>Permissions › Repository permissions › Contents: Read and write</b>. Genera el token y pégalo arriba.</li>' +
          '<li>Repite el paso de pegar el token en cada PC o navegador que uses (solo se guarda en ese navegador).</li></ol>') +
      '<p class="fld-a" style="margin-top:8px"><a href="' + h(n.historial) + '" target="_blank" rel="noopener">Ver el historial de versiones en GitHub</a> · el token nunca se incluye en las copias ni se sube.</p></div>';
  }
  function campoPct(etq, f, v, ayuda) {
    return '<div class="fld"><span class="fld-l">' + etq + '</span><div class="fila-ctl">' + U.campoPct(f, v, 1, ' style="width:80px"') + '<span class="muted">%</span></div>' + (ayuda ? '<span class="fld-a">' + ayuda + '</span>' : '') + '</div>';
  }

  function bloqueado() {
    if (PFWhatIf.activo()) { U.toast('Termina el modo ¿Y si…? (Aplicar o Descartar) antes de hacer esto.', { tipo: 'error' }); return true; }
    return false;
  }
  function enlazar() {
    U.accion('pf-cambiar', function () {
      var a = document.getElementById('pf-actual').value, n1 = document.getElementById('pf-nueva1').value, n2 = document.getElementById('pf-nueva2').value;
      if (n1.length < 4) { U.toast('La nueva contraseña necesita al menos 4 caracteres.', { tipo: 'error' }); return; }
      if (n1 !== n2) { U.toast('Las dos contraseñas nuevas no coinciden.', { tipo: 'error' }); return; }
      PFPerfiles.cambiarPassword(a, n1).then(function () {
        ['pf-actual', 'pf-nueva1', 'pf-nueva2'].forEach(function (id) { document.getElementById(id).value = ''; });
        if (window.PFNube) PFNube.alCambiar();
        U.toast('Contraseña cambiada. En otros PCs te la pedirá al cargar los cambios.');
      }).catch(function (e) { U.toast(e.message, { tipo: 'error' }); });
    });
    U.accion('nube-conectar', function () {
      var t = document.getElementById('nube-token').value.trim();
      if (!t) { U.toast('Pega primero el token.', { tipo: 'error' }); return; }
      PFNube.conectar(t).then(function (ok) {
        if (ok) U.toast('Nube conectada: tus cambios se guardarán en GitHub.');
        else { PFNube.desconectar(); U.toast(PFNube.estado().msg || 'No se pudo conectar.', { tipo: 'error', ms: 7000 }); }
      });
    });
    U.accion('nube-sync', function () { PFNube.bajar().then(function () { if (PFNube.estado().pendiente) PFNube.subir(); }); });
    U.accion('nube-salir', function () {
      U.confirmar({ titulo: 'Quitar el token de este navegador', texto: 'Seguirás viendo los datos de la nube, pero lo que cambies aquí no se guardará en ella.', ok: 'Quitar token', peligro: true })
        .then(function (ok) { if (ok) PFNube.desconectar(); });
    });
    U.formulario('aj-plan', function (id, campo, v) {
      if (campo === 'inicio' && v) PFStore.update(function (s, e) { e.inicio = v; }, { etiqueta: 'mes de inicio' });
    });
    U.formulario('aj-rent', function (clase, campo, v) {
      PFStore.update(function (s) { s.ajustes.rentPorClase[clase][campo] = v; }, { etiqueta: 'rentabilidad por defecto' });
    });
    U.formulario('aj-irpf', function (i, campo, v) {
      PFStore.update(function (s) {
        var esc = s.ajustes.escalaAhorro, t = esc[+i]; if (!t) return;
        t[campo] = v;
        s.ajustes.escalaAhorro = S.normalizar({ ajustes: { escalaAhorro: esc } }).ajustes.escalaAhorro;
      }, { etiqueta: 'escala del ahorro' });
    });
    U.formulario('aj-ui', function (id, campo, v) {
      if (campo === 'tema') PFStore.update(function (s) { s.ajustes.tema = v; }, { etiqueta: 'tema' });
      else if (campo === 'centimos') PFStore.setUI({ presupuesto: Object.assign({}, PFStore.getUI().presupuesto || {}, { centimos: v === 'auto' ? null : v === 'si' }) });
    });
    U.accion('aj-irpf-add', function () {
      PFStore.update(function (s) {
        var esc = s.ajustes.escalaAhorro, pen = esc.length > 1 ? esc[esc.length - 2].hasta : 0;
        esc.splice(esc.length - 1, 0, { hasta: (pen || 0) + 10000000, tipo: esc[esc.length - 1].tipo });
      }, { etiqueta: 'añadir tramo' });
    });
    U.accion('aj-irpf-quitar', function (el) {
      var i = +el.getAttribute('data-i');
      PFStore.update(function (s) {
        var esc = s.ajustes.escalaAhorro; esc.splice(i, 1);
        s.ajustes.escalaAhorro = S.normalizar({ ajustes: { escalaAhorro: esc } }).ajustes.escalaAhorro;
      }, { etiqueta: 'quitar tramo' });
    });
    U.accion('aj-irpf-reset', function () { PFStore.update(function (s) { s.ajustes.escalaAhorro = S.clon(C.ESCALA_AHORRO_2026); }, { etiqueta: 'restaurar escala 2026' }); });
    U.accion('aj-rent-aplicar', function () {
      U.confirmar({ titulo: 'Aplicar rentabilidades por defecto', texto: 'Las inversiones del escenario activo tomarán los escenarios pesimista/base/optimista de su clase. Podrás deshacerlo.', ok: 'Aplicar' }).then(function (ok) {
        if (ok) PFStore.update(function (s, e) { e.inversiones.forEach(function (x) { x.rent = Object.assign({}, s.ajustes.rentPorClase[x.clase]); }); }, { etiqueta: 'aplicar rentabilidades' });
      });
    });
    U.accion('aj-importar', function () {
      PFStore.importar().then(function (r) {
        if (!r) return;
        return U.confirmar({ titulo: 'Importar «' + r.nombre + '»', texto: 'Sustituirá todos los datos actuales. Podrás deshacerlo con Ctrl+Z.', ok: 'Importar' }).then(function (ok) {
          if (ok) { r.estado.compartido = PFStore.get().compartido; PFStore.reemplazar(r.estado, 'importar'); U.toast('Datos importados.'); }
        });
      }).catch(function (err) { U.toast(err.message, { tipo: 'error', ms: 6000 }); });
    });
    U.accion('aj-cero', function () {
      if (bloqueado()) return;
      U.confirmar({ titulo: 'Empezar de cero', texto: 'Se borran todos los escenarios, partidas y el seguimiento. Te recomiendo guardar antes una copia. Podrás deshacerlo con Ctrl+Z mientras no cierres la página.', ok: 'Borrar todo', peligro: true }).then(function (ok) {
        if (!ok) return;
        var nuevo = S.estadoInicial(false);
        nuevo.ajustes = S.clon(PFStore.get().ajustes);
        nuevo.compartido = PFStore.get().compartido;
        nuevo.meta.ultimaCopia = PFStore.get().meta.ultimaCopia;
        PFStore.reemplazar(nuevo, 'empezar de cero');
        U.toast('Plan vacío creado.', { accion: 'Deshacer', fn: function () { PFStore.undo(); } });
      });
    });
    U.accion('aj-iniciales', function () {
      if (bloqueado()) return;
      U.confirmar({ titulo: 'Restaurar datos iniciales', texto: 'Vuelve a los datos con los que se creó el planificador. Se sustituye todo lo actual (puedes deshacerlo).', ok: 'Restaurar', peligro: true }).then(function (ok) {
        if (!ok) return;
        var nuevo = S.estadoInicial(true, PFPerfiles.activo().id);
        nuevo.ajustes = S.clon(PFStore.get().ajustes);
        nuevo.compartido = PFStore.get().compartido;
        PFStore.reemplazar(nuevo, 'restaurar datos iniciales');
      });
    });
  }
  enlazar();
  PFUI.seccion('ajustes', { html: html });
  return {};
})();
