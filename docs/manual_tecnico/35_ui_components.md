# Capítulo 35: Componentes UI Genéricos y Arquitectura de Reusabilidad

Este capítulo aborda de manera exhaustiva el diseño, la lógica de implementación y los flujos de datos subyacentes a los componentes genéricos de Interfaz de Usuario (UI) dentro de la aplicación Inventor Manager (ubicados principalmente en `src/components`). Nos enfocaremos en los Modales Base, Elementos de Carga (Spinners y Skeletons), Componentes Interactivos (`SearchableSelect`), y las Alertas de validación.

## 1. Filosofía de Componentes Reusables en React

La arquitectura del frontend de esta aplicación sigue el principio de **Componentes Basados en Composición**. En lugar de repetir lógica de interfaz, la aplicación encapsula comportamientos complejos en piezas independientes que actúan como "cajas negras" predecibles, alimentadas únicamente mediante *Props* (`props down`) y que comunican resultados mediante *Callbacks* (`events up`).

> [!NOTE]
> **Enfoque Híbrido de Estilos (Tailwind + CSS Custom Properties)**
> La inyección de clases en este proyecto es intencionalmente mixta. Utiliza el poder del motor JIT (Just-In-Time) de Tailwind CSS para layouts rápidos y posicionamiento (`flex`, `items-center`, `gap-6`, `animate-spin`), combinado con archivos CSS dedicados (ej. `ActionModal.css`) que implementan variables nativas (`hsl(var(--bg-card))`) para soportar de manera nativa los modos claro/oscuro (Dark Mode).

## 2. El Ecosistema de Modales Base

Los modales son uno de los elementos más críticos de la aplicación (ej. `ActionModal`, `AddItemModal`, `TransferModal`). Dado que las ventanas superpuestas pueden ser víctimas del contexto de apilamiento (*stacking context*) del CSS si se declaran en lo profundo del DOM, la aplicación utiliza una técnica infalible: **Portales de React**.

### 2.1 La Lógica de `createPortal`

Al examinar `ActionModal.jsx`, se observa que todo el retorno del componente está envuelto en `createPortal`:

```jsx
return createPortal(
  <div className="modal-overlay">
    <div className="modal-card animate-scale-up">
      {/* Contenido del modal */}
    </div>
  </div>,
  document.body
);
```

**El "Por qué":**
Renderizar directamente en `document.body` saca el marcado del modal de la jerarquía de los contenedores relativos (como el Sidebar o el Layout principal). Esto garantiza que el modal siempre se posicione por encima del 100% de la aplicación (`z-index: 9999`) sin que la regla `overflow: hidden` de un componente padre lo recorte.

### 2.2 Inyección de Clases y Efectos
El overlay del modal utiliza un archivo CSS clásico para reglas complejas como desenfoque de fondo:

```css
.modal-overlay {
  background-color: hsla(0, 0%, 0%, 0.4);
  backdrop-filter: blur(12px) saturate(180%);
}
```

A nivel de inyección dinámica en React, se utilizan template literals condicionales para determinar el estilo de los botones según el estado interno. Por ejemplo, en el toggle de tipo de operación:

```jsx
<button
  className={`flex-1 ${isSalida ? 'btn-apple-danger' : 'btn-apple-primary'}`}
  onClick={handleConfirm}
  disabled={!isValid}
>
  {isSalida ? 'Confirmar Salida' : 'Confirmar Entrada'}
</button>
```

**Flujo de Datos**: El modal escucha las variaciones de la prop `item`. Si cambia o si `isOpen` se dispara, un hook `useEffect` reinicia el estado interno (`qty`, `action`, `details`), impidiendo la filtración de datos de la sesión de modal anterior.

---

## 3. Feedback Visual: Spinners, Skeletons y Alertas

Mantener al usuario informado sobre procesos asíncronos es crucial. Inventor Manager resuelve esto mediante múltiples patrones.

### 3.1 Spinners Dinámicos en Línea
En lugar de depender de librerías de componentes pesadas para los loaders, el proyecto combina íconos vectoriales SVG (`lucide-react`) con clases utilitarias de Tailwind. 

En componentes de alto nivel como `Dashboard.jsx`, el estado inicial de carga se intercepta tempranamente:

```jsx
if (loading) {
  return (
    <div className="flex items-center justify-center h-screen w-full bg-slate-950">
      <Loader2 className="animate-spin text-blue-500" size={48} />
    </div>
  );
}
```

**El "Cómo":** La clase `animate-spin` es una utilidad de Tailwind que aplica un `@keyframes` nativo infinito (`transform: rotate(360deg)`). El tamaño y colorización se manejan por propiedades del SVG y utilidades de texto (`text-blue-500`), lo que permite que el loader herede reglas de tipografía de CSS sin requerir un documento de estilos aislado.

