/* eslint-disable unicorn/prevent-abbreviations */
import { chain } from 'stream-chain';
import { Readable, Writable } from 'node:stream';

import {
  packEntry,
  bigStringParser,
  packedEntrySymbol,
  FullAssembler,
  type JsonToken,
  type JsonPackedEntryToken
} from 'multiverse/stream-json-extended';

import {
  tokenizeObject,
  expectDownstreamTokens as expectDownstreamTokens_
} from 'multiverse/stream-json-extended/test/setup';

import type { DisassemblerOptions } from 'stream-json/Disassembler';
import type { JsonValue, Promisable } from 'type-fest';

const targetObject = {
  a: 1,
  b: 'data',
  c: { type: 'some-type', bytes: 'big-data', null: null },
  d: [2, 'array-data', { 'array-type': 'some-array-type' }, true, false, null],
  e: {},
  f: [],
  g: true,
  h: false,
  i: null
};

const objectTokens: JsonToken[] = [
  { name: 'startObject' },
  { name: 'startKey' },
  { name: 'stringChunk', value: 'a' },
  { name: 'stringChunk', value: '-' },
  { name: 'stringChunk', value: 'k' },
  { name: 'stringChunk', value: 'e' },
  { name: 'stringChunk', value: 'y' },
  { name: 'endKey' },
  { name: 'startNumber' },
  { name: 'numberChunk', value: '1' },
  { name: 'numberChunk', value: '2' },
  { name: 'numberChunk', value: '3' },
  { name: 'numberChunk', value: '4' },
  { name: 'endNumber' },
  { name: 'startKey' },
  { name: 'stringChunk', value: 'b' },
  { name: 'stringChunk', value: '-' },
  { name: 'stringChunk', value: 'k' },
  { name: 'stringChunk', value: 'e' },
  { name: 'stringChunk', value: 'y' },
  { name: 'endKey' },
  { name: 'startString' },
  { name: 'stringChunk', value: 'd' },
  { name: 'stringChunk', value: 'a' },
  { name: 'stringChunk', value: 't' },
  { name: 'stringChunk', value: 'a' },
  { name: 'endString' },
  { name: 'endObject' }
];

const mixedObjectTokens: JsonToken[] = [
  { name: 'startObject' },
  { name: 'startKey' },
  { name: 'stringChunk', value: 'a' },
  { name: 'stringChunk', value: '-' },
  { name: 'stringChunk', value: 'k' },
  { name: 'stringChunk', value: 'e' },
  { name: 'stringChunk', value: 'y' },
  { name: 'endKey' },
  { name: 'keyValue', value: 'a-key' },
  { name: 'startNumber' },
  { name: 'numberChunk', value: '1' },
  { name: 'numberChunk', value: '2' },
  { name: 'numberChunk', value: '3' },
  { name: 'numberChunk', value: '4' },
  { name: 'endNumber' },
  { name: 'startKey' },
  { name: 'stringChunk', value: 'b' },
  { name: 'stringChunk', value: '-' },
  { name: 'stringChunk', value: 'k' },
  { name: 'stringChunk', value: 'e' },
  { name: 'stringChunk', value: 'y' },
  { name: 'endKey' },
  { name: 'startString' },
  { name: 'stringChunk', value: 'd' },
  { name: 'stringChunk', value: 'a' },
  { name: 'stringChunk', value: 't' },
  { name: 'stringChunk', value: 'a' },
  { name: 'endString' },
  { name: 'stringValue', value: 'data' },
  { name: 'keyValue', value: 'c-key' },
  { name: 'numberValue', value: '9876' },
  { name: 'keyValue', value: 'd-key' },
  { name: 'startObject' },
  { name: 'keyValue', value: 'subkey-1' },
  { name: 'startString' },
  { name: 'stringChunk', value: 'str' },
  { name: 'stringChunk', value: 'eam' },
  { name: 'stringChunk', value: 'e' },
  { name: 'stringChunk', value: 'd' },
  { name: 'endString' },
  { name: 'startKey' },
  { name: 'stringChunk', value: 's' },
  { name: 'stringChunk', value: 'u' },
  { name: 'stringChunk', value: 'bk' },
  { name: 'stringChunk', value: 'e' },
  { name: 'stringChunk', value: 'y-2' },
  { name: 'endKey' },
  { name: 'startNumber' },
  { name: 'numberChunk', value: '40' },
  { name: 'numberChunk', value: '55' },
  { name: 'numberChunk', value: '60' },
  { name: 'numberChunk', value: '77' },
  { name: 'endNumber' },
  { name: 'numberValue', value: '40556077' },
  { name: 'endObject' },
  { name: 'endObject' }
];

