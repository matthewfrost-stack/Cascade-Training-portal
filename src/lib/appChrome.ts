/**
 * Pages used before someone is signed in (login, forgotten password, set /
 * change password, email links). The header and the side menu are hidden on
 * these, as they are on the login page.
 */
export function isSignInPage(pathname: string | null | undefined): boolean {
  const path = pathname || '';
  return path === '/login' || path === '/auth' || path.startsWith('/auth/');
}
