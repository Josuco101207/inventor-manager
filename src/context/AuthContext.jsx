import React, { createContext, useContext, useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { auth, db } from '../firebase/config';
import { 
  onAuthStateChanged, 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword,
  signOut
} from 'firebase/auth';
import { doc, getDoc, setDoc, collection, getDocs, query, limit, onSnapshot } from 'firebase/firestore';
import { toast } from 'sonner';

const AuthContext = createContext();

export const useAuth = () => useContext(AuthContext);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [userData, setUserData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let unsubscribeProfile = null;
    
    const unsubscribeAuth = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      
      if (unsubscribeProfile) {
        unsubscribeProfile();
        unsubscribeProfile = null;
      }

      if (currentUser) {
        try {
          const userRef = doc(db, 'users', currentUser.uid);
          
          // Initial fetch to be sure
          const userSnap = await getDoc(userRef);
          if (userSnap.exists()) {
            const data = userSnap.data();
            setUserData(data);
          }
          
          // Set loading to false once we at least tried to get the profile
          setLoading(false);

          // Real-time listener for future changes
          unsubscribeProfile = onSnapshot(userRef, { includeMetadataChanges: true }, (snap) => {
            if (snap.exists()) {
              setUserData(snap.data());
            } else {
              // Create profile if missing
              setUserData(null);
            }
          }, (error) => {
            console.error("Profile sync error:", error);
          });
        } catch (error) {
          console.error("Auth initialization error:", error);
          setLoading(false);
        }
      } else {
        setUserData(null);
        setLoading(false);
      }
    });

    return () => {
      unsubscribeAuth();
      if (unsubscribeProfile) unsubscribeProfile();
    };
  }, []);

  const login = (email, password) => signInWithEmailAndPassword(auth, email, password);
  
  const signup = async (email, password, name) => {
    const res = await createUserWithEmailAndPassword(auth, email, password);
    // Profile is created in the useEffect listener
    return res;
  };

  const logout = () => signOut(auth);

  // Temporizador de inactividad para seguridad
  useEffect(() => {
    if (!user) return;

    let inactivityTimer;
    let backgroundTimer;
    let lastActivity = Date.now();
    const INACTIVITY_MS = 5 * 60 * 1000; // 5 minutos
    const BACKGROUND_MS = 10 * 60 * 1000; // 10 minutos en background

    const handleInactivity = () => {
      logout();
      toast.info("Sesión cerrada por inactividad (5 min)", {
        description: "Vuelve a iniciar sesión para continuar.",
        duration: 8000
      });
    };

    const resetTimer = () => {
      const now = Date.now();
      // Throttle: ignorar si la última actividad fue hace menos de 2 segundos
      if (now - lastActivity < 2000) return;
      lastActivity = now;
      
      if (inactivityTimer) clearTimeout(inactivityTimer);
      inactivityTimer = setTimeout(handleInactivity, INACTIVITY_MS);
    };

    // visibilitychange: solo cerrar sesión si estuvo en background > 10 min
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        backgroundTimer = setTimeout(() => {
          logout();
          toast.info("Sesión cerrada por seguridad", {
            description: "La app estuvo inactiva en segundo plano.",
            duration: 8000
          });
        }, BACKGROUND_MS);
      } else {
        // Volvió al primer plano antes del timeout — cancelar cierre
        if (backgroundTimer) {
          clearTimeout(backgroundTimer);
          backgroundTimer = null;
        }
        resetTimer();
      }
    };

    // Usar un solo listener pasivo con throttle en lugar de 6 listeners activos
    const events = ['mousedown', 'keypress', 'scroll', 'touchstart'];
    
    events.forEach(event => {
      window.addEventListener(event, resetTimer, { passive: true });
    });
    
    document.addEventListener('visibilitychange', handleVisibilityChange);
    
    // Iniciar el temporizador
    resetTimer();

    return () => {
      if (inactivityTimer) clearTimeout(inactivityTimer);
      if (backgroundTimer) clearTimeout(backgroundTimer);
      events.forEach(event => {
        window.removeEventListener(event, resetTimer);
      });
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [user]);

  const isAdmin = userData?.role === 'admin';
  const isStaff = userData?.role === 'admin' || userData?.role === 'almacenista';

  // Returns true if the current user can add items to the given category
  const canAddTo = useCallback((category) => {
    if (isAdmin) return true;
    if (!isStaff) return false;
    const allowed = userData?.allowedCategories;
    if (!allowed || !Array.isArray(allowed)) return false;
    return allowed.includes(category);
  }, [isAdmin, isStaff, userData?.allowedCategories]);

  // Returns true if the current user can edit items in the given category
  const canEditIn = useCallback((category) => {
    if (isAdmin) return true;
    if (!isStaff) return false;
    const editable = userData?.editableCategories;
    if (!editable || !Array.isArray(editable)) return false;
    return editable.includes(category);
  }, [isAdmin, isStaff, userData?.editableCategories]);

  const contextValue = useMemo(() => ({
    user, 
    userData, 
    loading, 
    login, 
    signup, 
    logout,
    isAdmin,
    isStaff,
    canAddTo,
    canEditIn
  }), [user, userData, loading, isAdmin, isStaff, canAddTo, canEditIn]);

  return (
    <AuthContext.Provider value={contextValue}>
      {children}
    </AuthContext.Provider>
  );
};
