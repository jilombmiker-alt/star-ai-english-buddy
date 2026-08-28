import { capabilityClient } from '@lark-apaas/client-toolkit';

const PLUGIN_INSTANCE_ID = 'star-open-conversation';
const ACTION_KEY = 'textGenerate';

type StreamChunk = Record<string, unknown>;

function isAsyncIterable(value: unknown): value is AsyncIterable<StreamChunk> {
  return !!value && typeof (value as Record<PropertyKey, unknown>)[Symbol.asyncIterator] === 'function';
}

function normalizeStream(value: unknown): AsyncIterable<StreamChunk> {
  if (isAsyncIterable(value)) return value;
  if (value && typeof value === 'object' && 'output' in value) {
    const output = (value as { output?: unknown }).output;
    if (isAsyncIterable(output)) return output;
  }
  throw new Error('Invalid AI stream: AsyncIterable output not found');
}

export interface StarConversationInput {
  childMessage: string;
  lessonContext: string;
  onDelta: (delta: string) => void;
}

export async function askStarInCloud({
  childMessage,
  lessonContext,
  onDelta,
}: StarConversationInput): Promise<string> {
  let content = '';
  let firstChunkKeys: string[] | undefined;

  try {
    const result = capabilityClient
      .load(PLUGIN_INSTANCE_ID)
      .callStream(ACTION_KEY, {
        child_message: childMessage,
        lesson_context: lessonContext,
      });
    const stream = normalizeStream(result);

    for await (const chunk of stream) {
      if (!firstChunkKeys) firstChunkKeys = Object.keys(chunk);
      const delta = typeof chunk.content === 'string' ? chunk.content : '';
      if (!delta) continue;
      content += delta;
      onDelta(delta);
    }

    if (!content.trim()) throw new Error('AI stream finished without content');
    return content.trim();
  } catch (error) {
    console.error('Star AI capability failed', {
      pluginInstanceId: PLUGIN_INSTANCE_ID,
      actionKey: ACTION_KEY,
      outputMode: 'stream',
      inputKeys: ['child_message', 'lesson_context'],
      resultType: 'AsyncIterable',
      firstChunkKeys,
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

