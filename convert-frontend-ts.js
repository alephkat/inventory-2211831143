import fs from 'fs';
import path from 'path';

const frontendSrc = 'C:\\Users\\ITAdministrator\\Desktop\\inventory-web\\frontend\\src';

function getAllTsFiles(dir) {
  const files = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...getAllTsFiles(fullPath));
    } else if (entry.name.endsWith('.tsx') || entry.name.endsWith('.ts')) {
      files.push(fullPath);
    }
  }
  return files;
}

function convertTsxToJsx(content) {
  let js = content;

  // Remove import type statements
  js = js.replace(/import\s+type\s+\{[^}]*\}\s+from\s+['"][^'"]+['"];?\s*/g, '');
  js = js.replace(/import\s+type\s+[A-Za-z_][a-zA-Z0-9_]*\s+from\s+['"][^'"]+['"];?\s*/g, '');

  // Remove export type statements
  js = js.replace(/export\s+type\s+[A-Za-z_][a-zA-Z0-9_]*\s*=\s*[^;]+;?\s*/g, '');

  // Remove interface declarations
  js = js.replace(/export\s+interface\s+[A-Za-z_][a-zA-Z0-9_]*\s*\{[^}]*\}/g, '');
  js = js.replace(/interface\s+[A-Za-z_][a-zA-Z0-9_]*\s*\{[^}]*\}/g, '');

  // Remove type declarations (non-exported)
  js = js.replace(/^type\s+[A-Za-z_][a-zA-Z0-9_]*\s*=\s*[^;]+;?\s*/gm, '');

  // Remove generic type parameters from JSX components: <Component<T>> -> <Component>
  js = js.replace(/<([A-Z][a-zA-Z0-9]*)<[^>]*>>/g, '<$1>');
  js = js.replace(/<([a-z][a-zA-Z0-9]*)<[^>]*>>/g, '<$1>');

  // Remove type annotations in JSX props: ({ children }: { children: ReactNode }) -> ({ children })
  js = js.replace(/\(\{([^}]*)\}\s*:\s*\{[^}]*\}\)/g, '({$1})');
  js = js.replace(/\(\{([^}]*)\}\s*:\s*[A-Za-z_][a-zA-Z0-9_<>[\]|&{}, ]*\)/g, '({$1})');

  // Remove type annotations from function parameters
  // Handle: (req: Request, res: Response, next: NextFunction) -> (req, res, next)
  js = js.replace(/\(\s*([^)]+)\)/g, (match) => {
    let params = match.slice(1, -1);
    // Remove type annotations from each parameter
    params = params.replace(/\s*:\s*[A-Za-z_][a-zA-Z0-9_<>[\]|&{}, ]*/g, '');
    // Clean up extra commas
    params = params.replace(/,\s*,/g, ',').replace(/,\s*\)/g, ')').replace(/\(\s*,/g, '(');
    return `(${params})`;
  });

  // Remove type annotations from variable declarations: const x: string = -> const x =
  js = js.replace(/:\s*(string|number|boolean|object|unknown|any|void|never|symbol|bigint)\b/g, '');
  js = js.replace(/:\s*(Promise\s*<[^>]+>)/g, '');
  js = js.replace(/:\s*[A-Z][a-zA-Z0-9_]*\s*<[^>]+>/g, '');
  js = js.replace(/:\s*[A-Z][a-zA-Z0-9_]*\s*\[\s*\]/g, '');
  js = js.replace(/:\s*[A-Z][a-zA-Z0-9_]*\s*\|\s*[A-Z][a-zA-Z0-9_]*/g, '');
  js = js.replace(/:\s*\{[^}]*\}/g, '');
  js = js.replace(/:\s*[A-Z][a-zA-Z0-9_]*/g, '');

  // Remove 'as Type' assertions
  js = js.replace(/\s+as\s+[A-Za-z_][a-zA-Z0-9_<>[\]|&{}, ]+/g, ' ');

  // Remove non-null assertions: req.user!.id -> req.user.id
  js = js.replace(/([a-zA-Z_][a-zA-Z0-9_]*)!\./g, '$1.');
  js = js.replace(/([a-zA-Z_][a-zA-Z0-9_]*!)/g, '$1');

  // Clean up empty lines
  js = js.replace(/\n\s*\n\s*\n/g, '\n\n');
  js = js.replace(/  +/g, ' ');

  return js;
}

const tsFiles = getAllTsFiles(frontendSrc);
console.log(`Found ${tsFiles.length} TypeScript files to convert in frontend/src`);

for (const tsFile of tsFiles) {
  const content = fs.readFileSync(tsFile, 'utf8');
  const isTsx = tsFile.endsWith('.tsx');
  const newExt = isTsx ? '.jsx' : '.js';
  const jsFile = tsFile.replace(/\.tsx?$/, newExt);

  const jsContent = convertTsxToJsx(content);

  fs.writeFileSync(jsFile, jsContent);
  fs.unlinkSync(tsFile);
  console.log(`Converted: ${path.basename(tsFile)} -> ${path.basename(jsFile)}`);
}

console.log('Frontend conversion complete!');