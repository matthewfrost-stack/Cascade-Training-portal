-- Minimal, valid dev schema policy setup.
-- This avoids the broken 'dev.user_role' comparisons and only creates the key policies needed for app testing.

CREATE POLICY "dev authenticated profiles select"
ON "dev"."profiles"
FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "dev authenticated profiles update"
ON "dev"."profiles"
FOR UPDATE
TO authenticated
USING (id = auth.uid())
WITH CHECK (id = auth.uid());

CREATE POLICY "dev admin courses full access"
ON "dev"."courses"
FOR ALL
TO authenticated
USING (dev.current_user_role_tier() = 'admin')
WITH CHECK (dev.current_user_role_tier() = 'admin');

CREATE POLICY "dev admin locations full access"
ON "dev"."locations"
FOR ALL
TO authenticated
USING (dev.current_user_role_tier() = 'admin')
WITH CHECK (dev.current_user_role_tier() = 'admin');

CREATE POLICY "dev admin venues full access"
ON "dev"."venues"
FOR ALL
TO authenticated
USING (dev.current_user_role_tier() = 'admin')
WITH CHECK (dev.current_user_role_tier() = 'admin');

CREATE POLICY "dev scheduler admin training_events full access"
ON "dev"."training_events"
FOR ALL
TO authenticated
USING (dev.current_user_role_tier() IN ('scheduler', 'admin'))
WITH CHECK (dev.current_user_role_tier() IN ('scheduler', 'admin'));

CREATE POLICY "dev scheduler admin bookings full access"
ON "dev"."bookings"
FOR ALL
TO authenticated
USING (dev.current_user_role_tier() IN ('scheduler', 'admin'))
WITH CHECK (dev.current_user_role_tier() IN ('scheduler', 'admin'));

CREATE POLICY "dev self service bookings read"
ON "dev"."bookings"
FOR SELECT
TO authenticated
USING (
  dev.current_user_role_tier() IN ('admin', 'manager', 'scheduler')
  OR profile_id = auth.uid()
);

CREATE POLICY "dev self service events read"
ON "dev"."training_events"
FOR SELECT
TO authenticated
USING (
  dev.current_user_role_tier() IN ('admin', 'manager', 'scheduler')
  OR EXISTS (
    SELECT 1
    FROM "dev"."bookings" b
    WHERE b.event_id = "training_events".id
      AND b.profile_id = auth.uid()
  )
);

CREATE POLICY "dev service role read email_logs"
ON "dev"."email_logs"
FOR SELECT
TO service_role
USING (true);

CREATE POLICY "dev service role insert email_logs"
ON "dev"."email_logs"
FOR INSERT
TO service_role
WITH CHECK (true);

CREATE POLICY "dev authenticated read feedback_settings"
ON "dev"."feedback_settings"
FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "dev admin feedback_settings full access"
ON "dev"."feedback_settings"
FOR ALL
TO authenticated
USING (dev.current_user_role_tier() = 'admin')
WITH CHECK (dev.current_user_role_tier() = 'admin');

CREATE POLICY "dev authenticated read courses"
ON "dev"."courses"
FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "dev authenticated read locations"
ON "dev"."locations"
FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "dev authenticated read venues"
ON "dev"."venues"
FOR SELECT
TO authenticated
USING (true);
