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
    const { mode, prompt, systemInstruction, image, isGrounded } = req.body || {};

    if (!prompt || typeof prompt !== 'string') {
      return res.status(400).json({ error: 'Invalid payload: "prompt" string is required.' });
    }

    // ========================================================
    // TWO-STEP FACT CHECK MODE (Grounding -> Structured JSON)
    // ========================================================
    if (mode === 'factCheck') {
      // STEP 1: Search-Grounded Plaintext Research Call
      const step1Payload = {
        contents: [
          {
            role: 'user',
            parts: [
              {
                text: `You are an expert fact-checker for India's Census 2027 operations.
Research and evaluate whether the following claim is true, false, or misleading based on official rules, Census Acts, and government notices.
Claim: "${prompt}"

Provide a detailed factual explanation in plain text, citing official sources, acts, or directives.`
              }
            ]
          }
        ],
        tools: [{ google_search: {} }],
        generationConfig: {
          temperature: 0.2,
          maxOutputTokens: 1024
        }
      };

      const step1Response = await fetch(geminiBaseUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(step1Payload)
      });

      if (!step1Response.ok) {
        const errData = await step1Response.json();
        console.error('Step 1 Grounding Error:', errData);
        return res.status(step1Response.status).json({
          error: errData.error?.message || 'Grounding step failed'
        });
      }

      const step1Data = await step1Response.json();
      const rawGroundedText = step1Data.candidates?.[0]?.content?.parts?.map(p => p.text || '').join('') || '';

      // STEP 2: Strict JSON Schema Extraction (No Grounding Tool)
      const step2Payload = {
        contents: [
          {
            role: 'user',
            parts: [
              {
                text: `Convert the following fact-checking research analysis into a structured JSON response for the claim: "${prompt}".

Research Analysis:
"""
${rawGroundedText}
"""

You must output a JSON object adhering to this schema:
{
  "verdict": "VERIFIED" | "FALSE" | "MISLEADING",
  "confidence": "98.5%",
  "sublabel": "Short category description (e.g. Official Gazette Regulation, Operational Roadmap, Statutory Confidentiality Rule)",
  "explanation": "2-3 precise sentences explaining the fact-check verdict clearly.",
  "sources": [
    { "title": "Name of Law, Gazette Notice or Authority", "tag": "e.g. Official Law / Gazette / Notice" }
  ]
}`
              }
            ]
          }
        ],
        generationConfig: {
          temperature: 0.1,
          maxOutputTokens: 1024,
          responseMimeType: 'application/json'
        }
      };

      const step2Response = await fetch(geminiBaseUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(step2Payload)
      });

      if (!step2Response.ok) {
        const errData = await step2Response.json();
        console.error('Step 2 Structuring Error:', errData);
        return res.status(step2Response.status).json({
          error: errData.error?.message || 'JSON formatting step failed'
        });
      }

      const step2Data = await step2Response.json();
      const structuredJsonText = step2Data.candidates?.[0]?.content?.parts?.map(p => p.text || '').join('') || '{}';

      return res.status(200).json({
        text: structuredJsonText,
        status: 'success'
      });
    }

    // ========================================================
    // STANDARD GENERATION MODE (Single Call)
    // ========================================================
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
        temperature: 0.3,
        maxOutputTokens: 2048
      }
    };

    if (systemInstruction && typeof systemInstruction === 'string') {
      payload.systemInstruction = {
        parts: [{ text: systemInstruction }]
      };
    }

    if (isGrounded) {
      payload.tools = [{ google_search: {} }];
    }

    const upstreamResponse = await fetch(geminiBaseUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!upstreamResponse.ok) {
      const errorData = await upstreamResponse.json();
      console.error('Gemini Upstream Error:', errorData);
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
