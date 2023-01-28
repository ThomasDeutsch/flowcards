import { rm, copyFile } from 'node:fs/promises';
import { exec } from 'child_process';
import util from "node:util";

const execPromise = util.promisify(exec);

// remove dist folder
await rm('./dist', { recursive: true, force: true });
// start rollup build
await execPromise('rollup -c');
// copy package.json to dist folder using fs/promises
await copyFile('./package.json', './dist/package.json');
// remove dts folder inside dist folder
await rm('./dist/dts', { recursive: true, force: true });