import { useEffect, useState } from 'react';
import { getCurrentUser, type CurrentUser, type Role, ROLE_RANK } from '../api/auth';

export function useCurrentUser(): CurrentUser | null {
  const [user, setUser] = useState<CurrentUser | null>(() => getCurrentUser());

  useEffect(() => {
    const refresh = () => setUser(getCurrentUser());
    window.addEventListener('storage', refresh);
    window.addEventListener('pc-hub-user-changed', refresh);
    return () => {
      window.removeEventListener('storage', refresh);
      window.removeEventListener('pc-hub-user-changed', refresh);
    };
  }, []);

  return user;
}

export function useHasRole(min: Role): boolean {
  const user = useCurrentUser();
  if (!user) return false;
  return (ROLE_RANK[user.role] ?? -1) >= ROLE_RANK[min];
}
