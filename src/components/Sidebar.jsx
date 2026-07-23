import React, { useState, useEffect } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { 
  Package, Wrench, PenTool, Cpu, Printer, Landmark,
  LayoutDashboard, Settings, User, LogOut, ShieldCheck, Users, Layers, Archive, History, Activity,
  Menu, X, FileText, Box, Tag, Key, MapPin, ClipboardList
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useInventory } from '../context/InventoryContextOptimized';
import { useCustomCategories } from '../context/CustomCategoriesContext';
import './Sidebar.css';

const Sidebar = () => {
  const { logout, userData, isAdmin, isStaff } = useAuth();
  const { customCategories } = useCustomCategories(); // <== AGREGADO
  const [isOpen, setIsOpen] = useState(false);
  const location = useLocation();

  // Close sidebar on route change (mobile)
  useEffect(() => {
    setIsOpen(false);
  }, [location.pathname]);

  // Prevent body scroll when sidebar is open on mobile
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [isOpen]);

  const hasAccess = (viewId) => {
    if (isAdmin) return true;
    if (!userData) return false;
    if (!userData.allowedViews) return true; 
    return userData.allowedViews.includes(viewId);
  };

  return (
    <>
      <button 
        className={`hamburger-btn ${isOpen ? 'hamburger-open' : ''}`} 
        onClick={() => setIsOpen(!isOpen)}
        aria-label="Menu"
      >
        {isOpen ? <X size={24} /> : <Menu size={24} />}
      </button>

      {isOpen && (
        <div className="sidebar-overlay" onClick={() => setIsOpen(false)} />
      )}

      <aside className={`sidebar ${isOpen ? 'sidebar-mobile-open' : ''}`}>
        <div className="sidebar-header">
          <div className="logo-container">
            <div className="logo-icon">
              <Package size={22} color="#ffffff" />
            </div>
            <div className="sidebar-brand">
              <h1 className="sidebar-title">Inventario</h1>
              {isAdmin && <span className="sidebar-subtitle">Modo Admin</span>}
            </div>
          </div>
        </div>
      
        <nav className="sidebar-nav">
          <ul>
            {hasAccess('dashboard') && (
              <li>
                <NavLink to="/" end className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
                  <LayoutDashboard size={20} />
                  <span>Dashboard</span>
                </NavLink>
              </li>
            )}
            {hasAccess('tornilleria') && (
              <li>
                <NavLink to="/tornilleria" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
                  <Wrench size={20} />
                  <span>Tornillería</span>
                </NavLink>
              </li>
            )}
            {hasAccess('papeleria') && (
              <li>
                <NavLink to="/papeleria" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
                  <PenTool size={20} />
                  <span>Papelería</span>
                </NavLink>
              </li>
            )}
            {hasAccess('herramientas') && (
              <li>
                <NavLink to="/herramientas" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
                  <Package size={20} />
                  <span>Herramientas</span>
                </NavLink>
              </li>
            )}
            {hasAccess('impresion-3d') && (
              <li>
                <NavLink to="/impresion-3d" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
                  <Printer size={20} />
                  <span>Impresión 3D</span>
                </NavLink>
              </li>
            )}
            {hasAccess('electronica') && (
              <li>
                <NavLink to="/electronica" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
                  <Cpu size={20} />
                  <span>Electrónica</span>
                </NavLink>
              </li>
            )}
            {hasAccess('general') && (
              <li>
                <NavLink to="/general" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
                  <Layers size={20} />
                  <span>Inventario General</span>
                </NavLink>
              </li>
            )}
            {hasAccess('almacen-temporal') && (
              <li>
                <NavLink to="/almacen-temporal" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
                  <Archive size={20} />
                  <span>Almacén Temporal</span>
                </NavLink>
              </li>
            )}
            {hasAccess('parques') && (
              <li>
                <NavLink to="/parques" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
                  <Landmark size={20} />
                  <span>Parques</span>
                </NavLink>
              </li>
            )}
            {hasAccess('requisiciones') && (
              <li>
                <NavLink to="/requisiciones" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
                  <ClipboardList size={20} />
                  <span>Requisiciones Prod.</span>
                </NavLink>
              </li>
            )}
            
            {/* ─── DYNAMIC CATEGORIES ─── */}
            {customCategories?.map(cat => {
              // Si no tiene permiso, lo ocultamos. Como son dinámicas, puedes darle acceso por defecto si es admin, o si explícitamente se le dio acceso a la vista con el ID de la categoría.
              if (!hasAccess(cat.id) && !isAdmin) return null;
              
              // Mapeo básico de iconos dinámicos
              const IconComp = {
                Layers: <Layers size={20} />,
                Box: <Box size={20} />,
                Tag: <Tag size={20} />,
                Key: <Key size={20} />,
                LayoutDashboard: <LayoutDashboard size={20} />
              }[cat.icon] || <Layers size={20} />;

              return (
                <li key={cat.id}>
                  <NavLink to={cat.route} className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
                    {IconComp}
                    <span>{cat.name}</span>
                  </NavLink>
                </li>
              );
            })}

            {hasAccess('transactions') && (
              <li>
                <NavLink to="/transactions" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
                  <History size={20} />
                  <span>Transacciones</span>
                </NavLink>
              </li>
            )}
            {hasAccess('facturas') && (
              <li>
                <NavLink to="/facturas" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
                  <FileText size={20} />
                  <span>Facturas</span>
                </NavLink>
              </li>
            )}
            {hasAccess('analytics') && (
              <li>
                <NavLink to="/analytics" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
                  <Activity size={20} />
                  <span>Analíticas</span>
                </NavLink>
              </li>
            )}
          </ul>
        </nav>

        <div className="sidebar-footer">
          <div className="user-profile-mini">
            <div className="user-avatar">
              <User size={16} />
            </div>
            <div className="user-details">
              <p className="user-name-text">
                {userData?.name || userData?.displayName || 'Usuario'}
              </p>
              <p className="user-email-text">
                {userData?.email}
              </p>
            </div>
          </div>

          <ul className="mt-4">
            <li>
              <NavLink to="/profile" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
                <User size={20} />
                <span>Mi Perfil</span>
              </NavLink>
            </li>
            {isStaff && (
              <li>
                <NavLink to="/sections" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
                  <Layers size={20} />
                  <span>Secciones</span>
                </NavLink>
              </li>
            )}
            {isAdmin && (
              <>
                <li>
                  <NavLink to="/users" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
                    <Users size={20} />
                    <span>Equipo</span>
                  </NavLink>
                </li>
                <li>
                  <NavLink to="/settings" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
                    <Settings size={20} />
                    <span>Ajustes</span>
                  </NavLink>
                </li>
              </>
            )}
            <li>
              <button onClick={logout} className="nav-item logout w-full text-left">
                <LogOut size={20} className="text-danger" />
                <span className="text-danger">Cerrar Sesión</span>
              </button>
            </li>
          </ul>
        </div>
      </aside>
    </>
  );
};

export default Sidebar;
