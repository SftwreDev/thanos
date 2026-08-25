import OpenAI from "openai";

type LlmInput = {
  query: string;
  history: { role: "user" | "assistant"; content: string }[];
  source: "course" | "web";
  context: string;
  openLesson?: string;
};

export const OPENAI_MODEL = process.env.OPENAI_MODEL ?? "gpt-4o-mini";

export function hasLlm(): boolean {
  return Boolean(process.env.OPENAI_API_KEY);
}

const SYSTEM = `You are Tutor, an LMS assistant for the Certified Kubernetes Administrator course (KodeKloud notes).

Voice: concise, technical, short paragraphs. No filler. No greetings.
The student already has the lesson notes in the chat. Answer follow-up questions about what they just read.
If source is course, teach only from the provided notes. Name the lesson.
If an open lesson is named, stay on that lesson unless the question clearly needs a related lesson from context.
If the open lesson does not cover the question, say so, then use other provided course notes.
If source is web, start with: this is not in the CKA notes, so you looked it up.
Put YAML and shell in fenced code blocks. Inline code for flags and field names.
Do not invent Kubernetes APIs that are not in the context.`;

function client(): OpenAI {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("Missing OPENAI_API_KEY");
  }
  return new OpenAI({ apiKey });
}

export async function* streamLlm(input: LlmInput): AsyncGenerator<string> {
  const stream = await client().chat.completions.create({
    model: OPENAI_MODEL,
    temperature: 0.3,
    max_tokens: 1200,
    stream: true,
    messages: [
      { role: "system", content: SYSTEM },
      ...input.history.slice(-8),
      {
        role: "user",
        content: [
          `Source: ${input.source}`,
          input.openLesson ? `Open lesson: ${input.openLesson}` : "",
          `Context:\n${input.context}`,
          `Question:\n${input.query}`,
        ]
          .filter(Boolean)
          .join("\n\n"),
      },
    ],
  });

  for await (const chunk of stream) {
    const text = chunk.choices[0]?.delta?.content;
    if (text) yield text;
  }
}
