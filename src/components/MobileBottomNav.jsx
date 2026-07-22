import React, { useState, useEffect } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { 
  LayoutDashboard, Package, Activity, Menu, 
  X, Wrench, PenTool, Cpu, Printer, Landmark, 
  Settings, User, LogOut, Users, Archive, FileText, BarChart3
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useInventory } from '../context/InventoryContextOptimized';
import { useCustomCategories } from '../context/CustomCategoriesContext';
import './MobileBottomNav.css';

const MobileBottomNav = () => {
  const { logout, userData, isAdmin, isStaff } = useAuth();
  const { customCategories } = useCustomCategories();
  const location = useLocation();
  const navigate = useNavigate();
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  // Close menu when route changes
  useEffect(() => {
    setIsMenuOpen(false);
  }, [location.pathname]);

  const hasAccess = (viewId) => {
    if (isAdmin) return true;
    if (!userData) return false;
    if (!userData.allowedViews) return true; 
    return userData.allowedViews.includes(viewId);
  };

  const navItems = [
    { id: 'dashboard', label: 'Inicio', icon: LayoutDashboard, path: '/' },
    { id: 'general', label: 'Inventario', icon: Package, path: '/general' },
    { id: 'transactions', label: 'Actividad', icon: Activity, path: '/transactions' },
  ];

  const menuItems = [
    { id: 'tornilleria', label: 'Tornillería', icon: Wrench, path: '/tornilleria', color: '#0071e3' },
    { id: 'papeleria', label: 'Papelería', icon: PenTool, path: '/papeleria', color: '#ff9500' },
    { id: 'herramientas', label: 'Herramientas', icon: Package, path: '/herramientas', color: '#5856d6' },
    { id: 'impresion-3d', label: 'Impresión 3D', icon: Printer, path: '/impresion-3d', color: '#af52de' },
    { id: 'electronica', label: 'Electrónica', icon: Cpu, path: '/electronica', color: '#ff2d55' },
    { id: 'almacen-temporal', label: 'Almacén Temp', icon: Archive, path: '/almacen-temporal', color: '#636366' },
    { id: 'parques', label: 'Parques', icon: Landmark, path: '/parques', color: '#34c759' },
    { id: 'facturas', label: 'Facturas', icon: FileText, path: '/facturas', color: '#a2845e' },
    { id: 'analytics', label: 'Analíticas', icon: BarChart3, path: '/analytics', color: '#0071e3' },
  ];

  // Agrupar custom categories
  const dynamicMenuItems = (customCategories || []).map(cat => ({
    id: `custom_${cat.id}`,
    label: cat.name,
    icon: Package, // Podemos usar un ícono genérico, o buscar el mapeo de íconos si se exporta de SectionAdminView
    path: cat.route || `/custom/${cat.id}`,
    color: cat.color || '#3b82f6'
  }));

  const allMenuItems = [...menuItems, ...dynamicMenuItems];

  return (
    <>
      <nav className="mobile-bottom-nav">
        {navItems.map(item => {
          if (!hasAccess(item.id)) return null;
          const isActive = location.pathname === item.path;
          const Icon = item.icon;
          return (
            <NavLink 
              key={item.id} 
              to={item.path} 
              className={`bottom-nav-item ${isActive ? 'active' : ''}`}
            >
              <div className="bottom-nav-icon-wrapper">
                <Icon size={22} className={isActive ? 'filled-icon' : ''} />
              </div>
              <span className="bottom-nav-label">{item.label}</span>
            </NavLink>
          );
        })}
        
        <button 
          className={`bottom-nav-item ${isMenuOpen ? 'active' : ''}`}
          onClick={() => setIsMenuOpen(!isMenuOpen)}
        >
          <div className="bottom-nav-icon-wrapper">
            <Menu size={22} />
          </div>
          <span className="bottom-nav-label">Menú</span>
        </button>
      </nav>

      {/* Bottom Sheet Menu */}
      {isMenuOpen && (
        <>
          <div className="bottom-sheet-overlay" onClick={() => setIsMenuOpen(false)} />
          <div className="bottom-sheet animate-slide-up-sheet">
            <div className="bottom-sheet-header">
              <h3>Más Opciones</h3>
              <button className="bottom-sheet-close" onClick={() => setIsMenuOpen(false)}>
                <X size={24} />
              </button>
            </div>
            
            <div className="bottom-sheet-content">
              <div className="bottom-sheet-grid">
                {allMenuItems.map(item => {
                  if (item.id.startsWith('custom_') ? !hasAccess(item.id.replace('custom_', '')) : !hasAccess(item.id)) return null;
                  const Icon = item.icon;
                  return (
                    <div 
                      key={item.id} 
                      className="bottom-sheet-card"
                      onClick={() => navigate(item.path)}
                    >
                      <div className="bottom-sheet-icon" style={{ backgroundColor: `${item.color}15`, color: item.color }}>
                        <Icon size={24} />
                      </div>
                      <span>{item.label}</span>
                    </div>
                  );
                })}
              </div>

              <div className="bottom-sheet-divider" />

              <div className="bottom-sheet-list">
                <div className="bottom-sheet-list-item" onClick={() => navigate('/profile')}>
                  <User size={20} /> Mi Perfil
                </div>
                {isStaff && (
                  <div className="bottom-sheet-list-item" onClick={() => navigate('/sections')}>
                    <Settings size={20} /> Secciones
                  </div>
                )}
                {isAdmin && (
                  <>
                    <div className="bottom-sheet-list-item" onClick={() => navigate('/users')}>
                      <Users size={20} /> Equipo
                    </div>
                    <div className="bottom-sheet-list-item" onClick={() => navigate('/settings')}>
                      <Settings size={20} /> Ajustes
                    </div>
                  </>
                )}
                <div className="bottom-sheet-list-item text-danger" onClick={logout}>
                  <LogOut size={20} /> Cerrar Sesión
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </>
  );
};

export default MobileBottomNav;
