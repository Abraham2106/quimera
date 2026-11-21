# demo-hvac-1000 (sintético)

Generado con `npx tsx scripts/generate-fixtures.ts --seed 20261121`.

## Archivos (7 fuentes de datos + manifiesto)

| Archivo | Descripción |
|---------|-------------|
| `clientes.xlsx` | Libro multi-hoja (Clientes, Contactos, Saldos) |
| `ventas_2025.csv` | Ventas 2025, delimitador `;`, UTF-8 con acentos |
| `pagos.csv` | Pagos y referencias |
| `equipos_hvac.csv` | Equipos por cliente |
| `inventario.csv` | Repuestos en bodega |
| `notas.csv` | Notas de crédito/débito |
| `fe/*.xml` | Mínimo 2 comprobantes marcados `quimera:fe-sample` (no válidos para SDK productivo) |

## Anomalías sembradas (ver `ANOMALIES.json`)

- 40 grupos de cliente repetido bajo nombres variantes
- 12 facturas duplicadas (mismo número)
- 7 pagos atribuidos a cliente distinto del de la factura
- 3 pares misma razón social con identificaciones distintas
- 1 saldo declarado que no cuadra con facturas − pagos

**Cero datos personales reales de Costa Rica.** Identificaciones `9XXXXXXXXX`, teléfonos `8888-XXXX`, dominios `*.invalid`.
