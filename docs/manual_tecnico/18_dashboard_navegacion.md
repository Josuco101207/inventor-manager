# Capítulo 18: Ensamblado del Panel Principal y Navegación Móvil

Este capítulo detalla la arquitectura, el flujo de datos y el diseño interactivo del **Panel de Control Principal (`Dashboard.jsx`)** y el **Sistema de Navegación Responsiva para Móviles (`MobileBottomNav.jsx`)**. Ambos componentes representan la interfaz principal mediante la cual los usuarios interactúan y supervisan la salud del inventario.

---

## 1. Visión General del Panel Principal (Dashboard)

El componente `Dashboard` es el punto de entrada a la aplicación. Su responsabilidad es **consolidar** y **visualizar** la información de inventario más relevante, ofreciendo métricas en tiempo real, alertas de stock crítico, gráficos de actividad y accesos directos al catálogo.

### 1.1 Inyección de Dependencias y Contextos

El `Dashboard` no gestiona el fetching de datos de forma directa; en su lugar, se inyecta de la lógica centralizada de los contextos globales:

```javascript
const { items, movements, loading, globalStats, customCategories } = useInventory();
const { userData, isStaff } = useAuth();
```

> [!NOTE]
> **Por qué centralizar en el Contexto:** Al depender de `useInventoryOptimized` (o su equivalente), el Dashboard reacciona automáticamente a cualquier cambio en la base de datos sin re-solicitar la información al servidor de forma redundante. Esto asegura que todos los widgets (como el stock crítico o la línea de tiempo) se mantengan sincronizados en tiempo real.

---

## 2. Construcción de Métricas y Cálculos Intensivos

Para evitar renderizados innecesarios, el Dashboard hace uso intensivo del hook `useMemo` de React. Esto es crítico debido al volumen de transacciones y artículos que pueden existir en el sistema.

### 2.1 Movimientos del Día (`dayMovements`)

```javascript
const dayMovements = useMemo(() =>
  movements.filter(m => {
    if (!m.timestamp) return false;
    return toLocalDateString(m.timestamp.toDate()) === movDate;
  }),
  [movements, movDate]
);
```
- **Qué hace:** Filtra el array de `movements` (que contiene las últimas transacciones) para aislar únicamente las del día seleccionado (`movDate`).
- **Por qué:** Evita iterar sobre cientos de movimientos cada vez que cambia el estado interno del componente (por ejemplo, al abrir un modal), re-calculando únicamente si llegan nuevos movimientos del backend o si el usuario cambia la fecha a visualizar en el calendario.

### 2.2 Stock Crítico (`lowStockItems`)

```javascript
const lowStockItems = useMemo(() => 
  items.filter(item => (item.qty || 0) <= (item.threshold || 0)),
  [items]
);
```
- **Qué hace:** Identifica los ítems cuya cantidad actual (`qty`) es menor o igual a su límite mínimo de seguridad (`threshold`).
- **Impacto visual:** El tamaño de este arreglo se inyecta en la métrica "Stock Crítico", coloreada semánticamente en rojo (`danger`). Al hacer clic en esta tarjeta, se despliega el **Modal Crítico**.

### 2.3 Catálogo Dinámico (`categories`)

El panel de categorías en el Dashboard debe incluir tanto las categorías codificadas de manera rígida ("Tornillería", "Papelería", etc.) como las creadas dinámicamente por los administradores.

```javascript
const categories = useMemo(() => {
  const base = [ /*... Categorías Base ...*/ ];
  if (customCategories?.length) {
    customCategories.forEach(cat => {
      base.push({
        id: cat.id,
        title: cat.name,
        icon: <Package size={22} />,
        color: cat.color || '#5856d6',
        route: cat.route || `/seccion/${encodeURIComponent(cat.name)}`
      });
    });
  }
  return base;
}, [customCategories]);
```

> [!IMPORTANT]
> Esta arquitectura permite **escalabilidad horizontal**. El sistema puede añadir un número infinito de secciones dinámicas ("customCategories") sin necesidad de modificar el código estructural del Dashboard, acoplándose perfectamente a la configuración almacenada en la base de datos.

---

## 3. Visualización y Arquitectura de Componentes (Dashboard)

El JSX del `Dashboard` está estructurado en secciones modulares claramente delimitadas:

### 3.1 Gráfico de Actividad Reciente (Recharts)

Utiliza la librería `recharts` para montar un gráfico de área dinámico. Recibe la propiedad `globalStats.activity` (calculada en el agregador de estadísticas globales).

```javascript
<AreaChart data={globalStats.activity}>
  <defs>
    <linearGradient id="appleGrad" x1="0" y1="0" x2="0" y2="1">
       {/* Degradado dinámico para estilo moderno */}
    </linearGradient>
  </defs>
  <Area type="monotone" dataKey="movimientos" stroke="#0071e3" fill="url(#appleGrad)" />
</AreaChart>
```
Este gráfico está acoplado con la validación de montado del componente (`isMounted`) para prevenir problemas de renderizado del lado del servidor (SSR) o desincronizaciones en la primera carga (Hydration Mismatch).

### 3.2 Modal de Stock Crítico

