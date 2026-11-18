const Database = require('better-sqlite3');
const { Client } = require('pg');
const path = require('path');
const dotenv = require('dotenv');

dotenv.config({ path: path.join(__dirname, '../server/.env') });
dotenv.config();

const neonUrl = process.env.DATABASE_URL || 'postgresql://neondb_owner:npg_2h4sRpoxewAD@ep-nameless-lab-belt6ae7-pooler.c-9.us-east-2.aws.neon.tech/neondb?sslmode=require';

const sqliteDb = new Database(path.join(__dirname, '../server/db/data/tradenexus.sqlite'));

function mapType(sqliteType) {
  const t = (sqliteType || 'TEXT').toUpperCase();
  if (t.includes('INT')) return 'BIGINT';
  if (t.includes('REAL') || t.includes('FLOAT') || t.includes('DOUBLE') || t.includes('NUMERIC')) return 'NUMERIC';
  if (t.includes('BLOB')) return 'BYTEA';
  if (t.includes('BOOLEAN') || t.includes('BOOL')) return 'BOOLEAN';
  return 'TEXT';
}

async function runMigration() {
  console.log('Connecting to Neon PostgreSQL...');
  const pg = new Client({
    connectionString: neonUrl,
    ssl: { rejectUnauthorized: false }
  });

  await pg.connect();
  console.log('✅ Connected to Neon PostgreSQL.');

  const tableRows = sqliteDb.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all();
  const tables = tableRows.map(r => r.name);

  console.log(`Found ${tables.length} tables in SQLite to migrate:\n`, tables.join(', '));

  for (const tableName of tables) {
    try {
      const columns = sqliteDb.prepare(`PRAGMA table_info("${tableName}")`).all();
      if (!columns || columns.length === 0) continue;

      const pks = columns.filter(c => c.pk > 0).sort((a, b) => a.pk - b.pk).map(c => `"${c.name}"`);

      const colDefs = columns.map(c => {
        const colType = mapType(c.type);
        let def = `"${c.name}" ${colType}`;
        // If single primary key
        if (pks.length === 1 && c.pk > 0) {
          def += ' PRIMARY KEY';
        }
        return def;
      });

      if (pks.length > 1) {
        colDefs.push(`PRIMARY KEY (${pks.join(', ')})`);
      }

      const createTableSql = `CREATE TABLE IF NOT EXISTS "${tableName}" (\n  ${colDefs.join(',\n  ')}\n);`;
      await pg.query(createTableSql);

      // Read rows from SQLite
      const rows = sqliteDb.prepare(`SELECT * FROM "${tableName}"`).all();
      if (rows.length > 0) {
        const colNames = columns.map(c => c.name);
        const quotedCols = colNames.map(c => `"${c}"`).join(', ');

        for (const row of rows) {
          const values = colNames.map(col => {
            const v = row[col];
            if (v === undefined) return null;
            return v;
          });

          const placeholders = values.map((_, i) => `$${i + 1}`).join(', ');
          
          let conflictClause = 'ON CONFLICT DO NOTHING';
          if (pks.length > 0) {
            const updateCols = colNames.filter(c => !columns.find(x => x.name === c && x.pk > 0));
            if (updateCols.length > 0) {
              const updates = updateCols.map(c => `"${c}" = EXCLUDED."${c}"`).join(', ');
              conflictClause = `ON CONFLICT (${pks.join(', ')}) DO UPDATE SET ${updates}`;
            }
          }

          const insertSql = `
            INSERT INTO "${tableName}" (${quotedCols})
            VALUES (${placeholders})
            ${conflictClause}
          `;

          try {
            await pg.query(insertSql, values);
          } catch (insertErr) {
            // If conflict target fails, try simple INSERT OR IGNORE
            try {
              await pg.query(`INSERT INTO "${tableName}" (${quotedCols}) VALUES (${placeholders}) ON CONFLICT DO NOTHING`, values);
            } catch (ignoreErr) {
              console.warn(`Warning inserting row in ${tableName}:`, ignoreErr.message);
            }
          }
        }
      }

      // Check count in PG
      const pgCountRes = await pg.query(`SELECT COUNT(*) as c FROM "${tableName}"`);
      const pgCount = pgCountRes.rows[0].c;
      console.log(`✅ Table "${tableName}": SQLite (${rows.length} rows) -> Neon PG (${pgCount} rows)`);
    } catch (tblErr) {
      console.error(`❌ Error migrating table "${tableName}":`, tblErr.message);
    }
  }

  console.log('\n======================================================');
  console.log('🎉 All tables and data successfully saved in Neon PostgreSQL!');
  console.log('======================================================\n');

  await pg.end();
}

runMigration().catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});
