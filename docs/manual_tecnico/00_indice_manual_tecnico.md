# 📚 Manual Técnico: Inventor Manager

## 🚀 Introducción al Proyecto
**Inventor Manager** representa la vanguardia en sistemas de gestión de inventario, diseñado bajo una arquitectura web moderna, robusta y orientada a la alta disponibilidad. Este sistema ha sido concebido no solo como una herramienta de administración, sino como un ecosistema integral capaz de procesar, almacenar y analizar datos de inventario en tiempo real. Utilizando **React, Vite y Firebase**, Inventor Manager proporciona una experiencia de usuario fluida, reactiva y enriquecida con capacidades _offline_ como Aplicación Web Progresiva (PWA).

## 📈 Escalabilidad y Diseño Arquitectónico
La escalabilidad está en el núcleo de **Inventor Manager**. Al emplear tecnologías _serverless_ mediante Firebase (Firestore, Storage, Authentication, Cloud Functions), la aplicación delega la administración de la infraestructura para centrarse en la lógica de negocio y el rendimiento en el lado del cliente. 

A nivel de frontend, el diseño se fundamenta en:
- **Gestión de Estado Modularizado:** Separación de dominios mediante Context API (Auth, Inventory, Theme, AI) para aislar la lógica, mantener código limpio y evitar re-renderizados innecesarios.
- **Procesamiento Asíncrono y Paralelo:** Uso intensivo de **Web Workers** para el filtrado masivo de datos sin bloquear el hilo principal de la Interfaz de Usuario (UI).
- **Herramientas de Borde (Edge Capabilities):** Impresión térmica directa, importación y exportación avanzada en formatos Excel con coincidencia difusa (fuzziness), e Inteligencia Artificial integrada en el navegador.
- **Preparación para Alta Concurrencia:** Reglas estrictas de seguridad (Firestore/Storage) e índices compuestos optimizados garantizan tiempos de respuesta inferiores a los 50ms, incluso con bases de datos en constante crecimiento.

---

## 📑 Índice Completo de Documentación (Capítulos 01 al 40)

> [!NOTE]
> Este índice organiza secuencialmente todos los aspectos técnicos, arquitectónicos y operativos del proyecto. Cada documento detalla el **Qué, Cómo y Por Qué** de su respectiva área, basándose tanto en los módulos ya implementados como en el mapa de ruta (roadmap) evolutivo.

### 🏗️ PARTE I: Fundamentos y Arquitectura Base
- [**01. Arquitectura General (React + Vite)**](./01_arquitectura_general_react_vite.md): Estructura de carpetas, ciclo de construcción y patrones de diseño principales.
- [**02. Gestión de Dependencias (NPM)**](./02_dependencias_npm.md): Análisis exhaustivo del `package.json`, versiones, auditorías de seguridad y dependencias clave.
- [**03. Configuración de Entornos (Dev/Prod)**](./03_configuracion_entorno.md): Variables de entorno, perfiles `.env` y separación de infraestructura.
- [**04. Enrutamiento (React Router)**](./04_enrutamiento_react_router.md): Gestión de rutas públicas/privadas, *lazy loading* de componentes y *code splitting*.

### ⚡ PARTE II: PWA y Capacidades Offline
- [**05. PWA y Service Workers**](./05_pwa_service_workers.md): Estrategias de caché (Cache First, Network First), manifiesto y sincronización en segundo plano.
- [**06. Estrategia de Persistencia Local**](./06_persistencia_local_indexeddb.md): Uso de IndexedDB y LocalStorage para soporte 100% *offline*.
- [**07. Sincronización Bidireccional**](./07_sincronizacion_bidireccional.md): Colas de peticiones y resolución de conflictos al recuperar conectividad.

### 🧠 PARTE III: Gestión de Estado y Contextos Globales
- [**08. Inventory Context (Lógica de Inventario)**](./08_inventory_context.md): Flujos de alta, baja, actualización y cálculos en tiempo real de stock.
- [**09. Auth Context (Gestión de Sesión)**](./09_auth_context_gestion_sesion.md): Persistencia de tokens, refresco, y estados de autenticación a nivel de UI.
- [**10. Theme & AI Context (UI y Asistente)**](./10_theme_y_ai_context.md): Manejo del Modo Oscuro/Claro y el estado conversacional/predictivo del asistente de IA.

### 🗄️ PARTE IV: Backend y Base de Datos (Firebase)
- [**11. Estructura de Datos en Firestore**](./11_estructura_de_datos_firestore.md): Modelado NoSQL, colecciones, subcolecciones y desnormalización estratégica.
- [**12. Modelado de Entidades Clave**](./12_modelado_de_entidades.md): Definición de esquemas de Productos, Categorías, Movimientos y Usuarios.
- [**13. Optimización de Lecturas e Índices**](./13_optimizacion_de_lecturas_firestore.md): Configuración de `firestore.indexes.json` y prevención de consultas lentas.
- [**14. Firebase Cloud Functions**](./14_funciones_cloud_firebase.md): Triggers (onCreate, onUpdate) para agregaciones, notificaciones push y mantenimiento.

