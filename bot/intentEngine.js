/**
 * Motor de Intenciones Propio v1.0
 * Detecta intenciones del usuario SIN usar IA (regex + keywords)
 * Instantáneo, 0 tokens, 0 límites
 */

// ==================== DICCIONARIOS ====================

const BUSCAR_VERBS = ['busca', 'buscar', 'dame', 'dime', 'hay', 'tiene', 'tienen', 'tenemos',
  'cuánto', 'cuanto', 'cuántos', 'cuantos', 'cuántas', 'cuantas',
  'muéstrame', 'muestrame', 'enséñame', 'enseñame', 'enseñar',
  'inventario', 'existencia', 'existencias', 'stock', 'disponible',
  'checa', 'checar', 'revisa', 'revisar', 'consulta', 'consultar',
  'qué hay', 'que hay', 'ver', 'lista', 'listar'];

const ENTRADA_VERBS = ['mete', 'meter', 'entra', 'entrar', 'entrada', 'agrega', 'agregar',
  'añade', 'añadir', 'compré', 'compre', 'compramos', 'llegaron', 'llegó',
  'recibí', 'recibimos', 'ingresa', 'ingresar', 'registra entrada',
  'pon', 'ponle', 'ponme', 'súmale', 'sumale', 'suma', 'aumenta'];

const SALIDA_VERBS = ['saca', 'sacar', 'salida', 'sale', 'salir', 'usa', 'usar', 'usé',
  'vendí', 'vender', 'vendimos', 'gastó', 'gasto', 'sacamos', 'salieron',
  'llevó', 'llevo', 'llevamos', 'quita', 'quitar', 'resta', 'réstale',
  'baja', 'bajar', 'descuenta', 'descontar', 'ocupé', 'ocupamos'];

const EXPORTAR_WORDS = ['pdf', 'excel', 'xlsx', 'reporte', 'exportar', 'exporta',
  'documento', 'archivo', 'genera', 'generar', 'imprimir', 'descargar'];

const RESUMEN_WORDS = ['resumen', 'total', 'totales', 'general',
  'inventario completo', 'todo el inventario', 'cuánto hay en total',
  'cuanto hay en total', 'reporte general'];

const ANALISIS_WORDS = ['último', 'ultima', 'última', 'historico', 'histórico', 'historial',
  'estadística', 'estadistica', 'análisis', 'analisis', 'más sale', 'mas sale',
  'más entra', 'mas entra', 'popular', 'qué falta', 'que falta',
  'bajo stock', 'agotado', 'agotados', 'movimientos', 'tendencia'];

const GREETING_WORDS = ['hola', 'buenos días', 'buenos dias', 'buenas tardes',
  'buenas noches', 'hey', 'qué tal', 'que tal', 'hi', 'hello',
  'buen día', 'buen dia', 'qué onda', 'que onda', 'saludos'];

// Números en español → dígitos
const NUMBER_WORDS = {
  'un': 1, 'uno': 1, 'una': 1, 'dos': 2, 'tres': 3, 'cuatro': 4, 'cinco': 5,
  'seis': 6, 'siete': 7, 'ocho': 8, 'nueve': 9, 'diez': 10,
  'once': 11, 'doce': 12, 'trece': 13, 'catorce': 14, 'quince': 15,
  'dieciséis': 16, 'dieciseis': 16, 'diecisiete': 17, 'dieciocho': 18,
  'diecinueve': 19, 'veinte': 20, 'veintiuno': 21, 'veinticinco': 25,
  'treinta': 30, 'cuarenta': 40, 'cincuenta': 50, 'sesenta': 60,
  'setenta': 70, 'ochenta': 80, 'noventa': 90,
  'cien': 100, 'ciento': 100, 'doscientos': 200, 'trescientos': 300,
  'quinientos': 500, 'mil': 1000
};

