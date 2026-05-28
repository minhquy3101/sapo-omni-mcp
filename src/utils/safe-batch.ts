export async function safeBatch<T>(
  promises: Promise<T>[],
): Promise<PromiseSettledResult<T>[]> {
  return Promise.allSettled(promises);
}
