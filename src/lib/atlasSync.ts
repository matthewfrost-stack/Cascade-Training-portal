import { addMonths } from 'date-fns';
import { createServiceClient } from '@/lib/apiAuth';

type JsonRecord = Record<string, unknown>;

type AtlasCompletedCourse = {
  staffName: string;
  staffEmail: string | null;
  courseName: string;
  completionDate: string;
};

type StaffRow = {
  id: string;
  full_name: string | null;
  email: string | null;
  is_deleted?: boolean | null;
};

type CourseRow = {
  id: string;
  name: string;
  careskills_name?: string | null;
  expiry_months?: number | null;
  never_expires?: boolean | null;
};

type MatrixRow = {
  id: string;
  staff_id: string;
  course_id: string;
  completion_date: string | null;
  expiry_date: string | null;
  status: string | null;
  completed_at_location_id?: string | null;
  training_courses?: CourseRow | CourseRow[] | null;
};

type StaffLocationRow = {
  staff_id?: string | null;
  location_id?: string | null;
};

type CourseLocationRow = {
  location_id?: string | null;
  training_course_id?: string | null;
};

type AtlasSyncOptions = {
  dryRun?: boolean;
};

export type AtlasSyncSummary = {
  fetched: number;
  completed: number;
  updated: number;
  created: number;
  unchanged: number;
  skippedStaff: number;
  skippedCourses: number;
  skippedRecords: number;
  ambiguousStaff: number;
  ambiguousCourses: number;
  errors: number;
  dryRun: boolean;
  skipped: Array<{ reason: string; staff?: string; course?: string }>;
};

type IHascoResult = {
  completed_at?: string | null;
  status?: string | number | null;
  test_score?: number | string | null;
  expires_at?: string | null;
  course?: {
    id?: string | number | null;
    title?: string | null;
    is_archived?: boolean | number | string | null;
  } | null;
};

type IHascoUser = {
  id?: string | number | null;
  first_name?: string | null;
  last_name?: string | null;
  status?: string | null;
  results?: IHascoResult[] | null;
};

type IHascoResponse = {
  data?: {
    users?: {
      data?: IHascoUser[] | null;
      paginatorInfo?: {
        currentPage?: number | null;
        hasMorePages?: boolean | null;
        lastPage?: number | null;
      } | null;
    } | null;
  } | null;
  errors?: Array<{ message?: string | null }>;
};

const MAX_API_PAGES = 100;
const REQUEST_TIMEOUT_MS = 30_000;
const ATLAS_PAGE_CONCURRENCY = 5;
const SUPABASE_PAGE_SIZE = 1000;

function asRecord(value: unknown): JsonRecord | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as JsonRecord
    : null;
}

