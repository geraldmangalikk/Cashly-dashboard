const sql = require('mssql');

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

const categoriesExpense = ['Makan', 'Transportasi', 'Hiburan', 'Tagihan', 'Lainnya'];
const categoriesIncome = ['Gaji', 'Bisnis', 'Lainnya'];

const randomDate = (start, end) => {
    return new Date(start.getTime() + Math.random() * (end.getTime() - start.getTime()));
};

const seedData = async () => {
    try {
        const pool = await sql.connect(dbConfig);
        console.log('Terhubung ke database, mulai men-generate 100 data...');

        // Start date: 1 Juni 2026, End date: 31 Agustus 2026
        const startDate = new Date(2026, 5, 1);
        const endDate = new Date(2026, 7, 31);

        for (let i = 0; i < 100; i++) {
            const isIncome = Math.random() > 0.7; // 30% Pemasukan, 70% Pengeluaran
            const jenis = isIncome ? 'Pemasukan' : 'Pengeluaran';
            const kategoriArr = isIncome ? categoriesIncome : categoriesExpense;
            const kategori = kategoriArr[Math.floor(Math.random() * kategoriArr.length)];
            
            let nominal = 0;
            if (isIncome) {
                nominal = Math.floor(Math.random() * 50) * 100000 + 1000000; // 1jt - 6jt
            } else {
                nominal = Math.floor(Math.random() * 50) * 10000 + 10000; // 10k - 500k
            }

            const tanggal = randomDate(startDate, endDate).toISOString().split('T')[0];
            const keterangan = `Data dummy ${i + 1} - ${kategori}`;

            await pool.request()
                .input('Tanggal', sql.Date, tanggal)
                .input('Jenis', sql.VarChar(50), jenis)
                .input('Kategori', sql.VarChar(100), kategori)
                .input('Nominal', sql.Decimal(18, 2), nominal)
                .input('Keterangan', sql.NVarChar(sql.MAX), keterangan)
                .query(`
                    INSERT INTO Transaksi (Tanggal, Jenis, Kategori, Nominal, Keterangan)
                    VALUES (@Tanggal, @Jenis, @Kategori, @Nominal, @Keterangan)
                `);
        }

        console.log('Berhasil menginput 100 data dummy!');
        process.exit(0);
    } catch (err) {
        console.error('Error:', err);
        process.exit(1);
    }
};

seedData();
