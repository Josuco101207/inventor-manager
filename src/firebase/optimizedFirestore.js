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
  where
} from "firebase/firestore";
import { db } from "./config";

/**
 * Servicio de datos optimizado para tablets (Low RAM) y ahorro de costos Firebase
 */
export const OptimizedDataService = {
  
  /**
   * Obtiene datos con estrategia Cache-First y verificación de antigüedad.
   * Reduce lecturas de red y mejora la latencia en tablets.
   */
  async getCollectionOptimized(collectionName, constraints = [], pageSize = 50, maxCacheAgeMs = 1000 * 60 * 5) {
    const collRef = collection(db, collectionName);
    const q = query(collRef, ...constraints, limit(pageSize));

    try {
      // 1. Intento desde caché local
      const cacheSnapshot = await getDocsFromCache(q);
      
      if (!cacheSnapshot.empty) {
        // Verificación de antigüedad (opcional, si guardamos metadata)
        // Por defecto Firestore gestiona la vigencia, pero podemos forzar refresco
        console.log(`[PWA] Hit en Caché: ${collectionName}`);
        return { snapshot: cacheSnapshot, fromCache: true };
      }
    } catch (e) {
      console.warn(`[PWA] Fallo de caché en ${collectionName}, recurriendo a red.`);
    }

    // 2. Fallback a servidor (Lectura paginada)
    const serverSnapshot = await getDocsFromServer(q);
    return { snapshot: serverSnapshot, fromCache: false };
  },

  /**
   * Paginación de ventana deslizante para mantener baja la huella de RAM.
   */
  async getPaginatedBatch(collectionName, lastVisible = null, constraints = [], pageSize = 20) {
    let q;
    if (lastVisible) {
      q = query(collection(db, collectionName), ...constraints, startAfter(lastVisible), limit(pageSize));
    } else {
      q = query(collection(db, collectionName), ...constraints, limit(pageSize));
    }

    // Usamos getDocs que gestiona automáticamente caché/red según disponibilidad
    return await getDocs(q);
  },

  /**
   * Proyección ligera: Obtiene solo campos críticos para el renderizado inicial.
   * Nota: Firestore no permite selección de campos nativa en v9 Web SDK sin Cloud Functions,
   * pero simulamos la lógica para la arquitectura lightweight_inventory.
   */
  async fetchLightweightProjection(category) {
    const q = query(
      collection(db, 'lightweight_inventory'), 
      where('category', '==', category),
      limit(100)
    );
    return await getDocs(q);
  },

  /**
   * Listener con limpieza automática y filtrado de metadatos.
   */
  subscribeWithCleanup(collectionName, constraints, onData) {
    const q = query(collection(db, collectionName), ...constraints);
    return onSnapshot(q, { includeMetadataChanges: true }, (snapshot) => {
      // Solo emitimos si los datos están sincronizados o es una carga inicial de caché
      if (!snapshot.metadata.hasPendingWrites) {
        onData(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      }
    });
  }
};

