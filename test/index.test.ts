import { describe, test, expect } from "vitest";
import { createThinkingMiddleware, splitReasoningFromString, LanguageModelStream } from "../src";


import { streamText } from "ai";

async function collectStreamParts(stream: LanguageModelStream) {
  const parts = [];

  if (stream && typeof stream.getReader === "function") {
    const reader = stream.getReader();
    while (true) {
      const { value, done } = await reader.read();
      if (done) {
        break;
      }
      if (value !== undefined) {
        parts.push(value);
      }
    }
    reader.releaseLock();
    return parts;
  }

  if (stream && typeof stream[Symbol.asyncIterator] === "function") {
    for await (const part of stream) {
      parts.push(part);
    }
    return parts;
  }

  for await (const part of stream || []) {
    parts.push(part);
  }

  return parts;
}

describe("splitReasoningFromString", () => {
  test("separates reasoning content from visible text", () => {
    const { text, reasoning } = splitReasoningFromString(
      "hi <thinking>secret</thinking> there",
      {
        startTag: "<thinking>",
        endTag: "</thinking>",
        keepTags: false,
      }
    );

    expect(text).toEqual("hi  there");
    expect(reasoning).toEqual("secret");
  });

  test("preserves tags when keepTags=true", () => {
    const { text, reasoning } = splitReasoningFromString(
      "hi <thinking>secret</thinking> there",
      {
        startTag: "<thinking>",
        endTag: "</thinking>",
        keepTags: true,
      }
    );

    expect(text).toEqual("hi <thinking>secret</thinking> there");
    expect(reasoning).toEqual("secret");
  });
});

describe("createThinkingMiddleware", () => {
  test("strips reasoning from text responses and aggregates deltas", async () => {
    const deltas: string[] = [];
    const middleware = createThinkingMiddleware({
      onReasoningDelta: (delta: string) => deltas.push(delta),
    });

    const result = await middleware({}, async () => ({
      text: "Visible <thinking>hidden</thinking> text",
      stream: (async function* () {
        yield { type: "text-delta", textDelta: "Visible <thinking>hid" };
        yield { type: "text-delta", textDelta: "den</thinking> text" };
      })(),
    }));

    expect(result.text).toEqual("Visible  text");
    expect(result.reasoning).toEqual("hidden");
    expect(result.thinking).toEqual("hidden");

    const parts = await collectStreamParts(result.stream);
    expect(parts).toStrictEqual([
      { type: "text-delta", textDelta: "Visible " },
      {
        type: "reasoning",
        reasoning: { type: "text-delta", textDelta: "hid" },
      },
      {
        type: "reasoning",
        reasoning: { type: "text-delta", textDelta: "den" },
      },
      { type: "text-delta", textDelta: " text" },
    ]);

    expect(deltas).toStrictEqual(["hidden", "hid", "den"]);
  });

  test("keeps thinking tags when stripReasoningFromText is false", async () => {
    const middleware = createThinkingMiddleware({
      stripReasoningFromText: false,
    });

    const result = await middleware({}, async () => ({
      text: "A<thinking>b</thinking>C",
      stream: (async function* () {
        yield { type: "text-delta", textDelta: "A<thinking>b</thinking>C" };
      })(),
    }));

    expect(result.text).toEqual("A<thinking>b</thinking>C");

    const parts = await collectStreamParts(result.stream);
    expect(parts).toStrictEqual([
      { type: "text-delta", textDelta: "A" },
      { type: "text-delta", textDelta: "<thinking>" },
      { type: "reasoning", reasoning: { type: "text-delta", textDelta: "b" } },
      { type: "text-delta", textDelta: "</thinking>" },
      { type: "text-delta", textDelta: "C" },
    ]);
  });

  test("works end-to-end with ReadableStream inputs", async () => {
    const middleware = createThinkingMiddleware();

    const upstream = new ReadableStream({
      start(controller) {
        controller.enqueue({
          type: "text-delta",
          textDelta: "Hi <thinking>calc",
        });
        controller.enqueue({
          type: "text-delta",
          textDelta: " reasoning</thinking> there",
        });
        controller.close();
      },
    });

    const result = await middleware({}, async () => ({ stream: upstream }));

    const emitted = await collectStreamParts(result.stream);

    expect(emitted).toStrictEqual([
      { type: "text-delta", textDelta: "Hi " },
      {
        type: "reasoning",
        reasoning: { type: "text-delta", textDelta: "calc" },
      },
      {
        type: "reasoning",
        reasoning: { type: "text-delta", textDelta: " reasoning" },
      },
      { type: "text-delta", textDelta: " there" },
    ]);
    expect(result.thinking).toEqual("calc reasoning");
  });
});

describe("AI SDK integration", () => {
  test("streams reasoning parts separately from visible text", async () => {
    const middleware = createThinkingMiddleware();

    const model = {
      async doStream() {
        return {
          text: "Result: 42",
          stream: (async function* () {
            yield { type: "text-delta", textDelta: "Result: <thinking>num" };
            yield { type: "text-delta", textDelta: "bers</thinking>42" };
          })(),
        };
      },
    };

    const outcome = await streamText({
      model,
      prompt: "compute",
      middleware: [middleware],
    });

    expect(outcome.response.text).toEqual("Result: 42");
    expect(outcome.response.thinking).toEqual("numbers");

    expect(await outcome.readText()).toStrictEqual(["Result: ", "42"]);
    expect(await outcome.readReasoning()).toStrictEqual(["num", "bers"]);
  });
});
