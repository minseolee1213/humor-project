import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import SignOutButton from '@/app/SignOutButton';
import ImageUpload from '@/app/components/ImageUpload';

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
    <main className="min-h-screen p-8 bg-background">
      <div className="max-w-4xl mx-auto">
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-4xl font-bold text-foreground">Upload Image</h1>
          <div className="flex items-center gap-4">
            <a
              href="/"
              className="text-sm text-blue-600 dark:text-blue-400 hover:underline"
            >
              Meme TV
            </a>
            <span className="text-sm text-foreground/70">
              {user.email}
            </span>
            <SignOutButton />
          </div>
        </div>
        
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-8">
          <div className="mb-6">
            <h2 className="text-2xl font-semibold text-foreground mb-2">
              Upload & Generate Captions
            </h2>
            <p className="text-sm text-foreground/60">
              Upload an image to automatically generate captions using AI. Supported formats: JPEG, PNG, WebP, GIF, HEIC
            </p>
          </div>
          
          <ImageUpload />
        </div>
      </div>
    </main>
  );
}
