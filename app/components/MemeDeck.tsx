'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';
import { shuffle } from '@/lib/shuffle';
import type { User } from '@supabase/supabase-js';
import PreviewRail from './PreviewRail';

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
  const [votesHydrated, setVotesHydrated] = useState(false);
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

  const getIndexStorageKey = (id: string) => `memeDeckIndex:${id}`;
  const getOrderStorageKey = (id: string) => `memeDeckOrder:${id}`;

  // PART A: Persist currentIndex to localStorage whenever it changes
  useEffect(() => {
    // Skip persistence during initial restore
    if (isRestoringIndexRef.current || !profileId) return;

    const storageKey = getIndexStorageKey(profileId);
    try {
      localStorage.setItem(storageKey, String(currentIndex));
    } catch (err) {
      console.error('[MemeDeck] Failed to persist index', err);
    }
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
  // Uses chunked queries to avoid 400 Bad Request from very long IN clauses
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

      console.log('[MemeDeck] DEBUG - Fetching votes for', captionIds.length, 'captions in chunks (profileId:', userProfileId, ')');

      const CHUNK_SIZE = 75;
      const aggregatedVotes: Record<string, 1 | -1> = {};

      for (let i = 0; i < captionIds.length; i += CHUNK_SIZE) {
        const chunk = captionIds.slice(i, i + CHUNK_SIZE);

        const { data, error } = await supabase
          .from('caption_votes')
          .select('caption_id, vote_value')
          .eq('profile_id', userProfileId)
          .in('caption_id', chunk);

        if (error) {
          console.error('[MemeDeck] Error fetching votes chunk:', {
            error,
            chunkSize: chunk.length,
          });
          // Check for RLS errors
          if (
            error.code === 'PGRST301' ||
            error.message?.includes('RLS') ||
            error.message?.includes('permission') ||
            error.message?.includes('policy')
          ) {
            const errorMsg = "Votes can't be loaded (RLS)";
            setVoteLoadError(
              process.env.NODE_ENV === 'development'
                ? `${errorMsg}: ${error.message}`
                : errorMsg
            );
          } else {
            // Clear any previous RLS error if it's a different error
            setVoteLoadError(null);
          }
          // If any chunk fails, stop further requests
          return;
        }

        if (data && data.length > 0) {
          data.forEach((vote) => {
            if (vote.vote_value === 1 || vote.vote_value === -1) {
              aggregatedVotes[vote.caption_id] = vote.vote_value as 1 | -1;
            }
          });
        }
      }

      // Clear RLS error on successful load
      setVoteLoadError(null);

      const votesLoadedCount = Object.keys(aggregatedVotes).length;
      console.log('[MemeDeck] DEBUG - Vote hydration complete:', {
        captionIdsRequested: captionIds.length,
        votesFetched: votesLoadedCount,
      });

      if (votesLoadedCount > 0) {
        setUserVotes((prev) => ({
          ...prev,
          ...aggregatedVotes,
        }));
      }
      
      // Mark votes as hydrated after loading completes (even if no votes found)
      setVotesHydrated(true);
    } catch (err) {
      console.error('[MemeDeck] Error fetching user votes:', err);
      // Still mark as hydrated even on error to avoid blocking shuffle forever
      setVotesHydrated(true);
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

        let finalSlides = slidesData;

        // Get profileId and restore saved order + index
        if (userId && slidesData.length > 0) {
          const userProfileId = await getProfileId();
          if (userProfileId) {
            setProfileId(userProfileId);

            try {
              const orderKey = getOrderStorageKey(userProfileId);
              const storedOrderStr = localStorage.getItem(orderKey);
              if (storedOrderStr) {
                const storedIds: string[] = JSON.parse(storedOrderStr);
                const byId = new Map(slidesData.map((s) => [s.captionId, s]));
                const orderedSlides: Slide[] = [];

                storedIds.forEach((id) => {
                  const slide = byId.get(id);
                  if (slide) {
                    orderedSlides.push(slide);
                    byId.delete(id);
                  }
                });

                // Append any new slides not in stored order
                byId.forEach((slide) => {
                  orderedSlides.push(slide);
                });

                if (orderedSlides.length === slidesData.length) {
                  finalSlides = orderedSlides;
                }
              }
            } catch (e) {
              console.error('[MemeDeck] Failed to restore memeDeckOrder', e);
            }

            // Restore saved slide index (relative to finalSlides order)
            const indexKey = getIndexStorageKey(userProfileId);
            const savedIndexStr = localStorage.getItem(indexKey);
            const savedIndex = savedIndexStr ? parseInt(savedIndexStr, 10) : 0;
            const restoredIndex = Math.max(0, Math.min(savedIndex, finalSlides.length - 1));

            console.log('[MemeDeck] DEBUG - persistence restore', {
              profileId: userProfileId,
              savedIndex,
              restoredIndex,
            });

            isRestoringIndexRef.current = true;
            setCurrentIndex(restoredIndex);
            isRestoringIndexRef.current = false;
          }
        } else {
          // Logged out: start at index 0
          setCurrentIndex(0);
        }

        setSlides(finalSlides);
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
          setVotesHydrated(true); // Mark as hydrated even if no slides
        }
        return;
      }

      if (!user) {
        console.log('[MemeDeck] DEBUG - No user, clearing votes');
        setUserVotes({});
        setVotesHydrated(true); // Mark as hydrated when logged out
        return;
      }
      
      // Reset hydration status when starting a new vote load
      setVotesHydrated(false);

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

            let finalSlides = slidesData;

            // Apply stored order for logged-in user on refresh
            if (user && slidesData.length > 0) {
              const userProfileId = await getProfileId();
              if (userProfileId) {
                setProfileId(userProfileId);

                try {
                  const orderKey = getOrderStorageKey(userProfileId);
                  const storedOrderStr = localStorage.getItem(orderKey);
                  if (storedOrderStr) {
                    const storedIds: string[] = JSON.parse(storedOrderStr);
                    const byId = new Map(slidesData.map((s) => [s.captionId, s]));
                    const orderedSlides: Slide[] = [];

                    storedIds.forEach((id) => {
                      const slide = byId.get(id);
                      if (slide) {
                        orderedSlides.push(slide);
                        byId.delete(id);
                      }
                    });

                    byId.forEach((slide) => {
                      orderedSlides.push(slide);
                    });

                    if (orderedSlides.length === slidesData.length) {
                      finalSlides = orderedSlides;
                    }
                  }
                } catch (e) {
                  console.error('[MemeDeck] Failed to restore memeDeckOrder on refresh', e);
                }

                // Restore saved index after refresh (relative to finalSlides)
                const indexKey = getIndexStorageKey(userProfileId);
                const savedIndexStr = localStorage.getItem(indexKey);
                const savedIndex = savedIndexStr ? parseInt(savedIndexStr, 10) : 0;
                const restoredIndex = Math.max(0, Math.min(savedIndex, finalSlides.length - 1));

                isRestoringIndexRef.current = true;
                setCurrentIndex(restoredIndex);
                isRestoringIndexRef.current = false;
              }
            }

            setSlides(finalSlides);
            setHasMore(finalSlides.length === CAPTIONS_PER_PAGE);
            setCurrentPage(0); // Reset to first page on refresh
            if (refreshCount !== null && refreshCount !== undefined) {
              setDebugInfo({
                totalAvailable: refreshCount,
                returned: finalSlides.length,
                filters: 'images.is_public = true OR images.is_common_use = true (foreignTable)',
                range: '0-999'
              });
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

    // Optimistic update: remember previous vote so we can revert on error
    const previousVote = userVotes[currentSlide.captionId];
    setUserVotes(prev => ({
      ...prev,
      [currentSlide.captionId]: voteValue,
    }));

    try {
      // Ensure voteValue is always 1 or -1
      const voteValueNumber: 1 | -1 = voteValue === 1 ? 1 : -1;
      const requestBody = {
        captionId: currentSlide.captionId,
        voteValue: voteValueNumber,
      };

      // Call the authenticated API route
      const voteUrl = '/api/vote';
      const response = await fetch(voteUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      });

      // Capture response text before parsing JSON
      const responseText = await response.text();
      let responseJson = null;
      try {
        responseJson = JSON.parse(responseText);
      } catch (jsonError) {
        console.error('[MemeDeck] Failed to parse response JSON:', jsonError);
        responseJson = { success: false, error: `Invalid JSON response: ${responseText}` };
      }

      // Debug logging (console only)
      if (process.env.NODE_ENV === 'development') {
        console.log('[MemeDeck] VOTE API RESPONSE', { 
          url: voteUrl,
          status: response.status, 
          ok: response.ok, 
          requestBody,
          responseText,
          responseJson,
        });
      }

      if (!response.ok || !responseJson?.success) {
        const errorMsg = responseJson?.error || `HTTP ${response.status}: Failed to save vote`;
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

        // Revert optimistic update on error
        setUserVotes(prev => ({
          ...prev,
          ...(previousVote === undefined
            ? (() => {
                const { [currentSlide.captionId]: _removed, ...rest } = prev;
                return rest;
              })()
            : { [currentSlide.captionId]: previousVote }),
        }));
        setIsVoting(false);
        return;
      }

      console.log('[MemeDeck] DEBUG - Vote saved for caption:', currentSlide.captionId, 'savedRow:', responseJson?.savedRow);

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

      // Revert optimistic update on network error
      setUserVotes(prev => ({
        ...prev,
        ...(previousVote === undefined
          ? (() => {
              const { [currentSlide.captionId]: _removed, ...rest } = prev;
              return rest;
            })()
          : { [currentSlide.captionId]: previousVote }),
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
  }, [authLoaded, user, slides, currentIndex, isVoting, profileId, userVotes]);

  const handleShuffleMemes = useCallback(() => {
    if (slides.length <= 1) return;

    setSlides((prevSlides) => {
      if (prevSlides.length <= 1) return prevSlides;

      // Separate unrated vs rated memes
      const isRated = (captionId: string) => {
        return userVotes[captionId] !== undefined && userVotes[captionId] !== null;
      };

      const unrated = prevSlides.filter((s) => !isRated(s.captionId));
      const rated = prevSlides.filter((s) => isRated(s.captionId));

      // Shuffle each group independently
      const shuffledUnrated = shuffle(unrated);
      const shuffledRated = shuffle(rated);

      // Combine with unrated first
      const next = [...shuffledUnrated, ...shuffledRated];

      const nextIndex = 0;
      setCurrentIndex(nextIndex);

      if (profileId) {
        const orderKey = getOrderStorageKey(profileId);
        const indexKey = getIndexStorageKey(profileId);
        const orderIds = next.map((s) => s.captionId);
        try {
          localStorage.setItem(orderKey, JSON.stringify(orderIds));
          localStorage.setItem(indexKey, String(nextIndex));
        } catch (err) {
          console.error('[MemeDeck] Failed to persist shuffled order', err);
        }
      }

      return next;
    });
  }, [slides.length, userVotes, profileId]);

  // Manual navigation - wrapped in useCallback for stability
  const goToPrevious = useCallback(() => {
    if (currentIndex > 0 && !isVoting) {
      setSlideDirection('right');
      setCurrentIndex(prev => prev - 1);
    }
  }, [currentIndex, isVoting]);

  const goToNext = useCallback(() => {
    if (currentIndex < slides.length - 1 && !isVoting) {
      setSlideDirection('left');
      setCurrentIndex(prev => prev + 1);
    }
  }, [currentIndex, slides.length, isVoting]);

  // Jump to a specific index (for preview rail clicks)
  const jumpToIndex = useCallback((index: number) => {
    if (index < 0 || index >= slides.length || isVoting) return;
    
    const direction = index > currentIndex ? 'left' : 'right';
    setSlideDirection(direction);
    setCurrentIndex(index);
  }, [currentIndex, slides.length, isVoting]);

  // Keyboard shortcuts: All arrow keys for navigation and voting
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      // Ignore if auth not loaded
      if (!authLoaded) return;

      // Ignore if key is repeating (held down)
      if (e.repeat) return;

      // Ignore if user is typing in an input field
      const target = e.target as HTMLElement;
      if (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable
      ) {
        return;
      }

      // Ignore if voting is in progress or loading
      if (isVoting || isLoading) return;

      // Left Arrow = Previous meme
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        goToPrevious();
        return;
      }

      // Right Arrow = Next meme
      if (e.key === 'ArrowRight') {
        e.preventDefault();
        goToNext();
        return;
      }

      // Up Arrow = Like
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        handleVote(1);
        return;
      }

      // Down Arrow = Dislike
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        handleVote(-1);
        return;
      }
    }

    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [authLoaded, isVoting, isLoading, goToPrevious, goToNext, handleVote]);

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
    <div ref={deckRef} className="min-h-[60vh]">

      {/* Vote Load Error (RLS) */}
      {voteLoadError && (
        <div
          className="fixed top-20 right-4 z-40 px-3 py-2 rounded-lg bg-red-500/20 border border-red-500/40 text-red-100 text-xs"
          style={{ fontFamily: 'var(--font-poppins)', fontWeight: 500 }}
        >
          {voteLoadError}
        </div>
      )}

      {/* Hero Meme Player */}
      <div className="max-w-6xl mx-auto px-2 sm:px-4 lg:px-0 pt-4 sm:pt-6 lg:pt-10">
        <div
          key={currentIndex}
          className={`grid lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)] gap-6 sm:gap-8 items-stretch bg-black/70 border border-white/10 rounded-3xl shadow-[0_24px_80px_rgba(0,0,0,0.9)] backdrop-blur-xl p-4 sm:p-6 lg:p-8 transition-transform duration-300 ${
            slideDirection === 'left'
              ? 'slide-animation-left'
              : slideDirection === 'right'
              ? 'slide-animation-right'
              : ''
          }`}
          onAnimationEnd={() => setSlideDirection(null)}
        >
          {/* Left: Cinematic meme frame */}
          <div className="relative overflow-hidden rounded-2xl bg-zinc-950 border border-white/10 flex items-center justify-center">
            {currentSlide.imageUrl ? (
              <img
                key={currentSlide.captionId}
                src={currentSlide.imageUrl}
                alt={currentSlide.imageDescription || 'Meme'}
                className="w-full h-full object-contain max-h-[420px] sm:max-h-[520px]"
                style={{ animation: 'fadeIn 0.3s ease-in' }}
              />
            ) : (
              <div className="w-full h-[260px] sm:h-[340px] flex items-center justify-center text-gray-500 text-sm sm:text-base">
                No image available
              </div>
            )}

            {/* Overlay gradient & chrome */}
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(255,255,255,0.18),transparent_55%),radial-gradient(circle_at_bottom,_rgba(0,0,0,0.9),transparent_60%)]" />
            <div className="absolute top-3 left-3 px-2.5 py-1 rounded-full bg-black/70 border border-white/15 text-[11px] uppercase tracking-[0.15em] text-gray-300" style={{ fontFamily: 'var(--font-poppins)', fontWeight: 500 }}>
              Currently rating
            </div>
            <div className="absolute bottom-3 left-3 flex items-center gap-2 text-xs text-gray-200" style={{ fontFamily: 'var(--font-poppins)', fontWeight: 400 }}>
              <span className="inline-flex h-1.5 w-1.5 rounded-full bg-red-500 animate-pulse" />
              <span>
                {currentIndex + 1} / {slides.length}
              </span>
            </div>
          </div>

          {/* Right: Caption + controls */}
          <div className="flex flex-col justify-between gap-6 sm:gap-8">
            <div className="space-y-4 sm:space-y-5">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p
                    className="text-[11px] uppercase tracking-[0.2em] text-gray-400"
                    style={{ fontFamily: 'var(--font-poppins)', fontWeight: 500 }}
                  >
                    Meme caption
                  </p>
                  <h2
                    className="mt-1 text-xl sm:text-2xl lg:text-3xl font-semibold text-white whitespace-normal break-words leading-relaxed"
                    style={{ fontFamily: 'var(--font-poppins)' }}
                  >
                    {currentSlide.captionText || 'No caption yet'}
                  </h2>
                </div>
                <div className="hidden sm:flex flex-col items-end text-xs text-gray-400" style={{ fontFamily: 'var(--font-poppins)', fontWeight: 400 }}>
                  <span className="text-[11px] uppercase tracking-[0.16em] text-gray-500">
                    Progress
                  </span>
                  <span className="text-sm text-gray-200">
                    {currentIndex + 1} / {slides.length}
                  </span>
                </div>
              </div>

              {/* Progress bar */}
              <div className="w-full h-1.5 bg-white/10 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-red-500 via-pink-500 to-purple-500 transition-all duration-300"
                  style={{ width: `${progressPercentage}%` }}
                />
              </div>

              {/* Inline stats pills */}
              <div className="flex flex-wrap items-center gap-2 pt-1">
                {/* Reuse StatsHUD logic by recomputing here */}
                {(() => {
                  const likedCount = Object.values(userVotes).filter((v) => v === 1).length;
                  const dislikedCount = Object.values(userVotes).filter((v) => v === -1).length;
                  const leftCount = slides.length - (likedCount + dislikedCount);
                  return (
                    <>
                      <span className="inline-flex items-center gap-1 rounded-full bg-white/5 border border-white/15 px-2.5 py-1 text-[11px] text-gray-100" style={{ fontFamily: 'var(--font-poppins)', fontWeight: 500 }}>
                        <span>👍</span>
                        <span>Liked: {likedCount}</span>
                      </span>
                      <span className="inline-flex items-center gap-1 rounded-full bg-white/5 border border-white/15 px-2.5 py-1 text-[11px] text-gray-100" style={{ fontFamily: 'var(--font-poppins)', fontWeight: 500 }}>
                        <span>👎</span>
                        <span>Disliked: {dislikedCount}</span>
                      </span>
                      <span className="inline-flex items-center gap-1 rounded-full bg-white/5 border border-white/15 px-2.5 py-1 text-[11px] text-gray-100" style={{ fontFamily: 'var(--font-poppins)', fontWeight: 500 }}>
                        <span>⏳</span>
                        <span>Left: {leftCount}</span>
                      </span>
                    </>
                  );
                })()}
              </div>
            </div>

            {/* Vote controls */}
            <div className="space-y-3 sm:space-y-4">
              <div className="flex flex-col gap-3">
                <div className="flex flex-col sm:flex-row gap-3">
                  <button
                    onClick={() => handleVote(1)}
                    disabled={isVoting || !authLoaded}
                    className={`flex-1 inline-flex items-center justify-center rounded-full px-4 py-2.5 text-sm sm:text-base font-semibold transition-all duration-200 ${
                      isVoting || !authLoaded
                        ? 'bg-gray-700 text-gray-500 cursor-not-allowed'
                        : myVote === 1
                        ? 'bg-emerald-500 text-white shadow-[0_0_20px_rgba(16,185,129,0.6)]'
                        : 'bg-emerald-600/20 text-emerald-200 border border-emerald-500/40 hover:bg-emerald-500/30 hover:border-emerald-400/70'
                    }`}
                    style={{ fontFamily: 'var(--font-poppins)' }}
                  >
                    <span className={`mr-2 text-lg transition-transform duration-150 ${clickedButton === 'like' ? 'scale-110' : ''}`}>
                      👍
                    </span>
                    Like
                  </button>

                  <button
                    onClick={() => handleVote(-1)}
                    disabled={isVoting || !authLoaded}
                    className={`flex-1 inline-flex items-center justify-center rounded-full px-4 py-2.5 text-sm sm:text-base font-semibold transition-all duration-200 ${
                      isVoting || !authLoaded
                        ? 'bg-gray-700 text-gray-500 cursor-not-allowed'
                        : myVote === -1
                        ? 'bg-red-500 text-white shadow-[0_0_20px_rgba(239,68,68,0.6)]'
                        : 'bg-red-600/20 text-red-200 border border-red-500/40 hover:bg-red-500/30 hover:border-red-400/70'
                    }`}
                    style={{ fontFamily: 'var(--font-poppins)' }}
                  >
                    <span className={`mr-2 text-lg transition-transform duration-150 ${clickedButton === 'dislike' ? 'scale-110' : ''}`}>
                      👎
                    </span>
                    Dislike
                  </button>
                </div>

                <div className="flex items-center justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    {/* Vote Status Message */}
                    {myVote !== undefined && currentSlide && (
                      <div
                        className={`px-3 py-1.5 rounded-full text-[11px] sm:text-xs text-center inline-flex items-center gap-1 ${
                          myVote === 1
                            ? 'bg-emerald-500/15 border border-emerald-500/40 text-emerald-200'
                            : 'bg-red-500/15 border border-red-500/40 text-red-200'
                        }`}
                        style={{ fontFamily: 'var(--font-poppins)', fontWeight: 500 }}
                      >
                        <span>{myVote === 1 ? 'You liked this caption' : 'You disliked this caption'}</span>
                      </div>
                    )}
                    {voteError && (
                      <div
                        className="mt-1 px-3 py-1.5 rounded-full bg-red-500/15 border border-red-500/40 text-red-200 text-[11px] sm:text-xs inline-block"
                        style={{ fontFamily: 'var(--font-poppins)', fontWeight: 500 }}
                      >
                        {voteError}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Preview Rail */}
        {slides.length > 0 && (
          <PreviewRail
            captions={slides}
            currentIndex={currentIndex}
            onSelectIndex={jumpToIndex}
            votesByCaptionId={userVotes}
          />
        )}
      </div>

      {/* Manual Navigation Arrows */}
      <div className="flex gap-4 items-center justify-center mt-6">
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
        <button
          onClick={handleShuffleMemes}
          disabled={!votesHydrated || !authLoaded || slides.length <= 1 || isVoting}
          className={`px-4 py-2 rounded-lg transition-all duration-200 flex items-center gap-2 ${
            !votesHydrated || !authLoaded || slides.length <= 1 || isVoting
              ? 'bg-gray-300 dark:bg-gray-700 text-gray-500 dark:text-gray-400 cursor-not-allowed'
              : 'bg-gray-600 hover:bg-gray-700 hover:scale-[1.02] hover:shadow-lg text-white'
          }`}
          style={{ fontFamily: 'var(--font-poppins)', fontWeight: 500 }}
        >
          <span className="text-sm">🔀</span>
          <span>Shuffle</span>
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
