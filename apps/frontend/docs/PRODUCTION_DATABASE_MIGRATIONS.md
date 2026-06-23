# Production Database Migrations

Dokumen ini mencatat migrasi Prisma yang sudah diterapkan pada database staging
tetapi belum diterapkan pada database production. Perbarui daftar ini setiap
kali staging memiliki perubahan schema yang belum ikut dirilis.

## Pending untuk production

Per 15 Juni 2026:

Tidak ada migrasi yang masih pending untuk production.

## Terakhir diterapkan ke production

Pada 15 Juni 2026, migrasi berikut diterapkan ke production:

| Migrasi | Production |
|---|---|
| `20260614050000_add_manual_credit_audit` | Applied |
| `20260614060000_add_support_ticket_audit` | Applied |
| `20260615000000_scope_onboarding_drafts_to_organization` | Applied |
| `20260615010000_track_organization_creator` | Applied |

Verifikasi `npx prisma migrate status` setelah deployment menunjukkan database
schema sudah up to date.

## Urutan deployment production

Jangan deploy kode aplikasi yang memakai field baru sebelum migrasi production
selesai.

```bash
npx prisma migrate status
npx prisma migrate deploy
npx prisma migrate status
```

Gunakan `DIRECT_URL` production untuk Prisma CLI. `DATABASE_URL` tetap memakai
pooler Neon untuk runtime aplikasi.

Setelah deploy, verifikasi schema:

```sql
SELECT column_name
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'OnboardingDraft'
  AND column_name = 'organizationId';

SELECT column_name
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'Organization'
  AND column_name = 'createdByUserId';
```

Verifikasi indeks:

```sql
SELECT indexname
FROM pg_indexes
WHERE schemaname = 'public'
  AND indexname IN (
    'OnboardingDraft_organizationId_idx',
    'Organization_createdByUserId_idx'
  );
```

## Pemeriksaan setelah deploy

1. Login menggunakan user baru.
2. Buat atau pilih Clerk Organization.
3. Pastikan onboarding tidak menawarkan pembuatan workspace lokal.
4. Selesaikan onboarding atau pilih **Use defaults**.
5. Pastikan workspace creator menerima 10 kredit.
6. Refresh halaman dan pastikan kredit tidak bertambah lagi.
7. Undang member lain dan pastikan member tersebut tidak menambah trial ke
   organisasi.

## Catatan riwayat Prisma

Jika `prisma migrate status` gagal karena migration history lama, jangan
menjalankan `db push` atau mengedit tabel `_prisma_migrations` secara langsung
tanpa audit. Bandingkan migration history production dengan folder
`prisma/migrations`, periksa migration yang gagal atau di-roll back, lalu
selesaikan statusnya secara eksplisit sebelum menjalankan `migrate deploy`.
