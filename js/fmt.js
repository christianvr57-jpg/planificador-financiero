/* =============================================================================
   fmt.js · Formato y lectura de números en es-ES
   -----------------------------------------------------------------------------
   es-ES no agrupa miles en cifras de 4 dígitos por defecto (1234 → "1234");
   se fuerza useGrouping:'always' y, si el motor no lo soporta, se agrupa a mano.
   ============================================================================= */
var PFFmt = (function () {
  'use strict';
  var MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  var MESES_C = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  var MENOS = '−';

  var cache = {};
  function nf(dec) {
    if (cache[dec]) return cache[dec];
    var o = { minimumFractionDigits: dec, maximumFractionDigits: dec };
    var f;
    try { f = new Intl.NumberFormat('es-ES', Object.assign({ useGrouping: 'always' }, o)); }
    catch (e) { f = new Intl.NumberFormat('es-ES', o); }
    var agrupaBien = f.format(1234).indexOf('.') > 0;
    cache[dec] = agrupaBien ? f : { format: function (x) { return manual(x, dec); } };
    return cache[dec];
  }
  function manual(x, dec) {
    var neg = x < 0; x = Math.abs(x);
    var s = x.toFixed(dec), p = s.split('.');
    var ent = p[0].replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    return (neg ? '-' : '') + ent + (dec ? ',' + p[1] : '');
  }
  /** Número con `dec` decimales; usa signo menos tipográfico. */
  function numero(x, dec) {
    if (x == null || !isFinite(x)) return '—';
    dec = dec == null ? 2 : dec;
    var s = nf(dec).format(x);
    if (s === '-0' || /^-0(,0+)?$/.test(s)) s = s.slice(1);
    return s.replace('-', MENOS);
  }
  /** Céntimos → "1.234,56 €". opts: {dec:0|2, signo:true (fuerza +)} */
  function eur(c, opts) {
    if (c == null || !isFinite(c)) return '—';
    opts = opts || {};
    var dec = opts.dec == null ? 2 : opts.dec;
    var s = numero(c / 100, dec);
    if (opts.signo && c > 0) s = '+' + s;
    return s + (opts.sinSimbolo ? '' : ' €');
  }
  function eur0(c, opts) { return eur(c, Object.assign({ dec: 0 }, opts || {})); }
  /** Formato compacto para ejes: 12,3 k€ / 1,2 M€ */
  function eurCorto(c) {
    var e = c / 100, a = Math.abs(e);
    if (a >= 1e6) return numero(e / 1e6, a >= 1e7 ? 0 : 1) + ' M€';
    if (a >= 1e4) return numero(e / 1e3, 0) + ' k€';
    if (a >= 1e3) return numero(e / 1e3, 1) + ' k€';
    return numero(e, 0) + ' €';
  }
  /** Decimal → "7,00 %" */
  function pct(x, dec) {
    if (x == null || !isFinite(x)) return '—';
    return numero(x * 100, dec == null ? 1 : dec) + ' %';
  }
  function mesCorto(a) { var y = Math.floor(a / 12), m = a - y * 12; return MESES_C[m] + ' ' + String(y).slice(2); }
  function mesLargo(a) { var y = Math.floor(a / 12), m = a - y * 12; return MESES[m] + ' ' + y; }
  function mesNombre(m1) { return MESES[m1 - 1]; }
  function mesNombreCorto(m1) { return MESES_C[m1 - 1]; }
  function anios(x) {
    if (x == null) return '—';
    var a = Math.floor(x), m = Math.round((x - a) * 12);
    if (m === 12) { a++; m = 0; }
    if (!a) return m + (m === 1 ? ' mes' : ' meses');
    return a + (a === 1 ? ' año' : ' años') + (m ? ' y ' + m + (m === 1 ? ' mes' : ' meses') : '');
  }
  function fechaHora(iso) {
    if (!iso) return 'nunca';
    var d = new Date(iso);
    return d.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' }) + ' ' + d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
  }

  // --------------------------------------------------------------- Lectura ---
  /** Normaliza un número escrito a la española: "1.234,56" · "1234,5" · "12.99" · "1.234" */
  function normalizarNumero(t) {
    t = t.replace(/\s|€|%/g, '');
    if (t.indexOf(',') >= 0) return t.replace(/\./g, '').replace(',', '.');
    var partes = t.split('.');
    if (partes.length > 2) return partes.join('');             // 1.234.567
    if (partes.length === 2 && partes[1].length === 3) return partes.join(''); // 1.234 → miles
    return t;                                                  // 12.99 → decimal
  }
  /**
   * Evalúa una expresión simple (+ − * / paréntesis) con números en formato español.
   * Permite anotar varios gastos en una celda: "40+25,50+12". Sin eval().
   */
  function evaluar(txt) {
    if (txt == null) return null;
    var s = String(txt).trim().replace(/^=/, '').replace(/−/g, '-').replace(/[×x]/g, '*').replace(/÷/g, '/');
    if (!s) return null;
    var toks = [], re = /\s*([0-9][0-9.,]*|[-+*/()])\s*/g, m, pos = 0;
    while ((m = re.exec(s)) && m.index === pos) { toks.push(m[1]); pos = re.lastIndex; }
    if (pos !== s.length) return null;
    var i = 0;
    function expr() { var v = term(); while (toks[i] === '+' || toks[i] === '-') { var op = toks[i++], w = term(); v = op === '+' ? v + w : v - w; } return v; }
    function term() { var v = factor(); while (toks[i] === '*' || toks[i] === '/') { var op = toks[i++], w = factor(); v = op === '*' ? v * w : v / w; } return v; }
    function factor() {
      var t = toks[i++];
      if (t === '-') return -factor();
      if (t === '+') return factor();
      if (t === '(') { var v = expr(); if (toks[i++] !== ')') throw 0; return v; }
      if (t == null) throw 0;
      var n = parseFloat(normalizarNumero(t));
      if (!isFinite(n)) throw 0;
      return n;
    }
    try { var r = expr(); if (i !== toks.length || !isFinite(r)) return null; return r; }
    catch (e) { return null; }
  }
  /** Texto → céntimos (o null si no es válido). */
  function leerImporte(txt) {
    var v = evaluar(txt);
    return v == null ? null : Math.round(v * 100 + (v >= 0 ? 1e-9 : -1e-9));
  }
  /** Texto "7,5" → 0.075 */
  function leerPct(txt) {
    var v = evaluar(txt);
    return v == null ? null : Math.round(v * 1e6) / 1e8;
  }
  function esExpresion(txt) { return /[+*/()]/.test(String(txt).replace(/^[-+]/, '')) || /\d\s*-\s*\d/.test(String(txt)); }

  /** Escapa texto para insertarlo en HTML. */
  function html(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  return {
    MESES: MESES, MESES_C: MESES_C, numero: numero, eur: eur, eur0: eur0, eurCorto: eurCorto, pct: pct,
    mesCorto: mesCorto, mesLargo: mesLargo, mesNombre: mesNombre, mesNombreCorto: mesNombreCorto,
    anios: anios, fechaHora: fechaHora,
    evaluar: evaluar, leerImporte: leerImporte, leerPct: leerPct, esExpresion: esExpresion, html: html
  };
})();
if (typeof module !== 'undefined' && module.exports) module.exports = PFFmt;
