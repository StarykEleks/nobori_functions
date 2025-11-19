type ChatMessage =
  | { role: "system"; content: string }
  | { role: "user"; content: string };

export async function callOpenAIWebSearch(
  messages: ChatMessage[],
  model = "gpt-5",
) {
  const apiKey = process.env.OPENAI_WEB_SEARCH;
  if (!apiKey) throw new Error("OPENAI_WEB_SEARCH is not set");

  const res = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      input: messages,
      reasoning: { effort: "low" },
      max_output_tokens: 1400,
      tools: [{ type: "web_search" }],
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`OpenAI error ${res.status}: ${text}`);
  }
  const json = await res.json();
  const outputText = json.output.find((out: any) => out.type === "message")
    ?.content?.[0]?.text;
  if (!outputText) {
    throw new Error("OpenAI response did not contain output text");
  }
  return outputText;
}

export async function callOpenAIJson(messages: ChatMessage[], model = "gpt-5") {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY is not set");

  const res = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      input: messages,
      text: { format: { type: "json_object" } },
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`OpenAI error ${res.status}: ${text}`);
  }
  const json = await res.json();
  const outputText = json.output.find((out: any) => out.type === "message")
    ?.content?.[0]?.text;
  if (!outputText) {
    throw new Error("OpenAI response did not contain output text");
  }

  let parsed;
  try {
    parsed = JSON.parse(outputText);
  } catch (e) {
    console.log(`OpenAI response failed with error:`, e);
    throw new Error(`Failed to parse OpenAI output as JSON: ${outputText}`);
  }
  return parsed;
}
