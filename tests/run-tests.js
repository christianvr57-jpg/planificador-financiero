/* Pruebas del motor financiero. Ejecutar:  node tests/run-tests.js  (sin dependencias) */
'use strict';
var C = require('../js/calc.js');
var F = require('../js/fmt.js');
var S = require('../js/schema.js');

var ok = 0, fallos = 0;
function test(nombre, fn) {
  try { fn(); ok++; console.log('  ✓ ' + nombre); }
  catch (e) { fallos++; console.log('  ✗ ' + nombre + '\n      ' + (e && e.message ? e.message : e)); }
}
function igual(a, b, msg) { if (a !== b) throw new Error((msg || '') + ' esperado ' + JSON.stringify(b) + ', obtenido ' + JSON.stringify(a)); }
function cerca(a, b, tol, msg) { if (Math.abs(a - b) > tol) throw new Error((msg || '') + ' esperado ' + b + ' ±' + tol + ', obtenido ' + a); }
function cierto(x, msg) { if (!x) throw new Error(msg || 'esperado verdadero'); }

/** Escenario mínimo para pruebas. */
function esc(extra) {
  return S.escenario(Object.assign({
    nombre: 'Test', inicio: '2027-01',
    hipotesis: { inflacion: 0.02, subidaSalarial: 0.015 },
    cuentas: [{ nombre: 'Cuenta', saldo: 100000 }],
    partidas: [S.partida({ id: 'nom', nombre: 'Nómina', tipo: 'ingreso', importe: 200000 })]
  }, extra || {}));
}
function ahorroAnual(e) { return C.suma(C.simular(e, { meses: 12 }).m.ahorro, 0, 12); }

console.log('\nPruebas de aceptación');

test('1. Suscripción de 12,99 €/mes → 155,88 €/año; desactivarla sube el ahorro exactamente esa cifra', function () {
  var sus = S.partida({ id: 'netflix', nombre: 'Netflix', tipo: 'gasto', grupo: 'suscripciones', importe: 1299 });
  var e = esc(); e.partidas.push(sus);
  var sim = C.simular(e, { detalleDesde: '2027-01', meses: 12 });
  var anual = C.suma(sim.detalle.filas['p:netflix'].mi);
  igual(anual, 15588, 'coste anual (céntimos)');
  igual(C.anualPartida(sus), 15588, 'anualPartida');
  igual(F.eur(anual), '155,88 €', 'formato');
  var conSus = ahorroAnual(e);
  e.partidas[1].activa = false;
  var sinSus = ahorroAnual(e);
  igual(sinSus - conSus, 15588, 'diferencia de ahorro anual');
  // También empezando a mitad de año (año vista desde octubre): sin subidas en los primeros 12 meses
  var e2 = esc({ inicio: '2026-10' }); e2.partidas.push(S.partida({ id: 'n2', tipo: 'gasto', importe: 1299 }));
  var s2 = C.simular(e2, { detalleDesde: '2026-10', meses: 12 });
  igual(C.suma(s2.detalle.filas['p:n2'].mi), 15588, 'año vista oct–sep');
});

test('2. 200 €/mes 10 años al 7 % → ≈ 34.210 € (aportado 24.000 €), ±2 €', function () {
  var r = C.proyectarInversion({ valor: 0, aportado: 0, aportacion: 20000, rAnual: 0.07, ter: 0, anios: 10 });
  cerca(r.final.valor, 3421000, 200, 'valor final');
  igual(r.final.aportado, 2400000, 'aportado');
  igual(r.filas.length, 11, 'filas (año 0..10)');
});

test('3. Préstamo 10.000 € al 5 % TIN a 60 meses → cuota 188,71 € e intereses ≈ 1.322,74 €', function () {
  igual(C.cuotaFrancesa(1000000, 0.05, 60), 18871, 'cuota');
  var c = C.cuadroAmortizacion({ capital: 1000000, tin: 0.05, plazo: 60, proximaCuota: '2027-01' });
  igual(c.cuota, 18871, 'cuota del cuadro');
  igual(c.meses, 60, 'número de cuotas');
  cerca(c.intereses, 132274, 10, 'intereses totales');
  igual(c.filas[59].pendiente, 0, 'saldo final');
});

