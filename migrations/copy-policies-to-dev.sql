CREATE POLICY "Admin delete ticket_updates" ON "dev"."ticket_updates" FOR DELETE USING (("dev"."current_user_role_tier"() = 'admin'::"text"));
CREATE POLICY "Admin profile management" ON "dev"."profiles" USING (("dev"."current_user_role_tier"() = 'admin'::"text")) WITH CHECK (("dev"."current_user_role_tier"() = 'admin'::"text"));
CREATE POLICY "Admin update ticket_updates" ON "dev"."ticket_updates" FOR UPDATE USING (("dev"."current_user_role_tier"() = 'admin'::"text")) WITH CHECK (("dev"."current_user_role_tier"() = 'admin'::"text"));
CREATE POLICY "Admins can delete courses" ON "dev"."courses" FOR DELETE TO "authenticated" USING (true);
CREATE POLICY "Admins can delete locations" ON "dev"."locations" FOR DELETE TO "authenticated" USING (true);
CREATE POLICY "Allow admin writes" ON "dev"."feedback_form_config" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "dev"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role_tier" = 'admin'::"dev"."user_role"))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "dev"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role_tier" = 'admin'::"dev"."user_role")))));
CREATE POLICY "Allow authenticated reads" ON "dev"."course_feedback" FOR SELECT TO "authenticated" USING (true);
CREATE POLICY "Allow authenticated reads" ON "dev"."feedback_email_logs" FOR SELECT TO "authenticated";
CREATE POLICY "Allow authenticated reads" ON "dev"."feedback_form_config" FOR SELECT TO "authenticated" USING (true);
CREATE POLICY "Allow authenticated to read staff_training_locations" ON "dev"."staff_training_locations" FOR SELECT USING (true);
CREATE POLICY "Allow public inserts" ON "dev"."course_feedback" FOR INSERT TO "authenticated", "anon" WITH CHECK (true);
CREATE POLICY "App admin write courses" ON "dev"."courses" USING (("dev"."current_user_role_tier"() = 'admin'::"text")) WITH CHECK (("dev"."current_user_role_tier"() = 'admin'::"text"));
CREATE POLICY "App admin write feedback_automation_settings" ON "dev"."feedback_automation_settings" USING (("dev"."current_user_role_tier"() = 'admin'::"text"));
CREATE POLICY "App admin write feedback_settings" ON "dev"."feedback_settings" USING (("dev"."current_user_role_tier"() = 'admin'::"text"));
CREATE POLICY "App admin write location_courses" ON "dev"."location_courses" USING (("dev"."current_user_role_tier"() = 'admin'::"text")) WITH CHECK (("dev"."current_user_role_tier"() = 'admin'::"text"));
CREATE POLICY "App admin write location_training_courses" ON "dev"."location_training_courses" USING (("dev"."current_user_role_tier"() = 'admin'::"text")) WITH CHECK (("dev"."current_user_role_tier"() = 'admin'::"text"));
CREATE POLICY "App admin write locations" ON "dev"."locations" USING (("dev"."current_user_role_tier"() = 'admin'::"text")) WITH CHECK (("dev"."current_user_role_tier"() = 'admin'::"text"));
CREATE POLICY "App admin write training_courses" ON "dev"."training_courses" USING (("dev"."current_user_role_tier"() = 'admin'::"text")) WITH CHECK (("dev"."current_user_role_tier"() = 'admin'::"text"));
CREATE POLICY "App admin write venues" ON "dev"."venues" USING (("dev"."current_user_role_tier"() = 'admin'::"text")) WITH CHECK (("dev"."current_user_role_tier"() = 'admin'::"text"));
CREATE POLICY "App authenticated read courses" ON "dev"."courses" FOR SELECT USING (("auth"."uid"() IS NOT NULL));
CREATE POLICY "App authenticated read feedback_settings" ON "dev"."feedback_settings" FOR SELECT USING (("auth"."uid"() IS NOT NULL));
CREATE POLICY "App authenticated read location_courses" ON "dev"."location_courses" FOR SELECT USING (("auth"."uid"() IS NOT NULL));
CREATE POLICY "App authenticated read location_training_courses" ON "dev"."location_training_courses" FOR SELECT USING (("auth"."uid"() IS NOT NULL));
CREATE POLICY "App authenticated read locations" ON "dev"."locations" FOR SELECT USING (("auth"."uid"() IS NOT NULL));
CREATE POLICY "App authenticated read training_courses" ON "dev"."training_courses" FOR SELECT USING (("auth"."uid"() IS NOT NULL));
CREATE POLICY "App authenticated read venues" ON "dev"."venues" FOR SELECT USING (("auth"."uid"() IS NOT NULL));
CREATE POLICY "App scheduler admin read booking_checklists" ON "dev"."booking_checklists" FOR SELECT USING (("dev"."current_user_role_tier"() = ANY (ARRAY['scheduler'::"text", 'admin'::"text"])));
CREATE POLICY "App scheduler admin read checklist_completions" ON "dev"."checklist_completions" FOR SELECT USING (("dev"."current_user_role_tier"() = ANY (ARRAY['scheduler'::"text", 'admin'::"text"])));
CREATE POLICY "App scheduler admin read email_logs" ON "dev"."email_logs" FOR SELECT USING ((( SELECT "profiles"."role_tier"
   FROM "dev"."profiles"
  WHERE ("profiles"."id" = "auth"."uid"())) = ANY (ARRAY['scheduler'::"dev"."user_role", 'admin'::"dev"."user_role"])));
