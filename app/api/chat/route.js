// app/api/chat/route.js
// Streams Gemini's reply token-by-token so the alien can start speaking
// almost immediately. The API key never reaches the browser.
import { getAlien } from "../../../lib/aliens";

export const runtime = "edge";

export async function POST(req) {
  try {
    const { alienId, history = [], message, memory = "" } = await req.json();
    const alien = getAlien(alienId);
    const key = process.env.GEMINI_API_KEY;

    if (!key) {
      return Response.json({ error: "Server is missing GEMINI_API_KEY." }, { status: 500 });
    }

    let system = alien.persona;
    if (memory && memory.trim()) {
      system += `\n\nMEMORY OF EARLIER CONTACT WITH THIS SAME HUMAN (recall naturally if relevant):\n${memory.trim()}`;
    }

    const trimmed = history.slice(-20);
    const contents = trimmed.map((m) => ({
      role: m.role === "alien" ? "model" : "user",
      parts: [{ text: m.text }],
    }));
    contents.push({ role: "user", parts: [{ text: message }] });

    const url =
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:streamGenerateContent?alt=sse&key=" +
      key;

    const upstream = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents,
        generationConfig: {
          temperature: 1.0,
          maxOutputTokens: 180,
          thinkingConfig: { thinkingBudget: 0 },
        },
      }),
    });

    if (!upstream.ok || !upstream.body) {
      let msg = "Gemini request failed.";
      try {
        const e = await upstream.json();
        msg = e?.error?.message || msg;
      } catch (x) {}
      return Response.json({ error: msg }, { status: 500 });
    }

    const reader = upstream.body.getReader();
    const decoder = new TextDecoder();
    const encoder = new TextEncoder();

    const stream = new ReadableStream({
      async start(controller) {
        let buffer = "";
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            let nl;
            while ((nl = buffer.indexOf("\n")) >= 0) {
              const line = buffer.slice(0, nl).trim();
              buffer = buffer.slice(nl + 1);
              if (!line.startsWith("data:")) continue;
              const payload = line.slice(5).trim();
              if (!payload || payload === "[DONE]") continue;
              try {
                const obj = JSON.parse(payload);
                const t = obj?.candidates?.[0]?.content?.parts?.[0]?.text;
                if (t) controller.enqueue(encoder.encode(t));
              } catch (e) {}
            }
          }
        } catch (e) {
        } finally {
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
      },
    });
  } catch (e) {
    return Response.json({ error: String(e) }, { status: 500 });
  }
}
