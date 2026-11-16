import { NextApiRequest, NextApiResponse } from 'next';
import { createServerClient } from '@supabase/ssr';
import fs from 'fs';
import path from 'path';

const locationToCsv: { [key: string]: string } = {
  'Banks House School': 'Banks House Training Matrix - Staff Matrix.csv',
  'Felix House School': 'Felix House Training Matrix - Staff Matrix.csv',
  'Armfield House': 'Armfield House Training Matrix - Staff Matrix.csv',
  'Bonetti House': 'Bonetti House Training Matrix - Staff Matrix.csv',
  'Charlton House': 'Charlton House Training Matrix - Staff Matrix.csv',
  'Banks House': 'Banks House Training Matrix - Staff Matrix.csv',
  'Moore House': 'Moore House Training Matrix - Staff Matrix.csv',
  'Group': 'Group Training Matrix - Staff Matrix.csv',
  'Peters House': 'Peters House Training Matrix - Staff Matrix.csv',
  'Cohen House': 'Cohen House Training Matrix - Staff Matrix.csv',
  'Hurst House': 'Hurst House Training Matrix - Staff Matrix.csv',
  'Stiles House': 'Stiles House Training Matrix - Staff Matrix.csv',
  'Felix House': 'Felix House Training Matrix - Staff Matrix.csv',
};

function normalizeKey(value: string): string {
  return value.replace(/\s+/g, ' ').trim().toLowerCase();
}

function cleanCell(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
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

function parseFirstNLogicalRows(content: string, n: number): string[][] {
  const lines = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
  const rows: string[][] = [];
  let buffer = '';

  for (const line of lines) {
    buffer = buffer ? `${buffer}\n${line}` : line;
    if (!hasBalancedQuotes(buffer)) continue;
    rows.push(parseCsvLine(buffer));
    buffer = '';
    if (rows.length >= n) break;
  }

  if (buffer && rows.length < n) {
    rows.push(parseCsvLine(buffer));
  }

  return rows;
}

function parseHeaderRows(csvContent: string): { headers: string[]; atlasCourses: string[] } {
  const rows = parseFirstNLogicalRows(csvContent, 20);

  const courseNameRowIndex = rows.findIndex(row => {
    const first = cleanCell(row[0] || '').toLowerCase();
    return first === 'staff name' || first === 'learner name' || first === "learner's name";
  });

  if (courseNameRowIndex < 0) {
    return { headers: ['Face to Face'], atlasCourses: [] };
  }

  const categoryRow = rows[courseNameRowIndex - 1] || [];
  const courseRow = rows[courseNameRowIndex] || [];

  const headers = courseRow.length ? courseRow : ['Face to Face'];
  const atlasCourses = courseRow
    .map((courseName, idx) => {
      const category = (categoryRow[idx] || '').toLowerCase();
      if (!category.includes('careskills')) return null;
      if (!courseName) return null;
      const normalizedCourse = courseName.trim();
      if (!normalizedCourse) return null;
      const lower = normalizedCourse.toLowerCase();
      if (lower === 'staff name' || lower === 'learner name' || lower === "learner's name") return null;
      return normalizedCourse;
    })
    .filter((course): course is string => Boolean(course));

  return { headers, atlasCourses };
}

function readHeaderRowsFromCsv(csvFile: string): { headers: string[]; atlasCourses: string[] } {
  const csvPath = path.join(process.cwd(), 'csv-import', csvFile);
  const csvContent = fs.readFileSync(csvPath, 'utf8');
  return parseHeaderRows(csvContent);
}

// /api routes are excluded from the proxy's login redirect, so every handler
// must check the session itself. Any signed-in role may read course headers.
async function isSignedIn(req: NextApiRequest): Promise<boolean> {
  const bearerToken = req.headers.authorization?.replace(/^Bearer\s+/i, '').trim();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || '',
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '',
    {
      cookies: {
        getAll() {
          return Object.entries(req.cookies).map(([name, value]) => ({ name, value: value ?? '' }));
        },
        setAll() {
          // Read-only check; the proxy handles cookie refresh on page loads.
        },
      },
    }
  );
  try {
    const { data } = bearerToken ? await supabase.auth.getUser(bearerToken) : await supabase.auth.getUser();
    return Boolean(data.user);
  } catch {
    return false;
  }
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!(await isSignedIn(req))) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { location } = req.query;

  // If no location is provided, return an atlas-course union across all location CSVs.
  if (!location || typeof location !== 'string' || !location.trim()) {
    try {
      const allCsvFiles = [...new Set(Object.values(locationToCsv))];
      const atlasSet = new Set<string>();

      for (const csvFile of allCsvFiles) {
        const { atlasCourses } = readHeaderRowsFromCsv(csvFile);
        for (const course of atlasCourses) {
          atlasSet.add(course);
        }
      }

      return res.status(200).json({
        headers: ['Face to Face'],
        atlasCourses: [...atlasSet].sort((a, b) => a.localeCompare(b)),
      });
    } catch (_err) {
      return res.status(200).json({ headers: ['Face to Face'], atlasCourses: [] });
    }
  }

  const requestedLocation = normalizeKey(location);
  const csvFile = Object.entries(locationToCsv).find(([locationName]) => normalizeKey(locationName) === requestedLocation)?.[1];
  if (!csvFile) return res.status(404).json({ headers: ['Face to Face'], atlasCourses: [] });

  try {
    const { headers, atlasCourses } = readHeaderRowsFromCsv(csvFile);
    return res.status(200).json({ headers, atlasCourses });
  } catch (_err) {
    return res.status(200).json({ headers: ['Face to Face'], atlasCourses: [] });
  }
}
