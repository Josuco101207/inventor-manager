export const processImageWithGemini = async (base64Image, apiKey) => {
  if (!apiKey) {
    throw new Error('API Key de Gemini no configurada.');
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

  try {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const err = await response.json();
      throw new Error(err.error?.message || 'Error en la API de Gemini');
    }

    const data = await response.json();
    let textResult = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    
    // Limpiar posibles bloques markdown de la respuesta de Gemini
    textResult = textResult.replace(/```json/gi, '').replace(/```/g, '').trim();
    
    return JSON.parse(textResult);
  } catch (error) {
    console.error("Error al procesar con IA:", error);
    throw error;
  }
};

export const compressImage = (file, maxWidth = 1600) => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target.result;
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;

        if (width > maxWidth) {
          height = Math.round((height * maxWidth) / width);
          width = maxWidth;
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);
        
        // Export to JPEG 80% quality
        resolve(canvas.toDataURL('image/jpeg', 0.8));
      };
      img.onerror = (err) => reject(err);
    };
    reader.onerror = (err) => reject(err);
  });
};
