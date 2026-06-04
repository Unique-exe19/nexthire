const fs = require('fs');
const path = require('path');

const SUBMISSION_CSV  = path.resolve(__dirname, '..', 'submission.csv');

const content = fs.readFileSync(SUBMISSION_CSV, 'utf-8');
const lines = content.trim().split('\n');

console.log('Total split lines:', lines.length);

let failedCount = 0;
let matchedCount = 0;

for (let i = 1; i < lines.length; i++) {
  const line = lines[i].replace(/\r$/, ''); // Strip carriage return
  const m = line.match(/^([^,]+),(\d+),([\d.]+),(.*)$/);
  if (!m) {
    failedCount++;
    if (failedCount <= 10) {
      console.log(`Failed line ${i}:`, JSON.stringify(line));
    }
  } else {
    matchedCount++;
    if (matchedCount <= 2) {
      console.log(`Matched line ${i}:`, JSON.stringify(line), '=>', m[1], m[2], m[3]);
    }
  }
}

console.log('Summary: Matched:', matchedCount, 'Failed:', failedCount);
