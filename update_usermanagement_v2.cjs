const fs = require('fs');

const filePath = 'c:\\Users\\infra\\Desktop\\Inventor Manager\\src\\views\\UserManagementView.jsx';
let content = fs.readFileSync(filePath, 'utf-8');

// Replace the import
if (!content.includes("import './UserManagementView.css';")) {
    content = content.replace("import { toast } from 'sonner';", "import { toast } from 'sonner';\nimport './UserManagementView.css';");
}

// Replace PermToggle to support dark mode gracefully
content = content.replace("background: active ? `${color}18` : '#f8fafc',", "background: active ? `${color}18` : 'transparent',");

// Find the start of the return statement
const splitStr = "  return (\n    <div style={{ minHeight: '100vh', background: '#f5f7fa' }}>";
const startIdx = content.lastIndexOf("  return (");
if (startIdx === -1) {
    console.error("Could not find start index");
    process.exit(1);
}

const newReturn = `  return (
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
          <button className="btn-primary flex items-center gap-2" onClick={() => setIsAddModalOpen(true)}>
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
                    <div className={\`um-avatar \${isAdminUser ? 'um-avatar-admin' : 'um-avatar-user'}\`}>
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

                    {/* Role pill */}
                    <span className="um-role-pill" style={{ background: rs.bg, color: rs.color, borderColor: rs.border }}>
                      {u.role === 'admin' && <Shield size={10} />}
                      {u.role === 'almacenista' && <Warehouse size={10} />}
                      {u.role === 'user' && <User size={10} />}
                      {(u.role || 'user').toUpperCase()}
                    </span>

                    {/* Summary pill */}
                    <span className="um-summary-pill" style={{ background: ss.bg, color: ss.color, borderColor: ss.border }}>
                      {ss.text}
                    </span>

                    {/* Actions */}
                    <div className="um-actions">
                      {!isAdminUser && (
                        <button
                          onClick={() => setExpandedUserId(isExpanded ? null : u.id)}
                          className={\`um-btn-perms \${isExpanded ? 'expanded' : ''}\`}
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
                                  className={\`um-view-row \${hasAccess ? 'active' : ''} \${isCore ? 'disabled' : ''}\`}
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
                                  className={\`um-cat-row \${(canAdd || canEdit) ? 'active' : ''}\`}
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
`;

const finalContent = content.substring(0, startIdx) + newReturn;
fs.writeFileSync(filePath, finalContent, 'utf-8');
console.log("Updated UserManagementView.jsx correctly");
