import Assembler, { type AssemblerOptions } from 'stream-json/Assembler';

import type { JsonToken, JsonTokenName } from 'multiverse/stream-json-extended';

/**
 * Options used to configure {@link FullAssembler}.
 */
export type FullAssemblerOptions = AssemblerOptions;

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

function beginAssemblingToken(this: FullAssembler) {
  this.wasDone = this.done;
  // ? This is required because the @types package is suboptimal
  (this.done as boolean) = false;
}

function appendToAssembledString(this: FullAssembler, value: string) {
  this.assembledString += value;
}

function finalizeAssembledToken(
  this: FullAssembler,
  method: JsonStreamedAssembledTokenName
) {
  // ? This is required because the @types package is suboptimal.
  // ? Also, this is required to be done BEFORE calling the appropriate method.
  (this.done as boolean) = this.wasDone;

  this[method](this.assembledString);
  this.previouslyAssembledToken = method;
  this.assembledString = '';
}

function skipMethodCallIfPreviouslyAssembled(
  this: FullAssembler,
  superMethod: ParameterizedAssemblerMethod,
  superMethodName: JsonStreamedAssembledTokenName,
  value: string
) {
  if (this.previouslyAssembledToken !== superMethodName) {
    superMethod(value);
  }
}

/**
 * An extension of {@link Assembler} that, unlike the superclass, handles _all_
 * streamed and packed token types.
 *
 * See https://github.com/uhop/stream-json/wiki/Assembler for details.
 */
export class FullAssembler extends Assembler {
  protected previouslyAssembledToken: JsonStreamedAssembledTokenName | undefined =
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
    super(options);

    this.startNumber = beginAssemblingToken.bind(this);
    this.startString = beginAssemblingToken.bind(this);
    this.startKey = beginAssemblingToken.bind(this);

    this.numberChunk = appendToAssembledString.bind(this);
    this.stringChunk = appendToAssembledString.bind(this);

    this.endNumber = finalizeAssembledToken.bind(this, 'numberValue');
    this.endString = finalizeAssembledToken.bind(this, 'stringValue');
    this.endKey = finalizeAssembledToken.bind(this, 'keyValue');

    this.numberValue = skipMethodCallIfPreviouslyAssembled.bind(
      this,
      //@ts-expect-error: @types package is missing some superclass methods
      super.numberValue.bind(this),
      'numberValue'
    );

    this.stringValue = skipMethodCallIfPreviouslyAssembled.bind(
      this,
      //@ts-expect-error: @types package is missing some superclass methods
      super.stringValue.bind(this),
      'stringValue'
    );

    this.keyValue = skipMethodCallIfPreviouslyAssembled.bind(
      this,
      //@ts-expect-error: @types package is missing some superclass methods
      super.keyValue.bind(this),
      'keyValue'
    );

    //@ts-expect-error: @types package is missing some superclass methods
    this.startObject = super.startObject.bind(this);
    //@ts-expect-error: @types package is missing some superclass methods
    this.endObject = super.endObject.bind(this);
    //@ts-expect-error: @types package is missing some superclass methods
    this.startArray = super.startArray.bind(this);
    //@ts-expect-error: @types package is missing some superclass methods
    this.endArray = super.endArray.bind(this);
    //@ts-expect-error: @types package is missing some superclass methods
    this.nullValue = super.nullValue.bind(this);
    //@ts-expect-error: @types package is missing some superclass methods
    this.trueValue = super.trueValue.bind(this);
    //@ts-expect-error: @types package is missing some superclass methods
    this.falseValue = super.falseValue.bind(this);
  }

  /**
   * This is a helper method, which encapsulates a common pattern used to
   * consume a token. It returns the instance for possible chaining.
   */
  consume(chunk: JsonToken) {
    super.consume(chunk);

    // ? This prevents pipelines made of streams with mixed configs (e.g. some
    // ? packed, some streamed, some both) from causing duplicates or misses.
    if (!(['endNumber', 'endString', 'endKey'] as JsonTokenName[]).includes(chunk.name)) {
      this.previouslyAssembledToken = undefined;
    }

    return this;
  }
}
