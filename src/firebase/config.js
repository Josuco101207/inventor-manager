import { initializeApp } from "firebase/app";
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager, CACHE_SIZE_UNLIMITED } from "firebase/firestore";
import { getAuth } from "firebase/auth";
import { getStorage } from "firebase/storage";

const firebaseConfig = {
  apiKey: "AIzaSyDWOFFslHI0eSqyUf_tb1D1VlzMZmNemmM",
  authDomain: "inventor-manager-a0b4d.firebaseapp.com",
  projectId: "inventor-manager-a0b4d",
  storageBucket: "inventor-manager-a0b4d.firebasestorage.app",
  messagingSenderId: "213399034117",
  appId: "1:213399034117:web:3e30a5421c516b05fe7f6c"
};

const app = initializeApp(firebaseConfig);
export const db = initializeFirestore(app, {
  localCache: persistentLocalCache({ 
    tabManager: persistentMultipleTabManager()
  })
});
export const auth = getAuth(app);
export const storage = getStorage(app);
