const customer = {
  type: "object",
  properties: {
    customer_id: { type: "integer", example: 1 },
    name: { type: "string", example: "Jane Doe" },
    email: { type: "string", nullable: true, example: "jane@example.com" },
    phone: { type: "string", nullable: true, example: "5551234567" },
    created_at: { type: "string", format: "date-time" },
  },
};

const customerInput = {
  type: "object",
  properties: {
    name: { type: "string", example: "Jane Doe" },
    email: { type: "string", example: "jane@example.com" },
    phone: { type: "string", example: "5551234567" },
  },
};

const error = { type: "object", properties: { error: { type: "string" } } };

const json = (schema) => ({ content: { "application/json": { schema } } });
const ref = (name) => ({ $ref: `#/components/schemas/${name}` });
const idParam = { name: "id", in: "path", required: true, schema: { type: "integer" }, description: "customer_id" };
const notFound = { description: "Customer not found", ...json(ref("Error")) };
const badRequest = { description: "Invalid input", ...json(ref("Error")) };

export function buildSpec(port) {
  return {
    openapi: "3.0.3",
    info: {
      title: "Customer API",
      version: "1.0.0",
      description:
        "CRUD operations on the `customer` table, plus an agent endpoint that answers natural-language questions about customers using Claude. No authentication is required.",
    },
    servers: [{ url: `http://localhost:${port}` }],
    tags: [
      { name: "Customers", description: "CRUD operations on customers" },
      { name: "Agent", description: "Natural-language assistant backed by Claude" },
      { name: "Health" },
    ],
    components: {
      schemas: {
        Customer: customer,
        CustomerInput: { ...customerInput, required: ["name"] },
        CustomerUpdate: customerInput,
        Error: error,
      },
    },
    paths: {
      "/api/customers": {
        get: {
          tags: ["Customers"],
          summary: "Get all customers (optionally filter by name)",
          parameters: [
            { name: "name", in: "query", required: false, schema: { type: "string" }, description: "Case-insensitive partial match on name" },
          ],
          responses: { 200: { description: "List of customers", ...json({ type: "array", items: ref("Customer") }) } },
        },
        post: {
          tags: ["Customers"],
          summary: "Create a customer",
          requestBody: { required: true, ...json(ref("CustomerInput")) },
          responses: { 201: { description: "Created", ...json(ref("Customer")) }, 400: badRequest },
        },
      },
      "/api/customers/{id}": {
        get: {
          tags: ["Customers"],
          summary: "Get a customer by id",
          parameters: [idParam],
          responses: { 200: { description: "The customer", ...json(ref("Customer")) }, 404: notFound },
        },
        put: {
          tags: ["Customers"],
          summary: "Update a customer (only provided fields change)",
          parameters: [idParam],
          requestBody: { required: true, ...json(ref("CustomerUpdate")) },
          responses: { 200: { description: "Updated", ...json(ref("Customer")) }, 400: badRequest, 404: notFound },
        },
        delete: {
          tags: ["Customers"],
          summary: "Delete a customer",
          parameters: [idParam],
          responses: { 200: { description: "The deleted customer", ...json(ref("Customer")) }, 404: notFound },
        },
      },
      "/api/agent/chat": {
        post: {
          tags: ["Agent"],
          summary: "Ask a natural-language question about customers",
          description:
            "Claude uses tools to list, search, add, update or delete customers. Pass earlier turns in `history` to continue a conversation.",
          requestBody: {
            required: true,
            ...json({
              type: "object",
              required: ["message"],
              properties: {
                message: { type: "string", example: "Get all customers" },
                history: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: { role: { type: "string", enum: ["user", "assistant"] }, content: { type: "string" } },
                  },
                },
              },
            }),
          },
          responses: {
            200: {
              description: "Assistant reply",
              ...json({
                type: "object",
                properties: {
                  reply: { type: "string" },
                  toolCalls: {
                    type: "array",
                    items: { type: "object", properties: { name: { type: "string" }, input: { type: "object" }, ok: { type: "boolean" } } },
                  },
                },
              }),
            },
            400: badRequest,
          },
        },
      },
      "/api/health": {
        get: { tags: ["Health"], summary: "Health check (also checks the database)", responses: { 200: { description: "OK" } } },
      },
    },
  };
}
