const { GoogleGenerativeAI } = require("@google/generative-ai");
require("dotenv").config({ path: "C:\\Users\\infra\\Desktop\\Inventor Manager\\bot\\.env" });

async function run() {
  try {
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash-latest" });
    const result = await model.generateContent("Hola");
    console.log("gemini-1.5-flash-latest funciona! Respuesta:", result.response.text());
  } catch (e) {
    console.error("Error con gemini-1.5-flash-latest:", e.message);
  }
}
run();
