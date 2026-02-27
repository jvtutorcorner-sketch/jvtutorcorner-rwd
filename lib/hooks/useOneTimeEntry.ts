import { useRouter } from 'next/navigation';
import { useEffect, useRef } from 'react';
import { getStoredUser } from '@/lib/mockAuth';

/**
 * Hook to enforce one-time entry for a page per user
 * Each user + URL combination is allowed to be entered only once per visit
 * When user leaves the page, the lock is released and they can enter again
 * Different users can enter the same URL without blocking each other
 */
export function useOneTimeEntry() {
  const router = useRouter();
  const checkPerformedRef = useRef(false);
  const currentUrlRef = useRef<string>('');
  const currentUserIdRef = useRef<string>('');
  const storageKeyRef = useRef<string>('');

  useEffect(() => {
    // Prevent running check multiple times (happens in strict mode)
    if (checkPerformedRef.current) return;
    checkPerformedRef.current = true;

    if (typeof window === 'undefined') return;

    // ⚠️ IMPORTANT: Only enforce one-time entry for classroom pages, NOT admin pages
    // Admin pages (/admin/*) should be able to operate freely without one-time entry restrictions
    // to avoid conflicts with classroom connections
    const isAdminPage = window.location.pathname.startsWith('/admin/');
    if (isAdminPage) {
      console.log('[OneTimeEntry] Skipping one-time entry check for admin page:', window.location.pathname);
      return;
    }

    // ⚠️ IMPORTANT: Only enforce for /classroom/* pages
    const isClassroomPage = window.location.pathname.startsWith('/classroom/');
    if (!isClassroomPage) {
      console.log('[OneTimeEntry] Skipping one-time entry check for non-classroom page:', window.location.pathname);
      return;
    }

    // ⚠️ Allow bypassing one-time entry for debugging if debugMode=1 is set
    if (window.location.search.includes('debugMode=1')) {
      console.log('[OneTimeEntry] Skipping one-time entry check for debug mode');
      return;
    }

    // Get user identifier (email or role)
    const storedUser = getStoredUser();
    const userId = storedUser?.email || storedUser?.role || 'anonymous';
    currentUserIdRef.current = userId;

    // Get the full current URL as unique identifier (normalize to avoid param ordering issues)
    const currentUrl = window.location.pathname + window.location.search;
    const normalizedUrl = currentUrl.replace(/\/$/, '');
    currentUrlRef.current = normalizedUrl;

    // Storage key for tracking current entry (user + URL specific)
    const storageTimestampKey = `classroom_entry_${userId}_${normalizedUrl}_ts`;
    storageKeyRef.current = storageTimestampKey;

    try {
      // Get the last time this specific user entered this specific URL
      const lastEntryTimestamp = window.sessionStorage.getItem(storageTimestampKey);
      const now = Date.now();

      if (lastEntryTimestamp) {
        const timeSinceEntry = now - Number(lastEntryTimestamp);

        // If time since entry is very short (< 500ms), likely a page refresh - allow it
        if (timeSinceEntry < 500) {
          console.log('[OneTimeEntry] Detected page refresh (time delta < 500ms) - allowing re-entry for user:', userId);
          window.sessionStorage.setItem(storageTimestampKey, now.toString());
          return;
        }

        // If last entry was more than 10 seconds ago, allow re-entry (session likely ended or user testing)
        // Reduced from 2 minutes to 10 seconds to allow easier testing and returning to the page
        if (timeSinceEntry > 10 * 1000) {
          console.log('[OneTimeEntry] Session timeout (10s) - allowing re-entry for user:', userId);
          window.sessionStorage.setItem(storageTimestampKey, now.toString());
          return;
        }

        // Otherwise, block the re-entry (time between 500ms and 10 seconds)
        const remainingSeconds = Math.ceil((10 * 1000 - timeSinceEntry) / 1000);
        const message = `
您剛才已進入此教室。為確保教學品質及防止誤操作，此連結在短期內無法重複進入。

📌 了解限制原因：
  • 防止誤操作：避免無意中重複點擊導致的問題
  • 保護教學秩序：確保教室人員管理的完整性
  • 維持穩定連線：防止惡意重複進入影響課程進行

⏱️ 您可在 ${remainingSeconds} 秒後重新進入此連結。
`;
        console.log('[OneTimeEntry] Blocking re-entry for user:', userId, 'URL:', normalizedUrl, 'Time since entry:', timeSinceEntry);
        alert(message.trim());
        router.replace('/');
        return;
      }

      // First time this user is accessing this URL - register it
      window.sessionStorage.setItem(storageTimestampKey, now.toString());
      console.log('[OneTimeEntry] Registered entry for user:', userId, 'URL:', normalizedUrl);
    } catch (error) {
      console.error('[OneTimeEntry] Error checking URL access:', error);
    }

    // Cleanup: when user leaves the page, clear the entry lock for this user+URL combo
    const handleBeforeUnload = () => {
      try {
        // Use the stored key to ensure we clear the correct entry
        if (storageKeyRef.current) {
          window.sessionStorage.removeItem(storageKeyRef.current);
          console.log('[OneTimeEntry] Cleared entry lock on page unload for user:', currentUserIdRef.current);
        }
      } catch (error) {
        console.error('[OneTimeEntry] Error in beforeUnload cleanup:', error);
      }
    };

    // Also clear on page visibility change - when page becomes hidden (user navigating away)
    const handleVisibilityChange = () => {
      if (document.hidden) {
        // Page is being hidden - user is navigating away
        try {
          if (storageKeyRef.current) {
            window.sessionStorage.removeItem(storageKeyRef.current);
            console.log('[OneTimeEntry] Cleared entry lock when page hidden for user:', currentUserIdRef.current);
          }
        } catch (error) {
          console.error('[OneTimeEntry] Error in visibilitychange cleanup:', error);
        }
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      document.removeEventListener('visibilitychange', handleVisibilityChange);

      // Also clear on component unmount
      try {
        if (storageKeyRef.current) {
          window.sessionStorage.removeItem(storageKeyRef.current);
          console.log('[OneTimeEntry] Cleared entry lock on component unmount for user:', currentUserIdRef.current);
        }
      } catch (error) {
        console.error('[OneTimeEntry] Error in unmount cleanup:', error);
      }
    };
  }, [router]);
}

/**
 * Manually clear entry lock for current user + URL (useful for logout or explicit exit)
 */
export function clearCurrentEntry() {
  try {
    if (typeof window === 'undefined') return;

    const storedUser = getStoredUser();
    const userId = storedUser?.email || storedUser?.role || 'anonymous';
    const currentUrl = window.location.pathname + window.location.search;

    const storageTimestampKey = `classroom_entry_${userId}_${currentUrl}_ts`;
    window.sessionStorage.removeItem(storageTimestampKey);
    console.log('[OneTimeEntry] Manually cleared current entry lock for user:', userId);
  } catch (error) {
    console.error('[OneTimeEntry] Error clearing entry:', error);
  }
}

/**
 * Clear all entry locks (useful for global logout or state reset)
 */
export function clearAllEntries() {
  try {
    if (typeof window === 'undefined') return;

    const keys = Object.keys(window.sessionStorage);
    keys.forEach(key => {
      if (key.startsWith('classroom_entry_') && key.endsWith('_ts')) {
        window.sessionStorage.removeItem(key);
        console.log('[OneTimeEntry] Cleared entry lock:', key);
      }
    });
    console.log('[OneTimeEntry] Cleared all entry locks');
  } catch (error) {
    console.error('[OneTimeEntry] Error clearing all entries:', error);
  }
}

/**
 * Get current entry info (for debugging)
 */
export function getCurrentEntryInfo() {
  try {
    if (typeof window === 'undefined') return null;

    const storedUser = getStoredUser();
    const userId = storedUser?.email || storedUser?.role || 'anonymous';
    const currentUrl = window.location.pathname + window.location.search;

    const storageTimestampKey = `classroom_entry_${userId}_${currentUrl}_ts`;
    const timestamp = window.sessionStorage.getItem(storageTimestampKey);

    return {
      userId,
      url: currentUrl,
      lastEntryTime: timestamp ? new Date(Number(timestamp)).toLocaleString() : null,
    };
  } catch (error) {
    console.error('[OneTimeEntry] Error getting entry info:', error);
    return null;
  }
}



