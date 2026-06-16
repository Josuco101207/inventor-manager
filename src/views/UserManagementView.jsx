import React, { useState, useEffect } from 'react';
import Header from '../components/Header';
import { db } from '../firebase/config';
import { collection, onSnapshot, query, doc, updateDoc, deleteDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { initializeApp, deleteApp } from 'firebase/app';
import { getAuth, createUserWithEmailAndPassword, signOut } from 'firebase/auth';
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
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [loading, setLoading] = useState(true);
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

  useEffect(() => {
    const q = query(collection(db, 'users'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
      data.sort((a, b) => (a.displayName || a.name || '').toLowerCase().localeCompare((b.displayName || b.name || '').toLowerCase()));
      setUsers(data);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const handleCreateUser = async (e) => {
    e.preventDefault();
    setIsCreating(true);
    let secondaryApp = null;
    try {
      secondaryApp = initializeApp(firebaseConfig, `Secondary_${Date.now()}`);
      const secondaryAuth = getAuth(secondaryApp);
      const cred = await createUserWithEmailAndPassword(secondaryAuth, newUser.email, newUser.password);
      await setDoc(doc(db, 'users', cred.user.uid), {
        name: newUser.name, displayName: newUser.name, email: newUser.email,
        role: newUser.role, 
        allowedCategories: [...ALL_CATEGORIES], 
        editableCategories: [],
        allowedViews: ['dashboard', 'tornilleria', 'papeleria', 'herramientas', 'impresion-3d', 'electronica', 'general', 'almacen-temporal', 'parques'],
        // SECURITY: Never store passwords in plaintext
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
    if (u.role === 'admin') return toast.error('No puedes eliminar a Jonathan');
    if (window.confirm(`¿Eliminar acceso para ${u.email}?`)) {
      await deleteDoc(doc(db, 'users', u.id));
      toast.info('Perfil eliminado');
    }
  };

  // Toggle a single permission for a user
  const togglePerm = async (u, field, category) => {
    const current = u[field] || [];
    const isPresent = current.includes(category);
    const next = isPresent ? current.filter(c => c !== category) : [...current, category];
    
    setSaving(true);
    try {
      const updates = { [field]: next };
      
      // Auto-sync: If they can Add or Edit, they MUST be able to View.
      // If they lose View, they probably shouldn't Add/Edit (optional, but safer)
      if (!isPresent && (field === 'allowedCategories' || field === 'editableCategories')) {
        // Map category name back to view ID
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
    }
    catch { toast.error('Error al guardar'); }
    finally { setSaving(false); }
  };

  const setAll = async (u, field, value) => {
    setSaving(true);
    const data = value 
      ? (field === 'allowedViews' ? ALL_VIEWS.map(v => v.id) : [...ALL_CATEGORIES]) 
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

      // For password change, admin re-authenticates with their own credentials
      // or uses Firebase Admin SDK pattern via cloud function
      const { signInWithEmailAndPassword, updatePassword } = await import('firebase/auth');
      
      // Sign in as the target user to change their password
      // This requires knowing the current password or using a reset flow
      const cred = await signInWithEmailAndPassword(secondaryAuth, changingPasswordUser.email, currentPasswordInput);
      await updatePassword(cred.user, newPassword);

      // SECURITY: Only store metadata, never the password itself
      await updateDoc(doc(db, 'users', changingPasswordUser.id), {
        passwordChangedAt: serverTimestamp()
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

  const togglePasswordVisibility = (uid) => {
    setShowPasswords(prev => ({ ...prev, [uid]: !prev[uid] }));
  };

  const roleStyle = (role) => ({
    admin:       { bg: '#f0f7ff', color: '#0071e3', border: '#bfdbfe' },
    almacenista: { bg: '#fff8f0', color: '#ea580c', border: '#fed7aa' },
    user:        { bg: '#f8fafc', color: '#64748b', border: '#e2e8f0' },
  }[role] || { bg: '#f8fafc', color: '#64748b', border: '#e2e8f0' });

  const summaryText = (u) => {
    if (u.role === 'admin') return { text: 'Acceso ilimitado', color: '#0071e3', bg: '#f0f7ff', border: '#bfdbfe' };
    const a = (u.allowedCategories || []).length;
    const e = (u.editableCategories || []).length;
    if (a === 0 && e === 0) return { text: 'Sin permisos', color: '#dc2626', bg: '#fff1f1', border: '#fecaca' };
    return { text: `${a} agregar · ${e} editar`, color: '#16a34a', bg: '#f0fff4', border: '#bbf7d0' };
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
              const allowedCats = u.allowedCategories || [];
              const editableCats = u.editableCategories || [];

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
                      <span className="um-role-pill" style={{ background: rs.bg, color: rs.color, borderColor: rs.border }}>
                        {u.role === 'admin' && <Shield size={10} />}
                        {u.role === 'almacenista' && <Warehouse size={10} />}
                        {u.role === 'user' && <User size={10} />}
                        {(u.role || 'user').toUpperCase()}
                      </span>

                      <span className="um-summary-pill" style={{ background: ss.bg, color: ss.color, borderColor: ss.border }}>
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
                      <button onClick={() => { setChangingPasswordUser(u); setIsChangeModalOpen(true); }} title="Cambiar Contraseña" className="um-btn-icon">
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
                            {ALL_VIEWS.map(view => {
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
                            {ALL_CATEGORIES.map(cat => {
                              const canAdd  = allowedCats.includes(cat);
                              const canEdit = editableCats.includes(cat);
                              return (
                                <div
                                  key={cat}
                                  className={`um-cat-row ${(canAdd || canEdit) ? 'active' : ''}`}
                                >
                                  <span className="um-cat-label">
                                    {cat}
                                  </span>
                                  <div style={{ display: 'flex', justifyContent: 'center' }}>
                                    <PermToggle active={canAdd}  color="#0071e3" disabled={saving} onClick={() => togglePerm(u, 'allowedCategories',  cat)} />
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
          <div className="modal-card animate-scale-up p-8">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h3 className="text-xl font-bold">Nuevo Miembro</h3>
              <button onClick={() => setIsAddModalOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'hsl(var(--text-muted))' }}><X size={20} /></button>
            </div>
            <p className="text-sm text-muted mb-6">Crea una cuenta de acceso para un trabajador.</p>
            <form onSubmit={handleCreateUser} className="flex flex-col gap-4">
              <div className="f-group">
                <label>Nombre</label>
                <input type="text" required className="w-full" value={newUser.name} onChange={e => setNewUser({ ...newUser, name: e.target.value })} />
              </div>
              <div className="f-group">
                <label>Correo</label>
                <input type="email" required className="w-full" value={newUser.email} onChange={e => setNewUser({ ...newUser, email: e.target.value })} />
              </div>
              <div className="f-group">
                <label>Contraseña temporal</label>
                <input type="text" required className="w-full" placeholder="Mín 6 caracteres" value={newUser.password} onChange={e => setNewUser({ ...newUser, password: e.target.value })} />
              </div>
              <div className="f-group">
                <label>Rol</label>
                <select className="w-full" value={newUser.role} onChange={e => setNewUser({ ...newUser, role: e.target.value })}>
                  <option value="user">Usuario</option>
                  <option value="almacenista">Almacenista</option>
                </select>
              </div>
              <div className="flex gap-4 mt-2">
                <button type="button" className="btn-secondary flex-1" onClick={() => setIsAddModalOpen(false)}>Cancelar</button>
                <button type="submit" className="btn-primary flex-1 flex justify-center items-center gap-2" disabled={isCreating}>
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
          <div className="modal-card animate-scale-up p-8">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h3 className="text-xl font-bold">Cambiar Contraseña</h3>
              <button onClick={() => setIsChangeModalOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'hsl(var(--text-muted))' }}><X size={20} /></button>
            </div>
            <p className="text-sm text-muted mb-6">Establece una nueva contraseña para <strong>{changingPasswordUser?.email}</strong>.</p>
            <form onSubmit={handleChangePassword} className="flex flex-col gap-4">
              {(!changingPasswordUser?.passwordChangedAt || changingPasswordUser?.password === 'legacy') && (
                <div className="f-group">
                  <label style={{ color: '#ea580c' }}>Contraseña Actual (Requerida por ser usuario antiguo)</label>
                  <div className="relative">
                    <Key className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                    <input 
                      type="text" 
                      required 
                      placeholder="Contraseña que usa actualmente" 
                      className="w-full" 
                      style={{ borderColor: '#fed7aa', background: '#fffcf9' }}
                      value={currentPasswordInput} 
                      onChange={e => setCurrentPasswordInput(e.target.value)} 
                    />
                  </div>
                </div>
              )}
              <div className="f-group">
                <label>Nueva Contraseña</label>
                <div className="relative">
                  <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                  <input 
                    type="text" 
                    required 
                    placeholder="Mín 6 caracteres" 
                    className="w-full" 
                    value={newPassword} 
                    onChange={e => setNewPassword(e.target.value)} 
                  />
                </div>
              </div>
              <div className="flex flex-col gap-3 mt-2">
                <div className="flex gap-4">
                  <button type="button" className="btn-secondary flex-1" onClick={() => { setIsChangeModalOpen(false); setCurrentPasswordInput(''); }}>Cancelar</button>
                  <button type="submit" className="btn-primary flex-1 flex justify-center items-center gap-2" disabled={isUpdatingPassword}>
                    {isUpdatingPassword ? <Loader2 className="animate-spin" size={18} /> : 'Actualizar'}
                  </button>
                </div>
                
                <button 
                  type="button" 
                  onClick={() => sendResetEmail(changingPasswordUser.email)}
                  style={{ background: 'none', border: 'none', color: '#0071e3', fontSize: 12, fontWeight: 700, cursor: 'pointer', textDecoration: 'underline' }}
                >
                  O enviar correo de restablecimiento
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default UserManagementView;
