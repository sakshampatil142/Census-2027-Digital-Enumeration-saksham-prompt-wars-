// api/dify.js
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

  const difyApiKey = process.env.DIFY_API_KEY;
  const difyBaseUrl = process.env.DIFY_BASE_URL || 'https://api.dify.ai/v1';

  if (!difyApiKey) {
    console.error('Server Error: DIFY_API_KEY environment variable is missing.');
    return res.status(500).json({ 
      error: 'Server authentication configuration missing. Set DIFY_API_KEY in Vercel environment variables.' 
    });
  }

  try {
    const { query, user = 'citizen_user', conversation_id = '' } = req.body || {};

    if (!query || typeof query !== 'string') {
      return res.status(400).json({ error: 'Invalid payload: "query" string is required.' });
    }

    const difyPayload = {
      inputs: {},
      query: query,
      response_mode: 'blocking',
      conversation_id: conversation_id || '',
      user: user
    };

    const difyResponse = await fetch(`${difyBaseUrl}/chat-messages`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${difyApiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(difyPayload)
    });

    if (!difyResponse.ok) {
      const errorData = await difyResponse.json().catch(() => ({}));
      console.error('Dify API Upstream Error:', errorData);
      return res.status(difyResponse.status).json({
        error: errorData.message || 'Upstream error from Dify agent'
      });
    }

    const data = await difyResponse.json();

    return res.status(200).json({
      text: data.answer || '',
      conversation_id: data.conversation_id || '',
      status: 'success'
    });
  } catch (error) {
    console.error('API Handler Exception:', error);
    return res.status(500).json({ error: 'Internal server error processing Dify request.' });
  }
}
