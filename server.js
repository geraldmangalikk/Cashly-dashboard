require('dotenv').config();
const express = require('express');
const sql = require('mssql');
const cors = require('cors');
const path = require('path');

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Menggunakan SQL Authentication SA
const dbConfig = {
    user: process.env.DB_USER || 'sa',
    password: process.env.DB_PASSWORD || 'PasswordKuatAnda123!',
    server: process.env.DB_SERVER || 'localhost\\SQLEXPRESS',
    database: process.env.DB_NAME || 'KeuanganDB',
    options: {
        encrypt: process.env.DB_ENCRYPT === 'true', // true for Azure SQL Cloud
        trustServerCertificate: process.env.DB_TRUST_CERT !== 'false' // default true for local
    }
};

const poolPromise = new sql.ConnectionPool(dbConfig)
    .connect()
    .then(pool => {
        console.log('Terhubung ke SQL Server (Windows Authentication)');
        return pool;
    })
    .catch(err => {
        console.error('Gagal terhubung ke SQL Server:', err);
    });

// Helper for filtering by month/year
const getFilterClause = (month, year) => {
    let whereClause = "WHERE 1=1";
    if (month && year) {
        whereClause = `WHERE MONTH(Tanggal) = @Month AND YEAR(Tanggal) = @Year`;
    }
    return whereClause;
};
const addFilterInputs = (request, month, year) => {
    if (month && year) {
        request.input('Month', sql.Int, parseInt(month));
        request.input('Year', sql.Int, parseInt(year));
    }
    return request;
};

