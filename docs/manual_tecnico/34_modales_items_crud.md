# Capítulo 34: Flujo CRUD Complejo y Modales de Ítems

## 1. Arquitectura y Propósito del Módulo

En la aplicación Inventor Manager, la gestión de la entrada de datos (creación y edición de ítems) está centralizada en el componente `AddItemModal.jsx`. Aunque la nomenclatura sugiere únicamente "creación" (Add), en la práctica, este componente asume una doble responsabilidad arquitectónica: opera tanto como **creador** como **editor** (ItemModal) de ítems del inventario, gestionando el ciclo de vida completo del CRUD a nivel de interfaz de usuario.

El componente se apoya masivamente en el contexto global (`useInventory`) y en Firebase Storage para resolver problemáticas avanzadas como la gestión de categorías dinámicas, sub-ubicaciones creadas al vuelo, y un flujo de subida de imágenes optimizado y seguro.

### 1.1. Inyección mediante `createPortal`

```jsx
return createPortal(
  <div className="modal-overlay">...</div>,
  document.body
);
```

> [!NOTE]  
> **¿Por qué `createPortal`?**  
> El uso de portales de React es crítico en modales complejos para escapar de la jerarquía del DOM del componente padre. Esto previene que problemas de `z-index` o propiedades de estilo como `overflow: hidden` en contenedores padre recorten o anulen el modal, garantizando que siempre se superponga de manera absoluta en la capa superior del documento.

---

## 2. Flujo CRUD de los Ítems de Inventario

El desafío principal del `AddItemModal` es que los ítems en el inventario no comparten un esquema estricto de base de datos. Un ítem de "Tornillería" requiere campos como `rosca` y `material`, mientras que uno de "Herramientas" demanda `numero de serie` y `ultima_reparacion`.

### 2.1. Gestión del Estado e Inicialización (`useEffect`)

La transición entre el modo "Creación" y el modo "Edición" se determina a través de la prop `initialData`.

```jsx
useEffect(() => {
  if (isOpen) {
    setShowAdvanced(!isDynamicCategory);
    setImageFile(null);
    
    if (initialData) {
      const mappedData = { ...initialData };
      if (isDynamicCategory) {
        // Lógica de mapeo de categorías dinámicas
        const customCat = customCategories?.find(c => c.name === category);
        customCat?.fields?.forEach(f => {
          if (mappedData[f.name] === undefined) {
             const mappedKey = HEADER_MAP[f.name];
             if (mappedKey && mappedData[mappedKey] !== undefined) {
               mappedData[f.name] = mappedData[mappedKey];
             }
          }
        });
      }
      setFormData(mappedData);
      setImagePreview(initialData.image || null);
    } else {
      // Reinicio completo para creación
      setImagePreview(null);
      setFormData({ ... });
    }
  }
}, [category, isOpen, initialData, isDynamicCategory, customCategories]);
```

- **El "Qué":** Cuando el modal se abre, evalúa si debe cargar datos existentes para editar o empezar de cero para un nuevo registro.
- **El "Cómo":** Si `initialData` existe, clona el objeto en `mappedData`. En caso de ser una categoría dinámica, realiza una conciliación de llaves usando un objeto `HEADER_MAP` que traduce nombres de columnas heredadas (de importaciones masivas) a la nomenclatura actual de las `customCategories`.
- **El "Por qué":** Al centralizar esto en el `useEffect` dependiente de `isOpen`, aseguramos que los datos residuales de sesiones anteriores se limpien de la memoria de inmediato (`setImageFile(null)`), evitando "fugas de estado" donde un usuario que crea un ítem nuevo accidentalmente hereda la imagen o datos de una edición previa.

### 2.2. Esquemas de Datos Constantes y UI Controlada por Datos (`CATEGORY_SCHEMAS`)

Para dictar qué renderizar en base a la categoría seleccionada, se utiliza un diccionario que define configuraciones por cada categoría:

