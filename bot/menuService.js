const dbTools = require("./dbTools");

async function getChatResponse(message, userPhone) {
  const text = message.trim();
  const lowerText = text.toLowerCase();
  
  if (lowerText === '!menu' || lowerText === 'menu' || lowerText === 'ayuda' || lowerText === 'hola') {
    return `¡Hola! Soy tu asistente de inventario automatizado 🤖.\n\n*COMANDOS DISPONIBLES:*\n\n🔍 *buscar [producto]*\nEjemplo: _buscar discos de corte_\n\n📥 *entrada [cantidad] [producto]*\nEjemplo: _entrada 5 discos_\n\n📤 *salida [cantidad] [producto]*\nEjemplo: _salida 2 discos_\n\n📊 *resumen*\nMuestra el total de tu inventario.\n\n_Escribe cualquiera de estos comandos directamente._`;
  }
  
  const buscarMatch = lowerText.match(/^buscar\s+(.+)/);
  if (buscarMatch) {
    const keyword = buscarMatch[1].trim();
    const resultJson = await dbTools.searchItems({ keyword });
    if (resultJson.startsWith("No se encontraron")) return resultJson;
    
    try {
      const items = JSON.parse(resultJson);
      let reply = `🔍 *Resultados para "${keyword}":*\n\n`;
      items.forEach(item => {
        reply += `▪️ *${item.name}* (${item.category})\n   📦 Disponible: ${item.quantity}\n   📍 Ubicación: ${item.location}\n\n`;
      });
      return reply.trim();
    } catch (e) {
      return resultJson;
    }
  }
  
  const entradaMatch = lowerText.match(/^(?:registrar\s+)?entrada\s+(\d+)\s+(.+)/);
  if (entradaMatch) {
    const quantity = parseInt(entradaMatch[1], 10);
    const itemName = entradaMatch[2].trim();
    const result = await dbTools.registerMovement({ itemName, quantity, type: "Entrada", userPhone });
    return `📥 ${result}`;
  }
  
  const salidaMatch = lowerText.match(/^(?:registrar\s+)?salida\s+(\d+)\s+(.+)/);
  if (salidaMatch) {
    const quantity = parseInt(salidaMatch[1], 10);
    const itemName = salidaMatch[2].trim();
    const result = await dbTools.registerMovement({ itemName, quantity, type: "Salida", userPhone });
    return `📤 ${result}`;
  }
  
  if (lowerText === 'resumen') {
    return `📊 ${await dbTools.getInventorySummary()}`;
  }
  
  return `No entendí ese comando 😅.\nEscribe *menu* para ver la lista de comandos disponibles.`;
}

module.exports = {
  getChatResponse
};
