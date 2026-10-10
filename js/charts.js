/* =============================================================================
   charts.js · Envoltorio de Chart.js con los colores del tema
   -----------------------------------------------------------------------------
   Los colores salen de las variables CSS (claro/oscuro). Los gráficos se crean
   o actualizan por id de <canvas> y se destruyen cuando su canvas desaparece.
   ============================================================================= */
var PFCharts = (function () {
  'use strict';
  var inst = {};
  var F = PFFmt;

  function css(v) { return getComputedStyle(document.documentElement).getPropertyValue(v).trim(); }
  function tema() {
    var s = [];
    for (var i = 1; i <= 8; i++) s.push(css('--s' + i));
    return {
      ink: css('--ink'), ink2: css('--ink-2'), ink3: css('--ink-3'), grid: css('--grid'), axis: css('--axis'),
      surface: css('--surface'), line: css('--line'), s: s, pos: css('--pos-mark'), neg: css('--neg-mark'),
      wash: function (hex, a) { return alfa(hex, a); }
    };
  }
  function alfa(hex, a) {
    hex = (hex || '#888').replace('#', '');
    if (hex.length === 3) hex = hex.split('').map(function (c) { return c + c; }).join('');
    var n = parseInt(hex, 16);
    return 'rgba(' + ((n >> 16) & 255) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + a + ')';
  }

  /** Plugin: líneas verticales de hitos con etiqueta (options.plugins.hitos.items = [{x, etiqueta}]) */
  var pluginHitos = {
    id: 'hitos',
    afterDatasetsDraw: function (chart, args, o) {
      if (!o || !o.items || !o.items.length) return;
      var ctx = chart.ctx, xs = chart.scales.x, area = chart.chartArea, t = tema();
      ctx.save();
      ctx.font = '11px ' + getComputedStyle(document.body).fontFamily;
      var usados = [];
      o.items.forEach(function (it) {
        var x = xs.getPixelForValue(it.x);
        if (!(x >= area.left && x <= area.right)) return;
        ctx.strokeStyle = t.axis; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(Math.round(x) + 0.5, area.top + 14); ctx.lineTo(Math.round(x) + 0.5, area.bottom); ctx.stroke();
        ctx.fillStyle = t.ink2;
        var w = ctx.measureText(it.etiqueta).width;
        var fila = 0;
        while (usados.some(function (u) { return u.fila === fila && Math.abs(u.x - x) < (u.w + w) / 2 + 8; })) fila++;
        usados.push({ x: x, w: w, fila: fila });
        var tx = Math.min(area.right - w / 2, Math.max(area.left + w / 2, x));
        ctx.textAlign = 'center';
        ctx.fillText(it.etiqueta, tx, area.top + 10 + fila * 13);
        ctx.fillStyle = it.color || t.ink2;
        ctx.beginPath(); ctx.arc(x, area.top + 14 + fila * 13 + 3, 0, 0, 7); ctx.fill();
      });
      ctx.restore();
    }
  };

  /** Opciones comunes: sin animación, hover por índice, ejes discretos, euros. */
  function opciones(o) {
    o = o || {};
    var t = tema();
    var fmtY = o.fmtY || function (v) { return F.eurCorto(v * 100); };
    var fmtTip = o.fmtTip || function (v) { return F.eur(Math.round(v * 100), { dec: o.decTip == null ? 0 : o.decTip }); };
    var op = {
      responsive: true, maintainAspectRatio: false, animation: false,
      interaction: { mode: o.modo || 'index', intersect: false, axis: o.ejeHover || 'x' },
      layout: { padding: { top: o.padTop || 4, right: 6 } },
      plugins: {
        legend: {
          display: o.leyenda !== false, position: 'top', align: 'start',
          labels: { color: t.ink2, boxWidth: 12, boxHeight: 8, useBorderRadius: true, borderRadius: 2, padding: 14, font: { size: 12 },
                    filter: o.filtroLeyenda || null }
        },
        tooltip: {
          backgroundColor: t.surface, titleColor: t.ink, bodyColor: t.ink2, borderColor: t.line, borderWidth: 1,
          padding: 10, boxPadding: 4, usePointStyle: true, titleFont: { weight: '600' },
          callbacks: {
            label: function (c) { return ' ' + c.dataset.label + ': ' + fmtTip(c.parsed.y != null ? c.parsed.y : c.parsed); },
            labelPointStyle: function () { return { pointStyle: 'line', rotation: 0 }; }
          },
          filter: o.filtroTip || null
        },
        hitos: { items: o.hitos || [] }
      },
      scales: {
        x: { grid: { display: false }, border: { color: t.axis }, stacked: !!o.apilado,
             ticks: { color: t.ink3, maxRotation: 0, autoSkip: true, autoSkipPadding: 12, font: { size: 11 } } },
        y: { grid: { color: t.grid }, border: { display: false }, stacked: !!o.apilado, beginAtZero: o.desdeCero !== false, grace: o.holgura || 0,
             ticks: { color: t.ink3, callback: fmtY, font: { size: 11 }, maxTicksLimit: 6 } }
      }
    };
    if (o.horizontal) {
      op.indexAxis = 'y';
      op.scales = {
        x: { grid: { color: t.grid }, border: { display: false }, beginAtZero: true, ticks: { color: t.ink3, callback: fmtY, font: { size: 11 }, maxTicksLimit: 6 } },
        y: { grid: { display: false }, border: { color: t.axis }, ticks: { color: t.ink2, font: { size: 12 } } }
      };
      op.interaction = { mode: 'nearest', intersect: true, axis: 'y' };
      op.plugins.tooltip.callbacks.label = function (c) { return ' ' + fmtTip(c.parsed.x); };
    }
    return op;
  }
  /** Estilo de serie según el tipo de marca (líneas 2 px, barras finas con extremo redondeado). */
  function serie(tipo, color, extra) {
    var t = tema(), d;
    if (tipo === 'line') d = { type: 'line', borderColor: color, backgroundColor: color, borderWidth: 2, pointRadius: 0, pointHoverRadius: 4,
                               pointHoverBorderWidth: 2, pointHoverBorderColor: t.surface, tension: 0, borderJoinStyle: 'round', borderCapStyle: 'round' };
    else if (tipo === 'area') d = { type: 'line', borderColor: color, backgroundColor: alfa(color, 0.14), fill: true, borderWidth: 2, pointRadius: 0,
                                    pointHoverRadius: 4, pointHoverBorderWidth: 2, pointHoverBorderColor: t.surface, tension: 0 };
    else d = { type: 'bar', backgroundColor: color, hoverBackgroundColor: color, borderRadius: { topLeft: 4, topRight: 4 }, borderSkipped: 'start',
               maxBarThickness: 22, categoryPercentage: 0.72, barPercentage: 0.86, borderWidth: 0 };
    return Object.assign(d, extra || {});
  }

  function upsert(id, config) {
    var cv = document.getElementById(id);
    if (!cv || typeof Chart === 'undefined') return null;
    config.plugins = (config.plugins || []).concat([pluginHitos]);
    var c = inst[id];
    if (c && c.canvas !== cv) { c.destroy(); c = null; delete inst[id]; }
    if (c && c.config.type === config.type) {
      c.data = config.data; c.options = config.options; c.update('none');
    } else {
      if (c) c.destroy();
      inst[id] = new Chart(cv, config);
    }
    return inst[id];
  }
  function limpiar(forzar) {
    for (var k in inst) {
      if (forzar || !document.body.contains(inst[k].canvas)) { inst[k].destroy(); delete inst[k]; }
    }
  }

  return { tema: tema, alfa: alfa, opciones: opciones, serie: serie, upsert: upsert, limpiar: limpiar };
})();
