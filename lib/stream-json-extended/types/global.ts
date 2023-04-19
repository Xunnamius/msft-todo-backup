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
  | Extract<JsonTokenName, 'keyValue'>
  | Extract<JsonTokenName, 'stringValue'>
  | Extract<JsonTokenName, 'numberValue'>
  | Extract<JsonTokenName, 'stringChunk'>
  | Extract<JsonTokenName, 'numberChunk'>;

export type JsonTokenWithoutValueName = Exclude<JsonTokenName, JsonTokenWithValueName>;

export type JsonTokenValue = string;

export type JsonToken =
  | { name: JsonTokenWithValueName; value: JsonTokenValue }
  | { name: JsonTokenWithoutValueName; value?: undefined };
