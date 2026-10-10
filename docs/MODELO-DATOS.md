# Modelo de datos

Versión del esquema: **2** (`PFSchema.VERSION`). Todo se guarda como un único objeto JSON en `localStorage` (clave `planificador-financiero/estado`) y es el mismo formato que se exporta o se guarda en archivo.

## Convenciones

| Qué | Cómo se guarda | Ejemplo |
|---|---|---|
| Importes | Céntimos, enteros | `1.234,56 €` → `123456` |
| Porcentajes y tasas | Decimal | `9,49 %` → `0.0949`; mi parte `50 %` → `0.5` |
| Meses | Texto `AAAA-MM` | `2026-11` |
| Identificadores | Texto único por escenario | `p…`, `h…`, `i…`, `d…` |

Internamente, el motor (`js/calc.js`) trabaja con meses como índice absoluto (`año·12 + mes − 1`) para evitar problemas de zona horaria.

## Estado

```js
{
  app: 'planificador-financiero',
  version: 1,
  ajustes: {
    tema: 'claro' | 'oscuro' | 'sistema',
    escalaAhorro: [{ hasta: 600000, tipo: 0.19 }, …, { hasta: null, tipo: 0.30 }],
    rentPorClase: { indexado: {pes, base, opt}, cripto: {…}, remunerada: {…}, otro: {…} }
  },
  escenarios: { [id]: Escenario },
  orden: [id, …],                    // orden de los escenarios
  escenarioActivo: id,
  whatif: null | { escenarioId, desde, base: Escenario },   // modo ¿Y si…?: copia congelada
  seguimiento: [{ mes, liquido, huchas, inversiones, deudas, otros, nota }],  // real vs plan
  meta: { creado, modificado, ultimaCopia }
}
```

El estado de la interfaz (sección visible, grupos plegados, horizonte de los gráficos…) se guarda aparte (`planificador-financiero/ui`), no entra en las copias y no se deshace con Ctrl+Z.

## Escenario

Copia completa y con nombre de todo el plan.

```js
{
  id, nombre, creado,
  inicio: 'AAAA-MM',               // mes 1 del presupuesto y de las proyecciones
  hipotesis: {
    inflacion: 0.02,               // sube gastos y descuenta a euros de hoy
    subidaSalarial: 0.015,         // sube ingresos
    pctExcedente: 0,               // % del ahorro mensual positivo que se invierte
    destinoExcedente: idInversion | null,
    destinoLiberadas: 'caja' | 'inversion' | 'deudas',   // cuotas que quedan libres al acabar una deuda
    invLiberadas: idInversion | null,
    ordenDeudas: 'avalancha' | 'bolaNieve',
    escenarioRent: 'pes' | 'base' | 'opt',                // rentabilidad usada en la proyección
    horizonte: 40,
    rentDefecto: 0.07              // para el coste de oportunidad de cada gasto
  },
  partidas: [Partida], huchas: [Hucha], inversiones: [Inversion],
  deudas: [Deuda], cuentas: [Cuenta], activos: [Activo]
}
```

## Partida (ingreso o gasto)

| Campo | Tipo | Significado |
|---|---|---|
| `nombre`, `categoria`, `notas` | texto | |
| `tipo` | `ingreso` \| `gasto` | |
| `grupo` | `ingresos` \| `fijos` \| `suscripciones` \| `variables` \| `periodicos` | Grupo de la tabla |
| `importe` | céntimos | Importe **total del hogar** por cargo |
| `frecuencia` | `mensual` \| `bimestral` \| `trimestral` \| `semestral` \| `anual` \| `puntual` | |
| `mesCargo` | 1–12 | Mes ancla: bimestral desde noviembre → nov, ene, mar… |
| `fecha` | `AAAA-MM` | Solo para `puntual` |
| `inicio`, `fin` | `AAAA-MM` \| null | Vigencia opcional |
| `activa` | sí/no | Interruptor de la fila |
| `esencial` | sí/no | Esencial (colchón) o prescindible («Quitar lo prescindible») |
| `miParte` | 0–1 | Lo que te corresponde de un gasto compartido |
| `subida` | decimal \| null | Subida anual propia; `null` = inflación (gastos) o subida salarial (ingresos) |
| `pagadoDesde` | idHucha \| null | Si lo paga una hucha, no sale de la cuenta ese mes |
| `ajustes` | `{ 'AAAA-MM': { v, f? } }` | Ajuste por celda: `v` en céntimos (hogar), `f` la suma escrita (`40+25,50`) |

