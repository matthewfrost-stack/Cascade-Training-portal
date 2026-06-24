#!/usr/bin/env node

/**
 * MAINTENANCE SCRIPT: Update Expiry Dates for New Records
 * 
 * This script should be run after importing new training records to ensure
 * expiry dates are calculated for any records with completion dates.
 * 
 * Usage: node calculate-missing-expiry-maintenance.js
 */

import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function getStatistics() {
  console.log('📊 CHECKING FOR MISSING EXPIRY DATES\n');
  
  // Get total records with completion_date but no expiry_date
  const { data: missingExpiry, count: missingCount } = await supabase
    .from('staff_training_matrix')
    .select('id', { count: 'exact' })
    .not('completion_date', 'is', null)
    .is('expiry_date', null);
  
  if (!missingExpiry) {
    console.log('❌ Error fetching statistics');
    return null;
  }
  
  console.log(`Found ${missingCount} records with completion_date but no expiry_date\n`);
  
  // Get count of records WITH expiry_date
  const { data: hasExpiry, count: withExpiryCount } = await supabase
    .from('staff_training_matrix')
    .select('id', { count: 'exact' })
    .not('expiry_date', 'is', null);
  
  console.log(`Records WITH expiry_date: ${withExpiryCount}`);
  console.log(`Records WITHOUT expiry_date: ${missingCount}`);
  console.log(`Total completed records: ${withExpiryCount + missingCount}\n`);
  
  return { missing: missingCount, withExpiry: withExpiryCount };
}

async function calculateMissingExpiries() {
  console.log('🔄 CALCULATING MISSING EXPIRY DATES\n');
  console.log('='.repeat(60) + '\n');
  
  const { data: courses, error: coursesError } = await supabase
    .from('courses')
    .select('id, name, expiry_months');
  
  if (coursesError || !courses) {
    console.error('❌ Error loading courses:', coursesError?.message);
    return 0;
  }
  
  const courseMap = new Map();
  courses.forEach(c => {
    courseMap.set(c.id, c.expiry_months);
  });
  
  let totalUpdated = 0;
  let pageSize = 1000;
  let offset = 0;
  
  console.log(`Processing records...\n`);
  
  while (true) {
    const { data: records, error } = await supabase
      .from('staff_training_matrix')
      .select('id, course_id, completion_date')
      .not('completion_date', 'is', null)
      .is('expiry_date', null)
      .range(offset, offset + pageSize - 1);
    
    if (error) {
      console.error(`❌ Error: ${error.message}`);
      break;
    }
    
    if (!records || records.length === 0) {
      break;
    }
    
    const updates = [];
    
    for (const record of records) {
      const months = courseMap.get(record.course_id);
      
      if (!months) continue;
      
      const date = new Date(record.completion_date);
      date.setMonth(date.getMonth() + months);
      const expiryDate = date.toISOString().split('T')[0];
      
      updates.push({
        id: record.id,
        expiry_date: expiryDate
      });
    }
    
    // Batch update
    let pageUpdated = 0;
    for (let i = 0; i < updates.length; i += 100) {
      const batch = updates.slice(i, i + 100);
      
      for (const update of batch) {
        const { error: updateError } = await supabase
          .from('staff_training_matrix')
          .update({ expiry_date: update.expiry_date })
          .eq('id', update.id);
        
        if (!updateError) {
          pageUpdated++;
        }
      }
    }
    
    if (pageUpdated > 0) {
      totalUpdated += pageUpdated;
      console.log(`✅ Updated ${pageUpdated} records (${totalUpdated} total)`);
    }
    
    if (records.length < pageSize) {
      break;
    }
    
    offset += pageSize;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  
  return totalUpdated;
}

async function main() {
  console.log('\n' + '═'.repeat(60));
  console.log('  MAINTENANCE: Calculate Missing Expiry Dates');
  console.log('═'.repeat(60) + '\n');
  
  try {
    // Check statistics
    const stats = await getStatistics();
    
    if (!stats || stats.missing === 0) {
      console.log('✅ No missing expiry dates found. Database is up to date!\n');
      return;
    }
    
    // Calculate missing dates
    const updated = await calculateMissingExpiries();
    
    console.log('\n' + '═'.repeat(60));
    console.log('  ✅ COMPLETE');
    console.log('═'.repeat(60) + '\n');
    console.log(`✅ ${updated} expiry dates calculated and saved\n`);
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

main();
