const Groq = require('groq-sdk');

let groq = null;

try {
    if (process.env.GROQ_API_KEY) {
        groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
        console.log('✅ Groq Service inicializado correctamente.');
    } else {
        console.log('⚠️ GROQ_API_KEY no configurada. Groq no disponible.');
    }
} catch (e) {
    console.error('Error inicializando Groq SDK:', e);
}

const SYSTEM_PROMPT = `Eres un asistente súper inteligente para el manejo de inventario ("Inventor Manager").
Tu trabajo es interpretar el mensaje del usuario (y el contexto de la conversación previa) y convertirlo en un objeto JSON estricto.
Nunca respondas con texto normal, SOLO devuelve JSON.

Acciones posibles:
1. "buscar": Cuando el usuario pregunte si hay algo, cuánto hay, o busque un producto.
2. "entrada": Cuando el usuario diga que agregó, metió, compró o entraron productos.
3. "salida": Cuando el usuario diga que sacó, usó, vendió o salieron productos.
4. "resumen": Cuando el usuario pida un reporte general o totales del inventario.
5. "analisis": Cuando el usuario pregunte por cosas históricas, datos estadísticos, la última salida, el artículo más popular, qué falta, etc.
6. "exportar": Cuando el usuario pida explícitamente un PDF, Excel o documento. Si te pide "con eso" o "de esos", extrae la palabra clave del mensaje INMEDIATAMENTE ANTERIOR y úsala como "filter". Si te pide cosas específicas (ej. "pdf de coples"), el filter es "coples".
7. "unknown": Cuando el usuario diga "hola", pregunte tu nombre o hable de otra cosa (aquí puedes usar el campo "reply" para responder amablemente que solo manejas inventario).

Formato esperado:
{"action": "buscar", "keyword": "nombre_producto"}
{"action": "entrada", "keyword": "nombre_producto", "quantity": numero_entero}
{"action": "salida", "keyword": "nombre_producto", "quantity": numero_entero}
{"action": "resumen"}
{"action": "analisis", "question": "La pregunta exacta que hizo el usuario"}
{"action": "exportar", "format": "pdf_o_excel_o_default", "filter": "palabra_clave_para_filtrar_o_nulo"}
{"action": "unknown", "reply": "Hola, soy tu asistente de inventario. Dime qué necesitas buscar o registrar."}

REGLAS:
- Extrae la palabra clave (keyword) lo más limpia posible, deduciéndola del contexto si el usuario usa pronombres (ej. "saca 5 de esos" -> usa la keyword anterior).
- Extrae la cantidad como un número (ej. "mete cinco discos" -> quantity: 5).
- Tolera errores de ortografía en la keyword pero trata de mantenerla lógica.
- Devuelve EXCLUSIVAMENTE el JSON, sin marcadores de bloque \`\`\`json ni nada extra.`;

const chatHistories = {};

async function processMessage(message, userPhone = 'default') {
    if (!groq) throw new Error("Groq API Key no configurada");

    if (!chatHistories[userPhone]) {
        chatHistories[userPhone] = [];
    }

    // Agregar el mensaje actual del usuario al historial
    chatHistories[userPhone].push({ role: 'user', content: message });

    // Mantener solo los últimos 6 mensajes para no exceder el token limit
    if (chatHistories[userPhone].length > 6) {
        chatHistories[userPhone].shift();
    }

    const messages = [
        { role: 'system', content: SYSTEM_PROMPT },
        ...chatHistories[userPhone]
    ];

    const chatCompletion = await groq.chat.completions.create({
        messages,
        model: 'llama-3.1-8b-instant',
        temperature: 0.1,
        response_format: { type: 'json_object' }
    });

    const responseContent = chatCompletion.choices[0]?.message?.content || "{}";
    
    // Guardar la respuesta del asistente en el historial para contexto futuro
    chatHistories[userPhone].push({ role: 'assistant', content: responseContent });

    return JSON.parse(responseContent);
}

