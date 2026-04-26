const fs = require('fs');
const file = 'd:/Diplom Porject/client/src/components/FileTransfer.tsx';
let content = fs.readFileSync(file, 'utf8');

const target = "return { ...prev, files: data.files, path: data.path, parentPath: data.parentPath, loading: false, error: '', selected: new Set() };";
const replacement = "return { ...prev, files: data.files, path: data.path, parentPath: data.parentPath, loading: false, error: '', selected: new Set(), drives: (data as any).drives || prev.drives || [] };";

content = content.replace(target, replacement);

fs.writeFileSync(file, content);
console.log('Replaced');
