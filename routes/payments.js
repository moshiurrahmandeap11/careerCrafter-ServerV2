const express = require("express");
const router = express.Router();
const Stripe = require("stripe");
const SSLCommerzPayment = require('sslcommerz-lts');

// Initialize Stripe with secret key
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

// Initialize SSLCommerz
const sslcommerz = new SSLCommerzPayment(
  process.env.SSLCOMMERZ_STORE_ID,
  process.env.SSLCOMMERZ_STORE_PASSWORD,
  process.env.SSLCOMMERZ_IS_LIVE === 'true'
);

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

  // ✅ Create SSLCommerz Payment Session - FIXED VERSION
  router.post("/create-sslcommerz-payment", async (req, res) => {
    try {
      const {
        planId,
        planName,
        paymentMethod,
        amount,
        billingCycle,
        userEmail,
        userName,
        mobileNumber,
        bankName,
        accountNumber
      } = req.body;

      console.log("💰 Creating SSLCommerz payment for:", userEmail);
      console.log("📦 Payment details:", { planName, amount, billingCycle });

      if (!userEmail || !amount) {
        return res.status(400).json({
          success: false,
          error: "Missing required payment fields",
        });
      }

      const transactionId = "TXN_" + Date.now() + Math.random().toString(36).substr(2, 5);
      
      const paymentData = {
        total_amount: amount,
        currency: 'BDT',
        tran_id: transactionId,
        success_url: `${process.env.FRONTEND_URL}/payment/success?transactionId=${transactionId}`,
        fail_url: `${process.env.FRONTEND_URL}/payment/failed?transactionId=${transactionId}`,
        cancel_url: `${process.env.FRONTEND_URL}/payment/canceled?transactionId=${transactionId}`,
        ipn_url: `${process.env.BACKEND_URL}/v1/payments/sslcommerz-ipn`,
        shipping_method: 'NO',
        product_name: `${planName} Plan - ${billingCycle}`,
        product_category: 'Subscription',
        product_profile: 'general',
        cus_name: userName || userEmail.split('@')[0],
        cus_email: userEmail,
        cus_add1: 'N/A',
        cus_add2: 'N/A',
        cus_city: 'N/A',
        cus_state: 'N/A',
        cus_postcode: '1000',
        cus_country: 'Bangladesh',
        cus_phone: mobileNumber || '01700000000',
        cus_fax: 'N/A',
        ship_name: 'N/A',
        ship_add1: 'N/A',
        ship_add2: 'N/A',
        ship_city: 'N/A',
        ship_state: 'N/A',
        ship_postcode: '1000',
        ship_country: 'Bangladesh'
      };

      console.log("🔧 SSLCommerz payment data prepared");

      // Create SSLCommerz session with better error handling
      try {
        const sslcz = await sslcommerz.init(paymentData);
        
        if (sslcz?.GatewayPageURL) {
          // Store payment data temporarily
          const paymentRecord = {
            transactionId,
            userEmail,
            planId,
            planName,
            paymentMethod,
            amount: parseFloat(amount),
            billingCycle,
            status: 'pending',
            paymentGateway: 'sslcommerz',
            paymentData: paymentData,
            createdAt: new Date(),
            updatedAt: new Date(),
          };

          await paymentsCollection.insertOne(paymentRecord);
          
          console.log("✅ SSLCommerz payment session created:", transactionId);
          console.log("🔗 Gateway URL:", sslcz.GatewayPageURL);
          
          res.json({
            success: true,
            GatewayPageURL: sslcz.GatewayPageURL,
            transactionId: transactionId
          });
        } else {
          console.error("❌ No GatewayPageURL in SSLCommerz response:", sslcz);
          throw new Error('SSLCommerz did not return a payment gateway URL');
        }
      } catch (sslError) {
        console.error("❌ SSLCommerz initialization error:", sslError);
        throw new Error(`SSLCommerz initialization failed: ${sslError.message}`);
      }
    } catch (error) {
      console.error("❌ SSLCommerz payment creation error:", error);
      res.status(500).json({
        success: false,
        error: "Failed to create payment session: " + error.message,
      });
    }
  });

  // ✅ SSLCommerz IPN (Instant Payment Notification) Handler
  router.post("/sslcommerz-ipn", async (req, res) => {
    try {
      const paymentData = req.body;
      console.log("📩 SSLCommerz IPN received:", paymentData);

      const { tran_id, status, val_id, bank_tran_id } = paymentData;

      // Find the payment record
      const paymentRecord = await paymentsCollection.findOne({ transactionId: tran_id });
      
      if (!paymentRecord) {
        return res.status(404).json({ error: "Payment record not found" });
      }

      if (status === 'VALID') {
        // Payment is valid, update user and payment record
        const creditsAwarded = calculateCredits(paymentRecord.planId, paymentRecord.billingCycle);
        
        // Determine role type
        let userRole = "premium user";
        let roleType = "premium";

        if (paymentRecord.planId.includes("pro") || paymentRecord.planId.includes("business")) {
          userRole = "premium pro user";
          roleType = "premium pro";
        } else if (paymentRecord.planId.includes("enterprise")) {
          userRole = "enterprise user";
          roleType = "enterprise";
        }

        // Update payment record
        await paymentsCollection.updateOne(
          { transactionId: tran_id },
          {
            $set: {
              status: 'completed',
              sslcommerzValId: val_id,
              bankTransactionId: bank_tran_id,
              creditsAwarded: creditsAwarded,
              updatedAt: new Date()
            }
          }
        );

        // Update user profile
        await usersCollection.updateOne(
          { email: paymentRecord.userEmail },
          {
            $set: {
              isPremium: true,
              currentPlan: paymentRecord.planId,
              planName: paymentRecord.planName,
              billingCycle: paymentRecord.billingCycle,
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
                transactionId: tran_id,
                amount: paymentRecord.amount,
                planId: paymentRecord.planId,
                planName: paymentRecord.planName,
                billingCycle: paymentRecord.billingCycle,
                status: 'completed',
                creditsAwarded: creditsAwarded,
                paymentGateway: 'sslcommerz',
                createdAt: new Date(),
              },
            },
          },
          { upsert: false }
        );

        console.log("✅ SSLCommerz payment completed successfully:", tran_id);
      } else if (status === 'FAILED') {
        await paymentsCollection.updateOne(
          { transactionId: tran_id },
          {
            $set: {
              status: 'failed',
              updatedAt: new Date()
            }
          }
        );
        console.log("❌ SSLCommerz payment failed:", tran_id);
      }

      res.json({ success: true, status: 'IPN processed' });
    } catch (error) {
      console.error("❌ SSLCommerz IPN processing error:", error);
      res.status(500).json({ error: "IPN processing failed" });
    }
  });

  // ✅ Process Stripe Payment + Update User
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
        paymentGateway: 'stripe',
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

          paymentRecord.stripePaymentIntentId = paymentData.stripePaymentIntentId;
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
              paymentGateway: 'stripe',
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

  // Helper function to calculate credits
  const calculateCredits = (planId, billingCycle) => {
    const baseCredits = {
      'basic': 0,
      'standard': 200000,
      'premium': 400000
    };
    
    const credits = baseCredits[planId] || 0;
    
    // Yearly billing gives 12x credits
    return billingCycle === 'yearly' ? credits * 12 : credits;
  };

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