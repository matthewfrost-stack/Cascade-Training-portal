import { NextRequest, NextResponse } from 'next/server';
import { getScopedLocations, requireRole } from '@/lib/apiAuth';

const allowedRoles = ['admin', 'manager', 'scheduler'] as const;
const stages = new Set(['enquiry', 'application', 'offer', 'enrolled', 'in_progress', 'completed', 'withdrawn']);

function validDateTime(value: unknown) {
  return typeof value === 'string' && !Number.isNaN(Date.parse(value));
}

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const authz = await requireRole([...allowedRoles]);
    if ('error' in authz) return authz.error;

    const { id } = await context.params;
    const body = await request.json();
    const { data: lead, error: leadError } = await authz.service
      .from('qualification_leads')
      .select('id, location_id')
      .eq('id', id)
      .single();
    if (leadError || !lead) return NextResponse.json({ error: 'Qualification lead not found' }, { status: 404 });

    const scope = await getScopedLocations(authz.userId, authz.role, authz.service);
    if (!scope.all && !scope.locations.some((location) => location.id === lead.location_id)) {
      return NextResponse.json({ error: 'You do not have access to this location' }, { status: 403 });
    }

    const eventType = String(body?.event_type || '').trim().slice(0, 60);
    const note = String(body?.note || '').trim().slice(0, 4000);
    const eventDate = body?.event_date || new Date().toISOString();
    if (!eventType || !validDateTime(eventDate)) return NextResponse.json({ error: 'event_type and a valid event_date are required' }, { status: 400 });
    if (body?.stage && !stages.has(body.stage)) return NextResponse.json({ error: 'Invalid stage' }, { status: 400 });

    const { data: timelineEvent, error: timelineError } = await authz.service
      .from('qualification_lead_timeline')
      .insert({ lead_id: id, event_type: eventType, event_date: eventDate, note: note || null, created_by: authz.userId })
      .select('id, lead_id, event_type, event_date, note, created_by, created_at')
      .single();
    if (timelineError || !timelineEvent) return NextResponse.json({ error: timelineError?.message || 'Failed to add timeline event' }, { status: 400 });

    if (body?.stage) {
      const { error: stageError } = await authz.service
        .from('qualification_leads')
        .update({ stage: body.stage, updated_by: authz.userId })
        .eq('id', id);
      if (stageError) console.error('Timeline saved but stage update failed:', stageError);
    }

    return NextResponse.json({ timelineEvent }, { status: 201 });
  } catch (error) {
    console.error('Error adding qualification timeline event:', error);
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }
}

