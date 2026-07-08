/**
 * Router Inteligente v2.0 — Cascada de 5 Niveles
 * 
 * Nivel 0: Motor Propio (instantáneo, 0 tokens)
 * Nivel 1: Groq (cloud, rápido)
 * Nivel 2: Gemini (cloud, inteligente)
 * Nivel 3: Ollama (local, sin límites)
 * Nivel 4: Menú Clásico (emergencia, con aviso)
 */

const intentEngine = require('./intentEngine');
const aiService = require('./aiService');
const geminiService = require('./geminiService');
const ollamaService = require('./ollamaService');
const menuService = require('./menuService');
const dbTools = require('./dbTools');

// ==================== FORMATEO DIRECTO (0 TOKENS) ====================

function formatItemList(items) {
    if (!Array.isArray(items) || items.length === 0) {
        return '🔍 No encontré artículos con esa descripción. Verifica que el nombre esté bien escrito.';
    }
    const count = items.length;
    let msg = `📦 ¡Encontré ${count} ${count === 1 ? 'artículo' : 'artículos'} en el inventario!\n\n`;
    items.forEach(item => {
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

function formatMovementConfirmation(result) {
    // Si el resultado ya es un string (del dbTools), devolverlo directamente
    if (typeof result === 'string') return `📝 ${result}`;
    return `📝 ${JSON.stringify(result)}`;
}

function formatSummary(result) {
    if (typeof result === 'string') return `📊 ${result}`;
    return `📊 ${JSON.stringify(result)}`;
}

// ==================== EJECUTOR DE INTENCIONES ====================

async function executeIntent(intent, message, userPhone, aiSource) {
    const sourceTag = aiSource ? ` [${aiSource}]` : ' [Motor Propio]';
    console.log(`[Router]${sourceTag} Ejecutando: ${intent.action}`);

    try {
        // BUSCAR
        if (intent.action === 'buscar' && intent.keyword) {
            const rawData = await dbTools.searchItems({ keyword: intent.keyword });
            let parsedData = rawData;
            try { parsedData = JSON.parse(rawData); } catch (e) {}
            if (Array.isArray(parsedData)) {
                return { text: formatItemList(parsedData) };
            }
            return { text: rawData }; // Mensaje de error del dbTools
        }

        // ENTRADA
        if (intent.action === 'entrada' && intent.keyword && intent.quantity) {
            const result = await dbTools.registerMovement({
                itemName: intent.keyword,
                quantity: intent.quantity,
                type: "Entrada",
                userPhone
            });
            return { text: formatMovementConfirmation(result) };
        }

        // SALIDA
        if (intent.action === 'salida' && intent.keyword && intent.quantity) {
            const result = await dbTools.registerMovement({
                itemName: intent.keyword,
                quantity: intent.quantity,
                type: "Salida",
                userPhone
            });
            return { text: formatMovementConfirmation(result) };
        }

        // RESUMEN
        if (intent.action === 'resumen') {
            const result = await dbTools.getInventorySummary();
            return { text: formatSummary(result) };
        }

        // ANÁLISIS (este sí puede beneficiarse de IA para interpretar los datos)
        if (intent.action === 'analisis' && intent.question) {
            const result = await dbTools.analyzeMovements(intent.question);
            // Intentar que la IA interprete los datos, si no, devolver crudo
            const naturalResponse = await tryGenerateNaturalResponse(message, result);
            return { text: naturalResponse || formatSummary(result) };
        }

        // EXPORTAR
        if (intent.action === 'exportar') {
            let format = 'pdf';
            if (intent.format && intent.format.toLowerCase().includes('excel')) format = 'excel';
            if (intent.format && intent.format.toLowerCase().includes('xlsx')) format = 'excel';

            const filter = intent.filter && intent.filter !== 'palabra_clave_para_filtrar_o_nulo' ? intent.filter : null;
            const filePath = await dbTools.generateExport(format, filter);

            if (filePath) {
                return {
                    text: `📄 ¡Listo! Aquí tienes tu ${format.toUpperCase()}${filter ? ' de ' + filter : ''}. 📎`,
                    file: filePath
                };
            }
            return { text: `❌ No encontré artículos${filter ? ' de "' + filter + '"' : ''} para generar el reporte.` };
        }

        // UNKNOWN con respuesta (saludo, etc.)
        if (intent.action === 'unknown' && intent.reply) {
            return { text: `🤖 ${intent.reply}` };
        }

        // Si llegamos aquí, la intención no tiene datos suficientes
        throw new Error('Intención incompleta');

    } catch (error) {
        console.error(`[Router] Error ejecutando intención ${intent.action}:`, error.message);
        throw error;
    }
}

// ==================== CASCADA DE IA PARA RESPUESTAS NATURALES ====================

async function tryGenerateNaturalResponse(message, dbResult) {
    // Intentar con Groq
    try {
        const resp = await aiService.generateNaturalResponse(message, dbResult);
        if (resp) return resp;
    } catch (e) {}

    // Intentar con Gemini
    try {
        const resp = await geminiService.generateNaturalResponse(message, dbResult);
        if (resp) return resp;
    } catch (e) {}

    // Intentar con Ollama
    try {
        const resp = await ollamaService.generateNaturalResponse(message, dbResult);
        if (resp) return resp;
    } catch (e) {}

    return null; // Todas fallaron, el caller usará formateo directo
}

// ==================== CASCADA DE IA PARA INTENCIONES ====================

async function cascadeProcessMessage(message, userPhone) {
    const errors = [];

    // Nivel 1: Groq
    try {
        console.log('[Cascade] 🔵 Intentando con Groq...');
        const intent = await aiService.processMessage(message, userPhone);
        if (intent && intent.action) {
            console.log('[Cascade] ✅ Groq respondió:', intent.action);
            return { intent, source: 'Groq' };
        }
    } catch (e) {
        errors.push(`Groq: ${e.message}`);
        console.log(`[Cascade] ❌ Groq falló: ${e.message}`);
    }

    // Nivel 2: Gemini
    try {
        console.log('[Cascade] 🟡 Intentando con Gemini...');
        const intent = await geminiService.processMessage(message, userPhone);
        if (intent && intent.action) {
            console.log('[Cascade] ✅ Gemini respondió:', intent.action);
            return { intent, source: 'Gemini' };
        }
    } catch (e) {
        errors.push(`Gemini: ${e.message}`);
        console.log(`[Cascade] ❌ Gemini falló: ${e.message}`);
    }

    // Nivel 3: Ollama
    try {
        console.log('[Cascade] 🟠 Intentando con Ollama local...');
        const intent = await ollamaService.processMessage(message, userPhone);
        if (intent && intent.action) {
            console.log('[Cascade] ✅ Ollama respondió:', intent.action);
            return { intent, source: 'Ollama' };
        }
    } catch (e) {
        errors.push(`Ollama: ${e.message}`);
        console.log(`[Cascade] ❌ Ollama falló: ${e.message}`);
    }

    // Todas las IAs fallaron
    return { intent: null, source: null, errors };
}

// ==================== HANDLER PRINCIPAL ====================

async function handleMessage(message, userPhone) {
    try {
        console.log(`\n${'='.repeat(60)}`);
        console.log(`[Router] 📩 Mensaje de ${userPhone}: "${message}"`);
        console.log(`${'='.repeat(60)}`);

        // ===== NIVEL 0: Motor Propio (instantáneo) =====
        const engineResult = intentEngine.detectIntent(message, userPhone);
        console.log(`[Motor Propio] Intención: ${engineResult.action}, Confianza: ${engineResult.confidence}`);

        if (engineResult.confidence === 'high') {
            console.log('[Router] ⚡ Motor Propio resolvió con confianza alta');
            return await executeIntent(engineResult, message, userPhone, null);
        }

        if (engineResult.confidence === 'medium') {
            // Confianza media: ejecutar pero avisar
            console.log('[Router] ⚡ Motor Propio resolvió con confianza media');
            try {
                return await executeIntent(engineResult, message, userPhone, null);
            } catch (e) {
                console.log('[Router] Motor Propio falló en ejecución, escalando a IA...');
            }
        }

        // ===== NIVELES 1-3: Cascada de IAs =====
        console.log('[Router] 🧠 Motor Propio no entendió, escalando a cascada de IA...');
        const { intent, source, errors } = await cascadeProcessMessage(message, userPhone);

        if (intent && intent.action) {
            return await executeIntent(intent, message, userPhone, source);
        }

        // ===== NIVEL 4: Menú Clásico (con aviso) =====
        console.log('[Router] 🚨 TODAS las IAs fallaron. Usando menú clásico.');
        const errorDetails = errors ? errors.join(' | ') : 'desconocido';
        console.log(`[Router] Errores: ${errorDetails}`);

        const warning = '⚠️ *Aviso:* Los 3 servicios de IA están temporalmente fuera de línea:\n' +
                        '• Groq (nube) ❌\n' +
                        '• Gemini (nube) ❌\n' +
                        '• Ollama (local) ❌\n\n' +
                        'Usando el menú básico mientras se restauran:\n\n';

        const fallbackText = await menuService.getChatResponse(message, userPhone);
        return { text: warning + fallbackText };

    } catch (error) {
        console.error(`[Router] Error fatal:`, error.message);
        const fallbackText = await menuService.getChatResponse(message, userPhone);
        return { text: fallbackText };
    }
}

module.exports = { handleMessage };
