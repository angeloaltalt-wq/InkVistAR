const express = require('express');
const mysql = require('mysql2');
const bcrypt = require('bcryptjs');
const cors = require('cors');
const Groq = require('groq-sdk');
const crypto = require('crypto');
// Provide fetch for Node runtimes that lack the global (e.g., Node 16 on some hosts)
const fetch = global.fetch || require('node-fetch');
require('dotenv').config();

const app = express();

const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3000';
console.log(`[CONFIG] Redirects will point to: ${FRONTEND_URL}`);

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:3001';
console.log(`[CONFIG] Verification links will use base: ${BACKEND_URL}`);

// PayMongo configuration
const PAYMONGO_SECRET_KEY = process.env.PAYMONGO_SECRET_KEY;
const PAYMONGO_PUBLIC_KEY = process.env.PAYMONGO_PUBLIC_KEY; // kept for potential client-side uses
const PAYMONGO_WEBHOOK_SECRET = process.env.PAYMONGO_WEBHOOK_SECRET;
const PAYMONGO_MODE = process.env.PAYMONGO_MODE || 'test';
const PAYMONGO_API_BASE = 'https://api.paymongo.com/v1';

// Enhanced CORS configuration
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Accept'],
  credentials: true
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

// MySQL Connection (from environment variables)
const db = mysql.createConnection({
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASS || 'banana',
  database: process.env.DB_NAME || 'inkvistar',
  port: process.env.DB_PORT ? Number(process.env.DB_PORT) : 3306,
  connectTimeout: 10000, // 10 second timeout
  dateStrings: true // Force date columns to be returned as strings to prevent timezone shifts
});

