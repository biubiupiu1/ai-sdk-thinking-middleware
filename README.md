# AI SDK Thinking Middleware

A lightweight middleware for the [AI SDK](https://ai-sdk.dev/) that converts
model generated `<thinking>...</thinking>` sections into proper reasoning stream
parts while keeping the final text output free of private reasoning.

## Installation

```bash
pnpm add ai-sdk-thinking-middleware
```

## Usage

```ts
import { streamText } from 'ai';
import { createThinkingMiddleware } from 'ai-sdk-thinking-middleware';

const thinking = createThinkingMiddleware();

const result = await streamText({
  model: openai('gpt-4.1'),
  prompt: 'Explain how rainbows form.',
  middleware: [thinking],
});

for await (const part of result.stream) {
  if (part.type === 'text-delta') {
    process.stdout.write(part.textDelta);
  } else if (part.type === 'reasoning') {
    console.error(part.reasoning?.textDelta);
  }
}

console.log('Reasoning:', result.reasoning);
```

## Options

- `tagName` – Customize the tag name the model uses (default: `thinking`).
- `stripReasoningFromText` – Keep the reasoning tags in the visible output by
  setting this to `false` (default: `true`).
- `onReasoningDelta` – Observe reasoning chunks without mutating the stream.
- `createReasoningPart` – Provide a custom factory for reasoning stream parts
  if you need to fit a specific event schema.

## License

ISC
