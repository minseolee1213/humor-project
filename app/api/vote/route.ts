import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// Force dynamic rendering since we use cookies for auth
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  try {
    // Create authenticated Supabase client (uses cookies for auth)
    const supabase = await createClient();
    
    // Verify user is authenticated - this ensures we're using authenticated session, not anon
    const { data: { user }, error: userErr } = await supabase.auth.getUser();
    
    if (!user || userErr) {
      console.error('[API /vote] Authentication failed:', userErr);
      return NextResponse.json(
        { success: false, error: 'Not authenticated' },
        { status: 401 }
      );
    }

    console.log('[API /vote] Authenticated user:', user.id);

    // Parse request body
    let body;
    try {
      body = await req.json();
    } catch (parseError) {
      console.error('[API /vote] JSON parse error:', parseError);
      return NextResponse.json(
        { success: false, error: 'Invalid JSON in request body' },
        { status: 400 }
      );
    }

    // Validate and extract values
    const captionId = body?.captionId;
    const voteValue = body?.voteValue;

    // Validate captionId
    if (!captionId) {
      console.error('[API /vote] Missing captionId in request body:', body);
      return NextResponse.json(
        { success: false, error: 'Missing captionId' },
        { status: 400 }
      );
    }

    // Validate voteValue
    if (voteValue !== 1 && voteValue !== -1) {
      console.error('[API /vote] Invalid voteValue:', { voteValue, type: typeof voteValue });
      return NextResponse.json(
        { success: false, error: 'voteValue must be 1 or -1' },
        { status: 400 }
      );
    }

    console.log('[API /vote] Vote request body:', JSON.stringify({ captionId, voteValue, userId: user.id }));

    // Use user.id as profile_id (profiles.id = user.id in our schema)
    const profileId = user.id;
    const now = new Date().toISOString();

    // Strategy: Try UPDATE first (preserves created_datetime_utc), then INSERT if no rows updated
    // This ensures created_datetime_utc is only set on inserts, never overwritten on updates
    
    // Step 1: Attempt UPDATE existing row
    console.log('[API /vote] Attempting UPDATE for profile_id:', profileId, 'caption_id:', captionId);
    const { data: updateData, error: updateError } = await supabase
      .from('caption_votes')
      .update({
        vote_value: voteValue,
        modified_datetime_utc: now,
      })
      .eq('profile_id', profileId)
      .eq('caption_id', captionId)
      .select()
      .maybeSingle(); // Use maybeSingle to avoid error when no rows match

    // If update succeeded (found existing row), verify and return it
    if (updateData && !updateError) {
      console.log('[API /vote] UPDATE succeeded:', updateData);
      
      // Verify with SELECT to ensure write persisted
      const { data: verifyData, error: verifyError } = await supabase
        .from('caption_votes')
        .select('*')
        .eq('profile_id', profileId)
        .eq('caption_id', captionId)
        .single();
      
      if (verifyError) {
        console.error('[API /vote] Verification SELECT failed after UPDATE:', verifyError);
        return NextResponse.json(
          { success: false, error: `Update succeeded but verification failed: ${verifyError.message}` },
          { status: 500 }
        );
      }
      
      console.log('[API /vote] Verification SELECT after UPDATE:', verifyData);
      return NextResponse.json({ success: true, vote: verifyData || updateData });
    }

    // Log update error if it's not just "no rows found"
    if (updateError) {
      console.warn('[API /vote] UPDATE error (will try INSERT):', updateError);
    } else {
      console.log('[API /vote] UPDATE returned no rows, attempting INSERT');
    }

    // Step 2: If update returned no rows, attempt INSERT
    console.log('[API /vote] Attempting INSERT for profile_id:', profileId, 'caption_id:', captionId);
    const { data: insertData, error: insertError } = await supabase
      .from('caption_votes')
      .insert({
        profile_id: profileId,
        caption_id: captionId,
        vote_value: voteValue,
        created_datetime_utc: now, // Always set on insert (NOT NULL constraint)
        modified_datetime_utc: now,
      })
      .select()
      .single();

    if (insertError) {
      // If insert fails due to unique constraint, it means the row was created between update and insert
      // In this case, try one more update
      if (insertError.code === '23505') { // Unique violation
        console.log('[API /vote] INSERT failed due to unique constraint, retrying UPDATE');
        const { data: retryData, error: retryError } = await supabase
          .from('caption_votes')
          .update({
            vote_value: voteValue,
            modified_datetime_utc: now,
          })
          .eq('profile_id', profileId)
          .eq('caption_id', captionId)
          .select()
          .single();

        if (retryData && !retryError) {
          console.log('[API /vote] Retry UPDATE succeeded:', retryData);
          return NextResponse.json({ success: true, vote: retryData });
        }
        
        console.error('[API /vote] Retry UPDATE failed:', retryError);
        return NextResponse.json(
          { success: false, error: `Insert failed and retry update failed: ${retryError?.message || insertError.message}` },
          { status: 400 }
        );
      }

      console.error('[API /vote] INSERT error:', insertError);
      return NextResponse.json(
        { success: false, error: insertError.message, details: insertError },
        { status: 400 }
      );
    }

    console.log('[API /vote] INSERT succeeded:', insertData);

    // Verify with SELECT to ensure write persisted
    const { data: verifyData, error: verifyError } = await supabase
      .from('caption_votes')
      .select('*')
      .eq('profile_id', profileId)
      .eq('caption_id', captionId)
      .single();

    if (verifyError) {
      console.error('[API /vote] Verification SELECT failed after INSERT:', verifyError);
      return NextResponse.json(
        { success: false, error: `Insert succeeded but verification failed: ${verifyError.message}` },
        { status: 500 }
      );
    }

    console.log('[API /vote] Verification SELECT after INSERT:', verifyData);

    return NextResponse.json({ success: true, vote: verifyData || insertData });
  } catch (error) {
    console.error('[API /vote] Unexpected error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Internal server error';
    return NextResponse.json(
      { success: false, error: errorMessage },
      { status: 500 }
    );
  }
}
