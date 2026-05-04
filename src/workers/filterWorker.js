/**
 * Web Worker para filtrado masivo de inventario.
 * Off-Main-Thread: Filtrado + Ordenamiento + Limpieza de payload.
 * 
 * OPTIMIZACIONES:
 * - Pre-cálculo de sortKey para evitar .toLowerCase() en cada comparación
 * - Filtros categóricos evaluados primero (cortocircuito rápido)
 * - Limpieza de campos internos antes del postMessage (reduce transferencia)
 */
self.onmessage = (e) => {
  const { items, searchTerm, categoryTitle, activeSubcategory, selectedBrand, selectedLocation } = e.data;

  if (!items || !Array.isArray(items)) {
    self.postMessage([]);
    return;
  }

  const searchLow = searchTerm ? searchTerm.toLowerCase().trim() : '';

  // 1. Filtrado en un solo paso con cortocircuito por categoría
  const filtered = [];
  for (let i = 0, len = items.length; i < len; i++) {
    const item = items[i];
    
    // Filtros categóricos primero (O(1) string comparison, early exit)
    if (item.category !== categoryTitle) continue;
    if (activeSubcategory !== 'TODAS' && item.subcategory !== activeSubcategory) continue;
    if (selectedBrand !== 'Todas' && item.marca !== selectedBrand) continue;
    if (selectedLocation !== 'Todas' && item.location !== selectedLocation) continue;
    
    // Búsqueda textual solo si hay término
    if (searchLow) {
      const match = (
        (item.name && item.name.toLowerCase().includes(searchLow)) || 
        (item.modelo && item.modelo.toLowerCase().includes(searchLow)) || 
        (item.marca && item.marca.toLowerCase().includes(searchLow)) || 
        (item.codigo && item.codigo.toLowerCase().includes(searchLow)) || 
        (item.item_number && String(item.item_number).includes(searchLow)) || 
        (item.serie && item.serie.toLowerCase().includes(searchLow))
      );
      if (!match) continue;
    }
    
    filtered.push(item);
  }

  // 2. Ordenamiento con claves pre-calculadas (evita .toLowerCase() en cada comparación de sort)
  const len = filtered.length;
  const keys = new Array(len);
  for (let i = 0; i < len; i++) {
    keys[i] = (filtered[i].name || '').trim().toLowerCase();
  }

  // Crear array de índices y ordenar por clave
  const indices = new Array(len);
  for (let i = 0; i < len; i++) indices[i] = i;
  
  indices.sort((a, b) => {
    if (keys[a] < keys[b]) return -1;
    if (keys[a] > keys[b]) return 1;
    return 0;
  });

  // Construir resultado ordenado (sin campos internos de Worker)
  const result = new Array(len);
  for (let i = 0; i < len; i++) {
    result[i] = filtered[indices[i]];
  }

  self.postMessage(result);
};
