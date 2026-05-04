import React, { useState, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Wrench, PenTool, Package, Printer, Cpu, Landmark, AlertTriangle, 
  Loader2, Archive, DollarSign, BarChart3, Layers, ArrowUpCircle,
  ArrowDownCircle, Calendar, X, RefreshCw, ClipboardCheck, Activity, User
} from 'lucide-react';
import { 
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, AreaChart, Area
} from 'recharts';
import { useInventory } from '../context/InventoryContext';
import { useAuth } from '../context/AuthContext';
import Header from './Header';
import './Dashboard.css';

const categoryToRoute = (category) => {
  const map = {
    'Tornillería': '/tornilleria', 'Papelería': '/papeleria',
    'Herramientas': '/herramientas', 'Impresión 3D': '/impresion-3d',
    'Electrónica': '/electronica', 'Inventario General': '/general',
    'Almacén Temporal': '/almacen-temporal', 'Parques': '/parques',
  };
  return map[category] || '/general';
};

const toLocalDateString = (date) => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

const actionColors = {
  Entrada:     { color: '#16a34a', bg: '#f0fff4', Icon: ArrowUpCircle },
  Salida:      { color: '#dc2626', bg: '#fff1f1', Icon: ArrowDownCircle },
  Préstamo:    { color: '#5856d6', bg: '#f0f0ff', Icon: RefreshCw },
  Devolución:  { color: '#0071e3', bg: '#f0f7ff', Icon: RefreshCw },
  Auditoría:   { color: '#ff9500', bg: '#fff8f0', Icon: ClipboardCheck },
  Alta:        { color: '#16a34a', bg: '#f0fdf4', Icon: ArrowUpCircle },
  Edición:     { color: '#ea580c', bg: '#fff7ed', Icon: ClipboardCheck },
  Eliminación: { color: '#dc2626', bg: '#fef2f2', Icon: ArrowDownCircle },
};

