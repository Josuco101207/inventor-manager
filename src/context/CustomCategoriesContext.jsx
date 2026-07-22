import React, { createContext, useContext, useState, useEffect } from 'react';
import { useAuth } from './AuthContext';
import { db } from '../firebase/config';
import { collection, onSnapshot } from 'firebase/firestore';

const CustomCategoriesContext = createContext();

export const useCustomCategories = () => useContext(CustomCategoriesContext);

export const CustomCategoriesProvider = ({ children }) => {
  const { user } = useAuth();
  const [customCategories, setCustomCategories] = useState([]);

  useEffect(() => {
    if (!user) {
      setCustomCategories([]);
      return;
    }

    const unsubscribe = onSnapshot(
      collection(db, 'custom_categories'),
      (snapshot) => {
        const cats = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        setCustomCategories(cats);
      },
      (error) => {
        console.error("Error fetching custom categories:", error);
      }
    );

    return () => unsubscribe();
  }, [user]);

  return (
    <CustomCategoriesContext.Provider value={{ customCategories }}>
      {children}
    </CustomCategoriesContext.Provider>
  );
};
