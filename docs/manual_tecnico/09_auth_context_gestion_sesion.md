# Capítulo 9: Gestión de Sesión y Autenticación (`AuthContext.jsx`)

## 1. Introducción
El archivo `src/context/AuthContext.jsx` constituye el núcleo de la arquitectura de seguridad y gestión de identidades dentro de la aplicación **Inventor Manager**. A través del patrón de Contexto de React (React Context API), este módulo encapsula la integración con **Firebase Authentication** y **Cloud Firestore**, proveyendo de manera global el estado del usuario activo, los datos de su perfil, permisos específicos de su rol y métodos para interactuar con el flujo de autenticación (login, registro, cierre de sesión).

Adicionalmente, este contexto implementa mecanismos avanzados de seguridad proactiva, tales como el cierre de sesión automático por inactividad —usando técnicas de *throttling* de eventos para preservar el rendimiento— y el monitoreo del estado de visibilidad del documento para mitigar riesgos cuando la aplicación pasa a segundo plano.

---

## 2. Flujo de Login y Sincronización de Perfil

El proceso de autenticación en Inventor Manager no se limita a verificar las credenciales del usuario; se extiende a recuperar de forma asíncrona y reactiva su perfil extendido desde la base de datos de Firestore para asegurar que la aplicación responda a los cambios en sus permisos en tiempo real.

### 2.1. Inicialización y `onAuthStateChanged`

El corazón de la inicialización de la sesión se encuentra en un hook `useEffect` que se ejecuta al montar el proveedor del contexto:

```javascript
const unsubscribeAuth = onAuthStateChanged(auth, async (currentUser) => {
  setUser(currentUser);
  // Limpieza de listeners previos...
```

**¿Qué hace?**
`onAuthStateChanged` es un observador en tiempo real provisto por Firebase Auth que se dispara cada vez que el estado de autenticación cambia (debido a un inicio de sesión, un cierre de sesión explícito o la expiración/renovación del token subyacente).

**¿Por qué y Cómo?**
Al detectar la presencia de un `currentUser`, la aplicación inmediatamente actualiza el estado interno de React (`user`). Sin embargo, el objeto proporcionado nativamente por Firebase Auth carece de datos de negocio específicos de la aplicación, como por ejemplo los roles asignados o las categorías a las que el usuario tiene acceso. Por ello, el contexto procede a solicitar un documento específico en Firestore:

```javascript
const userRef = doc(db, 'users', currentUser.uid);
const userSnap = await getDoc(userRef);
if (userSnap.exists()) {
  setUserData(userSnap.data());
}
setLoading(false);
```

Este paso inicial sincrónico (`getDoc`) garantiza que, antes de liberar la bandera de estado de carga (`loading`), la aplicación cuente con al menos la configuración base del usuario, evitando así el renderizado intermedio y transitorio de interfaces para las cuales el usuario podría no estar autorizado.

### 2.2. Sincronización en Tiempo Real (`onSnapshot`)

Para lograr que los cambios de roles y permisos efectuados por un administrador impacten inmediatamente al usuario afectado sin necesidad de que éste recargue la página, se implementa un *listener* asíncrono en tiempo real sobre el documento del usuario:

```javascript
unsubscribeProfile = onSnapshot(userRef, { includeMetadataChanges: true }, (snap) => {
  if (snap.exists()) {
    setUserData(snap.data());
  } else {
    setUserData(null);
  }
});
```

> [!NOTE]
> La opción `{ includeMetadataChanges: true }` es crucial, ya que asegura que la interfaz pueda reaccionar a cambios locales de estado incluso cuando aún no han sido confirmados definitivamente por el backend de Firestore. Esto mejora drásticamente la percepción de inmediatez y reactividad de la UI.

El archivo también asegura la limpieza cuidadosa de los *listeners* de Firebase (`unsubscribeProfile` y `unsubscribeAuth`), la cual se maneja explícitamente en el retorno del `useEffect` para prevenir problemas de rendimiento y fugas de memoria (*memory leaks*).

### 2.3. Funciones Envolventes de Autenticación
El contexto expone un conjunto de funciones de alto nivel para las operaciones sobre Firebase, abstraídas para uso general en los componentes:

| Método | Descripción | Endpoint Subyacente |
|--------|-------------|---------------------|
| `login(email, password)` | Valida credenciales e inicia la sesión. | `signInWithEmailAndPassword` |
| `signup(email, password, name)` | Crea un nuevo usuario en la base de datos de Firebase. | `createUserWithEmailAndPassword` |
| `logout()` | Elimina los tokens locales y fuerza el cierre de sesión global. | `signOut` |

