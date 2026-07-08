# Capítulo 4: Enrutamiento y Navegación con React Router

Este capítulo desgrana de forma exhaustiva la arquitectura de enrutamiento implementada en el proyecto "Inventor Manager", la cual se basa en la librería `react-router-dom` (v6). El sistema de rutas está diseñado para ser altamente modular, seguro y escalable, permitiendo la carga bajo demanda de las vistas (lazy loading), la protección condicional según los roles de usuario (administrador, staff o usuario regular) y la inyección dinámica de rutas en tiempo de ejecución.

A lo largo de las siguientes secciones, analizaremos milimétricamente el "qué", el "cómo" y el "por qué" de las decisiones arquitectónicas clave presentes en `src/App.jsx`, así como la sinergia entre las rutas y los componentes de maquetación o "layouts" (`Sidebar` y `MobileBottomNav`).

---

## 1. Arquitectura Base y Lazy Loading (Carga Diferida)

El núcleo del enrutamiento se define en el archivo `src/App.jsx`. Para optimizar el rendimiento y reducir el tiempo de carga inicial de la aplicación (el llamado *Time to Interactive* o TTI), el proyecto implementa un patrón agresivo de **Lazy Loading** (carga perezosa) utilizando las funciones nativas de React: `lazy` y `Suspense`.

### ¿Qué hace `lazy`?
React.lazy permite renderizar importaciones dinámicas como si fueran componentes regulares. En el entorno de un *bundler* como Vite o Webpack, esto indica que cada componente importado mediante `lazy` debe empaquetarse en un *chunk* (archivo JavaScript) separado, el cual solo se descargará desde el servidor cuando el usuario intente acceder a esa ruta.

### ¿Cómo se implementa en el código?
Observamos en la parte superior de `App.jsx` la declaración de todas las vistas de alto nivel:

```javascript
import React, { Suspense, lazy } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';

const InventoryView = lazy(() => import('./views/InventoryView'));
const SettingsView = lazy(() => import('./views/SettingsView'));
const ProfileView = lazy(() => import('./views/ProfileView'));
const UserManagementView = lazy(() => import('./views/UserManagementView'));
const LoginView = lazy(() => import('./views/LoginView'));
const ParquesView = lazy(() => import('./views/ParquesView'));
const AnalyticsView = lazy(() => import('./views/AnalyticsView'));
const TransactionsView = lazy(() => import('./views/TransactionsView'));
// ... más vistas
```

### El componente `<Suspense>`
Para que React sepa qué mostrar en la interfaz de usuario mientras el navegador descarga el *chunk* de JavaScript correspondiente a la vista solicitada, se utiliza el componente `<Suspense>`. Este envuelve al componente `<Routes>` entero.

```javascript
<Suspense fallback={
  <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%', width: '100%' }}>
    <Loader2 className="animate-spin" style={{ color: 'hsl(var(--primary))' }} size={40} />
  </div>
}>
  <Routes>
     {/* Definición de rutas... */}
  </Routes>
</Suspense>
```

> [!TIP]
> **Optimización de Rendimiento:** Agrupar todas las rutas dentro de un único bloque `<Suspense>` simplifica el árbol de componentes. El *fallback* mostrado es un componente circular de carga animado (`Loader2` de `lucide-react`) que ofrece una experiencia fluida al usuario durante las transiciones de red.

---

## 2. Protección de Rutas: El Componente `ViewProtectedRoute`

Uno de los pilares de seguridad del front-end es garantizar que los usuarios solo puedan acceder a las pantallas permitidas por sus roles y permisos explícitos. Este trabajo es responsabilidad del componente envoltorio o *Higher-Order Component (HOC)* enrutador: `ViewProtectedRoute`.

### El método `hasViewAccess`
Antes de renderizar el componente protegido, el sistema debe evaluar si el usuario cuenta con los permisos necesarios. Esta evaluación se centraliza en la función `hasViewAccess(viewId)`.

```javascript
const hasViewAccess = (viewId) => {
  // 1. Permiso absoluto para administradores
  if (isAdmin) return true;
  
  // 2. Vistas públicas / por defecto permitidas para todos los usuarios autenticados
  const defaultAllowed = ['dashboard', 'profile'];
  if (defaultAllowed.includes(viewId)) return true;
  
  // 3. Fallback de seguridad si no hay datos de usuario cargados
  if (!userData) return false;
  
  // 4. Retrocompatibilidad para cuentas creadas antes de la implementación de ACL (Access Control Lists)
  if (!userData.allowedViews) return true;
  
  // 5. Comprobación final basada en los permisos explícitos del usuario
  return userData.allowedViews.includes(viewId);
};
```

