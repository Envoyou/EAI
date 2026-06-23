.
├── apps
│   ├── backend
│   │   ├── deploy.sh
│   │   ├── dist
│   │   ├── ecosystem.config.cjs
│   │   ├── log_build.txt
│   │   ├── node_modules
│   │   ├── package.json
│   │   ├── prisma
│   │   ├── prisma.config.ts
│   │   ├── PRODUCTION-VPS.md
│   │   ├── src
│   │   └── tsconfig.json
│   └── frontend
│       ├── AGENTS.md
│       ├── complience
│       ├── components.json
│       ├── docs
│       ├── eslint.config.mjs
│       ├── instrumentation-client.ts
│       ├── instrumentation.ts
│       ├── messages
│       ├── next.config.ts
│       ├── next-env.d.ts
│       ├── node_modules
│       ├── package.json
│       ├── postcss.config.mjs
│       ├── public
│       ├── sentry.edge.config.ts
│       ├── sentry.server.config.ts
│       ├── src
│       ├── test-gemini.js
│       ├── tsconfig.json
│       └── tsconfig.tsbuildinfo
├── CHANGELOG.md
├── fix-client-imports.js
├── fix-server-imports.js
├── fix-shared.js
├── LICENSE
├── node_modules
│   ├── acorn
│   │   ├── bin
│   │   ├── CHANGELOG.md
│   │   ├── dist
│   │   ├── LICENSE
│   │   ├── package.json
│   │   └── README.md
│   ├── acorn-import-attributes
│   │   ├── lib
│   │   ├── LICENSE
│   │   ├── package.json
│   │   ├── README.md
│   │   └── src
│   ├── backend -> ../apps/backend
│   ├── cjs-module-lexer
│   │   ├── dist
│   │   ├── lexer.d.ts
│   │   ├── lexer.js
│   │   ├── LICENSE
│   │   ├── package.json
│   │   └── README.md
│   ├── debug
│   │   ├── LICENSE
│   │   ├── package.json
│   │   ├── README.md
│   │   └── src
│   ├── @eai
│   │   └── shared -> ../../packages/shared
│   ├── frontend -> ../apps/frontend
│   ├── import-in-the-middle
│   │   ├── CHANGELOG.md
│   │   ├── CODE_OF_CONDUCT.md
│   │   ├── CONTRIBUTING.md
│   │   ├── create-hook.mjs
│   │   ├── GOVERNANCE.md
│   │   ├── hook.mjs
│   │   ├── index.d.ts
│   │   ├── index.js
│   │   ├── lib
│   │   ├── LICENSE
│   │   ├── LICENSE-3rdparty.csv
│   │   ├── NOTICE
│   │   ├── package.json
│   │   ├── README.md
│   │   ├── register-hooks.d.ts
│   │   └── register-hooks.mjs
│   ├── module-details-from-path
│   │   ├── index.js
│   │   ├── LICENSE
│   │   ├── package.json
│   │   └── README.md
│   ├── ms
│   │   ├── index.js
│   │   ├── license.md
│   │   ├── package.json
│   │   └── readme.md
│   ├── require-in-the-middle
│   │   ├── index.js
│   │   ├── LICENSE
│   │   ├── package.json
│   │   ├── README.md
│   │   └── types
│   ├── @turbo
│   │   └── linux-64
│   ├── turbo
│   │   ├── bin
│   │   ├── LICENSE
│   │   ├── package.json
│   │   ├── README.md
│   │   └── schema.json
│   ├── @types
│   │   └── node
│   ├── typescript
│   │   ├── bin
│   │   ├── lib
│   │   ├── LICENSE.txt
│   │   ├── package.json
│   │   ├── README.md
│   │   ├── SECURITY.md
│   │   └── ThirdPartyNoticeText.txt
│   ├── undici-types
│   │   ├── agent.d.ts
│   │   ├── api.d.ts
│   │   ├── balanced-pool.d.ts
│   │   ├── cache.d.ts
│   │   ├── client.d.ts
│   │   ├── connector.d.ts
│   │   ├── content-type.d.ts
│   │   ├── cookies.d.ts
│   │   ├── diagnostics-channel.d.ts
│   │   ├── dispatcher.d.ts
│   │   ├── env-http-proxy-agent.d.ts
│   │   ├── errors.d.ts
│   │   ├── eventsource.d.ts
│   │   ├── fetch.d.ts
│   │   ├── file.d.ts
│   │   ├── filereader.d.ts
│   │   ├── formdata.d.ts
│   │   ├── global-dispatcher.d.ts
│   │   ├── global-origin.d.ts
│   │   ├── handlers.d.ts
│   │   ├── header.d.ts
│   │   ├── index.d.ts
│   │   ├── interceptors.d.ts
│   │   ├── LICENSE
│   │   ├── mock-agent.d.ts
│   │   ├── mock-client.d.ts
│   │   ├── mock-errors.d.ts
│   │   ├── mock-interceptor.d.ts
│   │   ├── mock-pool.d.ts
│   │   ├── package.json
│   │   ├── patch.d.ts
│   │   ├── pool.d.ts
│   │   ├── pool-stats.d.ts
│   │   ├── proxy-agent.d.ts
│   │   ├── readable.d.ts
│   │   ├── README.md
│   │   ├── retry-agent.d.ts
│   │   ├── retry-handler.d.ts
│   │   ├── util.d.ts
│   │   ├── webidl.d.ts
│   │   └── websocket.d.ts
│   ├── @vercel
│   │   ├── edge-config
│   │   └── edge-config-fs
│   └── zod
│       ├── index.cjs
│       ├── index.d.cts
│       ├── index.d.ts
│       ├── index.js
│       ├── LICENSE
│       ├── locales
│       ├── mini
│       ├── package.json
│       ├── README.md
│       ├── src
│       ├── v3
│       ├── v4
│       └── v4-mini
├── package.json
├── package-lock.json
├── packages
│   └── shared
│       ├── package.json
│       ├── server.ts
│       ├── src
│       └── tsconfig.json
├── README.id.md
├── README.md
├── refactor-imports.js
└── turbo.json

58 directories, 134 files
