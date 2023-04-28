import Assembler, { type AssemblerOptions } from 'stream-json/Assembler';

import type { JsonToken, JsonTokenName } from 'multiverse/stream-json-extended';
import type { AnyFunction } from '@xunnamius/types';

/**
 * Options used to configure {@link FullAssembler}.
 */
export type FullAssemblerOptions = AssemblerOptions & {
  /**
   * If `true`, `FullAssembler` will "assemble" the tokens it consumes, keeping
   * track of the `depth`, `stack`, `path`, `key`, and `done`, but `current`
   * will always be black hole Proxy and non-key token value data will never be
   * stored. This implies that `stack` will be full of `[Proxy, key]` pairs.
   *
   * This mode is intended for use by higher level {@link JsonToken} consumers
   * that wish to borrow the core token assembly algorithm (specifically,
   * tracking of the "done" state) without actually assembling the entry, which
   * could have negative implications for memory usage when assembling large
   * values.
   *
   * @default false
   */
  sparseMode?: boolean;
};

/**
 * The {@link JsonTokenName}s that require further assembly by
 * {@link FullAssembler}.
 */
export type JsonStreamedAssembledTokenName = Extract<
  JsonTokenName,
  'keyValue' | 'numberValue' | 'stringValue'
>;

type EmptyAssemblerMethod = () => void;
type ParameterizedAssemblerMethod = (value: string) => void;

/**
 * An extension of {@link Assembler} that, unlike the superclass, handles _all_
 * streamed and packed token types.
 *
 * See https://github.com/uhop/stream-json/wiki/Assembler for details.
 */
export class FullAssembler extends Assembler {
  // ? Tracks the previously assembled token name but only if it was streamed
  protected previouslyAssembledStreamedToken: JsonStreamedAssembledTokenName | undefined =
    undefined;
  protected assembledString = '';
  protected wasDone = true;

  protected startObject: EmptyAssemblerMethod;
  protected endObject: EmptyAssemblerMethod;
  protected startArray: EmptyAssemblerMethod;
  protected endArray: EmptyAssemblerMethod;
  protected startNumber: EmptyAssemblerMethod;
  protected startString: EmptyAssemblerMethod;
  protected startKey: EmptyAssemblerMethod;
  protected numberChunk: ParameterizedAssemblerMethod;
  protected stringChunk: ParameterizedAssemblerMethod;
  protected endNumber: EmptyAssemblerMethod;
  protected endString: EmptyAssemblerMethod;
  protected endKey: EmptyAssemblerMethod;
  protected numberValue: ParameterizedAssemblerMethod;
  protected stringValue: ParameterizedAssemblerMethod;
  protected keyValue: ParameterizedAssemblerMethod;
  protected nullValue: EmptyAssemblerMethod;
  protected trueValue: EmptyAssemblerMethod;
  protected falseValue: EmptyAssemblerMethod;

  constructor(options?: FullAssemblerOptions) {
    const { sparseMode, ...assemblerOptions } = options || {};
    super(assemblerOptions);

    this.startNumber = withPreviousTokenTracking.call(this, beginAssemblingToken);
    this.startString = withPreviousTokenTracking.call(this, beginAssemblingToken);
    this.startKey = withPreviousTokenTracking.call(this, beginAssemblingToken);

    this.numberChunk = withPreviousTokenTracking.call(this, appendToAssembledString);
    this.stringChunk = withPreviousTokenTracking.call(this, appendToAssembledString);

    this.endNumber = finalizeAssembledToken.bind(this, 'numberValue');
    this.endString = finalizeAssembledToken.bind(this, 'stringValue');
    this.endKey = finalizeAssembledToken.bind(this, 'keyValue');

    this.numberValue = withPreviousTokenTracking.call(
      this,
      skipMethodCallIfPreviouslyAssembled.bind(
        this,
        //@ts-expect-error: @types package is missing some superclass methods
        super.numberValue.bind(this),
        'numberValue'
      )
    );

    this.stringValue = withPreviousTokenTracking.call(
      this,
      skipMethodCallIfPreviouslyAssembled.bind(
        this,
        //@ts-expect-error: @types package is missing some superclass methods
        super.stringValue.bind(this),
        'stringValue'
      )
    );

    this.keyValue = withPreviousTokenTracking.call(
      this,
      skipMethodCallIfPreviouslyAssembled.bind(
        this,
        //@ts-expect-error: @types package is missing some superclass methods
        super.keyValue.bind(this),
        'keyValue'
      )
    );

    //@ts-expect-error: @types package is missing some superclass methods
    this.startObject = withPreviousTokenTracking.call(this, super.startObject);
    //@ts-expect-error: @types package is missing some superclass methods
    this.endObject = withPreviousTokenTracking.call(this, super.endObject);
    //@ts-expect-error: @types package is missing some superclass methods
    this.startArray = withPreviousTokenTracking.call(this, super.startArray);
    //@ts-expect-error: @types package is missing some superclass methods
    this.endArray = withPreviousTokenTracking.call(this, super.endArray);
    //@ts-expect-error: @types package is missing some superclass methods
    this.nullValue = withPreviousTokenTracking.call(this, super.nullValue);
    //@ts-expect-error: @types package is missing some superclass methods
    this.trueValue = withPreviousTokenTracking.call(this, super.trueValue);
    //@ts-expect-error: @types package is missing some superclass methods
    this.falseValue = withPreviousTokenTracking.call(this, super.falseValue);

    if (sparseMode) {
      const proxy = new Proxy(
        {},
        {
          get(_target, _key) {
            return null;
          },
          set(_target, _key, _value) {
            return true;
          }
        }
      );

      Object.defineProperty(this, 'current', {
        get() {
          return proxy;
        },
        set(value) {
          // * Ain't Nobody Here But Us Chickens
          void value;
        },
        enumerable: true,
        configurable: true
      });
    }
  }

  // @ts-expect-error: @types package is suboptimal
  public override consume(chunk: JsonToken) {
    // @ts-expect-error: @types package is suboptimal
    return super.consume(chunk);
  }
}

function beginAssemblingToken(this: FullAssembler) {
  this.wasDone = this.done;
  // ? This is required because the @types package is broken.
  (this.done as boolean) = false;
}

function appendToAssembledString(this: FullAssembler, value: string) {
  this.assembledString += value;
}

function finalizeAssembledToken(
  this: FullAssembler,
  method: JsonStreamedAssembledTokenName
) {
  // ? This is required because the @types package is broken.
  // ? Also, this is required to be done BEFORE calling the appropriate method.
  (this.done as boolean) = this.wasDone;

  this[method](this.assembledString);
  this.previouslyAssembledStreamedToken = method;
  this.assembledString = '';
}

function skipMethodCallIfPreviouslyAssembled(
  this: FullAssembler,
  superMethod: ParameterizedAssemblerMethod,
  superMethodName: JsonStreamedAssembledTokenName,
  value: string
) {
  if (this.previouslyAssembledStreamedToken !== superMethodName) {
    superMethod(value);
  }
}

function withPreviousTokenTracking<T extends AnyFunction>(this: FullAssembler, fn: T) {
  return (...parameters: Parameters<T>) => {
    fn.apply(this, parameters);
    // ? This prevents pipelines made of streams with mixed configs (e.g. some
    // ? packed, some streamed, some both) from causing duplicates or misses.
    this.previouslyAssembledStreamedToken = undefined;
  };
}
