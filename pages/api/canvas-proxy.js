/**
 * Canvas API Proxy - Next.js API Route
 *
 * Routes all Canvas API requests through the server to avoid CORS issues.
 * Authenticates using OAuth tokens stored in the encrypted session cookie.
 * Automatically refreshes expired tokens using the refresh token.
 *
 * Usage Pattern:
 * Client → POST /api/canvas-proxy { endpoint, method?, body? } → Canvas API → Response
 */
import { getSession } from "../../lib/session";
import { refreshCanvasToken } from "../../lib/refreshToken";

export default async function handler(req, res) {
  const session = await getSession(req, res);

  if (!session.isLoggedIn || !session.accessToken) {
    return res.status(401).json({ error: "Not authenticated. Please sign in with Canvas." });
  }

  const { endpoint, method = "GET", body } = req.body || {};

  if (!endpoint) {
    return res.status(400).json({ error: "Missing required parameter: endpoint" });
  }

  const apiUrl = `${session.canvasUrl}/api/v1`;

  async function makeCanvasRequest(token) {
    const url = `${apiUrl}${endpoint}`;
    const fetchOptions = {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    };

    if (method !== "GET" && body) {
      fetchOptions.body = JSON.stringify(body);
    }

    return fetch(url, fetchOptions);
  }

  try {
    let canvasRes = await makeCanvasRequest(session.accessToken);

    // Auto-refresh on 401 and retry once
    if (canvasRes.status === 401) {
      const refreshed = await refreshCanvasToken(session);
      if (refreshed) {
        canvasRes = await makeCanvasRequest(session.accessToken);
      } else {
        return res.status(401).json({ error: "Session expired. Please sign in again." });
      }
    }

    const data = await canvasRes.json();

    if (!canvasRes.ok) {
      return res.status(canvasRes.status).json({
        error: data.errors || data.message || "Canvas API error",
        status: canvasRes.status,
      });
    }

    res.status(200).json(data);
  } catch (e) {
    console.error("Canvas proxy error:", e.message);
    res.status(500).json({ error: "Failed to communicate with Canvas API" });
  }
}
