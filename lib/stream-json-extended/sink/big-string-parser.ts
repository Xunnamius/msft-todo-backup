import { parser } from 'stream-json';

/**
 * A pre-configured {@link parser} that consumes JSON text and produces a stream
 * of corresponding {@link JsonToken}s.
 *
 * Unlike {@link parser}, `bigStringParser` will always produce packed values
 * for keys and numbers but never for strings, which will always be streamed in
 * chunks. This is useful for processing massive JSON files that might contain
 * huge string values.
 *
 * See https://github.com/uhop/stream-json/wiki/Parser for more details.
 */
export function bigStringParser() {
  return parser({
    streamValues: false,
    streamStrings: true,
    packValues: true,
    packStrings: false
  });
}