// Preposiciones y artículos para limpiar keywords
const STOP_WORDS = ['el', 'la', 'los', 'las', 'un', 'una', 'unos', 'unas',
  'de', 'del', 'en', 'con', 'por', 'para', 'al', 'a',
  'me', 'te', 'se', 'nos', 'les', 'lo', 'le',
  'mi', 'tu', 'su', 'que', 'es', 'son', 'está', 'hay',
  'si', 'no', 'ya', 'y', 'o', 'e', 'u',
  'todo', 'todos', 'toda', 'todas', 'favor', 'please', 'porfavor', 'porfa'];

// ==================== FUNCIONES AUXILIARES ====================

function extractNumber(text) {
  // Primero buscar dígitos
  const digitMatch = text.match(/(\d+)/);
  if (digitMatch) return parseInt(digitMatch[1]);

  // Luego buscar números en texto
  const words = text.split(/\s+/);
  for (const word of words) {
    const clean = word.replace(/[.,!?]/g, '');
    if (NUMBER_WORDS[clean] !== undefined) return NUMBER_WORDS[clean];
  }
  return null;
}

function extractKeyword(text, actionWords) {
  let cleaned = text.toLowerCase().trim();

  // Quitar signos de puntuación
  cleaned = cleaned.replace(/[¿?¡!.,;:]/g, '');

  // Quitar los verbos de acción que ya detectamos
  for (const verb of actionWords) {
    // Usar boundary para no quitar substrings parciales
    const regex = new RegExp(`\\b${verb}\\b`, 'gi');
    cleaned = cleaned.replace(regex, '');
  }

  // Solo quitar la cantidad específica si se extrajo una (para entrada/salida)
  // No quitamos todos los números con \d+ porque hay artículos como "cople 111" o "128-C42"
  for (const numWord of Object.keys(NUMBER_WORDS)) {
    const regex = new RegExp(`\\b${numWord}\\b`, 'gi');
    cleaned = cleaned.replace(regex, '');
  }

  // Quitar palabras comunes específicas de inventario
  const extraRemove = ['inventario', 'existencia', 'existencias', 'stock',
    'dame', 'dime', 'muestrame', 'muéstrame', 'enseñame', 'enséñame',
    'rollos', 'rollo', 'piezas', 'pieza', 'unidades', 'unidad',
    'cajas', 'caja', 'paquetes', 'paquete', 'bolsas', 'bolsa'];
  for (const word of extraRemove) {
    const regex = new RegExp(`\\b${word}\\b`, 'gi');
    cleaned = cleaned.replace(regex, '');
  }

  // Quitar stop words
  const words = cleaned.split(/\s+/).filter(w => w.length > 0);
  const meaningful = words.filter(w => !STOP_WORDS.includes(w));

  return meaningful.join(' ').trim() || null;
}

