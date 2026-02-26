# OAuth Troubleshooting Log

## Date
2026-02-26

## Current Status
OAuth flow works with Enforce Scopes OFF. Fails with Enforce Scopes ON (Canvas returns `access_denied` immediately without showing authorization prompt).

## Environment
- **App URL**: https://canvas-feedback-manager.vercel.app
- **Canvas Test Instance**: https://bostoncollege.test.instructure.com
- **Hosting**: Vercel
- **Branch**: `feature/canvas-oauth`

## Vercel Environment Variables Configured
- `CANVAS_CLIENT_ID` - Developer Key numeric ID
- `CANVAS_CLIENT_SECRET` - Developer Key secret
- `CANVAS_OAUTH_URL` - `https://bostoncollege.test.instructure.com`
- `NEXT_PUBLIC_APP_URL` - `https://canvas-feedback-manager.vercel.app`
- `SESSION_SECRET` - 32+ char random string
- `NEXT_PUBLIC_CONVEX_URL` - Convex cloud URL

## Developer Key Configuration (Canvas Test Instance)
- **Key Name**: Canvas Feedback Manager (Test)
- **Redirect URI**: `https://canvas-feedback-manager.vercel.app/api/oauth/callback`
- **State**: ON (green checkmark)
- **Enforce Scopes**: ON (causes the issue)
- **Allow Include Parameters**: tested both checked and unchecked

## Scopes Configured on Developer Key
All eight scopes verified checked:
1. `url:GET|/api/v1/courses/:id`
2. `url:GET|/api/v1/courses/:course_id/discussion_topics`
3. `url:GET|/api/v1/courses/:course_id/discussion_topics/:topic_id/entries`
4. `url:GET|/api/v1/courses/:course_id/enrollments`
5. `url:GET|/api/v1/courses/:course_id/assignments`
6. `url:GET|/api/v1/courses/:course_id/assignments/:assignment_id/submissions`
7. `url:GET|/api/v1/courses/:course_id/assignments/:assignment_id/submissions/:user_id`
8. `url:GET|/api/v1/users/:user_id/profile`

## What Works
- OAuth flow completes successfully with Enforce Scopes OFF
- User is redirected to Canvas SSO, logs in, approves, and returns to app authenticated
- Session cookie is created, user name displayed
- A separate Developer Key (for the Tauri DesignPlus Automator app) works with Enforce Scopes ON on the same Canvas test instance

## Troubleshooting Steps Tried

### 1. Empty scope parameter
- **Problem**: Initial code sent `scope=` (empty string) in authorize URL
- **Fix**: Removed scope parameter entirely
- **Result**: Still failed with `access_denied`

### 2. Explicit scopes in authorize request
- **Problem**: Canvas may require scope parameter when Enforce Scopes is ON
- **Fix**: Added all 8 scopes space-separated in the `scope` parameter
- **Result**: Still failed with `access_denied`

### 3. Single scope test
- **Problem**: Isolate whether a specific scope is invalid
- **Fix**: Set only `url:GET|/api/v1/courses/:id` on Developer Key
- **Result**: Still failed -- suggests the issue is not a specific invalid scope

### 4. Direct URL test
- **Test**: Visited Canvas authorize URL directly in browser with correct client_id, redirect_uri, and state
- **URL**: `https://bostoncollege.test.instructure.com/login/oauth2/auth?client_id=<ID>&response_type=code&redirect_uri=https://canvas-feedback-manager.vercel.app/api/oauth/callback&state=test123`
- **Result**: Immediately bounced back to callback with `error=access_denied` (no authorization prompt shown)

### 5. Env var validation
- **Checked**: All Vercel env vars for trailing whitespace/newlines (found and fixed one on CANVAS_CLIENT_ID)
- **Checked**: CANVAS_OAUTH_URL has no `/api/v1` suffix or trailing slash
- **Checked**: Client ID matches Developer Key numeric ID in Canvas

### 6. Vercel logs review
- **Observed**: `/api/oauth/authorize` returns 302 (correct redirect to Canvas)
- **Observed**: `/api/oauth/callback` returns 307 (redirect back to app with error)
- **Conclusion**: Canvas is processing the request and actively rejecting it, not a network/routing issue

### 7. Allow Include Parameters
- **Tested**: Checkbox both on and off
- **Result**: No difference

