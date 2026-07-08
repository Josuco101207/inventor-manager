# Capítulo 21: Arquitectura de Modales de Acciones Masivas

Este documento detalla la arquitectura, flujos de datos y decisiones de diseño detrás de los componentes `BulkActionModal` y `BulkMoveSectionModal` dentro de la aplicación Inventor Manager. Estos modales proporcionan interfaces robustas para aplicar operaciones concurrentes a múltiples artículos (acciones por lote), agilizando drásticamente la gestión del inventario y reduciendo el trabajo manual.

---

## 1. Visión General y Arquitectura Base

Las acciones masivas (por lote o *bulk*) requieren un cuidadoso manejo del estado, ya que la interacción del usuario afecta a múltiples entidades de datos de manera simultánea. En lugar de procesar mutaciones complejas directamente dentro de los componentes visuales, la arquitectura de ambos modales adopta un enfoque de **delegación estructurada** (inversión de control) y un **aislamiento de presentación** mediante *React Portals*.

### 1.1 Uso de React Portals (`createPortal`)

Ambos componentes (`BulkActionModal` y `BulkMoveSectionModal`) retornan su contenido envuelto en `createPortal(..., document.body)`.

```javascript
return createPortal(
  <div className="modal-overlay">
    {/* Contenido del modal */}
  </div>,
  document.body
);
```

> [!TIP]
> **¿Por qué usar Portals?**
> Al renderizar el DOM del modal directamente como hijo de `document.body`, el componente escapa de las restricciones de contexto de apilamiento (*stacking context*) del contenedor donde fue invocado. Esto evita que problemas de `z-index` o propiedades `overflow: hidden` en componentes ancestros (como listas o tablas) recorten o bloqueen visualmente el modal.

### 1.2 Patrón de Inversión de Control (Callback Props)

Los modales no alteran el contexto general ni actualizan la base de datos de manera autónoma. Su única responsabilidad es **capturar y validar la intención del usuario** para un lote de ítems, y luego emitir un evento con los datos preprocesados hacia su componente padre mediante el prop `onConfirm`.

* **Entrada**: Prop `items` (array de objetos seleccionados).
* **Salida**: Invocación de `onConfirm` con la carga útil formateada.

---

## 2. Análisis Profundo: `BulkActionModal.jsx`

El componente `BulkActionModal` está diseñado para registrar **salidas de inventario (entregas) en lote**. Permite especificar cuántas unidades de cada artículo seleccionado serán retiradas, identificar al destinatario y definir la ubicación de origen del material.

### 2.1 Flujo de Estado y Sincronización

El componente gestiona tres estados locales críticos:
1. `quantities` (Object): Un diccionario que mapea el ID de cada ítem a la cantidad a retirar.
2. `details` (String): El destinatario de los artículos.
3. `selectedLocation` (String): La ubicación desde donde se registra la salida.

**Inicialización del Estado (Effect Hook):**
Para garantizar que cada artículo seleccionado arranque con un valor por defecto válido (1 unidad), se emplea un `useEffect` que reacciona a los cambios en el prop `items` y la apertura del modal (`isOpen`).

```javascript
useEffect(() => {
  if (isOpen && items.length > 0) {
    const initialQty = {};
    items.forEach(item => {
      initialQty[item.id] = 1;
    });
    setQuantities(initialQty);
    setDetails('');
    setSelectedLocation('General');
  }
}, [isOpen, items]);
```

### 2.2 Optimización de Opciones (useMemo)

Para el destinatario, el modal recibe un arreglo `personnel`. Dado que este arreglo puede ser extenso y contener entradas duplicadas en términos de nombres, se utiliza `React.useMemo` para calcular y memorizar una lista de opciones únicas.

> [!NOTE]
> **Rendimiento:** La memorización previene recálculos costosos del conjunto de usuarios únicos en cada renderizado del modal, garantizando que el `SearchableSelect` reciba referencias estables y minimizando re-renders innecesarios.

```javascript
const personnelOptions = React.useMemo(() => {
  const uniquePersonnel = [];
  const seen = new Set();
  for (const p of personnel) {
    if (!seen.has(p.name)) {
      seen.add(p.name);
      uniquePersonnel.push({
        value: p.name,
        label: p.name,
        id: p.employeeId || p.id
      });
    }
  }
  return uniquePersonnel;
}, [personnel]);
```

### 2.3 Reglas de Validación y Confirmación

Para evitar transacciones erróneas, el botón de confirmación permanece deshabilitado hasta que:
1. Todos los artículos tengan una cantidad a retirar mayor a cero (`allQtyValid`).
2. Se haya proporcionado texto válido en el campo del destinatario (`details.trim().length > 0`).

**Transformación de Datos de Salida:**
Al confirmar, el sistema asume que la operación es una **salida** (reducción de stock). Por lo tanto, el diccionario de cantidades se mapea a **valores negativos** usando `-Math.abs()`.

```javascript
const handleConfirm = () => {
  if (!isValid) return;
  const detailText = details.trim() ? `Entregado a: ${details.trim()} (Lote)` : '';
  
  const finalQuantities = {};
  for (const id in quantities) {
    finalQuantities[id] = -Math.abs(quantities[id]);
  }
  onConfirm(finalQuantities, detailText, selectedLocation);
  onClose();
};
```
Esta transformación facilita el trabajo del componente padre, el cual puede simplemente sumar estas cantidades al stock actual (donde sumar un número negativo resulta en una resta).

---

