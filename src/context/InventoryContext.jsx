import React, { createContext, useContext, useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useAuth } from './AuthContext';
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
  where
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
  const [items, setItems] = useState([]);
  const [movements, setMovements] = useState([]);
  const [personnel, setPersonnel] = useState([]);
  const [brands, setBrands] = useState([]);
  const [locations, setLocations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isAutoWiping, setIsAutoWiping] = useState(false);
  const [lastSync, setLastSync] = useState(new Date());
  const [connectionStatus, setConnectionStatus] = useState('online');
  const [globalStats, setGlobalStats] = useState({ 
    items: 0, 
    movements: 0, 
    critical: 0,
    activity: [] 
  });
  
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
      setGlobalStats({ items: 0, movements: 0, critical: 0, activity: [] });
      setLoading(true);
    }
  }, [user]);

  // Cargar estadísticas del dashboard
  useEffect(() => {
    if (!user) return;
    const fetchStats = async () => {
      try {
        // 1. Conteos Básicos
        const [itemCount, moveCount] = await Promise.all([
          OptimizedDataService.getCollectionCount('items'),
          OptimizedDataService.getCollectionCount('movements')
        ]);

        // 2. Conteo de Stock Crítico
        // Nota: Firestore no permite comparar dos campos en un query.
        // Como solución temporal eficiente, filtramos los items locales cargados + un query de qty=0
        const outOfStockCount = await OptimizedDataService.getCollectionCount('items', [where('qty', '==', 0)]);
        // FIX: Usar items actual del estado en lugar de ref para evitar race condition
        const localCritical = items.filter(i => (i.qty || 0) <= (i.threshold || 0) && (i.qty || 0) > 0).length;

        // 3. Actividad de los últimos 7 días (Conteos individuales)
        const last7Days = [6, 5, 4, 3, 2, 1, 0].map(i => {
          const d = new Date();
          d.setHours(0,0,0,0);
          d.setDate(d.getDate() - i);
          const nextD = new Date(d);
          nextD.setDate(d.getDate() + 1);
          return { d, nextD, name: d.toLocaleDateString('es-ES', { weekday: 'short' }) };
        });

        const activityPromises = last7Days.map(day => 
          OptimizedDataService.getCollectionCount('movements', [
            where('timestamp', '>=', day.d),
            where('timestamp', '<', day.nextD)
          ])
        );
        const activityCounts = await Promise.all(activityPromises);
        
        const activityData = last7Days.map((day, idx) => ({
          name: day.name,
          movimientos: activityCounts[idx]
        }));

        setGlobalStats({ 
          items: itemCount, 
          movements: moveCount, 
          critical: outOfStockCount + localCritical,
          activity: activityData 
        });
      } catch (e) {
        console.error("Stats fetch error:", e);
      }
    };
    fetchStats();
    // Refrescar cada 5 minutos o cuando cambie el inventario local significativamente
    const interval = setInterval(fetchStats, 300000); 
    return () => clearInterval(interval);
  }, [user, items]); // FIX: Dependencia de items completo para recalcular cuando cambien los datos

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
    
    // Optimizamos el listener global con un límite de seguridad
    const constraints = [orderBy('name', 'asc'), limit(2000)];

    const unsubscribe = OptimizedDataService.subscribeWithCleanup('items', constraints, (data, snapshot) => {
      if (!cancelled) {
        setItems(data);
        // Solo actualizamos lastSync si han pasado más de 30 segundos para evitar re-renders masivos
        const now = new Date();
        setLastSync(prev => {
          if (now.getTime() - prev.getTime() > 30000) return now;
          return prev;
        });
        setLoading(false);
      }
    });

    return () => { cancelled = true; unsubscribe(); };
  }, [user]);

  // Cargar movimientos recientes
  useEffect(() => {
    if (!user) return;

    const q = query(collection(db, 'movements'), orderBy('timestamp', 'desc'), limit(100));
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
  }, [user]);

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
  const addMovement = useCallback(async (action, itemName, qty, user = 'Jonathan', details = '', category = 'General', itemId = null) => {
    try {
      const relatedItem = itemId ? itemsRef.current.find(i => i.id === itemId) : itemsRef.current.find(i => i.name === itemName);
      const subcategory = relatedItem?.subcategory || '';

      await addDoc(collection(db, 'movements'), {
        action,
        item: itemName,
        itemId: itemId || relatedItem?.id || null, // FIX: Guardar itemId para búsqueda segura
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
  const updateStock = useCallback(async (itemId, change, userName = 'Jonathan', customDetails = '') => {
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
      await updateDoc(itemRef, { qty: newQty });
      
      const defaultDetails = `${change > 0 ? 'Reposición' : 'Gasto'} de material`;
      await addMovement(
        change > 0 ? 'Entrada' : 'Salida', 
        item.name, 
        Math.abs(change), 
        userName, 
        customDetails || defaultDetails,
        item.category,
        item.id
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
      toast.error("Error de sincronización — datos revertidos");
    }
  }, [addMovement]);

  const loanItem = useCallback(async (itemId, borrower, userName = 'Jonathan') => {
    const item = itemsRef.current.find(i => i.id === itemId);
    
    // Para herramientas, permitimos el préstamo si está marcada como Disponible, 
    // incluso si por algún error el stock marca 0.
    const isAvailable = item?.status === 'Disponible' || (item?.qty || 0) > 0;

    if (!item || !isAvailable) {
      toast.error("No hay stock disponible para préstamo");
      return;
    }

    try {
      const itemRef = doc(db, 'items', itemId);
      const qtyNum = parseInt(item.qty) || 0;
      const prestadosNum = parseInt(item.prestados) || (item.status === 'Prestado' ? 1 : 0);
      
      const remainingQty = Math.max(qtyNum - 1, 0);
      const totalLent = prestadosNum + 1;
      
      await updateDoc(itemRef, {
        qty: remainingQty,
        prestados: totalLent,
        status: remainingQty <= 0 ? 'Prestado' : 'Disponible',
        borrowedBy: borrower || null,
        lentBy: userName || null,
        loanDate: serverTimestamp()
      });
      await addMovement('Préstamo', item.name, 1, userName, borrower, item.category, item.id);
      toast.success(`Herramienta prestada a ${borrower} (Disponibles: ${remainingQty})`);
    } catch (e) {
      toast.error("Error al registrar préstamo");
    }
  }, [addMovement]);

  const bulkLoanItems = useCallback(async (itemIds, borrower, userName = 'Jonathan') => {
    const availableItems = itemsRef.current.filter(i => 
      itemIds.includes(i.id) && 
      ((i.qty || 0) > 0 || i.status === 'Disponible')
    );

    if (availableItems.length === 0) {
      toast.error("Ninguna de las herramientas seleccionadas está disponible");
      return;
    }

    const batch = writeBatch(db);
    availableItems.forEach(item => {
      const itemRef = doc(db, 'items', item.id);
      const qtyNum = parseInt(item.qty) || 0;
      const prestadosNum = parseInt(item.prestados) || (item.status === 'Prestado' ? 1 : 0);
      const remainingQty = Math.max(qtyNum - 1, 0);
      const totalLent = prestadosNum + 1;
      
      batch.update(itemRef, {
        qty: remainingQty,
        prestados: totalLent,
        status: remainingQty <= 0 ? 'Prestado' : 'Disponible',
        borrowedBy: borrower || null,
        lentBy: userName || null,
        loanDate: serverTimestamp()
      });
    });

    try {
      await batch.commit();
      for (const item of availableItems) {
        await addMovement('Préstamo', item.name, 1, userName, borrower, item.category, item.id);
      }
      toast.success(`${availableItems.length} herramientas prestadas a ${borrower}`);
    } catch (e) {
      toast.error("Error al registrar préstamos masivos");
    }
  }, [addMovement]);

  const returnItem = useCallback(async (itemId, userName = 'Jonathan') => {
    const item = itemsRef.current.find(i => i.id === itemId);
    if (!item) return;

    try {
      const itemRef = doc(db, 'items', itemId);
      const qtyNum = parseInt(item.qty) || 0;
      const prestadosNum = parseInt(item.prestados) || (item.status === 'Prestado' ? 1 : 0);

      const newQty = qtyNum + 1;
      const newLent = Math.max(prestadosNum - 1, 0);

      await updateDoc(itemRef, {
        qty: newQty,
        prestados: newLent,
        status: 'Disponible',
        borrowedBy: newLent === 0 ? null : (item.borrowedBy || null),
        lentBy: newLent === 0 ? null : (item.lentBy || null),
        loanDate: newLent === 0 ? null : (item.loanDate || null)
      });
      await addMovement('Devolución', item.name, 1, userName, 'Devuelto a almacén', item.category, item.id);
      toast.success(`Herramienta devuelta (En almacén: ${newQty})`);
    } catch (e) {
      toast.error("Error al registrar devolución");
    }
  }, [addMovement]);

  const reportMaintenance = useCallback(async (itemId, reason, userName = 'Jonathan') => {
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
      await addMovement('Falla/Manto', item.name, 1, userName, reason, item.category, item.id);
      toast.warning(`Reporte registrado: 1x ${item.name} retirado por falla`);
    } catch (e) {
      toast.error("Error al reportar mantenimiento");
    }
  }, [addMovement]);

  const completeMaintenance = useCallback(async (itemId, userName = 'Jonathan') => {
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
      await addMovement('Entrada', item.name, 1, userName, 'Reparado / Fin de mantenimiento', item.category, item.id);
      toast.success(`Herramienta reparada: ${item.name} vuelve a estar disponible`);
    } catch (e) {
      toast.error("Error al completar mantenimiento");
    }
  }, [addMovement]);

  const auditStock = useCallback(async (itemId, physicalQty, userName = 'Jonathan', reason = '') => {
    const item = itemsRef.current.find(i => i.id === itemId);
    if (!item) return;

    try {
      const diff = physicalQty - (item.qty || 0);
      const itemRef = doc(db, 'items', itemId);
      await updateDoc(itemRef, { qty: physicalQty });
      
      const finalReason = reason ? `Audit: ${reason}` : `Conteo físico: ${physicalQty} (Ajuste: ${diff > 0 ? '+' : ''}${diff})`;

      await addMovement(
        'Auditoría', item.name, Math.abs(diff), userName, finalReason, item.category, item.id
      );
      toast.success("Auditoría registrada exitosamente");
    } catch (e) {
      toast.error("Error al registrar auditoría");
    }
  }, [addMovement]);

  const addItem = useCallback(async (newItem, userName = 'Jonathan') => {
    try {
      // Si es herramienta y no trae cantidad, por defecto es 1
      const defaultQty = newItem.category === 'Herramientas' ? 1 : 0;
      const initialQty = parseInt(newItem.qty);
      
      await addDoc(collection(db, 'items'), {
        ...newItem,
        qty: isNaN(initialQty) ? defaultQty : initialQty,
        threshold: parseInt(newItem.threshold) || 0,
        status: newItem.category === 'Herramientas' ? 'Disponible' : null
      });
      // Note: itemId is not available for new items until after creation
      await addMovement('Alta', newItem.name, parseInt(newItem.qty) || 0, userName, 'Artículo agregado al inventario', newItem.category || 'General');
      toast.success(`Artículo creado: ${newItem.name}`);
    } catch (e) {
      toast.error("Error al crear artículo");
    }
  }, [addMovement]);

  const deleteItem = useCallback(async (itemId, userName = 'Jonathan') => {
    try {
      const item = itemsRef.current.find(i => i.id === itemId);
      await deleteDoc(doc(db, 'items', itemId));
      await addMovement('Eliminación', item?.name || 'Desconocido', 0, userName, 'Artículo eliminado del inventario', item?.category || 'General', item?.id);
      toast.info(`Artículo eliminado: ${item?.name}`);
    } catch (e) {
      toast.error("Error al eliminar artículo");
    }
  }, [addMovement]);

  const editItem = useCallback(async (itemId, updatedFields, userName = 'Jonathan') => {
    try {
      const item = itemsRef.current.find(i => i.id === itemId);
      const itemRef = doc(db, 'items', itemId);
      await updateDoc(itemRef, updatedFields);
      await addMovement('Edición', item?.name || updatedFields.name || 'Desconocido', 0, userName, 'Artículo editado', item?.category || updatedFields.category || 'General', item?.id);
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

  const deleteItemsByCategory = useCallback(async (category, userName = 'Jonathan') => {
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
      
      // Batch deletion - log once per category instead of per item to avoid excessive writes
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

  const clearDatabaseCategories = useCallback(async (categories, userName = 'Jonathan') => {
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
      // FIX: Buscar primero por itemId (confiable), fallback a name+category para datos antiguos
      let item = null;
      if (mov.itemId) {
        item = itemsRef.current.find(i => i.id === mov.itemId);
      }
      // Fallback: buscar por nombre + categoría con validación de unicidad
      if (!item && mov.item && mov.category) {
        const candidates = itemsRef.current.filter(i => i.name === mov.item && i.category === mov.category);
        if (candidates.length === 1) {
          item = candidates[0];
        } else if (candidates.length > 1) {
          console.warn(`Annul: Múltiples items con nombre "${mov.item}" en categoría "${mov.category}". Se requiere itemId.`);
        }
      }
      
      if (item) {
        const itemRef = doc(db, 'items', item.id);
        let qtyChange = 0;
        let extraFields = {};
        
        if (mov.action === 'Entrada' || mov.action === 'Alta') {
          qtyChange = -(parseInt(mov.qty) || 0);
        } else if (mov.action === 'Salida') {
          qtyChange = (parseInt(mov.qty) || 0);
        } else if (mov.action === 'Préstamo') {
          qtyChange = 1;
          extraFields.prestados = Math.max((parseInt(item.prestados) || 0) - 1, 0);
          if (extraFields.prestados === 0) extraFields.status = 'Disponible';
        } else if (mov.action === 'Devolución') {
          qtyChange = -1;
          extraFields.prestados = (parseInt(item.prestados) || 0) + 1;
        }

        if (qtyChange !== 0 || Object.keys(extraFields).length > 0) {
          await updateDoc(itemRef, { 
            qty: (parseInt(item.qty) || 0) + qtyChange,
            ...extraFields
          });
        }
      } else {
        console.warn(`Annul: No se encontró item para movimiento ${movementId}. Stock no revertido.`);
      }

      await updateDoc(doc(db, 'movements', movementId), {
        annulled: true,
        annulledBy: adminName,
        annulledAt: serverTimestamp()
      });

      await addMovement(
        'Anulación', mov.item, mov.qty, adminName,
        `Reversión de ${mov.action}. Movimiento #${movementId.substring(0,5)}`,
        mov.category,
        mov.itemId || item?.id
      );

      toast.success("Movimiento anulado correctamente");
    } catch (e) {
      console.error("Annul error:", e);
      toast.error("Error al anular movimiento");
    }
  }, [movements, addMovement]);

  // ─── Context Value (memoized) ───
  const contextValue = useMemo(() => ({
    items, movements, personnel, brands, locations, loading, globalStats,
    updateStock, addItem, deleteItem, editItem, 
    loanItem, bulkLoanItems, returnItem, bulkAddItems, bulkAddPersonnel,
    addWorker, deleteWorker, reportMaintenance, completeMaintenance, auditStock,
    addBrand, deleteBrand, addLocation, deleteLocation,
    wipeAllData, deleteItemsByCategory, clearDatabaseCategories, isAutoWiping,
    lastSync, connectionStatus, annulMovement,
    fetchMoreItems: () => {}, hasMore: false
  }), [
    items, movements, personnel, brands, locations, loading, globalStats,
    updateStock, addItem, deleteItem, editItem,
    loanItem, bulkLoanItems, returnItem, bulkAddItems, bulkAddPersonnel,
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
