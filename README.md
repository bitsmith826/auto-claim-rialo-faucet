# 🚀 Rialo Faucet Auto Claim (Multi-Provider SOCKS5 Paralel)

Skrip otomatisasi klaim airdrop testnet Rialo Faucet menggunakan arsitektur **Multi-Provider SOCKS5 Paralel**. Mengambil puluhan ribu proxy SOCKS5 gratis terupdate secara otomatis dan mengeksekusi klaim multi-wallet secara simultan.

---

## ✨ Fitur Utama

- **⚡ 12 Provider SOCKS5 Paralel**: Menjalankan 12 scraper & endpoint proxy independen secara bersamaan tanpa saling menghambat.
- **🛡️ 100% SOCKS5 Murni**: Dilengkapi smart validator dan regex filter untuk membersihkan protokol non-SOCKS5 atau format teks kotor.
- **👛 Multi-Wallet via `wallet.txt`**: Cukup masukkan daftar alamat wallet (1 baris per wallet).
- **🎨 Tampilan CLI Bersih & Berwarna**: Dilengkapi status badge berkode warna ANSI (`SUCCESS`, `COOLDOWN`, `FAILED`, `SCRAPER`, `BATCH`) dan timestamp.
- **🔒 Anti-Crash & Anti-Hang Guard**: Dilengkapi hard timeout 8 detik per request dan global handler agar script tetap berjalan stabil 24/7.

---

## 🌐 Daftar Sumber Proxy SOCKS5

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
   git clone https://github.com/USERNAME/auto-claim-rialo-faucet.git
   cd auto-claim-rialo-faucet
   ```

2. **Install dependensi:**
   ```bash
   npm install
   ```

3. **Siapkan file `wallet.txt`:**
   Buat file bernama `wallet.txt` (atau copy dari `wallet.example.txt`):
   ```bash
   cp wallet.example.txt wallet.txt
   ```
   Buka `wallet.txt` dan masukkan alamat public key wallet Anda (1 baris = 1 wallet):
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
