#!/bin/bash
set -e

echo "=== Memulai Pembaruan EAI Backend (Monorepo) ==="

# Atur batasan heap memory Node.js agar tidak crash (OOM) di VPS RAM rendah
export NODE_OPTIONS="--max-old-space-size=1024"

# Masuk ke direktori utama monorepo
cd /var/www/eai-backend/current || { echo "Direktori /var/www/eai-backend/current tidak ditemukan!"; exit 1; }

# Pre-check disk space: Dibutuhkan minimal 2 GB (2097152 KB) ruang kosong pada partisi tempat projek berada
available_kb=$(df -Pk . | awk 'NR==2 {print $4}')
if [ "$available_kb" -lt 2097152 ]; then
  available_gb=$((available_kb / 1024 / 1024))
  available_mb=$((available_kb / 1024))
  echo "========================================================="
  echo "ERROR: Ruang kosong penyimpanan (disk space) kurang dari 2 GB!"
  echo "Tersedia: ${available_gb} GB (${available_mb} MB)"
  echo "Silakan bersihkan cache atau log terlebih dahulu sebelum deploy."
  echo "========================================================="
  exit 1
fi

# Tarik perubahan kode terbaru dari repositori Git
git pull origin main

# Instalasi dependensi npm (root monorepo) secara bersih dan terkunci
npm ci

# Masuk ke direktori backend untuk Prisma
cd apps/backend
npx prisma generate
cd ../..

# Build backend (kompilasi TS ke JS) menggunakan Turbo
npx turbo run build --filter=backend

# Reload service via PM2 dengan file konfigurasi ekosistem yang ada di apps/backend
cd apps/backend
pm2 startOrReload ecosystem.config.cjs --update-env

# Simpan status PM2 saat ini agar persisten saat VPS reboot
pm2 save

echo "=== Pembaruan Selesai! ==="
