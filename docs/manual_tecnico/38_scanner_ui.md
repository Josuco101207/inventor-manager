# Manual Técnico - Capítulo 38: Interfaz de Escaneo y Arquitectura de Captura Móvil (Scanner UI)

Este capítulo detalla la arquitectura de las interfaces de escaneo en la aplicación, específicamente centradas en la captura de imágenes, su pre-procesamiento, y la integración visual. Analizaremos profundamente la implementación actual basada en la delegación al sistema operativo a través de `ScannerAIView.jsx` y la arquitectura avanzada de streaming en tiempo real (WebRTC) esperada en `MobileScannerUI.jsx`, incluyendo los efectos visuales CSS para simular hardware de escaneo láser.

> [!NOTE]
> **Contexto de Implementación**
> Actualmente, la aplicación maneja dos filosofías de captura:
> 1. **Delegación al SO (`ScannerAIView`)**: Utiliza APIs estándar del navegador para invocar la cámara nativa.
> 2. **Captura In-App (`MobileScannerUI`)**: Utiliza WebRTC para mantener un flujo de video constante dentro del DOM.

---

## 1. Análisis de `ScannerAIView.jsx`: Delegación y Gestión de Archivos

El componente `ScannerAIView` actúa como el orquestador principal de la experiencia de Inteligencia Artificial para el inventario. En lugar de manejar un flujo de video en vivo, este componente optimiza la compatibilidad cruzada delegando la captura de la foto al sistema operativo (iOS/Android) y al hardware del dispositivo.

### 1.1 El "Qué": Componentes Clave de la Interfaz

El archivo implementa un modal superpuesto (`scanner-overlay`) que encapsula tres estados definidos por la variable `step` proveniente del contexto `ScannerAIContext`:
- `UPLOAD`: Interfaz de selección o captura fotográfica.
- `PROCESSING`: Pantalla de carga con previsualización difuminada (`blur-sm`).
- `REVIEW`: Formulario interactivo para validar la extracción de datos.

### 1.2 El "Cómo": Interacción con el Hardware mediante HTML5

La magia de la compatibilidad universal en este archivo ocurre en las siguientes líneas:

```jsx
<div className="upload-zone" onClick={() => fileInputRef.current?.click()}>
  <input 
    type="file" 
    ref={fileInputRef} 
    style={{ display: 'none' }} 
    accept="image/*"
    onChange={handleFileChange}
  />
</div>
```

**Explicación línea a línea:**
- `onClick={() => fileInputRef.current?.click()}`: El área visual actúa como un disparador (trigger) para el input oculto. Esto permite crear una interfaz de usuario atractiva sin las limitaciones de estilo de los inputs de tipo file nativos.
- `type="file" accept="image/*"`: En dispositivos móviles, el atributo `accept="image/*"` indica al sistema operativo que el usuario desea proporcionar una imagen. Automáticamente, iOS y Android presentan la opción de **"Tomar foto"** o **"Elegir de la galería"**. Esto conecta indirectamente con el hardware de la cámara del móvil sin requerir permisos complejos de WebRTC.
- `onChange={handleFileChange}`: Una vez que el OS captura la foto, el archivo binario (`File` object) es devuelto al navegador y capturado por este evento.

### 1.3 El "Por qué": Decisiones de Diseño

> [!TIP]
> **Ventajas de la delegación al Sistema Operativo**
> Utilizar `<input type="file">` en lugar de WebRTC en la vista general reduce drásticamente los errores por permisos denegados, problemas con cámaras secundarias (ultra-wide vs macro) y libera al navegador del procesamiento constante de fotogramas de video, ahorrando batería.

Además, el componente maneja eventos de "Drag & Drop" (`onDragOver` y `onDrop`) para mantener compatibilidad con usuarios de escritorio.

---

## 2. Análisis de `MobileScannerUI.jsx`: Manejo de Streams WebRTC

*(Nota Arquitectónica: Este análisis detalla la implementación técnica del componente dedicado a la captura en tiempo real In-App mediante WebRTC, el cual reemplaza el flujo pasivo del input por un visor de realidad aumentada).*

Para lograr una experiencia de escáner en tiempo real tipo "código de barras" pero potenciada con IA, se requiere el uso de la API `MediaDevices.getUserMedia()`.

### 2.1 El "Qué": Configuración del Stream de Video

El hardware de la cámara del móvil se conecta directamente al DOM mediante un flujo de datos (Stream). Este flujo debe solicitar explícitamente la cámara trasera del dispositivo para habilitar un escaneo útil.

### 2.2 El "Cómo": Código Core de WebRTC

