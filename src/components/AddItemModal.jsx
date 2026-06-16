import React, { useState } from 'react';
import { X, Save, Plus, Wrench, Layers } from 'lucide-react';
import { useInventory } from '../context/InventoryContextOptimized';
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
  const { brands, locations, addBrand, addLocation, items } = useInventory();
  const [newBrandName, setNewBrandName] = useState('');
  const [newLocationName, setNewLocationName] = useState('');
  const [isAddingBrand, setIsAddingBrand] = useState(false);
  const [isAddingLocation, setIsAddingLocation] = useState(false);

  const [formData, setFormData] = useState({
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

  // Sync data when prop changes or modal opens (for editing)
  React.useEffect(() => {
    if (isOpen) {
      if (initialData) {
        setFormData({ ...initialData });
      } else {
        setFormData({
          name: '', qty: 0, threshold: 5, category,
          subcategory: '', rosca: '', material: '', tipo: '', marca: '', modelo: '', serie: '', codigo: '', medida_std: '', medida_mm: '', estado: 'BUENO', observaciones: '', costo_unitario: 0, proximo_mantenimiento: '', voltaje: '', color: '', peso: '', unit: 'Piezas', pieces_per_unit: 1, location: '', paquete: 0, presentacion: 1,
          item_number: '', grupo: '', oc_number: '', fecha_compra: '', garantia: '', fin_periodo_sin_costo: '', numero_equipo: '', generacion: '', ultima_reparacion: '', costo_reparacion: 0, recuento_reparaciones: 0
        });
      }
    }
  }, [category, isOpen, initialData]);

  if (!isOpen) return null;

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: name === 'qty' || name === 'threshold' ? parseInt(value) || 0 : value }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    const submitData = { ...formData };
    if (category === 'Herramientas') {
      submitData.qty = 1;
      submitData.threshold = 0;
      submitData.unit = 'Piezas';
      submitData.pieces_per_unit = 1;
    }
    
    onSave(submitData);
    onClose();
    // Reset form
    setFormData({
      name: '', qty: 0, threshold: 5, category,
      rosca: '', material: '', tipo: '', marca: '', modelo: '', serie: '', codigo: '', medida_std: '', medida_mm: '', estado: 'BUENO', observaciones: '', costo_unitario: 0, proximo_mantenimiento: '', voltaje: '', color: '', peso: '', unit: 'Piezas', pieces_per_unit: 1,
      item_number: '', grupo: '', oc_number: '', fecha_compra: '', garantia: '', fin_periodo_sin_costo: '', numero_equipo: '', generacion: '', ultima_reparacion: '', costo_reparacion: 0, recuento_reparaciones: 0
    });
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
        return (
          <select name={field.name} onChange={handleChange} value={formData[field.name]}>
            {field.options.map(opt => <option key={opt} value={opt}>{opt}</option>)}
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
      default:
        const existingSubcategories = [...new Set(items.filter(i => i.category === category && i.subcategory).map(i => i.subcategory))];
        return (
          <>
            <input 
              name={field.name} 
              placeholder={field.placeholder} 
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
    const fields = CATEGORY_SCHEMAS[category] || [];
    if (fields.length === 0) return <p className="text-xs text-muted italic">No hay campos adicionales para esta categoría.</p>;

    if (category === 'Herramientas' || category === 'Inventario General') {
      return (
        <div className="ios-settings-card">
          <div className="ios-settings-header">
            {category === 'Herramientas' ? <Wrench size={18} className="ios-icon" /> : <Layers size={18} className="ios-icon" />}
            <div>
              <h5>{category === 'Herramientas' ? 'Identidad de la Herramienta' : 'Detalles Adicionales'}</h5>
              <p>{category === 'Herramientas' ? 'Datos principales para generar el Código QR' : 'Clasificación y ubicación física del artículo'}</p>
            </div>
          </div>
          <div className="ios-settings-group">
            {fields.map(field => (
              <div className="ios-settings-row" key={field.name}>
                <label>{field.label}</label>
                <div className="ios-input-container">
                  {renderField(field)}
                </div>
              </div>
            ))}
          </div>
        </div>
      );
    }

    return (
      <div className="special-fields flex gap-4" style={{ flexWrap: 'wrap' }}>
        {fields.map(field => (
          <div className="f-group flex-1" style={{ minWidth: '150px' }} key={field.name}>
            <label>{field.label}</label>
            {renderField(field)}
          </div>
        ))}
      </div>
    );
  };

  return (
    <div className="modal-overlay">
      <div className="modal-card add-item-modal animate-scale-up">
        <header className="modal-header">
          <h3>{initialData ? 'Editar' : 'Nuevo'} Artículo en {category}</h3>
          <p>Completa la información para actualizar el inventario.</p>
        </header>

        <form onSubmit={handleSubmit}>
          <div className="main-fields mb-6">
            <div className="flex gap-4 mb-4">
              <div className="f-group flex-1">
                <label>Nombre del Artículo</label>
                <input name="name" required value={formData.name} placeholder="Ej: Tornillo Hexagonal..." onChange={handleChange} className="w-full" />
              </div>
              <div className="f-group flex-1">
                <label>Costo Unitario ($)</label>
                <input type="number" name="costo_unitario" step="0.01" value={formData.costo_unitario} onChange={handleChange} />
              </div>
            </div>
            
            {category !== 'Herramientas' && (
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
          </div>

          {category === 'Herramientas' || category === 'Inventario General' ? (
            <div className="mb-8 animate-fade-in">
              {renderCategoryFields()}
            </div>
          ) : (
            <div className="dynamic-section mb-8">
              <h4 className="text-sm font-bold text-muted mb-4 uppercase tracking-widest">Detalles Especiales</h4>
              {renderCategoryFields()}
            </div>
          )}

          <div className="flex gap-4">
            <button type="button" className="btn-apple-secondary flex-1" onClick={onClose}>Cancelar</button>
            <button type="submit" className="btn-apple-primary flex-1">
              <Save size={18} /> {initialData ? 'Guardar Cambios' : 'Crear Artículo'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default AddItemModal;
