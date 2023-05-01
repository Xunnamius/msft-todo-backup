import { chain } from 'stream-chain';
import { bigStringParser, omitEntry, selectEntry } from 'multiverse/stream-json-extended';

export const finalTokenSymbol = Symbol('final-token');
export const attachmentFilePathSymbol = Symbol('attachment-file-path');

export type JsonFinalToken = { name: typeof finalTokenSymbol };

// TODO: kill stream but also push token downstream first when we receive the
// TODO: JsonFinalToken

// TODO: streams an array of objects (handling nextlink pagination)
// TODO: strip odata properties from output
// TODO: once stream is done, send finalization token
export function createListsStream() {
  const pipeline = chain([...getStandardStreamComponents()]);
  return pipeline;
}

export function createTasksStream({ idSymbol }: { idSymbol: symbol }) {
  return chain([...getStandardStreamComponents()]);
}

export function createAttachmentsStream({ idSymbol }: { idSymbol: symbol }) {
  return chain([...getStandardStreamComponents()]);
}

// TODO: only allows attachment objects, packed entries, and JsonFinalToken to
// TODO: flow through and anything else is discarded
export function createAttachmentsContentBytesStream({ idSymbol }: { idSymbol: symbol }) {
  return chain([...getStandardStreamComponents()]);
}

function getStandardStreamComponents() {
  return [
    bigStringParser(),
    selectEntry({ key: 'value' }),
    omitEntry({ key: /(^|\.)@odata/ })
  ];
}