async function fetchAllRows(
  service: ReturnType<typeof createServiceClient>,
  table: string,
  selectClause: string
): Promise<JsonRecord[]> {
  const rows: JsonRecord[] = [];
  let from = 0;

  while (true) {
    const { data, error } = await service
      .from(table)
      .select(selectClause)
      .range(from, from + SUPABASE_PAGE_SIZE - 1);
    if (error) throw new Error(`Could not load ${table}: ${error.message}`);

    const page = (data || []) as unknown as JsonRecord[];
    rows.push(...page);
    if (page.length < SUPABASE_PAGE_SIZE) break;
    from += SUPABASE_PAGE_SIZE;
  }

  return rows;
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function normalizeName(value: string): string {
  return value
    .normalize('NFKC')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

function courseNameAliases(value: string): string[] {
  const cleaned = value
    .normalize('NFKC')
    .trim()
    .replace(/\s+/g, ' ');
  const withoutCareskillsSuffix = cleaned.replace(/\s*\(careskills\)\s*$/i, '').trim();
  const withCareskillsSuffix = withoutCareskillsSuffix
    ? `${withoutCareskillsSuffix} (Careskills)`
    : '';
  return Array.from(new Set(
    [cleaned, withoutCareskillsSuffix, withCareskillsSuffix]
      .filter(Boolean)
      .map(normalizeName)
  ));
}

function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

function getNestedRecord(record: JsonRecord, keys: string[]): JsonRecord | null {
  for (const key of keys) {
    const nested = asRecord(record[key]);
    if (nested) return nested;
  }
  return null;
}

function getFirstString(record: JsonRecord, keys: string[]): string | null {
  for (const key of keys) {
    const value = asString(record[key]);
    if (value) return value;
  }
  return null;
}

function extractName(record: JsonRecord, directKeys: string[]): string | null {
  const direct = getFirstString(record, directKeys);
  if (direct) return direct;

  const directFirstName = getFirstString(record, ['first_name', 'firstName']);
  const directLastName = getFirstString(record, ['last_name', 'lastName']);
  if (directFirstName || directLastName) return `${directFirstName || ''} ${directLastName || ''}`.trim();

  const nested = getNestedRecord(record, ['staff', 'employee', 'person', 'user', 'teacher', 'learner']);
  if (!nested) return null;

  const nestedName = getFirstString(nested, ['name', 'full_name', 'fullName', 'display_name', 'displayName']);
  if (nestedName) return nestedName;

  const firstName = getFirstString(nested, ['first_name', 'firstName']);
  const lastName = getFirstString(nested, ['last_name', 'lastName']);
  return firstName && lastName ? `${firstName} ${lastName}` : firstName || lastName;
}

function extractEmail(record: JsonRecord): string | null {
  const direct = getFirstString(record, ['staffEmail', 'staff_email', 'employeeEmail', 'employee_email', 'email']);
  if (direct) return direct;
  return getFirstString(getNestedRecord(record, ['staff', 'employee', 'person', 'user', 'teacher', 'learner']) || {}, ['email', 'email_address', 'emailAddress']);
}

function extractCourseName(record: JsonRecord): string | null {
  const direct = getFirstString(record, ['courseName', 'course_name', 'trainingCourseName', 'training_course_name', 'course', 'training_course']);
  if (direct) return direct;

  const nested = getNestedRecord(record, ['course', 'training_course', 'trainingCourse', 'course_record']);
  return nested ? getFirstString(nested, ['name', 'title', 'course_name', 'courseName']) : null;
}

function extractCompletionDate(record: JsonRecord): string | null {
  return getFirstString(record, [
    'completionDate',
    'completion_date',
    'completedAt',
    'completed_at',
    'dateCompleted',
    'date_completed',
    'completed_on',
    'passed_at',
  ]);
}

function isCompleted(record: JsonRecord): boolean {
  if (process.env.ATLAS_COMPLETED_ONLY !== 'false') return true;

  const status = getFirstString(record, ['status', 'completionStatus', 'completion_status', 'state']);
  const completed = record.completed;
  return status?.toLowerCase() === 'completed' || completed === true;
}

function parseDate(value: string): string | null {
  const raw = value.trim();
  const dayFirst = raw.match(/^(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{4})$/);
  if (dayFirst) {
    const [, day, month, year] = dayFirst;
    const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
    if (
      date.getUTCFullYear() !== Number(year)
      || date.getUTCMonth() !== Number(month) - 1
      || date.getUTCDate() !== Number(day)
    ) return null;
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  }

  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!iso) return null;
  const [, year, month, day] = iso;
  const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
  if (
    date.getUTCFullYear() !== Number(year)
    || date.getUTCMonth() !== Number(month) - 1
    || date.getUTCDate() !== Number(day)
  ) return null;
  return `${year}-${month}-${day}`;
}

function calculateExpiryDate(completionDate: string, course: CourseRow): string | null {
  if (course.never_expires || !course.expiry_months || course.expiry_months === 9999) return null;
  const date = addMonths(new Date(`${completionDate}T00:00:00Z`), course.expiry_months);
  return date.toISOString().slice(0, 10);
}

function isArchived(value: boolean | number | string | null | undefined): boolean {
  return value === true || value === 1 || String(value || '').toLowerCase() === 'true';
}

function isPassed(result: IHascoResult): boolean {
  const status = String(result.status ?? '').toLowerCase();
  const statusPassed = status === 'passed' || status === 'pass' || status === 'completed' || Number(result.status) === 150;
  const scorePassed = result.test_score !== null
    && result.test_score !== undefined
    && Number(result.test_score) >= 80;
  return statusPassed || scorePassed;
}

const GRAPHQL_QUERY = (page: number) => `{
  users(page: ${page}, first: 50) {
    data {
      id
      first_name
      last_name
      status
      results {
        completed_at
        status
        test_score
        expires_at
        course {
          id
          title
          is_archived
        }
      }
    }
    paginatorInfo {
      currentPage
      hasMorePages
      lastPage
    }
  }
}`;

async function fetchAtlasPage(page: number, endpoint: string, token: string): Promise<IHascoResponse['data']> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  let response: Response;

  try {
    response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query: GRAPHQL_QUERY(page) }),
      cache: 'no-store',
      signal: controller.signal,
    });
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error(`iHasco request timed out while loading page ${page}.`);
    }
    throw new Error(`Could not connect to iHasco while loading page ${page}.`);
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    const detail = (await response.text()).slice(0, 300);
    throw new Error(`iHasco API returned ${response.status}: ${detail || response.statusText}`);
  }

  const payload = await response.json() as IHascoResponse;
  const schemaError = payload.errors?.find((error) => error.message)?.message;
  if (schemaError) throw new Error(`iHasco GraphQL error: ${schemaError}`);
  return payload.data;
}

