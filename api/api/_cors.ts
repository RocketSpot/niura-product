// api/_cors.ts
import type { VercelRequest, VercelResponse } from '@vercel/node';

const ALLOWED_ORIGINS = new Set([
  'https://niura-adhd.vercel.app',
  // add more allowed origins here (staging, local, etc.)
]);

export function applyCors(req: VercelRequest, res: VercelResponse) {
  const origin = (req.headers.origin as string) || '';
  const allowedOrigin = ALLOWED_ORIGINS.has(origin) ? origin : '';

  if (allowedOrigin) {
    res.setHeader('Access-Control-Allow-Origin', allowedOrigin);
    res.setHeader('Vary', 'Origin'); // caches correctly per-origin
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  // Only set this if you actually use cookies/credentials:
  // res.setHeader('Access-Control-Allow-Credentials', 'true');
}

export function handlePreflight(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'OPTIONS') {
    applyCors(req, res);
    res.status(200).end();
    return true;
  }
  return false;
}
