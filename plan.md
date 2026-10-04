# RaktaSetu — Blood Donation Platform

> **Status: Archived.** Historical brand/product input; current behavior and operational truth live in [README.md](./README.md) and [docs/README.md](./docs/README.md).

## Complete Working Application Plan

### Brand Identity
- **Name**: RaktaSetu (ರಕ್ತಸೇತು) — "Blood Bridge"
- **Tagline**: "Connect. Donate. Save Lives."
- **Fonts**: Anek Latin (display), Public Sans (body)
- **Palette**:
  - Oxblood `#7A1626` — primary brand
  - Arterial `#C8102E` — alerts, emergencies
  - Ink `#17151A` — text
  - Porcelain `#F5F3F0` — backgrounds
  - Leaf `#0F6B4A` — success, confirmation
  - Console `#14161C` — hospital console dark mode

### Architecture
```
raktasetu-app/
├── backend/          # Express.js + Socket.io API
│   ├── src/
│   │   ├── server.js
│   │   ├── routes/
│   │   ├── middleware/
│   │   └── db.js
│   └── package.json
├── frontend/         # React 18 + Vite + Capacitor
│   ├── src/
│   │   ├── App.jsx
│   │   ├── components/
│   │   ├── screens/
│   │   ├── hooks/
│   │   └── api.js
│   ├── capacitor.config.ts
│   └── package.json
└── docs/
    └── design-system.md
```

### Database Schema (Neon Postgres)

**users** — donors, hospitals, admins
- id (UUID PK), email, phone, password_hash, name, role (donor|hospital|admin)
- blood_group, latitude, longitude, city, state
- is_verified, aadhaar_hash, created_at, updated_at
- is_on_call, ping_radius_km, last_donation_date, next_eligible_date

**hospitals** — blood bank / hospital profiles
- id (UUID PK), user_id (FK), name, address, license_number
- latitude, longitude, city, state, phone, is_verified
- operating_hours, created_at

**blood_requests** — emergency requests
- id (UUID PK), hospital_id (FK), blood_group, units_needed
- urgency (scheduled|urgent|critical), status (open|filled|closed)
- radius_km, latitude, longitude, notes, ref_code
- created_at, needed_by, filled_at

**donor_responses** — responses to requests
- id (UUID PK), request_id (FK), donor_id (FK)
- status (pending|accepted|declined|arrived|completed)
- responded_at, arrived_at, completed_at

**donations** — verified donation records
- id (UUID PK), donor_id (FK), request_id (FK, nullable)
- hospital_id (FK), units, blood_group, verified_by
- verified_at, credits_earned, ref_code

**credits** — credit ledger entries
- id (UUID PK), donor_id (FK), amount, type (earned|redeemed)
- description, related_donation_id, created_at

**family_members** — for credit sharing
- id (UUID PK), donor_id (FK), name, relationship, blood_group
- created_at

**notifications** — in-app + push
- id (UUID PK), user_id (FK), type, title, body
- data (JSON), is_read, created_at

### API Specification

**Auth**
- POST /api/auth/register — donor/hospital registration
- POST /api/auth/login — JWT login
- GET /api/auth/me — current user
- POST /api/auth/verify-aadhaar — OTP verification

**Donor**
- GET /api/donor/dashboard — home dashboard data
- PATCH /api/donor/on-call — toggle availability
- GET /api/donor/requests — nearby active requests
- POST /api/donor/respond/:requestId — accept/decline
- POST /api/donor/arrived/:requestId — mark arrived
- GET /api/donor/credits — credit balance + history
- GET /api/donor/history — donation history
- PATCH /api/donor/profile — update profile

**Hospital (Console)**
- GET /api/hospital/dashboard — live board
- POST /api/hospital/requests — create request
- GET /api/hospital/requests/:id — request detail
- PATCH /api/hospital/requests/:id — update status
- POST /api/hospital/verify-donation — QR/manual verify
- GET /api/hospital/donors — nearby donors

**Real-time (Socket.io)**
- `donor:go-on-call` → broadcasts to hospital in radius
- `hospital:new-request` → pings compatible donors
- `donor:respond` → notifies hospital
- `donor:arrived` → updates hospital board
- `hospital:verify` → confirms donation, credits donor

### Mobile App Screens

**Donor App**
1. Auth: Login / Register / Aadhaar Verification
2. Home: On-call toggle, stats, nearby requests
3. Emergency Alert: Request detail, accept/decline
4. On The Way: Directions, QR code, checklist
5. Credits: Balance, ledger, family redemption
6. Profile: Verification status, settings, history
7. History: Past donations

**Hospital Console**
1. Live Board: Active requests with real-time stats
2. New Request: Blood group, units, urgency, radius
3. Verify Donor: QR scan / manual entry
4. Donor Management: Nearby donor list

### Blood Compatibility
- O- → universal donor
- AB+ → universal recipient
- Full 8×8 compatibility matrix implemented
- Rare groups (O-, AB-) auto-widen radius to 25km

### Tech Stack
- **Backend**: Node.js 20, Express 4, Socket.io 4, pg (node-postgres), bcryptjs, jsonwebtoken, cors
- **Frontend**: React 18, Vite 5, React Router 6, Socket.io-client, Leaflet, qrcode.react, Capacitor 6
- **Database**: Neon Postgres (serverless)
- **Maps**: OpenStreetMap via Leaflet (free, no API key)
- **QR**: qrcode.react for display, html5-qrcode for scanning
