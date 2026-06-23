# EAI Backend (Express.js & TypeScript)

This is the decoupled backend service for **EAI (Editorial Intelligence)**. It is built using **Express.js**, **TypeScript**, and **Prisma** to manage database operations, AI processing, payments, onboarding workflows, and analytics telemetry.

---

## Technical Stack
*   **Framework**: Express.js
*   **Language**: TypeScript
*   **Database ORM**: Prisma + Neon PostgreSQL Serverless
*   **AI SDKs**: `@google/genai` (Gemini 3.5), `groq-sdk`
*   **Authentication**: Clerk (`@clerk/backend` token verification)
*   **Billing/Checkout**: Doku & Midtrans Payment Gateways
*   **Ticketing**: Zoho Desk Integration

---

## Directory Structure
*   `src/server.ts` - Main entrypoint and API routing configuration.
*   `src/routes/` - Route handlers (e.g. `analyze.ts`, `checkout.ts`, `onboarding.ts`).
*   `src/middleware/` - Custom Express middleware (e.g., Clerk auth verification).
*   `src/lib/` - Shared services (DB connections, payment processing, AI prompting engines).
*   `prisma/` - Database schema definitions and migrations.

---

## Getting Started

### 1. Installation
Install project dependencies:
```bash
npm install
```

### 2. Configuration
Copy the `.env.example` file and configure your credentials:
```bash
cp .env.example .env
```
Make sure to fill in all required keys:
*   `DATABASE_URL` (Neon Postgres endpoint)
*   `CLERK_SECRET_KEY` & `CLERK_WEBHOOK_SECRET`
*   `GEMINI_API_KEY` / `GROQ_API_KEY`
*   Payment Gateway credentials (Doku/Midtrans)

### 3. Database Setup
Ensure your local Prisma client is generated:
```bash
npx prisma generate
```

### 4. Running the Application

*   **Development Mode** (Hot-reloading via `ts-node-dev`):
    ```bash
    npm run dev
    ```
    The server will start listening on port `5001` (by default) or the port specified in `PORT`.

*   **Production Build**:
    ```bash
    npm run build
    ```

*   **Start Production Server**:
    ```bash
    npm run start
    ```

---

## License
This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.