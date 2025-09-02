export const config = { runtime: 'edge' };

const ALLOWED = ['https://niura-adhd.vercel.app'];

function corsHeaders(req: Request) {
  const origin = req.headers.get('origin') || '';
  const h = new Headers();
  if (ALLOWED.includes(origin)) {
    h.set('Access-Control-Allow-Origin', origin);
    h.set('Vary', 'Origin');
  }
  h.set('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  h.set('Access-Control-Allow-Headers', 'Content-Type');
  return h;
}

export default async function handler(req: Request) {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: corsHeaders(req) });
  }
  if (req.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405, headers: corsHeaders(req) });
  }

  const headers = corsHeaders(req);
  let body: any;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), { status: 400, headers });
  }

  const { text, voiceId, modelId = 'eleven_turbo_v2' } = body || {};
  if (!text || !voiceId) {
    return new Response(JSON.stringify({ error: 'text and voiceId required' }), { status: 400, headers });
  }

  try {
    const r = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'audio/mpeg',
        'xi-api-key': process.env.ELEVENLABS_API_KEY!,
      },
      body: JSON.stringify({ text, model_id: modelId }),
    });

    // Pass through status and stream body
    const h = corsHeaders(req);
    h.set('Content-Type', 'audio/mpeg');
    return new Response(r.body, { status: r.status, headers: h });
  } catch (e) {
    const h = corsHeaders(req);
    h.set('Content-Type', 'application/json');
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: h });
  }
}
