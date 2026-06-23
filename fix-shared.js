const fs = require('fs');

function replace(file, search, replacement) {
  let content = fs.readFileSync(file, 'utf-8');
  fs.writeFileSync(file, content.replace(search, replacement));
}

replace('packages/shared/src/editorial-profile.ts', /from ['"]@\/types['"]/g, "from './types'");
replace('packages/shared/src/schema.ts', /from ['"]@\/types['"]/g, "from './types'");
replace('packages/shared/src/editorial.ts', /from ['"]\.\.\/types\/index['"]/g, "from './types/index'");
replace('packages/shared/src/seo-metadata.ts', /from ['"]\.\.\/types\/index['"]/g, "from './types/index'");

let ff = fs.readFileSync('packages/shared/src/feature-flags.ts', 'utf-8');
ff = ff.replace(/cache: 'no-store'/g, "cache: 'no-store' as RequestCache");
fs.writeFileSync('packages/shared/src/feature-flags.ts', ff);

// Fix backend payment imports
let doku = fs.readFileSync('apps/backend/src/lib/payments/doku.ts', 'utf-8');
doku = doku.replace(/import \{([^}]+)\} from '@eai\/shared';/g, (match, p1) => {
  if (p1.includes('CheckoutResult')) return `import { ${p1} } from './types';`;
  return match;
});
fs.writeFileSync('apps/backend/src/lib/payments/doku.ts', doku);

let midtrans = fs.readFileSync('apps/backend/src/lib/payments/midtrans.ts', 'utf-8');
midtrans = midtrans.replace(/import \{([^}]+)\} from '@eai\/shared';/g, (match, p1) => {
  if (p1.includes('CheckoutResult')) return `import { ${p1} } from './types';`;
  return match;
});
fs.writeFileSync('apps/backend/src/lib/payments/midtrans.ts', midtrans);

