import React, { useState, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Wrench, PenTool, Package, Printer, Cpu, Landmark, AlertTriangle, 
  Loader2, Archive, BarChart3, Layers, ArrowUpCircle,
  ArrowDownCircle, X, RefreshCw, ClipboardCheck, Activity, Zap
} from 'lucide-react';
import { 
  XAxis, CartesianGrid, Tooltip, ResponsiveContainer, AreaChart, Area
} from 'recharts';
import { useInventory } from '../context/InventoryContextOptimized';
import { useAuth } from '../context/AuthContext';
import { useCustomCategories } from '../context/CustomCategoriesContext';
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
  Asignación:  { color: '#5856d6', bg: '#f0f0ff', Icon: RefreshCw }
};

const Dashboard = () => {
  const { items, movements, loading, globalStats } = useInventory();
  const { customCategories } = useCustomCategories();
  const { userData, isStaff } = useAuth();
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

  const lowStockItems = useMemo(() => 
    items.filter(item => (item.qty || 0) <= (item.threshold || 0)),
    [items]
  );

  const categories = useMemo(() => {
    const base = [
      { id: 'tornilleria', title: 'Tornillería', icon: <Wrench size={22} />, color: '#0071e3', route: '/tornilleria' },
      { id: 'papeleria', title: 'Papelería', icon: <PenTool size={22} />, color: '#ff9500', route: '/papeleria' },
      { id: 'herramientas', title: 'Herramientas', icon: <Package size={22} />, color: '#5856d6', route: '/herramientas' },
      { id: 'impresion', title: 'Impresión 3D', icon: <Printer size={22} />, color: '#af52de', route: '/impresion-3d' },
      { id: 'electronica', title: 'Electrónica', icon: <Cpu size={22} />, color: '#ff2d55', route: '/electronica' },
      { id: 'general', title: 'General', icon: <Layers size={22} />, color: '#8e8e93', route: '/general' },
      { id: 'almacen', title: 'Almacén', icon: <Archive size={22} />, color: '#636366', route: '/almacen-temporal' },
      { id: 'parques', title: 'Parques', icon: <Landmark size={22} />, color: '#34c759', route: '/parques' },
    ];
    if (customCategories?.length) {
      customCategories.forEach(cat => {
        base.push({
          id: cat.id,
          title: cat.name,
          icon: <Package size={22} />,
          color: cat.color || '#5856d6',
          route: cat.route || `/seccion/${encodeURIComponent(cat.name)}`
        });
      });
    }
    return base;
  }, [customCategories]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen w-full bg-slate-950">
        <Loader2 className="animate-spin text-blue-500" size={48} />
      </div>
    );
  }

  const firstName = userData?.name ? userData.name.split(' ')[0] : 'Usuario';

  return (
    <div className="dashboard-wrapper">
      <Header />
      
      <header className="dashboard-hero">
        <span className="hero-greeting">Hola, {firstName}</span>
        <h1 className="hero-title">Gestión de <br/> <span>Activos.</span></h1>
      </header>

      <section className="dash-metrics">
        <div className="dash-metric-card">
          <div className="dash-metric-icon blue">
            <Package size={24} />
          </div>
          <div className="dash-metric-body">
            <span className="dash-metric-label">Total Inventario</span>
            <div className="dash-metric-value">
              {globalStats.items || 0}
            </div>
            <span className="dash-metric-unit">Artículos en catálogo</span>
          </div>
        </div>

        <div 
          className="dash-metric-card clickable" 
          onClick={() => setIsCriticalModalOpen(true)}
        >
          <div className="dash-metric-icon red">
            <AlertTriangle size={24} />
          </div>
          <div className="dash-metric-body">
            <span className="dash-metric-label">Stock Crítico</span>
            <div className="dash-metric-value danger">
              {globalStats.critical || 0}
            </div>
            <span className="dash-metric-unit">Artículos por agotarse</span>
          </div>
        </div>
      </section>

      <div className="dash-main-grid">
        <div className="dash-chart-card">
          <div className="dash-chart-header">
            <div className="dash-chart-title">
               <h3>Actividad Reciente</h3>
               <p>Movimientos semanales</p>
            </div>
            <button className="dash-chart-btn" onClick={() => navigate('/analytics')}>
              <BarChart3 size={14} /> Analítica
            </button>
          </div>
          <div style={{ height: '240px', width: '100%' }}>
            {isMounted && globalStats.activity?.length > 0 && (
              <ResponsiveContainer width="100%" height="100%" minWidth={1} minHeight={1}>
                <AreaChart data={globalStats.activity}>
                  <defs>
                    <linearGradient id="appleGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#0071e3" stopOpacity={0.2}/>
                      <stop offset="95%" stopColor="#0071e3" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsla(var(--border-color), 0.3)" />
                  <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 10, fontWeight: 700, fill: '#86868b' }} dy={10} />
                  <Tooltip 
                    contentStyle={{ borderRadius: '16px', border: '1px solid hsla(var(--border-color), 0.5)', background: 'hsla(var(--bg-card), 0.9)', backdropFilter: 'blur(10px)' }} 
                    itemStyle={{ color: '#0071e3', fontWeight: 'bold' }}
                    labelStyle={{ color: 'hsl(var(--text-muted))', fontWeight: 'bold', marginBottom: '4px' }}
                  />
                  <Area type="monotone" dataKey="movimientos" stroke="#0071e3" strokeWidth={4} fillOpacity={1} fill="url(#appleGrad)" dot={{ r: 4, fill: '#0071e3', strokeWidth: 2, stroke: '#fff' }} activeDot={{ r: 6 }} />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        <div className="dash-cats-card">
          <h3 className="dash-cats-title">Catálogo</h3>
          <div className="dash-cats-grid">
            {categories.map(cat => (
              <div key={cat.id} className="dash-cat-item" onClick={() => navigate(cat.route)}>
                <div className="dash-cat-icon" style={{ backgroundColor: `${cat.color}15`, color: cat.color }}>
                  {cat.icon}
                </div>
                <span className="dash-cat-name">{cat.title}</span>
              </div>
            ))}
            
            {/* Botón para Administrar / Crear Secciones */}
            {isStaff && (
              <div className="dash-cat-item" onClick={() => navigate('/sections')} style={{ border: '1px dashed hsla(var(--primary), 0.3)' }}>
                <div className="dash-cat-icon" style={{ backgroundColor: 'hsla(var(--primary), 0.1)', color: 'hsl(var(--primary))' }}>
                  <Layers size={22} />
                </div>
                <span className="dash-cat-name">Administrar Secciones</span>
              </div>
            )}
            
          </div>
        </div>
      </div>

      <div className="dash-mov-card">
        <div className="dash-mov-header">
          <div>
            <h3 className="dash-mov-title">
              <Activity size={18} className="dash-mov-title-icon" />
              Línea de Tiempo
            </h3>
            <p className="dash-mov-sub">
              {movDate === todayStr ? 'Hoy — en tiempo real' : movDate}
            </p>
          </div>
          <div className="dash-mov-controls">
            <input type="date" className="dash-date-input" value={movDate} max={todayStr} onChange={e => setMovDate(e.target.value)} />
            <button className="dash-ver-todo-btn" onClick={() => navigate('/transactions')}>Ver todo</button>
          </div>
        </div>

        {dayMovements.length === 0 ? (
          <div className="dash-mov-empty">
            <Package size={40} style={{ color: 'hsla(var(--text-muted), 0.3)' }} />
            <p>Sin movimientos en esta fecha</p>
          </div>
        ) : (
          <div className="dash-timeline">
            {dayMovements.slice(0, 15).map((mov, idx) => {
              const cfg = actionColors[mov.action] || { color: '#8e8e93', bg: '#f2f2f7', Icon: Activity };
              const { Icon } = cfg;
              return (
                <div key={mov.id} className="dash-tl-item">
                  <div className="dash-tl-track">
                    <div className="dash-tl-node" style={{ backgroundColor: cfg.color, boxShadow: `0 0 15px ${cfg.color}80` }}>
                      <Icon size={12} color="#fff" />
                    </div>
                    {idx !== dayMovements.slice(0, 15).length - 1 && <div className="dash-tl-line" style={{ background: `linear-gradient(to bottom, ${cfg.color}80, transparent)` }}></div>}
                  </div>
                  
                  <div className="dash-tl-content glass-panel-ultra">
                    <div className="dash-tl-top">
                      <span className="dash-tl-action" style={{ color: cfg.color }}>{mov.action}</span>
                      <span className="dash-tl-time">{mov.timestamp?.toDate().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit', hour12: true})}</span>
                    </div>
                    <div className="dash-tl-name">{mov.item}</div>
                    <div className="dash-tl-cat">{mov.category || 'Gral'} {mov.subcategory ? `• ${mov.subcategory}` : ''}</div>
                    <div className="dash-tl-footer">
                      <span className="dash-tl-note">{mov.details || '—'}</span>
                      <span className="dash-tl-qty" style={{ background: `${cfg.color}15`, color: cfg.color }}>{mov.qty} pz</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {isCriticalModalOpen && (
        <div className="modal-overlay">
          <div className="modal-card animate-scale-up crit-modal-card">
            <div className="crit-modal-header">
              <div className="crit-modal-title-group">
                <div className="crit-modal-icon">
                  <AlertTriangle size={20} />
                </div>
                <div>
                  <h3 className="crit-modal-title">Stock Crítico</h3>
                  <p className="crit-modal-subtitle">{lowStockItems.length} artículos por debajo del umbral</p>
                </div>
              </div>
              <button className="crit-modal-close" onClick={() => setIsCriticalModalOpen(false)}>
                <X size={20} />
              </button>
            </div>

            {lowStockItems.length === 0 ? (
              <div className="crit-modal-empty">
                <div className="crit-empty-icon">
                  <Zap size={28} />
                </div>
                <h4 className="crit-empty-title">Todo en orden</h4>
                <p className="crit-empty-subtitle">No hay artículos con stock crítico</p>
              </div>
            ) : (
              <div className="crit-modal-list">
                <div className="crit-modal-list-inner">
                  {lowStockItems.slice(0, 500).map(item => (
                    <div key={item.id} className="crit-item-row">
                      <div className="crit-item-info">
                        <span className="crit-item-name">{item.name}</span>
                        <span className="crit-item-cat">{item.category || 'General'}</span>
                      </div>
                      <div className="crit-item-actions">
                        <div className="crit-item-stats">
                          <span className="crit-item-stats-label">Stock / Mín</span>
                          <div className="crit-item-stats-values">
                            <span className="crit-item-qty">{item.qty || 0}</span>
                            <span className="crit-item-thresh">/ {item.threshold || 0}</span>
                            <span className="crit-item-unit">{item.unit || 'PZA'}</span>
                          </div>
                        </div>
                        <button
                          className="crit-item-go-btn"
                          title="Ir a categoría"
                          onClick={() => { setIsCriticalModalOpen(false); navigate(categoryToRoute(item.category)); }}
                        >
                          <Zap size={16} />
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