```jsx
const CATEGORY_SCHEMAS = {
  'Tornillería': [
    { name: 'subcategory', label: 'Subcategoría', placeholder: 'Ej: Hexagonal, Allen' },
    { name: 'rosca', label: 'Rosca', placeholder: 'Ej: M8, 1/4' }
  ],
  // ...
};
```
> [!TIP]  
> Esta aproximación (Data-Driven UI) elimina cientos de líneas de condicionales en el renderizado. La función `renderCategoryFields()` simplemente itera este array e invoca `renderField(field)` delegando el renderizado al componente adecuado de acuerdo al campo.

---

## 3. Validaciones y Creación de Sub-ubicaciones (Locations) "Al Vuelo"

El modal no solo se limita a recolectar datos sobre el inventario que obedece al catálogo ya registrado, sino que permite que los metadatos estructurales (ubicaciones físicas y marcas) crezcan de forma fluida.

### 3.1. Flujo de Creación In-Line

```jsx
const handleAddQuickLocation = async () => {
  if (!newLocationName.trim()) return;
  await addLocation(newLocationName.trim());
  setFormData(prev => ({ ...prev, location: newLocationName.trim() }));
  setNewLocationName('');
  setIsAddingLocation(false);
};
```

1. **Interrupción Mínima del Flujo:** En lugar de obligar al usuario a cerrar el modal de creación de un ítem, dirigirse a un panel de configuración central, dar de alta una nueva ubicación (repisa/sub-ubicación) y reiniciar el flujo, se habilita la creación in-line (al vuelo).
2. **Propagación Asíncrona Integrada:** La llamada `await addLocation(...)` comunica directamente con el Contexto Global de Inventario para escribir la nueva ubicación de inmediato en la base de datos de Firebase.
3. **Sincronización Transparente de Estado:** Al confirmarse, se muta `formData` para autoseleccionar la ubicación recién creada, ofreciendo una experiencia sin costuras al operario.

### 3.2. Renderizado Condicional del Selector vs Input de Texto

Dentro del bloque `switch` en la función `renderField`, el caso `'location'` maneja dos vistas intercalables sin recargar el componente:

```jsx
case 'location':
  return (
    <div className="flex flex-col gap-1">
      {!isAddingLocation ? (
        <div className="flex gap-2">
          <select name="location" value={formData.location} onChange={handleChange}>
            {/* ...opciones renderizadas desde Contexto... */}
          </select>
          <button onClick={() => setIsAddingLocation(true)}><Plus /></button>
        </div>
      ) : (
        <div className="flex gap-2 animate-fade-in">
          <input value={newLocationName} onChange={(e) => setNewLocationName(e.target.value)} autoFocus />
          <button onClick={handleAddQuickLocation}>Confirmar</button>
        </div>
      )}
    </div>
  );
```

> [!IMPORTANT]  
> El uso de `autoFocus` en el input dinámico es clave para la accesibilidad y la velocidad. Los usuarios industriales utilizan escáneres o teclado frecuentemente, y requerir clics adicionales puede causar frustración operativa.

---

## 4. Motor de Subida Condicional de Imágenes

Las imágenes del inventario representan un riesgo crítico de rendimiento. Subir fotos directas desde dispositivos móviles sin procesar podría saturar el bucket de Firebase Storage y ralentizar drásticamente la app en redes pobres.

### 4.1. Previsualización en Memoria y Filtros en Origen

```jsx
const handleImageChange = (e) => {
  const file = e.target.files[0];
  if (file) {
    if (file.size > 5 * 1024 * 1024) {
      alert("La imagen es demasiado grande. El límite es de 5MB.");
      return;
    }
    setImageFile(file);
    const reader = new FileReader();
    reader.onloadend = () => setImagePreview(reader.result);
    reader.readAsDataURL(file);
  }
};
```

- **El "Qué":** Se intercepta la selección del archivo, se valida que esté por debajo del umbral duro de `5MB` y se genera una previsualización en el navegador antes de cualquier petición HTTP.
- **El "Cómo":** Si supera la validación, el objeto `File` se almacena en memoria (`imageFile`). Acto seguido, un objeto `FileReader` asíncrono lo transforma en un DataURL (Base64).
- **El "Por qué":** El Base64 es inyectado inmediatamente en un tag `<img>` controlado por `imagePreview`. Este feedback "Cero-Latencia" confirma al usuario que su imagen ha sido seleccionada de forma satisfactoria sin incurrir en consumos de red.

