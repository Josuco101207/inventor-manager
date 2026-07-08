/**
 * Ollama Service v1.0
 * Servicio de IA local usando Ollama (sin límites)
 * Tercer nivel de la cascada de IA - corre en el NAS
 */

const OLLAMA_HOST = process.env.OLLAMA_HOST || 'http://ollama:11434';
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'llama3.2:3b';

let ollamaReady = false;
let modelPulled = false;

const SYSTEM_PROMPT = `Eres un asistente de inventario. Interpreta el mensaje del usuario y devuelve SOLO un objeto JSON.

Acciones: "buscar", "entrada", "salida", "resumen", "analisis", "exportar", "unknown".

Formatos:
{"action":"buscar","keyword":"producto"}
{"action":"entrada","keyword":"producto","quantity":5}
{"action":"salida","keyword":"producto","quantity":3}
{"action":"resumen"}
{"action":"analisis","question":"pregunta del usuario"}
{"action":"exportar","format":"pdf","filter":"keyword_o_null"}
{"action":"unknown","reply":"respuesta amable"}

Reglas: extrae keywords limpias, cantidades como número, tolera errores de ortografía. SOLO JSON.`;

const chatHistories = {};

// Inicialización: verificar que Ollama está corriendo y tiene el modelo
async function init() {
    try {
        console.log(`[Ollama] Verificando conexión a ${OLLAMA_HOST}...`);
        const response = await fetch(`${OLLAMA_HOST}/api/tags`, { 
            signal: AbortSignal.timeout(5000)
        });
        
        if (!response.ok) throw new Error('Ollama no responde');
        
        const data = await response.json();
        const models = data.models || [];
        const hasModel = models.some(m => m.name.includes('llama3.2'));
        
        if (hasModel) {
            console.log(`[Ollama] ✅ Modelo ${OLLAMA_MODEL} encontrado y listo.`);
            ollamaReady = true;
            modelPulled = true;
        } else {
            console.log(`[Ollama] ⬇️ Descargando modelo ${OLLAMA_MODEL} (~2 GB)... Esto tardará unos minutos la primera vez.`);
            pullModel();
        }
    } catch (e) {
        console.log(`[Ollama] ⚠️ No se pudo conectar a Ollama (${e.message}). Se reintentará después.`);
    }
}

async function pullModel() {
    try {
        const response = await fetch(`${OLLAMA_HOST}/api/pull`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: OLLAMA_MODEL, stream: false }),
        });
        
        if (response.ok) {
            console.log(`[Ollama] ✅ Modelo ${OLLAMA_MODEL} descargado exitosamente.`);
            ollamaReady = true;
            modelPulled = true;
        }
    } catch (e) {
        console.error(`[Ollama] ❌ Error descargando modelo: ${e.message}`);
    }
}

async function processMessage(message, userPhone = 'default') {
    if (!ollamaReady) {
        // Intentar reconectar
        await init();
        if (!ollamaReady) throw new Error('Ollama no disponible');
    }

    if (!chatHistories[userPhone]) chatHistories[userPhone] = [];
    chatHistories[userPhone].push({ role: 'user', content: message });
    if (chatHistories[userPhone].length > 6) chatHistories[userPhone].shift();

    const messages = [
        { role: 'system', content: SYSTEM_PROMPT },
        ...chatHistories[userPhone]
    ];

    const response = await fetch(`${OLLAMA_HOST}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            model: OLLAMA_MODEL,
            messages: messages,
            stream: false,
            format: 'json',
            options: { temperature: 0.1 }
        }),
        signal: AbortSignal.timeout(30000) // 30 seg timeout para CPU
    });

    if (!response.ok) throw new Error(`Ollama HTTP ${response.status}`);

    const data = await response.json();
    const content = data.message?.content || '{}';
    const result = JSON.parse(content);

    chatHistories[userPhone].push({ role: 'assistant', content: JSON.stringify(result) });
    if (chatHistories[userPhone].length > 6) chatHistories[userPhone].shift();

    return result;
}

async function generateNaturalResponse(userMessage, dbResult) {
    if (!ollamaReady) return null;

    const prompt = `Mensaje del usuario: "${userMessage}"
Datos: ${typeof dbResult === 'string' ? dbResult : JSON.stringify(dbResult)}
Redacta una respuesta breve, natural y amable como encargado de almacén. Usa emojis moderadamente.`;

    try {
        const response = await fetch(`${OLLAMA_HOST}/api/chat`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: OLLAMA_MODEL,
                messages: [
                    { role: 'system', content: 'Eres un encargado de almacén amable. Responde de forma natural y breve. Nunca menciones IA ni JSON.' },
                    { role: 'user', content: prompt }
                ],
                stream: false,
                options: { temperature: 0.6 }
            }),
            signal: AbortSignal.timeout(30000)
        });

        if (!response.ok) return null;
        const data = await response.json();
        return data.message?.content || null;
    } catch (e) {
        return null;
    }
}

function isAvailable() {
    return ollamaReady;
}

module.exports = { init, processMessage, generateNaturalResponse, isAvailable };
