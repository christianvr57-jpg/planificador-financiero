# Planificador financiero personal

Web de una sola página para unificar ingresos, gastos, huchas, inversiones y deudas, y ver cómo cada decisión cambia el ahorro a 12 meses y el patrimonio a 10–40 años.

**Abrir:** https://christianvr57-jpg.github.io/planificador-financiero/ desde cualquier PC. También funciona con doble clic en `index.html` de una copia local.

**Móvil:** se adapta al iPhone (pestañas abajo y el resto de secciones en «Más»; en el presupuesto, toca una celda para editarla y el nombre de la partida para ver sus opciones). En Safari, *Compartir › Añadir a pantalla de inicio* la deja como una app.

**Perfiles:** al abrir la web se elige perfil (Christian o Maribel) y se escribe su contraseña. Los datos de cada perfil se guardan cifrados (AES-GCM, clave derivada de la contraseña con PBKDF2), en el navegador y en la nube: sin la contraseña no se pueden leer. Si se olvida, no hay forma de recuperarlos, así que conviene guardar de vez en cuando una copia en archivo (Ctrl+S). Los «Gastos en pareja» son comunes a los dos perfiles y se fusionan solos. La sesión dura mientras la pestaña esté abierta; el candado de la barra lateral cambia de perfil.

**Nube:** cada cambio se guarda en la rama `datos` de este repositorio (`perfiles/<perfil>.json` cifrado y `compartido.json`) (cada guardado es un commit, así que el historial de la rama guarda todas las versiones). Al abrir la página, al volver a la pestaña y cada 30 s se cargan los cambios hechos en otro PC; si hay cambios en los dos sitios, la app pregunta con cuál quedarse.

Para poder guardar en la nube, cada navegador necesita un token (leer no lo necesita):
1. GitHub › Settings › Developer settings › Fine-grained tokens › *Generate new token* (https://github.com/settings/personal-access-tokens/new).
2. *Repository access*: solo `planificador-financiero`. *Repository permissions* › **Contents: Read and write**.
3. En la app: Ajustes › Nube (GitHub) › pega el token › Conectar. El token se queda solo en ese navegador y nunca se sube.

**Privacidad:** el repositorio es público, así que los datos de la nube los puede ver cualquiera. Sin analítica ni recursos externos (Chart.js va incluido en `lib/`); la política CSP solo permite conectar con `api.github.com`.

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
| 0 | Gastos en pareja (vuestro Tricount: quién pagó, quién debe, importar CSV de Tricount) |
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

Además de la nube, los datos se guardan automáticamente en el navegador. Para tener copias propias:
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
js/perfiles.js        perfiles, contraseña, cifrado y pantalla de acceso
js/cloud.js           sincronización con GitHub (rama «datos»)
js/whatif.js          modo ¿Y si…?
js/tricount.js        gastos compartidos: saldos, liquidaciones e importación CSV
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
