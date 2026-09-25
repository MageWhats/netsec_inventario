"""
Alerta de stock bajo por correo (la ejecuta .github/workflows/alerta-stock.yml).

Consulta en modo SOLO LECTURA los productos activos sin stock o en/por debajo del mínimo y, si hay alguno,
envía un correo (HTML + texto) por SMTP. Sin dependencias externas: usa psql y la biblioteca estándar.

Variables de entorno:
  SUPABASE_DB_URL        conexión a la base de datos (la misma de las copias de seguridad)
  SMTP_USUARIO           cuenta que envía (p. ej. una cuenta de Gmail)
  SMTP_CLAVE             contraseña de aplicación de esa cuenta
  ALERTA_DESTINATARIOS   opcional: correos separados por coma (por defecto, SMTP_USUARIO)
  SMTP_SERVIDOR          opcional: smtp.gmail.com
  SMTP_PUERTO            opcional: 465 (SSL)
  APP_URL                opcional: https://netsec-inventario.vercel.app
  FORZAR_ENVIO           opcional: "true" envía el correo aunque no haya productos por reponer

Prueba sin base de datos ni correo:  python scripts/alerta_stock.py --prueba > alerta.html
"""

import csv
import html
import io
import os
import smtplib
import ssl
import subprocess
import sys
from datetime import datetime, timedelta, timezone
from email.message import EmailMessage
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

APP_URL = os.environ.get("APP_URL", "https://netsec-inventario.vercel.app").rstrip("/")
ZONA = timezone(timedelta(hours=-5))  # Colombia, sin horario de verano
PARAMETROS_NO_PSQL = {"pgbouncer", "connection_limit", "pool_timeout", "statement_cache_size", "schema"}

CONSULTA = """
select
  p.id,
  p.sku,
  p.nombre,
  coalesce(c.nombre, 'Sin categoría') as categoria,
  coalesce(s.cantidad, 0)             as stock,
  p.stock_minimo
from public.productos p
left join public.categorias c on c.id = p.categoria_id
left join (
  select producto_id, sum(cantidad)::int as cantidad from public.stock_actual group by producto_id
) s on s.producto_id = p.id
where p.activo and coalesce(s.cantidad, 0) <= p.stock_minimo
order by coalesce(s.cantidad, 0) - p.stock_minimo, p.nombre
"""

EJEMPLO = [
    {"id": "00000000-0000-0000-0000-000000000001", "sku": "CAM-IP-4MP", "nombre": "Cámara IP 4MP domo",
     "categoria": "Cámaras de seguridad", "stock": "0", "stock_minimo": "5"},
    {"id": "00000000-0000-0000-0000-000000000002", "sku": "SW-8P-POE", "nombre": "Switch 8 puertos PoE <b>",
     "categoria": "Switches", "stock": "2", "stock_minimo": "4"},
    {"id": "00000000-0000-0000-0000-000000000003", "sku": "CBL-UTP-C6", "nombre": "Cable UTP Cat6 (caja 305 m)",
     "categoria": "Cableado", "stock": "3", "stock_minimo": "3"},
]


def url_para_psql(url):
    # Supabase a veces da la URI con parámetros de Prisma (p. ej. ?pgbouncer=true) que psql rechaza
    partes = urlsplit(url)
    parametros = [(k, v) for k, v in parse_qsl(partes.query, keep_blank_values=True) if k not in PARAMETROS_NO_PSQL]
    return urlunsplit(partes._replace(query=urlencode(parametros)))


def consultar():
    # Dos comandos separados (compatibles con cualquier versión de psql): la sesión queda en SOLO LECTURA
    # y después se consulta. Así el script no puede modificar nada aunque la consulta cambie.
    proceso = subprocess.run(
        ["psql", url_para_psql(os.environ["SUPABASE_DB_URL"]), "--csv", "--quiet", "--no-psqlrc", "-v", "ON_ERROR_STOP=1",
         "-c", "SET default_transaction_read_only = on", "-c", CONSULTA],
        capture_output=True, text=True,
    )
    if proceso.returncode != 0:
        # psql sale con 2 si no pudo conectarse y con 3 si falló la consulta; se muestra su mensaje real
        print(proceso.stderr.strip(), file=sys.stderr)
        tipo = "no pudo conectarse a la base de datos" if proceso.returncode == 2 else "la consulta falló"
        print(f"::error::psql {tipo} (código {proceso.returncode}). Ver el mensaje de arriba.")
        sys.exit(1)
    salida = proceso.stdout
    # Por si psql imprime la etiqueta del SET, se descarta: quedan solo las filas del CSV
    lineas = [l for l in salida.splitlines() if l != "SET"]
    return list(csv.DictReader(io.StringIO("\n".join(lineas))))


