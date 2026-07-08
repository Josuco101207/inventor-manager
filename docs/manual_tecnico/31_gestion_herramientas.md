# Capítulo 31: Gestión de Herramientas y Ciclo de Vida

Este documento técnico ofrece una inmersión exhaustiva en el componente `ToolsView.jsx` y su correspondiente hoja de estilos `ToolsView.css`, los cuales constituyen el núcleo interactivo para la gestión de herramientas dentro del sistema *Inventor Manager*. A lo largo de este capítulo se detallarán la arquitectura de la vista, los flujos de estado del ciclo de vida de cada herramienta, la integración e impresión del código QR y la matriz visual diseñada para la rápida identificación de estados.

---

## 1. Arquitectura General y Flujos de Datos

El archivo `ToolsView.jsx` está diseñado para manejar un alto volumen de datos manteniendo el rendimiento en la interfaz. Utiliza patrones avanzados de React y delega el filtrado a un *Web Worker*.

### 1.1. Gestión de Estado y Contexto
El componente extrae sus métodos y datos principalmente de dos contextos: `useInventory` y `useAuth`:
```javascript
const { items, personnel, addItem, editItem, deleteItem, loanItem, assignItem, bulkLoanItems, bulkAssignItems, returnItem, reportMaintenance, completeMaintenance, loading } = useInventory();
const { isAdmin, isStaff, canEditIn, canAddTo, userData } = useAuth();
```
- **Por qué:** Desacopla la lógica de red (Firebase) de la interfaz de usuario. `useInventory` provee las funciones para modificar el estado de las herramientas, mientras que `useAuth` dicta qué botones y acciones se renderizan dependiendo del rol (`isStaff`, `isAdmin`).

### 1.2. Optimización del Rendimiento
Debido a que el catálogo de herramientas puede ser extenso, la vista implementa tres mecanismos clave:
1. **Filtro por Web Worker:** Se inicializa `new Worker(new URL('../workers/filterWorker.js', import.meta.url))` para que las búsquedas y el filtrado por estado no bloqueen el hilo principal.
2. **Intersection Observer (Scroll Infinito):** 
   ```javascript
   const observerTarget = useCallback(node => {
     if (loading) return;
     if (observer.current) observer.current.disconnect();
     
     observer.current = new IntersectionObserver(entries => {
       if (entries[0].isIntersecting) {
         setVisibleCount(prev => prev + 30);
       }
     }, { threshold: 0.1, rootMargin: '200px' });
     
     if (node) observer.current.observe(node);
   }, [loading]);
   ```
   Se renderiza un subconjunto de herramientas (`visibleCount`, inicialmente 30). Al llegar al final de la vista, se añaden 30 elementos más.
3. **Memoización del Componente `ToolCard`:** El componente de cada tarjeta está envuelto en `memo` para evitar re-renderizados innecesarios cuando cambia el estado de los componentes hermanos o modales.

> [!TIP]
> **Mejora de Rendimiento:** Usar un Intersection Observer asociado a un `useCallback` previene *memory leaks* y loops infinitos, asegurando que el observador se desconecte y re-conecte apropiadamente cuando el nodo DOM cambia.

---

## 2. Ciclo de Vida de la Herramienta

La lógica de negocio define cuatro estados operativos por los que atraviesa una herramienta. Estos estados están regidos estrictamente por botones y métodos que alteran los documentos en Firebase.

### 2.1. Estado: Disponible
- **Qué es:** La herramienta se encuentra físicamente en almacén, sin asignación ni préstamo, lista para ser usada.
- **Acciones Disponibles:** `Prestar` y `Asignar`.
- **Código asociado:** La condicional `tool.status !== 'Prestado' && tool.status !== 'Mantenimiento' && tool.status !== 'Asignado'` es la llave que habilita los botones primarios para entregar la herramienta al personal.

### 2.2. Estado: Préstamo (`Prestado`)
- **Qué es:** Una asignación temporal. El trabajador requiere la herramienta para un turno o tarea de corto plazo.
- **Cómo:** Se ejecuta el método `loanItem(selectedTool.id, borrowerName, userName)`.
- **Flujo:** Abre un modal (`isLoanModalOpen`), se selecciona el personal desde un `SearchableSelect` y se procesa.
- **Transición de Retorno:** Estando en préstamo, la UI oculta los botones anteriores y expone únicamente el botón de **Devolver** que invoca a `returnItem`.

