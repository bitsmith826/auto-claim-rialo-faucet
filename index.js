const fs = require('fs');
const path = require('path');
const axios = require('axios');
const cheerio = require('cheerio');
const { SocksProxyAgent } = require('socks-proxy-agent');

// Global Error Handler untuk mencegah crash akibat socket rusak dari free proxy
process.on('uncaughtException', () => {});
process.on('unhandledRejection', () => {});

// ==========================================
// WARNA & BADGE KONTRASTING (ANSI)
// ==========================================
const c = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  green: '\x1b[92m',
  yellow: '\x1b[93m',
  red: '\x1b[91m',
  cyan: '\x1b[96m',
  magenta: '\x1b[95m',
  blue: '\x1b[94m',
  white: '\x1b[97m',
  gray: '\x1b[90m',

  badgeSuccess: '\x1b[1m\x1b[92m[ SUCCESS  ]\x1b[0m',
  badgeCooldown: '\x1b[1m\x1b[93m[ COOLDOWN ]\x1b[0m',
  badgeFailed: '\x1b[1m\x1b[91m[  FAILED  ]\x1b[0m',
  badgeScraper: '\x1b[1m\x1b[96m[ SCRAPER  ]\x1b[0m',
  badgeBatch: '\x1b[1m\x1b[95m[  BATCH   ]\x1b[0m'
};

function getTime() {
  return `${c.gray}[${new Date().toTimeString().split(' ')[0]}]${c.reset}`;
}

// Format pesan error menjadi singkat, rapi, dan mudah dibaca
function cleanErrorMessage(error) {
  if (!error) return 'Unknown error';
  const str = error.response ? JSON.stringify(error.response.data) : (error.message || String(error));
  if (str.includes('Rate limit')) return 'Faucet Rate Limit';
  if (str.includes('timed out') || str.includes('timeout')) return 'Proxy Timeout (Mati/Lelet)';
  if (str.includes('Socket closed')) return 'Socket Closed';
  if (str.includes('certificate')) return 'Cert Expired';
  if (str.includes('ECONNRESET')) return 'Connection Reset';
  if (str.includes('ECONNREFUSED')) return 'Connection Refused';
  if (str.includes('handshake')) return 'Handshake Failed';
  if (str.length > 30) return str.slice(0, 27) + '...';
  return str;
}

// ==========================================
// 1. MEMBACA WALLET DARI wallet.txt
// ==========================================
function loadWallets() {
  const walletFile = path.join(__dirname, 'wallet.txt');
  if (!fs.existsSync(walletFile)) {
    console.error(`${c.red}[ERROR] File wallet.txt tidak ditemukan!${c.reset}`);
    process.exit(1);
  }

  const rawData = fs.readFileSync(walletFile, 'utf-8');
  const list = rawData
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith('#') && !line.startsWith('//'));

  if (list.length === 0) {
    console.error(`${c.red}[ERROR] wallet.txt masih kosong! Masukkan minimal 1 alamat wallet.${c.reset}`);
    process.exit(1);
  }

  return list;
}

const wallets = loadWallets();
const ENDPOINT = 'https://testnet.rialo.io/';
const REQUEST_TIMEOUT = 5000;
const HARD_TIMEOUT_GUARD = 8000;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Statistik Global
const stats = {
  totalSuccess: 0,
  totalCooldown: 0,
  totalFailed: 0,
  totalBatches: 0
};

// Helper: Normalisasi dan validasi KHUSUS SOCKS5 murni (Pembersihan format ekstra)
function formatSocks5Url(ipOrUrl, port) {
  let raw = port ? `${ipOrUrl}:${port}` : ipOrUrl;
  if (!raw) return null;
  let str = String(raw).trim();

  // Tolak protokol non-SOCKS5
  if (str.startsWith('socks4://') || str.startsWith('http://') || str.startsWith('https://')) {
    return null;
  }

  if (str.startsWith('socks5://')) {
    str = str.replace('socks5://', '');
  }

  // Regex ketat: ekstrak hanya IPv4 dan Port (membersihkan trailing :Country atau info lain)
  const match = str.match(/^([0-9.]+):([0-9]+)/);
  if (!match) return null;

  return `socks5://${match[1]}:${match[2]}`;
}

// Helper: Fetch Plaintext Proxy List
async function fetchPlainText(url, timeout = 10000) {
  try {
    const { data } = await axios.get(url, { timeout });
    if (typeof data !== 'string') return [];
    return data
      .split(/\r?\n/)
      .map((line) => formatSocks5Url(line))
      .filter(Boolean);
  } catch (e) {
    return [];
  }
}

