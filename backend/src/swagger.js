const customer = {
  type: "object",
  properties: {
    customer_id: { type: "integer", example: 1 },
    name: { type: "string", example: "Jane Doe" },
    email: { type: "string", nullable: true, example: "jane@example.com" },
    phone: { type: "string", nullable: true, example: "5551234567" },
    created_at: { type: "string", format: "date-time" },
    sales_user_id: { type: "integer", readOnly: true, example: 3, description: "The sales person who owns this customer" },
    open_deals: { type: "integer", readOnly: true, example: 2, description: "Open deals (lead, qualified, proposal). Only in the customers list." },
    open_amount: { type: "string", readOnly: true, example: "240000.00", description: "Total of open deals in rupees. Only in the customers list." },
    total_deals: { type: "integer", readOnly: true, example: 3, description: "All deals, including won and lost. Only in the customers list." },
  },
};

const stageEnum = ["lead", "qualified", "proposal", "won", "lost"];

const deal = {
  type: "object",
  properties: {
    deal_id: { type: "integer", example: 5 },
    customer_id: { type: "integer", example: 12 },
    customer_name: { type: "string", example: "Sunrise Hospital" },
    title: { type: "string", example: "Brochure printing – Q4" },
    amount: { type: "string", example: "150000.00", description: "Indian rupees, two decimals, as a string" },
    stage: { type: "string", enum: stageEnum, example: "lead" },
    expected_close_date: { type: "string", format: "date", nullable: true, example: "2026-11-30" },
    created_at: { type: "string", format: "date-time" },
    updated_at: { type: "string", format: "date-time" },
  },
};

const dealFields = {
  title: { type: "string", maxLength: 200, example: "Brochure printing – Q4" },
  amount: { oneOf: [{ type: "number" }, { type: "string" }], example: 150000, description: "Rupees, at least 0, at most 2 decimals" },
  stage: { type: "string", enum: stageEnum, example: "lead" },
  expected_close_date: { type: "string", format: "date", nullable: true, example: "2026-11-30" },
};

const dealInput = {
  type: "object",
  required: ["customer_id", "title", "amount"],
  properties: { customer_id: { type: "integer", example: 12 }, ...dealFields },
};

const dealUpdate = {
  type: "object",
  description: "Only the fields you send change. customer_id cannot be changed.",
  properties: { ...dealFields, stage: { ...dealFields.stage, example: "qualified" } },
};

const totals = { type: "object", properties: { count: { type: "integer" }, amount: { type: "string", example: "150000.00" } } };

