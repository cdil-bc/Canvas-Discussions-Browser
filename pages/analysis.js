import { useEffect, useState } from 'react';
import { fetchCanvasDiscussions } from '../js/canvasApi';
import { 
  loadDataFiles, 
  createMasterParticipantList, 
  filterStudentParticipants,
  fetchCourseEnrollments,
  analyzeReflectionCompletion,
  calculateParticipationMetrics
} from '../js/dataUtils';

export default function Analysis() {
  const [courseId, setCourseId] = useState('');
  const [courseName, setCourseName] = useState('');
  const [allPosts, setAllPosts] = useState([]);
  const [participants, setParticipants] = useState([]);
  const [reflectionAnalysis, setReflectionAnalysis] = useState([]);
  const [participationMetrics, setParticipationMetrics] = useState(null);
  const [postCounts, setPostCounts] = useState({ total: 0, student: 0, teacher: 0 });
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
  }, [courseId]);

  async function loadAnalysisData() {
    if (credentialsMissing()) return;
    
    setLoading(true);
    setError('');
    
    try {
      console.log('=== LOADING ANALYSIS DATA ===');
      
      // Load Canvas discussions
      const canvasPosts = await fetchCanvasDiscussions({ courseId });
      setAllPosts(canvasPosts);
      
      // Fetch course enrollments to identify teachers
      const teacherUserIds = await fetchCourseEnrollments(courseId);
      console.log(`Found ${teacherUserIds.length} teachers in course enrollments`);
      
      // Load CSV data
      const csvData = await loadDataFiles();
      
      // Create master participant list - group by email to prevent duplicates
      const canvasUsers = [];
      const userMap = {};
      canvasPosts.forEach(post => {
        const displayName = post.user?.display_name;
        const userName = post.user_name;
        const userId = post.user?.id;
        const email = post.user?.email;
        
        // Canvas provides display names in user_name field
        
        // Canvas doesn't provide emails in discussion posts, only display names
        
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
      
      console.log('Canvas users before master list creation:', Object.values(userMap).length);
      
      const allParticipants = createMasterParticipantList(Object.values(userMap), csvData);
      
      console.log('All participants after master list creation:', allParticipants.length);
      console.log('Sample participant structure:', allParticipants[0]);
      
      // Filter to student participants only (exclude instructors by Canvas role)
      const allStudentParticipants = filterStudentParticipants(allParticipants, teacherUserIds);
      
      // Filter to genuinely engaged participants: attended Zoom OR posted 2+ reflections
      const engagedParticipants = allStudentParticipants.filter((participant, index) => {
        try {
          // Check attendance from registration data
          const regData = participant.registrationData;
          let attendedZoomSession = false;
          
          if (regData) {
            attendedZoomSession = ['Attendence 1', 'Attendence 2', 'Attendence 3'].some(session => 
              regData[session] && regData[session].toLowerCase().trim() === 'present'
            );
          }
          
          // If they attended Zoom, include them
          if (attendedZoomSession) {
            console.log(`${participant.canvasDisplayName} included - attended Zoom session`);
            return true;
          }
          
          // If they didn't attend Zoom, check if they posted 2+ reflections
          // Count their posts in graded reflection topics
          const reflectionPosts = canvasPosts.filter(post => {
            const topicTitle = post.topic_title || '';
            const isReflection = topicTitle.toLowerCase().includes('reflection') ||
                                topicTitle.toLowerCase().includes('module');
            const isIntroduction = topicTitle.toLowerCase().includes('introduction') ||
                                  topicTitle.toLowerCase().includes('intro');
            const isGradedReflection = isReflection && !isIntroduction;
            
            const isUserPost = (post.user?.display_name === participant.canvasDisplayName ||
                               post.user_name === participant.canvasDisplayName);
            
            return isGradedReflection && isUserPost;
          });
          
          if (reflectionPosts.length >= 2) {
            console.log(`${participant.canvasDisplayName} included - posted ${reflectionPosts.length} reflections (no Zoom attendance)`);
            return true;
          }
          
          console.log(`${participant.canvasDisplayName} excluded - attended: ${attendedZoomSession}, reflections: ${reflectionPosts.length}`);
          return false;
        } catch (error) {
          console.error(`Error processing participant ${index}:`, error, participant);
          return false; // Exclude problematic participants
        }
      });
      
      setParticipants(engagedParticipants);
      
      console.log(`Total participants for attendance: ${allStudentParticipants.length}`);
      console.log(`Engaged participants for analysis: ${engagedParticipants.length}`);
      
      // Use all students for attendance metrics (simplified counting)
      let metrics;
      try {
        metrics = calculateParticipationMetrics(allStudentParticipants);
        setParticipationMetrics(metrics);
      } catch (metricsError) {
        console.error('Error calculating participation metrics:', metricsError);
        console.log('First few participants for debugging:', allStudentParticipants.slice(0, 3));
        metrics = {
          totalParticipants: allStudentParticipants.length,
          canvasActiveParticipants: 0,
          attendanceBySession: {
            session1: { attended: 0, absent: 0 },
            session2: { attended: 0, absent: 0 },
            session3: { attended: 0, absent: 0 }
          },
          zoomSessionsAttended: {
            '0': 0,
            '1': 0,
            '2': 0,
            '3': 0
          },
          assistantTypes: {}
        };
        setParticipationMetrics(metrics);
      }
      
      // Separate student posts from teacher posts
      const studentPosts = canvasPosts.filter(post => {
        const userId = post.user?.id || post.user_id;
        return userId && !teacherUserIds.includes(parseInt(userId));
      });
      
      const teacherPosts = canvasPosts.filter(post => {
        const userId = post.user?.id || post.user_id;
        return userId && teacherUserIds.includes(parseInt(userId));
      });
      
      // Store post counts for UI display
      setPostCounts({
        total: canvasPosts.length,
        student: studentPosts.length,
        teacher: teacherPosts.length
      });
      
      // Use engaged participants for microcredential analysis
      console.log('About to analyze reflections for', engagedParticipants.length, 'participants');
      console.log('Total Canvas posts:', canvasPosts.length);
      console.log('Student posts:', studentPosts.length);
      console.log('Teacher posts:', teacherPosts.length);
      
      const reflectionData = analyzeReflectionCompletion(engagedParticipants, canvasPosts);
      console.log('Reflection analysis results:', reflectionData.length, 'participant records');
      
      if (reflectionData.length > 0) {
        console.log('Sample reflection analysis:', {
          participant: reflectionData[0].participant.canvasDisplayName,
          completed: reflectionData[0].completedReflections,
          total: reflectionData[0].totalReflections,
          details: Object.keys(reflectionData[0].reflectionDetails)
        });
      }
      
      setReflectionAnalysis(reflectionData);
      
      console.log('Analysis complete:', {
        totalParticipants: allStudentParticipants.length,
        engagedParticipants: engagedParticipants.length,
        reflections: reflectionData.length,
        metrics: metrics
      });
      
    } catch (err) {
      setError(`Error loading analysis data: ${err.message}`);
    } finally {
      setLoading(false);
    }
  }

  // Calculate microcredential completion stats
  const microcredentialStats = reflectionAnalysis.length > 0 ? {
    eligible: reflectionAnalysis.filter(r => r.microcredentialEligible).length,
    partial: reflectionAnalysis.filter(r => r.completedReflections > 0 && !r.microcredentialEligible).length,
    none: reflectionAnalysis.filter(r => r.completedReflections === 0).length,
    totalReflections: reflectionAnalysis.reduce((sum, r) => sum + r.completedReflections, 0)
  } : { eligible: 0, partial: 0, none: 0, totalReflections: 0 };

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
            <a href="/verify" className="text-white hover:text-gray-200 transition-colors">
              <i className="fas fa-check-double mr-1"></i> Verify
            </a>
            <a href="/analysis" className="text-white hover:text-gray-200 transition-colors border-b">
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
          <h2 className="text-3xl font-bold text-gray-900 mb-2">AI Test Kitchen Analysis</h2>
          <p className="text-gray-600 font-bold">Microcredential completion tracking and participation analysis (students only)</p>
        </div>

        {credentialsMissing() ? (
          <div className="bg-yellow-100 border-l-4 border-yellow-500 text-yellow-900 p-6 mb-8 rounded">
            <h3 className="text-xl font-bold mb-2">Canvas API Credentials Required</h3>
            <p className="mb-2">Please set your Canvas API credentials first.</p>
            <a href="/settings" className="text-red-900 underline font-semibold">Go to Settings</a>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Load Data Section */}
            <div className="bg-white rounded-lg shadow-md p-6">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-xl font-semibold">Analysis Data</h3>
                <button
                  onClick={loadAnalysisData}
                  disabled={loading}
                  className="bg-red-900 text-white px-4 py-2 rounded-md font-semibold hover:bg-red-800 transition-colors disabled:opacity-50"
                >
                  {loading ? 'Loading...' : 'Load Analysis Data'}
                </button>
              </div>
              
              {error && (
                <div className="text-red-700 font-semibold mb-4">{error}</div>
              )}
              
              {participants.length > 0 && (
                <div className="text-green-700 font-semibold space-y-1">
                  <div>✓ Loaded {participants.length} engaged participants</div>
                  <div className="text-sm text-gray-600">
                    {postCounts.total} total posts: {postCounts.student} student posts, {postCounts.teacher} teacher posts
                  </div>
                </div>
              )}
            </div>

            {/* Microcredential Completion Overview */}
            {reflectionAnalysis.length > 0 && (
              <div className="bg-white rounded-lg shadow-md p-6">
                <h3 className="text-xl font-semibold mb-4">Microcredential Completion Status</h3>
                
                <div className="grid grid-cols-1 md:grid-cols-5 gap-4 mb-6">
                  <div className="bg-purple-50 p-4 rounded-lg">
                    <div className="text-2xl font-bold text-purple-900">{microcredentialStats.totalReflections}</div>
                    <div className="text-sm text-purple-700">Total Reflections</div>
                  </div>
                  <div className="bg-green-50 p-4 rounded-lg">
                    <div className="text-2xl font-bold text-green-900">{microcredentialStats.eligible}</div>
                    <div className="text-sm text-green-700">Completed All Reflections</div>
                  </div>
                  <div className="bg-yellow-50 p-4 rounded-lg">
                    <div className="text-2xl font-bold text-yellow-900">{microcredentialStats.partial}</div>
                    <div className="text-sm text-yellow-700">Partially Completed</div>
                  </div>
                  <div className="bg-red-50 p-4 rounded-lg">
                    <div className="text-2xl font-bold text-red-900">{microcredentialStats.none}</div>
                    <div className="text-sm text-red-700">No Reflections</div>
                  </div>
                  <div className="bg-blue-50 p-4 rounded-lg">
                    <div className="text-2xl font-bold text-blue-900">
                      {reflectionAnalysis.length > 0 ? Math.round((microcredentialStats.eligible / reflectionAnalysis.length) * 100) : 0}%
                    </div>
                    <div className="text-sm text-blue-700">Completion Rate</div>
                  </div>
                </div>

                {/* Detailed Completion Table */}
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-gray-50">
                        <th className="text-left p-3">Participant</th>
                        <th className="text-center p-3">Reflections Completed</th>
                        <th className="text-center p-3">Completion %</th>
                        <th className="text-center p-3">Microcredential Eligible</th>
                        <th className="text-center p-3">Canvas Posts</th>
                        <th className="text-center p-3">Zoom Sessions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {reflectionAnalysis
                        .sort((a, b) => b.completedReflections - a.completedReflections)
                        .map((analysis, index) => (
                          <tr key={index} className="border-b hover:bg-gray-50">
                            <td className="p-3">
                              <div className="font-medium">{analysis.participant.canvasDisplayName}</div>
                              <div className="text-xs text-gray-500">{analysis.participant.canvasEmail}</div>
                            </td>
                            <td className="p-3 text-center">
                              <span className="font-medium">{analysis.completedReflections}</span>
                              <span className="text-gray-500">/{analysis.totalReflections}</span>
                            </td>
                            <td className="p-3 text-center">
                              <div className={`px-2 py-1 rounded text-xs ${
                                analysis.completionPercentage === 100 ? 'bg-green-100 text-green-800' :
                                analysis.completionPercentage > 0 ? 'bg-yellow-100 text-yellow-800' :
                                'bg-red-100 text-red-800'
                              }`}>
                                {analysis.completionPercentage}%
                              </div>
                            </td>
                            <td className="p-3 text-center">
                              {analysis.microcredentialEligible ? (
                                <span className="text-green-600 font-semibold">✓ Yes</span>
                              ) : (
                                <span className="text-red-600">✗ No</span>
                              )}
                            </td>
                            <td className="p-3 text-center">{analysis.participant.canvasPostCount}</td>
                            <td className="p-3 text-center">
                              {(() => {
                                const regData = analysis.participant.registrationData;
                                if (!regData) return 0;
                                
                                let attendanceCount = 0;
                                ['Attendence 1', 'Attendence 2', 'Attendence 3'].forEach(session => {
                                  if (regData[session] && regData[session].toLowerCase().trim() === 'present') {
                                    attendanceCount++;
                                  }
                                });
                                return attendanceCount;
                              })()}
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Participation Analytics */}
            {participationMetrics && (
              <div className="bg-white rounded-lg shadow-md p-6">
                <h3 className="text-xl font-semibold mb-4">Participation Analytics</h3>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Attendance by Session */}
                  <div>
                    <h4 className="font-semibold mb-3">Session Attendance</h4>
                    <div className="space-y-2">
                      {Object.entries(participationMetrics.attendanceBySession).map(([session, data]) => {
                        return (
                          <div key={session} className="space-y-1">
                            <div className="flex justify-between items-center">
                              <span className="text-sm capitalize">{session.replace('session', 'Session ')}</span>
                              <div className="text-sm">
                                <span className="text-green-600">{data.attended} attended</span>
                                <span className="text-gray-500 mx-2">|</span>
                                <span className="text-red-600">{data.absent} absent</span>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Zoom Sessions Attended */}
                  <div>
                    <h4 className="font-semibold mb-3">Zoom Sessions Attended</h4>
                    <div className="space-y-2">
                      {Object.entries(participationMetrics.zoomSessionsAttended)
                        .sort(([a], [b]) => parseInt(a) - parseInt(b))
                        .map(([sessionCount, participantCount]) => (
                          <div key={sessionCount} className="flex justify-between items-center">
                            <span className="text-sm">{sessionCount} sessions</span>
                            <span className="text-sm">{participantCount} participants</span>
                          </div>
                        ))}
                    </div>
                  </div>
                </div>

                {/* Assistant Types */}
                {Object.keys(participationMetrics.assistantTypes).length > 0 && (
                  <div className="mt-6">
                    <h4 className="font-semibold mb-3">Assistant Types Being Developed</h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
                      {Object.entries(participationMetrics.assistantTypes)
                        .sort(([,a], [,b]) => b - a)
                        .map(([type, count]) => (
                          <div key={type} className="flex justify-between items-center bg-gray-50 p-2 rounded">
                            <span className="text-sm">{type}</span>
                            <span className="text-sm font-medium">{count}</span>
                          </div>
                        ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}