import { z } from 'zod';

export const CURRENT_POLICY_VERSION = '2026-07-15';
export const BLOOD_GROUPS = ['O-', 'O+', 'A-', 'A+', 'B-', 'B+', 'AB-', 'AB+'];
/** Biological sex for NBTC whole-blood deferral intervals (male 90d / female 120d). */
export const DONOR_SEX = ['male', 'female'];
const normalizeEmail = (value) => value.trim().toLowerCase();
export const normalizePhone = (value) => value.replace(/[^\d+]/g, '');

const email = z.string().trim().min(3).max(254).email().transform(normalizeEmail);
const phone = z.string().trim().min(8).max(24)
  .transform(normalizePhone)
  .pipe(z.string().regex(/^\+?[1-9]\d{7,14}$/));
const name = z.string().trim().min(2).max(100);
const city = z.string().trim().min(2).max(100);
const state = z.string().trim().min(2).max(100);
const coordinate = (min, max) => z.number().finite().min(min).max(max);
const password = z.string().min(12).max(128)
  .regex(/[A-Z]/).regex(/[a-z]/).regex(/[0-9]/).regex(/[^A-Za-z0-9]/);
const dateOfBirth = z.iso.date().refine((value) => {
  const dob = new Date(`${value}T00:00:00Z`);
  const threshold = new Date();
  threshold.setUTCFullYear(threshold.getUTCFullYear() - 18);
  return dob <= threshold;
}, 'You must be at least 18 years old');

export const registrationSchema = z.object({
  email,
  phone,
  password,
  name,
  role: z.enum(['donor', 'hospital']),
  blood_group: z.enum(BLOOD_GROUPS).optional(),
  date_of_birth: dateOfBirth.optional(),
  sex: z.enum(DONOR_SEX).optional(),
  city,
  state,
  latitude: coordinate(-90, 90).optional(),
  longitude: coordinate(-180, 180).optional(),
  hospital_name: z.string().trim().min(2).max(150).optional(),
  address: z.string().trim().min(5).max(500).optional(),
  license_number: z.string().trim().min(3).max(100).optional(),
  consent_given: z.literal(true),
  consent_policy_version: z.literal(CURRENT_POLICY_VERSION),
}).strict().superRefine((value, context) => {
  if (value.role === 'donor') {
    for (const field of ['blood_group', 'date_of_birth', 'sex']) {
      if (!value[field]) context.addIssue({ code: 'custom', path: [field], message: `${field} is required` });
    }
  } else {
    for (const field of ['hospital_name', 'address', 'license_number']) {
      if (!value[field]) context.addIssue({ code: 'custom', path: [field], message: `${field} is required` });
    }
  }
});

export const loginSchema = z.object({
  email: email.optional(),
  phone: phone.optional(),
  password: z.string().min(1).max(128),
}).strict().refine((value) => Boolean(value.email) !== Boolean(value.phone), 'Provide exactly one identifier');

export const hospitalApprovalSchema = z.object({
  status: z.enum(['approved', 'rejected', 'suspended']),
  reason: z.string().trim().max(500).optional(),
}).strict();

export const donationCompletionSchema = z.object({
  request_id: z.uuid(),
  donor_id: z.uuid(),
  units: z.number().int().min(1).max(10),
}).strict();

export const googleTokenSchema = z.object({ id_token: z.string().min(100).max(5000) }).strict();
export const googleOnboardingSchema = z.object({
  onboarding_token: z.string().min(32).max(256),
  phone,
  blood_group: z.enum(BLOOD_GROUPS),
  date_of_birth: dateOfBirth,
  sex: z.enum(DONOR_SEX),
  city,
  state,
  consent_given: z.literal(true),
  consent_policy_version: z.literal(CURRENT_POLICY_VERSION),
}).strict();
export const googleLinkSchema = z.object({
  id_token: z.string().min(100).max(5000),
  password: z.string().min(1).max(128),
}).strict();

export const paginationSchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(25),
  cursor: z.string().max(300).optional(),
}).strict();

/** Optional ISO date range for pilot metrics (defaults applied in metricsService). */
export const metricsRangeSchema = z.object({
  from: z.iso.datetime({ offset: true }).or(z.iso.date()).optional(),
  to: z.iso.datetime({ offset: true }).or(z.iso.date()).optional(),
}).strict();
export const hospitalRequestQuerySchema = z.object({
  ref: z.string().trim().min(4).max(32).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  cursor: z.string().max(300).optional(),
}).strict();
export const donorSearchQuerySchema = z.object({
  radius: z.coerce.number().int().min(1).max(25).default(10),
  blood_group: z.enum(BLOOD_GROUPS).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
}).strict();

