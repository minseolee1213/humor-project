'use client';

import { useState, memo, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

interface ImageVoteButtonsProps {
  captionId: string | null; // null if no caption exists for this image
  isAuthenticated: boolean;
  currentVote?: number | null; // 1 for upvote, -1 for downvote, null/undefined for no vote
}

function ImageVoteButtons({ 
  captionId, 
  isAuthenticated,
  currentVote
}: ImageVoteButtonsProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const router = useRouter();

  // Clear success whenever captionId changes or becomes null/empty
  useEffect(() => {
    const hasValidCaption = captionId && typeof captionId === 'string' && captionId.trim().length > 0;
    if (!hasValidCaption) {
      setSuccess(null);
      setError(null); // Also clear error when captionId becomes invalid
    }
  }, [captionId]);

  const handleVote = async (voteType: 'up' | 'down') => {
    // IMMEDIATELY clear all messages - do this first
    setSuccess(null);
    setError(null);
    setIsLoading(false);

    // Early return guard: Check if user is logged in
    if (!isAuthenticated) {
      setError('Please sign in to vote.');
      setSuccess(null);
      setTimeout(() => {
        setError(null);
      }, 5000);
      return;
    }

    // Early return guard: Check if caption exists
    const hasValidCaption = captionId && typeof captionId === 'string' && captionId.trim().length > 0;
    
    if (!hasValidCaption) {
      setError('Error: caption is null.');
      setSuccess(null);
      setTimeout(() => {
        setError(null);
      }, 5000);
      return;
    }

    // Both conditions met: user is logged in AND caption exists
    setIsLoading(true);
    setError(null);
    setSuccess(null);

    try {
      const supabase = createClient();
      
      // Get current user session
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      
      if (authError || !user) {
        setError('Session not recognized on server—please sign in again.');
        setSuccess(null);
        setTimeout(() => {
          setError(null);
        }, 5000);
        return;
      }

      // Resolve profile_id
      let profileId: string;
      
      // Try to get profile by matching profiles.id with auth.users.id
      const { data: profile } = await supabase
        .from('profiles')
        .select('id')
        .eq('id', user.id)
        .single();

      if (profile) {
        profileId = profile.id;
      } else {
        // Try alternative: check if there's a user_id column in profiles
        const { data: profileByUserId } = await supabase
          .from('profiles')
          .select('id')
          .eq('user_id', user.id)
          .single();
        
        if (profileByUserId) {
          profileId = profileByUserId.id;
        } else {
          // Fallback: assume profiles.id = auth.users.id
          profileId = user.id;
        }
      }

      // Check if existing vote exists to preserve created_datetime_utc
      const { data: existingVote } = await supabase
        .from('caption_votes')
        .select('created_datetime_utc')
        .eq('profile_id', profileId)
        .eq('caption_id', captionId)
        .single();

      const nowIso = new Date().toISOString();
      const voteValue = voteType === 'up' ? 1 : -1;

      const voteData = {
        caption_id: captionId,
        profile_id: profileId,
        vote_value: voteValue,
        created_datetime_utc: existingVote?.created_datetime_utc || nowIso,
        modified_datetime_utc: nowIso,
      };

      // Use UPSERT with onConflict
      const { data: voteResult, error: voteError } = await supabase
        .from('caption_votes')
        .upsert(voteData, {
          onConflict: 'profile_id,caption_id',
        })
        .select()
        .single();

      if (voteError) {
        // Check for auth errors
        if (voteError.code === 'PGRST301' || voteError.message.includes('JWT') || voteError.message.includes('auth')) {
          setError('Session not recognized on server—please sign in again.');
        } else {
          setError(voteError.message || 'Failed to submit vote');
        }
        setSuccess(null);
        setTimeout(() => {
          setError(null);
        }, 5000);
        return;
      }

      // Success!
      setSuccess('Vote submitted successfully!');
      router.refresh();

      setTimeout(() => {
        setSuccess(null);
      }, 3000);

    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'An error occurred';
      setError(errorMessage);
      setSuccess(null);
      
      setTimeout(() => {
        setError(null);
      }, 5000);
    } finally {
      setIsLoading(false);
    }
  };

  const isUpvoted = currentVote === 1;
  const isDownvoted = currentVote === -1;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-2">
        <button
          onClick={() => handleVote('up')}
          disabled={isLoading}
          className={`px-3 py-1.5 rounded text-xs font-medium transition-colors duration-200 ${
            isLoading
              ? 'bg-gray-300 dark:bg-gray-700 text-gray-500 dark:text-gray-400 cursor-not-allowed'
              : isUpvoted
              ? 'bg-green-700 hover:bg-green-800 text-white ring-2 ring-green-400'
              : 'bg-green-600 hover:bg-green-700 text-white'
          }`}
          title={isUpvoted ? 'You upvoted this' : 'Upvote'}
        >
          {isLoading ? '...' : '▲ Upvote'}
        </button>
        <button
          onClick={() => handleVote('down')}
          disabled={isLoading}
          className={`px-3 py-1.5 rounded text-xs font-medium transition-colors duration-200 ${
            isLoading
              ? 'bg-gray-300 dark:bg-gray-700 text-gray-500 dark:text-gray-400 cursor-not-allowed'
              : isDownvoted
              ? 'bg-red-700 hover:bg-red-800 text-white ring-2 ring-red-400'
              : 'bg-red-600 hover:bg-red-700 text-white'
          }`}
          title={isDownvoted ? 'You downvoted this' : 'Downvote'}
        >
          {isLoading ? '...' : '▼ Downvote'}
        </button>
      </div>
      
      {error && (
        <div className="text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 px-2 py-1 rounded">
          {error}
        </div>
      )}
      
      {/* Only show success if captionId exists and is valid - prevent showing success for cards without captions */}
      {success && captionId && typeof captionId === 'string' && captionId.trim().length > 0 ? (
        <div className="text-xs text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-900/20 px-2 py-1 rounded">
          {success}
        </div>
      ) : null}
    </div>
  );
}

export default memo(ImageVoteButtons);
