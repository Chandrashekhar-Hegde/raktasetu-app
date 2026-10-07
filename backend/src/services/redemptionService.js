import crypto from 'crypto';
import { randomUUID as uuidv4 } from 'node:crypto';
import { withAuthorizationContext } from '../db/authorizedTransaction.js';
import { hashRefreshToken } from '../auth/session.js';
import { logAudit } from '../utils/compliance.js';
import { publishToUser } from '../realtime/publisher.js';

export const REDEMPTION_CREDITS = 100;
const CODE_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

function serviceError(status, code, message) {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  return error;
}

export function generateRedemptionCode() {
  const bytes = crypto.randomBytes(8);
  let suffix = '';
  for (let i = 0; i < 8; i += 1) {
    suffix += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
  }
  return `RSC-${suffix}`;
}

export async function createRedemptionInTransaction(
  client,
  { donorId, familyMemberId = null },
) {
  await client.query('SELECT id FROM users WHERE id = $1 FOR UPDATE', [donorId]);

  const balanceResult = await client.query(
    'SELECT COALESCE(SUM(amount), 0)::int AS balance FROM credits WHERE donor_id = $1',
    [donorId],
  );
  const balance = Number(balanceResult.rows[0]?.balance) || 0;
  if (balance < REDEMPTION_CREDITS) {
    throw serviceError(402, 'INSUFFICIENT_CREDITS', 'Need at least 100 credits to redeem');
  }

  const active = await client.query(
    `SELECT id FROM redemptions WHERE donor_id = $1 AND status = 'active'`,
    [donorId],
  );
  if (active.rows[0]) {
    throw serviceError(409, 'ACTIVE_REDEMPTION_EXISTS', 'An active redemption already exists');
  }

  if (familyMemberId) {
    const member = await client.query(
      'SELECT id FROM family_members WHERE id = $1 AND donor_id = $2',
      [familyMemberId, donorId],
    );
    if (!member.rows[0]) {
      throw serviceError(404, 'FAMILY_MEMBER_NOT_FOUND', 'Family member not found');
    }
  }

  const code = generateRedemptionCode();
  const codeHash = hashRefreshToken(code);
  const redemptionId = uuidv4();

  const inserted = await client.query(
    `INSERT INTO redemptions (
       id, donor_id, family_member_id, code_hash, status, credits_amount,
       created_at, expires_at
     ) VALUES ($1, $2, $3, $4, 'active', $5, NOW(), NOW() + INTERVAL '24 hours')
     RETURNING id, donor_id, family_member_id, status, credits_amount, created_at, expires_at`,
    [redemptionId, donorId, familyMemberId, codeHash, REDEMPTION_CREDITS],
  );

  await client.query(
    `INSERT INTO credits (
       id, donor_id, amount, type, description, related_redemption_id, created_at
     ) VALUES ($1, $2, $3, 'reserved', 'Redemption reserved', $4, NOW())`,
    [uuidv4(), donorId, -REDEMPTION_CREDITS, redemptionId],
  );

  return { redemption: inserted.rows[0], code };
}

export async function createRedemption({ donorId, familyMemberId = null, req }) {
  try {
    const result = await withAuthorizationContext(
      { userId: donorId, role: 'donor' },
      (client) => createRedemptionInTransaction(client, { donorId, familyMemberId }),
    );
    await logAudit({
      userId: donorId,
      action: 'REDEMPTION_CREATED',
      resourceType: 'redemption',
      resourceId: result.redemption.id,
      details: { family_member_id: familyMemberId, credits_amount: REDEMPTION_CREDITS },
      req,
    });
    return result;
  } catch (error) {
    if (error.code === '23505') {
      throw serviceError(409, 'ACTIVE_REDEMPTION_EXISTS', 'An active redemption already exists');
    }
    throw error;
  }
}

export async function cancelRedemptionInTransaction(client, { donorId, redemptionId }) {
  const locked = await client.query(
    `SELECT id, status, credits_amount FROM redemptions
     WHERE id = $1 AND donor_id = $2 FOR UPDATE`,
    [redemptionId, donorId],
  );
  const redemption = locked.rows[0];
  if (!redemption) throw serviceError(404, 'REDEMPTION_NOT_FOUND', 'Redemption not found');
  if (redemption.status !== 'active') {
    throw serviceError(409, 'REDEMPTION_NOT_ACTIVE', 'Only active redemptions can be cancelled');
  }

  await client.query(
    `UPDATE redemptions SET status = 'cancelled' WHERE id = $1 AND status = 'active'`,
    [redemptionId],
  );
  await client.query(
    `INSERT INTO credits (
       id, donor_id, amount, type, description, related_redemption_id, created_at
     ) VALUES ($1, $2, $3, 'reserve_released', 'Redemption cancelled — credits released', $4, NOW())`,
    [uuidv4(), donorId, redemption.credits_amount, redemptionId],
  );

  return { id: redemptionId, status: 'cancelled' };
}

