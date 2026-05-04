import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Sidebar from './components/Sidebar';
import Dashboard from './components/Dashboard';
import InventoryView from './views/InventoryView';
import SettingsView from './views/SettingsView';
import ProfileView from './views/ProfileView';
import UserManagementView from './views/UserManagementView';
import LoginView from './views/LoginView';
import ParquesView from './views/ParquesView';
import AnalyticsView from './views/AnalyticsView';
import TransactionsView from './views/TransactionsView';
import ToolsView from './views/ToolsView';
import { InventoryProvider, useInventory } from './context/InventoryContext';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ThemeProvider } from './context/ThemeContext';
import { Toaster, toast } from 'sonner';
import { Loader2, Lock } from 'lucide-react';

const RootApp = () => {
  const { user, loading, userData, isAdmin } = useAuth();

  if (loading) {
    return (
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100vh',
        width: '100vw',
        flexDirection: 'column',
        gap: '1rem',
        backgroundColor: 'hsl(var(--bg-main))',
        color: 'hsl(var(--text-main))',
        transition: 'background-color 0.3s'
      }}>
        <Loader2 className="animate-spin" style={{ color: 'hsl(var(--primary))' }} size={60} />
        <p style={{ fontWeight: '800', letterSpacing: '0.1em', textTransform: 'uppercase', fontSize: '0.75rem', opacity: 0.6 }}>
          Validando Sesión...
        </p>
      </div>
    );
  }

  const hasViewAccess = (viewId) => {
    if (isAdmin) return true;
    const defaultAllowed = ['dashboard', 'profile'];
    if (defaultAllowed.includes(viewId)) return true;
    if (!userData) return false;
    // Retrocompatibilidad: Si no tiene el campo (usuario antiguo), tiene acceso
    if (!userData.allowedViews) return true;
    return userData.allowedViews.includes(viewId);
  };

  const ViewProtectedRoute = ({ viewId, children }) => {
    if (loading) return null;
    if (hasViewAccess(viewId)) return children;
    
    return (
      <div className="flex flex-col items-center justify-center h-full p-8 text-center animate-fade-in">
        <div className="w-20 h-20 bg-red-50 dark:bg-red-900/20 text-red-500 rounded-full flex items-center justify-center mb-6">
          <Lock size={40} />
        </div>
        <h2 className="text-2xl font-black mb-2">Acceso Restringido</h2>
        <p className="text-muted max-w-xs mx-auto mb-8">
          No tienes permisos para ver esta sección. Contacta a un administrador para solicitar acceso.
        </p>
        <button className="btn-apple-primary px-8" onClick={() => window.location.href = '/'}>
          Volver al Inicio
        </button>
      </div>
    );
  };

  if (!user) {
    return <LoginView />;
  }

  return (
    <Router>
      <div className="app-container">
        <Sidebar />
        <main className="main-content">
          <Routes>
            <Route path="/" element={<ViewProtectedRoute viewId="dashboard"><Dashboard /></ViewProtectedRoute>} />
            <Route path="/tornilleria" element={<ViewProtectedRoute viewId="tornilleria"><InventoryView categoryTitle="Tornillería" /></ViewProtectedRoute>} />
            <Route path="/papeleria" element={<ViewProtectedRoute viewId="papeleria"><InventoryView categoryTitle="Papelería" /></ViewProtectedRoute>} />
            <Route path="/herramientas" element={<ViewProtectedRoute viewId="herramientas"><ToolsView /></ViewProtectedRoute>} />
            <Route path="/impresion-3d" element={<ViewProtectedRoute viewId="impresion-3d"><InventoryView categoryTitle="Impresión 3D" /></ViewProtectedRoute>} />
            <Route path="/electronica" element={<ViewProtectedRoute viewId="electronica"><InventoryView categoryTitle="Electrónica" /></ViewProtectedRoute>} />
            <Route path="/general" element={<ViewProtectedRoute viewId="general"><InventoryView categoryTitle="Inventario General" /></ViewProtectedRoute>} />
            <Route path="/almacen-temporal" element={<ViewProtectedRoute viewId="almacen-temporal"><InventoryView categoryTitle="Almacén Temporal" /></ViewProtectedRoute>} />
            <Route path="/parques" element={<ViewProtectedRoute viewId="parques"><ParquesView /></ViewProtectedRoute>} />
            <Route path="/analytics" element={<ViewProtectedRoute viewId="analytics"><AnalyticsView /></ViewProtectedRoute>} />
            <Route path="/transactions" element={<ViewProtectedRoute viewId="transactions"><TransactionsView /></ViewProtectedRoute>} />
            <Route path="/settings" element={isAdmin ? <SettingsView /> : <Navigate to="/" />} />
            <Route path="/profile" element={<ProfileView />} />
            <Route path="/users" element={isAdmin ? <UserManagementView /> : <Navigate to="/" />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </main>
      </div>
      <Toaster position="top-right" richColors closeButton />
    </Router>
  );
};

function App() {
  return (
    <AuthProvider>
      <ThemeProvider>
        <InventoryProvider>
          <RootApp />
        </InventoryProvider>
      </ThemeProvider>
    </AuthProvider>
  );
}

export default App;
