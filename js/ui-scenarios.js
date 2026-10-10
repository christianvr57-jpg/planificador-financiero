/* =============================================================================
   ui-scenarios.js · Escenarios
   -----------------------------------------------------------------------------
   Crear, duplicar, renombrar, borrar y comparar dos escenarios lado a lado
   (ahorro anual, saldo a fin de año, patrimonio a 10/20/30 años…) con las
   diferencias resaltadas y la lista de qué cambia entre ellos.
   ============================================================================= */
var PFEscenarios = (function () {
  'use strict';
  var C = PFCalc, F = PFFmt, h = PFFmt.html, U = PFUI, S = PFSchema;
  var cache = { rev: -1, datos: {} };

  function datos(c) {
    if (cache.rev !== PFStore.info.revision) { cache = { rev: PFStore.info.revision, datos: {} }; }
    c.s.orden.forEach(function (id) {
      if (cache.datos[id]) return;
      var e = c.s.escenarios[id], sim = C.simular(e), k = C.kpis(e, sim);
      var fin = Math.max.apply(null, [-1].concat(e.deudas.map(function (d) { var a = sim.hitos.deudas[d.id]; return a == null ? -1 : a; })));
      cache.datos[id] = { e: e, sim: sim, k: k, finDeudas: e.deudas.length ? fin : null };
    });
    return cache.datos;
  }
  function opc(c) {
    var o = Object.assign({ a: null, b: null }, c.ui.escenarios || {});
    var ids = c.s.orden;
    if (ids.indexOf(o.a) < 0) o.a = c.s.escenarioActivo;
    if (ids.indexOf(o.b) < 0 || o.b === o.a) o.b = ids.filter(function (x) { return x !== o.a; })[0] || null;
    return o;
  }
  function setOpc(p) { PFStore.setUI({ escenarios: Object.assign({}, PFStore.getUI().escenarios || {}, p) }); }

  function html(c) {
    var D = datos(c), o = opc(c);
    var filas = c.s.orden.map(function (id) {
      var d = D[id], activo = id === c.s.escenarioActivo, k = d.k;
      return '<tr class="' + (activo ? 'destacada' : '') + '"><td class="izq"><b>' + h(d.e.nombre) + '</b>' + (activo ? ' <span class="bdg">activo</span>' : '') +
        (c.s.whatif && c.s.whatif.escenarioId === id ? ' <span class="bdg" style="background:var(--wi-soft);color:var(--wi)">¿Y si…?</span>' : '') +
        '<div class="muted" style="font-size:11px">Creado ' + h(F.fechaHora(d.e.creado)) + '</div></td>' +
        '<td>' + F.eur0(k.ahorro) + '</td><td>' + F.eur0(k.saldoFin12) + '</td><td>' + F.eur0(C.patrimonioA(d.sim, 10)) + '</td><td>' + F.eur0(C.patrimonioA(d.sim, 20)) + '</td><td>' + F.eur0(C.patrimonioA(d.sim, 30)) + '</td>' +
        '<td class="acc">' + (activo ? '' : '<button type="button" class="btn sm" data-act="es-activar" data-id="' + h(id) + '">Activar</button>') +
        '<button type="button" class="btn sm ghost" data-act="es-duplicar" data-id="' + h(id) + '" data-tip="Duplicar">' + U.icono('copiar') + '</button>' +
        '<button type="button" class="btn sm ghost" data-act="es-renombrar" data-id="' + h(id) + '" data-tip="Renombrar">' + U.icono('editar') + '</button>' +
        '<button type="button" class="btn sm ghost peligro" data-act="es-borrar" data-id="' + h(id) + '" data-tip="Borrar"' + (c.s.orden.length < 2 ? ' disabled' : '') + '>' + U.icono('papelera') + '</button></td></tr>';
    }).join('');
    return '<div class="seccion-h"><h2>Tus escenarios</h2><button type="button" class="btn sm" data-act="es-nuevo-vacio">Nuevo en blanco</button>' +
      '<button type="button" class="btn sm prim" data-act="es-duplicar" data-id="' + h(c.s.escenarioActivo) + '">' + U.icono('copiar') + 'Duplicar el activo</button></div>' +
      '<div class="card"><table class="tabla"><thead><tr><th>Escenario</th><th>Ahorro 12 meses</th><th>Saldo a fin de año</th><th>Patrimonio 10 a</th><th>Patrimonio 20 a</th><th>Patrimonio 30 a</th><th></th></tr></thead><tbody>' + filas + '</tbody></table>' +
      '<p class="nota" style="margin-top:8px">Un escenario es una copia completa de tu plan (partidas, huchas, inversiones, deudas e hipótesis). También puedes crearlos desde el modo ¿Y si…? con «Guardar como escenario».</p></div>' +
      comparar(c, D, o);
  }
  function comparar(c, D, o) {
    if (!o.b) return '<div class="card" style="margin-top:12px"><h3>Comparar</h3><p class="nota" style="margin-top:6px">Duplica tu escenario y cambia algo para poder compararlos lado a lado.</p></div>';
    var A = D[o.a], B = D[o.b];
    var lista = c.s.orden.map(function (id) { return { id: id, nombre: c.s.escenarios[id].nombre }; });
    function fila(nombre, fa, fb, opts) {
      opts = opts || {};
      var va = fa(A), vb = fb ? fb(B) : fa(B);
      var dif = (va == null || vb == null) ? null : vb - va;
      var fmt = opts.fmt || F.eur0;
      var cls = dif == null || dif === 0 ? '' : ((dif > 0) !== !!opts.menosEsMejor ? 'comp-pos' : 'comp-neg');
      var txtDif = dif == null ? '—' : dif === 0 ? '=' : (opts.fmtDif ? opts.fmtDif(dif) : (dif > 0 ? '+' : '') + fmt(dif));
      return '<tr><td class="izq">' + nombre + '</td><td>' + (va == null ? '—' : fmt(va)) + '</td><td>' + (vb == null ? '—' : fmt(vb)) + '</td><td class="' + cls + '">' + txtDif + '</td></tr>';
    }
    var mes = function (a) { return a == null || a < 0 ? '—' : F.mesCorto(a); };
    var cuerpo =
      fila('Ingresos (12 meses)', function (d) { return d.k.ingresos; }) +
      fila('Gastos de consumo (12 meses)', function (d) { return d.k.consumo; }, null, { menosEsMejor: true }) +
      fila('Ahorro en cuenta (12 meses)', function (d) { return d.k.ahorro; }) +
      fila('Tasa de ahorro', function (d) { return d.k.tasaAhorro; }, null, { fmt: function (x) { return F.pct(x, 1); }, fmtDif: function (x) { return (x > 0 ? '+' : '') + F.numero(x * 100, 1) + ' p.p.'; } }) +
      fila('Saldo a fin de año', function (d) { return d.k.saldoFin12; }) +
      fila('Invertido al mes (media)', function (d) { return Math.round(d.k.inversion / 12); }) +
      fila('Libre de deudas', function (d) { return d.finDeudas; }, null, { fmt: mes, menosEsMejor: true, fmtDif: function (x) { return (x > 0 ? '+' : '') + x + ' meses'; } }) +
      fila('Patrimonio a 10 años', function (d) { return C.patrimonioA(d.sim, 10); }) +
      fila('Patrimonio a 20 años', function (d) { return C.patrimonioA(d.sim, 20); }) +
      fila('Patrimonio a 30 años', function (d) { return C.patrimonioA(d.sim, 30); }) +
      fila('Patrimonio a 30 años (€ de hoy)', function (d) { return C.patrimonioA(d.sim, 30, true); }) +
      fila('Independencia financiera', function (d) { return d.k.mesesIF ? d.sim.inicio + d.k.mesesIF - 1 : null; }, null, { fmt: function (a) { return F.mesCorto(a); }, menosEsMejor: true, fmtDif: function (x) { return (x > 0 ? '+' : '−') + F.anios(Math.abs(x) / 12); } });
    var cam = PFWhatIf.cambios(A.e, B.e);
    var nombres = function (pref) {
      var out = [];
      ['partidas', 'huchas', 'inversiones', 'deudas'].forEach(function (k) {
        B.e[k].forEach(function (x) {
          var p = { partidas: 'p:', huchas: 'h:', inversiones: 'i:', deudas: 'd:' }[k] + x.id;
          if (cam.claves[p] === pref) out.push(x.nombre);
        });
      });
      return out;
    };
    var mod = nombres('mod'), nue = nombres('nuevo');
    var difs = (mod.length ? '<p><b>Cambian:</b> ' + mod.map(h).join(', ') + '</p>' : '') + (nue.length ? '<p><b>Solo en «' + h(B.e.nombre) + '»:</b> ' + nue.map(h).join(', ') + '</p>' : '') +
      (cam.eliminadas.length ? '<p><b>Solo en «' + h(A.e.nombre) + '»:</b> ' + cam.eliminadas.map(h).join(', ') + '</p>' : '') + (cam.otros.length ? '<p><b>También:</b> ' + cam.otros.join(', ') + '</p>' : '');
    return '<div class="rejilla r-31" style="margin-top:12px"><div class="card" data-form="es-cmp"><div class="card-h"><h3>Comparar</h3>' +
      U.select('a', lista, o.a, ' aria-label="Escenario A"') + '<span class="muted">frente a</span>' + U.select('b', lista.filter(function (x) { return x.id !== o.a; }), o.b, ' aria-label="Escenario B"') + '</div>' +
      '<table class="tabla"><thead><tr><th></th><th>' + h(A.e.nombre) + '</th><th>' + h(B.e.nombre) + '</th><th>Diferencia</th></tr></thead><tbody>' + cuerpo + '</tbody></table>' +
      '<div class="graf" style="margin-top:12px"><canvas id="es-graf" data-key="es-graf" role="img" aria-label="Patrimonio de los dos escenarios"></canvas></div></div>' +
      '<div class="card"><h3>Qué cambia</h3><div class="nota difs" style="margin-top:8px">' + (difs || 'Los dos escenarios tienen los mismos datos.') + '</div></div></div>';
  }
  function despues(c) {
    var D = datos(c), o = opc(c);
    if (!o.b) return;
    var A = D[o.a], B = D[o.b], T = PFCharts.tema(), a0 = C.anioDe(A.sim.inicio);
    var labels = ['Hoy'], sa = [A.sim.pat0 / 100], sb = [B.sim.pat0 / 100];
    for (var n = 1; n <= 40; n++) { labels.push(String(a0 + n)); sa.push(C.patrimonioA(A.sim, n) / 100); sb.push(C.patrimonioA(B.sim, n) / 100); }
    PFCharts.upsert('es-graf', { type: 'line', data: { labels: labels, datasets: [
      PFCharts.serie('line', T.s[0], { label: A.e.nombre, data: sa }),
      PFCharts.serie('line', T.s[1], { label: B.e.nombre, data: sb })
    ] }, options: PFCharts.opciones({ desdeCero: false }) });
  }

  function enlazar() {
    function bloqueoWhatIf() {
      if (PFWhatIf.activo()) { U.toast('Termina el modo ¿Y si…? (Aplicar o Descartar) antes de cambiar de escenario.', { tipo: 'error' }); return true; }
      return false;
    }
    U.accion('es-activar', function (el) {
      if (bloqueoWhatIf()) return;
      var id = el.getAttribute('data-id');
      PFStore.update(function (s) { s.escenarioActivo = id; }, { etiqueta: 'cambiar escenario' });
      U.toast('Escenario «' + PFStore.esc().nombre + '» activo.');
    });
    U.accion('es-duplicar', function (el) {
      var id = el.getAttribute('data-id'), base = PFStore.get().escenarios[id];
      U.pedirTexto({ titulo: 'Duplicar escenario', valor: base.nombre + ' (copia)', ok: 'Duplicar' }).then(function (nombre) {
        if (!nombre) return;
        var nuevo = S.clon(base); nuevo.id = S.uid('s'); nuevo.nombre = nombre; nuevo.creado = new Date().toISOString();
        PFStore.update(function (s) { s.escenarios[nuevo.id] = nuevo; s.orden.push(nuevo.id); }, { etiqueta: 'duplicar escenario' });
        setOpc({ a: id, b: nuevo.id });
        U.toast('Escenario «' + nombre + '» creado.', { accion: 'Activarlo', fn: function () { if (!bloqueoWhatIf()) PFStore.update(function (s) { s.escenarioActivo = nuevo.id; }, { etiqueta: 'cambiar escenario' }); } });
      });
    });
    U.accion('es-nuevo-vacio', function () {
      U.pedirTexto({ titulo: 'Nuevo escenario en blanco', texto: 'Empieza sin partidas (solo con tu cuenta a 0 €).', valor: 'Nuevo escenario', ok: 'Crear' }).then(function (nombre) {
        if (!nombre) return;
        var nuevo = S.escenario({ nombre: nombre, inicio: PFStore.esc().inicio, cuentas: [{ nombre: 'Cuenta corriente', saldo: 0 }] });
        PFStore.update(function (s) { s.escenarios[nuevo.id] = nuevo; s.orden.push(nuevo.id); }, { etiqueta: 'nuevo escenario' });
      });
    });
    U.accion('es-renombrar', function (el) {
      var id = el.getAttribute('data-id'), e = PFStore.get().escenarios[id];
      U.pedirTexto({ titulo: 'Renombrar escenario', valor: e.nombre, ok: 'Guardar' }).then(function (nombre) {
        if (nombre) PFStore.update(function (s) { s.escenarios[id].nombre = nombre; if (s.whatif && s.whatif.escenarioId === id) s.whatif.base.nombre = nombre; }, { etiqueta: 'renombrar escenario' });
      });
    });
    U.accion('es-borrar', function (el) {
      var id = el.getAttribute('data-id'), st = PFStore.get(), e = st.escenarios[id];
      if (st.orden.length < 2) return;
      U.confirmar({ titulo: 'Borrar «' + e.nombre + '»', texto: 'Se borra el escenario completo. Podrás deshacerlo con Ctrl+Z.', ok: 'Borrar escenario', peligro: true }).then(function (ok) {
        if (!ok) return;
        PFStore.update(function (s) {
          delete s.escenarios[id];
          s.orden = s.orden.filter(function (x) { return x !== id; });
          if (s.escenarioActivo === id) s.escenarioActivo = s.orden[0];
          if (s.whatif && s.whatif.escenarioId === id) s.whatif = null;
        }, { etiqueta: 'borrar escenario' });
        U.toast('Escenario «' + e.nombre + '» borrado.', { accion: 'Deshacer', fn: function () { PFStore.undo(); } });
      });
    });
    U.formulario('es-cmp', function (id, campo, v) {
      if (campo === 'a') setOpc({ a: v, b: opc(PFApp.ctx()).b === v ? null : opc(PFApp.ctx()).b });
      else if (campo === 'b') setOpc({ b: v });
    });
  }
  enlazar();
  PFUI.seccion('escenarios', { html: html, despues: despues });
  return {};
})();
