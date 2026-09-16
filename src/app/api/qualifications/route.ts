import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient, getScopedLocations, requireRole } from '@/lib/apiAuth';

export const dynamic = 'force-dynamic';

const allowedRoles = ['admin', 'manager', 'scheduler'] as const;
const qualificationTypes = new Set(['nvq', 'diploma']);
const stages = new Set(['enquiry', 'application', 'offer', 'enrolled', 'in_progress', 'completed', 'withdrawn']);

type Scope = { all: true } | { all: false; locations: { id: string; name: string }[] };

function hasLocationAccess(scope: Scope, locationId: unknown): locationId is string {
  return typeof locationId === 'string'
    && locationId.length > 0
    && (scope.all || scope.locations.some((location) => location.id === locationId));
}

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

export async function GET() {
  try {
    const authz = await requireRole([...allowedRoles]);
    if ('error' in authz) return authz.error;

    const service = createServiceClient();
    const scope = await getScopedLocations(authz.userId, authz.role, service);
    const locations = scope.all
      ? (await service.from('locations').select('id, name').order('name')).data || []
      : scope.locations;

    let query = service
      .from('qualification_leads')
      .select('id, location_id, qualification_type, qualification_name, full_name, email, phone, stage, enquiry_date, target_completion_date, completion_date, notes, created_at, updated_at, locations(id, name), qualification_lead_timeline(id, event_type, event_date, note, created_by, created_at)')
      .order('enquiry_date', { ascending: false });

    if (!scope.all) {
      if (scope.locations.length === 0) return NextResponse.json({ leads: [], locations: [] });
      query = query.in('location_id', scope.locations.map((location) => location.id));
    }

    const { data: leads, error } = await query;
    if (error) {
      console.error('Error fetching qualification leads:', error);
      return NextResponse.json({ error: 'Failed to load qualification tracking' }, { status: 500 });
    }

    return NextResponse.json({ leads: leads || [], locations });
  } catch (error) {
    console.error('Error in qualification leads endpoint:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const authz = await requireRole([...allowedRoles]);
    if ('error' in authz) return authz.error;

    const body = await request.json();
    const scope = await getScopedLocations(authz.userId, authz.role, authz.service);
    const qualificationType = cleanText(body?.qualification_type, 30)?.toLowerCase();
    const qualificationName = cleanText(body?.qualification_name, 160);
    const fullName = cleanText(body?.full_name, 160);
    const locationId = body?.location_id;
    const enquiryDateValue = body?.enquiry_date || new Date().toISOString().slice(0, 10);
    const stage = cleanText(body?.stage, 30)?.toLowerCase() || 'enquiry';

    if (!qualificationType || !qualificationTypes.has(qualificationType)) {
      return NextResponse.json({ error: 'qualification_type must be nvq or diploma' }, { status: 400 });
    }
    if (!qualificationName || !fullName || !hasLocationAccess(scope, locationId)) {
      return NextResponse.json({ error: 'location, qualification name, and candidate name are required' }, { status: 400 });
    }
    if (!stages.has(stage) || !validDate(enquiryDateValue) || !enquiryDateValue || !validDate(body?.target_completion_date ?? null) || !validDate(body?.completion_date ?? null)) {
      return NextResponse.json({ error: 'Invalid stage or date value' }, { status: 400 });
    }

    const { data: lead, error: leadError } = await authz.service
      .from('qualification_leads')
      .insert({
        location_id: locationId,
        qualification_type: qualificationType,
        qualification_name: qualificationName,
        full_name: fullName,
        email: cleanText(body?.email, 254),
        phone: cleanText(body?.phone, 80),
        stage,
        enquiry_date: enquiryDateValue,
        target_completion_date: body?.target_completion_date || null,
        completion_date: body?.completion_date || null,
        notes: cleanText(body?.notes, 4000),
        created_by: authz.userId,
        updated_by: authz.userId,
      })
      .select('id, location_id, qualification_type, qualification_name, full_name, email, phone, stage, enquiry_date, target_completion_date, completion_date, notes, created_at, updated_at, locations(id, name)')
      .single();

    if (leadError || !lead) {
      console.error('Error creating qualification lead:', leadError);
      return NextResponse.json({ error: leadError?.message || 'Failed to create qualification lead' }, { status: 400 });
    }

    const { error: timelineError } = await authz.service
      .from('qualification_lead_timeline')
      .insert({
        lead_id: lead.id,
        event_type: 'enquiry',
        event_date: timelineDate(enquiryDateValue),
        note: 'Initial enquiry recorded.',
        created_by: authz.userId,
      });

    if (timelineError) {
      console.error('Error creating initial qualification timeline event:', timelineError);
      return NextResponse.json({ error: 'Lead created, but the initial timeline event could not be saved.' }, { status: 500 });
    }

    return NextResponse.json({ lead }, { status: 201 });
  } catch (error) {
    console.error('Error creating qualification lead:', error);
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }
}
