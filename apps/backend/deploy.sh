#!/bin/bash
echo "=== Memulai Pembaruan EAI Backend ==="

# Masuk ke direktori aplikasi
cd /var/www/eai-backend/current || { echo "Direktori /var/www/eai-backend/current tidak ditemukan!"; exit 1; }

# Tarik perubahan kode terbaru dari repositori Git
git pull origin main

# Instalasi dependensi npm
npm install

# Generate Client Prisma
npx prisma generate

# Kompilasi kode TypeScript ke Javascript
npm run build

# Reload service via PM2 dengan file konfigurasi ekosistem
pm2 startOrReload ecosystem.config.cjs --update-env

# Simpan status PM2 saat ini agar persisten saat VPS reboot
pm2 save

echo "=== Pembaruan Selesai! ==="
