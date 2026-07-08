# Capítulo 4: Constantes Mágicas y Tipos de Datos Globales

## 1. Introducción y Estado Arquitectónico Actual

En el ciclo de vida de desarrollo de `Inventor Manager`, actualmente implementado en JavaScript (ES6+) con React, el manejo de estados de la aplicación, roles de usuario, tipos de movimientos y categorizaciones se apoya de manera intensiva en cadenas de texto literales, habitualmente conocidas en el ámbito de la ingeniería de software como *Magic Strings* o Constantes Mágicas.

El archivo principal de contexto de negocio, `src/context/InventoryContextOptimized.jsx`, así como los componentes globales transversales (p.ej., `Dashboard.jsx`, `AddItemModal.jsx` y `AuthContext.jsx`), albergan un conjunto de literales definidos tanto de forma implícita como a través de validadores de esquemas (`Zod`). Si bien esta aproximación permite iterar con rapidez, la falta de una capa de tipado fuerte genera riesgos inherentes de inconsistencia, errores tipográficos (typos) y dificulta el refactoring masivo.

El propósito de este documento es catalogar de forma exhaustiva, minuciosa y milimétrica cada uno de los tipos de datos repetidos, enumerar las constantes críticas, desglosar su comportamiento dentro del flujo de datos de la aplicación y establecer una hoja de ruta técnica para su estandarización a través de Enums y Tipos de Utilidad en una futura migración a TypeScript.

---

## 2. Roles de Usuario y Control de Acceso (RBAC)

**Ubicación principal:** `src/context/AuthContext.jsx`

El sistema de control de acceso basado en roles (Role-Based Access Control) se fundamenta en constantes de tipo cadena que definen los niveles de autorización en toda la plataforma. 

### Constantes identificadas:
- `'admin'`: Otorga acceso total a la plataforma, incluyendo la capacidad de gestionar configuraciones de seguridad, crear categorías dinámicas, anular movimientos, y tener acceso irrestricto de adición (`canAddTo`) y edición (`canEditIn`).
- `'almacenista'`: Confiere privilegios de personal (Staff). Un almacenista tiene derechos de lectura global pero operaciones de escritura o edición condicionadas a los arreglos `allowedCategories` y `editableCategories` definidos en su perfil (documento de la colección `users`).

### Análisis del Flujo de Datos y Código Clave:

```javascript
const isAdmin = userData?.role === 'admin';
const isStaff = userData?.role === 'admin' || userData?.role === 'almacenista';
```

- **El Qué:** Se derivan banderas (flags) booleanas estáticas (`isAdmin`, `isStaff`) que son memorizadas en el Contexto de Autenticación para inyectar capacidades a lo largo del árbol de componentes.
- **El Cómo:** Cada vez que el listener `onSnapshot` actualiza `userData`, se re-evalúan estas reglas condicionales de cadena.
- **El Por Qué:** Centralizar la lógica de permisos previene que componentes individuales consulten reiteradamente el valor string `'admin'`, limitando el riesgo de errores ortográficos distribuidos y facilitando un modelo declarativo para el renderizado condicional.

---

## 3. Estados Operativos del Artículo (Item Status)

**Ubicación principal:** `src/context/InventoryContextOptimized.jsx` (Zod Schema)

El estado físico y operativo de un ítem se rige por un subconjunto cerrado de cadenas literales validadas en el esquema `itemSchema`.

### Constantes identificadas:
- `'Disponible'`: El artículo está físicamente en su ubicación asignada y listo para ser extraído, usado o transferido.
- `'Prestado'`: El artículo ha sido retirado temporalmente, generando un registro paralelo de préstamo.
- `'Mantenimiento'`: El artículo está inactivo, fuera de stock utilizable por encontrarse en revisión técnica o reparación.
- `'Asignado'`: Un equipo ha sido otorgado de manera permanente o a largo plazo a un empleado (típicamente usado en la categoría de 'Herramientas' o 'Inventario General').

### Análisis del Flujo de Datos y Código Clave:

```javascript
status: z.enum(['Disponible', 'Prestado', 'Mantenimiento', 'Asignado']).optional().nullable(),
```

- **El Qué:** El validador Zod restringe las entradas hacia Firebase. Cualquier otro valor arrojará un `ZodError` abortando el guardado.
- **El Cómo:** En el momento de invocar funciones de agregación, se aplica `itemSchema.parse(...)`.
- **El Por Qué:** Actúa como una capa de defensa. Al no tener TypeScript en tiempo de desarrollo, Zod emula la validación de tipos en tiempo de ejecución garantizando que la base de datos (Firestore) no sea corrompida por estados de inventario inválidos originados desde la interfaz de usuario.