function removeAccents(str) {
  return str.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function containsAny(text, wordList) {
  const lower = removeAccents(text.toLowerCase());
  for (const word of wordList) {
    const cleanWord = removeAccents(word.toLowerCase());
    // Para frases con espacios, buscar directamente
    if (cleanWord.includes(' ')) {
      if (lower.includes(cleanWord)) return word;
    } else {
      // Para palabras sueltas, usar boundary
      const regex = new RegExp(`\\b${cleanWord}\\b`, 'i');
      if (regex.test(lower)) return word;
    }
  }
  return null;
}

function detectExportFormat(text) {
  const lower = removeAccents(text.toLowerCase());
  if (lower.includes('excel') || lower.includes('xlsx')) return 'excel';
  if (lower.includes('pdf')) return 'pdf';
  return 'pdf'; // default
}

// ==================== DETECTOR PRINCIPAL ====================

function detectIntent(message, userPhone) {
  const msg = message.toLowerCase().trim();

  // 1. SALUDOS (prioridad alta)
  const greetMatch = containsAny(msg, GREETING_WORDS);
  if (greetMatch && msg.length < 40) {
    return {
      action: 'unknown',
      reply: '🤖 ¡Hola! Soy tu asistente de inventario. Dime qué necesitas buscar o registrar.',
      confidence: 'high'
    };
  }

  // 2. EXPORTAR (detectar antes que buscar, porque "dame un pdf de lonas" no es búsqueda)
  const exportMatch = containsAny(msg, EXPORTAR_WORDS);
  if (exportMatch) {
    const format = detectExportFormat(msg);
    const filter = extractKeyword(msg, [...EXPORTAR_WORDS, 'dame', 'genera', 'generar', 'hazme', 'crea', 'crear']);
    return {
      action: 'exportar',
      format: format,
      filter: filter,
      confidence: 'high'
    };
  }

  // 3. ANÁLISIS (preguntas históricas/estadísticas, DEBE IR ANTES DE ENTRADA/SALIDA para atrapar "última salida")
  const analisisMatch = containsAny(msg, ANALISIS_WORDS);
  if (analisisMatch) {
    return {
      action: 'analisis',
      question: message, // Pasar el mensaje original tal cual
      confidence: 'high'
    };
  }


  // 3. ENTRADA (necesita verbo + número + keyword)
  const entradaMatch = containsAny(msg, ENTRADA_VERBS);
  if (entradaMatch) {
    const qty = extractNumber(msg);
    // Quitar el número explícito de la cadena para que no ensucie el keyword
    let keywordMsg = msg;
    if (qty && msg.includes(qty.toString())) {
      keywordMsg = msg.replace(qty.toString(), '');
    }
    const keyword = extractKeyword(keywordMsg, ENTRADA_VERBS);
    if (qty && keyword) {
      return {
        action: 'entrada',
        keyword: keyword,
        quantity: qty,
        confidence: 'high'
      };
    }
    // Tiene verbo de entrada pero falta qty o keyword → ambiguo
    if (keyword) {
      return {
        action: 'entrada',
        keyword: keyword,
        quantity: qty || 1,
        confidence: 'medium'
      };
    }
  }

  // 4. SALIDA (necesita verbo + número + keyword)
  const salidaMatch = containsAny(msg, SALIDA_VERBS);
  if (salidaMatch) {
    const qty = extractNumber(msg);
    let keywordMsg = msg;
    if (qty && msg.includes(qty.toString())) {
      keywordMsg = msg.replace(qty.toString(), '');
    }
    const keyword = extractKeyword(keywordMsg, SALIDA_VERBS);
    if (qty && keyword) {
      return {
        action: 'salida',
        keyword: keyword,
        quantity: qty,
        confidence: 'high'
      };
    }
    if (keyword) {
      return {
        action: 'salida',
        keyword: keyword,
        quantity: qty || 1,
        confidence: 'medium'
      };
    }
  }



  // 6. RESUMEN
  const resumenMatch = containsAny(msg, RESUMEN_WORDS);
  if (resumenMatch) {
    return {
      action: 'resumen',
      confidence: 'high'
    };
  }

  // 7. BUSCAR (la más común, al final para no capturar otras intenciones)
  const buscarMatch = containsAny(msg, BUSCAR_VERBS);
  if (buscarMatch) {
    const keyword = extractKeyword(msg, BUSCAR_VERBS);
    if (keyword) {
      return {
        action: 'buscar',
        keyword: keyword,
        confidence: 'high'
      };
    }
  }

  // 8. Heurística: si el mensaje es corto (1-3 palabras) y no matcheó nada,
  //    probablemente es una búsqueda directa ("lonas", "coples", "tornillos")
  const cleanWords = msg.replace(/[¿?¡!.,;:]/g, '').split(/\s+/).filter(w => w.length > 1);
  if (cleanWords.length <= 3 && cleanWords.length > 0) {
    const possibleKeyword = cleanWords.filter(w => !STOP_WORDS.includes(w)).join(' ');
    if (possibleKeyword.length > 1) {
      return {
        action: 'buscar',
        keyword: possibleKeyword,
        confidence: 'medium'
      };
    }
  }

  // 9. NO ENTENDIÓ → pasar a la IA
  return { action: 'unknown', confidence: 'low' };
}

module.exports = { detectIntent };