## 3. Análisis Profundo: `BulkMoveSectionModal.jsx`

El `BulkMoveSectionModal` aborda un requerimiento distinto: la recategorización masiva. Permite mover un lote de ítems de su sección/categoría actual a una nueva, consolidando inventarios o corrigiendo errores de captura de forma ágil.

### 3.1 Unificación de Categorías

El componente debe ofrecer al usuario todas las secciones disponibles. Esto incluye las **Categorías Estándar** predefinidas (ej. "Tornillería", "Electrónica") y las **Categorías Personalizadas** (`customCategories`) obtenidas desde el `InventoryContextOptimized`.

La lógica de consolidación realiza tres pasos cruciales:
1. **Combinación**: Une `standardCategories` con `customCategories`.
2. **Filtrado**: Excluye la categoría en la que los ítems ya se encuentran. (Se asume de forma segura que un lote se selecciona desde una vista específica de categoría, por lo que `items[0]?.category` dicta el origen).
3. **Deduplicación**: Utiliza un `Map` para garantizar que no existan nombres de categoría duplicados en la lista desplegable.

```javascript
const allCategories = [
  ...standardCategories,
  ...(customCategories || [])
].filter(c => c.name !== currentCategory);

const uniqueCategories = Array.from(new Map(allCategories.map(c => [c.name, c])).values());
```

### 3.2 Manejo del Estado y UX Preventiva

El estado local es mínimo, controlando únicamente la sección destino (`targetSection`). Sin embargo, a nivel de UX, el modal despliega una alerta preventiva si el usuario selecciona una categoría:

> [!WARNING]
> *"Si la nueva sección tiene campos dinámicos distintos, estos artículos solo mostrarán los campos que coincidan."*
>
> **¿Por qué es esto importante?** En la arquitectura de Inventor Manager, cada categoría puede poseer un esquema distinto de campos dinámicos. Alertar al usuario mitiga la confusión sobre qué pasará con los datos de atributos específicos que no existen en la categoría de destino.

### 3.3 Construcción de la Carga Útil (Payload)

Al igual que el modal de salidas, el procesamiento final es simple y delega la lógica de negocio real al invocador:

```javascript
const handleConfirm = () => {
  if (!isValid) return;
  const itemIds = items.map(i => i.id); // Extracción rápida de identificadores
  onConfirm(itemIds, targetSection);
  onClose();
};
```

El padre recibe un arreglo plano de cadenas (`[ID1, ID2, ...]`) y el nombre literal de la categoría de destino, con lo cual ejecutará las mutaciones sobre la base de datos subyacente.

---

## 4. Integración con Contextos (`useInventory`)

Una piedra angular en la arquitectura de ambos modales es la abstracción de consumo de estado mediante el hook `useInventory()` proveniente de `InventoryContextOptimized`.

* **Consumo de Solo Lectura**: Ambos modales invocan `useInventory()` **estrictamente para leer** datos globales necesarios para construir su interfaz.
    * `BulkActionModal` extrae `locations` para popular el menú de orígenes de la salida de stock.
    * `BulkMoveSectionModal` extrae `customCategories` para enriquecer sus opciones de migración.
* **Cero Mutación Directa**: Ningún modal despacha acciones directamente al reducer del contexto (`dispatch({ type: ... })`). Esto preserva el patrón de encapsulamiento donde el consumidor del modal (ej. una tabla de datos interactiva) orquesta la modificación del contexto tras una respuesta exitosa de los servicios de base de datos.

---

## 5. Decisiones de Diseño UI/UX

Ambos componentes importan `ActionModal.css`, compartiendo clases que otorgan una identidad visual coherente y responsiva al sistema.

### Elementos Destacados de Diseño:
1. **Animaciones Fluidas (`animate-scale-up`)**: Brinda retroalimentación visual táctil cuando el modal emerge.
2. **Listas Scrollables Controladas (`max-h-[60vh] overflow-y-auto`)**: Permite que el modal sea usable incluso si el usuario selecciona cientos de elementos, limitando el alto a un 60% del alto vertical del viewport y delegando el resto a una barra de desplazamiento.
3. **Micro-interacciones en Botones**: El uso de clases como `btn-apple-danger` para acciones destructivas (salida de material) frente a `btn-apple-primary` para movimientos neutrales guía subconscientemente al usuario sobre la gravedad y naturaleza de la acción en curso.

```mermaid
graph TD
    A[Componente Padre (Ej. InventoryView)] -->|items, isOpen, onConfirm| B(BulkActionModal)
    A -->|items, isOpen, onConfirm| C(BulkMoveSectionModal)
    
    B -.->|Lectura: locations| Context[InventoryContextOptimized]
    C -.->|Lectura: customCategories| Context
    
    B -->|onConfirm: finalQuantities, detalles, ubicacion| A
    C -->|onConfirm: itemIds, targetSection| A
    
    A -->|Ejecuta Mutación DB| API[Base de Datos / Backend]
    API -->|Notifica Éxito| A
    A -->|Actualiza Estado Global| Context
```

## 6. Conclusión

La arquitectura de `BulkActionModal` y `BulkMoveSectionModal` refleja un diseño maduro en React, enfatizando la **separación de preocupaciones** (Separation of Concerns). Los modales son agnósticos respecto a cómo se procesan o guardan los datos finales; funcionan puramente como recolectores de datos ultra-especializados, pre-validadores, e interfaces de comunicación altamente usables, haciendo la gestión masiva de inventarios segura, predecible y performante.