const dealSummary = {
  type: "object",
  properties: {
    by_stage: { type: "object", properties: Object.fromEntries(stageEnum.map((s) => [s, totals])) },
    open: totals,
    won_this_month: { ...totals, description: "Won deals last updated this calendar month, in the tz time zone" },
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

const adminSalesUser = {
  type: "object",
  properties: {
    user_id: { type: "integer", example: 3 },
    name: { type: "string", example: "Sam Seller" },
    email: { type: "string", example: "sam@example.com" },
    created_at: { type: "string", format: "date-time" },
    customer_count: { type: "integer", example: 11, description: "Customers owned by this sales user" },
  },
};

const adminSummary = {
  type: "object",
  properties: {
    sales_users: { type: "integer", example: 3 },
    total_customers: { type: "integer", example: 27 },
  },
};

const adminUsersResponse = {
  type: "object",
  properties: {
    summary: { $ref: "#/components/schemas/AdminSummary" },
    users: { type: "array", items: { $ref: "#/components/schemas/AdminSalesUser" } },
  },
};

const json = (schema) => ({ content: { "application/json": { schema } } });
const ref = (name) => ({ $ref: `#/components/schemas/${name}` });
const idParam = { name: "id", in: "path", required: true, schema: { type: "integer" }, description: "customer_id" };
const notFound = { description: "Customer not found, or owned by another user", ...json(ref("Error")) };
const badRequest = { description: "Invalid input", ...json(ref("Error")) };
const unauthorized = { description: "Missing, invalid or expired token", ...json(ref("Error")) };
const duplicateEmail = { description: "A customer with this email already exists", ...json(ref("Error")) };
const exportCategory = {
  type: "object",
  properties: {
    key: { type: "string", example: "customers" },
    name: { type: "string", example: "Customers", description: "Also the worksheet name" },
    filters: { type: "array", items: { type: "string" }, example: ["q", "from", "to"], description: "Filters this category accepts" },
  },
};

const dealNotFound = { description: "Deal not found, or owned by another user", ...json({ $ref: "#/components/schemas/Error" }) };
const salesOnly = { description: "Admin accounts cannot use this endpoint", ...json(ref("Error")) };
const secured = { security: [{ bearerAuth: [] }] };

export function buildSpec() {
  return {
    openapi: "3.0.3",
    info: {
      title: "Customer API",
      version: "2.4.0",
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
        "",
        "**Admin:** admins sign in on `POST /api/admin/login` (the sales login refuses them). Create the default admin with `npm run seed-admin`, log in, click **Authorize** and call `GET /api/admin/users`. Admin tokens get `403` on the Customers and Agent endpoints, and sales tokens get `403` on the Admin endpoints.",
        "",
        "**Export to Excel:** `GET /api/export/categories` lists what you can export (sales users: `customers` and `deals`; admins: `sales_users`). `GET /api/export?categories=all` downloads an `.xlsx` workbook with one sheet per category; Swagger shows a download link. At most 100,000 rows per export.",
      ].join("\n"),
    },
    servers: [{ url: "/" }],
    tags: [
      { name: "Auth", description: "Register, log in and get the current user" },
      { name: "Customers", description: "CRUD operations on customers" },
      { name: "Agent", description: "Natural-language assistant backed by Claude" },
      { name: "Admin", description: "Admin login and the sales users dashboard" },
      { name: "Deals", description: "Sales opportunities for your customers (sales users only)" },
      { name: "Export", description: "Download data as an Excel workbook, one sheet per category" },
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
        AdminSalesUser: adminSalesUser,
        AdminSummary: adminSummary,
        AdminUsersResponse: adminUsersResponse,
        ExportCategory: exportCategory,
        Deal: deal,
        DealInput: dealInput,
        DealUpdate: dealUpdate,
        DealSummary: dealSummary,
        DealListResponse: { type: "object", properties: { deals: { type: "array", items: ref("Deal") }, summary: ref("DealSummary") } },
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
          summary: "Log in as a sales user and get a token",
          requestBody: { required: true, ...json(ref("LoginInput")) },
          responses: {
            200: { description: "Logged in", ...json(ref("AuthResponse")) },
            400: badRequest,
            401: { description: "Invalid email or password", ...json(ref("Error")) },
            403: { description: "Admin accounts must use POST /api/admin/login", ...json(ref("Error")) },
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
          responses: { 200: { description: "Your customers", ...json({ type: "array", items: ref("Customer") }) }, 401: unauthorized, 403: salesOnly },
        },
        post: {
          tags: ["Customers"],
          summary: "Create a customer owned by you",
          ...secured,
          requestBody: { required: true, ...json(ref("CustomerInput")) },
          responses: { 201: { description: "Created", ...json(ref("Customer")) }, 400: badRequest, 401: unauthorized, 403: salesOnly, 409: duplicateEmail },
        },
      },
      "/api/customers/{id}": {
        get: {
          tags: ["Customers"],
          summary: "Get one of your customers by id",
          ...secured,
          parameters: [idParam],
          responses: { 200: { description: "The customer", ...json(ref("Customer")) }, 401: unauthorized, 403: salesOnly, 404: notFound },
        },
        put: {
          tags: ["Customers"],
          summary: "Update one of your customers (only provided fields change)",
          ...secured,
          parameters: [idParam],
          requestBody: { required: true, ...json(ref("CustomerUpdate")) },
          responses: { 200: { description: "Updated", ...json(ref("Customer")) }, 400: badRequest, 401: unauthorized, 403: salesOnly, 404: notFound, 409: duplicateEmail },
        },
        delete: {
          tags: ["Customers"],
          summary: "Delete one of your customers",
          ...secured,
          parameters: [idParam],
          responses: { 200: { description: "The deleted customer", ...json(ref("Customer")) }, 401: unauthorized, 403: salesOnly, 404: notFound },
        },
      },
      "/api/customers/{id}/deals": {
        get: {
          tags: ["Deals"],
          summary: "Get the deals of one of your customers",
          ...secured,
          parameters: [idParam],
          responses: { 200: { description: "The customer's deals", ...json({ type: "array", items: ref("Deal") }) }, 401: unauthorized, 403: salesOnly, 404: notFound },
        },
      },
      "/api/deals": {
        get: {
          tags: ["Deals"],
          summary: "List your deals with pipeline totals",
          ...secured,
          parameters: [
            { name: "stage", in: "query", schema: { type: "string", enum: ["open", "closed", ...stageEnum] }, description: "A stage, or open / closed" },
            { name: "customer_id", in: "query", schema: { type: "integer" } },
            { name: "q", in: "query", schema: { type: "string" }, description: "Title contains (case-insensitive)" },
            { name: "tz", in: "query", schema: { type: "string" }, example: "Asia/Kolkata", description: "Time zone for 'won this month'; defaults to UTC" },
          ],
          responses: { 200: { description: "Deals sorted by expected close date, and totals", ...json(ref("DealListResponse")) }, 400: badRequest, 401: unauthorized, 403: salesOnly },
        },
        post: {
          tags: ["Deals"],
          summary: "Create a deal for one of your customers",
          ...secured,
          requestBody: { required: true, ...json(ref("DealInput")) },
          responses: {
            201: { description: "Created", ...json(ref("Deal")) },
            400: badRequest,
            401: unauthorized,
            403: salesOnly,
            404: { description: "Customer not found, or owned by another user", ...json(ref("Error")) },
          },
        },
      },
      "/api/deals/{id}": {
        get: {
          tags: ["Deals"],
          summary: "Get one of your deals",
          ...secured,
          parameters: [{ ...idParam, description: "deal_id" }],
          responses: { 200: { description: "The deal", ...json(ref("Deal")) }, 401: unauthorized, 403: salesOnly, 404: dealNotFound },
        },
        put: {
          tags: ["Deals"],
          summary: "Update one of your deals (only provided fields change)",
          ...secured,
          parameters: [{ ...idParam, description: "deal_id" }],
          requestBody: { required: true, ...json(ref("DealUpdate")) },
          responses: { 200: { description: "Updated", ...json(ref("Deal")) }, 400: badRequest, 401: unauthorized, 403: salesOnly, 404: dealNotFound },
        },
        delete: {
          tags: ["Deals"],
          summary: "Delete one of your deals",
          ...secured,
          parameters: [{ ...idParam, description: "deal_id" }],
          responses: { 200: { description: "The deleted deal", ...json(ref("Deal")) }, 401: unauthorized, 403: salesOnly, 404: dealNotFound },
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
            403: salesOnly,
          },
        },
      },
      "/api/admin/login": {
        post: {
          tags: ["Admin"],
          summary: "Log in as an admin and get a token",
          requestBody: { required: true, ...json(ref("LoginInput")) },
          responses: {
            200: { description: "Logged in as admin", ...json(ref("AuthResponse")) },
            400: badRequest,
            401: { description: "Invalid email or password", ...json(ref("Error")) },
            403: { description: "The account is not an admin", ...json(ref("Error")) },
          },
        },
      },
      "/api/admin/users": {
        get: {
          tags: ["Admin"],
          summary: "List sales users with the number of customers each one owns",
          ...secured,
          responses: {
            200: { description: "Sales users and totals", ...json(ref("AdminUsersResponse")) },
            401: unauthorized,
            403: { description: "Only admins can use this endpoint", ...json(ref("Error")) },
          },
        },
      },
      "/api/export/categories": {
        get: {
          tags: ["Export"],
          summary: "List the categories you can export",
          ...secured,
          responses: {
            200: { description: "Categories for your role", ...json({ type: "array", items: ref("ExportCategory") }) },
            401: unauthorized,
          },
        },
      },
      "/api/export": {
        get: {
          tags: ["Export"],
          summary: "Download an Excel workbook (one sheet per category)",
          ...secured,
          description:
            "Exports only data you can view. Dates are written in the time zone given by `tz`. Every export is logged (user, time, categories, filters, row count).",
          parameters: [
            { name: "categories", in: "query", required: true, schema: { type: "string" }, example: "all", description: "Comma-separated category keys, or `all` for every category you can export" },
            { name: "q", in: "query", schema: { type: "string", maxLength: 200 }, description: "Customers only: case-insensitive match on name, email, phone or ID (like the customers screen search)" },
            { name: "from", in: "query", schema: { type: "string", format: "date" }, description: "Created/joined on or after this date (inclusive)" },
            { name: "to", in: "query", schema: { type: "string", format: "date" }, description: "Created/joined on or before this date (inclusive)" },
            { name: "tz", in: "query", schema: { type: "string" }, example: "UTC", description: "IANA time zone for dates and the file name; defaults to UTC" },
          ],
          responses: {
            200: {
              description: "The workbook. The file name is in Content-Disposition, e.g. CustomerHub_All_2026-10-29_1432.xlsx.",
              headers: { "X-Export-Rows": { description: "Total data rows across all sheets", schema: { type: "integer" } } },
              content: { "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": { schema: { type: "string", format: "binary" } } },
            },
            400: badRequest,
            401: unauthorized,
            403: { description: "Your role cannot export one of the requested categories", ...json(ref("Error")) },
            413: { description: "More than 100,000 rows; narrow the filters", ...json(ref("Error")) },
          },
        },
      },
      "/api/health": {
        get: { tags: ["Health"], summary: "Health check (also checks the database)", responses: { 200: { description: "OK" } } },
      },
    },
  };
}
