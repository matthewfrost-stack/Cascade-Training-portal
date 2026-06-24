require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

// Known divider labels in CSVs
const DIVIDER_LABELS = [
  'team leaders', 'team leader', 'lead support', 'lead supports',
  'support workers', 'support staff', 'management', 'management and admin',
  'admin', 'health and wellbeing', 'waking night', 'waking nights',
  'teachers', 'teaching staff', 'education', 'senior', 'seniors',
  'deputy', 'deputies', 'registered manager', 'managers',
  // Group-specific dividers
  'operations', 'compliance', 'adult education', 'it', 'finance',
  'maintenance', 'volunteers', 'hr', 'human resources',
  // Additional dividers
  'staff', 'probation', 'inactive', 'maternity leave', 'maternity'
];

function isDividerRow(name) {
  const lower = name.toLowerCase().trim();
  return DIVIDER_LABELS.some(d => lower === d || lower.startsWith(d + ' '));
}

// CSV parsing helper
function parseCSV(content) {
  const lines = [];
  let current = '';
  let inQuotes = false;
  
  for (let i = 0; i < content.length; i++) {
    const char = content[i];
    if (char === '"') {
      inQuotes = !inQuotes;
      current += char;
    } else if (char === '\n' && !inQuotes) {
      lines.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  if (current) lines.push(current);
  
  return lines.map(line => {
    const cells = [];
    let cell = '';
    let inQ = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (c === '"') {
        inQ = !inQ;
      } else if (c === ',' && !inQ) {
        cells.push(cell.trim());
        cell = '';
      } else {
        cell += c;
      }
    }
    cells.push(cell.trim());
    return cells;
  });
}

function isStaffRow(row) {
  const firstCell = row[0]?.trim() || '';
  if (!firstCell) return false;
  if (firstCell.toLowerCase().includes('staff name')) return false;
  if (firstCell.toLowerCase().includes('notes')) return false;
  if (firstCell.toLowerCase().includes('date valid')) return false;
  if (firstCell.toLowerCase().includes('careskills')) return false;
  if (firstCell.toLowerCase().includes('phase')) return false;
  
  // Check if it's a divider row (recognized label with mostly empty cells after)
  if (isDividerRow(firstCell)) {
    return true;
  }
  
  const hasDateOrStatus = row.slice(1, 10).some(cell => {
    const val = cell?.trim()?.toLowerCase() || '';
    return val.match(/\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}/) || 
           val === 'n/a' || val === 'na' || 
           val === 'booked' || val.includes('awaiting');
  });
  
  const nameParts = firstCell.split(' ').filter(p => p.length > 1);
  return nameParts.length >= 2 || hasDateOrStatus;
}

const locationFiles = {
  'Armfield House': 'Armfield House Training Matrix - Staff Matrix.csv',
  'Banks House': 'Banks House Training Matrix - Staff Matrix.csv',
  'Bonetti House': 'Bonetti House Training Matrix - Staff Matrix.csv',
  'Charlton House': 'Charlton House Training Matrix - Staff Matrix.csv',
  'Cohen House': 'Cohen House Training Matrix - Staff Matrix.csv',
  'Felix House': 'Felix House Training Matrix - Staff Matrix.csv',
  'Hurst House': 'Hurst House Training Matrix - Staff Matrix.csv',
  'Moore House': 'Moore House Training Matrix - Staff Matrix.csv',
  'Peters House': 'Peters House Training Matrix - Staff Matrix.csv',
  'Stiles House': 'Stiles House Training Matrix - Staff Matrix.csv',
  'Banks House School': 'Banks House School Training Matrix - Staff Matrix.csv',
  'Felix House School': 'Felix House School Training Matrix - Staff Matrix.csv',
  'Group': 'Group Training Matrix - Staff Matrix.csv'
};

(async () => {
  console.log('=== RE-IMPORTING STAFF ORDER WITH DIVIDERS ===\n');
  
  const { data: locations } = await supabase.from('locations').select('id, name');
  const locMap = new Map(locations.map(l => [l.name, l.id]));
  
  // Get all profiles for name matching
  const { data: allProfiles } = await supabase
    .from('profiles')
    .select('id, full_name')
    .eq('is_deleted', false);
  
  for (const [locName, csvFile] of Object.entries(locationFiles)) {
    const locId = locMap.get(locName);
    if (!locId) continue;
    
    const csvPath = path.join(__dirname, 'csv-import', csvFile);
    if (!fs.existsSync(csvPath)) continue;
    
    console.log(`\n=== ${locName} ===`);
    
    const content = fs.readFileSync(csvPath, 'utf-8');
    // Use proper CSV parsing that handles multi-line quoted cells
    const rows = parseCSV(content);
    
    // Get staff at this location
    const { data: staffLocs } = await supabase
      .from('staff_locations')
      .select('staff_id, profiles(id, full_name)')
      .eq('location_id', locId);
    
    const staffAtLoc = new Map();
    for (const sl of staffLocs) {
      if (sl.profiles?.full_name) {
        staffAtLoc.set(sl.profiles.full_name.toLowerCase().trim(), sl.staff_id);
        // Also add by first name + last name initial for fuzzy matching
        const parts = sl.profiles.full_name.split(' ');
        if (parts.length >= 2) {
          staffAtLoc.set(parts[0].toLowerCase(), sl.staff_id);
        }
      }
    }
    
    // Parse CSV to get staff order and dividers
    const csvEntries = [];
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      if (!isStaffRow(row)) continue;
      
      const name = row[0]?.trim();
      if (!name) continue;
      
      if (isDividerRow(name)) {
        console.log(`    Found divider: "${name}"`);
        csvEntries.push({ type: 'divider', name, index: csvEntries.length });
      } else {
        csvEntries.push({ type: 'staff', name, index: csvEntries.length });
      }
    }
    
    console.log(`    Total entries: ${csvEntries.length} (${csvEntries.filter(e=>e.type==='divider').length} dividers)`);
    
    // Clear existing dividers
    await supabase.from('location_matrix_dividers').delete().eq('location_id', locId);
    
    // Process entries and set display_order (start at 1)
    let displayOrder = 1;
    let updatedStaff = 0;
    let createdDividers = 0;
    
    for (const entry of csvEntries) {
      if (entry.type === 'divider') {
        // Create divider
        const { error } = await supabase
          .from('location_matrix_dividers')
          .insert({
            location_id: locId,
            name: entry.name,
            display_order: displayOrder
          });
        
        if (error) {
          console.log(`    Divider error: ${error.message}`);
        } else {
          createdDividers++;
        }
        displayOrder++;
      } else {
        // Find staff by name
        const nameLower = entry.name.toLowerCase().trim();
        const firstName = entry.name.split(' ')[0].toLowerCase();
        
        let staffId = staffAtLoc.get(nameLower);
        
        if (!staffId) {
          // Try to find by first name match
          for (const [key, id] of staffAtLoc) {
            if (key.startsWith(firstName) || firstName.startsWith(key.split(' ')[0])) {
              staffId = id;
              break;
            }
          }
        }
        
        if (staffId) {
          const { error } = await supabase
            .from('staff_locations')
            .update({ display_order: displayOrder })
            .eq('location_id', locId)
            .eq('staff_id', staffId);
          
          if (!error) {
            updatedStaff++;
          }
        }
        displayOrder++;
      }
    }
    
    console.log(`  Updated ${updatedStaff} staff display_order`);
    console.log(`  Created ${createdDividers} dividers`);
  }
  
  console.log('\n=== DONE ===');
})();
