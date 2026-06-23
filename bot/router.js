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
            return await aiService.generateNaturalResponse(message, parsedData);
        }

        if (intent.action === 'entrada' && intent.keyword && intent.quantity) {
            const result = await dbTools.registerMovement({ 
                itemName: intent.keyword, 
                quantity: intent.quantity, 
                type: "Entrada", 
                userPhone 
            });
            return await aiService.generateNaturalResponse(message, result);
        }

        if (intent.action === 'salida' && intent.keyword && intent.quantity) {
            const result = await dbTools.registerMovement({ 
                itemName: intent.keyword, 
                quantity: intent.quantity, 
                type: "Salida", 
                userPhone 
            });
            return await aiService.generateNaturalResponse(message, result);
        }

        if (intent.action === 'resumen') {
            const result = await dbTools.getInventorySummary();
            return await aiService.generateNaturalResponse(message, result);
        }

        if (intent.action === 'unknown' && intent.reply) {
            return `🤖 ${intent.reply}`;
        }

        // Si la IA no entendió bien o faltan datos, pasamos al menú clásico
        throw new Error("Respuesta incompleta de IA");

    } catch (error) {
        console.error(`[AI Router] Error con Llama 3 (${error.message}). Cayendo en Fallback (Menú Clásico).`);
        // Sistema Anti-Caídas: Usar Menú Clásico
        return await menuService.getChatResponse(message, userPhone);
    }
}

module.exports = { handleMessage };
