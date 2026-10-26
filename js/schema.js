/* =============================================================================
   schema.js · Esquema de datos, valores por defecto, migraciones y datos iniciales
   -----------------------------------------------------------------------------
   Documentación completa del modelo en docs/MODELO-DATOS.md.
   Cada cambio de estructura sube VERSION y añade una función en MIGRACIONES
   que transforma el estado de la versión n a la n+1.
   ============================================================================= */
var PFSchema = (function () {
  'use strict';
  var VERSION = 3;
  var APP = 'planificador-financiero';

  var GRUPOS = [
    { id: 'ingresos', nombre: 'Ingresos' },
    { id: 'fijos', nombre: 'Gastos fijos' },
    { id: 'suscripciones', nombre: 'Suscripciones' },
    { id: 'variables', nombre: 'Gastos variables' },
    { id: 'periodicos', nombre: 'Gastos anuales / periódicos' }
  ];
  var CATEGORIAS_GASTO = ['Vivienda', 'Suministros', 'Alimentación', 'Transporte', 'Hijo', 'Mascota', 'Ocio', 'Suscripciones',
    'Salud', 'Seguros', 'Ropa', 'Educación', 'Impuestos', 'Regalos', 'Vacaciones', 'Cuidado personal', 'Otros'];
  var CATEGORIAS_INGRESO = ['Nómina', 'Extra', 'Alquiler cobrado', 'Otros ingresos'];
  var FRECUENCIAS = [
    { id: 'mensual', nombre: 'Mensual' }, { id: 'bimestral', nombre: 'Bimestral' }, { id: 'trimestral', nombre: 'Trimestral' },
    { id: 'semestral', nombre: 'Semestral' }, { id: 'anual', nombre: 'Anual' }, { id: 'puntual', nombre: 'Puntual (una vez)' }
  ];
  var CLASES = [
    { id: 'indexado', nombre: 'Fondo indexado / ETF' }, { id: 'cripto', nombre: 'Cripto' },
    { id: 'remunerada', nombre: 'Cuenta remunerada' }, { id: 'otro', nombre: 'Otro' }
  ];
  var RENT_CLASE = {
    indexado: { pes: 0.04, base: 0.07, opt: 0.10 },
    cripto: { pes: -0.10, base: 0.03, opt: 0.15 },
    remunerada: { pes: 0.015, base: 0.02, opt: 0.025 },
    otro: { pes: 0.02, base: 0.04, opt: 0.06 }
  };

  var contador = 0;
  function uid(p) { return (p || 'x') + Date.now().toString(36) + (contador++).toString(36) + Math.random().toString(36).slice(2, 6); }
  function clon(o) { return JSON.parse(JSON.stringify(o)); }
  function int(x, d) { x = Math.round(+x); return isFinite(x) ? x : (d || 0); }
  function dec(x, d) { x = +x; return isFinite(x) ? x : d; }
  function mes(x) { return (typeof x === 'string' && /^\d{4}-\d{2}$/.test(x)) ? x : null; }
  function bool(x, d) { return typeof x === 'boolean' ? x : d; }
  function str(x, d) { return typeof x === 'string' ? x : (d || ''); }
  function ajustes(o) {
    var out = {};
    if (o && typeof o === 'object') for (var k in o) {
      if (!mes(k)) continue;
      var v = o[k];
      if (typeof v === 'number') out[k] = { v: int(v) };
      else if (v && typeof v === 'object' && isFinite(v.v)) out[k] = v.f ? { v: int(v.v), f: str(v.f) } : { v: int(v.v) };
    }
    return out;
  }

  // ----------------------------------------------------------- Entidades ---
  function partida(o) {
    o = o || {};
    var tipo = o.tipo === 'ingreso' ? 'ingreso' : 'gasto';
    var p = {
      id: str(o.id) || uid('p'),
      nombre: str(o.nombre, 'Nueva partida'),
      tipo: tipo,
      grupo: tipo === 'ingreso' ? 'ingresos' : (['fijos', 'suscripciones', 'variables', 'periodicos'].indexOf(o.grupo) >= 0 ? o.grupo : 'variables'),
      categoria: str(o.categoria, tipo === 'ingreso' ? 'Otros ingresos' : 'Otros'),
      importe: int(o.importe),
      frecuencia: ['mensual', 'bimestral', 'trimestral', 'semestral', 'anual', 'puntual'].indexOf(o.frecuencia) >= 0 ? o.frecuencia : 'mensual',
      mesCargo: Math.min(12, Math.max(1, int(o.mesCargo, 1))),
      fecha: mes(o.fecha),
      inicio: mes(o.inicio),
      fin: mes(o.fin),
      activa: bool(o.activa, true),
      esencial: bool(o.esencial, tipo === 'ingreso'),
      miParte: Math.min(1, Math.max(0, dec(o.miParte, 1))),
      subida: (o.subida == null || o.subida === '') ? null : dec(o.subida, null),
      pagadoDesde: tipo === 'gasto' && o.pagadoDesde ? str(o.pagadoDesde) : null,
      ajustes: ajustes(o.ajustes),
      notas: str(o.notas)
    };
    if (o.subtipo === 'nomina' && tipo === 'ingreso') {
      p.subtipo = 'nomina';
      p.pagas = +o.pagas === 12 ? 12 : 14;
      p.mesesExtra = Array.isArray(o.mesesExtra) ? o.mesesExtra.map(function (m) { return int(m); }).filter(function (m) { return m >= 1 && m <= 12; }) : [6, 12];
      p.importeExtra = o.importeExtra == null || o.importeExtra === '' ? null : int(o.importeExtra);
      p.prorratear = bool(o.prorratear, false);
    }
    return p;
  }
  function hucha(o) {
    o = o || {};
    return {
      id: str(o.id) || uid('h'),
      nombre: str(o.nombre, 'Nueva hucha'),
      tipo: o.tipo === 'bote' ? 'bote' : 'hucha',
      aportacion: int(o.aportacion),
      aportacionOtros: int(o.aportacionOtros),
      saldoInicial: int(o.saldoInicial),
      objetivo: o.objetivo == null || o.objetivo === '' ? null : int(o.objetivo),
      fechaObjetivo: mes(o.fechaObjetivo),
      inicio: mes(o.inicio), fin: mes(o.fin),
      activa: bool(o.activa, true),
      ajustes: ajustes(o.ajustes),
      notas: str(o.notas)
    };
  }
  function inversion(o) {
    o = o || {};
    var clase = ['indexado', 'cripto', 'remunerada', 'otro'].indexOf(o.clase) >= 0 ? o.clase : 'indexado';
    var r = o.rent || {}, rd = RENT_CLASE[clase];
    return {
      id: str(o.id) || uid('i'),
      nombre: str(o.nombre, 'Nueva inversión'),
      clase: clase,
      valor: int(o.valor),
      aportado: int(o.aportado, int(o.valor)),
      aportacion: int(o.aportacion),
      crecimiento: dec(o.crecimiento, 0),
      extraordinarias: Array.isArray(o.extraordinarias) ? o.extraordinarias.filter(function (x) { return x && mes(x.mes); })
        .map(function (x) { return { id: str(x.id) || uid('e'), mes: x.mes, importe: int(x.importe) }; }) : [],
      rent: { pes: dec(r.pes, rd.pes), base: dec(r.base, rd.base), opt: dec(r.opt, rd.opt) },
      ter: dec(o.ter, 0),
      liquida: bool(o.liquida, clase === 'remunerada'),
      activa: bool(o.activa, true),
      ajustes: ajustes(o.ajustes),
      notas: str(o.notas)
    };
  }
  function deuda(o) {
    o = o || {};
    return {
      id: str(o.id) || uid('d'),
      nombre: str(o.nombre, 'Nueva deuda'),
      capital: int(o.capital),
      tin: dec(o.tin, 0),
      cuota: int(o.cuota),
      plazo: o.plazo ? int(o.plazo) : null,
      fin: mes(o.fin),
      proximaCuota: mes(o.proximaCuota),
      comision: dec(o.comision, 0.01),
      comisionUltimoAnio: dec(o.comisionUltimoAnio, 0.005),
      extraMensual: int(o.extraMensual),
      extraDesde: mes(o.extraDesde), extraHasta: mes(o.extraHasta),
      extraActiva: bool(o.extraActiva, true),
      extraPuntuales: Array.isArray(o.extraPuntuales) ? o.extraPuntuales.filter(function (x) { return x && mes(x.mes); })
        .map(function (x) { return { id: str(x.id) || uid('e'), mes: x.mes, importe: int(x.importe) }; }) : [],
      modo: o.modo === 'cuota' ? 'cuota' : 'plazo',
      inversionVinculada: o.inversionVinculada ? str(o.inversionVinculada) : null,
      notas: str(o.notas)
    };
  }
  function cuenta(o) {
    o = o || {};
    return { id: str(o.id) || uid('c'), nombre: str(o.nombre, 'Cuenta'), saldo: int(o.saldo), liquida: bool(o.liquida, true) };
  }
  function activo(o) {
    o = o || {};
    return {
      id: str(o.id) || uid('a'), nombre: str(o.nombre, 'Activo'),
      tipo: ['vivienda', 'vehiculo', 'otro'].indexOf(o.tipo) >= 0 ? o.tipo : 'otro',
      valor: int(o.valor), variacion: dec(o.variacion, 0), incluir: bool(o.incluir, false)
    };
  }
  function hipotesis(o) {
    var h = PFCalcRef().hipotesis(o || {});
    h.pctExcedente = Math.min(1, Math.max(0, dec(h.pctExcedente, 0)));
    if (['caja', 'inversion', 'deudas'].indexOf(h.destinoLiberadas) < 0) h.destinoLiberadas = 'caja';
    if (['avalancha', 'bolaNieve'].indexOf(h.ordenDeudas) < 0) h.ordenDeudas = 'avalancha';
    if (['pes', 'base', 'opt'].indexOf(h.escenarioRent) < 0) h.escenarioRent = 'base';
    h.horizonte = Math.min(40, Math.max(10, int(h.horizonte, 40)));
    return h;
  }
  function escenario(o) {
    o = o || {};
    var e = {
      id: str(o.id) || uid('s'),
      nombre: str(o.nombre, 'Mi plan'),
      creado: str(o.creado) || new Date().toISOString(),
      inicio: mes(o.inicio) || PFCalcRef().ymStr(PFCalcRef().hoyYM()),
      hipotesis: hipotesis(o.hipotesis),
      partidas: (o.partidas || []).map(partida),
      huchas: (o.huchas || []).map(hucha),
      inversiones: (o.inversiones || []).map(inversion),
      deudas: (o.deudas || []).map(deuda),
      cuentas: (o.cuentas || []).map(cuenta),
      activos: (o.activos || []).map(activo)
    };
    // Referencias rotas → se limpian
    var hs = {}; e.huchas.forEach(function (h) { hs[h.id] = 1; });
    e.partidas.forEach(function (p) { if (p.pagadoDesde && !hs[p.pagadoDesde]) p.pagadoDesde = null; });
    var is = {}; e.inversiones.forEach(function (x) { is[x.id] = 1; });
    e.deudas.forEach(function (d) { if (d.inversionVinculada && !is[d.inversionVinculada]) d.inversionVinculada = null; });
    if (e.hipotesis.destinoExcedente && !is[e.hipotesis.destinoExcedente]) e.hipotesis.destinoExcedente = null;
    if (e.hipotesis.invLiberadas && !is[e.hipotesis.invLiberadas]) e.hipotesis.invLiberadas = null;
    return e;
  }
  function escala(o) {
    if (!Array.isArray(o) || !o.length) return clon(PFCalcRef().ESCALA_AHORRO_2026);
    var out = o.map(function (t) { return { hasta: t.hasta == null || t.hasta === '' ? null : int(t.hasta), tipo: dec(t.tipo, 0) }; });
    out.sort(function (a, b) { return (a.hasta == null ? Infinity : a.hasta) - (b.hasta == null ? Infinity : b.hasta); });
    out[out.length - 1].hasta = null;
    return out;
  }

  // --------------------------------------------------------------- Estado ---
  function normalizar(s) {
    var out = {
      app: APP,
      version: VERSION,
      ajustes: {
        tema: ['claro', 'oscuro', 'sistema'].indexOf(s.ajustes && s.ajustes.tema) >= 0 ? s.ajustes.tema : 'sistema',
        escalaAhorro: escala(s.ajustes && s.ajustes.escalaAhorro),
        rentPorClase: (function () {
          var r = clon(RENT_CLASE), src = s.ajustes && s.ajustes.rentPorClase;
          if (src) for (var k in r) if (src[k]) for (var q in r[k]) r[k][q] = dec(src[k][q], r[k][q]);
          return r;
        })()
      },
      escenarios: {},
      orden: [],
      escenarioActivo: null,
      whatif: null,
      seguimiento: [],
      meta: {
        creado: str(s.meta && s.meta.creado) || new Date().toISOString(),
        modificado: str(s.meta && s.meta.modificado) || new Date().toISOString(),
        ultimaCopia: (s.meta && s.meta.ultimaCopia) || null
      }
    };
    var lista = s.escenarios || {};
    var ids = Array.isArray(s.orden) ? s.orden.filter(function (id) { return lista[id]; }) : [];
    Object.keys(lista).forEach(function (id) { if (ids.indexOf(id) < 0) ids.push(id); });
    ids.forEach(function (id) { var e = escenario(Object.assign({}, lista[id], { id: id })); out.escenarios[id] = e; out.orden.push(id); });
    if (!out.orden.length) { var e0 = escenario({}); out.escenarios[e0.id] = e0; out.orden.push(e0.id); }
    out.escenarioActivo = out.escenarios[s.escenarioActivo] ? s.escenarioActivo : out.orden[0];
    if (s.whatif && s.whatif.base && out.escenarios[s.whatif.escenarioId]) {
      out.whatif = { escenarioId: s.whatif.escenarioId, desde: str(s.whatif.desde), base: escenario(Object.assign({}, s.whatif.base, { id: s.whatif.escenarioId })) };
    }
    out.seguimiento = (Array.isArray(s.seguimiento) ? s.seguimiento : []).filter(function (r) { return r && mes(r.mes); }).map(function (r) {
      return { mes: r.mes, liquido: int(r.liquido), huchas: int(r.huchas), inversiones: int(r.inversiones), deudas: int(r.deudas), otros: int(r.otros), nota: str(r.nota) };
    }).sort(function (a, b) { return a.mes < b.mes ? -1 : 1; });
    out.compartido = compartido(s.compartido);
    return out;
  }

  // ------------------------------------------------- Gastos compartidos ---
  var CATEGORIAS_COMPARTIDO = ['Supermercado', 'Restaurantes', 'Casa', 'Suministros', 'Hijo', 'Perro', 'Ocio', 'Viajes',
    'Transporte', 'Salud', 'Regalos', 'Compras', 'Otros'];
  function fechaDia(x) { return (typeof x === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(x)) ? x : null; }
  function compartido(o) {
    o = o || {};
    var personas = (Array.isArray(o.personas) && o.personas.length >= 2 ? o.personas : [{ id: 'yo', nombre: 'Yo' }, { id: 'pareja', nombre: 'Mi pareja' }])
      .map(function (p) { return { id: str(p.id) || uid('u'), nombre: str(p.nombre, 'Persona').trim() || 'Persona' }; });
    var ids = {}; personas.forEach(function (p) { ids[p.id] = 1; });
    var yo = ids[o.yo] ? o.yo : personas[0].id;
    var movimientos = (Array.isArray(o.movimientos) ? o.movimientos : []).filter(function (m) { return m && fechaDia(m.fecha) && ids[m.pagadoPor]; }).map(function (m) {
      var tipo = ['gasto', 'reembolso', 'ingreso'].indexOf(m.tipo) >= 0 ? m.tipo : 'gasto';
      var r = m.reparto || {}, partes = {};
      if (r.partes) for (var k in r.partes) if (ids[k]) partes[k] = +r.partes[k] || 0;
      var x = { id: str(m.id) || uid('m'), tipo: tipo, fecha: m.fecha, concepto: str(m.concepto).slice(0, 120), categoria: str(m.categoria),
                importe: Math.abs(int(m.importe)), pagadoPor: m.pagadoPor, notas: str(m.notas), creado: str(m.creado) || new Date().toISOString() };
      if (tipo === 'reembolso') x.para = ids[m.para] ? m.para : personas.filter(function (p) { return p.id !== m.pagadoPor; })[0].id;
      else x.reparto = { modo: ['iguales', 'porcentaje', 'importes'].indexOf(r.modo) >= 0 ? r.modo : 'iguales', partes: partes };
      return x;
    }).sort(function (a, b) { return a.fecha < b.fecha ? -1 : a.fecha > b.fecha ? 1 : (a.creado < b.creado ? -1 : 1); });
    var saldoInicial = {};
    personas.forEach(function (p) { saldoInicial[p.id] = (o.saldoInicial && int(o.saldoInicial[p.id])) || 0; });
    return { personas: personas, yo: yo, movimientos: movimientos, saldoInicial: saldoInicial, fechaSaldoInicial: fechaDia(o.fechaSaldoInicial),
             umbral: o.umbral == null ? 5000 : Math.max(0, int(o.umbral)) };
  }

  /** Migraciones: MIGRACIONES[n] convierte un estado de versión n en versión n+1. */
  var MIGRACIONES = {
    0: function (s) {
      // Archivos sin versión: podía ser un único escenario suelto.
      if (s.partidas && !s.escenarios) {
        var e = Object.assign({ nombre: 'Importado' }, s);
        var id = e.id || uid('s');
        s = { escenarios: {}, escenarioActivo: id, meta: s.meta || {} };
        s.escenarios[id] = e;
      }
      s.version = 1;
      return s;
    },
    1: function (s) {
      // v2: desaparecen las marcas de «EJEMPLO» (los datos se conservan; normalizar() descarta el campo)
      s.version = 2;
      return s;
    },
    2: function (s) {
      // v3: nueva sección de gastos compartidos (estilo Tricount); normalizar() crea su estructura
      s.version = 3;
      return s;
    }
  };
  function migrar(raw) {
    if (!raw || typeof raw !== 'object') throw new Error('El archivo no contiene datos válidos del planificador.');
    var s = clon(raw);
    if (s.app && s.app !== APP) throw new Error('El archivo no es de este planificador.');
    var v = s.version | 0;
    if (v > VERSION) throw new Error('El archivo es de una versión más nueva del planificador (v' + v + ').');
    while (v < VERSION) {
      if (!MIGRACIONES[v]) throw new Error('No sé migrar datos de la versión ' + v + '.');
      s = MIGRACIONES[v](s);
      v = s.version | 0;
    }
    if (!s.escenarios && !s.partidas) throw new Error('El archivo no contiene escenarios.');
    return normalizar(s);
  }

  // ------------------------------------------------------- Datos iniciales ---
  /** Tus datos de partida y una propuesta inicial para lo que no me diste (edítala o bórrala). */
  function datosIniciales() {
    var hVac = uid('h'), hBote = uid('h'), iFondo = uid('i'), iCripto = uid('i');
    function g(nombre, grupo, categoria, euros, extra) {
      return partida(Object.assign({ nombre: nombre, tipo: 'gasto', grupo: grupo, categoria: categoria, importe: Math.round(euros * 100) }, extra || {}));
    }
    var esc = escenario({
      nombre: 'Mi plan',
      inicio: '2026-10',
      cuentas: [{ nombre: 'Cuenta corriente', saldo: 412300, liquida: true }],
      partidas: [
        partida({ nombre: 'Nómina', tipo: 'ingreso', subtipo: 'nomina', categoria: 'Nómina', importe: 170000, pagas: 14, mesesExtra: [7, 12], esencial: true,
                  notas: '14 pagas netas; extras en julio y diciembre.' }),
        g('Alquiler / hipoteca', 'fijos', 'Vivienda', 800, { esencial: true, miParte: 0.5 }),
        g('Luz', 'fijos', 'Suministros', 70, { esencial: true, miParte: 0.5 }),
        g('Agua', 'fijos', 'Suministros', 50, { esencial: true, miParte: 0.5, frecuencia: 'bimestral', mesCargo: 11 }),
        g('Fibra y móviles', 'fijos', 'Suministros', 55, { esencial: true, miParte: 0.5 }),
        g('Netflix', 'suscripciones', 'Suscripciones', 12.99, { esencial: false }),
        g('Spotify', 'suscripciones', 'Suscripciones', 11.99, { esencial: false }),
        g('Gimnasio', 'suscripciones', 'Salud', 34.90, { esencial: false }),
        g('Amazon Prime', 'suscripciones', 'Suscripciones', 49.90, { esencial: false, frecuencia: 'anual', mesCargo: 3 }),
        g('Supermercado', 'variables', 'Alimentación', 400, { esencial: true, miParte: 0.5 }),
        g('Transporte / gasolina', 'variables', 'Transporte', 90, { esencial: true }),
        g('Ocio y restaurantes', 'variables', 'Ocio', 120, { esencial: false }),
        g('Ropa', 'variables', 'Ropa', 40, { esencial: false }),
        g('Seguro del coche', 'periodicos', 'Seguros', 420, { esencial: true, frecuencia: 'anual', mesCargo: 3 }),
        partida({ nombre: 'Vacaciones', tipo: 'gasto', grupo: 'periodicos', categoria: 'Vacaciones', importe: 120000, frecuencia: 'anual', mesCargo: 8,
                  esencial: false, pagadoDesde: hVac, notas: 'Supuesto: se gastan en agosto. Cambia el mes si viajas en otra fecha.' }),
        g('Hijo · comedor y actividades', 'variables', 'Hijo', 120, { esencial: true, miParte: 0.5, pagadoDesde: hBote }),
        g('Hijo · ropa y otros', 'variables', 'Hijo', 60, { esencial: true, miParte: 0.5, pagadoDesde: hBote }),
        g('Hijo · vuelta al cole', 'periodicos', 'Hijo', 200, { esencial: true, miParte: 0.5, pagadoDesde: hBote, frecuencia: 'anual', mesCargo: 9 }),
        g('Perro · pienso y cuidados', 'variables', 'Mascota', 50, { esencial: true, miParte: 0.5, pagadoDesde: hBote }),
        g('Perro · veterinario y vacunas', 'periodicos', 'Mascota', 180, { esencial: true, miParte: 0.5, pagadoDesde: hBote, frecuencia: 'anual', mesCargo: 5 })
      ],
      huchas: [
        { id: hVac, nombre: 'Vacaciones', tipo: 'hucha', aportacion: 10000, saldoInicial: 0, notas: 'Separada del ocio. Supuesto: saldo actual 0 €.' },
        { id: hBote, nombre: 'Bote común (hijo y perro)', tipo: 'bote', aportacion: 15000, aportacionOtros: 15000, saldoInicial: 0,
          notas: 'Cada uno aporta 150 €/mes. Los gastos del bote se muestran al 50 % en "Mi parte".' }
      ],
      deudas: [
        { nombre: 'Préstamo personal', capital: 695700, tin: 0.0949, cuota: 20740, fin: '2030-02', proximaCuota: '2026-11',
          comision: 0.01, comisionUltimoAnio: 0.005, extraMensual: 17500, extraDesde: '2026-11', extraActiva: true, modo: 'plazo',
          notas: 'Cuota el día 3. Comisión por amortización anticipada supuesta: 1 % (0,5 % el último año), el máximo legal en crédito al consumo.' }
      ],
      inversiones: [
        { id: iFondo, nombre: 'Fondo indexado MSCI World', clase: 'indexado', valor: 40652, aportado: 39000, aportacion: 1000, ter: 0.003,
          notas: 'TER supuesto 0,30 % (desconocido): el alto del rango habitual para no sobreestimar.' },
        { id: iCripto, nombre: 'Cripto', clase: 'cripto', valor: 1112600, aportado: 1000000, aportacion: 0, ter: 0 }
      ],
      activos: [
        { nombre: 'Vehículo', tipo: 'vehiculo', valor: 900000, variacion: -0.12, incluir: false }
      ]
    });
    return esc;
  }
  function estadoInicial(conEjemplo) {
    var esc = conEjemplo === false ? escenario({ nombre: 'Mi plan', cuentas: [{ nombre: 'Cuenta corriente', saldo: 0 }] }) : datosIniciales();
    var s = { escenarios: {}, orden: [esc.id], escenarioActivo: esc.id, version: VERSION };
    s.escenarios[esc.id] = esc;
    return normalizar(s);
  }

  function PFCalcRef() { return typeof PFCalc !== 'undefined' ? PFCalc : require('./calc.js'); }

  return {
    VERSION: VERSION, APP: APP, GRUPOS: GRUPOS, CATEGORIAS_GASTO: CATEGORIAS_GASTO, CATEGORIAS_INGRESO: CATEGORIAS_INGRESO,
    FRECUENCIAS: FRECUENCIAS, CLASES: CLASES, RENT_CLASE: RENT_CLASE, CATEGORIAS_COMPARTIDO: CATEGORIAS_COMPARTIDO, compartido: compartido,
    uid: uid, clon: clon, partida: partida, hucha: hucha, inversion: inversion, deuda: deuda, cuenta: cuenta, activo: activo,
    escenario: escenario, hipotesis: hipotesis, normalizar: normalizar, migrar: migrar, MIGRACIONES: MIGRACIONES,
    datosIniciales: datosIniciales, estadoInicial: estadoInicial
  };
})();
if (typeof module !== 'undefined' && module.exports) module.exports = PFSchema;
