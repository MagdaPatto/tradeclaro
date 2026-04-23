const express = require('express');
const app = express();

app.use(express.json());
app.use(express.static('public'));

app.post('/api/analyze', async (req, res) => {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'Falta ANTHROPIC_API_KEY en las variables de entorno (.env)' });
  }

  const { asset, session } = req.body;

  const prompt = `Eres TradeClaro, un asistente educativo de mercados para traders principiantes en América Latina. Tu rol es ayudar a ENTENDER el contexto del mercado, NO dar asesoría financiera.

Activo: ${asset}
Sesión: ${session}

Busca las noticias más recientes y analiza:
1. Eventos geopolíticos globales que mueven mercados hoy
2. Datos macro de EE.UU. (Fed, tasas, inflación, empleos)
3. Noticias específicas de ${asset}

Responde ÚNICAMENTE con un objeto JSON válido, sin texto antes ni después, sin markdown:
{"contexto_global":"2-3 oraciones simples sobre qué pasa en el mundo que importa para traders hoy","impacto_mercado":"2-3 oraciones sobre cómo estos eventos afectan específicamente a ${asset}","guia_operacion":"2-3 puntos educativos sobre qué observar en ${asset} hoy. Sin decir comprar o vender directamente.","sentimiento":"ALCISTA o BAJISTA o NEUTRAL o MIXTO","confianza":"ALTA o MEDIA o BAJA"}

Lenguaje muy simple. Como explicarle a alguien que lleva 2 meses operando.`;

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-3-5-haiku-20241022',
        max_tokens: 1000,
        tools: [{ type: 'web_search_20250305', name: 'web_search' }],
        messages: [{ role: 'user', content: prompt }]
      })
    });

    if (!response.ok) {
      const t = await response.text();
      return res.status(response.status).json({ error: `API error ${response.status}: ${t.slice(0,200)}` });
    }

    const data = await response.json();
    let rawText = '';
    for (const block of (data.content || [])) {
      if (block.type === 'text') rawText += block.text;
    }

    const si = rawText.indexOf('{'), ei = rawText.lastIndexOf('}');
    if (si === -1) throw new Error('Sin JSON en respuesta: ' + rawText.slice(0, 200));

    const parsed = JSON.parse(rawText.slice(si, ei + 1));
    res.json(parsed);

  } catch (e) {
    res.status(500).json({ error: e.message || String(e) });
  }
});

const listener = app.listen(process.env.PORT || 3000, () => {
  console.log('TradeClaro corriendo en puerto ' + listener.address().port);
});