// API: Summary
app.get('/api/summary', async (req, res) => {
    try {
        const { month, year } = req.query;
        const pool = await poolPromise;
        const request = pool.request();
        addFilterInputs(request, month, year);
        
        let cumulativeWhere = "";
        if (month && year) {
            cumulativeWhere = `WHERE Tanggal < DATEADD(month, 1, DATEFROMPARTS(@Year, @Month, 1))`;
        }

        const result = await request.query(`
            SELECT 
                ISNULL(SUM(CASE WHEN Jenis = 'Pemasukan' THEN Nominal ELSE 0 END), 0) AS TotalPemasukan,
                ISNULL(SUM(CASE WHEN Jenis = 'Pengeluaran' THEN Nominal ELSE 0 END), 0) AS TotalPengeluaran,
                ISNULL(SUM(CASE WHEN Jenis = 'Menabung' THEN Nominal ELSE 0 END), 0) AS TotalMenabung,
                ISNULL(SUM(CASE WHEN Jenis = 'Tarik Tabungan' THEN Nominal ELSE 0 END), 0) AS TotalTarikTabungan
            FROM Transaksi
            ${getFilterClause(month, year)};

            SELECT 
                ISNULL(SUM(CASE WHEN Jenis = 'Pemasukan' THEN Nominal ELSE 0 END), 0) -
                ISNULL(SUM(CASE WHEN Jenis = 'Pengeluaran' THEN Nominal ELSE 0 END), 0) -
                ISNULL(SUM(CASE WHEN Jenis = 'Menabung' THEN Nominal ELSE 0 END), 0) +
                ISNULL(SUM(CASE WHEN Jenis = 'Tarik Tabungan' THEN Nominal ELSE 0 END), 0) AS SaldoAktif
            FROM Transaksi
            ${cumulativeWhere};
        `);
        
        const totalPemasukan = result.recordsets[0][0].TotalPemasukan;
        const totalPengeluaran = result.recordsets[0][0].TotalPengeluaran;
        const totalMenabung = result.recordsets[0][0].TotalMenabung;
        const totalTarikTabungan = result.recordsets[0][0].TotalTarikTabungan;
        const saldoAktif = result.recordsets[1][0].SaldoAktif;
        
        const totalTabungan = totalMenabung - totalTarikTabungan;
        
        res.json({
            TotalPemasukan: totalPemasukan,
            TotalPengeluaran: totalPengeluaran,
            TotalTabungan: totalTabungan,
            Saldo: saldoAktif
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// API: Get Transaksi
app.get('/api/transactions', async (req, res) => {
    try {
        const { month, year } = req.query;
        const pool = await poolPromise;
        const request = pool.request();
        addFilterInputs(request, month, year);

        const result = await request.query(`
            SELECT t.Id, t.Tanggal, t.Jenis, t.Kategori, t.MetodePembayaran, t.TujuanTabunganId, tg.NamaTarget, t.Nominal, t.Keterangan, t.CreatedAt
            FROM Transaksi t
            LEFT JOIN TargetTabungan tg ON t.TujuanTabunganId = tg.Id
            ${getFilterClause(month, year)}
            ORDER BY t.Tanggal DESC, t.CreatedAt DESC
        `);
        res.json(result.recordset);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// API: Post Transaksi
app.post('/api/transactions', async (req, res) => {
    try {
        const { Tanggal, Jenis, Kategori, MetodePembayaran, TujuanTabunganId, Nominal, Keterangan } = req.body;
        if (!Tanggal || !Jenis || !Nominal) {
            return res.status(400).json({ error: "Data tidak lengkap" });
        }
        const pool = await poolPromise;
        await pool.request()
            .input('Tanggal', sql.Date, Tanggal)
            .input('Jenis', sql.VarChar(50), Jenis)
            .input('Kategori', sql.VarChar(100), Kategori || '')
            .input('MetodePembayaran', sql.VarChar(50), MetodePembayaran || null)
            .input('TujuanTabunganId', sql.Int, TujuanTabunganId || null)
            .input('Nominal', sql.Decimal(18, 2), Nominal)
            .input('Keterangan', sql.NVarChar(sql.MAX), Keterangan || '')
            .query(`
                INSERT INTO Transaksi (Tanggal, Jenis, Kategori, MetodePembayaran, TujuanTabunganId, Nominal, Keterangan)
                VALUES (@Tanggal, @Jenis, @Kategori, @MetodePembayaran, @TujuanTabunganId, @Nominal, @Keterangan)
            `);
        res.status(201).json({ message: "Transaksi berhasil disimpan" });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// API: Put Transaksi (EDIT)
app.put('/api/transactions/:id', async (req, res) => {
    try {
        const id = req.params.id;
        const { Tanggal, Jenis, Kategori, MetodePembayaran, TujuanTabunganId, Nominal, Keterangan } = req.body;
        if (!Tanggal || !Jenis || !Nominal) {
            return res.status(400).json({ error: "Data tidak lengkap" });
        }
        const pool = await poolPromise;
        const result = await pool.request()
            .input('Id', sql.Int, id)
            .input('Tanggal', sql.Date, Tanggal)
            .input('Jenis', sql.VarChar(50), Jenis)
            .input('Kategori', sql.VarChar(100), Kategori || '')
            .input('MetodePembayaran', sql.VarChar(50), MetodePembayaran || null)
            .input('TujuanTabunganId', sql.Int, TujuanTabunganId || null)
            .input('Nominal', sql.Decimal(18, 2), Nominal)
            .input('Keterangan', sql.NVarChar(sql.MAX), Keterangan || '')
            .query(`
                UPDATE Transaksi 
                SET Tanggal = @Tanggal, Jenis = @Jenis, Kategori = @Kategori, 
                    MetodePembayaran = @MetodePembayaran, TujuanTabunganId = @TujuanTabunganId, 
                    Nominal = @Nominal, Keterangan = @Keterangan
                WHERE Id = @Id
            `);
        if (result.rowsAffected[0] === 0) {
            return res.status(404).json({ error: "Transaksi tidak ditemukan" });
        }
        res.json({ message: "Transaksi berhasil diubah" });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// API: Delete Transaksi
app.delete('/api/transactions/:id', async (req, res) => {
    try {
        const id = req.params.id;
        const pool = await poolPromise;
        const result = await pool.request()
            .input('Id', sql.Int, id)
            .query(`DELETE FROM Transaksi WHERE Id = @Id`);
        
        if (result.rowsAffected[0] === 0) {
            return res.status(404).json({ error: "Transaksi tidak ditemukan" });
        }
        res.json({ message: "Transaksi berhasil dihapus" });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// API: Budget GET
app.get('/api/budget', async (req, res) => {
    try {
        const pool = await poolPromise;
        const result = await pool.request().query('SELECT Nominal FROM Budget WHERE Id = 1');
        const nominal = result.recordset.length > 0 ? result.recordset[0].Nominal : 0;
        res.json({ Nominal: nominal });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// API: Budget POST
app.post('/api/budget', async (req, res) => {
    try {
        const { Nominal } = req.body;
        const pool = await poolPromise;
        await pool.request()
            .input('Nominal', sql.Decimal(18,2), Nominal)
            .query(`
                IF EXISTS (SELECT * FROM Budget WHERE Id = 1)
                    UPDATE Budget SET Nominal = @Nominal WHERE Id = 1
                ELSE
                    INSERT INTO Budget (Id, Nominal) VALUES (1, @Nominal)
            `);
        res.json({ message: "Budget berhasil diatur" });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Endpoint Chart: Kategori
app.get('/api/chart/categories', async (req, res) => {
    try {
        const { month, year } = req.query;
        const pool = await poolPromise;
        const request = pool.request();
        addFilterInputs(request, month, year);

        let whereStr = "WHERE Jenis = 'Pengeluaran'";
        if (month && year) {
            whereStr += " AND MONTH(Tanggal) = @Month AND YEAR(Tanggal) = @Year";
        }

        const result = await request.query(`
            SELECT Kategori, SUM(Nominal) as Total
            FROM Transaksi
            ${whereStr}
            GROUP BY Kategori
            ORDER BY Total DESC
        `);
        res.json(result.recordset);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Endpoint Chart: Kategori (Pemasukan)
app.get('/api/chart/categories-income', async (req, res) => {
    try {
        const { month, year } = req.query;
        const pool = await poolPromise;
        const request = pool.request();
        addFilterInputs(request, month, year);

        let whereStr = "WHERE Jenis = 'Pemasukan'";
        if (month && year) {
            whereStr += " AND MONTH(Tanggal) = @Month AND YEAR(Tanggal) = @Year";
        }

        const result = await request.query(`
            SELECT Kategori, SUM(Nominal) as Total
            FROM Transaksi
            ${whereStr}
            GROUP BY Kategori
            ORDER BY Total DESC
        `);
        res.json(result.recordset);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Endpoint Chart: Cashflow
app.get('/api/chart/cashflow', async (req, res) => {
    try {
        const { range, start, end } = req.query;
        const pool = await poolPromise;
        const request = pool.request();
        let queryStr = '';

        if (range === 'custom' && start && end) {
            request.input('start', sql.Date, start);
            request.input('end', sql.Date, end);
            queryStr = `
                SELECT 
                       FORMAT(Tanggal, 'yyyy-MM-dd') as Label,
                       SUM(CASE WHEN Jenis = 'Pemasukan' THEN Nominal ELSE 0 END) as Pemasukan,
                       SUM(CASE WHEN Jenis = 'Pengeluaran' THEN Nominal ELSE 0 END) as Pengeluaran
                FROM Transaksi
                WHERE CAST(Tanggal AS DATE) >= @start AND CAST(Tanggal AS DATE) <= @end
                GROUP BY FORMAT(Tanggal, 'yyyy-MM-dd')
                ORDER BY Label DESC
            `;
        } else if (range === 'daily') {
            queryStr = `
                SELECT TOP 7 
                       FORMAT(Tanggal, 'yyyy-MM-dd') as Label,
                       SUM(CASE WHEN Jenis = 'Pemasukan' THEN Nominal ELSE 0 END) as Pemasukan,
                       SUM(CASE WHEN Jenis = 'Pengeluaran' THEN Nominal ELSE 0 END) as Pengeluaran
                FROM Transaksi
                WHERE Tanggal >= CAST(DATEADD(day, -7, GETDATE()) AS DATE)
                GROUP BY FORMAT(Tanggal, 'yyyy-MM-dd')
                ORDER BY Label DESC
            `;
        } else if (range === 'yearly') {
            queryStr = `
                SELECT TOP 5 
                       FORMAT(Tanggal, 'yyyy') as Label,
                       SUM(CASE WHEN Jenis = 'Pemasukan' THEN Nominal ELSE 0 END) as Pemasukan,
                       SUM(CASE WHEN Jenis = 'Pengeluaran' THEN Nominal ELSE 0 END) as Pengeluaran
                FROM Transaksi
                WHERE Tanggal >= CAST(DATEADD(year, -5, GETDATE()) AS DATE)
                GROUP BY FORMAT(Tanggal, 'yyyy')
                ORDER BY Label DESC
            `;
        } else {
            // default to monthly (12 months)
            queryStr = `
                SELECT TOP 12 
                       FORMAT(Tanggal, 'yyyy-MM') as Label,
                       SUM(CASE WHEN Jenis = 'Pemasukan' THEN Nominal ELSE 0 END) as Pemasukan,
                       SUM(CASE WHEN Jenis = 'Pengeluaran' THEN Nominal ELSE 0 END) as Pengeluaran
                FROM Transaksi
                WHERE Tanggal >= CAST(DATEADD(month, -12, GETDATE()) AS DATE)
                GROUP BY FORMAT(Tanggal, 'yyyy-MM')
                ORDER BY Label DESC
            `;
        }

        const result = await request.query(queryStr);
        res.json(result.recordset.reverse());
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// API: GET Goals
app.get('/api/goals', async (req, res) => {
    try {
        const pool = await poolPromise;
        const result = await pool.request().query(`
            SELECT g.Id, g.NamaTarget, g.TargetNominal, g.IconCategory,
                   ISNULL(SUM(CASE WHEN t.Jenis = 'Menabung' THEN t.Nominal WHEN t.Jenis = 'Tarik Tabungan' THEN -t.Nominal ELSE 0 END), 0) AS Terkumpul
            FROM TargetTabungan g
            LEFT JOIN Transaksi t ON g.Id = t.TujuanTabunganId
            GROUP BY g.Id, g.NamaTarget, g.TargetNominal, g.IconCategory, g.CreatedAt
            ORDER BY g.CreatedAt DESC
        `);
        res.json(result.recordset);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// API: POST Goals
app.post('/api/goals', async (req, res) => {
    try {
        const { NamaTarget, TargetNominal, IconCategory } = req.body;
        if (!NamaTarget || !TargetNominal) return res.status(400).json({ error: "Data tidak lengkap" });
        const pool = await poolPromise;
        await pool.request()
            .input('NamaTarget', sql.VarChar(100), NamaTarget)
            .input('TargetNominal', sql.Decimal(18,2), TargetNominal)
            .input('IconCategory', sql.VarChar(50), IconCategory || 'casual')
            .query(`INSERT INTO TargetTabungan (NamaTarget, TargetNominal, IconCategory) VALUES (@NamaTarget, @TargetNominal, @IconCategory)`);
        res.status(201).json({ message: "Goal berhasil ditambahkan" });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// API: DELETE Goals
app.delete('/api/goals/:id', async (req, res) => {
    try {
        const id = req.params.id;
        const pool = await poolPromise;
        const result = await pool.request()
            .input('Id', sql.Int, id)
            .query(`DELETE FROM TargetTabungan WHERE Id = @Id`);
        if (result.rowsAffected[0] === 0) return res.status(404).json({ error: "Goal tidak ditemukan" });
        res.json({ message: "Goal berhasil dihapus" });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// API: Pemasukan Summary (% Change)
app.get('/api/pemasukan/summary', async (req, res) => {
    try {
        let { month, year } = req.query;
        let currentMonth = month ? parseInt(month) : new Date().getMonth() + 1;
        let currentYear = year ? parseInt(year) : new Date().getFullYear();

        let prevMonth = currentMonth === 1 ? 12 : currentMonth - 1;
        let prevYear = currentMonth === 1 ? currentYear - 1 : currentYear;

        const pool = await poolPromise;
        
        // Current Period
        const currentRes = await pool.request()
            .input('Month', sql.Int, currentMonth)
            .input('Year', sql.Int, currentYear)
            .query(`
                SELECT ISNULL(SUM(Nominal), 0) AS Total 
                FROM Transaksi 
                WHERE Jenis = 'Pemasukan' AND MONTH(Tanggal) = @Month AND YEAR(Tanggal) = @Year
            `);
            
        // Previous Period
        const prevRes = await pool.request()
            .input('Month', sql.Int, prevMonth)
            .input('Year', sql.Int, prevYear)
            .query(`
                SELECT ISNULL(SUM(Nominal), 0) AS Total 
                FROM Transaksi 
                WHERE Jenis = 'Pemasukan' AND MONTH(Tanggal) = @Month AND YEAR(Tanggal) = @Year
            `);

        const currentTotal = currentRes.recordset[0].Total;
        const prevTotal = prevRes.recordset[0].Total;
        
        let percentageChange = 0;
        if (prevTotal > 0) {
            percentageChange = ((currentTotal - prevTotal) / prevTotal) * 100;
        } else if (currentTotal > 0) {
            percentageChange = 100; // If previous was 0 and current is > 0, it's a 100% increase
        }

        res.json({
            CurrentTotal: currentTotal,
            PrevTotal: prevTotal,
            PercentageChange: percentageChange.toFixed(2)
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// API: Pemasukan Chart
app.get('/api/chart/pemasukan', async (req, res) => {
    try {
        const { startDate, endDate, groupBy } = req.query;
        if (!startDate || !endDate || !groupBy) {
            return res.status(400).json({ error: "startDate, endDate, and groupBy are required" });
        }

        let formatStr = 'yyyy-MM-dd'; // default daily
        if (groupBy === 'monthly') formatStr = 'yyyy-MM';
        if (groupBy === 'yearly') formatStr = 'yyyy';

        const pool = await poolPromise;
        const result = await pool.request()
            .input('StartDate', sql.Date, startDate)
            .input('EndDate', sql.Date, endDate)
            .query(`
                SELECT 
                    FORMAT(Tanggal, '${formatStr}') AS Label,
                    SUM(Nominal) AS Total
                FROM Transaksi
                WHERE Jenis = 'Pemasukan' 
                  AND Tanggal >= @StartDate 
                  AND Tanggal <= @EndDate
                GROUP BY FORMAT(Tanggal, '${formatStr}')
                ORDER BY Label ASC
            `);

        const dbData = result.recordset;
        const completeData = [];
        let current = new Date(startDate);
        const end = new Date(endDate);

        while(current <= end) {
            let label = '';
            let nextDate = new Date(current);
            if (groupBy === 'yearly') {
                label = current.getFullYear().toString();
                nextDate.setFullYear(current.getFullYear() + 1);
            } else if (groupBy === 'monthly') {
                label = current.getFullYear() + '-' + String(current.getMonth() + 1).padStart(2, '0');
                nextDate.setMonth(current.getMonth() + 1);
            } else { // daily
                label = current.toISOString().split('T')[0];
                nextDate.setDate(current.getDate() + 1);
            }
            
            if (!completeData.find(d => d.Label === label)) {
                const existing = dbData.find(d => d.Label === label);
                completeData.push({
                    Label: label,
                    Total: existing ? existing.Total : 0
                });
            }
            current = nextDate;
        }

        res.json(completeData);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// API: Pengeluaran Summary (% Change)
app.get('/api/pengeluaran/summary', async (req, res) => {
    try {
        let { month, year } = req.query;
        let currentMonth = month ? parseInt(month) : new Date().getMonth() + 1;
        let currentYear = year ? parseInt(year) : new Date().getFullYear();

        let prevMonth = currentMonth === 1 ? 12 : currentMonth - 1;
        let prevYear = currentMonth === 1 ? currentYear - 1 : currentYear;

        const pool = await poolPromise;
        
        // Current Period
        const currentRes = await pool.request()
            .input('Month', sql.Int, currentMonth)
            .input('Year', sql.Int, currentYear)
            .query(`
                SELECT ISNULL(SUM(Nominal), 0) AS Total 
                FROM Transaksi 
                WHERE Jenis = 'Pengeluaran' AND MONTH(Tanggal) = @Month AND YEAR(Tanggal) = @Year
            `);
            
        // Previous Period
        const prevRes = await pool.request()
            .input('Month', sql.Int, prevMonth)
            .input('Year', sql.Int, prevYear)
            .query(`
                SELECT ISNULL(SUM(Nominal), 0) AS Total 
                FROM Transaksi 
                WHERE Jenis = 'Pengeluaran' AND MONTH(Tanggal) = @Month AND YEAR(Tanggal) = @Year
            `);

        const currentTotal = currentRes.recordset[0].Total;
        const prevTotal = prevRes.recordset[0].Total;
        
        let percentageChange = 0;
        if (prevTotal > 0) {
            percentageChange = ((currentTotal - prevTotal) / prevTotal) * 100;
        } else if (currentTotal > 0) {
            percentageChange = 100;
        }

        res.json({
            CurrentTotal: currentTotal,
            PrevTotal: prevTotal,
            PercentageChange: percentageChange.toFixed(2)
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// API: Pengeluaran Chart
app.get('/api/chart/pengeluaran', async (req, res) => {
    try {
        const { startDate, endDate, groupBy } = req.query;
        if (!startDate || !endDate || !groupBy) {
            return res.status(400).json({ error: "startDate, endDate, and groupBy are required" });
        }

        let formatStr = 'yyyy-MM-dd'; // default daily
        if (groupBy === 'monthly') formatStr = 'yyyy-MM';
        if (groupBy === 'yearly') formatStr = 'yyyy';

        const pool = await poolPromise;
        const result = await pool.request()
            .input('StartDate', sql.Date, startDate)
            .input('EndDate', sql.Date, endDate)
            .query(`
                SELECT 
                    FORMAT(Tanggal, '${formatStr}') AS Label,
                    SUM(Nominal) AS Total
                FROM Transaksi
                WHERE Jenis = 'Pengeluaran' 
                  AND Tanggal >= @StartDate 
                  AND Tanggal <= @EndDate
                GROUP BY FORMAT(Tanggal, '${formatStr}')
                ORDER BY Label ASC
            `);

        const dbData = result.recordset;
        const completeData = [];
        let current = new Date(startDate);
        const end = new Date(endDate);

        while(current <= end) {
            let label = '';
            let nextDate = new Date(current);
            if (groupBy === 'yearly') {
                label = current.getFullYear().toString();
                nextDate.setFullYear(current.getFullYear() + 1);
            } else if (groupBy === 'monthly') {
                label = current.getFullYear() + '-' + String(current.getMonth() + 1).padStart(2, '0');
                nextDate.setMonth(current.getMonth() + 1);
            } else { // daily
                label = current.toISOString().split('T')[0];
                nextDate.setDate(current.getDate() + 1);
            }
            
            if (!completeData.find(d => d.Label === label)) {
                const existing = dbData.find(d => d.Label === label);
                completeData.push({
                    Label: label,
                    Total: existing ? existing.Total : 0
                });
            }
            current = nextDate;
        }

        res.json(completeData);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.listen(port, () => {
    console.log(`Aplikasi berjalan di http://localhost:${port}`);
});
