import { getSession } from "../../../lib/session";

export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { code, state, error } = req.query;

  if (error) {
    return res.redirect("/?auth_error=access_denied");
  }

  if (!code || !state) {
    return res.redirect("/?auth_error=missing_params");
  }

  const session = await getSession(req, res);

  if (!session.oauthState || session.oauthState !== state) {
    return res.redirect("/?auth_error=invalid_state");
  }

  delete session.oauthState;

  const clientId = process.env.CANVAS_CLIENT_ID;
  const clientSecret = process.env.CANVAS_CLIENT_SECRET;
  const canvasUrl = process.env.CANVAS_OAUTH_URL;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL;
  const redirectUri = `${appUrl}/api/oauth/callback`;

  try {
    const tokenRes = await fetch(`${canvasUrl}/login/oauth2/token`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        grant_type: "authorization_code",
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        code,
      }),
    });

    if (!tokenRes.ok) {
      const errorData = await tokenRes.json().catch(() => ({}));
      console.error("Token exchange failed:", tokenRes.status, errorData);
      return res.redirect("/?auth_error=token_exchange_failed");
    }

    const tokenData = await tokenRes.json();

    session.accessToken = tokenData.access_token;
    session.refreshToken = tokenData.refresh_token;
    session.canvasUrl = canvasUrl;
    session.tokenExpiresAt = Date.now() + (tokenData.expires_in || 3600) * 1000;
    session.isLoggedIn = true;

    // Fetch user profile to store display name
    try {
      const profileRes = await fetch(`${canvasUrl}/api/v1/users/self/profile`, {
        headers: { Authorization: `Bearer ${tokenData.access_token}` },
      });
      if (profileRes.ok) {
        const profile = await profileRes.json();
        session.userName = profile.name;
      }
    } catch {
      // Non-critical: proceed without user name
    }

    await session.save();

    res.redirect("/");
  } catch (err) {
    console.error("OAuth callback error:", err.message);
    return res.redirect("/?auth_error=server_error");
  }
}
