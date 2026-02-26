import { useEffect, useState } from 'react';
import { fetchCanvasDiscussions } from '../js/canvasApi';
import { parseCSV, loadDataFiles, createMasterParticipantListWithVerification } from '../js/dataUtils';

export default function Verify() {
  const [courseId, setCourseId] = useState('');
  const [courseName, setCourseName] = useState('');
  const [canvasUsers, setCanvasUsers] = useState([]);
  const [csvData, setCsvData] = useState({
    registrations: [],
    session1: [],
    session2: [],
    session3: []
  });
  const [matchedData, setMatchedData] = useState([]);
  const [viewFilter, setViewFilter] = useState('all'); // 'false_absent' or 'all'
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  function credentialsMissing() {
    return !courseId;
  }

  useEffect(() => {
    setCourseId(localStorage.getItem('course_id') || '');
  }, []);

  useEffect(() => {
    if (!courseId) return;
    
    // Fetch course name
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
        }
      } catch {
        setCourseName('');
      }
    }
    fetchCourseName();

    // Load Canvas users
    loadCanvasUsers();
  }, [courseId]);

  async function loadCanvasUsers() {
    if (credentialsMissing()) return;
    
    setLoading(true);
    setError('');
    
    try {
      const posts = await fetchCanvasDiscussions({ courseId });
      
      // Extract unique users from Canvas posts using improved logic
      const userMap = {};
      posts.forEach(post => {
        const displayName = post.user?.display_name;
        const userName = post.user_name;
        const userId = post.user?.id;
        const email = post.user?.email;
        
        if (displayName || userName) {
          // Use display name as key since Canvas doesn't provide reliable usernames/emails
          const key = displayName || userName || 'Unknown';
          
          if (!userMap[key]) {
            userMap[key] = {
              displayName: displayName || '',
              userName: userName || '',
              userId: userId || '',
              email: '', // Canvas doesn't provide emails in discussion posts
              postCount: 0
            };
          }
          userMap[key].postCount++;
        }
      });
      
      const canvasUsersArray = Object.values(userMap);
      console.log('Canvas users extracted:', canvasUsersArray.length);
      setCanvasUsers(canvasUsersArray);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  // Auto-load data files from the data directory
  async function handleQuickLoad() {
    setLoading(true);
    setError('');
    setMatchedData([]); // Clear existing data
    
    try {
      console.log('=== STARTING FRESH DATA LOAD ===');
      const loadedData = await loadDataFiles();
      setCsvData(loadedData);
      console.log('Quick loaded data:', loadedData);
    } catch (err) {
      setError(`Error loading data files: ${err.message}`);
    } finally {
      setLoading(false);
    }
  }

  // Handle file uploads
  function handleFileUpload(event, dataType) {
    const file = event.target.files[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const parsedData = parseCSV(e.target.result, file.name);
        setCsvData(prev => ({
          ...prev,
          [dataType]: parsedData
        }));
      } catch (err) {
        setError(`Error parsing ${file.name}: ${err.message}`);
      }
    };
    reader.readAsText(file);
  }

  // Perform matching when data is available
  useEffect(() => {
    if (canvasUsers.length > 0 && (csvData.registrations.length > 0 || csvData.session1.length > 0)) {
      performMatching();
    }
  }, [canvasUsers, csvData]);

  function performMatching() {
    console.log('Performing matching with:', {
      canvasUsers: canvasUsers.length,
      registrations: csvData.registrations.length,
      session1: csvData.session1.length,
      session2: csvData.session2.length,
      session3: csvData.session3.length
    });
    
    console.log('Creating master list with canvas users:', canvasUsers.length);
    const masterList = createMasterParticipantListWithVerification(canvasUsers, csvData);
    console.log('Master list created:', masterList.length);
    setMatchedData(masterList);
    
    // Log summary
    const withDiscrepancies = masterList.filter(p => p.discrepancies.length > 0);
    const falseAbsents = masterList.filter(p => 
      p.discrepancies.some(d => d.type === 'false_absent')
    );
    
    console.log('Discrepancy summary:', {
      totalParticipants: masterList.length,
      withDiscrepancies: withDiscrepancies.length,
      falseAbsents: falseAbsents.length
    });
    
    // Debug first few participants with discrepancies
    if (withDiscrepancies.length > 0) {
      console.log('Sample discrepancies:', withDiscrepancies.slice(0, 3).map(p => ({
        name: p.canvasDisplayName,
        discrepancies: p.discrepancies.map(d => `${d.type}: ${d.message}`)
      })));
      
      // Count discrepancy types
      const discrepancyTypes = {};
      withDiscrepancies.forEach(p => {
        p.discrepancies.forEach(d => {
          discrepancyTypes[d.type] = (discrepancyTypes[d.type] || 0) + 1;
        });
      });
      console.log('Discrepancy types:', JSON.stringify(discrepancyTypes, null, 2));
    }
    
    console.log(`Created master list: ${masterList.length} participants`);
    console.log(`Found ${withDiscrepancies.length} participants with discrepancies`);
    console.log(`Found ${falseAbsents.length} potential false absences`);
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
            <a href="/verify" className="text-white hover:text-gray-200 transition-colors border-b">
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
        <div className="mb-6">
          <h2 className="text-3xl font-bold text-gray-900 mb-2">Attendance Verification</h2>
          <p className="text-gray-600 font-bold">Cross-reference Canvas activity with attendance data to catch discrepancies.</p>
        </div>

        {credentialsMissing() ? (
          <div className="bg-yellow-100 border-l-4 border-yellow-500 text-yellow-900 p-6 mb-8 rounded">
            <h3 className="text-xl font-bold mb-2">Canvas API Credentials Required</h3>
            <p className="mb-2">Please set your Canvas API credentials first.</p>
            <a href="/settings" className="text-red-900 underline font-semibold">Go to Settings</a>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Canvas Data Status */}
            <div className="bg-white rounded-lg shadow-md p-6">
              <h3 className="text-xl font-semibold mb-4">Canvas Discussion Data</h3>
              {loading ? (
                <div className="text-red-900 font-semibold">Loading Canvas users...</div>
              ) : error ? (
                <div className="text-red-700 font-semibold">{error}</div>
              ) : (
                <div className="text-green-700 font-semibold">
                  ✓ Loaded {canvasUsers.length} users from Canvas discussions
                </div>
              )}
            </div>

            {/* File Upload Section */}
            <div className="bg-white rounded-lg shadow-md p-6">
              <h3 className="text-xl font-semibold mb-4">Upload Attendance Data</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Registrations CSV
                  </label>
                  <input
                    type="file"
                    accept=".csv"
                    onChange={(e) => handleFileUpload(e, 'registrations')}
                    className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-red-50 file:text-red-700 hover:file:bg-red-100"
                  />
                  {csvData.registrations.length > 0 && (
                    <div className="text-green-700 text-sm mt-1">
                      ✓ {csvData.registrations.length} registrations loaded
                    </div>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Session 1 Attendance CSV
                  </label>
                  <input
                    type="file"
                    accept=".csv"
                    onChange={(e) => handleFileUpload(e, 'session1')}
                    className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-red-50 file:text-red-700 hover:file:bg-red-100"
                  />
                  {csvData.session1.length > 0 && (
                    <div className="text-green-700 text-sm mt-1">
                      ✓ {csvData.session1.length} participants loaded
                    </div>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Session 2 Attendance CSV
                  </label>
                  <input
                    type="file"
                    accept=".csv"
                    onChange={(e) => handleFileUpload(e, 'session2')}
                    className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-red-50 file:text-red-700 hover:file:bg-red-100"
                  />
                  {csvData.session2.length > 0 && (
                    <div className="text-green-700 text-sm mt-1">
                      ✓ {csvData.session2.length} participants loaded
                    </div>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Session 3 Attendance CSV
                  </label>
                  <input
                    type="file"
                    accept=".csv"
                    onChange={(e) => handleFileUpload(e, 'session3')}
                    className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-red-50 file:text-red-700 hover:file:bg-red-100"
                  />
                  {csvData.session3.length > 0 && (
                    <div className="text-green-700 text-sm mt-1">
                      ✓ {csvData.session3.length} participants loaded
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Quick Load Button for Development */}
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <p className="text-sm text-blue-800 mb-2">
                <strong>Quick Load:</strong> Load data files from the /data folder for testing
              </p>
              <button
                onClick={handleQuickLoad}
                disabled={loading}
                className="bg-blue-600 text-white px-4 py-2 rounded-md font-semibold hover:bg-blue-700 transition-colors disabled:opacity-50"
              >
                {loading ? 'Loading...' : 'Auto-Load Data Files'}
              </button>
            </div>

            {/* Verification Results */}
            {matchedData.length > 0 && (
              <div className="bg-white rounded-lg shadow-md p-6">
                <h3 className="text-xl font-semibold mb-4">Verification Results</h3>
                
                {/* Summary */}
                <div className="mb-6 grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="bg-blue-50 p-4 rounded-lg">
                    <div className="text-2xl font-bold text-blue-900">{matchedData.length}</div>
                    <div className="text-sm text-blue-700">Total Participants</div>
                  </div>
                  <div className="bg-red-50 p-4 rounded-lg">
                    <div className="text-2xl font-bold text-red-900">
                      {matchedData.filter(p => p.discrepancies.some(d => d.type === 'false_absent')).length}
                    </div>
                    <div className="text-sm text-red-700">Potential False Absences</div>
                  </div>
                  <div className="bg-yellow-50 p-4 rounded-lg">
                    <div className="text-2xl font-bold text-yellow-900">
                      {matchedData.filter(p => p.discrepancies.length > 0).length}
                    </div>
                    <div className="text-sm text-yellow-700">Total with Discrepancies</div>
                  </div>
                </div>

                {/* Filter buttons */}
                <div className="mb-4 flex gap-2">
                  <button 
                    onClick={() => setViewFilter('false_absent')}
                    className={`px-3 py-1 rounded text-sm ${
                      viewFilter === 'false_absent' 
                        ? 'bg-red-200 text-red-800' 
                        : 'bg-red-100 text-red-800 hover:bg-red-150'
                    }`}
                  >
                    False Absences ({matchedData.filter(p => p.discrepancies.some(d => d.type === 'false_absent')).length})
                  </button>
                  <button 
                    onClick={() => setViewFilter('all')}
                    className={`px-3 py-1 rounded text-sm ${
                      viewFilter === 'all' 
                        ? 'bg-gray-200 text-gray-800' 
                        : 'bg-gray-100 text-gray-800 hover:bg-gray-150'
                    }`}
                  >
                    All Participants ({matchedData.length})
                  </button>
                </div>

                {/* Results Table */}
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-gray-50">
                        <th className="text-left p-3">Name</th>
                        <th className="text-left p-3">Canvas Posts</th>
                        <th className="text-center p-3">Session 1</th>
                        <th className="text-center p-3">Session 2</th>
                        <th className="text-center p-3">Session 3</th>
                        <th className="text-left p-3">Issues</th>
                      </tr>
                    </thead>
                    <tbody>
                      {matchedData
                        .filter(p => {
                          if (viewFilter === 'false_absent') {
                            return p.discrepancies.some(d => d.type === 'false_absent');
                          }
                          return p.discrepancies.length > 0; // Show all with any discrepancies
                        })
                        .map((participant, index) => (
                          <tr key={index} className="border-b hover:bg-gray-50">
                            <td className="p-3">
                              <div className="font-medium">{participant.canvasDisplayName}</div>
                              <div className="text-xs text-gray-500">{participant.canvasUserName}</div>
                            </td>
                            <td className="p-3 text-center">{participant.canvasPostCount}</td>
                            
                            {/* Session columns */}
                            {['session1', 'session2', 'session3'].map(session => (
                              <td key={session} className="p-3 text-center">
                                <div className="space-y-1">
                                  <div className={`text-xs px-2 py-1 rounded ${
                                    participant.aiAttendance[session] === 'present' 
                                      ? 'bg-green-100 text-green-800'
                                      : participant.aiAttendance[session] === 'absent'
                                      ? 'bg-red-100 text-red-800' 
                                      : 'bg-gray-100 text-gray-800'
                                  }`}>
                                    AI: {participant.aiAttendance[session]}
                                  </div>
                                  <div className="text-xs text-gray-600">
                                    {participant.zoomSessions[session] 
                                      ? `Zoom: ${participant.zoomSessions[session].duration}m`
                                      : 'No Zoom'
                                    }
                                  </div>
                                </div>
                              </td>
                            ))}
                            
                            <td className="p-3">
                              {participant.discrepancies.map((disc, idx) => (
                                <div key={idx} className={`text-xs mb-1 px-2 py-1 rounded ${
                                  disc.severity === 'high' ? 'bg-red-100 text-red-800' :
                                  disc.severity === 'medium' ? 'bg-yellow-100 text-yellow-800' :
                                  'bg-gray-100 text-gray-800'
                                }`}>
                                  {disc.message}
                                </div>
                              ))}
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>

                {/* Export button */}
                <div className="mt-6">
                  <button
                    onClick={() => {
                      const dataStr = JSON.stringify(matchedData, null, 2);
                      const blob = new Blob([dataStr], { type: 'application/json' });
                      const url = URL.createObjectURL(blob);
                      const a = document.createElement('a');
                      a.href = url;
                      a.download = `attendance-verification-${courseId}.json`;
                      a.click();
                      URL.revokeObjectURL(url);
                    }}
                    className="bg-green-600 text-white px-4 py-2 rounded-md font-semibold hover:bg-green-700 transition-colors"
                  >
                    Export Verification Data
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}