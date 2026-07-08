# Manual Técnico - Capítulo 20: Sistema de Facturación (`InvoicesView.jsx`)

## 1. Introducción y Arquitectura General
El módulo `InvoicesView` (`src/views/InvoicesView.jsx`) es un componente central de *Inventor Manager* diseñado para registrar, procesar y consultar las facturas de materiales. Este componente implementa patrones avanzados de React (como múltiples refs dinámicos, memoización exhaustiva y optimización de renderizados) para proporcionar una experiencia de usuario similar a una hoja de cálculo (tipo Excel) dentro de una aplicación web.

### 1.1. Control de Permisos y Acceso
Antes de renderizar el componente o permitir interacciones, el módulo extrae el contexto de autenticación mediante el hook personalizado `useAuth()`.

```javascript
const { userData, isAdmin: isSystemAdmin, loading: authLoading } = useAuth();
const isAdmin = isSystemAdmin || userData?.role === 'admin';
const canAdd = isAdmin || (userData?.allowedCategories || []).includes('Facturas');
const canDelete = isAdmin || (userData?.editableCategories || []).includes('Facturas');
```
> [!IMPORTANT]
> **Seguridad de Interfaz:** Aunque Firebase maneja las reglas de seguridad a nivel base de datos, el UI bloquea proactivamente las acciones (ocultando el botón de guardar o eliminar) dependiendo de si el usuario es administrador general o si su rol incluye explícitamente "Facturas" en sus arreglos `allowedCategories` y `editableCategories`.

### 1.2. Suscripción en Tiempo Real y Generación de Corpus
En la inicialización del componente, se utiliza `useEffect` para crear una suscripción a Firestore mediante `onSnapshot`.

```javascript
useEffect(() => {
  const q2 = query(collection(db, 'invoices'), orderBy('createdAt', 'desc'), limit(200));
  const unsub = onSnapshot(q2, snap => {
    // ... procesamiento
  });
  return () => unsub();
}, []);
```
> [!NOTE]
> **Optimización de Carga:** Se limita la consulta a los 200 registros más recientes (`limit(200)`) ordenados por `createdAt`. Esto previene el sobreconsumo de lecturas en Firestore y mantiene un rendimiento óptimo de memoria en el navegador.

Dentro de este mismo `onSnapshot`, se lee y procesa el **Corpus de Autocompletado**, una característica fundamental que se analizará a detalle en secciones posteriores.

---

## 2. Sistema de Facturación: Captura, Validación y Persistencia

El sistema está dividido visualmente por un sistema de pestañas (`tab`) que alterna la interfaz entre la vista de creación (`'new'`) y el historial (`'list'`). También incluye una sub-vista de lectura para facturas previamente guardadas (`viewingInvoice`).

### 2.1. Modelado de Líneas (Line Items)
La captura de partidas ocurre en el estado `lines`, que es un arreglo de objetos. Cada línea vacía se inicializa mediante la función constructora `emptyLine()`:

```javascript
const emptyLine = () => ({
  id: Date.now() + Math.random(),
  oc: '', cantidad: '', um: 'PZA', frgnName: '', descripcion: '',
  precioUnitario: '', ivaManual: '', importeTotal: 0, ivaCalc: 0
});
```
El ID pseudo-aleatorio (`Date.now() + Math.random()`) es crítico para proveer una propiedad `key` única al motor de reconciliación de React durante los ciclos de iteración, previniendo errores de estado (VDOM) al eliminar o insertar filas en posiciones intermedias.

### 2.2. Validaciones Previas y Flexibilidad Operativa
La función `validate()` realiza comprobaciones de integridad antes del guardado. Una decisión de diseño arquitectónico interesante en este módulo es priorizar la **flexibilidad de captura**: se permiten facturas sin Folio o Proveedor. 

Sin embargo, **protege la integridad matemática**: si la moneda transaccional (`currency`) seleccionada es Dólares Estadounidenses (USD), se exige obligatoriamente un *Tipo de Cambio* válido mayor a cero.

```javascript
const validate = useCallback(() => {
  const e = {};
  if (currency === 'USD' && (!tipoCambio || parseFloat(tipoCambio) <= 0)) e.tipoCambio = true;
  setErrors(e);
  return Object.keys(e).length === 0;
}, [currency, tipoCambio]);
```

### 2.3. Persistencia de Datos (`handleSave`)
Al disparar la función de guardado, `handleSave` aplica un filtro vital para depurar líneas vacías accidentales:
```javascript
const validLines = lines.filter(l => 
  l.oc.trim() || l.cantidad || l.frgnName.trim() || l.descripcion.trim() || l.precioUnitario
);
```
Posteriormente, el objeto estructurado `invoiceData` procesa todos los *strings* provenientes de los inputs convirtiéndolos rigurosamente a valores flotantes numéricos mediante `parseFloat` y guardando metadatos transaccionales críticos (fecha inmutable del servidor vía `serverTimestamp()` e identificador de auditoría `createdBy`).

