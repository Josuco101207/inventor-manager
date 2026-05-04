import React, { useState } from 'react';
import { useInventory } from '../context/InventoryContext';
import { useAuth } from '../context/AuthContext';
import { useLocation } from 'react-router-dom';
import ActionModal from '../components/ActionModal';
import AddItemModal from '../components/AddItemModal';
import { Plus, Download, Upload, Search, Loader2, Trash2, Edit3, AlertTriangle, ClipboardCheck, X, Check, FileSpreadsheet, Layers, Activity, Filter, ChevronDown } from 'lucide-react';
import { exportToExcel } from '../utils/exportUtils';
import { processParquesExcel } from '../utils/importUtils';
import { toast } from 'sonner';
import './InventoryView.css';

const ParquesView = () => {
  const { items, brands, updateStock, addItem, deleteItem, editItem, bulkAddItems, auditStock, deleteItemsByCategory, loading } = useInventory();
  const { isAdmin, isStaff, userData, canAddTo, canEditIn } = useAuth();
  const location = useLocation();
  const [selectedItem, setSelectedItem] = useState(null);
  const [isStockModalOpen, setIsStockModalOpen] = useState(false);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isAuditModalOpen, setIsAuditModalOpen] = useState(false);
  const [physicalCount, setPhysicalCount] = useState('');
  const [auditReason, setAuditReason] = useState('');
  const [isImporting, setIsImporting] = useState(false);
  const [searchTerm, setSearchTerm] = useState(location.state?.prefillSearch || '');
  const [activeSubcategory, setActiveSubcategory] = useState('TODAS');
  const [selectedBrand, setSelectedBrand] = useState('Todas');
  const [importSummary, setImportSummary] = useState(null);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full w-full flex-col gap-4">
        <Loader2 className="animate-spin text-primary" size={48} />
        <p className="text-muted font-bold">Cargando inventario de Parques...</p>
      </div>
    );
  }

  const parquesItems = items.filter(item => item.category === 'Parques');
  const subcategories = ['TODAS', ...new Set(parquesItems.map(item => item.subcategory || 'Sin Categoría'))];

  const filteredItems = parquesItems.filter(item => {
    if (activeSubcategory !== 'TODAS' && item.subcategory !== activeSubcategory) return false;
    if (selectedBrand !== 'Todas' && item.marca !== selectedBrand) return false;
    if (!searchTerm) return true;
    const searchLow = searchTerm.toLowerCase();
    const safeMatch = (val) => val && String(val).toLowerCase().includes(searchLow);
    return safeMatch(item.name) || safeMatch(item.subcategory) || safeMatch(item.marca);
  });

  const handleExport = () => {
    exportToExcel(filteredItems, `parques_${activeSubcategory}`, `Parques - ${activeSubcategory}`);
  };

  const handleImport = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setIsImporting(true);
    try {
      const result = await processParquesExcel(file);
      await bulkAddItems(result.items);
      setImportSummary(result.summary);
    } catch (error) {
      toast.error('Error: ' + error.message);
    } finally {
      setIsImporting(false);
      e.target.value = '';
    }
  };

  const userName = userData?.name || userData?.displayName || 'Admin';

  const handleDelete = (id, name) => {
    if (window.confirm(`¿Eliminar "${name}"?`)) deleteItem(id, userName);
  };

  return (
    <main className="inventory-view animate-fade-in">
      <header className="view-header">
        <div className="view-title-group">
          <h2>Inventario de Parques</h2>
          <p className="text-muted text-sm font-medium">Gestión de suministros por sede</p>
        </div>
        <div className="view-actions">
          <div className="search-box-wrapper">
            <div className="search-box">
              <Search size={18} />
              <input type="text" placeholder="Buscar..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
            </div>
          </div>
          <button className="btn-secondary flex items-center gap-2" onClick={handleExport}><Download size={18} /> Exportar</button>
          {isAdmin && (
            <label className="btn-primary flex items-center gap-2 cursor-pointer">
              {isImporting ? <Loader2 className="animate-spin" size={18} /> : <Upload size={18} />} Importar Excel
              <input type="file" className="hidden" onChange={handleImport} />
            </label>
          )}
          {canAddTo('Parques') && <button className="btn-primary" onClick={() => { setSelectedItem(null); setIsAddModalOpen(true); }}><Plus size={18} /> Nuevo</button>}
        </div>
      </header>

      {subcategories.length > 1 && (
        <div className="filter-wrapper animate-slide-up">
          <div className="filter-card">
            <Filter size={18} className="filter-icon" />
            <div className="filter-content">
              <label>Filtrar por Sede</label>
              <div className="filter-select-wrapper">
                <select 
                  value={activeSubcategory}
                  onChange={(e) => setActiveSubcategory(e.target.value)}
                >
                  {subcategories.map(sub => (
                    <option key={sub} value={sub}>{sub === 'TODAS' ? 'Todas las Sedes' : sub}</option>
                  ))}
                </select>
                <ChevronDown size={16} className="filter-chevron" />
              </div>
            </div>
          </div>
        </div>
      )}

      <section className="card table-card">
        <div className="table-container">
          <table className="inventory-table">
            <thead>
              <tr>
                <th>Artículo</th>
                <th>Subcategoría</th>
                <th>Marca</th>
                <th>Stock</th>
                <th>Mín</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {filteredItems.map(item => (
                <tr key={item.id}>
                  <td>
                    <div className="item-name-group">
                      <span className="item-name">{item.name}</span>
                      {(isAdmin || canEditIn('Parques')) && (
                        <div className="item-actions-inline">
                          <button className="btn-inline btn-inline-edit" onClick={() => { setSelectedItem(item); setIsAddModalOpen(true); }}><Edit3 size={12} /> Editar</button>
                          {isAdmin && (
                            <button className="btn-inline btn-inline-delete" onClick={() => handleDelete(item.id, item.name)}><Trash2 size={12} /> Eliminar</button>
                          )}
                        </div>
                      )}
                    </div>
                  </td>
                  <td><span className="badge badge-blue">{item.subcategory || 'General'}</span></td>
                  <td><span className="badge badge-gray">{item.marca || 'N/A'}</span></td>
                  <td>
                    <div className="stock-group">
                      <div className="stock-info">
                        <div className="stock-qty-wrapper">
                          <span className="stock-qty">{item.qty || 0}</span>
                          <span className="stock-unit">{item.unit || 'pz'}</span>
                        </div>
                        <span className={`stock-status ${
                          (item.qty || 0) <= (item.threshold || 0) ? 'status-critical' : 
                          (item.qty || 0) <= (item.threshold || 0) * 2 ? 'status-low' : 'status-optimal'
                        }`}>
                          {(item.qty || 0) <= (item.threshold || 0) ? 'Crítico' : 
                           (item.qty || 0) <= (item.threshold || 0) * 2 ? 'Bajo' : 'Óptimo'}
                        </span>
                      </div>
                      <div className="stock-bar-wrapper">
                        <div 
                          className={`stock-bar ${
                            (item.qty || 0) <= (item.threshold || 0) ? 'bar-critical' : 
                            (item.qty || 0) <= (item.threshold || 0) * 2 ? 'bar-low' : 'bar-optimal'
                          }`}
                          style={{ width: `${Math.min(((item.qty || 0) / ((item.threshold || 0) * 3)) * 100, 100)}%` }}
                        ></div>
                      </div>
                    </div>
                  </td>
                  <td>
                    <span className="badge badge-gray">
                      {item.threshold || 0}
                    </span>
                  </td>
                  <td className="text-right">
                    <div className="actions-cell">
                      {isStaff && (
                        <>
                          <button 
                            className="btn-action" 
                            onClick={() => { setSelectedItem(item); setIsStockModalOpen(true); }}
                            title="Registrar entrada o salida"
                          >
                            <Activity size={16} />
                            <span className="btn-action-label">MOVIMIENTO</span>
                          </button>
                          <button 
                            className="btn-action btn-action-audit" 
                            onClick={() => { setSelectedItem(item); setIsAuditModalOpen(true); }}
                            title="Realizar auditoría física"
                          >
                            <ClipboardCheck size={16} />
                            <span className="btn-action-label">AUDITAR</span>
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <ActionModal 
        isOpen={isStockModalOpen} 
        onClose={() => setIsStockModalOpen(false)} 
        item={selectedItem} 
        onConfirm={(id, qty, details) => {
          updateStock(id, qty, userData?.name || 'Admin', details);
          setIsStockModalOpen(false);
        }}
      />

      <AddItemModal 
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        category="Parques"
        initialData={selectedItem}
        onSave={(data) => {
          if (selectedItem) editItem(selectedItem.id, data, userName);
          else addItem(data, userName);
          setIsAddModalOpen(false);
        }}
      />

      {isAuditModalOpen && (
        <div className="modal-overlay">
          <div className="modal-card animate-scale-up p-8 max-w-sm">
            <h3 className="text-xl mb-4 font-bold">Auditoría</h3>
            <div className="f-group mb-4">
              <label>Cantidad Física</label>
              <input type="number" className="f-input" value={physicalCount} onChange={(e) => setPhysicalCount(e.target.value)} />
            </div>
            <div className="f-group mb-6">
              <label>Motivo (Obligatorio)</label>
              <textarea className="f-input" value={auditReason} onChange={(e) => setAuditReason(e.target.value)} />
            </div>
            <div className="flex gap-4">
              <button className="btn-secondary flex-1" onClick={() => setIsAuditModalOpen(false)}>Cancelar</button>
              <button className="btn-primary flex-1" onClick={() => {
                auditStock(selectedItem.id, parseInt(physicalCount), userData?.name || 'Admin', auditReason);
                setIsAuditModalOpen(false);
                setPhysicalCount('');
                setAuditReason('');
              }} disabled={!physicalCount || !auditReason.trim()}>Guardar</button>
            </div>
          </div>
        </div>
      )}

      {importSummary && (
        <div className="modal-overlay">
          <div className="modal-card animate-scale-up p-8 max-w-lg">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-xl font-bold">Resumen de Importación</h3>
              <button onClick={() => setImportSummary(null)}><X size={20} /></button>
            </div>
            <div className="max-h-60 overflow-y-auto">
              {importSummary.map((sheet, i) => (
                <div key={i} className="flex justify-between p-2 border-b">
                  <span>{sheet.sheet}</span>
                  <span className="font-bold">{sheet.count} items</span>
                </div>
              ))}
            </div>
            <button className="btn-primary w-full mt-6" onClick={() => setImportSummary(null)}>Cerrar</button>
          </div>
        </div>
      )}
    </main>
  );
};

export default ParquesView;
