const crypto = require("crypto");
const jwt = require("jsonwebtoken");
const { neon } = require("@neondatabase/serverless");

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

  // Browser preflight
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
    // CHECK ENVIRONMENT VARIABLES
    // =========================================================

    if (!process.env.JWT_SECRET) {
      console.error("JWT_SECRET is missing");

      return res.status(500).json({
        error: "Server authentication configuration is missing",
      });
    }

    if (!process.env.RAZORPAY_KEY_SECRET) {
      console.error("RAZORPAY_KEY_SECRET is missing");

      return res.status(500).json({
        error: "Razorpay configuration is missing",
      });
    }

    if (!process.env.DATABASE_URL) {
      console.error("DATABASE_URL is missing");

      return res.status(500).json({
        error: "Database configuration is missing",
      });
    }

    // =========================================================
    // CHECK AUTHORIZATION HEADER
    // =========================================================

    const authHeader = req.headers.authorization;

    if (
      !authHeader ||
      !authHeader.startsWith("Bearer ")
    ) {
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
      console.error(
        "JWT verification failed:",
        jwtError.message
      );

      return res.status(401).json({
        error: "Invalid or expired login session",
      });
    }

    // =========================================================
    // GET USER ID
    // =========================================================

    const userId =
      decodedToken.id ||
      decodedToken.userId ||
      decodedToken.user_id;

    if (!userId) {
      console.error(
        "User ID missing from JWT:",
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
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
      amount,
      items,
    } = req.body || {};

    // =========================================================
    // VALIDATE RAZORPAY DATA
    // =========================================================

    if (
      !razorpay_order_id ||
      !razorpay_payment_id ||
      !razorpay_signature
    ) {
      return res.status(400).json({
        error: "Incomplete Razorpay payment information",
      });
    }

    // =========================================================
    // VALIDATE CART
    // =========================================================

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({
        error: "Order items are missing",
      });
    }

    // =========================================================
    // CALCULATE ORDER TOTAL
    // =========================================================

    let calculatedTotal = 0;

    for (const item of items) {
      if (
        !item ||
        !item.id ||
        !item.name
      ) {
        return res.status(400).json({
          error: "Invalid order item",
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

      calculatedTotal += price * quantity;
    }

    calculatedTotal =
      Math.round(calculatedTotal * 100) / 100;

    // =========================================================
    // CHECK AMOUNT
    // =========================================================

    const numericAmount = Number(amount);

    if (
      !Number.isFinite(numericAmount) ||
      numericAmount <= 0
    ) {
      return res.status(400).json({
        error: "Invalid order amount",
      });
    }

    if (
      Math.abs(calculatedTotal - numericAmount) >
      0.01
    ) {
      console.error("Amount mismatch:", {
        calculatedTotal,
        numericAmount,
        userId,
      });

      return res.status(400).json({
        error: "Order amount mismatch",
      });
    }

    // =========================================================
    // VERIFY RAZORPAY SIGNATURE
    // =========================================================

    const generatedSignature =
      crypto
        .createHmac(
          "sha256",
          process.env.RAZORPAY_KEY_SECRET
        )
        .update(
          razorpay_order_id +
          "|" +
          razorpay_payment_id
        )
        .digest("hex");

    const receivedSignature =
      String(razorpay_signature);

    const generatedBuffer =
      Buffer.from(generatedSignature, "utf8");

    const receivedBuffer =
      Buffer.from(receivedSignature, "utf8");

    if (
      generatedBuffer.length !==
      receivedBuffer.length ||
      !crypto.timingSafeEqual(
        generatedBuffer,
        receivedBuffer
      )
    ) {
      console.error(
        "Invalid Razorpay payment signature"
      );

      return res.status(400).json({
        error: "Payment verification failed",
      });
    }

    // =========================================================
    // CONNECT TO NEON DATABASE
    // =========================================================

    const sql = neon(
      process.env.DATABASE_URL
    );

    // =========================================================
    // CHECK WHETHER PAYMENT WAS ALREADY SAVED
    // =========================================================

    const existingPayment = await sql`
      SELECT id, order_id
      FROM payments
      WHERE razorpay_payment_id =
        ${razorpay_payment_id}
      LIMIT 1
    `;

    if (existingPayment.length > 0) {
      return res.status(200).json({
        success: true,
        message: "Payment already processed",
        order_id:
          existingPayment[0].order_id,
      });
    }

    // =========================================================
    // GENERATE UNIQUE ORDER NUMBER
    // =========================================================

    const orderNumber =
      "ORD-" +
      Date.now() +
      "-" +
      Math.floor(
        1000 + Math.random() * 9000
      );

    // =========================================================
    // INSERT ORDER
    // =========================================================

    const orderResult = await sql`
      INSERT INTO orders (
        user_id,
        order_number,
        total_amount,
        currency,
        order_status
      )
      VALUES (
        ${userId},
        ${orderNumber},
        ${calculatedTotal},
        'INR',
        'Order Placed'
      )
      RETURNING id, order_number
    `;

    if (
      !orderResult ||
      orderResult.length === 0
    ) {
      throw new Error(
        "Unable to create order"
      );
    }

    const orderId =
      orderResult[0].id;

    // =========================================================
    // INSERT ORDER ITEMS
    // =========================================================

    for (const item of items) {
      const price = Number(item.price);
      const quantity = Number(item.quantity);

      const subtotal =
        Math.round(
          price * quantity * 100
        ) / 100;

      const image =
        item.image || null;

      await sql`
        INSERT INTO order_items (
          order_id,
          product_id,
          product_name,
          price,
          quantity,
          subtotal,
          image
        )
        VALUES (
          ${orderId},
          ${String(item.id)},
          ${item.name},
          ${price},
          ${quantity},
          ${subtotal},
          ${image}
        )
      `;
    }

    // =========================================================
    // INSERT PAYMENT
    // =========================================================

    await sql`
      INSERT INTO payments (
        order_id,
        razorpay_order_id,
        razorpay_payment_id,
        payment_status,
        amount,
        currency
      )
      VALUES (
        ${orderId},
        ${razorpay_order_id},
        ${razorpay_payment_id},
        'Paid',
        ${calculatedTotal},
        'INR'
      )
    `;

    // =========================================================
    // SUCCESS RESPONSE
    // =========================================================

    return res.status(200).json({
      success: true,
      message: "Payment verified and order saved",
      order_id: orderId,
      order_number: orderNumber,
      amount: calculatedTotal,
      currency: "INR",
      payment_id: razorpay_payment_id,
    });

  } catch (error) {
    console.error(
      "Verify Payment Error:",
      error
    );

    return res.status(500).json({
      error:
        "Payment verification failed. Order was not completed.",
    });
  }
};