---

## 3. Lógica de Seguridad: Auto-cierre por Inactividad

En aplicaciones de tipo empresarial o de gestión de inventarios, permitir sesiones perpetuas representa una vulnerabilidad de seguridad crítica (por ejemplo, si un operador deja su tablet desatendida en un almacén). Para mitigar este riesgo, `AuthContext.jsx` integra un sofisticado temporizador de cierre de sesión altamente optimizado.

### 3.1. Throttling de Eventos de Interfaz

Si la aplicación detectara absolutamente cada movimiento del ratón para reiniciar el temporizador, bloquearía constantemente el hilo principal (Main Thread) de JavaScript con miles de ejecuciones por minuto, causando un efecto indeseable de *jank* (pérdida de fotogramas e interrupciones) en la interfaz. La solución elegante implementada es un mecanismo de *Throttling*.

```javascript
const resetTimer = () => {
  const now = Date.now();
  // Throttle: ignorar si la última actividad fue hace menos de 2 segundos
  if (now - lastActivity < 2000) return;
  lastActivity = now;
  
  if (inactivityTimer) clearTimeout(inactivityTimer);
  inactivityTimer = setTimeout(handleInactivity, INACTIVITY_MS);
};
```

**¿Cómo funciona?**
Al capturar un evento de interacción, se compara la estampa de tiempo actual con la variable `lastActivity`. Si han transcurrido menos de 2000 milisegundos (2 segundos), la función retorna inmediatamente sin reiniciar los temporizadores internos de JavaScript (lo cual constituye una operación computacionalmente moderada). Esto limita drásticamente las actualizaciones a un máximo de 1 ejecución cada 2 segundos.

**Eventos Monitoreados (Implementación Pasiva):**
```javascript
const events = ['mousedown', 'keypress', 'scroll', 'touchstart'];

events.forEach(event => {
  window.addEventListener(event, resetTimer, { passive: true });
});
```

> [!TIP]
> El uso de la propiedad `{ passive: true }` indica proactivamente al navegador web que este listener de eventos nunca invocará internamente el método `preventDefault()`. Esto permite que procesos críticos de la UI, como el *scroll* nativo, fluyan de forma suave y sin requerir esperar la respuesta de finalización de JavaScript. El resultado es una fluidez de 60 FPS inquebrantable, factor vital en tablets u otros dispositivos móviles utilizados en el terreno.

### 3.2. Gestión de Segundo Plano (Monitoreo de Document Visibility)

Adicionalmente al control del tiempo de inactividad mientras la aplicación está en uso (`INACTIVITY_MS = 30 minutos`), el sistema monitorea rigurosamente si la pestaña o ventana del navegador es enviada al segundo plano (*background*). Esto puede ocurrir al cambiar de aplicación activa en un iPad, o simplemente al minimizar el navegador.

```javascript
const handleVisibilityChange = () => {
  if (document.visibilityState === 'hidden') {
    backgroundTimer = setTimeout(() => {
      logout();
      // ... toast notification
    }, BACKGROUND_MS); // Configurdo a 60 minutos
  } else {
    // El usuario volvió antes del límite de tiempo
    if (backgroundTimer) {
      clearTimeout(backgroundTimer);
      backgroundTimer = null;
    }
    resetTimer();
  }
};
document.addEventListener('visibilitychange', handleVisibilityChange);
```

> [!IMPORTANT]
> **Razonamiento Arquitectónico:** Cuando un navegador web moderno pasa a segundo plano, por motivos de optimización de batería frecuentemente suspende, retrasa o debilita la ejecución sistemática de los temporizadores `setTimeout` o `setInterval` en JavaScript. Por tanto, basarse única y exclusivamente en `setTimeout` para la inactividad principal suele fallar de forma totalmente impredecible cuando la pestaña no está visible. Al emplear la API oficial de *Page Visibility* (`visibilitychange`), la aplicación detecta de forma activa cuándo el usuario ha dejado de visualizarla. Si supera el tiempo de espera oculto estipulado, se dispara invariablemente la desconexión segura.

---

## 4. Asignación de Roles y Autorización Dinámica (RBAC)

Una de las responsabilidades más complejas de este contexto central es evaluar en el cliente qué acciones tiene permitidas ejecutar el usuario activo, basándose en la configuración de su perfil sincronizado en tiempo real. Esta implementación emplea el modelo Role-Based Access Control (RBAC).

