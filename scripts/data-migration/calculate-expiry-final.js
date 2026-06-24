const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function calculateExpiryDatesSQL() {
  try {
    console.log('Calculating expiry dates using raw SQL...\n');
    
    // Use raw SQL to update all expiry dates in one go
    const { data, error } = await supabase
      .rpc('execute_raw_sql', {
        query: `
          UPDATE staff_training_matrix stm
          SET expiry_date = (
            CAST(
              DATE_TRUNC('month', stm.completion_date::timestamp) + 
              (c.expiry_months || ' months')::interval + 
              INTERVAL '1 month' - INTERVAL '1 day'
              AS DATE
            )
          )
          FROM courses c
          WHERE stm.course_id = c.id
            AND stm.completion_date IS NOT NULL
            AND stm.expiry_date IS NULL
            AND c.expiry_months IS NOT NULL
            AND c.expiry_months > 0
        `
      });
    
    if (error) {
      console.log('RPC not available, using Node.js approach...\n');
      
      // Get total count first
      const { count: totalCount } = await supabase
        .from('staff_training_matrix')
        .select('id', { count: 'exact', head: true })
        .not('completion_date', 'is', null)
        .is('expiry_date', null);
      
      console.log(`Found ${totalCount} records to process\n`);
      
      // Get all courses
      const { data: courses } = await supabase
        .from('courses')
        .select('id, expiry_months');
      
      const courseMap = new Map();
      courses.forEach(c => {
        if (c.expiry_months && c.expiry_months > 0) {
          courseMap.set(c.id, c.expiry_months);
        }
      });
      
      console.log(`Courses with expiry_months: ${courseMap.size}\n`);
      
      let allUpdates = [];
      const fetchPageSize = 1000;
      
      // Fetch all records in pages
      for (let offset = 0; offset < totalCount; offset += fetchPageSize) {
        const { data: records, error: fetchError } = await supabase
          .from('staff_training_matrix')
          .select('id, completion_date, course_id')
          .not('completion_date', 'is', null)
          .is('expiry_date', null)
          .range(offset, offset + fetchPageSize - 1);
        
        if (fetchError) {
          console.error('Fetch error:', fetchError);
          break;
        }
        
        console.log(`Fetched ${records.length} records (offset ${offset})...`);
        
        // Calculate updates for this page
        const pageUpdates = records
          .filter(r => courseMap.has(r.course_id))
          .map(r => {
            const [year, month, day] = r.completion_date.split('-').map(Number);
            const expiryMonths = courseMap.get(r.course_id);
            
            // Calculate expiry date properly with month arithmetic
            let expiryYear = year;
            let expiryMonth = month + expiryMonths;
            
            while (expiryMonth > 12) {
              expiryMonth -= 12;
              expiryYear += 1;
            }
            
            const expiryDateStr = `${expiryYear}-${String(expiryMonth).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
            
            return {
              id: r.id,
              expiry_date: expiryDateStr
            };
          });
        
        allUpdates = allUpdates.concat(pageUpdates);
      }
      
      console.log(`\nTotal records to update: ${allUpdates.length}\n`);
      
      if (allUpdates.length > 0) {
        let batchSize = 500;
        let updated = 0;
        
        for (let i = 0; i < allUpdates.length; i += batchSize) {
          const batch = allUpdates.slice(i, i + batchSize);
          
          // Use update instead of upsert to avoid violating constraints
          const updatePromises = batch.map(update =>
            supabase
              .from('staff_training_matrix')
              .update({ expiry_date: update.expiry_date })
              .eq('id', update.id)
          );
          
          const results = await Promise.all(updatePromises);
          
          let batchSuccess = 0;
          results.forEach(result => {
            if (!result.error) {
              batchSuccess++;
            }
          });
          
          updated += batchSuccess;
          console.log(`Updated ${updated}/${allUpdates.length} records...`);
        }
        
        console.log(`\n✅ Complete! Updated ${updated} records`);
      }
      return;
    }
    
    console.log('✅ SQL execution complete!');
    
  } catch (err) {
    console.error('Error:', err.message);
  }
}

calculateExpiryDatesSQL();
