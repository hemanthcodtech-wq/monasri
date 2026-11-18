import { Client } from 'pg';
import db from './connection.js';

export async function syncToPostgresIfConfigured(): Promise<void> {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl || !dbUrl.startsWith('postgres')) {
    return;
  }

  try {
    const pg = new Client({
      connectionString: dbUrl,
      ssl: { rejectUnauthorized: false }
    });

    await pg.connect();
    console.log('[Neon PostgreSQL] Connected to remote database engine.');

    // Quick sync of users table to ensure any newly added or updated users exist in Neon
    const users = db.prepare('SELECT * FROM users').all() as any[];
    for (const u of users) {
      await pg.query(
        `INSERT INTO users (id, email, "passwordHash", name, role, "empCode", "employeeId", active)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         ON CONFLICT (id) DO UPDATE SET 
           email = EXCLUDED.email, 
           "passwordHash" = EXCLUDED."passwordHash", 
           name = EXCLUDED.name, 
           role = EXCLUDED.role,
           "empCode" = EXCLUDED."empCode",
           active = EXCLUDED.active`,
        [u.id, u.email, u.passwordHash, u.name, u.role, u.empCode, u.employeeId, u.active]
      );
    }

    console.log(`[Neon PostgreSQL] Synchronized ${users.length} users with cloud database.`);
    await pg.end();
  } catch (err: any) {
    console.warn('[Neon PostgreSQL] Sync warning (will continue with local storage):', err.message);
  }
}
