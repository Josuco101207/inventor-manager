import React, { useState, useEffect } from 'react';
import { useInventory } from '../context/InventoryContextOptimized';
import { useAuth } from '../context/AuthContext';
import Header from '../components/Header';
import { Plus, Trash2, Save, Layout, Layers, Box, Tag, Key, Type, Hash, Calendar, Edit2, X } from 'lucide-react';
import { toast } from 'sonner';
import { collection, addDoc, getDocs, deleteDoc, doc, updateDoc } from 'firebase/firestore';
import { db } from '../firebase/config';
import './SectionAdminView.css';

const ICONS = {
  Layers: <Layers size={20} />,
  Box: <Box size={20} />,
  Tag: <Tag size={20} />,
  Key: <Key size={20} />,
  Layout: <Layout size={20} />
};

const SectionAdminView = () => {
  const { userData, isAdmin } = useAuth();
  const { customCategories } = useInventory();
  
  const [name, setName] = useState('');
  const [iconName, setIconName] = useState('Layers');
  const [fields, setFields] = useState([{ id: Date.now().toString(), name: '', type: 'text', required: false }]);
  const [editingId, setEditingId] = useState(null);
  const [isSaving, setIsSaving] = useState(false);
  const [loading, setLoading] = useState(false);

  const categories = customCategories || [];

  const addField = () => {
    setFields([...fields, { id: Date.now().toString(), name: '', type: 'text', required: false }]);
  };

  const removeField = (id) => {
    setFields(fields.filter(f => f.id !== id));
  };

  const updateField = (id, key, value) => {
    setFields(fields.map(f => f.id === id ? { ...f, [key]: value } : f));
  };

  const handleEditClick = (cat) => {
    setEditingId(cat.id);
    setName(cat.name);
    setIconName(cat.icon);
    setFields(cat.fields.length > 0 ? cat.fields : [{ id: Date.now().toString(), name: '', type: 'text', required: false }]);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setName('');
    setIconName('Layers');
    setFields([{ id: Date.now().toString(), name: '', type: 'text', required: false }]);
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
        toast.success('Sección dinámica actualizada exitosamente.');
      } else {
        categoryData.createdAt = new Date();
        await addDoc(collection(db, 'custom_categories'), categoryData);
        toast.success('Sección guardada');
      }
      
      // Reset form
      cancelEdit();
      
      // Need a hard reload to inject routes in App.jsx (simplest robust approach for now)
      setTimeout(() => window.location.reload(), 1500);

    } catch (error) {
      console.error("Error saving category:", error);
      toast.error('Ocurrió un error al guardar la sección.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (id, catName) => {
    if (!window.confirm(`¿Estás seguro de eliminar la sección "${catName}"? Los artículos creados bajo esta categoría seguirán existiendo pero no tendrán vista propia.`)) return;
    
    try {
      await deleteDoc(doc(db, 'custom_categories', id));
      toast.success('Sección eliminada');
      setTimeout(() => window.location.reload(), 1500);
    } catch (error) {
      toast.error('Error al eliminar la sección.');
    }
  };

  if (!isAdmin) {
    return (
      <div className="section-admin-view">
        <Header />
        <div className="flex items-center justify-center h-full">
          <h2>Acceso Denegado. Solo administradores pueden crear secciones.</h2>
        </div>
      </div>
    );
  }

  return (
    <div className="section-admin-view animate-fade-in">
      <Header />
      
      <div className="admin-header">
        <div>
          <h2>Creador de Secciones</h2>
          <p>Configura categorías dinámicas con campos personalizados.</p>
        </div>
      </div>

      <div className="admin-grid">
        {/* Formulario de Creación / Edición */}
        <div className="admin-card glass-panel">
          <div className="flex items-center justify-between mb-4">
            <h3 className="card-title mb-0">{editingId ? 'Editar Sección' : 'Nueva Sección'}</h3>
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
            <label>Ícono</label>
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

          <div className="fields-section">
            <div className="fields-header">
              <h4>Campos Personalizados</h4>
              <button className="btn-add-field" onClick={addField}>
                <Plus size={16} /> Añadir
              </button>
            </div>
            
            <p className="text-xs text-muted mb-4 mt-2">
              Agrega exactamente los campos que necesites. El sistema usará el primer campo como el nombre principal del elemento.
            </p>
            <div className="fields-list">
              {fields.map((field) => (
                <div key={field.id} className="field-row">
                  <input 
                    type="text" 
                    className="admin-input field-name" 
                    placeholder="Nombre del campo (Ej. Talla, Placas)" 
                    value={field.name}
                    onChange={(e) => updateField(field.id, 'name', e.target.value)}
                  />
                  <select 
                    className="admin-input field-type"
                    value={field.type}
                    onChange={(e) => updateField(field.id, 'type', e.target.value)}
                  >
                    <option value="text">Texto</option>
                    <option value="number">Número</option>
                    <option value="date">Fecha</option>
                    <option value="boolean">Sí/No</option>
                  </select>
                  <label className="checkbox-wrap">
                    <input 
                      type="checkbox" 
                      checked={field.required}
                      onChange={(e) => updateField(field.id, 'required', e.target.checked)}
                    />
                    <span className="text-xs">Req.</span>
                  </label>
                  <button className="btn-remove-field" onClick={() => removeField(field.id)}>
                    <Trash2 size={16} />
                  </button>
                </div>
              ))}
            </div>
          </div>

          <button className="btn-save" onClick={handleSave} disabled={isSaving}>
            {isSaving ? <Loader2 className="animate-spin" /> : <Save size={18} />}
            {isSaving ? 'Guardando...' : (editingId ? 'Actualizar Sección' : 'Crear Sección')}
          </button>
        </div>

        {/* Lista de Secciones Existentes */}
        <div className="admin-card glass-panel">
          <h3 className="card-title">Secciones Activas</h3>
          
          {loading ? (
            <div className="flex justify-center p-8"><Loader2 className="animate-spin text-primary" /></div>
          ) : categories.length === 0 ? (
            <div className="empty-sections">
              <Layout size={48} />
              <p>No hay secciones dinámicas aún.</p>
            </div>
          ) : (
            <div className="sections-list">
              {categories.map(cat => (
                <div key={cat.id} className="section-item">
                  <div className="section-item-info">
                    <div className="section-icon">{ICONS[cat.icon] || <Layers />}</div>
                    <div>
                      <h4>{cat.name}</h4>
                      <span className="section-route">{cat.route} • {cat.fields.length} campos esp.</span>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button className="btn-edit-section" style={{ background: 'transparent', color: '#888', border: '1px solid #444', borderRadius: '8px', padding: '8px', cursor: 'pointer', transition: 'all 0.2s' }} onClick={() => handleEditClick(cat)}>
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
