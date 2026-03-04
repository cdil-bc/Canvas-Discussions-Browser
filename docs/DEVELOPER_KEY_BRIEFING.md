# Canvas Developer Key Request: Security Briefing

**Date**: 2026-02-27  
**Application**: Canvas Discussion Browser  
**Deployment**: https://canvas-feedback-manager.vercel.app  
**Request**: Production Developer Key for Canvas OAuth 2.0

---

## What This Application Does

A read-only tool for educators to browse Canvas discussion forums by student (rather than by topic). Helps instructors assess participation patterns and streamline grading. Features include:

- View all posts by a specific student across all course discussions
- Export discussions as markdown for documentation
- Optional Google Sheets integration for supplemental user profiles

**Key point**: The application only reads data. It cannot create, modify, or delete anything in Canvas.

---

## Why OAuth Instead of Personal Access Tokens

Currently, users must manually generate Canvas personal access tokens. This has security drawbacks:

| Issue | Personal Token | OAuth (Proposed) |
|-------|----------------|------------------|
| Token expiry | Never expires | 1 hour (auto-refreshes) |
| Scope | Full API access | Read-only, specific endpoints only |
| Storage | Browser localStorage (XSS-vulnerable) | Encrypted server-side cookie |
| Institutional control | None | Admin can revoke Developer Key |
| Audit trail | Per-user only | Centralized via Developer Key |

---

## OAuth Implementation Security

### Requested Scopes (Read-Only)

The Developer Key should enforce access to **only** these endpoints:

| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/api/v1/courses/:id` | Read course info |
| GET | `/api/v1/courses/:course_id/discussion_topics` | List discussion topics |
| GET | `/api/v1/courses/:course_id/discussion_topics/:topic_id/entries` | List entries |
| GET | `/api/v1/courses/:course_id/discussion_topics/:topic_id/entries/:entry_id/replies` | List replies |
| GET | `/api/v1/users/:id/profile` | Read user profile |

### Token Handling

- **Tokens never reach the browser** - stored in encrypted HTTP-only cookies using `iron-session`
- **CSRF protection** - state parameter verified on OAuth callback
- **Automatic refresh** - server-side refresh when tokens expire
- **All secrets in Vercel environment variables** - never in codebase

### What the App Cannot Do

- Modify, create, or delete any Canvas data
- Access data outside the authenticated user's permissions
- Access tokens via JavaScript (HTTP-only cookies)
- Function without explicit user approval on Canvas authorization page

---

## NPM Dependencies (6 packages)

| Package | Version | Purpose | Security Notes |
|---------|---------|---------|----------------|
| `next` | 14.2.29 | React framework | Vercel-maintained, widely audited |
| `react` / `react-dom` | 18.2.0 | UI library | Meta-maintained |
| `iron-session` | 8.0.4 | Encrypted session cookies | AES-256 encryption, established library |
| `dompurify` | 3.2.6 | HTML sanitization | Industry standard XSS protection |
| `convex` | 1.27.1 | Database (future features) | Not used for auth |

All dependencies are mainstream, actively maintained packages. Recommend running `npm audit` before production deployment.

---

## Current Status: Test Key

A test Developer Key has been created on `bostoncollege.test.instructure.com`. Testing status:

- [x] OAuth flow initiates correctly (redirects to Canvas)
- [x] User can approve access on Canvas authorization page
- [x] Authorization code returned to callback URL
- [ ] Token exchange and session creation (in progress - scope configuration being resolved)

### Known Issue Being Resolved

Canvas is returning a scope-related error during token exchange. Working through Canvas's scope enforcement requirements with the test key before requesting production.

---

## Path to Production

1. **Complete test key validation** - Full OAuth flow working on test instance
2. **Security review** - This document serves as basis for review
3. **Create production Developer Key** on `bostoncollege.instructure.com`
4. **Configure Vercel environment** with production credentials
5. **Deploy and verify** on production Canvas instance

---

## Developer Key Configuration Checklist

When creating the production key:

1. **Key Name**: "Canvas Discussion Browser"
2. **Redirect URIs**: 
   - `https://canvas-feedback-manager.vercel.app/api/oauth/callback`
   - `http://localhost:3000/api/oauth/callback` (for development)
3. **Enforce Scopes**: ON - select only GET endpoints listed above
4. **State**: ON (required for CSRF protection)

---

## Questions?

Contact: [Your name/email]  
Repository: [GitHub URL if shareable]