def armar_correo(filas):
    sin_stock = [f for f in filas if int(f["stock"]) <= 0]
    bajo_minimo = [f for f in filas if int(f["stock"]) > 0]
    fecha = datetime.now(ZONA).strftime("%d/%m/%Y")
    e = html.escape  # todo dato de la base de datos se escapa antes de ir al HTML

    def tabla(titulo, color, grupo):
        if not grupo:
            return ""
        filas_html = "".join(
            f"""<tr>
              <td style="padding:8px 10px;border-bottom:1px solid #e5e7eb">
                <a href="{e(APP_URL)}/productos/{e(f['id'])}" style="color:#042a67;font-weight:600;text-decoration:none">{e(f['nombre'])}</a>
                <div style="color:#6b7280;font-size:12px;font-family:monospace">{e(f['sku'])} · {e(f['categoria'])}</div>
              </td>
              <td style="padding:8px 10px;border-bottom:1px solid #e5e7eb;text-align:right;font-weight:700;color:{color}">{int(f['stock'])}</td>
              <td style="padding:8px 10px;border-bottom:1px solid #e5e7eb;text-align:right;color:#374151">{int(f['stock_minimo'])}</td>
              <td style="padding:8px 10px;border-bottom:1px solid #e5e7eb;text-align:right;color:#374151">{max(int(f['stock_minimo']) - int(f['stock']), 0)}</td>
            </tr>"""
            for f in grupo
        )
        return f"""
          <h2 style="font-size:16px;margin:24px 0 8px;color:{color}">{titulo} ({len(grupo)})</h2>
          <table role="presentation" style="width:100%;border-collapse:collapse;font-size:14px">
            <tr style="background:#f3f4f6;color:#374151;font-size:12px;text-transform:uppercase">
              <th style="padding:8px 10px;text-align:left">Producto</th>
              <th style="padding:8px 10px;text-align:right">Stock</th>
              <th style="padding:8px 10px;text-align:right">Mínimo</th>
              <th style="padding:8px 10px;text-align:right">Faltan</th>
            </tr>
            {filas_html}
          </table>"""

    cuerpo_html = f"""<!doctype html>
<html lang="es"><body style="margin:0;background:#f3f4f6;font-family:Arial,Helvetica,sans-serif;color:#111827">
  <div style="max-width:640px;margin:0 auto;padding:24px 16px">
    <div style="background:#ffffff;border-radius:12px;padding:24px">
      <table role="presentation" style="border-collapse:collapse"><tr>
        <td style="padding:0 12px 0 0;vertical-align:middle">
          <img src="{e(APP_URL)}/brand/icon-192.png" width="44" height="44" alt="Net&amp;Sec" style="display:block;border-radius:8px">
        </td>
        <td style="vertical-align:middle">
          <div style="font-size:18px;font-weight:700;color:#042a67">Net&amp;Sec Suministros</div>
          <div style="font-size:13px;color:#6b7280">Alerta de inventario · {fecha}</div>
        </td>
      </tr></table>
      <p style="font-size:15px;margin:20px 0 0">
        {'Hay <b>' + str(len(filas)) + '</b> producto(s) por reponer.' if filas else 'Todos los productos están por encima de su stock mínimo.'}
      </p>
      {tabla('Sin stock', '#dc2626', sin_stock)}
      {tabla('En o por debajo del mínimo', '#d97706', bajo_minimo)}
      <p style="margin:28px 0 0">
        <a href="{e(APP_URL)}/productos?stock=bajo"
           style="display:inline-block;background:#0772c7;color:#ffffff;padding:10px 18px;border-radius:8px;text-decoration:none;font-weight:600">
          Ver productos por reponer
        </a>
      </p>
    </div>
    <p style="font-size:12px;color:#6b7280;text-align:center;margin:16px 0 0">
      Enviado automáticamente de lunes a sábado. Solo llega cuando hay productos por reponer.
    </p>
  </div>
</body></html>"""

    lineas_texto = [f"Net&Sec Suministros · Alerta de inventario · {fecha}", ""]
    for titulo, grupo in (("SIN STOCK", sin_stock), ("EN O POR DEBAJO DEL MÍNIMO", bajo_minimo)):
        if grupo:
            lineas_texto.append(f"{titulo} ({len(grupo)})")
            lineas_texto += [f"- {f['nombre']} ({f['sku']}): stock {f['stock']}, mínimo {f['stock_minimo']}" for f in grupo]
            lineas_texto.append("")
    lineas_texto.append(f"Ver en la app: {APP_URL}/productos?stock=bajo")

    asunto = (
        f"Inventario: {len(sin_stock)} sin stock y {len(bajo_minimo)} bajo el mínimo · {fecha}"
        if filas else f"Inventario en orden · {fecha}"
    )
    return asunto, "\n".join(lineas_texto), cuerpo_html


def enviar(asunto, texto, cuerpo_html):
    usuario = os.environ["SMTP_USUARIO"]
    destinatarios = [d.strip() for d in os.environ.get("ALERTA_DESTINATARIOS", "").split(",") if d.strip()] or [usuario]
    mensaje = EmailMessage()
    mensaje["Subject"] = asunto
    mensaje["From"] = f"Net&Sec Inventario <{usuario}>"
    mensaje["To"] = ", ".join(destinatarios)
    mensaje.set_content(texto)
    mensaje.add_alternative(cuerpo_html, subtype="html")

    servidor = os.environ.get("SMTP_SERVIDOR", "smtp.gmail.com")
    puerto = int(os.environ.get("SMTP_PUERTO", "465"))
    with smtplib.SMTP_SSL(servidor, puerto, context=ssl.create_default_context()) as smtp:
        smtp.login(usuario, os.environ["SMTP_CLAVE"])
        smtp.send_message(mensaje)
    print(f"Correo enviado a {len(destinatarios)} destinatario(s).")


def main():
    if "--prueba" in sys.argv:
        _, _, cuerpo_html = armar_correo(EJEMPLO)
        sys.stdout.write(cuerpo_html)
        return

    filas = consultar()
    print(f"Productos por reponer: {len(filas)}")
    if not filas and os.environ.get("FORZAR_ENVIO", "").lower() != "true":
        print("Nada que reponer: no se envía correo.")
        return
    enviar(*armar_correo(filas))


if __name__ == "__main__":
    main()