CREATE POLICY "App scheduler admin read feedback_automation_settings" ON "dev"."feedback_automation_settings" FOR SELECT USING (("dev"."current_user_role_tier"() = ANY (ARRAY['scheduler'::"text", 'admin'::"text"])));
CREATE POLICY "App scheduler admin write booking_checklists" ON "dev"."booking_checklists" USING (("dev"."current_user_role_tier"() = ANY (ARRAY['scheduler'::"text", 'admin'::"text"]))) WITH CHECK (("dev"."current_user_role_tier"() = ANY (ARRAY['scheduler'::"text", 'admin'::"text"])));
CREATE POLICY "App scheduler admin write checklist_completions" ON "dev"."checklist_completions" USING (("dev"."current_user_role_tier"() = ANY (ARRAY['scheduler'::"text", 'admin'::"text"]))) WITH CHECK (("dev"."current_user_role_tier"() = ANY (ARRAY['scheduler'::"text", 'admin'::"text"])));
CREATE POLICY "Authenticated users can read location_matrix_dividers" ON "dev"."location_matrix_dividers" FOR SELECT USING (("auth"."uid"() IS NOT NULL));
CREATE POLICY "Enable delete for admins" ON "dev"."venues" FOR DELETE TO "authenticated" USING (true);
CREATE POLICY "Enable insert for admins" ON "dev"."locations" FOR INSERT TO "authenticated" WITH CHECK (true);
CREATE POLICY "Enable insert for admins" ON "dev"."venues" FOR INSERT TO "authenticated" WITH CHECK (true);
CREATE POLICY "Enable read for all" ON "dev"."locations" FOR SELECT TO "authenticated" USING (true);
CREATE POLICY "Enable read for all" ON "dev"."venues" FOR SELECT TO "authenticated" USING (true);
CREATE POLICY "Enable read for all users" ON "dev"."location_training_courses" FOR SELECT USING (true);
CREATE POLICY "Enable read for all users" ON "dev"."training_courses" FOR SELECT USING (true);
CREATE POLICY "Enable read for service role only" ON "dev"."deleted_items" FOR SELECT USING (("auth"."role"() = 'service_role'::"text"));
CREATE POLICY "Enable write for service role" ON "dev"."location_training_courses" USING (("auth"."role"() = 'service_role'::"text")) WITH CHECK (("auth"."role"() = 'service_role'::"text"));
CREATE POLICY "Enable write for service role" ON "dev"."training_courses" USING (("auth"."role"() = 'service_role'::"text")) WITH CHECK (("auth"."role"() = 'service_role'::"text"));
CREATE POLICY "Enable write for service role only" ON "dev"."deleted_items" USING (("auth"."role"() = 'service_role'::"text"));
CREATE POLICY "Qualification lead location visibility" ON "dev"."qualification_leads" FOR SELECT USING ((("dev"."current_user_role_tier"() = ANY (ARRAY['admin'::"text", 'scheduler'::"text"])) OR (("dev"."current_user_role_tier"() = 'manager'::"text") AND ("location_id" IN ( SELECT "dev"."current_user_location_ids"() AS "current_user_location_ids")))));
CREATE POLICY "Qualification lead management" ON "dev"."qualification_leads" USING ((("dev"."current_user_role_tier"() = ANY (ARRAY['admin'::"text", 'scheduler'::"text"])) OR (("dev"."current_user_role_tier"() = 'manager'::"text") AND ("location_id" IN ( SELECT "dev"."current_user_location_ids"() AS "current_user_location_ids"))))) WITH CHECK ((("dev"."current_user_role_tier"() = ANY (ARRAY['admin'::"text", 'scheduler'::"text"])) OR (("dev"."current_user_role_tier"() = 'manager'::"text") AND ("location_id" IN ( SELECT "dev"."current_user_location_ids"() AS "current_user_location_ids")))));
CREATE POLICY "Qualification timeline location visibility" ON "dev"."qualification_lead_timeline" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "dev"."qualification_leads" "lead"
  WHERE (("lead"."id" = "qualification_lead_timeline"."lead_id") AND (("dev"."current_user_role_tier"() = ANY (ARRAY['admin'::"text", 'scheduler'::"text"])) OR (("dev"."current_user_role_tier"() = 'manager'::"text") AND ("lead"."location_id" IN ( SELECT "dev"."current_user_location_ids"() AS "current_user_location_ids"))))))));
