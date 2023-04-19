import type { JsonToken } from 'multiverse/stream-json-extended';

/**
 * An encapsulation of the depth tracking strategy for use when evaluating
 * chunks.
 */
export function useDepthTracking() {
  let depth = 0;

  return {
    /**
     * Returns the current object depth. It is 0 for top-level objects.
     *
     * For example, for `[{a: 1}]` when assembling `1`, the depth will be `2`.
     */
    getDepth() {
      return depth;
    },
    /**
     * Updates the object depth depending on the provided {@link JsonToken}.
     */
    updateDepth(jsonToken: JsonToken) {
      switch (jsonToken.name) {
        case 'startObject':
        case 'startArray': {
          depth += 1;
          break;
        }

        case 'endObject':
        case 'endArray': {
          depth -= 1;
          break;
        }
      }
    }
  };
}