test('4. Ganancia de 10.000 € → impuesto 1.980 € (6.000 × 19 % + 4.000 × 21 %)', function () {
  igual(C.impuestoAhorro(1000000), 198000);
  igual(C.impuestoAhorro(0), 0, 'sin ganancia');
  igual(C.impuestoAhorro(-50000), 0, 'pérdidas');
  // 350.000 € → 1.140 + 9.240 + 34.500 + 27.000 + 15.000 = 86.880 €
  igual(C.impuestoAhorro(35000000), 8688000, 'todos los tramos');
});

test('5. Gasto anual de 600 € en marzo: sin hucha solo en marzo; con hucha −50 €/mes y marzo no se dispara', function () {
  var seguro = S.partida({ id: 'seg', nombre: 'Seguro', tipo: 'gasto', grupo: 'periodicos', importe: 60000, frecuencia: 'anual', mesCargo: 3 });
  var e = esc(); e.partidas.push(seguro);
  var sinH = C.simular(e, { meses: 12 }).m.ahorro;
  // enero=0 … marzo=2
  igual(sinH[0], 200000, 'enero sin hucha');
  igual(sinH[2], 200000 - 60000, 'marzo sin hucha');
  for (var t = 0; t < 12; t++) if (t !== 2) igual(sinH[t], 200000, 'mes ' + (t + 1) + ' sin hucha');

  var e2 = esc({ huchas: [S.hucha({ id: 'hs', nombre: 'Seguros', aportacion: 5000 })] });
  e2.partidas.push(Object.assign({}, seguro, { pagadoDesde: 'hs' }));
  var sim2 = C.simular(e2, { meses: 12 });
  for (t = 0; t < 12; t++) igual(sim2.m.ahorro[t], 200000 - 5000, 'mes ' + (t + 1) + ' con hucha');
  igual(C.suma(sim2.m.ahorro, 0, 12), C.suma(sinH, 0, 12), 'mismo ahorro anual (600 = 12 × 50)');
  igual(sim2.porHucha.hs[1], 10000, 'hucha en febrero');
  igual(sim2.porHucha.hs[2], 15000 - 60000, 'la hucha cubre marzo (saldo negativo el primer año)');
  igual(sim2.porHucha.hs[11], 0, 'la hucha vuelve a 0 en diciembre');
});

console.log('\nFrecuencias, fechas y nómina');

test('Bimestral desde noviembre → nov, ene, mar, may, jul, sep', function () {
  var p = { frecuencia: 'bimestral', mesCargo: 11 };
  var meses = [];
  for (var a = C.ym('2026-11'); a < C.ym('2027-11'); a++) if (C.ocurre(p, a)) meses.push(C.mesDe(a));
  igual(meses.join(','), '11,1,3,5,7,9');
  igual(C.mesesDeCargo(p).join(','), '1,3,5,7,9,11');
});
test('Trimestral, semestral, puntual, inicio y fin', function () {
  igual(C.mesesDeCargo({ frecuencia: 'trimestral', mesCargo: 2 }).join(','), '2,5,8,11');
  igual(C.mesesDeCargo({ frecuencia: 'semestral', mesCargo: 4 }).join(','), '4,10');
  cierto(C.ocurre({ frecuencia: 'puntual', fecha: '2027-05' }, C.ym('2027-05')), 'puntual en su mes');
  cierto(!C.ocurre({ frecuencia: 'puntual', fecha: '2027-05' }, C.ym('2028-05')), 'puntual no se repite');
  cierto(!C.ocurre({ frecuencia: 'mensual', inicio: '2027-03' }, C.ym('2027-02')), 'antes del inicio');
  cierto(!C.ocurre({ frecuencia: 'mensual', fin: '2027-03' }, C.ym('2027-04')), 'después del fin');
});
test('Nómina 14 pagas con extras en julio y diciembre', function () {
  var p = S.partida({ tipo: 'ingreso', subtipo: 'nomina', importe: 170000, pagas: 14, mesesExtra: [7, 12] });
  var ctx = { inicio: C.ym('2027-01'), hip: C.hipotesis({}) };
  igual(C.importeMes(p, C.ym('2027-06'), ctx), 170000, 'junio');
  igual(C.importeMes(p, C.ym('2027-07'), ctx), 340000, 'julio');
  igual(C.importeMes(p, C.ym('2027-12'), ctx), 340000, 'diciembre');
  igual(C.anualPartida(p), 2380000, 'anual');
  p.prorratear = true;
  var s = 0; for (var a = C.ym('2027-01'); a <= C.ym('2027-12'); a++) s += C.importeMes(p, a, ctx);
  igual(s, 2380000, 'prorrateada suma lo mismo');
});
test('Ajuste por celda sobrescribe un mes sin cambiar la regla', function () {
  var p = S.partida({ tipo: 'gasto', importe: 10000, ajustes: { '2027-02': { v: 2550, f: '15+10,5' } } });
  var ctx = { inicio: C.ym('2027-01'), hip: C.hipotesis({}) };
  igual(C.importeMes(p, C.ym('2027-02'), ctx), 2550);
  igual(C.importeMes(p, C.ym('2027-03'), ctx), 10000);
});
test('Mi parte (50 %) y subida anual a partir del mes 13', function () {
  var e = esc(); e.partidas.push(S.partida({ id: 'sup', tipo: 'gasto', importe: 40000, miParte: 0.5 }));
  var sim = C.simular(e, { detalleDesde: '2027-01', detalleMeses: 24, meses: 24 });
  igual(sim.detalle.filas['p:sup'].mi[0], 20000, 'mi parte');
  igual(sim.detalle.filas['p:sup'].hogar[0], 40000, 'hogar');
  igual(sim.detalle.filas['p:sup'].hogar[11], 40000, 'sin subida en el mes 12');
  igual(sim.detalle.filas['p:sup'].hogar[12], 40800, '+2 % (inflación) en el mes 13');
});

