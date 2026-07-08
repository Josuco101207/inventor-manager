# Capítulo 15: Modelo de Seguridad y Reglas de Firestore

> [!IMPORTANT]
> Este capítulo describe exhaustivamente el modelo de seguridad implementado en la capa de datos (Cloud Firestore) de *Inventor Manager*. Las reglas de seguridad (`firestore.rules`) actúan como la última y más importante barrera defensiva de la aplicación, garantizando la integridad transaccional, la validación de esquemas y la auditoría de los movimientos.

## 1. Arquitectura del Modelo de Seguridad

El modelo de seguridad en Firestore de *Inventor Manager* está diseñado bajo la filosofía **"Zero Trust"** a nivel de cliente. Esto significa que ninguna petición proveniente de una aplicación web, móvil o cualquier otro cliente no confiable es aceptada sin pasar por una rigurosa batería de validaciones en el servidor. 

Este enfoque se asienta sobre cuatro pilares fundamentales:
1. **Control de Acceso Basado en Roles (RBAC)** jerárquico.
2. **Control de Acceso a Nivel de Registro (ABAC/Scopes)** mediante categorías permitidas.
3. **Validación Estricta de Esquemas** (Data typing, longitudes, obligatoriedad).
4. **Protección Criptográfica (Append-Only)** del historial de auditoría.

---

## 2. Modelo de Seguridad Basado en Roles (RBAC) y Ámbitos (Scopes)

El sistema opera con dos niveles principales de roles, evaluados de forma asíncrona pero inmediata gracias al almacenamiento en los documentos `users/{userId}`.

### 2.1 Definición de Roles

- **Admin**: Acceso total al sistema. Puede gestionar usuarios, anular movimientos, eliminar registros maestros (facturas, categorías) y operar sobre cualquier categoría de inventario.
- **Almacenista (Staff)**: Acceso operativo. Puede realizar movimientos de inventario y gestionar catálogos, pero **exclusivamente** dentro de las categorías que le han sido asignadas. No puede borrar facturas ni usuarios, y jamás puede modificar el historial.

### 2.2 Funciones Auxiliares (Helpers) de Autorización

Para mantener el código de las reglas modular y legible, se implementan funciones que evalúan el token de autenticación (JWT) y el estado del usuario en la base de datos:

```javascript
function signedIn() {
  return request.auth != null;
}

function userDoc() {
  return get(/databases/$(database)/documents/users/$(request.auth.uid));
}

function isAdmin() {
  return hasUserDoc() && userDoc().data.role == 'admin';
}

function isStaff() {
  return hasUserDoc() &&
    (userDoc().data.role == 'admin' || userDoc().data.role == 'almacenista');
}
```

> [!TIP]
> El uso de `get()` en `userDoc()` consume una lectura adicional en Firestore. Para mitigar costos y mejorar la latencia, Firebase cachea estas llamadas durante la evaluación de la petición cuando se consulta el mismo documento múltiple veces.

### 2.3 Autorización por Ámbitos (Category Scoping)

Un aspecto altamente sofisticado del sistema es el control dinámico por categorías. Un almacenista no tiene acceso global; su alcance de acción está confinado a arreglos específicos almacenados en su perfil:

```javascript
function allowedCategories() { return userDoc().data.allowedCategories; }
function editableCategories() { return userDoc().data.editableCategories; }

function canCreateCategory(category) {
  return isAdmin() || (isStaff() && category in allowedCategories());
}
```
*Por qué es vital:* Evita que un almacenista de "Electrónica" modifique accidental o intencionadamente el inventario de "Mobiliario".

---

## 3. Validación de Schemas en el Servidor (Server-Side Validation)

Dado que Firestore es una base de datos NoSQL y *schemaless* por naturaleza, la responsabilidad de garantizar que la estructura de los datos sea correcta recae íntegramente en `firestore.rules`.

### 3.1 Integridad de Datos en la Colección `items`

Cuando se crea o actualiza un ítem en el inventario, el servidor evalúa:
1. **Presencia de campos:** `request.resource.data.keys().hasAny(['name', 'category'])`
2. **Tipado estricto:** `request.resource.data.name is string`
3. **Validación de longitud/rangos:** `request.resource.data.name.size() >= 2`
4. **Validación de tiempos:** Uso del helper `validTimestamp('timestamp')`

```javascript
allow create: if isStaff() 
  && canCreateCategory(request.resource.data.category)
  && request.resource.data.keys().hasAny(['name', 'category'])
  && request.resource.data.name is string
  && request.resource.data.name.size() >= 2
  && request.resource.data.name.size() <= 100
  && validTimestamp('timestamp');
```

> [!WARNING]
> Cualquier petición del cliente que intente inyectar un tipo de dato diferente (ej. un número en lugar de string para el nombre) o un payload vacío, será rechazada inmediatamente con un error `PERMISSION_DENIED`, protegiendo a la aplicación web de renderizar información corrupta.

### 3.2 Listas Restrictivas (Enums)

Para los movimientos de inventario, se bloquean entradas maliciosas o con errores tipográficos restringiendo la acción a un conjunto cerrado (Enum):

```javascript
&& request.resource.data.action in ['Entrada', 'Salida', 'Préstamo', 'Devolución', 'Falla/Manto', 'Auditoría', 'Alta', 'Edición', 'Eliminación', 'Anulación', 'Asignación', 'Transferencia', 'Movimiento de Sección']
```