### 3.2 Skeleton Loaders Avanzados (`OptimizedImage.jsx`)

Para la carga pesada de activos visuales, el proyecto usa el patrón *Skeleton* integrado directamente en el componente de optimización de imágenes.

> [!TIP]
> **Performance Optimization**
> Se utiliza el API `IntersectionObserver` para diferir (lazy-load) la carga de la imagen real y su renderizado en el DOM hasta que el elemento esté a 200 píxeles de entrar en el viewport (`rootMargin: '200px'`).

Mientras la imagen no entra al viewport o el evento `onLoad` no se ha disparado, el usuario ve el Skeleton:

```jsx
{!isLoaded && (
  <div style={{
    position: 'absolute',
    top: 0, left: 0,
    width: '100%', height: '100%',
    background: 'linear-gradient(90deg, #f1f5f9 25%, #e2e8f0 50%, #f1f5f9 75%)',
    backgroundSize: '200% 100%',
    animation: 'shimmer 1.5s infinite'
  }} />
)}
```

**Diseño del Skeleton:** Un fondo con un gradiente lineal estirado al `200%` que se mueve continuamente. La clase/animación `shimmer` desplaza el fondo horizontalmente, engañando al ojo y comunicando actividad de red, disminuyendo la percepción de latencia en galerías grandes.

### 3.3 Alertas de Validación Contextual

En los formularios (ej. `ActionModal`), las alertas se construyen en línea inyectando variaciones de color HSL de modo dinámico cuando no se cumple una condición:

```jsx
{details.trim().length === 0 && (
  <div style={{
    display: 'flex', alignItems: 'center', gap: 6,
    background: 'hsla(var(--danger), 0.1)',
    color: 'hsl(var(--danger))'
  }}>
    <AlertCircle size={13} />
    Debes indicar quién recibe el material para continuar.
  </div>
)}
```
> [!WARNING]
> La inyección de variables dinámicas (`var(--danger)`) directamente en el atributo `style` permite el acoplamiento perfecto de los colores semánticos con la paleta activa (Light/Dark mode) sin tener que recurrir a múltiples nombres de clases.

---

## 4. Inputs Complejos Reusables: `SearchableSelect.jsx`

El caso de estudio más robusto sobre reusabilidad y gestión de estado interno es el `SearchableSelect`. Es un componente agnóstico que recibe `options` (un array de objetos) y emite un valor seleccionado.

### 4.1 Click Outside y Manejo del DOM

Un desafío común en *dropdowns* personalizados es cerrarlos al hacer click fuera del área activa. Para esto se emplea `useRef`:

```jsx
const wrapperRef = useRef(null);

useEffect(() => {
  function handleClickOutside(event) {
    if (wrapperRef.current && !wrapperRef.current.contains(event.target)) {
      setIsOpen(false);
    }
  }
  document.addEventListener("mousedown", handleClickOutside);
  return () => document.removeEventListener("mousedown", handleClickOutside);
}, [...]);
```

**Mecánica Subyacente**: El hook registra un *event listener* a nivel de documento. Cuando el ratón hace click, verifica si el elemento sobre el cual se hizo click (`event.target`) está anidado dentro del nodo del DOM del componente (`wrapperRef.current`). Si la respuesta es negativa, colapsa el modal de selección.

### 4.2 Filtrado Reactivo y Funcional

El `SearchableSelect` usa `useMemo` para optimizar la caja de búsqueda.

```jsx
const filteredOptions = useMemo(() => {
  if (!searchTerm) return options;
  const lowerSearch = searchTerm.toLowerCase();
  return options.filter(opt => {
    const labelMatch = opt.label ? String(opt.label).toLowerCase().includes(lowerSearch) : false;
    return labelMatch;
  });
}, [options, searchTerm]);
```

El "por qué" de `useMemo` es vital aquí. Cuando el componente padre vuelve a renderizarse o llega un nuevo prop `isOpen`, la lista no debe volver a filtrar todo el volumen de datos. El recálculo de la colección solo ocurre si las `options` originales o el `searchTerm` han cambiado.

## 5. Conclusión Arquitectónica

La filosofía UI de Inventor Manager en el entorno `src/components` está fuertemente arraigada en componentes aislados que balancean hábilmente las variables CSS centralizadas y la inyección en línea.

1. **Desacople del Estado Global**: Elementos como `SearchableSelect` no consumen Contexto; son puros y controlados.
2. **Elevación de Rendering (`Portals`)**: Aseguran un comportamiento Z-Index determinista para los modales.
3. **Loaders Integrados**: Previenen el sobredimensionamiento (bloat) del DOM y mantienen las animaciones vinculadas fluidamente mediante CSS nativo y hooks modernos como `IntersectionObserver`.
