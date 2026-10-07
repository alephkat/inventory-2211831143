import fs from 'fs';
import path from 'path';

const modulesDir = 'C:\\Users\\ITAdministrator\\Desktop\\inventory-web\\backend\\src\\modules';

// Get all .ts files
function getAllTsFiles(dir) {
  const files = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...getAllTsFiles(fullPath));
    } else if (entry.name.endsWith('.ts')) {
      files.push(fullPath);
    }
  }
  return files;
}

function convertTsToJs(content, filePath) {
  // Remove type annotations and convert to JS
  let js = content;
  
  // Replace import paths to add .js extension
  js = js.replace(/from\s+['"](\.[^'"]+)['"]/g, (match, importPath) => {
    // If already has .js extension, don't add another
    if (importPath.endsWith('.js')) return match;
    // If it's a node module (no ./ or ../), don't add .js
    if (!importPath.startsWith('.') && !importPath.startsWith('/')) return match;
    return `from '${importPath}.js'`;
  });
  
  // Remove TypeScript type annotations - simpler approach
  // Remove: : Type, : Type[], : Promise<Type>, etc.
  js = js.replace(/:\s*Promise\s*<[^>]+>/g, '');
  js = js.replace(/:\s*[A-Z][a-zA-Z0-9]*\s*<[^>]+>/g, '');
  js = js.replace(/:\s*[A-Z][a-zA-Z0-9]*\s*\[\s*\]/g, '');
  js = js.replace(/:\s*[A-Z][a-zA-Z0-9]*\s*\|\s*[A-Z][a-zA-Z0-9]*/g, '');
  js = js.replace(/:\s*[A-Z][a-zA-Z0-9]*/g, '');
  js = js.replace(/:\s*\{[^}]*\}\s*/g, '');
  
  // Remove generic type parameters from function calls
  js = js.replace(/<[A-Z][a-zA-Z0-9]*>\s*\(/g, '(');
  js = js.replace(/<[A-Z][a-zA-Z0-9, ]*>\s*\{/g, '{');
  
  // Remove 'as Type' casts
  js = js.replace(/\s+as\s+[A-Z][a-zA-Z0-9<>\[\],\s|&]+\s*/g, ' ');
  
  // Remove import type statements
  js = js.replace(/import\s+type\s+\{[^}]*\}\s+from\s+['"][^'"]+['"];?\s*/g, '');
  js = js.replace(/import\s+type\s+[A-Z][a-zA-Z0-9]*\s+from\s+['"][^'"]+['"];?\s*/g, '');
  
  // Remove export type
  js = js.replace(/export\s+type\s+[A-Z][a-zA-Z0-9]*\s*=\s*[^;]+;/g, '');
  
  // Remove interface declarations
  js = js.replace(/export\s+interface\s+[A-Z][a-zA-Z0-9]*\s*\{[^}]*\}/g, '');
  js = js.replace(/interface\s+[A-Z][a-zA-Z0-9]*\s*\{[^}]*\}/g, '');
  
  // Remove 'public', 'private', 'protected', 'readonly' keywords
  js = js.replace(/\b(public|private|protected|readonly)\s+/g, '');
  
  // Remove 'abstract' keyword
  js = js.replace(/\babstract\s+/g, '');
  
  // Remove 'declare' keyword
  js = js.replace(/\bdeclare\s+/g, '');
  
  // Remove 'implements'
  js = js.replace(/implements\s+[A-Z][a-zA-Z0-9, ]+/g, '');
  
  // Remove 'const enum' and similar
  js = js.replace(/const\s+enum\s+[A-Z][a-zA-Z0-9]*\s*\{[^}]*\}/g, '');
  
  // Fix: Remove trailing commas in function parameters
  js = js.replace(/,\s*\)/g, ')');
  
  // Remove basic type annotations like : string, : number, etc.
  js = js.replace(/:\s*(string|number|boolean|object|unknown|any|void|never)\b/g, '');
  
  // Clean up empty lines
  js = js.replace(/\n\s*\n\s*\n/g, '\n\n');
  
  // Fix double spaces
  js = js.replace(/  +/g, ' ');
  
  return js;
}

// Convert all .ts files
const tsFiles = getAllTsFiles(modulesDir);
console.log(`Found ${tsFiles.length} TypeScript files to convert`);

for (const tsFile of tsFiles) {
  const content = fs.readFileSync(tsFile, 'utf8');
  const jsContent = convertTsToJs(content, tsFile);
  const jsFile = tsFile.replace(/\.ts$/, '.js');
  
  fs.writeFileSync(jsFile, jsContent);
  console.log(`Converted: ${tsFile} -> ${jsFile}`);
}

console.log('Conversion complete!');