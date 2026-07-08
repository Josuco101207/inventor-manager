# Capítulo 13: Base de Datos - Colección `movements`

## 1. Introducción y Diseño de Auditoría Inmutable

La colección `movements` en Firestore funciona como el **motor principal de auditoría y trazabilidad** dentro del sistema Inventor Manager. En lugar de limitarse a actualizar cantidades en la colección de artículos (`items`), el sistema implementa un diseño de **auditoría inmutable (append-only)**. Esto garantiza que cualquier alteración en el inventario —ya sea ingreso, retiro, transferencia o reestructuración— quede registrada permanentemente. 

### Beneficios del diseño:
- **Trazabilidad Absoluta**: Se puede rastrear quién hizo qué, cuándo, con qué artículo y desde/hacia qué sub-almacén.
- **Detección de Fugas**: Facilita enormemente el rastreo de anomalías y la revisión histórica de operaciones.
- **Rollback Transaccional Controlado**: Se apoya en un sistema de anulaciones (reversiones lógicas) en lugar de eliminar el registro original.

---

## 2. Estructura de Datos (Schema)

Los documentos que ingresan a la colección `movements` son estrictamente validados mediante la librería **Zod** (`movementSchema`). La estructura de un documento estándar es la siguiente:

| Campo | Tipo de Dato | Descripción |
| :--- | :--- | :--- |
| `action` | Enum (String) | La operación realizada (ej. 'Entrada', 'Salida', 'Transferencia'). |
| `item` | String | El nombre exacto del artículo al momento del movimiento. |
| `itemId` | String (Opcional) | La referencia unívoca al ID del documento en la colección `items`. |
| `qty` | Number (Int) | La cantidad operada en **valor absoluto** (siempre positiva). |
| `user` | String | El nombre o correo del usuario que desencadenó el movimiento. |
| `details` | String | Notas adicionales (ej. "Reposición en Almacén Sur", o "Traspaso"). |
| `category` | String | La categoría general del artículo. |
| `subcategory` | String (Opcional)| Subcategoría del artículo. |
| `sourceLocation` | String (Opcional)| Para salidas y transferencias, especifica el sub-almacén de origen. |
| `destinationLocation`| String (Opcional)| Para entradas y transferencias, indica el sub-almacén de destino. |
| `timestamp` | Firestore Timestamp| Fecha y hora registrada por el servidor (`serverTimestamp()`). |
| `annulled` | Boolean (Opcional)| Indicador de si este movimiento fue revertido por un administrador. |
| `annulledBy` | String (Opcional)| Nombre del administrador que realizó la anulación. |
| `annulledAt` | Firestore Timestamp| Fecha y hora de la reversión. |

> [!NOTE]
> Las cantidades (`qty`) en los movimientos se registran en *valor absoluto*. La aplicación infiere si se suma o resta al inventario interpretando el tipo de `action`.

---

## 3. Tipos de Acciones (Operaciones)

La propiedad `action` clasifica y dicta cómo el sistema interpreta el movimiento de forma bidireccional. Las acciones permitidas en el sistema incluyen:

- **Operaciones de Flujo:** `Entrada`, `Salida`, `Transferencia`.
- **Control de Préstamos:** `Préstamo`, `Devolución`, `Asignación`.
- **Mantenimiento y Ciclo de Vida:** `Alta`, `Edición`, `Eliminación`, `Falla/Manto`.
- **Ajustes:** `Auditoría`, `Movimiento de Sección`.
- **Seguridad:** `Anulación` (Exclusivo para revertir errores).

### Flujo de Ejecución (Batch Updates)
Los movimientos rara vez se crean de forma aislada. Funciones como `updateStock`, `transferStock` o `bulkUpdateStock` utilizan transacciones **Batch** de Firestore. 
1. El batch actualiza primero el documento del artículo (ajuste de `qty` y `stockByLocation`).
2. El batch inserta simultáneamente un nuevo documento en la colección `movements`.
3. Si cualquiera de las dos operaciones falla, se aborta la transacción en la base de datos y se dispara el *rollback optimista* en la interfaz de usuario, manteniendo la integridad referencial de los datos.

---

## 4. El Mecanismo de Anulación ("Undo")

Para garantizar que los registros no sean borrados (manteniendo la cadena de auditoría), el sistema dota a los administradores de la capacidad de **anular** movimientos. Esto es procesado a través de la función `annulMovement(movementId, adminName)`.

### Flujo de Trabajo de una Anulación:
1. **Verificación de Estado:** Se comprueba si el movimiento existe en la caché y si no ha sido anulado previamente.
2. **Reversión del Artículo (Item Rollback):** Si el movimiento está vinculado a un `itemId` existente, la función evalúa la acción original y revierte el cálculo:
   - Si la acción fue `Entrada` o `Alta`: Resta la cantidad global (`-(mov.qty)`).
   - Si la acción fue `Salida`: Suma la cantidad global (`+(mov.qty)`).
   - Si la acción fue `Préstamo`: Suma `1` al stock general y reduce el valor de `prestados`. Si los préstamos llegan a 0, devuelve el `status` a "Disponible".
   - Si la acción fue `Devolución`: Resta `1` al stock y devuelve el artículo al estado de prestado incrementando el contador.
3. **Marca de Anulación (Soft-Delete):** Se actualiza el documento original del movimiento marcando `annulled: true`, `annulledBy`, y `annulledAt`.
4. **Registro de Compensación:** Se dispara un nuevo movimiento con la acción **`Anulación`**, dejando como detalle: `"Reversión de [Acción Original]"`. Esto asegura que el mismo acto de anular quede auditado en la bitácora.

> [!WARNING]
> **Limitación Arquitectónica en `stockByLocation`:** Al momento de anular un movimiento, el motor actual de `annulMovement` compensa adecuadamente el stock global (`qty`), pero la reversión automática de las sub-cantidades ubicadas en múltiples ubicaciones (`stockByLocation`) no se procesa en el mismo bucle por diseño de la versión actual. Los administradores deben re-ajustar las ubicaciones manualmente si anulan transferencias complejas entre sub-almacenes.

---

## 5. Integración Visual y Despliegue (TransactionsView)

El impacto de esta arquitectura se centraliza visualmente en la bitácora principal (`TransactionsView`) y en el `Dashboard`.

- **Filtrado en Tiempo Real:** El sistema realiza un particionamiento inteligente y permite búsquedas combinadas por fecha, tipo de acción, nombre del artículo y usuario responsable de forma instantánea.
- **Códigos de Color Semánticos:** Los elementos en la línea de tiempo (Timeline) reaccionan al objeto de configuración `actionConfig`: Verde para `Entrada`/`Alta`, Rojo para `Salida`/`Eliminación`, Azul para `Devolución`, etc.
- **Estado Visual de Anulación:** Aquellos movimientos que cuentan con la bandera `annulled: true` se visualizan con un distintivo "Badge" (ANULADO), y el botón de anulación (X) se desactiva, impidiendo reversiones dobles de la misma transacción.
