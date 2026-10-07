import fs from 'fs';
import path from 'path';

const backendDir = 'C:\\Users\\ITAdministrator\\Desktop\\inventory-web\\backend\\src';

function getAllJsFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  const files = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...getAllJsFiles(fullPath));
    } else if (entry.name.endsWith('.js')) {
      files.push(fullPath);
    }
  }
  return files;
}

function fixTsSyntax(content) {
  let js = content;
  
  // Fix: TypeScript optional parameters: (message?)
  // Handle function declarations: function send(res, data, code = 200, message?)
  js = js.replace(/function\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*\(([^)]*?),\s*([a-zA-Z_][a-zA-Z0-9_]*)\?\s*\)/g, 'function $1($2, $3)');
  js = js.replace(/function\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*\(([^)]*?),\s*([a-zA-Z_][a-zA-Z0-9_]*)\?\s*,/g, 'function $1($2, $3,');
  
  // Handle arrow functions: (message?) => 
  js = js.replace(/\(\s*([a-zA-Z_][a-zA-Z0-9_]*)\?\s*\)\s*=>/g, '($1) =>');
  js = js.replace(/\(\s*([a-zA-Z_][a-zA-Z0-9_]*)\?\s*,/g, '($1,');
  
  // Fix: TypeScript union types in parameters
  js = js.replace(/\(([^)]+):\s*[A-Za-z]+\s*\|\s*[A-Za-z]+\s*=\s*[^)]+\)/g, '($1)');
  js = js.replace(/\(([^)]+):\s*[A-Za-z]+\s*\|\s*[A-Za-z]+\)/g, '($1)');
  
  // Fix: TypeScript array types in parameters: (permissionValues[])
  js = js.replace(/\(([^)]+)\[\]/g, '($1');
  
  // Fix: TypeScript non-null assertion: req.user!.id
  js = js.replace(/req\.user!/g, 'req.user');
  js = js.replace(/([a-zA-Z_][a-zA-Z0-9_]*)!\./g, '$1.');
  
  // Fix: TypeScript type assertions: as Type
  js = js.replace(/\s+as\s+[A-Z][a-zA-Z0-9<>[\],\s|&]+\s*[},;)]/g, ' ');
  js = js.replace(/\s+as\s+[A-Z][a-zA-Z0-9<>[\],\s|&]+\s*$/gm, '');
  
  // Fix: Incomplete spread operator
  js = js.replace(/\.\.\.\s*\([^)]*\)\s*\?\s*\{[^}]*\}\s*:\s*\{\s*\}/g, '');
  
  // Clean up empty lines
  js = js.replace(/\n\s*\n\s*\n/g, '\n\n');
  
  // Fix double spaces
  js = js.replace(/  +/g, ' ');
  
  return js;
}

const jsFiles = getAllJsFiles(backendDir);
console.log(`Found ${jsFiles.length} JavaScript files to fix`);

let fixedCount = 0;
for (const jsFile of jsFiles) {
  const content = fs.readFileSync(jsFile, 'utf8');
  const fixedContent = fixTsSyntax(content);
  
  if (content !== fixedContent) {
    fs.writeFileSync(jsFile, fixedContent);
    console.log(`Fixed: ${jsFile}`);
    fixedCount++;
  }
}

console.log(`Fixed ${fixedCount} files`);