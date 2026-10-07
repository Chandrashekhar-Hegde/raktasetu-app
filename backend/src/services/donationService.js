import { randomUUID as uuidv4 } from 'node:crypto';
import { withAuthorizationContext } from '../db/authorizedTransaction.js';
import { logAudit } from '../utils/compliance.js';

function serviceError(status, code, message) {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  return error;
}

export async function completeDonationInTransaction(
  client,
  { actor, requestId, donorId, units, req },
) {
  const hospitalResult = await client.query(
    `SELECT id,approval_status FROM hospitals
     WHERE id=$1 AND user_id=$2 AND approval_status='approved'`,
    [actor.hospital_id, actor.id],
  );
  if (!hospitalResult.rows[0]) throw serviceError(403, 'HOSPITAL_APPROVAL_REQUIRED', 'Approved hospital required');

  const requestResult = await client.query(
    `SELECT id,hospital_id,blood_group,status FROM blood_requests
     WHERE id=$1 AND hospital_id=$2 FOR UPDATE`,
    [requestId, actor.hospital_id],
  );
  const request = requestResult.rows[0];
  if (!request) throw serviceError(404, 'REQUEST_NOT_FOUND', 'Request not found');
  if (request.status !== 'open') throw serviceError(409, 'REQUEST_NOT_OPEN', 'Request is not open');

  const responseResult = await client.query(
    `SELECT id,status FROM donor_responses
     WHERE request_id=$1 AND donor_id=$2 FOR UPDATE`,
    [requestId, donorId],
  );
  const response = responseResult.rows[0];
  if (!response) throw serviceError(404, 'RESPONSE_NOT_FOUND', 'Donor response not found');

  const replay = await client.query(
    'SELECT id FROM donations WHERE request_id=$1 AND donor_id=$2',
    [requestId, donorId],
  );
  if (replay.rows[0]) {
    throw serviceError(409, 'DONATION_ALREADY_COMPLETED', 'Donation has already been completed');
  }
  if (response.status !== 'arrived') throw serviceError(409, 'DONOR_NOT_ARRIVED', 'Only arrived responses can be completed');

  const donorResult = await client.query(
    'SELECT hospital_donor_blood_group($1) AS blood_group',
    [donorId],
  );
  const donor = donorResult.rows[0];
  if (!donor?.blood_group) throw serviceError(409, 'DONOR_PROFILE_INCOMPLETE', 'Donor blood group is unavailable');

  const donationId = uuidv4();
  const creditsEarned = 100;
  const donationResult = await client.query(
    `INSERT INTO donations (
       id,donor_id,request_id,hospital_id,units,blood_group,verified_by,
       verified_at,credits_earned,ref_code,created_at
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,NOW(),$8,$9,NOW())
     RETURNING id,credits_earned`,
    [
      donationId, donorId, request.id, actor.hospital_id, units, donor.blood_group,
      actor.id, creditsEarned, `RS-${uuidv4().replaceAll('-', '').slice(0, 8).toUpperCase()}`,
    ],
  );
  await client.query(
    `INSERT INTO credits (id,donor_id,amount,type,description,related_donation_id,created_at)
     VALUES ($1,$2,$3,'earned','Verified blood donation',$4,NOW())`,
    [uuidv4(), donorId, creditsEarned, donationId],
  );
  await client.query(
    `UPDATE donor_responses SET status='completed',completed_at=NOW()
     WHERE id=$1 AND status='arrived'`,
    [response.id],
  );
  await client.query('SELECT hospital_record_donor_donation($1)', [donorId]);
  await client.query(
    `INSERT INTO notifications (id,user_id,type,title,body,data,is_read,created_at)
     VALUES ($1,$2,'donation_verified','Donation verified',
       'Your donation was verified and 100 credits were added.',
       $3,false,NOW())`,
    [uuidv4(), donorId, JSON.stringify({ donation_id: donationId })],
  );
  await logAudit({
    userId: actor.id,
    action: 'DONATION_COMPLETED',
    resourceType: 'donation',
    resourceId: donationId,
    details: { request_id: requestId, donor_id: donorId, units },
    req,
    client,
  });
  return donationResult.rows[0];
}

export async function completeDonation({ actor, requestId, donorId, units, req }) {
  try {
    return await withAuthorizationContext(
      { userId: actor.id, role: actor.role, hospitalId: actor.hospital_id },
      (client) => completeDonationInTransaction(client, { actor, requestId, donorId, units, req }),
    );
  } catch (error) {
    if (error.code === '23505') {
      throw serviceError(409, 'DONATION_ALREADY_COMPLETED', 'Donation has already been completed');
    }
    throw error;
  }
}
