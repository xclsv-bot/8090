'use client';

import { useAuth } from '@clerk/nextjs';
import { useEffect } from 'react';
import { setAuthToken } from '@/lib/api';

/**
 * Syncs Clerk auth token to our API client
 * Wrap your app content with this component
 */
export function AuthTokenProvider({ children }: { children: React.ReactNode }) {
  const { getToken, isLoaded, isSignedIn } = useAuth();

  useEffect(() => {
    if (!isLoaded) return;

    async function syncToken() {
      if (isSignedIn) {
        try {
          const token = await getToken();
          setAuthToken(token);
        } catch (err) {
          console.error('Failed to get auth token:', err);
          setAuthToken(null);
        }
      } else {
        setAuthToken(null);
      }
    }

    syncToken();
    
    // Refresh token periodically (every 50 seconds, tokens last 60)
    const interval = setInterval(syncToken, 50000);
    return () => clearInterval(interval);
  }, [getToken, isLoaded, isSignedIn]);

  return <>{children}</>;
}
