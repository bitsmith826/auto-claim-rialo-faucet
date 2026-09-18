# 🚀 Rialo Faucet Auto Claim (Multi-Wallet Concurrent & SOCKS5 Rotation)

Skrip otomatisasi klaim airdrop testnet Rialo Faucet dengan arsitektur **Multi-Wallet Concurrent** dan **Rotasi 12 Provider SOCKS5**. Mengambil proxy SOCKS5 gratis terupdate secara otomatis dan mengeksekusi klaim seluruh wallet secara simultan di setiap ronde dengan log terminal yang bersih, rapi, dan mudah dipantau.

---

## ✨ Fitur Utama

- **⚡ Klaim Multi-Wallet Konkuren (Paralel)**: Seluruh wallet di `wallet.txt` diproses secara serentak (*concurrent*) di setiap ronde menggunakan `Promise.all`, menghemat waktu secara drastis tanpa perlu antrean lambat.
- **🔄 Rotasi 12 Provider SOCKS5**: Mengambil puluhan ribu proxy SOCKS5 murni secara bergantian dari 12 provider terpercaya di setiap putaran ronde.
- **🤫 Smart Silent Retry (Bebas Spam Error)**: Kegagalan proxy gratis (timeout / refused) ditangani otomatis dengan 1x *retry* hening di balik layar, menjaga terminal tetap bersih dari spam log error.
- **🎨 Tampilan CLI Presisi & Box Header**: Tampilan pembuka berbingkai kotak presisi (*box header*) dan tag status terstandar berkode warna ANSI (`SUCCESS`, `COOLDOWN`, `FAILED`, `SCRAPER`, `BATCH`).
- **📊 Ringkasan Batch Otomatis**: Setiap ronde selesai, bot menampilkan rekapitulasi instan jumlah wallet yang berhasil, terkena cooldown, dan gagal.
- **🔒 Anti-Hang Guard**: Dilengkapi batas timeout ketat (7-8 detik) dan penanganan unhandled socket agar script tetap berjalan stabil 24/7.

---

## 🖥️ Contoh Tampilan Terminal

```text
╔══════════════════════════════════════════════════════════════╗
║                 RIALO FAUCET AUTO CLAIM BOT                  ║
║          Multi-Wallet Auto Claim with SOCKS5 Proxy           ║
╠══════════════════════════════════════════════════════════════╣
║ Network : Rialo Testnet (Chain ID: 5042)                     ║
║ Wallets : 10 Wallet terdaftar di wallet.txt                  ║
║ Mode    : Konkuren (Paralel) - Semua wallet jalan serentak   ║
║ Sumber  : 12 Provider SOCKS5 (Rotasi per ronde)              ║
╚══════════════════════════════════════════════════════════════╝

─ [ RONDE #1 • Monosans ] ──────────────────────────────────────
[18:30:15] [ SCRAPER  ] Mengambil proxy dari Monosans...
  ├─ Ditemukan : 3,450 proxy SOCKS5
  └─ Status    : Memproses 10 wallet secara KONKUREN (Paralel)...

  [ SUCCESS  ] [W-01] 7xKX...gAsU Tx: 0x4f8a...9c1b (Total Sukses: 1)
  [ COOLDOWN ] [W-02] 9WzD...AWWM Faucet Rate Limit / Cooldown
  [ SUCCESS  ] [W-03] EPjF...TDt1 Tx: 0x12dc...8e4a (Total Sukses: 2)

────────────────────────────────────────────────────────────────
[18:30:23] [  BATCH   ] Ronde #1 Selesai: 2 Sukses | 1 Cooldown | 0 Gagal (Total Sukses Akumulasi: 2)
────────────────────────────────────────────────────────────────
Jeda 5s sebelum ronde berikutnya...
```

---

## 🌐 Daftar 12 Sumber Proxy SOCKS5

1. **Monosans SOCKS5** *(Hourly Verified)*
2. **ProxyScrape API v4**
3. **Proxifly Direct SOCKS5**
4. **Geonode API**
5. **TheSpeedX SOCKS-List**
6. **Komutan234 Free Proxy**
7. **ProxyGather Working SOCKS5**
8. **ProxyGenerator Stable**
9. **Zloi-user (Hideip.me)**
10. **ErcinDedeoglu Mega Pool**
11. **FreeProxyList Web Scraper**
12. **NodeMaven SOCKS5**

---

## 📋 Persyaratan

- [Node.js](https://nodejs.org/) versi 16 atau lebih baru.
- Koneksi internet.

---

## 🛠️ Instalasi & Persiapan

1. **Clone repository ini:**
   ```bash
   git clone https://github.com/bitsmith826/auto-claim-rialo-faucet.git
   cd auto-claim-rialo-faucet
   ```

2. **Install dependensi:**
   ```bash
   npm install
   ```

3. **Siapkan file `wallet.txt`:**
   Salin contoh format:
   ```bash
   cp wallet.example.txt wallet.txt
   ```
   Buka `wallet.txt` dan masukkan alamat public key wallet Anda (1 baris per wallet):
   ```text
   7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU
   9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM
   EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v
   ```

---

## ▶️ Cara Menjalankan

Cukup jalankan:
```bash
npm start
```
atau:
```bash
node index.js
```

Untuk menghentikan skrip, tekan `Ctrl + C` pada terminal.

---

## ⚠️ Disclaimer

Skrip ini dibuat untuk tujuan edukasi dan pengujian di Rialo Testnet. Penggunaan proxy publik gratis memiliki sifat yang dinamis (koneksi bisa naik-turun). Gunakan secara bijak sesuai ketentuan jaringan uji coba.
