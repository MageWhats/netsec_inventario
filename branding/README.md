# Identidad de Net&Sec Suministros

Archivos **vectoriales** del logo: se pueden ampliar a cualquier tamaño (valla, camiseta, vehículo) sin perder
nitidez. Se abren en Illustrator, Inkscape, Figma, Canva, CorelDRAW o en el navegador.

| Archivo | Uso |
|---|---|
| `logo-color.svg` | Logo principal (símbolo, nombre y eslogan) sobre fondos claros |
| `logo-blanco.svg` | Mismo logo con el texto en blanco, para fondos oscuros o fotos |
| `logo-horizontal-color.svg` | Símbolo a la izquierda y nombre a la derecha, para encabezados y firmas |
| `logo-horizontal-blanco.svg` | Versión horizontal sobre fondos oscuros |
| `simbolo.svg` | Solo el símbolo: redes sociales, íconos, sellos |
| `simbolo-plano.svg` | Símbolo sin sombreado 3D (degradado simple): bordado, vinilo de corte, grabado y tamaños muy pequeños |
| `NetSec_Suministros_logo.svg` | Archivo original recibido (contiene una imagen PNG de 152×161 px) |

Los archivos de `public/brand/` son copias que usa la app, junto con los íconos PNG para el teléfono,
generados a partir de `simbolo.svg`.

## Cómo se hicieron

El original solo existía como imagen de baja resolución, así que el logo se **redibujó en vectores**:

- **Símbolo:** la S blanca está trazada a mano con curvas Bézier sobre la forma original. El sombreado 3D se
  reconstruye con 14 niveles de tono medidos en el original y suavizados con un desenfoque vectorial.
- **"Net&Sec":** tipografía **Montserrat Bold**, con las letras juntas (−0,12 em), convertida a trazos.
- **"SUMINISTROS":** **Montserrat SemiBold**, con letras muy espaciadas.
- **Eslogan:** **Kaushan Script**, que es la tipografía libre más parecida. **No es idéntica** a la del
  original: si el diseñador indica cuál usó, se puede reemplazar.

Montserrat y Kaushan Script son tipografías libres (SIL Open Font License) de Google Fonts.

## Colores

| Color | Hex | Dónde |
|---|---|---|
| Azul marino | `#042A67` | "Net" y "Sec" |
| Azul | `#069EE9` | "&" |
| Gris azulado | `#3B4F7D` | "SUMINISTROS" |
| Azul eslogan | `#1E5EA8` | Eslogan y subrayado |
| Cian del símbolo | `#19C1F7` → `#002154` | Degradado del símbolo (de claro a oscuro) |
| Azul de la app | `#0772C7` | Botones y resaltados de la app (`src/index.css`) |
