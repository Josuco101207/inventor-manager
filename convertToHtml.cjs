const fs = require('fs');
const { marked } = require('marked');

const input = fs.readFileSync('docs/Manual_Tecnico_Completo.md', 'utf8');
const htmlContent = marked.parse(input);

const fullHtml = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  body { font-family: Arial, sans-serif; line-height: 1.6; margin: 40px; }
  h1 { color: #2c3e50; }
  h2 { color: #34495e; border-bottom: 1px solid #ccc; padding-bottom: 5px; }
  h3 { color: #7f8c8d; }
  code { background: #f4f4f4; padding: 2px 5px; border-radius: 3px; font-family: Consolas, monospace; }
  pre { background: #f4f4f4; padding: 15px; border-radius: 5px; overflow-x: auto; }
  pre code { background: none; padding: 0; }
  table { border-collapse: collapse; width: 100%; margin-bottom: 20px; }
  th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
  th { background-color: #f2f2f2; }
</style>
</head>
<body>
${htmlContent}
</body>
</html>`;

fs.writeFileSync('docs/Manual_Tecnico_Word.html', fullHtml, 'utf8');
console.log('Created Manual_Tecnico_Word.html successfully. You can open this file in Word directly.');