### 2.3. Estado: Asignada (`Asignado`)
- **Qué es:** Una asignación permanente o a largo plazo. El trabajador asume la custodia del bien (por ejemplo, su multímetro personal, EPI o kit de herramientas particular de su área).
- **Cómo:** Se llama a `assignItem(...)`. Funciona igual que el préstamo pero registra el estado permanentemente como 'Asignado' y muestra "Asignado a: [Nombre]" en el cuerpo de la tarjeta.
- **Transición:** Al igual que el préstamo, se requiere la acción **Devolver** para regresar la herramienta al estado natural `Disponible`.

### 2.4. Estado: Falla (`Mantenimiento`)
- **Qué es:** La herramienta sufrió un desperfecto, desgaste grave o ruptura. No puede ser prestada ni asignada por seguridad.
- **Cómo:** Al presionar "Falla", el usuario invoca el modal respectivo (`isFaultModalOpen`) que requiere obligatoriamente capturar un motivo explícito (`faultReason`). El sistema llama a `reportMaintenance(selectedTool.id, faultReason, userName)`.
- **Transición:** Estando en falla, la herramienta queda aislada hasta que el personal técnico repare la unidad y use la acción de **Regresar Almacén** (`completeMaintenance(...)`), lo cual la reintegra al pool de herramientas operativas en stock.

> [!IMPORTANT]
> **Integridad de Datos:** Una herramienta en estado `Mantenimiento`, `Asignado` o `Prestado` tiene bloqueados los componentes de selección de caja (`tool-selection-box`) a través del renderizado condicional de `ToolCard`. Esto evita que el usuario agregue de forma errónea herramientas inhabilitadas a un "Lote de Asignación Múltiple".

---

## 3. Matriz Visual de Colores de Estado

Para la rápida identificación del estatus en pantallas densas o durante la inspección visual en la tableta del almacén, se diseñó una estricta matriz de colores definida dentro de `ToolsView.css`. 

Se utiliza una función utilitaria en JavaScript para mapear el texto a una clase CSS estandarizada:
```javascript
const getStatusClass = (status) => {
  if (status === 'Prestado') return 'prestado';
  if (status === 'Asignado') return 'asignado';
  return 'disponible';
};
```
*(Nota: aunque JS resuelve la clase base, CSS usa selectores explícitos adicionales como `.mantenimiento` aplicados de manera condicional o inyectados cuando la data de Firebase se lee directamente).*

### Composición Estilística CSS (Dark Glassmorphism)

| Estado | Color/Variable CSS | Elemento de Clase | Significado Operativo |
| :--- | :--- | :--- | :--- |
| **Disponible** | `hsl(var(--success))` (Verde) | `.disponible` | En stock, lista para operarse. |
| **Préstamo** | `hsl(var(--warning))` (Ambar/Naranja) | `.prestado` | Prestada temporalmente. |
| **Asignación** | `hsl(var(--accent-purple))` (Púrpura) | `.asignado` | En poder de un trabajador a largo plazo. |
| **Falla / Mant.** | `hsl(var(--danger))` (Rojo) | `.mantenimiento` | Inutilizable, requiere compostura. |

**Mecanismos de Aplicación Visual:**
1. **Listón Superior (Ribbon):** Una franja luminosa de 4px de altura ubicada en el borde superior de la tarjeta (`.tool-status-ribbon`), que aporta un identificador perimetral de inmediato.
2. **Insignia (Badge):** Un componente de texto en mayúsculas (`.tool-state-badge`) que provee alto contraste mediante fondos semi-transparentes (`hsla(..., 0.15)`) contra el texto primario.
3. **Resaltado de Efectos:** Cada color cuenta con una ligera sombra difuminada para destacar en la profundidad de la interfaz ("Glassmorphism"):
   ```css
   .tool-status-ribbon.prestado { 
       background: hsl(var(--warning)); 
       box-shadow: 0 0 10px hsl(var(--warning)); 
   }
   ```

---

## 4. El Sistema de Código QR Embebido

Una de las joyas tecnológicas del módulo es la autogestión de códigos QR para inventario físico, eliminando la dependencia de software privativo externo (como Bartender) para generar etiquetas. 

