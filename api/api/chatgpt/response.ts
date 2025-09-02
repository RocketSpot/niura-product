export default async function handler(req, res) {
  const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
  const { thread_id } = req.query;

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (!thread_id) return res.status(400).json({ error: 'Missing thread_id' });

  try {
    const response = await fetch(`https://api.openai.com/v1/threads/${thread_id}/messages`, {
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        'OpenAI-Beta': 'assistants=v2'
      }
    }).then(res => res.json());

    const assistantMessage = response.data?.find(msg => msg.role === 'assistant');
    const text = assistantMessage?.content?.[0]?.text?.value;

    if (!text) {
      return res.status(202).json({ status: 'pending' });
    }

    return res.status(200).json({
      status: 'completed',
      answer: text
    });
  } catch (err) {
    console.error('❌ Error polling assistant:', err);
    return res.status(500).json({ error: 'Polling failed' });
  }
}
