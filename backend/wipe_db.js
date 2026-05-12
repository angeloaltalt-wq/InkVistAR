const mysql = require('mysql2/promise');
require('dotenv').config();

async function wipeDatabase() {
    console.log("Connecting to Database...");
    
    // Connect using existing environment variables used by the backend
    const db = await mysql.createConnection({
        host: process.env.MYSQLHOST || process.env.DB_HOST,
        user: process.env.MYSQLUSER || process.env.DB_USER,
        password: process.env.MYSQLPASSWORD || process.env.DB_PASSWORD,
        database: process.env.MYSQLDATABASE || process.env.DB_NAME,
        port: process.env.MYSQLPORT || process.env.DB_PORT || 3306,
    });

    console.log("Connected. Starting targeted database wipe...");

    try {
        // Temporarily disable foreign key checks to allow clearing tables with dependencies
        await db.query('SET FOREIGN_KEY_CHECKS = 0;');
        
        const tablesToClear = [
            'appointments',
            'payments',
            'invoices',
            'payouts',
            'session_materials',
            'audit_logs',
            'slot_locks',
            'notifications',
            'customer_reports',
            'reviews',
            'favorites',
            'inventory_transactions',
            'messages',
            'support_messages'
        ];

        for (const table of tablesToClear) {
            try {
                await db.query(`TRUNCATE TABLE ${table};`);
                console.log(`[OK] Cleared table: ${table}`);
            } catch (e) {
                console.log(`[WARN] Skipped table ${table} (${e.code})`);
            }
        }

        console.log("\nDeleting all customers from users table...");
        const [result] = await db.query(`DELETE FROM users WHERE user_type = 'customer';`);
        console.log(`[OK] Deleted ${result.affectedRows} customer accounts.`);

        // Re-enable foreign key checks
        await db.query('SET FOREIGN_KEY_CHECKS = 1;');
        
        console.log("\n=========================================================");
        console.log("Wipe Complete!");
        console.log("All admin, manager, and artist accounts were PRESERVED.");
        console.log("All gallery and portfolio works were PRESERVED.");
        console.log("All shop inventory stock was PRESERVED.");
        console.log("=========================================================\n");
        
    } catch (error) {
        console.error("Error wiping database:", error);
    } finally {
        await db.end();
    }
}

wipeDatabase();
