import { useEffect, useState } from 'react';
import Link from 'next/link';
import { fetchCanvasDiscussions, clearCache, getCacheTimestamp } from '../js/canvasApi';
import { fetchCourseEnrollments } from '../js/dataUtils';

export default function RecentActivity() {
  const [courseId, setCourseId] = useState('');
  const [courseName, setCourseName] = useState('');
  const [recentActivity, setRecentActivity] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [dataSource, setDataSource] = useState('');
  const [cacheTimestamp, setCacheTimestamp] = useState(null);
  const [uniqueUsers, setUniqueUsers] = useState(0);

  // Helper: Check if credentials are set
  function credentialsMissing() {
    return !courseId;
  }

  useEffect(() => {
    setCourseId(localStorage.getItem('course_id') || '');
  }, []);

  useEffect(() => {
    if (!courseId) return;
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
    
    loadActivityData()
      .catch(e => {
        console.log = originalLog; // Restore original console.log
        setError(e.message);
      })
      .finally(() => {
        console.log = originalLog; // Restore original console.log
        setLoading(false);
      });
  }, [courseId]);

  useEffect(() => {
    if (!courseId) return;
    async function fetchCourseName() {
      try {
        const res = await fetch('/api/canvas-proxy', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
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
  }, [courseId]);

  async function loadActivityData() {
    // Get all discussion posts
    const allPosts = await fetchCanvasDiscussions({ courseId });
    
    // Get teacher user IDs to exclude from activity feed
    const teacherUserIds = await fetchCourseEnrollments(courseId);
    
    // Filter out teacher posts and create activity feed
    const studentPosts = allPosts.filter(post => {
      const userId = post.user?.id || post.user_id;
      return !teacherUserIds.includes(parseInt(userId)) && !teacherUserIds.includes(userId);
    });
    
    // Sort posts by created_at (most recent first)
    studentPosts.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    
    // Create activity entries
    const activityEntries = studentPosts.map(post => ({
      userName: post.user?.display_name || post.user_name || 'Unknown',
      discussionName: post.topic_title || 'Unknown Discussion',
      createdAt: post.created_at,
      postId: post.id,
      topicId: post.discussion_topic_id
    }));
    
    // Count unique users
    const uniqueUserNames = new Set(activityEntries.map(entry => entry.userName));
    setUniqueUsers(uniqueUserNames.size);
    
    // Update cache timestamp after processing
    const newTimestamp = getCacheTimestamp(courseId);
    setCacheTimestamp(newTimestamp);
    
    setRecentActivity(activityEntries);
  }

  function handleRefreshData() {
    clearCache(courseId);
    setDataSource('');
    setCacheTimestamp(null);
    setLoading(true);
    loadActivityData()
      .then(() => {
        setDataSource('fresh');
        const newTimestamp = getCacheTimestamp(courseId);
        setCacheTimestamp(newTimestamp);
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-red-900 text-white shadow-md mx-auto">
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
            <a href="/" className="text-white hover:text-gray-200 transition-colors">
              <i className="fas fa-home mr-1"></i> Home
            </a>
            <a href="/users" className="text-white hover:text-gray-200 transition-colors">
              <i className="fas fa-users mr-1"></i> Users
            </a>
            <a href="/recent-activity" className="text-white hover:text-gray-200 transition-colors border-b">
              <i className="fas fa-clock mr-1"></i> Recent Activity
            </a>
            <a href="/feedback" className="text-white hover:text-gray-200 transition-colors">
              <i className="fas fa-comments mr-1"></i> Feedback
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
        <p className="text-gray-600 mb-6 font-bold">Recent student activity across all discussion topics, excluding teacher posts.</p>
        
        {credentialsMissing() ? (
          <div className="bg-yellow-100 border-l-4 border-yellow-500 text-yellow-900 p-6 mb-8 rounded">
            <h2 className="text-xl font-bold mb-2">Canvas API Credentials Required</h2>
            <p className="mb-2">To use this app, you must provide your Canvas API URL, Access Token, and Course ID.</p>
            <Link href="/settings" className="text-red-900 underline font-semibold">Go to Settings</Link>
          </div>
        ) : (
          <div>
            <div className="bg-white rounded-lg shadow-md p-6 mb-6">
              <div className="flex justify-between items-center mb-6">
                <div className="flex items-center gap-4">
                  <h2 className="text-2xl font-semibold text-gray-800">Recent Activity - {uniqueUsers} Users</h2>
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
                <button
                  className="bg-gray-600 text-white px-3 py-2 rounded-md font-semibold hover:bg-gray-700 transition-colors whitespace-nowrap"
                  onClick={handleRefreshData}
                  disabled={loading}
                >
                  🔄 Refresh
                </button>
              </div>

              <div className="space-y-4">
                {loading ? (
                  <div className="text-red-900 font-semibold">Loading recent activity...</div>
                ) : error ? (
                  <div className="text-red-700 font-semibold">{error}</div>
                ) : recentActivity.length === 0 ? (
                  <div className="text-gray-500">No recent activity found.</div>
                ) : (
                  recentActivity.map((activity, index) => (
                    <div key={index} className="border border-gray-200 rounded-lg p-4 bg-white hover:bg-gray-50 transition-colors">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-3">
                          <div className="flex-shrink-0">
                            <div className="h-8 w-8 rounded-full bg-red-100 flex items-center justify-center text-red-900 font-semibold text-sm">
                              {activity.userName.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)}
                            </div>
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-sm text-gray-900">
                              <Link 
                                href={`/user/${encodeURIComponent(activity.userName)}`}
                                className="font-medium text-red-900 hover:underline"
                              >
                                {activity.userName}
                              </Link>
                              {' '}posted to{' '}
                              <span className="font-medium text-gray-700">{activity.discussionName}</span>
                              {' '}at{' '}
                              <span className="text-gray-600">{new Date(activity.createdAt).toLocaleString()}</span>
                            </p>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}