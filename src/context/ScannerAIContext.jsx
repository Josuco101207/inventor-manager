import React, { createContext, useContext, useState } from 'react';
import { processImageWithGemini, compressImage } from '../services/aiScanner';

const ScannerAIContext = createContext();

export const useScannerAI = () => useContext(ScannerAIContext);

export const ScannerAIProvider = ({ children }) => {
  const [step, setStep] = useState('UPLOAD'); // UPLOAD, PROCESSING, REVIEW, DONE
  const [file, setFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState('');
  const [extractedData, setExtractedData] = useState(null);
  const [error, setError] = useState('');
  
  const apiKey = import.meta.env.VITE_GEMINI_API_KEY || 'AIzaSyC8r2Pl-F9hGv9SlG5suzS4qOqCloHUz2s';

  const processFile = async (selectedFile) => {
    if (!apiKey) {
      setError('Por favor configura tu API Key de Gemini primero.');
      return;
    }

    try {
      setStep('PROCESSING');
      setError('');
      setFile(selectedFile);
      setPreviewUrl(URL.createObjectURL(selectedFile));

      const compressedBase64 = await compressImage(selectedFile);
      const data = await processImageWithGemini(compressedBase64, apiKey);
      
      setExtractedData(data);
      setStep('REVIEW');
    } catch (err) {
      console.error(err);
      setError(err.message || 'Error al escanear el documento.');
      setStep('UPLOAD');
    }
  };

  const reset = () => {
    setStep('UPLOAD');
    setFile(null);
    setPreviewUrl('');
    setExtractedData(null);
    setError('');
  };

  return (
    <ScannerAIContext.Provider value={{
      step, setStep,
      file, previewUrl,
      extractedData, setExtractedData,
      error,
      apiKey,
      processFile,
      reset
    }}>
      {children}
    </ScannerAIContext.Provider>
  );
};
