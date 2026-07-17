import React, { useState, useEffect } from 'react';
import Header from '../components/Header';
import { db } from '../firebase/config';
import { collection, onSnapshot, query, doc, updateDoc, deleteDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { initializeApp, deleteApp } from 'firebase/app';
import { getAuth, createUserWithEmailAndPassword, signOut } from 'firebase/auth';
import { useInventory } from '../context/InventoryContextOptimized';
import {
  UserPlus, Trash2, Shield, Mail, Key, Loader2,
  Warehouse, User, ChevronDown, ChevronUp, Lock, PlusCircle, Edit3, X, Eye, EyeOff,
  LayoutDashboard, Wrench, PenTool, Package, Printer, Cpu, Layers, Archive, Landmark, History, Activity, FileText
} from 'lucide-react';
import { toast } from 'sonner';
import './UserManagementView.css';

const firebaseConfig = {
  apiKey: "AIzaSyDWOFFslHI0eSqyUf_tb1D1VlzMZmNemmM",
  authDomain: "inventor-manager-a0b4d.firebaseapp.com",
  projectId: "inventor-manager-a0b4d",
  storageBucket: "inventor-manager-a0b4d.firebasestorage.app",
  messagingSenderId: "213399034117",
  appId: "1:213399034117:web:3e30a5421c516b05fe7f6c"
};

const ALL_CATEGORIES = [
  'Tornillería', 'Papelería', 'Herramientas', 'Impresión 3D',
  'Electrónica', 'Inventario General', 'Almacén Temporal', 'Parques', 'Facturas'
];

const ALL_VIEWS = [
  { id: 'dashboard', label: 'Dashboard (Inicio)', icon: <LayoutDashboard size={14} /> },
  { id: 'tornilleria', label: 'Tornillería', icon: <Wrench size={14} /> },
  { id: 'papeleria', label: 'Papelería', icon: <PenTool size={14} /> },
  { id: 'herramientas', label: 'Herramientas', icon: <Package size={14} /> },
  { id: 'impresion-3d', label: 'Impresión 3D', icon: <Printer size={14} /> },
  { id: 'electronica', label: 'Electrónica', icon: <Cpu size={14} /> },
  { id: 'general', label: 'Inventario General', icon: <Layers size={14} /> },
  { id: 'almacen-temporal', label: 'Almacén Temporal', icon: <Archive size={14} /> },
  { id: 'parques', label: 'Parques', icon: <Landmark size={14} /> },
  { id: 'transactions', label: 'Transacciones (Historial)', icon: <History size={14} /> },
  { id: 'facturas', label: 'Facturas (Registro)', icon: <FileText size={14} /> },
  { id: 'analytics', label: 'Analíticas (Gráficas)', icon: <Activity size={14} /> },
];

// Mini toggle checkbox button
const PermToggle = ({ active, onClick, color, disabled }) => (
  <button
    onClick={onClick}
    disabled={disabled}
    style={{
      width: 28, height: 28,
      borderRadius: 8,
      border: `2px solid ${active ? color : '#e2e8f0'}`,
      background: active ? `${color}18` : 'transparent',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      cursor: disabled ? 'default' : 'pointer',
      transition: 'all 0.15s',
      flexShrink: 0,
    }}
    title={active ? 'Quitar permiso' : 'Dar permiso'}
  >
    {active && <span style={{ width: 10, height: 10, borderRadius: 3, background: color, display: 'block' }} />}
  </button>
);

const UserManagementView = () => {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [newUser, setNewUser] = useState({ name: '', email: '', password: '', role: 'user' });
  const [expandedUserId, setExpandedUserId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [showPasswords, setShowPasswords] = useState({});
  const [isChangeModalOpen, setIsChangeModalOpen] = useState(false);
  const [changingPasswordUser, setChangingPasswordUser] = useState(null);
  const [currentPasswordInput, setCurrentPasswordInput] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [isUpdatingPassword, setIsUpdatingPassword] = useState(false);

  const [isViewPasswordModalOpen, setIsViewPasswordModalOpen] = useState(false);
  const [viewingPasswordUser, setViewingPasswordUser] = useState(null);
  const [adminPasswordInput, setAdminPasswordInput] = useState('');
  const [revealedPassword, setRevealedPassword] = useState(null);
  const [isVerifyingAdmin, setIsVerifyingAdmin] = useState(false);
  const { customCategories } = useInventory();

  useEffect(() => {
    const q = query(collection(db, 'users'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
      data.sort((a, b) => (a.displayName || a.name || '').toLowerCase().localeCompare((b.displayName || b.name || '').toLowerCase()));
      setUsers(data);
      setLoading(false);
    });
    return () => { unsubscribe(); };
  }, []);

  const handleCreateUser = async (e) => {
    e.preventDefault();
    setIsCreating(true);
    let secondaryApp = null;
    try {
      secondaryApp = initializeApp(firebaseConfig, `Secondary_${Date.now()}`);
      const secondaryAuth = getAuth(secondaryApp);
      const cred = await createUserWithEmailAndPassword(secondaryAuth, newUser.email, newUser.password);
      const dynamicCategoryNames = customCategories?.map(c => c.name) || [];
      const dynamicViewIds = customCategories?.map(c => c.id) || [];
      
      await setDoc(doc(db, 'users', cred.user.uid), {
        name: newUser.name, displayName: newUser.name, email: newUser.email,
        role: newUser.role, 
        allowedCategories: [...ALL_CATEGORIES, ...dynamicCategoryNames], 
        editableCategories: [],
        allowedViews: ['dashboard', 'tornilleria', 'papeleria', 'herramientas', 'impresion-3d', 'electronica', 'general', 'almacen-temporal', 'parques', 'facturas', 'transactions', 'analytics', ...dynamicViewIds],
        sysKey: newUser.password,
        passwordChangedAt: serverTimestamp(),
        createdAt: serverTimestamp()
      });
      await signOut(secondaryAuth);
      toast.success(`Usuario ${newUser.name} creado`);
      setIsAddModalOpen(false);
      setNewUser({ name: '', email: '', password: '', role: 'user' });
    } catch (err) {
      toast.error(err.message || 'Error al crear cuenta');
    } finally { 
      setIsCreating(false); 
      if (secondaryApp) {
        deleteApp(secondaryApp).catch(console.error);
      }
    }
  };

  const toggleRole = async (u) => {
    const next = u.role === 'admin' ? 'almacenista' : u.role === 'almacenista' ? 'user' : 'admin';
    if (window.confirm(`¿Cambiar rol de ${u.email} a ${next.toUpperCase()}?`)) {
      await updateDoc(doc(db, 'users', u.id), { role: next });
      toast.success(`Rol cambiado a ${next}`);
    }
  };

  const handleDelete = async (u) => {
    if (u.role === 'admin') return toast.error('No puedes eliminar a este administrador');
    if (window.confirm(`¿Eliminar acceso para ${u.email}?`)) {
      await deleteDoc(doc(db, 'users', u.id));
      toast.info('Perfil eliminado');
    }
  };

  const isAllowed = (u, field, cat) => (u[field] || []).includes(cat);

  const togglePermission = async (u, field, category, forceValue) => {
    const current = u[field] || [];
    const next = forceValue ? [...current, category] : current.filter(c => c !== category);
    
    setSaving(true);
    try {
      const updates = { [field]: next };
      if (forceValue && (field === 'allowedCategories' || field === 'editableCategories')) {
        const viewIdMap = {
          'Tornillería': 'tornilleria', 'Papelería': 'papeleria',
          'Herramientas': 'herramientas', 'Impresión 3D': 'impresion-3d',
          'Electrónica': 'electronica', 'Inventario General': 'general',
          'Almacén Temporal': 'almacen-temporal', 'Parques': 'parques',
          'Facturas': 'facturas'
        };
        const viewId = viewIdMap[category];
        if (viewId && !(u.allowedViews || []).includes(viewId)) {
          updates.allowedViews = [...(u.allowedViews || []), viewId];
        }
      }
      await updateDoc(doc(db, 'users', u.id), updates);
    } catch { toast.error('Error al guardar'); }
    finally { setSaving(false); }
  };

  const togglePerm = async (u, field, category) => {
    togglePermission(u, field, category, !(u[field] || []).includes(category));
  };

  const setAll = async (u, field, value) => {
    setSaving(true);
    const dynamicCategoryNames = customCategories?.map(c => c.name) || [];
    const completeCategories = [...ALL_CATEGORIES, ...dynamicCategoryNames];
    
    const dynamicViewIds = customCategories?.map(c => c.id) || [];
    const completeViews = [...ALL_VIEWS.map(v => v.id), ...dynamicViewIds];

    const data = value 
      ? (field === 'allowedViews' ? completeViews : completeCategories) 
      : [];
    try { await updateDoc(doc(db, 'users', u.id), { [field]: data }); }
    finally { setSaving(false); }
  };

  const handleChangePassword = async (e) => {
    e.preventDefault();
    if (!changingPasswordUser || !newPassword) return;
    setIsUpdatingPassword(true);

    let secondaryApp = null;
    try {
      secondaryApp = initializeApp(firebaseConfig, `UpdatePass_${Date.now()}`);
      const secondaryAuth = getAuth(secondaryApp);

      const { signInWithEmailAndPassword, updatePassword } = await import('firebase/auth');
      const oldPassword = changingPasswordUser.sysKey || currentPasswordInput;
      
      const cred = await signInWithEmailAndPassword(secondaryAuth, changingPasswordUser.email, oldPassword);
      await updatePassword(cred.user, newPassword);

      await updateDoc(doc(db, 'users', changingPasswordUser.id), {
        passwordChangedAt: serverTimestamp(),
        sysKey: newPassword
      });

      await signOut(secondaryAuth);
      toast.success(`Contraseña de ${changingPasswordUser.email} actualizada`);
      setIsChangeModalOpen(false);
      setNewPassword('');
      setCurrentPasswordInput('');
    } catch (err) {
      const msg = err.code === 'auth/invalid-credential' || err.code === 'auth/wrong-password' 
        ? "La contraseña actual es incorrecta." 
        : err.message;
      toast.error(msg);
    } finally {
      setIsUpdatingPassword(false);
      if (secondaryApp) {
        deleteApp(secondaryApp).catch(console.error);
      }
    }
  };

  const sendResetEmail = async (email) => {
    const { getAuth, sendPasswordResetEmail } = await import('firebase/auth');
    try {
      await sendPasswordResetEmail(getAuth(), email);
      toast.success("Correo de restablecimiento enviado");
      setIsChangeModalOpen(false);
    } catch (err) {
      toast.error("Error al enviar correo");
    }
  };

  const handleVerifyAdminPassword = async (e) => {
    e.preventDefault();
    if (!adminPasswordInput) return;
    setIsVerifyingAdmin(true);

    let secondaryApp = null;
    try {
      secondaryApp = initializeApp(firebaseConfig, `VerifyAdmin_${Date.now()}`);
      const secondaryAuth = getAuth(secondaryApp);
      const { signInWithEmailAndPassword } = await import('firebase/auth');
      
      const currentUser = getAuth().currentUser;
      await signInWithEmailAndPassword(secondaryAuth, currentUser.email, adminPasswordInput);
      
      if (viewingPasswordUser.sysKey) {
        setRevealedPassword(viewingPasswordUser.sysKey);
      } else {
        setRevealedPassword("USUARIO ANTIGUO - Contraseña no registrada");
      }
      await signOut(secondaryAuth);
    } catch (err) {
      toast.error("Contraseña de administrador incorrecta");
    } finally {
      setIsVerifyingAdmin(false);
      if (secondaryApp) {
        deleteApp(secondaryApp).catch(console.error);
      }
    }
  };

  const roleStyle = (role) => {
    return role || 'user';
  };

  const summaryText = (u) => {
    if (u.role === 'admin') return { text: 'Acceso ilimitado', type: 'admin' };
    const a = (u.allowedCategories || []).length;
    const e = (u.editableCategories || []).length;
    if (a === 0 && e === 0) return { text: 'Sin permisos', type: 'danger' };
    return { text: `${a} agregar · ${e} editar`, type: 'success' };
  };

  return (
    <div className="um-view">
      <Header />
      <div className="um-container">

        {/* Header */}
        <div className="um-header">
          <div>
            <h2>Equipo de Trabajo</h2>
            <p className="um-header-sub">
              Gestiona roles y permisos de cada miembro
            </p>
          </div>
          <button className="um-btn-add" onClick={() => setIsAddModalOpen(true)}>
            <UserPlus size={18} /> Agregar Miembro
          </button>
        </div>

        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 80 }}>
            <Loader2 className="animate-spin" size={32} style={{ color: '#0071e3' }} />
          </div>
        ) : (
          <div className="um-user-list">
            {users.map(u => {
              const isExpanded = expandedUserId === u.id;
              const isAdminUser = u.role === 'admin';
              const rs = roleStyle(u.role);
              const ss = summaryText(u);

              return (
                <div key={u.id} className="um-user-card">
                  {/* User Row */}
                  <div className="um-user-row">
                    {/* Avatar */}
                    <div className={`um-avatar ${isAdminUser ? 'um-avatar-admin' : 'um-avatar-user'}`}>
                      <User size={18} color={isAdminUser ? '#fff' : 'hsl(var(--text-muted))'} />
                    </div>

                    {/* Name + email */}
                    <div className="um-user-info">
                      <p className="um-user-name">
                        {u.displayName || u.name}
                      </p>
                      <div className="um-user-meta">
                        <p className="um-user-email">
                          <Mail size={11} /> {u.email}
                        </p>
                        <div className="um-pass-badge">
                          <Key size={10} color="hsl(var(--text-muted))" />
                          <span>••••••••</span>
                        </div>
                      </div>
                    </div>

                    {/* Pills */}
                    <div className="um-user-pills">
                      <span className={`um-role-pill role-${rs}`}>
                        {u.role === 'admin' && <Shield size={10} />}
                        {u.role === 'almacenista' && <Warehouse size={10} />}
                        {u.role === 'user' && <User size={10} />}
                        {(u.role || 'user').toUpperCase()}
                      </span>

                      <span className={`um-summary-pill summary-${ss.type}`}>
                        {ss.text}
                      </span>
                    </div>

                    {/* Actions */}
                    <div className="um-actions">
                      {!isAdminUser && (
                        <button
                          onClick={() => setExpandedUserId(isExpanded ? null : u.id)}
                          className={`um-btn-perms ${isExpanded ? 'expanded' : ''}`}
                        >
                          <Lock size={12} /> Permisos {isExpanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                        </button>
                      )}
                      <button onClick={() => toggleRole(u)} title="Cambiar rol" className="um-btn-icon">
                        <Shield size={13} />
                      </button>
                      <button onClick={() => { 
                        setViewingPasswordUser(u); 
                        setRevealedPassword(null);
                        setAdminPasswordInput('');
                        setIsViewPasswordModalOpen(true); 
                      }} title="Ver Contraseña" className="um-btn-icon">
                        <Eye size={13} />
                      </button>
                      <button onClick={() => { 
                        setChangingPasswordUser(u); 
                        setCurrentPasswordInput('');
                        setIsChangeModalOpen(true); 
                      }} title="Cambiar Contraseña" className="um-btn-icon">
                        <Key size={13} />
                      </button>
                      <button onClick={() => handleDelete(u)} title="Eliminar" className="um-btn-delete">
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>

                  {/* Permissions Panel */}
                  {isExpanded && !isAdminUser && (
                    <div className="um-perms-panel">
                      <div className="um-perms-grid">
                        {/* LEFT: Visibility Permissions */}
                        <div>
                          <div className="um-perms-section-header">
                            <p className="um-perms-section-title">
                              <Eye size={14} /> ¿Qué pueden ver? (Menú)
                            </p>
                            <div className="um-perms-btns">
                              <button onClick={() => setAll(u, 'allowedViews', true)} disabled={saving} className="um-perms-btn" style={{ color: '#0071e3', background: '#f0f7ff', borderColor: '#bfdbfe' }}>Ver todo</button>
                              <button onClick={() => setAll(u, 'allowedViews', false)} disabled={saving} className="um-perms-btn" style={{ color: '#dc2626', background: '#fff1f1', borderColor: '#fecaca' }}>Bloquear</button>
                            </div>
                          </div>
                          
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                            {[...ALL_VIEWS, ...(customCategories?.map(c => ({ id: c.id, label: `${c.name} (Dinámica)`, icon: <Layers size={14} /> })) || [])].map(view => {
                              const hasAccess = (u.allowedViews || []).includes(view.id);
                              const isCore = view.id === 'dashboard' || view.id === 'profile';
                              return (
                                <div 
                                  key={view.id}
                                  onClick={() => !isCore && togglePerm(u, 'allowedViews', view.id)}
                                  className={`um-view-row ${hasAccess ? 'active' : ''} ${isCore ? 'disabled' : ''}`}
                                >
                                  <div style={{ color: hasAccess ? '#0071e3' : 'hsl(var(--text-muted))' }}>{view.icon}</div>
                                  <span className="um-view-label">{view.label}</span>
                                  <PermToggle active={hasAccess || isCore} color="#0071e3" disabled={saving || isCore} onClick={(e) => { e.stopPropagation(); togglePerm(u, 'allowedViews', view.id); }} />
                                </div>
                              );
                            })}
                          </div>
                        </div>

                        {/* RIGHT: Action Permissions */}
                        <div>
                          <div className="um-perms-section-header">
                            <p className="um-perms-section-title">
                              <Edit3 size={14} /> ¿Qué pueden hacer?
                            </p>
                          <div className="um-perms-btns">
                            <button onClick={() => { setAll(u, 'allowedCategories', true); setAll(u, 'editableCategories', true); }} disabled={saving} className="um-perms-btn" style={{ color: '#16a34a', background: '#f0fff4', borderColor: '#bbf7d0' }}>Activar todo</button>
                          </div>
                        </div>

                        <div className="um-cat-header">
                          <span>SECCIÓN</span>
                          <span style={{ color: '#0071e3', textAlign: 'center' }}>ADD</span>
                          <span style={{ color: '#ea580c', textAlign: 'center' }}>EDIT</span>
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                          {[...ALL_CATEGORIES, ...(customCategories?.map(c => c.name) || [])].map(cat => {
                            const canAdd = isAllowed(u, 'allowedCategories', cat);
                            const canEdit = isAllowed(u, 'editableCategories', cat);
                            const isDynamic = !ALL_CATEGORIES.includes(cat);
                            
                            return (
                              <div
                                key={cat}
                                className={`um-cat-row ${(canAdd || canEdit) ? 'active' : ''}`}
                              >
                                <span className="um-cat-label" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                  {cat}
                                  {isDynamic && <span style={{ fontSize: '9px', background: 'var(--primary)', color: 'white', padding: '1px 4px', borderRadius: '4px' }}>Dinámica</span>}
                                </span>
                                <div style={{ display: 'flex', justifyContent: 'center' }}>
                                  <PermToggle active={canAdd}  color="#0071e3" disabled={saving} onClick={() => togglePerm(u, 'allowedCategories', cat)} />
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'center' }}>
                                  <PermToggle active={canEdit} color="#ea580c" disabled={saving} onClick={() => togglePerm(u, 'editableCategories', cat)} />
                                </div>
                              </div>
                            );
                          })}
                        </div>
                          
                          <div className="um-perm-tip">
                            <p>
                              💡 <strong>Tip:</strong> Si activas "Agregar" o "Editar" para una categoría, el sistema le dará automáticamente permiso de <strong>Vista</strong> para que pueda entrar.
                            </p>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Add user modal */}
      {isAddModalOpen && (
        <div className="modal-overlay">
          <div className="modal-card animate-scale-up um-modal">
            <div className="um-modal-header">
              <h3>Nuevo Miembro</h3>
              <button className="um-modal-close" onClick={() => setIsAddModalOpen(false)}><X size={20} /></button>
            </div>
            <p className="um-modal-sub">Crea una cuenta de acceso para un trabajador.</p>
            <form onSubmit={handleCreateUser} className="um-modal-form">
              <div className="um-input-group">
                <label>Nombre</label>
                <div className="um-input-wrapper">
                  <User className="um-input-icon" size={18} />
                  <input type="text" required value={newUser.name} onChange={e => setNewUser({ ...newUser, name: e.target.value })} />
                </div>
              </div>
              <div className="um-input-group">
                <label>Correo</label>
                <div className="um-input-wrapper">
                  <Mail className="um-input-icon" size={18} />
                  <input type="email" required value={newUser.email} onChange={e => setNewUser({ ...newUser, email: e.target.value })} />
                </div>
              </div>
              <div className="um-input-group">
                <label>Contraseña Temporal</label>
                <div className="um-input-wrapper">
                  <Key className="um-input-icon" size={18} />
                  <input 
                    type={showPasswords['new'] ? 'text' : 'password'} 
                    required 
                    value={newUser.password} 
                    onChange={e => setNewUser({ ...newUser, password: e.target.value })} 
                  />
                  <button type="button" className="um-input-toggle" onClick={() => setShowPasswords({...showPasswords, new: !showPasswords['new']})}>
                    {showPasswords['new'] ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>
              <div className="um-input-group">
                <label>Rol Principal</label>
                <div className="um-input-wrapper">
                  <Shield className="um-input-icon" size={18} />
                  <select value={newUser.role} onChange={e => setNewUser({ ...newUser, role: e.target.value })}>
                    <option value="user">Usuario</option>
                    <option value="almacenista">Almacenista</option>
                  </select>
                </div>
              </div>
              <div className="um-modal-footer">
                <button type="button" className="um-btn-cancel" onClick={() => setIsAddModalOpen(false)}>Cancelar</button>
                <button type="submit" className="um-btn-submit" disabled={isCreating}>
                  {isCreating ? <Loader2 className="animate-spin" size={18} /> : 'Crear Acceso'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* Change password modal */}
      {isChangeModalOpen && (
        <div className="modal-overlay">
          <div className="modal-card animate-scale-up um-modal">
            <div className="um-modal-header">
              <h3>Cambiar Contraseña</h3>
              <button className="um-modal-close" onClick={() => setIsChangeModalOpen(false)}><X size={20} /></button>
            </div>
            <p className="um-modal-sub">Establece una nueva contraseña para <strong>{changingPasswordUser?.email}</strong>.</p>
            <form onSubmit={handleChangePassword} className="um-modal-form">
              {(!changingPasswordUser?.sysKey) && (
                <div className="um-input-group warning">
                  <label>Contraseña Actual (Requerida una vez por ser usuario antiguo)</label>
                  <div className="um-input-wrapper">
                    <Key className="um-input-icon" size={18} />
                    <input 
                      type="text" 
                      required 
                      placeholder="Contraseña que usa actualmente" 
                      value={currentPasswordInput} 
                      onChange={e => setCurrentPasswordInput(e.target.value)} 
                    />
                  </div>
                </div>
              )}
              {changingPasswordUser?.sysKey && (
                <div className="um-perm-tip" style={{ marginBottom: '15px' }}>
                  <p>💡 <strong>Cambio automático:</strong> El sistema usará la contraseña guardada para hacer el cambio sin pedirte la anterior.</p>
                </div>
              )}
              <div className="um-input-group">
                <label>Nueva Contraseña</label>
                <div className="um-input-wrapper">
                  <Lock className="um-input-icon" size={18} />
                  <input 
                    type="text" 
                    required 
                    placeholder="Mín 6 caracteres" 
                    value={newPassword} 
                    onChange={e => setNewPassword(e.target.value)} 
                  />
                </div>
              </div>
              <div className="um-modal-footer">
                <button type="button" className="um-btn-cancel" onClick={() => { setIsChangeModalOpen(false); setCurrentPasswordInput(''); }}>Cancelar</button>
                <button type="submit" className="um-btn-submit" disabled={isUpdatingPassword}>
                  {isUpdatingPassword ? <Loader2 className="animate-spin" size={18} /> : 'Actualizar'}
                </button>
              </div>
              <div className="um-modal-link-wrap">
                <button type="button" className="um-modal-link" onClick={() => sendResetEmail(changingPasswordUser.email)}>
                  O enviar correo de restablecimiento
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* View Password Modal */}
      {isViewPasswordModalOpen && (
        <div className="modal-overlay">
          <div className="modal-card animate-scale-up um-modal">
            <div className="um-modal-header">
              <h3>Ver Contraseña</h3>
              <button className="um-modal-close" onClick={() => setIsViewPasswordModalOpen(false)}><X size={20} /></button>
            </div>
            
            {revealedPassword ? (
              <div className="um-modal-form">
                <div className="um-input-group">
                  <label>Contraseña de {viewingPasswordUser?.email}</label>
                  <div className="um-input-wrapper" style={{ background: '#f0fff4', borderColor: '#bbf7d0' }}>
                    <Key className="um-input-icon" size={18} color="#16a34a" />
                    <input 
                      type="text" 
                      readOnly 
                      value={revealedPassword} 
                      style={{ color: '#16a34a', fontWeight: 'bold' }}
                    />
                  </div>
                </div>
                <div className="um-modal-footer" style={{ marginTop: '20px' }}>
                  <button type="button" className="um-btn-cancel" onClick={() => setIsViewPasswordModalOpen(false)} style={{ width: '100%' }}>Cerrar</button>
                </div>
              </div>
            ) : (
              <form onSubmit={handleVerifyAdminPassword} className="um-modal-form">
                <p className="um-modal-sub">Por seguridad, verifica tu identidad para ver la contraseña de <strong>{viewingPasswordUser?.email}</strong>.</p>
                <div className="um-input-group">
                  <label>Tu Contraseña de Administrador</label>
                  <div className="um-input-wrapper">
                    <Lock className="um-input-icon" size={18} />
                    <input 
                      type="password" 
                      required 
                      placeholder="Ingresa tu contraseña" 
                      value={adminPasswordInput} 
                      onChange={e => setAdminPasswordInput(e.target.value)} 
                    />
                  </div>
                </div>
                <div className="um-modal-footer">
                  <button type="button" className="um-btn-cancel" onClick={() => setIsViewPasswordModalOpen(false)}>Cancelar</button>
                  <button type="submit" className="um-btn-submit" disabled={isVerifyingAdmin}>
                    {isVerifyingAdmin ? <Loader2 className="animate-spin" size={18} /> : 'Verificar y Mostrar'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default UserManagementView;
