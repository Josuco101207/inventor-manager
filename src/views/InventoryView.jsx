import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useInventory } from '../context/InventoryContextOptimized';
import { useCustomCategories } from '../context/CustomCategoriesContext';
import { useAuth } from '../context/AuthContext';
import { useLocation } from 'react-router-dom';
import { createPortal } from 'react-dom';
import { QRCodeSVG } from 'qrcode.react';
import ActionModal from '../components/ActionModal';
import AddItemModal from '../components/AddItemModal';
import ImageModal from '../components/ImageModal';
import AuditModal from '../components/AuditModal';
import TransferModal from '../components/TransferModal';
import MoveSectionModal from '../components/MoveSectionModal';
import BulkActionModal from '../components/BulkActionModal';
import BulkMoveSectionModal from '../components/BulkMoveSectionModal';
import Header from '../components/Header';
import { 
  Plus, Download, Upload, Search, Filter, Loader2, Trash2, Edit3, 
  ClipboardCheck, Activity, Layers, Printer, ChevronDown, Landmark,
  RotateCcw, HandMetal, Package, AlertTriangle, MapPin, ArrowRight, ArrowRightLeft, ArrowDownCircle, X, QrCode
} from 'lucide-react';
import { processInventoryExcel, HEADER_MAP } from '../utils/importUtils';
import { toast } from 'sonner';
import { Virtuoso } from 'react-virtuoso';
// Eliminada virtualización compleja para máxima compatibilidad
import './ToolsView.css'; 
import './ParquesView.css';
import './InventoryView.css';

/**
 * Componente de Fila Optimizado para react-window v2.
 * Recibe props directamente (no via data).
 */
