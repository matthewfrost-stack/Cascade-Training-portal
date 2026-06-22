import { NextRequest, NextResponse } from 'next/server';
import { addMonths } from 'date-fns';
import { requireRole } from '@/lib/apiAuth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type ImportSummary = {
  rows: number;
  processedCells: number;
  upserts: number;
  createdProfiles: number;
  linkedStaffLocations: number;
  createdCourses: number;
  linkedCourses: number;
  skippedUnknownStaff: number;
  skippedUnknownCourses: number;
  errors: number;
};

function cleanCell(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function normalizeKey(value: string): string {
  return cleanCell(value)
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[\u2018\u2019\u201B\u2032]/g, "'")
    .replace(/[\u201C\u201D\u201F\u2033]/g, '"')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeStaffName(value: string): string {
  const raw = cleanCell(value).normalize('NFKC').replace(/\s+/g, ' ').trim();
  if (!raw) return '';

  // Handle "Last, First" -> "First Last"
  if (raw.includes(',')) {
    const [last, rest] = raw.split(',', 2).map((s) => s.trim());
    const recomposed = `${rest || ''} ${last || ''}`.trim();
    return normalizeKey(recomposed);
  }

  return normalizeKey(raw);
}

function parseCsvLine(line: string): string[] {
  const cells: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];

    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
        continue;
      }
      inQuotes = !inQuotes;
      continue;
    }

    if (ch === ',' && !inQuotes) {
      cells.push(current);
      current = '';
      continue;
    }

    current += ch;
  }

  cells.push(current);
  return cells.map(cleanCell);
}

function hasBalancedQuotes(text: string): boolean {
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    if (text[i] !== '"') continue;
    if (inQuotes && text[i + 1] === '"') {
      i++;
      continue;
    }
    inQuotes = !inQuotes;
  }
  return !inQuotes;
}

function parseLogicalRows(content: string, maxRows = 20000): string[][] {
  const physicalLines = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
  const rows: string[][] = [];
  let buffer = '';

  for (const line of physicalLines) {
    buffer = buffer ? `${buffer}\n${line}` : line;
    if (!hasBalancedQuotes(buffer)) continue;

    const parsed = parseCsvLine(buffer);
    buffer = '';
    // skip totally empty rows
    if (parsed.every((c) => !c)) continue;
    rows.push(parsed);
    if (rows.length >= maxRows) break;
  }

  if (buffer && rows.length < maxRows) {
    const parsed = parseCsvLine(buffer);
    if (parsed.some((c) => c)) rows.push(parsed);
  }

  return rows;
}

