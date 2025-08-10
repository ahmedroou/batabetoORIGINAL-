
"use client";

import { useState, useEffect } from 'react';

/**
 * A custom React hook to track the visibility state of the page.
 * @returns {boolean} `true` if the page is visible, `false` otherwise.
 */
export function usePageVisibility(): boolean {
  const [isPageVisible, setIsPageVisible] = useState(true);

  useEffect(() => {
    // Set the initial state
    if (typeof document !== 'undefined') {
        setIsPageVisible(!document.hidden);
    }

    const handleVisibilityChange = () => {
      if (typeof document !== 'undefined') {
        setIsPageVisible(!document.hidden);
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    // Cleanup the event listener on component unmount
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  return isPageVisible;
}
