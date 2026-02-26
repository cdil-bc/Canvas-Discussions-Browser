import { getSession } from "../../../lib/session";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const session = await getSession(req, res);

  // Revoke token on Canvas before destroying session
  if (session.accessToken && session.canvasUrl) {
    try {
      await fetch(`${session.canvasUrl}/login/oauth2/token`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${session.accessToken}`,
        },
      });
    } catch {
      // Best-effort revocation; proceed with local logout regardless
    }
  }

  session.destroy();
  res.status(200).json({ success: true });
}
