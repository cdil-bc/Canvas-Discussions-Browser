/**
 * useCanvasAuth - Custom hook for Canvas API authentication
 *
 * Provides OAuth authentication state and actions.
 */

import { useCanvas } from './CanvasProvider';

export function useCanvasAuth() {
  const {
    isLoggedIn,
    userName,
    authLoading,
    courseId,
    updateCourseId,
    login,
    logout,
    credentialsMissing
  } = useCanvas();

  return {
    isLoggedIn,
    userName,
    authLoading,
    courseId,
    updateCourseId,
    login,
    logout,
    credentialsMissing,
    isAuthenticated: isLoggedIn && !!courseId
  };
}