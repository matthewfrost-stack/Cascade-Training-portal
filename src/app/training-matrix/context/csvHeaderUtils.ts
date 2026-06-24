// Utility to parse the first 3 rows of a CSV file and return structured header info


export interface CsvHeaderRows {
  categoryRow: string[];
  courseNameRow: string[];
  expiryRow: string[];
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
      // Escaped quote inside a quoted field.
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
  const physicalLines = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
  const rows: string[][] = [];
  let buffer = '';

  for (const line of physicalLines) {
    if (!buffer) {
      buffer = line;
    } else {
      buffer += `\n${line}`;
    }

    if (!hasBalancedQuotes(buffer)) {
      continue;
    }

    rows.push(parseCsvLine(buffer));
    buffer = '';

    if (rows.length >= n) break;
  }

  if (buffer && rows.length < n) {
    rows.push(parseCsvLine(buffer));
  }

  return rows;
}

// Accepts CSV content as a string, returns the first 3 header rows
export function parseFirstThreeRowsFromCsvString(content: string): CsvHeaderRows {
  // Many matrix CSVs have several metadata/header rows before data starts.
  // We anchor on the row whose first cell is "Staff Name", then derive related rows.
  const rows = parseFirstNLogicalRows(content, 20);

  const courseNameRowIndex = rows.findIndex(row => {
    const first = cleanCell(row[0] || '').toLowerCase();
    return first === 'staff name' || first === 'learner name' || first === "learner's name";
  });

  const safeCourseIdx = courseNameRowIndex >= 0 ? courseNameRowIndex : 1;
  const safeCategoryIdx = safeCourseIdx > 0 ? safeCourseIdx - 1 : 0;

  // Expiry is usually on a row starting with "Date valid for" a little below course names.
  let expiryIdx = rows.findIndex((row, idx) => {
    if (idx <= safeCourseIdx) return false;
    const first = cleanCell(row[0] || '').toLowerCase();
    return first.includes('date valid for');
  });
  if (expiryIdx < 0) {
    expiryIdx = rows[safeCourseIdx + 2] ? safeCourseIdx + 2 : safeCourseIdx + 1;
  }

  const category = rows[safeCategoryIdx] || [];
  const courseNames = rows[safeCourseIdx] || [];
  const expiry = rows[expiryIdx] || [];

  return {
    categoryRow: category,
    courseNameRow: courseNames,
    expiryRow: expiry,
  };
}