```javascript
const startCamera = async () => {
  try {
    const constraints = {
      video: { 
        facingMode: { exact: "environment" }, // Obliga a usar la cámara trasera
        width: { ideal: 1920 },
        height: { ideal: 1080 }
      },
      audio: false // No requerimos audio para OCR
    };

    const stream = await navigator.mediaDevices.getUserMedia(constraints);
    
    if (videoRef.current) {
      videoRef.current.srcObject = stream;
      // Imprescindible para iOS Safari
      videoRef.current.setAttribute('playsinline', true); 
      await videoRef.current.play();
    }
  } catch (err) {
    console.error("Error al acceder a la cámara:", err);
    // Lógica de Fallback de seguridad (regresar a type="file")
  }
};
```

**Explicación de Flujos de Datos:**
1. **Petición de Restricciones (`constraints`)**: Solicitamos `facingMode: "environment"` porque los usuarios escanean cajas o facturas, no sus rostros. Las resoluciones ideales de 1080p garantizan claridad para el reconocimiento por IA.
2. **`getUserMedia`**: Esta promesa interactúa con la capa de seguridad del navegador. Si es la primera vez, detiene el hilo de ejecución para mostrar el prompt de permisos del SO.
3. **Binding al DOM (`srcObject`)**: El objeto `MediaStream` resultante (una colección de tracks de video) se inyecta directamente a la propiedad `srcObject` del tag `<video>`.
4. **Captura del Fotograma**: Para procesar los datos, el stream se extrae "congelando" la imagen en un `<canvas>` oculto:
   ```javascript
   const captureFrame = () => {
     const canvas = canvasRef.current;
     const video = videoRef.current;
     canvas.width = video.videoWidth;
     canvas.height = video.videoHeight;
     const ctx = canvas.getContext('2d');
     ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
     const base64Image = canvas.toDataURL('image/jpeg', 0.8);
     return base64Image; // Listo para ser enviado al endpoint
   };
   ```

> [!WARNING]
> **Fugas de Memoria en WebRTC**
> Es crítico desmontar los tracks cuando el componente se destruye (en el cleanup phase de `useEffect`). Si no se invoca `stream.getTracks().forEach(track => track.stop())`, la cámara trasera del dispositivo quedará encendida indefinidamente, drenando drásticamente la batería y bloqueando la cámara para otras apps.

---

## 3. Trucos CSS: Dibujando la Caja de Escaneo por Láser

El impacto visual de un escáner radica en guiar al usuario hacia dónde debe apuntar. Para lograr un overlay oscuro con un rectángulo transparente en el centro y una línea láser animada, se utilizan técnicas CSS avanzadas combinadas con las clases estructurales.

### 3.1 El Overlay y la Región de Recorte (Cutout Trick)

En lugar de crear cuatro divs grises alrededor de un cuadro central transparente (lo cual complica el DOM), el truco moderno es utilizar una sombra masiva (`box-shadow`) en el área central.

```css
.scanner-viewport {
  position: relative;
  width: 100vw;
  height: 100vh;
  overflow: hidden;
}

.scanner-cutout {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: 80%;
  height: 40%;
  border: 2px solid hsl(var(--primary));
  border-radius: 12px;
  /* El Truco Mágico: una sombra gigante que oscurece el resto de la pantalla */
  box-shadow: 0 0 0 9999px rgba(0, 0, 0, 0.6);
  z-index: 10;
}
```
**El "Por qué"**: Al aplicar un `box-shadow` infinito y sin desenfoque (blur), creamos la máscara semitransparente usando un solo nodo DOM. Es extremadamente performante en dispositivos móviles porque su renderizado es paralelizado por la GPU del teléfono y no requiere cálculos de intersección.

### 3.2 La Animación del Escáner Láser

Para lograr el clásico efecto del láser que sube y baja dentro del `scanner-cutout`, empleamos pseudoelementos y animaciones `@keyframes`.

```css
.scanner-cutout::before {
  content: '';
  position: absolute;
  top: 0; left: 0;
  width: 100%;
  height: 3px;
  background: hsl(var(--primary));
  /* Efecto de dispersión del rayo láser */
  box-shadow: 0 0 10px hsl(var(--primary)), 0 0 20px hsl(var(--primary));
  animation: laser-scan 2.5s ease-in-out infinite alternate;
  z-index: 11;
}

@keyframes laser-scan {
  0% { top: 0%; opacity: 0; }
  10% { opacity: 1; }
  90% { opacity: 1; }
  100% { top: calc(100% - 3px); opacity: 0; }
}
```

