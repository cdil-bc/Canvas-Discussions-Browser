/**
 * Canvas API Client for Next.js Browser Environment
 *
 * Handles all Canvas LMS API interactions for the discussion browser.
 * All requests are routed through /api/canvas-proxy which authenticates
 * using the server-side OAuth session. No API tokens are sent from the client.
 */

async function canvasProxy({ endpoint, method = 'GET', body }) {
  const res = await fetch('/api/canvas-proxy', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ endpoint, method, body })
  });
  if (!res.ok) {
    const error = await res.json().catch(() => ({}));
    if (res.status === 401) {
      throw new Error('AUTH_REQUIRED');
    }
    throw new Error(error.error || 'Failed to fetch from Canvas API');
  }
  return res.json();
}

/**
 * Fetches all discussion posts for a Canvas course with comprehensive pagination.
 * Deduplicates posts, enriches with topic context, and caches in localStorage.
 *
 * @param {Object} params - API parameters
 * @param {string} params.courseId - Canvas course ID
 * @returns {Promise<Array>} Array of all discussion posts with replies
 */
export async function fetchCanvasDiscussions({ courseId }) {
  const cacheKey = `canvas_discussions_${courseId}`;
  const cached = localStorage.getItem(cacheKey);

  if (cached) {
    try {
      const { data } = JSON.parse(cached);
      return data;
    } catch (error) {
      localStorage.removeItem(cacheKey);
    }
  }

  const topics = await canvasProxy({
    endpoint: `/courses/${courseId}/discussion_topics`,
  });

  const seenIds = new Set();
  let allPosts = [];

  for (const topic of topics) {
    let allEntries = [];
    let page = 1;
    let hasMore = true;

    while (hasMore) {
      const entries = await canvasProxy({
        endpoint: `/courses/${courseId}/discussion_topics/${topic.id}/entries?per_page=100&page=${page}&include[]=recent_replies`,
      });

      allEntries = allEntries.concat(entries);
      hasMore = entries.length === 100;
      page++;
    }

    for (const entry of allEntries) {
      if (!seenIds.has(entry.id)) {
        seenIds.add(entry.id);
        entry.topic_title = topic.title;
        entry.discussion_topic_id = topic.id;
        if (typeof topic.assignment_id !== 'undefined') {
          entry.assignment_id = topic.assignment_id;
        }
        allPosts.push(entry);

        const replies = entry.recent_replies || [];
        for (const reply of replies) {
          if (!seenIds.has(reply.id)) {
            seenIds.add(reply.id);
            reply.topic_title = topic.title;
            reply.discussion_topic_id = topic.id;
            reply.parent_id = entry.id;
            if (typeof topic.assignment_id !== 'undefined') {
              reply.assignment_id = topic.assignment_id;
            }
            allPosts.push(reply);
          }
        }
      }
    }
  }

  localStorage.setItem(cacheKey, JSON.stringify({
    data: allPosts,
    timestamp: Date.now()
  }));

  return allPosts;
}

/**
 * Fetches all posts by a specific user, including replies to their posts.
 *
 * @param {Object} params - API parameters
 * @param {string} params.courseId - Canvas course ID
 * @param {string} params.userName - User's display name for filtering
 * @param {string} params.userId - Canvas user ID for filtering (optional but more reliable)
 * @returns {Promise<Array>} Array of user's posts and replies to their posts
 */
export async function fetchCanvasUserPosts({ courseId, userName, userId }) {
  const allPosts = await fetchCanvasDiscussions({ courseId });

  const userMainPosts = allPosts.filter(post => {
    return (
      ((post.user && (post.user.id == userId || post.user.display_name === userName)) ||
       post.user_id == userId ||
       post.user_name === userName) &&
      !post.parent_id
    );
  });

  const userMainPostIds = userMainPosts.map(post => post.id);

  const repliesToUserPosts = allPosts.filter(post => {
    return userMainPostIds.includes(post.parent_id);
  });

  return [...userMainPosts, ...repliesToUserPosts];
}

/**
 * Clears cached discussion data for a specific course
 * Used when user wants fresh data or when settings change
 * 
 * @param {string} courseId - Canvas course ID
 */
export function clearCache(courseId) {
  const cacheKey = `canvas_discussions_${courseId}`;
  localStorage.removeItem(cacheKey);
}

/**
 * Gets the timestamp when discussion data was last cached
 * Used to display cache age to users
 * 
 * @param {string} courseId - Canvas course ID
 * @returns {number|null} Cache timestamp or null if no cache exists
 */
export function getCacheTimestamp(courseId) {
  const cacheKey = `canvas_discussions_${courseId}`;
  const cached = localStorage.getItem(cacheKey);
  
  if (cached) {
    try {
      const { timestamp } = JSON.parse(cached);
      return timestamp;
    } catch (error) {
      return null;
    }
  }
  return null;
}
