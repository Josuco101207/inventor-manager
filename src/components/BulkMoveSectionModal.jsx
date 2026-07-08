import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowRight, Layers, Tag } from 'lucide-react';
import { useInventory } from '../context/InventoryContextOptimized';
import './ActionModal.css';

const BulkMoveSectionModal = ({ isOpen, onClose, items = [], onConfirm }) => {
  const { customCategories } = useInventory();
  const [targetSection, setTargetSection] = useState('');

  if (!isOpen || items.length === 0) return null;

  // All standard categories in the system
  const standardCategories = [
    { id: 'std_1', name: 'Tornillería' },
    { id: 'std_2', name: 'Papelería' },
    { id: 'std_3', name: 'Herramientas' },
    { id: 'std_4', name: 'Impresión 3D' },
    { id: 'std_5', name: 'Electrónica' },
    { id: 'std_6', name: 'Inventario General' },
    { id: 'std_7', name: 'Almacén Temporal' },
    { id: 'std_8', name: 'Parques' }
  ];

  // current category is all items category assuming they are listed from same category view
  const currentCategory = items[0]?.category;

  const allCategories = [
    ...standardCategories,
    ...(customCategories || [])
  ].filter(c => c.name !== currentCategory);

  const uniqueCategories = Array.from(new Map(allCategories.map(c => [c.name, c])).values());
  const isValid = targetSection.trim().length > 0;

  const handleConfirm = () => {
    if (!isValid) return;
    const itemIds = items.map(i => i.id);
    onConfirm(itemIds, targetSection);
    onClose();
  };

  return createPortal(
    <div className="modal-overlay">
      <div className="modal-card animate-scale-up" style={{ maxWidth: 500 }}>
        <header className="modal-header">
          <h3>
            <ArrowRight className="text-primary" size={28} />
            Mover a otra Sección ({items.length} artículos)
          </h3>
          <p>
            Reubicar múltiples artículos a una nueva sección / categoría.
          </p>
        </header>

        <div className="flex flex-col gap-6 max-h-[60vh] overflow-y-auto pr-2">
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
                <strong>Nota:</strong> Si la nueva sección tiene campos dinámicos distintos, estos artículos solo mostrarán los campos que coincidan.
              </div>
            )}
          </div>

          <div className="bulk-modal-list">
             <div className="bg-[rgba(255,255,255,0.05)] px-4 py-2 text-[11px] font-bold uppercase tracking-wider text-gray-400">
                Artículos Seleccionados
             </div>
             {items.map(item => (
               <div key={item.id} className="flex justify-between items-center px-4 py-3 border-t border-[rgba(255,255,255,0.05)] hover:bg-[rgba(255,255,255,0.02)] transition-colors">
                  <div className="flex items-center gap-3 overflow-hidden">
                    <div className="w-8 h-8 rounded-lg bg-[rgba(255,255,255,0.05)] flex items-center justify-center text-xs font-bold shrink-0 border border-[rgba(255,255,255,0.1)]">
                      {item.image ? (
                        <img src={item.image} alt="" className="w-full h-full object-cover rounded-lg" />
                      ) : (
                        item.name.charAt(0).toUpperCase()
                      )}
                    </div>
                    <div className="flex flex-col overflow-hidden">
                      <span className="font-semibold text-sm truncate">{item.name}</span>
                      <div className="flex items-center gap-2 mt-0.5 text-xs text-gray-400">
                        <Layers size={10} /> {item.category}
                      </div>
                    </div>
                  </div>
               </div>
             ))}
          </div>

        </div>

        <div className="flex gap-4 mt-6">
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
    </div>,
    document.body
  );
};

export default BulkMoveSectionModal;
