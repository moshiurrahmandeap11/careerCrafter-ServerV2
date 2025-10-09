// routes/payments.js
const express = require("express");
const router = express.Router();
const Stripe = require("stripe");

// Initialize Stripe with secret key
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

module.exports = (db) => {
  const paymentsCollection = db.collection("payments");
  const usersCollection = db.collection("users");

  // ✅ Create Stripe Payment Intent
  router.post("/create-payment-intent", async (req, res) => {
    try {
      const { planId, amount, billingCycle, userEmail } = req.body;

      console.log("💳 Creating Stripe payment intent for:", userEmail);

      if (!userEmail || !amount) {
        return res.status(400).json({
          success: false,
          error: "Missing required payment fields",
        });
      }

      const paymentIntent = await stripe.paymentIntents.create({
        amount: Math.round(amount * 100),
        currency: "usd",
        automatic_payment_methods: { enabled: true },
        metadata: { userEmail, planId, billingCycle },
      });

      console.log("✅ Stripe payment intent created:", paymentIntent.id);

      res.json({
        success: true,
        clientSecret: paymentIntent.client_secret,
        paymentIntentId: paymentIntent.id,
      });
    } catch (error) {
      console.error("❌ Stripe payment intent creation error:", error);
      res.status(500).json({
        success: false,
        error: "Failed to create payment intent: " + error.message,
      });
    }
  });

  // ✅ Process Payment + Update User
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
        paymentData,
      } = req.body;

      console.log("💰 Processing payment for:", userEmail);

      if (!userEmail || !planId || !amount) {
        return res
          .status(400)
          .json({ success: false, error: "Missing required payment fields" });
      }

      // 🧾 Create payment record
      const paymentRecord = {
        userEmail,
        planId,
        planName,
        paymentMethod,
        amount: parseFloat(amount),
        billingCycle,
        creditsAwarded: parseInt(creditsAwarded) || 0,
        transactionId: "TXN_" + Math.random().toString(36).substr(2, 9),
        status: "completed",
        paymentData: paymentData || {},
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      // ✅ Stripe payment verification (if card)
      if (paymentMethod === "card" && paymentData.stripePaymentIntentId) {
        try {
          const paymentIntent = await stripe.paymentIntents.retrieve(
            paymentData.stripePaymentIntentId
          );

          if (paymentIntent.status !== "succeeded") {
            return res
              .status(400)
              .json({ success: false, error: "Stripe payment not completed" });
          }

          paymentRecord.stripePaymentIntentId =
            paymentData.stripePaymentIntentId;
          paymentRecord.stripeChargeId = paymentIntent.latest_charge;
        } catch (stripeError) {
          console.error("❌ Stripe verification failed:", stripeError);
          return res
            .status(400)
            .json({ success: false, error: "Stripe payment verification failed" });
        }
      }

      // ✅ Save payment to "payments" collection
      const result = await paymentsCollection.insertOne(paymentRecord);

      // 🧠 Determine role type
      let userRole = "premium user";
      let roleType = "premium";

      if (planId.includes("pro") || planId.includes("business")) {
        userRole = "premium pro user";
        roleType = "premium pro";
      } else if (planId.includes("enterprise")) {
        userRole = "enterprise user";
        roleType = "enterprise";
      }

      // ✅ Update user's profile with premium data & push payment record
      const updateResult = await usersCollection.updateOne(
        { email: userEmail },
        {
          $set: {
            isPremium: true,
            currentPlan: planId,
            planName: planName,
            billingCycle: billingCycle,
            premiumSince: new Date(),
            subscriptionStatus: "active",
            role: userRole,
            roleType: roleType,
            lastPaymentDate: new Date(),
          },
          $inc: {
            aiCredits: parseInt(creditsAwarded) || 0,
          },
          $push: {
            payments: {
              transactionId: paymentRecord.transactionId,
              amount: paymentRecord.amount,
              planId: paymentRecord.planId,
              planName: paymentRecord.planName,
              billingCycle: paymentRecord.billingCycle,
              status: paymentRecord.status,
              creditsAwarded: paymentRecord.creditsAwarded,
              createdAt: paymentRecord.createdAt,
            },
          },
        },
        { upsert: false }
      );

      console.log("✅ Payment synced to user:", userEmail);
      console.log("📊 Payment summary:", {
        transactionId: paymentRecord.transactionId,
        amount: paymentRecord.amount,
        creditsAwarded: paymentRecord.creditsAwarded,
        plan: paymentRecord.planName,
        userRole,
        matchedCount: updateResult.matchedCount,
        modifiedCount: updateResult.modifiedCount,
      });

      res.json({
        success: true,
        transactionId: paymentRecord.transactionId,
        creditsAwarded: paymentRecord.creditsAwarded,
        roleUpdated: userRole,
        paymentRecord,
      });
    } catch (error) {
      console.error("❌ Payment processing error:", error);
      res
        .status(500)
        .json({ success: false, error: "Failed to process payment: " + error.message });
    }
  });

  // ✅ User payment history
  router.get("/user-payments/:userEmail", async (req, res) => {
    try {
      const { userEmail } = req.params;
      const payments = await paymentsCollection
        .find({ userEmail })
        .sort({ createdAt: -1 })
        .toArray();

      res.json({ success: true, payments });
    } catch (error) {
      res.status(500).json({ success: false, error: "Failed to fetch payments" });
    }
  });

  // ✅ Admin: All payments
  router.get("/all-payments", async (req, res) => {
    try {
      const payments = await paymentsCollection
        .find({})
        .sort({ createdAt: -1 })
        .toArray();

      res.json({ success: true, payments, total: payments.length });
    } catch (error) {
      res.status(500).json({ success: false, error: "Failed to fetch all payments" });
    }
  });

  return router;
};
