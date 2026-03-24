// Stripe webhook + checkout session routes
// To test webhooks locally:
// stripe listen --forward-to localhost:3000/api/stripe/webhook

const express = require('express');
const router = express.Router();
const db = require('../db/database');
const { stripeClient } = require('../utils/stripe');
const { createCheckoutSession } = require('../utils/stripe');
const { softAuth } = require('../middleware/auth');

router.post('/webhook', (req, res) => {
  const sig = req.headers['stripe-signature'];
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  let event;
  try {
    if (webhookSecret && webhookSecret !== 'whsec_YOUR_WEBHOOK_SECRET') {
      event = stripeClient.webhooks.constructEvent(req.body, sig, webhookSecret);
    } else {
      event = JSON.parse(req.body.toString());
      console.log('Warning: Stripe webhook signature verification skipped (no secret configured)');
    }
  } catch (err) {
    console.error('Webhook signature verification failed:', err.message);
    return res.status(400).json({ error: 'Webhook signature verification failed' });
  }

  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object;
      const orderUuid = session.metadata?.order_uuid;
      if (orderUuid) {
        db.prepare(`
          UPDATE orders SET status = 'paid', payment_intent_id = ?, stripe_session_id = ?, updated_at = datetime('now')
          WHERE uuid = ?
        `).run(session.payment_intent || null, session.id, orderUuid);
        console.log(`Order ${orderUuid} marked as paid`);
      }
      break;
    }

    case 'payment_intent.payment_failed': {
      const intent = event.data.object;
      const session = db.prepare('SELECT * FROM orders WHERE payment_intent_id = ?').get(intent.id);
      if (session) {
        console.log(`Payment failed for order ${session.uuid}`);
      }
      break;
    }

    default:
      console.log(`Unhandled webhook event: ${event.type}`);
  }

  res.json({ received: true });
});

router.post('/create-session', softAuth, async (req, res) => {
  try {
    const { orderUuid } = req.body;
    if (!orderUuid) {
      return res.status(400).json({ error: 'Order UUID is required' });
    }

    const order = db.prepare('SELECT * FROM orders WHERE uuid = ?').get(orderUuid);
    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }

    if (req.user && order.user_id && order.user_id !== req.user.userId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const items = db.prepare('SELECT * FROM order_items WHERE order_id = ?').all(order.id);
    const session = await createCheckoutSession(order, items);

    db.prepare('UPDATE orders SET stripe_session_id = ? WHERE id = ?').run(session.id, order.id);

    res.json({ url: session.url });
  } catch (err) {
    console.error('Create Stripe session error:', err);
    res.status(500).json({ error: 'Failed to create payment session' });
  }
});

module.exports = router;
