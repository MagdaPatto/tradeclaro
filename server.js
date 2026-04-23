const express = require('express');
const app = express();
app.use(express.json());
app.use(express.static('public'));

const SYMBOLS = {
  'EUR/USD':'EURUSD=X','GBP/USD':'GBPUSD=X','USD/JPY':'USDJPY=X',
  'USD/MXN':'USDMXN=X','USD/COP':'USDCOP=X','Bitcoin (BTC)':'BTC-USD',
  'Ethereum (ETH)':'ETH-USD','S&P 500':'%5EGSPC','Nasdaq 100':'%5EIXIC',
  'Dow Jones':'%5EDJI','Oro (XAU/USD)':'GC=F','Petróleo WTI':'CL=F',
  'Plata (XAG/USD)':'SI=F','DXY':'DX-Y.NYB'
};

async function fetchPrice(symbol) {
  try {
    const r = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=1d&range=2d`,{headers:{'User-Agent':'Mozilla/5.0'}});
    if(!r.ok) return null;
    const d = await r.json();
    const meta = d.chart?.result?.[0]?.meta;
    if(!meta) return null;
    const price = meta.regularMarketPrice;
    const prev = meta.chartPreviousClose || meta.previousClose;
    const change = prev ? ((price-prev)/prev)*100 : 0;
    return { price, change: Math.round(change*100)/100 };
  } catch { return null; }
}

app.get('/api/prices', async (req, res) => {
  const results = {};
  await Promise.all(Object.entries(SYMBOLS).map(async ([name, sym]) => {
    const d = await fetchPrice(sym);
    if(d) results[name] = d;
  }));
  res.json(results);
});

function groqCall(apiKey, prompt, maxTokens=2000) {
  return fetch('https://api.groq.com/openai/v1/chat/completions', {
    method:'POST',
    headers:{'Content-Type':'application/json','Authorization':`Bearer ${apiKey}`},
    body: JSON.stringify({
      model:'llama-3.1-8b-instant',
      messages:[{role:'user',content:prompt}],
      max_tokens: maxTokens,
      temperature: 0.7
    })
  });
}

app.get('/api/radar', async (req, res) => {
  const apiKey = process.env.GROQ_API_KEY;
  if(!apiKey) return res.status(500).json({error:'Falta GROQ_API_KEY'});
  const now = new Date().toLocaleDateString('es-CO',{timeZone:'America/Bogota',weekday:'long',year:'numeric',month:'long',day:'numeric'});

  const prompt = `Eres un trader senior analizando el mercado global HOY (${now}) para traders principiantes en LATAM.

Genera un radar global conciso del estado actual del mercado. Responde ÚNICAMENTE con JSON válido sin markdown:

{
  "titular_del_dia": "La noticia o evento más importante de las últimas 12 horas que está moviendo los mercados. 1-2 oraciones. Con fuente si es conocida (Fed, OPEC, Casa Blanca, etc.)",
  "sentimiento_global": "RISK-ON o RISK-OFF o MIXTO",
  "resumen_mercados": "2-3 oraciones sobre cómo están reaccionando los principales mercados a los eventos actuales. Menciona qué activos están subiendo, cuáles bajando y por qué de forma simple.",
  "activo_del_dia": "El activo más relevante o volátil HOY y por qué en 1 oración.",
  "proximos_eventos": [
    {
      "hora": "Hora aproximada en ET o UTC, o 'Esta semana'",
      "evento": "Nombre del evento",
      "impacto_esperado": "ALTO o MEDIO o BAJO",
      "activos_afectados": "Qué activos mueve principalmente",
      "descripcion": "1 oración simple explicando por qué importa este evento al trader principiante"
    }
  ],
  "alerta_critica": "Si hay algo urgente que los traders DEBEN saber ahora mismo (conflicto, declaración sorpresiva, dato macro inesperado). Si no hay nada crítico, escribe null."
}

Los proximos_eventos deben incluir entre 3 y 5 eventos reales programados para las próximas 24-48 horas: conferencias de prensa, datos económicos (NFP, IPC, actas Fed), sesiones del Congreso, cumbres geopolíticas, vencimientos de opciones, o eventos corporativos relevantes. Si no hay eventos programados conocidos, incluye eventos de la próxima semana.`;

  try {
    const r = await groqCall(apiKey, prompt, 1500);
    if(!r.ok){const t=await r.text();return res.status(r.status).json({error:`Groq ${r.status}: ${t.slice(0,150)}`);}
    const d = await r.json();
    const raw = d.choices?.[0]?.message?.content||'';
    const si=raw.indexOf('{'),ei=raw.lastIndexOf('}');
    if(si===-1) throw new Error('Sin JSON');
    res.json(JSON.parse(raw.slice(si,ei+1)));
  } catch(e) {
    res.status(500).json({error:e.message});
  }
});

app.post('/api/analyze', async (req, res) => {
  const apiKey = process.env.GROQ_API_KEY;
  if(!apiKey) return res.status(500).json({error:'Falta GROQ_API_KEY'});
  const {asset, session} = req.body;
  const now = new Date().toLocaleDateString('es-CO',{timeZone:'America/Bogota',weekday:'long',year:'numeric',month:'long',day:'numeric'});

  const prompt = `Eres un trader senior con 30 años de experiencia como Ramiro, mentor de traders principiantes en LATAM. Tu análisis es tu marca: cronológico, con fuentes, multi-factor, profundo pero accesible.

Activo: ${asset} | Sesión: ${session} | Fecha: ${now}

Genera un informe TradeClaro completo. Responde ÚNICAMENTE con JSON válido sin markdown:

{
  "sinopsis_global": "Visión macro de 3-4 oraciones: qué bolsas cerraron y cómo, cuál está abierta, cuál va a abrir. Conecta el arrastre entre sesiones. ¿Qué hereda la próxima sesión de la anterior?",

  "noticia_evento": "La noticia o noticias más relevantes de las últimas 12 horas que impactan a ${asset}. Incluye fuente cuando sea posible (Fed, Casa Blanca, OPEC, etc.) y hora aproximada si la sabes. Sé específico: qué dijo quién, qué pasó exactamente.",

  "cronologia": "Si hubo una secuencia de eventos importantes hoy o ayer que expliquen el movimiento del activo, descríbela brevemente en orden cronológico. Ej: '08:00 ET — Trump declaró X, el activo cayó de A a B. 14:00 ET — reversión tras Y, rebotó a C.' Si no hay secuencia relevante, escribe null.",

  "impacto_volatilidad": "BAJO o MEDIO o ALTO o EXTREMO",

  "analisis_experto": "El corazón del informe. 4-6 oraciones como trader senior. Analiza: 1) cómo la noticia afecta al activo específicamente, 2) el arrastre de sesión (qué dejó Londres para NY, o Asia para Londres), 3) qué está haciendo el dinero inteligente (institucionales), 4) las tensiones entre factores contradictorios si las hay (refugio vs tasas, dólar vs riesgo). Específico, con razonamiento real.",

  "niveles_clave": "Soportes y resistencias del momento con dirección probable. Formato claro: niveles específicos o rangos, y qué esperar en cada zona.",

  "proximos_eventos_activo": [
    {
      "cuando": "Hora/fecha aproximada",
      "evento": "Nombre del evento",
      "impacto": "ALTO o MEDIO",
      "que_hacer": "Qué debe observar o considerar el trader principiante ante este evento. 1 oración."
    }
  ],

  "conclusion_educativa": "Al estilo de Ramiro: 2-3 oraciones que resumen la lección del día. Qué aprendemos de cómo se está comportando este activo hoy. Qué tipo de análisis (técnico, fundamental, geopolítico) está dominando y por qué el trader principiante debe saberlo.",

  "nota_gestion": "Tip de gestión de riesgo para trader en Colombia/LATAM operando ${asset} en sesión ${session}. Menciona DXY si aplica. Incluye qué NO hacer. Máximo 3 oraciones directas y poderosas.",

  "sentimiento": "ALCISTA o BAJISTA o NEUTRAL o MIXTO",
  "confianza": "ALTA o MEDIA o BAJA"
}

Hablas con alguien de 2 meses operando. Tu análisis debe hacerle sentir que tiene un mentor senior a su lado.`;

  try {
    const r = await groqCall(apiKey, prompt, 2000);
    if(!r.ok){const t=await r.text();return res.status(r.status).json({error:`Groq ${r.status}: ${t.slice(0,150)}`);}
    const d = await r.json();
    const raw = d.choices?.[0]?.message?.content||'';
    if(!raw) throw new Error('Respuesta vacía');
    const si=raw.indexOf('{'),ei=raw.lastIndexOf('}');
    if(si===-1) throw new Error('Sin JSON: '+raw.slice(0,150));
    res.json(JSON.parse(raw.slice(si,ei+1)));
  } catch(e) {
    res.status(500).json({error:e.message});
  }
});

const listener = app.listen(process.env.PORT||3000, ()=>{
  console.log('TradeClaro v3 en puerto '+listener.address().port);
});