---

## 4. Protección "Append-Only" en Movimientos

El corazón de la trazabilidad en *Inventor Manager* reside en la colección `/movements`. Esta colección sirve como un "Ledger" (libro mayor) de auditoría, donde cada transacción queda registrada inmutablemente.

### 4.1 Inmutabilidad de las Creaciones
Cualquier miembro del Staff puede crear un movimiento, sujeto a validaciones estrictas, garantizando que el campo de cantidad (`qty`) sea numérico y positivo, y que corresponda a una categoría autorizada.

### 4.2 Proceso Estricto de Anulación (Update)
**Nunca se permite editar la cantidad, el artículo, ni la acción de un movimiento pasado.** Si un movimiento fue un error, la única vía permitida es la "Anulación". Esto se logra interceptando los cambios a nivel de `diff()` en las reglas:

```javascript
allow update: if isAdmin()
  && request.resource.data.diff(resource.data).affectedKeys().hasOnly(['annulled', 'annulledBy', 'annulledAt'])
  && request.resource.data.annulled == true
  && resource.data.annulled != true;  // Solo una vez
```

*Análisis de la línea clave:* `affectedKeys().hasOnly([...])` garantiza que **solo** los campos relacionados con la anulación pueden ser modificados. Todo el payload original permanece intacto. Además, solo un `Admin` puede ejecutar esta acción, y solo se puede anular una vez (`resource.data.annulled != true`).

### 4.3 Bloqueo Absoluto de Eliminaciones

```javascript
// NUNCA permitir borrar movimientos (auditoría)
allow delete: if false;
```
> [!CAUTION]
> Esta regla es inviolable e innegociable. Nadie, ni siquiera un Administrador del sistema mediante el cliente web, puede eliminar un documento de la colección `movements`. Cualquier "limpieza" requeriría acceso directo a la consola de Google Cloud Platform con permisos de IAM, dejando así rastro fuera de la app.

---

## 5. Políticas de Acceso por Colección (Matriz de Permisos)

El acceso a las colecciones individuales sigue un mapa de permisos granular. A continuación se presenta la tabla resumen y la explicación detallada de cada sector.

| Colección / Ruta | Lectura (Read) | Creación (Create) | Actualización (Update) | Eliminación (Delete) |
| :--- | :--- | :--- | :--- | :--- |
| `users` | Propio / Admin | Propio / Admin | Propio (básico) / Admin | Admin |
| `items` | Staff | Staff (Scoped) | Staff (Scoped) | Staff (Scoped) |
| `movements` | Staff | Staff | Admin (Solo anular) | **Bloqueado** |
| `personnel` | Staff | Staff | Staff | Staff |
| `brands` / `locations` | Staff | Staff | Staff | Staff |
| `custom_categories` | Staff | Staff | Staff | Admin |
| `invoices` | Staff | Staff | Staff | Admin |
| `whatsapp_users` | Admin | Admin | Admin | Admin |
| `stats` | Staff | **Bloqueado** (Cloud Fn) | **Bloqueado** (Cloud Fn) | **Bloqueado** (Cloud Fn) |

### 5.1 Colección: `users`
Diseñada para prevenir escalamiento de privilegios.
- **Seguridad en la Inyección:** Al actualizar el perfil (por ejemplo, cambio de nombre), un usuario normal está restringido mediante `affectedKeys().hasOnly(['name', 'displayName', 'email', 'photoURL', 'sysKey'])`.
- Si un usuario malicioso intenta enviar un payload del tipo `{ name: "Pedro", role: "admin" }`, la regla `!('role' in request.resource.data.diff(resource.data).affectedKeys())` capturará y bloqueará la petición asíncronamente.
- **Blindaje de Credenciales:** La regla fuerza que la aplicación jamás almacene contraseñas en texto plano: `!('password' in request.resource.data)`.

### 5.2 Colección: `stats`
La colección `stats` actúa como caché rápida para los dashboards del sistema. Para evitar corrupciones de información derivadas de condiciones de carrera (Race conditions) en los clientes, toda la escritura del lado del cliente está bloqueada:
```javascript
match /stats/{docId} {
  allow read: if isStaff();
  allow write: if false;  // Solo Cloud Functions
}
```
> [!NOTE]
> Esta configuración asume una arquitectura **Event-Driven**. Los clientes escriben en `items` o `movements`, y son los *Triggers* de Firebase Cloud Functions (que operan en un entorno seguro con el SDK de Admin e ignoran estas reglas) los encargados de recalcular los contadores globales en la colección `stats`.

---

## 6. Conclusión y Mejores Prácticas

El archivo `firestore.rules` del proyecto **Inventor Manager** encapsula la lógica de negocio más crítica y asegura que la aplicación cumpla con rigurosos estándares de seguridad y auditoría empresarial. 

A través del uso ingenioso de `diff()`, el enjaulamiento de actualizaciones (Scope Sandboxing), y la arquitectura en capas (Delegando operaciones pesadas/críticas a Cloud Functions bloqueando escrituras directas), el sistema es extremadamente resiliente a vectores de ataque tales como Inyección de Datos Masiva, Escalamiento de Privilegios, e intentos de corrupción del Ledger de Auditoría.
