/* =============================================================================
   whatif.js · Modo «¿Y si…?»
   -----------------------------------------------------------------------------
   Al activarlo se congela una copia del escenario activo como línea base.
   Todo cambio posterior se compara con ella (barra de diferencias, filas
   marcadas). Descartar restaura la base; Aplicar se queda con los cambios;
   Guardar como escenario crea uno nuevo con los cambios y restaura la base.
   ============================================================================= */
var PFWhatIf = (function () {
  'use strict';

  function activo() {
    var s = PFStore.get();
    return !!(s.whatif && s.whatif.escenarioId === s.escenarioActivo);
  }
  function base() { return activo() ? PFStore.get().whatif.base : null; }

  function activar() {
    PFStore.update(function (s, e) {
      s.whatif = { escenarioId: s.escenarioActivo, desde: new Date().toISOString(), base: PFSchema.clon(e) };
    }, { etiqueta: 'activar ¿Y si…?' });
  }
  function descartar() {
    PFStore.update(function (s) {
      var w = s.whatif; if (!w) return;
      s.escenarios[w.escenarioId] = PFSchema.clon(w.base);
      s.whatif = null;
    }, { etiqueta: 'descartar ¿Y si…?' });
  }
  function aplicar() {
    PFStore.update(function (s) { s.whatif = null; }, { etiqueta: 'aplicar ¿Y si…?' });
  }
  function guardarComo(nombre) {
    var nuevoId = PFSchema.uid('s');
    PFStore.update(function (s, e) {
      var w = s.whatif; if (!w) return;
      var nuevo = PFSchema.clon(e);
      nuevo.id = nuevoId; nuevo.nombre = nombre; nuevo.creado = new Date().toISOString();
      s.escenarios[nuevoId] = nuevo;
      s.orden.push(nuevoId);
      s.escenarios[w.escenarioId] = PFSchema.clon(w.base);
      s.whatif = null;
    }, { etiqueta: 'guardar escenario' });
    return nuevoId;
  }
  function quitarPrescindibles() {
    var n = 0;
    PFStore.update(function (s, e) {
      e.partidas.forEach(function (p) { if (p.tipo === 'gasto' && !p.esencial && p.activa !== false) { p.activa = false; n++; } });
    }, { etiqueta: 'quitar prescindibles' });
    return n;
  }

  /** Compara dos escenarios entidad a entidad. Devuelve claves de fila modificadas. */
  function cambios(b, cur) {
    var r = { claves: {}, eliminadas: [], n: 0, otros: [] };
    if (!b) return r;
    function idx(lista) { var o = {}; (lista || []).forEach(function (x) { o[x.id] = x; }); return o; }
    function comparar(listaB, listaC, prefijo, extra) {
      var ib = idx(listaB), ic = idx(listaC);
      (listaC || []).forEach(function (x) {
        var y = ib[x.id];
        if (!y) { r.claves[prefijo + x.id] = 'nuevo'; r.n++; if (extra) extra(x, 'nuevo'); }
        else if (JSON.stringify(x) !== JSON.stringify(y)) { r.claves[prefijo + x.id] = 'mod'; r.n++; if (extra) extra(x, 'mod', y); }
      });
      (listaB || []).forEach(function (y) { if (!ic[y.id]) { r.eliminadas.push(y.nombre); r.n++; } });
    }
    comparar(b.partidas, cur.partidas, 'p:');
    comparar(b.huchas, cur.huchas, 'h:');
    comparar(b.inversiones, cur.inversiones, 'i:');
    comparar(b.deudas, cur.deudas, 'd:', function (x) { r.claves['dx:' + x.id] = r.claves['d:' + x.id]; });
    comparar(b.cuentas, cur.cuentas, 'c:');
    comparar(b.activos, cur.activos, 'a:');
    if (JSON.stringify(b.hipotesis) !== JSON.stringify(cur.hipotesis)) { r.otros.push('hipótesis'); r.n++; }
    if (b.inicio !== cur.inicio) { r.otros.push('mes de inicio'); r.n++; }
    return r;
  }

  return { activo: activo, base: base, activar: activar, descartar: descartar, aplicar: aplicar,
           guardarComo: guardarComo, quitarPrescindibles: quitarPrescindibles, cambios: cambios };
})();
