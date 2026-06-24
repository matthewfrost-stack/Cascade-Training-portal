const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

(async () => {
  console.log('🔍 FINDING REMAINING GARBAGE DATA\n');

  const { data: allProfiles } = await supabase
    .from('profiles')
    .select('id, full_name, email, location')
    .eq('is_deleted', false);

  // Find obvious garbage
  const garbage = allProfiles?.filter(p => {
    const name = (p.full_name || '').trim();
    
    // Too long = probably garbage
    if (name.length > 100) return true;
    
    // Starts with special chars
    if (/^[\,\-\d]/.test(name)) return true;
    
    // All caps multi-word without proper spacing = likely garbage
    if (/^[A-Z]+\s+[A-Z0-9\,\s]+$/.test(name) && name.length > 50) return true;
    
    // Contains too many commas
    if ((name.match(/,/g) || []).length > 3) return true;
    
    return false;
  }) || [];

  console.log(`Found ${garbage.length} garbage entries:\n`);
  garbage.forEach(g => {
    console.log(`  "${g.full_name.substring(0, 60)}"`);
  });

  if (garbage.length > 0) {
    console.log(`\n🗑️  Soft-deleting ${garbage.length} garbage entries...\n`);
    
    let deleted = 0;
    for (const entry of garbage) {
      const { error } = await supabase
        .from('profiles')
        .update({
          is_deleted: true,
          deleted_at: new Date().toISOString(),
          full_name: '[DELETED]',
          email: `deleted-${entry.id}@system.local`
        })
        .eq('id', entry.id);

      if (!error) {
        deleted++;
      }
    }
    
    console.log(`✅ Deleted ${deleted}/${garbage.length} garbage entries`);
  }

  // Now find duplicates
  console.log(`\n\n🔄 FINDING DUPLICATES\n`);

  const { data: remaining } = await supabase
    .from('profiles')
    .select('id, full_name, email')
    .eq('is_deleted', false)
    .order('full_name');

  const nameMap = {};
  const emailMap = {};
  const duplicates = [];

  remaining?.forEach(p => {
    if (!nameMap[p.full_name]) nameMap[p.full_name] = [];
    nameMap[p.full_name].push(p.id);

    if (!emailMap[p.email]) emailMap[p.email] = [];
    emailMap[p.email].push(p.id);
  });

  // Find name duplicates
  Object.entries(nameMap).forEach(([name, ids]) => {
    if (ids.length > 1 && name && name.trim()) {
      duplicates.push({ name, ids, type: 'name' });
    }
  });

  // Find email duplicates
  Object.entries(emailMap).forEach(([email, ids]) => {
    if (ids.length > 1 && email && email.trim()) {
      duplicates.push({ email, ids, type: 'email' });
    }
  });

  if (duplicates.length > 0) {
    console.log(`Found ${duplicates.length} duplicate groups:\n`);
    duplicates.slice(0, 20).forEach(dup => {
      if (dup.type === 'name') {
        console.log(`📌 Name: "${dup.name}" (${dup.ids.length} copies)`);
      } else {
        console.log(`📌 Email: "${dup.email}" (${dup.ids.length} copies)`);
      }
    });

    if (duplicates.length > 20) {
      console.log(`\n... and ${duplicates.length - 20} more\n`);
    }
  }

  console.log(`\n⚠️ NOTE: These duplicates need manual review.`);
  console.log(`   They could be:`);
  console.log(`   • Legitimate (person working multiple locations)`);
  console.log(`   • Data import errors (person added twice)`);
  console.log(`\n   Check the Manage Staff UI to decide which to keep.`);
})();