console.log('\nInversión, deudas y escenarios');

test('TER se resta de la rentabilidad antes de pasar a mensual', function () {
  cerca(C.tasaMensual(0.07, 0.002), Math.pow(1.068, 1 / 12) - 1, 1e-12);
});
test('Valor real = nominal / (1 + inflación)^años', function () {
  var r = C.proyectarInversion({ valor: 1000000, aportado: 1000000, aportacion: 0, rAnual: 0.05, anios: 10, inflacion: 0.02 });
  cerca(r.final.real, Math.round(r.final.valor / Math.pow(1.02, 10)), 1);
});
test('Amortización anticipada reduciendo plazo: menos intereses y menos meses, con comisión', function () {
  var d = { capital: 695700, tin: 0.0949, cuota: 20740, proximaCuota: '2026-11', comision: 0.01, comisionUltimoAnio: 0.005 };
  var sin = C.cuadroAmortizacion(d);
  igual(sin.meses, 40, 'cuotas sin extra (nov-26 → feb-30)');
  igual(F.mesLargo(sin.fin), 'febrero 2030', 'fecha fin');
  var con = C.cuadroAmortizacion(Object.assign({}, d, { extraMensual: 17500 }));
  cierto(con.meses < sin.meses, 'menos meses');
  cierto(con.intereses < sin.intereses, 'menos intereses');
  cierto(con.comisiones > 0, 'con comisión');
  igual(con.filas[0].extra, Math.round(17500 / 1.01), 'capital amortizado = 175 / 1,01');
});
test('Reducir cuota mantiene el plazo y baja la cuota', function () {
  var d = { capital: 1000000, tin: 0.05, plazo: 60, proximaCuota: '2027-01', modo: 'cuota', comision: 0, extraPuntuales: [{ mes: '2027-06', importe: 200000 }] };
  var c = C.cuadroAmortizacion(d);
  igual(c.meses, 60, 'mismo plazo');
  cierto(c.filas[10].cuota < 18871, 'cuota más baja tras la amortización');
});
test('Avalancha paga menos intereses que bola de nieve (o igual)', function () {
  var ds = [
    { id: 'a', nombre: 'Tarjeta', capital: 300000, tin: 0.20, cuota: 15000, proximaCuota: '2027-01', comision: 0, comisionUltimoAnio: 0 },
    { id: 'b', nombre: 'Coche', capital: 800000, tin: 0.06, cuota: 20000, proximaCuota: '2027-01', comision: 0, comisionUltimoAnio: 0 },
    { id: 'c', nombre: 'Pequeño', capital: 100000, tin: 0.08, cuota: 8000, proximaCuota: '2027-01', comision: 0, comisionUltimoAnio: 0 }
  ];
  var av = C.estrategiaDeudas(ds, { orden: 'avalancha', inicio: '2027-01' });
  var bn = C.estrategiaDeudas(ds, { orden: 'bolaNieve', inicio: '2027-01' });
  var ninguna = C.estrategiaDeudas(ds, { inicio: '2027-01' });
  cierto(av.intereses <= bn.intereses, 'avalancha ≤ bola de nieve');
  cierto(av.intereses < ninguna.intereses, 'la cascada ahorra intereses');
  igual(bn.ordenFin[0].id, 'c', 'bola de nieve liquida primero la pequeña');
});
test('¿Amortizar o invertir?: al 9,49 % amortizar gana a invertir al 7 %; equilibrio por encima del TIN', function () {
  var d = { capital: 695700, tin: 0.0949, cuota: 20740, proximaCuota: '2026-11', comision: 0.01, comisionUltimoAnio: 0.005 };
  var r = C.amortizarVsInvertir(d, 17500, 0.07, 0.003, null, { inicio: '2026-10' });
  cierto(r.ventajaAmortizar > 0, 'amortizar es mejor');
  cierto(r.interesesAhorrados > 0, 'intereses ahorrados');
  cierto(r.equilibrio > 0.0949, 'equilibrio > TIN (los impuestos penalizan invertir): ' + r.equilibrio);
});
test('Préstamo para invertir: rentabilidad mínima positiva', function () {
  var d = { capital: 1000000, tin: 0.06, plazo: 60, proximaCuota: '2027-01', comision: 0 };
  var inv = { valor: 1000000, aportado: 1000000, aportacion: 0 };
  var r = C.prestamoInversion(d, inv, 0.07, 0, null, { inicio: '2027-01' });
  cierto(r.rentMinima > 0 && r.rentMinima < 0.07, 'rentabilidad mínima ' + r.rentMinima);
  cierto(r.filas.length === 60, 'filas');
});
test('Diferencias ¿Y si…?: quitar un gasto de 100 €/mes mejora el ahorro anual en 1.200 €', function () {
  var e = esc(); e.partidas.push(S.partida({ id: 'g', tipo: 'gasto', importe: 10000 }));
  var b = C.simular(e);
  var e2 = S.clon(e); e2.partidas[1].activa = false;
  var d = C.diferencias(b, C.simular(e2));
  igual(d.ahorroAnual, 120000);
  igual(d.saldoFin, 120000);
  cierto(d.pat10 >= 1200000, 'patrimonio a 10 años');
});
test('Cuota liberada a inversión al terminar la deuda', function () {
  var e = esc({
    inversiones: [S.inversion({ id: 'f', nombre: 'Fondo', valor: 0, aportado: 0, aportacion: 0, rent: { pes: 0, base: 0, opt: 0 } })],
    deudas: [S.deuda({ id: 'd', capital: 100000, tin: 0, cuota: 10000, proximaCuota: '2027-01', comision: 0 })],
    hipotesis: { destinoLiberadas: 'inversion', invLiberadas: 'f' }
  });
  var sim = C.simular(e, { meses: 24 });
  igual(sim.hitos.deudas.d, C.ym('2027-10'), 'fin de la deuda en la cuota 10');
  igual(sim.m.invLiberada[10], 10000, 'la cuota pasa al fondo el mes siguiente');
  igual(sim.porInversion.f[23], 140000, '14 meses × 100 €');
});

