import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { ClipboardCheck, AlertTriangle } from 'lucide-react';
import './ActionModal.css'; // Reusing ActionModal styles

const AuditModal = ({ isOpen, onClose, item, onConfirm }) => {
  const [physicalQty, setPhysicalQty] = useState('');
  const [reason, setReason] = useState('');

  // Reset state when opening a new item
  useEffect(() => {
    if (isOpen && item) {
      setPhysicalQty(item.qty?.toString() || '0');
      setReason('');
    }
  }, [isOpen, item]);

  if (!isOpen || !item) return null;

  // physicalQty must be a valid number >= 0
  const isValid = physicalQty !== '' && parseInt(physicalQty) >= 0;
  
  const difference = isValid ? parseInt(physicalQty) - (item.qty || 0) : 0;

  const handleConfirm = () => {
    if (!isValid) return;
    onConfirm(item.id, parseInt(physicalQty), reason.trim());
    onClose();
  };

  return createPortal(
    <div className="modal-overlay">
      <div className="modal-card animate-scale-up" style={{ maxWidth: '450px' }}>
        <header className="modal-header">
          <h3>
            <ClipboardCheck className="text-orange-500" size={28} />
            Auditar Inventario
          </h3>
          <p>
            Artículo: <strong>{item?.name}</strong>
          </p>
        </header>

        <div className="flex flex-col gap-6">
          <div className="flex justify-between items-center bg-white/5 p-4 rounded-xl border border-white/10">
            <div>
              <p className="text-xs text-muted font-bold uppercase tracking-widest mb-1">Stock en Sistema</p>
              <p className="text-2xl font-black text-white">{item?.qty || 0} <span className="text-sm font-normal text-muted">{item?.unit || 'Piezas'}</span></p>
            </div>
          </div>

          <div className="f-group">
            <label>Conteo Físico Real ({item?.unit || 'Piezas'})</label>
            <input
              type="number"
              className="f-input text-lg font-bold"
              value={physicalQty}
              onChange={(e) => setPhysicalQty(e.target.value)}
              placeholder="0"
              autoFocus
              min={0}
              style={{ borderColor: 'hsl(var(--warning))' }}
            />
          </div>

          {isValid && difference !== 0 && (
            <div style={{
              display: 'flex', alignItems: 'flex-start', gap: 8,
              padding: '12px', borderRadius: 10,
              background: difference < 0 ? 'hsla(var(--danger), 0.1)' : 'hsla(var(--success), 0.1)',
              border: `1px solid ${difference < 0 ? 'hsla(var(--danger), 0.2)' : 'hsla(var(--success), 0.2)'}`,
              fontSize: 13, color: difference < 0 ? 'hsl(var(--danger))' : 'hsl(var(--success))'
            }}>
              <AlertTriangle size={16} style={{ marginTop: 2, flexShrink: 0 }} />
              <div>
                <strong>Diferencia detectada: {difference > 0 ? `+${difference}` : difference} {item?.unit || 'Piezas'}</strong>
                <p style={{ marginTop: 4, opacity: 0.9, fontSize: 12 }}>Se registrará un ajuste en el historial.</p>
              </div>
            </div>
          )}

          <div className="f-group">
            <label>Observaciones (Opcional)</label>
            <input
              type="text"
              className="f-input"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Ej: Recuento mensual, merma..."
            />
          </div>

          <div className="flex gap-4 pt-2">
            <button type="button" className="btn-apple-secondary flex-1" onClick={onClose}>Cancelar</button>
            <button
              type="button"
              className="btn-apple-primary flex-1"
              style={{ background: 'hsl(var(--warning))', color: '#000' }}
              onClick={handleConfirm}
              disabled={!isValid}
            >
              Confirmar Auditoría
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
};

export default AuditModal;
