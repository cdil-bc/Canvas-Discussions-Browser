/**
 * CanvasProvider - React Context Provider for Canvas API Integration
 *
 * Manages OAuth authentication state, course data, and shared state across all pages.
 * Authentication is handled server-side via OAuth; tokens never reach the client.
 */

import { createContext, useContext, useEffect, useState, useCallback } from 'react';

const CanvasContext = createContext();

export function CanvasProvider({ children }) {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [userName, setUserName] = useState('');
  const [canvasUrl, setCanvasUrl] = useState('');
  const [authLoading, setAuthLoading] = useState(true);
  const [courseId, setCourseId] = useState('');
  const [courseName, setCourseName] = useState('');
  const [courseLoading, setCourseLoading] = useState(false);
  const [courseError, setCourseError] = useState('');

  // Check OAuth session status on mount
  useEffect(() => {
    async function checkAuth() {
      try {
        const res = await fetch('/api/oauth/status');
        if (res.ok) {
          const data = await res.json();
          setIsLoggedIn(data.isLoggedIn);
          setUserName(data.userName || '');
          setCanvasUrl(data.canvasUrl || '');
        }
      } catch {
        setIsLoggedIn(false);
      } finally {
        setAuthLoading(false);
      }
    }
    checkAuth();
  }, []);

  // Load courseId from localStorage (user preference, not a secret)
  useEffect(() => {
    setCourseId(localStorage.getItem('course_id') || '');
  }, []);

  // Fetch course name when authenticated and courseId changes
  useEffect(() => {
    if (!isLoggedIn || !courseId) {
      setCourseName('');
      return;
    }

    async function fetchCourseName() {
      setCourseLoading(true);
      setCourseError('');
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
          setCourseError('Failed to fetch course information');
        }
      } catch {
        setCourseName('');
        setCourseError('Error connecting to Canvas API');
      } finally {
        setCourseLoading(false);
      }
    }
    fetchCourseName();
  }, [isLoggedIn, courseId]);

  const updateCourseId = useCallback((newCourseId) => {
    setCourseId(newCourseId);
    localStorage.setItem('course_id', newCourseId);
  }, []);

  const login = useCallback(() => {
    window.location.href = '/api/oauth/authorize';
  }, []);

  const logout = useCallback(async () => {
    try {
      await fetch('/api/oauth/logout', { method: 'POST' });
    } catch {
      // Best effort
    }
    setIsLoggedIn(false);
    setUserName('');
    setCourseName('');
  }, []);

  const credentialsMissing = useCallback(() => {
    return !isLoggedIn || !courseId;
  }, [isLoggedIn, courseId]);

  const value = {
    isLoggedIn,
    userName,
    canvasUrl,
    authLoading,
    courseId,
    updateCourseId,
    login,
    logout,
    credentialsMissing,
    courseName,
    courseLoading,
    courseError,
    makeCanvasRequest: async (endpoint, method = 'GET', body = null) => {
      const response = await fetch('/api/canvas-proxy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ endpoint, method, body })
      });
      if (!response.ok) {
        throw new Error(`Canvas API request failed: ${response.statusText}`);
      }
      return response.json();
    }
  };

  return (
    <CanvasContext.Provider value={value}>
      {children}
    </CanvasContext.Provider>
  );
}

export function useCanvas() {
  const context = useContext(CanvasContext);
  if (!context) {
    throw new Error('useCanvas must be used within a CanvasProvider');
  }
  return context;
}