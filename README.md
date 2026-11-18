# Mona Sri Enterprises - Man Power Facilities & Workforce Suite

Enterprise workforce management, telecalling CRM, biometric attendance, and operations platform for **Mona Sri Enterprises**.

---

## 🎨 Brand & Visual Theme

- **Name**: Mona Sri Enterprises
- **Tagline**: Man Power Facilities
- **Theme Palette**:
  - **Royal Metallic Blue** (`#1E40AF` / `#2563EB`)
  - **Luxury Metallic Gold** (`#D4AF37` / `#C5A059` / `#B8860B`)
  - **Deep Slate Navy** (`#0F172A` / `#0B132B`)
- **Logo**: 3D embossed emblem with "MS" monogram and manpower workforce silhouette.

---

## 🗄️ Database Architecture (Neon Cloud PostgreSQL)

All 34 tables and data are created and saved directly in your **Neon PostgreSQL** database:

- **Connection URL**: `postgresql://neondb_owner:npg_2h4sRpoxewAD@ep-nameless-lab-belt6ae7-pooler.c-9.us-east-2.aws.neon.tech/neondb?sslmode=require&channel_binding=require`
- **Saved Tables**: `users`, `employee_profiles`, `telecaller_stats`, `call_logs`, `client_leads`, `attendance_records`, `leave_requests`, `payslips`, `team_members`, `team_groups`, `team_tasks`, `team_meetings`, `candidate_interviews`, `onboarding_employees`, `exit_employees`, `assigned_leads`, `lead_batches`, `face_biometric_profiles`, `offer_letters`, `payment_verifications`, `employee_documents`, `office_settings`, `company_holidays`, `calendar_settings`, and more.
- **Migration & Sync Script**: `node scripts/migrate_to_neon.cjs`

---

## 🔑 Seed Credentials (Test Accounts)

Use these credentials to sign into each dashboard portal:

| Portal Role | Email | Password | Employee Code | Seed Credits / Leave Balance |
| :--- | :--- | :--- | :--- | :--- |
| **Super Admin** | `admin@monasri.com` | `admin123` | `MSE-AD01` | **24.0** Annual Leave Credits |
| **HR Manager** | `hr@monasri.com` | `hr123` | `MSE-HR01` | **18.0** Annual Leave Credits |
| **Team Leader** | `tl@monasri.com` | `tl123` | `MSE-TL01` | **16.0** Leave Credits, **₹2,50,000** Sales Credit |
| **Telecaller Executive** | `telecaller@monasri.com` | `telecaller123` | `MSE-TC01` | **14.0** Leave Credits, **₹1,45,000** Sales Credit |
| **Operations Employee** | `employee@monasri.com` | `emp123` | `MSE-TC01` | **14.0** Leave Credits |

---

## 🚀 Running the Project

You can run both client and server together from the project root:

```bash
# Start both Backend (Port 5001) and Frontend (Port 5173) concurrently:
npm run dev
```

Or run them individually:

```bash
# Run backend server only:
npm run server

# Run frontend client only:
npm run client

# Build frontend for production:
npm run build
```

The frontend runs on `http://localhost:5173` and automatically proxies all `/api` and Socket.IO requests to the backend at `http://localhost:5001`.

---

## ⚙️ Environment Variables

- **Server (`server/.env`)**:
  - `DATABASE_URL`: Connected to your Neon PostgreSQL cluster.
  - `JWT_SECRET`: Inserted fresh, cryptographically secure 256-bit token.
  - `COMPANY_NAME`: `"MONA SRI ENTERPRISES"`
- **Client (`client/.env`)**:
  - `VITE_API_URL=http://localhost:5001`
