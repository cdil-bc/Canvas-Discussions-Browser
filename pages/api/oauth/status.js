import { getSession } from "../../../lib/session";

export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const session = await getSession(req, res);

  if (session.isLoggedIn && session.accessToken) {
    return res.status(200).json({
      isLoggedIn: true,
      userName: session.userName || null,
      canvasUrl: session.canvasUrl || null,
    });
  }

  return res.status(200).json({ isLoggedIn: false });
}
