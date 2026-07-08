import React, { useState, useEffect, useRef, useCallback, memo, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useInventory } from '../context/InventoryContextOptimized';
import { useAuth } from '../context/AuthContext';
import { db } from '../firebase/config';
import { doc, deleteDoc, updateDoc } from 'firebase/firestore';
import { useLocation } from 'react-router-dom';
import Header from '../components/Header';
import AddItemModal from '../components/AddItemModal';
import SearchableSelect from '../components/SearchableSelect';
import ImageModal from '../components/ImageModal';
import { QRCodeSVG } from 'qrcode.react';
import { Scanner } from '@yudiel/react-qr-scanner';
import { 
  Search, Plus, QrCode, ArrowUpRight, ArrowDownLeft, AlertTriangle, 
  Printer, X, Edit3, Trash2, Loader2, Wrench, ScanLine, RotateCcw, Download, UserCheck
} from 'lucide-react';
import { exportToExcel } from '../utils/exportUtils';
import './ToolsView.css';

const getStatusClass = (status) => {
  if (status === 'Prestado') return 'prestado';
  if (status === 'Asignado') return 'asignado';
  return 'disponible';
};

const ToolCard = memo(({ 
  tool, isAdmin, isStaff, canEdit, 
  isSelected, onSelectToggle,
  onEdit, onDelete, onLoan, onAssign, onReturn, onFault, onRepair, onQR, index, onImageClick
}) => (
  <div 
    className={`tool-card animate-slide-up ${isSelected ? 'is-selected' : ''} ${isStaff ? 'has-selection-mode' : ''}`}
    style={{ animationDelay: `${(index % 10) * 0.05}s` }}
  >
    <div className={`tool-status-ribbon ${getStatusClass(tool.status)}`}></div>
    


    <div className="tool-card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.25rem', position: 'relative' }}>
      
      <div className="tool-header-content" style={{ display: 'flex', gap: '12px', flex: 1, paddingRight: '1rem', minWidth: 0 }}>
        <div style={{ position: 'relative' }}>
          {isStaff && tool.status !== 'Prestado' && tool.status !== 'Mantenimiento' && tool.status !== 'Asignado' && (
            <div className="tool-selection-box" style={{ position: 'absolute', top: '-8px', left: '-8px', zIndex: 10 }} onClick={(e) => { e.stopPropagation(); onSelectToggle(tool.id); }}>
              <div className={`tool-checkbox-custom ${isSelected ? 'checked' : ''}`} style={{ width: '20px', height: '20px', borderRadius: '4px' }}>
                {isSelected && <span className="check-mark" style={{ fontSize: '12px' }}>✓</span>}
              </div>
            </div>
          )}
          
          {tool.image ? (
            <img 
              src={tool.image} 
              alt={tool.name} 
              style={{ width: '52px', height: '52px', borderRadius: '14px', objectFit: 'cover', cursor: 'pointer', border: '1px solid hsla(var(--border-color), 0.4)', flexShrink: 0 }} 
              onClick={(e) => { e.stopPropagation(); if(onImageClick) onImageClick(tool.image); }} 
            />
          ) : (
            <div style={{ width: '52px', height: '52px', borderRadius: '14px', background: 'hsla(var(--bg-elevated), 0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.5rem', fontWeight: 'bold', color: 'hsl(var(--primary))', border: '1px solid hsla(var(--border-color), 0.4)', flexShrink: 0 }}>
              {tool.name.charAt(0).toUpperCase()}
            </div>
          )}
        </div>
        
        <div className="tool-info" style={{ paddingRight: 0, minWidth: 0, flex: 1 }}>
          <span className="tool-brand" style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: 'hsl(var(--primary))', letterSpacing: '0.05em', marginBottom: '0.2rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {tool.marca || 'GENÉRICO'}
          </span>
          <h3 className="tool-name" style={{ fontSize: '1.15rem', fontWeight: 800, color: 'hsl(var(--text-main))', lineHeight: 1.2, margin: '0 0 0.3rem 0', display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {tool.name}
          </h3>
          <p className="tool-model" style={{ fontSize: '0.85rem', color: 'hsl(var(--text-muted))', margin: 0, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {tool.modelo || 'Sin modelo'} • <span className="font-mono text-gray-400">{tool.codigo || tool.id.substring(0,6)}</span>
          </p>
          <div className="tool-extra-meta mt-2 text-[10px] uppercase tracking-wider text-gray-400 flex flex-wrap gap-x-3">
            {tool.item_number && <span>Item: {tool.item_number}</span>}
            {tool.serie && <span>S/N: {tool.serie}</span>}
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
        {(isAdmin || canEdit) && (
          <div className="tool-admin-actions" style={{ position: 'relative', top: 'auto', right: 'auto', opacity: 1 }}>
            <button className="btn-mini-action" onClick={(e) => { e.stopPropagation(); onEdit(tool); }} title="Editar">
              <Edit3 size={12} />
            </button>
            {isAdmin && (
              <button className="btn-mini-action delete" onClick={(e) => { e.stopPropagation(); onDelete(tool.id, tool.name); }} title="Eliminar">
                <Trash2 size={12} />
              </button>
            )}
          </div>
        )}
        <button 
          className="tool-qr-button" 
          onClick={(e) => { e.stopPropagation(); onQR(tool); }}
          title="Ver Código QR"
        >
          <QrCode size={16} />
        </button>
      </div>
    </div>

    <div>
      <span className={`tool-state-badge ${getStatusClass(tool.status)}`}>
        {tool.status || 'Disponible'}
      </span>
      {tool.observaciones && (
        <div className="tool-note-box mt-2 p-2 bg-gray-50 dark:bg-gray-800/50 rounded-lg border-l-4 border-yellow-500">
          <p className="text-[11px] font-medium text-gray-600 dark:text-gray-400 leading-tight">
            <strong>Nota:</strong> {tool.observaciones}
          </p>
        </div>
      )}
    </div>

    {(tool.status === 'Prestado' || tool.status === 'Asignado') && (tool.borrowedBy || tool.assignedTo) && (
      <div className="borrower-info">
        <p>{tool.status === 'Asignado' ? 'Asignado a:' : 'Prestado a:'} <strong>{tool.status === 'Asignado' ? tool.assignedTo : tool.borrowedBy}</strong></p>
      </div>
    )}

    <div className="tool-actions">
      {isStaff && (
        <>
          {tool.status !== 'Prestado' && tool.status !== 'Mantenimiento' && tool.status !== 'Asignado' && (
            <>
              <button className="btn-tool-action btn-loan" onClick={() => onLoan(tool)}>
                <ArrowUpRight size={16} /> Prestar
              </button>
              <button className="btn-tool-action btn-assign-action" onClick={() => onAssign(tool)}>
                <UserCheck size={16} /> Asignar
              </button>
            </>
          )}
          {(tool.status === 'Prestado' || tool.status === 'Asignado') && (
            <button className="btn-tool-action btn-return" onClick={() => onReturn(tool)}>
              <ArrowDownLeft size={16} /> Devolver
            </button>
          )}
          {tool.status === 'Mantenimiento' && (
            <button className="btn-tool-action btn-return bg-green-500 hover:bg-green-600" onClick={() => onRepair(tool)}>
              <RotateCcw size={16} /> Regresar Almacén
            </button>
          )}
          {tool.status !== 'Mantenimiento' && (
            <button className="btn-tool-action btn-fault" onClick={() => onFault(tool)}>
              <AlertTriangle size={16} /> Falla
            </button>
          )}
        </>
      )}
    </div>
  </div>
));

const ToolsView = () => {
  const { items, personnel, addItem, editItem, deleteItem, loanItem, assignItem, bulkLoanItems, bulkAssignItems, returnItem, reportMaintenance, completeMaintenance, loading } = useInventory();
  const { isAdmin, isStaff, canEditIn, canAddTo, userData } = useAuth();
  const location = useLocation();
  
  const [searchTerm, setSearchTerm] = useState(location.state?.prefillSearch || '');
  const [debouncedSearch, setDebouncedSearch] = useState(searchTerm);
  const [selectedTool, setSelectedTool] = useState(null);
  const [selectedToolIds, setSelectedToolIds] = useState([]);
  const [selectedImage, setSelectedImage] = useState(null);
  
  const personnelOptions = useMemo(() => {
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

  // Modals state
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isQRModalOpen, setIsQRModalOpen] = useState(false);
  const [isLoanModalOpen, setIsLoanModalOpen] = useState(false);
  const [isAssignModalOpen, setIsAssignModalOpen] = useState(false);
  const [isBulkLoanModalOpen, setIsBulkLoanModalOpen] = useState(false);
  const [isBulkAssignModalOpen, setIsBulkAssignModalOpen] = useState(false);
  const [isFaultModalOpen, setIsFaultModalOpen] = useState(false);
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState(null); // null | 'Prestado' | 'Mantenimiento' | 'Asignado'
  
  // Forms state
  const [borrowerName, setBorrowerName] = useState('');
  const [faultReason, setFaultReason] = useState('');

  // Worker y paginación
  const workerRef = useRef(null);
  const [filteredTools, setFilteredTools] = useState([]);
  const [visibleCount, setVisibleCount] = useState(30);
  const observer = useRef(null);

  // Auto-import script for Coples
  useEffect(() => {
    if (window.location.hash === '#importNow') {
      const runImport = async () => {
        if(window.confirm('¿Importar los 9 coples a Herreria AHORA?')) {
          const coples = [
            { name: "Cople 131-C42", category: "Herreria", unit: "PZA", qty: 175, threshold: 5, status: "Disponible", codigo: "131-C42" },
            { name: "Cople 128-C42", category: "Herreria", unit: "PZA", qty: 63, threshold: 5, status: "Disponible", codigo: "128-C42" },
            { name: "Cople BT4533-GD", category: "Herreria", unit: "PZA", qty: 33, threshold: 5, status: "Disponible", codigo: "BT4533-GD" },
            { name: "Cople BK44-GD", category: "Herreria", unit: "PZA", qty: 48, threshold: 5, status: "Disponible", codigo: "BK44-GD" },
            { name: "Cople 119-C42", category: "Herreria", unit: "PZA", qty: 50, threshold: 5, status: "Disponible", codigo: "119-C42" },
            { name: "Cople 176-C42", category: "Herreria", unit: "PZA", qty: 68, threshold: 5, status: "Disponible", codigo: "176-C42" },
            { name: "Cople 104-C42", category: "Herreria", unit: "PZA", qty: 14, threshold: 2, status: "Disponible", codigo: "104-C42" },
            { name: "Cople 158-C42", category: "Herreria", unit: "PZA", qty: 4, threshold: 2, status: "Disponible", codigo: "158-C42" },
            { name: "Cople 116-C42", category: "Herreria", unit: "PZA", qty: 17, threshold: 2, status: "Disponible", codigo: "116-C42" }
          ];
          let added = 0;
          for (let c of coples) {
            try {
              await addItem(c, userData?.name || 'Sistema AI');
              added++;
            } catch(e) {
              console.error("Error adding " + c.name, e);
            }
          }
          alert(`¡Se crearon ${added} coples exitosamente en Herreria!`);
          window.location.hash = '';
        }
      };
      runImport();
    } else if (window.location.hash === '#cleanupDuplicates') {
      const runCleanup = async () => {
        if(window.confirm('¿Eliminar todos los duplicados y consolidar el stock (excepto en Herramientas)?')) {
          const map = {};
          for (let item of items) {
            if (item.category === 'Herramientas') continue;
            const key = item.category + '|' + item.name.toLowerCase();
            if (!map[key]) map[key] = [];
            map[key].push(item);
          }

          let deleted = 0;
          let consolidated = 0;

          for (let key in map) {
            const group = map[key];
            if (group.length > 1) {
              // Sort by date or id, keep the first one
              const keepItem = group[0];
              let totalQty = 0;
              let toDelete = [];
              for (let i = 0; i < group.length; i++) {
                totalQty += (group[i].qty || 0);
                if (i > 0) toDelete.push(group[i].id);
              }

              try {
                // Update the kept item with total qty
                if (totalQty !== keepItem.qty) {
                  await updateDoc(doc(db, 'items', keepItem.id), { qty: totalQty });
                  consolidated++;
                }

                // Delete the rest
                for (let id of toDelete) {
                  await deleteDoc(doc(db, 'items', id));
                  deleted++;
                }
              } catch(e) {
                console.error('Error during cleanup:', e);
              }
            }
          }
          alert(`¡Limpieza completada! Se eliminaron ${deleted} registros duplicados y se consolidó el stock en ${consolidated} artículos.`);
          window.location.hash = '';
          // Firebase realtime updates will handle the UI state
        }
      };
      runCleanup();
    } else if (window.location.hash === '#debugHerreria') {
      // Debug
      const herreriaItems = items.filter(i => i.category.toLowerCase().includes('herreria') || i.category.toLowerCase().includes('herrería')).map(i => i.name + ' (' + i.category + ')');
      alert(`Encontrados ${herreriaItems.length} items: ` + herreriaItems.join(', '));
      window.location.hash = '';
    }
  }, [items, editItem, userData]);

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchTerm);
      setVisibleCount(30); // Reset scroll on search
    }, 150);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  // Reset count on filter change
  useEffect(() => {
    setVisibleCount(30);
  }, [statusFilter]);

  // Inicializar Worker
  useEffect(() => {
    workerRef.current = new Worker(new URL('../workers/filterWorker.js', import.meta.url));
    workerRef.current.onmessage = (e) => {
      setFilteredTools(e.data);
    };
    return () => workerRef.current.terminate();
  }, []);

  // Enviar INIT cuando cambia el inventario completo
  useEffect(() => {
    if (workerRef.current && items) {
      workerRef.current.postMessage({ type: 'INIT', items });
    }
  }, [items]);

  // Postear al worker con debounce
  useEffect(() => {
    if (!workerRef.current || loading) return;
    const filterTimer = setTimeout(() => {
      workerRef.current.postMessage({
        type: 'FILTER',
        searchTerm: debouncedSearch,
        categoryTitle: 'Herramientas',
        activeSubcategory: 'TODAS',
        selectedBrand: 'Todas',
        selectedLocation: 'Todas',
        statusFilter: statusFilter
      });
    }, 50);
    return () => clearTimeout(filterTimer);
  }, [debouncedSearch, loading, statusFilter]);

  // Intersection Observer para Infinite Scroll usando callback ref (seguro contra loops)
  const observerTarget = useCallback(node => {
    if (loading) return;
    if (observer.current) observer.current.disconnect();
    
    observer.current = new IntersectionObserver(entries => {
      if (entries[0].isIntersecting) {
        setVisibleCount(prev => prev + 30);
      }
    }, { threshold: 0.1, rootMargin: '200px' });
    
    if (node) observer.current.observe(node);
  }, [loading]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full w-full flex-col gap-4">
        <Loader2 className="animate-spin text-blue-500" size={48} />
        <p className="text-gray-500 font-bold">Cargando herramientas...</p>
      </div>
    );
  }

  const userName = userData?.name || userData?.displayName || 'Desconocido';

  const handleDelete = useCallback((id, name) => {
    if (window.confirm(`¿Eliminar la herramienta "${name}" permanentemente?`)) {
      deleteItem(id, userName);
    }
  }, [deleteItem, userName]);

  const handleLoanConfirm = async () => {
    if (!borrowerName) return;
    
    // Si el usuario tenía una selección múltiple y el tool actual está en ella,
    // quizás deberíamos haber usado bulkLoan. Pero si llegó aquí es porque
    // llamó a loanItem directamente.
    await loanItem(selectedTool.id, borrowerName, userName);
    setIsLoanModalOpen(false);
    setBorrowerName('');
  };

  const handleAssignConfirm = async () => {
    if (!borrowerName) return;
    await assignItem(selectedTool.id, borrowerName, userName);
    setIsAssignModalOpen(false);
    setBorrowerName('');
  };

  const handleBulkLoanConfirm = async () => {
    if (!borrowerName || selectedToolIds.length === 0) return;
    await bulkLoanItems(selectedToolIds, borrowerName, userName);
    setIsBulkLoanModalOpen(false);
    setBorrowerName('');
    setSelectedToolIds([]); // Limpiar selección tras préstamo
  };

  const handleBulkAssignConfirm = async () => {
    if (!borrowerName || selectedToolIds.length === 0) return;
    await bulkAssignItems(selectedToolIds, borrowerName, userName);
    setIsBulkAssignModalOpen(false);
    setBorrowerName('');
    setSelectedToolIds([]); // Limpiar selección tras asignación
  };

  const toggleToolSelection = useCallback((id) => {
    setSelectedToolIds(prev => 
      prev.includes(id) ? prev.filter(tid => tid !== id) : [...prev, id]
    );
  }, []);

  const handleReturnConfirm = useCallback(async (tool) => {
    if (window.confirm(`¿Confirmar devolución de ${tool.name}?`)) {
      await returnItem(tool.id, userName);
    }
  }, [returnItem, userName]);

  const handleFaultConfirm = async () => {
    if (!faultReason) return;
    await reportMaintenance(selectedTool.id, faultReason, userName);
    setIsFaultModalOpen(false);
    setFaultReason('');
  };

  const handleRepairConfirm = useCallback(async (tool) => {
    if (window.confirm(`¿Confirmar que ${tool.name} ha sido reparada y regresa al almacén?`)) {
      await completeMaintenance(tool.id, userName);
    }
  }, [completeMaintenance, userName]);

  const handlers = useMemo(() => ({
    onEdit: (t) => { setSelectedTool(t); setIsAddModalOpen(true); },
    onDelete: handleDelete,
    onLoan: (t) => { 
      if (selectedToolIds.includes(t.id) && selectedToolIds.length > 1) {
        setIsBulkLoanModalOpen(true);
      } else {
        setSelectedTool(t); 
        setIsLoanModalOpen(true);
      }
    },
    onAssign: (t) => { 
      if (selectedToolIds.includes(t.id) && selectedToolIds.length > 1) {
        setIsBulkAssignModalOpen(true);
      } else {
        setSelectedTool(t); 
        setIsAssignModalOpen(true);
      }
    },
    onReturn: handleReturnConfirm,
    onFault: (t) => { setSelectedTool(t); setIsFaultModalOpen(true); },
    onRepair: handleRepairConfirm,
    onQR: (t) => { setSelectedTool(t); setIsQRModalOpen(true); }
  }), [handleDelete, handleReturnConfirm, handleRepairConfirm, selectedToolIds]);

  const visibleTools = filteredTools.slice(0, visibleCount);
  const canEditTools = canEditIn('Herramientas');

  return (
    <main className="tools-view animate-fade-in">
      <Header />
      
      <header className="tools-header">
        <div className="tools-title-group">
          <h2>Herramientas</h2>
          <p>Gestión individual y control por Código QR ({filteredTools.length})</p>
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
          
          <button 
            className={`btn-scan-qr ${statusFilter === 'Prestado' ? 'active-loaned' : ''}`}
            onClick={() => setStatusFilter(statusFilter === 'Prestado' ? null : 'Prestado')}
            title="Filtrar Prestadas"
          >
            <ArrowUpRight size={18} /> {statusFilter === 'Prestado' ? 'Viendo Prestadas' : 'Prestadas'}
          </button>

          <button 
            className={`btn-scan-qr ${statusFilter === 'Asignado' ? 'active-assigned' : ''}`}
            onClick={() => setStatusFilter(statusFilter === 'Asignado' ? null : 'Asignado')}
            title="Filtrar Asignadas"
          >
            <UserCheck size={18} /> {statusFilter === 'Asignado' ? 'Viendo Asignadas' : 'Asignadas'}
          </button>

          <button 
            className={`btn-scan-qr ${statusFilter === 'Mantenimiento' ? 'active-faulty' : ''}`}
            onClick={() => setStatusFilter(statusFilter === 'Mantenimiento' ? null : 'Mantenimiento')}
            title="Filtrar con Falla"
          >
            <AlertTriangle size={18} /> {statusFilter === 'Mantenimiento' ? 'Viendo Fallas' : 'Con Falla'}
          </button>

          <button 
            className="btn-scan-qr"
            onClick={() => setIsScannerOpen(true)}
            title="Escanear QR"
          >
            <ScanLine size={18} /> Escanear
          </button>

          <button 
            className="btn-scan-qr"
            onClick={() => {
              const allTools = items.filter(i => i.category === 'Herramientas');
              exportToExcel(allTools, 'todas_las_herramientas', 'Herramientas');
            }}
            title="Exportar Todo a Excel"
          >
            <Download size={18} /> Exportar
          </button>
          
          {canAddTo('Herramientas') && (
            <button className="btn-primary-tools" onClick={() => { setSelectedTool(null); setIsAddModalOpen(true); }}>
              <Plus size={18} /> Nueva Herramienta
            </button>
          )}
        </div>
      </header>

      {/* Floating Action Bar for Bulk Selection */}
      {selectedToolIds.length > 0 && createPortal(
        <div className="bulk-actions-bar animate-slide-up" style={{ zIndex: 9999 }}>
          <div className="bulk-info">
            <span className="bulk-count">
              {selectedToolIds.length}
            </span>
            <span className="bulk-text">seleccionadas</span>
          </div>
          
          <div className="bulk-buttons">
            <button 
              className="btn-bulk-cancel"
              onClick={() => setSelectedToolIds([])}
            >
              Cancelar
            </button>
            <button 
              className="btn-bulk-action"
              onClick={() => setIsBulkLoanModalOpen(true)}
            >
              <ArrowUpRight size={16} /> Prestar Lote
            </button>
            <button 
              className="btn-bulk-action bg-purple-500 hover:bg-purple-600 text-white"
              onClick={() => setIsBulkAssignModalOpen(true)}
            >
              <UserCheck size={16} /> Asignar Lote
            </button>
          </div>
        </div>,
        document.body
      )}

      <section className="tools-grid">
        {visibleTools.map((tool, index) => (
          <ToolCard 
            key={tool.id}
            tool={tool}
            index={index}
            isAdmin={isAdmin}
            isStaff={isStaff}
            canEdit={canEditTools}
            isSelected={selectedToolIds.includes(tool.id)}
            onSelectToggle={toggleToolSelection}
            onEdit={handlers.onEdit}
            onDelete={handlers.onDelete}
            onLoan={handlers.onLoan}
            onAssign={handlers.onAssign}
            onReturn={handlers.onReturn}
            onFault={handlers.onFault}
            onRepair={handlers.onRepair}
            onQR={handlers.onQR}
            onImageClick={setSelectedImage}
          />
        ))}
        {filteredTools.length === 0 && (
          <div className="col-12 text-center py-12 text-gray-400" style={{ gridColumn: '1 / -1' }}>
            <Wrench size={48} className="mx-auto mb-4 opacity-20" />
            <p className="text-xl font-bold text-gray-500">No se encontraron herramientas</p>
          </div>
        )}
      </section>
      
      {/* Infinite Scroll Trigger */}
      {visibleCount < filteredTools.length && (
        <div ref={observerTarget} className="flex justify-center py-8">
          <Loader2 className="animate-spin text-blue-500" size={32} />
        </div>
      )}

      <AddItemModal 
        isOpen={isAddModalOpen} 
        onClose={() => setIsAddModalOpen(false)} 
        category="Herramientas" 
        initialData={selectedTool}
        onSave={(data) => {
          if (selectedTool) {
            editItem(selectedTool.id, data, userData?.name || 'Desconocido');
          } else {
            addItem(data, userData?.name || 'Desconocido');
          }
          setIsAddModalOpen(false);
        }}
      />

      {isLoanModalOpen && selectedTool && createPortal(
        <div className="modal-overlay">
          <div className="modal-card animate-scale-up">
            <header className="modal-header">
              <h3>
                <ArrowUpRight className="text-blue-500" size={28} />
                Prestar Herramienta
              </h3>
              <p>¿A quién se le entrega <strong>{selectedTool.name}</strong>?</p>
            </header>

            <div className="f-group" style={{ position: 'relative', zIndex: 999 }}>
              <label>Nombre del Trabajador</label>
              <div style={{ position: 'relative', zIndex: 9999 }}>
                <SearchableSelect 
                  options={personnelOptions}
                  value={borrowerName}
                  onChange={setBorrowerName}
                  placeholder="Seleccionar trabajador..."
                  allowFreeText={true}
                />
              </div>
            </div>

            <div className="flex gap-4">
              <button className="btn-apple-secondary flex-1" onClick={() => setIsLoanModalOpen(false)}>Cancelar</button>
              <button className="btn-apple-primary flex-1" onClick={handleLoanConfirm} disabled={!borrowerName}>Confirmar</button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {isAssignModalOpen && selectedTool && createPortal(
        <div className="modal-overlay">
          <div className="modal-card animate-scale-up">
            <header className="modal-header">
              <h3>
                <UserCheck className="text-purple-500" size={28} />
                Asignar Herramienta
              </h3>
              <p>¿A quién se le asigna <strong>{selectedTool.name}</strong>?</p>
            </header>

            <div className="f-group" style={{ position: 'relative', zIndex: 999 }}>
              <label>Nombre del Trabajador</label>
              <div style={{ position: 'relative', zIndex: 9999 }}>
                <SearchableSelect 
                  options={personnelOptions}
                  value={borrowerName}
                  onChange={setBorrowerName}
                  placeholder="Seleccionar trabajador..."
                  allowFreeText={true}
                />
              </div>
            </div>

            <div className="flex gap-4">
              <button className="btn-apple-secondary flex-1" onClick={() => setIsAssignModalOpen(false)}>Cancelar</button>
              <button className="btn-apple-primary flex-1" onClick={handleAssignConfirm} disabled={!borrowerName}>Confirmar</button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {isBulkLoanModalOpen && createPortal(
        <div className="modal-overlay">
          <div className="modal-card animate-scale-up">
            <header className="modal-header">
              <h3>
                <ArrowUpRight className="text-blue-500" size={28} />
                Préstamo Múltiple
              </h3>
              <p>¿A quién se le entregan las <strong>{selectedToolIds.length}</strong> herramientas seleccionadas?</p>
            </header>

            <div className="f-group" style={{ position: 'relative', zIndex: 999 }}>
              <label>Nombre del Trabajador</label>
              <div style={{ position: 'relative', zIndex: 9999 }}>
                <SearchableSelect 
                  options={personnelOptions}
                  value={borrowerName}
                  onChange={setBorrowerName}
                  placeholder="Seleccionar trabajador..."
                  allowFreeText={true}
                />
              </div>
            </div>

            <div className="flex gap-4">
              <button className="btn-apple-secondary flex-1" onClick={() => setIsBulkLoanModalOpen(false)}>Cancelar</button>
              <button className="btn-apple-primary flex-1" onClick={handleBulkLoanConfirm} disabled={!borrowerName}>Confirmar</button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {isBulkAssignModalOpen && createPortal(
        <div className="modal-overlay">
          <div className="modal-card animate-scale-up">
            <header className="modal-header">
              <h3>
                <UserCheck className="text-purple-500" size={28} />
                Asignación Múltiple
              </h3>
              <p>¿A quién se le asignan las <strong>{selectedToolIds.length}</strong> herramientas seleccionadas?</p>
            </header>

            <div className="f-group" style={{ position: 'relative', zIndex: 999 }}>
              <label>Nombre del Trabajador</label>
              <div style={{ position: 'relative', zIndex: 9999 }}>
                <SearchableSelect 
                  options={personnelOptions}
                  value={borrowerName}
                  onChange={setBorrowerName}
                  placeholder="Seleccionar trabajador..."
                  allowFreeText={true}
                />
              </div>
            </div>

            <div className="flex gap-4">
              <button className="btn-apple-secondary flex-1" onClick={() => setIsBulkAssignModalOpen(false)}>Cancelar</button>
              <button className="btn-apple-primary flex-1" onClick={handleBulkAssignConfirm} disabled={!borrowerName}>Confirmar</button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {isFaultModalOpen && selectedTool && createPortal(
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
              <button className="btn-apple-danger flex-1" onClick={handleFaultConfirm} disabled={!faultReason}>Reportar</button>
            </div>
          </div>
        </div>,
        document.body
      )}



      {isScannerOpen && createPortal(
        <div className="modal-overlay">
          <div className="modal-card animate-scale-up" style={{ width: '90%', maxWidth: '400px', padding: '1.5rem' }}>
            <header className="modal-header" style={{ position: 'relative', marginBottom: '1rem' }}>
              <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <ScanLine className="text-blue-500" size={24} />
                Escanear Herramienta
              </h3>
              <button 
                style={{ position: 'absolute', right: 0, top: 0 }}
                className="text-gray-400 hover:text-gray-800" 
                onClick={() => setIsScannerOpen(false)}
              >
                <X size={24} />
              </button>
            </header>
            
            <div style={{ borderRadius: '16px', overflow: 'hidden', backgroundColor: '#000', margin: '1rem 0' }}>
              <Scanner 
                onScan={(result) => {
                  if (result && result.length > 0) {
                    const scannedValue = result[0].rawValue;
                    
                    // Buscar la herramienta exacta por código o ID
                    const tool = items.find(i => 
                      i.category === 'Herramientas' && 
                      (i.codigo === scannedValue || i.id === scannedValue)
                    );

                    if (tool) {
                      setSearchTerm(''); // Limpiar filtro para mostrarla
                      setDebouncedSearch('');
                      setIsScannerOpen(false);
                      
                      // Pequeño delay para que el render del filtro se limpie y podamos verla
                      setTimeout(() => {
                        setSelectedTool(tool);
                        // Por defecto, si escanea una disponible, abrir préstamo. 
                        // Si está prestada, abrir devolución o mensaje.
                        if (tool.status === 'Prestado') {
                          handleReturnConfirm(tool);
                        } else if (tool.status === 'Mantenimiento') {
                          alert(`${tool.name} está en mantenimiento.`);
                        } else {
                          setIsLoanModalOpen(true);
                        }
                      }, 100);
                    } else {
                      // Si no la encuentra exacta, al menos filtrar para ver qué hay parecido
                      setSearchTerm(scannedValue);
                      setIsScannerOpen(false);
                    }
                  }
                }} 
              />
            </div>
            <p className="text-center text-gray-500 text-sm font-medium mt-4">
              Apunta la cámara al código QR para identificar la herramienta automáticamente.
            </p>
          </div>
        </div>,
        document.body
      )}
      {isQRModalOpen && selectedTool && createPortal(
        <div className="modal-overlay">
          <div className="modal-card animate-scale-up qr-modal-content">
            <button className="absolute top-4 right-4 text-gray-400 hover:text-gray-800" onClick={() => setIsQRModalOpen(false)}>
              <X size={24} />
            </button>
            
            <div className="qr-large-wrapper" id="print-qr-section">
              <QRCodeSVG value={selectedTool.codigo || selectedTool.id} size={200} level="H" includeMargin={true} />
              <p className="mt-4 font-bold text-gray-800 text-lg">{selectedTool.name}</p>
              <p className="text-gray-500 font-mono">{selectedTool.codigo || selectedTool.id}</p>
            </div>

            <div className="flex gap-4 mt-8">
              <button className="btn-apple-secondary flex-1" onClick={() => setIsQRModalOpen(false)}>Cerrar</button>
              <button 
                className="btn-apple-primary flex-1 flex items-center justify-center gap-2" 
                onClick={() => {
                  const svgElement = document.querySelector('#print-qr-section svg');
                  const svgOuter = svgElement ? svgElement.outerHTML : '';
                  const windowPrint = window.open('', '', 'width=800,height=600');
                  const escapeHTML = (str) => {
                    if (!str) return '';
                    return String(str).replace(/[&<>'"]/g, 
                      tag => ({
                        '&': '&amp;',
                        '<': '&lt;',
                        '>': '&gt;',
                        "'": '&#39;',
                        '"': '&quot;'
                      }[tag] || tag)
                    );
                  };
                  windowPrint.document.write(`
                    <html>
                      <head>
                        <title>Imprimir Etiqueta</title>
                        <style>
                          body { 
                            margin: 0; 
                            padding: 20px;
                            font-family: system-ui, -apple-system, sans-serif; 
                            display: flex;
                            justify-content: center;
                            background: #f0f0f0; 
                          }
                          .label-box {
                            width: 65mm;
                            height: 35mm;
                            background: #fff;
                            border: 1px dashed #ccc;
                            padding: 2mm 3mm;
                            box-sizing: border-box;
                            display: flex;
                            flex-direction: row;
                            align-items: center;
                            gap: 3mm;
                            color: #000;
                          }
                          .qr-wrapper {
                            flex-shrink: 0;
                            display: flex;
                            align-items: center;
                            justify-content: center;
                          }
                          .qr-wrapper svg {
                            width: 28mm;
                            height: 28mm;
                            display: block;
                          }
                          .text-wrapper {
                            flex: 1;
                            display: flex;
                            flex-direction: column;
                            justify-content: center;
                            min-width: 0;
                            overflow: hidden;
                          }
                          .brand {
                            font-size: 6pt;
                            font-weight: 800;
                            text-transform: uppercase;
                            margin: 0 0 2px 0;
                            letter-spacing: 0.5px;
                            color: #555;
                          }
                          .title {
                            font-size: 9pt;
                            font-weight: bold;
                            margin: 0 0 3px 0;
                            line-height: 1.1;
                            display: -webkit-box;
                            -webkit-line-clamp: 3;
                            -webkit-box-orient: vertical;
                            overflow: hidden;
                          }
                          .model {
                            font-size: 7pt;
                            color: #666;
                            margin: 0 0 4px 0;
                            white-space: nowrap;
                            overflow: hidden;
                            text-overflow: ellipsis;
                          }
                          .code {
                            font-size: 7.5pt;
                            font-family: monospace;
                            font-weight: bold;
                            margin: 0;
                            background: #eee;
                            padding: 2px 4px;
                            display: inline-block;
                            border-radius: 2px;
                            align-self: flex-start;
                          }
                          
                          @media print {
                            @page { margin: 0; size: 65mm 35mm; }
                            body { padding: 0; background: none; display: block; }
                            .label-box { border: none; width: 100%; height: 100%; page-break-inside: avoid; }
                          }
                        </style>
                      </head>
                      <body>
                        <div class="label-box">
                          <div class="qr-wrapper">
                            ${svgOuter}
                          </div>
                          <div class="text-wrapper">
                            <div class="brand">${escapeHTML(selectedTool.marca || 'GENÉRICO')}</div>
                            <div class="title">${escapeHTML(selectedTool.name)}</div>
                            ${selectedTool.modelo ? `<div class="model">Mod: ${escapeHTML(selectedTool.modelo)}</div>` : ''}
                            <div class="code">${escapeHTML(selectedTool.codigo || selectedTool.id.substring(0, 8))}</div>
                          </div>
                        </div>
                      </body>
                    </html>
                  `);
                  windowPrint.document.close();
                  windowPrint.focus();
                  setTimeout(() => {
                    windowPrint.print();
                    windowPrint.close();
                  }, 250);
                }}
              >
                <Printer size={18} /> Imprimir
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Global Personnel Datalist for all modals */}
      <datalist id="personnel-list">
        {personnel.map(p => <option key={p.id} value={p.name} />)}
      </datalist>

      {selectedImage && (
        <ImageModal 
          imageUrl={selectedImage}
          onClose={() => setSelectedImage(null)}
        />
      )}
    </main>
  );
};

export default ToolsView;
