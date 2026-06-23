# Midtrans production checklist

Midtrans adalah payment provider utama EAI. Aktifkan dengan `PAYMENT_PROVIDER=midtrans`. Implementasi memakai Midtrans Snap Redirect untuk pembayaran prepaid.
Paket bulanan dan tahunan perlu dibayar ulang secara manual ketika periodenya
berakhir. Ini belum menggunakan recurring auto-charge.

## 1. Uji Sandbox

Tambahkan environment berikut pada local atau Vercel Preview:

```env
MIDTRANS_SERVER_KEY=SB-Mid-server-...
MIDTRANS_IS_PRODUCTION=false
MIDTRANS_ENABLE_SIMULATOR=false
PAYMENT_PROVIDER=midtrans
```

Gunakan Server Key Sandbox dari Midtrans MAP. Jangan memakai Client Key untuk
API backend.

Jalankan migrasi database:

```bash
npx prisma migrate deploy
```

Di Midtrans MAP Sandbox, buka `Settings > Configuration` dan atur:

```text
Payment Notification URL:
https://<preview-domain>/api/webhooks/payment

Finish Redirect URL:
https://<preview-domain>/pricing

Unfinish Redirect URL:
https://<preview-domain>/pricing

Error Redirect URL:
https://<preview-domain>/pricing
```

Lakukan pembayaran test untuk QRIS, virtual account, dan kartu. Pastikan:

- transaksi muncul di tabel `PaymentOrder`;
- status berubah menjadi `paid`;
- kredit hanya masuk satu kali walaupun notification dikirim ulang;
- nominal dan plan sesuai order;
- member non-admin tidak dapat membeli plan organisasi.

## 2. Aktifkan Midtrans Production

Pastikan akun Production dan payment channel sudah aktif. Sandbox Key dan
Production Key berbeda.

Tambahkan environment berikut hanya pada Vercel Production:

```env
MIDTRANS_SERVER_KEY=Mid-server-...
MIDTRANS_IS_PRODUCTION=true
MIDTRANS_ENABLE_SIMULATOR=false
PAYMENT_PROVIDER=midtrans
```

Jangan menambahkan `MIDTRANS_SIMULATOR_SECRET` ke Production.

Di Midtrans MAP, pindah ke environment Production lalu atur:

```text
Payment Notification URL:
https://eai.envoyou.com/api/webhooks/payment

Finish Redirect URL:
https://eai.envoyou.com/pricing

Unfinish Redirect URL:
https://eai.envoyou.com/pricing

Error Redirect URL:
https://eai.envoyou.com/pricing
```

Semua URL harus memakai HTTPS dan endpoint webhook harus dapat diakses publik.

## 3. Deploy

Sebelum deploy:

```bash
npx prisma migrate deploy
npm run lint
npx tsc --noEmit
npm run build
```

Setelah deploy, lakukan satu transaksi nominal kecil menggunakan akun nyata.
Periksa Midtrans MAP, log Vercel, `PaymentOrder`, `Subscription`, dan
`CreditTransaction`.

## 4. Recurring Billing

Snap Redirect biasa tidak otomatis menagih pelanggan pada periode berikutnya.
Recurring Midtrans membutuhkan aktivasi tambahan dari Midtrans/bank dan charge
berikutnya dilakukan melalui Core API. Sebelum mengiklankan "auto-renew",
tambahkan:

- persetujuan recurring dari Midtrans;
- penyimpanan token recurring yang terenkripsi;
- scheduler penagihan;
- retry/dunning untuk pembayaran gagal;
- cancel, refund, chargeback, dan proration;
- webhook untuk recurring charge.
