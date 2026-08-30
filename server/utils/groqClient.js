/**
 * server/utils/groqClient.js
 *
 * Thin, generic wrapper around the Groq chat-completions API (OpenAI-compatible), used by the
 * smart search endpoint (server/api/v2/search/smart.js) and available for other AI-assist
 * features later (spec section 52 - natural-language request classification, summarizing, etc).
 * Same "tolerant of the key being unset" pattern as server/utils/stripeClient.js: every caller
 * checks isGroqConfigured() and returns a clear "AI assistance is currently unavailable" instead
 * of ever faking a response.
 */
const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';
const DEFAULT_MODEL = 'llama-3.3-70b-versatile';

const isGroqConfigured = () => typeof process.env.GROQ_API_KEY === 'string' && process.env.GROQ_API_KEY.length > 0;

/**
 * Calls Groq expecting a strict JSON object back (response_format: json_object). Throws a real
 * error (never returns a fabricated result) if the key is missing, the request fails, or the
 * model's output isn't valid JSON.
 *
 * @param {Object} opts
 * @param {string} opts.system - system prompt
 * @param {string} opts.user - user prompt
 * @param {number} [opts.temperature]
 * @returns {Promise<Object>} parsed JSON object
 */
const groqChatJSON = async ({ system, user, temperature = 0.1 }) => {
  if (!isGroqConfigured()) {
    const err = new Error('groq_not_configured');
    err.code = 'groq_not_configured';
    throw err;
  }

  const model = process.env.GROQ_MODEL || DEFAULT_MODEL;

  const response = await fetch(GROQ_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
    },
    body: JSON.stringify({
      model,
      temperature,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
    }),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    const err = new Error(`groq_request_failed_${response.status}: ${text.slice(0, 300)}`);
    err.code = 'groq_request_failed';
    throw err;
  }

  const data = await response.json();
  const content = data?.choices?.[0]?.message?.content;
  if (typeof content !== 'string') {
    const err = new Error('groq_empty_response');
    err.code = 'groq_empty_response';
    throw err;
  }

  try {
    return JSON.parse(content);
  } catch (parseErr) {
    const err = new Error('groq_invalid_json');
    err.code = 'groq_invalid_json';
    throw err;
  }
};

module.exports = { isGroqConfigured, groqChatJSON };
