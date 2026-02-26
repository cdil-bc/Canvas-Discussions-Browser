# Decision: Canvas OAuth 2.0 Implementation

## Date
2026-02-26

## Status
Proposed — pending RIT security review

## Context

The Canvas Discussion Browser currently requires users to manually generate Canvas personal access tokens and paste them into the app settings page. This approach has several security and usability drawbacks:

- Personal access tokens have **full API access** with no scope restrictions
- Tokens **never expire** unless manually revoked
- Tokens are stored in browser `localStorage` (accessible to any JavaScript on the page)
- No institutional visibility or control over token usage
- Users must navigate Canvas settings to generate tokens (error-prone)
- No audit trail for API usage

This application is a Next.js web app deployed on Vercel at `https://canvas-feedback-manager.vercel.app`. It needs a secure, auditable authentication method appropriate for an institutionally-reviewed web application.

## Decision

Implement **OAuth 2.0 Authorization Code flow** for Canvas API authentication, using Canvas Developer Keys with enforced read-only scopes. OAuth tokens will be stored server-side in encrypted HTTP-only cookies using `iron-session`.

### Why Authorization Code flow (not PKCE)?

Canvas LMS does not support PKCE (Proof Key for Code Exchange). Canvas requires `client_secret` for the authorization code exchange. In a Next.js server-side context, this is acceptable because:

- The `client_secret` is stored as a Vercel environment variable, never exposed to the browser
- The token exchange happens entirely server-side in Next.js API routes
- The secret alone grants no access — it only works with a user-approved authorization code

### Why not keep manual token entry as a fallback?

Manual tokens will be **removed entirely**. This eliminates the risk of tokens being stored in localStorage and ensures all API access goes through the scoped, auditable OAuth flow.

## Architecture

### OAuth Flow

```
User clicks "Sign in with Canvas"
  → Browser redirects to Canvas /login/oauth2/auth with client_id, redirect_uri, state
  → User approves on Canvas (already logged in via institutional SSO)
  → Canvas redirects to https://canvas-feedback-manager.vercel.app/api/oauth/callback
  → Next.js API route captures authorization code, verifies CSRF state
  → Server exchanges code + client_secret for access_token + refresh_token
  → Tokens encrypted and stored in HTTP-only cookie via iron-session
  → All subsequent Canvas API calls use server-side token (auto-refreshes on 401)
  → User never sees or handles tokens
```

### Security Properties

| Property | Personal Token (current) | OAuth (proposed) |
|----------|--------------------------|------------------|
| Token expiry | Never | 1 hour |
| Refresh mechanism | Manual regeneration | Automatic via refresh token |
| Scope | Full API access | Read-only, limited endpoints |
| Token storage | Browser localStorage | Encrypted HTTP-only cookie (server-side) |
| XSS exposure | Token readable by any JS | Token never accessible to JavaScript |
| CSRF protection | None | State parameter verification |
| Institutional control | None | Admin can revoke Developer Key |
| Audit trail | Per-user only | Centralized via Developer Key stats |
| User effort | Navigate Canvas, copy token | Click button, approve in browser |

### Token Storage: iron-session

OAuth tokens are stored using `iron-session`, which provides:

- **Encrypted cookies**: Tokens encrypted with AES-256 using a server-side secret
- **HTTP-only**: Cookies cannot be read by client-side JavaScript (XSS protection)
- **Secure flag**: Cookies only sent over HTTPS in production
- **SameSite=Lax**: CSRF protection at the cookie level
- **Stateless**: No database or external session store required
- **Vercel-compatible**: Works with serverless functions, no persistent server needed

The encryption password is stored as a Vercel environment variable (`SESSION_SECRET`), never in the codebase.

### Scoped Permissions (Read-Only)

The Developer Key enforces access to **only** these endpoints:

| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/api/v1/courses/:id` | Read course info |
| GET | `/api/v1/courses/:course_id/discussion_topics` | List discussion topics |
| GET | `/api/v1/courses/:course_id/discussion_topics/:topic_id/entries` | List discussion entries |
| GET | `/api/v1/courses/:course_id/discussion_topics/:topic_id/entries/:entry_id/replies` | List entry replies |
| GET | `/api/v1/users/:id/profile` | Read user profile |

No write permissions are requested. The application cannot modify any Canvas data.

## Implementation Plan

### New Files

| File | Purpose |
|------|---------|
| `pages/api/oauth/authorize.js` | Initiates OAuth flow: generates CSRF state, redirects to Canvas |
| `pages/api/oauth/callback.js` | Handles Canvas redirect: exchanges code for tokens, creates session |
| `pages/api/oauth/logout.js` | Destroys session, optionally revokes Canvas token |
| `pages/api/oauth/status.js` | Returns current auth status (authenticated or not) to client |
| `lib/session.js` | iron-session configuration and helpers |

### Modified Files

| File | Changes |
|------|---------|
| `pages/api/canvas-proxy.js` | Read OAuth token from session instead of request body |
| `components/canvas/CanvasProvider.js` | Remove localStorage token storage; use session-based auth status |
| `components/canvas/useCanvasAuth.js` | Fetch auth status from `/api/oauth/status`; provide login/logout |
| `pages/settings.js` | Replace token input with "Sign in with Canvas" button and auth status |
| `js/canvasApi.js` | Remove apiKey from request bodies; proxy reads token from session |

### Environment Variables (Vercel)

| Variable | Description |
|----------|-------------|
| `CANVAS_CLIENT_ID` | Developer Key client ID (numeric) |
| `CANVAS_CLIENT_SECRET` | Developer Key client secret |
| `CANVAS_OAUTH_URL` | Canvas instance URL (e.g., `https://bostoncollege.test.instructure.com`) |
| `SESSION_SECRET` | 32+ character random string for iron-session encryption |
| `NEXT_PUBLIC_APP_URL` | Application URL for redirect URI construction |

