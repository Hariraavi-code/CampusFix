
"use strict";

const express = require("express");
const path = require("path");
const fs = require("fs");
const Database = require("better-sqlite3");
const session = require("express-session");
const bcrypt = require("bcryptjs");

const app = express();
const PORT = process.env.PORT || 3000;

const dataDir = path.join(__dirname, "data");
fs.mkdirSync(dataDir, { recursive: true });

const db = new Database(path.join(dataDir, "campusfix.db"));

db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

// --------------------------------------------------
// DATABASE SETUP — preserves the existing database
// --------------------------------------------------

db.exec(`
  CREATE TABLE IF NOT EXISTS complaints (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    studentName TEXT NOT NULL,
    title TEXT NOT NULL,
    category TEXT NOT NULL,
    location TEXT NOT NULL,
    description TEXT NOT NULL,
    priority TEXT NOT NULL DEFAULT 'Medium',
    status TEXT NOT NULL DEFAULT 'Open',
    createdAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE COLLATE NOCASE,
    passwordHash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'student',
    createdAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
`);

// Add userId to an existing complaints table if needed.
const complaintColumns = db
  .prepare("PRAGMA table_info(complaints)")
  .all()
  .map((column) => column.name);

if (!complaintColumns.includes("userId")) {
  db.exec("ALTER TABLE complaints ADD COLUMN userId INTEGER");
}

const userColumns = db
  .prepare("PRAGMA table_info(users)")
  .all()
  .map((column) => column.name);

if (!userColumns.includes("passwordHash")) {
  throw new Error(
    "The existing users table has an unexpected schema. Database preserved; inspect it before proceeding."
  );
}

// --------------------------------------------------
// MIDDLEWARE
// --------------------------------------------------

app.disable("x-powered-by");
app.use(express.json({ limit: "20kb" }));
app.use(express.urlencoded({ extended: false }));

if (!process.env.SESSION_SECRET) {
  console.warn(
    "WARNING: SESSION_SECRET is not set. Using a temporary development secret."
  );
}

app.use(
  session({
    name: "campusfix.sid",
    secret: process.env.SESSION_SECRET || require("crypto").randomBytes(32).toString("hex"),
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: 1000 * 60 * 60 * 8
    }
  })
);

// --------------------------------------------------
// HELPERS
// --------------------------------------------------

function requireLogin(req, res, next) {
  if (!req.session.user) {
    return res.status(401).json({
      message: "Please log in to continue."
    });
  }

  next();
}

function requireStaff(req, res, next) {
  if (!req.session.user) {
    return res.status(401).json({
      message: "Please log in to continue."
    });
  }

  if (!["staff", "admin"].includes(req.session.user.role)) {
    return res.status(403).json({
      message: "Staff permission required."
    });
  }

  next();
}

function requireAdmin(req, res, next) {
  if (!req.session.user) {
    return res.status(401).json({
      message: "Please log in to continue."
    });
  }

  if (req.session.user.role !== "admin") {
    return res.status(403).json({
      message: "Admin permission required."
    });
  }

  next();
}

function asyncRoute(handler) {
  return (req, res, next) => {
    Promise.resolve(handler(req, res, next)).catch(next);
  };
}

function publicUser(user) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role
  };
}

// --------------------------------------------------
// AUTHENTICATION
// --------------------------------------------------

// Register student accounts.
app.post(
  "/api/auth/register",
  asyncRoute(async (req, res) => {
    const name = String(req.body.name || "").trim();
    const email = String(req.body.email || "").trim().toLowerCase();
    const password = String(req.body.password || "");

    if (!name || !email || !password) {
      return res.status(400).json({
        message: "Name, email, and password are required."
      });
    }

    if (name.length > 80) {
      return res.status(400).json({
        message: "Name must be 80 characters or fewer."
      });
    }

    if (
      email.length > 254 ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
    ) {
      return res.status(400).json({
        message: "Enter a valid email address."
      });
    }

    if (password.length < 8 || Buffer.byteLength(password, "utf8") > 72) {
      return res.status(400).json({
        message: "Password must be at least 8 characters and no more than 72 bytes."
      });
    }

    const existingUser = db
      .prepare("SELECT id FROM users WHERE email = ?")
      .get(email);

    if (existingUser) {
      return res.status(409).json({
        message: "An account with this email already exists."
      });
    }

    const passwordHash = await bcrypt.hash(password, 12);

    try {
      db.prepare(`
        INSERT INTO users (name, email, passwordHash, role)
        VALUES (?, ?, ?, 'student')
      `).run(name, email, passwordHash);
    } catch (error) {
      if (error.code === "SQLITE_CONSTRAINT_UNIQUE") {
        return res.status(409).json({
          message: "An account with this email already exists."
        });
      }

      throw error;
    }

    return res.status(201).json({
      message: "Student account created. Please log in."
    });
  })
);

