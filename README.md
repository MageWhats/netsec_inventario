# Net&Sec Inventario

App web de inventario de Net&Sec Suministros.

**Producción:** https://netsec-inventario.vercel.app

## Despliegue

- **Vercel** publica automáticamente cada push a `main` del repositorio (privado) en GitHub. `vercel.json` hace que
  todas las rutas sirvan la app.
- Las variables `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY` se configuran en Vercel → Project Settings →
  Environment Variables. Si cambian, hay que volver a desplegar (*Redeploy*).
- En Supabase → Authentication → URL Configuration, la *Site URL* es la dirección de producción.
- Las **migraciones SQL no se aplican solas**: cuando haya una nueva en `supabase/migrations/`, ejecútala en el
  SQL Editor de Supabase **antes** de subir el código que la usa.

## Stack

- **Vite + React 19 + TypeScript**
- **Tailwind CSS v4** (tema en `src/index.css`)
- **Supabase** (Postgres, Auth, RLS)
- **TanStack Query** (datos del servidor) y **TanStack Table** (tablas)
- **React Hook Form + Zod** (formularios y validación)
- **React Router 7**, **Recharts**, **lucide-react**
- **jsPDF** (remisiones y reportes en PDF), **read-excel-file** (importación desde Excel)
- **vite-plugin-pwa** (app instalable) y **Vitest** + **PGlite** (pruebas)

## Puesta en marcha

```bash
npm install
cp .env.example .env.local   # rellena las claves de Supabase
npm run dev
```

## Base de datos

Las migraciones están en `supabase/migrations/` y se ejecutan **en orden** en Supabase → SQL Editor:

1. `0001_esquema_inicial.sql`: perfiles, catálogos, productos, unidades, movimientos y RLS.
2. `0002_clientes_y_movimientos.sql`: clientes, datos de proveedores, consecutivo de movimientos y la función
   `registrar_movimiento()`.
3. `0003_toma_inventario.sql`: tomas de inventario físico y las funciones para contar, escanear seriales y
   finalizar (genera los ajustes con `registrar_movimiento()`).
4. `0004_costo_en_salidas.sql`: las salidas y ajustes − guardan el costo del momento, para calcular el margen exacto.
5. `0005_auditoria.sql`: historial de cambios (quién, cuándo, qué) en productos, clientes, proveedores, categorías,
   bodegas, usuarios y MAC/notas de unidades. Se consulta en Reportes → Historial de cambios.
6. `0006_validaciones.sql`: reglas de formato y largo en la base de datos (las mismas de los formularios).
7. `0007_fotos_productos.sql`: espacio de fotos de productos en Supabase Storage (solo *admin* sube;
   máximo 2 MB; JPG, PNG o WebP).
8. `0008_consecutivo_por_tipo.sql`: cada serie de movimientos lleva su propio consecutivo: E (entradas),
   S (salidas) y A (ajustes + y −). Renumera los movimientos existentes.
9. `0009_costo_promedio.sql`: costo promedio ponderado. El precio de costo lo calcula la base de datos con cada
   entrada (ya no se edita a mano) y las salidas y ajustes − salen a ese promedio. Recalcula el costo actual de cada
   producto con su historial, sin tocar los movimientos ya registrados.
10. `0010_motivos_ajuste.sql`: el motivo de los ajustes pasa a una lista cerrada (las notas quedan como detalle) y
    las devoluciones de cliente se enlazan con la venta original: toman su factura electrónica y solo reingresan lo
    que salió en esa venta, al costo con el que salió.
11. `0011_colores.sql`: productos con colores. Una familia guarda los datos comunes (nombre, categoría, marca,
    precio…) y cada color es un producto con su propio SKU, stock y costo. Los datos comunes solo se editan en la
    familia y se copian a sus colores.
12. `0012_configuracion.sql`: categorías y bodegas se gestionan desde Configuración. Una categoría con productos no se
    puede borrar, no se repiten nombres (sin importar mayúsculas) y siempre queda al menos una bodega activa.
