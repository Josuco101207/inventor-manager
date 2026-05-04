import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useInventory } from '../context/InventoryContext';
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
import { List } from 'react-window';
import { exportToExcel } from '../utils/exportUtils';
import { processInventoryExcel } from '../utils/importUtils';
import { toast } from 'sonner';
import './ToolsView.css';
import './ParquesView.css';
import './InventoryView.css';

/**
 * Componente de Fila Optimizado para react-window v2.
 * Recibe props directamente (no via data).
 */
const InventoryRow = React.memo(({ index, style, items, categoryTitle, isAdmin, isStaff, canEditIn, handlers }) => {
  const item = items[index];
  if (!item) return null;

  const { handleDelete, handleEdit, handleAction, handleAudit } = handlers;

  const stockLevel = (item.qty || 0) <= (item.threshold || 0) ? 'critical' : 
                     (item.qty || 0) <= (item.threshold || 0) * 2 ? 'low' : 'optimal';

  return (
    <div style={style} className="inv-row">
      <div className="inv-row-inner">
        {/* Name + Meta */}
        <div className="inv-cell inv-cell-name">
          <div className="inv-item-avatar">
            {item.name ? item.name.charAt(0).toUpperCase() : '?'}
          </div>
          <div className="inv-item-info">
            <span className="inv-item-name">{item.name}</span>
            <div className="inv-item-meta">
              {item.subcategory && <span className="inv-tag inv-tag-blue">{item.subcategory}</span>}
              {item.marca && <span className="inv-tag inv-tag-subtle">{item.marca}</span>}
              {item.item_number && <span className="inv-tag inv-tag-mono">#{item.item_number}</span>}
            </div>
          </div>
        </div>

        {/* Location */}
        <div className="inv-cell inv-cell-location">
          <Landmark size={13} className="inv-location-icon" />
          <span>{item.location || 'General'}</span>
        </div>

        {/* Stock */}
        <div className="inv-cell inv-cell-stock">
          <div className="inv-stock-value">
            <span className="inv-stock-num">{item.qty || 0}</span>
            <span className="inv-stock-unit">{item.unit || 'pz'}</span>
          </div>
          <span className={`inv-stock-badge inv-stock-${stockLevel}`}>
            {stockLevel === 'critical' ? 'Crítico' : stockLevel === 'low' ? 'Bajo' : 'Óptimo'}
          </span>
        </div>

        {/* Min */}
        <div className="inv-cell inv-cell-min">
          <span className="inv-min-value">{item.threshold || 0}</span>
        </div>

        {/* Actions */}
        <div className="inv-cell inv-cell-actions">
          {isStaff && (
            <>
              <button className="inv-btn inv-btn-move" onClick={() => handleAction(item)} title="Movimiento">
                <Activity size={15} />
              </button>
              <button className="inv-btn inv-btn-audit" onClick={() => handleAudit(item)} title="Auditar">
                <ClipboardCheck size={15} />
              </button>
            </>
          )}
          {(isAdmin || canEditIn(categoryTitle)) && (
            <button className="inv-btn inv-btn-edit" onClick={() => handleEdit(item)} title="Editar">
              <Edit3 size={15} />
            </button>
          )}
          {isAdmin && (
            <button className="inv-btn inv-btn-delete" onClick={() => handleDelete(item)} title="Eliminar">
              <Trash2 size={15} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
});

const InventoryView = ({ categoryTitle }) => {
  const { items, personnel, updateStock, addItem, deleteItem, editItem, loanItem, returnItem, bulkAddItems, auditStock, loading, fetchMoreItems, hasMore } = useInventory();
  const { isAdmin, isStaff, userData, canAddTo, canEditIn } = useAuth();
  const location = useLocation();
  const containerRef = useRef(null);
  const [containerHeight, setContainerHeight] = useState(500);
  
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

  // Medir altura del contenedor
  useEffect(() => {
    const updateHeight = () => {
      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        setContainerHeight(Math.max(300, window.innerHeight - rect.top - 40));
      }
    };
    updateHeight();
    window.addEventListener('resize', updateHeight);
    return () => window.removeEventListener('resize', updateHeight);
  }, [loading]);

  // Inicializar Worker (solo una vez)
  useEffect(() => {
    workerRef.current = new Worker(new URL('../workers/filterWorker.js', import.meta.url));
    workerRef.current.onmessage = (e) => {
      setFilteredItems(e.data);
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

  // Disparar filtrado cuando cambian los criterios
  useEffect(() => {
    if (!workerRef.current) return;
    setIsFiltering(true);
    workerRef.current.postMessage({
      items,
      searchTerm: debouncedSearch,
      categoryTitle,
      activeSubcategory,
      selectedBrand,
      selectedLocation
    });
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
    <div className="inv-loading">
      <Loader2 className="inv-loading-spinner" size={48} />
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
        
        <div className="tools-actions">
          <div className="search-box-wrapper">
            <Search size={18} />
            <input 
              type="text" 
              placeholder="Buscar artículo..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>

          <button className="btn-scan-qr" onClick={() => exportToExcel(filteredItems, `inv_${categoryTitle}`, categoryTitle)}>
            <Download size={18} />
            <span>Exportar</span>
          </button>

          <label className="btn-scan-qr cursor-pointer">
            <Upload size={18} />
            <span>Importar</span>
            <input 
              type="file" 
              className="hidden" 
              accept=".xlsx,.xls" 
              onChange={async (e) => {
                const data = await processInventoryExcel(e.target.files[0]);
                if (data) bulkAddItems(data, categoryTitle, userData?.name || 'Admin');
              }}
            />
          </label>

          {canAddTo(categoryTitle) && (
            <button className="btn-primary-tools" onClick={() => { setSelectedItem(null); setIsAddModalOpen(true); }}>
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

      <div className="parques-container" style={{ height: 'auto', minHeight: '400px' }}>
        <div className="parques-header-row">
          <div className="col-art">Artículo / Detalle</div>
          <div className="col-stock">Stock Actual</div>
          <div className="col-ref">Ubicación</div>
          <div className="col-act">Acciones</div>
        </div>
        
        <div className="parques-body scrollbar-hide" style={{ maxHeight: '70vh', overflowY: 'auto' }}>
          {filteredItems.length > 0 ? (
            filteredItems.map((item, index) => {
              const isCritical = (item.qty || 0) <= (item.threshold || 0);
              const isLow = !isCritical && (item.qty || 0) <= (item.threshold || 0) * 1.5;
              const progress = Math.min(100, ((item.qty || 0) / ((item.threshold || 0) * 2)) * 100);
              
              return (
                <div key={item.id || index} className="parques-row">
                  <div className="col-art">
                    <div className="park-name-group">
                      <span className="park-name">{item.name}</span>
                      <div className="park-meta">
                        <span className="park-badge-sub">{item.subcategory}</span>
                        {item.marca && <span className="park-brand">{item.marca}</span>}
                      </div>
                    </div>
                  </div>

                  <div className="col-stock">
                    <div className="stock-display">
                      <div className="stock-value-group">
                        <span className={`stock-num ${isCritical ? 'text-red-500' : isLow ? 'text-orange-500' : 'text-green-500'}`}>
                          {item.qty || 0}
                        </span>
                        <span className="stock-unit">{item.unit || 'pz'}</span>
                      </div>
                      <div className="stock-progress-bg">
                        <div 
                          className={`stock-progress-bar ${isCritical ? 'bg-red-500' : isLow ? 'bg-orange-500' : 'bg-green-500'}`}
                          style={{ width: `${progress}%` }}
                        />
                      </div>
                    </div>
                  </div>

                  <div className="col-ref">
                    <div className="ref-content" style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'hsl(var(--text-muted))' }}>
                      <Landmark size={14} />
                      <span className="badge-min">{item.location || 'General'}</span>
                    </div>
                  </div>

                  <div className="col-act">
                    <div className="actions-group">
                      {isStaff && (
                        <>
                          <button className="btn-icon-action btn-icon-blue" onClick={() => handlers.handleAction(item)}>
                            <Activity size={18} />
                          </button>
                          <button className="btn-icon-action btn-icon-orange" onClick={() => handlers.handleAudit(item)}>
                            <ClipboardCheck size={18} />
                          </button>
                        </>
                      )}
                      {(isAdmin || canEditIn(categoryTitle)) && (
                        <button className="btn-icon-action btn-icon-gray" onClick={() => handlers.handleEdit(item)}>
                          <Edit3 size={18} />
                        </button>
                      )}
                      {isAdmin && (
                        <button className="btn-icon-action btn-icon-gray" onClick={() => handlers.handleDelete(item)}>
                          <Trash2 size={18} />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          ) : (
            <div className="flex flex-col items-center justify-center py-20 text-gray-400 gap-4">
              <Package size={64} className="opacity-10" />
              <p className="font-bold text-xl opacity-30">No se encontraron artículos</p>
            </div>
          )}
        </div>
      </div>

      <ActionModal 
        isOpen={isStockModalOpen} onClose={() => setIsStockModalOpen(false)} item={selectedItem}
        personnel={personnel}
        onConfirm={(id, qty, details) => { updateStock(id, qty, userData?.name || 'Admin', details); setIsStockModalOpen(false); }}
      />

      <AddItemModal 
        isOpen={isAddModalOpen} onClose={() => setIsAddModalOpen(false)} category={categoryTitle} initialData={selectedItem}
        onSave={(data) => { if (selectedItem) editItem(selectedItem.id, data, userData?.name || 'Admin'); else addItem(data, userData?.name || 'Admin'); setIsAddModalOpen(false); }}
      />
    </main>
  );
};

export default InventoryView;