---

## 3. Autocompletado en Celdas Editables y Navegación de Teclado (UX)

Uno de los requerimientos más complejos en interfaces tipo hoja de cálculo es la fluidez en el ingreso masivo de datos. `InvoicesView` logra esto con un motor de autocompletado en memoria y gestión de foco sintético.

### 3.1. Construcción del Corpus en Memoria
El sistema sugiere descripciones de artículos que se han facturado previamente, acompañadas de su unidad de medida y descripción extranjera (`frgnName`). Este corpus se construye dinámicamente cada vez que se detectan cambios en el flujo `invoices` de la base de datos:

```javascript
const parts = new Map();
data.forEach(inv => (inv.lines || []).forEach(l => {
  if (l.descripcion && !parts.has(l.descripcion)) {
    parts.set(l.descripcion, { descripcion: l.descripcion, um: l.um, frgnName: l.frgnName || '' });
  }
}));
setSavedParts([...parts.values()]);
```
Implementar la estructura nativa `Map` asegura la unicidad (*deduplicación*) de las descripciones con complejidad de búsqueda e inserción de O(1), lo cual es ideal para evitar bloqueos del hilo principal.

### 3.2. Disparador de Sugerencias y Filtrado
Al ingresar texto en la celda de descripción (`handleDescChange`), el componente evalúa si se han tecleado más de 2 caracteres. A partir de esa longitud, filtra `savedParts` buscando subcadenas (insensibles a mayúsculas y minúsculas mediante la unificación a `toLowerCase()`) y limita la carga visual en el DOM a las primeras 6 sugerencias óptimas (`slice(0, 6)`).

```mermaid
flowchart TD
    A[Usuario teclea en celda 'Descripción'] --> B{Longitud texto >= 2?}
    B -- Sí --> C[Filtrar corpus en memoria con .includes()]
    C --> D[Almacenar un máximo de 6 matches en estado 'acResults']
    D --> E[Desplegar Dropdown de UI en la celda activa 'acIndex']
    B -- No --> F[Ocultar Dropdown estableciendo acIndex = -1]
```

### 3.3. Gestión de Foco Dinámico mediante Refs
La captura imita intencionalmente el comportamiento veloz de Excel. La tecla `Enter` no ejecuta envíos de formularios nativos, sino que **desplaza secuencialmente el foco** a la celda colindante a la derecha. Si el usuario está en la última celda de la fila, crea automáticamente una nueva línea e inicializa el foco en el primer campo de dicha fila.

Para dominar este flujo, el componente inyecta referencias físicas al DOM en tiempo de ejecución al objeto `inputRefs.current`:
```javascript
ref={el => inputRefs.current[`${idx}-cantidad`] = el}
```
> [!TIP]
> **Gestión Eficiente de Referencias en Arreglos:** En lugar de crear un arreglo saturado de hooks `useRef` para cada celda que renderice la tabla, el código agrupa las referencias reales en un único diccionario clave-valor mediante sintaxis dinámica literal: `${indiceFila}-${nombreDelCampo}`.

El evento macro `handleKeyDown` orquesta la navegación:
1. Al presionar `ArrowDown`/`ArrowUp` en presencia de un menú de autocompletado: altera el índice `acHighlight` para seleccionar visualmente elementos iterativos.
2. Al presionar `Enter` con un elemento resaltado: bloquea la acción normal y dispara `selectAc()` para inyectar unívocamente la descripción de esa selección a la fila actual.
3. Al presionar `Enter` sin sugerencias, calcula mediante un vector estático los saltos entre columnas y dispara `.focus()` asíncronamente con un leve retardo `setTimeout(() => ..., 30)`. Esto es indispensable para ceder al DOM tiempo vital de renderizado si la acción previa requería la creación de una nueva fila `addLine()`.

---

## 4. Motor de Cálculo Matemático: Subtotales e IVA

La facturación de inventarios exige una tolerancia absoluta a errores de redondeo matemáticos. La naturaleza del estándar de punto flotante de JavaScript (IEEE 754) suele producir fallas inherentes al sistema binario de la CPU (por ejemplo, `0.1 + 0.2 = 0.30000000000000004`).

### 4.1. Cálculo a Nivel Fila (Line Items)
La función de actualización centralizada `updateLine` desencadena cascadas de derivaciones tan pronto se modifica una celda. El valor del Impuesto al Valor Agregado (IVA) maneja una lógica híbrida y tolerante a fallos: **Cálculo Automático vs Sobrescritura Manual**.

```javascript
const qty = parseFloat(copy[idx].cantidad) || 0;
const price = parseFloat(copy[idx].precioUnitario) || 0;
copy[idx].importeTotal = qty * price;

const manIva = copy[idx].ivaManual;
copy[idx].ivaCalc = manIva !== '' ? parseFloat(manIva) || 0 : copy[idx].importeTotal * IVA_RATE;
```
Esto soluciona una brecha común en sistemas contables: muchas facturas provenientes de agentes externos (proveedores) tienen discrepancias de 1-2 centavos debido a sus propios motores de redondeo legados. El campo `ivaManual` autoriza al operador inyectar el valor explícito de la factura de papel impresa cuando la deducción exacta del motor algorítmico interno `(importeTotal * 0.16)` no concuerda en el último decimal.