// Log in.
app.post(
  "/api/auth/login",
  asyncRoute(async (req, res) => {
    const email = String(req.body.email || "").trim().toLowerCase();
    const password = String(req.body.password || "");

    if (!email || !password) {
      return res.status(400).json({
        message: "Email and password are required."
      });
    }

    const user = db
      .prepare("SELECT * FROM users WHERE email = ?")
      .get(email);

    if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
      return res.status(401).json({
        message: "Invalid email or password."
      });
    }

    req.session.regenerate((error) => {
      if (error) {
        return res.status(500).json({
          message: "Could not start your session. Please try again."
        });
      }

      const safeUser = publicUser(user);
      req.session.user = safeUser;

      req.session.save((saveError) => {
        if (saveError) {
          return res.status(500).json({
            message: "Could not save your session. Please try again."
          });
        }

        return res.json({
          message: "Login successful.",
          user: safeUser
        });
      });
    });
  })
);

// Current logged-in user.
app.get("/api/auth/me", requireLogin, (req, res) => {
  res.json({ user: req.session.user });
});

// Log out.
app.post("/api/auth/logout", requireLogin, (req, res, next) => {
  req.session.destroy((error) => {
    if (error) return next(error);

    res.clearCookie("campusfix.sid", {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production"
    });

    res.json({ message: "Logged out successfully." });
  });
});

// --------------------------------------------------
// COMPLAINT STATISTICS
// --------------------------------------------------

app.get("/api/complaints/stats", requireLogin, (req, res) => {
  const user = req.session.user;
  const isStudent = user.role === "student";

  const whereClause = isStudent ? "WHERE userId = ?" : "";
  const params = isStudent ? [user.id] : [];

  const rows = db.prepare(`
    SELECT status, COUNT(*) AS count
    FROM complaints
    ${whereClause}
    GROUP BY status
  `).all(...params);

  const stats = {
    total: 0,
    open: 0,
    inProgress: 0,
    resolved: 0
  };

  for (const row of rows) {
    const count = Number(row.count);
    const status = String(row.status || "Open").toLowerCase();

    stats.total += count;

    if (status === "open") {
      stats.open += count;
    } else if (
      status === "in progress" ||
      status === "in_progress" ||
      status === "inprogress"
    ) {
      stats.inProgress += count;
    } else if (
      status === "resolved" ||
      status === "closed" ||
      status === "completed"
    ) {
      stats.resolved += count;
    }
  }

  res.json(stats);
});

// --------------------------------------------------
// LIST COMPLAINTS
// --------------------------------------------------

app.get("/api/complaints", requireLogin, (req, res) => {
  const user = req.session.user;
  const conditions = [];
  const params = [];

  // Students can only view their own complaints.
  if (user.role === "student") {
    conditions.push("userId = ?");
    params.push(user.id);
  }

  const search = String(req.query.search || "").trim().slice(0, 100);

  if (search) {
    conditions.push(`
      (
        title LIKE ? OR
        category LIKE ? OR
        location LIKE ? OR
        description LIKE ? OR
        studentName LIKE ?
      )
    `);

    const term = `%${search}%`;
    params.push(term, term, term, term, term);
  }

  const status = String(req.query.status || "").trim();

  if (["Open", "In Progress", "Resolved"].includes(status)) {
    conditions.push("status = ?");
    params.push(status);
  }

  const whereClause = conditions.length
    ? `WHERE ${conditions.join(" AND ")}`
    : "";

  const rows = db.prepare(`
    SELECT
      id, userId, studentName, title, category,
      location, description, priority, status, createdAt
    FROM complaints
    ${whereClause}
    ORDER BY id DESC
  `).all(...params);

  res.json(rows);
});


 // --------------------------------------------------
 // CREATE COMPLAINT — students only
 // --------------------------------------------------

