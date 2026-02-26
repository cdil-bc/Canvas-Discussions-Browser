import { useEffect, useState } from 'react';
import Link from 'next/link';
import { fetchCanvasDiscussions } from '../js/canvasApi';

export default function Dashboard() {
  const [courseId, setCourseId] = useState('');
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    setCourseId(localStorage.getItem('course_id') || '');
  }, []);

  useEffect(() => {
    if (!courseId) return;
    setLoading(true);
    setError('');
    fetchCanvasDiscussions({ courseId })
      .then(posts => {
        // Group posts by user
        const userMap = {};
        posts.forEach(post => {
          const name = post.author?.display_name || 'Unknown';
          if (!userMap[name]) userMap[name] = { name, count: 0 };
          userMap[name].count++;
        });
        setUsers(Object.values(userMap).sort((a, b) => b.count - a.count));
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [courseId]);

  return (
    <div style={{ maxWidth: 700, margin: '2rem auto', fontFamily: 'sans-serif' }}>
      <h1 style={{ fontSize: 32, fontWeight: 700, marginBottom: 24 }}>Canvas Discussions Dashboard</h1>
      {loading ? (
        <div style={{ color: '#7f1d1d', fontWeight: 600 }}>Loading users...</div>
      ) : error ? (
        <div style={{ color: '#b91c1c', fontWeight: 600 }}>{error}</div>
      ) : (
        <div style={{ background: '#fff', boxShadow: '0 2px 8px #eee', borderRadius: 8, padding: 24 }}>
          <h2 style={{ fontSize: 22, fontWeight: 700, marginBottom: 18 }}>Users</h2>
          <ul style={{ listStyle: 'none', padding: 0 }}>
            {users.map(user => (
              <li key={user.name} style={{ marginBottom: 12 }}>
                <Link href={`/user/${encodeURIComponent(user.name)}`} style={{ color: '#7f1d1d', fontWeight: 500, textDecoration: 'underline' }}>
                  {user.name} ({user.count} posts)
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
