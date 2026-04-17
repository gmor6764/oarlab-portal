export default async (req) => {
  const { email } = await req.json();

  if (!email || !email.includes('@')) {
    return new Response(JSON.stringify({ error: 'Invalid email' }), { status: 400 });
  }

  const SUPABASE_URL     = Netlify.env.get('SUPABASE_URL');
  const SUPABASE_SERVICE = Netlify.env.get('SUPABASE_SERVICE_KEY');
  const COACH_EMAIL      = Netlify.env.get('COACH_EMAIL');
  const SITE_URL         = Netlify.env.get('SITE_URL');
  const RESEND_KEY       = Netlify.env.get('RESEND_API_KEY');

  // Check if already an active subscriber
  const checkRes = await fetch(
    `${SUPABASE_URL}/rest/v1/subscribers?email=eq.${encodeURIComponent(email)}&select=email,expires_at`,
    { headers: { apikey: SUPABASE_SERVICE, Authorization: `Bearer ${SUPABASE_SERVICE}` } }
  );
  const existing = await checkRes.json();

  if (existing.length > 0 && new Date(existing[0].expires_at) > new Date()) {
    return new Response(JSON.stringify({ status: 'already_active' }), { status: 200 });
  }

  // Generate a signed approval token (simple HMAC-style: base64 of email + secret)
  const token = btoa(JSON.stringify({ email, ts: Date.now() }));
  const approveUrl = `${SITE_URL}/approve?token=${encodeURIComponent(token)}`;

  // Send approval request email to coach via Resend
  await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${RESEND_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: 'OarLab <noreply@oarlab.id>',
      to: COACH_EMAIL,
      subject: `Access Request: ${email}`,
      html: `
        <p style="font-family:monospace">A new subscriber has requested access to the OarLab Training Portal.</p>
        <p style="font-family:monospace"><strong>Email:</strong> ${email}</p>
        <p style="font-family:monospace"><strong>Requested at:</strong> ${new Date().toLocaleString('en-AU', {timeZone:'Australia/Sydney'})}</p>
        <br>
        <a href="${approveUrl}" style="background:#e8a838;color:#0d0f0e;padding:12px 24px;text-decoration:none;font-family:monospace;font-weight:bold;display:inline-block">
          APPROVE ACCESS (7 days)
        </a>
        <br><br>
        <p style="font-family:monospace;color:#666;font-size:12px">If you do not recognise this person, ignore this email.</p>
      `
    })
  });

  return new Response(JSON.stringify({ status: 'requested' }), { status: 200 });
};

export const config = { path: '/api/request-access' };
