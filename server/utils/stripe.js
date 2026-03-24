// Stripe integration for BaseLab Wholesale
// To test webhooks locally:
// stripe listen --forward-to localhost:3000/api/stripe/webhook

const Stripe = require('stripe');

const stripeClient = new Stripe(process.env.STRIPE_SECRET_KEY || 'sk_test_placeholder', {
  apiVersion: '2024-04-10',
});

async function createCheckoutSession(order, items) {
  const lineItems = items.map(item => ({
    price_data: {
      currency: 'usd',
      product_data: {
        name: item.name,
        metadata: { sku: item.sku },
      },
      unit_amount: Math.round(item.price * 100),
    },
    quantity: item.qty,
  }));

  if (order.shipping_cost > 0) {
    lineItems.push({
      price_data: {
        currency: 'usd',
        product_data: { name: 'Shipping' },
        unit_amount: Math.round(order.shipping_cost * 100),
      },
      quantity: 1,
    });
  }

  if (order.tax > 0) {
    lineItems.push({
      price_data: {
        currency: 'usd',
        product_data: { name: 'Tax' },
        unit_amount: Math.round(order.tax * 100),
      },
      quantity: 1,
    });
  }

  if (order.discount > 0) {
    lineItems.push({
      price_data: {
        currency: 'usd',
        product_data: { name: 'Discount' },
        unit_amount: -Math.round(order.discount * 100),
      },
      quantity: 1,
    });
  }

  const appUrl = process.env.APP_URL || 'http://localhost:3000';

  const session = await stripeClient.checkout.sessions.create({
    payment_method_types: ['card'],
    line_items: lineItems,
    mode: 'payment',
    success_url: `${appUrl}/cart.html?success=true&order_id=${order.uuid}`,
    cancel_url: `${appUrl}/cart.html`,
    metadata: { order_uuid: order.uuid },
  });

  return session;
}

module.exports = { stripeClient, createCheckoutSession };
