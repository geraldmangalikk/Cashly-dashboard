const sql = require('mssql/msnodesqlv8');
const dbConfig = {
    server: 'localhost\\SQLEXPRESS',
    database: 'KeuanganDB',
    options: {
        trustedConnection: true,
        trustServerCertificate: true
    }
};

sql.connect(dbConfig).then(() => {
    console.log("Koneksi sukses");
    process.exit(0);
}).catch(err => {
    console.error("Gagal:", err);
    process.exit(1);
});