### Key Security Design Choices

1. **No tokens in the browser**: OAuth tokens are never sent to or stored in the client. The encrypted session cookie is HTTP-only and cannot be read by JavaScript.

2. **CSRF state parameter**: A cryptographically random state value is generated per OAuth flow, stored in the session, and verified on callback to prevent cross-site request forgery.

3. **Server-side token refresh**: The canvas-proxy API route detects 401 responses, uses the refresh token to get a new access token, updates the session, and retries — all server-side.

4. **Minimal scopes**: Only read-only endpoints required for discussion browsing are permitted. The application cannot modify any Canvas data.

5. **Secret management**: All secrets (`CANVAS_CLIENT_SECRET`, `SESSION_SECRET`) are stored as Vercel environment variables, never in the codebase or client bundle.

6. **Secure cookie configuration**:
   - `httpOnly: true` — prevents XSS token theft
   - `secure: true` in production — HTTPS only
   - `sameSite: 'lax'` — CSRF protection
   - Short `ttl` matching Canvas token expiry

## Canvas Admin Setup

### Developer Key Configuration

1. Navigate to: Canvas Admin → Developer Keys → + Developer Key → API Key
2. **Key Name**: "Canvas Discussion Browser" (or "Canvas Discussion Browser (Test)" for test)
3. **Owner Email**: (your institutional email)
4. **Redirect URI**: `https://canvas-feedback-manager.vercel.app/api/oauth/callback`
5. **Redirect URI (development)**: Also add `http://localhost:3000/api/oauth/callback` for local development
6. **Enforce Scopes**: Toggle ON, select only the GET endpoints listed above
7. **State**: Set to ON (green checkmark)
8. Copy the **Client ID** (numeric) and **Client Secret**

### Instance Configuration

| Instance | Domain | Status |
|----------|--------|--------|
| Test | `bostoncollege.test.instructure.com` | To be configured |
| Production | `bostoncollege.instructure.com` | Pending institutional approval |

## Security Considerations for RIT Review

### What this application CAN do:
- Read discussion topics, entries, and replies for courses the authenticated user has access to
- Read user profile information for discussion participants
- Cache discussion data in browser localStorage for performance (read-only data only)

### What this application CANNOT do:
- Modify, create, or delete any Canvas data (no write scopes)
- Access data outside the authenticated user's permissions
- Access tokens outside the encrypted session (tokens never in JavaScript)
- Function without user explicitly approving access on the Canvas authorization page

### Data flow:
1. User authenticates via Canvas SSO (institutional credentials never touch this app)
2. Canvas issues scoped OAuth token to this application's server
3. Server stores token in encrypted cookie, uses it for read-only API calls
4. Discussion data displayed in browser, optionally cached in localStorage
5. Session expires naturally or user explicitly logs out

### Infrastructure:
- **Hosting**: Vercel (SOC 2 Type II compliant)
- **Database**: Convex (used for collaborative features, not auth)
- **Secrets**: Vercel environment variables (encrypted at rest)
- **No third-party analytics or tracking**

## Console Logging Cleanup (Security Hardening)

As part of this security improvement, verbose debug logging will be removed or gated behind a development-only check across the codebase. The following files currently log potentially sensitive data to the browser console in production:

### `js/canvasApi.js` (19 console.log statements)
- Logs discussion topic titles, IDs, structure details, and entry counts
- Logs per-user post counts (maps user display names to counts)
- Logs full filtered post arrays with user names and IDs
- **Risk**: Exposes internal Canvas data structure and user information in any user's browser console

### `pages/settings.js` (5 console.log statements)
- Logs Google Sheets ID values and API key presence/absence on every keystroke and save
- **Risk**: Leaks integration configuration details; onChange handlers log on every character typed

### Remediation
- Remove all `DEBUG` prefixed console.log statements
- Remove onChange logging in settings.js (these were development aids)
- Retain only minimal operational logs gated behind `process.env.NODE_ENV === 'development'`

## Next Steps

1. RIT security review of this document
2. Create Developer Key on `bostoncollege.test.instructure.com`
3. Implement OAuth flow in Next.js
4. Test complete flow on test instance
5. Request production Developer Key on `bostoncollege.instructure.com`
6. Deploy to production
