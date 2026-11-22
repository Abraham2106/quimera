---
version: 1
slug: "web-src-app-tsx"
primary_target: "web/src/App.tsx"
related_targets: []
---

## Direction contract

THESIS: El tablero de órdenes del taller. Cada orden es una tarjeta sujeta con una pinza a una columna de etapa; el espacio de trabajo se organiza por el avance físico del trabajo, no por una lista plana ni por un panel de métricas. Rechazamos el dashboard de tarjetas de iconos y el "hero-metric" de la categoría.

OWN-WORLD: Tablero de pinzas y cartulinas manila. Fondo de corcho o malla ahumada en neutro cálido, tarjetas manila con borde completo y clip metálico en la esquina, tinta negra, un acento industrial para la etapa activa y color de estado solo cuando significa algo (alerta, aprobación, sin red). Tipos: sans de trabajo condensado para rótulos y monoespaciado tabular para folios, colones y CAByS. Sin gradientes, sin glass, sin sombras de offset duro.

STORY: El técnico entra y sabe dónde está cada orden sin leer una leyenda. Las columnas son etapas; la tarjeta se mueve de columna cuando la orden avanza. La aprobación del cliente es una pinza que no se suelta: sin ese registro la orden no pasa a cierre. La procedencia de un dato migrado se consulta desde la propia tarjeta.

FIRST VIEWPORT: Shell con navegación de seis secciones y la acción «+ Nueva orden» siempre visible. El área de trabajo son columnas de etapa con cabeceras fijas y tarjetas de orden sujetas; arriba, búsqueda y filtros por palabras. La tarjeta seleccionada se lava en gris. Movimiento insignia: al cambiar de etapa la tarjeta se reordena en su columna y el clip se desplaza con ella, en un solo gesto ease-out.

FORM: Tablero del taller, mi pick (mundo #2 de la lista ordenada del oficio); gana sobre el roll por identificación con el usuario y claridad de producto. seed:4f71b4f5ec9ea491.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
