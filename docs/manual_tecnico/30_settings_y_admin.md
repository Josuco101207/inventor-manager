# Manual Técnico: Administración de Catálogos, Zona de Riesgo y Secciones Dinámicas

Este documento detalla la arquitectura, el flujo de datos y la implementación técnica de los módulos de configuración y administración avanzada de *Inventor Manager*, específicamente contenidos en los componentes `SettingsView.jsx` y `SectionAdminView.jsx`. Se abordará el "qué", el "cómo" y el "por qué" detrás del diseño, proveyendo a los desarrolladores y administradores de sistema una comprensión exhaustiva de estos componentes críticos.

---

## 1. Módulo de Ajustes y Catálogos (`SettingsView.jsx`)

El componente `SettingsView` funciona como el panel de control central para la personalización de catálogos simples y la gestión de bases de datos. Utiliza el contexto global `InventoryContext` para mantener un estado sincronizado a través de toda la aplicación.

### 1.1. Directorio de Marcas

El "Directorio de Marcas" permite a los usuarios normalizar las entradas de inventario mediante un catálogo centralizado, previniendo errores tipográficos o variaciones (ej. "HP", "Hewlett Packard", "Hp").

- **Implementación (El Cómo):**
  Se define un estado local `newBrand` que se actualiza vía el evento `onChange` del input. Al confirmar (vía botón o tecla `Enter`), se invoca la función `addBrand` expuesta por el contexto.
  La lista de marcas se renderiza iterando sobre el array `brands`. Cada marca posee un botón de eliminación que invoca `deleteBrand(b.id)`.
- **Decisión Arquitectónica (El Por qué):**
  Delegar el estado y las operaciones asíncronas al contexto (y por ende, a Firestore) en lugar de manejarlas localmente garantiza que cualquier otra vista (como la de creación de ítems) reciba las actualizaciones en tiempo real. 

### 1.2. Áreas y Ubicaciones

Este submódulo maneja un catálogo de dos dimensiones: **Nombre de Ubicación** (ej. "Estante A") y **Zona** (ej. "Zona 1"). 

- **Implementación:**
  Usa estados locales separados (`newLocName`, `newLocZone`) y un botón principal que invoca `addLocation(name, zone)`. Si la zona se deja en blanco, el componente renderiza un fallback visual ('Almacén General') durante el listado, pero el backend lo registra sin zona explícita.
- **Flujo de Datos:**
  El borrado se maneja a través de `deleteLocation(l.id)`. Cabe destacar que eliminar una ubicación *no* elimina los ítems asociados a ella. Los ítems quedan en un estado de ubicación "huérfana" o con la referencia en texto a la ubicación que fue eliminada, dependiendo de la estrategia de la base de datos subyacente.

---

## 2. Zona de Riesgo: Eliminación en Cascada y Backups

Esta es una sección crítica (Danger Zone) del `SettingsView`, y su renderizado está protegido condicionalmente: **sólo los usuarios con rol de administrador (`isAdmin`)** pueden visualizar e interactuar con este panel.

> [!CAUTION]
> Las acciones en la Zona de Riesgo son destructivas y permanentes. La limpieza de inventario realiza un borrado irreversible en la base de datos de producción.

### 2.1. Limpieza de Inventario (Eliminación en Cascada)

- **El Qué:** Un selector que permite elegir cualquier categoría (ya sea por defecto o customizada) y un botón que ejecuta su vaciado.
- **El Cómo:**
  1. El selector (`<select>`) combina las categorías estáticas `ALL_CATEGORIES` con las categorías dinámicas extraídas del contexto `customCategories`.
  2. Al presionar "Vaciar", se despliega un `window.confirm` de navegador.
  3. Tras la confirmación, se invoca `clearDatabaseCategories([categoryToClear])`.
- **El Por qué (Eliminación en Cascada):**
  La operación `clearDatabaseCategories` aísla todos los ítems que pertenecen a dicha categoría y los elimina de la colección principal, junto con cualquier sub-colección atada (como el historial de movimientos de ese ítem, si la estructura de Firebase lo dicta). Esto es esencial para el mantenimiento del ciclo de vida de los datos o cuando una empresa desea reiniciar la gestión de una línea específica de activos sin destruir el resto del inventario.

### 2.2. Copia de Seguridad

Se incluye un mecanismo rápido para volcar todo el inventario activo a un archivo `.xlsx`. Se hace mediante `exportFullDatabase(items)` invocando utilidades de la librería (presumiblemente `xlsx` o equivalente) para asegurar retención de datos antes de usar la Zona de Riesgo.

---

## 3. Administración de Secciones Dinámicas (`SectionAdminView.jsx`)

La vista `SectionAdminView` es el motor de los "Sub-Almacenes" en la aplicación. Permite la creación de esquemas dinámicos para activos que no encajan en el modelo estándar genérico, habilitando formularios y vistas adaptadas a casos de uso específicos (Ej. Vehículos, Software, Uniformes).

### 3.1. Arquitectura de Secciones (Sub-almacenes)

