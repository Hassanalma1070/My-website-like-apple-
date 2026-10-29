import Anthropic from "@anthropic-ai/sdk";
import { betaZodTool } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import * as customers from "./customers.js";
import * as deals from "./deals.js";
import { STAGES, validateDealInput } from "./dealValidation.js";
import { getUserById } from "./users.js";

const client = new Anthropic(); // reads ANTHROPIC_API_KEY from the environment
const MODEL = process.env.ANTHROPIC_MODEL || "claude-opus-5-5";

const systemPrompt = (user) => `You are a customer-data assistant for an internal sales dashboard.
Today's date is ${new Date().toISOString().slice(0, 10)}.
You are assisting the sales person ${user.name}. You can only see and manage this sales person's own customers.
If a customer is not found, say so; do not speculate about customers that belong to other users.
You answer questions about the customer table and can create, update and delete customers using the provided tools.
Always use the tools to read data. Never invent customers or fields.
The customer fields are customer_id, name, email, phone and created_at.
When a request is ambiguous (for example, several customers match a name for an update or delete), list the matches and ask which one the user means.
Customers can have deals: sales opportunities with a title, an amount in Indian rupees (₹), a stage and an optional expected close date.
The stages, in pipeline order, are lead, qualified, proposal, then won or lost. Lead, qualified and proposal are open; won and lost are closed.
To add a deal for a customer named by the user, look the customer up first to get its customer_id. Dates are YYYY-MM-DD; a date without a year means the next such date from today.
Show amounts in rupees with Indian digit grouping, for example ₹1,50,000.
Keep answers short. Use Markdown tables when showing more than one customer.`;

const dealFields = {
  title: z.string().min(1).max(200),
  amount: z.number().nonnegative().describe("Amount in Indian rupees, at most 2 decimals"),
  stage: z.enum(STAGES),
  expected_close_date: z.string().describe("YYYY-MM-DD").nullable(),
};

// Validates with the same rules as the REST API; throws so the tool returns { error }
function dealInput(input, create) {
  const { fields, error } = validateDealInput(input, { create });
  if (error) throw new Error(error);
  return fields;
}

// Tools are built per request so each call can record which tools ran and is bound to the
// logged-in user. The user id comes from this closure and is never a tool input, so the
// model cannot reach another user's customers.
function buildTools(toolCalls, userId) {
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
      run: () => customers.listCustomers(userId),
    }),
    tool({
      name: "get_customer_by_name",
      description: "Find customers whose name contains the given text (case-insensitive partial match).",
      inputSchema: z.object({ name: z.string().describe("Full or partial customer name") }),
      run: ({ name }) => customers.findCustomersByName(userId, name),
    }),
    tool({
      name: "get_customer_by_id",
      description: "Return one customer by its numeric customer_id.",
      inputSchema: z.object({ customer_id: z.number().int().positive() }),
      run: ({ customer_id }) => customers.getCustomerById(userId, customer_id),
    }),
    tool({
      name: "add_customer",
      description: "Create a new customer. name is required; email and phone are optional.",
      inputSchema: z.object({
        name: z.string().min(1),
        email: z.string().optional(),
        phone: z.string().optional(),
      }),
      run: (input) => customers.createCustomer(userId, input),
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
      run: ({ customer_id, ...fields }) => customers.updateCustomer(userId, customer_id, fields),
    }),
    tool({
      name: "delete_customer",
      description: "Permanently delete a customer by customer_id. Only call this when the user clearly asked to delete that specific customer.",
      inputSchema: z.object({ customer_id: z.number().int().positive() }),
      run: ({ customer_id }) => customers.deleteCustomer(userId, customer_id),
    }),
    tool({
      name: "get_deals",
      description: "Return deals, optionally filtered by stage (a stage, or open / closed) and customer_id, with pipeline totals.",
      inputSchema: z.object({
        stage: z.enum(["open", "closed", ...STAGES]).optional(),
        customer_id: z.number().int().positive().optional(),
      }),
      run: async ({ stage, customer_id }) => {
        const filters = { stage, customerId: customer_id };
        const [list, summary] = await Promise.all([deals.listDeals(userId, filters), deals.dealSummary(userId, filters, "UTC")]);
        return { deals: list, summary };
      },
    }),
    tool({
      name: "get_customer_deals",
      description: "Return all deals for one customer by customer_id.",
      inputSchema: z.object({ customer_id: z.number().int().positive() }),
      run: ({ customer_id }) => deals.listCustomerDeals(userId, customer_id),
    }),
    tool({
      name: "add_deal",
      description: "Create a deal for a customer. stage defaults to lead; expected_close_date is optional.",
      inputSchema: z.object({
        customer_id: z.number().int().positive(),
        title: dealFields.title,
        amount: dealFields.amount,
        stage: dealFields.stage.optional(),
        expected_close_date: dealFields.expected_close_date.optional(),
      }),
      run: (input) => deals.createDeal(userId, dealInput(input, true)),
    }),
    tool({
      name: "update_deal",
      description: "Update the title, amount, stage or expected close date of a deal. Only the provided fields change; null clears the close date.",
      inputSchema: z.object({
        deal_id: z.number().int().positive(),
        title: dealFields.title.optional(),
        amount: dealFields.amount.optional(),
        stage: dealFields.stage.optional(),
        expected_close_date: dealFields.expected_close_date.optional(),
      }),
      run: ({ deal_id, ...fields }) => deals.updateDeal(userId, deal_id, dealInput(fields, false)),
    }),
    tool({
      name: "delete_deal",
      description: "Permanently delete a deal by deal_id. Only call this when the user clearly asked to delete that specific deal.",
      inputSchema: z.object({ deal_id: z.number().int().positive() }),
      run: ({ deal_id }) => deals.deleteDeal(userId, deal_id),
    }),
  ];
}

/**
 * Run one chat turn.
 * @param {string} message - the new user message
 * @param {{role: "user"|"assistant", content: string}[]} history - earlier text turns
 * @param {{user_id: number}} authUser - the authenticated user (from the token)
 */
export async function chat(message, history, authUser) {
  const toolCalls = [];
  // Read the name from the database rather than trusting anything else in the request
  const user = (await getUserById(authUser.user_id)) ?? { name: "unknown" };
  const messages = [...history, { role: "user", content: message }];

  const finalMessage = await client.beta.messages.toolRunner({
    model: MODEL,
    max_tokens: 16000,
    system: systemPrompt(user),
    thinking: { type: "adaptive" },
    output_config: { effort: "medium" },
    // Server-side fallback: if the model declines, the API retries on a fallback model
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    tools: buildTools(toolCalls, authUser.user_id),
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