### 4.1. Evaluación Jerárquica de Roles Base

El sistema determina la jerarquía base del usuario interrogando su campo `role` en Firestore:

```javascript
const isAdmin = userData?.role === 'admin';
const isStaff = userData?.role === 'admin' || userData?.role === 'almacenista';
```
Esta asignación deriva constantes semánticamente expresivas (`isAdmin`, `isStaff`) que posteriormente pueden ser inyectadas de forma transparente en cualquier componente descendiente para habilitar o deshabilitar vistas enteras de la aplicación.

### 4.2. Control Granular de Permisos por Categoría (ACLs)

Para niveles de validación altamente específicos en funciones CRUD, el contexto no expone booleanos, sino *callbacks* funcionalizados y optimizados mediante el hook `useCallback`. Estos *callbacks* dictaminan si el usuario actual posee permisos concretos sobre categorías específicas de inventario, mediante los métodos `canAddTo` y `canEditIn`.

```javascript
const canAddTo = useCallback((category) => {
  if (isAdmin) return true;
  if (!isStaff) return false;
  
  const allowed = userData?.allowedCategories;
  if (!allowed || !Array.isArray(allowed)) return false;
  
  return allowed.includes(category);
}, [isAdmin, isStaff, userData?.allowedCategories]);
```

**Lógica de Negocio de Decisión:**
1. **Delegación de Administrador (Superusuario):** Si el contexto detecta la bandera `isAdmin`, devuelve directamente `true`, saltándose las siguientes restricciones (Override global).
2. **Exclusión de Usuarios Estándar:** Si el usuario no pertenece a la agrupación general del equipo de trabajo (`isStaff`), inmediatamente devuelve `false`, garantizando seguridad por defecto (Fail-closed).
3. **Listas de Acceso Limitadas (ACLs):** Se efectúa una inspección sobre el perfil para validar la existencia de arreglos de configuración como `allowedCategories` (para añadir/crear ítems) o `editableCategories` (para modificar ítems). Acto seguido, se utiliza la función prototípica de arrays `.includes(category)` con el fin de asentar la autorización final.

> [!WARNING]
> La elección consciente de envolver las funciones `canAddTo` y `canEditIn` dentro de un hook de memoización `useCallback` no es una mera formalidad estructural. Asegura que la dirección de referencia en memoria de dichas funciones se mantenga idéntica entre ciclos de renderizado del Contexto, mutando única y exclusivamente si los datos del perfil lo hacen. Esta precaución previene catastróficas cascadas de re-renderizado a lo largo del Árbol Virtual DOM, algo esencial al construir largas y pesadas tablas de inventario repletas de componentes conectados al mismo Contexto.

---

## 5. Exposición del Valor del Contexto (`Context Provider`)

A modo de epílogo técnico, todos estos cálculos derivados de sesión, perfiles, hooks, booleanos estáticos y permisos dinámicos, convergen en un único objeto de transmisión distribuido a la aplicación.

```javascript
const contextValue = useMemo(() => ({
  user, 
  userData, 
  loading, 
  login, 
  signup, 
  logout,
  isAdmin,
  isStaff,
  canAddTo,
  canEditIn
}), [user, userData, loading, isAdmin, isStaff, canAddTo, canEditIn]);

return (
  <AuthContext.Provider value={contextValue}>
    {children}
  </AuthContext.Provider>
);
```

El hook `useMemo` oficia como la última línea de defensa respecto al rendimiento de aplicación. Consigue exitosamente que si un componente superior obliga aleatoriamente a re-renderizar a `AuthProvider`, los infinitos componentes subscriptores a este contexto específico en la aplicación no experimentarán un re-renderizado computacionalmente abusivo. Todo gracias a que la referencia central del valor provisto se ha estabilizado de forma precisa.

---

## 6. Resumen Ejecutivo
El archivo `AuthContext.jsx` del sistema Inventor Manager es un estandarte de las mejores prácticas modernas en el diseño de capas de autenticación reactivas, escalables y seguras usando React y Firebase. El módulo no se conforma con delegar la confirmación y almacenamiento de identidad, sino que despliega agresivos mecanismos de defensa ante la inactividad visual del usuario, exprime los hooks de React en beneficio absoluto del uso de memoria, e impone con solidez y elegancia una barrera jerárquica de permisos granulares capaz de extenderse y blindar cada rincón lógico de la aplicación.
