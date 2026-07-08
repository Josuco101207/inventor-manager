# Capítulo 12: Base de Datos - Colección `items` y Arquitectura de Datos

El núcleo operativo de Inventor Manager reside en la colección `items` de Cloud Firestore. Esta colección no solo alberga el catálogo de artículos, herramientas e insumos, sino que implementa un modelo de datos altamente flexible y concurrente. A través de esquemas extensibles, inventario multi-almacén distribuido y operaciones transaccionales compensadas, la aplicación garantiza consistencia y rendimiento.

Este capítulo detalla exhaustivamente la estructura de esta colección, el funcionamiento de sus metadatos dinámicos, el mapeo de stock por ubicaciones y la mecánica de las actualizaciones incrementales concurrentes.

---

## 12.1. Esquema de Datos Base y Validación Estricta

Aunque Firestore es una base de datos NoSQL "schemaless", la aplicación impone un contrato de datos estricto a nivel de aplicación utilizando la librería **Zod**. Esto asegura que cualquier escritura, ya sea simple o en lote, respete una estructura predecible.

La validación central está definida en el `itemSchema` (ubicado en `InventoryContextOptimized.jsx`):

```javascript
const itemSchema = z.object({
  name: z.string().min(2).max(100),
  category: z.string().min(1),
  qty: z.number().int().min(0).default(0),
  threshold: z.number().int().min(0).default(0),
  unit: z.string().default('PZA'),
  status: z.enum(['Disponible', 'Prestado', 'Mantenimiento', 'Asignado']).optional().nullable(),
  subcategory: z.string().optional().nullable(),
  marca: z.string().optional().nullable(),
  brand: z.string().optional().nullable(), // Soporte de retrocompatibilidad
  location: z.string().optional().nullable(),
  stockByLocation: z.record(z.number().int().min(0)).optional().default({}), // Novedad: Sub Almacenes
  observaciones: z.string().max(1000).optional().nullable(),
  
  // Campos adicionales (Estándar para Inventario General)
  modelo: z.string().optional().nullable(),
  serie: z.string().optional().nullable(),
  item_number: z.string().optional().nullable(),
  codigo: z.string().optional().nullable(),
  material: z.string().optional().nullable(),
  rosca: z.string().optional().nullable(),
  tipo: z.string().optional().nullable(),
  grupo: z.string().optional().nullable()
}).passthrough();
```

> [!IMPORTANT]
> **Modificador `.passthrough()`**: La instrucción `.passthrough()` al final del esquema de Zod es la pieza angular que permite la persistencia de los metadatos dinámicos. Esto le indica al validador que acepte, de forma segura, cualquier campo no declarado explícitamente en el esquema base, lo que hace posible el modelo de categorías personalizables.

---

## 12.2. Metadatos Dinámicos por Categoría (Custom Categories)

Dado que un "Vehículo" requiere campos diferentes a una "Licencia de Software", Inventor Manager implementa un modelo EAV (Entity-Attribute-Value) híbrido, donde los campos personalizados se aplanan directamente en el documento del artículo.

### ¿Qué son y cómo funcionan?
El sistema permite a los administradores crear "Secciones" o "Sub-Almacenes" dinámicos a través del módulo `SectionAdminView`. Esta configuración se guarda en una colección separada llamada `custom_categories`. 

Un documento en `custom_categories` tiene el siguiente esquema:
```json
{
  "name": "Equipos de IT",
  "route": "/equipos-de-it",
  "icon": "Monitor",
  "fields": [
    { "id": "f1", "name": "Número de Serie", "type": "text", "required": true },
    { "id": "f2", "name": "Tipo", "type": "select", "options": "Laptop, Monitor, Otro", "required": true }
  ]
}
```

### Impacto en la colección `items`
Cuando un usuario da de alta un artículo en la categoría "Equipos de IT", la UI de creación lee los `fields` desde la configuración y renderiza inputs dinámicos.
Al guardarse, gracias al `.passthrough()`, el documento resultante en la colección `items` absorbe estos campos como propiedades raíz:

```json
{
  "name": "ThinkPad T14",
  "category": "Equipos de IT",
  "qty": 1,
  "Número de Serie": "PF12345XYZ",
  "Tipo": "Laptop",
  "createdAt": "Timestamp..."
}
```

> [!TIP]
> **Ventaja Arquitectónica**: Al aplanar los campos como claves de nivel raíz en el documento en lugar de anidarlos en un objeto `metadata: {}`, Firebase permite crear índices compuestos y realizar consultas de filtrado directas (ej: `where('Tipo', '==', 'Laptop')`) sobre los atributos dinámicos, lo que de otra forma sería sumamente complejo.

