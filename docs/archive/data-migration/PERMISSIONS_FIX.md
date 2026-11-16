# Permissions & Header Info Fix

## Problem Statement
Users were experiencing two related issues:
1. **Permissions not being set correctly on login** - Role/tier information was not being retrieved or lost during API calls
2. **Header info dropping during navigation** - User's name and role would disappear when navigating between routes

## Root Causes

### Root Cause #1: Incomplete Error Handling
In `src/lib/useCurrentUserProfile.ts`, when the profile API request failed (any error other than 401), the error was being thrown completely. This caused the profile hook to lose the `role_tier` information that was briefly loaded.

**Old behavior:**
```typescript
// If API call failed for any reason, profile would be lost
// role_tier would be set to null
```

### Root Cause #2: Missing Dependency Handling
The `useCurrentUserProfile` hook was not re-checking for missing critical data. If the initial API call succeeded but returned null for `role_tier`, there was no mechanism to retry or refresh that data when needed.

### Root Cause #3: No Fallback in Header Component
The `FixedHeader` component didn't have any mechanism to detect when critical profile data was missing and trigger a refresh.

## Solutions Implemented

### Fix #1: Graceful Fallback in Profile Loading
**File:** `src/lib/useCurrentUserProfile.ts`

Modified the `loadProfile()` function to:
- Keep the user authenticated even if the profile API fails temporarily
- Set `role_tier: null` as a fallback instead of losing all data
- Added better error logging to track API issues
- Both the try-catch and fetch error handling now preserve session data

```typescript
// If profile API fails but we have a session, fall back to session data
// This prevents losing the user when the API temporarily fails
if (sessionUser) {
  setIsAuthenticated(true);
  setProfile({
    id: sessionUser.id,
    full_name: sessionUser.user_metadata?.full_name || null,
    email: sessionUser.email || null,
    phone_number: null,
    avatar_path: null,
    role_tier: null,  // Fallback, will be refreshed
    password_needs_change: null,
  });
  return;
}
```

### Fix #2: Auto-Retry for Missing Permissions
**File:** `src/lib/useCurrentUserProfile.ts`

Added a secondary useEffect that monitors the profile state:
- If the user is authenticated but `role_tier` is null, automatically retry the profile fetch
- Includes a 500ms delay to avoid hammering the API
- This ensures permissions are restored even if the initial API call had temporary issues

```typescript
// Secondary effect: Refresh profile if critical fields are missing
useEffect(() => {
  if (!isAuthenticated || !profile || loading) return;
  
  // If we have a profile but critical permission data is missing, refresh
  if (profile.role_tier === null && profile.id) {
    const retryLoadProfile = async () => {
      // Add a small delay to avoid hammering the API
      await new Promise(resolve => setTimeout(resolve, 500));
      await loadProfile();
    };
    
    retryLoadProfile();
  }
}, [isAuthenticated, profile, loading]);
```

### Fix #3: Header Component Trigger
**File:** `src/app/components/FixedHeader.tsx`

Modified the component to:
- Import the `refreshProfile` function from the hook
- Add an effect that detects when profile data is loaded but `role_tier` is missing
- Automatically trigger a refresh when this condition is detected

```typescript
// Auto-refresh profile if role_tier is missing when authenticated
useEffect(() => {
  if (isAuthenticated && !loading && profile && !roleTier && currentUserId) {
    console.log('Profile loaded but role_tier is missing, refreshing...');
    refreshProfile();
  }
}, [isAuthenticated, loading, profile, roleTier, currentUserId, refreshProfile]);
```

## What These Fixes Do

### On Initial Login
1. User logs in with email/password
2. The hook retrieves the session
3. The `/api/profile` endpoint is called to get full profile data including `role_tier`
4. Profile is stored in state with all fields populated
5. Header displays name and role correctly

### If Profile API Temporarily Fails
1. Instead of losing the user completely, they remain authenticated with basic session data
2. The secondary effect detects `role_tier: null` within the profile state
3. Automatically retries the API call after 500ms
4. Once successful, profile is updated with complete data
5. Header shows name and role

### During Navigation
1. User navigates between routes
2. The `pathname` dependency in the useEffect triggers a new profile sync
3. If data is incomplete, the auto-retry mechanism kicks in
4. Header always has current data
5. Permissions remain in place across route changes

## Testing Steps

### Test 1: Login Works Correctly
```
1. Navigate to /login
2. Enter valid credentials
3. Verify you're redirected to /dashboard
4. Verify header shows your name and role
5. Navigate to other pages (/profile, /admin, etc.)
6. Verify name and role remain visible in header
```

### Test 2: API Failure Recovery
```
1. Open DevTools Network tab
2. Log in normally
3. Observe the profile API call succeeds
4. Open DevTools → Network → Throttle to "Offline"
5. Refresh the page (simulating API failure)
6. You should still be logged in with basic info
7. When offline throttling is removed, profile refreshes automatically
8. Name and role reappear
```

### Test 3: Permission-Based Access
```
1. Log in as different user roles (admin, staff, scheduler)
2. Navigate to permission-restricted pages
3. Verify access control works based on role_tier
4. Verify header correctly displays each user's role
5. Log out and log in as different role
6. Verify permissions change appropriately
```

### Test 4: Route Navigation
```
1. Log in successfully
2. Note the name and role in header
3. Click through multiple routes
4. After each navigation, verify name and role are still visible
5. Verify no "flickering" of the header info
6. Check browser console for any auth errors
```

## API Response Format

The `/api/profile` endpoint should return:
```json
{
  "profile": {
    "id": "user-uuid",
    "full_name": "User Name",
    "email": "user@example.com",
    "phone_number": null,
    "avatar_path": null,
    "role_tier": "admin|scheduler|manager|staff",
    "password_needs_change": false
  }
}
```

**Critical:** Ensure `role_tier` is always populated from the `profiles` table query. If it's null in the database, that's a data issue to fix separately.

## Monitoring

### Console Logs to Watch For
- `"Profile API failed, using fallback session data"` - Indicates API had an issue but user is still authenticated
- `"Profile loaded but role_tier is missing, refreshing..."` - The auto-retry mechanism is triggering
- `"Error loading current user profile:"` - General profile loading errors

## Files Modified
1. `src/lib/useCurrentUserProfile.ts` - Core hook fixes and auto-retry logic
2. `src/app/components/FixedHeader.tsx` - Header auto-refresh trigger

## Backward Compatibility
✅ No breaking changes - all fixes are additive or improve error handling
✅ Existing components continue to work as before
✅ No API changes required
✅ No database migrations needed
