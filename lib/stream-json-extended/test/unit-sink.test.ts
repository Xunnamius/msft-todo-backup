/* eslint-disable unicorn/prevent-abbreviations */
import { Readable } from 'node:stream';
import { isProxy } from 'node:util/types';

import {
  packEntry,
  bigStringParser,
  packedEntrySymbol,
  bigStringStringer,
  FullAssembler,
  sparseEntryKeyStartSymbol,
  sparseEntryKeyEndSymbol,
  sparseEntryValueStartSymbol,
  sparseEntryValueEndSymbol,
  type JsonToken,
  type JsonPackedEntryToken,
  type JsonSparseEntryToken,
  type JsonSparseEntryKeyStartToken,
  type JsonSparseEntryKeyEndToken,
  type JsonSparseEntryValueStartToken,
  type JsonSparseEntryValueEndToken
} from 'multiverse/stream-json-extended';

import { tokenizeObject, feedTokenStream } from 'multiverse/stream-json-extended/util';

import type { DisassemblerOptions } from 'stream-json/Disassembler';
import type { JsonValue } from 'type-fest';

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

const deepObjectTokens: JsonToken[][] = [
  [
    { name: 'startObject' },
    { name: 'keyValue', value: 'a' },
    { name: 'startObject' },
    { name: 'keyValue', value: 'big' },
    { name: 'stringValue', value: 'data' },
    { name: 'keyValue', value: 'b' },
    { name: 'startObject' },
    { name: 'keyValue', value: 'big' },
    { name: 'stringValue', value: 'data' },
    { name: 'keyValue', value: 'c' },
    { name: 'startObject' },
    { name: 'keyValue', value: 'big' },
    { name: 'stringValue', value: 'data' },
    { name: 'keyValue', value: 'd' },
    { name: 'startObject' },
    { name: 'keyValue', value: 'e' },
    { name: 'stringValue', value: 'deep' }
  ],
  [
    { name: 'endObject' },
    { name: 'endObject' },
    { name: 'endObject' },
    { name: 'endObject' },
    { name: 'endObject' }
  ]
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

describe('::bigStringParser', () => {
  it('only streams strings and packs all other values', async () => {
    expect.hasAssertions();

    const { a, b } = targetObject;
    const stream = await Readable.from([JSON.stringify({ a, b })])
      .pipe(bigStringParser())
      .toArray();

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

describe('::bigStringStringer', () => {
  it('only streams strings and packs all other values', async () => {
    expect.hasAssertions();

    const { a, b } = targetObject;
    const stream = (
      await Readable.from([
        { name: 'startObject' },
        { name: 'keyValue', value: 'a' },
        { name: 'numberValue', value: '1' },
        { name: 'keyValue', value: 'b' },
        { name: 'startString' },
        { name: 'stringChunk', value: 'data' },
        { name: 'endString' },
        { name: 'endObject' }
      ])
        .pipe(bigStringStringer())
        .toArray()
    ).map((item) => item.toString('utf8'));

    expect(stream).toStrictEqual([JSON.stringify({ a, b })]);
  });
});

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
      switch (name) {
        case 'keyValue':
        case 'numberChunk':
        case 'stringChunk':
        case 'numberValue':
        case 'stringValue': {
          fullAssembler[name](value);
          break;
        }

        default: {
          fullAssembler[name]();
        }
      }

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

    const fullAssembler = await consumeTokenizedObject(new FullAssembler(), targetObject);

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

    expect(fullAssembler.done).toBeTrue();
    expect(fullAssembler.current).toStrictEqual({ 'a-key': 1234, 'b-key': 'data' });

    stringTokens.forEach((jsonToken) => fullAssembler.consume(jsonToken));

    expect(fullAssembler.done).toBeTrue();
    expect(fullAssembler.current).toBe('data');

    numberTokens.forEach((jsonToken) => fullAssembler.consume(jsonToken));

    expect(fullAssembler.done).toBeTrue();
    expect(fullAssembler.current).toBe(1234);
  });

  it('redefines all JsonTokenName methods to prevent TypeScript soft errors', async () => {
    expect.hasAssertions();
    const fakeToken: JsonToken = {} as JsonToken;
    const fullAssembler = new FullAssembler();
    // ? TypeScript type check errors will fail lint, thus "failing" this test
    expect(fullAssembler[fakeToken.name]).toBeUndefined();
  });

  it('does not store assembled data when operating in sparse mode', async () => {
    expect.hasAssertions();

    const fullAssembler = new FullAssembler({ sparseMode: true });

    deepObjectTokens[0].forEach((jsonToken) => fullAssembler.consume(jsonToken));

    expect(fullAssembler.done).toBeFalse();
    expect(fullAssembler.current).toSatisfy(isProxy);
    expect(fullAssembler.stack).toStrictEqual([
      fullAssembler.current,
      'a',
      fullAssembler.current,
      'b',
      fullAssembler.current,
      'c',
      fullAssembler.current,
      'd'
    ]);

    deepObjectTokens[1].forEach((jsonToken) => fullAssembler.consume(jsonToken));

    expect(fullAssembler.done).toBeTrue();
    expect(fullAssembler.current).toSatisfy(isProxy);
    expect(fullAssembler.stack).toStrictEqual([]);

    stringTokens.forEach((jsonToken) => fullAssembler.consume(jsonToken));

    expect(fullAssembler.done).toBeTrue();
    expect(fullAssembler.current).toSatisfy(isProxy);
    expect(fullAssembler.stack).toStrictEqual([]);

    numberTokens.forEach((jsonToken) => fullAssembler.consume(jsonToken));

    expect(fullAssembler.done).toBeTrue();
    expect(fullAssembler.current).toSatisfy(isProxy);
    expect(fullAssembler.stack).toStrictEqual([]);
  });

  it('triggers "done" in sparse mode at the same points as default', async () => {
    expect.hasAssertions();

    const fullAssembler = await consumeTokenizedObject(
      new FullAssembler({ sparseMode: true }),
      targetObject
    );

    expect(fullAssembler.done).toBeTrue();
    expect(fullAssembler.current).toSatisfy(isProxy);

    await consumeTokenizedObject(fullAssembler, targetObject.d);

    expect(fullAssembler.done).toBeTrue();
    expect(fullAssembler.current).toSatisfy(isProxy);

    await consumeTokenizedObject(fullAssembler, targetObject.a, {
      lastValueIsPackedDuplicate: true
    });

    expect(fullAssembler.done).toBeTrue();
    expect(fullAssembler.current).toSatisfy(isProxy);

    await consumeTokenizedObject(fullAssembler, targetObject.b, {
      lastValueIsPackedDuplicate: true
    });

    expect(fullAssembler.done).toBeTrue();
    expect(fullAssembler.current).toSatisfy(isProxy);

    await consumeTokenizedObject(fullAssembler, targetObject.g);

    expect(fullAssembler.done).toBeTrue();
    expect(fullAssembler.current).toSatisfy(isProxy);

    await consumeTokenizedObject(fullAssembler, targetObject.i);

    expect(fullAssembler.done).toBeTrue();
    expect(fullAssembler.current).toSatisfy(isProxy);
  });
});

describe('::packEntry', () => {
  it('packs packed key token and corresponding simple packed value token into an entry token', async () => {
    expect.hasAssertions();

    const { c: _c, d: _d, e: _e, f: _f, ...target } = targetObject;

    await expect(
      feedTokenStream(
        tokenizeObject(target, { streamValues: false, packValues: true }),
        packEntry({ key: ['a', 'b', 'g', 'h', 'i'] })
      )
    ).resolves.toIncludeAllMembers<JsonPackedEntryToken>([
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
  });

  it('packs streamed key token and corresponding simple streamed value token into an entry token', async () => {
    expect.hasAssertions();

    await expect(
      feedTokenStream(objectTokens, packEntry({ key: ['a-key', 'b-key'] }))
    ).resolves.toIncludeAllMembers<JsonPackedEntryToken>([
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
  });

  it('packs packed key token and corresponding simple streamed value token into an entry token', async () => {
    expect.hasAssertions();

    const { c: _c, d: _d, e: _e, f: _f, ...target } = targetObject;
    await expect(
      feedTokenStream(
        tokenizeObject(target, {
          streamValues: true,
          streamKeys: false,
          packValues: false,
          packKeys: true
        }),
        packEntry({ key: ['a', 'b', 'g', 'h', 'i'] })
      )
    ).resolves.toIncludeAllMembers<JsonPackedEntryToken>([
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
  });

  it('packs streamed key token and corresponding simple packed value token into an entry token', async () => {
    expect.hasAssertions();

    const { c: _c, d: _d, e: _e, f: _f, ...target } = targetObject;
    await expect(
      feedTokenStream(
        tokenizeObject(target, {
          streamValues: false,
          streamKeys: true,
          packValues: true,
          packKeys: false
        }),
        packEntry({ key: ['a', 'b', 'g', 'h', 'i'] })
      )
    ).resolves.toIncludeAllMembers<JsonPackedEntryToken>([
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
  });

  it('packs streamed and packed key token and corresponding simple and complex value tokens into an entry token', async () => {
    expect.hasAssertions();

    await expect(
      feedTokenStream(
        tokenizeObject(targetObject, { streamValues: true, packValues: true }),
        packEntry({ key: [/^\w$/] })
      )
    ).resolves.toIncludeAllMembers<JsonPackedEntryToken>([
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
  });

  it('emits entry token immediately after the final token representing the entry value', async () => {
    expect.hasAssertions();

    const { a, b, e, f, g, h, i } = targetObject;
    await expect(
      feedTokenStream(
        tokenizeObject({ a, b, e, f, g, h, i }, { streamValues: true, packValues: true }),
        packEntry({ key: [/^\w$/] })
      )
    ).resolves.toStrictEqual<(JsonToken | JsonPackedEntryToken)[]>([
      { name: 'startObject' },
      { name: 'startKey' },
      { name: 'stringChunk', value: 'a' },
      { name: 'endKey' },
      { name: 'keyValue', value: 'a' },
      { name: 'startNumber' },
      { name: 'numberChunk', value: '1' },
      { name: 'endNumber' },
      { name: 'numberValue', value: '1' },
      {
        key: 'a',
        matcher: /^\w$/,
        stack: ['a'],
        name: packedEntrySymbol,
        owner: undefined,
        value: a
      },
      { name: 'startKey' },
      { name: 'stringChunk', value: 'b' },
      { name: 'endKey' },
      { name: 'keyValue', value: 'b' },
      { name: 'startString' },
      { name: 'stringChunk', value: 'data' },
      { name: 'endString' },
      { name: 'stringValue', value: 'data' },
      {
        key: 'b',
        matcher: /^\w$/,
        stack: ['b'],
        name: packedEntrySymbol,
        owner: undefined,
        value: b
      },
      { name: 'startKey' },
      { name: 'stringChunk', value: 'e' },
      { name: 'endKey' },
      { name: 'keyValue', value: 'e' },
      { name: 'startObject' },
      { name: 'endObject' },
      {
        key: 'e',
        matcher: /^\w$/,
        stack: ['e'],
        name: packedEntrySymbol,
        owner: undefined,
        value: e
      },
      { name: 'startKey' },
      { name: 'stringChunk', value: 'f' },
      { name: 'endKey' },
      { name: 'keyValue', value: 'f' },
      { name: 'startArray' },
      { name: 'endArray' },
      {
        key: 'f',
        matcher: /^\w$/,
        stack: ['f'],
        name: packedEntrySymbol,
        owner: undefined,
        value: f
      },
      { name: 'startKey' },
      { name: 'stringChunk', value: 'g' },
      { name: 'endKey' },
      { name: 'keyValue', value: 'g' },
      { name: 'trueValue', value: true },
      {
        key: 'g',
        matcher: /^\w$/,
        stack: ['g'],
        name: packedEntrySymbol,
        owner: undefined,
        value: g
      },
      { name: 'startKey' },
      { name: 'stringChunk', value: 'h' },
      { name: 'endKey' },
      { name: 'keyValue', value: 'h' },
      { name: 'falseValue', value: false },
      {
        key: 'h',
        matcher: /^\w$/,
        stack: ['h'],
        name: packedEntrySymbol,
        owner: undefined,
        value: h
      },
      { name: 'startKey' },
      { name: 'stringChunk', value: 'i' },
      { name: 'endKey' },
      { name: 'keyValue', value: 'i' },
      { name: 'nullValue', value: null },
      {
        key: 'i',
        matcher: /^\w$/,
        stack: ['i'],
        name: packedEntrySymbol,
        owner: undefined,
        value: i
      },
      { name: 'endObject' }
    ]);
  });

  it('packs mixed streamed+packed key tokens and corresponding mixed streamed+packed value tokens', async () => {
    expect.hasAssertions();

    await expect(
      feedTokenStream(
        mixedObjectTokens,
        packEntry({ key: [/^([a-c])-key$/, /^d-key.subkey/] })
      )
    ).resolves.toIncludeAllMembers<JsonPackedEntryToken>([
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
  });

  it('can pack deep keys', async () => {
    expect.hasAssertions();

    const { c, d, e, f } = targetObject;
    await expect(
      feedTokenStream(
        tokenizeObject({ c, d, e, f }, { streamValues: false, packValues: true }),
        packEntry({ key: ['c.bytes', 'd.2.array-type'] })
      )
    ).resolves.toIncludeAllMembers<JsonPackedEntryToken>([
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
  });

  it('discards streamed or packed key and value tokens iff discardComponentTokens is true', async () => {
    expect.hasAssertions();

    await expect(
      feedTokenStream(
        [
          ...objectTokens,
          { name: 'startObject' },
          { name: 'keyValue', value: 'c-key' },
          { name: 'numberValue', value: '1234' },
          { name: 'keyValue', value: 'd-key' },
          { name: 'nullValue', value: null },
          { name: 'endObject' }
        ],
        packEntry({ key: [/-key$/], discardComponentTokens: true })
      )
    ).resolves.toStrictEqual([
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
  });

  it('discards streamed+packed key and value tokens iff discardComponentTokens is true', async () => {
    expect.hasAssertions();

    await expect(
      feedTokenStream(
        mixedObjectTokens,
        packEntry({
          key: [/^([a-c])-key$/, /^d-key.subkey/],
          discardComponentTokens: true
        })
      )
    ).resolves.toStrictEqual([
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
  });

  it('attaches ownerSymbol to entry token', async () => {
    expect.hasAssertions();

    const ownerSymbol1 = Symbol('owner-symbol');
    const ownerSymbol2 = Symbol('owner-symbol');

    await expect(
      feedTokenStream(
        objectTokens,
        packEntry({ key: ['a-key'], ownerSymbol: ownerSymbol1 })
      )
    ).resolves.toIncludeAllMembers<JsonPackedEntryToken>([
      {
        key: 'a-key',
        matcher: 'a-key',
        stack: ['a-key'],
        name: packedEntrySymbol,
        owner: ownerSymbol1,
        value: 1234
      }
    ]);

    await expect(
      feedTokenStream(
        objectTokens,
        packEntry({ key: ['a-key'], ownerSymbol: ownerSymbol2 })
      )
    ).resolves.toIncludeAllMembers<JsonPackedEntryToken>([
      {
        key: 'a-key',
        matcher: 'a-key',
        stack: ['a-key'],
        name: packedEntrySymbol,
        owner: ownerSymbol2,
        value: 1234
      }
    ]);
  });

  it('provided string key is compared against entire key path', async () => {
    expect.hasAssertions();

    const { c } = targetObject;
    await expect(
      feedTokenStream(
        tokenizeObject({ c }, { streamValues: false, packValues: true }),
        packEntry({ key: ['c.b'] })
      )
    ).resolves.toStrictEqual(
      await tokenizeObject({ c }, { streamValues: false, packValues: true })
    );
  });

  it('passes through token stream if no key filters provided/match', async () => {
    expect.hasAssertions();

    const { c } = targetObject;
    await expect(
      feedTokenStream(
        tokenizeObject({ c }, { streamValues: false, packValues: true }),
        packEntry({ key: [] })
      )
    ).resolves.toStrictEqual(
      await tokenizeObject({ c }, { streamValues: false, packValues: true })
    );
  });

  it('passes through token stream if no key filters provided/match and discardComponentTokens is true', async () => {
    expect.hasAssertions();

    await expect(
      feedTokenStream(
        tokenizeObject(targetObject, { streamValues: false, packValues: true }),
        packEntry({ key: [], discardComponentTokens: true })
      )
    ).resolves.toStrictEqual(
      await tokenizeObject(targetObject, { streamValues: false, packValues: true })
    );

    await expect(
      feedTokenStream(
        tokenizeObject(targetObject, { streamValues: true, packValues: true }),
        packEntry({ key: [], discardComponentTokens: true })
      )
    ).resolves.toStrictEqual(
      await tokenizeObject(targetObject, { streamValues: true, packValues: true })
    );

    await expect(
      feedTokenStream(
        tokenizeObject(targetObject, { streamValues: false, packValues: true }),
        packEntry({ key: ['c.b'], discardComponentTokens: true })
      )
    ).resolves.toStrictEqual(
      await tokenizeObject(targetObject, { streamValues: false, packValues: true })
    );

    await expect(
      feedTokenStream(
        tokenizeObject(targetObject, { streamValues: true, packValues: true }),
        packEntry({ key: ['c.b'], discardComponentTokens: true })
      )
    ).resolves.toStrictEqual(
      await tokenizeObject(targetObject, { streamValues: true, packValues: true })
    );
  });

  it('provided regex key is matched against entire key path and can match multiple keys with precedence given to first matching filter', async () => {
    expect.hasAssertions();

    await expect(
      feedTokenStream(
        mixedObjectTokens,
        packEntry({ key: [/^\w-key$/, /^d-key.subkey/], discardComponentTokens: true })
      )
    ).resolves.toStrictEqual([
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
  });

  it('multiple key filters can be provided', async () => {
    expect.hasAssertions();

    await expect(
      feedTokenStream(
        mixedObjectTokens,
        packEntry({ key: [/^(a|b)-key$/, 'c', 'd-key'], discardComponentTokens: true })
      )
    ).resolves.toStrictEqual([
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

    await expect(
      feedTokenStream(mixedObjectTokens, packEntry({ key: ['x', 'y', 'z'] }))
    ).resolves.toStrictEqual(mixedObjectTokens);
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

    await expect(
      feedTokenStream(mixedObjectTokens, packEntry({ key: [/^d-key$/] }))
    ).resolves.toStrictEqual(expectedResult);

    await expect(
      feedTokenStream(mixedObjectTokens, packEntry({ key: ['d-key'] }))
    ).resolves.toStrictEqual(expectedResult);
  });

  it('respects pathSeparator option', async () => {
    expect.hasAssertions();

    const { c, d, e, f } = targetObject;
    const tokens = await feedTokenStream(
      tokenizeObject({ c, d, e, f }, { streamValues: false, packValues: true }),
      packEntry({ key: ['c->bytes', 'd->2->array-type'], pathSeparator: '->' })
    );

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
  });

  it('attaches matching filter (key or regex) to entry token', async () => {
    expect.hasAssertions();

    const { c } = targetObject;

    await expect(
      feedTokenStream(
        tokenizeObject({ c }, { streamValues: true, packValues: false }),
        packEntry({ key: ['c|bytes'], pathSeparator: '|' })
      )
    ).resolves.toIncludeAllMembers<JsonPackedEntryToken>([
      {
        key: 'bytes',
        matcher: 'c|bytes',
        stack: ['c', 'bytes'],
        name: packedEntrySymbol,
        owner: undefined,
        value: c.bytes
      }
    ]);
  });

  it('inserts sparse entry tokens at the appropriate points in the stream when operating in sparse mode', async () => {
    expect.hasAssertions();

    const sparseObject = { a: { value: 1 }, b: { value: 2 }, c: { value: 3 } };
    const owner = Symbol('owner');
    const baseSparseToken = {
      key: 'b',
      matcher: 'b',
      owner,
      stack: ['b']
    };

    await expect(
      feedTokenStream(
        tokenizeObject(sparseObject, { streamValues: false }),
        packEntry({ key: 'b', sparseMode: true, ownerSymbol: owner })
      )
    ).resolves.toStrictEqual<(JsonToken | JsonSparseEntryToken)[]>([
      { name: 'startObject' },
      { name: 'keyValue', value: 'a' },
      { name: 'startObject' },
      { name: 'keyValue', value: 'value' },
      { name: 'numberValue', value: '1' },
      { name: 'endObject' },
      {
        name: sparseEntryKeyStartSymbol,
        ...baseSparseToken
      } satisfies JsonSparseEntryKeyStartToken,
      { name: 'keyValue', value: 'b' },
      {
        name: sparseEntryKeyEndSymbol,
        ...baseSparseToken
      } satisfies JsonSparseEntryKeyEndToken,
      {
        name: sparseEntryValueStartSymbol,
        ...baseSparseToken
      } satisfies JsonSparseEntryValueStartToken,
      { name: 'startObject' },
      { name: 'keyValue', value: 'value' },
      { name: 'numberValue', value: '2' },
      { name: 'endObject' },
      {
        name: sparseEntryValueEndSymbol,
        ...baseSparseToken
      } satisfies JsonSparseEntryValueEndToken,
      { name: 'keyValue', value: 'c' },
      { name: 'startObject' },
      { name: 'keyValue', value: 'value' },
      { name: 'numberValue', value: '3' },
      { name: 'endObject' },
      { name: 'endObject' }
    ]);
  });

  it('respects discardComponentTokens when operating in sparse mode', async () => {
    expect.hasAssertions();

    const sparseObject = { b: { value: 2 } };
    const owner = Symbol('owner');
    const baseSparseToken = {
      key: 'b',
      matcher: 'b',
      owner,
      stack: ['b']
    };

    await expect(
      feedTokenStream(
        tokenizeObject(sparseObject, { streamValues: false }),
        packEntry({
          key: 'b',
          sparseMode: true,
          discardComponentTokens: true,
          ownerSymbol: owner
        })
      )
    ).resolves.toStrictEqual<(JsonToken | JsonSparseEntryToken)[]>([
      { name: 'startObject' },
      {
        name: sparseEntryKeyStartSymbol,
        ...baseSparseToken
      } satisfies JsonSparseEntryKeyStartToken,
      {
        name: sparseEntryKeyEndSymbol,
        ...baseSparseToken
      } satisfies JsonSparseEntryKeyEndToken,
      {
        name: sparseEntryValueStartSymbol,
        ...baseSparseToken
      } satisfies JsonSparseEntryValueStartToken,
      {
        name: sparseEntryValueEndSymbol,
        ...baseSparseToken
      } satisfies JsonSparseEntryValueEndToken,
      { name: 'endObject' }
    ]);
  });

  it('streams complex token stream in the correct order when operating in sparse mode and discardComponentTokens is true', async () => {
    expect.hasAssertions();

    const baseSparseToken = {
      key: 'a',
      matcher: '0.a',
      owner: undefined,
      stack: [0, 'a']
    };

    const targetObjects = [
      { a: 1, b: 'two', c: 3, d: false },
      { a: 1, b: 2, c: 3, d: true },
      { b: 2, c: 3, d: null },
      { a: 'one', b: [{ a: 1, b: 'two', c: 3, d: false }] },
      { b: { a: 1 }, c: { d: false } }
    ] as const;

    const expectedTokens: (JsonToken | JsonSparseEntryToken)[] = await tokenizeObject(
      targetObjects.map((obj, index) => {
        if (index === 0) {
          const { a: _, ...result } = obj as { a: unknown };
          return result;
        } else {
          return obj;
        }
      })
    );

    expectedTokens.splice(
      2,
      0,
      {
        name: sparseEntryKeyStartSymbol,
        ...baseSparseToken
      } satisfies JsonSparseEntryKeyStartToken,
      {
        name: sparseEntryKeyEndSymbol,
        ...baseSparseToken
      } satisfies JsonSparseEntryKeyEndToken,
      {
        name: sparseEntryValueStartSymbol,
        ...baseSparseToken
      } satisfies JsonSparseEntryValueStartToken,
      {
        name: sparseEntryValueEndSymbol,
        ...baseSparseToken
      } satisfies JsonSparseEntryValueEndToken
    );

    await expect(
      feedTokenStream(
        tokenizeObject(targetObjects),
        packEntry({
          key: '0.a',
          sparseMode: true,
          discardComponentTokens: true
        })
      )
    ).resolves.toStrictEqual(expectedTokens);
  });
});
