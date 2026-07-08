import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { RefreshCw, ArrowRightLeft, MapPin } from 'lucide-react';
import { useInventory } from '../context/InventoryContextOptimized';
import './ActionModal.css';

const TransferModal = ({ isOpen, onClose, item, onConfirm }) => {
  const { locations } = useInventory();
  const [qty, setQty] = useState(1);
  const [sourceLocation, setSourceLocation] = useState('');
  const [destinationLocation, setDestinationLocation] = useState('');
  const [details, setDetails] = useState('');

  useEffect(() => {
    if (isOpen && item) {
      setQty(1);
      setDetails('');
      // Autoselect a source location that has stock
      const stockObj = item.stockByLocation || {};
      const locationsWithStock = Object.keys(stockObj).filter(k => stockObj[k] > 0);
      const defaultSource = locationsWithStock.length > 0 ? locationsWithStock[0] : 'General';
      setSourceLocation(defaultSource);
      setDestinationLocation('');
    }
  }, [isOpen, item]);

  if (!isOpen || !item) return null;

  const currentStock = (item.stockByLocation && sourceLocation) ? (item.stockByLocation[sourceLocation] || 0) : 0;
  const isValid = qty > 0 && qty <= currentStock && sourceLocation && destinationLocation && sourceLocation !== destinationLocation;

  const handleConfirm = () => {
    if (!isValid) return;
    onConfirm(item.id, parseInt(qty), sourceLocation, destinationLocation, details);
    onClose();
  };

  return createPortal(
    <div className="modal-overlay">
      <div className="modal-card animate-scale-up">
        <header className="modal-header">
          <h3>
            <ArrowRightLeft className="text-purple-500" size={28} />
            Transferir Stock
          </h3>
          <p>
            Artículo: <strong>{item?.name}</strong>
          </p>
        </header>

        <div className="flex flex-col gap-6">
          <div className="flex gap-4">
            {/* Source */}
            <div className="f-group flex-1">
              <label>
                <MapPin size={14} style={{ marginRight: 6 }} />
                Origen
              </label>
              <select
                className="f-input"
                value={sourceLocation}
                onChange={(e) => setSourceLocation(e.target.value)}
              >
                <option value="" disabled>Seleccionar...</option>
                <option value="General">General (Stock: {item?.stockByLocation?.['General'] || 0})</option>
                {locations.map(loc => (
                  <option key={loc.id} value={loc.name}>{loc.name} (Stock: {item?.stockByLocation?.[loc.name] || 0})</option>
                ))}
              </select>
            </div>

            {/* Destination */}
            <div className="f-group flex-1">
              <label>
                <MapPin size={14} style={{ marginRight: 6 }} />
                Destino
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

          {/* Quantity */}
          <div className="f-group">
            <label>Cantidad a transferir ({item?.unit || 'Piezas'})</label>
            <input
              type="number"
              className="f-input text-lg font-bold"
              value={qty}
              onChange={(e) => setQty(e.target.value)}
              placeholder="0"
              autoFocus
              min={1}
              max={currentStock || 1}
            />
            {qty > currentStock && (
              <div style={{ marginTop: 4, fontSize: 12, color: 'var(--danger)' }}>
                Excede el stock disponible en origen ({currentStock})
              </div>
            )}
          </div>

          {/* Details */}
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

          {/* Buttons */}
          <div className="flex gap-4">
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
      </div>
    </div>,
    document.body
  );
};

export default TransferModal;
