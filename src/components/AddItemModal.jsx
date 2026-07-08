import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, Save, Plus, Wrench, Layers, Upload, Image as ImageIcon, Trash2, Loader2 } from 'lucide-react';
import { useInventory } from '../context/InventoryContextOptimized';
import { storage } from '../firebase/config';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { HEADER_MAP } from '../utils/importUtils';
import './ActionModal.css'; // Reusing base modal styles
import './AddItemModal.css';

const CATEGORY_SCHEMAS = {
  'Tornillería': [
    { name: 'subcategory', label: 'Subcategoría', placeholder: 'Ej: Hexagonal, Allen' },
    { name: 'rosca', label: 'Rosca', placeholder: 'Ej: M8, 1/4' },
    { name: 'material', label: 'Material', placeholder: 'Ej: Acero, Zinc' },
    { name: 'marca', label: 'Marca', type: 'brand' }
  ],
  'Impresión 3D': [
    { name: 'material', label: 'Material', placeholder: 'Ej: PLA, PETG' },
    { name: 'color', label: 'Color', placeholder: 'Ej: Rojo, Mate' },
    { name: 'peso', label: 'Peso', placeholder: 'Ej: 1kg' }
  ],
  'Electrónica': [
    { name: 'tipo', label: 'Tipo', placeholder: 'Ej: Sensor, MCU' },
    { name: 'voltaje', label: 'Voltaje', placeholder: 'Ej: 5V, 3.3V' },
    { name: 'marca', label: 'Marca', type: 'brand' }
  ],
  'Papelería': [
    { name: 'tipo', label: 'Tipo', placeholder: 'Ej: Marcador, Lápiz' },
    { name: 'marca', label: 'Marca', type: 'brand' }
  ],
  'Papelería e Insumos': [
    { name: 'tipo', label: 'Tipo', placeholder: 'Ej: Marcador, Lápiz' },
    { name: 'marca', label: 'Marca', type: 'brand' }
  ],
  'Herramientas': [
    { name: 'item_number', label: 'Item Number', placeholder: 'Ej: 12345' },
    { name: 'codigo', label: 'Código Interno (QR)', placeholder: 'Ej: TOR-001' },
    { name: 'marca', label: 'Marca', type: 'brand' },
    { name: 'modelo', label: 'Modelo', placeholder: 'Ej: GSB 18V' },
    { name: 'serie', label: 'Número de Serie', placeholder: 'Ej: SN-9988' },
    { name: 'ultima_reparacion', label: 'Última Reparación', type: 'date' }
  ],
  'Inventario General': [
    { name: 'item_number', label: 'Item Number', placeholder: 'Ej: 12345' },
    { name: 'grupo', label: 'Grupo', placeholder: 'Ej: Mantenimiento' },
    { name: 'subcategory', label: 'Subcategoría', placeholder: 'Ej: Seguridad, Limpieza' },
    { name: 'marca', label: 'Marca', type: 'brand' },
    { name: 'modelo', label: 'Modelo', placeholder: 'Ej: Standard' },
    { name: 'serie', label: 'Número de Serie', placeholder: 'Ej: SN-123' },
    { name: 'location', label: 'Ubicación', type: 'location' },
    { name: 'fecha_compra', label: 'Fecha de Compra', type: 'date' },
    { name: 'garantia', label: 'Garantía', placeholder: 'Ej: 6 meses' }
  ],
  'Almacén Temporal': [
    { name: 'subcategory', label: 'Subcategoría', placeholder: 'Ej: Proyecto X' },
    { name: 'marca', label: 'Marca', type: 'brand' },
    { name: 'location', label: 'Ubicación', type: 'location' }
  ],
  'Parques': [
    { name: 'subcategory', label: 'Sección / Subcategoría', placeholder: 'Ej: DULCES, LOCKERS' },
    { name: 'marca', label: 'Marca', type: 'brand' },
    { name: 'paquete', label: 'Paquetes', type: 'number' },
    { name: 'presentacion', label: 'Piezas por paquete', type: 'number' }
  ]
};

