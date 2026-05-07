import React, { useState, useMemo } from 'react';
import { useInventory } from '../context/InventoryContext';
import { useAuth } from '../context/AuthContext';
import Header from '../components/Header';
import { useNavigate } from 'react-router-dom';
import {
  ArrowUpCircle, ArrowDownCircle, RefreshCw, ClipboardCheck,
  HandMetal, Calendar, ChevronRight, Search, Loader2,
  X, Package, Users, ExternalLink, Activity, Filter, ChevronDown
} from 'lucide-react';
import './ToolsView.css';
import './ParquesView.css';
import './TransactionsView.css';

// Maps a category string to a route path
const categoryToRoute = (category) => {
  const map = {
    'Tornillería': '/tornilleria',
    'Papelería': '/papeleria',
    'Herramientas': '/herramientas',
    'Impresión 3D': '/impresion-3d',
    'Electrónica': '/electronica',
    'Inventario General': '/general',
    'Almacén Temporal': '/almacen-temporal',
    'Parques': '/parques',
  };
  return map[category] || '/general';
};

const actionConfig = {
  Entrada:     { label: 'Entrada',    color: '#34c759', bg: '#f0fff4', icon: ArrowUpCircle },
  Salida:      { label: 'Salida',     color: '#ff3b30', bg: '#fff1f1', icon: ArrowDownCircle },
  Préstamo:    { label: 'Préstamo',   color: '#5856d6', bg: '#f0f0ff', icon: HandMetal },
  Devolución:  { label: 'Devolución', color: '#0071e3', bg: '#f0f7ff', icon: RefreshCw },
  Auditoría:   { label: 'Auditoría',  color: '#ff9500', bg: '#fff8f0', icon: ClipboardCheck },
  Alta:        { label: 'Alta',       color: '#16a34a', bg: '#f0fdf4', icon: ArrowUpCircle },
  Edición:     { label: 'Edición',    color: '#ea580c', bg: '#fff7ed', icon: ClipboardCheck },
  Eliminación: { label: 'Eliminación',color: '#dc2626', bg: '#fef2f2', icon: ArrowDownCircle },
  Anulación:   { label: 'Anulación',  color: '#64748b', bg: '#f1f5f9', icon: X },
};

const getActionConfig = (action) =>
  actionConfig[action] || { label: action, color: '#8e8e93', bg: '#f2f2f7', icon: Activity };

// Format a Date to YYYY-MM-DD (local, not UTC)
const toLocalDateString = (date) => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

