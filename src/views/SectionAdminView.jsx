import React, { useState } from 'react';
import { useInventory } from '../context/InventoryContextOptimized';
import { useCustomCategories } from '../context/CustomCategoriesContext';
import { useAuth } from '../context/AuthContext';
import Header from '../components/Header';
import { Plus, Trash2, Save, Layout, Layers, Box, Tag, Key, Edit2, X, Info, Car, MonitorSmartphone, Shield, Shirt } from 'lucide-react';
import { toast } from 'sonner';
import { collection, addDoc, deleteDoc, doc, updateDoc } from 'firebase/firestore';
import { db } from '../firebase/config';
import './SectionAdminView.css';

const ICONS = {
  Layers: <Layers size={24} />,
  Box: <Box size={24} />,
  Tag: <Tag size={24} />,
  Key: <Key size={24} />,
  Layout: <Layout size={24} />,
  Car: <Car size={24} />,
  Monitor: <MonitorSmartphone size={24} />,
  Shield: <Shield size={24} />,
  Shirt: <Shirt size={24} />
};

const PRESETS = [
  {
    id: 'vehiculos',
    name: 'Vehículos',
    icon: 'Car',
    fields: [
      { id: 'f1', name: 'Placas', type: 'text', required: true },
      { id: 'f2', name: 'Marca/Modelo', type: 'text', required: true },
      { id: 'f3', name: 'Kilometraje', type: 'number', required: true },
      { id: 'f4', name: 'Próximo Servicio', type: 'date', required: false }
    ]
  },
  {
    id: 'it',
    name: 'Equipos de IT',
    icon: 'Monitor',
    fields: [
      { id: 'f1', name: 'Número de Serie', type: 'text', required: true },
      { id: 'f2', name: 'Marca', type: 'text', required: true },
      { id: 'f3', name: 'Asignado a', type: 'text', required: false },
      { id: 'f4', name: 'Tipo', type: 'select', options: 'Laptop, Monitor, Periférico, Otro', required: true }
    ]
  },
  {
    id: 'uniformes',
    name: 'Uniformes',
    icon: 'Shirt',
    fields: [
      { id: 'f1', name: 'Talla', type: 'select', options: 'XS, S, M, L, XL, XXL', required: true },
      { id: 'f2', name: 'Color', type: 'text', required: false },
      { id: 'f3', name: 'Género', type: 'select', options: 'Unisex, Hombre, Mujer', required: true }
    ]
  },
  {
    id: 'software',
    name: 'Licencias / Software',
    icon: 'Key',
    fields: [
      { id: 'f1', name: 'Clave de Licencia', type: 'text', required: true },
      { id: 'f2', name: 'Vencimiento', type: 'date', required: true },
      { id: 'f3', name: 'Asientos/Usuarios', type: 'number', required: false }
    ]
  },
  {
    id: 'herramientas',
    name: 'Herramientas',
    icon: 'Box',
    fields: [
      { id: 'f1', name: 'Item Number', type: 'text', required: false },
      { id: 'f2', name: 'Código Interno (QR)', type: 'text', required: false },
      { id: 'f3', name: 'Marca', type: 'text', required: false },
      { id: 'f4', name: 'Modelo', type: 'text', required: false },
      { id: 'f5', name: 'Número de Serie', type: 'text', required: false },
      { id: 'f6', name: 'Última Reparación', type: 'date', required: false }
    ]
  },
  {
    id: 'inventario-general',
    name: 'Inventario General',
    icon: 'Layers',
    fields: [
      { id: 'f1', name: 'Item Number', type: 'text', required: false },
      { id: 'f2', name: 'Grupo', type: 'text', required: false },
      { id: 'f3', name: 'Subcategoría', type: 'text', required: false },
      { id: 'f4', name: 'Marca', type: 'text', required: false },
      { id: 'f5', name: 'Modelo', type: 'text', required: false },
      { id: 'f6', name: 'Número de Serie', type: 'text', required: false },
      { id: 'f7', name: 'Ubicación', type: 'text', required: false },
      { id: 'f8', name: 'Fecha de Compra', type: 'date', required: false },
      { id: 'f9', name: 'Garantía', type: 'text', required: false }
    ]
  }
];

