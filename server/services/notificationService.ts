import db from '../db/connection.js';

export interface PushNotificationPayload {
  targetUserId?: string | string[];
  targetEmpCode?: string | string[];
  targetRole?: string | string[];
  isBroadcast?: boolean;
  title: string;
  body: string;
  data?: Record<string, any>;
  channelId?: string;
}

export interface RegisterTokenPayload {
  token: string;
  userId?: string;
  empCode?: string;
  role?: string;
  userName?: string;
  platform?: string;
}

/**
 * Register or update a device push token in the local database
 */
export function registerDevicePushToken(payload: RegisterTokenPayload): { success: boolean; id: string } {
  try {
    const id = `token-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const now = new Date().toISOString();

    const insertStmt = db.prepare(`
      INSERT INTO device_push_tokens (id, token, userId, empCode, role, userName, platform, createdAt, lastUsedAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(token) DO UPDATE SET
        userId = excluded.userId,
        empCode = excluded.empCode,
        role = excluded.role,
        userName = excluded.userName,
        platform = excluded.platform,
        lastUsedAt = excluded.lastUsedAt
    `);

    insertStmt.run(
      id,
      payload.token.trim(),
      payload.userId || null,
      payload.empCode || null,
      payload.role || null,
      payload.userName || null,
      payload.platform || 'web',
      now,
      now
    );

    return { success: true, id };
  } catch (err: any) {
    console.error('[NotificationService] Error registering device token:', err);
    return { success: false, id: '' };
  }
}

export const registerPushToken = registerDevicePushToken;

/**
 * Remove an unregistered or stale device token
 */
export function unregisterDevicePushToken(token: string): { success: boolean } {
  try {
    const stmt = db.prepare('DELETE FROM device_push_tokens WHERE token = ?');
    stmt.run(token.trim());
    return { success: true };
  } catch (err: any) {
    console.error('[NotificationService] Error unregistering device token:', err);
    return { success: false };
  }
}

/**
 * Dispatch Push Notifications to target tokens via Expo / Web Push
 */
export async function sendPushNotification(payload: PushNotificationPayload): Promise<{ success: boolean; deliveredCount: number }> {
  try {
    let tokens: string[] = [];

    if (payload.isBroadcast) {
      const rows = db.prepare('SELECT token FROM device_push_tokens').all() as { token: string }[];
      tokens = rows.map(r => r.token);
    } else {
      const conditions: string[] = [];
      const params: any[] = [];

      if (payload.targetUserId) {
        const uids = Array.isArray(payload.targetUserId) ? payload.targetUserId : [payload.targetUserId];
        conditions.push(`userId IN (${uids.map(() => '?').join(',')})`);
        params.push(...uids);
      }

      if (payload.targetEmpCode) {
        const codes = Array.isArray(payload.targetEmpCode) ? payload.targetEmpCode : [payload.targetEmpCode];
        conditions.push(`empCode IN (${codes.map(() => '?').join(',')})`);
        params.push(...codes);
      }

      if (payload.targetRole) {
        const roles = Array.isArray(payload.targetRole) ? payload.targetRole : [payload.targetRole];
        conditions.push(`role IN (${roles.map(() => '?').join(',')})`);
        params.push(...roles);
      }

      if (conditions.length === 0) {
        console.warn('[Push Notification] No targets defined for notification payload.');
        return { success: false, deliveredCount: 0 };
      }

      const query = `SELECT DISTINCT token FROM device_push_tokens WHERE ${conditions.join(' OR ')}`;
      const rows = db.prepare(query).all(...params) as { token: string }[];
      tokens = rows.map(r => r.token);
    }

    if (tokens.length === 0) {
      return { success: true, deliveredCount: 0 };
    }

    // Filter valid Expo Push Tokens
    const expoTokens = tokens.filter(t => t.startsWith('ExponentPushToken[') || t.startsWith('ExpoPushToken['));

    if (expoTokens.length > 0) {
      const messages = expoTokens.map(token => ({
        to: token,
        sound: 'default',
        title: payload.title,
        body: payload.body,
        data: payload.data || {},
        channelId: payload.channelId || 'default',
        priority: 'high',
      }));

      const chunks: (typeof messages)[] = [];
      const CHUNK_SIZE = 100;
      for (let i = 0; i < messages.length; i += CHUNK_SIZE) {
        chunks.push(messages.slice(i, i + CHUNK_SIZE));
      }

      for (const chunk of chunks) {
        try {
          const response = await fetch('https://exp.host/--/api/v2/push/send', {
            method: 'POST',
            headers: {
              'Accept': 'application/json',
              'Accept-encoding': 'gzip, deflate',
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(chunk)
          });

          const resData = await response.json().catch(() => null);
          if (!response.ok) {
            console.warn('[Push Notification] Push API notice:', resData);
          } else {
            console.log(`[Push Notification Delivered] Successfully sent ${chunk.length} notification(s)`);
          }
        } catch (chunkErr) {
          console.error('[Push Notification Network Error]', chunkErr);
        }
      }
    }

    return { success: true, deliveredCount: tokens.length };
  } catch (err) {
    console.error('[Push Notification Failure]', err);
    return { success: false, deliveredCount: 0 };
  }
}
