const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

(async () => {
  // Find all duplicates
  const { data: all } = await supabase
    .from('profiles')
    .select('id, full_name, location')
    .eq('is_deleted', false);
  
  const nameCount = {};
  all.forEach(p => {
    if (!nameCount[p.full_name]) nameCount[p.full_name] = [];
    nameCount[p.full_name].push({ id: p.id, location: p.location });
  });
  
  const dups = Object.entries(nameCount).filter(([n, entries]) => entries.length > 1);
  console.log(`Found ${dups.length} duplicate names:\n`);
  
  dups.forEach(([name, entries]) => {
    console.log(`"${name}":`);
    entries.forEach(e => console.log(`  - ${e.id.substring(0, 8)}... @ ${e.location}`));
  });

  // For each duplicate, keep only the first one (or the one at a different location if they differ)
  console.log('\n🔧 CLEANING DUPLICATES (keeping one per person)...\n');
  
  let deleted = 0;
  for (const [name, entries] of dups) {
    // Get unique locations
    const uniqueLocs = [...new Set(entries.map(e => e.location))];
    
    if (uniqueLocs.length === 1) {
      // Same location - delete all but first
      for (let i = 1; i < entries.length; i++) {
        const { error } = await supabase
          .from('profiles')
          .update({
            is_deleted: true,
            deleted_at: new Date().toISOString(),
            full_name: '[DELETED - DUPLICATE]',
            email: `deleted-${entries[i].id}@system.local`
          })
          .eq('id', entries[i].id);
        
        if (!error) {
          deleted++;
          console.log(`  Deleted duplicate: ${name} @ ${entries[i].location}`);
        }
      }
    } else {
      // Different locations - might be intentional, just log
      console.log(`  SKIPPED: ${name} - exists at multiple locations: ${uniqueLocs.join(', ')}`);
    }
  }

  console.log(`\n✅ Deleted ${deleted} duplicate entries`);

  // Final count
  const { count } = await supabase
    .from('profiles')
    .select('*', { count: 'exact', head: true })
    .eq('is_deleted', false);

  console.log(`📊 Final active staff count: ${count}`);
})();