const SectionAdminView = () => {
  const { userData, isAdmin } = useAuth();
  const { customCategories } = useCustomCategories();
  
  const [name, setName] = useState('');
  const [iconName, setIconName] = useState('Layers');
  const [fields, setFields] = useState([]);
  const [editingId, setEditingId] = useState(null);
  const [isSaving, setIsSaving] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);

  const categories = customCategories || [];

  const addField = () => {
    setFields([...fields, { id: Date.now().toString(), name: '', type: 'text', options: '', required: false }]);
  };

  const removeField = (id) => {
    setFields(fields.filter(f => f.id !== id));
  };

  const updateField = (id, key, value) => {
    setFields(fields.map(f => f.id === id ? { ...f, [key]: value } : f));
  };

  const applyPreset = (preset) => {
    setName(preset.name);
    setIconName(preset.icon);
    // Asignar nuevos IDs a los campos del preset para evitar colisiones
    const newFields = preset.fields.map(f => ({
      ...f,
      id: Date.now().toString() + Math.random().toString(36).substr(2, 5)
    }));
    setFields(newFields);
    setShowAdvanced(true);
    toast.success(`Plantilla "${preset.name}" aplicada.`);
  };

  const handleEditClick = (cat) => {
    setEditingId(cat.id);
    setName(cat.name);
    setIconName(cat.icon);
    setFields(cat.fields || []);
    setShowAdvanced(cat.fields && cat.fields.length > 0);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setName('');
    setIconName('Layers');
    setFields([]);
    setShowAdvanced(false);
  };

  const handleSave = async () => {
    if (!name.trim()) return toast.error('El nombre de la sección es obligatorio.');
    
    // Validate fields
    const validFields = fields.filter(f => f.name.trim() !== '');
    
    try {
      setIsSaving(true);
      const categoryData = {
        name: name.trim(),
        route: `/${name.trim().toLowerCase().replace(/\s+/g, '-')}`,
        icon: iconName,
        fields: validFields,
        createdBy: userData?.name || 'Admin',
        updatedAt: new Date()
      };

      if (editingId) {
        await updateDoc(doc(db, 'custom_categories', editingId), categoryData);
        toast.success('Sección actualizada exitosamente.');
      } else {
        categoryData.createdAt = new Date();
        await addDoc(collection(db, 'custom_categories'), categoryData);
        toast.success('Sección creada exitosamente.');
      }
      
      // Reset form
      cancelEdit();
      
      // Firebase real-time listener will automatically update the UI

    } catch (error) {
      console.error("Error saving category:", error);
      toast.error('Ocurrió un error al guardar la sección.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (id, catName) => {
    if (!window.confirm(`¿Estás seguro de eliminar la sección "${catName}"? Los artículos creados bajo esta categoría seguirán existiendo en el inventario global, pero perderán su vista propia.`)) return;
    
    try {
      await deleteDoc(doc(db, 'custom_categories', id));
      toast.success('Sección eliminada');
    } catch (error) {
      toast.error('Error al eliminar la sección.');
    }
  };

  // Accesibility handled in App.jsx or context, removing strict admin check to allow users to create sections


  return (
    <div className="section-admin-view animate-fade-in">
      <Header />
      
      <div className="admin-header">
        <div>
          <h2>Creador de Secciones</h2>
          <p>Configura nuevas vistas dinámicas y define cómo se estructura la información.</p>
        </div>
        <div style={{ background: 'hsla(var(--primary), 0.1)', padding: '1rem', borderRadius: '16px', display: 'flex', alignItems: 'center', gap: '12px', border: '1px solid hsla(var(--primary), 0.2)', maxWidth: '350px' }}>
          <Info size={24} className="text-primary" />
          <span style={{ fontSize: '0.85rem', color: 'hsl(var(--text-soft))' }}>
            Las secciones funcionan como Sub-Almacenes donde cada uno tiene sus propios campos y reglas.
          </span>
        </div>
      </div>

      <div className="admin-grid">
        {/* Formulario de Creación / Edición */}
        <div className="admin-card">
          {!editingId && (
            <div className="presets-container">
              <div className="presets-header">
                Plantillas Rápidas
              </div>
              <div className="presets-grid">
                {PRESETS.map(preset => (
                  <div key={preset.id} className="preset-card" onClick={() => applyPreset(preset)}>
                    <div className="preset-icon-wrap">
                      {ICONS[preset.icon]}
                    </div>
                    <span>{preset.name}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="flex items-center justify-between mb-4">
            <h3 className="card-title mb-0">{editingId ? 'Editar Sección Existente' : 'Diseñar Nueva Sección'}</h3>
            {editingId && (
              <button className="btn-cancel-quick" onClick={cancelEdit} title="Cancelar Edición">
                <X size={18} /> Cancelar
              </button>
            )}
          </div>
          
          <div className="form-group">
            <label>Nombre de la Sección</label>
            <input 
              type="text" 
              className="admin-input" 
              placeholder="Ej. Vehículos, Software, Laptops..." 
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          <div className="form-group">
            <label>Selecciona un Ícono</label>
            <div className="icon-selector">
              {Object.keys(ICONS).map(iconKey => (
                <button 
                  key={iconKey}
                  className={`icon-btn ${iconName === iconKey ? 'active' : ''}`}
                  onClick={() => setIconName(iconKey)}
                  title={iconKey}
                >
                  {ICONS[iconKey]}
                </button>
              ))}
            </div>
          </div>

          <div className="mt-4 mb-4">
            <button 
              className="builder-toggle-btn"
              onClick={() => setShowAdvanced(!showAdvanced)}
            >
              <Layout size={18} /> 
              {showAdvanced ? 'Ocultar Constructor de Campos' : 'Personalizar Campos de la Sección'}
            </button>
          </div>

          {showAdvanced && (
            <div className="fields-section mt-4 animate-fade-in">
              <div className="fields-header">
                <h4>Estructura de Datos</h4>
                <button className="btn-add-field" onClick={addField}>
                  <Plus size={16} /> Agregar Campo
                </button>
              </div>
              
              <p className="fields-help">
                Define los campos personalizados para esta sección. Si no añades ninguno, se usarán los campos estándar.
              </p>
              <div className="fields-list">
                {fields.map((field) => (
                  <div key={field.id} className="field-row">
                    <input 
                      type="text" 
                      className="admin-input field-name" 
                      placeholder="Nombre (Ej. Talla, Placas)" 
                      value={field.name}
                      onChange={(e) => updateField(field.id, 'name', e.target.value)}
                    />
                    <select 
                      className="admin-input field-type"
                      value={field.type}
                      onChange={(e) => updateField(field.id, 'type', e.target.value)}
                    >
                      <option value="text">Texto Corto</option>
                      <option value="textarea">Texto Largo</option>
                      <option value="number">Número</option>
                      <option value="date">Fecha</option>
                      <option value="boolean">Sí/No</option>
                      <option value="select">Lista Desplegable</option>
                    </select>
                    
                    {field.type === 'select' && (
                      <div className="options-input-wrapper">
                        <input 
                          type="text" 
                          className="admin-input" 
                          placeholder="Opciones separadas por coma (ej: S, M, L)"
                          value={field.options || ''}
                          onChange={(e) => updateField(field.id, 'options', e.target.value)}
                        />
                      </div>
                    )}
                    <label className="checkbox-wrap" title="Hacer campo obligatorio">
                      <input 
                        type="checkbox" 
                        checked={field.required}
                        onChange={(e) => updateField(field.id, 'required', e.target.checked)}
                      />
                      <span>Req.</span>
                    </label>
                    <button className="btn-remove-field" onClick={() => removeField(field.id)} title="Eliminar campo">
                      <Trash2 size={18} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          <button className="btn-save" onClick={handleSave} disabled={isSaving}>
            {isSaving ? <span className="flex items-center gap-2"><svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg> Guardando...</span> : <><Save size={20} /> {editingId ? 'Actualizar Sección' : 'Crear Sección'}</>}
          </button>
        </div>

        {/* Lista de Secciones Existentes */}
        <div className="admin-card">
          <h3 className="card-title">Secciones Activas</h3>
          
          {loading ? (
             <div className="flex justify-center p-8">
               <svg className="animate-spin h-8 w-8 text-primary" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
             </div>
          ) : categories.length === 0 ? (
            <div className="empty-sections">
              <Layout size={64} style={{ opacity: 0.5, marginBottom: '1rem' }} />
              <p style={{ margin: 0, fontWeight: 600 }}>No hay secciones dinámicas aún.</p>
              <span style={{ fontSize: '0.85rem', marginTop: '0.5rem' }}>Crea tu primer sub-almacén usando el formulario.</span>
            </div>
          ) : (
            <div className="sections-list">
              {categories.map(cat => (
                <div key={cat.id} className="section-item">
                  <div className="section-item-info">
                    <div className="section-icon">{ICONS[cat.icon] || <Layers size={24} />}</div>
                    <div>
                      <h4>{cat.name}</h4>
                      <span className="section-route">
                        <span className="section-route-badge">{cat.route}</span> 
                        {cat.fields.length} campos esp.
                      </span>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button className="btn-edit-section" style={{ background: 'hsla(0,0%,100%,0.05)', color: 'hsl(var(--text-soft))', border: '1px solid hsla(var(--border-color), 0.5)', borderRadius: '12px', padding: '0.6rem', cursor: 'pointer', transition: 'all 0.2s' }} onClick={() => handleEditClick(cat)}>
                      <Edit2 size={18} />
                    </button>
                    <button className="btn-delete-section" onClick={() => handleDelete(cat.id, cat.name)}>
                      <Trash2 size={18} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default SectionAdminView;
