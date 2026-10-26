const fs = require('fs');
const path = require('path');
const dir = path.join(__dirname, '../node_modules/@bg0/browser/dist');
if (fs.existsSync(dir)) {
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.js'));
  for (const file of files) {
    const fullPath = path.join(dir, file);
    let code = fs.readFileSync(fullPath, 'utf8');
    code = code.replace(/from\s+['"]\.\/([^'"]+?)['"]/g, (match, p1) => {
      if (p1.endsWith('.js')) return match;
      return `from './${p1}.js'`;
    });
    code = code.replace(/import\s+['"]\.\/([^'"]+?)['"]/g, (match, p1) => {
      if (p1.endsWith('.js')) return match;
      return `import './${p1}.js'`;
    });
    code = code.replace(/export\s+\{([^}]+)\}\s+from\s+['"]\.\/([^'"]+?)['"]/g, (match, p1, p2) => {
      if (p2.endsWith('.js')) return match;
      return `export {${p1}} from './${p2}.js'`;
    });
    fs.writeFileSync(fullPath, code, 'utf8');
  }
}

