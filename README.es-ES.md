# Actual Budget REST API (Envoltorio de la API de Actual Budget)

Una API REST segura de Node.js/Express que envuelve el SDK de Actual Budget (`@actual-app/api`). Proporciona autenticación basada en JWT con control de acceso basado en roles, OAuth2 opcional para n8n, API de administración para la gestión de clientes OAuth, soporte de base de datos PostgreSQL o SQLite, documentación Swagger y un entorno de ejecución endurecido (helmet, CORS, registro estructurado, límites de tasa por ruta).

![Inicio de sesión de Actual REST API](images/login.png)

![Swagger UI de Actual REST API](images/swaggerui.png)

```
# Crear una Cuenta

## Obtener Token
TOKEN=$(
    curl http://localhost:3000/v2/auth/login \
    -H "Content-Type: application/json" \
    -X POST \
    -d '{"username":"admin","password":"admin"}' \
    -s | jq -r '.access_token' \
)

## Obtener Cuentas
curl http://localhost:3000/v2/accounts \
-H "Authorization: Bearer $TOKEN"

## Crear cuenta 'test'
curl http://localhost:3000/v2/accounts \
-H "Authorization: Bearer $TOKEN" \
-H "Content-Type: application/json" \
-d '{"account":{"name":"test","offbudget":true,"closed":true},"initialBalance":500}'

## Obtener Cuentas, mostrando 'test'
curl http://localhost:3000/v2/accounts \
-H "Authorization: Bearer $TOKEN"
```

![Creación de cuenta de prueba](images/test_account.png)

## Características
- Autenticación: Tokens de acceso/actualización JWT, inicio de sesión con sesión para documentos, control de acceso basado en roles (RBAC)
- OAuth2 opcional: flujo de primera parte para n8n (`/oauth/authorize`, `/oauth/token`)
- API de administración: puntos de conexión para gestión de clientes OAuth (`/admin/oauth-clients`) con hash seguro de secretos
- Puntos de conexión: cuentas, transacciones, presupuestos, categorías, beneficiarios, reglas, programaciones, consulta
- Documentación de API: Swagger UI protegido en `/docs` con fuente OpenAPI en [src/docs/openapi.yml](src/docs/openapi.yml)
- Soporte de base de datos: PostgreSQL (recomendado para producción) o SQLite (predeterminado, configuración más sencilla)
- Seguridad: cabeceras helmet, IDs de solicitud, revocación de tokens, limitación de tasa, validación de entrada, secretos OAuth hasheados con bcrypt
- Validación de entorno: Validación automática de todas las variables de entorno al iniciar
- Métricas: Recopilación de métricas Prometheus integrada en el punto de conexión `/v2/metrics/prometheus`
- Monitorización: Configuración preconfigurada de Prometheus y Grafana para visualización de métricas en tiempo real (ver [monitoring/](monitoring/))
- Comprobaciones de salud: Punto de conexión de salud exhaustivo con comprobaciones de conectividad de base de datos y API
- Soporte Redis: Redis opcional para limitación de tasa distribuida (fallback a memoria)
- Docker: imagen de producción + pila de desarrollo `docker compose` (Servidor Actual + n8n + Redis + Prometheus + Grafana)

## Requisitos
- Node.js 22+ y npm
- Docker y Docker Compose (para el flujo de trabajo de desarrollo recomendado)
- Credenciales del Servidor Actual Budget (o usar la pila de desarrollo `docker compose`)
- Para OAuth2 con n8n (opcional): instancia de n8n y credenciales de cliente
- Para producción: Gestor de secretos (GitHub Secrets, AWS Secrets Manager, etc.) para la gestión segura de variables de entorno

## Instalación y Configuración