CREATE POLICY "Qualification timeline management" ON "dev"."qualification_lead_timeline" USING ((EXISTS ( SELECT 1
   FROM "dev"."qualification_leads" "lead"
  WHERE (("lead"."id" = "qualification_lead_timeline"."lead_id") AND (("dev"."current_user_role_tier"() = ANY (ARRAY['admin'::"text", 'scheduler'::"text"])) OR (("dev"."current_user_role_tier"() = 'manager'::"text") AND ("lead"."location_id" IN ( SELECT "dev"."current_user_location_ids"() AS "current_user_location_ids")))))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "dev"."qualification_leads" "lead"
  WHERE (("lead"."id" = "qualification_lead_timeline"."lead_id") AND (("dev"."current_user_role_tier"() = ANY (ARRAY['admin'::"text", 'scheduler'::"text"])) OR (("dev"."current_user_role_tier"() = 'manager'::"text") AND ("lead"."location_id" IN ( SELECT "dev"."current_user_location_ids"() AS "current_user_location_ids"))))))));
CREATE POLICY "Scheduler booking management" ON "dev"."bookings" USING (("dev"."current_user_role_tier"() = ANY (ARRAY['scheduler'::"text", 'admin'::"text"]))) WITH CHECK (("dev"."current_user_role_tier"() = ANY (ARRAY['scheduler'::"text", 'admin'::"text"])));
CREATE POLICY "Scheduler event management" ON "dev"."training_events" USING (("dev"."current_user_role_tier"() = ANY (ARRAY['scheduler'::"text", 'admin'::"text"]))) WITH CHECK (("dev"."current_user_role_tier"() = ANY (ARRAY['scheduler'::"text", 'admin'::"text"])));
CREATE POLICY "Scheduler event override management" ON "dev"."course_event_overrides" USING (("dev"."current_user_role_tier"() = ANY (ARRAY['scheduler'::"text", 'admin'::"text"]))) WITH CHECK (("dev"."current_user_role_tier"() = ANY (ARRAY['scheduler'::"text", 'admin'::"text"])));
CREATE POLICY "Scheduler staff location management" ON "dev"."staff_locations" USING (("dev"."current_user_role_tier"() = ANY (ARRAY['scheduler'::"text", 'admin'::"text"]))) WITH CHECK (("dev"."current_user_role_tier"() = ANY (ARRAY['scheduler'::"text", 'admin'::"text"])));
CREATE POLICY "Scheduler training management" ON "dev"."staff_training_matrix" USING (("dev"."current_user_role_tier"() = ANY (ARRAY['scheduler'::"text", 'admin'::"text"]))) WITH CHECK (("dev"."current_user_role_tier"() = ANY (ARRAY['scheduler'::"text", 'admin'::"text"])));
CREATE POLICY "Schedulers and admins read booking_checklists" ON "dev"."booking_checklists" FOR SELECT USING ((( SELECT "profiles"."role_tier"
   FROM "dev"."profiles"
  WHERE ("profiles"."id" = "auth"."uid"())) = ANY (ARRAY['scheduler'::"dev"."user_role", 'admin'::"dev"."user_role"])));
