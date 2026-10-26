/* =============================================================================
   tricount.js · Gastos compartidos (estilo Tricount): cálculo e importación
   -----------------------------------------------------------------------------
   Funciones puras, sin DOM (se prueban en Node).
   Movimiento: { id, tipo: 'gasto'|'reembolso'|'ingreso', fecha: 'AAAA-MM-DD',
                 concepto, categoria, importe (céntimos), pagadoPor: idPersona,
                 para: idPersona (solo reembolso),
                 reparto: { modo: 'iguales'|'porcentaje'|'importes', partes: {idPersona: n} } }
   · iguales: partes[id] = 1 participa / 0 no participa (sin partes = todos).
   · porcentaje: partes[id] = % (no hace falta que sumen 100: se reparte en proporción).
   · importes: partes[id] = céntimos exactos de cada uno.
   Saldo de una persona = lo que ha pagado − lo que le corresponde. Positivo: le deben.
   ============================================================================= */
var PFTricount = (function () {
  'use strict';
  var F = (typeof PFFmt !== 'undefined') ? PFFmt : require('./fmt.js');

  // ------------------------------------------------------------- Reparto ---
  /** Parte de cada persona en un movimiento (céntimos, suman exactamente el importe). */
  function reparto(m, personas) {
    var ids = personas.map(function (p) { return p.id; }), out = {}, imp = Math.abs(m.importe | 0);
    ids.forEach(function (id) { out[id] = 0; });
    if (m.tipo === 'reembolso') { if (out[m.para] != null) out[m.para] = imp; return out; }
    var r = m.reparto || { modo: 'iguales' }, partes = r.partes || {};
    if (r.modo === 'importes') { ids.forEach(function (id) { out[id] = Math.abs(partes[id] | 0); }); return out; }
    var pesos = ids.map(function (id) {
      if (r.modo === 'porcentaje') return Math.max(0, +partes[id] || 0);
      return partes[id] == null ? 1 : (+partes[id] ? 1 : 0);
    });
    var W = pesos.reduce(function (s, x) { return s + x; }, 0);
    if (!W) { if (out[m.pagadoPor] != null) out[m.pagadoPor] = imp; return out; }
    var asignado = 0, restos = [];
    ids.forEach(function (id, i) {
      var exacto = imp * pesos[i] / W, base = Math.floor(exacto);
      out[id] = base; asignado += base;
      if (pesos[i] > 0) restos.push({ id: id, r: exacto - base, i: i });
    });
    restos.sort(function (a, b) { return (b.r - a.r) || (a.i - b.i); });
    for (var k = 0; asignado < imp; k++) { out[restos[k % restos.length].id]++; asignado++; }
    return out;
  }
  /** Efecto de un movimiento en el saldo de cada persona. */
  function efecto(m, personas) {
    var partes = reparto(m, personas), out = {}, imp = Math.abs(m.importe | 0);
    var signo = m.tipo === 'ingreso' ? -1 : 1;
    personas.forEach(function (p) { out[p.id] = -signo * partes[p.id]; });
    if (out[m.pagadoPor] != null) out[m.pagadoPor] += signo * imp;
    return out;
  }
  /** Saldos actuales (incluye el saldo de partida). */
  function saldos(c, hasta) {
    var out = {};
    c.personas.forEach(function (p) { out[p.id] = (c.saldoInicial && c.saldoInicial[p.id]) | 0; });
    c.movimientos.forEach(function (m) {
      if (hasta && m.fecha > hasta) return;
      var e = efecto(m, c.personas);
      for (var id in e) out[id] += e[id];
    });
    return out;
  }
  /** Transferencias mínimas para quedar en paz (quién paga a quién). */
  function liquidaciones(sal) {
    var deudores = [], acreedores = [], out = [];
    for (var id in sal) { if (sal[id] < 0) deudores.push({ id: id, v: -sal[id] }); else if (sal[id] > 0) acreedores.push({ id: id, v: sal[id] }); }
    deudores.sort(function (a, b) { return b.v - a.v; }); acreedores.sort(function (a, b) { return b.v - a.v; });
    var i = 0, j = 0;
    while (i < deudores.length && j < acreedores.length) {
      var x = Math.min(deudores[i].v, acreedores[j].v);
      if (x > 0) out.push({ de: deudores[i].id, a: acreedores[j].id, importe: x });
      deudores[i].v -= x; acreedores[j].v -= x;
      if (!deudores[i].v) i++;
      if (!acreedores[j].v) j++;
    }
    return out;
  }
  /** Resumen por mes: gasto total, pagado y parte de cada persona, y saldo acumulado al final del mes. */
  function porMes(c) {
    var meses = {}, orden = c.movimientos.slice().sort(function (a, b) { return a.fecha < b.fecha ? -1 : a.fecha > b.fecha ? 1 : 0; });
    var acum = {};
    c.personas.forEach(function (p) { acum[p.id] = (c.saldoInicial && c.saldoInicial[p.id]) | 0; });
    orden.forEach(function (m) {
      var k = m.fecha.slice(0, 7);
      var o = meses[k] || (meses[k] = { mes: k, total: 0, n: 0, pagado: {}, parte: {}, saldo: null });
      if (m.tipo === 'gasto') {
        var partes = reparto(m, c.personas);
        o.total += m.importe; o.n++;
        o.pagado[m.pagadoPor] = (o.pagado[m.pagadoPor] || 0) + m.importe;
        for (var id in partes) o.parte[id] = (o.parte[id] || 0) + partes[id];
      } else if (m.tipo === 'ingreso') {
        var pi = reparto(m, c.personas);
        o.total -= m.importe;
        for (var id2 in pi) o.parte[id2] = (o.parte[id2] || 0) - pi[id2];
      }
      var e = efecto(m, c.personas);
      for (var id3 in e) acum[id3] += e[id3];
      o.saldo = Object.assign({}, acum);
    });
    return Object.keys(meses).sort().map(function (k) { return meses[k]; });
  }
  /** Gasto (tu parte) por categoría en un rango de fechas [desde, hasta] (AAAA-MM-DD, opcionales). */
  function porCategoria(c, idPersona, desde, hasta) {
    var out = {};
    c.movimientos.forEach(function (m) {
      if (m.tipo === 'reembolso') return;
      if (desde && m.fecha < desde) return;
      if (hasta && m.fecha > hasta) return;
      var parte = reparto(m, c.personas)[idPersona] * (m.tipo === 'ingreso' ? -1 : 1);
      var k = m.categoria || 'Otros';
      out[k] = (out[k] || 0) + parte;
    });
    return out;
  }

  // ------------------------------------------------------------- Fechas ----
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  /** Acepta AAAA-MM-DD[ hh:mm], DD/MM/AAAA, DD-MM-AA, ISO… Devuelve 'AAAA-MM-DD' o null. */
  function leerFecha(t) {
    t = String(t || '').trim();
    var m = t.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
    if (m) return valida(+m[1], +m[2], +m[3]);
    m = t.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})/);
    if (m) { var y = +m[3]; if (y < 100) y += 2000; return valida(y, +m[2], +m[1]); }
    return null;
  }
  function valida(y, mo, d) {
    if (mo < 1 || mo > 12 || d < 1 || d > 31 || y < 1990 || y > 2100) return null;
    return y + '-' + pad(mo) + '-' + pad(d);
  }

  // ---------------------------------------------------------------- CSV ----
  /** Parser CSV con comillas; detecta separador (coma, punto y coma o tabulador). */
  function parseCSV(texto) {
    texto = String(texto || '').replace(/^﻿/, '');
    var primera = texto.split(/\r?\n/)[0] || '';
    var cuenta = function (ch) { return primera.split(ch).length - 1; };
    var sep = [',', ';', '\t'].sort(function (a, b) { return cuenta(b) - cuenta(a); })[0];
    var filas = [], fila = [], campo = '', comillas = false;
    for (var i = 0; i < texto.length; i++) {
      var ch = texto[i];
      if (comillas) {
        if (ch === '"') { if (texto[i + 1] === '"') { campo += '"'; i++; } else comillas = false; }
        else campo += ch;
      } else if (ch === '"') comillas = true;
      else if (ch === sep) { fila.push(campo); campo = ''; }
      else if (ch === '\n' || ch === '\r') {
        if (ch === '\r' && texto[i + 1] === '\n') i++;
        fila.push(campo); campo = '';
        if (fila.some(function (x) { return x.trim() !== ''; })) filas.push(fila);
        fila = [];
      } else campo += ch;
    }
    fila.push(campo);
    if (fila.some(function (x) { return x.trim() !== ''; })) filas.push(fila);
    if (!filas.length) return { cabecera: [], filas: [] };
    return { cabecera: filas[0].map(function (h) { return h.trim(); }), filas: filas.slice(1) };
  }
  function norm(s) { return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim(); }
  var RE_PARA = /^(paid for|impacted to|impact for|for|para|pagado para|a cargo de|parte de|participante)\s*[:\-]?\s*(.+)$/i;
  /** Detecta qué columna es cada campo y las columnas de "pagado para <persona>". */
  function detectarColumnas(cab) {
    var idx = { concepto: -1, importe: -1, fecha: -1, pagadoPor: -1, categoria: -1, tipo: -1 }, para = [];
    cab.forEach(function (h, i) {
      var n = norm(h), mp = n.match(RE_PARA);
      if (mp && !/^(paid by|pagado por)/.test(n)) { para.push({ col: i, nombre: h.trim().match(RE_PARA)[2].trim() }); return; }
      if (idx.concepto < 0 && /^(title|titulo|concepto|descripcion|description|what|nombre|motivo)$/.test(n)) idx.concepto = i;
      else if (/^(amount|importe|cantidad|monto|total|value|valor)$/.test(n)) idx.importe = i;
      else if (idx.importe < 0 && /(amount in|importe en|importe \(|amount \()/.test(n)) idx.importe = i;
      else if (idx.fecha < 0 && /(date|fecha|cuando|when)/.test(n)) idx.fecha = i;
      else if (idx.pagadoPor < 0 && /(paid by|pagado por|pagador|who paid|payer|quien pago)/.test(n)) idx.pagadoPor = i;
      else if (idx.categoria < 0 && /categor/.test(n)) idx.categoria = i;
      else if (idx.tipo < 0 && /(transaction type|^type$|^tipo|tipo de)/.test(n)) idx.tipo = i;
    });
    // Preferir "Amount in EUR" (moneda del grupo) si existe además de "Amount"
    cab.forEach(function (h, i) { if (/amount in (eur|default)|importe en eur/.test(norm(h))) idx.importe = i; });
    if (idx.concepto < 0) cab.forEach(function (h, i) { if (idx.concepto < 0 && /(title|titulo|concepto|descrip)/.test(norm(h))) idx.concepto = i; });
    return { idx: idx, para: para };
  }
  /**
   * Convierte las filas a movimientos. opts: { cab, filas, map: {idx, para}, personasMap: {nombreCSV: idPersona}, personas }
   * Devuelve { movimientos, errores: [{fila, motivo}] }.
   */
  function convertir(opts) {
    var idx = opts.map.idx, para = opts.map.para, pm = opts.personasMap || {}, personas = opts.personas;
    var out = [], errores = [];
    function persona(nombre) {
      var k = String(nombre || '').trim();
      if (pm[k]) return pm[k];
      var n = norm(k);
      for (var q in pm) if (norm(q) === n) return pm[q];
      var p = personas.filter(function (x) { return norm(x.nombre) === n; })[0];
      return p ? p.id : null;
    }
    opts.filas.forEach(function (f, i) {
      var celda = function (j) { return j >= 0 ? String(f[j] == null ? '' : f[j]).trim() : ''; };
      var importe = F.leerImporte(celda(idx.importe));
      if (importe == null) { errores.push({ fila: i + 2, motivo: 'importe no válido' }); return; }
      var fecha = leerFecha(celda(idx.fecha)) || opts.hoy;
      var pagador = persona(celda(idx.pagadoPor));
      if (!pagador) { errores.push({ fila: i + 2, motivo: 'no sé quién pagó («' + celda(idx.pagadoPor) + '»)' }); return; }
      var tipoTxt = norm(celda(idx.tipo));
      var tipo = /transfer|reembols|money|pago entre|devolucion de deuda|settle/.test(tipoTxt) ? 'reembolso' : /income|ingreso/.test(tipoTxt) ? 'ingreso' : 'gasto';
      if (importe < 0 && tipo === 'gasto' && /income|ingreso/.test(tipoTxt)) tipo = 'ingreso';
      var abs = Math.abs(importe);
      var partes = {}, sumaPartes = 0, alguna = false;
      para.forEach(function (p) {
        var id = persona(p.nombre); if (!id) return;
        var v = F.leerImporte(celda(p.col));
        if (v != null && v !== 0) { partes[id] = (partes[id] || 0) + Math.abs(v); sumaPartes += Math.abs(v); alguna = true; }
        else if (v === 0 && partes[id] == null) partes[id] = 0;
      });
      var m = { tipo: tipo, fecha: fecha, concepto: celda(idx.concepto) || (tipo === 'reembolso' ? 'Reembolso' : 'Gasto'), categoria: celda(idx.categoria) || (tipo === 'reembolso' ? '' : 'Otros'),
                importe: abs, pagadoPor: pagador };
      if (tipo === 'reembolso') {
        var dest = Object.keys(partes).filter(function (id) { return partes[id] > 0 && id !== pagador; })[0];
        if (!dest && personas.length === 2) dest = personas.filter(function (x) { return x.id !== pagador; })[0].id;
        if (!dest) { errores.push({ fila: i + 2, motivo: 'reembolso sin destinatario' }); return; }
        m.para = dest;
      } else if (alguna && Math.abs(sumaPartes - abs) <= personas.length) {
        var dif = abs - sumaPartes, ids = Object.keys(partes).filter(function (id) { return partes[id] > 0; });
        if (dif && ids.length) partes[ids[0]] += dif;
        m.reparto = { modo: 'importes', partes: partes };
      } else if (alguna) {
        var inc = {}; personas.forEach(function (x) { inc[x.id] = partes[x.id] > 0 ? 1 : 0; });
        m.reparto = { modo: 'iguales', partes: inc };
      } else m.reparto = { modo: 'iguales' };
      out.push(m);
    });
    return { movimientos: out, errores: errores };
  }
  /** Clave para detectar duplicados al importar. */
  function huella(m) { return [m.fecha, norm(m.concepto), m.importe, m.pagadoPor, m.tipo].join('|'); }

  return {
    reparto: reparto, efecto: efecto, saldos: saldos, liquidaciones: liquidaciones, porMes: porMes, porCategoria: porCategoria,
    leerFecha: leerFecha, parseCSV: parseCSV, detectarColumnas: detectarColumnas, convertir: convertir, huella: huella, norm: norm
  };
})();
if (typeof module !== 'undefined' && module.exports) module.exports = PFTricount;
