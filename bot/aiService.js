const Groq = require('groq-sdk');
const dbTools = require('./dbTools');

let groq = null;

try {
    if (process.env.GROQ_API_KEY) {
        groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
        console.log('✅ Groq Service inicializado con Function Calling.');
    } else {
        console.log('⚠️ GROQ_API_KEY no configurada. Groq no disponible.');
    }
} catch (e) {
    console.error('Error inicializando Groq SDK:', e);
}

const SYSTEM_PROMPT = `Eres "Inventor Bot", un asistente experto, amable y conversacional para la aplicación "Inventor Manager".
Tu trabajo es responder cualquier pregunta relacionada con el inventario, la aplicación y ayudar a los usuarios de manera natural, fluida y amigable.
ACTÚAS EXACTAMENTE COMO CHATGPT O GEMINI, pero estás conectado a los datos de la empresa.

REGLAS CRÍTICAS:
1. **SOLO LECTURA:** Eres un asistente de SOLO CONSULTAS. NO puedes registrar entradas, salidas, ni modificar la base de datos.
2. Si un usuario te pide hacer una entrada o salida (ej: "registra 5 coples", "metí 2 lonas", "saca un taladro"), explícale amablemente que solo tienes permisos para consultar información, y que las entradas y salidas deben registrarse manualmente en la aplicación web de Inventor Manager.
3. Puedes buscar productos usando la herramienta 'searchItems'. Puedes filtrar por nombre, categoría, grupo y ubicación.
4. Si el usuario hace una pregunta general ("¿qué es esta app?", "¿cómo funciona?"), respóndele conversacionalmente basándote en tu conocimiento:
   - Inventor Manager es un sistema para controlar el stock, préstamos de herramientas y activos.
   - Las tablets y herramientas se prestan a los trabajadores y hay reglas estrictas para devolverlas al almacén.
5. Usa emojis moderadamente para ser amigable. Responde de manera concisa y directa.
6. Cuando uses la herramienta de buscar y encuentres artículos, diles la cantidad exacta y ubicación.
7. IMPORTANTE: Usa SIEMPRE el formato estándar de tool_calls. NUNCA uses etiquetas XML como <function=...>.`;

// Definición de herramientas para Groq
const tools = [
    {
        type: "function",
        function: {
            name: "searchItems",
            description: "Busca artículos en el inventario. Permite filtrar por nombre, categoría, grupo o ubicación. Úsalo cuando el usuario pregunte si hay un producto, cuántos hay, o pida listas de una categoría.",
            parameters: {
                type: "object",
                properties: {
                    keyword: { type: "string", description: "Palabra clave general o nombre del producto (ej: 'coples', 'taladro')" },
                    category: { type: "string", description: "Categoría específica (ej: 'herreria', 'papeleria')" },
                    grupo: { type: "string", description: "Grupo específico" },
                    location: { type: "string", description: "Ubicación o estante" }
                }
            }
        }
    },
    {
        type: "function",
        function: {
            name: "getInventorySummary",
            description: "Obtiene un resumen general de cuántos productos y unidades totales existen en el inventario.",
            parameters: { type: "object", properties: {} }
        }
    },
    {
        type: "function",
        function: {
            name: "analyzeMovements",
            description: "Analiza el historial de movimientos (entradas, salidas, quién lo hizo y cuándo). Úsalo cuando pregunten 'quién se llevó', 'cuál fue la última salida', 'qué pasó con', etc.",
            parameters: {
                type: "object",
                properties: {
                    question: { type: "string", description: "La pregunta de análisis para contexto adicional" }
                }
            }
        }
    },
    {
        type: "function",
        function: {
            name: "generateExport",
            description: "Genera un reporte del inventario en formato PDF o Excel. Úsalo cuando pidan explícitamente un documento o reporte descargable.",
            parameters: {
                type: "object",
                properties: {
                    format: { type: "string", enum: ["pdf", "excel"], description: "Formato del documento" },
                    filterKeyword: { type: "string", description: "Filtro opcional para el reporte (ej: si piden reporte de 'lonas')" }
                },
                required: ["format"]
            }
        }
    }
];

