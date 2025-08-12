
"use client";

import { useState, useEffect } from 'react';

/**
 * Custom hook to track page visibility.
 * @returns {boolean} `true` if the page is visible, `false` otherwise.
 */
export function usePageVisibility(): boolean {
  const [isVisible, setIsVisible] = useState(typeof document !== 'undefined' ? !document.hidden : true);

  useEffect(() => {
    if (typeof document === 'undefined') return;
    const onVisibilityChange = () => setIsVisible(!document.hidden);
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, []);

  return isVisible;
}
