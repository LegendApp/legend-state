// Function to write a large array of numbers to a file
const fs = require('fs');
const path = require('path');

const data = [];
for (let i = 0; i < 1000000; i++) {
    data.push(1);
}

const hermesFilePath = 'hermesLargeNumberArrayData.json';
const nodeFilePath = 'nodeLargeNumberArrayData.json';
fs.writeFileSync(hermesFilePath, `module.exports = ${JSON.stringify(data)};`);
fs.writeFileSync(nodeFilePath, `${JSON.stringify(data)};`);
