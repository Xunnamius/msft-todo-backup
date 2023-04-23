import {
  type JsonToken,
  useDepthTracking,
  useStackKeyTracking
} from 'multiverse/stream-json-extended';

describe('|>depth-tracking', () => {
  describe('::useDepthTracking', () => {
    it('tracks depth with respect to current token', async () => {
      expect.hasAssertions();

      const tokensAndDepth: [token: JsonToken | undefined, depth: number][] = [
        [undefined, 0],
        [{ name: 'startObject' }, 1],
        [{ name: 'startKey' }, 1],
        [{ name: 'stringChunk', value: 'a' }, 1],
        [{ name: 'stringChunk', value: '-' }, 1],
        [{ name: 'stringChunk', value: 'k' }, 1],
        [{ name: 'stringChunk', value: 'e' }, 1],
        [{ name: 'stringChunk', value: 'y' }, 1],
        [{ name: 'endKey' }, 1],
        [{ name: 'startNumber' }, 1],
        [{ name: 'numberChunk', value: '1' }, 1],
        [{ name: 'numberChunk', value: '2' }, 1],
        [{ name: 'numberChunk', value: '3' }, 1],
        [{ name: 'numberChunk', value: '4' }, 1],
        [{ name: 'endNumber' }, 1],
        [{ name: 'startKey' }, 1],
        [{ name: 'stringChunk', value: 'b' }, 1],
        [{ name: 'stringChunk', value: '-' }, 1],
        [{ name: 'stringChunk', value: 'k' }, 1],
        [{ name: 'stringChunk', value: 'e' }, 1],
        [{ name: 'stringChunk', value: 'y' }, 1],
        [{ name: 'endKey' }, 1],
        [{ name: 'startString' }, 1],
        [{ name: 'stringChunk', value: 'd' }, 1],
        [{ name: 'stringChunk', value: 'a' }, 1],
        [{ name: 'stringChunk', value: 't' }, 1],
        [{ name: 'stringChunk', value: 'a' }, 1],
        [{ name: 'endString' }, 1],
        [{ name: 'endObject' }, 0],
        [{ name: 'nullValue', value: null }, 0],
        [{ name: 'stringValue', value: 'string' }, 0],
        [{ name: 'numberValue', value: 'number' }, 0],
        [{ name: 'keyValue', value: 'free-floating key' }, 0],
        [{ name: 'trueValue', value: true }, 0],
        [{ name: 'falseValue', value: false }, 0],
        [{ name: 'startArray' }, 1],
        [{ name: 'startObject' }, 2],
        [{ name: 'keyValue', value: 'a-key' }, 2],
        [{ name: 'startArray' }, 3],
        [{ name: 'startObject' }, 4],
        [{ name: 'keyValue', value: 'b-key' }, 4],
        [{ name: 'stringValue', value: 'string' }, 4],
        [{ name: 'endObject' }, 3],
        [{ name: 'endArray' }, 2],
        [{ name: 'endObject' }, 1],
        [{ name: 'endArray' }, 0],
        [undefined, 0]
      ];

      const { getDepth, updateDepth } = useDepthTracking();

      tokensAndDepth.forEach(([token, depth]) => {
        if (token) updateDepth(token);
        expect(getDepth()).toBe(depth);
      });
    });
  });
});

describe('|>stack-tracking', () => {
  describe('::useStackKeyTracking', () => {
    it('tracks stack key path with respect to current token', async () => {
      expect.hasAssertions();

      const tokensAndDepth: [
        token: JsonToken | undefined,
        stack: (string | number | null)[]
      ][] = [
        [undefined, []],
        [{ name: 'startObject' }, [null]],
        [{ name: 'startKey' }, [null]],
        [{ name: 'stringChunk', value: 'a' }, [null]],
        [{ name: 'stringChunk', value: '-' }, [null]],
        [{ name: 'stringChunk', value: 'k' }, [null]],
        [{ name: 'stringChunk', value: 'e' }, [null]],
        [{ name: 'stringChunk', value: 'y' }, [null]],
        [{ name: 'endKey' }, ['a-key']],
        [{ name: 'startNumber' }, ['a-key']],
        [{ name: 'numberChunk', value: '1' }, ['a-key']],
        [{ name: 'numberChunk', value: '2' }, ['a-key']],
        [{ name: 'numberChunk', value: '3' }, ['a-key']],
        [{ name: 'numberChunk', value: '4' }, ['a-key']],
        [{ name: 'endNumber' }, ['a-key']],
        [{ name: 'startKey' }, ['a-key']],
        [{ name: 'stringChunk', value: 'b' }, ['a-key']],
        [{ name: 'stringChunk', value: '-' }, ['a-key']],
        [{ name: 'stringChunk', value: 'k' }, ['a-key']],
        [{ name: 'stringChunk', value: 'e' }, ['a-key']],
        [{ name: 'stringChunk', value: 'y' }, ['a-key']],
        [{ name: 'endKey' }, ['b-key']],
        [{ name: 'startString' }, ['b-key']],
        [{ name: 'stringChunk', value: 'd' }, ['b-key']],
        [{ name: 'stringChunk', value: 'a' }, ['b-key']],
        [{ name: 'stringChunk', value: 't' }, ['b-key']],
        [{ name: 'stringChunk', value: 'a' }, ['b-key']],
        [{ name: 'endString' }, ['b-key']],
        [{ name: 'endObject' }, []],
        [{ name: 'nullValue', value: null }, []],
        [{ name: 'stringValue', value: 'string' }, []],
        [{ name: 'numberValue', value: 'number' }, []],
        [{ name: 'keyValue', value: 'free-floating key' }, []],
        [{ name: 'trueValue', value: true }, []],
        [{ name: 'falseValue', value: false }, []],
        [{ name: 'startArray' }, [-1]],
        [{ name: 'startObject' }, [0, null]],
        [{ name: 'keyValue', value: 'a-key' }, [0, 'a-key']],
        [{ name: 'startArray' }, [0, 'a-key', -1]],
        [{ name: 'startObject' }, [0, 'a-key', 0, null]],
        [{ name: 'keyValue', value: 'b-key' }, [0, 'a-key', 0, 'b-key']],
        [{ name: 'stringValue', value: 'string' }, [0, 'a-key', 0, 'b-key']],
        [{ name: 'endObject' }, [0, 'a-key', 0]],
        [{ name: 'stringValue', value: 'string' }, [0, 'a-key', 1]],
        [{ name: 'numberValue', value: 'number' }, [0, 'a-key', 2]],
        [{ name: 'endArray' }, [0, 'a-key']],
        [{ name: 'endObject' }, [0]],
        [{ name: 'endArray' }, []],
        [undefined, []]
      ];

      const { getStack, getHead, updateStack } = useStackKeyTracking();

      tokensAndDepth.forEach(([token, stack]) => {
        if (token) updateStack(token);
        expect(getStack()).toStrictEqual(stack);
        expect(getHead()).toBe(stack.at(-1));
      });
    });
  });
});
