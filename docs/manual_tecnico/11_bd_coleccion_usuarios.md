# 11. Base de Datos: Colección `users`

## 1. Introducción

La colección `users` en Firestore es el núcleo de la gestión de identidad, control de acceso y autorización dentro de **Inventor Manager**. Aunque Firebase Authentication maneja la autenticación subyacente (inicio de sesión, validación de contraseñas y correos electrónicos), la colección `users` extiende esta funcionalidad almacenando metadatos cruciales como los roles del usuario, los permisos granulares sobre las categorías de inventario y las vistas a las que tienen acceso.

Este capítulo analiza exhaustivamente la estructura de esta colección, el ciclo de vida de los datos, los mecanismos de actualización de permisos y cómo las Reglas de Seguridad de Firestore (Firestore Rules) protegen esta información.

---

## 2. Estructura de Datos (Campos del Documento)

Cada documento en la colección `users` tiene como ID el mismo `uid` generado por Firebase Authentication. Esto permite una relación 1:1 directa y segura. Un documento típico contiene los siguientes campos:

| Campo | Tipo | Descripción |
| :--- | :--- | :--- |
| `name` | String | Nombre real o completo del usuario. |
| `displayName` | String | Nombre a mostrar en la interfaz de usuario (a menudo coincide con `name`). |
| `email` | String | Dirección de correo electrónico asociada a la cuenta (coincide con Firebase Auth). |
| `role` | String | Rol principal en el sistema. Puede ser `admin`, `almacenista` o `user`. |
| `allowedCategories` | Array[String] | Lista de categorías (ej. "Tornillería", "Electrónica") donde el usuario tiene permiso para **Agregar/Crear** nuevos items. |
| `editableCategories` | Array[String] | Lista de categorías donde el usuario tiene permiso para **Editar o Eliminar** items existentes. |
| `allowedViews` | Array[String] | Lista de identificadores de las vistas/rutas del menú lateral a las que el usuario puede acceder. |
| `sysKey` | String | Almacenamiento en texto plano de la contraseña del usuario (ver sección de *Seguridad* para el análisis de este diseño). |
| `passwordChangedAt` | Timestamp | Fecha y hora en la que se modificó la contraseña por última vez. |
| `createdAt` | Timestamp | Fecha y hora de la creación del registro en el sistema. |

### Ejemplo de Documento JSON

```json
{
  "name": "Juan Pérez",
  "displayName": "Juan Pérez",
  "email": "juan@empresa.com",
  "role": "almacenista",
  "allowedCategories": ["Tornillería", "Herramientas"],
  "editableCategories": ["Tornillería"],
  "allowedViews": ["dashboard", "tornilleria", "herramientas", "transactions"],
  "sysKey": "Temporal123!",
  "passwordChangedAt": { "seconds": 1698765432, "nanoseconds": 0 },
  "createdAt": { "seconds": 1698765432, "nanoseconds": 0 }
}
```

---

## 3. Vistas Permitidas (`allowedViews`)

La aplicación implementa un sistema de control de acceso basado en vistas (View-Based Access Control). La interfaz lee el arreglo `allowedViews` del documento del usuario autenticado y muestra u oculta elementos del menú lateral en consecuencia.

Los identificadores de vista disponibles en el sistema son:

1. `dashboard`: Dashboard (Inicio) - *Acceso base, normalmente no se restringe.*
2. `tornilleria`: Sección de Tornillería.
3. `papeleria`: Sección de Papelería.
4. `herramientas`: Sección de Herramientas.
5. `impresion-3d`: Sección de Impresión 3D.
6. `electronica`: Sección de Electrónica.
7. `general`: Inventario General.
8. `almacen-temporal`: Almacén Temporal.
9. `parques`: Sección de Parques.
10. `transactions`: Transacciones (Historial de movimientos).
11. `facturas`: Registro de Facturas.
12. `analytics`: Analíticas y Gráficas del sistema.

> [!NOTE]
> Las vistas core como el perfil (`profile`) o el `dashboard` suelen ser accesibles por defecto o están exentas del bloqueo manual en la interfaz administrativa para prevenir que los usuarios queden atrapados en un "estado sin interfaz".

---

## 4. Gestión de Roles y Permisos en el Cliente (`UserManagementView.jsx`)

La administración de los usuarios recae en la vista `UserManagementView.jsx`, la cual está reservada para usuarios con rol `admin`.

### 4.1. Creación de Usuarios
Cuando un administrador crea un nuevo usuario, el sistema debe crear tanto la cuenta en Firebase Auth como el documento en Firestore. Para evitar que la sesión del administrador se cierre (comportamiento por defecto de `createUserWithEmailAndPassword` en el SDK cliente), el sistema utiliza una técnica avanzada:
**Instanciación de una App Secundaria:**
Se inicializa una instancia temporal de la app de Firebase (`initializeApp(firebaseConfig, "Secondary_...")`). La cuenta se crea en esta instancia secundaria, se guarda el documento en Firestore (usando la instancia primaria de BD) y luego se destruye la app secundaria (`deleteApp`).

### 4.2. Actualización de Permisos (Categorías y Vistas)
El administrador puede alternar permisos utilizando botones integrados en el panel expansible de cada usuario. Al activar un permiso (ej. "Agregar" en "Herramientas"):
1. Se añade la categoría al array `allowedCategories`.
2. Automáticamente, el sistema verifica si la vista asociada (ej. `herramientas`) está en `allowedViews`. Si no lo está, la inyecta. Esto asegura que el usuario no tenga permisos de escritura en una sección a la que no puede navegar visualmente.