const NATURAL_PROMPT = `Eres un encargado de almacén súper inteligente llamado "Inventor Bot".
El usuario te ha dado una instrucción o pregunta. El sistema de base de datos ya la ejecutó y te ha devuelto los datos crudos.
Tu objetivo es redactar un mensaje final natural, humano, amable y útil (usando emojis moderadamente) basándote en esos datos.
NUNCA menciones que eres una IA o que recibiste un JSON. Actúa como si tú mismo hubieras revisado el almacén o el archivo de registros.

Reglas de Redacción:
- Sé directo, natural y breve (la gente está trabajando, no quiere leer un testamento).
- Si hay resultados de búsqueda, menciónalos de forma amigable (ej: "¡Claro! Tenemos 5 discos en el estante A...").
- Si fue un registro de entrada o salida, confírmalo amablemente (ej: "¡Listo! Ya registré la salida de las 2 cajas. Ahora nos quedan 8 en total.").
- Si los datos dicen "No se encontraron" o el arreglo está vacío, dilo amablemente ("Lo siento, busqué por todos lados pero no encontré nada con ese nombre...").
- Si es una pregunta analítica (ej. qué es lo que más sale, o cuál fue la última salida), analiza los datos del JSON y da la respuesta clara. IMPORTANTE: SIEMPRE menciona el nombre exacto del artículo (ej. "Salió 1 unidad de Tubo PVC", no digas solo "Salió 1 unidad").
- Si es una exportación de documento, confírmale amablemente que aquí le dejas su archivo.`;

async function generateNaturalResponse(userMessage, dbResult) {
    if (!groq) return "No hay IA disponible.";

    // Si es un arreglo de artículos (resultado de búsqueda), formatearlo directamente sin IA
    if (Array.isArray(dbResult) && dbResult.length > 0 && dbResult[0].name) {
        return formatItemListDirectly(dbResult);
    }

    const context = `
Mensaje original del usuario: "${userMessage}"
Resultado crudo de la Base de Datos: ${typeof dbResult === 'string' ? dbResult : JSON.stringify(dbResult)}

Redacta la respuesta final para el usuario:
`;

    // Estimar tokens (~4 chars por token). Si es muy grande, formatear directo.
    const estimatedTokens = context.length / 4;
    if (estimatedTokens > 3000) {
        // Demasiado grande para enviar al LLM, formatear directamente
        if (typeof dbResult === 'string') return dbResult;
        return JSON.stringify(dbResult, null, 2);
    }

    const chatCompletion = await groq.chat.completions.create({
        messages: [
            { role: 'system', content: NATURAL_PROMPT },
            { role: 'user', content: context }
        ],
        model: 'llama-3.3-70b-versatile',
        temperature: 0.6
    });

    return chatCompletion.choices[0]?.message?.content || "Hubo un error al generar la respuesta.";
}

// Formatea listas de artículos directamente sin usar IA (ahorro masivo de tokens)
function formatItemListDirectly(items) {
    const count = items.length;
    const unit = count === 1 ? 'artículo' : 'artículos';
    let msg = `📦 ¡Encontré ${count} ${unit} en el inventario!\n\n`;
    
    items.forEach((item, i) => {
        const qty = item.quantity || 0;
        const loc = item.location && item.location !== 'N/A' ? ` en ${item.location}` : '';
        const cat = item.category ? ` (${item.category})` : '';
        const uMeasure = item.unit ? item.unit.toLowerCase() : (qty === 1 ? 'unidad' : 'unidades');
        let piecesInfo = '';
        if (item.pieces_per_unit && item.pieces_per_unit > 1 && (uMeasure === 'cajas' || uMeasure === 'paquetes' || uMeasure === 'cubetas' || uMeasure === 'rollos')) {
            const sing = uMeasure.endsWith('s') ? uMeasure.slice(0, -1) : uMeasure;
            piecesInfo = ` (${item.pieces_per_unit} piezas por ${sing})`;
        }
        msg += `• *${item.name}*${cat}, ${qty} ${uMeasure}${piecesInfo}${loc}\n`;
    });
    
    msg += `\n¿Necesitas algo más? 😊`;
    return msg;
}

function isAvailable() {
    return groq !== null;
}

module.exports = { processMessage, generateNaturalResponse, isAvailable };