**Por qué es importante:** La lógica abarca de manera robusta casos límite. Por ejemplo, asegura retrocompatibilidad para usuarios heredados que quizás no tengan el campo `allowedViews` en la base de datos, evitando que se queden sin acceso de forma abrupta tras una actualización.

### La ejecución en `ViewProtectedRoute`
Una vez la lógica de validación está definida, el envoltorio `ViewProtectedRoute` intercepta el flujo de renderizado.

```javascript
const ViewProtectedRoute = ({ viewId, children }) => {
  // Evitar renderizado anómalo durante validación inicial de sesión
  if (loading) return null; 
  
  // Condición de éxito: el usuario puede ver la vista
  if (hasViewAccess(viewId)) return children;
  
  // Condición de fallo: renderiza pantalla de Acceso Denegado
  return (
    <div className="flex flex-col items-center justify-center h-full p-8 text-center animate-fade-in">
      <div className="w-20 h-20 bg-red-50 dark:bg-red-900/20 text-red-500 rounded-full flex items-center justify-center mb-6">
        <Lock size={40} />
      </div>
      <h2 className="text-2xl font-black mb-2">Acceso Restringido</h2>
      <p className="text-muted max-w-xs mx-auto mb-8">
        No tienes permisos para ver esta sección. Contacta a un administrador para solicitar acceso.
      </p>
      <button className="btn-apple-primary px-8" onClick={() => window.location.href = '/'}>
        Volver al Inicio
      </button>
    </div>
  );
};
```

**Por qué un HOC en lugar de `<Navigate>` ciego?** 
Al retornar un mensaje explícito de "Acceso Restringido" en lugar de redirigir inmediatamente al inicio, se proporciona un mejor *feedback* de interfaz de usuario. El usuario entiende por qué no puede acceder a una URL en lugar de sentirse frustrado por una redirección aparentemente aleatoria.

---

## 3. Enrutamiento Estático vs Dinámico

La sección `<Routes>` en `App.jsx` define qué componentes corresponden a qué segmentos de la URL. Aquí encontramos un diseño híbrido: rutas "hardcodeadas" y rutas generadas dinámicamente en tiempo de ejecución.

### Enrutamiento Estático
Para los módulos fijos del sistema, las rutas se declaran tradicionalmente. Todas utilizan `ViewProtectedRoute` con su respectivo `viewId` como llave de seguridad.

```javascript
<Route path="/" element={<ViewProtectedRoute viewId="dashboard"><Dashboard /></ViewProtectedRoute>} />
<Route path="/tornilleria" element={<ViewProtectedRoute viewId="tornilleria"><InventoryView categoryTitle="Tornillería" /></ViewProtectedRoute>} />
<Route path="/facturas" element={<ViewProtectedRoute viewId="facturas"><InvoicesView /></ViewProtectedRoute>} />
```

Para secciones de configuración o administración (donde los permisos no son modulares sino categóricos), se utiliza una renderización condicional basada en booleanos (`isAdmin`, `isStaff`) rediriendo silenciosamente (usando `<Navigate />`) si el rol no se cumple:

```javascript
<Route path="/settings" element={isAdmin ? <SettingsView /> : <Navigate to="/" />} />
<Route path="/users" element={isAdmin ? <UserManagementView /> : <Navigate to="/" />} />
<Route path="/sections" element={isStaff ? <SectionAdminView /> : <Navigate to="/" />} />
```

### Enrutamiento Dinámico
El sistema es altamente parametrizable; un administrador puede crear nuevas "categorías personalizadas" en tiempo de ejecución. Estas categorías no existen en el código estático, provienen del estado global (`useInventory`).

```javascript
{/* Dynamic Categories */}
{customCategories?.map(cat => (
  <Route 
    key={cat.id} 
    path={cat.route} 
    element={
      <ViewProtectedRoute viewId={cat.id}>
        <InventoryView categoryTitle={cat.name} />
      </ViewProtectedRoute>
    } 
  />
))}
```