export const requestIdParamsSchema = z.object({ id: z.uuid() }).strict();
export const donorRequestParamsSchema = z.object({ requestId: z.uuid() }).strict();
export const donorProfileSchema = z.object({
  name: name.optional(),
  phone: phone.optional(),
  blood_group: z.enum(BLOOD_GROUPS).optional(),
  date_of_birth: dateOfBirth.optional(),
  sex: z.enum(DONOR_SEX).optional(),
  latitude: coordinate(-90, 90).nullable().optional(),
  longitude: coordinate(-180, 180).nullable().optional(),
  city: city.optional(),
  state: state.optional(),
  ping_radius_km: z.number().int().min(1).max(25).optional(),
}).strict().refine((value) => Object.keys(value).length > 0, 'No fields to update');
export const onCallSchema = z.object({ is_on_call: z.boolean() }).strict();
export const donorResponseSchema = z.object({ status: z.enum(['accepted', 'declined']) }).strict();
export const requestCreateSchema = z.object({
  blood_group: z.enum(BLOOD_GROUPS),
  units_needed: z.number().int().min(1).max(10),
  urgency: z.enum(['scheduled', 'urgent', 'critical']),
  radius_km: z.number().int().min(1).max(25).default(10),
  notes: z.string().trim().max(1000).optional(),
  needed_by: z.iso.datetime().optional(),
}).strict();
export const requestStatusSchema = z.object({ status: z.enum(['open', 'filled', 'closed']) }).strict();
export const consentSchema = z.object({ consent_given: z.boolean() }).strict();

export const deleteAccountSchema = z.object({
  confirm: z.literal('DELETE'),
  password: z.string().min(1).max(128).optional(),
}).strict();

export const restoreAccountSchema = z.object({
  email: email.optional(),
  phone: phone.optional(),
  password: z.string().min(1).max(128),
}).strict().refine((value) => Boolean(value.email) !== Boolean(value.phone), 'Provide exactly one identifier');

export const pushSubscriptionSchema = z.object({
  endpoint: z.url().max(2048).refine((value) => value.startsWith('https://'), 'HTTPS endpoint required'),
  keys: z.object({
    p256dh: z.string().min(32).max(256),
    auth: z.string().min(16).max(128),
  }).strict(),
}).strict();
export const pushTestSchema = z.object({ body: z.string().trim().max(200).optional() }).strict();

export const FAMILY_RELATIONS = ['spouse', 'parent', 'child', 'sibling', 'other'];

export const familyMemberSchema = z.object({
  name: name,
  relation: z.enum(FAMILY_RELATIONS),
  blood_group: z.enum(BLOOD_GROUPS).optional(),
}).strict();

export const familyMemberIdParamsSchema = z.object({ id: z.uuid() }).strict();

export const redemptionCreateSchema = z.object({
  family_member_id: z.uuid().nullable().optional(),
}).strict();

export const redemptionIdParamsSchema = z.object({ id: z.uuid() }).strict();

export const verifyRedemptionSchema = z.object({
  code: z.string().trim().toUpperCase().regex(/^RSC-[A-Z0-9]{8}$/, 'Invalid redemption code'),
}).strict();

export function validate(schema, source = 'body') {
  return (req, res, next) => {
    const result = schema.safeParse(req[source]);
    if (!result.success) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'Invalid request', issues: result.error.issues.map(({ path, message }) => ({ path, message })) },
      });
    }
    // Express 5 exposes req.query as a getter; redefine it instead of assigning.
    Object.defineProperty(req, source, { value: result.data, writable: true, configurable: true, enumerable: true });
    return next();
  };
}

export function encodeCursor(row) {
  return Buffer.from(JSON.stringify({ created_at: row.created_at, id: row.id })).toString('base64url');
}

export function decodeCursor(cursor) {
  if (!cursor) return null;
  try {
    const parsed = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
    return z.object({ created_at: z.iso.datetime(), id: z.uuid() }).strict().parse(parsed);
  } catch {
    const error = new Error('Invalid cursor');
    error.status = 400;
    throw error;
  }
}
