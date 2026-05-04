import React, { createContext, useContext, useState, useEffect, useMemo } from 'react';
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
  const [connectionStatus, setConnectionStatus] = useState('online'); // 'online', 'offline', 'reconnecting'

  // Clear state when user logs out
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

  // Sync Items from Firestore (Optimized Batch Loading)
  useEffect(() => {
    if (!user) return;
    
    const initItems = async () => {
      try {
        // Obtenemos TODOS los elementos pero priorizando la caché (ahorro de costos)
        const { snapshot } = await OptimizedDataService.getCollectionOptimized('items', [], 5000);
        const itemsData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        setItems(itemsData);
        setLoading(false);
      } catch (e) {
        console.error("Initial load error:", e);
        setLoading(false);
      }
    };

    initItems();

    // Listener para actualizaciones en tiempo real (Carga todo, pero desde caché si es posible)
    const unsubscribe = OptimizedDataService.subscribeWithCleanup('items', [], (data) => {
      setItems(data);
      setLastSync(new Date());
    });

    return () => unsubscribe();
  }, [user]);


  // Sync Movements from Firestore
  useEffect(() => {
    if (!user) return;

    // Aumentamos el límite para permitir revisión de historial más extenso
    const q = query(collection(db, 'movements'), orderBy('timestamp', 'desc'), limit(1000));
    const unsubscribe = onSnapshot(q, { includeMetadataChanges: true }, (snapshot) => {
      const movementsData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        time: doc.data().timestamp?.toDate().toLocaleString() || 'Reciente'
      }));
      setMovements(movementsData);
    }, (error) => {
      console.error("Firestore Movements Error:", error);
    });

    return () => unsubscribe();
  }, [user]);

  // Sync Personnel from Firestore
  useEffect(() => {
    if (!user) return;

    const q = query(collection(db, 'personnel'), orderBy('name', 'asc'));
    const unsubscribe = onSnapshot(q, { includeMetadataChanges: true }, (snapshot) => {
      const personnelData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      personnelData.sort((a, b) => 
        (a.name || '').trim().toLowerCase().localeCompare((b.name || '').trim().toLowerCase(), undefined, { numeric: true, sensitivity: 'base' })
      );
      setPersonnel(personnelData);
    }, (error) => {
      console.error("Firestore Personnel Error:", error);
    });

    return () => unsubscribe();
  }, [user]);

  // Sync Brands from Firestore
  useEffect(() => {
    if (!user) return;

    const q = query(collection(db, 'brands'), orderBy('name', 'asc'));
    const unsubscribe = onSnapshot(q, { includeMetadataChanges: true }, (snapshot) => {
      const brandsData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      brandsData.sort((a, b) => 
        (a.name || '').trim().toLowerCase().localeCompare((b.name || '').trim().toLowerCase(), undefined, { numeric: true, sensitivity: 'base' })
      );
      setBrands(brandsData);
    }, (error) => {
      console.error("Firestore Brands Error:", error);
    });

    return () => unsubscribe();
  }, [user]);

  // Sync Locations from Firestore
  useEffect(() => {
    if (!user) return;

    const q = query(collection(db, 'locations'), orderBy('name', 'asc'));
    const unsubscribe = onSnapshot(q, { includeMetadataChanges: true }, (snapshot) => {
      const locationsData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      locationsData.sort((a, b) => 
        (a.name || '').trim().toLowerCase().localeCompare((b.name || '').trim().toLowerCase(), undefined, { numeric: true, sensitivity: 'base' })
      );
      setLocations(locationsData);
    }, (error) => {
      console.error("Firestore Locations Error:", error);
    });

    return () => unsubscribe();
  }, [user]);



  const addMovement = async (action, itemName, qty, user = 'Admin', details = '', category = 'General') => {
    try {
      // Look up the subcategory from the items array
      const relatedItem = items.find(i => i.name === itemName);
      const subcategory = relatedItem?.subcategory || '';

      await addDoc(collection(db, 'movements'), {
        action,
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
  };

  const updateStock = async (itemId, change, user = 'Admin', customDetails = '') => {
    const itemIndex = items.findIndex(i => i.id === itemId);
    if (itemIndex === -1) return;

    const item = items[itemIndex];

    // BLOQUEO LÓGICO: No permitir stock negativo
    if (item.qty + change < 0) {
      toast.error("Error: Stock insuficiente para realizar esta operación", {
        description: `Solo quedan ${item.qty} unidades de ${item.name}.`
      });
      return;
    }

    // --- OPTIMISTIC UI UPDATE ---
    // Actualizamos el estado local inmediatamente
    const updatedItems = [...items];
    const oldQty = item.qty;
    updatedItems[itemIndex] = { ...item, qty: item.qty + change };
    setItems(updatedItems);

    try {
      const newQty = item.qty + change;
      const itemRef = doc(db, 'items', itemId);
      
      // Operación asíncrona de fondo
      await updateDoc(itemRef, { qty: newQty });
      
      const defaultDetails = `${change > 0 ? 'Reposición' : 'Gasto'} de material`;
      const finalDetails = customDetails || defaultDetails;

      await addMovement(
        change > 0 ? 'Entrada' : 'Salida', 
        item.name, 
        Math.abs(change), 
        user, 
        finalDetails,
        item.category
      );
      toast.success(`${change > 0 ? 'Entrada' : 'Salida'} registrada: ${item.name}`);
    } catch (e) {
      // ROLLBACK si falla la sincronización
      const rollbackItems = [...items];
      rollbackItems[itemIndex] = { ...item, qty: oldQty };
      setItems(rollbackItems);
      toast.error("Error de sincronización - Los datos se han revertido");
    }
  };

  const loanItem = async (itemId, borrower, user = 'Admin') => {
    const item = items.find(i => i.id === itemId);
    if (!item || (item.qty || 0) <= 0) {
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
        lentBy: user || null,
        loanDate: serverTimestamp()
      });
      await addMovement('Préstamo', item.name, 1, user, borrower, item.category);
      toast.success(`Herramienta prestada a ${borrower} (Disponibles: ${remainingQty})`);
    } catch (e) {
      toast.error("Error al registrar préstamo");
    }
  };

  const returnItem = async (itemId, user = 'Admin') => {
    const item = items.find(i => i.id === itemId);
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
        status: newLent > 0 ? 'Disponible' : 'Disponible', // Always available if returned
        borrowedBy: newLent === 0 ? null : (item.borrowedBy || null),
        lentBy: newLent === 0 ? null : (item.lentBy || null),
        loanDate: newLent === 0 ? null : (item.loanDate || null)
      });
      await addMovement('Devolución', item.name, 1, user, 'Devuelto a almacén', item.category);
      toast.success(`Herramienta devuelta (En almacén: ${newQty})`);
    } catch (e) {
      toast.error("Error al registrar devolución");
    }
  };

  const reportMaintenance = async (itemId, reason, user = 'Admin') => {
    const item = items.find(i => i.id === itemId);
    if (!item) return;

    try {
      const itemRef = doc(db, 'items', itemId);
      const remainingQty = Math.max((item.qty || 0) - 1, 0);

      await updateDoc(itemRef, {
        qty: remainingQty,
        observaciones: `Último reporte: ${reason} (Por: ${user})`,
        status: remainingQty === 0 ? 'Mantenimiento' : 'Disponible'
      });
      await addMovement('Falla/Manto', item.name, 1, user, reason, item.category);
      toast.warning(`Reporte registrado: 1x ${item.name} retirado por falla`);
    } catch (e) {
      toast.error("Error al reportar mantenimiento");
    }
  };

  const auditStock = async (itemId, physicalQty, user = 'Admin', reason = '') => {
    const item = items.find(i => i.id === itemId);
    if (!item) return;

    try {
      const diff = physicalQty - (item.qty || 0);
      const itemRef = doc(db, 'items', itemId);
      await updateDoc(itemRef, { qty: physicalQty });
      
      const finalReason = reason ? `Audit: ${reason}` : `Conteo físico: ${physicalQty} (Ajuste: ${diff > 0 ? '+' : ''}${diff})`;

      await addMovement(
        'Auditoría', 
        item.name, 
        Math.abs(diff), 
        user, 
        finalReason,
        item.category
      );
      toast.success("Auditoría registrada exitosamente");
    } catch (e) {
      toast.error("Error al registrar auditoría");
    }
  };

  const addItem = async (newItem, user = 'Admin') => {
    try {
      await addDoc(collection(db, 'items'), {
        ...newItem,
        qty: parseInt(newItem.qty) || 0,
        threshold: parseInt(newItem.threshold) || 0,
        status: newItem.category === 'Herramientas' ? 'Disponible' : null
      });
      await addMovement('Alta', newItem.name, parseInt(newItem.qty) || 0, user, 'Artículo agregado al inventario', newItem.category || 'General');
      toast.success(`Artículo creado: ${newItem.name}`);
    } catch (e) {
      toast.error("Error al crear artículo");
    }
  };

  const deleteItem = async (itemId, user = 'Admin') => {
    try {
      const item = items.find(i => i.id === itemId);
      await deleteDoc(doc(db, 'items', itemId));
      await addMovement('Eliminación', item?.name || 'Desconocido', 0, user, 'Artículo eliminado del inventario', item?.category || 'General');
      toast.info(`Artículo eliminado: ${item?.name}`);
    } catch (e) {
      toast.error("Error al eliminar artículo");
    }
  };

  const editItem = async (itemId, updatedFields, user = 'Admin') => {
    try {
      const item = items.find(i => i.id === itemId);
      const itemRef = doc(db, 'items', itemId);
      await updateDoc(itemRef, updatedFields);
      await addMovement('Edición', item?.name || updatedFields.name || 'Desconocido', 0, user, 'Artículo editado', item?.category || updatedFields.category || 'General');
      toast.success("Cambios guardados");
    } catch (e) {
      toast.error("Error al editar artículo");
    }
  };

  const bulkAddItems = async (itemsArray) => {
    const batch = writeBatch(db);
    const itemsRef = collection(db, 'items');
    
    itemsArray.forEach((item) => {
      const newDocRef = doc(itemsRef);
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
  };

  const bulkAddPersonnel = async (personnelArray) => {
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
      toast.success(`Personal importado: ${personnelArray.length} trabajadores añadidos`);
    } catch (e) {
      console.error("Bulk upload error:", e);
      toast.error("Error al importar personal");
    }
  };

  const addWorker = async (workerData) => {
    try {
      await addDoc(collection(db, 'personnel'), {
        ...workerData,
        createdAt: serverTimestamp()
      });
      toast.success(`Trabajador añadido: ${workerData.name}`);
    } catch (e) {
      toast.error("Error al añadir trabajador");
    }
  };

  const deleteWorker = async (workerId) => {
    try {
      await deleteDoc(doc(db, 'personnel', workerId));
      toast.info("Trabajador eliminado de la lista");
    } catch (e) {
      toast.error("Error al eliminar trabajador");
    }
  };

  const addBrand = async (name) => {
    try {
      const q = query(collection(db, 'brands'), where('name', '==', name));
      const snap = await getDocs(q);
      if (!snap.empty) {
        toast.error("Esta marca ya existe");
        return;
      }
      await addDoc(collection(db, 'brands'), { name, createdAt: serverTimestamp() });
      toast.success(`Marca añadida: ${name}`);
    } catch (e) {
      toast.error("Error al añadir marca");
    }
  };

  const deleteBrand = async (id) => {
    try {
      await deleteDoc(doc(db, 'brands', id));
      toast.info("Marca eliminada");
    } catch (e) {
      toast.error("Error al eliminar marca");
    }
  };

  const addLocation = async (name, zone = '') => {
    try {
      await addDoc(collection(db, 'locations'), { name, zone, createdAt: serverTimestamp() });
      toast.success(`Ubicación añadida: ${name}`);
    } catch (e) {
      toast.error("Error al añadir ubicación");
    }
  };

  const deleteLocation = async (id) => {
    try {
      await deleteDoc(doc(db, 'locations', id));
      toast.info("Ubicación eliminada");
    } catch (e) {
      toast.error("Error al eliminar ubicación");
    }
  };

  const wipeAllData = async (currentUserId) => {
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
  };

  const deleteItemsByCategory = async (category, user = 'Admin') => {
    try {
      const categoryItems = items.filter(i => i.category === category);
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
        'Eliminación Masiva', 
        `Todo ${category}`, 
        categoryItems.length, 
        user, 
        `Se eliminaron todos los elementos del apartado ${category}`,
        category
      );

      toast.success(`Se eliminaron ${categoryItems.length} artículos de ${category}`, { id: 'category-delete' });
      return true;
    } catch (e) {
      console.error("Delete category error:", e);
      toast.error(`Error al eliminar categoría: ${e.message}`, { id: 'category-delete' });
      return false;
    }
  };

  const clearDatabaseCategories = async (categories, user = 'Admin') => {
    try {
      toast.loading("LIMPIANDO ÁREAS SELECCIONADAS...", { id: 'clear-db' });
      
      for (const category of categories) {
        // Delete Items
        const categoryItems = items.filter(i => i.category === category);
        const batch = writeBatch(db);
        categoryItems.forEach(item => {
          batch.delete(doc(db, 'items', item.id));
        });
        await batch.commit();

        // Delete Movements for this category
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
  };

  const annulMovement = async (movementId, adminName) => {
    const mov = movements.find(m => m.id === movementId);
    if (!mov || mov.annulled) return;

    try {
      const item = items.find(i => i.name === mov.item && i.category === mov.category);
      
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
        } else if (mov.action === 'Auditoría') {
          // Reverting audit is tricky because we don't know the PREVIOUS stock from the movement alone 
          // usually, but we could try to calculate it if we stored it. 
          // For now, let's just reverse simple movements.
        }

        if (qtyChange !== 0 || Object.keys(extraFields).length > 0) {
          await updateDoc(itemRef, { 
            qty: (parseInt(item.qty) || 0) + qtyChange,
            ...extraFields
          });
        }
      }

      await updateDoc(doc(db, 'movements', movementId), {
        annulled: true,
        annulledBy: adminName,
        annulledAt: serverTimestamp()
      });

      await addMovement(
        'Anulación',
        mov.item,
        mov.qty,
        adminName,
        `Reversión de ${mov.action}. Movimiento #${movementId.substring(0,5)}`,
        mov.category
      );

      toast.success("Movimiento anulado correctamente");
    } catch (e) {
      console.error("Annul error:", e);
      toast.error("Error al anular movimiento");
    }
  };

  const contextValue = useMemo(() => ({
    items, movements, personnel, brands, locations, loading, 
    updateStock, addItem, deleteItem, editItem, 
    loanItem, returnItem, bulkAddItems, bulkAddPersonnel,
    addWorker, deleteWorker, reportMaintenance, auditStock,
    addBrand, deleteBrand, addLocation, deleteLocation,
    wipeAllData, deleteItemsByCategory, clearDatabaseCategories, isAutoWiping,
    lastSync, connectionStatus, annulMovement,
    fetchMoreItems: () => {}, hasMore: false
  }), [
    items, movements, personnel, brands, locations, loading,
    isAutoWiping, lastSync, connectionStatus
  ]);

  return (
    <InventoryContext.Provider value={contextValue}>
      {children}
    </InventoryContext.Provider>
  );
};
