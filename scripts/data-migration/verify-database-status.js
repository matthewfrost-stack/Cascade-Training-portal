#!/usr/bin/env node

/**
 * VERIFICATION SCRIPT: Check Database Status
 * 
 * Shows current state of courses and expiry dates in the database
 */

import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function verify() {
  console.log('\n' + '═'.repeat(60));
  console.log('  DATABASE VERIFICATION');
  console.log('═'.repeat(60) + '\n');
  
  try {
    // Check courses
    const { data: courses, count: courseCount } = await supabase
      .from('courses')
      .select('id, name, expiry_months', { count: 'exact' })
      .limit(1);
    
    console.log('📊 COURSES TABLE:');
    console.log(`   Total courses: ${courseCount}`);
    
    const { data: withExpiry, count: expiryCount } = await supabase
      .from('courses')
      .select('id', { count: 'exact' })
      .not('expiry_months', 'is', null);
    
    console.log(`   With expiry_months set: ${expiryCount}`);
    
    const { data: nullExpiry, count: nullCount } = await supabase
      .from('courses')
      .select('id', { count: 'exact' })
      .is('expiry_months', null);
    
    console.log(`   One-off (no expiry): ${nullCount}\n`);
    
    // Check training matrix
    console.log('📋 TRAINING MATRIX:');
    
    const { data: trainDat, count: trainCount } = await supabase
      .from('staff_training_matrix')
      .select('id', { count: 'exact' });
    
    console.log(`   Total records: ${trainCount}`);
    
    const { data: completed, count: completedCount } = await supabase
      .from('staff_training_matrix')
      .select('id', { count: 'exact' })
      .eq('status', 'completed');
    
    console.log(`   Completed: ${completedCount}`);
    
    const { data: hasExpiry, count: expiryRecords } = await supabase
      .from('staff_training_matrix')
      .select('id', { count: 'exact' })
      .not('expiry_date', 'is', null);
    
    console.log(`   With expiry_date: ${expiryRecords}`);
    
    const { data: noExpiry, count: noExpiryCount } = await supabase
      .from('staff_training_matrix')
      .select('id', { count: 'exact' })
      .not('completion_date', 'is', null)
      .is('expiry_date', null);
    
    console.log(`   Missing expiry_date: ${noExpiryCount}\n`);
    
    // Sample expiry dates
    console.log('📅 SAMPLE EXPIRY DATES:');
    const { data: samples } = await supabase
      .from('staff_training_matrix')
      .select('id, courses(name), completion_date, expiry_date, status')
      .not('expiry_date', 'is', null)
      .limit(5);
    
    if (samples && samples.length > 0) {
      samples.forEach((s, i) => {
        console.log(`   ${i + 1}. ${s.courses.name}`);
        console.log(`      Completed: ${s.completion_date}`);
        console.log(`      Expires: ${s.expiry_date}`);
      });
    }
    
    // Summary
    console.log('\n' + '═'.repeat(60));
    if (noExpiryCount === 0) {
      console.log('✅ DATABASE IS FULLY SYNCED - ALL EXPIRY DATES POPULATED');
    } else {
      console.log(`⚠️  ${noExpiryCount} records still need expiry dates`);
      console.log('   Run: node calculate-missing-expiry-maintenance.js');
    }
    console.log('═'.repeat(60) + '\n');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

verify();
