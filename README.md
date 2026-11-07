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
- **Hábitos** con calendario de los últimos 14 días, rachas actual y máxima, heatmap estilo GitHub y tasa de cumplimiento a 30 días.
- **Notas** en Markdown con vista previa, etiquetas, búsqueda instantánea, notas fijadas y vínculo a proyectos y metas.
- **Proyectos** en un tablero Kanban con drag & drop (también con teclado), prioridad, fecha límite y progreso calculado a partir de sus metas.
- **Metas** que se enlazan con proyectos, hábitos y notas.
- **Ánimo**: registro diario con historial de 30 días, distribución y un avatar que reacciona a cómo te sientes.
- **Enfoque (Pomodoro)** con duración configurable, sonido y notificaciones, sesiones guardadas en el servidor y estadísticas.
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
| Calidad | pytest (36 tests, 93 % de cobertura), Vitest + Testing Library (34), Playwright E2E (22, incluida una auditoría de accesibilidad con axe-core), Ruff, ESLint, TypeScript estricto |
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

- **Sesión en cookies `httpOnly`** (access de 15 min y refresh de 14 días) con protección **CSRF** por doble envío. JavaScript nunca ve el JWT, así que un XSS no puede robarlo.
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
- **Móvil**: objetivos táctiles de al menos 44 px en pantallas táctiles, navegación en cajón y estadísticas en dos columnas.
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

Crear un administrador: `flask create-admin tu@email.com`.

## Tests

```bash
cd backend  && pytest --cov=app          # 36 tests
cd frontend && npm test                  # 34 tests (Vitest)
cd frontend && npx playwright install chromium && npm run e2e   # 22 tests de extremo a extremo (14 flujos + 8 de accesibilidad)
```

Los E2E arrancan solos una API con base de datos SQLite desechable y el servidor de Vite. Para regenerar las capturas de este
README: `SCREENSHOTS=1 npx playwright test screenshots`.

## Estructura

```
onmi/
├── backend/
│   ├── app/
│   │   ├── api/          # blueprints: auth, notes, projects, goals, habits, wellbeing, dashboard, admin
│   │   ├── services/     # stats (rachas), mail (consola/SendGrid), seed
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
