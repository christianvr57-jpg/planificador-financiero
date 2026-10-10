/* =============================================================================
   ui-goals.js · Huchas y objetivos
   -----------------------------------------------------------------------------
   Saldo mes a mes de cada hucha (para que los gastos anuales no rompan el mes
   en que se pagan), gastos anuales que aún no tienen hucha y objetivos con
   importe y fecha: aportación necesaria y si llegas al ritmo actual.
   ============================================================================= */
var PFHuchas = (function () {
  'use strict';
  var C = PFCalc, F = PFFmt, h = PFFmt.html, U = PFUI, S = PFSchema;

  function opc(c) { return Object.assign({ meses: 12, vista: 'mi' }, c.ui.huchas || {}); }
  function setOpc(p) { PFStore.setUI({ huchas: Object.assign({}, PFStore.getUI().huchas || {}, p) }); }

  /** Saldo actual que te corresponde (en un bote común, tu parte según lo que aporta cada uno). */
  function saldoHoy(x) {
    var tot = x.aportacion + (x.tipo === 'bote' ? x.aportacionOtros : 0);
    return x.tipo === 'bote' && tot ? C.parte(x.saldoInicial, x.aportacion / tot) : x.saldoInicial;
  }
  function html(c) {
    var o = opc(c), e = c.esc, sim = c.sim;
    var hoy = 0, aport = 0, cubre = 0, negativas = 0;
    e.huchas.forEach(function (x) {
      var s = (sim.porHucha[x.id] || []);
      aport += x.activa === false ? 0 : x.aportacion;
      for (var t = 0; t < Math.min(24, s.length); t++) if (s[t] < 0) { negativas++; break; }
    });
    hoy = sim.huchas0;
    e.partidas.forEach(function (p) { if (p.tipo === 'gasto' && p.pagadoDesde && p.activa !== false) cubre += C.anualPartida(p); });
    var sinHucha = e.partidas.filter(function (p) {
      return p.tipo === 'gasto' && p.activa !== false && !p.pagadoDesde && p.frecuencia !== 'mensual';
    }).sort(function (a, b) { return C.anualPartida(b) - C.anualPartida(a); });

    var kp = '<div class="kpis" style="margin-bottom:12px">' +
      U.kpi('En huchas hoy', F.eur0(hoy), e.huchas.length + (e.huchas.length === 1 ? ' hucha' : ' huchas')) +
      U.kpi('Aportas cada mes', F.eur0(aport), F.eur0(aport * 12) + ' al año') +
      U.kpi('Gastos que cubren', F.eur0(cubre), 'al año (tu parte)') +
      U.kpi('Gastos anuales sin hucha', F.eur0(sinHucha.reduce(function (s, p) { return s + C.anualPartida(p); }, 0)), sinHucha.length + ' partidas que caen de golpe', sinHucha.length ? 'warn' : null) +
      U.kpi('Huchas que se quedan cortas', String(negativas), 'Saldo negativo en algún mes de los próximos 24', negativas ? 'warn' : null) +
      '</div>';
    return kp + tarjetas(c) + tablaSaldos(c, o) + '<div class="rejilla r2" style="margin-top:12px">' + objetivos(c) + sinHuchaCard(c, sinHucha) + '</div>';
  }
  function tarjetas(c) {
    var e = c.esc, sim = c.sim;
    var cards = e.huchas.map(function (x, i) {
      var s = sim.porHucha[x.id] || [], min = Infinity, mMin = null;
      for (var t = 0; t < Math.min(24, s.length); t++) if (s[t] < min) { min = s[t]; mMin = sim.inicio + t; }
      var gastos = e.partidas.filter(function (p) { return p.pagadoDesde === x.id && p.activa !== false; });
      var anual = gastos.reduce(function (q, p) { return q + C.anualPartida(p); }, 0);
      var o = C.objetivoHucha(x, sim);
      var meter = '';
      if (x.objetivo > 0) {
        var pct = Math.max(0, Math.min(1, saldoHoy(x) / x.objetivo));
        meter = '<div class="meter" role="meter" aria-valuemin="0" aria-valuemax="100" aria-valuenow="' + Math.round(pct * 100) + '" aria-label="Progreso del objetivo"><span style="width:' + (pct * 100).toFixed(1) + '%"></span></div>' +
          '<div class="kpi-s">Objetivo ' + F.eur0(x.objetivo) + (x.fechaObjetivo ? ' en ' + F.mesCorto(C.ym(x.fechaObjetivo)) : '') + ' · ' + F.pct(pct, 0) + '</div>';
      }
      return '<div class="card hucha-c' + (x.activa === false ? ' off' : '') + '">' +
        '<div class="card-h"><h3><span class="punto" style="background:var(--s' + ((i % 8) + 1) + ')"></span> ' + h(x.nombre) + '</h3>' +
        '<span class="bdg">' + (x.tipo === 'bote' ? 'bote común' : 'hucha') + '</span>' +
        '<button type="button" class="btn sm ghost" data-act="hu-editar" data-id="' + h(x.id) + '">' + U.icono('editar') + 'Editar</button></div>' +
        '<div class="hu-ks"><div><span>Aportas</span><b>' + F.eur0(x.activa === false ? 0 : x.aportacion) + '</b><small>/mes</small></div>' +
        '<div><span>Saldo hoy</span><b>' + F.eur0(saldoHoy(x)) + '</b></div>' +
        '<div><span>En 12 meses</span><b>' + F.eur0(s[11]) + '</b></div>' +
        '<div><span>Mínimo (24 m)</span><b class="' + (min < 0 ? 'neg' : '') + '">' + F.eur0(min) + '</b><small>' + (mMin != null ? F.mesCorto(mMin) : '') + '</small></div></div>' +
        meter +
        '<div class="nota" style="margin-top:6px">' + (gastos.length ? 'Paga: ' + gastos.map(function (p) { return h(p.nombre) + ' <span class="muted">(' + h(PFPresupuesto.frecuenciaTxt(p).replace(/^Mensual$/, 'mensual')) + ')</span>'; }).join(', ') + ' · ' + F.eur0(anual) + '/año' : 'Ahorro libre: no tiene gastos asignados.') + '</div>' +
        (min < 0 ? avisoCorta(x, s, sim, anual) : '') +
        (o && o.llego === false ? '<div class="banner warn sm">' + U.icono('alerta') + '<span>No llegas al objetivo: aporta ' + F.eur(o.aportacionNecesaria) + '/mes.</span></div>' : '') +
        '</div>';
    }).join('');
    return '<div class="seccion-h"><h2>Tus huchas</h2><button type="button" class="btn sm" data-act="hu-nuevo-objetivo">' + U.icono('mas') + 'Nuevo objetivo</button>' +
      '<button type="button" class="btn sm prim" data-act="bt-add-hucha">' + U.icono('mas') + 'Nueva hucha</button></div>' +
      (cards ? '<div class="rejilla r3">' + cards + '</div>' : '<div class="card vacio"><p>Aún no tienes huchas. Crea una para repartir un gasto anual (seguro, ITV, vacaciones, Navidad…) en 12 cuotas.</p></div>');
  }
  /** Primer mes en negativo y cuánto falta: saldo inicial o aportación necesarios para no quedarse corta. */
  function avisoCorta(x, s, sim, anual) {
    var t0 = -1;
    for (var t = 0; t < Math.min(24, s.length); t++) if (s[t] < 0) { t0 = t; break; }
    if (t0 < 0) return '';
    var falta = -s[t0], porMes = Math.ceil(falta / (t0 + 1) / 100) * 100;
    var nec = Math.max(x.aportacion + porMes, Math.ceil(anual / 12 / 100) * 100);
    return '<div class="banner warn sm">' + U.icono('alerta') + '<span>Se queda corta en ' + F.mesLargo(sim.inicio + t0) + ' (' + F.eur0(s[t0]) + '). ' +
      'Pon ' + F.eur0(Math.ceil(falta / 100) * 100) + ' de saldo inicial o aporta ' + F.eur0(nec) + '/mes.</span></div>';
  }
  function tablaSaldos(c, o) {
    var e = c.esc, sim = c.sim, n = o.meses, V = o.vista;
    if (!e.huchas.length) return '';
    var meses = []; for (var t = 0; t < n; t++) meses.push(sim.inicio + t);
    var serie = V === 'hogar' ? sim.porHuchaHogar : sim.porHucha;
    var filas = e.huchas.map(function (x) {
      var s = serie[x.id] || [];
      return '<tr><td class="izq">' + h(x.nombre) + '</td>' + meses.map(function (a, q) { var v = s[q]; return '<td class="' + (v < 0 ? 'neg' : '') + '">' + F.eur0(v, { sinSimbolo: true }) + '</td>'; }).join('') + '</tr>';
    }).join('');
    var tot = meses.map(function (a, q) { var s = 0; e.huchas.forEach(function (x) { s += (serie[x.id] || [])[q] || 0; }); return s; });
    filas += '<tr class="destacada"><td class="izq">Total</td>' + tot.map(function (v) { return '<td class="' + (v < 0 ? 'neg' : '') + '">' + F.eur0(v, { sinSimbolo: true }) + '</td>'; }).join('') + '</tr>';
    return '<div class="card" data-form="hu-vista" style="margin-top:12px"><div class="card-h"><h3>Saldo a final de cada mes <span class="sub">(€)</span></h3>' +
      U.seg([{ id: 'mi', nombre: 'Mi parte' }, { id: 'hogar', nombre: 'Hogar' }], V, { 'data-f': 'vista' }, 'mini') +
      U.seg([{ id: 12, nombre: '12 meses' }, { id: 24, nombre: '24 meses' }], n, { 'data-f': 'meses', 'data-t': 'num' }, 'mini') + '</div>' +
      '<div class="graf bajo"><canvas id="hu-graf" data-key="hu-graf" role="img" aria-label="Saldo de cada hucha mes a mes"></canvas></div>' +
      '<div class="tabla-scroll" style="margin-top:10px"><table class="tabla"><thead><tr><th>Hucha</th>' + meses.map(function (a) { return '<th>' + F.mesCorto(a) + '</th>'; }).join('') + '</tr></thead><tbody>' + filas + '</tbody></table></div></div>';
  }
  function objetivos(c) {
    var e = c.esc, sim = c.sim;
    var con = e.huchas.filter(function (x) { return x.objetivo > 0; });
    var cuerpo = con.length ? con.map(function (x) {
      var o = C.objetivoHucha(x, sim);
      var alc = sim.hitos.huchas[x.id];
      var estado = !x.fechaObjetivo ? (alc != null ? 'Lo alcanzas en ' + F.mesLargo(alc) : 'Al ritmo actual no lo alcanzas')
        : o.vencido ? 'La fecha ya pasó' : o.llego ? '<span class="pos">Llegas</span>' + (alc != null ? ' (en ' + F.mesCorto(alc) + ')' : '') : '<span class="neg">No llegas</span>: faltarían ' + F.eur0(x.objetivo - o.saldoEnFecha);
      return '<tr><td class="izq"><button type="button" class="btn-link" data-act="hu-editar" data-id="' + h(x.id) + '">' + h(x.nombre) + '</button></td><td>' + F.eur0(x.objetivo) + '</td><td>' + (x.fechaObjetivo ? F.mesCorto(C.ym(x.fechaObjetivo)) : '—') + '</td>' +
        '<td>' + F.eur(x.aportacion) + '</td><td><b>' + (o && o.aportacionNecesaria != null ? F.eur(o.aportacionNecesaria) : '—') + '</b></td><td class="izq">' + estado + '</td></tr>';
    }).join('') : '<tr><td colspan="6" class="izq muted">Ningún objetivo todavía. Pon importe y fecha a una hucha (o crea uno nuevo) y verás cuánto tienes que apartar cada mes.</td></tr>';
    return '<div class="card"><div class="card-h"><h3>Objetivos</h3></div><table class="tabla"><thead><tr><th>Objetivo</th><th>Importe</th><th>Fecha</th><th>Aportas</th><th>Necesitas</th><th class="izq">Estado</th></tr></thead><tbody>' + cuerpo + '</tbody></table>' +
      '<p class="nota" style="margin-top:6px">«Necesitas» tiene en cuenta los gastos que salen de la hucha antes de la fecha.</p></div>';
  }
  function sinHuchaCard(c, lista) {
    var cuerpo = lista.length ? lista.map(function (p) {
      var anual = C.anualPartida(p);
      return '<tr><td class="izq">' + h(p.nombre) + '</td><td class="izq">' + h(PFPresupuesto.frecuenciaTxt(p)) + '</td><td>' + F.eur(anual) + '</td><td>' + F.eur(Math.ceil(anual / 12 / 100) * 100) + '</td>' +
        '<td><button type="button" class="btn sm" data-act="hu-crear-para" data-id="' + h(p.id) + '">' + U.icono('hucha') + 'Crear hucha</button></td></tr>';
    }).join('') : '<tr><td colspan="5" class="izq muted">Todos tus gastos no mensuales ya se pagan desde una hucha.</td></tr>';
    return '<div class="card"><div class="card-h"><h3>Gastos anuales o periódicos sin hucha</h3></div><table class="tabla"><thead><tr><th>Gasto</th><th class="izq">Cuándo</th><th>Al año</th><th>Hucha/mes</th><th></th></tr></thead><tbody>' + cuerpo + '</tbody></table>' +
      '<p class="nota" style="margin-top:6px">Con una hucha, el ahorro baja un poco todos los meses y el mes del pago no se dispara.</p></div>';
  }

  function despues(c) {
    var o = opc(c), e = c.esc, sim = c.sim;
    if (!e.huchas.length) return;
    var T = PFCharts.tema(), serie = o.vista === 'hogar' ? sim.porHuchaHogar : sim.porHucha;
    var labels = []; for (var t = 0; t < o.meses; t++) labels.push(F.mesCorto(sim.inicio + t));
    var ds = e.huchas.slice(0, 8).map(function (x, i) {
      return PFCharts.serie('line', T.s[i % 8], { label: x.nombre, data: (serie[x.id] || []).slice(0, o.meses).map(function (v) { return v / 100; }), stepped: false });
    });
    PFCharts.upsert('hu-graf', { type: 'line', data: { labels: labels, datasets: ds }, options: PFCharts.opciones({ desdeCero: false }) });
  }

  function enlazar() {
    U.accion('hu-editar', function (el) { PFEditor.abrir('hucha', el.getAttribute('data-id')); });
    U.accion('hu-crear-para', function (el) { PFEditor.crearHuchaPara(el.getAttribute('data-id')); });
    U.accion('hu-nuevo-objetivo', function () {
      var c = PFApp.ctx(), fecha = C.ymStr(Math.max(C.hoyYM(), C.ym(c.esc.inicio)) + 12);
      var id = PFEditor.crearHucha({ nombre: 'Nuevo objetivo', objetivo: 300000, fechaObjetivo: fecha, aportacion: 25000 });
      PFEditor.abrir('hucha', id, { focoNombre: true });
    });
    U.formulario('hu-vista', function (id, campo, v) {
      if (campo === 'meses') setOpc({ meses: +v === 24 ? 24 : 12 });
      else if (campo === 'vista') setOpc({ vista: v });
    });
  }
  enlazar();
  PFUI.seccion('huchas', { html: html, despues: despues });
  return {};
})();
