import type { UserRole } from '@prisma/client';
import { vi } from 'vitest';
import { getServerSession } from 'next-auth';

/**
 * Configures the mocked `getServerSession` to return a session with the
 * given user fields, or null when no session is desired. Tests on
 * pizza-app endpoints care about `id` and `role`; other fields fall
 * back to predictable defaults so call sites stay terse.
 *
 * Returns the mock so tests can chain further assertions on it.
 */
export const mockSession = (
  user: { id: number; email?: string; role?: UserRole } | null,
) => {
  const mocked = vi.mocked(getServerSession);
  if (user === null) {
    mocked.mockResolvedValue(null);
    return mocked;
  }
  mocked.mockResolvedValue({
    user: {
      id: String(user.id),
      email: user.email ?? `user-${user.id}@example.com`,
      role: user.role ?? 'USER',
    },
    expires: '2099-01-01T00:00:00.000Z',
  } as unknown as Awaited<ReturnType<typeof getServerSession>>);
  return mocked;
};
