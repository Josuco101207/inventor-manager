const aiService = require('./aiService');
const menuService = require('./menuService');

async function handleMessage(message, userPhone) {
    try {
        console.log(`\n${'='.repeat(60)}`);
        console.log(`[Router Agentic] 📩 Mensaje de ${userPhone}: "${message}"`);
        console.log(`${'='.repeat(60)}`);

        // Intento 1: Groq (con soporte de Function Calling)
        if (aiService.isAvailable()) {
            try {
                console.log('[Router] 🔵 Delegando a Groq Agent...');
                const response = await aiService.processMessage(message, userPhone);
                if (response && response.text) {
                    return response;
                }
            } catch (e) {
                console.error(`[Router] ❌ Error en Groq Agent:`, e.message);
            }
        }

        // Intento 2: Fallback Básico
        console.log('[Router] 🚨 Groq falló o no está disponible. Usando menú básico.');
        const fallbackText = await menuService.getChatResponse(message, userPhone);
        return { text: "⚠️ *Aviso:* La IA principal está fuera de línea. Respuestas limitadas.\n\n" + fallbackText };

    } catch (error) {
        console.error(`[Router] Error fatal:`, error.message);
        const fallbackText = await menuService.getChatResponse(message, userPhone);
        return { text: fallbackText };
    }
}

module.exports = { handleMessage };