// ==========================================
// 2. DAFTAR ENDPOINT PROVIDER SOCKS5 LENGKAP
// ==========================================
const PROVIDERS = [
  // 1. Monosans SOCKS5 (Re-checked Tiap Jam)
  {
    id: 'monosans',
    name: 'Monosans',
    cooldown: 2000,
    fetchProxies: () => fetchPlainText('https://raw.githubusercontent.com/monosans/proxy-list/main/proxies/socks5.txt')
  },
  // 2. ProxyScrape API v4
  {
    id: 'proxyscrape',
    name: 'ProxyScrape',
    cooldown: 2000,
    fetchProxies: () => fetchPlainText('https://api.proxyscrape.com/v4/free-proxy-list/get?request=display_proxies&proxy_format=protocolipport&format=text&protocol=socks5')
  },
  // 3. Proxifly Direct SOCKS5
  {
    id: 'proxifly',
    name: 'Proxifly',
    cooldown: 15000,
    fetchProxies: async () => {
      try {
        const { data } = await axios.get(
          'https://cdn.jsdelivr.net/gh/proxifly/free-proxy-list@main/proxies/protocols/socks5/data.json',
          { timeout: 10000 }
        );
        if (!Array.isArray(data)) return [];
        return data
          .filter((p) => p.ip && p.port && p.protocol && p.protocol.toLowerCase() === 'socks5')
          .map((p) => formatSocks5Url(p.ip, p.port))
          .filter(Boolean);
      } catch (e) {
        return [];
      }
    }
  },
  // 4. Geonode API SOCKS5
  {
    id: 'geonode',
    name: 'Geonode',
    cooldown: 15000,
    fetchProxies: async () => {
      try {
        const { data } = await axios.get(
          'https://proxylist.geonode.com/api/proxy-list?protocols=socks5&page=1&limit=200&sort_by=responseTime&sort_type=asc',
          { timeout: 10000 }
        );
        if (!data || !Array.isArray(data.data)) return [];
        return data.data
          .filter((p) => p.ip && p.port && Array.isArray(p.protocols) && p.protocols.includes('socks5'))
          .map((p) => formatSocks5Url(p.ip, p.port))
          .filter(Boolean);
      } catch (e) {
        return [];
      }
    }
  },
  // 5. TheSpeedX SOCKS-List (~2.500 SOCKS5)
  {
    id: 'thespeedx',
    name: 'TheSpeedX',
    cooldown: 3000,
    fetchProxies: () => fetchPlainText('https://raw.githubusercontent.com/TheSpeedX/SOCKS-List/master/socks5.txt')
  },
  // 6. Komutan234 Free Proxy (Update tiap 15m)
  {
    id: 'komutan234',
    name: 'Komutan234',
    cooldown: 3000,
    fetchProxies: () => fetchPlainText('https://raw.githubusercontent.com/komutan234/Proxy-List-Free/main/proxies/socks5.txt')
  },
  // 7. ProxyGather Working SOCKS5 (Checked)
  {
    id: 'proxygather',
    name: 'ProxyGather',
    cooldown: 3000,
    fetchProxies: () => fetchPlainText('https://raw.githubusercontent.com/Skillter/ProxyGather/refs/heads/master/proxies/working-proxies-socks5.txt')
  },
  // 8. ProxyGenerator Stable SOCKS5
  {
    id: 'proxygenerator',
    name: 'ProxyGen',
    cooldown: 3000,
    fetchProxies: () => fetchPlainText('https://raw.githubusercontent.com/proxygenerator1/ProxyGenerator/main/Stable/socks5.txt')
  },
  // 9. Zloi-user (Hideip.me)
  {
    id: 'zloiuser',
    name: 'ZloiUser',
    cooldown: 4000,
    fetchProxies: () => fetchPlainText('https://raw.githubusercontent.com/Zloi-user/hideip.me/main/socks5.txt')
  },
  // 10. ErcinDedeoglu SOCKS5 (~23.000 SOCKS5)
  {
    id: 'ercindedeoglu',
    name: 'ErcinDede',
    cooldown: 4000,
    fetchProxies: () => fetchPlainText('https://raw.githubusercontent.com/ErcinDedeoglu/proxies/main/proxies/socks5.txt')
  },
  // 11. FreeProxyList Web Scraper
  {
    id: 'freeproxylist',
    name: 'FreeProxyList',
    cooldown: 3000,
    fetchProxies: async () => {
      const proxies = [];
      try {
        const { data } = await axios.get('https://free-proxy-list.net/en/socks-proxy.html', {
          headers: { 'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
          timeout: 10000
        });
        const $ = cheerio.load(data);
        $('table.table-striped tbody tr').each((_, element) => {
          const cols = $(element).find('td');
          const ip = $(cols[0]).text().trim();
          const port = $(cols[1]).text().trim();
          const version = $(cols[4]).text().trim().toLowerCase();
          if (ip && port && version === 'socks5') {
            const formatted = formatSocks5Url(ip, port);
            if (formatted) proxies.push(formatted);
          }
        });
      } catch (e) {}
      return proxies.length > 0 ? proxies : fetchPlainText('https://raw.githubusercontent.com/TheSpeedX/SOCKS-List/master/socks5.txt');
    }
  },
  // 12. NodeMaven SOCKS5
  {
    id: 'nodemaven',
    name: 'NodeMaven',
    cooldown: 3000,
    fetchProxies: async () => {
      try {
        const { data } = await axios.get('https://freeproxies.nodemaven.com/proxies?per_page=100', { timeout: 10000 });
        if (data && Array.isArray(data.proxies)) {
          const list = data.proxies
            .filter((p) => p.protocol && p.protocol.toUpperCase() === 'SOCKS5')
            .map((p) => formatSocks5Url(p.proxy))
            .filter(Boolean);
          if (list.length > 0) return list;
        }
      } catch (e) {}
      return fetchPlainText('https://raw.githubusercontent.com/monosans/proxy-list/main/proxies/socks5.txt');
    }
  }
];

// ==========================================
// 3. FUNGSI CLAIM DENGAN LOGGING LENGKAP & RAPI
// ==========================================
function safeClaimFaucet(pubkey, proxyUrl, providerName) {
  return new Promise((resolve) => {
    const shortWallet = `${pubkey.slice(0, 8)}...${pubkey.slice(-4)}`;
    const providerTag = `${c.cyan}[${providerName.padEnd(14)}]${c.reset}`;
    const walletTag = `${c.blue}[${shortWallet}]${c.reset}`;

    const timer = setTimeout(() => {
      stats.totalFailed++;
      console.log(`${getTime()} ${providerTag} ${walletTag} ${c.badgeFailed} ${c.red}Proxy Timeout (8s)${c.reset}`);
      resolve({ status: 'failed' });
    }, HARD_TIMEOUT_GUARD);

    let agent;
    try {
      agent = new SocksProxyAgent(proxyUrl, { timeout: REQUEST_TIMEOUT });
    } catch (err) {
      clearTimeout(timer);
      stats.totalFailed++;
      console.log(`${getTime()} ${providerTag} ${walletTag} ${c.badgeFailed} ${c.red}Invalid Proxy Socket${c.reset}`);
      return resolve({ status: 'failed' });
    }

    const payload = {
      jsonrpc: '2.0',
      id: 1,
      method: 'requestAirdrop',
      params: [{ pubkey, kelvins: 1000000000 }]
    };

    axios.post(ENDPOINT, payload, {
      httpAgent: agent,
      httpsAgent: agent,
      headers: {
        'content-type': 'application/json',
        'origin': 'https://playground.rialo.io',
        'referer': 'https://playground.rialo.io/',
        'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      },
      timeout: REQUEST_TIMEOUT
    })
    .then((response) => {
      if (response.data && response.data.result) {
        stats.totalSuccess++;
        const txHash = String(response.data.result);
        const shortTx = txHash.length > 22 ? `${txHash.slice(0, 10)}...${txHash.slice(-8)}` : txHash;

        console.log(
          `${getTime()} ${providerTag} ${walletTag} ${c.badgeSuccess} ` +
          `${c.green}${c.bold}Tx: ${shortTx}${c.reset} ` +
          `${c.yellow}(Total Sukses: ${stats.totalSuccess})${c.reset}`
        );
        resolve({ status: 'success' });
      } else if (response.data && response.data.error) {
        const msg = response.data.error.message || '';
        if (msg.toLowerCase().includes('rate limit')) {
          stats.totalCooldown++;
          console.log(`${getTime()} ${providerTag} ${walletTag} ${c.badgeCooldown} ${c.yellow}Faucet Rate Limit / Cooldown${c.reset}`);
          resolve({ status: 'cooldown' });
        } else {
          stats.totalFailed++;
          console.log(`${getTime()} ${providerTag} ${walletTag} ${c.badgeFailed} ${c.red}${msg || 'RPC Error'}${c.reset}`);
          resolve({ status: 'failed' });
        }
      } else {
        stats.totalFailed++;
        console.log(`${getTime()} ${providerTag} ${walletTag} ${c.badgeFailed} ${c.red}Empty RPC Response${c.reset}`);
        resolve({ status: 'failed' });
      }
    })
    .catch((error) => {
      const errStr = error.response ? JSON.stringify(error.response.data) : (error.message || '');
      if (errStr.toLowerCase().includes('rate limit')) {
        stats.totalCooldown++;
        console.log(`${getTime()} ${providerTag} ${walletTag} ${c.badgeCooldown} ${c.yellow}Faucet Rate Limit / Cooldown${c.reset}`);
        resolve({ status: 'cooldown' });
      } else {
        stats.totalFailed++;
        const reason = cleanErrorMessage(error);
        console.log(`${getTime()} ${providerTag} ${walletTag} ${c.badgeFailed} ${c.red}${reason}${c.reset}`);
        resolve({ status: 'failed' });
      }
    })
    .finally(() => {
      clearTimeout(timer);
    });
  });
}

// ==========================================
// 4. RUNNER PER PROVIDER (INDEPENDENT LOOP)
// ==========================================
async function runProviderWorker(provider) {
  let loopCount = 1;
  const providerTag = `${c.cyan}[${provider.name.padEnd(14)}]${c.reset}`;

  while (true) {
    const proxies = await provider.fetchProxies();

    if (!proxies || proxies.length === 0) {
      console.log(`${getTime()} ${providerTag} ${c.badgeScraper} ${c.yellow}Gagal fetch proxy. Coba lagi dalam 5s...${c.reset}`);
      await sleep(5000);
      continue;
    }

    console.log(`${getTime()} ${providerTag} ${c.badgeScraper} ${c.white}Mendapatkan ${c.bold}${proxies.length}${c.reset}${c.white} proxy SOCKS5 | Batch #${loopCount}${c.reset}`);

    // Eksekusi semua wallet secara paralel
    const tasks = wallets.map((pubkey) => {
      const randomProxy = proxies[Math.floor(Math.random() * proxies.length)];
      return safeClaimFaucet(pubkey, randomProxy, provider.name);
    });

    const results = await Promise.all(tasks);
    stats.totalBatches++;

    // Hitung ringkasan batch
    const successCount = results.filter((r) => r.status === 'success').length;
    const cooldownCount = results.filter((r) => r.status === 'cooldown').length;
    const failedCount = results.filter((r) => r.status === 'failed').length;

    // Ringkasan Batch berwarna kontras
    const sColor = successCount > 0 ? `${c.green}${c.bold}${successCount} Sukses${c.reset}` : `${c.gray}0 Sukses${c.reset}`;
    const cColor = cooldownCount > 0 ? `${c.yellow}${c.bold}${cooldownCount} Cooldown${c.reset}` : `${c.gray}0 Cooldown${c.reset}`;
    const fColor = failedCount > 0 ? `${c.red}${failedCount} Gagal${c.reset}` : `${c.gray}0 Gagal${c.reset}`;

    console.log(
      `${getTime()} ${providerTag} ${c.badgeBatch} ` +
      `${c.magenta}Batch #${loopCount} Selesai:${c.reset} ${sColor} | ${cColor} | ${fColor} ` +
      `${c.gray}(Jeda ${provider.cooldown / 1000}s)${c.reset}`
    );

    await sleep(provider.cooldown);
    loopCount++;
  }
}

// ==========================================
// 5. ENTRY POINT
// ==========================================
async function main() {
  console.clear();
  console.log(`${c.cyan}${c.bold}========================================================================${c.reset}`);
  console.log(`${c.cyan}${c.bold}          🚀 RIALO FAUCET AUTO CLAIM - MEGA PROVIDER RUNNER             ${c.reset}`);
  console.log(`${c.cyan}${c.bold}========================================================================${c.reset}`);
  console.log(` ${c.bold}Wallets   :${c.reset} ${c.green}${wallets.length} wallet terdaftar${c.reset} ${c.gray}(dari wallet.txt)${c.reset}`);
  console.log(` ${c.bold}Providers :${c.reset} ${c.magenta}${PROVIDERS.length} Provider Paralel Active${c.reset}`);
  console.log(` ${c.bold}Daftar    :${c.reset} ${c.cyan}${PROVIDERS.map((p) => p.name).join(', ')}${c.reset}`);
  console.log(` ${c.bold}Protokol  :${c.reset} ${c.green}100% SOCKS5 Murni${c.reset}`);
  console.log(`${c.cyan}------------------------------------------------------------------------${c.reset}`);
  console.log(` ${c.gray}Keterangan Status:${c.reset}`);
  console.log(`  ${c.badgeSuccess} ${c.green}Klaim Airdrop Berhasil & Tx Hash Tercatat${c.reset}`);
  console.log(`  ${c.badgeCooldown} ${c.yellow}Wallet Sedang Dalam Waktu Tunggu / Limit Faucet${c.reset}`);
  console.log(`  ${c.badgeFailed} ${c.red}Proxy Mati / Timeout / Gagal Koneksi${c.reset}`);
  console.log(`  ${c.badgeScraper} ${c.cyan}Status Pengambilan Proxy SOCKS5 Terbaru${c.reset}`);
  console.log(`  ${c.badgeBatch} ${c.magenta}Ringkasan Hasil Perputaran Tiap Batch${c.reset}`);
  console.log(`${c.cyan}========================================================================${c.reset}\n`);

  await Promise.all(PROVIDERS.map((provider) => runProviderWorker(provider)));
}

main().catch((err) => {
  console.error(`${c.red}[FATAL ERROR]:${c.reset}`, err);
});