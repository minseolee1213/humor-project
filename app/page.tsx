import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import SignInButton from '@/app/SignInButton';
import SignOutButton from '@/app/SignOutButton';
import CaptionCard from '@/app/components/CaptionCard';

// Force dynamic rendering since we use cookies for auth
export const dynamic = 'force-dynamic';

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

interface Caption {
  id: string;
  content: string | null;
  image_id: string | null;
  profile_id: string | null;
  created_datetime_utc: string;
  is_public: boolean;
  like_count: number;
  images?: Image | null;
}

interface CaptionWithImage {
  id: string;
  content: string | null;
  image_id: string | null;
  profile_id: string | null;
  created_datetime_utc: string;
  is_public: boolean;
  like_count: number;
  image: Image | null;
}

/**
 * Fetch captions with their associated images
 * Uses relational select to join captions with images
 */
async function getCaptionsWithImages(): Promise<CaptionWithImage[]> {
  try {
    const supabase = await createClient();
    
    // Try relational select first
    // Load 100 captions at a time (range 0-99)
    // Note: More captions appear as more images are uploaded and processed
    const { data, error } = await supabase
      .from('captions')
      .select(`
        id,
        content,
        image_id,
        profile_id,
        created_datetime_utc,
        is_public,
        like_count,
        images (
          id,
          url,
          image_description,
          created_datetime_utc,
          modified_datetime_utc,
          is_public,
          is_common_use,
          additional_context,
          celebrity_recognition
        )
      `)
      .eq('is_public', true)
      .order('created_datetime_utc', { ascending: false });
      // No limit - load all captions (Supabase default limit is 1000, adjust if needed)

    // Dev logging: count of captions returned
    console.log('[Gallery] Captions fetched:', data?.length || 0);

    if (error) {
      console.error('Error fetching captions with images (relational):', error);
      
      // Fallback: fetch captions and images separately, then merge
      return await getCaptionsWithImagesFallback();
    }

    // Transform the data to flatten the structure
    const captionsWithImages: CaptionWithImage[] = (data || []).map((caption: any) => ({
      id: caption.id,
      content: caption.content,
      image_id: caption.image_id,
      profile_id: caption.profile_id,
      created_datetime_utc: caption.created_datetime_utc,
      is_public: caption.is_public,
      like_count: caption.like_count,
      image: Array.isArray(caption.images) 
        ? (caption.images[0] || null)
        : (caption.images || null),
    }));

    return captionsWithImages;
  } catch (error) {
    console.error('Error in getCaptionsWithImages:', error);
    return [];
  }
}

/**
 * Fallback: Fetch captions and images separately, then merge
 */
async function getCaptionsWithImagesFallback(): Promise<CaptionWithImage[]> {
  try {
    const supabase = await createClient();
    
    // Fetch captions
    const { data: captions, error: captionsError } = await supabase
      .from('captions')
      .select('id, content, image_id, profile_id, created_datetime_utc, is_public, like_count')
      .eq('is_public', true)
      .order('created_datetime_utc', { ascending: false });
      // No limit - load all captions (Supabase default limit is 1000, adjust if needed)

    // Dev logging: count of captions returned
    console.log('[Gallery] Captions fetched (fallback):', captions?.length || 0);

    if (captionsError) {
      console.error('Error fetching captions:', captionsError);
      return [];
    }

    if (!captions || captions.length === 0) {
      return [];
    }

    // Get unique image IDs
    const imageIds = [...new Set(captions.map(c => c.image_id).filter(Boolean))] as string[];

    if (imageIds.length === 0) {
      return captions.map(c => ({ ...c, image: null }));
    }

    // Fetch images
    const { data: images, error: imagesError } = await supabase
      .from('images')
      .select('id, url, image_description, created_datetime_utc, modified_datetime_utc, is_public, is_common_use, additional_context, celebrity_recognition')
      .in('id', imageIds);

    if (imagesError) {
      console.error('Error fetching images:', imagesError);
      return captions.map(c => ({ ...c, image: null }));
    }

    // Create image map
    const imageMap = new Map<string, Image>();
    (images || []).forEach(img => {
      imageMap.set(img.id, img);
    });

    // Merge captions with images
    return captions.map(caption => ({
      ...caption,
      image: caption.image_id ? (imageMap.get(caption.image_id) || null) : null,
    }));
  } catch (error) {
    console.error('Error in getCaptionsWithImagesFallback:', error);
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

export default async function Home() {
  // Check authentication
  let user = null;
  
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.getUser();
    if (!error) {
      user = data.user;
    }
  } catch (error) {
    console.error('Error getting user:', error);
  }

  // If not authenticated, show gated UI
  if (!user) {
    return (
      <main className="min-h-screen p-8 bg-background flex items-center justify-center">
        <div className="max-w-md w-full text-center">
          <h1 className="text-4xl font-bold mb-4 text-foreground">Rate Captions</h1>
          <p className="text-lg text-foreground/70 mb-8">
            Please sign in to rate images!
          </p>
          <SignInButton />
        </div>
      </main>
    );
  }

  // User is authenticated, fetch captions with images
  let captionsWithImages: CaptionWithImage[] = [];
  let userVotes: Record<string, number> = {};
  
  try {
    captionsWithImages = await getCaptionsWithImages();
    
    // Fetch user votes for all captions
    if (captionsWithImages.length > 0) {
      let profileId: string | null = null;
      const supabase = await createClient();
      const { data: profile } = await supabase
        .from('profiles')
        .select('id')
        .eq('id', user.id)
        .single();
      
      profileId = profile?.id || user.id;
      
      if (profileId) {
        const captionIds = captionsWithImages.map(c => c.id);
        userVotes = await getUserVotes(profileId, captionIds);
      }
    }
  } catch (error) {
    console.error('Error loading captions:', error);
  }

  return (
    <main className="min-h-screen p-8 bg-background">
      <div className="max-w-7xl mx-auto">
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-4xl font-bold text-foreground">Rate Captions</h1>
          <div className="flex items-center gap-4">
            <a
              href="/deck"
              className="text-sm text-blue-600 dark:text-blue-400 hover:underline"
            >
              Deck
            </a>
            <a
              href="/upload"
              className="text-sm text-blue-600 dark:text-blue-400 hover:underline"
            >
              Upload
            </a>
            <span className="text-sm text-foreground/70">
              {user.email}
            </span>
            <SignOutButton />
          </div>
        </div>
        
        {captionsWithImages.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-lg text-foreground/70 mb-4">No captions found</p>
            <div className="text-sm text-foreground/50 space-y-2">
              <p>Possible reasons:</p>
              <ul className="list-disc list-inside space-y-1">
                <li>The captions table is empty</li>
                <li>Row Level Security (RLS) policies are blocking access</li>
                <li>Check the browser console for connection errors</li>
              </ul>
              <p className="mt-4 text-xs">
                Upload an image to generate captions!
              </p>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
            {captionsWithImages.map((caption) => {
              // Get user's vote from caption_votes table (filtered by profile_id)
              // This is separate from like_count which comes from captions table
              const currentVote = userVotes[caption.id] || null;

              return (
                <CaptionCard
                  key={caption.id}
                  captionId={caption.id}
                  content={caption.content}
                  image={caption.image}
                  initialLikeCount={caption.like_count}
                  initialUserVote={currentVote}
                  isAuthenticated={!!user}
                  createdDatetimeUtc={caption.created_datetime_utc}
                />
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
}
