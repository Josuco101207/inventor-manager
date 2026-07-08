import React, { useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import './ImageModal.css';

const ImageModal = ({ imageUrl, onClose }) => {
  if (!imageUrl) return null;

  // Prevent background scrolling when modal is open
  useEffect(() => {
    const originalOverflow = document.body.style.overflow;
    const originalPosition = document.body.style.position;
    const originalWidth = document.body.style.width;
    const scrollY = window.scrollY;

    document.body.style.overflow = 'hidden';
    document.body.style.position = 'fixed';
    document.body.style.width = '100%';
    document.body.style.top = `-${scrollY}px`;

    return () => {
      document.body.style.overflow = originalOverflow;
      document.body.style.position = originalPosition;
      document.body.style.width = originalWidth;
      document.body.style.top = '';
      window.scrollTo(0, scrollY);
    };
  }, []);

  const handleOverlayClick = useCallback((e) => {
    // Only close if clicking on the overlay itself, not the image
    if (e.target === e.currentTarget) {
      onClose();
    }
  }, [onClose]);

  const handleOverlayTouch = useCallback((e) => {
    if (e.target === e.currentTarget) {
      e.preventDefault();
      onClose();
    }
  }, [onClose]);

  return createPortal(
    <div 
      className="image-modal-overlay animate-fade-in" 
      onClick={handleOverlayClick}
      onTouchEnd={handleOverlayTouch}
    >
      <button 
        className="image-modal-close" 
        onClick={(e) => { e.stopPropagation(); onClose(); }}
        onTouchEnd={(e) => { e.stopPropagation(); e.preventDefault(); onClose(); }}
        aria-label="Cerrar"
      >
        <X size={24} />
      </button>
      <div className="image-modal-content" onClick={e => e.stopPropagation()}>
        <img 
          src={imageUrl} 
          alt="Vista ampliada" 
          className="image-modal-img" 
          draggable={false}
        />
      </div>
    </div>,
    document.body
  );
};

export default ImageModal;
