const Razorpay = require("razorpay");
const jwt = require("jsonwebtoken");

module.exports = async (req, res) => {
  // =========================================================
  // CORS
  // =========================================================

  res.setHeader(
    "Access-Control-Allow-Origin",
    "https://girijaranik.github.io"
  );

  res.setHeader(
    "Access-Control-Allow-Methods",
    "POST, OPTIONS"
  );

  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization"
  );

  // Handle browser preflight request
  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  // Only POST allowed
  if (req.method !== "POST") {
    return res.status(405).json({
      error: "Method not allowed",
    });
  }

  try {
    // =========================================================
    // CHECK JWT SECRET
    // =========================================================

    if (!process.env.JWT_SECRET) {
      console.error("JWT_SECRET is missing");

      return res.status(500).json({
        error: "Server authentication configuration is missing",
      });
    }

    // =========================================================
    // GET AUTHORIZATION HEADER
    // =========================================================

    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({
        error: "Authentication required",
      });
    }

    const token = authHeader.substring(7);

    // =========================================================
    // VERIFY JWT
    // =========================================================

    let decodedToken;

    try {
      decodedToken = jwt.verify(
        token,
        process.env.JWT_SECRET
      );
    } catch (jwtError) {
      console.error("JWT verification failed:", jwtError.message);

      return res.status(401).json({
        error: "Invalid or expired login session",
      });
    }

    // =========================================================
    // GET USER ID FROM TOKEN
    // =========================================================

    const userId =
      decodedToken.id ||
      decodedToken.userId ||
      decodedToken.user_id;

    if (!userId) {
      console.error(
        "JWT does not contain a user ID:",
        decodedToken
      );

      return res.status(401).json({
        error: "Invalid user authentication data",
      });
    }

    // =========================================================
    // READ REQUEST BODY
    // =========================================================

    const {
      amount,
      items
    } = req.body || {};

    // =========================================================
    // VALIDATE AMOUNT
    // =========================================================

    const numericAmount = Number(amount);

    if (
      !Number.isFinite(numericAmount) ||
      numericAmount <= 0
    ) {
      return res.status(400).json({
        error: "Invalid amount",
      });
    }

    // =========================================================
    // VALIDATE CART ITEMS
    // =========================================================

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({
        error: "Cart is empty",
      });
    }

    // =========================================================
    // VALIDATE EACH CART ITEM
    // =========================================================

    for (const item of items) {
      if (!item || !item.id || !item.name) {
        return res.status(400).json({
          error: "Invalid cart item",
        });
      }

      const price = Number(item.price);
      const quantity = Number(item.quantity);

      if (
        !Number.isFinite(price) ||
        price <= 0
      ) {
        return res.status(400).json({
          error: "Invalid product price",
        });
      }

      if (
        !Number.isInteger(quantity) ||
        quantity <= 0
      ) {
        return res.status(400).json({
          error: "Invalid product quantity",
        });
      }
    }

    // =========================================================
    // CALCULATE CART TOTAL
    // =========================================================

    let calculatedTotal = 0;

    for (const item of items) {
      const price = Number(item.price);
      const quantity = Number(item.quantity);

      calculatedTotal += price * quantity;
    }

    calculatedTotal =
      Math.round(calculatedTotal * 100) / 100;

    // =========================================================
    // VERIFY REQUESTED AMOUNT MATCHES CART TOTAL
    // =========================================================

    if (
      Math.abs(calculatedTotal - numericAmount) >
      0.01
    ) {
      console.error("Amount mismatch:", {
        requestedAmount: numericAmount,
        calculatedTotal: calculatedTotal,
        userId: userId,
      });

      return res.status(400).json({
        error: "Cart amount mismatch",
      });
    }

    // =========================================================
    // CHECK RAZORPAY ENVIRONMENT VARIABLES
    // =========================================================

    if (
      !process.env.RAZORPAY_KEY_ID ||
      !process.env.RAZORPAY_KEY_SECRET
    ) {
      console.error(
        "Razorpay environment variables are missing"
      );

      return res.status(500).json({
        error: "Razorpay configuration is missing",
      });
    }

    // =========================================================
    // CREATE RAZORPAY INSTANCE
    // =========================================================

    const razorpay = new Razorpay({
      key_id: process.env.RAZORPAY_KEY_ID,
      key_secret: process.env.RAZORPAY_KEY_SECRET,
    });

    // =========================================================
    // CREATE RAZORPAY ORDER
    // =========================================================

    const razorpayOrder =
      await razorpay.orders.create({
        amount: Math.round(calculatedTotal * 100),
        currency: "INR",
        receipt:
          "receipt_" +
          Date.now() +
          "_" +
          userId,
      });

    // =========================================================
    // RETURN ORDER INFORMATION
    // =========================================================

    return res.status(200).json({
      success: true,

      order_id: razorpayOrder.id,

      amount: razorpayOrder.amount,

      currency: razorpayOrder.currency,

      user_id: userId,

      items: items,
    });

  } catch (error) {
    console.error(
      "Create Payment Error:",
      error
    );

    return res.status(500).json({
      error: "Unable to create Razorpay order",
    });
  }
};
