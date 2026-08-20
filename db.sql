-- Buat Tabel TargetTabungan
CREATE TABLE IF NOT EXISTS TargetTabungan (
    Id SERIAL PRIMARY KEY,
    NamaTarget VARCHAR(100) NOT NULL,
    TargetNominal DECIMAL(18, 2) NOT NULL,
    IconCategory VARCHAR(50) DEFAULT 'casual',
    CreatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Buat Tabel Transaksi
CREATE TABLE IF NOT EXISTS Transaksi (
    Id SERIAL PRIMARY KEY,
    Tanggal DATE NOT NULL,
    Jenis VARCHAR(50) NOT NULL CHECK (Jenis IN ('Pemasukan', 'Pengeluaran', 'Menabung', 'Tarik Tabungan')),
    Kategori VARCHAR(100) NOT NULL,
    MetodePembayaran VARCHAR(50) NULL,
    TujuanTabunganId INT NULL REFERENCES TargetTabungan(Id),
    Nominal DECIMAL(18, 2) NOT NULL,
    Keterangan TEXT,
    CreatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Buat Tabel Budget (hanya 1 baris)
CREATE TABLE IF NOT EXISTS Budget (
    Id INT PRIMARY KEY,
    Nominal DECIMAL(18, 2) NOT NULL
);

-- Buat Tabel Budget Per Kategori
CREATE TABLE IF NOT EXISTS BudgetKategori (
    Id SERIAL PRIMARY KEY,
    Kategori VARCHAR(100) UNIQUE NOT NULL,
    Nominal DECIMAL(18, 2) NOT NULL,
    CreatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
