const Razorpay = require("razorpay");

module.exports = async (req, res) => {
  // ---------------------------------------------------------
  // CORS
  // ---------------------------------------------------------
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  // Handle browser preflight request
  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  // Only POST is allowed
  if (req.method !== "POST") {
    return res.status(405).json({
      error: "Method not allowed",
    });
  }

  try {
    // ---------------------------------------------------------
    // Read request body
    // ---------------------------------------------------------
    const { amount } = req.body;

    // ---------------------------------------------------------
    // Validate amount
    // ---------------------------------------------------------
    if (!amount || Number(amount) <= 0) {
      return res.status(400).json({
        error: "Invalid amount",
      });
    }

    // ---------------------------------------------------------
    // Razorpay instance
    // ---------------------------------------------------------
    const razorpay = new Razorpay({
      key_id: process.env.RAZORPAY_KEY_ID,
      key_secret: process.env.RAZORPAY_KEY_SECRET,
    });

    // ---------------------------------------------------------
    // Create Razorpay order
    // Amount received from website is in Rupees
    // Razorpay requires amount in paise
    // ---------------------------------------------------------
    const order = await razorpay.orders.create({
      amount: Math.round(Number(amount) * 100),
      currency: "INR",
      receipt: "receipt_" + Date.now(),
    });

    // ---------------------------------------------------------
    // Return order details
    // ---------------------------------------------------------
    return res.status(200).json({
      order_id: order.id,
      amount: order.amount,
      currency: order.currency,
    });
  } catch (error) {
    console.error("Razorpay Error:", error);

    return res.status(500).json({
      error: "Unable to create Razorpay order",
    });
  }
};