async function fetchAtlasCompletedRecords(): Promise<unknown[]> {
  const endpoint = process.env.ATLAS_GRAPHQL_URL || 'https://api.ihasco.co.uk/graphql';
  const token = process.env.ATLAS_API_TOKEN || process.env.ATLAS_API_KEY;
  if (!token) {
    throw new Error('Atlas sync is not configured. Set ATLAS_API_TOKEN.');
  }

  const records: unknown[] = [];
  const processUsers = (users: IHascoUser[]) => {
    for (const user of users) {
      const userId = user.id === null || user.id === undefined ? '' : String(user.id);
      if (!userId) continue;

      const userStatus = String(user.status || '').toLowerCase();
      if (userStatus === 'archived' || userStatus === 'inactive' || userStatus === 'disabled') continue;

      const staffName = `${user.first_name || ''} ${user.last_name || ''}`.trim();
      if (!staffName) continue;

      const results = Array.isArray(user.results) ? user.results : [];
      for (const result of results) {
        if (!result.completed_at || !result.course?.id) continue;
        // A passed result remains authoritative even if Atlas later removes the
        // user's current enrolment. Filtering by current enrolments caused
        // historic completions to disappear from the sync.
        if (isArchived(result.course.is_archived)) continue;
        if (!isPassed(result)) continue;

        records.push({
          staffName,
          courseName: result.course.title || `Course #${result.course.id}`,
          completionDate: result.completed_at,
          completed: true,
        });
      }
    }
  };

  const firstPage = await fetchAtlasPage(1, endpoint, token);
  const firstUsersPage = firstPage?.users;
  processUsers(firstUsersPage?.data || []);

  const firstPaginator = firstUsersPage?.paginatorInfo;
  const lastPage = firstPaginator?.lastPage;
  if (typeof lastPage === 'number') {
    if (lastPage > MAX_API_PAGES) throw new Error(`iHasco pagination exceeded ${MAX_API_PAGES} pages.`);

    for (let startPage = 2; startPage <= lastPage; startPage += ATLAS_PAGE_CONCURRENCY) {
      const pageNumbers = Array.from(
        { length: Math.min(ATLAS_PAGE_CONCURRENCY, lastPage - startPage + 1) },
        (_, index) => startPage + index
      );
      const pages = await Promise.all(pageNumbers.map((page) => fetchAtlasPage(page, endpoint, token)));
      for (const page of pages) processUsers(page?.users?.data || []);
    }
  } else {
    let page = 2;
    let hasMore = firstPaginator?.hasMorePages === true;
    while (hasMore && page <= MAX_API_PAGES) {
      const nextPage = await fetchAtlasPage(page, endpoint, token);
      processUsers(nextPage?.users?.data || []);
      hasMore = nextPage?.users?.paginatorInfo?.hasMorePages === true;
      page += 1;
    }
    if (hasMore) throw new Error(`iHasco pagination exceeded ${MAX_API_PAGES} pages.`);
  }

  return records;
}

