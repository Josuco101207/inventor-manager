const aiService = require('./aiService');
const menuService = require('./menuService');
const dbTools = require('./dbTools');

async function handleMessage(message, userPhone) {
    try {
        // Intentar procesar con Llama 3 (Groq)
        console.log(`[AI Router] Consultando a Llama 3...`);
        const intent = await aiService.processMessage(message);
        console.log(`[AI Router] Intención detectada:`, intent);

        if (intent.action === 'buscar' && intent.keyword) {
            const rawData = await dbTools.searchItems({ keyword: intent.keyword });
            let parsedData = rawData;
            try { parsedData = JSON.parse(rawData); } catch (e) {}
            const textResponse = await aiService.generateNaturalResponse(message, parsedData);
            return { text: textResponse };
        }

        if (intent.action === 'entrada' && intent.keyword && intent.quantity) {
            const result = await dbTools.registerMovement({ 
                itemName: intent.keyword, 
                quantity: intent.quantity, 
                type: "Entrada", 
                userPhone 
            });
            const textResponse = await aiService.generateNaturalResponse(message, result);
            return { text: textResponse };
        }

        if (intent.action === 'salida' && intent.keyword && intent.quantity) {
            const result = await dbTools.registerMovement({ 
                itemName: intent.keyword, 
                quantity: intent.quantity, 
                type: "Salida", 
                userPhone 
            });
            const textResponse = await aiService.generateNaturalResponse(message, result);
            return { text: textResponse };
        }

        if (intent.action === 'resumen') {
            const result = await dbTools.getInventorySummary();
            const textResponse = await aiService.generateNaturalResponse(message, result);
            return { text: textResponse };
        }

        if (intent.action === 'analisis' && intent.question) {
            const result = await dbTools.analyzeMovements(intent.question);
            const textResponse = await aiService.generateNaturalResponse(message, result);
            return { text: textResponse };
        }

        if (intent.action === 'exportar') {
            let format = 'pdf'; // Default
            if (intent.format && intent.format.toLowerCase().includes('excel')) format = 'excel';
            if (intent.format && intent.format.toLowerCase().includes('xlsx')) format = 'excel';

            const filePath = await dbTools.generateExport(format);
            const textResponse = await aiService.generateNaturalResponse(message, `Se generó el archivo en formato ${format} exitosamente.`);
            
            if (filePath) {
                return { text: textResponse, file: filePath };
            } else {
                return { text: "Hubo un problema al generar el archivo. Por favor intenta de nuevo." };
            }
        }

        if (intent.action === 'unknown' && intent.reply) {
            return { text: `🤖 ${intent.reply}` };
        }

        // Si la IA no entendió bien o faltan datos, pasamos al menú clásico
        throw new Error("Respuesta incompleta de IA");

    } catch (error) {
        console.error(`[AI Router] Error con Llama 3 (${error.message}). Cayendo en Fallback (Menú Clásico).`);
        // Sistema Anti-Caídas: Usar Menú Clásico
        const fallbackText = await menuService.getChatResponse(message, userPhone);
        return { text: fallbackText };
    }
}

module.exports = { handleMessage };
