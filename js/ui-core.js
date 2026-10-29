/* =============================================================================
   ui-core.js · Piezas comunes de interfaz
   -----------------------------------------------------------------------------
   · morph(): aplica un HTML nuevo sobre el DOM existente parcheando solo lo que
     cambia, de modo que el foco, el cursor, el scroll y los deslizadores que se
     están arrastrando no se pierden al recalcular.
   · Delegación de eventos: data-act="accion" (clic/teclado) y formularios
     data-form="tipo" data-id="…" con campos data-f="campo" data-t="tipo".
   · Componentes (interruptor, segmentado, deslizador, KPI), avisos emergentes,
     modales de confirmación, tooltips y atajos de teclado.
   ============================================================================= */
var PFUI = (function () {
  'use strict';
  var F = PFFmt, h = PFFmt.html;
  var secciones = {}, acciones = {}, formularios = {};

  // ------------------------------------------------------------- Morph DOM ---
  function morph(el, html) {
    var tpl = document.createElement('template');
    tpl.innerHTML = html;
    morphHijos(el, tpl.content);
  }
  function mismo(a, b) {
    if (a.nodeType !== b.nodeType) return false;
    if (a.nodeType !== 1) return true;
    if (a.nodeName !== b.nodeName) return false;
    if (a.getAttribute('data-key') !== b.getAttribute('data-key')) return false;
    if (a.nodeName === 'INPUT' && a.getAttribute('type') !== b.getAttribute('type')) return false;
    return true;
  }
  function morphHijos(desde, hacia) {
    var fc = desde.firstChild, tc = hacia.firstChild;
    while (tc) {
      var sigT = tc.nextSibling;
      if (!fc) desde.appendChild(tc);
      else if (mismo(fc, tc)) { morphNodo(fc, tc); fc = fc.nextSibling; }
      else { var sigF = fc.nextSibling; desde.replaceChild(tc, fc); fc = sigF; }
      tc = sigT;
    }
    while (fc) { var n = fc.nextSibling; desde.removeChild(fc); fc = n; }
  }
  function morphNodo(a, b) {
    if (a.nodeType === 3 || a.nodeType === 8) { if (a.nodeValue !== b.nodeValue) a.nodeValue = b.nodeValue; return; }
    if (a.nodeName === 'CANVAS' || a.hasAttribute('data-keep')) return;
    var i, n, aa = a.attributes, ba = b.attributes;
    for (i = aa.length - 1; i >= 0; i--) { n = aa[i].name; if (!b.hasAttribute(n)) a.removeAttribute(n); }
    for (i = 0; i < ba.length; i++) if (a.getAttribute(ba[i].name) !== ba[i].value) a.setAttribute(ba[i].name, ba[i].value);
    var tag = a.nodeName;
    if (tag === 'INPUT') {
      if (a.type === 'checkbox' || a.type === 'radio') a.checked = b.hasAttribute('checked');
      else if (document.activeElement !== a) { var v = b.getAttribute('value') || ''; if (a.value !== v) a.value = v; }
      return;
    }
    if (tag === 'TEXTAREA') { if (document.activeElement !== a && a.value !== b.textContent) a.value = b.textContent; return; }
    morphHijos(a, b);
    if (tag === 'SELECT' && b.hasAttribute('data-value') && document.activeElement !== a) a.value = b.getAttribute('data-value');
  }

  // ------------------------------------------------------------ Registro ---
  function seccion(id, def) { secciones[id] = def; }
  function accion(nombre, fn) { acciones[nombre] = fn; }
  function formulario(nombre, fn) { formularios[nombre] = fn; }

  // --------------------------------------------------------- Componentes ---
  function attrs(o) {
    var s = '';
    for (var k in o) if (o[k] != null && o[k] !== false) s += ' ' + k + (o[k] === true ? '' : '="' + h(o[k]) + '"');
    return s;
  }
  /** Interruptor accesible. */
  function sw(on, a, etiqueta) {
    return '<button type="button" class="sw' + (on ? ' on' : '') + '" role="switch" aria-checked="' + !!on + '"' + attrs(a || {}) +
      (etiqueta ? ' aria-label="' + h(etiqueta) + '"' : '') + '><span class="sw-t"></span></button>';
  }
  /** Control segmentado: opciones [{id, nombre}], valor, atributos comunes (data-act / data-f). */
  function seg(opciones, valor, a, clase) {
    return '<div class="seg' + (clase ? ' ' + clase : '') + '" role="group">' + opciones.map(function (o) {
      var on = String(o.id) === String(valor);
      return '<button type="button" class="seg-b' + (on ? ' on' : '') + '" aria-pressed="' + on + '" data-v="' + h(o.id) + '"' + attrs(a || {}) +
        (o.tip ? ' data-tip="' + h(o.tip) + '"' : '') + '>' + h(o.nombre) + '</button>';
    }).join('') + '</div>';
  }
  /**
   * Deslizador con valor editable. o: {f, t ('rng-eur'|'rng-pct'|'rng-int'), min, max, step, valor (unidades del deslizador),
   * etiqueta, texto (valor formateado), sub}
   */
  function slider(o) {
    return '<div class="sl">' +
      '<div class="sl-h"><label class="sl-l" for="' + h(o.idEl || '') + '">' + h(o.etiqueta) + '</label>' +
      '<input class="sl-v in" data-f="' + h(o.f) + '" data-t="' + h(o.tv || 'txt') + '" value="' + h(o.texto) + '" aria-label="' + h(o.etiqueta) + '"></div>' +
      '<input type="range"' + (o.idEl ? ' id="' + h(o.idEl) + '"' : '') + ' data-f="' + h(o.f) + '" data-t="' + h(o.t) + '" min="' + o.min + '" max="' + o.max + '" step="' + o.step + '" value="' + o.valor + '">' +
      (o.sub ? '<div class="sl-sub">' + o.sub + '</div>' : '') + '</div>';
  }
  /** Tarjeta de KPI. tono: pos|neg|warn|null */
  function kpi(etiqueta, valor, sub, tono, tip) {
    return '<div class="kpi' + (tono ? ' ' + tono : '') + '"' + (tip ? ' data-tip="' + h(tip) + '"' : '') + '>' +
      '<div class="kpi-l">' + h(etiqueta) + '</div><div class="kpi-v">' + valor + '</div>' +
      (sub ? '<div class="kpi-s">' + sub + '</div>' : '') + '</div>';
  }
  function delta(c, opts) {
    opts = opts || {};
    if (c == null) return '—';
    var cls = c > 0 ? 'pos' : c < 0 ? 'neg' : 'cero';
    if (opts.inverso) cls = c > 0 ? 'neg' : c < 0 ? 'pos' : 'cero';
    return '<span class="delta ' + cls + '">' + (c === 0 ? '±0 €' : F.eur(c, { signo: true, dec: opts.dec == null ? 0 : opts.dec })) + '</span>';
  }
  function opcionesSelect(lista, valor) {
    return lista.map(function (o) { return '<option value="' + h(o.id) + '"' + (String(o.id) === String(valor) ? ' selected' : '') + '>' + h(o.nombre) + '</option>'; }).join('');
  }
  function select(f, lista, valor, extra) {
    return '<select class="in" data-f="' + h(f) + '" data-t="sel" data-value="' + h(valor == null ? '' : valor) + '"' + (extra || '') + '>' + opcionesSelect(lista, valor) + '</select>';
  }
  function campoEur(f, c, extra) {
    return '<input class="in num" data-f="' + h(f) + '" data-t="eur" inputmode="decimal" value="' + (c == null ? '' : F.numero(c / 100, 2)) + '"' + (extra || '') + '>';
  }
  function campoPct(f, x, dec, extra) {
    return '<input class="in num" data-f="' + h(f) + '" data-t="pct" inputmode="decimal" value="' + (x == null ? '' : F.numero(x * 100, dec == null ? 2 : dec)) + '"' + (extra || '') + '>';
  }
  function icono(nombre) {
    var p = {
      mas: 'M8 3v10M3 8h10', x: 'M4 4l8 8M12 4l-8 8', deshacer: 'M5 6H10a3 3 0 0 1 0 6H7M5 6l2.5-2.5M5 6l2.5 2.5',
      rehacer: 'M11 6H6a3 3 0 0 0 0 6h3M11 6L8.5 3.5M11 6L8.5 8.5', guardar: 'M3 3h8l2 2v8H3zM5 3v3h5V3M5 13v-4h6v4',
      abrir: 'M2 5h4l1.5-1.5H14V13H2zM2 7h12', caret: 'M5 6l3 3 3-3', luna: 'M11.5 10.5A5 5 0 0 1 6 4a5 5 0 1 0 5.5 6.5z',
      sol: 'M8 5a3 3 0 1 1 0 6 3 3 0 0 1 0-6zM8 1v2M8 13v2M1 8h2M13 8h2M3 3l1.4 1.4M11.6 11.6L13 13M3 13l1.4-1.4M11.6 4.4L13 3',
      papelera: 'M3 4h10M6 4V3h4v1M4.5 4l.7 9h5.6l.7-9', copiar: 'M5 5h7v8H5zM4 11H3V3h7v1', editar: 'M3 13l1-3 7-7 2 2-7 7zM10 4l2 2',
      info: 'M8 7v4M8 5v.5M8 1.5a6.5 6.5 0 1 1 0 13 6.5 6.5 0 0 1 0-13', alerta: 'M8 2l6.5 11.5h-13zM8 6.5v3.5M8 11.8v.4',
      ok: 'M3.5 8.5l3 3 6-6.5', candado: 'M4.5 7.5h7v5.5h-7zM6 7.5V5.5a2 2 0 0 1 4 0v2', flecha: 'M6 4l4 4-4 4', flechaI: 'M10 4L6 8l4 4',
      hucha: 'M3 8a5 4 0 0 1 10 0v3H3zM6 5.5h4M5 11v2M11 11v2', grip: 'M6 4h.01M10 4h.01M6 8h.01M10 8h.01M6 12h.01M10 12h.01', lupa: 'M7 3a4 4 0 1 1 0 8 4 4 0 0 1 0-8zM10 10l3.5 3.5',
      inicio: 'M2.5 7.5L8 3l5.5 4.5M4 6.5V13h3v-3.5h2V13h3V6.5', tabla: 'M2.5 3h11v10h-11zM2.5 6.5h11M2.5 9.75h11M6.5 3v10',
      pareja: 'M5.5 7.5a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM1.5 13a4 4 0 0 1 8 0M11 7.5a1.75 1.75 0 1 0 0-3.5 1.75 1.75 0 0 0 0 3.5M10.5 9.6A3.5 3.5 0 0 1 14.5 13', menu: 'M2.5 4h11M2.5 8h11M2.5 12h11'
    }[nombre] || '';
    return '<svg class="ico" viewBox="0 0 16 16" aria-hidden="true"><path d="' + p + '"/></svg>';
  }

  // -------------------------------------------------------------- Tooltip ---
  var tipEl, tipT, tipObjetivo;
  function mostrarTip(el) {
    var txt = el.getAttribute('data-tip'), rico = el.getAttribute('data-tip-html');
    if (!txt && !rico) return;
    tipObjetivo = el;
    if (rico) tipEl.innerHTML = rico; else { tipEl.textContent = ''; txt.split('\n').forEach(function (l, i) { if (i) tipEl.appendChild(document.createElement('br')); tipEl.appendChild(document.createTextNode(l)); }); }
    tipEl.hidden = false;
    var r = el.getBoundingClientRect(), t = tipEl.getBoundingClientRect();
    var x = Math.min(window.innerWidth - t.width - 8, Math.max(8, r.left + r.width / 2 - t.width / 2));
    var y = r.bottom + 6;
    if (y + t.height > window.innerHeight - 8) y = r.top - t.height - 6;
    tipEl.style.left = x + 'px'; tipEl.style.top = y + 'px';
  }
  function ocultarTip() { clearTimeout(tipT); tipObjetivo = null; if (tipEl) tipEl.hidden = true; }

  // ---------------------------------------------------------------- Toasts ---
  function toast(msg, o) {
    o = o || {};
    var root = document.getElementById('toasts');
    var t = document.createElement('div');
    t.className = 'toast' + (o.tipo ? ' ' + o.tipo : '');
    t.setAttribute('role', 'status');
    var span = document.createElement('span'); span.textContent = msg; t.appendChild(span);
    if (o.accion) {
      var b = document.createElement('button'); b.type = 'button'; b.className = 'btn-link'; b.textContent = o.accion;
      b.onclick = function () { o.fn(); t.remove(); };
      t.appendChild(b);
    }
    root.appendChild(t);
    setTimeout(function () { t.classList.add('fuera'); setTimeout(function () { t.remove(); }, 300); }, o.ms || 4000);
  }

  // --------------------------------------------------------------- Modales ---
  function modal(contenidoHTML, alAbrir) {
    return new Promise(function (resolver) {
      var d = document.createElement('dialog');
      d.className = 'modal';
      d.innerHTML = contenidoHTML;
      document.body.appendChild(d);
      var hecho = false;
      function cerrar(v) { if (hecho) return; hecho = true; d.close(); d.remove(); resolver(v); }
      d.addEventListener('cancel', function (e) { e.preventDefault(); cerrar(null); });
      d.addEventListener('click', function (e) {
        var b = e.target.closest('[data-res]');
        if (b) {
          var r = b.getAttribute('data-res');
          cerrar(r === 'ok' ? (alAbrir && alAbrir.valor ? alAbrir.valor(d) : true) : r === 'no' ? null : r);
        }
        else if (e.target === d) cerrar(null);
      });
      d.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' && e.target.tagName === 'INPUT') { e.preventDefault(); cerrar(alAbrir && alAbrir.valor ? alAbrir.valor(d) : true); }
      });
      d.showModal();
      if (alAbrir && alAbrir.foco) { var f = d.querySelector(alAbrir.foco); if (f) { f.focus(); if (f.select) f.select(); } }
    });
  }
  function confirmar(o) {
    return modal('<h2>' + h(o.titulo) + '</h2>' + (o.texto ? '<p>' + h(o.texto) + '</p>' : '') + (o.html || '') +
      '<div class="modal-acc"><button type="button" class="btn" data-res="no">' + h(o.cancelar || 'Cancelar') + '</button>' +
      '<button type="button" class="btn ' + (o.peligro ? 'peligro' : 'prim') + '" data-res="ok" autofocus>' + h(o.ok || 'Aceptar') + '</button></div>')
      .then(function (r) { return !!r; });
  }
  function pedirTexto(o) {
    return modal('<h2>' + h(o.titulo) + '</h2>' + (o.texto ? '<p>' + h(o.texto) + '</p>' : '') +
      '<input class="in ancho" id="modal-txt" value="' + h(o.valor || '') + '" maxlength="80">' +
      '<div class="modal-acc"><button type="button" class="btn" data-res="no">Cancelar</button>' +
      '<button type="button" class="btn prim" data-res="ok">' + h(o.ok || 'Aceptar') + '</button></div>',
      { foco: '#modal-txt', valor: function (d) { var v = d.querySelector('#modal-txt').value.trim(); return v || null; } });
  }
  function info(titulo, html) {
    return modal('<h2>' + h(titulo) + '</h2>' + html + '<div class="modal-acc"><button type="button" class="btn prim" data-res="ok" autofocus>Cerrar</button></div>');
  }

  // ------------------------------------------------- Lectura de campos -----
  /** Convierte el valor de un campo según su tipo data-t. Devuelve {ok, v}. */
  function leerCampo(el) {
    var t = el.getAttribute('data-t') || 'txt', v = el.value;
    switch (t) {
      case 'txt': return { ok: true, v: v };
      case 'eur': { var c = F.leerImporte(v); return c == null ? { ok: false, msg: 'Importe no válido' } : { ok: true, v: c }; }
      case 'eurNull': { if (!v.trim()) return { ok: true, v: null }; var c2 = F.leerImporte(v); return c2 == null ? { ok: false, msg: 'Importe no válido' } : { ok: true, v: c2 }; }
      case 'pct': { var p = F.leerPct(v); return p == null ? { ok: false, msg: 'Porcentaje no válido' } : { ok: true, v: p }; }
      case 'pctNull': { if (!v.trim()) return { ok: true, v: null }; var p2 = F.leerPct(v); return p2 == null ? { ok: false, msg: 'Porcentaje no válido' } : { ok: true, v: p2 }; }
      case 'int': { var n = parseInt(v, 10); return isFinite(n) ? { ok: true, v: n } : { ok: false, msg: 'Número no válido' }; }
      case 'num': { var x = F.evaluar(v); return x == null ? { ok: false, msg: 'Número no válido' } : { ok: true, v: x }; }
      case 'mes': return { ok: true, v: /^\d{4}-\d{2}$/.test(v) ? v : null };
      case 'sel': return { ok: true, v: v };
      case 'chk': return { ok: true, v: el.checked };
      case 'rng-eur': return { ok: true, v: Math.round(+v * 100) };
      case 'rng-pct': return { ok: true, v: Math.round(+v * 1000) / 100000 };
      case 'rng-int': return { ok: true, v: +v };
      default: return { ok: true, v: v };
    }
  }
  function despacharCampo(el, ev) {
    var form = el.closest('[data-form]');
    if (!form) return;
    var fn = formularios[form.getAttribute('data-form')];
    if (!fn) return;
    var r = leerCampo(el);
    if (!r.ok) { toast(r.msg, { tipo: 'error' }); PFApp.render(); return; }
    fn(form.getAttribute('data-id'), el.getAttribute('data-f'), r.v, el, ev);
    // Un importe escrito como suma o fórmula se muestra ya calculado
    var t = el.getAttribute('data-t');
    if ((t === 'eur' || t === 'eurNull') && r.v != null) el.value = F.numero(r.v / 100, 2);
  }

  // --------------------------------------------------------- Delegación -----
  function enlazar() {
    tipEl = document.getElementById('tip');
    var tactil = window.matchMedia && window.matchMedia('(hover: none)');
    document.addEventListener('click', function (e) {
      if (tactil && tactil.matches) {
        var dbl = e.target.closest('[data-dbl]');
        if (dbl && !e.target.closest('[data-act]')) { var fd = acciones[dbl.getAttribute('data-dbl')]; if (fd) { ocultarTip(); fd(dbl, e); } return; }
      }
      var el = e.target.closest('[data-act]');
      if (el && !el.disabled) {
        var fn = acciones[el.getAttribute('data-act')];
        if (fn) { e.preventDefault(); ocultarTip(); fn(el, e); }
        return;
      }
      // Botones de segmentado / interruptores que editan un campo
      var b = e.target.closest('.seg-b[data-f], .sw[data-f]');
      if (b && !b.disabled) {
        var form = b.closest('[data-form]');
        var fn2 = form && formularios[form.getAttribute('data-form')];
        if (!fn2) return;
        var v = b.classList.contains('sw') ? !b.classList.contains('on') : b.getAttribute('data-v');
        var t = b.getAttribute('data-t');
        if (t === 'num') v = +v; else if (t === 'bool') v = v === 'true' || v === true;
        fn2(form.getAttribute('data-id'), b.getAttribute('data-f'), v, b, e);
      }
    });
    document.addEventListener('dblclick', function (e) {
      var el = e.target.closest('[data-dbl]');
      if (el) { var fn = acciones[el.getAttribute('data-dbl')]; if (fn) fn(el, e); }
    });
    document.addEventListener('change', function (e) {
      var el = e.target;
      if (el.matches('[data-f]') && !el.classList.contains('seg-b')) despacharCampo(el, e);
    });
    document.addEventListener('input', function (e) {
      var el = e.target;
      if (el.type === 'range' && el.matches('[data-f]')) despacharCampo(el, e);
    });
    document.addEventListener('mouseover', function (e) {
      var el = e.target.closest('[data-tip],[data-tip-html]');
      if (el === tipObjetivo) return;
      clearTimeout(tipT);
      if (!el) { ocultarTip(); return; }
      tipT = setTimeout(function () { mostrarTip(el); }, 280);
    });
    document.addEventListener('focusin', function (e) {
      var el = e.target.closest && e.target.closest('[data-tip],[data-tip-html]');
      if (el && el.matches(':focus-visible')) { clearTimeout(tipT); tipT = setTimeout(function () { mostrarTip(el); }, 400); }
      else ocultarTip();
    });
    document.addEventListener('scroll', ocultarTip, true);
    window.addEventListener('blur', ocultarTip);
  }

  // ------------------------------------------------------------- Atajos -----
  function escribiendo(el) {
    if (!el) return false;
    if (el.isContentEditable) return true;
    var t = el.tagName;
    if (t === 'TEXTAREA' || t === 'SELECT') return true;
    if (t === 'INPUT') return ['range', 'checkbox', 'radio', 'button'].indexOf(el.type) < 0;
    return false;
  }

  return {
    secciones: secciones, acciones: acciones, formularios: formularios,
    morph: morph, seccion: seccion, accion: accion, formulario: formulario,
    sw: sw, seg: seg, slider: slider, kpi: kpi, delta: delta, select: select, opcionesSelect: opcionesSelect,
    campoEur: campoEur, campoPct: campoPct, icono: icono, attrs: attrs,
    toast: toast, confirmar: confirmar, pedirTexto: pedirTexto, info: info, modal: modal,
    leerCampo: leerCampo, enlazar: enlazar, ocultarTip: ocultarTip, escribiendo: escribiendo
  };
})();
