import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import SignOutButton from '@/app/SignOutButton';

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
            <span className="text-sm text-foreground/70">
              {user.email}
            </span>
            <SignOutButton />
          </div>
        </div>
        
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-8">
          <p className="text-lg text-foreground/70 mb-4">
            This is a protected route. Only authenticated users can access this page.
          </p>
          <p className="text-sm text-foreground/50">
            Upload functionality can be added here.
          </p>
        </div>
      </div>
    </main>
  );
}
