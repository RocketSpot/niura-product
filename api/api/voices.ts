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

  try {
    const r = await fetch('https://api.elevenlabs.io/v1/voices', {
      headers: { 'xi-api-key': process.env.ELEVENLABS_API_KEY! },
      cache: 'no-store',
    });

    const headers = corsHeaders(req);
    headers.set('Content-Type', 'application/json');
    return new Response(await r.text(), { status: r.status, headers });
  } catch (e) {
    const headers = corsHeaders(req);
    headers.set('Content-Type', 'application/json');
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers });
  }
}
