import { HttpError } from "@/lib/errors";
import { logError } from "@/lib/logger";
import { errorResponse } from "@/lib/response";

export function handleApiError(error: unknown) {
  if (error instanceof HttpError) {
    return errorResponse(error.status, error.message, error.details);
  }
  const message = error instanceof Error ? error.message : "Unknown error";
  logError("Unhandled API error", { message });
  return errorResponse(500, "Internal server error");
}
