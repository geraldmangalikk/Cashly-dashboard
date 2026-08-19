-- Buat Database (Jalankan ini dulu jika belum ada database)
-- CREATE DATABASE KeuanganDB;
-- GO

-- USE KeuanganDB;
-- GO

-- Buat Tabel TargetTabungan
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='TargetTabungan' and xtype='U')
BEGIN
    CREATE TABLE TargetTabungan (
        Id INT IDENTITY(1,1) PRIMARY KEY,
        NamaTarget VARCHAR(100) NOT NULL,
        TargetNominal DECIMAL(18, 2) NOT NULL,
        CreatedAt DATETIME DEFAULT GETDATE()
    );
END
GO

-- Buat Tabel Transaksi
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='Transaksi' and xtype='U')
BEGIN
    CREATE TABLE Transaksi (
        Id INT IDENTITY(1,1) PRIMARY KEY,
        Tanggal DATE NOT NULL,
        Jenis VARCHAR(50) NOT NULL CHECK (Jenis IN ('Pemasukan', 'Pengeluaran', 'Menabung', 'Tarik Tabungan')),
        Kategori VARCHAR(100) NOT NULL,
        MetodePembayaran VARCHAR(50) NULL,
        TujuanTabunganId INT NULL,
        Nominal DECIMAL(18, 2) NOT NULL,
        Keterangan NVARCHAR(MAX),
        CreatedAt DATETIME DEFAULT GETDATE()
    );
END
GO
