# Planificador financiero personal

Web de una sola página para unificar ingresos, gastos, huchas, inversiones y deudas, y ver cómo cada decisión cambia el ahorro a 12 meses y el patrimonio a 10–40 años.

**Abrir:** doble clic en `index.html`. Funciona sin servidor y sin internet (Chrome o Edge recomendados para «Guardar en archivo»).

**Privacidad:** ningún dato sale del PC. Sin analítica ni recursos externos; Chart.js va incluido en `lib/`. Una política CSP impide al navegador hacer conexiones de red.

> Las proyecciones son estimaciones basadas en tus hipótesis, no garantías ni asesoramiento financiero personalizado.

## Secciones

| Tecla | Sección |
|---|---|
| 1 | Resumen: indicadores, gráficos y avisos |
| 2 | Presupuesto 12 meses |
| 3 / W | Modo ¿Y si…? |
| 4 | Inversiones |
| 5 | Deudas |
| 6 | Huchas y objetivos |
| 7 | Patrimonio y largo plazo |
| 8 | Escenarios |
| 9 | Ajustes |

Otros atajos: `N` nueva partida · `Ctrl+Z` / `Ctrl+Y` deshacer y rehacer · `Ctrl+S` guardar en archivo · `Ctrl+O` abrir · `?` ayuda.

En la tabla del presupuesto:
- **Moverse:** flechas o Tab.
- **Editar:** Enter, F2 o empezar a escribir.
- **Sumar varios gastos en un mes:** escribe `40+25,50`.
- **Aplicar el importe a todos los meses:** Mayús+Enter.
- **Volver a la regla:** Supr.
- **Cambiar un gasto de grupo:** arrástralo por el asa (⠿, a la izquierda del interruptor) a otro grupo, entre dos filas para reordenar, o sobre una hucha para que se pague desde ella.

## Copias de seguridad

Los datos se guardan automáticamente en el navegador. Si borras los datos del navegador, se pierden, así que:
- **Guardar en archivo (Ctrl+S)** reescribe siempre el mismo archivo.
- **Exportar JSON** descarga una copia con la fecha.

La aplicación avisa si pasan más de 7 días sin copia.

## Estructura

```
index.html            página (scripts clásicos: funciona con file://)
css/styles.css        estilos, tema claro y oscuro
lib/                  Chart.js 4.5.1 (MIT)
js/calc.js            motor financiero: funciones puras, sin DOM, exportable a Node
js/fmt.js             formato es-ES (1.234,56 €) y lectura de importes y sumas
js/schema.js          esquema, valores por defecto, migraciones y datos iniciales
js/store.js           estado, deshacer/rehacer, autoguardado, copias
js/whatif.js          modo ¿Y si…?
js/ui-*.js, app.js    interfaz
tests/run-tests.js    pruebas
docs/MODELO-DATOS.md  modelo de datos y definiciones de cálculo
```

## Pruebas

```bash
node tests/run-tests.js
```

Incluyen las cinco pruebas de aceptación:
1. Suscripción de 12,99 €/mes → 155,88 €/año.
2. 200 €/mes al 7 % durante 10 años → 34.210 €.
3. Préstamo de 10.000 € al 5 % a 60 meses → cuota 188,71 € e intereses 1.322,74 €.
4. Impuesto de 1.980 € sobre una ganancia de 10.000 €.
5. Gasto anual de 600 € con y sin hucha.
