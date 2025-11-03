function isAsyncIterable(value) {
  return value != null && typeof value[Symbol.asyncIterator] === 'function';
}

function isIterable(value) {
  return value != null && typeof value[Symbol.iterator] === 'function';
}

function isReadableStream(value) {
  return value != null && typeof value.getReader === 'function';
}

async function* readableStreamToAsyncIterable(stream) {
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
}

async function materializeStream(stream) {
  const parts = [];
  if (!stream) {
    return parts;
  }

  if (isAsyncIterable(stream)) {
    for await (const part of stream) {
      parts.push(part);
    }
    return parts;
  }

  if (isReadableStream(stream)) {
    for await (const part of readableStreamToAsyncIterable(stream)) {
      parts.push(part);
    }
    return parts;
  }

  if (isIterable(stream)) {
    for (const part of stream) {
      parts.push(part);
    }
    return parts;
  }

  throw new TypeError('Unsupported stream type received by AI SDK stub.');
}

function arrayToAsyncIterable(parts) {
  return (async function* () {
    for (const part of parts) {
      yield part;
    }
  })();
}

function extractTextDelta(part) {
  if (!part || typeof part !== 'object') {
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

function extractReasoningDelta(part) {
  if (!part || typeof part !== 'object') {
    return '';
  }
  if (part.reasoning && typeof part.reasoning.textDelta === 'string') {
    return part.reasoning.textDelta;
  }
  if (typeof part.textDelta === 'string') {
    return part.textDelta;
  }
  return '';
}

function composeMiddleware(middleware, terminal) {
  return middleware.reduceRight(
    (next, fn) => (context) => fn(context, next),
    terminal,
  );
}

async function streamText({ model, prompt, middleware = [] }) {
  if (!model || typeof model.doStream !== 'function') {
    throw new TypeError('AI SDK stub expects a model with a doStream method.');
  }

  const execute = composeMiddleware(middleware, (context) => model.doStream(context));
  const response = await execute({ prompt });

  const parts = await materializeStream(response.stream);
  if (parts.length > 0) {
    response.stream = arrayToAsyncIterable(parts);
  }

  const textChunks = [];
  const reasoningChunks = [];
  for (const part of parts) {
    if (part && part.type === 'text-delta') {
      const chunk = extractTextDelta(part);
      if (chunk) {
        textChunks.push(chunk);
      }
    }
    if (part && part.type === 'reasoning') {
      const chunk = extractReasoningDelta(part);
      if (chunk) {
        reasoningChunks.push(chunk);
      }
    }
  }

  return {
    response,
    parts,
    async readText() {
      return [...textChunks];
    },
    async readReasoning() {
      return [...reasoningChunks];
    },
  };
}

module.exports = {
  streamText,
};
