import { createClient } from '@/lib/supabase/server';
import SignInButton from '@/app/SignInButton';
import SignOutButton from '@/app/SignOutButton';
import VoteButtons from '@/app/components/VoteButtons';

// Force dynamic rendering since we use cookies for auth
export const dynamic = 'force-dynamic';

interface Caption {
  id: string;
  content: string | null;
  image_id: string | null;
  profile_id: string | null;
  created_datetime_utc: string;
  is_public: boolean;
  like_count: number;
}

async function getCaptions(): Promise<Caption[]> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from('captions')
      .select('id, content, image_id, profile_id, created_datetime_utc, is_public, like_count')
      .eq('is_public', true)
      .order('created_datetime_utc', { ascending: false });

    if (error) {
      console.error('Error fetching captions:', error);
      return [];
    }

    return data || [];
  } catch (error) {
    console.error('Error in getCaptions:', error);
    return [];
  }
}

async function getUserVotes(profileId: string, captionIds: string[]): Promise<Record<string, number>> {
  if (!profileId || captionIds.length === 0) {
    return {};
  }

  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from('caption_votes')
      .select('caption_id, vote_value')
      .eq('profile_id', profileId)
      .in('caption_id', captionIds);

    if (error) {
      console.error('Error fetching user votes:', error);
      return {};
    }

    // Build map: caption_id -> vote_value
    const votesMap: Record<string, number> = {};
    if (data) {
      data.forEach((vote) => {
        votesMap[vote.caption_id] = vote.vote_value;
      });
    }

    return votesMap;
  } catch (error) {
    console.error('Error in getUserVotes:', error);
    return {};
  }
}

export default async function CaptionsPage() {
  // Check authentication
  let user = null;
  let profileId: string | null = null;
  
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.getUser();
    if (!error && data.user) {
      user = data.user;
      
      // Get profile_id
      const { data: profile } = await supabase
        .from('profiles')
        .select('id')
        .eq('id', user.id)
        .single();
      
      if (profile) {
        profileId = profile.id;
      } else {
        // Fallback: assume profiles.id = auth.users.id
        profileId = user.id;
      }
    }
  } catch (error) {
    console.error('Error getting user:', error);
  }

  // Fetch captions
  let captions: Caption[] = [];
  try {
    captions = await getCaptions();
  } catch (error) {
    console.error('Error fetching captions:', error);
  }

  // Fetch user's votes for displayed captions
  let userVotes: Record<string, number> = {};
  if (profileId && captions.length > 0) {
    const captionIds = captions.map(c => c.id);
    userVotes = await getUserVotes(profileId, captionIds);
  }

  return (
    <main className="min-h-screen p-8 bg-background">
      <div className="max-w-4xl mx-auto">
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-4xl font-bold text-foreground">Captions Page</h1>
          <div className="flex items-center gap-4">
            {user ? (
              <>
                <span className="text-sm text-foreground/70">
                  {user.email}
                </span>
                <SignOutButton />
              </>
            ) : (
              <SignInButton />
            )}
          </div>
        </div>
        
        {captions.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-lg text-foreground/70 mb-4">No captions found</p>
            <p className="text-sm text-foreground/50 mb-6">
              Captions will appear here once they are added to the database.
            </p>
            {/* Show vote buttons even when no captions for testing */}
            <div className="mt-8 p-6 bg-white dark:bg-gray-800 rounded-lg shadow-md max-w-md mx-auto">
              <p className="text-sm text-foreground/70 mb-4">Test Vote Buttons:</p>
              <VoteButtons 
                captionId="test-caption-id" 
                isAuthenticated={!!user}
              />
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {captions.map((caption) => (
              <div
                key={caption.id}
                className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6 hover:shadow-lg transition-shadow duration-300"
              >
                <div className="mb-4">
                  <p className="text-foreground text-base mb-2">
                    {caption.content || 'No caption text'}
                  </p>
                  <div className="flex items-center gap-2 mb-2">
                    {caption.like_count > 0 && (
                      <p className="text-xs text-foreground/50">
                        👍 {caption.like_count} likes
                      </p>
                    )}
                    <p className="text-xs text-foreground/50">
                      {new Date(caption.created_datetime_utc).toLocaleDateString()}
                    </p>
                  </div>
                </div>
                
                <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
                  <VoteButtons 
                    captionId={caption.id} 
                    isAuthenticated={!!user}
                    currentVote={userVotes[caption.id] || null}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
