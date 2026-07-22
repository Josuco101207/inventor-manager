import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, RefreshCw, ArrowUpCircle, ArrowDownCircle, User, AlertCircle, MapPin } from 'lucide-react';
import { useInventory } from '../context/InventoryContextOptimized';
import SearchableSelect from './SearchableSelect';
import './ActionModal.css';

const ActionModal = ({ isOpen, onClose, item, onConfirm, personnel = [] }) => {
  const { locations } = useInventory();
  const [qty, setQty] = useState(1);
  const [action, setAction] = useState('Entrada');
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
    if (isOpen && item) {
      setSelectedLocation(item.location || 'General');
      setQty(1);
      setAction('Entrada');
      setDetails('');
    }
  }, [isOpen, item]);

  if (!isOpen || !item) return null;

  const isSalida = action === 'Salida';
  const isValid = qty && parseInt(qty) > 0 && details.trim().length > 0;

  const handleConfirm = () => {
    if (!isValid) return;
    const finalQty = isSalida ? -parseInt(qty) : parseInt(qty);
    const detailText = details.trim() ? `Entregado a: ${details.trim()}` : '';
    onConfirm(item.id, finalQty, detailText, selectedLocation);
    onClose();
  };

  return createPortal(
    <div className="modal-overlay">
      <div className="modal-card animate-scale-up">
        <header className="modal-header">
          <h3>
            <RefreshCw className="text-blue-500" size={28} />
            Movimiento de Stock
          </h3>
          <p>
            Artículo: <strong>{item?.name}</strong>
          </p>
        </header>

        <div className="flex flex-col gap-6">
          {/* Toggle Entrada / Salida */}
          <div className="f-group">
            <label>Tipo de Operación</label>
            <div className="operation-toggle">
              <button
                className={`op-btn ${action === 'Entrada' ? 'active-entrada' : ''}`}
                onClick={() => { setAction('Entrada'); setDetails(''); }}
              >
                <ArrowUpCircle size={18} /> Entrada
              </button>
              <button
                className={`op-btn ${action === 'Salida' ? 'active-salida' : ''}`}
                onClick={() => setAction('Salida')}
              >
                <ArrowDownCircle size={18} /> Salida
              </button>
            </div>
          </div>



          {/* Quantity */}
          <div className="f-group">
            <label>Cantidad ({item?.unit || 'Piezas'})</label>
            <input
              type="number"
              className="f-input text-lg font-bold"
              value={qty}
              onChange={(e) => setQty(e.target.value === '' ? '' : parseInt(e.target.value, 10) || 0)}
              placeholder="0"
              autoFocus
              min={1}
            />
          </div>

          {/* Recipient — always shown, REQUIRED */}
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

            {/* Warning message when empty */}
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

          {/* Buttons */}
          <div className="flex gap-4" style={{ position: 'relative', zIndex: 1 }}>
            <button className="btn-apple-secondary flex-1" onClick={onClose}>Cancelar</button>
            <button
              className={`flex-1 ${isSalida ? 'btn-apple-danger' : 'btn-apple-primary'}`}
              onClick={handleConfirm}
              disabled={!isValid}
            >
              {isSalida ? 'Confirmar Salida' : 'Confirmar Entrada'}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
};

export default ActionModal;
