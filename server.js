import express from 'express';
import cors from 'cors';
import Razorpay from 'razorpay';
import crypto from 'crypto';
import dotenv from 'dotenv';
import { PrismaClient } from '@prisma/client';

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

app.get('/', (req, res) => {
  res.send('Aether AI Backend Server is Running! 🚀');
});

const prisma = new PrismaClient();

const razorpay = new Razorpay({
  key_id: process.env.VITE_RAZORPAY_KEY_ID || 'rzp_test_placeholder',
  key_secret: process.env.RAZORPAY_KEY_SECRET || 'secret_placeholder',
});

app.post('/api/create-order', async (req, res) => {
  try {
    const { amount, currency = 'USD' } = req.body;
    
    const options = {
      amount: amount * 100,
      currency,
      receipt: 'receipt_' + Math.random().toString(36).substring(7),
    };

    const order = await razorpay.orders.create(options);
    res.json(order);
  } catch (error) {
    console.error('Error creating order:', error);
    res.status(500).json({ error: 'Failed to create order' });
  }
});

app.post('/api/verify-payment', async (req, res) => {
  const { razorpay_order_id, razorpay_payment_id, razorpay_signature, userId, tierName, items } = req.body;

  const sign = razorpay_order_id + '|' + razorpay_payment_id;
  const expectedSign = crypto
    .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET || 'secret_placeholder')
    .update(sign.toString())
    .digest('hex');

  if (razorpay_signature === expectedSign) {
    try {
      if (tierName && userId) {
        await prisma.user.update({
          where: { id: String(userId) },
          data: { plan: tierName }
        });
      } else if (items && items.length > 0 && userId) {
        const purchases = items.map(item => ({
          userId: String(userId),
          workflowId: String(item.id),
          amount: parseFloat(item.price),
          razorpayOrderId: razorpay_order_id,
          razorpayPaymentId: razorpay_payment_id
        }));
        await prisma.purchase.createMany({ data: purchases });
      }
      res.json({ success: true, message: 'Payment verified successfully' });
    } catch (dbError) {
      console.error('Database update error during payment verification:', dbError);
      res.status(500).json({ success: false, message: 'Payment valid but database update failed.' });
    }
  } else {
    res.status(400).json({ success: false, message: 'Invalid payment signature' });
  }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Express server running on port ${PORT}`);
});
