# Envoyou AI (EAI)

AI-powered editorial workspace for structured content creation, refinement, and publishing articles.

EAI (Envoyou AI Editorial Intelligence) helps teams editorials transform raw ideas into publication-ready content through AI-assisted drafting, editorial workflows, SEO optimization, and controlled publishing pipelines.

---

## Features

* ✍️ AI-assisted editorial workflow
* 🧠 EAI Research Copilot (Interactive AI Assistant)
* 📚 Research Notes Studio (Managed Fact Sources)
* 🔍 Structured fact-checking pipeline
* 📖 Brand guideline enforcement
* 🚀 SEO optimization
* 🔗 Custom publishing integrations
* 🧩 Extensible monorepo architecture

---

## Tech Stack

* **Frontend** → Next.js 16 (App Router)
* **Backend** → Node.js + Express
* **Database** → Prisma ORM
* **Queue** → BullMQ
* **Shared Layer** → TypeScript + Zod
* **Monorepo** → TurboRepo

---

## Project Structure

```txt
apps/
├── frontend/     # Next.js application (Vercel)
└── backend/      # Express API + Prisma + BullMQ (VPS)

packages/
└── shared/       # Shared types, schemas, utilities
```

---

## Getting Started

### Requirements

* Node.js 20+
* npm 10+

### Clone Repository

```bash
git clone git@github.com:Envoyou/EAI.git
cd EAI
```

### Install Dependencies

```bash
npm install
```

### Environment Setup

Create environment files:

```txt
apps/frontend/.env
apps/backend/.env
```

Configure values according to your deployment environment.

### Generate Prisma Client

```bash
cd apps/backend
npx prisma generate
cd ../..
```

### Run Development

Start frontend and backend together:

```bash
npm run dev
```

Application should now be available locally.

---

## Build

```bash
npm run build
```

---

## Documentation

* CHANGELOG en → [CHANGELOG](./CHANGELOG.md)
* CHANGELOG id → [CHANGELOG.id](./CHANGELOG.id.md)
* DOCS → [DOCS](./docs)

---

## Contributing

Contributions, discussions, and improvements are welcome.

Please open an issue before submitting major changes.

---

## License

Copyright © 2026 Envoyou

Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0).

If you run a modified version of this software as a network service, you must make the corresponding source code available under AGPL terms.

See [LICENSE](./LICENSE) for details.