// Connect to MySQL
db.connect(err => {
  if (err) {
    console.error('❌ MySQL Connection Error:', err.message);
    console.error('❌ Error code:', err.code);
    console.error('❌ Error SQL State:', err.sqlState);
  } else {
    console.log('✅ MySQL Connected Successfully!');
    console.log('📊 Database:', db.config.database);

    // Create Users Table if not exists (REQUIRED for all other tables)
    const usersTableQuery = `
      CREATE TABLE IF NOT EXISTS users (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        email VARCHAR(255) NOT NULL UNIQUE,
        password_hash VARCHAR(255) NOT NULL,
        user_type ENUM('admin', 'manager', 'artist', 'customer') NOT NULL,
        is_verified BOOLEAN DEFAULT 0,
        verification_token VARCHAR(255),
        otp_code VARCHAR(10),
        otp_expires DATETIME,
        push_token VARCHAR(255),
        is_deleted BOOLEAN DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `;
    db.query(usersTableQuery, (err) => {
      if (err) console.error('⚠️ Error checking users table:', err.message);
      else console.log('👤 Users table ready');
    });

    // Create Artists Table if not exists
    const artistsTableQuery = `
      CREATE TABLE IF NOT EXISTS artists (
        user_id INT PRIMARY KEY,
        studio_name VARCHAR(255),
        experience_years INT,
        specialization VARCHAR(255),
        hourly_rate DECIMAL(10, 2),
        commission_rate DECIMAL(5, 2) DEFAULT 0.60,
        rating DECIMAL(3, 2) DEFAULT 5.00,
        total_reviews INT DEFAULT 0,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `;
    db.query(artistsTableQuery, (err) => {
      if (err) console.error('⚠️ Error checking artists table:', err.message);
      else console.log('🎨 Artists table ready');

      // MIGRATION: Check if 'commission_rate' column exists, if not add it
      db.query("SHOW COLUMNS FROM artists LIKE 'commission_rate'", (err, results) => {
        if (!err && results.length === 0) {
          console.log('🔄 Migrating artists table: Adding commission_rate column...');
          db.query("ALTER TABLE artists ADD COLUMN commission_rate DECIMAL(5, 2) DEFAULT 0.60");
          console.log('✅ Added commission_rate column');
        }
      });

      // MIGRATION: Check if 'phone' column exists, if not add it
      db.query("SHOW COLUMNS FROM artists LIKE 'phone'", (err, results) => {
        if (!err && results.length === 0) {
          console.log('🔄 Migrating artists table: Adding phone column...');
          db.query("ALTER TABLE artists ADD COLUMN phone VARCHAR(20)");
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
      if (err) console.error('⚠️ Error checking notifications table:', err.message);
      else console.log('🔔 Notifications system ready');
    });

    // Create Customers Table if not exists (for extra profile info)
    const customerTableQuery = `
      CREATE TABLE IF NOT EXISTS customers (
        user_id INT PRIMARY KEY,
        phone VARCHAR(20),
        location VARCHAR(255),
        notes TEXT,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `;
    db.query(customerTableQuery, (err) => {
      if (err) console.error('⚠️ Error checking customers table:', err.message);
      else console.log('👤 Customers table ready');
      createDefaultUsers();

      // Add is_deleted column if it doesn't exist (Soft Delete support)
      db.query("SHOW COLUMNS FROM users LIKE 'is_deleted'", (err, results) => {
        if (!err && results.length === 0) {
          db.query("ALTER TABLE users ADD COLUMN is_deleted BOOLEAN DEFAULT 0");
          console.log('✅ Added is_deleted column for soft delete support');
        }

        db.query("SHOW COLUMNS FROM users LIKE 'push_token'", (err, results) => {
          if (!err && results.length === 0) {
            db.query("ALTER TABLE users ADD COLUMN push_token VARCHAR(255) NULL");
            console.log('✅ Added push_token column for notifications');
          }
        });
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
      if (err) console.error('⚠️ Error checking portfolio table:', err.message);
      else {
        console.log('🎨 Portfolio table ready');

        // MIGRATION: Check if 'category' column exists, if not add it
        db.query("SHOW COLUMNS FROM portfolio_works LIKE 'category'", (err, results) => {
          if (!err && results.length === 0) {
            console.log('🔄 Migrating portfolio table: Adding category column...');
            db.query("ALTER TABLE portfolio_works ADD COLUMN category VARCHAR(50)");
          }
        });

        // MIGRATION: Check if 'is_public' column exists, if not add it
        db.query("SHOW COLUMNS FROM portfolio_works LIKE 'is_public'", (err, results) => {
          if (!err && results.length === 0) {
            console.log('🔄 Migrating portfolio table: Adding is_public column...');
            db.query("ALTER TABLE portfolio_works ADD COLUMN is_public BOOLEAN DEFAULT 1");
          }
        });

        // MIGRATION: Check if 'price_estimate' column exists, if not add it
        db.query("SHOW COLUMNS FROM portfolio_works LIKE 'price_estimate'", (err, results) => {
          if (!err && results.length === 0) {
            console.log('🔄 Migrating portfolio table: Adding price_estimate column...');
            db.query("ALTER TABLE portfolio_works ADD COLUMN price_estimate DECIMAL(10, 2) DEFAULT NULL");
            console.log('✅ Added price_estimate column to portfolio_works');
          }
        });

        // FIX: Drop broken foreign key constraint if it exists
        db.query("ALTER TABLE portfolio_works DROP FOREIGN KEY fk_portfolio_artists", (err) => {
          if (!err) {
            console.log('🔧 Fixed: Dropped broken foreign key constraint fk_portfolio_artists');
            // Re-add correct constraint referencing users(id)
            db.query("ALTER TABLE portfolio_works ADD CONSTRAINT fk_portfolio_users FOREIGN KEY (artist_id) REFERENCES users(id) ON DELETE CASCADE", (err) => {
              if (!err) console.log('✅ Added correct foreign key constraint for portfolio_works');
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
      if (err) console.error('⚠️ Error checking branches table:', err.message);
      else console.log('🏢 Branches table ready');

      // Add is_deleted column if it doesn't exist
      db.query("SHOW COLUMNS FROM branches LIKE 'is_deleted'", (err, results) => {
        if (!err && results.length === 0) {
          db.query("ALTER TABLE branches ADD COLUMN is_deleted BOOLEAN DEFAULT 0");
          console.log('✅ Added is_deleted column to branches');
        }
      });
    });

    // Create Inventory Table
    const inventoryTableQuery = `
      CREATE TABLE IF NOT EXISTS inventory (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        category VARCHAR(50),
        current_stock INT DEFAULT 0,
        min_stock INT DEFAULT 10,
        max_stock INT DEFAULT 100,
        unit VARCHAR(20) DEFAULT 'pcs',
        supplier VARCHAR(255),
        cost DECIMAL(10, 2) DEFAULT 0.00,
        last_restocked DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `;
    db.query(inventoryTableQuery, (err) => {
      if (err) console.error('⚠️ Error checking inventory table:', err.message);
      else {
        console.log('📦 Inventory table ready');

        // MIGRATION: Check for current_stock column
        db.query("SHOW COLUMNS FROM inventory LIKE 'current_stock'", (err, results) => {
          if (!err && results.length === 0) {
            console.log('🔄 Migrating inventory: Adding current_stock column...');
            db.query("ALTER TABLE inventory ADD COLUMN current_stock INT DEFAULT 0");
          }
        });

        // MIGRATION: Check for min_stock column
        db.query("SHOW COLUMNS FROM inventory LIKE 'min_stock'", (err, results) => {
          if (!err && results.length === 0) {
            console.log('🔄 Migrating inventory: Adding min_stock column...');
            db.query("ALTER TABLE inventory ADD COLUMN min_stock INT DEFAULT 10");
          }
        });

        // MIGRATION: Check for max_stock column
        db.query("SHOW COLUMNS FROM inventory LIKE 'max_stock'", (err, results) => {
          if (!err && results.length === 0) {
            console.log('🔄 Migrating inventory: Adding max_stock column...');
            db.query("ALTER TABLE inventory ADD COLUMN max_stock INT DEFAULT 100");
          }
        });

        // MIGRATION: Check for unit column
        db.query("SHOW COLUMNS FROM inventory LIKE 'unit'", (err, results) => {
          if (!err && results.length === 0) {
            console.log('🔄 Migrating inventory: Adding unit column...');
            db.query("ALTER TABLE inventory ADD COLUMN unit VARCHAR(20) DEFAULT 'pcs'");
          }
        });

        // MIGRATION: Check for supplier column
        db.query("SHOW COLUMNS FROM inventory LIKE 'supplier'", (err, results) => {
          if (!err && results.length === 0) {
            console.log('🔄 Migrating inventory: Adding supplier column...');
            db.query("ALTER TABLE inventory ADD COLUMN supplier VARCHAR(255)");
          }
        });

        // MIGRATION: Check for cost column
        db.query("SHOW COLUMNS FROM inventory LIKE 'cost'", (err, results) => {
          if (!err && results.length === 0) {
            console.log('🔄 Migrating inventory: Adding cost column...');
            db.query("ALTER TABLE inventory ADD COLUMN cost DECIMAL(10, 2) DEFAULT 0.00");
          }
        });

        // MIGRATION: Check for last_restocked column
        db.query("SHOW COLUMNS FROM inventory LIKE 'last_restocked'", (err, results) => {
          if (!err && results.length === 0) {
            console.log('🔄 Migrating inventory: Adding last_restocked column...');
            db.query("ALTER TABLE inventory ADD COLUMN last_restocked DATETIME");
          }
        });

        // Add is_deleted column if it doesn't exist
        db.query("SHOW COLUMNS FROM inventory LIKE 'is_deleted'", (err, results) => {
          if (!err && results.length === 0) {
            db.query("ALTER TABLE inventory ADD COLUMN is_deleted BOOLEAN DEFAULT 0");
            console.log('✅ Added is_deleted column to inventory');
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
      if (err) console.error('⚠️ Error checking inventory transactions table:', err.message);
      else console.log('📜 Inventory transactions table ready');
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
        status VARCHAR(50) DEFAULT 'pending',
        is_deleted BOOLEAN DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (customer_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (artist_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `;
    db.query(appointmentsTableQuery, (err) => {
      if (err) console.error('⚠️ Error checking appointments table:', err.message);
      else {
        console.log('📅 Appointments table ready');

        // MIGRATION: Add 'price' column if it doesn't exist to prevent errors.
        db.query("SHOW COLUMNS FROM appointments LIKE 'price'", (err, results) => {
          if (!err && results.length === 0) {
            console.log('🔄 Migrating appointments table: Adding price column...');
            db.query("ALTER TABLE appointments ADD COLUMN price DECIMAL(10, 2) DEFAULT 0.00");
          }
        });

        // MIGRATION: Add 'payment_status' column if it doesn't exist
        db.query("SHOW COLUMNS FROM appointments LIKE 'payment_status'", (err, results) => {
          if (!err && results.length === 0) {
            console.log('🔄 Migrating appointments table: Adding payment_status column...');
            db.query("ALTER TABLE appointments ADD COLUMN payment_status VARCHAR(20) DEFAULT 'unpaid'");
          }
        });

        // MIGRATION: Ensure status is VARCHAR(50) to avoid truncation if it was ENUM
        db.query("ALTER TABLE appointments MODIFY COLUMN status VARCHAR(50) DEFAULT 'pending'", (err) => {
          if (!err) console.log('✅ Ensured appointments status is VARCHAR(50)');
        });

        // FIX: Try to drop the specific problematic constraint if it exists
        db.query("ALTER TABLE appointments DROP FOREIGN KEY fk_appointments_artist", (err) => {
          if (!err) {
            console.log('🔧 Fixed: Dropped broken foreign key constraint fk_appointments_artist');
            // Re-add correct constraint referencing users(id)
            db.query("ALTER TABLE appointments ADD CONSTRAINT fk_appointments_artist_fixed FOREIGN KEY (artist_id) REFERENCES users(id) ON DELETE CASCADE", (err) => {
              if (!err) console.log('✅ Added correct foreign key constraint for artist_id');
            });
          }
        });
      }
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
      if (err) console.error('⚠️ Error checking payments table:', err.message);
      else console.log('💳 Payments table ready');
    });

    // Create Invoices Table
    const invoicesTableQuery = `
      CREATE TABLE IF NOT EXISTS invoices (
        id INT AUTO_INCREMENT PRIMARY KEY,
        client_name VARCHAR(255),
        service_type VARCHAR(255),
        amount DECIMAL(10, 2),
        status VARCHAR(50) DEFAULT 'Pending',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `;
    db.query(invoicesTableQuery, (err) => { if (err) console.error('⚠️ Error checking invoices table:', err.message); });

    // Check appointments table for is_deleted
    db.query("SHOW COLUMNS FROM appointments LIKE 'is_deleted'", (err, results) => {
      if (!err && results.length === 0) {
        db.query("ALTER TABLE appointments ADD COLUMN is_deleted BOOLEAN DEFAULT 0");
        console.log('✅ Added is_deleted column to appointments');
      }
    });

    // Check portfolio_works table for is_deleted
    db.query("SHOW COLUMNS FROM portfolio_works LIKE 'is_deleted'", (err, results) => {
      if (!err && results.length === 0) {
        db.query("ALTER TABLE portfolio_works ADD COLUMN is_deleted BOOLEAN DEFAULT 0");
        console.log('✅ Added is_deleted column to portfolio_works');
      }
    });

    // Create App Settings Table (Key-Value store for configs)
    const settingsTableQuery = `
      CREATE TABLE IF NOT EXISTS app_settings (
        section VARCHAR(50) PRIMARY KEY,
        data JSON
      )
    `;
    db.query(settingsTableQuery, (err) => { if (err) console.error('⚠️ Error checking settings table:', err.message); });

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
    db.query(auditLogsTableQuery, (err) => { if (err) console.error('⚠️ Error checking audit_logs table:', err.message); else console.log('📜 Audit Logs table ready'); });

  }
});

// ========== EMAIL SETUP (API-BASED) ==========
// Using Resend API (Recommended for Vercel/Render)
const EMAIL_API_KEY = process.env.EMAIL_API_KEY;
const EMAIL_FROM = process.env.EMAIL_FROM || 'onboarding@resend.dev';

async function sendEmail(to, subject, html) {
  if (!EMAIL_API_KEY) {
    console.log('⚠️ EMAIL_API_KEY missing. Email logged to console.');
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
      console.error('❌ Resend API Error:', response.status, errorData);
      throw new Error(`Resend API Error: ${response.status} - ${JSON.stringify(errorData)}`);
    } else {
      console.log(`✅ Email sent to ${to}`);
    }
  } catch (error) {
    console.error('❌ Email Network Error:', error.message);
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
function createNotification(userId, title, message, type, relatedId = null) {
  const insertQuery = 'INSERT INTO notifications (user_id, title, message, type, related_id, created_at, is_read) VALUES (?, ?, ?, ?, ?, NOW(), 0)';
  db.query(insertQuery, [userId, title, message, type, relatedId], (err, result) => {
    if (err) {
      console.error('❌ Error creating DB notification:', err.message);
    } else {
      console.log(`🔔 DB Notification created for user ${userId}: ${title}`);
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
      console.log(`📲 Skipping push notification for user ${userId}: No token found.`);
      return;
    }

    const pushToken = results[0].push_token;
    console.log(`📲 Sending push notification to token: ${pushToken}`);

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
  const query = 'INSERT INTO audit_logs (user_id, action, details, ip_address, created_at) VALUES (?, ?, ?, ?, NOW())';
  db.query(query, [userId, action, details, ip], (err) => {
    if (err) console.error('❌ Error logging action:', err.message);
  });
}

// Helper: Create Default Users (Admin, Artist, Customer)
function createDefaultUsers() {
  // 1. Admin
  const checkAdmin = "SELECT * FROM users WHERE user_type = 'admin' LIMIT 1";
  db.query(checkAdmin, async (err, results) => {
    if (!err && results.length === 0) {
      console.log('⚠️ No admin found. Creating default admin...');
      try {
        const adminPass = await bcrypt.hash('admin123', 10);
        const createAdmin = "INSERT INTO users (name, email, password_hash, user_type, is_verified) VALUES ('System Admin', 'admin@inkvistar.com', ?, 'admin', 1)";
        db.query(createAdmin, [adminPass], (err) => {
          if (!err) console.log('✅ Default Admin Created: admin@inkvistar.com / admin123');
          else console.error('❌ Failed to create admin:', err.message);
        });
      } catch (e) {
        console.error('❌ Error creating admin hash:', e);
      }
    }
  });

  // 2. Artist
  const checkArtist = "SELECT * FROM users WHERE email = 'artist@inkvistar.com' LIMIT 1";
  db.query(checkArtist, async (err, results) => {
    if (!err && results.length === 0) {
      console.log('⚠️ No default artist found. Creating default artist...');
      try {
        const artistPass = await bcrypt.hash('artist123', 10);
        const createArtist = "INSERT INTO users (name, email, password_hash, user_type, is_verified) VALUES ('Default Artist', 'artist@inkvistar.com', ?, 'artist', 1)";
        db.query(createArtist, [artistPass], (err, result) => {
          if (!err && result.insertId) {
            const artistId = result.insertId;
            const createProfile = "INSERT INTO artists (user_id, studio_name, experience_years, specialization, hourly_rate, commission_rate) VALUES (?, 'InkVistAR Studio', 5, 'Realism', 150.00, 0.60)";
            db.query(createProfile, [artistId], (err) => {
              if (!err) console.log('✅ Default Artist Created: artist@inkvistar.com / artist123');
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
      console.log('⚠️ No default customer found. Creating default customer...');
      try {
        const customerPass = await bcrypt.hash('customer123', 10);
        const createCustomer = "INSERT INTO users (name, email, password_hash, user_type, is_verified) VALUES ('Default Customer', 'customer@inkvistar.com', ?, 'customer', 1)";
        db.query(createCustomer, [customerPass], (err, result) => {
          if (!err && result.insertId) {
            const customerId = result.insertId;
            const createProfile = "INSERT INTO customers (user_id, phone, location) VALUES (?, '555-0123', 'New York, NY')";
            db.query(createProfile, [customerId], (err) => {
              if (!err) console.log('✅ Default Customer Created: customer@inkvistar.com / customer123');
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
    console.error('❌ Failed to initialize Groq:', e.message);
  }
}

// Verify API Key on startup
async function verifyGroq() {
  if (!groq) {
    console.log('⚠️ Chatbot will run in OFFLINE MODE (No API Key).');
    return;
  }
  try {
    console.log('🤖 Verifying Groq API Key...');
    const chatCompletion = await groq.chat.completions.create({
      messages: [{ role: 'user', content: 'Hello' }],
      model: 'llama-3.3-70b-versatile',
    });
    console.log('✅ Groq API is WORKING! Response:', chatCompletion.choices[0].message.content);
  } catch (error) {
    console.error('❌ Groq API Check Failed:', error.message);
    console.log('⚠️ Chatbot will run in OFFLINE MODE (Fallback responses).');
  }
}
verifyGroq();

// ========== MIDDLEWARE ==========
app.use((req, res, next) => {
  console.log(`\n🌐 ${new Date().toISOString()} ${req.method} ${req.url}`);
  console.log('📦 Headers:', req.headers);
  console.log('📤 Body:', req.body);
  next();
});

// ========== DEBUG ENDPOINTS ==========

// Test endpoint
app.get('/api/test', (req, res) => {
  console.log('✅ Test endpoint called');
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
  console.log('🔍 Testing database...');

  db.query('SELECT 1 + 1 AS result', (err, results) => {
    if (err) {
      console.error('❌ Database test failed:', err);
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
  console.log('🔍 Listing all users...');

  db.query('SELECT id, name, email, user_type, is_deleted FROM users', (err, results) => {
    if (err) {
      console.error('❌ Error:', err);
      return res.status(500).json({
        success: false,
        message: 'Database error'
      });
    }

    console.log(`📊 Found ${results.length} users`);
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
  console.log(`🔍 Checking user ${id}...`);

  db.query('SELECT id, name, email, user_type FROM users WHERE id = ?', [id], (err, results) => {
    if (err) {
      console.error('❌ Error:', err);
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
  console.log('📤 Body:', req.body);

  try {
    const { email, password, type } = req.body;

    if (!email || !password) {
      console.log('❌ Missing fields');
      return res.status(400).json({
        success: false,
        message: 'Email and password are required'
      });
    }

    console.log(`🔍 Searching for user: ${email}`);

    // Query database
    let query = 'SELECT * FROM users WHERE email = ?';
    let params = [email];

    if (type) {
      query += ' AND user_type = ?';
      params.push(type);
    }

    console.log('💾 Executing query:', query);

    db.query(query, params, async (err, results) => {
      if (err) {
        console.error('❌ Database error:', err.message);
        return res.status(500).json({
          success: false,
          message: 'Database error'
        });
      }

      console.log(`📊 Found ${results.length} users`);

      if (results.length === 0) {
        console.log('❌ No user found');
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

      // Skip verification check for artists and admins (admin managed)
      if (user.user_type !== 'artist' && user.user_type !== 'admin' && user.is_verified === 0) {
        return res.status(403).json({
          success: false,
          message: 'Please verify your email first. Check your inbox!',
          requireVerification: true
        });
      }

      console.log('✅ User found:', user.name);

      // Verify password
      const valid = await bcrypt.compare(password, user.password_hash);
      if (!valid) {
        return res.status(401).json({
          success: false,
          message: 'Invalid email or password'
        });
      }

      console.log('🎉 LOGIN SUCCESSFUL!');

      const ua = req.headers['user-agent'] || 'Unknown';
      const device = ua.length > 40 ? ua.substring(0, 40) + '...' : ua;
      logAction(user.id, 'LOGIN', `Logged in as ${user.user_type} on ${device}`, req.ip || '::1');

      // Successful login
      res.json({
        success: true,
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          type: user.user_type
        },
        message: 'Login successful!'
      });
    });

  } catch (error) {
    console.error('🔥 Unhandled error in login:', error);
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
  console.log('🔐 Resetting password for:', email);

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
      console.error('❌ DB error on password reset:', err.message);
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

    db.query('UPDATE users SET password_hash = ?, otp_code = NULL, otp_expires = NULL WHERE email = ?', [password_hash, email], (updateErr, result) => {
      if (updateErr) return res.status(500).json({ success: false, message: 'Database error during password update.' });
      logAction(user.id, 'PASSWORD_RESET', `User reset their password.`, req.ip || '::1');
      res.json({ success: true, message: 'Password updated successfully' });
    });
  });
});

// ========== OTP ENDPOINTS ==========

app.post('/api/send-otp', (req, res) => {
  const { email, user_type } = req.body;
  console.log('📧 SEND OTP:', email);

  // Verify email/password first (reuse login logic check)
  db.query('SELECT * FROM users WHERE email = ?', [email], async (err, results) => {
    if (err || !results.length) {
      return res.json({ success: false, message: 'Invalid credentials' });
    }

    // Skip verification check for artists and admins
    if (results[0].user_type !== 'artist' && results[0].user_type !== 'admin' && results[0].is_verified === 0) {
      return res.json({ success: false, message: 'Please verify email first' });
    }

    // Generate 6-digit OTP + 5min expiry
    const otp_code = Math.floor(100000 + Math.random() * 900000).toString();
    const otp_expires = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes

    // Save to DB
    db.query(
      'UPDATE users SET otp_code = ?, otp_expires = ? WHERE email = ?',
      [otp_code, otp_expires, email],
      (updateErr) => {
        if (updateErr) return res.json({ success: false, message: 'DB error' });

        // LOG OTP FOR DEBUGGING (Essential if email fails)
        console.log('🔑 [DEBUG] OTP for', email, ':', otp_code);

        // 🚀 OPTIMIZATION: Respond to app IMMEDIATELY, don't wait for email
        res.json({ success: true, message: 'OTP sent to your email!' });

        // Send email in background
        const html = `
          <h2>Your InkVistAR OTP</h2>
          <p><strong>${otp_code}</strong></p>
          <p>This code expires in 5 minutes.</p>
        `;
        sendEmail(email, 'InkVistAR Login - Your OTP Code', html);
      }
    );
  });
});

app.post('/api/verify-otp', (req, res) => {
  const { email, otp, user_type } = req.body;
  // Handle both 'otp' and 'otp_code' from frontend
  const code = otp || req.body.otp_code;

  console.log('🔢 VERIFY OTP:', email, code);

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

    console.log('✅ OTP VERIFIED:', email);
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
      return res.send('<h2 style="color: red">Invalid or expired verification link.</h2>');
    }
    console.log('VERIFIED:', email);
    const loginUrl = `${FRONTEND_URL}/login`;

    res.send(`
      <html>
        <head>
          <title>Email Verified</title>
          <style>
            body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; display: flex; justify-content: center; align-items: center; height: 100vh; background-color: #f3f4f6; margin: 0; }
            .container { text-align: center; background: white; padding: 40px; border-radius: 16px; box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1); max-width: 400px; width: 90%; }
            h2 { color: #059669; margin-top: 0; }
            p { color: #4b5563; margin-bottom: 24px; line-height: 1.5; }
            .btn { background-color: #daa520; color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px; font-weight: 600; display: inline-block; transition: background 0.2s; }
            .btn:hover { background-color: #b8860b; }
          </style>
        </head>
        <body>
          <div class="container">
            <h2>Email Verified Successfully!</h2>
            <p>Your account is now active. You can return to the InkVistAR website or app to login.</p>
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
    console.log('\n📝 ========== REGISTER REQUEST ==========');
    console.log('📤 Request body:', req.body);

    const { firstName, lastName, name, email, password, type, phone, preferences } = req.body;

    // Handle combined name if firstName/lastName not provided (backward compatibility)
    const fullName = (firstName && lastName) ? `${firstName} ${lastName}` : (name || 'Unknown User');

    // Validation
    if (!fullName || !email || !password || !type) {
      console.log('❌ Missing fields');
      return res.status(400).json({
        success: false,
        message: 'All fields are required'
      });
    }

    // Check if user already exists
    db.query('SELECT * FROM users WHERE email = ?', [email], async (err, results) => {
      if (err) {
        console.error('❌ Database error checking user:', err.message);
        return res.status(500).json({
          success: false,
          message: 'Database error'
        });
      }

      if (results.length > 0) {
        console.log('❌ User already exists:', email);
        return res.status(400).json({
          success: false,
          message: 'Email already registered'
        });
      }

      // Hash password
      console.log('🔑 Hashing password...');
      const password_hash = await bcrypt.hash(password, 10);
      console.log('🔑 Password hashed successfully');

      // Insert user
      const verification_token = crypto.randomBytes(32).toString('hex');

      const insertQuery = 'INSERT INTO users (name, email, password_hash, user_type, is_verified, verification_token) VALUES (?, ?, ?, ?, 0, ?)';
      console.log('💾 Executing query:', insertQuery);

      db.query(insertQuery, [fullName, email, password_hash, type, verification_token], (insertErr, result) => {
        if (insertErr) {
          console.error('❌ Error inserting user:', insertErr.message);
          return res.status(500).json({
            success: false,
            message: `Database error: ${insertErr.message}`
          });
        }

        console.log('✅ User inserted successfully!');
        console.log('✅ Insert ID:', result.insertId);

        logAction(result.insertId, 'REGISTER', `New ${type} account registered: ${email}`, req.ip || '::1');

        const newUserId = result.insertId;
        // Send Verification Email
        const verifyUrl = `${BACKEND_URL}/api/verify?token=${verification_token}&email=${email}`;

        // LOG VERIFICATION LINK (Fix for development/Gmail issues)
        console.log('🔑 [DEBUG] Verification Link:', verifyUrl);

        const html = `
          <h2>Welcome to InkVistAR, ${fullName}!</h2>
          <p>Your account is almost ready. Please verify your email:</p>
          <a href="${verifyUrl}" style="background: #daa520; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold">Verify Email Address</a>
          <p>Or copy-paste: ${verifyUrl}</p>
          <p>This link expires in 24 hours.</p>
        `;
        sendEmail(email, 'Verify Your InkVistAR Account', html);

        // If the user is an artist, create a corresponding entry in the 'artists' table
        if (type === 'artist') {
          const artistQuery = 'INSERT INTO artists (user_id, studio_name, experience_years, specialization, hourly_rate) VALUES (?, ?, ?, ?, ?)';
          // Using some default values
          db.query(artistQuery, [newUserId, `${fullName}'s Studio`, 0, 'New Artist', 50.00], (artistErr, artistResult) => {
            if (artistErr) {
              console.error('❌ Error creating artist profile:', artistErr.message);
              // Rollback: Delete the user if artist profile creation fails
              db.query('DELETE FROM users WHERE id = ?', [newUserId]);
              return res.status(500).json({ success: false, message: 'Failed to create artist profile. Please try again.' });
            }
            console.log('✅ Artist profile created for user ID:', newUserId);
            sendSuccessResponse(newUserId);
          });
        } else if (type === 'customer') {
          // Create customer profile with phone and preferences (stored in notes)
          const customerQuery = 'INSERT INTO customers (user_id, phone, notes) VALUES (?, ?, ?)';
          db.query(customerQuery, [newUserId, phone || '', preferences || ''], (custErr) => {
            if (custErr) {
              console.error('❌ Error creating customer profile:', custErr.message);
            } else {
              console.log('✅ Customer profile created for user ID:', newUserId);
            }
            sendSuccessResponse(newUserId);
          });
        } else {
          sendSuccessResponse(newUserId);
        }

        function sendSuccessResponse(userId) {
          res.json({
            success: true,
            message: 'Account created! Please check your email to verify.',
            user: {
              id: userId,
              name: fullName,
              email: email,
              type: type
            }
          });
        }
      });
    });

  } catch (error) {
    console.error('❌ Unexpected error in register:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// ========== ARTIST DASHBOARD (SIMPLIFIED) ==========
app.get('/api/artist/dashboard/:artistId', (req, res) => {
  const { artistId } = req.params;
  console.log(`📊 Artist dashboard requested: ${artistId}`);

  // Add timeout
  const timeout = setTimeout(() => {
    console.log('❌ Dashboard query timeout');
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
      u.user_type,
      COALESCE(a.studio_name, 'My Studio') as studio_name,
      COALESCE(a.experience_years, 0) as experience_years,
      COALESCE(a.specialization, 'General Artist') as specialization,
      COALESCE(a.hourly_rate, 0) as hourly_rate,
      COALESCE(a.commission_rate, 0.60) as commission_rate,
      COALESCE(a.rating, 0) as rating,
      COALESCE(a.total_reviews, 0) as total_reviews
    FROM users u
    LEFT JOIN artists a ON u.id = a.user_id
    WHERE u.id = ? AND u.user_type = 'artist'
  `;

  console.log('🔍 Executing query:', query, [artistId]);

  db.query(query, [artistId], (err, results) => {
    clearTimeout(timeout);

    if (err) {
      console.error('❌ Database error:', err.message);
      console.error('❌ Full error:', err);

      // Return a proper error instead of mock data
      return res.status(500).json({
        success: false,
        message: `Database error fetching artist dashboard: ${err.message}`
      });
    }

    console.log(`📊 Query results: ${results.length} rows`);

    if (results.length === 0) {
      console.log('❌ No artist found');
      return res.status(404).json({
        success: false,
        message: 'Artist not found'
      });
    }

    const artist = results[0];
    console.log('✅ Artist found:', artist.name);

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
      const commissionRate = artist.commission_rate || 0.60;

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
            studio_name: artist.studio_name,
            experience_years: artist.experience_years,
            specialization: artist.specialization,
            hourly_rate: artist.hourly_rate,
            commission_rate: artist.commission_rate,
            rating: Number(artist.rating),
            total_reviews: artist.total_reviews
          },
          appointments: appointments,
          works: [],
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

// ========== ARTIST SPECIFIC ENDPOINTS ==========

// Get artist's appointments
app.get('/api/artist/:artistId/appointments', (req, res) => {
  const { artistId } = req.params;
  const { status, date } = req.query;

  let query = `
    SELECT ap.*, u.name as client_name, u.email as client_email, ar.commission_rate
    FROM appointments ap
    JOIN users u ON ap.customer_id = u.id
    LEFT JOIN artists ar ON ap.artist_id = ar.user_id
    WHERE ap.artist_id = ? AND ap.is_deleted = 0
  `;

  const params = [artistId];

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
      console.error('❌ Error fetching appointments:', err);
      return res.status(500).json({ success: false, message: 'DB Error (Get Appts): ' + err.message });
    }

    res.json({ success: true, appointments: results });
  });
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
      console.error('❌ Error fetching clients:', err);
      return res.status(500).json({ success: false, message: 'DB Error (Get Clients): ' + err.message });
    }

    res.json({ success: true, clients: results });
  });
});

// Update Artist Profile
app.put('/api/artist/profile/:id', (req, res) => {
  const { id } = req.params;
  const { name, specialization, hourly_rate, experience_years, commission_rate, phone } = req.body;

  // Update users table (name)
  db.query('UPDATE users SET name = ? WHERE id = ?', [name, id], (err) => {
    if (err) return res.status(500).json({ success: false, message: 'DB Error (User)' });

    // Update artists table
    let artistQuery = 'UPDATE artists SET specialization = ?';
    const params = [specialization];

    if (hourly_rate !== undefined) {
      artistQuery += ', hourly_rate = ?';
      params.push(hourly_rate);
    }
    if (experience_years !== undefined) {
      artistQuery += ', experience_years = ?';
      params.push(experience_years);
    }
    if (commission_rate !== undefined) {
      artistQuery += ', commission_rate = ?';
      params.push(commission_rate);
    }
    if (phone !== undefined) {
      artistQuery += ', phone = ?';
      params.push(phone);
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
        console.error('❌ Error fetching portfolio:', err);
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
    console.log(`📸 Uploading work: "${title}", Category: ${category}, Public: ${isPublic}, Price: ${priceEstimate || 'N/A'}`);
  }

  const parsedPrice = priceEstimate ? parseFloat(priceEstimate) : null;
  const query = 'INSERT INTO portfolio_works (artist_id, image_url, title, description, category, is_public, price_estimate, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, NOW())';

  db.query(query, [artistId, imageUrl, title, description, category, isPublic, parsedPrice], (err, result) => {
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
      console.error('❌ Error updating portfolio visibility:', err);
      return res.status(500).json({ success: false, message: 'Database error' });
    }
    res.json({ success: true, message: 'Visibility updated successfully' });
  });
});

// Artist: Create Appointment
app.post('/api/artist/appointments', (req, res) => {
  const { artistId, clientEmail, date, startTime, designTitle } = req.body;

  console.log('📅 Request to schedule:', { artistId, clientEmail, date, startTime });

  // Find client by email
  db.query('SELECT id FROM users WHERE email = ?', [clientEmail], (err, results) => {
    if (err) {
      console.error('❌ Error finding client:', err);
      return res.status(500).json({ success: false, message: 'DB Error (Find Client): ' + err.message });
    }

    if (results.length === 0) {
      return res.status(404).json({ success: false, message: 'Client email not found. Please add client first.' });
    }

    const customerId = results[0].id;

    // Insert appointment
    const query = `
      INSERT INTO appointments 
      (customer_id, artist_id, appointment_date, start_time, end_time, design_title, status, price)
      VALUES (?, ?, ?, ?, ?, ?, 'confirmed', 0)
    `;

    // Simple end time (same as start for now)
    db.query(query, [customerId, artistId, date, startTime, startTime, designTitle], (err, result) => {
      if (err) {
        console.error('❌ Error creating appointment:', err);
        return res.status(500).json({ success: false, message: 'DB Error (Insert Appt): ' + err.message });
      }

      // Notify Client
      createNotification(customerId, 'New Appointment', `Artist scheduled: ${designTitle} on ${date}`, 'appointment_new', result.insertId);

      res.json({ success: true, message: 'Appointment scheduled successfully' });
    });
  });
});

// Artist: Add New Client
app.post('/api/artist/clients', async (req, res) => {
  const { name, email, password } = req.body;
  console.log('👤 Request to add client:', { name, email });

  try {
    // Create user with provided password or default '123123123A!'
    const plainPassword = password || '123123123A!';
    const password_hash = await bcrypt.hash(plainPassword, 10);
    const query = 'INSERT INTO users (name, email, password_hash, user_type) VALUES (?, ?, ?, "customer")';

    db.query(query, [name, email, password_hash], (err, result) => {
      if (err) {
        console.error('❌ Error adding client:', err);
        if (err.code === 'ER_DUP_ENTRY') {
          return res.status(400).json({ success: false, message: 'Email already exists' });
        }
        return res.status(500).json({ success: false, message: 'DB Error (Add Client): ' + err.message });
      }
      res.json({ success: true, message: 'Client profile created successfully' });
    });
  } catch (e) {
    console.error('❌ Server error:', e);
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
    SELECT u.name, u.email, c.phone, c.location, c.notes
    FROM users u 
    LEFT JOIN customers c ON u.id = c.user_id 
    WHERE u.id = ?
  `;
  db.query(query, [id], (err, results) => {
    if (err) return res.status(500).json({ success: false, message: 'DB Error' });
    if (results.length === 0) return res.status(404).json({ success: false, message: 'User not found' });
    res.json({ success: true, profile: results[0] });
  });
});

// Update Customer Profile
app.put('/api/customer/profile/:id', (req, res) => {
  const { id } = req.params;
  const { name, phone, location, notes } = req.body;

  // This logic is improved to handle partial updates correctly and prevent data loss.
  // It also fixes the bug where updating only the name would incorrectly show an error.
  const updateUserPromise = new Promise((resolve, reject) => {
    if (name === undefined) return resolve();
    db.query('UPDATE users SET name = ? WHERE id = ?', [name, id], (err) => {
      if (err) return reject({ message: 'DB Error (User)' });
      resolve();
    });
  });

  const updateCustomerPromise = new Promise((resolve, reject) => {
    const hasCustomerFields = phone !== undefined || location !== undefined || notes !== undefined;
    if (!hasCustomerFields) return resolve();

    const customerQuery = 'INSERT INTO customers (user_id, phone, location, notes) VALUES (?, ?, ?, ?) ON DUPLICATE KEY UPDATE phone = VALUES(phone), location = VALUES(location), notes = VALUES(notes)';

    // Fetch existing data to avoid overwriting fields with null if they aren't provided.
    db.query('SELECT phone, location, notes FROM customers WHERE user_id = ?', [id], (selectErr, results) => {
      if (selectErr) return reject({ message: 'DB Error (Customer Select)' });

      const existing = results[0] || {};
      const finalPhone = phone !== undefined ? phone : existing.phone;
      const finalLocation = location !== undefined ? location : existing.location;
      const finalNotes = notes !== undefined ? notes : existing.notes;

      db.query(customerQuery, [id, finalPhone, finalLocation, finalNotes], (upsertErr) => {
        if (upsertErr) return reject({ message: 'DB Error (Customer Upsert)' });
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

// Get all available portfolio categories
app.get('/api/gallery/categories', (req, res) => {
  const query = 'SELECT DISTINCT category FROM portfolio_works WHERE category IS NOT NULL AND category != "" AND is_deleted = 0 AND is_public = 1 ORDER BY category ASC';
  db.query(query, (err, results) => {
    if (err) {
      console.error('❌ Error fetching categories:', err);
      return res.status(500).json({ success: false, message: 'Database error' });
    }
    const categories = results.map(r => r.category);
    res.json({ success: true, categories: ['All', ...categories] });
  });
});

// Get all works for a public gallery
app.get('/api/gallery/works', (req, res) => {
  const { category } = req.query;

  const query = `
    SELECT 
      pw.id,
      pw.title,
      pw.description,
      pw.image_url,
      pw.category,
      pw.price_estimate,
      pw.created_at,
      u.name as artist_name,
      a.studio_name
    FROM portfolio_works pw
    JOIN users u ON pw.artist_id = u.id
    LEFT JOIN artists a ON u.id = a.user_id
    WHERE pw.is_deleted = 0 AND pw.is_public = 1
    ${category && category !== 'All' ? 'AND pw.category = ?' : ''}
    ORDER BY pw.created_at DESC
    LIMIT 100
  `;

  const params = [];
  if (category && category !== 'All') {
    params.push(category);
  }

  db.query(query, params, (err, results) => {
    if (err) {
      console.error('❌ Error fetching gallery works:', err);
      return res.status(500).json({ success: false, message: 'Database error' });
    }
    res.json({ success: true, works: results });
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
    SELECT appointment_date, start_time, status
    FROM appointments
    WHERE artist_id = ? 
    AND status != 'cancelled' 
    AND is_deleted = 0
    AND appointment_date >= CURDATE()
  `;

  db.query(query, [artistId], (err, results) => {
    if (err) return res.status(500).json({ success: false, message: 'DB Error: ' + err.message });
    res.json({ success: true, bookings: results });
  });
});

// Customer book appointment
app.post('/api/customer/appointments', (req, res) => {
  console.log('📅 Customer booking request:', req.body);
  const { customerId, artistId, date, startTime, endTime, designTitle, notes, referenceImage, price } = req.body;

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

  const today = new Date();
  today.setHours(0, 0, 0, 0); // Set to beginning of today
  const appointmentDate = new Date(date);
  appointmentDate.setHours(0, 0, 0, 0); // Also zero out time for comparison

  if (appointmentDate <= today) {
    return res.status(400).json({ success: false, message: 'Appointments cannot be booked for the same day or past dates.' });
  }
  // --- End Validation ---

  // Ensure endTime has a value (default to startTime if missing)
  const finalStartTime = startTime || null;
  const finalEndTime = endTime || startTime || null;
  // If no time provided (Tattoo Session), set status to pending_schedule
  const bookingStatus = startTime ? 'pending' : 'pending_schedule';

  const query = `
    INSERT INTO appointments 
    (customer_id, artist_id, appointment_date, start_time, end_time, design_title, notes, reference_image, status, price)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `;

  db.query(query, [customerId, artistId, date, finalStartTime, finalEndTime, designTitle, notes, referenceImage, bookingStatus, price || 0], (err, result) => {
    if (err) {
      console.error('❌ Error booking appointment:', err);
      return res.status(500).json({ success: false, message: 'Database error: ' + err.message });
    }

    // Notify Artist
    const notifDate = date || 'an upcoming date';
    createNotification(artistId, 'New Booking Request', `New request from client for ${notifDate}`, 'appointment_request', result.insertId);

    res.json({
      success: true,
      message: 'Appointment booked successfully',
      appointmentId: result.insertId
    });
  });
});

// Get customer's appointments
app.get('/api/customer/:customerId/appointments', (req, res) => {
  const { customerId } = req.params;
  const query = `
    SELECT ap.*, ap.price, u.name as artist_name, u.email as artist_email, COALESCE(a.studio_name, 'Independent Artist') as studio_name
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

// ========== GALLERY ENDPOINT ==========
// Get public gallery works (for customer gallery screen)
app.get('/api/gallery/works', (req, res) => {
  const { search, category } = req.query;

  let query = `
    SELECT pw.id, pw.title, pw.description, pw.image_url, pw.category, pw.price_estimate, pw.created_at,
           u.name as artist_name
    FROM portfolio_works pw
    JOIN users u ON pw.artist_id = u.id
    WHERE pw.is_public = 1 AND (pw.is_deleted = 0 OR pw.is_deleted IS NULL)
  `;
  const params = [];

  if (search) {
    query += ` AND (pw.title LIKE ? OR pw.description LIKE ? OR u.name LIKE ? OR pw.category LIKE ?)`;
    const searchParam = `%${search}%`;
    params.push(searchParam, searchParam, searchParam, searchParam);
  }

  if (category) {
    query += ` AND pw.category = ?`;
    params.push(category);
  }

  query += ` ORDER BY pw.created_at DESC LIMIT 100`;

  db.query(query, params, (err, results) => {
    if (err) {
      console.error('❌ Error fetching gallery works:', err);
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
      console.error('❌ Error fetching Art of the Day (today):', err);
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
        console.error('❌ Error fetching Art of the Day (latest):', latestErr);
        return res.status(500).json({ success: false, message: 'Database error' });
      }

      if (latestResults.length > 0) {
        return res.json({ success: true, work: latestResults[0] });
      }

      return res.status(404).json({ success: false, message: 'No public portfolio works found.' });
    });
  });
});

// Update appointment status
app.put('/api/appointments/:id/status', (req, res) => {
  const { id } = req.params;
  const { status } = req.body;

  // Fetch appointment first to get user IDs for notification
  db.query('SELECT * FROM appointments WHERE id = ?', [id], (err, results) => {
    if (err) {
      console.error('❌ Error fetching appointment for status update:', err);
      return res.status(500).json({ success: false, message: 'Database error' });
    }

    if (results.length === 0) {
      return res.status(404).json({ success: false, message: 'Appointment not found' });
    }

    const appointment = results[0];
    const { price } = req.body;

    let updateQuery = 'UPDATE appointments SET status = ?';
    let queryParams = [status];

    if (price !== undefined && price !== null) {
      updateQuery += ', price = ?';
      queryParams.push(price);
    }

    updateQuery += ' WHERE id = ?';
    queryParams.push(id);

    db.query(updateQuery, queryParams, (updateErr, result) => {
      if (updateErr) {
        console.error('Error updating appointment:', updateErr);
        return res.status(500).json({ success: false, message: 'Database error' });
      }

      // Send Notifications
      if (status === 'confirmed') {
        createNotification(appointment.customer_id, 'Appointment Confirmed', 'Your appointment has been confirmed!', 'appointment_confirmed', id);
        createNotification(appointment.artist_id, 'Appointment Confirmed', 'You have confirmed the appointment.', 'appointment_confirmed', id);
      } else if (status === 'cancelled') {
        createNotification(appointment.customer_id, 'Appointment Cancelled', 'Your appointment has been cancelled.', 'appointment_cancelled', id);
        createNotification(appointment.artist_id, 'Appointment Cancelled', 'An appointment has been cancelled.', 'appointment_cancelled', id);
      } else if (status === 'completed') {
        createNotification(appointment.customer_id, 'Appointment Completed', 'Thanks for visiting! Please leave a review.', 'appointment_completed', id);
      }

      res.json({ success: true, message: 'Appointment status updated' });
    });
  });
});

// Update appointment details (Notes, Supplies, Photos)
app.put('/api/appointments/:id/details', (req, res) => {
  const { id } = req.params;
  const { notes, beforePhoto, afterPhoto } = req.body;

  // In a real app, we would save photos to disk/S3 and store URLs in DB
  // For this prototype, we'll just update the notes field which now includes supply logs

  const query = 'UPDATE appointments SET notes = ? WHERE id = ?';

  db.query(query, [notes, id], (err, result) => {
    if (err) {
      console.error('Error updating appointment details:', err);
      return res.status(500).json({ success: false, message: 'Database error' });
    }

    if (beforePhoto || afterPhoto) {
      console.log(`📸 Photos received for appointment ${id} (Storage not implemented in prototype)`);
    }

    res.json({ success: true, message: 'Details updated successfully' });
  });
});

// ========== PAYMENT ENDPOINTS (PayMongo Checkout) ==========

// Create a PayMongo Checkout Session
app.post('/api/payments/create-checkout-session', async (req, res) => {
  const { appointmentId, price: providedPrice } = req.body;

  if (!appointmentId) {
    return res.status(400).json({ success: false, message: 'appointmentId is required' });
  }

  if (!PAYMONGO_SECRET_KEY) {
    return res.status(500).json({ success: false, message: 'PAYMONGO_SECRET_KEY is not configured on the server.' });
  }

  try {
    // 1) Pull appointment to get authoritative price
    db.query('SELECT id, price, customer_id, artist_id, status, design_title FROM appointments WHERE id = ? AND is_deleted = 0', [appointmentId], async (err, results) => {
      if (err) {
        console.error('❌ DB error loading appointment for checkout:', err.message);
        return res.status(500).json({ success: false, message: 'Database error' });
      }

      if (!results.length) {
        return res.status(404).json({ success: false, message: 'Appointment not found' });
      }

      const appointment = results[0];
      // Prefer authoritative DB price; fall back to provided price if DB missing
      let priceNumber = Number(appointment.price);
      if ((!priceNumber || priceNumber <= 0) && providedPrice) {
        priceNumber = Number(providedPrice);
      }

      const isLatePayment = (appointment.status === 'completed' || appointment.status === 'finished');
      const description = isLatePayment
        ? `Late payment for Appointment #${appointmentId}`
        : `Booking payment for Appointment #${appointmentId}`;
      const itemName = isLatePayment
        ? `Tattoo Service - Balance payment (Appt #${appointmentId})`
        : (appointment.design_title || 'Tattoo Service');

      const amount = Math.round((priceNumber || 0) * 100); // centavos
      if (!amount || amount <= 0) {
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
                amount,
                currency: 'PHP',
                name: itemName,
                description: description,
                quantity: 1
              }
            ],
            description,
            payment_method_types: ['card', 'gcash', 'paymaya', 'grab_pay'],
            statement_descriptor: 'InkVistAR',
            metadata: {
              appointmentId: String(appointmentId),
              customerId: String(appointment.customer_id),
              artistId: String(appointment.artist_id),
              mode: PAYMONGO_MODE,
              isLatePayment: String(isLatePayment)
            },
            success_url: `${redirectBaseSuccess}?appointmentId=${appointmentId}`,
            cancel_url: `${redirectBaseFailed}?payment=failed&appointmentId=${appointmentId}`
          }
        }
      };

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
        console.error('❌ PayMongo error:', data);
        return res.status(502).json({ success: false, message: 'Failed to create checkout session', error: data });
      }

      const sessionId = data?.data?.id;
      const checkoutUrl = data?.data?.attributes?.checkout_url;

      // Save pending record for tracking
      // Save pending record for tracking
      db.query(
        `INSERT INTO payments (appointment_id, session_id, amount, currency, status, raw_event)
         VALUES (?, ?, ?, ?, 'pending', ?)
         ON DUPLICATE KEY UPDATE session_id = VALUES(session_id), amount = VALUES(amount), currency = VALUES(currency), status = 'pending', raw_event = VALUES(raw_event)`,
        [appointmentId, sessionId, amount, 'PHP', JSON.stringify(data?.data || {})],
        (payErr) => {
          if (payErr) console.error('⚠️ Could not log pending payment:', payErr.message);
        }
      );

      // Also update the appointment's payment_status to 'pending'
      db.query("UPDATE appointments SET payment_status = 'pending' WHERE id = ?", [appointmentId]);

      return res.json({ success: true, checkoutUrl, sessionId });
    });
  } catch (error) {
    console.error('🔥 Unexpected error creating checkout session:', error);
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
    db.query('SELECT payment_status FROM appointments WHERE id = ?', [appointmentId], async (err, results) => {
      if (err || results.length === 0) return res.status(404).json({ success: false, message: 'Not found' });

      let currentStatus = results[0].payment_status;

      if (currentStatus === 'paid') {
        return res.json({ success: true, payment_status: 'paid' });
      }

      // 2. If not paid, check if we have an active checkout session
      db.query('SELECT session_id FROM payments WHERE appointment_id = ? ORDER BY created_at DESC LIMIT 1', [appointmentId], async (pErr, pResults) => {
        if (pErr || pResults.length === 0 || !pResults[0].session_id) {
          return res.json({ success: true, payment_status: currentStatus });
        }

        const sessionId = pResults[0].session_id;

        try {
          // Poll PayMongo directly
          console.log(`🔍 Polling PayMongo for session ${sessionId} (Appointment ${appointmentId})...`);
          const pmRes = await fetch(`${PAYMONGO_API_BASE}/checkout_sessions/${sessionId}`, {
            headers: { 'Authorization': paymongoAuthHeader() }
          });
          const pmData = await pmRes.json();

          const pmStatus = pmData?.data?.attributes?.status;
          const paymentList = pmData?.data?.attributes?.payments || [];

          // PayMongo status 'completed' or having any items in the payments array means it's paid
          const hasPaid = pmStatus === 'completed' || (Array.isArray(paymentList) && paymentList.length > 0);

          console.log(`ℹ️ Polling details for Appt ${appointmentId}: PM_Status=${pmStatus}, Payments_Found=${paymentList.length}, HasPaid=${hasPaid}`);

          if (hasPaid) {
            console.log(`✅ Polling confirmed PAID for Appointment ${appointmentId}. Synchronizing database...`);

            // Update DB so future polls are faster
            db.query("UPDATE appointments SET payment_status = 'paid' WHERE id = ?", [appointmentId], (updErr) => {
              if (updErr) console.error(`❌ Failed to update appointments status to paid for ${appointmentId}:`, updErr.message);
              else console.log(`💾 Appointment ${appointmentId} updated to 'paid' in DB.`);
            });

            db.query("UPDATE payments SET status = 'paid' WHERE session_id = ?", [sessionId], (updErr) => {
              if (updErr) console.error(`❌ Failed to update payments record to paid for ${sessionId}:`, updErr.message);
            });

            return res.json({ success: true, payment_status: 'paid' });
          } else {
            console.log(`ℹ️ Polling result: Payment is still NOT detected as paid for Appt ${appointmentId}`);
          }
        } catch (pollErr) {
          console.error('❌ Polling PayMongo API error:', pollErr.message);
        }

        res.json({ success: true, payment_status: currentStatus });
      });
    });
  } catch (error) {
    console.error('🔥 Unexpected error in payment-status endpoint:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

app.post('/api/payments/webhook', (req, res) => {
  if (!PAYMONGO_WEBHOOK_SECRET) {
    console.warn('⚠️ PAYMONGO_WEBHOOK_SECRET is not set. Webhook signature will not be verified.');
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
      console.error('❌ Webhook signature mismatch');
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

  console.log('📥 PayMongo webhook received:', eventType, 'appointment', appointmentId);

  if (!appointmentId) {
    console.warn('⚠️ Webhook missing appointmentId in metadata');
  }

  // Upsert payment record (idempotent on paymongo_payment_id unique key)
  db.query(
    `INSERT INTO payments (appointment_id, session_id, paymongo_payment_id, amount, currency, status, raw_event)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE status = VALUES(status), amount = VALUES(amount), currency = VALUES(currency), raw_event = VALUES(raw_event), updated_at = CURRENT_TIMESTAMP`,
    [appointmentId || null, sessionId, paymongoPaymentId, amount, currency, status, JSON.stringify(event)],
    (err) => {
      if (err) console.error('❌ Error saving payment record:', err.message);
    }
  );

  // If paid, update appointment and notify
  if (status === 'paid' && appointmentId) {
    db.query("UPDATE appointments SET payment_status = 'paid' WHERE id = ?", [appointmentId], (updateErr) => {
      if (updateErr) {
        console.error('❌ Error marking appointment paid:', updateErr.message);
      } else {
        console.log('✅ Appointment', appointmentId, 'marked as PAID');
      }
    });

    db.query('SELECT customer_id, artist_id, status FROM appointments WHERE id = ?', [appointmentId], (fetchErr, rows) => {
      if (!fetchErr && rows.length) {
        const appt = rows[0];

        // If it was confirmed, maybe we want to notify or change something, 
        // but we leave 'status' alone as it might be 'in_progress' or 'completed' already.

        createNotification(appt.customer_id, 'Payment Received', `Your payment for appointment #${appointmentId} is confirmed.`, 'payment_success', appointmentId);
        createNotification(appt.artist_id, 'Payment Received', `Payment for appointment #${appointmentId} is confirmed.`, 'payment_success', appointmentId);
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
      console.error('❌ Error fetching payment status:', err.message);
      return res.status(500).json({ success: false, message: 'Database error' });
    }

    if (!rows.length) {
      return res.status(404).json({ success: false, message: 'Payment not found' });
    }

    res.json({ success: true, status: rows[0].status, amount: rows[0].amount, currency: rows[0].currency });
  });
});

// ========== CUSTOMER DASHBOARD (SIMPLIFIED) ==========
app.get('/api/customer/dashboard/:customerId', (req, res) => {
  const { customerId } = req.params;
  console.log(`📱 Customer dashboard requested: ${customerId}`);

  // 1. Get Customer Info
  const userQuery = `
    SELECT u.id, u.name, u.email, c.phone, c.location
    FROM users u
    LEFT JOIN customers c ON u.id = c.user_id
    WHERE u.id = ?
  `;

  db.query(userQuery, [customerId], (err, userResults) => {
    if (err) {
      console.error('❌ Database error (User):', err);
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
        console.error('❌ Database error (Appointments):', err);
        return res.json({ success: true, customer, appointments: [], stats: {} });
      }

      // Filter for upcoming (future dates)
      const now = new Date();
      now.setHours(0, 0, 0, 0);

      const upcoming = appointmentResults.filter(a => new Date(a.appointment_date) >= now && a.status !== 'completed');
      const completedCount = appointmentResults.filter(a => a.status === 'completed').length;
      const uniqueArtists = new Set(appointmentResults.map(a => a.artist_name)).size;

      const stats = {
        total_tattoos: completedCount,
        upcoming: upcoming.length,
        saved_designs: 0, // This is now accurate until the feature is built
        artists: uniqueArtists
      };

      // 3. Get Notifications
      db.query('SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 20', [customerId], (notifErr, notifResults) => {
        const notifications = notifResults || [];
        const unreadCount = notifications.filter(n => !n.is_read).length;

        res.json({
          success: true,
          customer,
          appointments: upcoming,
          stats,
          notifications,
          unreadCount
        });
      });
    });
  });
});

// ========== NOTIFICATION ENDPOINTS ==========

// Get notifications with pagination and filtering
app.get('/api/notifications/:userId', (req, res) => {
  const { userId } = req.params;
  const { page = 1, limit = 20, type } = req.query;

  const pageNum = parseInt(page, 10);
  const limitNum = parseInt(limit, 10);
  const offset = (pageNum - 1) * limitNum;

  let query = 'SELECT * FROM notifications WHERE user_id = ?';
  const queryParams = [userId];

  if (type) {
    query += ' AND type = ?';
    queryParams.push(type);
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

  db.query(countQuery, countParams, (countErr, countResults) => {
    if (countErr) {
      console.error('❌ Error fetching notification count:', countErr);
      return res.status(500).json({ success: false, message: 'Database error' });
    }

    db.query(query, queryParams, (err, results) => {
      if (err) {
        console.error('❌ Error fetching notifications:', err);
        return res.status(500).json({ success: false, message: 'Database error' });
      }

      const unreadCount = results.filter(n => !n.is_read).length;
      const total = countResults[0]?.total || 0;
      const hasMore = offset + results.length < total;

      res.json({
        success: true,
        notifications: results,
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

// Mark notification as read
app.put('/api/notifications/:id/read', (req, res) => {
  const { id } = req.params;

  db.query('UPDATE notifications SET is_read = 1 WHERE id = ?', [id], (err, result) => {
    if (err) {
      console.error('❌ Error updating notification:', err);
      return res.status(500).json({ success: false, message: 'Database error' });
    }

    res.json({ success: true, message: 'Marked as read' });
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
  let query = 'SELECT id, name, email, user_type, is_verified, is_deleted FROM users WHERE 1=1';
  let params = [];

  if (status === 'deleted') {
    query += ' AND is_deleted = 1';
  } else {
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
  const { name, email, password, type } = req.body;
  try {
    const password_hash = await bcrypt.hash(password, 10);
    const query = 'INSERT INTO users (name, email, password_hash, user_type, is_verified) VALUES (?, ?, ?, ?, 1)';

    db.query(query, [name, email, password_hash, type], (err, result) => {
      if (err) return res.status(500).json({ success: false, message: err.message });

      // If artist, create profile
      if (type === 'artist') {
        db.query('INSERT INTO artists (user_id, studio_name) VALUES (?, ?)', [result.insertId, 'New Studio']);
      }

      logAction(null, 'CREATE_USER', `Created user ${email} (${type})`, req.ip);
      res.json({ success: true, message: 'User created successfully' });
    });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

// Admin: Update User
app.put('/api/admin/users/:id', (req, res) => {
  const { id } = req.params;
  const { name, email, type } = req.body;

  const query = 'UPDATE users SET name = ?, email = ?, user_type = ? WHERE id = ?';
  db.query(query, [name, email, type, id], (err) => {
    if (err) return res.status(500).json({ success: false, message: err.message });
    logAction(null, 'UPDATE_USER', `Updated user ${id} (${email})`, req.ip);
    res.json({ success: true, message: 'User updated successfully' });
  });
});

// Admin: Delete User
app.delete('/api/admin/users/:id', (req, res) => {
  const { id } = req.params;
  console.log(`🗑️ SOFT DELETE request for user ID: ${id}`);

  // Safety: Don't delete the main admin
  db.query('SELECT email FROM users WHERE id = ?', [id], (err, results) => {
    if (err) return res.status(500).json({ success: false, message: 'Database error checking user' });

    if (results.length > 0 && results[0].email === 'admin@inkvistar.com') {
      return res.status(403).json({ success: false, message: 'Cannot delete the main system admin.' });
    }

    // Soft Delete: Just mark as deleted
    const query = 'UPDATE users SET is_deleted = 1 WHERE id = ?';
    db.query(query, [id], (err, result) => {
      if (err) return res.status(500).json({ success: false, message: err.message });
      logAction(null, 'DEACTIVATE_USER', `Deactivated user ID ${id}`, req.ip);
      res.json({ success: true, message: 'User deactivated successfully' });
    });
  });
});

// Admin: Restore User
app.put('/api/admin/users/:id/restore', (req, res) => {
  const { id } = req.params;
  db.query('UPDATE users SET is_deleted = 0 WHERE id = ?', [id], (err, result) => {
    if (err) return res.status(500).json({ success: false, message: err.message });
    logAction(null, 'RESTORE_USER', `Restored user ID ${id}`, req.ip);
    res.json({ success: true, message: 'User restored successfully' });
  });
});

// Admin: Permanent Delete User
app.delete('/api/admin/users/:id/permanent', (req, res) => {
  const { id } = req.params;
  db.query('DELETE FROM users WHERE id = ?', [id], (err, result) => {
    if (err) return res.status(500).json({ success: false, message: err.message });
    logAction(null, 'DELETE_USER', `Permanently deleted user ID ${id}`, req.ip);
    res.json({ success: true, message: 'User permanently deleted' });
  });
});

// Admin: Get Audit Logs
app.get('/api/admin/audit-logs', (req, res) => {
  const query = `
    SELECT al.*, u.name as user_name, u.email as user_email 
    FROM audit_logs al
    LEFT JOIN users u ON al.user_id = u.id
    ORDER BY al.created_at DESC
    LIMIT 50
  `;
  db.query(query, (err, results) => {
    if (err) return res.status(500).json({ success: false, message: err.message });
    res.json({ success: true, data: results });
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
    logAction(null, 'CREATE_BRANCH', `Created branch: ${name}`, req.ip);
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
    logAction(null, 'UPDATE_BRANCH', `Updated branch ID ${id}`, req.ip);
    res.json({ success: true, message: 'Branch updated' });
  });
});

// Admin: Delete Branch
app.delete('/api/admin/branches/:id', (req, res) => {
  const { id } = req.params;
  db.query('UPDATE branches SET is_deleted = 1 WHERE id = ?', [id], (err) => {
    if (err) return res.status(500).json({ success: false, message: err.message });
    logAction(null, 'DELETE_BRANCH', `Deleted branch ID ${id}`, req.ip);
    res.json({ success: true, message: 'Branch deleted' });
  });
});

// Admin: Restore Branch
app.put('/api/admin/branches/:id/restore', (req, res) => {
  const { id } = req.params;
  db.query('UPDATE branches SET is_deleted = 0 WHERE id = ?', [id], (err) => {
    if (err) return res.status(500).json({ success: false, message: err.message });
    logAction(null, 'RESTORE_BRANCH', `Restored branch ID ${id}`, req.ip);
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
  const { name, category, currentStock, minStock, maxStock, unit, supplier, cost } = req.body;
  const query = 'INSERT INTO inventory (name, category, current_stock, min_stock, max_stock, unit, supplier, cost, last_restocked) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW())';
  db.query(query, [name, category, currentStock, minStock, maxStock, unit, supplier, cost], (err, result) => {
    if (err) return res.status(500).json({ success: false, message: err.message });
    logAction(null, 'CREATE_INVENTORY', `Added item: ${name}`, req.ip);
    res.json({ success: true, message: 'Item added', id: result.insertId });
  });
});

// Admin: Update Inventory Item
app.put('/api/admin/inventory/:id', (req, res) => {
  const { id } = req.params;
  const { name, category, currentStock, minStock, maxStock, unit, supplier, cost } = req.body;
  const query = 'UPDATE inventory SET name=?, category=?, current_stock=?, min_stock=?, max_stock=?, unit=?, supplier=?, cost=? WHERE id=?';
  db.query(query, [name, category, currentStock, minStock, maxStock, unit, supplier, cost, id], (err) => {
    if (err) return res.status(500).json({ success: false, message: err.message });
    logAction(null, 'UPDATE_INVENTORY', `Updated item ID ${id} (${name})`, req.ip);
    res.json({ success: true, message: 'Item updated' });
  });
});

// Admin: Delete Inventory Item
app.delete('/api/admin/inventory/:id', (req, res) => {
  const { id } = req.params;
  db.query('UPDATE inventory SET is_deleted = 1 WHERE id=?', [id], (err) => {
    if (err) return res.status(500).json({ success: false, message: err.message });
    logAction(null, 'DELETE_INVENTORY', `Deleted item ID ${id}`, req.ip);
    res.json({ success: true, message: 'Item deleted' });
  });
});

// Admin: Restore Inventory Item
app.put('/api/admin/inventory/:id/restore', (req, res) => {
  const { id } = req.params;
  db.query('UPDATE inventory SET is_deleted = 0 WHERE id=?', [id], (err) => {
    if (err) return res.status(500).json({ success: false, message: err.message });
    logAction(null, 'RESTORE_INVENTORY', `Restored item ID ${id}`, req.ip);
    res.json({ success: true, message: 'Item restored' });
  });
});

// Admin: Permanent Delete Inventory Item
app.delete('/api/admin/inventory/:id/permanent', (req, res) => {
  const { id } = req.params;
  db.query('DELETE FROM inventory WHERE id=?', [id], (err) => {
    if (err) return res.status(500).json({ success: false, message: err.message });
    logAction(null, 'PERMANENT_DELETE_INVENTORY', `Permanently deleted item ID ${id}`, req.ip);
    res.json({ success: true, message: 'Item permanently deleted' });
  });
});

// Admin: Stock Transaction (In/Out)
app.post('/api/admin/inventory/:id/transaction', (req, res) => {
  const { id } = req.params;
  const { type, quantity, reason } = req.body; // type: 'in' or 'out'

  if (!['in', 'out'].includes(type)) return res.status(400).json({ success: false, message: 'Invalid type' });

  // Update stock
  const updateQuery = type === 'in'
    ? 'UPDATE inventory SET current_stock = current_stock + ?, last_restocked = NOW() WHERE id = ?'
    : 'UPDATE inventory SET current_stock = GREATEST(0, current_stock - ?) WHERE id = ?';

  db.query(updateQuery, [quantity, id], (err, result) => {
    if (err) return res.status(500).json({ success: false, message: err.message });

    // Log transaction
    db.query('INSERT INTO inventory_transactions (inventory_id, type, quantity, reason) VALUES (?, ?, ?, ?)',
      [id, type, quantity, reason],
      (logErr) => {
        if (logErr) console.error('Failed to log transaction:', logErr);
        logAction(null, 'STOCK_TRANSACTION', `${type.toUpperCase()} ${quantity} for item ${id}: ${reason}`, req.ip);
        res.json({ success: true, message: 'Stock updated' });
      }
    );
  });
});

// Admin: Get Inventory Transactions (Usage Report)
app.get('/api/admin/inventory/transactions', (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 100;
  const offset = (page - 1) * limit;

  const dataQuery = `
    SELECT t.*, i.name as item_name, i.category 
    FROM inventory_transactions t 
    JOIN inventory i ON t.inventory_id = i.id 
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

// Admin: Get All Appointments
app.get('/api/admin/appointments', (req, res) => {
  const query = `
    SELECT
      ap.id,
      ap.customer_id,
      ap.artist_id,
      ap.appointment_date,
      ap.start_time,
      ap.end_time,
      ap.status,
      ap.design_title,
      ap.notes,
      ap.reference_image,
      ap.price,
      c.name as client_name,
      c.email as client_email,
      a.name as artist_name,
      ar.hourly_rate
    FROM appointments ap
    JOIN users c ON ap.customer_id = c.id
    JOIN users a ON ap.artist_id = a.id
    LEFT JOIN artists ar ON a.id = ar.user_id
    WHERE ap.is_deleted = 0
    ORDER BY ap.appointment_date DESC
  `;

  db.query(query, (err, results) => {
    if (err) return res.status(500).json({ success: false, message: err.message });
    res.json({ success: true, data: results });
  });
});

// Admin: Create Appointment (Walk-in / Manual Booking)
app.post('/api/admin/appointments', (req, res) => {
  const { customerId, artistId, date, startTime, endTime, designTitle, notes, status, price } = req.body;

  const query = `
    INSERT INTO appointments 
    (customer_id, artist_id, appointment_date, start_time, end_time, design_title, notes, status, price)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `;

  db.query(query, [customerId, artistId, date, startTime, endTime || startTime, designTitle, notes, status || 'scheduled', (price && price > 0) ? price : 1], (err, result) => {
    if (err) {
      console.error('❌ Error creating appointment:', err);
      return res.status(500).json({ success: false, message: err.message });
    }
    logAction(null, 'CREATE_APPOINTMENT', `Created appointment for client ${customerId}`, req.ip);
    res.json({ success: true, message: 'Appointment created successfully', id: result.insertId });
  });
});

// Admin: Update Appointment (Status or Reschedule)
app.put('/api/admin/appointments/:id', (req, res) => {
  const { id } = req.params;
  const { status, date, startTime, endTime, artistId, designTitle, notes, price } = req.body;

  let query = 'UPDATE appointments SET ';
  const params = [];
  const updates = [];

  if (status) {
    updates.push('status = ?');
    params.push(status);
  }
  if (date) {
    updates.push('appointment_date = ?');
    params.push(date);
  }
  if (startTime) {
    updates.push('start_time = ?');
    params.push(startTime);
  }
  if (endTime) {
    updates.push('end_time = ?');
    params.push(endTime);
  }
  if (artistId) {
    updates.push('artist_id = ?');
    params.push(artistId);
  }
  if (designTitle) {
    updates.push('design_title = ?');
    params.push(designTitle);
  }
  if (notes) {
    updates.push('notes = ?');
    params.push(notes);
  }
  if (price !== undefined) {
    updates.push('price = ?');
    params.push(price);
  }

  if (updates.length === 0) return res.json({ success: true });

  query += updates.join(', ') + ' WHERE id = ?';
  params.push(id);

  db.query(query, params, (err) => {
    if (err) return res.status(500).json({ success: false, message: err.message });

    // Notify users (Simplified)
    if (status) {
      db.query('SELECT customer_id, artist_id FROM appointments WHERE id = ?', [id], (e, r) => {
        if (!e && r.length) {
          createNotification(r[0].customer_id, 'Appointment Update', `Admin updated appointment`, 'system', id);
          createNotification(r[0].artist_id, 'Appointment Update', `Admin updated appointment`, 'system', id);
        }
      });
    }

    logAction(null, 'UPDATE_APPOINTMENT', `Updated appointment ID ${id}`, req.ip);
    res.json({ success: true, message: 'Appointment updated' });
  });
});

// Admin: Delete Appointment
app.delete('/api/admin/appointments/:id', (req, res) => {
  const { id } = req.params;
  db.query('UPDATE appointments SET is_deleted = 1 WHERE id = ?', [id], (err) => {
    if (err) return res.status(500).json({ success: false, message: err.message });
    logAction(null, 'DELETE_APPOINTMENT', `Deleted appointment ID ${id}`, req.ip);
    res.json({ success: true, message: 'Appointment deleted' });
  });
});

// Admin: Analytics Data
app.get('/api/admin/analytics', (req, res) => {
  const response = {
    revenue: { total: 0, growth: 0, chart: [] },
    appointments: { total: 0, completed: 0, scheduled: 0, cancelled: 0, completionRate: 0 },
    artists: [],
    styles: [],
    inventory: []
  };

  // 1. Appointment Stats
  const apptStatsQuery = `
    SELECT 
      COUNT(*) as total,
      SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed,
      SUM(CASE WHEN status IN ('scheduled', 'confirmed') THEN 1 ELSE 0 END) as scheduled,
      SUM(CASE WHEN status = 'cancelled' THEN 1 ELSE 0 END) as cancelled
    FROM appointments
    WHERE is_deleted = 0
  `;

  // 2. Revenue (Estimated based on completed appointments * artist hourly rate)
  const revenueQuery = `
    SELECT SUM(ar.hourly_rate) as total
    FROM appointments ap
    JOIN artists ar ON ap.artist_id = ar.user_id
    WHERE ap.status = 'completed' AND ap.is_deleted = 0
  `;

  // 3. Artist Productivity
  const artistQuery = `
    SELECT u.name, COUNT(ap.id) as appointments, SUM(ar.hourly_rate) as revenue
    FROM appointments ap
    JOIN users u ON ap.artist_id = u.id
    JOIN artists ar ON u.id = ar.user_id
    WHERE ap.status = 'completed' AND ap.is_deleted = 0
    GROUP BY u.id, u.name
    ORDER BY revenue DESC
    LIMIT 5
  `;

  // 4. Inventory Consumption
  const inventoryQuery = `
    SELECT i.name, SUM(t.quantity) as used, i.unit
    FROM inventory_transactions t
    JOIN inventory i ON t.inventory_id = i.id
    WHERE t.type = 'out'
    GROUP BY i.id, i.name, i.unit
    ORDER BY used DESC
    LIMIT 5
  `;

  // 5. Popular Styles (from Portfolio)
  const styleQuery = `
    SELECT category as name, COUNT(*) as count 
    FROM portfolio_works 
    WHERE is_deleted = 0
    GROUP BY category 
    ORDER BY count DESC 
    LIMIT 5
  `;

  // 6. Monthly Trend (Last 6 Months)
  const trendQuery = `
    SELECT DATE_FORMAT(appointment_date, '%b') as month, COUNT(*) as count 
    FROM appointments 
    WHERE appointment_date >= DATE_SUB(NOW(), INTERVAL 6 MONTH) AND is_deleted = 0
    GROUP BY month, DATE_FORMAT(appointment_date, '%Y-%m')
    ORDER BY DATE_FORMAT(appointment_date, '%Y-%m')
  `;

  db.query(apptStatsQuery, (err, apptRes) => {
    if (err) return res.status(500).json({ success: false, message: err.message });
    const apptData = apptRes[0];
    response.appointments = {
      total: apptData.total || 0,
      completed: apptData.completed || 0,
      scheduled: apptData.scheduled || 0,
      cancelled: apptData.cancelled || 0,
      completionRate: apptData.total > 0 ? Math.round((apptData.completed / apptData.total) * 100) : 0
    };

    db.query(revenueQuery, (err, revRes) => {
      if (err) return res.status(500).json({ success: false, message: err.message });
      response.revenue.total = revRes[0].total || 0;

      db.query(artistQuery, (err, artRes) => {
        if (err) return res.status(500).json({ success: false, message: err.message });
        response.artists = artRes;

        db.query(inventoryQuery, (err, invRes) => {
          if (err) return res.status(500).json({ success: false, message: err.message });
          response.inventory = invRes;

          db.query(styleQuery, (err, styleRes) => {
            if (err) return res.status(500).json({ success: false, message: err.message });
            response.styles = styleRes;

            db.query(trendQuery, (err, trendRes) => {
              if (err) return res.status(500).json({ success: false, message: err.message });
              // Mock value for chart based on count * avg price (150)
              response.revenue.chart = trendRes.map(t => ({ month: t.month, appointments: t.count, value: t.count * 150 }));

              res.json({ success: true, data: response });
            });
          });
        });
      });
    });
  });
});

// Admin: Get Invoices
app.get('/api/admin/invoices', (req, res) => {
  db.query('SELECT * FROM invoices ORDER BY created_at DESC', (err, results) => {
    if (err) return res.status(500).json({ success: false, message: err.message });
    res.json({ success: true, data: results });
  });
});

// Admin: Create Invoice
app.post('/api/admin/invoices', (req, res) => {
  const { client, type, amount, status } = req.body;
  const query = 'INSERT INTO invoices (client_name, service_type, amount, status, created_at) VALUES (?, ?, ?, ?, NOW())';
  db.query(query, [client, type, amount, status], (err, result) => {
    if (err) return res.status(500).json({ success: false, message: err.message });
    res.json({ success: true, message: 'Invoice created', id: result.insertId });
  });
});

// Admin: Update Invoice
app.put('/api/admin/invoices/:id', (req, res) => {
  const { id } = req.params;
  const { client, type, amount, status } = req.body;
  console.log(`[DEBUG] Updating invoice ${id}:`, req.body);
  const query = 'UPDATE invoices SET client_name = ?, service_type = ?, amount = ?, status = ? WHERE id = ?';
  db.query(query, [client, type, amount, status, id], (err) => {
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

// Admin: Save Settings (Upsert)
app.post('/api/admin/settings', (req, res) => {
  const { section, data } = req.body;
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

// Helper: Simple Rule-based Chatbot (Fallback)
function getFallbackResponse(message) {
  const msg = message.toLowerCase();
  if (msg.includes('price') || msg.includes('cost') || msg.includes('rate')) {
    return "Our artists usually charge between $100 - $150 per hour. It varies by design size and complexity.";
  }
  if (msg.includes('book') || msg.includes('appointment') || msg.includes('schedule')) {
    return "You can book an appointment by going to the 'Artists' tab and selecting 'Book Now'.";
  }
  if (msg.includes('location') || msg.includes('where') || msg.includes('address')) {
    return "We are located at 123 Art Street, New York, NY 10001.";
  }
  if (msg.includes('style') || msg.includes('design')) {
    return "We specialize in Realism, Traditional, Japanese, and Fine Line tattoos.";
  }
  if (msg.includes('hello') || msg.includes('hi') || msg.includes('hey')) {
    return "Hi there! I'm InkVistAR's assistant. How can I help you today?";
  }
  if (msg.includes('care') || msg.includes('heal')) {
    return "Keep your new tattoo clean, moisturize with unscented lotion, and avoid sun/swimming for 2 weeks.";
  }
  return "I'm currently in offline mode. Please contact us at (555) 123-4567 for more details, or try asking about prices, booking, or styles.";
}

// ========== AR FEATURES ==========
app.get('/api/ar/config', (req, res) => {
  console.log('👓 AR Config requested');
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
  console.log('📧 Resend verification requested for:', email);

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
      const verifyUrl = `${BACKEND_URL}/api/verify?token=${verification_token}&email=${email}`;

      console.log('🔑 [DEBUG] NEW Verification Link:', verifyUrl);

      const html = `<h2>Verify your email</h2><p>Click here: <a href="${verifyUrl}">Verify Account</a></p>`;
      sendEmail(email, 'Resend: Verify Your InkVistAR Account', html);

      res.json({ success: true, message: 'Verification link resent! Check your email. (Debug: Check console for link if email fails)' });
    });
  });
});

// ========== CHATBOT ENDPOINT ==========
app.post('/api/chat', async (req, res) => {
  const { message } = req.body;
  console.log('💬 Chat message received:', message);

  if (!message) {
    return res.status(400).json({ success: false, message: 'Message required' });
  }

  // Try Groq if key exists
  if (GROQ_API_KEY) {
    try {
      // Fetch settings from DB to build a dynamic context
      db.query('SELECT * FROM app_settings', async (err, settingsResults) => {
        if (err) {
          console.error('❌ Chatbot DB Error (falling back):', err.message);
          const fallback = getFallbackResponse(message);
          return res.json({ success: true, response: fallback });
        }

        const settings = {};
        settingsResults.forEach(row => {
          try {
            settings[row.section] = typeof row.data === 'string' ? JSON.parse(row.data) : row.data;
          } catch (e) { settings[row.section] = row.data; }
        });

        const studioInfo = settings.studio || {};
        const billingInfo = settings.billing || {};
        const careInfo = settings.care || {};
        const policiesInfo = settings.policies || {};

        const systemPrompt = `
          You are InkVistAR, a friendly and helpful AI assistant for the tattoo studio "${studioInfo.name || 'InkVistAR'}". Your goal is to answer user questions based on the following studio information. Be concise and friendly.

          - Studio Info:
            - Name: ${studioInfo.name || 'InkVistAR'}
            - Description: ${studioInfo.description || 'A premium tattoo studio.'}
            - Address: ${studioInfo.address || 'not specified'}.
            - Phone: ${studioInfo.phone || 'not specified'}.
            - Hours: Open from ${studioInfo.openingTime || '1 PM'} to ${studioInfo.closingTime || '8 PM'}.

          - Pricing & Booking:
            - Base Rate: Our base rate is around ₱${billingInfo.baseRate || 150} per hour, but this varies by artist and design complexity.
            - Deposit Policy: ${policiesInfo.deposit || 'A deposit is required to book.'}
            - Cancellation Policy: ${policiesInfo.cancellation || 'Please contact us at least 48 hours in advance to cancel or reschedule.'}
            - How to Book: Tell users to browse artists and use the 'Booking' section of the app.

          - Aftercare:
            - Instructions: ${careInfo.instructions ? careInfo.instructions.split('\n').slice(0, 2).join(' ') : 'Keep it clean and moisturized, and avoid sun/swimming for 2 weeks.'}

          - General Rules:
            - If you don't know an answer, politely suggest they contact the studio directly at ${studioInfo.phone || 'our contact number'}.
        `.trim().replace(/\s+/g, ' ');

        const chatCompletion = await groq.chat.completions.create({
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: message }
          ],
          model: 'llama-3.3-70b-versatile',
        });

        const response = chatCompletion.choices[0].message.content;
        return res.json({ success: true, response: response });
      });
    } catch (error) {
      console.error('❌ Groq API error (Falling back to local):', error);
      const fallback = getFallbackResponse(message);
      res.json({ success: true, response: fallback });
    }
  }

  // Fallback if Gemini fails or no key
  const fallback = getFallbackResponse(message);
  res.json({ success: true, response: fallback });
});

console.log('⚡️ Chatbot endpoint (/api/chat) is registered.');

// ========== EMERGENCY LOGIN (ALWAYS WORKS) ==========
app.post('/api/emergency-login', (req, res) => {
  console.log('🚨 Emergency login called:', req.body);

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

// ========== 404 HANDLER ==========
app.use((req, res) => {
  console.log(`❌ 404: ${req.method} ${req.url} not found`);
  res.status(404).json({
    success: false,
    message: 'Endpoint not found'
  });
});

// ========== ERROR HANDLER ==========
app.use((err, req, res, next) => {
  console.error('🔥 Unhandled error:', err);
  res.status(500).json({
    success: false,
    message: 'Internal server error',
    error: err.message
  });
});

// ========== START SERVER ==========
const PORT = process.env.PORT || 3001;
app.listen(PORT, '0.0.0.0', () => {
  console.log('\n' + '='.repeat(50));
  console.log(`🚀 BACKEND SERVER STARTED`);
  console.log(`🌐 http://localhost:${PORT}`);
  console.log('\n📡 Available Endpoints:');
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
});
