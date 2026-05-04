import React, { useState } from 'react';
import { useInventory } from '../context/InventoryContext';
import { useAuth } from '../context/AuthContext';
import { useLocation } from 'react-router-dom';
import Header from '../components/Header';
import AddItemModal from '../components/AddItemModal';
import { QRCodeSVG } from 'qrcode.react';
import { 
  Search, Plus, QrCode, ArrowUpRight, ArrowDownLeft, AlertTriangle, 
  Printer, X, Edit3, Trash2, Loader2, Wrench
} from 'lucide-react';
import './ToolsView.css';

const ToolsView = () => {
  const { items, personnel, addItem, editItem, deleteItem, loanItem, returnItem, reportMaintenance, loading } = useInventory();
  const { isAdmin, isStaff, canEditIn, canAddTo, userData } = useAuth();
  const location = useLocation();
  
  const [searchTerm, setSearchTerm] = useState(location.state?.prefillSearch || '');
  const [selectedTool, setSelectedTool] = useState(null);
  
  // Modals state
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isQRModalOpen, setIsQRModalOpen] = useState(false);
  const [isLoanModalOpen, setIsLoanModalOpen] = useState(false);
  const [isFaultModalOpen, setIsFaultModalOpen] = useState(false);
  
  // Forms state
  const [borrowerName, setBorrowerName] = useState('');
  const [faultReason, setFaultReason] = useState('');
  const [voucherData, setVoucherData] = useState(null);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full w-full flex-col gap-4">
        <Loader2 className="animate-spin text-blue-500" size={48} />
        <p className="text-gray-500 font-bold">Cargando herramientas...</p>
      </div>
    );
  }

  const tools = items.filter(i => i.category === 'Herramientas');
  
  const filteredTools = tools.filter(tool => {
    if (!searchTerm) return true;
    const searchLow = searchTerm.toLowerCase();
    const safeMatch = (val) => val && String(val).toLowerCase().includes(searchLow);
    return (
      safeMatch(tool.name) || 
      safeMatch(tool.modelo) || 
      safeMatch(tool.marca) || 
      safeMatch(tool.codigo) || 
      safeMatch(tool.serie) || 
      safeMatch(tool.item_number) || 
      safeMatch(tool.id)
    );
  });

  const sortedTools = [...filteredTools].sort((a, b) => 
    (a.name || '').trim().toLowerCase().localeCompare((b.name || '').trim().toLowerCase(), undefined, { numeric: true, sensitivity: 'base' })
  );

  const userName = userData?.name || userData?.displayName || 'Admin';

  const handleDelete = (id, name) => {
    if (window.confirm(`¿Eliminar la herramienta "${name}" permanentemente?`)) {
      deleteItem(id, userName);
    }
  };

  const handleLoan = async () => {
    if (!borrowerName) return;
    await loanItem(selectedTool.id, borrowerName, userName);
    setVoucherData({
      item: selectedTool,
      borrower: borrowerName,
      admin: userName,
      date: new Date().toLocaleString()
    });
    setIsLoanModalOpen(false);
    setBorrowerName('');
  };

  const handleReturn = async (tool) => {
    if (window.confirm(`¿Confirmar devolución de ${tool.name}?`)) {
      await returnItem(tool.id, userName);
    }
  };

  const handleFault = async () => {
    if (!faultReason) return;
    await reportMaintenance(selectedTool.id, faultReason, userName);
    setIsFaultModalOpen(false);
    setFaultReason('');
  };

  const getStatusClass = (status) => {
    if (status === 'Prestado') return 'prestado';
    if (status === 'Mantenimiento') return 'mantenimiento';
    return 'disponible';
  };

  return (
    <main className="tools-view animate-fade-in">
      <Header />
      
      <header className="tools-header">
        <div className="tools-title-group">
          <h2>Herramientas</h2>
          <p>Gestión individual y control por Código QR</p>
        </div>
        
        <div className="tools-actions">
          <div className="search-box-wrapper">
            <Search size={18} />
            <input 
              type="text" 
              placeholder="Buscar por nombre, código o marca..." 
              value={searchTerm} 
              onChange={(e) => setSearchTerm(e.target.value)} 
            />
          </div>
          
          {canAddTo('Herramientas') && (
            <button className="btn-primary-tools" onClick={() => { setSelectedTool(null); setIsAddModalOpen(true); }}>
              <Plus size={18} /> Nueva Herramienta
            </button>
          )}
        </div>
      </header>

      <section className="tools-grid">
        {sortedTools.map(tool => (
          <div key={tool.id} className="tool-card">
            <div className={`tool-status-ribbon ${getStatusClass(tool.status)}`}></div>
            
            {(isAdmin || canEditIn('Herramientas')) && (
              <div className="tool-admin-actions">
                <button className="btn-mini-action" onClick={() => { setSelectedTool(tool); setIsAddModalOpen(true); }} title="Editar">
                  <Edit3 size={12} />
                </button>
                {isAdmin && (
                  <button className="btn-mini-action delete" onClick={() => handleDelete(tool.id, tool.name)} title="Eliminar">
                    <Trash2 size={12} />
                  </button>
                )}
              </div>
            )}

            <div className="tool-card-header">
              <div className="tool-info">
                <span className="tool-brand">{tool.marca || 'GENÉRICO'}</span>
                <h3 className="tool-name">{tool.name}</h3>
                <p className="tool-model">{tool.modelo || 'Sin modelo'} • <span className="font-mono text-gray-400">{tool.codigo || tool.id.substring(0,6)}</span></p>
                <div className="tool-extra-meta mt-1 text-[10px] uppercase tracking-wider text-gray-400 flex flex-wrap gap-x-3">
                  {tool.item_number && <span>Item: {tool.item_number}</span>}
                  {tool.serie && <span>S/N: {tool.serie}</span>}
                </div>
              </div>
              <button 
                className="tool-qr-button" 
                onClick={() => { setSelectedTool(tool); setIsQRModalOpen(true); }}
                title="Ver Código QR"
              >
                <QrCode />
              </button>
            </div>

            <div>
              <span className={`tool-state-badge ${getStatusClass(tool.status)}`}>
                {tool.status || 'Disponible'}
              </span>
            </div>

            {tool.status === 'Prestado' && tool.borrowedBy && (
              <div className="borrower-info">
                <p>Prestado a: <strong>{tool.borrowedBy}</strong></p>
              </div>
            )}

            <div className="tool-actions">
              {isStaff && (
                <>
                  {tool.status !== 'Prestado' && tool.status !== 'Mantenimiento' && (
                    <button className="btn-tool-action btn-loan" onClick={() => { setSelectedTool(tool); setIsLoanModalOpen(true); }}>
                      <ArrowUpRight size={16} /> Prestar
                    </button>
                  )}
                  {tool.status === 'Prestado' && (
                    <button className="btn-tool-action btn-return" onClick={() => handleReturn(tool)}>
                      <ArrowDownLeft size={16} /> Devolver
                    </button>
                  )}
                  {tool.status !== 'Mantenimiento' && (
                    <button className="btn-tool-action btn-fault" onClick={() => { setSelectedTool(tool); setIsFaultModalOpen(true); }}>
                      <AlertTriangle size={16} /> Falla
                    </button>
                  )}
                </>
              )}
            </div>
          </div>
        ))}
        {filteredTools.length === 0 && (
          <div className="col-12 text-center py-12 text-gray-400">
            <Wrench size={48} className="mx-auto mb-4 opacity-20" />
            <p className="text-xl font-bold text-gray-500">No se encontraron herramientas</p>
          </div>
        )}
      </section>

      <AddItemModal 
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        category="Herramientas"
        initialData={selectedTool}
        onSave={(data) => {
          if (selectedTool) {
            editItem(selectedTool.id, data, userName);
          } else {
            addItem(data, userName);
          }
          setIsAddModalOpen(false);
        }}
      />

      {isQRModalOpen && selectedTool && (
        <div className="modal-overlay">
          <div className="modal-card animate-scale-up qr-modal-content">
            <button className="absolute top-4 right-4 text-gray-400 hover:text-gray-800" onClick={() => setIsQRModalOpen(false)}>
              <X size={24} />
            </button>
            
            <div className="qr-large-wrapper" id="print-qr-section">
              <QRCodeSVG value={selectedTool.codigo || selectedTool.id} size={200} level="H" includeMargin={true} />
            </div>
            
            <h3 className="qr-tool-name">{selectedTool.name}</h3>
            <p className="qr-tool-code">{selectedTool.codigo || selectedTool.id}</p>
            
            <div className="flex gap-4 mt-8 w-full max-w-xs">
              <button className="btn-primary w-full flex items-center justify-center gap-2" onClick={() => window.print()}>
                <Printer size={18} /> Imprimir QR
              </button>
            </div>
          </div>
        </div>
      )}

      {isLoanModalOpen && selectedTool && (
        <div className="modal-overlay">
          <div className="modal-card animate-scale-up">
            <header className="modal-header">
              <h3>
                <ArrowUpRight className="text-blue-500" size={28} />
                Prestar Herramienta
              </h3>
              <p>¿A quién se le entrega <strong>{selectedTool.name}</strong>?</p>
            </header>

            <div className="f-group">
              <label>Nombre del Trabajador</label>
              <input 
                type="text" 
                className="f-input" 
                placeholder="Escribe el nombre aquí..." 
                list="personnel-list"
                value={borrowerName} 
                onChange={(e) => setBorrowerName(e.target.value)} 
                autoFocus
              />
              <datalist id="personnel-list">
                {personnel.map(p => <option key={p.id} value={p.name} />)}
              </datalist>
            </div>

            <div className="flex gap-4">
              <button className="btn-apple-secondary flex-1" onClick={() => setIsLoanModalOpen(false)}>Cancelar</button>
              <button className="btn-apple-primary flex-1" onClick={handleLoan} disabled={!borrowerName}>Confirmar</button>
            </div>
          </div>
        </div>
      )}

      {isFaultModalOpen && selectedTool && (
        <div className="modal-overlay">
          <div className="modal-card animate-scale-up">
            <header className="modal-header">
              <h3>
                <AlertTriangle className="text-red-500" size={28} />
                Reportar Falla
              </h3>
              <p>Describe el problema con <strong>{selectedTool.name}</strong></p>
            </header>

            <div className="f-group">
              <label>Detalles del Problema</label>
              <textarea 
                className="f-input h-32 resize-none" 
                placeholder="¿Qué está fallando o qué mantenimiento requiere?" 
                value={faultReason} 
                onChange={(e) => setFaultReason(e.target.value)} 
                autoFocus
              />
            </div>

            <div className="flex gap-4">
              <button className="btn-apple-secondary flex-1" onClick={() => setIsFaultModalOpen(false)}>Cancelar</button>
              <button className="btn-apple-danger flex-1" onClick={handleFault} disabled={!faultReason}>Reportar</button>
            </div>
          </div>
        </div>
      )}

      {voucherData && (
        <div className="modal-overlay no-print">
          <div className="modal-card animate-scale-up">
            <header className="modal-header">
              <h3 className="justify-center">¡Préstamo Listo!</h3>
              <p className="text-center">El registro fue guardado exitosamente.</p>
            </header>
            
            <div className="w-24 h-24 bg-blue-50 dark:bg-blue-900/20 text-blue-500 rounded-full flex items-center justify-center mx-auto mb-10">
              <Printer size={40} />
            </div>

            <div className="flex gap-4">
              <button className="btn-apple-secondary flex-1" onClick={() => setVoucherData(null)}>Cerrar</button>
              <button className="btn-apple-primary flex-1" onClick={() => window.print()}>Imprimir Vale</button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
};

export default ToolsView;
