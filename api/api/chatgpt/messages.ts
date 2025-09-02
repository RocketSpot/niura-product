export default async function handler(req, res) {
  const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
  const ASSISTANT_ID = process.env.ASSISTANT_ID;

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');

  if (!OPENAI_API_KEY || !ASSISTANT_ID) {
    return res.status(500).json({ error: 'Missing OpenAI API key or Assistant ID' });
  }

  const { text } = req.body;

  const openaiHeaders = {
    Authorization: `Bearer ${OPENAI_API_KEY}`,
    'Content-Type': 'application/json',
    'OpenAI-Beta': 'assistants=v2'  // ✅ required!
  };

  try {
    // 1. Create thread
    const thread = await fetch('https://api.openai.com/v1/threads', {
      method: 'POST',
      headers: openaiHeaders
    }).then(res => res.json());

    // 2. Add user message
    const message = await fetch(`https://api.openai.com/v1/threads/${thread.id}/messages`, {
      method: 'POST',
      headers: openaiHeaders,
      body: JSON.stringify({ role: 'user', content: text })
    }).then(res => res.json());

    // 3. Run assistant
    const run = await fetch(`https://api.openai.com/v1/threads/${thread.id}/runs`, {
      method: 'POST',
      headers: openaiHeaders,
      body: JSON.stringify({ assistant_id: ASSISTANT_ID })
    }).then(res => res.json());

    return res.status(200).json({
      thread_id: thread?.id || null,
      run_id: run?.id || null,
      debug: { thread, message, run }
    });
  } catch (err) {
    console.error('❌ Assistant error:', err);
    return res.status(500).json({ error: 'Assistant run failed' });
  }
}
