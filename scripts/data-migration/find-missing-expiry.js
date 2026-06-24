import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const { data: records } = await supabase
  .from("staff_training_matrix")
  .select(
    `id, staff_id, course_id, completion_date, expiry_date, 
     courses!inner(id, name, expiry_months)`
  )
  .is("expiry_date", null)
  .eq("status", "completed")
  .limit(100);

console.log("First 100 records without expiry_date:");
records?.forEach((r) => {
  console.log(
    `ID ${r.id}: ${r.courses.name} (course_id: ${r.course_id}, months: ${r.courses.expiry_months})`
  );
});

if (records?.some((r) => r.courses.expiry_months !== null)) {
  console.log("\nRecords that SHOULD have expiry_date:");
  records
    ?.filter((r) => r.courses.expiry_months !== null)
    .forEach((r) => {
      console.log(
        `  - ${r.id}: ${r.courses.name} (${r.courses.expiry_months} months)`
      );
    });
}