function normalizeCompletedCourses(records: unknown[]): AtlasCompletedCourse[] {
  const normalized: AtlasCompletedCourse[] = [];

  for (const value of records) {
    const record = asRecord(value);
    if (!record || !isCompleted(record)) continue;

    const staffName = extractName(record, ['staffName', 'staff_name', 'employeeName', 'employee_name', 'learnerName', 'learner_name']);
    const courseName = extractCourseName(record);
    const rawDate = extractCompletionDate(record);
    const completionDate = rawDate ? parseDate(rawDate) : null;
    if (!staffName || !courseName || !completionDate) continue;

    normalized.push({
      staffName,
      staffEmail: extractEmail(record),
      courseName,
      completionDate,
    });
  }

  return normalized;
}

function deduplicateRecords(records: AtlasCompletedCourse[]): AtlasCompletedCourse[] {
  const byKey = new Map<string, AtlasCompletedCourse>();
  for (const record of records) {
    const key = `${normalizeEmail(record.staffEmail || '')}|${normalizeName(record.staffName)}|${normalizeName(record.courseName)}`;
    const previous = byKey.get(key);
    if (!previous || record.completionDate > previous.completionDate) byKey.set(key, record);
  }
  return Array.from(byKey.values());
}

function getCourseRelation(row: MatrixRow): CourseRow | null {
  return Array.isArray(row.training_courses) ? row.training_courses[0] || null : row.training_courses || null;
}

function addSkipped(summary: AtlasSyncSummary, reason: string, staff?: string, course?: string): void {
  summary.skippedRecords += 1;
  if (summary.skipped.length < 50) summary.skipped.push({ reason, staff, course });
}

