import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/apiAuth';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const authz = await requireRole(['admin']);
    if ('error' in authz) return authz.error;

    const body = await request.json();
    const itemId = typeof body?.itemId === 'string' ? body.itemId.trim() : '';
    if (!itemId) {
      return NextResponse.json({ error: 'Checklist item id is required' }, { status: 400 });
    }

    const { data, error } = await authz.service
      .from('booking_checklist_template_items')
      .delete()
      .eq('id', itemId)
      .select('id');

    if (error) {
      console.error('Checklist template delete failed:', error);
      return NextResponse.json({ error: 'Failed to remove checklist item' }, { status: 500 });
    }

    if (!data || data.length === 0) {
      return NextResponse.json({ error: 'Checklist item not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true, itemId });
  } catch (error) {
    console.error('Checklist template route failed:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
