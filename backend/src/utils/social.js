/**
 * Archivo: backend/src/utils/social.js
 * Descripción: Validación en servidor de tokens/códigos OAuth 2.0 y OpenID Connect
 * para Google, GitHub y Facebook (Meta).
 */
const { AppError } = require('./errors');

async function getJson(url, opts) {
  const res = await fetch(url, opts);
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.error) {
    console.error('Campus OAuth error:', url, 'HTTP', res.status, JSON.stringify(data));
    throw new AppError(
      data.error_description || data.message || 'Credencial del proveedor social inválida o vencida',
      401,
      'OAUTH_INVALID_TOKEN'
    );
  }
  return data;
}

const providers = {
  async google({ code, redirectUri, codeVerifier, accessToken, idToken, id_token }) {
    const rawIdToken = idToken || id_token;
    if (rawIdToken && !accessToken && !code) {
      const d = await getJson(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(rawIdToken)}`);
      const fullName = d.name || '';
      const parts = fullName.trim().split(/\s+/);
      return {
        id: String(d.sub),
        firstName: d.given_name || parts[0] || 'Estudiante',
        lastName: d.family_name || parts.slice(1).join(' ') || 'Campus',
        email: d.email_verified === 'true' || d.email_verified === true ? d.email : null,
        emailVerified: d.email_verified === 'true' || d.email_verified === true,
        avatar: d.picture || null,
      };
    }

    let token = accessToken;
    if (!token) {
      if (!code) throw new AppError('accessToken o código de Google requerido', 400, 'OAUTH_MISSING_TOKEN');
      const clientId = process.env.GOOGLE_CLIENT_ID;
      const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
      if (!clientId || !clientSecret) {
        throw new AppError('Credenciales OAuth de Google no configuradas en el servidor', 503, 'OAUTH_NOT_CONFIGURED');
      }
      const params = new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: 'authorization_code',
        code,
      });
      if (redirectUri) {
        params.append('redirect_uri', redirectUri);
      }
      if (codeVerifier) {
        params.append('code_verifier', codeVerifier);
      }
      const t = await getJson('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: params.toString(),
      });
      if (!t.access_token) {
        console.error('Google token exchange error:', t);
        throw new AppError(t.error_description || 'Código de Google inválido o expirado', 401, 'OAUTH_INVALID_CODE');
      }
      token = t.access_token;
    }

    const d = await getJson('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: { Authorization: `Bearer ${token}` },
    });
    const fullName = d.name || '';
    const parts = fullName.trim().split(/\s+/);
    return {
      id: String(d.sub),
      firstName: d.given_name || parts[0] || 'Estudiante',
      lastName: d.family_name || parts.slice(1).join(' ') || 'Campus',
      email: d.email_verified ? d.email : null,
      emailVerified: !!d.email_verified,
      avatar: d.picture || null,
    };
  },

  async facebook({ accessToken }) {
    if (!accessToken) throw new AppError('accessToken de Facebook requerido', 400, 'OAUTH_MISSING_TOKEN');
    const d = await getJson(
      `https://graph.facebook.com/me?fields=id,first_name,last_name,name,email,picture&access_token=${encodeURIComponent(accessToken)}`
    );
    return {
      id: String(d.id),
      firstName: d.first_name || (d.name || 'Estudiante').split(' ')[0],
      lastName: d.last_name || (d.name || '').split(' ').slice(1).join(' ') || 'Campus',
      email: d.email || null,
      emailVerified: !!d.email,
      avatar: d.picture?.data?.url || null,
    };
  },

  async discord({ code, redirectUri, codeVerifier, accessToken }) {
    let token = accessToken;
    if (!token) {
      if (!code) throw new AppError('Código de autorización de Discord requerido', 400, 'OAUTH_MISSING_CODE');
      const clientId = process.env.DISCORD_CLIENT_ID;
      const clientSecret = process.env.DISCORD_CLIENT_SECRET;
      if (!clientId || !clientSecret) {
        throw new AppError('Credenciales OAuth de Discord no configuradas en el servidor', 503, 'OAUTH_NOT_CONFIGURED');
      }
      const params = new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: 'authorization_code',
        code,
      });
      if (redirectUri) {
        params.append('redirect_uri', redirectUri);
      }
      if (codeVerifier) {
        params.append('code_verifier', codeVerifier);
      }
      const t = await getJson('https://discord.com/api/oauth2/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: params.toString(),
      });
      if (!t.access_token) {
        console.error('Discord access_token error:', t);
        throw new AppError(t.error_description || 'Código de Discord inválido o expirado', 401, 'OAUTH_INVALID_CODE');
      }
      token = t.access_token;
    }

    const d = await getJson('https://discord.com/api/users/@me', {
      headers: { Authorization: `Bearer ${token}` },
    });

    const displayName = d.global_name || d.username || 'Estudiante';
    const parts = displayName.trim().split(/\s+/);
    const avatarUrl = d.avatar ? `https://cdn.discordapp.com/avatars/${d.id}/${d.avatar}.png` : null;

    return {
      id: String(d.id),
      firstName: parts[0] || 'Estudiante',
      lastName: parts.slice(1).join(' ') || 'Campus',
      email: d.verified && d.email ? d.email.toLowerCase() : null,
      emailVerified: !!(d.verified && d.email),
      avatar: avatarUrl,
    };
  },

  async github({ code, redirectUri, codeVerifier, accessToken }) {
    let token = accessToken;
    if (!token) {
      if (!code) throw new AppError('Código de autorización de GitHub requerido', 400, 'OAUTH_MISSING_CODE');
      if (!process.env.GITHUB_CLIENT_ID || !process.env.GITHUB_CLIENT_SECRET) {
        throw new AppError('Credenciales OAuth de GitHub no configuradas en el servidor', 503, 'OAUTH_NOT_CONFIGURED');
      }
      const tokenPayload = {
        client_id: process.env.GITHUB_CLIENT_ID,
        client_secret: process.env.GITHUB_CLIENT_SECRET,
        code,
      };
      if (redirectUri) {
        tokenPayload.redirect_uri = redirectUri;
      }
      if (codeVerifier) {
        tokenPayload.code_verifier = codeVerifier;
      }
      const t = await getJson('https://github.com/login/oauth/access_token', {
        method: 'POST',
        headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify(tokenPayload),
      });
      if (!t.access_token) {
        console.error('GitHub access_token error:', t);
        throw new AppError(t.error_description || 'Código de GitHub inválido', 401, 'OAUTH_INVALID_CODE');
      }
      token = t.access_token;
    }

    const headers = { Authorization: `Bearer ${token}`, 'User-Agent': 'Campus-Server' };
    const u = await getJson('https://api.github.com/user', { headers });
    const emails = await getJson('https://api.github.com/user/emails', { headers }).catch(() => []);
    const verifiedPrimary = Array.isArray(emails)
      ? emails.find((e) => e.primary && e.verified) || emails.find((e) => e.verified)
      : null;

    const emailCandidate = verifiedPrimary?.email || u.email || null;
    const isVerified = !!(verifiedPrimary || u.email);

    const fullName = u.name || u.login || 'Estudiante';
    const parts = fullName.trim().split(/\s+/);
    return {
      id: String(u.id),
      firstName: parts[0] || 'Estudiante',
      lastName: parts.slice(1).join(' ') || 'Campus',
      email: isVerified && emailCandidate ? emailCandidate.toLowerCase() : null,
      emailVerified: isVerified,
      avatar: u.avatar_url || null,
    };
  },
};

exports.getProfile = async (provider, body) => {
  const fn = providers[provider];
  if (!fn) throw new AppError('Proveedor de identidad no soportado', 400, 'UNSUPPORTED_PROVIDER');
  const profile = await fn(body || {});
  if (!profile.id) throw new AppError('No se pudo verificar la identidad con el proveedor', 401, 'OAUTH_FAILED');
  return profile;
};
