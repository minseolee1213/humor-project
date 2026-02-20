import { createClient } from '@/lib/supabase/server';
import { NextRequest, NextResponse } from 'next/server';

// Force dynamic rendering since we use cookies for auth
export const dynamic = 'force-dynamic';

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient();
    
    // Verify user is authenticated
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    if (authError || !user) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }

    // Get caption ID from params
    const { id } = await context.params;
    const captionId = id;
    
    if (!captionId) {
      return NextResponse.json(
        { error: 'Caption ID is required' },
        { status: 400 }
      );
    }

    // Parse request body to get vote value
    const body = await request.json();
    const { vote_value } = body;

    // Validate vote_value (must be 1 or -1)
    let voteValue: number;
    if (typeof vote_value === 'number') {
      if (vote_value === 1 || vote_value === -1) {
        voteValue = vote_value;
      } else {
        return NextResponse.json(
          { error: 'Invalid vote_value. Must be 1 or -1' },
          { status: 400 }
        );
      }
    } else {
      return NextResponse.json(
        { error: 'vote_value is required and must be a number (1 or -1)' },
        { status: 400 }
      );
    }

    // Verify caption exists
    const { data: caption, error: captionError } = await supabase
      .from('captions')
      .select('id')
      .eq('id', captionId)
      .single();

    if (captionError || !caption) {
      return NextResponse.json(
        { error: 'Caption not found' },
        { status: 404 }
      );
    }

    // Get profile_id from profiles table
    // profile_id references profiles.id
    // In most Supabase setups, profiles.id = auth.users.id, but we check to be sure
    let profileId: string;
    
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('id')
      .eq('id', user.id) // Try matching profiles.id with auth.users.id
      .single();

    if (profileError || !profile) {
      // Profile might not exist yet, or profiles.id might be different
      // Try alternative: check if there's a user_id column in profiles
      const { data: profileByUserId } = await supabase
        .from('profiles')
        .select('id')
        .eq('user_id', user.id) // Alternative: profiles.user_id = auth.users.id
        .single();
      
      if (profileByUserId) {
        profileId = profileByUserId.id;
      } else {
        // Fallback: assume profiles.id = auth.users.id (common Supabase pattern)
        profileId = user.id;
        console.warn('Profile not found, using auth user id as profile_id');
      }
    } else {
      profileId = profile.id;
    }

    // UPSERT vote into caption_votes table
    // Schema: caption_id, profile_id, vote_value, created_datetime_utc, modified_datetime_utc
    // Unique constraint on (profile_id, caption_id)
    const nowIso = new Date().toISOString();
    
    // Check if vote already exists to preserve created_datetime_utc
    const { data: existingVote } = await supabase
      .from('caption_votes')
      .select('created_datetime_utc')
      .eq('profile_id', profileId)
      .eq('caption_id', captionId)
      .single();

    const voteData = {
      caption_id: captionId,
      profile_id: profileId,
      vote_value: voteValue,
      created_datetime_utc: existingVote?.created_datetime_utc || nowIso, // Preserve existing or set new
      modified_datetime_utc: nowIso, // Always update
    };

    // Use UPSERT with onConflict to handle unique constraint
    const { data: voteResult, error: voteError } = await supabase
      .from('caption_votes')
      .upsert(voteData, {
        onConflict: 'profile_id,caption_id',
      })
      .select()
      .single();

    if (voteError) {
      console.error('Error upserting vote:', voteError);
      return NextResponse.json(
        { error: 'Failed to submit vote', details: voteError.message },
        { status: 500 }
      );
    }

    return NextResponse.json(
      { 
        success: true, 
        message: 'Vote submitted successfully',
        vote: voteResult 
      },
      { status: 200 }
    );

  } catch (error) {
    console.error('Unexpected error in vote endpoint:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
