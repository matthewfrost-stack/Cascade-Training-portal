const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function calculateExpiryDates() {
  try {
    console.log('Calculating expiry dates using SQL...\n');
    
    // Use SQL RPC to update all expiry dates in one query
    const { data, error } = await supabase
      .rpc('calculate_all_expiry_dates');
    
    if (error) {
      console.error('RPC error:', error);
      console.log('Falling back to manual batch updates...\n');
      
      // Get count of records to update
      const { count } = await supabase
        .from('staff_training_matrix')
        .select('id', { count: 'exact', head: true })
        .not('completion_date', 'is', null)
        .is('expiry_date', null);
      
      console.log(`Found ${count} records to process\n`);
      
      let updated = 0;
      const pageSize = 500;
      
      for (let i = 0; i < count; i += pageSize) {
        const { data: records } = await supabase
          .from('staff_training_matrix')
          .select(`
            id,
            completion_date,
            courses (
              expiry_months
            )
          `)
          .not('completion_date', 'is', null)
          .is('expiry_date', null)
          .range(i, i + pageSize - 1);
        
        if (!records || records.length === 0) break;
        
        const updates = records
          .filter(r => r.completion_date && r.courses?.expiry_months)
          .map(r => {
            const completionDate = new Date(r.completion_date);
            const expiryMonths = r.courses.expiry_months;
            const expiryDate = new Date(completionDate);
            expiryDate.setMonth(expiryDate.getMonth() + expiryMonths);
            const expiryDateStr = expiryDate.toISOString().split('T')[0];
            
            return {
              id: r.id,
              expiry_date: expiryDateStr
            };
          });
        
        if (updates.length > 0) {
          const { error: batchError } = await supabase
            .from('staff_training_matrix')
            .upsert(updates, { onConflict: 'id' });
          
          if (!batchError) {
            updated += updates.length;
            console.log(`Updated ${updated} records...`);
          }
        }
      }
      
      console.log(`\n✅ Batch update complete! Updated ${updated} records`);
      return;
    }
    
    console.log(`✅ SQL calculation complete!`);
    console.log(data);
    
  } catch (err) {
    console.error('Error:', err.message);
  }
}

calculateExpiryDates();
