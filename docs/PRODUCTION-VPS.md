# DOKUMENTASI PRODUKSI VPS: EAI BACKEND (DIGITAL OCEAN FRESH SETUP)

Dokumen ini mendokumentasikan langkah demi langkah untuk melakukan setup awal dari nol (*fresh install*) dan deployment **EAI Backend (`eai-backend`)** pada VPS Digital Ocean (Ubuntu 22.04 LTS / 24.04 LTS) untuk melayani domain **`api-eai.envoyou.com`** pada port **`5001`**.

---

## 1. Informasi Dasar

* **IP VPS Publik:** `[152.42.252.244]`
* **User Pengelola:** `husnikusuma` (atau `root` jika baru di-provisioning)
* **Domain API EAI:** `api-eai.envoyou.com`
* **Target Port:** `5001`

---

## 2. Struktur Direktori

* **Direktori Aplikasi:** `/var/www/eai-backend/current/`
* **Environment Source:** `/var/www/eai-backend/shared/.env.production`
* **Symlink env:** `/var/www/eai-backend/current/.env`
* **Direktori Log:** `/var/log/eai-backend/`
* **Nginx Source Config:** `/etc/nginx/sites-available/api-eai.envoyou.com`
* **Nginx Active Config:** `/etc/nginx/sites-enabled/api-eai.envoyou.com`

---

## 3. Persiapan & Instalasi Software (Fresh VPS)

Hubungkan ke droplet Digital Ocean Anda menggunakan SSH, lalu jalankan perintah berikut untuk menginstal seluruh dependensi dasar:

### A. Update System & Install Node.js LTS (v20)
```bash
# Update package lists
sudo apt update && sudo apt upgrade -y

# Install tools dasar, Git, & Nginx
sudo apt install git nginx curl software-properties-common -y

# Download dan pasang repository NodeSource untuk Node.js v20
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs

# Verifikasi instalasi Node & NPM
node -v
npm -v
```

### B. Install PM2 (Process Manager) secara Global
```bash
sudo npm install -g pm2
```

### C. Konfigurasi Firewall (UFW)
Di Digital Ocean, penting untuk memastikan firewall memperbolehkan lalu lintas HTTP, HTTPS, dan SSH:
```bash
# Izinkan akses SSH agar tidak terkunci
sudo ufw allow OpenSSH

# Izinkan lalu lintas HTTP (80) & HTTPS (443) untuk Nginx
sudo ufw allow 'Nginx Full'

# Aktifkan firewall
sudo ufw enable
```
*(Ketik `y` lalu tekan Enter saat diminta konfirmasi).*

### D. Tambahkan Swap Space (Sangat Penting untuk VPS 1GB RAM)
Droplet fresh dari Digital Ocean biasanya tidak memiliki swap space secara bawaan. Hal ini sering menyebabkan proses build TypeScript (`tsc`) mengalami error *Out of Memory* karena memori fisik habis saat kompilasi.

Jalankan perintah berikut untuk mengaktifkan Swap Space sebesar 2GB:
```bash
# Buat berkas swap berukuran 2GB
sudo fallocate -l 2G /swapfile

# Set hak akses yang aman
sudo chmod 600 /swapfile

# Format file menjadi swap space
sudo mkswap /swapfile

# Aktifkan swap space
sudo swapon /swapfile

# Buat permanen agar tetap aktif saat VPS di-reboot
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab

# Verifikasi swap space aktif
free -h
```

---

## 4. Setup Folder Project & Environment

### A. Buat Direktori Aplikasi & Log
```bash
# Buat folder aplikasi
sudo mkdir -p /var/www/eai-backend/current
sudo mkdir -p /var/www/eai-backend/shared
sudo mkdir -p /var/log/eai-backend

# Berikan hak milik ke user pengelola (ganti 'husnikusuma' dengan username aktif Anda)
sudo chown -R $USER:$USER /var/www/eai-backend
sudo chown -R $USER:$USER /var/log/eai-backend
```

### B. Clone Project Backend
```bash
cd /var/www/eai-backend/current
# Clone dengan SSH
git clone git@github.com:Envoyou/EAI.git .
```

### C. Konfigurasi Environment Produksi (`.env.production`)
Buat berkas `.env.production` di folder shared:
```bash
nano /var/www/eai-backend/shared/.env.production
```

