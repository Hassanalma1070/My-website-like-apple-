const customer = {
  type: "object",
  properties: {
    customer_id: { type: "integer", example: 1 },
    name: { type: "string", example: "Jane Doe" },
    email: { type: "string", nullable: true, example: "jane@example.com" },
    phone: { type: "string", nullable: true, example: "5551234567" },
    created_at: { type: "string", format: "date-time" },
    sales_user_id: { type: "integer", readOnly: true, example: 3, description: "The sales person who owns this customer" },
  },
};

const user = {
  type: "object",
  properties: {
    user_id: { type: "integer", example: 3 },
    name: { type: "string", example: "Sam Seller" },
    email: { type: "string", example: "sam@example.com" },
    role: { type: "string", enum: ["sales", "admin"], example: "sales" },
    created_at: { type: "string", format: "date-time" },
  },
};

const registerInput = {
  type: "object",
  required: ["name", "email", "password"],
  properties: {
    name: { type: "string", example: "Sam Seller" },
    email: { type: "string", example: "sam@example.com" },
    password: { type: "string", format: "password", minLength: 8, example: "correct-horse-1" },
  },
};

const loginInput = {
  type: "object",
  required: ["email", "password"],
  properties: {
    email: { type: "string", example: "sam@example.com" },
    password: { type: "string", format: "password", example: "correct-horse-1" },
  },
};

const authResponse = {
  type: "object",
  properties: {
    token: { type: "string", description: "JWT. Click Authorize and paste it to call protected endpoints." },
    user: { $ref: "#/components/schemas/User" },
  },
};

const newPassword = { type: "string", format: "password", minLength: 8, example: "new-password-2" };

const changePasswordInput = {
  type: "object",
  required: ["currentPassword", "newPassword"],
  properties: { currentPassword: { type: "string", format: "password", example: "correct-horse-1" }, newPassword },
};

const forgotPasswordInput = {
  type: "object",
  required: ["email"],
  properties: { email: { type: "string", example: "sam@example.com" } },
};

const resetPasswordInput = {
  type: "object",
  required: ["token", "newPassword"],
  properties: { token: { type: "string", description: "The reset_token value from the reset link" }, newPassword },
};

const message = { type: "object", properties: { message: { type: "string" } } };

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
const notFound = { description: "Customer not found, or owned by another user", ...json(ref("Error")) };
const badRequest = { description: "Invalid input", ...json(ref("Error")) };
const unauthorized = { description: "Missing, invalid or expired token", ...json(ref("Error")) };
const duplicateEmail = { description: "A customer with this email already exists", ...json(ref("Error")) };
const secured = { security: [{ bearerAuth: [] }] };

