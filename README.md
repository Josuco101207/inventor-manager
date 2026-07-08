# 🚀 Inventor Manager Pro

> **Sistema profesional de gestión de inventarios, préstamos de herramientas y control de activos.**

Bienvenido a la documentación oficial de **Inventor Manager Pro**. Diseñado con una interfaz moderna y fluida (inspirada en el *Glassmorphism* y el ecosistema de Apple), e impulsado por tecnologías web de vanguardia, este proyecto busca solucionar de manera centralizada los retos clásicos del control de stock, auditorías, manejo de personal y préstamos de equipo en tiempo real.

---

## 🌐 Acceso Rápido (Usuarios)

**¡No necesitas instalar nada ni usar la terminal!** 
Para comenzar a utilizar Inventor Manager Pro inmediatamente, simplemente ingresa al siguiente enlace desde cualquier navegador en tu computadora o teléfono móvil:

🔗 **[Acceder a Inventor Manager Pro (En Línea)](https://inventor-manager-a0b4d.web.app)**

*💡 Tip: Puedes instalar esta aplicación directamente en tu celular o PC usando la opción "Instalar aplicación" o "Agregar a la pantalla de inicio" de tu navegador, ya que funciona como una PWA.*

---

## ✨ Características Principales

- ⚡ **Gestión en Tiempo Real:** Arquitectura Serverless utilizando Firebase Firestore, lo que garantiza que cualquier movimiento (entradas, salidas, préstamos) se refleje instantáneamente en todas las pantallas conectadas.
- 📱 **Progressive Web App (PWA) & Offline-First:** Soporte robusto para trabajar en entornos de baja conectividad e instalable de forma nativa.
- 🔍 **Escáner Inteligente (QR / Código de Barras):** Módulo de IA y reconocimiento por cámara para realizar altas, bajas o auditorías de forma ágil desde el dispositivo móvil, sin requerir hardware adicional.
- 🛠️ **Préstamos y Asignaciones:** Panel de control especializado para registrar la salida de herramientas, gestionar el mantenimiento, documentar reportes de fallas y asignar responsabilidades nominales.
- 📊 **Dashboard y Analítica Avanzada:** Representación visual de datos mediante gráficos interactivos. Permite el monitoreo del stock crítico, alertas automatizadas, análisis de actividad semanal y reportes.
- 🔐 **Sistema de Roles y Permisos (RBAC):** Capas de seguridad estrictas que segmentan la plataforma para Administradores (`isAdmin`), Operadores/Staff (`isStaff`) y Usuarios base, restringiendo vistas y acciones destructivas.
- 🗂️ **Categorías Dinámicas:** Además de las vistas nativas, cuenta con un motor para que los administradores creen "Secciones" o almacenes personalizados bajo demanda.
- 🧾 **Trazabilidad Absoluta:** Historial inmutable de transacciones y facturas para propósitos de auditoría (quién hizo el cambio, cuándo y qué acción se tomó).

---

## 🛠️ Tecnologías Utilizadas (Tech Stack)

Este proyecto está construido sobre el ecosistema moderno de JavaScript / React:

- **Frontend:** [React 19](https://react.dev/) + [Vite](https://vitejs.dev/)
- **Enrutamiento:** React Router DOM (v7)
- **Base de Datos & Auth:** [Firebase](https://firebase.google.com/) (Firestore, Authentication, Storage, Hosting)
- **Diseño UI:** CSS3 nativo (Glassmorphism), [Lucide React](https://lucide.dev/), y [Sonner](https://sonner.emilkowal.ski/).
- **Reportes y Tablas:** Recharts, ExcelJS, y SheetJS (XLSX).

---

## 💻 Guía para Desarrolladores (Instalación Local)

> ⚠️ **Nota:** Esta sección es **exclusivamente para desarrolladores** que deseen modificar el código fuente. Los usuarios regulares solo necesitan entrar al enlace web de arriba.

### Requisitos Previos
- **Node.js** (v18.x o superior) y **NPM** (v9 o superior).
- Cuenta y proyecto configurado en la consola de **Firebase**.

### 1. Clonar el repositorio y preparar el entorno
Abre tu terminal y ejecuta:
```bash
git clone <URL_DEL_REPOSITORIO>
cd "Inventor Manager"
npm install
```

### 2. Configuración del Entorno (`.env`)
El proyecto necesita enlazarse a tu proyecto de Firebase. Crea un archivo en la raíz llamado `.env` e incluye tus variables:
```env
VITE_FIREBASE_API_KEY="tu_api_key"
VITE_FIREBASE_AUTH_DOMAIN="tu_proyecto.firebaseapp.com"
VITE_FIREBASE_PROJECT_ID="tu_proyecto"
VITE_FIREBASE_STORAGE_BUCKET="tu_proyecto.appspot.com"
VITE_FIREBASE_MESSAGING_SENDER_ID="tus_datos"
VITE_FIREBASE_APP_ID="tus_datos"
```
*(Nota: Nunca hagas commit de este archivo si contiene información productiva).*

### 3. Comandos NPM (Scripts) Principales

| Comando | Descripción |
|---------|-------------|
| `npm run dev` | Inicia el servidor local de desarrollo con HMR (Hot Module Replacement) para programar en tiempo real. |
| `npm run build` | Compila la aplicación, optimizando los assets y empaquetando la PWA en la carpeta `dist/`. |
| `npm run deploy` | Comando combinado que ejecuta la compilación y publica los cambios directamente en Firebase Hosting. |

---

### 🔒 Reglas de Seguridad (Firestore Rules)
El sistema confía altamente en los **Custom Claims** generados al inicio de sesión y la metadata de Auth. Las reglas (`firestore.rules`) rechazarán automáticamente cualquier petición de lectura/escritura si el usuario no tiene los permisos suficientes. Mantenlas sincronizadas usando el comando: `firebase deploy --only firestore:rules`.

---

### 👨‍💻 Acerca del Desarrollo
Desarrollado y estructurado por **Jonathan Suarez (2026)**.  
Para reporte de bugs, nuevas integraciones o mantenimiento de bases de datos de legado, favor de consultar al administrador de la red.

*Inventor Manager Pro — La evolución en la gestión de recursos empresariales.*
