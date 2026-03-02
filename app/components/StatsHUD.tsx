'use client';

interface StatsHUDProps {
  userVotes: Record<string, number>;
  totalCount: number;
  isLoggedIn: boolean;
}

export default function StatsHUD({ userVotes, totalCount, isLoggedIn }: StatsHUDProps) {
  if (!isLoggedIn) {
    return (
      <div className="fixed top-4 right-4 z-50 px-3 py-2 sm:px-4 rounded-full bg-black/40 backdrop-blur-md border border-white/10 shadow-lg">
        <p className="text-xs sm:text-sm text-white/80" style={{ fontFamily: 'var(--font-poppins)', fontWeight: 500 }}>
          Sign in to track progress
        </p>
      </div>
    );
  }

  // Compute counts from userVotes
  const likedCount = Object.values(userVotes).filter(v => v === 1).length;
  const dislikedCount = Object.values(userVotes).filter(v => v === -1).length;
  const leftCount = totalCount - (likedCount + dislikedCount);

  return (
    <div className="fixed top-4 right-4 z-50 px-3 py-2 sm:px-4 sm:py-2.5 rounded-full bg-black/40 backdrop-blur-md border border-white/10 shadow-lg flex items-center gap-2 sm:gap-4">
      <div className="flex items-center gap-1 sm:gap-1.5">
        <span className="text-sm sm:text-base">👍</span>
        <span className="text-xs sm:text-sm text-white font-semibold" style={{ fontFamily: 'var(--font-poppins)', fontWeight: 600 }}>
          {likedCount}
        </span>
      </div>
      <div className="flex items-center gap-1 sm:gap-1.5">
        <span className="text-sm sm:text-base">👎</span>
        <span className="text-xs sm:text-sm text-white font-semibold" style={{ fontFamily: 'var(--font-poppins)', fontWeight: 600 }}>
          {dislikedCount}
        </span>
      </div>
      <div className="flex items-center gap-1 sm:gap-1.5">
        <span className="text-xs sm:text-sm text-white/90" style={{ fontFamily: 'var(--font-poppins)', fontWeight: 500 }}>
          {leftCount} left
        </span>
      </div>
    </div>
  );
}
