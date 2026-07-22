const express = require("express");
const router = express.Router();
const { defineSecret } = require("firebase-functions/params");

// Declaramos el secreto para poder acceder a su valor
const geminiKey = defineSecret("GEMINI_KEY");

router.post("/scan", async (req, res) => {
  try {
    const { base64Image } = req.body;
    
    // Leemos la API key desde Secret Manager o variables de entorno (local)
    const apiKey = geminiKey.value() || process.env.GEMINI_KEY;

    if (!apiKey) {
      return res.status(500).json({ error: "Gemini API key no está configurada en los secretos de Firebase." });
    }

    if (!base64Image) {
      return res.status(400).json({ error: "Falta el campo base64Image en la petición." });
    }

    const base64Data = base64Image.split(',')[1] || base64Image;

    const payload = {
      contents: [
        {
          parts: [
            {
              text: `Eres un asistente experto en inventarios y reconocimiento óptico.
Analiza la siguiente imagen (que puede ser una factura, un recibo, un empaque o una lista de componentes).
Extrae la información de los artículos que encuentres.

Formato de Respuesta Requerido (JSON ESTRICTO, sin formato markdown extra):
{
  "header": {
    "proveedor": "Nombre del proveedor o tienda (si aplica, sino null)",
    "fecha": "YYYY-MM-DD (si la encuentras, sino null)",
    "total": 0.00
  },
  "items": [
    {
      "name": "Nombre completo del artículo",
      "qty": 1,
      "costo_unitario": 0.00,
      "codigo": "Código o SKU si lo encuentras",
      "marca": "Marca si es visible"
    }
  ]
}

REGLAS:
- Asegúrate de limpiar los nombres.
- Si no encuentras precios, pon 0.
- Devuelve ÚNICAMENTE el JSON. No añadas texto como "\`\`\`json".`
            },
            {
              inline_data: {
                mime_type: "image/jpeg",
                data: base64Data
              }
            }
          ]
        }
      ]
    };

    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const err = await response.json();
      return res.status(response.status).json({ error: err.error?.message || 'Error en la API de Gemini' });
    }

    const data = await response.json();
    let textResult = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    
    // Limpiar bloques markdown (ej. ```json)
    textResult = textResult.replace(/```json/gi, '').replace(/```/g, '').trim();
    
    return res.status(200).json(JSON.parse(textResult));

  } catch (error) {
    console.error("Error al comunicarse con Gemini:", error);
    return res.status(500).json({ error: "Error interno procesando IA", details: error.message });
  }
});

module.exports = router;
