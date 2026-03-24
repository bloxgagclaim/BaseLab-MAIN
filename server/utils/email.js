const nodemailer = require('nodemailer');

let transporter = null;

async function createTransport() {
  if (transporter) return transporter;

  if (process.env.SMTP_USER && process.env.SMTP_PASS) {
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST || 'smtp.ethereal.email',
      port: parseInt(process.env.SMTP_PORT || '587', 10),
      secure: false,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });
  } else {
    const testAccount = await nodemailer.createTestAccount();
    transporter = nodemailer.createTransport({
      host: 'smtp.ethereal.email',
      port: 587,
      secure: false,
      auth: {
        user: testAccount.user,
        pass: testAccount.pass,
      },
    });
    console.log('Ethereal email account created:', testAccount.user);
  }

  return transporter;
}

function emailTemplate(title, bodyHtml) {
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f8fafc;font-family:Inter,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;margin:0 auto;">
    <tr>
      <td style="background:#16a34a;padding:24px 32px;text-align:center;">
        <h1 style="margin:0;color:#fff;font-size:22px;font-weight:800;letter-spacing:-.5px;">BaseLab Wholesale</h1>
      </td>
    </tr>
    <tr>
      <td style="background:#fff;padding:32px;">
        <h2 style="margin:0 0 16px;font-size:20px;font-weight:700;color:#0f172a;">${title}</h2>
        ${bodyHtml}
      </td>
    </tr>
    <tr>
      <td style="padding:24px 32px;text-align:center;font-size:12px;color:#94a3b8;">
        &copy; ${new Date().getFullYear()} BaseLab Wholesale. All rights reserved.
      </td>
    </tr>
  </table>
</body>
</html>`;
}

async function sendOrderConfirmation(order, items, user) {
  try {
    const transport = await createTransport();
    const itemRows = items.map(item => `
      <tr>
        <td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;font-size:14px;">${item.name}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;font-size:14px;text-align:center;">${item.qty}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;font-size:14px;text-align:right;">$${(item.price * item.qty).toFixed(2)}</td>
      </tr>
    `).join('');

    const body = `
      <p style="font-size:14px;color:#475569;line-height:1.6;">Thank you for your order! Here are the details:</p>
      <p style="font-size:14px;color:#475569;"><strong>Order #:</strong> ${order.uuid}</p>
      <table width="100%" cellpadding="0" cellspacing="0" style="margin:16px 0;border:1px solid #e2e8f0;border-radius:8px;overflow:hidden;">
        <thead>
          <tr style="background:#f8fafc;">
            <th style="padding:10px 12px;text-align:left;font-size:12px;font-weight:700;color:#64748b;text-transform:uppercase;">Product</th>
            <th style="padding:10px 12px;text-align:center;font-size:12px;font-weight:700;color:#64748b;text-transform:uppercase;">Qty</th>
            <th style="padding:10px 12px;text-align:right;font-size:12px;font-weight:700;color:#64748b;text-transform:uppercase;">Total</th>
          </tr>
        </thead>
        <tbody>${itemRows}</tbody>
      </table>
      <table width="100%" style="margin-top:12px;">
        <tr><td style="font-size:14px;color:#475569;padding:4px 0;">Subtotal</td><td style="text-align:right;font-size:14px;color:#475569;">$${order.subtotal.toFixed(2)}</td></tr>
        <tr><td style="font-size:14px;color:#475569;padding:4px 0;">Shipping</td><td style="text-align:right;font-size:14px;color:#475569;">$${order.shipping_cost.toFixed(2)}</td></tr>
        <tr><td style="font-size:14px;color:#475569;padding:4px 0;">Tax</td><td style="text-align:right;font-size:14px;color:#475569;">$${order.tax.toFixed(2)}</td></tr>
        ${order.discount > 0 ? `<tr><td style="font-size:14px;color:#16a34a;padding:4px 0;">Discount</td><td style="text-align:right;font-size:14px;color:#16a34a;">-$${order.discount.toFixed(2)}</td></tr>` : ''}
        <tr><td style="font-size:16px;font-weight:700;color:#0f172a;padding:8px 0;border-top:2px solid #e2e8f0;">Total</td><td style="text-align:right;font-size:16px;font-weight:700;color:#0f172a;padding:8px 0;border-top:2px solid #e2e8f0;">$${order.total.toFixed(2)}</td></tr>
      </table>
      <p style="font-size:14px;color:#475569;margin-top:20px;">We'll notify you when your order ships.</p>
    `;

    const info = await transport.sendMail({
      from: process.env.EMAIL_FROM || 'BaseLab Wholesale <noreply@baselab.com>',
      to: order.ship_email,
      subject: `Order Confirmation - ${order.uuid}`,
      html: emailTemplate('Order Confirmed!', body),
    });

    const previewUrl = nodemailer.getTestMessageUrl(info);
    if (previewUrl) {
      console.log('Email preview URL:', previewUrl);
    }
    return info;
  } catch (err) {
    console.error('Failed to send order confirmation email:', err.message);
  }
}

async function sendWelcomeEmail(user) {
  try {
    const transport = await createTransport();
    const body = `
      <p style="font-size:14px;color:#475569;line-height:1.6;">
        Welcome to BaseLab Wholesale, ${user.first_name || 'there'}!
      </p>
      <p style="font-size:14px;color:#475569;line-height:1.6;">
        You now have access to wholesale pricing on our complete collection of vases, containers, and event supplies.
      </p>
      <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:20px;margin:20px 0;text-align:center;">
        <p style="font-size:13px;color:#15803d;margin:0 0 8px;font-weight:600;">YOUR WELCOME DISCOUNT</p>
        <p style="font-size:28px;font-weight:800;color:#16a34a;margin:0 0 8px;">10% OFF</p>
        <p style="font-size:16px;font-weight:700;color:#0f172a;margin:0;letter-spacing:2px;">WELCOME10</p>
      </div>
      <p style="font-size:14px;color:#475569;line-height:1.6;">
        Use the code above on your first order. Happy shopping!
      </p>
    `;

    const info = await transport.sendMail({
      from: process.env.EMAIL_FROM || 'BaseLab Wholesale <noreply@baselab.com>',
      to: user.email,
      subject: 'Welcome to BaseLab Wholesale - 10% Off Inside!',
      html: emailTemplate('Welcome!', body),
    });

    const previewUrl = nodemailer.getTestMessageUrl(info);
    if (previewUrl) {
      console.log('Welcome email preview URL:', previewUrl);
    }
    return info;
  } catch (err) {
    console.error('Failed to send welcome email:', err.message);
  }
}

async function sendPasswordReset(user, resetToken) {
  try {
    const transport = await createTransport();
    const resetUrl = `${process.env.APP_URL || 'http://localhost:3000'}/reset-password.html?token=${resetToken}`;
    const body = `
      <p style="font-size:14px;color:#475569;line-height:1.6;">
        We received a request to reset your password. Click the button below to proceed:
      </p>
      <div style="text-align:center;margin:24px 0;">
        <a href="${resetUrl}" style="display:inline-block;background:#16a34a;color:#fff;padding:12px 32px;border-radius:8px;font-size:14px;font-weight:700;text-decoration:none;">Reset Password</a>
      </div>
      <p style="font-size:13px;color:#94a3b8;">If you didn't request this, please ignore this email. This link expires in 1 hour.</p>
    `;

    const info = await transport.sendMail({
      from: process.env.EMAIL_FROM || 'BaseLab Wholesale <noreply@baselab.com>',
      to: user.email,
      subject: 'Reset Your BaseLab Password',
      html: emailTemplate('Password Reset', body),
    });

    const previewUrl = nodemailer.getTestMessageUrl(info);
    if (previewUrl) {
      console.log('Password reset email preview URL:', previewUrl);
    }
    return info;
  } catch (err) {
    console.error('Failed to send password reset email:', err.message);
  }
}

module.exports = { sendOrderConfirmation, sendWelcomeEmail, sendPasswordReset };
