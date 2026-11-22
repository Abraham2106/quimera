# DESIGN — OficiOS

<!-- impeccable:design-schema 1 -->

Sistema visual del mundo **tablero de pinzas del taller**. El tablero aporta solo tipo,
paleta, densidad y un movimiento propio; la navegación y los controles son los
estándares de la plataforma. Contrato de dirección: `.impeccable/surfaces/web-src-app-tsx.md`.

## Paleta (tokens en `web/src/index.css`)

| Token | Valor | Uso |
| --- | --- | --- |
| `--surface-canvas` | `#d8cdb6` | Corcho ahumado del tablero |
| `--surface-card` | `#f4ead3` | Cartulina manila de tarjetas y paneles |
| `--surface-rail` | `#2e2a23` | Marco del tablero / navegación |
| `--ink` | `#1b1917` | Tinta principal |
| `--ink-muted` | `#645b4e` | Datos secundarios (contraste AA sobre manila) |
| `--accent` | `#274c5e` | Etapa activa, acción primaria, selección |
| `--clip-metal` | `#9aa1a1` | Pinza de la tarjeta |
| `--status-done` / `--status-now` / `--status-warn` | tintas verdes / azul / ámbar | Solo cuando el estado lo significa |

Sin gradientes, sin glass y sin sombras de offset duro. Profundidad con desplazamiento
suave (`0 2px 6px`, `0 12px 24px -16px`).

## Tipografía

Red Hat Display para rótulos y encabezados; Red Hat Text para cuerpo; pila tabular
`ui-monospace, "Cascadia Mono", "Segoe UI Mono", "Red Hat Text", monospace` para folios,
colones y códigos CAByS. Fuentes autoalojadas en `web/public/fonts`: ninguna petición a CDN.

## Componentes

- **Tarjeta de orden** (`.clip-card`): cartulina manila, borde completo, clip metálico
  centrado arriba. Folio en cifras tabulares, cliente, serie y estado. Seleccionada:
  lavado gris (`--p-surface`).
- **Columna de etapa** (`.board-column`): siete columnas según `STEPS`, con cabecera y
  conteo. El tablero se desplaza horizontalmente; en móvil muestra dos columnas y permite
  arrastrar el resto.
- **Rail**: marco oscuro; la sección activa es una tarjeta con clip sobre el tablero.
- **Botones**: `btn-primary` (accent), `btn-secondary` (borde), `btn-warn` (ámbar).
  Radio 6 px, realimentación de pulsación `scale(0.97)` en 160 ms, foco visible de 2 px.
- **Campos y banners**: borde completo, radio 6 px, tinta del estado sobre fondo teñido.

## Movimiento

Una sola mano propia: al cambiar de etapa, la tarjeta se asienta en su columna
(`card-settle`, 220 ms ease-out) y el clip se desplaza con ella (180 ms ease-out).
El drawer usa `--ease-drawer` (320 ms). Sin animación en acciones de teclado.
`prefers-reduced-motion` anula transiciones y animaciones.

## Accesibilidad y ergonomía

Objetivos táctiles ≥ 44×44 px (`.touch`); campos a 16 px en puntero grueso;
contraste AA; navegación por teclado con `focus-visible`; español `es-CR`;
funcionamiento 100 % offline. Hover solo bajo `(hover: hover) and (pointer: fine)`.

## Procedencia

Capturas de verificación: `.impeccable/review/desktop.png` y `.impeccable/review/mobile.png`,
tomadas con `impeccable first-viewport` a viewport 1440×900 y 390×844 (el archivo móvil
captura la página completa, de modo que es más alto que el viewport). Sin datos: PostgreSQL
no estaba disponible en el entorno de verificación. `first-viewport`: todos los checks OK;
tramo vacío máximo 59 px en escritorio. Detector `impeccable detect --json`: sin hallazgos.
Revisión de cierre: **ship** (5/5 hallazgos corregidos).
