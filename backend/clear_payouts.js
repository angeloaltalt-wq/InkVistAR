const mysql = require('mysql2/promise');
require('dotenv').config();

async function run() {
    const db = await mysql.createConnection({
        host: process.env.MYSQLHOST || process.env.DB_HOST,
        user: process.env.MYSQLUSER || process.env.DB_USER,
        password: process.env.MYSQLPASSWORD || process.env.DB_PASSWORD,
        database: process.env.MYSQLDATABASE || process.env.DB_NAME,
        port: process.env.MYSQLPORT || process.env.DB_PORT || 3306,
    });

    try {
        await db.query('SET FOREIGN_KEY_CHECKS = 0;');
        await db.query('TRUNCATE TABLE payouts;');
        await db.query('SET FOREIGN_KEY_CHECKS = 1;');
        console.log("Success! Cleared leftover payouts.");
    } catch (e) {
        console.error(e);
    } finally {
        await db.end();
    }
}
run();
