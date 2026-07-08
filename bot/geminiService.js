/**
 * Gemini Service v1.0
 * Servicio de IA usando Google Gemini Flash (gratis)
 * Segundo nivel de la cascada de IA
 */

let GoogleGenAI = null;
let ai = null;

try {
    const genaiModule = require('@google/genai');
    GoogleGenAI = genaiModule.GoogleGenAI;
    if (process.env.GEMINI_API_KEY) {
        ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
        console.log('✅ Gemini Service inicializado correctamente.');
    } else {
        console.log('⚠️ GEMINI_API_KEY no configurada. Gemini no disponible.');
    }
} catch (e) {
    console.log('⚠️ Módulo @google/genai no disponible. Gemini deshabilitado.');
}

const SYSTEM_PROMPT = `Eres un asistente de inventario llamado "Inventor Bot".
Tu trabajo es interpretar el mensaje del usuario y convertirlo en un objeto JSON estricto.
SOLO devuelve JSON, nunca texto normal.

Acciones posibles:
1. "buscar": Cuando pregunten si hay algo, cuánto hay, o busquen un producto.
2. "entrada": Cuando digan que agregaron, metieron, compraron o entraron productos.
3. "salida": Cuando digan que sacaron, usaron, vendieron o salieron productos.
4. "resumen": Cuando pidan un reporte general o totales del inventario.
5. "analisis": Cuando pregunten por datos históricos, estadísticos, última salida, artículo más popular, etc.
6. "exportar": Cuando pidan un PDF, Excel o documento.
7. "unknown": Cuando digan "hola" o hablen de otra cosa. Usa "reply" para responder amablemente.

Formato:
{"action": "buscar", "keyword": "nombre_producto"}
{"action": "entrada", "keyword": "nombre_producto", "quantity": numero}
{"action": "salida", "keyword": "nombre_producto", "quantity": numero}
{"action": "resumen"}
{"action": "analisis", "question": "La pregunta del usuario"}
{"action": "exportar", "format": "pdf_o_excel", "filter": "keyword_o_null"}
{"action": "unknown", "reply": "respuesta amable"}

REGLAS:
- Extrae la keyword lo más limpia posible.
- Extrae cantidades como número (ej. "cinco" -> 5).
- Tolera errores de ortografía.
- Devuelve SOLO JSON sin marcadores de bloque.`;

const chatHistories = {};

async function processMessage(message, userPhone = 'default') {
    if (!ai) throw new Error('Gemini no configurado');

    // Construir contexto de historial
    if (!chatHistories[userPhone]) chatHistories[userPhone] = [];
    chatHistories[userPhone].push({ role: 'user', content: message });
    if (chatHistories[userPhone].length > 6) chatHistories[userPhone].shift();

    let contextStr = '';
    if (chatHistories[userPhone].length > 1) {
        const history = chatHistories[userPhone].slice(0, -1);
        contextStr = 'Conversación reciente:\n' + history.map(m => `${m.role}: ${m.content}`).join('\n') + '\n\n';
    }

    const fullPrompt = contextStr + `Mensaje actual del usuario: "${message}"\n\nResponde SOLO con JSON:`;

    const response = await ai.models.generateContent({
        model: 'gemini-2.0-flash',
        config: {
            systemInstruction: SYSTEM_PROMPT,
            responseMimeType: 'application/json',
            temperature: 0.1,
        },
        contents: fullPrompt,
    });

    const text = response.text || '{}';
    const result = JSON.parse(text);

    // Guardar respuesta en historial
    chatHistories[userPhone].push({ role: 'assistant', content: JSON.stringify(result) });
    if (chatHistories[userPhone].length > 6) chatHistories[userPhone].shift();

    return result;
}

async function generateNaturalResponse(userMessage, dbResult) {
    if (!ai) return null; // Retorna null para que el router use otro servicio

    const context = `Mensaje del usuario: "${userMessage}"
Resultado de la Base de Datos: ${typeof dbResult === 'string' ? dbResult : JSON.stringify(dbResult)}

Redacta una respuesta natural, breve y amable (con emojis moderados). Actúa como si tú revisaste el almacén.`;

    const response = await ai.models.generateContent({
        model: 'gemini-2.0-flash',
        config: {
            systemInstruction: 'Eres un encargado de almacén amable. Responde de forma natural y breve. Nunca menciones que eres IA ni que recibiste un JSON.',
            temperature: 0.6,
        },
        contents: context,
    });

    return response.text || null;
}

function isAvailable() {
    return ai !== null;
}

module.exports = { processMessage, generateNaturalResponse, isAvailable };