const AddItemModal = ({ isOpen, onClose, category, onSave, initialData }) => {
  const { brands, locations, addBrand, addLocation, items, customCategories } = useInventory();
  const [newBrandName, setNewBrandName] = useState('');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [isAddingBrand, setIsAddingBrand] = useState(false);
  const [isAddingLocation, setIsAddingLocation] = useState(false);
  const [newLocationName, setNewLocationName] = useState('');
  
  const [imageFile, setImageFile] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);
  const [isUploading, setIsUploading] = useState(false);

  const isDynamicCategory = customCategories?.some(c => c.name === category);
  const isFullWidthLayout = isDynamicCategory || category === 'Herramientas' || category === 'Inventario General';

  const [formData, setFormData] = useState(initialData || {
    name: '',
    qty: 0,
    threshold: 5,
    category: category,
    subcategory: '',
    rosca: '',
    material: '',
    tipo: '',
    marca: '',
    modelo: '',
    serie: '',
    codigo: '',
    medida_std: '',
    medida_mm: '',
    estado: 'BUENO',
    observaciones: '',
    costo_unitario: 0,
    proximo_mantenimiento: '',
    voltaje: '',
    color: '',
    peso: '',
    unit: 'Piezas',
    pieces_per_unit: 1,
    location: '',
    paquete: 0,
    presentacion: 1,
    item_number: '',
    grupo: '',
    oc_number: '',
    fecha_compra: '',
    garantia: '',
    fin_periodo_sin_costo: '',
    numero_equipo: '',
    generacion: '',
    ultima_reparacion: '',
    costo_reparacion: 0,
    recuento_reparaciones: 0
  });

  useEffect(() => {
    if (isOpen) {
      setShowAdvanced(!isDynamicCategory);
      setImageFile(null);
      
      if (initialData) {
        const mappedData = { ...initialData };
        // Si es categoría dinámica, mapear los valores de los encabezados importados a los nombres de la plantilla
        if (isDynamicCategory) {
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
        setImagePreview(null);
        setFormData({
          name: '', qty: 0, threshold: 5, category,
          subcategory: '', rosca: '', material: '', tipo: '', marca: '', modelo: '', serie: '', codigo: '', medida_std: '', medida_mm: '', estado: 'BUENO', observaciones: '', costo_unitario: 0, proximo_mantenimiento: '', voltaje: '', color: '', peso: '', unit: 'Piezas', pieces_per_unit: 1, location: '', paquete: 0, presentacion: 1,
          item_number: '', grupo: '', oc_number: '', fecha_compra: '', garantia: '', fin_periodo_sin_costo: '', numero_equipo: '', generacion: '', ultima_reparacion: '', costo_reparacion: 0, recuento_reparaciones: 0
        });
      }
    }
  }, [category, isOpen, initialData, isDynamicCategory, customCategories]);

  if (!isOpen) return null;

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: name === 'qty' || name === 'threshold' ? parseInt(value) || 0 : value }));
  };

  const compressImage = (file) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (event) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          let width = img.width;
          let height = img.height;
          
          const MAX_WIDTH = 1200;
          const MAX_HEIGHT = 1200;

          if (width > height) {
            if (width > MAX_WIDTH) {
              height = Math.round(height * (MAX_WIDTH / width));
              width = MAX_WIDTH;
            }
          } else {
            if (height > MAX_HEIGHT) {
              width = Math.round(width * (MAX_HEIGHT / height));
              height = MAX_HEIGHT;
            }
          }

          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, width, height);

          canvas.toBlob((blob) => {
            if (!blob) {
              reject(new Error('Canvas is empty'));
              return;
            }
            const compressedFile = new File([blob], file.name.replace(/\.[^/.]+$/, "") + ".jpg", {
              type: 'image/jpeg',
              lastModified: Date.now()
            });
            resolve({ file: compressedFile, preview: canvas.toDataURL('image/jpeg', 0.6) });
          }, 'image/jpeg', 0.6);
        };
        img.onerror = reject;
        img.src = event.target.result;
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  };

  const handleImageChange = async (e) => {
    const file = e.target.files[0];
    if (file) {
      if (file.size > 10 * 1024 * 1024) {
        alert("La imagen es demasiado grande. El límite es de 10MB.");
        return;
      }
      
      setIsUploading(true);
      try {
        const { file: compressedFile, preview } = await compressImage(file);
        setImageFile(compressedFile);
        setImagePreview(preview);
      } catch (error) {
        console.error("Error al comprimir la imagen:", error);
        alert("Hubo un error al procesar la imagen. Intenta con otra.");
      } finally {
        setIsUploading(false);
      }
    }
  };

  const handleRemoveImage = () => {
    setImageFile(null);
    setImagePreview(null);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (isUploading) return;
    
    const submitData = { ...formData };
    
    if (category === 'Herramientas') {
      submitData.qty = 1;
      submitData.threshold = 0;
      submitData.unit = 'Piezas';
      submitData.pieces_per_unit = 1;
    }

    try {
      if (imageFile) {
        setIsUploading(true);
        const fileName = `${Date.now()}_${imageFile.name}`;
        const storageRef = ref(storage, `items/${fileName}`);
        const snapshot = await uploadBytes(storageRef, imageFile);
        const downloadURL = await getDownloadURL(snapshot.ref);
        submitData.image = downloadURL;
      } else if (!imagePreview && submitData.image) {
        // User removed the image
        submitData.image = null;
      }
    } catch (error) {
      console.error("Error al subir la imagen:", error);
      alert("Hubo un error al subir la imagen. Inténtalo de nuevo.");
      setIsUploading(false);
      return;
    } finally {
      setIsUploading(false);
    }

    if (isDynamicCategory) {
      const customCat = customCategories?.find(c => c.name === category);
      
      if (!submitData.name) {
        const firstField = customCat?.fields?.[0];
        if (firstField && formData[firstField.name]) {
          submitData.name = formData[firstField.name];
        } else {
          submitData.name = `Registro ${new Date().getTime().toString().slice(-4)}`;
        }
      }

      // STRICTLY limit data to ONLY configured fields, name, category, and image
      const configuredFields = customCat?.fields?.map(f => f.name) || [];
      const allowedKeys = ['name', 'category', 'image', ...configuredFields];

      Object.keys(submitData).forEach(key => {
        if (!allowedKeys.includes(key)) {
          delete submitData[key];
        }
      });
    }
    
    onSave(submitData);
    onClose();
    // Reset form
    setFormData({
      name: '', qty: 0, threshold: 5, category,
      subcategory: '', rosca: '', material: '', tipo: '', marca: '', modelo: '', serie: '', codigo: '', medida_std: '', medida_mm: '', estado: 'BUENO', observaciones: '', costo_unitario: 0, proximo_mantenimiento: '', voltaje: '', color: '', peso: '', unit: 'Piezas', pieces_per_unit: 1, location: '', paquete: 0, presentacion: 1,
      item_number: '', grupo: '', oc_number: '', fecha_compra: '', garantia: '', fin_periodo_sin_costo: '', numero_equipo: '', generacion: '', ultima_reparacion: '', costo_reparacion: 0, recuento_reparaciones: 0
    });
    setImageFile(null);
    setImagePreview(null);
  };

  const handleAddQuickBrand = async () => {
    if (!newBrandName.trim()) return;
    await addBrand(newBrandName.trim());
    setFormData(prev => ({ ...prev, marca: newBrandName.trim() }));
    setNewBrandName('');
    setIsAddingBrand(false);
  };

  const handleAddQuickLocation = async () => {
    if (!newLocationName.trim()) return;
    await addLocation(newLocationName.trim());
    setFormData(prev => ({ ...prev, location: newLocationName.trim() }));
    setNewLocationName('');
    setIsAddingLocation(false);
  };

  const renderField = (field) => {
    switch (field.type) {
      case 'select':
        let selectOptions = [];
        if (Array.isArray(field.options)) {
          selectOptions = field.options;
        } else if (typeof field.options === 'string') {
          selectOptions = field.options.split(',').map(o => o.trim());
        }
        return (
          <select name={field.name} onChange={handleChange} value={formData[field.name] || ''}>
            <option value="">-- Seleccionar --</option>
            {selectOptions.map(opt => <option key={opt} value={opt}>{opt}</option>)}
          </select>
        );
      case 'brand':
        return (
          <div className="flex flex-col gap-1">
            {!isAddingBrand ? (
              <div className="flex gap-2">
                <select 
                  name="marca" 
                  value={formData.marca} 
                  onChange={handleChange}
                  className="flex-1"
                >
                  <option value="">-- Seleccionar Marca --</option>
                  {brands.map(b => <option key={b.id} value={b.name}>{b.name}</option>)}
                </select>
                <button 
                  type="button" 
                  className="btn-add-quick"
                  onClick={() => setIsAddingBrand(true)}
                  title="Nueva Marca"
                >
                  <Plus size={16} />
                </button>
              </div>
            ) : (
              <div className="flex gap-2 animate-fade-in">
                <input 
                  placeholder="Nombre de marca..." 
                  value={newBrandName}
                  onChange={(e) => setNewBrandName(e.target.value)}
                  className="flex-1"
                  autoFocus
                />
                <button 
                  type="button" 
                  className="btn-primary px-4 text-xs h-10"
                  onClick={handleAddQuickBrand}
                >
                  Confirmar
                </button>
                <button 
                  type="button" 
                  className="btn-cancel-quick"
                  onClick={() => setIsAddingBrand(false)}
                >
                  <X size={18} />
                </button>
              </div>
            )}
          </div>
        );
      case 'location':
        return (
          <div className="flex flex-col gap-1">
            {!isAddingLocation ? (
              <div className="flex gap-2">
                <select 
                  name="location" 
                  value={formData.location} 
                  onChange={handleChange}
                  className="flex-1"
                >
                  <option value="">-- Seleccionar Ubicación --</option>
                  {locations.map(l => <option key={l.id} value={l.name}>{l.name}</option>)}
                </select>
                <button 
                  type="button" 
                  className="btn-add-quick"
                  onClick={() => setIsAddingLocation(true)}
                  title="Nueva Ubicación"
                >
                  <Plus size={16} />
                </button>
              </div>
            ) : (
              <div className="flex gap-2 animate-fade-in">
                <input 
                  placeholder="Nombre de ubicación..." 
                  value={newLocationName}
                  onChange={(e) => setNewLocationName(e.target.value)}
                  className="flex-1"
                  autoFocus
                />
                <button 
                  type="button" 
                  className="btn-primary px-4 text-xs h-10"
                  onClick={handleAddQuickLocation}
                >
                  Confirmar
                </button>
                <button 
                  type="button" 
                  className="btn-cancel-quick"
                  onClick={() => setIsAddingLocation(false)}
                >
                  <X size={18} />
                </button>
              </div>
            )}
          </div>
        );
      case 'date':
        return <input type="date" name={field.name} onChange={handleChange} value={formData[field.name]} />;
      case 'number':
        return <input type="number" name={field.name} placeholder={field.placeholder} onChange={handleChange} value={formData[field.name]} />;
      case 'textarea':
        return <textarea name={field.name} placeholder={field.placeholder || `Ingresar ${field.label || field.name}`} onChange={handleChange} value={formData[field.name]} style={{ width: '100%', minHeight: '80px', resize: 'vertical' }} />;

      case 'boolean':
        return (
          <label className="checkbox-wrap flex items-center gap-2 mt-2">
            <input 
              type="checkbox" 
              name={field.name} 
              onChange={(e) => setFormData(prev => ({ ...prev, [field.name]: e.target.checked }))}
              checked={!!formData[field.name]} 
            />
            <span className="text-sm">Sí</span>
          </label>
        );
      default:
        const existingSubcategories = [...new Set(items.filter(i => i.category === category && i.subcategory).map(i => i.subcategory))];
        return (
          <>
            <input 
              name={field.name} 
              placeholder={field.placeholder || `Ingresar ${field.label || field.name}`} 
              onChange={handleChange} 
              value={formData[field.name]} 
              list={field.name === 'subcategory' ? "subcategory-suggestions" : undefined}
              autoComplete={field.name === 'subcategory' ? "off" : undefined}
            />
            {field.name === 'subcategory' && (
              <datalist id="subcategory-suggestions">
                {existingSubcategories.map(sub => <option key={sub} value={sub} />)}
              </datalist>
            )}
          </>
        );
    }
  };

  const renderCategoryFields = () => {
    // Buscar si es una categoría dinámica
    const customCat = customCategories?.find(c => c.name === category);
    const fields = customCat ? customCat.fields : (CATEGORY_SCHEMAS[category] || []);
    
    if (fields.length === 0) return <p className="text-xs text-muted italic">No hay campos adicionales para esta categoría.</p>;

    return (
      <div className="special-fields" style={{ 
        display: 'grid', 
        gridTemplateColumns: isFullWidthLayout ? 'repeat(auto-fill, minmax(250px, 1fr))' : 'repeat(auto-fill, minmax(150px, 1fr))', 
        gap: '1rem' 
      }}>
        {fields.map(field => (
          <div className="f-group" key={field.name}>
            <label>{field.label || field.name}</label>
            {renderField(field)}
          </div>
        ))}
      </div>
    );
  };

  return createPortal(
    <div className="modal-overlay">
      <div className="modal-card add-item-modal animate-scale-up">
        <header className="modal-header">
          <h3>{initialData ? 'Editar' : 'Nuevo'} Artículo en {category}</h3>
          <p>Completa la información para actualizar el inventario.</p>
        </header>

        <form onSubmit={handleSubmit}>
          <div className="image-upload-container">
            {isUploading && (
              <div className="uploading-overlay">
                <Loader2 size={32} className="animate-spin" />
                <span>Subiendo Imagen...</span>
              </div>
            )}
            {!imagePreview ? (
              <label className="upload-placeholder">
                <input type="file" accept="image/*" onChange={handleImageChange} className="hidden-file-input" />
                <ImageIcon size={32} className="upload-icon" />
                <span>Añadir Fotografía</span>
                <small>Formatos: JPG, PNG, WEBP (Max 10MB)</small>
              </label>
            ) : (
              <div className="image-preview-wrapper">
                <img src={imagePreview} alt="Preview" className="image-preview" />
                <button type="button" className="btn-remove-image" onClick={handleRemoveImage} title="Quitar imagen">
                  <Trash2 size={14} />
                </button>
              </div>
            )}
          </div>

          <div className={isFullWidthLayout ? "mb-6" : "form-layout-horizontal mb-6"}>
            {!isDynamicCategory && (
              <div className="main-fields" style={isFullWidthLayout ? { marginBottom: '2rem' } : {}}>
                <div className="flex gap-4 mb-4">
                {!isDynamicCategory && (
                  <div className="f-group flex-1">
                    <label>Nombre del Artículo</label>
                    <input name="name" required value={formData.name} placeholder="Ej: Tornillo Hexagonal..." onChange={handleChange} className="w-full" />
                  </div>
                )}
                {showAdvanced && !isDynamicCategory && (
                  <div className="f-group flex-1">
                    <label>Costo Unitario ($)</label>
                    <input type="number" name="costo_unitario" step="0.01" value={formData.costo_unitario} onChange={handleChange} />
                  </div>
                )}
              </div>
              
              {!isDynamicCategory && !showAdvanced && (
                <div className="mb-4" style={{ textAlign: 'center' }}>
                  <button type="button" onClick={() => setShowAdvanced(true)} style={{ background: 'none', border: '1px solid rgba(255,255,255,0.1)', padding: '6px 12px', borderRadius: '8px', color: 'var(--text-muted)', fontSize: '0.85rem', cursor: 'pointer' }}>
                    + Configurar Cantidad y Opciones Avanzadas
                  </button>
                </div>
              )}

              {!isDynamicCategory && showAdvanced && category !== 'Herramientas' && (
                <>
                  <div className="flex gap-4 mb-4">
                    <div className="f-group flex-1">
                      <label>Unidad de Medida</label>
                      <select name="unit" value={formData.unit} onChange={handleChange} className="w-full">
                        <option value="Piezas">Piezas</option>
                        <option value="Litros">Litros</option>
                        <option value="Metros">Metros</option>
                        <option value="Cajas">Cajas</option>
                        <option value="Paquetes">Paquetes</option>
                        <option value="Cubetas">Cubetas</option>
                        <option value="Rollos">Rollos</option>
                        <option value="Kilos">Kilos</option>
                      </select>
                    </div>
                    {(formData.unit === 'Cajas' || formData.unit === 'Paquetes') && (
                      <div className="f-group flex-1">
                        <label>Piezas por {formData.unit.slice(0, -1)}</label>
                        <input 
                          type="number" 
                          name="pieces_per_unit" 
                          value={formData.pieces_per_unit} 
                          onChange={(e) => setFormData(prev => ({ ...prev, pieces_per_unit: parseInt(e.target.value) || 1 }))}
                          min="1"
                          className="w-full"
                        />
                      </div>
                    )}
                  </div>

                  <div className="flex gap-4 mb-4">
                    <div className="f-group flex-1">
                      <label>Existencia Inicial ({formData.unit})</label>
                      <input type="number" name="qty" required onChange={handleChange} value={formData.qty} />
                    </div>
                    <div className="f-group flex-1">
                      <label>Umbral Mínimo (Alerta)</label>
                      <input type="number" name="threshold" required onChange={handleChange} value={formData.threshold} />
                    </div>
                  </div>
                </>
              )}

              {!isDynamicCategory && showAdvanced && (
                <div className="f-group">
                  <label>Observaciones / Notas</label>
                  <textarea 
                    name="observaciones" 
                    placeholder="Notas adicionales (ej: Dañado, sin imán, falta seguro...)" 
                    value={formData.observaciones}
                    onChange={handleChange}
                    className="w-full p-3 h-20"
                    style={{ resize: 'none' }}
                  />
                </div>
              )}
              </div>
            )}

            <div className="category-fields" style={isFullWidthLayout ? { width: '100%' } : {}}>
              <div className={isDynamicCategory ? "" : "dynamic-section h-full"}>
                {!isDynamicCategory && <h4 className="text-sm font-bold text-muted mb-4 uppercase tracking-widest">Detalles Especiales</h4>}
                {renderCategoryFields()}
              </div>
            </div>
          </div>

          <div className="flex gap-4 pt-4 border-t border-white/5">
            <button type="button" className="btn-apple-secondary flex-1" onClick={onClose}>Cancelar</button>
            <button type="submit" className="btn-apple-primary flex-1">
              <Save size={18} /> {initialData ? 'Guardar Cambios' : 'Crear Artículo'}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
};

export default AddItemModal;
