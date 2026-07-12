/** Add _id alias to a Drizzle row for frontend backward compatibility */
export function mi<T extends { id: string }>(row: T): T & { _id: string } {
  return { ...row, _id: row.id };
}
export function miArr<T extends { id: string }>(rows: T[]): Array<T & { _id: string }> {
  return rows.map(mi);
}
