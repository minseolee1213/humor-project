'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import ImageVoteButtons from '@/app/components/ImageVoteButtons';

interface Image {
  id: string;
  url: string | null;
  image_description: string | null;
  created_datetime_utc: string;
  modified_datetime_utc: string | null;
  is_public: boolean | null;
  is_common_use: boolean | null;
  additional_context: string | null;
  celebrity_recognition: string | null;
}

interface CaptionCardProps {
  captionId: string;
  content: string | null;
  image: Image | null;
  initialLikeCount: number;
  initialUserVote: number | null; // 1 for upvote, -1 for downvote, null for no vote
  isAuthenticated: boolean;
  createdDatetimeUtc: string;
}

export default function CaptionCard({
  captionId,
  content,
  image,
  initialLikeCount,
  initialUserVote,
  isAuthenticated,
  createdDatetimeUtc,
}: CaptionCardProps) {
  const [likeCount, setLikeCount] = useState(initialLikeCount);
  const [userVote, setUserVote] = useState<number | null>(initialUserVote);
  const router = useRouter();
  
  // Track if we're waiting for a refresh after optimistic update
  // This prevents useEffect from resetting optimistic state before DB updates
  const pendingRefreshRef = useRef(false);

  // Sync with props when they change (e.g., after router.refresh())
  // Skip syncing if we have a pending refresh (optimistic update in progress)
  useEffect(() => {
    if (!pendingRefreshRef.current) {
      setLikeCount(initialLikeCount);
      setUserVote(initialUserVote);
    }
  }, [initialLikeCount, initialUserVote]);

  const handleVoteSuccess = (newVote: number) => {
    // Mark that we're doing an optimistic update and waiting for refresh
    pendingRefreshRef.current = true;
    
    // Use functional updates to get CURRENT state (avoid stale closures)
    // This ensures we use the most recent userVote value, not a stale closure value
    setUserVote((prevVote) => {
      const voteValue = newVote; // 1 or -1
      let likeCountDelta = 0;

      // Calculate delta based on vote transition using CURRENT prevVote from state
      if (prevVote === undefined || prevVote === null) {
        // No previous vote
        if (voteValue === 1) {
          likeCountDelta = 1;
        } else if (voteValue === -1) {
          likeCountDelta = -1;
        }
      } else if (prevVote === 1 && voteValue === -1) {
        // Switching from upvote to downvote
        likeCountDelta = -2;
      } else if (prevVote === -1 && voteValue === 1) {
        // Switching from downvote to upvote
        likeCountDelta = 2;
      } else if (prevVote === voteValue) {
        // Same vote clicked again (idempotent) - no change
        likeCountDelta = 0;
      }

      // Update like count optimistically using functional update
      // This ensures we use the most recent likeCount value
      setLikeCount((prevCount) => {
        const newCount = Math.max(0, prevCount + likeCountDelta);
        return newCount;
      });

      // Return new vote value to update userVote state
      return voteValue;
    });

    // Refresh to sync with database (DB trigger updates like_count)
    // After refresh completes, useEffect will sync with server values
    router.refresh();
    
    // Reset the pending flag after a delay to allow refresh to complete
    // This ensures the next useEffect run will sync with server values
    setTimeout(() => {
      pendingRefreshRef.current = false;
    }, 1000);
  };

  const hasVoted = userVote !== null && userVote !== undefined;

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md overflow-hidden hover:shadow-lg transition-shadow duration-300">
      {/* Image */}
      <div className="aspect-square bg-gray-100 dark:bg-gray-700 overflow-hidden">
        {image?.url ? (
          <img
            src={image.url}
            alt={image.image_description || 'Image'}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-gray-400">
            No image
          </div>
        )}
      </div>
      
        {/* Caption Content */}
        <div className="p-4">
          {content ? (
            <p className="text-sm text-foreground mb-3 line-clamp-3">
              {content}
            </p>
          ) : (
            <p className="text-sm text-foreground/50 mb-3 italic">
              No caption text
            </p>
          )}
        
        {/* Like Count */}
        {likeCount > 0 && (
          <p className="text-xs text-foreground/60 mb-3">
            👍 {likeCount} {likeCount === 1 ? 'like' : 'likes'}
          </p>
        )}
        
        {/* Vote Buttons */}
        <div className="mt-4 pt-3 border-t border-gray-200 dark:border-gray-700">
          <ImageVoteButtons
            key={`vote-${captionId}`}
            captionId={captionId}
            isAuthenticated={isAuthenticated}
            currentVote={userVote}
            onVoteSuccess={handleVoteSuccess}
          />
          
          {/* User Vote Status Message */}
          {hasVoted && (
            <p className="text-xs text-foreground/60 mt-2 text-center">
              {userVote === 1 ? 'You liked this caption' : 'You disliked this caption'}
            </p>
          )}
        </div>
        
        {/* Timestamp */}
        <p className="text-xs text-foreground/50 mt-3 text-center">
          {new Date(createdDatetimeUtc).toLocaleDateString()}
        </p>
      </div>
    </div>
  );
}
