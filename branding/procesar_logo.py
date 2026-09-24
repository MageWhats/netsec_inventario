"""
Genera las variantes del logo que usa la app (public/brand/) a partir de NetSec_Suministros_logo.svg.

El SVG original contiene un PNG de 152x161 px con fondo degradado (blanco arriba, gris abajo).
Este script:
  - quita el fondo degradado (estimándolo fila por fila) y recupera el color de los bordes suavizados,
  - recorta el símbolo con una máscara circular, para conservar la S blanca de su interior,
  - crea la versión en blanco del texto para el tema oscuro de la app,
  - genera favicon e íconos de la app instalable.

Uso (requiere Pillow):  python branding/procesar_logo.py
Si llega una versión del logo en mayor resolución, hay que ajustar las coordenadas de REGIONES.
"""

import base64
import re
from pathlib import Path

from PIL import Image, ImageDraw

RAIZ = Path(__file__).resolve().parent.parent
ORIGEN = RAIZ / "branding" / "NetSec_Suministros_logo.svg"
DESTINO = RAIZ / "public" / "brand"

# Coordenadas en el PNG original (152x161)
SIMBOLO_CENTRO = (78.0, 38.0)
SIMBOLO_RADIO = 33.0
REGIONES = {
    "simbolo": (44, 4, 113, 73),
    "wordmark": (22, 73, 133, 109),  # "Net&Sec" + "SUMINISTROS"
    "completo": (0, 0, 152, 148),    # sin la franja gris inferior vacía
}
BLANCO = (255, 255, 255)
FONDO_ICONO = (255, 255, 255)
SUPERMUESTREO = 4


def cargar_png() -> Image.Image:
    svg = ORIGEN.read_text(encoding="utf-8")
    datos = re.search(r"base64,([^\"']+)", svg).group(1)
    ruta = DESTINO / "_original.png"
    ruta.write_bytes(base64.b64decode(datos))
    imagen = Image.open(ruta).convert("RGB")
    ruta.unlink()
    return imagen


def mascara_circular(tamano: tuple[int, int]) -> Image.Image:
    """Cobertura del círculo del símbolo con bordes suavizados (supermuestreo)."""
    w, h = tamano
    grande = Image.new("L", (w * SUPERMUESTREO, h * SUPERMUESTREO), 0)
    cx, cy, r = (v * SUPERMUESTREO for v in (*SIMBOLO_CENTRO, SIMBOLO_RADIO))
    ImageDraw.Draw(grande).ellipse((cx - r, cy - r, cx + r, cy + r), fill=255)
    return grande.resize((w, h), Image.LANCZOS)


def sin_fondo(imagen: Image.Image, texto_blanco: bool) -> Image.Image:
    """Quita el fondo degradado. Dentro del círculo del símbolo conserva todo (incluida la S blanca)."""
    w, h = imagen.size
    circulo = mascara_circular((w, h))
    salida = Image.new("RGBA", (w, h))
    px, out, circ = imagen.load(), salida.load(), circulo.load()

    for y in range(h):
        fondo = px[0, y]  # el degradado es vertical: la columna 0 es fondo puro
        for x in range(w):
            p = px[x, y]
            a_circulo = circ[x, y] / 255
            if a_circulo > 0:
                # Borde del círculo: se recupera el color sin la mezcla con el fondo
                a = a_circulo
                color = tuple(min(255, max(0, round((c - (1 - a) * f) / a))) for c, f in zip(p, fondo))
                out[x, y] = (*color, round(a * 255))
                continue

            diferencia = max(abs(c - f) for c, f in zip(p, fondo))
            a = min(1.0, max(0.0, (diferencia - 10) / 90))
            if a == 0:
                out[x, y] = (0, 0, 0, 0)
                continue
            if texto_blanco:
                color = BLANCO
            else:
                color = tuple(min(255, max(0, round((c - (1 - a) * f) / a))) for c, f in zip(p, fondo))
            out[x, y] = (*color, round(a * 255))
    return salida


def sobre_fondo(imagen: Image.Image, fondo: tuple[int, int, int]) -> Image.Image:
    base = Image.new("RGBA", imagen.size, (*fondo, 255))
    base.alpha_composite(imagen)
    return base


def icono(simbolo: Image.Image, lado: int, proporcion: float, fondo=FONDO_ICONO) -> Image.Image:
    """Símbolo centrado sobre un cuadrado; proporcion = parte del lado que ocupa el símbolo."""
    lienzo = Image.new("RGBA", (lado, lado), (*fondo, 255) if fondo else (0, 0, 0, 0))
    tam = round(lado * proporcion)
    s = simbolo.resize((tam, tam), Image.LANCZOS)
    lienzo.alpha_composite(s, ((lado - tam) // 2, (lado - tam) // 2))
    return lienzo


def main() -> None:
    DESTINO.mkdir(parents=True, exist_ok=True)
    original = cargar_png()
    color = sin_fondo(original, texto_blanco=False)
    blanco = sin_fondo(original, texto_blanco=True)

    simbolo = color.crop(REGIONES["simbolo"])
    simbolo.save(DESTINO / "simbolo.png")
    blanco.crop(REGIONES["wordmark"]).save(DESTINO / "wordmark-blanco.png")
    blanco.crop(REGIONES["completo"]).save(DESTINO / "logo-blanco.png")
    # Para imprimir (papel blanco): colores originales sobre blanco puro
    sobre_fondo(color.crop(REGIONES["completo"]), BLANCO).convert("RGB").save(DESTINO / "logo-color.png")

    icono(simbolo, 64, 1.0, fondo=None).save(DESTINO / "favicon.png")
    icono(simbolo, 180, 0.78).convert("RGB").save(DESTINO / "apple-touch-icon.png")
    icono(simbolo, 192, 0.78).save(DESTINO / "icon-192.png")
    icono(simbolo, 512, 0.78).save(DESTINO / "icon-512.png")
    # Android recorta los íconos "maskable" en círculo: el símbolo va dentro de la zona segura (80 %)
    icono(simbolo, 512, 0.62).save(DESTINO / "icon-maskable-512.png")
    print("Variantes generadas en", DESTINO)


if __name__ == "__main__":
    main()
