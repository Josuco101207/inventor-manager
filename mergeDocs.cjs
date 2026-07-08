const fs = require('fs');
const path = require('path');

const docsDir = path.join(__dirname, 'docs', 'manual_tecnico');
const outputFile = path.join(__dirname, 'docs', 'Manual_Tecnico_Completo.md');

// Get all .md files, sorted alphabetically
const files = fs.readdirSync(docsDir)
  .filter(file => file.endsWith('.md'))
  .sort();

let combinedContent = '# Manual Técnico: Inventor Manager\n\n';

for (const file of files) {
  const content = fs.readFileSync(path.join(docsDir, file), 'utf8');
  combinedContent += `\n\n---\n\n${content}`;
}

fs.writeFileSync(outputFile, combinedContent, 'utf8');
console.log(`Successfully combined ${files.length} files into ${outputFile}`);