export async function cancelRedemption({ donorId, redemptionId, req }) {
  const result = await withAuthorizationContext(
    { userId: donorId, role: 'donor' },
    (client) => cancelRedemptionInTransaction(client, { donorId, redemptionId }),
  );
  await logAudit({
    userId: donorId,
    action: 'REDEMPTION_CANCELLED',
    resourceType: 'redemption',
    resourceId: redemptionId,
    details: {},
    req,
  });
  return result;
}

export async function completeRedemptionInTransaction(client, { actor, code, req }) {
  const hospitalResult = await client.query(
    `SELECT id, approval_status FROM hospitals
     WHERE id = $1 AND user_id = $2 AND approval_status = 'approved'`,
    [actor.hospital_id, actor.id],
  );
  if (!hospitalResult.rows[0]) {
    throw serviceError(403, 'HOSPITAL_APPROVAL_REQUIRED', 'Approved hospital required');
  }

  const codeHash = hashRefreshToken(String(code).trim().toUpperCase());
  let row;
  try {
    const result = await client.query(
      'SELECT * FROM hospital_complete_redemption($1)',
      [codeHash],
    );
    row = result.rows[0];
  } catch (error) {
    const message = String(error.message || '');
    if (message.includes('REDEMPTION_NOT_FOUND')) {
      throw serviceError(404, 'REDEMPTION_NOT_FOUND', 'Redemption code not found');
    }
    if (message.includes('REDEMPTION_ALREADY_COMPLETED')) {
      throw serviceError(409, 'REDEMPTION_ALREADY_COMPLETED', 'Redemption has already been completed');
    }
    if (message.includes('REDEMPTION_EXPIRED')) {
      throw serviceError(410, 'REDEMPTION_EXPIRED', 'Redemption code has expired');
    }
    if (message.includes('REDEMPTION_NOT_ACTIVE')) {
      throw serviceError(409, 'REDEMPTION_NOT_ACTIVE', 'Redemption is not active');
    }
    if (error.code === '42501') {
      throw serviceError(403, 'REDEMPTION_DENIED', 'Not allowed to complete redemption');
    }
    throw error;
  }

  if (!row) {
    throw serviceError(404, 'REDEMPTION_NOT_FOUND', 'Redemption code not found');
  }

  await client.query(
    `INSERT INTO notifications (id, user_id, type, title, body, data, is_read, created_at)
     VALUES ($1, $2, 'redemption_completed', 'Credits redeemed',
       'Your credit redemption was verified at the hospital.',
       $3, false, NOW())`,
    [uuidv4(), row.donor_id, JSON.stringify({ redemption_id: row.redemption_id })],
  );

  await logAudit({
    userId: actor.id,
    action: 'REDEMPTION_COMPLETED',
    resourceType: 'redemption',
    resourceId: row.redemption_id,
    details: {
      hospital_id: actor.hospital_id,
      credits_amount: row.credits_amount,
      beneficiary_relation: row.beneficiary_relation,
    },
    req,
    client,
  });

  return {
    donor_first_name: row.donor_first_name,
    beneficiary_name: row.beneficiary_name,
    beneficiary_relation: row.beneficiary_relation,
    credits_amount: row.credits_amount,
    status: row.status,
    redemption_id: row.redemption_id,
    donor_id: row.donor_id,
  };
}

export async function completeRedemption({ actor, code, req }) {
  const result = await withAuthorizationContext(
    { userId: actor.id, role: actor.role, hospitalId: actor.hospital_id },
    (client) => completeRedemptionInTransaction(client, { actor, code, req }),
  );
  publishToUser(result.donor_id, 'redemption_completed', {
    redemption_id: result.redemption_id,
    status: result.status,
    credits_amount: result.credits_amount,
  });
  const { donor_id: _donorId, redemption_id: _id, ...publicFields } = result;
  return publicFields;
}