console.log('\nFormato, lectura y esquema');

test('Formato es-ES con punto de miles también en 4 cifras', function () {
  igual(F.eur(123456), '1.234,56 €');
  igual(F.eur(-123456), '−1.234,56 €');
  igual(F.eur0(2380000), '23.800 €');
  igual(F.pct(0.0949, 2), '9,49 %');
});
test('Lectura de importes y expresiones', function () {
  igual(F.leerImporte('1.234,56'), 123456);
  igual(F.leerImporte('12,99'), 1299);
  igual(F.leerImporte('12.99'), 1299);
  igual(F.leerImporte('1.234'), 123400);
  igual(F.leerImporte('40+25,50+12'), 7750);
  igual(F.leerImporte('=3*12,99'), 3897);
  igual(F.leerImporte('-5'), -500);
  igual(F.leerImporte('abc'), null);
  igual(F.leerPct('9,49'), 0.0949);
});
test('Migración de un archivo sin versión y validación', function () {
  var viejo = { partidas: [{ nombre: 'Algo', tipo: 'gasto', importe: 1000 }] };
  var s = S.migrar(viejo);
  igual(s.version, S.VERSION);
  igual(s.escenarios[s.escenarioActivo].partidas[0].nombre, 'Algo');
  var err = null; try { S.migrar({ version: 999, escenarios: {} }); } catch (e) { err = e; }
  cierto(err, 'rechaza versiones futuras');
  err = null; try { S.migrar('hola'); } catch (e) { err = e; }
  cierto(err, 'rechaza basura');
});
test('Datos iniciales: tus datos, sin marcas de ejemplo, y migración v1 → v2', function () {
  var st = S.estadoInicial();
  var e = st.escenarios[st.escenarioActivo];
  var sim = C.simular(e);
  cierto(sim.m.ingresos[9] === 340000, 'julio con paga extra');
  var k = C.kpis(e, sim);
  cierto(k.ingresos === 2380000, 'ingresos 12 meses = 23.800 €');
  cierto(!JSON.stringify(st).includes('"ejemplo"'), 'sin marcas de ejemplo');
  var v1 = S.migrar({ version: 1, escenarios: { a: { nombre: 'X', partidas: [{ nombre: 'Netflix', tipo: 'gasto', importe: 1299, ejemplo: true }] } } });
  igual(v1.version, S.VERSION, 'migrado a la versión actual');
  cierto(v1.escenarios.a.partidas[0].ejemplo === undefined && v1.escenarios.a.partidas[0].importe === 1299, 'conserva la partida y quita la marca');
  cierto(e.partidas.some(function (p) { return p.nombre === 'Nómina'; }), 'conserva la nómina');
  cierto(e.deudas.length === 1 && e.inversiones.length === 2 && e.huchas.length === 2, 'conserva deuda, inversiones y huchas');
  var json = JSON.stringify(st), s2 = S.migrar(JSON.parse(json));
  igual(JSON.stringify(s2.escenarios[s2.escenarioActivo].hipotesis), JSON.stringify(st.escenarios[st.escenarioActivo].hipotesis), 'ida y vuelta JSON');
});
test('Gastos por categoría suman el consumo de 12 meses (incluidos los pagados desde huchas)', function () {
  var st = S.estadoInicial(), e = st.escenarios[st.escenarioActivo];
  var cats = C.gastosPorCategoria(e, 12), suma = 0;
  for (var k in cats) suma += cats[k];
  var kp = C.kpis(e, C.simular(e));
  igual(suma, kp.consumo, 'suma de categorías = consumo');
  cierto(cats.Vacaciones === 120000, 'vacaciones (desde hucha) cuentan como consumo');
});
test('Avisos detectan la hucha de vacaciones corta el primer agosto y el préstamo caro', function () {
  var st = S.estadoInicial(), e = st.escenarios[st.escenarioActivo];
  var sim = C.simular(e), a = C.avisos(e, sim, C.kpis(e, sim));
  cierto(a.some(function (x) { return /Vacaciones/.test(x.titulo) && /negativo/.test(x.titulo); }), 'hucha corta');
  cierto(a.some(function (x) { return /Préstamo personal/.test(x.titulo); }), 'deuda más cara que la inversión');
  cierto(a.some(function (x) { return /Suscripciones/.test(x.titulo); }), 'suscripciones');
});
test('Avisos y KPI no fallan con un escenario vacío', function () {
  var e = S.escenario({ inicio: '2027-01' });
  var sim = C.simular(e);
  var k = C.kpis(e, sim);
  var a = C.avisos(e, sim, k);
  cierto(Array.isArray(a));
});

