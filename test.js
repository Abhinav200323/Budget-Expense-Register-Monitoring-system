const mysql = require('mysql2/promise');

// Update these credentials if needed
const pool = mysql.createPool({
  host: 'localhost',
  user: 'root', // your MySQL username
  password: 'root', // your MySQL password
  database: 'ber_db', // your database name
});

async function testConnection() {
  try {
    const conn = await pool.getConnection();
    console.log('✅ MySQL database connected!');
    conn.release();
    process.exit(0);
  } catch (err) {
    console.error('❌ MySQL connection failed:', err.message);
    process.exit(1);
  }
}

testConnection(); 