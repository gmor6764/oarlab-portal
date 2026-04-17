export default async (req) => {
  const url   = new URL(req.url);
  const token = url.searchParams.get('token');

  if (!token) {
    return new Response('Missing token', { status: 400 });
  }

  let email, ts;
  try {
    const decoded = JSON.parse(atob(token));
    email = decoded.email;
    ts    = decoded.ts;
  } catch {
    return new Response('Invalid token', { status: 400 });
  }

  // Token expires after 48 hours
  if (Date.now() - ts > 48 * 60 * 60 * 1000) {
    return new Response(approveHtml('expired', email), {
      status: 400, headers: { 'Content-Type': 'text/html' }
    });
  }

  const SUPABASE_URL     = Netlify.env.get('SUPABASE_URL');
  const SUPABASE_SERVICE = Netlify.env.get('SUPABASE_SERVICE_KEY');
  const RESEND_KEY       = Netlify.env.get('RESEND_API_KEY');
  const SITE_URL         = Netlify.env.get('SITE_URL');

  // Upsert subscriber with 7-day expiry
  const expires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  await fetch(`${SUPABASE_URL}/rest/v1/subscribers`, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_SERVICE,
      Authorization: `Bearer ${SUPABASE_SERVICE}`,
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates'
    },
    body: JSON.stringify({ email, expires_at: expires })
  });

  // Also create auth user if not exists (so magic link works)
  await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_SERVICE,
      Authorization: `Bearer ${SUPABASE_SERVICE}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      email,
      email_confirm: true,
      user_metadata: { approved: true }
    })
  });

  // Send magic link to subscriber
  await fetch(`${SUPABASE_URL}/auth/v1/magiclink`, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_SERVICE,
      Authorization: `Bearer ${SUPABASE_SERVICE}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      email,
      options: { emailRedirectTo: `${SITE_URL}/auth/callback` }
    })
  });

  return new Response(approveHtml('approved', email), {
    status: 200, headers: { 'Content-Type': 'text/html' }
  });
};

function approveHtml(status, email) {
  const msg = status === 'approved'
    ? `Access approved for <strong>${email}</strong>. They have been sent a magic link and will have 7 days access.`
    : `This approval link has expired. Please ask <strong>${email}</strong> to request access again.`;
  return `<!DOCTYPE html><html><head><meta charset="UTF-8">
    <style>body{background:#0d0f0e;color:#f5f0e8;font-family:monospace;display:flex;align-items:center;justify-content:center;min-height:100vh;text-align:center;padding:2rem}
    .box{max-width:480px;border:1px solid rgba(200,184,154,0.12);padding:2rem;background:#1c2e24}
    h2{font-size:1.5rem;letter-spacing:0.1em;color:${status==='approved'?'#e8a838':'#f0a0a0'};margin-bottom:1rem}
    p{color:#c8b89a;line-height:1.6;font-size:13px}</style></head>
    <body><div class="box"><h2>${status==='approved'?'✓ ACCESS APPROVED':'✗ LINK EXPIRED'}</h2><p>${msg}</p></div></body></html>`;
}

export const config = { path: '/approve' };
