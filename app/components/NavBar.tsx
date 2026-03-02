'use client';

import Link from 'next/link';
import SignOutButton from '@/app/SignOutButton';

interface NavBarProps {
  userEmail: string | null;
}

export default function NavBar({ userEmail }: NavBarProps) {
  return (
    <header className="sticky top-0 z-30 bg-gradient-to-b from-black/90 via-black/70 to-transparent backdrop-blur-xl border-b border-white/10">
      <div className="max-w-7xl mx-auto px-4 sm:px-8 py-3 sm:py-4 flex items-center justify-between gap-4">
        {/* Left: Brand */}
        <div className="flex items-center gap-2">
          <Link
            href="/"
            className="text-xl sm:text-2xl font-extrabold tracking-wide text-red-500 hover:text-red-400 transition-colors"
            style={{ fontFamily: 'var(--font-poppins)' }}
          >
            MEMEFLIX
          </Link>
        </div>

        {/* Center: Nav items */}
        <nav className="hidden sm:flex items-center gap-6 text-sm text-gray-300">
          <Link
            href="/"
            className="hover:text-white transition-colors"
            style={{ fontFamily: 'var(--font-poppins)', fontWeight: 500 }}
          >
            Deck
          </Link>
          <Link
            href="/upload"
            className="hover:text-white transition-colors"
            style={{ fontFamily: 'var(--font-poppins)', fontWeight: 500 }}
          >
            Upload
          </Link>
        </nav>

        {/* Right: User + Sign out */}
        <div className="flex items-center gap-3">
          {userEmail && (
            <span
              className="hidden sm:inline max-w-[200px] truncate text-xs sm:text-sm text-gray-300"
              style={{ fontFamily: 'var(--font-poppins)', fontWeight: 400 }}
              title={userEmail}
            >
              {userEmail}
            </span>
          )}
          <SignOutButton />
        </div>
      </div>
    </header>
  );
}

