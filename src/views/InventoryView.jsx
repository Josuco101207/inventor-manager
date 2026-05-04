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
    <main className="inv-view">
      <Header />
      
      {/* Header Section */}
      <header className="inv-header">
        <div className="inv-header-left">
          <h1 className="inv-title">{categoryTitle}</h1>
          <p className="inv-subtitle">{stats.total} artículos en total</p>
        </div>
        <div className="inv-header-actions">
          {canAddTo(categoryTitle) && (
            <button className="inv-btn-primary" onClick={() => { setSelectedItem(null); setIsAddModalOpen(true); }}>
              <Plus size={18} /> Nuevo Artículo
            </button>
          )}
          <button className="inv-btn-secondary" onClick={() => exportToExcel(filteredItems, `inv_${categoryTitle}`, categoryTitle)}>
            <Download size={18} /> Exportar
          </button>
        </div>
      </header>

      {/* Stats Bar */}
      <div className="inv-stats-bar">
        <div className="inv-stat">
          <Package size={16} />
          <span className="inv-stat-value">{stats.filtered}</span>
          <span className="inv-stat-label">Resultados</span>
        </div>
        {stats.critical > 0 && (
          <div className="inv-stat inv-stat-warning">
            <AlertTriangle size={16} />
            <span className="inv-stat-value">{stats.critical}</span>
            <span className="inv-stat-label">Stock Crítico</span>
          </div>
        )}
      </div>

      {/* Search & Filters */}
      <div className="inv-toolbar">
        <div className="inv-search">
          <Search size={18} className="inv-search-icon" />
          <input 
            type="text" 
            placeholder="Buscar por nombre, código, marca..." 
            value={searchTerm} 
            onChange={(e) => setSearchTerm(e.target.value)} 
            autoFocus
          />
        </div>
        {subcategories.length > 2 && (
          <div className="inv-filter">
            <Filter size={16} />
            <select value={activeSubcategory} onChange={(e) => setActiveSubcategory(e.target.value)}>
              {subcategories.map(sub => <option key={sub} value={sub}>{sub}</option>)}
            </select>
            <ChevronDown size={14} className="inv-filter-chevron" />
          </div>
        )}
      </div>

      {/* Table */}
      <div className="inv-table-wrapper">
        {/* Table Header */}
        <div className="inv-table-head">
          <div className="inv-th inv-th-name">Artículo</div>
          <div className="inv-th inv-th-location">Ubicación</div>
          <div className="inv-th inv-th-stock">Stock</div>
          <div className="inv-th inv-th-min">Mín</div>
          <div className="inv-th inv-th-actions">Acciones</div>
        </div>

        {/* Virtual List */}
        <div className="inv-table-body" ref={containerRef}>
          {filteredItems.length > 0 ? (
            <List
              style={{ height: containerHeight, width: '100%' }}
              rowCount={filteredItems.length}
              rowHeight={72}
              rowProps={rowData}
              rowComponent={InventoryRow}
              overscanCount={8}
              onRowsRendered={({ stopIndex }) => {
                if (stopIndex >= filteredItems.length - 10 && hasMore) {
                  fetchMoreItems();
                }
              }}
            />
          ) : (
            <div className="inv-empty">
              <Layers size={56} />
              <h3>Sin resultados</h3>
              <p>No se encontraron artículos con los filtros actuales.</p>
            </div>
          )}
        </div>
      </div>

      {/* Modals */}
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
