require('dotenv').config();
const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const dbTools = require('./dbTools');
const router = require('./router');
const { initTelegramBot } = require('./telegram');
const express = require('express');

const app = express();
const PORT = process.env.PORT || 3000;

// Ruta de ping para mantener despierto el servidor en Render
app.get('/ping', (req, res) => {
    res.send('pong');
});

app.listen(PORT, () => {
    console.log(`✅ Servidor Express iniciado en el puerto ${PORT}`);
});

async function startBot() {
    console.log('Iniciando sesión en Firebase...');
    await dbTools.loginToFirebase();

    console.log('Iniciando el Bot de Inventario (Dual)...');

    // Iniciar Telegram
    initTelegramBot();

    // Usamos LocalAuth para que la sesión se guarde en la carpeta .wwebjs_auth
    const client = new Client({
        authStrategy: new LocalAuth(),
        puppeteer: {
            args: [
                '--no-sandbox', 
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-accelerated-2d-canvas',
                '--no-first-run',
                '--no-zygote',
                '--single-process',
                '--disable-gpu'
            ]
        },
        webVersionCache: {
            type: 'remote',
            strict: true
        }
    });

    client.on('qr', (qr) => {
        console.log('\n======================================================');
        console.log('ESCANEA ESTE CÓDIGO QR CON TU WHATSAPP PARA VINCULAR EL BOT');
        console.log('Ve a WhatsApp > Dispositivos Vinculados > Vincular un dispositivo');
        console.log('======================================================\n');
        qrcode.generate(qr, {small: true});
    });

    client.on('ready', async () => {
        console.log('\n======================================================');
        console.log('✅ ¡EL BOT ESTÁ LISTO Y CONECTADO A TU WHATSAPP!');
        console.log('======================================================\n');
    });

client.on('message', async msg => {
    try {
        // Ignorar estados y mensajes de grupos
        if (msg.isStatus || msg.from.includes('@g.us')) return;

        const incomingMessage = msg.body;
        const phoneNumber = msg.from.split('@')[0];

        // Comando secreto para auto-autorizarse
        if (incomingMessage === "!registrarme") {
            const success = await dbTools.autorizarNumero(phoneNumber);
            if (success) {
                msg.reply("✅ Tu número ha sido registrado exitosamente. Ya puedes consultar el inventario.");
            } else {
                msg.reply("❌ Hubo un error al registrar tu número.");
            }
            return;
        }

        // Verificar autorización
        const isAuth = await dbTools.isAuthorizedUser(phoneNumber);
        
        let response = { text: "" };

        if (!isAuth) {
            console.log(`Intento no autorizado desde ${phoneNumber}`);
            response.text = "Lo siento, tu número no está autorizado. Para autorizarte, envía el mensaje: !registrarme";
        } else {
            console.log(`Procesando mensaje de ${phoneNumber}: ${incomingMessage}`);
            response = await router.handleMessage(incomingMessage, phoneNumber);
        }

        // Enviar la respuesta de texto
        await msg.reply(response.text);

        // Si hay archivo, enviarlo
        if (response.file) {
            const media = MessageMedia.fromFilePath(response.file);
            await client.sendMessage(msg.from, media);
        }

    } catch (error) {
        console.error("Error al procesar el mensaje:", error);
    }
});

    client.initialize();
}

startBot().catch(console.error);