CREATE POLICY "Schedulers and admins read checklist_completions" ON "dev"."checklist_completions" FOR SELECT USING ((( SELECT "profiles"."role_tier"
   FROM "dev"."profiles"
  WHERE ("profiles"."id" = "auth"."uid"())) = ANY (ARRAY['scheduler'::"dev"."user_role", 'admin'::"dev"."user_role"])));
CREATE POLICY "Schedulers and admins write booking_checklists" ON "dev"."booking_checklists" USING ((( SELECT "profiles"."role_tier"
   FROM "dev"."profiles"
  WHERE ("profiles"."id" = "auth"."uid"())) = ANY (ARRAY['scheduler'::"dev"."user_role", 'admin'::"dev"."user_role"]))) WITH CHECK ((( SELECT "profiles"."role_tier"
   FROM "dev"."profiles"
  WHERE ("profiles"."id" = "auth"."uid"())) = ANY (ARRAY['scheduler'::"dev"."user_role", 'admin'::"dev"."user_role"])));
CREATE POLICY "Schedulers and admins write checklist_completions" ON "dev"."checklist_completions" USING ((( SELECT "profiles"."role_tier"
   FROM "dev"."profiles"
  WHERE ("profiles"."id" = "auth"."uid"())) = ANY (ARRAY['scheduler'::"dev"."user_role", 'admin'::"dev"."user_role"]))) WITH CHECK ((( SELECT "profiles"."role_tier"
   FROM "dev"."profiles"
  WHERE ("profiles"."id" = "auth"."uid"())) = ANY (ARRAY['scheduler'::"dev"."user_role", 'admin'::"dev"."user_role"])));
CREATE POLICY "Schedulers/admins can write location_matrix_dividers" ON "dev"."location_matrix_dividers" USING ((( SELECT "profiles"."role_tier"
   FROM "dev"."profiles"
  WHERE ("profiles"."id" = "auth"."uid"())) = ANY (ARRAY['scheduler'::"dev"."user_role", 'admin'::"dev"."user_role"]))) WITH CHECK ((( SELECT "profiles"."role_tier"
   FROM "dev"."profiles"
  WHERE ("profiles"."id" = "auth"."uid"())) = ANY (ARRAY['scheduler'::"dev"."user_role", 'admin'::"dev"."user_role"])));
CREATE POLICY "Self service booking visibility" ON "dev"."bookings" FOR SELECT USING ((("dev"."current_user_role_tier"() = ANY (ARRAY['admin'::"text", 'manager'::"text", 'scheduler'::"text"])) OR ("profile_id" = "auth"."uid"())));
CREATE POLICY "Self service event override visibility" ON "dev"."course_event_overrides" FOR SELECT USING ((("dev"."current_user_role_tier"() = ANY (ARRAY['admin'::"text", 'manager'::"text", 'scheduler'::"text"])) OR (("dev"."current_user_role_tier"() = 'staff'::"text") AND (EXISTS ( SELECT 1
   FROM ("dev"."bookings" "b"
     JOIN "dev"."training_events" "te" ON (("te"."id" = "b"."event_id")))
  WHERE (("b"."profile_id" = "auth"."uid"()) AND ("te"."course_id" = "course_event_overrides"."course_id") AND ("te"."event_date" = "course_event_overrides"."event_date")))))));
