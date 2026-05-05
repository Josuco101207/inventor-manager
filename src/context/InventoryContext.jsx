import React, { createContext, useContext, useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useAuth } from './AuthContext';
import { useLocation } from 'react-router-dom';
import { db } from '../firebase/config';
import { 
  collection, 
  onSnapshot, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  doc, 
  query, 
  orderBy, 
  limit,
  serverTimestamp,
  writeBatch,
  getDocs,
  where,
  runTransaction
} from 'firebase/firestore';
import { toast } from 'sonner';
import { OptimizedDataService } from '../firebase/optimizedFirestore';

const InventoryContext = createContext();

export const useInventory = () => useContext(InventoryContext);

/**
 * Contexto principal para manejar los datos del inventario.
 */
export const InventoryProvider = ({ children }) => {
  const { user } = useAuth();
  const location = useLocation();
  const pathname = location?.pathname || '';
  // Movimientos sólo se necesitan en pantallas donde se muestran listas/gráficas
  const shouldSubscribeMovements = pathname === '/' || pathname === '/transactions' || pathname === '/analytics';
  const [items, setItems] = useState([]);
  const [movements, setMovements] = useState([]);
  const [personnel, setPersonnel] = useState([]);
  const [brands, setBrands] = useState([]);
  const [locations, setLocations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isAutoWiping, setIsAutoWiping] = useState(false);
  const [lastSync, setLastSync] = useState(new Date());
  const [connectionStatus, setConnectionStatus] = useState('online');
  
  // Ref para acceso estable a items en callbacks (evita stale closures)
  const itemsRef = useRef(items);
  useEffect(() => { itemsRef.current = items; }, [items]);

  // ─── Limpieza al logout ───
  useEffect(() => {
    if (!user) {
      setItems([]);
      setMovements([]);
      setPersonnel([]);
      setBrands([]);
      setLocations([]);
      setLoading(true);
    }
  }, [user]);

  // ─── Connection Monitor ───
  useEffect(() => {
    const cleanup = OptimizedDataService.monitorConnection((status) => {
      setConnectionStatus(status);
    });
    return cleanup;
  }, []);

  // Cargar artículos en tiempo real
  useEffect(() => {
    if (!user) return;
    
    let cancelled = false;
    
    // Stock real: suscribimos a todos los artículos (sin límite)
    const constraints = [orderBy('name', 'asc')];

    const unsubscribe = OptimizedDataService.subscribeWithCleanup('items', constraints, (data, snapshot) => {
      if (!cancelled) {
        console.log(`[Firestore] Items Sync: ${data.length} docs (From Cache: ${snapshot.metadata.fromCache})`);
        setItems(data);
        setLastSync(new Date());
        setLoading(false);
      }
    });

    return () => { cancelled = true; unsubscribe(); };
  }, [user]);

  // Cargar movimientos recientes
  useEffect(() => {
    if (!user) return;
    if (!shouldSubscribeMovements) return;

    const startDate = new Date();
    startDate.setHours(0, 0, 0, 0);
    // Para cubrir 7 días incluyendo hoy: [hoy-6 ... hoy]
    startDate.setDate(startDate.getDate() - 6);

    // Mantener sólo los últimos 7 días para que `globalStats.activity` y la UI sean exactas
    const q = query(
      collection(db, 'movements'),
      where('timestamp', '>=', startDate),
      orderBy('timestamp', 'desc'),
      limit(500)
    );
    const unsubscribe = onSnapshot(q, { includeMetadataChanges: true }, (snapshot) => {
      if (!snapshot.metadata.hasPendingWrites) {
        console.log(`[Firestore] Movements Sync (From Cache: ${snapshot.metadata.fromCache})`);
        const movementsData = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data(),
          time: doc.data().timestamp?.toDate?.()?.toLocaleString() || 'Reciente'
        }));
        setMovements(movementsData);
      }
    }, (error) => {
      console.error("Firestore Movements Error:", error);
    });

    return () => unsubscribe();
  }, [user, shouldSubscribeMovements]);

  // Cargar datos secundarios (una sola vez)
  const fetchAuxiliaryData = useCallback(async () => {
    try {
      // Usamos la estrategia optimizada para cargar una sola vez y ahorrar lecturas
      const [personnelSnap, brandsSnap, locationsSnap] = await Promise.all([
        OptimizedDataService.getCollectionOptimized('personnel', [orderBy('name', 'asc')], 100),
        OptimizedDataService.getCollectionOptimized('brands', [orderBy('name', 'asc')], 100),
        OptimizedDataService.getCollectionOptimized('locations', [orderBy('name', 'asc')], 100)
      ]);

      setPersonnel(personnelSnap.snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      setBrands(brandsSnap.snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      setLocations(locationsSnap.snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      
      console.log(`[Firestore] Aux Data Sync (Personnel Cache: ${personnelSnap.fromCache})`);
    } catch (error) {
      console.error("Error loading auxiliary data:", error);
    }
  }, []);

  useEffect(() => {
    if (user) fetchAuxiliaryData();
  }, [user, fetchAuxiliaryData]);

  // ─── Helpers ───
  const addMovement = useCallback(async (action, itemName, qty, user = 'Alfonso', details = '', category = 'General', itemId = null) => {
    try {
      const relatedItem = itemsRef.current.find(i => i.name === itemName);
      const subcategory = relatedItem?.subcategory || '';

      await addDoc(collection(db, 'movements'), {
        action,
        itemId,
        item: itemName,
        user,
        details,
        category,
        subcategory,
        qty: Math.abs(qty),
        timestamp: serverTimestamp()
      });
    } catch (e) {
      console.error("Error adding movement:", e);
    }
  }, []);

  // ─── CAPA 4: Optimistic UI — Stock Update ───
  const updateStock = useCallback(async (itemId, change, userName = 'Alfonso', customDetails = '') => {
    const currentItems = itemsRef.current;
    const itemIndex = currentItems.findIndex(i => i.id === itemId);
    if (itemIndex === -1) return;

    const item = currentItems[itemIndex];

    // Bloqueo: No permitir stock negativo
    if ((item.qty || 0) + change < 0) {
      toast.error("Error: Stock insuficiente", {
        description: `Solo quedan ${item.qty} unidades de ${item.name}.`
      });
      return;
    }

    // OPTIMISTIC UI: Actualizar estado local inmediatamente
    const oldQty = item.qty || 0;
    const newQty = oldQty + change;
    
    setItems(prev => {
      const updated = [...prev];
      updated[itemIndex] = { ...item, qty: newQty };
      return updated;
    });

    try {
      const itemRef = doc(db, 'items', itemId);
      await runTransaction(db, async (transaction) => {
        const itemSnap = await transaction.get(itemRef);
        if (!itemSnap.exists()) {
          throw new Error('ITEM_NOT_FOUND');
        }
        const remoteItem = itemSnap.data();
        const remoteQty = parseInt(remoteItem.qty, 10) || 0;
        const remoteNewQty = remoteQty + change;
        if (remoteNewQty < 0) {
          throw new Error('INSUFFICIENT_STOCK');
        }
        transaction.update(itemRef, { qty: remoteNewQty });
      });
      
      const defaultDetails = `${change > 0 ? 'Reposición' : 'Gasto'} de material`;
      await addMovement(
        change > 0 ? 'Entrada' : 'Salida', 
        item.name, 
        Math.abs(change), 
        userName, 
        customDetails || defaultDetails,
        item.category,
        itemId
      );
      toast.success(`${change > 0 ? 'Entrada' : 'Salida'} registrada: ${item.name}`);
    } catch (e) {
      // ROLLBACK si falla
      setItems(prev => {
        const rollback = [...prev];
        const idx = rollback.findIndex(i => i.id === itemId);
        if (idx !== -1) rollback[idx] = { ...rollback[idx], qty: oldQty };
        return rollback;
      });
      if (e.message === 'INSUFFICIENT_STOCK') {
        toast.error("Stock insuficiente para registrar la salida");
      } else {
        toast.error("Error de sincronización — datos revertidos");
      }
    }
  }, [addMovement]);

  const loanItem = useCallback(async (itemId, borrower, userName = 'Alfonso') => {
    const item = itemsRef.current.find(i => i.id === itemId);
    if (!item || (item.qty || 0) <= 0) {
      toast.error("No hay stock disponible para préstamo");
      return;
    }

    try {
      const itemRef = doc(db, 'items', itemId);
      const result = await runTransaction(db, async (transaction) => {
        const itemSnap = await transaction.get(itemRef);
        if (!itemSnap.exists()) {
          throw new Error('ITEM_NOT_FOUND');
        }
        const remoteItem = itemSnap.data();
        const qtyNum = parseInt(remoteItem.qty, 10) || 0;
        if (qtyNum <= 0) {
          throw new Error('NO_STOCK');
        }
        const prestadosNum = parseInt(remoteItem.prestados, 10) || (remoteItem.status === 'Prestado' ? 1 : 0);
        const remainingQty = qtyNum - 1;
        const totalLent = prestadosNum + 1;

        transaction.update(itemRef, {
          qty: remainingQty,
          prestados: totalLent,
          status: remainingQty <= 0 ? 'Prestado' : 'Disponible',
          borrowedBy: borrower || null,
          lentBy: userName || null,
          loanDate: serverTimestamp()
        });
        return { remainingQty };
      });
      await addMovement('Préstamo', item.name, 1, userName, borrower, item.category, itemId);
      toast.success(`Herramienta prestada a ${borrower} (Disponibles: ${result.remainingQty})`);
    } catch (e) {
      if (e.message === 'NO_STOCK') {
        toast.error("No hay stock disponible para préstamo");
      } else {
        toast.error("Error al registrar préstamo");
      }
    }
  }, [addMovement]);

  const returnItem = useCallback(async (itemId, userName = 'Alfonso') => {
    const item = itemsRef.current.find(i => i.id === itemId);
    if (!item) return;

    try {
      const itemRef = doc(db, 'items', itemId);
      const result = await runTransaction(db, async (transaction) => {
        const itemSnap = await transaction.get(itemRef);
        if (!itemSnap.exists()) {
          throw new Error('ITEM_NOT_FOUND');
        }
        const remoteItem = itemSnap.data();
        const qtyNum = parseInt(remoteItem.qty, 10) || 0;
        const prestadosNum = parseInt(remoteItem.prestados, 10) || (remoteItem.status === 'Prestado' ? 1 : 0);
        if (prestadosNum <= 0) {
          throw new Error('NO_LOANS');
        }

        const newQty = qtyNum + 1;
        const newLent = prestadosNum - 1;

        transaction.update(itemRef, {
          qty: newQty,
          prestados: newLent,
          status: 'Disponible',
          borrowedBy: newLent === 0 ? null : (remoteItem.borrowedBy || null),
          lentBy: newLent === 0 ? null : (remoteItem.lentBy || null),
          loanDate: newLent === 0 ? null : (remoteItem.loanDate || null)
        });
        return { newQty };
      });
      await addMovement('Devolución', item.name, 1, userName, 'Devuelto a almacén', item.category, itemId);
      toast.success(`Herramienta devuelta (En almacén: ${result.newQty})`);
    } catch (e) {
      if (e.message === 'NO_LOANS') {
        toast.error("No hay préstamos activos para devolver");
      } else {
        toast.error("Error al registrar devolución");
      }
    }
  }, [addMovement]);

  const reportMaintenance = useCallback(async (itemId, reason, userName = 'Alfonso') => {
    const item = itemsRef.current.find(i => i.id === itemId);
    if (!item) return;

    try {
      const itemRef = doc(db, 'items', itemId);
      const remainingQty = Math.max((item.qty || 0) - 1, 0);

      await updateDoc(itemRef, {
        qty: remainingQty,
        observaciones: `Falla: ${reason} (Reportó: ${userName})`,
        status: 'Mantenimiento'
      });
      await addMovement('Falla/Manto', item.name, 1, userName, reason, item.category, itemId);
      toast.warning(`Reporte registrado: 1x ${item.name} retirado por falla`);
    } catch (e) {
      toast.error("Error al reportar mantenimiento");
    }
  }, [addMovement]);

  const completeMaintenance = useCallback(async (itemId, userName = 'Alfonso') => {
    const item = itemsRef.current.find(i => i.id === itemId);
    if (!item) return;

    try {
      const itemRef = doc(db, 'items', itemId);
      const newQty = (item.qty || 0) + 1;

      await updateDoc(itemRef, {
        qty: newQty,
        status: 'Disponible',
        observaciones: `Reparado el ${new Date().toLocaleDateString()} por ${userName}`
      });
      await addMovement('Entrada', item.name, 1, userName, 'Reparado / Fin de mantenimiento', item.category, itemId);
      toast.success(`Herramienta reparada: ${item.name} vuelve a estar disponible`);
    } catch (e) {
      toast.error("Error al completar mantenimiento");
    }
  }, [addMovement]);

  const auditStock = useCallback(async (itemId, physicalQty, userName = 'Alfonso', reason = '') => {
    const item = itemsRef.current.find(i => i.id === itemId);
    if (!item) return;

    try {
      const diff = physicalQty - (item.qty || 0);
      const itemRef = doc(db, 'items', itemId);
      await updateDoc(itemRef, { qty: physicalQty });
      
      const finalReason = reason ? `Audit: ${reason}` : `Conteo físico: ${physicalQty} (Ajuste: ${diff > 0 ? '+' : ''}${diff})`;

      await addMovement('Auditoría', item.name, Math.abs(diff), userName, finalReason, item.category, itemId);
      toast.success("Auditoría registrada exitosamente");
    } catch (e) {
      toast.error("Error al registrar auditoría");
    }
  }, [addMovement]);

  const addItem = useCallback(async (newItem, userName = 'Alfonso') => {
    try {
      await addDoc(collection(db, 'items'), {
        ...newItem,
        qty: parseInt(newItem.qty) || 0,
        threshold: parseInt(newItem.threshold) || 0,
        status: newItem.category === 'Herramientas' ? 'Disponible' : null
      });
      await addMovement('Alta', newItem.name, parseInt(newItem.qty) || 0, userName, 'Artículo agregado al inventario', newItem.category || 'General');
      toast.success(`Artículo creado: ${newItem.name}`);
    } catch (e) {
      toast.error("Error al crear artículo");
    }
  }, [addMovement]);

  const deleteItem = useCallback(async (itemId, userName = 'Alfonso') => {
    try {
      const item = itemsRef.current.find(i => i.id === itemId);
      await deleteDoc(doc(db, 'items', itemId));
      await addMovement('Eliminación', item?.name || 'Desconocido', 0, userName, 'Artículo eliminado del inventario', item?.category || 'General', itemId);
      toast.info(`Artículo eliminado: ${item?.name}`);
    } catch (e) {
      toast.error("Error al eliminar artículo");
    }
  }, [addMovement]);

  const editItem = useCallback(async (itemId, updatedFields, userName = 'Alfonso') => {
    try {
      const item = itemsRef.current.find(i => i.id === itemId);
      const itemRef = doc(db, 'items', itemId);
      await updateDoc(itemRef, updatedFields);
      await addMovement('Edición', item?.name || updatedFields.name || 'Desconocido', 0, userName, 'Artículo editado', item?.category || updatedFields.category || 'General');
      toast.success("Cambios guardados");
    } catch (e) {
      toast.error("Error al editar artículo");
    }
  }, [addMovement]);

  const bulkAddItems = useCallback(async (itemsArray) => {
    const batch = writeBatch(db);
    const itemsCollRef = collection(db, 'items');
    
    itemsArray.forEach((item) => {
      const newDocRef = doc(itemsCollRef);
      batch.set(newDocRef, {
        ...item,
        qty: parseInt(item.qty) || 0,
        threshold: parseInt(item.threshold) || 1,
        status: item.category === 'Herramientas' ? 'Disponible' : null,
        timestamp: serverTimestamp()
      });
    });

    try {
      await batch.commit();
      toast.success(`Importación exitosa: ${itemsArray.length} artículos añadidos`);
    } catch (e) {
      console.error("Bulk upload error:", e);
      toast.error("Error al importar artículos");
    }
  }, []);

  const bulkAddPersonnel = useCallback(async (personnelArray) => {
    const batch = writeBatch(db);
    const personnelRef = collection(db, 'personnel');
    
    personnelArray.forEach((person) => {
      const newDocRef = doc(personnelRef);
      batch.set(newDocRef, {
        ...person,
        createdAt: serverTimestamp()
      });
    });

    try {
      await batch.commit();
      await fetchAuxiliaryData();
      toast.success(`Personal importado: ${personnelArray.length} trabajadores añadidos`);
    } catch (e) {
      console.error("Bulk upload error:", e);
      toast.error("Error al importar personal");
    }
  }, []);

  const addWorker = useCallback(async (workerData) => {
    try {
      await addDoc(collection(db, 'personnel'), {
        ...workerData,
        createdAt: serverTimestamp()
      });
      await fetchAuxiliaryData();
      toast.success(`Trabajador añadido: ${workerData.name}`);
    } catch (e) {
      toast.error("Error al añadir trabajador");
    }
  }, []);

  const deleteWorker = useCallback(async (workerId) => {
    try {
      await deleteDoc(doc(db, 'personnel', workerId));
      await fetchAuxiliaryData();
      toast.info("Trabajador eliminado de la lista");
    } catch (e) {
      toast.error("Error al eliminar trabajador");
    }
  }, []);

  const addBrand = useCallback(async (name) => {
    try {
      const q = query(collection(db, 'brands'), where('name', '==', name));
      const snap = await getDocs(q);
      if (!snap.empty) {
        toast.error("Esta marca ya existe");
        return;
      }
      await addDoc(collection(db, 'brands'), { name, createdAt: serverTimestamp() });
      await fetchAuxiliaryData();
      toast.success(`Marca añadida: ${name}`);
    } catch (e) {
      toast.error("Error al añadir marca");
    }
  }, []);

  const deleteBrand = useCallback(async (id) => {
    try {
      await deleteDoc(doc(db, 'brands', id));
      await fetchAuxiliaryData();
      toast.info("Marca eliminada");
    } catch (e) {
      toast.error("Error al eliminar marca");
    }
  }, []);

  const addLocation = useCallback(async (name, zone = '') => {
    try {
      await addDoc(collection(db, 'locations'), { name, zone, createdAt: serverTimestamp() });
      await fetchAuxiliaryData();
      toast.success(`Ubicación añadida: ${name}`);
    } catch (e) {
      toast.error("Error al añadir ubicación");
    }
  }, []);

  const deleteLocation = useCallback(async (id) => {
    try {
      await deleteDoc(doc(db, 'locations', id));
      await fetchAuxiliaryData();
      toast.info("Ubicación eliminada");
    } catch (e) {
      toast.error("Error al eliminar ubicación");
    }
  }, []);

  const wipeAllData = useCallback(async (currentUserId) => {
    if (isAutoWiping) return;
    try {
      setIsAutoWiping(true);
      const collections = ['items', 'movements', 'personnel', 'users'];
      toast.loading("ELIMINANDO TODA LA BASE DE DATOS...", { id: 'wipe' });
      
      let totalDocs = 0;
      for (const colName of collections) {
        const ref = collection(db, colName);
        const snap = await getDocs(ref);
        totalDocs += snap.size;
        
        if (snap.empty) continue;
        
        let batch = writeBatch(db);
        let batchCount = 0;
        
        for (const docSnap of snap.docs) {
          if (colName === 'users' && docSnap.id === currentUserId) continue;
          
          batch.delete(docSnap.ref);
          batchCount++;
          
          if (batchCount === 450) {
            await batch.commit();
            batch = writeBatch(db);
            batchCount = 0;
          }
        }
        
        if (batchCount > 0) {
          await batch.commit();
        }
      }
      
      if (totalDocs <= 1) {
         toast.success("LA BASE DE DATOS YA ESTÁ VACÍA", { id: 'wipe' });
      } else {
         toast.success("BASE DE DATOS COMPLETAMENTE LIMPIA (0 REGISTROS)", { id: 'wipe' });
      }
      return true;
    } catch (e) {
      console.error("Wipe error:", e);
      toast.error(`Error crítico: ${e.message}`, { id: 'wipe' });
      return false;
    } finally {
      setIsAutoWiping(false);
    }
  }, [isAutoWiping]);

  const deleteItemsByCategory = useCallback(async (category, userName = 'Alfonso') => {
    try {
      const categoryItems = itemsRef.current.filter(i => i.category === category);
      if (categoryItems.length === 0) {
        toast.info(`No hay artículos en la categoría: ${category}`);
        return;
      }

      toast.loading(`ELIMINANDO ${categoryItems.length} ARTÍCULOS...`, { id: 'category-delete' });
      
      const batch = writeBatch(db);
      categoryItems.forEach(item => {
        batch.delete(doc(db, 'items', item.id));
      });

      await batch.commit();
      
      await addMovement(
        'Eliminación Masiva', `Todo ${category}`, categoryItems.length, 
        userName, `Se eliminaron todos los elementos del apartado ${category}`, category
      );

      toast.success(`Se eliminaron ${categoryItems.length} artículos de ${category}`, { id: 'category-delete' });
      return true;
    } catch (e) {
      console.error("Delete category error:", e);
      toast.error(`Error al eliminar categoría: ${e.message}`, { id: 'category-delete' });
      return false;
    }
  }, [addMovement]);

  const clearDatabaseCategories = useCallback(async (categories, userName = 'Alfonso') => {
    try {
      toast.loading("LIMPIANDO ÁREAS SELECCIONADAS...", { id: 'clear-db' });
      
      for (const category of categories) {
        const categoryItems = itemsRef.current.filter(i => i.category === category);
        const batch = writeBatch(db);
        categoryItems.forEach(item => {
          batch.delete(doc(db, 'items', item.id));
        });
        await batch.commit();

        const movementsRef = collection(db, 'movements');
        const q = query(movementsRef, where('category', '==', category));
        const moveSnap = await getDocs(q);
        
        if (!moveSnap.empty) {
          let moveBatch = writeBatch(db);
          let count = 0;
          for (const moveDoc of moveSnap.docs) {
            moveBatch.delete(moveDoc.ref);
            count++;
            if (count === 450) {
              await moveBatch.commit();
              moveBatch = writeBatch(db);
              count = 0;
            }
          }
          await moveBatch.commit();
        }
      }

      toast.success("Mantenimiento completado exitosamente", { id: 'clear-db' });
      return true;
    } catch (e) {
      console.error("Clear DB error:", e);
      toast.error(`Error en mantenimiento: ${e.message}`, { id: 'clear-db' });
      return false;
    }
  }, []);

  const annulMovement = useCallback(async (movementId, adminName) => {
    const mov = movements.find(m => m.id === movementId);
    if (!mov || mov.annulled) return;

    try {
      const movementRef = doc(db, 'movements', movementId);
      await runTransaction(db, async (transaction) => {
        const movementSnap = await transaction.get(movementRef);
        if (!movementSnap.exists()) {
          throw new Error('MOVEMENT_NOT_FOUND');
        }
        const latestMovement = movementSnap.data();
        if (latestMovement.annulled) {
          throw new Error('ALREADY_ANNULLED');
        }

        const movementItemId = latestMovement.itemId || mov.itemId;
        if (movementItemId) {
          const itemRef = doc(db, 'items', movementItemId);
          const itemSnap = await transaction.get(itemRef);
          if (itemSnap.exists()) {
            const itemData = itemSnap.data();
            let qtyChange = 0;
            const extraFields = {};

            if (latestMovement.action === 'Entrada' || latestMovement.action === 'Alta') {
              qtyChange = -(parseInt(latestMovement.qty, 10) || 0);
            } else if (latestMovement.action === 'Salida') {
              qtyChange = parseInt(latestMovement.qty, 10) || 0;
            } else if (latestMovement.action === 'Préstamo') {
              qtyChange = 1;
              extraFields.prestados = Math.max((parseInt(itemData.prestados, 10) || 0) - 1, 0);
              if (extraFields.prestados === 0) extraFields.status = 'Disponible';
            } else if (latestMovement.action === 'Devolución') {
              qtyChange = -1;
              extraFields.prestados = (parseInt(itemData.prestados, 10) || 0) + 1;
            }

            const nextQty = (parseInt(itemData.qty, 10) || 0) + qtyChange;
            if (nextQty < 0) {
              throw new Error('INVALID_QTY_AFTER_ANNUL');
            }

            if (qtyChange !== 0 || Object.keys(extraFields).length > 0) {
              transaction.update(itemRef, {
                qty: nextQty,
                ...extraFields
              });
            }
          }
        }

        transaction.update(movementRef, {
          annulled: true,
          annulledBy: adminName,
          annulledAt: serverTimestamp()
        });
      });

      await addMovement(
        'Anulación', mov.item, mov.qty, adminName,
        `Reversión de ${mov.action}. Movimiento #${movementId.substring(0,5)}`,
        mov.category,
        mov.itemId || null
      );

      toast.success("Movimiento anulado correctamente");
    } catch (e) {
      console.error("Annul error:", e);
      if (e.message === 'ALREADY_ANNULLED') {
        toast.error("Este movimiento ya fue anulado");
      } else if (e.message === 'INVALID_QTY_AFTER_ANNUL') {
        toast.error("No se puede anular: la reversión dejaría stock negativo");
      } else {
        toast.error("Error al anular movimiento");
      }
    }
  }, [movements, addMovement]);

  // ─── KPIs locales (sin lecturas extra) ───
  const globalStats = useMemo(() => {
    const critical = items.reduce((acc, i) => {
      const qty = parseInt(i.qty, 10) || 0;
      const threshold = parseInt(i.threshold, 10) || 0;
      if (qty === 0) return acc + 1;
      if (qty > 0 && qty <= threshold) return acc + 1;
      return acc;
    }, 0);

    const last7Days = [6, 5, 4, 3, 2, 1, 0].map(i => {
      const d = new Date();
      d.setHours(0, 0, 0, 0);
      d.setDate(d.getDate() - i);
      const nextD = new Date(d);
      nextD.setDate(d.getDate() + 1);
      return { d, nextD, name: d.toLocaleDateString('es-ES', { weekday: 'short' }) };
    });

    const activity = last7Days.map(day => {
      const movimientos = movements.reduce((acc, m) => {
        const ts = m.timestamp?.toDate?.();
        if (!ts) return acc;
        const t = ts instanceof Date ? ts : new Date(ts);
        if (t >= day.d && t < day.nextD) return acc + 1;
        return acc;
      }, 0);

      return { name: day.name, movimientos };
    });

    return {
      items: items.length,
      movements: movements.length,
      critical,
      activity
    };
  }, [items, movements]);

  // ─── Context Value (memoized) ───
  const contextValue = useMemo(() => ({
    items, movements, personnel, brands, locations, loading, globalStats,
    updateStock, addItem, deleteItem, editItem, 
    loanItem, returnItem, bulkAddItems, bulkAddPersonnel,
    addWorker, deleteWorker, reportMaintenance, completeMaintenance, auditStock,
    addBrand, deleteBrand, addLocation, deleteLocation,
    wipeAllData, deleteItemsByCategory, clearDatabaseCategories, isAutoWiping,
    lastSync, connectionStatus, annulMovement,
    fetchMoreItems: () => {}, hasMore: false
  }), [
    items, movements, personnel, brands, locations, loading, globalStats,
    updateStock, addItem, deleteItem, editItem,
    loanItem, returnItem, bulkAddItems, bulkAddPersonnel,
    addWorker, deleteWorker, reportMaintenance, completeMaintenance, auditStock,
    addBrand, deleteBrand, addLocation, deleteLocation,
    wipeAllData, deleteItemsByCategory, clearDatabaseCategories,
    isAutoWiping, lastSync, connectionStatus, annulMovement
  ]);

  return (
    <InventoryContext.Provider value={contextValue}>
      {children}
    </InventoryContext.Provider>
  );
};
