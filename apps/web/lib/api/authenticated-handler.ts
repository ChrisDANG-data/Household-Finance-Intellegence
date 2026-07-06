import { resolveRequestUserId } from "@/lib/auth/request-user";
import { withApiHandler } from "@/lib/api/route-handler";

export async function withAuthenticatedHandler<T>(
  handler: (userId: string) => Promise<T>,
): Promise<T | ReturnType<typeof withApiHandler>> {
  return withApiHandler(async () => {
    const userId = await resolveRequestUserId();
    return handler(userId);
  });
}