13. `0013_usuarios_y_roles.sql`: roles *admin*, *bodega* y *lectura* (ver [Usuarios y roles](#usuarios-y-roles)).
    Los perfiles guardan el correo y si están activos; un usuario desactivado pierde el acceso de inmediato.
14. `0014_sku_automatico.sql`: el SKU lo genera la base de datos con el prefijo de la categoría y un consecutivo
    propio de cada una (NS-SW-0001, NS-SW-0002, NS-RT-0001…); los colores agregan su sufijo (NS-REL-0001-NEG). El SKU
    no se edita ni cambia si se cambia la categoría. Renumera los productos existentes en el orden en que se crearon.
15. `0015_costos_protegidos.sql`: el costo promedio y el costo de cada línea ya no se pueden leer de las tablas;
    solo los entregan funciones que responden a *admin* y *lectura*. El rol *bodega* no puede consultarlos ni con
    conocimientos técnicos.
16. `0016_empresa_y_garantias.sql`: datos de la empresa (razón social, NIT, dirección…) que encabezan las
    remisiones en PDF, en Configuración → Empresa; y meses de garantía por categoría, con los que la consulta de
    seriales dice si una unidad vendida sigue en garantía.
17. `0017_ordenes_compra.sql`: órdenes de compra a proveedores (OC-000001). Al recibirlas se registra una entrada
    normal enlazada a la orden; se pueden recibir en varias entregas y se cierran solas al llegar todo. Solo *admin*
    las gestiona; *admin* y *lectura* las ven.
18. `0018_importar_productos.sql`: importación de productos desde Excel o CSV, con su stock inicial (ajuste +
    «Inventario inicial»). Todo o nada: si una fila falla, no se crea ninguno.
19. `0019_cotizaciones_y_cartera.sql`: cotizaciones (COT-000001) con fecha de validez, que no mueven inventario y se
    convierten en venta con un clic; y cartera: cada venta es de contado o a crédito (con fecha límite de pago), las de
    crédito reciben abonos hasta quedar saldadas y lo devuelto descuenta del saldo. Los abonos no se borran: se anulan
    con un motivo. Desde aquí las salidas se registran con `registrar_venta()`, así que **esta migración debe
    ejecutarse antes de subir el código**.
20. `0020_anular_movimientos.sql`: anular entradas y ventas registradas por error. Se registra el ajuste contrario
    (enlazado) y el original queda marcado como anulado; stock, seriales y costo promedio vuelven a como estaban, y lo
    anulado deja de contar en reportes, dashboard, cartera y órdenes de compra. Solo *admin*, y con la **clave de
    anulación** (Configuración → Seguridad), que se guarda cifrada; 5 intentos fallidos bloquean 15 minutos. Si se
    olvida: `update public.seguridad set clave_anulacion = null;` en el SQL Editor y se define otra.
21. `0021_rol_contador.sql`: rol *contador*. Va sola: Postgres no deja usar un valor nuevo de un enum en la misma
    transacción que lo crea. **Ejecútala y luego la 0022.**
22. `0022_contabilidad_base.sql`: contabilidad, fase 1. Plan de cuentas (PUC con las subcuentas aprobadas por la
    contadora), terceros, configuración contable (fecha de arranque, régimen, IVA, ICA), periodos mensuales,
    comprobantes manuales (CC) y de saldos iniciales (SI), balance de prueba y auxiliar por cuenta. Los comprobantes
    solo se crean con `registrar_comprobante()`: deben cuadrar, usan cuentas de último nivel y llevan tercero donde la
    cuenta lo exige. No se editan ni se borran: se anulan con el comprobante inverso. Un mes cerrado no recibe nada;
    solo el contador lo reabre, con motivo. Después de ejecutarla, en Configuración → Usuarios se le asigna el rol
    *Contador* a la contadora, y ella define la fecha de arranque en Contabilidad → Configuración.
23. `0023_peps_y_asientos_inventario.sql`: contabilidad, fase 2. El costo pasa de promedio ponderado a **PEPS**: cada
    entrada crea una capa de costo y cada salida consume primero las más antiguas (`capas_costo`, `consumos_capa`).
    Anular una venta devuelve lo consumido a las mismas capas; una entrada solo se anula si nada de ella ha salido.
    Las capas se reconstruyen con el historial sin cambiar el costo de ningún movimiento ya registrado. Desde la fecha
    de arranque, cada movimiento genera su comprobante **MI** (entrada: inventario contra el proveedor; venta: costo de
    ventas; ajustes: la subcuenta de su motivo). Por eso las entradas exigen el proveedor y no se registran
    movimientos con fecha de un mes cerrado. Contabilidad → Configuración muestra la conciliación del inventario.
24. `0024_ventas_y_cartera_contable.sql`: contabilidad, fase 3. Como Net&Sec no es responsable de IVA, **la venta es
    la factura**: su comprobante suma el ingreso (crédito: cliente 130505; contado: caja) al costo. Los abonos generan
    su recibo de caja (efectivo a caja, lo demás a bancos) y pueden llevar la **retención** que practique el cliente
    (135515), que la cartera descuenta del saldo. Devoluciones y anulaciones reversan el ingreso; cambiar la forma de
    pago reclasifica entre caja y cliente. **Notas crédito y débito** por valor (NC-/ND-) en ventas a crédito. **CUFE**
    en ventas y entradas. Clientes y proveedores ganan plazo de pago, agente de retención y responsable de IVA.
    Contabilidad → Por cobrar y por pagar muestra el saldo de cada tercero. Al crear la primera subcuenta de una
    cuenta de los parámetros (p. ej. un auxiliar por banco bajo 111005), los parámetros pasan a la subcuenta.
25. `0025_tesoreria.sql`: contabilidad, fase 4. **Cajas y bancos** (`cuentas_tesoreria`) con su saldo; al crear un banco
    se crea su auxiliar bajo 111005 (o se usa una cuenta del grupo 11 que ya exista). En los abonos se elige a qué caja
    o banco entra el dinero. **Comprobantes de egreso** (CE-): pago a proveedor (no más de lo que se le debe) u otro
    pago contra la cuenta que se elija. **Traslados** (TR-) entre cajas y bancos. **Anticipos de clientes** (RA-, cuenta
    2805) que se aplican a sus ventas a crédito como abonos. **Edades** de clientes y proveedores (al día, 1–30, 31–60,
    61–90, más de 90 días) desde la contabilidad. Todo exige la fecha de arranque y se anula con el comprobante
    inverso. En el menú: Tesorería.
26. `0026_gastos_activos_y_estados.sql`: contabilidad, fase 5. **Gastos** por categoría (GA-): pagados de una caja o banco,
    o por pagar (2335) y pagados después con un egreso; las categorías llevan su cuenta del PUC. **Gastos recurrentes**
    (arriendo, internet…) que cada mes se confirman con un clic. **Activos fijos** con depreciación en línea recta
    (comprobante DP: D 5260 / C 1592). **Estado de resultados** (con el período anterior) y **situación financiera**.
    **Cierre del ejercicio** (CI): las clases 4, 5 y 6 a la 3605. El cierre mensual revisa una **lista de chequeo**
    (cuadre, pendientes por contabilizar, inventario, depreciación, recurrentes); si algo falla, solo cierra forzándolo.
    El inicio muestra el tablero financiero: disponible, cartera vencida, por pagar y utilidad del mes.
27. `0027_impuestos_conciliacion_y_flujo.sql`: contabilidad, fase 6. **Impuestos**: base del ICA por bimestre (ingresos
    operacionales menos devoluciones) con la tarifa por mil de la configuración, y las retenciones que practicaron los
    clientes. **Conciliación bancaria**: se importa el extracto del banco (Excel o CSV; débitos y créditos o una columna
    de valor), se cruza solo con los asientos del mismo valor (±3 días), el resto se concilia a mano y el mes se cierra
    cuando cuadra; el cierre contable exige la conciliación de cada banco con movimientos. **Flujo de efectivo** del
    período por concepto y **flujo de caja proyectado** por semanas (cartera, proveedores, gastos por pagar y
    recurrentes).

Las migraciones **0025, 0026 y 0027** se ejecutan en orden, después de la 0024.

Reglas clave:

- El stock **no se edita a mano**: se calcula a partir de los movimientos (vista `stock_actual`).
- Los movimientos solo se crean con `registrar_movimiento()`, que valida el stock, los seriales y los estados en una
  sola transacción. Son **inmutables**: no se editan ni se borran, y las correcciones se hacen con ajustes. Una
  entrada o una venta errada se puede **anular** (con la clave de anulación): queda en el historial junto al ajuste
  que la revierte.
- Clientes, proveedores y productos no se borran: se desactivan, para conservar el historial.
- El SKU no se escribe a mano: `NS-<prefijo de la categoría>-<consecutivo>`. El prefijo se define en
  Configuración → Categorías.

## Seguridad

| Medida | Cómo |
|---|---|
| Claves fuera del código y de Git | `.env.local` (ignorado) y variables de Vercel. Solo se usa la clave pública `anon` |
| Autorización en el servidor | RLS en todas las tablas y permisos por rol dentro de cada función (migración 0013). La app oculta lo que cada rol no puede hacer, pero quien decide es la base de datos |
| Costos ocultos para *bodega* | Permisos por columna: el costo solo se obtiene con funciones que revisan el rol (migración 0015) |
| Validación de entradas | En los formularios (Zod) **y** en la base de datos (migración 0006: largos y formatos de SKU, documento, email, teléfono, MAC, serial) |
| Datos que no se pueden manipular | Movimientos inmutables, stock calculado, tomas y ajustes solo mediante funciones que validan |
| Contenido del usuario | React escapa todo lo que muestra; el CSV neutraliza fórmulas de Excel (`=`, `+`, `-`, `@`) |
| Subida de archivos | Solo fotos de productos: la app las valida, reduce y limpia de metadatos (GPS); el servidor solo acepta JPG/PNG/WebP de hasta 2 MB subidos por *admin* (migración 0007) |
| Tamaño de las respuestas | Máximo 1000 filas por consulta (Supabase); la app pagina y los reportes avisan si llegan al tope |
| Historial de cambios | Migración 0005: quién cambió qué y cuándo (Reportes → Historial de cambios) |
| Cabeceras HTTP | `vercel.json`: CSP estricta, anti-iframe, `nosniff`, HSTS, permisos (solo cámara) |
| HTTPS | Vercel redirige `http://` a `https://` y HSTS obliga al navegador a usar siempre HTTPS |
| Contraseñas | Las gestiona Supabase Auth (bcrypt); la app nunca las guarda |
| Intentos de inicio y bots | Límites de Supabase Auth + CAPTCHA opcional con Cloudflare Turnstile |
| Dependencias | Dependabot (actualizaciones semanales) y `npm audit` en cada push (`.github/workflows/ci.yml`) |

### Ajustes en el panel de Supabase

- **Authentication → Sign In / Providers:** desactivar *Allow new users to sign up* (los usuarios se invitan desde
  la app, en Configuración → Usuarios).
- **Authentication → Rate Limits:** revisar los límites de inicio de sesión.
- **Advisors → Security Advisor:** revisarlo después de cada migración.
- **Logs:** consultas a la base de datos (Postgres), a la API y a Auth (inicios de sesión y fallos).
- **Settings → API → Max rows:** dejarlo en 1000 (la app ya pide los datos por páginas).

### Activar el CAPTCHA (Cloudflare Turnstile, gratis)

Respeta el orden: si se activa en Supabase antes de que la app envíe la verificación, nadie podrá entrar.

1. En [dash.cloudflare.com](https://dash.cloudflare.com) → **Turnstile → Add widget**: dominios
   `netsec-inventario.vercel.app` y `localhost`, modo *Managed*. Copia la **Site Key** y la **Secret Key**.
2. En Vercel → Environment Variables, agrega `TURNSTILE_SITE_KEY` (o `VITE_TURNSTILE_SITE_KEY`) con la
   **Site Key**, marcada para *Production*, y haz *Redeploy* (en local, ponla también en `.env.local`).
   La Site Key es pública; la Secret Key nunca va en Vercel ni en la app.
3. Abre la app: debe aparecer la verificación de Cloudflare bajo la contraseña y el login debe funcionar.
4. Solo entonces, en Supabase → **Authentication → Attack Protection** → activa *CAPTCHA protection*, elige
   **Turnstile** y pega la **Secret Key**.

Si algo falla, desactiva el CAPTCHA en ese mismo panel de Supabase y el login vuelve a funcionar sin él.

## Usuarios y roles

| | Admin | Bodega | Lectura | Contador |
|---|---|---|---|---|
| Ver productos, stock, movimientos, clientes y proveedores | ✅ | ✅ | ✅ | ✅ |
| Registrar entradas y salidas | ✅ | ✅ | ❌ | ❌ |
| Contar en tomas de inventario | ✅ | ✅ | ❌ | ❌ |
| Finalizar o cancelar tomas (generan ajustes) y ajustes manuales | ✅ | ❌ | ❌ | ❌ |
| Crear o editar productos, clientes y proveedores | ✅ | ❌ | ❌ | ❌ |
| Costos, márgenes, valor del inventario y reportes | ✅ | ❌ | ✅ | ✅ |
| Ver órdenes de compra | ✅ | ❌ | ✅ | ✅ |
| Crear, recibir y cancelar órdenes de compra; importar productos | ✅ | ❌ | ❌ | ❌ |
| Crear, editar y convertir cotizaciones en venta | ✅ | ✅ | ❌ | ❌ |
| Ver la cartera (saldos y abonos) | ✅ | ❌ | ✅ | ✅ |
| Registrar y anular abonos; cambiar la forma de pago de una venta | ✅ | ❌ | ❌ | ❌ |
| Notas crédito y débito de una venta a crédito | ✅ | ❌ | ❌ | ✅ |
| Tesorería: cajas y bancos, egresos, traslados y anticipos | ✅ | ❌ | 👁️ (consulta) | ✅ |
| Registrar el CUFE de una venta o entrada (corregirlo: solo admin) | ✅ | ✅ | ❌ | ❌ |
| Anular entradas y ventas (con la clave de anulación) | ✅ | ❌ | ❌ | ❌ |
| Consultar seriales y garantías; remisiones en PDF | ✅ | ✅ | ✅ | ✅ |
| Ver la contabilidad (libro diario, balance, auxiliares, plan de cuentas) | ✅ | ❌ | ✅ | ✅ |
| Registrar y anular comprobantes; plan de cuentas, terceros y configuración contable; cerrar meses | ✅ | ❌ | ❌ | ✅ |
| Reabrir un mes cerrado | ❌ | ❌ | ❌ | ✅ |
| Configuración (categorías, bodegas, usuarios, empresa) | ✅ | ❌ | ❌ | ❌ |

Bodega digita el costo de la factura (con IVA) al registrar una entrada, pero no ve los costos ni los márgenes. Esto
también lo aplica la base de datos (migración 0015): las columnas de costo no se pueden leer de las tablas y solo las
entregan las funciones `costos_productos()` y `costos_lineas()`, que responden únicamente a *admin* y *lectura*.

Los usuarios se invitan por correo desde **Configuración → Usuarios**: la persona recibe un enlace, crea su
contraseña en `/bienvenida` y entra. Desde ahí también se cambia el rol, se reenvía la invitación (o un enlace para
cambiar la contraseña) y se desactiva el acceso. Nadie puede cambiar su propio rol y siempre queda al menos un admin.

### Configuración (una sola vez)

1. Ejecutar la migración `0013_usuarios_y_roles.sql`.
2. Desplegar la Edge Function `supabase/functions/usuarios/index.ts` (usa la clave de servicio, que nunca llega al
   navegador): Supabase → **Edge Functions → Deploy a new function → Via Editor**, nombre `usuarios`, pegar el
   código y desplegar (con *Verify JWT* activado). O con la CLI: `npx supabase functions deploy usuarios`.
3. **Authentication → URL Configuration:** *Site URL* = la URL de Vercel, y en *Redirect URLs* agregar
   `https://<tu-app>.vercel.app/bienvenida` y `http://localhost:5173/bienvenida`.
4. **Correo:** el servicio de correo incluido en Supabase solo envía a los miembros del equipo del proyecto y con un
   límite muy bajo por hora. Para invitar a cualquier persona hay que configurar un SMTP propio en
   **Authentication → Emails → SMTP Settings** (por ejemplo Gmail con una contraseña de aplicación, o Resend).
5. Opcional: traducir el correo en **Authentication → Emails → Templates → Invite user**.

## Copias de seguridad

Cada noche a las 2:00 a. m. (Colombia) la tarea `.github/workflows/respaldo.yml` exporta la base de datos de
Supabase (roles, estructura y datos, incluidos los usuarios), verifica que esté completa, la cifra con AES-256 y la
guarda **30 días** en GitHub → Actions → *Respaldo de la base de datos* → cada ejecución → *Artifacts*.
Si falla, GitHub envía un correo.

### Configuración (una sola vez)

En GitHub → Settings → Secrets and variables → **Actions** → *New repository secret*, crea dos secretos:

1. **`SUPABASE_DB_URL`**: en Supabase pulsa **Connect** (arriba) → **Session pooler** → copia la URI y reemplaza
   `[YOUR-PASSWORD]` por la contraseña de la base de datos. Queda así:
   `postgresql://postgres.<id>:<contraseña>@aws-0-<región>.pooler.supabase.com:5432/postgres`.
   Si no recuerdas la contraseña: Database → Settings → *Reset database password* (usa solo letras y números, así
   no hay que codificar caracteres especiales). Se usa el *Session pooler* porque GitHub no tiene IPv6.
2. **`BACKUP_PASSPHRASE`**: una contraseña larga (16 caracteres o más) para cifrar las copias.
   **Guárdala en un gestor de contraseñas: sin ella las copias no se pueden abrir.**

Luego, en Actions → *Respaldo de la base de datos* → **Run workflow**, para hacer la primera copia y comprobar que
todo funciona.

### Restaurar

Hazlo sobre un **proyecto nuevo de Supabase** (o uno de prueba), nunca directamente sobre producción sin tener
antes una copia reciente.

1. Descarga el artefacto de la fecha que necesitas (un `.zip` con el archivo `.tar.gz.gpg`) y descomprime el zip.
2. Descifra y extrae (en Git Bash, que ya trae `gpg`):
   ```bash
   gpg -d netsec-respaldo-AAAA-MM-DD_HHMM.tar.gz.gpg > respaldo.tar.gz   # pide la BACKUP_PASSPHRASE
   tar -xzf respaldo.tar.gz                                              # crea la carpeta respaldo/
   ```
3. Restaura con `psql` (viene con PostgreSQL) usando la URI del proyecto destino:
   ```bash
   psql --single-transaction --variable ON_ERROR_STOP=1 \
     --file respaldo/roles.sql \
     --file respaldo/esquema.sql \
     --command 'SET session_replication_role = replica' \
     --file respaldo/datos.sql \
     --dbname "postgresql://postgres.<id>:<contraseña>@aws-0-<región>.pooler.supabase.com:5432/postgres"
   ```
   `--single-transaction` hace que, si algo falla, no quede nada a medias.
4. Si restauraste en un proyecto nuevo, cambia `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY` en Vercel y vuelve a
   desplegar, y configura de nuevo en ese proyecto el CAPTCHA y la desactivación del registro público.

## Alertas de stock por correo

De lunes a sábado a las 7:00 a. m. (Colombia), `.github/workflows/alerta-stock.yml` ejecuta
`scripts/alerta_stock.py`: consulta en **solo lectura** los productos activos sin stock o en/por debajo del
mínimo y, **solo si hay alguno**, envía un correo con la lista y enlaces a la app. Usa el mismo secreto
`SUPABASE_DB_URL` de las copias de seguridad.

### Configuración (una sola vez)

1. **Contraseña de aplicación de Google** (la cuenta de Gmail que envía):
   myaccount.google.com → **Seguridad** → activa la *Verificación en 2 pasos* si no lo está → busca
   **Contraseñas de aplicaciones** → crea una llamada `Net&Sec Inventario` → copia el código de 16 letras.
   Se puede revocar en ese mismo lugar sin afectar la cuenta.
2. En GitHub → Settings → Secrets and variables → **Actions**, crea:
   - `SMTP_USUARIO`: el correo de Gmail que envía.
   - `SMTP_CLAVE`: la contraseña de aplicación (las 16 letras, sin espacios).
   - `ALERTA_DESTINATARIOS` *(opcional)*: correos que reciben, separados por coma. Si no se crea, llega al
     mismo `SMTP_USUARIO`, pero Gmail guarda los correos enviados a uno mismo en **Enviados**, no en la
     bandeja de entrada. Para recibirlos como correo nuevo, pon aquí otra dirección.
3. Actions → *Alerta de stock bajo* → **Run workflow** (con "Enviar aunque no haya productos por reponer"
   marcado) para recibir un correo de prueba.

Vista previa del correo sin base de datos ni envío: `python scripts/alerta_stock.py --prueba > alerta.html`.

## Escáner con el teléfono

Los botones con el ícono de código de barras abren la cámara (librería `barcode-detector`, motor ZXing en WebAssembly
servido desde la propia app). El navegador **solo permite la cámara en HTTPS**:

1. Ejecuta `npm run dev:movil` y abre en el teléfono la dirección `https://192.168.x.x:5173` que muestra la consola
   (el teléfono debe estar en la misma red Wi-Fi).
2. El certificado es local, así que el navegador mostrará una advertencia: toca *Configuración avanzada → Continuar*.
3. Acepta el permiso de cámara.

En producción el hosting ya sirve la app con HTTPS.

## Funciones

- **Remisión en PDF:** en el detalle de cada movimiento, *Remisión PDF* (salidas) o *Comprobante PDF* (entradas y
  ajustes). Lleva los datos de la empresa (Configuración → Empresa), el cliente o proveedor, los seriales, la
  garantía de cada producto con su fecha de vencimiento, el pie configurable y espacio para las firmas. No incluye
  costos ni márgenes.
- **Seriales y garantías** (menú lateral): se escanea o escribe un serial o una MAC y se ve el producto, su estado,
  su historia, a quién se vendió y hasta cuándo tiene garantía (meses de su categoría desde la venta).
- **Órdenes de compra:** lo que se le pide a cada proveedor, con PDF para enviárselo. *Recibir mercancía* abre una
  entrada con lo pendiente precargado al costo pactado. El botón *Agregar los por reponer* llena la orden con los
  productos en o bajo el mínimo.
- **Importar productos** (Productos → Importar): plantilla descargable, vista previa con los errores de cada fila y
  stock inicial opcional.
- **Búsqueda global:** `Ctrl + K` (o el botón *Buscar*) encuentra productos, seriales, clientes, proveedores y
  movimientos por su número (`NetS-12`, `e7`…) desde cualquier pantalla.
- **Tema claro u oscuro:** botón del sol / luna en el menú; cada navegador recuerda su elección.
- **App instalable:** el navegador ofrece instalarla; abre al instante porque guarda el código de la app (no los
  datos, que siempre vienen de Supabase). Cuando se publica una versión nueva aparece *Actualizar*, y si se va la
  conexión se avisa que no se pueden guardar cambios.

## Pruebas

`npm test` corre dos tipos de pruebas (también en cada push, en `.github/workflows/ci.yml`):

- **Lógica de la app** (`src/**/*.test.ts`): líneas de movimientos, diferencias de las tomas, garantías, lectura de
  archivos de Excel/CSV, exportación.
- **Base de datos** (`tests/db/`): carga **todas** las migraciones en un PostgreSQL embebido (PGlite, sin Docker ni
  conexión a Supabase) y comprueba el costo promedio, el stock, los seriales, los permisos de cada rol (incluido que
  *bodega* no pueda leer costos), las órdenes de compra y la importación.

Al escribir una migración nueva, agrega sus pruebas en `tests/db/`: si una migración tiene un error, `npm test` lo
dice antes de ejecutarla en Supabase.

## Scripts

| Script | Descripción |
|---|---|
| `npm run dev` | Servidor de desarrollo |
| `npm run dev:movil` | Servidor HTTPS en la red local, para probar el escáner desde el teléfono |
| `npm run build` | Chequeo de tipos + build de producción |
| `npm run typecheck` | Solo chequeo de tipos |
| `npm run lint` | ESLint |
| `npm test` | Pruebas: lógica de la app y migraciones SQL (ver [Pruebas](#pruebas)) |
| `npm run test:watch` | Pruebas en modo observación, mientras se programa |

## Estructura

```
src/
  app/          router, providers, páginas globales
  lib/          cliente Supabase y utilidades
  components/ui componentes reutilizables
  features/     un módulo por funcionalidad (auth, productos, movimientos, clientes, proveedores, compras,
                seriales, inventario, reportes, configuración, dashboard)
  types/        tipos (incluye los generados desde Supabase)
tests/db/       pruebas de las migraciones y funciones SQL (PostgreSQL embebido)
```
