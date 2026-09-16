export const PERMISSIONS = {
  ROSTER: {
    canView: ['manager', 'scheduler', 'admin'],
    canEdit: ['scheduler', 'admin'],
    canExport: ['manager', 'scheduler', 'admin'],
  },
  BOOKINGS: {
    canView: ['scheduler', 'admin', 'staff', 'manager'],
    canCreate: ['scheduler', 'admin', 'manager'],
    canDelete: ['scheduler', 'admin'],
  },
  ATTENDANCE: {
    canMark: ['scheduler', 'admin'],
  },
  ADMIN_DASHBOARD: {
    canView: ['admin', 'scheduler'],
    canEdit: ['admin'],
    canDelete: ['admin'],
  },
  COURSE_SCHEDULING: {
    canView: ['admin', 'scheduler', 'manager'],
    canCreate: ['admin', 'scheduler'],
    canEdit: ['admin'],
    canDelete: ['admin'],
  },
  QUALIFICATIONS: {
    canView: ['admin', 'scheduler', 'manager'],
    canCreate: ['admin', 'scheduler', 'manager'],
    canEdit: ['admin', 'scheduler', 'manager'],
  },
  STAFF_MANAGEMENT: {
    canView: ['admin'],
    canCreate: ['admin'],
    canEdit: ['admin'],
    canDelete: ['admin'],
  },
  PROFILE: {
    canView: ['staff', 'manager', 'scheduler', 'admin'],
    canEditOwn: ['staff', 'manager', 'scheduler', 'admin'],
    canChangePassword: ['staff', 'manager', 'scheduler', 'admin'],
  },
} as const;

export function hasPermission(userRole: string | null, permission: keyof typeof PERMISSIONS, action: string): boolean {
  if (!userRole) return false;
  
  const normalizedRole = userRole.trim().toLowerCase();
  const perm = PERMISSIONS[permission];
  const actionKey = action as keyof typeof perm;
  
  if (!perm[actionKey]) return false;
  
  return (perm[actionKey] as string[]).includes(normalizedRole);
}
