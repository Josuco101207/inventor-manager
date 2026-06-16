import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useInventory } from '../context/InventoryContextOptimized';
import { useAuth } from '../context/AuthContext';
import { useLocation } from 'react-router-dom';
import ActionModal from '../components/ActionModal';
import AddItemModal from '../components/AddItemModal';
import Header from '../components/Header';
import { 
  Plus, Download, Upload, Search, Filter, Loader2, Trash2, Edit3, 
  ClipboardCheck, Activity, Layers, Printer, ChevronDown, Landmark,
  RotateCcw, HandMetal, Package, AlertTriangle
} from 'lucide-react';
import { exportToExcel } from '../utils/exportUtils';
import { processInventoryExcel } from '../utils/importUtils';
import { toast } from 'sonner';
// Eliminada virtualización compleja para máxima compatibilidad
import './ToolsView.css'; 
import './ParquesView.css';
import './InventoryView.css';

/**
 * Componente de Fila Optimizado para react-window v2.
 * Recibe props directamente (no via data).
 */
const InventoryRow = React.memo(({ item, index, categoryTitle, isAdmin, isStaff, canEditIn, handlers }) => {
  if (!item) return null;

  const { handleDelete, handleEdit, handleAction, handleAudit } = handlers;

  const isCritical = (item.qty || 0) <= (item.threshold || 0);
  const isLow = !isCritical && (item.qty || 0) <= (item.threshold || 0) * 2;
  const stockClass = isCritical ? 'critical' : isLow ? 'low' : 'ok';

  return <div className="invt-grid-row">
      <div className="invt-card-top">
        {/* Article Info */}
        <div className="invt-cell-art">
          {item.image ? (
            <img src={item.image} alt={item.name} className="invt-avatar glass-panel" />
          ) : (
            <div className="invt-avatar glass-panel">
              {item.name.charAt(0).toUpperCase()}
            </div>
          )}
          <div className="invt-item-info">
            <h4 className="invt-item-name" title={item.name}>{item.name}</h4>
            <div className="invt-item-tags">
              <span className="invt-tag invt-tag-blue">{item.subcategory || 'GRAL'}</span>
              <span className="invt-tag invt-tag-gray">{item.brand || 'S/M'}</span>
              <span className="invt-tag invt-tag-mono">#{item.code || item.id.slice(0,6)}</span>
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
          <div className="invt-loc-text">
            <Landmark size={12} className="invt-loc-icon" />
            {item.location || 'General'}
          </div>
        </div>

        {/* Actions */}
        <div className="invt-cell-act">
          {isStaff && (
            <>
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
  const { items, personnel, updateStock, addItem, deleteItem, editItem, loanItem, returnItem, bulkAddItems, auditStock, loading, fetchMoreItems, hasMore } = useInventory();
  const { isAdmin, isStaff, userData, canAddTo, canEditIn } = useAuth();
  const location = useLocation();
  const [visibleCount, setVisibleCount] = useState(40);
  const observerTarget = useRef(null);
  
  // Estados de UI
  const [selectedItem, setSelectedItem] = useState(null);
  const [isStockModalOpen, setIsStockModalOpen] = useState(false);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState(location.state?.prefillSearch || '');
  const [debouncedSearch, setDebouncedSearch] = useState(searchTerm);
  const [activeSubcategory, setActiveSubcategory] = useState('TODAS');
  const [selectedBrand, setSelectedBrand] = useState('Todas');
  const [selectedLocation, setSelectedLocation] = useState('Todas');
  
  // Estado para items filtrados (vía Worker)
  const [filteredItems, setFilteredItems] = useState([]);
  const [isFiltering, setIsFiltering] = useState(false);
  const workerRef = useRef(null);

  // Infinite Scroll Observer
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          setVisibleCount(prev => Math.min(prev + 40, filteredItems.length));
        }
      },
      { threshold: 0.1, rootMargin: '200px' }
    );
    if (observerTarget.current) observer.observe(observerTarget.current);
    return () => observer.disconnect();
  }, [filteredItems.length]);

  // Inicializar Worker (solo una vez)
  useEffect(() => {
    workerRef.current = new Worker(new URL('../workers/filterWorker.js', import.meta.url));
    workerRef.current.onmessage = (e) => {
      setFilteredItems(e.data);
      setVisibleCount(40); // Reset al filtrar
      setIsFiltering(false);
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

  // Disparar filtrado cuando cambian los criterios (con pequeño debounce para evitar saturación)
  useEffect(() => {
    if (!workerRef.current) return;
    
    const filterTimer = setTimeout(() => {
      setIsFiltering(true);
      workerRef.current.postMessage({
        items,
        searchTerm: debouncedSearch,
        categoryTitle,
        activeSubcategory,
        selectedBrand,
        selectedLocation
      });
    }, 50); // Mínimo delay para agrupar actualizaciones rápidas de Firestore
    
    return () => clearTimeout(filterTimer);
  }, [items, debouncedSearch, categoryTitle, activeSubcategory, selectedBrand, selectedLocation]);

  const subcategories = useMemo(() => [
    'TODAS', 
    ...new Set(items.filter(i => i.category === categoryTitle && i.subcategory).map(i => i.subcategory))
  ].sort(), [items, categoryTitle]);

  // Handlers estables para evitar re-renders en filas virtualizadas
  const handlers = useMemo(() => ({
    handleDelete: (item) => { if (window.confirm(`¿Eliminar "${item.name}"?`)) deleteItem(item.id, userData?.name || 'Admin'); },
    handleEdit: (item) => { setSelectedItem(item); setIsAddModalOpen(true); },
    handleAction: (item) => { setSelectedItem(item); setIsStockModalOpen(true); },
    handleAudit: (item) => { setSelectedItem(item); /* setIsAuditModalOpen(true); */ },
    handleLoan: (item) => { setSelectedItem(item); },
    handleReturn: async (item) => { if (window.confirm(`¿Devolución de ${item.name}?`)) await returnItem(item.id, userData?.name || 'Admin'); }
  }), [deleteItem, returnItem, userData]);

  const rowData = useMemo(() => ({
    items: filteredItems,
    categoryTitle,
    isAdmin,
    isStaff,
    canEditIn,
    handlers
  }), [filteredItems, categoryTitle, isAdmin, isStaff, canEditIn, handlers]);

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

  return (
    <main className="tools-view animate-fade-in relative min-h-screen">
      <Header />
      
      <header className="tools-header mb-8">
        <div className="tools-title-group">
          <h2>{categoryTitle}</h2>
          <p>Control de suministros • {stats.total} artículos ({stats.filtered} filtrados)</p>
        </div>
        
        <div className="dash-cat-scroll" style={{ padding: '0', margin: '0 0 1rem 0' }}>
          <div className="search-box-wrapper" style={{ flex: '1 1 auto', minWidth: '200px' }}>
            <Search size={18} />
            <input 
              type="text" 
              placeholder="Buscar artículo..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>

          <button className="btn-scan-qr" style={{ padding: '0.75rem 1rem' }} onClick={() => exportToExcel(filteredItems, `inv_${categoryTitle}_filtrado`, categoryTitle)}>
            <Filter size={18} />
            <span className="desktop-only-text">Filtrados</span>
          </button>

          <button className="btn-scan-qr" style={{ padding: '0.75rem 1rem' }} onClick={() => {
            const allItems = items.filter(i => i.category === categoryTitle);
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
                if (data) bulkAddItems(data, categoryTitle, userData?.name || 'Jonathan');
              }}
            />
          </label>

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

      {isFiltering && (
        <div className="parques-loading-overlay">
          <Loader2 className="animate-spin" size={32} />
        </div>
      )}

      <div className="invt-container">
        <div className="invt-grid-row invt-header-row">
          <div>Artículo / Detalle</div>
          <div style={{ textAlign: 'center' }}>Stock Actual</div>
          <div style={{ textAlign: 'center' }}>Referencia</div>
          <div style={{ textAlign: 'right' }}>Acciones</div>
        </div>
        
        <div className="invt-body">
          {filteredItems.length > 0 ? (
            <>
              {filteredItems.slice(0, visibleCount).map((item, index) => (
                <InventoryRow 
                  key={item.id}
                  item={item}
                  index={index} 
                  categoryTitle={rowData.categoryTitle}
                  isAdmin={rowData.isAdmin}
                  isStaff={rowData.isStaff}
                  canEditIn={rowData.canEditIn}
                  handlers={rowData.handlers}
                />
              ))}

              {visibleCount < filteredItems.length && (
                <div ref={observerTarget} style={{ display: 'flex', justifyContent: 'center', padding: '2.5rem 0' }}>
                  <Loader2 className="animate-spin" style={{ color: 'hsl(var(--primary))' }} size={32} />
                </div>
              )}
            </>
          ) : (
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
        onConfirm={(id, qty, details) => { updateStock(id, qty, userData?.name || 'Jonathan', details); setIsStockModalOpen(false); }}
      />

      <AddItemModal 
        isOpen={isAddModalOpen} onClose={() => setIsAddModalOpen(false)} category={categoryTitle} initialData={selectedItem}
        onSave={(data) => { if (selectedItem) editItem(selectedItem.id, data, userData?.name || 'Jonathan'); else addItem(data, userData?.name || 'Jonathan'); setIsAddModalOpen(false); }}
      />

      {/* Floating Action Button for Mobile */}
      {canAddTo(categoryTitle) && (
        <button className="mobile-fab" onClick={() => { setSelectedItem(null); setIsAddModalOpen(true); }}>
          <Plus size={28} />
        </button>
      )}
    </main>
  );
};

export default InventoryView;
