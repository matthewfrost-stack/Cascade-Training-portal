require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');
const { parse } = require('csv-parse/sync');

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const DIVIDER_PATTERNS = [
  /^management$/i,
  /^management and admin$/i,
  /^team leaders?$/i,
  /^lead support$/i,
  /^staff team$/i,
  /^staff on probation$/i,
  /^inactive staff$/i,
  /^teachers$/i,
  /^teaching assistants?$/i,
  /^operations$/i,
  /^health and wellbeing$/i,
  /^compliance$/i,
  /^adult education$/i,
  /^admin$/i,
  /^hlta$/i,
  /^forest lead\/hlta$/i,
  /^forest$/i,
  /^maternity leave$/i,
  /^staff on maternity$/i,
  /^staff on sick\/maternity$/i,
  /^sickness\/maternity$/i,
  /^currently inactive$/i,
  /^bank staff$/i,
  /^sponsorship lead$/i,
  /^sponsorship lead support$/i,
  /^workforce$/i,
  /^workforce\/administration$/i,
  /^support staff$/i,
  /^senior staff$/i,
  /^senior team$/i,
  /^stiles staff$/i,
  /^new staff$/i,
  /^it$/i,
  /^finance$/i,
  /^maintenance$/i,
  /^volunteers$/i,
  /^hr$/i,
  /^prevent awareness$/i,
];

function isDividerRow(name) {
  const lower = name.toLowerCase().trim();
  return DIVIDER_PATTERNS.some(pattern => pattern.test(lower));
}

async function verifyDividerPositions() {
  const csvDir = '/Users/matthewfrost/training-portal/csv-import';
  
  const locationMap = {
    'Armfield House Training Matrix - Staff Matrix.csv': 'Armfield House',
    'Banks House Training Matrix - Staff Matrix.csv': 'Banks House',
    'Bonetti House Training Matrix - Staff Matrix.csv': 'Bonetti House',
    'Charlton House Training Matrix - Staff Matrix.csv': 'Charlton House',
    'Cohen House Training Matrix - Staff Matrix.csv': 'Cohen House',
    'Felix House Training Matrix - Staff Matrix.csv': 'Felix House',
    'Hurst House Training Matrix - Staff Matrix.csv': 'Hurst House',
    'Moore House Training Matrix - Staff Matrix.csv': 'Moore House',
    'Peters House Training Matrix - Staff Matrix.csv': 'Peters House',
    'Stiles House Training Matrix - Staff Matrix.csv': 'Stiles House',
    'Banks House School Training Matrix - Staff Matrix.csv': 'Banks House School',
    'Felix House School Training Matrix - Staff Matrix.csv': 'Felix House School',
    'Group Training Matrix - Staff Matrix.csv': 'Group'
  };
  
  console.log('=== VERIFYING DIVIDER POSITIONS ===\n');
  
  for (const [csvFile, locName] of Object.entries(locationMap)) {
    const csvPath = path.join(csvDir, csvFile);
    if (!fs.existsSync(csvPath)) continue;
    
    // Get location
    const { data: loc } = await supabase.from('locations').select('id').eq('name', locName).single();
    if (!loc) continue;
    
    // Get DB dividers
    const { data: dbDividers } = await supabase
      .from('location_matrix_dividers')
      .select('name, display_order')
      .eq('location_id', loc.id)
      .order('display_order');
    
    // Parse CSV to find expected divider positions
    const content = fs.readFileSync(csvPath, 'utf-8');
    const rows = parse(content, {
      relax_column_count: true,
      skip_empty_lines: false
    });
    
    const csvDividers = [];
    let position = 0;
    const headerRowIndex = rows.findIndex(row => {
      const firstCell = String(row?.[0] || '').trim().toLowerCase();
      return firstCell === 'staff name';
    });
    const dataStart = headerRowIndex >= 0 ? headerRowIndex + 1 : 0;
    
    for (let i = dataStart; i < rows.length; i++) {
      const firstCell = String(rows[i]?.[0] || '').trim();
      if (!firstCell) continue;
      const lower = firstCell.toLowerCase();
      if (lower.includes('notes') || lower.includes('date valid')) continue;
      
      position++;
      if (isDividerRow(firstCell)) {
        csvDividers.push({ name: firstCell, position });
      }
    }
    
    // Compare
    let allMatch = true;
    const issues = [];
    
    for (const csvDiv of csvDividers) {
      const dbMatch = dbDividers.find(d => d.name.toLowerCase() === csvDiv.name.toLowerCase());
      if (!dbMatch) {
        issues.push(`Missing: "${csvDiv.name}" at position ${csvDiv.position}`);
        allMatch = false;
      } else if (dbMatch.display_order !== csvDiv.position) {
        issues.push(`Wrong position: "${csvDiv.name}" CSV=${csvDiv.position} DB=${dbMatch.display_order}`);
        allMatch = false;
      }
    }
    
    if (allMatch) {
      console.log(`✅ ${locName}: ${csvDividers.length} dividers in correct positions`);
    } else {
      console.log(`❌ ${locName}:`);
      issues.forEach(i => console.log(`   ${i}`));
    }
  }
}

verifyDividerPositions();
