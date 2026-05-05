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
 * Servicio para manejar la conexión con la base de datos.
 */
export const OptimizedDataService = {
  
  // Obtener datos prioritizando la velocidad
  async getCollectionOptimized(collectionName, constraints = [], pageSize = 500) {
    const collRef = collection(db, collectionName);
    const q = query(collRef, ...constraints, limit(pageSize));

    try {
      // 1. Intento desde caché local (< 5ms en la mayoría de tablets)
      const cacheSnapshot = await getDocsFromCache(q);
      
      if (!cacheSnapshot.empty) {
        console.log(`Cache: ${collectionName} (${cacheSnapshot.size})`);
        return { snapshot: cacheSnapshot, fromCache: true };
      }
    } catch (e) {
      console.warn(`Cache MISS: ${collectionName}`);
    }

    // 2. Fallback a servidor
    const serverSnapshot = await getDocsFromServer(q);
    console.log(`Network FETCH: ${collectionName} (${serverSnapshot.size})`);
    return { snapshot: serverSnapshot, fromCache: false };
  },

  // Paginación de datos
  async getPaginatedBatch(collectionName, lastVisible = null, constraints = [], pageSize = 50) {
    let q;
    if (lastVisible) {
      q = query(collection(db, collectionName), ...constraints, startAfter(lastVisible), limit(pageSize));
    } else {
      q = query(collection(db, collectionName), ...constraints, limit(pageSize));
    }

    return await getDocs(q);
  },

  // Suscribirse a cambios en tiempo real
  subscribeWithCleanup(collectionName, constraints, onData, onError) {
    const q = query(collection(db, collectionName), ...constraints);
    return onSnapshot(q, { includeMetadataChanges: true }, (snapshot) => {
      // Solo emitimos si los datos están sincronizados
      if (!snapshot.metadata.hasPendingWrites) {
        onData(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })), snapshot);
      }
    }, (error) => {
      console.error(`Error de conexión (${collectionName}):`, error);
      if (onError) onError(error);
    });
  },

  // Monitorear internet
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
  },

  // Contar documentos de forma rápida
  async getCollectionCount(collectionName, constraints = []) {
    const { getCountFromServer } = await import("firebase/firestore");
    const q = query(collection(db, collectionName), ...constraints);
    const snapshot = await getCountFromServer(q);
    return snapshot.data().count;
  }
};
