require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const CSV_DIR = '/Users/matthewfrost/training-portal/csv-import';

// Proper CSV parsing that respects quoted fields
function parseCSVLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;
  
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current.trim());
  return result;
}

async function checkStatusCoverage() {
  console.log('=== Checking Status Coverage: CSV vs Database ===\n');

  const { data: locations } = await supabase.from('locations').select('id, name');
  
  let totalCsvCells = 0;
  let totalDbRecords = 0;
  let totalMissingCells = 0;

  for (const location of locations) {
    console.log(`\n--- ${location.name} ---`);

    const csvPath = path.join(CSV_DIR, `${location.name} Training Matrix - Staff Matrix.csv`);
    if (!fs.existsSync(csvPath)) {
      console.log('  No CSV file');
      continue;
    }

    const content = fs.readFileSync(csvPath, 'utf-8');
    const lines = content.split('\n');

    // Find header row
    let headerRow = -1;
    for (let i = 0; i < 60; i++) {
      if (lines[i] && lines[i].toLowerCase().includes('staff name')) {
        headerRow = i;
        break;
      }
    }

    if (headerRow === -1) continue;

    const headers = parseCSVLine(lines[headerRow]);
    const courseCount = headers.length - 1; // Minus Staff Name column

    // Count CSV data cells (dates + statuses)
    let csvDataCells = 0;
    let csvDates = 0;
    let csvStatuses = { na: 0, booked: 0, awaiting: 0, other: 0 };
    let staffRows = 0;

    const skipPatterns = [
      /^(Management|Team Leaders?|Lead Support|Staff Team|Staff on|Positive Behaviour|Training|Modules|Notes|->|Mandatory|Date Valid|Core|Manager)/i
    ];

    for (let i = headerRow + 1; i < lines.length; i++) {
      const cols = parseCSVLine(lines[i]);
      const name = cols[0];
      
      if (!name || name.length < 3) continue;
      let skip = false;
      for (const pattern of skipPatterns) {
        if (pattern.test(name)) { skip = true; break; }
      }
      if (skip) continue;
      if (!name.includes(' ')) continue; // Staff names have spaces

      staffRows++;
      
      for (let j = 1; j < cols.length; j++) {
        const cell = cols[j]?.toLowerCase().trim();
        if (!cell) continue;
        
        csvDataCells++;
        
        if (cell.match(/\d{2}\/\d{2}\/\d{4}/)) {
          csvDates++;
        } else if (cell.includes('n/a') || cell === 'na') {
          csvStatuses.na++;
        } else if (cell.includes('booked')) {
          csvStatuses.booked++;
        } else if (cell.includes('awaiting') || cell.includes('not yet due')) {
          csvStatuses.awaiting++;
        } else {
          csvStatuses.other++;
        }
      }
    }

    // Get DB record counts
    const { count: dbTotal } = await supabase
      .from('staff_training_matrix')
      .select('*', { count: 'exact', head: true })
      .eq('completed_at_location_id', location.id);

    const { count: dbWithDates } = await supabase
      .from('staff_training_matrix')
      .select('*', { count: 'exact', head: true })
      .eq('completed_at_location_id', location.id)
      .not('completion_date', 'is', null);

    const { count: dbBooked } = await supabase
      .from('staff_training_matrix')
      .select('*', { count: 'exact', head: true })
      .eq('completed_at_location_id', location.id)
      .eq('status', 'booked');

    const { count: dbAwaiting } = await supabase
      .from('staff_training_matrix')
      .select('*', { count: 'exact', head: true })
      .eq('completed_at_location_id', location.id)
      .eq('status', 'awaiting');

    const { count: dbNA } = await supabase
      .from('staff_training_matrix')
      .select('*', { count: 'exact', head: true })
      .eq('completed_at_location_id', location.id)
      .eq('status', 'na');

    console.log(`  CSV: ${staffRows} staff x ~${courseCount} courses = ${csvDataCells} data cells`);
    console.log(`    Dates: ${csvDates}, N/A: ${csvStatuses.na}, Booked: ${csvStatuses.booked}, Awaiting: ${csvStatuses.awaiting}`);
    console.log(`  DB:  ${dbTotal} records (dates: ${dbWithDates}, booked: ${dbBooked}, awaiting: ${dbAwaiting}, na: ${dbNA})`);
    
    const coverage = dbTotal > 0 ? Math.round(dbTotal / csvDataCells * 100) : 0;
    console.log(`  Coverage: ${coverage}%`);

    totalCsvCells += csvDataCells;
    totalDbRecords += dbTotal;
    if (csvDataCells > dbTotal) {
      totalMissingCells += (csvDataCells - dbTotal);
    }
  }

  console.log(`\n${'='.repeat(60)}`);
  console.log('TOTALS:');
  console.log(`  CSV data cells: ${totalCsvCells}`);
  console.log(`  DB records: ${totalDbRecords}`);
  console.log(`  Coverage: ${Math.round(totalDbRecords / totalCsvCells * 100)}%`);
  console.log(`  Missing: ~${totalMissingCells} cells`);
}

checkStatusCoverage().catch(console.error);