CREATE POLICY "Self service event visibility" ON "dev"."training_events" FOR SELECT USING ((("dev"."current_user_role_tier"() = ANY (ARRAY['admin'::"text", 'manager'::"text", 'scheduler'::"text"])) OR (("dev"."current_user_role_tier"() = 'staff'::"text") AND (EXISTS ( SELECT 1
   FROM "dev"."bookings" "b"
  WHERE (("b"."event_id" = "training_events"."id") AND ("b"."profile_id" = "auth"."uid"())))))));
CREATE POLICY "Self service profile visibility" ON "dev"."profiles" FOR SELECT USING ((("dev"."current_user_role_tier"() = ANY (ARRAY['admin'::"text", 'manager'::"text", 'scheduler'::"text"])) OR ("id" = "auth"."uid"())));
CREATE POLICY "Self service staff location visibility" ON "dev"."staff_locations" FOR SELECT USING ((("dev"."current_user_role_tier"() = ANY (ARRAY['admin'::"text", 'manager'::"text", 'scheduler'::"text"])) OR ("staff_id" = "auth"."uid"())));
CREATE POLICY "Self service training visibility" ON "dev"."staff_training_matrix" FOR SELECT USING ((("dev"."current_user_role_tier"() = ANY (ARRAY['admin'::"text", 'manager'::"text", 'scheduler'::"text"])) OR ("staff_id" = "auth"."uid"())));
CREATE POLICY "Service role full access booking_checklists" ON "dev"."booking_checklists" USING ((("auth"."jwt"() ->> 'role'::"text") = 'service_role'::"text")) WITH CHECK ((("auth"."jwt"() ->> 'role'::"text") = 'service_role'::"text"));
CREATE POLICY "Service role full access checklist_completions" ON "dev"."checklist_completions" USING ((("auth"."jwt"() ->> 'role'::"text") = 'service_role'::"text")) WITH CHECK ((("auth"."jwt"() ->> 'role'::"text") = 'service_role'::"text"));
CREATE POLICY "Service role full access location_matrix_dividers" ON "dev"."location_matrix_dividers" USING ((("auth"."jwt"() ->> 'role'::"text") = 'service_role'::"text")) WITH CHECK ((("auth"."jwt"() ->> 'role'::"text") = 'service_role'::"text"));
CREATE POLICY "Service role insert email_logs" ON "dev"."email_logs" FOR INSERT WITH CHECK ((("auth"."jwt"() ->> 'role'::"text") = 'service_role'::"text"));
CREATE POLICY "Service role read email_logs" ON "dev"."email_logs" FOR SELECT USING ((("auth"."jwt"() ->> 'role'::"text") = 'service_role'::"text"));
CREATE POLICY "Users can view allowed rows" ON "dev"."booking_checklist_template_items" FOR SELECT TO "authenticated" USING (("auth"."uid"() IS NOT NULL));
CREATE POLICY "courses_insert" ON "dev"."courses" FOR INSERT WITH CHECK (true);
CREATE POLICY "courses_select" ON "dev"."courses" FOR SELECT USING (true);
CREATE POLICY "courses_update" ON "dev"."courses" FOR UPDATE USING (true);
CREATE POLICY "location_courses_insert" ON "dev"."location_courses" FOR INSERT WITH CHECK (true);
CREATE POLICY "location_courses_select" ON "dev"."location_courses" FOR SELECT USING (true);
CREATE POLICY "location_courses_update" ON "dev"."location_courses" FOR UPDATE USING (true);
