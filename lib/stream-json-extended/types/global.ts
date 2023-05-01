import type { JsonValue } from 'type-fest';

export type JsonStreamedKeyTokenName = 'startKey' | 'endKey';

export type JsonStreamedPrimitiveTokenName =
  | 'startString'
  | 'stringChunk'
  | 'endString'
  | 'startNumber'
  | 'numberChunk'
  | 'endNumber';

export type JsonPackedPrimitiveTokenName =
  | 'keyValue'
  | 'nullValue'
  | 'trueValue'
  | 'falseValue'
  | 'stringValue'
  | 'numberValue';

export type JsonStreamedObjectTokenName =
  | 'startObject'
  | 'endObject'
  | 'startArray'
  | 'endArray';

export type JsonTokenName =
  | JsonStreamedObjectTokenName
  | JsonStreamedPrimitiveTokenName
  | JsonPackedPrimitiveTokenName
  | JsonStreamedKeyTokenName;

export type JsonTokenWithValueName =
  | JsonPackedPrimitiveTokenName
  | Extract<JsonTokenName, 'stringChunk'>
  | Extract<JsonTokenName, 'numberChunk'>;

export type JsonTokenWithoutValueName = Exclude<JsonTokenName, JsonTokenWithValueName>;

export type JsonTokenValue = string | true | false | null;

export type JsonToken =
  | {
      name: Exclude<JsonTokenWithValueName, 'nullValue' | 'trueValue' | 'falseValue'>;
      value: string;
    }
  | { name: Extract<JsonTokenWithValueName, 'nullValue'>; value: null }
  | { name: Extract<JsonTokenWithValueName, 'trueValue'>; value: true }
  | { name: Extract<JsonTokenWithValueName, 'falseValue'>; value: false }
  | { name: JsonTokenWithoutValueName; value?: undefined };

export type GenericJsonToken = JsonToken | { name: string | symbol; value?: JsonValue };