const Dashboard = () => {
  const { items, movements, loading } = useInventory();
  const { userData, isAdmin } = useAuth();
  const navigate = useNavigate();
  const todayStr = toLocalDateString(new Date());
  const [movDate, setMovDate] = useState(todayStr);
  const [isCriticalModalOpen, setIsCriticalModalOpen] = useState(false);
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  const dayMovements = useMemo(() =>
    movements.filter(m => {
      if (!m.timestamp) return false;
      return toLocalDateString(m.timestamp.toDate()) === movDate;
    }),
    [movements, movDate]
  );

  // --- OPTIMIZACIÓN O(N): Un solo paso para todas las métricas ---
  const { totalValue, lowStockItems, chartData } = useMemo(() => {
    // 1. Cálculo de Valor y Stock Bajo (items)
    const val = items.reduce((acc, item) => acc + ((item.qty || 0) * (item.costo_unitario || 0)), 0);
    const low = items.filter(item => (item.qty || 0) <= (item.threshold || 0));

    // 2. Preparación de días para la gráfica
    const last7Days = [6, 5, 4, 3, 2, 1, 0].map(i => {
      const d = new Date();
      d.setDate(d.getDate() - i);
      return { 
        name: d.toLocaleDateString('es-ES', { weekday: 'short' }),
        dateStr: toLocalDateString(d),
        movimientos: 0 
      };
    });

    // 3. Un solo paso por movimientos para llenar la gráfica
    movements.forEach(m => {
      if (!m.timestamp) return;
      const mDate = toLocalDateString(m.timestamp.toDate());
      const day = last7Days.find(d => d.dateStr === mDate);
      if (day) day.movimientos++;
    });

    return { totalValue: val, lowStockItems: low, chartData: last7Days };
  }, [items, movements]);


  const categories = [
    { id: 'tornilleria', title: 'Tornillería', icon: <Wrench size={22} />, color: '#0071e3', route: '/tornilleria' },
    { id: 'papeleria', title: 'Papelería', icon: <PenTool size={22} />, color: '#ff9500', route: '/papeleria' },
    { id: 'herramientas', title: 'Herramientas', icon: <Package size={22} />, color: '#5856d6', route: '/herramientas' },
    { id: 'impresion', title: 'Impresión 3D', icon: <Printer size={22} />, color: '#af52de', route: '/impresion-3d' },
    { id: 'electronica', title: 'Electrónica', icon: <Cpu size={22} />, color: '#ff2d55', route: '/electronica' },
    { id: 'general', title: 'General', icon: <Layers size={22} />, color: '#8e8e93', route: '/general' },
    { id: 'almacen', title: 'Almacén', icon: <Archive size={22} />, color: '#636366', route: '/almacen-temporal' },
    { id: 'parques', title: 'Parques', icon: <Landmark size={22} />, color: '#34c759', route: '/parques' },
  ];

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full w-full">
        <Loader2 className="animate-spin text-blue-500" size={32} />
      </div>
    );
  }

  return (
    <div className="dashboard-wrapper">
      <Header />
      
      <header className="dashboard-hero">
        <span className="hero-date">{new Date().toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' })}</span>
        <h1 className="hero-title">Gestión de <br/> <span>Activos.</span></h1>
      </header>

      <section className="metrics-grid">
        <div className="metric-card">
          <div className="metric-icon-box" style={{ backgroundColor: '#f0f7ff', color: '#0071e3' }}>
            <Package size={32} />
          </div>
          <div>
            <p className="metric-label">Total Inventario</p>
            <div className="metric-value-row">
               <span className="metric-value">{items.length}</span>
               <span className="metric-unit">Artículos</span>
            </div>
          </div>
        </div>

        <div 
          className="metric-card" 
          style={{ cursor: 'pointer', transition: 'transform 0.2s', ':hover': { transform: 'scale(1.02)' } }}
          onClick={() => setIsCriticalModalOpen(true)}
          title="Ver lista de artículos en estado crítico"
        >
          <div className="metric-icon-box" style={{ backgroundColor: '#fff1f1', color: '#ff3b30' }}>
            <AlertTriangle size={32} />
          </div>
          <div>
            <p className="metric-label">Stock Crítico</p>
            <div className="metric-value-row">
               <span className="metric-value" style={{ color: '#ff3b30' }}>{lowStockItems.length}</span>
               <span className="metric-unit">Alertas</span>
            </div>
          </div>
        </div>
      </section>

      <div className="dashboard-main-grid">
        <div className="chart-card">
          <div className="chart-header">
            <div className="chart-title">
               <h3>Actividad</h3>
               <p>Movimientos semanales</p>
            </div>
            <button className="btn-apple-primary flex items-center gap-2" onClick={() => navigate('/analytics')}>
              <BarChart3 size={16} /> Ver Análisis
            </button>
          </div>
          <div style={{ height: '320px', width: '100%' }}>
            {isMounted && (
              <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
                <AreaChart data={chartData}>
                  <defs>
                    <linearGradient id="appleGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#0071e3" stopOpacity={0.1}/>
                      <stop offset="95%" stopColor="#0071e3" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 11, fontWeight: 700, fill: '#86868b' }} />
                  <Tooltip contentStyle={{ borderRadius: '20px', border: 'none', boxShadow: '0 10px 30px rgba(0,0,0,0.05)' }} />
                  <Area type="monotone" dataKey="movimientos" stroke="#0071e3" strokeWidth={5} fillOpacity={1} fill="url(#appleGrad)" dot={{ r: 5, fill: '#0071e3', strokeWidth: 3, stroke: '#fff' }} />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        <div className="categories-card">
          <h3 className="categories-title">Secciones</h3>
          <div className="categories-grid">
            {categories.map(cat => (
              <div key={cat.id} className="category-item" onClick={() => navigate(cat.route)}>
                <div className="cat-icon-box" style={{ backgroundColor: `${cat.color}15`, color: cat.color }}>
                  {cat.icon}
                </div>
                <span className="cat-name">{cat.title}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Daily Movements Feed ── */}
      <div className="dash-movements-card">
        {/* Header */}
        <div className="dash-mov-header">
          <div>
            <h3 className="dash-mov-title">
              <Activity size={18} className="dash-mov-title-icon" />
              Movimientos del día
            </h3>
            <p className="dash-mov-sub">
              {movDate === todayStr
                ? 'Hoy — en tiempo real'
                : new Date(movDate + 'T12:00:00').toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
            </p>
          </div>
          <div className="dash-mov-controls">
            <div className="dash-date-wrap">
              <Calendar size={14} className="dash-date-icon" />
              <input
                type="date"
                className="dash-date-input"
                value={movDate}
                max={todayStr}
                onChange={e => setMovDate(e.target.value)}
              />
            </div>
            {movDate !== todayStr && (
              <button className="dash-today-btn" onClick={() => setMovDate(todayStr)}>
                Hoy <X size={11} />
              </button>
            )}
            <button className="dash-ver-todo-btn" onClick={() => navigate('/transactions')}>
              Ver todo
            </button>
          </div>
        </div>

        {/* Summary chips */}
        <div className="dash-mov-chips">
          <span className="dash-chip dash-chip-all"><Activity size={12} />{dayMovements.length} total</span>
          <span className="dash-chip dash-chip-in"><ArrowUpCircle size={12} />{dayMovements.filter(m => m.action === 'Entrada').length} entradas</span>
          <span className="dash-chip dash-chip-out"><ArrowDownCircle size={12} />{dayMovements.filter(m => m.action === 'Salida').length} salidas</span>
        </div>

        {/* Feed list */}
        {dayMovements.length === 0 ? (
          <div className="dash-mov-empty">
            <Package size={40} style={{ color: '#cbd5e1' }} />
            <p>Sin movimientos {movDate === todayStr ? 'hoy' : 'en esta fecha'}</p>
          </div>
        ) : (
          <div className="dash-mov-list">
            {dayMovements.slice(0, 15).map(mov => {
              const cfg = actionColors[mov.action] || { color: '#8e8e93', bg: '#f2f2f7', Icon: Activity };
              const { Icon } = cfg;
              const ts = mov.timestamp?.toDate();
              const relatedItem = items.find(i => i.name === mov.item);
              const displaySub = mov.subcategory || relatedItem?.subcategory;

              return (
                <div key={mov.id} className="dash-mov-row">
                  {/* Badge */}
                  <span className="dash-mov-badge" style={{ color: cfg.color, background: cfg.bg }}>
                    <Icon size={11} /> {mov.action}
                  </span>

                  {/* Article — clickable */}
                  <button
                    className="dash-mov-article"
                    onClick={() => navigate(categoryToRoute(mov.category), { state: { prefillSearch: mov.item } })}
                    title={`Ver ${mov.item} en inventario`}
                  >
                    <span className="dash-mov-name">{mov.item}</span>
                    <span className="dash-mov-cat">
                      {mov.category || '—'}
                      {displaySub ? ` • ${displaySub}` : ''}
                    </span>
                  </button>

                  {/* Details */}
                  <span className="dash-mov-detail">{mov.details || '—'}</span>

                  {/* Qty */}
                  <span className="dash-mov-qty">{mov.qty ?? '—'}</span>

                  {/* User */}
                  <span className="dash-mov-user" title={`Realizado por: ${mov.user || 'Admin'}`}>
                    <User size={12} className="inline mr-1 opacity-60" />
                    {mov.user || 'Admin'}
                  </span>

                  {/* Time */}
                  <span className="dash-mov-time">
                    {ts ? ts.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }) : '—'}
                  </span>
                </div>
              );
            })}
            {dayMovements.length > 15 && (
              <button className="dash-mov-more" onClick={() => navigate('/transactions')}>
                +{dayMovements.length - 15} más — Ver todos los movimientos →
              </button>
            )}
          </div>
        )}
      </div>
      {/* ── Critical Stock Modal ── */}
      {isCriticalModalOpen && (
        <div className="modal-overlay">
          <div className="modal-card animate-scale-up crit-modal-card">
            <div className="crit-modal-header">
              <div className="crit-modal-title-group">
                <div className="crit-modal-icon">
                  <AlertTriangle size={24} />
                </div>
                <div>
                  <h3 className="crit-modal-title">Stock Crítico</h3>
                  <p className="crit-modal-subtitle">Artículos en o por debajo de su mínimo</p>
                </div>
              </div>
              <button 
                onClick={() => setIsCriticalModalOpen(false)} 
                className="crit-modal-close"
              >
                <X size={20} />
              </button>
            </div>
            
            {lowStockItems.length === 0 ? (
              <div className="crit-modal-empty">
                <div className="crit-empty-icon">
                  <ClipboardCheck size={32} />
                </div>
                <p className="crit-empty-title">¡Todo en orden!</p>
                <p className="crit-empty-subtitle">No hay artículos con stock crítico en este momento.</p>
              </div>
            ) : (
              <div className="crit-modal-list">
                <div className="crit-modal-list-inner">
                  {lowStockItems.map(item => (
                    <div key={item.id} className="crit-item-row">
                      <div className="crit-item-info">
                        <span className="crit-item-name">{item.name}</span>
                        <span className="crit-item-cat">{item.category || 'General'}</span>
                      </div>
                      <div className="crit-item-actions">
                        <div className="crit-item-stats">
                          <span className="crit-item-stats-label">STOCK / MÍN</span>
                          <div className="crit-item-stats-values">
                            <span className="crit-item-qty">{item.qty || 0}</span>
                            <span className="crit-item-thresh">/ {item.threshold || 0}</span>
                            <span className="crit-item-unit">{item.unit || 'pz'}</span>
                          </div>
                        </div>
                        <button 
                          className="crit-item-go-btn"
                          onClick={() => {
                            setIsCriticalModalOpen(false);
                            navigate(categoryToRoute(item.category), { state: { prefillSearch: item.name } });
                          }}
                          title="Ir a gestionar artículo"
                        >
                          <ArrowUpCircle size={18} style={{ transform: 'rotate(45deg)' }} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default Dashboard;
