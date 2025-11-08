# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## AI Rules Integration

This project includes comprehensive AI coding guidelines from [.ai-rules/](./.ai-rules/)

For technology-specific rules, see:
- [Tailwind Guidelines](./.ai-rules/rules/project-tech/tailwind/)
- [Security Best Practices](./.ai-rules/rules/user/security-best-practices.md)
- [PRD Custom Instructions](./.ai-rules/rules/user/prd-custom-instructions.md)
- [Coding Assistant Guidelines](./.ai-rules/rules/user/coding-assistant.md)

## Project Overview

Canvas Discussion Browser is a Next.js application that allows educators to view and analyze Canvas LMS discussion posts by user across all course topics. The app includes markdown export functionality for downloading all discussions in a portable format, plus Google Sheets integration for enhanced user profiles with institutional context.

## Documentation

Comprehensive project documentation is located in the `/docs` folder:

- **`docs/CORE_DISCUSSION_BROWSER.md`** - Original Canvas discussion browser features and architecture
- **`docs/ANALYTICS_AND_VERIFICATION.md`** - Advanced analytics and verification dashboard features  
- **`docs/CANVAS_API_INTEGRATION.md`** - Canvas API rules, patterns, and best practices
- **`docs/GOOGLE_SHEETS_INTEGRATION.md`** - Google Sheets integration for enhanced user profiles

These documents provide detailed technical reference for understanding the codebase, Canvas API integration patterns, and feature implementation.

## Development Commands

- `npm run dev` - Start development server on http://localhost:3000
- `npm run build` - Build production version
- `npm start` - Start production server

## Architecture

### API Proxy Pattern
All Canvas API requests are routed through `/api/canvas-proxy.js` to avoid CORS issues and keep API tokens secure. The proxy accepts requests with `apiUrl`, `apiKey`, `endpoint`, `method`, and optional `body` parameters.

### Client-Side Canvas API (`js/canvasApi.js`)
- `fetchCanvasDiscussions()` - Fetches all discussion posts across all topics for a course
- `fetchCanvasUserPosts()` - Filters posts for a specific user, including replies to their posts
- Uses the proxy pattern for all API calls
- Handles deduplication of posts to prevent duplicates in the UI

### Data Flow
1. Credentials stored in browser localStorage (apiUrl, apiKey, courseId)
2. Home page fetches all discussions and groups by user
3. Individual user pages show all posts by that user chronologically
4. Markdown export processes all topics and creates threaded markdown file

### Security Features
- HTML content sanitized with DOMPurify before rendering
- API tokens never hardcoded or committed
- Credentials stored only in localStorage
- No third-party data transmission

### Key Components
- `pages/index.js` - Home page with user list and markdown export
- `pages/user/[user_name].js` - Individual user discussion view with enhanced profiles
- `pages/settings.js` - Credential configuration including Google Sheets setup
- `js/canvasApi.js` - Canvas API integration layer
- `public/js/googleSheetsApi.js` - Google Sheets API client with fuzzy matching

### Markdown Export
Uses Turndown.js library to convert HTML content to markdown. Creates threaded discussion format with nested replies, sorted by due date. Accessible via "Download All Discussions" button on home page.

## Troubleshooting Notes

### Canvas API Pagination
- **Issue**: Canvas API returns paginated results (default ~10-20 items per page)
- **Solution**: Always use `per_page=100&page=X` parameters and loop through all pages
- **Location**: `js/canvasApi.js` - both discussion entries and replies endpoints
- **Symptoms**: Missing posts, fewer users than expected, incomplete data

### Missing Posts Debugging
- Enhanced logging in `canvasApi.js` shows detailed fetch progress
- Console output includes: topics found, entries per page, total counts, user summaries
- Check for: duplicate warnings, missing user data, pagination gaps
- Verify user counts match between Canvas API output and homepage display

### Reflection Analysis Debugging
- **Topic Detection**: `filterGradedReflections()` logs each included reflection topic
- **Post Breakdown**: Student vs teacher posts separated and counted
- **Completion Validation**: Warns if participants exceed maximum possible reflections (3)
- **Data Quality**: Logs reflection topic titles and total counts for verification

### User Grouping
- Users grouped by `display_name` or `user_name` (falls back to 'Unknown')
- Same person with different names across posts = separate users (by design)
- Posts with missing user data logged in console for investigation

## Performance Optimizations

### Browser Caching System
- **Cache Duration**: Manual refresh only (no automatic expiry)
- **Storage**: Browser localStorage with persistent cache until manually cleared
- **Cache Key**: `canvas_discussions_${courseId}` for Canvas data, `sheets_cache_${sheetId}` for Google Sheets
- **Benefits**: Near-instant navigation after initial page load, cache persists during long grading sessions

### Cache Management
- **Manual-only refresh**: Cache persists indefinitely until user clicks "🔄 Refresh"
- **Settings changes**: Cache cleared when API credentials are updated
- **Manual refresh**: "🔄 Refresh" button on homepage for immediate cache clearing
- **Separate caches**: Canvas and Google Sheets data cached independently
- **Visual indicators**: 
  - "⚡ Last refreshed: [timestamp]" (green) = Shows when data was cached with exact timestamp
  - "🔄 Fresh data" (blue) = Just fetched from Canvas API (briefly shown during refresh)

### Implementation Details
- Cache check happens in `fetchCanvasDiscussions()` before API calls
- Console logging shows cache hits vs fresh fetches
- Cache stored as `{data: posts, timestamp: Date.now()}`
- `getCacheTimestamp()` function retrieves cache timestamp for display
- Homepage shows exact refresh time so users can decide when to refresh manually

## Google Sheets Integration

### Enhanced User Profiles
- **Supplemental Data**: Institution, title, notes, assistant type, tags, custom fields
- **Fuzzy Name Matching**: Automatically matches Canvas users with Google Sheets entries
- **Visual Integration**: Enhanced profile sidebars and activity cards
- **Flexible Schema**: 8-column format with optional fields

### Name Matching Algorithm
- **Exact Match Priority**: Direct string comparison first
- **Fuzzy Normalization**: Handles nicknames, middle names, punctuation
- **Subset Matching**: Matches partial names (e.g., "Rebecca Davis" ↔ "Rebecca Frost Davis")
- **Confidence Indicators**: Visual badges show match quality

### Configuration
- **Settings Integration**: Google Sheets ID and API key in settings page
- **Connection Testing**: Built-in verification and data preview
- **Schema Documentation**: Inline guidance for sheet format
- **Error Handling**: Graceful degradation when sheets unavailable