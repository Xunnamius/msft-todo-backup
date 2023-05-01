/* eslint-disable unicorn/prevent-abbreviations */
import { Readable, type Duplex } from 'node:stream';

import { disassembler, type DisassemblerOptions } from 'stream-json/Disassembler';
import { chain } from 'stream-chain';

import type { GenericJsonToken, JsonToken } from 'multiverse/stream-json-extended';
import type { JsonValue, Promisable } from 'type-fest';

export async function tokenizeObject(
  object: JsonValue,
  options?: DisassemblerOptions & { excludeFirstAndLast?: boolean }
): Promise<JsonToken[]> {
  const { excludeFirstAndLast, ...disassemblerOptions } = options || {};

  // ? ObjectMode streams cannot handle raw null values
  if (object === null) {
    return [{ name: 'nullValue', value: null }];
  }

  return chain([Readable.from([object]), disassembler(disassemblerOptions)])
    .toArray()
    .then((array) => (excludeFirstAndLast ? array.slice(1, -1) : array));
}

export async function feedTokenStream(
  tokenQueue: Promisable<GenericJsonToken[]>,
  stream: Duplex
): Promise<GenericJsonToken[]> {
  return chain([Readable.from(await tokenQueue), stream]).toArray();
}