> [!IMPORTANT]
> Una sección dinámica no crea una nueva colección en la base de datos para los ítems. Los artículos seguirán existiendo en el pool de inventario global, pero la metadata de la "categoría" define qué campos extra se le aplican y en qué ruta (`/ruta-categoria`) se visualizarán filtrados.

El esquema maestro de la sección se guarda en la colección `custom_categories` de Firestore:
```json
{
  "name": "Vehículos",
  "route": "/vehiculos",
  "icon": "Car",
  "fields": [
    { "id": "uuid", "name": "Placas", "type": "text", "required": true }
  ],
  "createdBy": "Admin",
  "createdAt": "Timestamp",
  "updatedAt": "Timestamp"
}
```

### 3.2. Plantillas Rápidas (Presets)

Para facilitar la adopción, el sistema incluye un array `PRESETS` embebido con categorías industriales comunes (Vehículos, IT, Uniformes, Software, etc.).
- **Proceso de Clonación:** Al invocar `applyPreset(preset)`, el sistema copia los datos visuales (nombre e icono) pero genera **nuevos IDs pseudo-aleatorios** (`Date.now() + Math.random()`) para cada campo del preset. 
- **¿Por qué generar nuevos IDs?** Previene colisiones de react key y problemas de estado en caso de que el usuario aplique el preset más de una vez, o si hay dependencias basadas en la unicidad del ID de campo al registrar información.

### 3.3. Constructor de Campos (Form Builder)

El modo avanzado de la interfaz permite manipular directamente el esquema JSON de la sección.

```mermaid
graph TD
    A[Usuario (Admin)] -->|addField| B[Agrega Campo Vacío]
    B --> C{Tipo de Dato}
    C -->|text/number/date| D[Atributos Básicos]
    C -->|select| E[Entrada de Opciones CSV]
    D --> F[Flags booleanos: required]
    E --> F
    F --> G[Validación local]
    G --> H[Firestore]
```

**Tipos Soportados:**
- `text`, `textarea`, `number`, `date`, `boolean`
- `select`: Dispara condicionalmente el renderizado de un input extra para definir opciones ("separadas por coma").

El estado de los campos (`fields`) es gestionado por tres funciones utilitarias reactivas:
- `addField()`: Añade un objeto base a la cola.
- `removeField(id)`: Filtra el campo excluyéndolo del array.
- `updateField(id, key, value)`: Modifica de forma inmutable una propiedad específica del campo (por ejemplo, cambiar `required` de `false` a `true`).

### 3.4. Ciclo de Vida: Guardado y Sincronización a Firestore

La función `handleSave` orquesta la persistencia del esquema en la nube.
1. **Validación:** Se limpia la colección en memoria filtrando campos vacíos (`fields.filter(f => f.name.trim() !== '')`).
2. **Generación de Rutas:** Se crea un slug amigable de URL a partir del nombre ingresado: `name.trim().toLowerCase().replace(/\s+/g, '-')`.
3. **Persistencia (Upsert lógico):**
   - Si `editingId` existe, se ejecuta `updateDoc` mutando el documento original.
   - Si no existe, se inyecta `createdAt` y se guarda como nuevo documento usando `addDoc`.

> [!NOTE]
> Firebase utiliza listeners en tiempo real. Esto significa que una vez se graba o actualiza en la DB, el listado inferior ("Secciones Activas") se actualiza automáticamente por el ContextProvider subyacente sin necesidad de refrescar o realizar refetchings manuales.

### 3.5. Eliminación de Secciones (Soft Delete a nivel ítem)

Cuando un administrador elimina una sección dinámica (`deleteDoc(doc)`), se presenta un prompt informando un comportamiento clave: **"Los artículos creados bajo esta categoría seguirán existiendo en el inventario global, pero perderán su vista propia."**
El borrado es una desvinculación a nivel de la interfaz. Los ítems que poseían campos extendidos como "Talla" o "Placas" seguirán reteniendo esa data cruda en su documento en la DB, pero ya no habrá una interfaz oficial del sistema para iterar o mostrar esa sección específica. Esto previene catástrofes de pérdida de datos accidentales por borrado de templates de UI.

---

## 4. Consideraciones de Rendimiento y UX

- **UI Optimista Limitada:** Las mutaciones como el guardado de esquemas deshabilitan el botón de "Guardar" y muestran un estado de `isSaving` (Spinner), bloqueando dobles posteos al servidor mientras la red responde.
- **Scroll Automático:** Al hacer clic en el botón de edición de una sección en la lista inferior, `handleEditClick` ejecuta un `window.scrollTo({ top: 0, behavior: 'smooth' })` para garantizar que el usuario se enfoque instantáneamente en el "Constructor de Campos".
- **Gestión de Componentes en Memoria:** Iconos renderizados dinámicamente usando un mapa constante (`ICONS`) que traduce un string (ej. "Car") a un componente `<Car />` de `lucide-react`, permitiendo almacenar el nombre de la variante de diseño de forma segura en Firestore como un simple `string`.
