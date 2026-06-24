import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function comprehensiveDiagnostic() {
  console.log('🔍 COMPREHENSIVE DIAGNOSTIC - CHECKING ALL RECORDS\n');
  
  try {
    // 1. Get TOTAL count of all records
    const { count: totalRecords } = await supabase
      .from('staff_training_matrix')
      .select('*', { count: 'exact', head: true });
    
    console.log(`📊 Total records in database: ${totalRecords}\n`);
    
    // 2. Load ALL records (no limit)
    console.log(`⏳ Loading all ${totalRecords} records from database...`);
    let allRecords = [];
    const pageSize = 1000;
    
    for (let i = 0; i < totalRecords; i += pageSize) {
      const { data, error } = await supabase
        .from('staff_training_matrix')
        .select('id, staff_id, course_id, completion_date, expiry_date, status, profiles(location), courses(id, name, expiry_months)')
        .range(i, i + pageSize - 1);
      
      if (error) {
        console.error(`Error loading records ${i}-${i + pageSize}: ${error.message}`);
        continue;
      }
      
      allRecords = allRecords.concat(data || []);
      console.log(`  ✓ Loaded ${allRecords.length}/${totalRecords} records...`);
    }
    
    console.log(`✅ Loaded all ${allRecords.length} records\n`);
    
    // 3. Analyze issues
    console.log('📋 ANALYZING ALL RECORDS FOR ISSUES:\n');
    
    const issues = {
      nullExpiry: [],
      nullCourse: [],
      nullCompletion: [],
      calculationMismatch: [],
      nullExpiryMonths: [],
      zeroExpiryMonths: [],
      missingMonthsDisplay: []
    };
    
    allRecords.forEach(record => {
      const courseName = record.courses?.[0]?.name || 'UNKNOWN';
      const expiryMonths = record.courses?.[0]?.expiry_months;
      const location = record.profiles?.[0]?.location || 'UNKNOWN';
      
      // Issue: NULL expiry_date
      if (!record.expiry_date) {
        issues.nullExpiry.push({
          id: record.id,
          staff_id: record.staff_id,
          course: courseName,
          location: location,
          completion_date: record.completion_date,
          expiryMonths: expiryMonths
        });
      }
      
      // Issue: NULL or missing course
      if (!record.courses || record.courses.length === 0) {
        issues.nullCourse.push({
          id: record.id,
          staff_id: record.staff_id,
          course_id: record.course_id,
          location: location
        });
      }
      
      // Issue: NULL completion_date
      if (!record.completion_date) {
        issues.nullCompletion.push({
          id: record.id,
          staff_id: record.staff_id,
          course: courseName,
          location: location
        });
      }
      
      // Issue: NULL or zero expiry_months in course
      if (expiryMonths === null || expiryMonths === 0 || expiryMonths === undefined) {
        issues.nullExpiryMonths.push({
          id: record.id,
          course: courseName,
          course_id: record.course_id,
          location: location,
          expiryMonths: expiryMonths
        });
      }
      
      // Issue: Calculation mismatch
      if (record.completion_date && expiryMonths && record.expiry_date) {
        const completionDate = new Date(record.completion_date);
        const expectedExpiry = new Date(completionDate);
        expectedExpiry.setMonth(expectedExpiry.getMonth() + expiryMonths);
        
        const storedExpiry = new Date(record.expiry_date);
        
        // Allow up to 1 day difference for timezone/calculation variance
        const diffDays = Math.abs((storedExpiry - expectedExpiry) / (1000 * 60 * 60 * 24));
        if (diffDays > 1) {
          issues.calculationMismatch.push({
            id: record.id,
            course: courseName,
            location: location,
            completion_date: record.completion_date,
            expiryMonths: expiryMonths,
            expected_expiry: expectedExpiry.toISOString().split('T')[0],
            actual_expiry: record.expiry_date,
            difference_days: diffDays.toFixed(1)
          });
        }
      }
    });
    
    // 4. Report findings
    console.log(`❌ NULL expiry_date: ${issues.nullExpiry.length} records`);
    if (issues.nullExpiry.length > 0) {
      console.log('  Examples:');
      issues.nullExpiry.slice(0, 5).forEach(r => {
        console.log(`    - ${r.location}: ${r.course} (completion: ${r.completion_date}, expiryMonths: ${r.expiryMonths})`);
      });
      if (issues.nullExpiry.length > 5) {
        console.log(`    ... and ${issues.nullExpiry.length - 5} more`);
      }
    }
    
    console.log(`\n❌ NULL course reference: ${issues.nullCourse.length} records`);
    if (issues.nullCourse.length > 0) {
      issues.nullCourse.slice(0, 5).forEach(r => {
        console.log(`    - ${r.location}: course_id ${r.course_id}`);
      });
    }
    
    console.log(`\n❌ NULL completion_date: ${issues.nullCompletion.length} records`);
    if (issues.nullCompletion.length > 0) {
      issues.nullCompletion.slice(0, 5).forEach(r => {
        console.log(`    - ${r.location}: ${r.course}`);
      });
    }
    
    console.log(`\n⚠️  NULL/0/undefined expiry_months in courses: ${issues.nullExpiryMonths.length} records`);
    if (issues.nullExpiryMonths.length > 0) {
      const uniqueCourses = new Set(issues.nullExpiryMonths.map(r => r.course));
      console.log(`  Unique courses affected: ${uniqueCourses.size}`);
      Array.from(uniqueCourses).slice(0, 10).forEach(course => {
        const count = issues.nullExpiryMonths.filter(r => r.course === course).length;
        console.log(`    - ${course}: ${count} records`);
      });
    }
    
    console.log(`\n❌ Calculation mismatches: ${issues.calculationMismatch.length} records`);
    if (issues.calculationMismatch.length > 0) {
      console.log('  Examples:');
      issues.calculationMismatch.slice(0, 5).forEach(r => {
        console.log(`    - ${r.course} (${r.location})`);
        console.log(`      Completion: ${r.completion_date}, Months: ${r.expiryMonths}`);
        console.log(`      Expected: ${r.expected_expiry}, Actual: ${r.actual_expiry}, Diff: ${r.difference_days} days`);
      });
    }
    
    // 5. Summary
    console.log('\n📊 SUMMARY:');
    const totalIssues = issues.nullExpiry.length + issues.nullCourse.length + issues.nullCompletion.length + issues.calculationMismatch.length;
    console.log(`  Total records checked: ${allRecords.length}`);
    console.log(`  Records with issues: ${totalIssues}`);
    console.log(`  Records OK: ${allRecords.length - totalIssues}`);
    console.log(`  Success rate: ${((allRecords.length - totalIssues) / allRecords.length * 100).toFixed(2)}%`);
    
    if (totalIssues === 0) {
      console.log('\n✅ ALL RECORDS ARE CORRECT ACROSS ALL LOCATIONS!');
    } else {
      console.log('\n⚠️  ISSUES DETECTED - NEEDS FIXING');
    }
    
  } catch (err) {
    console.error('Fatal error:', err.message);
  }
}

comprehensiveDiagnostic();
