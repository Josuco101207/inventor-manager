import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowRight, Layers, Tag } from 'lucide-react';
import { useCustomCategories } from '../context/CustomCategoriesContext';
import './ActionModal.css';

const MoveSectionModal = ({ isOpen, onClose, item, onConfirm }) => {
  const { customCategories } = useCustomCategories();
  const [targetSection, setTargetSection] = useState('');

  if (!isOpen || !item) return null;

  // All standard categories in the system
  const standardCategories = [
    { id: 'std_1', name: 'Tornillería' },
    { id: 'std_2', name: 'Papelería' },
    { id: 'std_3', name: 'Herramientas' },
    { id: 'std_4', name: 'Impresión 3D' },
    { id: 'std_5', name: 'Electrónica' },
    { id: 'std_6', name: 'Inventario General' },
    { id: 'std_7', name: 'Almacén Temporal' }
  ];

  const allCategories = [
    ...standardCategories,
    ...(customCategories || [])
  ].filter(c => c.name !== item.category);

  const uniqueCategories = Array.from(new Map(allCategories.map(c => [c.name, c])).values());
  const isValid = targetSection.trim().length > 0;

  const handleConfirm = () => {
    if (!isValid) return;
    onConfirm(item.id, targetSection);
    onClose();
  };

  return createPortal(
    <div className="modal-overlay">
      <div className="modal-card animate-scale-up" style={{ maxWidth: 450 }}>
        <header className="modal-header">
          <h3>
            <ArrowRight className="text-primary" size={28} />
            Mover a otra Sección
          </h3>
          <p>
            Estás a punto de reubicar <strong>{item?.name}</strong>
          </p>
        </header>

        <div className="flex flex-col gap-6">
          <div className="flex flex-col gap-2">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(255,255,255,0.03)', padding: 12, borderRadius: 8, border: '1px solid rgba(255,255,255,0.05)' }}>
              <div>
                <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Sección Actual</span>
                <div style={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
                  <Layers size={14} /> {item.category}
                </div>
              </div>
            </div>
          </div>

          <div className="f-group">
            <label>
              <Tag size={14} style={{ marginRight: 6 }} />
              Sección Destino
            </label>
            <select
              className="f-input"
              value={targetSection}
              onChange={(e) => setTargetSection(e.target.value)}
              autoFocus
            >
              <option value="" disabled>Selecciona una sección...</option>
              {uniqueCategories.map(cat => (
                <option key={cat.id || cat.name} value={cat.name}>{cat.name}</option>
              ))}
            </select>
            
            {targetSection && (
              <div style={{ marginTop: 12, padding: 12, background: 'rgba(255, 165, 0, 0.1)', border: '1px solid rgba(255, 165, 0, 0.2)', borderRadius: 8, fontSize: 12, color: 'var(--text-color)' }}>
                <strong>Nota:</strong> Si la nueva sección tiene campos dinámicos distintos, este artículo solo mostrará los campos que coincidan. Sus datos originales no se borrarán de la base de datos.
              </div>
            )}
          </div>

          <div className="flex gap-4 mt-2">
            <button className="btn-apple-secondary flex-1" onClick={onClose}>Cancelar</button>
            <button
              className="btn-apple-primary flex-1"
              onClick={handleConfirm}
              disabled={!isValid}
            >
              Confirmar Movimiento
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
};

export default MoveSectionModal;
