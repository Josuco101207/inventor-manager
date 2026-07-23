require('dotenv').config();
const readline = require('readline');
const aiService = require('./aiService');
const dbTools = require('./dbTools');

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

async function start() {
    console.log("Iniciando conexión a la Base de Datos...");
    await dbTools.loginToFirebase();
    console.log("¡Conectado! Puedes empezar a chatear con Llama 3.3 70B.");
    console.log("Escribe 'salir' para terminar.\n");
    
    const askQuestion = () => {
        rl.question('Tú: ', async (message) => {
            if (message.toLowerCase() === 'salir') {
                rl.close();
                process.exit(0);
            }
            
            try {
                console.log('Bot: (Pensando...)');
                const response = await aiService.processMessage(message, "TEST_CLI");
                console.log(`Bot: ${response.text}\n`);
                if (response.file) {
                    console.log(`📎 Archivo adjunto: ${response.file}\n`);
                }
            } catch (error) {
                console.error("Error:", error.message);
            }
            
            askQuestion();
        });
    };
    
    askQuestion();
}

start();
