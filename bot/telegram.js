require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const dbTools = require('./dbTools');
const router = require('./router');

function initTelegramBot() {
    const token = process.env.TELEGRAM_TOKEN;
    if (!token) {
        console.log('⚠️ No se encontró TELEGRAM_TOKEN en .env. El bot de Telegram no se iniciará.');
        return;
    }

    const bot = new TelegramBot(token, { polling: true });
    console.log('✅ Bot de Telegram iniciado.');

    bot.on('message', async (msg) => {
        try {
            const chatId = msg.chat.id;
            const text = msg.text || '';
            const phoneNumber = msg.from.username || msg.from.id.toString();

            // Comando secreto para auto-autorizarse
            if (text === "!registrarme") {
                const success = await dbTools.autorizarNumero(phoneNumber);
                if (success) {
                    bot.sendMessage(chatId, "✅ Tu cuenta ha sido registrada exitosamente. Ya puedes consultar el inventario.");
                } else {
                    bot.sendMessage(chatId, "❌ Hubo un error al registrar tu cuenta.");
                }
                return;
            }

            // Verificar autorización
            const isAuth = await dbTools.isAuthorizedUser(phoneNumber);
            
            if (!isAuth) {
                console.log(`Intento no autorizado en Telegram desde ${phoneNumber}`);
                bot.sendMessage(chatId, "Lo siento, tu cuenta no está autorizada. Para autorizarte, envía el mensaje: !registrarme");
                return;
            }

            console.log(`Procesando mensaje de Telegram de ${phoneNumber}: ${text}`);
            const response = await router.handleMessage(text, phoneNumber);
            
            await bot.sendMessage(chatId, response.text, { parse_mode: 'Markdown' });
            if (response.file) {
                await bot.sendDocument(chatId, response.file);
            }

        } catch (error) {
            console.error("Error al procesar el mensaje de Telegram:", error);
            bot.sendMessage(msg.chat.id, "Hubo un error interno al procesar tu solicitud.");
        }
    });

    bot.on("polling_error", console.log);
}

module.exports = { initTelegramBot };
