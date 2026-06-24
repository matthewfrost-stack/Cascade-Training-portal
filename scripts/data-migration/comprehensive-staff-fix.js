const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

(async () => {
  console.log('🔧 COMPREHENSIVE STAFF DATA FIX\n');

  // Step 1: Get all staff and locations
  const { data: allProfiles } = await supabase
    .from('profiles')
    .select('id, full_name, email, location')
    .eq('is_deleted', false);

  const { data: locations } = await supabase
    .from('locations')
    .select('id, name');

  const { data: assignedStaff } = await supabase
    .from('staff_locations')
    .select('staff_id');

  const assignedIds = new Set(assignedStaff?.map(s => s.staff_id) || []);
  const unassigned = allProfiles?.filter(p => !assignedIds.has(p.id)) || [];

  // Build location map with trimmed names as keys
  const locMap = {};
  locations?.forEach(loc => {
    locMap[loc.name] = loc.id;
    locMap[loc.name.trim()] = loc.id; // Also map trimmed version
  });

  const locNames = new Set(locations?.map(l => l.name) || []);

  // Step 2: Clean and fix location names with trailing spaces
  let fixedSpaces = 0;
  for (const staff of unassigned) {
    if (staff.location && staff.location !== staff.location.trim()) {
      const trimmed = staff.location.trim();
      const { error } = await supabase
        .from('profiles')
        .update({ location: trimmed })
        .eq('id', staff.id);
      
      if (!error) {
        console.log(`✅ Trimmed location: "${staff.full_name.substring(0, 30)}"`);
        staff.location = trimmed;
        fixedSpaces++;
      }
    }
  }

  // Step 3: Identify garbage data (entries with CSV-like content or non-person names)
  const garbagePatterns = [
    /^\d+\-/,  // Starts with number-dash (rows)
    /^\,/,     // Starts with comma
    /^Phase \d+/,
    /^Level \d+/,
    /^Training /,
    /^Module/,
    /^PREVENT|^Teachers|^Teaching Assistants|^Compliance|^Finance|^Operations|^HR|^IT|^Maintenance|^Adult Education|^Health and|^Volunteers|^Workforce/,
    /Stage \d+|Modules,|Module \d+/,
    /Careskills|ERSAB|Team Teach|Norwich/
  ];

  const deleteList = unassigned.filter(staff => {
    const name = staff.full_name || '';
    return garbagePatterns.some(pattern => pattern.test(name));
  });

  if (deleteList.length > 0) {
    console.log(`\n⚠️ GARBAGE DATA FOUND (${deleteList.length} entries):`);
    console.log('   These appear to be CSV headers or training data, not actual staff:\n');
    
    deleteList.forEach(staff => {
      console.log(`   - "${staff.full_name.substring(0, 50)}..."`);
    });

    console.log(`\n   Delete these ${deleteList.length} entries? (They look like import artifacts)`);
    console.log('   Running clean-up now...\n');

    let deleted = 0;
    for (const staff of deleteList) {
      const { error } = await supabase
        .from('profiles')
        .update({
          is_deleted: true,
          deleted_at: new Date().toISOString(),
          full_name: '[DELETED - GARBAGE DATA]',
          email: `deleted-${staff.id}@system.local`
        })
        .eq('id', staff.id);

      if (!error) {
        deleted++;
        console.log(`   🗑️  Soft-deleted: "${staff.full_name.substring(0, 40)}"`);
      }
    }
    console.log(`\n   Soft-deleted ${deleted}/${deleteList.length} garbage entries\n`);
  }

  // Step 4: Fix remaining staff with location mismatches
  console.log('🔍 Analyzing location mismatches...\n');

  const updated = unassigned.filter(s => !deleteList.includes(s));
  let staff_locations_created = 0;
  let location_mismatches = 0;
  const mismatchExamples = [];

  for (const staff of updated) {
    if (!staff.location || !staff.location.trim()) continue;

    const locName = staff.location.trim();
    const locId = locMap[locName];

    if (!locId) {
      // Location doesn't exist - need to find closest match
      location_mismatches++;
      if (mismatchExamples.length < 5) {
        mismatchExamples.push(`${staff.full_name} → "${locName}" (not in DB)`);
      }
      continue;
    }

    // Create the staff_locations entry
    const { error } = await supabase
      .from('staff_locations')
      .insert({
        staff_id: staff.id,
        location_id: locId
      });

    if (!error) {
      staff_locations_created++;
    }
  }

  console.log(`✅ Created staff_locations entries: ${staff_locations_created}`);
  if (location_mismatches > 0) {
    console.log(`\n⚠️  Location mismatches found: ${location_mismatches}`);
    console.log('   Examples:');
    mismatchExamples.forEach(ex => console.log(`     ${ex}`));
  }

  console.log(`\n\n📊 FINAL SUMMARY:`);
  console.log(`  • Fixed spacing issues: ${fixedSpaces}`);
  console.log(`  • Soft-deleted garbage data: ${deleteList.length}`);
  console.log(`  • Created staff_locations: ${staff_locations_created}`);
  console.log(`  • Unresolved location mismatches: ${location_mismatches}`);
  
  if (location_mismatches > 0) {
    console.log(`\n📝 Next: Review the location mismatches above and either:`);
    console.log(`   1. Fix the location names in the profiles`);
    console.log(`   2. Create the missing locations in the database`);
  }
})();
