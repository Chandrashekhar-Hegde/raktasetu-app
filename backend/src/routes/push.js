import express from 'express';
import webpush from 'web-push';
import { v4 as uuidv4 } from 'uuid';
import { query } from '../db.js';
import { respondIfDatabaseDown } from '../db/computeQuota.js';
import { authenticate, requireActiveAccount } from '../middleware/auth.js';
import { logAudit } from '../utils/compliance.js';
import { pushSubscriptionSchema, pushTestSchema, validate } from '../validation/schemas.js';

const router = express.Router();

export function vapidConfigured() {
  return Boolean(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY && process.env.VAPID_SUBJECT);
}

export function configureWebPush() {
  if (!vapidConfigured()) return false;
  webpush.setVapidDetails(process.env.VAPID_SUBJECT, process.env.VAPID_PUBLIC_KEY, process.env.VAPID_PRIVATE_KEY);
  return true;
}

export function subscriptionOwnerDecision(existing, userId) {
  if (!existing) return 'create';
  return existing.user_id === userId ? 'update' : 'deny';
}

router.get('/status', (req, res) => {
  res.json({ success: true, data: { configured: vapidConfigured() } });
});

router.get('/vapid-public-key', (req, res) => {
  if (!vapidConfigured()) {
    return res.status(503).json({
      success: false,
      error: { code: 'PUSH_UNCONFIGURED', message: 'Web Push is not configured' },
    });
  }
  return res.json({ success: true, data: { publicKey: process.env.VAPID_PUBLIC_KEY } });
});

router.use(authenticate, requireActiveAccount);

router.post('/subscribe', validate(pushSubscriptionSchema), async (req, res) => {
  try {
    const { endpoint, keys } = req.body;
    const existing = await query(
      'SELECT id,user_id FROM push_subscriptions WHERE endpoint=$1',
      [endpoint],
    );
    const ownerDecision = subscriptionOwnerDecision(existing.rows[0], req.user.id);
    if (ownerDecision === 'deny') {
      return res.status(409).json({
        success: false,
        error: { code: 'SUBSCRIPTION_OWNED_BY_ANOTHER_ACCOUNT', message: 'This device is linked to another account' },
      });
    }
    let id = existing.rows[0]?.id;
    if (id) {
      await query(
        `UPDATE push_subscriptions SET p256dh=$1,auth=$2,updated_at=NOW()
         WHERE id=$3 AND user_id=$4`,
        [keys.p256dh, keys.auth, id, req.user.id],
      );
    } else {
      id = uuidv4();
      await query(
        `INSERT INTO push_subscriptions (id,user_id,endpoint,p256dh,auth,created_at,updated_at)
         VALUES ($1,$2,$3,$4,$5,NOW(),NOW())`,
        [id, req.user.id, endpoint, keys.p256dh, keys.auth],
      );
    }
    await logAudit({
      userId: req.user.id,
      action: 'PUSH_SUBSCRIBED',
      resourceType: 'push_subscription',
      resourceId: id,
      details: { device_updated: Boolean(existing.rows[0]) },
      req,
    });
    return res.status(existing.rows[0] ? 200 : 201).json({ success: true, data: { id, subscribed: true } });
  } catch (error) {
    if (respondIfDatabaseDown(res, error)) return;
    console.error('Push subscription failed:', error.message);
    return res.status(500).json({ success: false, error: { code: 'PUSH_SUBSCRIBE_FAILED', message: 'Failed to save subscription' } });
  }
});

router.delete('/subscriptions/:id', async (req, res) => {
  if (!/^[0-9a-f-]{36}$/i.test(req.params.id)) {
    return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid subscription id' } });
  }
  const deleted = await query(
    'DELETE FROM push_subscriptions WHERE id=$1 AND user_id=$2 RETURNING id',
    [req.params.id, req.user.id],
  );
  if (!deleted.rowCount) {
    return res.status(404).json({ success: false, error: { code: 'SUBSCRIPTION_NOT_FOUND', message: 'Subscription not found' } });
  }
  await logAudit({
    userId: req.user.id,
    action: 'PUSH_UNSUBSCRIBED',
    resourceType: 'push_subscription',
    resourceId: req.params.id,
    req,
  });
  return res.json({ success: true, data: { unsubscribed: true } });
});

router.post('/test', validate(pushTestSchema), async (req, res) => {
  if (!configureWebPush()) {
    return res.status(503).json({ success: false, error: { code: 'PUSH_UNCONFIGURED', message: 'Web Push is not configured' } });
  }
  const subscriptions = await query(
    'SELECT id,endpoint,p256dh,auth FROM push_subscriptions WHERE user_id=$1 ORDER BY created_at DESC LIMIT 10',
    [req.user.id],
  );
  if (!subscriptions.rowCount) {
    return res.status(404).json({ success: false, error: { code: 'NO_PUSH_SUBSCRIPTION', message: 'No push subscription exists' } });
  }
  let sent = 0;
  let failed = 0;
  let removed = 0;
  const payload = JSON.stringify({
    title: 'RaktaSetu',
    body: req.body.body || 'You are reachable for nearby blood requests.',
    url: '/#/home',
  });
  for (const subscription of subscriptions.rows) {
    try {
      await webpush.sendNotification({
        endpoint: subscription.endpoint,
        keys: { p256dh: subscription.p256dh, auth: subscription.auth },
      }, payload);
      sent += 1;
    } catch (error) {
      failed += 1;
      if ([404, 410].includes(error.statusCode)) {
        const deletion = await query(
          'DELETE FROM push_subscriptions WHERE id=$1 AND user_id=$2',
          [subscription.id, req.user.id],
        );
        removed += deletion.rowCount;
      }
    }
  }
  await logAudit({
    userId: req.user.id,
    action: 'PUSH_TEST_SENT',
    resourceType: 'push_subscription',
    details: { sent, failed, removed },
    req,
  });
  return res.json({ success: true, data: { sent, failed, removed } });
});

export default router;
