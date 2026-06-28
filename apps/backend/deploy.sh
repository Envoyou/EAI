#!/bin/bash
echo "=== Memulai Pembaruan EAI Backend (Monorepo) ==="

# Masuk ke direktori utama monorepo
cd /var/www/eai-backend/current || { echo "Direktori /var/www/eai-backend/current tidak ditemukan!"; exit 1; }

# Tarik perubahan kode terbaru dari repositori Git
git pull origin main

# Instalasi dependensi npm (root monorepo)
npm install

# Masuk ke direktori backend untuk Prisma
cd apps/backend
npx prisma generate
npx prisma migrate deploy
cd ../..

# Build backend (kompilasi TS ke JS) menggunakan Turbo
npx turbo run build --filter=backend

# Reload service via PM2 dengan file konfigurasi ekosistem yang ada di apps/backend
cd apps/backend
pm2 startOrReload ecosystem.config.cjs --update-env

# Simpan status PM2 saat ini agar persisten saat VPS reboot
pm2 save

echo "=== Pembaruan Selesai! ==="
