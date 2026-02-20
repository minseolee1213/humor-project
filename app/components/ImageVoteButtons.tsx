'use client';

import { useState, memo } from 'react';
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

  const handleVote = async (voteType: 'up' | 'down') => {
    // Clear previous messages
    setError(null);
    setSuccess(null);

    // Check if user is logged in
    if (!isAuthenticated) {
      setError('Please sign in to vote.');
      setTimeout(() => {
        setError(null);
      }, 5000);
      return;
    }

    // Check if caption exists
    if (!captionId) {
      setError('No caption yet — you can\'t vote until a caption exists.');
      setTimeout(() => {
        setError(null);
      }, 5000);
      return;
    }

    // Both conditions met: user is logged in AND caption exists
    setIsLoading(true);

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

      setSuccess('Vote submitted successfully!');
      
      // Refresh the page to show updated vote counts
      router.refresh();

      // Clear success message after 3 seconds
      setTimeout(() => {
        setSuccess(null);
      }, 3000);

    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'An error occurred';
      setError(errorMessage);
      
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
      
      {success && (
        <div className="text-xs text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-900/20 px-2 py-1 rounded">
          {success}
        </div>
      )}
    </div>
  );
}

export default memo(ImageVoteButtons);
