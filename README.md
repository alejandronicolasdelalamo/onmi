<div align="center">

<img src="frontend/public/favicon.svg" alt="ONMi" width="72" />

# ONMi

**Notas, hábitos, proyectos, metas, ánimo y tiempo de enfoque en un solo lugar.**

Aplicación full-stack con React + TypeScript y una API Flask segura, probada de punta a punta.

[![CI](https://github.com/alejandronicolasdelalamo/onmi/actions/workflows/ci.yml/badge.svg)](https://github.com/alejandronicolasdelalamo/onmi/actions/workflows/ci.yml)
![Python](https://img.shields.io/badge/Python-3.12-3776AB?logo=python&logoColor=white)
![Flask](https://img.shields.io/badge/Flask-3-000000?logo=flask)
![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=black)
![TypeScript](https://img.shields.io/badge/TypeScript-6-3178C6?logo=typescript&logoColor=white)
![Tailwind](https://img.shields.io/badge/Tailwind-4-06B6D4?logo=tailwindcss&logoColor=white)
![License](https://img.shields.io/badge/license-MIT-green)

<img src="docs/screenshots/dashboard-light.png" alt="Dashboard de ONMi en modo claro" width="880" />

</div>

---

## Qué es

ONMi es una app de productividad personal. Reúne en una sola interfaz lo que normalmente está repartido en varias herramientas:

- **Dashboard** con el resumen del día: hábitos por hacer, racha, minutos de enfoque, proyectos activos, metas próximas y notas.
- **Hábitos** diarios o con objetivo semanal («3 veces por semana», con racha en semanas), calendario de 14 días, rachas actual y máxima, heatmap estilo GitHub y tasa de cumplimiento a 30 días.
- **Recordatorios push**: cada hábito puede tener una hora de aviso; se envía una notificación (Web Push, aunque la app esté cerrada) solo si sigue pendiente, respetando tu zona horaria y sin insistir si ya cumpliste el objetivo semanal.
- **Notas** en Markdown con vista previa, etiquetas, búsqueda instantánea, notas fijadas y vínculo a proyectos y metas. **Notas ocultas con contraseña**: cada nota se puede ocultar con una contraseña propia (distinta de la de la cuenta); mientras está bloqueada el servidor no envía su título, contenido ni etiquetas, no aparece en búsquedas, etiquetas, panel ni exportación, y se desbloquea unos minutos solo en memoria. Es ocultación en el servidor, no cifrado de extremo a extremo. El bloqueo es automático (al salir de la app o tras 1-10 min sin actividad; en iPhone, al cambiar de app o apagar la pantalla) y opcionalmente se pide la contraseña cada vez que se abre una nota oculta. Además: **papelera** de 30 días con restaurar y deshacer, **enlaces `[[título]]` con retroenlaces**, **plantillas** (diario, reunión, lista de tareas) e **imágenes** en las notas (se reducen y comprimen en el dispositivo antes de subirlas y siguen el bloqueo de su nota).
- **Proyectos** en un tablero Kanban con drag & drop (también con teclado), prioridad, fecha límite y progreso calculado a partir de sus metas.
- **Metas** que se enlazan con proyectos, hábitos y notas.
- **Ánimo**: registro diario con historial de 30 días, distribución y un avatar que reacciona a cómo te sientes.
- **Enfoque (Pomodoro)** con duración configurable, sonido y notificaciones, sesiones guardadas en el servidor y estadísticas.
- **Insights**: conecta tus datos. Compara cada semana con la anterior (hábitos, enfoque, ánimo, metas) y detecta patrones, por ejemplo *«los días que corres, tu ánimo medio es 4,2 frente a 2,8»*. Es prudente: exige un mínimo de días en cada grupo, solo muestra efectos relevantes y lo presenta como patrón, no como causa.
- **Coach semanal**: una revisión escrita de tu semana (qué fue bien, en qué fijarte y una sugerencia). Por defecto la redacta el servidor con plantillas, sin enviar nada fuera. Si el administrador configura una clave y **tú lo activas** en Ajustes, la escribe Claude a partir de datos agregados; si Claude falla, vuelve a la versión local sin errores.
- **Compañeros de hábitos**: conecta con amigos mediante un código personal (se acepta la solicitud, y se puede regenerar). Cada hábito es **privado por defecto**; solo ves de un compañero los hábitos que él marcó como compartidos (nombre, racha y progreso), nunca sus notas, su ánimo ni su correo. Puedes animarle una vez al día, con aviso push opcional.
- **Mini perfil**: tus compañeros ven tu nombre, una frase tuya y **solo los objetivos y hábitos que marques como compartidos**. Cada objetivo es privado por defecto, con una insignia que lo deja claro; la descripción nunca se comparte.
- **Calendario**: vista de mes y de semana, colores, hora y duración. Los eventos se repiten **cada día, los días de la semana que elijas (solo martes, martes y jueves…), cada 1-4 semanas, o «N días por semana» a tu elección** (aparece cada día hasta que marcas N como hechos). Puedes saltar un día suelto y marcar los hechos. Se comparte **solo con las personas que elijas** y solo los eventos que marques como compartidos, sin notas; se ve junto al tuyo con un filtro por persona.
- **Primeros pasos** para cuentas nuevas, calculados con los datos reales, y **celebración de rachas** (7, 30, 100 días…) con confeti que respeta `prefers-reduced-motion`.
- **Exportar mis datos** en JSON desde Ajustes.
- **Pensada para iPhone (PWA)**: pantalla de arranque con círculo de progreso y tiempo estimado mientras despierta el servidor gratuito, **captura rápida** (botón «+»: nota, hábito o ánimo en dos toques), tarjeta **Hoy** con anillos de progreso y la siguiente acción, **búsqueda global** (Ctrl+K), notas **sin conexión** (se guardan en el dispositivo y se envían solas), número en el icono con los hábitos pendientes, gesto de deslizar para volver, tema **Medianoche** (negro OLED) y 7 colores de acento, bienvenida con guía de instalación, ilustraciones propias y compartir la semana como imagen.
- **Seguridad de cuenta**: **passkeys** (Face ID / Touch ID, WebAuthn; el RP ID sale del dominio de `FRONTEND_URL`, o de `WEBAUTHN_RP_ID`), **sesiones por dispositivo** (ver y cerrar al instante), importación y exportación de copias de seguridad.
- **Ánimo renovado**: caritas SVG propias con degradado, parpadeo y animaciones por emoción (rebote, latido, temblor, lágrima…), se puede **cambiar** el ánimo ya registrado, editar o borrar **cualquier día anterior**, etiquetas de «qué ha influido» (sueño, trabajo, familia…), racha, media, lo que te sube y lo que te pesa, calendario mensual y registros recientes.
- **Calendarios múltiples**: tu calendario **Personal** es siempre privado y puedes crear los que quieras, cada uno compartido con **una o varias personas** a tu elección (solo compañeros aceptados; sin notas). Se cambia entre «Míos» y «Compartidos conmigo» y se oculta cada calendario con un toque. Tus datos de ONMi (hábitos, metas, proyectos, ánimo y enfoque) se ven sobre el calendario como **capas privadas**, que nunca se comparten.
- **Metas con hitos** (pasos con casillas, y los hábitos y notas que las alimentan) y **actividad reciente** en cada proyecto.
- **App nativa** (iOS y Android) con Expo y React Native en [`mobile/`](mobile/README.md): Hoy, hábitos, notas y ajustes sobre la misma API, con sesión por tokens en el almacén seguro del sistema y modo claro/oscuro.
- **Panel de administración** con métricas de la plataforma y gestión de usuarios (roles, activar/desactivar, borrar).
- Modo claro/oscuro, interfaz en **inglés y español**, **PWA instalable**, paleta de comandos (`Ctrl+K`) y un **modo demo** con datos de ejemplo.

<table>
  <tr>
    <td><img src="docs/screenshots/habits-dark.png" alt="Hábitos en modo oscuro" /></td>
    <td><img src="docs/screenshots/projects-dark.png" alt="Tablero Kanban en modo oscuro" /></td>
  </tr>
  <tr>
    <td><img src="docs/screenshots/notes-light.png" alt="Notas en modo claro" /></td>
    <td><img src="docs/screenshots/mood-light.png" alt="Seguimiento del ánimo" /></td>
  </tr>
  <tr>
    <td><img src="docs/screenshots/insights-light.png" alt="Insights: revisión semanal y patrones" /></td>
    <td><img src="docs/screenshots/insights-dark.png" alt="Insights en modo oscuro" /></td>
  </tr>
  <tr>
    <td><img src="docs/screenshots/buddies-light.png" alt="Compañeros de hábitos" /></td>
    <td><img src="docs/screenshots/buddies-dark.png" alt="Compañeros en modo oscuro" /></td>
  </tr>
  <tr>
    <td><img src="docs/screenshots/focus-light.png" alt="Temporizador de enfoque" /></td>
    <td><img src="docs/screenshots/login-dark.png" alt="Pantalla de acceso" /></td>
  </tr>
</table>

<p align="center"><img src="docs/screenshots/dashboard-mobile.png" alt="Versión móvil" width="260" /></p>

## Stack

| Capa | Tecnología |
| --- | --- |
| Frontend | React 19, TypeScript, Vite, Tailwind CSS 4, componentes estilo shadcn/ui sobre Radix, TanStack Query, React Hook Form + Zod, dnd-kit, Recharts, cmdk, i18next |
| Backend | Flask 3, SQLAlchemy 2, Flask-Migrate (Alembic), Flask-JWT-Extended, Flask-Limiter, Pydantic v2, Flask-Admin |
| Datos | PostgreSQL en producción · SQLite en desarrollo y tests |
| Calidad | pytest (146 tests, 95 % de cobertura), Vitest + Testing Library (61), Jest en la app móvil (26), Playwright E2E (39, incluida una auditoría de accesibilidad con axe-core), Ruff, ESLint, TypeScript estricto |
| DevOps | Docker multi-stage, Docker Compose, GitHub Actions, blueprint de Render |

## Arquitectura

```mermaid
flowchart LR
    SPA["React + TypeScript<br/>PWA · i18n"] -- "cookies httpOnly + CSRF" --> API["Flask<br/>blueprints · servicios · OpenAPI"]
    API --> DB[("PostgreSQL / SQLite")]
    API --> MAIL["SendGrid<br/>(consola en desarrollo)"]
    API -. opcional .-> G["Google Identity"]
```

El frontend compilado lo sirve el propio Flask, de modo que navegador y API comparten origen. Hay más diagramas (flujo de
autenticación, modelo de datos) y la tabla de decisiones de diseño en [`docs/architecture.md`](docs/architecture.md).

## Seguridad

La seguridad fue el eje principal de la reescritura:

- **Sesión en cookies `httpOnly`** (access de 15 min y refresh de 30 días que se renueva cada vez que usas la app, así que no tienes que volver a iniciar sesión; son cookies persistentes, no de sesión) con protección **CSRF** por doble envío. JavaScript nunca ve el JWT, así que un XSS no puede robarlo.
- **Bloqueo de cuenta** tras 5 intentos fallidos y **rate limiting** en login, registro, recuperación de contraseña y reenvío de verificación.
- **Reseteo de contraseña y verificación de email** con tokens aleatorios, de un solo uso, con caducidad y guardados **solo como hash SHA-256**. `forgot-password` responde siempre igual para no revelar qué emails existen.
- **Autorización por objeto**: cada recurso se consulta filtrando por su dueño y responde 404 para los ajenos. Los tests cubren que un usuario no puede leer, editar, borrar ni vincular datos de otro.
- El **rol se lee de la base de datos** en cada petición: desactivar a un usuario o quitarle el rol admin se aplica al instante.
- Validación estricta con Pydantic (`extra="forbid"`: no se puede enviar `role` al registrarse), contraseñas con hash de Werkzeug, secretos obligatorios en producción y cabeceras de seguridad.
- Login con Google verificando el `aud` del ID token contra tu `GOOGLE_CLIENT_ID`.

## Accesibilidad y experiencia de uso

Cumple WCAG 2.1 AA y se verifica en cada ejecución del CI: un test de Playwright con **axe-core** recorre todas las pantallas,
en modo claro y oscuro, y falla ante cualquier infracción grave o crítica. Esa auditoría ya detectó y obligó a corregir problemas
reales, como etiquetas accesibles que no incluían el texto visible o un contraste insuficiente en las etiquetas de prioridad.

- **Teclado y lectores de pantalla**: enlace de salto al contenido, foco que pasa al contenido principal al navegar, título de pestaña por pantalla y `<html lang>` sincronizado con el idioma. El Kanban se puede mover con teclado.
- **Móvil (iPhone y Android, como web instalada)**: barra de pestañas inferior al alcance del pulgar, formularios como hoja que sube desde abajo, respeto de la zona segura (notch y barra de inicio), campos de 16 px para que iOS no haga zoom, objetivos táctiles de 44 px, acciones siempre visibles (sin depender del hover) y sin desplazamiento horizontal. Un test de Playwright con viewport de teléfono lo verifica en todas las pantallas (y ya cazó una fila de caras de ánimo que se salía de la pantalla).
- **Estados completos**: esqueletos de carga, estados vacíos con una acción y errores de carga con botón de reintentar; un fallo de renderizado no deja la pantalla en blanco.
- **Respuesta inmediata**: marcar un hábito se refleja al instante (actualización optimista con vuelta atrás si falla el servidor).
- **Pequeños detalles**: fuente Inter autoalojada, fechas formateadas con `Intl` según el idioma, mostrar u ocultar contraseña, atajo `⌘K` o `Ctrl K` según el sistema, heatmap con etiquetas de día y mes, y confirmaciones que nombran lo que se va a borrar.
- Respeta `prefers-reduced-motion` y `prefers-color-scheme`.

## Cómo ejecutarlo

### Opción 1: Docker (app completa con PostgreSQL)

```bash
cp .env.example .env        # y cambia SECRET_KEY y JWT_SECRET_KEY
docker compose up --build
```

Abre <http://localhost:8000>. La documentación interactiva de la API está en <http://localhost:8000/docs>.

> El `docker-compose.yml` y el `Dockerfile` no se pudieron probar en el equipo donde se desarrolló (no tenía Docker). La app sí
> se verificó con SQLite y el servidor real; el pipeline de CI construye la imagen en cada push.

### Opción 2: desarrollo local

Requiere Python 3.10+ y Node 20+.

```bash
# 1) Backend (http://localhost:5000)
cd backend
python -m venv .venv && source .venv/bin/activate      # en Windows: .venv\Scripts\activate
pip install -r requirements-dev.txt
cp .env.example .env
export FLASK_APP=wsgi.py
flask db upgrade            # crea las tablas en SQLite
flask seed-demo             # opcional: usuario demo con datos de ejemplo
flask run -p 5000

# 2) Frontend (http://localhost:5173), en otra terminal
cd frontend
npm install
npm run dev
```

Vite redirige `/api` al backend, así que no hace falta configurar CORS en local. En desarrollo los correos
(verificación, recuperación) se **imprimen en la consola del backend** si no hay `SENDGRID_API_KEY`.

### Variables de entorno

| Variable | Descripción |
| --- | --- |
| `SECRET_KEY`, `JWT_SECRET_KEY` | Obligatorias en producción. |
| `DATABASE_URL` | `postgresql://user:pass@host:5432/db`. Por defecto SQLite local. |
| `FRONTEND_URL` | URL pública, usada en los enlaces de los correos. |
| `SENDGRID_API_KEY`, `MAIL_FROM` | Envío real de correo. Sin clave, salida por consola. |
| `GOOGLE_CLIENT_ID` | Activa "Continuar con Google". Sin él, el botón se oculta. |
| `DEMO_ENABLED` | Muestra el botón "Try the demo" (usuario `demo@onmi.app` con datos de ejemplo). |
| `COOKIE_SECURE` | `true` por defecto en producción. |
| `ANTHROPIC_API_KEY`, `COACH_MODEL` | Permiten que el coach semanal lo escriba Claude (modelo `claude-opus-5-5` por defecto). Sin clave, el coach usa siempre el redactor local. |
| `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` | Activan los recordatorios push. Genera el par con `flask generate-vapid`. Sin ellos, la opción se oculta. |

Crear un administrador: `flask create-admin tu@email.com`.

### Coach con IA y privacidad

El coach funciona sin IA. Para que lo escriba Claude hacen falta **dos cosas**: que el servidor tenga `ANTHROPIC_API_KEY` y que
**cada usuario lo active** en Ajustes (apagado por defecto). Lo que se envía es una instantánea agregada de los últimos 7 días:
totales y medias (hábitos cumplidos, minutos de enfoque, ánimo medio, metas completadas) y los nombres de hábitos, metas y
proyectos. **Nunca** se envían las notas, el correo, el nombre ni el registro de ánimo día a día. La cuenta demo compartida
nunca usa IA. La llamada usa el SDK oficial de Anthropic con reintento automático en otro modelo si un clasificador de seguridad
rechazara la petición, y cualquier fallo (red, rechazo, respuesta vacía) devuelve la revisión local en vez de un error. La
revisión se guarda por semana (no se regenera sin motivo) y regenerarla tiene una pausa de una hora para acotar el coste.

> Con una clave real no se ha podido probar en este entorno: el flujo está cubierto con un cliente simulado que comprueba los
> parámetros enviados, que no se filtra nada privado y los tres modos de fallo.

### Compañeros: qué se comparte

- Conectar exige **dos pasos**: quien pide introduce tu código y **tú aceptas**. Un código inválido responde siempre igual (no revela
  qué códigos existen), tiene 8 caracteres de un alfabeto sin confusiones (~40 bits) y pedirlo está limitado a 10 por hora.
- La vista de un compañero se construye con una lista blanca (`id`, `name`, `avatar` y, por hábito compartido, nombre, color, racha y
  progreso). Los tests comprueban que no aparecen notas, ánimo, proyectos ni correo, y que dejar de compartir o archivar un hábito
  lo oculta al instante.
- Un ánimo por día y compañero (restricción única en base de datos) evita el acoso por notificaciones; el aviso push es opcional y
  su fallo nunca rompe el ánimo. Dejar de ser compañeros borra los ánimos entre ambos, y borrar la cuenta limpia relaciones y ánimos.
- La cuenta demo ve a un compañero de ejemplo (con un hábito privado que no se muestra) pero no tiene código ni puede cambiar nada.

### Mini perfil y calendario compartido

- Un compañero **aceptado** puede ver tu mini perfil (`GET /api/buddies/<id>/profile`); un desconocido recibe 404. La vista usa una lista blanca:
  nombre, avatar, frase, y de cada objetivo solo `title`, `done` y `due_date`; nunca la descripción ni los objetivos privados.
- El calendario se comparte con **personas concretas** (`PUT /api/calendar/sharing`, solo compañeros aceptados) y solo se ven los eventos marcados
  como compartidos, sin notas. Si se rompe la amistad, deja de verse al instante. La cuenta demo no puede compartir.
- Las repeticiones se expanden en el servidor (`services/calendar.py`) y los tests cubren cada modo, los saltos, la cuota semanal y la privacidad.

### Recordatorios de hábitos

1. Genera las claves: `flask --app wsgi generate-vapid` y pon `VAPID_PUBLIC_KEY` y `VAPID_PRIVATE_KEY` en el entorno.
2. Programa `flask --app wsgi send-reminders` **cada 5 minutos** (cron). El proyecto ya lo incluye: un servicio `reminders` en
   `docker-compose.yml` y un `cron` en `render.yaml`. El comando es idempotente: no repite un aviso el mismo día y solo avisa
   dentro de las 3 horas siguientes a la hora elegida.
3. Cada usuario los activa desde **Ajustes → Recordatorios** (el navegador pide permiso).

> Las notificaciones push reales dependen del servicio push de cada navegador y no se pueden automatizar en CI: la lógica de qué
> y cuándo enviar (zonas horarias, ventana, objetivo semanal, suscripciones caducadas) está cubierta por tests unitarios.

## Tests

```bash
cd backend  && pytest --cov=app          # 180 tests
cd frontend && npm test                  # 68 tests (Vitest)
cd mobile   && npm test                  # 26 tests (Jest) + `npm run export:android` para validar el bundle
cd frontend && npx playwright install chromium && npm run e2e   # tests de extremo a extremo: flujos, accesibilidad (axe) y móvil
```

Los E2E arrancan solos una API con base de datos SQLite desechable y el servidor de Vite. Para regenerar las capturas de este
README: `SCREENSHOTS=1 npx playwright test screenshots`.

## Estructura

```
onmi/
├── backend/
│   ├── app/
│   │   ├── api/          # blueprints: auth, notes, projects, goals, habits, wellbeing, dashboard, insights, coach, push, buddies, calendar, admin
│   │   ├── services/     # stats (rachas), insights (correlaciones), mail (consola/SendGrid), seed
│   │   ├── models.py     # SQLAlchemy 2
│   │   ├── schemas.py    # validación Pydantic
│   │   └── openapi.py    # OpenAPI + Swagger UI generados desde los esquemas
│   ├── migrations/       # Alembic
│   └── tests/
├── frontend/
│   ├── src/
│   │   ├── features/     # una carpeta por pantalla
│   │   ├── components/   # UI base, layout, heatmap, caritas SVG
│   │   ├── lib/          # cliente API, auth, tema, i18n, hooks de datos
│   │   └── locales/      # en.json, es.json
│   └── e2e/              # Playwright
├── mobile/               # app nativa (Expo + React Native)
├── docs/                 # arquitectura y capturas
├── Dockerfile · docker-compose.yml · render.yaml
└── .github/workflows/ci.yml
```

## Diseño

Las pantallas clave (acceso, dashboard y tablero Kanban) están maquetadas en Figma como referencia de estructura y sistema
visual: tipografía Inter, paleta índigo, tarjetas con borde fino y modo claro/oscuro.

## Origen del proyecto

ONMi nació como un proyecto de grupo durante un bootcamp (React + Flask). Esta versión es una **reescritura completa** hecha
por mí: nueva arquitectura, TypeScript, diseño propio, modelo de datos rehecho, seguridad, tests y despliegue. Del original solo se
conservan la idea de producto y los avatares animados del seguimiento de ánimo, que he optimizado (de 11 MB a menos de 3 MB).

## Licencia

[MIT](LICENSE)
