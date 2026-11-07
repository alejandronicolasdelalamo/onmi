# Arquitectura

## Visión general

```mermaid
flowchart LR
    subgraph Browser["Navegador"]
        SPA["React + TypeScript<br/>TanStack Query · i18n · PWA"]
    end

    subgraph Server["Contenedor / servidor"]
        direction TB
        GU["gunicorn"]
        subgraph Flask["Flask (application factory)"]
            BP["Blueprints<br/>auth · notes · projects · goals<br/>habits · wellbeing · dashboard · admin"]
            SV["Servicios<br/>stats · mail · seed"]
            OA["OpenAPI + Swagger UI<br/>/docs"]
            FA["Flask-Admin<br/>/db-admin"]
        end
        GU --> Flask
    end

    DB[("PostgreSQL<br/>SQLite en local y tests")]
    SG["SendGrid<br/>(consola en desarrollo)"]
    GO["Google Identity<br/>(opcional)"]

    SPA -- "cookies httpOnly + CSRF" --> GU
    BP --> DB
    SV --> SG
    BP -. "tokeninfo" .-> GO
```

El frontend compilado lo sirve el propio Flask, así que navegador y API comparten origen: las cookies de sesión
funcionan sin CORS y sin exponer tokens a JavaScript. En desarrollo, Vite hace de proxy de `/api`.

## Flujo de autenticación

```mermaid
sequenceDiagram
    autonumber
    participant B as Navegador
    participant A as API Flask
    B->>A: POST /api/auth/login {email, password}
    A->>A: valida, cuenta intentos fallidos (bloqueo 15 min tras 5)
    A-->>B: Set-Cookie access (15 min) + refresh (14 días), ambas httpOnly<br/>+ csrf_access_token / csrf_refresh_token legibles
    B->>A: GET /api/dashboard (cookie)
    A-->>B: 200
    B->>A: POST /api/notes (cookie + cabecera X-CSRF-TOKEN)
    A-->>B: 201
    Note over B,A: El access token caduca
    B->>A: GET /api/habits
    A-->>B: 401 token_expired
    B->>A: POST /api/auth/refresh (cookie de refresh + CSRF)
    A-->>B: nueva cookie de access
    B->>A: reintenta GET /api/habits
    A-->>B: 200
```

## Modelo de datos

```mermaid
erDiagram
    USERS ||--o{ NOTES : escribe
    USERS ||--o{ PROJECTS : tiene
    USERS ||--o{ GOALS : define
    USERS ||--o{ HABITS : sigue
    USERS ||--o{ MOOD_ENTRIES : registra
    USERS ||--o{ POMODORO_SESSIONS : completa
    USERS ||--o{ AUTH_TOKENS : recibe
    PROJECTS ||--o{ GOALS : contiene
    PROJECTS ||--o{ NOTES : "se vincula (SET NULL)"
    PROJECTS ||--o{ POMODORO_SESSIONS : "enfoque en (SET NULL)"
    GOALS ||--o{ HABITS : "impulsa (SET NULL)"
    GOALS ||--o{ NOTES : "se vincula (SET NULL)"
    HABITS ||--o{ HABIT_LOGS : "días cumplidos"

    USERS {
        int id PK
        string email UK
        string password_hash "nullable (Google/demo)"
        enum role "user | admin"
        bool is_active
        bool email_verified
        string google_id UK
        string locale "en | es"
        int failed_logins
        datetime locked_until
    }
    AUTH_TOKENS {
        int id PK
        int user_id FK
        enum kind "verify_email | reset_password"
        string token_hash UK "SHA-256, nunca en claro"
        datetime expires_at
        bool used
    }
    PROJECTS {
        int id PK
        string name
        enum status "todo | in_progress | done"
        enum priority "low | medium | high"
        date due_date
        int position "orden dentro de la columna Kanban"
    }
    GOALS {
        int id PK
        string title
        bool done
        date due_date
    }
    NOTES {
        int id PK
        string title
        text content "Markdown"
        json tags
        bool pinned
    }
    HABITS {
        int id PK
        string name
        string color
        bool archived
    }
    HABIT_LOGS {
        int id PK
        int habit_id FK
        date day "UNIQUE(habit_id, day)"
    }
    MOOD_ENTRIES {
        int id PK
        date day "UNIQUE(user_id, day)"
        enum mood "happy | love | neutral | mad | sad"
    }
    FRIENDSHIPS {
        int id PK
        int requester_id FK
        int addressee_id FK
        string pair_key "UNIQUE: una fila por pareja"
        enum status "pending | accepted"
    }
    CHEERS {
        int id PK
        int from_user_id FK
        int to_user_id FK
        date day "UNIQUE(from, to, day)"
    }
    POMODORO_SESSIONS {
        int id PK
        string kind "work | break"
        int duration_seconds
        bool completed
    }
```

## Decisiones de diseño

| Decisión | Motivo |
| --- | --- |
| JWT en **cookies httpOnly** + CSRF por doble envío | El token no es accesible desde JavaScript, por lo que un XSS no puede robar la sesión. |
| El rol se lee **de la base de datos**, no del token | Desactivar a un usuario o quitarle el rol admin surte efecto de inmediato, sin esperar a que caduque el JWT. |
| Tokens de verificación y reseteo **hasheados (SHA-256)**, de un solo uso y con caducidad | Una fuga de la base de datos no permite resetear contraseñas. Pedir un token nuevo invalida los anteriores. |
| `get_owned()` devuelve **404** (no 403) para objetos de otro usuario | No se revela la existencia de recursos ajenos y se evita el IDOR. |
| `forgot-password` responde siempre 200 | Evita enumerar qué emails están registrados. |
| Esquemas **Pydantic** con `extra="forbid"` | Validación estricta; un cliente no puede enviar campos como `role` en el registro. |
| Hábitos como filas `habit_logs` con `UNIQUE(habit_id, day)` | Marcar/desmarcar es idempotente y las rachas se calculan con funciones puras y testeadas. |
| Kanban con `position` reindexado en servidor | Un movimiento actualiza las dos columnas afectadas de forma consistente; el cliente aplica actualización optimista. |
| Temporizador por **hora de fin**, no restando 1 s por tick | Sigue siendo exacto con la pestaña en segundo plano. |
| OpenAPI generado desde los esquemas Pydantic | La documentación en `/docs` no se desincroniza del código. |
| Códigos de error estables (`error.code`) | El frontend traduce los mensajes por código; la API no depende del idioma. |
| Compañeros: `pair_key` único (`menor-mayor`) y vista por **lista blanca** | Una sola relación por pareja aunque se pidan a la vez, y un compañero nunca recibe campos privados por descuido al añadir columnas. |
| Hábitos **privados por defecto** (`shared = false`) | Compartir es una decisión explícita, hábito a hábito. |
| Un ánimo al día por pareja (`UNIQUE(from, to, day)`) | La regla vive en la base de datos, así que no se salta con peticiones concurrentes. |
