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

// Konfigurasi PostgreSQL (Vercel Neon Integration uses POSTGRES_URL)
const connectionString = process.env.POSTGRES_URL || process.env.DATABASE_URL;
const dbConfig = connectionString 
    ? { 
        connectionString: connectionString,
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

// API: Setup DB automatically
app.get('/api/setup-db', async (req, res) => {
    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS BudgetKategori (
                Id SERIAL PRIMARY KEY,
                Kategori VARCHAR(100) UNIQUE NOT NULL,
                Nominal DECIMAL(18, 2) NOT NULL,
                CreatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);
        res.send("<h1>Setup Database Berhasil!</h1><p>Tabel BudgetKategori sukses dibuat di database Vercel Anda. Silakan kembali ke halaman web Cashly Anda.</p>");
    } catch (err) {
        res.status(500).send("<h1>Error Setup Database</h1><p>" + err.message + "</p>");
    }
});

// API: Deteksi Lokasi Database
app.get('/api/where-is-my-db', (req, res) => {
    try {
        const url = process.env.POSTGRES_URL || process.env.DATABASE_URL;
        if (!url) return res.send("<h1>Tidak ada konfigurasi POSTGRES_URL di Vercel</h1>");
        
        const parsed = new URL(url);
        res.send(`
            <h2>Ini adalah detail Database yang terhubung ke aplikasimu:</h2>
            <ul>
                <li><strong>Host / Project ID Neon:</strong> ${parsed.hostname}</li>
                <li><strong>Nama Database (Branch):</strong> ${parsed.pathname.replace('/', '')}</li>
                <li><strong>User:</strong> ${parsed.username}</li>
            </ul>
            <p>Silakan buka <a href="https://console.neon.tech/app/projects" target="_blank">Dashboard Neon</a> dan cari Project yang host-nya berawalan <strong>${parsed.hostname.split('.')[0]}</strong></p>
        `);
    } catch (err) {
        res.status(500).send("Error: " + err.message);
    }
});

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

// API: Budget Kategori GET
app.get('/api/budget/categories', async (req, res) => {
    try {
        const { month, year } = req.query;
        let whereStr = "WHERE t.Jenis = 'Pengeluaran'";
        const params = [];
        if (month && year) {
            whereStr += " AND EXTRACT(MONTH FROM t.Tanggal) = $1 AND EXTRACT(YEAR FROM t.Tanggal) = $2";
            params.push(parseInt(month), parseInt(year));
        }

        const query = `
            SELECT 
                b.Id as "Id",
                b.Kategori as "Kategori",
                CAST(b.Nominal AS FLOAT) as "BudgetNominal",
                COALESCE(CAST(SUM(t.Nominal) AS FLOAT), 0) as "Terpakai"
            FROM BudgetKategori b
            LEFT JOIN Transaksi t ON b.Kategori = t.Kategori 
                ${whereStr.replace("WHERE", "AND")}
            GROUP BY b.Id, b.Kategori, b.Nominal
            ORDER BY b.Kategori ASC
        `;
        
        const result = await pool.query(query, params);
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// API: Budget Kategori POST (Upsert)
app.post('/api/budget/categories', async (req, res) => {
    try {
        const { Kategori, Nominal } = req.body;
        if (!Kategori || !Nominal) return res.status(400).json({ error: "Data tidak lengkap" });
        
        const check = await pool.query('SELECT * FROM BudgetKategori WHERE Kategori = $1', [Kategori]);
        if (check.rows.length > 0) {
            await pool.query('UPDATE BudgetKategori SET Nominal = $1 WHERE Kategori = $2', [Nominal, Kategori]);
            res.json({ message: "Budget berhasil diperbarui" });
        } else {
            await pool.query('INSERT INTO BudgetKategori (Kategori, Nominal) VALUES ($1, $2)', [Kategori, Nominal]);
            res.status(201).json({ message: "Budget berhasil ditambahkan" });
        }
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// API: Budget Kategori DELETE
app.delete('/api/budget/categories/:id', async (req, res) => {
    try {
        const id = req.params.id;
        const result = await pool.query('DELETE FROM BudgetKategori WHERE Id = $1', [id]);
        if (result.rowCount === 0) return res.status(404).json({ error: "Budget tidak ditemukan" });
        res.json({ message: "Budget berhasil dihapus" });
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
            SELECT Kategori as "Kategori", CAST(SUM(Nominal) AS FLOAT) as "Total"
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
            SELECT Kategori as "Kategori", CAST(SUM(Nominal) AS FLOAT) as "Total"
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
                       CAST(SUM(CASE WHEN Jenis = 'Pemasukan' THEN Nominal ELSE 0 END) AS FLOAT) as "Pemasukan",
                       CAST(SUM(CASE WHEN Jenis = 'Pengeluaran' THEN Nominal ELSE 0 END) AS FLOAT) as "Pengeluaran"
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
                       CAST(SUM(CASE WHEN Jenis = 'Pemasukan' THEN Nominal ELSE 0 END) AS FLOAT) as "Pemasukan",
                       CAST(SUM(CASE WHEN Jenis = 'Pengeluaran' THEN Nominal ELSE 0 END) AS FLOAT) as "Pengeluaran"
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
                       CAST(SUM(CASE WHEN Jenis = 'Pemasukan' THEN Nominal ELSE 0 END) AS FLOAT) as "Pemasukan",
                       CAST(SUM(CASE WHEN Jenis = 'Pengeluaran' THEN Nominal ELSE 0 END) AS FLOAT) as "Pengeluaran"
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
                       CAST(SUM(CASE WHEN Jenis = 'Pemasukan' THEN Nominal ELSE 0 END) AS FLOAT) as "Pemasukan",
                       CAST(SUM(CASE WHEN Jenis = 'Pengeluaran' THEN Nominal ELSE 0 END) AS FLOAT) as "Pengeluaran"
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
                CAST(SUM(Nominal) AS FLOAT) AS "Total"
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
                CAST(SUM(Nominal) AS FLOAT) AS "Total"
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

if (require.main === module) {
    app.listen(port, () => {
        console.log(`Aplikasi berjalan di http://localhost:${port}`);
    });
}

// Untuk Vercel Serverless
module.exports = app;
