import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/apiAuth';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const authz = await requireRole(['admin']);
    if ('error' in authz) return authz.error;

    const body = await request.json();
    const { targetUserId, newPassword } = body;

    if (!targetUserId || !newPassword) {
      return NextResponse.json(
        { error: 'targetUserId and newPassword required' },
        { status: 400 }
      );
    }

    if (newPassword.length < 8) {
      return NextResponse.json(
        { error: 'Password must be at least 8 characters' },
        { status: 400 }
      );
    }

    // Verify target user exists
    const { data: targetUser, error: userError } = await authz.service
      .from('profiles')
      .select('id, email, full_name')
      .eq('id', targetUserId)
      .single();

    if (userError || !targetUser) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      );
    }

    // Staff added through the CSV bulk upload were written straight into
    // `profiles` with no matching row in auth.users, so updateUserById fails
    // with "user not found" for them while manually added staff work fine.
    // Create the missing login account using the profile id so every existing
    // staff_locations / training_matrix row keeps pointing at the same id.
    const { data: existingAuth } = await authz.service.auth.admin.getUserById(targetUserId);

    if (!existingAuth?.user) {
      const email = (targetUser.email || '').trim().toLowerCase();
      if (!email) {
        return NextResponse.json(
          { error: 'This staff member has no email address, so a login account cannot be created' },
          { status: 400 }
        );
      }

      const { error: createError } = await authz.service.auth.admin.createUser({
        id: targetUserId,
        email,
        password: newPassword,
        email_confirm: true,
        user_metadata: {
          full_name: targetUser.full_name,
        },
      });

      if (createError) {
        console.error('Login account creation error:', createError);
        // A leftover auth account under this email (e.g. from a previously
        // deleted profile) blocks the repair — it can't be linked to this
        // profile id, so say so rather than reporting a generic failure.
        const emailTaken = createError.code === 'email_exists'
          || /already.*registered|already been registered/i.test(createError.message || '');
        return NextResponse.json(
          {
            error: emailTaken
              ? `A separate login account already exists for ${email}. Remove that account in Supabase Auth, then reset this password again.`
              : `Failed to create login account: ${createError.message}`,
          },
          { status: emailTaken ? 409 : 500 }
        );
      }
    } else {
      // Update password using admin API
      const { error: updateError } = await authz.service.auth.admin.updateUserById(
        targetUserId,
        { password: newPassword }
      );

      if (updateError) {
        console.error('Password update error:', updateError);
        return NextResponse.json(
          { error: `Failed to update password: ${updateError.message}` },
          { status: 500 }
        );
      }
    }

    // Mark password_needs_change as false
    const { error: profileError } = await authz.service
      .from('profiles')
      .update({ password_needs_change: false })
      .eq('id', targetUserId);

    if (profileError) {
      console.warn('Could not update password_needs_change flag:', profileError);
    }

    return NextResponse.json({
      success: true,
      message: `Password updated for user ${targetUserId}`,
    });
  } catch (error) {
    console.error('Admin reset password error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