app.post("/api/complaints", requireLogin, (req, res) => {
  const user = req.session.user;

  if (user.role !== "student") {
    return res.status(403).json({
      message: "Only student accounts can submit complaints."
    });
  }

  const category = String(req.body.category || "").trim();
  const title = String(req.body.title || "").trim();
  const location = String(req.body.location || "").trim();
  const description = String(req.body.description || "").trim();
  const priority = String(req.body.priority || "Medium").trim();

  if (!category || !title || !location || !description) {
    return res.status(400).json({
      message: "Please fill in all required complaint fields."
    });
  }

  if (
    title.length > 100 ||
    location.length > 120 ||
    description.length > 1000
  ) {
    return res.status(400).json({
      message: "One or more fields exceed the allowed length."
    });
  }

  const allowedCategories = [
    "Electrical",
    "Plumbing",
    "Cleaning",
    "Internet / Wi-Fi",
    "Furniture",
    "Other"
  ];

  if (!allowedCategories.includes(category)) {
    return res.status(400).json({
      message: "Please select a valid category."
    });
  }

  if (!["Low", "Medium", "High"].includes(priority)) {
    return res.status(400).json({
      message: "Please select a valid priority."
    });
  }

  // Explicitly set createdAt for compatibility with the existing database.
  const result = db.prepare(`
    INSERT INTO complaints (
      userId,
      studentName,
      title,
      category,
      location,
      description,
      priority,
      status,
      createdAt
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, 'Open', CURRENT_TIMESTAMP)
  `).run(
    user.id,
    user.name,
    title,
    category,
    location,
    description,
    priority
  );

  const complaint = db.prepare(`
    SELECT
      id,
      userId,
      studentName,
      title,
      category,
      location,
      description,
      priority,
      status,
      createdAt
    FROM complaints
    WHERE id = ?
  `).get(result.lastInsertRowid);

  return res.status(201).json({
    message: "Complaint submitted successfully.",
    complaint
  });
});


// --------------------------------------------------
// UPDATE COMPLAINT STATUS — staff/admin
// --------------------------------------------------

app.patch(
  "/api/complaints/:id/status",
  requireStaff,
  (req, res) => {
    const id = Number(req.params.id);
    const status = String(req.body.status || "").trim();

    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({
        message: "Invalid complaint ID."
      });
    }

    if (!["Open", "In Progress", "Resolved"].includes(status)) {
      return res.status(400).json({
        message: "Invalid status."
      });
    }

    const result = db.prepare(`
      UPDATE complaints SET status = ?
      WHERE id = ?
    `).run(status, id);

    if (result.changes === 0) {
      return res.status(404).json({
        message: "Complaint not found."
      });
    }

    res.json({ message: "Complaint status updated successfully." });
  }
);

// --------------------------------------------------
// DELETE COMPLAINT — admin only
// --------------------------------------------------

app.delete(
  "/api/complaints/:id",
  requireAdmin,
  (req, res) => {
    const id = Number(req.params.id);

    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({
        message: "Invalid complaint ID."
      });
    }

    const result = db.prepare(
      "DELETE FROM complaints WHERE id = ?"
    ).run(id);

    if (result.changes === 0) {
      return res.status(404).json({
        message: "Complaint not found."
      });
    }

    res.json({ message: "Complaint deleted successfully." });
  }
);

// --------------------------------------------------
// FRONTEND
// --------------------------------------------------

app.use(express.static(path.join(__dirname, "public")));

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// Unknown API route.
app.use("/api", (req, res) => {
  res.status(404).json({ message: "API endpoint not found." });
});

// General error handler.
app.use((error, req, res, next) => {
  console.error("Server error:", error);

  if (res.headersSent) {
    return next(error);
  }

  res.status(500).json({
    message: "An unexpected server error occurred."
  });
});

app.listen(PORT, () => {
  console.log(`CampusFix running at http://localhost:${PORT}`);
});