const stringTokens: JsonToken[] = [
  { name: 'startString' },
  { name: 'stringChunk', value: 'd' },
  { name: 'stringChunk', value: 'a' },
  { name: 'stringChunk', value: 't' },
  { name: 'stringChunk', value: 'a' },
  { name: 'endString' }
];

const numberTokens: JsonToken[] = [
  { name: 'startNumber' },
  { name: 'numberChunk', value: '1' },
  { name: 'numberChunk', value: '2' },
  { name: 'numberChunk', value: '3' },
  { name: 'numberChunk', value: '4' },
  { name: 'endNumber' }
];

describe('|>big-string-parser', () => {
  describe('::bigStringParser', () => {
    it('only streams strings and packs all other values', async () => {
      expect.hasAssertions();

      const { a, b } = targetObject;
      const stream = await new Promise<JsonToken[]>((resolve, reject) => {
        const tokens: JsonToken[] = [];
        let pushed = false;

        chain([
          new Readable({
            async read() {
              this.push(pushed ? null : JSON.stringify({ a, b }));
              pushed = true;
            }
          }),
          bigStringParser(),
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

      expect(stream).toStrictEqual([
        { name: 'startObject' },
        { name: 'keyValue', value: 'a' },
        { name: 'numberValue', value: '1' },
        { name: 'keyValue', value: 'b' },
        { name: 'startString' },
        { name: 'stringChunk', value: 'data' },
        { name: 'endString' },
        { name: 'endObject' }
      ]);
    });
  });
});

describe('|>full-assembler', () => {
  describe('::FullAssembler', () => {
    async function consumeTokenizedObject(
      assembler: FullAssembler,
      object: JsonValue,
      disassemblerOptions?: DisassemblerOptions & { lastValueIsPackedDuplicate?: boolean }
    ) {
      const tokens: JsonToken[] = await tokenizeObject(object, disassemblerOptions);
      tokens.forEach((jsonToken, index) => {
        assembler.consume(jsonToken);
        // ? Should be done when only one token or if last token
        expect(assembler.done).toBe(
          !(
            tokens.length > 1 &&
            index <
              tokens.length - (disassemblerOptions?.lastValueIsPackedDuplicate ? 2 : 1)
          )
        );
      });
      return assembler;
    }

    it('assembles object when all values are streamed and packed', async () => {
      expect.hasAssertions();

      const fullAssembler = await consumeTokenizedObject(
        new FullAssembler(),
        targetObject,
        // ? This is the default configuration
        { streamValues: true, packValues: true }
      );

      expect(fullAssembler.done).toBeTrue();
      expect(fullAssembler.current).toStrictEqual(targetObject);
    });

    it('assembles object when all values are streamed and not packed', async () => {
      expect.hasAssertions();

      const fullAssembler = await consumeTokenizedObject(
        new FullAssembler(),
        targetObject,
        // ? This is the default configuration
        { streamValues: true, packValues: false }
      );

      expect(fullAssembler.done).toBeTrue();
      expect(fullAssembler.current).toStrictEqual(targetObject);
    });

    it('assembles object when all values are packed and not streamed', async () => {
      expect.hasAssertions();

      const fullAssembler = await consumeTokenizedObject(
        new FullAssembler(),
        targetObject,
        // ? This is the default configuration
        { streamValues: false, packValues: true }
      );

      expect(fullAssembler.done).toBeTrue();
      expect(fullAssembler.current).toStrictEqual(targetObject);
    });

    // ? Skip all false and all true configurations
    for (let index = 1; index < (1 << 6) - 1; ++index) {
      it('assembles object when some values are packed and some are streamed', async () => {
        expect.hasAssertions();

        const fullAssembler = await consumeTokenizedObject(
          new FullAssembler(),
          targetObject,
          // ? This is the default configuration
          {
            // eslint-disable-next-line unicorn/prefer-math-trunc
            streamKeys: Boolean(index & (1 << 0)),
            streamNumbers: Boolean(index & (1 << 1)),
            streamStrings: Boolean(index & (1 << 2)),
            packKeys: Boolean(index & (1 << 3)),
            packNumbers: Boolean(index & (1 << 4)),
            packStrings: Boolean(index & (1 << 5))
          }
        );

        expect(fullAssembler.done).toBeTrue();
        expect(fullAssembler.current).toStrictEqual(targetObject);
      });
    }

    it('handles complex multiplexed mixture of streamed and packed tokens 1', async () => {
      expect.hasAssertions();

      const fullAssembler = new FullAssembler();
      const { c: innerObject, d: innerArray, ...outerObject } = targetObject;
      const outerTokens = await tokenizeObject(outerObject);

      const innerObjectTokens = await tokenizeObject(innerObject, {
        streamValues: false,
        packValues: true
      });

      const innerArrayTokens = await tokenizeObject(innerArray, {
        streamValues: false,
        streamStrings: true,
        streamNumbers: true,
        packValues: true,
        packStrings: false
      });

      outerTokens.splice(
        outerTokens.findLastIndex((token) => token.name == 'startObject'),
        2,
        ...innerObjectTokens
      );

      outerTokens.splice(
        outerTokens.findLastIndex((token) => token.name == 'startArray'),
        2,
        ...innerArrayTokens
      );

      outerTokens.forEach((jsonToken, index) => {
        fullAssembler.consume(jsonToken);
        // ? Should be done when only one token or if last token
        expect(fullAssembler.done).toBe(!(index < outerTokens.length - 1));
      });

      expect(fullAssembler.done).toBeTrue();
      expect(fullAssembler.current).toStrictEqual({
        ...outerObject,
        e: innerObject,
        f: innerArray
      });
    });

    it('handles complex multiplexed mixture of streamed and packed tokens 2', async () => {
      expect.hasAssertions();
      const fullAssembler = new FullAssembler();

      mixedObjectTokens.forEach(({ name, value }, index) => {
        // ? TypeScript isn't smart enough to figure this out yet
        fullAssembler[name](value!);
        // ? Should be done when only one token or if last token
        expect(fullAssembler.done).toBe(!(index < mixedObjectTokens.length - 1));
      });

      expect(fullAssembler.done).toBeTrue();
      expect(fullAssembler.current).toStrictEqual({
        'a-key': 1234,
        'b-key': 'data',
        'c-key': 9876,
        'd-key': { 'subkey-1': 'streamed', 'subkey-2': 40_556_077 }
      });
    });

    it('functions identically when assembling multiple mutually exclusive values', async () => {
      expect.hasAssertions();

      const fullAssembler = await consumeTokenizedObject(
        new FullAssembler(),
        targetObject
      );

      expect(fullAssembler.done).toBeTrue();
      expect(fullAssembler.current).toStrictEqual(targetObject);

      await consumeTokenizedObject(fullAssembler, targetObject.d);

      expect(fullAssembler.done).toBeTrue();
      expect(fullAssembler.current).toStrictEqual(targetObject.d);

      await consumeTokenizedObject(fullAssembler, targetObject.a, {
        lastValueIsPackedDuplicate: true
      });

      expect(fullAssembler.done).toBeTrue();
      expect(fullAssembler.current).toStrictEqual(targetObject.a);

      await consumeTokenizedObject(fullAssembler, targetObject.b, {
        lastValueIsPackedDuplicate: true
      });

      expect(fullAssembler.done).toBeTrue();
      expect(fullAssembler.current).toStrictEqual(targetObject.b);

      await consumeTokenizedObject(fullAssembler, targetObject.g);

      expect(fullAssembler.done).toBeTrue();
      expect(fullAssembler.current).toStrictEqual(targetObject.g);

      await consumeTokenizedObject(fullAssembler, targetObject.i);

      expect(fullAssembler.done).toBeTrue();
      expect(fullAssembler.current).toStrictEqual(targetObject.i);
    });

    it('reconstructs values split across multiple chunks', async () => {
      expect.hasAssertions();

      const fullAssembler = new FullAssembler();

      objectTokens.forEach((jsonToken) => fullAssembler.consume(jsonToken));

      expect(fullAssembler.done).toBe(true);
      expect(fullAssembler.current).toStrictEqual({ 'a-key': 1234, 'b-key': 'data' });

      stringTokens.forEach((jsonToken) => fullAssembler.consume(jsonToken));

      expect(fullAssembler.done).toBe(true);
      expect(fullAssembler.current).toBe('data');

      numberTokens.forEach((jsonToken) => fullAssembler.consume(jsonToken));

      expect(fullAssembler.done).toBe(true);
      expect(fullAssembler.current).toBe(1234);
    });

    it('redefines all JsonTokenName methods to prevent TypeScript soft errors', async () => {
      expect.hasAssertions();
      const fakeToken: JsonToken = {} as JsonToken;
      const fullAssembler = new FullAssembler();
      // ? TypeScript type check errors will fail lint, thus "failing" this test
      expect(fullAssembler[fakeToken.name]).toBeUndefined();
    });
  });
});

describe('|>pack-entry', () => {
  const expectDownstreamTokens = async (
    tokenQueue: JsonToken[],
    packEntryOptions: Parameters<typeof packEntry>[0],
    expectation: (tokens: JsonToken[]) => Promisable<void>
  ) => {
    await expectDownstreamTokens_(tokenQueue, packEntry(packEntryOptions), expectation);
  };

  describe('::packEntry', () => {
    it('packs packed key token and corresponding simple packed value token into an entry token', async () => {
      expect.hasAssertions();

      const { c: _c, d: _d, e: _e, f: _f, ...target } = targetObject;
      await expectDownstreamTokens(
        await tokenizeObject(target, { streamValues: false, packValues: true }),
        { key: ['a', 'b', 'g', 'h', 'i'] },
        (tokens) => {
          expect(tokens).toIncludeAllMembers<JsonPackedEntryToken>([
            {
              key: 'a',
              matcher: 'a',
              stack: ['a'],
              name: packedEntrySymbol,
              owner: undefined,
              value: targetObject.a
            },
            {
              key: 'b',
              matcher: 'b',
              stack: ['b'],
              name: packedEntrySymbol,
              owner: undefined,
              value: targetObject.b
            },
            {
              key: 'g',
              matcher: 'g',
              stack: ['g'],
              name: packedEntrySymbol,
              owner: undefined,
              value: targetObject.g
            },
            {
              key: 'h',
              matcher: 'h',
              stack: ['h'],
              name: packedEntrySymbol,
              owner: undefined,
              value: targetObject.h
            },
            {
              key: 'i',
              matcher: 'i',
              stack: ['i'],
              name: packedEntrySymbol,
              owner: undefined,
              value: targetObject.i
            }
          ]);
        }
      );
    });

    it('packs streamed key token and corresponding simple streamed value token into an entry token', async () => {
      expect.hasAssertions();

      await expectDownstreamTokens(
        objectTokens,
        { key: ['a-key', 'b-key'] },
        (tokens) => {
          expect(tokens).toIncludeAllMembers<JsonPackedEntryToken>([
            {
              key: 'a-key',
              matcher: 'a-key',
              stack: ['a-key'],
              name: packedEntrySymbol,
              owner: undefined,
              value: 1234
            },
            {
              key: 'b-key',
              matcher: 'b-key',
              stack: ['b-key'],
              name: packedEntrySymbol,
              owner: undefined,
              value: 'data'
            }
          ]);
        }
      );
    });

    it('packs packed key token and corresponding simple streamed value token into an entry token', async () => {
      expect.hasAssertions();

      const { c: _c, d: _d, e: _e, f: _f, ...target } = targetObject;
      await expectDownstreamTokens(
        await tokenizeObject(target, {
          streamValues: true,
          streamKeys: false,
          packValues: false,
          packKeys: true
        }),
        { key: ['a', 'b', 'g', 'h', 'i'] },
        (tokens) => {
          expect(tokens).toIncludeAllMembers<JsonPackedEntryToken>([
            {
              key: 'a',
              matcher: 'a',
              stack: ['a'],
              name: packedEntrySymbol,
              owner: undefined,
              value: targetObject.a
            },
            {
              key: 'b',
              matcher: 'b',
              stack: ['b'],
              name: packedEntrySymbol,
              owner: undefined,
              value: targetObject.b
            },
            {
              key: 'g',
              matcher: 'g',
              stack: ['g'],
              name: packedEntrySymbol,
              owner: undefined,
              value: targetObject.g
            },
            {
              key: 'h',
              matcher: 'h',
              stack: ['h'],
              name: packedEntrySymbol,
              owner: undefined,
              value: targetObject.h
            },
            {
              key: 'i',
              matcher: 'i',
              stack: ['i'],
              name: packedEntrySymbol,
              owner: undefined,
              value: targetObject.i
            }
          ]);
        }
      );
    });

    it('packs streamed key token and corresponding simple packed value token into an entry token', async () => {
      expect.hasAssertions();

      const { c: _c, d: _d, e: _e, f: _f, ...target } = targetObject;
      await expectDownstreamTokens(
        await tokenizeObject(target, {
          streamValues: false,
          streamKeys: true,
          packValues: true,
          packKeys: false
        }),
        { key: ['a', 'b', 'g', 'h', 'i'] },
        (tokens) => {
          expect(tokens).toIncludeAllMembers<JsonPackedEntryToken>([
            {
              key: 'a',
              matcher: 'a',
              stack: ['a'],
              name: packedEntrySymbol,
              owner: undefined,
              value: targetObject.a
            },
            {
              key: 'b',
              matcher: 'b',
              stack: ['b'],
              name: packedEntrySymbol,
              owner: undefined,
              value: targetObject.b
            },
            {
              key: 'g',
              matcher: 'g',
              stack: ['g'],
              name: packedEntrySymbol,
              owner: undefined,
              value: targetObject.g
            },
            {
              key: 'h',
              matcher: 'h',
              stack: ['h'],
              name: packedEntrySymbol,
              owner: undefined,
              value: targetObject.h
            },
            {
              key: 'i',
              matcher: 'i',
              stack: ['i'],
              name: packedEntrySymbol,
              owner: undefined,
              value: targetObject.i
            }
          ]);
        }
      );
    });

    it('packs streamed and packed key token and corresponding simple and complex value tokens into an entry token', async () => {
      expect.hasAssertions();

      await expectDownstreamTokens(
        await tokenizeObject(targetObject, { streamValues: true, packValues: true }),
        { key: [/^\w$/] },
        (tokens) => {
          expect(tokens).toIncludeAllMembers<JsonPackedEntryToken>([
            {
              key: 'a',
              matcher: /^\w$/,
              stack: ['a'],
              name: packedEntrySymbol,
              owner: undefined,
              value: targetObject.a
            },
            {
              key: 'b',
              matcher: /^\w$/,
              stack: ['b'],
              name: packedEntrySymbol,
              owner: undefined,
              value: targetObject.b
            },
            {
              key: 'c',
              matcher: /^\w$/,
              stack: ['c'],
              name: packedEntrySymbol,
              owner: undefined,
              value: targetObject.c
            },
            {
              key: 'd',
              matcher: /^\w$/,
              stack: ['d'],
              name: packedEntrySymbol,
              owner: undefined,
              value: targetObject.d
            },
            {
              key: 'e',
              matcher: /^\w$/,
              stack: ['e'],
              name: packedEntrySymbol,
              owner: undefined,
              value: targetObject.e
            },
            {
              key: 'f',
              matcher: /^\w$/,
              stack: ['f'],
              name: packedEntrySymbol,
              owner: undefined,
              value: targetObject.f
            },
            {
              key: 'g',
              matcher: /^\w$/,
              stack: ['g'],
              name: packedEntrySymbol,
              owner: undefined,
              value: targetObject.g
            },
            {
              key: 'h',
              matcher: /^\w$/,
              stack: ['h'],
              name: packedEntrySymbol,
              owner: undefined,
              value: targetObject.h
            },
            {
              key: 'i',
              matcher: /^\w$/,
              stack: ['i'],
              name: packedEntrySymbol,
              owner: undefined,
              value: targetObject.i
            }
          ]);
        }
      );
    });

    it('packs mixed streamed+packed key tokens and corresponding mixed streamed+packed value tokens', async () => {
      expect.hasAssertions();

      await expectDownstreamTokens(
        mixedObjectTokens,
        { key: [/^([a-c])-key$/, /^d-key.subkey/] },
        (tokens) => {
          expect(tokens).toIncludeAllMembers<JsonPackedEntryToken>([
            {
              key: 'a-key',
              matcher: /^([a-c])-key$/,
              stack: ['a-key'],
              name: packedEntrySymbol,
              owner: undefined,
              value: 1234
            },
            {
              key: 'b-key',
              matcher: /^([a-c])-key$/,
              stack: ['b-key'],
              name: packedEntrySymbol,
              owner: undefined,
              value: 'data'
            },
            {
              key: 'c-key',
              matcher: /^([a-c])-key$/,
              stack: ['c-key'],
              name: packedEntrySymbol,
              owner: undefined,
              value: 9876
            },
            {
              key: 'subkey-1',
              matcher: /^d-key.subkey/,
              stack: ['d-key', 'subkey-1'],
              name: packedEntrySymbol,
              owner: undefined,
              value: 'streamed'
            },
            {
              key: 'subkey-2',
              matcher: /^d-key.subkey/,
              stack: ['d-key', 'subkey-2'],
              name: packedEntrySymbol,
              owner: undefined,
              value: 40_556_077
            }
          ]);
        }
      );
    });

    it('can pack deep keys', async () => {
      expect.hasAssertions();

      const { c, d, e, f } = targetObject;
      await expectDownstreamTokens(
        await tokenizeObject({ c, d, e, f }, { streamValues: false, packValues: true }),
        { key: ['c.bytes', 'd.2.array-type'] },
        (tokens) => {
          expect(tokens).toIncludeAllMembers<JsonPackedEntryToken>([
            {
              key: 'bytes',
              matcher: 'c.bytes',
              stack: ['c', 'bytes'],
              name: packedEntrySymbol,
              owner: undefined,
              value: c.bytes
            },
            {
              key: 'array-type',
              matcher: 'd.2.array-type',
              stack: ['d', 2, 'array-type'],
              name: packedEntrySymbol,
              owner: undefined,
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              value: (d[2] as { 'array-type': JsonValue })['array-type']
            }
          ]);
        }
      );
    });

    it('discards streamed or packed key and value tokens iff discardComponentTokens is true', async () => {
      expect.hasAssertions();

      await expectDownstreamTokens(
        [
          ...objectTokens,
          { name: 'startObject' },
          { name: 'keyValue', value: 'c-key' },
          { name: 'numberValue', value: '1234' },
          { name: 'keyValue', value: 'd-key' },
          { name: 'nullValue' },
          { name: 'endObject' }
        ],
        { key: [/-key$/], discardComponentTokens: true },
        (tokens) => {
          expect(tokens).toStrictEqual([
            { name: 'startObject' },
            {
              key: 'a-key',
              matcher: /-key$/,
              stack: ['a-key'],
              name: packedEntrySymbol,
              owner: undefined,
              value: 1234
            },
            {
              key: 'b-key',
              matcher: /-key$/,
              stack: ['b-key'],
              name: packedEntrySymbol,
              owner: undefined,
              value: 'data'
            },
            { name: 'endObject' },
            { name: 'startObject' },
            {
              key: 'c-key',
              matcher: /-key$/,
              stack: ['c-key'],
              name: packedEntrySymbol,
              owner: undefined,
              value: 1234
            },
            {
              key: 'd-key',
              matcher: /-key$/,
              stack: ['d-key'],
              name: packedEntrySymbol,
              owner: undefined,
              value: null
            },
            { name: 'endObject' }
          ]);
        }
      );
    });

    it('discards streamed+packed key and value tokens iff discardComponentTokens is true', async () => {
      expect.hasAssertions();

      await expectDownstreamTokens(
        mixedObjectTokens,
        { key: [/^([a-c])-key$/, /^d-key.subkey/], discardComponentTokens: true },
        (tokens) => {
          expect(tokens).toStrictEqual([
            { name: 'startObject' },
            {
              key: 'a-key',
              matcher: /^([a-c])-key$/,
              stack: ['a-key'],
              name: packedEntrySymbol,
              owner: undefined,
              value: 1234
            },
            {
              key: 'b-key',
              matcher: /^([a-c])-key$/,
              stack: ['b-key'],
              name: packedEntrySymbol,
              owner: undefined,
              value: 'data'
            },
            {
              key: 'c-key',
              matcher: /^([a-c])-key$/,
              stack: ['c-key'],
              name: packedEntrySymbol,
              owner: undefined,
              value: 9876
            },
            { name: 'keyValue', value: 'd-key' },
            { name: 'startObject' },
            {
              key: 'subkey-1',
              matcher: /^d-key.subkey/,
              stack: ['d-key', 'subkey-1'],
              name: packedEntrySymbol,
              owner: undefined,
              value: 'streamed'
            },
            {
              key: 'subkey-2',
              matcher: /^d-key.subkey/,
              stack: ['d-key', 'subkey-2'],
              name: packedEntrySymbol,
              owner: undefined,
              value: 40_556_077
            },
            { name: 'endObject' },
            { name: 'endObject' }
          ]);
        }
      );
    });

    it('attaches ownerSymbol to entry token', async () => {
      expect.hasAssertions();

      const ownerSymbol1 = Symbol('owner-symbol');
      const ownerSymbol2 = Symbol('owner-symbol');

      await expectDownstreamTokens(
        objectTokens,
        { key: ['a-key'], ownerSymbol: ownerSymbol1 },
        (tokens) => {
          expect(tokens).toIncludeAllMembers<JsonPackedEntryToken>([
            {
              key: 'a-key',
              matcher: 'a-key',
              stack: ['a-key'],
              name: packedEntrySymbol,
              owner: ownerSymbol1,
              value: 1234
            }
          ]);
        }
      );

      await expectDownstreamTokens(
        objectTokens,
        { key: ['a-key'], ownerSymbol: ownerSymbol2 },
        (tokens) => {
          expect(tokens).toIncludeAllMembers<JsonPackedEntryToken>([
            {
              key: 'a-key',
              matcher: 'a-key',
              stack: ['a-key'],
              name: packedEntrySymbol,
              owner: ownerSymbol2,
              value: 1234
            }
          ]);
        }
      );
    });

    it('provided string key is compared against entire key path', async () => {
      expect.hasAssertions();

      const { c } = targetObject;
      await expectDownstreamTokens(
        await tokenizeObject({ c }, { streamValues: false, packValues: true }),
        { key: ['c.b'] },
        async (tokens) => {
          expect(tokens).toStrictEqual(
            await tokenizeObject({ c }, { streamValues: false, packValues: true })
          );
        }
      );
    });

    it('passes through token stream if no key filters provided/match', async () => {
      expect.hasAssertions();

      const { c } = targetObject;
      await expectDownstreamTokens(
        await tokenizeObject({ c }, { streamValues: false, packValues: true }),
        { key: [] },
        async (tokens) => {
          expect(tokens).toStrictEqual(
            await tokenizeObject({ c }, { streamValues: false, packValues: true })
          );
        }
      );
    });

    it('passes through token stream if no key filters provided/match and discardComponentTokens is true', async () => {
      expect.hasAssertions();

      await expectDownstreamTokens(
        await tokenizeObject(targetObject, { streamValues: false, packValues: true }),
        { key: [], discardComponentTokens: true },
        async (tokens) => {
          expect(tokens).toStrictEqual(
            await tokenizeObject(targetObject, { streamValues: false, packValues: true })
          );
        }
      );

      await expectDownstreamTokens(
        await tokenizeObject(targetObject, { streamValues: true, packValues: true }),
        { key: [], discardComponentTokens: true },
        async (tokens) => {
          expect(tokens).toStrictEqual(
            await tokenizeObject(targetObject, { streamValues: true, packValues: true })
          );
        }
      );

      await expectDownstreamTokens(
        await tokenizeObject(targetObject, { streamValues: false, packValues: true }),
        { key: ['c.b'], discardComponentTokens: true },
        async (tokens) => {
          expect(tokens).toStrictEqual(
            await tokenizeObject(targetObject, { streamValues: false, packValues: true })
          );
        }
      );

      await expectDownstreamTokens(
        await tokenizeObject(targetObject, { streamValues: true, packValues: true }),
        { key: ['c.b'], discardComponentTokens: true },
        async (tokens) => {
          expect(tokens).toStrictEqual(
            await tokenizeObject(targetObject, { streamValues: true, packValues: true })
          );
        }
      );
    });

    it('provided regex key is matched against entire key path and can match multiple keys with precedence given to first matching filter', async () => {
      expect.hasAssertions();

      await expectDownstreamTokens(
        mixedObjectTokens,
        { key: [/^\w-key$/, /^d-key.subkey/], discardComponentTokens: true },
        (tokens) => {
          expect(tokens).toStrictEqual([
            { name: 'startObject' },
            {
              key: 'a-key',
              matcher: /^\w-key$/,
              stack: ['a-key'],
              name: packedEntrySymbol,
              owner: undefined,
              value: 1234
            },
            {
              key: 'b-key',
              matcher: /^\w-key$/,
              stack: ['b-key'],
              name: packedEntrySymbol,
              owner: undefined,
              value: 'data'
            },
            {
              key: 'c-key',
              matcher: /^\w-key$/,
              stack: ['c-key'],
              name: packedEntrySymbol,
              owner: undefined,
              value: 9876
            },
            {
              key: 'd-key',
              matcher: /^\w-key$/,
              stack: ['d-key'],
              name: packedEntrySymbol,
              owner: undefined,
              value: { 'subkey-1': 'streamed', 'subkey-2': 40_556_077 }
            },
            { name: 'endObject' }
          ]);
        }
      );
    });

    it('multiple key filters can be provided', async () => {
      expect.hasAssertions();

      await expectDownstreamTokens(
        mixedObjectTokens,
        { key: [/^(a|b)-key$/, 'c', 'd-key'], discardComponentTokens: true },
        (tokens) => {
          expect(tokens).toStrictEqual([
            { name: 'startObject' },
            {
              key: 'a-key',
              matcher: /^(a|b)-key$/,
              stack: ['a-key'],
              name: packedEntrySymbol,
              owner: undefined,
              value: 1234
            },
            {
              key: 'b-key',
              matcher: /^(a|b)-key$/,
              stack: ['b-key'],
              name: packedEntrySymbol,
              owner: undefined,
              value: 'data'
            },
            { name: 'keyValue', value: 'c-key' },
            { name: 'numberValue', value: '9876' },
            {
              key: 'd-key',
              matcher: 'd-key',
              stack: ['d-key'],
              name: packedEntrySymbol,
              owner: undefined,
              value: { 'subkey-1': 'streamed', 'subkey-2': 40_556_077 }
            },
            { name: 'endObject' }
          ]);
        }
      );

      await expectDownstreamTokens(
        mixedObjectTokens,
        { key: ['x', 'y', 'z'] },
        (tokens) => {
          expect(tokens).toStrictEqual(mixedObjectTokens);
        }
      );
    });

    it('singular key filters can be provided', async () => {
      expect.hasAssertions();

      const expectedResult: (JsonToken | JsonPackedEntryToken)[] = [...mixedObjectTokens];

      expectedResult.splice(-1, 0, {
        key: 'd-key',
        matcher: expect.anything(),
        stack: ['d-key'],
        name: packedEntrySymbol,
        owner: undefined,
        value: { 'subkey-1': 'streamed', 'subkey-2': 40_556_077 }
      });

      await expectDownstreamTokens(mixedObjectTokens, { key: [/^d-key$/] }, (tokens) => {
        expect(tokens).toStrictEqual(expectedResult);
      });

      await expectDownstreamTokens(mixedObjectTokens, { key: ['d-key'] }, (tokens) => {
        expect(tokens).toStrictEqual(expectedResult);
      });
    });

    it('respects pathSeparator option', async () => {
      expect.hasAssertions();

      const { c, d, e, f } = targetObject;
      await expectDownstreamTokens(
        await tokenizeObject({ c, d, e, f }, { streamValues: false, packValues: true }),
        { key: ['c->bytes', 'd->2->array-type'], pathSeparator: '->' },
        (tokens) => {
          expect(tokens).toIncludeAllMembers<JsonPackedEntryToken>([
            {
              key: 'bytes',
              matcher: 'c->bytes',
              stack: ['c', 'bytes'],
              name: packedEntrySymbol,
              owner: undefined,
              value: c.bytes
            },
            {
              key: 'array-type',
              matcher: 'd->2->array-type',
              stack: ['d', 2, 'array-type'],
              name: packedEntrySymbol,
              owner: undefined,
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              value: (d[2] as { 'array-type': JsonValue })['array-type']
            }
          ]);
        }
      );
    });

    it('attaches matching filter (key or regex) to entry token', async () => {
      expect.hasAssertions();

      const { c } = targetObject;
      await expectDownstreamTokens(
        await tokenizeObject({ c }, { streamValues: true, packValues: false }),
        { key: ['c|bytes'], pathSeparator: '|' },
        (tokens) => {
          expect(tokens).toIncludeAllMembers<JsonPackedEntryToken>([
            {
              key: 'bytes',
              matcher: 'c|bytes',
              stack: ['c', 'bytes'],
              name: packedEntrySymbol,
              owner: undefined,
              value: c.bytes
            }
          ]);
        }
      );
    });
  });
});
