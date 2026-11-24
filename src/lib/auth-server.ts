import type { DecodedIdToken } from 'firebase-admin/auth';
import { adminAuth } from './firebase-admin.ts';
import { getOrCreateUser } from '../db/repositories.ts';

export class HttpAuthError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export function getPrimaryAdminEmail(): string {
  return (process.env.ADMIN_EMAIL || 'singhrudra3614@gmail.com').trim().toLowerCase();
}

export async function verifyBearerToken(req: Request): Promise<DecodedIdToken | null> {
  const authHeader = req.headers.get('authorization') || req.headers.get('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }
  const token = authHeader.slice(7).trim();
  if (!token) return null;

  try {
    return await adminAuth.verifyIdToken(token);
  } catch (err) {
    console.error('Token verification failed:', err);
    return null;
  }
}

export async function requireAuthenticatedUser(req: Request) {
  const decoded = await verifyBearerToken(req);
  if (!decoded) {
    throw new HttpAuthError('Unauthorized: Valid sign-in token required.', 401);
  }

  const email = decoded.email || `${decoded.uid}@user.local`;
  const dbUser = await getOrCreateUser({
    uid: decoded.uid,
    email,
    displayName: decoded.name || email.split('@')[0] || 'Typist',
    photoUrl: decoded.picture || '',
  });

  if (dbUser.isBanned) {
    throw new HttpAuthError(
      dbUser.banReason
        ? `Account suspended: ${dbUser.banReason}`
        : 'Account suspended by administrator.',
      403
    );
  }

  return { decoded, dbUser };
}

export async function requireAdminUser(req: Request) {
  const { decoded, dbUser } = await requireAuthenticatedUser(req);
  const isPrimaryAdmin =
    (decoded.email || '').toLowerCase() === getPrimaryAdminEmail();

  if (dbUser.role !== 'admin' && !isPrimaryAdmin) {
    throw new HttpAuthError('Forbidden: Administrator privileges required.', 403);
  }

  return { decoded, dbUser };
}
