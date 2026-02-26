import crypto from "crypto";
import { getSession } from "../../../lib/session";

export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const clientId = process.env.CANVAS_CLIENT_ID;
  const canvasUrl = process.env.CANVAS_OAUTH_URL;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL;

  if (!clientId || !canvasUrl || !appUrl) {
    return res.status(500).json({ error: "OAuth not configured" });
  }

  const state = crypto.randomBytes(32).toString("hex");
  const redirectUri = `${appUrl}/api/oauth/callback`;

  const session = await getSession(req, res);
  session.oauthState = state;
  await session.save();

  const authUrl = new URL(`${canvasUrl}/login/oauth2/auth`);
  const scopes = [
    "url:GET|/api/v1/courses/:id",
    "url:GET|/api/v1/courses/:course_id/discussion_topics",
    "url:GET|/api/v1/courses/:course_id/discussion_topics/:topic_id/entries",
    "url:GET|/api/v1/courses/:course_id/enrollments",
    "url:GET|/api/v1/courses/:course_id/assignments",
    "url:GET|/api/v1/courses/:course_id/assignments/:assignment_id/submissions",
    "url:GET|/api/v1/courses/:course_id/assignments/:assignment_id/submissions/:user_id",
    "url:GET|/api/v1/users/:user_id/profile",
  ].join(" ");

  authUrl.searchParams.set("client_id", clientId);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("redirect_uri", redirectUri);
  authUrl.searchParams.set("state", state);
  authUrl.searchParams.set("scope", scopes);

  res.redirect(302, authUrl.toString());
}
