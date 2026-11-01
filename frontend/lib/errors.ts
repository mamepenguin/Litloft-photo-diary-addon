import { ApiError } from "../api";

export function isNotFound(error: unknown): boolean {
  return error instanceof ApiError && error.status === 404;
}
