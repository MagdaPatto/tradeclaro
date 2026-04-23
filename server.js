const express = require('express');
const app = express();

app.use(express.json());
app.use(express.static('public'));

app.post('/api/analyze', async (req, res) => {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'Falta GEMINI_API_KEY en las variables de entorno' });
  }

  const { asset, session } = req.body;

  const prompt = `Eres TradeClaro, un asistente educativo de mercados para traders principiantes en América Latina. Tu rol es ayudar a ENTENDER el contexto del mercado, NO dar asesoría financiera.

Activo: ${asset}
Sesión: ${session}
Fecha: ${new Date().toLocaleDateString('es-CO', { timeZone: 'America/Bogota' })}

Basándote en tu conocimiento del contexto macro y geopolítico global, analiza:
1. Eventos geopolíticos globales relevantes que mueven mercados actualmente
2. Contexto macro de EE.UU. (Fed, tasas, inflación, empleos)
3. Factores específicos que afectan a ${asset}

Responde ÚNICAMENTE con un objeto JSON válido, sin texto antes ni después, sin markdown:
{"contexto_global":"2-3 oraciones simples sobre qué pasa en el mundo que importa para traders ahora","impacto_mercado":"2-3 oraciones sobre cómo estos factores afectan específicamente a ${asset}","guia_operacion":"2-3 puntos educativos sobre qué observar en ${asset}. Sin decir comprar o vender directamente. Usar frases como: es importante notar que..., los traders suelen observar..., históricamente cuando X ocurre...","sentimiento":"ALCISTA o BAJISTA o NEUTRAL o MIXTO","confianza":"ALTA o MEDIA o BAJA"}

Lenguaje muy simple, sin tecnicismos. Como explicarle a alguien que lleva 2 meses operando.`;

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.7, maxOutputTokens: 1000 }
        })
      }
    );

    if (!response.ok) {
      const t = await response.text();
      return res.status(response.status).json({ error: `Gemini error ${response.status}: ${t.slice(0, 200)}` });
    }

    const data = await response.json();
    const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    if (!rawText) throw new Error('Respuesta vacía de Gemini');

    const si = rawText.indexOf('{');
    const ei = rawText.lastIndexOf('}');
    if (si === -1) throw new Error('Sin JSON: ' + rawText.slice(0, 200));

    const parsed = JSON.parse(rawText.slice(si, ei + 1));
    res.json(parsed);

  } catch (e) {
    res.status(500).json({ error: e.message || String(e) });
  }
});

const listener = app.listen(process.env.PORT || 3000, () => {
  console.log('TradeClaro corriendo en puerto ' + listener.address().port);
});
