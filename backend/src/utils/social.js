const { AppError } = require('./errors');

async function getJson(url, opts) {
  const res = await fetch(url, opts);
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.error) throw new AppError('Credencial del proveedor inválida o vencida', 401);
  return data;
}

/** Cada proveedor devuelve { id, name, email, avatar } normalizado. */
const providers = {
  // body: { accessToken }
  async google({ accessToken }) {
    const d = await getJson('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    return { id: d.sub, name: d.name, email: d.email_verified ? d.email : null, avatar: d.picture };
  },

  // body: { accessToken }
  async facebook({ accessToken }) {
    const d = await getJson(
      `https://graph.facebook.com/me?fields=id,name,email,picture&access_token=${encodeURIComponent(accessToken)}`
    );
    return { id: d.id, name: d.name, email: d.email || null, avatar: d.picture?.data?.url };
  },

  // body: { code, redirectUri }  (el secret nunca viaja en la app)
  async github({ code, redirectUri }) {
    const t = await getJson('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: process.env.GITHUB_CLIENT_ID,
        client_secret: process.env.GITHUB_CLIENT_SECRET,
        code,
        redirect_uri: redirectUri,
      }),
    });
    if (!t.access_token) throw new AppError('Código de GitHub inválido', 401);
    const headers = { Authorization: `Bearer ${t.access_token}`, 'User-Agent': 'taskflow' };
    const u = await getJson('https://api.github.com/user', { headers });
    let email = u.email;
    if (!email) {
      const emails = await getJson('https://api.github.com/user/emails', { headers });
      email = (emails.find((e) => e.primary && e.verified) || {}).email || null;
    }
    return { id: String(u.id), name: u.name || u.login, email, avatar: u.avatar_url };
  },
};

exports.getProfile = async (provider, body) => {
  const fn = providers[provider];
  if (!fn) throw new AppError('Proveedor no soportado', 400);
  const profile = await fn(body || {});
  if (!profile.id) throw new AppError('No se pudo obtener el perfil del proveedor', 401);
  return profile;
};
