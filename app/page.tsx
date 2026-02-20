import { createClient } from '@/lib/supabase/server';
import SignInButton from '@/app/SignInButton';
import SignOutButton from '@/app/SignOutButton';
import ImageVoteButtons from '@/app/components/ImageVoteButtons';

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
  image_id: string;
  content: string | null;
}

async function getImages(): Promise<Image[]> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from('images')
      .select('*')
      .eq('is_public', true)
      .order('created_datetime_utc', { ascending: false });

    if (error) {
      console.error('Error fetching images:', error);
      console.error('Error details:', {
        message: error.message,
        code: error.code,
        details: error.details,
        hint: error.hint
      });
      
      // If filtering by is_public fails, try without filter (might be RLS issue)
      if (error.code === '42501' || error.message.includes('policy')) {
        console.log('Trying to fetch all images without filter...');
        const supabase = await createClient();
        const { data: allData, error: allError } = await supabase
          .from('images')
          .select('*')
          .order('created_datetime_utc', { ascending: false });
        
        if (allError) {
          console.error('Error fetching all images:', allError);
          return [];
        }
        return allData || [];
      }
      return [];
    }

    console.log(`Successfully fetched ${data?.length || 0} images`);
    return data || [];
  } catch (error) {
    console.error('Error in getImages:', error);
    return [];
  }
}

async function getCaptionsForImages(imageIds: string[]): Promise<Record<string, Caption>> {
  if (imageIds.length === 0) {
    return {};
  }

  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from('captions')
      .select('id, image_id, content')
      .eq('is_public', true)
      .in('image_id', imageIds)
      .order('created_datetime_utc', { ascending: false });

    if (error) {
      console.error('Error fetching captions:', error);
      return {};
    }

    // Get the first caption for each image (or you could get all and let UI decide)
    const captionMap: Record<string, Caption> = {};
    if (data) {
      // Use the first caption found for each image
      data.forEach((caption) => {
        if (!captionMap[caption.image_id]) {
          captionMap[caption.image_id] = caption;
        }
      });
    }

    return captionMap;
  } catch (error) {
    console.error('Error in getCaptionsForImages:', error);
    return {};
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

  // User is authenticated, fetch and show images
  let images: Image[] = [];
  let captionsByImageId: Record<string, Caption> = {};
  let userVotes: Record<string, number> = {};
  let profileId: string | null = null;
  
  try {
    images = await getImages();
    
    // Get captions for all images
    if (images.length > 0) {
      const imageIds = images.map(img => img.id);
      captionsByImageId = await getCaptionsForImages(imageIds);
      
      // Get user's votes for existing captions
      const supabase = await createClient();
      const { data: profile } = await supabase
        .from('profiles')
        .select('id')
        .eq('id', user.id)
        .single();
      
      profileId = profile?.id || user.id;
      
      const captionIds = Object.values(captionsByImageId).map(c => c.id);
      if (captionIds.length > 0) {
        userVotes = await getUserVotes(profileId, captionIds);
      }
    }
  } catch (error) {
    console.error('Error loading images:', error);
  }

  return (
    <main className="min-h-screen p-8 bg-background">
      <div className="max-w-7xl mx-auto">
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-4xl font-bold text-foreground">Rate Captions</h1>
          <div className="flex items-center gap-4">
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
        
        {images.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-lg text-foreground/70 mb-4">No images found</p>
            <div className="text-sm text-foreground/50 space-y-2">
              <p>Possible reasons:</p>
              <ul className="list-disc list-inside space-y-1">
                <li>The images table is empty</li>
                <li>Row Level Security (RLS) policies are blocking access</li>
                <li>Check the browser console for connection errors</li>
              </ul>
              <p className="mt-4 text-xs">
                Check your Supabase dashboard → Table Editor → images to verify data exists
              </p>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
            {images.map((image) => (
              <div
                key={image.id}
                className="bg-white dark:bg-gray-800 rounded-lg shadow-md overflow-hidden hover:shadow-lg transition-shadow duration-300"
              >
                <div className="aspect-square bg-gray-100 dark:bg-gray-700 overflow-hidden">
                  {image.url ? (
                    <img
                      src={image.url}
                      alt={image.image_description || 'Image'}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-gray-400">
                      No image
                    </div>
                  )}
                </div>
                <div className="p-4">
                  {image.image_description && (
                    <p className="text-sm text-foreground/70 line-clamp-2 mb-2">
                      {image.image_description}
                    </p>
                  )}
                  {image.additional_context && (
                    <p className="text-xs text-foreground/60 line-clamp-1 mb-1">
                      {image.additional_context}
                    </p>
                  )}
                  {image.celebrity_recognition && (
                    <p className="text-xs text-blue-600 dark:text-blue-400 mb-1">
                      👤 {image.celebrity_recognition}
                    </p>
                  )}
                  <div className="flex gap-2 mt-2">
                    {image.is_public && (
                      <span className="text-xs px-2 py-1 bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200 rounded">
                        Public
                      </span>
                    )}
                    {image.is_common_use && (
                      <span className="text-xs px-2 py-1 bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 rounded">
                        Common Use
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-foreground/50 mt-2">
                    {new Date(image.created_datetime_utc).toLocaleDateString()}
                  </p>
                  
                  {/* Vote Buttons Section - Always rendered */}
                  <div className="mt-4 pt-3 border-t border-gray-200 dark:border-gray-700">
                    <ImageVoteButtons
                      captionId={captionsByImageId[image.id]?.id || null}
                      isAuthenticated={!!user}
                      currentVote={captionsByImageId[image.id] ? (userVotes[captionsByImageId[image.id].id] || null) : null}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
