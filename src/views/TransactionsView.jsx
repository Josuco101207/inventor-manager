import React, { useState, useMemo } from 'react';
import { useInventory } from '../context/InventoryContext';
import { useAuth } from '../context/AuthContext';
import Header from '../components/Header';
import { useNavigate } from 'react-router-dom';
import {
  ArrowUpCircle, ArrowDownCircle, RefreshCw, ClipboardCheck,
  HandMetal, Calendar, ChevronRight, Search, Loader2,
  X, Package, Users, ExternalLink, Activity, Filter
} from 'lucide-react';
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
    <div className="transactions-view animate-fade-in">
      <Header />

      <div className="txn-page-wrapper">
        {/* Page Title */}
        <div className="txn-page-header">
          <div className="txn-title-group">
            <h2 className="txn-title">Transacciones Cloud</h2>
            <p className="txn-subtitle">
              {isToday ? 'Movimientos de hoy' : `Movimientos del ${new Date(selectedDate + 'T12:00:00').toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' })}`}
            </p>
          </div>

          <div className="txn-header-controls">
            {/* Date Picker */}
            <div className="txn-date-picker-wrapper">
              <Calendar size={16} className="txn-date-icon" />
              <input
                type="date"
                className="txn-date-input"
                value={selectedDate}
                onChange={e => setSelectedDate(e.target.value)}
                max={todayStr}
              />
              {!isToday && (
                <button
                  className="txn-today-btn"
                  onClick={() => setSelectedDate(todayStr)}
                  title="Volver a hoy"
                >
                  Hoy <X size={12} />
                </button>
              )}
            </div>

            {/* Search */}
            <div className="txn-search-wrapper">
              <Search size={15} className="txn-search-icon" />
              <input
                type="text"
                placeholder="Buscar artículo, acción..."
                className="txn-search-input"
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
              />
              {searchTerm && (
                <button className="txn-search-clear" onClick={() => setSearchTerm('')}>
                  <X size={12} />
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Summary chips */}
        <div className="txn-summary-chips">
          <div className="txn-chip txn-chip-total">
            <Activity size={14} />
            <span>{filteredMovements.length} movimientos</span>
          </div>
          <div className="txn-chip txn-chip-entradas">
            <ArrowUpCircle size={14} />
            <span>{filteredMovements.filter(m => m.action === 'Entrada').length} entradas</span>
          </div>
          <div className="txn-chip txn-chip-salidas">
            <ArrowDownCircle size={14} />
            <span>{filteredMovements.filter(m => m.action === 'Salida').length} salidas</span>
          </div>
        </div>

        {/* Table Card */}
        <div className="txn-card">
          {loading ? (
            <div className="txn-empty-state">
              <Loader2 size={40} className="animate-spin text-blue-400" />
              <p>Cargando movimientos...</p>
            </div>
          ) : filteredMovements.length === 0 ? (
            <div className="txn-empty-state">
              <Package size={52} className="txn-empty-icon" />
              <h3>Sin movimientos</h3>
              <p>
                {isToday
                  ? 'No hay movimientos registrados hoy.'
                  : 'No hay movimientos para la fecha seleccionada.'}
              </p>
            </div>
          ) : (
            <div className="txn-table-wrapper">
              <table className="txn-table">
                <thead>
                  <tr>
                    <th>Acción</th>
                    <th>Artículo</th>
                    <th>Detalle / Recibe</th>
                    <th>Entrega (Admin)</th>
                    <th className="text-center">Cant.</th>
                    <th>Fecha y Hora</th>
                    {isAdmin && <th className="text-right">Acciones</th>}
                  </tr>
                </thead>
                <tbody>
                  {filteredMovements.map(mov => {
                    const cfg = getActionConfig(mov.action);
                    const Icon = cfg.icon;
                    const movDate = mov.timestamp?.toDate();
                    return (
                      <tr key={mov.id} className="txn-row">
                        {/* Acción */}
                        <td>
                          <span
                            className="txn-action-badge"
                            style={{ color: cfg.color, backgroundColor: cfg.bg }}
                          >
                            <Icon size={12} />
                            {cfg.label}
                          </span>
                        </td>

                        {/* Artículo — clickable */}
                        <td>
                          <button
                            className="txn-article-btn"
                            onClick={() => handleArticleClick(mov)}
                            title={`Ver ${mov.item} en inventario`}
                          >
                            <span className="txn-article-name">{mov.item}</span>
                            <div className="txn-article-sub">{mov.category || '—'}</div>
                            <ExternalLink size={13} className="txn-article-arrow" />
                          </button>
                        </td>

                        {/* Detalle */}
                        <td>
                          <span className="txn-detail-main">{mov.details || '—'}</span>
                        </td>

                        {/* Entrega admin */}
                        <td>
                          <span className="txn-user-badge">
                            <Users size={12} />
                            {mov.user || 'Admin'}
                          </span>
                        </td>

                        {/* Cantidad */}
                        <td className="text-center">
                          <span className="txn-qty">{mov.qty ?? '—'}</span>
                        </td>

                        {/* Fecha y Hora */}
                        <td>
                          {movDate ? (
                            <div className="txn-date-col">
                              <span className="txn-date-main">
                                {movDate.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' })}
                              </span>
                              <span className="txn-date-time">
                                {movDate.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                              </span>
                            </div>
                          ) : '—'}
                        </td>

                        {/* Acciones para Admin */}
                        {isAdmin && (
                          <td className="text-right">
                            {mov.annulled ? (
                              <span className="txn-annulled-tag">ANULADO</span>
                            ) : mov.action !== 'Anulación' ? (
                              <button 
                                className="txn-annul-btn"
                                onClick={() => {
                                  if(window.confirm(`¿Seguro que deseas ANULAR este movimiento de ${mov.item}? Se revertirá el stock correspondiente.`)) {
                                    annulMovement(mov.id, userData?.name || 'Admin');
                                  }
                                }}
                              >
                                <X size={12} /> ANULAR
                              </button>
                            ) : null}
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default TransactionsView;
