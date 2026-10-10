/* =============================================================================
   ui-invest.js · Inversiones
   -----------------------------------------------------------------------------
   Por inversión y en total: deslizadores (aportación, rentabilidad, TER,
   crecimiento de la aportación, horizonte, inflación) con recálculo en vivo,
   tres escenarios (pesimista / base / optimista), tabla año a año (valor real
   y neto tras impuestos si vendieras), gráfico apilado aportado vs rendimientos
   y comparador de aportaciones.
   ============================================================================= */
var PFInversiones = (function () {
  'use strict';
  var C = PFCalc, F = PFFmt, h = PFFmt.html, U = PFUI, S = PFSchema;
  var ESC = [{ id: 'pes', nombre: 'Pesimista' }, { id: 'base', nombre: 'Base' }, { id: 'opt', nombre: 'Optimista' }];

  function opc(c) {
    var o = Object.assign({ sel: null, horizonte: 20, inflacion: null, esc: 'base', cmpA: null, cmpN: null, cmpInv: null }, c.ui.inversiones || {});
    var invs = c.esc.inversiones;
    if (o.sel !== 'total' && !invs.some(function (x) { return x.id === o.sel; })) o.sel = invs.length ? invs[0].id : 'total';
    o.inf = o.inflacion == null ? c.hip.inflacion : o.inflacion;
    o.N = Math.max(1, Math.min(40, o.horizonte | 0));
    return o;
  }
  function setOpc(p) { PFStore.setUI({ inversiones: Object.assign({}, PFStore.getUI().inversiones || {}, p) }); }
  function color(c, id) { var i = c.esc.inversiones.map(function (x) { return x.id; }).indexOf(id); return 'var(--s' + ((i % 8) + 1) + ')'; }

  // ------------------------------------------------------------ Cálculo ---
  function proyectar(c, x, clave, N, inf, cambios) {
    return C.proyectarInversion(Object.assign({
      valor: x.valor, aportado: x.aportado, aportacion: x.activa === false ? 0 : x.aportacion, crecimiento: x.crecimiento,
      extraordinarias: x.extraordinarias, inicio: c.esc.inicio, rAnual: C.rentDe(x, clave), ter: x.ter, anios: N, inflacion: inf, escala: c.escala
    }, cambios || {}));
  }
  /** Cartera total: suma por año; el impuesto se calcula sobre la ganancia conjunta (se compensan pérdidas y ganancias). */
  function proyectarTotal(c, clave, N, inf) {
    var filas = [];
    c.esc.inversiones.forEach(function (x) {
      proyectar(c, x, clave, N, inf).filas.forEach(function (f, i) {
        if (!filas[i]) filas[i] = { anio: f.anio, aportado: 0, valor: 0 };
        filas[i].aportado += f.aportado; filas[i].valor += f.valor;
      });
    });
    if (!filas.length) for (var a = 0; a <= N; a++) filas.push({ anio: a, aportado: 0, valor: 0 });
    filas.forEach(function (f) {
      f.rendimientos = f.valor - f.aportado;
      f.impuesto = C.impuestoAhorro(f.rendimientos, c.escala);
      f.neto = f.valor - f.impuesto;
      f.real = C.redondear(f.valor / Math.pow(1 + inf, f.anio));
      f.netoReal = C.redondear(f.neto / Math.pow(1 + inf, f.anio));
    });
    return { filas: filas, final: filas[filas.length - 1] };
  }
  function proyecciones(c, o, x) {
    var r = {};
    ESC.forEach(function (e) { r[e.id] = x ? proyectar(c, x, e.id, o.N, o.inf) : proyectarTotal(c, e.id, o.N, o.inf); });
    return r;
  }

  // ------------------------------------------------------------- Render ---
  function html(c) {
    var o = opc(c), e = c.esc;
    var x = o.sel === 'total' ? null : e.inversiones.filter(function (y) { return y.id === o.sel; })[0];
    var pr = proyecciones(c, o, x);
    return '<div class="rejilla r-13">' + columnaLista(c, o) +
      '<div class="col-der">' + (x ? panelInversion(c, o, x) : panelTotal(c, o, pr)) + kpis(c, o, x, pr) +
      '<div class="card"><div class="card-h"><h3>Aportado frente a rendimientos <span class="sub">· ' + (x ? h(x.nombre) : 'cartera total') + ', escenario base y rango pesimista–optimista</span></h3></div>' +
      '<div class="graf alto"><canvas id="inv-graf" data-key="inv-graf" role="img" aria-label="Evolución del valor de la inversión"></canvas></div>' +
      '<p class="leyenda-nota">Rentabilidad anual efectiva menos comisiones, pasada a mensual: (1 + r − TER)^(1/12) − 1; aportaciones a final de mes. Estimaciones, no garantías.</p></div>' +
      tablaAnual(c, o, pr) + comparador(c, o, x) +
      '</div></div>';
  }
  function columnaLista(c, o) {
    var e = c.esc;
    var tv = 0, ta = 0, tm = 0;
    e.inversiones.forEach(function (x) { tv += x.valor; ta += x.aportado; tm += x.activa === false ? 0 : x.aportacion; });
    function sub(v, a, m) {
      var g = v - a;
      return '<span class="is-s"><span class="' + (g >= 0 ? 'pos' : 'neg') + '">' + F.eur0(g, { signo: true }) + (a ? ' (' + F.pct(g / a, 1) + ')' : '') + '</span> · ' + F.eur0(m) + '/mes</span>';
    }
    var items = '<button type="button" class="item-sel' + (o.sel === 'total' ? ' on' : '') + '" data-act="inv-sel" data-id="total" aria-pressed="' + (o.sel === 'total') + '">' +
      '<span class="is-n">Cartera total</span><span class="is-v">' + F.eur0(tv) + '</span>' + sub(tv, ta, tm) + '</button>';
    e.inversiones.forEach(function (x) {
      var on = o.sel === x.id;
      var clase = (S.CLASES.filter(function (k) { return k.id === x.clase; })[0] || {}).nombre;
      items += '<button type="button" class="item-sel' + (on ? ' on' : '') + '" data-act="inv-sel" data-id="' + h(x.id) + '" aria-pressed="' + on + '">' +
        '<span class="is-n"><span class="punto" style="background:' + color(c, x.id) + '"></span>' + h(x.nombre) + '</span>' +
        '<span class="is-v">' + F.eur0(x.valor) + '</span>' + sub(x.valor, x.aportado, x.activa === false ? 0 : x.aportacion) +
        '<span class="is-s">' + h(clase) + ' · base ' + F.pct(C.rentDe(x, 'base'), 1) + (x.ter ? ' − TER ' + F.pct(x.ter, 2) : '') + '</span></button>';
    });
    return '<div class="col-izq"><div class="lista-sel">' + items + '</div>' +
      '<button type="button" class="btn sm" data-act="inv-add" style="margin-top:8px">' + U.icono('mas') + 'Añadir inversión</button>' +
      '<div class="card nota" style="margin-top:12px"><b>Cómo se calcula.</b> La rentabilidad es anual efectiva; se le resta la comisión (TER) y se pasa a mensual. ' +
      'El impuesto si vendes aplica la escala del ahorro a la ganancia (valor − aportado): 19 % hasta 6.000 €, 21 % hasta 50.000 €, 23 % hasta 200.000 €, 27 % hasta 300.000 € y 30 % por encima. ' +
      'Los fondos traspasables no tributan al cambiar de fondo; aquí se supone que vendes.</div></div>';
  }
  function vistaSliders(c, o) {
    return '<div data-form="inv-vista">' +
      U.slider({ f: 'horizonte', t: 'rng-int', tv: 'int', min: 1, max: 40, step: 1, valor: o.N, etiqueta: 'Horizonte (años)', texto: String(o.N), sub: 'Hasta ' + (C.anioDe(C.ym(c.esc.inicio)) + o.N) }) +
      '</div><div data-form="inv-vista">' +
      U.slider({ f: 'inflacion', t: 'rng-pct', tv: 'pct', min: 0, max: 8, step: 0.1, valor: +(o.inf * 100).toFixed(1), etiqueta: 'Inflación', texto: F.numero(o.inf * 100, 1),
                 sub: o.inflacion == null ? 'La del plan (' + F.pct(c.hip.inflacion, 1) + ')' : '<button type="button" class="btn-link" data-act="inv-inf-reset">Volver a la del plan (' + F.pct(c.hip.inflacion, 1) + ')</button>' }) +
      '</div>';
  }
  function panelInversion(c, o, x) {
    var rb = C.rentDe(x, 'base'), cripto = x.clase === 'cripto';
    var ext = (x.extraordinarias || []).slice().sort(function (a, b) { return a.mes < b.mes ? -1 : 1; });
    var aho = c.k.ahorro / 12;
    return '<div class="card" data-form="inversion" data-id="' + h(x.id) + '">' +
      '<div class="card-h"><input class="in titulo-in" data-f="nombre" data-t="txt" value="' + h(x.nombre) + '" aria-label="Nombre de la inversión">' +
      U.select('clase', S.CLASES, x.clase, ' aria-label="Tipo de activo"') +
      '<label class="sw-l">' + U.sw(x.activa !== false, { 'data-f': 'activa' }, 'Aportaciones activas') + 'Aportaciones activas</label>' +
      '<button type="button" class="btn sm ghost peligro" data-act="inv-borrar" data-id="' + h(x.id) + '">' + U.icono('papelera') + 'Borrar</button></div>' +
      '<div class="form-grid" style="margin-bottom:12px">' +
      '<div class="fld"><span class="fld-l">Valor actual</span>' + U.campoEur('valor', x.valor) + '</div>' +
      '<div class="fld"><span class="fld-l">Total aportado</span>' + U.campoEur('aportado', x.aportado) + '</div>' +
      '<div class="fld"><span class="fld-l">Rentabilidad pesimista</span><div class="fila-ctl">' + U.campoPct('rentPes', x.rent.pes, 1, ' style="width:80px"') + '<span class="muted">%</span></div></div>' +
      '<div class="fld"><span class="fld-l">Rentabilidad optimista</span><div class="fila-ctl">' + U.campoPct('rentOpt', x.rent.opt, 1, ' style="width:80px"') + '<span class="muted">%</span></div></div>' +
      '</div>' +
      '<div class="sls">' +
      U.slider({ f: 'aportacion', t: 'rng-eur', tv: 'eur', min: 0, max: Math.max(1000, Math.ceil(x.aportacion / 100 / 500) * 500 * 2), step: 5, valor: x.aportacion / 100,
                 etiqueta: 'Aportación mensual', texto: F.numero(x.aportacion / 100, 2), sub: x.activa === false ? 'Pausada: no cuenta en el presupuesto' : F.eur0(x.aportacion * 12) + ' al año · tu ahorro medio en cuenta: ' + F.eur0(aho) + '/mes' }) +
      U.slider({ f: 'rentBase', t: 'rng-pct', tv: 'pct', min: cripto ? -30 : -10, max: cripto ? 40 : 20, step: 0.1, valor: +(rb * 100).toFixed(1),
                 etiqueta: 'Rentabilidad esperada (base)', texto: F.numero(rb * 100, 1), sub: 'Anual efectiva, antes de comisiones' }) +
      U.slider({ f: 'ter', t: 'rng-pct', tv: 'pct', min: 0, max: 2.5, step: 0.01, valor: +(x.ter * 100).toFixed(2), etiqueta: 'Comisión anual (TER)', texto: F.numero(x.ter * 100, 2),
                 sub: 'Neta: ' + F.pct(rb - x.ter, 2) + ' al año' }) +
      U.slider({ f: 'crecimiento', t: 'rng-pct', tv: 'pct', min: 0, max: 10, step: 0.5, valor: +(x.crecimiento * 100).toFixed(1), etiqueta: 'Subida anual de la aportación', texto: F.numero(x.crecimiento * 100, 1),
                 sub: x.crecimiento ? 'En ' + o.N + ' años aportarías ' + F.eur0(C.redondear(x.aportacion * Math.pow(1 + x.crecimiento, o.N - 1))) + '/mes' : 'Aportación constante' }) +
      '</div>' +
      '<div class="sls" style="margin-top:14px">' + vistaSliders(c, o) + '</div>' +
      '<div class="fld" style="margin-top:14px"><span class="fld-l">Aportaciones extraordinarias</span><div class="fila-ctl">' +
      (ext.length ? ext.map(function (e) {
        return '<span class="chip">' + h(F.mesCorto(C.ym(e.mes))) + ': ' + F.eur0(e.importe) + ' <button type="button" class="btn-link" data-act="inv-ext-quitar" data-id="' + h(e.id) + '" aria-label="Quitar">×</button></span>';
      }).join('') : '<span class="muted">Ninguna.</span>') +
      '<span class="sp"></span><input class="in" type="month" id="inv-ext-mes" value="' + h(C.ymStr(Math.max(C.hoyYM(), C.ym(c.esc.inicio)) + 1)) + '" aria-label="Mes">' +
      '<input class="in num" id="inv-ext-imp" placeholder="Importe" style="width:100px" inputmode="decimal" aria-label="Importe">' +
      '<button type="button" class="btn sm" data-act="inv-ext-add">' + U.icono('mas') + 'Añadir</button></div></div>' +
      '</div>';
  }
  function panelTotal(c, o, pr) {
    var e = c.esc, filas = '';
    var tot = { v: 0, a: 0, m: 0 };
    var finales = {};
    e.inversiones.forEach(function (x) {
      finales[x.id] = {};
      ESC.forEach(function (s) { finales[x.id][s.id] = proyectar(c, x, s.id, o.N, o.inf).final.valor; });
      tot.v += x.valor; tot.a += x.aportado; tot.m += x.activa === false ? 0 : x.aportacion;
    });
    e.inversiones.forEach(function (x) {
      var g = x.valor - x.aportado;
      filas += '<tr><td class="izq"><span class="punto" style="background:' + color(c, x.id) + '"></span> <button type="button" class="btn-link" data-act="inv-sel" data-id="' + h(x.id) + '">' + h(x.nombre) + '</button></td>' +
        '<td>' + F.eur0(x.valor) + '</td><td class="' + (g >= 0 ? 'pos' : 'neg') + '">' + F.eur0(g, { signo: true }) + '</td><td>' + F.eur0(x.activa === false ? 0 : x.aportacion) + '</td>' +
        '<td>' + F.pct(C.rentDe(x, 'base'), 1) + '</td><td>' + F.pct(x.ter, 2) + '</td>' +
        '<td>' + F.eur0(finales[x.id].pes) + '</td><td><b>' + F.eur0(finales[x.id].base) + '</b></td><td>' + F.eur0(finales[x.id].opt) + '</td>' +
        '<td>' + (tot.v ? F.pct(x.valor / tot.v, 0) : '—') + '</td></tr>';
    });
    var gT = tot.v - tot.a;
    filas += '<tr class="destacada"><td class="izq">Total</td><td>' + F.eur0(tot.v) + '</td><td class="' + (gT >= 0 ? 'pos' : 'neg') + '">' + F.eur0(gT, { signo: true }) + '</td><td>' + F.eur0(tot.m) + '</td><td></td><td></td>' +
      '<td>' + F.eur0(pr.pes.final.valor) + '</td><td>' + F.eur0(pr.base.final.valor) + '</td><td>' + F.eur0(pr.opt.final.valor) + '</td><td>100 %</td></tr>';
    var pesoCripto = 0;
    e.inversiones.forEach(function (x) { if (x.clase === 'cripto') pesoCripto += x.valor; });
    return '<div class="card"><div class="card-h"><h3>Cartera total</h3>' +
      '<span class="sub">Cada activo con sus propios escenarios de rentabilidad</span></div>' +
      '<div class="tabla-scroll" style="max-height:none"><table class="tabla"><thead><tr><th>Inversión</th><th>Valor hoy</th><th>Ganancia</th><th>€/mes</th><th>Rent. base</th><th>TER</th>' +
      '<th>Pesimista ' + o.N + ' a</th><th>Base ' + o.N + ' a</th><th>Optimista ' + o.N + ' a</th><th data-tip="Peso de cada activo en el valor actual de la cartera">Peso hoy</th></tr></thead><tbody>' + filas + '</tbody></table></div>' +
      (tot.v && pesoCripto / tot.v > 0.5 ? '<p class="nota" style="margin-top:8px">La cripto es el ' + F.pct(pesoCripto / tot.v, 0) + ' del valor de tu cartera: por eso el rango entre pesimista y optimista es tan amplio.</p>' : '') +
      '<div class="sls" style="margin-top:14px">' + vistaSliders(c, o) + '</div></div>';
  }
  function kpis(c, o, x, pr) {
    var b = pr.base.final, p = pr.pes.final, op = pr.opt.final;
    var hoyV = x ? x.valor : c.esc.inversiones.reduce(function (s, y) { return s + y.valor; }, 0);
    var hoyA = x ? x.aportado : c.esc.inversiones.reduce(function (s, y) { return s + y.aportado; }, 0);
    var anio = C.anioDe(C.ym(c.esc.inicio)) + o.N;
    return '<div class="kpis k3" style="margin:12px 0">' +
      U.kpi('Valor en ' + anio + ' (base)', F.eur0(b.valor), 'Pesimista ' + F.eur0(p.valor) + ' · optimista ' + F.eur0(op.valor)) +
      U.kpi('Total aportado', F.eur0(b.aportado), 'Hoy llevas ' + F.eur0(hoyA)) +
      U.kpi('Rendimientos (base)', '<span class="' + (b.rendimientos < 0 ? 'neg' : '') + '">' + F.eur0(b.rendimientos) + '</span>', b.aportado ? F.pct(b.rendimientos / b.aportado, 0) + ' sobre lo aportado' : '') +
      U.kpi('En euros de hoy', F.eur0(b.real), 'Con inflación del ' + F.pct(o.inf, 1)) +
      U.kpi('Neto si vendes en ' + anio, F.eur0(b.neto), 'Impuesto: ' + F.eur0(b.impuesto) + ' · real ' + F.eur0(b.netoReal)) +
      U.kpi('Ganancia hoy', '<span class="' + (hoyV - hoyA >= 0 ? 'pos' : 'neg') + '">' + F.eur0(hoyV - hoyA, { signo: true }) + '</span>', hoyA ? F.pct((hoyV - hoyA) / hoyA, 1) + ' · impuesto si vendes hoy ' + F.eur0(C.impuestoAhorro(hoyV - hoyA, c.escala)) : '') +
      '</div>';
  }
  function tablaAnual(c, o, pr) {
    var filas = pr[o.esc].filas, a0 = C.anioDe(C.ym(c.esc.inicio));
    var cuerpo = filas.map(function (f) {
      return '<tr' + (f.anio === 0 ? ' class="sep"' : '') + '><td class="izq">' + (f.anio === 0 ? 'Hoy' : (a0 + f.anio) + ' <span class="muted">(' + f.anio + ')</span>') + '</td>' +
        '<td>' + F.eur0(f.aportado) + '</td><td><b>' + F.eur0(f.valor) + '</b></td><td class="' + (f.rendimientos < 0 ? 'neg' : '') + '">' + F.eur0(f.rendimientos) + '</td>' +
        '<td>' + F.eur0(f.real) + '</td><td>' + F.eur0(f.impuesto) + '</td><td>' + F.eur0(f.neto) + '</td></tr>';
    }).join('');
    return '<div class="card" data-form="inv-vista"><div class="card-h"><h3>Año a año</h3>' + U.seg(ESC, o.esc, { 'data-f': 'esc' }, 'mini') + '</div>' +
      '<div class="tabla-scroll"><table class="tabla"><thead><tr><th>Año</th><th>Aportado</th><th>Valor</th><th>Rendimientos</th><th data-tip="Valor dividido entre (1 + inflación)^años">€ de hoy</th>' +
      '<th data-tip="Impuesto sobre la ganancia si lo vendieras todo ese año">Impuesto</th><th>Neto</th></tr></thead><tbody>' + cuerpo + '</tbody></table></div></div>';
  }
  function comparador(c, o, x) {
    var e = c.esc;
    var inv = x || e.inversiones.filter(function (y) { return y.id === o.cmpInv; })[0] || e.inversiones[0];
    if (!inv) return '<div class="card"><h3>Comparador</h3><p class="nota">Añade una inversión para comparar aportaciones.</p></div>';
    var de = inv.activa === false ? 0 : inv.aportacion;
    var a = o.cmpA != null ? o.cmpA : Math.max(de + 5000, Math.round(de * 2 / 500) * 500);
    var N = o.cmpN || o.N;
    var filas = ESC.map(function (s) {
      var p1 = proyectar(c, inv, s.id, N, o.inf, { aportacion: de }).final, p2 = proyectar(c, inv, s.id, N, o.inf, { aportacion: a }).final;
      return { s: s, p1: p1, p2: p2, dif: p2.valor - p1.valor, difAp: p2.aportado - p1.aportado, difNeto: p2.neto - p1.neto };
    });
    var base = filas[1];
    var cuerpo = filas.map(function (f) {
      return '<tr' + (f.s.id === 'base' ? ' class="destacada"' : '') + '><td class="izq">' + f.s.nombre + '</td><td>' + F.eur0(f.p1.valor) + '</td><td>' + F.eur0(f.p2.valor) + '</td>' +
        '<td class="' + (f.dif >= 0 ? 'pos' : 'neg') + '">' + F.eur0(f.dif, { signo: true }) + '</td><td>' + F.eur0(f.dif - f.difAp, { signo: true }) + '</td><td>' + F.eur0(f.difNeto, { signo: true }) + '</td></tr>';
    }).join('');
    var sel = x ? '' : U.select('cmpInv', e.inversiones.map(function (y) { return { id: y.id, nombre: y.nombre }; }), inv.id, ' aria-label="Inversión a comparar"');
    return '<div class="card" data-form="inv-vista"><div class="card-h"><h3>Comparador de aportaciones</h3>' + sel + '</div>' +
      '<div class="fila-ctl" style="margin-bottom:10px">Si subo la aportación' + (x ? '' : ' a «' + h(inv.nombre) + '»') + ' de <b>' + F.eur(de) + '</b> a ' +
      '<input class="in num" data-f="cmpA" data-t="eur" value="' + F.numero(a / 100, 2) + '" style="width:96px" aria-label="Nueva aportación mensual"> €/mes, a ' +
      '<input class="in num" data-f="cmpN" data-t="int" value="' + N + '" style="width:56px" aria-label="Años"> años:</div>' +
      '<table class="tabla"><thead><tr><th>Escenario</th><th>Con ' + F.eur0(de) + '</th><th>Con ' + F.eur0(a) + '</th><th>Diferencia</th><th>De rendimientos</th><th>Neto de impuestos</th></tr></thead><tbody>' + cuerpo + '</tbody></table>' +
      '<p class="nota" style="margin-top:8px">Aportar <b>' + F.eur0(a - de) + '/mes</b> más (' + F.eur0(base.difAp) + ' en total) te daría unos <b>' + F.eur0(base.dif) + '</b> más en ' + N + ' años en el escenario base, de los que ' +
      F.eur0(base.dif - base.difAp) + ' serían rendimientos. Tu presupuesto mensual bajaría en ' + F.eur0(a - de) + '.</p>' +
      '<button type="button" class="btn sm" data-act="inv-cmp-aplicar" data-id="' + h(inv.id) + '" data-v="' + a + '" style="margin-top:8px">Aplicar ' + F.eur0(a) + '/mes a «' + h(inv.nombre) + '»</button></div>';
  }

  // ------------------------------------------------------------ Gráfico ---
  function despues(c) {
    var o = opc(c), e = c.esc;
    var x = o.sel === 'total' ? null : e.inversiones.filter(function (y) { return y.id === o.sel; })[0];
    var pr = proyecciones(c, o, x), T = PFCharts.tema();
    var a0 = C.anioDe(C.ym(e.inicio));
    var labels = pr.base.filas.map(function (f) { return f.anio === 0 ? 'Hoy' : String(a0 + f.anio); });
    var eu = function (v) { return v / 100; };
    var ds = [
      PFCharts.serie('area', T.s[0], { label: 'Aportado', data: pr.base.filas.map(function (f) { return eu(f.aportado); }), stack: 'base', backgroundColor: PFCharts.alfa(T.s[0], 0.22), order: 2 }),
      PFCharts.serie('area', T.s[2], { label: 'Rendimientos (base)', data: pr.base.filas.map(function (f) { return eu(f.rendimientos); }), stack: 'base', backgroundColor: PFCharts.alfa(T.s[2], 0.22), order: 1 }),
      PFCharts.serie('line', T.ink3, { label: 'Optimista', data: pr.opt.filas.map(function (f) { return eu(f.valor); }), stack: 'o', borderDash: [6, 4], borderWidth: 1.5, order: 0 }),
      PFCharts.serie('line', T.ink2, { label: 'Pesimista', data: pr.pes.filas.map(function (f) { return eu(f.valor); }), stack: 'p', borderDash: [2, 3], borderWidth: 1.5, order: 0 })
    ];
    var op = PFCharts.opciones({ apilado: true });
    op.plugins.tooltip.callbacks.footer = function (items) {
      var i = items[0].dataIndex, f = pr.base.filas[i];
      return 'Valor base: ' + F.eur0(f.valor) + '\nEn euros de hoy: ' + F.eur0(f.real);
    };
    PFCharts.upsert('inv-graf', { type: 'line', data: { labels: labels, datasets: ds }, options: op });
  }

  // ----------------------------------------------------------- Acciones ---
  function nuevaInversion() {
    var rpc = PFStore.get().ajustes.rentPorClase;
    var x = S.inversion({ nombre: 'Nueva inversión', clase: 'indexado', rent: rpc.indexado, ter: 0.002 });
    PFStore.update(function (s, e) { e.inversiones.push(x); }, { etiqueta: 'añadir inversión' });
    setOpc({ sel: x.id });
    setTimeout(function () { var i = document.querySelector('.titulo-in'); if (i) { i.focus(); i.select(); } }, 60);
  }
  function enlazar() {
    U.accion('inv-sel', function (el) { setOpc({ sel: el.getAttribute('data-id') }); });
    U.accion('inv-add', nuevaInversion);
    U.accion('inv-inf-reset', function () { setOpc({ inflacion: null }); });
    U.accion('inv-borrar', function (el) {
      var id = el.getAttribute('data-id'), x = PFStore.esc().inversiones.filter(function (y) { return y.id === id; })[0];
      if (!x) return;
      U.confirmar({ titulo: 'Borrar «' + x.nombre + '»', texto: 'Se quitará del plan y de las proyecciones. Podrás deshacerlo con Ctrl+Z.', ok: 'Borrar', peligro: true }).then(function (ok) {
        if (!ok) return;
        PFStore.update(function (s, e) {
          e.inversiones = e.inversiones.filter(function (y) { return y.id !== id; });
          e.deudas.forEach(function (d) { if (d.inversionVinculada === id) d.inversionVinculada = null; });
          if (e.hipotesis.destinoExcedente === id) e.hipotesis.destinoExcedente = null;
          if (e.hipotesis.invLiberadas === id) e.hipotesis.invLiberadas = null;
        }, { etiqueta: 'borrar «' + x.nombre + '»' });
        setOpc({ sel: 'total' });
        U.toast('«' + x.nombre + '» borrada.', { accion: 'Deshacer', fn: function () { PFStore.undo(); } });
      });
    });
    U.accion('inv-ext-add', function () {
      var c = PFApp.ctx(), o = opc(c);
      var mes = document.getElementById('inv-ext-mes').value, imp = F.leerImporte(document.getElementById('inv-ext-imp').value);
      if (!/^\d{4}-\d{2}$/.test(mes) || !imp) { U.toast('Indica el mes y el importe de la aportación extraordinaria.', { tipo: 'error' }); return; }
      PFStore.update(function (s, e) {
        var x = e.inversiones.filter(function (y) { return y.id === o.sel; })[0];
        if (x) x.extraordinarias.push({ id: S.uid('e'), mes: mes, importe: imp });
      }, { etiqueta: 'aportación extraordinaria' });
    });
    U.accion('inv-ext-quitar', function (el) {
      var id = el.getAttribute('data-id'), o = opc(PFApp.ctx());
      PFStore.update(function (s, e) {
        var x = e.inversiones.filter(function (y) { return y.id === o.sel; })[0];
        if (x) x.extraordinarias = x.extraordinarias.filter(function (z) { return z.id !== id; });
      }, { etiqueta: 'quitar aportación extraordinaria' });
    });
    U.accion('inv-cmp-aplicar', function (el) {
      var id = el.getAttribute('data-id'), v = +el.getAttribute('data-v');
      PFStore.update(function (s, e) { var x = e.inversiones.filter(function (y) { return y.id === id; })[0]; if (x) { x.aportacion = v; x.activa = true; } }, { etiqueta: 'cambiar aportación' });
      setOpc({ cmpA: null });
      U.toast('Aportación actualizada a ' + F.eur(v) + '/mes. Mira el efecto en el presupuesto' + (PFWhatIf.activo() ? ' y en la barra ¿Y si…?' : '') + '.');
    });
    U.formulario('inversion', function (id, campo, v, el) {
      var nombre = (PFStore.esc().inversiones.filter(function (y) { return y.id === id; })[0] || {}).nombre;
      var desliza = el && el.type === 'range';
      PFStore.update(function (s, e) {
        var x = e.inversiones.filter(function (y) { return y.id === id; })[0]; if (!x) return;
        switch (campo) {
          case 'nombre': if (String(v).trim()) x.nombre = String(v).trim(); break;
          case 'clase': x.clase = v; x.rent = Object.assign({}, s.ajustes.rentPorClase[v]); x.liquida = v === 'remunerada'; break;
          case 'rentBase': x.rent.base = v; break;
          case 'rentPes': x.rent.pes = v; break;
          case 'rentOpt': x.rent.opt = v; break;
          case 'valor': case 'aportado': case 'aportacion': case 'ter': case 'crecimiento': case 'activa': case 'liquida':
            x[campo] = campo === 'activa' || campo === 'liquida' ? v : Math.max(campo === 'aportacion' || campo === 'ter' || campo === 'crecimiento' ? 0 : -1e12, v); break;
          default: return;
        }
      }, { etiqueta: 'editar «' + nombre + '»', agrupar: desliza ? 'inv-' + id + '-' + campo : null });
      if (campo === 'clase') U.toast('Escenarios de rentabilidad ajustados a la clase de activo.');
    });
    U.formulario('inv-vista', function (id, campo, v) {
      if (campo === 'horizonte') setOpc({ horizonte: Math.max(1, Math.min(40, Math.round(v))) });
      else if (campo === 'inflacion') setOpc({ inflacion: Math.max(0, Math.min(0.2, v)) });
      else if (campo === 'esc') setOpc({ esc: v });
      else if (campo === 'cmpA') setOpc({ cmpA: Math.max(0, v) });
      else if (campo === 'cmpN') setOpc({ cmpN: Math.max(1, Math.min(40, v)) });
      else if (campo === 'cmpInv') setOpc({ cmpInv: v, cmpA: null });
    });
  }
  enlazar();
  PFUI.seccion('inversiones', { html: html, despues: despues });
  return { proyectar: proyectar, proyectarTotal: proyectarTotal };
})();
