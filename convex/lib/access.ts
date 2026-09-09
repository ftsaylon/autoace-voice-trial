export const ownedOrNull = <T extends { userId: string }>(
  userId: string,
  doc: T | null,
): T | null => {
  if (!doc || doc.userId !== userId) {
    return null
  }
  return doc
}
