import React, { useState, useEffect, useRef } from 'react';

/**
 * Componente de Imagen Optimizado para Hardware de Gama Media (Tablets)
 * - Intersection Observer para Lazy Loading real.
 * - decoding="async" para no bloquear el Main Thread.
 * - Soporte para miniaturas de Firebase Storage.
 */
const OptimizedImage = ({ src, alt, className, thumbnail = true }) => {
  const [isLoaded, setIsLoaded] = useState(false);
  const [isInView, setIsInView] = useState(false);
  const imgRef = useRef();

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsInView(true);
          observer.disconnect();
        }
      },
      { rootMargin: '100px' } // Cargamos con un margen para evitar parpadeos
    );

    if (imgRef.current) {
      observer.observe(imgRef.current);
    }

    return () => observer.disconnect();
  }, []);

  // Construir URL de miniatura si es necesario (ejemplo basado en Firebase Extensions)
  const imageSrc = thumbnail && src ? src.replace('/o/', '/o/thumbnails%2F').replace('?alt=', '_200x200?alt=') : src;

  return (
    <div 
      ref={imgRef}
      className={`image-container ${isLoaded ? 'loaded' : 'loading'} ${className}`}
      style={{ 
        backgroundColor: '#f1f5f9', 
        overflow: 'hidden', 
        position: 'relative',
        minHeight: '40px' 
      }}
    >
      {isInView && (
        <img
          src={imageSrc}
          alt={alt}
          loading="lazy"
          decoding="async"
          onLoad={() => setIsLoaded(true)}
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            opacity: isLoaded ? 1 : 0,
            transition: 'opacity 0.3s ease-in-out'
          }}
        />
      )}
      {!isLoaded && (
        <div className="shimmer" style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          background: 'linear-gradient(90deg, #f1f5f9 25%, #e2e8f0 50%, #f1f5f9 75%)',
          backgroundSize: '200% 100%',
          animation: 'shimmer 1.5s infinite'
        }} />
      )}
    </div>
  );
};

export default React.memo(OptimizedImage);
