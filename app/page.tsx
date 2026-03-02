import { createClient } from '@/lib/supabase/server';
import SignOutButton from '@/app/SignOutButton';
import MemeDeck from '@/app/components/MemeDeck';

// Force dynamic rendering since we use cookies for auth
export const dynamic = 'force-dynamic';

export default async function HomePage() {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();

  // Allow browsing even if not logged in, but voting will be disabled
  // No redirect needed - just pass user state to component

  return (
    <main className="min-h-screen p-4 sm:p-8">
      <div className="max-w-7xl mx-auto">
        <div className="flex justify-between items-center mb-6 sm:mb-8">
          <div>
            <h1 className="text-3xl sm:text-4xl font-bold text-foreground tracking-wide" style={{ fontFamily: 'var(--font-fredoka)', fontWeight: 600 }}>
              Meme TV 📺
            </h1>
            <p className="text-sm sm:text-base text-foreground/60 mt-1" style={{ fontFamily: 'var(--font-poppins)', fontWeight: 400 }}>
              Rate captions like you're channel surfing.
            </p>
          </div>
          <div className="flex items-center gap-2 sm:gap-4">
            <a
              href="/upload"
              className="text-xs sm:text-sm text-blue-600 dark:text-blue-400 hover:underline"
              style={{ fontFamily: 'var(--font-poppins)', fontWeight: 500 }}
            >
              Upload
            </a>
            {user ? (
              <>
                <span className="text-xs sm:text-sm text-foreground/70 hidden sm:inline" style={{ fontFamily: 'var(--font-poppins)', fontWeight: 500 }}>
                  {user.email}
                </span>
                <SignOutButton />
              </>
            ) : (
              <a
                href="/"
                className="text-xs sm:text-sm text-blue-600 dark:text-blue-400 hover:underline"
                style={{ fontFamily: 'var(--font-poppins)', fontWeight: 500 }}
              >
                Sign In
              </a>
            )}
          </div>
        </div>
        
        <MemeDeck userId={user?.id || null} />
      </div>
    </main>
  );
}