const TransactionsView = () => {
  const { movements, loading, annulMovement } = useInventory();
  const { isAdmin, userData } = useAuth();
  const navigate = useNavigate();

  const todayStr = toLocalDateString(new Date());
  const [selectedDate, setSelectedDate] = useState(todayStr);
  const [searchTerm, setSearchTerm] = useState('');

  // Filter movements by selected date and optional search term
  const filteredMovements = useMemo(() => {
    return movements.filter(m => {
      if (!m.timestamp) return false;
      const movDate = toLocalDateString(m.timestamp.toDate());
      if (movDate !== selectedDate) return false;
      if (searchTerm) {
        const q = searchTerm.toLowerCase();
        const matchItem = (m.item || '').toLowerCase().includes(q);
        const matchAction = (m.action || '').toLowerCase().includes(q);
        const matchDetails = (m.details || '').toLowerCase().includes(q);
        const matchUser = (m.user || '').toLowerCase().includes(q);
        if (!matchItem && !matchAction && !matchDetails && !matchUser) return false;
      }
      return true;
    });
  }, [movements, selectedDate, searchTerm]);

  const handleArticleClick = (movement) => {
    const route = categoryToRoute(movement.category);
    // Pass the item name as state so InventoryView can pre-fill the search
    navigate(route, { state: { prefillSearch: movement.item } });
  };

  const isToday = selectedDate === todayStr;

  return (
    <div className="tools-view animate-fade-in relative min-h-screen">
      <Header />
      
      <header className="tools-header mb-8">
        <div className="tools-title-group">
          <h2>Transacciones Cloud</h2>
          <p>
            {isToday ? 'Movimientos registrados hoy' : `Movimientos del ${new Date(selectedDate + 'T12:00:00').toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' })}`}
          </p>
        </div>
        
        <div className="tools-actions">
          <div className="search-box-wrapper">
            <Search size={18} />
            <input 
              type="text" 
              placeholder="Buscar transacción..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>

          <div className="btn-scan-qr">
            <Calendar size={18} />
            <input
              type="date"
              style={{ background: 'transparent', border: 'none', color: 'inherit', outline: 'none', cursor: 'pointer' }}
              value={selectedDate}
              onChange={e => setSelectedDate(e.target.value)}
              max={todayStr}
            />
            {!isToday && (
              <button className="pill" style={{ marginLeft: '8px', padding: '4px 8px' }} onClick={() => setSelectedDate(todayStr)}>Hoy</button>
            )}
          </div>
        </div>
      </header>

      <div className="invt-container animate-slide-up">
        <div className="invt-grid-row invt-header-row">
          <div className="invt-cell-art">Acción / Artículo</div>
          <div className="invt-cell-details">Detalle / Responsable</div>
          <div className="invt-cell-time">Fecha y Hora</div>
          <div className="invt-cell-act">Acciones</div>
        </div>
        
        <div className="invt-body scrollbar-hide">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-20 text-blue-500 gap-4">
              <Loader2 className="animate-spin" size={32} />
              <p className="font-bold uppercase tracking-widest text-[10px] opacity-60">Sincronizando movimientos...</p>
            </div>
          ) : filteredMovements.length > 0 ? (
            filteredMovements.map((mov, index) => {
              const cfg = getActionConfig(mov.action);
              const Icon = cfg.icon;
              const movDate = mov.timestamp?.toDate();
              
              return (
                <div key={mov.id || index} className="invt-grid-row invt-data-row">
                  {/* Action + Item */}
                  <div className="invt-cell-art">
                    <div className="invt-avatar" style={{ backgroundColor: cfg.bg, color: cfg.color }}>
                      <Icon size={20} />
                    </div>
                    <div className="invt-item-info">
                      <span className="invt-action-label" style={{ color: cfg.color }}>{cfg.label}</span>
                      <span className="invt-item-name" onClick={() => handleArticleClick(mov)} style={{ cursor: 'pointer' }}>
                        {mov.item}
                      </span>
                      <span className="invt-item-cat">{mov.category || 'General'}</span>
                    </div>
                  </div>

                  {/* Detail + User */}
                  <div className="invt-cell-details">
                    <span className="invt-detail-text">{mov.details || 'Sin detalles adicionales'}</span>
                    <div className="invt-detail-meta">
                      <div className="invt-user-tag">
                        <Users size={12} />
                        <span>{mov.user || 'Admin'}</span>
                      </div>
                      {mov.qty && <span className="invt-qty-badge">{mov.qty} unidades</span>}
                    </div>
                  </div>

                  {/* Timestamp */}
                  <div className="invt-cell-time">
                    <span className="invt-time-date">{movDate?.toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' })}</span>
                    <span className="invt-time-hour">{movDate?.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', hour12: true })}</span>
                  </div>

                  {/* Actions */}
                  <div className="invt-cell-act">
                    {isAdmin && !mov.annulled && mov.action !== 'Anulación' && (
                      <button 
                        className="invt-btn-annul" 
                        title="Anular Movimiento"
                        onClick={() => {
                          if(window.confirm(`¿Seguro que deseas anular el movimiento de "${mov.item}"? Esta acción revertirá el stock.`)) {
                            annulMovement(mov.id, userData?.name || 'Admin');
                          }
                        }}
                      >
                        <X size={18} />
                      </button>
                    )}
                    {mov.annulled && <span className="invt-badge-annulled">ANULADO</span>}
                  </div>
                </div>
              );
            })
          ) : (
            <div className="flex flex-col items-center justify-center py-24 text-gray-400 gap-4 opacity-40">
              <Activity size={64} strokeWidth={1.5} />
              <p className="font-black text-lg uppercase tracking-tighter">No hay registros para esta fecha</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default TransactionsView;
