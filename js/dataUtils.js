// Data utilities for attendance verification


// Advanced CSV parser that handles quoted fields and various edge cases
export function parseCSV(csvText, filename = 'file') {
  const lines = csvText.trim().split('\n');
  if (lines.length === 0) return [];
  
  const headers = parseCSVLine(lines[0]);
  const data = [];
  
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    
    const values = parseCSVLine(line);
    const row = {};
    
    headers.forEach((header, index) => {
      row[header] = values[index] || '';
    });
    
    // Skip completely empty rows
    if (Object.values(row).every(val => !val.trim())) continue;
    
    data.push(row);
  }
  
  console.log(`Parsed ${filename}: ${data.length} rows with headers:`, headers);
  return data;
}

// Parse a single CSV line handling quoted fields and commas within quotes
function parseCSVLine(line) {
  const values = [];
  let current = '';
  let inQuotes = false;
  let i = 0;
  
  while (i < line.length) {
    const char = line[i];
    
    if (char === '"') {
      // Handle escaped quotes ("")
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i += 2;
        continue;
      }
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      values.push(current.trim());
      current = '';
    } else {
      current += char;
    }
    i++;
  }
  
  values.push(current.trim());
  return values;
}

// Name matching utilities
export function normalizeNameForMatching(name) {
  if (!name) return '';
  
  return name
    .toLowerCase()
    .trim()
    // Remove pronouns and extra info in parentheses
    .replace(/\s*\([^)]*\)\s*/g, ' ')
    // Remove middle initials (single letters followed by space)
    .replace(/\b[a-z]\b/g, '')
    // Handle common nickname variations - normalize to shortest form
    .replace(/\bsteven?\b/g, 'steve')
    .replace(/\bjosephine?\b/g, 'jo')
    .replace(/\bjonathan\b/g, 'jon')
    .replace(/\bnathaniel\b/g, 'nate')
    .replace(/\braymond\b/g, 'ray')
    .replace(/\btimothy\b/g, 'tim')
    // Remove punctuation and normalize whitespace
    .replace(/[^\w\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function extractEmailUsername(email) {
  if (!email || !email.includes('@')) return '';
  return email.split('@')[0].toLowerCase();
}

// Fuzzy name matching - returns similarity score 0-1
export function calculateNameSimilarity(name1, name2) {
  if (!name1 || !name2) return 0;
  
  const norm1 = normalizeNameForMatching(name1);
  const norm2 = normalizeNameForMatching(name2);
  
  if (norm1 === norm2) return 1.0;
  
  // Check if one is contained in the other
  if (norm1.includes(norm2) || norm2.includes(norm1)) return 0.8;
  
  // Check individual words
  const words1 = norm1.split(' ');
  const words2 = norm2.split(' ');
  
  let matchingWords = 0;
  const totalWords = Math.max(words1.length, words2.length);
  
  for (const word1 of words1) {
    if (words2.some(word2 => word1.includes(word2) || word2.includes(word1))) {
      matchingWords++;
    }
  }
  
  return matchingWords / totalWords;
}

// Match a person across different datasets
export function findBestMatch(targetPerson, candidateList, threshold = 0.6) {
  let bestMatch = null;
  let bestScore = 0;
  
  for (const candidate of candidateList) {
    // Try different name fields
    const candidateNames = [
      candidate.displayName,
      candidate.userName,
      candidate.name,
      candidate['Name'],
      candidate['Name (original name)']
    ].filter(Boolean);
    
    const targetNames = [
      targetPerson.displayName,
      targetPerson.userName,
      targetPerson.name,
      targetPerson['Name'],
      targetPerson['Name (original name)']
    ].filter(Boolean);
    
    // Calculate best similarity across all name combinations
    let maxSimilarity = 0;
    for (const targetName of targetNames) {
      for (const candidateName of candidateNames) {
        const similarity = calculateNameSimilarity(targetName, candidateName);
        maxSimilarity = Math.max(maxSimilarity, similarity);
      }
    }
    
    // Also check email matching
    const targetEmail = targetPerson.email || targetPerson.Email || '';
    const candidateEmail = candidate.email || candidate.Email || '';
    
    if (targetEmail && candidateEmail && targetEmail.toLowerCase() === candidateEmail.toLowerCase()) {
      maxSimilarity = Math.max(maxSimilarity, 1.0);
    }
    
    if (maxSimilarity > bestScore && maxSimilarity >= threshold) {
      bestScore = maxSimilarity;
      bestMatch = { candidate, score: maxSimilarity };
    }
  }
  
  return bestMatch;
}

// Parse attendance status from registration data
export function parseAttendanceFromRegistration(person, sessionNumber) {
  const attendanceKey = `Attendence ${sessionNumber}`; // Note: typo in original data
  const attendance = person[attendanceKey] || '';
  
  // Normalize attendance values (handle case variations like "PResent")
  const normalizedAttendance = attendance.toLowerCase().trim();
  
  return {
    status: normalizedAttendance === 'present' ? 'present' : 
            normalizedAttendance === 'absent' ? 'absent' : 'unknown',
    raw: attendance
  };
}

// Extract duration from Zoom data
export function extractDurationFromZoom(person) {
  const duration = person['Total duration (minutes)'] || person['Duration (minutes)'] || '';
  const parsed = parseInt(duration);
  
  return {
    minutes: isNaN(parsed) ? 0 : parsed,
    raw: duration
  };
}

// Load CSV files from the data directory (for quick testing)
export async function loadDataFiles() {
  const files = [
    { name: 'registrations', path: '/data/AI Test Kitchen Registrations (June 2025) - Form Responses 1 (2).csv' },
    { name: 'session1', path: '/data/Session 1 Participation - participants_95504150177_2025_06_02.csv (1).csv' },
    { name: 'session2', path: '/data/Session 2 Participation_2025_06_09 - participants_95504150177_2025_06_09.csv.csv' },
    { name: 'session3', path: '/data/Session 3 Attendance - Sheet1.csv' }
  ];
  
  const loadedData = {};
  
  for (const file of files) {
    try {
      // Add cache busting parameter
      const cacheBuster = Date.now();
      const response = await fetch(`${file.path}?t=${cacheBuster}`);
      if (response.ok) {
        const csvText = await response.text();
        loadedData[file.name] = parseCSV(csvText, file.name);
        console.log(`Successfully loaded ${file.name}:`, loadedData[file.name].length, 'rows');
      } else {
        console.warn(`Could not load ${file.name} from ${file.path}`);
        loadedData[file.name] = [];
      }
    } catch (error) {
      console.error(`Error loading ${file.name}:`, error);
      loadedData[file.name] = [];
    }
  }
  
  return loadedData;
}

// Create a master participant list by merging all data sources
export function createMasterParticipantList(canvasUsers, csvData) {
  const participants = new Map();
  
  // Start with Canvas users as the authoritative source, use display name as key
  canvasUsers.forEach(user => {
    const nameKey = user.displayName || user.userName || 'unknown';
    
    console.log(`Processing Canvas user: ${user.displayName} -> key: ${nameKey}`);
    
    participants.set(nameKey, {
      id: user.userId,
      canvasDisplayName: user.displayName,
      canvasUserName: user.userName,
      canvasEmail: user.email,
      canvasPostCount: user.postCount,
      registrationData: null,
      zoomSessions: {
        session1: null,
        session2: null,
        session3: null
      },
      aiAttendance: {
        session1: 'unknown',
        session2: 'unknown', 
        session3: 'unknown'
      },
      discrepancies: []
    });
  });
  
  // Match registration data
  if (csvData.registrations && csvData.registrations.length > 0) {
    console.log('Processing registrations:', csvData.registrations.length, 'entries');
    
    // Filter out invalid registration entries
    const validRegistrations = csvData.registrations.filter(reg => {
      const name = reg.Name || '';
      const email = reg.Email || '';
      
      // Filter out malformed entries
      const isInvalidEntry = 
        !name.trim() || 
        name.toLowerCase().includes('but i will view') ||
        name.toLowerCase() === 'unknown' ||
        name.toLowerCase().includes('thank you for offering') ||
        !email.includes('@') ||
        name.length > 100; // Probably corrupted data
      
      if (isInvalidEntry) {
        console.log('Filtering out invalid registration entry:', name.substring(0, 50));
        return false;
      }
      
      return true;
    });
    
    console.log(`Filtered ${csvData.registrations.length - validRegistrations.length} invalid entries, processing ${validRegistrations.length} valid registrations`);
    
    validRegistrations.forEach(reg => {
      const regEmail = reg.Email ? reg.Email.toLowerCase().trim() : '';
      const regName = reg.Name ? reg.Name.trim() : '';
      
      // Try to find a Canvas user by name matching
      let matchedParticipant = null;
      
      // Try name-based fuzzy matching with Canvas users
      for (const participant of participants.values()) {
        const canvasName = participant.canvasDisplayName || '';
        
        // Check for exact match first
        if (canvasName === regName) {
          matchedParticipant = participant;
          break;
        }
        
        // Check for fuzzy match (remove middle initials, normalize)
        const normalizedCanvas = normalizeNameForMatching(canvasName);
        const normalizedReg = normalizeNameForMatching(regName);
        
        if (normalizedCanvas === normalizedReg) {
          matchedParticipant = participant;
          break;
        }
      }
      
      if (matchedParticipant) {
        console.log(`Name match: ${regName} (${regEmail}) -> ${matchedParticipant.canvasDisplayName}`);
        matchedParticipant.registrationData = reg;
        const attendance = {
          session1: parseAttendanceFromRegistration(reg, 1).status,
          session2: parseAttendanceFromRegistration(reg, 2).status,
          session3: parseAttendanceFromRegistration(reg, 3).status
        };
        matchedParticipant.aiAttendance = attendance;
      } else {
        // Person in registration but not in Canvas - add them anyway
        console.warn('Person in registration not found in Canvas:', reg.Name || reg.Email);
        
        // Only create if it's a valid person (has proper name and email)
        if (regEmail && reg.Name && reg.Name.trim()) {
          const newParticipant = {
            id: 'no-canvas-' + regEmail,
            canvasDisplayName: reg.Name || 'Unknown',
            canvasUserName: reg.Email ? reg.Email.split('@')[0] : 'unknown',
            canvasEmail: reg.Email || '',
            canvasPostCount: 0, // No Canvas posts
            registrationData: reg,
            zoomSessions: {
              session1: null,
              session2: null,
              session3: null
            },
            aiAttendance: {
              session1: parseAttendanceFromRegistration(reg, 1).status,
              session2: parseAttendanceFromRegistration(reg, 2).status,
              session3: parseAttendanceFromRegistration(reg, 3).status
            },
            discrepancies: []
          };
          
          participants.set(reg.Name.trim(), newParticipant);
        }
      }
    });
  }
  
  // Zoom CSV data is only used for verification, not for participant creation
  
  // No discrepancy detection needed since we're using registration data as authoritative source
  
  return Array.from(participants.values());
}

// Verification-specific function that includes Zoom CSV processing and discrepancy detection
export function createMasterParticipantListWithVerification(canvasUsers, csvData) {
  const participants = new Map();
  
  // Start with Canvas users as the authoritative source, use display name as key
  canvasUsers.forEach(user => {
    const nameKey = user.displayName || user.userName || 'unknown';
    
    console.log(`Processing Canvas user: ${user.displayName} -> key: ${nameKey}`);
    
    participants.set(nameKey, {
      id: user.userId,
      canvasDisplayName: user.displayName,
      canvasUserName: user.userName,
      canvasEmail: user.email,
      canvasPostCount: user.postCount,
      registrationData: null,
      zoomSessions: {
        session1: null,
        session2: null,
        session3: null
      },
      aiAttendance: {
        session1: 'unknown',
        session2: 'unknown', 
        session3: 'unknown'
      },
      discrepancies: []
    });
  });
  
  // Match registration data using improved name matching
  if (csvData.registrations && csvData.registrations.length > 0) {
    console.log('Processing registrations:', csvData.registrations.length, 'entries');
    
    // Filter out invalid entries
    const validRegistrations = csvData.registrations.filter(reg => {
      if (!reg.Name || reg.Name.trim() === '') return false;
      if (reg.Name.includes('including summarizing events')) return false;
      if (reg.Name.includes('but I will view the training')) return false;
      if (reg.Name.trim().length < 3) return false;
      return true;
    });
    
    console.log(`Filtered ${csvData.registrations.length - validRegistrations.length} invalid entries, processing ${validRegistrations.length} valid registrations`);
    
    validRegistrations.forEach(reg => {
      const regEmail = reg.Email ? reg.Email.toLowerCase().trim() : '';
      const regName = reg.Name ? reg.Name.trim() : '';
      
      // Try to find a Canvas user by name matching
      let matchedParticipant = null;
      
      // Try name-based fuzzy matching with Canvas users
      for (const participant of participants.values()) {
        const canvasName = participant.canvasDisplayName || '';
        
        // Check for exact match first
        if (canvasName === regName) {
          matchedParticipant = participant;
          break;
        }
        
        // Check for fuzzy match (remove middle initials, normalize)
        const normalizedCanvas = normalizeNameForMatching(canvasName);
        const normalizedReg = normalizeNameForMatching(regName);
        
        if (normalizedCanvas === normalizedReg) {
          matchedParticipant = participant;
          break;
        }
      }
      
      if (matchedParticipant) {
        console.log(`Name match: ${regName} (${regEmail}) -> ${matchedParticipant.canvasDisplayName}`);
        matchedParticipant.registrationData = reg;
        const attendance = {
          session1: parseAttendanceFromRegistration(reg, 1).status,
          session2: parseAttendanceFromRegistration(reg, 2).status,
          session3: parseAttendanceFromRegistration(reg, 3).status
        };
        matchedParticipant.aiAttendance = attendance;
      } else {
        // Person in registration but not in Canvas - add them anyway
        console.warn('Person in registration not found in Canvas:', reg.Name || reg.Email);
        
        // Only create if it's a valid person (has proper name and email)
        if (regEmail && reg.Name && reg.Name.trim()) {
          const newParticipant = {
            id: 'no-canvas-' + regEmail,
            canvasDisplayName: reg.Name || 'Unknown',
            canvasUserName: reg.Email ? reg.Email.split('@')[0] : 'unknown',
            canvasEmail: reg.Email || '',
            canvasPostCount: 0, // No Canvas posts
            registrationData: reg,
            zoomSessions: {
              session1: null,
              session2: null,
              session3: null
            },
            aiAttendance: {
              session1: parseAttendanceFromRegistration(reg, 1).status,
              session2: parseAttendanceFromRegistration(reg, 2).status,
              session3: parseAttendanceFromRegistration(reg, 3).status
            },
            discrepancies: []
          };
          
          participants.set(reg.Name.trim(), newParticipant);
        }
      }
    });
  }
  
  // Match Zoom session data for verification
  ['session1', 'session2', 'session3'].forEach(sessionKey => {
    if (csvData[sessionKey] && csvData[sessionKey].length > 0) {
      csvData[sessionKey].forEach(zoomPerson => {
        const zoomName = zoomPerson['Name (original name)'] || zoomPerson['Name'] || zoomPerson['Topic'];
        if (!zoomName || !zoomName.trim()) return; // Skip empty entries
        
        // Try to match with all participants (Canvas + registration-only)
        const allParticipants = Array.from(participants.values());
        const match = findBestMatch(zoomPerson, allParticipants);
        
        if (match) {
          const participant = match.candidate;
          // Find the participant in the map
          for (const [key, p] of participants.entries()) {
            if (p.canvasDisplayName === participant.canvasDisplayName) {
              p.zoomSessions[sessionKey] = {
                name: zoomName,
                duration: extractDurationFromZoom(zoomPerson).minutes,
                guest: zoomPerson.Guest === 'Yes' || zoomPerson.Host === 'Yes'
              };
              
              console.log(`Matched Zoom data for ${participant.canvasDisplayName} in ${sessionKey}:`, {
                duration: p.zoomSessions[sessionKey].duration,
                zoomName: zoomName
              });
              break;
            }
          }
        } else {
          // Create a Zoom-only participant for unmatched people
          console.log(`Creating Zoom-only participant for ${sessionKey}:`, zoomName);
          
          const zoomOnlyParticipant = {
            id: `zoom-only-${sessionKey}-${zoomName}`,
            canvasDisplayName: zoomName,
            canvasUserName: '',
            canvasEmail: '',
            canvasPostCount: 0,
            registrationData: null,
            zoomSessions: {
              session1: null,
              session2: null,
              session3: null
            },
            aiAttendance: {
              session1: 'unknown',
              session2: 'unknown',
              session3: 'unknown'
            },
            discrepancies: []
          };
          
          // Add the Zoom data for this session
          zoomOnlyParticipant.zoomSessions[sessionKey] = {
            name: zoomName,
            duration: extractDurationFromZoom(zoomPerson).minutes,
            guest: zoomPerson.Guest === 'Yes' || zoomPerson.Host === 'Yes'
          };
          
          // Set attendance to 'present' for this session since they were in Zoom
          zoomOnlyParticipant.aiAttendance[sessionKey] = 'present';
          
          participants.set(`zoom-only-${zoomName}`, zoomOnlyParticipant);
        }
      });
    }
  });

  // Detect discrepancies between registration attendance and Zoom data
  participants.forEach((participant, key) => {
    ['session1', 'session2', 'session3'].forEach(session => {
      const aiStatus = participant.aiAttendance[session];
      const zoomData = participant.zoomSessions[session];
      
      if (aiStatus === 'absent' && zoomData && zoomData.duration > 0) {
        participant.discrepancies.push({
          type: 'false_absent',
          session: session,
          message: `Registration marked absent but Zoom shows ${zoomData.duration} minutes`,
          severity: 'high'
        });
      }
      
      if (aiStatus === 'present' && (!zoomData || zoomData.duration === 0)) {
        participant.discrepancies.push({
          type: 'false_present',
          session: session,
          message: `Registration marked present but no Zoom data found`,
          severity: 'medium'
        });
      }
      
      if (zoomData && zoomData.duration < 30) {
        participant.discrepancies.push({
          type: 'short_duration',
          session: session,
          message: `Very short attendance: ${zoomData.duration} minutes`,
          severity: 'low'
        });
      }
    });
  });

  return Array.from(participants.values());
}

// Filter out teacher/instructor roles
// Fetch course enrollments to identify teacher roles
export async function fetchCourseEnrollments(courseId) {
  try {
    const response = await fetch('/api/canvas-proxy', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        endpoint: `/courses/${courseId}/enrollments?per_page=100`,
        method: 'GET'
      })
    });
    
    if (!response.ok) {
      console.warn('Could not fetch course enrollments');
      return [];
    }
    
    const enrollments = await response.json();
    
    const teacherUserIds = new Set();
    enrollments.forEach(enrollment => {
      const teacherRoles = ['TeacherEnrollment', 'TaEnrollment', 'DesignerEnrollment'];
      if (teacherRoles.includes(enrollment.type)) {
        teacherUserIds.add(enrollment.user_id);
      }
    });
    
    return Array.from(teacherUserIds);
  } catch (error) {
    console.error('Error fetching enrollments:', error);
    return [];
  }
}

