import React from 'react';
import Header from '../components/Header';
import { User, Shield, Clock, TrendingUp, BarChart3, Mail, Calendar } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useInventory } from '../context/InventoryContextOptimized';
import './ProfileView.css';

const ProfileView = () => {
  const { userData, isAdmin } = useAuth();
  const { movements, items } = useInventory();

  // Filter movements for this specific user
  const myMovements = movements.filter(m => m.user === (userData?.name || userData?.displayName || userData?.email));
  const myActionsCount = myMovements.length;

  return (
    <div className="profile-view animate-fade-in w-full">
      <Header />
      
      <div className="profile-container flex flex-col lg:flex-row gap-8">
        
        {/* Left Sidebar: User Info */}
        <div className="w-full lg:w-1/3">
          <div className="profile-header-card">
            <div className="profile-header-bg"></div>
            
            <div className="avatar-wrapper">
              <User size={40} color="#fff" />
            </div>
            
            <h2 className="profile-name">{userData?.name || userData?.displayName || 'Usuario'}</h2>
            
            <div className="profile-email">
              <Mail size={14} /> {userData?.email}
            </div>
            
            <div className={`role-badge ${isAdmin ? 'admin' : ''}`}>
              <Shield size={14} /> {userData?.role || 'Usuario'}
            </div>
            
            <div className="profile-stats-grid">
              <div className="stat-box">
                <span className="stat-value">{myActionsCount}</span>
                <span className="stat-label">Mis Movs</span>
              </div>
              <div className="stat-box">
                <span className="stat-value">{items.length}</span>
                <span className="stat-label">SKUs</span>
              </div>
              <div className="stat-box">
                <span className="stat-value text-blue-500">100%</span>
                <span className="stat-label">Activo</span>
              </div>
            </div>
          </div>
        </div>

        {/* Right Section: Activity and Stats */}
        <div className="w-full lg:w-2/3 flex flex-col gap-6">
          
          <div className="flex gap-6">
            <div className="cupertino-card flex-1 mini-stat-card">
              <div className="mini-stat-icon">
                <BarChart3 size={20} />
              </div>
              <p>Total Artículos en Sistema</p>
              <h4>{items.length}</h4>
            </div>
            
            <div className="cupertino-card flex-1 mini-stat-card">
              <div className="mini-stat-icon" style={{ color: '#34c759', background: '#e8f8ec' }}>
                <TrendingUp size={20} />
              </div>
              <p>Estado de Sesión</p>
              <h4 style={{ color: '#34c759' }}>CONECTADO</h4>
            </div>
          </div>

          <div className="cupertino-card" style={{ flex: 1 }}>
            <h3 className="card-title">
              <Clock size={20} color="#0071e3" />
              Tu Actividad Reciente
            </h3>
            
            <div className="flex flex-col gap-3">
              {myMovements.length > 0 ? myMovements.slice(0, 5).map(mov => (
                <div key={mov.id} className="feed-item">
                  <div 
                    className="feed-dot" 
                    style={{ backgroundColor: mov.action === 'Entrada' ? '#34c759' : '#ff3b30' }}
                  ></div>
                  <div className="feed-content">
                    <p className="action-text">{mov.action}: {mov.item}</p>
                    <p className="date-text">
                      <Calendar size={12} /> 
                      {mov.timestamp?.toDate().toLocaleString() || mov.time}
                    </p>
                  </div>
                </div>
              )) : (
                <div className="py-8 text-center" style={{ background: '#f5f5f7', borderRadius: '16px' }}>
                  <p className="text-muted text-sm font-medium">Aún no has registrado movimientos.</p>
                </div>
              )}
            </div>
          </div>

        </div>
      </div>
    </div>
  );
};

export default ProfileView;