---

## 4. Tipos y Acciones de Movimientos (Movement Actions)

**Ubicaciones principales:** `src/context/InventoryContextOptimized.jsx` (Zod Schema) y `src/components/Dashboard.jsx` (Mapeo visual).

Quizás la entidad más compleja y propensa a desajustes son los Tipos de Acciones, ya que rigen la lógica transaccional de auditoría.

### Constantes identificadas:
1. `'Entrada'` / `'Salida'`
2. `'Préstamo'` / `'Devolución'`
3. `'Falla/Manto'`
4. `'Auditoría'`
5. `'Alta'` / `'Edición'` / `'Eliminación'` / `'Anulación'`
6. `'Asignación'`
7. `'Transferencia'`
8. `'Movimiento de Sección'`

### Análisis del Flujo de Datos y Código Clave:

En `InventoryContextOptimized.jsx`:
```javascript
action: z.enum(['Entrada', 'Salida', 'Préstamo', 'Devolución', 'Falla/Manto', 'Auditoría', 'Alta', 'Edición', 'Eliminación', 'Anulación', 'Asignación', 'Transferencia', 'Movimiento de Sección']),
```

En `Dashboard.jsx`:
```javascript
const actionColors = {
  Entrada:     { color: '#16a34a', bg: '#f0fff4', Icon: ArrowUpCircle },
  Salida:      { color: '#dc2626', bg: '#fff1f1', Icon: ArrowDownCircle },
  // ...
};
```

- **El Qué:** Define exactamente qué operación física o lógica se ejecutó sobre el inventario. Cada string está emparejado con colores semánticos, íconos y reglas matemáticas (p.ej., una Salida resta qty, una Entrada suma).
- **El Cómo:** Cuando se dispara `updateStock`, `transferStock`, o `addMovement`, el nombre de la acción se inserta en duro (`action: change > 0 ? 'Entrada' : 'Salida'`). 
- **El Por Qué:** El registro histórico es inmutable; escribir exactamente la cadena correcta asegura que métricas analíticas (ej. gráficos de área en Dashboard) agrupen las entradas adecuadamente. Una discrepancia ortográfica causaría fallas silenciosas en reportes financieros y auditorías de inventario.

---

## 5. Taxonomía de Categorías de Inventario

**Ubicaciones principales:** `src/components/AddItemModal.jsx` y `src/components/Dashboard.jsx`

Las categorías estructuran el esquema de datos adicional. Mientras la aplicación avanza hacia categorías dinámicas, el núcleo sigue dependiendo de un mapa estático fuertemente acoplado.

### Constantes identificadas:
`'Tornillería'`, `'Impresión 3D'`, `'Electrónica'`, `'Papelería'`, `'Papelería e Insumos'`, `'Herramientas'`, `'Inventario General'`, `'Almacén Temporal'`, `'Parques'`

### Análisis del Flujo de Datos y Código Clave:

```javascript
const CATEGORY_SCHEMAS = {
  'Tornillería': [
    { name: 'subcategory', label: 'Subcategoría' },
    { name: 'rosca', label: 'Rosca' }, ...
  ], ...
}

const categoryToRoute = (category) => {
  const map = {
    'Tornillería': '/tornilleria',
    // ...
  };
  return map[category] || '/general';
};
```

- **El Qué:** Estos literales controlan dos cosas: los campos del formulario renderizados condicionalmente en `AddItemModal` y la ruta de navegación (React Router) en el Dashboard.
- **El Cómo:** Si el valor `category` del contexto coincide con una llave en `CATEGORY_SCHEMAS`, la UI inyecta componentes de inputs específicos.
- **El Por Qué:** Permite que un solo componente modal actúe de manera polimórfica adaptándose a artículos tan dispares como "Tornillos" y "Herramientas de Alto Valor".

---

## 6. Unidades de Medida y Métricas Dimensionales

**Ubicación principal:** `src/components/AddItemModal.jsx`

### Constantes identificadas:
`'Piezas'`, `'Litros'`, `'Metros'`, `'Cajas'`, `'Paquetes'`, `'Cubetas'`, `'Rollos'`, `'Kilos'`

### Análisis del Flujo de Datos y Código Clave:

```jsx
<select name="unit" value={formData.unit} onChange={handleChange} className="w-full">
  <option value="Piezas">Piezas</option>
  <option value="Litros">Litros</option>
  {/*...*/}
</select>
```

