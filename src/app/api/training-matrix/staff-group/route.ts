import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient, getScopedLocationIds, requireRole } from '@/lib/apiAuth';

export const dynamic = 'force-dynamic';

type Item = { key: string; isDivider: boolean; name?: string; order: number };

// Staff-group membership is positional: a divider row starts a group and the
// staff rows that follow it (until the next divider) belong to it. All writes
// happen here with the service client because the browser anon client is
// blocked by RLS on location_matrix_dividers / staff_locations writes.
export async function POST(request: NextRequest) {
  try {
    const authz = await requireRole(['admin', 'scheduler']);
    if ('error' in authz) return authz.error;

    const body = await request.json();
    const { action, locationId, name, memberIds, dividerId } = body || {};
    if (!action || !locationId) {
      return NextResponse.json({ error: 'action and locationId are required' }, { status: 400 });
    }

    const supabase = createServiceClient();

    const scoped = await getScopedLocationIds(authz.userId, authz.role, supabase);
    if (!scoped.all && !scoped.ids.includes(locationId)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Current ordered list (staff + dividers), matching how the grid builds it.
    const { data: slRows } = await supabase
      .from('staff_locations')
      .select('staff_id, display_order')
      .eq('location_id', locationId);
    const { data: divRows } = await supabase
      .from('location_matrix_dividers')
      .select('id, name, display_order')
      .eq('location_id', locationId);

    const items: Item[] = [
      ...(slRows || []).map((r: any) => ({ key: r.staff_id as string, isDivider: false, order: r.display_order ?? 9999 })),
      ...(divRows || []).map((r: any) => ({ key: `divider-${r.id}`, isDivider: true, name: r.name as string, order: r.display_order ?? 9999 })),
    ].sort((a, b) => a.order - b.order);

    let newOrder: Item[] = [];

    if (action === 'create') {
      if (!name?.trim()) return NextResponse.json({ error: 'name is required' }, { status: 400 });
      const memberSet = new Set<string>(memberIds || []);
      const members = items.filter((it) => !it.isDivider && memberSet.has(it.key));

      const { data: inserted, error: insErr } = await supabase
        .from('location_matrix_dividers')
        .insert([{ location_id: locationId, name: name.trim(), display_order: 999999 }])
        .select('id')
        .single();
      if (insErr || !inserted?.id) {
        return NextResponse.json({ error: insErr?.message || 'Failed to create group' }, { status: 400 });
      }
      const dividerItem: Item = { key: `divider-${inserted.id}`, isDivider: true, name: name.trim(), order: 0 };

      // Anchor the new group where the staff already are: insert the divider at
      // the position of the topmost selected member, then pull the rest of the
      // selected members up to sit right after it. Non-members keep their order.
      const firstIdx = items.findIndex((it) => !it.isDivider && memberSet.has(it.key));
      if (firstIdx === -1) {
        newOrder = [...items, dividerItem]; // empty group -> just append the header
      } else {
        const before = items.slice(0, firstIdx);
        const after = items.slice(firstIdx).filter((it) => it.isDivider || !memberSet.has(it.key));
        newOrder = [...before, dividerItem, ...members, ...after];
      }
    } else if (action === 'update') {
      if (!dividerId) return NextResponse.json({ error: 'dividerId is required' }, { status: 400 });
      const memberSet = new Set<string>(memberIds || []);
      const unassigned: Item[] = [];
      const groupMembers = new Map<string, Item[]>();
      const dividerKeys: string[] = [];
      items.forEach((it) => { if (it.isDivider) { dividerKeys.push(it.key); groupMembers.set(it.key, []); } });

      let current: string | null = null;
      items.forEach((it) => {
        if (it.isDivider) { current = it.key; return; }
        if (memberSet.has(it.key)) return; // relocated into the target group below
        if (current === dividerId) { unassigned.push(it); return; } // unchecked -> ungrouped
        if (current) groupMembers.get(current)!.push(it);
        else unassigned.push(it);
      });

      const staffByKey = new Map(items.filter((it) => !it.isDivider).map((it) => [it.key, it]));
      const targetMembers = (memberIds || []).map((id: string) => staffByKey.get(id)).filter(Boolean) as Item[];
      groupMembers.set(dividerId, targetMembers);

      const dividerItems = new Map(items.filter((it) => it.isDivider).map((it) => [it.key, it]));
      newOrder = [...unassigned];
      dividerKeys.forEach((k) => {
        const d = dividerItems.get(k)!;
        newOrder.push(k === dividerId ? { ...d, name: (name || d.name || '').trim() } : d);
        newOrder.push(...(groupMembers.get(k) || []));
      });

      if (name?.trim()) {
        await supabase.from('location_matrix_dividers').update({ name: name.trim() }).eq('id', dividerId.replace(/^divider-/, ''));
      }
    } else if (action === 'delete') {
      if (!dividerId) return NextResponse.json({ error: 'dividerId is required' }, { status: 400 });
      newOrder = items.filter((it) => it.key !== dividerId);
      await supabase.from('location_matrix_dividers').delete().eq('id', dividerId.replace(/^divider-/, ''));
    } else {
      return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
    }

    // Renumber sequentially and persist.
    const staffUpserts: any[] = [];
    const dividerUpdates: { id: string; display_order: number }[] = [];
    newOrder.forEach((it, idx) => {
      const display_order = idx + 1;
      if (it.isDivider) dividerUpdates.push({ id: it.key.replace(/^divider-/, ''), display_order });
      else staffUpserts.push({ staff_id: it.key, location_id: locationId, display_order });
    });

    if (staffUpserts.length > 0) {
      const { error: upErr } = await supabase.from('staff_locations').upsert(staffUpserts, { onConflict: 'staff_id,location_id' });
      if (upErr) return NextResponse.json({ error: upErr.message }, { status: 400 });
    }
    await Promise.all(
      dividerUpdates.map((d) =>
        supabase.from('location_matrix_dividers').update({ display_order: d.display_order }).eq('id', d.id)
      )
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error('Error in staff-group endpoint:', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
