import React, { createContext, useContext, useState, useEffect, useMemo } from 'react';
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

  // Lógica de inactividad (5 minutos) y bloqueo de dispositivo
  useEffect(() => {
    if (!user) return;

    let timeoutId;

    const handleInactivity = () => {
      logout();
      toast.info("Sesión cerrada por inactividad (5 min)", {
        description: "Vuelve a iniciar sesión para continuar.",
        duration: 8000
      });
    };

    const resetTimer = () => {
      if (timeoutId) clearTimeout(timeoutId);
      timeoutId = setTimeout(handleInactivity, 5 * 60 * 1000); // 5 minutos
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        // Se cerró la app, se minimizó o se bloqueó el teléfono
        logout();
        toast.info("Sesión cerrada por seguridad", {
          description: "Saliste de la aplicación o bloqueaste el dispositivo.",
          duration: 8000
        });
      }
    };

    const events = ['mousedown', 'mousemove', 'keypress', 'scroll', 'touchstart', 'click'];
    
    const activityListener = () => resetTimer();

    events.forEach(event => {
      window.addEventListener(event, activityListener);
    });
    
    // Escuchar cuando la app se va a segundo plano
    document.addEventListener('visibilitychange', handleVisibilityChange);

    // Iniciar el temporizador
    resetTimer();

    return () => {
      if (timeoutId) clearTimeout(timeoutId);
      events.forEach(event => {
        window.removeEventListener(event, activityListener);
      });
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [user]);

  const isAdmin = userData?.role === 'admin';
  const isStaff = userData?.role === 'admin' || userData?.role === 'almacenista';
  // Returns true if the current user can add items to the given category
  const canAddTo = (category) => {
    if (isAdmin) return true;
    if (!isStaff) return false;
    const allowed = userData?.allowedCategories;
    if (!allowed || !Array.isArray(allowed)) return false;
    return allowed.includes(category);
  };

  // Returns true if the current user can edit items in the given category
  const canEditIn = (category) => {
    if (isAdmin) return true;
    if (!isStaff) return false;
    const editable = userData?.editableCategories;
    if (!editable || !Array.isArray(editable)) return false;
    return editable.includes(category);
  };

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
  }), [user, userData, loading, isAdmin, isStaff]);

  return (
    <AuthContext.Provider value={contextValue}>
      {children}
    </AuthContext.Provider>
  );
};
