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
  'deputy', 'deputies', 'registered manager', 'managers'
];

function isDividerLabel(name) {
  const lower = name.toLowerCase().trim();
  return DIVIDER_LABELS.some(d => lower === d);
}

function isStaffName(name) {
  if (!name) return false;
  const parts = name.split(' ').filter(p => p.length > 1);
  return parts.length >= 2;
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
  
  for (const [locName, csvFile] of Object.entries(locationFiles)) {
    const locId = locMap.get(locName);
    if (!locId) continue;
    
    const csvPath = path.join(__dirname, 'csv-import', csvFile);
    if (!fs.existsSync(csvPath)) continue;
    
    console.log(`\n=== ${locName} ===`);
    
    // Simple line-by-line parsing
    const content = fs.readFileSync(csvPath, 'utf-8');
    const lines = content.split('\n');
    
    // Get staff at this location with their names
    const { data: staffLocs } = await supabase
      .from('staff_locations')
      .select('staff_id, profiles(id, full_name)')
      .eq('location_id', locId);
    
    const staffByName = new Map();
    const staffByFirstName = new Map();
    for (const sl of staffLocs) {
      if (sl.profiles?.full_name && !sl.profiles.full_name.includes('[DELETED')) {
        const name = sl.profiles.full_name.toLowerCase().trim();
        staffByName.set(name, sl.staff_id);
        const firstName = name.split(' ')[0];
        if (!staffByFirstName.has(firstName)) {
          staffByFirstName.set(firstName, sl.staff_id);
        }
      }
    }
    
    // Parse CSV lines to find staff and dividers
    const entries = [];
    for (let i = 0; i < lines.length; i++) {
      const cells = lines[i].split(',');
      const first = cells[0] ? cells[0].trim() : '';
      
      if (!first) continue;
      
      if (isDividerLabel(first)) {
        entries.push({ type: 'divider', label: first });
      } else if (isStaffName(first)) {
        // Check if subsequent cells have dates (to confirm it's a staff row)
        const hasDate = cells.slice(1, 15).some(c => c && c.match(/\d{1,2}\/\d{1,2}\/\d{2,4}/));
        const hasStatus = cells.slice(1, 15).some(c => {
          const v = (c || '').toLowerCase().trim();
          return v === 'n/a' || v === 'na' || v === 'booked' || v.includes('awaiting');
        });
        
        if (hasDate || hasStatus) {
          entries.push({ type: 'staff', name: first });
        }
      }
    }
    
    console.log(`  Found ${entries.filter(e => e.type === 'staff').length} staff, ${entries.filter(e => e.type === 'divider').length} dividers in CSV`);
    
    // Clear existing dividers for this location
    await supabase.from('location_matrix_dividers').delete().eq('location_id', locId);
    
    // Process entries and update database
    let displayOrder = 0;
    let updatedStaff = 0;
    let createdDividers = 0;
    
    for (const entry of entries) {
      if (entry.type === 'divider') {
        const { error } = await supabase
          .from('location_matrix_dividers')
          .insert({
            location_id: locId,
            name: entry.label,
            display_order: displayOrder
          });
        
        if (!error) {
          createdDividers++;
        } else {
          console.log(`    Error creating divider "${entry.label}": ${error.message}`);
        }
        displayOrder++;
      } else {
        // Find staff by name
        const nameLower = entry.name.toLowerCase().trim();
        const firstName = entry.name.split(' ')[0].toLowerCase();
        
        let staffId = staffByName.get(nameLower);
        if (!staffId) {
          staffId = staffByFirstName.get(firstName);
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
