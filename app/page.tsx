import { createClient } from '@/lib/supabase/server';
import SignOutButton from '@/app/SignOutButton';
import SignInButton from '@/app/SignInButton';
import MemeDeck from '@/app/components/MemeDeck';

// Force dynamic rendering since we use cookies for auth
export const dynamic = 'force-dynamic';

export default async function HomePage() {
  try {
    const supabase = await createClient();
    const { data: { user }, error } = await supabase.auth.getUser();

    // Show gated UI if not authenticated
    if (!user || error) {
      return (
        <main className="min-h-screen p-4 sm:p-8 flex items-center justify-center">
          <div className="max-w-md w-full text-center">
            <div className="mb-8">
              <h1 className="text-4xl font-bold text-foreground mb-2" style={{ fontFamily: 'var(--font-fredoka)', fontWeight: 600 }}>
                Meme TV 📺
              </h1>
              <p className="text-lg text-foreground/70" style={{ fontFamily: 'var(--font-poppins)', fontWeight: 400 }}>
                Please sign in to rate captions!
              </p>
            </div>
            <SignInButton />
            <p className="mt-6 text-sm text-foreground/50" style={{ fontFamily: 'var(--font-poppins)', fontWeight: 400 }}>
              Sign in with Google to access Meme TV
            </p>
          </div>
        </main>
      );
    }

    // User is authenticated - show Meme TV deck
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
            <span className="text-xs sm:text-sm text-foreground/70 hidden sm:inline" style={{ fontFamily: 'var(--font-poppins)', fontWeight: 500 }}>
              {user.email}
            </span>
            <SignOutButton />
          </div>
        </div>
        
        <MemeDeck userId={user.id} />
      </div>
    </main>
  );
  } catch (err) {
    console.error('[HomePage] Error:', err);
    const errorMessage = err instanceof Error ? err.message : 'Unknown error';
    return (
      <main className="min-h-screen p-4 sm:p-8 flex items-center justify-center">
        <div className="max-w-md w-full text-center">
          <div className="mb-8">
            <h1 className="text-4xl font-bold text-foreground mb-2" style={{ fontFamily: 'var(--font-fredoka)', fontWeight: 600 }}>
              Error
            </h1>
            <p className="text-lg text-red-600 dark:text-red-400" style={{ fontFamily: 'var(--font-poppins)', fontWeight: 400 }}>
              {errorMessage}
            </p>
            {errorMessage.includes('Missing Supabase') && (
              <p className="mt-4 text-sm text-foreground/70" style={{ fontFamily: 'var(--font-poppins)', fontWeight: 400 }}>
                Please check your .env.local file and ensure NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY are set.
              </p>
            )}
          </div>
        </div>
      </main>
    );
  }
}
