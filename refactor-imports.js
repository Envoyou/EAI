const fs = require('fs');
const path = require('path');

const sharedModules = [
  'diff', 'editorial-profile-schema', 'editorial-profile', 'editorial',
  'email-utils', 'feature-flags', 'features', 'json-stream', 'legal',
  'onboarding-schema', 'owner-guard', 'schema', 'seo-metadata'
];

function walk(dir, callback) {
  fs.readdirSync(dir).forEach(f => {
    let dirPath = path.join(dir, f);
    let isDirectory = fs.statSync(dirPath).isDirectory();
    if (isDirectory) {
      walk(dirPath, callback);
    } else if (dirPath.endsWith('.ts') || dirPath.endsWith('.tsx')) {
      callback(dirPath);
    }
  });
}

function refactorFile(filePath) {
  let content = fs.readFileSync(filePath, 'utf-8');
  let original = content;

  // Frontend local imports
  // e.g. import { ... } from '@/lib/diff'
  sharedModules.forEach(mod => {
    let re = new RegExp(`from ['"]@/lib/${mod}['"]`, 'g');
    content = content.replace(re, `from '@eai/shared'`);
    
    // Also catch relative ones in frontend
    re = new RegExp(`from ['"](\\.?\\.?/)+lib/${mod}['"]`, 'g');
    content = content.replace(re, `from '@eai/shared'`);
    
    // Sometimes there's a .ts extension in the import
    re = new RegExp(`from ['"](\\.?\\.?/)+lib/${mod}\\.ts['"]`, 'g');
    content = content.replace(re, `from '@eai/shared'`);
  });

  // Backend local imports (they are typically relative)
  // e.g. import { ... } from '../lib/schema' or './schema'
  sharedModules.forEach(mod => {
    let re = new RegExp(`from ['"](\\.?\\.?/)+${mod}['"]`, 'g');
    // But wait, if it's inside `src/lib`, it might be `from './schema'`. 
    // This could accidentally replace non-lib imports if there are identically named files elsewhere.
    // However, backend only has these files in `src/lib`.
    // Let's only do it for backend inside `src/`
    if (filePath.includes('apps/backend/src')) {
      content = content.replace(re, `from '@eai/shared'`);
      // with .ts
      re = new RegExp(`from ['"](\\.?\\.?/)+${mod}\\.ts['"]`, 'g');
      content = content.replace(re, `from '@eai/shared'`);
    }
  });

  // Frontend types
  let typesRe = /from ['"]@\/types\/?(index)?['"]/g;
  content = content.replace(typesRe, `from '@eai/shared'`);
  let typesRe2 = /from ['"](\.\.\/)+types\/?(index)?(\.ts)?['"]/g;
  content = content.replace(typesRe2, `from '@eai/shared'`);

  // Backend types
  if (filePath.includes('apps/backend/src')) {
    let bTypesRe = /from ['"](\.\.\/)+types\/?(index)?(\.ts)?['"]/g;
    content = content.replace(bTypesRe, `from '@eai/shared'`);
    let bTypesRe2 = /from ['"]\.\/types\/?(index)?['"]/g;
    content = content.replace(bTypesRe2, `from '@eai/shared'`);
  }

  if (content !== original) {
    fs.writeFileSync(filePath, content);
  }
}

walk('apps/frontend/src', refactorFile);
walk('apps/backend/src', refactorFile);

// Now delete the moved files from frontend and backend
sharedModules.forEach(mod => {
  try { fs.unlinkSync(`apps/frontend/src/lib/${mod}.ts`); } catch (e) {}
  try { fs.unlinkSync(`apps/backend/src/lib/${mod}.ts`); } catch (e) {}
});

// Also delete types
try { fs.rmSync(`apps/frontend/src/types`, { recursive: true, force: true }); } catch (e) {}
try { fs.rmSync(`apps/backend/src/types`, { recursive: true, force: true }); } catch (e) {}

console.log("Refactoring complete");