export function filterStudentParticipants(participants, teacherUserIds = []) {
  return participants.filter(participant => {
    const userId = participant.id || participant.userId;
    const name = participant.canvasDisplayName || '';
    const email = participant.canvasEmail || participant.registrationData?.Email || '';
    
    // Check if this user ID is in the teacher list
    const isTeacherByRole = teacherUserIds.includes(parseInt(userId)) || teacherUserIds.includes(userId);
    
    // Fallback: Check for instructor indicators in email or department for users not in Canvas
    const department = participant.registrationData?.['Team / Department'] || '';
    const instructorKeywords = [
      'instructor', 'teacher', 'faculty', 'professor', 'admin',
      'staff', 'coordinator', 'director', 'manager'
    ];
    
    const isInstructorByKeyword = instructorKeywords.some(keyword => 
      email.toLowerCase().includes(keyword) ||
      department.toLowerCase().includes(keyword)
    );
    
    // Debug logging for instructor filtering
    if (isTeacherByRole || isInstructorByKeyword) {
      console.log(`Filtering out instructor: ${name} (${email}, ID: ${userId}) - Reason: ${
        isTeacherByRole ? 'Canvas teacher role' : 'Instructor keyword match'
      }`);
    }
    
    return !isTeacherByRole && !isInstructorByKeyword;
  });
}

