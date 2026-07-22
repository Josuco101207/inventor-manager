import React, { useState } from 'react';
import { Save, Trash2, AlertOctagon, Plus, Tag, Map, Bell, X, FileSpreadsheet } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useCustomCategories } from '../context/CustomCategoriesContext';
import Header from '../components/Header';
import { exportFullDatabase } from '../utils/exportUtils';
import { toast } from 'sonner';
import './SettingsView.css';

const SettingsView = () => {
  const { items, brands, locations, addBrand, deleteBrand, addLocation, deleteLocation, clearDatabaseCategories } = useInventory();
  const { customCategories } = useCustomCategories();
  const { isAdmin } = useAuth();
  const [newBrand, setNewBrand] = useState('');
  const [newLocName, setNewLocName] = useState('');
  const [newLocZone, setNewLocZone] = useState('');
  const [categoryToClear, setCategoryToClear] = useState('Herramientas');

  const ALL_CATEGORIES = [
    'Tornillería', 'Papelería', 'Herramientas', 'Impresión 3D',
    'Electrónica', 'Inventario General', 'Almacén Temporal', 'Parques',
  ];

  const [pushActive, setPushActive] = useState(true);
  const [reportActive, setReportActive] = useState(false);

  const IOSSwitch = ({ checked, onChange }) => (
    <label className="modern-switch">
      <input type="checkbox" checked={checked} onChange={onChange} />
      <span className="modern-slider"></span>
    </label>
  );

  return (
    <div className="sv-container animate-fade-in">
      <Header />

      <div className="sv-content">
        <header className="sv-header">
          <h2>Ajustes</h2>
          <p>Personaliza la experiencia y gestión del sistema</p>
        </header>

        <div className="sv-grid">
          {/* Columna 1 */}
          <div className="sv-col">
            <section className="sv-card glass-card">
              <div className="sv-card-header">
                <h3 className="sv-card-title">Directorio de Marcas</h3>
                <div className="sv-card-icon icon-indigo">
                  <Tag size={20} />
                </div>
              </div>

              <div className="sv-input-row">
                <input
                  type="text"
                  placeholder="Añadir nueva marca..."
                  className="sv-input f-input"
                  value={newBrand}
                  onChange={(e) => setNewBrand(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && newBrand.trim()) {
                      addBrand(newBrand.trim());
                      setNewBrand('');
                    }
                  }}
                />
                <button
                  className="sv-btn-add bg-indigo"
                  onClick={() => { if (newBrand.trim()) { addBrand(newBrand.trim()); setNewBrand(''); } }}
                >
                  <Plus size={20} />
                </button>
              </div>

              <div className="sv-brands-container">
                {brands.length === 0 ? (
                  <p className="sv-empty-text">No hay marcas registradas</p>
                ) : (
                  <div className="sv-brands-list">
                    {brands.map(b => (
                      <div key={b.id} className="sv-brand-pill">
                        <span className="sv-brand-name" title={b.name}>{b.name}</span>
                        <button 
                          onClick={() => deleteBrand(b.id)} 
                          title="Eliminar marca"
                          className="sv-btn-delete"
                        >
                          <X size={14} strokeWidth={2.5} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </section>

          </div>

          {/* Columna 2 */}
          <div className="sv-col">
            <section className="sv-card glass-card">
              <div className="sv-card-header">
                <h3 className="sv-card-title">Áreas y Ubicaciones</h3>
                <div className="sv-card-icon icon-blue">
                  <Map size={18} />
                </div>
              </div>

              <div className="sv-locations-wrapper">
                <div className="sv-input-row responsive-inputs">
                  <input type="text" placeholder="Ej. Estante A" className="sv-input f-input" value={newLocName} onChange={(e) => setNewLocName(e.target.value)} />
                  <input type="text" placeholder="Zona 1" className="sv-input f-input" value={newLocZone} onChange={(e) => setNewLocZone(e.target.value)} />
                </div>
                <button
                  className="sv-btn-full bg-blue"
                  onClick={() => { if (newLocName.trim()) { addLocation(newLocName.trim(), newLocZone.trim()); setNewLocName(''); setNewLocZone(''); } }}
                >
                  Registrar Ubicación
                </button>

                <div className="settings-group sv-locations-list custom-scrollbar">
                  {locations.length === 0 ? (
                    <p className="sv-empty-text">Sin ubicaciones</p>
                  ) : (
                    locations.map(l => (
                      <div key={l.id} className="settings-row sv-location-item">
                        <div className="settings-label">
                          <span className="title">{l.name}</span>
                          <span className="subtitle">{l.zone || 'Almacén General'}</span>
                        </div>
                        <button
                          onClick={() => deleteLocation(l.id)}
                          className="sv-btn-delete-bg"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </section>

            {isAdmin && (
              <section className="sv-card glass-card sv-danger-zone">
                <div className="sv-danger-stripe"></div>
                <div className="sv-card-header sv-danger-header">
                  <h3 className="sv-card-title">Zona de Riesgo</h3>
                  <AlertOctagon size={18} />
                </div>

                <div className="sv-danger-content">
                  <div className="sv-danger-block">
                    <h4 className="sv-block-title text-white">Limpieza de Inventario</h4>
                    <p className="sv-block-desc">Elimina artículos e historial permanentemente.</p>

                    <div className="sv-danger-action-row">
                      <select
                        className="sv-input f-input sv-danger-select"
                        value={categoryToClear}
                        onChange={(e) => setCategoryToClear(e.target.value)}
                      >
                        {[...ALL_CATEGORIES, ...(customCategories?.map(c => c.name) || [])].map(cat => <option key={cat} value={cat}>{cat}</option>)}
                      </select>
                      <button
                        className="sv-btn-danger"
                        onClick={async () => {
                          if (window.confirm(`¿Seguro que deseas vaciar la categoría: ${categoryToClear.toUpperCase()}?`)) {
                            const success = await clearDatabaseCategories([categoryToClear]);
                            if (success) toast.success(`Categoría limpia`);
                          }
                        }}
                      >
                        Vaciar {categoryToClear}
                      </button>
                    </div>
                  </div>

                  <div className="sv-backup-block border-top">
                    <h4 className="sv-block-title text-white">Copia de Seguridad</h4>
                    <p className="sv-block-desc">Descarga todo el sistema a Excel.</p>
                    <button
                      className="sv-btn-success"
                      onClick={() => exportFullDatabase(items)}
                    >
                      <FileSpreadsheet size={16} /> Exportar Datos
                    </button>
                  </div>
                </div>
              </section>
            )}
          </div>

        </div>
      </div>
    </div>
  );
};

export default SettingsView;