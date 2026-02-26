export async function refreshCanvasToken(session) {
  const canvasUrl = session.canvasUrl || process.env.CANVAS_OAUTH_URL;
  const clientId = process.env.CANVAS_CLIENT_ID;
  const clientSecret = process.env.CANVAS_CLIENT_SECRET;

  if (!session.refreshToken || !canvasUrl || !clientId || !clientSecret) {
    return false;
  }

  const tokenRes = await fetch(`${canvasUrl}/login/oauth2/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      grant_type: "refresh_token",
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: session.refreshToken,
    }),
  });

  if (!tokenRes.ok) {
    return false;
  }

  const tokenData = await tokenRes.json();
  session.accessToken = tokenData.access_token;
  session.tokenExpiresAt = Date.now() + (tokenData.expires_in || 3600) * 1000;

  await session.save();
  return true;
}
