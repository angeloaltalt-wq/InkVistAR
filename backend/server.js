const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const mysql = require('mysql2');
const bcrypt = require('bcryptjs');
const cors = require('cors');
const Groq = require('groq-sdk');
const crypto = require('crypto');
// Provide fetch for Node runtimes that lack the global (e.g., Node 16 on some hosts)
const fetch = global.fetch || require('node-fetch');
require('dotenv').config();
process.env.TZ = 'Asia/Manila'; // Global Node.js timezone localization

const app = express();
const { sendResendEmail } = require('./utils/emailService');
const { sendSMS, otpMessage, appointmentConfirmedSMS, appointmentCancelledSMS, appointmentRequestedAdminSMS } = require('./utils/smsService');
const server = http.createServer(app);
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3000';
const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:3001';

// Define allowed origins for CORS
const allowedOrigins = [
  'https://inkvistar-web.vercel.app',
  'https://inkvistar-web.vercel.app/',
  'http://localhost:3000',
  'http://localhost:5173',
  'http://localhost:19006',
  'http://localhost:8081'
];

// Add the FRONTEND_URL origin and its www/non-www counterpart
try {
  const urlObj = new URL(FRONTEND_URL);
  const origin = urlObj.origin;
  const hostname = urlObj.hostname;

  if (!allowedOrigins.includes(origin)) {
    allowedOrigins.push(origin);
  }

  // Also allow the www/non-www sibling
  if (hostname.startsWith('www.')) {
    const rootOrigin = origin.replace('www.', '');
    if (!allowedOrigins.includes(rootOrigin)) allowedOrigins.push(rootOrigin);
  } else if (!hostname.includes('localhost') && !hostname.match(/^\d/)) {
    const wwwOrigin = origin.replace('://', '://www.');
    if (!allowedOrigins.includes(wwwOrigin)) allowedOrigins.push(wwwOrigin);
  }
} catch (e) {
  if (FRONTEND_URL && !allowedOrigins.includes(FRONTEND_URL)) {
    allowedOrigins.push(FRONTEND_URL);
  }
}

const io = new Server(server, {
  cors: {
    origin: (origin, callback) => {
      if (!origin) return callback(null, true);

      const isAllowed = allowedOrigins.some(allowed => origin.startsWith(allowed)) ||
        origin.includes('vercel.app') ||
        origin.includes('inkvictusstudio.com');

      if (isAllowed) {
        callback(null, true);
      } else {
        console.log('[Socket.io] Blocked by CORS:', origin);
        callback(new Error('Not allowed by CORS'));
      }
    },
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    credentials: true
  }
});

// Helper to get safe protocol (prioritize https for production)
const getProtocol = (req) => {
  return req.headers['x-forwarded-proto'] || (req.get('host') && req.get('host').includes('render.com') ? 'https' : req.protocol);
};

console.log(`[CONFIG] Redirects will point to: ${FRONTEND_URL}`);
console.log(`[CONFIG] Verification logic updated for dynamic host detection.`);

// PayMongo configuration
const PAYMONGO_SECRET_KEY = process.env.PAYMONGO_SECRET_KEY;
const PAYMONGO_PUBLIC_KEY = process.env.PAYMONGO_PUBLIC_KEY; // kept for potential client-side uses
const PAYMONGO_WEBHOOK_SECRET = process.env.PAYMONGO_WEBHOOK_SECRET;
const PAYMONGO_MODE = process.env.PAYMONGO_MODE || 'test';
const PAYMONGO_API_BASE = 'https://api.paymongo.com/v1';

// Google reCAPTCHA v3 configuration
const RECAPTCHA_SECRET_KEY = process.env.RECAPTCHA_SECRET_KEY || '6Le9F78sAAAAACBBrgQz5pzpbZ2VxI4h71UXhCd9';

async function verifyCaptcha(token) {
  // TEMPORARILY DISABLED -- always pass CAPTCHA checks during development
  console.log('[reCAPTCHA v3] CAPTCHA verification is DISABLED. Returning true.');
  return true;
  /*
  if (!token) return false;
  try {
    const response = await fetch('https://www.google.com/recaptcha/api/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `secret=${RECAPTCHA_SECRET_KEY}&response=${encodeURIComponent(token)}`
    });
    const data = await response.json();
    console.log('[reCAPTCHA v3] Verification result:', data);
    // For v3, consider a score of 0.3 or above as passing to prevent overly aggressive blocking
    return data.success === true && (data.score === undefined || data.score >= 0.3);
  } catch (err) {
    console.error('reCAPTCHA verification error:', err.message);
    return false;
  }
  */
}

// Enhanced CORS configuration
app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);

    // Check if the origin is in our allowed list or matches our patterns
    const isAllowed = allowedOrigins.some(allowed => origin.startsWith(allowed)) ||
      origin.includes('vercel.app') ||
      origin.includes('inkvictusstudio.com') ||
      origin.includes('localhost');

    if (isAllowed) {
      callback(null, true);
    } else {
      console.log('Blocked by CORS:', origin);
      callback(new Error('Not allowed by CORS'));
    }
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Accept', 'X-Requested-With', 'x-user-email', 'x-admin-id'],
  credentials: true,
  optionsSuccessStatus: 200 // Some legacy browsers (IE11, various SmartTVs) choke on 204
}));

// Keep raw body for webhook signature verification while still parsing JSON elsewhere
app.use(express.json({
  limit: '50mb',
  verify: (req, res, buf) => {
    req.rawBody = buf;
  }
}));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// ========== SECURITY: INPUT SANITIZATION MIDDLEWARE ==========
app.use((req, res, next) => {
  if (req.body) {
    Object.keys(req.body).forEach(key => {
      // Skip passwords and image data (base64)
      if (typeof req.body[key] === 'string' &&
        !key.toLowerCase().includes('password') &&
        !key.toLowerCase().includes('image')) {
        // Strip HTML tags to prevent XSS
        req.body[key] = req.body[key].replace(/<[^>]*>?/gm, '');
      }
    });
  }
  next();
});

// MySQL Connection Pool (supporting Railway and generic env variables)
const db = mysql.createPool({
  host: process.env.MYSQLHOST || process.env.DB_HOST || 'localhost',
  user: process.env.MYSQLUSER || process.env.DB_USER || 'root',
  password: process.env.MYSQLPASSWORD || process.env.DB_PASS || 'banana',
  database: process.env.MYSQLDATABASE || process.env.DB_NAME || 'inkvistar',
  port: process.env.MYSQLPORT ? Number(process.env.MYSQLPORT) : (process.env.DB_PORT ? Number(process.env.DB_PORT) : 3306),
   connectionLimit: 10,
  waitForConnections: true,
  queueLimit: 0,
  timezone: '+08:00', // Ensure SQL NOW() and CURRENT_TIMESTAMP use UTC+8
  dateStrings: true, // Force date columns to be returned as strings to prevent timezone shifts
  maxAllowedPacket: 50 * 1024 * 1024 // 50MB - allows large base64 image data in queries
});

// Health check endpoint for Railway/Render
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'healthy', timestamp: new Date().toISOString() });
});

// Helper to get local MySQL DATETIME string
function getLocalDatetime(date = new Date()) {
  const offset = 8 * 60; // Manila is UTC+8
  const localDate = new Date(date.getTime() + (offset + date.getTimezoneOffset()) * 60000);
  return localDate.toISOString().slice(0, 19).replace('T', ' ');
}

// Generate Kiosk-style Booking Code
function generateBookingCode(origin, serviceType, insertId) {
  const originCode = origin === 'W' ? 'W' : 'O';

  let serviceCode = 'C';
  const typeStr = String(serviceType || '').toLowerCase();
  // Ensure "Tattoo + Piercing" matches "TP" before generic "tattoo"
  if (typeStr.includes('tattoo + piercing')) serviceCode = 'TP';
  else if (typeStr.includes('tattoo')) serviceCode = 'T';
  else if (typeStr.includes('piercing')) serviceCode = 'P';
  else if (typeStr.includes('follow') || typeStr.includes('touch')) serviceCode = 'F';

  const seqNum = String((parseInt(insertId, 10) || 0) % 10000).padStart(4, '0');
  return `${originCode}-${serviceCode}-${seqNum}`;
}

// Connect to MySQL via Pool
db.getConnection((err, connection) => {
  if (err) {
    console.error('[ERROR] MySQL Connection Error:', err.message);
    console.error('[ERROR] Error code:', err.code);
    console.error('[ERROR] Error SQL State:', err.sqlState);
  } else {
    console.log('[OK] MySQL Connected Successfully via Pool!');
    console.log('[INFO] Database:', process.env.DB_NAME || 'inkvistar');
    connection.release();

    // Create Users Table if not exists (REQUIRED for all other tables)
    const usersTableQuery = `
      CREATE TABLE IF NOT EXISTS users (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        email VARCHAR(255) NOT NULL UNIQUE,
        phone VARCHAR(20) NULL,
        password_hash VARCHAR(255) NOT NULL,
        user_type ENUM('admin', 'manager', 'artist', 'customer') NOT NULL,
        is_verified BOOLEAN DEFAULT 0,
        verification_token VARCHAR(255),
        otp_code VARCHAR(10),
        otp_expires DATETIME,
        push_token VARCHAR(255),
        is_deleted BOOLEAN DEFAULT 0,
        failed_login_attempts INT DEFAULT 0,
        lockout_until DATETIME DEFAULT NULL,
        account_status ENUM('active', 'deactivated', 'banned') DEFAULT 'active',
        status_reason TEXT NULL,
        appeal_status ENUM('none', 'pending', 'accepted', 'denied') DEFAULT 'none',
        appeal_message TEXT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `;
    db.query(usersTableQuery, (err) => {
      if (err) {
        console.error('[WARN] Error checking users table:', err.message);
      } else {
        // MIGRATION: Add 'phone' column if it doesn't exist
        db.query("SHOW COLUMNS FROM users LIKE 'phone'", (err, results) => {
          if (!err && results.length === 0) {
            console.log('[MIGRATE] Migrating users: Adding phone column...');
            db.query("ALTER TABLE users ADD COLUMN phone VARCHAR(20) NULL AFTER email");
          }
        });

        // MIGRATION: Sanitize legacy phone numbers that contain a leading zero after +63
        // e.g., +630927... → +63927...
        db.query(
          "UPDATE users SET phone = CONCAT('+63', SUBSTRING(phone, 5)) WHERE phone LIKE '+630%'",
          (err, result) => {
            if (!err && result && result.affectedRows > 0) {
              console.log(`[MIGRATE] Sanitized ${result.affectedRows} phone number(s) in users table (removed leading zero after +63)`);
            }
          }
        );

        // MIGRATION: Add lockout tracking columns if they don't exist
        db.query("SHOW COLUMNS FROM users LIKE 'failed_login_attempts'", (err, results) => {
          if (!err && results.length === 0) {
            console.log('[MIGRATE] Migrating users: Adding lockout tracking columns...');
            db.query("ALTER TABLE users ADD COLUMN failed_login_attempts INT DEFAULT 0, ADD COLUMN lockout_until DATETIME DEFAULT NULL");
          }
        });

        // MIGRATION: Add account status tracking for deactivations and bans
        db.query("SHOW COLUMNS FROM users LIKE 'account_status'", (err, results) => {
          if (!err && results.length === 0) {
            console.log('[MIGRATE] Migrating users: Adding account status and ban tracking columns...');
            const alterQuery = `
              ALTER TABLE users 
              ADD COLUMN account_status ENUM('active', 'deactivated', 'banned') DEFAULT 'active',
              ADD COLUMN status_reason TEXT NULL,
              ADD COLUMN appeal_status ENUM('none', 'pending', 'accepted', 'denied') DEFAULT 'none',
              ADD COLUMN appeal_message TEXT NULL
            `;
            db.query(alterQuery, (err2) => {
              if (!err2) {
                console.log('[MIGRATE] Migrating users: Mapping existing deleted users to deactivated...');
                db.query("UPDATE users SET account_status = 'deactivated' WHERE is_deleted = 1 AND account_status = 'active'");
              } else {
                console.error('[WARN] Failed to add account status columns:', err2.message);
              }
            });
          }
        });

        console.log('[OK] Users table ready');
      }
    });

    // Create Artists Table if not exists
    const artistsTableQuery = `
      CREATE TABLE IF NOT EXISTS artists (
        user_id INT PRIMARY KEY,
        studio_name VARCHAR(255),
        experience_years INT,
        specialization VARCHAR(255),
        hourly_rate DECIMAL(10, 2),
        commission_rate DECIMAL(5, 2) DEFAULT 0.30,
        rating DECIMAL(3, 2) DEFAULT 5.00,
        total_reviews INT DEFAULT 0,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `;
    db.query(artistsTableQuery, (err) => {
      if (err) console.error('[WARN] Error checking artists table:', err.message);
      else console.log('[OK] Artists table ready');

      // MIGRATION: Check if 'commission_rate' column exists, if not add it
      db.query("SHOW COLUMNS FROM artists LIKE 'commission_rate'", (err, results) => {
        if (!err && results.length === 0) {
          console.log('[MIGRATE] Migrating artists table: Adding commission_rate column...');
          db.query("ALTER TABLE artists ADD COLUMN commission_rate DECIMAL(5, 2) DEFAULT 0.30");
          console.log('[OK] Added commission_rate column');
        }
      });

      // MIGRATION: Check if 'phone' column exists, if not add it
      db.query("SHOW COLUMNS FROM artists LIKE 'phone'", (err, results) => {
        if (!err && results.length === 0) {
          console.log('[MIGRATE] Migrating artists table: Adding phone column...');
          db.query("ALTER TABLE artists ADD COLUMN phone VARCHAR(20)");
        }
      });

      // MIGRATION: Sanitize legacy phone numbers in artists table
      db.query(
        "UPDATE artists SET phone = CONCAT('+63', SUBSTRING(phone, 5)) WHERE phone LIKE '+630%'",
        (err, result) => {
          if (!err && result && result.affectedRows > 0) {
            console.log(`[MIGRATE] Sanitized ${result.affectedRows} phone number(s) in artists table`);
          }
        }
      );

      // MIGRATION: Check if 'studio_name' column exists
      db.query("SHOW COLUMNS FROM artists LIKE 'studio_name'", (err, results) => {
        if (!err && results.length === 0) {
          console.log('[MIGRATE] Migrating artists table: Adding studio_name column...');
          db.query("ALTER TABLE artists ADD COLUMN studio_name VARCHAR(255) NULL");
        }
      });

      // MIGRATION: Check if 'profile_image' column exists
      db.query("SHOW COLUMNS FROM artists LIKE 'profile_image'", (err, results) => {
        if (!err && results.length === 0) {
          console.log('[MIGRATE] Migrating artists table: Adding profile_image column...');
          db.query("ALTER TABLE artists ADD COLUMN profile_image LONGTEXT NULL");
        }
      });

      // MIGRATION: Check if 'bio' column exists
      db.query("SHOW COLUMNS FROM artists LIKE 'bio'", (err, results) => {
        if (!err && results.length === 0) {
          console.log('[MIGRATE] Migrating artists table: Adding bio column...');
          db.query("ALTER TABLE artists ADD COLUMN bio TEXT NULL");
          console.log('[OK] Added bio column');
        }
      });
    });

    // Create Notifications Table if not exists
    const notifTableQuery = `
      CREATE TABLE IF NOT EXISTS notifications (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        title VARCHAR(255) NOT NULL,
        message TEXT,
        type VARCHAR(50),
        related_id INT,
        is_read BOOLEAN DEFAULT FALSE,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `;
    db.query(notifTableQuery, (err) => {
      if (err) console.error('[WARN] Error checking notifications table:', err.message);
      else console.log('[OK] Notifications system ready');
    });

    // Create Customers Table if not exists (for extra profile info)
    const customerTableQuery = `
      CREATE TABLE IF NOT EXISTS customers (
        user_id INT PRIMARY KEY,
        phone VARCHAR(20),
        location VARCHAR(255),
        notes TEXT,
        profile_image LONGTEXT NULL,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `;
    db.query(customerTableQuery, (err) => {
      if (err) console.error('[WARN] Error checking customers table:', err.message);
      else console.log('[OK] Customers table ready');
      createDefaultUsers();

      // Add is_deleted column if it doesn't exist (Soft Delete support)
      db.query("SHOW COLUMNS FROM users LIKE 'is_deleted'", (err, results) => {
        if (!err && results.length === 0) {
          db.query("ALTER TABLE users ADD COLUMN is_deleted BOOLEAN DEFAULT 0");
          console.log('[OK] Added is_deleted column for soft delete support');
        }
      });

      // MIGRATION: Add photo_marketing_consent column if not exists
      db.query("SHOW COLUMNS FROM users LIKE 'photo_marketing_consent'", (err, results) => {
        if (!err && results.length === 0) {
          console.log('[MIGRATE] Migrating users table: Adding photo_marketing_consent column...');
          db.query("ALTER TABLE users ADD COLUMN photo_marketing_consent TINYINT DEFAULT 1");
        }
      });

      // MIGRATION: Add email_promo_consent column if not exists
      db.query("SHOW COLUMNS FROM users LIKE 'email_promo_consent'", (err, results) => {
        if (!err && results.length === 0) {
          console.log('[MIGRATE] Migrating users table: Adding email_promo_consent column...');
          db.query("ALTER TABLE users ADD COLUMN email_promo_consent TINYINT DEFAULT 0");
        }
      });

      // MIGRATION: Add is_superadmin column if not exists
      db.query("SHOW COLUMNS FROM users LIKE 'is_superadmin'", (err, results) => {
        if (!err && results.length === 0) {
          console.log('[MIGRATE] Migrating users table: Adding is_superadmin column...');
          db.query("ALTER TABLE users ADD COLUMN is_superadmin TINYINT(1) DEFAULT 0", (alterErr) => {
            if (!alterErr) {
              // Flag the default admin account as super admin
              db.query("UPDATE users SET is_superadmin = 1 WHERE email = 'admin@inkvistar.com'", (updateErr) => {
                if (!updateErr) console.log('[OK] Super admin flag set for admin@inkvistar.com');
              });
            }
          });
        } else if (!err && results.length > 0) {
          // Column exists — ensure the flag is always set on startup
          db.query("UPDATE users SET is_superadmin = 1 WHERE email = 'admin@inkvistar.com' AND is_superadmin = 0");
        }
      });

      // SEED: Create manager@inkvistar.com admin account if not exists (debug account)
      db.query("SELECT id FROM users WHERE email = 'manager@inkvistar.com'", (err, results) => {
        if (!err && results.length === 0) {
          const bcrypt = require('bcryptjs');
          bcrypt.hash('manager123', 10).then(hash => {
            db.query(
              "INSERT INTO users (name, email, password_hash, user_type, is_verified, is_deleted, is_superadmin) VALUES (?, ?, ?, 'manager', 1, 0, 0)",
              ['Manager Admin', 'manager@inkvistar.com', hash],
              (insertErr) => {
                if (!insertErr) console.log('[OK] Seeded admin account: manager@inkvistar.com');
                else console.error('Seed error:', insertErr.message);
              }
            );
          });
        }
      });

      // MIGRATION: Check if 'phone' column exists in customers
      db.query("SHOW COLUMNS FROM customers LIKE 'phone'", (err, results) => {
        if (!err && results.length === 0) {
          console.log('[MIGRATE] Migrating customers table: Adding phone, location, notes columns...');
          db.query("ALTER TABLE customers ADD COLUMN phone VARCHAR(20) NULL, ADD COLUMN location VARCHAR(255) NULL, ADD COLUMN notes TEXT NULL");
        }
      });

      // MIGRATION: Sanitize legacy phone numbers in customers table
      db.query(
        "UPDATE customers SET phone = CONCAT('+63', SUBSTRING(phone, 5)) WHERE phone LIKE '+630%'",
        (err, result) => {
          if (!err && result && result.affectedRows > 0) {
            console.log(`[MIGRATE] Sanitized ${result.affectedRows} phone number(s) in customers table`);
          }
        }
      );

      // MIGRATION: Check if 'profile_image' column exists in customers
      db.query("SHOW COLUMNS FROM customers LIKE 'profile_image'", (err, results) => {
        if (!err && results.length === 0) {
          console.log('[MIGRATE] Migrating customers table: Adding profile_image column...');
          db.query("ALTER TABLE customers ADD COLUMN profile_image LONGTEXT NULL");
        }
      });

      // MIGRATION: Check if 'gender' column exists in customers
      db.query("SHOW COLUMNS FROM customers LIKE 'gender'", (err, results) => {
        if (!err && results.length === 0) {
          console.log('[MIGRATE] Migrating customers table: Adding gender column...');
          db.query("ALTER TABLE customers ADD COLUMN gender VARCHAR(20) NULL");
        }
      });

      // MIGRATION: Check if 'age' column exists in customers
      db.query("SHOW COLUMNS FROM customers LIKE 'age'", (err, results) => {
        if (!err && results.length === 0) {
          console.log('[MIGRATE] Migrating customers table: Adding age column...');
          db.query("ALTER TABLE customers ADD COLUMN age INT NULL");
        }
      });

      // MIGRATION: Add health_conditions column (Feature A)
      db.query("SHOW COLUMNS FROM customers LIKE 'health_conditions'", (err, results) => {
        if (!err && results.length === 0) {
          console.log('[MIGRATE] Migrating customers table: Adding health_conditions column...');
          db.query("ALTER TABLE customers ADD COLUMN health_conditions TEXT NULL");
        }
      });

      // MIGRATION: Add allergens column (Feature A)
      db.query("SHOW COLUMNS FROM customers LIKE 'allergens'", (err, results) => {
        if (!err && results.length === 0) {
          console.log('[MIGRATE] Migrating customers table: Adding allergens column...');
          db.query("ALTER TABLE customers ADD COLUMN allergens TEXT NULL");
        }
      });
    });

    // Create Portfolio Table if not exists (Ensuring category and visibility support)
    const portfolioTableQuery = `
      CREATE TABLE IF NOT EXISTS portfolio_works (
        id INT AUTO_INCREMENT PRIMARY KEY,
        artist_id INT NOT NULL,
        image_url LONGTEXT,
        title VARCHAR(255),
        description TEXT,
        category VARCHAR(50),
        is_public BOOLEAN DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (artist_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `;
    db.query(portfolioTableQuery, (err) => {
      if (err) console.error('[WARN] Error checking portfolio table:', err.message);
      else {
        console.log('[OK] Portfolio table ready');

        // MIGRATION: Check if 'category' column exists, if not add it
        db.query("SHOW COLUMNS FROM portfolio_works LIKE 'category'", (err, results) => {
          if (!err && results.length === 0) {
            console.log('[MIGRATE] Migrating portfolio table: Adding category column...');
            db.query("ALTER TABLE portfolio_works ADD COLUMN category VARCHAR(50)");
          }
        });

        // MIGRATION: Check if 'is_public' column exists, if not add it
        db.query("SHOW COLUMNS FROM portfolio_works LIKE 'is_public'", (err, results) => {
          if (!err && results.length === 0) {
            console.log('[MIGRATE] Migrating portfolio table: Adding is_public column...');
            db.query("ALTER TABLE portfolio_works ADD COLUMN is_public BOOLEAN DEFAULT 1");
          }
        });

        // MIGRATION: Check if 'price_estimate' column exists, if not add it
        db.query("SHOW COLUMNS FROM portfolio_works LIKE 'price_estimate'", (err, results) => {
          if (!err && results.length === 0) {
            console.log('[MIGRATE] Migrating portfolio table: Adding price_estimate column...');
            db.query("ALTER TABLE portfolio_works ADD COLUMN price_estimate DECIMAL(10, 2) DEFAULT NULL");
            console.log('[OK] Added price_estimate column to portfolio_works');
          }
        });

        // FIX: Drop broken foreign key constraint if it exists
        db.query("ALTER TABLE portfolio_works DROP FOREIGN KEY fk_portfolio_artists", (err) => {
          if (!err) {
            console.log('[OK] Fixed: Dropped broken foreign key constraint fk_portfolio_artists');
            // Re-add correct constraint referencing users(id)
            db.query("ALTER TABLE portfolio_works ADD CONSTRAINT fk_portfolio_users FOREIGN KEY (artist_id) REFERENCES users(id) ON DELETE CASCADE", (err) => {
              if (!err) console.log('[OK] Added correct foreign key constraint for portfolio_works');
            });
          }
        });
      }
    });

    // Create Branches Table if not exists
    const branchesTableQuery = `
      CREATE TABLE IF NOT EXISTS branches (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        address VARCHAR(255),
        phone VARCHAR(50),
        operating_hours VARCHAR(100),
        capacity INT DEFAULT 100,
        current_occupancy INT DEFAULT 0,
        status VARCHAR(20) DEFAULT 'Closed',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `;
    db.query(branchesTableQuery, (err) => {
      if (err) console.error('[WARN] Error checking branches table:', err.message);
      else console.log('[OK] Branches table ready');

      // Add is_deleted column if it doesn't exist
      db.query("SHOW COLUMNS FROM branches LIKE 'is_deleted'", (err, results) => {
        if (!err && results.length === 0) {
          db.query("ALTER TABLE branches ADD COLUMN is_deleted BOOLEAN DEFAULT 0");
          console.log('[OK] Added is_deleted column to branches');
        }
      });
    });

    // Create Inventory Table
    const inventoryTableQuery = `
      CREATE TABLE IF NOT EXISTS inventory (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        image LONGTEXT,
        category VARCHAR(50),
        current_stock INT DEFAULT 0,
        min_stock INT DEFAULT 10,
        max_stock INT DEFAULT 100,
        unit VARCHAR(20) DEFAULT 'pcs',
        supplier VARCHAR(255),
        cost DECIMAL(10, 2) DEFAULT 0.00,
        retail_price DECIMAL(10, 2) DEFAULT 0.00,
        last_restocked DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `;
    db.query(inventoryTableQuery, (err) => {
      if (err) console.error('[WARN] Error checking inventory table:', err.message);
      else {
        console.log('[OK] Inventory table ready');

        // MIGRATION: Check for current_stock column
        db.query("SHOW COLUMNS FROM inventory LIKE 'current_stock'", (err, results) => {
          if (!err && results.length === 0) {
            console.log('[MIGRATE] Migrating inventory: Adding current_stock column...');
            db.query("ALTER TABLE inventory ADD COLUMN current_stock INT DEFAULT 0");
          }
        });

        // MIGRATION: Check for image column
        db.query("SHOW COLUMNS FROM inventory LIKE 'image'", (err, results) => {
          if (!err && results.length === 0) {
            console.log('[MIGRATE] Migrating inventory: Adding image column...');
            db.query("ALTER TABLE inventory ADD COLUMN image LONGTEXT");
          }
        });

        // MIGRATION: Check for min_stock column
        db.query("SHOW COLUMNS FROM inventory LIKE 'min_stock'", (err, results) => {
          if (!err && results.length === 0) {
            console.log('[MIGRATE] Migrating inventory: Adding min_stock column...');
            db.query("ALTER TABLE inventory ADD COLUMN min_stock INT DEFAULT 10");
          }
        });

        // MIGRATION: Check for max_stock column
        db.query("SHOW COLUMNS FROM inventory LIKE 'max_stock'", (err, results) => {
          if (!err && results.length === 0) {
            console.log('[MIGRATE] Migrating inventory: Adding max_stock column...');
            db.query("ALTER TABLE inventory ADD COLUMN max_stock INT DEFAULT 100");
          }
        });

        // MIGRATION: Check for unit column
        db.query("SHOW COLUMNS FROM inventory LIKE 'unit'", (err, results) => {
          if (!err && results.length === 0) {
            console.log('[MIGRATE] Migrating inventory: Adding unit column...');
            db.query("ALTER TABLE inventory ADD COLUMN unit VARCHAR(20) DEFAULT 'pcs'");
          }
        });

        // MIGRATION: Check for supplier column
        db.query("SHOW COLUMNS FROM inventory LIKE 'supplier'", (err, results) => {
          if (!err && results.length === 0) {
            console.log('[MIGRATE] Migrating inventory: Adding supplier column...');
            db.query("ALTER TABLE inventory ADD COLUMN supplier VARCHAR(255)");
          }
        });

        // MIGRATION: Check for cost column
        db.query("SHOW COLUMNS FROM inventory LIKE 'cost'", (err, results) => {
          if (!err && results.length === 0) {
            console.log('[MIGRATE] Migrating inventory: Adding cost column...');
            db.query("ALTER TABLE inventory ADD COLUMN cost DECIMAL(10, 2) DEFAULT 0.00");
          }
        });

        // MIGRATION: Check for last_restocked column
        db.query("SHOW COLUMNS FROM inventory LIKE 'last_restocked'", (err, results) => {
          if (!err && results.length === 0) {
            console.log('[MIGRATE] Migrating inventory: Adding last_restocked column...');
            db.query("ALTER TABLE inventory ADD COLUMN last_restocked DATETIME");
          }
        });

        // MIGRATION: Check for retail_price column
        db.query("SHOW COLUMNS FROM inventory LIKE 'retail_price'", (err, results) => {
          if (!err && results.length === 0) {
            console.log('[MIGRATE] Migrating inventory: Adding retail_price column...');
            db.query("ALTER TABLE inventory ADD COLUMN retail_price DECIMAL(10, 2) DEFAULT 0.00 AFTER cost");
          }
        });

        // Add is_deleted column if it doesn't exist
        db.query("SHOW COLUMNS FROM inventory LIKE 'is_deleted'", (err, results) => {
          if (!err && results.length === 0) {
            db.query("ALTER TABLE inventory ADD COLUMN is_deleted BOOLEAN DEFAULT 0");
            console.log('[OK] Added is_deleted column to inventory');
          }
        });
      }
    });

    // Create Inventory Transactions Table
    const invTransTableQuery = `
      CREATE TABLE IF NOT EXISTS inventory_transactions (
        id INT AUTO_INCREMENT PRIMARY KEY,
        inventory_id INT,
        type ENUM('in', 'out') NOT NULL,
        quantity INT NOT NULL,
        reason VARCHAR(255),
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (inventory_id) REFERENCES inventory(id) ON DELETE CASCADE
      )
    `;
    db.query(invTransTableQuery, (err) => {
      if (err) console.error('[WARN] Error checking inventory transactions table:', err.message);
      else {
        console.log('[OK] Inventory transactions table ready');
        // Auto-migrate: add user_id column if missing
        db.query("SHOW COLUMNS FROM inventory_transactions LIKE 'user_id'", (colErr, colResults) => {
          if (!colErr && colResults.length === 0) {
            db.query('ALTER TABLE inventory_transactions ADD COLUMN user_id INT DEFAULT NULL', (alterErr) => {
              if (!alterErr) console.log('[OK] Added user_id column to inventory_transactions');
            });
          }
        });

        // Auto-migrate: add item_price column if missing
        db.query("SHOW COLUMNS FROM inventory_transactions LIKE 'item_price'", (colErr, colResults) => {
          if (!colErr && colResults.length === 0) {
            db.query('ALTER TABLE inventory_transactions ADD COLUMN item_price DECIMAL(10, 2) DEFAULT NULL', (alterErr) => {
              if (!alterErr) console.log('[OK] Added item_price column to inventory_transactions');
            });
          }
        });
      }
    });

    // Create Slot Locks Table (used as a database-level mutex for concurrent booking requests)
    db.query(`
      CREATE TABLE IF NOT EXISTS slot_locks (
        id INT AUTO_INCREMENT PRIMARY KEY,
        appointment_date DATE NOT NULL,
        start_time TIME NOT NULL,
        slot_index INT NOT NULL DEFAULT 0,
        appointment_id INT NULL,
        locked_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY uniq_slot (appointment_date, start_time, slot_index),
        INDEX idx_slot_date (appointment_date, start_time)
      )
    `, (err) => {
      if (err) console.error('[WARN] Error creating slot_locks table:', err.message);
      else console.log('[OK] Slot locks table ready');
    });

    // Create Appointments Table
    const appointmentsTableQuery = `
      CREATE TABLE IF NOT EXISTS appointments (
        id INT AUTO_INCREMENT PRIMARY KEY,
        customer_id INT NOT NULL,
        artist_id INT NOT NULL,
        appointment_date DATE,
        start_time TIME,
        end_time TIME,
        design_title VARCHAR(255),
        price DECIMAL(10, 2) DEFAULT 0.00,
        notes TEXT,
        reference_image LONGTEXT,
        draft_image LONGTEXT,
        status VARCHAR(50) DEFAULT 'pending',
        is_deleted BOOLEAN DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (customer_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (artist_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `;
    db.query(appointmentsTableQuery, (err) => {
      if (err) console.error('[WARN] Error checking appointments table:', err.message);
      else {
        console.log('[OK] Appointments table ready');

        // MIGRATION: Add 'after_photo' column if it doesn't exist
        db.query("SHOW COLUMNS FROM appointments LIKE 'after_photo'", (err, results) => {
          if (!err && results.length === 0) {
            console.log('[MIGRATE] Migrating appointments: Adding after_photo column...');
            db.query("ALTER TABLE appointments ADD COLUMN after_photo LONGTEXT NULL");
            console.log('[OK] Added after_photo column to appointments');
          }
        });

        // MIGRATION: Add 'before_photo' column if it doesn't exist
        db.query("SHOW COLUMNS FROM appointments LIKE 'before_photo'", (err, results) => {
          if (!err && results.length === 0) {
            console.log('[MIGRATE] Migrating appointments: Adding before_photo column...');
            db.query("ALTER TABLE appointments ADD COLUMN before_photo LONGTEXT NULL");
            console.log('[OK] Added before_photo column to appointments');
          }
        });

        // MIGRATION: Add 'price' column if it doesn't exist to prevent errors.
        db.query("SHOW COLUMNS FROM appointments LIKE 'price'", (err, results) => {
          if (!err && results.length === 0) {
            console.log('[MIGRATE] Migrating appointments table: Adding price column...');
            db.query("ALTER TABLE appointments ADD COLUMN price DECIMAL(10, 2) DEFAULT 0.00");
          }
        });

        // MIGRATION: Add 'payment_status' column if it doesn't exist
        db.query("SHOW COLUMNS FROM appointments LIKE 'payment_status'", (err, results) => {
          if (!err && results.length === 0) {
            console.log('[MIGRATE] Migrating appointments table: Adding payment_status column...');
            db.query("ALTER TABLE appointments ADD COLUMN payment_status VARCHAR(20) DEFAULT 'unpaid'");
          }
        });

        // MIGRATION: Add 'manual_paid_amount' column
        db.query("SHOW COLUMNS FROM appointments LIKE 'manual_paid_amount'", (err, results) => {
          if (!err && results.length === 0) {
            console.log('[MIGRATE] Migrating appointments: Adding manual_paid_amount column...');
            db.query("ALTER TABLE appointments ADD COLUMN manual_paid_amount DECIMAL(10, 2) DEFAULT 0.00 AFTER price");
          }
        });

        // MIGRATION: Add 'manual_payment_method' column
        db.query("SHOW COLUMNS FROM appointments LIKE 'manual_payment_method'", (err, results) => {
          if (!err && results.length === 0) {
            console.log('[MIGRATE] Migrating appointments: Adding manual_payment_method column...');
            db.query("ALTER TABLE appointments ADD COLUMN manual_payment_method VARCHAR(50) NULL AFTER manual_paid_amount");
          }
        });

        // MIGRATION: Ensure status is VARCHAR(50) to avoid truncation if it was ENUM
        db.query("ALTER TABLE appointments MODIFY COLUMN status VARCHAR(50) DEFAULT 'pending'", (err) => {
          if (!err) console.log('[OK] Ensured appointments status is VARCHAR(50)');
        });

        // FIX: Recalculate payment_status for appointments stuck due to NULL manual_paid_amount bug
        // This corrects any completed sessions where payment_status should be 'paid' but is stuck as 'downpayment_paid'
        const fixStuckPaymentsQuery = `
          UPDATE appointments 
          SET payment_status = 'paid'
          WHERE price > 0 
            AND payment_status != 'paid'
            AND (
              ((SELECT COALESCE(SUM(amount), 0) FROM payments WHERE appointment_id = appointments.id AND status = 'paid') / 100) 
              + COALESCE(manual_paid_amount, 0)
            ) >= price
        `;
        db.query(fixStuckPaymentsQuery, (fixErr, fixResult) => {
          if (!fixErr && fixResult.affectedRows > 0) {
            console.log(`[FIX] Corrected payment_status for ${fixResult.affectedRows} appointment(s) that were stuck due to NULL manual_paid_amount bug.`);
          }
        });

        // MIGRATION: Add multi-session tracking columns
        db.query("SHOW COLUMNS FROM appointments LIKE 'session_number'", (err, results) => {
          if (!err && results.length === 0) {
            console.log('[MIGRATE] Adding multi-session columns to appointments...');
            db.query("ALTER TABLE appointments ADD COLUMN session_number INT DEFAULT NULL AFTER notes");
            db.query("ALTER TABLE appointments ADD COLUMN total_sessions INT DEFAULT NULL AFTER session_number");
            console.log('[OK] Added session_number and total_sessions columns');
          }
        });

        // MIGRATION: Add discount columns to appointments
        db.query("SHOW COLUMNS FROM appointments LIKE 'discount_amount'", (err, results) => {
          if (!err && results.length === 0) {
            console.log('[MIGRATE] Adding discount columns to appointments...');
            db.query("ALTER TABLE appointments ADD COLUMN discount_amount DECIMAL(10, 2) DEFAULT 0.00 AFTER price");
            db.query("ALTER TABLE appointments ADD COLUMN discount_type VARCHAR(20) DEFAULT NULL AFTER discount_amount");
            console.log('[OK] Added discount_amount and discount_type columns');
          }
        });

        // MIGRATION: Add jewelry selection columns to appointments
        db.query("SHOW COLUMNS FROM appointments LIKE 'selected_jewelry_id'", (err, results) => {
          if (!err && results.length === 0) {
            console.log('[MIGRATE] Adding jewelry selection columns to appointments...');
            db.query("ALTER TABLE appointments ADD COLUMN selected_jewelry_id INT DEFAULT NULL AFTER notes");
            db.query("ALTER TABLE appointments ADD COLUMN selected_jewelry_name VARCHAR(255) DEFAULT NULL AFTER selected_jewelry_id");
            console.log('[OK] Added selected_jewelry_id and selected_jewelry_name columns');
          }
        });

        // MIGRATION: Add piercing_jewelry JSON column for per-body-part jewelry selections
        db.query("SHOW COLUMNS FROM appointments LIKE 'piercing_jewelry'", (err, results) => {
          if (!err && results.length === 0) {
            console.log('[MIGRATE] Adding piercing_jewelry column to appointments...');
            db.query("ALTER TABLE appointments ADD COLUMN piercing_jewelry JSON DEFAULT NULL AFTER selected_jewelry_name", (alterErr) => {
              if (alterErr) console.error('[WARN] Could not add piercing_jewelry column:', alterErr.message);
              else console.log('[OK] Added piercing_jewelry column to appointments');
            });
          }
        });

        // FIX: Try to drop the specific problematic constraint if it exists
        db.query("ALTER TABLE appointments DROP FOREIGN KEY fk_appointments_artist", (err) => {
          if (!err) {
            console.log('[OK] Fixed: Dropped broken foreign key constraint fk_appointments_artist');
            // Re-add correct constraint referencing users(id)
            db.query("ALTER TABLE appointments ADD CONSTRAINT fk_appointments_artist_fixed FOREIGN KEY (artist_id) REFERENCES users(id) ON DELETE CASCADE", (err) => {
              if (!err) console.log('[OK] Added correct foreign key constraint for artist_id');
            });
          }
        });

        // MIGRATION: Add 'service_type' column if it doesn't exist
        db.query("SHOW COLUMNS FROM appointments LIKE 'service_type'", (err, results) => {
          if (!err && results.length === 0) {
            console.log('[MIGRATE] Migrating appointments: Adding service_type column...');
            db.query("ALTER TABLE appointments ADD COLUMN service_type VARCHAR(50) NULL AFTER end_time");
            console.log('[OK] Added service_type column to appointments');
          }
        });

        // MIGRATION: Add 'draft_image' column if it doesn't exist
        db.query("SHOW COLUMNS FROM appointments LIKE 'draft_image'", (err, results) => {
          if (!err && results.length === 0) {
            console.log('[MIGRATE] Migrating appointments: Adding draft_image column...');
            db.query("ALTER TABLE appointments ADD COLUMN draft_image LONGTEXT NULL AFTER reference_image");
            console.log('[OK] Added draft_image column to appointments');
          }
        });

        // MIGRATION: Add 'reschedule_count' column if it doesn't exist
        db.query("SHOW COLUMNS FROM appointments LIKE 'reschedule_count'", (err, results) => {
          if (!err && results.length === 0) {
            console.log('[MIGRATE] Migrating appointments: Adding reschedule_count column...');
            db.query("ALTER TABLE appointments ADD COLUMN reschedule_count INT DEFAULT 0");
            console.log('[OK] Added reschedule_count column to appointments');
          }
        });

        // MIGRATION: Add 'secondary_artist_id' column if it doesn't exist
        db.query("SHOW COLUMNS FROM appointments LIKE 'secondary_artist_id'", (err, results) => {
          if (!err && results.length === 0) {
            console.log('[MIGRATE] Migrating appointments: Adding secondary_artist_id column...');
            db.query("ALTER TABLE appointments ADD COLUMN secondary_artist_id INT NULL AFTER artist_id");
            console.log('[OK] Added secondary_artist_id column to appointments');
          }
        });

        // MIGRATION: Add 'commission_split' column if it doesn't exist
        db.query("SHOW COLUMNS FROM appointments LIKE 'commission_split'", (err, results) => {
          if (!err && results.length === 0) {
            console.log('[MIGRATE] Migrating appointments: Adding commission_split column...');
            db.query("ALTER TABLE appointments ADD COLUMN commission_split INT DEFAULT 50");
            console.log('[OK] Added commission_split column to appointments');
          }
        });

        // MIGRATION: Add 'before_photo' column if it doesn't exist
        db.query("SHOW COLUMNS FROM appointments LIKE 'before_photo'", (err, results) => {
          if (!err && results.length === 0) {
            console.log('[MIGRATE] Migrating appointments: Adding before_photo column...');
            db.query("ALTER TABLE appointments ADD COLUMN before_photo LONGTEXT NULL");
            console.log('[OK] Added before_photo column to appointments');
          }
        });

        // MIGRATION: Add 'booking_code' column if it doesn't exist
        db.query("SHOW COLUMNS FROM appointments LIKE 'booking_code'", (err, results) => {
          if (!err && results.length === 0) {
            console.log('[MIGRATE] Migrating appointments: Adding booking_code column...');
            db.query("ALTER TABLE appointments ADD COLUMN booking_code VARCHAR(50) UNIQUE NULL AFTER id");
            console.log('[OK] Added booking_code column to appointments');
          }
        });

        // MIGRATION: Add 'session_duration' column if it doesn't exist
        db.query("SHOW COLUMNS FROM appointments LIKE 'session_duration'", (err, results) => {
          if (!err && results.length === 0) {
            console.log('[MIGRATE] Migrating appointments: Adding session_duration column...');
            db.query("ALTER TABLE appointments ADD COLUMN session_duration INT NULL DEFAULT NULL");
            console.log('[OK] Added session_duration column to appointments');
          }
        });

        // MIGRATION: Add 'audit_log' column if it doesn't exist
        db.query("SHOW COLUMNS FROM appointments LIKE 'audit_log'", (err, results) => {
          if (!err && results.length === 0) {
            console.log('[MIGRATE] Migrating appointments: Adding audit_log column...');
            db.query("ALTER TABLE appointments ADD COLUMN audit_log LONGTEXT NULL DEFAULT NULL");
            console.log('[OK] Added audit_log column to appointments');
          }
        });

        // MIGRATION: Add 'device_id' column for per-device booking spam prevention
        db.query("SHOW COLUMNS FROM appointments LIKE 'device_id'", (err, results) => {
          if (!err && results.length === 0) {
            console.log('[MIGRATE] Migrating appointments: Adding device_id column...');
            db.query("ALTER TABLE appointments ADD COLUMN device_id VARCHAR(255) NULL");
            console.log('[OK] Added device_id column to appointments');
          }
        });

        // MIGRATION: Add 'consultation_method' column for Face-to-Face vs Online consultations
        db.query("SHOW COLUMNS FROM appointments LIKE 'consultation_method'", (err, results) => {
          if (!err && results.length === 0) {
            console.log('[MIGRATE] Migrating appointments: Adding consultation_method column...');
            db.query("ALTER TABLE appointments ADD COLUMN consultation_method VARCHAR(50) NULL");
            console.log('[OK] Added consultation_method column to appointments');
          }
        });

        // MIGRATION: Add 'guest_email' column for guest booking contact info
        db.query("SHOW COLUMNS FROM appointments LIKE 'guest_email'", (err, results) => {
          if (!err && results.length === 0) {
            console.log('[MIGRATE] Migrating appointments: Adding guest_email column...');
            db.query("ALTER TABLE appointments ADD COLUMN guest_email VARCHAR(255) NULL");
            console.log('[OK] Added guest_email column to appointments');
          }
        });

        // MIGRATION: Add 'guest_phone' column for guest booking contact info
        db.query("SHOW COLUMNS FROM appointments LIKE 'guest_phone'", (err, results) => {
          if (!err && results.length === 0) {
            console.log('[MIGRATE] Migrating appointments: Adding guest_phone column...');
            db.query("ALTER TABLE appointments ADD COLUMN guest_phone VARCHAR(50) NULL");
            console.log('[OK] Added guest_phone column to appointments');
          }
        });
        // MIGRATION: Add 'is_referral' column for referral commission tracking
        db.query("SHOW COLUMNS FROM appointments LIKE 'is_referral'", (err, results) => {
          if (!err && results.length === 0) {
            console.log('[MIGRATE] Migrating appointments: Adding is_referral column...');
            db.query("ALTER TABLE appointments ADD COLUMN is_referral BOOLEAN DEFAULT 0");
            console.log('[OK] Added is_referral column to appointments');
          }
        });

        // MIGRATION: Add 'consultation_notes' column for structured consultation summary data
        db.query("SHOW COLUMNS FROM appointments LIKE 'consultation_notes'", (err, results) => {
          if (!err && results.length === 0) {
            console.log('[MIGRATE] Migrating appointments: Adding consultation_notes column...');
            db.query("ALTER TABLE appointments ADD COLUMN consultation_notes TEXT NULL");
            console.log('[OK] Added consultation_notes column to appointments');
          }
        });

        // MIGRATION: Add 'quoted_price' column for consultation price quotes
        db.query("SHOW COLUMNS FROM appointments LIKE 'quoted_price'", (err, results) => {
          if (!err && results.length === 0) {
            console.log('[MIGRATE] Migrating appointments: Adding quoted_price column...');
            db.query("ALTER TABLE appointments ADD COLUMN quoted_price DECIMAL(10, 2) NULL DEFAULT NULL");
            console.log('[OK] Added quoted_price column to appointments');
          }
        });

        // MIGRATION: Add 'tattoo_price' column for dual-service split quotes
        db.query("SHOW COLUMNS FROM appointments LIKE 'tattoo_price'", (err, results) => {
          if (!err && results.length === 0) {
            console.log('[MIGRATE] Migrating appointments: Adding tattoo_price column...');
            db.query("ALTER TABLE appointments ADD COLUMN tattoo_price DECIMAL(10, 2) NULL DEFAULT NULL");
            console.log('[OK] Added tattoo_price column to appointments');
          }
        });

        // MIGRATION: Add 'piercing_price' column for dual-service split quotes
        db.query("SHOW COLUMNS FROM appointments LIKE 'piercing_price'", (err, results) => {
          if (!err && results.length === 0) {
            console.log('[MIGRATE] Migrating appointments: Adding piercing_price column...');
            db.query("ALTER TABLE appointments ADD COLUMN piercing_price DECIMAL(10, 2) NULL DEFAULT NULL");
            console.log('[OK] Added piercing_price column to appointments');
          }
        });

        // MIGRATION: Add project_id column to appointments (Feature B — Multi-session timeline)
        db.query("SHOW COLUMNS FROM appointments LIKE 'project_id'", (err, results) => {
          if (!err && results.length === 0) {
            console.log('[MIGRATE] Migrating appointments: Adding project_id column...');
            db.query("ALTER TABLE appointments ADD COLUMN project_id INT NULL DEFAULT NULL", (alterErr) => {
              if (alterErr) console.error('[WARN] Could not add project_id column:', alterErr.message);
              else console.log('[OK] Added project_id column to appointments');
            });
          }
        });

        // MIGRATION: Add 'is_guest_placeholder' flag to segregate guest bookings from admin data (B1 fix)
        db.query("SHOW COLUMNS FROM appointments LIKE 'is_guest_placeholder'", (err, results) => {
          if (!err && results.length === 0) {
            console.log('[MIGRATE] Adding is_guest_placeholder column to appointments...');
            db.query("ALTER TABLE appointments ADD COLUMN is_guest_placeholder TINYINT(1) DEFAULT 0", (alterErr) => {
              if (alterErr) {
                console.error('[WARN] Could not add is_guest_placeholder column:', alterErr.message);
              } else {
                console.log('[OK] Added is_guest_placeholder column to appointments');
                // Retroactive fix: flag all existing guest bookings that were polluting admin data
                db.query(
                  `UPDATE appointments SET is_guest_placeholder = 1 WHERE guest_email IS NOT NULL AND guest_email != '' AND is_deleted = 0`,
                  (fixErr, fixResult) => {
                    if (!fixErr && fixResult.affectedRows > 0) {
                      console.log(`[FIX] Retroactively flagged ${fixResult.affectedRows} existing guest booking(s) as is_guest_placeholder`);
                    }
                  }
                );
              }
            });
          }
        });
      }
    });

    // MIGRATION: Add waiver_accepted_at column to appointments (stores when the service waiver was signed)
    db.query("SHOW COLUMNS FROM appointments LIKE 'waiver_accepted_at'", (err, results) => {
      if (!err && results.length === 0) {
        console.log('[MIGRATE] Adding waiver_accepted_at column to appointments...');
        db.query("ALTER TABLE appointments ADD COLUMN waiver_accepted_at DATETIME NULL", (alterErr) => {
          if (alterErr) {
            console.error('[WARN] Could not add waiver_accepted_at column:', alterErr.message);
          } else {
            console.log('[OK] Added waiver_accepted_at column to appointments');
          }
        });
      }
    });

    // Create Tattoo Projects Table (Feature B — Multi-session timeline grouping)
    db.query(`
      CREATE TABLE IF NOT EXISTS tattoo_projects (
        id INT AUTO_INCREMENT PRIMARY KEY,
        customer_id INT NOT NULL,
        artist_id INT NOT NULL,
        design_title VARCHAR(255),
        total_sessions_planned INT NOT NULL DEFAULT 1,
        total_sessions_actual INT NULL,
        status ENUM('active','completed','completed_early') DEFAULT 'active',
        notes TEXT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (customer_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (artist_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `, (err) => {
      if (err) console.error('[WARN] Error checking tattoo_projects table:', err.message);
      else console.log('[OK] Tattoo Projects table ready');
    });

    // MIGRATION: Add session_number column to appointments
    db.query("SHOW COLUMNS FROM appointments LIKE 'session_number'", (err, results) => {
      if (!err && results.length === 0) {
        console.log('[MIGRATE] Adding session_number column to appointments...');
        db.query("ALTER TABLE appointments ADD COLUMN session_number INT DEFAULT 1", (alterErr) => {
          if (alterErr) console.error('[WARN] Could not add session_number:', alterErr.message);
          else console.log('[OK] Added session_number column to appointments');
        });
      }
    });

    // MIGRATION: Add total_sessions column to appointments
    db.query("SHOW COLUMNS FROM appointments LIKE 'total_sessions'", (err, results) => {
      if (!err && results.length === 0) {
        console.log('[MIGRATE] Adding total_sessions column to appointments...');
        db.query("ALTER TABLE appointments ADD COLUMN total_sessions INT DEFAULT 1", (alterErr) => {
          if (alterErr) console.error('[WARN] Could not add total_sessions:', alterErr.message);
          else console.log('[OK] Added total_sessions column to appointments');
        });
      }
    });

    // Create Reschedule Requests Table (for admin-approval reschedule flow)
    const rescheduleRequestsTableQuery = `
      CREATE TABLE IF NOT EXISTS reschedule_requests (
        id INT AUTO_INCREMENT PRIMARY KEY,
        appointment_id INT NOT NULL,
        customer_id INT NOT NULL,
        requested_date DATE NOT NULL,
        requested_time TIME NULL,
        reason TEXT NOT NULL,
        status VARCHAR(20) DEFAULT 'pending',
        admin_notes TEXT NULL,
        decided_by INT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        decided_at DATETIME NULL,
        expires_at DATETIME NOT NULL,
        FOREIGN KEY (appointment_id) REFERENCES appointments(id) ON DELETE CASCADE,
        FOREIGN KEY (customer_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `;
    db.query(rescheduleRequestsTableQuery, (err) => {
      if (err) console.error('[WARN] Error checking reschedule_requests table:', err.message);
      else console.log('[OK] Reschedule requests table ready');
    });

    // Create Payments Table (records PayMongo webhook events)
    const paymentsTableQuery = `
      CREATE TABLE IF NOT EXISTS payments (
        id INT AUTO_INCREMENT PRIMARY KEY,
        appointment_id INT NOT NULL,
        session_id VARCHAR(100),
        paymongo_payment_id VARCHAR(100),
        amount INT,
        currency VARCHAR(10) DEFAULT 'PHP',
        status VARCHAR(50) DEFAULT 'pending',
        raw_event JSON,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY uniq_payment (paymongo_payment_id),
        INDEX idx_session (session_id),
        FOREIGN KEY (appointment_id) REFERENCES appointments(id) ON DELETE CASCADE
      )
    `;
    db.query(paymentsTableQuery, (err) => {
      if (err) console.error('[WARN] Error checking payments table:', err.message);
      else console.log('[OK] Payments table ready');
    });

    // Create Invoices Table
    const invoicesTableQuery = `
      CREATE TABLE IF NOT EXISTS invoices (
        id INT AUTO_INCREMENT PRIMARY KEY,
        client_name VARCHAR(255),
        service_type VARCHAR(255),
        amount DECIMAL(10, 2),
        discount_amount DECIMAL(10, 2) DEFAULT 0.00,
        discount_type VARCHAR(255) DEFAULT NULL,
        status VARCHAR(50) DEFAULT 'Pending',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `;
    db.query(invoicesTableQuery, (err) => { if (err) console.error('[WARN] Error checking invoices table:', err.message); });

    // MIGRATION: Add customer_id to invoices table
    db.query("SHOW COLUMNS FROM invoices LIKE 'customer_id'", (err, results) => {
      if (!err && results.length === 0) {
        console.log('[MIGRATE] Migrating invoices: Adding customer_id column...');
        db.query("ALTER TABLE invoices ADD COLUMN customer_id INT NULL AFTER id");
      }
    });

    // MIGRATION: Add discount columns to invoices table
    db.query("SHOW COLUMNS FROM invoices LIKE 'discount_amount'", (err, results) => {
      if (!err && results.length === 0) {
        console.log('[MIGRATE] Migrating invoices: Adding discount columns...');
        db.query("ALTER TABLE invoices ADD COLUMN discount_amount DECIMAL(10, 2) DEFAULT 0.00 AFTER amount");
        db.query("ALTER TABLE invoices ADD COLUMN discount_type VARCHAR(255) DEFAULT NULL AFTER discount_amount");
      }
    });

    // MIGRATION: Add items JSON column to invoices table
    db.query("SHOW COLUMNS FROM invoices LIKE 'items'", (err, results) => {
      if (!err && results.length === 0) {
        console.log('[MIGRATE] Migrating invoices: Adding items JSON column...');
        db.query("ALTER TABLE invoices ADD COLUMN items JSON DEFAULT NULL AFTER status");
      }
    });

    // MIGRATION: Add invoice_number to invoices table
    db.query("SHOW COLUMNS FROM invoices LIKE 'invoice_number'", (err, results) => {
      if (!err && results.length === 0) {
        console.log('[MIGRATE] Migrating invoices: Adding invoice_number column...');
        db.query("ALTER TABLE invoices ADD COLUMN invoice_number VARCHAR(20) DEFAULT NULL AFTER id");
      }
    });

    // MIGRATION: Add appointment_id to invoices table
    db.query("SHOW COLUMNS FROM invoices LIKE 'appointment_id'", (err, results) => {
      if (!err && results.length === 0) {
        console.log('[MIGRATE] Migrating invoices: Adding appointment_id column...');
        db.query("ALTER TABLE invoices ADD COLUMN appointment_id INT NULL AFTER customer_id");
      }
    });

    // MIGRATION: Add payment_method to invoices table
    db.query("SHOW COLUMNS FROM invoices LIKE 'payment_method'", (err, results) => {
      if (!err && results.length === 0) {
        console.log('[MIGRATE] Migrating invoices: Adding payment_method column...');
        db.query("ALTER TABLE invoices ADD COLUMN payment_method VARCHAR(100) DEFAULT NULL AFTER amount");
      }
    });

    // MIGRATION: Add change_given to invoices table
    db.query("SHOW COLUMNS FROM invoices LIKE 'change_given'", (err, results) => {
      if (!err && results.length === 0) {
        console.log('[MIGRATE] Migrating invoices: Adding change_given column...');
        db.query("ALTER TABLE invoices ADD COLUMN change_given DECIMAL(10, 2) DEFAULT 0.00 AFTER payment_method");
      }
    });

    // Create Payouts Table (Artist Payments)
    const payoutsTableQuery = `
      CREATE TABLE IF NOT EXISTS payouts (
        id INT AUTO_INCREMENT PRIMARY KEY,
        artist_id INT NOT NULL,
        amount DECIMAL(10, 2) NOT NULL,
        payout_method VARCHAR(50) DEFAULT 'Bank Transfer',
        reference_no VARCHAR(100),
        status VARCHAR(20) DEFAULT 'Paid',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (artist_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `;
    db.query(payoutsTableQuery, (err) => { if (err) console.error('[WARN] Error checking payouts table:', err.message); else console.log('[OK] Payouts table ready'); });

    // Create Aftercare Templates Table (Admin-configurable daily notifications)
    const aftercareTableQuery = `
      CREATE TABLE IF NOT EXISTS aftercare_templates (
        id INT AUTO_INCREMENT PRIMARY KEY,
        day_number INT NOT NULL,
        title VARCHAR(100) NOT NULL,
        message TEXT NOT NULL,
        phase VARCHAR(30) NOT NULL,
        tips TEXT DEFAULT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY unique_day (day_number)
      )
    `;
    db.query(aftercareTableQuery, (err) => {
      if (err) { console.error('[WARN] Error creating aftercare_templates table:', err.message); return; }
      console.log('[OK] Aftercare templates table ready');

      // Seed default templates if table is empty
      db.query('SELECT COUNT(*) as cnt FROM aftercare_templates', (countErr, countRes) => {
        if (countErr || (countRes[0]?.cnt || 0) > 0) return;
        console.log('[INFO] Seeding default aftercare templates (30 days)...');

        const defaults = [
          // Phase 1: Initial Healing (Days 1-3)
          [1, 'initial', 'Unwrap & First Wash', 'Remove the bandage/wrap after 2-4 hours. Gently wash with lukewarm water and fragrance-free antibacterial soap. Pat dry with a clean paper towel — never use a cloth towel.', 'Use Dove Sensitive or Cetaphil soap. Wash your hands thoroughly before touching the tattoo. Apply a very thin layer of your artist-recommended ointment (e.g., Aquaphor).'],
          [2, 'initial', 'Keep It Clean & Moisturized', 'Wash your tattoo 2-3 times today with lukewarm water and mild soap. Apply a very thin layer of ointment after each wash. The area may still be red, swollen, and tender — this is normal.', 'The skin should NOT look shiny or greasy after applying ointment. Less is more. Wear loose, breathable clothing over the tattoo. Avoid tight fabrics that can rub.'],
          [3, 'initial', 'Day 3: Swelling Should Subside', 'Continue your wash-and-moisturize routine 2-3 times daily. Redness and swelling should begin decreasing. Some plasma or excess ink may still weep slightly — this is normal.', 'Sleep on clean sheets and avoid laying directly on the tattoo. If the area feels warm but not painful, that is part of the healing response.'],
          // Phase 2: Peeling & Itching (Days 4-14)
          [4, 'peeling', "Peeling Begins — Don't Pick! IMPORTANT:", 'Your tattoo may start to peel and flake like a sunburn. This is completely normal and a sign of healthy healing. DO NOT pick, scratch, or peel the flaking skin!', 'Switch from heavy ointment to a fragrance-free, alcohol-free moisturizing lotion. Picking at flakes can pull out ink and cause scarring. If it itches, gently pat or apply lotion.'],
          [5, 'peeling', 'Moisturize & Resist the Itch', 'The peeling continues and itching may increase today. Apply fragrance-free lotion whenever the skin feels dry or tight. Continue gentle washing 1-2 times daily.', 'Avoid scratching at all costs. Cool compresses can help with itching. Stay hydrated — it helps skin heal from the inside.'],
          [6, 'peeling', 'Stay the Course', 'Keep up your routine: gentle wash, pat dry, apply lotion. The tattoo may look dull or cloudy under the peeling skin — this is temporary and normal.', 'Avoid swimming, baths, hot tubs, and saunas. Brief lukewarm showers are fine. Do not soak the tattoo.'],
          [7, 'peeling', 'One Week Milestone!', 'You have made it through the first week! The heaviest peeling should be happening now. Continue moisturizing and absolutely no picking or scratching.', 'The \"milky\" or cloudy appearance under peeling skin is the new layer of skin forming. Your tattoo will look vibrant again once this settles.'],
          [8, 'peeling', 'Flaking is Normal', 'Expect continued flaking today. Some areas may peel faster than others depending on ink density and skin location. Keep moisturizing consistently.', 'Lightly tap itchy areas instead of scratching. Wearing soft cotton clothing over the tattoo reduces friction irritation.'],
          [9, 'peeling', 'Healing Progress Check', 'By now, the initial redness should be mostly gone. The peeling may be slowing down in some areas. Continue your lotion routine 2-3 times daily.', 'If you notice any signs of infection (excessive redness, pus, fever), contact your artist or a doctor immediately. These cases are rare with proper care.'],
          [10, 'peeling', 'Day 10 — Almost Through Peeling', 'Most heavy peeling is ending. Continue applying lotion to keep the skin supple. Avoid direct sunlight on the healing tattoo.', 'Your tattoo is still healing beneath the surface even if it looks settled on top. Continue all precautions.'],
          [11, 'peeling', 'Consistent Care Matters', 'Keep moisturizing and protecting from sun. Avoid heavy workouts that cause excessive sweating on the tattooed area.', 'If exercising, clean the tattooed area promptly after sweating. Pat dry and reapply lotion.'],
          [12, 'peeling', 'Light at the End of the Tunnel', 'The surface peeling is wrapping up. Your tattoo should start looking clearer as the new skin settles. Continue lotion application.', 'Stay out of pools, oceans, and hot tubs for at least another 2 weeks. Chlorine and bacteria can damage healing skin.'],
          [13, 'peeling', 'Almost Done Peeling', 'Only minor flaking may remain. The tattoo might still look slightly muted — this is normal and will brighten up over the next couple of weeks.', 'Continue wearing SPF 30+ if any sun exposure is unavoidable. UV rays are enemy #1 for tattoo vibrancy.'],
          [14, 'peeling', 'Two Weeks Complete!', 'Congratulations! The peeling phase is essentially over. Your surface skin has regenerated. Continue daily moisturizing to support the deeper healing still happening.', 'The deeper layers of skin take 4-6 weeks to fully heal. Surface healing does not mean fully healed. Keep up the aftercare routine.'],
          // Phase 3: Final Surface Healing (Days 15-30)
          [15, 'healing', 'Final Healing Phase Begins', 'Your tattoo surface should feel smooth to the touch now. Continue applying fragrance-free lotion 1-2 times daily. The deeper skin layers are still recovering.', 'You can resume most normal activities, but still avoid prolonged submersion in water and excessive sun exposure.'],
          [16, 'healing', 'Protect Your Investment', 'Apply SPF 30+ sunscreen to your tattoo whenever going outside. Sun damage is the #1 cause of tattoo fading over time.', 'Make sunscreen on your tattoo a lifelong habit. UV protection keeps colors vibrant for years.'],
          [17, 'healing', 'Stay Moisturized', 'Continue daily lotion application. Well-moisturized skin showcases tattoo ink better and keeps lines sharp.', 'Drinking plenty of water also contributes to healthy, well-hydrated skin from the inside.'],
          [18, 'healing', 'Healing Nicely!', 'Your tattoo should be looking increasingly close to its final appearance. Colors may still be slightly muted but will brighten.', 'If any area still feels raised or textured, continue gentle moisturizing. This is normal for areas with heavier ink saturation.'],
          [19, 'healing', 'Routine Maintenance', 'Continue your lotion and sun protection routine. The tattoo is doing great — just a bit more patience for full deep-skin healing.', 'Avoid abrasive exfoliants or scrubs directly on the tattoo for another few weeks.'],
          [20, 'healing', 'Day 20 — Two-Thirds Healed!', 'You are well past the critical healing period. Keep protecting your tattoo from sun and keeping it moisturized. Almost there!', 'You can now safely swim in pools for short periods if the surface is fully closed. Rinse and moisturize after.'],
          [21, 'healing', 'Three Weeks!', 'Your tattoo is in the home stretch of healing. Continue gentle daily care. The deep skin layers are firming up.', 'If you had areas of heavy shading or color packing, these may take slightly longer to fully settle.'],
          [22, 'healing', 'Looking Great!', 'Your tattoo should be looking more and more vibrant each day. Continue moisturizing and SPF protection.', 'Take a photo of your healed tattoo to share with your artist! They love seeing healed results.'],
          [23, 'healing', 'Steady Progress', 'Continue your simple daily routine: moisturize in the morning and evening, apply sunscreen before going outside.', 'Great aftercare now means a tattoo that stays vibrant for decades.'],
          [24, 'healing', 'Almost Fully Healed!', 'The deep skin layers are nearly done regenerating. Your tattoo should feel completely like normal skin to the touch now.', 'Remember: UV protection is a forever habit for tattooed skin!'],
          [25, 'healing', 'Day 25 — Final Stretch', 'Just a few more days of dedicated aftercare. Continue moisturizing and sun protection as part of your daily routine.', 'Consider scheduling a touch-up consultation if you notice any areas where ink did not take evenly. This is completely normal.'],
          [26, 'healing', 'Healing Champion!', 'Your discipline with aftercare is paying off. The tattoo is looking sharp and the skin is healthy.', 'Set a reminder to schedule a follow-up with your artist in 4-6 weeks for a touch-up check.'],
          [27, 'healing', 'Three Days to Go', 'Continue your routine. Your tattoo is essentially healed at the surface and nearly healed at the deeper level.', 'Interested in your next piece? Start browsing the InkVistAR gallery for inspiration!'],
          [28, 'healing', 'Penultimate Day', 'Your tattoo aftercare journey is nearly complete. The dedication you have shown will keep your tattoo looking amazing for years to come.', 'Remember to always use sunscreen on your tattoo when outdoors. This is the single best long-term care habit.'],
          [29, 'healing', 'Tomorrow is the Last Day!', 'One more day! Your tattoo is fully healed. Keep moisturizing as part of your regular skincare routine going forward.', 'Book your next session at InkVistAR to continue your tattoo journey!'],
          [30, 'healing', 'Aftercare Complete!', 'Congratulations! Your 30-day aftercare program is complete. Your tattoo is fully healed. Continue lifelong habits: moisturize daily and always apply sunscreen when going outdoors.', 'Thank you for trusting InkVistAR with your tattoo journey! We would love to see you again for your next piece. Leave a review to help other clients!']
        ];

        const insertQuery = 'INSERT INTO aftercare_templates (day_number, phase, title, message, tips) VALUES ?';
        db.query(insertQuery, [defaults.map(d => [d[0], d[1], d[2], d[3], d[4]])], (seedErr) => {
          if (seedErr) console.error('[ERROR] Error seeding aftercare templates:', seedErr.message);
          else console.log('[OK] Seeded 30 default aftercare templates');
        });
      });
    });

    // Check appointments table for is_deleted
    db.query("SHOW COLUMNS FROM appointments LIKE 'is_deleted'", (err, results) => {
      if (!err && results.length === 0) {
        db.query("ALTER TABLE appointments ADD COLUMN is_deleted BOOLEAN DEFAULT 0");
        console.log('[OK] Added is_deleted column to appointments');
      }
    });

    // Check appointments table for before_photo
    db.query("SHOW COLUMNS FROM appointments LIKE 'before_photo'", (err, results) => {
      if (!err && results.length === 0) {
        db.query("ALTER TABLE appointments ADD COLUMN before_photo LONGTEXT, ADD COLUMN after_photo LONGTEXT");
        console.log('[OK] Added before_photo and after_photo columns to appointments');
      }
    });

    // Check portfolio_works table for is_deleted
    db.query("SHOW COLUMNS FROM portfolio_works LIKE 'is_deleted'", (err, results) => {
      if (!err && results.length === 0) {
        db.query("ALTER TABLE portfolio_works ADD COLUMN is_deleted BOOLEAN DEFAULT 0");
        console.log('[OK] Added is_deleted column to portfolio_works');
      }
    });

    // Create App Settings Table (Key-Value store for configs)
    const settingsTableQuery = `
      CREATE TABLE IF NOT EXISTS app_settings (
        section VARCHAR(50) PRIMARY KEY,
        data JSON
      )
    `;
    db.query(settingsTableQuery, (err) => { if (err) console.error('[WARN] Error checking settings table:', err.message); });

    // Create Audit Logs Table
    const auditLogsTableQuery = `
      CREATE TABLE IF NOT EXISTS audit_logs (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT,
        action VARCHAR(255),
        details TEXT,
        ip_address VARCHAR(45),
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `;
    db.query(auditLogsTableQuery, (err) => { if (err) console.error('[WARN] Error checking audit_logs table:', err.message); else console.log('[OK] Audit Logs table ready'); });

    // Create Studio Expenses Table (for manual expense logging: marketing, bills, equipment, etc.)
    const studioExpensesTableQuery = `
      CREATE TABLE IF NOT EXISTS studio_expenses (
        id INT AUTO_INCREMENT PRIMARY KEY,
        category ENUM('Inventory','Marketing','Bills','Payouts','Equipment','Licensing','Maintenance','Extras') NOT NULL,
        description VARCHAR(255),
        amount DECIMAL(10,2) NOT NULL DEFAULT 0,
        reference_id INT DEFAULT NULL,
        created_by INT DEFAULT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `;
    db.query(studioExpensesTableQuery, (err) => { if (err) console.error('[WARN] Error checking studio_expenses table:', err.message); else console.log('[OK] Studio Expenses table ready'); });

    // Create Service Kits Table
    const serviceKitsTableQuery = `
      CREATE TABLE IF NOT EXISTS service_kits (
        id INT AUTO_INCREMENT PRIMARY KEY,
        service_type VARCHAR(255) NOT NULL,
        inventory_id INT NOT NULL,
        default_quantity INT NOT NULL DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (inventory_id) REFERENCES inventory(id) ON DELETE CASCADE
      )
    `;
    db.query(serviceKitsTableQuery, (err) => { if (err) console.error('[WARN] Error checking service_kits table:', err.message); else console.log('[OK] Service Kits table ready'); });

    // Create Reviews Table
    const reviewsTableQuery = `
      CREATE TABLE IF NOT EXISTS reviews (
        id INT AUTO_INCREMENT PRIMARY KEY,
        customer_id INT NOT NULL,
        artist_id INT NOT NULL,
        appointment_id INT NOT NULL,
        rating INT NOT NULL CHECK (rating >= 1 AND rating <= 5),
        comment TEXT,
        status ENUM('pending', 'approved', 'rejected') DEFAULT 'pending',
        is_showcased BOOLEAN DEFAULT FALSE,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (customer_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (artist_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (appointment_id) REFERENCES appointments(id) ON DELETE CASCADE
      )
    `;
    db.query(reviewsTableQuery, (err) => { if (err) console.error('[WARN] Error checking reviews table:', err.message); else console.log('[OK] Reviews table ready'); });

    // Create Session Materials Table
    const sessionMaterialsTableQuery = `
      CREATE TABLE IF NOT EXISTS session_materials (
        id INT AUTO_INCREMENT PRIMARY KEY,
        appointment_id INT NOT NULL,
        inventory_id INT NOT NULL,
        quantity INT NOT NULL DEFAULT 1,
        status ENUM('hold', 'consumed', 'released') DEFAULT 'hold',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (appointment_id) REFERENCES appointments(id) ON DELETE CASCADE,
        FOREIGN KEY (inventory_id) REFERENCES inventory(id) ON DELETE CASCADE
      )
    `;
    db.query(sessionMaterialsTableQuery, (err) => { if (err) console.error('[WARN] Error checking session_materials table:', err.message); else console.log('[OK] Session Materials table ready'); });

    // Create Favorites table
    const favoritesTableQuery = `
      CREATE TABLE IF NOT EXISTS favorites (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        work_id INT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY unique_favorite (user_id, work_id),
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (work_id) REFERENCES portfolio_works(id) ON DELETE CASCADE
      )
    `;
    db.query(favoritesTableQuery, (err) => { if (err) console.error('[WARN] Error checking favorites table:', err.message); else console.log('[OK] Favorites table ready'); });

    // Create Testimonials table
    const testimonialsTableQuery = `
      CREATE TABLE IF NOT EXISTS testimonials (
        id INT AUTO_INCREMENT PRIMARY KEY,
        customer_name VARCHAR(255) NOT NULL,
        content TEXT,
        rating INT DEFAULT 5,
        media_url LONGTEXT,
        media_type ENUM('none', 'image', 'video') DEFAULT 'none',
        is_active BOOLEAN DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `;
    db.query(testimonialsTableQuery, (err) => { if (err) console.error('[WARN] Error checking testimonials table:', err.message); else console.log('[OK] Testimonials table ready'); });

    // Create Services Table
    const servicesTableQuery = `
      CREATE TABLE IF NOT EXISTS services (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        description TEXT,
        duration_minutes INT DEFAULT 60,
        base_price DECIMAL(10, 2) DEFAULT 0.00,
        category VARCHAR(100),
        is_active BOOLEAN DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `;
    db.query(servicesTableQuery, (err) => { if (err) console.error('[WARN] Error checking services table:', err.message); else console.log('[OK] Services table ready'); });

    // Create Support Messages Table
    const supportMessagesTableQuery = `
      CREATE TABLE IF NOT EXISTS support_messages (
        id INT AUTO_INCREMENT PRIMARY KEY,
        room_id VARCHAR(255) NOT NULL,
        sender VARCHAR(255) NOT NULL,
        message TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `;
    db.query(supportMessagesTableQuery, (err) => { if (err) console.error('[WARN] Error checking support_messages table:', err.message); else console.log('[OK] Support Messages table ready'); });

    // Push notification tokens table
    const pushTokensTableQuery = `
      CREATE TABLE IF NOT EXISTS user_push_tokens (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        token VARCHAR(512) NOT NULL,
        platform VARCHAR(20) DEFAULT 'android',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY unique_user_platform (user_id, platform),
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `;
    db.query(pushTokensTableQuery, (err) => { if (err) console.error('[WARN] Error checking user_push_tokens table:', err.message); else console.log('[OK] Push Tokens table ready'); });

    // Contact Messages table
    const contactMessagesTableQuery = `
      CREATE TABLE IF NOT EXISTS contact_messages (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        email VARCHAR(254) NOT NULL,
        phone VARCHAR(30) DEFAULT NULL,
        subject VARCHAR(150) DEFAULT NULL,
        message TEXT NOT NULL,
        is_read TINYINT(1) DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `;
    db.query(contactMessagesTableQuery, (err) => { if (err) console.error('[WARN] Error checking contact_messages table:', err.message); else console.log('[OK] Contact Messages table ready'); });

    // Migration: Add reply and status columns to contact_messages (idempotent)
    const contactMigrations = [
      "ALTER TABLE contact_messages ADD COLUMN admin_reply TEXT DEFAULT NULL",
      "ALTER TABLE contact_messages ADD COLUMN replied_at TIMESTAMP NULL DEFAULT NULL",
      "ALTER TABLE contact_messages ADD COLUMN status ENUM('new','replied','closed') DEFAULT 'new'"
    ];
    contactMigrations.forEach(q => {
      db.query(q, (err) => { if (err && !err.message.includes('Duplicate column')) console.error('[WARN] contact_messages migration:', err.message); });
    });

    // Create Customer Reports Table (Feedback System)
    const customerReportsTableQuery = `
      CREATE TABLE IF NOT EXISTS customer_reports (
        id INT AUTO_INCREMENT PRIMARY KEY,
        report_code VARCHAR(20) NOT NULL UNIQUE,
        customer_id INT NOT NULL,
        report_type ENUM('bug', 'feature', 'ui_ux', 'general') NOT NULL DEFAULT 'general',
        category ENUM('booking', 'payment', 'artist', 'app_website', 'ar_tryon', 'other') NOT NULL DEFAULT 'other',
        title VARCHAR(255) NOT NULL,
        description TEXT NOT NULL,
        steps_to_reproduce TEXT DEFAULT NULL,
        attachment LONGTEXT DEFAULT NULL,
        system_info JSON DEFAULT NULL,
        status ENUM('open', 'investigating', 'resolved', 'closed', 'junk') DEFAULT 'open',
        priority ENUM('low', 'medium', 'high', 'critical') DEFAULT 'medium',
        admin_notes TEXT DEFAULT NULL,
        is_read_by_admin BOOLEAN DEFAULT FALSE,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        resolved_at DATETIME DEFAULT NULL,
        FOREIGN KEY (customer_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `;
    db.query(customerReportsTableQuery, (err) => { if (err) console.error('[WARN] Error checking customer_reports table:', err.message); else console.log('[OK] Customer Reports table ready'); });

    // Create Report Replies Table (Threaded Conversation)
    const reportRepliesTableQuery = `
      CREATE TABLE IF NOT EXISTS report_replies (
        id INT AUTO_INCREMENT PRIMARY KEY,
        report_id INT NOT NULL,
        sender_id INT NOT NULL,
        sender_role ENUM('admin', 'customer') NOT NULL,
        message TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (report_id) REFERENCES customer_reports(id) ON DELETE CASCADE,
        FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `;
    db.query(reportRepliesTableQuery, (err) => { if (err) console.error('[WARN] Error checking report_replies table:', err.message); else console.log('[OK] Report Replies table ready'); });

  }
});

// ========== EMAIL SETUP (API-BASED) ==========
// Using Resend API (Recommended for Vercel/Render)
const EMAIL_API_KEY = process.env.EMAIL_API_KEY;
const EMAIL_FROM = process.env.EMAIL_FROM || 'onboarding@resend.dev';

// ========== REUSABLE EMAIL TEMPLATE BUILDER ==========
// Generates a production-grade, mobile-responsive InkVistAR branded email.
// `contentHtml` is the inner body (headings, paragraphs, buttons, OTP codes).
function buildEmailHtml(contentHtml) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <meta name="color-scheme" content="light">
  <meta name="supported-color-schemes" content="light">
  <title>InkVistAR</title>
  <!--[if mso]><noscript><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml></noscript><![endif]-->
</head>
<body style="margin:0;padding:0;background-color:#f4f1ec;font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif;-webkit-font-smoothing:antialiased;">
  <!-- Outer wrapper for background color -->
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f4f1ec;">
    <tr>
      <td align="center" style="padding:40px 16px;">
        <!-- Main card -->
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:520px;background-color:#ffffff;border:1px solid #e2ddd5;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.06);">
          <!-- Gold accent bar -->
          <tr><td style="height:4px;background:linear-gradient(90deg,#C19A6B,#8a6c4a,#C19A6B);"></td></tr>
          <!-- Logo -->
          <tr>
            <td align="center" style="padding:32px 32px 0;">
              <img src="${FRONTEND_URL}/images/logo.png" alt="InkVistAR" width="60" height="60" style="display:block;width:60px;height:auto;border:0;" />
            </td>
          </tr>
          <!-- Content area -->
          <tr>
            <td style="padding:24px 32px 32px;color:#1e293b;font-size:15px;line-height:1.7;">
              ${contentHtml}
            </td>
          </tr>
          <!-- Divider -->
          <tr><td style="padding:0 32px;"><div style="height:1px;background-color:#e2ddd5;"></div></td></tr>
          <!-- Footer -->
          <tr>
            <td style="padding:20px 32px 28px;text-align:center;">
              <p style="margin:0 0 6px;font-size:12px;color:#64748b;">InkVictus Tattoo Studio &bull; BGC, Taguig</p>
              <p style="margin:0;font-size:11px;color:#94a3b8;">This is an automated message. Please do not reply to this email.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

async function sendEmail(to, subject, html) {
  if (!EMAIL_API_KEY) {
    console.log('[WARN] EMAIL_API_KEY missing. Email logged to console.');
    return;
  }

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${EMAIL_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: EMAIL_FROM,
        to: to,
        subject: subject,
        html: html
      })
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ message: 'Non-JSON response' }));
      console.error('[ERROR] Resend API Error:', response.status, errorData);
      throw new Error(`Resend API Error: ${response.status} - ${JSON.stringify(errorData)}`);
    } else {
      console.log(`[OK] Email sent to ${to}`);
    }
  } catch (error) {
    console.error('[ERROR] Email Network Error:', error.message);
    throw error;
  }
}

// Helper: PayMongo auth header
function paymongoAuthHeader() {
  if (!PAYMONGO_SECRET_KEY) {
    throw new Error('PAYMONGO_SECRET_KEY is not configured');
  }
  return 'Basic ' + Buffer.from(`${PAYMONGO_SECRET_KEY}:`).toString('base64');
}

// Helper: Create Notification
/** 
 * Receipt Email — Sends a branded invoice email to the customer using buildEmailHtml.
 * Usage: sendReceiptEmail(customerEmail, invoiceData)
 */
function sendReceiptEmail(customerEmail, invoiceData) {
  const amount = parseFloat(invoiceData.amount || 0);
  const changeGiven = parseFloat(invoiceData.changeGiven || 0);
  const remaining = parseFloat(invoiceData.remaining || 0);

  const contentHtml = `
    <h2 style="margin:0 0 6px;font-size:22px;color:#C19A6B;font-weight:700;">Payment Receipt</h2>
    <p style="margin:0 0 24px;color:#94a3b8;font-size:13px;">Invoice ${invoiceData.id}</p>

    <div style="background:#1a1a1a;border:1px solid rgba(193,154,107,0.2);border-radius:12px;padding:20px;margin-bottom:20px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
        ${invoiceData.clientName ? `<tr><td style="padding:6px 0;font-size:12px;color:#94a3b8;text-transform:uppercase;letter-spacing:0.5px;">Client</td><td style="padding:6px 0;text-align:right;font-weight:600;color:#e2e8f0;">${invoiceData.clientName}</td></tr>` : ''}
        ${invoiceData.designTitle ? `<tr><td style="padding:6px 0;font-size:12px;color:#94a3b8;text-transform:uppercase;letter-spacing:0.5px;">Service</td><td style="padding:6px 0;text-align:right;font-weight:600;color:#e2e8f0;">${invoiceData.designTitle}</td></tr>` : ''}
        <tr><td style="padding:6px 0;font-size:12px;color:#94a3b8;text-transform:uppercase;letter-spacing:0.5px;">Payment Method</td><td style="padding:6px 0;text-align:right;font-weight:600;color:#e2e8f0;">${invoiceData.method}</td></tr>
        <tr><td style="padding:6px 0;font-size:12px;color:#94a3b8;text-transform:uppercase;letter-spacing:0.5px;">Date</td><td style="padding:6px 0;text-align:right;font-weight:600;color:#e2e8f0;">${new Date().toLocaleDateString('en-PH', { month: 'long', day: 'numeric', year: 'numeric' })}</td></tr>
      </table>
    </div>

    <div style="background:#1a1a1a;border:1px solid rgba(16,185,129,0.3);border-radius:12px;padding:20px;margin-bottom:20px;text-align:center;">
      <p style="margin:0 0 4px;font-size:12px;color:#94a3b8;text-transform:uppercase;letter-spacing:1px;">Amount Paid</p>
      <p style="margin:0;font-size:28px;font-weight:800;color:#10b981;">₱${amount.toLocaleString("en-PH", { minimumFractionDigits: 2 })}</p>
      ${changeGiven > 0 ? `<p style="margin:8px 0 0;font-size:13px;color:#94a3b8;">Change Given: ₱${changeGiven.toLocaleString("en-PH", { minimumFractionDigits: 2 })}</p>` : ''}
      ${remaining > 0 ? `<p style="margin:8px 0 0;font-size:13px;color:#f59e0b;">Remaining Balance: ₱${remaining.toLocaleString("en-PH", { minimumFractionDigits: 2 })}</p>` : ''}
    </div>

    <p style="margin:0 0 20px;color:#94a3b8;font-size:13px;text-align:center;">Thank you for choosing InkVictus Tattoo Studio. Your invoice is available in your account notifications.</p>
  `;

  const emailHtml = buildEmailHtml(contentHtml);
  sendEmail(customerEmail, `Your InkVictus Receipt — ${invoiceData.id}`, emailHtml);
  console.log(`[OK] Receipt email queued for ${customerEmail} — ${invoiceData.id}`);
}

/**
 * Consultation Summary Email — Sent when a consultation appointment is marked as completed.
 * Replaces the generic "Session Complete" email for consultations (which are always free).
 * Includes: details card, artist notes, quoted price, and CTAs for booking a session / creating account.
 *
 * @param {string} recipientEmail - Customer's email address
 * @param {string} recipientName - Customer's display name
 * @param {object} consultationData - Consultation appointment data
 * @param {string} consultationData.bookingCode - Booking reference code
 * @param {string} consultationData.designTitle - Design/concept discussed
 * @param {string} consultationData.date - Consultation date (formatted)
 * @param {string} consultationData.artistName - Assigned artist name
 * @param {string} consultationData.consultationMethod - Face-to-Face / Online
 * @param {string} consultationData.consultationNotes - Artist's notes from the consultation
 * @param {number} consultationData.quotedPrice - Agreed price quote (nullable)
 * @param {boolean} isGuest - Whether the customer is a guest (no account)
 */
function sendConsultationSummaryEmail(recipientEmail, recipientName, consultationData, isGuest = false) {
  if (!recipientEmail) return;

  try {
    const { bookingCode, designTitle, date, artistName, consultationMethod, consultationNotes, quotedPrice } = consultationData;

    // ── Details Card ──
    const detailRows = [
      { label: 'Ref Code', value: bookingCode || `#N/A`, mono: true },
      { label: 'Design / Idea', value: designTitle || 'General Consultation' },
      { label: 'Date', value: date || 'N/A' },
      { label: 'Artist', value: artistName || 'Studio Staff' },
      { label: 'Method', value: consultationMethod || 'Face-to-Face' }
    ];

    const detailHtml = detailRows.map(r =>
      `<p style="margin:0 0 12px;font-size:14px;color:#94a3b8;"><strong style="color:#e2e8f0;display:inline-block;width:110px;">${r.label}:</strong> <span style="color:#C19A6B;${r.mono ? 'font-family:monospace;font-weight:700;' : ''}">${r.value}</span></p>`
    ).join('');

    // ── Artist's Notes Block ──
    const notesBlock = consultationNotes ? `
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td align="center" style="padding:8px 0 16px;">
        <div style="display:inline-block;width:100%;max-width:400px;box-sizing:border-box;padding:20px 24px;background:linear-gradient(135deg,#1a1816 0%,#14120f 100%);border:1px solid rgba(190,144,85,0.25);border-radius:14px;">
          <p style="margin:0 0 10px;font-size:14px;font-weight:700;color:#be9055;">Artist's Notes</p>
          <p style="margin:0;font-size:14px;color:#e2e8f0;line-height:1.7;white-space:pre-wrap;">${consultationNotes}</p>
        </div>
      </td></tr></table>
    ` : '';

    // ── Price Quote Block ──
    const priceBlock = (quotedPrice && quotedPrice > 0) ? `
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td align="center" style="padding:4px 0 16px;">
        <div style="display:inline-block;width:100%;max-width:400px;box-sizing:border-box;padding:18px 24px;background:#1a1a1a;border:1px solid rgba(16,185,129,0.25);border-radius:12px;text-align:center;">
          <p style="margin:0 0 4px;font-size:12px;color:#94a3b8;text-transform:uppercase;letter-spacing:1px;">Estimated Price Quote</p>
          <p style="margin:0;font-size:28px;font-weight:800;color:#10b981;">₱${parseFloat(quotedPrice).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
          <p style="margin:8px 0 0;font-size:11px;color:#64748b;">Final pricing may vary based on design complexity and session duration.</p>
        </div>
      </td></tr></table>
    ` : '';

    // ── Book Your Session CTA ──
    const bookSessionBlock = `
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td align="center" style="padding:8px 0 16px;">
        <div style="display:inline-block;width:100%;max-width:400px;box-sizing:border-box;padding:22px 24px;background:linear-gradient(135deg,#111827 0%,#1a1816 100%);border:1px solid rgba(190,144,85,0.3);border-radius:14px;text-align:center;">
          <p style="margin:0 0 8px;font-size:16px;font-weight:700;color:#be9055;">Ready to Bring Your Design to Life?</p>
          <p style="margin:0 0 16px;font-size:13px;color:#94a3b8;line-height:1.6;">Your consultation is complete! Take the next step and book your tattoo session to make it happen.</p>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td align="center" style="padding:4px 0;">
            <a href="${FRONTEND_URL}${isGuest ? '/book' : '/customer/bookings'}" style="display:inline-block;padding:13px 32px;background:linear-gradient(135deg,#be9055,#a07840);color:#fff;font-size:14px;font-weight:700;text-decoration:none;border-radius:10px;letter-spacing:0.3px;">Book a Session →</a>
          </td></tr></table>
          ${isGuest ? `
            <p style="margin:14px 0 0;font-size:12px;color:#64748b;">Don't have an account yet?</p>
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td align="center" style="padding:8px 0 0;">
              <a href="${FRONTEND_URL}/register" style="display:inline-block;padding:10px 24px;background:rgba(190,144,85,0.15);border:1px solid rgba(190,144,85,0.3);color:#be9055;font-size:13px;font-weight:700;text-decoration:none;border-radius:10px;">Create Free Account →</a>
            </td></tr></table>
          ` : ''}
        </div>
      </td></tr></table>
    `;

    // ── Book Another Consultation CTA (bottom) ──
    const rebookBlock = `
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td align="center" style="padding:4px 0 8px;">
        <div style="display:inline-block;width:100%;max-width:400px;box-sizing:border-box;padding:14px 20px;background:rgba(99,102,241,0.06);border:1px solid rgba(99,102,241,0.15);border-radius:10px;text-align:center;">
          <p style="margin:0 0 8px;font-size:13px;color:#94a3b8;">Need another consultation? You can book one anytime.</p>
          <a href="${FRONTEND_URL}/book" style="display:inline-block;padding:8px 20px;color:#6366f1;font-size:13px;font-weight:700;text-decoration:none;border:1px solid rgba(99,102,241,0.3);border-radius:8px;background:rgba(99,102,241,0.08);">Book Another Consultation →</a>
        </div>
      </td></tr></table>
    `;

    const contentHtml = `
      <h2 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#10b981;text-align:center;">Consultation Summary</h2>
      ${bookingCode ? `<p style="margin:0 0 20px;font-size:13px;color:#64748b;text-align:center;">Ref: ${bookingCode}</p>` : ''}
      <p style="margin:0 0 16px;">Hello ${recipientName},</p>
      <p style="margin:0 0 16px;line-height:1.6;">Thank you for visiting InkVictus Tattoo Studio! Your consultation has been completed. Here's a summary of what was discussed during your visit:</p>

      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td align="center" style="padding:10px 0 20px;">
        <div style="text-align:left;display:inline-block;background-color:#faf8f5;border:1px solid #e2ddd5;border-radius:12px;padding:24px;width:100%;max-width:400px;box-sizing:border-box;">
          ${detailHtml}
        </div>
      </td></tr></table>

      ${notesBlock}
      ${priceBlock}
      ${bookSessionBlock}
      ${rebookBlock}
      <p style="margin:16px 0 0;font-size:14px;color:#94a3b8;text-align:center;">— The InkVistAR Studio Team</p>
    `;

    const emailHtml = buildEmailHtml(contentHtml);
    sendResendEmail(recipientEmail, `InkVistAR: Your Consultation Summary${bookingCode ? ` [${bookingCode}]` : ''}`, emailHtml);
    console.log(`[OK] Consultation summary email sent to ${recipientEmail}`);
  } catch (err) {
    console.error(`[WARN] Error sending consultation summary email to ${recipientEmail}:`, err.message);
  }
}

function createNotification(userId, title, message, type, relatedId = null) {
  const utcNow = getLocalDatetime();
  const insertQuery = 'INSERT INTO notifications (user_id, title, message, type, related_id, created_at, is_read) VALUES (?, ?, ?, ?, ?, ?, 0)';
  db.query(insertQuery, [userId, title, message, type, relatedId, utcNow], (err, result) => {
    if (err) {
      console.error('[ERROR] Error creating DB notification:', err.message);
      return;
    } else {
      console.log(`[OK] DB Notification created for user ${userId}: ${title}`);
      // Now, send the push notification
      sendPushNotification(userId, title, message, { type, relatedId });
    }
  });
}

// Helper: Send Push Notification via Expo
async function sendPushNotification(userId, title, body, data) {
  // 1. Get the user's push token
  db.query('SELECT push_token FROM users WHERE id = ?', [userId], async (err, results) => {
    if (err || results.length === 0 || !results[0].push_token) {
      console.log(`[INFO] Skipping push notification for user ${userId}: No token found.`);
      return;
    }

    const pushToken = results[0].push_token;
    console.log(`[INFO] Sending push notification to token: ${pushToken}`);

    // 2. Send to Expo's push API
    await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Accept-encoding': 'gzip, deflate',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ to: pushToken, title, body, data }),
    });
  });
}

// Helper: Log Audit Action
function logAction(userId, action, details, ip = '::1') {
  const query = 'INSERT INTO audit_logs (user_id, action, details, ip_address, created_at) VALUES (?, ?, ?, ?, ?)';
  db.query(query, [userId, action, details, ip, getLocalDatetime()], (err) => {
    if (err) console.error('[ERROR] Error logging action:', err.message);
  });
}

/**
 * Extract admin user ID from request context.
 * Priority: req.body.adminId → req.body.userId → req.body.user_id → X-Admin-Id header → null
 */
function getAdminId(req) {
  return req.body?.adminId || req.body?.userId || req.body?.user_id
    || (req.headers?.['x-admin-id'] ? parseInt(req.headers['x-admin-id'], 10) : null)
    || null;
}

// Helper: Create Default Users (Admin, Artist, Customer)
function createDefaultUsers() {
  // 1. Admin
  const checkAdmin = "SELECT * FROM users WHERE user_type = 'admin' LIMIT 1";
  db.query(checkAdmin, async (err, results) => {
    if (!err && results.length === 0) {
      console.log('[WARN] No admin found. Creating default admin...');
      try {
        const adminPass = await bcrypt.hash('admin123', 10);
        const createAdmin = "INSERT INTO users (name, email, password_hash, user_type, is_verified) VALUES ('System Admin', 'admin@inkvistar.com', ?, 'admin', 1)";
        db.query(createAdmin, [adminPass], (err) => {
          if (!err) console.log('[OK] Default Admin Created: admin@inkvistar.com / admin123');
          else console.error('[ERROR] Failed to create admin:', err.message);
        });
      } catch (e) {
        console.error('[ERROR] Error creating admin hash:', e);
      }
    }
  });

  // 2. Artist
  const checkArtist = "SELECT * FROM users WHERE email = 'artist@inkvistar.com' LIMIT 1";
  db.query(checkArtist, async (err, results) => {
    if (!err && results.length === 0) {
      console.log('[WARN] No default artist found. Creating default artist...');
      try {
        const artistPass = await bcrypt.hash('artist123', 10);
        const createArtist = "INSERT INTO users (name, email, password_hash, user_type, is_verified) VALUES ('Default Artist', 'artist@inkvistar.com', ?, 'artist', 1)";
        db.query(createArtist, [artistPass], (err, result) => {
          if (!err && result.insertId) {
            const artistId = result.insertId;
            const createProfile = "INSERT INTO artists (user_id, studio_name, experience_years, specialization, hourly_rate, commission_rate) VALUES (?, 'InkVistAR Studio', 5, 'Realism', 150.00, 0.30)";
            db.query(createProfile, [artistId], (err) => {
              if (!err) console.log('[OK] Default Artist Created: artist@inkvistar.com / artist123');
            });
          }
        });
      } catch (e) { console.error(e); }
    }
  });

  // 3. Customer
  const checkCustomer = "SELECT * FROM users WHERE email = 'customer@inkvistar.com' LIMIT 1";
  db.query(checkCustomer, async (err, results) => {
    if (!err && results.length === 0) {
      console.log('[WARN] No default customer found. Creating default customer...');
      try {
        const customerPass = await bcrypt.hash('customer123', 10);
        const createCustomer = "INSERT INTO users (name, email, password_hash, user_type, is_verified) VALUES ('Default Customer', 'customer@inkvistar.com', ?, 'customer', 1)";
        db.query(createCustomer, [customerPass], (err, result) => {
          if (!err && result.insertId) {
            const customerId = result.insertId;
            const createProfile = "INSERT INTO customers (user_id, phone, location) VALUES (?, '555-0123', 'New York, NY')";
            db.query(createProfile, [customerId], (err) => {
              if (!err) console.log('[OK] Default Customer Created: customer@inkvistar.com / customer123');
            });
          }
        });
      } catch (e) { console.error(e); }
    }
  });

  // 4. System Guest (for unauthenticated public bookings)
  const checkGuest = "SELECT * FROM users WHERE email = 'guest@inkvistar.com' LIMIT 1";
  db.query(checkGuest, async (err, results) => {
    if (!err && results.length === 0) {
      console.log('[WARN] No System Guest found. Creating System Guest account for public bookings...');
      try {
        const guestPass = await bcrypt.hash(Math.random().toString(36).substring(7), 10);
        const createGuest = "INSERT INTO users (name, email, password_hash, user_type, is_verified, is_deleted) VALUES ('System Guest', 'guest@inkvistar.com', ?, 'customer', 1, 0)";
        db.query(createGuest, [guestPass], (err, result) => {
          if (!err && result.insertId) {
            const customerId = result.insertId;
            const createProfile = "INSERT INTO customers (user_id, notes) VALUES (?, 'System account for unauthenticated guest bookings')";
            db.query(createProfile, [customerId], () => {
              console.log('[OK] Default System Guest Created: guest@inkvistar.com');
            });
          }
        });
      } catch (e) { console.error(e); }
    }
  });
}

// ========== GENERATIVE AI CHATBOT SETUP (Groq) ==========
const GROQ_API_KEY = process.env.GROQ_API_KEY;
let groq = null;
if (GROQ_API_KEY) {
  try {
    groq = new Groq({ apiKey: GROQ_API_KEY });
  } catch (e) {
    console.error('[ERROR] Failed to initialize Groq:', e.message);
  }
}

// Verify API Key on startup
async function verifyGroq() {
  if (!groq) {
    console.log('[WARN] Chatbot will run in OFFLINE MODE (No API Key).');
    return;
  }
  try {
    console.log('[INFO] Verifying Groq API Key...');
    const chatCompletion = await groq.chat.completions.create({
      messages: [{ role: 'user', content: 'Hello' }],
      model: 'llama-3.3-70b-versatile',
    });
    console.log('[OK] Groq API is WORKING! Response:', chatCompletion.choices[0].message.content);
  } catch (error) {
    console.error('[ERROR] Groq API Check Failed:', error.message);
    console.log('[WARN] Chatbot will run in OFFLINE MODE (Fallback responses).');
  }
}
verifyGroq();

// ========== MIDDLEWARE ==========
app.use((req, res, next) => {
  console.log(`\n[REQ] ${new Date().toISOString()} ${req.method} ${req.url}`);
  console.log('[DEBUG] Headers:', req.headers);
  console.log('[DEBUG] Body:', req.body);
  next();
});

// ========== DEBUG ENDPOINTS ==========

// Test endpoint
app.get('/api/test', (req, res) => {
  console.log('[OK] Test endpoint called');
  res.json({
    success: true,
    message: 'Backend is working!',
    timestamp: new Date().toISOString(),
    database: 'MySQL connected',
    env: process.env.NODE_ENV || 'development'
  });
});

// Debug: List all routes
app.get('/api/debug/routes', (req, res) => {
  const routes = [];
  app._router.stack.forEach((middleware) => {
    if (middleware.route) {
      // Routes registered directly on the app
      routes.push({
        method: Object.keys(middleware.route.methods).join(', ').toUpperCase(),
        path: middleware.route.path,
      });
    } else if (middleware.name === 'router') {
      // Router middleware
      middleware.handle.stack.forEach((handler) => {
        if (handler.route) {
          routes.push({
            method: Object.keys(handler.route.methods).join(', ').toUpperCase(),
            path: handler.route.path,
          });
        }
      });
    }
  });
  res.json({ success: true, count: routes.length, routes });
});

// Test database connection
app.get('/api/debug/db', (req, res) => {
  console.log('[INFO] Testing database...');

  db.query('SELECT 1 + 1 AS result', (err, results) => {
    if (err) {
      console.error('[ERROR] Database test failed:', err);
      return res.status(500).json({
        success: false,
        message: 'Database error',
        error: err.message
      });
    }

    res.json({
      success: true,
      message: 'Database connected',
      result: results[0].result
    });
  });
});

// List all users
app.get('/api/debug/users', (req, res) => {
  console.log('[INFO] Listing all users...');

  db.query('SELECT id, name, email, user_type, is_deleted FROM users', (err, results) => {
    if (err) {
      console.error('[ERROR] Error:', err);
      return res.status(500).json({
        success: false,
        message: 'Database error'
      });
    }

    console.log(`[INFO] Found ${results.length} users`);
    res.json({
      success: true,
      users: results,
      count: results.length
    });
  });
});

// Check specific user
app.get('/api/debug/user/:id', (req, res) => {
  const { id } = req.params;
  console.log(`[INFO] Checking user ${id}...`);

  db.query('SELECT id, name, email, user_type FROM users WHERE id = ?', [id], (err, results) => {
    if (err) {
      console.error('[ERROR] Error:', err);
      return res.status(500).json({
        success: false,
        message: 'Database error'
      });
    }

    if (results.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    res.json({
      success: true,
      user: results[0]
    });
  });
});

// ========== LOGIN ENDPOINT (SIMPLIFIED) ==========
app.post('/api/login', async (req, res) => {
  console.log('\n========== LOGIN REQUEST ==========');
  console.log('[DEBUG] Body:', req.body);

  try {
    const { email, password, type } = req.body;

    if (!email || !password) {
      console.log('[ERROR] Missing fields');
      return res.status(400).json({
        success: false,
        message: 'Email and password are required'
      });
    }

    console.log(`[INFO] Searching for user: ${email}`);

    // Query database
    let query = 'SELECT * FROM users WHERE email = ?';
    let params = [email];

    if (type) {
      query += ' AND user_type = ?';
      params.push(type);
    }

    console.log('[DEBUG] Executing query:', query);

    db.query(query, params, async (err, results) => {
      if (err) {
        console.error('[ERROR] Database error:', err.message);
        return res.status(500).json({
          success: false,
          message: 'Database error'
        });
      }

      console.log(`[INFO] Found ${results.length} users`);

      if (results.length === 0) {
        console.log('[ERROR] No user found');
        return res.status(401).json({
          success: false,
          message: 'Invalid email or password'
        });
      }

      const user = results[0];
      console.log('User object before 403 checks:', user);

      // Check if soft deleted
      if (user.is_deleted) {
        return res.status(403).json({
          success: false,
          message: 'This account has been deactivated.'
        });
      }

      // Check account status (banned / deactivated)
      if (user.account_status === 'banned') {
        return res.status(403).json({
          success: false,
          message: 'This account has been banned. If you believe this is an error, please contact support@inkvictusstudio.com to submit an appeal.',
          banned: true
        });
      }

      if (user.account_status === 'deactivated') {
        return res.status(403).json({
          success: false,
          message: 'This account has been temporarily deactivated by an administrator. Please contact support for more information.',
          deactivated: true
        });
      }

      console.log('[OK] User found:', user.name);

      // Check if locked out
      if (user.lockout_until && new Date(user.lockout_until) > new Date()) {
        const lockoutDiffMs = new Date(user.lockout_until) - new Date();
        const lockoutDiffMin = Math.ceil(lockoutDiffMs / 60000);
        return res.status(403).json({
          success: false,
          message: `Account temporarily locked due to too many failed attempts. Try again in ${lockoutDiffMin} minute(s).`,
          lockedOut: true,
          cooldownMinutes: lockoutDiffMin
        });
      }

      // Verify password FIRST (before verification check to prevent email enumeration)
      const valid = await bcrypt.compare(password, user.password_hash);
      if (!valid) {
        // Handle failed login attempt
        const failedAttempts = (user.failed_login_attempts || 0) + 1;
        let updateQuery = 'UPDATE users SET failed_login_attempts = ?';
        let queryParams = [failedAttempts];
        let lockoutResponse = null;

        if (failedAttempts >= 5) {
          let cooldownMin = 5;
          if (failedAttempts === 6) cooldownMin = 10;
          else if (failedAttempts === 7) cooldownMin = 15;
          else if (failedAttempts === 8) cooldownMin = 30;
          else if (failedAttempts >= 9) cooldownMin = 60;

          // Compute lockout time safely relative to current server time in UTC
          const lockoutUntilStr = getLocalDatetime(new Date(Date.now() + cooldownMin * 60000));
          updateQuery += ', lockout_until = ?';
          queryParams.push(lockoutUntilStr);

          lockoutResponse = {
            success: false,
            message: `Account temporarily locked due to too many failed attempts. Try again in ${cooldownMin} minute(s).`,
            lockedOut: true,
            cooldownMinutes: cooldownMin
          };
        }

        updateQuery += ' WHERE id = ?';
        queryParams.push(user.id);

        db.query(updateQuery, queryParams, (updateErr) => {
          if (updateErr) console.error('Error updating failed login attempts:', updateErr);
        });

        if (lockoutResponse) {
          return res.status(403).json(lockoutResponse);
        }

        return res.status(401).json({
          success: false,
          message: 'Invalid email or password',
          failedAttempts: failedAttempts,
          attemptsRemaining: 5 - failedAttempts
        });
      }

      // Reset login attempts if successful
      if (user.failed_login_attempts > 0 || user.lockout_until !== null) {
        db.query('UPDATE users SET failed_login_attempts = 0, lockout_until = NULL WHERE id = ?', [user.id]);
      }

      // Check verification for ALL user types (first-login OTP flow)
      if (user.is_verified === 0) {
        return res.status(403).json({
          success: false,
          message: 'Your account requires verification. An OTP will be sent to your email.',
          requireVerification: true,
          verificationEmail: user.email
        });
      }

      console.log('[OK] LOGIN SUCCESSFUL!');

      const ua = req.headers['user-agent'] || 'Unknown';
      const device = ua.length > 40 ? ua.substring(0, 40) + '...' : ua;
      logAction(user.id, 'LOGIN', `Logged in as ${user.user_type} on ${device}`, req.ip || '::1');

      if (req.body.orphanAppointmentId) {
        db.query('UPDATE appointments SET customer_id = ?, is_guest_placeholder = 0 WHERE id = ?', [user.id, req.body.orphanAppointmentId], (updateErr) => {
          if (updateErr) console.error('Error claiming orphan appointment:', updateErr);
          else {
            db.query("SELECT id FROM users WHERE user_type = 'admin' ORDER BY id ASC LIMIT 1", (err, results) => {
              const actualAdminId = (results && results.length > 0) ? results[0].id : 1;
              createNotification(actualAdminId, 'Booking Claimed', `${user.name} logged in and claimed their pending booking request.`, 'appointment_request', req.body.orphanAppointmentId);
            });
          }
        });
      }

      // ═══ Migrate ALL orphan appointments by guest_email match (same as registration) ═══
      db.query(
        'UPDATE appointments SET customer_id = ?, is_guest_placeholder = 0 WHERE guest_email = ? AND customer_id != ? AND is_deleted = 0',
        [user.id, user.email, user.id],
        (migErr, migResult) => {
          const emailMigratedCount = migResult ? migResult.affectedRows : 0;
          if (emailMigratedCount > 0) {
            console.log(`[INFO] Login migration: Claimed ${emailMigratedCount} orphan appointment(s) for ${user.name} (${user.email})`);
            createNotification(user.id, 'Prior Bookings Found!', `We found ${emailMigratedCount} consultation request(s) linked to your email from before. They have been automatically added to your account.`, 'appointment_request');
          }

          // Count total migrated appointments (includes both orphanId and email-based)
          db.query(
            'SELECT COUNT(*) as cnt FROM appointments WHERE guest_email = ? AND customer_id = ? AND is_deleted = 0',
            [user.email, user.id],
            (cntErr, cntRows) => {
              const migratedAppointments = (!cntErr && cntRows && cntRows[0]) ? cntRows[0].cnt : 0;

              res.json({
                success: true,
                user: {
                  id: user.id,
                  name: user.name,
                  email: user.email,
                  type: user.user_type,
                  is_superadmin: user.is_superadmin === 1
                },
                message: 'Login successful!',
                migratedAppointments: migratedAppointments
              });
            }
          );
        }
      );

    }); // close outer db.query callback

  } catch (error) {
    console.error('[ERROR] Unhandled error in login:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error.message
    });
  }
});

// ========== RESET PASSWORD ENDPOINT ==========
app.post('/api/reset-password', async (req, res) => {
  const { email, newPassword } = req.body;
  console.log('[INFO] Resetting password for:', email);

  // 1. Validation and Sanitization
  if (!email || !newPassword) {
    return res.status(400).json({ success: false, message: 'Email and new password are required.' });
  }

  // Basic password policy (matches registration)
  if (newPassword.length < 6) {
    return res.status(400).json({ success: false, message: 'Password must be at least 6 characters long.' });
  }

  // Find user
  db.query('SELECT * FROM users WHERE email = ?', [email], async (err, results) => {
    if (err) {
      console.error('[ERROR] DB error on password reset:', err.message);
      return res.status(500).json({ success: false, message: 'Database error' });
    }
    if (results.length === 0) {
      // Do not reveal if user exists or not for security.
      return res.status(400).json({ success: false, message: 'If an account with that email exists, a password reset cannot be processed at this time.' });
    }

    const user = results[0];

    // 2. Check if new password is same as old
    const isSamePassword = await bcrypt.compare(newPassword, user.password_hash);
    if (isSamePassword) {
      return res.status(400).json({ success: false, message: 'New password cannot be the same as the old password.' });
    }

    // 3. Hash and update
    const password_hash = await bcrypt.hash(newPassword, 10);

    db.query('UPDATE users SET password_hash = ?, otp_code = NULL, otp_expires = NULL, failed_login_attempts = 0, lockout_until = NULL WHERE email = ?', [password_hash, email], (updateErr, result) => {
      if (updateErr) return res.status(500).json({ success: false, message: 'Database error during password update.' });
      logAction(user.id, 'PASSWORD_RESET', `User reset their password.`, req.ip || '::1');
      res.json({ success: true, message: 'Password updated successfully' });
    });
  });
});

// ========== CUSTOMER CHANGE PASSWORD ENDPOINT ==========
app.post('/api/customer/change-password', async (req, res) => {
  const { customerId, currentPassword, newPassword } = req.body;
  console.log('[INFO] Customer change password requested for ID:', customerId);

  // Validation
  if (!customerId || !currentPassword || !newPassword) {
    return res.status(400).json({ success: false, message: 'All password fields are required' });
  }

  if (newPassword.length < 6) {
    return res.status(400).json({ success: false, message: 'New password must be at least 6 characters' });
  }

  // Find user
  db.query('SELECT * FROM users WHERE id = ?', [customerId], async (err, results) => {
    if (err) {
      console.error('[ERROR] DB error:', err.message);
      return res.status(500).json({ success: false, message: 'Database error' });
    }
    if (results.length === 0) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    const user = results[0];

    // Verify current password
    const isMatch = await bcrypt.compare(currentPassword, user.password_hash);
    if (!isMatch) {
      return res.status(401).json({ success: false, message: 'Current password is incorrect' });
    }

    // Check if new password is same as old
    const isSamePassword = await bcrypt.compare(newPassword, user.password_hash);
    if (isSamePassword) {
      return res.status(400).json({ success: false, message: 'New password cannot be the same as the old password' });
    }

    // Hash and update — also revoke verification
    const password_hash = await bcrypt.hash(newPassword, 10);
    const verification_token = crypto.randomBytes(32).toString('hex');

    db.query('UPDATE users SET password_hash = ?, is_verified = 0, verification_token = ? WHERE id = ?', [password_hash, verification_token, customerId], (updateErr) => {
      if (updateErr) {
        console.error('[ERROR] Error updating password:', updateErr);
        return res.status(500).json({ success: false, message: 'Failed to update password' });
      }
      logAction(customerId, 'PASSWORD_CHANGED', 'Customer changed their password — re-verification required', req.ip || '::1');
      createNotification(customerId, 'Password Changed', 'Your account password was successfully updated.', 'password_change');

      // Send re-verification email
      const protocol = getProtocol(req);
      const host = req.get('host');
      const verifyUrl = `${protocol}://${host}/api/verify?token=${verification_token}&email=${user.email}`;
      console.log('[DEBUG] Re-verification Link:', verifyUrl);

      const html = buildEmailHtml(`
              <h2 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#C19A6B;text-align:center;">Password Changed</h2>
              <p style="margin:0 0 20px;font-size:13px;color:#64748b;text-align:center;">Re-verification required for your security</p>
              <p style="margin:0 0 16px;">Your password was successfully updated. To protect your account, we need you to verify your email address before you can log in again.</p>
              <p style="margin:0 0 24px;font-size:13px;color:#94a3b8;">If you did not make this change, please contact our support team immediately.</p>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td align="center">
                <a href="${verifyUrl}" style="display:inline-block;padding:14px 36px;background:linear-gradient(135deg,#C19A6B,#8a6c4a);color:#000;font-size:14px;font-weight:700;text-decoration:none;border-radius:8px;letter-spacing:1px;text-transform:uppercase;">Verify Email Address</a>
              </td></tr></table>
              <p style="margin:24px 0 0;font-size:12px;color:#555;text-align:center;word-break:break-all;">Or copy this link: <a href="${verifyUrl}" style="color:#C19A6B;text-decoration:none;">${verifyUrl}</a></p>
      `);
      sendEmail(user.email, 'InkVistAR: Re-verify Your Account', html);

      res.json({ success: true, message: 'Password changed. Please check your email to re-verify your account.', requireReverification: true });
    });
  });
});

// ========== ARTIST CHANGE PASSWORD ENDPOINT ==========
app.post('/api/artist/change-password', async (req, res) => {
  const { artistId, currentPassword, newPassword } = req.body;
  console.log('[INFO] Artist change password requested for ID:', artistId);

  // Validation
  if (!artistId || !currentPassword || !newPassword) {
    return res.status(400).json({ success: false, message: 'All password fields are required' });
  }

  if (newPassword.length < 6) {
    return res.status(400).json({ success: false, message: 'New password must be at least 6 characters' });
  }

  // Find user
  db.query('SELECT * FROM users WHERE id = ?', [artistId], async (err, results) => {
    if (err) {
      console.error('[ERROR] DB error:', err.message);
      return res.status(500).json({ success: false, message: 'Database error' });
    }
    if (results.length === 0) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    const user = results[0];

    // Verify current password
    const isMatch = await bcrypt.compare(currentPassword, user.password_hash);
    if (!isMatch) {
      return res.status(401).json({ success: false, message: 'Current password is incorrect' });
    }

    // Check if new password is same as old
    const isSamePassword = await bcrypt.compare(newPassword, user.password_hash);
    if (isSamePassword) {
      return res.status(400).json({ success: false, message: 'New password cannot be the same as the old password' });
    }

    // Hash and update — also revoke verification
    const password_hash = await bcrypt.hash(newPassword, 10);
    const verification_token = crypto.randomBytes(32).toString('hex');

    db.query('UPDATE users SET password_hash = ?, is_verified = 0, verification_token = ? WHERE id = ?', [password_hash, verification_token, artistId], (updateErr) => {
      if (updateErr) {
        console.error('[ERROR] Error updating password:', updateErr);
        return res.status(500).json({ success: false, message: 'Failed to update password' });
      }
      logAction(artistId, 'PASSWORD_CHANGED', 'Artist changed their password — re-verification required', req.ip || '::1');
      createNotification(artistId, 'Password Changed', 'Your account password was successfully updated.', 'password_change');

      // Send re-verification email
      const protocol = getProtocol(req);
      const host = req.get('host');
      const verifyUrl = `${protocol}://${host}/api/verify?token=${verification_token}&email=${user.email}`;
      console.log('[DEBUG] Re-verification Link:', verifyUrl);

      const html = buildEmailHtml(`
              <h2 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#C19A6B;text-align:center;">Password Changed</h2>
              <p style="margin:0 0 20px;font-size:13px;color:#64748b;text-align:center;">Re-verification required for your security</p>
              <p style="margin:0 0 16px;">Your password was successfully updated. To protect your account, we need you to verify your email address before you can log in again.</p>
              <p style="margin:0 0 24px;font-size:13px;color:#94a3b8;">If you did not make this change, please contact our support team immediately.</p>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td align="center">
                <a href="${verifyUrl}" style="display:inline-block;padding:14px 36px;background:linear-gradient(135deg,#C19A6B,#8a6c4a);color:#000;font-size:14px;font-weight:700;text-decoration:none;border-radius:8px;letter-spacing:1px;text-transform:uppercase;">Verify Email Address</a>
              </td></tr></table>
              <p style="margin:24px 0 0;font-size:12px;color:#555;text-align:center;word-break:break-all;">Or copy this link: <a href="${verifyUrl}" style="color:#C19A6B;text-decoration:none;">${verifyUrl}</a></p>
      `);
      sendEmail(user.email, 'InkVistAR: Re-verify Your Account', html);

      res.json({ success: true, message: 'Password changed. Please check your email to re-verify your account.', requireReverification: true });
    });
  });
});

// ========== REQUEST EMAIL CHANGE (sends OTP to current email) ==========
app.post('/api/request-email-change', (req, res) => {
  const { userId, newEmail } = req.body;
  console.log('[INFO] Email change requested for user ID:', userId, '→', newEmail);

  if (!userId || !newEmail) {
    return res.status(400).json({ success: false, message: 'User ID and new email are required' });
  }

  // Check if new email is already taken
  db.query('SELECT id FROM users WHERE email = ? AND id != ?', [newEmail, userId], (checkErr, existing) => {
    if (checkErr) return res.status(500).json({ success: false, message: 'Database error' });
    if (existing.length > 0) {
      return res.status(400).json({ success: false, message: 'That email address is already in use by another account' });
    }

    // Find the user
    db.query('SELECT * FROM users WHERE id = ?', [userId], (err, results) => {
      if (err || !results.length) {
        return res.status(404).json({ success: false, message: 'User not found' });
      }

      const user = results[0];
      // Generate 6-digit OTP + 5min expiry
      const otp_code = Math.floor(100000 + Math.random() * 900000).toString();
      const otp_expires = new Date(Date.now() + 5 * 60 * 1000);

      db.query(
        'UPDATE users SET otp_code = ?, otp_expires = ? WHERE id = ?',
        [otp_code, otp_expires, userId],
        (updateErr) => {
          if (updateErr) return res.status(500).json({ success: false, message: 'Failed to generate OTP' });

          console.log('[DEBUG] Email Change OTP for', user.email, ':', otp_code);

          // Send OTP to the CURRENT email
          const html = buildEmailHtml(`
              <h2 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#C19A6B;text-align:center;">Email Change Request</h2>
              <p style="margin:0 0 20px;font-size:13px;color:#64748b;text-align:center;">Authorization code required</p>
              <p style="margin:0 0 16px;">We received a request to change the email address on your InkVistAR account. Enter the verification code below to authorize this change:</p>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td align="center" style="padding:20px 0;">
                <div style="display:inline-block;background-color:#1a1a1a;border:2px solid rgba(193,154,107,0.3);border-radius:12px;padding:16px 32px;">
                  <span style="font-size:36px;font-weight:800;letter-spacing:12px;color:#C19A6B;font-family:'Courier New',monospace;">${otp_code}</span>
                </div>
              </td></tr></table>
              <p style="margin:0 0 8px;font-size:13px;color:#94a3b8;text-align:center;">This code expires in <strong style="color:#334155;">5 minutes</strong>.</p>
              <p style="margin:0;font-size:12px;color:#555;text-align:center;">If you did not request this change, you can safely ignore this email. Your account remains secure.</p>
          `);
          sendEmail(user.email, 'InkVistAR: Email Change Authorization Code', html);

          res.json({ success: true, message: 'Authorization code sent to your current email address.' });
        }
      );
    });
  });
});

// ========== CONFIRM EMAIL CHANGE (verify OTP, update email, force re-verification) ==========
app.post('/api/confirm-email-change', (req, res) => {
  const { userId, otp, newEmail } = req.body;
  console.log('[INFO] Confirming email change for user ID:', userId, '→', newEmail);

  if (!userId || !otp || !newEmail) {
    return res.status(400).json({ success: false, message: 'User ID, OTP, and new email are required' });
  }

  db.query('SELECT * FROM users WHERE id = ?', [userId], (err, results) => {
    if (err || !results.length) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    const user = results[0];

    // Validate OTP
    if (user.otp_code !== otp) {
      return res.status(400).json({ success: false, message: 'Invalid authorization code' });
    }

    if (new Date() > new Date(user.otp_expires)) {
      return res.status(400).json({ success: false, message: 'Authorization code has expired. Please request a new one.' });
    }

    // Check if new email is still available
    db.query('SELECT id FROM users WHERE email = ? AND id != ?', [newEmail, userId], (checkErr, existing) => {
      if (checkErr) return res.status(500).json({ success: false, message: 'Database error' });
      if (existing.length > 0) {
        return res.status(400).json({ success: false, message: 'That email address is already in use' });
      }

      // Generate new verification token for the new email
      const verification_token = crypto.randomBytes(32).toString('hex');

      db.query(
        'UPDATE users SET email = ?, is_verified = 0, verification_token = ?, otp_code = NULL, otp_expires = NULL WHERE id = ?',
        [newEmail, verification_token, userId],
        (updateErr) => {
          if (updateErr) {
            console.error('[ERROR] Error updating email:', updateErr);
            return res.status(500).json({ success: false, message: 'Failed to update email' });
          }

          logAction(userId, 'EMAIL_CHANGED', `Email changed from ${user.email} to ${newEmail} — re-verification required`, req.ip || '::1');
          createNotification(userId, 'Email Changed', `Your email address has been successfully updated to ${newEmail}.`, 'email_change');

          // Send verification email to the NEW address
          const protocol = getProtocol(req);
          const host = req.get('host');
          const verifyUrl = `${protocol}://${host}/api/verify?token=${verification_token}&email=${newEmail}`;
          console.log('[DEBUG] New Email Verification Link:', verifyUrl);

          const html = buildEmailHtml(`
              <h2 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#C19A6B;text-align:center;">Verify Your New Email</h2>
              <p style="margin:0 0 20px;font-size:13px;color:#64748b;text-align:center;">Your email address has been updated</p>
              <p style="margin:0 0 16px;">Your InkVistAR account email has been changed to this address. Please verify it below to re-activate your account.</p>
              <p style="margin:0 0 24px;font-size:13px;color:#94a3b8;">If you did not make this change, please contact our support team immediately.</p>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td align="center">
                <a href="${verifyUrl}" style="display:inline-block;padding:14px 36px;background:linear-gradient(135deg,#C19A6B,#8a6c4a);color:#000;font-size:14px;font-weight:700;text-decoration:none;border-radius:8px;letter-spacing:1px;text-transform:uppercase;">Verify New Email</a>
              </td></tr></table>
              <p style="margin:24px 0 0;font-size:12px;color:#555;text-align:center;word-break:break-all;">Or copy this link: <a href="${verifyUrl}" style="color:#C19A6B;text-decoration:none;">${verifyUrl}</a></p>
          `);
          sendEmail(newEmail, 'InkVistAR: Verify Your New Email Address', html);

          res.json({ success: true, message: 'Email updated! Please check your new email to verify and re-activate your account.', requireReverification: true });
        }
      );
    });
  });
});

// Save Push Token
app.put('/api/users/:id/push-token', (req, res) => {
  const { id } = req.params;
  const { pushToken } = req.body;

  if (!pushToken) return res.status(400).json({ success: false, message: 'Push token required' });

  db.query('UPDATE users SET push_token = ? WHERE id = ?', [pushToken, id], (err) => {
    if (err) return res.status(500).json({ success: false, message: 'Database error' });
    res.json({ success: true, message: 'Push token updated' });
  });
});

// ========== DEBUG/GLOBAL USER ENDPOINTS ==========
app.get('/api/debug/users', (req, res) => {
  db.query('SELECT id, name, user_type FROM users WHERE is_deleted = 0', (err, results) => {
    if (err) return res.status(500).json({ success: false, message: 'Database error' });
    res.json({ success: true, users: results });
  });
});

// ========== OTP ENDPOINTS ==========

app.post('/api/send-otp', (req, res) => {
  // otp_method: 'email' (default) or 'sms'
  const { email, user_type, otp_method = 'email' } = req.body;
  console.log(`[INFO] SEND OTP: ${email} via ${otp_method}`);

  db.query('SELECT * FROM users WHERE email = ?', [email], async (err, results) => {
    if (err || !results.length) {
      return res.json({ success: false, message: 'Account not found' });
    }

    const user = results[0];

    // Allow OTP for both verified users (password reset) and unverified users (account verification)
    // No verification gate — OTP is the verification mechanism itself

    // If user already has a valid, unexpired OTP (e.g. from registration), skip sending a new one
    // to avoid duplicate emails. Only applies to email-based OTP (not SMS which is always re-sent).
    if (otp_method === 'email' && user.otp_code && user.otp_expires && new Date(user.otp_expires) > new Date()) {
      console.log(`[INFO] Existing valid OTP found for ${email} — skipping duplicate email send.`);
      return res.json({ success: true, message: 'OTP sent to your email!', reused: true });
    }

    // Validate SMS method requires a phone number
    if (otp_method === 'sms' && !user.phone) {
      return res.json({ success: false, message: 'No phone number on file. Please use email OTP.' });
    }

    // Generate 6-digit OTP + 5min expiry
    const otp_code = Math.floor(100000 + Math.random() * 900000).toString();
    const otp_expires = new Date(Date.now() + 5 * 60 * 1000);

    db.query(
      'UPDATE users SET otp_code = ?, otp_expires = ? WHERE email = ?',
      [otp_code, otp_expires, email],
      (updateErr) => {
        if (updateErr) return res.json({ success: false, message: 'DB error' });

        console.log('[DEBUG] OTP for', email, ':', otp_code);

        if (otp_method === 'sms') {
          res.json({ success: true, message: 'OTP sent to your phone!' });
          sendSMS(user.phone, otpMessage(otp_code));
        } else {
          res.json({ success: true, message: 'OTP sent to your email!' });
          const html = buildEmailHtml(`
              <h2 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#C19A6B;text-align:center;">Verification Code</h2>
              <p style="margin:0 0 20px;font-size:13px;color:#64748b;text-align:center;">Account security verification</p>
              <p style="margin:0 0 16px;">A one-time verification code was requested for your InkVistAR account. Enter the code below to continue:</p>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td align="center" style="padding:20px 0;">
                <div style="display:inline-block;background-color:#1a1a1a;border:2px solid rgba(193,154,107,0.3);border-radius:12px;padding:16px 32px;">
                  <span style="font-size:36px;font-weight:800;letter-spacing:12px;color:#C19A6B;font-family:'Courier New',monospace;">${otp_code}</span>
                </div>
              </td></tr></table>
              <p style="margin:0 0 8px;font-size:13px;color:#94a3b8;text-align:center;">This code expires in <strong style="color:#334155;">5 minutes</strong>.</p>
              <p style="margin:0;font-size:12px;color:#555;text-align:center;">Do not share this code with anyone. InkVistAR will never ask for your code via phone or message.</p>
          `);
          sendEmail(email, 'InkVistAR - Your OTP Code', html);
        }
      }
    );
  });
});

// ── Push Token Registration ──────────────────────────────────────
app.post('/api/push/register', (req, res) => {
  const { user_id, token, platform } = req.body;
  if (!user_id || !token) return res.json({ success: false, message: 'user_id and token required' });

  db.query(
    `INSERT INTO user_push_tokens (user_id, token, platform)
     VALUES (?, ?, ?)
     ON DUPLICATE KEY UPDATE token = VALUES(token), updated_at = ?`,
    [user_id, token, platform || 'android', getLocalDatetime()],
    (err) => {
      if (err) {
        console.error('[PUSH] Token registration error:', err.message);
        return res.json({ success: false, message: err.message });
      }
      console.log(`[PUSH] [OK] Token registered for user ${user_id} (${platform})`);
      res.json({ success: true });
    }
  );
});

// ── Send Expo Push Notification (internal helper) ────────────────
async function sendPushNotification(userId, title, body, data = {}) {
  db.query('SELECT token FROM user_push_tokens WHERE user_id = ?', [userId], async (err, rows) => {
    if (err) { console.error('[PUSH] [ERROR] DB error fetching token:', err.message); return; }
    if (!rows.length) { console.warn(`[PUSH] [WARN] No token found for user ${userId} — skipping push`); return; }
    const token = rows[0].token;
    console.log(`[PUSH] [INFO] Token for user ${userId}: ${token.substring(0, 40)}...`);
    if (!token.startsWith('ExponentPushToken')) {
      console.warn('[PUSH] [WARN] Token is not an Expo push token — skipping');
      return;
    }
    try {
      const response = await fetch('https://exp.host/--/api/v2/push/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify({ to: token, title, body, data, sound: 'default' }),
      });
      const result = await response.json();
      console.log(`[PUSH] [OK] Expo API response for user ${userId}:`, JSON.stringify(result));
    } catch (e) {
      console.error('[PUSH] [ERROR] Send error:', e.message);
    }
  });
}

// ── Push Debug Endpoint (test manually) ──────────────────────────
app.get('/api/push/debug/:userId', (req, res) => {
  const { userId } = req.params;
  db.query('SELECT token, platform, updated_at FROM user_push_tokens WHERE user_id = ?', [userId], (err, rows) => {
    if (err) return res.json({ success: false, error: err.message });
    if (!rows.length) return res.json({ success: false, message: `No push token registered for user ${userId}` });
    res.json({ success: true, token: rows[0].token, platform: rows[0].platform, updated_at: rows[0].updated_at });
  });
});

app.post('/api/push/test-send/:userId', async (req, res) => {
  const { userId } = req.params;
  await sendPushNotification(userId, 'Test Notification', 'Push notifications are working!', {});
  res.json({ success: true, message: `Push attempted for user ${userId}. Check Railway logs.` });
});

app.post('/api/verify-otp', (req, res) => {
  const { email, otp, user_type } = req.body;
  // Handle both 'otp' and 'otp_code' from frontend
  const code = otp || req.body.otp_code;

  console.log('[INFO] VERIFY OTP:', email, code);

  let query = 'SELECT * FROM users WHERE email = ? AND otp_code = ? AND otp_expires > NOW()';
  let params = [email, code];

  // If user_type is provided, enforce it (backward compatibility)
  if (user_type) {
    query += ' AND user_type = ?';
    params.push(user_type);
  }

  db.query(query, params, (err, results) => {
    if (err || !results.length) {
      return res.json({ success: false, message: 'Invalid or expired OTP' });
    }

    // Clear OTP after success
    db.query('UPDATE users SET otp_code = NULL, otp_expires = NULL WHERE email = ?', [email]);

    // If purpose is account verification, mark user as verified
    if (req.body.purpose === 'account-verification') {
      db.query('UPDATE users SET is_verified = 1 WHERE email = ?', [email]);
      console.log('[OK] Account verified via OTP:', email);
    }

    console.log('[OK] OTP VERIFIED:', email);
    res.json({
      success: true,
      user: {
        id: results[0].id,
        name: results[0].name,
        email: results[0].email,
        type: results[0].user_type
      }
    });
  }
  );
});

// VERIFY endpoint
app.get('/api/verify', (req, res) => {
  const { token, email } = req.query;
  console.log('VERIFY:', email, token ? 'OK' : 'NO TOKEN');

  db.query('UPDATE users SET is_verified = 1, verification_token = NULL WHERE email = ? AND verification_token = ?', [email, token], (err, result) => {
    if (err || result.affectedRows === 0) {
      return res.send(`
        <!DOCTYPE html>
        <html lang="en">
          <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Verification Error</title>
            <style>
               @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@600;700&family=Inter:wght@400;500;600&display=swap');
              body { font-family: 'Inter', sans-serif; display: flex; justify-content: center; align-items: center; height: 100vh; background-color: #050505; color: #f8fafc; margin: 0; padding: 20px; box-sizing: border-box; }
              .container { text-align: center; background: #111111; padding: 50px 40px; border-radius: 20px; border: 1px solid rgba(239, 68, 68, 0.2); box-shadow: 0 20px 40px rgba(0,0,0,0.5); max-width: 440px; width: 100%; position: relative; overflow: hidden; }
              .container::before { content: ''; position: absolute; top: 0; left: 0; right: 0; height: 4px; background: linear-gradient(90deg, #ef4444, #991b1b, #ef4444); }
              h2 { display: flex; align-items: center; justify-content: center; gap: 10px; font-family: 'Playfair Display', serif; color: #ef4444; margin-top: 0; margin-bottom: 16px; font-size: 1.8rem; letter-spacing: 0.5px; }
              p { color: #94a3b8; margin-bottom: 32px; line-height: 1.6; font-size: 0.95rem; font-weight: 400; }
              .btn { background: transparent; color: #ef4444; padding: 14px 28px; text-decoration: none; border-radius: 8px; font-weight: 600; display: inline-block; transition: all 0.3s ease; border: 1.5px solid #ef4444; letter-spacing: 0.5px; font-size: 0.95rem; }
              .btn:hover { background: #ef4444; color: #050505; }
              .icon-wrapper { margin-bottom: 24px; display: inline-flex; justify-content: center; align-items: center; width: 64px; height: 64px; border-radius: 50%; background: rgba(239, 68, 68, 0.1); border: 1px solid rgba(239, 68, 68, 0.2); color: #ef4444; }
            </style>
          </head>
          <body>
            <div class="container">
              <div class="icon-wrapper">
                <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>
              </div>
              <h2>Link Expired</h2>
              <p>This verification link is invalid or has already expired. Please request a new link.</p>
              <a href="${FRONTEND_URL}/login" class="btn">Return to Login</a>
            </div>
          </body>
        </html>
      `);
    }
    console.log('VERIFIED:', email);
    const loginUrl = `${FRONTEND_URL}/login`;

    res.send(`
      <!DOCTYPE html>
      <html lang="en">
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Email Verified</title>
          <style>
            @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@600;700&family=Inter:wght@400;500;600&display=swap');
            body { font-family: 'Inter', sans-serif; display: flex; justify-content: center; align-items: center; height: 100vh; background-color: #050505; color: #f8fafc; margin: 0; padding: 20px; box-sizing: border-box; }
            .container { text-align: center; background: #111111; padding: 50px 40px; border-radius: 20px; border: 1px solid rgba(218, 165, 32, 0.2); box-shadow: 0 20px 40px rgba(0,0,0,0.5); max-width: 440px; width: 100%; position: relative; overflow: hidden; }
            .container::before { content: ''; position: absolute; top: 0; left: 0; right: 0; height: 4px; background: linear-gradient(90deg, #be9055, #daa520, #be9055); }
            h2 { display: flex; align-items: center; justify-content: center; gap: 10px; font-family: 'Playfair Display', serif; color: #daa520; margin-top: 0; margin-bottom: 16px; font-size: 2rem; letter-spacing: 0.5px; }
            p { color: #94a3b8; margin-bottom: 32px; line-height: 1.6; font-size: 0.95rem; font-weight: 400; }
            .btn { background: transparent; color: #daa520; padding: 14px 28px; text-decoration: none; border-radius: 8px; font-weight: 600; display: inline-block; transition: all 0.3s ease; border: 1.5px solid #daa520; letter-spacing: 0.5px; font-size: 0.95rem; }
            .btn:hover { background: #daa520; color: #050505; }
            .icon-wrapper { margin-bottom: 24px; display: inline-flex; justify-content: center; align-items: center; width: 64px; height: 64px; border-radius: 50%; background: rgba(218, 165, 32, 0.1); border: 1px solid rgba(218, 165, 32, 0.2); color: #daa520; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="icon-wrapper">
              <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
            </div>
            <h2>Verified</h2>
            <p>Your email address has been successfully verified. Your account is now active and ready to use.</p>
            <a href="${loginUrl}" class="btn">Continue to Login</a>
          </div>
        </body>
      </html>
    `);
  });
});

// ========== REGISTER ENDPOINT ==========
app.post('/api/register', async (req, res) => {
  try {
    console.log('\n[INFO] ========== REGISTER REQUEST ==========');
    console.log('[DEBUG] Request body:', req.body);

    const { firstName, lastName, suffix, name, email, password, type, phone, preferences, orphanAppointmentId, photo_marketing_consent, email_promo_consent, captchaToken, health_conditions, allergens } = req.body;

    // Verify reCAPTCHA
    const captchaValid = await verifyCaptcha(captchaToken);
    if (!captchaValid) {
      return res.status(400).json({ success: false, message: 'CAPTCHA verification failed. Please try again.' });
    }

    // Handle combined name if firstName/lastName not provided (backward compatibility)
    const fullName = (firstName && lastName)
      ? `${firstName} ${lastName}${suffix ? ' ' + suffix : ''}`
      : (name || 'Unknown User');

    // Validation
    if (!fullName || !email || !password || !type) {
      console.log('[ERROR] Missing fields');
      return res.status(400).json({
        success: false,
        message: 'All fields are required'
      });
    }

    // Check if user already exists
    db.query('SELECT * FROM users WHERE email = ?', [email], async (err, results) => {
      if (err) {
        console.error('[ERROR] Database error checking user:', err.message);
        return res.status(500).json({
          success: false,
          message: 'Database error'
        });
      }

      if (results.length > 0) {
        console.log('[ERROR] User already exists:', email);
        return res.status(400).json({
          success: false,
          message: 'Email already registered'
        });
      }

      // Hash password
      console.log('[DEBUG] Hashing password...');
      const password_hash = await bcrypt.hash(password, 10);
      console.log('[OK] Password hashed successfully');

      // Insert user
      const verification_token = crypto.randomBytes(32).toString('hex');

      // Consent defaults: photo=1 (opted-in unless unchecked), email_promo=0 (opted-out unless checked)
      const photoConsent = photo_marketing_consent !== undefined ? (photo_marketing_consent ? 1 : 0) : 1;
      const emailConsent = email_promo_consent !== undefined ? (email_promo_consent ? 1 : 0) : 0;

      const insertQuery = 'INSERT INTO users (name, email, password_hash, user_type, is_verified, verification_token, photo_marketing_consent, email_promo_consent) VALUES (?, ?, ?, ?, 0, ?, ?, ?)';
      console.log('[DEBUG] Executing query:', insertQuery);

      db.query(insertQuery, [fullName, email, password_hash, type, verification_token, photoConsent, emailConsent], (insertErr, result) => {
        if (insertErr) {
          console.error('[ERROR] Error inserting user:', insertErr.message);
          return res.status(500).json({
            success: false,
            message: `Database error: ${insertErr.message}`
          });
        }

        console.log('[OK] User inserted successfully!');
        console.log('[OK] Insert ID:', result.insertId);

        logAction(result.insertId, 'REGISTER', `New ${type} account registered: ${email}`, req.ip || '::1');

        const newUserId = result.insertId;
        // Send Verification Email
        const protocol = getProtocol(req);
        const host = req.get('host');
        const verifyUrl = `${protocol}://${host}/api/verify?token=${verification_token}&email=${email}`;

        // Generate OTP at registration time so the user has it immediately
        // (avoids a second email when they try to login unverified)
        const reg_otp_code = Math.floor(100000 + Math.random() * 900000).toString();
        const reg_otp_expires = new Date(Date.now() + 5 * 60 * 1000); // 5 min for registration OTP
        db.query('UPDATE users SET otp_code = ?, otp_expires = ? WHERE id = ?', [reg_otp_code, reg_otp_expires, newUserId]);

        // LOG VERIFICATION LINK (Fix for development/Gmail issues)
        console.log('[DEBUG] Verification Link:', verifyUrl);
        console.log('[DEBUG] Registration OTP:', reg_otp_code);

        const html = buildEmailHtml(`
              <h2 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#C19A6B;text-align:center;">Welcome, ${fullName}!</h2>
              <p style="margin:0 0 20px;font-size:13px;color:#64748b;text-align:center;">Just one step to get started</p>
              <p style="margin:0 0 16px;">Thank you for creating your InkVistAR account. Your creative journey is almost ready to begin — verify your email address using the code below:</p>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td align="center" style="padding:20px 0;">
                <div style="display:inline-block;background-color:#1a1a1a;border:2px solid rgba(193,154,107,0.3);border-radius:12px;padding:16px 32px;">
                  <span style="font-size:36px;font-weight:800;letter-spacing:12px;color:#C19A6B;font-family:'Courier New',monospace;">${reg_otp_code}</span>
                </div>
              </td></tr></table>
              <p style="margin:0 0 16px;font-size:13px;color:#94a3b8;text-align:center;">This code expires in <strong style="color:#334155;">5 minutes</strong>.</p>
              <p style="margin:0 0 20px;font-size:12px;color:#555;text-align:center;">You can also verify by clicking the button below:</p>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td align="center">
                <a href="${verifyUrl}" style="display:inline-block;padding:12px 28px;background:linear-gradient(135deg,#C19A6B,#8a6c4a);color:#000;font-size:13px;font-weight:700;text-decoration:none;border-radius:8px;letter-spacing:0.5px;text-transform:uppercase;">Verify via Link</a>
              </td></tr></table>
              <p style="margin:16px 0 0;font-size:11px;color:#555;text-align:center;">Do not share this code with anyone. InkVistAR will never ask for your code via phone or message.</p>
        `);
        sendEmail(email, 'Verify Your InkVistAR Account', html);

        // If the user is an artist, create a corresponding entry in the 'artists' table
        if (type === 'artist') {
          const artistQuery = 'INSERT INTO artists (user_id, studio_name, experience_years, specialization, hourly_rate) VALUES (?, ?, ?, ?, ?)';
          // Using some default values
          db.query(artistQuery, [newUserId, `${fullName}'s Studio`, 0, 'New Artist', 50.00], (artistErr, artistResult) => {
            if (artistErr) {
              console.error('[ERROR] Error creating artist profile:', artistErr.message);
              // Rollback: Delete the user if artist profile creation fails
              db.query('DELETE FROM users WHERE id = ?', [newUserId]);
              return res.status(500).json({ success: false, message: 'Failed to create artist profile. Please try again.' });
            }
            console.log('[OK] Artist profile created for user ID:', newUserId);
            sendSuccessResponse(newUserId);
          });
        } else if (type === 'customer') {
          // Create customer profile with phone, preferences, and optional health data
          const safeHealthConditions = Array.isArray(health_conditions) ? JSON.stringify(health_conditions) : '[]';
          const safeAllergens = Array.isArray(allergens) ? JSON.stringify(allergens) : '[]';
          const customerQuery = 'INSERT INTO customers (user_id, phone, notes, health_conditions, allergens) VALUES (?, ?, ?, ?, ?)';
          db.query(customerQuery, [newUserId, phone || '', preferences || '', safeHealthConditions, safeAllergens], (custErr) => {
            if (custErr) {
              console.error('[ERROR] Error creating customer profile:', custErr.message);
            } else {
              console.log('[OK] Customer profile created for user ID:', newUserId);
            }
            sendSuccessResponse(newUserId);
          });
        } else {
          sendSuccessResponse(newUserId);
        }

        function sendSuccessResponse(userId) {
          // Claim a specific orphan appointment (from session storage)
          if (orphanAppointmentId) {
            db.query('UPDATE appointments SET customer_id = ?, is_guest_placeholder = 0 WHERE id = ?', [userId, orphanAppointmentId], (updateErr) => {
              if (updateErr) console.error('Error claiming orphan appointment during registration:', updateErr);
              else {
                db.query("SELECT id FROM users WHERE user_type = 'admin' ORDER BY id ASC LIMIT 1", (err, results) => {
                  const actualAdminId = (results && results.length > 0) ? results[0].id : 1;
                  createNotification(actualAdminId, 'Booking Claimed', `New user ${fullName} registered and claimed their pending booking request.`, 'appointment_request', orphanAppointmentId);
                });
              }
            });
          }

          // ═══ Migrate ALL orphan appointments by guest_email match ═══
          db.query(
            'UPDATE appointments SET customer_id = ?, is_guest_placeholder = 0 WHERE guest_email = ? AND customer_id != ? AND is_deleted = 0',
            [userId, email, userId],
            (migErr, migResult) => {
              const migratedCount = migResult ? migResult.affectedRows : 0;
              if (migratedCount > 0) {
                console.log(`[INFO] Migrated ${migratedCount} orphan appointment(s) to new user ${fullName} (${email})`);
                createNotification(userId, 'Prior Bookings Found!', `We found ${migratedCount} consultation request(s) linked to your email from before you created your account. They have been automatically added to your account.`, 'appointment_request');
              }

              res.json({
                success: true,
                message: 'Account created! Please check your email to verify.',
                user: {
                  id: userId,
                  name: fullName,
                  email: email,
                  type: type
                },
                migratedCount: migratedCount
              });
            }
          );
        }
      });
    });

  } catch (error) {
    console.error('[ERROR] Unexpected error in register:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});
// ========== MARKETING EMAIL BROADCAST ==========
app.post('/api/admin/broadcast-marketing-email', (req, res) => {
  let { subject, body, imageBase64 } = req.body;
  if (!subject || !body) {
    return res.status(400).json({ success: false, message: 'Subject and body are required.' });
  }

  // Truncate lengths
  subject = subject.substring(0, 150);
  body = body.substring(0, 5000);

  // Build the promo image block if provided
  const imageHtml = imageBase64
    ? `<div style="margin:16px 0 20px;text-align:center;">
         <img src="${imageBase64}" alt="Promo" style="max-width:100%;height:auto;border-radius:12px;display:block;margin:0 auto;" />
       </div>`
    : '';

  // Query all users who opted in to email promos
  db.query("SELECT email, name FROM users WHERE email_promo_consent = 1 AND is_deleted = 0 AND is_verified = 1", (err, subscribers) => {
    if (err) {
      console.error('Error fetching subscribers:', err.message);
      return res.status(500).json({ success: false, message: 'Database error.' });
    }

    if (subscribers.length === 0) {
      return res.json({ success: true, message: 'No subscribed users found.', sent: 0 });
    }

    let sentCount = 0;
    let errorCount = 0;

    const promises = subscribers.map(sub => {
      const html = buildEmailHtml(`
        <h2 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#C19A6B;text-align:center;">${subject}</h2>
        <p style="margin:0 0 12px;font-size:13px;color:#64748b;text-align:center;">Exclusive for you, ${sub.name.split(' ')[0]}!</p>
        ${imageHtml}
        <div style="margin:16px 0;font-size:14px;color:#333;line-height:1.7;">${body.replace(/\n/g, '<br/>')}</div>
        <p style="margin:20px 0 0;font-size:11px;color:#aaa;text-align:center;">You are receiving this email because you opted in to marketing communications from Inkvictus Tattoo & Piercing. To unsubscribe, update your preferences in your account settings.</p>
      `);
      return sendEmail(sub.email, subject, html)
        .then(() => { sentCount++; })
        .catch(() => { errorCount++; });
    });

    Promise.all(promises).then(() => {
      console.log(`Marketing broadcast complete: ${sentCount} sent, ${errorCount} failed`);
      res.json({ success: true, message: `Broadcast sent to ${sentCount} subscriber(s).`, sent: sentCount, failed: errorCount });
    });
  });
});

// ========== CUSTOMER CONSENT LOOKUP (for artists) ==========
app.get('/api/customer/:customerId/consent', (req, res) => {
  const { customerId } = req.params;
  db.query("SELECT photo_marketing_consent, email_promo_consent FROM users WHERE id = ?", [customerId], (err, results) => {
    if (err) {
      return res.status(500).json({ success: false, message: 'Database error.' });
    }
    if (results.length === 0) {
      return res.status(404).json({ success: false, message: 'User not found.' });
    }
    res.json({ success: true, photo_marketing_consent: results[0].photo_marketing_consent === 1, email_promo_consent: results[0].email_promo_consent === 1 });
  });
});

// ========== ARTIST DASHBOARD (SIMPLIFIED) ==========
app.get('/api/artist/dashboard/:artistId', (req, res) => {
  const { artistId } = req.params;
  console.log(`[INFO] Artist dashboard requested: ${artistId}`);

  // Add timeout
  const timeout = setTimeout(() => {
    console.log('[ERROR] Dashboard query timeout');
    return res.status(500).json({
      success: false,
      message: 'Request timeout'
    });
  }, 5000);

  // SIMPLE query that works with current DB structure
  const query = `
    SELECT
      u.id,
      u.name,
      u.email,
      u.phone,
      u.user_type,
      COALESCE(a.studio_name, 'My Studio') as studio_name,
      COALESCE(a.experience_years, 0) as experience_years,
      COALESCE(a.specialization, 'General Artist') as specialization,
      COALESCE(a.hourly_rate, 0) as hourly_rate,
      COALESCE(a.commission_rate, 0.30) as commission_rate,
      COALESCE(a.rating, 0) as rating,
      COALESCE(a.total_reviews, 0) as total_reviews,
      a.profile_image,
      a.bio
    FROM users u
    LEFT JOIN artists a ON u.id = a.user_id
    WHERE u.id = ? AND u.user_type = 'artist'
  `;

  console.log('[DEBUG] Executing query:', query, [artistId]);

  db.query(query, [artistId], (err, results) => {
    clearTimeout(timeout);

    if (err) {
      console.error('[ERROR] Database error:', err.message);
      console.error('[ERROR] Full error:', err);

      // Return a proper error instead of mock data
      return res.status(500).json({
        success: false,
        message: `Database error fetching artist dashboard: ${err.message}`
      });
    }

    console.log(`[INFO] Query results: ${results.length} rows`);

    if (results.length === 0) {
      console.log('[ERROR] No artist found');
      return res.status(404).json({
        success: false,
        message: 'Artist not found'
      });
    }

    const artist = results[0];
    console.log('[OK] Artist found:', artist.name);

    // Fetch appointments
    const appointmentsQuery = `
      SELECT 
        ap.id, 
        ap.appointment_date, 
        ap.start_time, 
        ap.end_time,
        ap.design_title, 
        ap.status,
        ap.price,
        ap.payment_status,
        u.name as client_name
      FROM appointments ap
      JOIN users u ON ap.customer_id = u.id
      WHERE ap.artist_id = ? AND ap.status != 'cancelled' AND ap.is_deleted = 0
      ORDER BY ap.appointment_date ASC, ap.start_time ASC
    `;

    db.query(appointmentsQuery, [artistId], (apptErr, apptResults) => {
      const appointments = apptResults || [];
      const commissionRate = artist.commission_rate || 0.30;

      // Calculate earnings correctly (Completed & Paid only, net of commission)
      // Robust case-insensitive comparison
      const paidCompletedAppts = appointments.filter(apt =>
        (apt.status || '').toLowerCase() === 'completed' &&
        (apt.payment_status || '').toLowerCase() === 'paid'
      );

      const totalEarnings = paidCompletedAppts.reduce((sum, apt) =>
        sum + (parseFloat(apt.price || 0) * commissionRate), 0
      );

      // Current month earnings
      const now = new Date();
      const currentMonthEarnings = paidCompletedAppts.filter(apt => {
        const aptDate = new Date(apt.appointment_date);
        return aptDate.getMonth() === now.getMonth() && aptDate.getFullYear() === now.getFullYear();
      }).reduce((sum, apt) => sum + (parseFloat(apt.price || 0) * commissionRate), 0);

      // Fetch portfolio works
      db.query('SELECT * FROM portfolio_works WHERE artist_id = ? AND is_deleted = 0 ORDER BY created_at DESC LIMIT 10', [artistId], (worksErr, worksResults) => {
        const works = worksResults || [];

        // Fetch notifications for dashboard
        db.query('SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 20', [artistId], (notifErr, notifResults) => {
          const notifications = notifResults || [];
          const unreadCount = notifications.filter(n => !n.is_read).length;

          // Return success with calculated stats
          res.json({
            success: true,
            artist: {
              id: artist.id,
              name: artist.name,
              email: artist.email,
              phone: artist.phone,
              studio_name: artist.studio_name,
              experience_years: artist.experience_years,
              specialization: artist.specialization,
              hourly_rate: artist.hourly_rate,
              commission_rate: artist.commission_rate,
              rating: Number(artist.rating),
              total_reviews: artist.total_reviews,
              profile_image: artist.profile_image
            },
            appointments: appointments,
            works: works,
            stats: {
              total_appointments: appointments.length,
              total_earnings: totalEarnings,
              monthly_earnings: currentMonthEarnings,
              avg_rating: Number(artist.rating)
            },
            notifications: notifications,
            unreadCount: unreadCount
          });
        });
      });
    });
  });
});

// ========== ARTIST SPECIFIC ENDPOINTS ==========

// Get artist's appointments
app.get('/api/artist/:artistId/appointments', (req, res) => {
  const { artistId } = req.params;
  const { status, date } = req.query;

  let query = `
    SELECT 
      ap.*,
      u.name as client_name,
      u.email as client_email,
      ar.commission_rate,
      cust.health_conditions as client_health_conditions,
      cust.allergens as client_allergens,
      (SELECT COALESCE(SUM(sm.quantity * i.cost), 0) FROM session_materials sm JOIN inventory i ON sm.inventory_id = i.id WHERE sm.appointment_id = ap.id AND sm.status != 'released') as total_material_cost,
      tp.status as project_status,
      tp.total_sessions_planned as project_sessions_planned,
      tp.total_sessions_actual as project_sessions_actual,
      CASE
        WHEN ap.artist_id = ? AND ap.secondary_artist_id = ? THEN 'both'
        WHEN ap.artist_id = ? THEN 'tattoo'
        WHEN ap.secondary_artist_id = ? THEN 'piercing'
        ELSE 'primary'
      END as assigned_role
    FROM appointments ap
    JOIN users u ON ap.customer_id = u.id
    LEFT JOIN artists ar ON ap.artist_id = ar.user_id
    LEFT JOIN customers cust ON ap.customer_id = cust.user_id
    LEFT JOIN tattoo_projects tp ON ap.project_id = tp.id
    WHERE (ap.artist_id = ? OR ap.secondary_artist_id = ?) AND ap.is_deleted = 0
  `;

  const params = [artistId, artistId, artistId, artistId, artistId, artistId];

  if (status) {
    query += ' AND ap.status = ?';
    params.push(status);
  }

  if (date) {
    query += ' AND ap.appointment_date = ?';
    params.push(date);
  }

  query += ' ORDER BY ap.appointment_date, ap.start_time';

  db.query(query, params, (err, results) => {
    if (err) {
      console.error('[ERROR] Error fetching appointments:', err);
      return res.status(500).json({ success: false, message: 'DB Error (Get Appts): ' + err.message });
    }
    // Parse health JSON arrays on each row
    results.forEach(row => {
      try { row.client_health_conditions = JSON.parse(row.client_health_conditions || '[]'); } catch { row.client_health_conditions = []; }
      try { row.client_allergens = JSON.parse(row.client_allergens || '[]'); } catch { row.client_allergens = []; }
    });
    res.json({ success: true, appointments: results });
  });
});

// GET project timeline — all sessions in a project (used by Admin + Artist views)
app.get('/api/appointments/:id/project-timeline', (req, res) => {
  const { id } = req.params;

  // First, get the project_id for this appointment
  db.query('SELECT project_id FROM appointments WHERE id = ? AND is_deleted = 0', [id], (err, rows) => {
    if (err) return res.status(500).json({ success: false, message: 'DB Error' });
    if (!rows.length) return res.status(404).json({ success: false, message: 'Appointment not found' });

    const projectId = rows[0].project_id;
    if (!projectId) {
      return res.json({ success: true, project: null, sessions: [] });
    }

    // Fetch project metadata
    db.query('SELECT * FROM tattoo_projects WHERE id = ?', [projectId], (projErr, projRows) => {
      if (projErr) return res.status(500).json({ success: false, message: 'DB Error (project)' });
      const project = projRows[0] || null;

      // Fetch all sessions in this project ordered by session_number
      const sessionsQuery = `
        SELECT ap.id, ap.session_number, ap.status, ap.appointment_date, ap.start_time,
               ap.booking_code, u_art.name as artist_name
        FROM appointments ap
        JOIN users u_art ON ap.artist_id = u_art.id
        WHERE ap.project_id = ? AND ap.is_deleted = 0
        ORDER BY ap.session_number ASC, ap.appointment_date ASC
      `;
      db.query(sessionsQuery, [projectId], (sessErr, sessions) => {
        if (sessErr) return res.status(500).json({ success: false, message: 'DB Error (sessions)' });
        res.json({ success: true, project, sessions });
      });
    });
  });
});

// PUT mark a tattoo project as completed early
app.put('/api/projects/:projectId/complete-early', (req, res) => {
  const { projectId } = req.params;
  const { completedAtSession } = req.body;

  if (!completedAtSession || isNaN(parseInt(completedAtSession))) {
    return res.status(400).json({ success: false, message: 'completedAtSession is required and must be a number' });
  }

  db.query(
    `UPDATE tattoo_projects SET status = 'completed_early', total_sessions_actual = ? WHERE id = ? AND status = 'active'`,
    [parseInt(completedAtSession), projectId],
    (err, result) => {
      if (err) return res.status(500).json({ success: false, message: 'DB Error: ' + err.message });
      if (result.affectedRows === 0) {
        return res.status(404).json({ success: false, message: 'Project not found or already completed' });
      }
      res.json({ success: true, message: 'Project marked as completed early' });
    }
  );
});

// Get artist's clients
app.get('/api/artist/:artistId/clients', (req, res) => {
  const { artistId } = req.params;

  const query = `
    SELECT DISTINCT 
      u.id, 
      u.name, 
      u.email,
      COUNT(ap.id) as appointment_count,
      MAX(ap.appointment_date) as last_appointment
    FROM appointments ap
    JOIN users u ON ap.customer_id = u.id
    WHERE ap.artist_id = ? AND u.is_deleted = 0
    GROUP BY u.id, u.name, u.email
    ORDER BY last_appointment DESC
  `;

  db.query(query, [artistId], (err, results) => {
    if (err) {
      console.error('[ERROR] Error fetching clients:', err);
      return res.status(500).json({ success: false, message: 'DB Error (Get Clients): ' + err.message });
    }

    res.json({ success: true, clients: results });
  });
});

// Update Artist Profile
app.put('/api/artist/profile/:id', (req, res) => {
  const { id } = req.params;
  const { name, specialization, hourly_rate, experience_years, phone, studio_name, profileImage, bio } = req.body;

  // Server-side hardening: Truncate and clamp inputs
  const safeName = name ? name.substring(0, 100) : null;
  const safePhone = phone ? phone.substring(0, 15) : null;
  const safeStudioName = studio_name ? studio_name.substring(0, 100) : null;
  const safeSpecialization = specialization ? specialization.substring(0, 500) : null;
  const safeExperienceYears = experience_years !== undefined ? Math.max(0, Math.min(100, parseInt(experience_years) || 0)) : undefined;
  const safeBio = bio !== undefined ? (bio || '').substring(0, 1000) : undefined;

  // Update users table (name and phone)
  db.query('UPDATE users SET name = ?, phone = ? WHERE id = ?', [safeName, safePhone, id], (err) => {
    if (err) return res.status(500).json({ success: false, message: 'DB Error (User)' });

    // Update artists table
    let artistQuery = 'UPDATE artists SET specialization = ?';
    const params = [safeSpecialization];

    if (safeExperienceYears !== undefined) {
      artistQuery += ', experience_years = ?';
      params.push(safeExperienceYears);
    }

    // Lock commission rate to 30%
    artistQuery += ', commission_rate = ?';
    params.push(0.30);

    if (safeStudioName !== undefined) {
      artistQuery += ', studio_name = ?';
      params.push(safeStudioName);
    }
    if (profileImage !== undefined) {
      artistQuery += ', profile_image = ?';
      params.push(profileImage);
    }
    if (safeBio !== undefined) {
      artistQuery += ', bio = ?';
      params.push(safeBio);
    }

    artistQuery += ' WHERE user_id = ?';
    params.push(id);

    db.query(artistQuery, params, (err) => {
      if (err) return res.status(500).json({ success: false, message: 'DB Error (Artist)' });
      res.json({ success: true, message: 'Profile updated successfully' });
    });
  });
});

// Get artist's portfolio
app.get('/api/artist/:artistId/portfolio', (req, res) => {
  const { artistId } = req.params;

  db.query(
    'SELECT * FROM portfolio_works WHERE artist_id = ? AND is_deleted = 0 ORDER BY created_at DESC',
    [artistId],
    (err, results) => {
      if (err) {
        console.error('[ERROR] Error fetching portfolio:', err);
        return res.status(500).json({ success: false, message: 'DB Error (Get Portfolio): ' + err.message });
      }

      res.json({ success: true, works: results });
    }
  );
});

// Add portfolio work
app.post('/api/artist/portfolio', (req, res) => {
  const { artistId, imageUrl, title, description, category, isPublic, priceEstimate } = req.body;

  if (!imageUrl) {
    return res.status(400).json({ success: false, message: 'Image data or URL is required.' });
  }

  // Check for valid URL or base64 data URI
  const urlRegex = new RegExp('^(https?|ftp)://');
  if (!imageUrl.startsWith('data:image/') && !urlRegex.test(imageUrl)) {
    return res.status(400).json({ success: false, message: 'Invalid image format. Must be a valid URL or a data URI.' });
  }

  if (imageUrl) {
    console.log(`[INFO] Uploading work: "${title}", Category: ${category}, Public: ${isPublic}, Price: ${priceEstimate || 'N/A'}`);
  }

  const parsedPrice = priceEstimate ? parseFloat(priceEstimate) : null;
  const query = 'INSERT INTO portfolio_works (artist_id, image_url, title, description, category, is_public, price_estimate, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)';

  db.query(query, [artistId, imageUrl, title, description, category, isPublic, parsedPrice, getLocalDatetime()], (err, result) => {
    if (err) {
      console.error('Error adding work:', err);
      return res.status(500).json({ success: false, message: 'DB Error: ' + err.message });
    }

    res.json({ success: true, message: 'Work added successfully', id: result.insertId });
  });
});

// Update portfolio work
app.put('/api/artist/portfolio/:id', (req, res) => {
  const { id } = req.params;
  const { title, description, category, priceEstimate, imageUrl, isPublic } = req.body;

  let query = 'UPDATE portfolio_works SET title=?, description=?, category=?, price_estimate=?';
  const params = [title, description, category, priceEstimate || null];

  if (imageUrl) {
    query += ', image_url=?';
    params.push(imageUrl);
  }

  if (isPublic !== undefined) {
    query += ', is_public=?';
    params.push(isPublic ? 1 : 0);
  }

  query += ' WHERE id=?';
  params.push(id);

  db.query(query, params, (err, result) => {
    if (err) return res.status(500).json({ success: false, message: 'Database error: ' + err.message });
    res.json({ success: true, message: 'Work updated successfully' });
  });
});

// Delete portfolio work
app.delete('/api/artist/portfolio/:id', (req, res) => {
  const { id } = req.params;

  db.query('UPDATE portfolio_works SET is_deleted = 1 WHERE id = ?', [id], (err, result) => {
    if (err) {
      console.error('Error deleting work:', err);
      return res.status(500).json({ success: false, message: 'Database error' });
    }
    // Note: We don't have the artist ID here easily without another query, so we might log 'Unknown' or fetch it first.

    res.json({ success: true, message: 'Work deleted successfully' });
  });
});

// Update portfolio work visibility
app.put('/api/artist/portfolio/:id/visibility', (req, res) => {
  const { id } = req.params;
  const { isPublic } = req.body;

  if (isPublic === undefined) {
    return res.status(400).json({ success: false, message: 'isPublic is required' });
  }

  db.query('UPDATE portfolio_works SET is_public = ? WHERE id = ?', [isPublic ? 1 : 0, id], (err, result) => {
    if (err) {
      console.error('[ERROR] Error updating portfolio visibility:', err);
      return res.status(500).json({ success: false, message: 'Database error' });
    }
    res.json({ success: true, message: 'Visibility updated successfully' });
  });
});

// Artist: Create Appointment (DISABLED per business rules: Only Admins/Managers can book)
app.post('/api/artist/appointments', (req, res) => {
  res.status(403).json({ success: false, message: 'Artists are not authorized to create appointments. Please contact the studio manager.' });
});

// Artist: Add New Client
app.post('/api/artist/clients', async (req, res) => {
  const { name, email, password } = req.body;
  console.log('[INFO] Request to add client:', { name, email });

  try {
    // Create user with provided password or default '123123123A!'
    const plainPassword = password || '123123123A!';
    const password_hash = await bcrypt.hash(plainPassword, 10);
    const query = 'INSERT INTO users (name, email, password_hash, user_type) VALUES (?, ?, ?, "customer")';

    db.query(query, [name, email, password_hash], (err, result) => {
      if (err) {
        console.error('[ERROR] Error adding client:', err);
        if (err.code === 'ER_DUP_ENTRY') {
          return res.status(400).json({ success: false, message: 'Email already exists' });
        }
        return res.status(500).json({ success: false, message: 'DB Error (Add Client): ' + err.message });
      }
      res.json({ success: true, message: 'Client profile created successfully' });
    });
  } catch (e) {
    console.error('[ERROR] Server error:', e);
    res.status(500).json({ success: false, message: 'Server error: ' + e.message });
  }
});

// Artist: Delete Client
app.delete('/api/artist/clients/:id', (req, res) => {
  const { id } = req.params;

  db.query('UPDATE users SET is_deleted = 1 WHERE id = ? AND user_type = "customer"', [id], (err, result) => {
    if (err) {
      console.error('Error deleting client:', err);
      return res.status(500).json({ success: false, message: 'Database error' });
    }
    res.json({ success: true, message: 'Client removed successfully' });
  });
});

// ========== CUSTOMER SPECIFIC ENDPOINTS ==========

// Get Customer Profile
app.get('/api/customer/profile/:id', (req, res) => {
  const { id } = req.params;
  const query = `
    SELECT u.name, u.email, c.profile_image, c.phone, c.location, c.notes,
           c.health_conditions, c.allergens
    FROM users u
    LEFT JOIN customers c ON u.id = c.user_id
    WHERE u.id = ?
  `;
  db.query(query, [id], (err, results) => {
    if (err) return res.status(500).json({ success: false, message: 'DB Error' });
    if (results.length === 0) return res.status(404).json({ success: false, message: 'User not found' });
    const profile = results[0];
    // Parse JSON arrays stored as TEXT
    try { profile.health_conditions = JSON.parse(profile.health_conditions || '[]'); } catch { profile.health_conditions = []; }
    try { profile.allergens = JSON.parse(profile.allergens || '[]'); } catch { profile.allergens = []; }
    res.json({ success: true, profile });
  });
});

// Update Customer Profile
app.put('/api/customer/profile/:id', (req, res) => {
  const { id } = req.params;
  const { name, phone, location, notes, profileImage, health_conditions, allergens } = req.body;

  const updateUserPromise = new Promise((resolve, reject) => {
    if (name === undefined) return resolve();
    db.query('UPDATE users SET name = ? WHERE id = ?', [name, id], (err) => {
      if (err) return reject({ message: 'DB Error (User)' });
      resolve();
    });
  });

  const updateCustomerPromise = new Promise((resolve, reject) => {
    const hasCustomerFields = phone !== undefined || location !== undefined || notes !== undefined ||
      profileImage !== undefined || health_conditions !== undefined || allergens !== undefined;
    if (!hasCustomerFields) return resolve();

    // Fetch existing data to avoid overwriting fields with null if they aren't provided.
    db.query('SELECT phone, location, notes, profile_image, health_conditions, allergens FROM customers WHERE user_id = ?', [id], (selectErr, results) => {
      if (selectErr) return reject({ message: 'DB Error (Customer Select)' });

      const existing = results[0] || {};
      const finalPhone = phone !== undefined ? phone : existing.phone;
      const finalLocation = location !== undefined ? location : existing.location;
      const finalNotes = notes !== undefined ? notes : existing.notes;
      const finalProfileImage = profileImage !== undefined ? profileImage : existing.profile_image;
      // Serialize arrays to JSON string for storage
      const finalHealthConditions = health_conditions !== undefined
        ? JSON.stringify(Array.isArray(health_conditions) ? health_conditions : [])
        : existing.health_conditions;
      const finalAllergens = allergens !== undefined
        ? JSON.stringify(Array.isArray(allergens) ? allergens : [])
        : existing.allergens;

      const customerQuery = `INSERT INTO customers (user_id, phone, location, notes, profile_image, health_conditions, allergens)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE
          phone = VALUES(phone), location = VALUES(location), notes = VALUES(notes),
          profile_image = VALUES(profile_image), health_conditions = VALUES(health_conditions),
          allergens = VALUES(allergens)`;

      db.query(customerQuery, [id, finalPhone, finalLocation, finalNotes, finalProfileImage, finalHealthConditions, finalAllergens], (upsertErr) => {
        if (upsertErr) return reject({ message: 'DB Error (Customer Upsert): ' + upsertErr.message });
        resolve();
      });
    });
  });

  Promise.all([updateUserPromise, updateCustomerPromise])
    .then(() => {
      res.json({ success: true, message: 'Profile updated successfully' });
    })
    .catch(error => {
      res.status(500).json({ success: false, message: error.message });
    });
});

// GET available jewelry items for piercing bookings (Public)
app.get('/api/inventory/jewelry', (req, res) => {
  const query = `
    SELECT id, name, category, cost, retail_price, current_stock, unit, image
    FROM inventory
    WHERE LOWER(category) = 'jewelry' AND current_stock > 0
    ORDER BY name ASC
  `;
  db.query(query, (err, results) => {
    if (err) return res.status(500).json({ success: false, message: 'Database error' });
    res.json({ success: true, items: results });
  });
});

// Get all available portfolio categories
app.get('/api/gallery/categories', (req, res) => {
  db.query("SELECT data FROM app_settings WHERE section = 'gallery'", (settingsErr, settingsResults) => {
    if (!settingsErr && settingsResults.length > 0) {
      try {
        const data = typeof settingsResults[0].data === 'string' ? JSON.parse(settingsResults[0].data) : settingsResults[0].data;
        if (data && data.categories) {
          const catArray = data.categories.split(',').map(c => c.trim()).filter(c => c);
          if (catArray.length > 0) {
            return res.json({ success: true, categories: catArray });
          }
        }
      } catch (e) {
        console.error('Error parsing gallery categories from app_settings:', e);
      }
    }

    const query = 'SELECT DISTINCT category FROM portfolio_works WHERE category IS NOT NULL AND category != "" AND is_deleted = 0 AND is_public = 1 ORDER BY category ASC';
    db.query(query, (err, results) => {
      if (err) {
        console.error('Error fetching categories:', err);
        return res.status(500).json({ success: false, message: 'Database error' });
      }
      const categories = results.map(r => r.category);
      res.json({ success: true, categories: ['All', ...categories] });
    });
  });
});


// Customer browse artists
app.get('/api/customer/artists', (req, res) => {
  const query = `
    SELECT 
      u.id, u.name, u.email,
      COALESCE(a.studio_name, 'Independent Artist') as studio_name,
      COALESCE(a.experience_years, 0) as experience_years, 
      COALESCE(a.specialization, 'General Artist') as specialization,
      COALESCE(a.hourly_rate, 50.00) as hourly_rate,
      COALESCE(a.rating, 0) as rating,
      COALESCE(a.total_reviews, 0) as total_reviews,
      a.profile_image,
      COUNT(pw.id) as portfolio_count
    FROM users u
    LEFT JOIN artists a ON u.id = a.user_id
    LEFT JOIN portfolio_works pw ON u.id = pw.artist_id AND pw.is_deleted = 0
    WHERE u.user_type = 'artist'
    GROUP BY u.id, u.name, u.email, 
             a.studio_name, a.experience_years,
             a.specialization, a.hourly_rate,
             a.rating, a.total_reviews
    ORDER BY a.rating DESC
  `;

  db.query(query, (err, results) => {
    if (err) {
      console.error('Error:', err);
      return res.status(500).json({ success: false, message: 'Database error' });
    }

    res.json({ success: true, artists: results });
  });
});

// Get artist availability (booked dates)
app.get('/api/artist/:artistId/availability', (req, res) => {
  const { artistId } = req.params;

  const query = `
    SELECT appointment_date, start_time, status, service_type
    FROM appointments
    WHERE artist_id = ? 
    AND status NOT IN ('cancelled', 'rejected') 
    AND is_deleted = 0
    AND appointment_date >= CURDATE()
  `;

  db.query(query, [artistId], (err, results) => {
    if (err) return res.status(500).json({ success: false, message: 'DB Error: ' + err.message });
    res.json({ success: true, bookings: results });
  });
});

// Get global studio concurrency availability (Whole-Day Limit)
app.get('/api/public/calendar-availability', (req, res) => {
  const artistQuery = `SELECT COUNT(id) as totalArtists FROM users WHERE user_type = 'artist' AND is_deleted = 0`;

  db.query(artistQuery, (artistErr, artistRes) => {
    if (artistErr) return res.status(500).json({ success: false, message: 'DB Error fetching artists' });

    // Ensure capacity is at least 1 (representing the generic "Studio Pool") if no physical artists exist yet
    const totalArtists = Math.max(1, artistRes[0].totalArtists);

    // Fetch all non-cancelled appointments globally
    const bookingQuery = `
      SELECT appointment_date, start_time, status, service_type
      FROM appointments
      WHERE status NOT IN ('cancelled', 'rejected')
      AND is_deleted = 0
      AND appointment_date >= CURDATE()
    `;

    db.query(bookingQuery, (bookingErr, bookingRes) => {
      if (bookingErr) return res.status(500).json({ success: false, message: 'DB Error fetching bookings' });
      res.json({ success: true, totalArtists, bookings: bookingRes });
    });
  });
});

// Customer book appointment
app.post('/api/customer/appointments', async (req, res) => {
  console.log('[INFO] Customer booking request:', req.body);
  let { customerId, artistId, date, startTime, endTime, designTitle, notes, referenceImage, price, serviceType, consultationMethod, customerName, guestEmail, guestPhone } = req.body;

  // --- Validate Customer ID & Handle Guests ---
  let finalCustomerId = customerId;
  let isGuest = 0;

  if (customerId) {
    const userExists = await new Promise((resolve) => {
      db.query("SELECT id FROM users WHERE id = ?", [customerId], (err, results) => {
        resolve(!err && results.length > 0);
      });
    });

    if (!userExists) {
      if (guestEmail) {
        // Fallback to guest mode
        isGuest = 1;
        finalCustomerId = null;
      } else {
        return res.status(401).json({
          success: false,
          message: 'Session invalid. Your account was not found. Please log out and log back in.'
        });
      }
    }
  } else {
    isGuest = 1;
  }

  if (isGuest) {
    // Get default admin ID to hold the guest appointment
    finalCustomerId = await new Promise((resolve) => {
      db.query("SELECT id FROM users WHERE user_type = 'admin' ORDER BY id ASC LIMIT 1", (err, adminRes) => {
        resolve(adminRes && adminRes.length > 0 ? adminRes[0].id : 1);
      });
    });
  }

  // ═══ Rolling Booking Limit: max 2 pending appointments per customer ═══
  if (!isGuest && finalCustomerId) {
    const limitCheck = await new Promise((resolve) => {
      db.query(
        `SELECT COUNT(*) as pending FROM appointments WHERE customer_id = ? AND status = 'pending' AND is_deleted = 0`,
        [finalCustomerId],
        (err, results) => {
          if (err) return resolve({ allowed: true });
          const pendingCount = results[0]?.pending || 0;
          if (pendingCount >= 2) return resolve({ allowed: false, count: pendingCount });
          resolve({ allowed: true });
        }
      );
    });

    if (!limitCheck.allowed) {
      return res.status(429).json({
        success: false,
        message: `You already have ${limitCheck.count} pending booking requests. Please wait for one to be confirmed before booking another.`
      });
    }
  }

  // If the admin decides, the customer might not send an artistId.
  // We need to find a default admin/manager to hold the appointment.
  if (!artistId) {
    db.query("SELECT id FROM users WHERE user_type = 'admin' LIMIT 1", (adminErr, adminRes) => {
      if (!adminErr && adminRes.length > 0) {
        processBooking(adminRes[0].id);
      } else {
        return res.status(500).json({ success: false, message: 'Studio management is currently unavailable for bookings.' });
      }
    });
  } else {
    processBooking(artistId);
  }

  function processBooking(finalArtistId) {
    const currentArtistId = finalArtistId;

    // Validation for time and date
    // If startTime is provided (not a Tattoo Session), validate it
    if (startTime) {
      const allowedTimes = [
        '13:00:00', '14:00:00', '15:00:00', '16:00:00', '17:00:00', '18:00:00', '19:00:00', '20:00:00',
        '13:00', '14:00', '15:00', '16:00', '17:00', '18:00', '19:00', '20:00'
      ];
      if (!allowedTimes.includes(startTime)) {
        return res.status(400).json({ success: false, message: 'Selected time is not available. Please choose between 1 PM - 8 PM.' });
      }
    }

    const nowManila = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Manila' }));
    const today = new Date(nowManila);
    today.setHours(0, 0, 0, 0); // Set to beginning of today
    const appointmentDate = new Date(date);
    appointmentDate.setHours(0, 0, 0, 0); // Also zero out time for comparison

    // Declare finalStartTime/finalEndTime HERE so they're available for same-day checks below
    const finalStartTime = startTime || null;
    const finalEndTime = endTime || startTime || null;
    // If no time provided (Tattoo Session), set status to pending_schedule
    const bookingStatus = startTime ? 'pending' : 'pending_schedule';

    if (appointmentDate < today) {
      return res.status(400).json({ success: false, message: 'Appointments cannot be booked for past dates.' });
    }

    // Check if it's a same-day booking.
    if (appointmentDate.getTime() === today.getTime()) {
      if (serviceType !== 'Consultation') {
        return res.status(400).json({ success: false, message: 'Appointments cannot be booked for the same day or past dates.' });
      }

      // 15-min buffer check for same-day Consultation
      if (finalStartTime) {
        const currentMins = nowManila.getHours() * 60 + nowManila.getMinutes();
        const [h, m] = finalStartTime.split(':').map(Number);
        const slotMins = h * 60 + m;
        
        if (currentMins >= slotMins - 15) {
          return res.status(400).json({ success: false, message: 'This time slot is no longer available. Please select a later time.' });
        }
      }
    }

    const maxBookingDate = new Date();
    maxBookingDate.setMonth(today.getMonth() + 3);
    if (appointmentDate > maxBookingDate) {
      return res.status(400).json({ success: false, message: 'Appointments can only be booked up to 3 months in advance.' });
    }
    // --- End Validation ---

    // Double Booking Check (only if they picked a time)
    if (finalStartTime) {
      let checkQuery = `
      SELECT id FROM appointments 
      WHERE appointment_date = ? AND start_time = ? AND status != 'cancelled' AND is_deleted = 0
      AND (`;

      let queryParams = [date, finalStartTime];

      if (artistId) { // Only check artist collision if they specifically requested an artist
        checkQuery += ` artist_id = ? OR `;
        queryParams.push(artistId);
      }

      checkQuery += ` customer_id = ? ) `;
      queryParams.push(isGuest ? null : finalCustomerId);

      db.query(checkQuery, queryParams, (checkErr, checkResults) => {
        if (checkErr) {
          console.error('[ERROR] Error checking double booking:', checkErr);
          return res.status(500).json({ success: false, message: 'Database error' });
        }

        if (checkResults.length > 0) {
          return res.status(400).json({ success: false, message: 'Scheduling Conflict: This time slot is already taken. Please select a different time.' });
        }

        insertAppointment();
      });
    } else {
      insertAppointment();
    }

    function insertAppointment() {
      const query = `
    INSERT INTO appointments 
    (customer_id, artist_id, appointment_date, start_time, end_time, design_title, notes, reference_image, status, price, service_type, booking_code, consultation_method, is_guest_placeholder, guest_email, guest_phone)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', 0, ?, 'PENDING', ?, ?, ?, ?)
  `;

      db.query(query, [finalCustomerId, currentArtistId, date, finalStartTime, finalEndTime, designTitle || (serviceType ? serviceType + ' Request' : 'Booking Request'), notes, referenceImage, serviceType || 'Consultation', consultationMethod || null, isGuest, guestEmail || null, guestPhone || null], (err, result) => {
        if (err) {
          console.error('[ERROR] Error booking appointment:', err);
          return res.status(500).json({ success: false, message: 'Database error: ' + err.message });
        }

        // Generate clean booking code using the auto-increment ID and UPDATE the row
        const bookingCode = generateBookingCode('O', serviceType, result.insertId);
        db.query('UPDATE appointments SET booking_code = ? WHERE id = ?', [bookingCode, result.insertId]);

        // Notify Customer (1 notification only)
        const notifDate = date || 'an upcoming date';
        const displayService = serviceType || 'Consultation';
        const displayDesign = designTitle || 'Tattoo Request';
        const appointmentDate = new Date(date).toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
        const appointmentTime = finalStartTime ? new Date(`2000-01-01T${finalStartTime}`).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true }) : 'a time to be determined';
        
        if (!isGuest) {
          createNotification(finalCustomerId, 'Booking Request Received', `Your request [${bookingCode}] for a ${displayDesign} session on ${appointmentDate} at ${appointmentTime} has been received. We will review it shortly! Expect a call from our staff in the next 24 hours.`, 'appointment_request', result.insertId);
        }

        // Notify all Admins/Managers (1 notification each)
        db.query('SELECT id FROM users WHERE user_type IN (?, ?)', ['admin', 'manager'], (adminErr, admins) => {
          if (!adminErr && admins.length > 0) {
            admins.forEach(admin => {
              createNotification(admin.id, 'New Booking Request', `New ${displayService} request [${bookingCode}]: "${displayDesign}" for ${notifDate}. Please review and assign pricing.`, 'appointment_request', result.insertId);
            });
          }
        });

        // Notify assigned artist (skip if unassigned/admin user 1)
        if (artistId && artistId !== 1 && artistId !== 'admin') {
          createNotification(artistId, 'New Booking Request', `A client has requested a ${displayDesign} session with you on ${appointmentDate} at ${appointmentTime}. The admin is reviewing this request.`, 'appointment_request', result.insertId);
        }

        db.query('SELECT email, name FROM users WHERE id = ?', [finalCustomerId], (err, users) => {
          const targetEmail = guestEmail || (users && users.length > 0 ? users[0].email : null);
          if (targetEmail) {
            const clientName = (isGuest ? customerName : (users && users.length > 0 ? users[0].name : 'Guest')) || 'Guest';
            const html = buildEmailHtml(`
              <h2 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#C19A6B;text-align:center;">Booking Request Received!</h2>
              <p style="margin:0 0 20px;font-size:13px;color:#64748b;text-align:center;">Your request is being reviewed</p>
              <p style="margin:0 0 16px;">Hello ${clientName},</p>
              <p style="margin:0 0 16px;">We have successfully received your request <strong>[${bookingCode}]</strong> and our team is currently reviewing your details.</p>
              
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td align="center" style="padding:10px 0 20px;">
                <div style="text-align:left;display:inline-block;background-color:#faf8f5;border:1px solid #e2ddd5;border-radius:12px;padding:24px;width:100%;max-width:400px;box-sizing:border-box;">
                  <p style="margin:0 0 12px;font-size:14px;color:#94a3b8;"><strong style="color:#334155;display:inline-block;width:70px;">Service:</strong> <span style="color:#C19A6B;">${designTitle || serviceType}</span></p>
                  <p style="margin:0 0 12px;font-size:14px;color:#94a3b8;"><strong style="color:#334155;display:inline-block;width:70px;">Date:</strong> <span style="color:#C19A6B;">${appointmentDate}</span></p>
                  <p style="margin:0;font-size:14px;color:#94a3b8;"><strong style="color:#334155;display:inline-block;width:70px;">Time:</strong> <span style="color:#C19A6B;">${appointmentTime}</span></p>
                </div>
              </td></tr></table>

              <p style="margin:0 0 16px;line-height:1.6;">Our team will get back to you shortly to assist with next steps and confirm pricing. Expect a call or email from our staff within the next 24 hours.</p>
              <p style="margin:0;font-size:14px;color:#94a3b8;text-align:center;">- The InkVistAR Studio Team</p>
            `);
            sendResendEmail(targetEmail, 'InkVistAR: Booking Request Received', html);
          }
        });

        res.json({
          success: true,
          message: 'Appointment booked successfully',
          appointmentId: result.insertId,
          bookingCode: bookingCode
        });
      });
    }
  }
});

// Get customer's appointments
app.get('/api/customer/:customerId/appointments', (req, res) => {
  const { customerId } = req.params;
  const query = `
    SELECT ap.*, ap.price, ap.tattoo_price, ap.piercing_price, u.name as artist_name, u.email as artist_email, 
           COALESCE(a.studio_name, 'Independent Artist') as studio_name,
           ((SELECT COALESCE(SUM(amount), 0) FROM payments p WHERE p.appointment_id = ap.id AND p.status = 'paid') / 100) + COALESCE(ap.manual_paid_amount, 0) as total_paid,
           ap.manual_payment_method,
           COALESCE(ap.reschedule_count, 0) as reschedule_count
    FROM appointments ap
    JOIN users u ON ap.artist_id = u.id
    LEFT JOIN artists a ON u.id = a.user_id
    WHERE ap.customer_id = ? AND ap.is_deleted = 0
    ORDER BY ap.appointment_date DESC, ap.start_time DESC
  `;
  db.query(query, [customerId], (err, results) => {
    if (err) return res.status(500).json({ success: false, message: 'DB Error: ' + err.message });
    res.json({ success: true, appointments: results });
  });
});

// Customer Reschedule Endpoint
app.put('/api/customer/appointments/:id/reschedule', (req, res) => {
  const { id } = req.params;
  const { customerId, newDate, newTime, reason } = req.body;

  if (!customerId || !newDate) {
    return res.status(400).json({ success: false, message: 'Missing required fields (customerId, newDate).' });
  }

  // 1. Fetch the appointment and verify ownership
  db.query(
    `SELECT ap.*, u.name as artist_name FROM appointments ap JOIN users u ON ap.artist_id = u.id WHERE ap.id = ? AND ap.customer_id = ? AND ap.is_deleted = 0`,
    [id, customerId],
    (err, results) => {
      if (err) return res.status(500).json({ success: false, message: 'Database error.' });
      if (!results.length) return res.status(404).json({ success: false, message: 'Appointment not found or you do not have permission.' });

      const appt = results[0];

      // 2. Only allow rescheduling for upcoming appointments
      if (['completed', 'cancelled', 'rejected'].includes(appt.status)) {
        return res.status(400).json({ success: false, message: 'Cannot reschedule a completed or cancelled appointment.' });
      }

      // 3. Check reschedule limit (max 1)
      const currentCount = appt.reschedule_count || 0;
      if (currentCount >= 1) {
        return res.status(400).json({ success: false, message: 'You have already used your 1 allowed reschedule for this appointment. Please contact the studio for assistance.' });
      }

      // 4. Check 1-week restriction
      const now = new Date();
      const appointmentDate = new Date(appt.appointment_date);
      const msInAWeek = 7 * 24 * 60 * 60 * 1000;
      if ((appointmentDate - now) < msInAWeek) {
        return res.status(400).json({ success: false, message: 'Rescheduling is not allowed for appointments that are less than 1 week away. If this is an emergency, please contact the studio directly.' });
      }

      // 5. New date must be AFTER the current appointment date (can only move forward)
      const newDateObj = new Date(newDate);
      const currentDateNorm = new Date(appt.appointment_date);
      newDateObj.setHours(0, 0, 0, 0);
      currentDateNorm.setHours(0, 0, 0, 0);
      if (newDateObj <= currentDateNorm) {
        return res.status(400).json({ success: false, message: 'You can only reschedule to a later date than your current appointment.' });
      }

      // 6. Check for date conflict with other active appointments for this customer
      db.query(
        `SELECT id FROM appointments WHERE customer_id = ? AND id != ? AND appointment_date = ? AND status NOT IN ('completed', 'cancelled', 'rejected') AND is_deleted = 0`,
        [customerId, id, newDate],
        (conflictErr, conflicts) => {
          if (conflictErr) return res.status(500).json({ success: false, message: 'Database error checking conflicts.' });
          if (conflicts.length > 0) {
            return res.status(400).json({ success: false, message: 'You already have another session booked on this date. Please choose a different date.' });
          }

          // 7. Perform the reschedule + append reason to notes
          const reasonSuffix = reason ? `\n\n--- Reschedule Reason (by customer) ---\n${reason}` : '';
          const updatedNotes = (appt.notes || '') + reasonSuffix;

          db.query(
            `UPDATE appointments SET appointment_date = ?, start_time = COALESCE(?, start_time), reschedule_count = reschedule_count + 1, notes = ? WHERE id = ?`,
            [newDate, newTime || null, updatedNotes, id],
            (updateErr, result) => {
              if (updateErr) return res.status(500).json({ success: false, message: 'Failed to reschedule: ' + updateErr.message });

              console.log(`[INFO] Customer ${customerId} rescheduled Appt #${id} to ${newDate} ${newTime || ''} (Reason: ${reason || 'Not provided'})`);

              const reasonText = reason ? `\nReason: ${reason}` : '';

              // Notify artist
              if (appt.artist_id) {
                db.query('SELECT user_type FROM users WHERE id = ?', [appt.artist_id], (aErr, aRes) => {
                  if (!aErr && aRes.length && aRes[0].user_type !== 'admin') {
                    createNotification(appt.artist_id, 'Appointment Rescheduled', `A client has rescheduled appointment #${id} to ${newDate}${newTime ? ' at ' + newTime : ''}.${reasonText}`, 'appointment_rescheduled', id);
                  }
                });
              }
              // Notify admins
              db.query('SELECT id FROM users WHERE user_type IN ("admin", "manager")', (adminErr, admins) => {
                if (!adminErr && admins.length > 0) {
                  admins.forEach(admin => {
                    createNotification(admin.id, 'Appointment Rescheduled', `Customer rescheduled appointment #${id} to ${newDate}${newTime ? ' at ' + newTime : ''}.${reasonText}`, 'appointment_rescheduled', id);
                  });
                }
              });
              // Notify customer
              createNotification(customerId, 'Reschedule Confirmed', `Your appointment #${id} has been rescheduled to ${newDate}${newTime ? ' at ' + newTime : ''}.`, 'appointment_rescheduled', id);

              res.json({ success: true, message: 'Appointment rescheduled successfully.' });
            }
          );
        } // end conflict check callback
      ); // end conflict check query
    }
  );
});

// ========== RESCHEDULE REQUEST SYSTEM ==========
// Customer submits a reschedule REQUEST (for appointments within 1 week but ≥12 hours away)
app.post('/api/customer/appointments/:id/reschedule-request', (req, res) => {
  const { id } = req.params;
  const { customerId, requestedDate, requestedTime, reason } = req.body;

  if (!customerId || !requestedDate || !reason) {
    return res.status(400).json({ success: false, message: 'Missing required fields (customerId, requestedDate, reason).' });
  }

  // 1. Fetch the appointment and verify ownership
  db.query(
    `SELECT ap.*, u.name as customer_name, u.email as customer_email, ap.booking_code FROM appointments ap JOIN users u ON ap.customer_id = u.id WHERE ap.id = ? AND ap.customer_id = ? AND ap.is_deleted = 0`,
    [id, customerId],
    (err, results) => {
      if (err) return res.status(500).json({ success: false, message: 'Database error.' });
      if (!results.length) return res.status(404).json({ success: false, message: 'Appointment not found or you do not have permission.' });

      const appt = results[0];

      // 2. Only allow for upcoming appointments
      if (['completed', 'cancelled', 'rejected'].includes(appt.status)) {
        return res.status(400).json({ success: false, message: 'Cannot request reschedule for a completed or cancelled appointment.' });
      }

      // 3. Check reschedule limit (max 1)
      const currentCount = appt.reschedule_count || 0;
      if (currentCount >= 1) {
        return res.status(400).json({ success: false, message: 'You have already used your 1 allowed reschedule for this appointment.' });
      }

      // 4. Check that appointment is < 7 days away (otherwise use instant reschedule)
      const now = new Date();
      const appointmentDate = new Date(appt.appointment_date);
      // Set appointment time if available
      if (appt.start_time) {
        const [h, m] = appt.start_time.split(':');
        appointmentDate.setHours(parseInt(h), parseInt(m), 0, 0);
      } else {
        appointmentDate.setHours(23, 59, 59, 999);
      }
      const msInAWeek = 7 * 24 * 60 * 60 * 1000;
      const msIn12Hours = 12 * 60 * 60 * 1000;
      const timeUntilAppt = appointmentDate - now;

      if (timeUntilAppt >= msInAWeek) {
        return res.status(400).json({ success: false, message: 'Your appointment is more than 7 days away. Please use the standard reschedule option instead.' });
      }

      // 5. Must be at least 12 hours before appointment
      if (timeUntilAppt < msIn12Hours) {
        return res.status(400).json({ success: false, message: 'Reschedule requests cannot be made for appointments less than 12 hours away.' });
      }

      // 6. Check no existing pending request for this appointment
      db.query(
        `SELECT id FROM reschedule_requests WHERE appointment_id = ? AND status = 'pending'`,
        [id],
        (pendingErr, pendingRes) => {
          if (pendingErr) return res.status(500).json({ success: false, message: 'Database error checking existing requests.' });
          if (pendingRes.length > 0) {
            return res.status(400).json({ success: false, message: 'You already have a pending reschedule request for this appointment. Please wait for it to be reviewed.' });
          }

          // 7. Validate requested date
          const reqDateObj = new Date(requestedDate);
          reqDateObj.setHours(0, 0, 0, 0);
          const today = new Date();
          today.setHours(0, 0, 0, 0);
          if (reqDateObj <= today) {
            return res.status(400).json({ success: false, message: 'Requested date must be in the future.' });
          }
          const maxDate = new Date();
          maxDate.setMonth(today.getMonth() + 3);
          if (reqDateObj > maxDate) {
            return res.status(400).json({ success: false, message: 'Requested date cannot be more than 3 months in the future.' });
          }

          // 8. Insert the reschedule request with 24-hour expiry
          const expiresAt = getLocalDatetime(new Date(Date.now() + 24 * 60 * 60 * 1000));

          db.query(
            `INSERT INTO reschedule_requests (appointment_id, customer_id, requested_date, requested_time, reason, status, expires_at) VALUES (?, ?, ?, ?, ?, 'pending', ?)`,
            [id, customerId, requestedDate, requestedTime || null, reason, expiresAt],
            (insertErr, insertResult) => {
              if (insertErr) return res.status(500).json({ success: false, message: 'Failed to submit reschedule request: ' + insertErr.message });

              console.log(`[INFO] Customer ${customerId} submitted reschedule request for Appt #${id} → ${requestedDate} (Reason: ${reason})`);

              const bookingCode = appt.booking_code || `#${id}`;
              const currentDateStr = new Date(appt.appointment_date).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
              const newDateStr = new Date(requestedDate + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });

              // Notify all admins/managers
              db.query('SELECT id FROM users WHERE user_type IN ("admin", "manager") AND is_deleted = 0', (adminErr, admins) => {
                if (!adminErr && admins.length > 0) {
                  admins.forEach(admin => {
                    createNotification(admin.id, 'Reschedule Request', `${appt.customer_name} requests to reschedule [${bookingCode}] from ${currentDateStr} to ${newDateStr}. Reason: ${reason}. This request expires in 24 hours — please review.`, 'reschedule_request', parseInt(id));
                  });
                }
              });

              // Notify customer
              createNotification(customerId, 'Reschedule Request Submitted', `Your request to reschedule appointment [${bookingCode}] to ${newDateStr} has been submitted. The studio will review it within 24 hours.`, 'reschedule_request', parseInt(id));

              // Email customer
              if (appt.customer_email) {
                const emailHtml = buildEmailHtml(`
                  <h2 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#C19A6B;text-align:center;">Reschedule Request Submitted</h2>
                  <p style="margin:0 0 20px;font-size:13px;color:#64748b;text-align:center;">Your request is being reviewed by the studio</p>
                  <p style="margin:0 0 16px;">Hello ${appt.customer_name},</p>
                  <p style="margin:0 0 16px;">We have received your request to reschedule appointment <strong>[${bookingCode}]</strong>.</p>
                  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td align="center" style="padding:10px 0 20px;">
                    <div style="text-align:left;display:inline-block;background-color:#faf8f5;border:1px solid #e2ddd5;border-radius:12px;padding:24px;width:100%;max-width:400px;box-sizing:border-box;">
                      <p style="margin:0 0 12px;font-size:14px;color:#94a3b8;"><strong style="color:#334155;display:inline-block;width:110px;">Current Date:</strong> <span style="color:#ef4444;text-decoration:line-through;">${currentDateStr}</span></p>
                      <p style="margin:0 0 12px;font-size:14px;color:#94a3b8;"><strong style="color:#334155;display:inline-block;width:110px;">Requested:</strong> <span style="color:#10b981;font-weight:700;">${newDateStr}</span></p>
                      <p style="margin:0;font-size:14px;color:#94a3b8;"><strong style="color:#334155;display:inline-block;width:110px;">Reason:</strong> <span style="color:#C19A6B;">${reason}</span></p>
                    </div>
                  </td></tr></table>
                  <p style="margin:0 0 16px;line-height:1.6;">Our team will review your request and respond within <strong>24 hours</strong>. If no action is taken, the request will expire and your original appointment will remain unchanged.</p>
                  <p style="margin:0;font-size:14px;color:#94a3b8;text-align:center;">- The InkVistAR Studio Team</p>
                `);
                sendResendEmail(appt.customer_email, `InkVistAR: Reschedule Request [${bookingCode}]`, emailHtml);
              }

              res.json({ success: true, message: 'Reschedule request submitted successfully. The studio will review it within 24 hours.', requestId: insertResult.insertId });
            }
          );
        }
      );
    }
  );
});

// Customer checks status of reschedule request for an appointment
app.get('/api/customer/appointments/:id/reschedule-request', (req, res) => {
  const { id } = req.params;
  const customerId = req.query.customerId;

  if (!customerId) return res.status(400).json({ success: false, message: 'customerId is required.' });

  db.query(
    `SELECT rr.*, TIMESTAMPDIFF(SECOND, NOW(), rr.expires_at) as seconds_remaining
     FROM reschedule_requests rr
     WHERE rr.appointment_id = ? AND rr.customer_id = ?
     ORDER BY rr.created_at DESC LIMIT 1`,
    [id, customerId],
    (err, results) => {
      if (err) return res.status(500).json({ success: false, message: 'Database error.' });
      if (!results.length) return res.json({ success: true, request: null });
      res.json({ success: true, request: results[0] });
    }
  );
});

// Admin: Get reschedule request for a specific appointment
app.get('/api/admin/appointments/:id/reschedule-request', (req, res) => {
  const { id } = req.params;
  db.query(
    `SELECT rr.*, u.name as customer_name, TIMESTAMPDIFF(SECOND, NOW(), rr.expires_at) as seconds_remaining
     FROM reschedule_requests rr
     JOIN users u ON rr.customer_id = u.id
     WHERE rr.appointment_id = ? AND rr.status = 'pending'
     ORDER BY rr.created_at DESC LIMIT 1`,
    [id],
    (err, results) => {
      if (err) return res.status(500).json({ success: false, message: 'Database error.' });
      if (!results.length) return res.json({ success: true, request: null });
      res.json({ success: true, request: results[0] });
    }
  );
});

// Admin: List all reschedule requests (pending + recent)
app.get('/api/admin/reschedule-requests', (req, res) => {
  db.query(
    `SELECT rr.*, u.name as customer_name, a.booking_code, a.appointment_date as current_date, a.start_time as current_time, a.service_type, a.design_title,
            TIMESTAMPDIFF(SECOND, NOW(), rr.expires_at) as seconds_remaining,
            u_admin.name as decided_by_name
     FROM reschedule_requests rr
     JOIN users u ON rr.customer_id = u.id
     JOIN appointments a ON rr.appointment_id = a.id
     LEFT JOIN users u_admin ON rr.decided_by = u_admin.id
     ORDER BY FIELD(rr.status, 'pending', 'approved', 'rejected', 'expired'), rr.created_at DESC
     LIMIT 50`,
    (err, results) => {
      if (err) return res.status(500).json({ success: false, message: 'Database error: ' + err.message });
      res.json({ success: true, requests: results });
    }
  );
});

// Admin: Approve or Reject a reschedule request
app.put('/api/admin/reschedule-requests/:requestId/decide', (req, res) => {
  const { requestId } = req.params;
  const { decision, adminNotes, adminId } = req.body;

  if (!decision || !adminId) {
    return res.status(400).json({ success: false, message: 'decision and adminId are required.' });
  }
  if (!['approved', 'rejected'].includes(decision)) {
    return res.status(400).json({ success: false, message: 'Decision must be "approved" or "rejected".' });
  }
  if (decision === 'rejected' && (!adminNotes || adminNotes.trim().length < 5)) {
    return res.status(400).json({ success: false, message: 'Please provide a reason for rejection (at least 5 characters).' });
  }

  // 1. Fetch the request
  db.query(
    `SELECT rr.*, a.customer_id, a.artist_id, a.appointment_date, a.start_time, a.notes as appt_notes, a.booking_code, a.reschedule_count,
            u.name as customer_name, u.email as customer_email,
            c.phone as customer_phone
     FROM reschedule_requests rr
     JOIN appointments a ON rr.appointment_id = a.id
     JOIN users u ON rr.customer_id = u.id
     LEFT JOIN customers c ON rr.customer_id = c.user_id
     WHERE rr.id = ?`,
    [requestId],
    (err, results) => {
      if (err) return res.status(500).json({ success: false, message: 'Database error.' });
      if (!results.length) return res.status(404).json({ success: false, message: 'Reschedule request not found.' });

      const request = results[0];

      if (request.status !== 'pending') {
        return res.status(400).json({ success: false, message: `This request has already been ${request.status}.` });
      }

      const bookingCode = request.booking_code || `#${request.appointment_id}`;
      const newDateStr = new Date(request.requested_date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
      const decidedAt = getLocalDatetime();

      if (decision === 'approved') {
        // === APPROVE: Perform the actual reschedule ===
        const reasonSuffix = `\n\n--- Reschedule Request (approved by admin) ---\nReason: ${request.reason}${adminNotes ? '\nAdmin notes: ' + adminNotes : ''}`;
        const updatedNotes = (request.appt_notes || '') + reasonSuffix;

        db.query(
          `UPDATE appointments SET appointment_date = ?, start_time = COALESCE(?, start_time), reschedule_count = reschedule_count + 1, notes = ? WHERE id = ?`,
          [request.requested_date, request.requested_time || null, updatedNotes, request.appointment_id],
          (updateErr) => {
            if (updateErr) return res.status(500).json({ success: false, message: 'Failed to update appointment: ' + updateErr.message });

            // Update the request record
            db.query(
              `UPDATE reschedule_requests SET status = 'approved', admin_notes = ?, decided_by = ?, decided_at = ? WHERE id = ?`,
              [adminNotes || null, adminId, decidedAt, requestId]
            );

            console.log(`[OK] Admin ${adminId} approved reschedule request #${requestId} for Appt #${request.appointment_id} → ${request.requested_date}`);

            const notesStr = adminNotes ? ` Notes: ${adminNotes}` : '';

            // Notify customer
            createNotification(request.customer_id, 'Reschedule Approved', `Great news! Your reschedule request for [${bookingCode}] has been approved. Your new appointment date is ${newDateStr}.${notesStr}`, 'reschedule_approved', request.appointment_id);

            // Notify artist
            if (request.artist_id) {
              db.query('SELECT user_type FROM users WHERE id = ?', [request.artist_id], (aErr, aRes) => {
                if (!aErr && aRes.length && aRes[0].user_type !== 'admin') {
                  createNotification(request.artist_id, 'Appointment Rescheduled', `Appointment [${bookingCode}] has been rescheduled to ${newDateStr} (approved reschedule request).`, 'appointment_rescheduled', request.appointment_id);
                }
              });
            }

            // Email customer
            if (request.customer_email) {
              const emailHtml = buildEmailHtml(`
                <h2 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#10b981;text-align:center;">Reschedule Request Approved</h2>
                <p style="margin:0 0 20px;font-size:13px;color:#64748b;text-align:center;">Your appointment has been moved</p>
                <p style="margin:0 0 16px;">Hello ${request.customer_name},</p>
                <p style="margin:0 0 16px;">Your request to reschedule appointment <strong>[${bookingCode}]</strong> has been <strong style="color:#10b981;">approved</strong>!</p>
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td align="center" style="padding:10px 0 20px;">
                  <div style="text-align:left;display:inline-block;background-color:#1a1a1a;border:1px solid rgba(16,185,129,0.3);border-radius:12px;padding:24px;width:100%;max-width:400px;box-sizing:border-box;">
                    <p style="margin:0 0 12px;font-size:14px;color:#94a3b8;"><strong style="color:#334155;display:inline-block;width:100px;">New Date:</strong> <span style="color:#10b981;font-weight:700;">${newDateStr}</span></p>
                    ${adminNotes ? `<p style="margin:0;font-size:14px;color:#94a3b8;"><strong style="color:#334155;display:inline-block;width:100px;">Studio Notes:</strong> <span style="color:#C19A6B;">${adminNotes}</span></p>` : ''}
                  </div>
                </td></tr></table>
                <p style="margin:0;font-size:14px;color:#94a3b8;text-align:center;">- The InkVistAR Studio Team</p>
              `);
              sendResendEmail(request.customer_email, `InkVistAR: Reschedule Approved [${bookingCode}]`, emailHtml);
            }

            // SMS customer
            if (request.customer_phone) {
              sendSMS(request.customer_phone, `InkVistAR: Your reschedule request for [${bookingCode}] has been APPROVED! New date: ${newDateStr}.${notesStr}`);
            }

            res.json({ success: true, message: 'Reschedule request approved. Appointment has been updated.' });
          }
        );
      } else {
        // === REJECT ===
        db.query(
          `UPDATE reschedule_requests SET status = 'rejected', admin_notes = ?, decided_by = ?, decided_at = ? WHERE id = ?`,
          [adminNotes, adminId, decidedAt, requestId],
          (rejectErr) => {
            if (rejectErr) return res.status(500).json({ success: false, message: 'Failed to update request.' });

            console.log(`[ERROR] Admin ${adminId} rejected reschedule request #${requestId} for Appt #${request.appointment_id}`);

            const originalDateStr = new Date(request.appointment_date).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });

            // Notify customer
            createNotification(request.customer_id, 'Reschedule Request Declined', `Your reschedule request for [${bookingCode}] has been declined. Studio notes: ${adminNotes}. Your original appointment on ${originalDateStr} remains unchanged.`, 'reschedule_rejected', request.appointment_id);

            // Email customer
            if (request.customer_email) {
              const emailHtml = buildEmailHtml(`
                <h2 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#ef4444;text-align:center;">Reschedule Request Declined</h2>
                <p style="margin:0 0 20px;font-size:13px;color:#64748b;text-align:center;">Your original appointment remains unchanged</p>
                <p style="margin:0 0 16px;">Hello ${request.customer_name},</p>
                <p style="margin:0 0 16px;">Unfortunately, your request to reschedule appointment <strong>[${bookingCode}]</strong> has been <strong style="color:#ef4444;">declined</strong>.</p>
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td align="center" style="padding:10px 0 20px;">
                  <div style="text-align:left;display:inline-block;background-color:#1a1a1a;border:1px solid rgba(239,68,68,0.3);border-radius:12px;padding:24px;width:100%;max-width:400px;box-sizing:border-box;">
                    <p style="margin:0 0 12px;font-size:14px;color:#94a3b8;"><strong style="color:#334155;display:inline-block;width:130px;">Original Date:</strong> <span style="color:#C19A6B;">${originalDateStr}</span></p>
                    <p style="margin:0;font-size:14px;color:#94a3b8;"><strong style="color:#334155;display:inline-block;width:130px;">Studio Notes:</strong> <span style="color:#ef4444;">${adminNotes}</span></p>
                  </div>
                </td></tr></table>
                <p style="margin:0 0 16px;line-height:1.6;">Your appointment remains as originally scheduled. If you have any questions, please contact the studio directly.</p>
                <p style="margin:0;font-size:14px;color:#94a3b8;text-align:center;">- The InkVistAR Studio Team</p>
              `);
              sendResendEmail(request.customer_email, `InkVistAR: Reschedule Request Declined [${bookingCode}]`, emailHtml);
            }

            // SMS customer
            if (request.customer_phone) {
              sendSMS(request.customer_phone, `InkVistAR: Your reschedule request for [${bookingCode}] has been declined. Reason: ${adminNotes}. Your original appointment remains unchanged.`);
            }

            res.json({ success: true, message: 'Reschedule request rejected. Customer has been notified.' });
          }
        );
      }
    }
  );
});

// ========== GALLERY ENDPOINT ==========
// Get public gallery works (for customer gallery screen)
app.get('/api/gallery/works', (req, res) => {
  const { search, category, minPrice, maxPrice } = req.query;

  let query = `
    SELECT pw.id, pw.title, pw.description, pw.image_url, pw.category, pw.price_estimate, pw.created_at,
           u.name as artist_name, a.studio_name
    FROM portfolio_works pw
    JOIN users u ON pw.artist_id = u.id
    LEFT JOIN artists a ON u.id = a.user_id
    WHERE pw.is_public = 1 AND (pw.is_deleted = 0 OR pw.is_deleted IS NULL)
  `;
  const params = [];

  if (search) {
    query += ` AND (pw.title LIKE ? OR pw.description LIKE ? OR u.name LIKE ? OR pw.category LIKE ?)`;
    const searchParam = `%${search}%`;
    params.push(searchParam, searchParam, searchParam, searchParam);
  }

  if (category && category !== 'All') {
    query += ` AND pw.category = ?`;
    params.push(category);
  }

  if (minPrice !== undefined && maxPrice !== undefined) {
    query += ` AND pw.price_estimate BETWEEN ? AND ?`;
    params.push(Number(minPrice), Number(maxPrice));
  }

  if (req.query.artistId) {
    query += ` AND pw.artist_id = ?`;
    params.push(req.query.artistId);
  }

  query += ` ORDER BY pw.created_at DESC LIMIT 100`;

  db.query(query, params, (err, results) => {
    if (err) {
      console.error('[ERROR] Error fetching gallery works:', err);
      return res.status(500).json({ success: false, message: 'Database error' });
    }
    res.json({ success: true, works: results });
  });
});

// Get Art of the Day
app.get('/api/gallery/art-of-the-day', (req, res) => {
  // First, try to get the latest public work from today
  const todayQuery = `
    SELECT 
      pw.id, pw.title, pw.image_url, u.name as artist_name
    FROM portfolio_works pw
    JOIN users u ON pw.artist_id = u.id
    WHERE pw.is_public = 1 AND pw.is_deleted = 0 AND DATE(pw.created_at) = CURDATE()
    ORDER BY pw.created_at DESC
    LIMIT 1
  `;

  db.query(todayQuery, (err, todayResults) => {
    if (err) {
      console.error('[ERROR] Error fetching Art of the Day (today):', err);
      return res.status(500).json({ success: false, message: 'Database error' });
    }

    if (todayResults.length > 0) {
      return res.json({ success: true, work: todayResults[0] });
    }

    // If no work from today, get the absolute latest public work
    const latestQuery = `
      SELECT 
        pw.id, pw.title, pw.image_url, u.name as artist_name
      FROM portfolio_works pw
      JOIN users u ON pw.artist_id = u.id
      WHERE pw.is_public = 1 AND pw.is_deleted = 0
      ORDER BY pw.created_at DESC
      LIMIT 1
    `;

    db.query(latestQuery, (latestErr, latestResults) => {
      if (latestErr) {
        console.error('[ERROR] Error fetching Art of the Day (latest):', latestErr);
        return res.status(500).json({ success: false, message: 'Database error' });
      }

      if (latestResults.length > 0) {
        return res.json({ success: true, work: latestResults[0] });
      }

      return res.json({ success: true, work: null, message: 'No public portfolio works found.' });
    });
  });
});

// ========== SERVICE KITS & SESSION MATERIALS ==========

// Get service kits grouped by service type
app.get('/api/admin/service-kits', (req, res) => {
  const query = `
    SELECT sk.id, sk.service_type, sk.default_quantity, i.id as inventory_id, i.name as item_name, i.unit, i.current_stock 
    FROM service_kits sk 
    JOIN inventory i ON sk.inventory_id = i.id
    ORDER BY sk.service_type, i.name
  `;
  db.query(query, (err, results) => {
    if (err) return res.status(500).json({ success: false, message: 'Database error' });

    // Group by service type
    const kits = {};
    results.forEach(row => {
      if (!kits[row.service_type]) kits[row.service_type] = [];
      kits[row.service_type].push(row);
    });

    res.json({ success: true, data: kits });
  });
});

// Add/Update a service kit
app.post('/api/admin/service-kits', (req, res) => {
  const service_type = (req.body.service_type || '').trim();
  const old_service_type = (req.body.old_service_type || '').trim();
  const { materials } = req.body;

  if (!service_type || !materials || !Array.isArray(materials)) {
    return res.status(400).json({ success: false, message: 'Invalid data' });
  }

  const serviceTypesToDelete = new Set();
  if (old_service_type) serviceTypesToDelete.add(old_service_type);
  if (service_type) serviceTypesToDelete.add(service_type);

  const deleteAllExisting = (next) => {
    if (serviceTypesToDelete.size === 0) return next();
    const placeholders = Array.from(serviceTypesToDelete).map(() => '?').join(',');
    db.query(`DELETE FROM service_kits WHERE service_type IN (${placeholders})`, Array.from(serviceTypesToDelete), (err) => {
      if (err) return res.status(500).json({ success: false, message: 'Database error' });
      next();
    });
  };

  deleteAllExisting(() => {
    if (materials.length === 0) return res.json({ success: true, message: 'Kit cleared' });

    const values = materials.map(m => [service_type, m.inventory_id, m.default_quantity]);
    db.query('INSERT INTO service_kits (service_type, inventory_id, default_quantity) VALUES ?', [values], (insertErr) => {
      if (insertErr) return res.status(500).json({ success: false, message: 'Error saving kit' });
      res.json({ success: true, message: 'Kit updated' });
    });
  });
});

// Delete a service kit by service type
app.delete('/api/admin/service-kits/:service_type', (req, res) => {
  const serviceType = (req.params.service_type || '').trim();
  console.log(`[DEBUG] Attempting to delete service kit with type: "${serviceType}"`);

  if (!serviceType) return res.status(400).json({ success: false, message: 'Service type required' });

  db.query('DELETE FROM service_kits WHERE service_type = ?', [serviceType], (err, result) => {
    if (err) {
      console.error(`[ERROR] DB error during kit delete:`, err.message);
      return res.status(500).json({ success: false, message: 'Database error' });
    }
    if (result.affectedRows === 0) {
      console.warn(`[WARN] Delete failed: No rows matched service type "${serviceType}"`);
      return res.status(404).json({ success: false, message: 'Service kit not found in database' });
    }
    console.log(`[SUCCESS] Deleted ${result.affectedRows} items for service kit: "${serviceType}"`);
    res.json({ success: true, message: 'Service kit deleted' });
  });
});

// GET all appointments (Admin)
app.get('/api/admin/appointments', (req, res) => {
  const query = `
    SELECT 
      ap.*,
      CASE 
        WHEN COALESCE(ap.is_guest_placeholder, 0) = 1 THEN COALESCE(NULLIF(ap.guest_email, ''), 'Guest (Unregistered)')
        ELSE u_cust.name 
      END as client_name,
      CASE 
        WHEN COALESCE(ap.is_guest_placeholder, 0) = 1 THEN COALESCE(ap.guest_email, u_cust.email)
        ELSE u_cust.email 
      END as client_email,
      u_art.name as artist_name,
      u_sec.name as secondary_artist_name,
      ar.commission_rate,
      ((SELECT COALESCE(SUM(amount), 0) FROM payments p WHERE p.appointment_id = ap.id AND p.status = 'paid') / 100) + COALESCE(ap.manual_paid_amount, 0) as total_paid,
      ap.manual_payment_method,
      CASE WHEN COALESCE(ap.is_guest_placeholder, 0) = 1 THEN NULL ELSE cust.profile_image END as client_avatar,
      CASE 
        WHEN COALESCE(ap.is_guest_placeholder, 0) = 1 THEN COALESCE(ap.guest_phone, cust.phone)
        ELSE cust.phone 
      END as client_phone,
      cust.health_conditions as client_health_conditions,
      cust.allergens as client_allergens,
      (SELECT COALESCE(SUM(sm.quantity * i.cost), 0) FROM session_materials sm JOIN inventory i ON sm.inventory_id = i.id WHERE sm.appointment_id = ap.id AND sm.status != 'released') as total_material_cost,
      (SELECT COUNT(*) FROM reschedule_requests rr WHERE rr.appointment_id = ap.id AND rr.status = 'pending') as has_pending_reschedule_request,
      tp.status as project_status,
      tp.total_sessions_planned as project_sessions_planned,
      tp.total_sessions_actual as project_sessions_actual
    FROM appointments ap
    JOIN users u_cust ON ap.customer_id = u_cust.id
    JOIN users u_art ON ap.artist_id = u_art.id
    LEFT JOIN users u_sec ON ap.secondary_artist_id = u_sec.id
    LEFT JOIN artists ar ON ap.artist_id = ar.user_id
    LEFT JOIN customers cust ON ap.customer_id = cust.user_id
    LEFT JOIN tattoo_projects tp ON ap.project_id = tp.id
    WHERE ap.is_deleted = 0
    ORDER BY ap.appointment_date DESC, ap.start_time DESC
  `;

  db.query(query, (err, results) => {
    if (err) {
      console.error('[ERROR] Error fetching all appointments:', err);
      return res.status(500).json({ success: false, message: 'Database error' });
    }
    // Parse health JSON arrays on each row + extract guest names for placeholder bookings
    results.forEach(row => {
      try { row.client_health_conditions = JSON.parse(row.client_health_conditions || '[]'); } catch { row.client_health_conditions = []; }
      try { row.client_allergens = JSON.parse(row.client_allergens || '[]'); } catch { row.client_allergens = []; }
      // B1 fix: For guest placeholder bookings, extract the real guest name from the structured notes
      if (row.is_guest_placeholder) {
        const nameMatch = (row.notes || '').match(/Name:\s*(.+)/i);
        if (nameMatch && nameMatch[1].trim()) {
          row.client_name = nameMatch[1].trim();
        }
      }
    });
    res.json({ success: true, data: results });
  });
});

// GET single appointment by ID (for Print View)
app.get('/api/admin/appointments/:id', (req, res) => {
  const { id } = req.params;
  const query = `
    SELECT 
      ap.*, 
      u_cust.name as client_name, 
      u_cust.name as customer_name,
      u_cust.email as client_email,
      u_art.name as artist_name,
      u_sec.name as secondary_artist_name,
      ar.commission_rate,
      ((SELECT COALESCE(SUM(amount), 0) FROM payments p WHERE p.appointment_id = ap.id AND p.status = 'paid') / 100) + COALESCE(ap.manual_paid_amount, 0) as total_paid,
      ap.manual_payment_method,
      cust.profile_image as client_avatar,
      cust.phone as client_phone
    FROM appointments ap
    JOIN users u_cust ON ap.customer_id = u_cust.id
    JOIN users u_art ON ap.artist_id = u_art.id
    LEFT JOIN users u_sec ON ap.secondary_artist_id = u_sec.id
    LEFT JOIN artists ar ON ap.artist_id = ar.user_id
    LEFT JOIN customers cust ON ap.customer_id = cust.user_id
    WHERE ap.id = ? AND ap.is_deleted = 0
  `;

  db.query(query, [id], (err, results) => {
    if (err) {
      console.error('[ERROR] Error fetching appointment:', err);
      return res.status(500).json({ success: false, message: 'Database error' });
    }
    if (results.length === 0) {
      return res.status(404).json({ success: false, message: 'Appointment not found' });
    }
    const row = results[0];
    // For guest placeholder bookings, extract the real guest name from structured notes
    if (row.is_guest_placeholder) {
      const nameMatch = (row.notes || '').match(/Name:\s*(.+)/i);
      if (nameMatch && nameMatch[1].trim()) {
        row.client_name = nameMatch[1].trim();
        row.customer_name = nameMatch[1].trim();
      }
    }
    res.json({ success: true, appointment: row });
  });
});

// POST create a new appointment (Admin)
app.post('/api/admin/appointments', async (req, res) => {
  let { customerId, clientEmail, artistId, secondaryArtistId, commissionSplit, serviceType, designTitle, date, startTime, status, notes, price, manualPaidAmount, referenceImage, isFromWizard, customerName, captchaToken, deviceId, consultationMethod, guestEmail, guestPhone, tattooPrice, piercingPrice, waiverAcceptedAt, photoMarketingConsent, piercingJewelry, totalSessions, sessionNumber, projectId } = req.body;

  // Verify reCAPTCHA for public wizard submissions only
  if (isFromWizard) {
    const captchaValid = await verifyCaptcha(captchaToken);
    if (!captchaValid) {
      return res.status(400).json({ success: false, message: 'CAPTCHA verification failed. Please try again.' });
    }
  }

  // Helper to resolve clientEmail to customerId if mobile app sends email instead of ID
  const resolveCustomerId = async () => {
    if (customerId) return customerId;
    if (!clientEmail) return null;
    return new Promise((resolve) => {
      db.query("SELECT id FROM users WHERE email = ? LIMIT 1", [clientEmail], (err, results) => {
        if (!err && results && results.length > 0) {
          resolve(results[0].id);
        } else {
          resolve(null);
        }
      });
    });
  };

  customerId = await resolveCustomerId();

  if (!customerId || !artistId || !date) {
    return res.status(400).json({ success: false, message: 'customerId, artistId, and date are required.' });
  }

  // Sanitize waiverAcceptedAt to MySQL DATETIME format
  let sanitizedWaiverAt = null;
  if (waiverAcceptedAt) {
    try {
      const d = new Date(waiverAcceptedAt);
      if (!isNaN(d.getTime())) {
        // Since process.env.TZ is set, 'd' is already local (Asia/Manila)
        // Format for MySQL DATETIME
        sanitizedWaiverAt = d.getFullYear() + '-' + 
          String(d.getMonth() + 1).padStart(2, '0') + '-' + 
          String(d.getDate()).padStart(2, '0') + ' ' + 
          String(d.getHours()).padStart(2, '0') + ':' + 
          String(d.getMinutes()).padStart(2, '0') + ':' + 
          String(d.getSeconds()).padStart(2, '0');
      }
    } catch (e) {
      console.warn('[WARN] Invalid waiver_accepted_at format:', waiverAcceptedAt);
    }
  }

  // ═══ Rolling Booking Limit: max 2 pending appointments per user/device ═══
  if (isFromWizard || (serviceType && customerId)) {
    const limitCheck = await new Promise((resolve) => {
      // For authenticated users, check by customer_id; for guests, check by device_id
      const isGuest = customerId === 'admin';
      let limitQuery, limitParams;

      if (!isGuest && customerId) {
        limitQuery = `SELECT COUNT(*) as pending FROM appointments WHERE customer_id = ? AND status = 'pending' AND is_deleted = 0`;
        limitParams = [customerId];
      } else if (deviceId) {
        limitQuery = `SELECT COUNT(*) as pending FROM appointments WHERE device_id = ? AND status = 'pending' AND is_deleted = 0`;
        limitParams = [deviceId];
      } else {
        return resolve({ allowed: true }); // No way to track — allow
      }

      db.query(limitQuery, limitParams, (err, results) => {
        if (err) return resolve({ allowed: true }); // Fail open on DB error
        const pendingCount = results[0]?.pending || 0;
        if (pendingCount >= 2) {
          return resolve({ allowed: false, count: pendingCount });
        }
        resolve({ allowed: true });
      });
    });

    if (!limitCheck.allowed) {
      return res.status(429).json({
        success: false,
        message: `You already have ${limitCheck.count} pending booking requests. Please wait for one to be confirmed before booking another.`
      });
    }
  }

  let isGuestPlaceholder = false; // B1 fix: tracks whether this booking is a guest placeholder

  const resolveAdminIds = (callback) => {
    if (customerId === 'admin' || artistId === 'admin') {
      db.query("SELECT id FROM users WHERE user_type = 'admin' ORDER BY id ASC LIMIT 1", (err, results) => {
        const actualAdminId = (results && results.length > 0) ? results[0].id : 1;
        
        if (artistId === 'admin') artistId = actualAdminId;

        if (customerId === 'admin') {
          // B1 Patch: Resolve guest bookings to the dedicated system guest account instead of the Admin's ID
          db.query("SELECT id FROM users WHERE email = 'guest@inkvistar.com' LIMIT 1", (gErr, gResults) => {
            if (!gErr && gResults && gResults.length > 0) {
              customerId = gResults[0].id;
            } else {
              customerId = actualAdminId; // Absolute fallback just in case
            }
            isGuestPlaceholder = true; // Flag: this customer_id is a placeholder, not a real customer
            callback();
          });
        } else {
          callback();
        }
      });
    } else {
      callback();
    }
  };

  resolveAdminIds(() => {
    let cleanDesignTitle = designTitle || '';
    if (serviceType) {
      const escapedService = serviceType.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const prefixRegex = new RegExp(`^(${escapedService}\\s*:\\s*)+`, 'i');
      cleanDesignTitle = cleanDesignTitle.replace(prefixRegex, '');
    }
    const combinedTitle = serviceType && cleanDesignTitle ? `${serviceType}: ${cleanDesignTitle}` : (cleanDesignTitle || serviceType || 'Appointment');
    const finalStatus = status || 'confirmed';

    // Sanitize split prices for dual-service bookings
    const sanitizedTattooPrice = (serviceType === 'Tattoo + Piercing' && tattooPrice !== undefined && tattooPrice !== null) ? (parseFloat(tattooPrice) || 0) : null;
    const sanitizedPiercingPrice = (serviceType === 'Tattoo + Piercing' && piercingPrice !== undefined && piercingPrice !== null) ? (parseFloat(piercingPrice) || 0) : null;
    // Auto-compute total from split prices for dual-service
    const finalPrice = (serviceType === 'Tattoo + Piercing' && sanitizedTattooPrice !== null && sanitizedPiercingPrice !== null)
      ? sanitizedTattooPrice + sanitizedPiercingPrice
      : (price || 0);

    // ═══ TRANSACTION-BASED DOUBLE BOOKING PREVENTION ═══
    // Uses SELECT ... FOR UPDATE to serialize concurrent requests at the DB level.
    db.getConnection((connErr, connection) => {
      if (connErr) {
        console.error('[ERROR] Could not get DB connection for booking transaction:', connErr);
        return res.status(500).json({ success: false, message: 'Server is busy. Please try again in a moment.' });
      }

      // ─── doInsert: performs the actual appointment INSERT inside the open transaction ───
      // acquiredLockId: the slot_locks row id to link back to (null for admin bookings)
      const doInsert = (conn, acquiredLockId) => {
        // Sanitize piercingJewelry: must be an array of valid objects
        let sanitizedJewelry = null;
        if (piercingJewelry && Array.isArray(piercingJewelry) && piercingJewelry.length > 0) {
          sanitizedJewelry = JSON.stringify(piercingJewelry.map(j => ({
            bodyPart: String(j.bodyPart || '').substring(0, 100),
            type: j.type === 'own' ? 'own' : 'studio',
            itemId: j.itemId ? parseInt(j.itemId) : null,
            itemName: String(j.itemName || '').substring(0, 255),
            price: parseFloat(j.price) || 0
          })));
        }

        // Sanitize multi-session fields
        const sanitizedTotalSessions = Math.max(1, Math.min(parseInt(totalSessions) || 1, 20));
        const sanitizedSessionNumber = Math.max(1, Math.min(parseInt(sessionNumber) || 1, sanitizedTotalSessions));
        const sanitizedProjectId = projectId ? parseInt(projectId) : null;

        // ─── _performInsert: executes the actual SQL INSERT with a resolved project ID ───
        const _performInsert = (resolvedProjectId) => {
          const query = `
            INSERT INTO appointments 
              (customer_id, artist_id, secondary_artist_id, commission_split, appointment_date, start_time, design_title, service_type, status, notes, price, tattoo_price, piercing_price, manual_paid_amount, payment_status, is_deleted, before_photo, booking_code, device_id, consultation_method, guest_email, guest_phone, waiver_accepted_at, piercing_jewelry, is_guest_placeholder, project_id, session_number, total_sessions)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'unpaid', 0, ?, 'PENDING', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `;
          conn.query(query, [customerId, artistId, secondaryArtistId || null, commissionSplit || 50, date, startTime || null, combinedTitle, serviceType || 'General Session', finalStatus, notes || '', finalPrice, sanitizedTattooPrice, sanitizedPiercingPrice, manualPaidAmount || 0, referenceImage || null, deviceId || null, consultationMethod || null, guestEmail || null, guestPhone || null, sanitizedWaiverAt, sanitizedJewelry || null, isGuestPlaceholder ? 1 : 0, resolvedProjectId, sanitizedSessionNumber, sanitizedTotalSessions], (err, result) => {
            if (err) {
              // Graceful fallback if new columns don't exist yet (first deploy)
              if (err.code === 'ER_BAD_FIELD_ERROR') {
                console.warn('[WARN] New columns not found, retrying INSERT without project/session fields...');
                const fallbackQuery = `
                  INSERT INTO appointments 
                    (customer_id, artist_id, secondary_artist_id, commission_split, appointment_date, start_time, design_title, service_type, status, notes, price, tattoo_price, piercing_price, manual_paid_amount, payment_status, is_deleted, before_photo, booking_code, device_id, consultation_method, guest_email, guest_phone, piercing_jewelry, is_guest_placeholder)
                  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'unpaid', 0, ?, 'PENDING', ?, ?, ?, ?, ?, ?)
                `;
                return conn.query(fallbackQuery, [customerId, artistId, secondaryArtistId || null, commissionSplit || 50, date, startTime || null, combinedTitle, serviceType || 'General Session', finalStatus, notes || '', finalPrice, sanitizedTattooPrice, sanitizedPiercingPrice, manualPaidAmount || 0, referenceImage || null, deviceId || null, consultationMethod || null, guestEmail || null, guestPhone || null, sanitizedJewelry || null, isGuestPlaceholder ? 1 : 0], (fbErr, fbResult) => {
                  if (fbErr) {
                    console.error('[ERROR] Fallback INSERT also failed:', fbErr);
                    return conn.rollback(() => { conn.release(); res.status(500).json({ success: false, message: 'Database error: ' + fbErr.message }); });
                  }
                  const fbBookingCode = generateBookingCode('O', serviceType, fbResult.insertId);
                  db.query('UPDATE appointments SET booking_code = ? WHERE id = ?', [fbBookingCode, fbResult.insertId]);
                  if (acquiredLockId) db.query('UPDATE slot_locks SET appointment_id = ? WHERE id = ?', [fbResult.insertId, acquiredLockId]);
                  _fireNotificationsAndCommit(conn, fbResult.insertId, fbBookingCode);
                });
              }
              return conn.rollback(() => { conn.release(); res.status(500).json({ success: false, message: 'Database error: ' + err.message }); });
            }

            const bookingCode = generateBookingCode('O', serviceType, result.insertId);
            db.query('UPDATE appointments SET booking_code = ? WHERE id = ?', [bookingCode, result.insertId]);
            if (acquiredLockId) db.query('UPDATE slot_locks SET appointment_id = ? WHERE id = ?', [result.insertId, acquiredLockId]);

            // If this is a rebook (projectId provided), update the project's session count
            if (resolvedProjectId && sanitizedSessionNumber > 1) {
              db.query('UPDATE tattoo_projects SET total_sessions_actual = ? WHERE id = ?', [sanitizedSessionNumber, resolvedProjectId]);
            }

            _fireNotificationsAndCommit(conn, result.insertId, bookingCode);
          });
        };

        // ═══ Multi-Session Project Auto-Creation ═══
        // If totalSessions > 1 and no existing projectId, create a new tattoo_project first
        if (sanitizedTotalSessions > 1 && !sanitizedProjectId) {
          const projQuery = `INSERT INTO tattoo_projects (customer_id, artist_id, design_title, total_sessions_planned, status) VALUES (?, ?, ?, ?, 'active')`;
          conn.query(projQuery, [customerId, artistId, designTitle || 'Untitled Project', sanitizedTotalSessions], (projErr, projResult) => {
            if (projErr) {
              console.error('[ERROR] Could not create tattoo_project:', projErr.message);
              // Non-fatal: proceed with null project_id
              return _performInsert(null);
            }
            console.log(`[OK] Created tattoo_project #${projResult.insertId} for ${sanitizedTotalSessions} sessions`);
            _performInsert(projResult.insertId);
          });
        } else {
          // Single session OR rebook with existing projectId
          _performInsert(sanitizedProjectId);
        }
      };

      // ─── _fireNotificationsAndCommit: sends all post-booking notifications then commits ───
      const _fireNotificationsAndCommit = (conn, appointmentId, bookingCode) => {
        const clientNameStr = customerName || 'a guest';
        const waiverNote = waiverAcceptedAt ? ' [WAIVER_SIGNED] Service waiver signed.' : '';
        createNotification(customerId, 'Booking Request Received', `We have received your booking request [${bookingCode}] for ${date} and will calculate a quote for you shortly.${waiverNote}`, 'appointment_request', appointmentId);

        const guestContactStr = [guestEmail, guestPhone].filter(Boolean).join(' | ') || 'No contact info';
        db.query("SELECT id FROM users WHERE user_type IN ('admin', 'manager') AND is_deleted = 0", (aErr, admins) => {
          if (!aErr && admins && admins.length > 0) {
            admins.forEach(a => {
              const waiverStatus = waiverAcceptedAt ? ' [WAIVER_SIGNED]' : ' [NO_WAIVER]';
              createNotification(a.id, 'Guest Consultation Request', `New ${serviceType || 'Consultation'} from ${clientNameStr}. Idea: "${designTitle}". Contact: ${guestContactStr}. Ref: [${bookingCode}].${waiverStatus} Pending review.`, 'appointment_request', appointmentId);
            });
          }
        });

        const apptDate = new Date(date).toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
        const apptTime = startTime ? new Date(`2000-01-01T${startTime}`).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true }) : 'TBD';
        const displayDesign = designTitle || 'Consultation';
        const displayMethod = consultationMethod || 'Face-to-Face';

        if (guestPhone) sendSMS(guestPhone, `InkVistAR: Hi ${clientNameStr}! Your consultation request [${bookingCode}] for "${displayDesign}" on ${apptDate} at ${apptTime} has been received. We'll review and contact you within 24 hours. Thank you!`);

        const commitAndRespond = (emailAddr, htmlBody) => {
          if (emailAddr && htmlBody) sendResendEmail(emailAddr, `InkVistAR: Consultation Request [${bookingCode}] Received`, htmlBody);
          conn.commit((commitErr) => {
            conn.release();
            if (commitErr) console.error('[WARN] Commit error:', commitErr);
            // Broadcast to all connected clients so other booking wizards on the same slot
            // receive an instant real-time conflict notification without needing to poll
            io.emit('slot_booked', { date, time: startTime });
            res.json({ success: true, message: 'Appointment created successfully', id: appointmentId, bookingCode });
          });
        };

        const buildConfirmHtml = (name) => buildEmailHtml(`
          <h2 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#C19A6B;text-align:center;">Consultation Request Received!</h2>
          <p style="margin:0 0 16px;">Hello ${name},</p>
          <p style="margin:0 0 16px;">Thank you for reaching out to InkVistAR Studio! We have received your consultation request and our team is reviewing the details.</p>
          <div style="background-color:#faf8f5;border:1px solid #e2ddd5;border-radius:12px;padding:24px;margin-bottom:16px;">
            <p style="margin:0 0 10px;font-size:14px;"><strong style="color:#334155;">Ref Code:</strong> <span style="color:#C19A6B;font-family:monospace;font-weight:700;">${bookingCode}</span></p>
            <p style="margin:0 0 10px;font-size:14px;"><strong style="color:#334155;">Design Idea:</strong> ${displayDesign}</p>
            <p style="margin:0 0 10px;font-size:14px;"><strong style="color:#334155;">Date:</strong> ${apptDate}</p>
            <p style="margin:0 0 10px;font-size:14px;"><strong style="color:#334155;">Time:</strong> ${apptTime}</p>
            <p style="margin:0;font-size:14px;"><strong style="color:#334155;">Method:</strong> ${displayMethod}</p>
          </div>
          <p style="margin:0 0 16px;line-height:1.6;">Our staff will reach out within <strong style="color:#C19A6B;">24 hours</strong> to confirm and discuss pricing.</p>
          <p style="margin:0;font-size:14px;color:#94a3b8;text-align:center;">— The InkVistAR Studio Team</p>
        `);

        if (guestEmail) {
          commitAndRespond(guestEmail, buildConfirmHtml(clientNameStr));
        } else {
          db.query('SELECT email, name FROM users WHERE id = ?', [customerId], (cErr, cRows) => {
            const emailAddr = (!cErr && cRows && cRows.length > 0) ? cRows[0].email : null;
            const custName = (!cErr && cRows && cRows.length > 0) ? (cRows[0].name || 'Valued Client') : clientNameStr;
            commitAndRespond(emailAddr, emailAddr ? buildConfirmHtml(custName) : null);
          });
        }
      };

      connection.beginTransaction((txErr) => {
        if (txErr) {
          connection.release();
          console.error('[ERROR] Could not begin transaction:', txErr);
          return res.status(500).json({ success: false, message: 'Server is busy. Please try again in a moment.' });
        }

        // For wizard/consultation bookings: check total slot capacity (studio-wide)
        // For admin-created bookings: check specific artist/customer collision
        let checkQuery, checkParams;

        if (isFromWizard) {
          // Studio-wide capacity check + per-customer self-conflict in one atomic query
          const resolvedCustomerId = customerId;
          checkQuery = `
            SELECT 
              COUNT(*) as slot_count,
              (SELECT COUNT(id) FROM users WHERE user_type = 'artist' AND is_deleted = 0) as artist_count,
              (SELECT COUNT(id) FROM appointments 
               WHERE customer_id = ? AND appointment_date = ? AND start_time = ?
               AND status NOT IN ('cancelled', 'rejected') AND is_deleted = 0) as self_conflict
            FROM appointments
            WHERE appointment_date = ? AND start_time = ? AND status NOT IN ('cancelled', 'rejected') AND is_deleted = 0
            FOR UPDATE
          `;
          checkParams = [resolvedCustomerId, date, startTime, date, startTime];
        } else {
          // Admin booking: check specific artist or customer collision
          checkQuery = `
            SELECT id FROM appointments 
            WHERE appointment_date = ? AND start_time = ? AND status NOT IN ('cancelled', 'rejected') AND is_deleted = 0
            AND (artist_id = ? OR customer_id = ?)
            FOR UPDATE
          `;
          checkParams = [date, startTime, artistId, customerId];
        }

        connection.query(checkQuery, checkParams, (checkErr, checkResults) => {
          if (checkErr) {
            return connection.rollback(() => {
              connection.release();
              console.error('[ERROR] Error checking double booking:', checkErr);
              return res.status(500).json({ success: false, message: 'Database error' });
            });
          }

          // Evaluate conflict
          let hasConflict = false;
          let conflictMessage = '';

          if (isFromWizard) {
            // ═══ SLOT LOCK ACQUISITION (atomic mutex via UNIQUE KEY on slot_locks table) ═══
            // Step 1: Count how many artists are available (= max concurrent bookings per slot)
            db.query(
              `SELECT COUNT(id) as artist_count FROM users WHERE user_type = 'artist' AND is_deleted = 0`,
              (acErr, acRows) => {
                if (acErr) {
                  return connection.rollback(() => {
                    connection.release();
                    return res.status(500).json({ success: false, message: 'Database error checking capacity.' });
                  });
                }

                const artistCount = Math.max(1, acRows[0]?.artist_count || 1);

                // Step 2: Per-customer self-conflict check for registered users
                // Guests all share the same admin placeholder customer_id — skip for them
                const isRegisteredCustomer = customerId && !isNaN(parseInt(customerId)) && parseInt(customerId) !== parseInt(artistId);

                // Step 3: Check how many slot_lock rows already exist at this date+time
                // Then attempt to INSERT a new lock at the next available slot_index
                db.query(
                  `SELECT COUNT(*) as locked_count FROM slot_locks WHERE appointment_date = ? AND start_time = ?`,
                  [date, startTime],
                  (lcErr, lcRows) => {
                    if (lcErr) {
                      return connection.rollback(() => {
                        connection.release();
                        return res.status(500).json({ success: false, message: 'Database error reading slot locks.' });
                      });
                    }

                    const lockedCount = lcRows[0]?.locked_count || 0;

                    if (lockedCount >= artistCount) {
                      // All slots are already locked — full capacity
                      return connection.rollback(() => {
                        connection.release();
                        return res.status(409).json({ success: false, message: 'SLOT_TAKEN: This time slot was just booked by another client. Please select a different time.', code: 'SLOT_TAKEN' });
                      });
                    }

                    // Step 4: Check per-customer self-conflict (registered only)
                    const selfCheckQuery = isRegisteredCustomer
                      ? `SELECT id FROM appointments WHERE customer_id = ? AND appointment_date = ? AND start_time = ? AND status NOT IN ('cancelled', 'rejected') AND is_deleted = 0 LIMIT 1`
                      : null;

                    const doSelfCheck = (callback) => {
                      if (!selfCheckQuery) return callback(null, false);
                      db.query(selfCheckQuery, [customerId, date, startTime], (scErr, scRows) => {
                        if (scErr) return callback(scErr);
                        callback(null, scRows.length > 0);
                      });
                    };

                    doSelfCheck((scErr, hasSelfConflict) => {
                      if (scErr) {
                        return connection.rollback(() => {
                          connection.release();
                          return res.status(500).json({ success: false, message: 'Database error during self-conflict check.' });
                        });
                      }

                      if (hasSelfConflict) {
                        return connection.rollback(() => {
                          connection.release();
                          return res.status(409).json({ success: false, message: 'You already have a booking at this date and time. Please choose a different slot.', code: 'SLOT_TAKEN' });
                        });
                      }

                      // Step 5: Attempt to atomically acquire the next available slot lock
                      // INSERT IGNORE + UNIQUE KEY on (date, time, slot_index) ensures only one winner per slot
                      const nextSlotIndex = lockedCount; // 0-indexed: if 1 lock exists, try slot_index 1
                      connection.query(
                        `INSERT IGNORE INTO slot_locks (appointment_date, start_time, slot_index) VALUES (?, ?, ?)`,
                        [date, startTime, nextSlotIndex],
                        (lockErr, lockResult) => {
                          if (lockErr) {
                            return connection.rollback(() => {
                              connection.release();
                              return res.status(500).json({ success: false, message: 'Database error acquiring slot lock.' });
                            });
                          }

                          if (lockResult.affectedRows === 0) {
                            // INSERT IGNORE silently failed — another request just grabbed this slot_index
                            return connection.rollback(() => {
                              connection.release();
                              return res.status(409).json({ success: false, message: 'SLOT_TAKEN: This time slot was just booked by another client. Please select a different time.', code: 'SLOT_TAKEN' });
                            });
                          }

                          // Lock acquired — record the slot_lock_id to link to the appointment after INSERT
                          const acquiredLockId = lockResult.insertId;

                          // Proceed with the appointment INSERT
                          doInsert(connection, acquiredLockId);
                        }
                      );
                    });
                  }
                );
              }
            );
            return; // doInsert() will call res.json() asynchronously
          } else {
            if (checkResults.length > 0) {
              hasConflict = true;
              conflictMessage = 'Scheduling Conflict: The artist or client already has an appointment at this date and time.';
            }
          }

          if (hasConflict) {
            return connection.rollback(() => {
              connection.release();
              return res.status(409).json({ success: false, message: conflictMessage, code: 'SLOT_TAKEN' });
            });
          }

          // No conflict — proceed with INSERT inside the same transaction
          // Sanitize piercingJewelry: must be an array of valid objects
          let sanitizedJewelry = null;
          if (piercingJewelry && Array.isArray(piercingJewelry) && piercingJewelry.length > 0) {
            sanitizedJewelry = JSON.stringify(piercingJewelry.map(j => ({
              bodyPart: String(j.bodyPart || '').substring(0, 100),
              type: j.type === 'own' ? 'own' : 'studio',
              itemId: j.itemId ? parseInt(j.itemId) : null,
              itemName: String(j.itemName || '').substring(0, 255),
              price: parseFloat(j.price) || 0
            })));
          }

          const query = `
            INSERT INTO appointments 
              (customer_id, artist_id, secondary_artist_id, commission_split, appointment_date, start_time, design_title, service_type, status, notes, price, tattoo_price, piercing_price, manual_paid_amount, payment_status, is_deleted, before_photo, booking_code, device_id, consultation_method, guest_email, guest_phone, waiver_accepted_at, piercing_jewelry, is_guest_placeholder)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'unpaid', 0, ?, 'PENDING', ?, ?, ?, ?, ?, ?, ?)
          `;
          connection.query(query, [customerId, artistId, secondaryArtistId || null, commissionSplit || 50, date, startTime || null, combinedTitle, serviceType || 'General Session', finalStatus, notes || '', finalPrice, sanitizedTattooPrice, sanitizedPiercingPrice, manualPaidAmount || 0, referenceImage || null, deviceId || null, consultationMethod || null, guestEmail || null, guestPhone || null, waiverAcceptedAt || null, sanitizedJewelry || null, isGuestPlaceholder ? 1 : 0], (err, result) => {
            if (err) {
              // Graceful fallback if waiver_accepted_at column doesn't exist yet
              if (err.code === 'ER_BAD_FIELD_ERROR' && err.message.includes('waiver_accepted_at')) {
                console.warn('[WARN] waiver_accepted_at column not found, retrying INSERT without it...');
                const fallbackQuery = `
              INSERT INTO appointments 
                (customer_id, artist_id, secondary_artist_id, commission_split, appointment_date, start_time, design_title, service_type, status, notes, price, tattoo_price, piercing_price, manual_paid_amount, payment_status, is_deleted, before_photo, booking_code, device_id, consultation_method, guest_email, guest_phone, piercing_jewelry, is_guest_placeholder)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'unpaid', 0, ?, 'PENDING', ?, ?, ?, ?, ?, ?)
            `;
                return connection.query(fallbackQuery, [customerId, artistId, secondaryArtistId || null, commissionSplit || 50, date, startTime || null, combinedTitle, serviceType || 'General Session', finalStatus, notes || '', finalPrice, sanitizedTattooPrice, sanitizedPiercingPrice, manualPaidAmount || 0, referenceImage || null, deviceId || null, consultationMethod || null, guestEmail || null, guestPhone || null, sanitizedJewelry || null, isGuestPlaceholder ? 1 : 0], (fbErr, fbResult) => {
                  if (fbErr) {
                    console.error('[ERROR] Fallback INSERT also failed:', fbErr);
                    return connection.rollback(() => { connection.release(); res.status(500).json({ success: false, message: 'Database error: ' + fbErr.message }); });
                  }
                  const fbBookingCode = generateBookingCode(isFromWizard ? 'O' : 'W', serviceType, fbResult.insertId);
                  db.query('UPDATE appointments SET booking_code = ? WHERE id = ?', [fbBookingCode, fbResult.insertId]);
                  if (isFromWizard) {
                    const fbClientName = customerName || 'a guest';
                    createNotification(customerId, 'Booking Request Received', `We have received your booking request [${fbBookingCode}] for ${date} and will calculate a quote for you shortly.`, 'appointment_request', fbResult.insertId);

                    // Notify ALL Admins/Managers
                    const fbGuestContact = [guestEmail, guestPhone].filter(Boolean).join(' | ') || 'No contact info';
                    db.query("SELECT id FROM users WHERE user_type IN ('admin', 'manager') AND is_deleted = 0", (aErr, admins) => {
                      if (!aErr && admins && admins.length > 0) {
                        admins.forEach(admin => {
                          createNotification(admin.id, 'Guest Consultation Request', `New ${serviceType || 'Consultation'} from ${fbClientName} (Guest). Idea: "${designTitle}". Contact: ${fbGuestContact}. Ref: [${fbBookingCode}]. Pending review.`, 'appointment_request', fbResult.insertId);
                        });
                      }
                    });

                    // Guest Email + SMS (mirrors primary path)
                    const fbAppointmentDate = new Date(date).toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
                    const fbAppointmentTime = startTime ? new Date(`2000-01-01T${startTime}`).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true }) : 'TBD';
                    const fbDisplayDesign = designTitle || 'Consultation';
                    const fbDisplayMethod = consultationMethod || 'Face-to-Face';

                    if (guestPhone) {
                      const smsBody = `InkVistAR: Hi ${fbClientName}! Your consultation request [${fbBookingCode}] for "${fbDisplayDesign}" on ${fbAppointmentDate} at ${fbAppointmentTime} has been received. We'll review and contact you within 24 hours. Thank you!`;
                      sendSMS(guestPhone, smsBody);
                    }

                    if (guestEmail) {
                      console.log(`[DEBUG] Fallback path — sending guest email to: ${guestEmail}`);
                      const fbGuestHtml = buildEmailHtml(`
                    <h2 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#C19A6B;text-align:center;">Consultation Request Received!</h2>
                    <p style="margin:0 0 20px;font-size:13px;color:#64748b;text-align:center;">We're excited to help you on your next piece</p>
                    <p style="margin:0 0 16px;">Hello ${fbClientName},</p>
                    <p style="margin:0 0 16px;">Thank you for reaching out to InkVistAR Studio! We have received your consultation request and our team is reviewing the details.</p>
                    
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td align="center" style="padding:10px 0 20px;">
                      <div style="text-align:left;display:inline-block;background-color:#faf8f5;border:1px solid #e2ddd5;border-radius:12px;padding:24px;width:100%;max-width:400px;box-sizing:border-box;">
                        <p style="margin:0 0 12px;font-size:14px;color:#94a3b8;"><strong style="color:#334155;display:inline-block;width:100px;">Ref Code:</strong> <span style="color:#C19A6B;font-family:monospace;font-weight:700;">${fbBookingCode}</span></p>
                        <p style="margin:0 0 12px;font-size:14px;color:#94a3b8;"><strong style="color:#334155;display:inline-block;width:100px;">Design Idea:</strong> <span style="color:#C19A6B;">${fbDisplayDesign}</span></p>
                        <p style="margin:0 0 12px;font-size:14px;color:#94a3b8;"><strong style="color:#334155;display:inline-block;width:100px;">Date:</strong> <span style="color:#C19A6B;">${fbAppointmentDate}</span></p>
                        <p style="margin:0 0 12px;font-size:14px;color:#94a3b8;"><strong style="color:#334155;display:inline-block;width:100px;">Time:</strong> <span style="color:#C19A6B;">${fbAppointmentTime}</span></p>
                        <p style="margin:0;font-size:14px;color:#94a3b8;"><strong style="color:#334155;display:inline-block;width:100px;">Method:</strong> <span style="color:#C19A6B;">${fbDisplayMethod}</span></p>
                      </div>
                    </td></tr></table>

                    <p style="margin:0 0 16px;line-height:1.6;">Our staff will reach out to you within the next <strong style="color:#C19A6B;">24 hours</strong> to confirm your appointment and discuss pricing.</p>
                    
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td align="center" style="padding:8px 0 16px;">
                      <div style="display:inline-block;padding:12px 20px;background:rgba(193,154,107,0.1);border:1px solid rgba(193,154,107,0.2);border-radius:10px;">
                        <p style="margin:0;font-size:13px;color:#94a3b8;">Tip: <strong style="color:#334155;">Create an InkVistAR account</strong> with this email to track your booking, receive updates, and manage future appointments.</p>
                      </div>
                    </td></tr></table>

                    <p style="margin:0;font-size:14px;color:#94a3b8;text-align:center;">- The InkVistAR Studio Team</p>
                  `);
                      sendResendEmail(guestEmail, `InkVistAR: Consultation Request [${fbBookingCode}] Received`, fbGuestHtml);
                    } else {
                      // Logged-in customer fallback — look up their email
                      db.query('SELECT email, name FROM users WHERE id = ?', [customerId], (custErr, custRows) => {
                        if (!custErr && custRows && custRows.length > 0 && custRows[0].email) {
                          const custName = custRows[0].name || 'Valued Client';
                          const custHtml = buildEmailHtml(`
                        <h2 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#C19A6B;text-align:center;">Consultation Request Received!</h2>
                        <p style="margin:0 0 20px;font-size:13px;color:#64748b;text-align:center;">We're excited to help you on your next piece</p>
                        <p style="margin:0 0 16px;">Hello ${custName},</p>
                        <p style="margin:0 0 16px;">Thank you for submitting your consultation request! We have received your details and our team is reviewing them now.</p>
                        
                        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td align="center" style="padding:10px 0 20px;">
                          <div style="text-align:left;display:inline-block;background-color:#faf8f5;border:1px solid #e2ddd5;border-radius:12px;padding:24px;width:100%;max-width:400px;box-sizing:border-box;">
                            <p style="margin:0 0 12px;font-size:14px;color:#94a3b8;"><strong style="color:#334155;display:inline-block;width:100px;">Ref Code:</strong> <span style="color:#C19A6B;font-family:monospace;font-weight:700;">${fbBookingCode}</span></p>
                            <p style="margin:0 0 12px;font-size:14px;color:#94a3b8;"><strong style="color:#334155;display:inline-block;width:100px;">Design Idea:</strong> <span style="color:#C19A6B;">${fbDisplayDesign}</span></p>
                            <p style="margin:0 0 12px;font-size:14px;color:#94a3b8;"><strong style="color:#334155;display:inline-block;width:100px;">Date:</strong> <span style="color:#C19A6B;">${fbAppointmentDate}</span></p>
                            <p style="margin:0 0 12px;font-size:14px;color:#94a3b8;"><strong style="color:#334155;display:inline-block;width:100px;">Time:</strong> <span style="color:#C19A6B;">${fbAppointmentTime}</span></p>
                            <p style="margin:0;font-size:14px;color:#94a3b8;"><strong style="color:#334155;display:inline-block;width:100px;">Method:</strong> <span style="color:#C19A6B;">${fbDisplayMethod}</span></p>
                          </div>
                        </td></tr></table>

                        <p style="margin:0 0 16px;line-height:1.6;">Our staff will reach out within <strong style="color:#C19A6B;">24 hours</strong> to confirm and discuss pricing. Track this booking in your <strong>My Bookings</strong> dashboard.</p>
                        <p style="margin:0;font-size:14px;color:#94a3b8;text-align:center;">- The InkVistAR Studio Team</p>
                      `);
                          sendResendEmail(custRows[0].email, `InkVistAR: Consultation Request [${fbBookingCode}] Received`, custHtml);
                        }
                      });
                    }
                  }
                  return connection.commit((commitErr) => { connection.release(); if (commitErr) console.error('[WARN] Fallback commit error:', commitErr); res.json({ success: true, message: 'Appointment created successfully', id: fbResult.insertId, bookingCode: fbBookingCode }); });
                });
              }
              console.error('[ERROR] Error creating admin appointment:', err);
              return connection.rollback(() => { connection.release(); res.status(500).json({ success: false, message: 'Database error: ' + err.message }); });
            }

            // Generate clean booking code using the auto-increment ID and UPDATE the row
            const bookingCode = generateBookingCode(isFromWizard ? 'O' : 'W', serviceType, result.insertId);
            db.query('UPDATE appointments SET booking_code = ? WHERE id = ?', [bookingCode, result.insertId]);
            // If securely routed from the public frontend wizard, alert the Admin
            if (isFromWizard) {
              const clientNameStr = customerName || 'a guest';
              const waiverNote = waiverAcceptedAt ? ' [WAIVER_SIGNED] Service waiver signed.' : '';
              createNotification(customerId, 'Booking Request Received', `We have received your booking request [${bookingCode}] for ${date} and will calculate a quote for you shortly.${waiverNote}`, 'appointment_request', result.insertId);

              // Notify ALL Admins/Managers about the guest consultation
              const guestContactStr = [guestEmail, guestPhone].filter(Boolean).join(' | ') || 'No contact info';
              db.query("SELECT id FROM users WHERE user_type IN ('admin', 'manager') AND is_deleted = 0", (adminErr, admins) => {
                if (!adminErr && admins && admins.length > 0) {
                  admins.forEach(admin => {
                    const waiverStatus = waiverAcceptedAt ? ' [WAIVER_SIGNED] Virtual waiver signed.' : ' [NO_WAIVER] No waiver on file.';
                    createNotification(admin.id, 'Guest Consultation Request', `New ${serviceType || 'Consultation'} from ${clientNameStr} (Guest — no account). Idea: "${designTitle}". Contact: ${guestContactStr}. Ref: [${bookingCode}].${waiverStatus} Pending review.`, 'appointment_request', result.insertId);
                  });
                }
              });

              // ═══ Guest External Notifications (SMS + Email) ═══
              console.log(`[DEBUG] Guest notification block — guestEmail: "${guestEmail}", guestPhone: "${guestPhone}", isFromWizard: ${isFromWizard}, customerId: ${customerId}`);
              const appointmentDate = new Date(date).toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
              const appointmentTime = startTime ? new Date(`2000-01-01T${startTime}`).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true }) : 'TBD';
              const displayDesign = designTitle || 'Consultation';
              const displayMethod = consultationMethod || 'Face-to-Face';

              // SMS — send if phone provided
              if (guestPhone) {
                const smsBody = `InkVistAR: Hi ${clientNameStr}! Your consultation request [${bookingCode}] for "${displayDesign}" on ${appointmentDate} at ${appointmentTime} has been received. We'll review and contact you within 24 hours. Thank you!`;
                sendSMS(guestPhone, smsBody);
              }

              // Email — send if email provided
              if (guestEmail) {
                const guestHtml = buildEmailHtml(`
              <h2 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#C19A6B;text-align:center;">Consultation Request Received!</h2>
              <p style="margin:0 0 20px;font-size:13px;color:#64748b;text-align:center;">We're excited to help you on your next piece</p>
              <p style="margin:0 0 16px;">Hello ${clientNameStr},</p>
              <p style="margin:0 0 16px;">Thank you for reaching out to InkVistAR Studio! We have received your consultation request and our team is reviewing the details.</p>
              
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td align="center" style="padding:10px 0 20px;">
                <div style="text-align:left;display:inline-block;background-color:#faf8f5;border:1px solid #e2ddd5;border-radius:12px;padding:24px;width:100%;max-width:400px;box-sizing:border-box;">
                  <p style="margin:0 0 12px;font-size:14px;color:#94a3b8;"><strong style="color:#334155;display:inline-block;width:100px;">Ref Code:</strong> <span style="color:#C19A6B;font-family:monospace;font-weight:700;">${bookingCode}</span></p>
                  <p style="margin:0 0 12px;font-size:14px;color:#94a3b8;"><strong style="color:#334155;display:inline-block;width:100px;">Design Idea:</strong> <span style="color:#C19A6B;">${displayDesign}</span></p>
                  <p style="margin:0 0 12px;font-size:14px;color:#94a3b8;"><strong style="color:#334155;display:inline-block;width:100px;">Date:</strong> <span style="color:#C19A6B;">${appointmentDate}</span></p>
                  <p style="margin:0 0 12px;font-size:14px;color:#94a3b8;"><strong style="color:#334155;display:inline-block;width:100px;">Time:</strong> <span style="color:#C19A6B;">${appointmentTime}</span></p>
                  <p style="margin:0;font-size:14px;color:#94a3b8;"><strong style="color:#334155;display:inline-block;width:100px;">Method:</strong> <span style="color:#C19A6B;">${displayMethod}</span></p>
                </div>
              </td></tr></table>

              ${waiverAcceptedAt ? `
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td align="center" style="padding:4px 0 16px;">
                <div style="display:inline-block;padding:14px 20px;background:rgba(16,185,129,0.08);border:1px solid rgba(16,185,129,0.25);border-radius:10px;width:100%;max-width:400px;box-sizing:border-box;text-align:left;">
                  <p style="margin:0 0 6px;font-size:14px;font-weight:700;color:#10b981;">Service Waiver Signed</p>
                  <p style="margin:0;font-size:13px;color:#94a3b8;">You electronically accepted the Service Waiver & Release of Liability on <strong style="color:#334155;">${new Date(waiverAcceptedAt).toLocaleString('en-US', { dateStyle: 'long', timeStyle: 'short' })}</strong>. A copy is attached to your booking record.</p>
                </div>
              </td></tr></table>
              ` : ''}

              <p style="margin:0 0 16px;line-height:1.6;">Our staff will reach out to you within the next <strong style="color:#C19A6B;">24 hours</strong> to confirm your appointment and discuss pricing.</p>
              
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td align="center" style="padding:8px 0 16px;">
                <div style="display:inline-block;padding:12px 20px;background:rgba(193,154,107,0.1);border:1px solid rgba(193,154,107,0.2);border-radius:10px;">
                  <p style="margin:0;font-size:13px;color:#94a3b8;">Tip: <strong style="color:#334155;">Tip:</strong> Create an InkVistAR account with this email to track your booking, receive updates, and manage future appointments.</p>
                </div>
              </td></tr></table>

              <p style="margin:0;font-size:14px;color:#94a3b8;text-align:center;">— The InkVistAR Studio Team</p>
            `);
                sendResendEmail(guestEmail, `InkVistAR: Consultation Request [${bookingCode}] Received`, guestHtml);
              } else {
                // Logged-in customer — look up their email and send confirmation
                db.query('SELECT email, name FROM users WHERE id = ?', [customerId], (custErr, custRows) => {
                  if (!custErr && custRows && custRows.length > 0 && custRows[0].email) {
                    const custName = custRows[0].name || 'Valued Client';
                    const custHtml = buildEmailHtml(`
                  <h2 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#C19A6B;text-align:center;">Consultation Request Received!</h2>
                  <p style="margin:0 0 20px;font-size:13px;color:#64748b;text-align:center;">We're excited to help you on your next piece</p>
                  <p style="margin:0 0 16px;">Hello ${custName},</p>
                  <p style="margin:0 0 16px;">Thank you for submitting your consultation request through InkVistAR! We have received your details and our team is reviewing them now.</p>
                  
                  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td align="center" style="padding:10px 0 20px;">
                    <div style="text-align:left;display:inline-block;background-color:#faf8f5;border:1px solid #e2ddd5;border-radius:12px;padding:24px;width:100%;max-width:400px;box-sizing:border-box;">
                      <p style="margin:0 0 12px;font-size:14px;color:#94a3b8;"><strong style="color:#334155;display:inline-block;width:100px;">Ref Code:</strong> <span style="color:#C19A6B;font-family:monospace;font-weight:700;">${bookingCode}</span></p>
                      <p style="margin:0 0 12px;font-size:14px;color:#94a3b8;"><strong style="color:#334155;display:inline-block;width:100px;">Design Idea:</strong> <span style="color:#C19A6B;">${displayDesign}</span></p>
                      <p style="margin:0 0 12px;font-size:14px;color:#94a3b8;"><strong style="color:#334155;display:inline-block;width:100px;">Date:</strong> <span style="color:#C19A6B;">${appointmentDate}</span></p>
                      <p style="margin:0 0 12px;font-size:14px;color:#94a3b8;"><strong style="color:#334155;display:inline-block;width:100px;">Time:</strong> <span style="color:#C19A6B;">${appointmentTime}</span></p>
                      <p style="margin:0;font-size:14px;color:#94a3b8;"><strong style="color:#334155;display:inline-block;width:100px;">Method:</strong> <span style="color:#C19A6B;">${displayMethod}</span></p>
                    </div>
                  </td></tr></table>

                  ${waiverAcceptedAt ? `
                  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td align="center" style="padding:4px 0 16px;">
                    <div style="display:inline-block;padding:14px 20px;background:rgba(16,185,129,0.08);border:1px solid rgba(16,185,129,0.25);border-radius:10px;width:100%;max-width:400px;box-sizing:border-box;text-align:left;">
                      <p style="margin:0 0 6px;font-size:14px;font-weight:700;color:#10b981;">Service Waiver Signed</p>
                      <p style="margin:0;font-size:13px;color:#94a3b8;">You electronically accepted the Service Waiver & Release of Liability on <strong style="color:#334155;">${new Date(waiverAcceptedAt).toLocaleString('en-US', { dateStyle: 'long', timeStyle: 'short' })}</strong>.</p>
                    </div>
                  </td></tr></table>
                  ` : ''}

                  <p style="margin:0 0 16px;line-height:1.6;">Our staff will reach out to you within the next <strong style="color:#C19A6B;">24 hours</strong> to confirm your appointment and discuss pricing. You can also track this booking in your <strong>My Bookings</strong> dashboard.</p>
                  <p style="margin:0;font-size:14px;color:#94a3b8;text-align:center;">- The InkVistAR Studio Team</p>
                `);
                    sendResendEmail(custRows[0].email, `InkVistAR: Consultation Request [${bookingCode}] Received`, custHtml);
                  }
                });
              }
            } else {
              createNotification(customerId, 'Appointment Scheduled', `Your appointment [${bookingCode}] has been scheduled for ${date}.`, 'appointment_confirmed', result.insertId);
              if (artistId) {
                // Only notify if the artist is not an admin user
                db.query('SELECT user_type FROM users WHERE id = ?', [artistId], (aErr, aRes) => {
                  if (!aErr && aRes.length && aRes[0].user_type !== 'admin') {
                    createNotification(artistId, 'New Session Assigned', `You have been scheduled for a new session [${bookingCode}] on ${date}.`, 'appointment_confirmed', result.insertId);
                  }
                });
              }
            }

            // Commit the transaction and release the connection
            connection.commit((commitErr) => {
              connection.release();
              if (commitErr) console.error('[WARN] Commit error (booking already inserted):', commitErr);
              res.json({ success: true, message: 'Appointment created successfully', id: result.insertId, bookingCode: bookingCode });
            });
          });
        });
      }); // end connection.beginTransaction
    }); // end db.getConnection
  });
});

// PUT update an appointment (Admin)
app.put('/api/admin/appointments/:id', (req, res) => {
  const { id } = req.params;
  const body = req.body || {};

  // SANITIZE INPUTS to prevent DB conversion errors (e.g. empty strings for numbers/dates)
  const customerId = body.customerId ? parseInt(body.customerId) : undefined;
  const artistId = body.artistId ? (body.artistId === 'null' || body.artistId === '' ? null : parseInt(body.artistId)) : undefined;
  const secondaryArtistId = body.secondaryArtistId !== undefined ? (body.secondaryArtistId === null || body.secondaryArtistId === '' || String(body.secondaryArtistId) === 'null' ? null : parseInt(body.secondaryArtistId)) : undefined;
  const commissionSplit = body.commissionSplit !== undefined ? (body.commissionSplit === '' ? 50 : parseInt(body.commissionSplit)) : undefined;
  const price = body.price !== undefined ? (body.price === '' ? 0 : parseFloat(body.price)) : undefined;
  const manualPaidAmount = body.manualPaidAmount !== undefined ? (body.manualPaidAmount === '' ? 0 : parseFloat(body.manualPaidAmount)) : undefined;

  const serviceType = body.serviceType;
  const designTitle = body.designTitle;
  const status = body.status;
  const paymentStatus = body.paymentStatus;
  const notes = body.notes;
  const rejectionReason = body.rejectionReason;
  const manualPaymentMethod = body.manualPaymentMethod;
  const beforePhoto = body.beforePhoto;
  const consultationMethod = body.consultationMethod;
  const consultationNotes = body.consultationNotes;
  const quotedPrice = body.quotedPrice !== undefined ? (body.quotedPrice === '' || body.quotedPrice === null ? null : parseFloat(body.quotedPrice)) : undefined;

  // Date/Time Sanitization: convert empty strings to null for MySQL
  const date = body.date === '' ? null : body.date;
  const startTime = body.startTime === '' ? null : body.startTime;
  const rescheduleReason = body.rescheduleReason;

  let cleanDesignTitle = designTitle || '';
  if (serviceType) {
    const escapedService = serviceType.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const prefixRegex = new RegExp(`^(${escapedService}\\s*:\\s*)+`, 'i');
    cleanDesignTitle = cleanDesignTitle.replace(prefixRegex, '');
  }
  const combinedTitle = serviceType && cleanDesignTitle ? `${serviceType}: ${cleanDesignTitle}` : (cleanDesignTitle || serviceType || null);

  let query = 'UPDATE appointments SET ';
  const params = [];
  const updates = [];

  if (customerId !== undefined) { updates.push('customer_id = ?'); params.push(customerId); }
  if (artistId !== undefined && artistId !== null && String(artistId) !== 'null') { updates.push('artist_id = ?'); params.push(artistId); }

  if (secondaryArtistId !== undefined) {
    updates.push('secondary_artist_id = ?');
    params.push(secondaryArtistId);
  }
  if (commissionSplit !== undefined) { updates.push('commission_split = ?'); params.push(commissionSplit); }
  if (date !== undefined) { updates.push('appointment_date = ?'); params.push(date); }
  if (startTime !== undefined) { updates.push('start_time = ?'); params.push(startTime); }
  if (combinedTitle) { updates.push('design_title = ?'); params.push(combinedTitle); }
  if (serviceType !== undefined) { updates.push('service_type = ?'); params.push(serviceType); }
  if (status !== undefined) { updates.push('status = ?'); params.push(status); }
  if (paymentStatus !== undefined) { updates.push('payment_status = ?'); params.push(paymentStatus); }
  if (notes !== undefined) { updates.push('notes = ?'); params.push(notes); }
  if (price !== undefined) { updates.push('price = ?'); params.push(price); }
  if (manualPaidAmount !== undefined) { updates.push('manual_paid_amount = ?'); params.push(manualPaidAmount); }
  if (manualPaymentMethod !== undefined) { updates.push('manual_payment_method = ?'); params.push(manualPaymentMethod); }
  if (beforePhoto !== undefined) { updates.push('before_photo = ?'); params.push(beforePhoto); }
  if (consultationMethod !== undefined) { updates.push('consultation_method = ?'); params.push(consultationMethod); }
  if (consultationNotes !== undefined) { updates.push('consultation_notes = ?'); params.push(consultationNotes); }
  if (quotedPrice !== undefined) { updates.push('quoted_price = ?'); params.push(quotedPrice); }

  // Multi-session tracking (Task 1.2)
  if (body.sessionNumber !== undefined) {
    const sn = body.sessionNumber === '' || body.sessionNumber === null ? null : parseInt(body.sessionNumber);
    updates.push('session_number = ?'); params.push(sn);
  }
  if (body.totalSessions !== undefined) {
    const ts = body.totalSessions === '' || body.totalSessions === null ? null : parseInt(body.totalSessions);
    updates.push('total_sessions = ?'); params.push(ts);
  }
  if (body.projectId !== undefined) {
    const pid = body.projectId === '' || body.projectId === null ? null : parseInt(body.projectId);
    updates.push('project_id = ?'); params.push(pid);
  }

  // Special discount (Task 1.3)
  if (body.discountAmount !== undefined) {
    const da = body.discountAmount === '' ? 0 : parseFloat(body.discountAmount) || 0;
    updates.push('discount_amount = ?'); params.push(da);
  }
  if (body.discountType !== undefined) {
    updates.push('discount_type = ?'); params.push(body.discountType || null);
  }

  // Jewelry selection (Task 1.4)
  if (body.selectedJewelryId !== undefined) {
    updates.push('selected_jewelry_id = ?'); params.push(body.selectedJewelryId || null);
  }
  if (body.selectedJewelryName !== undefined) {
    updates.push('selected_jewelry_name = ?'); params.push(body.selectedJewelryName || null);
  }

  // Dual-service split pricing: sanitize and persist tattoo_price / piercing_price
  const isDualServiceUpdate = (serviceType === 'Tattoo + Piercing');
  if (body.tattooPrice !== undefined) {
    const tp = isDualServiceUpdate ? (parseFloat(body.tattooPrice) || 0) : null;
    updates.push('tattoo_price = ?');
    params.push(tp);
  }
  if (body.piercingPrice !== undefined) {
    const pp = isDualServiceUpdate ? (parseFloat(body.piercingPrice) || 0) : null;
    updates.push('piercing_price = ?');
    params.push(pp);
  }
  // If switching away from dual-service, explicitly clear split prices
  if (serviceType !== undefined && serviceType !== 'Tattoo + Piercing') {
    if (body.tattooPrice === undefined) { updates.push('tattoo_price = ?'); params.push(null); }
    if (body.piercingPrice === undefined) { updates.push('piercing_price = ?'); params.push(null); }
  }

  // Referral flag: admin-only toggle (only applies to solo sessions)
  if (body.isReferral !== undefined) {
    updates.push('is_referral = ?');
    params.push(body.isReferral ? 1 : 0);
  }

  if (updates.length === 0) {
    return res.status(400).json({ success: false, message: 'No fields to update.' });
  }

  query += updates.join(', ') + ' WHERE id = ? AND is_deleted = 0';
  params.push(id);

  // PRE-FETCH OLD APPOINTMENT STATE TO DETERMINE CHANGES
  db.query('SELECT * FROM appointments WHERE id = ? AND is_deleted = 0', [id], (err, oldApptResults) => {
    if (err || !oldApptResults.length) {
      return res.status(404).json({ success: false, message: 'Appointment not found.' });
    }
    const oldAppt = oldApptResults[0];

    db.query(query, params, (err, result) => {
      if (err) {
        // If the error is about unknown columns (migrations not yet applied), retry without optional new columns
        if (err.code === 'ER_BAD_FIELD_ERROR') {
          console.warn('[WARN] Unknown column detected, retrying without optional columns:', err.message);
          const optionalCols = ['secondary_artist_id', 'commission_split', 'before_photo'];
          const safeUpdates = [];
          const safeParams = [];
          // We skip columns that are part of more recent migrations (optional ones)
          if (customerId !== undefined) { safeUpdates.push('customer_id = ?'); safeParams.push(customerId); }
          if (artistId !== undefined && artistId !== null && String(artistId) !== 'null') { safeUpdates.push('artist_id = ?'); safeParams.push(artistId); }
          if (date !== undefined) { safeUpdates.push('appointment_date = ?'); safeParams.push(date); }
          if (startTime !== undefined) { safeUpdates.push('start_time = ?'); safeParams.push(startTime); }
          if (combinedTitle) { safeUpdates.push('design_title = ?'); safeParams.push(combinedTitle); }
          if (serviceType !== undefined) { safeUpdates.push('service_type = ?'); safeParams.push(serviceType); }
          if (status !== undefined) { safeUpdates.push('status = ?'); safeParams.push(status); }
          if (paymentStatus !== undefined) { safeUpdates.push('payment_status = ?'); safeParams.push(paymentStatus); }
          if (notes !== undefined) { safeUpdates.push('notes = ?'); safeParams.push(notes); }
          if (price !== undefined) { safeUpdates.push('price = ?'); safeParams.push(price); }

          if (safeUpdates.length === 0) {
            return res.status(400).json({ success: false, message: 'No valid base fields to update.' });
          }
          const safeQuery = 'UPDATE appointments SET ' + safeUpdates.join(', ') + ' WHERE id = ? AND is_deleted = 0';
          safeParams.push(id);

          return db.query(safeQuery, safeParams, (retryErr, retryResult) => {
            if (retryErr) {
              console.error('[ERROR] Migration-safe retry also failed:', retryErr);
              return res.status(500).json({ success: false, message: 'Database error (retry failed): ' + retryErr.message });
            }
            // Continue using result from retry
            processAdminPostUpdate(res, db, id, oldAppt, { customerId, artistId, status, paymentStatus, date, startTime, price, combinedTitle, rejectionReason, isReferral: body.isReferral });
          });
        }
        console.error('[ERROR] Error updating admin appointment:', err);
        return res.status(500).json({ success: false, message: 'Database error: ' + err.message });
      }
      if (result.affectedRows === 0) {
        return res.status(404).json({ success: false, message: 'Appointment not found.' });
      }

      processAdminPostUpdate(res, db, id, oldAppt, { customerId, artistId, status, paymentStatus, date, startTime, price, combinedTitle, rejectionReason, rescheduleReason, isReferral: body.isReferral });
    });
  });
});

// ═══════════════════════════════════════════════
// Guest Status Notification Helpers (Email + SMS)
// ═══════════════════════════════════════════════

/**
 * Send a branded status-update email to a guest customer.
 * @param {string} guestEmail - Guest's email address
 * @param {string} guestName - Guest's display name
 * @param {string} bookingCode - Booking reference code
 * @param {string} subject - Email subject line
 * @param {string} headingText - Main heading inside the email
 * @param {string} headingColor - CSS color for the heading (e.g. '#10b981')
 * @param {string} bodyMessage - Main paragraph message
 * @param {Array<{label: string, value: string}>} detailRows - Booking detail rows
 * @param {string} [footerTip] - Optional tip/CTA text at the bottom
 */
function sendGuestStatusEmail(guestEmail, guestName, bookingCode, subject, headingText, headingColor, bodyMessage, detailRows, footerTip) {
  if (!guestEmail) return;
  try {
    const detailHtml = detailRows.map(r =>
      `<p style="margin:0 0 12px;font-size:14px;color:#94a3b8;"><strong style="color:#334155;display:inline-block;width:100px;">${r.label}:</strong> <span style="color:#C19A6B;${r.mono ? 'font-family:monospace;font-weight:700;' : ''}">${r.value}</span></p>`
    ).join('');

    const tipBlock = footerTip ? `
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td align="center" style="padding:8px 0 16px;">
        <div style="display:inline-block;padding:12px 20px;background:rgba(193,154,107,0.1);border:1px solid rgba(193,154,107,0.2);border-radius:10px;">
          <p style="margin:0;font-size:13px;color:#94a3b8;"><strong style="color:#334155;">Tip:</strong> ${footerTip}</p>
        </div>
      </td></tr></table>
    ` : '';

    // ── Account creation marketing block (always shown for guests) ──
    const accountMarketingBlock = `
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td align="center" style="padding:16px 0 8px;">
        <div style="display:inline-block;width:100%;max-width:400px;box-sizing:border-box;padding:20px 24px;background:linear-gradient(135deg,#1a1816 0%,#1e1a15 100%);border:1px solid rgba(190,144,85,0.3);border-radius:14px;">
          <p style="margin:0 0 6px;font-size:15px;font-weight:700;color:#be9055;text-align:center;">Create Your InkVistAR Account</p>
          <p style="margin:0 0 14px;font-size:13px;color:#94a3b8;line-height:1.6;text-align:center;">Unlock the full InkVistAR experience — it's free and takes under a minute.</p>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
            <tr><td style="padding:3px 0;font-size:12px;color:#a08a6e;">• <span style="color:#334155;">Track & manage</span> your bookings in real-time</td></tr>
            <tr><td style="padding:3px 0;font-size:12px;color:#a08a6e;">• <span style="color:#334155;">Receive instant</span> notifications & status updates</td></tr>
            <tr><td style="padding:3px 0;font-size:12px;color:#a08a6e;">• <span style="color:#334155;">Browse & save</span> designs from our gallery</td></tr>
            <tr><td style="padding:3px 0;font-size:12px;color:#a08a6e;">• <span style="color:#334155;">Chat directly</span> with your artist</td></tr>
            <tr><td style="padding:3px 0;font-size:12px;color:#a08a6e;">• <span style="color:#334155;">Try on tattoos</span> with Augmented Reality</td></tr>
          </table>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td align="center" style="padding:16px 0 4px;">
            <a href="${FRONTEND_URL}/register" style="display:inline-block;padding:12px 28px;background:linear-gradient(135deg,#be9055,#a07840);color:#fff;font-size:14px;font-weight:700;text-decoration:none;border-radius:10px;letter-spacing:0.3px;">Create Free Account →</a>
          </td></tr></table>
          <p style="margin:8px 0 0;font-size:11px;color:#555;text-align:center;">Use this same email (${guestEmail}) to link your booking automatically.</p>
        </div>
      </td></tr></table>
    `;

    const html = buildEmailHtml(`
      <h2 style="margin:0 0 8px;font-size:22px;font-weight:700;color:${headingColor};text-align:center;">${headingText}</h2>
      <p style="margin:0 0 20px;font-size:13px;color:#64748b;text-align:center;">Ref: ${bookingCode}</p>
      <p style="margin:0 0 16px;">Hello ${guestName},</p>
      <p style="margin:0 0 16px;line-height:1.6;">${bodyMessage}</p>
      
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td align="center" style="padding:10px 0 20px;">
        <div style="text-align:left;display:inline-block;background-color:#faf8f5;border:1px solid #e2ddd5;border-radius:12px;padding:24px;width:100%;max-width:400px;box-sizing:border-box;">
          ${detailHtml}
        </div>
      </td></tr></table>

      ${tipBlock}
      ${accountMarketingBlock}
      <p style="margin:16px 0 0;font-size:14px;color:#94a3b8;text-align:center;">— The InkVistAR Studio Team</p>
    `);
    sendResendEmail(guestEmail, `InkVistAR: ${subject}`, html);
  } catch (err) {
    console.error(`[WARN] Error sending guest status email to ${guestEmail}:`, err.message);
  }
}

/**
 * Send a branded status-update email to a REGISTERED user with a Quick Login button.
 * @param {object} db - Database connection
 * @param {number} customerId - Customer's user ID
 * @param {string} subject - Email subject line
 * @param {string} headingText - Main heading inside the email
 * @param {string} headingColor - CSS color for the heading
 * @param {string} bodyMessage - Main paragraph message
 * @param {Array<{label: string, value: string}>} detailRows - Booking detail rows
 * @param {string} [extraBlock] - Optional extra HTML block (e.g. pre-care plan)
 */
function sendRegisteredUserStatusEmail(db, customerId, subject, headingText, headingColor, bodyMessage, detailRows, extraBlock) {
  if (!customerId) return;
  db.query('SELECT name, email FROM users WHERE id = ?', [customerId], (err, users) => {
    if (err || !users.length || !users[0].email) return;
    const userName = users[0].name || 'Valued Customer';
    const userEmail = users[0].email;

    try {
      const detailHtml = detailRows.map(r =>
        `<p style="margin:0 0 12px;font-size:14px;color:#94a3b8;"><strong style="color:#334155;display:inline-block;width:100px;">${r.label}:</strong> <span style="color:#C19A6B;${r.mono ? 'font-family:monospace;font-weight:700;' : ''}">${r.value}</span></p>`
      ).join('');

      // ── Quick Login block (always shown for registered users) ──
      const quickLoginBlock = `
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td align="center" style="padding:16px 0 8px;">
          <div style="display:inline-block;width:100%;max-width:400px;box-sizing:border-box;padding:18px 24px;background:linear-gradient(135deg,#111827 0%,#1a1816 100%);border:1px solid rgba(99,102,241,0.25);border-radius:14px;text-align:center;">
            <p style="margin:0 0 8px;font-size:14px;font-weight:600;color:#334155;">View your booking details, chat with your artist, and manage your appointments.</p>
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td align="center" style="padding:12px 0 4px;">
              <a href="${FRONTEND_URL}/login" style="display:inline-block;padding:12px 32px;background:linear-gradient(135deg,#6366f1,#4f46e5);color:#fff;font-size:14px;font-weight:700;text-decoration:none;border-radius:10px;letter-spacing:0.3px;">Login to Your Portal →</a>
            </td></tr></table>
          </div>
        </td></tr></table>
      `;

      const html = buildEmailHtml(`
        <h2 style="margin:0 0 8px;font-size:22px;font-weight:700;color:${headingColor};text-align:center;">${headingText}</h2>
        <p style="margin:0 0 16px;">Hello ${userName},</p>
        <p style="margin:0 0 16px;line-height:1.6;">${bodyMessage}</p>
        
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td align="center" style="padding:10px 0 20px;">
          <div style="text-align:left;display:inline-block;background-color:#faf8f5;border:1px solid #e2ddd5;border-radius:12px;padding:24px;width:100%;max-width:400px;box-sizing:border-box;">
            ${detailHtml}
          </div>
        </td></tr></table>

        ${extraBlock || ''}
        ${quickLoginBlock}
        <p style="margin:16px 0 0;font-size:14px;color:#94a3b8;text-align:center;">— The InkVistAR Studio Team</p>
      `);
      sendResendEmail(userEmail, `InkVistAR: ${subject}`, html);
    } catch (emailErr) {
      console.error(`[WARN] Error sending status email to user #${customerId}:`, emailErr.message);
    }
  });
}

/**
 * Send a concise status-update SMS to a guest customer.
 * @param {string} guestPhone - Guest's phone number
 * @param {string} guestName - Guest's display name
 * @param {string} bookingCode - Booking reference code
 * @param {string} message - SMS body text
 */
function sendGuestStatusSMS(guestPhone, guestName, bookingCode, message) {
  if (!guestPhone) return;
  try {
    sendSMS(guestPhone, `InkVistAR: Hi ${guestName}! ${message} Ref: [${bookingCode}].`);
  } catch (err) {
    console.error(`[WARN] Error sending guest status SMS to ${guestPhone}:`, err.message);
  }
}

function processAdminPostUpdate(res, db, id, oldAppt, fields) {
  const { customerId, artistId, status, paymentStatus, date, startTime, price, combinedTitle, rejectionReason, rescheduleReason, isReferral } = fields;

  // Auto-recalculate payment_status based on updated price and manual_paid_amount
  const recalculateStatusQuery = `
    UPDATE appointments 
    SET payment_status = CASE 
      WHEN price > 0 AND (((SELECT COALESCE(SUM(amount), 0) FROM payments WHERE appointment_id = ? AND status = 'paid') / 100) + COALESCE(manual_paid_amount, 0)) >= price THEN 'paid'
      WHEN price > 0 AND (((SELECT COALESCE(SUM(amount), 0) FROM payments WHERE appointment_id = ? AND status = 'paid') / 100) + COALESCE(manual_paid_amount, 0)) > 0 THEN 'downpayment_paid'
      WHEN price = 0 OR price IS NULL THEN 'paid'
      ELSE payment_status
    END 
    WHERE id = ? AND payment_status != 'paid'
  `;
  db.query(recalculateStatusQuery, [id, id, id], (err) => {
    if (err) console.error(`[WARN] Error auto-recalculating status for appointment #${id}:`, err.message);
  });

  // Smart Notifications Logic
  db.query('SELECT customer_id, artist_id, status FROM appointments WHERE id = ?', [id], (e, r) => {
    try {
      if (!e && r.length) {
        const currentData = r[0];
        let notificationsSent = false;

        // Safer Date Parsing
        const parseDateOnly = (d) => {
          if (!d) return null;
          try {
            return new Date(d).toISOString().split('T')[0];
          } catch (err) {
            return null;
          }
        };

        const oldDate = parseDateOnly(oldAppt.appointment_date);
        const newDate = parseDateOnly(date);

        // Helper to avoid notifying admin users posing as placeholder artists
        const notifyArtist = (title, msg, type) => {
          if (currentData.artist_id) {
            db.query('SELECT user_type FROM users WHERE id = ?', [currentData.artist_id], (aErr, aRes) => {
              if (!aErr && aRes.length && aRes[0].user_type !== 'admin') {
                createNotification(currentData.artist_id, title, msg, type, id);
              }
            });
          }
        };

        // ── Guest notification context ──
        const guestEmail = oldAppt.guest_email || null;
        const guestPhone = oldAppt.guest_phone || null;
        const guestName = (oldAppt.notes && oldAppt.notes.match(/Client:\s*(.+?)(?:\n|$)/)) ? oldAppt.notes.match(/Client:\s*(.+?)(?:\n|$)/)[1].trim() : 'Valued Guest';
        const guestBookingCode = oldAppt.booking_code || `#${id}`;
        const guestDesign = oldAppt.design_title || 'Consultation';
        const formatGuestDate = (d) => { try { return new Date(d).toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }); } catch { return d || 'TBD'; } };
        const formatGuestTime = (t) => { try { return t ? new Date(`2000-01-01T${t}`).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true }) : 'TBD'; } catch { return t || 'TBD'; } };
        const displayDate = formatGuestDate(date || oldAppt.appointment_date);
        const displayTime = formatGuestTime(startTime || oldAppt.start_time);
        const accountTip = 'Create an InkVistAR account with this email to track your booking, receive real-time updates, and manage future appointments.';
        const isRegisteredUser = !guestEmail && currentData.customer_id;
        const isTattooSession = (oldAppt.service_type || '').toLowerCase().includes('tattoo') || (!(oldAppt.service_type || '').toLowerCase().includes('consultation') && !(oldAppt.service_type || '').toLowerCase().includes('piercing'));

        // ── Pre-care conditioning plan HTML block (for tattoo sessions only) ──
        const preCareEmailBlock = `
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td align="center" style="padding:12px 0 16px;">
            <div style="display:inline-block;width:100%;max-width:400px;box-sizing:border-box;padding:20px 24px;background:linear-gradient(135deg,#1a1816 0%,#14120f 100%);border:1px solid rgba(190,144,85,0.25);border-radius:14px;">
              <p style="margin:0 0 8px;font-size:15px;font-weight:700;color:#be9055;text-align:center;">Pre-Session Conditioning Plan</p>
              <p style="margin:0 0 14px;font-size:12px;color:#94a3b8;text-align:center;line-height:1.5;">Follow these steps before your tattoo session for the best results:</p>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr><td style="padding:6px 0;font-size:13px;color:#334155;">• <strong>Hydrate</strong> — Drink plenty of water 24–48 hours before for optimal skin elasticity.</td></tr>
                <tr><td style="padding:6px 0;font-size:13px;color:#334155;">• <strong>Eat Well</strong> — Have a full, balanced meal 1–2 hours before to keep blood sugar stable.</td></tr>
                <tr><td style="padding:6px 0;font-size:13px;color:#334155;">• <strong>No Alcohol</strong> — Avoid alcohol and blood thinners (ibuprofen/aspirin) for 24+ hours prior.</td></tr>
                <tr><td style="padding:6px 0;font-size:13px;color:#334155;">• <strong>Skin Care</strong> — Moisturize daily leading up, but skip lotion on session day. Avoid sunburns!</td></tr>
                <tr><td style="padding:6px 0;font-size:13px;color:#334155;">• <strong>Rest Up</strong> — Get a good night's sleep to boost energy and pain tolerance.</td></tr>
                <tr><td style="padding:6px 0;font-size:13px;color:#334155;">• <strong>Dress Smart</strong> — Wear comfortable, loose clothing for easy access to the tattoo area.</td></tr>
              </table>
            </div>
          </td></tr></table>
        `;

        // 1. Check for Rescheduling
        if ((newDate && oldDate && newDate !== oldDate) || (startTime !== undefined && startTime !== oldAppt.start_time)) {
          const reasonText = rescheduleReason ? `\n\nReason: ${rescheduleReason}` : '';
          if (isRegisteredUser) {
            createNotification(currentData.customer_id, 'Appointment Rescheduled', `Your appointment #${id} has been rescheduled to ${date} at ${startTime}.${reasonText}`, 'appointment_rescheduled', id);
          }
          notifyArtist('Session Rescheduled', `Your session #${id} has been rescheduled to ${date}${startTime ? ' at ' + startTime : ''}. Please update your schedule accordingly.`, 'appointment_rescheduled');

          // ── Guest Email + SMS: Rescheduled ──
          if (guestEmail) {
            const newDisplayDate = formatGuestDate(date);
            const newDisplayTime = formatGuestTime(startTime || oldAppt.start_time);
            const reasonLine = rescheduleReason ? ` Reason: ${rescheduleReason}.` : '';
            sendGuestStatusEmail(guestEmail, guestName, guestBookingCode,
              `Booking Rescheduled [${guestBookingCode}]`,
              'Booking Rescheduled', '#f59e0b',
              `Your consultation has been rescheduled to a new date and time. Please see the updated details below.${reasonLine}`,
              [
                { label: 'Ref Code', value: guestBookingCode, mono: true },
                { label: 'Design Idea', value: guestDesign },
                { label: 'New Date', value: newDisplayDate },
                { label: 'New Time', value: newDisplayTime }
              ], accountTip
            );
          }
          if (guestPhone) {
            const reasonSms = rescheduleReason ? ` Reason: ${rescheduleReason}.` : '';
            sendGuestStatusSMS(guestPhone, guestName, guestBookingCode, `Your consultation has been rescheduled to ${formatGuestDate(date)} at ${formatGuestTime(startTime || oldAppt.start_time)}.${reasonSms}`);
          }

          // ── Registered User Email: Rescheduled ──
          if (isRegisteredUser) {
            const newDisplayDate2 = formatGuestDate(date);
            const newDisplayTime2 = formatGuestTime(startTime || oldAppt.start_time);
            const reasonLine2 = rescheduleReason ? ` Reason: ${rescheduleReason}.` : '';
            sendRegisteredUserStatusEmail(db, currentData.customer_id,
              'Appointment Rescheduled',
              'Appointment Rescheduled', '#f59e0b',
              `Your appointment has been rescheduled to a new date and time. Please see the updated details below.${reasonLine2}`,
              [
                { label: 'Design', value: guestDesign },
                { label: 'New Date', value: newDisplayDate2 },
                { label: 'New Time', value: newDisplayTime2 }
              ]
            );
          }

          notificationsSent = true;
        }

        // 2. Check for Approval/Rejection
        if (status !== undefined && status !== oldAppt.status) {
          if (status === 'confirmed' && oldAppt.status === 'pending') {
            const priceMsg = price > 0 ? ` The quoted price is ₱${parseFloat(price).toLocaleString()}.` : '';
            if (isRegisteredUser) {
              createNotification(currentData.customer_id, 'Booking Request Approved', `Great news! Your booking request #${id} has been approved.${priceMsg} We look forward to seeing you.`, 'appointment_confirmed', id);
            }
            notifyArtist('Appointment Confirmed', `Appointment #${id} has been accepted and confirmed.`, 'appointment_confirmed');
            // SMS + Push
            db.query('SELECT u.phone, a.name as artist_name, ap.appointment_date FROM users u JOIN appointments ap ON ap.customer_id = u.id LEFT JOIN users a ON a.id = ap.artist_id WHERE ap.id = ?', [id], (e2, r2) => {
              if (!e2 && r2.length) {
                const { phone, artist_name, appointment_date } = r2[0];
                if (phone) sendSMS(phone, appointmentConfirmedSMS(artist_name || 'your artist', appointment_date));
              }
            });
            if (isRegisteredUser) {
              sendPushNotification(currentData.customer_id, 'Booking Approved!', `Your appointment #${id} has been confirmed.${priceMsg}`, { screen: 'customer-notifications' });
            }

            // ── Guest Email + SMS: Confirmed ──
            if (guestEmail) {
              const priceLine = price > 0 ? ` The quoted price is <strong style="color:#C19A6B;">₱${parseFloat(price).toLocaleString()}</strong>.` : '';
              sendGuestStatusEmail(guestEmail, guestName, guestBookingCode,
                `Booking Confirmed [${guestBookingCode}]`,
                'Booking Confirmed!', '#10b981',
                `Great news! Your consultation request has been reviewed and <strong>approved</strong> by our team.${priceLine} We look forward to seeing you!`,
                [
                  { label: 'Ref Code', value: guestBookingCode, mono: true },
                  { label: 'Design Idea', value: guestDesign },
                  { label: 'Date', value: displayDate },
                  { label: 'Time', value: displayTime }
                ], accountTip
              );
            }
            if (guestPhone) {
              const priceSms = price > 0 ? ` Quoted price: P${parseFloat(price).toLocaleString()}.` : '';
              sendGuestStatusSMS(guestPhone, guestName, guestBookingCode, `Your consultation request has been CONFIRMED for ${displayDate} at ${displayTime}.${priceSms} See you soon!`);
            }

            // ── Registered User Email: Confirmed ──
            if (isRegisteredUser) {
              const priceLine2 = price > 0 ? ` The quoted price is <strong style="color:#C19A6B;">₱${parseFloat(price).toLocaleString()}</strong>.` : '';
              sendRegisteredUserStatusEmail(db, currentData.customer_id,
                'Booking Confirmed!',
                'Booking Confirmed!', '#10b981',
                `Great news! Your booking request has been reviewed and <strong>approved</strong> by our team.${priceLine2} We look forward to seeing you!`,
                [
                  { label: 'Design', value: guestDesign },
                  { label: 'Date', value: displayDate },
                  { label: 'Time', value: displayTime }
                ],
                isTattooSession ? preCareEmailBlock : null
              );

              // ── Pre-care notification (tattoo sessions only) ──
              if (isTattooSession) {
                createNotification(currentData.customer_id, 'Pre-Session Conditioning Plan', `Your tattoo session for "${guestDesign}" is confirmed! To get the best results: Hydrate well, eat a balanced meal beforehand, avoid alcohol/blood thinners for 24hrs, moisturize (but not on session day), get good rest, and wear loose clothing. Check your email for the full guide!`, 'precare_plan', id);
              }
            }

            notificationsSent = true;
          } else if (status === 'rejected' && oldAppt.status === 'pending') {
            const reasonMsg = rejectionReason ? `\n\nReason: ${rejectionReason}` : ' Please contact the studio for alternatives.';
            if (isRegisteredUser) {
              createNotification(currentData.customer_id, 'Booking Request Rejected', `Notice: Your booking request #${id} was unfortunately rejected.${reasonMsg}`, 'appointment_rejected', id);
            }
            notifyArtist('Request Rejected', `Booking request #${id} has been rejected.`, 'appointment_rejected');
            if (isRegisteredUser) {
              sendPushNotification(currentData.customer_id, 'Booking Rejected', `Your appointment #${id} could not be approved. ${rejectionReason || ''}`.trim(), { screen: 'customer-notifications' });
            }

            // ── Guest Email + SMS: Rejected ──
            if (guestEmail) {
              const reasonLine = rejectionReason ? `<br><br><strong style="color:#334155;">Reason:</strong> ${rejectionReason}` : '';
              sendGuestStatusEmail(guestEmail, guestName, guestBookingCode,
                `Booking Update [${guestBookingCode}]`,
                'Booking Request Update', '#ef4444',
                `We regret to inform you that your consultation request could not be approved at this time. Please don't hesitate to reach out to the studio directly for alternatives or to rebook.${reasonLine}`,
                [
                  { label: 'Ref Code', value: guestBookingCode, mono: true },
                  { label: 'Design Idea', value: guestDesign },
                  { label: 'Status', value: 'Not Approved' }
                ], 'Contact us via our website or social media for alternative booking options.'
              );
            }
            if (guestPhone) {
              const reasonSms = rejectionReason ? ` Reason: ${rejectionReason}.` : '';
              sendGuestStatusSMS(guestPhone, guestName, guestBookingCode, `We're sorry, your consultation request could not be approved.${reasonSms} Please contact the studio for alternatives.`);
            }

            // ── Registered User Email: Rejected ──
            if (isRegisteredUser) {
              const reasonLine3 = rejectionReason ? `<br><br><strong style="color:#334155;">Reason:</strong> ${rejectionReason}` : '';
              sendRegisteredUserStatusEmail(db, currentData.customer_id,
                'Booking Request Update',
                'Booking Request Update', '#ef4444',
                `We regret to inform you that your booking request could not be approved at this time. Please don't hesitate to reach out to the studio directly for alternatives or to rebook.${reasonLine3}`,
                [
                  { label: 'Design', value: guestDesign },
                  { label: 'Status', value: 'Not Approved' }
                ]
              );
            }

            notificationsSent = true;
          } else if (status === 'cancelled') {
            if (isRegisteredUser) {
              createNotification(currentData.customer_id, 'Appointment Cancelled', `Notice: Your appointment #${id} has been cancelled.`, 'appointment_cancelled', id);
            }
            notifyArtist('Session Cancelled', `Session #${id} was cancelled.`, 'appointment_cancelled');
            // SMS + Push
            db.query('SELECT u.phone, ap.appointment_date FROM users u JOIN appointments ap ON ap.customer_id = u.id WHERE ap.id = ?', [id], (e2, r2) => {
              if (!e2 && r2.length && r2[0].phone) {
                sendSMS(r2[0].phone, appointmentCancelledSMS(r2[0].appointment_date, rejectionReason));
              }
            });
            if (isRegisteredUser) {
              sendPushNotification(currentData.customer_id, 'Appointment Cancelled', `Your appointment #${id} has been cancelled.`, { screen: 'customer-notifications' });
            }

            // ── Guest Email + SMS: Cancelled ──
            if (guestEmail) {
              const reasonLine = rejectionReason ? `<br><br><strong style="color:#334155;">Reason:</strong> ${rejectionReason}` : '';
              sendGuestStatusEmail(guestEmail, guestName, guestBookingCode,
                `Booking Cancelled [${guestBookingCode}]`,
                'Booking Cancelled', '#ef4444',
                `Your consultation booking has been cancelled. If this was unexpected, please contact the studio directly for clarification.${reasonLine}`,
                [
                  { label: 'Ref Code', value: guestBookingCode, mono: true },
                  { label: 'Design Idea', value: guestDesign },
                  { label: 'Orig. Date', value: formatGuestDate(oldAppt.appointment_date) },
                  { label: 'Status', value: 'Cancelled' }
                ], 'You can submit a new consultation request anytime from our website.'
              );
            }
            if (guestPhone) {
              sendGuestStatusSMS(guestPhone, guestName, guestBookingCode, `Your consultation booking has been cancelled. Please contact the studio if you have questions or wish to rebook.`);
            }

            // ── Registered User Email: Cancelled ──
            if (isRegisteredUser) {
              const cancelReason = rejectionReason ? `<br><br><strong style="color:#334155;">Reason:</strong> ${rejectionReason}` : '';
              sendRegisteredUserStatusEmail(db, currentData.customer_id,
                'Appointment Cancelled',
                'Appointment Cancelled', '#ef4444',
                `Your appointment has been cancelled. If this was unexpected, please contact the studio directly for clarification.${cancelReason}`,
                [
                  { label: 'Design', value: guestDesign },
                  { label: 'Orig. Date', value: formatGuestDate(oldAppt.appointment_date) },
                  { label: 'Status', value: 'Cancelled' }
                ]
              );
            }

            notificationsSent = true;
          } else if (status === 'completed') {
            const isConsultation = (oldAppt.service_type || '').toLowerCase().includes('consultation');

            if (isConsultation) {
              // ── CONSULTATION COMPLETION → Send Consultation Summary ──
              if (isRegisteredUser) {
                createNotification(currentData.customer_id, 'Consultation Complete!', `Your consultation #${id} has been completed. Check your email for a detailed summary.`, 'appointment_completed', id);
              }
              notifyArtist('Consultation Completed', `Consultation #${id} marked as completed.`, 'appointment_completed');
              if (isRegisteredUser) {
                sendPushNotification(currentData.customer_id, 'Consultation Complete!', `Your InkVistAR consultation #${id} is done! Check your email for the summary and next steps.`, { screen: 'customer-notifications' });
              }

              // Fetch fresh appointment data including the new consultation fields + artist name
              db.query(`
                SELECT a.*, u.name as artist_name 
                FROM appointments a 
                LEFT JOIN users u ON a.artist_id = u.id 
                WHERE a.id = ?
              `, [id], (fetchErr, fetchRes) => {
                if (fetchErr || !fetchRes.length) {
                  console.error(`[WARN] Failed to fetch consultation data for summary email (appointment #${id}):`, fetchErr?.message);
                  return;
                }
                const appt = fetchRes[0];
                const summaryData = {
                  bookingCode: appt.booking_code || `#${id}`,
                  designTitle: appt.design_title || 'General Consultation',
                  date: formatGuestDate(appt.appointment_date),
                  artistName: appt.artist_name || 'Studio Staff',
                  consultationMethod: appt.consultation_method || 'Face-to-Face',
                  consultationNotes: appt.consultation_notes || null,
                  quotedPrice: appt.quoted_price || null
                };

                // Guest flow
                if (guestEmail) {
                  sendConsultationSummaryEmail(guestEmail, guestName, summaryData, true);
                }
                if (guestPhone) {
                  sendGuestStatusSMS(guestPhone, guestName, guestBookingCode, `Your consultation is complete! Check your email for a detailed summary and next steps.`);
                }

                // Registered user flow
                if (isRegisteredUser) {
                  db.query('SELECT name, email FROM users WHERE id = ?', [currentData.customer_id], (uErr, uRes) => {
                    if (!uErr && uRes.length && uRes[0].email) {
                      sendConsultationSummaryEmail(uRes[0].email, uRes[0].name || 'Valued Customer', summaryData, false);
                    }
                  });
                }
              });

            } else {
              // ── NON-CONSULTATION (Tattoo/Piercing) COMPLETION → Original flow ──
              if (isRegisteredUser) {
                createNotification(currentData.customer_id, 'Tattoo Journey Complete!', `Your session #${id} is finished! We hope you love your new ink.`, 'appointment_completed', id);
              }
              notifyArtist('Session Completed', `Appointment #${id} marked as completed.`, 'appointment_completed');
              if (isRegisteredUser) {
                sendPushNotification(currentData.customer_id, 'Session Complete!', `Your InkVistAR session #${id} is done! We hope you love your new ink.`, { screen: 'customer-notifications' });
              }

              const completedServiceLabel = (oldAppt.service_type || 'Tattoo Session');

              // ── Aftercare tracker ad block (exclusive feature promotion) ──
              const aftercareAdBlock = `
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td align="center" style="padding:12px 0 16px;">
                  <div style="display:inline-block;width:100%;max-width:400px;box-sizing:border-box;padding:22px 24px;background:linear-gradient(135deg,#1a1816 0%,#14120f 100%);border:1px solid rgba(190,144,85,0.3);border-radius:14px;text-align:center;">
                    <p style="margin:0 0 10px;font-size:16px;font-weight:700;color:#be9055;">Exclusive: Aftercare Tracking</p>
                    <p style="margin:0 0 14px;font-size:13px;color:#94a3b8;line-height:1.6;">Your tattoo journey doesn't end here. InkVistAR includes a built-in aftercare tracker — an exclusive feature designed to guide you through every stage of healing for the best possible results with your new ink.</p>
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                      <tr><td style="padding:5px 0;font-size:13px;color:#334155;text-align:left;">&#x2022; Day-by-day healing milestones with personalized reminders</td></tr>
                      <tr><td style="padding:5px 0;font-size:13px;color:#334155;text-align:left;">&#x2022; Track your healing progress with photo updates</td></tr>
                      <tr><td style="padding:5px 0;font-size:13px;color:#334155;text-align:left;">&#x2022; Expert aftercare guidance tailored to your service type</td></tr>
                    </table>
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td align="center" style="padding:14px 0 4px;">
                      <a href="${FRONTEND_URL}/customer/bookings" style="display:inline-block;padding:12px 28px;background:linear-gradient(135deg,#be9055,#a07840);color:#fff;font-size:14px;font-weight:700;text-decoration:none;border-radius:10px;letter-spacing:0.3px;">Start Aftercare Tracking &rarr;</a>
                    </td></tr></table>
                  </div>
                </td></tr></table>
              `;

              // ── Guest Email + SMS: Completed ──
              if (guestEmail) {
                sendGuestStatusEmail(guestEmail, guestName, guestBookingCode,
                  `Session Complete [${guestBookingCode}]`,
                  'Session Complete!', '#10b981',
                  `Your <strong style="color:#C19A6B;">${completedServiceLabel}</strong> session for "<strong>${guestDesign}</strong>" has been successfully completed! We hope you love the result. Thank you for choosing InkVistAR Studio.`,
                  [
                    { label: 'Ref Code', value: guestBookingCode, mono: true },
                    { label: 'Service', value: completedServiceLabel },
                    { label: 'Design', value: guestDesign },
                    { label: 'Result', value: 'Completed Successfully' }
                  ], 'Create an InkVistAR account to access exclusive aftercare tracking and manage future appointments.'
                );
              }
              if (guestPhone) {
                sendGuestStatusSMS(guestPhone, guestName, guestBookingCode, `Your session is complete! Thank you for choosing InkVistAR Studio. We hope you love the result!`);
              }

              // ── Registered User Email: Completed (with aftercare ad) ──
              if (isRegisteredUser) {
                sendRegisteredUserStatusEmail(db, currentData.customer_id,
                  `Session Complete — ${completedServiceLabel} [${guestBookingCode}]`,
                  'Session Complete!', '#10b981',
                  `Your <strong style="color:#C19A6B;">${completedServiceLabel}</strong> session for "<strong>${guestDesign}</strong>" has been successfully completed! We hope you love the result. Thank you for choosing InkVistAR Studio.`,
                  [
                    { label: 'Appointment', value: guestBookingCode, mono: true },
                    { label: 'Service', value: completedServiceLabel },
                    { label: 'Design', value: guestDesign },
                    { label: 'Date', value: displayDate },
                    { label: 'Result', value: 'Completed Successfully' }
                  ],
                  aftercareAdBlock
                );
              }
            }

            notificationsSent = true;
          } else {
            if (isRegisteredUser) {
              createNotification(currentData.customer_id, 'Appointment Update', `Your appointment #${id} has been updated to ${status}.`, 'system', id);
            }
            notifyArtist('Appointment Update', `Appointment #${id} status changed to ${status}.`, 'system');

            // ── Guest Email + SMS: Generic status update ──
            if (guestEmail) {
              sendGuestStatusEmail(guestEmail, guestName, guestBookingCode,
                `Booking Update [${guestBookingCode}]`,
                'Booking Status Update', '#C19A6B',
                `Your consultation booking status has been updated to <strong style="color:#C19A6B;">${status}</strong>. If you have any questions, please contact the studio.`,
                [
                  { label: 'Ref Code', value: guestBookingCode, mono: true },
                  { label: 'Design Idea', value: guestDesign },
                  { label: 'New Status', value: status.charAt(0).toUpperCase() + status.slice(1) }
                ], accountTip
              );
            }
            if (guestPhone) {
              sendGuestStatusSMS(guestPhone, guestName, guestBookingCode, `Your booking status has been updated to "${status}". Contact the studio if you have questions.`);
            }

            // ── Registered User Email: Generic Update ──
            if (isRegisteredUser) {
              sendRegisteredUserStatusEmail(db, currentData.customer_id,
                'Appointment Update',
                'Booking Status Update', '#be9055',
                `Your appointment status has been updated to <strong style="color:#C19A6B;">${status}</strong>. If you have any questions, please contact the studio.`,
                [
                  { label: 'Design', value: guestDesign },
                  { label: 'New Status', value: status.charAt(0).toUpperCase() + status.slice(1) }
                ]
              );
            }

            notificationsSent = true;
          }
        }

        // 3. Independent Price Update
        if (price !== undefined && price > 0 && price !== oldAppt.price && !notificationsSent) {
          if (isRegisteredUser) {
            createNotification(currentData.customer_id, 'Session Fee Update', `The total price for your session #${id} has been set to ₱${parseFloat(price).toLocaleString()}. Please pay the required reservation fee/down payment to successfully secure your booking.`, 'system', id);
          }
          notifyArtist('Session Price Set', `The price for session #${id} has been finalized at ₱${parseFloat(price).toLocaleString()}. Your 30% commission will be ₱${(parseFloat(price) * 0.30).toLocaleString()} upon completion.`, 'price_update');

          // ── Guest Email + SMS: Price Quote ──
          if (guestEmail) {
            sendGuestStatusEmail(guestEmail, guestName, guestBookingCode,
              `Price Quote [${guestBookingCode}]`,
              'Your Quote is Ready', '#C19A6B',
              `The pricing for your consultation has been set. Please review the details below. To secure your booking, a reservation fee or down payment may be required.`,
              [
                { label: 'Ref Code', value: guestBookingCode, mono: true },
                { label: 'Design Idea', value: guestDesign },
                { label: 'Date', value: displayDate },
                { label: 'Quoted Price', value: `₱${parseFloat(price).toLocaleString()}` }
              ], accountTip
            );
          }
          if (guestPhone) {
            sendGuestStatusSMS(guestPhone, guestName, guestBookingCode, `Your price quote is ready: P${parseFloat(price).toLocaleString()}. Please contact the studio to confirm and secure your booking.`);
          }

          // ── Registered User Email: Price Quote ──
          if (isRegisteredUser) {
            sendRegisteredUserStatusEmail(db, currentData.customer_id,
              'Session Fee Update',
              'Your Quote is Ready', '#be9055',
              `The pricing for your session has been set. Please review the details below. To secure your booking, a reservation fee or down payment may be required.`,
              [
                { label: 'Design', value: guestDesign },
                { label: 'Date', value: displayDate },
                { label: 'Quoted Price', value: `₱${parseFloat(price).toLocaleString()}` }
              ]
            );
          }

          notificationsSent = true;
        }

        // 4. Action Required for New Assignment
        if (currentData.status === 'pending' && oldAppt.artist_id !== currentData.artist_id) {
          notifyArtist('Action Required: New Assignment', `You have been assigned a new session #${id}. Please accept or decline.`, 'action_required');
        }

        // 5. Referral Status Change — Notify artist
        if (isReferral !== undefined && !!isReferral !== !!oldAppt.is_referral) {
          if (isReferral) {
            notifyArtist('Referral Commission Activated', `Session #${id} for "${guestDesign}" has been marked as your referral. Your commission is now 70% Artist / 30% Studio.`, 'referral_activated');
          } else {
            notifyArtist('Referral Commission Removed', `Session #${id} for "${guestDesign}" is no longer marked as a referral. Commission reverted to 30% Artist / 70% Studio.`, 'referral_removed');
          }
        }
      }
    } catch (err) {
      console.error(`[ERROR] Non-critical error in notification logic for appointment #${id}:`, err);
    }
  });

  if (!res.headersSent) {
    res.json({ success: true, message: 'Appointment updated successfully' });
  }
}

// PUT artist accept appointment
app.put('/api/artist/appointments/:id/accept', (req, res) => {
  const { id } = req.params;
  db.query("UPDATE appointments SET status = 'confirmed' WHERE id = ?", [id], (err, result) => {
    if (err) return res.status(500).json({ success: false, message: 'Database error' });
    if (result.affectedRows === 0) return res.status(404).json({ success: false, message: 'Not found' });

    // Notify admin
    createNotification(1, 'Assignment Accepted', `Artist accepted the appointment #${id}.`, 'system', id);
    res.json({ success: true, message: 'Accepted successfully' });
  });
});

// PUT artist reject appointment
app.put('/api/artist/appointments/:id/reject', (req, res) => {
  const { id } = req.params;
  db.query("UPDATE appointments SET status = 'pending', artist_id = 1 WHERE id = ?", [id], (err, result) => {
    if (err) return res.status(500).json({ success: false, message: 'Database error' });
    if (result.affectedRows === 0) return res.status(404).json({ success: false, message: 'Not found' });
    res.json({ success: true, message: 'Appointment declined and sent back to admin' });
  });
});

// Upload Draft Image for Appointment
app.put('/api/artist/appointments/:id/draft', (req, res) => {
  const { id } = req.params;
  const { draft_image } = req.body;
  if (!draft_image) {
    return res.status(400).json({ success: false, message: 'Missing draft image data' });
  }

  console.log(`[INFO] Draft upload for Appt #${id}, payload size: ${(draft_image.length / 1024).toFixed(1)}KB`);

  db.query("UPDATE appointments SET draft_image = ? WHERE id = ?", [draft_image, id], (err, result) => {
    if (err) {
      console.error(`[ERROR] Draft upload DB error for Appt #${id}:`, err.message);
      return res.status(500).json({ success: false, message: 'Database error: ' + err.message });
    }
    if (result.affectedRows === 0) return res.status(404).json({ success: false, message: 'Appointment not found' });
    console.log(`[OK] Draft image saved for Appt #${id}`);
    res.json({ success: true, message: 'Draft image updated successfully' });
  });
});

// GET transaction history (invoices mapping) — merges payments + invoices tables
app.get('/api/admin/invoices', (req, res) => {
  // Query 1: Payment-based invoices (from PayMongo / appointment payments)
  const paymentsQuery = `
    SELECT 
      p.id, 
      NULL as invoice_number,
      u.name as client_name, 
      u.id as client_id,
      COALESCE(a.service_type, 'Service') as service_type, 
      p.created_at, 
      (p.amount / 100) as amount, 
      p.status,
      p.raw_event,
      NULL as items,
      NULL as discount_amount,
      NULL as discount_type
    FROM payments p
    LEFT JOIN appointments a ON p.appointment_id = a.id
    LEFT JOIN users u ON a.customer_id = u.id
    ORDER BY p.created_at DESC
  `;

  // Query 2: Direct invoices (from POS sales, manual creation, etc.)
  const invoicesQuery = `
    SELECT 
      (id + 100000) as id,
      invoice_number,
      client_name,
      customer_id as client_id,
      service_type,
      created_at,
      amount,
      status,
      NULL as raw_event,
      items,
      discount_amount,
      discount_type
    FROM invoices
    ORDER BY created_at DESC
  `;

  db.query(paymentsQuery, (err, paymentResults) => {
    if (err) {
      console.error("Error fetching payment invoices:", err);
      return res.status(500).json({ success: false, message: 'Database error fetching invoices' });
    }

    db.query(invoicesQuery, (err2, invoiceResults) => {
      if (err2) {
        console.error("Error fetching direct invoices:", err2);
        // Still return payment results even if invoices table fails
        return res.json({ success: true, data: paymentResults || [] });
      }

      // Merge both arrays and sort by date descending
      const merged = [...(paymentResults || []), ...(invoiceResults || [])];
      merged.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

      res.json({ success: true, data: merged });
    });
  });
});


// POST record an instant manual payment (Admin)
app.post('/api/admin/appointments/:id/manual-payment', (req, res) => {
  const { id } = req.params;
  const { amount, method, cashTendered } = req.body;

  if (!amount || isNaN(amount) || amount <= 0) {
    return res.status(400).json({ success: false, message: 'Please enter a valid positive amount.' });
  }

  // Fetch current balance
  const checkQuery = `
    SELECT ap.price, ap.design_title, ap.customer_id, ap.artist_id, ap.status, ap.appointment_date,
    ((SELECT COALESCE(SUM(amount), 0) FROM payments WHERE appointment_id = ap.id AND status = 'paid') / 100) + COALESCE(manual_paid_amount, 0) as total_paid,
    u.name as client_name, u.email as cx_email
    FROM appointments ap
    JOIN users u ON ap.customer_id = u.id
    WHERE ap.id = ?
  `;

  db.query(checkQuery, [id], (checkErr, results) => {
    if (checkErr || !results.length) return res.status(500).json({ success: false, message: 'Database error' });

    const apptData = results[0];
    const remaining = Math.max(0, apptData.price - apptData.total_paid);
    // Cap payment at remaining balance — excess is just change
    const actualPayment = Math.min(parseFloat(amount), remaining);
    const changeGiven = method === 'Cash' && cashTendered ? Math.max(0, parseFloat(cashTendered) - actualPayment) : 0;

    const amountCentavos = Math.round(actualPayment * 100);
    const paymentId = `MANUAL-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    const rawEvent = JSON.stringify({
      type: 'manual_adjustment',
      method: method || 'Cash',
      cashTendered: cashTendered || null,
      changeGiven: changeGiven,
      timestamp: new Date().toISOString()
    });

    db.query(`INSERT INTO payments (appointment_id, paymongo_payment_id, amount, status, raw_event) VALUES (?, ?, ?, 'paid', ?)`,
      [id, paymentId, amountCentavos, rawEvent], (err) => {
        if (err) return res.status(500).json({ success: false, message: 'Database error' });

        const updateStatusQuery = `
        UPDATE appointments SET 
          payment_status = CASE
            WHEN price > 0 AND ((SELECT COALESCE(SUM(amount), 0) FROM payments WHERE appointment_id = ? AND status = 'paid') / 100) + COALESCE(manual_paid_amount, 0) >= price THEN 'paid'
            WHEN price = 0 OR price IS NULL THEN 'paid'
            ELSE 'downpayment_paid'
          END,
          status = CASE
            WHEN status = 'pending' THEN 'confirmed'
            ELSE status
          END
        WHERE id = ?
      `;
        db.query(updateStatusQuery, [id, id], (upErr) => {
          // Generate auto-incrementing invoice number
          db.query('SELECT MAX(CAST(SUBSTRING(invoice_number, 5) AS UNSIGNED)) as maxNum FROM invoices WHERE invoice_number IS NOT NULL', (invErr, invRes) => {
            const nextNum = (invErr || !invRes[0]?.maxNum) ? 1 : invRes[0].maxNum + 1;
            const invoiceNumber = `INV-${String(nextNum).padStart(6, '0')}`;

            // Create invoice record
            const invoiceQuery = `INSERT INTO invoices (invoice_number, customer_id, appointment_id, client_name, service_type, amount, payment_method, change_given, discount_amount, discount_type, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, NULL, 'Paid', ?)`;
            db.query(invoiceQuery, [invoiceNumber, apptData.customer_id, id, apptData.client_name, apptData.design_title || 'Session Payment', actualPayment, method || 'Cash', changeGiven, getLocalDatetime()], (invInsertErr, invInsertRes) => {
              if (invInsertErr) console.error('[WARN] Invoice creation failed:', invInsertErr.message);

              // Send notification and email
              const customerMsg = `Your payment of ₱${actualPayment.toLocaleString("en-PH", { minimumFractionDigits: 2 })} has been recorded. Invoice ${invoiceNumber} is now available. View your receipt from your notifications.`;
              createNotification(apptData.customer_id, 'Payment Received', customerMsg, 'payment_success', invInsertRes?.insertId || id);

              // Artist payment notifications removed per business rules — only admin receives payment alerts
              // Artists should not see individual payment collection or fully-paid notifications

              const isConfirmedNow = apptData.status === 'confirmed' || apptData.status === 'pending';
              if (apptData.artist_id && isConfirmedNow) {
                db.query('SELECT user_type FROM users WHERE id = ?', [apptData.artist_id], (aErr, aRes) => {
                  if (!aErr && aRes.length && aRes[0].user_type !== 'admin') {
                    const apptDate = new Date(apptData.appointment_date || Date.now());
                    const dateStr = !isNaN(apptDate) ? apptDate.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }) : 'the scheduled date';
                    createNotification(apptData.artist_id, 'Appointment Scheduled', `You have an appointment scheduled on ${dateStr}.`, 'appointment_confirmed', id);
                  }
                });
              }

              sendReceiptEmail(apptData.cx_email, {
                id: invoiceNumber,
                amount: actualPayment,
                method: method || 'Cash',
                clientName: apptData.client_name,
                designTitle: apptData.design_title,
                changeGiven: changeGiven,
                remaining: Math.max(0, remaining - actualPayment)
              });

              res.json({
                success: true,
                message: 'Payment recorded successfully',
                invoice: {
                  invoiceNumber,
                  invoiceId: invInsertRes?.insertId,
                  clientName: apptData.client_name,
                  designTitle: apptData.design_title || 'Session Payment',
                  amountPaid: actualPayment,
                  paymentMethod: method || 'Cash',
                  cashTendered: cashTendered ? parseFloat(cashTendered) : actualPayment,
                  changeGiven,
                  totalQuoted: apptData.price,
                  totalPaid: apptData.total_paid + actualPayment,
                  remainingBalance: Math.max(0, remaining - actualPayment),
                  date: new Date().toISOString()
                }
              });
            });
          });
        });
      });
  });
});


// ═══════════════ Billing Portal: Record Payment (Generate Financial Invoice) ═══════════════
app.post('/api/admin/billing/record-payment', (req, res) => {
  let { customerId, appointmentId, amount, method } = req.body;

  // ── Server-Side Sanitization (Layer 2 — Zero-Trust) ──
  customerId = parseInt(customerId, 10);
  appointmentId = parseInt(appointmentId, 10);
  amount = parseFloat(amount);
  method = (method || 'Cash').substring(0, 50);

  if (!customerId || isNaN(customerId)) {
    return res.status(400).json({ success: false, message: 'A valid client selection is required.' });
  }
  if (!appointmentId || isNaN(appointmentId)) {
    return res.status(400).json({ success: false, message: 'A valid appointment selection is required.' });
  }
  if (!amount || isNaN(amount) || amount <= 0) {
    return res.status(400).json({ success: false, message: 'Settlement amount must be greater than 0.' });
  }

  // Clamp amount to safe range
  amount = Math.min(Math.max(amount, 0.01), 99999999.99);

  const validMethods = ['Cash', 'GCash', 'Bank Transfer', 'Card'];
  if (!validMethods.includes(method)) method = 'Cash';

  // Fetch appointment + balance
  const checkQuery = `
    SELECT ap.price, ap.design_title, ap.service_type, ap.customer_id, ap.artist_id, ap.status, ap.appointment_date,
    ((SELECT COALESCE(SUM(amount), 0) FROM payments WHERE appointment_id = ap.id AND status = 'paid') / 100) + COALESCE(manual_paid_amount, 0) as total_paid,
    u.name as client_name, u.email as cx_email
    FROM appointments ap
    JOIN users u ON ap.customer_id = u.id
    WHERE ap.id = ? AND ap.customer_id = ? AND ap.is_deleted = 0
  `;

  db.query(checkQuery, [appointmentId, customerId], (checkErr, results) => {
    if (checkErr) return res.status(500).json({ success: false, message: 'Database error' });
    if (!results.length) return res.status(404).json({ success: false, message: 'Appointment not found for this client.' });

    const apptData = results[0];
    const remaining = Math.max(0, apptData.price - apptData.total_paid);

    if (remaining <= 0) {
      return res.status(400).json({ success: false, message: 'This appointment is already fully paid.' });
    }

    // Cap payment at remaining balance
    const actualPayment = Math.min(amount, remaining);
    const amountCentavos = Math.round(actualPayment * 100);
    const paymentId = `BILLING-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    const rawEvent = JSON.stringify({
      type: 'billing_invoice',
      method: method,
      source: 'admin_billing_portal',
      timestamp: new Date().toISOString()
    });

    // Insert payment
    db.query(`INSERT INTO payments (appointment_id, paymongo_payment_id, amount, status, raw_event) VALUES (?, ?, ?, 'paid', ?)`,
      [appointmentId, paymentId, amountCentavos, rawEvent], (payErr) => {
        if (payErr) return res.status(500).json({ success: false, message: 'Failed to record payment.' });

        // Update appointment payment_status
        const updateStatusQuery = `
          UPDATE appointments SET
            payment_status = CASE
              WHEN price > 0 AND ((SELECT COALESCE(SUM(amount), 0) FROM payments WHERE appointment_id = ? AND status = 'paid') / 100) + COALESCE(manual_paid_amount, 0) >= price THEN 'paid'
              WHEN price = 0 OR price IS NULL THEN 'paid'
              ELSE 'downpayment_paid'
            END,
            status = CASE
              WHEN status = 'pending' THEN 'confirmed'
              ELSE status
            END
          WHERE id = ?
        `;
        db.query(updateStatusQuery, [appointmentId, appointmentId], (upErr) => {
          // Generate sequential invoice number
          db.query('SELECT MAX(CAST(SUBSTRING(invoice_number, 5) AS UNSIGNED)) as maxNum FROM invoices WHERE invoice_number IS NOT NULL', (invErr, invRes) => {
            const nextNum = (invErr || !invRes[0]?.maxNum) ? 1 : invRes[0].maxNum + 1;
            const invoiceNumber = `INV-${String(nextNum).padStart(6, '0')}`;

            const serviceLabel = apptData.design_title || apptData.service_type || 'Session Payment';

            // Create invoice record
            const invoiceQuery = `INSERT INTO invoices (invoice_number, customer_id, appointment_id, client_name, service_type, amount, payment_method, change_given, discount_amount, discount_type, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, 0, 0, NULL, 'Paid', ?)`;
            db.query(invoiceQuery, [invoiceNumber, customerId, appointmentId, apptData.client_name, serviceLabel, actualPayment, method, getLocalDatetime()], (invInsertErr, invInsertRes) => {
              if (invInsertErr) console.error('Invoice creation failed:', invInsertErr.message);

              // Send notification to customer
              const customerMsg = `Your payment of ₱${actualPayment.toLocaleString("en-PH", { minimumFractionDigits: 2 })} has been recorded. Invoice ${invoiceNumber} is now available. View your receipt from your notifications.`;
              createNotification(customerId, 'Payment Received', customerMsg, 'payment_success', invInsertRes?.insertId || appointmentId);

              // Artist payment notifications removed per business rules — only admin receives payment alerts

              // Send receipt email
              sendReceiptEmail(apptData.cx_email, {
                id: invoiceNumber,
                amount: actualPayment,
                method: method,
                clientName: apptData.client_name,
                designTitle: serviceLabel,
                changeGiven: 0,
                remaining: Math.max(0, remaining - actualPayment)
              });

              res.json({
                success: true,
                message: 'Payment recorded and invoice generated successfully.',
                invoice: {
                  invoiceNumber,
                  invoiceId: invInsertRes?.insertId,
                  clientName: apptData.client_name,
                  serviceType: serviceLabel,
                  amountPaid: actualPayment,
                  paymentMethod: method,
                  totalQuoted: apptData.price,
                  totalPaid: apptData.total_paid + actualPayment,
                  remainingBalance: Math.max(0, remaining - actualPayment),
                  date: new Date().toISOString()
                }
              });
            });
          });
        });
      });
  });
});


// Resend receipt email to customer for a specific invoice
app.post('/api/admin/invoices/:id/resend', (req, res) => {
  const { id } = req.params;
  db.query(`
    SELECT i.*, u.email as customer_email, u.name as customer_name
    FROM invoices i
    LEFT JOIN users u ON i.customer_id = u.id
    WHERE i.id = ?
  `, [id], (err, results) => {
    if (err || results.length === 0) {
      return res.status(err ? 500 : 404).json({ success: false, message: err ? 'Database error' : 'Invoice not found' });
    }
    const invoice = results[0];
    if (!invoice.customer_email) {
      return res.status(400).json({ success: false, message: 'No email address found for this customer.' });
    }
    sendReceiptEmail(invoice.customer_email, {
      id: invoice.invoice_number,
      amount: parseFloat(invoice.amount),
      method: invoice.payment_method || 'Manual',
      clientName: invoice.client_name || invoice.customer_name,
      designTitle: invoice.service_type || 'Session Payment',
      changeGiven: parseFloat(invoice.change_given) || 0,
      remaining: 0
    });
    res.json({ success: true, message: `Receipt sent to ${invoice.customer_email}` });
  });
});

// DELETE (soft) an appointment (Admin)
app.delete('/api/admin/appointments/:id', (req, res) => {
  const { id } = req.params;
  db.query('UPDATE appointments SET is_deleted = 1 WHERE id = ?', [id], (err, result) => {
    if (err) {
      console.error('[ERROR] Error deleting appointment:', err);
      return res.status(500).json({ success: false, message: 'Database error: ' + err.message });
    }
    if (result.affectedRows === 0) {
      return res.status(404).json({ success: false, message: 'Appointment not found.' });
    }
    res.json({ success: true, message: 'Appointment deleted successfully' });
  });
});

// Get session materials for a specific appointment
app.get('/api/appointments/:id/materials', (req, res) => {
  const { id } = req.params;
  const query = `
    SELECT sm.id, sm.inventory_id, sm.quantity, sm.status, i.name as item_name, i.unit, i.cost, i.category 
    FROM session_materials sm 
    JOIN inventory i ON sm.inventory_id = i.id 
    WHERE sm.appointment_id = ? AND sm.status != 'released'
  `;
  db.query(query, [id], (err, results) => {
    if (err) return res.status(500).json({ success: false, message: 'Database error' });

    // Calculate total cost
    const totalCost = results.reduce((sum, item) => sum + (item.quantity * item.cost), 0);

    res.json({ success: true, materials: results, totalCost });
  });
});

// Quick Add a material to a session
app.post('/api/appointments/:id/materials', (req, res) => {
  const { id } = req.params;
  const { inventory_id, quantity } = req.body;

  console.log(`[INFO] Adding material to appointment ${id}: inventory_id=${inventory_id}, quantity=${quantity}`);

  // Deduct from inventory immediately and add to session_materials as hold
  db.query('UPDATE inventory SET current_stock = current_stock - ? WHERE id = ? AND current_stock >= ?',
    [quantity, inventory_id, quantity], (err, result) => {

      if (err) {
        console.error('[ERROR] Error deducting inventory:', err);
        return res.status(500).json({ success: false, message: 'Database error: ' + err.message });
      }
      if (result.affectedRows === 0) {
        console.warn(`[WARN] Inventory update failed: Item ${inventory_id} may not exist or insufficient stock`);
        return res.status(400).json({ success: false, message: 'Insufficient stock or invalid item' });
      }

      console.log(`[OK] Deducted ${quantity} from inventory ${inventory_id}`);

      // Try to update existing hold first
      db.query('UPDATE session_materials SET quantity = quantity + ? WHERE appointment_id = ? AND inventory_id = ? AND status = "hold"',
        [quantity, id, inventory_id], (updErr, updResult) => {
          if (updErr) {
            console.error('[ERROR] Error updating session material:', updErr);
            // Rollback stock
            db.query('UPDATE inventory SET current_stock = current_stock + ? WHERE id = ?', [quantity, inventory_id]);
            return res.status(500).json({ success: false, message: 'Failed to update material usage: ' + updErr.message });
          }

          if (updResult.affectedRows > 0) {
            console.log(`[OK] Incremented session material quantity`);
            return res.json({ success: true, message: 'Material quantity incremented' });
          } else {
            // Insert new row if no hold exists
            db.query('INSERT INTO session_materials (appointment_id, inventory_id, quantity, status) VALUES (?, ?, ?, ?)',
              [id, inventory_id, quantity, 'hold'], (insErr) => {
                if (insErr) {
                  console.error('[ERROR] Error inserting session material:', insErr);
                  // Rollback stock
                  db.query('UPDATE inventory SET current_stock = current_stock + ? WHERE id = ?', [quantity, inventory_id]);
                  return res.status(500).json({ success: false, message: 'Failed to record material usage: ' + insErr.message });
                }
                console.log(`[OK] Added session material as HOLD status`);
                res.json({ success: true, message: 'Material added to session' });
              });
          }
      });
    });
});

// Release a material hold back to inventory
app.post('/api/appointments/:id/release-material', (req, res) => {
  const { id } = req.params;
  const { materialId } = req.body;

  db.query('SELECT inventory_id, quantity FROM session_materials WHERE id = ? AND appointment_id = ? AND status = "hold"', [materialId, id], (err, results) => {
    if (err) return res.status(500).json({ success: false, message: 'Database error' });
    if (results.length === 0) return res.status(400).json({ success: false, message: 'Material not found or not on hold' });

    const mat = results[0];
    db.query('UPDATE session_materials SET status = "released" WHERE id = ?', [materialId], (updErr) => {
      if (updErr) return res.status(500).json({ success: false, message: 'Database error' });
      db.query('UPDATE inventory SET current_stock = current_stock + ? WHERE id = ?', [mat.quantity, mat.inventory_id], (invErr) => {
        if (invErr) return res.status(500).json({ success: false, message: 'Database error' });
        res.json({ success: true, message: 'Material released back to inventory' });
      });
    });
  });
});

// Update appointment status
app.put('/api/appointments/:id/status', (req, res) => {
  const { id } = req.params;
  const { status, price, isFullyComplete, sessionDuration, auditLog } = req.body;

  // Fetch appointment first to get user IDs and service_type for inventory logic
  db.query('SELECT * FROM appointments WHERE id = ?', [id], (err, results) => {
    if (err || results.length === 0) {
      return res.status(err ? 500 : 404).json({ success: false, message: err ? 'Database error' : 'Appointment not found' });
    }

    const appointment = results[0];

    // INVENTORY LOGIC

    // ═══ CONFIRMED: Auto-hold piercing jewelry selections ═══
    if (status === 'confirmed' && appointment.status !== 'confirmed') {
      let jewelrySelections = [];
      try {
        if (appointment.piercing_jewelry) {
          jewelrySelections = typeof appointment.piercing_jewelry === 'string'
            ? JSON.parse(appointment.piercing_jewelry)
            : appointment.piercing_jewelry;
        }
      } catch (e) {
        console.warn('[WARN] Could not parse piercing_jewelry JSON:', e.message);
      }

      // Hold each studio-selected jewelry item
      const studioItems = (jewelrySelections || []).filter(j => j.type === 'studio' && j.itemId);
      if (studioItems.length > 0) {
        studioItems.forEach(jewSel => {
          db.query(
            'SELECT id, name, cost, current_stock FROM inventory WHERE id = ? AND current_stock > 0',
            [jewSel.itemId],
            (jewErr, jewRows) => {
              if (!jewErr && jewRows.length > 0) {
                const item = jewRows[0];
                db.query(
                  'UPDATE inventory SET current_stock = current_stock - 1 WHERE id = ? AND current_stock >= 1',
                  [item.id],
                  (updErr, updRes) => {
                    if (!updErr && updRes.affectedRows > 0) {
                      // Check if already held for this appointment to prevent double-holds
                      db.query(
                        'SELECT id FROM session_materials WHERE appointment_id = ? AND inventory_id = ? AND status = "hold"',
                        [id, item.id],
                        (chkErr, chkRows) => {
                          if (!chkErr && chkRows.length === 0) {
                            db.query(
                              'INSERT INTO session_materials (appointment_id, inventory_id, quantity, status) VALUES (?, ?, 1, "hold")',
                              [id, item.id]
                            );
                            db.query(
                              'INSERT INTO inventory_transactions (inventory_id, type, quantity, reason) VALUES (?, "out", 1, ?)',
                              [item.id, `Held for piercing [${jewSel.bodyPart}] on appointment #${id}`]
                            );
                            console.log(`[OK] Jewelry held: "${item.name}" for ${jewSel.bodyPart} on appointment #${id}`);
                          } else {
                            // Already held — restore the stock we just decremented
                            db.query('UPDATE inventory SET current_stock = current_stock + 1 WHERE id = ?', [item.id]);
                          }
                        }
                      );
                    }
                  }
                );
              }
            }
          );
        });
      }
    }

    if (status === 'in_progress' && appointment.status !== 'in_progress') {
      // 1. Session Started: Load kit and HOLD inventory
      const serviceType = appointment.service_type || 'General Session';

      db.query('SELECT inventory_id, default_quantity FROM service_kits WHERE service_type = ?', [serviceType], (kitErr, kitItems) => {
        if (!kitErr && kitItems.length > 0) {
          kitItems.forEach(item => {
            // Deduct stock
            db.query('UPDATE inventory SET current_stock = current_stock - ? WHERE id = ? AND current_stock >= ?',
              [item.default_quantity, item.inventory_id, item.default_quantity], (updErr, updRes) => {
                if (!updErr && updRes.affectedRows > 0) {
                  // Record hold
                  db.query('INSERT INTO session_materials (appointment_id, inventory_id, quantity, status) VALUES (?, ?, ?, ?)',
                    [id, item.inventory_id, item.default_quantity, 'hold']);
                }
              });
          });
        }
      });
    } else if (status === 'completed' && appointment.status === 'in_progress') {
      // 2. Session Completed: Finalize tracking and log material transaction out
      db.query('SELECT sm.id, sm.inventory_id, sm.quantity, i.cost, i.name FROM session_materials sm JOIN inventory i ON sm.inventory_id = i.id WHERE sm.appointment_id = ? AND sm.status = \'hold\'', [id], (matErr, mats) => {
        if (!matErr && mats.length > 0) {
          mats.forEach(mat => {
            db.query('UPDATE session_materials SET status = ? WHERE id = ?', ['consumed', mat.id]);
            db.query('INSERT INTO inventory_transactions (inventory_id, type, quantity, reason) VALUES (?, ?, ?, ?)',
              [mat.inventory_id, 'out', mat.quantity, `Consumed in session #${id}`]);
          });
        }
      });
    } else if (status === 'cancelled' && appointment.status === 'in_progress') {
      // 3. Session Cancelled mid-way: Release hold and return to stock
      db.query('SELECT id, inventory_id, quantity FROM session_materials WHERE appointment_id = ? AND status = \'hold\'', [id], (matErr, mats) => {
        if (!matErr && mats.length > 0) {
          mats.forEach(mat => {
            db.query('UPDATE session_materials SET status = ? WHERE id = ?', ['released', mat.id]);
            db.query('UPDATE inventory SET current_stock = current_stock + ? WHERE id = ?', [mat.quantity, mat.inventory_id]);
          });
        }
      });
    } else if (status === 'incomplete' && appointment.status === 'in_progress') {
      // 4. Session Aborted/Incomplete: Consume used materials (they can't be reused)
      db.query('SELECT sm.id, sm.inventory_id, sm.quantity, i.cost, i.name FROM session_materials sm JOIN inventory i ON sm.inventory_id = i.id WHERE sm.appointment_id = ? AND sm.status = \'hold\'', [id], (matErr, mats) => {
        if (!matErr && mats.length > 0) {
          mats.forEach(mat => {
            db.query('UPDATE session_materials SET status = ? WHERE id = ?', ['consumed', mat.id]);
            db.query('INSERT INTO inventory_transactions (inventory_id, type, quantity, reason) VALUES (?, ?, ?, ?)',
              [mat.inventory_id, 'out', mat.quantity, `Consumed in incomplete session #${id}`]);
          });
        }
      });
    }

    // UPDATE APPOINTMENT
    let updateQuery = 'UPDATE appointments SET status = ?';
    let queryParams = [status];

    if (price !== undefined && price !== null) {
      updateQuery += ', price = ?';
      queryParams.push(price);
    }
    if (sessionDuration !== undefined && sessionDuration !== null) {
      updateQuery += ', session_duration = ?';
      queryParams.push(sessionDuration);
    }
    if (auditLog !== undefined && auditLog !== null) {
      updateQuery += ', audit_log = ?';
      queryParams.push(typeof auditLog === 'string' ? auditLog : JSON.stringify(auditLog));
    }
    updateQuery += ' WHERE id = ?';
    queryParams.push(id);

    db.query(updateQuery, queryParams, (updateErr, result) => {
      if (updateErr) return res.status(500).json({ success: false, message: 'Database error' });

      // Send Notifications
      const dateStr = appointment.appointment_date ? new Date(appointment.appointment_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'your scheduled date';
      const designTitle = appointment.design_title || 'your tattoo session';
      const serviceLabel = appointment.service_type || 'Tattoo Session';
      const bookingRef = appointment.booking_code || `#${id}`;
      const timeStr = appointment.start_time ? new Date(`2000-01-01T${appointment.start_time}`).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true }) : '';

      // ── SESSION STARTED ──
      if (status === 'in_progress') {
        const startTimestamp = `${dateStr}${timeStr ? ' ' + timeStr : ''}`;

        // Customer
        createNotification(appointment.customer_id, 'Session In Progress', `Your ${serviceLabel} session #${id} has started at ${startTimestamp}.`, 'session_started', id);

        // Artist
        if (appointment.artist_id) {
          createNotification(appointment.artist_id, 'Session Started', `Appointment #${id} — "${designTitle}" — ${startTimestamp} is now in progress.`, 'session_started', id);
        }

        // All Admins
        db.query("SELECT id FROM users WHERE user_type IN ('admin', 'manager') AND is_deleted = 0", (adminErr, admins) => {
          if (!adminErr && admins.length > 0) {
            admins.forEach(admin => {
              createNotification(admin.id, 'Session Started', `Appointment #${id} — "${designTitle}" — ${startTimestamp} has been started by the artist.`, 'session_started', id);
            });
          }
        });

        // ── CONFIRMED ──
      } else if (status === 'confirmed') {
        createNotification(appointment.customer_id, 'Session Confirmed!', `Great news! Your appointment on ${dateStr} for "${designTitle}" is now officially confirmed. We look forward to seeing you!`, 'appointment_confirmed', id);
        createNotification(appointment.artist_id, 'Appointment Confirmed', `Appointment #${id} for ${designTitle} is now confirmed.`, 'appointment_confirmed', id);
      } else if (status === 'cancelled') {
        if (appointment.status === 'pending') {
          createNotification(appointment.customer_id, 'Booking Request Declined', `Notice: Your booking request for ${dateStr} could not be accepted at this time. Please try another date or artist.`, 'appointment_rejected', id);
          createNotification(appointment.artist_id, 'Request Declined', `Booking request #${id} has been declined.`, 'appointment_rejected', id);
        } else {
          createNotification(appointment.customer_id, 'Appointment Cancelled', `Notice: Your appointment scheduled for ${dateStr} has been cancelled. Please contact the studio if you have any questions.`, 'appointment_cancelled', id);
          createNotification(appointment.artist_id, 'Appointment Cancelled', `Appointment #${id} has been cancelled.`, 'appointment_cancelled', id);
        }

        // ── SESSION COMPLETED ──
      } else if (status === 'completed' && appointment.status !== 'completed') {
        if (isFullyComplete || isFullyComplete === undefined) {
          createNotification(appointment.customer_id, 'Tattoo Journey Complete!', `Your session for "${designTitle}" is finished! We hope you love your new ink.`, 'appointment_completed', id);

          // Trigger Aftercare Reminder
          createNotification(appointment.customer_id, 'Don\'t forget your Aftercare!', `Proper healing is key! Review the aftercare instructions for your new "${designTitle}" tattoo to keep it looking fresh.`, 'aftercare_reminder', id);

          // Trigger Review Prompt
          createNotification(appointment.customer_id, 'How did we do?', `Please take a moment to leave a review for your artist! We value your feedback on your latest session.`, 'review_prompt', id);

          // Notify the artist
          if (appointment.artist_id) {
            createNotification(appointment.artist_id, 'Session Completed', `Appointment #${id} — "${designTitle}" — ${dateStr} has been marked as completed.`, 'appointment_completed', id);
          }

          // Notify all admins about session completion
          db.query('SELECT id FROM users WHERE user_type = \'admin\'', (adminErr, admins) => {
            if (!adminErr && admins.length > 0) {
              admins.forEach(admin => {
                createNotification(admin.id, 'Session Completed', `Appointment #${id} for "${designTitle}" on ${dateStr} has been completed.`, 'appointment_completed', id);
              });
            }
          });

          // ── Completed Session Email (aftercare tracker ad) ──
          const aftercareAdBlock = `
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td align="center" style="padding:12px 0 16px;">
              <div style="display:inline-block;width:100%;max-width:400px;box-sizing:border-box;padding:22px 24px;background:linear-gradient(135deg,#1a1816 0%,#14120f 100%);border:1px solid rgba(190,144,85,0.3);border-radius:14px;text-align:center;">
                <p style="margin:0 0 10px;font-size:16px;font-weight:700;color:#be9055;">Exclusive: Aftercare Tracking</p>
                <p style="margin:0 0 14px;font-size:13px;color:#94a3b8;line-height:1.6;">Your tattoo journey doesn't end here. InkVistAR includes a built-in aftercare tracker — an exclusive feature designed to guide you through every stage of healing for the best possible results with your new ink.</p>
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                  <tr><td style="padding:5px 0;font-size:13px;color:#334155;text-align:left;">&#x2022; Day-by-day healing milestones with personalized reminders</td></tr>
                  <tr><td style="padding:5px 0;font-size:13px;color:#334155;text-align:left;">&#x2022; Track your healing progress with photo updates</td></tr>
                  <tr><td style="padding:5px 0;font-size:13px;color:#334155;text-align:left;">&#x2022; Expert aftercare guidance tailored to your service type</td></tr>
                </table>
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td align="center" style="padding:14px 0 4px;">
                  <a href="${FRONTEND_URL}/customer/bookings" style="display:inline-block;padding:12px 28px;background:linear-gradient(135deg,#be9055,#a07840);color:#fff;font-size:14px;font-weight:700;text-decoration:none;border-radius:10px;letter-spacing:0.3px;">Start Aftercare Tracking &rarr;</a>
                </td></tr></table>
              </div>
            </td></tr></table>
          `;

          // Email to registered user
          sendRegisteredUserStatusEmail(db, appointment.customer_id,
            `Session Complete — ${serviceLabel} [${bookingRef}]`,
            'Session Complete!', '#10b981',
            `Your <strong style="color:#C19A6B;">${serviceLabel}</strong> session for "<strong>${designTitle}</strong>" has been successfully completed! We hope you love the result. Thank you for choosing InkVistAR Studio.`,
            [
              { label: 'Appointment', value: bookingRef, mono: true },
              { label: 'Service', value: serviceLabel },
              { label: 'Design', value: designTitle },
              { label: 'Date', value: dateStr },
              { label: 'Result', value: 'Completed Successfully' }
            ],
            aftercareAdBlock
          );

          // Email to guest (if applicable)
          if (appointment.guest_email) {
            sendGuestStatusEmail(appointment.guest_email, 'Valued Guest', bookingRef,
              `Session Complete [${bookingRef}]`,
              'Session Complete!', '#10b981',
              `Your <strong style="color:#C19A6B;">${serviceLabel}</strong> session for "<strong>${designTitle}</strong>" has been successfully completed! We hope you love the result. Thank you for choosing InkVistAR Studio.`,
              [
                { label: 'Ref Code', value: bookingRef, mono: true },
                { label: 'Service', value: serviceLabel },
                { label: 'Design', value: designTitle },
                { label: 'Result', value: 'Completed Successfully' }
              ], 'Create an InkVistAR account to access exclusive aftercare tracking and manage future appointments.'
            );
          }

          // PAYMENT RESOLUTION CHECK: Fire urgent admin alert if outstanding balance exists
          const paymentCheckQuery = `
            SELECT ap.price, ap.project_id, ap.session_number, ap.payment_status,
              ((SELECT COALESCE(SUM(amount), 0) FROM payments WHERE appointment_id = ap.id AND status = 'paid') / 100) + COALESCE(ap.manual_paid_amount, 0) as total_paid
            FROM appointments ap WHERE ap.id = ?
          `;
          db.query(paymentCheckQuery, [id], (pErr, pRes) => {
            if (!pErr && pRes.length) {
              const apptPrice = Number(pRes[0].price) || 0;
              const apptTotalPaid = Number(pRes[0].total_paid) || 0;
              const isProjectFollowup = pRes[0].project_id !== null && pRes[0].session_number > 1;
              const isAlreadyPaid = pRes[0].payment_status === 'paid';
              const hasOutstandingBalance = apptPrice > 0 && apptTotalPaid < apptPrice && !isAlreadyPaid;
              const isUnquoted = apptPrice <= 0 && !isProjectFollowup && !isAlreadyPaid;
              const isConsultation = (appointment.service_type || '').toLowerCase() === 'consultation';

              // Skip payment alerts for consultations (always free), already-paid sessions, and project follow-ups with no additional charge
              if (!isConsultation && (hasOutstandingBalance || isUnquoted)) {
                const alertMsg = isUnquoted
                  ? `Appointment #${id} for "${designTitle}" has been completed but has NO PRICE SET. The artist cannot be compensated until a quote is finalized and payment is collected.`
                  : `Appointment #${id} for "${designTitle}" has been completed with an outstanding balance of ₱${(apptPrice - apptTotalPaid).toLocaleString()}. Immediate action is required to process artist compensation.`;

                // Notify the customer to pay their balance!
                if (appointment.customer_id && !appointment.guest_email) {
                  const custMsg = isUnquoted
                    ? `Your session for "${designTitle}" is complete! Please wait while the studio finalizes your total price.`
                    : `Your session for "${designTitle}" is complete! You have an outstanding balance of ₱${(apptPrice - apptTotalPaid).toLocaleString()}. Please settle your balance through the app to finalize your booking.`;
                  createNotification(appointment.customer_id, 'Payment Required', custMsg, 'payment_action_required', id);
                }

                db.query("SELECT id FROM users WHERE user_type IN ('admin', 'manager') AND is_deleted = 0", (aErr, aRes) => {
                  if (!aErr && aRes.length) {
                    aRes.forEach(admin => {
                      createNotification(admin.id, 'Payment Resolution Required', alertMsg, 'payment_action_required', id);
                    });
                  }
                });
              }
            }
          });

        } else {
          createNotification(appointment.customer_id, 'Session Complete!', `Your session for "${designTitle}" today is finished. We will coordinate with you soon for your next session to continue your piece!`, 'appointment_partial_complete', id);
        }

        // SYNC: Automatically create a manual invoice for Admin Billing
        db.query('SELECT name FROM users WHERE id = ?', [appointment.customer_id], (uErr, uRes) => {
          const clientName = (!uErr && uRes.length) ? uRes[0].name : `Client #${appointment.customer_id}`;
          const currentPrice = price !== undefined ? Number(price) : Number(appointment.price) || 0;

          // Generate sequential invoice number (same pattern as manual payment flow)
          db.query('SELECT MAX(CAST(SUBSTRING(invoice_number, 5) AS UNSIGNED)) as maxNum FROM invoices WHERE invoice_number IS NOT NULL', (invNumErr, invNumRes) => {
            const nextNum = (invNumErr || !invNumRes[0]?.maxNum) ? 1 : invNumRes[0].maxNum + 1;
            const invoiceNumber = `INV-${String(nextNum).padStart(6, '0')}`;

            const invoiceQuery = 'INSERT INTO invoices (invoice_number, customer_id, appointment_id, client_name, service_type, amount, status, created_at) VALUES (?, ?, ?, ?, ?, ?, "Paid", ?)';
            db.query(invoiceQuery, [invoiceNumber, appointment.customer_id, id, clientName, appointment.service_type || 'Tattoo Session', currentPrice, getLocalDatetime()], (invErr) => {
              if (invErr) console.error('[ERROR] Failed to auto-generate invoice:', invErr.message);
              else console.log(`[OK] Auto-generated invoice ${invoiceNumber} for Client: ${clientName}`);
            });
          });

          if (appointment.artist_id && appointment.artist_id > 1) {
            const artistCommission = currentPrice * 0.30;
            db.query('INSERT INTO payouts (artist_id, amount, payout_method, status, reference_no, created_at) VALUES (?, ?, ?, ?, ?, ?)',
              [appointment.artist_id, artistCommission, 'System Default', 'Pending', `Commission Session #${id}`, getLocalDatetime()]);
          }
        });

        // ── SESSION ABORTED / INCOMPLETE ──
      } else if (status === 'incomplete') {
        const abortReason = req.body.abortReason || '';
        createNotification(appointment.customer_id, 'Session Stopped Early', `Your session for "${designTitle}" on ${dateStr} was marked as incomplete by your artist.${abortReason ? ' Reason: ' + abortReason : ''} The studio will follow up with you to reschedule.`, 'session_incomplete', id);

        // Notify the artist
        if (appointment.artist_id) {
          createNotification(appointment.artist_id, 'Session Aborted', `Appointment #${id} — "${designTitle}" — ${dateStr} was marked as incomplete.${abortReason ? ' Reason: ' + abortReason : ''}`, 'session_incomplete', id);
        }

        // Notify all admins
        db.query("SELECT id FROM users WHERE user_type IN ('admin', 'manager') AND is_deleted = 0", (adminErr, admins) => {
          if (!adminErr && admins.length > 0) {
            admins.forEach(admin => {
              createNotification(admin.id, 'Session Aborted', `Appointment #${id} for "${designTitle}" was marked incomplete by the artist.${abortReason ? ' Reason: ' + abortReason : ''}`, 'session_incomplete', id);
            });
          }
        });

        // ── Aborted Session Email (partial aftercare + rebook CTA) ──
        const abortReasonHtml = abortReason ? `<br><br><strong style="color:#334155;">Reason:</strong> ${abortReason}` : '';
        const partialAftercareBlock = `
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td align="center" style="padding:12px 0 16px;">
            <div style="display:inline-block;width:100%;max-width:400px;box-sizing:border-box;padding:22px 24px;background:linear-gradient(135deg,#1a1816 0%,#14120f 100%);border:1px solid rgba(234,179,8,0.3);border-radius:14px;">
              <p style="margin:0 0 10px;font-size:15px;font-weight:700;color:#eab308;text-align:center;">Partial Aftercare Notice</p>
              <p style="margin:0 0 14px;font-size:13px;color:#94a3b8;line-height:1.6;">Even though your session was stopped early, any work that was done still requires proper aftercare to heal correctly. Please follow the standard healing guidelines until your next visit.</p>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr><td style="padding:5px 0;font-size:13px;color:#334155;">&#x2022; Keep the area clean and dry for the first 24 hours</td></tr>
                <tr><td style="padding:5px 0;font-size:13px;color:#334155;">&#x2022; Avoid sun exposure, pools, and soaking until healed</td></tr>
                <tr><td style="padding:5px 0;font-size:13px;color:#334155;">&#x2022; Do not pick or scratch the treated area</td></tr>
              </table>
              <p style="margin:14px 0 0;font-size:13px;color:#94a3b8;line-height:1.6;">Continuing your tattoo in a follow-up session is highly recommended for the best final result. The studio will coordinate with you to schedule your next appointment.</p>
            </div>
          </td></tr></table>
        `;
        const rebookBlock = `
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td align="center" style="padding:4px 0 16px;">
            <div style="display:inline-block;width:100%;max-width:400px;box-sizing:border-box;padding:20px 24px;background:linear-gradient(135deg,#111827 0%,#1a1816 100%);border:1px solid rgba(190,144,85,0.3);border-radius:14px;text-align:center;">
              <p style="margin:0 0 8px;font-size:15px;font-weight:700;color:#be9055;">Ready to Continue?</p>
              <p style="margin:0 0 14px;font-size:13px;color:#94a3b8;line-height:1.6;">Book your next session to pick up where you left off and bring your design to completion.</p>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td align="center" style="padding:4px 0;">
                <a href="${FRONTEND_URL}/customer/bookings" style="display:inline-block;padding:12px 28px;background:linear-gradient(135deg,#be9055,#a07840);color:#fff;font-size:14px;font-weight:700;text-decoration:none;border-radius:10px;letter-spacing:0.3px;">Book Next Session &rarr;</a>
              </td></tr></table>
            </div>
          </td></tr></table>
        `;

        // Email to registered user
        sendRegisteredUserStatusEmail(db, appointment.customer_id,
          `Session Update — ${serviceLabel} [${bookingRef}]`,
          'Session Update', '#eab308',
          `Your <strong style="color:#C19A6B;">${serviceLabel}</strong> session for "<strong>${designTitle}</strong>" on ${dateStr} was stopped early. The studio will follow up with you to coordinate next steps.${abortReasonHtml}`,
          [
            { label: 'Appointment', value: bookingRef, mono: true },
            { label: 'Service', value: serviceLabel },
            { label: 'Design', value: designTitle },
            { label: 'Date', value: dateStr },
            { label: 'Status', value: 'Incomplete — Follow-up Required' }
          ],
          partialAftercareBlock + rebookBlock
        );

        // Email to guest (if applicable)
        if (appointment.guest_email) {
          sendGuestStatusEmail(appointment.guest_email, 'Valued Guest', bookingRef,
            `Session Update [${bookingRef}]`,
            'Session Update', '#eab308',
            `Your ${serviceLabel} session for "${designTitle}" on ${dateStr} was stopped early. The studio will follow up with you to coordinate next steps.${abortReasonHtml}`,
            [
              { label: 'Ref Code', value: bookingRef, mono: true },
              { label: 'Service', value: serviceLabel },
              { label: 'Design', value: designTitle },
              { label: 'Status', value: 'Incomplete — Follow-up Required' }
            ], 'Create an InkVistAR account to track your aftercare, manage bookings, and schedule your continuation session.'
          );
        }
      }

      res.json({ success: true, message: 'Appointment status updated' });
    });
  });
});

// GET Admin pending payment alerts (for global overlay polling)
app.get('/api/admin/pending-payment-alerts', (req, res) => {
  const query = `
    SELECT 
      ap.id,
      ap.booking_code,
      ap.design_title,
      ap.price,
      ap.status,
      ap.appointment_date,
      ap.start_time,
      ap.service_type,
      ap.artist_id,
      ap.customer_id,
      u.name as client_name,
      ar.name as artist_name,
      ((SELECT COALESCE(SUM(amount), 0) FROM payments WHERE appointment_id = ap.id AND status = 'paid') / 100) + COALESCE(ap.manual_paid_amount, 0) as total_paid
    FROM appointments ap
    JOIN users u ON ap.customer_id = u.id
    LEFT JOIN users ar ON ap.artist_id = ar.id
    WHERE ap.status = 'completed'
      AND ap.is_deleted = 0
      AND (ap.service_type IS NULL OR ap.service_type != 'Consultation')
      AND (ap.payment_status IS NULL OR ap.payment_status != 'paid')
      AND (
        (ap.price > 0 AND ((SELECT COALESCE(SUM(amount), 0) FROM payments WHERE appointment_id = ap.id AND status = 'paid') / 100) + COALESCE(ap.manual_paid_amount, 0) < ap.price)
        OR ((ap.price IS NULL OR ap.price <= 0) AND (ap.project_id IS NULL OR ap.session_number <= 1))
      )
    ORDER BY ap.appointment_date DESC
    LIMIT 20
  `;
  db.query(query, (err, results) => {
    if (err) {
      console.error('[ERROR] Error fetching pending payment alerts:', err.message);
      return res.status(500).json({ success: false, message: 'Database error' });
    }
    res.json({ success: true, alerts: results || [] });
  });
});

// GET Artist Earnings Ledger (Secure calculation)
app.get('/api/artist/:id/earnings-ledger', (req, res) => {
  const { id } = req.params;

  // Commission rate is hardcoded to 30% per business rules (gemini.md Section 1)
  // The DB column is ignored to prevent drift — referral 70% is handled per-appointment via is_referral flag
  db.query('SELECT COALESCE(commission_rate, 0.30) as commission_rate FROM artists WHERE user_id = ?', [id], (rateErr, rateResults) => {
    if (rateErr) return res.status(500).json({ success: false, message: 'Database error fetching commission rate' });

    const ARTIST_RATE = 0.30; // Enforced: 30% commission guarantee
    const REFERRAL_RATE = 0.70; // Referral: 70% artist / 30% studio

    // 2. Get Completed Appointments
    const apptsQuery = `
      SELECT ap.id, ap.appointment_date, ap.design_title, ap.price, ap.tattoo_price, ap.piercing_price, ap.service_type, ap.payment_status, ap.status, 
             ap.artist_id, ap.secondary_artist_id, ap.commission_split, ap.is_referral,
             COALESCE(ap.discount_amount, 0) as discount_amount, ap.discount_type,
             ((SELECT COALESCE(SUM(amount), 0) FROM payments p WHERE p.appointment_id = ap.id AND p.status = 'paid') / 100) + COALESCE(ap.manual_paid_amount, 0) as total_paid,
             u_cust.name as client_name,
             u_sec.name as secondary_artist_name,
             u_pri.name as primary_artist_name
      FROM appointments ap
      LEFT JOIN users u_cust ON ap.customer_id = u_cust.id
      LEFT JOIN users u_sec ON ap.secondary_artist_id = u_sec.id
      LEFT JOIN users u_pri ON ap.artist_id = u_pri.id
      WHERE (ap.artist_id = ? OR ap.secondary_artist_id = ?) AND ap.status = 'completed' AND ap.is_deleted = 0
    `;
    db.query(apptsQuery, [id, id], (apptsErr, appts) => {
      if (apptsErr) return res.status(500).json({ success: false, message: 'Database error fetching appointments' });

      // 3. Get Payout History
      db.query('SELECT * FROM payouts WHERE artist_id = ? ORDER BY created_at DESC', [id], (payErr, payouts) => {
        if (payErr) return res.status(500).json({ success: false, message: 'Database error fetching payouts' });

        // Calculate Totals
        // For collabs: commission_split is the primary artist's % share of the artist pool
        // e.g. commission_split=50 means primary gets 50% of pool, secondary gets 50%
        // e.g. commission_split=60 means primary gets 60% of pool, secondary gets 40%
        const calculations = appts.map(a => {
          // Calculate effective price after discount (Task 1.3)
          let effectivePrice = a.price || 0;
          const rawDiscount = parseFloat(a.discount_amount) || 0;
          if (rawDiscount > 0) {
            if (a.discount_type === 'percent') {
              effectivePrice = effectivePrice * (1 - rawDiscount / 100);
            } else {
              effectivePrice = Math.max(0, effectivePrice - rawDiscount);
            }
          }

          let artistShare;
          const isCollab = !!a.secondary_artist_id;
          const isPrimary = Number(a.artist_id) === Number(id);
          let splitPercent = 100;
          let collabPartnerName = null;
          let serviceLine = null; // The service line this artist is being paid from

          if (isCollab) {
            // Determine if this is a dual-service session with split pricing
            const hasSplitPricing = a.tattoo_price !== null && a.piercing_price !== null;

            if (hasSplitPricing) {
              // Per-service-line commission: use service-line prices (discount already factored into total)
              const discountRatio = a.price > 0 ? effectivePrice / a.price : 1;
              if (isPrimary) {
                artistShare = a.tattoo_price * discountRatio * ARTIST_RATE;
                splitPercent = Math.round((a.tattoo_price / a.price) * 100) || 0;
                collabPartnerName = a.secondary_artist_name;
                serviceLine = 'Tattoo';
              } else {
                artistShare = a.piercing_price * discountRatio * ARTIST_RATE;
                splitPercent = Math.round((a.piercing_price / a.price) * 100) || 0;
                collabPartnerName = a.primary_artist_name;
                serviceLine = 'Piercing';
              }
            } else {
              // Legacy collab or dual-tattoo-artist session: split by percentage slider
              const split = a.commission_split || 50;
              if (isPrimary) {
                artistShare = effectivePrice * ARTIST_RATE * (split / 100);
                splitPercent = split;
                collabPartnerName = a.secondary_artist_name;
              } else {
                artistShare = effectivePrice * ARTIST_RATE * ((100 - split) / 100);
                splitPercent = 100 - split;
                collabPartnerName = a.primary_artist_name;
              }
            }
          } else {
            // Solo session: apply referral rate if flagged
            const effectiveRate = a.is_referral ? REFERRAL_RATE : ARTIST_RATE;
            artistShare = effectivePrice * effectiveRate;
          }
          return {
            ...a,
            artistShare,
            basePrice: effectivePrice,
            originalPrice: a.price,
            discountAmount: rawDiscount,
            discountType: a.discount_type,
            studioShare: effectivePrice - artistShare,
            isCollab,
            isPrimary,
            splitPercent,
            collabPartnerName,
            serviceLine,
            isReferral: !!a.is_referral,
            totalPaid: a.total_paid || 0,
            // Cross-check: if total_paid covers full price, treat as paid regardless of stale payment_status
            effectivePaymentStatus: (a.price > 0 && (a.total_paid || 0) >= a.price) ? 'paid' : a.payment_status
          };
        });

        const totalEarned = calculations
          .filter(a => a.effectivePaymentStatus === 'paid')
          .reduce((sum, a) => sum + a.artistShare, 0);

        const pendingFromUnpaid = calculations
          .filter(a => a.effectivePaymentStatus !== 'paid')
          .reduce((sum, a) => sum + a.artistShare, 0);

        const totalPaidOut = payouts.reduce((sum, p) => sum + Number(p.amount), 0);

        res.json({
          success: true,
          commissionRate: ARTIST_RATE,
          stats: {
            totalEarned,
            pendingFromUnpaid,
            totalPaidOut,
            balanceToPay: totalEarned - totalPaidOut
          },
          sessions: calculations,
          payouts: payouts
        });
      });
    });
  });
});

// GET All Payouts (Admin Only)
app.get('/api/admin/payouts', (req, res) => {
  const query = `
    SELECT p.*, u.name as artist_name 
    FROM payouts p
    JOIN users u ON p.artist_id = u.id
    ORDER BY p.created_at DESC
  `;
  db.query(query, (err, results) => {
    if (err) return res.status(500).json({ success: false, message: 'Database error' });
    res.json({ success: true, data: results });
  });
});

// POST Record a Payout (Admin Only)
app.post('/api/admin/payouts', (req, res) => {
  const { artistId, amount, method, reference } = req.body;

  if (!artistId || !amount) return res.status(400).json({ success: false, message: 'Missing required fields' });

  const query = 'INSERT INTO payouts (artist_id, amount, payout_method, reference_no) VALUES (?, ?, ?, ?)';
  db.query(query, [artistId, amount, method || 'Bank Transfer', reference || 'N/A'], (err, result) => {
    if (err) return res.status(500).json({ success: false, message: 'Database error: ' + err.message });

    // Notify the artist about their payout
    const payoutAmt = parseFloat(amount).toLocaleString('en-PH', { minimumFractionDigits: 2 });
    const payoutMethod = method || 'Bank Transfer';
    createNotification(artistId, 'Payout Processed', `A payout of \u20b1${payoutAmt} has been processed for you via ${payoutMethod}.${reference ? ' Reference: ' + reference : ''} Check your account for the funds.`, 'payout_processed', result.insertId);

    res.json({ success: true, message: 'Payout recorded successfully' });
  });
});

// GET Payout Alerts (Admin Only)
// Returns artists that are due for payout if today is the 15th or 30th (or last day of month)
app.get('/api/admin/payout-alerts', (req, res) => {
  const today = new Date();
  const day = today.getDate();
  const isLastDayOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate() === day;
  const isPayoutDay = (day === 15) || (day === 30) || isLastDayOfMonth;

  if (!isPayoutDay) {
    return res.json({ success: true, alerts: [] });
  }

  const query = `
    SELECT u.id as artist_id, u.name as artist_name,
      COALESCE((
        SELECT SUM(
          CASE 
            WHEN a.commission_split IS NOT NULL AND a.secondary_artist_id = u.id 
              THEN ((COALESCE((SELECT COALESCE(SUM(amount),0) FROM payments WHERE appointment_id = a.id AND status = 'paid'), 0) / 100) + COALESCE(a.manual_paid_amount, 0)) * 0.30 * ((100 - a.commission_split) / 100)
            WHEN a.commission_split IS NOT NULL AND a.artist_id = u.id 
              THEN ((COALESCE((SELECT COALESCE(SUM(amount),0) FROM payments WHERE appointment_id = a.id AND status = 'paid'), 0) / 100) + COALESCE(a.manual_paid_amount, 0)) * 0.30 * (a.commission_split / 100)
            ELSE ((COALESCE((SELECT COALESCE(SUM(amount),0) FROM payments WHERE appointment_id = a.id AND status = 'paid'), 0) / 100) + COALESCE(a.manual_paid_amount, 0)) * 0.30
          END
        )
        FROM appointments a
        WHERE (a.artist_id = u.id OR a.secondary_artist_id = u.id)
          AND a.is_deleted = 0 AND a.status IN ('confirmed', 'completed')
      ), 0) - COALESCE((SELECT SUM(amount) FROM payouts WHERE artist_id = u.id), 0) as unclaimed_balance
    FROM users u
    WHERE u.user_type = 'artist' AND u.is_deleted = 0
    HAVING unclaimed_balance > 0
  `;

  db.query(query, (err, artists) => {
    if (err) return res.status(500).json({ success: false, message: 'Database error calculating payouts' });
    res.json({ success: true, alerts: artists });
  });
});

// POST Release/Return individual material to inventory
app.post('/api/appointments/:id/release-material', (req, res) => {
  const appointmentId = parseInt(req.params.id, 10);
  const materialId = parseInt(req.body.materialId, 10);

  console.log(`[INFO] Releasing material ${materialId} for appt ${appointmentId}`);
  console.log(`DEBUG: Received materialId: ${req.body.materialId} (parsed: ${materialId}), appointmentId: ${req.params.id} (parsed: ${appointmentId})`);

  if (isNaN(materialId)) return res.status(400).json({ success: false, message: 'Material record ID required' });

  // 1. Get material info
  const selectQuery = 'SELECT * FROM session_materials WHERE id = ? AND appointment_id = ? AND status = \'hold\'';
  const selectParams = [materialId, appointmentId];
  console.log(`DEBUG: Executing SELECT query: ${selectQuery} with params: ${selectParams}`);
  db.query(selectQuery, selectParams, (err, results) => {
    if (err) {
      console.error('ERROR: DB error during material SELECT:', err.message);
      return res.status(500).json({ success: false, message: 'Database error during material lookup.' });
    }
    if (results.length === 0) {
      // Deep diagnostic: why wasn't it found?
      db.query('SELECT status FROM session_materials WHERE id = ?', [materialId], (checkErr, checkRes) => {
        if (!checkErr && checkRes.length > 0) {
          console.warn(`[Core] DEBUG: Material #${materialId} found but status is '${checkRes[0].status}', not 'hold'. This is why the release failed.`);
        } else {
          console.warn(`[Core] DEBUG: Material ID #${materialId} does not exist in session_materials at all.`);
        }
      });

      return res.json({ success: false, message: `This item has already been returned to inventory or the session has been completed. Please refresh the page if you think this is an error.` });
    }

    const material = results[0];
    console.log(`DEBUG: Found material:`, material);

    // 2. Return to stock
    db.query('UPDATE inventory SET current_stock = current_stock + ? WHERE id = ?', [material.quantity, material.inventory_id], (updErr) => {
      if (updErr) {
        console.error('ERROR: Failed to update inventory stock:', updErr.message);
        return res.status(500).json({ success: false, message: 'Failed to update stock' });
      }
      console.log(`DEBUG: Updated inventory for item ${material.inventory_id} by adding ${material.quantity}`);

      // 3. Mark as released
      db.query('UPDATE session_materials SET status = \'released\' WHERE id = ?', [materialId], (relErr) => {
        if (relErr) {
          console.error('ERROR: Failed to update session_materials status:', relErr.message);
          return res.status(500).json({ success: false, message: 'Failed to update record status' });
        }
        console.log(`DEBUG: Session material ${materialId} status updated to "released"`);

        res.json({ success: true, message: 'Material returned to inventory successfully' });
      });
    });
  });
});

// Update appointment details (Notes, Supplies, Photos)
app.put('/api/appointments/:id/details', (req, res) => {
  const { id } = req.params;
  const { notes, beforePhoto, afterPhoto, draftImage } = req.body;

  console.log(`[INFO] Saving details for appointment ${id}`);
  console.log(`   - Notes: ${notes ? notes.substring(0, 50) + '...' : 'empty'}`);
  console.log(`   - Before Photo: ${beforePhoto ? beforePhoto.substring(0, 50) + '...' : 'none'}`);
  console.log(`   - After Photo: ${afterPhoto ? afterPhoto.substring(0, 50) + '...' : 'none'}`);
  console.log(`   - Draft Image: ${draftImage ? draftImage.substring(0, 50) + '...' : 'none'}`);

  let query = 'UPDATE appointments SET notes = ?';
  let params = [notes];

  if (beforePhoto !== undefined && beforePhoto !== null && beforePhoto.length > 0) {
    query += ', before_photo = ?';
    params.push(beforePhoto);
  }

  if (afterPhoto !== undefined && afterPhoto !== null && afterPhoto.length > 0) {
    query += ', after_photo = ?';
    params.push(afterPhoto);
  }

  if (draftImage !== undefined && draftImage !== null && draftImage.length > 0) {
    query += ', draft_image = ?';
    params.push(draftImage);
  }

  query += ' WHERE id = ?';
  params.push(id);

  console.log(`[DEBUG] Query: ${query.substring(0, 100)}...`);

  db.query(query, params, (err, result) => {
    if (err) {
      console.error('[ERROR] Error updating appointment details:', err);
      return res.status(500).json({ success: false, message: 'Database error: ' + err.message });
    }

    console.log(`[OK] Updated appointment ${id}: ${result.affectedRows} rows affected`);
    res.json({ success: true, message: 'Details updated successfully' });
  });
});

// ========== PAYMENT ENDPOINTS (PayMongo Checkout) ==========

// Get appointment details (images, notes) - lightweight fetch for active session
app.get('/api/appointments/:id/details', (req, res) => {
  const { id } = req.params;
  db.query(
    'SELECT id, draft_image, reference_image, before_photo, after_photo, notes FROM appointments WHERE id = ?',
    [id],
    (err, results) => {
      if (err) return res.status(500).json({ success: false, message: 'Database error' });
      if (results.length === 0) return res.status(404).json({ success: false, message: 'Appointment not found' });
      res.json({ success: true, appointment: results[0] });
    }
  );
});

// Create a PayMongo Checkout Session
app.post('/api/payments/create-checkout-session', async (req, res) => {
  const { appointmentId, price: providedPrice, paymentType, customAmount, agreedToWaiver } = req.body; // paymentType: 'full', 'deposit', or 'custom'

  if (!appointmentId) {
    return res.status(400).json({ success: false, message: 'appointmentId is required' });
  }

  if (!PAYMONGO_SECRET_KEY) {
    return res.status(500).json({ success: false, message: 'PAYMONGO_SECRET_KEY is not configured on the server.' });
  }

  try {
    // 1) Pull appointment to get authoritative price AND total already paid
    const checkoutQuery = `
      SELECT 
        ap.id, ap.price, ap.customer_id, ap.artist_id, ap.status, ap.design_title, ap.service_type, ap.booking_code,
        (SELECT COALESCE(SUM(amount), 0) FROM payments p WHERE p.appointment_id = ap.id AND p.status = 'paid') + (COALESCE(ap.manual_paid_amount, 0) * 100) as total_paid_centavos
      FROM appointments ap
      WHERE ap.id = ? AND ap.is_deleted = 0
    `;

    db.query(checkoutQuery, [appointmentId], async (err, results) => {
      if (err) {
        console.error('[ERROR] DB error loading appointment for checkout:', err.message);
        return res.status(500).json({ success: false, message: 'Database error' });
      }

      if (!results.length) {
        return res.status(404).json({ success: false, message: 'Appointment not found' });
      }

      const appointment = results[0];

      // Strict enforcement: block payment if booking_code is missing
      if (!appointment.booking_code) {
        return res.status(400).json({ success: false, message: 'Cannot initiate payment: this appointment has no booking code. Please contact admin.' });
      }

      // booking_code is already in clean format (e.g. O-C-0012) since generation
      const displayCode = appointment.booking_code;

      let priceNumber = Number(appointment.price);
      if ((!priceNumber || priceNumber <= 0) && providedPrice) {
        priceNumber = Number(providedPrice);
      }

      const isLatePayment = (appointment.status === 'completed' || appointment.status === 'finished');
      const description = isLatePayment
        ? `Late payment for Booking ${displayCode}`
        : `${paymentType === 'deposit' ? 'Deposit' : paymentType === 'custom' ? 'Partial' : 'Booking'} payment for Booking ${displayCode}`;

      // Use custom amount if provided and paymentType is custom
      if (paymentType === 'custom' && customAmount) {
        const customAmountPesos = Math.max(100, Math.round(Number(customAmount)));
        await proceedWithSession(Math.round(customAmountPesos * 100), 'Partial Payment', description, displayCode);
        return;
      }

      const itemName = isLatePayment
        ? `Tattoo Service - Balance payment (${displayCode})`
        : paymentType === 'custom'
          ? `Partial Payment (${displayCode})`
          : (appointment.design_title || 'Tattoo Service') + (paymentType === 'deposit' ? ' (Deposit)' : '');

      try {
        if (paymentType === 'deposit') {
          const isPiercing = appointment.service_type && String(appointment.service_type).toLowerCase() === 'piercing';
          let tierPrice = isPiercing ? 500 : 5000;
          tierPrice = Math.min(tierPrice, priceNumber);
          const depositPesos = Math.max(100, Math.round(tierPrice));
          await proceedWithSession(Math.round(depositPesos * 100), itemName, description, displayCode);
        } else if (paymentType === 'balance') {
          const totalPaidCentavos = Number(appointment.total_paid_centavos) || 0;
          const totalAmountCentavos = Math.round(priceNumber * 100);
          const remainingCentavos = totalAmountCentavos - totalPaidCentavos;

          if (remainingCentavos <= 0) {
            return res.status(400).json({ success: false, message: 'This appointment is already fully paid.' });
          }

          await proceedWithSession(remainingCentavos, 'Balance Payment', `Final balance payment for Booking ${displayCode}`, displayCode);
        } else {
          await proceedWithSession(Math.round(priceNumber * 100), itemName, description, displayCode);
        }
      } catch (innerError) {
        console.error('[ERROR] Error in proceedWithSession flow:', innerError.message);
        if (!res.headersSent) {
          res.status(500).json({ success: false, message: 'Process error: ' + innerError.message });
        }
      }

      async function proceedWithSession(sessionAmount, sessionName, sessionDesc, bookingDisplayCode) {
        if (!sessionAmount || sessionAmount <= 0) {
          return res.status(400).json({
            success: false,
            message: 'Appointment has no price set. Please set a price before taking payment.'
          });
        }

        const redirectBaseSuccess = `${FRONTEND_URL}/booking-confirmation`;
        const redirectBaseFailed = `${FRONTEND_URL}/customer/bookings`;

        const payload = {
          data: {
            attributes: {
              line_items: [
                {
                  amount: sessionAmount,
                  currency: 'PHP',
                  name: sessionName,
                  description: sessionDesc,
                  quantity: 1
                }
              ],
              description: sessionDesc,
              payment_method_types: ['card', 'gcash', 'paymaya', 'grab_pay'],
              statement_descriptor: 'InkVistAR',
              metadata: {
                appointmentId: String(appointmentId),
                bookingCode: bookingDisplayCode || '',
                customerId: String(appointment.customer_id),
                artistId: String(appointment.artist_id),
                mode: PAYMONGO_MODE,
                paymentType: paymentType || 'full',
                isLatePayment: String(isLatePayment)
              },
              success_url: `${redirectBaseSuccess}?appointmentId=${appointmentId}&bookingCode=${encodeURIComponent(bookingDisplayCode || '')}`,
              cancel_url: `${redirectBaseFailed}?payment=failed&appointmentId=${appointmentId}`
            }
          }
        };

        try {
          console.log(`[PayMongo] Creating session for Appt #${appointmentId}, Amount: ${sessionAmount}c, Type: ${paymentType || 'full'}`);
          const response = await fetch(`${PAYMONGO_API_BASE}/checkout_sessions`, {
            method: 'POST',
            headers: {
              'Authorization': paymongoAuthHeader(),
              'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
          });
          const data = await response.json();

          if (!response.ok) {
            console.error('[ERROR] PayMongo API Error:', JSON.stringify(data, null, 2));
            return res.status(502).json({
              success: false,
              message: `PayMongo Error: ${data.errors?.[0]?.detail || 'Unknown error'}`,
              error: data
            });
          }

          const checkoutUrl = data?.data?.attributes?.checkout_url;
          const sessionId = data?.data?.id;

          // Save pending record for tracking
          db.query(
            `INSERT INTO payments (appointment_id, session_id, amount, currency, status, raw_event)
               VALUES (?, ?, ?, ?, 'pending', ?)
               ON DUPLICATE KEY UPDATE session_id = VALUES(session_id), amount = VALUES(amount), currency = VALUES(currency), status = 'pending', raw_event = VALUES(raw_event)`,
            [appointmentId, sessionId, sessionAmount, 'PHP', JSON.stringify(data?.data || {})],
            (payErr) => {
              if (payErr) console.error('[WARN] Could not log pending payment:', payErr.message);
            }
          );

          // Log waiver acceptance if provided
          if (agreedToWaiver) {
            db.query(
              `UPDATE appointments SET waiver_accepted_at = ? WHERE id = ? AND waiver_accepted_at IS NULL`,
              [getLocalDatetime(), appointmentId],
              (waiverErr) => {
                if (waiverErr) {
                  // Fallback for older schema if column missing
                  if (waiverErr.code === 'ER_BAD_FIELD_ERROR' && waiverErr.message.includes('waiver_accepted_at')) {
                    console.warn('[WARN] waiver_accepted_at column missing, skipping waiver log.');
                  } else {
                    console.error('[WARN] Could not log waiver acceptance:', waiverErr.message);
                  }
                } else {
                  console.log(`[INFO] Waiver acceptance logged for Appt #${appointmentId}`);
                }
              }
            );
          }

          res.json({ success: true, checkoutUrl, sessionId });
        } catch (err) {
          console.error('[ERROR] PayMongo API Error:', err.message);
          res.status(500).json({ success: false, message: 'Payment gateway error' });
        }
      }
    });
  } catch (error) {
    console.error('[ERROR] Unexpected error creating checkout session:', error);
    res.status(500).json({
      success: false,
      message: error?.message || 'Internal server error',
      error: error?.stack || error
    });
  }
});

// Webhook receiver for PayMongo
// GET payment status polling for specific appointment
app.get('/api/appointments/:id/payment-status', async (req, res) => {
  const { id: appointmentId } = req.params;

  try {
    // 1. Check DB first
    db.query(`
      SELECT ap.payment_status, ap.status, ap.customer_id, ap.artist_id, ap.appointment_date, ap.start_time, ap.booking_code, ap.price,
        COALESCE(ap.manual_paid_amount, 0) as manual_paid_amount,
        (SELECT COALESCE(SUM(p.amount), 0) FROM payments p WHERE p.appointment_id = ap.id AND p.status = 'paid') as online_paid_centavos,
        u.name as customer_name, u.email as cx_email 
      FROM appointments ap 
      JOIN users u ON ap.customer_id = u.id 
      WHERE ap.id = ?`, [appointmentId], async (err, results) => {

      if (err || results.length === 0) return res.status(404).json({ success: false, message: 'Not found' });

      let appt = results[0];
      let currentPaymentStatus = appt.payment_status;
      let currentAptStatus = appt.status;

      // Compute price and totalPaid for the frontend banner
      const apptPrice = Number(appt.price || 0);
      const onlinePaidPesos = Number(appt.online_paid_centavos || 0) / 100;
      const manualPaidPesos = Number(appt.manual_paid_amount || 0);
      const computedTotalPaid = onlinePaidPesos + manualPaidPesos;

      if (currentPaymentStatus === 'paid') {
        // Payment already confirmed — but admin notifications may not have been sent
        // (e.g. webhook updated DB before polling could trigger notifications)
        // Use a one-time deduplication check: only send if no 'payment_success' notification exists for this admin + appointment
        db.query('SELECT id FROM users WHERE user_type IN (?, ?)', ['admin', 'manager'], (adminErr, admins) => {
          if (!adminErr && admins.length > 0) {
            admins.forEach(admin => {
              db.query('SELECT id FROM notifications WHERE user_id = ? AND related_id = ? AND type = ? LIMIT 1', [admin.id, appointmentId, 'payment_success'], (nErr, nRes) => {
                if (!nErr && nRes.length === 0) {
                  // Admin hasn't been notified yet — send now
                  createNotification(admin.id, 'Payment Received', `Payment for appointment #${appointmentId} from ${appt.customer_name} has been confirmed.`, 'payment_success', appointmentId);

                  const dateObj = new Date(appt.appointment_date);
                  const dateStr = !isNaN(dateObj) ? dateObj.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }) : 'the scheduled date';
                  createNotification(admin.id, 'Appointment Scheduled', `Appointment #${appointmentId} for ${appt.customer_name} on ${dateStr} at ${appt.start_time || 'TBD'} is confirmed.`, 'appointment_confirmed', appointmentId);
                }
              });
            });
          }
        });
        return res.json({ success: true, payment_status: 'paid', booking_code: appt.booking_code || null, price: apptPrice, totalPaid: computedTotalPaid });
      }

      // 2. If not paid, check if we have an active checkout session
      db.query('SELECT session_id, amount FROM payments WHERE appointment_id = ? ORDER BY created_at DESC LIMIT 1', [appointmentId], async (pErr, pResults) => {
        if (pErr || pResults.length === 0 || !pResults[0].session_id) {
          return res.json({ success: true, payment_status: currentPaymentStatus, booking_code: appt.booking_code || null, price: apptPrice, totalPaid: computedTotalPaid });
        }

        const sessionId = pResults[0].session_id;
        const amountCentavos = pResults[0].amount || 0;

        try {
          // Poll PayMongo directly
          console.log(`[INFO] Polling PayMongo for session ${sessionId} (Appointment ${appointmentId})...`);
          const pmRes = await fetch(`${PAYMONGO_API_BASE}/checkout_sessions/${sessionId}`, {
            headers: { 'Authorization': paymongoAuthHeader() }
          });
          const pmData = await pmRes.json();

          const pmStatus = pmData?.data?.attributes?.status;
          const paymentList = pmData?.data?.attributes?.payments || [];

          // PayMongo status 'completed' or having any items in the payments array means it's paid
          const hasPaid = pmStatus === 'completed' || (Array.isArray(paymentList) && paymentList.length > 0);

          console.log(`[INFO] Polling details for Appt ${appointmentId}: PM_Status=${pmStatus}, Payments_Found=${paymentList.length}, HasPaid=${hasPaid}`);

          if (hasPaid) {
            console.log(`[OK] Polling confirmed PAID for Appointment ${appointmentId}. Synchronizing database...`);

            // Update DB so future polls are faster
            const paymentType = pmData?.data?.attributes?.metadata?.paymentType || 'full';
            const newPaymentStatus = (paymentType === 'deposit' || paymentType === 'custom') ? 'downpayment_paid' : 'paid';
            const newAptStatus = (currentAptStatus?.toLowerCase() === 'pending') ? 'confirmed' : currentAptStatus;

            db.query("UPDATE appointments SET payment_status = ?, status = ? WHERE id = ?", [newPaymentStatus, newAptStatus, appointmentId], (updErr) => {
              if (updErr) {
                console.error(`[ERROR] Failed to update appointments status to paid for ${appointmentId}:`, updErr.message);
              } else {
                console.log(`[INFO] Appointment ${appointmentId} updated to '${newPaymentStatus}' in DB.`);

                // If state changed to paid, manually trigger what the webhook would normally do
                if (currentPaymentStatus !== newPaymentStatus) {
                  const customerAmtStr = (amountCentavos / 100).toLocaleString();
                  const paymentTypeStr = paymentType === 'deposit' ? 'Downpayment' : paymentType === 'custom' ? 'Partial Payment' : 'Full Payment';
                  createNotification(appt.customer_id, 'Payment Received', `Your payment of ₱${customerAmtStr} for appointment #${appointmentId} (${paymentTypeStr}) has been successfully confirmed.`, 'payment_success', appointmentId);

                  // Notify artist about payment collected for their session
                  // Artist payment notifications removed per business rules — only admin receives payment alerts

                  const wasPending = currentAptStatus?.toLowerCase() === 'pending';

                  if (wasPending) {
                    const dateObj = new Date(appt.appointment_date);
                    const dateStr = !isNaN(dateObj) ? dateObj.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }) : 'your chosen date';
                    const timeStr = appt.start_time || 'your chosen time';

                    createNotification(appt.customer_id, 'Appointment Scheduled', `Your appointment has been scheduled on ${dateStr} at ${timeStr}.`, 'appointment_confirmed', appointmentId);
                    createNotification(appt.artist_id, 'Appointment Scheduled', `You have an appointment scheduled on ${dateStr} at ${timeStr}.`, 'appointment_confirmed', appointmentId);
                  }

                  if (typeof sendReceiptEmail === 'function' && appt.cx_email) {
                    const paymentId = (Array.isArray(paymentList) && paymentList.length > 0) ? paymentList[0].id : null;
                    sendReceiptEmail(appt.cx_email, { id: paymentId, amount: amountCentavos / 100, method: 'PayMongo' });
                  }

                  db.query('SELECT id FROM users WHERE user_type IN (?, ?)', ['admin', 'manager'], (adminErr, admins) => {
                    if (!adminErr && admins.length > 0) {
                      const adminMsg = `Payment of ₱${(amountCentavos / 100).toLocaleString()} received from ${appt.customer_name} for appointment #${appointmentId} (${paymentType === 'deposit' ? 'Downpayment' : 'Full Payment'}).`;
                      admins.forEach(admin => {
                        createNotification(admin.id, 'Payment Received', adminMsg, 'payment_success', appointmentId);

                        if (wasPending) {
                          const dateObj = new Date(appt.appointment_date);
                          const dateStr = !isNaN(dateObj) ? dateObj.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }) : 'the chosen date';
                          createNotification(admin.id, 'Appointment Scheduled', `Appointment #${appointmentId} has been scheduled for ${appt.customer_name} on ${dateStr} at ${appt.start_time || 'TBD'}.`, 'appointment_confirmed', appointmentId);
                        }
                      });
                    }
                  });
                }
              }
            });

            db.query("UPDATE payments SET status = 'paid' WHERE session_id = ?", [sessionId], (updErr) => {
              if (updErr) console.error(`[ERROR] Failed to update payments record to paid for ${sessionId}:`, updErr.message);
            });

            return res.json({ success: true, payment_status: newPaymentStatus, booking_code: appt.booking_code || null, price: apptPrice, totalPaid: computedTotalPaid });
          } else {
            console.log(`[INFO] Polling result: Payment is still NOT detected as paid for Appt ${appointmentId}`);
          }
        } catch (pollErr) {
          console.error('[ERROR] Polling PayMongo API error:', pollErr.message);
        }

        res.json({ success: true, payment_status: currentPaymentStatus, booking_code: appt.booking_code || null, price: apptPrice, totalPaid: computedTotalPaid });
      });
    });
  } catch (error) {
    console.error('[ERROR] Unexpected error in payment-status endpoint:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

app.post('/api/payments/webhook', (req, res) => {
  if (!PAYMONGO_WEBHOOK_SECRET) {
    console.warn('[WARN] PAYMONGO_WEBHOOK_SECRET is not set. Webhook signature will not be verified.');
  }

  const signatureHeader = req.headers['paymongo-signature'];
  const rawBody = req.rawBody ? req.rawBody.toString() : JSON.stringify(req.body || {});

  if (PAYMONGO_WEBHOOK_SECRET) {
    if (!signatureHeader) {
      return res.status(400).json({ success: false, message: 'Missing Paymongo-Signature header' });
    }

    const parts = signatureHeader.split(',').reduce((acc, part) => {
      const [k, v] = part.split('=');
      acc[k] = v;
      return acc;
    }, {});

    const timestamp = parts.t;
    const signature = parts.v1;

    if (!timestamp || !signature) {
      return res.status(400).json({ success: false, message: 'Invalid signature header' });
    }

    const expected = crypto.createHmac('sha256', PAYMONGO_WEBHOOK_SECRET)
      .update(`${timestamp}.${rawBody}`)
      .digest('hex');

    if (expected !== signature) {
      console.error('[ERROR] Webhook signature mismatch');
      return res.status(400).json({ success: false, message: 'Signature mismatch' });
    }
  }

  const event = req.body;
  const eventType = event?.data?.attributes?.type;
  const resource = event?.data?.attributes?.data;
  const metadata = resource?.attributes?.metadata || {};

  const appointmentId = metadata.appointmentId || metadata.appointment_id;
  const paymongoPaymentId = resource?.id || resource?.attributes?.id || null;
  const sessionId = resource?.attributes?.checkout_session_id || metadata.checkout_session_id || null;
  const amount = resource?.attributes?.amount || null;
  const currency = resource?.attributes?.currency || 'PHP';
  const status = eventType && eventType.includes('paid') ? 'paid' : (resource?.attributes?.status || 'pending');

  console.log('[INFO] PayMongo webhook received:', eventType, 'appointment', appointmentId);

  if (!appointmentId) {
    console.warn('[WARN] Webhook missing appointmentId in metadata');
  }

  // Upsert payment record (idempotent on paymongo_payment_id unique key)
  db.query(
    `INSERT INTO payments (appointment_id, session_id, paymongo_payment_id, amount, currency, status, raw_event)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE status = VALUES(status), amount = VALUES(amount), currency = VALUES(currency), raw_event = VALUES(raw_event), updated_at = ?`,
    [appointmentId || null, sessionId, paymongoPaymentId, amount, currency, status, JSON.stringify(event), getLocalDatetime()],
    (err) => {
      if (err) console.error('[ERROR] Error saving payment record:', err.message);
    }
  );

  // If paid, update appointment and notify
  if (status === 'paid' && appointmentId) {
    const paymentType = metadata.paymentType || 'full';
    const newPaymentStatus = (paymentType === 'deposit' || paymentType === 'custom') ? 'downpayment_paid' : 'paid';

    // Get current status first to determine new status
    db.query(`
      SELECT ap.status, ap.customer_id, ap.artist_id, ap.appointment_date, ap.start_time, u.name as customer_name, u.email as cx_email
      FROM appointments ap 
      JOIN users u ON ap.customer_id = u.id 
      WHERE ap.id = ?
    `, [appointmentId], (fetchErr, rows) => {
      if (!fetchErr && rows.length) {
        const appt = rows[0];
        const newAptStatus = (appt.status?.toLowerCase() === 'pending') ? 'confirmed' : appt.status;

        db.query("UPDATE appointments SET payment_status = ?, status = ? WHERE id = ?", [newPaymentStatus, newAptStatus, appointmentId], (updateErr) => {
          if (updateErr) {
            console.error('[ERROR] Error marking appointment paid:', updateErr.message);
          } else {
            console.log('[OK] Appointment', appointmentId, 'marked as', newPaymentStatus);

            const wasPending = appt.status?.toLowerCase() === 'pending';
            const customerAmtStr = (amount / 100).toLocaleString();
            const paymentTypeStr = paymentType === 'deposit' ? 'Downpayment' : paymentType === 'custom' ? 'Partial Payment' : 'Full Payment';
            const customerMsg = `Your payment of ₱${customerAmtStr} for appointment #${appointmentId} (${paymentTypeStr}) has been successfully confirmed.`;
            const artistMsg = `Payment for appointment #${appointmentId} is confirmed.`;

            createNotification(appt.customer_id, 'Payment Received', customerMsg.trim(), 'payment_success', appointmentId);
            // Artist only gets Appointment Scheduled (below), not payment notifications

            if (wasPending) {
              const dateObj = new Date(appt.appointment_date);
              const dateStr = !isNaN(dateObj) ? dateObj.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }) : 'your chosen date';
              const timeStr = appt.start_time || 'your chosen time';

              createNotification(appt.customer_id, 'Appointment Scheduled', `Your appointment has been scheduled on ${dateStr} at ${timeStr}.`, 'appointment_confirmed', appointmentId);
              createNotification(appt.artist_id, 'Appointment Scheduled', `You have an appointment scheduled on ${dateStr} at ${timeStr}.`, 'appointment_confirmed', appointmentId);
            }

            // SEND EMAILED RECEIPT
            sendReceiptEmail(appt.cx_email, { id: paymongoPaymentId, amount: amount / 100, method: 'PayMongo' });

            // Notify Admins and Managers
            db.query('SELECT id FROM users WHERE user_type IN (?, ?)', ['admin', 'manager'], (adminErr, admins) => {
              if (!adminErr && admins.length > 0) {
                const adminMsg = `Payment of ₱${(amount / 100).toLocaleString()} received from ${appt.customer_name} for appointment #${appointmentId} (${paymentType === 'deposit' ? 'Downpayment' : 'Full Payment'}).`;
                admins.forEach(admin => {
                  createNotification(admin.id, 'Payment Received', adminMsg.trim(), 'payment_success', appointmentId);

                  if (wasPending) {
                    const dateObj = new Date(appt.appointment_date);
                    const dateStr = !isNaN(dateObj) ? dateObj.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }) : 'the chosen date';
                    createNotification(admin.id, 'Appointment Scheduled', `Appointment #${appointmentId} has been scheduled for ${appt.customer_name} on ${dateStr} at ${appt.start_time || 'TBD'}.`, 'appointment_confirmed', appointmentId);
                  }
                });
              }
            });
          }
        });
      }
    });
  }

  res.json({ success: true, received: true });
});

// Optional: allow frontend to poll payment status by session or appointment
app.get('/api/payments/status', (req, res) => {
  const { sessionId, appointmentId } = req.query;

  if (!sessionId && !appointmentId) {
    return res.status(400).json({ success: false, message: 'sessionId or appointmentId is required' });
  }

  const query = sessionId
    ? 'SELECT status, amount, currency FROM payments WHERE session_id = ? ORDER BY updated_at DESC LIMIT 1'
    : 'SELECT status, amount, currency FROM payments WHERE appointment_id = ? ORDER BY updated_at DESC LIMIT 1';

  db.query(query, [sessionId || appointmentId], (err, rows) => {
    if (err) {
      console.error('[ERROR] Error fetching payment status:', err.message);
      return res.status(500).json({ success: false, message: 'Database error' });
    }

    if (!rows.length) {
      return res.status(404).json({ success: false, message: 'Payment not found' });
    }

    res.json({ success: true, status: rows[0].status, amount: rows[0].amount, currency: rows[0].currency });
  });
});

// Get Customer Transaction History
// Get transactions for a specific appointment
app.get('/api/appointments/:id/transactions', (req, res) => {
  const appointmentId = req.params.id;
  const query = `
    SELECT id, amount, status, created_at, session_id, raw_event 
    FROM payments 
    WHERE appointment_id = ? 
    ORDER BY created_at DESC
  `;

  db.query(query, [appointmentId], (err, results) => {
    if (err) {
      console.error('[ERROR] Error fetching appointment transactions:', err.message);
      return res.status(500).json({ success: false, message: 'Database error' });
    }
    res.json({ success: true, transactions: results });
  });
});

// Update the transaction history endpoint for customers to include design_title
app.get('/api/customer/:customerId/transactions', (req, res) => {
  const { customerId } = req.params;
  const query = `
    SELECT 
      p.id, p.amount, p.currency, p.status, p.created_at, p.session_id, p.paymongo_payment_id,
      ap.design_title, ap.id as appointment_id
    FROM payments p
    JOIN appointments ap ON p.appointment_id = ap.id
    WHERE ap.customer_id = ?
    ORDER BY p.created_at DESC
  `;

  db.query(query, [customerId], (err, results) => {
    if (err) {
      console.error('[ERROR] Error fetching transactions:', err.message);
      return res.status(500).json({ success: false, message: 'Database error' });
    }
    res.json({ success: true, transactions: results });
  });
});

// ========== CUSTOMER DASHBOARD (SIMPLIFIED) ==========
app.get('/api/customer/dashboard/:customerId', (req, res) => {
  const { customerId } = req.params;
  console.log(`[INFO] Customer dashboard requested: ${customerId}`);

  // 1. Get Customer Info
  const userQuery = `
    SELECT u.id, u.name, u.email, c.phone, c.location, c.profile_image
    FROM users u
    LEFT JOIN customers c ON u.id = c.user_id
    WHERE u.id = ?
  `;

  db.query(userQuery, [customerId], (err, userResults) => {
    if (err) {
      console.error('[ERROR] Database error (User):', err);
      return res.status(500).json({ success: false, message: 'Database error' });
    }

    if (userResults.length === 0) {
      return res.status(404).json({ success: false, message: 'Customer not found' });
    }

    const customer = userResults[0];

    // 2. Get Appointments
    const appointmentsQuery = `
      SELECT 
        ap.id, 
        ap.appointment_date, 
        ap.start_time, 
        ap.design_title, 
        ap.status,
        ap.price,
        u.name as artist_name
      FROM appointments ap
      JOIN users u ON ap.artist_id = u.id
      WHERE ap.customer_id = ? AND ap.status != 'cancelled' AND ap.is_deleted = 0
      ORDER BY ap.appointment_date ASC, ap.start_time ASC
    `;

    db.query(appointmentsQuery, [customerId], (err, appointmentResults) => {
      if (err) {
        console.error('[ERROR] Database error (Appointments):', err);
        return res.json({ success: true, customer, appointments: [], stats: {} });
      }

      // Filter for upcoming (future dates)
      const now = new Date();
      now.setHours(0, 0, 0, 0);

      const upcoming = appointmentResults.filter(a => new Date(a.appointment_date) >= now && a.status !== 'completed');
      const completedCount = appointmentResults.filter(a => a.status === 'completed').length;
      const uniqueArtists = new Set(appointmentResults.map(a => a.artist_name)).size;

      // 2.5 Get Favorites Count
      db.query('SELECT COUNT(*) as favCount FROM favorites WHERE user_id = ?', [customerId], (favErr, favResults) => {
        const savedDesignsCount = favErr ? 0 : (favResults[0]?.favCount || 0);

        const stats = {
          total_tattoos: completedCount,
          upcoming: upcoming.length,
          saved_designs: savedDesignsCount,
          artists: uniqueArtists
        };

        // 3. Get Notifications
        db.query('SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 20', [customerId], (notifErr, notifResults) => {
          const notifications = notifResults || [];
          const unreadCount = notifications.filter(n => !n.is_read).length;

          // 4. Get Active Aftercare (most recent completed tattoo within 30 days)
          const aftercareQuery = `
              SELECT ap.id, ap.design_title, ap.appointment_date, ap.service_type,
                     DATEDIFF(CURDATE(), DATE(ap.appointment_date)) as days_since,
                     u.name as artist_name
              FROM appointments ap
              LEFT JOIN users u ON ap.artist_id = u.id
              WHERE ap.customer_id = ? AND ap.status = 'completed' AND ap.is_deleted = 0
                AND ap.service_type LIKE '%Tattoo%'
                AND DATEDIFF(CURDATE(), DATE(ap.appointment_date)) BETWEEN 0 AND 30
              ORDER BY ap.appointment_date DESC
              LIMIT 1
            `;
          db.query(aftercareQuery, [customerId], (acErr, acRes) => {
            let activeAftercare = null;

            if (!acErr && acRes && acRes.length > 0) {
              const acAppt = acRes[0];
              const dayNum = Math.max(1, acAppt.days_since || 1);
              const phase = dayNum <= 3 ? 'initial' : dayNum <= 14 ? 'peeling' : 'healing';

              // Fetch today's template
              db.query('SELECT title, message, tips FROM aftercare_templates WHERE day_number = ?', [dayNum], (tplErr, tplRes) => {
                const template = (!tplErr && tplRes.length) ? tplRes[0] : { title: 'Keep healing!', message: 'Continue your daily aftercare routine.', tips: '' };

                activeAftercare = {
                  appointmentId: acAppt.id,
                  designTitle: acAppt.design_title || 'Tattoo Session',
                  artistName: acAppt.artist_name,
                  completedDate: acAppt.appointment_date,
                  currentDay: dayNum,
                  totalDays: 30,
                  phase,
                  todayTitle: template.title,
                  todayMessage: template.message,
                  todayTips: template.tips
                };

                // 5. Get Active Pre-care (upcoming confirmed tattoo session with payment)
                const precareQuery = `
                    SELECT ap.id, ap.design_title, ap.appointment_date, ap.service_type,
                           ap.price, ap.payment_status,
                           DATEDIFF(DATE(ap.appointment_date), CURDATE()) as days_until,
                           u.name as artist_name
                    FROM appointments ap
                    LEFT JOIN users u ON ap.artist_id = u.id
                    WHERE ap.customer_id = ? AND ap.status = 'confirmed' AND ap.is_deleted = 0
                      AND ap.service_type NOT LIKE '%Consultation%'
                      AND ap.service_type NOT LIKE '%Piercing%'
                      AND ap.payment_status IN ('downpayment_paid', 'paid')
                      AND DATE(ap.appointment_date) >= CURDATE()
                    ORDER BY ap.appointment_date ASC
                    LIMIT 1
                  `;

                db.query(precareQuery, [customerId], (pcErr, pcRes) => {
                  let activePrecare = null;
                  if (!pcErr && pcRes && pcRes.length > 0) {
                    const pcAppt = pcRes[0];
                    activePrecare = {
                      appointmentId: pcAppt.id,
                      designTitle: pcAppt.design_title || 'Tattoo Session',
                      artistName: pcAppt.artist_name,
                      appointmentDate: pcAppt.appointment_date,
                      daysUntil: pcAppt.days_until,
                      price: pcAppt.price,
                      paymentStatus: pcAppt.payment_status
                    };
                  }

                  res.json({
                    success: true,
                    customer,
                    appointments: upcoming,
                    stats,
                    notifications,
                    unreadCount,
                    activeAftercare,
                    activePrecare
                  });
                });
              });
            } else {
              // No aftercare — still check for pre-care
              const precareQuery2 = `
                  SELECT ap.id, ap.design_title, ap.appointment_date, ap.service_type,
                         ap.price, ap.payment_status,
                         DATEDIFF(DATE(ap.appointment_date), CURDATE()) as days_until,
                         u.name as artist_name
                  FROM appointments ap
                  LEFT JOIN users u ON ap.artist_id = u.id
                  WHERE ap.customer_id = ? AND ap.status = 'confirmed' AND ap.is_deleted = 0
                    AND ap.service_type NOT LIKE '%Consultation%'
                    AND ap.service_type NOT LIKE '%Piercing%'
                    AND ap.payment_status IN ('downpayment_paid', 'paid')
                    AND DATE(ap.appointment_date) >= CURDATE()
                  ORDER BY ap.appointment_date ASC
                  LIMIT 1
                `;

              db.query(precareQuery2, [customerId], (pcErr2, pcRes2) => {
                let activePrecare = null;
                if (!pcErr2 && pcRes2 && pcRes2.length > 0) {
                  const pcAppt = pcRes2[0];
                  activePrecare = {
                    appointmentId: pcAppt.id,
                    designTitle: pcAppt.design_title || 'Tattoo Session',
                    artistName: pcAppt.artist_name,
                    appointmentDate: pcAppt.appointment_date,
                    daysUntil: pcAppt.days_until,
                    price: pcAppt.price,
                    paymentStatus: pcAppt.payment_status
                  };
                }

                res.json({
                  success: true,
                  customer,
                  appointments: upcoming,
                  stats,
                  notifications,
                  unreadCount,
                  activeAftercare: null,
                  activePrecare
                });
              });
            }
          });
        });
      });
    });
  });
});

// ========== CUSTOMER AFTERCARE API ==========
// GET full aftercare data for a customer (used by the dedicated aftercare page)
app.get('/api/customer/aftercare/:customerId', (req, res) => {
  const { customerId } = req.params;

  // Find most recent completed tattoo within 30 days
  const apptQuery = `
    SELECT ap.id, ap.design_title, ap.appointment_date, ap.service_type,
           DATEDIFF(CURDATE(), DATE(ap.appointment_date)) as days_since,
           u.name as artist_name
    FROM appointments ap
    LEFT JOIN users u ON ap.artist_id = u.id
    WHERE ap.customer_id = ? AND ap.status = 'completed' AND ap.is_deleted = 0
      AND ap.service_type LIKE '%Tattoo%'
      AND DATEDIFF(CURDATE(), DATE(ap.appointment_date)) BETWEEN 0 AND 30
    ORDER BY ap.appointment_date DESC
    LIMIT 1
  `;

  db.query(apptQuery, [customerId], (err, apptRes) => {
    if (err) return res.status(500).json({ success: false, message: 'Database error' });

    if (!apptRes || apptRes.length === 0) {
      return res.json({ success: true, active: false, aftercare: null, templates: [] });
    }

    const appt = apptRes[0];
    const currentDay = Math.max(1, appt.days_since || 1);

    // Get all templates
    db.query('SELECT * FROM aftercare_templates ORDER BY day_number ASC', (tplErr, templates) => {
      if (tplErr) return res.status(500).json({ success: false, message: 'Database error' });

      res.json({
        success: true,
        active: true,
        aftercare: {
          appointmentId: appt.id,
          designTitle: appt.design_title || 'Tattoo Session',
          artistName: appt.artist_name,
          completedDate: appt.appointment_date,
          currentDay,
          totalDays: 30,
          phase: currentDay <= 3 ? 'initial' : currentDay <= 14 ? 'peeling' : 'healing'
        },
        templates: templates || []
      });
    });
  });
});

// ========== ADMIN AFTERCARE TEMPLATES API ==========
// GET all aftercare templates
app.get('/api/admin/aftercare-templates', (req, res) => {
  db.query('SELECT * FROM aftercare_templates ORDER BY day_number ASC', (err, results) => {
    if (err) return res.status(500).json({ success: false, message: 'Database error: ' + err.message });
    res.json({ success: true, templates: results || [] });
  });
});

// PUT update a specific aftercare template
app.put('/api/admin/aftercare-templates/:id', (req, res) => {
  const { id } = req.params;
  const { title, message, tips } = req.body;

  if (!title || !message) {
    return res.status(400).json({ success: false, message: 'Title and message are required.' });
  }

  db.query('UPDATE aftercare_templates SET title = ?, message = ?, tips = ? WHERE id = ?',
    [title.substring(0, 100), message.substring(0, 2000), (tips || '').substring(0, 2000), id],
    (err, result) => {
      if (err) return res.status(500).json({ success: false, message: 'Database error: ' + err.message });
      if (result.affectedRows === 0) return res.status(404).json({ success: false, message: 'Template not found.' });
      res.json({ success: true, message: 'Template updated successfully.' });
    }
  );
});

// POST reset all aftercare templates to defaults
app.post('/api/admin/aftercare-templates/reset', (req, res) => {
  db.query('DELETE FROM aftercare_templates', (delErr) => {
    if (delErr) return res.status(500).json({ success: false, message: 'Database error: ' + delErr.message });

    // Re-seed defaults
    const defaults = [
      [1, 'initial', 'Unwrap & First Wash', 'Remove the bandage/wrap after 2-4 hours. Gently wash with lukewarm water and fragrance-free antibacterial soap. Pat dry with a clean paper towel — never use a cloth towel.', 'Use Dove Sensitive or Cetaphil soap. Wash your hands thoroughly before touching the tattoo. Apply a very thin layer of your artist-recommended ointment (e.g., Aquaphor).'],
      [2, 'initial', 'Keep It Clean & Moisturized', 'Wash your tattoo 2-3 times today with lukewarm water and mild soap. Apply a very thin layer of ointment after each wash. The area may still be red, swollen, and tender — this is normal.', 'The skin should NOT look shiny or greasy after applying ointment. Less is more. Wear loose, breathable clothing over the tattoo.'],
      [3, 'initial', 'Day 3: Swelling Should Subside', 'Continue your wash-and-moisturize routine 2-3 times daily. Redness and swelling should begin decreasing.', 'Sleep on clean sheets and avoid laying directly on the tattoo.'],
      [4, 'peeling', "Peeling Begins — Don't Pick! IMPORTANT:", 'Your tattoo may start to peel and flake like a sunburn. DO NOT pick, scratch, or peel the flaking skin!', 'Switch from heavy ointment to a fragrance-free moisturizing lotion.'],
      [5, 'peeling', 'Moisturize & Resist the Itch', 'The peeling continues and itching may increase. Apply fragrance-free lotion whenever the skin feels dry.', 'Cool compresses can help with itching. Stay hydrated.'],
      [6, 'peeling', 'Stay the Course', 'Keep up your routine: gentle wash, pat dry, apply lotion.', 'Avoid swimming, baths, and saunas.'],
      [7, 'peeling', 'One Week Milestone!', 'You made it through the first week! Continue moisturizing.', 'The cloudy appearance under peeling skin is normal — new skin is forming.'],
      [8, 'peeling', 'Flaking is Normal', 'Expect continued flaking. Keep moisturizing consistently.', 'Wear soft cotton clothing to reduce friction.'],
      [9, 'peeling', 'Healing Progress Check', 'Initial redness should be mostly gone. Continue lotion routine.', 'Watch for signs of infection. These are rare with proper care.'],
      [10, 'peeling', 'Day 10 — Almost Through Peeling', 'Most heavy peeling is ending. Avoid direct sunlight.', 'Your tattoo is still healing beneath the surface.'],
      [11, 'peeling', 'Consistent Care Matters', 'Keep moisturizing and protecting from sun.', 'Clean the area promptly after exercise.'],
      [12, 'peeling', 'Light at the End of the Tunnel', 'Surface peeling wrapping up. Continue lotion application.', 'Stay out of pools for at least another 2 weeks.'],
      [13, 'peeling', 'Almost Done Peeling', 'Only minor flaking may remain. Colors will brighten up.', 'SPF 30+ is essential if any sun exposure.'],
      [14, 'peeling', 'Two Weeks Complete!', 'The peeling phase is over. Continue daily moisturizing.', 'Deeper layers take 4-6 weeks to fully heal.'],
      [15, 'healing', 'Final Healing Phase Begins', 'Surface should feel smooth. Continue lotion 1-2 times daily.', 'Resume most normal activities but avoid prolonged water submersion.'],
      [16, 'healing', 'Protect Your Investment', 'Apply SPF 30+ whenever going outside.', 'UV protection keeps colors vibrant for years.'],
      [17, 'healing', 'Stay Moisturized', 'Continue daily lotion. Well-moisturized skin showcases ink better.', 'Stay hydrated from the inside too.'],
      [18, 'healing', 'Healing Nicely!', 'Your tattoo is close to its final appearance.', 'Raised areas with heavy ink may need more time.'],
      [19, 'healing', 'Routine Maintenance', 'Continue lotion and sun protection routine.', 'Avoid abrasive scrubs on the tattoo.'],
      [20, 'healing', 'Day 20 — Two-Thirds Healed!', 'Well past the critical period. Keep protecting from sun.', 'Short pool swims are OK if surface is fully closed.'],
      [21, 'healing', 'Three Weeks!', 'Home stretch of healing. Continue gentle daily care.', 'Heavy shading areas may take slightly longer.'],
      [22, 'healing', 'Looking Great!', 'Tattoo looking more vibrant each day.', 'Share a photo with your artist!'],
      [23, 'healing', 'Steady Progress', 'Simple daily routine: moisturize and apply sunscreen.', 'Great aftercare = vibrant tattoo for decades.'],
      [24, 'healing', 'Almost Fully Healed!', 'Deep skin layers nearly done regenerating.', 'UV protection is a forever habit!'],
      [25, 'healing', 'Day 25 — Final Stretch', 'Just a few more days of dedicated aftercare.', 'Schedule a touch-up consultation if needed.'],
      [26, 'healing', 'Healing Champion!', 'Your discipline is paying off.', 'Set a follow-up reminder with your artist.'],
      [27, 'healing', 'Three Days to Go', 'Tattoo essentially healed at the surface.', 'Browse InkVistAR gallery for your next piece!'],
      [28, 'healing', 'Penultimate Day', 'Your aftercare journey is nearly complete.', 'Sunscreen is the best long-term care habit.'],
      [29, 'healing', 'Tomorrow is the Last Day!', 'Your tattoo is fully healed. Keep moisturizing.', 'Book your next session!'],
      [30, 'healing', 'Aftercare Complete!', '30-day aftercare program is complete. Continue lifelong habits.', 'Thank you for trusting InkVistAR!']
    ];

    const insertQuery = 'INSERT INTO aftercare_templates (day_number, phase, title, message, tips) VALUES ?';
    db.query(insertQuery, [defaults.map(d => [d[0], d[1], d[2], d[3], d[4]])], (seedErr) => {
      if (seedErr) return res.status(500).json({ success: false, message: 'Error re-seeding: ' + seedErr.message });
      res.json({ success: true, message: 'Aftercare templates reset to defaults.' });
    });
  });
});

// ========== CUSTOMER SELF-SERVICE CANCELLATION ==========


// Customer: Cancel a pending booking with reason
app.put('/api/customer/appointments/:id/cancel', (req, res) => {
  const { id } = req.params;
  const { customerId, reason, isGracePeriod } = req.body;

  if (!customerId || !reason || reason.trim().length < 10) {
    return res.status(400).json({ success: false, message: 'A cancellation reason (min 10 characters) is required.' });
  }

  // 1. Verify the appointment belongs to this customer
  db.query('SELECT * FROM appointments WHERE id = ? AND customer_id = ?', [id, customerId], (err, results) => {
    if (err) return res.status(500).json({ success: false, message: 'Database error' });
    if (results.length === 0) return res.status(404).json({ success: false, message: 'Appointment not found or does not belong to you.' });

    const appointment = results[0];

    // Determine cancellation deadline based on service type (server-side enforcement)
    // Consultations: cancellable up to 3 days before appointment
    // Sessions (Tattoo/Piercing/etc.): cancellable up to 7 days before appointment
    const now = new Date();
    const apptDate = new Date(appointment.appointment_date);
    apptDate.setHours(23, 59, 59, 999); // End of appointment day for generous cutoff
    const msUntilAppt = apptDate - now;
    const daysUntilAppt = msUntilAppt / (1000 * 60 * 60 * 24);

    const serviceType = (appointment.service_type || '').toLowerCase();
    const isConsultation = serviceType.includes('consultation');
    const deadlineDays = isConsultation ? 3 : 7;
    const withinCancellationWindow = daysUntilAppt >= deadlineDays;
    const deadlineLabel = isConsultation ? '3 days' : '1 week';

    if (isGracePeriod) {
      // Service-aware cancel — server verifies the deadline hasn't passed
      if (!withinCancellationWindow) {
        return res.status(403).json({ success: false, message: `The cancellation window has closed. ${isConsultation ? 'Consultations' : 'Sessions'} must be cancelled at least ${deadlineLabel} before the scheduled date. Please contact the studio directly.` });
      }
      // Cannot cancel already-cancelled/completed appointments
      if (['cancelled', 'completed', 'finished'].includes(appointment.status)) {
        return res.status(403).json({ success: false, message: 'This booking has already been ' + appointment.status + ' and cannot be cancelled.' });
      }
    } else {
      // Standard cancel — existing rules apply
      if (appointment.status !== 'pending') {
        return res.status(403).json({ success: false, message: 'Only pending bookings can be cancelled. Please contact the studio for confirmed appointments.' });
      }
      if (appointment.payment_status && appointment.payment_status !== 'unpaid') {
        return res.status(403).json({ success: false, message: 'You cannot cancel an appointment that has already been paid for. Please contact the studio directly.' });
      }
    }

    // 2. Check cancellation limit (max 3 in last 30 days) — applies to both flows
    db.query(
      "SELECT COUNT(*) as cancelCount FROM appointments WHERE customer_id = ? AND status = 'cancelled' AND appointment_date >= DATE_SUB(NOW(), INTERVAL 30 DAY)",
      [customerId],
      (countErr, countResults) => {
        if (countErr) return res.status(500).json({ success: false, message: 'Database error checking limits.' });

        const recentCancellations = countResults[0]?.cancelCount || 0;
        if (recentCancellations >= 3) {
          return res.status(429).json({ success: false, message: 'You have reached the maximum of 3 cancellations in the last 30 days. Please contact the studio directly for assistance.' });
        }

        // 3. Cancel the appointment
        const cancelTag = isGracePeriod ? `--- Deadline Cancellation (${isConsultation ? 'Consultation — 3-day rule' : 'Session — 7-day rule'}) ---` : '--- Customer Cancellation Reason ---';
        const appendedNotes = `${appointment.notes || ''}\n\n${cancelTag}\n${reason.trim()}`;
        db.query(
          'UPDATE appointments SET status = ?, notes = ? WHERE id = ?',
          ['cancelled', appendedNotes, id],
          (updateErr) => {
            if (updateErr) return res.status(500).json({ success: false, message: 'Failed to cancel appointment.' });

            // 4. Get customer name for notification
            db.query('SELECT name FROM users WHERE id = ?', [customerId], (nameErr, nameResults) => {
              const customerName = nameResults?.[0]?.name || 'A customer';
              const cancelType = isGracePeriod ? ` (deadline cancel — ${deadlineLabel} rule)` : '';

              // 5. Notify all admins
              db.query("SELECT id FROM users WHERE user_type = 'admin' AND is_deleted = 0", (admErr, admins) => {
                if (!admErr && admins.length > 0) {
                  admins.forEach(admin => {
                    createNotification(
                      admin.id,
                      'Booking Cancelled by Customer',
                      `${customerName} cancelled appointment #${id}${cancelType}.\n\nReason: ${reason.trim()}`,
                      'appointment_cancelled',
                      parseInt(id)
                    );
                  });
                }
              });

              // 6. Notify the assigned artist (if any)
              if (appointment.artist_id) {
                createNotification(
                  appointment.artist_id,
                  'Client Cancelled Booking',
                  `${customerName} cancelled their ${isGracePeriod ? 'upcoming' : 'pending'} appointment #${id}${cancelType}.\n\nReason: ${reason.trim()}`,
                  'appointment_cancelled',
                  parseInt(id)
                );
              }

              logAction(customerId, 'CANCEL_BOOKING', `Customer cancelled appointment #${id}${cancelType}: ${reason.trim().substring(0, 100)}`, req.ip);
              res.json({ success: true, message: isGracePeriod ? 'Booking cancelled within the cancellation deadline. The studio has been notified.' : 'Booking cancelled successfully. The studio has been notified.' });
            });
          }
        );
      }
    );
  });
});

// ========== CUSTOMER FEATURES: FAVORITES & MY TATTOOS ==========

// Toggle favorite status
app.post('/api/customer/favorites', (req, res) => {
  const { userId, workId } = req.body;
  if (!userId || !workId) return res.status(400).json({ success: false, message: 'Missing userId or workId' });

  db.query('SELECT * FROM favorites WHERE user_id = ? AND work_id = ?', [userId, workId], (err, results) => {
    if (err) return res.status(500).json({ success: false, message: 'Database error' });

    if (results.length > 0) {
      db.query('DELETE FROM favorites WHERE user_id = ? AND work_id = ?', [userId, workId], (delErr) => {
        if (delErr) return res.status(500).json({ success: false, message: 'Database error (Delete)' });
        res.json({ success: true, favorited: false });
      });
    } else {
      db.query('INSERT INTO favorites (user_id, work_id) VALUES (?, ?)', [userId, workId], (insErr) => {
        if (insErr) return res.status(500).json({ success: false, message: 'Database error (Insert)' });
        res.json({ success: true, favorited: true });
      });
    }
  });
});

// Get user's favorites
app.get('/api/customer/:userId/favorites', (req, res) => {
  const { userId } = req.params;
  const query = `
    SELECT pw.*, u.name as artist_name, 1 as is_favorited
    FROM portfolio_works pw
    JOIN favorites f ON pw.id = f.work_id
    JOIN users u ON pw.artist_id = u.id
    WHERE f.user_id = ? AND pw.is_deleted = 0
    ORDER BY f.created_at DESC
  `;
  db.query(query, [userId], (err, results) => {
    if (err) return res.status(500).json({ success: false, message: 'Database error' });
    res.json({ success: true, favorites: results });
  });
});

// Get customer's "gotten tattoos" (Completed appointments)
app.get('/api/customer/:userId/my-tattoos', (req, res) => {
  const { userId } = req.params;
  const query = `
    SELECT 
      ap.id, 
      ap.design_title as title, 
      ap.appointment_date, 
      ap.after_photo, 
      ap.reference_image,
      u.name as artist_name
    FROM appointments ap
    JOIN users u ON ap.artist_id = u.id
    WHERE ap.customer_id = ? AND ap.status IN ('completed', 'finished') AND ap.is_deleted = 0
    ORDER BY ap.appointment_date DESC
  `;
  db.query(query, [userId], (err, results) => {
    if (err) return res.status(500).json({ success: false, message: 'Database error' });

    // Fallback to reference image if after_photo is missing
    const tattoos = results.map(t => ({
      ...t,
      image_url: t.after_photo || null
    }));

    res.json({ success: true, tattoos });
  });
});

// Update after-photo for appointment
app.put('/api/appointments/:id/after-photo', (req, res) => {
  const { id } = req.params;
  const { afterPhoto } = req.body;

  db.query('UPDATE appointments SET after_photo = ? WHERE id = ?', [afterPhoto, id], (err) => {
    if (err) return res.status(500).json({ success: false, message: 'Database error' });
    res.json({ success: true, message: 'After photo updated successfully' });
  });
});

// ========== NOTIFICATION ENDPOINTS ==========

// Get notifications with pagination and filtering
app.get('/api/notifications/:userId', (req, res) => {
  const { userId } = req.params;
  const { page = 1, limit = 20, type, is_read } = req.query;

  const pageNum = parseInt(page, 10);
  const limitNum = parseInt(limit, 10);
  const offset = (pageNum - 1) * limitNum;

  let query = 'SELECT * FROM notifications WHERE user_id = ?';
  const queryParams = [userId];

  if (type) {
    query += ' AND type = ?';
    queryParams.push(type);
  }
  if (is_read !== undefined) {
    query += ' AND is_read = ?';
    queryParams.push(is_read === '1' ? 1 : 0);
  }

  query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
  queryParams.push(limitNum, offset);

  // Also get total count for pagination info
  let countQuery = 'SELECT COUNT(*) as total FROM notifications WHERE user_id = ?';
  const countParams = [userId];

  if (type) {
    countQuery += ' AND type = ?';
    countParams.push(type);
  }
  if (is_read !== undefined) {
    countQuery += ' AND is_read = ?';
    countParams.push(is_read === '1' ? 1 : 0);
  }

  db.query(countQuery, countParams, (countErr, countResults) => {
    if (countErr) {
      console.error('[ERROR] Error fetching notification count:', countErr);
      return res.status(500).json({ success: false, message: 'Database error' });
    }

    // Get TOTAL unread count for this user (independent of pagination/filters)
    db.query('SELECT COUNT(*) as unread FROM notifications WHERE user_id = ? AND is_read = 0', [userId], (unreadErr, unreadResults) => {
      if (unreadErr) {
        console.error('[ERROR] Error fetching unread count:', unreadErr);
        return res.status(500).json({ success: false, message: 'Database error' });
      }

      db.query(query, queryParams, (err, results) => {
        if (err) {
          console.error('[ERROR] Error fetching notifications:', err);
          return res.status(500).json({ success: false, message: 'Database error' });
        }

        const formattedResults = results.map(n => ({
          ...n,
          // Append Z to correctly parse as UTC since dateStrings: true returns raw timestamp string
          created_at: typeof n.created_at === 'string' && !n.created_at.includes('Z') ?
            n.created_at.replace(' ', 'T') + 'Z' : n.created_at
        }));

        const unreadCount = unreadResults[0]?.unread || 0;
        const total = countResults[0]?.total || 0;
        const hasMore = offset + results.length < total;

        res.json({
          success: true,
          notifications: formattedResults,
          unreadCount,
          pagination: {
            page: pageNum,
            limit: limitNum,
            total,
            hasMore
          }
        });
      });
    });
  });
});

// Mark notification as read
app.put('/api/notifications/:id/read', (req, res) => {
  const { id } = req.params;
  const { is_read = 1 } = req.body;

  db.query('UPDATE notifications SET is_read = ? WHERE id = ?', [is_read, id], (err, result) => {
    if (err) {
      console.error('[ERROR] Error updating notification:', err);
      return res.status(500).json({ success: false, message: 'Database error' });
    }

    res.json({ success: true, message: 'Marked as read' });
  });
});

// Bulk mark ALL notifications as read for a user
app.put('/api/notifications/:userId/read-all', (req, res) => {
  const { userId } = req.params;

  db.query('UPDATE notifications SET is_read = 1 WHERE user_id = ? AND is_read = 0', [userId], (err, result) => {
    if (err) {
      console.error('[ERROR] Error bulk marking notifications:', err);
      return res.status(500).json({ success: false, message: 'Database error' });
    }

    res.json({ success: true, message: `Marked ${result.affectedRows} notifications as read`, count: result.affectedRows });
  });
});

// Delete notification
app.delete('/api/notifications/:id', (req, res) => {
  const { id } = req.params;
  db.query('DELETE FROM notifications WHERE id = ?', [id], (err, result) => {
    if (err) {
      console.error('[ERROR] Error deleting notification:', err);
      return res.status(500).json({ success: false, message: 'Database error' });
    }
    res.json({ success: true, message: 'Notification deleted' });
  });
});

// ========== ADMIN ENDPOINTS ==========

// Admin: Dashboard Stats
app.get('/api/admin/dashboard', (req, res) => {
  const queries = {
    users: 'SELECT COUNT(*) as count FROM users WHERE is_deleted = 0',
    artists: 'SELECT COUNT(*) as count FROM users WHERE user_type = "artist" AND is_deleted = 0',
    appointments: 'SELECT COUNT(*) as count FROM appointments WHERE is_deleted = 0',
    revenue: 'SELECT SUM(hourly_rate) as total FROM artists' // Placeholder logic
  };

  db.query(queries.users, (err, userRes) => {
    if (err) return res.status(500).json({ success: false });
    db.query(queries.artists, (err, artistRes) => {
      db.query(queries.appointments, (err, apptRes) => {
        res.json({
          success: true,
          data: {
            users: userRes[0].count,
            artists: artistRes[0].count,
            appointments: apptRes[0].count
          }
        });
      });
    });
  });
});

// Admin: Get All Users
app.get('/api/admin/users', (req, res) => {
  const { search, status } = req.query;
  let query = 'SELECT id, name, email, phone, user_type, is_verified, is_deleted, is_superadmin, account_status, status_reason, appeal_status, appeal_message FROM users WHERE 1=1';
  let params = [];

  // We map the incoming UI filter "status" to the DB states.
  // The UI sends "active", "deactivated", "banned", or "deleted" (legacy).
  if (status === 'deleted') {
    query += ' AND is_deleted = 1';
  } else if (status === 'deactivated') {
    query += " AND account_status = 'deactivated' AND is_deleted = 0";
  } else if (status === 'banned') {
    query += " AND account_status = 'banned' AND is_deleted = 0";
  } else if (status === 'active') {
    query += " AND account_status = 'active' AND is_deleted = 0";
  } else {
    // "all" or undefined: exclude soft-deleted users by default unless explicitly asked
    query += ' AND is_deleted = 0';
  }

  if (search) {
    query += ' AND (name LIKE ? OR email LIKE ?)';
    params = [`%${search}%`, `%${search}%`];
  }

  query += ' ORDER BY id DESC';

  db.query(query, params, (err, results) => {
    if (err) return res.status(500).json({ success: false, message: err.message });
    res.json({ success: true, data: results });
  });
});

// Admin: Create User
app.post('/api/admin/users', async (req, res) => {
  const { name, email, password, type, phone, status, profileImage, age, gender, is_verified } = req.body;
  try {
    const password_hash = await bcrypt.hash(password, 10);
    const isDeleted = (status === 'inactive' || status === 'suspended') ? 1 : 0;
    const verifiedFlag = is_verified === 1 || is_verified === true ? 1 : 0;
    const query = 'INSERT INTO users (name, email, password_hash, user_type, phone, is_deleted, is_verified) VALUES (?, ?, ?, ?, ?, ?, ?)';

    db.query(query, [name, email, password_hash, type, phone, isDeleted, verifiedFlag], (err, result) => {
      if (err) return res.status(500).json({ success: false, message: err.message });

      const newUserId = result.insertId;

      // If artist, create artist profile
      if (type === 'artist') {
        db.query('INSERT INTO artists (user_id, studio_name, profile_image) VALUES (?, ?, ?)', [newUserId, 'New Studio', profileImage || null]);
      }

      // Create customer profile with extra fields (profileImage, age, gender)
      if (profileImage || age || gender) {
        db.query(
          'INSERT INTO customers (user_id, phone, profile_image, age, gender) VALUES (?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE profile_image = VALUES(profile_image), age = VALUES(age), gender = VALUES(gender)',
          [newUserId, phone || null, profileImage || null, age || null, gender || null]
        );
      }

      logAction(getAdminId(req), 'CREATE_USER', `Created user ${email} (${type})`, req.ip);
      res.json({ success: true, message: 'User created successfully' });
    });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

// Admin: Update User
app.put('/api/admin/users/:id', (req, res) => {
  const { id } = req.params;
  const { name, email, type, phone, status } = req.body;
  const requestorEmail = req.headers['x-user-email'] || '';

  // Look up the target user to check super admin status
  db.query('SELECT email, user_type, is_superadmin FROM users WHERE id = ?', [id], (lookupErr, lookupResults) => {
    if (lookupErr) return res.status(500).json({ success: false, message: lookupErr.message });
    if (lookupResults.length === 0) return res.status(404).json({ success: false, message: 'User not found.' });

    const targetUser = lookupResults[0];

    // GUARD: Nobody can modify the super admin account except the super admin themselves
    if (targetUser.is_superadmin && requestorEmail !== targetUser.email) {
      return res.status(403).json({ success: false, message: 'Cannot modify the system super admin account.' });
    }

    // GUARD: Only the super admin can change a user's role
    if (type && type !== targetUser.user_type) {
      db.query('SELECT is_superadmin FROM users WHERE email = ?', [requestorEmail], (saErr, saResults) => {
        if (saErr || saResults.length === 0 || !saResults[0].is_superadmin) {
          return res.status(403).json({ success: false, message: 'Only the super admin can change user roles.' });
        }
        // Super admin confirmed — proceed with role change
        performUpdate();
      });
      return; // Wait for the async check above
    }

    performUpdate();

    function performUpdate() {
      const isDeleted = (status === 'inactive' || status === 'suspended') ? 1 : 0;
      const query = 'UPDATE users SET name = ?, email = ?, user_type = ?, phone = ?, is_deleted = ? WHERE id = ?';
      db.query(query, [name, email, type, phone, isDeleted, id], (err) => {
        if (err) return res.status(500).json({ success: false, message: err.message });
        logAction(getAdminId(req), 'UPDATE_USER', `Updated user ${id} (${email})`, req.ip);
        res.json({ success: true, message: 'User updated successfully' });
      });
    }
  });
});

// Admin: Update User Account Status (Active / Deactivated / Banned)
app.put('/api/admin/users/:id/status', (req, res) => {
  const { id } = req.params;
  const { status, reason, adminNote, duration } = req.body; // status: 'active' | 'deactivated' | 'banned'
  const requestorEmail = req.headers['x-user-email'] || 'System Admin';

  if (!['active', 'deactivated', 'banned'].includes(status)) {
    return res.status(400).json({ success: false, message: 'Invalid status type provided.' });
  }

  if (status === 'banned' && !reason) {
    return res.status(400).json({ success: false, message: 'A reason is required when banning a user.' });
  }

  if (status === 'deactivated' && !reason) {
    return res.status(400).json({ success: false, message: 'A reason is required when deactivating a user.' });
  }

  // Safety: Don't change status of super admin — migration-safe SELECT
  // Try with is_superadmin first, fall back to basic SELECT if column missing
  db.query('SELECT email, is_superadmin, name FROM users WHERE id = ?', [id], (err, results) => {
    if (err && err.code === 'ER_BAD_FIELD_ERROR') {
      // is_superadmin column doesn't exist — treat as non-superadmin
      console.warn('[MIGRATE] is_superadmin column missing, falling back to name+email SELECT');
      db.query('SELECT email, name FROM users WHERE id = ?', [id], (err2, results2) => {
        if (err2) return res.status(500).json({ success: false, message: 'Database error checking user: ' + err2.message });
        if (results2.length === 0) return res.status(404).json({ success: false, message: 'User not found' });
        performStatusUpdate(results2[0], false);
      });
      return;
    }
    if (err) return res.status(500).json({ success: false, message: 'Database error checking user: ' + err.message });
    if (results.length === 0) return res.status(404).json({ success: false, message: 'User not found' });

    const targetUser = results[0];
    if (targetUser.is_superadmin) {
      return res.status(403).json({ success: false, message: 'Cannot change the status of the system super admin.' });
    }
    performStatusUpdate(targetUser, false);
  });

  function performStatusUpdate(targetUser, isRetry) {
    const updateQuery = 'UPDATE users SET account_status = ?, status_reason = ? WHERE id = ?';
    let finalReason = reason || adminNote || null;
    if (status === 'deactivated' && duration) {
      finalReason = `[Duration: ${duration}] ${finalReason}`;
    }

    db.query(updateQuery, [status, finalReason, id], async (updateErr) => {
      if (updateErr && updateErr.code === 'ER_BAD_FIELD_ERROR' && !isRetry) {
        // Columns don't exist yet — run migration inline then retry
        console.log('[MIGRATE] account_status/status_reason columns missing. Running inline migration...');
        const alterQuery = `
          ALTER TABLE users 
          ADD COLUMN IF NOT EXISTS account_status ENUM('active', 'deactivated', 'banned') DEFAULT 'active',
          ADD COLUMN IF NOT EXISTS status_reason TEXT NULL,
          ADD COLUMN IF NOT EXISTS appeal_status ENUM('none', 'pending', 'accepted', 'denied') DEFAULT 'none',
          ADD COLUMN IF NOT EXISTS appeal_message TEXT NULL
        `;
        db.query(alterQuery, (alterErr) => {
          if (alterErr) {
            console.error('[MIGRATE] Inline migration failed:', alterErr.message);
            // Try a MySQL 5.7 compatible approach (no IF NOT EXISTS for ADD COLUMN)
            db.query("SHOW COLUMNS FROM users LIKE 'account_status'", (showErr, showResults) => {
              if (!showErr && showResults.length === 0) {
                db.query(`ALTER TABLE users ADD COLUMN account_status ENUM('active', 'deactivated', 'banned') DEFAULT 'active', ADD COLUMN status_reason TEXT NULL, ADD COLUMN appeal_status ENUM('none', 'pending', 'accepted', 'denied') DEFAULT 'none', ADD COLUMN appeal_message TEXT NULL`, (altErr2) => {
                  if (altErr2) return res.status(500).json({ success: false, message: 'Migration failed: ' + altErr2.message });
                  console.log('[MIGRATE] Columns added successfully (compat mode). Retrying update...');
                  performStatusUpdate(targetUser, true);
                });
              } else {
                // Column exists but something else is wrong
                return res.status(500).json({ success: false, message: 'Migration error: ' + (alterErr.message || 'Unknown') });
              }
            });
            return;
          }
          console.log('[MIGRATE] Columns added successfully. Retrying update...');
          performStatusUpdate(targetUser, true);
        });
        return;
      }
      if (updateErr) return res.status(500).json({ success: false, message: updateErr.message });

      logAction(getAdminId(req), 'UPDATE_USER_STATUS', `Changed user ${id} status to ${status} (Reason: ${finalReason || 'N/A'})`, req.ip);

      // Send Email Notification to the user if they were deactivated or banned
      if (status === 'deactivated' || status === 'banned') {
        const actionTitle = status === 'banned' ? 'Account Banned' : 'Account Deactivated';
        const actionColor = status === 'banned' ? '#ef4444' : '#f59e0b';
        const adminMessage = adminNote || reason || 'No specific reason provided.';

        let appealInstruction = '';
        if (status === 'banned') {
          appealInstruction = `<p style="margin-top:20px; font-size:14px; color:#64748b;">If you believe this is an error, you may submit an appeal by contacting our support team at <a href="mailto:support@inkvictusstudio.com">support@inkvictusstudio.com</a>.</p>`;
        }

        const emailHtml = `
          <div style="font-family:'Inter', sans-serif; max-width:600px; margin:0 auto; padding:30px; background-color:#ffffff; border:1px solid #e2e8f0; border-radius:12px;">
            <div style="text-align:center; margin-bottom:30px;">
              <h1 style="color:${actionColor}; font-size:24px; margin:0;">${actionTitle}</h1>
            </div>
            <p style="color:#334155; font-size:16px; line-height:1.6;">Hello ${targetUser.name},</p>
            <p style="color:#334155; font-size:16px; line-height:1.6;">This email is to notify you that your InkVistAR Studio account has been <strong>${status}</strong> by an administrator.${status === 'deactivated' && duration ? ` This suspension is set for a duration of <strong>${duration}</strong>.` : ''}</p>
            
            <div style="background-color:#f8fafc; border-left:4px solid ${actionColor}; padding:15px; margin:20px 0;">
              <p style="margin:0; font-size:14px; color:#475569; font-weight:600; text-transform:uppercase; letter-spacing:0.5px;">Administrator's Note</p>
              <p style="margin:8px 0 0; color:#1e293b; font-size:15px; font-style:italic;">"${adminMessage}"</p>
            </div>
            
            ${appealInstruction}
            
            <p style="color:#64748b; font-size:14px; line-height:1.6; margin-top:30px;">Best regards,<br>The InkVistAR Studio Team</p>
          </div>
        `;

        try {
          await sendEmail(targetUser.email, `InkVistAR: Important Account Update - ${actionTitle}`, emailHtml);
        } catch (emailError) {
          console.error("Failed to send status update email:", emailError.message);
        }
      }

      res.json({ success: true, message: `User account successfully ${status}` });
    });
  }
});


// Admin: Delete User (Soft Delete)
app.delete('/api/admin/users/:id', (req, res) => {
  const { id } = req.params;
  console.log(`[INFO] SOFT DELETE request for user ID: ${id}`);

  // Safety: Don't delete any super admin account
  db.query('SELECT email, is_superadmin FROM users WHERE id = ?', [id], (err, results) => {
    if (err) return res.status(500).json({ success: false, message: 'Database error checking user' });

    if (results.length > 0 && results[0].is_superadmin) {
      return res.status(403).json({ success: false, message: 'Cannot deactivate the system super admin.' });
    }

    // Soft Delete: Just mark as deleted
    const query = 'UPDATE users SET is_deleted = 1 WHERE id = ?';
    db.query(query, [id], (err, result) => {
      if (err) return res.status(500).json({ success: false, message: err.message });
      logAction(getAdminId(req), 'DEACTIVATE_USER', `Deactivated user ID ${id}`, req.ip);
      res.json({ success: true, message: 'User deactivated successfully' });
    });
  });
});

// Admin: Restore User
app.put('/api/admin/users/:id/restore', (req, res) => {
  const { id } = req.params;
  db.query('UPDATE users SET is_deleted = 0 WHERE id = ?', [id], (err, result) => {
    if (err) return res.status(500).json({ success: false, message: err.message });
    logAction(getAdminId(req), 'RESTORE_USER', `Restored user ID ${id}`, req.ip);
    res.json({ success: true, message: 'User restored successfully' });
  });
});

// Admin: Permanent Delete User
app.delete('/api/admin/users/:id/permanent', (req, res) => {
  const { id } = req.params;

  // GUARD: Never permanently delete a super admin
  db.query('SELECT is_superadmin FROM users WHERE id = ?', [id], (checkErr, checkResults) => {
    if (checkErr) return res.status(500).json({ success: false, message: checkErr.message });
    if (checkResults.length > 0 && checkResults[0].is_superadmin) {
      return res.status(403).json({ success: false, message: 'Cannot permanently delete the system super admin.' });
    }

    db.query('DELETE FROM users WHERE id = ?', [id], (err, result) => {
      if (err) return res.status(500).json({ success: false, message: err.message });
      logAction(getAdminId(req), 'DELETE_USER', `Permanently deleted user ID ${id}`, req.ip);
      res.json({ success: true, message: 'User permanently deleted' });
    });
  });
});

// Admin: Undo soft delete (Task 4.1)
app.put('/api/admin/undo-delete', (req, res) => {
  const { table, id } = req.body;
  const allowedTables = ['users', 'appointments', 'inventory', 'portfolio_works', 'branches'];
  if (!allowedTables.includes(table)) {
    return res.status(400).json({ success: false, message: 'Invalid table for undo operation' });
  }
  if (!id) return res.status(400).json({ success: false, message: 'Missing record ID' });

  db.query(`UPDATE ${table} SET is_deleted = 0 WHERE id = ?`, [id], (err, result) => {
    if (err) return res.status(500).json({ success: false, message: 'Database error' });
    if (result.affectedRows === 0) return res.status(404).json({ success: false, message: 'Record not found' });
    console.log(`[UNDO] Restored ${table} record #${id}`);
    res.json({ success: true, message: 'Record restored successfully' });
  });
});

// Admin: Get Audit Logs
app.get('/api/admin/audit-logs', (req, res) => {
  const limit = parseInt(req.query.limit) || 50;
  const filterAdmin = req.query.adminOnly === 'true';
  const query = `
    SELECT al.*, u.name as user_name, u.email as user_email,
           u.user_type as user_type
    FROM audit_logs al
    LEFT JOIN users u ON al.user_id = u.id
    ${filterAdmin ? "WHERE u.user_type IN ('admin', 'manager')" : ''}
    ORDER BY al.created_at DESC
    LIMIT ?
  `;
  db.query(query, [limit], (err, results) => {
    if (err) return res.status(500).json({ success: false, message: err.message });
    res.json({ success: true, data: results });
  });
});

// Auto-create studio_expenses table if it doesn't exist
db.query(`
  CREATE TABLE IF NOT EXISTS studio_expenses (
    id INT AUTO_INCREMENT PRIMARY KEY,
    category VARCHAR(100) NOT NULL,
    description TEXT,
    amount DECIMAL(10,2) NOT NULL DEFAULT 0,
    created_by INT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )
`, (err) => { if (err) console.error('studio_expenses table check error:', err.message); });

// Admin: Get Overhead Expenses
app.get('/api/admin/overhead', (req, res) => {
  db.query(
    'SELECT se.*, COALESCE(u.name, "System Admin") as created_by_name FROM studio_expenses se LEFT JOIN users u ON se.created_by = u.id ORDER BY se.created_at DESC LIMIT 100',
    (err, results) => {
      if (err) return res.status(500).json({ success: false, message: err.message });
      res.json({ success: true, data: results });
    }
  );
});

// Admin: Add Overhead Expense
app.post('/api/admin/overhead', (req, res) => {
  const { category, description, amount } = req.body;
  if (!category || !amount) return res.status(400).json({ success: false, message: 'Category and amount are required.' });
  const parsedAmount = parseFloat(amount);
  if (isNaN(parsedAmount) || parsedAmount <= 0) return res.status(400).json({ success: false, message: 'Amount must be greater than 0.' });
  const adminId = getAdminId(req);
  db.query(
    'INSERT INTO studio_expenses (category, description, amount, created_by) VALUES (?, ?, ?, ?)',
    [category.trim(), (description || '').trim(), parsedAmount, adminId || null],
    (err, result) => {
      if (err) return res.status(500).json({ success: false, message: err.message });
      logAction(adminId, 'ADD_OVERHEAD', `Added overhead: ${category} - ₱${parsedAmount}`, req.ip);
      res.json({ success: true, message: 'Overhead expense recorded.', id: result.insertId });
    }
  );
});

// Admin: Delete Overhead Expense
app.delete('/api/admin/overhead/:id', (req, res) => {
  const { id } = req.params;
  const adminId = getAdminId(req);
  db.query('DELETE FROM studio_expenses WHERE id = ?', [id], (err) => {
    if (err) return res.status(500).json({ success: false, message: err.message });
    logAction(adminId, 'DELETE_OVERHEAD', `Deleted overhead expense ID ${id}`, req.ip);
    res.json({ success: true, message: 'Overhead expense deleted.' });
  });
});

// Admin: Get Branches
app.get('/api/admin/branches', (req, res) => {
  const { status } = req.query;
  let query = 'SELECT * FROM branches WHERE 1=1';

  if (status === 'deleted') {
    query += ' AND is_deleted = 1';
  } else {
    query += ' AND is_deleted = 0';
  }

  query += ' ORDER BY id DESC';

  db.query(query, (err, results) => {
    if (err) return res.status(500).json({ success: false, message: err.message });
    res.json({ success: true, data: results });
  });
});

// Admin: Add Branch
app.post('/api/admin/branches', (req, res) => {
  const { name, address, phone, operating_hours, capacity } = req.body;
  const query = 'INSERT INTO branches (name, address, phone, operating_hours, capacity, status) VALUES (?, ?, ?, ?, ?, "Closed")';
  db.query(query, [name, address, phone, operating_hours, capacity], (err, result) => {
    if (err) return res.status(500).json({ success: false, message: err.message });
    logAction(getAdminId(req), 'CREATE_BRANCH', `Created branch: ${name}`, req.ip);
    res.json({ success: true, message: 'Branch added successfully', id: result.insertId });
  });
});

// Admin: Update Branch
app.put('/api/admin/branches/:id', (req, res) => {
  const { id } = req.params;
  const { status, current_occupancy, name, address, phone, operating_hours, capacity } = req.body;

  let query = 'UPDATE branches SET ';
  const params = [];
  const updates = [];

  if (status) { updates.push('status = ?'); params.push(status); }
  if (current_occupancy !== undefined) { updates.push('current_occupancy = ?'); params.push(current_occupancy); }
  if (name) { updates.push('name = ?'); params.push(name); }
  if (address) { updates.push('address = ?'); params.push(address); }
  if (phone) { updates.push('phone = ?'); params.push(phone); }
  if (operating_hours) { updates.push('operating_hours = ?'); params.push(operating_hours); }
  if (capacity) { updates.push('capacity = ?'); params.push(capacity); }

  if (updates.length === 0) return res.json({ success: true });

  query += updates.join(', ') + ' WHERE id = ?';
  params.push(id);

  db.query(query, params, (err) => {
    if (err) return res.status(500).json({ success: false, message: err.message });
    logAction(getAdminId(req), 'UPDATE_BRANCH', `Updated branch ID ${id}`, req.ip);
    res.json({ success: true, message: 'Branch updated' });
  });
});

// Admin: Delete Branch
app.delete('/api/admin/branches/:id', (req, res) => {
  const { id } = req.params;
  db.query('UPDATE branches SET is_deleted = 1 WHERE id = ?', [id], (err) => {
    if (err) return res.status(500).json({ success: false, message: err.message });
    logAction(getAdminId(req), 'DELETE_BRANCH', `Deleted branch ID ${id}`, req.ip);
    res.json({ success: true, message: 'Branch deleted' });
  });
});

// Admin: Restore Branch
app.put('/api/admin/branches/:id/restore', (req, res) => {
  const { id } = req.params;
  db.query('UPDATE branches SET is_deleted = 0 WHERE id = ?', [id], (err) => {
    if (err) return res.status(500).json({ success: false, message: err.message });
    logAction(getAdminId(req), 'RESTORE_BRANCH', `Restored branch ID ${id}`, req.ip);
    res.json({ success: true, message: 'Branch restored' });
  });
});

// Admin: Get Inventory
app.get('/api/admin/inventory', (req, res) => {
  const { status } = req.query;
  let query = 'SELECT * FROM inventory WHERE 1=1';

  if (status === 'deleted') {
    query += ' AND is_deleted = 1';
  } else {
    query += ' AND is_deleted = 0';
  }

  query += ' ORDER BY name ASC';

  db.query(query, (err, results) => {
    if (err) return res.status(500).json({ success: false, message: err.message });
    res.json({ success: true, data: results });
  });
});

// Admin: Add Inventory Item
app.post('/api/admin/inventory', (req, res) => {
  const { name, category, currentStock, minStock, maxStock, unit, supplier, cost, retailPrice, image } = req.body;
  const query = 'INSERT INTO inventory (name, category, current_stock, min_stock, max_stock, unit, supplier, cost, retail_price, image, last_restocked) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)';
  db.query(query, [name, category, currentStock, minStock, maxStock, unit, supplier, cost, retailPrice || 0, image || null, getLocalDatetime()], (err, result) => {
    if (err) return res.status(500).json({ success: false, message: err.message });
    logAction(getAdminId(req), 'CREATE_INVENTORY', `Added item: ${name}`, req.ip);
    res.json({ success: true, message: 'Item added', id: result.insertId });
  });
});

// Admin: Update Inventory Item
app.put('/api/admin/inventory/:id', (req, res) => {
  const { id } = req.params;
  const { name, category, currentStock, minStock, maxStock, unit, supplier, cost, retailPrice, user_id, image } = req.body;

  // First, fetch the current item to detect price changes
  db.query('SELECT cost, retail_price, name FROM inventory WHERE id = ?', [id], (fetchErr, rows) => {
    if (fetchErr) return res.status(500).json({ success: false, message: fetchErr.message });
    if (!rows || rows.length === 0) return res.status(404).json({ success: false, message: 'Item not found' });

    const oldItem = rows[0];
    const oldCost = parseFloat(oldItem.cost) || 0;
    const oldRetail = parseFloat(oldItem.retail_price) || 0;
    const newCost = parseFloat(cost) || 0;
    const newRetail = parseFloat(retailPrice) || 0;

    // Perform the update
    const query = 'UPDATE inventory SET name=?, category=?, current_stock=?, min_stock=?, max_stock=?, unit=?, supplier=?, cost=?, retail_price=?, image=? WHERE id=?';
    db.query(query, [name, category, currentStock, minStock, maxStock, unit, supplier, newCost, newRetail, image || null, id], (err) => {
      if (err) return res.status(500).json({ success: false, message: err.message });

      // Log price changes as transactions
      const priceChanges = [];
      if (oldCost !== newCost) {
        const direction = newCost > oldCost ? 'increased' : 'decreased';
        priceChanges.push({
          reason: `Unit cost ${direction}: ₱${oldCost.toFixed(2)} → ₱${newCost.toFixed(2)}`,
          quantity: 0,
          price: newCost
        });
      }
      if (oldRetail !== newRetail) {
        const direction = newRetail > oldRetail ? 'increased' : 'decreased';
        priceChanges.push({
          reason: `Retail price ${direction}: ₱${oldRetail.toFixed(2)} → ₱${newRetail.toFixed(2)}`,
          quantity: 0,
          price: newRetail
        });
      }

      if (priceChanges.length > 0) {
        const insertValues = priceChanges.map(pc =>
          [id, 'price_change', pc.quantity, pc.reason, user_id || null, pc.price]
        );
        const placeholders = insertValues.map(() => '(?, ?, ?, ?, ?, ?)').join(', ');
        const flatValues = insertValues.flat();

        db.query(
          `INSERT INTO inventory_transactions (inventory_id, type, quantity, reason, user_id, item_price) VALUES ${placeholders}`,
          flatValues,
          (logErr) => {
            if (logErr) console.error('Failed to log price change transaction:', logErr);
          }
        );
      }

      logAction(getAdminId(req), 'UPDATE_INVENTORY', `Updated item ID ${id} (${name})`, req.ip);
      res.json({ success: true, message: 'Item updated' });
    });
  });
});

// Admin: Delete Inventory Item
app.delete('/api/admin/inventory/:id', (req, res) => {
  const { id } = req.params;
  db.query('UPDATE inventory SET is_deleted = 1 WHERE id=?', [id], (err) => {
    if (err) return res.status(500).json({ success: false, message: err.message });
    logAction(getAdminId(req), 'DELETE_INVENTORY', `Deleted item ID ${id}`, req.ip);
    res.json({ success: true, message: 'Item deleted' });
  });
});

// Admin: Restore Inventory Item
app.put('/api/admin/inventory/:id/restore', (req, res) => {
  const { id } = req.params;
  db.query('UPDATE inventory SET is_deleted = 0 WHERE id=?', [id], (err) => {
    if (err) return res.status(500).json({ success: false, message: err.message });
    logAction(getAdminId(req), 'RESTORE_INVENTORY', `Restored item ID ${id}`, req.ip);
    res.json({ success: true, message: 'Item restored' });
  });
});

// Admin: Permanent Delete Inventory Item
app.delete('/api/admin/inventory/:id/permanent', (req, res) => {
  const { id } = req.params;
  db.query('DELETE FROM inventory WHERE id=?', [id], (err) => {
    if (err) return res.status(500).json({ success: false, message: err.message });
    logAction(getAdminId(req), 'PERMANENT_DELETE_INVENTORY', `Permanently deleted item ID ${id}`, req.ip);
    res.json({ success: true, message: 'Item permanently deleted' });
  });
});

// Admin: Stock Transaction (In/Out)
app.post('/api/admin/inventory/:id/transaction', (req, res) => {
  const { id } = req.params;
  const { type, quantity, reason } = req.body; // type: 'in' or 'out'

  if (!['in', 'out'].includes(type)) return res.status(400).json({ success: false, message: 'Invalid type' });

  // First, fetch the current item price/cost
  db.query('SELECT cost, retail_price FROM inventory WHERE id = ?', [id], (err, invRes) => {
    if (err) return res.status(500).json({ success: false, message: err.message });
    if (invRes.length === 0) return res.status(404).json({ success: false, message: 'Item not found' });

    const itemCost = invRes[0].cost || 0;
    const itemRetailPrice = invRes[0].retail_price || itemCost;
    // Use cost for stock-in (Expense), retail_price for stock-out (Revenue / Sale)
    const item_price = type === 'in' ? itemCost : itemRetailPrice;

    // Update stock
    const updateQuery = type === 'in'
      ? 'UPDATE inventory SET current_stock = current_stock + ?, last_restocked = ? WHERE id = ?'
      : 'UPDATE inventory SET current_stock = GREATEST(0, current_stock - ?) WHERE id = ?';

    db.query(updateQuery, type === 'in' ? [quantity, getLocalDatetime(), id] : [quantity, id], (err, result) => {
      if (err) return res.status(500).json({ success: false, message: err.message });

      // Log transaction with item_price
      db.query('INSERT INTO inventory_transactions (inventory_id, type, quantity, reason, user_id, item_price) VALUES (?, ?, ?, ?, ?, ?)',
        [id, type, quantity, reason, req.body.user_id || null, item_price],
        (logErr) => {
          if (logErr) console.error('Failed to log transaction:', logErr);
          logAction(getAdminId(req), 'STOCK_TRANSACTION', `${type.toUpperCase()} ${quantity} for item ${id}: ${reason}`, req.ip);
          res.json({ success: true, message: 'Stock updated' });
        }
      );
    });
  });
});

// Admin: Get Inventory Transactions (Usage Report)
app.get('/api/admin/inventory/transactions', (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 100;
  const offset = (page - 1) * limit;

  const dataQuery = `
    SELECT t.*, i.name as item_name, i.category, i.unit,
           COALESCE(u.name, 'System') as user_name,
           COALESCE(u.user_type, '') as user_type
    FROM inventory_transactions t 
    JOIN inventory i ON t.inventory_id = i.id 
    LEFT JOIN users u ON t.user_id = u.id
    ORDER BY t.created_at DESC 
    LIMIT ?
    OFFSET ?
  `;

  const countQuery = 'SELECT COUNT(*) as total FROM inventory_transactions';

  db.query(dataQuery, [limit, offset], (err, results) => {
    if (err) return res.status(500).json({ success: false, message: err.message });

    db.query(countQuery, (countErr, countResults) => {
      if (countErr) return res.status(500).json({ success: false, message: countErr.message });

      const total = countResults[0].total;
      const totalPages = Math.ceil(total / limit);

      res.json({ success: true, data: results, pagination: { page, limit, total, totalPages } });
    });
  });
});

// Admin: Analytics Data
app.get('/api/admin/analytics', (req, res) => {
  const timeframe = req.query.timeframe || 'all'; // 'weekly', 'monthly', 'yearly', 'all', 'custom'
  const customStart = req.query.startDate || null;
  const customEnd = req.query.endDate || null;

  // ─── UNIFIED DATE FILTERS ───
  // Build date filter clauses for EVERY table so all widgets respect the timeframe.
  // "All Time" is clamped to April 2026 (project start).
  const ALL_TIME_START = '2026-04-01';

  let isDaily = false;
  let loopStart, loopEnd;
  const today = new Date();

  if (timeframe === 'weekly') {
    isDaily = true;
    const dayOfWeek = today.getDay();
    const mondayOffset = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
    loopStart = new Date(today);
    loopStart.setDate(today.getDate() - mondayOffset);
    loopStart.setHours(0, 0, 0, 0);
    loopEnd = new Date(today);
  } else if (timeframe === 'monthly') {
    isDaily = true;
    loopStart = new Date(today.getFullYear(), today.getMonth(), 1);
    loopEnd = new Date(today);
  } else if (timeframe === 'yearly') {
    isDaily = false;
    loopStart = new Date(today.getFullYear(), 0, 1);
    loopEnd = new Date(today);
  } else if (timeframe === 'custom' && customStart && customEnd) {
    loopStart = new Date(customStart + 'T00:00:00');
    loopEnd = new Date(customEnd + 'T23:59:59');
    if (loopEnd > today) loopEnd = new Date(today);
    const daysDiff = Math.ceil((loopEnd - loopStart) / (1000 * 60 * 60 * 24)) + 1;
    isDaily = daysDiff <= 31;
  } else {
    isDaily = false;
    loopStart = new Date(ALL_TIME_START + 'T00:00:00');
    loopEnd = new Date(today);
  }

  let apptDateFilter = '';          // appointments.appointment_date
  let invTxDateFilter = '';         // inventory_transactions.created_at
  let studioExpDateFilter = '';     // studio_expenses.created_at
  let payoutsDateFilter = '';       // payouts.created_at
  let invoiceDateFilter = '';       // invoices.created_at
  let revenueDateFilter = '';       // appointments via ap.appointment_date (for revenue)

  if (timeframe === 'weekly') {
    apptDateFilter = "AND ap.appointment_date >= DATE_SUB(CURDATE(), INTERVAL (WEEKDAY(CURDATE())) DAY)";
    revenueDateFilter = "AND ap.appointment_date >= DATE_SUB(CURDATE(), INTERVAL (WEEKDAY(CURDATE())) DAY)";
    invTxDateFilter = "AND t.created_at >= DATE_SUB(CURDATE(), INTERVAL (WEEKDAY(CURDATE())) DAY)";
    studioExpDateFilter = "AND created_at >= DATE_SUB(CURDATE(), INTERVAL (WEEKDAY(CURDATE())) DAY)";
    payoutsDateFilter = "AND created_at >= DATE_SUB(CURDATE(), INTERVAL (WEEKDAY(CURDATE())) DAY)";
    invoiceDateFilter = "AND created_at >= DATE_SUB(CURDATE(), INTERVAL (WEEKDAY(CURDATE())) DAY)";
  } else if (timeframe === 'monthly') {
    apptDateFilter = "AND ap.appointment_date >= DATE_FORMAT(NOW(), '%Y-%m-01')";
    revenueDateFilter = "AND ap.appointment_date >= DATE_FORMAT(NOW(), '%Y-%m-01')";
    invTxDateFilter = "AND t.created_at >= DATE_FORMAT(NOW(), '%Y-%m-01')";
    studioExpDateFilter = "AND created_at >= DATE_FORMAT(NOW(), '%Y-%m-01')";
    payoutsDateFilter = "AND created_at >= DATE_FORMAT(NOW(), '%Y-%m-01')";
    invoiceDateFilter = "AND created_at >= DATE_FORMAT(NOW(), '%Y-%m-01')";
  } else if (timeframe === 'yearly') {
    apptDateFilter = "AND YEAR(ap.appointment_date) = YEAR(NOW())";
    revenueDateFilter = "AND YEAR(ap.appointment_date) = YEAR(NOW())";
    invTxDateFilter = "AND YEAR(t.created_at) = YEAR(NOW())";
    studioExpDateFilter = "AND YEAR(created_at) = YEAR(NOW())";
    payoutsDateFilter = "AND YEAR(created_at) = YEAR(NOW())";
    invoiceDateFilter = "AND YEAR(created_at) = YEAR(NOW())";
  } else if (timeframe === 'custom' && customStart && customEnd) {
    const safeStart = db.escape(customStart);
    const safeEnd = db.escape(customEnd);
    apptDateFilter = `AND ap.appointment_date >= ${safeStart} AND ap.appointment_date <= ${safeEnd}`;
    revenueDateFilter = `AND ap.appointment_date >= ${safeStart} AND ap.appointment_date <= ${safeEnd}`;
    invTxDateFilter = `AND t.created_at >= ${safeStart} AND DATE(t.created_at) <= ${safeEnd}`;
    studioExpDateFilter = `AND created_at >= ${safeStart} AND DATE(created_at) <= ${safeEnd}`;
    payoutsDateFilter = `AND created_at >= ${safeStart} AND DATE(created_at) <= ${safeEnd}`;
    invoiceDateFilter = `AND created_at >= ${safeStart} AND DATE(created_at) <= ${safeEnd}`;
  } else {
    // 'all' — clamp to project start (April 2026)
    apptDateFilter = `AND ap.appointment_date >= '${ALL_TIME_START}'`;
    revenueDateFilter = `AND ap.appointment_date >= '${ALL_TIME_START}'`;
    invTxDateFilter = `AND t.created_at >= '${ALL_TIME_START}'`;
    studioExpDateFilter = `AND created_at >= '${ALL_TIME_START}'`;
    payoutsDateFilter = `AND created_at >= '${ALL_TIME_START}'`;
    invoiceDateFilter = `AND created_at >= '${ALL_TIME_START}'`;
  }

  // Removed unused trendDays variable

  const response = {
    revenue: { total: 0, growth: 0, chart: [], breakdown: [] },
    appointments: { total: 0, completed: 0, scheduled: 0, cancelled: 0, completionRate: 0 },
    expenses: { total: 0, breakdown: [] },
    overhead: { total: 0, breakdown: [] },
    artists: [],
    styles: [],
    inventory: [],
    users: { total: 0, artists: 0, customers: 0, admins: 0 },
    // Audit log arrays
    revenue_audit: [],
    appointments_audit: [],
    inventory_out_audit: [],
    users_audit: [],
    styles_audit: [],
    timeframe: timeframe
  };

  // 1. Appointment Stats — filtered by timeframe
  const apptStatsQuery = `
    SELECT 
      COUNT(*) as total,
      SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed,
      SUM(CASE WHEN status IN ('scheduled', 'confirmed') THEN 1 ELSE 0 END) as scheduled,
      SUM(CASE WHEN status = 'cancelled' THEN 1 ELSE 0 END) as cancelled,
      AVG(CASE WHEN status = 'completed' AND session_duration IS NOT NULL AND session_duration > 0 THEN session_duration ELSE NULL END) as avgDuration
    FROM appointments ap
    WHERE is_deleted = 0 ${apptDateFilter}
  `;

  // 2. Revenue breakdown by source (Appointments vs POS) — filtered by timeframe
  const revenueBreakdownQuery = `
    SELECT 
      COALESCE((SELECT SUM(((SELECT COALESCE(SUM(amount), 0) FROM payments p WHERE p.appointment_id = ap.id AND p.status = 'paid') / 100) + COALESCE(ap.manual_paid_amount, 0)) FROM appointments ap WHERE ap.status != 'cancelled' AND ap.is_deleted = 0 ${revenueDateFilter}), 0) as appointment_revenue,
      COALESCE((SELECT SUM(amount) FROM invoices WHERE LOWER(status) = 'paid' AND (LOWER(service_type) LIKE '%retail%' OR LOWER(service_type) LIKE '%pos%') ${invoiceDateFilter}), 0) as pos_revenue,
      COALESCE((SELECT SUM(amount) FROM invoices WHERE LOWER(status) = 'paid' AND LOWER(service_type) NOT LIKE '%retail%' AND LOWER(service_type) NOT LIKE '%pos%' ${invoiceDateFilter}), 0) as service_invoice_revenue
  `;

  // 2.5 Expenses: Inventory procurements + Payouts — filtered by timeframe
  const expensesQuery = `
    SELECT 
      (SELECT COALESCE(SUM(t.quantity * COALESCE(t.item_price, i.cost, 0)), 0) 
       FROM inventory_transactions t JOIN inventory i ON t.inventory_id = i.id WHERE t.type = 'in' ${invTxDateFilter}) as procurement_total,
      (SELECT COALESCE(SUM(amount), 0) FROM payouts WHERE 1=1 ${payoutsDateFilter}) as payouts_total
  `;

  // 2.5.5 Overhead Expenses (Manual from studio_expenses) — filtered by timeframe
  const overheadBreakdownQuery = `
    SELECT category, SUM(amount) as total
    FROM studio_expenses
    WHERE 1=1 ${studioExpDateFilter}
    GROUP BY category
    ORDER BY total DESC
  `;

  // 2.5.6 Expenses Trend — combines payouts + inventory procurements
  const expensesTrendQuery = isDaily
    ? `SELECT sort_key, SUM(v) as v FROM (
         SELECT DATE(created_at) as sort_key, SUM(amount) as v FROM payouts WHERE 1=1 ${payoutsDateFilter} GROUP BY sort_key
         UNION ALL
         SELECT DATE(t.created_at) as sort_key, SUM(t.quantity * COALESCE(t.item_price, i.cost, 0)) as v
         FROM inventory_transactions t JOIN inventory i ON t.inventory_id = i.id
         WHERE t.type = 'in' ${invTxDateFilter} GROUP BY sort_key
       ) combined GROUP BY sort_key ORDER BY sort_key ASC`
    : `SELECT sort_key, SUM(v) as v FROM (
         SELECT DATE_FORMAT(created_at, '%Y-%m') as sort_key, SUM(amount) as v FROM payouts WHERE 1=1 ${payoutsDateFilter} GROUP BY sort_key
         UNION ALL
         SELECT DATE_FORMAT(t.created_at, '%Y-%m') as sort_key, SUM(t.quantity * COALESCE(t.item_price, i.cost, 0)) as v
         FROM inventory_transactions t JOIN inventory i ON t.inventory_id = i.id
         WHERE t.type = 'in' ${invTxDateFilter} GROUP BY sort_key
       ) combined GROUP BY sort_key ORDER BY sort_key ASC`;

  // 2.6 Fetch raw data for expense audits
  const payoutsAuditQuery = `SELECT p.*, u.name as artist_name FROM payouts p JOIN users u ON p.artist_id = u.id ORDER BY p.created_at DESC LIMIT 50`;
  const inventoryInAuditQuery = `SELECT t.*, i.name, (t.quantity * COALESCE(t.item_price, i.cost, 0)) as total_cost FROM inventory_transactions t JOIN inventory i ON t.inventory_id = i.id WHERE t.type = 'in' ORDER BY t.created_at DESC LIMIT 50`;

  // 2.7 Revenue Audit Logs (individual payments/invoices)
  const revenueAuditQuery = `
    (SELECT p.created_at as date, CONCAT('Payment #', p.id) as description, 'Appointment Payment' as source, (p.amount / 100) as amount
     FROM payments p WHERE p.status = 'paid' ORDER BY p.created_at DESC LIMIT 30)
    UNION ALL
    (SELECT i.created_at as date, CONCAT(i.invoice_number, ' - ', i.client_name) as description, 
     CASE WHEN LOWER(i.service_type) LIKE '%retail%' OR LOWER(i.service_type) LIKE '%pos%' THEN 'POS Sale' ELSE 'Service Invoice' END as source,
     i.amount FROM invoices i WHERE LOWER(i.status) = 'paid' ORDER BY i.created_at DESC LIMIT 30)
    ORDER BY date DESC LIMIT 50
  `;

  // 2.8 Appointments Audit Logs (individual appointments)
  const appointmentsAuditQuery = `
    SELECT ap.id, ap.appointment_date, ap.start_time, ap.status, ap.service_type,
           ap.session_duration, ap.audit_log,
           c.name as client_name, u.name as artist_name,
           (((SELECT COALESCE(SUM(amount), 0) FROM payments p WHERE p.appointment_id = ap.id AND p.status = 'paid') / 100) + COALESCE(ap.manual_paid_amount, 0)) as total_paid
    FROM appointments ap
    LEFT JOIN users c ON ap.customer_id = c.id
    LEFT JOIN users u ON ap.artist_id = u.id
    WHERE ap.is_deleted = 0
    ORDER BY ap.appointment_date DESC
    LIMIT 50
  `;

  // 2.8.1 Duration Audit — completed sessions with timer data from ArtistSessions.js
  const durationAuditQuery = `
    SELECT ap.id, ap.appointment_date, ap.start_time, ap.service_type,
           ap.session_duration, ap.audit_log,
           c.name as client_name, u.name as artist_name
    FROM appointments ap
    LEFT JOIN users c ON ap.customer_id = c.id
    LEFT JOIN users u ON ap.artist_id = u.id
    WHERE ap.is_deleted = 0 AND ap.status = 'completed'
      AND ap.session_duration IS NOT NULL AND ap.session_duration > 0
    ORDER BY ap.appointment_date DESC
    LIMIT 50
  `;

  // 2.9 Inventory Out Audit (consumption)
  const inventoryOutAuditQuery = `
    SELECT t.created_at, i.name as item_name, i.category, t.quantity, COALESCE(t.item_price, i.cost, 0) as unit_price,
           (t.quantity * COALESCE(t.item_price, i.cost, 0)) as total_cost, t.reason, u.name as action_by
    FROM inventory_transactions t
    JOIN inventory i ON t.inventory_id = i.id
    LEFT JOIN users u ON t.user_id = u.id
    WHERE t.type = 'out'
    ORDER BY t.created_at DESC
    LIMIT 50
  `;

  // 2.10 User Stats
  const userStatsQuery = `
    SELECT
      COUNT(*) as total,
      SUM(CASE WHEN user_type = 'artist' THEN 1 ELSE 0 END) as artists,
      SUM(CASE WHEN user_type = 'customer' THEN 1 ELSE 0 END) as customers,
      SUM(CASE WHEN user_type = 'admin' THEN 1 ELSE 0 END) as admins
    FROM users WHERE is_deleted = 0
  `;

  // 2.11 Users Audit (individual user list)
  const usersAuditQuery = `
    SELECT id, name, email, user_type, created_at, is_verified
    FROM users WHERE is_deleted = 0
    ORDER BY created_at DESC
    LIMIT 50
  `;

  // 2.12 Styles Audit (individual portfolio works)
  const stylesAuditQuery = `
    SELECT pw.id, pw.title, pw.category, pw.created_at, u.name as artist_name
    FROM portfolio_works pw
    LEFT JOIN users u ON pw.artist_id = u.id
    WHERE pw.is_deleted = 0 AND pw.category IS NOT NULL AND pw.category != ''
    ORDER BY pw.created_at DESC
    LIMIT 50
  `;

  // 3. Artist Productivity — filtered by timeframe
  //    Uses per-service-line pricing when tattoo_price/piercing_price are set (dual-service split),
  //    otherwise falls back to commission_split percentage (collab/legacy).
  const artistQuery = `
    SELECT name, SUM(appointments) as appointments, SUM(revenue) as revenue FROM (
      SELECT 
        u.name,
        COUNT(ap.id) as appointments,
        SUM(
          (((SELECT COALESCE(SUM(amount), 0) FROM payments p WHERE p.appointment_id = ap.id AND p.status = 'paid') / 100) + COALESCE(ap.manual_paid_amount, 0))
          * CASE 
              WHEN ap.secondary_artist_id IS NOT NULL AND ap.tattoo_price IS NOT NULL AND ap.piercing_price IS NOT NULL 
                THEN ap.tattoo_price / NULLIF(ap.price, 0)
              WHEN ap.secondary_artist_id IS NOT NULL 
                THEN COALESCE(ap.commission_split, 50) / 100.0 
              ELSE 1 
            END
        ) as revenue
      FROM appointments ap
      JOIN users u ON ap.artist_id = u.id
      WHERE ap.status != 'cancelled' AND ap.is_deleted = 0 ${apptDateFilter}
      GROUP BY u.id, u.name
      UNION ALL
      SELECT 
        u.name,
        COUNT(ap.id) as appointments,
        SUM(
          (((SELECT COALESCE(SUM(amount), 0) FROM payments p WHERE p.appointment_id = ap.id AND p.status = 'paid') / 100) + COALESCE(ap.manual_paid_amount, 0))
          * CASE 
              WHEN ap.tattoo_price IS NOT NULL AND ap.piercing_price IS NOT NULL 
                THEN ap.piercing_price / NULLIF(ap.price, 0)
              ELSE (100 - COALESCE(ap.commission_split, 50)) / 100.0 
            END
        ) as revenue
      FROM appointments ap
      JOIN users u ON ap.secondary_artist_id = u.id
      WHERE ap.status != 'cancelled' AND ap.is_deleted = 0 AND ap.secondary_artist_id IS NOT NULL ${apptDateFilter}
      GROUP BY u.id, u.name
    ) combined
    GROUP BY name
    ORDER BY revenue DESC
    LIMIT 5
  `;

  // 4. Inventory Consumption — filtered by timeframe
  const inventoryQuery = `
    SELECT i.name, SUM(t.quantity) as used, i.unit
    FROM inventory_transactions t
    JOIN inventory i ON t.inventory_id = i.id
    WHERE t.type = 'out' ${invTxDateFilter}
    GROUP BY i.id, i.name, i.unit
    ORDER BY used DESC
    LIMIT 5
  `;

  // 4b. Inventory Trend (daily for 'monthly' and short 'custom', monthly otherwise)
  const inventoryTrendQuery = isDaily
    ? `SELECT DATE(t.created_at) as sort_key, SUM(t.quantity) as v
       FROM inventory_transactions t
       WHERE t.type = 'out' ${invTxDateFilter}
       GROUP BY sort_key ORDER BY sort_key ASC`
    : `SELECT DATE_FORMAT(t.created_at, '%Y-%m') as sort_key, SUM(t.quantity) as v
       FROM inventory_transactions t
       WHERE t.type = 'out' ${invTxDateFilter}
       GROUP BY sort_key ORDER BY sort_key ASC`;

  // 5. Popular Styles — actual tattoo art styles from portfolio categories only
  // (appointment service_types like 'Consultation', 'Tattoo Session' are service categories, NOT styles)
  const styleQuery = `
    SELECT category as name, COUNT(*) as count 
    FROM portfolio_works 
    WHERE is_deleted = 0 AND category IS NOT NULL AND category != ''
    GROUP BY category
    ORDER BY count DESC 
    LIMIT 5
  `;

  // 6. Revenue Trend — actual revenue per timeframe interval
  const trendQuery = isDaily
    ? `SELECT 
         DATE_FORMAT(ap.appointment_date, '%b %d') as month,
         DATE(ap.appointment_date) as sort_key,
         COUNT(ap.id) as appointments,
         SUM(
           ((SELECT COALESCE(SUM(amount), 0) FROM payments p WHERE p.appointment_id = ap.id AND p.status = 'paid') / 100) + COALESCE(ap.manual_paid_amount, 0)
         ) as value
       FROM appointments ap
       WHERE ap.is_deleted = 0 AND ap.status != 'cancelled' ${apptDateFilter}
       GROUP BY month, sort_key
       ORDER BY sort_key`
    : `SELECT 
         DATE_FORMAT(ap.appointment_date, '%b') as month,
         DATE_FORMAT(ap.appointment_date, '%Y-%m') as sort_key,
         COUNT(ap.id) as appointments,
         SUM(
           ((SELECT COALESCE(SUM(amount), 0) FROM payments p WHERE p.appointment_id = ap.id AND p.status = 'paid') / 100) + COALESCE(ap.manual_paid_amount, 0)
         ) as value
       FROM appointments ap
       WHERE ap.is_deleted = 0 AND ap.status != 'cancelled' ${apptDateFilter}
       GROUP BY month, sort_key
       ORDER BY sort_key`;

  db.query(apptStatsQuery, (err, apptRes) => {
    if (err) return res.status(500).json({ success: false, message: err.message });
    const apptData = apptRes[0];
    const compCount = Number(apptData.completed) || 0;
    const cancCount = Number(apptData.cancelled) || 0;
    response.appointments = {
      total: Number(apptData.total) || 0,
      completed: compCount,
      scheduled: Number(apptData.scheduled) || 0,
      cancelled: cancCount,
      completionRate: (compCount + cancCount) > 0 ? Math.round((compCount / (compCount + cancCount)) * 100) : 0,
      avgDuration: apptData.avgDuration ? Math.round(Number(apptData.avgDuration)) : null
    };

    db.query(revenueBreakdownQuery, (err, revRes) => {
      if (err) return res.status(500).json({ success: false, message: err.message });
      const r = revRes[0];
      const apptRev = Number(r.appointment_revenue) || 0;
      const posRev = Number(r.pos_revenue) || 0;
      const svcRev = Number(r.service_invoice_revenue) || 0;
      response.revenue.total = apptRev + posRev + svcRev;
      response.revenue.breakdown = [
        { name: 'Appointments', value: apptRev },
        { name: 'POS Sales', value: posRev },
        { name: 'Service Invoices', value: svcRev }
      ].filter(b => b.value > 0);

      db.query(artistQuery, (err, artRes) => {
        if (err) return res.status(500).json({ success: false, message: err.message });
        response.artists = artRes;

        db.query(inventoryQuery, (err, invRes) => {
          if (err) return res.status(500).json({ success: false, message: err.message });
          response.inventory = invRes;

          db.query(inventoryTrendQuery, (err, trendInvRes) => {
            if (err) return res.status(500).json({ success: false, message: err.message });

            const buildTrendMap = (isDailyFormat) => {
              const map = {};
              const d = new Date(loopStart);
              while (d <= loopEnd) {
                if (isDailyFormat) {
                  const sortKey = d.toISOString().split('T')[0];
                  const label = d.toLocaleString('en-US', { month: 'short', day: 'numeric' });
                  map[sortKey] = { label, v: 0 };
                  d.setDate(d.getDate() + 1);
                } else {
                  const sortKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
                  const label = d.toLocaleString('en-US', { month: 'short', year: 'numeric' });
                  map[sortKey] = { label, v: 0 };
                  d.setMonth(d.getMonth() + 1);
                }
              }
              return map;
            };

            const inventoryTrendMap = buildTrendMap(isDaily);

            if (trendInvRes) {
              trendInvRes.forEach(t => {
                const sk = typeof t.sort_key === 'string' ? t.sort_key : new Date(t.sort_key).toISOString().split('T')[0];
                if (inventoryTrendMap[sk]) {
                  inventoryTrendMap[sk].v = Number(t.v) || 0;
                }
              });
            }
            response.inventory_trend = Object.values(inventoryTrendMap);

            // Expenses trend
            db.query(expensesTrendQuery, (err, expTrendRes) => {
              if (err) return res.status(500).json({ success: false, message: err.message });

              const expensesTrendMap = buildTrendMap(isDaily);

              if (expTrendRes) {
                expTrendRes.forEach(t => {
                  const sk = typeof t.sort_key === 'string' ? t.sort_key : new Date(t.sort_key).toISOString().split('T')[0];
                  if (expensesTrendMap[sk]) {
                    expensesTrendMap[sk].v = Number(t.v) || 0;
                  }
                });
              }

              // Convert to cumulative (rising line)
              const expTrendArr = Object.values(expensesTrendMap);
              let cumulative = 0;
              expTrendArr.forEach(pt => {
                cumulative += pt.v;
                pt.v = cumulative;
              });
              response.expenses_trend = expTrendArr;

              db.query(styleQuery, (err, styleRes) => {
                if (err) return res.status(500).json({ success: false, message: err.message });
                response.styles = styleRes;

                db.query(trendQuery, (err, trendRes) => {
                  if (err) return res.status(500).json({ success: false, message: err.message });
                  const chartDataMap = {};
                  const d = new Date(loopStart);
                  while (d <= loopEnd) {
                    if (isDaily) {
                      const sortKey = d.toISOString().split('T')[0];
                      const monthStr = d.toLocaleString('en-US', { month: 'short', day: 'numeric' });
                      chartDataMap[sortKey] = { month: monthStr, sort_key: sortKey, appointments: 0, value: 0 };
                      d.setDate(d.getDate() + 1);
                    } else {
                      const sortKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
                      const monthStr = d.toLocaleString('en-US', { month: 'short' });
                      chartDataMap[sortKey] = { month: monthStr, sort_key: sortKey, appointments: 0, value: 0 };
                      d.setMonth(d.getMonth() + 1);
                    }
                  }

                  // Merge actual DB data
                  trendRes.forEach(t => {
                    const sk = typeof t.sort_key === 'string' ? t.sort_key : new Date(t.sort_key).toISOString().split('T')[0];
                    if (chartDataMap[sk]) {
                      chartDataMap[sk] = {
                        month: t.month,
                        sort_key: sk,
                        appointments: t.appointments || 0,
                        value: Number(t.value) || 0
                      };
                    }
                  });

                  // Convert back to array and sort chronologically
                  response.revenue.chart = Object.values(chartDataMap)
                    .sort((a, b) => a.sort_key.localeCompare(b.sort_key))
                    .map(t => ({ month: t.month, appointments: t.appointments, value: t.value }));

                  db.query(expensesQuery, (err, expRes) => {
                    if (err) return res.status(500).json({ success: false, message: err.message });
                    const procurementTotal = Number(expRes[0].procurement_total) || 0;
                    const payoutsTotal = Number(expRes[0].payouts_total) || 0;

                    response.expenses = {
                      total: procurementTotal + payoutsTotal,
                      breakdown: [
                        { name: 'Inventory Procurements', value: procurementTotal },
                        { name: 'Artist Payouts', value: payoutsTotal }
                      ].filter(b => b.value > 0),
                      payouts_audit: [],
                      inventory_in_audit: []
                    };

                    db.query(overheadBreakdownQuery, (err, overheadRes) => {
                      if (!err) {
                        const overheadBreakdown = overheadRes.map(e => ({ name: e.category, value: Number(e.total) }));
                        const overheadTotal = overheadBreakdown.reduce((sum, e) => sum + e.value, 0);
                        response.overhead = { total: overheadTotal, breakdown: overheadBreakdown };
                      }

                      // Fetch audit logs for expenses
                      db.query(payoutsAuditQuery, (err, payoutsList) => {
                        if (!err) response.expenses.payouts_audit = payoutsList;

                        db.query(inventoryInAuditQuery, (err, invInList) => {
                          if (!err) response.expenses.inventory_in_audit = invInList;

                          // Chain additional audit queries
                          db.query(revenueAuditQuery, (err, revAudit) => {
                            if (!err) response.revenue_audit = revAudit;

                            db.query(appointmentsAuditQuery, (err, apptAudit) => {
                              if (!err) response.appointments_audit = apptAudit;

                              db.query(durationAuditQuery, (err, durAudit) => {
                                if (!err) response.duration_audit = durAudit;

                                db.query(inventoryOutAuditQuery, (err, invOutAudit) => {
                                  if (!err) response.inventory_out_audit = invOutAudit;

                                  db.query(userStatsQuery, (err, userStats) => {
                                    if (!err && userStats[0]) {
                                      response.users = {
                                        total: Number(userStats[0].total) || 0,
                                        artists: Number(userStats[0].artists) || 0,
                                        customers: Number(userStats[0].customers) || 0,
                                        admins: Number(userStats[0].admins) || 0
                                      };
                                    }

                                    db.query(usersAuditQuery, (err, usersAudit) => {
                                      if (!err) response.users_audit = usersAudit;

                                      // Attach overhead/manual expenses audit log to payload
                                      db.query('SELECT se.*, COALESCE(u.name, "System Admin") as created_by_name FROM studio_expenses se LEFT JOIN users u ON se.created_by = u.id ORDER BY se.created_at DESC LIMIT 50', (err, overheadAudit) => {
                                        if (!err) response.overhead.audit = overheadAudit;

                                        // Styles audit — individual portfolio works
                                        db.query(stylesAuditQuery, (err, stylesAudit) => {
                                          if (!err) response.styles_audit = stylesAudit;
                                          res.json({ success: true, data: response });
                                        });  // stylesAuditQuery
                                      });  // overheadAudit inline
                                    });  // usersAuditQuery
                                  });  // userStatsQuery
                                });  // inventoryOutAuditQuery
                              });  // durationAuditQuery
                            });  // appointmentsAuditQuery
                          });  // revenueAuditQuery
                        });  // inventoryInAuditQuery
                      });  // payoutsAuditQuery
                    });  // overheadBreakdownQuery
                  });  // expensesQuery
                });  // trendQuery
              });  // styleQuery
            });  // expensesTrendQuery
          });  // inventoryTrendQuery
        });  // inventoryQuery
      });  // artistQuery
    });  // revenueBreakdownQuery
  });  // apptStatsQuery
});

// Admin: Get All Studio Expenses (for audit modal)
app.get('/api/admin/expenses', (req, res) => {
  db.query('SELECT se.*, COALESCE(u.name, "System Admin") as created_by_name, COALESCE(u.user_type, "") as created_by_type FROM studio_expenses se LEFT JOIN users u ON se.created_by = u.id ORDER BY se.created_at DESC', (err, results) => {
    if (err) return res.status(500).json({ success: false, message: err.message });
    res.json({ success: true, data: results });
  });
});

// Admin: Create Studio Expense
app.post('/api/admin/expenses', (req, res) => {
  const { category, description, amount, userId } = req.body;
  if (!category || !amount) return res.status(400).json({ success: false, message: 'Category and amount are required.' });
  db.query('INSERT INTO studio_expenses (category, description, amount, created_by, created_at) VALUES (?, ?, ?, ?, ?)',
    [category, description || '', parseFloat(amount), userId || null, getLocalDatetime()], (err, result) => {
      if (err) return res.status(500).json({ success: false, message: err.message });
      logAction(userId || null, 'CREATE_MANUAL_EXPENSE', `Logged manual expense: ${category} - ₱${amount}`, req.ip);
      res.json({ success: true, message: 'Expense recorded', id: result.insertId });
    });
});

// Admin: Delete Studio Expense (only within 1 hour of creation)
app.delete('/api/admin/expenses/:id', (req, res) => {
  db.query('SELECT created_at FROM studio_expenses WHERE id = ?', [req.params.id], (err, rows) => {
    if (err) return res.status(500).json({ success: false, message: err.message });
    if (!rows || rows.length === 0) return res.status(404).json({ success: false, message: 'Expense not found.' });
    const createdAt = new Date(rows[0].created_at);
    const now = new Date();
    const diffMs = now - createdAt;
    const oneHourMs = 60 * 60 * 1000;
    if (diffMs > oneHourMs) {
      return res.status(403).json({ success: false, message: 'Cannot delete expenses older than 1 hour.' });
    }
    db.query('DELETE FROM studio_expenses WHERE id = ?', [req.params.id], (err) => {
      if (err) return res.status(500).json({ success: false, message: err.message });
      logAction(getAdminId(req), 'DELETE_MANUAL_EXPENSE', `Deleted manual expense ID ${req.params.id}`, req.ip);
      res.json({ success: true, message: 'Expense deleted' });
    });
  });
});

// Admin: Edit Studio Expense (only within 1 hour of creation)
app.put('/api/admin/expenses/:id', (req, res) => {
  const { category, description, amount } = req.body;
  if (!category || !amount) return res.status(400).json({ success: false, message: 'Category and amount are required.' });
  db.query('SELECT created_at FROM studio_expenses WHERE id = ?', [req.params.id], (err, rows) => {
    if (err) return res.status(500).json({ success: false, message: err.message });
    if (!rows || rows.length === 0) return res.status(404).json({ success: false, message: 'Expense not found.' });
    const createdAt = new Date(rows[0].created_at);
    const now = new Date();
    const diffMs = now - createdAt;
    const oneHourMs = 60 * 60 * 1000;
    if (diffMs > oneHourMs) {
      return res.status(403).json({ success: false, message: 'Cannot edit expenses older than 1 hour.' });
    }
    db.query('UPDATE studio_expenses SET category = ?, description = ?, amount = ? WHERE id = ?',
      [category, description || '', parseFloat(amount), req.params.id], (err) => {
        if (err) return res.status(500).json({ success: false, message: err.message });
        logAction(getAdminId(req), 'EDIT_MANUAL_EXPENSE', `Edited manual expense ID ${req.params.id}: ${category} - ₱${amount}`, req.ip);
        res.json({ success: true, message: 'Expense updated' });
      });
  });
});

// NOTE: GET /api/admin/invoices is handled earlier in this file (merged payments + invoices query)

// Admin: Create Invoice
app.post('/api/admin/invoices', (req, res) => {
  const { client, type, amount, discount_amount, discount_type, status, items } = req.body;
  const targetDiscount = discount_amount || 0;
  const itemsJson = items ? JSON.stringify(items) : null;

  // Generate sequential invoice number
  db.query('SELECT MAX(CAST(SUBSTRING(invoice_number, 5) AS UNSIGNED)) as maxNum FROM invoices WHERE invoice_number IS NOT NULL', (invNumErr, invNumRes) => {
    const nextNum = (invNumErr || !invNumRes[0]?.maxNum) ? 1 : invNumRes[0].maxNum + 1;
    const invoiceNumber = `INV-${String(nextNum).padStart(6, '0')}`;

    const query = 'INSERT INTO invoices (invoice_number, client_name, service_type, amount, discount_amount, discount_type, status, items, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)';
    db.query(query, [invoiceNumber, client, type, amount, targetDiscount, discount_type || null, status, itemsJson, getLocalDatetime()], (err, result) => {
      if (err) return res.status(500).json({ success: false, message: err.message });
      res.json({ success: true, message: 'Invoice created', id: result.insertId, invoiceNumber });
    });
  });
});

// Admin: Update Invoice
app.put('/api/admin/invoices/:id', (req, res) => {
  const { id } = req.params;
  const { client, type, amount, discount_amount, discount_type, status, items } = req.body;
  console.log(`[DEBUG] Updating invoice ${id}:`, req.body);
  const targetDiscount = discount_amount || 0;
  const itemsJson = items ? JSON.stringify(items) : null;
  const query = 'UPDATE invoices SET client_name = ?, service_type = ?, amount = ?, discount_amount = ?, discount_type = ?, status = ?, items = ? WHERE id = ?';
  db.query(query, [client, type, amount, targetDiscount, discount_type || null, status, itemsJson, id], (err) => {
    if (err) {
      console.error(`[DEBUG] Update error:`, err);
      return res.status(500).json({ success: false, message: err.message });
    }
    res.json({ success: true, message: 'Invoice updated' });
  });
});

// Admin: Delete Invoice
app.delete('/api/admin/invoices/:id', (req, res) => {
  const { id } = req.params;
  console.log(`[DEBUG] Deleting invoice ${id}`);
  db.query('DELETE FROM invoices WHERE id = ?', [id], (err) => {
    if (err) {
      console.error(`[DEBUG] Delete error:`, err);
      return res.status(500).json({ success: false, message: err.message });
    }
    res.json({ success: true, message: 'Invoice deleted' });
  });
});

// Admin: Get Settings (All)
app.get('/api/admin/settings', (req, res) => {
  db.query('SELECT * FROM app_settings', (err, results) => {
    if (err) return res.status(500).json({ success: false, message: err.message });

    // Convert array of rows to object { section: data }
    const settings = {};
    results.forEach(row => {
      try {
        settings[row.section] = typeof row.data === 'string' ? JSON.parse(row.data) : row.data;
      } catch (e) {
        settings[row.section] = row.data;
      }
    });
    res.json({ success: true, data: settings });
  });
});

// Admin: Save Settings (Upsert) — supports both {section, data} and flat key-value pairs
app.post('/api/admin/settings', (req, res) => {
  const body = req.body;
  const adminId = getAdminId(req);

  // Flat key-value mode (mobile): map known keys to their app_settings sections
  if (!body.section) {
    const tasks = [];

    // gallery_categories → gallery section
    if (body.gallery_categories !== undefined) {
      const galleryData = JSON.stringify({ categories: body.gallery_categories });
      tasks.push(new Promise((resolve, reject) => {
        db.query('INSERT INTO app_settings (section, data) VALUES (?, ?) ON DUPLICATE KEY UPDATE data = ?',
          ['gallery', galleryData, galleryData], (err) => err ? reject(err) : resolve());
      }));
    }

    // General toggles → general section (merge with existing)
    const generalKeys = ['allowGuests', 'maintenance_mode', 'push_notifications', 'studio_name'];
    const generalUpdates = {};
    generalKeys.forEach(k => { if (body[k] !== undefined) generalUpdates[k] = body[k]; });

    if (Object.keys(generalUpdates).length > 0) {
      tasks.push(new Promise((resolve, reject) => {
        db.query('SELECT data FROM app_settings WHERE section = ?', ['general'], (err, rows) => {
          if (err) return reject(err);
          let existing = {};
          try { existing = rows.length ? JSON.parse(rows[0].data) : {}; } catch (e) {}
          const merged = { ...existing, ...generalUpdates };
          const jsonData = JSON.stringify(merged);
          db.query('INSERT INTO app_settings (section, data) VALUES (?, ?) ON DUPLICATE KEY UPDATE data = ?',
            ['general', jsonData, jsonData], (e2) => e2 ? reject(e2) : resolve());
        });
      }));
    }

    // business_hours / policies / templates → direct section saves
    ['business_hours', 'terms_of_service', 'cancellation_policy', 'reminder_template'].forEach(key => {
      if (body[key] !== undefined) {
        const sectionName = key;
        const jsonData = JSON.stringify(body[key]);
        tasks.push(new Promise((resolve, reject) => {
          db.query('INSERT INTO app_settings (section, data) VALUES (?, ?) ON DUPLICATE KEY UPDATE data = ?',
            [sectionName, jsonData, jsonData], (err) => err ? reject(err) : resolve());
        }));
      }
    });

    Promise.all(tasks)
      .then(() => {
        logAction(adminId, 'UPDATE_SETTINGS', 'Settings updated via mobile', req.ip);
        res.json({ success: true, message: 'Settings saved' });
      })
      .catch(err => res.status(500).json({ success: false, message: err.message }));
    return;
  }

  // Legacy {section, data} format (web portal)
  const { section, data } = body;
  const jsonData = JSON.stringify(data);
  const query = 'INSERT INTO app_settings (section, data) VALUES (?, ?) ON DUPLICATE KEY UPDATE data = ?';
  db.query(query, [section, jsonData, jsonData], (err) => {
    if (err) return res.status(500).json({ success: false, message: err.message });
    res.json({ success: true, message: 'Settings saved' });
  });
});


// Manager: Dashboard Stats
app.get('/api/manager/dashboard', (req, res) => {
  // Reusing admin logic for now, but could be scoped
  const query = `
    SELECT 
      (SELECT COUNT(*) FROM users WHERE user_type='artist' AND is_deleted = 0) as totalArtists,
      (SELECT COUNT(*) FROM appointments WHERE is_deleted = 0) as totalAppointments,
      (SELECT SUM(hourly_rate) FROM artists) as estimatedRevenue
  `;
  db.query(query, (err, results) => {
    if (err) return res.status(500).json({ success: false, message: err.message });
    res.json({ success: true, stats: results[0] });
  });
});

// GET invoice by invoice_number (for customer view)
app.get('/api/invoices/by-number/:invoiceNumber', (req, res) => {
  const { invoiceNumber } = req.params;
  db.query('SELECT * FROM invoices WHERE invoice_number = ?', [invoiceNumber], (err, results) => {
    if (err) return res.status(500).json({ success: false, message: 'Database error' });
    if (!results.length) return res.status(404).json({ success: false, message: 'Invoice not found' });
    res.json({ success: true, data: results[0] });
  });
});

// Send POS Invoice to Customer (Creates Notification)
app.post('/api/admin/send-pos-invoice', async (req, res) => {
  const { orderId, items, total, date, customerId } = req.body;

  try {
    // Basic validation
    if (!orderId || !items || !Array.isArray(items) || !total || !date || !customerId) {
      return res.status(400).json({ success: false, message: 'Invalid data or customer ID missing' });
    }

    // Construct invoice message
    let invoiceMessage = `Thank you for your purchase! Here's your invoice:\n\n`;
    invoiceMessage += `Order ID: #${orderId}\n`;
    invoiceMessage += `Date: ${date}\n\n`;
    invoiceMessage += "Items:\n";
    items.forEach(item => {
      invoiceMessage += `- ${item.quantity}x ${item.name} - ₱${((item.retail_price || item.cost) * item.quantity).toLocaleString()}\n`;
    });
    invoiceMessage += `\nTotal: ₱${total.toLocaleString()}\n\n`;
    invoiceMessage += "Thank you for shopping with InkVistAR Studio!";

    // Add download Link
    const fileUrl = `${FRONTEND_URL}/api/invoices/${orderId}`;

    // Create notification for the customer
    createNotification(
      customerId,
      'New Invoice',
      invoiceMessage,
      'pos_invoice',
      orderId
    );

    res.json({ success: true, message: 'Invoice notification sent to customer' });
  } catch (err) {
    console.error('Failed to send POS invoice notification', err);
    res.status(500).json({ success: false, message: 'Failed to send notification' });
  }
});

// Serve Invoices to the app. 
// TODO: Secure this by validating user, IP and orderId.
app.get('/api/invoices/:orderId', (req, res) => {
  const { orderId } = req.params;

  // Security check
  console.log(`[INFO] Invoice requested (UNSECURED): Order #${orderId}`);

  // Mock Data (TODO: Pull real data from DB)
  const mockInvoice = `
    <center><h2>InkVistAR Invoice #${orderId}</h2><p>This is just a MOCK invoice.</p></center>
    <p>Contact InkVistAR if there are any discrepancies.  This service is currently in development.</p>
  `;

  res.setHeader('Content-Type', 'text/html');
  res.send(`
    <html style="font-family: sans-serif; padding: 20px;"><body>${mockInvoice}</body></html>
  `);
});


// Helper: Simple Rule-based Chatbot (Fallback)
function getFallbackResponse(message) {
  const msg = message.toLowerCase();
  // Use word-boundary regex to avoid matching short keywords inside longer words
  // e.g. 'hi' inside 'chicken', 'where' inside 'elsewhere', 'ask' inside 'task'
  const has = (words) => words.some(w => new RegExp(`\\b${w}\\b`).test(msg));

  if (has(['price', 'cost', 'rate', 'charge', 'fee', 'quote', 'estimate', 'pricing', 'how much', 'price range'])) {
    return "To help you plan for your upcoming session, here is a general guide to our starting rates for large-scale work. Please keep in mind that these are baseline estimates; your final quote will be tailored during your consultation based on the exact design, size, and technical complexity of the piece.\n\n1. 5-Panel Piece: 40k\n2. Full Sleeve (Left/Right): 200k\n3. Full Back: 350k\n4. Full Leg: 350k";
  }
  if (has(['book', 'appointment', 'schedule', 'consultation', 'session', 'reserve'])) {
    return "You can book an appointment by going to the 'Book Consultation' tab on our landing page and go from there or you can log in to your account and book from there as well!";
  }
  if (has(['location', 'address', 'located', 'directions', 'nearby', 'proximity', 'how to get there', 'find you', 'close to', 'near'])) {
    return "We are located at the Ground Floor, W Tower, 32nd Street, corner 9th Ave, Taguig, 1634 Metro Manila, Philippines. Located near the 1000th Jollibee branch.";
  }
  if (has(['style', 'design', 'tattoo ideas', 'portfolio', 'artwork', 'gallery', 'inspiration', 'examples'])) {
    return "We specialize in any tattoo design you desire. From traditional to modern, we can bring your vision to life. Check out our 'Portfolio' on our landing page to see examples of our work!";
  }
  if (has(['hello', 'hi', 'hey', 'help', 'support', 'assist', 'inquire', 'greet', 'sup', 'yo', 'what\'s up', 'how are you', 'good morning', 'good afternoon', 'good evening'])) {
    return "Hi there! I'm InkVistAR's assistant. How can I help you today?";
  }
  if (has(['aftercare', 'after care', 'heal', 'healing', 'clean', 'peeling', 'moisturize', 'ointment', 'wash', 'tattoo care'])) {
    return "Keep your fresh ink clean, moisturized, and healing perfectly by following these daily steps:\n\n1. Unwrap: Remove the plastic wrap exactly 3 hours after your session.\n2. Wash Gently: Clean the area using warm water and a mild liquid soap, like Dove or Cetaphil.\n3. Pat Dry: Use only a clean paper towel or tissue to avoid bacteria or fuzz from bath towels.\n4. Apply Ointment: Wash your hands, then apply a very thin layer of tattoo aftercare ointment.\n5. Repeat Daily: Do this routine 2 to 3 times a day for 7 to 10 days until the peeling stops.\n6. Switch to Lotion: Once completely peeled, switch to a daily moisturizer to keep it vibrant.";
  }
  return "I'm not sure about that one. For specific questions, please contact us directly or visit the studio. We'd love to help!";
}


// ========== AR FEATURES ==========
app.get('/api/ar/config', (req, res) => {
  console.log('[INFO] AR Config requested');
  res.json({
    success: true,
    config: {
      mode: 'marker_tracking', // 'marker_tracking' vs 'surface_tracking'
      marker_type: 'square_smiley', // The "smiley thingy" InkHunter style
      instructions: 'Draw a square smiley face [ : ) ] on your skin to anchor the design.',
      demo_design_url: 'https://via.placeholder.com/400x400.png?text=Demo+Tattoo',
      marker_guide_image: 'https://via.placeholder.com/200x200.png?text=Draw+This'
    }
  });
});

// ========== RESEND VERIFICATION ENDPOINT ==========
app.post('/api/resend-verification', (req, res) => {
  const { email } = req.body;
  console.log('[INFO] Resend verification requested for:', email);

  if (!email) return res.status(400).json({ success: false, message: 'Email required' });

  db.query('SELECT * FROM users WHERE email = ?', [email], (err, results) => {
    if (err || results.length === 0) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    const user = results[0];
    if (user.is_verified) {
      return res.status(400).json({ success: false, message: 'Account already verified. Please login.' });
    }

    // Generate new token
    const verification_token = crypto.randomBytes(32).toString('hex');

    db.query('UPDATE users SET verification_token = ? WHERE id = ?', [verification_token, user.id], (updateErr) => {
      if (updateErr) return res.status(500).json({ success: false, message: 'Database error' });

      // Send Email
      const protocol = getProtocol(req);
      const host = req.get('host');
      const verifyUrl = `${protocol}://${host}/api/verify?token=${verification_token}&email=${email}`;

      console.log('[DEBUG] NEW Verification Link:', verifyUrl);

      const html = buildEmailHtml(`
              <h2 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#C19A6B;text-align:center;">Verify Your Account</h2>
              <p style="margin:0 0 20px;font-size:13px;color:#64748b;text-align:center;">Verification link resent</p>
              <p style="margin:0 0 16px;">A new verification link was requested for your InkVistAR account. Click the button below to verify your email and activate your account.</p>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td align="center">
                <a href="${verifyUrl}" style="display:inline-block;padding:14px 36px;background:linear-gradient(135deg,#C19A6B,#8a6c4a);color:#000;font-size:14px;font-weight:700;text-decoration:none;border-radius:8px;letter-spacing:1px;text-transform:uppercase;">Verify Account</a>
              </td></tr></table>
              <p style="margin:24px 0 0;font-size:12px;color:#555;text-align:center;word-break:break-all;">Or copy this link: <a href="${verifyUrl}" style="color:#C19A6B;text-decoration:none;">${verifyUrl}</a></p>
      `);
      sendEmail(email, 'Resend: Verify Your InkVistAR Account', html);

      res.json({ success: true, message: 'Verification link resent! Check your email. (Debug: Check console for link if email fails)' });
    });
  });
});

// ========== CHAT ABUSE REPORT ENDPOINT ==========
app.post('/api/chat/report-abuse', (req, res) => {
  const { customerId, userName, strikes } = req.body;
  console.log(`[WARN] Chat abuse report: Customer ${customerId} (${userName}) - ${strikes} profanity strikes`);

  if (!customerId) {
    return res.status(400).json({ success: false, message: 'Customer ID required' });
  }

  // Notify all admins and managers about the abuse
  db.query('SELECT id FROM users WHERE user_type IN (?, ?) AND is_deleted = 0', ['admin', 'manager'], (err, admins) => {
    if (err) {
      console.error('Error fetching admins for abuse report:', err);
      return res.status(500).json({ success: false, message: 'Server error' });
    }

    const abuseMessage = `Chat Abuse Alert: Customer "${userName || 'Unknown'}" (ID: ${customerId}) has triggered the profanity filter ${strikes} time(s). Review this account in User Management and consider deactivation if behavior persists.`;

    admins.forEach(admin => {
      createNotification(admin.id, 'Chat Abuse Report', abuseMessage, 'system_alert', null);
    });

    // Log the abuse event
    logAction(customerId, 'CHAT_ABUSE', `Profanity filter triggered ${strikes} times by customer ${customerId} (${userName})`, null);

    res.json({ success: true, message: 'Abuse report submitted' });
  });
});

// ========== CHATBOT ENDPOINT ==========
app.post('/api/chat', async (req, res) => {
  const { message } = req.body;
  console.log('[INFO] Chat message received:', message);

  if (!message) {
    return res.status(400).json({ success: false, message: 'Message required' });
  }

  // Try Groq if key exists AND client was successfully initialized
  if (GROQ_API_KEY && groq) {
    // Promise wrapper for callback-based db.query
    const queryAsync = (sql, params = []) => new Promise((resolve, reject) => {
      db.query(sql, params, (err, results) => err ? reject(err) : resolve(results));
    });

    try {
      // Run parallel queries: studio settings + active artist roster
      const [settingsRows, artistRows] = await Promise.all([
        queryAsync('SELECT * FROM app_settings'),
        queryAsync(`
          SELECT u.name,
                 COALESCE(a.specialization, 'General') as specialization,
                 COALESCE(a.experience_years, 0) as experience_years,
                 COALESCE(a.rating, 0) as rating,
                 COALESCE(a.total_reviews, 0) as total_reviews,
                 COALESCE(a.hourly_rate, 0) as hourly_rate
          FROM users u
          LEFT JOIN artists a ON u.id = a.user_id
          WHERE u.user_type = 'artist' AND u.is_deleted = 0
          ORDER BY a.rating DESC
        `)
      ]);

      // Parse app_settings rows into a keyed object
      const settings = {};
      settingsRows.forEach(row => {
        try {
          settings[row.section] = typeof row.data === 'string' ? JSON.parse(row.data) : row.data;
        } catch (e) { settings[row.section] = row.data; }
      });

      const studio = settings.studio || {};
      const billing = settings.billing || {};
      const care = settings.care || {};
      const policies = settings.policies || {};
      // Admin-overridable chatbot config (add a "chatbot" section in Admin Settings to customize)
      const botConfig = settings.chatbot || {};

      // ── Build dynamic artist roster from DB ──
      const artistRoster = artistRows.length > 0
        ? artistRows.map(a => {
            let line = `  - ${a.name}: ${a.specialization}`;
            if (a.experience_years > 0) line += ` | ${a.experience_years} yrs experience`;
            if (a.rating > 0) line += ` | Rating: ${Number(a.rating).toFixed(1)}/5`;
            if (a.total_reviews > 0) line += ` (${a.total_reviews} reviews)`;
            return line;
          }).join('\n')
        : '  - Artist roster is currently being updated. Please contact the studio for details.';

      // ── Build pricing section (admin can override via settings.chatbot.pricing) ──
      const pricingGuide = botConfig.pricing || `Pricing is case-to-case depending on size, placement, and design complexity:
  - Small tattoos (wrist, finger, behind ear): Starts at around P2,000 - P5,000
  - Medium tattoos (forearm, calf, shoulder): Around P5,000 - P15,000
  - Large tattoos (half sleeve, thigh piece): P15,000 and above
  - Per panel (sleeve segment): Approximately P40,000 - P50,000 depending on detail
  - Full sleeve (left or right arm): Approximately P200,000 - P250,000
  - Full back piece: Approximately P350,000 - P400,000
  - Full leg piece: Approximately P350,000 - P400,000
  - Final price is ALWAYS confirmed after a consultation with the assigned artist.
  - These are estimates only. Never guarantee exact pricing — always recommend a consultation.`;

      // ── Build services section (admin can override via settings.chatbot.services) ──
      const servicesOffered = botConfig.services || `Services offered:
  - Tattoo (all styles, all sizes — from small symbols to full body suits)
  - Piercing
  - Free Consultation (walk-in or by appointment)`;

      // ── Aftercare section ──
      const aftercareInstructions = care.instructions || `After your session:
  1. Remove the wrap after 3 hours.
  2. Gently wash with mild liquid soap (Dove, Cetaphil) and warm water.
  3. Pat dry with a clean paper towel — never use bath towels.
  4. Apply a very thin layer of tattoo aftercare ointment.
  5. Repeat this routine 2-3 times daily for 7-10 days until peeling stops.
  6. Once fully peeled, switch to a daily unscented moisturizer to keep it vibrant.
  7. Avoid swimming, direct sunlight, and picking at the tattoo for at least 2 weeks.`;

      // ── Assemble the full system prompt ──
      const systemPrompt = `You are the AI assistant for "${studio.name || 'InkVictus Tattoo Studio'}". You represent the studio in a warm, professional, and knowledgeable manner. Customers come to you with questions about tattoos, pricing, artist recommendations, booking, aftercare, and general studio information.

=== PERSONALITY & TONE ===
- Be warm, conversational, and confident — like a friendly studio receptionist who genuinely loves tattoos and knows everything about the shop.
- Keep responses concise: 2-4 short paragraphs maximum. Do not write essays or walls of text.
- Use a casual-professional tone. Avoid overly formal or robotic language.
- Show enthusiasm when discussing tattoo styles, designs, or artist work.
- IMPORTANT: Always end every response with a relevant follow-up question to keep the conversation flowing and help narrow down what the customer needs (e.g., preferred style, placement, budget, preferred artist).

=== STUDIO INFORMATION ===
- Studio Name: ${studio.name || 'InkVictus Tattoo Studio'}
- About: ${studio.description || 'A premium tattoo studio delivering world-class ink artistry in a clean, professional environment.'}
- Location: ${studio.address || 'BGC, Taguig City, Metro Manila, Philippines'}
- Contact: ${studio.phone || 'Available through the app and social media'}
- Walk-in Hours: ${studio.openingTime || '1:00 PM'} to ${studio.closingTime || '10:00 PM'} daily
- Appointments: Available 24/7 through the online booking system

=== ${servicesOffered} ===

=== ARTIST ROSTER & SPECIALIZATIONS ===
Each artist has unique strengths. When a customer asks "who is good at [style]?", recommend the best match from this roster:
${artistRoster}

Important artist rules:
- Not every artist can do every style. Match the customer's design to the right specialist.
- If the preferred artist is unavailable, suggest an alternative artist with similar skills.
- Artist assignment ultimately depends on design compatibility and schedule availability.
- Never claim an artist can do a style they are not listed for.

=== PRICING GUIDE ===
${pricingGuide}
- Base hourly rate: approximately P${Number(billing.baseRate || 150).toLocaleString()}/hr (varies by artist and complexity).

=== BOOKING PROCESS ===
1. Customer inquires about a design idea (via chat, app, or walk-in).
2. A consultation is scheduled to discuss design, size, placement, and pricing.
3. The artist creates the design and revises it until the customer fully approves.
4. Booking is confirmed once the customer pays a downpayment.
5. The tattoo session is scheduled based on artist availability.
- How to book: Use the "Book Consultation" button on the website or app, or walk in during studio hours.

=== APPOINTMENT RULES ===
- A downpayment is required to confirm any booking — no exceptions.
- ${policies.deposit || 'Deposit amount varies based on tattoo size and is non-refundable for no-shows.'}
- ${policies.cancellation || 'Only one (1) reschedule is allowed per appointment. Late cancellations may forfeit the deposit.'}
- Walk-ins are accepted for small tattoos only, subject to artist availability.
- Rescheduling depends on both artist and customer availability.

=== TATTOO SESSIONS ===
- Session length depends on the design: small pieces take 1-3 hours, large pieces can take 6-12+ hours.
- Very large tattoos (full sleeve, full back) typically require multiple sessions across different days.
- If a session runs very long, it can be continued the next available day.
- Customers should eat a good meal and stay hydrated before their session.
- Some sessions for major pieces can last up to 12-18 hours total (split across days).

=== PAYMENT ===
- Downpayment secures the booking; remaining balance is due before or during the session.
- Payment structure (per-session or full) is agreed upon during consultation.
- Accepted methods: Cash, GCash, bank transfer, or online payment via the app.

=== AFTERCARE ===
${aftercareInstructions}

=== LIMITATIONS & POLICIES ===
- Some sensitive body areas may not be tattooed — this is at the artist's and studio's discretion.
- The studio reserves the right to decline requests that conflict with professional or ethical standards.
- Customers must be 18 years old or above (valid government ID required).
- Tattoo materials (needles, ink, gloves, supplies) are all disposable and single-use per session for hygiene.

=== RULES YOU MUST FOLLOW ===
- NEVER provide medical advice beyond basic aftercare guidance.
- NEVER guarantee exact prices — always say "estimated", "starts at", or "around" and recommend a consultation.
- NEVER claim an artist can do a style outside their listed specialization.
- NEVER share personal information about artists or other customers.
- NEVER use emojis in your responses.
- NEVER make up information you do not have — suggest contacting the studio at ${studio.phone || 'the studio directly'} instead.
- If asked something completely unrelated to tattoos or the studio, politely redirect the conversation back to how you can help with tattoo-related inquiries.

${botConfig.extraInstructions ? '=== ADDITIONAL INSTRUCTIONS ===\n' + botConfig.extraInstructions : ''}`.trim();

      const chatCompletion = await groq.chat.completions.create({
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: message }
        ],
        model: 'llama-3.3-70b-versatile',
        temperature: 0.7,
        max_tokens: 500,
      });

      const response = chatCompletion.choices[0].message.content;
      console.log('[OK] Groq responded successfully.');
      return res.json({ success: true, response });
    } catch (error) {
      const errStatus = error?.status || error?.statusCode || 'unknown';
      const errType = error?.error?.type || error?.code || error?.message || 'unknown';
      console.error(`[ERROR] Groq API failed — HTTP ${errStatus} | type: ${errType}. Falling back to rule-based responses.`);
      const fallback = getFallbackResponse(message);
      return res.json({ success: true, response: fallback });
    }
  } else {
    // Fallback if no Groq API key is configured or client failed to init
    if (GROQ_API_KEY && !groq) {
      console.warn('[WARN] GROQ_API_KEY is set but groq client is null — client failed to initialize. Using fallback.');
    } else {
      console.warn('[WARN] No GROQ_API_KEY set. Using fallback responses.');
    }
    const fallback = getFallbackResponse(message);
    return res.json({ success: true, response: fallback });
  }
});

console.log('[OK] Chatbot endpoint (/api/chat) is registered.');

// ========== EMERGENCY LOGIN (ALWAYS WORKS) ==========
app.post('/api/emergency-login', (req, res) => {
  console.log('[WARN] Emergency login called:', req.body);

  const { email, type } = req.body;

  res.json({
    success: true,
    user: {
      id: type === 'artist' ? 1 : (type === 'admin' ? 999 : 4),
      name: type === 'artist' ? 'Mike Chen' : (type === 'admin' ? 'System Admin' : 'John Smith'),
      email: email || 'test@email.com',
      type: type
    },
    message: 'Emergency login successful (bypassing database)'
  });
});



// ========== SOCKET.IO REAL-TIME CHAT ==========
const activeSupportSessions = {};
const activeSessionPeers = {}; // Dual-artist session sync: { 'session_123': { socketId: { artistId, artistName } } }

io.on('connection', (socket) => {
  console.log('[OK] A user connected to chat:', socket.id);

  // Join a room based on a unique identifier
  socket.on('join_room', (room) => {
    socket.join(room);
    console.log(`User ${socket.id} joined room: ${room}`);
  });

  // ═══════════ DUAL-ARTIST SESSION SYNC ═══════════
  // Tracks which artists are actively viewing each session modal
  socket.on('join_session', (data) => {
    const { appointmentId, artistId, artistName } = data || {};
    if (!appointmentId) return;
    const room = `session_${appointmentId}`;
    socket.join(room);
    // Store artist info on the socket for cleanup on disconnect
    socket.sessionRoom = room;
    socket.sessionArtist = { artistId, artistName };

    // Track peers per room
    if (!activeSessionPeers[room]) activeSessionPeers[room] = {};
    activeSessionPeers[room][socket.id] = { artistId, artistName };

    // Notify existing peers in the room that a new artist joined
    socket.to(room).emit('peer_joined', { artistId, artistName });

    // Send existing peers to the joiner (so they know who's already there)
    const existingPeers = Object.values(activeSessionPeers[room]).filter(p => p.artistId !== artistId);
    if (existingPeers.length > 0) {
      socket.emit('peer_joined', existingPeers[0]); // There's at most one other artist in dual-artist
    }
    console.log(`[Session Sync] Artist ${artistName} (${artistId}) joined ${room}`);
  });

  socket.on('leave_session', (data) => {
    const { appointmentId } = data || {};
    if (!appointmentId) return;
    const room = `session_${appointmentId}`;
    const artist = socket.sessionArtist || {};
    socket.leave(room);

    // Cleanup peer tracking
    if (activeSessionPeers[room]) {
      delete activeSessionPeers[room][socket.id];
      if (Object.keys(activeSessionPeers[room]).length === 0) delete activeSessionPeers[room];
    }

    // Notify remaining peers
    socket.to(room).emit('peer_left', { artistId: artist.artistId, artistName: artist.artistName });
    socket.sessionRoom = null;
    socket.sessionArtist = null;
    console.log(`[Session Sync] Artist ${artist.artistName || 'unknown'} left ${room}`);
  });

  // Broadcast session updates (notes, photos, status, materials, timer) to the partner
  socket.on('session_update', (payload) => {
    const { appointmentId } = payload || {};
    if (!appointmentId) return;
    const room = `session_${appointmentId}`;
    // Broadcast to all OTHER sockets in the room (excludes sender)
    socket.to(room).emit('session_update', payload);
  });

  // ═══════════ END DUAL-ARTIST SESSION SYNC ═══════════

  // Customer initiates a live support session
  socket.on('start_support_session', (data) => {
    const { room, name } = data;
    if (!activeSupportSessions[room]) {
      activeSupportSessions[room] = {
        id: room,
        name: name || 'Guest Visitor',
        lastMessage: 'Started a live chat.',
        timestamp: new Date(),
        messages: []
      };

      // Broadcast new session to all admins listening to 'admin_room'
      io.to('admin_room').emit('support_sessions_update', Object.values(activeSupportSessions));

      // Push Notification to all Admins
      db.query('SELECT id FROM users WHERE user_type IN (?, ?)', ['admin', 'manager'], (err, admins) => {
        if (!err && admins.length > 0) {
          admins.forEach(admin => {
            createNotification(admin.id, 'New Support Live Chat', `${name || 'A customer'} started a new support session.`, 'support_session', null);
          });
        }
      });
    }
  });

  // Admin joins the global admin tracking room to get session lists
  socket.on('join_admin_tracking', () => {
    socket.join('admin_room');
    // Instantly send current sessions to the newly connected admin
    socket.emit('support_sessions_update', Object.values(activeSupportSessions));
  });

  // Listen for new messages
  socket.on('send_message', (data) => {
    console.log('Message received:', data);

    const msgId = Date.now() + '_' + Math.random().toString(36).substr(2, 6);

    // Save message memory to active sessions log
    if (activeSupportSessions[data.room]) {
      activeSupportSessions[data.room].messages.push({
        id: msgId,
        sender: data.sender,
        text: data.text,
        timestamp: new Date(),
        read: false
      });
      activeSupportSessions[data.room].lastMessage = data.text;
      activeSupportSessions[data.room].timestamp = new Date();

      // Persist to database
      db.query('INSERT INTO support_messages (room_id, sender, message) VALUES (?, ?, ?)', [data.room, data.sender, data.text], (err) => {
        if (err) console.error('Error saving chat message:', err);
      });

      // Broadcast the fresh stats to all admins
      io.to('admin_room').emit('support_sessions_update', Object.values(activeSupportSessions));

      // Push Notification Logic for Chat
      // Case A: Support (Admin/Artist) replies to Customer in customer_{id} room
      const customerRoomMatch = data.room.match(/^customer_(\d+)$/);
      const isFromSupport = data.sender.toLowerCase().includes('admin') ||
        data.sender.toLowerCase().includes('artist') ||
        data.sender.toLowerCase().includes('agent') ||
        data.sender.toLowerCase().includes('staff');

      if (customerRoomMatch && isFromSupport) {
        const customerId = customerRoomMatch[1];
        createNotification(
          customerId,
          'New Support Message',
          `Support: ${data.text.substring(0, 50)}${data.text.length > 50 ? '...' : ''}`,
          'chat_message',
          null
        );
      }
      // Case B: Customer sends message to Support - notify admins
      else if (customerRoomMatch && !isFromSupport) {
        db.query('SELECT id FROM users WHERE user_type IN (?, ?)', ['admin', 'manager'], (err, admins) => {
          if (!err && admins.length > 0) {
            admins.forEach(admin => {
              createNotification(admin.id, 'New Message from Client', `${data.sender}: ${data.text.substring(0, 50)}`, 'chat_message', null);
            });
          }
        });
      }
    }

    // Broadcast the message to the other user in the room (include msgId)
    socket.to(data.room).emit('receive_message', { ...data, id: msgId });
  });

  // Mark messages as read
  socket.on('mark_read', (data) => {
    const { room, reader } = data;
    if (activeSupportSessions[room]) {
      let changed = false;
      activeSupportSessions[room].messages.forEach(msg => {
        if (msg.sender !== reader && !msg.read) {
          msg.read = true;
          changed = true;
        }
      });
      if (changed) {
        // Notify everyone in the room that messages were read
        io.to(room).emit('messages_read', { room, reader });
      }
    }
  });

  // End support session (from either customer or admin)
  socket.on('end_support_session', (room) => {
    if (activeSupportSessions[room]) {
      delete activeSupportSessions[room];
      // Tell the room it was closed
      io.to(room).emit('session_closed');
      // Tell the admins
      io.to('admin_room').emit('support_sessions_update', Object.values(activeSupportSessions));
    }
  });

  // Handle disconnection (merged: dual-artist session cleanup + general logging)
  socket.on('disconnect', () => {
    // Dual-artist session peer cleanup
    if (socket.sessionRoom && activeSessionPeers[socket.sessionRoom]) {
      const artist = socket.sessionArtist || {};
      delete activeSessionPeers[socket.sessionRoom][socket.id];
      if (Object.keys(activeSessionPeers[socket.sessionRoom]).length === 0) {
        delete activeSessionPeers[socket.sessionRoom];
      }
      socket.to(socket.sessionRoom).emit('peer_left', { artistId: artist.artistId, artistName: artist.artistName });
      console.log(`[Session Sync] Artist ${artist.artistName || socket.id} disconnected from ${socket.sessionRoom}`);
    }
    console.log('[INFO] User disconnected:', socket.id);
  });
});

// ========== TESTIMONIALS API ==========

// GET /api/testimonials (Public, fetch active testimonials)
app.get('/api/testimonials', (req, res) => {
  const query = `
    SELECT r.id, r.rating, r.comment as content, u.name as customer_name, 'none' as media_type
    FROM reviews r
    JOIN users u ON r.customer_id = u.id
    WHERE r.is_showcased = 1 AND r.status = 'approved'
    ORDER BY r.created_at DESC
  `;
  db.query(query, (err, results) => {
    if (err) {
      console.error('Error fetching testimonials:', err);
      return res.status(500).json({ success: false, message: 'Server error' });
    }
    res.json({ success: true, testimonials: results });
  });
});

// GET /api/admin/testimonials (Admin, fetch all)
app.get('/api/admin/testimonials', (req, res) => {
  const query = 'SELECT * FROM testimonials ORDER BY created_at DESC';
  db.query(query, (err, results) => {
    if (err) {
      console.error('Error fetching testimonials:', err);
      return res.status(500).json({ success: false, message: 'Server error' });
    }
    res.json({ success: true, testimonials: results });
  });
});

// POST /api/admin/testimonials
app.post('/api/admin/testimonials', (req, res) => {
  const { customer_name, content, rating, media_url, media_type, is_active } = req.body;
  if (!customer_name) {
    return res.status(400).json({ success: false, message: 'Customer name is required' });
  }

  const query = 'INSERT INTO testimonials (customer_name, content, rating, media_url, media_type, is_active) VALUES (?, ?, ?, ?, ?, ?)';
  db.query(query, [customer_name, content || '', rating || 5, media_url || '', media_type || 'none', is_active !== undefined ? is_active : 1], (err, result) => {
    if (err) {
      console.error('Error creating testimonial:', err);
      return res.status(500).json({ success: false, message: 'Server error adding testimonial' });
    }
    res.json({ success: true, message: 'Testimonial added successfully', id: result.insertId });
  });
});

// PUT /api/admin/testimonials/:id
app.put('/api/admin/testimonials/:id', (req, res) => {
  const { id } = req.params;
  const { customer_name, content, rating, media_url, media_type, is_active } = req.body;

  const query = 'UPDATE testimonials SET customer_name = ?, content = ?, rating = ?, media_url = ?, media_type = ?, is_active = ? WHERE id = ?';
  db.query(query, [customer_name, content, rating, media_url, media_type, is_active, id], (err, result) => {
    if (err) {
      console.error('Error updating testimonial:', err);
      return res.status(500).json({ success: false, message: 'Server error updating testimonial' });
    }
    res.json({ success: true, message: 'Testimonial updated successfully' });
  });
});

// DELETE /api/admin/testimonials/:id
app.delete('/api/admin/testimonials/:id', (req, res) => {
  const { id } = req.params;
  const query = 'DELETE FROM testimonials WHERE id = ?';
  db.query(query, [id], (err, result) => {
    if (err) {
      console.error('Error deleting testimonial:', err);
      return res.status(500).json({ success: false, message: 'Server error deleting testimonial' });
    }
    res.json({ success: true, message: 'Testimonial deleted successfully' });
  });
});

// ========== APPOINTMENT REMINDERS (Enhanced) ==========
// Runs at 9:00 AM GMT+8 daily:
//   - Customer: Same-day reminder ("You have a session TODAY")
//   - Artist: Tomorrow's sessions (with customer names) + today's remaining sessions
//   - Deduplication: checks if a reminder was already sent today for this appointment
function startAppointmentReminders() {
  setInterval(() => {
    // Calculate current time in GMT+8 (Philippine Time)
    const now = new Date();
    const utcMs = now.getTime() + now.getTimezoneOffset() * 60000;
    const pht = new Date(utcMs + 8 * 3600000);
    const phtHour = pht.getHours();
    const phtMinute = pht.getMinutes();

    if (phtHour !== 9 || phtMinute !== 0) return;

    console.log('[INFO] Running daily appointment reminder job (9:00 AM PHT)...');

    // Date strings in PHT
    const todayStr = pht.toISOString().split('T')[0];
    const tomorrow = new Date(pht.getTime() + 86400000);
    const tomorrowStr = tomorrow.toISOString().split('T')[0];

    const formatTime12h = (t) => {
      if (!t) return 'TBD';
      try { const [h, m] = t.split(':'); const hr = parseInt(h); return `${hr > 12 ? hr - 12 : hr || 12}:${m} ${hr >= 12 ? 'PM' : 'AM'}`; }
      catch { return t; }
    };

    // ── 1. Customer Same-Day Reminders ──
    const todayQuery = `
      SELECT a.id, a.customer_id, a.artist_id, a.appointment_date, a.start_time, a.design_title,
             u.email as customer_email, u.name as customer_name, ar.name as artist_name
      FROM appointments a
      LEFT JOIN users u ON a.customer_id = u.id
      LEFT JOIN users ar ON a.artist_id = ar.id
      WHERE a.is_deleted = 0 AND a.status = 'confirmed'
      AND DATE(a.appointment_date) = ?
    `;
    db.query(todayQuery, [todayStr], (err, todayAppts) => {
      if (err) return console.error('[ERROR] Error finding today reminders:', err);
      console.log(`[INFO] Found ${todayAppts.length} appointment(s) today`);

      todayAppts.forEach(appt => {
        // Deduplicate: check if we already sent a same-day reminder for this appointment today
        db.query("SELECT id FROM notifications WHERE user_id = ? AND type = 'appointment_reminder' AND related_id = ? AND message LIKE '%session today%' AND DATE(created_at) = CURDATE() LIMIT 1",
          [appt.customer_id, appt.id], (dupErr, dupRes) => {
            if (dupErr || (dupRes && dupRes.length > 0)) return; // Already sent or error

            const timeStr = formatTime12h(appt.start_time);
            const customerMsg = `Reminder: You have a session today for "${appt.design_title}" at ${timeStr}! Get plenty of rest and stay hydrated. We can't wait to see you!`;
            createNotification(appt.customer_id, 'Session Today!', customerMsg, 'appointment_reminder', appt.id);

            // Email reminder
            if (appt.customer_email) {
              const html = buildEmailHtml(`
                <h2 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#C19A6B;text-align:center;">Your Session is Today!</h2>
                <p style="margin:0 0 20px;font-size:13px;color:#64748b;text-align:center;">Don't forget — your tattoo appointment is happening today!</p>
                <p style="margin:0 0 16px;">Hello ${appt.customer_name},</p>
                <p style="margin:0 0 16px;">This is a friendly reminder that your session is scheduled for today. Here are the details:</p>
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td align="center" style="padding:10px 0 20px;">
                  <div style="text-align:left;display:inline-block;background-color:#faf8f5;border:1px solid #e2ddd5;border-radius:12px;padding:24px;width:100%;max-width:400px;box-sizing:border-box;">
                    <p style="margin:0 0 12px;font-size:14px;color:#94a3b8;"><strong style="color:#334155;display:inline-block;width:70px;">Design:</strong> <span style="color:#C19A6B;">${appt.design_title}</span></p>
                    <p style="margin:0 0 12px;font-size:14px;color:#94a3b8;"><strong style="color:#334155;display:inline-block;width:70px;">Time:</strong> <span style="color:#C19A6B;">${timeStr}</span></p>
                    <p style="margin:0;font-size:14px;color:#94a3b8;"><strong style="color:#334155;display:inline-block;width:70px;">Artist:</strong> <span style="color:#C19A6B;">${appt.artist_name || 'Your Artist'}</span></p>
                  </div>
                </td></tr></table>
                <p style="margin:0 0 8px;font-size:13px;color:#94a3b8;text-align:center;">Please arrive 10 minutes early. See you soon!</p>
              `);
              sendEmail(appt.customer_email, `Reminder: Your Tattoo Session is Today!`, html);
            }
          }
        );
      });
    });

    // ── 2. Artist Reminders: Tomorrow's sessions + Today's sessions ──
    const artistQuery = `
      SELECT a.id, a.artist_id, a.appointment_date, a.start_time, a.design_title,
             u.name as customer_name, DATE(a.appointment_date) as appt_date
      FROM appointments a
      LEFT JOIN users u ON a.customer_id = u.id
      WHERE a.is_deleted = 0 AND a.status = 'confirmed'
      AND (DATE(a.appointment_date) = ? OR DATE(a.appointment_date) = ?)
      ORDER BY a.artist_id, a.appointment_date, a.start_time
    `;
    db.query(artistQuery, [todayStr, tomorrowStr], (err, allAppts) => {
      if (err) return console.error('[ERROR] Error finding artist reminders:', err);

      // Group by artist
      const artistSessions = {};
      allAppts.forEach(appt => {
        if (!artistSessions[appt.artist_id]) {
          artistSessions[appt.artist_id] = { today: [], tomorrow: [] };
        }
        const apptDateStr = new Date(appt.appointment_date).toISOString().split('T')[0];
        if (apptDateStr === todayStr) {
          artistSessions[appt.artist_id].today.push(appt);
        } else {
          artistSessions[appt.artist_id].tomorrow.push(appt);
        }
      });

      Object.entries(artistSessions).forEach(([artistId, sessions]) => {
        // Deduplicate: check if we already sent this artist a reminder today
        db.query("SELECT id FROM notifications WHERE user_id = ? AND type = 'appointment_reminder' AND message LIKE '%schedule overview%' AND DATE(created_at) = CURDATE() LIMIT 1",
          [artistId], (dupErr, dupRes) => {
            if (dupErr || (dupRes && dupRes.length > 0)) return;

            // Only send if the artist is not an admin user
            db.query('SELECT user_type FROM users WHERE id = ?', [artistId], (aErr, aRes) => {
              if (aErr || !aRes.length || aRes[0].user_type === 'admin') return;

              let msgParts = ['Here is your daily schedule overview:\n'];

              // Today's sessions
              if (sessions.today.length > 0) {
                msgParts.push(`[TODAY] (${sessions.today.length} session${sessions.today.length > 1 ? 's' : ''}):`);
                sessions.today.forEach(s => {
                  const time = formatTime12h(s.start_time);
                  msgParts.push(`  • ${time} — "${s.design_title}" with ${s.customer_name || 'Client'}`);
                });
                msgParts.push('');
              }

              // Tomorrow's sessions
              if (sessions.tomorrow.length > 0) {
                msgParts.push(`TOMORROW (${sessions.tomorrow.length} session${sessions.tomorrow.length > 1 ? 's' : ''}):`);
                sessions.tomorrow.forEach(s => {
                  const time = formatTime12h(s.start_time);
                  msgParts.push(`  • ${time} — "${s.design_title}" with ${s.customer_name || 'Client'}`);
                });
              }

              const fullMsg = msgParts.join('\n');
              createNotification(parseInt(artistId), 'Daily Schedule Overview', fullMsg, 'appointment_reminder');
            });
          }
        );
      });
    });

    // ── 3. Tomorrow-only customer reminder (existing behavior) ──
    const tomorrowQuery = `
      SELECT a.id, a.customer_id, a.artist_id, a.appointment_date, a.start_time, a.design_title, u.email as customer_email, u.name as customer_name
      FROM appointments a
      LEFT JOIN users u ON a.customer_id = u.id
      WHERE a.is_deleted = 0 AND a.status = 'confirmed' 
      AND DATE(a.appointment_date) = ?
    `;
    db.query(tomorrowQuery, [tomorrowStr], (err, tomorrowAppts) => {
      if (err) return console.error('Error finding tomorrow reminders:', err);

      tomorrowAppts.forEach(appt => {
        // Deduplicate
        db.query("SELECT id FROM notifications WHERE user_id = ? AND type = 'appointment_reminder' AND related_id = ? AND message LIKE '%coming up tomorrow%' AND DATE(created_at) = CURDATE() LIMIT 1",
          [appt.customer_id, appt.id], (dupErr, dupRes) => {
            if (dupErr || (dupRes && dupRes.length > 0)) return;

            const title = "Upcoming Session Reminder";
            const message = `Reminder: Your tattoo session for "${appt.design_title}" is coming up tomorrow at ${appt.start_time}! Get plenty of rest and stay hydrated.`;
            createNotification(appt.customer_id, title, message, 'appointment_reminder', appt.id);

            if (appt.customer_email) {
              const html = buildEmailHtml(`
                <h2 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#C19A6B;text-align:center;">Upcoming Session Reminder</h2>
                <p style="margin:0 0 20px;font-size:13px;color:#64748b;text-align:center;">Your tattoo appointment is tomorrow!</p>
                <p style="margin:0 0 16px;">Hello ${appt.customer_name},</p>
                <p style="margin:0 0 16px;">This is a quick reminder that your tattoo session is happening tomorrow. Please review your session details below:</p>
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td align="center" style="padding:10px 0 20px;">
                  <div style="text-align:left;display:inline-block;background-color:#faf8f5;border:1px solid #e2ddd5;border-radius:12px;padding:24px;width:100%;max-width:400px;box-sizing:border-box;">
                    <p style="margin:0 0 12px;font-size:14px;color:#94a3b8;"><strong style="color:#334155;display:inline-block;width:70px;">Design:</strong> <span style="color:#C19A6B;">${appt.design_title}</span></p>
                    <p style="margin:0 0 12px;font-size:14px;color:#94a3b8;"><strong style="color:#e2e8f0;display:inline-block;width:70px;">Date:</strong> <span style="color:#C19A6B;">Tomorrow</span></p>
                    <p style="margin:0;font-size:14px;color:#94a3b8;"><strong style="color:#e2e8f0;display:inline-block;width:70px;">Time:</strong> <span style="color:#C19A6B;">${appt.start_time}</span></p>
                  </div>
                </td></tr></table>
                <p style="margin:0 0 16px;line-height:1.6;"><strong>Important reminders before your session:</strong></p>
                <ul style="margin:0 0 20px;padding-left:20px;color:#94a3b8;font-size:14px;line-height:1.6;">
                  <li style="margin-bottom:8px;"><strong style="color:#e2e8f0;">Stay hydrated</strong> and get plenty of rest tonight.</li>
                  <li style="margin-bottom:8px;"><strong style="color:#e2e8f0;">Eat a good meal</strong> before arriving to keep your blood sugar stable.</li>
                  <li>Please aim to <strong style="color:#e2e8f0;">arrive 10 minutes early</strong>.</li>
                </ul>
                <p style="margin:0 0 8px;font-size:13px;color:#94a3b8;text-align:center;">We can't wait to see you in the studio!</p>
              `);
              sendEmail(appt.customer_email, `Reminder: Upcoming Tattoo Session Tomorrow!`, html);
            }
          }
        );
      });
    });
  }, 1000 * 60);
}

// ========== BI-WEEKLY PAYOUT AVAILABILITY REMINDERS ==========
// Runs every other Monday at 10:00 AM GMT+8.
// Notifies artists with ≥₱500 in unclaimed commissions.
function startPayoutReminders() {
  setInterval(() => {
    const now = new Date();
    const utcMs = now.getTime() + now.getTimezoneOffset() * 60000;
    const pht = new Date(utcMs + 8 * 3600000);
    const phtHour = pht.getHours();
    const phtMinute = pht.getMinutes();
    const phtDay = pht.getDay(); // 0=Sun, 1=Mon

    if (phtDay !== 1 || phtHour !== 10 || phtMinute !== 0) return;

    // Check if this is an "every other Monday" — use ISO week number (odd weeks)
    const startOfYear = new Date(pht.getFullYear(), 0, 1);
    const weekNum = Math.ceil(((pht - startOfYear) / 86400000 + startOfYear.getDay() + 1) / 7);
    if (weekNum % 2 !== 0) return; // Only even weeks (every other Monday)

    console.log('[INFO] Running bi-weekly payout reminder job...');

    // Find all artists and calculate their unclaimed commission balance
    const query = `
      SELECT u.id as artist_id, u.name as artist_name,
        COALESCE((
          SELECT SUM(
            CASE 
              WHEN a.commission_split IS NOT NULL AND a.secondary_artist_id = u.id 
                THEN ((COALESCE((SELECT COALESCE(SUM(amount),0) FROM payments WHERE appointment_id = a.id AND status = 'paid'), 0) / 100) + COALESCE(a.manual_paid_amount, 0)) * 0.30 * ((100 - a.commission_split) / 100)
              WHEN a.commission_split IS NOT NULL AND a.artist_id = u.id 
                THEN ((COALESCE((SELECT COALESCE(SUM(amount),0) FROM payments WHERE appointment_id = a.id AND status = 'paid'), 0) / 100) + COALESCE(a.manual_paid_amount, 0)) * 0.30 * (a.commission_split / 100)
              ELSE ((COALESCE((SELECT COALESCE(SUM(amount),0) FROM payments WHERE appointment_id = a.id AND status = 'paid'), 0) / 100) + COALESCE(a.manual_paid_amount, 0)) * 0.30
            END
          )
          FROM appointments a
          WHERE (a.artist_id = u.id OR a.secondary_artist_id = u.id)
            AND a.is_deleted = 0 AND a.status IN ('confirmed', 'completed')
        ), 0) - COALESCE((SELECT SUM(amount) FROM payouts WHERE artist_id = u.id), 0) as unclaimed_balance
      FROM users u
      WHERE u.user_type = 'artist' AND u.is_deleted = 0
      HAVING unclaimed_balance >= 500
    `;

    db.query(query, (err, artists) => {
      if (err) return console.error('[ERROR] Error calculating payout balances:', err);

      console.log(`[INFO] Found ${artists.length} artist(s) with unclaimed commissions ≥ ₱500`);

      artists.forEach(artist => {
        const balance = parseFloat(artist.unclaimed_balance).toLocaleString('en-PH', { minimumFractionDigits: 2 });
        // Deduplicate: only one payout reminder per artist per day
        db.query("SELECT id FROM notifications WHERE user_id = ? AND type = 'payout_processed' AND message LIKE '%available for claiming%' AND DATE(created_at) = CURDATE() LIMIT 1",
          [artist.artist_id], (dupErr, dupRes) => {
            if (dupErr || (dupRes && dupRes.length > 0)) return;
            createNotification(artist.artist_id, 'Payout Available', `You have ₱${balance} in commissions available for claiming. Please coordinate with the studio to process your payout.`, 'payout_processed');
          }
        );
      });
    });
  }, 1000 * 60);
}

// ========== AFTERCARE DAILY CRON JOB ==========
function startAftercareCron() {
  // Check every minute if it's 8:00 AM — send daily aftercare notifications
  setInterval(() => {
    const now = new Date();
    if (now.getHours() === 8 && now.getMinutes() === 0) {
      console.log('[INFO] Running daily aftercare notification job...');

      // Find all completed appointments within the last 30 days (tattoo sessions only)
      const query = `
        SELECT ap.id, ap.customer_id, ap.design_title, ap.appointment_date, ap.status,
               DATEDIFF(CURDATE(), DATE(ap.appointment_date)) as days_since
        FROM appointments ap
        WHERE ap.status = 'completed' 
          AND ap.is_deleted = 0
          AND ap.service_type LIKE '%Tattoo%'
          AND DATEDIFF(CURDATE(), DATE(ap.appointment_date)) BETWEEN 1 AND 30
        ORDER BY ap.appointment_date DESC
      `;

      db.query(query, (err, completedAppts) => {
        if (err) return console.error('[ERROR] Aftercare CRON error:', err.message);
        if (!completedAppts.length) return console.log('[INFO] No active aftercare sessions today');

        // Group by customer — only send for their most recent completed tattoo
        const customerLatest = {};
        completedAppts.forEach(appt => {
          if (!customerLatest[appt.customer_id]) {
            customerLatest[appt.customer_id] = appt;
          }
        });

        const customers = Object.values(customerLatest);
        console.log(`[INFO] Found ${customers.length} customers needing aftercare notifications`);

        // Get today's aftercare templates
        customers.forEach(appt => {
          const dayNum = appt.days_since;

          // Check if we already sent a notification for this appointment + day combo today
          const duplicateCheck = `
            SELECT id FROM notifications 
            WHERE user_id = ? AND type = 'aftercare_daily' AND related_id = ?
              AND message LIKE ? AND DATE(created_at) = CURDATE()
            LIMIT 1
          `;
          db.query(duplicateCheck, [appt.customer_id, appt.id, `%Day ${dayNum}%`], (dupErr, dupRes) => {
            if (dupErr || (dupRes && dupRes.length > 0)) return; // Already sent or error

            // Fetch the template for this day
            db.query('SELECT * FROM aftercare_templates WHERE day_number = ?', [dayNum], (tplErr, tplRes) => {
              if (tplErr || !tplRes.length) return;

              const tpl = tplRes[0];
              const designName = appt.design_title || 'your tattoo';
              const title = `Day ${dayNum}: ${tpl.title}`;
              const message = `Day ${dayNum} of healing for "${designName}" — ${tpl.message}`;

              createNotification(appt.customer_id, title, message, 'aftercare_daily', appt.id);
              console.log(`[OK] Sent Day ${dayNum} aftercare to customer ${appt.customer_id}`);
            });
          });
        });
      });
    }
  }, 1000 * 60);
}

// ========== RESCHEDULE REQUEST AUTO-EXPIRY ==========
// Runs every minute: auto-rejects any pending reschedule request whose 24-hour window has elapsed
function startRescheduleRequestExpiry() {
  setInterval(() => {
    db.query(
      `SELECT rr.*, u.name as customer_name, a.booking_code, a.appointment_date
       FROM reschedule_requests rr
       JOIN users u ON rr.customer_id = u.id
       JOIN appointments a ON rr.appointment_id = a.id
       WHERE rr.status = 'pending' AND rr.expires_at <= ?`,
      [getLocalDatetime()],
      (err, expired) => {
        if (err || !expired || !expired.length) return;

        console.log(`[INFO] Auto-expiring ${expired.length} reschedule request(s)...`);

        expired.forEach(req => {
          // Mark as expired
          db.query(`UPDATE reschedule_requests SET status = 'expired', decided_at = ? WHERE id = ?`, [getLocalDatetime(), req.id]);

          const bookingCode = req.booking_code || `#${req.appointment_id}`;
          const originalDateStr = new Date(req.appointment_date).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });

          // Notify customer
          createNotification(req.customer_id, 'Reschedule Request Expired', `Your reschedule request for [${bookingCode}] has expired because no action was taken within 24 hours. Your original appointment on ${originalDateStr} remains unchanged.`, 'reschedule_expired', req.appointment_id);

          console.log(`[INFO] Expired reschedule request #${req.id} for Appt #${req.appointment_id} (Customer: ${req.customer_name})`);
        });
      }
    );
  }, 60000); // every 1 minute
}


// ========== REVIEWS ENDPOINTS ==========

// GET public artist profile
app.get('/api/artists/:id/public', (req, res) => {
  const { id } = req.params;
  const q = `
    SELECT u.name, u.email, u.phone, 
           COALESCE(a.studio_name, 'Independent Artist') as studio_name, 
           COALESCE(a.experience_years, 0) as experience_years, 
           COALESCE(a.specialization, 'General Artist') as specialization, 
           COALESCE(a.hourly_rate, 50.00) as hourly_rate, 
           COALESCE(a.rating, 0) as rating, 
           COALESCE(a.total_reviews, 0) as total_reviews, 
           a.profile_image, a.bio,
           (SELECT COUNT(*) FROM appointments WHERE artist_id = u.id AND status = 'completed' AND is_deleted = 0) as completed_sessions
    FROM users u 
    LEFT JOIN artists a ON u.id = a.user_id 
    WHERE u.id = ? AND u.user_type = 'artist' AND u.is_deleted = 0
  `;
  db.query(q, [id], (err, results) => {
    if (err) return res.status(500).json({ success: false, message: 'Database error' });
    if (results.length === 0) return res.status(404).json({ success: false, message: 'Artist not found' });
    res.json({ success: true, artist: results[0] });
  });
});

// GET artist's approved reviews
app.get('/api/artists/:id/reviews', (req, res) => {
  const { id } = req.params;
  const q = `
    SELECT r.*, u.name as customer_name 
    FROM reviews r 
    JOIN users u ON r.customer_id = u.id 
    WHERE r.artist_id = ? AND r.status = 'approved'
    ORDER BY r.created_at DESC
  `;
  db.query(q, [id], (err, results) => {
    if (err) return res.status(500).json({ success: false, message: 'Database error' });
    res.json({ success: true, reviews: results });
  });
});

// POST submit a review
app.post('/api/reviews', (req, res) => {
  const { customer_id, artist_id, appointment_id, rating, comment } = req.body;
  console.log('[REVIEW] Submission attempt:', { customer_id, artist_id, appointment_id, rating, comment: comment?.substring(0, 50) });

  if (!customer_id || !artist_id || !appointment_id || !rating) {
    return res.status(400).json({ success: false, message: 'Missing fields' });
  }

  // Ensure reviews table exists before attempting insert
  const ensureTable = `
    CREATE TABLE IF NOT EXISTS reviews (
      id INT AUTO_INCREMENT PRIMARY KEY,
      customer_id INT NOT NULL,
      artist_id INT NOT NULL,
      appointment_id INT NOT NULL,
      rating INT NOT NULL,
      comment TEXT,
      status ENUM('pending', 'approved', 'rejected') DEFAULT 'pending',
      is_showcased BOOLEAN DEFAULT FALSE,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `;

  db.query(ensureTable, (tableErr) => {
    if (tableErr) {
      console.error('[REVIEW] Table creation error:', tableErr.message);
      return res.status(500).json({ success: false, message: 'Database setup error: ' + tableErr.message });
    }

    // Verify appointment belongs to customer and is completed
    db.query('SELECT status FROM appointments WHERE id = ? AND customer_id = ?', [appointment_id, customer_id], (err, results) => {
      if (err) {
        console.error('[REVIEW] Appointment lookup error:', err.message);
        return res.status(500).json({ success: false, message: 'Database error looking up appointment: ' + err.message });
      }
      if (results.length === 0 || results[0].status !== 'completed') {
        return res.status(400).json({ success: false, message: 'Invalid appointment for review. The session must be completed first.' });
      }

      // Check if review already exists
      db.query('SELECT id FROM reviews WHERE appointment_id = ?', [appointment_id], (err2, res2) => {
        if (err2) {
          console.error('[REVIEW] Duplicate check error:', err2.message);
          return res.status(500).json({ success: false, message: 'Database error checking existing reviews: ' + err2.message });
        }
        if (res2.length > 0) {
          return res.status(400).json({ success: false, message: 'You have already reviewed this session.' });
        }

        const q = 'INSERT INTO reviews (customer_id, artist_id, appointment_id, rating, comment, status) VALUES (?, ?, ?, ?, ?, ?)';
        db.query(q, [customer_id, artist_id, appointment_id, rating, comment || '', 'pending'], (err3, result) => {
          if (err3) {
            console.error('[REVIEW] Insert error:', err3.message, err3.code);
            return res.status(500).json({ success: false, message: 'Failed to save review: ' + err3.message });
          }

          console.log('[REVIEW] Successfully created review ID:', result.insertId);

          // Notify Admin of new review
          createNotification(1, 'New Review Received', `A client submitted a new ${rating}-star review for session #${appointment_id}. Take a moment to review and showcase it!`, 'new_review', appointment_id);

          // Notify the reviewed artist
          if (artist_id) {
            db.query('SELECT user_type FROM users WHERE id = ?', [artist_id], (aErr, aRes) => {
              if (!aErr && aRes.length && aRes[0].user_type !== 'admin') {
                createNotification(artist_id, 'New Review Received', `A client left a ${rating}-star review for your session #${appointment_id}.${comment ? ' "' + comment.substring(0, 100) + (comment.length > 100 ? '...' : '') + '"' : ''} Thank you for your work!`, 'new_review', appointment_id);
              }
            });
          }

          // Send thank-you notification to the customer
          createNotification(customer_id, 'Thank You for Your Review', `We truly appreciate you taking the time to share your experience with Inkvictus. Your feedback helps us continue delivering the premium artistry and service our clients deserve. Your review is now pending approval and will be showcased soon.`, 'system', result.insertId);

          res.json({ success: true, message: 'Review submitted and is pending admin approval.' });
        });
      });
    });
  });
});

// GET check if review exists for an appointment
app.get('/api/reviews/check/:appointmentId', (req, res) => {
  const { appointmentId } = req.params;
  db.query('SELECT id FROM reviews WHERE appointment_id = ?', [appointmentId], (err, results) => {
    if (err) return res.json({ success: true, exists: false });
    res.json({ success: true, exists: results.length > 0 });
  });
});

// GET all reviews for Admin Moderation
app.get('/api/admin/reviews', (req, res) => {
  const q = `
    SELECT r.*, c.name as customer_name, a.name as artist_name 
    FROM reviews r 
    JOIN users c ON r.customer_id = c.id 
    JOIN users a ON r.artist_id = a.id
    ORDER BY r.created_at DESC
  `;
  db.query(q, (err, results) => {
    if (err) return res.status(500).json({ success: false, message: 'Database error' });
    res.json({ success: true, reviews: results });
  });
});

// GET approved reviews (Public)
app.get('/api/reviews', (req, res) => {
  const q = `
    SELECT r.*, c.name as customer_name, a.name as artist_name 
    FROM reviews r 
    JOIN users c ON r.customer_id = c.id 
    JOIN users a ON r.artist_id = a.id
    WHERE r.status = 'approved'
    ORDER BY r.created_at DESC
  `;
  db.query(q, (err, results) => {
    if (err) return res.status(500).json({ success: false, message: 'Database error' });
    res.json({ success: true, reviews: results });
  });
});

// PUT review status (Admin)
app.put('/api/admin/reviews/:id', (req, res) => {
  const { id } = req.params;
  const { status, is_showcased } = req.body;

  let updateQuery = 'UPDATE reviews SET status = ?';
  let params = [status];

  if (is_showcased !== undefined) {
    updateQuery += ', is_showcased = ?';
    params.push(is_showcased ? 1 : 0);
  }

  updateQuery += ' WHERE id = ?';
  params.push(id);

  db.query(updateQuery, params, (err, result) => {
    if (err) return res.status(500).json({ success: false, message: 'Database error' });

    // If approved, recalculate artist average rating
    if (status === 'approved') {
      db.query('SELECT artist_id FROM reviews WHERE id = ?', [id], (e, r) => {
        if (!e && r.length) {
          const artistId = r[0].artist_id;
          db.query('SELECT AVG(rating) as avg_rating, COUNT(id) as total FROM reviews WHERE artist_id = ? AND status = "approved"', [artistId], (ee, rr) => {
            if (!ee && rr.length) {
              const newRating = rr[0].avg_rating || 5;
              const total = rr[0].total || 0;
              db.query('UPDATE artists SET rating = ?, total_reviews = ? WHERE user_id = ?', [newRating, total, artistId]);
            }
          });
        }
      });
    }

    res.json({ success: true, message: 'Review status updated' });
  });
});

// ========== STUDIO SERVICES ENDPOINTS ==========
app.get('/api/services', (req, res) => {
  const q = 'SELECT * FROM services WHERE is_active = 1 ORDER BY category, name';
  db.query(q, (err, results) => {
    if (err) return res.status(500).json({ success: false, message: 'Database error' });
    res.json({ success: true, services: results });
  });
});

app.post('/api/services', (req, res) => {
  const { name, description, duration_minutes, base_price, category } = req.body;
  const q = 'INSERT INTO services (name, description, duration_minutes, base_price, category) VALUES (?, ?, ?, ?, ?)';
  db.query(q, [name, description, duration_minutes, base_price, category], (err, result) => {
    if (err) return res.status(500).json({ success: false, message: 'Database error' });
    res.json({ success: true, message: 'Service added successfully' });
  });
});

// ========== TRANSACTIONS ENDPOINT ==========
app.get('/api/customer/:id/transactions', (req, res) => {
  const customerId = req.params.id;
  // Combine PayMongo payments from 'payments' table and manual payments logged in 'appointments'
  const q = `
    SELECT 
      'digital' as type,
      p.paymongo_payment_id as reference_id,
      p.amount,
      p.status,
      a.design_title as description,
      p.created_at as created_at
    FROM payments p
    JOIN appointments a ON p.appointment_id = a.id
    WHERE a.customer_id = ? AND p.status IN ('paid', 'succeeded', 'successful')
    
    UNION ALL
    
    SELECT 
      'manual' as type,
      CONCAT('MANUAL-', a.id) as reference_id,
      a.manual_paid_amount as amount,
      'paid' as status,
      CONCAT(a.design_title, ' (Manual Payment)') as description,
      a.created_at as created_at
    FROM appointments a
    WHERE a.customer_id = ? AND a.manual_paid_amount > 0 AND a.is_deleted = 0
    ORDER BY created_at DESC
  `;
  db.query(q, [customerId, customerId], (err, results) => {
    if (err) {
      console.error('Error fetching transactions:', err);
      return res.status(500).json({ success: false, message: 'Database error' });
    }
    // Amount is stored in cents for PayMongo, but let's just return what they have or convert.
    // If PayMongo stores as cents, we divide by 100 for digital. If not, raw.
    const mapped = results.map(row => {
      let dispAmount = row.amount;
      if (row.type === 'digital' && dispAmount > 1000) {
        dispAmount = dispAmount / 100; // rough convert from cents if needed, handled by UI usually. Wait, keep raw value.
      }
      return { ...row, amount: dispAmount };
    });
    res.json({ success: true, transactions: mapped });
  });
});

// ========== CHAT HISTORY ENDPOINT ==========
app.get('/api/chat/:room', (req, res) => {
  const { room } = req.params;
  const q = 'SELECT sender, message as text, created_at as timestamp FROM support_messages WHERE room_id = ? ORDER BY created_at ASC';
  db.query(q, [room], (err, results) => {
    if (err) return res.status(500).json({ success: false, message: 'Database error' });
    res.json({ success: true, messages: results });
  });
});

// ========== PUBLIC CONTACT FORM ==========
app.post('/api/contact', async (req, res) => {
  try {
    let { name, email, phone, subject, message, captchaToken } = req.body;

    // Verify reCAPTCHA
    const captchaValid = await verifyCaptcha(captchaToken);
    if (!captchaValid) {
      return res.status(400).json({ success: false, message: 'CAPTCHA verification failed. Please try again.' });
    }

    // Server-side sanitization (Zero-Trust)
    name = (name || '').replace(/[^a-zA-Z\u00c0-\u00ff\s'-]/g, '').substring(0, 100).trim();
    email = (email || '').substring(0, 254).trim().toLowerCase();
    phone = (phone || '').replace(/[^0-9+\s()-]/g, '').substring(0, 30).trim();
    subject = (subject || '').substring(0, 150).trim();
    message = (message || '').substring(0, 2000).trim();

    // Validation
    if (!name || name.length < 2) {
      return res.status(400).json({ success: false, message: 'Name is required (min 2 characters).' });
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!email || !emailRegex.test(email)) {
      return res.status(400).json({ success: false, message: 'A valid email address is required.' });
    }
    if (!message || message.length < 10) {
      return res.status(400).json({ success: false, message: 'Message is required (min 10 characters).' });
    }

    // Store in database
    const query = 'INSERT INTO contact_messages (name, email, phone, subject, message) VALUES (?, ?, ?, ?, ?)';
    db.query(query, [name, email, phone || null, subject || null, message], async (err, result) => {
      if (err) {
        console.error('\u274c Error saving contact message:', err);
        return res.status(500).json({ success: false, message: 'Failed to save your message. Please try again.' });
      }

      // Send notification email to studio
      try {
        const studioEmail = process.env.STUDIO_CONTACT_EMAIL || process.env.EMAIL_USER || 'admin@inkvistar.com';
        const html = buildEmailHtml(`
          <h2 style="color:#C19A6B;font-size:22px;margin:0 0 20px;">\ud83d\udcec New Contact Form Submission</h2>
          <div style="background:#1a1a1a;border:1px solid rgba(193,154,107,0.25);border-radius:10px;padding:18px;margin-bottom:16px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td style="padding:8px 0;color:#94a3b8;font-size:13px;width:80px;vertical-align:top;">Name</td>
                <td style="padding:8px 0;color:#e2e8f0;font-size:14px;font-weight:600;">${name}</td>
              </tr>
              <tr>
                <td style="padding:8px 0;color:#94a3b8;font-size:13px;vertical-align:top;">Email</td>
                <td style="padding:8px 0;"><a href="mailto:${email}" style="color:#C19A6B;text-decoration:none;font-size:14px;">${email}</a></td>
              </tr>
              ${phone ? `<tr>
                <td style="padding:8px 0;color:#94a3b8;font-size:13px;vertical-align:top;">Phone</td>
                <td style="padding:8px 0;color:#e2e8f0;font-size:14px;">${phone}</td>
              </tr>` : ''}
              ${subject ? `<tr>
                <td style="padding:8px 0;color:#94a3b8;font-size:13px;vertical-align:top;">Subject</td>
                <td style="padding:8px 0;color:#e2e8f0;font-size:14px;font-weight:600;">${subject}</td>
              </tr>` : ''}
            </table>
          </div>
          <div style="background:#1a1a1a;border:1px solid rgba(193,154,107,0.15);border-radius:10px;padding:18px;">
            <p style="color:#94a3b8;font-size:12px;margin:0 0 8px;text-transform:uppercase;letter-spacing:0.5px;">Message</p>
            <p style="color:#e2e8f0;font-size:14px;line-height:1.7;margin:0;white-space:pre-wrap;">${message}</p>
          </div>
          <p style="color:#64748b;font-size:12px;margin:16px 0 0;text-align:center;">Received on ${new Date().toLocaleString('en-PH', { timeZone: 'Asia/Manila' })}</p>
        `);

        await sendEmail(studioEmail, `New Contact: ${subject || 'Website Inquiry'} \u2014 ${name}`, html);
        console.log(`\u2705 Contact form email sent from ${name} (${email})`);
      } catch (emailErr) {
        // Don't fail the request if email fails — message is already saved
        console.error('\u26a0\ufe0f Contact email notification failed:', emailErr.message);
      }

      // Send confirmation email to the customer
      try {
        const confirmHtml = buildEmailHtml(`
          <h2 style="color:#C19A6B;font-size:22px;margin:0 0 20px;">We received your message! \u2705</h2>
          <p style="color:#e2e8f0;font-size:15px;line-height:1.7;margin:0 0 20px;">
            Hi <strong>${name}</strong>, thank you for reaching out to InkVictus Tattoo Studio. We've received your inquiry and our team will respond to your email within 24 hours.
          </p>
          <div style="background:#1a1a1a;border:1px solid rgba(193,154,107,0.15);border-radius:10px;padding:18px;margin-bottom:16px;">
            <p style="color:#94a3b8;font-size:12px;margin:0 0 8px;text-transform:uppercase;letter-spacing:0.5px;">Your Message</p>
            ${subject ? `<p style="color:#C19A6B;font-size:14px;font-weight:600;margin:0 0 8px;">${subject}</p>` : ''}
            <p style="color:#e2e8f0;font-size:14px;line-height:1.7;margin:0;white-space:pre-wrap;">${message}</p>
          </div>
          <p style="color:#94a3b8;font-size:13px;line-height:1.6;margin:0;">
            If your inquiry is urgent, feel free to call us at <strong style="color:#C19A6B;">+63 917 123 4567</strong> during business hours (Mon–Sat, 1:00 PM – 8:00 PM).
          </p>
        `);
        await sendEmail(email, `We received your message \u2014 InkVictus Studio`, confirmHtml);
        console.log(`\u2705 Confirmation email sent to ${email}`);
      } catch (confirmErr) {
        console.error('\u26a0\ufe0f Customer confirmation email failed:', confirmErr.message);
      }

      // Notify all admins/managers via in-app notification
      const inquiryId = result.insertId;
      const truncMsg = message.length > 100 ? message.substring(0, 100) + '...' : message;
      db.query("SELECT id FROM users WHERE user_type IN ('admin', 'manager') AND is_deleted = 0", (admErr, admins) => {
        if (!admErr && admins && admins.length > 0) {
          admins.forEach(admin => {
            createNotification(
              admin.id,
              `\ud83d\udce9 New Inquiry from ${name}`,
              `${subject ? subject + ': ' : ''}${truncMsg}`,
              'contact_inquiry',
              inquiryId
            );
          });
        }
      });

      res.json({ success: true, message: 'Your message has been sent successfully!' });
    });
  } catch (error) {
    console.error('\u274c Contact form error:', error);
    res.status(500).json({ success: false, message: 'An unexpected error occurred.' });
  }
});

// ========== ADMIN INQUIRY ENDPOINTS ==========

// GET all contact inquiries (paginated)
app.get('/api/admin/inquiries', (req, res) => {
  const { page = 1, limit = 20 } = req.query;
  const pageNum = parseInt(page, 10);
  const limitNum = parseInt(limit, 10);
  const offset = (pageNum - 1) * limitNum;

  db.query('SELECT COUNT(*) as total FROM contact_messages', (countErr, countRes) => {
    if (countErr) return res.status(500).json({ success: false, message: 'Database error' });

    const total = countRes[0]?.total || 0;
    db.query('SELECT * FROM contact_messages ORDER BY created_at DESC LIMIT ? OFFSET ?', [limitNum, offset], (err, results) => {
      if (err) return res.status(500).json({ success: false, message: 'Database error' });
      res.json({
        success: true,
        inquiries: results || [],
        pagination: { page: pageNum, limit: limitNum, total, hasMore: offset + results.length < total }
      });
    });
  });
});

// GET single inquiry by ID
app.get('/api/admin/inquiries/:id', (req, res) => {
  const { id } = req.params;
  db.query('SELECT * FROM contact_messages WHERE id = ?', [id], (err, results) => {
    if (err) return res.status(500).json({ success: false, message: 'Database error' });
    if (!results || results.length === 0) return res.status(404).json({ success: false, message: 'Inquiry not found' });

    // Mark as read when admin views it
    db.query('UPDATE contact_messages SET is_read = 1 WHERE id = ?', [id]);
    res.json({ success: true, inquiry: results[0] });
  });
});

// POST reply to an inquiry — sends email to the customer
app.post('/api/admin/inquiries/:id/reply', async (req, res) => {
  const { id } = req.params;
  const { reply } = req.body;

  if (!reply || reply.trim().length < 5) {
    return res.status(400).json({ success: false, message: 'Reply must be at least 5 characters.' });
  }

  try {
    // Get the original inquiry
    const [inquiry] = await new Promise((resolve, reject) => {
      db.query('SELECT * FROM contact_messages WHERE id = ?', [id], (err, results) => {
        if (err) return reject(err);
        resolve(results || []);
      });
    });

    if (!inquiry) {
      return res.status(404).json({ success: false, message: 'Inquiry not found.' });
    }

    // Update the inquiry with the reply
    await new Promise((resolve, reject) => {
      db.query(
        'UPDATE contact_messages SET admin_reply = ?, replied_at = ?, status = ?, is_read = 1 WHERE id = ?',
        [reply.trim(), getLocalDatetime(), 'replied', id],
        (err) => err ? reject(err) : resolve()
      );
    });

    // Send reply email to the customer
    const replyHtml = buildEmailHtml(`
      <h2 style="color:#C19A6B;font-size:22px;margin:0 0 20px;">Reply from InkVictus Studio \ud83d\udce8</h2>
      <p style="color:#e2e8f0;font-size:15px;line-height:1.7;margin:0 0 20px;">
        Hi <strong>${inquiry.name}</strong>, thank you for your inquiry. Here is our response:
      </p>
      <div style="background:#1a1a1a;border:1px solid rgba(193,154,107,0.25);border-radius:10px;padding:18px;margin-bottom:16px;">
        <p style="color:#94a3b8;font-size:12px;margin:0 0 8px;text-transform:uppercase;letter-spacing:0.5px;">Our Response</p>
        <p style="color:#e2e8f0;font-size:14px;line-height:1.7;margin:0;white-space:pre-wrap;">${reply.trim()}</p>
      </div>
      <div style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.06);border-radius:10px;padding:18px;">
        <p style="color:#64748b;font-size:12px;margin:0 0 8px;text-transform:uppercase;letter-spacing:0.5px;">Your Original Message</p>
        ${inquiry.subject ? `<p style="color:#94a3b8;font-size:13px;font-weight:600;margin:0 0 6px;">${inquiry.subject}</p>` : ''}
        <p style="color:#94a3b8;font-size:13px;line-height:1.6;margin:0;white-space:pre-wrap;">${inquiry.message}</p>
      </div>
      <p style="color:#94a3b8;font-size:13px;line-height:1.6;margin:16px 0 0;">
        If you have further questions, feel free to reply to this email or contact us at <strong style="color:#C19A6B;">+63 917 123 4567</strong>.
      </p>
    `);

    const replySubject = `Re: ${inquiry.subject || 'Your Inquiry'} \u2014 InkVictus Studio`;
    await sendEmail(inquiry.email, replySubject, replyHtml);
    console.log(`\u2705 Admin reply sent to ${inquiry.email} for inquiry #${id}`);

    res.json({ success: true, message: 'Reply sent successfully.' });
  } catch (error) {
    console.error('\u274c Error replying to inquiry:', error);
    res.status(500).json({ success: false, message: 'Failed to send reply.' });
  }
});

// ========== CUSTOMER REPORTS (Feedback System) ==========

// Helper: Generate unique report code RPT-XXXXXX
function generateReportCode() {
  const chars = '0123456789';
  let code = '';
  for (let i = 0; i < 6; i++) code += chars.charAt(Math.floor(Math.random() * chars.length));
  return `RPT-${code}`;
}

// POST submit a new customer report
app.post('/api/reports', (req, res) => {
  const { customer_id, report_type, category, title, description, steps_to_reproduce, attachment, system_info } = req.body;

  if (!customer_id || !title || !description) {
    return res.status(400).json({ success: false, message: 'Missing required fields (customer_id, title, description).' });
  }

  // Validate attachment size (~3MB base64 ≈ ~4MB string)
  if (attachment && attachment.length > 4 * 1024 * 1024) {
    return res.status(400).json({ success: false, message: 'Attachment exceeds the 3MB limit.' });
  }

  const reportCode = generateReportCode();
  const sysInfoJson = system_info ? JSON.stringify(system_info) : null;

  const q = `INSERT INTO customer_reports 
    (report_code, customer_id, report_type, category, title, description, steps_to_reproduce, attachment, system_info) 
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`;

  db.query(q, [
    reportCode, customer_id,
    report_type || 'general', category || 'other',
    title.substring(0, 255), description,
    steps_to_reproduce || null,
    attachment || null,
    sysInfoJson
  ], (err, result) => {
    if (err) {
      console.error('[REPORT] Insert error:', err.message);
      return res.status(500).json({ success: false, message: 'Failed to submit report.' });
    }

    console.log(`[REPORT] New report ${reportCode} from customer ${customer_id}`);

    // Notify admin (user_id=1)
    createNotification(1, `New Customer Report: ${reportCode}`, `A customer submitted a ${report_type || 'general'} report: "${title.substring(0, 80)}". Review it in Studio Settings > Reports.`, 'customer_report', result.insertId);

    // Thank-you notification to the customer
    createNotification(customer_id, `Thank You for Your Report ${reportCode}`, `We've received your report "${title.substring(0, 80)}" and our team will review it shortly. You can track updates in your Reports page.`, 'report_submitted', result.insertId);

    res.json({ success: true, report_code: reportCode, message: 'Report submitted successfully.' });
  });
});

// GET reports for a specific customer (private — own reports only)
app.get('/api/reports/customer/:customerId', (req, res) => {
  const { customerId } = req.params;
  const q = `SELECT id, report_code, report_type, category, title, description, status, priority, created_at, updated_at, resolved_at
    FROM customer_reports WHERE customer_id = ? ORDER BY created_at DESC`;
  db.query(q, [customerId], (err, results) => {
    if (err) return res.status(500).json({ success: false, message: 'Database error' });
    res.json({ success: true, reports: results || [] });
  });
});

// GET single report with replies (for both customer & admin detail views)
app.get('/api/reports/:reportCode', (req, res) => {
  const { reportCode } = req.params;
  const q = `SELECT cr.*, u.name as customer_name, u.email as customer_email
    FROM customer_reports cr 
    JOIN users u ON cr.customer_id = u.id
    WHERE cr.report_code = ?`;
  db.query(q, [reportCode], (err, results) => {
    if (err) return res.status(500).json({ success: false, message: 'Database error' });
    if (!results || results.length === 0) return res.status(404).json({ success: false, message: 'Report not found' });

    const report = results[0];

    // Get replies
    const rq = `SELECT rr.*, u.name as sender_name FROM report_replies rr JOIN users u ON rr.sender_id = u.id WHERE rr.report_id = ? ORDER BY rr.created_at ASC`;
    db.query(rq, [report.id], (err2, replies) => {
      if (err2) return res.status(500).json({ success: false, message: 'Database error' });
      res.json({ success: true, report, replies: replies || [] });
    });
  });
});

// GET all reports for admin (with filters)
app.get('/api/admin/reports', (req, res) => {
  const { status, report_type, category, search } = req.query;
  let q = `SELECT cr.*, u.name as customer_name FROM customer_reports cr JOIN users u ON cr.customer_id = u.id WHERE 1=1`;
  const params = [];

  if (status && status !== 'all') { q += ' AND cr.status = ?'; params.push(status); }
  if (report_type && report_type !== 'all') { q += ' AND cr.report_type = ?'; params.push(report_type); }
  if (category && category !== 'all') { q += ' AND cr.category = ?'; params.push(category); }
  if (search) { q += ' AND (cr.title LIKE ? OR cr.report_code LIKE ? OR u.name LIKE ?)'; const s = `%${search}%`; params.push(s, s, s); }

  q += ' ORDER BY cr.created_at DESC';

  db.query(q, params, (err, results) => {
    if (err) return res.status(500).json({ success: false, message: 'Database error' });
    res.json({ success: true, reports: results || [] });
  });
});

// GET unread report count for admin notification dot
app.get('/api/admin/reports/unread-count', (req, res) => {
  db.query('SELECT COUNT(*) as count FROM customer_reports WHERE is_read_by_admin = 0 AND status != "junk"', (err, results) => {
    if (err) return res.status(500).json({ success: false, count: 0 });
    res.json({ success: true, count: results[0]?.count || 0 });
  });
});

// PUT update report (admin actions: status, priority, admin_notes, junk)
app.put('/api/admin/reports/:id', (req, res) => {
  const { id } = req.params;
  const { status, priority, admin_notes } = req.body;

  let updates = [];
  let params = [];

  if (status) { updates.push('status = ?'); params.push(status); }
  if (priority) { updates.push('priority = ?'); params.push(priority); }
  if (admin_notes !== undefined) { updates.push('admin_notes = ?'); params.push(admin_notes); }

  // Mark as read when admin interacts
  updates.push('is_read_by_admin = 1');

  // If resolved, set resolved_at
  if (status === 'resolved') { updates.push('resolved_at = ?'); params.push(getLocalDatetime()); }

  if (updates.length === 0) return res.status(400).json({ success: false, message: 'No fields to update.' });

  const q = `UPDATE customer_reports SET ${updates.join(', ')} WHERE id = ?`;
  params.push(id);

  db.query(q, params, (err) => {
    if (err) return res.status(500).json({ success: false, message: 'Database error' });

    // Notify customer on status changes (except junk — silent)
    if (status && status !== 'junk') {
      db.query('SELECT customer_id, report_code, title FROM customer_reports WHERE id = ?', [id], (e, r) => {
        if (!e && r && r.length) {
          const rpt = r[0];
          const statusLabel = status.charAt(0).toUpperCase() + status.slice(1);
          if (status === 'resolved') {
            createNotification(rpt.customer_id, `Your Report ${rpt.report_code} Has Been Resolved`, `Your report "${rpt.title.substring(0, 60)}" has been resolved. Thank you for helping us improve InkVistAR!`, 'report_resolved', parseInt(id));
          } else if (status === 'investigating') {
            createNotification(rpt.customer_id, `Update on Your Report ${rpt.report_code}`, `Your report "${rpt.title.substring(0, 60)}" is now being investigated by our team.`, 'report_update', parseInt(id));
          }
        }
      });
    }

    res.json({ success: true, message: 'Report updated.' });
  });
});

// POST add a reply to a report (admin or customer)
app.post('/api/reports/:id/reply', (req, res) => {
  const { id } = req.params;
  const { sender_id, sender_role, message } = req.body;

  if (!sender_id || !sender_role || !message) {
    return res.status(400).json({ success: false, message: 'Missing required fields.' });
  }

  const q = 'INSERT INTO report_replies (report_id, sender_id, sender_role, message) VALUES (?, ?, ?, ?)';
  db.query(q, [id, sender_id, sender_role, message], (err) => {
    if (err) return res.status(500).json({ success: false, message: 'Database error' });

    // Update the report's updated_at
    db.query('UPDATE customer_reports SET updated_at = ? WHERE id = ?', [getLocalDatetime(), id]);

    // If admin replies → mark as read + notify customer
    if (sender_role === 'admin') {
      db.query('UPDATE customer_reports SET is_read_by_admin = 1 WHERE id = ?', [id]);
      db.query('SELECT customer_id, report_code, title FROM customer_reports WHERE id = ?', [id], (e, r) => {
        if (!e && r && r.length) {
          createNotification(r[0].customer_id, `Update on Your Report ${r[0].report_code}`, `InkVistAR team responded to your report "${r[0].title.substring(0, 60)}". Check your Reports page for details.`, 'report_reply', parseInt(id));
        }
      });
    }

    // If customer replies → notify admin + mark unread
    if (sender_role === 'customer') {
      db.query('UPDATE customer_reports SET is_read_by_admin = 0 WHERE id = ?', [id]);
      db.query('SELECT report_code, title FROM customer_reports WHERE id = ?', [id], (e, r) => {
        if (!e && r && r.length) {
          createNotification(1, `Customer Replied on ${r[0].report_code}`, `New reply on report "${r[0].title.substring(0, 60)}". Check Studio Settings > Reports.`, 'report_reply', parseInt(id));
        }
      });
    }

    res.json({ success: true, message: 'Reply added.' });
  });
});

// ========== FEATURE B: TATTOO PROJECT TIMELINE API ==========

// POST /api/projects — Create a new tattoo project and link a seed appointment to it
app.post('/api/projects', (req, res) => {
  const { customer_id, artist_id, design_title, total_sessions_planned, notes, seed_appointment_id } = req.body;
  if (!customer_id || !artist_id || !total_sessions_planned) {
    return res.status(400).json({ success: false, message: 'customer_id, artist_id, and total_sessions_planned are required.' });
  }
  const sessionsPlanned = parseInt(total_sessions_planned, 10);
  if (isNaN(sessionsPlanned) || sessionsPlanned < 1) {
    return res.status(400).json({ success: false, message: 'total_sessions_planned must be a positive integer.' });
  }

  db.query(
    'INSERT INTO tattoo_projects (customer_id, artist_id, design_title, total_sessions_planned, notes) VALUES (?, ?, ?, ?, ?)',
    [customer_id, artist_id, design_title || null, sessionsPlanned, notes || null],
    (err, result) => {
      if (err) {
        console.error('[ERROR] Create project:', err.message);
        return res.status(500).json({ success: false, message: 'Failed to create project.' });
      }
      const projectId = result.insertId;
      // Link seed appointment if provided
      if (seed_appointment_id) {
        db.query(
          'UPDATE appointments SET project_id = ?, session_number = 1, total_sessions = ? WHERE id = ?',
          [projectId, sessionsPlanned, seed_appointment_id],
          (linkErr) => {
            if (linkErr) console.error('[WARN] Could not link seed appointment to project:', linkErr.message);
          }
        );
      }
      res.json({ success: true, project_id: projectId, message: 'Tattoo project created.' });
    }
  );
});

// GET /api/projects/:id — Fetch a project with its full ordered session timeline
app.get('/api/projects/:id', (req, res) => {
  const projectId = parseInt(req.params.id, 10);
  if (isNaN(projectId)) return res.status(400).json({ success: false, message: 'Invalid project ID.' });

  db.query('SELECT * FROM tattoo_projects WHERE id = ?', [projectId], (err, projects) => {
    if (err) return res.status(500).json({ success: false, message: 'DB error.' });
    if (!projects.length) return res.status(404).json({ success: false, message: 'Project not found.' });

    const project = projects[0];
    db.query(
      `SELECT a.id, a.booking_code, a.appointment_date, a.start_time, a.end_time,
              a.session_number, a.total_sessions, a.status, a.payment_status,
              a.design_title, a.notes, a.after_photo, a.before_photo, a.session_duration,
              u.name AS artist_name
       FROM appointments a
       LEFT JOIN users u ON u.id = a.artist_id
       WHERE a.project_id = ? AND (a.is_deleted = 0 OR a.is_deleted IS NULL)
       ORDER BY COALESCE(a.session_number, 9999) ASC, a.appointment_date ASC`,
      [projectId],
      (sessErr, sessions) => {
        if (sessErr) return res.status(500).json({ success: false, message: 'DB error fetching sessions.' });
        res.json({ success: true, project: { ...project, sessions: sessions || [] } });
      }
    );
  });
});

// GET /api/projects?customer_id=X&artist_id=Y — List projects for a customer or artist
app.get('/api/projects', (req, res) => {
  const { customer_id, artist_id } = req.query;
  if (!customer_id && !artist_id) {
    return res.status(400).json({ success: false, message: 'Provide customer_id or artist_id.' });
  }
  let sql = 'SELECT tp.*, u.name AS customer_name, ua.name AS artist_name FROM tattoo_projects tp LEFT JOIN users u ON u.id = tp.customer_id LEFT JOIN users ua ON ua.id = tp.artist_id WHERE 1=1';
  const params = [];
  if (customer_id) { sql += ' AND tp.customer_id = ?'; params.push(customer_id); }
  if (artist_id)   { sql += ' AND tp.artist_id = ?';   params.push(artist_id); }
  sql += ' ORDER BY tp.created_at DESC';

  db.query(sql, params, (err, rows) => {
    if (err) return res.status(500).json({ success: false, message: 'DB error.' });
    res.json({ success: true, projects: rows });
  });
});

// PUT /api/projects/:id/complete — Mark a project as completed or completed_early
app.put('/api/projects/:id/complete', (req, res) => {
  const projectId = parseInt(req.params.id, 10);
  if (isNaN(projectId)) return res.status(400).json({ success: false, message: 'Invalid project ID.' });

  const { early, actual_sessions } = req.body;
  const newStatus = early ? 'completed_early' : 'completed';
  const actualSessions = actual_sessions ? parseInt(actual_sessions, 10) : null;

  db.query(
    'UPDATE tattoo_projects SET status = ?, total_sessions_actual = ? WHERE id = ?',
    [newStatus, actualSessions, projectId],
    (err, result) => {
      if (err) {
        console.error('[ERROR] Complete project:', err.message);
        return res.status(500).json({ success: false, message: 'Failed to update project.' });
      }
      if (result.affectedRows === 0) return res.status(404).json({ success: false, message: 'Project not found.' });
      res.json({ success: true, message: `Project marked as ${newStatus}.` });
    }
  );
});

// PUT /api/projects/:id/link-session — Link an existing appointment to a project
app.put('/api/projects/:id/link-session', (req, res) => {
  const projectId = parseInt(req.params.id, 10);
  const { appointment_id, session_number } = req.body;
  if (isNaN(projectId) || !appointment_id) {
    return res.status(400).json({ success: false, message: 'project_id and appointment_id are required.' });
  }

  // Fetch the project's total_sessions_planned to sync on the appointment row
  db.query('SELECT total_sessions_planned FROM tattoo_projects WHERE id = ?', [projectId], (err, rows) => {
    if (err || !rows.length) return res.status(404).json({ success: false, message: 'Project not found.' });

    const totalPlanned = rows[0].total_sessions_planned;
    db.query(
      'UPDATE appointments SET project_id = ?, session_number = ?, total_sessions = ? WHERE id = ?',
      [projectId, session_number || null, totalPlanned, appointment_id],
      (linkErr, linkResult) => {
        if (linkErr) return res.status(500).json({ success: false, message: 'Failed to link session.' });
        if (linkResult.affectedRows === 0) return res.status(404).json({ success: false, message: 'Appointment not found.' });
        res.json({ success: true, message: 'Session linked to project.' });
      }
    );
  });
});

// ========== 404 HANDLER ==========
app.use((req, res) => {
  console.log(`\u274c 404: ${req.method} ${req.url} not found`);
  res.status(404).json({
    success: false,
    message: 'Endpoint not found'
  });
});

// ========== ERROR HANDLER ==========
app.use((err, req, res, next) => {
  console.error('[ERROR] Unhandled error:', err);
  res.status(500).json({
    success: false,
    message: 'Internal server error',
    error: err.message
  });
});

// ========== PENDING PAYMENTS EXPIRY CLEANUP ==========
function startPendingPaymentsCleanup() {
  // Run every 30 minutes to check for pending payments older than 2 hours
  setInterval(() => {
    const query = `
      UPDATE payments 
      SET status = 'failed'
      WHERE status = 'pending' AND created_at < DATE_SUB(NOW(), INTERVAL 2 HOUR)
    `;
    db.query(query, (err, results) => {
      if (err) console.error('[ERROR] Error expiring pending payments:', err);
      else if (results.affectedRows > 0) {
        console.log(`[INFO] Expired ${results.affectedRows} pending payment(s) older than 2 hours.`);
      }
    });
  }, 1000 * 60 * 30);
}

// ========== START SERVER ==========
const PORT = process.env.PORT || 3001;
server.listen(PORT, '0.0.0.0', () => {
  console.log('\n' + '='.repeat(50));
  console.log(`[OK] BACKEND SERVER STARTED`);
  console.log(`[OK] http://localhost:${PORT}`);
  console.log('[OK] Socket.IO chat server is waiting for connections...');
  console.log('\n[INFO] Available Endpoints:');
  console.log(`   GET  http://localhost:${PORT}/api/test`);
  console.log(`   GET  http://localhost:${PORT}/api/debug/db`);
  console.log(`   GET  http://localhost:${PORT}/api/debug/users`);
  console.log(`   GET  http://localhost:${PORT}/api/debug/user/1`);
  console.log(`   POST http://localhost:${PORT}/api/register`);
  console.log(`   POST http://localhost:${PORT}/api/login`);
  console.log(`   POST http://localhost:${PORT}/api/emergency-login`);
  console.log(`   GET  http://localhost:${PORT}/api/artist/dashboard/1`);
  console.log(`   GET  http://localhost:${PORT}/api/customer/dashboard/1`);
  console.log('='.repeat(50) + '\n');

  startAppointmentReminders();
  startAftercareCron();
  startPayoutReminders();
  startRescheduleRequestExpiry();
  startPendingPaymentsCleanup();
});
