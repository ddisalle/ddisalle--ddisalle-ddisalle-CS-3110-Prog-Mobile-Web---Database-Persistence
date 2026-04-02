# Database Persistence (SQL – SQLite)

# Deployed Application URL
https://ddisalle.chickenkiller.com

---

# Overview
I updated my web application to use **SQL-based persistence** instead of in-memory or filesystem storage. I implemented a **SQLite database** to store both user authentication data and application data so that all information persists across server restarts.

---

# Persistence Method
I used **SQLite** as the database system with the `better-sqlite3` Node.js package.

The database is stored locally in the project as:
        app.db

---

# Database Structure

# Users Table
Stores authentication information:

- `id` (INTEGER, primary key)
- `username` (TEXT, unique)
- `password_hash` (TEXT, bcrypt hashed password)
- `role` (TEXT: admin or author)

# Items Table
Stores user-generated content:

- `id` (INTEGER, primary key)
- `name` (TEXT)
- `created_by` (TEXT, username of creator)

---

# Security
- Passwords are **never stored in plain text**.
- All passwords are hashed using **bcrypt** before being stored in the database.
- Authentication is handled using **HTTP Basic Authentication**.
- Authorization is enforced with two roles:
  - **admin** (full access, can create users)
  - **author** (cannot create users)

---

# CRUD Operations with Persistence

The application supports full persistent CRUD functionality:

# Create
- `POST /api/items` adds a new item to the database
- `POST /api/users` (admin only) creates a new user

# Read
- `GET /api/items` retrieves all items
- `GET /api/users` (admin only) retrieves all users

# Update
- `PUT /api/items` updates an existing item in the database

# Delete
- `DELETE /api/items` removes an item from the database
- `DELETE /api/users` (admin only) removes a user

---

# Persistence Verification

To verify persistence, I performed the following steps:

1. Logged into the application as admin
2. Created a new item and a new user
3. Confirmed both appeared in the application
4. Restarted the server using:
        pm2 restart webapp3010

5. Reloaded the website
6. Confirmed that:
- the item still existed
- the user still existed

I repeated similar steps for update and delete operations to confirm:
- updated data remains after restart
- deleted data remains deleted after restart

---

# SSL Protection
The application is secured using HTTPS with a valid SSL certificate configured through Nginx and Certbot.

---

# Files Included in Submission

- `server.js` (Node.js server with SQLite integration)
- `package.json`
- `package-lock.json`
- `app.db` (SQLite database file)
- `index.html`
- `style.css`

---

# Conclusion
This assignment successfully transitions the application from temporary in-memory storage to a **persistent SQL-based solution** using SQLite. All user data and application data now survive server restarts, and sensitive information such as passwords is handled securely through hashing.