/**
 * Shared Data Processing Utility for Canvas Grading Dashboard
 * 
 * Optimizes API calls and data processing for both homepage activity feed
 * and grading dashboard to reduce redundant Canvas API requests.
 */

import { fetchCanvasDiscussions } from './canvasApi';
import { fetchCourseEnrollments } from './dataUtils';

/**
 * Batch fetch assignment submissions for multiple assignments
 *
 * @param {string} courseId - Canvas course ID
 * @param {Array} assignmentIds - Array of assignment IDs to fetch submissions for
 * @returns {Promise<Object>} Map of assignment_id -> submissions array
 */
async function fetchAssignmentSubmissionsBatch(courseId, assignmentIds) {
  const submissionsByAssignment = {};
  
  // Fetch submissions for each assignment in parallel
  await Promise.all(assignmentIds.map(async (assignmentId) => {
    try {
      let allSubmissions = [];
      let page = 1;
      let hasMore = true;
      
      while (hasMore) {
        const response = await fetch('/api/canvas-proxy', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            endpoint: `/courses/${courseId}/assignments/${assignmentId}/submissions?per_page=100&page=${page}`,
            method: 'GET'
          })
        });
        
        if (response.ok) {
          const submissions = await response.json();
          allSubmissions = allSubmissions.concat(submissions);
          hasMore = submissions.length === 100;
          page++;
        } else {
          hasMore = false;
        }
      }
      
      submissionsByAssignment[assignmentId] = allSubmissions;
    } catch (error) {
      console.error(`Error fetching submissions for assignment ${assignmentId}:`, error);
      submissionsByAssignment[assignmentId] = [];
    }
  }));
  
  return submissionsByAssignment;
}

/**
 * Process Canvas data for both homepage activity and grading dashboard
 * Single source of truth for Canvas data processing with optimized API usage
 * 
 * @param {Object} params - API parameters
 * @param {string} params.courseId - Canvas course ID
 * @returns {Promise<Object>} Processed data for both views
 */
export async function processCanvasDataForDashboards({ courseId }) {
  const processingCacheKey = `canvas_processed_${courseId}`;
  const cached = localStorage.getItem(processingCacheKey);
  
  if (cached) {
    try {
      const { data } = JSON.parse(cached);
      return data;
    } catch (error) {
      localStorage.removeItem(processingCacheKey);
    }
  }
  
  const [allPosts, teacherUserIds] = await Promise.all([
    fetchCanvasDiscussions({ courseId }),
    fetchCourseEnrollments(courseId)
  ]);
  
  // Filter student posts (exclude teachers)
  const studentPosts = allPosts.filter(post => {
    const userId = post.user?.id || post.user_id;
    return !teacherUserIds.includes(parseInt(userId)) && !teacherUserIds.includes(userId);
  });
  
  // Process recent activity data for homepage
  const recentActivityData = processRecentActivity(studentPosts);
  
  const gradingTopicsData = await processGradingTopics(allPosts, teacherUserIds, courseId);
  
  const processedData = {
    recentActivity: recentActivityData,
    gradingTopics: gradingTopicsData,
    lastProcessed: Date.now()
  };
  
  localStorage.setItem(processingCacheKey, JSON.stringify({
    data: processedData,
    timestamp: Date.now()
  }));
  
  return processedData;
}

/**
 * Process recent activity data for homepage
 * Transforms student posts into activity feed format
 * 
 * @param {Array} studentPosts - Filtered student posts
 * @returns {Object} Recent activity data
 */
function processRecentActivity(studentPosts) {
  // Sort by creation date (newest first)
  studentPosts.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  
  // Transform posts into activity entries
  const activities = studentPosts.map(post => ({
    userName: post.user?.display_name || post.user_name || 'Unknown',
    discussionName: post.topic_title || 'Unknown Discussion',
    createdAt: post.created_at,
    postId: post.id,
    topicId: post.discussion_topic_id,
    avatar: post.user?.avatar_image_url || null,
    initials: (post.user?.display_name || post.user_name || 'Unknown')
      .split(' ')
      .map(n => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2)
  }));
  
  // Count unique users
  const uniqueUserNames = new Set(activities.map(activity => activity.userName));
  
  return {
    activities,
    uniqueUsers: uniqueUserNames.size
  };
}

/**
 * Process grading topics data for feedback dashboard
 * Optimized with batch submission fetching and proper sorting
 * 
 * @param {Array} allPosts - All discussion posts
 * @param {Array} teacherUserIds - Array of teacher user IDs
 * @param {Object} apiParams - API parameters for submission fetching
 * @returns {Promise<Array>} Processed grading topics
 */
