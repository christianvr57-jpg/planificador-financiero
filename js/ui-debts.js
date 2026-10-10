/* =============================================================================
   ui-debts.js · Deudas
   -----------------------------------------------------------------------------
   Cuadro de amortización (sistema francés), simulador de amortización
   anticipada (puntual y periódica, reduciendo plazo o cuota, con comisión),
   «¿Amortizar o invertir?», préstamo para invertir y estrategias con varias
   deudas (avalancha / bola de nieve) y destino de las cuotas liberadas.
   ============================================================================= */
var PFDeudas = (function () {
  'use strict';
  var C = PFCalc, F = PFFmt, h = PFFmt.html, U = PFUI, S = PFSchema;

  function opc(c) {
    var o = Object.assign({ sel: null, aviImporte: null, aviInv: null, aviRent: null, cuadro: null }, c.ui.deudas || {});
    var ds = c.esc.deudas;
    if (!ds.some(function (d) { return d.id === o.sel; })) o.sel = ds.length ? ds[0].id : null;
    return o;
  }
  function setOpc(p) { PFStore.setUI({ deudas: Object.assign({}, PFStore.getUI().deudas || {}, p) }); }
  function mes(a) { return a == null ? '—' : F.mesCorto(a); }
  function mesL(a) { return a == null ? '—' : F.mesLargo(a); }

  // -------------------------------------------------------------- Render ---
  function html(c) {
    var o = opc(c), e = c.esc;
    var d = e.deudas.filter(function (x) { return x.id === o.sel; })[0];
    var izq = columnaLista(c, o);
    if (!d) {
      return '<div class="rejilla r-13">' + izq + '<div class="col-der"><div class="card vacio"><h2>Sin deudas</h2><p>Si tienes un préstamo, una hipoteca o una tarjeta aplazada, añádelo para ver su cuadro de amortización y cuánto ahorras amortizando antes.</p>' +
        '<button type="button" class="btn prim" data-act="de-add" style="margin-top:12px">' + U.icono('mas') + 'Añadir deuda</button></div></div></div>';
    }
    var inicio = C.ym(e.inicio);
    var plan = C.cuadroAmortizacion(d, { inicio: inicio });
    var contrato = C.cuadroAmortizacion(d, { inicio: inicio, sinExtras: true });
    return '<div class="rejilla r-13">' + izq + '<div class="col-der">' +
      datos(c, d, plan, contrato) + kpis(c, d, plan, contrato) + simulador(c, d, plan, contrato) +
      amortizarInvertir(c, o, d) + prestamoInversion(c, d) + estrategias(c, d) + cuadro(c, o, d, plan) +
      '</div></div>';
  }
  function columnaLista(c, o) {
    var e = c.esc, tot = 0, cuotas = 0;
    var items = e.deudas.map(function (d) {
      var st = C.iniciarDeuda(d, C.ym(e.inicio)), fin = c.sim.hitos.deudas[d.id];
      tot += d.capital; cuotas += st.cuota;
      var on = d.id === o.sel;
      return '<button type="button" class="item-sel' + (on ? ' on' : '') + '" data-act="de-sel" data-id="' + h(d.id) + '" aria-pressed="' + on + '">' +
        '<span class="is-n">' + h(d.nombre) + '</span>' +
        '<span class="is-v">' + F.eur0(d.capital) + '</span>' +
        '<span class="is-s">Cuota ' + F.eur(st.cuota) + ' · TIN ' + F.pct(d.tin, 2) + '</span>' +
        '<span class="is-s">Fin con tu plan: ' + mesL(fin) + '</span></button>';
    }).join('');
    var ratio = c.k.ratioEndeudamiento;
    return '<div class="col-izq"><div class="lista-sel">' + items + '</div>' +
      '<button type="button" class="btn sm" data-act="de-add" style="margin-top:8px">' + U.icono('mas') + 'Añadir deuda</button>' +
      (e.deudas.length ? '<div class="card" style="margin-top:12px">' +
        '<div class="kpi-l">Deuda total</div><div class="kpi-v">' + F.eur0(tot) + '</div>' +
        '<div class="kpi-s">Cuotas: ' + F.eur(cuotas) + '/mes</div>' +
        '<div class="kpi-l" style="margin-top:10px">Ratio de endeudamiento</div><div class="kpi-v ' + (ratio > 0.35 ? 'neg' : '') + '">' + F.pct(ratio, 1) + '</div>' +
        '<div class="kpi-s">Cuotas / ingresos netos (12 meses). Alerta por encima del 35 %.</div></div>' : '') +
      '</div>';
  }
  function datos(c, d, plan, contrato) {
    var invs = [{ id: '', nombre: 'Ninguna' }].concat(c.esc.inversiones.map(function (x) { return { id: x.id, nombre: x.nombre }; }));
    var st = C.iniciarDeuda(d, C.ym(c.esc.inicio));
    var aviso = '';
    if (d.fin && contrato.fin != null && Math.abs(contrato.fin - C.ym(d.fin)) > 1) {
      aviso = '<p class="banner info sm">' + U.icono('info') + '<span>Con esta cuota terminarías en ' + mesL(contrato.fin) + ', no en ' + mesL(C.ym(d.fin)) + '. Mando la cuota de tu recibo (opción prudente); revisa capital o TIN si no cuadra.</span></p>';
    }
    if (st.n === Infinity) aviso = '<p class="banner error sm">' + U.icono('alerta') + '<span>La cuota no cubre ni los intereses: la deuda nunca se termina de pagar.</span></p>';
    return '<div class="card" data-form="deuda" data-id="' + h(d.id) + '">' +
      '<div class="card-h"><input class="in titulo-in" data-f="nombre" data-t="txt" value="' + h(d.nombre) + '" aria-label="Nombre de la deuda">' +
      '<button type="button" class="btn sm ghost peligro" data-act="de-borrar" data-id="' + h(d.id) + '">' + U.icono('papelera') + 'Borrar</button></div>' +
      '<div class="form-grid">' +
      fld('Capital pendiente', U.campoEur('capital', d.capital)) +
      fld('TIN anual', '<div class="fila-ctl">' + U.campoPct('tin', d.tin, 2, ' style="width:90px"') + '<span class="muted">% · TAE ' + F.pct(C.tae(d.tin), 2) + '</span></div>') +
      fld('Cuota mensual', U.campoEur('cuota', d.cuota), d.cuota ? null : 'Vacía: se calcula con el plazo') +
      fld('Próxima cuota', '<input class="in" type="month" data-f="proximaCuota" data-t="mes" value="' + h(d.proximaCuota || '') + '">') +
      fld('Fin según contrato', '<input class="in" type="month" data-f="fin" data-t="mes" value="' + h(d.fin || '') + '">', 'Solo para comprobar') +
      fld('Comisión amortización', '<div class="fila-ctl">' + U.campoPct('comision', d.comision, 2, ' style="width:80px"') + '<span class="muted">%</span></div>') +
      fld('Comisión último año', '<div class="fila-ctl">' + U.campoPct('comisionUltimoAnio', d.comisionUltimoAnio, 2, ' style="width:80px"') + '<span class="muted">%</span></div>', 'Cuando quedan ≤ 12 cuotas') +
      fld('Inversión vinculada', U.select('inversionVinculada', invs, d.inversionVinculada || ''), 'Préstamo para invertir') +
      '</div>' + aviso +
      '<p class="nota" style="margin-top:8px">Sistema francés: interés mensual = TIN / 12 = ' + F.pct(d.tin / 12, 3) + '; cuota = C·i / (1 − (1 + i)^−n). Quedan ' + (isFinite(st.n) ? st.n : '∞') + ' cuotas con el contrato.</p></div>';
  }
  function fld(etq, ctl, ayuda) { return '<div class="fld"><span class="fld-l">' + etq + '</span>' + ctl + (ayuda ? '<span class="fld-a">' + ayuda + '</span>' : '') + '</div>'; }

  function kpis(c, d, plan, contrato) {
    var ahorro = contrato.intereses - plan.intereses, meses = contrato.meses - plan.meses;
    return '<div class="kpis k3" style="margin:12px 0">' +
      U.kpi('Fin con tu plan', mesL(plan.fin), meses > 0 ? meses + ' meses antes que con el contrato (' + mes(contrato.fin) + ')' : 'Igual que el contrato') +
      U.kpi('Intereses que pagarás', F.eur(plan.intereses), 'Sin amortizar: ' + F.eur(contrato.intereses)) +
      U.kpi('Intereses ahorrados', '<span class="' + (ahorro > 0 ? 'pos' : '') + '">' + F.eur(ahorro) + '</span>', 'Menos comisiones: ' + F.eur(ahorro - plan.comisiones) + ' netos', null) +
      U.kpi('Comisiones de amortización', F.eur(plan.comisiones), F.pct(d.comision, 1) + ' (' + F.pct(d.comisionUltimoAnio, 1) + ' el último año)') +
      U.kpi('Total que pagarás', F.eur(plan.pagado), 'Capital ' + F.eur(d.capital) + ' + intereses + comisiones') +
      U.kpi('Cuota', F.eur(plan.cuota), d.modo === 'cuota' && plan.filas.length ? 'Al final: ' + F.eur(plan.filas[plan.filas.length - 1].cuotaVigente) : 'Se mantiene (reduces plazo)') +
      '</div>';
  }
  function simulador(c, d, plan, contrato) {
    var punt = (d.extraPuntuales || []).slice().sort(function (a, b) { return a.mes < b.mes ? -1 : 1; });
    var filas = [
      ['Fecha de fin', mesL(contrato.fin), mesL(plan.fin)],
      ['Número de cuotas', contrato.meses, plan.meses],
      ['Intereses', F.eur(contrato.intereses), F.eur(plan.intereses)],
      ['Comisiones', F.eur(0), F.eur(plan.comisiones)],
      ['Total pagado', F.eur(contrato.pagado), F.eur(plan.pagado)]
    ];
    var difInt = contrato.intereses - plan.intereses - plan.comisiones;
    return '<div class="card" data-form="deuda" data-id="' + h(d.id) + '">' +
      '<div class="card-h"><h3>Amortización anticipada</h3><label class="sw-l">' + U.sw(d.extraActiva !== false, { 'data-f': 'extraActiva' }, 'Amortización mensual activa') + 'Amortización mensual activa</label></div>' +
      '<div class="rejilla r2"><div>' +
      '<div class="sls" style="grid-template-columns:1fr">' +
      U.slider({ f: 'extraMensual', t: 'rng-eur', tv: 'eur', min: 0, max: Math.max(500, Math.ceil(d.extraMensual / 100 / 250) * 250 * 2), step: 5, valor: d.extraMensual / 100,
                 etiqueta: 'Extra cada mes', texto: F.numero(d.extraMensual / 100, 2), sub: 'Incluye la comisión: amortizas ' + F.eur(Math.round(d.extraMensual / (1 + d.comision))) + ' de capital' }) +
      '</div>' +
      '<div class="fld-2" style="margin-top:10px">' + fld('Desde', '<input class="in" type="month" data-f="extraDesde" data-t="mes" value="' + h(d.extraDesde || '') + '">') +
      fld('Hasta (opcional)', '<input class="in" type="month" data-f="extraHasta" data-t="mes" value="' + h(d.extraHasta || '') + '">') + '</div>' +
      fld('Al amortizar, reducir…', U.seg([{ id: 'plazo', nombre: 'Plazo' }, { id: 'cuota', nombre: 'Cuota' }], d.modo, { 'data-f': 'modo' }), d.modo === 'plazo' ? 'Mantienes la cuota y terminas antes: suele ahorrar más intereses.' : 'Mantienes el plazo y la cuota baja.') +
      '<div class="fld" style="margin-top:8px"><span class="fld-l">Amortizaciones puntuales</span><div class="fila-ctl">' +
      (punt.length ? punt.map(function (x) { return '<span class="chip">' + h(F.mesCorto(C.ym(x.mes))) + ': ' + F.eur0(x.importe) + ' <button type="button" class="btn-link" data-act="de-punt-quitar" data-id="' + h(x.id) + '" aria-label="Quitar">×</button></span>'; }).join('') : '<span class="muted">Ninguna.</span>') +
      '</div><div class="fila-ctl" style="margin-top:6px"><input class="in" type="month" id="de-punt-mes" value="' + h(C.ymStr(Math.max(C.hoyYM(), C.ym(c.esc.inicio)) + 2)) + '" aria-label="Mes">' +
      '<input class="in num" id="de-punt-imp" placeholder="Importe" style="width:100px" inputmode="decimal" aria-label="Importe">' +
      '<button type="button" class="btn sm" data-act="de-punt-add">' + U.icono('mas') + 'Añadir</button></div></div>' +
      '</div><div>' +
      '<table class="tabla"><thead><tr><th></th><th>Sin amortizar</th><th>Con tu plan</th></tr></thead><tbody>' +
      filas.map(function (f) { return '<tr><td class="izq">' + f[0] + '</td><td>' + f[1] + '</td><td><b>' + f[2] + '</b></td></tr>'; }).join('') +
      '</tbody></table>' +
      '<p class="nota" style="margin-top:8px">' + (difInt > 0 ? 'Ganas <b>' + (contrato.meses - plan.meses) + ' meses</b> y te ahorras <b>' + F.eur(difInt) + '</b> netos de comisiones.' : 'Sin amortizaciones extra activas.') + '</p>' +
      '<div class="graf bajo" style="margin-top:8px"><canvas id="de-graf" data-key="de-graf" role="img" aria-label="Capital pendiente con y sin amortización"></canvas></div>' +
      '</div></div></div>';
  }
  function amortizarInvertir(c, o, d) {
    var invs = c.esc.inversiones;
    var importe = o.aviImporte != null ? o.aviImporte : (d.extraMensual || 10000);
    var inv = invs.filter(function (x) { return x.id === o.aviInv; })[0] || invs.filter(function (x) { return x.clase === 'indexado'; })[0] || invs[0];
    var r = o.aviRent != null ? o.aviRent : (inv ? C.rentDe(inv, 'base') : c.hip.rentDefecto);
    var ter = o.aviRent != null ? 0 : (inv ? inv.ter : 0);
    var res = C.amortizarVsInvertir(d, importe, r, ter, c.escala, { inicio: C.ym(c.esc.inicio) });
    var gana = res.ventajaAmortizar >= 0;
    var opciones = invs.map(function (x) { return { id: x.id, nombre: x.nombre + ' (' + F.pct(C.rentDe(x, 'base') - x.ter, 1) + ' neto)' }; }).concat([{ id: '__manual', nombre: 'Rentabilidad manual' }]);
    return '<div class="card" data-form="de-avi"><div class="card-h"><h3>¿Amortizar o invertir?</h3><span class="sub">Mismo dinero cada mes; se compara hasta el fin original del préstamo (' + mesL(res.finB) + ')</span></div>' +
      '<div class="fila-ctl" style="margin-bottom:10px">Con <input class="in num" data-f="aviImporte" data-t="eur" value="' + F.numero(importe / 100, 2) + '" style="width:96px" aria-label="Importe mensual"> €/mes, comparo amortizar «' + h(d.nombre) + '» con invertir en ' +
      U.select('aviInv', opciones, o.aviRent != null ? '__manual' : (inv ? inv.id : '__manual'), ' aria-label="Inversión de referencia"') +
      (o.aviRent != null ? ' al <input class="in num" data-f="aviRent" data-t="pct" value="' + F.numero(r * 100, 1) + '" style="width:64px" aria-label="Rentabilidad"> % anual' : '') + '</div>' +
      '<div class="rejilla r3">' +
      '<div class="card plano"><div class="kpi-l">Amortizar (seguro)</div><div class="kpi-v">' + F.eur0(res.interesesAhorrados) + '</div><div class="kpi-s">de intereses ahorrados; terminas en ' + mesL(res.finA) + ' y luego inviertes cuota + extra. Patrimonio al final: <b>' + F.eur0(res.netA) + '</b></div></div>' +
      '<div class="card plano"><div class="kpi-l">Invertir (esperado, no garantizado)</div><div class="kpi-v">' + F.eur0(res.vB - res.apB) + '</div><div class="kpi-s">de rendimientos antes de impuestos al ' + F.pct(r - ter, 1) + ' neto. Patrimonio al final tras impuestos: <b>' + F.eur0(res.netB) + '</b></div></div>' +
      '<div class="card plano ' + (gana ? 'ok-borde' : 'warn-borde') + '"><div class="kpi-l">Resultado</div><div class="kpi-v">' + (gana ? 'Amortizar' : 'Invertir') + ' +' + F.eur0(Math.abs(res.ventajaAmortizar)) + '</div>' +
      '<div class="kpi-s">Rentabilidad de equilibrio: ' + (res.equilibrio != null ? '<b>' + F.pct(res.equilibrio, 1) + '</b> anual antes de comisiones' : 'fuera de rango') + '. Por debajo, gana amortizar.</div></div>' +
      '</div><p class="nota" style="margin-top:8px">Amortizar rinde lo que cuesta el préstamo (TIN ' + F.pct(d.tin, 2) + ', TAE ' + F.pct(C.tae(d.tin), 2) + ') sin riesgo ni impuestos; invertir rinde lo esperado menos comisiones y menos el impuesto del ahorro sobre la ganancia. ' +
      'Con una deuda cara y un colchón suficiente, lo prudente suele ser amortizar.</p></div>';
  }
  function prestamoInversion(c, d) {
    if (!d.inversionVinculada) return '';
    var inv = c.esc.inversiones.filter(function (x) { return x.id === d.inversionVinculada; })[0];
    if (!inv) return '';
    var r = C.rentDe(inv, 'base');
    var res = C.prestamoInversion(d, inv, r, inv.ter, c.escala, { inicio: C.ym(c.esc.inicio) });
    var hoy = inv.valor - d.capital;
    return '<div class="card"><div class="card-h"><h3>Préstamo para invertir</h3><span class="sub">«' + h(d.nombre) + '» financia «' + h(inv.nombre) + '»</span></div>' +
      '<div class="kpis k3">' +
      U.kpi('Inversión − deuda hoy', '<span class="' + (hoy < 0 ? 'neg' : 'pos') + '">' + F.eur0(hoy) + '</span>', F.eur0(inv.valor) + ' − ' + F.eur0(d.capital)) +
      U.kpi('Rentabilidad mínima', res.rentMinima != null ? F.pct(res.rentMinima, 1) : '—', 'Anual, para que la ganancia neta (incluida la que ya llevas) cubra intereses y comisiones') +
      U.kpi('Resultado al terminar (' + mes(res.fin) + ')', '<span class="' + (res.resultado < 0 ? 'neg' : 'pos') + '">' + F.eur0(res.resultado) + '</span>', 'Ganancia neta ' + F.eur0(res.gananciaNeta) + ' − coste ' + F.eur0(res.coste) + ' (al ' + F.pct(r - inv.ter, 1) + ' neto)') +
      '</div><div class="graf bajo" style="margin-top:10px"><canvas id="de-pi" data-key="de-pi" role="img" aria-label="Valor de la inversión frente a deuda pendiente"></canvas></div></div>';
  }
  function estrategias(c, d) {
    var e = c.esc, hip = c.hip, invs = e.inversiones;
    var stD = C.iniciarDeuda(d, C.ym(e.inicio));
    var liberada = stD.cuota + (d.extraActiva === false ? 0 : d.extraMensual);
    var fin = c.sim.hitos.deudas[d.id];
    var dest = [{ id: 'caja', nombre: 'Se queda en la cuenta' }, { id: 'inversion', nombre: 'Pasa a una inversión' }];
    if (e.deudas.length > 1) dest.splice(1, 0, { id: 'deudas', nombre: 'Pasa a la siguiente deuda' });
    var selInv = hip.destinoLiberadas !== 'caja' ? '<div class="fld"><span class="fld-l">' + (hip.destinoLiberadas === 'deudas' ? 'Cuando no queden deudas, a…' : 'Inversión') + '</span>' +
      U.select('invLiberadas', [{ id: '', nombre: hip.destinoLiberadas === 'deudas' ? 'Se queda en la cuenta' : 'Elige inversión' }].concat(invs.map(function (x) { return { id: x.id, nombre: x.nombre }; })), hip.invLiberadas || '') + '</div>' : '';
    var out = '<div class="card" data-form="hipotesis"><div class="card-h"><h3>Cuotas liberadas' + (e.deudas.length > 1 ? ' y estrategia con varias deudas' : '') + '</h3></div>' +
      '<p class="nota" style="margin-bottom:10px">Cuando termines «' + h(d.nombre) + '» (' + mesL(fin) + ') dejarás de pagar <b>' + F.eur(liberada) + '/mes</b>. ¿A dónde van?</p>' +
      '<div class="form-grid"><div class="fld"><span class="fld-l">Destino</span>' + U.select('destinoLiberadas', dest, hip.destinoLiberadas) + '</div>' + selInv +
      (e.deudas.length > 1 ? '<div class="fld"><span class="fld-l">Orden</span>' + U.seg([{ id: 'avalancha', nombre: 'Avalancha', tip: 'Primero la de mayor TIN: paga menos intereses' }, { id: 'bolaNieve', nombre: 'Bola de nieve', tip: 'Primero la de menor saldo: victorias rápidas' }], hip.ordenDeudas, { 'data-f': 'ordenDeudas' }) + '</div>' : '') +
      '</div>';
    if (e.deudas.length > 1) {
      var ini = C.ym(e.inicio);
      var est = [
        { n: 'Sin cascada', r: C.estrategiaDeudas(e.deudas, { inicio: ini }) },
        { n: 'Avalancha (mayor TIN primero)', r: C.estrategiaDeudas(e.deudas, { inicio: ini, orden: 'avalancha' }) },
        { n: 'Bola de nieve (menor saldo primero)', r: C.estrategiaDeudas(e.deudas, { inicio: ini, orden: 'bolaNieve' }) }
      ];
      var min = Math.min.apply(null, est.map(function (x) { return x.r.intereses; }));
      out += '<table class="tabla" style="margin-top:12px"><thead><tr><th>Estrategia</th><th>Intereses totales</th><th>Libre de deudas</th><th class="izq">Orden en que terminan</th></tr></thead><tbody>' +
        est.map(function (x) {
          return '<tr><td class="izq">' + x.n + '</td><td class="' + (x.r.intereses === min ? 'pos' : '') + '">' + F.eur(x.r.intereses) + '</td><td>' + mesL(x.r.fin) + '</td><td class="izq">' +
            x.r.ordenFin.map(function (q) { return h(q.nombre) + ' (' + mes(q.fin) + ')'; }).join(' → ') + '</td></tr>';
        }).join('') + '</tbody></table>' +
        '<p class="nota" style="margin-top:6px">La cascada usa las cuotas que quedan libres al terminar cada deuda. Avalancha minimiza intereses; bola de nieve da motivación con victorias rápidas.</p>';
    }
    return out + '</div>';
  }
  function cuadro(c, o, d, plan) {
    var anual = o.cuadro ? o.cuadro === 'anual' : plan.filas.length > 60;
    var cuerpo = '';
    if (anual) {
      var porAnio = {};
      plan.filas.forEach(function (f) {
        var y = C.anioDe(f.mes);
        var a = porAnio[y] || (porAnio[y] = { y: y, n: 0, cuota: 0, interes: 0, amort: 0, extra: 0, comision: 0, pendiente: 0 });
        a.n++; a.cuota += f.cuota; a.interes += f.interes; a.amort += f.amort; a.extra += f.extra; a.comision += f.comision; a.pendiente = f.pendiente;
      });
      cuerpo = Object.keys(porAnio).map(function (y) {
        var a = porAnio[y];
        return '<tr><td class="izq">' + y + ' <span class="muted">(' + a.n + ' cuotas)</span></td><td>' + F.eur(a.cuota) + '</td><td>' + F.eur(a.interes) + '</td><td>' + F.eur(a.amort) + '</td><td>' + F.eur(a.extra) + '</td><td>' + F.eur(a.comision) + '</td><td><b>' + F.eur(a.pendiente) + '</b></td></tr>';
      }).join('');
    } else {
      cuerpo = plan.filas.map(function (f) {
        return '<tr' + (C.mesDe(f.mes) === 1 ? ' class="sep"' : '') + '><td class="izq">' + f.n + ' · ' + F.mesCorto(f.mes) + '</td><td>' + F.eur(f.cuota) + '</td><td>' + F.eur(f.interes) + '</td><td>' + F.eur(f.amort) + '</td>' +
          '<td>' + (f.extra ? F.eur(f.extra) : '<span class="muted">–</span>') + '</td><td>' + (f.comision ? F.eur(f.comision) : '<span class="muted">–</span>') + '</td><td><b>' + F.eur(f.pendiente) + '</b></td></tr>';
      }).join('');
    }
    var tot = plan.filas.reduce(function (s, f) { s.c += f.cuota; s.i += f.interes; s.a += f.amort; s.e += f.extra; s.k += f.comision; return s; }, { c: 0, i: 0, a: 0, e: 0, k: 0 });
    return '<div class="card" data-form="de-vista"><div class="card-h"><h3>Cuadro de amortización <span class="sub">· con tu plan de amortización</span></h3>' +
      U.seg([{ id: 'mensual', nombre: 'Por meses' }, { id: 'anual', nombre: 'Por años' }], anual ? 'anual' : 'mensual', { 'data-f': 'cuadro' }, 'mini') + '</div>' +
      '<div class="tabla-scroll"><table class="tabla"><thead><tr><th>' + (anual ? 'Año' : 'Cuota') + '</th><th>Cuota</th><th>Intereses</th><th>Capital</th><th>Amort. extra</th><th>Comisión</th><th>Pendiente</th></tr></thead><tbody>' + cuerpo +
      '<tr class="destacada"><td class="izq">Total</td><td>' + F.eur(tot.c) + '</td><td>' + F.eur(tot.i) + '</td><td>' + F.eur(tot.a) + '</td><td>' + F.eur(tot.e) + '</td><td>' + F.eur(tot.k) + '</td><td></td></tr>' +
      '</tbody></table></div></div>';
  }

  // ----------------------------------------------------------- Gráficos ---
  function despues(c) {
    var o = opc(c), e = c.esc;
    var d = e.deudas.filter(function (x) { return x.id === o.sel; })[0];
    if (!d) return;
    var T = PFCharts.tema(), inicio = C.ym(e.inicio);
    var plan = C.cuadroAmortizacion(d, { inicio: inicio }), contrato = C.cuadroAmortizacion(d, { inicio: inicio, sinExtras: true });
    var n = Math.max(plan.filas.length, contrato.filas.length), a0 = contrato.desde;
    var labels = [], sP = [], sC = [];
    for (var i = 0; i <= n; i++) {
      labels.push(F.mesCorto(a0 + i - 1));
      sC.push(i === 0 ? d.capital / 100 : (contrato.filas[i - 1] ? contrato.filas[i - 1].pendiente / 100 : 0));
      sP.push(i === 0 ? d.capital / 100 : (plan.filas[i - 1] ? plan.filas[i - 1].pendiente / 100 : 0));
    }
    PFCharts.upsert('de-graf', { type: 'line', data: { labels: labels, datasets: [
      PFCharts.serie('line', T.ink3, { label: 'Sin amortizar', data: sC, borderDash: [5, 4], borderWidth: 1.5 }),
      PFCharts.serie('line', T.s[0], { label: 'Con tu plan', data: sP })
    ] }, options: PFCharts.opciones({ decTip: 2 }) });
    if (d.inversionVinculada) {
      var inv = e.inversiones.filter(function (x) { return x.id === d.inversionVinculada; })[0];
      if (inv) {
        var res = C.prestamoInversion(d, inv, C.rentDe(inv, 'base'), inv.ter, c.escala, { inicio: inicio });
        PFCharts.upsert('de-pi', { type: 'line', data: { labels: res.filas.map(function (f) { return F.mesCorto(f.mes); }), datasets: [
          PFCharts.serie('line', T.s[2], { label: 'Valor de la inversión', data: res.filas.map(function (f) { return f.valor / 100; }) }),
          PFCharts.serie('line', T.s[7], { label: 'Deuda pendiente', data: res.filas.map(function (f) { return f.deuda / 100; }) }),
          PFCharts.serie('line', T.ink2, { label: 'Neto (inversión − deuda)', data: res.filas.map(function (f) { return f.neto / 100; }), borderDash: [5, 4] })
        ] }, options: PFCharts.opciones({ desdeCero: false }) });
      }
    }
  }

  // ----------------------------------------------------------- Acciones ---
  function enlazar() {
    U.accion('de-sel', function (el) { setOpc({ sel: el.getAttribute('data-id') }); });
    U.accion('de-add', function () {
      var e = PFStore.esc();
      var d = S.deuda({ nombre: 'Nueva deuda', capital: 500000, tin: 0.07, plazo: 48, proximaCuota: C.ymStr(Math.max(C.hoyYM(), C.ym(e.inicio)) + 1) });
      d.cuota = C.cuotaFrancesa(d.capital, d.tin, 48);
      PFStore.update(function (s, es) { es.deudas.push(d); }, { etiqueta: 'añadir deuda' });
      setOpc({ sel: d.id });
      setTimeout(function () { var i = document.querySelector('.titulo-in'); if (i) { i.focus(); i.select(); } }, 60);
    });
    U.accion('de-borrar', function (el) {
      var id = el.getAttribute('data-id'), d = PFStore.esc().deudas.filter(function (x) { return x.id === id; })[0];
      if (!d) return;
      U.confirmar({ titulo: 'Borrar «' + d.nombre + '»', texto: 'Desaparecerá del plan y de las proyecciones. Podrás deshacerlo con Ctrl+Z.', ok: 'Borrar', peligro: true }).then(function (ok) {
        if (!ok) return;
        PFStore.update(function (s, e) { e.deudas = e.deudas.filter(function (x) { return x.id !== id; }); }, { etiqueta: 'borrar «' + d.nombre + '»' });
        U.toast('«' + d.nombre + '» borrada.', { accion: 'Deshacer', fn: function () { PFStore.undo(); } });
      });
    });
    U.accion('de-punt-add', function () {
      var o = opc(PFApp.ctx());
      var m = document.getElementById('de-punt-mes').value, imp = F.leerImporte(document.getElementById('de-punt-imp').value);
      if (!/^\d{4}-\d{2}$/.test(m) || !imp) { U.toast('Indica el mes y el importe de la amortización puntual.', { tipo: 'error' }); return; }
      PFStore.update(function (s, e) { var d = e.deudas.filter(function (x) { return x.id === o.sel; })[0]; if (d) d.extraPuntuales.push({ id: S.uid('e'), mes: m, importe: imp }); }, { etiqueta: 'amortización puntual' });
    });
    U.accion('de-punt-quitar', function (el) {
      var id = el.getAttribute('data-id'), o = opc(PFApp.ctx());
      PFStore.update(function (s, e) { var d = e.deudas.filter(function (x) { return x.id === o.sel; })[0]; if (d) d.extraPuntuales = d.extraPuntuales.filter(function (x) { return x.id !== id; }); }, { etiqueta: 'quitar amortización puntual' });
    });
    U.formulario('deuda', function (id, campo, v, el) {
      var nombre = (PFStore.esc().deudas.filter(function (x) { return x.id === id; })[0] || {}).nombre;
      var desliza = el && el.type === 'range';
      PFStore.update(function (s, e) {
        var d = e.deudas.filter(function (x) { return x.id === id; })[0]; if (!d) return;
        if (campo === 'nombre') { if (String(v).trim()) d.nombre = String(v).trim(); return; }
        if (campo === 'inversionVinculada') { d.inversionVinculada = v || null; return; }
        if (['capital', 'tin', 'cuota', 'proximaCuota', 'fin', 'comision', 'comisionUltimoAnio', 'extraMensual', 'extraDesde', 'extraHasta', 'extraActiva', 'modo'].indexOf(campo) < 0) return;
        if (['capital', 'cuota', 'extraMensual'].indexOf(campo) >= 0) v = Math.max(0, v);
        d[campo] = v;
      }, { etiqueta: 'editar «' + nombre + '»', agrupar: desliza ? 'de-' + id + '-' + campo : null });
    });
    U.formulario('de-avi', function (id, campo, v) {
      if (campo === 'aviImporte') setOpc({ aviImporte: Math.max(0, v) });
      else if (campo === 'aviInv') { if (v === '__manual') setOpc({ aviRent: PFApp.ctx().hip.rentDefecto }); else setOpc({ aviInv: v, aviRent: null }); }
      else if (campo === 'aviRent') setOpc({ aviRent: v });
    });
    U.formulario('de-vista', function (id, campo, v) { if (campo === 'cuadro') setOpc({ cuadro: v }); });
    U.formulario('hipotesis', function (id, campo, v, el) {
      var desliza = el && el.type === 'range';
      PFStore.update(function (s, e) {
        var hp = e.hipotesis;
        if (campo === 'destinoLiberadas') {
          hp.destinoLiberadas = v;
          if (v === 'inversion' && !hp.invLiberadas && e.inversiones.length) hp.invLiberadas = e.inversiones[0].id;
        } else if (campo === 'invLiberadas' || campo === 'destinoExcedente') hp[campo] = v || null;
        else if (campo === 'pctExcedente') {
          hp.pctExcedente = Math.max(0, Math.min(1, v));
          if (hp.pctExcedente > 0 && !hp.destinoExcedente && e.inversiones.length) {
            hp.destinoExcedente = (e.inversiones.filter(function (x) { return x.clase === 'indexado'; })[0] || e.inversiones[0]).id;
          }
        }
        else if (campo in hp) hp[campo] = v;
      }, { etiqueta: 'hipótesis', agrupar: desliza ? 'hip-' + campo : null });
    });
  }
  enlazar();
  PFUI.seccion('deudas', { html: html, despues: despues });
  return {};
})();
