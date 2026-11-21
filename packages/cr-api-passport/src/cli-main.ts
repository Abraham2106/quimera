#!/usr/bin/env node
import { runCliMain } from "./cli.js";

const code = await runCliMain(process.argv.slice(2));
process.exitCode = code;