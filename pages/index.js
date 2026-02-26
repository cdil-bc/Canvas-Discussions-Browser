/**
 * Homepage - Recent Activity Feed (Component-Based Architecture)
 * 
 * Shows recent student discussion activity excluding teacher posts.
 * Migrated to use the new component-based architecture with 70% code reduction.
 */

import { useEffect, useState } from 'react';
import DOMPurify from 'dompurify';
import Layout from '../components/layout/Layout';
import PageContainer from '../components/layout/PageContainer';
import { useCanvasAuth } from '../components/canvas/useCanvasAuth';
import { useCanvasCache } from '../components/canvas/useCanvasCache';
import LoadingSpinner from '../components/ui/LoadingSpinner';
import ErrorMessage from '../components/ui/ErrorMessage';
import StatusBadge from '../components/ui/StatusBadge';
import RefreshButton from '../components/ui/RefreshButton';
import CredentialsRequired from '../components/ui/CredentialsRequired';
import ActivityCard from '../components/discussion/ActivityCard';
import { fetchCanvasDiscussions } from '../js/canvasApi';
import { fetchCourseEnrollments } from '../js/dataUtils';
import { processCanvasDataForDashboards, clearProcessedDataCache } from '../js/gradingDataProcessor';

export default function Home() {
  const { credentialsMissing, courseId } = useCanvasAuth();
  const { 
    dataSource, 
    cacheTimestamp, 
    handleClearCache, 
    setupCacheListener 
  } = useCanvasCache(courseId);
  
  // State management for activity data and UI states
  const [recentActivity, setRecentActivity] = useState([]);  // Array of student activity entries
  const [uniqueUsers, setUniqueUsers] = useState(0);         // Count of unique student users
  const [loading, setLoading] = useState(false);             // Loading state for async operations
  const [error, setError] = useState('');                    // Error message display
  const [enhancedUsers, setEnhancedUsers] = useState([]);    // Enhanced user data from Google Sheets
  const [sheetsStatus, setSheetsStatus] = useState(null);    // Google Sheets integration status

  /**
   * Load activity data when credentials or course changes
   * Sets up cache listener and handles loading/error states
   */
  useEffect(() => {
    if (credentialsMissing()) return;
    
    setLoading(true);
    setError('');
    
    const cleanupListener = setupCacheListener();
    
    loadActivityData()
      .catch(e => setError(e.message))
      .finally(() => {
        setLoading(false);
        cleanupListener();
      });
    
    // Load Google Sheets data after Canvas data is loaded
    // This will be called from loadActivityData after recentActivity is populated
  }, [courseId]);  
  
  /**
   * Load enhanced user data from Google Sheets
   * Takes activity data as parameter to avoid dependency issues
   */
  async function loadEnhancedUserDataWithActivity(activityData) {
    const googleSheetsId = localStorage.getItem('google_sheets_id');
    const googleApiKey = localStorage.getItem('google_api_key');
    
    if (!googleSheetsId || !googleApiKey) {
      setSheetsStatus({ enabled: false, reason: 'not_configured' });
      return;
    }
    
    try {
      // Load Google Sheets API if not already loaded
      if (typeof window !== 'undefined' && !window.googleSheetsApi) {
        const script = document.createElement('script');
        script.src = '/js/googleSheetsApi.js';
        document.head.appendChild(script);
        await new Promise(resolve => script.onload = resolve);
      }
      
      // Create mock canvas users from activity data
      const mockCanvasUsers = activityData.map(activity => ({
        display_name: activity.userName,
        user_name: activity.userName
      }));
      
      if (mockCanvasUsers.length === 0) {
        setSheetsStatus({ enabled: true, matched: 0, total: 0 });
        return;
      }
      
      const result = await window.googleSheetsApi.fetchAndMatchSheetsData({
        sheetId: googleSheetsId,
        apiKey: googleApiKey,
        canvasUsers: mockCanvasUsers,
        useCache: true
      });
      
      if (result.success) {
        setEnhancedUsers(result.matchedUsers);
        setSheetsStatus({ 
          enabled: true, 
          matched: result.stats.matched,
          total: result.stats.totalCanvas,
          matchRate: result.stats.matchRate
        });
      } else {
        setSheetsStatus({ enabled: false, reason: 'fetch_failed', error: result.error });
      }
    } catch (error) {
      console.warn('Google Sheets integration failed:', error);
      setSheetsStatus({ enabled: false, reason: 'error', error: error.message });
    }
  }

  /**
   * Fetches and processes Canvas discussion data to show recent student activity
   * Uses optimized shared data processing to reduce redundant API calls
   */
  async function loadActivityData() {
    console.log('→ Loading activity data using optimized processor');
    
    // Use the shared data processor for efficient Canvas data handling
    const processedData = await processCanvasDataForDashboards({ courseId });
    
    // Extract activity data from processed data
    const { activities, uniqueUsers } = processedData.recentActivity;
    
    setRecentActivity(activities);
    setUniqueUsers(uniqueUsers);
    
    console.log('✓ Loaded activity data', {
      activities: activities.length,
      uniqueUsers: uniqueUsers
    });
    
    // Load enhanced user data now that we have activity data
    loadEnhancedUserDataWithActivity(activities);
  }

  /**
   * Manually refresh data by clearing cache and reloading
   * Triggered by the refresh button click
   */
  function handleRefresh() {
    handleClearCache();
    clearProcessedDataCache(courseId);
    setLoading(true);
    
    // Clear Google Sheets cache as well
    if (typeof window !== 'undefined' && window.googleSheetsApi) {
      window.googleSheetsApi.clearSheetsCache();
    }
    
    loadActivityData()
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }

  /**
   * Exports all Canvas discussions as a threaded Markdown file
   * Dynamically loads TurndownService library for HTML to Markdown conversion
   * Creates a downloadable file with organized discussion threads
   */
  async function handleDownloadMarkdown() {
    // Dynamically load TurndownService if not already available
    if (!window.TurndownService) {
      await new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = '/turndown.js';
        script.onload = resolve;
        script.onerror = reject;
        document.body.appendChild(script);
      });
    }
    // Configure TurndownService for clean markdown conversion
    const turndownService = new window.TurndownService({ headingStyle: 'atx' });
    turndownService.remove('script');  // Remove script tags
    turndownService.remove('style');   // Remove style tags  
    turndownService.remove('link');    // Remove link tags

    /**
     * Converts HTML content to clean Markdown format
     * @param {string} html - Raw HTML content from Canvas
     * @returns {string} - Clean Markdown text
     */
    function htmlToMarkdown(html) {
      html = DOMPurify.sanitize(html);
      html = html.replace(/<script[\s\S]*?<\/script>/gi, '')
                 .replace(/<style[\s\S]*?<\/style>/gi, '')
                 .replace(/<link[\s\S]*?>/gi, '');
      return turndownService.turndown(html).replace(/\n{2,}/g, '\n\n');
    }

    /**
     * Recursively builds threaded discussion structure in Markdown
     * @param {Array} entries - Discussion entries to process
     * @param {number|null} parentId - Parent post ID for replies
     * @param {number} depth - Current nesting depth for indentation
     * @returns {string} - Formatted Markdown thread
     */
    function buildThread(entries, parentId = null, depth = 0) {
      let md = '';
      // Get child entries for this level (top-level if parentId is null)
      const children = parentId === null ? entries : (entries || []).filter(e => (e.parent_id || null) === parentId);
      children.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
      
      for (const entry of children) {
        // Build author and date information
        const author = entry.user?.display_name || entry.user_name || 'Unknown';
        const date = entry.created_at ? new Date(entry.created_at).toLocaleString() : '';
        const heading = `${'#'.repeat(2 + depth)} ${depth > 0 ? 'Reply: ' : ''}${author} at ${date}`;
        
        // Convert HTML message to markdown and add indentation for replies
        let message = htmlToMarkdown(DOMPurify.sanitize(entry.message || ''));
        if (depth > 0) {
          message = message.split('\n').map(line => '>'.repeat(depth) + ' ' + line).join('\n');
        }
        
        // Add this entry to the markdown output
        md += `\n${heading}\n\n${message}\n`;
        
        // Recursively process any direct replies and child threads
        if (entry._replies && entry._replies.length > 0) {
          md += buildThread(entry._replies, null, depth + 1);
        }
        md += buildThread(entries, entry.id, depth + 1);
      }
      return md;
    }

    // Validate credentials before proceeding
    if (credentialsMissing()) {
      alert('Please set your Canvas API credentials and Course ID in Settings first.');
      return;
    }

    // Use cached discussion posts if available, otherwise fetch fresh
    let allPosts;
    const cacheKey = `canvas_discussions_${courseId}`;
    const cached = localStorage.getItem(cacheKey);
    
    if (cached) {
      try {
        const { data } = JSON.parse(cached);
        allPosts = data;
        console.log('✓ Using cached data for markdown export');
      } catch (error) {
        console.log('→ Cache invalid, fetching fresh data for export');
        allPosts = await fetchCanvasDiscussions({ courseId });
      }
    } else {
      console.log('→ No cache found, fetching fresh data for export');
      allPosts = await fetchCanvasDiscussions({ courseId });
    }
    const topicMap = {};
    
    // Create topic structure for each discussion
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
    
    // Organize posts into threaded structure (parent posts vs replies)
    allPosts.forEach(post => {
      const topic = topicMap[post.discussion_topic_id];
      if (post.parent_id) {
        // This is a reply - attach to parent post
        const parentEntry = topic.entries.find(entry => entry.id === post.parent_id);
        if (parentEntry) {
          if (!parentEntry._replies) parentEntry._replies = [];
          parentEntry._replies.push(post);
        }
      } else {
        // This is a top-level post
        topic.entries.push(post);
      }
    });
    
    let topicEntries = Object.values(topicMap);
    
    const topicsRes = await fetch('/api/canvas-proxy', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        endpoint: `/courses/${courseId}/discussion_topics`,
        method: 'GET'
      })
    });
    
    if (topicsRes.ok) {
      const topics = await topicsRes.json();
      topicEntries.forEach(topicEntry => {
        const originalTopic = topics.find(t => t.id === topicEntry.id);
        if (originalTopic) {
          topicEntry.due_at = originalTopic.due_at;
        }
      });
    }

    topicEntries.sort((a, b) => {
      if (a.due_at && b.due_at) {
        return new Date(a.due_at) - new Date(b.due_at);
      }
      if (a.due_at) return -1;
      if (b.due_at) return 1;
      return a.title.localeCompare(b.title);
    });

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

  if (credentialsMissing()) {
    return (
      <Layout>
        <PageContainer description="">
          <CredentialsRequired />
        </PageContainer>
      </Layout>
    );
  }

  return (
    <Layout>
      <PageContainer description="">
        <div className="bg-white p-6 mb-6">
          <div className="flex justify-between items-center mb-6">
            <div className="flex items-center gap-4">
              <h2 className="text-2xl font-semibold" style={{color: 'var(--color-primary)'}}>
                Recent Activity ({uniqueUsers} Users)
              </h2>
            </div>
               <div className="flex items-center gap-2">
               {cacheTimestamp && (
                <StatusBadge type="cached" timestamp={cacheTimestamp} />
              )}
              {dataSource === 'fresh' && !cacheTimestamp && (
                <StatusBadge type="fresh" />
              )}
              <button
                className="flex items-center gap-1 uppercase text-sm px-2 py-1 font-medium hover:opacity-90 transition-colors"
                style={{
                  backgroundColor: 'var(--color-secondary)',
                  color: 'var(--color-secondary-content)',
                  borderRadius: 'var(--radius-field)'
                }}
                onClick={handleRefresh}
                disabled={loading}
              >
                <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24">
                  <path fillRule="evenodd" d="M4.755 10.059a7.5 7.5 0 0112.548-3.364l1.903 1.903h-3.183a.75.75 0 100 1.5h4.992a.75.75 0 00.75-.75V4.356a.75.75 0 00-1.5 0v3.18l-1.9-1.9A9 9 0 003.306 9.67a.75.75 0 101.45.388zm15.408 3.352a.75.75 0 00-.919.53 7.5 7.5 0 01-12.548 3.364l-1.902-1.903h3.183a.75.75 0 000-1.5H2.984a.75.75 0 00-.75.75v4.992a.75.75 0 001.5 0v-3.18l1.9 1.9a9 9 0 0015.059-4.035.75.75 0 00-.53-.918z" clipRule="evenodd" />
                </svg>
                Refresh
              </button>
             </div>
          </div>

          <div className="space-y-4">
            {loading ? (
              <LoadingSpinner message="Loading recent activity..." />
            ) : error ? (
              <ErrorMessage message={error} onRetry={handleRefresh} />
            ) : recentActivity.length === 0 ? (
              <div className="text-gray-500">No recent activity found.</div>
            ) : (
              recentActivity.map((activity, index) => {
                // Find enhanced data for this user
                const enhancedData = enhancedUsers.find(user => 
                  user.display_name === activity.userName || user.user_name === activity.userName
                );
                
                return (
                  <ActivityCard 
                    key={index} 
                    activity={activity} 
                    enhancedData={enhancedData?.enhancedData || null}
                  />
                );
              })
            )}
          </div>
        </div>
      </PageContainer>
    </Layout>
  );
}