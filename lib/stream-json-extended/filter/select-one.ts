import { chain } from 'stream-chain';
import { pick } from 'stream-json/filters/Pick';

import { type JsonToken, useDepthTracking } from 'multiverse/stream-json-extended';
import { escapeRegExp } from 'multiverse/stream-json-extended/util/escape-regexp';

import type { TransformOptions } from 'node:stream';
import type { FilterOptions } from 'stream-json/filters/FilterBase';

/**
 * Pick one value out of the stream and discard all others. If the selected
 * value is a non-array object (or primitive), its tokens will be streamed as
 * is. If the selected value is an array, each of its elements will be streamed
 * out one by one (the enclosing array is discarded).
 *
 * Regardless of the type of the selected value, this stream will output object
 * value _tokens_ similar in intent to `StreamValues`.
 */
export function selectOne({
  key,
  escapeKey = true,
  ...transformAndFilterOptions
}: TransformOptions &
  Omit<FilterOptions, 'filter' | 'once'> & { key: string; escapeKey?: true }) {
  const { getDepth, updateDepth } = useDepthTracking();

  return chain(
    [
      pick({
        ...transformAndFilterOptions,
        filter: new RegExp(`^(\\d+\\.)?${escapeKey ? escapeRegExp(key) : key}$`),
        once: true
      }),
      (chunk: JsonToken) => {
        updateDepth(chunk);
        const depth = getDepth();
        return (depth === 1 && chunk.name === 'startArray') ||
          (depth === 0 && chunk.name === 'endArray')
          ? null
          : chunk;
      }
    ],
    { ...transformAndFilterOptions, objectMode: true }
  );
}
