import React, { useState } from 'react';
import { Building2, Save, MapPin, Phone, Globe, Trash2, AlertOctagon, Plus, Tag, Map, Bell, Moon, History, ChevronRight, X } from 'lucide-react';
import { useInventory } from '../context/InventoryContext';
import { useAuth } from '../context/AuthContext';
import Header from '../components/Header';
import { toast } from 'sonner';
import './SettingsView.css';

const SettingsView = () => {
  const { brands, locations, addBrand, deleteBrand, addLocation, deleteLocation, clearDatabaseCategories } = useInventory();
  const { isAdmin } = useAuth();
  const [newBrand, setNewBrand] = useState('');
  const [newLocName, setNewLocName] = useState('');
  const [newLocZone, setNewLocZone] = useState('');
  const [categoryToClear, setCategoryToClear] = useState('Herramientas');

  const ALL_CATEGORIES = [
    'Tornillería', 'Papelería', 'Herramientas', 'Impresión 3D',
    'Electrónica', 'Inventario General', 'Almacén Temporal', 'Parques',
  ];

  const [companyInfo, setCompanyInfo] = useState({
    name: 'Constructora Alfa',
    address: 'Av. Industrial 123, Ciudad de México',
    phone: '+52 55 1234 5678',
    website: 'www.constructoraalfa.com',
    currency: 'MXN'
  });

  const handleSave = () => {
    toast.success("Configuración guardada correctamente");
  };

  const IOSSwitch = ({ checked, onChange }) => (
    <label className="ios-switch">
      <input type="checkbox" checked={checked} onChange={onChange} />
      <span className="ios-slider"></span>
    </label>
  );

  return (
    <div className="settings-view animate-fade-in w-full bg-slate-50/50 min-h-screen">
      <Header />
      
      <div className="max-w-6xl mx-auto px-6 py-8">
        <header className="mb-10">
          <h2 className="text-3xl font-black tracking-tight text-slate-900">Ajustes</h2>
          <p className="text-slate-500 font-medium mt-1">Personaliza la experiencia y gestión del sistema</p>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Main Column */}
          <div className="lg:col-span-2 space-y-8">
            <section className="settings-card-cupertino">
              <h3 className="text-xl font-bold mb-8 flex items-center gap-3">
                <div className="p-2 bg-blue-100 text-blue-600 rounded-xl">
                  <Building2 size={20} />
                </div>
                Identidad de la Empresa
              </h3>
              
              <div className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="f-group">
                    <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-2 block px-1">Nombre Comercial</label>
                    <input 
                      type="text" 
                      value={companyInfo.name} 
                      className="cupertino-input"
                      onChange={(e) => setCompanyInfo({...companyInfo, name: e.target.value})}
                    />
                  </div>
                  <div className="f-group">
                    <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-2 block px-1">Moneda</label>
                    <select className="cupertino-input cursor-pointer" value={companyInfo.currency} onChange={(e) => setCompanyInfo({...companyInfo, currency: e.target.value})}>
                      <option value="MXN">Peso Mexicano (MXN)</option>
                      <option value="USD">Dólar Estadounidense (USD)</option>
                      <option value="EUR">Euro (EUR)</option>
                    </select>
                  </div>
                </div>

                <div className="f-group">
                  <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-2 block px-1">Dirección Fiscal</label>
                  <div className="relative">
                    <MapPin className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                    <input 
                      type="text" 
                      value={companyInfo.address} 
                      className="cupertino-input pl-12"
                      onChange={(e) => setCompanyInfo({...companyInfo, address: e.target.value})}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="f-group">
                    <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-2 block px-1">Teléfono</label>
                    <div className="relative">
                      <Phone className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                      <input 
                        type="text" 
                        value={companyInfo.phone} 
                        className="cupertino-input pl-12"
                        onChange={(e) => setCompanyInfo({...companyInfo, phone: e.target.value})}
                      />
                    </div>
                  </div>
                  <div className="f-group">
                    <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-2 block px-1">Sitio Web</label>
                    <div className="relative">
                      <Globe className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                      <input 
                        type="text" 
                        value={companyInfo.website} 
                        className="cupertino-input pl-12"
                        onChange={(e) => setCompanyInfo({...companyInfo, website: e.target.value})}
                      />
                    </div>
                  </div>
                </div>

                <button className="btn-cupertino-primary mt-4" onClick={handleSave}>
                  Guardar Cambios
                </button>
              </div>

              {isAdmin && (
                <div className="danger-zone-cupertino mt-12">
                  <div className="flex items-center gap-2 text-red-500 mb-4">
                    <AlertOctagon size={20} />
                    <span className="font-bold uppercase tracking-widest text-[10px]">Área de Seguridad</span>
                  </div>
                  <h4 className="font-bold text-slate-900 mb-1">Mantenimiento de Base de Datos</h4>
                  <p className="text-sm text-slate-500 mb-6">Esta acción eliminará de forma irreversible el historial y artículos de la categoría seleccionada.</p>
                  
                  <div className="f-group mb-4">
                    <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-2 block px-1">Seleccionar Área a Vaciar</label>
                    <select 
                      className="cupertino-input cursor-pointer border-red-100 focus:border-red-500" 
                      value={categoryToClear} 
                      onChange={(e) => setCategoryToClear(e.target.value)}
                    >
                      {ALL_CATEGORIES.map(cat => <option key={cat} value={cat}>{cat}</option>)}
                    </select>
                  </div>

                  <button 
                    className="w-full py-3 bg-red-500 hover:bg-red-600 text-white font-bold rounded-xl transition-all shadow-lg shadow-red-200"
                    onClick={async () => {
                      if (window.confirm(`¿CONFIRMACIÓN CRÍTICA? Se borrarán TODOS los datos y el historial de la categoría: ${categoryToClear.toUpperCase()}. Esta acción no se puede deshacer.`)) {
                        const success = await clearDatabaseCategories([categoryToClear]);
                        if (success) toast.success(`Área de ${categoryToClear} limpiada correctamente`);
                      }
                    }}
                  >
                    Vaciar Inventario {categoryToClear}
                  </button>
                </div>
              )}
            </section>
          </div>

          {/* Sidebar Column */}
          <div className="space-y-8">
            <section className="settings-card-cupertino">
              <h3 className="text-lg font-bold mb-6">Preferencias</h3>
              <div className="cupertino-group">
                <div className="cupertino-row">
                  <div className="cupertino-label">
                    <span className="title">Notificaciones</span>
                    <span className="subtitle">Alertas de stock bajo</span>
                  </div>
                  <IOSSwitch checked={true} onChange={() => {}} />
                </div>
                <div className="cupertino-row">
                  <div className="cupertino-label">
                    <span className="title">Reporte Semanal</span>
                    <span className="subtitle">PDF por correo</span>
                  </div>
                  <IOSSwitch checked={false} onChange={() => {}} />
                </div>
                <div className="cupertino-row">
                  <div className="cupertino-label">
                    <span className="title">Modo Oscuro</span>
                    <span className="subtitle">Seguir sistema</span>
                  </div>
                  <IOSSwitch checked={false} onChange={() => {}} />
                </div>
              </div>
            </section>

            <section className="settings-card-cupertino">
              <h3 className="text-lg font-bold mb-6 flex items-center justify-between">
                Marcas
                <Tag size={18} className="text-slate-400" />
              </h3>
              <div className="flex gap-2 mb-6">
                <input 
                  type="text" 
                  placeholder="Añadir..." 
                  className="cupertino-input flex-1"
                  value={newBrand}
                  onChange={(e) => setNewBrand(e.target.value)}
                />
                <button className="bg-blue-600 text-white p-3 rounded-xl hover:scale-105 transition-all" onClick={() => { addBrand(newBrand); setNewBrand(''); }}>
                  <Plus size={20} />
                </button>
              </div>
              <div className="flex flex-wrap gap-2">
                {brands.map(b => (
                  <div key={b.id} className="brand-pill group">
                    {b.name}
                    <button onClick={() => deleteBrand(b.id)} className="text-slate-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all">
                      <X size={12} />
                    </button>
                  </div>
                ))}
              </div>
            </section>

            <section className="settings-card-cupertino">
              <h3 className="text-lg font-bold mb-6 flex items-center justify-between">
                Ubicaciones
                <Map size={18} className="text-slate-400" />
              </h3>
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-2">
                  <input type="text" placeholder="Nombre" className="cupertino-input text-xs" value={newLocName} onChange={(e) => setNewLocName(e.target.value)} />
                  <input type="text" placeholder="Zona" className="cupertino-input text-xs" value={newLocZone} onChange={(e) => setNewLocZone(e.target.value)} />
                </div>
                <button className="w-full bg-slate-900 text-white py-3 rounded-xl font-bold text-sm" onClick={() => { addLocation(newLocName, newLocZone); setNewLocName(''); setNewLocZone(''); }}>
                  Añadir Ubicación
                </button>
                
                <div className="cupertino-group mt-6">
                  {locations.map(l => (
                    <div key={l.id} className="cupertino-row">
                      <div className="cupertino-label">
                        <span className="title">{l.name}</span>
                        <span className="subtitle">{l.zone || 'Almacén'}</span>
                      </div>
                      <button onClick={() => deleteLocation(l.id)} className="text-slate-300 hover:text-red-500">
                        <Trash2 size={16} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SettingsView;