- **El Qué:** Define en qué magnitud se está contabilizando la existencia (stock).
- **El Por Qué:** Presentar unidades coherentes es crítico para el módulo de compras. Si "Tornillo M8" se rastrea por `'Cajas'` con `pieces_per_unit = 100`, la matemática de sub-stock depende por completo de esta cadena para desencadenar el umbral correcto.

---

## 7. Claves de Persistencia en Caché Local (Local Storage)

**Ubicación principal:** `src/context/InventoryContextOptimized.jsx`

### Constantes identificadas:
```javascript
const CACHE_KEYS = {
  ITEMS: 'inv_cache_items',
  MOVEMENTS: 'inv_cache_movements',
  AUX_DATA: 'inv_cache_aux',
  LAST_SYNC: 'inv_cache_sync'
};
```

- **El Qué:** Claves empleadas para inyectar/extraer el estado de persistencia `offline-first` en `localStorage`.
- **El Cómo:** Interceptores como `cache.get(CACHE_KEYS.ITEMS)` inicializan el estado de React síncronamente antes de que Firebase responsa.
- **El Por Qué:** Almacenar estas cadenas en un objeto central (`CACHE_KEYS`) es un excelente patrón preventivo. Evita que un error tipográfico en `localStorage.getItem('inv_cache_itms')` rompa la inicialización optimista de la app.

---

## 8. Recomendación de Arquitectura: Migración a TypeScript Enums

La proliferación de literales esparcidos entre validaciones `Zod`, esquemas visuales, Contextos y diccionarios de color expone al proyecto a un riesgo enorme de refactorización. Si el negocio decide renombrar `'Falla/Manto'` a `'Mantenimiento'`, se deberán cambiar múltiples archivos, con un alto riesgo de obviar instancias.

### Propuesta Técnica para Refactorización Global

Se recomienda migrar la plataforma (o al menos sus entidades nucleares) a **TypeScript**, centralizando todas las constantes lógicas en un archivo maestro de tipos (ej. `src/types/domain.ts`).

#### Ejemplo de Implementación Recomendada:

```typescript
// src/types/domain.ts

export enum UserRole {
  ADMIN = 'admin',
  ALMACENISTA = 'almacenista'
}

export enum ItemStatus {
  AVAILABLE = 'Disponible',
  BORROWED = 'Prestado',
  MAINTENANCE = 'Mantenimiento',
  ASSIGNED = 'Asignado'
}

export enum MovementAction {
  IN = 'Entrada',
  OUT = 'Salida',
  BORROW = 'Préstamo',
  RETURN = 'Devolución',
  MAINTENANCE = 'Falla/Manto',
  AUDIT = 'Auditoría',
  CREATE = 'Alta',
  EDIT = 'Edición',
  DELETE = 'Eliminación',
  VOID = 'Anulación',
  ASSIGN = 'Asignación',
  TRANSFER = 'Transferencia',
  SECTION_MOVE = 'Movimiento de Sección'
}

export enum MeasureUnit {
  PIECES = 'Piezas',
  LITERS = 'Litros',
  METERS = 'Metros',
  BOXES = 'Cajas',
  PACKS = 'Paquetes',
  BUCKETS = 'Cubetas',
  ROLLS = 'Rollos',
  KILOS = 'Kilos'
}
```

### Justificación Técnica de la Propuesta (El "Por Qué")

1. **Auto-Completado (IntelliSense):** Los IDEs sugerirán automáticamente `MovementAction.IN`, reduciendo al 0% los errores por typos.
2. **Single Source of Truth:** Un cambio de nomenclatura (ej. de "Piezas" a "PZ") se cambia unívocamente en el Enum, y se propaga automáticamente por toda la aplicación, desde la base de datos hasta las gráficas del Dashboard.
3. **Validación Compilada, no Interpretada:** TS capturará asignaciones erróneas en tiempo de compilación. Ya no será necesario esperar al `ZodError` en tiempo de ejecución para saber que `action: 'Saliddas'` está mal escrito.
4. **Acoplamiento Limpio con Bibliotecas Visuales:** Los mapeos como `actionColors` aceptarán las enumeraciones de forma directa como llaves: `[MovementAction.IN]: { color: '#16a34a' }`.

La adopción de este patrón solidificará la robustez de `Inventor Manager`, pavimentando el terreno hacia una base de código *Enterprise-Ready* altamente escalable y tolerante a cambios en los requerimientos de negocio.
