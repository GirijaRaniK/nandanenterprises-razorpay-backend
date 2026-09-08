const jwt = require("jsonwebtoken");
const { neon } = require("@neondatabase/serverless");

module.exports = async (req, res) => {
  /* =========================================================
     CORS
  ========================================================= */

  res.setHeader(
    "Access-Control-Allow-Origin",
    "https://girijaranik.github.io"
  );

  res.setHeader(
    "Access-Control-Allow-Methods",
    "GET, OPTIONS"
  );

  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization"
  );

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  /* =========================================================
     METHOD CHECK
  ========================================================= */

  if (req.method !== "GET") {
    return res.status(405).json({
      error: "Method not allowed",
    });
  }

  try {
    /* =========================================================
       ENVIRONMENT CHECK
    ========================================================= */

    if (!process.env.JWT_SECRET) {
      console.error("JWT_SECRET is missing");

      return res.status(500).json({
        error: "Server authentication configuration is missing",
      });
    }

    if (!process.env.DATABASE_URL) {
      console.error("DATABASE_URL is missing");

      return res.status(500).json({
        error: "Database configuration is missing",
      });
    }

    /* =========================================================
       AUTHORIZATION HEADER
    ========================================================= */

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

    /* =========================================================
       VERIFY JWT
    ========================================================= */

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

    /* =========================================================
       GET USER ID
    ========================================================= */

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

    /* =========================================================
       DATABASE
    ========================================================= */

    const sql = neon(
      process.env.DATABASE_URL
    );

    /* =========================================================
       GET ORDERS
    ========================================================= */

    const orders = await sql`
      SELECT
        o.id,
        o.order_number,
        o.total_amount,
        o.currency,
        o.order_status,
        o.created_at,

        p.razorpay_order_id,
        p.razorpay_payment_id,
        p.payment_status,
        p.amount AS payment_amount,
        p.created_at AS payment_created_at

      FROM orders o

      LEFT JOIN payments p
        ON p.order_id = o.id

      WHERE o.user_id = ${userId}

      ORDER BY o.created_at DESC
    `;

    /* =========================================================
       GET ORDER ITEMS
    ========================================================= */

    const orderIds = orders.map(
      (order) => order.id
    );

    let orderItems = [];

    if (orderIds.length > 0) {
      orderItems = await sql`
        SELECT
          id,
          order_id,
          product_id,
          product_name,
          price,
          quantity,
          subtotal,
          image

        FROM order_items

        WHERE order_id = ANY(${orderIds})

        ORDER BY id ASC
      `;
    }

    /* =========================================================
       BUILD RESPONSE
    ========================================================= */

    const formattedOrders = orders.map(
      (order) => {
        const items =
          orderItems.filter(
            (item) =>
              Number(item.order_id) ===
              Number(order.id)
          );

        return {
          id: order.id,

          order_number:
            order.order_number,

          total_amount:
            Number(order.total_amount),

          currency:
            order.currency || "INR",

          order_status:
            order.order_status ||
            "Order Placed",

          created_at:
            order.created_at,

          payment: {
            razorpay_order_id:
              order.razorpay_order_id ||
              null,

            razorpay_payment_id:
              order.razorpay_payment_id ||
              null,

            payment_status:
              order.payment_status ||
              "Unknown",

            amount:
              order.payment_amount !== null
                ? Number(order.payment_amount)
                : null,

            created_at:
              order.payment_created_at ||
              null,
          },

          items: items.map(
            (item) => ({
              id: item.id,

              product_id:
                item.product_id,

              product_name:
                item.product_name,

              price:
                Number(item.price),

              quantity:
                Number(item.quantity),

              subtotal:
                Number(item.subtotal),

              image:
                item.image || null,
            })
          ),
        };
      }
    );

    /* =========================================================
       RESPONSE
    ========================================================= */

    return res.status(200).json({
      success: true,
      orders: formattedOrders,
    });

  } catch (error) {
    console.error(
      "Get Orders Error:",
      error
    );

    return res.status(500).json({
      error: "Unable to load orders",
    });
  }
};