---

## 12.3. Modelo Multialmacén: El objeto `stockByLocation`

En entornos de mediana a gran escala, el stock global no es suficiente; es necesario saber *dónde* está cada unidad. El sistema resuelve esto mediante un mapa (record) embebido en el documento: `stockByLocation`.

```json
"stockByLocation": {
  "Almacén Central": 150,
  "Taller A": 25,
  "Vehículo de Servicio 01": 10
}
```

### Reglas del Flujo de Stock
1. **Doble Contabilidad**: El documento mantiene el campo entero `qty` que representa la **suma global** del inventario. A la par, mantiene el objeto `stockByLocation` que desglosa esa suma por ubicación.
2. **Ubicación Efectiva (`effectiveLocation`)**: Cuando se realiza una operación simple (entrada/salida) sin especificar almacén, la capa de acceso a datos resuelve la ubicación haciendo "fallback" a `item.location` o al predeterminado `'General'`.
3. **Transferencias en Firme**: Al transferir mercancía (`transferStock`), la función atómica decrementa un nodo del mapa y aumenta otro:
   ```javascript
   const newStockByLocation = {
     ...currentStockByLoc,
     [fromLocation]: fromQty - qty,
     [toLocation]: toQty + qty
   };
   ```

> [!WARNING]
> La interfaz de usuario debe asegurar que la sumatoria iterativa de los valores en `stockByLocation` siempre empate matemáticamente con el atributo `qty` global del artículo. Las auditorías (`auditStock`) re-sincronizan esta relación recalculando el delta.

---

## 12.4. Actualizaciones Incrementales y Concurrencia

Cuando múltiples usuarios (operarios, encargados de almacén) alteran el stock de un mismo artículo (ej: Despachando Tornillos M4 al mismo tiempo), la posibilidad de una "condición de carrera" (Race Condition) es inminente.

Inventor Manager evita las colisiones clásicas ("Leer-Modificar-Escribir") valiéndose de la función `increment()` del SDK de Firestore y **Write Batches** atómicos.

### Patrón de Incremento Seguro
En lugar de mandar el número final calculado localmente a la base de datos, el sistema le dice al servidor "Suma X" o "Resta Y".
```javascript
const itemRef = doc(db, 'items', itemId);
batch.update(itemRef, {
  qty: increment(change),                                // Incremento/Decremento global
  [`stockByLocation.${effectiveLocation}`]: increment(change), // Incremento/Decremento sub-nodo
  lastModified: serverTimestamp()                        // Sello de tiempo de la transacción
});
```
Con este enfoque atómico a nivel de red, si dos usuarios despachan el mismo artículo al mismo milisegundo, la base de datos aplicará ambos deltas matemáticos secuencialmente asegurando integridad transaccional.

### Historial Atado al Dato (Batches)
Nunca se modifica el stock de un item sin registrar su huella de auditoría. El `writeBatch` agrupa obligatoriamente la mutación de `items` con la creación del registro en `movements`:
```javascript
const moveRef = doc(collection(db, 'movements'));
batch.set(moveRef, {
  action: change > 0 ? 'Entrada' : 'Salida',
  item: item.name,
  qty: Math.abs(change),
  //... datos
});
await batch.commit(); // Todo ocurre o nada ocurre (Todo o Nada)
```

---

## 12.5. Optimistic UI y Reversión de Estado (Rollback)

Dado que las respuestas de red pueden experimentar latencia, la arquitectura emplea un modelo de Interfaz Optimista (**Optimistic UI**).

1. **Estado Previo**: Antes de ejecutar la acción, la memoria captura el estado original (`previousState`).
2. **Mutación Local**: Se altera la variable reactiva global (`itemsRef.current` / `setItems`) y se sobreescribe el caché en `localStorage`. La interfaz de usuario se actualiza de inmediato (< 10 ms).
3. **Petición en Segundo Plano**: Se invoca el `batch.commit()` en Firestore con una envoltura de reintentos exponenciales (`withRetry()`).
4. **Rollback (Compensación)**: Si la transacción falla o el servidor responde con un error de cuota/permisos tras agotar los reintentos, el bloque `catch` revierte el estado local inyectando el `previousState` de vuelta en el árbol reactivo y emite una alerta `toast.error("Error - cambios revertidos")`.

Este ciclo garantiza que la percepción del operario sea de un sistema localmente instantáneo, mientras que la verdadera consistencia final (Eventual Consistency) es manejada rígidamente por el proveedor de Contexto.
