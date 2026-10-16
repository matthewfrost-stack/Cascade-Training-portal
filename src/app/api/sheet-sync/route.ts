import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/apiAuth';
import { fetchSheetRows, isSameValue, normalizeHeader, type SheetSyncConfig } from '@/lib/googleSheetsSync';

export const dynamic = 'force-dynamic';

function toConfigIdValue(value: FormDataEntryValue | null): string {
  return typeof value === 'string' ? value.trim() : '';
}

export async function GET(request: NextRequest) {
  const authz = await requireRole(['admin']);
  if ('error' in authz) return authz.error;

  const url = new URL(request.url);
  const locationId = url.searchParams.get('locationId');
  const sheetId = url.searchParams.get('sheetId');

  if (!locationId && !sheetId) {
    return NextResponse.json({ error: 'locationId or sheetId required' }, { status: 400 });
  }

  try {
    const { data, error } = await authz.service
      .from('sheet_sync_configs')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw error;
    return NextResponse.json({ configs: data || [] });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Failed to load configs' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const authz = await requireRole(['admin']);
  if ('error' in authz) return authz.error;

  try {
    const form = await request.formData();
    const locationId = toConfigIdValue(form.get('locationId'));
    const sourceSheetId = toConfigIdValue(form.get('sourceSheetId'));
    const sourceTabName = toConfigIdValue(form.get('sourceTabName')) || 'APP_SYNC';
    const sourceRange = toConfigIdValue(form.get('sourceRange')) || 'A1:Z500';
    const primaryKey = toConfigIdValue(form.get('primaryKey')) || 'email';
    const syncEnabled = String(form.get('syncEnabled') ?? 'true') === 'true';
    const allowNewRows = String(form.get('allowNewRows') ?? 'false') === 'true';
    const manualOnly = String(form.get('manualOnly') ?? 'true') === 'true';
    const syncActiveColumn = toConfigIdValue(form.get('syncActiveColumn')) || null;
    const lastUpdatedColumn = toConfigIdValue(form.get('lastUpdatedColumn')) || null;
    const includeColumnsRaw = form.get('includeColumns');
    const includeColumns = includeColumnsRaw ? JSON.parse(String(includeColumnsRaw)) : [];

    if (!locationId || !sourceSheetId) {
      return NextResponse.json({ error: 'locationId and sourceSheetId are required' }, { status: 400 });
    }

    const payload = {
      location_id: locationId,
      source_type: 'google_sheet',
      source_sheet_id: sourceSheetId,
      source_tab_name: sourceTabName,
      source_range: sourceRange,
      primary_key: primaryKey,
      include_columns: Array.isArray(includeColumns) ? includeColumns : [],
      sync_enabled: syncEnabled,
      allow_new_rows: allowNewRows,
      manual_only: manualOnly,
      sync_active_column: syncActiveColumn,
      last_updated_column: lastUpdatedColumn,
    };

    const { data, error } = await authz.service.from('sheet_sync_configs').upsert(payload, { onConflict: 'location_id' }).select().single();

    if (error) throw error;

    return NextResponse.json({ success: true, config: data });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Invalid sync configuration' }, { status: 400 });
  }
}

export async function PUT(request: NextRequest) {
  const authz = await requireRole(['admin']);
  if ('error' in authz) return authz.error;

  try {
    const body = await request.json();
    const { id, sync_enabled, allow_new_rows, manual_only, source_sheet_id, source_tab_name, source_range, primary_key } = body || {};
    if (!id) {
      return NextResponse.json({ error: 'id is required' }, { status: 400 });
    }

    const { data, error } = await authz.service.from('sheet_sync_configs').update({
      sync_enabled: typeof sync_enabled === 'boolean' ? sync_enabled : undefined,
      allow_new_rows: typeof allow_new_rows === 'boolean' ? allow_new_rows : undefined,
      manual_only: typeof manual_only === 'boolean' ? manual_only : undefined,
      source_sheet_id: typeof source_sheet_id === 'string' ? source_sheet_id : undefined,
      source_tab_name: typeof source_tab_name === 'string' ? source_tab_name : undefined,
      source_range: typeof source_range === 'string' ? source_range : undefined,
      primary_key: typeof primary_key === 'string' ? primary_key : undefined,
      updated_at: new Date().toISOString(),
    }).eq('id', id).select().single();

    if (error) throw error;
    return NextResponse.json({ success: true, config: data });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Failed to update sync configuration' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const authz = await requireRole(['admin']);
  if ('error' in authz) return authz.error;

  const id = new URL(request.url).searchParams.get('id');
  if (!id) {
    return NextResponse.json({ error: 'id is required' }, { status: 400 });
  }

  const { error } = await authz.service.from('sheet_sync_configs').delete().eq('id', id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ success: true });
}

export async function PATCH(request: NextRequest) {
  const authz = await requireRole(['admin']);
  if ('error' in authz) return authz.error;

  try {
    const body = await request.json();
    const { locationId, syncNow } = body || {};
    if (!locationId) {
      return NextResponse.json({ error: 'locationId is required' }, { status: 400 });
    }

    const { data: configs, error: configError } = await authz.service
      .from('sheet_sync_configs')
      .select('*')
      .eq('location_id', locationId)
      .eq('sync_enabled', true)
      .limit(1);

    if (configError) throw configError;
    const config = configs?.[0] as SheetSyncConfig | undefined;
    if (!config) {
      return NextResponse.json({ success: true, updated: 0, message: 'No enabled sync configured for this location' });
    }

    const rows = await fetchSheetRows(config);
    if (!rows.length) {
      await authz.service.from('sheet_sync_configs').update({ last_synced_at: new Date().toISOString() }).eq('id', config.id);
      return NextResponse.json({ success: true, updated: 0, rows: 0, message: 'No rows matched the sync filters' });
    }

    const { data: existingRows, error: existingErr } = await authz.service
      .from('profiles')
      .select('id, email, full_name')
      .eq('is_deleted', false);

    if (existingErr) throw existingErr;
    const existingByKey = new Map<string, { id: string; email?: string; full_name?: string }>();
    (existingRows || []).forEach((row) => {
      const email = String(row.email || '').trim().toLowerCase();
      const name = String(row.full_name || '').trim().toLowerCase();
      if (email) existingByKey.set(`email:${email}`, row as any);
      if (name) existingByKey.set(`name:${name}`, row as any);
    });

    let updated = 0;
    const imported = rows.map((row) => {
      const key = config.primary_key || 'email';
      const lookupKey = normalizeHeader(key);
      const lookupValue = String(row[lookupKey] || '').trim();
      const existing = lookupValue ? existingByKey.get(`${lookupKey}:${lookupValue.toLowerCase()}`) : undefined;

      if (existing) {
        const nextValues: Record<string, string> = {};
        Object.entries(row).forEach(([field, value]) => {
          const fieldKey = normalizeHeader(field);
          if (fieldKey === 'sync_active') return;
          const existingValue = (existing as Record<string, unknown>)[fieldKey] ?? '';
          if (!isSameValue(existingValue, value)) {
            nextValues[fieldKey] = value;
          }
        });

        if (Object.keys(nextValues).length > 0) {
          updated += 1;
        }
      }

      return { existing, row, lookupValue };
    });

    await authz.service.from('sheet_sync_configs').update({ last_synced_at: new Date().toISOString() }).eq('id', config.id);

    return NextResponse.json({ success: true, updated, rows: imported.length, message: 'Sync preview complete' });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Failed to sync Google Sheet' }, { status: 500 });
  }
}
