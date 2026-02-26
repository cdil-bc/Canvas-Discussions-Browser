import { getIronSession } from "iron-session";

const sessionOptions = {
  password: process.env.SESSION_SECRET,
  cookieName: "canvas_oauth_session",
  cookieOptions: {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 14, // 14 days
    path: "/",
  },
};

export async function getSession(req, res) {
  return getIronSession(req, res, sessionOptions);
}
