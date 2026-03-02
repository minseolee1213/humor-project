import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import ImageUpload from '@/app/components/ImageUpload';
import NavBar from '@/app/components/NavBar';

// Force dynamic rendering since we use cookies for auth
export const dynamic = 'force-dynamic';

export default async function UploadPage() {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();

  // If not authenticated, redirect to home with sign-in prompt
  if (error || !user) {
    redirect('/');
  }

  return (
    <main className="min-h-screen text-white">
      <NavBar userEmail={user.email || null} />
      <div className="max-w-5xl mx-auto px-4 sm:px-8 pb-16 pt-8">
        <div className="max-w-3xl mb-8">
          <h1
            className="text-3xl sm:text-4xl font-extrabold tracking-tight mb-2"
            style={{ fontFamily: 'var(--font-poppins)' }}
          >
            Upload a Meme
          </h1>
          <p
            className="text-sm sm:text-base text-gray-300"
            style={{ fontFamily: 'var(--font-poppins)', fontWeight: 400 }}
          >
            Drop an image to generate binge-worthy captions, then pick your favorite to send to the deck.
          </p>
        </div>

        <div className="bg-black/70 border border-white/10 rounded-3xl shadow-[0_24px_80px_rgba(0,0,0,0.9)] backdrop-blur-xl p-6 sm:p-8">
          <ImageUpload />
        </div>
      </div>
    </main>
  );
}