// Identify graded discussion assignments
export function filterGradedReflections(posts) {
  const filtered = posts.filter(post => {
    // Include any discussion that has an assignment_id (graded)
    const isGraded = post.assignment_id !== null && post.assignment_id !== undefined;
    
    // Debug logging for each post to see what's being included
    if (isGraded) {
      console.log(`Including graded topic: "${post.topic_title}" (assignment_id: ${post.assignment_id})`);
    }
    
    return isGraded;
  });
  
  console.log(`filterGradedReflections: Found ${filtered.length} graded discussion posts across topics`);
  return filtered;
}

// Analyze reflection completion for microcredential
export function analyzeReflectionCompletion(participants, allPosts) {
  const gradedPosts = filterGradedReflections(allPosts);
  
  // Group posts by reflection topic
  const reflectionTopics = {};
  gradedPosts.forEach(post => {
    const topicId = post.discussion_topic_id;
    if (!reflectionTopics[topicId]) {
      reflectionTopics[topicId] = {
        id: topicId,
        title: post.topic_title,
        posts: []
      };
    }
    reflectionTopics[topicId].posts.push(post);
  });
  
  // Debug logging
  console.log('Detected reflection topics:', Object.values(reflectionTopics).map(t => t.title));
  console.log('Total reflection topics found:', Object.keys(reflectionTopics).length);
  
  // Analyze completion for each participant
  return participants.map(participant => {
    const reflectionStatus = {
      participant: participant,
      completedReflections: 0,
      totalReflections: Object.keys(reflectionTopics).length,
      reflectionDetails: {}
    };
    
    Object.values(reflectionTopics).forEach(topic => {
      const userPosts = topic.posts.filter(post => {
        const postUser = post.user?.display_name || post.user_name || '';
        return postUser === participant.canvasDisplayName || 
               postUser === participant.canvasUserName;
      });
      
      reflectionStatus.reflectionDetails[topic.title] = {
        completed: userPosts.length > 0,
        postCount: userPosts.length,
        posts: userPosts
      };
      
      if (userPosts.length > 0) {
        reflectionStatus.completedReflections++;
      }
    });
    
    // Debug logging for participants with unexpectedly high completion counts
    if (reflectionStatus.completedReflections > 3) {
      console.log(`WARNING: ${participant.canvasDisplayName} has ${reflectionStatus.completedReflections} completed reflections (should be max 3)`, {
        reflectionDetails: reflectionStatus.reflectionDetails,
        totalTopics: reflectionStatus.totalReflections
      });
    }
    
    // Calculate completion percentage
    reflectionStatus.completionPercentage = reflectionStatus.totalReflections > 0 
      ? Math.round((reflectionStatus.completedReflections / reflectionStatus.totalReflections) * 100)
      : 0;
    
    // Determine microcredential eligibility (assuming all 3 reflections required)
    reflectionStatus.microcredentialEligible = reflectionStatus.completedReflections >= reflectionStatus.totalReflections;
    
    return reflectionStatus;
  });
}