Cuando `globalStats.critical > 0`, la atención del usuario se centra en la tarjeta correspondiente. Al hacer clic, `setIsCriticalModalOpen(true)` activa un "Modal" sobrepuesto con la lista de urgencias.
- **Rendimiento:** Se emplea `.slice(0, 500)` al renderizar los ítems críticos. Esto es una barrera de seguridad vital; si existieran 5,000 ítems en estado crítico, intentar renderizar tantos nodos DOM simultáneamente causaría inestabilidad en dispositivos móviles o de bajos recursos.
- **Acción:** Cada fila tiene un botón para redirigir directamente a la ruta de la categoría del artículo afectado, utilizando la función transformadora `categoryToRoute()`.

### 3.3 Semántica de la Línea de Tiempo (Timeline)

La línea de tiempo mapea los objetos dentro de `dayMovements`. Utiliza un diccionario `actionColors` para asignar estilos CSS e íconos consistentes en base al string de la acción.

| Acción | Color Semántico | Significado y Contexto |
| :--- | :--- | :--- |
| **Entrada / Alta** | Verde (`#16a34a`) | Ingreso de material, reabastecimiento o creación en la base de datos. |
| **Salida / Eliminación** | Rojo (`#dc2626`) | Extracción de inventario para su uso, o borrado de catálogos. |
| **Préstamo / Devolución / Asignación** | Azul / Morado | Movimientos de flujo temporal que no implican una destrucción del activo, sino un cambio en su estado de retención. |
| **Auditoría / Edición** | Naranja (`#ff9500`) | Modificaciones sistémicas, verificación de existencias o correcciones de datos sin alteración de volumen comercial. |

---

## 4. Arquitectura de Navegación Móvil (`MobileBottomNav.jsx`)

Para garantizar una experiencia fluida en dispositivos móviles, se diseñó `MobileBottomNav`. Este componente erradica el clásico menú lateral colapsable (Hamburguer menu/Sidebar), optando por el estándar moderno: una barra de navegación inferior (Bottom Navigation Bar) expandible a una hoja de opciones ("Bottom Sheet").

### 4.1 Control de Acceso Basado en Roles (RBAC Visual)

El componente evalúa si el usuario posee los permisos requeridos antes de renderizar siquiera el botón de la sección. Esto asegura una interfaz limpia y evita frustraciones de accesos denegados.

```javascript
const hasAccess = (viewId) => {
  if (isAdmin) return true;
  if (!userData) return false;
  if (!userData.allowedViews) return true; // Fail-safe (Permisivo por defecto)
  return userData.allowedViews.includes(viewId);
};
```

> [!TIP]
> **Seguridad Visual vs. Seguridad Real:** Aunque `hasAccess` oculta correctamente los nodos DOM a los que el usuario no debe acceder, es imperativo recordar que la seguridad real reside en la configuración de base de datos (Firebase Security Rules) y en los "Routers" protegidos a nivel de React. Este filtro es una capa de **UX/UI**.

### 4.2 Menú Híbrido: Tab Bar + Bottom Sheet

Considerando las limitaciones físicas de una pantalla móvil, la arquitectura de navegación se divide en dos dominios:

1. **Dominio 1: Tab Bar Fija Inferior (`navItems`)**
   Alojamiento para las rutas hiper-frecuentes: **Inicio** (Dashboard principal), **Inventario** (Vista General agnóstica), y **Actividad** (Transacciones). Un cuarto trigger invierte el booleano `isMenuOpen`.

2. **Dominio 2: Bottom Sheet (Hoja Expandible)**
   Cuando `isMenuOpen === true`, se activa una capa de oscurecimiento (overlay) y un contenedor `.bottom-sheet` se desliza desde la parte inferior.
   
   Aquí se fusionan y renderizan las categorías codificadas de fábrica y las categorías definidas por el sistema dinámico:
   ```javascript
   const dynamicMenuItems = (customCategories || []).map(cat => ({
     id: `custom_${cat.id}`,
     label: cat.name,
     icon: Package, // Ícono genérico heredado
     path: cat.route || `/custom/${cat.id}`,
     color: cat.color || '#3b82f6'
   }));
   ```

### 4.3 Cierre Automático del Menú (Gestión del Efecto de Enrutamiento)

Un problema característico de las aplicaciones Single Page Application (SPA) en móviles es la persistencia de ventanas modales tras haber realizado la transición de ruta, ya que el ciclo de vida de recarga completa del navegador está bloqueado por el Router de React.

```javascript
useEffect(() => {
  setIsMenuOpen(false);
}, [location.pathname]);
```
- **Por qué se implementó:** Este `useEffect` se suscribe a los cambios en el objeto `location` proporcionado por `useLocation()` de React Router. En el momento exacto en que la variable `pathname` muta, fuerza el cierre del menú "Bottom Sheet". Esto otorga una sensación nativa, imitando comportamientos de iOS nativo (UIKit/SwiftUI) y Android.

---

## 5. Resumen Arquitectónico y Conclusiones

La dupla de `Dashboard` y `MobileBottomNav` establecen el "Front-Desk" del Inventor Manager:
- El **Dashboard** ejecuta una tarea intensiva en consumo de memoria al iterar y agregar sobre arreglos (potencialmente de miles de nodos) extraídos de los Hooks de contexto. Por ello su dependencia crítica en utilidades de memorización como `useMemo` para no ahogar el *Main Thread* de JavaScript.
- El **MobileBottomNav** ejerce como puente infraestructural del usuario en condiciones de hardware reducidas o dispositivos de pantalla vertical, proveyendo un mapeo inteligente y dinámico de las secciones adaptadas al nivel de autorización, asegurando la escalabilidad visual a la par que la app incrementa su robustez y opciones customizadas.
