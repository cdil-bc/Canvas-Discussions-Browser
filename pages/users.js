/**
 * Users Page (/users) - Component-Based Architecture
 * 
 * Displays a comprehensive list of all students in the course with grading status indicators.
 * Migrated to use the new component-based architecture with significant code reduction.
 */

import { useEffect, useState } from 'react';
import DOMPurify from 'dompurify';
import Layout from '../components/layout/Layout';
import { useCanvasAuth } from '../components/canvas/useCanvasAuth';
import LoadingSpinner from '../components/ui/LoadingSpinner';
import ErrorMessage from '../components/ui/ErrorMessage';
import CredentialsRequired from '../components/ui/CredentialsRequired';
import UserCard from '../components/discussion/UserCard';
import { fetchCanvasDiscussions } from '../js/canvasApi';

export default function UsersPage() {
  const { credentialsMissing, courseId } = useCanvasAuth();
  
  // State management for users dashboard
  const [users, setUsers] = useState([]);                // Discussion activity data by user
  const [allStudents, setAllStudents] = useState([]);    // Complete student roster from Canvas
  const [ungradedMap, setUngradedMap] = useState({});    // Map of students with ungraded work
  const [loading, setLoading] = useState(false);         // Loading state for async operations
  const [error, setError] = useState('');               // Error message display

  // Markdown export functionality (preserved from original)
  async function handleDownloadMarkdown() {
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
      html = DOMPurify.sanitize(html);
      html = html.replace(/<script[\s\S]*?<\/script>/gi, '')
                 .replace(/<style[\s\S]*?<\/style>/gi, '')
                 .replace(/<link[\s\S]*?>/gi, '');
      return turndownService.turndown(html).replace(/\n{2,}/g, '\n\n');
    }

    function buildThread(entries, parentId = null, depth = 0) {
      let md = '';
      const children = parentId === null ? entries : (entries || []).filter(e => (e.parent_id || null) === parentId);
      children.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
      for (const entry of children) {
        const author = entry.user?.display_name || entry.user_name || 'Unknown';
        const date = entry.created_at ? new Date(entry.created_at).toLocaleString() : '';
        const heading = `${'#'.repeat(2 + depth)} ${depth > 0 ? 'Reply: ' : ''}${author} at ${date}`;
        let message = htmlToMarkdown(DOMPurify.sanitize(entry.message || ''));
        if (depth > 0) {
          message = message.split('\n').map(line => '>'.repeat(depth) + ' ' + line).join('\n');
        }
        md += `\n${heading}\n\n${message}\n`;
        if (entry._replies && entry._replies.length > 0) {
          md += buildThread(entry._replies, null, depth + 1);
        }
        md += buildThread(entries, entry.id, depth + 1);
      }
      return md;
    }

    if (credentialsMissing()) {
      alert('Please set your Canvas API credentials and Course ID in Settings first.');
      return;
    }

    const allPosts = await fetchCanvasDiscussions({ courseId });
    const topicMap = {};
    
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
    
    allPosts.forEach(post => {
      const topic = topicMap[post.discussion_topic_id];
      if (post.parent_id) {
        const parentEntry = topic.entries.find(entry => entry.id === post.parent_id);
        if (parentEntry) {
          if (!parentEntry._replies) parentEntry._replies = [];
          parentEntry._replies.push(post);
        }
      } else {
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

  useEffect(() => {
    if (credentialsMissing()) return;
    setLoading(true);
    setError('');

    async function fetchAll() {
      try {
        // Fetch full roster
        const rosterRes = await fetch('/api/canvas-proxy', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            endpoint: `/courses/${courseId}/users?enrollment_type[]=student&per_page=100`,
            method: 'GET'
          })
        });
        const roster = rosterRes.ok ? await rosterRes.json() : [];
        setAllStudents(roster);

        // Fetch graded topics and submissions
        const topicsRes = await fetch('/api/canvas-proxy', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            endpoint: `/courses/${courseId}/discussion_topics`,
            method: 'GET'
          })
        });
        const topics = topicsRes.ok ? await topicsRes.json() : [];
        
        const allAssignRes = await fetch('/api/canvas-proxy', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            endpoint: `/courses/${courseId}/assignments?per_page=100`,
            method: 'GET'
          })
        });
        let allAssignments = [];
        if (allAssignRes.ok) {
          allAssignments = await allAssignRes.json();
        }
        const assignments = {};
        for (const a of allAssignments) {
          assignments[a.id] = a;
        }
        
        let gradedTopics = topics
          .filter(t => t.assignment_id && assignments[t.assignment_id] && Number(assignments[t.assignment_id].points_possible) >= 1)
          .map(t => ({ ...t, points_possible: Number(assignments[t.assignment_id].points_possible) }));

        let allSubmissions = [];
        for (const topic of gradedTopics) {
          const subRes = await fetch('/api/canvas-proxy', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              endpoint: `/courses/${courseId}/assignments/${topic.assignment_id}/submissions`,
              method: 'GET'
            })
          });
          const subs = subRes.ok ? await subRes.json() : [];
          const subList = Array.isArray(subs) ? subs : Object.values(subs);
          allSubmissions = allSubmissions.concat(subList.map(s => ({ ...s, assignment_id: topic.assignment_id })));
        }

        const ungraded = {};
        for (const student of roster) {
          for (const topic of gradedTopics) {
            const sub = allSubmissions.find(s => s.user_id === student.id && s.assignment_id === topic.assignment_id);
            if (sub && (sub.grade === null || sub.grade === undefined || sub.grade === '')) {
              ungraded[student.id] = true;
              break;
            }
          }
        }
        setUngradedMap(ungraded);

        // Group posts by user for last active
        const posts = await fetchCanvasDiscussions({ courseId });
        const userMap = {};
        posts.forEach(post => {
          const name = post.user?.display_name || post.user_name || 'Unknown';
          const lastActive = post.created_at || '';
          const initials = name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
          const avatar = post.user?.avatar_image_url || null;
          const userId = post.user_id || post.user?.id;
          if (!userMap[userId]) userMap[userId] = { name, count: 0, lastActive, initials, avatar, userId };
          userMap[userId].count++;
          if (!userMap[userId].lastActive || new Date(post.created_at) > new Date(userMap[userId].lastActive)) {
            userMap[userId].lastActive = post.created_at;
          }
        });
        setUsers(userMap);
      } catch (err) {
        setError('Failed to fetch users or submissions.');
      } finally {
        setLoading(false);
      }
    }
    fetchAll();
  }, [courseId]);

  if (credentialsMissing()) {
    return (
      <Layout>
        <CredentialsRequired />
      </Layout>
    );
  }

  return (
    <Layout>
      <div>
        <div className="flex justify-end mb-4">
          <button
            className="text-white px-4 py-2 rounded-md font-semibold hover:opacity-90 transition-colors"
            style={{backgroundColor: '#003957'}}
            onClick={handleDownloadMarkdown}
          >
            Download All Discussions (Markdown)
          </button>
        </div>
        <div className="bg-white rounded-lg shadow-md p-6 mb-6">
          <p className="text-gray-600 mb-6">View participation across all discussion topics, grouped by user.</p>
          <div className="mb-6">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-2xl font-semibold text-gray-800">Users</h2>
              <span className="bg-red-950 px-3 py-1 rounded-full text-white text-sm font-medium">{allStudents.length}</span>
            </div>
            {loading ? (
              <LoadingSpinner message="Loading users..." />
            ) : error ? (
              <ErrorMessage message={error} />
            ) : (
              <>
                <h2 className="text-2xl font-bold mb-6">Users</h2>
                <ul className="divide-y divide-gray-200">
                  {allStudents
                    .map(student => {
                      const user = Object.values(users).find(u => u.userId === student.id) || {
                        name: student.name || student.sortable_name || 'Unknown',
                        count: 0,
                        lastActive: '',
                        initials: (student.name || student.sortable_name || 'U').split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2),
                        avatar: student.avatar_url || null,
                        userId: student.id
                      };
                      return { ...user, hasUngraded: !!ungradedMap[student.id], studentId: student.id };
                    })
                    .sort((a, b) => {
                      if (a.hasUngraded && !b.hasUngraded) return -1;
                      if (!a.hasUngraded && b.hasUngraded) return 1;
                      return new Date(b.lastActive || 0) - new Date(a.lastActive || 0);
                    })
                    .map(user => (
                      <UserCard key={user.studentId} user={user} />
                    ))}
                </ul>
              </>
            )}
          </div>
        </div>
      </div>
    </Layout>
  );
}