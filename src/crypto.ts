import { createHash } from 'node:crypto';

export async function stringToMd5Hex(str: string) {
  return createHash('md5').update(str).digest('hex');
}
