import React, { useRef, useState } from 'react';
import { Camera, UploadCloud, FileText, CheckCircle, X, Loader2, Save, Key } from 'lucide-react';
import { useScannerAI } from '../context/ScannerAIContext';
import { useInventory } from '../context/InventoryContextOptimized';
import { toast } from 'sonner';
import './ScannerAIView.css';

const ScannerAIView = ({ onClose }) => {
  const { step, file, previewUrl, extractedData, error, processFile, reset, apiKey } = useScannerAI();
  const fileInputRef = useRef(null);

  const handleFileChange = (e) => {
    if (e.target.files && e.target.files[0]) {
      processFile(e.target.files[0]);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      processFile(e.dataTransfer.files[0]);
    }
  };



  return (
    <div className="scanner-overlay animate-fade-in">
      <div className="scanner-modal animate-scale-up">
        <button className="scanner-close" onClick={onClose}><X size={24} /></button>
        
        <header className="scanner-header">
          <h2><Camera size={28} /> Escáner con IA</h2>
          <p>Sube una foto de una factura o material y la IA extraerá los artículos.</p>
        </header>

        <div className="scanner-content">
            {step === 'UPLOAD' && (
              <div 
                className="upload-zone"
                onDragOver={(e) => e.preventDefault()}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
              >
                <input 
                  type="file" 
                  ref={fileInputRef} 
                  style={{ display: 'none' }} 
                  accept="image/*"
                  onChange={handleFileChange}
                />
                <div className="upload-icon-pulse">
                  <UploadCloud size={48} />
                </div>
                <h3>Toca para tomar foto o selecciona un archivo</h3>
                <p>Soporta JPG, PNG (máx 10MB)</p>
                {error && <div className="scanner-error">{error}</div>}
              </div>
            )}

            {step === 'PROCESSING' && (
              <div className="processing-zone">
                <img src={previewUrl} alt="Preview" className="preview-image blur-sm" />
                <div className="processing-loader">
                  <Loader2 className="animate-spin" size={48} />
                  <h3>Analizando con Inteligencia Artificial...</h3>
                  <p>Extrayendo texto, identificando productos y cantidades.</p>
                </div>
              </div>
            )}

            {step === 'REVIEW' && (
              <ReviewForm onClose={onClose} />
            )}
          </div>
      </div>
    </div>
  );
};

const ReviewForm = ({ onClose }) => {
  const { extractedData, reset } = useScannerAI();
  const { bulkAddItems } = useInventory();
  
  const [items, setItems] = useState(extractedData?.items || []);
  const [header, setHeader] = useState(extractedData?.header || {});
  const [selectedCategory, setSelectedCategory] = useState('Inventario General');
  
  const [isSaving, setIsSaving] = useState(false);

  const updateItem = (index, field, value) => {
    const newItems = [...items];
    newItems[index] = { ...newItems[index], [field]: value };
    setItems(newItems);
  };

  const handleSave = async () => {
    try {
      setIsSaving(true);
      // Preparar items para bulkAdd
      const payload = items.map(item => ({
        name: item.name || 'Artículo Desconocido',
        qty: parseInt(item.qty) || 1,
        costo_unitario: parseFloat(item.costo_unitario) || 0,
        codigo: item.codigo || '',
        marca: item.marca || '',
        category: selectedCategory,
        observaciones: `Escaneado por IA. Prov: ${header.proveedor || 'N/A'}`,
        threshold: 5,
        unit: 'Piezas',
        status: 'Disponible'
      }));

      await bulkAddItems(payload);
      toast.success(`${payload.length} artículos agregados al inventario.`);
      reset();
      onClose();
    } catch (error) {
      toast.error('Error al guardar en el inventario.');
      console.error(error);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="review-zone">
      <div className="review-header-info">
        <div>
          <label>Proveedor / Origen</label>
          <input type="text" value={header.proveedor || ''} onChange={e => setHeader({...header, proveedor: e.target.value})} />
        </div>
        <div>
          <label>Categoría Destino</label>
          <select value={selectedCategory} onChange={e => setSelectedCategory(e.target.value)}>
            <option value="Inventario General">Inventario General</option>
            <option value="Tornillería">Tornillería</option>
            <option value="Papelería">Papelería</option>
            <option value="Electrónica">Electrónica</option>
            <option value="Herramientas">Herramientas</option>
          </select>
        </div>
      </div>

      <div className="review-items">
        <h4>Artículos Encontrados ({items.length})</h4>
        {items.map((item, idx) => (
          <div key={idx} className="review-item-row">
            <input 
              type="text" 
              className="flex-2" 
              value={item.name} 
              onChange={e => updateItem(idx, 'name', e.target.value)} 
              title="Nombre"
            />
            <input 
              type="number" 
              className="flex-1 text-center" 
              value={item.qty} 
              onChange={e => updateItem(idx, 'qty', e.target.value)} 
              title="Cantidad"
            />
            <input 
              type="number" 
              className="flex-1 text-right" 
              value={item.costo_unitario} 
              onChange={e => updateItem(idx, 'costo_unitario', e.target.value)} 
              title="Costo Unitario"
            />
          </div>
        ))}
      </div>

      <div className="review-actions">
        <button className="btn-secondary" onClick={reset} disabled={isSaving}>Escanear de Nuevo</button>
        <button className="btn-primary" onClick={handleSave} disabled={isSaving}>
          {isSaving ? <Loader2 className="animate-spin" size={18} /> : <Save size={18} />}
          Guardar en Inventario
        </button>
      </div>
    </div>
  );
};

export default ScannerAIView;
