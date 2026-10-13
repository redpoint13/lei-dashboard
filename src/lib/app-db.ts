import path from "node:path";
import type Database from "better-sqlite3";
import { openDb } from "./db";
import { getDataDir } from "./env";

let instance: Database.Database | null = null;

export function getAppDb(): Database.Database {
  if (!instance) {
    instance = openDb(path.join(getDataDir(), "econ.db"));
  }
  return instance;
}
