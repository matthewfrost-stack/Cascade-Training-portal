#!/bin/bash
export NEXT_PUBLIC_SUPABASE_URL=https://ykrmrwgnbuigdzodnliw.supabase.co
export SUPABASE_SERVICE_ROLE_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inlrcm1yd2duYnVpZ2R6b2RubGl3Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2ODQ2MDgzMCwiZXhwIjoyMDg0MDM2ODMwfQ.wlJhJ4dN1y94WgLoiBU0pWvqf0AkdW06XE7jtU_1Rcc"

node --input-type=module << 'EONODE'
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import { parse } from 'csv-parse/sync';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Get first location
const { data: locations } = await supabase
  .from('locations')
  .select('id, name')
  .order('name')
  .limit(1);

const loc = locations[0];
console.log(`\n🔍 DETAILED ANALYSIS: ${loc.name}\n`);

// Load CSV
const csvFile = `/Users/matthewfrost/training-portal/csv-import/${loc.name} Training Matrix - Staff Matrix.csv`;
console.log(`CSV File: ${csvFile}`);
console.log(`Exists: ${fs.existsSync(csvFile)}\n`);

if (!fs.existsSync(csvFile)) {
  console.log('CSV file not found!');
  process.exit(1);
}

const csvContent = fs.readFileSync(csvFile, 'utf-8');
const records = parse(csvContent, { skip_empty_lines: true });

console.log(`CSV has ${records.length} rows\n`);

// Row 1 (index 0) = headers (usually skip)
// Row 2 (index 1) = staff names + course names
// Row 3 (index 2) = blank or spacer
// Row 4 (index 3) = "Date valid for" + expiry durations
// Row 5 (index 4) = blank or spacer
// Row 6+ (index 5+) = actual staff data

console.log('Row 1 (headers):', records[0].slice(0, 5).map(s => s.trim()).filter(s => s));
console.log('\nRow 2 (staff/courses):');
const courseRow = records[1];
console.log(`  First col: "${courseRow[0]}"`);
console.log(`  Columns 2-10: ${courseRow.slice(1, 10).map(s => s.trim()).filter(s => s).join(' | ')}\n`);

// Staff names from Row 6 onwards
console.log('Staff in CSV (Row 6+):');
for (let i = 5; i < Math.min(10, records.length); i++) {
  const staffName = (records[i][0] || '').trim();
  const hasData = records[i].slice(1).filter(c => c && c.trim()).length > 0;
  if (staffName) {
    console.log(`  ${i-4}. "${staffName}" (${hasData ? 'has data' : 'no data'})`);
  }
}

// Get DB staff for location
const { data: staffList } = await supabase
  .from('profiles')
  .select('id, full_name')
  .order('full_name');

console.log(`\n📊 Database Profiles (first 10):`);
staffList?.slice(0, 10).forEach((s, i) => {
  console.log(`  ${i+1}. "${s.full_name}" (${s.id})`);
});

// Check how many of these staff have records for this location
console.log(`\n🔎 Records by staff for ${loc.name}:`);
for (let i = 0; i < Math.min(5, staffList?.length || 0); i++) {
  const staff = staffList[i];
  const { data: recs } = await supabase
    .from('staff_training_matrix')
    .select('id')
    .eq('completed_at_location_id', loc.id)
    .eq('staff_id', staff.id);
  
  console.log(`  ${staff.full_name}: ${recs?.length || 0} records`);
}

EONODE
