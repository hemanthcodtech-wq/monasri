const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');
const { Client } = require('pg');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '../server/.env') });

const sqliteDb = new Database(path.join(__dirname, '../server/db/data/tradenexus.sqlite'));

function hash(pwd) {
  return bcrypt.hashSync(pwd, 10);
}

const users = [
  { id: 'usr-admin-1', email: 'admin@monasri.com', password: hash('admin123'), name: 'Mona Sri Admin', role: 'admin', empCode: 'MSE-AD01', employeeId: 'emp-ad-1' },
  { id: 'usr-hr-1', email: 'hr@monasri.com', password: hash('hr123'), name: 'HR Manager', role: 'hr', empCode: 'MSE-HR01', employeeId: 'emp-hr-1' },
  { id: 'usr-tl-1', email: 'tl@monasri.com', password: hash('tl123'), name: 'Team Leader', role: 'team_leader', empCode: 'MSE-TL01', employeeId: 'emp-tl-1' },
  { id: 'usr-tc-1', email: 'telecaller@monasri.com', password: hash('telecaller123'), name: 'Telecaller Executive', role: 'telecaller', empCode: 'MSE-TC01', employeeId: 'emp-tc-1' },
  { id: 'usr-emp-1', email: 'employee@monasri.com', password: hash('emp123'), name: 'Operations Executive', role: 'telecaller', empCode: 'MSE-TC01', employeeId: 'emp-tc-1' },
];

// 1. Update SQLite
const insertSqlite = sqliteDb.prepare('INSERT OR REPLACE INTO users (id, email, passwordHash, name, role, empCode, employeeId, active) VALUES (?, ?, ?, ?, ?, ?, ?, 1)');
for (const u of users) {
  insertSqlite.run(u.id, u.email, u.password, u.name, u.role, u.empCode, u.employeeId);
}