**Nómina** (`subtipo: 'nomina'`): `importe` es la neta mensual; además `pagas` (12 o 14), `mesesExtra` (por defecto `[6, 12]`; en tus datos `[7, 12]`), `importeExtra` (vacío = igual que la neta) y `prorratear`.

Las subidas anuales se aplican cada 12 meses desde el mes de inicio del plan, así los primeros 12 meses muestran tus importes actuales.

## Hucha

| Campo | Significado |
|---|---|
| `tipo` | `hucha` (propia) o `bote` (común con otras personas) |
| `aportacion` | Tu aportación mensual (sale de tu cuenta) |
| `aportacionOtros` | Solo bote: lo que aportan los demás (vista Hogar) |
| `saldoInicial` | Saldo actual (en un bote, el total) |
| `objetivo`, `fechaObjetivo` | Objetivo opcional |
| `inicio`, `fin`, `activa`, `ajustes`, `notas` | Como en las partidas (los ajustes cambian la aportación de un mes) |

Los gastos que se pagan desde una hucha son partidas con `pagadoDesde = id`.

## Inversión

| Campo | Significado |
|---|---|
| `clase` | `indexado`, `cripto`, `remunerada`, `otro` |
| `valor`, `aportado` | Valor actual y total aportado (la ganancia es la diferencia) |
| `aportacion`, `crecimiento` | Aportación mensual y su subida anual |
| `extraordinarias` | `[{ id, mes, importe }]` |
| `rent` | `{ pes, base, opt }` rentabilidad anual efectiva antes de comisiones |
| `ter` | Comisión anual |
| `liquida` | Cuenta para el colchón (cuentas remuneradas) |
| `activa` | Aportaciones activas (el valor sigue contando aunque se pausen) |

## Deuda

| Campo | Significado |
|---|---|
| `capital`, `tin`, `cuota` | Capital pendiente, TIN nominal anual y cuota del recibo |
| `proximaCuota` | Mes de la próxima cuota |
| `fin` | Fin según contrato (solo para comprobar que cuadra) |
| `plazo` | Cuotas restantes, solo si no se indica cuota |
| `comision`, `comisionUltimoAnio` | Comisión por amortización anticipada (más de 12 cuotas restantes / 12 o menos) |
| `extraMensual`, `extraDesde`, `extraHasta`, `extraActiva` | Amortización anticipada periódica (incluye la comisión) |
| `extraPuntuales` | `[{ id, mes, importe }]` |
| `modo` | `plazo` (mantener cuota) o `cuota` (mantener plazo) |
| `inversionVinculada` | Préstamo para invertir |

Si cuota, capital y TIN no cuadran exactamente, manda la cuota del recibo y el plazo se calcula (la última cuota se ajusta).

## Cuenta y activo

- **Cuenta**: `nombre`, `saldo`, `liquida`. La suma de las cuentas es el saldo inicial del presupuesto.
- **Activo**: `nombre`, `tipo` (`vivienda`, `vehiculo`, `otro`), `valor`, `variacion` anual, `incluir` en el patrimonio.

## Migraciones

`PFSchema.MIGRACIONES[n]` transforma un estado de versión `n` en versión `n + 1`. Al leer (localStorage, archivo o importación) se aplican en cadena y después `normalizar()` rellena valores por defecto y limpia referencias rotas. Un archivo de una versión más nueva se rechaza con un aviso. Si los datos guardados están dañados, se conserva una copia aparte en `localStorage` y se arranca con los datos iniciales.

## Definiciones de cálculo

- **Ahorro del mes** = ingresos − gastos pagados desde la cuenta − aportaciones a huchas − cuotas y amortizaciones − aportaciones a inversión. Saldo en cuenta = saldo inicial + Σ ahorro.
- **Tasa de ahorro** = (ahorro + inversión + capital amortizado) / ingresos. Las huchas cuentan como gasto aplazado.
- **Gastos (consumo)** = gastos pagados desde la cuenta + gastos pagados desde huchas.
- **Inversión**: rentabilidad anual efectiva − TER, pasada a mensual con (1 + r)^(1/12) − 1; aportaciones a final de mes.
- **Préstamos**: interés mensual = TIN / 12; cuota = C·i / (1 − (1 + i)^−n).
- **Valor real** = nominal / (1 + inflación)^años.
- **Impuesto al vender**: escala del ahorro sobre (valor − aportado). En la cartera total se compensan ganancias y pérdidas.
- **Colchón** = (cuentas líquidas + cuentas remuneradas) / (gastos esenciales + cuotas de deuda) al mes.
- **Independencia financiera** = gasto anual × 25; se alcanza cuando inversiones + cuenta − deudas, en euros de hoy, lo superan.
