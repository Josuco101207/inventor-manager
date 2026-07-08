import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { ArrowRightLeft, MapPin } from 'lucide-react';
import { useInventory } from '../context/InventoryContextOptimized';
import './ActionModal.css';

const BulkTransferModal = ({ isOpen, onClose, items = [], onConfirm }) => {
  const { locations } = useInventory();
  const [quantities, setQuantities] = useState({});
  const [sourceLocation, setSourceLocation] = useState('General');
  const [destinationLocation, setDestinationLocation] = useState('');
  const [details, setDetails] = useState('');

  useEffect(() => {
    if (isOpen && items.length > 0) {
      const initialQty = {};
      items.forEach(item => {
        initialQty[item.id] = 1;
      });
      setQuantities(initialQty);
      setDetails('');
      setSourceLocation('General');
      setDestinationLocation('');
    }
  }, [isOpen, items]);

  if (!isOpen || items.length === 0) return null;

  const handleQtyChange = (id, val) => {
    setQuantities(prev => ({ ...prev, [id]: parseInt(val) || 0 }));
  };

  const allQtyValid = items.every(item => {
    const qty = quantities[item.id] || 0;
    const currentStock = (item.stockByLocation && sourceLocation) ? (item.stockByLocation[sourceLocation] || 0) : 0;
    return qty > 0 && qty <= currentStock;
  });
  const isValid = allQtyValid && sourceLocation && destinationLocation && sourceLocation !== destinationLocation;

  const handleConfirm = () => {
    if (!isValid) return;
    onConfirm(quantities, sourceLocation, destinationLocation, details);
    onClose();
  };

  return createPortal(
    <div className="modal-overlay">
      <div className="modal-card animate-scale-up" style={{ maxWidth: 600 }}>
        <header className="modal-header">
          <h3>
            <ArrowRightLeft className="text-purple-500" size={28} />
            Transferir Lote ({items.length} artículos)
          </h3>
          <p>
            Mover múltiples artículos a otra ubicación simultáneamente.
          </p>
        </header>

        <div className="flex flex-col gap-4 max-h-[60vh] overflow-y-auto pr-2">
          <div className="flex gap-4">
            <div className="f-group flex-1">
              <label>
                <MapPin size={14} style={{ marginRight: 6 }} />
                Origen Global
              </label>
              <select
                className="f-input"
                value={sourceLocation}
                onChange={(e) => setSourceLocation(e.target.value)}
              >
                <option value="General">General</option>
                {locations.map(loc => (
                  <option key={loc.id} value={loc.name}>{loc.name}</option>
                ))}
              </select>
            </div>

            <div className="f-group flex-1">
              <label>
                <MapPin size={14} style={{ marginRight: 6 }} />
                Destino Global
              </label>
              <select
                className="f-input"
                value={destinationLocation}
                onChange={(e) => setDestinationLocation(e.target.value)}
              >
                <option value="" disabled>Seleccionar...</option>
                <option value="General">General</option>
                {locations.filter(l => l.name !== sourceLocation).map(loc => (
                  <option key={loc.id} value={loc.name}>{loc.name}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="f-group">
            <label>Detalles / Motivo (Opcional)</label>
            <input
              type="text"
              className="f-input"
              value={details}
              onChange={(e) => setDetails(e.target.value)}
              placeholder="Ej: Reabastecimiento de urgencia..."
            />
          </div>

          <div className="bulk-modal-list">
             <div className="bulk-modal-header">
                <div>Artículo Seleccionado</div>
                <div style={{ width: '90px', textAlign: 'center' }}>Cantidad</div>
             </div>
             {items.map(item => {
               const currentStock = (item.stockByLocation && sourceLocation) ? (item.stockByLocation[sourceLocation] || 0) : 0;
               return (
                 <div key={item.id} className="bulk-modal-item">
                    <div className="bulk-modal-item-info">
                      <p className="bulk-modal-item-name" title={item.name}>{item.name}</p>
                      <p className="bulk-modal-item-stock">
                        Stock en {sourceLocation}: <span className="font-bold text-gray-300">{currentStock}</span>
                      </p>
                    </div>
                    <div className="bulk-modal-item-qty">
                      <input
                         type="number"
                         className="bulk-input-compact"
                         value={quantities[item.id] || ''}
                         onChange={(e) => handleQtyChange(item.id, e.target.value)}
                         min={1}
                         max={currentStock || 1}
                      />
                      {(quantities[item.id] > currentStock) && (
                        <span className="bulk-input-error">Excede stock</span>
                      )}
                    </div>
                 </div>
               );
             })}
          </div>

        </div>

        <div className="flex gap-4 mt-6">
          <button className="btn-apple-secondary flex-1" onClick={onClose}>Cancelar</button>
          <button
            className="btn-apple-primary flex-1"
            style={{ backgroundColor: 'hsl(var(--primary))' }}
            onClick={handleConfirm}
            disabled={!isValid}
          >
            Confirmar Transferencia
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};

export default BulkTransferModal;