> [!IMPORTANT]
> Masukkan seluruh variabel produksi yang diperlukan ke dalam berkas `/var/www/eai-backend/shared/.env.production`:
> ```env
> PORT=5001
> NODE_ENV=production
> 
> # Neon Database Connection
> DATABASE_URL="postgresql://neondb_owner:[PASSWORD]@ep-fancy-dawn-ao5m7pnn-pooler.c-2.ap-southeast-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require"
> DIRECT_URL="postgresql://neondb_owner:[PASSWORD]@ep-fancy-dawn-ao5m7pnn.c-2.ap-southeast-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require"
> 
> # Clerk Credentials (Production)
> CLERK_SECRET_KEY=sk_live_...
> CLERK_WEBHOOK_SECRET=whsec_...
> 
> # Gemini API Key
> ACTIVE_AI_PROVIDER="gemini"
> GEMINI_API_KEY="AIzaSy..."
> 
> # Doku / Midtrans Checkout Credentials (Production)
> PAYMENT_PROVIDER="doku"
> DOKU_CLIENT_ID="BRN-..."
> DOKU_SECRET_KEY="SK-..."
> DOKU_IS_PRODUCTION="true"
> ```

### D. Buat Symlink Environment
```bash
ln -s /var/www/eai-backend/shared/.env.production /var/www/eai-backend/current/apps/backend/.env
```

---

## 5. Build & Inisialisasi Database

Jalankan instalasi dependensi, sinkronisasi skema database, dan lakukan kompilasi file TypeScript:
```bash
cd /var/www/eai-backend/current

# Install dependencies (di root direktori monorepo)
npm install

# Masuk ke folder backend untuk generate Prisma Client
cd apps/backend
npx prisma generate
cd ../..

# Compile TypeScript ke Javascript menggunakan Turbo
# (Gunakan limit memori tsc jika VPS berkapasitas RAM 1GB / kecil)
NODE_OPTIONS="--max-old-space-size=1536" npx turbo run build --filter=backend
```

> [!NOTE]
> Proses build akan menjalankan `tsc` dan dilanjutkan oleh `tsc-alias` untuk mengubah otomatis path alias (seperti `@/middleware/auth`) menjadi relative path agar bisa dibaca langsung oleh Node.js tanpa error runtime `MODULE_NOT_FOUND`.

---

## 6. Jalankan Aplikasi dengan PM2 (Ecosystem)

Kami menggunakan file `ecosystem.config.cjs` untuk memastikan kestabilan running, handling logging, dan auto-restart.

```bash
cd /var/www/eai-backend/current/apps/backend

# Jalankan backend dengan PM2 config
pm2 startOrReload ecosystem.config.cjs --update-env

# Konfigurasikan PM2 agar otomatis berjalan saat VPS dinyalakan kembali (startup)
pm2 startup
# (Salin dan jalankan perintah 'sudo env PATH...' yang muncul di terminal Anda)

# Simpan konfigurasi PM2 yang sedang berjalan
pm2 save
```

Perintah operasional yang berguna:
```bash
pm2 status
pm2 logs eai-backend
pm2 restart eai-backend
```

---

## 7. Nginx dan Cloudflare Integration

Untuk keamanan optimal dan stabilitas API:
* **DNS:** Record `api-eai.envoyou.com` harus set ke **Proxied (orange cloud ON)** di dashboard Cloudflare.
* **SSL/TLS Mode (Cloudflare):** Harus diset ke **Full (strict)**.
* **Cache Rules (Cloudflare):** Buat rule bypass cache untuk `api-eai.envoyou.com/api/*` agar request dinamis tidak ter-cache.

### A. Snippet Real IP dari Cloudflare (Jika Belum Ada)
Simpan file ini untuk menerjemahkan IP Cloudflare menjadi IP client asli:
```bash
sudo nano /etc/nginx/snippets/cloudflare-realip.conf
```
Tempelkan konfigurasi berikut:
```nginx
real_ip_header CF-Connecting-IP;
real_ip_recursive on;

set_real_ip_from 103.21.244.0/22;
set_real_ip_from 103.22.200.0/22;
set_real_ip_from 103.31.4.0/22;
set_real_ip_from 104.16.0.0/13;
set_real_ip_from 104.24.0.0/14;
set_real_ip_from 108.162.192.0/18;
set_real_ip_from 131.0.72.0/22;
set_real_ip_from 141.101.64.0/18;
set_real_ip_from 162.158.0.0/15;
set_real_ip_from 172.64.0.0/13;
set_real_ip_from 173.245.48.0/20;
set_real_ip_from 188.114.96.0/20;
set_real_ip_from 190.93.240.0/20;
set_real_ip_from 197.234.240.0/22;
set_real_ip_from 198.41.128.0/17;

set_real_ip_from 2400:cb00::/32;
set_real_ip_from 2606:4700::/32;
set_real_ip_from 2803:f800::/32;
set_real_ip_from 2405:b500::/32;
set_real_ip_from 2405:8100::/32;
set_real_ip_from 2a06:98c0::/29;
set_real_ip_from 2c0f:f248::/32;
```