async function processGradingTopics(allPosts, teacherUserIds, courseId) {
  // Filter to only graded discussions (assignment-based topics)
  const gradedPosts = allPosts.filter(post => {
    return post.assignment_id !== null && post.assignment_id !== undefined;
  });
  
  // Group posts by discussion topic
  const topicMap = {};
  const assignmentIds = new Set();
  
  gradedPosts.forEach(post => {
    const topicId = post.discussion_topic_id;
    const assignmentId = post.assignment_id;
    
    if (!topicMap[topicId]) {
      topicMap[topicId] = {
        id: topicId,
        title: post.topic_title,
        assignment_id: assignmentId,
        studentPosts: [],
        teacherReplies: []
      };
    }
    
    if (assignmentId) {
      assignmentIds.add(assignmentId);
    }
    
    const topic = topicMap[topicId];
    const userId = post.user?.id || post.user_id;
    const isTeacher = teacherUserIds.includes(parseInt(userId)) || teacherUserIds.includes(userId);
    
    if (isTeacher) {
      topic.teacherReplies.push(post);
    } else {
      topic.studentPosts.push(post);
    }
  });
  
  const submissionsByAssignment = await fetchAssignmentSubmissionsBatch(
    courseId,
    Array.from(assignmentIds)
  );
  
  // Process topics with batch submission data
  const topicsArray = Object.values(topicMap).map(topic => {
    // Count teacher replies by teacher
    const teacherReplyStats = {};
    topic.teacherReplies.forEach(reply => {
      const teacherName = reply.user?.display_name || reply.user_name || 'Unknown Teacher';
      teacherReplyStats[teacherName] = (teacherReplyStats[teacherName] || 0) + 1;
    });
    
    // Check grading status using batch submission data
    const submissions = submissionsByAssignment[topic.assignment_id] || [];
    
    // Create a map of user_id -> submission for quick lookup
    const submissionByUserId = {};
    submissions.forEach(submission => {
      submissionByUserId[submission.user_id] = submission;
    });
    
    // Create complete student list with grading status and teacher feedback
    const allStudentsWithStatus = [];
    const studentPostsMap = {};
    const studentTeacherFeedback = {}; // Track which teachers replied to each student
    
    // Map all student posts by student name
    const studentMainPosts = topic.studentPosts.filter(post => !post.parent_id);
    studentMainPosts.forEach(post => {
      const studentName = post.user?.display_name || post.user_name;
      if (studentName) {
        studentPostsMap[studentName] = {
          name: studentName,
          userId: post.user?.id || post.user_id,
          postDate: post.created_at,
          postId: post.id
        };
        studentTeacherFeedback[studentName] = new Set(); // Initialize feedback tracking
      }
    });
    
    // Track teacher feedback for each student using the flattened post structure
    
    // Create a map of student post IDs to student names
    const studentPostIdToName = {};
    const topicStudentMainPosts = topic.studentPosts.filter(post => !post.parent_id);
    topicStudentMainPosts.forEach(post => {
      const studentName = post.user?.display_name || post.user_name;
      if (studentName && studentPostsMap[studentName]) {
        studentPostIdToName[post.id] = studentName;
      }
    });
    
    // Check teacher replies to see if they're replying to student posts
    topic.teacherReplies.forEach(reply => {
      const replyAuthor = reply.user?.display_name || reply.user_name;
      const replyUserId = reply.user_id || reply.user?.id;
      const parentPostId = reply.parent_id;
      
      // If this teacher reply is to a student's main post, track it
      if (parentPostId && studentPostIdToName[parentPostId]) {
        const studentName = studentPostIdToName[parentPostId];
        studentTeacherFeedback[studentName].add(replyAuthor);
      }
    });
    
    // Create status for all students who posted
    Object.values(studentPostsMap).forEach(studentInfo => {
      const submission = submissionByUserId[studentInfo.userId];
      const isGraded = submission && 
                      submission.grade !== null && 
                      submission.grade !== undefined && 
                      submission.grade !== '';
      
      const teacherFeedbackArray = Array.from(studentTeacherFeedback[studentInfo.name] || []);
      
      allStudentsWithStatus.push({
        name: studentInfo.name,
        userId: studentInfo.userId,
        postDate: studentInfo.postDate,
        postId: studentInfo.postId,
        isGraded: isGraded,
        teacherFeedback: teacherFeedbackArray
      });
      

    });
    
    // Sort all students by post date (oldest first)
    allStudentsWithStatus.sort((a, b) => new Date(a.postDate) - new Date(b.postDate));
    
    // Filter just the students needing grades
    const finalStudentsNeedingGrades = allStudentsWithStatus.filter(student => !student.isGraded);
    
    return {
      ...topic,
      teacherReplyStats,
      studentsNeedingGrades: finalStudentsNeedingGrades.map(student => student.name),
      studentsNeedingGradesDetailed: finalStudentsNeedingGrades, // Keep detailed info for sorting
      allStudentsWithStatus: allStudentsWithStatus, // NEW: Complete list with status
      totalStudentPosts: topic.studentPosts.length,
      totalTeacherReplies: topic.teacherReplies.length
    };
  });
  
  // Sort topics by title
  topicsArray.sort((a, b) => a.title.localeCompare(b.title));
  
  return topicsArray;
}

/**
 * Clear processed data cache
 * Use when you want to force fresh processing
 * 
 * @param {string} courseId - Canvas course ID
 */
export function clearProcessedDataCache(courseId) {
  const processingCacheKey = `canvas_processed_${courseId}`;
  localStorage.removeItem(processingCacheKey);
}