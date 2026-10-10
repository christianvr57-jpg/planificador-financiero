/* =============================================================================
   ui-summary.js · Resumen
   -----------------------------------------------------------------------------
   Indicadores de los próximos 12 meses, a dónde va cada euro, tres gráficos
   (ingresos vs salidas por mes, gastos por categoría, patrimonio a 10 años)
   y avisos automáticos con enlace a la sección donde se arreglan.
   ============================================================================= */
var PFResumen = (function () {
  'use strict';
  var C = PFCalc, F = PFFmt, h = PFFmt.html, U = PFUI;

  function html(c) {
    var k = c.k, sim = c.sim;
    var dPat = k.patrimonio12 - k.patrimonioHoy;
    var colchonTono = k.colchonMeses == null ? null : k.colchonMeses < 3 ? 'warn' : null;
    var kp = '<div class="kpis kpis-res">' +
      U.kpi('Ingresos (12 meses)', F.eur0(k.ingresos), F.eur0(k.ingresos / 12) + '/mes de media') +
      U.kpi('Gastos (12 meses)', F.eur0(k.consumo), F.eur0(k.consumo / 12) + '/mes · sin cuotas ni inversión', null, 'Gasto de consumo: lo que pagas desde la cuenta más lo que pagan tus huchas. No incluye cuotas de deuda ni aportaciones a inversión.') +
      U.kpi('Ahorro en cuenta (12 meses)', '<span class="' + (k.ahorro < 0 ? 'neg' : '') + '">' + F.eur0(k.ahorro) + '</span>', '+ ' + F.eur0(k.inversion) + ' invertidos · + ' + F.eur0(k.capital) + ' de deuda amortizada', null,
              'Lo que se queda en tu cuenta tras todos los pagos. Además ahorras lo que inviertes y el capital que amortizas.') +
      U.kpi('Tasa de ahorro', F.pct(k.tasaAhorro, 1), 'Ahorro + inversión + capital amortizado / ingresos', k.tasaAhorro < 0.1 ? 'warn' : null,
              'Prudente: lo que va a huchas no cuenta como ahorro porque se va a gastar.') +
      U.kpi('Patrimonio neto hoy', F.eur0(k.patrimonioHoy), 'Cuenta + huchas + inversiones − deudas') +
      U.kpi('Patrimonio en 12 meses', F.eur0(k.patrimonio12), U.delta(dPat) + ' en un año') +
      U.kpi('Deuda total', F.eur0(k.deudaTotal), c.esc.deudas.length ? 'Cuotas: ' + F.eur(k.cuotaMensual) + '/mes de media' : 'Sin deudas') +
      U.kpi('Endeudamiento', F.pct(k.ratioEndeudamiento, 1), 'Cuotas / ingresos · límite prudente 35 %', k.ratioEndeudamiento > 0.35 ? 'neg' : null) +
      U.kpi('Colchón de emergencia', k.colchonMeses == null ? '—' : F.numero(k.colchonMeses, 1) + ' meses', 'Líquido ' + F.eur0(k.liquido) + ' / esenciales ' + F.eur0(k.esencialMensual) + '/mes · objetivo 3–6', colchonTono,
              'Gastos esenciales (tu parte) más cuotas de deuda. Lo líquido son tus cuentas y cuentas remuneradas; no cuentan huchas ni inversiones.') +
      U.kpi('Independencia financiera', F.eur0(k.numeroIF), k.anioIF != null ? 'La alcanzarías en ' + F.anios(k.anioIF) + ' (' + C.anioDe(sim.inicio + k.mesesIF - 1) + ')' : 'No se alcanza en 40 años con el plan actual', null,
              'Número de la libertad financiera: gasto anual × 25 (regla del 4 %). Se compara con inversiones + cuenta − deudas en euros de hoy.') +
      '</div>';
    return kp +
      '<div class="rejilla r2" style="margin-top:12px">' +
      '<div class="card"><div class="card-h"><h3>Ingresos y salidas por mes</h3><span class="sub">Próximos 12 meses, tu parte</span></div><div class="graf"><canvas id="re-mes" data-key="re-mes" role="img" aria-label="Ingresos y salidas por mes"></canvas></div></div>' +
      '<div class="card"><div class="card-h"><h3>Gastos por categoría</h3><span class="sub">12 meses, incluidos los que pagan tus huchas</span></div><div class="graf"><canvas id="re-cat" data-key="re-cat" role="img" aria-label="Gastos por categoría"></canvas></div></div>' +
      '</div>' +
      '<div class="rejilla r-31" style="margin-top:12px">' +
      '<div class="card"><div class="card-h"><h3>Patrimonio proyectado a 10 años</h3><span class="sub">Nominal y en euros de hoy · estimación</span></div><div class="graf"><canvas id="re-pat" data-key="re-pat" role="img" aria-label="Patrimonio a 10 años"></canvas></div></div>' +
      reparto(c) + '</div>' +
      avisos(c);
  }
  /** A dónde va cada 100 € de ingresos. */
  function reparto(c) {
    var k = c.k, ing = k.ingresos || 1;
    var partes = [
      { n: 'Gastos desde la cuenta', v: k.gastos, col: 'var(--s2)' },
      { n: 'Huchas', v: k.huchas, col: 'var(--s4)' },
      { n: 'Cuotas de deuda', v: k.cuotas + k.extras + k.cascada, col: 'var(--s8)' },
      { n: 'Inversión', v: k.inversion, col: 'var(--s3)' },
      { n: 'Se queda en la cuenta', v: k.ahorro, col: 'var(--s1)' }
    ];
    var barra = partes.filter(function (p) { return p.v > 0; }).map(function (p) {
      return '<span style="width:' + (p.v / ing * 100).toFixed(2) + '%;background:' + p.col + '" data-tip="' + h(p.n + ': ' + F.eur0(p.v) + ' (' + F.pct(p.v / ing, 1) + ')') + '"></span>';
    }).join('');
    return '<div class="card"><div class="card-h"><h3>De cada 100 € que ingresas</h3></div><div class="barra-rep">' + barra + '</div>' +
      '<table class="tabla" style="margin-top:10px"><tbody>' + partes.map(function (p) {
        return '<tr><td class="izq"><span class="punto" style="background:' + p.col + '"></span> ' + p.n + '</td><td>' + F.eur0(p.v) + '</td><td><b>' + F.numero(p.v / ing * 100, 0) + ' €</b></td></tr>';
      }).join('') + '</tbody></table></div>';
  }
  function avisos(c) {
    var lista = C.avisos(c.esc, c.sim, c.k, { fmt: F.eur0, mes: F.mesLargo });
    var ico = { critico: 'alerta', aviso: 'alerta', info: 'info', ok: 'ok' };
    var dias = PFStore.diasSinCopia();
    if (dias > 7) lista.splice(0, 0, { nivel: 'aviso', titulo: c.s.meta.ultimaCopia ? Math.floor(dias) + ' días sin copia de seguridad' : 'Sin copia de seguridad', texto: 'Guarda tus datos en un archivo: si se borran los datos del navegador, se pierden.', seccion: 'ajustes' });
    var nombres = { presupuesto: 'Ver presupuesto', huchas: 'Ver huchas', deudas: 'Ver deudas', resumen: null, ajustes: 'Ir a ajustes', inversiones: 'Ver inversiones' };
    return '<div class="card" style="margin-top:12px"><div class="card-h"><h3>Avisos</h3><span class="sub">Se recalculan con cada cambio</span></div>' +
      lista.map(function (a) {
        return '<div class="aviso-l ' + a.nivel + '">' + U.icono(ico[a.nivel]) + '<div style="flex:1"><b>' + h(a.titulo) + '</b><p>' + h(a.texto) + '</p></div>' +
          (a.seccion && nombres[a.seccion] ? '<button type="button" class="btn-link" data-act="nav" data-sec="' + a.seccion + '">' + nombres[a.seccion] + '</button>' : '') + '</div>';
      }).join('') + '</div>';
  }

  function despues(c) {
    var sim = c.sim, M = sim.m, T = PFCharts.tema();
    var labels = [], ing = [], sal = [], aho = [];
    for (var t = 0; t < 12; t++) {
      labels.push(F.mesCorto(sim.inicio + t));
      ing.push(M.ingresos[t] / 100);
      sal.push((M.gastos[t] + M.huchas[t] + M.cuotas[t] + M.extras[t] + M.cascada[t] + M.inversion[t]) / 100);
      aho.push(M.ahorro[t] / 100);
    }
    PFCharts.upsert('re-mes', { type: 'bar', data: { labels: labels, datasets: [
      PFCharts.serie('bar', T.s[0], { label: 'Ingresos', data: ing, order: 2 }),
      PFCharts.serie('bar', T.s[1], { label: 'Salidas', data: sal, order: 2 }),
      PFCharts.serie('line', T.ink2, { label: 'Ahorro del mes', data: aho, order: 1, pointRadius: 3, pointBackgroundColor: T.ink2, pointBorderColor: T.surface, pointBorderWidth: 2 })
    ] }, options: PFCharts.opciones({ desdeCero: true }) });

    var cats = C.gastosPorCategoria(c.esc, 12);
    var orden = Object.keys(cats).sort(function (a, b) { return cats[b] - cats[a]; });
    if (orden.length > 9) { var resto = orden.slice(8).reduce(function (s, k) { return s + cats[k]; }, 0); orden = orden.slice(0, 8); cats = Object.assign({}, cats, { 'Otras categorías': resto }); orden.push('Otras categorías'); }
    var opCat = PFCharts.opciones({ horizontal: true, leyenda: false });
    opCat.plugins.tooltip.callbacks.label = function (ctx) { var tot = c.k.consumo || 1; return ' ' + F.eur0(ctx.parsed.x * 100) + ' · ' + F.pct(ctx.parsed.x * 100 / tot, 1) + ' del gasto'; };
    PFCharts.upsert('re-cat', { type: 'bar', data: { labels: orden, datasets: [
      PFCharts.serie('bar', T.s[0], { label: 'Gasto anual', data: orden.map(function (k) { return cats[k] / 100; }), borderRadius: { topRight: 4, bottomRight: 4 }, borderSkipped: 'start', maxBarThickness: 16 })
    ] }, options: opCat });

    var lp = ['hoy'], nom = [sim.pat0 / 100], real = [sim.pat0 / 100];
    for (t = 0; t < 120; t++) { lp.push(F.mesCorto(sim.inicio + t)); nom.push(M.patrimonio[t] / 100); real.push(M.patrimonioReal[t] / 100); }
    var hitos = PFPatrimonio.hitos(c).filter(function (x) { return x.t < 120; }).map(function (x) { return { x: x.t + 1, etiqueta: x.etiqueta }; });
    var op = PFCharts.opciones({ desdeCero: false, hitos: hitos, holgura: '12%' });
    op.scales.x.ticks.callback = function (v, i) { var a = sim.inicio + i - 1; return i === 0 ? 'hoy' : (C.mesDe(a) === 1 && i > 6) ? String(C.anioDe(a)) : null; };
    op.scales.x.ticks.autoSkip = false;
    PFCharts.upsert('re-pat', { type: 'line', data: { labels: lp, datasets: [
      PFCharts.serie('area', T.s[0], { label: 'Patrimonio neto', data: nom, backgroundColor: PFCharts.alfa(T.s[0], 0.10) }),
      PFCharts.serie('line', T.s[2], { label: 'En euros de hoy', data: real })
    ] }, options: op });
  }

  PFUI.seccion('resumen', { html: html, despues: despues });
  return {};
})();
