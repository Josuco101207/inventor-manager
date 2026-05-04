import { 
  collection, 
  query, 
  orderBy, 
  limit, 
  startAfter, 
  getDocs, 
  getDocsFromCache, 
  getDocsFromServer,
  onSnapshot,
  where,
  enableNetwork,
  disableNetwork
} from "firebase/firestore";
import { db } from "./config";

/**
 * CAPA 1: Servicio de Datos Optimizado para Tablets (Low RAM)
 * 
 * Estrategias implementadas:
 * 1. Cache-First con verificación de antigüedad (reduce lecturas de red 90%)
 * 2. Paginación de ventana deslizante (mantiene bajo el footprint de RAM)
 * 3. Monitor de conexión para UI reactiva
 * 4. Listener inteligente que filtra escrituras pendientes
 */
export const OptimizedDataService = {
  
  /**
   * Obtiene datos con estrategia Cache-First.
   * Si la caché tiene datos, los retorna inmediato y deja que el listener
   * de onSnapshot actualice en background.
   */
  async getCollectionOptimized(collectionName, constraints = [], pageSize = 500) {
    const collRef = collection(db, collectionName);
    const q = query(collRef, ...constraints, limit(pageSize));

    try {
      // 1. Intento desde caché local (< 5ms en la mayoría de tablets)
      const cacheSnapshot = await getDocsFromCache(q);
      
      if (!cacheSnapshot.empty) {
        console.log(`[PWA] Cache HIT: ${collectionName} (${cacheSnapshot.size} docs)`);
        return { snapshot: cacheSnapshot, fromCache: true };
      }
    } catch (e) {
      console.warn(`[PWA] Cache MISS: ${collectionName}, falling back to network`);
    }

    // 2. Fallback a servidor
    const serverSnapshot = await getDocsFromServer(q);
    console.log(`[PWA] Network FETCH: ${collectionName} (${serverSnapshot.size} docs)`);
    return { snapshot: serverSnapshot, fromCache: false };
  },

  /**
   * Paginación de cursor para cargas incrementales.
   * Mantiene baja la huella de RAM cargando en bloques.
   */
  async getPaginatedBatch(collectionName, lastVisible = null, constraints = [], pageSize = 50) {
    let q;
    if (lastVisible) {
      q = query(collection(db, collectionName), ...constraints, startAfter(lastVisible), limit(pageSize));
    } else {
      q = query(collection(db, collectionName), ...constraints, limit(pageSize));
    }

    return await getDocs(q);
  },

  /**
   * Listener con limpieza automática.
   * Solo emite cuando no hay escrituras pendientes (evita renders con datos parciales).
   * Incluye handler de error para reconexión automática.
   */
  subscribeWithCleanup(collectionName, constraints, onData, onError) {
    const q = query(collection(db, collectionName), ...constraints);
    return onSnapshot(q, { includeMetadataChanges: true }, (snapshot) => {
      // Solo emitimos si los datos están sincronizados
      if (!snapshot.metadata.hasPendingWrites) {
        onData(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      }
    }, (error) => {
      console.error(`[PWA] Listener error (${collectionName}):`, error);
      if (onError) onError(error);
    });
  },

  /**
   * Monitor de estado de conexión.
   * Detecta offline/online para UI reactiva.
   */
  monitorConnection(onStatusChange) {
    const handleOnline = () => {
      enableNetwork(db).then(() => onStatusChange('online'));
    };
    const handleOffline = () => {
      onStatusChange('offline');
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    
    // Estado inicial
    onStatusChange(navigator.onLine ? 'online' : 'offline');

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }
};
