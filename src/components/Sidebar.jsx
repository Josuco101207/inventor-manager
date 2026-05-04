import React, { useState, useEffect } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { 
  Package, Wrench, PenTool, Cpu, Printer, Landmark,
  LayoutDashboard, Settings, User, LogOut, ShieldCheck, Users, Layers, Archive, History, Activity,
  Menu, X
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import './Sidebar.css';

const Sidebar = () => {
  const { logout, userData, isAdmin } = useAuth();
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
    // Retrocompatibilidad: Si no tiene el campo, tiene acceso total por defecto
    if (!userData.allowedViews) return true; 
    return userData.allowedViews.includes(viewId);
  };

  return (
    <>
      {/* Hamburger Button — visible only on tablet/mobile */}
      <button 
        className={`hamburger-btn ${isOpen ? 'hamburger-open' : ''}`} 
        onClick={() => setIsOpen(!isOpen)}
        aria-label="Toggle menu"
      >
        {isOpen ? <X size={22} /> : <Menu size={22} />}
      </button>

      {/* Overlay */}
      {isOpen && (
        <div className="sidebar-overlay" onClick={() => setIsOpen(false)} />
      )}

      <aside className={`sidebar ${isOpen ? 'sidebar-mobile-open' : ''}`}>
        <div className="sidebar-header">
          <div className="logo-icon flex items-center justify-center">
            <Package size={28} color="#ffffff" />
          </div>
          <div className="flex flex-col">
            <h1 className="text-xl sidebar-title">Inventario</h1>
            {isAdmin && (
              <span className="badge badge-success flex items-center gap-1" style={{ fontSize: '10px', padding: '2px 8px' }}>
                <ShieldCheck size={10} /> MODO ADMIN
              </span>
            )}
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
            {hasAccess('transactions') && (
              <li>
                <NavLink to="/transactions" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
                  <History size={20} />
                  <span>Transacciones</span>
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
            <div className="avatar-small bg-primary flex items-center justify-center rounded-full shadow-sm" style={{ width: '32px', height: '32px', minWidth: '32px', backgroundColor: '#0071e3', color: '#fff' }}>
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
