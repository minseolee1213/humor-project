import { createClient } from '@/lib/supabase/server';
import SignInButton from '@/app/SignInButton';
import MemeDeck from '@/app/components/MemeDeck';
import NavBar from '@/app/components/NavBar';

// Force dynamic rendering since we use cookies for auth
export const dynamic = 'force-dynamic';

export default async function HomePage() {
  try {
    const supabase = await createClient();
    const { data: { user }, error } = await supabase.auth.getUser();

    // Show gated UI if not authenticated
    if (!user || error) {
      return (
        <main className="min-h-screen flex items-center justify-center px-4 sm:px-6 lg:px-8">
          <div className="max-w-md w-full text-center bg-black/70 border border-white/10 rounded-3xl px-6 sm:px-8 py-8 sm:py-10 shadow-[0_24px_80px_rgba(0,0,0,0.9)] backdrop-blur-xl">
            <h1
              className="text-3xl sm:text-4xl font-extrabold tracking-tight mb-3 text-white"
              style={{ fontFamily: 'var(--font-poppins)' }}
            >
              Welcome to <span className="text-red-500">MEMEFLIX</span>
            </h1>
            <p
              className="text-sm sm:text-base text-gray-300 mb-6"
              style={{ fontFamily: 'var(--font-poppins)', fontWeight: 400 }}
            >
              Sign in with Google to start binge-rating AI-generated captions.
            </p>
            <SignInButton />
            <p
              className="mt-4 text-xs sm:text-sm text-gray-400"
              style={{ fontFamily: 'var(--font-poppins)', fontWeight: 400 }}
            >
              Powered by Supabase Auth &amp; Next.js
            </p>
          </div>
        </main>
      );
    }

    // User is authenticated - show Meme TV deck
    return (
      <main className="min-h-screen text-white">
        <NavBar userEmail={user.email ?? null} />
        <div className="max-w-7xl mx-auto px-4 sm:px-8 pb-16 pt-6 sm:pt-10">
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
