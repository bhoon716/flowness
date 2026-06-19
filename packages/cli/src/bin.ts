#!/usr/bin/env node
import { runCli } from "./index.js";

const result = await runCli(process.argv.slice(2));
if (result.exitCode === 0) {
  console.log(result.output);
} else {
  console.error(result.output);
}

if (result.exitCode !== 0) {
  process.exitCode = result.exitCode;
}
