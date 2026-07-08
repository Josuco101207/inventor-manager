require('dotenv').config();
const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const dbTools = require('./dbTools');
const router = require('./router');
const { initTelegramBot } = require('./telegram');
const { initAlertService } = require('./alertService');
const express = require('express');

const app = express();
const PORT = process.env.PORT || 3000;

// Ruta de ping para mantener despierto el servidor en Render
app.get('/ping', (req, res) => {
    res.send('pong');
});

let latestQR = null;
let isConnected = false;

app.get('/qr', (req, res) => {
    if (isConnected) {
        return res.send('<h1>✅ ¡Ya estás conectado! No necesitas escanear el QR.</h1>');
    }
    if (!latestQR) {
        return res.send('<h1>⏳ Esperando a que se genere el Código QR... recarga esta página en 10 segundos.</h1>');
    }
    const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=400x400&data=${encodeURIComponent(latestQR)}`;
    res.send(`
        <html>
            <body style="display:flex; justify-content:center; align-items:center; height:100vh; background:#f0f0f0; margin:0; font-family:sans-serif;">
                <div style="text-align:center; background:white; padding:40px; border-radius:10px; box-shadow:0 0 20px rgba(0,0,0,0.1);">
                    <h2 style="color:#25D366; margin-top:0;">WhatsApp Bot</h2>
                    <p>Abre WhatsApp en tu celular y escanea este código:</p>
                    <img src="${qrUrl}" alt="Código QR" style="border: 2px solid #ccc; padding: 10px; border-radius: 10px; margin: 20px 0;" />
                    <p style="color:#666; font-size:14px;">Si el código expira, recarga esta página.</p>
                </div>
            </body>
        </html>
    `);
});

app.listen(PORT, () => {
    console.log(`✅ Servidor Express iniciado en el puerto ${PORT}`);
});

async function startBot() {
    console.log('Iniciando sesión en Firebase...');
    await dbTools.loginToFirebase();

    // Auto-limpieza de Chromium en caso de cierre forzado
    const fs = require('fs');
    const path = require('path');
    const lockFiles = ['SingletonLock', 'SingletonCookie', 'SingletonSocket'];
    lockFiles.forEach(file => {
        const lockPath = path.join(__dirname, '.wwebjs_auth', 'session', file);
        try {
            fs.rmSync(lockPath, { force: true });
        } catch(e) {}
    });

    console.log('Iniciando el Bot de Inventario (Multi-IA v2.0)...');
    console.log('🧠 Cascada de IA: Motor Propio → Groq → Gemini → Ollama → Menú');

    // Inicializar Ollama (verificar conexión y descargar modelo si es necesario)
    const ollamaService = require('./ollamaService');
    ollamaService.init().catch(e => console.log('[Ollama] Init en background:', e.message));

    // Iniciar Telegram
    initTelegramBot();

    if (process.env.DISABLE_WHATSAPP !== 'true') {
        // Usamos LocalAuth para que la sesión se guarde en la carpeta .wwebjs_auth
        const client = new Client({
            authStrategy: new LocalAuth(),
            puppeteer: {
                executablePath: process.platform === 'linux' ? '/usr/bin/chromium' : undefined,
                args: [
                    '--no-sandbox', 
                    '--disable-setuid-sandbox',
                    '--disable-dev-shm-usage',
                    '--disable-accelerated-2d-canvas',
                    '--no-first-run',
                    '--no-zygote',
                    '--disable-gpu'
                ]
            },
            webVersionCache: {
                type: 'none'
            }
        });

        client.on('qr', (qr) => {
            latestQR = qr;
            console.log('\n======================================================');
            console.log('ESCANEA ESTE CÓDIGO QR CON TU WHATSAPP PARA VINCULAR EL BOT');
            console.log('Ve a WhatsApp > Dispositivos Vinculados > Vincular un dispositivo');
            console.log('======================================================\n');
            console.log('>>> ¡NUEVA OPCIÓN MÁS FÁCIL! Abre tu navegador de internet y entra a:');
            console.log(`>>> http://<IP-DE-TU-NAS>:3000/qr`);
            console.log('======================================================\n');
            qrcode.generate(qr, {small: true});
        });

        client.on('ready', async () => {
            isConnected = true;
            latestQR = null;
            console.log('\n======================================================');
            console.log('✅ ¡EL BOT ESTÁ LISTO Y CONECTADO A TU WHATSAPP!');
            console.log('======================================================\n');
            
            // Inicializar servicio de alertas
            initAlertService(client);
        });

        client.on('message', async msg => {
            try {
                // Ignorar estados de WhatsApp
                if (msg.isStatus) return;

                // Si el mensaje viene de un grupo, SOLO responder si etiquetan al bot
                if (msg.from.includes('@g.us')) {
                    const shortPhone = client.info.wid.user.slice(-10); 
                    
                    // msg.getMentions() obtiene los contactos reales. Así superamos el problema de los LIDs (IDs anónimos).
                    const mentions = await msg.getMentions();
                    let isMentioned = false;
                    
                    if (mentions && mentions.length > 0) {
                        // isMe es true si el contacto etiquetado es el propio bot
                        isMentioned = mentions.some(contact => contact.isMe);
                    }
                    
                    // Fallback: por si escribieron el número a mano sin etiquetar oficialmente
                    if (!isMentioned) {
                        isMentioned = msg.body.replace(/[\s\+\-]/g, '').includes(`@52${shortPhone}`) ||
                                      msg.body.replace(/[\s\+\-]/g, '').includes(`@521${shortPhone}`);
                    }
                                        
                    if (!isMentioned) {
                        return; // Ignorar si no etiquetaron al bot
                    }
                }

                let incomingMessage = msg.body;
                
                // Si es en un grupo, limpiamos el texto para quitar la etiqueta (ej. "@5218146810645 dame el reporte")
                if (msg.from.includes('@g.us')) {
                    incomingMessage = incomingMessage.replace(/@\d+\s*/g, '').trim();
                }

                // El remitente original del mensaje (quién lo mandó dentro del grupo, o en chat privado)
                // En grupos, msg.author tiene el número del usuario, en privados msg.from lo tiene
                const senderId = msg.author || msg.from;
                const phoneNumber = senderId.split('@')[0];

                // Comando secreto para auto-autorizarse
                if (incomingMessage === "!registrarme") {
                    const success = await dbTools.autorizarNumero(phoneNumber);
                    if (success) {
                        msg.reply("✅ Tu cuenta ha sido registrada exitosamente. Ya puedes consultar el inventario.");
                    } else {
                        msg.reply("❌ Hubo un error al registrar tu cuenta.");
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
                    try {
                        const media = MessageMedia.fromFilePath(response.file);
                        await client.sendMessage(msg.from, media, { sendMediaAsDocument: true });
                    } catch (fileError) {
                        console.error("Error al enviar el archivo adjunto:", fileError);
                        msg.reply("Hubo un problema al adjuntar el archivo, pero fue generado correctamente.");
                    }
                }

            } catch (error) {
                console.error("Error al procesar el mensaje:", error);
                msg.reply("Lo siento, hubo un error interno al procesar tu solicitud.");
            }
        });

        client.initialize();
    } else {
        console.log('⚠️ Módulo de WhatsApp desactivado. Solo funcionando en Telegram.');
    }
}

startBot().catch(console.error);
