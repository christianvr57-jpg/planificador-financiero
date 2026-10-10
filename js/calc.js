/* =============================================================================
   calc.js · Motor financiero del planificador
   -----------------------------------------------------------------------------
   Funciones puras, sin DOM. Convenciones:
     · Importes en CÉNTIMOS (enteros).          1.234,56 € → 123456
     · Tasas en decimal.                         7 %        → 0.07
     · Meses como índice absoluto (año·12 + mes−1) o texto 'AAAA-MM'.
   Se carga como script clásico en el navegador (global PFCalc) y como módulo
   CommonJS en Node para los tests (node tests/run-tests.js).
   ============================================================================= */
var PFCalc = (function () {
  'use strict';

  // ---------------------------------------------------------------- Meses ----
  function ym(s) {
    if (s == null || s === '') return null;
    if (typeof s === 'number') return s;
    var p = String(s).split('-');
    return (+p[0]) * 12 + (+p[1] - 1);
  }
  function ymStr(a) {
    var y = Math.floor(a / 12), m = a - y * 12 + 1;
    return y + '-' + (m < 10 ? '0' : '') + m;
  }
  function anioDe(a) { return Math.floor(a / 12); }
  function mesDe(a) { return a - Math.floor(a / 12) * 12 + 1; } // 1..12
  function hoyYM(d) { d = d || new Date(); return d.getFullYear() * 12 + d.getMonth(); }

  // ---------------------------------------------------------------- Dinero ---
  function redondear(x) { return x < 0 ? -Math.round(-x) : Math.round(x); }
  function cents(euros) { return redondear(euros * 100); }
  function num(x, def) { x = +x; return isFinite(x) ? x : (def || 0); }
  /** Parte que me corresponde de un importe (pct en decimal: 0.5 = 50 %). */
  function parte(c, pct) { return (pct == null || pct === 1) ? c : redondear(c * pct); }
  /** Reparte un total entero en n trozos que suman exactamente el total. */
  function repartir(total, n, idx) {
    var base = Math.floor(total / n), resto = total - base * n;
    return base + (idx < resto ? 1 : 0);
  }
  function suma(arr, desde, hasta) {
    var s = 0; desde = desde || 0; hasta = hasta == null ? arr.length : Math.min(hasta, arr.length);
    for (var i = desde; i < hasta; i++) s += arr[i] || 0;
    return s;
  }

  // ----------------------------------------------------------- Frecuencias ---
  var PERIODO = { mensual: 1, bimestral: 2, trimestral: 3, semestral: 6, anual: 12, puntual: 0 };
  var VECES_ANIO = { mensual: 12, bimestral: 6, trimestral: 4, semestral: 2, anual: 1, puntual: 0 };

  function enRango(p, a) {
    if (p.inicio && a < ym(p.inicio)) return false;
    if (p.fin && a > ym(p.fin)) return false;
    return true;
  }
  /** ¿Se carga la partida en el mes a? Frecuencias ancladas a p.mesCargo. */
  function ocurre(p, a) {
    var per = PERIODO[p.frecuencia];
    if (per == null) per = 1;
    if (per === 0) return a === ym(p.fecha || p.inicio);
    if (!enRango(p, a)) return false;
    if (per === 1) return true;
    var ancla = p.mesCargo || 1;
    return ((mesDe(a) - ancla) % per + per) % per === 0;
  }
  /** Meses (1..12) en que se carga una partida, para mostrarlo en la interfaz. */
  function mesesDeCargo(p) {
    var per = PERIODO[p.frecuencia];
    if (per == null || per === 1) return [1,2,3,4,5,6,7,8,9,10,11,12];
    if (per === 0) return p.fecha ? [mesDe(ym(p.fecha))] : [];
    var out = [], ancla = p.mesCargo || 1;
    for (var m = 1; m <= 12; m++) if (((m - ancla) % per + per) % per === 0) out.push(m);
    return out;
  }

  /** Subida anual efectiva de una partida: la suya o la hipótesis general. */
  function tasaSubida(p, hip) {
    if (p.subida != null && p.subida !== '' && isFinite(p.subida)) return +p.subida;
    return p.tipo === 'ingreso' ? num(hip.subidaSalarial) : num(hip.inflacion);
  }

  /**
   * Importe bruto (100 %, "Hogar") de una partida en el mes a, sin aplicar "mi parte".
   * Las subidas se aplican cada 12 meses desde el inicio del plan, así los
   * primeros 12 meses muestran los importes actuales.
   */
  function importeMes(p, a, ctx) {
    if (p.ajustes) {
      var aj = p.ajustes[ymStr(a)];
      if (aj != null) return typeof aj === 'object' ? (aj.v | 0) : (aj | 0);
    }
    var k = Math.max(0, Math.floor((a - ctx.inicio) / 12));
    var f = k ? Math.pow(1 + tasaSubida(p, ctx.hip), k) : 1;
    if (p.subtipo === 'nomina') {
      if (!enRango(p, a)) return 0;
      var neta = p.importe | 0;
      var extra = p.importeExtra != null ? (p.importeExtra | 0) : neta;
      var meses = p.mesesExtra || [6, 12];
      var nEx = (+p.pagas === 14) ? meses.length : 0;
      if (p.prorratear) return redondear(repartir(neta * 12 + extra * nEx, 12, mesDe(a) - 1) * f);
      var v = neta + (nEx && meses.indexOf(mesDe(a)) >= 0 ? extra : 0);
      return redondear(v * f);
    }
    if (!ocurre(p, a)) return 0;
    return redondear((p.importe | 0) * f);
  }
  /** Coste (o ingreso) anual "regla" de una partida, mi parte, sin subidas. */
  function anualPartida(p) {
    var bruto;
    if (p.subtipo === 'nomina') {
      var extra = p.importeExtra != null ? p.importeExtra : p.importe;
      bruto = p.importe * 12 + (+p.pagas === 14 ? extra * (p.mesesExtra || [6, 12]).length : 0);
    } else {
      bruto = (p.importe | 0) * (VECES_ANIO[p.frecuencia] != null ? VECES_ANIO[p.frecuencia] : 12);
      if (p.frecuencia === 'puntual') bruto = p.importe | 0;
    }
    return parte(bruto, p.miParte);
  }

  // ------------------------------------------------------------ Impuestos ----
  /** Escala del ahorro 2026 (tramos en céntimos). */
  var ESCALA_AHORRO_2026 = [
    { hasta: 600000, tipo: 0.19 },
    { hasta: 5000000, tipo: 0.21 },
    { hasta: 20000000, tipo: 0.23 },
    { hasta: 30000000, tipo: 0.27 },
    { hasta: null, tipo: 0.30 }
  ];
  function impuestoAhorro(ganancia, escala) {
    escala = escala && escala.length ? escala : ESCALA_AHORRO_2026;
    if (!(ganancia > 0)) return 0;
    var imp = 0, prev = 0;
    for (var k = 0; k < escala.length; k++) {
      var top = escala[k].hasta == null ? Infinity : escala[k].hasta;
      if (ganancia > prev) imp += (Math.min(ganancia, top) - prev) * escala[k].tipo;
      prev = top;
      if (ganancia <= top) break;
    }
    return redondear(imp);
  }

  // ------------------------------------------------------------ Inversión ----
  /** Rentabilidad anual efectiva menos TER, pasada a mensual: (1+r)^(1/12) − 1. */
  function tasaMensual(rAnual, ter) {
    var r = num(rAnual) - num(ter);
    if (r <= -0.99) r = -0.99;
    return Math.pow(1 + r, 1 / 12) - 1;
  }
  function rentDe(inv, clave) {
    var r = inv.rent || {};
    var v = r[clave || 'base'];
    return v == null ? num(r.base, 0.05) : +v;
  }
  /**
   * Proyección de una inversión mes a mes con aportaciones a final de mes.
   * o: { valor, aportado, aportacion, crecimiento, extraordinarias:[{mes,importe}],
   *      inicio (abs), rAnual, ter, anios, inflacion, escala }
   * Devuelve filas anuales (año 0 = hoy) y serie mensual de valor.
   */
  function proyectarInversion(o) {
    var rm = tasaMensual(o.rAnual, o.ter);
    var v = o.valor | 0, ap = o.aportado | 0, rend = 0;
    var inf = num(o.inflacion), meses = Math.round(num(o.anios, 10) * 12);
    var inicio = o.inicio == null ? 0 : ym(o.inicio);
    var ex = {};
    (o.extraordinarias || []).forEach(function (x) { var m = ym(x.mes); if (m != null) ex[m] = (ex[m] || 0) + (x.importe | 0); });
    function fila(anio) {
      var g = v - ap, imp = impuestoAhorro(g, o.escala);
      return { anio: anio, aportado: ap, valor: v, rendimientos: g, real: redondear(v / Math.pow(1 + inf, anio)),
               impuesto: imp, neto: v - imp, netoReal: redondear((v - imp) / Math.pow(1 + inf, anio)) };
    }
    var filas = [fila(0)], serie = [v];
    for (var t = 0; t < meses; t++) {
      var k = Math.floor(t / 12);
      var a = redondear(num(o.aportacion) * Math.pow(1 + num(o.crecimiento), k)) + (ex[inicio + t] || 0);
      var antes = v;
      v = redondear(v * (1 + rm)) + a;
      rend += v - antes - a;
      ap += a;
      serie.push(v);
      if ((t + 1) % 12 === 0) filas.push(fila((t + 1) / 12));
    }
    return { filas: filas, serie: serie, final: filas[filas.length - 1] };
  }
  /** Valor futuro de aportar `mensual` céntimos/mes durante `anios` a rAnual (sin TER). */
  function valorFuturoMensual(mensual, anios, rAnual) {
    return proyectarInversion({ aportacion: mensual, anios: anios, rAnual: rAnual }).final.valor;
  }
  /** Coste de oportunidad: lo que valdría el coste anual invertido mes a mes. */
  function costeOportunidad(anual, anios, rAnual) {
    return valorFuturoMensual(redondear(anual / 12), anios, rAnual);
  }

  // ---------------------------------------------------------------- Deudas ---
  /** Cuota francesa. tin nominal anual → i = tin/12. */
  function cuotaFrancesa(C, tin, n) {
    if (n <= 0) return C;
    var i = num(tin) / 12;
    if (i === 0) return Math.ceil(C / n);
    return redondear(C * i / (1 - Math.pow(1 + i, -n)));
  }
  /** Número de cuotas (fraccionario) para amortizar C con una cuota dada. */
  function nper(C, tin, cuota) {
    if (C <= 0) return 0;
    var i = num(tin) / 12;
    if (cuota <= 0) return Infinity;
    if (i === 0) return C / cuota;
    var x = 1 - C * i / cuota;
    if (x <= 0) return Infinity;
    return -Math.log(x) / Math.log(1 + i);
  }
  /** Cuotas enteras: la última se ajusta. Tolerancia para cuotas redondeadas. */
  function plazoDe(C, tin, cuota) {
    var n = nper(C, tin, cuota);
    return isFinite(n) ? Math.max(1, Math.ceil(n - 0.02)) : Infinity;
  }
  function tae(tin) { return Math.pow(1 + num(tin) / 12, 12) - 1; }

  function iniciarDeuda(d, inicioPlan) {
    var tin = num(d.tin), C = d.capital | 0;
    var desde = d.proximaCuota ? ym(d.proximaCuota) : inicioPlan;
    var cuota = d.cuota | 0, n;
    if (cuota > 0) n = plazoDe(C, tin, cuota);
    else {
      n = d.plazo ? +d.plazo : (d.fin ? ym(d.fin) - desde + 1 : 12);
      n = Math.max(1, n);
      cuota = cuotaFrancesa(C, tin, n);
    }
    return { id: d.id, capital: C, tin: tin, i: tin / 12, cuota: cuota, cuotaInicial: cuota, n: n, n0: n,
             desde: desde, modo: d.modo === 'cuota' ? 'cuota' : 'plazo',
             intereses: 0, comisiones: 0, pagado: 0, fin: C > 0 ? null : (desde - 1), liberada: 0 };
  }
  /** Paga la cuota del mes. Devuelve null si no toca. */
  function pagarCuota(st, a) {
    if (st.capital <= 0 || a < st.desde) return null;
    var it = redondear(st.capital * st.i);
    var pago = st.n <= 1 ? st.capital + it : Math.min(st.cuota, st.capital + it);
    var amort = pago - it;
    st.capital -= amort;
    st.n = Math.max(0, st.n - 1);
    st.intereses += it; st.pagado += pago;
    if (st.capital <= 0) st.capital = 0;
    return { cuota: pago, interes: it, amort: amort };
  }
  /**
   * Amortización anticipada por un desembolso TOTAL (incluye la comisión):
   * capital amortizado = total / (1 + comisión). Comisión: d.comision si quedan
   * más de 12 cuotas; d.comisionUltimoAnio si quedan 12 o menos (Ley 16/2011).
   */
  function aplicarExtra(d, st, total) {
    if (!(total > 0) || st.capital <= 0) return { capital: 0, comision: 0 };
    var fee = st.n > 12 ? num(d.comision) : num(d.comisionUltimoAnio != null ? d.comisionUltimoAnio : d.comision);
    var cap = Math.min(st.capital, redondear(total / (1 + fee)));
    var com = redondear(cap * fee);
    st.capital -= cap; st.comisiones += com; st.pagado += cap + com;
    if (st.capital <= 0) { st.capital = 0; st.n = 0; }
    else if (st.modo === 'cuota') st.cuota = cuotaFrancesa(st.capital, st.tin, Math.max(1, st.n));
    else st.n = Math.min(st.n, plazoDe(st.capital, st.tin, st.cuota));
    return { capital: cap, comision: com };
  }
  function extraMensualActivo(d, a, desde) {
    if (d.extraActiva === false || !(d.extraMensual > 0)) return 0;
    var ini = d.extraDesde ? ym(d.extraDesde) : desde;
    var fin = d.extraHasta ? ym(d.extraHasta) : Infinity;
    return (a >= ini && a <= fin) ? (d.extraMensual | 0) : 0;
  }
  function extraProgramado(d, a, desde) {
    var e = extraMensualActivo(d, a, desde);
    (d.extraPuntuales || []).forEach(function (x) { if (ym(x.mes) === a) e += x.importe | 0; });
    return e;
  }
  function ordenarPendientes(lista, sts, orden) {
    var idx = [];
    for (var k = 0; k < lista.length; k++) if (sts[k].capital > 0) idx.push(k);
    idx.sort(function (x, y) {
      var A = sts[x], B = sts[y];
      if (orden === 'bolaNieve') return (A.capital - B.capital) || (B.tin - A.tin);
      return (B.tin - A.tin) || (A.capital - B.capital);
    });
    return idx;
  }
  /**
   * Un mes de todas las deudas: cuotas, extras propios y (opcional) cascada de
   * cuotas liberadas hacia la siguiente deuda por orden avalancha / bola de nieve.
   */
  function mesDeudas(lista, sts, a, cascada, orden, porDeuda) {
    var r = { cuotas: 0, extras: 0, cascada: 0, intereses: 0, capital: 0, comisiones: 0, libre: 0 };
    var F = 0, k, d, st;
    for (k = 0; k < lista.length; k++) if (sts[k].fin != null && sts[k].fin < a) F += sts[k].liberada;
    for (k = 0; k < lista.length; k++) {
      d = lista[k]; st = sts[k];
      var pc = pagarCuota(st, a), ex = 0, e = null;
      if (pc) { r.cuotas += pc.cuota; r.intereses += pc.interes; r.capital += pc.amort; }
      if (st.capital > 0 && a >= st.desde) {
        ex = extraProgramado(d, a, st.desde);
        if (ex) { e = aplicarExtra(d, st, ex); r.extras += e.capital + e.comision; r.capital += e.capital; r.comisiones += e.comision; }
      }
      if (porDeuda) porDeuda[k] = { cuota: pc ? pc.cuota : 0, extra: e ? e.capital + e.comision : 0, cascada: 0 };
      if (st.capital <= 0 && st.fin == null) {
        st.fin = a;
        st.liberada = st.cuota + extraMensualActivo(d, a, st.desde);
      }
    }
    if (cascada && F > 0) {
      var objetivos = ordenarPendientes(lista, sts, orden);
      for (var j = 0; j < objetivos.length && F > 0; j++) {
        k = objetivos[j]; d = lista[k]; st = sts[k];
        if (a < st.desde) continue;
        var e2 = aplicarExtra(d, st, F), usado = e2.capital + e2.comision;
        F -= usado; r.cascada += usado; r.capital += e2.capital; r.comisiones += e2.comision;
        if (porDeuda) porDeuda[k].cascada += usado;
        if (st.capital <= 0 && st.fin == null) { st.fin = a; st.liberada = st.cuota + extraMensualActivo(d, a, st.desde); }
      }
    }
    r.libre = F;
    return r;
  }
  /**
   * Cuadro de amortización (sistema francés) con las amortizaciones extra de la deuda.
   * opts: { sinExtras, extraMensual (céntimos adicionales), inicio (abs), maxMeses }
   */
  function cuadroAmortizacion(d, opts) {
    opts = opts || {};
    var dd = d;
    if (opts.sinExtras) dd = Object.assign({}, d, { extraMensual: 0, extraPuntuales: [] });
    if (opts.extraMensual) dd = Object.assign({}, dd, { extraMensual: (dd.extraActiva === false ? 0 : (dd.extraMensual | 0)) + opts.extraMensual, extraActiva: true });
    if (opts.modo) dd = Object.assign({}, dd, { modo: opts.modo });
    var st = iniciarDeuda(dd, opts.inicio != null ? ym(opts.inicio) : hoyYM());
    var filas = [], a = st.desde, guard = 0, maxM = opts.maxMeses || 1200;
    while (st.capital > 0 && guard++ < maxM) {
      var pc = pagarCuota(st, a);
      var ex = st.capital > 0 ? extraProgramado(dd, a, st.desde) : 0;
      var e = ex ? aplicarExtra(dd, st, ex) : { capital: 0, comision: 0 };
      filas.push({ n: filas.length + 1, mes: a, cuota: pc.cuota, interes: pc.interes, amort: pc.amort,
                   extra: e.capital, comision: e.comision, pendiente: st.capital, cuotaVigente: st.cuota });
      a++;
    }
    return { filas: filas, intereses: st.intereses, comisiones: st.comisiones, pagado: st.pagado,
             meses: filas.length, fin: filas.length ? filas[filas.length - 1].mes : null,
             cuota: st.cuotaInicial, plazoInicial: st.n0, desde: st.desde, completo: st.capital <= 0 };
  }
  /** Simula varias deudas con o sin cascada (avalancha / bola de nieve). */
  function estrategiaDeudas(deudas, opts) {
    opts = opts || {};
    var inicio = opts.inicio != null ? ym(opts.inicio) : hoyYM();
    var sts = deudas.map(function (d) { return iniciarDeuda(d, inicio); });
    var a0 = Math.min.apply(null, sts.map(function (s) { return s.desde; }).concat([inicio]));
    var total = { intereses: 0, comisiones: 0, pagado: 0 }, serie = [], a = a0, guard = 0;
    function pendiente() { return sts.reduce(function (s, x) { return s + x.capital; }, 0); }
    while (pendiente() > 0 && guard++ < 1200) {
      var r = mesDeudas(deudas, sts, a, !!opts.orden, opts.orden);
      total.intereses += r.intereses; total.comisiones += r.comisiones;
      serie.push({ mes: a, pendiente: pendiente() });
      a++;
    }
    var fines = {};
    sts.forEach(function (s, k) { fines[deudas[k].id] = s.fin; });
    var ordenFin = deudas.map(function (d, k) { return { id: d.id, nombre: d.nombre, fin: sts[k].fin }; })
      .sort(function (x, y) { return (x.fin || 0) - (y.fin || 0); });
    return { intereses: total.intereses, comisiones: total.comisiones, fin: a - 1, fines: fines, ordenFin: ordenFin, serie: serie };
  }
  /**
   * ¿Amortizar o invertir? Mismo desembolso mensual en ambos caminos hasta el
   * fin original del préstamo. A: el importe amortiza (y al acabar, cuota+importe
   * se invierten). B: el importe se invierte y el préstamo sigue su curso.
   * Se compara el valor neto de impuestos de lo invertido al final.
   */
  function amortizarVsInvertir(d, importe, rAnual, ter, escala, opts) {
    opts = opts || {};
    var base = Object.assign({}, d, { extraMensual: 0, extraPuntuales: [], extraActiva: false });
    function correr(r) {
      var rm = tasaMensual(r, ter), inicio = opts.inicio != null ? ym(opts.inicio) : hoyYM();
      var stA = iniciarDeuda(base, inicio), stB = iniciarDeuda(base, inicio);
      var vA = 0, apA = 0, vB = 0, apB = 0, a = stB.desde, H = 0, finA = null, comA = 0;
      while (stB.capital > 0 && H < 1200) {
        var pb = pagarCuota(stB, a);
        var salida = pb.cuota + importe;
        vB = redondear(vB * (1 + rm)) + importe; apB += importe;
        var gastoA = 0;
        if (stA.capital > 0) {
          var pa = pagarCuota(stA, a); gastoA += pa.cuota;
          if (stA.capital > 0) { var e = aplicarExtra(base, stA, importe); gastoA += e.capital + e.comision; comA += e.comision; }
          if (stA.capital <= 0) finA = a;
        }
        var sobra = Math.max(0, salida - gastoA);
        vA = redondear(vA * (1 + rm)) + sobra; apA += sobra;
        a++; H++;
      }
      var netA = vA - impuestoAhorro(vA - apA, escala), netB = vB - impuestoAhorro(vB - apB, escala);
      return { netA: netA, netB: netB, vA: vA, vB: vB, apA: apA, apB: apB, intA: stA.intereses, intB: stB.intereses,
               comA: comA, finA: finA, finB: a - 1, meses: H };
    }
    var res = correr(rAnual);
    // Rentabilidad de equilibrio: aquella con la que invertir iguala a amortizar.
    var lo = -0.5, hi = 1.0, fLo = correr(lo), fHi = correr(hi), eq = null;
    if ((fLo.netB - fLo.netA) <= 0 && (fHi.netB - fHi.netA) >= 0) {
      for (var it = 0; it < 50; it++) {
        var mid = (lo + hi) / 2, f = correr(mid);
        if (f.netB - f.netA > 0) hi = mid; else lo = mid;
      }
      eq = (lo + hi) / 2 + num(ter);
    }
    res.equilibrio = eq;
    res.interesesAhorrados = res.intB - res.intA;
    res.ventajaAmortizar = res.netA - res.netB;
    return res;
  }
  /**
   * Préstamo para invertir: evolución de inversión vinculada − deuda pendiente y
   * rentabilidad mínima para que la ganancia neta cubra intereses y comisiones.
   */
  function prestamoInversion(d, inv, rAnual, ter, escala, opts) {
    opts = opts || {};
    var inicio = opts.inicio != null ? ym(opts.inicio) : hoyYM();
    function correr(r, guardar) {
      var st = iniciarDeuda(d, inicio), rm = tasaMensual(r, ter);
      var v = inv.valor | 0, ap = inv.aportado | 0, a = Math.min(inicio, st.desde), filas = [], guard = 0;
      while (st.capital > 0 && guard++ < 1200) {
        var pc = pagarCuota(st, a);
        var ex = st.capital > 0 ? extraProgramado(d, a, st.desde) : 0;
        if (ex) aplicarExtra(d, st, ex);
        var apM = inv.activa === false ? 0 : (inv.aportacion | 0);
        v = redondear(v * (1 + rm)) + apM; ap += apM;
        if (guardar) filas.push({ mes: a, valor: v, deuda: st.capital, neto: v - st.capital });
        a++;
        if (!pc && a > st.desde + 1200) break;
      }
      var ganancia = v - ap, neta = ganancia - impuestoAhorro(ganancia, escala);
      return { filas: filas, valor: v, aportado: ap, gananciaNeta: neta, coste: st.intereses + st.comisiones, fin: a - 1 };
    }
    var res = correr(rAnual, true);
    var lo = -0.5, hi = 1.0, minimo = null;
    if (correr(lo).gananciaNeta - correr(lo).coste < 0 && correr(hi).gananciaNeta - correr(hi).coste > 0) {
      for (var it = 0; it < 50; it++) {
        var mid = (lo + hi) / 2, f = correr(mid);
        if (f.gananciaNeta - f.coste > 0) hi = mid; else lo = mid;
      }
      minimo = (lo + hi) / 2 + num(ter);
    }
    res.rentMinima = minimo;
    res.resultado = res.gananciaNeta - res.coste;
    return res;
  }

  // ------------------------------------------------------------ Simulación ---
  var HIP_DEFECTO = {
    inflacion: 0.02, subidaSalarial: 0.015, pctExcedente: 0, destinoExcedente: null,
    destinoLiberadas: 'caja', invLiberadas: null, ordenDeudas: 'avalancha',
    escenarioRent: 'base', horizonte: 40, rentDefecto: 0.07
  };
  function hipotesis(h) {
    var o = {};
    for (var k in HIP_DEFECTO) o[k] = (h && h[k] != null) ? h[k] : HIP_DEFECTO[k];
    return o;
  }
  function ajusteDe(ent, a) {
    if (!ent.ajustes) return null;
    var aj = ent.ajustes[ymStr(a)];
    if (aj == null) return null;
    return typeof aj === 'object' ? (aj.v | 0) : (aj | 0);
  }
  function crearArr(n, v) { var a = new Array(n); for (var i = 0; i < n; i++) a[i] = v; return a; }

  /**
   * Simula el plan mes a mes desde esc.inicio.
   * opts: { meses, detalleDesde ('AAAA-MM' o abs), detalleMeses (12), escenarioRent }
   * Devuelve series mensuales (m.*), saldos por entidad, hitos y, si se pide,
   * el detalle por fila de una ventana de meses (para la tabla de presupuesto).
   */
  function simular(esc, opts) {
    opts = opts || {};
    var hip = hipotesis(esc.hipotesis);
    var inicio = ym(esc.inicio);
    var claveRent = opts.escenarioRent || hip.escenarioRent || 'base';
    var detDesde = opts.detalleDesde == null ? null : ym(opts.detalleDesde);
    var detN = opts.detalleMeses || 12;
    var meses = opts.meses || 12 * (hip.horizonte || 40);
    if (detDesde != null) meses = Math.max(meses, detDesde + detN - inicio);
    meses = Math.max(meses, 12);
    var ctx = { inicio: inicio, hip: hip };

    var partidas = esc.partidas || [];
    var listaH = esc.huchas || [], listaI = esc.inversiones || [], listaD = esc.deudas || [];
    var cuentas = esc.cuentas || [], activos = esc.activos || [];
    var hIdx = {};
    var sh = listaH.map(function (h) {
      var otros = h.tipo === 'bote' ? (h.aportacionOtros | 0) : 0;
      var cuota = (h.aportacion | 0) + otros;
      var frac = cuota > 0 ? (h.aportacion | 0) / cuota : 1;
      var s = { h: h, mi: redondear((h.saldoInicial | 0) * frac), hogar: h.saldoInicial | 0, alcanzado: null };
      hIdx[h.id] = s;
      return s;
    });
    var si = listaI.map(function (inv) {
      return { inv: inv, valor: inv.valor | 0, aportado: inv.aportado | 0, rm: tasaMensual(rentDe(inv, claveRent), inv.ter) };
    });
    var iIdx = {}; si.forEach(function (s) { iIdx[s.inv.id] = s; });
    var sd = listaD.map(function (d) { return iniciarDeuda(d, inicio); });
    var sa = activos.map(function (x) { return { x: x, valor: x.valor | 0, rm: Math.pow(1 + num(x.variacion), 1 / 12) - 1 }; });
    var caja = 0;
    cuentas.forEach(function (c) { caja += c.saldo | 0; });

    function patrimonioActual() {
      var p = caja;
      sh.forEach(function (s) { p += s.mi; });
      si.forEach(function (s) { p += s.valor; });
      sd.forEach(function (s) { p -= s.capital; });
      sa.forEach(function (s) { if (s.x.incluir) p += s.valor; });
      return p;
    }
    var res = {
      inicio: inicio, meses: meses, hip: hip,
      caja0: caja, pat0: patrimonioActual(),
      deuda0: sd.reduce(function (s, x) { return s + x.capital; }, 0),
      inv0: si.reduce(function (s, x) { return s + x.valor; }, 0),
      huchas0: sh.reduce(function (s, x) { return s + x.mi; }, 0),
      m: {}, porHucha: {}, porHuchaHogar: {}, porInversion: {}, porDeuda: {}, hitos: { deudas: {}, huchas: {} }
    };
    var series = ['ingresos', 'gastos', 'gastosHucha', 'esenciales', 'huchas', 'cuotas', 'extras', 'cascada',
                  'inversion', 'invExcedente', 'invLiberada', 'intereses', 'capital', 'comisiones', 'ahorro',
                  'caja', 'huchasSaldo', 'invValor', 'invAportado', 'deuda', 'activos', 'activosTodos', 'patrimonio', 'patrimonioReal'];
    series.forEach(function (k) { res.m[k] = crearArr(meses, 0); });
    listaH.forEach(function (h) { res.porHucha[h.id] = crearArr(meses, 0); res.porHuchaHogar[h.id] = crearArr(meses, 0); });
    listaI.forEach(function (x) { res.porInversion[x.id] = crearArr(meses, 0); });
    listaD.forEach(function (x) { res.porDeuda[x.id] = crearArr(meses, 0); });

    // Detalle por filas para la tabla
    var det = null;
    if (detDesde != null) {
      det = { desde: detDesde, n: detN, filas: {}, cajaFin: crearArr(detN, null), cajaInicio: null };
      var nueva = function (key) { det.filas[key] = { mi: crearArr(detN, null), hogar: crearArr(detN, null) }; };
      partidas.forEach(function (p) { nueva('p:' + p.id); });
      listaH.forEach(function (h) { nueva('h:' + h.id); nueva('hs:' + h.id); });
      listaD.forEach(function (d) { nueva('d:' + d.id); nueva('dx:' + d.id); });
      listaI.forEach(function (x) { nueva('i:' + x.id); });
      nueva('dl'); nueva('ie'); nueva('il');
      if (detDesde <= inicio) det.cajaInicio = caja;
    }
    function put(key, j, mi, hogar) {
      var f = det.filas[key]; if (!f) return;
      f.mi[j] = (f.mi[j] || 0) + mi; f.hogar[j] = (f.hogar[j] || 0) + (hogar == null ? mi : hogar);
    }
    var cascada = hip.destinoLiberadas === 'deudas';
    var invLib = hip.invLiberadas && iIdx[hip.invLiberadas] ? iIdx[hip.invLiberadas] : null;
    var invExc = hip.destinoExcedente && iIdx[hip.destinoExcedente] ? iIdx[hip.destinoExcedente] : null;
    var infM = num(hip.inflacion);
    var porDeudaMes = new Array(listaD.length);

    for (var t = 0; t < meses; t++) {
      var a = inicio + t, k = Math.floor(t / 12);
      var j = det && a >= det.desde && a < det.desde + det.n ? a - det.desde : -1;
      if (j >= 0) for (var key in det.filas) { if (det.filas[key].mi[j] == null) { det.filas[key].mi[j] = 0; det.filas[key].hogar[j] = 0; } }
      if (det && det.cajaInicio == null && a === det.desde) det.cajaInicio = caja;
      var ing = 0, gas = 0, gasH = 0, esen = 0, hu = 0, inv = 0, invE = 0, invL = 0, p, x;

      // Partidas
      for (var q = 0; q < partidas.length; q++) {
        p = partidas[q];
        if (p.activa === false) continue;
        var bruto = importeMes(p, a, ctx);
        if (!bruto) continue;
        var mio = parte(bruto, p.miParte);
        if (p.tipo === 'ingreso') ing += mio;
        else {
          var hp = p.pagadoDesde ? hIdx[p.pagadoDesde] : null;
          if (hp) { hp.mi -= mio; hp.hogar -= bruto; gasH += mio; }
          else gas += mio;
          if (p.esencial) esen += mio;
        }
        if (j >= 0) put('p:' + p.id, j, mio, bruto);
      }
      // Huchas
      for (q = 0; q < sh.length; q++) {
        var s = sh[q], h = s.h;
        var ap = 0, apO = 0;
        if (h.activa !== false && enRango(h, a)) {
          var aj = ajusteDe(h, a);
          ap = aj != null ? aj : (h.aportacion | 0);
          apO = h.tipo === 'bote' ? (h.aportacionOtros | 0) : 0;
        }
        s.mi += ap; s.hogar += ap + apO; hu += ap;
        res.porHucha[h.id][t] = s.mi; res.porHuchaHogar[h.id][t] = s.hogar;
        if (h.objetivo > 0 && s.alcanzado == null && s.mi >= h.objetivo) { s.alcanzado = a; res.hitos.huchas[h.id] = a; }
        if (j >= 0) { put('h:' + h.id, j, ap, ap + apO); det.filas['hs:' + h.id].mi[j] = s.mi; det.filas['hs:' + h.id].hogar[j] = s.hogar; }
      }
      // Deudas
      var rd = mesDeudas(listaD, sd, a, cascada, hip.ordenDeudas, porDeudaMes);
      for (q = 0; q < sd.length; q++) {
        res.porDeuda[listaD[q].id][t] = sd[q].capital;
        if (sd[q].fin === a) res.hitos.deudas[listaD[q].id] = a;
        if (j >= 0 && porDeudaMes[q]) { put('d:' + listaD[q].id, j, porDeudaMes[q].cuota); put('dx:' + listaD[q].id, j, porDeudaMes[q].extra + porDeudaMes[q].cascada); }
      }
      var libre = rd.libre;
      // Inversiones (crecen y reciben la aportación a final de mes)
      for (q = 0; q < si.length; q++) {
        var sI = si[q]; x = sI.inv;
        var apI = 0;
        if (x.activa !== false) {
          var ajI = ajusteDe(x, a);
          apI = ajI != null ? ajI : redondear(num(x.aportacion) * Math.pow(1 + num(x.crecimiento), k));
        }
        (x.extraordinarias || []).forEach(function (e) { if (ym(e.mes) === a) apI += e.importe | 0; });
        sI.valor = redondear(sI.valor * (1 + sI.rm)) + apI;
        sI.aportado += apI; inv += apI;
        if (j >= 0) put('i:' + x.id, j, apI);
      }
      // Cuotas liberadas → inversión
      if (libre > 0 && (hip.destinoLiberadas === 'inversion' || cascada) && invLib) {
        invLib.valor += libre; invLib.aportado += libre; invL = libre;
        if (j >= 0) put('il', j, libre);
      }
      if (j >= 0 && rd.cascada) put('dl', j, 0);
      // Excedente
      var exc = ing - gas - hu - rd.cuotas - rd.extras - rd.cascada - inv - invL;
      if (invExc && hip.pctExcedente > 0 && exc > 0) {
        invE = redondear(exc * hip.pctExcedente);
        invExc.valor += invE; invExc.aportado += invE;
        if (j >= 0) put('ie', j, invE);
      }
      var ahorro = exc - invE;
      caja += ahorro;
      for (q = 0; q < si.length; q++) res.porInversion[si[q].inv.id][t] = si[q].valor;
      var actInc = 0, actTodos = 0;
      for (q = 0; q < sa.length; q++) {
        sa[q].valor = redondear(sa[q].valor * (1 + sa[q].rm));
        actTodos += sa[q].valor;
        if (sa[q].x.incluir) actInc += sa[q].valor;
      }
      // Registro
      var M = res.m;
      M.ingresos[t] = ing; M.gastos[t] = gas; M.gastosHucha[t] = gasH; M.esenciales[t] = esen; M.huchas[t] = hu;
      M.cuotas[t] = rd.cuotas; M.extras[t] = rd.extras; M.cascada[t] = rd.cascada;
      M.inversion[t] = inv + invE + invL; M.invExcedente[t] = invE; M.invLiberada[t] = invL;
      M.intereses[t] = rd.intereses; M.capital[t] = rd.capital; M.comisiones[t] = rd.comisiones;
      M.ahorro[t] = ahorro; M.caja[t] = caja;
      var hS = 0; sh.forEach(function (z) { hS += z.mi; }); M.huchasSaldo[t] = hS;
      var iV = 0, iA = 0; si.forEach(function (z) { iV += z.valor; iA += z.aportado; }); M.invValor[t] = iV; M.invAportado[t] = iA;
      var dP = 0; sd.forEach(function (z) { dP += z.capital; }); M.deuda[t] = dP;
      M.activos[t] = actInc; M.activosTodos[t] = actTodos;
      M.patrimonio[t] = caja + hS + iV + actInc - dP;
      M.patrimonioReal[t] = redondear(M.patrimonio[t] / Math.pow(1 + infM, (t + 1) / 12));
      if (j >= 0) det.cajaFin[j] = caja;
    }
    res.detalle = det;
    res.estadoDeudas = sd.map(function (s, q) { return { id: listaD[q].id, fin: s.fin, intereses: s.intereses, comisiones: s.comisiones, cuota: s.cuotaInicial, plazo: s.n0 }; });
    return res;
  }

  // ------------------------------------------------------------ Indicadores ---
  /** Indicadores clave de los primeros 12 meses del plan. */
  function kpis(esc, sim) {
    var M = sim.m, n = 12;
    var o = {};
    ['ingresos', 'gastos', 'gastosHucha', 'esenciales', 'huchas', 'cuotas', 'extras', 'cascada', 'inversion', 'intereses', 'capital', 'ahorro', 'comisiones']
      .forEach(function (k) { o[k] = suma(M[k], 0, n); });
    o.consumo = o.gastos + o.gastosHucha;
    o.salidas = o.gastos + o.huchas + o.cuotas + o.extras + o.cascada + o.inversion;
    o.tasaAhorro = o.ingresos > 0 ? (o.ahorro + o.inversion + o.capital) / o.ingresos : 0;
    o.patrimonioHoy = sim.pat0;
    o.patrimonio12 = M.patrimonio[n - 1];
    o.saldoFin12 = M.caja[n - 1];
    o.deudaTotal = sim.deuda0;
    o.cuotaMensual = o.cuotas / n;
    o.ratioEndeudamiento = o.ingresos > 0 ? o.cuotas / o.ingresos : 0;
    // Colchón: cuentas líquidas + inversiones líquidas (cuentas remuneradas) / gastos esenciales + cuotas
    var liquido = 0;
    (esc.cuentas || []).forEach(function (c) { if (c.liquida !== false) liquido += c.saldo | 0; });
    (esc.inversiones || []).forEach(function (x) { if (x.liquida) liquido += x.valor | 0; });
    o.liquido = liquido;
    o.esencialMensual = (o.esenciales + o.cuotas) / n;
    o.colchonMeses = o.esencialMensual > 0 ? liquido / o.esencialMensual : null;
    // Independencia financiera (regla del 4 %): gasto anual × 25, en euros de hoy
    o.numeroIF = o.consumo * 25;
    o.anioIF = null; o.mesesIF = null;
    var inf = num(sim.hip.inflacion);
    for (var t = 0; t < sim.meses; t++) {
      var fin = (M.invValor[t] + M.caja[t] - M.deuda[t]) / Math.pow(1 + inf, (t + 1) / 12);
      if (o.numeroIF > 0 && fin >= o.numeroIF) { o.mesesIF = t + 1; o.anioIF = (t + 1) / 12; break; }
    }
    o.anualSuscripciones = 0;
    (esc.partidas || []).forEach(function (p) {
      if (p.activa !== false && p.tipo === 'gasto' && p.grupo === 'suscripciones') o.anualSuscripciones += anualPartida(p);
    });
    return o;
  }
  /** Gasto de consumo por categoría (tu parte) en los primeros n meses del plan, incluidos los pagados desde huchas. */
  function gastosPorCategoria(esc, n) {
    var ini = ym(esc.inicio), ctx = { inicio: ini, hip: hipotesis(esc.hipotesis) }, out = {};
    n = n || 12;
    (esc.partidas || []).forEach(function (p) {
      if (p.activa === false || p.tipo !== 'gasto') return;
      var s = 0;
      for (var t = 0; t < n; t++) s += parte(importeMes(p, ini + t, ctx), p.miParte);
      var cat = p.categoria || 'Otros';
      if (s) out[cat] = (out[cat] || 0) + s;
    });
    return out;
  }
  /** Patrimonio al cabo de N años (fin del mes 12·N). */
  function patrimonioA(sim, anios, real) {
    var t = Math.min(sim.meses, Math.round(anios * 12)) - 1;
    if (t < 0) return sim.pat0;
    return (real ? sim.m.patrimonioReal : sim.m.patrimonio)[t];
  }
  /** Diferencias entre dos simulaciones (modo ¿Y si…? y comparador de escenarios). */
  function diferencias(base, cur) {
    function d(f) { return f(cur) - f(base); }
    return {
      ahorroAnual: d(function (s) { return suma(s.m.ahorro, 0, 12); }),
      saldoFin: d(function (s) { return s.m.caja[11]; }),
      pat10: d(function (s) { return patrimonioA(s, 10); }),
      pat20: d(function (s) { return patrimonioA(s, 20); }),
      pat10Real: d(function (s) { return patrimonioA(s, 10, true); }),
      pat20Real: d(function (s) { return patrimonioA(s, 20, true); })
    };
  }
  /** Aportación mensual necesaria para llegar a un objetivo de hucha en fecha. */
  function objetivoHucha(h, sim) {
    if (!(h.objetivo > 0)) return null;
    var serie = sim.porHucha[h.id] || [];
    var r = { objetivo: h.objetivo, alcanzado: sim.hitos.huchas[h.id] != null ? sim.hitos.huchas[h.id] : null };
    if (h.fechaObjetivo) {
      var t = ym(h.fechaObjetivo) - sim.inicio;
      var m = t + 1;
      if (t >= 0 && t < serie.length) {
        r.saldoEnFecha = serie[t];
        r.llego = serie[t] >= h.objetivo;
        r.meses = m;
        var falta = h.objetivo - serie[t];
        r.aportacionNecesaria = Math.max(0, (h.activa === false ? 0 : (h.aportacion | 0)) + Math.ceil(falta / m));
      } else if (t < 0) { r.vencido = true; }
    }
    return r;
  }

  // ---------------------------------------------------------------- Avisos ---
  /** Avisos automáticos útiles. Devuelve [{nivel:'critico'|'aviso'|'info'|'ok', titulo, texto, seccion}] */
  function avisos(esc, sim, k, opts) {
    opts = opts || {};
    var out = [], M = sim.m, f = opts.fmt || function (c) { return (c / 100).toFixed(2) + ' €'; };
    var mesTxt = opts.mes || function (a) { return ymStr(a); };
    var hip = sim.hip;
    // Saldo negativo en los próximos 12 meses
    for (var t = 0; t < 12; t++) {
      if (M.caja[t] < 0) {
        out.push({ nivel: 'critico', seccion: 'presupuesto', titulo: 'Saldo negativo en ' + mesTxt(sim.inicio + t),
                   texto: 'La cuenta bajaría a ' + f(M.caja[t]) + '. Revisa gastos de ese mes o reparte los gastos anuales con una hucha.' });
        break;
      }
    }
    // Meses con ahorro muy negativo por un gasto puntual/anual sin hucha
    var picos = [];
    (esc.partidas || []).forEach(function (p) {
      if (p.activa === false || p.tipo !== 'gasto' || p.pagadoDesde) return;
      if (['anual', 'semestral', 'puntual'].indexOf(p.frecuencia) < 0) return;
      var anual = anualPartida(p);
      if (anual >= 15000) picos.push(p);
    });
    if (picos.length) {
      var p0 = picos.sort(function (a, b) { return anualPartida(b) - anualPartida(a); })[0];
      out.push({ nivel: 'aviso', seccion: 'huchas', titulo: picos.length + (picos.length === 1 ? ' gasto anual' : ' gastos anuales') + ' sin hucha',
                 texto: '«' + p0.nombre + '» (' + f(anualPartida(p0)) + '/año) cae de golpe en su mes. Una hucha de ' + f(Math.ceil(anualPartida(p0) / 12)) + '/mes lo reparte.' });
    }
    // Suscripciones
    if (k.anualSuscripciones > 0) {
      out.push({ nivel: 'info', seccion: 'presupuesto', titulo: 'Suscripciones: ' + f(k.anualSuscripciones) + ' al año',
                 texto: 'Son ' + f(Math.round(k.anualSuscripciones / 12)) + ' al mes. Invertidas a ' + (hip.rentDefecto * 100).toFixed(0).replace('.', ',') + ' % durante 10 años serían unos ' + f(costeOportunidad(k.anualSuscripciones, 10, hip.rentDefecto)) + '.' });
    }
    // Deuda más cara que la rentabilidad esperada
    var invs = (esc.inversiones || []);
    var mejor = null;
    invs.forEach(function (x) { var r = rentDe(x, 'base') - num(x.ter); if (mejor == null || r > mejor.r) mejor = { r: r, x: x }; });
    (esc.deudas || []).forEach(function (d) {
      if (!(d.capital > 0)) return;
      var r = mejor ? mejor.r : hip.rentDefecto;
      if (d.tin > r) {
        out.push({ nivel: 'aviso', seccion: 'deudas', titulo: '«' + d.nombre + '» cuesta más de lo que rinde tu inversión',
                   texto: 'TIN ' + (d.tin * 100).toFixed(2).replace('.', ',') + ' % (TAE ' + (tae(d.tin) * 100).toFixed(2).replace('.', ',') + ' %), seguro, frente a un ' + (r * 100).toFixed(2).replace('.', ',') + ' % esperado (no garantizado) neto de comisiones' + (mejor ? ' en «' + mejor.x.nombre + '»' : '') + '. Compáralo en «¿Amortizar o invertir?».' });
      }
    });
    // Ratio de endeudamiento
    if (k.ratioEndeudamiento > 0.35) out.push({ nivel: 'critico', seccion: 'deudas', titulo: 'Endeudamiento del ' + (k.ratioEndeudamiento * 100).toFixed(0) + ' %', texto: 'Las cuotas superan el 35 % de tus ingresos netos.' });
    // Colchón
    if (k.colchonMeses != null && k.colchonMeses < 3) {
      out.push({ nivel: 'aviso', seccion: 'resumen', titulo: 'Colchón de ' + k.colchonMeses.toFixed(1).replace('.', ',') + ' meses',
                 texto: 'Lo prudente son 3–6 meses de gastos esenciales (' + f(Math.round(k.esencialMensual)) + '/mes): entre ' + f(Math.round(k.esencialMensual * 3)) + ' y ' + f(Math.round(k.esencialMensual * 6)) + '.' });
    }
    // Huchas en negativo
    (esc.huchas || []).forEach(function (h) {
      var serie = sim.porHucha[h.id] || [];
      for (var t = 0; t < Math.min(24, serie.length); t++) {
        if (serie[t] < 0) {
          out.push({ nivel: 'aviso', seccion: 'huchas', titulo: '«' + h.nombre + '» se queda en negativo en ' + mesTxt(sim.inicio + t),
                     texto: 'Llegaría a ' + f(serie[t]) + '. Sube la aportación o empieza a ahorrar antes.' });
          break;
        }
      }
      var o = objetivoHucha(h, sim);
      if (o && o.llego === false) out.push({ nivel: 'aviso', seccion: 'huchas', titulo: 'Objetivo «' + h.nombre + '» no se alcanza a tiempo', texto: 'Necesitas ' + f(o.aportacionNecesaria) + '/mes en lugar de ' + f(h.aportacion) + '.' });
    });
    // Deuda: cuota y plazo no cuadran
    (esc.deudas || []).forEach(function (d) {
      if (!d.fin || !(d.cuota > 0) || !(d.capital > 0)) return;
      var c = cuadroAmortizacion(d, { sinExtras: true, inicio: sim.inicio });
      if (c.fin != null && Math.abs(c.fin - ym(d.fin)) > 1) {
        out.push({ nivel: 'info', seccion: 'deudas', titulo: '«' + d.nombre + '»: la cuota no cuadra con la fecha de fin',
                   texto: 'Con ' + f(d.cuota) + ' de cuota terminaría en ' + mesTxt(c.fin) + ' y no en ' + mesTxt(ym(d.fin)) + '. Se usa la cuota del recibo.' });
      }
    });
    if (!out.some(function (x) { return x.nivel === 'critico' || x.nivel === 'aviso'; })) out.unshift({ nivel: 'ok', titulo: 'Sin alertas importantes', texto: 'Tu plan no muestra meses en negativo ni riesgos destacados.' });
    var orden = { critico: 0, aviso: 1, info: 2, ok: 3 };
    return out.sort(function (x, y) { return orden[x.nivel] - orden[y.nivel]; });
  }

  return {
    ym: ym, ymStr: ymStr, anioDe: anioDe, mesDe: mesDe, hoyYM: hoyYM,
    redondear: redondear, cents: cents, parte: parte, repartir: repartir, suma: suma,
    PERIODO: PERIODO, VECES_ANIO: VECES_ANIO, ocurre: ocurre, mesesDeCargo: mesesDeCargo, enRango: enRango,
    tasaSubida: tasaSubida, importeMes: importeMes, anualPartida: anualPartida,
    ESCALA_AHORRO_2026: ESCALA_AHORRO_2026, impuestoAhorro: impuestoAhorro,
    tasaMensual: tasaMensual, rentDe: rentDe, proyectarInversion: proyectarInversion,
    valorFuturoMensual: valorFuturoMensual, costeOportunidad: costeOportunidad,
    cuotaFrancesa: cuotaFrancesa, nper: nper, plazoDe: plazoDe, tae: tae,
    iniciarDeuda: iniciarDeuda, cuadroAmortizacion: cuadroAmortizacion, estrategiaDeudas: estrategiaDeudas,
    amortizarVsInvertir: amortizarVsInvertir, prestamoInversion: prestamoInversion,
    HIP_DEFECTO: HIP_DEFECTO, hipotesis: hipotesis, simular: simular, kpis: kpis, patrimonioA: patrimonioA, gastosPorCategoria: gastosPorCategoria,
    diferencias: diferencias, objetivoHucha: objetivoHucha, avisos: avisos
  };
})();
if (typeof module !== 'undefined' && module.exports) module.exports = PFCalc;
