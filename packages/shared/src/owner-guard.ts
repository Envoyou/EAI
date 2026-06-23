export const isOwnerUser = (userId: string | null | undefined): boolean => {
  if (!userId) return false;
  const ownerIds = (process.env.OWNER_USER_IDS || "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);
  return ownerIds.includes(userId);
};
