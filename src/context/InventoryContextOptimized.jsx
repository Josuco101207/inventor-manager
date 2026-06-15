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
  where,
  startAfter,
  getDoc,
  increment
} from 'firebase/firestore';
import { toast } from 'sonner';
import { z } from 'zod';
import { OptimizedDataService } from '../firebase/optimizedFirestore';

const InventoryContext = createContext();

export const useInventory = () => useContext(InventoryContext);

// ═══════════════════════════════════════════════════════════════
// ZOD SCHEMAS - Validación de datos
// ═══════════════════════════════════════════════════════════════
const itemSchema = z.object({
  name: z.string().min(2).max(100),
  category: z.string().min(1),
  qty: z.number().int().min(0).default(0),
  threshold: z.number().int().min(0).default(0),
  unit: z.string().default('PZA'),
  status: z.enum(['Disponible', 'Prestado', 'Mantenimiento', 'Asignado']).optional().nullable(),
  subcategory: z.string().optional().nullable(),
  marca: z.string().optional().nullable(),
  brand: z.string().optional().nullable(), // Keep for backward compatibility
  location: z.string().optional().nullable(),
  observaciones: z.string().max(1000).optional().nullable(),
  // Campos adicionales comunes
  modelo: z.string().optional().nullable(),
  serie: z.string().optional().nullable(),
  item_number: z.string().optional().nullable(),
  codigo: z.string().optional().nullable(),
  material: z.string().optional().nullable(),
  rosca: z.string().optional().nullable(),
  tipo: z.string().optional().nullable(),
  grupo: z.string().optional().nullable()
}).passthrough(); // Permitir cualquier otro campo dinámico de los esquemas de categoría

const movementSchema = z.object({
  action: z.enum(['Entrada', 'Salida', 'Préstamo', 'Devolución', 'Falla/Manto', 'Auditoría', 'Alta', 'Edición', 'Eliminación', 'Anulación', 'Asignación']),
  item: z.string().min(1),
  itemId: z.string().optional(),
  qty: z.number().int().min(0),
  user: z.string().min(1),
  details: z.string().optional(),
  category: z.string().min(1)
});

// ═══════════════════════════════════════════════════════════════
// CACHE LOCAL - Persistencia entre sesiones
// ═══════════════════════════════════════════════════════════════
const CACHE_KEYS = {
  ITEMS: 'inv_cache_items',
  MOVEMENTS: 'inv_cache_movements',
  AUX_DATA: 'inv_cache_aux',
  LAST_SYNC: 'inv_cache_sync'
};

const CACHE_TTL = {
  ITEMS: 1000 * 60 * 30,     // 30 minutos
  MOVEMENTS: 1000 * 60 * 15,  // 15 minutos
  AUX_DATA: 1000 * 60 * 60   // 1 hora
};

const cache = {
  get: (key) => {
    try {
      const item = localStorage.getItem(key);
      if (!item) return null;
      const { data, timestamp } = JSON.parse(item);
      if (Date.now() - timestamp > CACHE_TTL[key.split('_').pop()]) {
        localStorage.removeItem(key);
        return null;
      }
      return data;
    } catch { return null; }
  },
  set: (key, data) => {
    try {
      localStorage.setItem(key, JSON.stringify({ data, timestamp: Date.now() }));
    } catch (e) {
      console.warn('Cache failed:', e);
    }
  },
  clear: () => {
    Object.values(CACHE_KEYS).forEach(k => localStorage.removeItem(k));
  }
};

// ═══════════════════════════════════════════════════════════════
// RETRY LOGIC - Backoff exponencial
// ═══════════════════════════════════════════════════════════════
const withRetry = async (fn, maxRetries = 3) => {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (e) {
      const isNetworkError = e.code?.includes('unavailable') || e.code?.includes('network');
      const isQuotaError = e.code?.includes('resource-exhausted');
      
      if (!isNetworkError && !isQuotaError) throw e;
      if (i === maxRetries - 1) throw e;
      
      const delay = Math.min(Math.pow(2, i) * 1000, 10000); // Max 10s
      console.warn(`Retry ${i + 1}/${maxRetries} after ${delay}ms`);
      await new Promise(r => setTimeout(r, delay));
    }
  }
};