Esta sección cubre el despliegue en producción. Para la configuración de desarrollo, ver la sección [Desarrollo](#desarrollo) a continuación.

### Requisitos previos

1. **Clonar el repositorio con submódulos**:
   ```bash
   git clone --recurse-submodules https://github.com/ZoneMix/actual-budget-rest-api.git
   cd actual-budget-rest-api
   ```
   
   **Importante**: La opción `--recurse-submodules` es necesaria porque este proyecto incluye el `n8n-nodes-actual-budget-rest-api` como submódulo de git. Si ya lo has clonado sin ella, ejecuta:
   ```bash
   git submodule update --init --recursive
   ```

2. **Docker y Docker Compose** (para despliegue en contenedores):
   - Docker 20.10+ y Docker Compose 2.0+
   - O usar la imagen de Docker de producción directamente

### Variables de entorno mínimas

Crea un archivo `.env` con las siguientes **variables mínimas requeridas** para producción:

```bash
# Entorno de la aplicación
NODE_ENV=production

# Credenciales de administración
ADMIN_USER=admin
ADMIN_PASSWORD=YourSecurePassword123!  # Debe cumplir requisitos de complejidad (12+ caracteres, mayúsculas, minúsculas, número, carácter especial)

# Secretos JWT (DEBEN tener 32+ caracteres en producción)
JWT_SECRET=your-jwt-secret-at-least-32-characters-long
JWT_REFRESH_SECRET=your-refresh-secret-different-from-jwt-secret
SESSION_SECRET=your-session-secret-different-from-jwt-secrets

# Conexión al Servidor Actual Budget
ACTUAL_SERVER_URL=https://your-actual-server.com  # URL de tu Servidor Actual de producción
ACTUAL_PASSWORD=your-actual-server-password
ACTUAL_SYNC_ID=tu-budget-sync-id
```

**Generar secretos seguros**:
```bash
# Generar secretos seguros (32+ caracteres) - ¡usar valores diferentes para cada uno!
openssl rand -base64 32  # Para JWT_SECRET
openssl rand -base64 32  # Para JWT_REFRESH_SECRET (¡debe ser diferente!)
openssl rand -base64 32  # Para SESSION_SECRET (debe ser diferente!)
```

**Nota de seguridad**: En producción, todos los secretos deben ser:
- De al menos 32 caracteres de longitud
- Únicos (nunca reutilizar el mismo secreto para diferentes propósitos)
- Generados aleatoriamente (usar `openssl rand -base64 32`)

Ver [.env.example](.env.example) para la lista completa de todas las variables de entorno disponibles con descripciones.

### Gestión de entornos para producción

**Para despliegues en producción, usar un gestor de secretos** para gestionar de forma segura las variables de entorno. Este es el enfoque recomendado para pipelines CI/CD, Kubernetes y despliegues en la nube.

#### Opción 1: GitHub Actions / GitHub Secrets (Recomendado para CI/CD)

1. **Almacenar secretos en GitHub**:
   - Ir a tu repositorio → Settings → Secrets and variables → Actions
   - Añadir cada variable de entorno como un secreto (por ejemplo, `ADMIN_PASSWORD`, `JWT_SECRET`, etc.)

2. **Usar en el flujo de trabajo de GitHub Actions**:
   ```yaml
   - name: Deploy to production
     env:
       ADMIN_PASSWORD: ${{ secrets.ADMIN_PASSWORD }}
       JWT_SECRET: ${{ secrets.JWT_SECRET }}
       JWT_REFRESH_SECRET: ${{ secrets.JWT_REFRESH_SECRET }}
       # ... otros secretos
     run: docker compose up -d --build
   ```

#### Opción 2: AWS Secrets Manager / Parameter Store

1. **Almacenar secretos en AWS**:
   ```bash
   aws secretsmanager create-secret \
     --name actual-rest-api/admin-password \
     --secret-string "YourSecurePassword123!"
   ```

2. **Recuperar e inyectar en el despliegue**:
   ```bash
   export ADMIN_PASSWORD=$(aws secretsmanager get-secret-value \
     --secret-id actual-rest-api/admin-password \
     --query SecretString --output text)
   ```

#### Opción 3: Kubernetes Secrets

1. **Crear secretos**:
   ```bash
   kubectl create secret generic actual-rest-api-secrets \
     --from-literal=ADMIN_PASSWORD='YourSecurePassword123!' \
     --from-literal=JWT_SECRET='your-jwt-secret' \
     # ... otros secretos
   ```

2. **Referenciar en el despliegue**:
   ```yaml
   env:
     - name: ADMIN_PASSWORD
       valueFrom:
         secretKeyRef:
           name: actual-rest-api-secrets
           key: ADMIN_PASSWORD
   ```

#### Opción 4: Docker Compose con archivo .env (Solo desarrollo)

Para desarrollo local, puedes usar un archivo `.env`:
```bash
cp .env.example .env
# Editar .env con tus valores
docker compose up -d --build
```

**⚠️ Importante**: Nunca hacer commit de archivos `.env` a git. Siempre usar gestores de secretos en producción.

### Despliegue en producción

**Docker Compose con PostgreSQL** (recomendado para producción):
```bash
# Establecer variables de entorno mediante gestor de secretos o archivo .env
# Requerido: DB_TYPE=postgres y parámetros de conexión PostgreSQL
# POSTGRES_URL=postgresql://user:password@postgres:5432/database
# O usar parámetros individuales: POSTGRES_HOST, POSTGRES_PORT, POSTGRES_DB, POSTGRES_USER, POSTGRES_PASSWORD
docker compose -f docker-compose.prod.postgres.yml up -d --build
```

**Docker Compose con SQLite** (más sencillo, contenedor único):
```bash
# Establecer variables de entorno mediante gestor de secretos o archivo .env
# Requerido: DB_TYPE=sqlite
docker compose -f docker-compose.prod.sqlite.yml up -d --build
```

**Nota**: Para producción, inyectar variables de entorno desde tu gestor de secretos (GitHub Secrets, AWS Secrets Manager, etc.) en lugar de usar archivos `.env`.

**Imagen Docker**:
```bash
docker build -t actual-rest-api:latest .
docker run -d \
  --name actual-rest-api \
  -e ADMIN_PASSWORD="$ADMIN_PASSWORD" \
  -e JWT_SECRET="$JWT_SECRET" \
  -e JWT_REFRESH_SECRET="$JWT_REFRESH_SECRET" \
  -e DB_TYPE=postgres \
  -e POSTGRES_URL="postgresql://user:password@host:5432/database" \
  # ... añadir todas las demás variables de entorno requeridas del gestor de secretos
  -v $(pwd)/data/actual-api:/app/.actual-cache \
  -p 3000:3000 \
  actual-rest-api:latest
```

**Nota**: En producción, recuperar secretos de tu gestor de secretos y pasarlos como variables de entorno. Nunca codificar secretos en scripts ni hacer commit de ellos en el control de versiones.

**Lista de verificación para producción**:
- ✅ Usar gestor de secretos (GitHub Secrets, AWS Secrets Manager, etc.) para todas las variables de entorno sensibles
- ✅ Usar HTTPS con proxy inverso (nginx, Traefik, etc.)
- ✅ Establecer `TRUST_PROXY=true` si hay proxy inverso
- ✅ Configurar `ALLOWED_ORIGINS` con dominios de producción
- ✅ Establecer `LOG_LEVEL=warn` o `error` para producción
- ✅ Configurar Redis para limitación de tasa distribuida
- ✅ Configurar monitorización (Prometheus/Grafana) - ver [monitoring/](monitoring/)
- ✅ Copias de seguridad regulares del volumen `DATA_DIR`
- ✅ Para n8n: Usar URLs de callback HTTPS, configurar credenciales OAuth2
- ✅ Nunca hacer commit de archivos `.env` o secretos en el control de versiones

## Desarrollo

### Inicio rápido (Docker - Recomendado)

1. **Configurar el entorno**:
   ```bash
   cp .env.example .env.local
   # Editar .env.local con tus valores (ver abajo para requisitos mínimos)
   ```

2. **Iniciar todos los servicios**:
   ```bash
   docker compose -f docker-compose.dev.yml up --build
   ```

3. **Configurar el Servidor Actual** (solo primera ejecución):
   - Abrir http://localhost:5006 → Establecer contraseña → Crear/abrir presupuesto
   - Obtener Sync ID de Settings → Advanced → Show Sync ID
   - Actualizar `ACTUAL_PASSWORD` y `ACTUAL_SYNC_ID` en `.env.local`
   - Reiniciar: `docker compose -f docker-compose.dev.yml restart actual-rest-api-dev`

4. **Acceder a los servicios**:
   - API: http://localhost:3000
   - Servidor Actual: http://localhost:5006
   - n8n: http://localhost:5678
   - Grafana: http://localhost:3001 (admin/admin)
   - Prometheus: http://localhost:9090

**`.env.local` mínimo para desarrollo**:
```bash
ADMIN_USER=admin
ADMIN_PASSWORD=Password123!
JWT_SECRET=dev-secret-not-for-production
JWT_REFRESH_SECRET=dev-refresh-secret-not-for-production
ACTUAL_SERVER_URL=http://actual-server-dev:5006
ACTUAL_PASSWORD=<tu-contraseña-del-servidor-actual>
ACTUAL_SYNC_ID=<tu-budget-sync-id>
```

**Nota**: En desarrollo, los secretos faltantes se generan automáticamente con advertencias. Los secretos pueden ser más cortos que los requisitos de producción.


### Monitorización

La pila de desarrollo incluye Prometheus y Grafana. Acceder a Grafana en http://localhost:3001 (admin/admin) → **Dashboards → Actual Budget REST API Metrics**.

El panel muestra tasas de solicitudes, tasas de errores, tiempos de respuesta y más. Ver [monitoring/README.md](monitoring/README.md) para detalles de configuración.


## Variables de entorno

Todas las variables se validan al iniciar. Las variables requeridas inválidas o faltantes hacen que la aplicación salga con mensajes de error claros.

### Requeridas (Producción)
- `ADMIN_USER`: Nombre de usuario de administración (predeterminado: `admin`)
- `ADMIN_PASSWORD`: Contraseña de administración (12+ caracteres, complejidad requerida)
- `JWT_SECRET`: Clave de firma JWT (32+ caracteres en producción)
- `JWT_REFRESH_SECRET`: Clave de token de actualización (32+ caracteres, diferente de `JWT_SECRET`)
- `SESSION_SECRET`: Clave de cifrado de sesión (32+ caracteres, diferente de los secretos JWT)
- `ACTUAL_SERVER_URL`: URL del Servidor Actual Budget
- `ACTUAL_PASSWORD`: Contraseña del Servidor Actual Budget
- `ACTUAL_SYNC_ID`: ID de sincronización del presupuesto

### Opcionales
- `PORT`: Puerto del servidor (predeterminado: `3000`)
- `NODE_ENV`: Modo de entorno (`development` | `production` | `test`)
- `JWT_ACCESS_TTL`: Tiempo de vida del token de acceso (predeterminado: `1h`)
- `JWT_REFRESH_TTL`: Tiempo de vida del token de actualización (predeterminado: `24h`)
- `ALLOWED_ORIGINS`: Orígenes CORS (CSV, predeterminado: `http://localhost:3000,http://localhost:5678`)
- `TRUST_PROXY`: Confiar en cabeceras proxy (predeterminado: `false`)
- `LOG_LEVEL`: Nivel de registro (predeterminado: `info`)
- `DATA_DIR`: Directorio de datos (predeterminado: `/app/.actual-cache`)
- `REDIS_URL` / `REDIS_HOST` / `REDIS_PORT` / `REDIS_PASSWORD`: Conexión Redis
- `N8N_CLIENT_ID` / `N8N_CLIENT_SECRET` / `N8N_OAUTH2_CALLBACK_URL`: OAuth2 para n8n
- `ENABLE_CORS` / `ENABLE_HELMET` / `ENABLE_RATE_LIMITING`: Conmutadores de funciones (predeterminado: `true`)
- `MAX_REQUEST_SIZE`: Tamaño máximo del cuerpo de la solicitud (predeterminado: `10kb`)
- `DB_TYPE`: Tipo de base de datos (`sqlite` | `postgres`, predeterminado: `postgres`)
- `POSTGRES_URL`: URL de conexión PostgreSQL (formato: `postgresql://user:password@host:port/database`)
- `POSTGRES_HOST` / `POSTGRES_PORT` / `POSTGRES_DB` / `POSTGRES_USER` / `POSTGRES_PASSWORD`: Detalles de conexión PostgreSQL (alternativa a `POSTGRES_URL`)

**Modo de desarrollo**: En `NODE_ENV=development`, los secretos pueden ser más cortos y los secretos faltantes se generan automáticamente con advertencias.

Ver [.env.example](.env.example) para referencia completa.

## Documentación de API y Validación
- Fuente OpenAPI: [src/docs/openapi.yml](src/docs/openapi.yml)
- Documentación local (requiere autenticación): GET `/docs`
- Validar OpenAPI:

```bash
npm run validate:openapi
```

## Flujos de autenticación
- Inicio de sesión local (sesión para documentos):
	- GET `/docs` → redirigir a `/login`
	- POST `/login` → crear sesión, luego acceder a `/docs`
- Inicio de sesión JWT:
	- POST `/v2/auth/login` con `{ "username": "admin", "password": "..." }`
	- La respuesta contiene `access_token`, `refresh_token`, `expires_in`, `scope`, `token_type`
	- Los tokens incluyen `role` y `scopes` del usuario para autorización
	- Enviar `Authorization: Bearer <access_token>` a rutas protegidas
	- Limitado a tasa: 5 solicitudes por 15 minutos
- Cierre de sesión JWT:
	- POST `/v2/auth/logout` con `refresh_token` opcional en el cuerpo
	- Revoca tanto tokens de acceso como de actualización para terminación segura de la sesión
- n8n OAuth2 (opcional):
  - Configurar variables de entorno listadas arriba
  - Puntos de conexión disponibles: `/oauth/authorize`, `/oauth/token`
  - Los secretos de cliente se hashan con bcrypt antes de almacenarlos
  - Ver [Connecting n8n](#connecting-n8n) para detalles de configuración.
- API de administración (requiere rol de administrador):
  - Acceder al panel de administración en `/admin` (interfaz HTML)
  - Gestionar clientes OAuth mediante puntos de conexión `/admin/oauth-clients`
  - Requiere token JWT con rol `admin` y alcance `admin`

## Punto de conexión Query

El punto de conexión `/v2/query` permite ejecutar consultas ActualQL contra los datos de Actual Budget:
- **Seguridad**: Lista blanca de tablas, límites de profundidad de filtros, límites de tamaño de resultados
- **Limitado a tasa**: 20 solicitudes por minuto
- **Registro de auditoría**: Todas las consultas registradas con ID de usuario y contexto de solicitud
- **Documentación**: Ver [documentación de ActualQL](https://actualbudget.org/docs/api/actual-ql/)

## Conectando n8n

### Flujo OAuth2 (Recomendado)

1. **Configurar variables de entorno**:
   ```bash
   N8N_CLIENT_ID=example-n8n
   N8N_CLIENT_SECRET=<secreto de 32+ caracteres>
   N8N_OAUTH2_CALLBACK_URL=http://localhost:5678/rest/oauth2-credential/callback
   ```

2. **En n8n, crear credencial OAuth2**:
   - Tipo: **OAuth2**
   - Authorization URL: `http://localhost:3000/oauth/authorize` (o tu URL de API)
   - Token URL: `http://actual-rest-api-dev:3000/oauth/token` (usar nombre de servicio Docker)
   - Client ID y Secret: Coincidir con tus variables de entorno
   - Redirect URL: Coincidir con `N8N_OAUTH2_CALLBACK_URL`

3. **Usar en flujos de trabajo**: Seleccionar la credencial OAuth2 en los nodos de solicitud HTTP.

**Beneficios**: Actualización automática de tokens, sin contraseñas almacenadas, tokens revocables.

### Alternativa: Bearer Token

Para desarrollo, usar tokens JWT bearer:
1. POST a `/v2/auth/login` → Obtener `access_token`
2. En el nodo HTTP de n8n, establecer cabecera: `Authorization: Bearer <token>`

**Nota**: En producción detrás de un proxy inverso, reemplazar `localhost` y nombres de host Docker con dominios reales.

## API de administración

La API de administración proporciona puntos de conexión para gestionar clientes OAuth. Todos los puntos de conexión requieren autenticación con rol de administrador.

### Accediendo al panel de administración

1. **Interfaz web**: Navegar a `/admin` en tu navegador (requiere inicio de sesión con sesión de administrador)
2. **Puntos de conexión de API**: Usar tokens JWT con rol `admin` y alcance `admin`

### Puntos de conexión de administración

- `GET /admin/oauth-clients` - Listar todos los clientes OAuth (sin secretos)
- `POST /admin/oauth-clients` - Crear un nuevo cliente OAuth (genera secreto automáticamente si no se proporciona)
- `GET /admin/oauth-clients/:clientId` - Obtener un cliente OAuth específico
- `PUT /admin/oauth-clients/:clientId` - Actualizar un cliente OAuth (secreto, alcances, URIs de redirección)
- `DELETE /admin/oauth-clients/:clientId` - Eliminar un cliente OAuth

### Ejemplo: Crear un cliente OAuth

```bash
# Obtener token de administración
TOKEN=$(curl http://localhost:3000/v2/auth/login \
  -H "Content-Type: application/json" \
  -X POST \
  -d '{"username":"admin","password":"admin"}' \
  -s | jq -r '.access_token')

# Crear un nuevo cliente OAuth
curl http://localhost:3000/admin/oauth-clients \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -X POST \
  -d '{
    "client_id": "my-app",
    "allowed_scopes": "api",
    "redirect_uris": "http://localhost:8080/callback"
  }'
```

**Nota**: El `client_secret` solo se devuelve una vez al crearlo - ¡guardarlo inmediatamente! Todos los secretos se hashan con bcrypt antes de almacenarlos.

## Comandos CLI

```bash
# Pruebas y calidad
npm test             # Ejecutar pruebas
npm run test:watch   # Ejecutar pruebas en modo watch
npm run test:coverage # Ejecutar pruebas con cobertura
npm run lint         # Lint del código
npm run audit        # Auditoría de seguridad
npm run validate:openapi  # Validar especificación OpenAPI

# Docker Desarrollo
docker compose -f docker-compose.dev.yml up --build
docker compose -f docker-compose.dev.yml logs -f actual-rest-api-dev
```

Ver [PRECOMMIT_SETUP.md](PRECOMMIT_SETUP.md) para la configuración de hooks pre-commit.

## Datos y persistencia
- **Opciones de base de datos**:
  - **PostgreSQL** (recomendado para producción): Establecer `DB_TYPE=postgres` y configurar `POSTGRES_URL` o parámetros de conexión individuales
  - **SQLite** (predeterminado, configuración más sencilla): Establecer `DB_TYPE=sqlite`, base de datos almacenada en `${DATA_DIR}/auth.db`
- **Migraciones automáticas**: Las migraciones de esquema se ejecutan al iniciar (añade columnas `role`, `scopes`, `updated_at` a la tabla de usuarios, `client_secret_hashed` a la tabla de clientes)
- **Roles y alcances de usuario**: Los usuarios tienen `role` (por ejemplo, `admin`, `user`) y `scopes` (separados por comas, por ejemplo, `api,admin`) para autorización
- **Secretos de cliente OAuth**: Todos los secretos de cliente se hashan con bcrypt antes de almacenarlos por seguridad
- La caché del SDK Actual y los datos del presupuesto son gestionados por `@actual-app/api` usando `DATA_DIR`

## Observabilidad

- **Registro**: Registros JSON estructurados (winston), respeta `LOG_LEVEL`. Cada solicitud incluye `X-Request-ID` para trazabilidad.
- **Métricas**: Punto de conexión Prometheus en `/metrics/prometheus`. Paneles de Grafana preconfigurados en [monitoring/](monitoring/).
- **Salud**: Punto de conexión `/health` devuelve 200 (saludable) o 503 (degradado). Comprueba base de datos, API Actual y recursos del sistema.

## CI / Seguridad
GitHub Actions ejecuta comprobaciones de seguridad de dependencias e imágenes:
- npm audit, ESLint, prueba de construcción Docker
- Snyk (requiere `SNYK_TOKEN` secreto)
- Escaneo de contenedor vía Trivy (SARIF subido a code scanning)
- Escaneo de secretos vía Gitleaks
- OWASP Dependency-Check (subida SARIF)

Consejos para flujos de trabajo:
- Las subidas SARIF requieren `permissions: { security-events: write, actions: read }`
- Los PRs de forks omiten subidas para evitar errores de permisos

## Estructura del proyecto
- App: [src](src)
- Rutas: [src/routes](src/routes)
- Auth: [src/auth](src/auth)
- Config: [src/config](src/config) - incluye validación de entorno
- Docs: [src/docs](src/docs)
- Logging: [src/logging](src/logging)
- Errores: [src/errors](src/errors) - clases de error personalizadas
- Middleware: [src/middleware](src/middleware) - limitación de tasa, validación, métricas, etc.
- Pruebas: [tests](tests) - Suite de pruebas Jest

## Documentación
- [ARCHITECTURE.md](ARCHITECTURE.md) - Arquitectura del sistema y patrones de diseño
- [SECURITY.md](SECURITY.md) - Modelo de seguridad y análisis de amenazas
- [.env.example](.env.example) - Referencia completa de variables de entorno
