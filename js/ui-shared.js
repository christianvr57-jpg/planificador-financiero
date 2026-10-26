/* =============================================================================
   ui-shared.js · Gastos en pareja (estilo Tricount)
   -----------------------------------------------------------------------------
   Libro de gastos compartidos: quién pagó, cómo se reparte y quién debe a quién.
   · Alta rápida con teclado (Enter añade) y edición de cualquier movimiento.
   · Saldo en grande y botón «Saldar» que registra el pago que os equilibra.
   · Importación del CSV que exporta Tricount (o pegado), con vista previa,
     correspondencia de personas y detección de duplicados.
   · Comparación con lo presupuestado para gastos compartidos y avisos.
   Los datos viven en estado.compartido (fuera de los escenarios: es la vida
   real) y se sincronizan con la nube como el resto.
   ============================================================================= */
var PFCompartido = (function () {
  'use strict';
  var C = PFCalc, F = PFFmt, h = PFFmt.html, U = PFUI, S = PFSchema, T = PFTricount;
  var CAT_TRICOUNT = {
    groceries: 'Supermercado', 'food & drinks': 'Supermercado', restaurants: 'Restaurantes', 'restaurants & bars': 'Restaurantes', bars: 'Restaurantes',
    entertainment: 'Ocio', leisure: 'Ocio', transport: 'Transporte', transportation: 'Transporte', accommodation: 'Viajes', travel: 'Viajes', holidays: 'Viajes',
    shopping: 'Compras', health: 'Salud', 'healthcare': 'Salud', gifts: 'Regalos', utilities: 'Suministros', rent: 'Casa', household: 'Casa', home: 'Casa',
    'rent & charges': 'Casa', kids: 'Hijo', children: 'Hijo', pets: 'Perro', other: 'Otros', others: 'Otros', 'money transfer': ''
  };
  var borrador = null;

  function hoy() { var d = new Date(); return d.getFullYear() + '-' + (d.getMonth() < 9 ? '0' : '') + (d.getMonth() + 1) + '-' + (d.getDate() < 10 ? '0' : '') + d.getDate(); }
  function cfg() { return PFStore.get().compartido; }
  function opc(c) { return Object.assign({ mes: 'todos', texto: '', cat: '' }, c.ui.compartido || {}); }
  function setOpc(p) { PFStore.setUI({ compartido: Object.assign({}, PFStore.getUI().compartido || {}, p) }); }
  function nombre(c, id) { var p = c.personas.filter(function (x) { return x.id === id; })[0]; return p ? p.nombre : '¿?'; }
  function otra(c) { return c.personas.filter(function (p) { return p.id !== c.yo; })[0]; }
  function color(c, id) { var i = c.personas.map(function (p) { return p.id; }).indexOf(id); return 'var(--s' + ((i % 8) + 1) + ')'; }
  function fechaCorta(f) { var p = f.split('-'); return (+p[2]) + ' ' + F.mesNombreCorto(+p[1]); }
  function mesTxt(k) { return F.mesLargo(C.ym(k)); }
  function nuevoBorrador(c) {
    return { editId: null, tipo: 'gasto', fecha: hoy(), concepto: '', importe: '', pagadoPor: c.yo, para: (otra(c) || {}).id, modo: 'medias', partes: {}, categoria: '', notas: '' };
  }

  // -------------------------------------------------------------- Render ---
  function html(ctx) {
    var c = cfg(), o = opc(ctx);
    if (!borrador) borrador = nuevoBorrador(c);
    var sal = T.saldos(c), meses = T.porMes(c);
    return '<div class="rejilla r-31">' + tarjetaSaldo(c, sal) + tarjetaMes(c, meses) + '</div>' +
      formulario(c) +
      '<div class="rejilla r2" style="margin-top:12px">' +
      '<div class="card"><div class="card-h"><h3>Gasto compartido por mes</h3><span class="sub">Quién pagó · últimos 12 meses</span></div><div class="graf bajo"><canvas id="tc-mes" data-key="tc-mes" role="img" aria-label="Gasto compartido por mes según quién pagó"></canvas></div></div>' +
      '<div class="card"><div class="card-h"><h3>Evolución del saldo</h3><span class="sub">Por encima de 0: te deben · por debajo: debes</span></div><div class="graf bajo"><canvas id="tc-saldo" data-key="tc-saldo" role="img" aria-label="Evolución de tu saldo"></canvas></div></div>' +
      '</div>' +
      lista(c, o) +
      '<div class="rejilla r2" style="margin-top:12px">' + presupuestoVsReal(ctx, c, meses) + categorias(c) + '</div>' +
      '<div class="rejilla r2" style="margin-top:12px">' + importar() + ajustes(c) + '</div>';
  }
  function tarjetaSaldo(c, sal) {
    var yo = sal[c.yo] || 0, liq = T.liquidaciones(sal), dos = c.personas.length === 2, ot = otra(c);
    var titular;
    if (!yo && !liq.length) titular = '<div class="tc-hero cero">Estáis en paz</div><p class="nota">Nadie debe nada a nadie.</p>';
    else if (dos) titular = '<div class="tc-hero ' + (yo > 0 ? 'pos' : 'neg') + '">' + (yo > 0 ? h(ot.nombre) + ' te debe ' : 'Le debes a ' + h(ot.nombre) + ' ') + '<b>' + F.eur(Math.abs(yo)) + '</b></div>';
    else titular = '<div class="tc-hero ' + (yo >= 0 ? 'pos' : 'neg') + '">Tu saldo: <b>' + F.eur(yo, { signo: true }) + '</b></div>';
    var pasos = liq.map(function (l) {
      return '<div class="tc-liq"><span><b>' + h(nombre(c, l.de)) + '</b> paga <b>' + F.eur(l.importe) + '</b> a <b>' + h(nombre(c, l.a)) + '</b></span>' +
        '<button type="button" class="btn sm prim" data-act="tc-saldar" data-de="' + h(l.de) + '" data-a="' + h(l.a) + '" data-v="' + l.importe + '">Saldar</button></div>';
    }).join('');
    var tot = {};
    c.personas.forEach(function (p) { tot[p.id] = { pagado: 0, parte: 0 }; });
    c.movimientos.forEach(function (m) {
      if (m.tipo !== 'gasto') return;
      tot[m.pagadoPor].pagado += m.importe;
      var r = T.reparto(m, c.personas); for (var id in r) tot[id].parte += r[id];
    });
    var tabla = '<table class="tabla" style="margin-top:12px"><thead><tr><th>Persona</th><th>Ha pagado</th><th>Le corresponde</th><th>Saldo</th></tr></thead><tbody>' +
      c.personas.map(function (p) {
        var s = sal[p.id] || 0;
        return '<tr><td class="izq"><span class="punto" style="background:' + color(c, p.id) + '"></span> ' + h(p.nombre) + (p.id === c.yo ? ' <span class="muted">(tú)</span>' : '') + '</td>' +
          '<td>' + F.eur(tot[p.id].pagado) + '</td><td>' + F.eur(tot[p.id].parte) + '</td><td class="' + (s > 0 ? 'pos' : s < 0 ? 'neg' : '') + '">' + F.eur(s, { signo: true }) + '</td></tr>';
      }).join('') + '</tbody></table>';
    var aviso = Math.abs(yo) > c.umbral && c.umbral > 0 ? '<p class="banner warn sm">' + U.icono('alerta') + '<span>El desequilibrio supera los ' + F.eur0(c.umbral) + ' que te marcaste. ' + (yo > 0 ? 'Pide que te hagan un Bizum o paga tú los próximos gastos menos.' : 'Haz un Bizum o paga tú los próximos gastos comunes.') + '</span></p>' : '';
    var inicial = (c.saldoInicial[c.yo] || 0) ? '<p class="fld-a" style="margin-top:6px">Incluye un saldo de partida de ' + F.eur(c.saldoInicial[c.yo], { signo: true }) + (c.fechaSaldoInicial ? ' (' + fechaCorta(c.fechaSaldoInicial) + ')' : '') + '.</p>' : '';
    return '<div class="card tc-saldo">' + titular + pasos + aviso + tabla + inicial + '</div>';
  }
  function tarjetaMes(c, meses) {
    var k = hoy().slice(0, 7), ant = C.ymStr(C.ym(k) - 1);
    var este = meses.filter(function (m) { return m.mes === k; })[0] || { total: 0, parte: {}, pagado: {}, n: 0 };
    var previo = meses.filter(function (m) { return m.mes === ant; })[0] || { total: 0, parte: {}, pagado: {} };
    var ult = meses.filter(function (m) { return m.mes < k; }).slice(-6);
    var media = ult.length ? Math.round(ult.reduce(function (s, m) { return s + (m.parte[c.yo] || 0); }, 0) / ult.length) : null;
    return '<div class="card"><div class="card-h"><h3>' + h(mesTxt(k).replace(/^\w/, function (x) { return x.toUpperCase(); })) + '</h3><span class="sub">' + este.n + ' gastos</span></div>' +
      '<div class="tc-ks">' +
      '<div><span>Gasto compartido</span><b>' + F.eur0(este.total) + '</b><small>' + (previo.total ? 'mes anterior ' + F.eur0(previo.total) : '') + '</small></div>' +
      '<div><span>Tu parte</span><b>' + F.eur0(este.parte[c.yo] || 0) + '</b><small>' + (media != null ? 'media 6 meses ' + F.eur0(media) : '') + '</small></div>' +
      '<div><span>Has pagado tú</span><b>' + F.eur0(este.pagado[c.yo] || 0) + '</b><small>' + (este.total ? F.pct((este.pagado[c.yo] || 0) / este.total, 0) + ' del total' : '') + '</small></div>' +
      '<div><span>Movimientos</span><b>' + c.movimientos.length + '</b><small>en total</small></div>' +
      '</div></div>';
  }
  function formulario(c) {
    var b = borrador, dos = c.personas.length === 2, ot = otra(c);
    var pers = c.personas.map(function (p) { return { id: p.id, nombre: p.nombre }; });
    var modos = dos ? [{ id: 'medias', nombre: 'A medias' }, { id: 'solo:' + c.yo, nombre: 'Todo mío' }, { id: 'solo:' + ot.id, nombre: 'Todo de ' + ot.nombre }, { id: 'pers', nombre: 'Personalizado' }]
      : [{ id: 'medias', nombre: 'A partes iguales' }, { id: 'pers', nombre: 'Personalizado' }];
    var cats = S.CATEGORIAS_COMPARTIDO.map(function (k) { return { id: k, nombre: k }; });
    var usadas = {};
    c.movimientos.forEach(function (m) { if (m.categoria && S.CATEGORIAS_COMPARTIDO.indexOf(m.categoria) < 0) usadas[m.categoria] = 1; });
    Object.keys(usadas).forEach(function (k) { cats.push({ id: k, nombre: k }); });
    var conceptos = {}, dl = '';
    c.movimientos.slice(-300).forEach(function (m) { if (m.concepto) conceptos[m.concepto] = 1; });
    dl = '<datalist id="tc-conceptos">' + Object.keys(conceptos).slice(-80).map(function (k) { return '<option value="' + h(k) + '">'; }).join('') + '</datalist>';
    var cuerpo;
    if (b.tipo === 'reembolso') {
      cuerpo = '<div class="tc-campos">' +
        campo('Fecha', '<input class="in" type="date" data-bo="fecha" value="' + h(b.fecha) + '">') +
        campo('Quién paga', U.seg(pers, b.pagadoPor, { 'data-act': 'tc-bo', 'data-campo': 'pagadoPor' }, 'mini')) +
        campo('A quién', U.seg(pers, b.para, { 'data-act': 'tc-bo', 'data-campo': 'para' }, 'mini')) +
        campo('Importe', '<input class="in num" data-bo="importe" inputmode="decimal" placeholder="0,00" value="' + h(b.importe) + '" style="width:110px">') +
        campo('Concepto', '<input class="in" data-bo="concepto" placeholder="Bizum, transferencia…" value="' + h(b.concepto) + '" style="width:200px">') +
        '</div>';
    } else {
      var personal = '';
      if (b.modo === 'pers') {
        personal = '<div class="tc-partes">' + c.personas.map(function (p) {
          return '<label class="fila-ctl"><span class="muted">Parte de ' + h(p.nombre) + '</span><input class="in num" data-bo="parte:' + h(p.id) + '" inputmode="decimal" placeholder="auto" value="' + h(b.partes[p.id] || '') + '" style="width:96px"> €</label>';
        }).join('') + '<span class="fld-a">Deja una vacía y se calcula sola con lo que falte.</span></div>';
      }
      cuerpo = '<div class="tc-campos">' +
        campo('Fecha', '<input class="in" type="date" data-bo="fecha" value="' + h(b.fecha) + '">') +
        campo('Concepto', '<input class="in" data-bo="concepto" list="tc-conceptos" placeholder="Mercadona, cena, farmacia…" value="' + h(b.concepto) + '" style="width:220px" autocomplete="off">' + dl) +
        campo('Importe', '<input class="in num" data-bo="importe" inputmode="decimal" placeholder="0,00" value="' + h(b.importe) + '" style="width:100px">') +
        campo('Pagó', U.seg(pers, b.pagadoPor, { 'data-act': 'tc-bo', 'data-campo': 'pagadoPor' }, 'mini')) +
        campo('Para', U.seg(modos, b.modo, { 'data-act': 'tc-bo', 'data-campo': 'modo' }, 'mini')) +
        campo('Categoría', '<select class="in" data-bo="categoria" data-value="' + h(b.categoria) + '"><option value="">Automática</option>' + U.opcionesSelect(cats, b.categoria) + '</select>') +
        '</div>' + personal;
    }
    var tipos = [{ id: 'gasto', nombre: 'Gasto' }, { id: 'reembolso', nombre: 'Pago entre vosotros' }, { id: 'ingreso', nombre: 'Ingreso / devolución' }];
    return '<div class="card tc-form' + (b.editId ? ' editando' : '') + '" style="margin-top:12px"><div class="card-h"><h3>' + (b.editId ? 'Editando movimiento' : 'Añadir') + '</h3>' +
      U.seg(tipos, b.tipo, { 'data-act': 'tc-bo', 'data-campo': 'tipo' }, 'mini') + '<span class="sp"></span>' +
      (b.editId ? '<button type="button" class="btn sm ghost" data-act="tc-cancelar">Cancelar</button>' : '<span class="fld-a">Enter para añadir</span>') +
      '<button type="button" class="btn sm prim" data-act="tc-guardar">' + U.icono(b.editId ? 'ok' : 'mas') + (b.editId ? 'Guardar cambios' : 'Añadir') + '</button></div>' +
      cuerpo + (b.tipo === 'ingreso' ? '<p class="fld-a" style="margin-top:6px">Dinero que entra para los dos (una devolución, un reembolso de un seguro…): se reparte como un gasto pero restando.</p>' : '') + '</div>';
  }
  function campo(etq, ctl) { return '<div class="fld"><span class="fld-l">' + etq + '</span>' + ctl + '</div>'; }

  function lista(c, o) {
    var meses = {}, todos = c.movimientos.slice().reverse();
    var catSet = {};
    todos.forEach(function (m) { meses[m.fecha.slice(0, 7)] = 1; if (m.categoria) catSet[m.categoria] = 1; });
    var txt = T.norm(o.texto);
    var vis = todos.filter(function (m) {
      if (o.mes !== 'todos' && m.fecha.slice(0, 7) !== o.mes) return false;
      if (o.cat && m.categoria !== o.cat) return false;
      if (txt && T.norm(m.concepto + ' ' + m.notas + ' ' + m.categoria).indexOf(txt) < 0) return false;
      return true;
    });
    var limite = o.todos ? vis.length : Math.min(vis.length, 150);
    var filas = '', mesAct = null;
    vis.slice(0, limite).forEach(function (m) {
      var k = m.fecha.slice(0, 7);
      if (k !== mesAct) {
        mesAct = k;
        var delMes = vis.filter(function (x) { return x.fecha.slice(0, 7) === k; });
        var tot = 0, mia = 0;
        delMes.forEach(function (x) { if (x.tipo === 'reembolso') return; var sg = x.tipo === 'ingreso' ? -1 : 1; tot += sg * x.importe; mia += sg * T.reparto(x, c.personas)[c.yo]; });
        filas += '<tr class="tc-mesrow"><td colspan="4" class="izq">' + h(mesTxt(k)) + '</td><td>' + F.eur(tot) + '</td><td>' + F.eur(mia) + '</td><td colspan="2"></td></tr>';
      }
      var ef = T.efecto(m, c.personas)[c.yo] || 0, parte = m.tipo === 'reembolso' ? null : T.reparto(m, c.personas)[c.yo] * (m.tipo === 'ingreso' ? -1 : 1);
      var reparto = '';
      if (m.tipo === 'reembolso') reparto = h(nombre(c, m.pagadoPor)) + ' → ' + h(nombre(c, m.para));
      else {
        var r = T.reparto(m, c.personas), ids = c.personas.filter(function (p) { return r[p.id] > 0; });
        reparto = ids.length === c.personas.length && (m.reparto.modo === 'iguales') ? 'a medias' : ids.length === 1 ? 'solo ' + h(ids[0].nombre) : 'personalizado';
      }
      var etq = m.tipo === 'reembolso' ? '<span class="bdg">pago</span> ' : m.tipo === 'ingreso' ? '<span class="bdg">ingreso</span> ' : '';
      filas += '<tr class="' + (borrador && borrador.editId === m.id ? 'tc-sel' : '') + '"' + (m.notas ? ' data-tip="' + h(m.notas) + '"' : '') + '><td class="izq tc-f">' + fechaCorta(m.fecha) + '</td>' +
        '<td class="izq tc-c">' + etq + h(m.concepto) + '</td><td class="izq muted">' + h(m.categoria || '') + '</td>' +
        '<td class="izq"><span class="punto" style="background:' + color(c, m.pagadoPor) + '"></span> ' + h(nombre(c, m.pagadoPor)) + ' <span class="muted">· ' + reparto + '</span></td>' +
        '<td>' + F.eur(m.importe) + '</td><td>' + (parte == null ? '<span class="muted">–</span>' : F.eur(parte)) + '</td>' +
        '<td class="' + (ef > 0 ? 'pos' : ef < 0 ? 'neg' : 'muted') + '" data-tip="Efecto en tu saldo: positivo = te deben más">' + (ef ? F.eur(ef, { signo: true }) : '0') + '</td>' +
        '<td class="acc"><button type="button" class="btn ico-b sm ghost" data-act="tc-editar" data-id="' + h(m.id) + '" aria-label="Editar">' + U.icono('editar') + '</button>' +
        '<button type="button" class="btn ico-b sm ghost" data-act="tc-duplicar" data-id="' + h(m.id) + '" aria-label="Repetir hoy" data-tip="Repetir con fecha de hoy">' + U.icono('copiar') + '</button>' +
        '<button type="button" class="btn ico-b sm ghost peligro" data-act="tc-borrar" data-id="' + h(m.id) + '" aria-label="Borrar">' + U.icono('papelera') + '</button></td></tr>';
    });
    var opMes = [{ id: 'todos', nombre: 'Todos los meses' }].concat(Object.keys(meses).sort().reverse().map(function (k) { return { id: k, nombre: mesTxt(k) }; }));
    var opCat = [{ id: '', nombre: 'Todas las categorías' }].concat(Object.keys(catSet).sort().map(function (k) { return { id: k, nombre: k }; }));
    return '<div class="card" data-form="tc-filtro" style="margin-top:12px"><div class="card-h"><h3>Movimientos</h3>' +
      '<input class="in" data-f="texto" data-t="txt" placeholder="Buscar…" value="' + h(o.texto) + '" style="width:170px" aria-label="Buscar movimientos">' +
      U.select('mes', opMes, o.mes, ' aria-label="Mes"') + U.select('cat', opCat, o.cat, ' aria-label="Categoría"') + '</div>' +
      (vis.length ? '<div class="tabla-scroll" style="max-height:520px"><table class="tabla tc-tabla"><thead><tr><th>Fecha</th><th class="izq">Concepto</th><th class="izq">Categoría</th><th class="izq">Pagó · para</th><th>Importe</th><th>Tu parte</th><th>Tu saldo</th><th></th></tr></thead><tbody>' + filas + '</tbody></table></div>' +
        (vis.length > limite ? '<button type="button" class="btn sm" data-act="tc-ver-todos" style="margin-top:8px">Ver los ' + vis.length + ' movimientos</button>' : '')
        : '<p class="nota">' + (c.movimientos.length ? 'Ningún movimiento con esos filtros.' : 'Aún no hay movimientos. Añade el primero arriba o importa el CSV de Tricount más abajo.') + '</p>') +
      '</div>';
  }
  function presupuestoVsReal(ctx, c, meses) {
    var e = ctx.esc, ini = C.ym(e.inicio), cx = { inicio: ini, hip: C.hipotesis(e.hipotesis) };
    var compartidas = e.partidas.filter(function (p) { return p.tipo === 'gasto' && p.activa !== false && p.miParte < 1; });
    var k0 = hoy().slice(0, 7), lista = [];
    for (var i = 5; i >= 0; i--) lista.push(C.ym(k0) - i);
    var filas = lista.map(function (a) {
      var k = C.ymStr(a), real = (meses.filter(function (m) { return m.mes === k; })[0] || { parte: {} }).parte[c.yo] || 0;
      var pres = a < ini ? null : compartidas.reduce(function (s, p) { return s + C.parte(C.importeMes(p, a, cx), p.miParte); }, 0);
      var dif = pres == null ? null : real - pres;
      return '<tr><td class="izq">' + h(F.mesCorto(a)) + '</td><td>' + (pres == null ? '—' : F.eur0(pres)) + '</td><td>' + F.eur0(real) + '</td><td class="' + (dif == null ? '' : dif > 0 ? 'neg' : 'pos') + '">' + (dif == null ? '—' : F.eur0(dif, { signo: true })) + '</td></tr>';
    }).join('');
    return '<div class="card"><div class="card-h"><h3>Presupuesto frente a real</h3><span class="sub">Tu parte de los gastos compartidos</span></div>' +
      '<table class="tabla"><thead><tr><th>Mes</th><th>Presupuestado</th><th>Real (aquí)</th><th>Diferencia</th></tr></thead><tbody>' + filas + '</tbody></table>' +
      '<p class="nota" style="margin-top:6px">«Presupuestado» suma tu parte de las partidas del presupuesto con «Me corresponde» por debajo del 100 % (' + compartidas.length + ' partidas). En rojo, meses en los que gastasteis más de lo previsto.</p></div>';
  }
  function categorias(c) {
    var k = hoy().slice(0, 7), ini = C.ymStr(C.ym(k) - 11) + '-01';
    var anio = T.porCategoria(c, c.yo, ini), mes = T.porCategoria(c, c.yo, k + '-01', k + '-31');
    var keys = Object.keys(anio).filter(function (x) { return anio[x]; }).sort(function (a, b) { return anio[b] - anio[a]; });
    var max = keys.length ? Math.max.apply(null, keys.map(function (x) { return anio[x]; })) : 1;
    var filas = keys.map(function (x) {
      return '<tr><td class="izq">' + h(x) + '</td><td class="tc-barra"><span style="width:' + Math.max(2, anio[x] / max * 100).toFixed(1) + '%"></span></td><td>' + F.eur0(mes[x] || 0) + '</td><td><b>' + F.eur0(anio[x]) + '</b></td><td>' + F.eur0(anio[x] / 12) + '</td></tr>';
    }).join('');
    return '<div class="card"><div class="card-h"><h3>Tu parte por categoría</h3><span class="sub">Últimos 12 meses</span></div>' +
      (filas ? '<table class="tabla"><thead><tr><th>Categoría</th><th></th><th>Este mes</th><th>12 meses</th><th>Al mes</th></tr></thead><tbody>' + filas + '</tbody></table>' : '<p class="nota">Sin gastos todavía.</p>') + '</div>';
  }
  function importar() {
    return '<div class="card"><div class="card-h"><h3>Importar desde Tricount</h3></div>' +
      '<ol class="nota pasos" style="margin-top:0"><li>En la app de Tricount, abre el grupo › menú (⋯) › <b>Exportar</b> y elige <b>CSV</b> (o Excel guardado como CSV).</li>' +
      '<li>Elige ese archivo aquí o pega su contenido. Verás una vista previa antes de importar; los movimientos repetidos se ignoran.</li></ol>' +
      '<div class="fila-ctl" style="margin-top:10px"><button type="button" class="btn sm prim" data-act="tc-imp-archivo">' + U.icono('abrir') + 'Elegir archivo CSV</button>' +
      '<span class="muted">o</span><button type="button" class="btn sm" data-act="tc-imp-pegar">Pegar contenido</button></div>' +
      '<p class="fld-a" style="margin-top:8px">¿No quieres meter el historial? Pon abajo el saldo que te muestra Tricount hoy como «saldo de partida» y apunta aquí solo lo nuevo.</p></div>';
  }
  function ajustes(c) {
    var pers = c.personas.map(function (p) { return { id: p.id, nombre: p.nombre }; });
    var ot = otra(c), si = c.saldoInicial[c.yo] || 0;
    return '<div class="card" data-form="tc-ajustes"><div class="card-h"><h3>Personas y saldo de partida</h3></div>' +
      '<table class="tabla tabla-form"><tbody>' + c.personas.map(function (p) {
        return '<tr data-form="tc-persona" data-id="' + h(p.id) + '"><td class="izq"><span class="punto" style="background:' + color(c, p.id) + '"></span></td><td class="izq"><input class="in" data-f="nombre" data-t="txt" value="' + h(p.nombre) + '" aria-label="Nombre"></td>' +
          '<td class="izq">' + (p.id === c.yo ? '<span class="bdg">tú</span>' : '<button type="button" class="btn-link" data-act="tc-soy" data-id="' + h(p.id) + '">Soy yo</button>') + '</td>' +
          '<td>' + (c.personas.length > 2 ? '<button type="button" class="btn ico-b sm ghost" data-act="tc-persona-borrar" data-id="' + h(p.id) + '" aria-label="Quitar persona">' + U.icono('x') + '</button>' : '') + '</td></tr>';
      }).join('') + '</tbody></table>' +
      '<button type="button" class="btn sm ghost" data-act="tc-persona-add" style="margin-top:6px">' + U.icono('mas') + 'Añadir persona</button>' +
      (c.personas.length === 2 ? '<div class="fld" style="margin-top:12px"><span class="fld-l">Saldo de partida (lo que marcaba Tricount al empezar aquí)</span><div class="fila-ctl">' +
        U.seg([{ id: 'meDeben', nombre: ot.nombre + ' me debía' }, { id: 'debo', nombre: 'Yo le debía' }], si < 0 ? 'debo' : 'meDeben', { 'data-f': 'sentido' }, 'mini') +
        U.campoEur('saldoInicial', Math.abs(si), ' style="width:110px" aria-label="Saldo de partida"') +
        '<input class="in" type="date" data-f="fechaSaldoInicial" data-t="txt" value="' + h(c.fechaSaldoInicial || '') + '" aria-label="Fecha del saldo de partida"></div></div>' : '') +
      '<div class="fld" style="margin-top:12px"><span class="fld-l">Avisarme si el desequilibrio supera</span><div class="fila-ctl">' + U.campoEur('umbral', c.umbral, ' style="width:110px"') +
      '<span class="fld-a">0 = sin aviso. Aparece aquí y en el Resumen.</span></div></div></div>';
  }

  // ------------------------------------------------------------ Gráficos ---
  function despues() {
    var c = cfg(), T2 = PFCharts.tema(), meses = T.porMes(c), k0 = hoy().slice(0, 7);
    var lab = [], idx = {};
    for (var i = 11; i >= 0; i--) { var a = C.ym(k0) - i; lab.push(F.mesCorto(a)); idx[C.ymStr(a)] = 11 - i; }
    var ds = c.personas.slice(0, 8).map(function (p, n) {
      var d = lab.map(function () { return 0; });
      meses.forEach(function (m) { if (idx[m.mes] != null) d[idx[m.mes]] = (m.pagado[p.id] || 0) / 100; });
      return PFCharts.serie('bar', T2.s[n % 8], { label: 'Pagó ' + p.nombre, data: d });
    });
    PFCharts.upsert('tc-mes', { type: 'bar', data: { labels: lab, datasets: ds }, options: PFCharts.opciones({ apilado: true }) });
    var sl = ['inicio'], sv = [(c.saldoInicial[c.yo] || 0) / 100];
    var ult = meses.slice(-24);
    if (meses.length > 24) { var prev = meses[meses.length - 25]; sv[0] = (prev.saldo[c.yo] || 0) / 100; sl[0] = F.mesCorto(C.ym(prev.mes)); }
    ult.forEach(function (m) { sl.push(F.mesCorto(C.ym(m.mes))); sv.push((m.saldo[c.yo] || 0) / 100); });
    var op = PFCharts.opciones({ desdeCero: false, leyenda: false });
    op.plugins.tooltip.callbacks.label = function (x) { var v = x.parsed.y; return ' ' + (v >= 0 ? 'Te deben ' : 'Debes ') + F.eur(Math.abs(Math.round(v * 100))); };
    PFCharts.upsert('tc-saldo', { type: 'line', data: { labels: sl, datasets: [PFCharts.serie('area', T2.s[0], { label: 'Tu saldo', data: sv, backgroundColor: PFCharts.alfa(T2.s[0], 0.10), pointRadius: 3, pointBackgroundColor: T2.s[0] })] }, options: op });
  }

  // ------------------------------------------------------------ Guardar ---
  function guardarBorrador() {
    var c = cfg(), b = borrador;
    var imp = F.leerImporte(b.importe);
    if (!imp || imp <= 0) { U.toast('Escribe un importe mayor que 0 (admite sumas: 12,50+3).', { tipo: 'error' }); enfocar('importe'); return; }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(b.fecha)) { U.toast('Elige una fecha.', { tipo: 'error' }); return; }
    var m = { tipo: b.tipo, fecha: b.fecha, concepto: (b.concepto || '').trim(), importe: imp, pagadoPor: b.pagadoPor, notas: b.notas || '' };
    if (b.tipo === 'reembolso') {
      if (b.para === b.pagadoPor) { U.toast('Quien paga y quien recibe deben ser distintos.', { tipo: 'error' }); return; }
      m.para = b.para; m.concepto = m.concepto || 'Pago para equilibrar'; m.categoria = '';
    } else {
      m.concepto = m.concepto || (b.categoria || (b.tipo === 'ingreso' ? 'Ingreso' : 'Gasto'));
      m.categoria = b.categoria || categoriaAuto(c, m.concepto);
      if (b.modo === 'medias') m.reparto = { modo: 'iguales', partes: {} };
      else if (b.modo.indexOf('solo:') === 0) {
        var solo = b.modo.slice(5), pr = {}; c.personas.forEach(function (p) { pr[p.id] = p.id === solo ? 1 : 0; });
        m.reparto = { modo: 'iguales', partes: pr };
      } else {
        var partes = {}, vacias = [], suma = 0, mal = false;
        c.personas.forEach(function (p) {
          var t = (b.partes[p.id] || '').trim();
          if (!t) { vacias.push(p.id); return; }
          var v = F.leerImporte(t); if (v == null || v < 0) mal = true; else { partes[p.id] = v; suma += v; }
        });
        if (mal) { U.toast('Revisa las partes de cada persona.', { tipo: 'error' }); return; }
        if (vacias.length === 1) { partes[vacias[0]] = imp - suma; suma = imp; }
        else vacias.forEach(function (id) { partes[id] = 0; });
        if (suma !== imp || Object.keys(partes).some(function (id) { return partes[id] < 0; })) { U.toast('Las partes suman ' + F.eur(suma) + ' y el importe es ' + F.eur(imp) + '.', { tipo: 'error' }); return; }
        m.reparto = { modo: 'importes', partes: partes };
      }
    }
    var editId = b.editId;
    PFStore.update(function (s) {
      var lista = s.compartido.movimientos;
      if (editId) {
        var x = lista.filter(function (y) { return y.id === editId; })[0];
        if (x) { for (var k in m) x[k] = m[k]; if (m.tipo === 'reembolso') delete x.reparto; else delete x.para; }
      } else lista.push(Object.assign({ id: S.uid('m'), creado: new Date().toISOString() }, m));
      s.compartido = S.compartido(s.compartido);
    }, { etiqueta: (editId ? 'editar' : 'añadir') + ' «' + m.concepto + '»' });
    var mantener = { fecha: b.fecha, pagadoPor: b.pagadoPor, tipo: b.tipo === 'reembolso' ? 'gasto' : b.tipo, modo: b.modo };
    borrador = Object.assign(nuevoBorrador(c), editId ? {} : mantener);
    U.toast((editId ? 'Cambios guardados en «' : 'Añadido «') + m.concepto + '» · ' + F.eur(imp), { accion: 'Deshacer', fn: function () { PFStore.undo(); } });
    // Vaciar ya los campos (el render no toca el campo que tiene el foco)
    document.querySelectorAll('.tc-form [data-bo]').forEach(function (el) {
      var k = el.getAttribute('data-bo');
      el.value = k.indexOf('parte:') === 0 ? '' : (borrador[k] == null ? '' : borrador[k]);
    });
    enfocar('concepto');
  }
  function categoriaAuto(c, concepto) {
    var n = T.norm(concepto);
    for (var i = c.movimientos.length - 1; i >= 0; i--) if (T.norm(c.movimientos[i].concepto) === n && c.movimientos[i].categoria) return c.movimientos[i].categoria;
    var reglas = [[/mercadona|carrefour|lidl|aldi|dia\b|eroski|super|consum|alcampo|hipercor|ahorramas|bonpreu|compra/, 'Supermercado'],
      [/cena|comida|restaur|bar\b|cafe|burger|pizza|glovo|just eat|uber eats|tapas|menu/, 'Restaurantes'],
      [/luz|agua|gas\b|internet|fibra|movil|iberdrola|endesa|naturgy|vodafone|movistar|orange/, 'Suministros'],
      [/alquiler|comunidad|ikea|leroy|casa|hogar|limpieza/, 'Casa'], [/cole|guarde|pañal|panal|niñ|nin[oa]|hijo|extraescolar/, 'Hijo'],
      [/perro|pienso|vet|kiwoko|tiendanimal/, 'Perro'], [/cine|concierto|entrada|netflix|spotify|ocio|teatro/, 'Ocio'],
      [/gasolina|parking|peaje|renfe|taxi|cabify|bus|metro|tren/, 'Transporte'], [/hotel|vuelo|airbnb|booking|viaje|ryanair|vueling/, 'Viajes'],
      [/farmacia|medic|dentist|salud|optica/, 'Salud'], [/regalo|cumple/, 'Regalos'], [/amazon|zara|ropa|primark|decathlon/, 'Compras']];
    for (var j = 0; j < reglas.length; j++) if (reglas[j][0].test(n)) return reglas[j][1];
    return 'Otros';
  }
  function enfocar(campo) { var el = document.querySelector('.tc-form [data-bo="' + campo + '"]'); if (el) { el.focus(); if (el.select) el.select(); } }
  function editar(id) {
    var c = cfg(), m = c.movimientos.filter(function (x) { return x.id === id; })[0]; if (!m) return;
    var modo = 'medias', partes = {};
    if (m.tipo !== 'reembolso') {
      var r = m.reparto, inc = c.personas.filter(function (p) { return r.partes[p.id] == null || +r.partes[p.id]; });
      if (r.modo === 'iguales' && inc.length === c.personas.length) modo = 'medias';
      else if (r.modo === 'iguales' && inc.length === 1 && c.personas.length === 2) modo = 'solo:' + inc[0].id;
      else { modo = 'pers'; var rp = T.reparto(m, c.personas); c.personas.forEach(function (p) { partes[p.id] = F.numero(rp[p.id] / 100, 2); }); }
    }
    borrador = { editId: id, tipo: m.tipo, fecha: m.fecha, concepto: m.concepto, importe: F.numero(m.importe / 100, 2), pagadoPor: m.pagadoPor,
                 para: m.para || (otra(c) || {}).id, modo: modo, partes: partes, categoria: m.categoria || '', notas: m.notas || '' };
    PFApp.render();
    setTimeout(function () { var f = document.querySelector('.tc-form'); if (f) f.scrollIntoView({ block: 'center', behavior: 'smooth' }); enfocar('concepto'); }, 60);
  }

  // ----------------------------------------------------------- Importar ---
  function analizar(texto, nombreArchivo) {
    var p = T.parseCSV(texto);
    if (!p.cabecera.length || !p.filas.length) { U.toast('No encuentro filas en ese CSV.', { tipo: 'error' }); return; }
    var c = cfg(), map = T.detectarColumnas(p.cabecera);
    var st = { cab: p.cabecera, filas: p.filas, map: map, personasMap: {}, renombrar: true, nombre: nombreArchivo || 'texto pegado' };
    // Nombres que aparecen en el CSV
    var nombres = {};
    if (map.idx.pagadoPor >= 0) p.filas.forEach(function (f) { var n = String(f[map.idx.pagadoPor] || '').trim(); if (n) nombres[n] = 1; });
    map.para.forEach(function (x) { nombres[x.nombre] = 1; });
    var lista = Object.keys(nombres), libres = c.personas.slice();
    lista.forEach(function (n) {
      var p0 = libres.filter(function (x) { return T.norm(x.nombre) === T.norm(n); })[0];
      if (p0) { st.personasMap[n] = p0.id; libres = libres.filter(function (x) { return x !== p0; }); }
    });
    st.nombresCSV = lista;
    st.renombrar = c.personas.some(function (x) { return x.nombre === 'Yo' || x.nombre === 'Mi pareja'; });
    abrirDialogo(st);
  }
  function previa(st) {
    var c = cfg();
    var r = T.convertir({ cab: st.cab, filas: st.filas, map: st.map, personas: c.personas, personasMap: st.personasMap, hoy: hoy() });
    var huellas = {}; c.movimientos.forEach(function (m) { huellas[T.huella(m)] = 1; });
    r.movimientos.forEach(function (m) {
      var cat = CAT_TRICOUNT[T.norm(m.categoria)];
      if (cat != null) m.categoria = cat; else if (!m.categoria && m.tipo !== 'reembolso') m.categoria = categoriaAuto(c, m.concepto);
    });
    r.nuevos = r.movimientos.filter(function (m) { return !huellas[T.huella(m)]; });
    r.duplicados = r.movimientos.length - r.nuevos.length;
    return r;
  }
  function abrirDialogo(st) {
    var d = document.createElement('dialog');
    d.className = 'modal tc-imp';
    document.body.appendChild(d);
    function pinta() {
      var c = cfg(), r = previa(st);
      var cols = [{ id: -1, nombre: '— ninguna —' }].concat(st.cab.map(function (x, i) { return { id: i, nombre: x || ('Columna ' + (i + 1)) }; }));
      var campos = [['concepto', 'Concepto'], ['importe', 'Importe'], ['fecha', 'Fecha'], ['pagadoPor', 'Pagado por'], ['categoria', 'Categoría'], ['tipo', 'Tipo']];
      var pers = c.personas.map(function (p) { return { id: p.id, nombre: p.nombre }; });
      var sinMapear = st.nombresCSV.filter(function (n) { return !st.personasMap[n]; });
      var sal = T.saldos(Object.assign({}, c, { movimientos: c.movimientos.concat(r.nuevos.map(function (m, i) { return Object.assign({ id: 'tmp' + i }, m, m.tipo === 'reembolso' ? {} : { reparto: m.reparto }); })) }));
      var yo = sal[c.yo] || 0, ot = otra(c);
      d.innerHTML = '<h2>Importar «' + h(st.nombre) + '»</h2>' +
        '<p>' + st.filas.length + ' filas · <b>' + r.nuevos.length + ' movimientos nuevos</b>' + (r.duplicados ? ' · ' + r.duplicados + ' ya estaban (se ignoran)' : '') + (r.errores.length ? ' · <span class="neg">' + r.errores.length + ' con errores</span>' : '') + '</p>' +
        '<div class="tc-map"><div><h3>Columnas</h3>' + campos.map(function (f) {
          return '<label class="fila-ctl"><span>' + f[1] + '</span><select class="in" data-imp="campo:' + f[0] + '">' + U.opcionesSelect(cols, st.map.idx[f[0]]) + '</select></label>';
        }).join('') + (st.map.para.length ? '<p class="fld-a">Reparto por persona: ' + st.map.para.map(function (x) { return h(st.cab[x.col]); }).join(', ') + '</p>' : '<p class="fld-a">Sin columnas de reparto: todo se importa a medias.</p>') + '</div>' +
        '<div><h3>Personas</h3>' + (c.personas.length === 2 && st.nombresCSV.length === 2 ? '<div class="fila-ctl" style="margin-bottom:8px"><span>¿Cuál eres tú en Tricount?</span>' +
          st.nombresCSV.map(function (n) { return '<button type="button" class="btn sm' + (st.personasMap[n] === c.yo ? ' prim' : '') + '" data-imp-yo="' + h(n) + '">' + h(n) + '</button>'; }).join('') + '</div>' : '') +
          st.nombresCSV.map(function (n) {
          return '<label class="fila-ctl"><span>«' + h(n) + '» es</span><select class="in" data-imp="persona:' + h(n) + '">' + U.opcionesSelect([{ id: '', nombre: '— elegir —' }].concat(pers), st.personasMap[n] || '') + '</select></label>';
        }).join('') + (st.nombresCSV.length ? '<label class="fila-ctl"><input type="checkbox" data-imp="renombrar"' + (st.renombrar ? ' checked' : '') + '> Usar estos nombres para las personas</label>' : '') + '</div></div>' +
        (r.errores.length ? '<p class="fld-a neg">' + r.errores.slice(0, 4).map(function (x) { return 'Fila ' + x.fila + ': ' + h(x.motivo); }).join(' · ') + (r.errores.length > 4 ? '…' : '') + '</p>' : '') +
        '<div class="tabla-scroll" style="max-height:220px;margin-top:8px"><table class="tabla"><thead><tr><th>Fecha</th><th class="izq">Concepto</th><th class="izq">Categoría</th><th class="izq">Pagó</th><th>Importe</th><th>Tu parte</th></tr></thead><tbody>' +
        r.nuevos.slice(0, 12).map(function (m) {
          var parte = m.tipo === 'reembolso' ? '–' : F.eur(T.reparto(m, c.personas)[c.yo]);
          return '<tr><td class="izq">' + h(m.fecha) + '</td><td class="izq">' + (m.tipo === 'reembolso' ? '<span class="bdg">pago</span> ' : '') + h(m.concepto) + '</td><td class="izq">' + h(m.categoria || '') + '</td><td class="izq">' + h(nombre(c, m.pagadoPor)) + (m.para ? ' → ' + h(nombre(c, m.para)) : '') + '</td><td>' + F.eur(m.importe) + '</td><td>' + parte + '</td></tr>';
        }).join('') + (r.nuevos.length > 12 ? '<tr><td colspan="6" class="izq muted">… y ' + (r.nuevos.length - 12) + ' más</td></tr>' : '') + '</tbody></table></div>' +
        '<p class="nota" style="margin-top:8px">Después de importar: ' + (c.personas.length === 2 ? (yo > 0 ? h(ot.nombre) + ' te deberá ' + F.eur(yo) : yo < 0 ? 'le deberás ' + F.eur(-yo) + ' a ' + h(ot.nombre) : 'estaréis en paz') : 'tu saldo será ' + F.eur(yo, { signo: true })) + '. Compáralo con lo que marca Tricount.</p>' +
        '<div class="modal-acc"><button type="button" class="btn" data-imp-res="no">Cancelar</button><button type="button" class="btn prim" data-imp-res="ok"' + (r.nuevos.length && !sinMapear.length ? '' : ' disabled') + '>' + (sinMapear.length ? 'Indica quién es cada persona' : 'Importar ' + r.nuevos.length + ' movimientos') + '</button></div>';
    }
    d.addEventListener('change', function (e) {
      var k = e.target.getAttribute('data-imp'); if (!k) return;
      if (k === 'renombrar') st.renombrar = e.target.checked;
      else if (k.indexOf('campo:') === 0) st.map.idx[k.slice(6)] = +e.target.value;
      else if (k.indexOf('persona:') === 0) st.personasMap[k.slice(8)] = e.target.value;
      pinta();
    });
    d.addEventListener('click', function (e) {
      var yoBtn = e.target.closest('[data-imp-yo]');
      if (yoBtn) {
        var c0 = cfg(), soy = yoBtn.getAttribute('data-imp-yo'), ot0 = otra(c0);
        st.nombresCSV.forEach(function (n) { st.personasMap[n] = n === soy ? c0.yo : ot0.id; });
        pinta(); return;
      }
      var b = e.target.closest('[data-imp-res]'); if (!b) return;
      if (b.disabled) return;
      if (b.getAttribute('data-imp-res') === 'ok') {
        var r = previa(st);
        PFStore.update(function (s) {
          if (st.renombrar) st.nombresCSV.forEach(function (n) { var id = st.personasMap[n]; var p = s.compartido.personas.filter(function (x) { return x.id === id; })[0]; if (p) p.nombre = n; });
          r.nuevos.forEach(function (m) { s.compartido.movimientos.push(Object.assign({ id: S.uid('m'), creado: new Date().toISOString() }, m)); });
          s.compartido = S.compartido(s.compartido);
        }, { etiqueta: 'importar Tricount' });
        U.toast(r.nuevos.length + ' movimientos importados.', { accion: 'Deshacer', fn: function () { PFStore.undo(); } });
      }
      d.close(); d.remove();
    });
    d.addEventListener('cancel', function () { d.remove(); });
    pinta();
    d.showModal();
  }

  // ----------------------------------------------------------- Acciones ---
  function enlazar() {
    document.addEventListener('input', function (e) {
      var k = e.target.getAttribute && e.target.getAttribute('data-bo');
      if (!k || !borrador) return;
      if (k.indexOf('parte:') === 0) borrador.partes[k.slice(6)] = e.target.value; else borrador[k] = e.target.value;
    });
    document.addEventListener('change', function (e) {
      var k = e.target.getAttribute && e.target.getAttribute('data-bo');
      if (k === 'categoria' && borrador) borrador.categoria = e.target.value;
    });
    document.addEventListener('keydown', function (e) {
      if (e.key !== 'Enter' || !e.target.closest || !e.target.closest('.tc-form') || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'BUTTON') return;
      if (e.target.list && e.target.value && e.isComposing) return;
      e.preventDefault(); guardarBorrador();
    });
    U.accion('tc-bo', function (el) {
      var campo = el.getAttribute('data-campo'), v = el.getAttribute('data-v');
      borrador[campo] = v;
      if (campo === 'tipo' && v === 'reembolso') {
        var c = cfg(), s = T.saldos(c), l = T.liquidaciones(s)[0];
        if (l) { borrador.pagadoPor = l.de; borrador.para = l.a; if (!borrador.importe) borrador.importe = F.numero(l.importe / 100, 2); }
      }
      if (campo === 'pagadoPor' && borrador.tipo === 'reembolso' && borrador.para === v) borrador.para = (cfg().personas.filter(function (p) { return p.id !== v; })[0] || {}).id;
      PFApp.render();
    });
    U.accion('tc-guardar', guardarBorrador);
    U.accion('tc-cancelar', function () { borrador = nuevoBorrador(cfg()); PFApp.render(); });
    U.accion('tc-editar', function (el) { editar(el.getAttribute('data-id')); });
    U.accion('tc-duplicar', function (el) {
      var m = cfg().movimientos.filter(function (x) { return x.id === el.getAttribute('data-id'); })[0]; if (!m) return;
      PFStore.update(function (s) { s.compartido.movimientos.push(Object.assign(S.clon(m), { id: S.uid('m'), fecha: hoy(), creado: new Date().toISOString() })); s.compartido = S.compartido(s.compartido); }, { etiqueta: 'repetir «' + m.concepto + '»' });
      U.toast('«' + m.concepto + '» repetido con fecha de hoy.', { accion: 'Deshacer', fn: function () { PFStore.undo(); } });
    });
    U.accion('tc-borrar', function (el) {
      var id = el.getAttribute('data-id'), m = cfg().movimientos.filter(function (x) { return x.id === id; })[0]; if (!m) return;
      U.confirmar({ titulo: 'Borrar «' + m.concepto + '»', texto: F.eur(m.importe) + ' del ' + fechaCorta(m.fecha) + '. Podrás deshacerlo con Ctrl+Z.', ok: 'Borrar', peligro: true }).then(function (ok) {
        if (!ok) return;
        PFStore.update(function (s) { s.compartido.movimientos = s.compartido.movimientos.filter(function (x) { return x.id !== id; }); }, { etiqueta: 'borrar «' + m.concepto + '»' });
        if (borrador && borrador.editId === id) borrador = nuevoBorrador(cfg());
        U.toast('Movimiento borrado.', { accion: 'Deshacer', fn: function () { PFStore.undo(); } });
      });
    });
    U.accion('tc-saldar', function (el) {
      var de = el.getAttribute('data-de'), a = el.getAttribute('data-a'), v = +el.getAttribute('data-v'), c = cfg();
      U.confirmar({ titulo: 'Saldar cuentas', texto: 'Se registra que ' + nombre(c, de) + ' paga ' + F.eur(v) + ' a ' + nombre(c, a) + ' hoy (Bizum, transferencia o efectivo). Así quedáis en paz.', ok: 'Registrar pago' }).then(function (ok) {
        if (!ok) return;
        PFStore.update(function (s) {
          s.compartido.movimientos.push({ id: S.uid('m'), tipo: 'reembolso', fecha: hoy(), concepto: 'Pago para equilibrar', categoria: '', importe: v, pagadoPor: de, para: a, notas: '', creado: new Date().toISOString() });
          s.compartido = S.compartido(s.compartido);
        }, { etiqueta: 'saldar cuentas' });
        U.toast('Pago registrado: estáis en paz.', { accion: 'Deshacer', fn: function () { PFStore.undo(); } });
      });
    });
    U.accion('tc-ver-todos', function () { setOpc({ todos: true }); });
    U.accion('tc-imp-archivo', function () {
      var inp = document.createElement('input'); inp.type = 'file'; inp.accept = '.csv,text/csv,.txt';
      inp.onchange = function () {
        var f = inp.files && inp.files[0]; if (!f) return;
        var rd = new FileReader();
        rd.onload = function () {
          var t = String(rd.result);
          // Si no es UTF-8 válido (acentos rotos), se vuelve a leer como Windows-1252
          if (t.indexOf('�') >= 0) { var r2 = new FileReader(); r2.onload = function () { analizar(String(r2.result), f.name); }; r2.readAsText(f, 'windows-1252'); }
          else analizar(t, f.name);
        };
        rd.readAsText(f, 'utf-8');
      };
      inp.click();
    });
    U.accion('tc-imp-pegar', function () {
      U.modal('<h2>Pegar datos de Tricount</h2><p>Pega el contenido del CSV (con la fila de títulos).</p><textarea class="in ancho" id="tc-pegado" rows="10" style="width:100%;font-family:monospace;font-size:12px"></textarea>' +
        '<div class="modal-acc"><button type="button" class="btn" data-res="no">Cancelar</button><button type="button" class="btn prim" data-res="ok">Analizar</button></div>',
        { foco: '#tc-pegado', valor: function (d) { return d.querySelector('#tc-pegado').value; } })
        .then(function (t) { if (t && String(t).trim()) analizar(String(t), 'texto pegado'); });
    });
    U.accion('tc-soy', function (el) { var id = el.getAttribute('data-id'); PFStore.update(function (s) { s.compartido.yo = id; }, { etiqueta: 'cambiar quién soy' }); borrador = null; });
    U.accion('tc-persona-add', function () {
      PFStore.update(function (s) { s.compartido.personas.push({ id: S.uid('u'), nombre: 'Persona ' + (s.compartido.personas.length + 1) }); s.compartido = S.compartido(s.compartido); }, { etiqueta: 'añadir persona' });
    });
    U.accion('tc-persona-borrar', function (el) {
      var id = el.getAttribute('data-id'), c = cfg();
      if (c.movimientos.some(function (m) { return m.pagadoPor === id || m.para === id || (m.reparto && +m.reparto.partes[id]); })) { U.toast('Esa persona tiene movimientos: bórralos o cámbialos antes.', { tipo: 'error' }); return; }
      PFStore.update(function (s) { s.compartido.personas = s.compartido.personas.filter(function (p) { return p.id !== id; }); s.compartido = S.compartido(s.compartido); }, { etiqueta: 'quitar persona' });
    });
    U.formulario('tc-persona', function (id, campo, v) {
      if (campo !== 'nombre' || !String(v).trim()) return;
      PFStore.update(function (s) { var p = s.compartido.personas.filter(function (x) { return x.id === id; })[0]; if (p) p.nombre = String(v).trim(); }, { etiqueta: 'renombrar persona' });
    });
    U.formulario('tc-ajustes', function (id, campo, v) {
      PFStore.update(function (s) {
        var c = s.compartido, ot = c.personas.filter(function (p) { return p.id !== c.yo; })[0];
        var actual = Math.abs(c.saldoInicial[c.yo] || 0), sentido = (c.saldoInicial[c.yo] || 0) < 0 ? 'debo' : 'meDeben';
        if (campo === 'saldoInicial') actual = Math.abs(v);
        else if (campo === 'sentido') sentido = v;
        else if (campo === 'fechaSaldoInicial') { c.fechaSaldoInicial = /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null; return; }
        else if (campo === 'umbral') { c.umbral = Math.max(0, v); return; }
        else return;
        var yo = sentido === 'debo' ? -actual : actual;
        c.saldoInicial = {}; c.personas.forEach(function (p) { c.saldoInicial[p.id] = 0; });
        c.saldoInicial[c.yo] = yo; if (ot) c.saldoInicial[ot.id] = -yo;
        if (!c.fechaSaldoInicial) c.fechaSaldoInicial = hoy();
      }, { etiqueta: 'saldo de partida' });
    });
    U.formulario('tc-filtro', function (id, campo, v) {
      if (campo === 'texto') setOpc({ texto: v, todos: false }); else if (campo === 'mes') setOpc({ mes: v, todos: false }); else if (campo === 'cat') setOpc({ cat: v, todos: false });
    });
  }
  enlazar();
  PFUI.seccion('compartido', { html: html, despues: despues });

  /** Aviso para el Resumen si el desequilibrio supera el umbral. */
  function aviso() {
    var c = cfg(); if (!c || !c.movimientos.length && !c.saldoInicial[c.yo]) return null;
    var yo = T.saldos(c)[c.yo] || 0, ot = otra(c);
    if (!c.umbral || Math.abs(yo) <= c.umbral) return null;
    return { nivel: 'aviso', seccion: 'compartido', titulo: c.personas.length === 2 ? (yo > 0 ? ot.nombre + ' te debe ' + F.eur0(yo) : 'Le debes ' + F.eur0(-yo) + ' a ' + ot.nombre) : 'Gastos compartidos desequilibrados',
             texto: 'Supera el límite de ' + F.eur0(c.umbral) + ' que marcaste. Puedes registrar el pago con «Saldar».' };
  }
  return { aviso: aviso, saldoYo: function () { var c = cfg(); return T.saldos(c)[c.yo] || 0; } };
})();
