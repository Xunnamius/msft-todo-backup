import assert from 'node:assert';
import type { JsonToken } from 'multiverse/stream-json-extended';

/**
 * An encapsulation of the stack tracking strategy for use when evaluating
 * chunks.
 *
 * `useStackKeyTracking` keeps track of object keys regardless of if they
 * are streamed or packed.
 */
export function useStackKeyTracking() {
  const stack: (string | number | null)[] = [];
  let previousToken: JsonToken | undefined = undefined;
  let keyBuffer: string | undefined = undefined;

  function getStack() {
    return [...stack];
  }

  function getHead(offset = 0) {
    return stack.at(-1 - offset);
  }

  /**
   * Updates the head of the stack.
   *
   * When called in this form, the stack head is incremented by one
   * (representing a "push") only if we're currently evaluating an array and
   * we're enumerating its members.
   */
  function pushHead(options: { incrementIfStackHeadIsArray: boolean }): void;
  /**
   * Updates the head of the stack.
   *
   * When called in this form, `value` will be pushed onto the stack, becoming
   * the new head.
   */
  function pushHead(options: { value: -1 | null }): void;
  function pushHead({
    incrementIfStackHeadIsArray,
    value
  }: {
    incrementIfStackHeadIsArray?: boolean;
    value?: -1 | null;
  }): void {
    if (incrementIfStackHeadIsArray !== undefined) {
      if (incrementIfStackHeadIsArray && typeof getHead() === 'number') {
        (stack[stack.length - 1] as number) += 1;
      }
    } else if (value !== undefined) {
      stack.push(value);
    } else {
      assert.fail();
    }
  }

  /**
   * Updates the head of the stack, replacing it with `value`.
   */
  function setHead({ value }: { value: string }) {
    stack[stack.length - 1] = value;
  }

  /**
   * Removes the head of the stack and returns it. If the stack is empty,
   * `undefined` is returned and the stack is not modified.
   */
  function popHead() {
    return stack.pop();
  }

  function updateStack(currentToken: JsonToken) {
    switch (currentToken.name) {
      case 'startObject':
      case 'startArray':
      case 'startString':
      case 'startNumber':
      case 'nullValue':
      case 'trueValue':
      case 'falseValue': {
        pushHead({ incrementIfStackHeadIsArray: true });
        break;
      }

      case 'keyValue': {
        setHead(currentToken);
        break;
      }

      case 'numberValue': {
        // ? If number values are being streamed AND packed, do not duplicate
        if (previousToken?.name !== 'endNumber') {
          pushHead({ incrementIfStackHeadIsArray: true });
        }
        break;
      }

      case 'stringValue': {
        // ? If number values are being streamed AND packed, do not duplicate
        if (previousToken?.name !== 'endString') {
          pushHead({ incrementIfStackHeadIsArray: true });
        }
        break;
      }
    }

    switch (currentToken.name) {
      case 'startObject': {
        pushHead({ value: null });
        break;
      }

      case 'startArray': {
        pushHead({ value: -1 });
        break;
      }

      case 'startKey': {
        keyBuffer = '';
        break;
      }

      case 'stringChunk': {
        if (keyBuffer !== undefined) {
          keyBuffer += currentToken.value;
        }
        break;
      }

      case 'endKey': {
        assert(keyBuffer !== undefined);
        setHead({ value: keyBuffer });
        keyBuffer = undefined;
        break;
      }

      case 'endObject':
      case 'endArray': {
        popHead();
        break;
      }
    }

    previousToken = currentToken;
  }

  return {
    /**
     * Returns the current object stack. Elements of a stack will have one of
     * the following types:
     *
     *   - `number`. In this case, we are currently evaluating an array, and the
     *     number is the current index.
     *   - `string`. In this case, we are currently evaluating an object entry
     *     (i.e. a key-value pair), and the string is the current key.
     *   - `null`. In this case, we are currently evaluating an object, but none
     *     of its entries have been evaluated yet.
     *
     * `useStackKeyTracking` keeps track of object keys regardless of if they
     * are streamed or packed.
     *
     * For example, for `[{a: 1}, {b: 2}]`, `getStack` will return the
     * following:
     *
     *   - When evaluating the start of the array: `[-1]`
     *   - When evaluating the start of the first element: `[0, null]`
     *   - When evaluating the first entry of the first element: `[0, 'a']`
     *   - When evaluating the end of the first element: `[0]`
     *   - When evaluating the start of the second element: `[1, null]`
     *   - When evaluating the first entry of the second element: `[1, 'b']`
     *   - When evaluating the end of the second element: `[1]`
     *   - When evaluating the end of the array: `[]`
     */
    getStack,
    /**
     * Returns the last element or "head" of the stack. See {@link getStack} for
     * details.
     *
     * This function also accepts an `offset` that will return an array element
     * `offset` elements from the end. For example, `getHead(3)` will return the
     * 4th element from the head of the stack.
     */
    getHead,
    /**
     * Updates the object stack depending on the provided {@link JsonToken}.
     */
    updateStack
  };
}
