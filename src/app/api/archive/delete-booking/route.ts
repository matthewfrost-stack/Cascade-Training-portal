import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient, requireRole } from '@/lib/apiAuth';

export async function POST(request: NextRequest) {
  const authz = await requireRole(['admin', 'scheduler']);
  if ('error' in authz) return authz.error;

  const supabaseAdmin = createServiceClient();

  const body = await request.json();
  const bookingId = body?.bookingId as string | undefined;
  if (!bookingId) {
    return NextResponse.json({ error: 'bookingId is required' }, { status: 400 });
  }

  const { data: booking, error: bookingErr } = await supabaseAdmin
    .from('bookings')
    .select('*')
    .eq('id', bookingId)
    .single();

  if (bookingErr || !booking) {
    return NextResponse.json({ error: 'Booking not found' }, { status: 404 });
  }

  const snapshot = { booking };

  const { data: archiveRow, error: archiveErr } = await supabaseAdmin
    .from('deleted_items')
    .insert([
      {
        entity_type: 'booking',
        entity_id: String(booking.id),
        location_id: null,
        snapshot,
        deleted_by: authz.userId,
      },
    ])
    .select('id')
    .single();

  if (archiveErr) {
    return NextResponse.json({ error: archiveErr.message, code: archiveErr.code }, { status: 400 });
  }

  const { error: deleteErr } = await supabaseAdmin
    .from('bookings')
    .delete()
    .eq('id', bookingId);

  if (deleteErr) {
    return NextResponse.json({ error: deleteErr.message, code: deleteErr.code }, { status: 400 });
  }

  return NextResponse.json({
    success: true,
    removed: {
      deleted_item_id: archiveRow.id,
      booking_id: bookingId,
    },
  });
}
