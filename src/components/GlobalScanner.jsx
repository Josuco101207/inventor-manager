import React, { useState } from 'react';
import { Camera } from 'lucide-react';
import ScannerAIView from '../views/ScannerAIView';
import { useAuth } from '../context/AuthContext';

const GlobalScanner = () => {
  const { user } = useAuth();
  const [isOpen, setIsOpen] = useState(false);

  if (!user) return null;

  return (
    <>
      <button 
        className="fab-scanner"
        onClick={() => setIsOpen(true)}
        title="Escanear con Inteligencia Artificial"
      >
        <div className="fab-glow"></div>
        <Camera size={24} color="white" />
      </button>

      {isOpen && <ScannerAIView onClose={() => setIsOpen(false)} />}
    </>
  );
};

export default GlobalScanner;