> [!IMPORTANT]
> **Escalabilidad de Vistas:** Gracias al enrutamiento dinámico, agregar una categoría de inventario nueva no requiere recompilar ni redesplegar la aplicación. React inyecta una nueva `<Route>` en tiempo de ejecución y usa el mismo componente `InventoryView` reutilizable, parametrizándolo con la nueva propiedad `categoryTitle`.

### Manejo de Fallos (Ruta 404)
El comodín `*` atrapa cualquier solicitud de ruta no declarada y redirige de manera segura al dashboard (`/`), asegurando que la aplicación no colapse en caso de URLs inválidas:

```javascript
<Route path="*" element={<Navigate to="/" replace />} />
```

---

## 4. Integración del Enrutamiento en los Componentes Layout

El enrutamiento no solo existe en la capa lógica (`App.jsx`), sino que está estrechamente acoplado con la navegación visual. Existen dos componentes principales responsables: `Sidebar.jsx` (para vista de escritorio) y `MobileBottomNav.jsx` (para dispositivos móviles). Ambos emplean el componente especial `<NavLink>` de `react-router-dom`.

### El uso de `<NavLink>`
La diferencia entre `<Link>` y `<NavLink>` radica en que este último sabe si su ruta correspondiente está activa (si la URL del navegador coincide con su prop `to`). 

En el componente `Sidebar`, se observa:

```javascript
<NavLink to="/tornilleria" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
  <Wrench size={20} />
  <span>Tornillería</span>
</NavLink>
```
Este fragmento inyecta dinámicamente la clase CSS `active`, lo cual pinta de otro color el ítem del menú indicándole al usuario en qué sección se encuentra.

### Reflejo de Permisos en la UI
Tanto la barra lateral como la barra móvil invocan una copia de la misma función `hasAccess(viewId)` que evalúa `ViewProtectedRoute`. Esto responde a una regla de oro de la usabilidad y la seguridad UI: **"No muestres una puerta que el usuario no puede abrir"**.

```javascript
{hasAccess('papeleria') && (
  <li>
    <NavLink to="/papeleria" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
      <PenTool size={20} />
      <span>Papelería</span>
    </NavLink>
  </li>
)}
```

### Menús Dinámicos en la UI
Así como el `App.jsx` inyectaba componentes de ruta `<Route>` leyendo de `customCategories`, el menú lateral (y el *Bottom Sheet* en el dispositivo móvil) se sincroniza para pintar los botones de enlace de esas categorías personalizadas.

```javascript
{/* ─── DYNAMIC CATEGORIES en Sidebar ─── */}
{customCategories?.map(cat => {
  if (!hasAccess(cat.id) && !isAdmin) return null;
  
  // Resolución dinámica de iconos (Fallback: Layers)
  const IconComp = {
    Layers: <Layers size={20} />,
    Box: <Box size={20} />
  }[cat.icon] || <Layers size={20} />;

  return (
    <li key={cat.id}>
      <NavLink to={cat.route} className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
        {IconComp}
        <span>{cat.name}</span>
      </NavLink>
    </li>
  );
})}
```

> [!NOTE]
> En entornos móviles (`MobileBottomNav`), el enrutamiento tiene una complejidad adicional: cuando ocurre un cambio de ruta (`location.pathname`), los menús desplegables se cierran automáticamente. Esto se logra mediante el hook `useEffect` escuchando a `location.pathname` (obtenido mediante el hook `useLocation()` del *Router*).

## Resumen Arquitectónico del Ciclo de Enrutamiento

1. El usuario intenta navegar a `/impresion-3d`.
2. El enrutador (`<Router>`) en `App.jsx` busca una coincidencia en el array de `<Routes>`.
3. Encuentra el `<Route>` e intenta renderizar `<ViewProtectedRoute viewId="impresion-3d">`.
4. El envoltorio revisa el `Contexto` de autenticación (`useAuth`). Si el usuario tiene permisos (`hasViewAccess`), procede.
5. El componente original, `InventoryView` está bajo carga diferida. `<Suspense>` muestra la pantalla de carga.
6. El navegador descarga asíncronamente el chunk (ej. `InventoryView-a4b5.js`).
7. El componente se hidrata y renderiza en pantalla.
8. Simultáneamente, el `Sidebar` o `MobileBottomNav` usa `useLocation` para detectar la coincidencia de URL y activa el estilo visual del elemento `NavLink` para `/impresion-3d`.

Este diseño asegura tiempos de carga óptimos, alta extensibilidad para características futuras y un control perimetral robusto sin sacrificar la experiencia de usuario.
