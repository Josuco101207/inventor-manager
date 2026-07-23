import { initializeApp, getApps, getApp } from "firebase/app";
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager, CACHE_SIZE_UNLIMITED, doc, setDoc, getDoc } from "firebase/firestore";
import { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword } from "firebase/auth";
import { getStorage } from "firebase/storage";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID
};

const app = initializeApp(firebaseConfig);
export const db = initializeFirestore(app, {
  localCache: persistentLocalCache({ 
    tabManager: persistentMultipleTabManager()
  })
});
export const auth = getAuth(app);
export const storage = getStorage(app);

// Inicializar la App Secundaria (Dicrejart)
const dicrejartFirebaseConfig = {
  apiKey: import.meta.env.VITE_DICREJART_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_DICREJART_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_DICREJART_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_DICREJART_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_DICREJART_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_DICREJART_FIREBASE_APP_ID
};

let dicrejartDb = null;
if (dicrejartFirebaseConfig.apiKey) {
  try {
    const existingApps = getApps();
    let dicrejartApp = existingApps.find(a => a.name === 'DicrejartApp');
    if (!dicrejartApp) {
      dicrejartApp = initializeApp(dicrejartFirebaseConfig, 'DicrejartApp');
    }
    
    dicrejartDb = initializeFirestore(dicrejartApp, {
      localCache: persistentLocalCache({ 
        tabManager: persistentMultipleTabManager()
      })
    });

    // Cross-Database Authentication (Bridge Account)
    const dicrejartAuth = getAuth(dicrejartApp);
    const bridgeEmail = 'inventor_bridge@system.local';
    const bridgePass = 'CrossAppBridge2026!';

    signInWithEmailAndPassword(dicrejartAuth, bridgeEmail, bridgePass)
      .then(() => console.info('🔗 Conectado a Dicrejart DB como Bridge'))
      .catch(async (err) => {
        if (err.code === 'auth/invalid-credential' || err.code === 'auth/user-not-found') {
          try {
            console.info('Creando usuario Bridge en Dicrejart DB...');
            const cred = await createUserWithEmailAndPassword(dicrejartAuth, bridgeEmail, bridgePass);
            await setDoc(doc(dicrejartDb, 'users', cred.user.uid), {
              name: 'Inventor Bridge',
              email: bridgeEmail,
              roleType: 'admin',
              timestamp: new Date()
            });
            console.info('Usuario Bridge creado y configurado.');
          } catch (e) {
            console.error('❌ Error creando usuario Bridge:', e);
          }
        } else {
          console.error('❌ Error autenticando usuario Bridge:', err);
        }
      });

  } catch (error) {
    console.error('❌ Error al inicializar Dicrejart DB Secundaria:', error);
  }
}

export { dicrejartDb };
