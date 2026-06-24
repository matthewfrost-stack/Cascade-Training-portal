const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function calculateExpiryDates() {
  try {
    console.log('Fetching records with completion dates but no expiry date...\n');
    
    // First get total count
    const { count: totalCount } = await supabase
      .from('staff_training_matrix')
      .select('id', { count: 'exact', head: true })
      .not('completion_date', 'is', null)
      .is('expiry_date', null);
    
    console.log(`Found ${totalCount} records to process\n`);
    
    let processed = 0;
    let updated = 0;
    let errors = 0;
    let page = 0;
    const pageSize = 1000;
    
    // Process records page by page
    while (processed < totalCount) {
      page++;
      const from = processed;
      const to = Math.min(processed + pageSize - 1, totalCount - 1);
      
      const { data: records, error: fetchError } = await supabase
        .from('staff_training_matrix')
        .select(`
          id,
          completion_date,
          courses:course_id (
            expiry_months
          )
        `)
        .not('completion_date', 'is', null)
        .is('expiry_date', null)
        .range(from, to);
      
      if (fetchError) {
        console.error('Fetch error:', fetchError);
        break;
      }
      
      console.log(`Page ${page}: Processing ${records.length} records...`);
      
      for (const record of records) {
        if (!record.completion_date || !record.courses || !record.courses.expiry_months) {
          continue;
        }
        
        const completionDate = new Date(record.completion_date);
        const expiryMonths = record.courses.expiry_months;
        
        // Calculate expiry date
        const expiryDate = new Date(completionDate);
        expiryDate.setMonth(expiryDate.getMonth() + expiryMonths);
        
        // Format as YYYY-MM-DD
        const expiryDateStr = expiryDate.toISOString().split('T')[0];
        
        // Update record
        const { error: updateError } = await supabase
          .from('staff_training_matrix')
          .update({ expiry_date: expiryDateStr })
          .eq('id', record.id);
        
        if (updateError) {
          console.error(`Error updating record ${record.id}:`, updateError);
          errors++;
        } else {
          updated++;
        }
      }
      
      processed += records.length;
      if (processed >= totalCount) break;
    }
    
    console.log(`\n✅ Complete!`);
    console.log(`  Processed: ${processed}`);
    console.log(`  Updated: ${updated}`);
    console.log(`  Errors: ${errors}`);
    
  } catch (err) {
    console.error('Error:', err.message);
  }
}

calculateExpiryDates();
