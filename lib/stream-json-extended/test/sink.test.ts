import { disassembler, type DisassemblerOptions } from 'stream-json/Disassembler';
import { chain } from 'stream-chain';
import { Readable, Writable } from 'node:stream';

import { bigStringParser } from 'multiverse/stream-json-extended';
import { packEntry } from 'multiverse/stream-json-extended';
import { FullAssembler, type JsonToken } from 'multiverse/stream-json-extended';

import type { JsonValue } from 'type-fest';

function tokenizeObject(object: JsonValue, disassemblerOptions?: DisassemblerOptions) {
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

describe('|>big-string-parser', () => {
  describe('::bigStringParser', () => {
    it('todo', async () => {
      expect.hasAssertions();
    });
  });
});

describe('|>full-assembler', () => {
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

  describe('::FullAssembler', () => {
    async function consumeTokenizedObject(
      assembler: FullAssembler,
      object: JsonValue,
      disassemblerOptions?: DisassemblerOptions & { lastValueIsPackedDuplicate?: boolean }
    ) {
      const tokens: JsonToken[] = await tokenizeObject(object, disassemblerOptions);
      tokens.map((jsonToken, index) => {
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

    it('handles complex multiplexed mixture of streamed and packed tokens', async () => {
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

      outerTokens.map((jsonToken, index) => {
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

      objectTokens.map((jsonToken) => fullAssembler.consume(jsonToken));

      expect(fullAssembler.done).toBe(true);
      expect(fullAssembler.current).toStrictEqual({ 'a-key': 1234, 'b-key': 'data' });

      stringTokens.map((jsonToken) => fullAssembler.consume(jsonToken));

      expect(fullAssembler.done).toBe(true);
      expect(fullAssembler.current).toBe('data');

      numberTokens.map((jsonToken) => fullAssembler.consume(jsonToken));

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
  describe('::packEntry', () => {
    it('todo', async () => {
      expect.hasAssertions();
    });
  });
});
