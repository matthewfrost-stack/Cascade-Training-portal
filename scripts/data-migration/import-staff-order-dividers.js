require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');
const { parse } = require('csv-parse/sync');

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const CSV_DIR = '/Users/matthewfrost/training-portal/csv-import';

// Known divider names (these are section headers, not staff)
const DIVIDER_PATTERNS = [
  /^management$/i,
  /^management and admin$/i,
  /^team leaders?$/i,
  /^lead support$/i,
  /^staff team$/i,
  /^staff on probation$/i,
  /^inactive staff$/i,
  /^teachers$/i,
  /^teaching assistants$/i,
  /^operations$/i,
  /^sustainability$/i,
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

function isDivider(name) {
  if (!name || name.trim() === '') return false;
  const trimmed = name.trim();
  // Check if it matches known divider patterns exactly
  return DIVIDER_PATTERNS.some(pattern => pattern.test(trimmed));
}

function parseCSV(content) {
  const rows = parse(content, {
    relax_column_count: true,
    skip_empty_lines: false
  });
  const results = [];
  
  // Find the "Staff Name" row to know where data starts
  let dataStartRow = -1;
  for (let i = 0; i < rows.length && i < 20; i++) {
    const firstCol = String(rows[i]?.[0] || '').trim().toLowerCase();
    if (firstCol === 'staff name') {
      dataStartRow = i + 1;
      break;
    }
  }
  
  if (dataStartRow === -1) {
    // Try to find where actual data starts
    for (let i = 3; i < rows.length; i++) {
      const firstCol = String(rows[i]?.[0] || '').trim();
      if (firstCol && 
          !firstCol.toLowerCase().includes('phase') && 
          !firstCol.toLowerCase().includes('careskills') &&
          !firstCol.includes('->') &&
          firstCol.length > 2) {
        dataStartRow = i;
        break;
      }
    }
  }
  
  if (dataStartRow === -1) dataStartRow = 4;
  
  let orderCounter = 1;
  
  for (let i = dataStartRow; i < rows.length; i++) {
    const cols = rows[i] || [];
    let name = String(cols[0] || '').trim();
    
    // Skip empty rows or rows that look like headers/notes
    if (!name || name === '') continue;
    if (name.toLowerCase() === 'staff name') continue;
    if (name.toLowerCase().includes('date valid')) continue;
    if (name.toLowerCase().includes('notes')) continue;
    if (name.includes('->')) continue;
    if (name.toLowerCase().includes('phase')) continue;
    if (name.toLowerCase().includes('training level')) continue;
    if (name.toLowerCase().includes('modules')) continue;
    if (name.toLowerCase().includes('positive behaviour') && name.toLowerCase().includes('training')) continue;
    
    const dividerMatch = isDivider(name);
    
    results.push({
      name: name,
      isDivider: dividerMatch,
      order: orderCounter++
    });
  }
  
  return results;
}

async function main() {
  console.log('=== Importing Staff Order and Dividers from CSV Files ===\n');
  
  // Get all locations
  const { data: locations } = await supabase.from('locations').select('id, name');
  console.log(`Found ${locations.length} locations\n`);
  
  // Get all staff profiles for name matching
  const { data: profiles } = await supabase.from('profiles').select('id, full_name').eq('is_deleted', false);
  const profileMap = new Map();
  profiles.forEach(p => {
    profileMap.set(p.full_name.toLowerCase().trim(), p.id);
  });
  console.log(`Loaded ${profiles.length} profiles for matching\n`);
  
  // Process each location
  for (const location of locations) {
    const csvPath = path.join(CSV_DIR, `${location.name} Training Matrix - Staff Matrix.csv`);
    
    if (!fs.existsSync(csvPath)) {
      console.log(`⚠️  No CSV file for ${location.name}`);
      continue;
    }
    
    console.log(`\n📁 Processing: ${location.name}`);
    const content = fs.readFileSync(csvPath, 'utf-8');
    const items = parseCSV(content);
    
    console.log(`   Found ${items.length} items total`);
    
    const dividers = items.filter(i => i.isDivider);
    const staffItems = items.filter(i => !i.isDivider);
    
    console.log(`   - ${dividers.length} dividers: ${dividers.map(d => `"${d.name}" @${d.order}`).join(', ')}`);
    console.log(`   - ${staffItems.length} staff members`);
    
    // Delete existing dividers for this location
    await supabase
      .from('location_matrix_dividers')
      .delete()
      .eq('location_id', location.id);
    
    // Insert dividers with their correct order positions
    if (dividers.length > 0) {
      const dividerInserts = dividers.map(d => ({
        location_id: location.id,
        name: d.name,
        display_order: d.order
      }));
      
      const { error: divError } = await supabase
        .from('location_matrix_dividers')
        .insert(dividerInserts);
      
      if (divError) {
        console.log(`   ❌ Error inserting dividers: ${divError.message}`);
      } else {
        console.log(`   ✓ Inserted ${dividers.length} dividers`);
      }
    }
    
    // Update staff_locations with display_order matching their CSV position
    let updatedCount = 0;
    let notFoundStaff = [];
    
    for (const item of staffItems) {
      const staffId = profileMap.get(item.name.toLowerCase().trim());
      if (staffId) {
        const { error } = await supabase
          .from('staff_locations')
          .update({ display_order: item.order })
          .eq('staff_id', staffId)
          .eq('location_id', location.id);
        
        if (!error) updatedCount++;
      } else {
        notFoundStaff.push(item.name);
      }
    }
    console.log(`   ✓ Updated display_order for ${updatedCount} staff members`);
    if (notFoundStaff.length > 0 && notFoundStaff.length <= 5) {
      console.log(`   ⚠️  Staff not found in DB: ${notFoundStaff.join(', ')}`);
    } else if (notFoundStaff.length > 5) {
      console.log(`   ⚠️  ${notFoundStaff.length} staff not found in DB`);
    }
  }
  
  console.log('\n=== Done ===');
}

main().catch(console.error);
