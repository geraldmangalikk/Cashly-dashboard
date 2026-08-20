const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
    connectionString: "postgresql://postgres.ncwnnswbbhipcmlqwcwz:KipasAngin05.@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres",
    ssl: { rejectUnauthorized: false }
});

async function run() {
    try {
        const res = await pool.query(`
            SELECT Kategori as "Kategori", CAST(SUM(Nominal) AS FLOAT) as "Total"
            FROM Transaksi
            WHERE Jenis = 'Pemasukan'
            GROUP BY Kategori
        `);
        console.log(res.rows);
    } catch(e) {
        console.error(e);
    } finally {
        pool.end();
    }
}
run();