### 🛡️ PARTE V: Seguridad y Autenticación
- [**15. Reglas de Seguridad en Firestore**](./15_reglas_seguridad_firestore.md): Políticas ABAC/RBAC, validación de esquemas y protección de escritura.
- [**16. Reglas de Seguridad en Storage**](./16_reglas_seguridad_storage.md): Restricciones por tipo MIME, límites de tamaño y aislamiento de archivos de usuario.
- [**17. Proveedores de Autenticación**](./17_autenticacion_proveedores.md): Integración con Google, Email/Password y recuperación de cuentas.
- [**18. Gestión de Roles y Permisos**](./18_gestion_de_roles_y_permisos.md): Jerarquía de usuarios (Admin, Manager, Operador) y control de acceso a vistas.

### 🎨 PARTE VI: Interfaz, UI y Experiencia de Usuario
- [**19. Componentes UI Reutilizables**](./19_componentes_ui_comunes.md): Catálogo interno de botones, modales, tablas y *loaders*.
- [**20. Sistema de Notificaciones (Toasts)**](./20_sistema_de_notificaciones.md): Alertas contextuales, manejo de tiempos y retroalimentación háptica.
- [**21. Hooks Personalizados (Custom Hooks)**](./21_hooks_personalizados.md): Encapsulamiento de lógica compleja (`useDebounce`, `useFirestore`, etc.).
- [**22. Optimización de Rendimiento UI**](./22_optimizacion_de_rendimiento_react.md): Prevención de *re-renders* mediante `React.memo`, `useMemo` y `useCallback`.

### 🚀 PARTE VII: Características Avanzadas y Procesamiento
- [**23. Procesamiento Paralelo: Web Worker de Filtrado**](./23_web_worker_filtrado.md): Delegación de búsqueda masiva de arrays al Web Worker.
- [**24. Integración de IA Predictiva**](./24_integracion_inteligencia_artificial.md): Modelos de machine learning para alertas de escasez y sugerencias de compra.
- [**25. Exportación a Excel y Reportes**](./25_exportacion_excel.md): Generación dinámica de reportes `.xlsx` y formateo de celdas.
- [**26. Importación Masiva y Fuzziness (Búsqueda Difusa)**](./26_importacion_y_fuzziness.md): Algoritmos de similitud (Levenshtein) para unificación de datos.
- [**27. Integración de Impresión Térmica**](./27_impresion_termica.md): Comunicación Bluetooth/USB con impresoras ESC/POS (tickets y etiquetas).
- [**28. Escaneo de Códigos de Barras y QR**](./28_escaneo_codigos_barras_qr.md): Captura de hardware de cámaras web/móviles y escáneres físicos.

### 🧪 PARTE VIII: Pruebas, Calidad y Mantenimiento
- [**29. Internacionalización (i18n)**](./29_internacionalizacion_i18n.md): Soporte multi-idioma y formateo regional de divisas y fechas.
- [**30. Pruebas Unitarias e Integración**](./30_pruebas_unitarias.md): Uso de Vitest/Jest y React Testing Library.
- [**31. Pruebas End-to-End (E2E)**](./31_pruebas_e2e.md): Automatización de flujos críticos del usuario utilizando Cypress o Playwright.
- [**32. Estándares de Codificación**](./32_estandares_codificacion.md): Reglas de ESLint, Prettier y *Git hooks* (Husky) aplicados al equipo.

### ⚙️ PARTE IX: DevOps y Despliegue Continúo
- [**33. CI/CD: Integración y Despliegue Continuo**](./33_ci_cd_github_actions.md): Pipelines de GitHub Actions para despliegue automatizado.
- [**34. Monitoreo y Métricas de Uso**](./34_monitoreo_y_metricas.md): Analytics, registro de latencia y tiempos de carga de la PWA.
- [**35. Manejo de Errores y Crashlytics**](./35_manejo_errores_crashlytics.md): Trazabilidad de fallos en producción y fronteras de error en React (*Error Boundaries*).

### 🌍 PARTE X: Futuro, Resiliencia y Roadmap
- [**36. Estrategia de Backups Automatizados**](./36_estrategia_de_backups.md): Respaldos programados de colecciones Firestore a GCP Storage.
- [**37. Auditoría y Trazabilidad (Logs)**](./37_auditoria_y_logs.md): Registro inmutable de acciones críticas de usuarios para cumplimiento normativo.
- [**38. Accesibilidad (A11y)**](./38_accesibilidad_a11y.md): Navegación por teclado, soporte de lectores de pantalla (ARIA) y contrastes.
- [**39. Guía de Contribución y Onboarding**](./39_guia_contribucion.md): Instrucciones paso a paso para la incorporación de nuevos desarrolladores al proyecto.
- [**40. Roadmap del Proyecto (Futuras Versiones)**](./40_roadmap_proyecto.md): Visión a largo plazo, integración con ERPs, IoT para almacenes y expansión de IA.

---

> _"El buen código se lee y comprende como un manual técnico bien escrito."_ — **Maestre Escritor Final**