function parseDdMmYyyy(input: string): string | null {
  const raw = cleanCell(input);
  if (!raw) return null;

  const m = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/);
  if (!m) return null;

  const day = Number(m[1]);
  const month = Number(m[2]);
  let year = Number(m[3]);
  if (year < 100) year += 2000;
  if (!day || !month || !year) return null;

  const dt = new Date(Date.UTC(year, month - 1, day));
  if (dt.getUTCFullYear() !== year || dt.getUTCMonth() !== month - 1 || dt.getUTCDate() !== day) return null;

  // Return yyyy-mm-dd
  const yyyy = String(year);
  const mm = String(month).padStart(2, '0');
  const dd = String(day).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function computeExpiryDateIso(completionDateIso: string, expiryMonths: number | null, neverExpires: boolean | null): string | null {
  if (!completionDateIso) return null;
  if (neverExpires) return null;
  if (!expiryMonths || expiryMonths === 9999) return null;
  const [y, m, d] = completionDateIso.split('-').map(Number);
  const base = new Date(Date.UTC(y, m - 1, d));
  const exp = addMonths(base, expiryMonths);
  const yyyy = String(exp.getUTCFullYear());
  const mm = String(exp.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(exp.getUTCDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function interpretCell(value: string): { kind: 'empty' } | { kind: 'status'; status: string } | { kind: 'date'; dateIso: string } {
  const v = cleanCell(value);
  if (!v) return { kind: 'empty' };

  const lower = v.toLowerCase();
  if (lower === 'allocated') return { kind: 'status', status: 'allocated' };
  if (lower === 'not yet due') return { kind: 'status', status: 'not_yet_due' };
  if (lower === 'n/a' || lower === 'na') return { kind: 'status', status: 'na' };

  const dateIso = parseDdMmYyyy(v);
  if (dateIso) return { kind: 'date', dateIso };

  return { kind: 'empty' };
}

function normalizeCourseName(value: string): string {
  return normalizeKey(value).replace(/\s+\(careskills\)\s*$/i, '').trim();
}

function parseExpiryMonthsFromCell(value: string): { expiryMonths: number | null; neverExpires: boolean | null } {
  const raw = cleanCell(value).toLowerCase();
  if (!raw) {
    return { expiryMonths: 12, neverExpires: false };
  }

  if (raw.includes('one-off') || raw.includes('never expires') || raw.includes('no expiry')) {
    return { expiryMonths: null, neverExpires: true };
  }

  const monthsMatch = raw.match(/(\d+)\s*(?:month|months|mth|mths)/i);
  if (monthsMatch) {
    const months = Number(monthsMatch[1]);
    return {
      expiryMonths: Number.isFinite(months) && months > 0 ? months : 12,
      neverExpires: false,
    };
  }

  const numeric = Number.parseInt(raw, 10);
  if (Number.isFinite(numeric) && numeric > 0) {
    return {
      expiryMonths: numeric,
      neverExpires: numeric === 9999,
    };
  }

  return { expiryMonths: 12, neverExpires: false };
}

function findExpiryRowIndex(rows: string[][], headerIdx: number): number {
  const preferred = rows.findIndex((row, idx) => {
    if (idx <= headerIdx) return false;
    const first = cleanCell(row[0] || '').toLowerCase();
    return first.includes('date valid for') || first.includes('expiry');
  });

  if (preferred >= 0) return preferred;
  return rows[headerIdx + 2] ? headerIdx + 2 : headerIdx + 1;
}

export async function POST(request: NextRequest) {
  try {
    const authz = await requireRole(['admin']);
    if ('error' in authz) return authz.error;

    const form = await request.formData();
    const locationId = String(form.get('locationId') || '').trim();
    const file = form.get('file');
    const allowNewStaff = String(form.get('allowNewStaff') || '').toLowerCase() === 'true';

    if (!locationId) {
      return NextResponse.json({ error: 'Missing locationId' }, { status: 400 });
    }
    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'Missing CSV file' }, { status: 400 });
    }

    const csvText = await file.text();
    const rows = parseLogicalRows(csvText, 25000);

    const headerIdx = rows.findIndex((r) => {
      const first = cleanCell(r[0] || '').toLowerCase();
      return first === 'staff name' || first === 'learner name' || first === "learner's name";
    });

    if (headerIdx < 0) {
      return NextResponse.json({ error: 'Could not find header row (Staff Name)' }, { status: 400 });
    }

    const headerRow = rows[headerIdx] || [];
    const courseNames = headerRow.slice(1).map((c) => cleanCell(c));
    if (courseNames.length === 0) {
      return NextResponse.json({ error: 'No course columns found' }, { status: 400 });
    }

    const dataRows = rows.slice(headerIdx + 1);

    const summary: ImportSummary = {
      rows: dataRows.length,
      processedCells: 0,
      upserts: 0,
      createdProfiles: 0,
      linkedStaffLocations: 0,
      createdCourses: 0,
      linkedCourses: 0,
      skippedUnknownStaff: 0,
      skippedUnknownCourses: 0,
      errors: 0,
    };

    const unknownStaffSamples = new Set<string>();
    const errorMessages = new Set<string>();

    const dividerLabels = new Set<string>([
      'notes',
      'date valid for',
      'management',
      'team leaders',
      'lead support',
      'staff team',
      'staff on probation',
      'inactive staff',
      'staff on maternity',
      'bank staff',
    ].map(normalizeKey));

    const ignoredMetaColumns = new Set<string>([
      'start date',
      'end date',
      'induction',
      'end of probation',
      'probation notes',
      'qualifications upon entry',
      'care certificate',
      'd b s',
      'dbs',
      'd b s on update',
      'job role',
      'able to drive company vehicle',
      'ofsted only training',
      'manager only training',
      "nvq's",
      'nvqs',
    ].map(normalizeKey));

    const expiryIdx = findExpiryRowIndex(rows, headerIdx);
    const expiryRow = rows[expiryIdx] || [];

    const { data: locationRow, error: locationErr } = await authz.service
      .from('locations')
      .select('id, name')
      .eq('id', locationId)
      .maybeSingle();

    if (locationErr) return NextResponse.json({ error: locationErr.message }, { status: 400 });
    const locationName = locationRow?.name || '';

    // Load staff + courses for this location.
    const { data: staffRows, error: staffErr } = await authz.service
      .from('profiles')
      .select('id, full_name, email, location, home_house, is_deleted')
      .eq('is_deleted', false);

    if (staffErr) return NextResponse.json({ error: staffErr.message }, { status: 400 });
    const staffMap = new Map<string, { id: string; full_name: string; location?: string | null; home_house?: string | null }>();
    (staffRows || []).forEach((s: any) => {
      if (!s?.id || !s?.full_name) return;
      const key = normalizeStaffName(String(s.full_name));
      if (!key) return;

      const nextValue = {
        id: String(s.id),
        full_name: String(s.full_name),
        location: s.location ?? null,
        home_house: s.home_house ?? null,
      };

      const existing = staffMap.get(key);
      if (!existing) {
        staffMap.set(key, nextValue);
        return;
      }

      const existingMatchesLocation = [existing.location, existing.home_house]
        .filter((v): v is string => typeof v === 'string' && v.trim().length > 0)
        .some((v) => normalizeKey(v) === normalizeKey(locationName));
      const nextMatchesLocation = [nextValue.location, nextValue.home_house]
        .filter((v): v is string => typeof v === 'string' && v.trim().length > 0)
        .some((v) => normalizeKey(v) === normalizeKey(locationName));

      if (!existingMatchesLocation && nextMatchesLocation) {
        staffMap.set(key, nextValue);
      }
    });

    const { data: allCourses, error: allCoursesErr } = await authz.service
      .from('training_courses')
      .select('id, name, expiry_months, never_expires');

    if (allCoursesErr) return NextResponse.json({ error: allCoursesErr.message }, { status: 400 });

    const courseCatalog = new Map<string, { id: string; name: string; expiryMonths: number | null; neverExpires: boolean | null }>();
    (allCourses || []).forEach((c: any) => {
      if (!c?.id || !c?.name) return;
      const key = normalizeCourseName(String(c.name));
      if (!key || courseCatalog.has(key)) return;
      courseCatalog.set(key, {
        id: String(c.id),
        name: String(c.name),
        expiryMonths: typeof c.expiry_months === 'number' ? c.expiry_months : null,
        neverExpires: typeof c.never_expires === 'boolean' ? c.never_expires : null,
      });
    });

    // Courses configured for the selected location.
    const { data: locationCourses, error: courseErr } = await authz.service
      .from('location_training_courses')
      .select('training_course_id, training_courses(id, name, expiry_months, never_expires)')
      .eq('location_id', locationId);

    if (courseErr) return NextResponse.json({ error: courseErr.message }, { status: 400 });

    const courseMap = new Map<string, { id: string; expiryMonths: number | null; neverExpires: boolean | null }>();
    (locationCourses || []).forEach((lc: any) => {
      const c = Array.isArray(lc.training_courses) ? lc.training_courses[0] : lc.training_courses;
      if (!c?.id || !c?.name) return;
      courseMap.set(normalizeCourseName(String(c.name)), {
        id: String(c.id),
        expiryMonths: typeof c.expiry_months === 'number' ? c.expiry_months : null,
        neverExpires: typeof c.never_expires === 'boolean' ? c.never_expires : null,
      });
    });

    const unknownCourseColumns: string[] = [];

    // Precompute which header columns map to courses, with display_order from CSV column position.
    const colToCourse: Array<{ col: number; courseId: string; displayOrder: number; expiryMonths: number | null; neverExpires: boolean | null } | null> = [];
    for (let idx = 0; idx < courseNames.length; idx++) {
      const name = courseNames[idx];
      const normalizedHeader = normalizeCourseName(name);
      if (!normalizedHeader) {
        colToCourse.push(null);
        continue;
      }
      if (ignoredMetaColumns.has(normalizedHeader)) {
        colToCourse.push(null);
        continue;
      }

      let hit = courseMap.get(normalizedHeader) || courseCatalog.get(normalizedHeader);
      if (!hit) {
        const parsedExpiry = parseExpiryMonthsFromCell(expiryRow[idx + 1] || '');
        const { data: createdCourse, error: createCourseErr } = await authz.service
          .from('training_courses')
          .upsert([
            {
              name,
              expiry_months: parsedExpiry.expiryMonths,
              never_expires: parsedExpiry.neverExpires,
            },
          ], { onConflict: 'name' })
          .select('id, name, expiry_months, never_expires')
          .single();

        if (createCourseErr || !createdCourse?.id) {
          unknownCourseColumns.push(name);
          summary.errors++;
          if (createCourseErr && errorMessages.size < 10) errorMessages.add(createCourseErr.message);
          colToCourse.push(null);
          continue;
        }

        hit = {
          id: String(createdCourse.id),
          expiryMonths: typeof createdCourse.expiry_months === 'number' ? createdCourse.expiry_months : parsedExpiry.expiryMonths,
          neverExpires: typeof createdCourse.never_expires === 'boolean' ? createdCourse.never_expires : parsedExpiry.neverExpires,
        };
        courseCatalog.set(normalizedHeader, {
          id: hit.id,
          name,
          expiryMonths: hit.expiryMonths,
          neverExpires: hit.neverExpires,
        });
        summary.createdCourses++;
      }

      const linkRes = await authz.service
        .from('location_training_courses')
        .upsert([{ location_id: locationId, training_course_id: hit.id, display_order: idx + 1 }], {
          onConflict: 'location_id,training_course_id',
        });

      if (linkRes.error) {
        unknownCourseColumns.push(name);
        summary.errors++;
        if (errorMessages.size < 10) errorMessages.add(linkRes.error.message);
        colToCourse.push(null);
        continue;
      }

      summary.linkedCourses++;
      courseMap.set(normalizedHeader, {
        id: hit.id,
        expiryMonths: hit.expiryMonths,
        neverExpires: hit.neverExpires,
      });
      colToCourse.push({
        col: idx + 1,
        courseId: hit.id,
        displayOrder: idx + 1,
        expiryMonths: hit.expiryMonths,
        neverExpires: hit.neverExpires,
      });
    }

    summary.skippedUnknownCourses = unknownCourseColumns.length;

    // Update course display_order from CSV column positions
    const courseDisplayOrderUpdates: Array<{ locationId: string; courseId: string; displayOrder: number }> = [];
    for (const mapping of colToCourse) {
      if (!mapping) continue;
      courseDisplayOrderUpdates.push({ locationId, courseId: mapping.courseId, displayOrder: mapping.displayOrder });
    }

    // Batch update location_training_courses with display_order from CSV
    for (const update of courseDisplayOrderUpdates) {
      await authz.service
        .from('location_training_courses')
        .update({ display_order: update.displayOrder })
        .eq('location_id', update.locationId)
        .eq('training_course_id', update.courseId);
    }

    const upserts: any[] = [];
    const staffDisplayOrderUpdates: Map<string, number> = new Map();
    let staffRowPosition = 1;

    for (const row of dataRows) {
      const staffName = cleanCell(row[0] || '');
      if (!staffName) continue;

      if (dividerLabels.has(normalizeKey(staffName))) {
        // Divider / header row in the spreadsheet (not a staff member)
        continue;
      }

      const staffKey = normalizeStaffName(staffName);
      let staffEntry = staffMap.get(staffKey) || null;

      if (!staffEntry) {
        summary.skippedUnknownStaff++;
        if (unknownStaffSamples.size < 25) unknownStaffSamples.add(staffName);
        if (!allowNewStaff) {
          continue;
        }

        const { data: createdProfile, error: createProfileError } = await authz.service
          .from('profiles')
          .insert([
            {
              id: crypto.randomUUID(),
              full_name: staffName,
              email: `${normalizeKey(staffName).replace(/[^a-z0-9]+/g, '.').replace(/^\.+|\.+$/g, '').slice(0, 40) || 'matrix.staff'}.${crypto.randomUUID().slice(0, 8)}@matrix.local`,
              location: locationName || null,
              role_tier: 'staff',
              password_needs_change: false,
              is_deleted: false,
            },
          ])
          .select('id, full_name, location, home_house')
          .single();

        if (createProfileError || !createdProfile?.id) {
          summary.errors++;
          if (createProfileError && errorMessages.size < 10) errorMessages.add(createProfileError.message);
          continue;
        }

        staffEntry = {
          id: String(createdProfile.id),
          full_name: String(createdProfile.full_name || staffName),
          location: createdProfile.location ?? null,
          home_house: createdProfile.home_house ?? null,
        };
        staffMap.set(staffKey, staffEntry);
        summary.createdProfiles++;
      }

      const staffId = staffEntry.id;

      // Track staff display order from CSV row position
      if (!staffDisplayOrderUpdates.has(staffId)) {
        staffDisplayOrderUpdates.set(staffId, staffRowPosition);
        staffRowPosition++;

        const staffLocationRes = await authz.service
          .from('staff_locations')
          .upsert([
            {
              staff_id: staffId,
              location_id: locationId,
              display_order: staffDisplayOrderUpdates.get(staffId) || staffRowPosition,
            },
          ], { onConflict: 'staff_id,location_id' });

        if (staffLocationRes.error) {
          summary.errors++;
          if (errorMessages.size < 10) errorMessages.add(staffLocationRes.error.message);
        } else {
          summary.linkedStaffLocations++;
        }
      }

      for (const mapping of colToCourse) {
        if (!mapping) continue;
        if (!mapping.courseId) continue;
        const raw = String(row[mapping.col] || '');
        const interpreted = interpretCell(raw);
        if (interpreted.kind === 'empty') continue;

        summary.processedCells++;

        if (interpreted.kind === 'status') {
          upserts.push({
            staff_id: staffId,
            course_id: mapping.courseId,
            completion_date: null,
            expiry_date: null,
            status: interpreted.status,
            completed_at_location_id: locationId,
          });
          continue;
        }

        const expiryIso = computeExpiryDateIso(interpreted.dateIso, mapping.expiryMonths, mapping.neverExpires);
        upserts.push({
          staff_id: staffId,
          course_id: mapping.courseId,
          completion_date: interpreted.dateIso,
          expiry_date: expiryIso,
          status: 'completed',
          completed_at_location_id: locationId,
        });
      }
    }

    // Upsert in chunks.
    const chunkSize = 500;
    for (let i = 0; i < upserts.length; i += chunkSize) {
      const chunk = upserts.slice(i, i + chunkSize);
      let { error } = await authz.service
        .from('staff_training_matrix')
        .upsert(chunk, { onConflict: 'staff_id,course_id,completed_at_location_id' });

      // Support deployments that still use the legacy unique key.
      if (error?.code === '42P10') {
        const fallback = await authz.service
          .from('staff_training_matrix')
          .upsert(chunk, { onConflict: 'staff_id,course_id' });
        error = fallback.error;
      }

      if (error) {
        summary.errors++;
        if (errorMessages.size < 10) errorMessages.add(error.message);
        console.error('Full matrix CSV import: upsert chunk failed:', error.message);
      } else {
        summary.upserts += chunk.length;
      }
    }

    // Update staff display order from CSV row positions
    for (const [staffId, displayOrder] of staffDisplayOrderUpdates.entries()) {
      const updateRes = await authz.service
        .from('staff_locations')
        .update({ display_order: displayOrder })
        .eq('location_id', locationId)
        .eq('staff_id', staffId);

      if (updateRes.error) {
        console.warn('Could not update staff_locations display_order for staff:', staffId, updateRes.error);
      }
    }

    return NextResponse.json({
      success: summary.errors === 0,
      summary,
      requiresStaffApproval: !allowNewStaff && unknownStaffSamples.size > 0,
      errors: Array.from(errorMessages.values()),
      unknownStaff: Array.from(unknownStaffSamples.values()),
      unknownCourses: unknownCourseColumns.slice(0, 50),
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
