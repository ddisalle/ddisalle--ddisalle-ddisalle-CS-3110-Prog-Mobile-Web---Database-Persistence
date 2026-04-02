const express = require("express");
const path = require("path");
const bcrypt = require("bcryptjs");
const Database = require("better-sqlite3");

const app = express();
const PORT = 3010;

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// SQLite setup
const db = new Database(path.join(__dirname, "app.db"));

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL CHECK(role IN ('admin', 'author'))
  );

  CREATE TABLE IF NOT EXISTS items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    created_by TEXT NOT NULL
  );
`);

// Seed default users once
function seedUsers() {
  const count = db.prepare("SELECT COUNT(*) AS count FROM users").get();

  if (count.count > 0) {
    return;
  }

  const insertUser = db.prepare(`
    INSERT INTO users (username, password_hash, role)
    VALUES (?, ?, ?)
  `);

  insertUser.run("admin", bcrypt.hashSync("AdminPass123!", 10), "admin");
  insertUser.run("author", bcrypt.hashSync("AuthorPass123!", 10), "author");
}

seedUsers();

// Helper functions
function parseBasicAuth(req) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Basic ")) {
    return null;
  }

  try {
    const encoded = authHeader.split(" ")[1];
    const decoded = Buffer.from(encoded, "base64").toString("utf8");
    const parts = decoded.split(":");

    if (parts.length < 2) {
      return null;
    }

    const username = parts.shift();
    const password = parts.join(":");

    return { username, password };
  } catch (err) {
    return null;
  }
}

function requireAuth(req, res, next) {
  const creds = parseBasicAuth(req);

  if (!creds) {
    return res.status(401).json({ error: "Authentication required" });
  }

  const user = db.prepare(`
    SELECT id, username, password_hash, role
    FROM users
    WHERE username = ?
  `).get(creds.username);

  if (!user) {
    return res.status(401).json({ error: "Invalid credentials" });
  }

  const passwordMatches = bcrypt.compareSync(creds.password, user.password_hash);

  if (!passwordMatches) {
    return res.status(401).json({ error: "Invalid credentials" });
  }

  req.user = {
    id: user.id,
    username: user.username,
    role: user.role
  };

  next();
}

function requireAdmin(req, res, next) {
  if (!req.user || req.user.role !== "admin") {
    return res.status(403).json({ error: "Admin access required" });
  }

  next();
}

// Public endpoints
app.get("/api/items", (req, res) => {
  const { id } = req.query;

  if (!id) {
    const items = db.prepare(`
      SELECT id, name, created_by AS createdBy
      FROM items
      ORDER BY id ASC
    `).all();

    return res.json({ items });
  }

  const item = db.prepare(`
    SELECT id, name, created_by AS createdBy
    FROM items
    WHERE id = ?
  `).get(Number(id));

  if (!item) {
    return res.status(404).json({ error: "Item not found" });
  }

  return res.json({ item });
});

app.get("/api/info", (req, res) => {
  return res.json({
    message: "Public GET works without authentication",
    roles: ["admin", "author"]
  });
});

app.get("/api/me", requireAuth, (req, res) => {
  return res.json({
    user: req.user
  });
});

// Authenticated item endpoints
app.post("/api/items", requireAuth, (req, res) => {
  const name = (req.body.name || "").trim();

  if (!name) {
    return res.status(400).json({ error: "Missing required parameter: name" });
  }

  const result = db.prepare(`
    INSERT INTO items (name, created_by)
    VALUES (?, ?)
  `).run(name, req.user.username);

  const item = db.prepare(`
    SELECT id, name, created_by AS createdBy
    FROM items
    WHERE id = ?
  `).get(result.lastInsertRowid);

  const items = db.prepare(`
    SELECT id, name, created_by AS createdBy
    FROM items
    ORDER BY id ASC
  `).all();

  return res.status(201).json({
    message: "Created",
    item,
    items
  });
});

app.put("/api/items", requireAuth, (req, res) => {
  const id = Number(req.body.id);
  const name = (req.body.name || "").trim();

  if (!id) {
    return res.status(400).json({ error: "Missing required parameter: id" });
  }

  if (!name) {
    return res.status(400).json({ error: "Missing required parameter: name" });
  }

  const existing = db.prepare("SELECT id FROM items WHERE id = ?").get(id);

  if (!existing) {
    return res.status(404).json({ error: "Item not found" });
  }

  db.prepare(`
    UPDATE items
    SET name = ?
    WHERE id = ?
  `).run(name, id);

  const item = db.prepare(`
    SELECT id, name, created_by AS createdBy
    FROM items
    WHERE id = ?
  `).get(id);

  const items = db.prepare(`
    SELECT id, name, created_by AS createdBy
    FROM items
    ORDER BY id ASC
  `).all();

  return res.json({
    message: "Updated",
    item,
    items
  });
});

app.delete("/api/items", requireAuth, (req, res) => {
  const id = Number(req.body.id);

  if (!id) {
    return res.status(400).json({ error: "Missing required parameter: id" });
  }

  const result = db.prepare(`
    DELETE FROM items
    WHERE id = ?
  `).run(id);

  if (result.changes === 0) {
    return res.status(404).json({ error: "Item not found" });
  }

  const items = db.prepare(`
    SELECT id, name, created_by AS createdBy
    FROM items
    ORDER BY id ASC
  `).all();

  return res.json({
    message: "Deleted",
    items
  });
});

// Admin-only user endpoints
app.post("/api/users", requireAuth, requireAdmin, (req, res) => {
  const username = (req.body.username || "").trim();
  const password = req.body.password || "";
  const role = (req.body.role || "").trim().toLowerCase();

  if (!username) {
    return res.status(400).json({ error: "Missing required parameter: username" });
  }

  if (!password) {
    return res.status(400).json({ error: "Missing required parameter: password" });
  }

  if (role !== "admin" && role !== "author") {
    return res.status(400).json({ error: "Role must be admin or author" });
  }

  const existing = db.prepare(`
    SELECT id FROM users WHERE username = ?
  `).get(username);

  if (existing) {
    return res.status(400).json({ error: "Username already exists" });
  }

  const passwordHash = bcrypt.hashSync(password, 10);

  const result = db.prepare(`
    INSERT INTO users (username, password_hash, role)
    VALUES (?, ?, ?)
  `).run(username, passwordHash, role);

  const user = db.prepare(`
    SELECT id, username, role
    FROM users
    WHERE id = ?
  `).get(result.lastInsertRowid);

  return res.status(201).json({
    message: "User created",
    user
  });
});

app.get("/api/users", requireAuth, requireAdmin, (req, res) => {
  const users = db.prepare(`
    SELECT id, username, role
    FROM users
    ORDER BY id ASC
  `).all();

  return res.json({ users });
});

app.delete("/api/users", requireAuth, requireAdmin, (req, res) => {
  const id = Number(req.body.id);

  if (!id) {
    return res.status(400).json({ error: "Missing required parameter: id" });
  }

  const userToDelete = db.prepare(`
    SELECT id, username, role
    FROM users
    WHERE id = ?
  `).get(id);

  if (!userToDelete) {
    return res.status(404).json({ error: "User not found" });
  }

  if (userToDelete.username === req.user.username) {
    return res.status(400).json({ error: "You cannot delete your own account" });
  }

  db.prepare(`
    DELETE FROM users
    WHERE id = ?
  `).run(id);

  const users = db.prepare(`
    SELECT id, username, role
    FROM users
    ORDER BY id ASC
  `).all();

  return res.json({
    message: "User deleted",
    users
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`Server listening on http://127.0.0.1:${PORT}`);
});