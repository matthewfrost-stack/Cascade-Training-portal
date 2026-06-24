import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function checkSyncStatus() {
  // Get locations
  const { data: locations } = await supabase
    .from('locations')
    .select('id, name')
    .order('name');

  console.log('\n📊 RECORD COUNT BY LOCATION:\n');

  let totalRecords = 0;
  const summary = [];

  for (const loc of locations || []) {
    const { count, error } = await supabase
      .from('staff_training_matrix')
      .select('*', { count: 'exact', head: true })
      .eq('completed_at_location_id', loc.id);

    if (!error) {
      console.log(`${loc.name}: ${count} records`);
      totalRecords += count || 0;
      summary.push({ name: loc.name, count: count || 0 });
    }
  }

  console.log(`\n✅ TOTAL: ${totalRecords} records\n`);

  // Check if records have real dates
  const { data: withDates, count: datesCount } = await supabase
    .from('staff_training_matrix')
    .select('*', { count: 'exact', head: true })
    .not('completion_date', 'is', null);

  console.log(`Records WITH completion_date: ${datesCount}`);
  console.log(`Records WITHOUT completion_date: ${totalRecords - (datesCount || 0)}`);

  // Sample some records with dates to check format
  const { data: sampleWithDates } = await supabase
    .from('staff_training_matrix')
    .select('id, completion_date, expiry_date, created_at, updated_at')
    .not('completion_date', 'is', null)
    .limit(3);

  if (sampleWithDates && sampleWithDates.length > 0) {
    console.log('\nSample records with dates:');
    sampleWithDates.forEach((rec, i) => {
      const age = new Date() - new Date(rec.updated_at);
      const hours = Math.round(age / 1000 / 60 / 60);
      console.log(`  ${i+1}. Updated ${hours}h ago: completion_date="${rec.completion_date}", expiry_date="${rec.expiry_date}"`);
    });
  }
}

checkSyncStatus();
