// routes/payments.js
const express = require("express");
const router = express.Router();
const Stripe = require('stripe');

// Initialize Stripe with secret key
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

module.exports = (db) => {
  const paymentsCollection = db.collection("payments");
  const usersCollection = db.collection("users");

  // Create Stripe payment intent
  router.post("/create-payment-intent", async (req, res) => {
    try {
      const {
        planId,
        amount,
        billingCycle,
        userEmail
      } = req.body;

      console.log("💳 Creating Stripe payment intent for:", userEmail);

      // Validate required fields
      if (!userEmail || !amount) {
        return res.status(400).json({
          success: false,
          error: "Missing required payment fields"
        });
      }

      // Create a PaymentIntent with the order amount and currency
      const paymentIntent = await stripe.paymentIntents.create({
        amount: Math.round(amount * 100), // Convert to cents
        currency: "usd",
        automatic_payment_methods: {
          enabled: true,
        },
        metadata: {
          userEmail,
          planId,
          billingCycle
        }
      });

      console.log("✅ Stripe payment intent created:", paymentIntent.id);

      res.json({
        success: true,
        clientSecret: paymentIntent.client_secret,
        paymentIntentId: paymentIntent.id
      });

    } catch (error) {
      console.error("❌ Stripe payment intent creation error:", error);
      res.status(500).json({
        success: false,
        error: "Failed to create payment intent: " + error.message
      });
    }
  });

  // Save payment data
  router.post("/process-payment", async (req, res) => {
    try {
      const {
        planId,
        planName,
        paymentMethod,
        amount,
        billingCycle,
        userEmail,
        creditsAwarded,
        paymentData
      } = req.body;

      console.log("💳 Processing payment for user:", userEmail);

      // Validate required fields
      if (!userEmail || !planId || !amount) {
        return res.status(400).json({
          success: false,
          error: "Missing required payment fields"
        });
      }

      // Create payment record
      const paymentRecord = {
        userEmail,
        planId,
        planName,
        paymentMethod,
        amount: parseFloat(amount),
        billingCycle,
        creditsAwarded: parseInt(creditsAwarded) || 0,
        transactionId: 'TXN_' + Math.random().toString(36).substr(2, 9),
        status: "completed",
        paymentData: paymentData || {},
        createdAt: new Date(),
        updatedAt: new Date()
      };

      // For Stripe payments, verify the payment intent
      if (paymentMethod === 'card' && paymentData.stripePaymentIntentId) {
        try {
          const paymentIntent = await stripe.paymentIntents.retrieve(
            paymentData.stripePaymentIntentId
          );
          
          if (paymentIntent.status !== 'succeeded') {
            return res.status(400).json({
              success: false,
              error: "Stripe payment not completed"
            });
          }

          // Update payment record with Stripe details
          paymentRecord.stripePaymentIntentId = paymentData.stripePaymentIntentId;
          paymentRecord.stripeChargeId = paymentIntent.latest_charge;
        } catch (stripeError) {
          console.error("❌ Stripe payment verification failed:", stripeError);
          return res.status(400).json({
            success: false,
            error: "Stripe payment verification failed"
          });
        }
      }

      // Save payment to database
      const result = await paymentsCollection.insertOne(paymentRecord);
      
      // Update user's premium status and credits
      await usersCollection.updateOne(
        { email: userEmail },
        { 
          $set: { 
            isPremium: true,
            currentPlan: planId,
            planName: planName,
            billingCycle: billingCycle,
            premiumSince: new Date(),
            subscriptionStatus: "active"
          },
          $inc: { 
            aiCredits: parseInt(creditsAwarded) || 0 
          }
        },
        { upsert: false }
      );

      console.log("✅ Payment successfully saved to database for user:", userEmail);
      console.log("📊 Payment details:", {
        transactionId: paymentRecord.transactionId,
        amount: paymentRecord.amount,
        creditsAwarded: paymentRecord.creditsAwarded,
        plan: paymentRecord.planName
      });

      res.json({
        success: true,
        transactionId: paymentRecord.transactionId,
        creditsAwarded: paymentRecord.creditsAwarded,
        paymentRecord: paymentRecord
      });

    } catch (error) {
      console.error("❌ Payment processing error:", error);
      res.status(500).json({
        success: false,
        error: "Failed to process payment: " + error.message
      });
    }
  });

  // Get user's payment history
  router.get("/user-payments/:userEmail", async (req, res) => {
    try {
      const { userEmail } = req.params;
      
      const payments = await paymentsCollection
        .find({ userEmail })
        .sort({ createdAt: -1 })
        .toArray();

      res.json({
        success: true,
        payments: payments
      });
    } catch (error) {
      console.error("Error fetching payment history:", error);
      res.status(500).json({
        success: false,
        error: "Failed to fetch payment history"
      });
    }
  });

  // Get all payments (admin only)
  router.get("/all-payments", async (req, res) => {
    try {
      const payments = await paymentsCollection
        .find({})
        .sort({ createdAt: -1 })
        .toArray();

      res.json({
        success: true,
        payments: payments,
        total: payments.length
      });
    } catch (error) {
      console.error("Error fetching all payments:", error);
      res.status(500).json({
        success: false,
        error: "Failed to fetch payments"
      });
    }
  });

  return router;
};