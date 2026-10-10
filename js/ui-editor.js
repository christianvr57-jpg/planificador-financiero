/* =============================================================================
   ui-editor.js · Panel lateral para editar una partida o una hucha
   -----------------------------------------------------------------------------
   Cada campo se guarda al cambiar (sin botón Guardar) y se puede deshacer.
   ============================================================================= */
var PFEditor = (function () {
  'use strict';
  var C = PFCalc, F = PFFmt, h = PFFmt.html, U = PFUI, S = PFSchema;
  var tipo = null, id = null, focoNombre = false, volverA = null;

  function abrir(t, i, o) {
    if (!tipo) volverA = document.activeElement;
    tipo = t; id = i; focoNombre = !!(o && o.focoNombre);
    PFApp.render();
  }
  function cerrar() {
    tipo = null; id = null;
    var d = document.getElementById('drawer');
    d.hidden = true; d.innerHTML = '';
    document.body.classList.remove('con-panel');
    if (volverA && document.body.contains(volverA)) volverA.focus();
    volverA = null;
  }
  function abierto() { return !!tipo; }
  function ent(e) {
    var lista = tipo === 'partida' ? e.partidas : e.huchas;
    return lista.filter(function (x) { return x.id === id; })[0] || null;
  }
  function render(c) {
    var d = document.getElementById('drawer');
    if (!tipo) { d.hidden = true; return; }
    var x = ent(c.esc);
    if (!x) { cerrar(); return; }
    d.hidden = false;
    document.body.classList.add('con-panel');
    U.morph(d, tipo === 'partida' ? htmlPartida(c, x) : htmlHucha(c, x));
    if (focoNombre) {
      focoNombre = false;
      var inp = d.querySelector('[data-f="nombre"]');
      if (inp) { inp.focus(); inp.select(); }
    }
  }

  // ------------------------------------------------------------- Partida ---
  function fld(etq, ctl, ayuda, clase) {
    return '<div class="fld' + (clase ? ' ' + clase : '') + '"><span class="fld-l">' + etq + '</span>' + ctl + (ayuda ? '<span class="fld-a">' + ayuda + '</span>' : '') + '</div>';
  }
  function htmlPartida(c, p) {
    var esIng = p.tipo === 'ingreso', nom = p.subtipo === 'nomina', hip = c.hip;
    var anual = C.anualPartida(p);
    var grupoNom = (S.GRUPOS.filter(function (g) { return g.id === p.grupo; })[0] || {}).nombre || '';
    var meses = []; for (var m = 1; m <= 12; m++) meses.push({ id: m, nombre: F.mesNombre(m) });
    var huchas = [{ id: '', nombre: 'Mi cuenta (sale ese mes)' }].concat(c.esc.huchas.map(function (x) { return { id: x.id, nombre: (x.tipo === 'bote' ? 'Bote: ' : 'Hucha: ') + x.nombre }; }));
    var cats = esIng ? S.CATEGORIAS_INGRESO : S.CATEGORIAS_GASTO;
    var res = '<div class="dr-res"><div><span>' + (esIng ? 'Ingreso anual' : 'Coste anual') + (p.miParte < 1 ? ' (tu parte)' : '') + '</span><b>' + F.eur(anual) + '</b></div>';
    if (!esIng && anual > 0) {
      res += '<div><span>Invertido al ' + F.pct(hip.rentDefecto, 0) + '</span><b>' + F.eur0(C.costeOportunidad(anual, 10, hip.rentDefecto)) + '</b><small>a 10 años</small></div>' +
        '<div><span>&nbsp;</span><b>' + F.eur0(C.costeOportunidad(anual, 20, hip.rentDefecto)) + '</b><small>a 20 años</small></div>';
    }
    if (c.k.ingresos > 0 && !esIng) res += '<div><span>De tus ingresos</span><b>' + F.pct(anual / c.k.ingresos, 1) + '</b></div>';
    res += '</div>';

    var cuerpo = '';
    cuerpo += fld('Nombre', '<input class="in" data-f="nombre" data-t="txt" value="' + h(p.nombre) + '" maxlength="80">');
    if (!nom) cuerpo += fld('Tipo', U.seg([{ id: 'gasto', nombre: 'Gasto' }, { id: 'ingreso', nombre: 'Ingreso' }], p.tipo, { 'data-f': 'tipo' }));
    if (!esIng) cuerpo += fld('Grupo', U.select('grupo', S.GRUPOS.slice(1), p.grupo));
    cuerpo += fld('Categoría', '<input class="in" data-f="categoria" data-t="txt" list="dl-cats" value="' + h(p.categoria) + '"><datalist id="dl-cats">' + cats.map(function (k) { return '<option value="' + h(k) + '">'; }).join('') + '</datalist>');
    if (nom) {
      cuerpo += fld('Neta mensual', U.campoEur('importe', p.importe));
      cuerpo += fld('Pagas', U.seg([{ id: 12, nombre: '12' }, { id: 14, nombre: '14' }], p.pagas, { 'data-f': 'pagas', 'data-t': 'num' }));
      if (p.pagas === 14) {
        cuerpo += fld('Meses de paga extra', '<div class="chips">' + meses.map(function (mm) {
          var on = (p.mesesExtra || []).indexOf(mm.id) >= 0;
          return '<button type="button" class="chip' + (on ? ' on' : '') + '" aria-pressed="' + on + '" data-act="ed-mesextra" data-m="' + mm.id + '">' + F.mesNombreCorto(mm.id) + '</button>';
        }).join('') + '</div>');
        cuerpo += fld('Importe de cada paga extra', '<input class="in num" data-f="importeExtra" data-t="eurNull" inputmode="decimal" placeholder="Igual que la neta" value="' + (p.importeExtra == null ? '' : F.numero(p.importeExtra / 100, 2)) + '">', 'Vacío = igual que la nómina neta.');
        cuerpo += fld('Prorratear pagas extra', U.sw(p.prorratear, { 'data-f': 'prorratear' }, 'Prorratear') , 'Reparte las extras en 12 meses (solo para planificar).', 'fila');
      }
    } else {
      cuerpo += fld('Importe' + (p.miParte < 1 ? ' total (hogar)' : ''), U.campoEur('importe', p.importe), p.miParte < 1 ? 'Tu parte: ' + F.eur(C.parte(p.importe, p.miParte)) : null);
      cuerpo += '<div class="fld-2">' + fld('Frecuencia', U.select('frecuencia', S.FRECUENCIAS, p.frecuencia));
      if (p.frecuencia === 'puntual') cuerpo += fld('Mes', '<input class="in" type="month" data-f="fecha" data-t="mes" value="' + h(p.fecha || '') + '">');
      else if (p.frecuencia !== 'mensual') cuerpo += fld('Primer cargo en', '<select class="in" data-f="mesCargo" data-t="sel" data-value="' + p.mesCargo + '">' + U.opcionesSelect(meses, p.mesCargo) + '</select>');
      cuerpo += '</div>';
      if (p.frecuencia !== 'mensual' && p.frecuencia !== 'puntual') cuerpo += '<p class="fld-a">Se carga en: ' + h(C.mesesDeCargo(p).map(F.mesNombre).join(', ')) + '.</p>';
    }
    cuerpo += '<div class="fld-2">' + fld('Desde', '<input class="in" type="month" data-f="inicio" data-t="mes" value="' + h(p.inicio || '') + '">') +
      fld('Hasta', '<input class="in" type="month" data-f="fin" data-t="mes" value="' + h(p.fin || '') + '">') + '</div>';
    if (!esIng) {
      cuerpo += fld('Se paga desde', U.select('pagadoDesde', huchas, p.pagadoDesde || ''), p.pagadoDesde ? 'No sale de tu cuenta ese mes: lo cubre la hucha, a la que aportas cada mes.' : null);
    }
    cuerpo += fld('Me corresponde', '<div class="fila-ctl">' + U.campoPct('miParte', p.miParte, 0, ' style="width:70px"') + '<span class="muted">%</span>' +
      U.seg([{ id: 1, nombre: '100 %' }, { id: 0.5, nombre: '50 %' }], p.miParte === 1 ? 1 : p.miParte === 0.5 ? 0.5 : '', { 'data-f': 'miParte', 'data-t': 'num' }, 'mini') + '</div>',
      'Para gastos compartidos: el importe es el total del hogar y aquí pones tu parte.');
    if (!esIng) cuerpo += fld('Tipo de gasto', U.seg([{ id: 'true', nombre: 'Esencial' }, { id: 'false', nombre: 'Prescindible' }], String(!!p.esencial), { 'data-f': 'esencial', 'data-t': 'bool' }),
      'Los esenciales cuentan para el colchón de emergencia; los prescindibles se quitan con «Quitar todo lo prescindible».');
    var auto = p.subida == null, tasa = C.tasaSubida(p, hip);
    cuerpo += fld('Subida anual', '<div class="fila-ctl">' + U.seg([{ id: 'auto', nombre: 'Automática' }, { id: 'pers', nombre: 'Propia' }], auto ? 'auto' : 'pers', { 'data-f': 'subidaModo' }, 'mini') +
      (auto ? '<span class="muted">' + F.pct(tasa, 1) + ' (' + (esIng ? 'subida salarial' : 'inflación') + ')</span>' : U.campoPct('subida', p.subida, 1, ' style="width:70px"') + '<span class="muted">%</span>') + '</div>',
      'Se aplica cada 12 meses desde el inicio del plan.');
    cuerpo += fld('Notas', '<textarea class="in" rows="2" data-f="notas" data-t="txt">' + h(p.notas) + '</textarea>');
    // Ajustes por celda
    var aj = Object.keys(p.ajustes || {}).sort();
    if (aj.length) {
      cuerpo += '<div class="fld"><span class="fld-l">Ajustes por mes <button type="button" class="btn-link" data-act="ed-quitar-ajustes">Quitar todos</button></span><ul class="ajustes">' + aj.map(function (ms) {
        var a = p.ajustes[ms];
        return '<li><span>' + h(F.mesLargo(C.ym(ms))) + '</span><b>' + F.eur(a.v) + '</b>' + (a.f ? '<small>' + h(a.f) + '</small>' : '') +
          '<button type="button" class="btn ico-b sm" data-act="ed-quitar-aj" data-m="' + ms + '" aria-label="Quitar ajuste de ' + h(F.mesLargo(C.ym(ms))) + '">' + U.icono('x') + '</button></li>';
      }).join('') + '</ul></div>';
    }
    var acciones = '<button type="button" class="btn sm" data-act="ed-duplicar">' + U.icono('copiar') + 'Duplicar</button>';
    if (!esIng && !p.pagadoDesde && p.frecuencia !== 'mensual') acciones += '<button type="button" class="btn sm" data-act="ed-hucha" data-tip="Crea una hucha con 1/12 del coste anual para que el gasto no rompa su mes">' + U.icono('hucha') + 'Crear hucha</button>';
    acciones += '<span class="sp"></span><button type="button" class="btn sm peligro" data-act="ed-borrar">' + U.icono('papelera') + 'Borrar</button>';
    return '<div class="dr" data-form="partida" data-id="' + h(p.id) + '" role="dialog" aria-label="Editar ' + h(p.nombre) + '">' +
      '<header class="dr-h"><div><small>' + h(esIng ? 'Ingreso' : grupoNom) + '</small><h2>' + h(p.nombre) + '</h2></div>' +
      U.sw(p.activa !== false, { 'data-f': 'activa', 'data-tip': p.activa !== false ? 'Activa: cuenta en el plan' : 'Desactivada: no cuenta' }, 'Activa') +
      '<button type="button" class="btn ico-b" data-act="ed-cerrar" aria-label="Cerrar (Esc)" data-tip="Cerrar (Esc)">' + U.icono('x') + '</button></header>' +
      res + '<div class="dr-b">' + cuerpo + '</div><footer class="dr-f">' + acciones + '</footer></div>';
  }

  // --------------------------------------------------------------- Hucha ---
  function htmlHucha(c, x) {
    var esBote = x.tipo === 'bote';
    var serie = c.sim.porHucha[x.id] || [];
    var gastos = c.esc.partidas.filter(function (p) { return p.pagadoDesde === x.id; });
    var gastoAnual = gastos.reduce(function (s, p) { return s + (p.activa === false ? 0 : C.anualPartida(p)); }, 0);
    var minimo = Infinity, mesMin = null;
    for (var t = 0; t < Math.min(24, serie.length); t++) if (serie[t] < minimo) { minimo = serie[t]; mesMin = c.sim.inicio + t; }
    var o = C.objetivoHucha(x, c.sim);
    var res = '<div class="dr-res"><div><span>Aportas al año</span><b>' + F.eur0(x.aportacion * 12) + '</b></div>' +
      '<div><span>Gastos desde ella' + (esBote ? ' (tu parte)' : '') + '</span><b>' + F.eur0(gastoAnual) + '</b><small>al año</small></div>' +
      '<div><span>Saldo mínimo (24 m)</span><b class="' + (minimo < 0 ? 'neg' : '') + '">' + (isFinite(minimo) ? F.eur0(minimo) : '—') + '</b><small>' + (mesMin != null ? F.mesCorto(mesMin) : '') + '</small></div></div>';
    if (gastoAnual > x.aportacion * 12) res += '<p class="banner warn sm">' + U.icono('alerta') + 'Aportas menos de lo que gastas desde ella: necesitarías ' + F.eur(Math.ceil(gastoAnual / 12)) + '/mes.</p>';
    if (o && o.llego === false) res += '<p class="banner warn sm">' + U.icono('alerta') + 'Al ritmo actual no llegas al objetivo: aporta ' + F.eur(o.aportacionNecesaria) + '/mes.</p>';
    var cuerpo = fld('Nombre', '<input class="in" data-f="nombre" data-t="txt" value="' + h(x.nombre) + '" maxlength="80">') +
      fld('Tipo', U.seg([{ id: 'hucha', nombre: 'Hucha propia' }, { id: 'bote', nombre: 'Bote común' }], x.tipo, { 'data-f': 'tipo' }), esBote ? 'Bote compartido: tu aportación sale de tu cuenta; la de los demás solo se ve en la vista Hogar.' : null) +
      '<div class="fld-2">' + fld('Tu aportación mensual', U.campoEur('aportacion', x.aportacion)) +
      (esBote ? fld('Aportación de los demás', U.campoEur('aportacionOtros', x.aportacionOtros)) : fld('Saldo actual', U.campoEur('saldoInicial', x.saldoInicial))) + '</div>' +
      (esBote ? fld('Saldo actual del bote', U.campoEur('saldoInicial', x.saldoInicial)) : '') +
      '<div class="fld-2">' + fld('Objetivo (opcional)', '<input class="in num" data-f="objetivo" data-t="eurNull" inputmode="decimal" value="' + (x.objetivo == null ? '' : F.numero(x.objetivo / 100, 2)) + '">') +
      fld('Para cuándo', '<input class="in" type="month" data-f="fechaObjetivo" data-t="mes" value="' + h(x.fechaObjetivo || '') + '">') + '</div>' +
      (o && o.aportacionNecesaria != null ? '<p class="fld-a">Para llegar a ' + F.eur0(x.objetivo) + ' en ' + F.mesLargo(C.ym(x.fechaObjetivo)) + ' necesitas ' + F.eur(o.aportacionNecesaria) + '/mes' + (o.llego ? ' (vas bien).' : '.') + '</p>' : '') +
      '<div class="fld-2">' + fld('Aportar desde', '<input class="in" type="month" data-f="inicio" data-t="mes" value="' + h(x.inicio || '') + '">') +
      fld('Hasta', '<input class="in" type="month" data-f="fin" data-t="mes" value="' + h(x.fin || '') + '">') + '</div>' +
      fld('Notas', '<textarea class="in" rows="2" data-f="notas" data-t="txt">' + h(x.notas) + '</textarea>');
    cuerpo += '<div class="fld"><span class="fld-l">Gastos que se pagan desde ella</span><ul class="lista-gastos">' +
      (gastos.length ? gastos.map(function (p) {
        return '<li class="' + (p.activa === false ? 'off' : '') + '"><button type="button" class="btn-link" data-act="ed-abrir-partida" data-id="' + h(p.id) + '">' + h(p.nombre) + '</button><span>' + h(PFPresupuesto.frecuenciaTxt(p)) + '</span><b>' + F.eur(C.anualPartida(p)) + '/año</b></li>';
      }).join('') : '<li class="muted">Ninguno todavía.</li>') +
      '</ul><button type="button" class="btn sm" data-act="bt-add" data-g="periodicos" data-h="' + h(x.id) + '">' + U.icono('mas') + 'Añadir gasto desde esta hucha</button></div>';
    return '<div class="dr" data-form="hucha" data-id="' + h(x.id) + '" role="dialog" aria-label="Editar ' + h(x.nombre) + '">' +
      '<header class="dr-h"><div><small>' + (esBote ? 'Bote común' : 'Hucha') + '</small><h2>' + h(x.nombre) + '</h2></div>' +
      U.sw(x.activa !== false, { 'data-f': 'activa', 'data-tip': 'Aportaciones activas' }, 'Aportaciones activas') +
      '<button type="button" class="btn ico-b" data-act="ed-cerrar" aria-label="Cerrar (Esc)">' + U.icono('x') + '</button></header>' +
      res + '<div class="dr-b">' + cuerpo + '</div><footer class="dr-f"><button type="button" class="btn sm" data-act="nav" data-sec="huchas">Ver en Huchas</button><span class="sp"></span>' +
      '<button type="button" class="btn sm peligro" data-act="ed-borrar">' + U.icono('papelera') + 'Borrar hucha</button></footer></div>';
  }

  // ----------------------------------------------------------- Acciones ---
  function nombreDe(e) { var x = ent(e); return x ? x.nombre : ''; }
  function crearHucha(o) {
    var nuevo = S.hucha(Object.assign({ nombre: 'Nueva hucha', aportacion: 0 }, o || {}));
    PFStore.update(function (s, e) { e.huchas.push(nuevo); }, { etiqueta: 'crear hucha' });
    return nuevo.id;
  }
  /** Crea una hucha con 1/12 del coste anual (redondeado al euro) y hace que el gasto se pague desde ella. */
  function crearHuchaPara(pid) {
    var p = PFStore.esc().partidas.filter(function (x) { return x.id === pid; })[0];
    if (!p) return null;
    var anual = C.anualPartida(p), aport = Math.ceil(anual / 12 / 100) * 100;
    var hid = S.uid('h');
    PFStore.update(function (s, e) {
      e.huchas.push(S.hucha({ id: hid, nombre: p.nombre, aportacion: aport, notas: 'Creada para repartir «' + p.nombre + '» en 12 meses.' }));
      var q = e.partidas.filter(function (x) { return x.id === pid; })[0];
      if (q) q.pagadoDesde = hid;
    }, { etiqueta: 'crear hucha para «' + p.nombre + '»' });
    U.toast('Hucha «' + p.nombre + '» creada: ' + F.eur(aport) + '/mes. El gasto ya no rompe su mes.');
    return hid;
  }
  function nuevaHucha() {
    var hid = crearHucha();
    abrir('hucha', hid, { focoNombre: true });
  }
  function enlazar() {
    U.accion('ed-cerrar', cerrar);
    U.accion('ed-abrir-partida', function (el) { abrir('partida', el.getAttribute('data-id')); });
    U.accion('ed-mesextra', function (el) {
      var m = +el.getAttribute('data-m');
      PFStore.update(function (s, e) {
        var p = ent(e); if (!p) return;
        var l = (p.mesesExtra || []).slice(), i = l.indexOf(m);
        if (i >= 0) l.splice(i, 1); else l.push(m);
        p.mesesExtra = l.sort(function (a, b) { return a - b; });
      }, { etiqueta: 'meses de paga extra' });
    });
    U.accion('ed-quitar-aj', function (el) {
      var ms = el.getAttribute('data-m');
      PFStore.update(function (s, e) { var p = ent(e); if (p) delete p.ajustes[ms]; }, { etiqueta: 'quitar ajuste' });
    });
    U.accion('ed-quitar-ajustes', function () {
      U.confirmar({ titulo: 'Quitar todos los ajustes', texto: 'Todos los meses volverán a la regla de la partida.', ok: 'Quitar ajustes', peligro: true }).then(function (ok) {
        if (ok) PFStore.update(function (s, e) { var p = ent(e); if (p) p.ajustes = {}; }, { etiqueta: 'quitar ajustes' });
      });
    });
    U.accion('ed-duplicar', function () {
      var nuevo;
      PFStore.update(function (s, e) {
        var p = ent(e); if (!p) return;
        nuevo = S.partida(Object.assign(S.clon(p), { id: null, nombre: p.nombre + ' (copia)' }));
        e.partidas.splice(e.partidas.indexOf(p) + 1, 0, nuevo);
      }, { etiqueta: 'duplicar partida' });
      if (nuevo) abrir('partida', nuevo.id, { focoNombre: true });
    });
    U.accion('ed-hucha', function () { var p = ent(PFStore.esc()); if (p) crearHuchaPara(p.id); });
    U.accion('ed-borrar', function () {
      var e0 = PFStore.esc(), x = ent(e0); if (!x) return;
      var esH = tipo === 'hucha';
      var vinc = esH ? e0.partidas.filter(function (p) { return p.pagadoDesde === x.id; }).length : 0;
      U.confirmar({
        titulo: 'Borrar «' + x.nombre + '»',
        texto: esH ? (vinc ? 'Los ' + vinc + ' gastos que se pagan desde ella pasarán a pagarse desde tu cuenta. ' : '') + 'Podrás deshacerlo con Ctrl+Z.' : 'Podrás deshacerlo con Ctrl+Z.',
        ok: 'Borrar', peligro: true
      }).then(function (ok) {
        if (!ok) return;
        var nombre = x.nombre, idB = x.id;
        PFStore.update(function (s, e) {
          if (esH) {
            e.huchas = e.huchas.filter(function (y) { return y.id !== idB; });
            e.partidas.forEach(function (p) { if (p.pagadoDesde === idB) p.pagadoDesde = null; });
          } else e.partidas = e.partidas.filter(function (y) { return y.id !== idB; });
        }, { etiqueta: 'borrar «' + nombre + '»' });
        cerrar();
        U.toast('«' + nombre + '» borrada.', { accion: 'Deshacer', fn: function () { PFStore.undo(); } });
      });
    });
    U.formulario('partida', function (pid, campo, v) {
      var nombre = nombreDe(PFStore.esc());
      PFStore.update(function (s, e) {
        var p = e.partidas.filter(function (x) { return x.id === pid; })[0]; if (!p) return;
        switch (campo) {
          case 'nombre': if (String(v).trim()) p.nombre = String(v).trim(); break;
          case 'tipo':
            if (p.tipo === v) return;
            p.tipo = v; p.grupo = v === 'ingreso' ? 'ingresos' : 'variables'; p.pagadoDesde = null;
            p.categoria = v === 'ingreso' ? 'Otros ingresos' : 'Otros';
            break;
          case 'mesCargo': p.mesCargo = +v; break;
          case 'pagas': p.pagas = +v; break;
          case 'pagadoDesde': p.pagadoDesde = v || null; break;
          case 'miParte': p.miParte = Math.min(1, Math.max(0, +v)); break;
          case 'esencial': p.esencial = v === true || v === 'true'; break;
          case 'subidaModo': p.subida = v === 'auto' ? null : C.tasaSubida(p, C.hipotesis(e.hipotesis)); break;
          case 'frecuencia':
            p.frecuencia = v;
            if (v === 'puntual' && !p.fecha) p.fecha = C.ymStr(Math.max(C.hoyYM(), C.ym(e.inicio)));
            break;
          case 'importe': case 'importeExtra': case 'subida': case 'inicio': case 'fin': case 'fecha': case 'categoria':
          case 'notas': case 'activa': case 'grupo': case 'prorratear':
            p[campo] = v; break;
          default: return;
        }
      }, { etiqueta: 'editar «' + nombre + '»' });
    });
    U.formulario('hucha', function (hid, campo, v) {
      var nombre = nombreDe(PFStore.esc());
      PFStore.update(function (s, e) {
        var x = e.huchas.filter(function (y) { return y.id === hid; })[0]; if (!x) return;
        if (campo === 'nombre') { if (String(v).trim()) x.nombre = String(v).trim(); return; }
        if (['tipo', 'aportacion', 'aportacionOtros', 'saldoInicial', 'objetivo', 'fechaObjetivo', 'inicio', 'fin', 'notas', 'activa'].indexOf(campo) < 0) return;
        x[campo] = v;
      }, { etiqueta: 'editar «' + nombre + '»' });
    });
  }
  enlazar();

  return { abrir: abrir, cerrar: cerrar, abierto: abierto, render: render, nuevaHucha: nuevaHucha, crearHucha: crearHucha, crearHuchaPara: crearHuchaPara };
})();
