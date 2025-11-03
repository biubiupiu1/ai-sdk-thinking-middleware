'use strict';

const DEFAULT_TAG_NAME = 'thinking';

function createThinkingMiddleware(options = {}) {
  const {
    tagName = DEFAULT_TAG_NAME,
    stripReasoningFromText = true,
    onReasoningDelta,
    createReasoningPart = defaultReasoningPartFactory,
  } = options;

  const startTag = `<${tagName}>`;
  const endTag = `</${tagName}>`;

  return async function thinkingMiddleware(context, next) {
    const result = await next(context);
    if (!result || typeof result !== 'object') {
      return result;
    }

    const aggregatedReasoning = { value: '' };

    const pushReasoning = (delta) => {
      if (!delta) {
        return;
      }

      aggregatedReasoning.value += delta;
      if (typeof onReasoningDelta === 'function') {
        try {
          onReasoningDelta(delta);
        } catch (error) {
          console.error('thinking middleware onReasoningDelta failed:', error);
        }
      }
    };

    if (result.stream) {
      const normalised = normaliseStream(result.stream);
      const transformed = transformStream(normalised.asyncIterable, {
        startTag,
        endTag,
        stripReasoningFromText,
        pushReasoning,
        createReasoningPart,
      });
      result.stream = normalised.recreate(transformed);
    }

    if (typeof result.text === 'string') {
      const { text, reasoning } = splitReasoningFromString(result.text, {
        startTag,
        endTag,
        keepTags: !stripReasoningFromText,
      });
      if (stripReasoningFromText) {
        result.text = text;
      }
      if (reasoning) {
        pushReasoning(reasoning);
      }
    }

    if (aggregatedReasoning.value) {
      if (typeof result.reasoning === 'string') {
        result.reasoning += aggregatedReasoning.value;
      } else if (result.reasoning == null) {
        result.reasoning = aggregatedReasoning.value;
      }
    }

    if (!Object.prototype.hasOwnProperty.call(result, 'thinking')) {
      Object.defineProperty(result, 'thinking', {
        configurable: true,
        enumerable: false,
        get() {
          return aggregatedReasoning.value;
        },
      });
    }

    return result;
  };
}

function splitReasoningFromString(text, { startTag, endTag, keepTags }) {
  if (!text.includes(startTag)) {
    return { text, reasoning: '' };
  }

  let reasoning = '';
  let output = '';
  let cursor = 0;

  while (cursor < text.length) {
    const start = text.indexOf(startTag, cursor);
    if (start === -1) {
      output += text.slice(cursor);
      break;
    }

    output += text.slice(cursor, start);
    const contentStart = start + startTag.length;
    const end = text.indexOf(endTag, contentStart);

    if (end === -1) {
      const reasoningChunk = text.slice(contentStart);
      reasoning += reasoningChunk;
      if (keepTags) {
        output += startTag + reasoningChunk;
      }
      return { text: output, reasoning };
    }

    const reasoningChunk = text.slice(contentStart, end);
    reasoning += reasoningChunk;
    if (keepTags) {
      output += startTag + reasoningChunk + endTag;
    }
    cursor = end + endTag.length;
  }

  return { text: output, reasoning };
}

function normaliseStream(stream) {
  if (isAsyncIterable(stream)) {
    return {
      asyncIterable: stream,
      recreate: (iterable) => iterable,
    };
  }

  if (isReadableStream(stream)) {
    const asyncIterable = readableStreamToAsyncIterable(stream);
    return {
      asyncIterable,
      recreate: (iterable) => asyncIterableToReadableStream(iterable),
    };
  }

  throw new TypeError('Unsupported stream type provided to the thinking middleware.');
}

function transformStream(
  iterable,
  { startTag, endTag, stripReasoningFromText, pushReasoning, createReasoningPart },
) {
  return (async function* transform() {
    let buffer = '';
    let inside = false;

    for await (const part of iterable) {
      if (!isTextDeltaPart(part)) {
        yield part;
        continue;
      }

      const delta = getTextDelta(part);
      if (!delta) {
        continue;
      }

      buffer += delta;

      while (buffer) {
        if (!inside) {
          const startIndex = buffer.indexOf(startTag);
          if (startIndex === -1) {
            yield createTextDeltaPart(buffer);
            buffer = '';
            break;
          }

          const visible = buffer.slice(0, startIndex);
          if (visible) {
            yield createTextDeltaPart(visible);
          }

          if (!stripReasoningFromText) {
            yield createTextDeltaPart(startTag);
          }

          buffer = buffer.slice(startIndex + startTag.length);
          inside = true;
          continue;
        }

        const endIndex = buffer.indexOf(endTag);
        if (endIndex === -1) {
          if (buffer) {
            pushReasoning(buffer);
            yield createReasoningPart(buffer);
            buffer = '';
          }
          break;
        }

        const reasoningChunk = buffer.slice(0, endIndex);
        if (reasoningChunk) {
          pushReasoning(reasoningChunk);
          yield createReasoningPart(reasoningChunk);
        }

        if (!stripReasoningFromText) {
          yield createTextDeltaPart(endTag);
        }

        buffer = buffer.slice(endIndex + endTag.length);
        inside = false;
      }
    }

    if (buffer) {
      if (inside) {
        pushReasoning(buffer);
        yield createReasoningPart(buffer);
      } else {
        yield createTextDeltaPart(buffer);
      }
    }
  })();
}

function isTextDeltaPart(part) {
  return Boolean(part && part.type === 'text-delta');
}

function getTextDelta(part) {
  if (part == null || typeof part !== 'object') {
    return '';
  }

  if (typeof part.textDelta === 'string') {
    return part.textDelta;
  }
  if (typeof part.delta === 'string') {
    return part.delta;
  }
  if (typeof part.text === 'string') {
    return part.text;
  }
  return '';
}

function createTextDeltaPart(text) {
  return {
    type: 'text-delta',
    textDelta: text,
  };
}

function defaultReasoningPartFactory(text) {
  return {
    type: 'reasoning',
    reasoning: {
      type: 'text-delta',
      textDelta: text,
    },
  };
}

function isAsyncIterable(value) {
  return value != null && typeof value[Symbol.asyncIterator] === 'function';
}

function isReadableStream(value) {
  return typeof ReadableStream === 'function' && value instanceof ReadableStream;
}

function readableStreamToAsyncIterable(stream) {
  return {
    async *[Symbol.asyncIterator]() {
      const reader = stream.getReader();
      try {
        while (true) {
          const { value, done } = await reader.read();
          if (done) {
            return;
          }
          if (value !== undefined) {
            yield value;
          }
        }
      } finally {
        reader.releaseLock();
      }
    },
  };
}

function asyncIterableToReadableStream(iterable) {
  if (typeof ReadableStream !== 'function') {
    throw new TypeError('ReadableStream is not available in this environment.');
  }

  const iterator = iterable[Symbol.asyncIterator]();

  return new ReadableStream({
    async pull(controller) {
      const { value, done } = await iterator.next();
      if (done) {
        controller.close();
        return;
      }
      controller.enqueue(value);
    },
    async cancel(reason) {
      if (typeof iterator.return === 'function') {
        try {
          await iterator.return(reason);
        } catch {
          // ignore cancellation errors
        }
      }
    },
  });
}

module.exports = {
  createThinkingMiddleware,
  splitReasoningFromString,
};
