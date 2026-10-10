/* =============================================================================
   ui-networth.js · Patrimonio y largo plazo
   -----------------------------------------------------------------------------
   Patrimonio neto = líquido + huchas + inversiones (+ activos incluidos) − deudas,
   proyectado mes a mes hasta 40 años con hipótesis editables. Gráfico nominal y
   en euros de hoy con hitos, composición por años, cuentas y activos, y
   seguimiento real frente al plan.
   ============================================================================= */
var PFPatrimonio = (function () {
  'use strict';
  var C = PFCalc, F = PFFmt, h = PFFmt.html, U = PFUI, S = PFSchema;

  function opc(c) { return Object.assign({ tabla: 5 }, c.ui.patrimonio || {}); }
  function setOpc(p) { PFStore.setUI({ patrimonio: Object.assign({}, PFStore.getUI().patrimonio || {}, p) }); }

  function hitos(c) {
    var e = c.esc, sim = c.sim, out = [];
    e.deudas.forEach(function (d) { var a = sim.hitos.deudas[d.id]; if (a != null) out.push({ t: a - sim.inicio, etiqueta: 'Fin ' + d.nombre.toLowerCase(), tipo: 'deuda' }); });
    e.huchas.forEach(function (x) { var a = sim.hitos.huchas[x.id]; if (a != null && x.objetivo) out.push({ t: a - sim.inicio, etiqueta: 'Objetivo ' + x.nombre, tipo: 'hucha' }); });
    if (c.k.mesesIF) out.push({ t: c.k.mesesIF - 1, etiqueta: 'Independencia financiera', tipo: 'if' });
    var libre = Math.max.apply(null, [-1].concat(e.deudas.map(function (d) { var a = sim.hitos.deudas[d.id]; return a == null ? -1 : a - sim.inicio; })));
    if (e.deudas.length > 1 && libre >= 0) out.push({ t: libre, etiqueta: 'Libre de deudas', tipo: 'deuda' });
    return out.filter(function (x) { return x.t >= 0 && x.t < sim.meses; }).sort(function (a, b) { return a.t - b.t; });
  }

  // -------------------------------------------------------------- Render ---
  function html(c) {
    return kpis(c) + '<div class="rejilla r-31" style="margin-top:12px">' +
      '<div class="card"><div class="card-h"><h3>Patrimonio neto proyectado</h3><span class="sub">Nominal y en euros de hoy · escenario ' + ({ pes: 'pesimista', base: 'base', opt: 'optimista' }[c.hip.escenarioRent]) + '</span></div>' +
      '<div class="graf alto"><canvas id="pa-graf" data-key="pa-graf" role="img" aria-label="Patrimonio neto proyectado"></canvas></div>' +
      '<div class="hitos-l">' + hitos(c).map(function (x) { return '<span>' + h(x.etiqueta) + ': <b>' + F.mesCorto(c.sim.inicio + x.t) + '</b></span>'; }).join('') + '</div>' +
      '<p class="leyenda-nota">Estimación con tus hipótesis, no una garantía. El excedente que no inviertes se queda en la cuenta sin rentabilidad.</p></div>' +
      hipotesis(c) + '</div>' + composicion(c) + '<div class="rejilla r2" style="margin-top:12px">' + cuentasActivos(c) + seguimiento(c) + '</div>';
  }
  function kpis(c) {
    var sim = c.sim, k = c.k;
    var fin = Math.max.apply(null, [-1].concat(c.esc.deudas.map(function (d) { var a = sim.hitos.deudas[d.id]; return a == null ? -1 : a; })));
    function pa(n) { return U.kpi('A ' + n + ' años', F.eur0(C.patrimonioA(sim, n)), 'En euros de hoy: ' + F.eur0(C.patrimonioA(sim, n, true))); }
    return '<div class="kpis">' +
      U.kpi('Patrimonio neto hoy', F.eur0(sim.pat0), 'Deuda ' + F.eur0(sim.deuda0) + ' · inversiones ' + F.eur0(sim.inv0)) +
      pa(10) + pa(20) + pa(30) + pa(40) +
      U.kpi('Libre de deudas', c.esc.deudas.length ? (fin >= 0 ? F.mesLargo(fin) : 'más de 40 años') : 'Ya lo estás', c.esc.deudas.length ? c.esc.deudas.length + (c.esc.deudas.length === 1 ? ' deuda' : ' deudas') : '') +
      U.kpi('Independencia financiera', k.anioIF != null ? String(C.anioDe(sim.inicio + k.mesesIF - 1)) : '> 40 años',
            'Objetivo: ' + F.eur0(k.numeroIF) + ' (gasto anual × 25)' + (k.anioIF != null ? ' · en ' + F.anios(k.anioIF) : ''), null,
            'Regla del 4 %: con 25 veces tu gasto anual invertido podrías retirar un 4 % al año. Cuenta inversiones + cuenta − deudas, en euros de hoy.') +
      '</div>';
  }
  function hipotesis(c) {
    var hp = c.hip, invs = c.esc.inversiones;
    var opInv = [{ id: '', nombre: 'Elige inversión' }].concat(invs.map(function (x) { return { id: x.id, nombre: x.nombre }; }));
    return '<div class="card" data-form="hipotesis"><div class="card-h"><h3>Hipótesis</h3><span class="sub">De este escenario</span></div>' +
      '<div class="sls" style="grid-template-columns:1fr">' +
      U.slider({ f: 'subidaSalarial', t: 'rng-pct', tv: 'pct', min: 0, max: 6, step: 0.1, valor: +(hp.subidaSalarial * 100).toFixed(1), etiqueta: 'Subida salarial anual', texto: F.numero(hp.subidaSalarial * 100, 1), sub: 'Se aplica a los ingresos cada 12 meses' }) +
      U.slider({ f: 'inflacion', t: 'rng-pct', tv: 'pct', min: 0, max: 8, step: 0.1, valor: +(hp.inflacion * 100).toFixed(1), etiqueta: 'Inflación (sobre gastos)', texto: F.numero(hp.inflacion * 100, 1), sub: 'Sube los gastos y descuenta a euros de hoy' }) +
      U.slider({ f: 'pctExcedente', t: 'rng-pct', tv: 'pct', min: 0, max: 100, step: 5, valor: Math.round(hp.pctExcedente * 100), etiqueta: '% del excedente que inviertes', texto: F.numero(hp.pctExcedente * 100, 0),
                 sub: hp.pctExcedente > 0 ? '≈ ' + F.eur0(C.suma(c.sim.m.invExcedente, 0, 12) / 12) + '/mes de media el primer año' : 'Ahora se queda en la cuenta' }) +
      '</div>' +
      '<div class="form-grid" style="margin-top:10px;grid-template-columns:1fr 1fr">' +
      '<div class="fld"><span class="fld-l">Excedente invertido en</span>' + U.select('destinoExcedente', opInv, hp.destinoExcedente || '') + '</div>' +
      '<div class="fld"><span class="fld-l">Cuotas liberadas</span>' + U.select('destinoLiberadas', [{ id: 'caja', nombre: 'Se quedan en la cuenta' }, { id: 'inversion', nombre: 'Pasan a inversión' }].concat(c.esc.deudas.length > 1 ? [{ id: 'deudas', nombre: 'A la siguiente deuda' }] : []), hp.destinoLiberadas) + '</div>' +
      (hp.destinoLiberadas !== 'caja' ? '<div class="fld"><span class="fld-l">Inversión de destino</span>' + U.select('invLiberadas', opInv, hp.invLiberadas || '') + '</div>' : '') +
      '<div class="fld"><span class="fld-l">Rentabilidad</span>' + U.seg([{ id: 'pes', nombre: 'Pesim.' }, { id: 'base', nombre: 'Base' }, { id: 'opt', nombre: 'Optim.' }], hp.escenarioRent, { 'data-f': 'escenarioRent' }, 'mini') + '</div>' +
      '<div class="fld"><span class="fld-l">Coste de oportunidad al</span><div class="fila-ctl">' + U.campoPct('rentDefecto', hp.rentDefecto, 1, ' style="width:70px"') + '<span class="muted">%</span></div></div>' +
      '</div>' +
      (hp.pctExcedente > 0 && !hp.destinoExcedente ? '<p class="banner warn sm">' + U.icono('alerta') + '<span>Elige en qué inversión va el excedente.</span></p>' : '') +
      (hp.destinoLiberadas === 'inversion' && !hp.invLiberadas ? '<p class="banner warn sm">' + U.icono('alerta') + '<span>Elige la inversión que recibe las cuotas liberadas.</span></p>' : '') +
      '</div>';
  }
  function composicion(c) {
    var o = opc(c), sim = c.sim, M = sim.m, paso = o.tabla, a0 = C.anioDe(sim.inicio);
    var anios = []; for (var n = paso; n <= 40; n += paso) anios.push(n);
    if (paso > 1) anios.unshift(1);
    var filas = '<tr class="sep"><td class="izq">Hoy</td><td>' + F.eur0(sim.caja0) + '</td><td>' + F.eur0(sim.huchas0) + '</td><td>' + F.eur0(sim.inv0) + '</td><td>' + F.eur0(activosHoy(c)) + '</td><td>' + F.eur0(-sim.deuda0) + '</td><td><b>' + F.eur0(sim.pat0) + '</b></td><td>' + F.eur0(sim.pat0) + '</td></tr>';
    filas += anios.map(function (n) {
      var t = n * 12 - 1;
      return '<tr><td class="izq">' + (a0 + n) + ' <span class="muted">(' + n + ')</span></td><td class="' + (M.caja[t] < 0 ? 'neg' : '') + '">' + F.eur0(M.caja[t]) + '</td><td>' + F.eur0(M.huchasSaldo[t]) + '</td><td>' + F.eur0(M.invValor[t]) + '</td>' +
        '<td>' + F.eur0(M.activos[t]) + '</td><td>' + F.eur0(-M.deuda[t]) + '</td><td><b>' + F.eur0(M.patrimonio[t]) + '</b></td><td>' + F.eur0(M.patrimonioReal[t]) + '</td></tr>';
    }).join('');
    return '<div class="card" data-form="pa-vista" style="margin-top:12px"><div class="card-h"><h3>Composición del patrimonio</h3>' +
      U.seg([{ id: 1, nombre: 'Cada año' }, { id: 5, nombre: 'Cada 5 años' }], paso, { 'data-f': 'tabla', 'data-t': 'num' }, 'mini') + '</div>' +
      '<div class="tabla-scroll"><table class="tabla"><thead><tr><th>Año</th><th>Cuenta</th><th>Huchas</th><th>Inversiones</th><th data-tip="Solo los activos marcados para incluir en el patrimonio">Vivienda / vehículo</th><th>Deudas</th><th>Patrimonio neto</th><th>En € de hoy</th></tr></thead><tbody>' + filas + '</tbody></table></div></div>';
  }
  function activosHoy(c) { return c.esc.activos.reduce(function (s, x) { return s + (x.incluir ? x.valor : 0); }, 0); }
  function cuentasActivos(c) {
    var e = c.esc;
    var cu = e.cuentas.map(function (x) {
      return '<tr data-form="cuenta-pa" data-id="' + h(x.id) + '"><td class="izq"><input class="in" data-f="nombre" data-t="txt" value="' + h(x.nombre) + '" aria-label="Nombre de la cuenta"></td>' +
        '<td>' + U.campoEur('saldo', x.saldo, ' style="width:110px" aria-label="Saldo"') + '</td>' +
        '<td><label class="sw-l">' + U.sw(x.liquida !== false, { 'data-f': 'liquida' }, 'Líquida') + 'Líquida</label></td>' +
        '<td><button type="button" class="btn ico-b sm ghost" data-act="pa-cuenta-borrar" data-id="' + h(x.id) + '" aria-label="Borrar cuenta">' + U.icono('papelera') + '</button></td></tr>';
    }).join('');
    var ac = e.activos.map(function (x) {
      return '<tr data-form="activo" data-id="' + h(x.id) + '"><td class="izq"><input class="in" data-f="nombre" data-t="txt" value="' + h(x.nombre) + '" aria-label="Nombre del activo"></td>' +
        '<td>' + U.campoEur('valor', x.valor, ' style="width:110px" aria-label="Valor"') + '</td>' +
        '<td><div class="fila-ctl">' + U.campoPct('variacion', x.variacion, 1, ' style="width:64px" aria-label="Variación anual"') + '<span class="muted">%/año</span></div></td>' +
        '<td><label class="sw-l">' + U.sw(!!x.incluir, { 'data-f': 'incluir' }, 'Incluir en patrimonio') + 'Incluir</label></td>' +
        '<td><button type="button" class="btn ico-b sm ghost" data-act="pa-activo-borrar" data-id="' + h(x.id) + '" aria-label="Borrar activo">' + U.icono('papelera') + '</button></td></tr>';
    }).join('');
    return '<div class="card"><div class="card-h"><h3>Cuentas y efectivo</h3><button type="button" class="btn sm" data-act="pa-cuenta-add">' + U.icono('mas') + 'Cuenta</button></div>' +
      '<table class="tabla tabla-form"><tbody>' + (cu || '<tr><td class="muted izq">Sin cuentas.</td></tr>') + '</tbody></table>' +
      '<p class="nota" style="margin:6px 0 14px">La suma es el saldo inicial del presupuesto. «Líquida» cuenta para el colchón de emergencia.</p>' +
      '<div class="card-h"><h3>Otros activos</h3><button type="button" class="btn sm" data-act="pa-activo-add">' + U.icono('mas') + 'Activo</button></div>' +
      '<table class="tabla tabla-form"><tbody>' + (ac || '<tr><td class="muted izq">Sin activos (vivienda, vehículo…).</td></tr>') + '</tbody></table>' +
      '<p class="nota" style="margin-top:6px">Prudente: la vivienda habitual y el coche no se venden para vivir, por eso por defecto no cuentan en el patrimonio. El vehículo suele perder un 10–15 % al año.</p></div>';
  }
  function planEnMes(c, a) {
    var t = a - c.sim.inicio, M = c.sim.m;
    if (t < 0 || t >= c.sim.meses) return null;
    return { liquido: M.caja[t], huchas: M.huchasSaldo[t], inversiones: M.invValor[t], deudas: M.deuda[t], total: M.caja[t] + M.huchasSaldo[t] + M.invValor[t] - M.deuda[t] };
  }
  function seguimiento(c) {
    var seg = c.s.seguimiento, mesDef = C.ymStr(Math.max(C.ym(c.esc.inicio), C.hoyYM()));
    var p = planEnMes(c, C.ym(mesDef)) || { liquido: 0, huchas: 0, inversiones: 0, deudas: 0 };
    var filas = seg.slice().reverse().map(function (r) {
      var real = r.liquido + r.huchas + r.inversiones - r.deudas;
      var pl = planEnMes(c, C.ym(r.mes));
      var dif = pl ? real - pl.total : null;
      var tip = pl ? 'Plan: cuenta ' + F.eur0(pl.liquido) + ' · huchas ' + F.eur0(pl.huchas) + ' · inversiones ' + F.eur0(pl.inversiones) + ' · deudas ' + F.eur0(pl.deudas) +
        '\nReal: cuenta ' + F.eur0(r.liquido) + ' · huchas ' + F.eur0(r.huchas) + ' · inversiones ' + F.eur0(r.inversiones) + ' · deudas ' + F.eur0(r.deudas) : 'Fuera del horizonte del plan';
      return '<tr data-tip="' + h(tip) + '"><td class="izq">' + F.mesCorto(C.ym(r.mes)) + '</td><td>' + F.eur0(real) + '</td><td>' + (pl ? F.eur0(pl.total) : '—') + '</td>' +
        '<td class="' + (dif == null ? '' : dif >= 0 ? 'pos' : 'neg') + '">' + (dif == null ? '—' : F.eur0(dif, { signo: true }) + (pl.total ? ' (' + F.pct(dif / Math.abs(pl.total), 1) + ')' : '')) + '</td>' +
        '<td><button type="button" class="btn ico-b sm ghost" data-act="pa-seg-borrar" data-mes="' + h(r.mes) + '" aria-label="Borrar registro">' + U.icono('papelera') + '</button></td></tr>';
    }).join('');
    return '<div class="card"><div class="card-h"><h3>Seguimiento real frente al plan</h3></div>' +
      '<p class="nota" style="margin-bottom:8px">Cada mes, anota tus saldos reales (a final de mes). Te digo cuánto te desvías del plan del escenario activo.</p>' +
      '<div class="form-grid seg-form" style="grid-template-columns:repeat(3,minmax(0,1fr))">' +
      '<div class="fld"><span class="fld-l">Mes</span><input class="in" type="month" id="seg-mes" value="' + mesDef + '"></div>' +
      '<div class="fld"><span class="fld-l">Cuentas</span><input class="in num" id="seg-liquido" inputmode="decimal" placeholder="' + F.numero(p.liquido / 100, 0) + '"></div>' +
      '<div class="fld"><span class="fld-l">Huchas</span><input class="in num" id="seg-huchas" inputmode="decimal" placeholder="' + F.numero(p.huchas / 100, 0) + '"></div>' +
      '<div class="fld"><span class="fld-l">Inversiones</span><input class="in num" id="seg-inversiones" inputmode="decimal" placeholder="' + F.numero(p.inversiones / 100, 0) + '"></div>' +
      '<div class="fld"><span class="fld-l">Deudas pendientes</span><input class="in num" id="seg-deudas" inputmode="decimal" placeholder="' + F.numero(p.deudas / 100, 0) + '"></div>' +
      '<div class="fld"><span class="fld-l">&nbsp;</span><button type="button" class="btn prim" data-act="pa-seg-add">Registrar mes</button></div></div>' +
      '<p class="fld-a" style="margin-top:4px">Los valores en gris son los del plan para ese mes; si dejas un campo vacío se usa el del plan.</p>' +
      (seg.length ? '<div class="graf bajo" style="margin-top:10px"><canvas id="pa-seg" data-key="pa-seg" role="img" aria-label="Patrimonio real frente al plan"></canvas></div>' : '') +
      '<table class="tabla" style="margin-top:10px"><thead><tr><th>Mes</th><th>Real</th><th>Plan</th><th>Desviación</th><th></th></tr></thead><tbody>' +
      (filas || '<tr><td colspan="5" class="izq muted">Aún no has registrado ningún mes.</td></tr>') + '</tbody></table></div>';
  }

  // ----------------------------------------------------------- Gráficos ---
  function despues(c) {
    var sim = c.sim, M = sim.m, T = PFCharts.tema();
    var labels = []; for (var t = 0; t < sim.meses; t++) labels.push(F.mesCorto(sim.inicio + t));
    labels.unshift('hoy');
    var nom = [sim.pat0 / 100].concat(M.patrimonio.map(function (v) { return v / 100; }));
    var real = [sim.pat0 / 100].concat(M.patrimonioReal.map(function (v) { return v / 100; }));
    var op = PFCharts.opciones({ hitos: hitos(c).map(function (x) { return { x: x.t + 1, etiqueta: x.etiqueta }; }), holgura: '12%', desdeCero: false });
    op.scales.x.ticks.callback = function (v, i) { var a = sim.inicio + i - 1; return i === 0 ? 'hoy' : (C.mesDe(a) === 1 && i > 12 && (C.anioDe(a) % (sim.meses > 240 ? 5 : 2) === 0) ? String(C.anioDe(a)) : null); };
    op.scales.x.ticks.autoSkip = false;
    PFCharts.upsert('pa-graf', { type: 'line', data: { labels: labels, datasets: [
      PFCharts.serie('area', T.s[0], { label: 'Patrimonio neto (nominal)', data: nom, backgroundColor: PFCharts.alfa(T.s[0], 0.10) }),
      PFCharts.serie('line', T.s[2], { label: 'En euros de hoy', data: real })
    ] }, options: op });
    var seg = c.s.seguimiento;
    if (seg.length) {
      var desde = Math.min(C.ym(seg[0].mes), sim.inicio), hasta = Math.max(C.ym(seg[seg.length - 1].mes) + 3, sim.inicio + 11);
      var lab = [], plan = [], realS = [];
      var idx = {}; seg.forEach(function (r) { idx[r.mes] = r; });
      for (var a = desde; a <= hasta; a++) {
        lab.push(F.mesCorto(a));
        var p = planEnMes(c, a); plan.push(p ? p.total / 100 : null);
        var r = idx[C.ymStr(a)]; realS.push(r ? (r.liquido + r.huchas + r.inversiones - r.deudas) / 100 : null);
      }
      PFCharts.upsert('pa-seg', { type: 'line', data: { labels: lab, datasets: [
        PFCharts.serie('line', T.ink3, { label: 'Plan', data: plan, borderDash: [5, 4], borderWidth: 1.5 }),
        PFCharts.serie('line', T.s[0], { label: 'Real', data: realS, pointRadius: 4, pointBorderColor: T.surface, pointBorderWidth: 2, spanGaps: true })
      ] }, options: PFCharts.opciones({ desdeCero: false }) });
    }
  }

  // ----------------------------------------------------------- Acciones ---
  function enlazar() {
    U.formulario('pa-vista', function (id, campo, v) { if (campo === 'tabla') setOpc({ tabla: +v }); });
    U.formulario('cuenta-pa', function (id, campo, v) {
      PFStore.update(function (s, e) { var x = e.cuentas.filter(function (y) { return y.id === id; })[0]; if (!x) return; if (campo === 'nombre' && !String(v).trim()) return; x[campo] = v; }, { etiqueta: 'editar cuenta' });
    });
    U.formulario('activo', function (id, campo, v) {
      PFStore.update(function (s, e) { var x = e.activos.filter(function (y) { return y.id === id; })[0]; if (!x) return; if (campo === 'nombre' && !String(v).trim()) return; x[campo] = v; }, { etiqueta: 'editar activo' });
    });
    U.accion('pa-cuenta-add', function () { PFStore.update(function (s, e) { e.cuentas.push(S.cuenta({ nombre: 'Nueva cuenta', saldo: 0 })); }, { etiqueta: 'añadir cuenta' }); });
    U.accion('pa-activo-add', function () { PFStore.update(function (s, e) { e.activos.push(S.activo({ nombre: 'Nuevo activo', tipo: 'otro', valor: 0 })); }, { etiqueta: 'añadir activo' }); });
    U.accion('pa-cuenta-borrar', function (el) {
      var id = el.getAttribute('data-id'), x = PFStore.esc().cuentas.filter(function (y) { return y.id === id; })[0];
      U.confirmar({ titulo: 'Borrar «' + x.nombre + '»', texto: 'Su saldo dejará de contar como saldo inicial.', ok: 'Borrar', peligro: true }).then(function (ok) {
        if (ok) PFStore.update(function (s, e) { e.cuentas = e.cuentas.filter(function (y) { return y.id !== id; }); }, { etiqueta: 'borrar cuenta' });
      });
    });
    U.accion('pa-activo-borrar', function (el) {
      var id = el.getAttribute('data-id'), x = PFStore.esc().activos.filter(function (y) { return y.id === id; })[0];
      U.confirmar({ titulo: 'Borrar «' + x.nombre + '»', ok: 'Borrar', peligro: true }).then(function (ok) {
        if (ok) PFStore.update(function (s, e) { e.activos = e.activos.filter(function (y) { return y.id !== id; }); }, { etiqueta: 'borrar activo' });
      });
    });
    U.accion('pa-seg-add', function () {
      var c = PFApp.ctx(), mes = document.getElementById('seg-mes').value;
      if (!/^\d{4}-\d{2}$/.test(mes)) { U.toast('Elige el mes.', { tipo: 'error' }); return; }
      var p = planEnMes(c, C.ym(mes)) || { liquido: 0, huchas: 0, inversiones: 0, deudas: 0 };
      var r = { mes: mes }, ok = true;
      ['liquido', 'huchas', 'inversiones', 'deudas'].forEach(function (k) {
        var txt = document.getElementById('seg-' + k).value.trim();
        if (!txt) { r[k] = p[k]; return; }
        var v = F.leerImporte(txt); if (v == null) ok = false; else r[k] = v;
      });
      if (!ok) { U.toast('Revisa los importes.', { tipo: 'error' }); return; }
      PFStore.update(function (s) {
        s.seguimiento = s.seguimiento.filter(function (x) { return x.mes !== mes; }).concat([Object.assign({ otros: 0, nota: '' }, r)]).sort(function (a, b) { return a.mes < b.mes ? -1 : 1; });
      }, { etiqueta: 'registrar ' + mes });
      ['liquido', 'huchas', 'inversiones', 'deudas'].forEach(function (k) { var el = document.getElementById('seg-' + k); if (el) el.value = ''; });
      U.toast('Mes registrado.');
    });
    U.accion('pa-seg-borrar', function (el) {
      var mes = el.getAttribute('data-mes');
      PFStore.update(function (s) { s.seguimiento = s.seguimiento.filter(function (x) { return x.mes !== mes; }); }, { etiqueta: 'borrar registro' });
      U.toast('Registro borrado.', { accion: 'Deshacer', fn: function () { PFStore.undo(); } });
    });
  }
  enlazar();
  PFUI.seccion('patrimonio', { html: html, despues: despues });
  return { hitos: hitos, planEnMes: planEnMes };
})();
