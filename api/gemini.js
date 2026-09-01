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
    const { mode, prompt, systemInstruction, image } = req.body || {};

    if (!prompt || typeof prompt !== 'string') {
      return res.status(400).json({ error: 'Invalid payload: "prompt" string is required.' });
    }

    // ========================================================
    // SATYAVANI EMBEDDED KNOWLEDGE BASE FACT CHECK MODE
    // ========================================================
    if (mode === 'factCheck') {
      const factCheckSystemInstruction = `You are SatyaVani AI, the official and authoritative verification engine for India's Census 2027 operations (JanGanana 2027).

OFFICIAL KNOWLEDGE BASE FOR CENSUS 2027:
1. TWO-PHASE ROADMAP: Census 2027 is conducted in two distinct phases:
   - Phase 1: Houselisting & Housing Census (covers structural materials, clean fuels, amenities, and citizen self-enumeration).
   - Phase 2: Population Enumeration (covers demographic, social, educational, and linguistic data).
2. FIRST FULLY DIGITAL CENSUS: Census 2027 is India's first 100% digital demographics enumeration, utilizing a digital mobile app, offline-sync capability, and web self-enumeration.
3. STRICT CONFIDENTIALITY & NO FRAUDULENT REQUESTS:
   - Enumerators NEVER request bank OTPs, bank account numbers, credit/debit card details, or financial records.
   - Enumerators NEVER collect biometric data (such as fingerprint scans or iris scans).
   - Enumerators NEVER demand physical property deeds, land ownership titles, or tax registry certificates.
   - All individual data is strictly protected under statutory confidentiality laws (Section 15 of the Census Act 1948) and DPDP Act 2023.
4. SELF-ENUMERATION RULES:
   - Self-enumeration is authenticated via standard mobile OTP login only.
   - It does NOT require any biometric scans or identity card document uploads.
5. TENANT & RESIDENCY CRITERIA:
   - Tenants and renters only require verbal self-declaration. They do NOT need to present or upload landlord lease agreements or rent contracts.
   - "Usually Residing" is defined as living in the household for at least 6 months or intending to reside for 6 months.

INSTRUCTIONS FOR EVALUATION:
- Compare the user's claim strictly against this knowledge base.
- If the claim accurately describes Census 2027 rules, roadmap, or procedures, mark as "VERIFIED".
- If the claim involves scams, biometrics, bank OTPs, property deeds, mandatory lease agreements, or contradicts the rules, mark as "FALSE".
- If the claim mixes accurate details with misinformation or partial truths, mark as "MISLEADING".

You MUST reply with a JSON object adhering to this schema:
{
  "verdict": "VERIFIED" | "FALSE" | "MISLEADING",
  "confidence": "99.0%",
  "sublabel": "Short official category (e.g. Statutory Confidentiality, Two-Phase Operational Roadmap, Tenant Guidelines)",
  "explanation": "2-3 clear, authoritative sentences citing the official rules.",
  "sources": [
    { "title": "Section 15, Census Act 1948 (Statutory Confidentiality)", "tag": "Statutory Law" },
    { "title": "Census 2027 Official Operational Directive #01", "tag": "Official Directive" }
  ]
}`;

      const payload = {
        contents: [
          {
            role: 'user',
            parts: [{ text: `Evaluate this claim: "${prompt}"` }]
          }
        ],
        systemInstruction: {
          parts: [{ text: factCheckSystemInstruction }]
        },
        generationConfig: {
          temperature: 0.1,
          maxOutputTokens: 1024,
          responseMimeType: 'application/json'
        }
      };

      const upstreamResponse = await fetch(geminiBaseUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!upstreamResponse.ok) {
        const errorData = await upstreamResponse.json();
        console.error('FactCheck API Error:', errorData);
        return res.status(upstreamResponse.status).json({
          error: errorData.error?.message || 'Upstream fact-checking error'
        });
      }

      const data = await upstreamResponse.json();
      const replyText = data.candidates?.[0]?.content?.parts?.map(p => p.text || '').join('') || '{}';

      return res.status(200).json({
        text: replyText,
        status: 'success'
      });
    }

    // ========================================================
    // STANDARD QUERY & MULTIMODAL MODE
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