export async function runAtlasCompletedCourseSync(options: AtlasSyncOptions = {}): Promise<AtlasSyncSummary> {
  const rawRecords = await fetchAtlasCompletedRecords();
  const completedRecords = deduplicateRecords(normalizeCompletedCourses(rawRecords));
  const service = createServiceClient();

  const [profiles, courses, matrix, staffLocations, courseLocations] = await Promise.all([
    fetchAllRows(service, 'profiles', 'id, full_name, email, is_deleted'),
    fetchAllRows(service, 'training_courses', 'id, name, careskills_name, expiry_months, never_expires'),
    fetchAllRows(service, 'staff_training_matrix', 'id, staff_id, course_id, completion_date, expiry_date, status, completed_at_location_id'),
    fetchAllRows(service, 'staff_locations', 'staff_id, location_id'),
    fetchAllRows(service, 'location_training_courses', 'location_id, training_course_id'),
  ]);

  const staffByName = new Map<string, StaffRow[]>();
  const staffByEmail = new Map<string, StaffRow[]>();
  for (const staff of (profiles || []) as StaffRow[]) {
    if (staff.is_deleted || !staff.id) continue;
    if (staff.full_name) {
      const key = normalizeName(staff.full_name);
      staffByName.set(key, [...(staffByName.get(key) || []), staff]);
    }
    if (staff.email) {
      const key = normalizeEmail(staff.email);
      staffByEmail.set(key, [...(staffByEmail.get(key) || []), staff]);
    }
  }

  const coursesByName = new Map<string, CourseRow[]>();
  for (const course of (courses || []) as CourseRow[]) {
    if (!course.id || !course.name) continue;
    const aliases = [course.name, course.careskills_name].filter((name): name is string => Boolean(name));
    for (const alias of aliases) {
      for (const key of courseNameAliases(alias)) {
        const existing = coursesByName.get(key) || [];
        if (!existing.some((item) => item.id === course.id)) coursesByName.set(key, [...existing, course]);
      }
    }
  }

  const coursesById = new Map<string, CourseRow>();
  for (const course of (courses || []) as CourseRow[]) {
    if (course.id) coursesById.set(course.id, course);
  }

  const staffLocationIds = new Map<string, Set<string>>();
  for (const row of (staffLocations || []) as StaffLocationRow[]) {
    if (!row.staff_id || !row.location_id) continue;
    const locations = staffLocationIds.get(row.staff_id) || new Set<string>();
    locations.add(row.location_id);
    staffLocationIds.set(row.staff_id, locations);
  }

  const courseLocationIds = new Map<string, Set<string>>();
  for (const row of (courseLocations || []) as CourseLocationRow[]) {
    if (!row.training_course_id || !row.location_id) continue;
    const locations = courseLocationIds.get(row.training_course_id) || new Set<string>();
    locations.add(row.location_id);
    courseLocationIds.set(row.training_course_id, locations);
  }

  const matrixByKey = new Map<string, MatrixRow[]>();
  for (const row of (matrix || []) as MatrixRow[]) {
    const course = getCourseRelation(row);
    const courseWithFallback = course || coursesById.get(row.course_id);
    if (!row.id || !row.staff_id || !row.course_id || !courseWithFallback) continue;
    matrixByKey.set(
      `${row.staff_id}|${row.course_id}`,
      [...(matrixByKey.get(`${row.staff_id}|${row.course_id}`) || []), { ...row, training_courses: courseWithFallback }]
    );
  }

  const summary: AtlasSyncSummary = {
    fetched: rawRecords.length,
    completed: completedRecords.length,
    updated: 0,
    created: 0,
    unchanged: 0,
    skippedStaff: 0,
    skippedCourses: 0,
    skippedRecords: 0,
    ambiguousStaff: 0,
    ambiguousCourses: 0,
    errors: 0,
    dryRun: options.dryRun === true,
    skipped: [],
  };

  const matchedRecords = new Map<string, {
    staffName: string;
    courseName: string;
    staff: StaffRow;
    course: CourseRow;
    completionDate: string;
  }>();

  for (const record of completedRecords) {
    const emailMatches = record.staffEmail ? staffByEmail.get(normalizeEmail(record.staffEmail)) || [] : [];
    const nameMatches = staffByName.get(normalizeName(record.staffName)) || [];
    const staffMatches = emailMatches.length > 0 ? emailMatches : nameMatches;
    if (staffMatches.length === 0) {
      summary.skippedStaff += 1;
      addSkipped(summary, 'staff_not_found', record.staffName, record.courseName);
      continue;
    }
    if (staffMatches.length > 1) {
      summary.ambiguousStaff += 1;
      addSkipped(summary, 'staff_ambiguous', record.staffName, record.courseName);
      continue;
    }

    const candidateCourses = Array.from(new Map(
      courseNameAliases(record.courseName)
        .flatMap((alias) => coursesByName.get(alias) || [])
        .map((course) => [course.id, course] as const)
    ).values());
    const staffLocationSet = staffMatches.length === 1
      ? staffLocationIds.get(staffMatches[0].id) || new Set<string>()
      : new Set<string>();
    const linkedCourseMatches = candidateCourses.filter((course) => {
      const locations = courseLocationIds.get(course.id) || new Set<string>();
      return Array.from(locations).some((locationId) => staffLocationSet.has(locationId));
    });
    const exactCourseMatches = candidateCourses.filter((course) => {
      const normalizedRecordName = normalizeName(record.courseName);
      return normalizeName(course.name) === normalizedRecordName
        || normalizeName(course.careskills_name || '') === normalizedRecordName;
    });
    const courseMatches = linkedCourseMatches.length === 1
      ? linkedCourseMatches
      : linkedCourseMatches.length > 1
        ? (() => {
            const exactLinkedMatches = exactCourseMatches.filter((course) => linkedCourseMatches.some((linked) => linked.id === course.id));
            return exactLinkedMatches.length > 0 ? exactLinkedMatches : linkedCourseMatches;
          })()
        : exactCourseMatches.length > 0
          ? exactCourseMatches
          : candidateCourses;
    if (courseMatches.length === 0) {
      summary.skippedCourses += 1;
      addSkipped(summary, 'course_not_found', record.staffName, record.courseName);
      continue;
    }
    if (courseMatches.length > 1) {
      summary.ambiguousCourses += 1;
      addSkipped(summary, 'course_ambiguous', record.staffName, record.courseName);
      continue;
    }

    const staff = staffMatches[0];
    const course = courseMatches[0];
    const matchedKey = `${staff.id}|${course.id}`;
    const previous = matchedRecords.get(matchedKey);
    if (!previous || record.completionDate > previous.completionDate) {
      matchedRecords.set(matchedKey, {
        staffName: record.staffName,
        courseName: record.courseName,
        staff,
        course,
        completionDate: record.completionDate,
      });
    }
  }

  type PendingWrite = {
    operation: 'update' | 'create';
    payload: Record<string, string | null>;
    staffName: string;
    courseName: string;
  };

  const pendingWrites: PendingWrite[] = [];
  for (const matched of matchedRecords.values()) {
    const { staff, course, staffName, courseName, completionDate } = matched;
    const existingRows = matrixByKey.get(`${staff.id}|${course.id}`) || [];
    const expiryDate = calculateExpiryDate(completionDate, course);
    const existingLocationIds = new Set(
      existingRows
        .map((row) => row.completed_at_location_id)
        .filter((locationId): locationId is string => Boolean(locationId))
    );

    for (const row of existingRows) {
      const unchanged = row.completion_date === completionDate
        && row.expiry_date === expiryDate
        && row.status === 'completed';
      if (unchanged) {
        summary.unchanged += 1;
        continue;
      }

      if (summary.dryRun) {
        summary.updated += 1;
        continue;
      }

      pendingWrites.push({
        operation: 'update',
        payload: {
          id: row.id,
          staff_id: row.staff_id,
          course_id: row.course_id,
          completion_date: completionDate,
          expiry_date: expiryDate,
          status: 'completed',
          completed_at_location_id: row.completed_at_location_id || null,
          updated_at: new Date().toISOString(),
        },
        staffName,
        courseName,
      });
    }

    const assignedStaffLocations = staffLocationIds.get(staff.id) || new Set<string>();
    const assignedCourseLocations = courseLocationIds.get(course.id) || new Set<string>();
    const targetLocationIds = Array.from(assignedStaffLocations)
      .filter((locationId) => assignedCourseLocations.has(locationId));

    for (const locationId of targetLocationIds) {
      if (existingLocationIds.has(locationId)) continue;

      if (summary.dryRun) {
        summary.created += 1;
        continue;
      }

      pendingWrites.push({
        operation: 'create',
        payload: {
          staff_id: staff.id,
          course_id: course.id,
          completion_date: completionDate,
          expiry_date: expiryDate,
          status: 'completed',
          completed_at_location_id: locationId,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        staffName,
        courseName,
      });
    }

    if (existingRows.length === 0 && targetLocationIds.length === 0) {
      addSkipped(summary, 'matrix_record_not_found', staffName, courseName);
    }
  }

  const WRITE_CHUNK_SIZE = 250;
  for (let i = 0; i < pendingWrites.length; i += WRITE_CHUNK_SIZE) {
    const chunk = pendingWrites.slice(i, i + WRITE_CHUNK_SIZE);
    let { error } = await service
      .from('staff_training_matrix')
      .upsert(chunk.map((write) => write.payload), { onConflict: 'staff_id,course_id,completed_at_location_id' });

    if (error?.code === '42P10') {
      const fallback = await service
        .from('staff_training_matrix')
        .upsert(chunk.map((write) => write.payload), { onConflict: 'staff_id,course_id' });
      error = fallback.error;
    }

    if (error) {
      summary.errors += chunk.length;
      addSkipped(summary, `update_failed: ${error.message}`, chunk[0]?.staffName, chunk[0]?.courseName);
    } else {
      for (const write of chunk) {
        if (write.operation === 'create') summary.created += 1;
        else summary.updated += 1;
      }
    }
  }

  return summary;
}
