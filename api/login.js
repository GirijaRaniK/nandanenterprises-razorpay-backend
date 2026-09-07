const { neon } = require("@neondatabase/serverless");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

const sql = neon(process.env.DATABASE_URL);

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
    "Content-Type"
  );

  // Browser preflight request
  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  // =========================================================
  // METHOD CHECK
  // =========================================================

  if (req.method !== "POST") {
    return res.status(405).json({
      error: "Method not allowed",
    });
  }

  try {
    const { email, password } = req.body;

    // =======================================================
    // VALIDATE INPUT
    // =======================================================

    if (!email || !password) {
      return res.status(400).json({
        error: "Email and password are required",
      });
    }

    const cleanEmail = email.trim().toLowerCase();

    // =======================================================
    // FIND USER
    // =======================================================

    const users = await sql`
      SELECT id, name, email, password_hash
      FROM users
      WHERE email = ${cleanEmail}
      LIMIT 1
    `;

    if (users.length === 0) {
      return res.status(401).json({
        error: "Invalid email or password",
      });
    }

    const user = users[0];

    // =======================================================
    // CHECK PASSWORD
    // =======================================================

    const passwordMatch = await bcrypt.compare(
      password,
      user.password_hash
    );

    if (!passwordMatch) {
      return res.status(401).json({
        error: "Invalid email or password",
      });
    }

    // =======================================================
    // CREATE JWT TOKEN
    // =======================================================

    const token = jwt.sign(
      {
        userId: user.id,
        email: user.email,
      },
      process.env.JWT_SECRET,
      {
        expiresIn: "7d",
      }
    );

    // =======================================================
    // LOGIN SUCCESS
    // =======================================================

    return res.status(200).json({
      message: "Login successful",

      token: token,

      user: {
        id: user.id,
        name: user.name,
        email: user.email,
      },
    });

  } catch (error) {
    console.error("Login error:", error);

    return res.status(500).json({
      error: "Unable to login",
    });
  }
};
