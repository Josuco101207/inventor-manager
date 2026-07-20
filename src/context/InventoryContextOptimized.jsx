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
  increment,
  runTransaction
} from 'firebase/firestore';
import { toast } from 'sonner';
import initialPersonnel from '../data/personnel.json';
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
  stockByLocation: z.record(z.number().int().min(0)).optional().default({}), // Novedad: Sub Almacenes
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
  action: z.enum(['Entrada', 'Salida', 'Préstamo', 'Devolución', 'Falla/Manto', 'Auditoría', 'Alta', 'Edición', 'Eliminación', 'Anulación', 'Asignación', 'Transferencia', 'Movimiento de Sección']),
  item: z.string().min(1),
  itemId: z.string().optional(),
  qty: z.number().int().min(0),
  user: z.string().min(1),
  details: z.string().optional(),
  category: z.string().min(1),
  sourceLocation: z.string().optional().nullable(),
  destinationLocation: z.string().optional().nullable()
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

const CACHE_TTL_MAP = {
  items: 1000 * 60 * 30,      // 30 minutos
  movements: 1000 * 60 * 15,  // 15 minutos
  aux: 1000 * 60 * 60,        // 1 hora
  sync: 1000 * 60 * 60        // 1 hora
};

const cache = {
  get: (key) => {
    try {
      const item = localStorage.getItem(key);
      if (!item) return null;
      const { data, timestamp } = JSON.parse(item);
      const ttlKey = key.split('_').pop(); // items, movements, aux, sync
      const ttl = CACHE_TTL_MAP[ttlKey];
      if (ttl && Date.now() - timestamp > ttl) {
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
      console.warn('Cache write failed (localStorage full?):', e);
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
  const [lastSync, setLastSync] = useState(() => {
    const cached = cache.get(CACHE_KEYS.LAST_SYNC);
    return cached ? new Date(cached) : null;
  });
  const [connectionStatus, setConnectionStatus] = useState(navigator.onLine ? 'online' : 'offline');
  const [pendingWrites, setPendingWrites] = useState(0);
  const [globalStats, setGlobalStats] = useState({ 
    items: 0, 
    movements: 0, 
    outOfStockBase: 0,
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

  // Set de IDs pendientes de eliminación (para evitar que onSnapshot los re-inserte)
  const pendingDeletesRef = useRef(new Set());

  // Ref para saber si ya recibimos datos iniciales (evita stale closure)
  const hasInitialDataRef = useRef(items.length > 0);
  useEffect(() => { if (items.length > 0) hasInitialDataRef.current = true; }, [items]);

  // ═══════════════════════════════════════════════════════════════
  // MONITOREO DE CONEXIÓN - Estado real de red
  // ═══════════════════════════════════════════════════════════════
  useEffect(() => {
    const handleOnline = () => {
      setConnectionStatus('online');
      toast.success('Conexión restaurada', { description: 'Los cambios pendientes se sincronizarán automáticamente.', duration: 3000 });
    };
    const handleOffline = () => {
      setConnectionStatus('offline');
      toast.warning('Sin conexión', { description: 'Los cambios se guardarán localmente y se sincronizarán al reconectar.', duration: 5000 });
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

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
        const last7Days = [6, 5, 4, 3, 2, 1, 0].map(i => {
          const d = new Date();
          d.setHours(0,0,0,0);
          d.setDate(d.getDate() - i);
          const nextD = new Date(d);
          nextD.setDate(d.getDate() + 1);
          return { d, nextD, name: d.toLocaleDateString('es-ES', { weekday: 'short' }) };
        });

        const promises = [
          OptimizedDataService.getCollectionCount('items'),
          OptimizedDataService.getCollectionCount('movements'),
          OptimizedDataService.getCollectionCount('items', [where('qty', '==', 0)]),
          ...last7Days.map(day => OptimizedDataService.getCollectionCount('movements', [
            where('timestamp', '>=', day.d),
            where('timestamp', '<', day.nextD)
          ]))
        ];

        const [itemCount, moveCount, outOfStockCount, ...activityCounts] = await Promise.all(promises);

        const activityData = last7Days.map((day, idx) => ({
          name: day.name,
          movimientos: activityCounts[idx]
        }));

        setGlobalStats(prev => ({ 
          ...prev,
          items: itemCount, 
          movements: moveCount, 
          outOfStockBase: outOfStockCount,
          critical: outOfStockCount + (itemsRef.current ? itemsRef.current.filter(i => (i.qty || 0) <= (i.threshold || 0) && (i.qty || 0) > 0).length : 0),
          activity: activityData 
        }));
      } catch (e) {
        console.error("Stats fetch error (using local fallback):", e);
        // Fallback local: calcular desde items en memoria
        const currentItems = itemsRef.current || [];
        const outOfStock = currentItems.filter(i => (i.qty || 0) === 0).length;
        const critical = currentItems.filter(i => (i.qty || 0) <= (i.threshold || 0) && (i.qty || 0) > 0).length;
        setGlobalStats(prev => ({
          ...prev,
          items: currentItems.length,
          outOfStockBase: outOfStock,
          critical: outOfStock + critical
        }));
      }
    };
    fetchStats();
    // OPTIMIZACIÓN: Se eliminó el setInterval(fetchStats, 600000) 
    // que realizaba múltiples llamadas al servidor (getCountFromServer) 
    // en segundo plano. Esto ahorra miles de lecturas innecesarias, 
    // preservando una excelente UX porque el stock crítico sigue
    // actualizándose localmente mediante el useEffect contiguo.
  }, [user]);

  // Actualizar solo localCritical cuando los items cambian sin llamar a red
  useEffect(() => {
    const localCritical = items.filter(i => (i.qty || 0) <= (i.threshold || 0) && (i.qty || 0) > 0).length;
    setGlobalStats(prev => ({
      ...prev,
      critical: (prev.outOfStockBase || 0) + localCritical
    }));
  }, [items]);


  // ═══════════════════════════════════════════════════════════════
  // LISTENER ÚNICO DE ITEMS - Optimizado
  // ═══════════════════════════════════════════════════════════════
  useEffect(() => {
    if (!user) return;
    
    let cancelled = false;
    setLoading(true);
    
    const q = query(
      collection(db, 'items'), 
      orderBy('name', 'asc'), 
      limit(2000)
    );

    const unsubscribe = onSnapshot(q, { 
      includeMetadataChanges: true // Necesario para detectar pendingWrites
    }, (snapshot) => {
      if (cancelled) return;
      
      const fromCache = snapshot.metadata.fromCache;
      const hasPending = snapshot.metadata.hasPendingWrites;
      
      // Actualizar indicador de escrituras pendientes
      setPendingWrites(hasPending ? 1 : 0);
      
      // Si ya tenemos datos y esto es solo del cache, ignorar (usar ref para evitar stale closure)
      if (fromCache && hasInitialDataRef.current && !hasPending) return;
      
      let data = snapshot.docs.map(doc => ({ 
        id: doc.id, 
        ...doc.data(),
        qty: parseInt(doc.data().qty) || 0,
        threshold: parseInt(doc.data().threshold) || 0
      }));
      
      // Filtrar items que están pendientes de eliminación (soft-delete window)
      if (pendingDeletesRef.current.size > 0) {
        data = data.filter(item => !pendingDeletesRef.current.has(item.id));
      }
      
      setItems(data);
      cache.set(CACHE_KEYS.ITEMS, data);
      lastDocRef.current = snapshot.docs[snapshot.docs.length - 1];
      setHasMoreItems(data.length === 2000);
      setLoading(false);
      
      if (!fromCache) {
        setLastSync(new Date());
        cache.set(CACHE_KEYS.LAST_SYNC, new Date());
      }
    }, (error) => {
      console.error('[Items] Error:', error);
      const cached = cache.get(CACHE_KEYS.ITEMS);
      if (cached && !hasInitialDataRef.current) {
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
  // LISTENER DE MOVIMIENTOS - Solo últimos 50
  // ═══════════════════════════════════════════════════════════════
  useEffect(() => {
    if (!user) return;

    const q = query(
      collection(db, 'movements'), 
      orderBy('timestamp', 'desc'), 
      limit(50)
    );
    
    const unsubscribe = onSnapshot(q, { includeMetadataChanges: false }, (snapshot) => {
      if (snapshot.docChanges().length === 0) return;
      
      const data = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        time: doc.data().timestamp?.toDate?.()?.toLocaleString() || 'Reciente'
      }));
      
      setMovements(data);
      cache.set(CACHE_KEYS.MOVEMENTS, data);
    }, (error) => {
      console.error('[Movements] Error:', error);
      const cached = cache.get(CACHE_KEYS.MOVEMENTS);
      if (cached) {
        setMovements(cached);
        toast.warning('Movimientos: usando datos en caché');
      }
    });

    return () => unsubscribe();
  }, [user]);

  // ═══════════════════════════════════════════════════════════════
  // DATOS AUXILIARES - Listeners en tiempo real (multi-dispositivo)
  // ═══════════════════════════════════════════════════════════════
  useEffect(() => {
    if (!user) return;

    // Listener de Personnel (tiempo real)
    const unsubPersonnel = onSnapshot(
      query(collection(db, 'personnel'), orderBy('name', 'asc')),
      async (snapshot) => {
        const data = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
        if (data.length === 0) {
          console.log("[Personnel] Seeding initial data...");
          const batch = writeBatch(db);
          const personnelRef = collection(db, 'personnel');
          initialPersonnel.forEach((person) => {
            const newDocRef = doc(personnelRef);
            batch.set(newDocRef, { ...person, createdAt: serverTimestamp() });
          });
          await batch.commit();
        } else {
          setPersonnel(data);
        }
      },
      (error) => console.error('[Personnel] Error:', error)
    );

    // Listener de Brands (tiempo real)
    const unsubBrands = onSnapshot(
      query(collection(db, 'brands'), orderBy('name', 'asc')),
      (snapshot) => {
        const data = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
        setBrands(data);
      },
      (error) => console.error('[Brands] Error:', error)
    );

    // Listener de Locations (tiempo real)
    const unsubLocations = onSnapshot(
      query(collection(db, 'locations'), orderBy('name', 'asc')),
      (snapshot) => {
        const data = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
        setLocations(data);
      },
      (error) => console.error('[Locations] Error:', error)
    );

    return () => {
      unsubPersonnel();
      unsubBrands();
      unsubLocations();
    };
  }, [user]);

  // ═══════════════════════════════════════════════════════════════
  // HELPERS
  // ═══════════════════════════════════════════════════════════════
  const addMovement = useCallback(async (action, itemName, qty, userName = 'Desconocido', details = '', category = 'General', itemId = null, sourceLocation = null, destinationLocation = null) => {
    try {
      const validated = movementSchema.parse({
        action, item: itemName, itemId, qty, user: userName, details, category, sourceLocation, destinationLocation
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
  
  // UPDATE STOCK - Optimistic UI + Rollback (Soporte para ubicaciones)
  const updateStock = useCallback(async (itemId, change, userName = 'Desconocido', customDetails = '', locationName = 'General') => {
    const currentItems = itemsRef.current;
    const itemIndex = currentItems.findIndex(i => i.id === itemId);
    if (itemIndex === -1) return;

    const item = currentItems[itemIndex];
    
    // Si no tiene stockByLocation, inicializarlo basado en location actual
    const currentStockByLoc = item.stockByLocation || {};
    const effectiveLocation = locationName || item.location || 'General';
    const locQty = currentStockByLoc[effectiveLocation] || 0;
    
    const newLocQty = locQty + change;
    
    const oldQty = item.qty || 0;
    const newQty = oldQty + change;
    
    // Validación: No stock negativo (Eliminada a petición del usuario para permitir sacar de ubicaciones sin stock)
    /* if (newQty < 0) {
      toast.error("Stock insuficiente", { description: `Solo hay ${oldQty} unidades disponibles en total` });
      return;
    } */
    
    const newStockByLocation = {
      ...currentStockByLoc,
      [effectiveLocation]: newLocQty
    };

    // OPTIMISTIC: Actualizar UI inmediatamente
    setItems(prev => {
      const updated = [...prev];
      updated[itemIndex] = { ...item, qty: newQty, stockByLocation: newStockByLocation };
      cache.set(CACHE_KEYS.ITEMS, updated);
      return updated;
    });

    try {
      const itemRef = doc(db, 'items', itemId);
      const moveRef = doc(collection(db, 'movements'));
      
      await runTransaction(db, async (transaction) => {
        const itemDoc = await transaction.get(itemRef);
        if (!itemDoc.exists()) {
          throw new Error("El artículo no existe en la base de datos.");
        }
        
        const dbData = itemDoc.data();
        const dbQty = dbData.qty || 0;
        const dbStockByLoc = dbData.stockByLocation || {};
        const dbLocQty = dbStockByLoc[effectiveLocation] || 0;
        
        // Validación de stock de ubicación eliminada
        /* if (dbQty + change < 0 || dbLocQty + change < 0) {
          throw new Error(`Stock insuficiente en el servidor para la ubicación: ${effectiveLocation}.`);
        } */
        
        transaction.update(itemRef, {
          qty: increment(change),
          [`stockByLocation.${effectiveLocation}`]: increment(change),
          lastModified: serverTimestamp()
        });
        
        transaction.set(moveRef, {
          action: change > 0 ? 'Entrada' : 'Salida',
          item: item.name,
          itemId: item.id,
          qty: Math.abs(change),
          user: userName,
          details: customDetails || `${change > 0 ? 'Reposición' : 'Gasto'} de material en ${effectiveLocation}`,
          category: item.category,
          sourceLocation: change < 0 ? effectiveLocation : null,
          destinationLocation: change > 0 ? effectiveLocation : null,
          subcategory: item.subcategory || '',
          timestamp: serverTimestamp()
        });
      });
      
      toast.success(`${change > 0 ? 'Entrada' : 'Salida'} en ${effectiveLocation} registrada`);
    } catch (e) {
      // ROLLBACK robusto (busca por id, no por índice)
      setItems(prev => {
        const rollback = [...prev];
        const idx = rollback.findIndex(i => i.id === itemId);
        if (idx !== -1) rollback[idx] = { ...rollback[idx], qty: oldQty, stockByLocation: currentStockByLoc };
        cache.set(CACHE_KEYS.ITEMS, rollback);
        return rollback;
      });
      toast.error(e.message || "Error al actualizar inventario - cambios revertidos");
    }
  }, [addMovement]);

  // TRANSFER STOCK - Entre Sub Almacenes
  const transferStock = useCallback(async (itemId, qty, fromLocation, toLocation, userName = 'Desconocido', customDetails = '') => {
    if (qty <= 0 || !fromLocation || !toLocation || fromLocation === toLocation) return;
    
    const currentItems = itemsRef.current;
    const itemIndex = currentItems.findIndex(i => i.id === itemId);
    if (itemIndex === -1) return;

    const item = currentItems[itemIndex];
    const currentStockByLoc = item.stockByLocation || {};
    
    const fromQty = currentStockByLoc[fromLocation] || 0;
    
    // Validación de stock transferido eliminada a petición del usuario
    /* if (fromQty < qty) {
      toast.error(`Stock insuficiente en ${fromLocation}`, { description: `Solo hay ${fromQty} unidades disponibles.` });
      return;
    } */

    const toQty = currentStockByLoc[toLocation] || 0;
    
    const newStockByLocation = {
      ...currentStockByLoc,
      [fromLocation]: fromQty - qty,
      [toLocation]: toQty + qty
    };

    // OPTIMISTIC
    setItems(prev => {
      const updated = [...prev];
      updated[itemIndex] = { ...item, stockByLocation: newStockByLocation };
      cache.set(CACHE_KEYS.ITEMS, updated);
      return updated;
    });

    try {
      const batch = writeBatch(db);
      
      const itemRef = doc(db, 'items', itemId);
      batch.update(itemRef, { 
        stockByLocation: newStockByLocation,
        lastModified: serverTimestamp()
      });
      
      const moveRef = doc(collection(db, 'movements'));
      batch.set(moveRef, {
        action: 'Transferencia',
        item: item.name,
        itemId: item.id,
        qty,
        user: userName,
        details: customDetails || `Traspaso de ${fromLocation} a ${toLocation}`,
        category: item.category,
        sourceLocation: fromLocation,
        destinationLocation: toLocation,
        subcategory: item.subcategory || '',
        timestamp: serverTimestamp()
      });
      
      await withRetry(() => batch.commit());
      
      toast.success(`Transferencia completada a ${toLocation}`);
    } catch (e) {
      // ROLLBACK
      setItems(prev => {
        const rollback = [...prev];
        const idx = rollback.findIndex(i => i.id === itemId);
        if (idx !== -1) rollback[idx] = { ...rollback[idx], stockByLocation: currentStockByLoc };
        cache.set(CACHE_KEYS.ITEMS, rollback);
        return rollback;
      });
      toast.error("Error al transferir - cambios revertidos");
    }
  }, [addMovement]);

  // BULK UPDATE STOCK (Salidas/Entradas múltiples en lote)
  const bulkUpdateStock = useCallback(async (quantitiesMap, userName = 'Desconocido', customDetails = '', locationName = 'General') => {
    const currentItems = itemsRef.current;
    
    const rollbackState = [];
    const newItemsList = [...currentItems];
    const entries = Object.entries(quantitiesMap).filter(([_, q]) => {
      const c = parseInt(q);
      return !isNaN(c) && c !== 0;
    });

    if (entries.length === 0) return;

    for (const [itemId, qtyString] of entries) {
      const change = parseInt(qtyString);
      const itemIndex = newItemsList.findIndex(i => i.id === itemId);
      if (itemIndex === -1) continue;

      const item = newItemsList[itemIndex];
      const effectiveLocation = locationName || item.location || 'General';
      const currentStockByLoc = item.stockByLocation || {};
      const locQty = currentStockByLoc[effectiveLocation] || 0;
      
      const newLocQty = locQty + change;
      const oldQty = item.qty || 0;
      const newQty = oldQty + change;
      
      // Validación eliminada
      /* if (newQty < 0) {
        toast.error(`Stock insuficiente para ${item.name}`);
        return; 
      } */
      
      const newStockByLocation = {
        ...currentStockByLoc,
        [effectiveLocation]: newLocQty
      };

      rollbackState.push({ id: itemId, oldQty, oldStockByLocation: currentStockByLoc });
      newItemsList[itemIndex] = { ...item, qty: newQty, stockByLocation: newStockByLocation };
    }

    if (rollbackState.length === 0) return;

    // Actualización optimista local
    setItems(newItemsList);
    cache.set(CACHE_KEYS.ITEMS, newItemsList);

    try {
      // Chunking para Firestore (Max 500 operaciones por batch, usamos 250 items = 500 ops)
      const CHUNK_SIZE = 250;
      for (let i = 0; i < entries.length; i += CHUNK_SIZE) {
        const chunk = entries.slice(i, i + CHUNK_SIZE);
        const batch = writeBatch(db);
        
        for (const [itemId, qtyString] of chunk) {
          const change = parseInt(qtyString);
          const itemIndex = newItemsList.findIndex(x => x.id === itemId);
          if (itemIndex === -1) continue;
          
          const item = newItemsList[itemIndex];
          const effectiveLocation = locationName || item.location || 'General';
          
          const itemRef = doc(db, 'items', itemId);
          batch.update(itemRef, {
            qty: increment(change),
            [`stockByLocation.${effectiveLocation}`]: increment(change),
            lastModified: serverTimestamp()
          });

          const moveRef = doc(collection(db, 'movements'));
          const action = change > 0 ? 'Entrada' : 'Salida';
          const detailText = customDetails || `${change > 0 ? 'Reposición' : 'Gasto'} de material en lote (${effectiveLocation})`;
          batch.set(moveRef, {
            action,
            item: item.name,
            itemId: item.id,
            qty: Math.abs(change),
            user: userName,
            details: detailText,
            category: item.category,
            sourceLocation: change < 0 ? effectiveLocation : null,
            destinationLocation: change > 0 ? effectiveLocation : null,
            subcategory: item.subcategory || '',
            timestamp: serverTimestamp()
          });
        }
        // Ejecución secuencial para no ahogar la red ni exceder cuotas de Firebase
        await withRetry(() => batch.commit());
      }
      
      toast.success(`Operación en lote registrada exitosamente`);
    } catch (e) {
      console.error("[BulkUpdate] Error:", e);
      // Rollback robusto por ID
      setItems(prev => {
        const rollbackList = [...prev];
        rollbackState.forEach(({ id, oldQty, oldStockByLocation }) => {
          const idx = rollbackList.findIndex(x => x.id === id);
          if (idx !== -1) {
            rollbackList[idx] = { ...rollbackList[idx], qty: oldQty, stockByLocation: oldStockByLocation };
          }
        });
        cache.set(CACHE_KEYS.ITEMS, rollbackList);
        return rollbackList;
      });
      toast.error("Error en operación de lote - cambios revertidos");
    }
  }, []);

  // BULK TRANSFER STOCK (Transferencia en lote)
  const bulkTransferStock = useCallback(async (quantitiesMap, fromLocation, toLocation, userName = 'Desconocido', customDetails = '') => {
    if (!fromLocation || !toLocation || fromLocation === toLocation) return;
    
    const currentItems = itemsRef.current;
    const rollbackState = [];
    const newItemsList = [...currentItems];
    const batch = writeBatch(db);

    for (const [itemId, qtyString] of Object.entries(quantitiesMap)) {
      const qty = parseInt(qtyString);
      if (isNaN(qty) || qty <= 0) continue;

      const itemIndex = newItemsList.findIndex(i => i.id === itemId);
      if (itemIndex === -1) continue;

      const item = newItemsList[itemIndex];
      const currentStockByLoc = item.stockByLocation || {};
      const fromQty = currentStockByLoc[fromLocation] || 0;
      
      // Validación eliminada
      /* if (fromQty < qty) {
        toast.error(`Stock insuficiente en ${fromLocation} para ${item.name}`);
        return; 
      } */

      const toQty = currentStockByLoc[toLocation] || 0;
      const newStockByLocation = {
        ...currentStockByLoc,
        [fromLocation]: fromQty - qty,
        [toLocation]: toQty + qty
      };

      rollbackState.push({ index: itemIndex, oldStockByLocation: currentStockByLoc });
      newItemsList[itemIndex] = { ...item, stockByLocation: newStockByLocation };

      const itemRef = doc(db, 'items', itemId);
      batch.update(itemRef, {
        stockByLocation: newStockByLocation,
        lastModified: serverTimestamp()
      });

      const moveRef = doc(collection(db, 'movements'));
      batch.set(moveRef, {
        action: 'Transferencia',
        item: item.name,
        itemId: item.id,
        qty: qty,
        user: userName,
        details: customDetails || `Traspaso en lote de ${fromLocation} a ${toLocation}`,
        category: item.category,
        sourceLocation: fromLocation,
        destinationLocation: toLocation,
        subcategory: item.subcategory || '',
        timestamp: serverTimestamp()
      });
    }

    if (rollbackState.length === 0) return;

    setItems(newItemsList);
    cache.set(CACHE_KEYS.ITEMS, newItemsList);

    try {
      await withRetry(() => batch.commit());
      toast.success(`Transferencia en lote completada a ${toLocation}`);
    } catch (e) {
      console.error("[BulkTransfer] Error:", e);
      setItems(prev => {
        const rollbackList = [...prev];
        rollbackState.forEach(({ index, oldStockByLocation }) => {
          rollbackList[index] = { ...rollbackList[index], stockByLocation: oldStockByLocation };
        });
        cache.set(CACHE_KEYS.ITEMS, rollbackList);
        return rollbackList;
      });
      toast.error("Error al transferir lote - cambios revertidos");
    }
  }, []);

  // MOVER ENTRE SECCIONES (Subalmacenes) - Optimistic UI
  const moveItemToSection = useCallback(async (itemId, newCategoryTitle, userName = 'Desconocido') => {
    const currentItems = itemsRef.current;
    const itemIndex = currentItems.findIndex(i => i.id === itemId);
    if (itemIndex === -1) return;

    const item = currentItems[itemIndex];
    const oldCategory = item.category;

    if (oldCategory === newCategoryTitle) return;

    // OPTIMISTIC
    setItems(prev => {
      const updated = [...prev];
      updated[itemIndex] = { ...item, category: newCategoryTitle };
      cache.set(CACHE_KEYS.ITEMS, updated);
      return updated;
    });

    try {
      await withRetry(() => updateDoc(doc(db, 'items', itemId), { 
        category: newCategoryTitle,
        lastModified: serverTimestamp()
      }));
      
      await addMovement(
        'Movimiento de Sección', 
        item.name, 
        item.qty || 0, 
        userName, 
        `Transferido de ${oldCategory} a ${newCategoryTitle}`,
        newCategoryTitle,
        item.id
      );
      
      toast.success(`${item.name} movido a ${newCategoryTitle}`);
    } catch (e) {
      // ROLLBACK
      setItems(prev => {
        const rollback = [...prev];
        const idx = rollback.findIndex(i => i.id === itemId);
        if (idx !== -1) rollback[idx] = { ...rollback[idx], category: oldCategory };
        cache.set(CACHE_KEYS.ITEMS, rollback);
        return rollback;
      });
      toast.error("Error al mover el artículo - cambios revertidos");
    }
  }, [addMovement]);

  // MOVER LOTE A OTRA SECCIÓN
  const bulkMoveSection = useCallback(async (itemIds, newCategoryTitle, userName = 'Desconocido') => {
    if (!itemIds || itemIds.length === 0 || !newCategoryTitle) return;

    const currentItems = itemsRef.current;
    const rollbackState = [];
    const newItemsList = [...currentItems];
    const batch = writeBatch(db);
    let itemsMoved = 0;

    for (const itemId of itemIds) {
      const itemIndex = newItemsList.findIndex(i => i.id === itemId);
      if (itemIndex === -1) continue;

      const item = newItemsList[itemIndex];
      const oldCategory = item.category;
      
      if (oldCategory === newCategoryTitle) continue;

      rollbackState.push({ index: itemIndex, oldCategory });
      newItemsList[itemIndex] = { ...item, category: newCategoryTitle };

      const itemRef = doc(db, 'items', itemId);
      batch.update(itemRef, {
        category: newCategoryTitle,
        lastModified: serverTimestamp()
      });

      const moveRef = doc(collection(db, 'movements'));
      batch.set(moveRef, {
        action: 'Movimiento de Sección',
        item: item.name,
        itemId: item.id,
        qty: item.qty || 0,
        user: userName,
        details: `Traspaso en lote de ${oldCategory} a ${newCategoryTitle}`,
        category: newCategoryTitle,
        sourceLocation: null,
        destinationLocation: null,
        subcategory: item.subcategory || '',
        timestamp: serverTimestamp()
      });
      
      itemsMoved++;
    }

    if (itemsMoved === 0) return;

    setItems(newItemsList);
    cache.set(CACHE_KEYS.ITEMS, newItemsList);

    try {
      await withRetry(() => batch.commit());
      toast.success(`${itemsMoved} artículos movidos a ${newCategoryTitle}`);
    } catch (e) {
      console.error("[BulkMoveSection] Error:", e);
      setItems(prev => {
        const rollbackList = [...prev];
        rollbackState.forEach(({ index, oldCategory }) => {
          rollbackList[index] = { ...rollbackList[index], category: oldCategory };
        });
        cache.set(CACHE_KEYS.ITEMS, rollbackList);
        return rollbackList;
      });
      toast.error("Error al mover lote - cambios revertidos");
    }
  }, []);

  // PRÉSTAMO - Optimistic UI
  const loanItem = useCallback(async (itemId, borrower, userName = 'Desconocido') => {
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
  const assignItem = useCallback(async (itemId, assignee, userName = 'Desconocido') => {
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

  // PRESTAMO LOTE - Optimistic UI
  const bulkLoanItems = useCallback(async (itemIds, borrower, userName = 'Desconocido') => {
    if (!itemIds || itemIds.length === 0 || !borrower) return;

    const availableItems = itemsRef.current.filter(i => 
      itemIds.includes(i.id) && 
      (i.status === 'Disponible' || (i.qty || 0) > 0)
    );

    if (availableItems.length === 0) {
      toast.error("Ninguna de las herramientas seleccionadas está disponible");
      return;
    }

    const rollbackState = [];
    const newItemsList = [...itemsRef.current];
    const batch = writeBatch(db);

    for (const item of availableItems) {
      const itemIndex = newItemsList.findIndex(i => i.id === item.id);
      if (itemIndex === -1) continue;

      rollbackState.push({ index: itemIndex, item: { ...item } });
      
      const newQty = Math.max((item.qty || 0) - 1, 0);
      const newPrestados = (item.prestados || 0) + 1;
      const newStatus = newQty <= 0 ? 'Prestado' : 'Disponible';

      newItemsList[itemIndex] = {
        ...item, qty: newQty, prestados: newPrestados, status: newStatus,
        borrowedBy: borrower, lentBy: userName, loanDate: new Date()
      };

      const itemRef = doc(db, 'items', item.id);
      batch.update(itemRef, {
        qty: increment(-1),
        prestados: increment(1),
        status: newStatus,
        borrowedBy: borrower,
        lentBy: userName,
        loanDate: serverTimestamp(),
        lastModified: serverTimestamp()
      });

      const moveRef = doc(collection(db, 'movements'));
      batch.set(moveRef, {
        action: 'Préstamo',
        item: item.name,
        itemId: item.id,
        qty: 1,
        user: userName,
        details: borrower,
        category: item.category,
        timestamp: serverTimestamp()
      });
    }

    setItems(newItemsList);
    cache.set(CACHE_KEYS.ITEMS, newItemsList);

    try {
      await withRetry(() => batch.commit());
      toast.success(`${availableItems.length} herramientas prestadas a ${borrower}`);
    } catch (e) {
      setItems(prev => {
        const rollbackList = [...prev];
        rollbackState.forEach(({ index, item }) => {
          rollbackList[index] = item;
        });
        cache.set(CACHE_KEYS.ITEMS, rollbackList);
        return rollbackList;
      });
      toast.error("Error al registrar préstamos masivos");
    }
  }, []);

  // ASIGNACIÓN LOTE - Optimistic UI
  const bulkAssignItems = useCallback(async (itemIds, assignee, userName = 'Desconocido') => {
    if (!itemIds || itemIds.length === 0 || !assignee) return;

    const availableItems = itemsRef.current.filter(i => 
      itemIds.includes(i.id) && 
      (i.status === 'Disponible' || (i.qty || 0) > 0)
    );

    if (availableItems.length === 0) {
      toast.error("Ninguna de las herramientas seleccionadas está disponible");
      return;
    }

    const rollbackState = [];
    const newItemsList = [...itemsRef.current];
    const batch = writeBatch(db);

    for (const item of availableItems) {
      const itemIndex = newItemsList.findIndex(i => i.id === item.id);
      if (itemIndex === -1) continue;

      rollbackState.push({ index: itemIndex, item: { ...item } });
      
      const newQty = Math.max((item.qty || 0) - 1, 0);
      const newAsignados = (item.asignados || 0) + 1;
      const newStatus = newQty <= 0 ? 'Asignado' : 'Disponible';

      newItemsList[itemIndex] = {
        ...item, qty: newQty, asignados: newAsignados, status: newStatus,
        assignedTo: assignee, assignedBy: userName, assignmentDate: new Date()
      };

      const itemRef = doc(db, 'items', item.id);
      batch.update(itemRef, {
        qty: increment(-1),
        asignados: increment(1),
        status: newStatus,
        assignedTo: assignee,
        assignedBy: userName,
        assignmentDate: serverTimestamp(),
        lastModified: serverTimestamp()
      });

      const moveRef = doc(collection(db, 'movements'));
      batch.set(moveRef, {
        action: 'Asignación',
        item: item.name,
        itemId: item.id,
        qty: 1,
        user: userName,
        details: assignee,
        category: item.category,
        timestamp: serverTimestamp()
      });
    }

    setItems(newItemsList);
    cache.set(CACHE_KEYS.ITEMS, newItemsList);

    try {
      await withRetry(() => batch.commit());
      toast.success(`${availableItems.length} herramientas asignadas a ${assignee}`);
    } catch (e) {
      setItems(prev => {
        const rollbackList = [...prev];
        rollbackState.forEach(({ index, item }) => {
          rollbackList[index] = item;
        });
        cache.set(CACHE_KEYS.ITEMS, rollbackList);
        return rollbackList;
      });
      toast.error("Error al registrar asignaciones masivas");
    }
  }, []);

  // DEVOLUCIÓN - Optimistic UI
  const returnItem = useCallback(async (itemId, userName = 'Desconocido') => {
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
  const addItem = useCallback(async (newItem, userName = 'Desconocido') => {
    try {
      const validated = itemSchema.parse(newItem);

      // Check for duplicates (except in Herramientas)
      if (validated.category !== 'Herramientas') {
        const isDuplicate = itemsRef.current.some(
          i => i.name.toLowerCase() === validated.name.toLowerCase() && i.category === validated.category
        );
        if (isDuplicate) {
          toast.error(`El artículo "${validated.name}" ya existe en esta sección.`);
          throw new Error('DUPLICATE_ITEM');
        }
      }

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
      const stockByLocation = validated.stockByLocation || {};
      if (validated.location && Object.keys(stockByLocation).length === 0 && validated.qty > 0) {
        stockByLocation[validated.location] = validated.qty;
      }
      
      const itemWithId = { 
        id: docRef.id, 
        ...validated, 
        qty: isNaN(validated.qty) ? defaultQty : validated.qty,
        stockByLocation
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
      } else if (e.message === 'DUPLICATE_ITEM') {
        // Already handled by toast above
      } else {
        toast.error('Error al agregar');
      }
      throw e;
    }
  }, [addMovement]);

  // DELETE ITEM - Soft delete con Undo (con protección anti-reinsert)
  const deleteItem = useCallback(async (itemId, userName = 'Desconocido') => {
    const item = itemsRef.current.find(i => i.id === itemId);
    if (!item) return;

    // Marcar como pendiente de eliminación para que onSnapshot no lo re-inserte
    pendingDeletesRef.current.add(itemId);

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
          pendingDeletesRef.current.delete(itemId);
          setItems(prev => {
            if (prev.find(i => i.id === itemId)) return prev; // Ya existe
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
      } finally {
        // Siempre limpiar del set de pendientes
        pendingDeletesRef.current.delete(itemId);
      }
    }, 5000);
  }, [addMovement]);

  // EDIT ITEM - Optimistic UI
  const editItem = useCallback(async (itemId, updatedFields, userName = 'Desconocido') => {
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
  const reportMaintenance = useCallback(async (itemId, reason, userName = 'Desconocido') => {
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
  const completeMaintenance = useCallback(async (itemId, userName = 'Desconocido') => {
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
  const auditStock = useCallback(async (itemId, physicalQty, userName = 'Desconocido', reason = '') => {
    const item = itemsRef.current.find(i => i.id === itemId);
    if (!item) return;

    const previousQty = item.qty || 0;
    const diff = physicalQty - previousQty;
    if (diff === 0) return; // No hay cambios

    const newTotalQty = physicalQty;

    const effectiveLocation = item.location || 'General';
    const currentStockByLoc = item.stockByLocation || {};
    const locQty = currentStockByLoc[effectiveLocation] || 0;

    const newStockByLocation = {
      ...currentStockByLoc,
      [effectiveLocation]: Math.max(0, locQty + diff)
    };

    setItems(prev => prev.map(i => i.id === itemId ? { ...i, qty: newTotalQty, stockByLocation: newStockByLocation } : i));

    try {
      await withRetry(() => updateDoc(doc(db, 'items', itemId), { 
        qty: newTotalQty,
        stockByLocation: newStockByLocation,
        lastModified: serverTimestamp()
      }));
      
      await addMovement(
        'Auditoría', item.name, Math.abs(diff), userName,
        reason || `Conteo en ${effectiveLocation}: ${physicalQty} (Ajuste: ${diff > 0 ? '+' : ''}${diff})`,
        item.category, itemId
      );
      toast.success(`Auditoría registrada en ${effectiveLocation}`);
    } catch (e) {
      setItems(prev => prev.map(i => i.id === itemId ? { ...i, qty: previousQty, stockByLocation: currentStockByLoc } : i));
      toast.error('Error al auditar');
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
  // ═══════════════════════════════════════════════════════════════
  // FUNCIONES AUXILIARES (Marcas y Ubicaciones)
  // ═══════════════════════════════════════════════════════════════
  const addBrand = useCallback(async (name) => {
    try {
      const q = query(collection(db, 'brands'), where('name', '==', name));
      const snap = await getDocs(q);
      if (!snap.empty) {
        toast.error("Esta marca ya existe");
        return;
      }
      const docRef = await addDoc(collection(db, 'brands'), { name, createdAt: serverTimestamp() });
      setBrands(prev => [...prev, { id: docRef.id, name }].sort((a,b) => a.name.localeCompare(b.name)));
      toast.success(`Marca añadida: ${name}`);
    } catch (e) {
      toast.error("Error al añadir marca");
    }
  }, []);

  const addLocation = useCallback(async (name, zone = '') => {
    try {
      const docRef = await addDoc(collection(db, 'locations'), { name, zone, createdAt: serverTimestamp() });
      setLocations(prev => [...prev, { id: docRef.id, name, zone }].sort((a,b) => a.name.localeCompare(b.name)));
      toast.success(`Ubicación añadida: ${name}`);
    } catch (e) {
      toast.error("Error al añadir ubicación");
    }
  }, []);

  const updateLocation = useCallback(async (id, newName, newZone = '') => {
    try {
      await updateDoc(doc(db, 'locations', id), { name: newName, zone: newZone });
      setLocations(prev => prev.map(l => l.id === id ? { ...l, name: newName, zone: newZone } : l).sort((a,b) => a.name.localeCompare(b.name)));
      toast.success(`Ubicación actualizada: ${newName}`);
    } catch (e) {
      toast.error("Error al actualizar ubicación");
    }
  }, []);

  const deleteLocation = useCallback(async (id, name) => {
    try {
      await deleteDoc(doc(db, 'locations', id));
      setLocations(prev => prev.filter(l => l.id !== id));
      toast.success(`Ubicación eliminada: ${name}`);
    } catch (e) {
      toast.error("Error al eliminar ubicación");
    }
  }, []);

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
    connectionStatus, pendingWrites,
    updateStock, transferStock, moveItemToSection, addItem, deleteItem, editItem,
    loanItem, bulkLoanItems, assignItem, bulkAssignItems, returnItem, reportMaintenance, completeMaintenance, auditStock,
    bulkAddItems, annulMovement, loadMoreItems, fetchMoreItems: loadMoreItems, clearCache,
    addBrand, addLocation, updateLocation, deleteLocation, itemsRef, bulkUpdateStock, bulkTransferStock, bulkMoveSection
  }), [
    items, movements, personnel, brands, locations,
    loading, isLoadingMore, hasMoreItems, lastSync, globalStats,
    connectionStatus, pendingWrites,
    updateStock, transferStock, moveItemToSection, addItem, deleteItem, editItem,
    loanItem, bulkLoanItems, assignItem, bulkAssignItems, returnItem, reportMaintenance, completeMaintenance, auditStock,
    bulkAddItems, annulMovement, loadMoreItems, clearCache,
    addBrand, addLocation, updateLocation, deleteLocation, bulkUpdateStock, bulkTransferStock, bulkMoveSection
  ]);

  return (
    <InventoryContext.Provider value={value}>
      {children}
    </InventoryContext.Provider>
  );
};

export default InventoryContext;