## Hypotheses for Next Session

### Most Likely: Canvas scope parameter encoding issue
The `|` character in scope strings like `url:GET|/api/v1/courses/:id` gets URL-encoded to `%7C` by `URLSearchParams`. Canvas may expect the literal `|` or a different encoding. The working Tauri app may handle this differently.

**To test**: Log the exact authorize URL being generated and compare the scope parameter encoding with what Canvas expects. Try manually constructing the URL with different encodings.

### Possible: Canvas test instance scope enforcement behavior
The test instance may have different behavior or a bug with scope enforcement. The working Tauri app is also on the test instance, so this is less likely -- but the Tauri app uses a localhost redirect URI which could be treated differently.

**To test**: Compare the exact Developer Key configuration between the working Tauri key and this key field by field.

### Possible: Scope format mismatch
Canvas may use slightly different scope identifiers internally vs what's displayed in the UI. The scopes we're sending might not match exactly.

**To test**: Check Canvas API docs or source code for the exact scope string format expected in the authorize request. Try sending scopes without the `url:` prefix.

### Possible: Missing required scope
Canvas may require a base scope (like `user_profile` or similar) that isn't in our list.

**To test**: Check if there's a default/required scope that must always be included.

## Recommendations for Next Session

### 1. Code Review
Have the next session do a thorough review of:
- `pages/api/oauth/authorize.js` -- compare the authorize URL construction with the Canvas OAuth docs and the working Tauri implementation
- `pages/api/oauth/callback.js` -- verify error handling covers all Canvas error responses
- `lib/session.js` -- verify iron-session config is correct for Vercel serverless
- Check if the Tauri app (`/Users/timlindgren/GitHub/designplus-automator/src-tauri/src/oauth.rs`) passes scopes in the authorize request and how

### 2. Debug Logging
Temporarily add logging to the authorize route to capture the exact URL being generated:
```js
console.log("Authorize URL:", authUrl.toString());
```
Check Vercel logs to see the full URL including encoded scope parameter.

### 3. Canvas API Documentation
- Fetch and review: https://canvas.instructure.com/doc/api/file.oauth_endpoints.html
- Specifically look at the `scope` parameter documentation for `GET /login/oauth2/auth`
- Check if there are any notes about scope format when Enforce Scopes is enabled

### 4. Compare with Working App
Read the Tauri OAuth implementation and compare:
```
/Users/timlindgren/GitHub/designplus-automator/src-tauri/src/oauth.rs
```
- How does it construct the authorize URL?
- Does it pass a scope parameter?
- What scopes are configured on its Developer Key?

### 5. Canvas Community / Support
- Search the Canvas Community forums for "enforce scopes access_denied developer key"
- Consider opening a Canvas support ticket with the specific behavior (works without scope enforcement, fails with it)

### 6. Test Without Scopes in Request
Try sending the authorize request with Enforce Scopes ON on the key but WITHOUT a scope parameter in the request. Canvas documentation suggests that when no scope is requested, the token should get all scopes configured on the key.

## Current Workaround
Enforce Scopes OFF works. This is acceptable for development/testing. The OAuth flow itself (token expiry, server-side storage, institutional control) provides the primary security benefits. Scope enforcement is an additional hardening layer.

## Files Changed in This Branch
See commit history on `feature/canvas-oauth` for full list. Key files:
- `lib/session.js` - iron-session configuration
- `lib/refreshToken.js` - Canvas token refresh logic
- `pages/api/oauth/authorize.js` - OAuth initiation
- `pages/api/oauth/callback.js` - OAuth callback handler
- `pages/api/oauth/logout.js` - Session destruction + token revocation
- `pages/api/oauth/status.js` - Auth status for client
- `pages/api/canvas-proxy.js` - Updated to use session tokens
- `components/canvas/CanvasProvider.js` - OAuth-based auth state
- `components/canvas/useCanvasAuth.js` - OAuth auth hook
- `pages/settings.js` - OAuth UI (sign in/out)
- `js/canvasApi.js` - Removed apiUrl/apiKey, cleaned debug logging
- `js/gradingDataProcessor.js` - Removed apiUrl/apiKey, cleaned debug logging
- `js/dataUtils.js` - Removed apiUrl/apiKey from fetchCourseEnrollments
- All page files - Removed apiUrl/apiKey references
