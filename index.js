const fs = require('fs');
const path = require('path');
const axios = require('axios');
const cheerio = require('cheerio');
const { SocksProxyAgent } = require('socks-proxy-agent');

// Global Error Handler untuk mencegah crash akibat socket rusak dari free proxy
process.on('uncaughtException', () => {});
process.on('unhandledRejection', () => {});

// ==========================================
// WARNA & BADGE KONTRASTING (ANSI MONOSPACE)
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

  badgeSuccess:  '\x1b[1m\x1b[92m[ SUCCESS  ]\x1b[0m',
  badgeCooldown: '\x1b[1m\x1b[93m[ COOLDOWN ]\x1b[0m',
  badgeFailed:   '\x1b[1m\x1b[90m[  FAILED  ]\x1b[0m',
  badgeScraper:  '\x1b[1m\x1b[96m[ SCRAPER  ]\x1b[0m',
  badgeBatch:    '\x1b[1m\x1b[95m[  BATCH   ]\x1b[0m'
};

const WIDTH = 64;
const INNER_WIDTH = WIDTH - 4;
const hr = (char = '─', color = c.cyan) => color + char.repeat(WIDTH) + c.reset;
const getTime = () => c.gray + '[' + new Date().toLocaleTimeString() + ']' + c.reset;