console.log('\nGastos compartidos (Tricount)');
var T = require('../js/tricount.js');
var P2 = [{ id: 'yo', nombre: 'Christian' }, { id: 'pareja', nombre: 'Laura' }];
function comp(movs, extra) { return S.compartido(Object.assign({ personas: P2, movimientos: movs }, extra || {})); }

test('A medias: pago 60 € → mi pareja me debe 30 €; los céntimos impares se reparten sin perder ninguno', function () {
  var c = comp([{ fecha: '2026-10-01', concepto: 'Súper', importe: 6000, pagadoPor: 'yo' }]);
  var s = T.saldos(c);
  igual(s.yo, 3000); igual(s.pareja, -3000);
  var r = T.reparto({ importe: 1001, pagadoPor: 'yo', reparto: { modo: 'iguales' } }, P2);
  igual(r.yo + r.pareja, 1001, 'suma exacta');
});
test('Reparto por importes, porcentaje y gasto solo de uno', function () {
  igual(JSON.stringify(T.reparto({ importe: 10000, pagadoPor: 'yo', reparto: { modo: 'importes', partes: { yo: 7000, pareja: 3000 } } }, P2)), '{"yo":7000,"pareja":3000}');
  igual(JSON.stringify(T.reparto({ importe: 10000, pagadoPor: 'yo', reparto: { modo: 'porcentaje', partes: { yo: 60, pareja: 40 } } }, P2)), '{"yo":6000,"pareja":4000}');
  var c = comp([{ fecha: '2026-10-02', concepto: 'Regalo para ella', importe: 5000, pagadoPor: 'yo', reparto: { modo: 'iguales', partes: { yo: 0, pareja: 1 } } }]);
  igual(T.saldos(c).yo, 5000, 'todo de la pareja → me debe 50 €');
});
test('Reembolso salda la deuda y las liquidaciones proponen el pago exacto', function () {
  var c = comp([
    { fecha: '2026-10-01', concepto: 'Súper', importe: 8000, pagadoPor: 'yo' },
    { fecha: '2026-10-03', concepto: 'Cena', importe: 3000, pagadoPor: 'pareja' }
  ]);
  var s = T.saldos(c);
  igual(s.yo, 2500, 'me debe 40 − 15 = 25 €');
  var l = T.liquidaciones(s);
  igual(l.length, 1); igual(l[0].de, 'pareja'); igual(l[0].a, 'yo'); igual(l[0].importe, 2500);
  c.movimientos.push({ id: 'r', tipo: 'reembolso', fecha: '2026-10-05', importe: 2500, pagadoPor: 'pareja', para: 'yo' });
  var s2 = T.saldos(c);
  igual(s2.yo, 0, 'en paz'); igual(s2.pareja, 0);
});
test('Saldo de partida, ingresos y resumen mensual', function () {
  var c = comp([
    { fecha: '2026-09-10', concepto: 'Luz', importe: 9000, pagadoPor: 'pareja' },
    { fecha: '2026-10-10', concepto: 'Devolución', tipo: 'ingreso', importe: 2000, pagadoPor: 'pareja' }
  ], { saldoInicial: { yo: 1000, pareja: -1000 } });
  var s = T.saldos(c);
  igual(s.yo, 1000 - 4500 + 1000, 'saldo de partida − mi mitad de la luz + mi mitad de la devolución');
  var pm = T.porMes(c);
  igual(pm.length, 2); igual(pm[0].parte.yo, 4500); igual(pm[1].total, -2000);
  igual(pm[1].saldo.yo, s.yo, 'saldo acumulado a fin de mes');
});
test('Importar CSV exportado de Tricount (pagado por + columnas «Paid for»)', function () {
  var csv = 'Title,Amount,Currency,Exchange rate,Amount in EUR,Paid by,Paid for Christian,Paid for Laura,Date & time,Transaction type,Category\n' +
    '"Mercadona, compra semanal",84.30,EUR,1,84.30,Christian,42.15,42.15,2026-10-04 12:30:00,Normal,Groceries\n' +
    'Cine,20,EUR,1,20,Laura,0,20,05/10/2026,Normal,Entertainment\n' +
    'Pago,25.00,EUR,1,25.00,Laura,25.00,0,2026-10-06,Money transfer,\n' +
    'Roto,abc,EUR,1,abc,Laura,0,0,2026-10-06,Normal,\n';
  var p = T.parseCSV(csv);
  igual(p.filas.length, 4);
  var map = T.detectarColumnas(p.cabecera);
  igual(p.cabecera[map.idx.importe], 'Amount in EUR');
  igual(map.para.length, 2);
  var r = T.convertir({ cab: p.cabecera, filas: p.filas, map: map, personas: P2, personasMap: {}, hoy: '2026-10-26' });
  igual(r.movimientos.length, 3); igual(r.errores.length, 1);
  var m0 = r.movimientos[0];
  igual(m0.concepto, 'Mercadona, compra semanal'); igual(m0.importe, 8430); igual(m0.pagadoPor, 'yo'); igual(m0.fecha, '2026-10-04');
  igual(r.movimientos[1].fecha, '2026-10-05'); igual(T.reparto(r.movimientos[1], P2).pareja, 2000, 'cine solo de Laura');
  igual(r.movimientos[2].tipo, 'reembolso'); igual(r.movimientos[2].para, 'yo');
  var c = comp(r.movimientos);
  igual(T.saldos(c).yo, 4215 - 2500, 'saldo tras importar (el cine era solo de ella)');
});
test('Esquema v3: datos antiguos ganan la sección compartida vacía', function () {
  var s = S.migrar({ version: 2, escenarios: { a: { nombre: 'X' } } });
  igual(s.version, 3);
  igual(s.compartido.personas.length, 2);
  igual(s.compartido.movimientos.length, 0);
});

console.log('\n' + ok + ' correctas, ' + fallos + ' fallidas\n');
process.exit(fallos ? 1 : 0);
