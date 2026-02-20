'use client';

import { useState, memo, useEffect } from 'react';
import { useRouter } from 'next/navigation';

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
      setSuccess(null); // Explicitly clear success
      setTimeout(() => {
        setError(null);
      }, 5000);
      return;
    }

    // Early return guard: Check if caption exists
    // Check for null, undefined, empty string, or whitespace-only
    const hasValidCaption = captionId && typeof captionId === 'string' && captionId.trim().length > 0;
    
    if (!hasValidCaption) {
      setError('Error: caption is null.');
      setSuccess(null); // Explicitly clear success - CRITICAL
      setTimeout(() => {
        setError(null);
      }, 5000);
      return;
    }

    // Both conditions met: user is logged in AND caption exists
    // Only now do we proceed with API call
    setIsLoading(true);
    setError(null);
    setSuccess(null); // Double-check success is cleared

    try {
      const response = await fetch(`/api/captions/${captionId}/vote`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ vote_value: voteType === 'up' ? 1 : -1 }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to submit vote');
      }

      // CRITICAL: Only set success if we still have a valid captionId
      // Double-check before setting success to prevent showing success on cards without captions
      const stillHasValidCaption = captionId && typeof captionId === 'string' && captionId.trim().length > 0;
      
      if (stillHasValidCaption) {
        setSuccess('Vote submitted successfully!');
        
        // Refresh the page to show updated vote counts
        router.refresh();

        // Clear success message after 3 seconds
        setTimeout(() => {
          setSuccess(null);
        }, 3000);
      } else {
        // This should never happen if guards worked, but defensive check
        console.error('Attempted to set success but captionId is invalid:', captionId);
        setError('Error: caption is null.');
        setSuccess(null);
      }

    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'An error occurred';
      setError(errorMessage);
      setSuccess(null); // Clear success when error occurs
      
      // Clear error message after 5 seconds
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
