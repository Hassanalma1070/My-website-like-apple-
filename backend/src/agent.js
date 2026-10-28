import Anthropic from "@anthropic-ai/sdk";
import { betaZodTool } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import * as customers from "./customers.js";

const client = new Anthropic(); // reads ANTHROPIC_API_KEY from the environment
const MODEL = process.env.ANTHROPIC_MODEL || "claude-opus-5-5";

const SYSTEM_PROMPT = `You are a customer-data assistant for an internal admin dashboard.
You answer questions about the customer table and can create, update and delete customers using the provided tools.
Always use the tools to read data. Never invent customers or fields.
The customer fields are customer_id, name, email, phone and created_at.
When a request is ambiguous (for example, several customers match a name for an update or delete), list the matches and ask which one the user means.
Keep answers short. Use Markdown tables when showing more than one customer.`;

// Tools are built per request so each call can record which tools ran.
function buildTools(toolCalls) {
  const tool = (def) =>
    betaZodTool({
      ...def,
      run: async (input) => {
        try {
          const result = await def.run(input);
          toolCalls.push({ name: def.name, input, ok: true });
          return JSON.stringify(result ?? { error: "Not found" });
        } catch (err) {
          toolCalls.push({ name: def.name, input, ok: false });
          return JSON.stringify({ error: err.message });
        }
      },
    });

  return [
    tool({
      name: "get_all_customers",
      description: "Return every customer in the database, ordered by customer_id.",
      inputSchema: z.object({}),
      run: () => customers.listCustomers(),
    }),
    tool({
      name: "get_customer_by_name",
      description: "Find customers whose name contains the given text (case-insensitive partial match).",
      inputSchema: z.object({ name: z.string().describe("Full or partial customer name") }),
      run: ({ name }) => customers.findCustomersByName(name),
    }),
    tool({
      name: "get_customer_by_id",
      description: "Return one customer by its numeric customer_id.",
      inputSchema: z.object({ customer_id: z.number().int().positive() }),
      run: ({ customer_id }) => customers.getCustomerById(customer_id),
    }),
    tool({
      name: "add_customer",
      description: "Create a new customer. name is required; email and phone are optional.",
      inputSchema: z.object({
        name: z.string().min(1),
        email: z.string().optional(),
        phone: z.string().optional(),
      }),
      run: (input) => customers.createCustomer(input),
    }),
    tool({
      name: "update_customer",
      description: "Update the name, email or phone of an existing customer. Only the provided fields change.",
      inputSchema: z.object({
        customer_id: z.number().int().positive(),
        name: z.string().min(1).optional(),
        email: z.string().optional(),
        phone: z.string().optional(),
      }),
      run: ({ customer_id, ...fields }) => customers.updateCustomer(customer_id, fields),
    }),
    tool({
      name: "delete_customer",
      description: "Permanently delete a customer by customer_id. Only call this when the user clearly asked to delete that specific customer.",
      inputSchema: z.object({ customer_id: z.number().int().positive() }),
      run: ({ customer_id }) => customers.deleteCustomer(customer_id),
    }),
  ];
}

/**
 * Run one chat turn.
 * @param {string} message - the new user message
 * @param {{role: "user"|"assistant", content: string}[]} history - earlier text turns
 */
export async function chat(message, history = []) {
  const toolCalls = [];
  const messages = [...history, { role: "user", content: message }];

  const finalMessage = await client.beta.messages.toolRunner({
    model: MODEL,
    max_tokens: 16000,
    system: SYSTEM_PROMPT,
    thinking: { type: "adaptive" },
    output_config: { effort: "medium" },
    // Server-side fallback: if the model declines, the API retries on a fallback model
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    tools: buildTools(toolCalls),
    messages,
    max_iterations: 10,
  });

  if (finalMessage.stop_reason === "refusal") {
    return { reply: "Sorry, I can't help with that request.", toolCalls };
  }

  const reply = finalMessage.content
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("\n")
    .trim();

  return { reply: reply || "(No response)", toolCalls };
}