### B. Cloudflare-Only Origin Guard (Jika Belum Ada)
Untuk memblokir request langsung ke IP publik VPS tanpa melalui Cloudflare:
```bash
sudo nano /etc/nginx/conf.d/01-cloudflare-origin-guard.conf
```
Tempelkan konfigurasi berikut:
```nginx
geo $realip_remote_addr $from_cloudflare {
    default 0;

    103.21.244.0/22 1;
    103.22.200.0/22 1;
    103.31.4.0/22 1;
    104.16.0.0/13 1;
    104.24.0.0/14 1;
    108.162.192.0/18 1;
    131.0.72.0/22 1;
    141.101.64.0/18 1;
    162.158.0.0/15 1;
    172.64.0.0/13 1;
    173.245.48.0/20 1;
    188.114.96.0/20 1;
    190.93.240.0/20 1;
    197.234.240.0/22 1;
    198.41.128.0/17 1;

    2400:cb00::/32 1;
    2606:4700::/32 1;
    2803:f800::/32 1;
    2405:b500::/32 1;
    2405:8100::/32 1;
    2a06:98c0::/29 1;
    2c0f:f248::/32 1;
}
```

### C. Nginx Server Block Konfigurasi
Buat berkas konfigurasi baru untuk `api-eai.envoyou.com`:
```bash
sudo nano /etc/nginx/sites-available/api-eai.envoyou.com
```

Tempelkan konfigurasi berikut (sudah dioptimalkan untuk SSE draft stream, port `5001`, dan Origin Guard):
```nginx
server {
    listen 80;
    server_name api-eai.envoyou.com;

    # Filter untuk memastikan request hanya masuk dari Cloudflare Proxy
    include /etc/nginx/snippets/cloudflare-realip.conf;
    if ($from_cloudflare = 0) {
        return 403;
    }

    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header X-Forwarded-Host $host;

    proxy_read_timeout 60s;
    proxy_connect_timeout 60s;
    proxy_send_timeout 60s;

    # General API & Webhooks Routing
    location / {
        proxy_pass http://127.0.0.1:5001;
    }

    # Optimasi Khusus untuk SSE / NDJSON (Streaming API draft)
    location /api/draft {
        proxy_pass http://127.0.0.1:5001;
        proxy_set_header Connection '';
        
        # Nonaktifkan buffering Nginx agar stream langsung terkirim secara real-time
        proxy_buffering off;
        proxy_cache off;
        chunked_transfer_encoding on;
        proxy_read_timeout 300s;
        proxy_send_timeout 300s;
    }
}
```

### D. Aktifkan Site & Restart Nginx
```bash
# Buat symlink untuk mengaktifkan config
sudo ln -s /etc/nginx/sites-available/api-eai.envoyou.com /etc/nginx/sites-enabled/

# Test syntax konfigurasi
sudo nginx -t

# Restart layanan Nginx
sudo systemctl restart nginx
```

---

## 8. Pasang SSL Certificate (HTTPS)

Gunakan Certbot untuk menerbitkan sertifikat SSL gratis dari Let's Encrypt:
```bash
# Install Certbot & Nginx plugin
sudo apt install certbot python3-certbot-nginx -y

# Terbitkan SSL untuk domain api-eai.envoyou.com
sudo certbot --nginx -d api-eai.envoyou.com
```
*Ikuti petunjuk di layar, Certbot akan otomatis mengubah konfigurasi Nginx agar melayani trafik HTTPS secara aman.*

---

## 9. Skrip Deploy Sekali Klik

Setiap kali Anda push update terbaru ke branch `main` repositori `EAI` di GitHub, Anda hanya perlu menjalankan:
```bash
cd /var/www/eai-backend/current
./apps/backend/deploy.sh
```

---

## 10. Health Check & Troubleshooting

Jalankan perintah ini di VPS untuk memverifikasi fungsionalitas:
```bash
# Cek status proses Node.js
pm2 status

# Cek logs real-time
pm2 logs eai-backend

# Test API lokal via VPS
curl -I http://127.0.0.1:5001/api/health

# Test API publik via internet
curl -I https://api-eai.envoyou.com/api/health

# Bypass Cloudflare (direct ke IP origin VPS) harus terblokir dengan kode 403
curl -kI https://[IP_VPS_DIGITAL_OCEAN_ANDA]/api/health -H "Host: api-eai.envoyou.com"
```
