const { neon } = require("@neondatabase/serverless");
const bcrypt = require("bcryptjs");

const sql = neon(process.env.DATABASE_URL);

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    return res.status(405).json({
      error: "Method not allowed",
    });
  }

  try {
    const { name, email, password } = req.body;

    // Basic validation
    if (!name || !email || !password) {
      return res.status(400).json({
        error: "Name, email and password are required",
      });
    }

    const cleanName = name.trim();
    const cleanEmail = email.trim().toLowerCase();

    if (cleanName.length < 2) {
      return res.status(400).json({
        error: "Please enter a valid name",
      });
    }

    if (password.length < 6) {
      return res.status(400).json({
        error: "Password must be at least 6 characters",
      });
    }

    // Check whether email already exists
    const existingUser = await sql`
      SELECT id
      FROM users
      WHERE email = ${cleanEmail}
      LIMIT 1
    `;

    if (existingUser.length > 0) {
      return res.status(409).json({
        error: "An account with this email already exists",
      });
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, 12);

    // Create user
    const result = await sql`
      INSERT INTO users (name, email, password_hash)
      VALUES (${cleanName}, ${cleanEmail}, ${passwordHash})
      RETURNING id, name, email, created_at
    `;

    return res.status(201).json({
      message: "Registration successful",
      user: result[0],
    });
  } catch (error) {
    console.error("Registration error:", error);

    return res.status(500).json({
      error: "Unable to create account",
    });
  }
};
