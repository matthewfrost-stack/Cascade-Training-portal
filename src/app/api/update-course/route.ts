import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient, requireRole } from '@/lib/apiAuth';

export async function POST(request: NextRequest) {
  try {
    const authz = await requireRole(['admin']);
    if ('error' in authz) return authz.error;

    const { courseId, updates } = await request.json();

    if (!courseId || !updates) {
      return NextResponse.json(
        { error: 'Missing courseId or updates' },
        { status: 400 }
      );
    }

    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !(process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY)) {
      return NextResponse.json(
        { error: 'Missing Supabase configuration' },
        { status: 500 }
      );
    }

    const supabase = createServiceClient();

    const allowedFields = ['name', 'category', 'expiry_months', 'never_expires'] as const;
    const sanitizedUpdates = Object.fromEntries(
      Object.entries(updates || {}).filter(([key]) => allowedFields.includes(key as (typeof allowedFields)[number]))
    );

    if (Object.keys(sanitizedUpdates).length === 0) {
      return NextResponse.json(
        { error: 'No valid fields provided for update' },
        { status: 400 }
      );
    }

    console.log('Updating training course:', { courseId, updates: sanitizedUpdates });

    let { data, error } = await supabase
      .from('training_courses')
      .update(sanitizedUpdates)
      .eq('id', courseId)
      .select('id, name, category, expiry_months, never_expires')
      .single();

    // Some environments may not have `category` on training_courses.
    // Retry without category in both payload and select shape whenever 42703 appears.
    if (error?.code === '42703') {
      const { category: _ignoredCategory, ...withoutCategory } = sanitizedUpdates;
      const retryUpdates =
        'category' in sanitizedUpdates && Object.keys(withoutCategory).length > 0
          ? withoutCategory
          : sanitizedUpdates;

      const retry = await supabase
        .from('training_courses')
        .update(retryUpdates)
        .eq('id', courseId)
        .select('id, name, expiry_months, never_expires')
        .single();

      data = retry.data as any;
      error = retry.error;
    }

    if (error) {
      console.error('Update error:', error);
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: 400 }
      );
    }

    console.log('Update successful:', data);
    return NextResponse.json({ success: true, data });
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error('API error:', errorMsg);
    return NextResponse.json(
      { error: errorMsg },
      { status: 500 }
    );
  }
}