const InventoryRow = React.memo(({ item, index, categoryTitle, isAdmin, isStaff, canEditIn, handlers, isDynamicCategory, customCategories, setSelectedImage, isSelected, onToggleSelect }) => {
  if (!item) return null;

  const { handleDelete, handleEdit, handleAction, handleAudit, handleQR } = handlers;

  const isCritical = (item.qty || 0) <= (item.threshold || 0);
  const isLow = !isCritical && (item.qty || 0) <= (item.threshold || 0) * 2;
  const stockClass = isCritical ? 'critical' : isLow ? 'low' : 'ok';

  const customCat = isDynamicCategory ? customCategories?.find(c => c.name === categoryTitle) : null;
  const configuredFields = customCat?.fields?.map(f => f.name) || [];

  // Identify custom fields dynamically (fallback for standard categories that might have extra props)
  const standardKeys = ['id', 'name', 'category', 'subcategory', 'brand', 'location', 'code', 'qty', 'threshold', 'unit', 'observaciones', 'image', 'date', 'createdBy', 'timestamp', 'lastAudit', 'searchKeywords'];
  const legacyCustomFields = Object.keys(item).filter(key => !standardKeys.includes(key) && item[key] !== '' && item[key] !== null && typeof item[key] !== 'object');
  
  // Helper para buscar un campo. Si no existe como 'Item Number', buscar como 'item_number' (HEADER_MAP)
  const getFieldValue = (key) => {
    if (item[key] !== undefined && item[key] !== '' && item[key] !== null) return item[key];
    const mappedKey = HEADER_MAP[key];
    if (mappedKey && item[mappedKey] !== undefined && item[mappedKey] !== '' && item[mappedKey] !== null) return item[mappedKey];
    return undefined;
  };

  // Si es categoría dinámica, SOLO mostrar los campos configurados. Si es normal, no mostrar los campos basuras de excel en la tarjeta
  const fieldsToRender = isDynamicCategory ? configuredFields.filter(key => getFieldValue(key) !== undefined) : [];

  return <div className={`invt-grid-row ${isSelected ? 'bg-[rgba(168,85,247,0.05)] border-l-2 border-l-purple-500' : ''}`} onClick={() => isStaff && onToggleSelect(item.id)}>
      <div className="invt-card-top">
        {/* Article Info */}
        <div className="invt-cell-art" style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          {isStaff && (
            <input 
              type="checkbox" 
              className="cursor-pointer w-4 h-4 accent-purple-500 flex-shrink-0" 
              checked={isSelected}
              onChange={(e) => { e.stopPropagation(); onToggleSelect(item.id); }}
              onClick={(e) => e.stopPropagation()}
            />
          )}
          {item.image ? (
            <img src={item.image} alt={item.name} loading="lazy" className="invt-avatar glass-panel" style={{ cursor: 'pointer' }} onClick={(e) => { e.stopPropagation(); setSelectedImage(item.image); }} />
          ) : (
            <div className="invt-avatar glass-panel">
              {item.name.charAt(0).toUpperCase()}
            </div>
          )}
          <div className="invt-item-info">
            <h4 className="invt-item-name" title={item.name}>{item.name}</h4>
            <div className="invt-item-tags">
              {!isDynamicCategory && <span className="invt-tag invt-tag-blue">{item.subcategory || 'GRAL'}</span>}
              {!isDynamicCategory && <span className="invt-tag invt-tag-gray">{item.brand || 'S/M'}</span>}
              {!isDynamicCategory && <span className="invt-tag invt-tag-mono">#{item.code || item.id.slice(0,6)}</span>}
              
              {/* Dynamic Custom Fields */}
              {fieldsToRender.map(key => {
                const label = isDynamicCategory ? (customCat?.fields?.find(f => f.name === key)?.label || key) : key;
                let value = getFieldValue(key);
                if (typeof value === 'boolean') value = value ? 'Sí' : 'No';
                
                return (
                  <span key={key} className="invt-tag" style={{ background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)', color: 'var(--text-color)' }}>
                    {label.charAt(0).toUpperCase() + label.slice(1)}: <strong>{value}</strong>
                  </span>
                );
              })}
            </div>
            {item.observaciones && (
              <p className="invt-item-obs" title={item.observaciones}>
                {item.observaciones}
              </p>
            )}
          </div>
        </div>

        {/* Stock & Progress Bar */}
        <div className="invt-cell-stock">
            <div className="invt-stock-row">
              <span className={`invt-stock-num stock-${stockClass}`}>{item.qty || 0}</span>
              <span className="invt-stock-unit">{item.unit || 'pz'}</span>
            </div>
            <div className="invt-stock-progress-container">
              <div className="invt-stock-bar-bg">
                <div 
                  className={`invt-stock-bar bar-${stockClass}`}
                  style={{ width: `${Math.min(((item.qty || 0) / Math.max((item.threshold || 1) * 3, 1)) * 100, 100)}%` }}
                />
              </div>
              <span className="invt-stock-min-text">Stock Mínimo: {item.threshold || 0}</span>
            </div>
          </div>
        </div>

      <div className="invt-card-divider"></div>

      <div className="invt-card-bottom">
        {/* Referencia (Location + Min) */}
        <div className="invt-cell-ref">
            <span className="invt-badge-min">Mín: {item.threshold || 0}</span>
          </div>
        {/* Actions */}
        <div className="invt-cell-act" style={{ marginLeft: '0' }}>
          {isStaff && (
            <>
              <button className="invt-btn invt-btn-dark" onClick={() => handlers.handleMoveSection(item)} title="Cambiar de Sección">
                <ArrowRight size={14} className="icon-purple" />
              </button>
              <button className="invt-btn invt-btn-dark" onClick={() => handlers.handleTransfer(item)} title="Transferir de Ubicación">
                <RotateCcw size={14} className="icon-purple" />
              </button>
              <button className="invt-btn invt-btn-dark" onClick={() => handleAction(item)} title="Movimiento">
                <Activity size={14} className="icon-blue" />
              </button>
              <button className="invt-btn invt-btn-dark" onClick={() => handleAudit(item)} title="Auditar">
                <ClipboardCheck size={14} className="icon-orange" />
              </button>
            </>
          )}
          {(isAdmin || canEditIn(categoryTitle)) && (
            <button className="invt-btn invt-btn-dark" onClick={() => handleEdit(item)} title="Editar">
              <Edit3 size={14} className="icon-gray" />
            </button>
          )}
          <button className="invt-btn invt-btn-dark" onClick={() => handleQR(item)} title="Código QR">
            <QrCode size={14} style={{ color: '#aaa' }} />
          </button>
          {isAdmin && (
            <button className="invt-btn invt-btn-dark" onClick={() => handleDelete(item)} title="Eliminar">
              <Trash2 size={14} className="icon-red" />
            </button>
          )}
        </div>
      </div>
    </div>;
});

const InventoryView = ({ categoryTitle }) => {
  const { items, personnel, updateStock, addItem, deleteItem, editItem, loanItem, returnItem, bulkAddItems, auditStock, loading, fetchMoreItems, hasMore, transferStock, moveItemToSection, bulkUpdateStock, bulkMoveSection } = useInventory();
  const { customCategories } = useCustomCategories();
  const { isAdmin, isStaff, userData, canAddTo, canEditIn } = useAuth();
  const location = useLocation();
  // Estados de UI
  const [selectedItem, setSelectedItem] = useState(null);
  const [selectedImage, setSelectedImage] = useState(null);
  const [isStockModalOpen, setIsStockModalOpen] = useState(false);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isAuditModalOpen, setIsAuditModalOpen] = useState(false);
  const [isTransferModalOpen, setIsTransferModalOpen] = useState(false);
  const [isMoveSectionModalOpen, setIsMoveSectionModalOpen] = useState(false);
  const [isBulkActionModalOpen, setIsBulkActionModalOpen] = useState(false);
  const [isBulkTransferModalOpen, setIsBulkTransferModalOpen] = useState(false);
  const [isQRModalOpen, setIsQRModalOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState(location.state?.prefillSearch || '');
  const [debouncedSearch, setDebouncedSearch] = useState(searchTerm);
  const [activeSubcategory, setActiveSubcategory] = useState('TODAS');
  const [selectedBrand, setSelectedBrand] = useState('Todas');
  const [selectedLocation, setSelectedLocation] = useState('Todas');
  
  // Estado para selección múltiple
  const [selectedItems, setSelectedItems] = useState(new Set());
  
  // Estado para items filtrados (vía Worker)
  const [filteredItems, setFilteredItems] = useState([]);
  const workerRef = useRef(null);

  const [scrollParent, setScrollParent] = useState(null);
  useEffect(() => {
    setScrollParent(document.querySelector('.main-content'));
  }, []);

  // Inicializar Worker (solo una vez)
  useEffect(() => {
    workerRef.current = new Worker(new URL('../workers/filterWorker.js', import.meta.url));
    workerRef.current.onmessage = (e) => {
      setFilteredItems(e.data);
    };
    return () => workerRef.current.terminate();
  }, []);

  // Debounce search term to avoid excessive worker calls
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchTerm);
    }, 150);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  // Reset count on filter change
  useEffect(() => {
    setSelectedItems(new Set()); // Limpiar selección al cambiar de categoría/filtros
  }, [activeSubcategory, selectedBrand, selectedLocation, categoryTitle, debouncedSearch]);

  // Enviar INIT cuando cambia el inventario completo
  useEffect(() => {
    if (workerRef.current && items) {
      workerRef.current.postMessage({ type: 'INIT', items });
    }
  }, [items]);

  // Disparar filtrado cuando cambian los criterios o los datos base
  useEffect(() => {
    if (!workerRef.current) return;
    
    const filterTimer = setTimeout(() => {
      workerRef.current.postMessage({
        type: 'FILTER',
        searchTerm: debouncedSearch,
        categoryTitle,
        activeSubcategory,
        selectedBrand,
        selectedLocation
      });
    }, 50);
    
    return () => clearTimeout(filterTimer);
  }, [debouncedSearch, categoryTitle, activeSubcategory, selectedBrand, selectedLocation, items]);

  const subcategories = useMemo(() => [
    'TODAS', 
    ...new Set(items.filter(i => i.category === categoryTitle && i.subcategory).map(i => i.subcategory))
  ].sort(), [items, categoryTitle]);

  // Handlers estables para evitar re-renders en filas virtualizadas
  const handlers = useMemo(() => ({
    handleDelete: (item) => { if (window.confirm(`¿Eliminar "${item.name}"?`)) deleteItem(item.id, userData?.name || 'Admin'); },
    handleEdit: (item) => { setSelectedItem(item); setIsAddModalOpen(true); },
    handleAction: (item) => { setSelectedItem(item); setIsStockModalOpen(true); },
    handleAudit: (item) => { setSelectedItem(item); setIsAuditModalOpen(true); },
    handleTransfer: (item) => { setSelectedItem(item); setIsTransferModalOpen(true); },
    handleMoveSection: (item) => { setSelectedItem(item); setIsMoveSectionModalOpen(true); },
    handleLoan: (item) => { setSelectedItem(item); },
    handleReturn: async (item) => { if (window.confirm(`¿Devolución de ${item.name}?`)) await returnItem(item.id, userData?.name || 'Admin'); },
    handleQR: (item) => { setSelectedItem(item); setIsQRModalOpen(true); }
  }), [deleteItem, returnItem, userData]);

  const rowData = useMemo(() => ({
    items: filteredItems,
    categoryTitle,
    isAdmin,
    isStaff,
    canEditIn,
    handlers
  }), [filteredItems, categoryTitle, isAdmin, isStaff, canEditIn, handlers]);

  // Toggle single item selection
  const handleToggleSelect = useCallback((itemId) => {
    setSelectedItems(prev => {
      const next = new Set(prev);
      if (next.has(itemId)) next.delete(itemId);
      else next.add(itemId);
      return next;
    });
  }, []);

  // Select/Deselect all visible filtered items
  const handleSelectAll = useCallback((e) => {
    if (e.target.checked) {
      const allIds = filteredItems.map(i => i.id);
      setSelectedItems(new Set(allIds));
    } else {
      setSelectedItems(new Set());
    }
  }, [filteredItems]);

  const isAllSelected = filteredItems.length > 0 && selectedItems.size === filteredItems.length;

  // Stats summary
  const stats = useMemo(() => {
    const catItems = items.filter(i => i.category === categoryTitle);
    const critical = catItems.filter(i => (i.qty || 0) <= (i.threshold || 0));
    return { total: catItems.length, filtered: filteredItems.length, critical: critical.length };
  }, [items, filteredItems, categoryTitle]);

  if (loading) return (
    <div className="invt-loading">
      <Loader2 className="invt-loading-spinner" size={48} />
      <p>Cargando inventario...</p>
    </div>
  );

  const isDynamicCategory = customCategories?.some(c => c.name === categoryTitle);

  return (
    <main className="tools-view animate-fade-in relative min-h-screen">
      <Header />
      
      <header className="tools-header mb-8">
        <div className="tools-title-group">
          <h2>{categoryTitle}</h2>
          <p>Control de suministros • {stats.total} artículos ({stats.filtered} filtrados)</p>
        </div>
        
        <div className="tools-actions" style={{ width: '100%' }}>
          <div className="search-box-wrapper" style={{ flex: '1 1 auto' }}>
            <Search size={18} />
            <input 
              type="text" 
              placeholder="Buscar artículo..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <div className="action-buttons-group">
            <button className="btn-scan-qr" style={{ padding: '0.75rem 1rem' }} onClick={async () => {
              const { exportToExcel } = await import('../utils/exportUtils');
              exportToExcel(filteredItems, `inv_${categoryTitle}_filtrado`, categoryTitle);
            }}>
              <Filter size={18} />
              <span className="desktop-only-text">Filtrados</span>
            </button>

            <button className="btn-scan-qr" style={{ padding: '0.75rem 1rem' }} onClick={async () => {
              const allItems = items.filter(i => i.category === categoryTitle);
              const { exportToExcel } = await import('../utils/exportUtils');
              exportToExcel(allItems, `inv_${categoryTitle}_total`, categoryTitle);
            }}>
              <Download size={18} />
              <span className="desktop-only-text">Exportar Todo</span>
            </button>

            <label className="btn-scan-qr cursor-pointer" style={{ padding: '0.75rem 1rem' }}>
              <Upload size={18} />
              <span className="desktop-only-text">Importar</span>
              <input 
                type="file" 
                className="hidden" 
                accept=".xlsx,.xls" 
                onChange={async (e) => {
                  const data = await processInventoryExcel(e.target.files[0]);
                  if (data) bulkAddItems(data, categoryTitle, userData?.name || 'Desconocido');
                }}
              />
            </label>
          </div>

          {canAddTo(categoryTitle) && (
            <button className="btn-primary-tools desktop-only-btn" onClick={() => { setSelectedItem(null); setIsAddModalOpen(true); }}>
              <Plus size={18} />
              <span>Nuevo</span>
            </button>
          )}
        </div>
      </header>

      {subcategories.length > 1 && (
        <div className="subcat-nav-wrapper">
          <button 
            className="subcat-nav-btn left" 
            onClick={() => {
              const el = document.querySelector('.subcat-pills');
              el.scrollBy({ left: -200, behavior: 'smooth' });
            }}
          >
            <ChevronDown size={20} style={{ transform: 'rotate(90deg)' }} />
          </button>
          
          <div className="subcat-pills scrollbar-hide">
            {subcategories.map(sub => (
              <button
                key={sub}
                onClick={() => setActiveSubcategory(sub)}
                className={`pill ${activeSubcategory === sub ? 'active' : ''}`}
              >
                {sub === 'TODAS' ? 'Todas las Categorías' : sub}
              </button>
            ))}
          </div>

          <button 
            className="subcat-nav-btn right" 
            onClick={() => {
              const el = document.querySelector('.subcat-pills');
              el.scrollBy({ left: 200, behavior: 'smooth' });
            }}
          >
            <ChevronDown size={20} style={{ transform: 'rotate(-90deg)' }} />
          </button>
        </div>
      )}

      <div className="invt-container">
        <div className="invt-grid-row invt-header-row">
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            {isStaff && (
              <input 
                type="checkbox" 
                className="cursor-pointer w-4 h-4 accent-purple-500"
                checked={isAllSelected}
                onChange={handleSelectAll}
                title="Seleccionar todos"
              />
            )}
            Artículo / Detalle
          </div>
          <div style={{ textAlign: 'center' }}>Stock Actual</div>
          <div style={{ textAlign: 'center' }}>Referencia</div>
          <div style={{ textAlign: 'right' }}>Acciones</div>
        </div>
        
        <div className="invt-body">
          {filteredItems.length > 0 ? (
            <>
              <Virtuoso 
                customScrollParent={scrollParent}
                data={filteredItems}
                itemContent={(index, item) => (
                  <InventoryRow 
                    key={item.id}
                    item={item}
                    index={index} 
                    categoryTitle={rowData.categoryTitle}
                    isAdmin={rowData.isAdmin}
                    isStaff={rowData.isStaff}
                    canEditIn={rowData.canEditIn}
                    handlers={rowData.handlers}
                    isDynamicCategory={isDynamicCategory}
                    customCategories={customCategories}
                    setSelectedImage={setSelectedImage}
                    isSelected={selectedItems.has(item.id)}
                    onToggleSelect={handleToggleSelect}
                  />
                )}
              />
            </>
          ) : (
            <div className="invt-empty-state">
              <div className="invt-empty-icon-wrap">
                <Package size={48} />
              </div>
              <h3>No se encontraron artículos</h3>
              <p>Intenta ajustar tus filtros de búsqueda o agrega un nuevo artículo a esta sección.</p>
            </div>
          )}
        </div>
      </div>

      <ActionModal 
        isOpen={isStockModalOpen} onClose={() => setIsStockModalOpen(false)} item={selectedItem}
        personnel={personnel}
        onConfirm={(id, qty, details, locationName) => { updateStock(id, qty, userData?.name || 'Desconocido', details, locationName); setIsStockModalOpen(false); }}
      />

      <TransferModal
        isOpen={isTransferModalOpen} onClose={() => setIsTransferModalOpen(false)} item={selectedItem}
        onConfirm={(id, qty, from, to, details) => { transferStock(id, qty, from, to, userData?.name || 'Desconocido', details); setIsTransferModalOpen(false); }}
      />

      <MoveSectionModal
        isOpen={isMoveSectionModalOpen} onClose={() => setIsMoveSectionModalOpen(false)} item={selectedItem}
        onConfirm={(id, targetSection) => { moveItemToSection(id, targetSection, userData?.name || 'Desconocido'); setIsMoveSectionModalOpen(false); }}
      />

      <BulkActionModal
        isOpen={isBulkActionModalOpen} onClose={() => setIsBulkActionModalOpen(false)} 
        items={items.filter(i => selectedItems.has(i.id))} personnel={personnel}
        onConfirm={(quantitiesObj, details, locationName) => { bulkUpdateStock(quantitiesObj, userData?.name || 'Desconocido', details, locationName); setIsBulkActionModalOpen(false); setSelectedItems(new Set()); }}
      />

      <BulkMoveSectionModal
        isOpen={isBulkTransferModalOpen} onClose={() => setIsBulkTransferModalOpen(false)} 
        items={items.filter(i => selectedItems.has(i.id))}
        onConfirm={(itemIds, targetSection) => { bulkMoveSection(itemIds, targetSection, userData?.name || 'Desconocido'); setIsBulkTransferModalOpen(false); setSelectedItems(new Set()); }}
      />

      <AuditModal 
        isOpen={isAuditModalOpen} onClose={() => setIsAuditModalOpen(false)} item={selectedItem}
        onConfirm={(id, physicalQty, reason) => { auditStock(id, physicalQty, userData?.name || 'Desconocido', reason); setIsAuditModalOpen(false); }}
      />

      <AddItemModal 
        isOpen={isAddModalOpen} onClose={() => setIsAddModalOpen(false)} category={categoryTitle} initialData={selectedItem}
        onSave={(data) => { if (selectedItem) editItem(selectedItem.id, data, userData?.name || 'Desconocido'); else addItem(data, userData?.name || 'Desconocido'); setIsAddModalOpen(false); }}
      />

      {/* Floating Action Button for Mobile */}
      {canAddTo(categoryTitle) && (
        <button className="mobile-fab" onClick={() => { setSelectedItem(null); setIsAddModalOpen(true); }}>
          <Plus size={28} />
        </button>
      )}

      {selectedImage && (
        <ImageModal 
          imageUrl={selectedImage}
          onClose={() => setSelectedImage(null)}
        />
      )}

      {/* Floating Bulk Action Bar */}
      {selectedItems.size > 0 && isStaff && (
        <div className="invt-bulk-bar">
          <span className="invt-bulk-count">{selectedItems.size} seleccionados</span>
          
          <button 
            className="invt-bulk-btn danger"
            onClick={() => setIsBulkActionModalOpen(true)}
          >
            <ArrowDownCircle size={16} /> Sacar Lote
          </button>
          
          <button 
            className="invt-bulk-btn primary"
            onClick={() => setIsBulkTransferModalOpen(true)}
          >
            <ArrowRightLeft size={16} /> Mover a Sección
          </button>
          
          <div className="w-px h-6 bg-white/10 mx-1"></div>
          
          <button 
            className="invt-bulk-close"
            onClick={() => setSelectedItems(new Set())}
            title="Cancelar selección"
          >
            <X size={18} />
          </button>
        </div>
      )}

      {isQRModalOpen && selectedItem && createPortal(
        <div className="modal-overlay">
          <div className="modal-card animate-scale-up qr-modal-content">
            <button className="absolute top-4 right-4 text-gray-400 hover:text-gray-800" onClick={() => setIsQRModalOpen(false)}>
              <X size={24} />
            </button>
            
            <div className="qr-large-wrapper" id="print-qr-section">
              <QRCodeSVG value={selectedItem.code || selectedItem.codigo || selectedItem.id} size={200} level="H" includeMargin={true} />
              <p className="mt-4 font-bold text-gray-800 text-lg">{selectedItem.name}</p>
              <p className="text-gray-500 font-mono">{selectedItem.code || selectedItem.codigo || selectedItem.id}</p>
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
                          body { margin: 0; padding: 20px; font-family: system-ui, -apple-system, sans-serif; display: flex; justify-content: center; background: #f0f0f0; }
                          .label-box { width: 65mm; height: 35mm; background: #fff; border: 1px dashed #ccc; padding: 2mm 3mm; box-sizing: border-box; display: flex; flex-direction: row; align-items: center; gap: 3mm; color: #000; }
                          .qr-wrapper { flex-shrink: 0; display: flex; align-items: center; justify-content: center; }
                          .qr-wrapper svg { width: 28mm; height: 28mm; display: block; }
                          .text-wrapper { flex: 1; display: flex; flex-direction: column; justify-content: center; min-width: 0; overflow: hidden; }
                          .brand { font-size: 6pt; font-weight: 800; text-transform: uppercase; margin: 0 0 2px 0; letter-spacing: 0.5px; color: #555; }
                          .title { font-size: 9pt; font-weight: bold; margin: 0 0 3px 0; line-height: 1.1; display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; }
                          .model { font-size: 7pt; color: #666; margin: 0 0 4px 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
                          .code { font-size: 7.5pt; font-family: monospace; font-weight: bold; margin: 0; background: #eee; padding: 2px 4px; display: inline-block; border-radius: 2px; align-self: flex-start; }
                          @media print { @page { margin: 0; size: 65mm 35mm; } body { padding: 0; background: none; display: block; } .label-box { border: none; width: 100%; height: 100%; page-break-inside: avoid; } }
                        </style>
                      </head>
                      <body>
                        <div class="label-box">
                          <div class="qr-wrapper">
                            ${svgOuter}
                          </div>
                          <div class="text-wrapper">
                            <div class="brand">${escapeHTML(selectedItem.brand || selectedItem.marca || 'GENÉRICO')}</div>
                            <div class="title">${escapeHTML(selectedItem.name)}</div>
                            ${(selectedItem.model || selectedItem.modelo) ? `<div class="model">Mod: ${escapeHTML(selectedItem.model || selectedItem.modelo)}</div>` : ''}
                            <div class="code">${escapeHTML(selectedItem.code || selectedItem.codigo || selectedItem.id.substring(0, 8))}</div>
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

    </main>
  );
};

export default InventoryView;
