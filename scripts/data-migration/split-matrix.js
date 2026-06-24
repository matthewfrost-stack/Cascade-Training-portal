const fs = require('fs');
const path = require('path');

const pagePath = path.join(__dirname, '../../src/app/training-matrix/page.tsx');
const code = fs.readFileSync(pagePath, 'utf8');

const lines = code.split('\n');
const returnIndex = lines.findIndex(line => line.trim() === 'return (' && line.includes('return'));

console.log('Return statement found at line:', returnIndex);

const logicLines = lines.slice(0, returnIndex);
const jsxLines = lines.slice(returnIndex);

fs.writeFileSync(path.join(__dirname, 'logic.tsx.txt'), logicLines.join('\n'));
fs.writeFileSync(path.join(__dirname, 'jsx.tsx.txt'), jsxLines.join('\n'));
