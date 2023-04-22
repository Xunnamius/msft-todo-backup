/* eslint-disable unicorn/prevent-abbreviations */
import { disassembler, type DisassemblerOptions } from 'stream-json/Disassembler';
import { chain } from 'stream-chain';
import { Readable, Writable } from 'node:stream';

import type { JsonToken } from 'multiverse/stream-json-extended';
import type { JsonValue, Promisable } from 'type-fest';
import type { Duplex } from 'node:stream';

export function tokenizeObject(
  object: JsonValue,
  disassemblerOptions?: DisassemblerOptions
) {
  return new Promise<JsonToken[]>((resolve, reject) => {
    // ? ObjectMode streams cannot handle raw null values
    if (object === null) {
      resolve([{ name: 'nullValue' }]);
    }

    const tokens: JsonToken[] = [];
    let pushed = false;

    chain([
      new Readable({
        objectMode: true,
        async read() {
          this.push(pushed ? null : object);
          pushed = true;
        }
      }),
      disassembler(disassemblerOptions),
      new Writable({
        objectMode: true,
        write(chunk, _encoding, callback) {
          tokens.push(chunk);
          callback(null);
        }
      })
    ])
      .on('end', () => resolve(tokens))
      .on('error', (error) => reject(error));
  });
}

export function streamTokens(tokenQueue_: JsonToken[]) {
  const tokenQueue = [...tokenQueue_];
  return new Readable({
    objectMode: true,
    async read() {
      this.push(tokenQueue.length === 0 ? null : tokenQueue.shift());
    }
  });
}

export async function expectDownstreamTokens(
  tokenQueue: JsonToken[],
  stream: Duplex,
  expectation: (tokens: JsonToken[]) => Promisable<void>
) {
  const tokens: JsonToken[] = [];

  await new Promise<JsonToken[]>((resolve, reject) => {
    chain([
      streamTokens(tokenQueue),
      stream,
      new Writable({
        objectMode: true,
        write(chunk, _encoding, callback) {
          tokens.push(chunk);
          callback(null);
        }
      })
    ])
      .on('end', () => resolve(tokens))
      .on('error', (error) => reject(error));
  });

  await expectation(tokens);
}
