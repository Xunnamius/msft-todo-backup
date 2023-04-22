import { PassThrough, Transform } from 'node:stream';

import { injectEntry, objectSieve, selectOne } from 'multiverse/stream-json-extended';

import {
  expectDownstreamTokens,
  tokenizeObject,
  streamTokens
} from 'multiverse/stream-json-extended/test/setup';

describe('|>inject-entry', () => {
  describe('::injectEntry', () => {
    it.only('injects a stream of tokens at the end of each object', async () => {
      expect.hasAssertions();

      const targetObjects = [
        { name: 'object-1' },
        { name: 'object-2' },
        { name: 'object-3' },
        { name: 'object-4' },
        { name: 'object-5' }
      ];

      const injectedArray = ['child-1', { name: 'child-2' }, 3, false];

      await expectDownstreamTokens(
        (await tokenizeObject(targetObjects)).slice(1, -1),
        injectEntry({
          entry: {
            key: 'children',
            valueTokenStream: streamTokens(await tokenizeObject(injectedArray))
          }
        }),
        async (tokens) => {
          expect(tokens).toStrictEqual(
            (
              await tokenizeObject(
                targetObjects.map((obj) => {
                  return { ...obj, children: injectedArray };
                })
              )
            ).slice(1, -1)
          );
        }
      );
    });

    it('handles deep injections into complex objects and objects within arrays', async () => {
      expect.hasAssertions();
    });

    it('handles downstream backpressure', async () => {
      expect.hasAssertions();
    });

    it('handles backpressure from value token stream', async () => {
      expect.hasAssertions();
    });

    it('handles errors from value token stream', async () => {
      expect.hasAssertions();
    });

    it('excludes the injection key if it exists unless autoIgnoreInjectionKey is false', async () => {
      expect.hasAssertions();
    });
  });
});

describe('|>object-sieve', () => {
  describe('::objectSieve', () => {
    it('todo', async () => {
      expect.hasAssertions();
    });
  });
});

describe('|>omit-entry', () => {
  describe('::omitEntry', () => {
    it('todo', async () => {
      expect.hasAssertions();
    });
  });
});

describe('|>select-one', () => {
  describe('::selectOne', () => {
    it('todo', async () => {
      expect.hasAssertions();
    });
  });
});
