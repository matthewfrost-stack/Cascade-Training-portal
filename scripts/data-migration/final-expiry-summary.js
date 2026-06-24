import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function finalSummary() {
  console.log('=== FINAL EXPIRY DATE POPULATION SUMMARY ===\n');

  try {
    // Get summary statistics
    const { data: totalStats } = await supabase
      .from('staff_training_matrix')
      .select('id', { count: 'exact' })
      .eq('status', 'completed');

    const { data: withExpiry } = await supabase
      .from('staff_training_matrix')
      .select('id', { count: 'exact' })
      .eq('status', 'completed')
      .not('expiry_date', 'is', null);

    const total = totalStats ? totalStats.length : 0;
    const populated = withExpiry ? withExpiry.length : 0;
    const coverage = total > 0 ? Math.round((populated / total) * 100) : 0;

    console.log(`Completed Training Records: ${total}`);
    console.log(`Records WITH expiry_date: ${populated}`);
    console.log(`Coverage: ${coverage}%\n`);

    // Get breakdown by location
    const { data: locations } = await supabase
      .from('locations')
      .select('id, name');

    console.log('=== BY LOCATION ===\n');

    for (const location of locations) {
      const { data: locTotal } = await supabase
        .from('staff_training_matrix')
        .select('id', { count: 'exact' })
        .eq('status', 'completed')
        .eq('completed_at_location_id', location.id);

      const { data: locWithExpiry } = await supabase
        .from('staff_training_matrix')
        .select('id', { count: 'exact' })
        .eq('status', 'completed')
        .eq('completed_at_location_id', location.id)
        .not('expiry_date', 'is', null);

      const locTotal2 = locTotal ? locTotal.length : 0;
      const locPopulated = locWithExpiry ? locWithExpiry.length : 0;
      const locCoverage = locTotal2 > 0 ? Math.round((locPopulated / locTotal2) * 100) : 0;

      console.log(`${location.name}: ${locPopulated}/${locTotal2} (${locCoverage}%)`);
    }

    // Get sample of calculated expiry dates
    console.log('\n=== SAMPLE CALCULATED EXPIRY DATES ===\n');
    const { data: samples } = await supabase
      .from('staff_training_matrix')
      .select('id, courses(name), completion_date, expiry_date')
      .eq('status', 'completed')
      .not('expiry_date', 'is', null)
      .limit(10);

    for (let i = 0; i < samples.length; i++) {
      const s = samples[i];
      console.log(`${i + 1}. ${s.courses.name}`);
      console.log(`   Completion: ${s.completion_date} → Expiry: ${s.expiry_date}`);
    }

    console.log('\n✅ Expiry date population complete!');

  } catch (error) {
    console.error('Error:', error.message);
  }
}

finalSummary();
