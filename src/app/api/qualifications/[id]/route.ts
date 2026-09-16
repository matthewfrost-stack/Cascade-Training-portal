import { NextRequest, NextResponse } from 'next/server';
import { getScopedLocations, requireRole } from '@/lib/apiAuth';

const allowedRoles = ['admin', 'manager', 'scheduler'] as const;
const stages = new Set(['enquiry', 'application', 'offer', 'enrolled', 'in_progress', 'completed', 'withdrawn']);

function validDate(value: unknown): value is string | null {
  return value === null || (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value));
}

function cleanText(value: unknown, maxLength: number): string | null {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text ? text.slice(0, maxLength) : null;
}

function timelineDate(date: string) {
  return `${date}T12:00:00.000Z`;
}

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const authz = await requireRole([...allowedRoles]);
    if ('error' in authz) return authz.error;

    const { id } = await context.params;
    const body = await request.json();
    const { data: existing, error: existingError } = await authz.service
      .from('qualification_leads')
      .select('id, location_id, stage')
      .eq('id', id)
      .single();

    if (existingError || !existing) return NextResponse.json({ error: 'Qualification lead not found' }, { status: 404 });

    const scope = await getScopedLocations(authz.userId, authz.role, authz.service);
    const canAccess = scope.all || scope.locations.some((location) => location.id === existing.location_id);
    if (!canAccess) return NextResponse.json({ error: 'You do not have access to this location' }, { status: 403 });

    const updates: Record<string, unknown> = { updated_by: authz.userId };
    const editableFields = ['location_id', 'qualification_type', 'qualification_name', 'full_name', 'email', 'phone', 'stage', 'enquiry_date', 'target_completion_date', 'completion_date', 'notes'] as const;
    for (const field of editableFields) {
      if (!(field in body)) continue;
      if (field === 'location_id') {
        if (!scope.all && !scope.locations.some((location) => location.id === body[field])) {
          return NextResponse.json({ error: 'You do not have access to the selected location' }, { status: 403 });
        }
        updates[field] = body[field];
      } else if (field === 'stage') {
        const stage = cleanText(body[field], 30)?.toLowerCase();
        if (!stage || !stages.has(stage)) return NextResponse.json({ error: 'Invalid stage' }, { status: 400 });
        updates[field] = stage;
      } else if (field.endsWith('_date')) {
        if (!validDate(body[field])) return NextResponse.json({ error: `Invalid ${field}` }, { status: 400 });
        updates[field] = body[field] || null;
      } else if (field === 'qualification_type') {
        const type = cleanText(body[field], 30)?.toLowerCase();
        if (type !== 'nvq' && type !== 'diploma') return NextResponse.json({ error: 'Invalid qualification type' }, { status: 400 });
        updates[field] = type;
      } else {
        updates[field] = cleanText(body[field], field === 'notes' ? 4000 : 254);
      }
    }

    const { data: lead, error: updateError } = await authz.service
      .from('qualification_leads')
      .update(updates)
      .eq('id', id)
      .select('id, location_id, qualification_type, qualification_name, full_name, email, phone, stage, enquiry_date, target_completion_date, completion_date, notes, created_at, updated_at, locations(id, name)')
      .single();

    if (updateError || !lead) return NextResponse.json({ error: updateError?.message || 'Failed to update qualification lead' }, { status: 400 });

    if (updates.stage && updates.stage !== existing.stage) {
      const { error: timelineError } = await authz.service
        .from('qualification_lead_timeline')
        .insert({
          lead_id: id,
          event_type: String(updates.stage),
          event_date: timelineDate(String(body.event_date || new Date().toISOString().slice(0, 10))),
          note: cleanText(body.stage_note, 2000) || `Stage changed to ${String(updates.stage).replace('_', ' ')}.`,
          created_by: authz.userId,
        });
      if (timelineError) console.error('Error recording qualification stage change:', timelineError);
    }

    return NextResponse.json({ lead });
  } catch (error) {
    console.error('Error updating qualification lead:', error);
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }
}

