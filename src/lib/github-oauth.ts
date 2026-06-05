import { clerkClient } from "@clerk/nextjs/server";

export async function getGithubTokenForUser(
  userId: string
): Promise<string | null> {
  const client = await clerkClient();
  const tokens = await client.users.getUserOauthAccessToken(userId, "github");
  return tokens.data[0]?.token ?? null;
}
