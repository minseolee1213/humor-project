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
        { error: 'Not authenticated', where: 'route', details: userErr },
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
        { error: 'Invalid JSON body', where: 'route', details: parseError instanceof Error ? parseError.message : String(parseError) },
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
        { error: 'Missing captionId', where: 'route' },
        { status: 400 }
      );
    }

    // Validate voteValue
    if (voteValue !== 1 && voteValue !== -1) {
      console.error('[API /vote] Invalid voteValue:', { voteValue, type: typeof voteValue });
      return NextResponse.json(
        { error: 'voteValue must be 1 or -1', where: 'route' },
        { status: 400 }
      );
    }

    console.log('[API /vote] Vote request body:', JSON.stringify({ captionId, voteValue, userId: user.id }));

    // Use user.id as profile_id (profiles.id = user.id in our schema)
    const profileId = user.id;
    // Strategy: Try UPDATE first, then INSERT if no rows updated
    // This preserves creator audit fields and avoids overwriting insert-only metadata
    
    try {
      // Step 1: Attempt UPDATE existing row
      console.log('[API /vote] Attempting UPDATE for profile_id:', profileId, 'caption_id:', captionId);
      const { data: updateData, error: updateError } = await supabase
        .from('caption_votes')
        .update({
          vote_value: voteValue,
          modified_by_user_id: profileId,
        })
        .eq('profile_id', profileId)
        .eq('caption_id', captionId)
        .select()
        .maybeSingle(); // Use maybeSingle to avoid error when no rows match

      // If update succeeded (found existing row), verify with SELECT and return it
      if (updateData && !updateError) {
        console.log('[API /vote] UPDATE succeeded:', updateData);
        
        // Verify with SELECT to ensure write persisted
        const { data: savedRow, error: selectError } = await supabase
          .from('caption_votes')
          .select('*')
          .eq('profile_id', profileId)
          .eq('caption_id', captionId)
          .maybeSingle();
        
        if (selectError) {
          console.error('[API /vote] Verification SELECT failed after UPDATE:', selectError);
          return NextResponse.json(
            { error: `Update succeeded but verification failed: ${selectError.message}`, where: 'route', details: selectError },
            { status: 500 }
          );
        }

        if (!savedRow) {
          console.error('[API /vote] Write reported success but row not found after UPDATE');
          return NextResponse.json(
            { error: 'Write reported success but row not found', where: 'route' },
            { status: 500 }
          );
        }
        
        console.log('[API /vote] Verification SELECT after UPDATE:', savedRow);
        return NextResponse.json({ success: true, savedRow });
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
          created_by_user_id: profileId,
          modified_by_user_id: profileId,
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
              modified_by_user_id: profileId,
            })
            .eq('profile_id', profileId)
            .eq('caption_id', captionId)
            .select()
            .single();

          if (retryData && !retryError) {
            console.log('[API /vote] Retry UPDATE succeeded:', retryData);
            
            // Verify with SELECT
            const { data: savedRow, error: selectError } = await supabase
              .from('caption_votes')
              .select('*')
              .eq('profile_id', profileId)
              .eq('caption_id', captionId)
              .maybeSingle();

            if (selectError || !savedRow) {
              return NextResponse.json(
                { error: selectError ? `Retry update succeeded but verification failed: ${selectError.message}` : 'Write reported success but row not found', where: 'route', details: selectError },
                { status: 500 }
              );
            }

            return NextResponse.json({ success: true, savedRow });
          }
          
          console.error('[API /vote] Retry UPDATE failed:', retryError);
          return NextResponse.json(
            { error: `Insert failed and retry update failed: ${retryError?.message || insertError.message}`, where: 'route', details: { retryError, insertError } },
            { status: 400 }
          );
        }

        console.error('[API /vote] INSERT error:', insertError);
        return NextResponse.json(
          { error: insertError.message, where: 'route', details: insertError },
          { status: 400 }
        );
      }

      console.log('[API /vote] INSERT succeeded:', insertData);

      // Verify with SELECT to ensure write persisted
      const { data: savedRow, error: selectError } = await supabase
        .from('caption_votes')
        .select('*')
        .eq('profile_id', profileId)
        .eq('caption_id', captionId)
        .maybeSingle();

      if (selectError) {
        console.error('[API /vote] Verification SELECT failed after INSERT:', selectError);
        return NextResponse.json(
          { error: `Insert succeeded but verification failed: ${selectError.message}`, where: 'route', details: selectError },
          { status: 500 }
        );
      }

      if (!savedRow) {
        console.error('[API /vote] Write reported success but row not found after INSERT');
        return NextResponse.json(
          { error: 'Write reported success but row not found', where: 'route' },
          { status: 500 }
        );
      }

      console.log('[API /vote] Verification SELECT after INSERT:', savedRow);
      return NextResponse.json({ success: true, savedRow });

    } catch (dbError) {
      console.error('[API /vote] Database operation error:', dbError);
      return NextResponse.json(
        { error: dbError instanceof Error ? dbError.message : String(dbError), where: 'route', details: dbError },
        { status: 500 }
      );
    }

  } catch (error) {
    console.error('[API /vote] Unexpected error:', error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      { error: errorMessage, where: 'route', details: error },
      { status: 500 }
    );
  }
}