---

## 5. Análisis de Seguridad y Firestore Rules

La protección de esta colección es vital. Las reglas de seguridad de Firestore (ubicadas en `firestore.rules`) establecen controles estrictos.

### 5.1. Lectura
```javascript
allow read: if signedIn() && (request.auth.uid == userId || isAdmin());
```
- **Privacidad garantizada:** Un usuario estándar (`user` o `almacenista`) solo puede descargar y leer su propio documento.
- **Acceso global:** Los administradores (`isAdmin()`) pueden listar y leer los documentos de todos los usuarios.

### 5.2. Creación
```javascript
allow create: if signedIn()
  && !('password' in request.resource.data)
  && (isAdmin() || request.auth.uid == userId);
```
- Se prohíbe explícitamente guardar un campo llamado `password` directamente. (Por eso el sistema utiliza `sysKey`).
- Solo un administrador, o el propio usuario (en un escenario de primer login / auto-registro, si estuviera habilitado), puede crear el documento.

### 5.3. Actualización y el "Role Mutability Bug"
El control de actualización posee la lógica de validación más compleja:
```javascript
allow update: if signedIn()
  && !('password' in request.resource.data)
  && !('role' in request.resource.data.diff(resource.data).affectedKeys())
  && (
    isAdmin()
    || (
      request.auth.uid == userId
      && request.resource.data.diff(resource.data).affectedKeys().hasOnly(['name', 'displayName', 'email', 'photoURL', 'sysKey'])
    )
  );
```
**Análisis de la Regla:**
1. Los usuarios estándar solo pueden actualizar sus propios documentos.
2. Un usuario estándar está severamente limitado en los campos que puede modificar (usando `hasOnly`). Solo puede alterar metadatos básicos y su `sysKey` (cuando cambia la contraseña).
3. **El Bloqueo del Rol:** Existe una validación global `!('role' in request.resource.data.diff(resource.data).affectedKeys())`. Esta línea determina que **ninguna petición desde el SDK cliente puede modificar el campo `role`**. 
   
> [!WARNING]
> **Condición de Carrera / Bloqueo Arquitectónico:**
> En el archivo `UserManagementView.jsx` (Línea 134), existe la función `toggleRole` que ejecuta: `await updateDoc(doc(db, 'users', u.id), { role: next });`.
> Debido a que la restricción del rol en `firestore.rules` se aplica *globalmente* a la regla de actualización (fuera del bloque `isAdmin()`), **cuando un administrador intente cambiar el rol de un usuario desde el frontend, Firestore rechazará la solicitud con un error "Missing or insufficient permissions"**. 
> Para solucionar esto, el sistema debería trasladar el cambio de rol a una **Cloud Function** (que opera con privilegios de Admin SDK y sortea las reglas), o modificar `firestore.rules` para permitir que el rol sea modificado *solo* si el solicitante es administrador.

### 5.4. Eliminación
```javascript
allow delete: if isAdmin() && request.auth.uid != userId;
```
Solo los administradores pueden borrar documentos, e incorpora una medida "Anti-Suicidio": un administrador no puede borrar su propio documento (`request.auth.uid != userId`), previniendo que el sistema se quede sin administradores de forma accidental.

---

## 6. Manejo de Contraseñas (El campo `sysKey`)

Uno de los diseños particulares de esta colección es la existencia del campo `sysKey`, el cual almacena la contraseña del usuario en **texto plano**.

### 6.1. Propósito
Este enfoque se tomó para satisfacer un requerimiento operativo: los administradores necesitan poder visualizar las contraseñas de los usuarios para soporte técnico o recuperación inmediata ("Ver Contraseña" en la UI).

### 6.2. Implementación Segura en UI
Para mitigar el riesgo de exponer contraseñas en texto plano a cualquiera que deje su sesión abierta:
- La UI oculta las contraseñas por defecto.
- Al hacer clic en "Ver Contraseña", el sistema obliga al administrador a **re-autenticarse**.
- Para ello, se instancia una App Secundaria de Firebase y se ejecuta `signInWithEmailAndPassword` contra Firebase Auth validando la contraseña que introduce el admin. Solo si el login secundario es exitoso (es decir, el usuario en la silla de verdad conoce la contraseña de admin actual), la UI revela el valor del campo `sysKey` del usuario objetivo.

### 6.3. Sincronización
Cuando un administrador cambia la contraseña de un usuario, el sistema usa nuevamente la App Secundaria, hace login en Auth, actualiza la contraseña de Auth e inmediatamente actualiza el campo `sysKey` y `passwordChangedAt` en el documento del usuario en Firestore.

> [!CAUTION]
> Aunque este flujo está protegido en la capa de UI, almacenar contraseñas en texto plano (incluso bajo un campo ofuscado como `sysKey`) no es una buena práctica de seguridad moderna. Si la base de datos se filtra a nivel de servidor o por un error de configuración de las Firestore Rules (ej. si `isAdmin` se ve comprometido), todas las contraseñas quedarían expuestas.

## 7. Conclusión

La colección `users` es robusta en su capacidad de definir permisos sumamente granulares, cruzando el acceso visual (`allowedViews`) con el acceso transaccional (`allowedCategories`). Las reglas de seguridad de Firestore proporcionan una barrera infranqueable que garantiza que los usuarios no puedan escalar privilegios por sí mismos. No obstante, se debe atender urgentemente el bloqueo de mutación de roles causado por la actual configuración global del `diff` de Firestore Rules para garantizar la operatividad plena del módulo de administración.
