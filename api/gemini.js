// api/gemini.js
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed. Use POST.' });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error('Server Configuration Error: GEMINI_API_KEY is not defined.');
    return res.status(500).json({ 
      error: 'Server authentication configuration missing. Configure GEMINI_API_KEY in Vercel environment variables.' 
    });
  }

  const model = 'gemini-1.5-flash';
  const geminiBaseUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  try {
    const { prompt, systemInstruction, image } = req.body || {};

    if (!prompt || typeof prompt !== 'string') {
      return res.status(400).json({ error: 'Invalid payload: "prompt" string is required.' });
    }

    const userParts = [];

    if (image && typeof image === 'string') {
      let mimeType = 'image/jpeg';
      let base64Data = image;

      if (image.startsWith('data:')) {
        const matches = image.match(/^data:([^;]+);base64,(.+)$/);
        if (matches) {
          mimeType = matches[1];
          base64Data = matches[2];
        }
      }

      userParts.push({
        inlineData: {
          mimeType: mimeType,
          data: base64Data
        }
      });
    }

    userParts.push({ text: prompt });

    const payload = {
      contents: [{ role: 'user', parts: userParts }],
      generationConfig: {
        temperature: 0.1,
        maxOutputTokens: 1024
      }
    };

    if (systemInstruction && typeof systemInstruction === 'string') {
      payload.systemInstruction = {
        parts: [{ text: systemInstruction }]
      };
    }

    const upstreamResponse = await fetch(geminiBaseUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!upstreamResponse.ok) {
      const errorData = await upstreamResponse.json();
      console.error('Gemini API Error:', errorData);
      return res.status(upstreamResponse.status).json({
        error: errorData.error?.message || 'Upstream provider error'
      });
    }

    const data = await upstreamResponse.json();
    const candidate = data.candidates?.[0];
    const replyText = candidate?.content?.parts?.map(p => p.text || '').join('') || '';

    return res.status(200).json({
      text: replyText,
      status: 'success'
    });
  } catch (error) {
    console.error('API Handler Exception:', error);
    return res.status(500).json({ error: 'Internal server error while processing request.' });
  }
}
