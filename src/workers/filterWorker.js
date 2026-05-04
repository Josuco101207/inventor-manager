/**
 * Web Worker para filtrado masivo de inventario.
 * Estrategia: Pre-procesamiento de datos y evitación de localeCompare en bucles de sort.
 */
self.onmessage = (e) => {
  const { items, searchTerm, categoryTitle, activeSubcategory, selectedBrand, selectedLocation } = e.data;

  if (!items) return;

  const searchLow = searchTerm ? searchTerm.toLowerCase().trim() : '';

  // 1. Filtrado en un solo paso
  const filtered = items.filter(item => {
    // Filtros categóricos primero (más rápidos)
    if (item.category !== categoryTitle) return false;
    if (activeSubcategory !== 'TODAS' && item.subcategory !== activeSubcategory) return false;
    if (selectedBrand !== 'Todas' && item.marca !== selectedBrand) return false;
    if (selectedLocation !== 'Todas' && item.location !== selectedLocation) return false;
    
    if (!searchLow) return true;
    
    // Búsqueda multi-campo optimizada
    return (
      (item.name && item.name.toLowerCase().includes(searchLow)) || 
      (item.modelo && item.modelo.toLowerCase().includes(searchLow)) || 
      (item.marca && item.marca.toLowerCase().includes(searchLow)) || 
      (item.codigo && item.codigo.toLowerCase().includes(searchLow)) || 
      (item.item_number && String(item.item_number).includes(searchLow)) || 
      (item.serie && item.serie.toLowerCase().includes(searchLow))
    );
  });

  // 2. Ordenamiento optimizado
  // Pre-calculamos los nombres normalizados para evitar procesarlos miles de veces en sort()
  const sortable = filtered.map(item => ({
    ...item,
    _sortKey: (item.name || '').trim().toLowerCase()
  }));

  sortable.sort((a, b) => {
    if (a._sortKey < b._sortKey) return -1;
    if (a._sortKey > b._sortKey) return 1;
    return 0;
  });

  self.postMessage(sortable);
};