// Ejecutor de herramientas
async function executeTool(toolCall) {
    const functionName = toolCall.function.name;
    const args = JSON.parse(toolCall.function.arguments || "{}");
    console.log(`[Groq Tool Calling] Ejecutando: ${functionName} con argumentos:`, args);

    try {
        if (functionName === 'searchItems') {
            return await dbTools.searchItems(args);
        } else if (functionName === 'getInventorySummary') {
            return await dbTools.getInventorySummary();
        } else if (functionName === 'analyzeMovements') {
            return await dbTools.analyzeMovements(args.question);
        } else if (functionName === 'generateExport') {
            const filePath = await dbTools.generateExport(args.format, args.filterKeyword);
            if (filePath) {
                return JSON.stringify({ success: true, message: `Reporte generado exitosamente.`, filePath });
            }
            return JSON.stringify({ success: false, message: "No se encontraron datos para generar el reporte." });
        }
        return JSON.stringify({ error: "Función desconocida" });
    } catch (e) {
        console.error(`[Groq Tool] Error ejecutando ${functionName}:`, e);
        return JSON.stringify({ error: e.message });
    }
}

const chatHistories = {};

async function processMessage(message, userPhone = 'default') {
    if (!groq) throw new Error("Groq API Key no configurada");

    if (!chatHistories[userPhone]) {
        chatHistories[userPhone] = [
            { role: 'system', content: SYSTEM_PROMPT }
        ];
    }

    // Limpieza agresiva de historial:
    // Filtramos para mantener SOLO mensajes de usuario y respuestas finales del asistente.
    // Esto elimina los JSONs gigantes de las herramientas de turnos anteriores.
    const cleanHistory = chatHistories[userPhone].filter(m => {
        if (m.role === 'system') return true;
        if (m.role === 'user') return true;
        if (m.role === 'assistant' && !m.tool_calls && m.content) return true;
        return false;
    });

    if (cleanHistory.length > 5) {
        const system = cleanHistory[0];
        const recent = cleanHistory.slice(-4); // Últimas 2 preguntas y 2 respuestas
        chatHistories[userPhone] = [system, ...recent];
    } else {
        chatHistories[userPhone] = cleanHistory;
    }

    chatHistories[userPhone].push({ role: 'user', content: message });

    let finalResponse = { text: "Hubo un problema al procesar tu solicitud." };
    let iterations = 0;
    const MAX_ITERATIONS = 3; // Evitar loops infinitos de tool calling

    while (iterations < MAX_ITERATIONS) {
        iterations++;
        
        const chatCompletion = await groq.chat.completions.create({
            messages: chatHistories[userPhone],
            model: 'llama-3.1-8b-instant',
            temperature: 0.1,
            tools: tools,
            tool_choice: "auto"
        });

        const responseMessage = chatCompletion.choices[0].message;
        chatHistories[userPhone].push(responseMessage);

        // Si la IA decide llamar a una herramienta
        if (responseMessage.tool_calls) {
            for (const toolCall of responseMessage.tool_calls) {
                const toolResultString = await executeTool(toolCall);
                
                // Extraer si hubo un archivo generado
                try {
                    const parsed = JSON.parse(toolResultString);
                    if (parsed.filePath) {
                        finalResponse.file = parsed.filePath;
                    }
                } catch(e) {}

                chatHistories[userPhone].push({
                    tool_call_id: toolCall.id,
                    role: "tool",
                    name: toolCall.function.name,
                    content: toolResultString,
                });
            }
            // El loop continúa, la IA verá los resultados y generará la respuesta final
        } else {
            // No hay llamadas a herramientas, la IA generó texto final
            finalResponse.text = responseMessage.content;
            break; // Salir del loop
        }
    }

    return finalResponse;
}

function isAvailable() {
    return groq !== null;
}

module.exports = { processMessage, isAvailable };
