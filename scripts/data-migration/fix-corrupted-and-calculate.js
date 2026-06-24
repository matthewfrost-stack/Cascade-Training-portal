import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Fix corrupted dates first
console.log("Fixing corrupted dates...\n");

const { data: corrupted } = await supabase
  .from("staff_training_matrix")
  .select("id, completion_date")
  .like("completion_date", "220%");

console.log(`Found ${corrupted?.length || 0} corrupted dates\n`);

for (const record of corrupted || []) {
  const fixed = record.completion_date.replace(/^220/, "20");
  console.log(`ID ${record.id}: ${record.completion_date} → ${fixed}`);
  
  await supabase
    .from("staff_training_matrix")
    .update({ completion_date: fixed })
    .eq("id", record.id);
}

console.log("\nNow calculating missing expiry dates...\n");

// Get records without expiry_date that belong to courses WITH expiry_months AND have completion dates
const { data: allMissing } = await supabase
  .from("staff_training_matrix")
  .select(
    `id, course_id, completion_date, expiry_date, status,
     courses!inner(id, name, expiry_months)`
  )
  .is("expiry_date", null)
  .eq("status", "completed")
  .not("courses.expiry_months", "is", null)
  .not("completion_date", "is", null);

console.log(`Found ${allMissing?.length} records with valid completion dates\n`);

let calculated = 0;

for (const record of allMissing || []) {
  const completionDate = new Date(record.completion_date);
  const expiryDate = new Date(completionDate);
  expiryDate.setMonth(expiryDate.getMonth() + record.courses.expiry_months);
  const expiryDateStr = expiryDate.toISOString().split('T')[0];
  
  const { error } = await supabase
    .from("staff_training_matrix")
    .update({ expiry_date: expiryDateStr })
    .eq("id", record.id);
  
  if (!error) {
    calculated++;
    if (calculated % 100 === 0) {
      console.log(`✅ ${calculated} records updated...`);
    }
  }
}

console.log(`\n=== COMPLETE ===`);
console.log(`Total expiry dates calculated: ${calculated}`);
