import { useEffect, useState } from 'react';
import DOMPurify from 'dompurify';
import Link from 'next/link';
import { fetchCanvasDiscussions, clearCache, getCacheTimestamp } from '../js/canvasApi';

export default function Home() {
  // ...existing state
  // Add this handler to download all discussions as markdown
  // Helper: Check if credentials are set
  function credentialsMissing() {
    return !apiUrl || !apiKey || !courseId;
  }

  async function handleDownloadMarkdown() {
    // Load Turndown library dynamically if not already loaded
    if (!window.TurndownService) {
      await new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = '/turndown.js';
        script.onload = resolve;
        script.onerror = reject;
        document.body.appendChild(script);
      });
    }
    const turndownService = new window.TurndownService({ headingStyle: 'atx' });

    turndownService.remove('script');
    turndownService.remove('style');
    turndownService.remove('link');

    function htmlToMarkdown(html) {
  // Sanitize HTML before converting to markdown (extra safety)
  html = DOMPurify.sanitize(html);
      // Remove script/style/link tags before conversion
      html = html.replace(/<script[\s\S]*?<\/script>/gi, '')
                 .replace(/<style[\s\S]*?<\/style>/gi, '')
                 .replace(/<link[\s\S]*?>/gi, '');
      return turndownService.turndown(html).replace(/\n{2,}/g, '\n\n');
    }

    function buildThread(entries, parentId = null, depth = 0) {
      // Recursively build markdown for entries (posts/replies) in thread order
      let md = '';
      // For top-level, parentId is null, so we use all entries
      const children = parentId === null ? entries : (entries || []).filter(e => (e.parent_id || null) === parentId);
      // Sort by created_at
      children.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
      for (const entry of children) {
        const author = entry.user?.display_name || entry.user_name || 'Unknown';
        const date = entry.created_at ? new Date(entry.created_at).toLocaleString() : '';
        const heading = `${'#'.repeat(2 + depth)} ${depth > 0 ? 'Reply: ' : ''}${author} at ${date}`;
        let message = htmlToMarkdown(DOMPurify.sanitize(entry.message || ''));
        // Indent replies with > for each depth level
        if (depth > 0) {
          message = message.split('\n').map(line => '>'.repeat(depth) + ' ' + line).join('\n');
        }
        md += `\n${heading}\n\n${message}\n`;
        // Recursively add replies from _replies (threaded)
        if (entry._replies && entry._replies.length > 0) {
          md += buildThread(entry._replies, null, depth + 1);
        }
        // Recursively add replies based on parent_id (for legacy flat thread)
        md += buildThread(entries, entry.id, depth + 1);
      }
      return md;
    }

    const apiUrl = localStorage.getItem('canvas_api_url') || '';
    const apiKey = localStorage.getItem('canvas_api_key') || '';
    const courseId = localStorage.getItem('course_id') || '';
    if (credentialsMissing()) {
      alert('Please set your Canvas API credentials and Course ID in Settings first.');
      return;
    }
    // 1. Fetch all posts using the same pagination logic as the homepage
    const allPosts = await fetchCanvasDiscussions({ apiUrl, apiKey, courseId });
    
    // 2. Group posts by topic
    const topicMap = {};
    
    // First, get all unique topics from the posts
    allPosts.forEach(post => {
      if (!topicMap[post.discussion_topic_id]) {
        topicMap[post.discussion_topic_id] = {
          id: post.discussion_topic_id,
          title: post.topic_title,
          assignment_id: post.assignment_id,
          entries: []
        };
      }
    });
    
    // Then organize posts into topic structure
    allPosts.forEach(post => {
      const topic = topicMap[post.discussion_topic_id];
      if (post.parent_id) {
        // This is a reply - find the parent entry and add it to _replies
        const parentEntry = topic.entries.find(entry => entry.id === post.parent_id);
        if (parentEntry) {
          if (!parentEntry._replies) parentEntry._replies = [];
          parentEntry._replies.push(post);
        }
      } else {
        // This is a top-level entry
        topic.entries.push(post);
      }
    });
    
    // Convert to array and fetch due dates
    let topicEntries = Object.values(topicMap);
    
    // Fetch due dates for topics (this requires the original topic data)
    const topicsRes = await fetch('/api/canvas-proxy', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        apiUrl,
        apiKey,
        endpoint: `/courses/${courseId}/discussion_topics`,
        method: 'GET'
      })
    });
    
    if (topicsRes.ok) {
      const topics = await topicsRes.json();
      // Merge due dates into our topic entries
      topicEntries.forEach(topicEntry => {
        const originalTopic = topics.find(t => t.id === topicEntry.id);
        if (originalTopic) {
          topicEntry.due_at = originalTopic.due_at;
        }
      });
    }
    // 3. Sort topics by due date (or title if no due date)
    topicEntries.sort((a, b) => {
      if (a.due_at && b.due_at) {
        return new Date(a.due_at) - new Date(b.due_at);
      }
      if (a.due_at) return -1;
      if (b.due_at) return 1;
      return a.title.localeCompare(b.title);
    });
    // 4. Format as markdown
    let md = '';
    for (const topic of topicEntries) {
      md += `# ${topic.title}\n`;
      if (topic.due_at) {
        md += `*Due: ${new Date(topic.due_at).toLocaleString()}*\n`;
      }
      if (topic.entries && topic.entries.length > 0) {
        md += buildThread(topic.entries);
      } else {
        md += '\n_No posts in this topic._\n';
      }
      md += '\n---\n\n';
    }
    // 5. Trigger file download
    const blob = new Blob([md], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `canvas-discussions-${courseId}.md`;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 100);
  }

  const [apiUrl, setApiUrl] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [courseId, setCourseId] = useState('');
  const [courseName, setCourseName] = useState('');
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [dataSource, setDataSource] = useState('');
  const [cacheTimestamp, setCacheTimestamp] = useState(null);

  useEffect(() => {
    setApiUrl(localStorage.getItem('canvas_api_url') || '');
    setApiKey(localStorage.getItem('canvas_api_key') || '');
    setCourseId(localStorage.getItem('course_id') || '');
  }, []);

  useEffect(() => {
    if (!apiUrl || !apiKey || !courseId) return;
    setLoading(true);
    setError('');
    setDataSource('');
    
    // Check for existing cache timestamp
    const existingTimestamp = getCacheTimestamp(courseId);
    setCacheTimestamp(existingTimestamp);
    
    // Listen for console messages to detect cache usage
    const originalLog = console.log;
    console.log = function(...args) {
      if (args[0] === '✓ Using cached discussion data') {
        setDataSource('cached');
        setCacheTimestamp(existingTimestamp);
      } else if (args[0] === '→ Fetching fresh discussion data from Canvas API') {
        setDataSource('fresh');
        setCacheTimestamp(null);
      }
      originalLog.apply(console, args);
    };
    
    fetchCanvasDiscussions({ apiUrl, apiKey, courseId })
      .then(posts => {
        console.log = originalLog; // Restore original console.log
        
        // Update cache timestamp after fetch
        const newTimestamp = getCacheTimestamp(courseId);
        setCacheTimestamp(newTimestamp);
        
        if (posts.length > 0) {
          // Debug: log the first post to see structure
          console.log('First post:', posts[0]);
        }
        // Group posts by user
        const userMap = {};
        posts.forEach(post => {
          // Try several possible fields for name
          const name = post.user?.display_name || post.user_name || 'Unknown';
          const lastActive = post.created_at || '';
          const initials = name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
          const avatar = post.user?.avatar_image_url || null;
          if (!userMap[name]) userMap[name] = { name, count: 0, lastActive, initials, avatar };
          userMap[name].count++;
          if (!userMap[name].lastActive || new Date(post.created_at) > new Date(userMap[name].lastActive)) {
            userMap[name].lastActive = post.created_at;
          }
        });
        setUsers(Object.values(userMap).sort((a, b) => b.count - a.count));
      })
      .catch(e => {
        console.log = originalLog; // Restore original console.log
        setError(e.message);
      })
      .finally(() => setLoading(false));
  }, [apiUrl, apiKey, courseId]);

  useEffect(() => {
    if (!apiUrl || !apiKey || !courseId) return;
    async function fetchCourseName() {
      try {
        const res = await fetch('/api/canvas-proxy', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            apiUrl,
            apiKey,
            endpoint: `/courses/${courseId}`,
            method: 'GET'
          })
        });
        if (res.ok) {
          const data = await res.json();
          setCourseName(data.name || '');
        } else {
          setCourseName('');
        }
      } catch {
        setCourseName('');
      }
    }
    fetchCourseName();
  }, [apiUrl, apiKey, courseId]);

  const filteredUsers = users.filter(user =>
    user.name.toLowerCase().includes(search.toLowerCase())
  );

  function handleRefreshData() {
    clearCache(courseId);
    setDataSource('');
    setCacheTimestamp(null);
    // Trigger re-fetch by updating a dependency
    setLoading(true);
    fetchCanvasDiscussions({ apiUrl, apiKey, courseId })
      .then(posts => {
        const userMap = {};
        posts.forEach(post => {
          const name = post.user?.display_name || post.user_name || 'Unknown';
          const lastActive = post.created_at || '';
          const initials = name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
          const avatar = post.user?.avatar_image_url || null;
          if (!userMap[name]) userMap[name] = { name, count: 0, lastActive, initials, avatar };
          userMap[name].count++;
          if (!userMap[name].lastActive || new Date(post.created_at) > new Date(userMap[name].lastActive)) {
            userMap[name].lastActive = post.created_at;
          }
        });
        setUsers(Object.values(userMap).sort((a, b) => b.count - a.count));
        setDataSource('fresh');
        // Update timestamp after successful refresh
        const newTimestamp = getCacheTimestamp(courseId);
        setCacheTimestamp(newTimestamp);
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-red-900 text-white shadow-md  mx-auto">
        <div className="container mx-auto max-w-6xl px-4 py-4 flex justify-between items-center">
          <div className="flex items-center">
            <h1 className="text-2xl font-bold flex items-center">
              <a href="/" className="flex items-center hover:text-gray-200 transition-colors">
                <i className="fas fa-comments mr-2"></i>Canvas Discussion Browser
              </a>
              <span className="ml-4 text-lg font-normal text-gray-200">{courseName ? courseName : 'Loading...'}</span>
            </h1>
          </div>
          <nav className="flex items-center space-x-4 text-sm">
            <a href="/" className="text-white hover:text-gray-200 transition-colors border-b">
              <i className="fas fa-home mr-1"></i> Home
            </a>
            <a href="/verify" className="text-white hover:text-gray-200 transition-colors">
              <i className="fas fa-check-double mr-1"></i> Verify
            </a>
            <a href="/analysis" className="text-white hover:text-gray-200 transition-colors">
              <i className="fas fa-chart-bar mr-1"></i> Analysis
            </a>
            <a href="/settings" className="text-white hover:text-gray-200 transition-colors">
              <i className="fas fa-cog mr-1"></i> Settings
            </a>
            <a href="https://github.com/cdil-bc/Canvas-Discussions-Browser" target="_blank" rel="noopener noreferrer" className="text-white hover:text-gray-200 transition-colors">
              <i className="fab fa-github mr-1"></i> GitHub
            </a>
          </nav>
        </div>
      </header>
      <main className="max-w-6xl mx-auto px-4 py-8">
      <p className="text-gray-600 mb-6 font-bold">An experimental app for viewing a user's discussion posts across all discussion topics.</p>
             
        {credentialsMissing() ? (
          <div className="bg-yellow-100 border-l-4 border-yellow-500 text-yellow-900 p-6 mb-8 rounded">
            <h2 className="text-xl font-bold mb-2">Canvas API Credentials Required</h2>
            <p className="mb-2">To use this app, you must provide your Canvas API URL, Access Token, and Course ID.</p>
            <Link href="/settings" className="text-red-900 underline font-semibold">Go to Settings</Link>
          </div>
        ) : (
          <div>
            <div className="bg-white rounded-lg shadow-md p-6 mb-6">
              <p className="text-gray-600 mb-2">
                {/* Optionally show course ID here */}
              </p>
              <div className="mb-6">
                <div className="flex justify-between items-center mb-6">
                  <div className="flex items-center gap-4">
                    <h2 className="text-2xl font-semibold text-gray-800">Users ({filteredUsers.length})</h2>
                    {cacheTimestamp && (
                      <span className="text-sm px-2 py-1 rounded bg-green-100 text-green-800">
                        ⚡ Last refreshed: {new Date(cacheTimestamp).toLocaleString()}
                      </span>
                    )}
                    {dataSource === 'fresh' && !cacheTimestamp && (
                      <span className="text-sm px-2 py-1 rounded bg-blue-100 text-blue-800">
                        🔄 Fresh data
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="relative">
                      <input
                        type="text"
                        placeholder="Search users..."
                        className="pl-10 pr-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[#501315] focus:border-transparent"
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                      />
                      <i className="fas fa-search absolute left-3 top-3 text-gray-400"></i>
                    </div>
                    <button
                      className="bg-gray-600 text-white px-3 py-2 rounded-md font-semibold hover:bg-gray-700 transition-colors whitespace-nowrap"
                      onClick={handleRefreshData}
                      disabled={loading}
                    >
                      🔄 Refresh
                    </button>
                    <button
                      className="bg-red-900 text-white px-4 py-2 rounded-md font-semibold hover:bg-red-800 transition-colors whitespace-nowrap"
                      onClick={handleDownloadMarkdown}
                    >
                      Download All Discussions
                    </button>
                  </div>
                </div>

                <div className="space-y-3">
                  {loading ? (
                    <div className="text-red-900 font-semibold">Loading users...</div>
                  ) : error ? (
                    <div className="text-red-700 font-semibold">{error}</div>
                  ) : filteredUsers.length === 0 ? (
                    <div className="text-gray-500">No users found.</div>
                  ) : (
                    filteredUsers.map(user => (
                      <Link
                        key={user.name}
                        href={`/user/${encodeURIComponent(user.name)}`}
                        className="block hover:bg-gray-50 rounded-lg p-4 transition-colors duration-150 user-card border border-gray-200"
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center space-x-4">
                            <div className="flex-shrink-0">
                              {user.avatar ? (
                                <img src={user.avatar} alt={user.name} className="h-10 w-10 rounded-full object-cover" />
                              ) : (
                                <div className="h-10 w-10 rounded-full bg-red-100 flex items-center justify-center text-red-900 font-semibold user-initials">
                                  {user.initials}
                                </div>
                              )}
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="text-sm font-medium text-gray-900 truncate user-name">{user.name}</p>
                              <div className="flex items-center text-xs text-gray-500 mt-1">
                                <span className="mr-3"><i className="fas fa-comment-alt mr-1"></i> {user.count} posts</span>
                                <span><i className="fas fa-clock mr-1"></i> Last active: {user.lastActive ? new Date(user.lastActive).toLocaleString() : 'Never'}</span>
                              </div>
                            </div>
                          </div>
                          <div className="text-red-900">
                            <i className="fas fa-chevron-right"></i>
                          </div>
                        </div>
                      </Link>
                    ))
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
