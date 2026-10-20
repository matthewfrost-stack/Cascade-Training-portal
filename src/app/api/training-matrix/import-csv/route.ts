import { NextRequest, NextResponse } from 'next/server';
import { addMonths } from 'date-fns';
import { requireRole } from '@/lib/apiAuth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type ImportSummary = {
  rows: number;
  processedCells: number;
  upserts: number;
  clearedCells: number;
  skippedUnknownStaff: number;
  skippedUnknownCourses: number;
  createdProfiles: number;
  createdCourses: number;
  linkedStaffLocations: number;
  linkedCourseLinks: number;
  errors: number;
};
type StaffRow = { id?: string; full_name?: string };
type DividerRow = { id?: string; name?: string };
type CourseRef = {
  id?: string;
  name?: string;
  careskills_name?: string | null;
  expiry_months?: number | null;
  never_expires?: boolean | null;
};
type LocationCourseRow = { training_course_id?: string; training_courses?: CourseRef | CourseRef[] | null };
type TrainingCourseRow = CourseRef & { category?: string | null };
type TrainingMatrixRow = { id?: string; staff_id?: string; course_id?: string };
type CourseInsertResult = { id?: string; expiry_months?: number | null; never_expires?: boolean | null; category?: string | null };
type CourseUpdatePayload = { expiry_months?: number; never_expires?: boolean; category?: string };
type TrainingUpsert = {
  staff_id: string;
  course_id: string;
  completion_date: string | null;
  expiry_date: string | null;
  status: 'completed' | 'allocated' | 'not_yet_due' | 'na';
  completed_at_location_id: string;
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

function courseNameAliases(value: string): string[] {
  const cleaned = cleanCell(value);
  const withoutCareskillsSuffix = cleaned.replace(/\s*\(careskills\)\s*$/i, '').trim();
  return Array.from(new Set([cleaned, withoutCareskillsSuffix].filter(Boolean).map(normalizeKey)));
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

  const m = raw.match(/^(\d{1,2})[\/\.\-](\d{1,2})[\/\.\-](\d{2}|\d{4})$/);
  if (!m) return null;

  const day = Number(m[1]);
  const month = Number(m[2]);
  let year = Number(m[3]);
  if (year < 100) year += 2000;
  if (!day || !month || !year) return null;

  const dt = new Date(Date.UTC(year, month - 1, day));
  if (dt.getUTCFullYear() !== year || dt.getUTCMonth() !== month - 1 || dt.getUTCDate() !== day) return null;

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

function parseExpiryCell(value: string): { expiryMonths: number | null; neverExpires: boolean } {
  const raw = cleanCell(value).toLowerCase();
  if (!raw) return { expiryMonths: null, neverExpires: false };
  if (/one[-\s]*off|oneoff|one off/.test(raw)) {
    return { expiryMonths: null, neverExpires: true };
  }
  const yearMatch = raw.match(/(\d+)\s*(years|year|yrs|yr)\b/);
  if (yearMatch) {
    return { expiryMonths: Number(yearMatch[1]) * 12, neverExpires: false };
  }
  const monthMatch = raw.match(/(\d+)\s*(months|month|m)\b/);
  if (monthMatch) {
    return { expiryMonths: Number(monthMatch[1]), neverExpires: false };
  }
  const numberMatch = raw.match(/^(\d+)$/);
  if (numberMatch) {
    return { expiryMonths: Number(numberMatch[1]), neverExpires: false };
  }
  return { expiryMonths: null, neverExpires: false };
}

type InterpretedCell =
  | { kind: 'empty' }
  | { kind: 'status'; status: string }
  | { kind: 'date'; dateIso: string }
  | { kind: 'invalid'; raw: string };

function interpretCell(value: string): InterpretedCell {
  const v = cleanCell(value);
  if (!v) return { kind: 'empty' };

  const dateMatch = v.match(/\b(\d{1,2}[\/\.-]\d{1,2}[\/\.-](?:\d{2}|\d{4}))\b/);
  if (dateMatch) {
    const dateIso = parseDdMmYyyy(dateMatch[1]);
    if (dateIso) return { kind: 'date', dateIso };
  }

  const lower = v.toLowerCase();
  if (lower === 'allocated' || lower === 'booked' || lower === 'awaiting' || lower === 'appointment' || lower === 'enrolled' || lower === 'in progress') return { kind: 'status', status: 'allocated' };
  if (lower === 'completed' || lower === 'complete' || lower === 'passed') return { kind: 'status', status: 'completed' };
  if (lower === 'not yet due' || lower === 'not yet due.') return { kind: 'status', status: 'not_yet_due' };
  if (lower === 'n/a' || lower === 'na' || lower === 'not applicable') return { kind: 'status', status: 'na' };

  const dateIso = parseDdMmYyyy(v);
  if (dateIso) return { kind: 'date', dateIso };

  return { kind: 'invalid', raw: v };
}

export async function POST(request: NextRequest) {
  try {
    const authz = await requireRole(['admin']);
    if ('error' in authz) return authz.error;

    const form = await request.formData();
    const locationId = String(form.get('locationId') || '').trim();
    const replaceMissing = String(form.get('replaceMissing') || '').trim().toLowerCase() === '1' || String(form.get('replaceMissing') || '').trim().toLowerCase() === 'true';
    const allowNewStaff = String(form.get('allowNewStaff') || '').trim().toLowerCase() === '1' || String(form.get('allowNewStaff') || '').trim().toLowerCase() === 'true';
    const allowNewCourses = String(form.get('allowNewCourses') || '').trim().toLowerCase() === '1' || String(form.get('allowNewCourses') || '').trim().toLowerCase() === 'true';
    const file = form.get('file');

    if (!locationId) {
      return NextResponse.json({ error: 'Missing locationId' }, { status: 400 });
    }
    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'Missing CSV file' }, { status: 400 });
    }

    const { data: locationRow, error: locationNameErr } = await authz.service
      .from('locations')
      .select('name')
      .eq('id', locationId)
      .single();
    const locationName = locationNameErr ? '' : String(locationRow?.name || '');

    const csvText = await file.text();
    const rows = parseLogicalRows(csvText, 100000);

    const headerIdx = rows.findIndex((r) => {
      const first = cleanCell(r[0] || '').toLowerCase();
      return first === 'staff name' || first === 'learner name' || first === "learner's name";
    });

    if (headerIdx < 0) {
      return NextResponse.json({ error: 'Could not find header row (Staff Name)' }, { status: 400 });
    }

    const categoryRow = rows[headerIdx - 1] || [];
    const expiryRowIndex = rows.findIndex((row, idx) => idx > headerIdx && cleanCell(row[0] || '').toLowerCase().includes('date valid for'));
    const expiryRow = expiryRowIndex >= 0 ? rows[expiryRowIndex] : rows[headerIdx + 2] || rows[headerIdx + 1] || [];
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
      clearedCells: 0,
      skippedUnknownStaff: 0,
      skippedUnknownCourses: 0,
      createdProfiles: 0,
      createdCourses: 0,
      linkedStaffLocations: 0,
      linkedCourseLinks: 0,
      errors: 0,
    };

    const unknownStaffSamples = new Set<string>();
    const errorMessages = new Set<string>();

    const dividerLabels = new Set<string>([
      'notes',
      'date valid for',
      'management',
      'managers',
      'team leader',
      'team leaders',
      'lead support',
      'leaders',
      'staff',
      'staff team',
      'staff on probation',
      'inactive staff',
      'staff on maternity',
      'bank staff',
      'mangers',
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

    // Load staff + courses for this location.
    const { data: staffRows, error: staffErr } = await authz.service
      .from('profiles')
      .select('id, full_name')
      .eq('is_deleted', false);

    if (staffErr) return NextResponse.json({ error: staffErr.message }, { status: 400 });
    const staffMap = new Map<string, string>();
    (staffRows || []).forEach((s: StaffRow) => {
      if (!s?.id || !s?.full_name) return;
      staffMap.set(normalizeStaffName(String(s.full_name)), String(s.id));
    });

    const { data: existingDividers, error: existingDividersErr } = await authz.service
      .from('location_matrix_dividers')
      .select('id, name')
      .eq('location_id', locationId);

    const existingDividerMap = new Map<string, { id: string; name: string }>();
    if (!existingDividersErr) {
      (existingDividers || []).forEach((d: DividerRow) => {
        if (!d?.id || !d?.name) return;
        existingDividerMap.set(normalizeKey(String(d.name)), { id: String(d.id), name: String(d.name) });
      });
    }

    // Courses configured for the selected location.
    const { data: locationCourses, error: courseErr } = await authz.service
      .from('location_training_courses')
      .select('training_course_id, training_courses(id, name, careskills_name, expiry_months, never_expires)')
      .eq('location_id', locationId);

    if (courseErr) return NextResponse.json({ error: courseErr.message }, { status: 400 });

    const courseMap = new Map<string, { id: string; expiryMonths: number | null; neverExpires: boolean | null }>();
    (locationCourses || []).forEach((lc: LocationCourseRow) => {
      const c = Array.isArray(lc.training_courses) ? lc.training_courses[0] : lc.training_courses;
      if (!c?.id || !c?.name) return;
      for (const alias of [c.name, c.careskills_name].filter((name): name is string => Boolean(name))) {
        for (const key of courseNameAliases(String(alias))) {
          courseMap.set(key, {
            id: String(c.id),
            expiryMonths: typeof c.expiry_months === 'number' ? c.expiry_months : null,
            neverExpires: typeof c.never_expires === 'boolean' ? c.never_expires : null,
          });
        }
      }
    });

    const { data: allTrainingCourses, error: allCoursesErr } = await authz.service
      .from('training_courses')
      .select('id, name, careskills_name, expiry_months, never_expires, category');
    if (allCoursesErr) return NextResponse.json({ error: allCoursesErr.message }, { status: 400 });

    const globalCourseMap = new Map<string, { id: string; expiryMonths: number | null; neverExpires: boolean | null; category: string | null }>();
    (allTrainingCourses || []).forEach((c: TrainingCourseRow) => {
      if (!c?.id || !c?.name) return;
      for (const alias of [c.name, c.careskills_name].filter((name): name is string => Boolean(name))) {
        for (const key of courseNameAliases(String(alias))) {
          globalCourseMap.set(key, {
            id: String(c.id),
            expiryMonths: typeof c.expiry_months === 'number' ? c.expiry_months : null,
            neverExpires: typeof c.never_expires === 'boolean' ? c.never_expires : null,
            category: typeof c.category === 'string' ? c.category : null,
          });
        }
      }
    });

    const unknownCourseColumns: string[] = [];
    const requiresCourseApproval = new Set<string>();
    const requiresStaffApproval = new Set<string>();

    // Build the CSV header metadata map for course columns.
    for (const header of courseNames) {
      const normalizedHeader = normalizeKey(header);
      if (!normalizedHeader) continue;
      if (ignoredMetaColumns.has(normalizedHeader)) continue;
      if (courseMap.has(normalizedHeader)) continue;

      if (!allowNewCourses) {
        requiresCourseApproval.add(header);
        if (!unknownCourseColumns.includes(header)) unknownCourseColumns.push(header);
        continue;
      }

      // Ensure training_courses row exists
      const { data: existingCourse, error: existingCourseErr } = await authz.service
        .from('training_courses')
        .select('id, expiry_months, never_expires')
        .eq('name', header)
        .maybeSingle();

      if (existingCourseErr) {
        if (errorMessages.size < 10) errorMessages.add(existingCourseErr.message);
        continue;
      }

      let courseId = existingCourse?.id ? String(existingCourse.id) : '';
      let expiryMonths: number | null =
        typeof existingCourse?.expiry_months === 'number' ? existingCourse.expiry_months : 12;
      let neverExpires: boolean | null =
        typeof existingCourse?.never_expires === 'boolean' ? existingCourse.never_expires : false;

      if (!courseId) {
        const { data: inserted, error: insertErr } = await authz.service
          .from('training_courses')
          .insert([{ name: header, expiry_months: 12, never_expires: false }])
          .select('id, expiry_months, never_expires')
          .single();
        const createdCourse = inserted;
        if (insertErr || !createdCourse?.id) {
          if (errorMessages.size < 10) errorMessages.add(String(insertErr?.message || `Could not create course ${header}`));
          continue;
        }
        courseId = String(inserted.id);
        expiryMonths = typeof inserted.expiry_months === 'number' ? inserted.expiry_months : 12;
        neverExpires = typeof inserted.never_expires === 'boolean' ? inserted.never_expires : false;
      }

      // Link to location
      const linkRes = await authz.service
        .from('location_training_courses')
        .upsert([{ location_id: locationId, training_course_id: courseId, display_order: 9999 }], {
          onConflict: 'location_id,training_course_id',
        });
      if (linkRes.error) {
        if (errorMessages.size < 10) errorMessages.add(linkRes.error.message);
        continue;
      }

      courseMap.set(normalizedHeader, { id: courseId, expiryMonths, neverExpires });
    }

    const colToCourse: Array<{ col: number; courseId: string; displayOrder: number; expiryMonths: number | null; neverExpires: boolean | null } | null> = [];
    for (let idx = 0; idx < courseNames.length; idx += 1) {
      const name = courseNames[idx];
      const normalizedHeader = normalizeKey(name);
      if (!normalizedHeader || ignoredMetaColumns.has(normalizedHeader)) {
        colToCourse.push(null);
        continue;
      }

      const category = cleanCell(String(categoryRow[idx + 1] || '')) || null;
      const expiryInfo = parseExpiryCell(String(expiryRow[idx + 1] || ''));
      let hit = courseMap.get(normalizedHeader);
      const globalHit = globalCourseMap.get(normalizedHeader);

      if (!hit && globalHit) {
        hit = { id: globalHit.id, expiryMonths: globalHit.expiryMonths, neverExpires: globalHit.neverExpires };
      }

      if (!hit) {
        if (!allowNewCourses) {
          colToCourse.push(null);
          if (!unknownCourseColumns.includes(name)) unknownCourseColumns.push(name);
          continue;
        }

        const upsertPayload: CourseUpdatePayload & { name: string } = {
          name,
          expiry_months: expiryInfo.expiryMonths ?? 12,
          never_expires: expiryInfo.neverExpires,
        };
        if (category) upsertPayload.category = category;

        let inserted: CourseInsertResult | null = null;
        let insertErr: { code?: string; message?: string } | null = null;

        const initialInsert = await authz.service
          .from('training_courses')
          .insert([upsertPayload])
          .select('id, expiry_months, never_expires, category')
          .single();

        inserted = initialInsert.data;
        insertErr = initialInsert.error;

        if (
          insertErr &&
          (insertErr.code === '42703' || String(insertErr.message || '').includes('category'))
        ) {
          const { category: _ignoredCategory, ...payloadWithoutCategory } = upsertPayload;
          const retryInsert = await authz.service
            .from('training_courses')
            .insert([payloadWithoutCategory])
            .select('id, expiry_months, never_expires')
            .single();
          inserted = retryInsert.data;
          insertErr = retryInsert.error;
        }

        const createdCourse = inserted;
        if (insertErr || !createdCourse?.id) {
          if (errorMessages.size < 10) errorMessages.add(String(insertErr?.message || `Could not create course ${name}`));
          colToCourse.push(null);
          if (!unknownCourseColumns.includes(name)) unknownCourseColumns.push(name);
          continue;
        }

        hit = {
          id: String(createdCourse.id),
          expiryMonths: typeof createdCourse.expiry_months === 'number' ? createdCourse.expiry_months : null,
          neverExpires: typeof createdCourse.never_expires === 'boolean' ? createdCourse.never_expires : false,
        };
        summary.createdCourses += 1;

        globalCourseMap.set(normalizedHeader, {
          id: hit.id,
          expiryMonths: hit.expiryMonths,
          neverExpires: hit.neverExpires,
          category: typeof createdCourse.category === 'string' ? createdCourse.category : category,
        });
      }

      if (!courseMap.has(normalizedHeader)) {
        courseMap.set(normalizedHeader, { id: hit.id, expiryMonths: hit.expiryMonths, neverExpires: hit.neverExpires });
      }

      const courseUpdates: CourseUpdatePayload = {};
      if (expiryInfo.neverExpires !== hit.neverExpires || (expiryInfo.expiryMonths !== null && expiryInfo.expiryMonths !== hit.expiryMonths)) {
        courseUpdates.expiry_months = expiryInfo.neverExpires ? 9999 : expiryInfo.expiryMonths ?? hit.expiryMonths ?? 12;
        courseUpdates.never_expires = expiryInfo.neverExpires;
      }
      const currentCategory = globalCourseMap.get(normalizedHeader)?.category;
      if (category && category !== currentCategory) {
        courseUpdates.category = category;
      }

      if (Object.keys(courseUpdates).length > 0) {
        let { error: updateCourseErr } = await authz.service
          .from('training_courses')
          .update(courseUpdates)
          .eq('id', hit.id);

        if (
          updateCourseErr &&
          (updateCourseErr.code === '42703' || String(updateCourseErr.message || '').includes('category'))
        ) {
          const { category: _ignored, ...updatesWithoutCategory } = courseUpdates;
          if (Object.keys(updatesWithoutCategory).length > 0) {
            const retryUpdate = await authz.service
              .from('training_courses')
              .update(updatesWithoutCategory)
              .eq('id', hit.id);
            updateCourseErr = retryUpdate.error;
          }
        }

        if (!updateCourseErr) {
          const existing = globalCourseMap.get(normalizedHeader);
          if (existing) {
            if (courseUpdates.expiry_months !== undefined) existing.expiryMonths = courseUpdates.expiry_months;
            if (courseUpdates.never_expires !== undefined) existing.neverExpires = courseUpdates.never_expires;
            if (courseUpdates.category !== undefined) existing.category = courseUpdates.category;
          }
        }
      }

      colToCourse.push({
        col: idx + 1,
        courseId: hit.id,
        displayOrder: idx + 1,
        expiryMonths: hit.expiryMonths,
        neverExpires: hit.neverExpires,
      });
    }

    courseNames.forEach((name, idx) => {
      const normalizedHeader = normalizeKey(name);
      if (!normalizedHeader) return;
      if (ignoredMetaColumns.has(normalizedHeader)) return;
      if (colToCourse[idx] === null) {
        if (!unknownCourseColumns.includes(name)) unknownCourseColumns.push(name);
      }
    });

    summary.skippedUnknownCourses = unknownCourseColumns.length;

    const relevantCourseIds = Array.from(
      new Set(
        colToCourse
          .filter((mapping): mapping is NonNullable<typeof mapping> => Boolean(mapping))
          .map((mapping) => mapping.courseId)
      )
    );

    const existingRecordMap = new Map<string, { id: string }>();
    if (replaceMissing && relevantCourseIds.length > 0) {
      const { data: existingRows, error: existingErr } = await authz.service
        .from('staff_training_matrix')
        .select('id, staff_id, course_id')
        .eq('completed_at_location_id', locationId)
        .in('course_id', relevantCourseIds);

      if (existingErr) {
        summary.errors++;
        if (errorMessages.size < 10) errorMessages.add(existingErr.message);
      } else {
        (existingRows || []).forEach((row: TrainingMatrixRow) => {
          if (!row?.id || !row?.staff_id || !row?.course_id) return;
          existingRecordMap.set(`${row.staff_id}|${row.course_id}`, { id: String(row.id) });
        });
      }
    }

    // Update course display_order from CSV column positions
    const courseDisplayOrderUpdates: Array<{ locationId: string; courseId: string; displayOrder: number }> = [];
    for (const mapping of colToCourse) {
      if (!mapping) continue;
      courseDisplayOrderUpdates.push({ locationId, courseId: mapping.courseId, displayOrder: mapping.displayOrder });
    }

    // Batch update or insert location_training_courses with display_order from CSV
    for (const update of courseDisplayOrderUpdates) {
      const { error: linkError } = await authz.service
        .from('location_training_courses')
        .upsert(
          [{ location_id: update.locationId, training_course_id: update.courseId, display_order: update.displayOrder }],
          { onConflict: 'location_id,training_course_id' }
        );
      if (linkError) {
        if (errorMessages.size < 10) errorMessages.add(linkError.message);
      } else {
        summary.linkedCourseLinks += 1;
      }
    }

    const upserts: TrainingUpsert[] = [];
    const seenTrainingKeys = new Set<string>();
    const staffDisplayOrderUpdates: Map<string, number> = new Map();
    let staffRowPosition = 1;

    for (const row of dataRows) {
      const staffName = cleanCell(row[0] || '');
      if (!staffName) continue;

      const normalizedStaffName = normalizeKey(staffName);
      if (dividerLabels.has(normalizedStaffName)) {
        const displayOrder = staffRowPosition;
        staffRowPosition += 1;

        const existingDivider = existingDividerMap.get(normalizedStaffName);
        if (existingDivider) {
          const { error: dividerUpdateError } = await authz.service
            .from('location_matrix_dividers')
            .update({ display_order: displayOrder })
            .eq('id', existingDivider.id);
          if (dividerUpdateError) {
            if (errorMessages.size < 10) errorMessages.add(dividerUpdateError.message);
          }
        } else {
          const { data: insertedDivider, error: insertDividerError } = await authz.service
            .from('location_matrix_dividers')
            .insert([
              {
                location_id: locationId,
                name: staffName,
                display_order: displayOrder,
              },
            ])
            .select('id')
            .single();

          if (insertDividerError || !insertedDivider?.id) {
            if (errorMessages.size < 10) errorMessages.add(insertDividerError?.message || `Could not create divider ${staffName}`);
          } else {
            existingDividerMap.set(normalizedStaffName, { id: String(insertedDivider.id), name: staffName });
          }
        }

        continue;
      }

      let staffId = staffMap.get(normalizeStaffName(staffName));
      if (!staffId) {
        if (allowNewStaff) {
          const { data: createdProfile, error: createdProfileError } = await authz.service
            .from('profiles')
            .insert([
              {
                full_name: staffName,
                location: locationName,
                role_tier: 'staff',
                is_deleted: false,
              },
            ])
            .select('id')
            .single();

          if (createdProfileError || !createdProfile?.id) {
            summary.errors++;
            if (errorMessages.size < 10) errorMessages.add(`Could not create profile for ${staffName}: ${createdProfileError?.message || 'unknown error'}`);
            staffRowPosition += 1;
            continue;
          }

          staffId = String(createdProfile.id);
          staffMap.set(normalizeStaffName(staffName), staffId);
          summary.createdProfiles += 1;
        } else {
          requiresStaffApproval.add(staffName);
          summary.skippedUnknownStaff++;
          if (unknownStaffSamples.size < 25) unknownStaffSamples.add(staffName);
          staffRowPosition += 1;
          continue;
        }
      }

      // Track staff display order from CSV row position
      if (!staffDisplayOrderUpdates.has(staffId)) {
        staffDisplayOrderUpdates.set(staffId, staffRowPosition);
        staffRowPosition += 1;
      }

      for (const mapping of colToCourse) {
        if (!mapping) continue;
        const raw = String(row[mapping.col] || '');
        const interpreted = interpretCell(raw);
        if (interpreted.kind === 'invalid') {
          summary.errors++;
          if (errorMessages.size < 10) errorMessages.add(`Invalid cell value "${raw}" for ${staffName}`);
          continue;
        }

        const courseId = mapping.courseId;

        if (interpreted.kind === 'date') {
          const expiryDateIso = computeExpiryDateIso(interpreted.dateIso, mapping.expiryMonths, mapping.neverExpires);
          const key = `${staffId}|${courseId}`;
          if (seenTrainingKeys.has(key)) {
            const existingIndex = upserts.findIndex((item) => `${item.staff_id}|${item.course_id}` === key);
            if (existingIndex >= 0 && upserts[existingIndex].status !== 'completed') {
              upserts[existingIndex] = {
                staff_id: staffId,
                course_id: courseId,
                completion_date: interpreted.dateIso,
                expiry_date: expiryDateIso,
                status: 'completed',
                completed_at_location_id: locationId,
              };
            }
            continue;
          }
          seenTrainingKeys.add(key);

          upserts.push({
            staff_id: staffId,
            course_id: courseId,
            completion_date: interpreted.dateIso,
            expiry_date: expiryDateIso,
            status: 'completed',
            completed_at_location_id: locationId,
          });
          summary.processedCells += 1;
          summary.upserts += 1;
        } else if (interpreted.kind === 'status') {
          const dateInStatus = raw.match(/\b(\d{1,2}[\/\.-]\d{1,2}[\/\.-](?:\d{2}|\d{4}))\b/);
          if (dateInStatus) {
            const embeddedDate = parseDdMmYyyy(dateInStatus[1]);
            if (embeddedDate) {
              const expiryDateIso = computeExpiryDateIso(embeddedDate, mapping.expiryMonths, mapping.neverExpires);
              const key = `${staffId}|${courseId}`;
              if (seenTrainingKeys.has(key)) {
                const existingIndex = upserts.findIndex((item) => `${item.staff_id}|${item.course_id}` === key);
                if (existingIndex >= 0 && upserts[existingIndex].status !== 'completed') {
                  upserts[existingIndex] = {
                    staff_id: staffId,
                    course_id: courseId,
                    completion_date: embeddedDate,
                    expiry_date: expiryDateIso,
                    status: 'completed',
                    completed_at_location_id: locationId,
                  };
                }
                continue;
              }
              seenTrainingKeys.add(key);

              upserts.push({
                staff_id: staffId,
                course_id: courseId,
                completion_date: embeddedDate,
                expiry_date: expiryDateIso,
                status: 'completed',
                completed_at_location_id: locationId,
              });
              summary.processedCells += 1;
              summary.upserts += 1;
              continue;
            }
          }

          const key = `${staffId}|${courseId}`;
          if (seenTrainingKeys.has(key)) continue;
          seenTrainingKeys.add(key);

          upserts.push({
            staff_id: staffId,
            course_id: courseId,
            completion_date: null,
            expiry_date: null,
            status: interpreted.status as TrainingUpsert['status'],
            completed_at_location_id: locationId,
          });
          summary.processedCells += 1;
          summary.upserts += 1;
        }
      }
    }

    if (upserts.length > 0) {
      const chunkSize = 500;
      for (let i = 0; i < upserts.length; i += chunkSize) {
        const chunk = upserts.slice(i, i + chunkSize);
        let { error: upsertError } = await authz.service
          .from('staff_training_matrix')
          .upsert(chunk, {
            onConflict: 'staff_id,course_id,completed_at_location_id',
          });
        if (upsertError?.code === '42P10') {
          const fallback = await authz.service
            .from('staff_training_matrix')
            .upsert(chunk, { onConflict: 'staff_id,course_id' });
          upsertError = fallback.error;
        }
        if (upsertError) {
          summary.errors += chunk.length;
          if (errorMessages.size < 10) errorMessages.add(upsertError.message);
        } else {
          summary.linkedStaffLocations += chunk.length;
        }
      }
    }

    return NextResponse.json(
      {
        ok: true,
        success: summary.errors === 0,
        summary,
        errorMessages: Array.from(errorMessages),
        unknownStaff: Array.from(unknownStaffSamples).slice(0, 25),
        requiresCourseApproval: Array.from(requiresCourseApproval),
        requiresStaffApproval: Array.from(requiresStaffApproval),
      },
      { status: 200 }
    );
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
