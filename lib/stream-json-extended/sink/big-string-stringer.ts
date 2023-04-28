import { stringer } from 'stream-json/Stringer';

/**
 * A pre-configured {@link stringer} that consumes a stream of corresponding
 * {@link JsonToken}s and produces JSON text.
 *
 * Unlike {@link stringer}, `bigStringStringer` will always consume packed
 * values for keys and numbers but never for strings, which must always be
 * streamed in chunks. This is useful for stringifying massive JSON files that
 * might contain huge string values.
 *
 * See https://github.com/uhop/stream-json/wiki/Stringer for more details.
 */
export function bigStringStringer(parserOptions?: Parameters<typeof stringer>[0]) {
  return stringer({
    useValues: true,
    useStringValues: false,
    ...parserOptions
  });
}
