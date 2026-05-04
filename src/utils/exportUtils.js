import * as XLSX from 'xlsx';

export const exportToExcel = (data, filename, category = "General") => {
  if (!data || data.length === 0) return;

  // 1. Prepare Metadata and Title
  const now = new Date();
  const headerData = [
    ["REPORTES DE INVENTARIO - INVENTOR MANAGER"],
    ["Categoría:", category.toUpperCase()],
    ["Fecha de Exportación:", now.toLocaleString()],
    ["Cantidad de Artículos:", data.length],
    [], // Empty row for spacing
  ];

  // 2. Prepare Table Data based on category
  const cleanData = data.map(item => {
    const formattedDate = item.loanDate ? (item.loanDate.toDate ? item.loanDate.toDate().toLocaleString() : new Date(item.loanDate.seconds * 1000).toLocaleString()) : 'N/A';
    
    // Base object common to all
    const base = {
      "Nombre": item.name || '',
      "Stock Actual": item.qty || 0,
      "Stock Mínimo": item.threshold || 0,
      "Estado": (item.qty || 0) <= 0 ? 'Agotado' : (item.qty || 0) <= (item.threshold || 0) ? 'Bajo' : 'OK',
    };

    // Category specific fields
    switch (category) {
      case 'Inventario General':
      case 'Almacén Temporal':
        return {
          "Nombre": item.name || '',
          "Item": item.item_number || '-',
          "Grupo": item.grupo || '-',
          "Subcategoría": item.subcategory || '-',
          "Marca": item.marca || '-',
          "Ubicación": item.location || '-',
          "Serie": item.serie || '-',
          "Stock": item.qty || 0,
          "Mínimo": item.threshold || 0,
          "Estado": (item.qty || 0) <= 0 ? 'Agotado' : (item.qty || 0) <= (item.threshold || 0) ? 'Bajo' : 'OK',
          "Unidad": item.unit || 'pz',
          "Fecha Compra": item.fecha_compra || '-',
          "Garantía": item.garantia || '-',
          "Observaciones": item.observaciones || '',
        };
      
      case 'Parques':
      case (category.startsWith('Parques') ? category : null): // Handle 'Parques - Section'
        return {
          "Nombre": item.name || '',
          "Sección": item.subcategory || '-',
          "Marca": item.marca || '-',
          "Paquetes": item.paquete || '-',
          "Presentación": item.presentacion || '-',
          "Piezas Total": item.qty || 0,
          "Mínimo": item.threshold || 0,
          "Estado": (item.qty || 0) <= 0 ? 'Agotado' : (item.qty || 0) <= (item.threshold || 0) ? 'Bajo' : 'OK',
          "Observaciones": item.observaciones || '',
        };

      case 'Herramientas':
        return {
          "Nombre": item.name || '',
          "Item Number": item.item_number || '-',
          "Grupo": item.grupo || '-',
          "Código": item.codigo || '-',
          "Modelo": item.modelo || 'N/A',
          "Serie": item.serie || 'N/A',
          "No. Equipo": item.numero_equipo || '-',
          "Generación": item.generacion || '-',
          "Marca": item.marca || 'N/A',
          "Estado Físico": item.estado || 'BUENO',
          "Número OC": item.oc_number || '-',
          "Fecha Compra": item.fecha_compra || '-',
          "Garantía": item.garantia || '-',
          "Fin Periodo Sin Costo": item.fin_periodo_sin_costo || '-',
          "Última Reparación": item.ultima_reparacion || '-',
          "Costo Reparación": item.costo_reparacion || 0,
          "Recuento Reparaciones": item.recuento_reparaciones || 0,
          "Stock": item.qty || 0,
          "Responsable": item.status === 'Prestado' ? item.borrowedBy : 'En Almacén',
          "Entregó": item.lentBy || 'N/A',
          "Fecha Últ. Mov.": formattedDate,
          "Observaciones": item.observaciones || '',
        };

      case 'Tornillería':
        return {
          "Nombre": item.name || '',
          "Rosca": item.rosca || '-',
          "Material": item.material || '-',
          "Stock": item.qty || 0,
          "Mínimo": item.threshold || 0,
          "Estado": (item.qty || 0) <= 0 ? 'Agotado' : (item.qty || 0) <= (item.threshold || 0) ? 'Bajo' : 'OK',
          "Unidad": item.unit || 'pz',
          "Observaciones": item.observaciones || '',
        };

      case 'Impresión 3D':
        return {
          "Nombre": item.name || '',
          "Material": item.material || '-',
          "Color": item.color || '-',
          "Peso": item.peso || '-',
          "Stock": item.qty || 0,
          "Mínimo": item.threshold || 0,
          "Estado": (item.qty || 0) <= 0 ? 'Agotado' : (item.qty || 0) <= (item.threshold || 0) ? 'Bajo' : 'OK',
          "Unidad": item.unit || 'pz',
          "Observaciones": item.observaciones || '',
        };

      case 'Electrónica':
        return {
          "Nombre": item.name || '',
          "Tipo": item.tipo || '-',
          "Voltaje": item.voltaje || '-',
          "Stock": item.qty || 0,
          "Mínimo": item.threshold || 0,
          "Estado": (item.qty || 0) <= 0 ? 'Agotado' : (item.qty || 0) <= (item.threshold || 0) ? 'Bajo' : 'OK',
          "Unidad": item.unit || 'pz',
          "Observaciones": item.observaciones || '',
        };

      case 'Papelería':
      case 'Papelería e Insumos':
        return {
          "Nombre": item.name || '',
          "Tipo": item.tipo || '-',
          "Marca": item.marca || '-',
          "Stock": item.qty || 0,
          "Mínimo": item.threshold || 0,
          "Estado": (item.qty || 0) <= 0 ? 'Agotado' : (item.qty || 0) <= (item.threshold || 0) ? 'Bajo' : 'OK',
          "Unidad": item.unit || 'pz',
          "Observaciones": item.observaciones || '',
        };

      default:
        return {
          "Nombre": item.name || '',
          "Subcategoría": item.subcategory || '-',
          "Marca": item.marca || '-',
          "Ubicación": item.location || '-',
          "Stock": item.qty || 0,
          "Mínimo": item.threshold || 0,
          "Estado": (item.qty || 0) <= 0 ? 'Agotado' : (item.qty || 0) <= (item.threshold || 0) ? 'Bajo' : 'OK',
          "Unidad": item.unit || 'pz',
          "Observaciones": item.observaciones || '',
        };
    }
  });

  // 3. Create Worksheet
  const worksheet = XLSX.utils.aoa_to_sheet(headerData);
  
  // Add table data starting after the header
  XLSX.utils.sheet_add_json(worksheet, cleanData, { origin: "A6" });

  // 4. Set Column Widths dynamically
  const sampleItem = cleanData[0];
  const wscols = Object.keys(sampleItem).map(key => {
    if (key === 'Nombre' || key === 'Observaciones') return { wch: 30 };
    if (key === 'Fecha Últ. Mov.') return { wch: 25 };
    return { wch: 15 };
  });
  worksheet['!cols'] = wscols;

  // 5. Create Workbook and Save
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Reporte");
  XLSX.writeFile(workbook, `${filename}.xlsx`);
};

export const exportToCSV = (data, filename) => {
  if (!data || data.length === 0) return;

  const keys = Array.from(new Set(data.reduce((acc, obj) => acc.concat(Object.keys(obj)), [])));
  const csvRows = [];
  csvRows.push(keys.join(','));

  for (const row of data) {
    const values = keys.map(key => {
      const val = row[key] === undefined ? '' : row[key];
      const escaped = ('' + val).replace(/"/g, '""');
      return `"${escaped}"`;
    });
    csvRows.push(values.join(','));
  }

  const csvString = csvRows.join('\n');
  const blob = new Blob([csvString], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', `${filename}.csv`);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};