const padLine = (content) => {
  const visibleLen = content.replace(/\u001b\[[0-9;]*m/g, '').length;
  const padding = Math.max(0, INNER_WIDTH - visibleLen);
  return ' ' + content + ' '.repeat(padding) + ' ';
};

const centerLine = (content) => {
  const visibleLen = content.replace(/\u001b\[[0-9;]*m/g, '').length;
  const totalPad = Math.max(0, INNER_WIDTH - visibleLen);
  const leftPad = Math.floor(totalPad / 2);
  const rightPad = totalPad - leftPad;
  return ' ' + ' '.repeat(leftPad) + content + ' '.repeat(rightPad) + ' ';
};

// Format pesan error menjadi singkat
function cleanErrorMessage(error) {
  if (!error) return 'Unknown error';
  const str = error.response ? JSON.stringify(error.response.data) : (error.message || String(error));
  if (str.includes('Rate limit')) return 'Faucet Rate Limit';
  if (str.includes('timed out') || str.includes('timeout')) return 'Proxy Timeout (Lelet/Mati)';
  if (str.includes('Socket closed')) return 'Socket Closed';
  if (str.includes('certificate')) return 'Cert Expired';
  if (str.includes('ECONNRESET')) return 'Connection Reset';
  if (str.includes('ECONNREFUSED')) return 'Connection Refused';
  if (str.includes('handshake')) return 'Handshake Failed';
  if (str.length > 25) return str.slice(0, 22) + '...';
  return str;
}

// ==========================================
// 1. MEMBACA WALLET DARI wallet.txt
// ==========================================
function loadWallets() {
  const walletFile = path.join(__dirname, 'wallet.txt');
  if (!fs.existsSync(walletFile)) {
    console.error(c.red + '[ERROR] File wallet.txt tidak ditemukan!' + c.reset);
    process.exit(1);
  }

  const rawData = fs.readFileSync(walletFile, 'utf-8');
  const list = rawData
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith('#') && !line.startsWith('//'));

  if (list.length === 0) {
    console.error(c.red + '[ERROR] wallet.txt masih kosong! Masukkan minimal 1 alamat wallet.' + c.reset);
    process.exit(1);
  }

  return list;
}

const wallets = loadWallets();
const ENDPOINT = 'https://testnet.rialo.io/';
const REQUEST_TIMEOUT = 5000;
const HARD_TIMEOUT_GUARD = 7000;
const DELAY_BETWEEN_WALLETS = 2000; // jeda santai 2 detik per wallet
const DELAY_BETWEEN_ROUNDS = 5000;   // jeda 5 detik antar ronde
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Statistik Global
const stats = {
  totalSuccess: 0,
  totalCooldown: 0,
  totalFailed: 0,
  totalBatches: 0
};

// Helper: Normalisasi SOCKS5
function formatSocks5Url(ipOrUrl, port) {
  let raw = port ? ipOrUrl + ':' + port : ipOrUrl;
  if (!raw) return null;
  let str = String(raw).trim();

  if (str.startsWith('socks4://') || str.startsWith('http://') || str.startsWith('https://')) {
    return null;
  }
  if (str.startsWith('socks5://')) {
    str = str.replace('socks5://', '');
  }
  const match = str.match(/^([0-9.]+):([0-9]+)/);
  if (!match) return null;
  return 'socks5://' + match[1] + ':' + match[2];
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
// 2. DAFTAR 12 ENDPOINT PROVIDER SOCKS5
// ==========================================
const PROVIDERS = [
  {
    id: 'monosans',
    name: 'Monosans',
    fetchProxies: () => fetchPlainText('https://raw.githubusercontent.com/monosans/proxy-list/main/proxies/socks5.txt')
  },
  {
    id: 'proxyscrape',
    name: 'ProxyScrape',
    fetchProxies: () => fetchPlainText('https://api.proxyscrape.com/v4/free-proxy-list/get?request=display_proxies&proxy_format=protocolipport&format=text&protocol=socks5')
  },
  {
    id: 'proxifly',
    name: 'Proxifly',
    fetchProxies: async () => {
      try {
        const { data } = await axios.get('https://cdn.jsdelivr.net/gh/proxifly/free-proxy-list@main/proxies/protocols/socks5/data.json', { timeout: 10000 });
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
  {
    id: 'geonode',
    name: 'Geonode',
    fetchProxies: async () => {
      try {
        const { data } = await axios.get('https://proxylist.geonode.com/api/proxy-list?protocols=socks5&page=1&limit=200&sort_by=responseTime&sort_type=asc', { timeout: 10000 });
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
  {
    id: 'thespeedx',
    name: 'TheSpeedX',
    fetchProxies: () => fetchPlainText('https://raw.githubusercontent.com/TheSpeedX/SOCKS-List/master/socks5.txt')
  },
  {
    id: 'komutan234',
    name: 'Komutan234',
    fetchProxies: () => fetchPlainText('https://raw.githubusercontent.com/komutan234/Proxy-List-Free/main/proxies/socks5.txt')
  },
  {
    id: 'proxygather',
    name: 'ProxyGather',
    fetchProxies: () => fetchPlainText('https://raw.githubusercontent.com/Skillter/ProxyGather/refs/heads/master/proxies/working-proxies-socks5.txt')
  },
  {
    id: 'proxygenerator',
    name: 'ProxyGen',
    fetchProxies: () => fetchPlainText('https://raw.githubusercontent.com/proxygenerator1/ProxyGenerator/main/Stable/socks5.txt')
  },
  {
    id: 'zloiuser',
    name: 'ZloiUser',
    fetchProxies: () => fetchPlainText('https://raw.githubusercontent.com/Zloi-user/hideip.me/main/socks5.txt')
  },
  {
    id: 'ercindedeoglu',
    name: 'ErcinDede',
    fetchProxies: () => fetchPlainText('https://raw.githubusercontent.com/ErcinDedeoglu/proxies/main/proxies/socks5.txt')
  },
  {
    id: 'freeproxylist',
    name: 'FreeProxyList',
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
  {
    id: 'nodemaven',
    name: 'NodeMaven',
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
// 3. FUNGSI CLAIM FAUCET (MENGEMBALIKAN RESULT)
// ==========================================
function safeClaimFaucet(pubkey, proxyUrl) {
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      resolve({ status: 'failed', reason: 'Proxy Timeout (7s)' });
    }, HARD_TIMEOUT_GUARD);

    let agent;
    try {
      agent = new SocksProxyAgent(proxyUrl, { timeout: REQUEST_TIMEOUT });
    } catch (err) {
      clearTimeout(timer);
      return resolve({ status: 'failed', reason: 'Invalid Proxy' });
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
        const txHash = String(response.data.result);
        const shortTx = txHash.length > 22 ? txHash.slice(0, 10) + '...' + txHash.slice(-8) : txHash;
        resolve({ status: 'success', txHash, shortTx });
      } else if (response.data && response.data.error) {
        const msg = response.data.error.message || '';
        if (msg.toLowerCase().includes('rate limit')) {
          resolve({ status: 'cooldown', reason: 'Rate Limit' });
        } else {
          resolve({ status: 'failed', reason: msg || 'RPC Error' });
        }
      } else {
        resolve({ status: 'failed', reason: 'Empty Response' });
      }
    })
    .catch((error) => {
      const errStr = error.response ? JSON.stringify(error.response.data) : (error.message || '');
      if (errStr.toLowerCase().includes('rate limit')) {
        resolve({ status: 'cooldown', reason: 'Rate Limit' });
      } else {
        resolve({ status: 'failed', reason: cleanErrorMessage(error) });
      }
    })
    .finally(() => {
      clearTimeout(timer);
    });
  });
}

// ==========================================
// 4. MAIN RUNNER (ALUR ROTASI TERATUR & TENANG)
// ==========================================
async function main() {
  console.clear();

  // Box Header Presisi
  console.log('\n' + c.cyan + '╔' + '═'.repeat(WIDTH - 2) + '╗' + c.reset);
  console.log(c.cyan + '║' + centerLine(c.bold + c.cyan + 'RIALO FAUCET AUTO CLAIM BOT' + c.reset) + c.cyan + '║' + c.reset);
  console.log(c.cyan + '║' + centerLine(c.gray + 'Multi-Wallet Auto Claim with SOCKS5 Proxy' + c.reset) + c.cyan + '║' + c.reset);
  console.log(c.cyan + '╠' + '═'.repeat(WIDTH - 2) + '╣' + c.reset);
  console.log(c.cyan + '║' + padLine(c.white + 'Network : ' + c.yellow + 'Rialo Testnet' + c.gray + ' (Chain ID: 5042)' + c.reset) + c.cyan + '║' + c.reset);
  console.log(c.cyan + '║' + padLine(c.white + 'Wallets : ' + c.green + c.bold + wallets.length + ' Wallet' + c.reset + c.gray + ' terdaftar di wallet.txt' + c.reset) + c.cyan + '║' + c.reset);
  console.log(c.cyan + '║' + padLine(c.white + 'Mode    : ' + c.green + c.bold + 'Konkuren (Paralel)' + c.reset + c.gray + ' - Semua wallet jalan serentak' + c.reset) + c.cyan + '║' + c.reset);
  console.log(c.cyan + '║' + padLine(c.white + 'Sumber  : ' + c.magenta + PROVIDERS.length + ' Provider SOCKS5' + c.reset + c.gray + ' (Rotasi per ronde)' + c.reset) + c.cyan + '║' + c.reset);
  console.log(c.cyan + '╚' + '═'.repeat(WIDTH - 2) + '╝' + c.reset);

  let round = 1;
  let providerIndex = 0;

  while (true) {
    const provider = PROVIDERS[providerIndex];
    providerIndex = (providerIndex + 1) % PROVIDERS.length;

    const roundTag = '─ [ RONDE #' + round + ' • ' + provider.name + ' ] ';
    const roundTop = c.cyan + roundTag + '─'.repeat(Math.max(0, WIDTH - roundTag.length)) + c.reset;

    console.log('\n' + roundTop);
    console.log(getTime() + ' ' + c.badgeScraper + ' ' + c.white + 'Mengambil proxy dari ' + c.bold + provider.name + c.reset + '...');

    const proxies = await provider.fetchProxies();

    if (!proxies || proxies.length === 0) {
      console.log(c.gray + '  └─ Gagal fetch proxy. Lanjut ke provider berikutnya...' + c.reset);
      await sleep(2000);
      continue;
    }

    console.log(c.gray + '  ├─ Ditemukan : ' + c.green + proxies.length.toLocaleString() + ' proxy SOCKS5' + c.reset);
    console.log(c.gray + '  └─ Status    : ' + c.cyan + 'Memproses ' + c.bold + wallets.length + ' wallet' + c.reset + c.cyan + ' secara ' + c.green + c.bold + 'KONKUREN (Paralel)' + c.reset + c.cyan + '...' + c.reset + '\n');

    let roundSuccess = 0;
    let roundCooldown = 0;
    let roundFailed = 0;

    // Eksekusi semua wallet secara serentak (konkuren)
    const tasks = wallets.map(async (pubkey, index) => {
      const shortWallet = pubkey.slice(0, 6) + '...' + pubkey.slice(-4);
      const walletBadge = c.blue + '[W-' + String(index + 1).padStart(2, '0') + ']' + c.reset + ' ' + c.white + shortWallet + c.reset;

      // Coba dengan proxy acak, toleransi 1x retry diam-diam jika proxy pertama mati
      let res = { status: 'failed', reason: 'Proxy Timeout' };
      for (let attempt = 1; attempt <= 2; attempt++) {
        const randomProxy = proxies[Math.floor(Math.random() * proxies.length)];
        res = await safeClaimFaucet(pubkey, randomProxy);
        if (res.status === 'success' || res.status === 'cooldown') break;
      }

      if (res.status === 'success') {
        roundSuccess++;
        stats.totalSuccess++;
        console.log(
          '  ' + c.badgeSuccess + ' ' + walletBadge + ' ' +
          c.green + c.bold + 'Tx: ' + res.shortTx + c.reset + ' ' +
          c.yellow + '(Total Sukses: ' + stats.totalSuccess + ')' + c.reset
        );
      } else if (res.status === 'cooldown') {
        roundCooldown++;
        stats.totalCooldown++;
        console.log(
          '  ' + c.badgeCooldown + ' ' + walletBadge + ' ' +
          c.yellow + 'Faucet Rate Limit / Cooldown' + c.reset
        );
      } else {
        roundFailed++;
        stats.totalFailed++;
        console.log(
          '  ' + c.badgeFailed + ' ' + walletBadge + ' ' +
          c.gray + (res.reason || 'Proxy Timeout / Gagal Koneksi') + c.reset
        );
      }

      return res;
    });

    await Promise.all(tasks);

    stats.totalBatches++;

    // Ringkasan Ronde
    console.log('\n' + hr('─', c.gray));
    const sStr = roundSuccess > 0 ? c.green + roundSuccess + ' Sukses' + c.reset : c.gray + '0 Sukses' + c.reset;
    const cStr = roundCooldown > 0 ? c.yellow + roundCooldown + ' Cooldown' + c.reset : c.gray + '0 Cooldown' + c.reset;
    const fStr = c.gray + roundFailed + ' Gagal' + c.reset;

    console.log(
      getTime() + ' ' + c.badgeBatch + ' ' + c.bold + 'Ronde #' + round + ' Selesai:' + c.reset + ' ' +
      sStr + ' | ' + cStr + ' | ' + fStr + ' ' +
      c.gray + '(Total Sukses Akumulasi: ' + stats.totalSuccess + ')' + c.reset
    );
    console.log(hr('─', c.gray));

    // Jeda 5 detik sebelum ronde berikutnya
    console.log(c.gray + 'Jeda 5s sebelum ronde berikutnya...' + c.reset);
    await sleep(DELAY_BETWEEN_ROUNDS);
    round++;
  }
}

main().catch((err) => {
  console.error(c.red + '[FATAL ERROR]:' + c.reset, err);
});
