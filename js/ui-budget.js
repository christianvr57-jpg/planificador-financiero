/* =============================================================================
   ui-budget.js · Presupuesto 12 meses
   -----------------------------------------------------------------------------
   Tabla: filas = partidas agrupadas (ingresos, gastos fijos, suscripciones,
   variables, anuales, huchas, cuotas de deudas, aportaciones a inversión);
   columnas = 12 meses + Total + Media. Edición en línea con teclado, ajustes
   por celda (admite sumas: 40+25,50), interruptores por fila, vista Mi parte /
   Hogar y comparación con la línea base en modo ¿Y si…?
   ============================================================================= */
var PFPresupuesto = (function () {
  'use strict';
  var C = PFCalc, F = PFFmt, h = PFFmt.html, U = PFUI, S = PFSchema;
  var edit = null;      // { key, j, texto, nuevo }
  var foco = null;      // { key, j } celda con el foco (tabindex itinerante)
  var enfocar = false;  // enfocar `foco` tras el próximo render

  // ------------------------------------------------------------ Opciones ---
  function opciones(c) {
    var u = Object.assign({ modo: 'vista', offset: 0, vista: 'mi', plegados: {}, centimos: null, inactivas: true }, (c.ui && c.ui.presupuesto) || {});
    u.conCent = u.centimos == null ? window.innerWidth >= 1680 : !!u.centimos;
    return u;
  }
  function setOpc(parche) {
    var u = Object.assign({}, PFStore.getUI().presupuesto || {}, parche);
    PFStore.setUI({ presupuesto: u });
  }
  function ventanaBase(c, u) {
    var ini = C.ym(c.esc.inicio), ref = Math.max(ini, C.hoyYM());
    return u.modo === 'natural' ? C.anioDe(ref) * 12 : ref;
  }
  function limites(c, u) {
    var ini = C.ym(c.esc.inicio), base = ventanaBase(c, u);
    return { min: Math.ceil((ini - 11 - base) / 12), max: 39 };
  }

  // ------------------------------------------------------------- Formato ---
  function n(v, u) {
    if (v == null) return '';
    if (v === 0) return '<span class="cero">–</span>';
    return F.numero(v / 100, u.conCent ? 2 : 0);
  }
  function frecuenciaTxt(p) {
    if (p.subtipo === 'nomina') {
      return p.pagas === 14 ? '14 pagas · extras en ' + (p.mesesExtra || []).map(F.mesNombre).join(' y ') + (p.prorratear ? ' (prorrateadas)' : '') : '12 pagas';
    }
    var fr = { mensual: 'Mensual', bimestral: 'Bimestral', trimestral: 'Trimestral', semestral: 'Semestral', anual: 'Anual', puntual: 'Puntual' }[p.frecuencia];
    if (p.frecuencia === 'mensual') return fr;
    if (p.frecuencia === 'puntual') return fr + (p.fecha ? ' · ' + F.mesLargo(C.ym(p.fecha)) : '');
    return fr + ' · ' + C.mesesDeCargo(p).map(F.mesNombreCorto).join(', ');
  }
  function tipPartida(p, hip) {
    var anual = C.anualPartida(p), r = hip.rentDefecto;
    var d = [frecuenciaTxt(p), p.categoria, p.tipo === 'gasto' ? (p.esencial ? 'esencial' : 'prescindible') : null,
             p.miParte < 1 ? 'tu parte ' + F.pct(p.miParte, 0) : null].filter(Boolean).join(' · ');
    var out = '<b>' + h(p.nombre) + '</b><div class="tip-s">' + h(d) + '</div>' +
      '<div>' + (p.tipo === 'ingreso' ? 'Ingreso anual' : 'Coste anual') + (p.miParte < 1 ? ' (tu parte)' : '') + ': <b>' + F.eur(anual) + '</b></div>';
    if (p.tipo === 'gasto' && anual > 0) {
      out += '<div>Coste de oportunidad (invertido al ' + F.pct(r, 0) + '): 10 años ≈ <b>' + F.eur0(C.costeOportunidad(anual, 10, r)) +
        '</b> · 20 años ≈ <b>' + F.eur0(C.costeOportunidad(anual, 20, r)) + '</b></div>';
    }
    if (p.notas) out += '<div class="tip-n">' + h(p.notas) + '</div>';
    return out + '<div class="tip-k">Clic para editar la partida</div>';
  }

  // -------------------------------------------------------------- Modelo ---
  function modelo(c, u, desde) {
    var e = c.esc, ini = C.ym(e.inicio), N = 12, V = u.vista === 'hogar' ? 'hogar' : 'mi';
    var meses = []; for (var j = 0; j < N; j++) meses.push(desde + j);
    var nSim = Math.max(12, desde + N - ini);
    var sim = C.simular(e, { detalleDesde: desde, detalleMeses: N, meses: nSim });
    var simB = c.w ? C.simular(c.w.base, { detalleDesde: desde, detalleMeses: N, meses: nSim }) : null;
    var det = sim.detalle, detB = simB && simB.detalle;
    var ctxImp = { inicio: ini, hip: C.hipotesis(e.hipotesis) };
    var camb = c.w ? c.w.cambios.claves : {};
    var hip = c.hip;
    function vals(key) { var f = det.filas[key]; return f ? f[V].slice() : meses.map(function () { return null; }); }
    function valsB(key) { return detB && detB.filas[key] ? detB.filas[key][V] : null; }
    function fantasma(fn) { return meses.map(function (a) { return a < ini ? null : fn(a); }); }
    function fila(o) {
      o.valsB = c.w ? valsB(o.key) : null;
      o.cambio = camb[o.key] || null;
      return o;
    }
    var hIdx = {}; e.huchas.forEach(function (x) { hIdx[x.id] = x; });

    function filaPartida(p, sub) {
      var off = p.activa === false;
      var v = off ? fantasma(function (a) { var b = C.importeMes(p, a, ctxImp); return V === 'mi' ? C.parte(b, p.miParte) : b; }) : vals('p:' + p.id);
      var badges = [];
      if (p.miParte < 1) badges.push('<span class="bdg" data-tip="Gasto compartido: te corresponde el ' + F.pct(p.miParte, 0) + '">' + F.pct(p.miParte, 0) + '</span>');
      if (p.subtipo === 'nomina' && p.pagas === 14) badges.push('<span class="bdg" data-tip="14 pagas">14p</span>');
      if (p.frecuencia !== 'mensual' && p.subtipo !== 'nomina') badges.push('<span class="bdg fr" data-tip="' + h(frecuenciaTxt(p)) + '">' + { bimestral: '2m', trimestral: '3m', semestral: '6m', anual: 'anual', puntual: '1 vez' }[p.frecuencia] + '</span>');
      return fila({ key: 'p:' + p.id, tipo: 'p', ent: p, nombre: p.nombre, v: v, off: off, sub: !!sub, cuenta: !sub, editable: true,
                    sw: { on: !off, act: 'bt-toggle' }, badges: badges.join(''), tip: tipPartida(p, hip), ajustes: p.ajustes || {} });
    }
    var grupos = [];
    grupos.push({ id: 'ingresos', nombre: 'Ingresos', signo: 1, add: true,
                  filas: e.partidas.filter(function (p) { return p.tipo === 'ingreso'; }).map(function (p) { return filaPartida(p); }) });
    S.GRUPOS.slice(1).forEach(function (g) {
      grupos.push({ id: g.id, nombre: g.nombre, add: true,
                    filas: e.partidas.filter(function (p) { return p.tipo === 'gasto' && p.grupo === g.id && !(p.pagadoDesde && hIdx[p.pagadoDesde]); })
                      .map(function (p) { return filaPartida(p); }) });
    });
    // Huchas: aportación (cuenta) + gastos que se pagan desde ella (informativos) + saldo
    var fh = [];
    e.huchas.forEach(function (x) {
      var off = x.activa === false, esBote = x.tipo === 'bote';
      var v = off ? fantasma(function () { return V === 'hogar' ? x.aportacion + (esBote ? x.aportacionOtros : 0) : x.aportacion; }) : vals('h:' + x.id);
      var badges = '<span class="bdg">' + (esBote ? 'bote común' : 'hucha') + '</span>';
      var tip = '<b>' + h(x.nombre) + '</b><div>Aportación: <b>' + F.eur(x.aportacion) + '/mes</b>' + (esBote ? ' (los demás: ' + F.eur(x.aportacionOtros) + ')' : '') + '</div>' +
        (x.objetivo ? '<div>Objetivo: ' + F.eur0(x.objetivo) + (x.fechaObjetivo ? ' en ' + F.mesLargo(C.ym(x.fechaObjetivo)) : '') + '</div>' : '') +
        (x.notas ? '<div class="tip-n">' + h(x.notas) + '</div>' : '') + '<div class="tip-k">Clic para editar la hucha</div>';
      fh.push(fila({ key: 'h:' + x.id, tipo: 'h', ent: x, nombre: x.nombre, v: v, off: off, cuenta: true, editable: !(esBote && V === 'hogar'),
                     sw: { on: !off, act: 'bt-toggle' }, badges: badges, tip: tip, ajustes: x.ajustes || {}, addHucha: x.id }));
      e.partidas.filter(function (p) { return p.tipo === 'gasto' && p.pagadoDesde === x.id; }).forEach(function (p) { fh.push(filaPartida(p, true)); });
      fh.push(fila({ key: 'hs:' + x.id, tipo: 'hs', ent: x, nombre: 'Saldo de la hucha', v: vals('hs:' + x.id), sub: true, saldo: true, cuenta: false, editable: false }));
    });
    grupos.push({ id: 'huchas', nombre: 'Huchas y bote común', filas: fh, addHucha: true,
                  nota: 'Cuenta la aportación mensual; los gastos que se pagan desde cada hucha (en gris) no salen de tu cuenta ese mes.' });
    // Deudas
    var fd = [];
    e.deudas.forEach(function (d) {
      fd.push(fila({ key: 'd:' + d.id, tipo: 'd', ent: d, nombre: d.nombre + ' · cuota', v: vals('d:' + d.id), cuenta: true, editable: false, candado: true,
                     tip: '<b>' + h(d.nombre) + '</b><div>Cuota ' + F.eur(d.cuota) + ' · TIN ' + F.pct(d.tin, 2) + '</div><div>Capital pendiente: ' + F.eur(d.capital) + '</div><div class="tip-k">Se calcula con el cuadro de amortización. Clic para ir a Deudas.</div>' }));
      var tieneExtra = d.extraMensual > 0 || (d.extraPuntuales || []).length || (c.hip.destinoLiberadas === 'deudas' && e.deudas.length > 1);
      if (tieneExtra) {
        var offX = d.extraActiva === false;
        var vx = vals('dx:' + d.id);
        if (offX) { var cu = vals('d:' + d.id); vx = vx.map(function (x, q) { return cu[q] ? d.extraMensual : (x == null ? null : 0); }); }
        fd.push(fila({ key: 'dx:' + d.id, tipo: 'dx', ent: d, nombre: d.nombre + ' · amortización extra', v: vx, off: offX, cuenta: true, editable: false,
                       sw: { on: !offX, act: 'bt-toggle' },
                       tip: '<b>Amortización anticipada</b><div>' + F.eur(d.extraMensual) + '/mes · modo reducir ' + (d.modo === 'cuota' ? 'cuota' : 'plazo') + '</div><div>Incluye la comisión (' + F.pct(d.comision, 1) + '; ' + F.pct(d.comisionUltimoAnio, 1) + ' el último año).</div><div class="tip-k">Clic para ir a Deudas</div>' }));
      }
    });
    grupos.push({ id: 'deudas', nombre: 'Cuotas de deudas', auto: true, filas: fd, enlace: 'deudas' });
    // Inversiones
    var fi = [];
    e.inversiones.forEach(function (x) {
      var off = x.activa === false;
      var v = off ? fantasma(function (a) { return C.redondear(x.aportacion * Math.pow(1 + x.crecimiento, Math.floor((a - ini) / 12))); }) : vals('i:' + x.id);
      fi.push(fila({ key: 'i:' + x.id, tipo: 'i', ent: x, nombre: x.nombre, v: v, off: off, cuenta: true, editable: true, sw: { on: !off, act: 'bt-toggle' },
                     badges: '', ajustes: x.ajustes || {},
                     tip: '<b>' + h(x.nombre) + '</b><div>Aportación ' + F.eur(x.aportacion) + '/mes · rentabilidad base ' + F.pct(C.rentDe(x, 'base'), 1) + ' · TER ' + F.pct(x.ter, 2) + '</div><div>Valor actual ' + F.eur(x.valor) + '</div><div class="tip-k">Clic para ir a Inversiones</div>' }));
    });
    var nomInv = function (id) { var x = e.inversiones.filter(function (y) { return y.id === id; })[0]; return x ? x.nombre : '—'; };
    if (c.hip.pctExcedente > 0 && c.hip.destinoExcedente) fi.push(fila({ key: 'ie', tipo: 'ie', nombre: 'Excedente invertido (' + F.pct(c.hip.pctExcedente, 0) + ') → ' + nomInv(c.hip.destinoExcedente), v: vals('ie'), cuenta: true, editable: false, candado: true, tip: 'Se configura en Patrimonio › Hipótesis.' }));
    if (c.hip.invLiberadas && c.hip.destinoLiberadas !== 'caja') fi.push(fila({ key: 'il', tipo: 'il', nombre: 'Cuotas liberadas → ' + nomInv(c.hip.invLiberadas), v: vals('il'), cuenta: true, editable: false, candado: true, tip: 'Al terminar una deuda, su cuota pasa a esta inversión. Se configura en Patrimonio › Hipótesis.' }));
    grupos.push({ id: 'inversion', nombre: 'Aportaciones a inversión', auto: true, filas: fi, enlace: 'inversiones' });

    // Sumas por grupo (solo filas que cuentan y están activas)
    grupos.forEach(function (g) {
      g.suma = meses.map(function (a, q) {
        if (a < ini) return null;
        var s = 0; g.filas.forEach(function (f) { if (f.cuenta && !f.off && f.v[q] != null) s += f.v[q]; }); return s;
      });
    });
    // Totales (siempre tu parte, de la simulación)
    function serie(nombre, sm) { return meses.map(function (a) { var t = a - ini; return t < 0 ? null : sm.m[nombre][t]; }); }
    function salidas(sm) { return meses.map(function (a) { var t = a - ini; if (t < 0) return null; var M = sm.m; return M.gastos[t] + M.huchas[t] + M.cuotas[t] + M.extras[t] + M.cascada[t] + M.inversion[t]; }); }
    var tot = { ingresos: serie('ingresos', sim), salidas: salidas(sim), ahorro: serie('ahorro', sim), caja: serie('caja', sim) };
    var totB = simB ? { ahorro: serie('ahorro', simB), caja: serie('caja', simB) } : null;
    return { meses: meses, ini: ini, grupos: grupos, tot: tot, totB: totB, sim: sim, det: det, V: V, cajaInicio: det.cajaInicio };
  }

  // -------------------------------------------------------------- Render ---
  function html(c) {
    var u = opciones(c), lim = limites(c, u);
    if (u.offset < lim.min) u.offset = lim.min;
    var desde = ventanaBase(c, u) + 12 * u.offset;
    var m = modelo(c, u, desde);
    var hoy = C.hoyYM();
    var e = c.esc;

    // Barra de herramientas
    var saldoCtl;
    if (e.cuentas.length === 1) {
      saldoCtl = '<label class="bt-saldo" data-form="cuenta" data-id="' + h(e.cuentas[0].id) + '" data-tip="Saldo en cuenta al empezar el plan (' + h(F.mesLargo(m.ini)) + ')">Saldo inicial ' +
        U.campoEur('saldo', e.cuentas[0].saldo, ' aria-label="Saldo inicial"') + '</label>';
    } else {
      saldoCtl = '<span class="bt-saldo">Saldo inicial <b>' + F.eur(c.sim.caja0) + '</b> <button type="button" class="btn-link" data-act="nav" data-sec="patrimonio">(' + e.cuentas.length + ' cuentas)</button></span>';
    }
    var bar = '<div class="bt-bar">' +
      U.seg([{ id: 'vista', nombre: 'Año vista', tip: '12 meses desde el mes actual' }, { id: 'natural', nombre: 'Año natural', tip: 'De enero a diciembre' }], u.modo, { 'data-act': 'bt-modo' }) +
      '<div class="bt-nav"><button type="button" class="btn ico-b" data-act="bt-mover" data-d="-1" aria-label="Año anterior"' + (u.offset <= lim.min ? ' disabled' : '') + '>' + U.icono('flechaI') + '</button>' +
      '<span class="bt-rango">' + h(F.mesCorto(desde)) + ' – ' + h(F.mesCorto(desde + 11)) + '</span>' +
      '<button type="button" class="btn ico-b" data-act="bt-mover" data-d="1" aria-label="Año siguiente"' + (u.offset >= lim.max ? ' disabled' : '') + '>' + U.icono('flecha') + '</button>' +
      (u.offset ? '<button type="button" class="btn ghost sm" data-act="bt-hoy">Volver a hoy</button>' : '') + '</div>' +
      U.seg([{ id: 'mi', nombre: 'Mi parte', tip: 'Importes que te corresponden' }, { id: 'hogar', nombre: 'Hogar', tip: 'Gastos compartidos al 100 %' }], m.V, { 'data-act': 'bt-vista' }) +
      saldoCtl +
      '<span class="sp"></span>' +
      U.seg([{ id: '0', nombre: '€' }, { id: '1', nombre: ',00' }], u.conCent ? '1' : '0', { 'data-act': 'bt-cent' }, 'mini') +
      '<button type="button" class="btn sm ghost" data-act="bt-inactivas" aria-pressed="' + !!u.inactivas + '" data-tip="Mostrar u ocultar las partidas desactivadas">' + (u.inactivas ? 'Ocultar inactivas' : 'Ver inactivas') + '</button>' +
      '<button type="button" class="btn sm ghost" data-act="bt-plegar-todo">' + (Object.keys(u.plegados).some(function (k) { return u.plegados[k]; }) ? 'Desplegar todo' : 'Plegar todo') + '</button>' +
      '<button type="button" class="btn sm prim" data-act="bt-add" data-g="variables" data-tip="Nueva partida (N)">' + U.icono('mas') + 'Nueva partida</button>' +
      '</div>';

    // Cabecera
    var cab = '<tr><th class="rh">Partida <span class="muted">(' + (m.V === 'mi' ? 'mi parte' : 'hogar') + ', €)</span></th>' +
      m.meses.map(function (a) {
        var cls = ['mc']; if (C.mesDe(a) === 1) cls.push('ene'); if (a === hoy) cls.push('hoy'); if (a < m.ini) cls.push('pre');
        return '<th class="' + cls.join(' ') + '" scope="col"' + (a === hoy ? ' data-tip="Mes actual"' : '') + '>' + h(F.mesCorto(a)) + '</th>';
      }).join('') + '<th class="tot" scope="col">Total</th><th class="med" scope="col">Media</th></tr>';

    // Cuerpo
    var cuerpo = '', primera = null;
    m.grupos.forEach(function (g) {
      var plegado = !!u.plegados[g.id];
      var filas = g.filas.filter(function (f) { return u.inactivas || !f.off; });
      var totG = suma(g.suma), cnt = g.filas.filter(function (f) { return f.cuenta; }).length;
      var accion = g.add ? '<button type="button" class="g-add" data-act="bt-add" data-g="' + g.id + '" data-tip="Añadir partida a ' + h(g.nombre) + '">' + U.icono('mas') + 'Añadir</button>'
        : g.addHucha ? '<button type="button" class="g-add" data-act="bt-add-hucha" data-tip="Crear una hucha nueva">' + U.icono('mas') + 'Hucha</button>'
        : g.enlace ? '<button type="button" class="g-add" data-act="nav" data-sec="' + g.enlace + '">Gestionar ' + U.icono('flecha') + '</button>' : '';
      cuerpo += '<tr class="g' + (g.auto ? ' auto' : '') + '" data-key="g:' + g.id + '" data-g="' + g.id + '"><th class="rh"><div class="rh-in">' +
        '<button type="button" class="caret' + (plegado ? ' pleg' : '') + '" data-act="bt-plegar" data-g="' + g.id + '" aria-expanded="' + !plegado + '" aria-label="' + (plegado ? 'Desplegar ' : 'Plegar ') + h(g.nombre) + '">' + U.icono('caret') + '</button>' +
        '<span class="g-n"' + (g.nota ? ' data-tip="' + h(g.nota) + '"' : '') + '>' + h(g.nombre) + '</span><span class="g-c">' + cnt + '</span>' + accion + '</div></th>' +
        g.suma.map(function (v, q) { return '<td class="c' + clsMes(m, q) + '">' + n(v, u) + '</td>'; }).join('') +
        '<td class="c tot">' + n(totG, u) + '</td><td class="c med">' + n(media(g.suma), u) + '</td></tr>';
      if (plegado) return;
      if (!filas.length) {
        cuerpo += '<tr class="r vacia" data-key="v:' + g.id + '" data-g="' + g.id + '"><th class="rh"><span class="muted">' + (g.auto ? 'Nada configurado' : 'Sin partidas · usa «Añadir»') + '</span></th><td colspan="14"></td></tr>';
      }
      filas.forEach(function (f) {
        var cls = ['r']; if (f.off) cls.push('off'); if (f.sub) cls.push('sub'); if (f.saldo) cls.push('saldo'); if (f.cambio) cls.push('chg-' + f.cambio);
        var sw = f.sw ? U.sw(f.sw.on, { 'data-act': f.sw.act, 'data-key': null, 'data-k': f.key }, (f.sw.on ? 'Desactivar ' : 'Activar ') + f.nombre) : (f.candado ? '<span class="lock" data-tip="Automático: se calcula solo">' + U.icono('candado') + '</span>' : '<span class="sw-hueco"></span>');
        var nombre = f.saldo ? '<span class="rn sal">' + h(f.nombre) + '</span>'
          : '<button type="button" class="rn" data-act="bt-nombre" data-k="' + h(f.key) + '"' + (f.tip ? ' data-tip-html="' + h(f.tip) + '"' : '') + '>' + h(f.nombre) + '</button>';
        var extra = f.addHucha ? '<button type="button" class="g-add mini" data-act="bt-add" data-g="periodicos" data-h="' + h(f.addHucha) + '" data-tip="Añadir un gasto que se paga desde esta hucha">' + U.icono('mas') + 'gasto</button>' : '';
        var hId = (f.tipo === 'h' || f.tipo === 'hs') ? f.ent.id : (f.sub && f.ent ? f.ent.pagadoDesde : '');
        var grip = f.tipo === 'p' ? '<span class="grip" draggable="true" data-tip="Arrastra para mover a otro grupo o a una hucha">' + U.icono('grip') + '</span>' : '<span class="grip-hueco"></span>';
        cuerpo += '<tr class="' + cls.join(' ') + '" data-key="' + h(f.key) + '" data-g="' + g.id + '"' + (hId ? ' data-h="' + h(hId) + '"' : '') + '><th class="rh"><div class="rh-in">' + grip + sw + nombre + (f.badges || '') + extra + '</div></th>';
        f.v.forEach(function (v, q) {
          var a = m.meses[q], ms = C.ymStr(a);
          var cc = ['c'], tip = null;
          var pre = a < m.ini;
          if (!pre && f.editable && !f.off) cc.push('ed');
          if (f.ajustes && f.ajustes[ms]) { cc.push('aj'); tip = 'Ajuste manual de este mes' + (f.ajustes[ms].f ? ': ' + f.ajustes[ms].f : '') + '. Supr para volver a la regla.'; }
          if ((f.saldo || f.tipo === 'hs') && v < 0) cc.push('neg');
          if (f.valsB && !f.off && f.valsB[q] != null && v != null && f.valsB[q] !== v) { cc.push('chg'); tip = (tip ? tip + '\n' : '') + 'Antes: ' + F.eur(f.valsB[q]); }
          if (f.valsB && f.off && f.valsB[q]) { cc.push('chg'); tip = 'Antes: ' + F.eur(f.valsB[q]) + ' (ahora desactivada)'; }
          var es = edit && edit.key === f.key && edit.j === q;
          var esFoco = foco ? (foco.key === f.key && foco.j === q) : false;
          if (!foco && !primera && cc.indexOf('ed') >= 0) { primera = f.key + '|' + q; esFoco = true; }
          if (es) {
            cuerpo += '<td class="c editando' + clsMes(m, q) + '" data-k="' + h(f.key) + '" data-j="' + q + '"><input class="cell-in" data-key="edit" value="' + h(edit.texto) + '" aria-label="' + h(f.nombre + ', ' + F.mesLargo(a)) + '" spellcheck="false" autocomplete="off"></td>';
          } else {
            cuerpo += '<td class="' + cc.join(' ') + clsMes(m, q) + '" data-k="' + h(f.key) + '" data-j="' + q + '" tabindex="' + (esFoco ? '0' : '-1') + '"' + (cc.indexOf('ed') >= 0 ? ' data-dbl="bt-dbl"' : '') + (tip ? ' data-tip="' + h(tip) + '"' : '') + '>' + n(v, u) + '</td>';
          }
        });
        var cuentaTot = !f.saldo;
        cuerpo += '<td class="c tot' + (f.off ? ' tachado' : '') + '">' + (cuentaTot ? n(suma(f.v), u) : n(f.v[11], u)) + '</td><td class="c med">' + (cuentaTot ? n(media(f.v), u) : '') + '</td></tr>';
      });
    });

    // Pie de tabla (siempre tu parte)
    var t = m.tot, pie = '';
    function filaTot(nombre, arr, cls, opts) {
      opts = opts || {};
      return '<tr class="t ' + cls + '"><th class="rh"' + (opts.tip ? ' data-tip="' + h(opts.tip) + '"' : '') + '>' + nombre + '</th>' +
        arr.map(function (v, q) { var neg = opts.neg && v < 0; var cc = 'c' + (neg ? ' neg' : '') + clsMes(m, q); return '<td class="' + cc + '"' + (opts.tips ? opts.tips(q) : '') + '>' + (opts.delta ? deltaCelda(v, u) : n(v, u)) + '</td>'; }).join('') +
        '<td class="c tot' + (opts.neg && opts.total < 0 ? ' neg' : '') + (opts.totPos && opts.total > 0 ? ' pos' : '') + '">' + (opts.delta ? deltaCelda(opts.total, u) : n(opts.total, u)) + '</td><td class="c med">' + (opts.media != null ? (opts.delta ? deltaCelda(opts.media, u) : n(opts.media, u)) : '') + '</td></tr>';
    }
    pie += filaTot('Ingresos', t.ingresos, 'ing', { total: suma(t.ingresos), media: media(t.ingresos) });
    pie += filaTot('Salidas', t.salidas, 'sal', { total: suma(t.salidas), media: media(t.salidas), tip: 'Gastos pagados desde la cuenta + aportaciones a huchas + cuotas y amortizaciones + aportaciones a inversión' });
    pie += filaTot('Ahorro del mes', t.ahorro, 'aho', { total: suma(t.ahorro), media: media(t.ahorro), neg: true, totPos: true, tip: 'Ingresos − salidas: lo que se queda en tu cuenta cada mes' });
    if (m.totB) {
      var dA = t.ahorro.map(function (v, q) { return v == null || m.totB.ahorro[q] == null ? null : v - m.totB.ahorro[q]; });
      pie += filaTot('Δ frente a la partida', dA, 'dif', { total: suma(dA), media: media(dA), delta: true, tip: 'Diferencia del ahorro de cada mes respecto a tu situación de partida' });
    }
    pie += filaTot('Saldo en cuenta', t.caja, 'caja', { total: t.caja[11], neg: true, tip: 'Saldo acumulado al final de cada mes desde el saldo inicial' });

    var tabla = '<div class="bt-wrap" data-key="btw"><table class="bt' + (u.conCent ? ' cent' : '') + '" aria-label="Presupuesto de ' + h(F.mesLargo(desde)) + ' a ' + h(F.mesLargo(desde + 11)) + '">' +
      '<colgroup><col class="col-rh">' + m.meses.map(function () { return '<col class="col-m">'; }).join('') + '<col class="col-t"><col class="col-t"></colgroup>' +
      '<thead>' + cab + '</thead><tbody>' + cuerpo + '</tbody><tfoot>' + pie + '</tfoot></table></div>';

    return bar + tabla + resumenAnio(c, m, u);
  }
  function clsMes(m, q) {
    var a = m.meses[q], s = '';
    if (C.mesDe(a) === 1 && q > 0) s += ' ene';
    if (a < m.ini) s += ' pre';
    return s;
  }
  function deltaCelda(v, u) {
    if (v == null) return '';
    if (v === 0) return '<span class="cero">–</span>';
    return '<span class="' + (v > 0 ? 'pos' : 'neg') + '">' + (v > 0 ? '+' : '') + F.numero(v / 100, u.conCent ? 2 : 0) + '</span>';
  }
  function suma(arr) { var s = 0, alguno = false; arr.forEach(function (x) { if (x != null) { s += x; alguno = true; } }); return alguno ? s : null; }
  function media(arr) { var s = 0, k = 0; arr.forEach(function (x) { if (x != null) { s += x; k++; } }); return k ? Math.round(s / k) : null; }

  function resumenAnio(c, m, u) {
    var t = m.tot, val = t.caja.filter(function (x) { return x != null; });
    if (!val.length) return '';
    var ini = m.cajaInicio != null ? m.cajaInicio : c.sim.caja0;
    var fin = val[val.length - 1], aho = suma(t.ahorro), ing = suma(t.ingresos);
    var mejor = null, peor = null;
    t.ahorro.forEach(function (v, q) { if (v == null) return; if (!mejor || v > mejor.v) mejor = { v: v, q: q }; if (!peor || v < peor.v) peor = { v: v, q: q }; });
    var negativos = t.caja.filter(function (x) { return x != null && x < 0; }).length;
    var minimo = Math.min.apply(null, val);
    var partes = [
      '<div class="ra-k"><span>Empiezas con</span><b>' + F.eur0(ini) + '</b></div>',
      '<div class="ra-k"><span>Terminas con</span><b class="' + (fin < 0 ? 'neg' : '') + '">' + F.eur0(fin) + '</b>' + U.delta(fin - ini) + '</div>',
      '<div class="ra-k"><span>Ahorro del periodo</span><b>' + F.eur0(aho) + '</b><small>' + (ing ? F.pct(aho / ing, 1) + ' de tus ingresos' : '') + '</small></div>',
      '<div class="ra-k"><span>Mejor mes</span><b>' + (mejor ? F.mesCorto(m.meses[mejor.q]) : '—') + '</b><small>' + (mejor ? F.eur0(mejor.v) : '') + '</small></div>',
      '<div class="ra-k"><span>Peor mes</span><b>' + (peor ? F.mesCorto(m.meses[peor.q]) : '—') + '</b><small class="' + (peor && peor.v < 0 ? 'neg' : '') + '">' + (peor ? F.eur0(peor.v) : '') + '</small></div>',
      '<div class="ra-k"><span>Saldo mínimo</span><b class="' + (minimo < 0 ? 'neg' : '') + '">' + F.eur0(minimo) + '</b><small>' + (negativos ? negativos + (negativos === 1 ? ' mes' : ' meses') + ' en negativo' : 'nunca en negativo') + '</small></div>'
    ];
    if (c.w && m.totB) {
      var finB = m.totB.caja.filter(function (x) { return x != null; }).pop();
      partes.push('<div class="ra-k wi-k2"><span>Frente a la partida</span>' + U.delta(fin - finB) + '<small>saldo a final de periodo</small></div>');
    }
    var nota = m.V === 'hogar' ? '<p class="ra-nota">Vista Hogar: los gastos compartidos se muestran al 100 %; las filas de totales, ahorro y saldo son siempre tu parte.</p>' : '';
    return '<div class="ra"><h3>Cómo terminas el periodo</h3><div class="ra-ks">' + partes.join('') + '</div>' + nota + '</div>';
  }

  // ------------------------------------------------------------ Después ---
  function despues(c, vista) {
    var inp = vista.querySelector('.cell-in');
    if (inp && edit && edit.nuevo) {
      edit.nuevo = false;
      inp.focus();
      if (edit.seleccionar) inp.select(); else { var L = inp.value.length; inp.setSelectionRange(L, L); }
    } else if (enfocar && foco) {
      enfocar = false;
      var td = celda(vista, foco.key, foco.j);
      if (td) { td.focus({ preventScroll: false }); }
    }
  }
  function celda(raiz, key, j) {
    return raiz.querySelector('td[data-k="' + cssEsc(key) + '"][data-j="' + j + '"]');
  }
  function cssEsc(s) { return window.CSS && CSS.escape ? CSS.escape(s) : s.replace(/"/g, '\\"'); }

  // ----------------------------------------------------- Entidades y valores ---
  function buscar(e, key) {
    var p = key.split(':'), t = p[0], id = p.slice(1).join(':');
    var lista = t === 'p' ? e.partidas : t === 'h' || t === 'hs' ? e.huchas : t === 'i' ? e.inversiones : (t === 'd' || t === 'dx') ? e.deudas : null;
    if (!lista) return { tipo: t, ent: null };
    return { tipo: t, ent: lista.filter(function (x) { return x.id === id; })[0] || null };
  }
  /** Valor "regla" (sin ajuste) de una fila editable en el mes a, en céntimos y unidades de la vista. */
  function valorRegla(c, key, a, V) {
    var b = buscar(c.esc, key), x = b.ent, ini = C.ym(c.esc.inicio);
    if (!x) return 0;
    if (b.tipo === 'p') {
      var sin = Object.assign({}, x, { ajustes: {} });
      var v = C.importeMes(sin, a, { inicio: ini, hip: C.hipotesis(c.esc.hipotesis) });
      return V === 'mi' ? C.parte(v, x.miParte) : v;
    }
    if (b.tipo === 'h') return C.enRango(x, a) ? x.aportacion : 0;
    if (b.tipo === 'i') return C.redondear(x.aportacion * Math.pow(1 + x.crecimiento, Math.max(0, Math.floor((a - ini) / 12))));
    return 0;
  }
  function valorActual(c, key, a, V) {
    var b = buscar(c.esc, key), x = b.ent, ms = C.ymStr(a);
    if (!x) return { v: 0 };
    var aj = x.ajustes && x.ajustes[ms];
    if (aj) {
      var v = aj.v;
      if (b.tipo === 'p' && V === 'mi') v = C.parte(v, x.miParte);
      return { v: v, f: aj.f };
    }
    return { v: valorRegla(c, key, a, V) };
  }

  // ------------------------------------------------------------- Edición ---
  function empezar(key, j, inicial) {
    var c = PFApp.ctx(), u = opciones(c);
    var desde = ventanaBase(c, u) + 12 * u.offset, a = desde + j;
    var V = u.vista === 'hogar' ? 'hogar' : 'mi';
    var texto, sel = false;
    if (inicial != null) texto = inicial;
    else {
      var va = valorActual(c, key, a, V), ent = buscar(c.esc, key).ent;
      var formulaVale = va.f && (V === 'hogar' || !(ent.miParte < 1));
      texto = formulaVale ? va.f : (va.v ? F.numero(va.v / 100, 2) : '');
      sel = true;
    }
    edit = { key: key, j: j, texto: texto, nuevo: true, seleccionar: sel };
    foco = { key: key, j: j };
    PFApp.renderAhora();
  }
  function cancelar() {
    if (!edit) return;
    foco = { key: edit.key, j: edit.j }; edit = null; enfocar = true;
    PFApp.renderAhora();
  }
  /** Confirma la edición. mover: 'abajo'|'derecha'|'izquierda'|null. comoRegla: aplica a todos los meses. */
  function confirmar(texto, mover, comoRegla) {
    if (!edit) return;
    var c = PFApp.ctx(), u = opciones(c), V = u.vista === 'hogar' ? 'hogar' : 'mi';
    var key = edit.key, j = edit.j;
    var desde = ventanaBase(c, u) + 12 * u.offset, a = desde + j, ms = C.ymStr(a);
    var limpio = String(texto).trim();
    var v = limpio === '' ? null : F.leerImporte(limpio);
    if (limpio !== '' && v == null) {
      edit.texto = texto;
      U.toast('No entiendo «' + limpio + '». Escribe un importe (12,99) o una suma (40+25,50).', { tipo: 'error' });
      return false;
    }
    var expr = limpio !== '' && F.esExpresion(limpio) ? limpio : null;
    edit = null;
    var b = buscar(c.esc, key);
    PFStore.update(function (s, e) {
      var x = buscar(e, key).ent; if (!x) return;
      x.ajustes = x.ajustes || {};
      if (v == null) { delete x.ajustes[ms]; return; }
      var total = v;
      if (b.tipo === 'p' && V === 'mi' && x.miParte > 0 && x.miParte < 1) total = Math.round(v / x.miParte);
      if (comoRegla) {
        if (b.tipo === 'p') x.importe = total; else x.aportacion = total;
        delete x.ajustes[ms];
        return;
      }
      var regla = valorRegla({ esc: e }, key, a, 'hogar');
      if (total === regla && !expr) delete x.ajustes[ms];
      else x.ajustes[ms] = expr ? { v: total, f: expr } : { v: total };
    }, { etiqueta: comoRegla ? 'cambiar importe de «' + (b.ent ? b.ent.nombre : '') + '»' : 'editar ' + F.mesCorto(a) + ' de «' + (b.ent ? b.ent.nombre : '') + '»' });
    if (comoRegla) U.toast('Importe aplicado a todos los meses de «' + (b.ent ? b.ent.nombre : '') + '».');
    // Siguiente celda
    foco = { key: key, j: j };
    if (mover) { var sig = vecina(key, j, mover); if (sig) foco = sig; }
    enfocar = true;
    PFApp.render();
    return true;
  }
  function quitarAjuste(key, j) {
    var c = PFApp.ctx(), u = opciones(c);
    var a = ventanaBase(c, u) + 12 * u.offset + j, ms = C.ymStr(a);
    var b = buscar(c.esc, key);
    if (!b.ent || !b.ent.ajustes || !b.ent.ajustes[ms]) return;
    PFStore.update(function (s, e) { delete buscar(e, key).ent.ajustes[ms]; }, { etiqueta: 'quitar ajuste de ' + F.mesCorto(a) });
    foco = { key: key, j: j }; enfocar = true;
  }

  // ----------------------------------------------------------- Navegación ---
  function filasNavegables() {
    var vista = document.getElementById('vista');
    return Array.prototype.slice.call(vista.querySelectorAll('.bt tbody tr')).filter(function (tr) { return tr.querySelector('td[data-k]'); });
  }
  function vecina(key, j, dir) {
    var filas = filasNavegables();
    var idx = -1;
    filas.forEach(function (tr, q) { if (tr.getAttribute('data-key') === key) idx = q; });
    if (idx < 0) return null;
    if (dir === 'derecha' || dir === 'izquierda') {
      var dj = dir === 'derecha' ? 1 : -1, nj = j + dj, fi = idx;
      if (nj > 11) { nj = 0; fi = idx + 1; }
      if (nj < 0) { nj = 11; fi = idx - 1; }
      if (fi < 0 || fi >= filas.length) return null;
      return { key: filas[fi].getAttribute('data-key'), j: nj };
    }
    var d = dir === 'abajo' ? 1 : -1;
    for (var q = idx + d; q >= 0 && q < filas.length; q += d) {
      if (filas[q].querySelector('td[data-j="' + j + '"]')) return { key: filas[q].getAttribute('data-key'), j: j };
    }
    return null;
  }
  function moverFoco(td, dir) {
    var sig = vecina(td.getAttribute('data-k'), +td.getAttribute('data-j'), dir);
    if (!sig) return false;
    var el = celda(document.getElementById('vista'), sig.key, sig.j);
    if (!el) return false;
    foco = sig;
    var ant = document.querySelector('.bt td[tabindex="0"]');
    if (ant && ant !== el) ant.setAttribute('tabindex', '-1');
    el.setAttribute('tabindex', '0');
    el.focus();
    return true;
  }

  function enlazarTeclas() {
    document.addEventListener('keydown', function (e) {
      var t = e.target;
      if (!t.closest || !t.closest('.bt')) return;
      if (t.classList.contains('cell-in')) {
        if (e.key === 'Enter') { e.preventDefault(); confirmar(t.value, e.shiftKey ? null : 'abajo', e.shiftKey); }
        else if (e.key === 'Tab') { e.preventDefault(); confirmar(t.value, e.shiftKey ? 'izquierda' : 'derecha'); }
        else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); cancelar(); }
        else if ((e.key === 'ArrowUp' || e.key === 'ArrowDown') && !e.altKey) { e.preventDefault(); confirmar(t.value, e.key === 'ArrowUp' ? 'arriba' : 'abajo'); }
        return;
      }
      var td = t.closest('td[data-k]');
      if (!td || e.ctrlKey || e.metaKey || e.altKey) return;
      var key = td.getAttribute('data-k'), j = +td.getAttribute('data-j'), ed = td.classList.contains('ed');
      var mapa = { ArrowRight: 'derecha', ArrowLeft: 'izquierda', ArrowDown: 'abajo', ArrowUp: 'arriba' };
      if (mapa[e.key]) { e.preventDefault(); moverFoco(td, mapa[e.key]); return; }
      if (e.key === 'Tab') {
        if (moverFoco(td, e.shiftKey ? 'izquierda' : 'derecha')) e.preventDefault();
        return;
      }
      if (e.key === 'Enter' || e.key === 'F2') { e.preventDefault(); if (ed) empezar(key, j); else moverFoco(td, 'abajo'); return; }
      if ((e.key === 'Delete' || e.key === 'Backspace') && ed) { e.preventDefault(); quitarAjuste(key, j); return; }
      if (ed && e.key.length === 1 && /[0-9,.\-+=(]/.test(e.key)) { e.preventDefault(); empezar(key, j, e.key); return; }
    });
    document.addEventListener('focusin', function (e) {
      var td = e.target.closest && e.target.closest('.bt td[data-k]');
      if (td && !td.classList.contains('editando')) foco = { key: td.getAttribute('data-k'), j: +td.getAttribute('data-j') };
    });
    document.addEventListener('focusout', function (e) {
      var t = e.target;
      if (t.classList && t.classList.contains('cell-in') && edit) {
        // Perder el foco confirma (clic en otra parte)
        var val = t.value;
        setTimeout(function () { if (edit && !document.querySelector('.cell-in:focus')) confirmar(val, null); }, 0);
      }
    });
    document.addEventListener('mousedown', function (e) {
      var td = e.target.closest && e.target.closest('.bt td[data-k]');
      if (td && !td.classList.contains('editando')) { foco = { key: td.getAttribute('data-k'), j: +td.getAttribute('data-j') }; }
    });
  }

  // ------------------------------------------------------- Arrastrar filas ---
  // Cualquier partida se puede soltar en otro grupo (cambia su grupo), sobre una
  // hucha o sus gastos (pasa a pagarse desde ella) o entre dos filas (reordena).
  // Los ingresos solo se reordenan entre ingresos.
  var arrastre = null, marcada = null;
  var NOMBRE_GRUPO = { ingresos: 'Ingresos', fijos: 'Gastos fijos', suscripciones: 'Suscripciones', variables: 'Gastos variables', periodicos: 'Gastos anuales / periódicos' };
  function destinoDe(e) {
    var tr = e.target.closest && e.target.closest('.bt tbody tr');
    if (!tr || !arrastre) return null;
    var g = tr.getAttribute('data-g'), key = tr.getAttribute('data-key') || '';
    if (!g || g === 'deudas' || g === 'inversion') return null;
    if (arrastre.ingreso !== (g === 'ingresos')) return null;
    if (key === 'p:' + arrastre.id) return null;
    var hId = tr.getAttribute('data-h') || null;
    if (tr.classList.contains('g') || tr.classList.contains('vacia')) {
      if (g === 'huchas') return null;
      return { el: tr, modo: 'en', grupo: g, hucha: null };
    }
    if (/^hs?:/.test(key)) return { el: tr, modo: 'en', grupo: null, hucha: hId };
    if (key.indexOf('p:') === 0) {
      var r = tr.getBoundingClientRect();
      return { el: tr, modo: e.clientY < r.top + r.height / 2 ? 'antes' : 'despues', ref: key.slice(2), grupo: g === 'huchas' ? null : g, hucha: hId };
    }
    return null;
  }
  function marcar(d) {
    if (marcada) marcada.classList.remove('drop-antes', 'drop-despues', 'drop-en');
    marcada = d ? d.el : null;
    if (d) d.el.classList.add('drop-' + d.modo);
  }
  function mover(id, d) {
    var e0 = PFStore.esc(), p0 = e0.partidas.filter(function (x) { return x.id === id; })[0];
    if (!p0) return;
    var hucha = d.hucha ? e0.huchas.filter(function (x) { return x.id === d.hucha; })[0] : null;
    PFStore.update(function (s, e) {
      var arr = e.partidas, i = -1;
      arr.forEach(function (x, k) { if (x.id === id) i = k; });
      if (i < 0) return;
      var p = arr.splice(i, 1)[0];
      if (d.hucha) p.pagadoDesde = d.hucha;
      else { p.pagadoDesde = null; if (p.tipo === 'gasto' && d.grupo) p.grupo = d.grupo; }
      var pos = -1;
      if (d.ref) {
        arr.forEach(function (x, k) { if (x.id === d.ref) pos = d.modo === 'antes' ? k : k + 1; });
      } else {
        arr.forEach(function (x, k) {
          var mismo = d.hucha ? x.pagadoDesde === d.hucha : (x.tipo === p.tipo && x.grupo === p.grupo && !x.pagadoDesde);
          if (mismo) pos = k + 1;
        });
      }
      arr.splice(pos < 0 ? arr.length : pos, 0, p);
    }, { etiqueta: 'mover «' + p0.nombre + '»' });
    var dest = hucha ? 'ahora se paga desde «' + hucha.nombre + '»' : 'movida a ' + (NOMBRE_GRUPO[d.grupo || p0.grupo] || '');
    if (hucha || d.grupo !== p0.grupo || p0.pagadoDesde) U.toast('«' + p0.nombre + '» ' + dest + '.', { accion: 'Deshacer', fn: function () { PFStore.undo(); } });
  }
  function enlazarArrastre() {
    document.addEventListener('dragstart', function (e) {
      var g = e.target.closest && e.target.closest('.bt .grip');
      if (!g) return;
      var tr = g.closest('tr'), id = (tr.getAttribute('data-key') || '').slice(2);
      var p = PFStore.esc().partidas.filter(function (x) { return x.id === id; })[0];
      if (!p) { e.preventDefault(); return; }
      arrastre = { id: id, ingreso: p.tipo === 'ingreso' };
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', p.nombre);
      try { e.dataTransfer.setDragImage(tr.querySelector('th.rh'), 16, 14); } catch (x) { /* nada */ }
      U.ocultarTip();
      setTimeout(function () { tr.classList.add('arrastrando'); }, 0);
    });
    document.addEventListener('dragover', function (e) {
      if (!arrastre) return;
      var d = destinoDe(e);
      marcar(d);
      if (d) { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; }
    });
    document.addEventListener('drop', function (e) {
      if (!arrastre) return;
      var d = destinoDe(e), id = arrastre.id;
      marcar(null);
      if (!d) return;
      e.preventDefault();
      arrastre = null;
      mover(id, d);
    });
    document.addEventListener('dragend', function () {
      marcar(null); arrastre = null;
      var a = document.querySelector('.bt tr.arrastrando'); if (a) a.classList.remove('arrastrando');
    });
  }

  // ------------------------------------------------------------- Acciones ---
  function nuevaPartida(grupo, huchaId) {
    var id, c = PFApp.ctx();
    var hucha = huchaId ? c.esc.huchas.filter(function (x) { return x.id === huchaId; })[0] : null;
    PFStore.update(function (s, e) {
      var tipo = grupo === 'ingresos' ? 'ingreso' : 'gasto';
      var frac = 1;
      if (hucha && hucha.tipo === 'bote') { var tot = hucha.aportacion + hucha.aportacionOtros; frac = tot ? Math.round(hucha.aportacion / tot * 100) / 100 : 1; }
      var p = S.partida({
        nombre: tipo === 'ingreso' ? 'Nuevo ingreso' : 'Nuevo gasto', tipo: tipo, grupo: grupo,
        categoria: tipo === 'ingreso' ? 'Otros ingresos' : ({ suscripciones: 'Suscripciones', fijos: 'Vivienda' }[grupo] || 'Otros'),
        esencial: grupo === 'fijos' || tipo === 'ingreso', frecuencia: grupo === 'periodicos' ? 'anual' : 'mensual', mesCargo: C.mesDe(C.hoyYM()),
        pagadoDesde: huchaId || null, miParte: frac
      });
      e.partidas.push(p); id = p.id;
    }, { etiqueta: 'añadir partida' });
    var u = Object.assign({}, PFStore.getUI().presupuesto || {});
    u.plegados = Object.assign({}, u.plegados || {});
    u.plegados[huchaId ? 'huchas' : grupo] = false;
    PFStore.setUI({ seccion: 'presupuesto', presupuesto: u });
    PFEditor.abrir('partida', id, { focoNombre: true });
  }
  function enlazarAcciones() {
    U.accion('bt-modo', function (el) { setOpc({ modo: el.getAttribute('data-v'), offset: 0 }); });
    U.accion('bt-vista', function (el) { setOpc({ vista: el.getAttribute('data-v') }); });
    U.accion('bt-cent', function (el) { setOpc({ centimos: el.getAttribute('data-v') === '1' }); });
    U.accion('bt-mover', function (el) { var u = opciones(PFApp.ctx()); setOpc({ offset: u.offset + (+el.getAttribute('data-d')) }); });
    U.accion('bt-hoy', function () { setOpc({ offset: 0 }); });
    U.accion('bt-inactivas', function () { var u = opciones(PFApp.ctx()); setOpc({ inactivas: !u.inactivas }); });
    U.accion('bt-plegar', function (el) {
      var u = opciones(PFApp.ctx()), g = el.getAttribute('data-g'), p = Object.assign({}, u.plegados);
      p[g] = !p[g]; setOpc({ plegados: p });
    });
    U.accion('bt-plegar-todo', function () {
      var u = opciones(PFApp.ctx()), alguno = Object.keys(u.plegados).some(function (k) { return u.plegados[k]; }), p = {};
      if (!alguno) ['ingresos', 'fijos', 'suscripciones', 'variables', 'periodicos', 'huchas', 'deudas', 'inversion'].forEach(function (g) { p[g] = true; });
      setOpc({ plegados: p });
    });
    U.accion('bt-add', function (el) { nuevaPartida(el.getAttribute('data-g') || 'variables', el.getAttribute('data-h') || null); });
    U.accion('bt-add-hucha', function () { PFEditor.nuevaHucha(); });
    U.accion('bt-toggle', function (el) {
      var key = el.getAttribute('data-k'), b = buscar(PFStore.esc(), key);
      if (!b.ent) return;
      var nombre = b.ent.nombre;
      PFStore.update(function (s, e) {
        var x = buscar(e, key).ent;
        if (b.tipo === 'dx') x.extraActiva = x.extraActiva === false;
        else x.activa = x.activa === false;
      }, { etiqueta: 'activar/desactivar «' + nombre + '»' });
    });
    U.accion('bt-nombre', function (el) {
      var key = el.getAttribute('data-k'), t = key.split(':')[0], id = key.split(':').slice(1).join(':');
      if (t === 'p') PFEditor.abrir('partida', id);
      else if (t === 'h') PFEditor.abrir('hucha', id);
      else if (t === 'd' || t === 'dx') { PFStore.setUI({ seccion: 'deudas', deudas: Object.assign({}, PFStore.getUI().deudas, { sel: id }) }); }
      else if (t === 'i') { PFStore.setUI({ seccion: 'inversiones', inversiones: Object.assign({}, PFStore.getUI().inversiones, { sel: id }) }); }
      else PFStore.setUI({ seccion: 'patrimonio' });
    });
    U.accion('bt-dbl', function (el) { empezar(el.getAttribute('data-k'), +el.getAttribute('data-j')); });
    U.formulario('cuenta', function (id, campo, v) {
      PFStore.update(function (s, e) { var x = e.cuentas.filter(function (c) { return c.id === id; })[0]; if (x) x[campo] = v; }, { etiqueta: 'saldo inicial' });
    });
  }

  PFUI.seccion('presupuesto', { html: html, despues: despues });
  enlazarTeclas();
  enlazarArrastre();
  enlazarAcciones();

  return { nuevaPartida: nuevaPartida, buscar: buscar, frecuenciaTxt: frecuenciaTxt, tipPartida: tipPartida };
})();
