export function getDataDir(): string {
  return process.env.DATA_DIR ?? "./.data";
}