**Detalles Milimétricos del CSS:**
- `infinite alternate`: Hace que el láser rebote de arriba a abajo. Si solo fuera `infinite`, saltaría abruptamente al techo una vez terminado el ciclo.
- `box-shadow`: Simula la incandescencia y reflexión de la luz del láser.
- `calc(100% - 3px)`: Previene que la línea láser sobresalga del borde inferior del contenedor, restando la propia altura del láser (3px).
- **Transiciones de Opacidad**: El uso de `opacity: 0` en el 0% y 100% provoca que el láser se desvanezca suavemente en los extremos superior e inferior, un toque de diseño "premium".

### 3.3 El Pulso Suave (Pulse Soft) en la Vista Actual

Mientras que el láser es ideal para streaming en vivo, el archivo analizado (`ScannerAIView.css`) emplea una alternativa elegante de latido (`pulse-soft`) para invitar al usuario a tocar y abrir la cámara nativa:

```css
@keyframes pulse-soft {
  0% { transform: scale(1); box-shadow: 0 0 0 0 hsla(var(--primary), 0.4); }
  70% { transform: scale(1.05); box-shadow: 0 0 0 15px hsla(var(--primary), 0); }
  100% { transform: scale(1); box-shadow: 0 0 0 0 hsla(var(--primary), 0); }
}
```
Aquí el truco consiste en expandir drásticamente la sombra (hasta 15px) al mismo tiempo que el canal alpha se desvanece a 0, emulando una onda expansiva o sonar tecnológico.

---

## 4. Flujos de Datos y Arquitectura de Estados

Independientemente del método de captura fotográfica, la arquitectura del estado local entra en acción a través del componente interno `ReviewForm` para gestionar la validación del usuario.

### 4.1 Mapeo y Mutabilidad Controlada

`ReviewForm` inicializa copiando los datos crudos extraídos de la IA (`extractedData.items`) hacia un estado local interactivo (`items`):

```jsx
const [items, setItems] = useState(extractedData?.items || []);

const updateItem = (index, field, value) => {
  const newItems = [...items];
  newItems[index] = { ...newItems[index], [field]: value };
  setItems(newItems);
};
```

**El "Por qué"**: En React, la mutación directa del estado global es un anti-patrón severo. Al realizar una copia profunda superficial del array (`[...items]`) y actualizar puntualmente por el `index`, garantizamos que el "Virtual DOM" re-renderice los campos del formulario sin corromper el Payload original obtenido en caso de que el usuario decida cancelar el proceso.

### 4.2 Sanitización e Inserción Masiva (Bulk Processing)

```jsx
const payload = items.map(item => ({
  name: item.name || 'Artículo Desconocido',
  qty: parseInt(item.qty) || 1,
  costo_unitario: parseFloat(item.costo_unitario) || 0,
  codigo: item.codigo || '',
  marca: item.marca || '',
  category: selectedCategory,
  observaciones: `Escaneado por IA. Prov: ${header.proveedor || 'N/A'}`,
  threshold: 5,
  unit: 'Piezas',
  status: 'Disponible'
}));

await bulkAddItems(payload);
```

Este bloque de mapeo es una capa defensiva crítica. Limpia, parsea y asegura los tipos de datos (forzando, por ejemplo, `parseInt` en las cantidades) protegiendo el servicio subyacente de `InventoryContextOptimized` (y finalmente a la Base de Datos Firebase) de corrupciones por "Data Types" erróneos inducidos por el análisis OCR-IA.

---

## 5. Resumen Comparativo de Arquitecturas

| Característica | Delegación Nativa al SO (`ScannerAIView.jsx`) | Modo WebRTC DOM In-App (`MobileScannerUI.jsx`) |
| :--- | :--- | :--- |
| **Consumo Energético** | Bajo (El navegador cede control al módulo de cámara OS) | Alto (Javascript procesa frames a 60fps constantes) |
| **Control Visual UI** | Limitado a lo que permite la cámara del sistema Android/iOS | Absoluto (Cajas láseres, Realidad Aumentada, filtros DOM) |
| **Gestión de Lentes** | Óptima (El SO elige automáticamente lente normal/macro) | Manual y a veces falible (Uso estricto de `facingMode`) |
| **Flujo de Usuario** | Tap -> Carga Cámara OS -> Captura -> Regresa a Web -> Analiza | Apunta a código -> Detección automática (Background) |

## Conclusión

El diseño del módulo de Escáner IA muestra un profundo entendimiento de la dicotomía moderna entre las aplicaciones Web (PWA) y el ecosistema de hardware Nativo. Delegar la carga de hardware mediante inputs HTML5 (estrategia actual) garantiza la máxima estabilidad transversal. Por otro lado, la arquitectura conceptual WebRTC combinada con trucos CSS agresivos (`box-shadow` mask) empuja los límites del navegador, ofreciendo a los desarrolladores el "BluePrint" perfecto para crear una experiencia de inventario inmersiva y de grado corporativo directamente en la nube.