### 4.1. Generación y Renderizado del QR
Se utiliza la biblioteca `qrcode.react`. En el modal `isQRModalOpen`, se renderiza:
```javascript
<QRCodeSVG value={selectedTool.codigo || selectedTool.id} size={200} level="H" includeMargin={true} />
```
- **Valor del QR:** Prioriza y procesa `tool.codigo` en caso de existir (códigos corporativos como "131-C42"). Si no hay un código humano, posee un fallback automático a `tool.id` (el Hash/Document ID crudo de Firebase Firestore) garantizando unicidad y que toda herramienta tenga trazabilidad.
- **Nivel de Corrección "H" (High):** Significa un 30% de redundancia. Permite que el código siga siendo legible por el láser o la cámara aunque la etiqueta adherida a la herramienta metálica sufra rasgaduras, se llene de grasa o acumule polvo.

### 4.2. Motor de Impresión Dinámica
El botón de "Imprimir" ejecuta un bloque de JavaScript en la línea 853 que instancia una ventana efímera, construye el DOM de una página completa con código HTML/CSS inyectado en línea y hace la llamada limpia a la API del navegador.
- **Resolución Estilística:** Genera instantáneamente el formato perfecto para impresoras de etiquetas térmicas pre-configuradas a `65mm x 35mm`.
- **Inyección de CSS `@media print`:**
  ```css
  @media print {
    @page { margin: 0; size: 65mm 35mm; }
    body { padding: 0; background: none; display: block; }
    .label-box { border: none; width: 100%; height: 100%; page-break-inside: avoid; }
  }
  ```
- **Flujo Spooler:** El script extrae el Vector SVG, escapa posibles caracteres de ataque XSS en títulos de herramientas (`escapeHTML`), escribe el bloque, cierra el flujo, llama a `windowPrint.print()` y cierra la ventana (con un retardo lógico de 250ms para permitir al OS de Windows capturar el job).

### 4.3. Escáner Inteligente en Tiempo Real
Para facilitar el check-in y check-out de herramientas sin hardware especial, se embebe un visor de cámara vía WebRTC usando el componente `@yudiel/react-qr-scanner`.

**Flujo Lógico de Escaneo (línea 794):**
1. Al invocar la cámara, la propiedad `onScan(result)` captura continuamente el stream de video.
2. Extrae `result[0].rawValue` en la primer coincidencia matricial.
3. Busca el código exacto iterando la memoria local (`items.find(i => i.codigo === scannedValue || i.id === scannedValue)`).
4. **Inteligencia Reactiva de Negocio:** Mediante un `setTimeout` de 100ms que permite limpiar el modal, el sistema auto-diagnostica el estado de la herramienta y lanza la acción pertinente ahorrando clics al encargado:
   - Si la herramienta leída está **Disponible**, lanza el modal de Préstamo (`isLoanModalOpen = true`).
   - Si ya está **Prestada**, entiende que te la están devolviendo en ventanilla y lanza la alerta de devolución (`handleReturnConfirm`).
   - Si la herramienta está marcada como **Mantenimiento**, bloquea el flujo con un `alert` por seguridad, evitando volverla a entregar al piso de operaciones.

> [!WARNING]
> Requisitos de Entorno de Producción: El sistema de escaneo depende del acceso a hardware en la nube (`navigator.mediaDevices.getUserMedia`). Por políticas de seguridad de navegadores Chromium, si la plataforma se aloja y sirve en un dominio sin SSL/TLS (`https://`), el lector de QR no podrá ser inicializado en ningún dispositivo móvil o tableta del almacén.

---

## 5. Acciones Especiales: Operaciones en Lote (Bulk Actions)

Para mitigar el cuello de botella común al inicio o final de turnos laborales con un gran volumen de transacciones de almacén, la vista incorpora un sistema de selección paralela.

- **Selección de Memoria (`selectedToolIds`):** Al tocar el _checkbox_ en la tarjeta interactiva, el array en React muta empujando y quitando IDs correspondientes.
- **Barra de Acción Flotante (`.bulk-actions-bar`):** Condicionada a que existan IDs seleccionados (`selectedToolIds.length > 0`), emerge animada verticalmente para proveer botones masivos ("Prestar Lote", "Asignar Lote").
- **Coste Transaccional Firebase:** Estas opciones invocan a `bulkLoanItems` o `bulkAssignItems` procedentes del Contexto, las cuales ejecutan *Batch Updates* en Firestore, garantizando atomicidad y reduciendo dramáticamente tanto el tiempo de ejecución de red como la cuota de facturación de la base de datos subyacente.