### 4.2. Algoritmo Condicional de Almacenamiento y Limpieza (`handleSubmit`)

Al oprimir "Guardar Cambios", el componente orquesta lógicamente el destino de la imagen:

```jsx
if (imageFile) {
  setIsUploading(true);
  const fileName = `${Date.now()}_${imageFile.name}`;
  const storageRef = ref(storage, `items/${fileName}`);
  const snapshot = await uploadBytes(storageRef, imageFile);
  const downloadURL = await getDownloadURL(snapshot.ref);
  submitData.image = downloadURL;
} else if (!imagePreview && submitData.image) {
  // El usuario eliminó la imagen desde la UI
  submitData.image = null;
}
```

**Matriz de Casos de Uso del Componente:**
1. **El usuario sube una imagen nueva (`imageFile` presente):** Se marca `isUploading` para activar un loader bloqueante y evitar envíos duplicados. Se inyecta un timestamp `Date.now()` en el nombre de archivo para evitar colisiones y sobrescrituras de caché (`cache-busting`). Tras un exitoso `uploadBytes`, se adjunta la `downloadURL` al payload transaccional final.
2. **El usuario elimina una imagen existente (`!imagePreview && submitData.image`):** Si en modo edición el operador presiona el botón "Quitar", el componente nula el valor local `imagePreview`. Durante el guardado, al no haber archivo nuevo ni preview existente, el sistema procesa el requerimiento inyectando explícitamente `submitData.image = null` para borrar la referencia de la base de datos Firestore.
3. **Ningún Cambio:** Si `imageFile` es nulo pero `imagePreview` existe (edición donde la foto no se tocó), el bloque se salta intacto y no hay re-subidas redundantes, protegiendo los anchos de banda.

---

## 5. Sanitización del Payload y Reglas de Negocio Específicas

Una etapa vital ocurre microsegundos antes de delegar la escritura a la base de datos (`onSave`). El sistema altera unilateralmente la información para aplicar reglas de negocio o esterilizar campos obsoletos.

### 5.1. Reglas Duras por Clasificación (Equipamiento Fijo)

```jsx
if (category === 'Herramientas') {
  submitData.qty = 1;
  submitData.threshold = 0;
  submitData.unit = 'Piezas';
  submitData.pieces_per_unit = 1;
}
```

> [!WARNING]  
> **Excepción de Herramientas:** En este sistema, las "Herramientas" son activos fijos únicos y trakeables mediante número de serie, a diferencia de los tornillos o la papelería que son consumibles. Esto evita errores del usuario intentando registrar "3 Taladros" en un solo ítem en lugar de darlos de alta en unidades singulares.

### 5.2. Descontaminación de Campos en Categorías Dinámicas

```jsx
const configuredFields = customCat?.fields?.map(f => f.name) || [];
const allowedKeys = ['name', 'category', 'image', ...configuredFields];

Object.keys(submitData).forEach(key => {
  if (!allowedKeys.includes(key)) {
    delete submitData[key];
  }
});
```

- **El "Qué":** Se inspecciona el objeto `submitData` y se purga toda llave que no coincida con el esquema oficial de la categoría actual de la base de datos.
- **El "Cómo":** Se interceptan todas las propiedades y se cotejan con un listado cerrado (`allowedKeys`) derivado de la configuración en caliente de `customCategories`. Todo elemento ajeno recibe un `delete`.
- **El "Por qué":** Previene la "Inflación Silenciosa de Datos" en Firestore (NoSQL). Si un usuario edita un ítem y lo migra de una categoría de electrónica a una de papelería, la base de datos mantendría residualmente campos inútiles como `voltaje: "5V"`. Esta sanitización previene un consumo residual de la cuota de lectura a largo plazo y mejora la estructura general de los documentos en la base de datos.
