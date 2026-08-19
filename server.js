require('dotenv').config();
const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
const path = require('path');

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Konfigurasi PostgreSQL
const dbConfig = process.env.DATABASE_URL 
    ? { 
        connectionString: process.env.DATABASE_URL,
        ssl: { rejectUnauthorized: false }
      }
    : {
        user: process.env.DB_USER || 'postgres',
        password: process.env.DB_PASSWORD || 'password',
        host: process.env.DB_SERVER || 'localhost',
        database: process.env.DB_NAME || 'keuangandb',
        port: process.env.DB_PORT || 5432,
        ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false
    };

const pool = new Pool(dbConfig);

pool.connect()
    .then(() => console.log('Terhubung ke PostgreSQL'))
    .catch(err => console.error('Gagal terhubung ke PostgreSQL:', err.message));

// Helper for filtering by month/year
const getFilterClause = (month, year) => {
    let whereClause = "WHERE 1=1";
    const params = [];
    if (month && year) {
        whereClause = `WHERE EXTRACT(MONTH FROM Tanggal) = $1 AND EXTRACT(YEAR FROM Tanggal) = $2`;
        params.push(parseInt(month), parseInt(year));
    }
    return { whereClause, params };
};

// API: Summary
app.get('/api/summary', async (req, res) => {
    try {
        const { month, year } = req.query;
        const { whereClause, params } = getFilterClause(month, year);
        
        let cumulativeWhere = "";
        let params2 = [];
        if (month && year) {
            // MAKE_DATE(year, month, day) + INTERVAL '1 month'
            cumulativeWhere = `WHERE Tanggal < (MAKE_DATE($2, $1, 1) + INTERVAL '1 month')`;
            params2 = [parseInt(month), parseInt(year)];
        }

        const query1 = `
            SELECT 
                COALESCE(SUM(CASE WHEN Jenis = 'Pemasukan' THEN Nominal ELSE 0 END), 0) AS "TotalPemasukan",
                COALESCE(SUM(CASE WHEN Jenis = 'Pengeluaran' THEN Nominal ELSE 0 END), 0) AS "TotalPengeluaran",
                COALESCE(SUM(CASE WHEN Jenis = 'Menabung' THEN Nominal ELSE 0 END), 0) AS "TotalMenabung",
                COALESCE(SUM(CASE WHEN Jenis = 'Tarik Tabungan' THEN Nominal ELSE 0 END), 0) AS "TotalTarikTabungan"
            FROM Transaksi
            ${whereClause}
        `;
        
        const query2 = `
            SELECT 
                COALESCE(SUM(CASE WHEN Jenis = 'Pemasukan' THEN Nominal ELSE 0 END), 0) -
                COALESCE(SUM(CASE WHEN Jenis = 'Pengeluaran' THEN Nominal ELSE 0 END), 0) -
                COALESCE(SUM(CASE WHEN Jenis = 'Menabung' THEN Nominal ELSE 0 END), 0) +
                COALESCE(SUM(CASE WHEN Jenis = 'Tarik Tabungan' THEN Nominal ELSE 0 END), 0) AS "SaldoAktif"
            FROM Transaksi
            ${cumulativeWhere}
        `;
        
        const result1 = await pool.query(query1, params);
        const result2 = await pool.query(query2, params2);
        
        const totalPemasukan = parseFloat(result1.rows[0].TotalPemasukan || 0);
        const totalPengeluaran = parseFloat(result1.rows[0].TotalPengeluaran || 0);
        const totalMenabung = parseFloat(result1.rows[0].TotalMenabung || 0);
        const totalTarikTabungan = parseFloat(result1.rows[0].TotalTarikTabungan || 0);
        const saldoAktif = parseFloat(result2.rows[0].SaldoAktif || 0);
        
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
        const { whereClause, params } = getFilterClause(month, year);

        const result = await pool.query(`
            SELECT t.Id as "Id", t.Tanggal as "Tanggal", t.Jenis as "Jenis", t.Kategori as "Kategori", 
                   t.MetodePembayaran as "MetodePembayaran", t.TujuanTabunganId as "TujuanTabunganId", 
                   tg.NamaTarget as "NamaTarget", t.Nominal as "Nominal", t.Keterangan as "Keterangan", 
                   t.CreatedAt as "CreatedAt"
            FROM Transaksi t
            LEFT JOIN TargetTabungan tg ON t.TujuanTabunganId = tg.Id
            ${whereClause}
            ORDER BY t.Tanggal DESC, t.CreatedAt DESC
        `, params);
        res.json(result.rows);
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
        await pool.query(`
            INSERT INTO Transaksi (Tanggal, Jenis, Kategori, MetodePembayaran, TujuanTabunganId, Nominal, Keterangan)
            VALUES ($1, $2, $3, $4, $5, $6, $7)
        `, [Tanggal, Jenis, Kategori || '', MetodePembayaran || null, TujuanTabunganId || null, Nominal, Keterangan || '']);
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
        const result = await pool.query(`
            UPDATE Transaksi 
            SET Tanggal = $1, Jenis = $2, Kategori = $3, 
                MetodePembayaran = $4, TujuanTabunganId = $5, 
                Nominal = $6, Keterangan = $7
            WHERE Id = $8
        `, [Tanggal, Jenis, Kategori || '', MetodePembayaran || null, TujuanTabunganId || null, Nominal, Keterangan || '', id]);
        
        if (result.rowCount === 0) {
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
        const result = await pool.query(`DELETE FROM Transaksi WHERE Id = $1`, [id]);
        
        if (result.rowCount === 0) {
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
        const result = await pool.query('SELECT Nominal as "Nominal" FROM Budget WHERE Id = 1');
        const nominal = result.rows.length > 0 ? parseFloat(result.rows[0].Nominal) : 0;
        res.json({ Nominal: nominal });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// API: Budget POST
app.post('/api/budget', async (req, res) => {
    try {
        const { Nominal } = req.body;
        const check = await pool.query('SELECT * FROM Budget WHERE Id = 1');
        if (check.rows.length > 0) {
            await pool.query('UPDATE Budget SET Nominal = $1 WHERE Id = 1', [Nominal]);
        } else {
            await pool.query('INSERT INTO Budget (Id, Nominal) VALUES (1, $1)', [Nominal]);
        }
        res.json({ message: "Budget berhasil diatur" });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Endpoint Chart: Kategori
app.get('/api/chart/categories', async (req, res) => {
    try {
        const { month, year } = req.query;
        let whereStr = "WHERE Jenis = 'Pengeluaran'";
        const params = [];
        if (month && year) {
            whereStr += " AND EXTRACT(MONTH FROM Tanggal) = $1 AND EXTRACT(YEAR FROM Tanggal) = $2";
            params.push(parseInt(month), parseInt(year));
        }

        const result = await pool.query(`
            SELECT Kategori as "Kategori", SUM(Nominal) as "Total"
            FROM Transaksi
            ${whereStr}
            GROUP BY Kategori
            ORDER BY "Total" DESC
        `, params);
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Endpoint Chart: Kategori (Pemasukan)
app.get('/api/chart/categories-income', async (req, res) => {
    try {
        const { month, year } = req.query;
        let whereStr = "WHERE Jenis = 'Pemasukan'";
        const params = [];
        if (month && year) {
            whereStr += " AND EXTRACT(MONTH FROM Tanggal) = $1 AND EXTRACT(YEAR FROM Tanggal) = $2";
            params.push(parseInt(month), parseInt(year));
        }

        const result = await pool.query(`
            SELECT Kategori as "Kategori", SUM(Nominal) as "Total"
            FROM Transaksi
            ${whereStr}
            GROUP BY Kategori
            ORDER BY "Total" DESC
        `, params);
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Endpoint Chart: Cashflow
app.get('/api/chart/cashflow', async (req, res) => {
    try {
        const { range, start, end } = req.query;
        let queryStr = '';
        let params = [];

        if (range === 'custom' && start && end) {
            queryStr = `
                SELECT 
                       TO_CHAR(Tanggal, 'YYYY-MM-DD') as "Label",
                       SUM(CASE WHEN Jenis = 'Pemasukan' THEN Nominal ELSE 0 END) as "Pemasukan",
                       SUM(CASE WHEN Jenis = 'Pengeluaran' THEN Nominal ELSE 0 END) as "Pengeluaran"
                FROM Transaksi
                WHERE CAST(Tanggal AS DATE) >= $1 AND CAST(Tanggal AS DATE) <= $2
                GROUP BY TO_CHAR(Tanggal, 'YYYY-MM-DD')
                ORDER BY "Label" DESC
            `;
            params = [start, end];
        } else if (range === 'daily') {
            queryStr = `
                SELECT 
                       TO_CHAR(Tanggal, 'YYYY-MM-DD') as "Label",
                       SUM(CASE WHEN Jenis = 'Pemasukan' THEN Nominal ELSE 0 END) as "Pemasukan",
                       SUM(CASE WHEN Jenis = 'Pengeluaran' THEN Nominal ELSE 0 END) as "Pengeluaran"
                FROM Transaksi
                WHERE Tanggal >= CURRENT_DATE - INTERVAL '7 days'
                GROUP BY TO_CHAR(Tanggal, 'YYYY-MM-DD')
                ORDER BY "Label" DESC
                LIMIT 7
            `;
        } else if (range === 'yearly') {
            queryStr = `
                SELECT 
                       TO_CHAR(Tanggal, 'YYYY') as "Label",
                       SUM(CASE WHEN Jenis = 'Pemasukan' THEN Nominal ELSE 0 END) as "Pemasukan",
                       SUM(CASE WHEN Jenis = 'Pengeluaran' THEN Nominal ELSE 0 END) as "Pengeluaran"
                FROM Transaksi
                WHERE Tanggal >= CURRENT_DATE - INTERVAL '5 years'
                GROUP BY TO_CHAR(Tanggal, 'YYYY')
                ORDER BY "Label" DESC
                LIMIT 5
            `;
        } else {
            queryStr = `
                SELECT 
                       TO_CHAR(Tanggal, 'YYYY-MM') as "Label",
                       SUM(CASE WHEN Jenis = 'Pemasukan' THEN Nominal ELSE 0 END) as "Pemasukan",
                       SUM(CASE WHEN Jenis = 'Pengeluaran' THEN Nominal ELSE 0 END) as "Pengeluaran"
                FROM Transaksi
                WHERE Tanggal >= CURRENT_DATE - INTERVAL '12 months'
                GROUP BY TO_CHAR(Tanggal, 'YYYY-MM')
                ORDER BY "Label" DESC
                LIMIT 12
            `;
        }

        const result = await pool.query(queryStr, params);
        res.json(result.rows.reverse());
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// API: GET Goals
app.get('/api/goals', async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT g.Id as "Id", g.NamaTarget as "NamaTarget", g.TargetNominal as "TargetNominal", g.IconCategory as "IconCategory",
                   COALESCE(SUM(CASE WHEN t.Jenis = 'Menabung' THEN t.Nominal WHEN t.Jenis = 'Tarik Tabungan' THEN -t.Nominal ELSE 0 END), 0) AS "Terkumpul"
            FROM TargetTabungan g
            LEFT JOIN Transaksi t ON g.Id = t.TujuanTabunganId
            GROUP BY g.Id, g.NamaTarget, g.TargetNominal, g.IconCategory, g.CreatedAt
            ORDER BY g.CreatedAt DESC
        `);
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// API: POST Goals
app.post('/api/goals', async (req, res) => {
    try {
        const { NamaTarget, TargetNominal, IconCategory } = req.body;
        if (!NamaTarget || !TargetNominal) return res.status(400).json({ error: "Data tidak lengkap" });
        await pool.query(
            `INSERT INTO TargetTabungan (NamaTarget, TargetNominal, IconCategory) VALUES ($1, $2, $3)`,
            [NamaTarget, TargetNominal, IconCategory || 'casual']
        );
        res.status(201).json({ message: "Goal berhasil ditambahkan" });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// API: DELETE Goals
app.delete('/api/goals/:id', async (req, res) => {
    try {
        const id = req.params.id;
        const result = await pool.query(`DELETE FROM TargetTabungan WHERE Id = $1`, [id]);
        if (result.rowCount === 0) return res.status(404).json({ error: "Goal tidak ditemukan" });
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

        const currentRes = await pool.query(`
            SELECT COALESCE(SUM(Nominal), 0) AS "Total" 
            FROM Transaksi 
            WHERE Jenis = 'Pemasukan' AND EXTRACT(MONTH FROM Tanggal) = $1 AND EXTRACT(YEAR FROM Tanggal) = $2
        `, [currentMonth, currentYear]);
            
        const prevRes = await pool.query(`
            SELECT COALESCE(SUM(Nominal), 0) AS "Total" 
            FROM Transaksi 
            WHERE Jenis = 'Pemasukan' AND EXTRACT(MONTH FROM Tanggal) = $1 AND EXTRACT(YEAR FROM Tanggal) = $2
        `, [prevMonth, prevYear]);

        const currentTotal = parseFloat(currentRes.rows[0].Total);
        const prevTotal = parseFloat(prevRes.rows[0].Total);
        
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

// API: Pemasukan Chart
app.get('/api/chart/pemasukan', async (req, res) => {
    try {
        const { startDate, endDate, groupBy } = req.query;
        if (!startDate || !endDate || !groupBy) {
            return res.status(400).json({ error: "startDate, endDate, and groupBy are required" });
        }

        let formatStr = 'YYYY-MM-DD'; 
        if (groupBy === 'monthly') formatStr = 'YYYY-MM';
        if (groupBy === 'yearly') formatStr = 'YYYY';

        const result = await pool.query(`
            SELECT 
                TO_CHAR(Tanggal, '${formatStr}') AS "Label",
                SUM(Nominal) AS "Total"
            FROM Transaksi
            WHERE Jenis = 'Pemasukan' 
              AND Tanggal >= $1 
              AND Tanggal <= $2
            GROUP BY TO_CHAR(Tanggal, '${formatStr}')
            ORDER BY "Label" ASC
        `, [startDate, endDate]);

        const dbData = result.rows;
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
            } else { 
                label = current.toISOString().split('T')[0];
                nextDate.setDate(current.getDate() + 1);
            }
            
            if (!completeData.find(d => d.Label === label)) {
                const existing = dbData.find(d => d.Label === label);
                completeData.push({
                    Label: label,
                    Total: existing ? parseFloat(existing.Total) : 0
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
        
        const currentRes = await pool.query(`
            SELECT COALESCE(SUM(Nominal), 0) AS "Total" 
            FROM Transaksi 
            WHERE Jenis = 'Pengeluaran' AND EXTRACT(MONTH FROM Tanggal) = $1 AND EXTRACT(YEAR FROM Tanggal) = $2
        `, [currentMonth, currentYear]);
            
        const prevRes = await pool.query(`
            SELECT COALESCE(SUM(Nominal), 0) AS "Total" 
            FROM Transaksi 
            WHERE Jenis = 'Pengeluaran' AND EXTRACT(MONTH FROM Tanggal) = $1 AND EXTRACT(YEAR FROM Tanggal) = $2
        `, [prevMonth, prevYear]);

        const currentTotal = parseFloat(currentRes.rows[0].Total);
        const prevTotal = parseFloat(prevRes.rows[0].Total);
        
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

        let formatStr = 'YYYY-MM-DD';
        if (groupBy === 'monthly') formatStr = 'YYYY-MM';
        if (groupBy === 'yearly') formatStr = 'YYYY';

        const result = await pool.query(`
            SELECT 
                TO_CHAR(Tanggal, '${formatStr}') AS "Label",
                SUM(Nominal) AS "Total"
            FROM Transaksi
            WHERE Jenis = 'Pengeluaran' 
              AND Tanggal >= $1 
              AND Tanggal <= $2
            GROUP BY TO_CHAR(Tanggal, '${formatStr}')
            ORDER BY "Label" ASC
        `, [startDate, endDate]);

        const dbData = result.rows;
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
            } else { 
                label = current.toISOString().split('T')[0];
                nextDate.setDate(current.getDate() + 1);
            }
            
            if (!completeData.find(d => d.Label === label)) {
                const existing = dbData.find(d => d.Label === label);
                completeData.push({
                    Label: label,
                    Total: existing ? parseFloat(existing.Total) : 0
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