// Calculate participation metrics for analysis - SIMPLIFIED
export function calculateParticipationMetrics(participants) {
  const metrics = {
    totalParticipants: participants.length,
    canvasActiveParticipants: participants.filter(p => p.canvasPostCount > 0).length,
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
  
  participants.forEach(participant => {
    // Attendance counting from registration data
    ['session1', 'session2', 'session3'].forEach(session => {
      const aiAttendance = participant.aiAttendance || {};
      const markedPresent = aiAttendance[session] === 'present';
      
      if (markedPresent) {
        metrics.attendanceBySession[session].attended++;
      } else {
        metrics.attendanceBySession[session].absent++;
      }
    });
    
    // Count number of sessions attended from registration data
    const regData = participant.registrationData;
    let sessionsAttended = 0;
    
    if (regData) {
      ['Attendence 1', 'Attendence 2', 'Attendence 3'].forEach(session => {
        if (regData[session] && regData[session].toLowerCase().trim() === 'present') {
          sessionsAttended++;
        }
      });
    }
    
    metrics.zoomSessionsAttended[sessionsAttended.toString()] = (metrics.zoomSessionsAttended[sessionsAttended.toString()] || 0) + 1;
    
    // Assistant type
    const assistantType = participant.registrationData?.['Assistant Type'];
    if (assistantType && assistantType.trim()) {
      metrics.assistantTypes[assistantType] = (metrics.assistantTypes[assistantType] || 0) + 1;
    }
  });
  
  console.log('Simple attendance count:', metrics.attendanceBySession);
  
  return metrics;
}