### 4.2. Precisión Decimal Compensatoria (Grand Totals)
El resumen final financiero de la factura (Subtotal, IVA global, Total) no es computado superficialmente durante el *render* del árbol HTML, sino compilado en un caché de alta eficiencia por medio del hook `useMemo`, acoplado estrechamente al ciclo de vida del estado de la tabla (`lines`).

> [!CAUTION]
> **Prevención Algorítmica de Redondeo Flotante:** El proceso suma iterativamente, pero implementa saneamiento aritmético mediante la compensación constante `Number.EPSILON`.

```javascript
const totals = useMemo(() => {
  const round2 = (num) => Math.round((num + Number.EPSILON) * 100) / 100;
  let subtotal = 0, iva = 0;
  
  lines.forEach(l => { 
    subtotal = round2(subtotal + (l.importeTotal || 0)); 
    iva = round2(iva + (l.ivaCalc || 0)); 
  });
  
  return { subtotal, iva, total: round2(subtotal + iva) };
}, [lines]);
```

**La importancia técnica de `Number.EPSILON`**
El método primitivo tradicional `Math.round(x * 100) / 100` incurre recurrentemente en fallos al tratar con valores limítrofes, por ejemplo, el número `1.005` es procesado físicamente por el navegador como `1.0049999999999998` y se redondea equívocamente a `1.00` en vez de redondear a `1.01`. 
Al sumar la propiedad infinitesimal `Number.EPSILON` (la escala diferencial más minúscula posible que JavaScript puede percibir entre dos números flotantes adyacentes), el sub-motor matemático asegura contundentemente que los decimales borde rebasen con seguridad el umbral de detección, resultando en cifras garantizadas para la contabilidad formal por redondeo hacia el par comercial.

---

## 5. Historial, Internacionalización (i18n) y Formato

El módulo histórico que presenta el acervo de facturas implementa el mismo grado de exactitud mediante la API del navegador subyacente de internacionalización de moneda `Intl.NumberFormat`, envolviéndolo en un servicio de alto nivel llamado `fmt`.

```javascript
const fmt = (n, currency = 'MXN') => {
  const v = parseFloat(n) || 0;
  return v.toLocaleString('es-MX', { style: 'currency', currency, minimumFractionDigits: 2 });
};
```
La función adquiere por diseño el tipo de moneda `currency` salvaguardado en el registro raíz de la factura de Firestore. Esta ligadura dura garantiza que una transacción que se documentó temporalmente en 'USD' prevalezca visible en todo momento futuro del sistema en dólares y con el formato regionalizado idóneo (ej. `$1,500.00`), desvinculándose con total independencia de si el interruptor general (toggle MXN/USD) actual de la vista se halla configurado distinto.

### 5.1. Algoritmo Polimórfico de Clasificación de Tablas
El listado del historial integra la función de jerarquía contextual en caliente (`sortBy`), la cual reordena imperativamente la lista sin recurrir nuevamente al backend (Firestore). 

Evalúa bajo esquemas lógicos separados:
- **Fecha de Emisión:** Evalúa primariamente la variable cronológica de cadena `fechaEmision` usando interpolaciones comparativas, y resuelve los raros conflictos o empates en el mismo día ordenando descendentemente según la marca de tiempo `createdAt.seconds` (timestamp exacto del servidor de base de datos).
- **Entidades Textuales (Proveedor / Folio):** Ordenamiento sintáctico por alfabeto a través de la función de prototipo nativa `localeCompare()`, la cual fue deliberadamente escogida porque comprende reglas gramaticales complejas, reconociendo exitosamente acentos gráficos, diéresis y la letra especial 'Ñ' propia de la captura del usuario hispanohablante.

---

## 6. Conclusión de Diseño
La ingeniería abstracta detrás de `InvoicesView.jsx` consolida requerimientos empresariales contables inflexibles sobre interfaces de web modernas, culminando en:
1. **Reducción del estrés por fricción de captura:** La tolerancia a campos omitibles combinada con la agilidad del DOM permite interacciones asíncronas fluidas, mitigando retrasos operativos de administración que tradicionalmente saturan los procesos de recepción de materiales.
2. **Alta Robustez en Transacciones de Datos Flotantes:** Con la integración en cascada de `Number.EPSILON`, el sistema resuelve desde sus pilares los mayores quebraderos de cabeza inherentes a ECMA-Script.
3. **Ergonomía Compleja sin Costo de Rendimiento:** La adopción del autocompletado nativo asíncrono gestionado a la par que la manipulación dinámica de refs `inputRefs.current` recrea fielmente ecosistemas potentes como ERPs financieros dedicados en un simple navegador de escritorio.