// ═══════════════════════════════════════════════════════════════
// PROVIDER
// ═══════════════════════════════════════════════════════════════
export const InventoryProvider = ({ children }) => {
  const { user, userData, isAdmin } = useAuth();
  
  // Estados
  const [items, setItems] = useState(() => cache.get(CACHE_KEYS.ITEMS) || []);
  const [movements, setMovements] = useState(() => cache.get(CACHE_KEYS.MOVEMENTS) || []);
  const [personnel, setPersonnel] = useState(() => {
    const aux = cache.get(CACHE_KEYS.AUX_DATA);
    return aux?.personnel || [];
  });
  const [brands, setBrands] = useState(() => {
    const aux = cache.get(CACHE_KEYS.AUX_DATA);
    return aux?.brands || [];
  });
  const [locations, setLocations] = useState(() => {
    const aux = cache.get(CACHE_KEYS.AUX_DATA);
    return aux?.locations || [];
  });
  
  const [loading, setLoading] = useState(true);
  const [lastSync, setLastSync] = useState(() => cache.get(CACHE_KEYS.LAST_SYNC) || null);
  const [connectionStatus, setConnectionStatus] = useState('online');
  const [isAutoWiping, setIsAutoWiping] = useState(false);
  const [globalStats, setGlobalStats] = useState({ 
    items: 0, 
    movements: 0, 
    critical: 0,
    activity: [] 
  });
  
  // Pagination state
  const [hasMoreItems, setHasMoreItems] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const lastDocRef = useRef(null);
  
  // Refs para acceso estable
  const itemsRef = useRef(items);
  useEffect(() => { itemsRef.current = items; }, [items]);
  
  const movementsRef = useRef(movements);
  useEffect(() => { movementsRef.current = movements; }, [movements]);

  // ═══════════════════════════════════════════════════════════════
  // LIMPIEZA AL LOGOUT
  // ═══════════════════════════════════════════════════════════════
  useEffect(() => {
    if (!user) {
      setItems([]);
      setMovements([]);
      setPersonnel([]);
      setBrands([]);
      setLocations([]);
      setGlobalStats({ items: 0, movements: 0, critical: 0, activity: [] });
      setLoading(true);
      lastDocRef.current = null;
      setHasMoreItems(true);
      // NO limpiamos cache aquí - permite offline mode
    }
  }, [user]);

  // ═══════════════════════════════════════════════════════════════
  // Cargar estadísticas del dashboard
  // ═══════════════════════════════════════════════════════════════
  useEffect(() => {
    if (!user) return;
    const fetchStats = async () => {
      try {
        const [itemCount, moveCount] = await Promise.all([
          OptimizedDataService.getCollectionCount('items'),
          OptimizedDataService.getCollectionCount('movements')
        ]);

        const outOfStockCount = await OptimizedDataService.getCollectionCount('items', [where('qty', '==', 0)]);
        const localCritical = items.filter(i => (i.qty || 0) <= (i.threshold || 0) && (i.qty || 0) > 0).length;

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
    const interval = setInterval(fetchStats, 300000); 
    return () => clearInterval(interval);
  }, [user, items]);


  // ═══════════════════════════════════════════════════════════════
  // LISTENER ÚNICO DE ITEMS - Optimizado
  // Solo carga primeros 100, resto bajo demanda
  // ═══════════════════════════════════════════════════════════════
  useEffect(() => {
    if (!user) return;
    
    let cancelled = false;
    setLoading(true);
    
    // Query optimizada: ordenados por nombre con límite amplio para ver todo
    const q = query(
      collection(db, 'items'), 
      orderBy('name', 'asc'), 
      limit(2000)
    );

    const unsubscribe = onSnapshot(q, { 
      includeMetadataChanges: false // Reducir overhead
    }, async (snapshot) => {
      if (cancelled) return;
      
      const fromCache = snapshot.metadata.fromCache;
      if (fromCache && items.length > 0) return; // Ya tenemos datos
      
      const data = snapshot.docs.map(doc => ({ 
        id: doc.id, 
        ...doc.data(),
        // Normalizar campos
        qty: parseInt(doc.data().qty) || 0,
        threshold: parseInt(doc.data().threshold) || 0
      }));
      
      setItems(data);
      cache.set(CACHE_KEYS.ITEMS, data);
      lastDocRef.current = snapshot.docs[snapshot.docs.length - 1];
      setHasMoreItems(data.length === 2000);
      setLoading(false);
      setLastSync(new Date());
      cache.set(CACHE_KEYS.LAST_SYNC, new Date());
      
      console.log(`[Items] Loaded ${data.length} from ${fromCache ? 'cache' : 'server'}`);
    }, (error) => {
      console.error('[Items] Error:', error);
      // Fallback a cache si existe
      const cached = cache.get(CACHE_KEYS.ITEMS);
      if (cached && items.length === 0) {
        setItems(cached);
        setLoading(false);
        toast.warning('Usando datos en caché');
      }
    });

    return () => { cancelled = true; unsubscribe(); };
  }, [user]);

  // ═══════════════════════════════════════════════════════════════
  // PAGINACIÓN - Cargar más items bajo demanda
  // ═══════════════════════════════════════════════════════════════
  const loadMoreItems = useCallback(async () => {
    if (!hasMoreItems || isLoadingMore || !user) return;
    
    setIsLoadingMore(true);
    try {
      await withRetry(async () => {
        const q = query(
          collection(db, 'items'),
          orderBy('name', 'asc'),
          startAfter(lastDocRef.current),
          limit(2000)
        );
        
        const snapshot = await getDocs(q);
        const newItems = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data(),
          qty: parseInt(doc.data().qty) || 0,
          threshold: parseInt(doc.data().threshold) || 0
        }));
        
        if (newItems.length > 0) {
          setItems(prev => {
            const combined = [...prev, ...newItems];
            cache.set(CACHE_KEYS.ITEMS, combined);
            return combined;
          });
          lastDocRef.current = snapshot.docs[snapshot.docs.length - 1];
          setHasMoreItems(newItems.length === 100);
        } else {
          setHasMoreItems(false);
        }
      });
    } catch (e) {
      toast.error('Error cargando más items');
    } finally {
      setIsLoadingMore(false);
    }
  }, [hasMoreItems, isLoadingMore, user]);

  // ═══════════════════════════════════════════════════════════════
  // LISTENER DE MOVIMIENTOS - Solo últimos 50 (reduce lecturas)
  // ═══════════════════════════════════════════════════════════════
  useEffect(() => {
    if (!user) return;

    const q = query(
      collection(db, 'movements'), 
      orderBy('timestamp', 'desc'), 
      limit(50) // Reducido de 100 a 50
    );
    
    const unsubscribe = onSnapshot(q, { includeMetadataChanges: false }, (snapshot) => {
      // Solo actualizar si hay cambios reales (no metadata)
      if (snapshot.docChanges().length === 0) return;
      
      const data = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        time: doc.data().timestamp?.toDate?.()?.toLocaleString() || 'Reciente'
      }));
      
      setMovements(data);
      cache.set(CACHE_KEYS.MOVEMENTS, data);
    }, { 
      includeMetadataChanges: false 
    });

    return () => unsubscribe();
  }, [user]);

  // ═══════════════════════════════════════════════════════════════
  // DATOS AUXILIARES - Cargar una sola vez
  // ═══════════════════════════════════════════════════════════════
  const fetchAuxiliaryData = useCallback(async () => {
    const cached = cache.get(CACHE_KEYS.AUX_DATA);
    if (cached && (Date.now() - cached._timestamp < CACHE_TTL.AUX_DATA)) {
      setPersonnel(cached.personnel);
      setBrands(cached.brands);
      setLocations(cached.locations);
      return;
    }

    try {
      await withRetry(async () => {
        const [personnelSnap, brandsSnap, locationsSnap] = await Promise.all([
          getDocs(query(collection(db, 'personnel'), orderBy('name', 'asc'), limit(100))),
          getDocs(query(collection(db, 'brands'), orderBy('name', 'asc'), limit(100))),
          getDocs(query(collection(db, 'locations'), orderBy('name', 'asc'), limit(100)))
        ]);

        const auxData = {
          personnel: personnelSnap.docs.map(d => ({ id: d.id, ...d.data() })),
          brands: brandsSnap.docs.map(d => ({ id: d.id, ...d.data() })),
          locations: locationsSnap.docs.map(d => ({ id: d.id, ...d.data() })),
          _timestamp: Date.now()
        };

        setPersonnel(auxData.personnel);
        setBrands(auxData.brands);
        setLocations(auxData.locations);
        cache.set(CACHE_KEYS.AUX_DATA, auxData);
      });
    } catch (e) {
      console.error('[AuxData] Error:', e);
    }
  }, []);

  useEffect(() => {
    if (user) fetchAuxiliaryData();
  }, [user, fetchAuxiliaryData]);

  // ═══════════════════════════════════════════════════════════════
  // HELPERS
  // ═══════════════════════════════════════════════════════════════
  const addMovement = useCallback(async (action, itemName, qty, userName = 'Jonathan', details = '', category = 'General', itemId = null) => {
    try {
      const validated = movementSchema.parse({
        action, item: itemName, itemId, qty, user: userName, details, category
      });

      const relatedItem = itemId ? itemsRef.current.find(i => i.id === itemId) : null;
      
      await withRetry(() => addDoc(collection(db, 'movements'), {
        ...validated,
        subcategory: relatedItem?.subcategory || '',
        timestamp: serverTimestamp()
      }));
    } catch (e) {
      if (e instanceof z.ZodError) {
        console.error('Validation error:', e.errors);
      } else {
        console.error("[Movement] Error:", e);
      }
    }
  }, []);

  // ═══════════════════════════════════════════════════════════════
  // OPERACIONES CRUD CON OPTIMISTIC UI
  // ═══════════════════════════════════════════════════════════════
  
  // UPDATE STOCK - Optimistic UI + Rollback
  const updateStock = useCallback(async (itemId, change, userName = 'Jonathan', customDetails = '') => {
    const currentItems = itemsRef.current;
    const itemIndex = currentItems.findIndex(i => i.id === itemId);
    if (itemIndex === -1) return;

    const item = currentItems[itemIndex];
    
    // Validación: No stock negativo
    const oldQty = item.qty || 0;
    const newQty = oldQty + change;
    
    if (newQty < 0) {
      toast.error("Stock insuficiente", { description: `Solo quedan ${oldQty} unidades` });
      return;
    }

    // OPTIMISTIC: Actualizar UI inmediatamente
    setItems(prev => {
      const updated = [...prev];
      updated[itemIndex] = { ...item, qty: newQty };
      cache.set(CACHE_KEYS.ITEMS, updated);
      return updated;
    });

    try {
      await withRetry(() => updateDoc(doc(db, 'items', itemId), { 
        qty: newQty,
        lastModified: serverTimestamp()
      }));
      
      await addMovement(
        change > 0 ? 'Entrada' : 'Salida', 
        item.name, 
        Math.abs(change), 
        userName, 
        customDetails || `${change > 0 ? 'Reposición' : 'Gasto'} de material`,
        item.category,
        item.id
      );
      
      toast.success(`${change > 0 ? 'Entrada' : 'Salida'} registrada`);
    } catch (e) {
      // ROLLBACK
      setItems(prev => {
        const rollback = [...prev];
        const idx = rollback.findIndex(i => i.id === itemId);
        if (idx !== -1) rollback[idx] = { ...rollback[idx], qty: oldQty };
        cache.set(CACHE_KEYS.ITEMS, rollback);
        return rollback;
      });
      toast.error("Error - cambios revertidos");
    }
  }, [addMovement]);

  // PRÉSTAMO - Optimistic UI
  const loanItem = useCallback(async (itemId, borrower, userName = 'Jonathan') => {
    const item = itemsRef.current.find(i => i.id === itemId);
    if (!item) return;
    
    const isAvailable = item.status === 'Disponible' || (item.qty || 0) > 0;
    if (!isAvailable) {
      toast.error("No hay stock disponible");
      return;
    }

    // Guardar estado anterior
    const previousState = { qty: item.qty, status: item.status, prestados: item.prestados };
    
    // OPTIMISTIC
    const newQty = Math.max((item.qty || 0) - 1, 0);
    const newPrestados = (item.prestados || 0) + 1;
    const newStatus = newQty <= 0 ? 'Prestado' : 'Disponible';
    
    setItems(prev => prev.map(i => i.id === itemId ? {
      ...i, qty: newQty, prestados: newPrestados, status: newStatus,
      borrowedBy: borrower, lentBy: userName, loanDate: new Date()
    } : i));

    try {
      await withRetry(() => updateDoc(doc(db, 'items', itemId), {
        qty: increment(-1),
        prestados: increment(1),
        status: newStatus,
        borrowedBy: borrower,
        lentBy: userName,
        loanDate: serverTimestamp(),
        lastModified: serverTimestamp()
      }));
      
      await addMovement('Préstamo', item.name, 1, userName, borrower, item.category, item.id);
      toast.success(`Prestado a ${borrower}`);
    } catch (e) {
      // ROLLBACK
      setItems(prev => prev.map(i => i.id === itemId ? { ...i, ...previousState } : i));
      toast.error("Error al prestar");
    }
  }, [addMovement]);

  // ASIGNACIÓN - Optimistic UI
  const assignItem = useCallback(async (itemId, assignee, userName = 'Jonathan') => {
    const item = itemsRef.current.find(i => i.id === itemId);
    if (!item) return;
    
    const isAvailable = item.status === 'Disponible' || (item.qty || 0) > 0;
    if (!isAvailable) {
      toast.error("No hay stock disponible");
      return;
    }

    // Guardar estado anterior
    const previousState = { qty: item.qty, status: item.status, asignados: item.asignados };
    
    // OPTIMISTIC
    const newQty = Math.max((item.qty || 0) - 1, 0);
    const newAsignados = (item.asignados || 0) + 1;
    const newStatus = newQty <= 0 ? 'Asignado' : 'Disponible';
    
    setItems(prev => prev.map(i => i.id === itemId ? {
      ...i, qty: newQty, asignados: newAsignados, status: newStatus,
      assignedTo: assignee, assignedBy: userName, assignmentDate: new Date()
    } : i));

    try {
      await withRetry(() => updateDoc(doc(db, 'items', itemId), {
        qty: increment(-1),
        asignados: increment(1),
        status: newStatus,
        assignedTo: assignee,
        assignedBy: userName,
        assignmentDate: serverTimestamp(),
        lastModified: serverTimestamp()
      }));
      
      await addMovement('Asignación', item.name, 1, userName, assignee, item.category, item.id);
      toast.success(`Asignado a ${assignee}`);
    } catch (e) {
      // ROLLBACK
      setItems(prev => prev.map(i => i.id === itemId ? { ...i, ...previousState } : i));
      toast.error("Error al asignar");
    }
  }, [addMovement]);

  // DEVOLUCIÓN - Optimistic UI
  const returnItem = useCallback(async (itemId, userName = 'Jonathan') => {
    const item = itemsRef.current.find(i => i.id === itemId);
    if (!item) return;

    const isAssigned = item.status === 'Asignado';
    const previousState = { qty: item.qty, status: item.status, prestados: item.prestados, borrowedBy: item.borrowedBy, asignados: item.asignados, assignedTo: item.assignedTo };
    
    const newQty = (item.qty || 0) + 1;
    const newPrestados = isAssigned ? (item.prestados || 0) : Math.max((item.prestados || 0) - 1, 0);
    const newAsignados = isAssigned ? Math.max((item.asignados || 0) - 1, 0) : (item.asignados || 0);
    const newStatus = 'Disponible';
    const newBorrowedBy = newPrestados === 0 ? null : item.borrowedBy;
    const newAssignedTo = newAsignados === 0 ? null : item.assignedTo;

    // OPTIMISTIC
    setItems(prev => prev.map(i => i.id === itemId ? {
      ...i, qty: newQty, prestados: newPrestados, asignados: newAsignados, status: newStatus, borrowedBy: newBorrowedBy, assignedTo: newAssignedTo
    } : i));

    try {
      await withRetry(() => updateDoc(doc(db, 'items', itemId), {
        qty: increment(1),
        prestados: newPrestados,
        asignados: newAsignados,
        status: newStatus,
        borrowedBy: newBorrowedBy,
        assignedTo: newAssignedTo,
        lastModified: serverTimestamp()
      }));
      
      await addMovement('Devolución', item.name, 1, userName, 'Devuelto a almacén', item.category, item.id);
      toast.success('Devolución registrada');
    } catch (e) {
      setItems(prev => prev.map(i => i.id === itemId ? { ...i, ...previousState } : i));
      toast.error('Error al devolver');
    }
  }, [addMovement]);

  // ADD ITEM - Validación con Zod
  const addItem = useCallback(async (newItem, userName = 'Jonathan') => {
    try {
      const validated = itemSchema.parse(newItem);
      const defaultQty = validated.category === 'Herramientas' ? 1 : 0;
      
      const docRef = await withRetry(() => addDoc(collection(db, 'items'), {
        ...validated,
        qty: isNaN(validated.qty) ? defaultQty : validated.qty,
        status: validated.category === 'Herramientas' ? 'Disponible' : null,
        createdAt: serverTimestamp(),
        lastModified: serverTimestamp(),
        createdBy: userName
      }));
      
      // OPTIMISTIC: Agregar a la lista local
      const itemWithId = { 
        id: docRef.id, 
        ...validated, 
        qty: isNaN(validated.qty) ? defaultQty : validated.qty 
      };
      
      setItems(prev => {
        const updated = [itemWithId, ...prev];
        cache.set(CACHE_KEYS.ITEMS, updated);
        return updated;
      });
      
      await addMovement('Alta', validated.name, validated.qty || 0, userName, 'Artículo agregado', validated.category, docRef.id);
      toast.success(`Agregado: ${validated.name}`);
      return docRef.id;
    } catch (e) {
      if (e instanceof z.ZodError) {
        toast.error('Datos inválidos: ' + e.errors.map(err => err.message).join(', '));
      } else {
        toast.error('Error al agregar');
      }
      throw e;
    }
  }, [addMovement]);

  // DELETE ITEM - Soft delete con Undo
  const deleteItem = useCallback(async (itemId, userName = 'Jonathan') => {
    const item = itemsRef.current.find(i => i.id === itemId);
    if (!item) return;

    // SOFT DELETE: Ocultar de UI inmediatamente
    setItems(prev => {
      const filtered = prev.filter(i => i.id !== itemId);
      cache.set(CACHE_KEYS.ITEMS, filtered);
      return filtered;
    });

    let undone = false;
    
    toast.info(`"${item.name}" eliminado`, {
      action: {
        label: 'Deshacer',
        onClick: () => {
          undone = true;
          setItems(prev => {
            const restored = [...prev, item];
            cache.set(CACHE_KEYS.ITEMS, restored);
            return restored;
          });
          toast.success('Restaurado');
        }
      },
      duration: 5000
    });

    // Delete real después de 5s si no se deshace
    setTimeout(async () => {
      if (undone) return;
      try {
        await withRetry(() => deleteDoc(doc(db, 'items', itemId)));
        await addMovement('Eliminación', item.name, 0, userName, 'Artículo eliminado', item.category, itemId);
      } catch (e) {
        // Restaurar si falló
        setItems(prev => {
          if (!prev.find(i => i.id === itemId)) {
            const restored = [...prev, item];
            cache.set(CACHE_KEYS.ITEMS, restored);
            return restored;
          }
          return prev;
        });
        toast.error('Error al eliminar - restaurado');
      }
    }, 5000);
  }, [addMovement]);

  // EDIT ITEM - Optimistic UI
  const editItem = useCallback(async (itemId, updatedFields, userName = 'Jonathan') => {
    const item = itemsRef.current.find(i => i.id === itemId);
    if (!item) return;

    const previousItem = { ...item };

    // OPTIMISTIC
    setItems(prev => prev.map(i => {
      if (i.id !== itemId) return i;
      const merged = { ...i, ...updatedFields, lastModified: new Date() };
      return merged;
    }));

    try {
      await withRetry(() => updateDoc(doc(db, 'items', itemId), {
        ...updatedFields,
        lastModified: serverTimestamp()
      }));
      
      await addMovement('Edición', item.name, 0, userName, 'Artículo editado', item.category, itemId);
      toast.success('Cambios guardados');
    } catch (e) {
      setItems(prev => prev.map(i => i.id === itemId ? previousItem : i));
      toast.error('Error al editar');
    }
  }, [addMovement]);

  // MANTENIMIENTO - Reportar falla
  const reportMaintenance = useCallback(async (itemId, reason, userName = 'Jonathan') => {
    const item = itemsRef.current.find(i => i.id === itemId);
    if (!item) return;

    const previousState = { qty: item.qty, status: item.status, observaciones: item.observaciones };
    const newQty = Math.max((item.qty || 0) - 1, 0);

    setItems(prev => prev.map(i => i.id === itemId ? {
      ...i, qty: newQty, status: 'Mantenimiento',
      observaciones: `Falla: ${reason} (Reportó: ${userName})`
    } : i));

    try {
      await withRetry(() => updateDoc(doc(db, 'items', itemId), {
        qty: increment(-1),
        status: 'Mantenimiento',
        observaciones: `Falla: ${reason} (Reportó: ${userName})`,
        lastModified: serverTimestamp()
      }));
      
      await addMovement('Falla/Manto', item.name, 1, userName, reason, item.category, itemId);
      toast.warning('Reportado para mantenimiento');
    } catch (e) {
      setItems(prev => prev.map(i => i.id === itemId ? { ...i, ...previousState } : i));
      toast.error('Error al reportar');
    }
  }, [addMovement]);

  // COMPLETAR MANTENIMIENTO
  const completeMaintenance = useCallback(async (itemId, userName = 'Jonathan') => {
    const item = itemsRef.current.find(i => i.id === itemId);
    if (!item) return;

    const previousState = { qty: item.qty, status: item.status, observaciones: item.observaciones };

    setItems(prev => prev.map(i => i.id === itemId ? {
      ...i, qty: (i.qty || 0) + 1, status: 'Disponible',
      observaciones: `Reparado el ${new Date().toLocaleDateString()} por ${userName}`
    } : i));

    try {
      await withRetry(() => updateDoc(doc(db, 'items', itemId), {
        qty: increment(1),
        status: 'Disponible',
        observaciones: `Reparado el ${new Date().toLocaleDateString()} por ${userName}`,
        lastModified: serverTimestamp()
      }));
      
      await addMovement('Entrada', item.name, 1, userName, 'Reparado / Fin mantenimiento', item.category, itemId);
      toast.success('Herramienta reparada');
    } catch (e) {
      setItems(prev => prev.map(i => i.id === itemId ? { ...i, ...previousState } : i));
      toast.error('Error');
    }
  }, [addMovement]);

  // AUDITORÍA
  const auditStock = useCallback(async (itemId, physicalQty, userName = 'Jonathan', reason = '') => {
    const item = itemsRef.current.find(i => i.id === itemId);
    if (!item) return;

    const previousQty = item.qty || 0;
    const diff = physicalQty - previousQty;

    setItems(prev => prev.map(i => i.id === itemId ? { ...i, qty: physicalQty } : i));

    try {
      await withRetry(() => updateDoc(doc(db, 'items', itemId), { 
        qty: physicalQty,
        lastModified: serverTimestamp()
      }));
      
      await addMovement(
        'Auditoría', item.name, Math.abs(diff), userName,
        reason || `Conteo: ${physicalQty} (Ajuste: ${diff > 0 ? '+' : ''}${diff})`,
        item.category, itemId
      );
      toast.success('Auditoría registrada');
    } catch (e) {
      setItems(prev => prev.map(i => i.id === itemId ? { ...i, qty: previousQty } : i));
      toast.error('Error');
    }
  }, [addMovement]);

  // BULK OPERATIONS
  const bulkAddItems = useCallback(async (itemsArray) => {
    const batch = writeBatch(db);
    const addedItems = [];
    
    for (const item of itemsArray) {
      try {
        const validated = itemSchema.parse(item);
        const newDocRef = doc(collection(db, 'items'));
        batch.set(newDocRef, {
          ...validated,
          qty: parseInt(validated.qty) || 0,
          threshold: parseInt(validated.threshold) || 1,
          status: validated.category === 'Herramientas' ? 'Disponible' : null,
          createdAt: serverTimestamp(),
          lastModified: serverTimestamp()
        });
        addedItems.push({ id: newDocRef.id, ...validated });
      } catch (e) {
        console.warn('Item inválido:', item, e);
      }
    }

    try {
      await withRetry(() => batch.commit());
      setItems(prev => {
        const updated = [...addedItems, ...prev];
        cache.set(CACHE_KEYS.ITEMS, updated);
        return updated;
      });
      toast.success(`${addedItems.length} items importados`);
    } catch (e) {
      toast.error('Error al importar');
    }
  }, []);

  // ANULAR MOVIMIENTO
  const annulMovement = useCallback(async (movementId, adminName) => {
    const mov = movementsRef.current.find(m => m.id === movementId);
    if (!mov || mov.annulled) return;

    try {
      // Buscar item por ID (más confiable)
      let item = null;
      if (mov.itemId) {
        item = itemsRef.current.find(i => i.id === mov.itemId);
      }
      
      if (item) {
        let qtyChange = 0;
        let extraFields = {};
        
        if (mov.action === 'Entrada' || mov.action === 'Alta') {
          qtyChange = -(mov.qty || 0);
        } else if (mov.action === 'Salida') {
          qtyChange = (mov.qty || 0);
        } else if (mov.action === 'Préstamo') {
          qtyChange = 1;
          extraFields.prestados = Math.max((item.prestados || 0) - 1, 0);
          if (extraFields.prestados === 0) extraFields.status = 'Disponible';
        } else if (mov.action === 'Devolución') {
          qtyChange = -1;
          extraFields.prestados = (item.prestados || 0) + 1;
        }

        if (qtyChange !== 0 || Object.keys(extraFields).length > 0) {
          await withRetry(() => updateDoc(doc(db, 'items', item.id), { 
            qty: increment(qtyChange),
            ...extraFields,
            lastModified: serverTimestamp()
          }));
        }
      }

      await withRetry(() => updateDoc(doc(db, 'movements', movementId), {
        annulled: true,
        annulledBy: adminName,
        annulledAt: serverTimestamp()
      }));

      await addMovement(
        'Anulación', mov.item, mov.qty, adminName,
        `Reversión de ${mov.action}`,
        mov.category, mov.itemId
      );

      toast.success('Movimiento anulado');
    } catch (e) {
      toast.error('Error al anular');
    }
  }, [addMovement]);

  // CLEAR CACHE manual
  const clearCache = useCallback(() => {
    cache.clear();
    toast.info('Caché limpiado');
  }, []);

  // ═══════════════════════════════════════════════════════════════
  // VALUE MEMOIZED
  // ═══════════════════════════════════════════════════════════════
  const value = useMemo(() => ({
    items, movements, personnel, brands, locations,
    loading, isLoadingMore, hasMoreItems, lastSync, globalStats,
    updateStock, addItem, deleteItem, editItem,
    loanItem, assignItem, returnItem, reportMaintenance, completeMaintenance, auditStock,
    bulkAddItems, annulMovement, loadMoreItems, clearCache,
    itemsRef
  }), [
    items, movements, personnel, brands, locations,
    loading, isLoadingMore, hasMoreItems, lastSync, globalStats,
    updateStock, addItem, deleteItem, editItem,
    loanItem, assignItem, returnItem, reportMaintenance, completeMaintenance, auditStock,
    bulkAddItems, annulMovement, loadMoreItems, clearCache
  ]);

  return (
    <InventoryContext.Provider value={value}>
      {children}
    </InventoryContext.Provider>
  );
};

export default InventoryContext;
