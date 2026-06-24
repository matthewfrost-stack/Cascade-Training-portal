const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

(async () => {
  console.log('🔧 FIXING LOCATION TRAILING SPACES\n');

  // Get all locations
  const { data: locs } = await supabase
    .from('locations')
    .select('id, name')
    .order('name');

  // Find locations with trailing spaces
  const locationsToFix = locs.filter(l => l.name !== l.name.trim());
  
  console.log(`Found ${locationsToFix.length} locations with trailing spaces:\n`);
  locationsToFix.forEach(l => {
    console.log(`  "${l.name}" → "${l.name.trim()}"`);
  });

  if (locationsToFix.length === 0) {
    console.log('No locations need fixing!');
    return;
  }

  console.log('\n🔄 Fixing locations...\n');

  for (const loc of locationsToFix) {
    const trimmedName = loc.name.trim();
    
    // Check if a location with trimmed name already exists
    const existingLoc = locs.find(l => l.name === trimmedName);
    
    if (existingLoc) {
      // Need to merge: move all staff from loc to existingLoc, then delete loc
      console.log(`⚠️  "${trimmedName}" already exists - MERGING staff...`);
      
      // Get all staff_locations for the location with trailing space
      const { data: staffToMove } = await supabase
        .from('staff_locations')
        .select('staff_id')
        .eq('location_id', loc.id);
      
      console.log(`   Found ${staffToMove?.length || 0} staff to move`);
      
      // Move each staff member to the clean location
      for (const staff of (staffToMove || [])) {
        // Check if staff already exists in the clean location
        const { data: existing } = await supabase
          .from('staff_locations')
          .select('id')
          .eq('staff_id', staff.staff_id)
          .eq('location_id', existingLoc.id)
          .single();
        
        if (existing) {
          // Staff already in clean location, just delete from dirty location
          await supabase
            .from('staff_locations')
            .delete()
            .eq('staff_id', staff.staff_id)
            .eq('location_id', loc.id);
          console.log(`   ↳ Staff ${staff.staff_id.substring(0, 8)}... already in clean location, removed duplicate`);
        } else {
          // Update to point to clean location
          const { error } = await supabase
            .from('staff_locations')
            .update({ location_id: existingLoc.id })
            .eq('staff_id', staff.staff_id)
            .eq('location_id', loc.id);
          
          if (error) {
            console.log(`   ❌ Error moving staff: ${error.message}`);
          } else {
            console.log(`   ✅ Moved staff ${staff.staff_id.substring(0, 8)}...`);
          }
        }
      }
      
      // Also update profiles.location field
      const { error: profileError } = await supabase
        .from('profiles')
        .update({ location: trimmedName })
        .eq('location', loc.name);
      
      if (profileError) {
        console.log(`   ⚠️  Error updating profiles: ${profileError.message}`);
      } else {
        console.log(`   ✅ Updated profile locations`);
      }
      
      // Delete the dirty location
      const { error: deleteError } = await supabase
        .from('locations')
        .delete()
        .eq('id', loc.id);
      
      if (deleteError) {
        console.log(`   ❌ Error deleting location: ${deleteError.message}`);
      } else {
        console.log(`   ✅ Deleted duplicate location "${loc.name}"\n`);
      }
      
    } else {
      // Just rename the location
      console.log(`📝 Renaming "${loc.name}" → "${trimmedName}"`);
      
      const { error } = await supabase
        .from('locations')
        .update({ name: trimmedName })
        .eq('id', loc.id);
      
      if (error) {
        console.log(`   ❌ Error: ${error.message}`);
      } else {
        // Also update profiles.location field
        await supabase
          .from('profiles')
          .update({ location: trimmedName })
          .eq('location', loc.name);
        
        console.log(`   ✅ Done\n`);
      }
    }
  }

  // Final check
  console.log('\n📊 FINAL LOCATIONS:\n');
  const { data: finalLocs } = await supabase
    .from('locations')
    .select('id, name')
    .order('name');
  
  finalLocs.forEach(l => {
    const hasSpace = l.name !== l.name.trim();
    console.log(`  ${hasSpace ? '⚠️' : '✅'} "${l.name}"`);
  });
})();
