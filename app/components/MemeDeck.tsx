'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { User } from '@supabase/supabase-js';
import StatsHUD from './StatsHUD';

interface Image {
  id: string;
  url: string | null;
  image_description: string | null;
}

interface Slide {
  captionId: string;
  captionText: string | null;
  imageUrl: string | null;
  imageDescription: string | null;
}

interface MemeDeckProps {
  userId: string | null;
  refreshTrigger?: number; // Optional: increment to trigger refresh
}

const CAPTIONS_PER_PAGE = 1000; // Load up to 1000 captions for testing (was 100)

export default function MemeDeck({ userId, refreshTrigger }: MemeDeckProps) {
  const [slides, setSlides] = useState<Slide[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [slideDirection, setSlideDirection] = useState<'left' | 'right' | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [userVotes, setUserVotes] = useState<Record<string, number>>({});
  const [isVoting, setIsVoting] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'like' | 'dislike' } | null>(null);
  const [clickedButton, setClickedButton] = useState<'like' | 'dislike' | null>(null);
  const [voteError, setVoteError] = useState<string | null>(null);
  const [voteLoadError, setVoteLoadError] = useState<string | null>(null);
  const [voteDebugInfo, setVoteDebugInfo] = useState<{
    userId: string | null;
    captionId: string | null;
    voteValue: number | null;
    lastStatus: number | null;
    lastErrorMessage: string | null;
    lastRequestBody: { captionId: string | null; voteValue: number | null } | null;
    lastResponse: { 
      success: boolean; 
      error?: string; 
      vote?: any;
      voteHydration?: {
        captionIdsRequested: number;
        votesFetched: number;
      };
    } | null;
    authLoaded: boolean;
  }>({
    userId: null,
    captionId: null,
    voteValue: null,
    lastStatus: null,
    lastErrorMessage: null,
    lastRequestBody: null,
    lastResponse: null,
    authLoaded: false,
  });
  const [hasMore, setHasMore] = useState(true);
  const [currentPage, setCurrentPage] = useState(0);
  const [profileId, setProfileId] = useState<string | null>(null);
  const [debugInfo, setDebugInfo] = useState<{
    totalAvailable: number;
    returned: number;
    filters: string;
    range: string;
  } | null>(null);
  const deckRef = useRef<HTMLDivElement>(null);
  const isRestoringIndexRef = useRef(false);

  // Auth state hydration - robust client-side auth state management
  const [user, setUser] = useState<User | null>(null);
  const [authLoaded, setAuthLoaded] = useState(false);
  const supabase = createClient();

  // Hydrate auth state on mount and subscribe to changes
  useEffect(() => {
    let ignore = false;

    async function loadAuth() {
      const { data, error } = await supabase.auth.getUser();
      if (!ignore) {
        setUser(data.user ?? null);
        setAuthLoaded(true);
        console.log('[MemeDeck] Auth loaded:', { userId: data.user?.id || null, error });
      }
    }

    loadAuth();

    const { data: subscription } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!ignore) {
        setUser(session?.user ?? null);
        setAuthLoaded(true);
        console.log('[MemeDeck] Auth state changed:', { userId: session?.user?.id || null, event: _event });
      }
    });

    return () => {
      ignore = true;
      subscription.subscription.unsubscribe();
    };
  }, [supabase]);

  // PART A: Persist currentIndex to localStorage whenever it changes
  useEffect(() => {
    // Skip persistence during initial restore
    if (isRestoringIndexRef.current || !profileId) return;

    const storageKey = `memeDeckIndex:${profileId}`;
    localStorage.setItem(storageKey, String(currentIndex));
  }, [currentIndex, profileId]);

  // Get profileId for persistence
  const getProfileId = useCallback(async (): Promise<string | null> => {
    if (!userId) return null;

    try {
      const supabase = createClient();
      const { data: profile } = await supabase
        .from('profiles')
        .select('id')
        .eq('id', userId)
        .single();
      
      return profile?.id || userId;
    } catch (err) {
      console.error('Error getting profileId:', err);
      return userId; // Fallback to userId
    }
  }, [userId]);

  // Load user votes for captions and merge into votesByCaptionId
  // Supports pagination by merging new votes with existing ones
  const loadUserVotesForCaptions = useCallback(async (captionIds: string[], userProfileId: string | null) => {
    if (captionIds.length === 0) {
      console.log('[MemeDeck] DEBUG - Skipping vote fetch: no captionIds');
      return;
    }

    if (!userProfileId) {
      console.log('[MemeDeck] DEBUG - No userProfileId, skipping vote fetch');
      setUserVotes({});
      return;
    }

    try {
      const supabase = createClient();

      console.log('[MemeDeck] DEBUG - Fetching votes for', captionIds.length, 'captions (profileId:', userProfileId, ')');

      const { data, error } = await supabase
        .from('caption_votes')
        .select('caption_id, vote_value')
        .eq('profile_id', userProfileId)
        .in('caption_id', captionIds);

      if (error) {
        console.error('[MemeDeck] Error fetching votes:', error);
        // Check for RLS errors
        if (error.code === 'PGRST301' || error.message?.includes('RLS') || error.message?.includes('permission') || error.message?.includes('policy')) {
          const errorMsg = "Votes can't be loaded (RLS)";
          setVoteLoadError(process.env.NODE_ENV === 'development' ? `${errorMsg}: ${error.message}` : errorMsg);
        } else {
          // Clear any previous RLS error if it's a different error
          setVoteLoadError(null);
        }
        
        // Update debug info with error
        if (process.env.NODE_ENV === 'development') {
          setVoteDebugInfo(prev => ({
            ...prev,
            lastResponse: {
              success: false,
              error: error.message,
              voteHydration: {
                captionIdsRequested: captionIds.length,
                votesFetched: 0,
              },
            },
          }));
        }
        return;
      }
      
      // Clear RLS error on successful load
      setVoteLoadError(null);

      if (data && data.length > 0) {
        // Build new votes map from fetched data
        const newVotes: Record<string, 1 | -1> = {};
        data.forEach((vote) => {
          if (vote.vote_value === 1 || vote.vote_value === -1) {
            newVotes[vote.caption_id] = vote.vote_value as 1 | -1;
          }
        });
        
        // Merge new votes with existing votes (pagination support)
        setUserVotes(prev => ({
          ...prev,
          ...newVotes
        }));
        
        // DEBUG: Log votes loaded
        const votesLoadedCount = Object.keys(newVotes).length;
        console.log('[MemeDeck] DEBUG - Vote hydration:', {
          captionIdsRequested: captionIds.length,
          votesFetched: votesLoadedCount,
          captionIds: captionIds.slice(0, 5), // Show first 5 for debugging
          votes: Object.keys(newVotes).slice(0, 5),
        });
        
        // Update debug info with vote hydration stats
        if (process.env.NODE_ENV === 'development') {
          setVoteDebugInfo(prev => ({
            ...prev,
            lastResponse: {
              success: true,
              voteHydration: {
                captionIdsRequested: captionIds.length,
                votesFetched: votesLoadedCount,
              },
            },
          }));
        }
      } else {
        console.log('[MemeDeck] DEBUG - No votes found for', captionIds.length, 'captions');
        if (process.env.NODE_ENV === 'development') {
          setVoteDebugInfo(prev => ({
            ...prev,
            lastResponse: {
              success: true,
              voteHydration: {
                captionIdsRequested: captionIds.length,
                votesFetched: 0,
              },
            },
          }));
        }
      }
    } catch (err) {
      console.error('[MemeDeck] Error fetching user votes:', err);
    }
  }, []);

  // Legacy function for backward compatibility (now uses merge logic)

  // Fetch slides (captions with images)
  useEffect(() => {
    const fetchSlides = async () => {
      try {
        setIsLoading(true);
        const supabase = createClient();
        
        // Fetch captions with images using INNER JOIN
        // Filter by image visibility (is_public OR is_common_use) using foreignTable filter
        // This ensures pagination applies to captions, not images
        const { data, error: fetchError, count } = await supabase
          .from('captions')
          .select(`
            id,
            content,
            image_id,
            created_datetime_utc,
            images!inner (
              id,
              url,
              image_description,
              is_public,
              is_common_use
            )
          `, { count: 'exact' })
          .or('is_public.eq.true,is_common_use.eq.true', { foreignTable: 'images' })
          .order('created_datetime_utc', { ascending: false })
          .range(0, 999); // Fetch up to 1000 captions

        // DEBUG: Log total count and returned data
        console.log('[MemeDeck] DEBUG - Total captions available (count):', count);
        console.log('[MemeDeck] DEBUG - Captions returned this fetch (data.length):', data?.length || 0);
        console.log('[MemeDeck] DEBUG - Applied filters: images.is_public = true OR images.is_common_use = true (foreignTable)');
        console.log('[MemeDeck] DEBUG - Range: 0-999');

        if (fetchError) {
          console.error('Error fetching slides:', fetchError);
          setError('Failed to load memes');
          return;
        }

        if (!data || data.length === 0) {
          setError('No memes found');
          return;
        }

        // Transform relational data
        // Filter out captions with no content and ensure we have valid captionId
        const slidesData: Slide[] = (data || [])
          .filter((caption: any) => caption.id && caption.content) // Only include captions with content
          .map((caption: any) => {
            const image = Array.isArray(caption.images) 
              ? (caption.images[0] || null)
              : (caption.images || null);
            
            return {
              captionId: caption.id,
              captionText: caption.content,
              imageUrl: image?.url || null,
              imageDescription: image?.image_description || null,
            };
          });

        console.log('[MemeDeck] Slides created:', slidesData.length);
        
        // DEBUG: Set debug info in state for UI display
        // Count is for THIS filtered query (captions with public/common images), not total captions in table
        const totalCount = count !== null && count !== undefined ? count : 0;
        setDebugInfo({
          totalAvailable: totalCount,
          returned: slidesData.length,
          filters: 'images.is_public = true OR images.is_common_use = true (foreignTable)',
          range: '0-999'
        });
        
        setSlides(slidesData);
        
        // Get profileId and restore saved index + load votes
        if (userId && slidesData.length > 0) {
          const userProfileId = await getProfileId();
          if (userProfileId) {
            setProfileId(userProfileId);
            
            // PART A: Restore saved slide index
            const storageKey = `memeDeckIndex:${userProfileId}`;
            const savedIndexStr = localStorage.getItem(storageKey);
            const savedIndex = savedIndexStr ? parseInt(savedIndexStr, 10) : 0;
            const restoredIndex = Math.max(0, Math.min(savedIndex, slidesData.length - 1));
            
            // DEBUG: Log persistence restore
            console.log('[MemeDeck] DEBUG - profileId:', userProfileId);
            console.log('[MemeDeck] DEBUG - savedIndex:', savedIndex);
            console.log('[MemeDeck] DEBUG - restoredIndex:', restoredIndex);
            
            isRestoringIndexRef.current = true;
            setCurrentIndex(restoredIndex);
            isRestoringIndexRef.current = false;
            
            // Note: Votes will be loaded when auth is ready (see useEffect below)
          }
        } else {
          // Logged out: start at index 0
          setCurrentIndex(0);
        }
      } catch (err) {
        console.error('Error in fetchSlides:', err);
        setError('Failed to load memes');
      } finally {
        setIsLoading(false);
      }
    };

    fetchSlides();
  }, [userId, currentPage, getProfileId]);

  // Load user votes when auth is loaded AND user exists AND slides are loaded
  // This ensures votes persist across refresh and handles pagination
  useEffect(() => {
    const loadVotes = async () => {
      // Wait for auth to be loaded
      if (!authLoaded) {
        console.log('[MemeDeck] DEBUG - Auth not loaded yet, skipping vote fetch');
        return;
      }

      // Only load votes if we have slides and a user
      if (slides.length === 0) {
        if (!user) {
          setUserVotes({}); // Clear votes if logged out
        }
        return;
      }

      if (!user) {
        console.log('[MemeDeck] DEBUG - No user, clearing votes');
        setUserVotes({});
        return;
      }

      // Extract all caption IDs from current slides
      const captionIds = slides.map(s => s.captionId);
      
      // Fetch votes for all current captions using hydrated user ID
      console.log('[MemeDeck] DEBUG - Loading votes for', captionIds.length, 'captions (user:', user.id, ')');
      await loadUserVotesForCaptions(captionIds, user.id);
    };

    loadVotes();
  }, [slides, authLoaded, user, loadUserVotesForCaptions]);

  // Refresh slides when refreshTrigger changes (e.g., after upload)
  useEffect(() => {
    if (refreshTrigger && refreshTrigger > 0) {
      const fetchSlides = async () => {
        try {
          const supabase = createClient();
          
          const { data, error: fetchError, count: refreshCount } = await supabase
            .from('captions')
            .select(`
              id,
              content,
              image_id,
              created_datetime_utc,
              images!inner (
                id,
                url,
                image_description,
                is_public,
                is_common_use
              )
            `, { count: 'exact' })
            .or('is_public.eq.true,is_common_use.eq.true', { foreignTable: 'images' })
            .order('created_datetime_utc', { ascending: false })
            .range(0, 999); // Fetch up to 1000 captions

          console.log('[MemeDeck] DEBUG (refresh) - Total captions available (count):', refreshCount);
          console.log('[MemeDeck] DEBUG (refresh) - Captions returned this fetch (data.length):', data?.length || 0);
          console.log('[MemeDeck] DEBUG (refresh) - Applied filters: images.is_public = true OR images.is_common_use = true (foreignTable)');

          if (!fetchError && data) {
            const slidesData: Slide[] = (data || [])
              .filter((caption: any) => caption.id && caption.content)
              .map((caption: any) => {
                const image = Array.isArray(caption.images) 
                  ? (caption.images[0] || null)
                  : (caption.images || null);
                
                return {
                  captionId: caption.id,
                  captionText: caption.content,
                  imageUrl: image?.url || null,
                  imageDescription: image?.image_description || null,
                };
              });

            setSlides(slidesData);
            setHasMore(slidesData.length === CAPTIONS_PER_PAGE);
            setCurrentPage(0); // Reset to first page on refresh
            if (refreshCount !== null && refreshCount !== undefined) {
              setDebugInfo({
                totalAvailable: refreshCount,
                returned: slidesData.length,
                filters: 'images.is_public = true OR images.is_common_use = true (foreignTable)',
                range: '0-999'
              });
            }
            // Note: Votes will be loaded when auth is ready (see useEffect above)
            if (user && slidesData.length > 0) {
              const userProfileId = await getProfileId();
              if (userProfileId) {
                setProfileId(userProfileId);
                
                // Restore saved index after refresh
                const storageKey = `memeDeckIndex:${userProfileId}`;
                const savedIndexStr = localStorage.getItem(storageKey);
                const savedIndex = savedIndexStr ? parseInt(savedIndexStr, 10) : 0;
                const restoredIndex = Math.max(0, Math.min(savedIndex, slidesData.length - 1));
                
                isRestoringIndexRef.current = true;
                setCurrentIndex(restoredIndex);
                isRestoringIndexRef.current = false;
              }
            }
          }
        } catch (err) {
          console.error('Error refreshing slides:', err);
        }
      };

      fetchSlides();
    }
  }, [refreshTrigger, user]);

  // Handle vote
  const handleVote = useCallback(async (voteValue: 1 | -1) => {
    // Gate voting until auth is loaded
    if (!authLoaded) {
      setVoteError('Loading session...');
      setToast({ message: 'Loading session...', type: voteValue === 1 ? 'like' : 'dislike' });
      setTimeout(() => {
        setToast(null);
        setVoteError(null);
      }, 2000);
      return;
    }

    // Check if logged in (use hydrated user state)
    if (!user) {
      setVoteError('Please sign in to vote');
      setToast({ message: 'Please sign in to vote', type: voteValue === 1 ? 'like' : 'dislike' });
      setTimeout(() => {
        setToast(null);
        setVoteError(null);
      }, 3000);
      return;
    }

    // Prevent double-clicks
    if (isVoting) {
      return;
    }

    const currentSlide = slides[currentIndex];
    if (!currentSlide || !currentSlide.captionId) {
      setVoteError('Error: caption is null');
      return;
    }

    // Trigger click animation
    setClickedButton(voteValue === 1 ? 'like' : 'dislike');
    setTimeout(() => setClickedButton(null), 200);

    setIsVoting(true);
    setToast(null);
    setVoteError(null);

    try {
      // Use hydrated user state for debug info
      const currentUserId = user?.id || null;
      
      // Ensure voteValue is always 1 or -1
      const voteValueNumber: 1 | -1 = voteValue === 1 ? 1 : -1;
      const requestBody = {
        captionId: currentSlide.captionId,
        voteValue: voteValueNumber,
      };

      // Update debug info before vote
      setVoteDebugInfo({
        userId: currentUserId,
        captionId: currentSlide.captionId,
        voteValue: voteValueNumber,
        lastStatus: null,
        lastErrorMessage: null,
        lastRequestBody: requestBody,
        lastResponse: null,
        authLoaded: authLoaded,
      });

      // Call the authenticated API route
      const response = await fetch('/api/vote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      });

      let result;
      try {
        result = await response.json();
      } catch (jsonError) {
        console.error('[MemeDeck] Failed to parse response JSON:', jsonError);
        const errorText = await response.text();
        result = { success: false, error: `Invalid JSON response: ${errorText}` };
      }

      // Update debug info with response
      const errorMessage = result.error || (response.ok ? null : `HTTP ${response.status}`);
      setVoteDebugInfo(prev => ({
        ...prev,
        lastStatus: response.status,
        lastErrorMessage: errorMessage,
        lastResponse: result,
        authLoaded: authLoaded,
      }));

      // Debug logging (dev only)
      if (process.env.NODE_ENV === 'development') {
        console.log('[MemeDeck] VOTE API RESPONSE', { 
          status: response.status, 
          ok: response.ok, 
          result,
          requestBody,
        });
      }

      if (!response.ok || !result.success) {
        const errorMsg = result.error || `HTTP ${response.status}: Failed to save vote`;
        const displayError = `Vote failed: ${errorMsg}`;
        setVoteError(displayError);
        setToast({ 
          message: errorMsg, 
          type: voteValue === 1 ? 'like' : 'dislike' 
        });
        setTimeout(() => {
          setToast(null);
          setVoteError(null);
        }, 3000);
        setIsVoting(false);
        return;
      }

      // PART 3: Update votesByCaptionId immediately for UI consistency
      // This ensures Previous/Next immediately shows the correct message without needing a reload
      setUserVotes(prev => ({
        ...prev,
        [currentSlide.captionId]: voteValue,
      }));
      
      console.log('[MemeDeck] DEBUG - Vote updated for caption:', currentSlide.captionId, 'vote:', voteValue);

      // Optional: Refetch that one row to confirm it was saved
      if (process.env.NODE_ENV === 'development') {
        try {
          const supabase = createClient();
          const { data: verifyData, error: verifyError } = await supabase
            .from('caption_votes')
            .select('caption_id, vote_value')
            .eq('profile_id', user?.id)
            .eq('caption_id', currentSlide.captionId)
            .single();
          
          if (verifyError) {
            console.warn('[MemeDeck] DEBUG - Vote verification failed:', verifyError);
          } else {
            console.log('[MemeDeck] DEBUG - Vote verified in DB:', verifyData);
          }
        } catch (verifyErr) {
          console.warn('[MemeDeck] DEBUG - Vote verification error:', verifyErr);
        }
      }

      // Show toast with success confirmation
      // Note: We've already updated userVotes state above, so the vote is confirmed
      setToast({ 
        message: 'Saved ✅', 
        type: voteValue === 1 ? 'like' : 'dislike' 
      });

      // Auto-advance to next slide
      setTimeout(() => {
        if (currentIndex < slides.length - 1) {
          setSlideDirection('left');
          setCurrentIndex(prev => prev + 1);
        } else {
          // Reached end - could loop or show message
          setToast({ message: 'You\'ve reached the end!', type: 'like' });
        }
        setToast(null);
      }, 300);

    } catch (err) {
      console.error('[MemeDeck] Error voting:', err);
      const errorMessage = err instanceof Error ? err.message : 'Failed to save vote';
      
      // Update debug info with error
      setVoteDebugInfo(prev => ({
        ...prev,
        lastStatus: null,
        lastErrorMessage: errorMessage,
        lastResponse: { success: false, error: errorMessage },
        authLoaded: authLoaded,
      }));
      
      setVoteError(`Vote failed: ${errorMessage}`);
      setToast({ 
        message: 'Failed to save vote', 
        type: voteValue === 1 ? 'like' : 'dislike' 
      });
      setTimeout(() => {
        setToast(null);
        setVoteError(null);
      }, 3000);
    } finally {
      setIsVoting(false);
    }
  }, [authLoaded, user, slides, currentIndex, isVoting, profileId]);

  // Keyboard shortcuts: ArrowUp = Like, ArrowDown = Dislike
  useEffect(() => {
    const handleKeyPress = (event: KeyboardEvent) => {
      // Ignore if key is repeating (held down)
      if (event.repeat) return;

      // Ignore if user is typing in an input field
      const target = event.target as HTMLElement;
      if (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable
      ) {
        return;
      }

      // Ignore if voting is in progress or loading
      if (isVoting || isLoading) return;

      // ArrowUp triggers LIKE (vote_value = 1)
      if (event.key === 'ArrowUp') {
        event.preventDefault(); // Prevent page scroll
        handleVote(1);
      }
      // ArrowDown triggers DISLIKE (vote_value = -1)
      else if (event.key === 'ArrowDown') {
        event.preventDefault(); // Prevent page scroll
        handleVote(-1);
      }
    };

    window.addEventListener('keydown', handleKeyPress);
    // Cleanup: Remove event listener on unmount
    return () => {
      window.removeEventListener('keydown', handleKeyPress);
    };
  }, [handleVote, isVoting, isLoading]);

  // Manual navigation
  const goToPrevious = () => {
    if (currentIndex > 0 && !isVoting) {
      setSlideDirection('right');
      setCurrentIndex(prev => prev - 1);
    }
  };

  const goToNext = () => {
    if (currentIndex < slides.length - 1 && !isVoting) {
      setSlideDirection('left');
      setCurrentIndex(prev => prev + 1);
    }
  };

  const currentSlide = slides[currentIndex];
  // PART 2: Get vote for current caption from votesByCaptionId lookup map
  // myVote will be 1 (liked), -1 (disliked), or undefined (never voted)
  const myVote: 1 | -1 | undefined = currentSlide ? (userVotes[currentSlide.captionId] as 1 | -1 | undefined) : undefined;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center">
          <p className="text-lg text-foreground/70">Loading memes...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center">
          <p className="text-lg text-red-600 dark:text-red-400">{error}</p>
        </div>
      </div>
    );
  }

  if (slides.length === 0) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center">
          <p className="text-lg text-foreground/70">No memes found</p>
          <p className="text-sm text-foreground/50 mt-2">
            Upload some images to generate captions!
          </p>
        </div>
      </div>
    );
  }

  const progressPercentage = slides.length > 0 ? ((currentIndex + 1) / slides.length) * 100 : 0;

  return (
    <div ref={deckRef} className="flex flex-col items-center justify-center min-h-[60vh]">
      {/* Stats HUD - Top Right */}
      <StatsHUD 
        userVotes={userVotes} 
        totalCount={slides.length} 
        isLoggedIn={userId !== null}
      />
      
      {/* Vote Load Error (RLS) - Dev only or small message */}
      {voteLoadError && (
        <div className={`fixed top-20 right-4 z-50 px-3 py-2 rounded-lg ${
          process.env.NODE_ENV === 'development' 
            ? 'bg-yellow-500/20 border border-yellow-500/30 text-yellow-200 text-xs' 
            : 'bg-red-500/20 border border-red-500/30 text-red-200 text-xs'
        }`} style={{ fontFamily: 'var(--font-poppins)', fontWeight: 500 }}>
          {voteLoadError}
        </div>
      )}
      
      {/* Centered Container */}
      <div className="max-w-[1000px] mx-auto px-4 sm:px-8 mb-8 w-full">
        {/* Two Column Layout: TV Left, Remote Right - Vertically Centered */}
        <div className="flex flex-col lg:flex-row items-center justify-center gap-6 lg:gap-8">
          {/* LEFT: TV Component */}
          <div className="w-full">
            <div
              key={currentIndex}
              className={`bg-[#fafafa] dark:bg-gray-800 rounded-[20px] shadow-[0_10px_30px_rgba(0,0,0,0.08)] border border-gray-200/50 dark:border-gray-700/50 overflow-hidden transition-transform duration-300 ${
                slideDirection === 'left' ? 'slide-animation-left' : slideDirection === 'right' ? 'slide-animation-right' : ''
              }`}
              onAnimationEnd={() => setSlideDirection(null)}
            >
              {/* TV Container with Antennas */}
              <div className="tv-container">
                {/* Antennas */}
                <div className="tv-antennas">
                  <div className="tv-antenna-left"></div>
                  <div className="tv-antenna-right"></div>
                </div>

                {/* TV Frame */}
                <div className="tv-frame mx-auto mt-6 mb-0">
                  {/* Channel Indicator */}
                  <div className="tv-channel-indicator">
                    <span>CH {String(currentIndex + 1).padStart(2, '0')}</span>
                    <span>{currentIndex + 1} / {slides.length}</span>
                  </div>

                  {/* TV Screen */}
                  <div className="tv-screen">
                    {currentSlide.imageUrl ? (
                      <img
                        key={currentSlide.captionId}
                        src={currentSlide.imageUrl}
                        alt={currentSlide.imageDescription || 'Meme'}
                        className="w-full h-auto max-h-[320px] sm:max-h-[420px] object-cover rounded-2xl relative z-0"
                        style={{ animation: 'fadeIn 0.3s ease-in' }}
                      />
                    ) : (
                      <div className="w-full h-[320px] sm:h-[420px] flex items-center justify-center text-gray-400 rounded-2xl">
                        No image
                      </div>
                    )}
                    {/* Power Light */}
                    <div className="tv-power-light"></div>
                    {/* Speaker Grill */}
                    <div className="tv-speaker-grill">
                      {[...Array(5)].map((_, i) => (
                        <div key={i} className="tv-speaker-dot"></div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Speech Bubble Caption */}
                <div className="speech-bubble mx-6">
                  <p className="text-[1.4rem] font-semibold text-foreground text-center leading-[1.5]" style={{ fontFamily: 'var(--font-fredoka)', fontWeight: 600 }}>
                    {currentSlide.captionText || 'No caption'}
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* RIGHT: Remote Control */}
          <div className="w-full lg:w-auto flex justify-center">
            <div className="remote-control">
              {/* IR Sensor */}
              <div className="remote-ir-sensor"></div>

              {/* Speaker Holes */}
              <div className="remote-speaker-holes">
                {[...Array(8)].map((_, i) => (
                  <div key={i} className="remote-speaker-hole"></div>
                ))}
              </div>

              {/* Decorative D-Pad */}
              <div className="remote-dpad">
                <div className="remote-dpad-outer"></div>
                <div className="remote-dpad-inner"></div>
              </div>

              {/* Like Button */}
              <button
                onClick={() => handleVote(1)}
                disabled={isVoting || !authLoaded}
                className={`remote-vote-button remote-button-like ${
                  isVoting || !authLoaded
                    ? 'remote-button-disabled'
                    : myVote === 1
                    ? 'remote-button-active'
                    : ''
                }`}
                style={{
                  fontFamily: 'var(--font-poppins)',
                }}
              >
                <span className={`remote-button-icon transition-transform duration-150 ${clickedButton === 'like' ? 'scale-110' : ''}`}>
                  ▲
                </span>
                <span className="remote-button-label">LIKE</span>
              </button>

              {/* Dislike Button */}
              <button
                onClick={() => handleVote(-1)}
                disabled={isVoting || !authLoaded}
                className={`remote-vote-button remote-button-dislike ${
                  isVoting || !authLoaded
                    ? 'remote-button-disabled'
                    : myVote === -1
                    ? 'remote-button-active'
                    : ''
                }`}
                style={{
                  fontFamily: 'var(--font-poppins)',
                }}
              >
                <span className={`remote-button-icon transition-transform duration-150 ${clickedButton === 'dislike' ? 'scale-110' : ''}`}>
                  ▼
                </span>
                <span className="remote-button-label">DISLIKE</span>
              </button>

              {/* Vote Status Message */}
              {myVote !== undefined && currentSlide && (
                <div className={`mt-3 px-3 py-1.5 rounded-lg text-xs text-center ${
                  myVote === 1 
                    ? 'bg-green-500/20 border border-green-500/30 text-green-200' 
                    : 'bg-red-500/20 border border-red-500/30 text-red-200'
                }`} style={{ fontFamily: 'var(--font-poppins)', fontWeight: 500 }}>
                  {myVote === 1 ? 'You liked this caption' : 'You disliked this caption'}
                </div>
              )}

              {/* Vote Error Display */}
              {voteError && (
                <div className="mt-2 px-3 py-1.5 rounded-lg bg-red-500/20 border border-red-500/30 text-red-200 text-xs text-center" style={{ fontFamily: 'var(--font-poppins)', fontWeight: 500 }}>
                  {voteError}
                </div>
              )}

              {/* Debug Panel - Dev Only */}
              {process.env.NODE_ENV === 'development' && (
                <div className="mt-4 text-xs bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 px-3 py-2 rounded-lg"
                     style={{ fontFamily: 'var(--font-poppins)', fontWeight: 400 }}>
                  <div className="font-semibold mb-1 text-gray-700 dark:text-gray-300">Debug Info:</div>
                  <div className="space-y-1 text-gray-600 dark:text-gray-400">
                    <div>Auth Loaded: <span className={`font-mono ${authLoaded ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>{authLoaded ? '✅ Yes' : '❌ No'}</span></div>
                    <div>User ID: <span className="font-mono text-[10px]">{user?.id || voteDebugInfo.userId || 'null'}</span></div>
                    <div className="mt-2 pt-2 border-t border-gray-300 dark:border-gray-600">
                      <div className="text-[10px] font-semibold">Last Request:</div>
                      {voteDebugInfo.lastRequestBody ? (
                        <>
                          <div className="text-[10px] ml-2">Caption ID: <span className="font-mono">{voteDebugInfo.lastRequestBody.captionId || 'null'}</span></div>
                          <div className="text-[10px] ml-2">Vote Value: <span className="font-mono">{voteDebugInfo.lastRequestBody.voteValue !== null ? voteDebugInfo.lastRequestBody.voteValue : 'null'}</span></div>
                        </>
                      ) : (
                        <div className="text-[10px] ml-2 text-gray-400">—</div>
                      )}
                    </div>
                    <div className="mt-2 pt-2 border-t border-gray-300 dark:border-gray-600">
                      <div className="text-[10px] font-semibold">Last Response:</div>
                      <div className="text-[10px] ml-2">Status: <span className={`font-mono ${voteDebugInfo.lastStatus ? (voteDebugInfo.lastStatus >= 200 && voteDebugInfo.lastStatus < 300 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400') : 'text-gray-400'}`}>{voteDebugInfo.lastStatus || '—'}</span></div>
                      {voteDebugInfo.lastErrorMessage && (
                        <div className="text-[10px] ml-2 text-red-600 dark:text-red-400">Error: <span className="font-mono">{voteDebugInfo.lastErrorMessage}</span></div>
                      )}
                      {voteDebugInfo.lastResponse && (
                        <div className="text-[10px] ml-2">Success: <span className={`font-mono ${voteDebugInfo.lastResponse.success ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>{voteDebugInfo.lastResponse.success ? '✅ Yes' : '❌ No'}</span></div>
                      )}
                    </div>
                    <div className="mt-2 pt-2 border-t border-gray-300 dark:border-gray-600">
                      <div className="text-[10px]">Current State:</div>
                      <div className="text-[10px] ml-2">Caption ID: <span className="font-mono">{currentSlide?.captionId || 'null'}</span></div>
                      <div className="text-[10px] ml-2">My Vote: <span className="font-mono">{myVote !== undefined ? myVote : 'null'}</span></div>
                      <div className="text-[10px] ml-2">Votes in State: <span className="font-mono">{Object.keys(userVotes).length}</span></div>
                    </div>
                    {voteDebugInfo.lastResponse?.voteHydration && (
                      <div className="mt-2 pt-2 border-t border-gray-300 dark:border-gray-600">
                        <div className="text-[10px]">Vote Hydration:</div>
                        <div className="text-[10px] ml-2">Caption IDs: {voteDebugInfo.lastResponse.voteHydration.captionIdsRequested}</div>
                        <div className="text-[10px] ml-2">Votes Fetched: {voteDebugInfo.lastResponse.voteHydration.votesFetched}</div>
                      </div>
                    )}
                    {!authLoaded && (
                      <div className="mt-2 text-yellow-600 dark:text-yellow-400 text-[10px]">
                        ⚠️ Auth not loaded - voting disabled
                      </div>
                    )}
                    {authLoaded && !user && (
                      <div className="mt-2 text-orange-600 dark:text-orange-400 text-[10px]">
                        ⚠️ Not signed in - voting disabled
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Manual Navigation Arrows */}
      <div className="flex gap-4 items-center">
        <button
          onClick={goToPrevious}
          disabled={currentIndex === 0 || isVoting}
          className={`px-4 py-2 rounded-lg transition-colors ${
            currentIndex === 0 || isVoting
              ? 'bg-gray-300 dark:bg-gray-700 text-gray-500 dark:text-gray-400 cursor-not-allowed'
              : 'bg-gray-600 hover:bg-gray-700 text-white'
          }`}
          style={{ fontFamily: 'var(--font-poppins)', fontWeight: 500 }}
        >
          ← Previous
        </button>
        <button
          onClick={goToNext}
          disabled={currentIndex === slides.length - 1 || isVoting}
          className={`px-4 py-2 rounded-lg transition-colors ${
            currentIndex === slides.length - 1 || isVoting
              ? 'bg-gray-300 dark:bg-gray-700 text-gray-500 dark:text-gray-400 cursor-not-allowed'
              : 'bg-gray-600 hover:bg-gray-700 text-white'
          }`}
          style={{ fontFamily: 'var(--font-poppins)', fontWeight: 500 }}
        >
          Next →
        </button>
      </div>

      {/* Toast Notification */}
      {toast && (
        <div
          className={`fixed top-4 left-1/2 transform -translate-x-1/2 px-6 py-3 rounded-lg shadow-lg z-50 transition-all ${
            toast.type === 'like'
              ? 'bg-green-600 text-white'
              : 'bg-red-600 text-white'
          }`}
          style={{ fontFamily: 'var(--font-poppins)', fontWeight: 500 }}
        >
          {toast.message}
        </div>
      )}


      {/* Upload CTA */}
      <div className="mt-12 flex justify-center">
        <div className="bg-white dark:bg-gray-800 rounded-[20px] shadow-[0_10px_30px_rgba(0,0,0,0.08)] border border-gray-200/50 dark:border-gray-700/50 p-8 max-w-md w-full text-center">
          <h2 className="text-2xl font-bold text-foreground mb-2" style={{ fontFamily: 'var(--font-fredoka)', fontWeight: 600 }}>
            Upload a Meme
          </h2>
          <p className="text-sm text-foreground/60 mb-6" style={{ fontFamily: 'var(--font-poppins)', fontWeight: 400 }}>
            Add your own image and generate captions.
          </p>
          <a
            href="/upload"
            className="inline-block px-8 py-3 rounded-2xl font-semibold text-white bg-blue-600 hover:bg-blue-700 transition-colors shadow-lg hover:shadow-xl"
            style={{ fontFamily: 'var(--font-poppins)', fontWeight: 600 }}
          >
            Upload Photo
          </a>
        </div>
      </div>
    </div>
  );
}
