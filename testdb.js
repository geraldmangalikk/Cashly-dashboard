const sql = require('mssql');
require('dotenv').config();

const dbConfig = {
    user: 'sa',
    password: 'PasswordKuatAnda123!',
    server: 'localhost\\SQLEXPRESS',
    database: 'KeuanganDB',
    options: {
        encrypt: false,
        trustServerCertificate: true
    }
};

console.log("Mencoba koneksi ke database dengan config:", { ...dbConfig, password: '***' });

sql.connect(dbConfig)
    .then(pool => {
        console.log('BERHASIL terhubung ke SQL Server!');
        pool.close();
        process.exit(0);
    })
    .catch(err => {
        console.error('GAGAL terhubung:', err);
        process.exit(1);
    });
