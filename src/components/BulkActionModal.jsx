import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { RefreshCw, ArrowDownCircle, User, AlertCircle } from 'lucide-react';
import { useInventory } from '../context/InventoryContextOptimized';
import SearchableSelect from './SearchableSelect';
import './ActionModal.css';

const BulkActionModal = ({ isOpen, onClose, items = [], onConfirm, personnel = [] }) => {
  const { locations } = useInventory();
  const [quantities, setQuantities] = useState({});
  const [details, setDetails] = useState('');
  const [selectedLocation, setSelectedLocation] = useState('General'); 

  const personnelOptions = React.useMemo(() => {
    const uniquePersonnel = [];
    const seen = new Set();
    for (const p of personnel) {
      if (!seen.has(p.name)) {
        seen.add(p.name);
        uniquePersonnel.push({
          value: p.name,
          label: p.name,
          id: p.employeeId || p.id
        });
      }
    }
    return uniquePersonnel;
  }, [personnel]);

  useEffect(() => {
    if (isOpen && items.length > 0) {
      const initialQty = {};
      items.forEach(item => {
        initialQty[item.id] = 1;
      });
      setQuantities(initialQty);
      setDetails('');
      setSelectedLocation('General');
    }
  }, [isOpen, items]);

  if (!isOpen || items.length === 0) return null;

  const handleQtyChange = (id, val) => {
    setQuantities(prev => ({ ...prev, [id]: val === '' ? '' : (parseInt(val) || 0) }));
  };

  const allQtyValid = Object.values(quantities).every(q => q > 0);
  const isValid = allQtyValid && details.trim().length > 0;

  const handleConfirm = () => {
    if (!isValid) return;
    const detailText = details.trim() ? `Entregado a: ${details.trim()} (Lote)` : '';
    
    const finalQuantities = {};
    for (const id in quantities) {
      finalQuantities[id] = -Math.abs(quantities[id]);
    }
    onConfirm(finalQuantities, detailText, selectedLocation);
    onClose();
  };

  return createPortal(
    <div className="modal-overlay">
      <div className="modal-card animate-scale-up" style={{ maxWidth: 600 }}>
        <header className="modal-header">
          <h3>
            <ArrowDownCircle className="text-red-500" size={28} />
            Salida en Lote ({items.length} artículos)
          </h3>
          <p>
            Estás a punto de sacar múltiples artículos del inventario.
          </p>
        </header>

        <div className="flex flex-col gap-4 max-h-[60vh] overflow-y-auto pr-2">
          
          <div className="f-group" style={{ position: 'relative', zIndex: 99999 }}>
            <label className="f-label mb-2">
              <User size={14} className="inline mr-2 opacity-70" />
              Recibe / Destinatario (OBLIGATORIO)
            </label>
            <div style={{ position: 'relative', zIndex: 99999 }}>
              <SearchableSelect 
                options={personnelOptions}
                value={details}
                onChange={setDetails}
                placeholder="Seleccionar destinatario..."
                allowFreeText={true}
              />
            </div>
            {details.trim().length === 0 && (
              <div style={{
                display: 'flex', alignItems: 'center', gap: 6,
                marginTop: 8, padding: '8px 12px', borderRadius: 10,
                background: 'hsla(var(--danger), 0.1)',
                fontSize: 11, fontWeight: 700, color: 'hsl(var(--danger))'
              }}>
                <AlertCircle size={13} />
                Debes indicar quién recibe el material para continuar.
              </div>
            )}
          </div>

          <div className="f-group">
            <label>Ubicación de Origen (Global para el lote)</label>
            <select
              className="f-input"
              value={selectedLocation}
              onChange={(e) => setSelectedLocation(e.target.value)}
            >
              <option value="General">General</option>
              {locations.map(loc => (
                <option key={loc.id} value={loc.name}>{loc.name}</option>
              ))}
            </select>
          </div>

          <div className="bulk-modal-list">
             <div className="bulk-modal-header">
                <div>Artículo Seleccionado</div>
                <div style={{ width: '90px', textAlign: 'center' }}>Cantidad</div>
             </div>
             {items.map(item => (
                <div key={item.id} className="bulk-modal-item">
                   <div className="bulk-modal-item-info">
                     <p className="bulk-modal-item-name" title={item.name}>{item.name}</p>
                     <p className="bulk-modal-item-stock">Stock actual: <span className="font-bold text-gray-300">{item.qty}</span> {item.unit}</p>
                   </div>
                   <div className="bulk-modal-item-qty">
                     <input
                        type="number"
                        className="bulk-input-compact"
                        value={quantities[item.id] === '' ? '' : (quantities[item.id] !== undefined ? quantities[item.id] : '')}
                        onChange={(e) => handleQtyChange(item.id, e.target.value)}
                        min={1}
                     />
                   </div>
                </div>
             ))}
          </div>

        </div>

        <div className="flex gap-4 mt-6">
          <button className="btn-apple-secondary flex-1" onClick={onClose}>Cancelar</button>
          <button
            className="flex-1 btn-apple-danger"
            onClick={handleConfirm}
            disabled={!isValid}
          >
            Confirmar Salida en Lote
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};

export default BulkActionModal;
