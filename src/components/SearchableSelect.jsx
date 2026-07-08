import React, { useState, useRef, useEffect, useMemo } from 'react';
import { ChevronDown, Search, PenLine } from 'lucide-react';
import './SearchableSelect.css';

const SearchableSelect = ({ options, value, onChange, placeholder = "Seleccionar...", allowFreeText = false }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const wrapperRef = useRef(null);

  // Close when clicking outside
  useEffect(() => {
    function handleClickOutside(event) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target)) {
        // If free text is allowed and there's a search term, use it as the value
        if (allowFreeText && searchTerm.trim().length > 0 && isOpen) {
          onChange(searchTerm.trim());
        }
        setIsOpen(false);
        setSearchTerm('');
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [allowFreeText, searchTerm, isOpen, onChange]);

  const filteredOptions = useMemo(() => {
    if (!searchTerm) return options;
    const lowerSearch = searchTerm.toLowerCase();
    return options.filter(opt => {
      const labelMatch = opt.label ? String(opt.label).toLowerCase().includes(lowerSearch) : false;
      const idMatch = opt.id ? String(opt.id).toLowerCase().includes(lowerSearch) : false;
      return labelMatch || idMatch;
    });
  }, [options, searchTerm]);

  const selectedOption = options.find(opt => opt.value === value);

  const handleUseFreeText = () => {
    onChange(searchTerm.trim());
    setIsOpen(false);
    setSearchTerm('');
  };

  return (
    <div className="searchable-select" ref={wrapperRef}>
      <div 
        className={`searchable-select-header ${isOpen ? 'open' : ''} ${!value ? 'placeholder' : ''}`}
        onClick={() => { setIsOpen(!isOpen); setSearchTerm(''); }}
      >
        <span>{selectedOption ? selectedOption.label : (value || placeholder)}</span>
        <ChevronDown size={18} className="chevron-icon" />
      </div>

      {isOpen && (
        <div className="searchable-select-dropdown">
          <div className="searchable-select-search">
            <Search size={16} className="search-icon" />
            <input 
              type="text" 
              placeholder="Buscar o escribir nombre..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && allowFreeText && searchTerm.trim().length > 0) {
                  handleUseFreeText();
                }
              }}
              autoFocus
            />
          </div>
          
          <ul className="searchable-select-options">
            {/* Free text option when typing and no exact match */}
            {allowFreeText && searchTerm.trim().length > 0 && (
              <li 
                className="searchable-select-option searchable-select-freetext"
                onClick={handleUseFreeText}
              >
                <PenLine size={14} className="freetext-icon" />
                <span>Usar: "<strong>{searchTerm.trim()}</strong>"</span>
              </li>
            )}
            {filteredOptions.length > 0 ? (
              filteredOptions.map((opt) => (
                <li 
                  key={opt.value}
                  className={`searchable-select-option ${value === opt.value ? 'selected' : ''}`}
                  onClick={() => {
                    onChange(opt.value);
                    setIsOpen(false);
                    setSearchTerm('');
                  }}
                >
                  {opt.id && <span className="opt-id">{opt.id} - </span>}
                  <span className="opt-label">{opt.label}</span>
                </li>
              ))
            ) : (
              !allowFreeText && <li className="searchable-select-empty">No se encontraron resultados</li>
            )}
          </ul>
        </div>
      )}
    </div>
  );
};

export default SearchableSelect;