const insertProf = sqliteDb.prepare('INSERT OR REPLACE INTO employee_profiles (id, empCode, name, roleTitle, department, teamName, teamLeaderName, email, phone, joinDate, bloodGroup, faceIdStatus, checkInTime, totalLeaveBalance) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
insertProf.run('emp-ad-1', 'MSE-AD01', 'Mona Sri Admin', 'Executive Director', 'Executive Management', 'Leadership', 'Management Board', 'admin@monasri.com', '+91 98450 00001', '01 Jan 2024', 'O+ Positive', 'REGISTERED', '08:30 AM', 24);
insertProf.run('emp-hr-1', 'MSE-HR01', 'HR Manager', 'HR Operations Head', 'Human Resources', 'HR & Man Power Ops', 'Mona Sri Admin', 'hr@monasri.com', '+91 98450 11111', '01 Feb 2024', 'A+ Positive', 'REGISTERED', '09:00 AM', 18);
insertProf.run('emp-tl-1', 'MSE-TL01', 'Team Leader', 'Operations Team Leader', 'Man Power Facilities', 'Alpha Operations Team', 'Mona Sri Admin', 'tl@monasri.com', '+91 98450 22222', '10 Feb 2024', 'AB+ Positive', 'REGISTERED', '09:00 AM', 16);
insertProf.run('emp-tc-1', 'MSE-TC01', 'Telecaller Executive', 'Telecaller Executive', 'Client Acquisition', 'Client Closers', 'Team Leader', 'telecaller@monasri.com', '+91 98450 12345', '12 Jan 2024', 'O+ Positive', 'REGISTERED', '09:00 AM', 14);

const insertTm = sqliteDb.prepare('INSERT OR REPLACE INTO team_members (id, empCode, name, avatar, role, groupName, phone, attendanceStatus, checkInTime, checkInMethod, dialsToday, goalCalls, connected, interested, salesAchieved, salesTarget, conversionRate, portal) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
insertTm.run('tm-tl-1', 'MSE-TL01', 'Team Leader', 'TL', 'Operations Team Leader', 'Client Closers', '+91 98450 22222', 'PRESENT', '09:00 AM', 'Face ID Biometric', 15, 40, 12, 4, 250000, 400000, 25.0, 'team_leader');
insertTm.run('tm-hr-1', 'MSE-HR01', 'HR Manager', 'HR', 'HR Head', 'HR & Man Power Ops', '+91 98450 11111', 'PRESENT', '09:00 AM', 'Face ID Biometric', 0, 0, 0, 0, 0, 0, 0, 'hr');
insertTm.run('tm-tc-1', 'MSE-TC01', 'Telecaller Executive', 'TE', 'Telecaller Executive', 'Client Closers', '+91 98450 12345', 'PRESENT', '09:00 AM', 'Face ID Biometric', 55, 100, 35, 9, 110000, 200000, 16.0, 'telecaller');

console.log('✅ SQLite updated with Mona Sri accounts and profiles.');

// 2. Update Neon PostgreSQL
async function syncNeon() {
  const neonUrl = process.env.DATABASE_URL;
  if (!neonUrl) {
    console.log('No DATABASE_URL found, skipping PG sync.');
    return;
  }

  const pg = new Client({
    connectionString: neonUrl,
    ssl: { rejectUnauthorized: false }
  });
  await pg.connect();

  for (const u of users) {
    await pg.query(
      `INSERT INTO users (id, email, "passwordHash", name, role, "empCode", "employeeId", active)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 1)
       ON CONFLICT (id) DO UPDATE SET 
         email = EXCLUDED.email, 
         "passwordHash" = EXCLUDED."passwordHash", 
         name = EXCLUDED.name, 
         role = EXCLUDED.role,
         "empCode" = EXCLUDED."empCode"`,
      [u.id, u.email, u.password, u.name, u.role, u.empCode, u.employeeId]
    );
    console.log(`✅ Seeded to Neon PG: ${u.email} (${u.role})`);
  }

  const profiles = [
    ['emp-ad-1', 'MSE-AD01', 'Mona Sri Admin', 'Executive Director', 'Executive Management', 'Leadership', 'Management Board', 'admin@monasri.com', '+91 98450 00001', '01 Jan 2024', 'O+ Positive', 'REGISTERED', '08:30 AM', 24],
    ['emp-hr-1', 'MSE-HR01', 'HR Manager', 'HR Operations Head', 'Human Resources', 'HR & Man Power Ops', 'Mona Sri Admin', 'hr@monasri.com', '+91 98450 11111', '01 Feb 2024', 'A+ Positive', 'REGISTERED', '09:00 AM', 18],
    ['emp-tl-1', 'MSE-TL01', 'Team Leader', 'Operations Team Leader', 'Man Power Facilities', 'Alpha Operations Team', 'Mona Sri Admin', 'tl@monasri.com', '+91 98450 22222', '10 Feb 2024', 'AB+ Positive', 'REGISTERED', '09:00 AM', 16],
    ['emp-tc-1', 'MSE-TC01', 'Telecaller Executive', 'Telecaller Executive', 'Client Acquisition', 'Client Closers', 'Team Leader', 'telecaller@monasri.com', '+91 98450 12345', '12 Jan 2024', 'O+ Positive', 'REGISTERED', '09:00 AM', 14]
  ];

  for (const p of profiles) {
    await pg.query(
      `INSERT INTO employee_profiles (id, "empCode", name, "roleTitle", department, "teamName", "teamLeaderName", email, phone, "joinDate", "bloodGroup", "faceIdStatus", "checkInTime", "totalLeaveBalance")
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
       ON CONFLICT (id) DO UPDATE SET 
         "empCode" = EXCLUDED."empCode", 
         name = EXCLUDED.name, 
         email = EXCLUDED.email, 
         department = EXCLUDED.department,
         "totalLeaveBalance" = EXCLUDED."totalLeaveBalance"`,
      p
    );
  }

  const teamMembers = [
    ['tm-tl-1', 'MSE-TL01', 'Team Leader', 'TL', 'Operations Team Leader', 'Client Closers', '+91 98450 22222', 'PRESENT', '09:00 AM', 'Face ID Biometric', 15, 40, 12, 4, 250000, 400000, 25.0, 'team_leader'],
    ['tm-hr-1', 'MSE-HR01', 'HR Manager', 'HR', 'HR Head', 'HR & Man Power Ops', '+91 98450 11111', 'PRESENT', '09:00 AM', 'Face ID Biometric', 0, 0, 0, 0, 0, 0, 0, 'hr'],
    ['tm-tc-1', 'MSE-TC01', 'Telecaller Executive', 'TE', 'Telecaller Executive', 'Client Closers', '+91 98450 12345', 'PRESENT', '09:00 AM', 'Face ID Biometric', 55, 100, 35, 9, 110000, 200000, 16.0, 'telecaller']
  ];

  for (const m of teamMembers) {
    await pg.query(
      `INSERT INTO team_members (id, "empCode", name, avatar, role, "groupName", phone, "attendanceStatus", "checkInTime", "checkInMethod", "dialsToday", "goalCalls", connected, interested, "salesAchieved", "salesTarget", "conversionRate", portal)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
       ON CONFLICT (id) DO UPDATE SET 
         name = EXCLUDED.name, 
         "empCode" = EXCLUDED."empCode", 
         portal = EXCLUDED.portal,
         "salesAchieved" = EXCLUDED."salesAchieved",
         "salesTarget" = EXCLUDED."salesTarget"`,
      m
    );
  }

  console.log('✅ Neon PostgreSQL successfully updated with Mona Sri credentials and profiles!');
  await pg.end();
}

syncNeon().catch(err => {
  console.error('Neon sync error:', err);
});
