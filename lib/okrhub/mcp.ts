// OKR Hub fork (OKR-170): zod shapes for the OKR Hub fields on MCP tools.
import { z } from "zod";
import { BRANDS, LOST_REASONS, SERVICE_LINES, VALUE_TYPES } from "@/lib/okrhub/fields";

export const okrhubOpportunityMcpShape = {
  brand: z
    .enum(BRANDS)
    .nullable()
    .optional()
    .describe("Business line: 'Mikehorw Consulting' or 'The OKR Hub'. null clears it."),
  service_lines: z
    .array(z.enum(SERVICE_LINES))
    .optional()
    .describe("One or more service lines. Replaces the existing list."),
  value_types: z
    .array(z.enum(VALUE_TYPES))
    .optional()
    .describe("One or more commercial models. Replaces the existing list."),
  lost_reason: z
    .enum(LOST_REASONS)
    .nullable()
    .optional()
    .describe("Why the deal was lost. null clears it."),
};

export const okrhubAccountMcpShape = {
  tags: z
    .array(z.string().min(1))
    .optional()
    .describe("Account tags, e.g. 'The OKR Hub', 'Mikehorw Consulting', 'Partner Business'. Replaces the existing list."),
};