export function buildSpec() {
  return {
    openapi: "3.0.3",
    info: {
      title: "Customer API",
      version: "2.1.0",
      description: [
        "CRUD operations on customers, plus an agent endpoint that answers natural-language questions about customers using Claude.",
        "",
        "Every customer belongs to a sales person. You can only see and change **your own** customers; another user's customer returns `404`, the same as one that does not exist. The agent follows the same rule.",
        "",
        "**To try it here:**",
        "1. Call `POST /api/auth/register` (or `POST /api/auth/login`) and copy the `token` from the response.",
        "2. Click **Authorize** and paste the token.",
        "3. Call the Customers and Agent endpoints.",
        "4. To check access control, register a second user, authorize as them, and try to read or change the first user's customers.",
        "",
        "**Password reset:** `POST /api/auth/forgot-password` creates a single-use link that expires in 30 minutes. No email provider is configured yet, so during development the link is printed in the backend console (`npm run reset-link -- <email>` also prints one). Copy the `reset_token` value from the link into `POST /api/auth/reset-password`. Changing or resetting a password signs out every older token.",
      ].join("\n"),
    },
    servers: [{ url: "/" }],
    tags: [
      { name: "Auth", description: "Register, log in and get the current user" },
      { name: "Customers", description: "CRUD operations on customers" },
      { name: "Agent", description: "Natural-language assistant backed by Claude" },
      { name: "Health" },
    ],
    components: {
      securitySchemes: {
        bearerAuth: { type: "http", scheme: "bearer", bearerFormat: "JWT" },
      },
      schemas: {
        User: user,
        RegisterInput: registerInput,
        LoginInput: loginInput,
        AuthResponse: authResponse,
        ChangePasswordInput: changePasswordInput,
        ForgotPasswordInput: forgotPasswordInput,
        ResetPasswordInput: resetPasswordInput,
        Message: message,
        Customer: customer,
        CustomerInput: { ...customerInput, required: ["name"] },
        CustomerUpdate: customerInput,
        Error: error,
      },
    },
    paths: {
      "/api/auth/register": {
        post: {
          tags: ["Auth"],
          summary: "Register a new user (role is always sales)",
          requestBody: { required: true, ...json(ref("RegisterInput")) },
          responses: {
            201: { description: "Registered and logged in", ...json(ref("AuthResponse")) },
            400: badRequest,
            409: { description: "Email is already registered", ...json(ref("Error")) },
          },
        },
      },
      "/api/auth/login": {
        post: {
          tags: ["Auth"],
          summary: "Log in and get a token",
          requestBody: { required: true, ...json(ref("LoginInput")) },
          responses: {
            200: { description: "Logged in", ...json(ref("AuthResponse")) },
            400: badRequest,
            401: { description: "Invalid email or password", ...json(ref("Error")) },
          },
        },
      },
      "/api/auth/me": {
        get: {
          tags: ["Auth"],
          summary: "Get the logged-in user",
          ...secured,
          responses: { 200: { description: "The current user", ...json(ref("User")) }, 401: unauthorized },
        },
      },
      "/api/auth/change-password": {
        post: {
          tags: ["Auth"],
          summary: "Change your password (signs out your other sessions)",
          ...secured,
          description: "Returns a new token. Every token issued before the change, including the one used for this call, stops working.",
          requestBody: { required: true, ...json(ref("ChangePasswordInput")) },
          responses: {
            200: { description: "Password changed", ...json(ref("AuthResponse")) },
            400: badRequest,
            401: { description: "Current password is incorrect, or the token is missing or invalid", ...json(ref("Error")) },
          },
        },
      },
      "/api/auth/forgot-password": {
        post: {
          tags: ["Auth"],
          summary: "Request a password reset link",
          description: "Always returns 202 with the same message, whether or not the email is registered. At most 3 links per user per hour.",
          requestBody: { required: true, ...json(ref("ForgotPasswordInput")) },
          responses: { 202: { description: "Request accepted", ...json(ref("Message")) }, 400: badRequest },
        },
      },
      "/api/auth/reset-password": {
        post: {
          tags: ["Auth"],
          summary: "Set a new password with a reset token",
          requestBody: { required: true, ...json(ref("ResetPasswordInput")) },
          responses: {
            200: { description: "Password reset; sign in with the new password", ...json(ref("Message")) },
            400: { description: "Invalid input, or the token is invalid, expired or already used", ...json(ref("Error")) },
          },
        },
      },
      "/api/customers": {
        get: {
          tags: ["Customers"],
          summary: "Get your customers (optionally filter by name)",
          ...secured,
          parameters: [
            { name: "name", in: "query", required: false, schema: { type: "string" }, description: "Case-insensitive partial match on name" },
          ],
          responses: { 200: { description: "Your customers", ...json({ type: "array", items: ref("Customer") }) }, 401: unauthorized },
        },
        post: {
          tags: ["Customers"],
          summary: "Create a customer owned by you",
          ...secured,
          requestBody: { required: true, ...json(ref("CustomerInput")) },
          responses: { 201: { description: "Created", ...json(ref("Customer")) }, 400: badRequest, 401: unauthorized, 409: duplicateEmail },
        },
      },
      "/api/customers/{id}": {
        get: {
          tags: ["Customers"],
          summary: "Get one of your customers by id",
          ...secured,
          parameters: [idParam],
          responses: { 200: { description: "The customer", ...json(ref("Customer")) }, 401: unauthorized, 404: notFound },
        },
        put: {
          tags: ["Customers"],
          summary: "Update one of your customers (only provided fields change)",
          ...secured,
          parameters: [idParam],
          requestBody: { required: true, ...json(ref("CustomerUpdate")) },
          responses: { 200: { description: "Updated", ...json(ref("Customer")) }, 400: badRequest, 401: unauthorized, 404: notFound, 409: duplicateEmail },
        },
        delete: {
          tags: ["Customers"],
          summary: "Delete one of your customers",
          ...secured,
          parameters: [idParam],
          responses: { 200: { description: "The deleted customer", ...json(ref("Customer")) }, 401: unauthorized, 404: notFound },
        },
      },
      "/api/agent/chat": {
        post: {
          tags: ["Agent"],
          summary: "Ask a natural-language question about your customers",
          ...secured,
          description:
            "Claude uses tools to list, search, add, update or delete customers. The tools only reach the logged-in user's customers. Pass earlier turns in `history` to continue a conversation.",
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
            401: unauthorized,
          },
        },
      },
      "/api/health": {
        get: { tags: ["Health"], summary: "Health check (also checks the database)", responses: { 200: { description: "OK" } } },
      },
    },
  };
}
