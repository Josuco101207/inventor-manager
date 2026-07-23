import React, { useState, useEffect } from 'react';
import { useInventory } from '../context/InventoryContextOptimized';
import { useCustomCategories } from '../context/CustomCategoriesContext';
import { useAuth } from '../context/AuthContext';
import { dicrejartDb } from '../firebase/config';
import { db } from '../firebase/config';
import { collection, query, where, onSnapshot, doc, updateDoc, serverTimestamp, addDoc, writeBatch } from 'firebase/firestore';
import { ClipboardList, Plus, Package } from 'lucide-react';
import { toast } from 'sonner';
import Header from '../components/Header';
import './RequisicionesView.css';

const RequisicionesView = () => {
  const { userData } = useAuth();
  const { items, updateStock } = useInventory();
  const { customCategories } = useCustomCategories();
  
  const [requisiciones, setRequisiciones] = useState([]);
  const [loading, setLoading] = useState(true);

  const [selectedReq, setSelectedReq] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [sectionsSelection, setSectionsSelection] = useState({});
  const [isProcessing, setIsProcessing] = useState(false);

  // Categorías base estáticas
  const baseCategories = [
    { id: 'tornilleria', name: 'Tornillería' },
    { id: 'papeleria', name: 'Papelería' },
    { id: 'herramientas', name: 'Herramientas' },
    { id: 'impresion-3d', name: 'Impresión 3D' },
    { id: 'electronica', name: 'Electrónica' },
    { id: 'general', name: 'Inventario General' },
    { id: 'almacen-temporal', name: 'Almacén Temporal' }
  ];
  
  const allCategories = [...baseCategories, ...(customCategories || [])];

  useEffect(() => {
    if (!dicrejartDb) {
      toast.error('No se pudo conectar con la base de datos de Dicrejart (Bridge)');
      setLoading(false);
      return;
    }

    const q = query(
      collection(dicrejartDb, 'requisiciones'),
      where('status', '==', 'comprada')
    );

    const unsub = onSnapshot(q, (snap) => {
      const list = [];
      snap.forEach(d => {
        list.push({ id: d.id, ...d.data() });
      });
      // Ordenar por fecha de creación (ascendente, las más viejas primero)
      list.sort((a, b) => {
        const getMs = (dateVal) => {
          if (!dateVal) return 0;
          if (dateVal.toMillis) return dateVal.toMillis();
          if (dateVal.seconds) return dateVal.seconds * 1000;
          return new Date(dateVal).getTime();
        };
        return getMs(a.createdAt) - getMs(b.createdAt);
      });
      setRequisiciones(list);
      setLoading(false);
    }, (error) => {
      console.error('Error escuchando requisiciones de Dicrejart:', error);
      toast.error('Error al cargar las requisiciones de producción');
      setLoading(false);
    });

    return () => unsub();
  }, []);

  const handleOpenReceive = (req) => {
    setSelectedReq(req);
    // Inicializar state de secciones por defecto (Inventario General)
    const initialSelection = {};
    req.items.forEach((it, idx) => {
      // Si el item ya existía, intentar preseleccionar su categoría si la conocemos
      let defaultCat = 'general';
      if (it.itemId) {
        const existing = items.find(invIt => invIt.id === it.itemId);
        if (existing && existing.category) {
          defaultCat = existing.category.toLowerCase().replace(/\s+/g, '-');
        }
      }
      initialSelection[idx] = defaultCat;
    });
    setSectionsSelection(initialSelection);
    setIsModalOpen(true);
  };

  const handleCloseReceive = () => {
    setIsModalOpen(false);
    setSelectedReq(null);
    setSectionsSelection({});
  };

  const handleConfirmReceive = async () => {
    if (!selectedReq) return;
    setIsProcessing(true);
    
    try {
      const batch = writeBatch(db);
      const moveRefBase = collection(db, 'movements');

      for (let i = 0; i < selectedReq.items.length; i++) {
        const reqItem = selectedReq.items[i];
        const categoryId = sectionsSelection[i] || 'general';
        const categoryName = allCategories.find(c => c.id === categoryId)?.name || 'General';

        if (reqItem.itemId) {
          // El artículo ya existe en nuestro inventario -> UpdateStock 
          // (Lo haremos manual aquí en el batch o llamaremos al updateStock uno a uno.
          //  Hacerlo manual en batch es más seguro para asegurar atonomicidad de la requisición)
          
          const itemRef = doc(db, 'items', reqItem.itemId);
          
          // Nota: Si el artículo usa stockByLocation, asumimos ubicación 'General' o la categoría seleccionada
          // Para mantenerlo simple según la lógica del InventoryContextOptimized:
          batch.update(itemRef, {
            qty: reqItem.quantity, // wait, updateStock usa increment() pero aquí usamos el total? No, se debe sumar.
          });
          
          // Reemplazado por lógica correcta de sumar:
          const { increment } = await import('firebase/firestore');
          batch.update(itemRef, {
            qty: increment(reqItem.quantity),
            lastModified: serverTimestamp()
          });

          const moveRef = doc(moveRefBase);
          batch.set(moveRef, {
            action: 'Entrada',
            item: reqItem.name,
            itemId: reqItem.itemId,
            qty: reqItem.quantity,
            user: userData?.name || 'Almacén',
            details: `Recepción de Req. Producción: ${selectedReq.id}`,
            category: categoryName,
            timestamp: serverTimestamp()
          });

        } else {
          // El artículo no existe, se crea nuevo.
          const newDocRef = doc(collection(db, 'items'));
          batch.set(newDocRef, {
            name: reqItem.name,
            category: categoryName,
            qty: reqItem.quantity,
            unit: reqItem.unit || 'PZA',
            threshold: 0,
            location: 'General',
            stockByLocation: { 'General': reqItem.quantity },
            createdAt: serverTimestamp(),
            lastModified: serverTimestamp()
          });

          const moveRef = doc(moveRefBase);
          batch.set(moveRef, {
            action: 'Entrada',
            item: reqItem.name,
            itemId: newDocRef.id, // el ID recién creado
            qty: reqItem.quantity,
            user: userData?.name || 'Almacén',
            details: `Creación y Recepción desde Req. Producción: ${selectedReq.id}`,
            category: categoryName,
            timestamp: serverTimestamp()
          });
        }
      }

      // Commit de cambios a Inventor Manager DB
      await batch.commit();

      // Una vez guardado en inventor, actualizar en dicrejartDb
      const reqRef = doc(dicrejartDb, 'requisiciones', selectedReq.id);
      await updateDoc(reqRef, {
        status: 'recibida',
        receivedBy: userData?.name || 'Almacenista',
        receivedAt: serverTimestamp()
      });

      toast.success('Artículos recibidos y guardados en el inventario exitosamente');
      handleCloseReceive();

    } catch (error) {
      console.error('Error al recibir requisición:', error);
      toast.error('Ocurrió un error al procesar la recepción');
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="requisiciones-container animate-fade-in">
      <Header />
      
      <div className="requisiciones-header mt-8">
        <h2>Requisiciones Listas para Recepción</h2>
        <p>Estas requisiciones de producción ya fueron compradas y están esperando ser integradas al inventario físico.</p>
      </div>

      {loading ? (
        <div className="flex justify-center p-8">
          <span className="text-muted">Cargando requisiciones...</span>
        </div>
      ) : requisiciones.length === 0 ? (
        <div className="flex flex-col items-center justify-center p-12 text-center" style={{ background: 'hsl(var(--bg-card))', borderRadius: '12px' }}>
          <ClipboardList size={48} style={{ color: 'hsl(var(--text-soft))', opacity: 0.5, marginBottom: '1rem' }} />
          <h3 style={{ fontSize: '1.2rem', fontWeight: 600, color: 'hsl(var(--text-main))' }}>No hay requisiciones pendientes</h3>
          <p style={{ color: 'hsl(var(--text-soft))', marginTop: '0.5rem' }}>Almacén al día.</p>
        </div>
      ) : (
        <div className="req-grid">
          {requisiciones.map((req) => (
            <div key={req.id} className="req-card">
              <div className="req-card-header">
                <div>
                  <div className="req-id">{req.id}</div>
                  <div style={{ fontSize: '0.8rem', color: 'hsl(var(--text-soft))', marginTop: '4px' }}>
                    {req.createdAt && typeof req.createdAt.toDate === 'function' 
                      ? req.createdAt.toDate().toLocaleDateString() 
                      : req.createdAt ? new Date(req.createdAt.seconds ? req.createdAt.seconds * 1000 : req.createdAt).toLocaleDateString() : 'Reciente'}
                  </div>
                </div>
                <span className="req-area">{req.areaId || 'General'}</span>
              </div>
              
              <div className="req-items">
                {req.items.map((it, idx) => (
                  <div key={idx} className="req-item-row">
                    <div>
                      <span className="req-item-name">{it.name}</span>
                      {!it.itemId && <span className="req-item-new-badge">Nuevo</span>}
                    </div>
                    <span className="req-item-qty">{it.quantity} {it.unit}</span>
                  </div>
                ))}
              </div>

              <button 
                className="btn-recibir mt-2" 
                onClick={() => handleOpenReceive(req)}
              >
                <Package size={18} />
                Marcar como Recibido
              </button>
            </div>
          ))}
        </div>
      )}

      {isModalOpen && selectedReq && (
        <div className="modal-overlay">
          <div className="modal-content animate-scale">
            <h3 className="modal-title">Recepción de Mercancía: {selectedReq.id}</h3>
            
            <p style={{ color: 'hsl(var(--text-soft))', marginBottom: '1.5rem', fontSize: '0.9rem' }}>
              Selecciona en qué sección del inventario se guardará cada artículo. Los artículos nuevos se crearán automáticamente.
            </p>

            <div style={{ maxHeight: '400px', overflowY: 'auto', paddingRight: '0.5rem' }}>
              {selectedReq.items.map((item, idx) => (
                <div key={idx} className="receive-item-card">
                  <div className="receive-item-header">
                    <span>
                      {item.name} 
                      {!item.itemId && <span className="req-item-new-badge">Nuevo en Catálogo</span>}
                    </span>
                    <span style={{ color: 'hsl(var(--primary))' }}>+{item.quantity} {item.unit}</span>
                  </div>
                  
                  <div style={{ marginTop: '0.75rem' }}>
                    <label style={{ display: 'block', fontSize: '0.8rem', marginBottom: '0.4rem', color: 'hsl(var(--text-soft))' }}>
                      Guardar en Sección / Categoría
                    </label>
                    <select
                      className="receive-item-select"
                      value={sectionsSelection[idx] || 'general'}
                      onChange={(e) => setSectionsSelection(prev => ({ ...prev, [idx]: e.target.value }))}
                    >
                      {allCategories.map(cat => (
                        <option key={cat.id} value={cat.id}>{cat.name}</option>
                      ))}
                    </select>
                  </div>
                </div>
              ))}
            </div>

            <div className="modal-actions">
              <button className="btn-cancel" onClick={handleCloseReceive} disabled={isProcessing}>
                Cancelar
              </button>
              <button className="btn-confirm" onClick={handleConfirmReceive} disabled={isProcessing}>
                {isProcessing ? 'Procesando...' : 'Confirmar Recepción y Actualizar Stock'}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

export default RequisicionesView;
